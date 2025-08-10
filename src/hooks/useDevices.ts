
import { useState, useEffect, useCallback } from 'react';
import { Device, DeviceStats } from '@/types';
import { deviceAPI } from '@/services/api';
import { useSecurityNotifications } from './useSecurityNotifications';
import socketService from '@/services/socketService';

export const useDevices = () => {
  const { addAlert } = useSecurityNotifications();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<number>(0);
  // configurable stale time (ms)
  const STALE_MS = 15_000; // 15s cache window
  const [error, setError] = useState<string | null>(null);
  // Queue for toggle intents when device offline
  const [toggleQueue, setToggleQueue] = useState<Array<{ deviceId: string; switchId: string; desiredState?: boolean; timestamp: number }>>([]);

  const handleDeviceStateChanged = useCallback((data: { deviceId: string; state: Device }) => {
    setDevices(prev => prev.map(device => 
      device.id === data.deviceId ? { ...device, ...data.state } : device
    ));
  }, []);

  const handleDevicePirTriggered = useCallback((data: { deviceId: string; triggered: boolean }) => {
    setDevices(prev => prev.map(device => {
      if (device.id === data.deviceId && device.pirSensor) {
        return {
          ...device,
          pirSensor: {
            ...device.pirSensor,
            triggered: data.triggered
          }
        };
      }
      return device;
    }));

    if (data.triggered) {
      const device = devices.find(d => d.id === data.deviceId);
      if (device) {
        addAlert({
          deviceId: data.deviceId,
          deviceName: device.name,
          location: device.location || 'Unknown',
          type: 'pir_triggered',
          message: `Motion detected on device ${device.name}`
        });
      }
    }
  }, [devices, addAlert]);

  useEffect(() => {
    loadDevices();

    // Set up socket listeners
    socketService.onDeviceStateChanged(handleDeviceStateChanged);
    socketService.onDevicePirTriggered(handleDevicePirTriggered);
    // When a device reconnects, flush queued toggles for it
    const handleConnected = (data: { deviceId: string }) => {
      setToggleQueue(prev => prev); // trigger state reference
      const toProcess = toggleQueue.filter(t => t.deviceId === data.deviceId);
      if (toProcess.length) {
        // Process sequentially to maintain order
        (async () => {
          for (const intent of toProcess) {
            try {
              await toggleSwitch(intent.deviceId, intent.switchId);
            } catch (e) {
              console.warn('Failed to flush queued toggle', intent, e);
            }
          }
          // Remove processed intents
          setToggleQueue(prev => prev.filter(t => t.deviceId !== data.deviceId));
        })();
      }
    };
    socketService.onDeviceConnected(handleConnected);
    const handleToggleBlocked = (payload: any) => {
      // Could surface toast/alert here if needed
      console.info('Toggle blocked (server):', payload);
    };
    (socketService as any).onDeviceToggleBlocked?.(handleToggleBlocked);

    return () => {
      // Clean up socket listeners
      socketService.off('device_state_changed', handleDeviceStateChanged);
      socketService.off('device_pir_triggered', handleDevicePirTriggered);
      socketService.off('device_connected', handleConnected);
      socketService.off('device_toggle_blocked', handleToggleBlocked);
    };
  }, [handleDeviceStateChanged, handleDevicePirTriggered]);

  interface LoadOptions { background?: boolean; force?: boolean }
  const loadDevices = async (options: LoadOptions = {}) => {
    const { background, force } = options;
    // Skip if fresh and not forced
    if (!force && Date.now() - lastLoaded < STALE_MS) return;
    try {
      if (!background) setLoading(true);
      const response = await deviceAPI.getAllDevices();
      const raw = response.data.data || [];
      // Map backend switch gpio -> relayGpio for UI consistency
      const mapped = raw.map((d: any) => ({
        ...d,
        switches: Array.isArray(d.switches) ? d.switches.map((sw: any) => ({
          ...sw,
          id: sw.id || sw._id?.toString(),
          relayGpio: sw.relayGpio ?? sw.gpio
        })) : []
      }));
      setDevices(mapped);
      setLastLoaded(Date.now());
    } catch (err: any) {
      setError(err.message || 'Failed to load devices');
      console.error('Error loading devices:', err);
    } finally {
      if (!background) setLoading(false);
    }
  };

  const toggleSwitch = async (deviceId: string, switchId: string) => {
    // Prevent toggling if device currently marked offline
    const target = devices.find(d => d.id === deviceId);
    if (target && target.status !== 'online') {
      console.warn(`Queued toggle: device ${deviceId} is offline`);
      // Add to queue (avoid duplicates for same switch keeping latest desiredState)
      setToggleQueue(prev => {
        const others = prev.filter(t => !(t.deviceId === deviceId && t.switchId === switchId));
        return [...others, { deviceId, switchId, desiredState: undefined, timestamp: Date.now() }];
      });
      throw new Error('Device is offline. Toggle queued.');
    }
    try {
      const response = await deviceAPI.toggleSwitch(deviceId, switchId);
      
      // Update local state
      setDevices(prevDevices =>
        prevDevices.map(device =>
          device.id === deviceId ? response.data.data : device
        )
      );
      
      console.log(`Switch ${switchId} toggled on device ${deviceId}`);
    } catch (err: any) {
      console.error('Error toggling switch:', err);
      throw err;
    }
  };

  const toggleAllSwitches = async (state: boolean) => {
    try {
      // Optimistic update
      setDevices(prev => prev.map(d => ({
        ...d,
        switches: d.switches.map(sw => ({ ...sw, state }))
      })));
      // Prefer bulk endpoint if available
      try {
        await deviceAPI.bulkToggle(state);
        // Refresh devices after bulk change
        await loadDevices();
      } catch (bulkErr: any) {
        if (bulkErr?.response?.status === 404) {
          // Fallback to per-switch toggles
          const togglePromises = devices.flatMap(device =>
            device.switches.map(sw => toggleSwitch(device.id, sw.id))
          );
          await Promise.all(togglePromises);
        } else {
          // Revert optimistic if error
          await loadDevices();
          throw bulkErr;
        }
      }
      console.log(`All switches turned ${state ? 'on' : 'off'} (bulk)`);
    } catch (err: any) {
      console.error('Error toggling all switches:', err);
      throw err;
    }
  };

  const toggleDeviceAllSwitches = async (deviceId: string, state: boolean) => {
    const target = devices.find(d => d.id === deviceId);
    if (!target) return;
    // Optimistic
    setDevices(prev => prev.map(d => d.id === deviceId ? ({
      ...d,
      switches: d.switches.map(sw => ({ ...sw, state }))
    }) : d));
    try {
      // Fallback simple sequential toggles (small number)
      await Promise.all(target.switches.map(sw => deviceAPI.toggleSwitch(deviceId, sw.id, state)));
      await loadDevices();
    } catch (e) {
      await loadDevices();
      throw e;
    }
  };

  const bulkToggleType = async (type: string, state: boolean) => {
    // Optimistic
    setDevices(prev => prev.map(d => ({
      ...d,
      switches: d.switches.map(sw => sw.type === type ? { ...sw, state } : sw)
    })));
    try {
      await (deviceAPI as any).bulkToggleByType(type, state);
      await loadDevices();
    } catch (e) {
      await loadDevices();
      throw e;
    }
  };

  const addDevice = async (deviceData: Partial<Device>) => {
    try {
      console.log('Sending device data:', deviceData);
      // Map frontend switch structure to backend expectations
      const mapped: any = { ...deviceData };
      if (deviceData.switches) {
        mapped.switches = deviceData.switches.map(sw => ({
          name: sw.name,
          gpio: (sw as any).relayGpio ?? (sw as any).gpio ?? 0,
          type: sw.type || 'relay'
        }));
      }
  // Sanitize numeric fields to avoid NaN
  if (mapped.pirGpio !== undefined && isNaN(mapped.pirGpio)) delete mapped.pirGpio;
  if (mapped.pirAutoOffDelay !== undefined && isNaN(mapped.pirAutoOffDelay)) delete mapped.pirAutoOffDelay;
      const response = await deviceAPI.createDevice(mapped);
      
      if (!response.data) {
        throw new Error('No data received from server');
      }

      const newDeviceRaw = response.data.data || response.data;
      const newDevice = {
        ...newDeviceRaw,
        switches: Array.isArray(newDeviceRaw.switches) ? newDeviceRaw.switches.map((sw: any) => ({
          ...sw,
          id: sw.id || sw._id?.toString(),
          relayGpio: sw.relayGpio ?? sw.gpio
        })) : []
      };
      console.log('Device added:', newDevice);
      
      setDevices(prev => [...prev, newDevice]);
      return newDevice;
    } catch (err: any) {
      console.error('Error adding device:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to add device';
      throw new Error(errorMessage);
    }
  };

  const updateDevice = async (deviceId: string, updates: Partial<Device>) => {
    try {
      // Map outgoing switches if present
      const outbound: any = { ...updates };
      if (updates.switches) {
        outbound.switches = updates.switches.map(sw => ({
          ...sw,
            gpio: (sw as any).relayGpio ?? (sw as any).gpio
        }));
      }
      const response = await deviceAPI.updateDevice(deviceId, outbound);
      setDevices(prev =>
        prev.map(device =>
          device.id === deviceId ? {
            ...response.data.data,
            switches: response.data.data.switches.map((sw: any) => ({
              ...sw,
              id: sw.id || sw._id?.toString(),
              relayGpio: sw.relayGpio ?? sw.gpio
            }))
          } : device
        )
      );
      console.log(`Device ${deviceId} updated`);
    } catch (err: any) {
      console.error('Error updating device:', err);
      throw err;
    }
  };

  const deleteDevice = async (deviceId: string) => {
    try {
      await deviceAPI.deleteDevice(deviceId);
      setDevices(prev => prev.filter(device => device.id !== deviceId));
      console.log(`Device ${deviceId} deleted`);
    } catch (err: any) {
      console.error('Error deleting device:', err);
      throw err;
    }
  };

  const getStats = async (): Promise<DeviceStats> => {
    try {
      const response = await deviceAPI.getStats();
      return response.data.data;
    } catch (err: any) {
      console.error('Error getting stats:', err);
      return {
        totalDevices: devices.length,
        onlineDevices: devices.filter(d => d.status === 'online').length,
        totalSwitches: devices.reduce((sum, d) => sum + d.switches.length, 0),
        activeSwitches: devices.reduce(
          (sum, d) => sum + d.switches.filter(s => s.state).length, 
          0
        ),
        totalPirSensors: devices.filter(d => d.pirEnabled).length,
        activePirSensors: devices.filter(d => d.pirSensor?.triggered).length
      };
    }
  };

  return {
    devices,
    loading,
    error,
    toggleSwitch,
    toggleAllSwitches,
    addDevice,
    updateDevice,
    deleteDevice,
    getStats,
    refreshDevices: loadDevices,
    toggleDeviceAllSwitches,
    bulkToggleType,
    lastLoaded,
    isStale: Date.now() - lastLoaded > STALE_MS
  };
};
