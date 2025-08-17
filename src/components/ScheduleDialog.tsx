
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';

interface ScheduleData {
  name: string;
  time: string;
  action: 'on' | 'off';
  days: string[];
  switches: string[];
  timeoutMinutes?: number;
}

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (schedule: ScheduleData) => void;
  schedule?: any;
}

const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

export const ScheduleDialog: React.FC<ScheduleDialogProps> = ({ 
  open, 
  onOpenChange, 
  onSave, 
  schedule 
}) => {
  const { devices } = useDevices();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<ScheduleData>({
    name: schedule?.name || '',
    time: schedule?.time || '09:00',
    action: schedule?.action || 'on',
    days: schedule?.days || [],
    switches: schedule?.switches || [],
    timeoutMinutes: schedule?.timeoutMinutes || 480 // 8 hours default for classroom
  });

  // Keep form in sync when editing a schedule
  React.useEffect(() => {
    if (schedule && open) {
      setFormData({
        name: schedule.name || '',
        time: schedule.time || '09:00',
        action: schedule.action || 'on',
        days: Array.isArray(schedule.days) ? schedule.days : [],
        switches: Array.isArray(schedule.switches) ? schedule.switches : [],
        timeoutMinutes: schedule.timeoutMinutes || 480
      });
    } else if (!open && !schedule) {
      // Reset when closing after adding
      setFormData({ name: '', time: '09:00', action: 'on', days: [], switches: [], timeoutMinutes: 480 });
    }
  }, [schedule, open]);

  // Build switch list with type and location for filtering
  const allSwitches = devices.flatMap(device =>
    device.switches.map(sw => ({
      id: `${device.id}-${sw.id}`,
      name: sw.name,
      type: sw.type || 'other',
      deviceName: device.name,
      location: device.location || 'Unknown'
    }))
  );

  // Get unique locations and types for filter dropdowns
  const locations = Array.from(new Set(allSwitches.map(sw => sw.location)));
  const types = Array.from(new Set(allSwitches.map(sw => sw.type)));

  // Filter state
   const [locationFilter, setLocationFilter] = useState<string>('all');
   const [typeFilter, setTypeFilter] = useState<string>('all');

  // Filtered switches
   const filteredSwitches = allSwitches.filter(sw => {
     return (locationFilter === 'all' || sw.location === locationFilter) && (typeFilter === 'all' || sw.type === typeFilter);
  });

  const handleDayToggle = (day: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({ ...prev, days: [...prev.days, day] }));
    } else {
      setFormData(prev => ({ ...prev, days: prev.days.filter(d => d !== day) }));
    }
  };

  const handleSwitchToggle = (switchId: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({ ...prev, switches: [...prev.switches, switchId] }));
    } else {
      setFormData(prev => ({ ...prev, switches: prev.switches.filter(s => s !== switchId) }));
    }
  };

  const handleSave = () => {
    if (!formData.name || !formData.time || formData.days.length === 0 || formData.switches.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    onSave(formData);
    onOpenChange(false);
    // Reset form for new schedules
    setFormData({
      name: '',
      time: '09:00',
      action: 'on',
      days: [],
      switches: [],
      timeoutMinutes: 480
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {schedule ? 'Edit Schedule' : 'Add New Schedule'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Schedule Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Morning Classroom Lights"
              />
            </div>
            <div>
              <Label htmlFor="time">Time *</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="action">Action *</Label>
              <Select value={formData.action} onValueChange={(value) => setFormData(prev => ({ ...prev, action: value as 'on' | 'off' }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Turn On</SelectItem>
                  <SelectItem value="off">Turn Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="timeout">Auto-off Timeout (minutes)</Label>
              <Input
                id="timeout"
                type="number"
                value={formData.timeoutMinutes}
                onChange={(e) => setFormData(prev => ({ ...prev, timeoutMinutes: parseInt(e.target.value) }))}
                placeholder="480 (8 hours)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Security will be notified if lights run beyond this time
              </p>
            </div>
          </div>
          <div>
            <Label>Select Switches/Devices *</Label>
            {allSwitches.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No devices or switches available. Please add devices first or check your connection.
              </div>
            ) : (
              <>
                <div className="flex gap-4 mb-2">
                  <div>
                    <Label htmlFor="locationFilter">Class/Block</Label>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
                      <SelectContent>
                        {/* Remove stray SelectItem and div */}
                        {locations.map(loc => (
                          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="typeFilter">Type</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {types.map(type => (
                          <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto border rounded p-3 mt-2 space-y-2">
                  {filteredSwitches.map(sw => (
                    <div key={sw.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={sw.id}
                        checked={formData.switches.includes(sw.id)}
                        onCheckedChange={(checked) => handleSwitchToggle(sw.id, checked as boolean)}
                      />
                      <Label htmlFor={sw.id} className="text-sm flex-1">
                        {sw.name} <span className="text-muted-foreground ml-2">({sw.deviceName}, {sw.location}, {sw.type})</span>
                      </Label>
                    </div>
                  ))}
                  {filteredSwitches.length === 0 && (
                    <div className="text-xs text-muted-foreground">No switches found for selected filters.</div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {schedule ? 'Update Schedule' : 'Add Schedule'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
