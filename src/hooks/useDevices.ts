import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { Device, DeviceStats } from '@/types';
import { deviceAPI } from '@/services/api';
import { useSecurityNotifications } from './useSecurityNotifications';
import { onStateUpdate, sendSwitchCommand } from '@/services/wsService';

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
    console.log('[WS] Incoming state_update:', JSON.stringify(data));
    setDevices(prev => prev.map(device => {
      if (device.id !== data.deviceId) {
        console.log(`[WS] Device ID mismatch: incoming=${data.deviceId}, local=${device.id}`);
        return device;
      }
      const lastTs = (device as any)._lastEventTs || 0;
      const lastSeq = (device as any)._lastSeq || 0;
      if (data.seq && data.seq < lastSeq) {
        console.debug('[seq] drop stale event', { deviceId: device.id, incoming: data.seq, lastSeq });
        return device; // stale by seq
      }
      if (eventTs < lastTs) return device; // stale by timestamp ordering
      const incomingUpdatedAt = (data.state as any).updatedAt ? new Date((data.state as any).updatedAt).getTime() : Date.now();
      if ((device as any)._lastBulkTs && incomingUpdatedAt < (device as any)._lastBulkTs) {
        return device;
      }
      const normalizedSwitches = Array.isArray((data.state as any).switches)
        ? (data.state as any).switches.map((sw: any) => {
            const matchId = sw.id || sw._id?.toString();
            const matchGpio = sw.relayGpio ?? sw.gpio;
            const localSw = device.switches.find(esw => esw.id === matchId || esw.relayGpio === matchGpio || esw.gpio === matchGpio);
            if (!localSw) {
              console.log(`[WS] Switch mapping failed: incoming switch name=${sw.name}, gpio=${matchGpio}`);
            }
            return {
              ...sw,
              id: matchId,
              relayGpio: matchGpio
            };
          })
        : [];
      const diff = normalizedSwitches.filter((sw: any) => {
        const existing = device.switches.find(esw => esw.id === sw.id);
        return existing && existing.state !== sw.state;
      }).map(sw => ({ name: sw.name, id: sw.id, new: sw.state }));
      if (diff.length) {
        console.log('[device_state_changed apply]', { deviceId: device.id, seq: data.seq, source: data.source, changed: diff });
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
    // Set up WebSocket listeners for real-time device state sync
    onStateUpdate(handleDeviceStateChanged);
    // No cleanup needed for wsService.js
    return () => {};
  }, [handleDeviceStateChanged, handleDevicePirTriggered]);

  // Periodic fallback refresh if socket disconnected or stale
  useEffect(() => {
    // Removed socketService reconnect logic; wsService.js does not expose connection management
  }, [lastLoaded]);

  // (loadDevices function hoisted above)

  const toggleCooldownMs = 400;
  const toggleTimestamps: Record<string, number> = {};
  const inFlightTogglesRef = useRef<Set<string>>(new Set());
  const toggleSwitch = async (deviceId: string, switchId: string) => {
    const key = deviceId + ':' + switchId;
    const now = Date.now();
    // Drop if a toggle for this switch is already in-flight
    if (inFlightTogglesRef.current.has(key)) {
      if (process.env.NODE_ENV !== 'production') console.debug('[toggle] ignored in-flight duplicate', { deviceId, switchId });
      return;
    }
    if (toggleTimestamps[key] && now - toggleTimestamps[key] < toggleCooldownMs) {
      if (process.env.NODE_ENV !== 'production') console.debug('[toggle] ignored rapid repeat', { deviceId, switchId });
      return;
    }
    toggleTimestamps[key] = now;
    inFlightTogglesRef.current.add(key);
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
    finally {
      // Release in-flight after a brief window to coalesce accidental double taps
      setTimeout(() => { inFlightTogglesRef.current.delete(key); }, 500);
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

  return { devices, loading, error, loadDevices, toggleSwitch, toggleAllSwitches, bulkPending };
};

// Context + Provider components

const DevicesContext = createContext<ReturnType<typeof useDevicesInternal> | null>(null);

export const DevicesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useDevicesInternal();
  return React.createElement(DevicesContext.Provider, { value }, children);
}

export const useDevices = () => {
  const ctx = useContext(DevicesContext);
  return ctx || useDevicesInternal();
};
