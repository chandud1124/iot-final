import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Cpu, 
  Wifi, 
  WifiOff, 
  Settings, 
  Trash2
} from 'lucide-react';
import { SwitchControl } from './SwitchControl';
import { Device } from '@/types';

interface DeviceCardProps {
  device: Device;
  onToggleSwitch: (deviceId: string, switchId: string) => void;
  onEditDevice?: (device: Device) => void; // request opening shared edit dialog
  onDeleteDevice?: (deviceId: string) => void;
}

export default function DeviceCard({ device, onToggleSwitch, onEditDevice, onDeleteDevice }: DeviceCardProps) {

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {device.name}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={device.status === 'online' ? 'default' : 'secondary'}>
            {device.status === 'online' ? (
              <Wifi className="w-3 h-3 mr-1" />
            ) : (
              <WifiOff className="w-3 h-3 mr-1" />
            )}
            {device.status}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEditDevice && onEditDevice(device)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          {onDeleteDevice && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => onDeleteDevice(device.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {/* Device Details */}
          <div className="flex flex-col space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Cpu className="h-3 w-3" />
              <span>MAC: {device.macAddress}</span>
            </div>
            <div>Location: {device.location}</div>
            {device.classroom && <div>Classroom: {device.classroom}</div>}
            <div>Last seen: {new Date(device.lastSeen).toLocaleString()}</div>
          </div>

          {/* Switches */}
          <div className="grid gap-2">
          {device.switches.map((switch_, i) => (
                  <SwitchControl
            key={switch_.id || (switch_ as any)._id || `${switch_.name}-${(switch_ as any).gpio || (switch_ as any).relayGpio || i}`}
                    switch={switch_}
                    onToggle={() => {
                      const sid = switch_.id || (switch_ as any)._id;
                      if (sid) onToggleSwitch(device.id, sid);
                      else console.warn('Switch missing id when toggling', switch_);
                    }}
                    disabled={device.status !== 'online'}
                    isPirActive={(() => {
                      if (!switch_.usePir || !device.pirEnabled) return false;
                      const last = (device as any).pirSensorLastTriggered ? new Date((device as any).pirSensorLastTriggered).getTime() : 0;
                      const windowMs = ((device.pirAutoOffDelay ?? 30) * 1000);
                      return !!last && (Date.now() - last) <= windowMs;
                    })()}
                  />
                ))}
          </div>

          {/* PIR Sensor Info */}
          {device.pirEnabled && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">PIR Sensor</span>
                <Badge variant="outline" className={device.pirEnabled ? 'bg-green-500/10' : 'bg-muted'}>
                  {device.pirEnabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {device.pirGpio && `GPIO ${device.pirGpio} • `}
                Auto-off delay: {device.pirAutoOffDelay || 30}s
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

