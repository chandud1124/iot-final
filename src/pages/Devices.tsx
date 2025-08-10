import React, { useState } from 'react';
import DeviceCard from '@/components/DeviceCard';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';
import { DeviceConfigDialog } from '@/components/DeviceConfigDialog';
import { Device } from '@/types';
import { useAuth } from '@/hooks/useAuth';

const Devices = () => {
  const { devices, toggleSwitch, updateDevice, deleteDevice, addDevice } = useDevices();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { toast } = useToast();
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | undefined>(undefined);

  const handleToggleSwitch = async (deviceId: string, switchId: string) => {
    try {
      await toggleSwitch(deviceId, switchId);
      toast({
        title: "Success",
        description: "Switch toggled successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle switch",
        variant: "destructive"
      });
    }
  };

  const handleUpdateDevice = async (deviceId: string, data: Partial<Device>) => {
    try {
      await updateDevice(deviceId, data);
      toast({
        title: "Success",
        description: "Device updated successfully"
      });
      setShowConfigDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update device",
        variant: "destructive"
      });
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    try {
      await deleteDevice(deviceId);
      toast({
        title: "Success",
        description: "Device deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete device",
        variant: "destructive"
      });
    }
  };

  const handleAddDevice = async (deviceData: Device) => {
    try {
      await addDevice(deviceData);
      toast({
        title: "Success",
        description: "Device added successfully"
      });
      setShowConfigDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add device",
        variant: "destructive"
      });
    }
  };

  if (!devices) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Devices</h1>
        {isAdmin && (
          <Button
            onClick={() => {
              setSelectedDevice(undefined);
              setShowConfigDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Device
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onToggleSwitch={handleToggleSwitch}
            onUpdateDevice={(deviceId, data) => {
              setSelectedDevice(device);
              setShowConfigDialog(true);
            }}
            onDeleteDevice={handleDeleteDevice}
          />
        ))}
      </div>

      {isAdmin && (
        <DeviceConfigDialog
          open={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          onSubmit={(data) => {
          if (selectedDevice) {
            handleUpdateDevice(selectedDevice.id, {
              ...data,
              switches: data.switches.map(sw => ({
                id: selectedDevice.switches.find(s => s.name === sw.name)?.id || `switch-${Date.now()}-${Math.random()}`,
                name: sw.name || 'Unnamed Switch',
                type: sw.type || 'relay',
                relayGpio: (sw as any).relayGpio || (sw as any).gpio || 0,
                state: false,
                manualSwitchEnabled: sw.manualSwitchEnabled || false,
                manualSwitchGpio: sw.manualSwitchGpio,
                usePir: false,
                dontAutoOff: false,
              }))
            });
          } else {
            handleAddDevice({
              ...data,
              id: `device-${Date.now()}`,
              status: 'offline',
              lastSeen: new Date(),
              switches: data.switches.map((sw, idx) => ({
                id: `switch-${Date.now()}-${idx}`,
                name: sw.name || 'Unnamed Switch',
                type: sw.type || 'relay',
                relayGpio: (sw as any).relayGpio || (sw as any).gpio || 0,
                state: false,
                manualSwitchEnabled: sw.manualSwitchEnabled || false,
                manualSwitchGpio: sw.manualSwitchGpio,
                usePir: false,
                dontAutoOff: false,
              }))
            } as Device);
          }
          }}
          initialData={selectedDevice}
        />
      )}
    </div>
  );
};

export default Devices;
