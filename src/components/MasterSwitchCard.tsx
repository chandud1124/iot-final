
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Zap, Settings, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useCustomMasterSwitches } from '@/hooks/useCustomMasterSwitches';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';

interface MasterSwitchCardProps {
  totalSwitches?: number; // legacy external aggregate
  activeSwitches?: number; // legacy external aggregate
  offlineDevices?: number;
  onMasterToggle: (state: boolean) => void;
  isBusy?: boolean; // bulk operation in-flight
}

export const MasterSwitchCard: React.FC<MasterSwitchCardProps> = ({
  totalSwitches: externalTotal,
  activeSwitches: externalActive,
  offlineDevices = 0,
  onMasterToggle,
  isBusy = false
}) => {
  const { devices } = useDevices();
  // Derive authoritative live counts from devices to avoid cross-page divergence with stale stats
  const derivedTotal = devices.reduce((sum, d) => sum + d.switches.length, 0);
  const derivedActive = devices.reduce((sum, d) => sum + d.switches.filter(sw => sw.state).length, 0);
  const totalSwitches = derivedTotal || externalTotal || 0;
  const activeSwitches = derivedActive || externalActive || 0;
  if (externalTotal !== undefined && externalTotal !== derivedTotal && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[MasterSwitchCard] external vs derived mismatch', { externalTotal, derivedTotal, externalActive, derivedActive });
  }
  const { customSwitches, addCustomSwitch, toggleCustomSwitch, deleteCustomSwitch } = useCustomMasterSwitches();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  // Derived master state: on only if every switch is on. We keep a local echo only to show immediate UI while server updates.
  const [forcedState, setForcedState] = useState<boolean | null>(null);
  const [newSwitch, setNewSwitch] = useState({
    name: '',
    accessCode: '',
    selectedSwitches: [] as string[]
  });
  const { toast } = useToast();

  const allMasterOn = totalSwitches > 0 && activeSwitches === totalSwitches;
  const allOff = activeSwitches === 0;
  const mixed = !allOff && !allMasterOn;

  // Whenever upstream counts change, clear forced override so UI reflects real aggregate.
  useEffect(()=>{ setForcedState(null); }, [activeSwitches, totalSwitches]);
  const effectiveChecked = forcedState !== null ? forcedState : allMasterOn;

  // Device status counts
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineList = devices.filter(d => d.status && d.status !== 'online');
  const totalDevices = devices.length;

  // Get all available switches from devices
  const allSwitches = devices.flatMap(device => 
    device.switches.map(sw => ({
      id: `${device.id}-${sw.id}`,
      name: `${device.name} - ${sw.name}`,
      deviceId: device.id,
      switchId: sw.id
    }))
  );

  const handleCreateCustomSwitch = () => {
    if (!newSwitch.name || newSwitch.selectedSwitches.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and select at least one switch",
        variant: "destructive"
      });
      return;
    }

    addCustomSwitch({
      name: newSwitch.name,
      accessCode: newSwitch.accessCode || undefined,
      switches: newSwitch.selectedSwitches
    });

    setNewSwitch({ name: '', accessCode: '', selectedSwitches: [] });
    setShowCreateDialog(false);
    
    toast({
      title: "Custom Switch Created",
      description: `"${newSwitch.name}" has been created successfully`
    });
  };

  const handleToggleCustomSwitch = (switchId: string, state: boolean) => {
    toggleCustomSwitch(switchId, state);
    toast({
      title: state ? "Group Switches On" : "Group Switches Off",
      description: `All switches in the group have been turned ${state ? 'on' : 'off'}`
    });
  };

  return (
    <div className="space-y-4">
      {/* Master Switch Card */}
      <Card className="glass border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Master Switch
            {onlineDevices > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                {onlineDevices} Online
              </span>
            )}
            {offlineDevices > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600 cursor-help">
                      {offlineDevices} Offline
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Offline Devices:</p>
                      {offlineList.length === 0 && <p>None</p>}
                      {offlineList.slice(0,8).map(d => (
                        <p key={d.id}>{d.name}</p>
                      ))}
                      {offlineList.length > 8 && (
                        <p className="italic">+ {offlineList.length - 8} more...</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Control all {totalSwitches} switches at once
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Currently {activeSwitches} of {totalSwitches} switches are on | {onlineDevices}/{totalDevices} devices online
              </p>
              {onlineDevices === 0 && (
                <p className="text-xs text-red-600 mt-1">All devices offline — master control disabled.</p>
              )}
              <div className="flex items-center gap-3">
                {mixed && !isBusy && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 border border-amber-300">
                    Mixed
                  </span>
                )}
                {isBusy && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700 border border-blue-300 animate-pulse">
                    Syncing
                  </span>
                )}
                <Switch
                  checked={effectiveChecked}
                  onCheckedChange={(checked) => {
                    // Master is OFF-only: block ON attempts; allow OFF.
                    if (isBusy) return;
                    if (checked) {
                      // Disallow turning ON from master; show hint
                      toast({ title: 'Master ON disabled', description: 'Use individual or group switches to turn ON. Master only turns OFF.', variant: 'default' });
                      // snap back to previous aggregate without changing
                      setForcedState(null);
                      return;
                    }
                    // OFF path
                    setForcedState(false);
                    if (!allOff) onMasterToggle(false);
                  }}
                  disabled={onlineDevices === 0 || isBusy}
                  className="data-[state=checked]:bg-primary"
                />
                {(mixed || allMasterOn) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={onlineDevices === 0 || isBusy}
                    onClick={() => { if (!isBusy) { setForcedState(false); onMasterToggle(false); } }}
                  >
                    Turn all off
                  </Button>
                )}
              </div>
            </div>
            {/* Removed secondary All Off/Mixed toggle for clarity */}
          </div>
        </CardContent>
      </Card>

      {/* Custom Master Switches */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Custom Master Switches</h3>
          <Button onClick={() => setShowCreateDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Create Group
          </Button>
        </div>

        {customSwitches.length === 0 ? (
          <Card className="glass">
            <CardContent className="text-center py-8">
              <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No custom master switches created yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customSwitches.map((customSwitch) => (
              <Card key={customSwitch.id} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{customSwitch.name}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCustomSwitch(customSwitch.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {customSwitch.switches.length} switches in this group
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {customSwitch.isActive ? 'Group On' : 'Group Off'}
                    </span>
                    <Switch
                      checked={!!customSwitch.isActive}
                      onCheckedChange={(checked) => handleToggleCustomSwitch(customSwitch.id, checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Custom Switch Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Custom Master Switch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="switch-name">Group Name</Label>
              <Input
                id="switch-name"
                value={newSwitch.name}
                onChange={(e) => setNewSwitch({...newSwitch, name: e.target.value})}
                placeholder="e.g., Living Room Lights"
              />
            </div>
            
            <div>
              <Label htmlFor="access-code">Access Code (Optional)</Label>
              <Input
                id="access-code"
                type="password"
                value={newSwitch.accessCode}
                onChange={(e) => setNewSwitch({...newSwitch, accessCode: e.target.value})}
                placeholder="Enter access code for security"
              />
            </div>

            <div>
              <Label>Select Switches to Control</Label>
              <div className="max-h-60 overflow-y-auto border rounded-md p-2 mt-2">
                {allSwitches.map((switch_) => (
                  <div key={switch_.id} className="flex items-center space-x-2 py-2">
                    <Checkbox
                      id={switch_.id}
                      checked={newSwitch.selectedSwitches.includes(switch_.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setNewSwitch({
                            ...newSwitch,
                            selectedSwitches: [...newSwitch.selectedSwitches, switch_.id]
                          });
                        } else {
                          setNewSwitch({
                            ...newSwitch,
                            selectedSwitches: newSwitch.selectedSwitches.filter(id => id !== switch_.id)
                          });
                        }
                      }}
                    />
                    <Label htmlFor={switch_.id} className="text-sm">
                      {switch_.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCustomSwitch}>
                Create Group
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
