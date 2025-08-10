
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Zap, Settings, Trash2 } from 'lucide-react';
import { useCustomMasterSwitches } from '@/hooks/useCustomMasterSwitches';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';

interface MasterSwitchCardProps {
  totalSwitches: number;
  activeSwitches: number;
  offlineDevices?: number;
  onMasterToggle: (state: boolean) => void;
}

export const MasterSwitchCard: React.FC<MasterSwitchCardProps> = ({
  totalSwitches,
  activeSwitches,
  offlineDevices = 0,
  onMasterToggle
}) => {
  const { devices } = useDevices();
  const { customSwitches, addCustomSwitch, toggleCustomSwitch, deleteCustomSwitch } = useCustomMasterSwitches();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isOn, setIsOn] = useState(false);
  const [newSwitch, setNewSwitch] = useState({
    name: '',
    accessCode: '',
    selectedSwitches: [] as string[]
  });
  const { toast } = useToast();

  const allMasterOn = activeSwitches === totalSwitches && totalSwitches > 0;
  const allOff = activeSwitches === 0;

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
            {offlineDevices > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">
                {offlineDevices} Offline
              </span>
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
                Currently {activeSwitches} of {totalSwitches} switches are on
              </p>
              <Switch
                checked={isOn}
                onCheckedChange={(checked) => {
                  setIsOn(checked);
                  onMasterToggle(checked);
                }}
                className="data-[state=checked]:bg-primary"
              />
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
                      checked={customSwitch.isActive}
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
