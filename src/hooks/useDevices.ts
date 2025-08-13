import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { Device, DeviceStats } from '@/types';
import { deviceAPI } from '@/services/api';
import { useSecurityNotifications } from './useSecurityNotifications';
import socketService from '@/services/socketService';

// Internal hook (not exported directly) so we can provide a context-backed singleton
const useDevicesInternal = () => {
  const { addAlert } = useSecurityNotifications();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<number>(0);
  // configurable stale time (ms)
  const STALE_MS = 15_000; // 15s cache window
  const [error, setError] = useState<string | null>(null);
  // Queue for toggle intents when device offline
  const [toggleQueue, setToggleQueue] = useState<Array<{ deviceId: string; switchId: string; desiredState?: boolean; timestamp: number }>>([]);
  const [bulkPending, setBulkPending] = useState<{ desiredState: boolean; startedAt: number; deviceIds: Set<string> } | null>(null);

  const handleDeviceStateChanged = useCallback((data: { deviceId: string; state: Device; ts?: number; seq?: number; source?: string }) => {
    const eventTs = data.ts || Date.now();
    setDevices(prev => prev.map(device => {
      if (device.id !== data.deviceId) return device;
      const lastTs = (device as any)._lastEventTs || 0;
      const lastSeq = (device as any)._lastSeq || 0;
      if (data.seq && data.seq < lastSeq) {
        if (process.env.NODE_ENV !== 'production') console.debug('[seq] drop stale event', { deviceId: device.id, incoming: data.seq, lastSeq });
        return device; // stale by seq
      }
      if (eventTs < lastTs) return device; // stale by timestamp ordering
      // Ignore stale events that pre-date last bulk snapshot applied
      const incomingUpdatedAt = (data.state as any).updatedAt ? new Date((data.state as any).updatedAt).getTime() : Date.now();
      if ((device as any)._lastBulkTs && incomingUpdatedAt < (device as any)._lastBulkTs) {
        // stale relative to last bulk consolidation; skip
        return device;
      }
      // Normalize incoming state switches to ensure id & relayGpio fields persist
      const normalizedSwitches = Array.isArray((data.state as any).switches)
        ? (data.state as any).switches.map((sw: any) => ({
            ...sw,
            id: sw.id || sw._id?.toString(),
            relayGpio: sw.relayGpio ?? sw.gpio
          }))
        : [];
  // Do not override server confirmations during bulk; trust normalizedSwitches
      if (process.env.NODE_ENV !== 'production') {
        const diff = normalizedSwitches.filter((sw: any) => {
          const existing = device.switches.find(esw => esw.id === sw.id);
          return existing && existing.state !== sw.state;
        }).map(sw => ({ name: sw.name, id: sw.id, new: sw.state }));
        if (diff.length) {
          console.debug('[device_state_changed apply]', { deviceId: device.id, seq: data.seq, source: data.source, changed: diff });
        }
      }
      return { ...device, ...data.state, switches: normalizedSwitches, _lastEventTs: eventTs, _lastSeq: data.seq || lastSeq } as any;
    }));
  }, [bulkPending]);

  // Handle optimistic intent indicator without flipping state
  const handleSwitchIntent = useCallback((payload: any) => {
    if (!payload || !payload.deviceId || !payload.switchId) return;
    // Mark a transient pending flag on the target switch for subtle UI hints if needed
    setDevices(prev => prev.map(d => {
      if (d.id !== payload.deviceId) return d;
      const updated = d.switches.map(sw => sw.id === payload.switchId ? ({ ...sw, /* @ts-ignore */ _pending: true }) as any : sw);
      return { ...d, switches: updated } as any;
    }));
    // Clear pending after a short window; actual confirmation will arrive via switch_result/state_update
    setTimeout(() => {
      setDevices(prev => prev.map(d => {
        if (d.id !== payload.deviceId) return d;
        const updated = d.switches.map(sw => {
          const anySw: any = sw;
          if (anySw._pending) {
            const { _pending, ...rest } = anySw;
            return rest as any;
          }
          return sw;
        });
        return { ...d, switches: updated } as any;
      }));
    }, 1200);
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

  interface LoadOptions { background?: boolean; force?: boolean }
  // Backoff tracking to prevent hammering API on repeated failures (e.g., 401 before login)
  const failureBackoffRef = useRef<number>(0);
  async function loadDevices(options: LoadOptions = {}) {
    const { background, force } = options;
    if (!force && Date.now() - lastLoaded < STALE_MS) return;
    // Respect backoff window after failures
    if (Date.now() < failureBackoffRef.current) return;
    // Skip fetching if no auth token yet (pre-login) to avoid 401 storm
    const tokenPresent = !!localStorage.getItem('auth_token');
    if (!tokenPresent) {
      // Mark as "loaded" for the stale window to avoid tight loop; will be forced post-login
      setLastLoaded(Date.now());
      return;
    }
    try {
      if (!background) setLoading(true);
      const response = await deviceAPI.getAllDevices();
      const raw = response.data.data || [];
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
      // Reset backoff on success
      failureBackoffRef.current = 0;
    } catch (err: any) {
      setError(err.message || 'Failed to load devices');
      console.error('Error loading devices:', err);
      // Exponential-ish backoff progression (3s, 6s, max 15s)
      const now = Date.now();
      if (failureBackoffRef.current < now) {
        const prevDelay = (failureBackoffRef.current && failureBackoffRef.current > 0) ? (failureBackoffRef.current - now) : 0;
        const nextDelay = prevDelay ? Math.min(prevDelay * 2, 15000) : 3000;
        failureBackoffRef.current = now + nextDelay;
      }
      // Still update lastLoaded so stale logic suppresses immediate re-fire
      setLastLoaded(Date.now());
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
  loadDevices({ force: true });

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
      // Ignore stale_seq failures (idempotent drops) to avoid noisy UI
      if (payload?.reason === 'stale_seq') return;
      console.warn('device_toggle_blocked', payload);
      setDevices(prev => prev.map(d => {
        if (d.id !== payload.deviceId) return d;
        if (!payload.switchGpio || payload.actualState === undefined) return d;
        const updated = d.switches.map(sw => (((sw as any).relayGpio ?? (sw as any).gpio) === payload.switchGpio) ? { ...sw, state: payload.actualState } : sw);
        return { ...d, switches: updated };
      }));
      // Light reconciliation: if actualState missing or still inconsistent after small delay, reload that device
      if (payload.actualState === undefined) {
        setTimeout(()=> loadDevices({ force:true, background:true }), 400);
      }
    };
    socketService.on('device_toggle_blocked', handleToggleBlocked);
    const handleBulkSync = (payload: any) => {
      if (!payload || !Array.isArray(payload.devices)) return;
      setDevices(prev => prev.map(d => {
        const snap = payload.devices.find((x: any) => x.deviceId === d.id);
        if (!snap) return d;
        const updatedSwitches = d.switches.map(sw => {
          const swSnap = snap.switches.find((s: any) => (s.id || s._id) === sw.id || (s.id || s._id) === (sw as any)._id);
          return swSnap ? { ...sw, state: swSnap.state } : sw;
        });
        return { ...d, switches: updatedSwitches, _lastBulkTs: payload.ts } as any;
      }));
      setBulkPending(null);
    };
    socketService.on('bulk_state_sync', handleBulkSync);
    socketService.on('switch_intent', handleSwitchIntent);
    // Handle bulk intent: mark pending on affected devices without flipping state
    const handleBulkIntent = (payload: any) => {
      if (!payload || !Array.isArray(payload.deviceIds)) return;
      const desired = !!payload.desiredState;
      const ids = new Set<string>(payload.deviceIds as string[]);
      setBulkPending({ desiredState: desired, startedAt: Date.now(), deviceIds: ids });
      setDevices(prev => prev.map(d => {
        if (!ids.has(d.id)) return d;
        const updated = d.switches.map(sw => ({ ...sw, /* @ts-ignore */ _pending: true } as any));
        return { ...d, switches: updated } as any;
      }));
      setTimeout(() => {
        setDevices(prev => prev.map(d => {
          if (!ids.has(d.id)) return d;
          const updated = d.switches.map(sw => { const anySw: any = sw; delete anySw._pending; return anySw; });
          return { ...d, switches: updated } as any;
        }));
      }, 1500);
    };
    socketService.on('bulk_switch_intent', handleBulkIntent);
    // New: handle config_update to reflect switch additions/removals immediately
    const handleConfigUpdate = (cfg: any) => {
      if (!cfg || !cfg.deviceId) return;
      setDevices(prev => prev.map(d => {
        if (d.id !== cfg.deviceId) return d;
        // Build new switch list from cfg.switches preserving known local states when possible
        const incoming = Array.isArray(cfg.switches) ? cfg.switches : [];
        const mapped = incoming.map((sw: any) => {
          const existing = d.switches.find(esw => esw.id === (sw.id || sw._id) || esw.name === sw.name);
            return {
              ...(existing || {}),
              ...sw,
              id: sw.id || sw._id?.toString(),
              relayGpio: sw.relayGpio ?? sw.gpio,
              state: sw.state // backend authoritative here
            };
        });
        return { ...d, switches: mapped };
      }));
    };
    socketService.on('config_update', handleConfigUpdate);
    const handleSwitchResult = (payload: any) => {
      if (!payload || !payload.deviceId || payload.gpio === undefined) return;
      // If firmware reports stale_seq, it's an idempotent drop; still apply actualState if present
      setDevices(prev => prev.map(d => {
        if (d.id !== payload.deviceId) return d;
        const updated = d.switches.map(sw => {
          const gpio = (sw as any).relayGpio ?? (sw as any).gpio;
          if (gpio === payload.gpio) {
            if (payload.actualState !== undefined) {
              return { ...sw, state: payload.actualState };
            }
          }
          return sw;
        });
        return { ...d, switches: updated };
      }));
    };
    socketService.on('switch_result', handleSwitchResult);
    const handleIdentifyError = (payload: any) => {
      console.warn('[identify_error]', payload);
      // Force refresh so UI shows device as offline/unregistered accurately
      loadDevices({ force: true, background: true });
    };
    socketService.on('identify_error', handleIdentifyError);

    return () => {
      // Clean up socket listeners
      socketService.off('device_state_changed', handleDeviceStateChanged);
      socketService.off('device_pir_triggered', handleDevicePirTriggered);
      socketService.off('device_connected', handleConnected);
      socketService.off('device_toggle_blocked', handleToggleBlocked);
  socketService.off('bulk_state_sync', handleBulkSync);
  socketService.off('switch_intent', handleSwitchIntent);
  socketService.off('bulk_switch_intent', handleBulkIntent);
      socketService.off('config_update', handleConfigUpdate);
      socketService.off('switch_result', handleSwitchResult);
  socketService.off('identify_error', handleIdentifyError);
    };
  }, [handleDeviceStateChanged, handleDevicePirTriggered]);

  // Periodic fallback refresh if socket disconnected or stale
  useEffect(() => {
    const interval = setInterval(() => {
      if (!socketService.isConnected() || Date.now() - lastLoaded > STALE_MS) {
        loadDevices({ background: true, force: true });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [lastLoaded]);

  // (loadDevices function hoisted above)

  const toggleCooldownMs = 250;
  const toggleTimestamps: Record<string, number> = {};
  const toggleSwitch = async (deviceId: string, switchId: string) => {
    const key = deviceId + ':' + switchId;
    const now = Date.now();
    if (toggleTimestamps[key] && now - toggleTimestamps[key] < toggleCooldownMs) {
      if (process.env.NODE_ENV !== 'production') console.debug('[toggle] ignored rapid repeat', { deviceId, switchId });
      return;
    }
    toggleTimestamps[key] = now;
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
      // Mark pending locally for subtle UI hint, do not flip state
      setDevices(prev => prev.map(d => {
        if (d.id !== deviceId) return d;
        const updated = d.switches.map(sw => sw.id === switchId ? ({ ...sw, /* @ts-ignore */ _pending: true }) as any : sw);
        return { ...d, switches: updated } as any;
      }));
      await deviceAPI.toggleSwitch(deviceId, switchId);
      // Reconciliation: fetch in background in case events are delayed
      setTimeout(() => { loadDevices({ background: true, force: true }); }, 1500);
      console.log(`Switch ${switchId} toggle requested on device ${deviceId}`);
    } catch (err: any) {
      console.error('Error toggling switch:', err);
      throw err;
    }
  };

  const toggleAllSwitches = async (state: boolean) => {
    try {
      // Mark as pending without flipping state
      setBulkPending({ desiredState: state, startedAt: Date.now(), deviceIds: new Set(devices.filter(d=>d.status==='online').map(d=>d.id)) });
      // Prefer bulk endpoint if available
      try {
        // Only attempt bulk toggle if at least one online device
        const anyOnline = devices.some(d => d.status === 'online');
        if (anyOnline) {
          await deviceAPI.bulkToggle(state);
        }
        // Let confirmations drive UI; do a safety refresh shortly after
        setTimeout(() => { loadDevices({ background: true, force: true }); }, 1800);
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
    } finally {
      setTimeout(()=> {
        setBulkPending(prev => {
          if (prev) {
            // After window, reconcile if any device still inconsistent
            const desired = prev.desiredState;
            const inconsistent = devices.some(d => prev.deviceIds.has(d.id) && d.switches.some(sw => sw.state !== desired));
            if (inconsistent) {
              loadDevices({ background: true, force: true });
            }
          }
          return null;
        });
      }, 4500);
    }
  };

  const toggleDeviceAllSwitches = async (deviceId: string, state: boolean) => {
    const target = devices.find(d => d.id === deviceId);
    if (!target) return;
    // Optimistic only if online
    setDevices(prev => prev.map(d => d.id === deviceId ? ({
      ...d,
      switches: d.status === 'online' ? d.switches.map(sw => ({ ...sw, state })) : d.switches
    }) : d));
    try {
      // Fallback simple sequential toggles (small number)
      if (target.status === 'online') {
        await Promise.all(target.switches.map(sw => deviceAPI.toggleSwitch(deviceId, sw.id, state)));
      }
      await loadDevices();
    } catch (e) {
      await loadDevices();
      throw e;
    }
  };

  const bulkToggleType = async (type: string, state: boolean) => {
    // Optimistic: affect only online devices; do not mutate offline device states
    setDevices(prev => prev.map(d => ({
      ...d,
      switches: d.status === 'online'
        ? d.switches.map(sw => sw.type === type ? { ...sw, state } : sw)
        : d.switches
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
        activeSwitches: devices.filter(d => d.status === 'online').reduce(
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
  isStale: Date.now() - lastLoaded > STALE_MS,
  bulkPending
  };
};

// Context so state survives route changes (menu navigation)
const DevicesContext = createContext<ReturnType<typeof useDevicesInternal> | null>(null);

export const DevicesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useDevicesInternal();
  return React.createElement(DevicesContext.Provider, { value }, children);
};

// Public hook: use context if available, else fall back to standalone (for backward compatibility)
export const useDevices = () => {
  const ctx = useContext(DevicesContext);
  return ctx || useDevicesInternal();
};
