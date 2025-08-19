
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';

const Switches = () => {
  const { devices, toggleSwitch, toggleAllSwitches, toggleDeviceAllSwitches } = useDevices();
  const { toast } = useToast();

  // UI State
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('switches_collapsed');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  // Responsive grid layout

  // Persist collapsed state
  useEffect(() => {
    try { localStorage.setItem('switches_collapsed', JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    devices.forEach(d => { if (d.location) set.add(d.location); });
    return Array.from(set).sort();
  }, [devices]);

  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      const matchSearch = search.trim().length === 0 || (
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.location || '').toLowerCase().includes(search.toLowerCase()) ||
        (d.classroom || '').toLowerCase().includes(search.toLowerCase())
      );
      const matchLocation = locationFilter === 'all' || (d.location || '') === locationFilter;
      return matchSearch && matchLocation;
    });
  }, [devices, search, locationFilter]);

  // ...existing code...

  // Removed analytics: totalSwitches and activeSwitches

  const handleToggle = async (deviceId: string, switchId: string) => {
    try {
      await toggleSwitch(deviceId, switchId);
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle switch', variant: 'destructive' });
    }
  };

  // Removed master toggle functionality for simplified UI

  const handleDeviceBulk = async (deviceId: string, toState: boolean) => {
    try {
      await toggleDeviceAllSwitches(deviceId, toState);
    } catch {
      toast({ title: 'Error', description: 'Device bulk toggle failed', variant: 'destructive' });
    }
  };

  const getStatusVariant = (device: any) => {
    const now = Date.now();
    const lastEventTs = device._lastEventTs || 0;
    const isStale = now - lastEventTs > 45000; // 45s threshold

    if (device.status === 'offline') {
      return 'secondary'; // Gray for offline
    }
    if (device.status === 'online' && isStale) {
      return 'warning'; // Yellow warning badge for stale connections
    }
    return 'default'; // Green for online and recent
  };

  const getStatusText = (device: any) => {
    const now = Date.now();
    const lastEventTs = device._lastEventTs || 0;
    const isStale = now - lastEventTs > 45000; // 45s threshold

    if (device.status === 'offline') {
      return 'Offline';
    }
    if (device.status === 'online' && isStale) {
      return 'Stale';
    }
    return 'Online';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground mb-2">Device Switches</h1>
      <div className="flex items-center gap-4 mb-4">
        <input
          className="border rounded-md px-2 py-1 text-sm w-48 bg-background"
          placeholder="Search devices..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className="px-3 py-1 rounded-md border bg-primary text-primary-foreground text-sm hover:bg-primary/80"
          onClick={() => setSearch(search)}
        >Search</button>
        <button
          className="px-3 py-1 rounded-md border bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
          disabled={devices.some(d => d.status !== 'online')}
          onClick={() => {
            if (devices.some(d => d.status !== 'online')) return;
            const allOn = devices.every(d => d.switches.every(sw => sw.state));
            toggleAllSwitches(!allOn);
            toast({ title: allOn ? 'All Off' : 'All On', description: `All switches turned ${allOn ? 'off' : 'on'}` });
          }}
        >Master Switch: All {devices.every(d => d.switches.every(sw => sw.state)) ? 'Off' : 'On'}</button>
      </div>
      {filteredDevices.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg font-medium mb-2">No matching devices</p>
          <p className="text-muted-foreground">Adjust filters or add a device</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDevices.map(device => {
            const onCount = device.switches.filter(sw => sw.state).length;
            return (
              <Card key={device.id} className="border shadow-sm flex flex-col">
                <CardHeader className="pb-3 px-4 py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="truncate" title={device.name}>{device.name}</span>
                    <Badge variant={getStatusVariant(device)} className="capitalize">
                      {getStatusText(device)}
                    </Badge>
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate mt-1">
                    {device.location || 'Unknown'}{device.classroom ? ` • ${device.classroom}` : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{onCount}/{device.switches.length} on</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="px-2 py-1 rounded bg-green-600 text-white text-xs border border-green-700 disabled:opacity-50"
                      disabled={device.status !== 'online'}
                      onClick={() => handleDeviceBulk(device.id, true)}
                    >Turn On All</button>
                    <button
                      className="px-2 py-1 rounded bg-red-600 text-white text-xs border border-red-700 disabled:opacity-50"
                      disabled={device.status !== 'online'}
                      onClick={() => handleDeviceBulk(device.id, false)}
                    >Turn Off All</button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3 px-4 flex-1">
                  <div className="space-y-2 max-h-64 overflow-auto pr-1">
                    {device.switches.map(sw => (
                      <div key={sw.id} className="p-2 rounded border bg-muted/30 flex flex-col gap-1 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate" title={sw.name}>{sw.name}</span>
                          <Switch
                            checked={!!sw.state}
                            disabled={device.status !== 'online'}
                            onCheckedChange={() => handleToggle(device.id, sw.id)}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-muted-foreground">
                          <span>GPIO {(sw as any).relayGpio ?? (sw as any).gpio}</span>
                          <span className="uppercase">{sw.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Switches;
