
import React from 'react';

import { MasterSwitchCard } from '@/components/MasterSwitchCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Power, Lightbulb, Fan, Zap, Home, Building2, FlaskConical } from 'lucide-react';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';

const Master = () => {
  const { devices, toggleAllSwitches, bulkToggleType, toggleDeviceAllSwitches } = useDevices();
  const { toast } = useToast();

  // Separate live (online devices) vs offline device switches
  const liveSwitches = devices.filter(d => d.status === 'online').flatMap(device => 
    device.switches.map(sw => ({
      ...sw,
      deviceName: device.name,
      deviceId: device.id,
      deviceStatus: device.status,
      location: device.location || 'Unknown'
    }))
  );
  const offlineSwitches = devices.filter(d => d.status !== 'online').flatMap(device => 
    device.switches.map(sw => ({
      ...sw,
      deviceName: device.name,
      deviceId: device.id,
      deviceStatus: device.status,
      location: device.location || 'Unknown'
    }))
  );

  const totalSwitches = liveSwitches.length;
  const activeSwitches = liveSwitches.filter(sw => sw.state).length;
  const offlineActiveSwitches = offlineSwitches.filter(sw => sw.state).length; // last-known ON on offline devices

  // Group switches by type for quick controls (only include non-empty)
  const rawTypeGroups: Record<string, typeof liveSwitches> = {
    light: liveSwitches.filter(sw => sw.type === 'light'),
    fan: liveSwitches.filter(sw => sw.type === 'fan'),
    outlet: liveSwitches.filter(sw => sw.type === 'outlet'),
    relay: liveSwitches.filter(sw => sw.type === 'relay')
  };
  const switchesByType = Object.entries(rawTypeGroups)
    .filter(([, list]) => list.length > 0)
    .reduce<Record<string, typeof liveSwitches>>((acc,[k,v]) => { acc[k]=v; return acc; }, {});
  const hasTypeGroups = Object.keys(switchesByType).length > 0;

  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.length - onlineDevices;
  const switchesOff = totalSwitches - activeSwitches;

  // Helper to parse location into block / floor / lab
  const parseLocation = (loc: string | undefined) => {
    const original = loc || 'Unknown';
    const lower = original.toLowerCase();
    const isLab = lower.includes('lab');
    let block: string | null = null;
    let floor: string | null = null;
    // Block detection
    const blockMatch = lower.match(/\b(block|blk)\s*([a-z0-9]+)/i);
    if (blockMatch) block = blockMatch[2].toUpperCase();
    // Also allow patterns like "A Block"
    if (!block) {
      const alt = lower.match(/\b([a-z])\s*block\b/i);
      if (alt) block = alt[1].toUpperCase();
    }
    // Floor detection
    const floorMatch = lower.match(/\b(floor|fl|f)\s*([0-9]+)/i);
    if (floorMatch) floor = floorMatch[2];
    return { original, isLab, block: block || 'Unknown', floor: floor || '0' };
  };

  // Build device-based grouping for block/floor and labs
  const deviceMeta = devices.map(d => ({ device: d, meta: parseLocation(d.location) }));
  type SwitchShape = typeof liveSwitches[number];
  const labsMap: Record<string, SwitchShape[]> = {};
  const blockFloorMap: Record<string, SwitchShape[]> = {};

  deviceMeta.forEach(({ device, meta }) => {
    const deviceSwitches = device.switches.map(sw => ({
      ...sw,
      deviceName: device.name,
      deviceId: device.id,
      deviceStatus: device.status,
      location: device.location || 'Unknown'
    }));
    if (meta.isLab) {
      if (!labsMap[meta.original]) labsMap[meta.original] = [];
      labsMap[meta.original].push(...deviceSwitches);
    } else {
      const key = `${meta.block}::${meta.floor}`;
      if (!blockFloorMap[key]) blockFloorMap[key] = [];
      blockFloorMap[key].push(...deviceSwitches);
    }
  });

  const sortedBlockFloorEntries = Object.entries(blockFloorMap).sort((a, b) => {
    const [ablock, afloor] = a[0].split('::');
    const [bblock, bfloor] = b[0].split('::');
    if (ablock === bblock) return parseInt(afloor) - parseInt(bfloor);
    return ablock.localeCompare(bblock);
  });
  const labEntries = Object.entries(labsMap).sort((a, b) => a[0].localeCompare(b[0]));

  const handleMasterToggle = async (state: boolean) => {
    try {
      await toggleAllSwitches(state);
      toast({
        title: state ? "All Switches On" : "All Switches Off",
        description: `All switches have been turned ${state ? 'on' : 'off'}`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle master switch",
        variant: "destructive"
      });
    }
  };

  const handleTypeToggle = async (type: string, state: boolean) => {
    try {
      await bulkToggleType(type, state);
      toast({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)}s ${state ? 'On' : 'Off'}`,
        description: `All ${type} switches have been turned ${state ? 'on' : 'off'}`
      });
    } catch {
      toast({ title: 'Error', description: 'Type bulk toggle failed', variant: 'destructive' });
    }
  };

  const handleBlockFloorToggle = async (block: string, floor: string, state: boolean) => {
    const targetDevices = deviceMeta.filter(dm => dm.meta.block === block && dm.meta.floor === floor).map(dm => dm.device);
    try {
      await Promise.all(targetDevices.map(d => toggleDeviceAllSwitches(d.id, state)));
      toast({
        title: `Block ${block} Floor ${floor} ${state ? 'On' : 'Off'}`,
        description: `All switches in Block ${block} Floor ${floor} are ${state ? 'on' : 'off'}`
      });
    } catch {
      toast({ title: 'Error', description: 'Block/Floor bulk toggle failed', variant: 'destructive' });
    }
  };

  const handleLabToggle = async (labLocation: string, state: boolean) => {
    const targetDevices = devices.filter(d => (d.location || '').toLowerCase() === labLocation.toLowerCase());
    try {
      await Promise.all(targetDevices.map(d => toggleDeviceAllSwitches(d.id, state)));
      toast({
        title: `${labLocation} ${state ? 'On' : 'Off'}`,
        description: `All switches in ${labLocation} are ${state ? 'on' : 'off'}`
      });
    } catch {
      toast({ title: 'Error', description: 'Lab bulk toggle failed', variant: 'destructive' });
    }
  };

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Master Control
            </h1>
            <p className="text-muted-foreground mt-1">
              Control all devices and switches from one place
            </p>
          </div>
        </div>

        {/* Master Switch Controls */}
        <MasterSwitchCard
          totalSwitches={totalSwitches}
          activeSwitches={activeSwitches}
          offlineDevices={devices.filter(d => d.status !== 'online').length}
          onMasterToggle={handleMasterToggle}
          isBusy={false}
        />

        {/* Summary Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <div className="p-4 rounded-md border bg-muted/30 flex flex-col items-start">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Devices Online</span>
            <span className="text-xl font-semibold">{onlineDevices}</span>
          </div>
          <div className="p-4 rounded-md border bg-muted/30 flex flex-col items-start">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Devices Offline</span>
            <span className="text-xl font-semibold">{offlineDevices}</span>
          </div>
            <div className="p-4 rounded-md border bg-muted/30 flex flex-col items-start">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Live Switches On</span>
              <span className="text-xl font-semibold">{activeSwitches}</span>
              {offlineActiveSwitches > 0 && (
                <span className="text-[10px] mt-1 text-muted-foreground">+{offlineActiveSwitches} offline last-known on</span>
              )}
            </div>
            <div className="p-4 rounded-md border bg-muted/30 flex flex-col items-start">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Switches Off</span>
              <span className="text-xl font-semibold">{switchesOff}</span>
            </div>
        </div>

        {/* Quick Controls by Type (hidden if all empty) */}
        {hasTypeGroups && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Control by Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(switchesByType).map(([type, switches]) => {
                const activeCount = switches.filter(sw => sw.state).length;
                const total = switches.length;
                const allOn = activeCount === total && total > 0;
                const getIcon = () => {
                  switch (type) {
                    case 'light': return <Lightbulb className="w-5 h-5" />;
                    case 'fan': return <Fan className="w-5 h-5" />;
                    case 'outlet': return <Power className="w-5 h-5" />;
                    case 'relay': return <Zap className="w-5 h-5" />;
                    default: return <Zap className="w-5 h-5" />;
                  }
                };
                const label = `${type.charAt(0).toUpperCase()+type.slice(1)}s`;
                const onlineInGroup = switches.some(sw => sw.deviceStatus === 'online');
                return (
                  <Card key={type} className="glass">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getIcon()} {label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {activeCount} on / {total - activeCount} off
                          </p>
                        </div>
                        <Button
                          variant={allOn ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleTypeToggle(type, !allOn)}
                          disabled={!onlineInGroup}
                        >
                          {allOn ? 'Turn Off' : 'Turn On'}
                        </Button>
                      </div>
                      <Badge variant="secondary" className="w-fit">{total} {type}s</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Control by Block / Floor */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Control by Block & Floor</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedBlockFloorEntries.map(([key, switches]) => {
              const [block, floor] = key.split('::');
              const activeCount = switches.filter(sw => sw.state).length;
              const total = switches.length;
              const allOn = activeCount === total && total > 0;
              const anyOnline = switches.some(sw => sw.deviceStatus === 'online');
              return (
                <Card key={key} className="glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Block {block} • Floor {floor}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {activeCount} of {total} switches on
                        </p>
                      </div>
                      <Button
                        variant={allOn ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleBlockFloorToggle(block, floor, !allOn)}
                        disabled={total === 0 || !anyOnline}
                      >
                        {allOn ? 'Turn Off' : 'Turn On'}
                      </Button>
                    </div>
                    <Badge variant="secondary" className="w-fit">{total} switches</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Labs */}
        {labEntries.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Labs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {labEntries.map(([labLocation, switches]) => {
                const activeCount = switches.filter(sw => sw.state).length;
                const total = switches.length;
                const allOn = activeCount === total && total > 0;
                const anyOnline = switches.some(sw => sw.deviceStatus === 'online');
                return (
                  <Card key={labLocation} className="glass">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FlaskConical className="w-5 h-5" />
                        {labLocation}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {activeCount} of {total} switches on
                          </p>
                        </div>
                        <Button
                          variant={allOn ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleLabToggle(labLocation, !allOn)}
                          disabled={total === 0 || !anyOnline}
                        >
                          {allOn ? 'Turn Off' : 'Turn On'}
                        </Button>
                      </div>
                      <Badge variant="secondary" className="w-fit">{total} switches</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
  );
};

export default Master;
