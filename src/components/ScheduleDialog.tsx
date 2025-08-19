import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';
import { Clock } from 'lucide-react';

interface ScheduleData {
  name: string;
  onTime: string;
  offTime: string;
  enableOnTime?: boolean;
  enableOffTime?: boolean;
  days: string[];
  switches: string[];
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
    onTime: schedule?.onTime || '',
    offTime: schedule?.offTime || '',
    enableOnTime: schedule?.enableOnTime !== false,
    enableOffTime: schedule?.enableOffTime !== false,
    days: schedule?.days || [],
    switches: schedule?.switches || []
  });

  // Keep form in sync when editing a schedule
  React.useEffect(() => {
    if (schedule && open) {
      setFormData({
        name: schedule.name || '',
        onTime: schedule.onTime || '',
        offTime: schedule.offTime || '',
        enableOnTime: schedule.enableOnTime !== false,
        enableOffTime: schedule.enableOffTime !== false,
        days: Array.isArray(schedule.days) ? schedule.days : [],
        switches: Array.isArray(schedule.switches) ? schedule.switches : [],
      });
    } else if (!open && !schedule) {
      // Reset when closing after adding
      setFormData({ name: '', onTime: '', offTime: '', days: [], switches: [] });
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
    let errorMsg = '';
    if (!formData.name) errorMsg = 'Schedule name is required.';
    else if (formData.days.length === 0) errorMsg = 'Please select at least one day.';
    else if (formData.switches.length === 0) errorMsg = 'Please select at least one switch/device.';
    else if (formData.enableOnTime && (!formData.onTime || formData.onTime === '')) errorMsg = 'Please select a Turn On time or uncheck the box.';
    else if (formData.enableOffTime && (!formData.offTime || formData.offTime === '')) errorMsg = 'Please select a Turn Off time or uncheck the box.';
    if (errorMsg) {
      toast({
        title: 'Validation Error',
        description: errorMsg,
        variant: 'destructive'
      });
      return;
    }
    onSave(formData);
    onOpenChange(false);
    setFormData({
      name: '',
      onTime: '',
      offTime: '',
      enableOnTime: true,
      enableOffTime: true,
      days: [],
      switches: []
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
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="onTime">Turn On Time</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enableOnTime"
                  checked={formData.enableOnTime !== false}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enableOnTime: checked === true }))}
                />
                <div className="relative w-full">
                  <Input
                    id="onTime"
                    type="time"
                    value={formData.onTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, onTime: e.target.value }))}
                    disabled={formData.enableOnTime === false}
                    className="border border-primary focus:border-primary text-primary pr-10"
                  />
                  <Clock className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-primary pointer-events-none" />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="offTime">Turn Off Time</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enableOffTime"
                  checked={formData.enableOffTime !== false}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enableOffTime: checked === true }))}
                />
                <div className="relative w-full">
                  <Input
                    id="offTime"
                    type="time"
                    value={formData.offTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, offTime: e.target.value }))}
                    disabled={formData.enableOffTime === false}
                    className="border border-primary focus:border-primary text-primary pr-10"
                  />
                  <Clock className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-primary pointer-events-none" />
                </div>
              </div>
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
          <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Select Days *</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="flex items-center gap-1">
                  <Checkbox
                    id={`day-${day}`}
                    checked={formData.days.includes(day)}
                    onCheckedChange={(checked) => handleDayToggle(day, checked === true)}
                  />
                  <Label htmlFor={`day-${day}`} className="text-sm">{day}</Label>
                </div>
              ))}
            </div>
          </div>
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
