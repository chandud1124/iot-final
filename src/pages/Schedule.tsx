import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import api from '@/services/api';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Plus, Edit, Trash2 } from 'lucide-react';
import { ScheduleDialog } from '@/components/ScheduleDialog';
import { scheduleAPI } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface Schedule {
  id: string;
  name: string;
  time: string;
  action: 'on' | 'off';
  // Days are user-friendly names for UI, we map to numbers (0-6) when calling the API
  days: string[];
  // Switch IDs are composite `${deviceId}-${switchId}` for UI; map to objects for API
  switches: string[];
  enabled: boolean;
  timeoutMinutes?: number;
}
// Day helpers: backend expects 0-6 (0=Sunday) and cron uses same
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const dayNameToNumber = (name: string): number => {
  const idx = DAY_NAMES.findIndex(d => d.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? idx : 1; // default to Monday
};
const dayNumberToName = (n: number): string => DAY_NAMES[n] ?? 'Monday';
const toSwitchRef = (comboId: string) => {
  const [deviceId, switchId] = comboId.split('-');
  return { deviceId, switchId };
};
const fromSwitchRef = (ref: any): string => `${ref.deviceId}-${ref.switchId}`;

// Google Calendar Connect Component
function GoogleCalendarConnect({ onConnect }: { onConnect: () => void }) {
  const [status, setStatus] = useState('Disconnected');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    setStatus('Connecting...');
    try {
      const res = await fetch('/api/google-calendar/auth-url'); // keep full fetch since not using api instance (already prefixed)
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setStatus('Failed to get auth URL');
      }
    } catch (err) {
      setStatus('Failed to connect');
    }
    setLoading(false);
  };
  return (
    <div className="mb-4">
      <p className="mb-2">Google Calendar Connection Status: <b>{status}</b></p>
      <Button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
        {loading ? 'Connecting...' : 'Connect Google Calendar'}
      </Button>
    </div>
  );
}

// Excel Import Component
function ExcelImport({ onSchedulesExtracted }: { onSchedulesExtracted: (schedules: any[]) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const schedules = XLSX.utils.sheet_to_json(sheet);
      onSchedulesExtracted(schedules);
    };
    reader.readAsArrayBuffer(file);
  };
  return (
    <div className="mb-4">
      <label className="mr-2">Import Schedules from Excel:</label>
      <input type="file" accept=".xlsx, .xls" onChange={handleFile} />
    </div>
  );
}

function GoogleCalendarPanel() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/google-calendar/status');
      setStatus(res.data);
    } catch (e) {
      setStatus({ connected: false });
    }
  };
  useEffect(() => { fetchStatus(); }, []);

  const connect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/google-calendar/auth-url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally { setLoading(false); }
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      await api.post('/google-calendar/disconnect');
      setEvents([]);
      fetchStatus();
    } finally { setLoading(false); }
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/google-calendar/events');
      setEvents(res.data.events || []);
    } catch (e) {
      setEvents([]);
    } finally { setLoading(false); }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Google Calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>Status: <span className={status?.connected ? 'text-green-600' : 'text-red-600'}>{status?.connected ? 'Connected' : 'Disconnected'}</span></div>
        {status?.connected && status.expiresIn != null && (
          <div>Token expires in: {status.expiresIn}s</div>
        )}
        <div className="flex gap-2">
          {!status?.connected && <Button size="sm" onClick={connect} disabled={loading}>{loading ? '...' : 'Connect'}</Button>}
          {status?.connected && <Button size="sm" variant="secondary" onClick={loadEvents} disabled={loading}>Load Events</Button>}
          {status?.connected && <Button size="sm" variant="destructive" onClick={disconnect} disabled={loading}>Disconnect</Button>}
          <Button size="sm" variant="outline" onClick={fetchStatus} disabled={loading}>Refresh</Button>
        </div>
        {events.length > 0 && (
          <div className="border rounded p-2 max-h-64 overflow-auto text-xs space-y-1">
            {events.map(ev => (
              <div key={ev.id} className="border-b pb-1 last:border-0">
                <div className="font-medium">{ev.summary || '(no title)'}</div>
                <div className="text-muted-foreground">{ev.start?.dateTime || ev.start?.date} → {ev.end?.dateTime || ev.end?.date}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const Schedule = () => {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const runScheduleNow = async (scheduleId: string) => {
    try {
      await scheduleAPI.runNow(scheduleId);
      toast({ title: 'Schedule Executed', description: 'Triggered immediately. Check device state.' });
    } catch (error: any) {
      console.error('Run-now error:', error);
      toast({ title: 'Error', description: error.response?.data?.message || error.response?.data?.error || 'Failed to run schedule', variant: 'destructive' });
    }
  };
  
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const response = await api.get('/schedules');
        if (response.data.success) {
          const mapped = response.data.data.map((s: any) => ({
            id: s._id || s.id,
            name: s.name,
            time: s.time,
            action: s.action,
            // Backend stores numbers; convert to names for UI
            days: Array.isArray(s.days) ? s.days.map((n: number) => dayNumberToName(n)) : [],
            // Backend stores objects { deviceId, switchId }; convert to combo ids for UI
            switches: Array.isArray(s.switches) ? s.switches.map(fromSwitchRef) : [],
            enabled: s.enabled,
            timeoutMinutes: s.timeoutMinutes
          }));
          setSchedules(mapped);
        } else {
          toast({
            title: "Error",
            description: "Failed to fetch schedules",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Schedule fetch error:', error);
        toast({
          title: "Error",
          description: error.response?.data?.message || error.response?.data?.error || "Failed to fetch schedules",
          variant: "destructive"
        });
      }
    };

    fetchSchedules();
  }, [toast]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [importedSchedules, setImportedSchedules] = useState<any[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);

  const handleAddSchedule = async (scheduleData: any) => {
    try {
      // Map UI payload to backend schema
      const payload = {
        name: scheduleData.name,
        time: scheduleData.time,
        action: scheduleData.action,
        type: 'weekly', // UI selects days; treat as weekly schedule
        days: (scheduleData.days || []).map((d: string) => dayNameToNumber(d)),
        switches: (scheduleData.switches || []).map((id: string) => toSwitchRef(id)),
        enabled: true,
        timeoutMinutes: scheduleData.timeoutMinutes ?? 0
      };
      const response = await api.post('/schedules', payload);
      if (response.data.success) {
        const s = response.data.data;
        // Normalize server schedule back to UI shape
        const newSchedule: Schedule = {
          id: s._id || s.id,
          name: s.name,
          time: s.time,
          action: s.action,
          days: (s.days || []).map((n: number) => dayNumberToName(n)),
          switches: (s.switches || []).map(fromSwitchRef),
          enabled: s.enabled,
          timeoutMinutes: s.timeoutMinutes
        };
        setSchedules(prev => [...prev, newSchedule]);
        toast({
          title: "Schedule Added",
          description: `${scheduleData.name} has been scheduled successfully`
        });
      }
    } catch (error) {
      console.error('Add schedule error:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || error.response?.data?.error || "Failed to add schedule",
        variant: "destructive"
      });
    }
  };

  const handleEditSchedule = async (scheduleData: any) => {
    if (!editingSchedule) return;
    
    try {
      const payload = {
        name: scheduleData.name,
        time: scheduleData.time,
        action: scheduleData.action,
        type: 'weekly',
        days: (scheduleData.days || []).map((d: string) => dayNameToNumber(d)),
        switches: (scheduleData.switches || []).map((id: string) => toSwitchRef(id)),
        enabled: true,
        timeoutMinutes: scheduleData.timeoutMinutes ?? 0
      };
      const response = await api.put(`/schedules/${editingSchedule.id}`, payload);
      if (response.data.success) {
        const s = response.data.data;
        const updatedSchedule: Schedule = {
          id: s._id || s.id,
          name: s.name,
          time: s.time,
          action: s.action,
          days: (s.days || []).map((n: number) => dayNumberToName(n)),
          switches: (s.switches || []).map(fromSwitchRef),
          enabled: s.enabled,
          timeoutMinutes: s.timeoutMinutes
        };
        setSchedules(prev => 
          prev.map(schedule => 
            schedule.id === editingSchedule.id 
              ? updatedSchedule
              : schedule
          )
        );
        setEditingSchedule(null);
        toast({
          title: "Schedule Updated",
          description: `${scheduleData.name} has been updated successfully`
        });
      }
    } catch (error) {
      console.error('Edit schedule error:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || error.response?.data?.error || "Failed to update schedule",
        variant: "destructive"
      });
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
  const response = await api.delete(`/schedules/${scheduleId}`);
      if (response.data.success) {
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
        toast({
          title: "Schedule Deleted",
          description: "Schedule has been removed successfully"
        });
      }
    } catch (error) {
      console.error('Delete schedule error:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to delete schedule",
        variant: "destructive"
      });
    }
  };

  const toggleSchedule = async (scheduleId: string) => {
    const target = schedules.find(s => s.id === scheduleId);
    if (!target) return;
    try {
      const response = await api.put(`/schedules/${scheduleId}`, { enabled: !target.enabled });
      if (response.data.success) {
        setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, enabled: !target.enabled } : s));
        toast({ title: 'Schedule Updated', description: `${target.name} ${!target.enabled ? 'enabled' : 'disabled'}` });
      }
    } catch (error: any) {
      console.error('Toggle schedule error:', error);
      toast({ title: 'Error', description: error.response?.data?.message || error.response?.data?.error || 'Failed to update schedule', variant: 'destructive' });
    }
  };

  return (
      <div className="space-y-6">
        {/* Google Calendar Integration */}
        <GoogleCalendarPanel />

        {/* Excel Import */}
        <ExcelImport onSchedulesExtracted={setImportedSchedules} />

        {/* Show imported schedules and allow adding them */}
        {importedSchedules.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold">Imported Schedules Preview</h4>
            <pre className="bg-muted p-2 rounded max-h-48 overflow-auto text-xs">{JSON.stringify(importedSchedules, null, 2)}</pre>
            <Button
              className="mt-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                // Convert imported schedules to Schedule type and merge
                const converted = importedSchedules.map((item, idx) => {
                  let actionRaw = (item.action || item.Action || 'on').toString().toLowerCase();
                  let action: 'on' | 'off' = actionRaw === 'off' ? 'off' : 'on';
                  return {
                    id: `imported-${Date.now()}-${idx}`,
                    name: item.name || item.Name || `Imported Schedule ${idx + 1}`,
                    time: item.time || item.Time || '09:00',
                    action,
                    days: (item.days || item.Days || 'Monday,Tuesday,Wednesday,Thursday,Friday').split(',').map((d: string) => d.trim()),
                    switches: (item.switches || item.Switches || '').split(',').map((s: string) => s.trim()).filter(Boolean),
                    enabled: true,
                    timeoutMinutes: Number(item.timeoutMinutes || item.TimeoutMinutes || 0)
                  } as Schedule;
                });
                setSchedules(prev => [...prev, ...converted]);
                setImportedSchedules([]);
                toast({
                  title: 'Imported Schedules Added',
                  description: `${converted.length} schedule(s) imported and added.`
                });
              }}
            >
              Add Imported Schedules
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Schedule Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Automate classroom lighting and devices with smart scheduling
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Schedule
          </Button>
        </div>

        {schedules.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No schedules configured</h3>
            <p className="text-muted-foreground mb-4">
              Create automated schedules for your classroom devices
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Schedule
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((schedule) => (
              <Card key={schedule.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {schedule.name}
                    </CardTitle>
                    <div className="flex gap-1">
                      <Badge variant={schedule.enabled ? 'default' : 'secondary'}>
                        {schedule.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Time:</span>
                      <span className="text-sm">{schedule.time}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Action:</span>
                      <Badge variant={schedule.action === 'on' ? 'default' : 'outline'}>
                        Turn {schedule.action}
                      </Badge>
                    </div>
                    {schedule.timeoutMinutes && schedule.timeoutMinutes > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Timeout:</span>
                        <span className="text-xs text-orange-600">
                          {Math.floor(schedule.timeoutMinutes / 60)}h {schedule.timeoutMinutes % 60}m
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-sm font-medium">Days:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {schedule.days.map((day) => (
                          <Badge key={day} variant="outline" className="text-xs">
                            {day.slice(0, 3)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Devices:</span>
                      <div className="text-xs text-muted-foreground mt-1">
                        {schedule.switches.length} device(s) selected
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSchedule(schedule);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => runScheduleNow(schedule.id)}
                        title="Run now"
                      >
                        Run Now
                      </Button>
                      <Button
                        size="sm"
                        variant={schedule.enabled ? 'secondary' : 'default'}
                        onClick={() => toggleSchedule(schedule.id)}
                      >
                        {schedule.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteSchedule(schedule.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <ScheduleDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditingSchedule(null);
          }}
          onSave={editingSchedule ? handleEditSchedule : handleAddSchedule}
          schedule={editingSchedule}
        />
      </div>
  );
};

export default Schedule;
