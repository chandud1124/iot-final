
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';
import { MasterSwitchCard } from '@/components/MasterSwitchCard';
import { Cpu } from 'lucide-react';

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
  // Removed virtualization & scroll tracking in favor of responsive grid layout

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

  // NOTE: If performance becomes an issue with very large device counts, consider a masonry/virtual grid later.

  const totalSwitches = devices.reduce((sum, d) => sum + d.switches.length, 0);
  const activeSwitches = devices.reduce((sum, d) => sum + d.switches.filter(sw => sw.state).length, 0);

  const handleToggle = async (deviceId: string, switchId: string) => {
    try {
      await toggleSwitch(deviceId, switchId);
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle switch', variant: 'destructive' });
    }
  };

  const handleMasterToggle = async (state: boolean) => {
    try {
      await toggleAllSwitches(state);
      toast({ title: state ? 'All On' : 'All Off', description: `All switches turned ${state ? 'on' : 'off'}` });
    } catch {
      toast({ title: 'Error', description: 'Failed master toggle', variant: 'destructive' });
    }
  };

  const handleDeviceBulk = async (deviceId: string, toState: boolean) => {
    try {
      await toggleDeviceAllSwitches(deviceId, toState);
    } catch {
      toast({ title: 'Error', description: 'Device bulk toggle failed', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Switches by Device</h1>
          <p className="text-muted-foreground mt-1">Control each device's switches individually</p>
        </div>
        <div className="flex gap-3 items-end flex-wrap justify-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</label>
            <input
              className="border rounded-md px-2 py-1 text-sm w-48 bg-background"
              placeholder="Device or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Location</label>
            <select
              className="border rounded-md px-2 py-1 text-sm bg-background"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="all">All</option>
              {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
          {(search || locationFilter !== 'all') && (
            <button
              className="h-8 px-3 rounded-md border bg-muted text-xs hover:bg-muted/70"
              onClick={() => { setSearch(''); setLocationFilter('all'); }}
            >Clear Filters</button>
          )}
        </div>
      </div>

      <MasterSwitchCard
        totalSwitches={totalSwitches}
        activeSwitches={activeSwitches}
        offlineDevices={devices.filter(d => d.status !== 'online').length}
  onMasterToggle={handleMasterToggle}
  isBusy={false}
      />

      {filteredDevices.length === 0 ? (
        <div className="text-center py-12">
          <Cpu className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No matching devices</h3>
          <p className="text-muted-foreground">Adjust filters or add a device</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDevices.map(device => {
            const onCount = device.switches.filter(sw => sw.state).length;
            const allOn = onCount === device.switches.length && device.switches.length > 0;
            const allOff = onCount === 0;
            const isCollapsed = collapsed[device.id];
            const hasSchedules = device.switches.some(sw => (sw as any).schedule?.length || (sw as any).schedules?.length);
            return (
              <Card key={device.id} className={`border shadow-sm flex flex-col ${hasSchedules ? 'ring-1 ring-blue-300' : ''}`}>
                <CardHeader className="pb-3 cursor-pointer px-4 py-3" onClick={() => setCollapsed(c => ({...c, [device.id]: !c[device.id]}))}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span className="truncate" title={device.name}>{device.name}</span>
                        <Badge variant={device.status === 'online' ? 'default' : 'secondary'} className="capitalize">
                          {device.status}
                        </Badge>
                        {hasSchedules && <span className="px-1.5 py-0.5 text-[9px] rounded bg-blue-100 text-blue-700">Sched</span>}
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground truncate mt-1">
                        {device.location || 'Unknown'}{device.classroom ? ` • ${device.classroom}` : ''}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{onCount}/{device.switches.length} on</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeviceBulk(device.id, true); }}
                        className={`px-2 py-0.5 rounded text-[9px] border ${allOn ? 'bg-green-600 text-white border-green-600' : 'hover:bg-green-100 border-green-300 text-green-700'}`}
                        disabled={device.status !== 'online' || allOn}
                      >All On</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeviceBulk(device.id, false); }}
                        className={`px-2 py-0.5 rounded text-[9px] border ${allOff ? 'bg-red-600 text-white border-red-600' : 'hover:bg-red-100 border-red-300 text-red-700'}`}
                        disabled={device.status !== 'online' || allOff}
                      >All Off</button>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground text-center mt-1">
                        {isCollapsed ? 'Expand' : 'Collapse'}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent className="pt-0 pb-3 px-4 flex-1">
                    <div className="space-y-2 max-h-64 overflow-auto pr-1">
                      {device.switches.map(sw => {
                        const scheduled = (sw as any).schedule?.length > 0 || (sw as any).schedules?.length > 0;
                        const power = (sw as any).powerConsumption;
                        return (
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
                            {(scheduled || power !== undefined) && (
                              <div className="flex gap-1 text-[9px]">
                                {scheduled && <span className="px-1 py-0.5 rounded bg-blue-100 text-blue-700">Sched</span>}
                                {power !== undefined && <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700">{power}W</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Switches;
