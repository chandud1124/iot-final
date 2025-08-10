
import React, { useState, useEffect } from 'react';
import DeviceCard from '@/components/DeviceCard';
import { StatsCard } from '@/components/StatsCard';
import { MasterSwitchCard } from '@/components/MasterSwitchCard';
import { DeviceConfigDialog } from '@/components/DeviceConfigDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cpu, Zap, Radar, Activity } from 'lucide-react';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';
import { Device, DeviceConfig } from '@/types';

const Index = () => {
  const { devices, toggleSwitch, updateDevice, deleteDevice, getStats, toggleAllSwitches } = useDevices();
  const [configDevice, setConfigDevice] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalDevices: 0,
    onlineDevices: 0,
    totalSwitches: 0,
    activeSwitches: 0,
    totalPirSensors: 0,
    activePirSensors: 0
  });
  const { toast } = useToast();

  useEffect(() => {
    const loadStats = async () => {
      const newStats = await getStats();
      setStats(newStats);
    };
    loadStats();
  }, [getStats]);

  const handleToggleSwitch = async (deviceId: string, switchId: string) => {
    try {
      await toggleSwitch(deviceId, switchId);
      toast({
        title: "Switch Toggled",
        description: "Switch state updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle switch",
        variant: "destructive"
      });
    }
  };

  const handleUpdateDevice = async (deviceId: string, updates: any) => {
    try {
      await updateDevice(deviceId, updates);
      toast({
        title: "Device Updated",
        description: "Device configuration saved successfully"
      });
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
        title: "Device Deleted",
        description: "Device removed successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete device",
        variant: "destructive"
      });
    }
  };

  const handleMasterToggle = async (state: boolean) => {
    try {
      await toggleAllSwitches(state);
      toast({
        title: state ? "All Switches On" : "All Switches Off",
        description: `All connected switches have been turned ${state ? 'on' : 'off'}`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle master switch",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              IoT Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Control and monitor your smart home devices
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total Devices"
            value={stats.totalDevices}
            subtitle={`${stats.onlineDevices} online`}
            icon={<Cpu className="h-4 w-4" />}
            trend={stats.onlineDevices > 0 ? 'up' : undefined}
          />
          <StatsCard
            title="Active Switches"
            value={stats.activeSwitches}
            subtitle={`of ${stats.totalSwitches} total`}
            icon={<Zap className="h-4 w-4" />}
            trend={stats.activeSwitches > 0 ? 'up' : undefined}
          />
          <StatsCard
            title="PIR Sensors"
            value={stats.totalPirSensors}
            subtitle={`${stats.activePirSensors} active`}
            icon={<Radar className="h-4 w-4" />}
          />
          <StatsCard
            title="System Status"
            value="Online"
            subtitle="All systems operational"
            icon={<Activity className="h-4 w-4" />}
            trend="up"
          />
        </div>

        {/* Master Switch */}
        <MasterSwitchCard
          totalSwitches={stats.totalSwitches}
            activeSwitches={stats.activeSwitches}
            offlineDevices={devices.filter(d => d.status !== 'online').length}
            onMasterToggle={handleMasterToggle}
        />

        {/* Devices */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            Connected Devices
          </h2>
          {devices.length === 0 ? (
            <div className="text-center py-12">
              <Cpu className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No devices connected</h3>
              <p className="text-muted-foreground mb-4">
                Connect your ESP32 devices to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onToggleSwitch={handleToggleSwitch}
                  onUpdateDevice={handleUpdateDevice}
                  onDeleteDevice={handleDeleteDevice}
                />
              ))}
            </div>
          )}
        </div>
        {/* Device Configuration Dialog */}
      {configDevice && (
        <DeviceConfigDialog
          initialData={devices.find(d => d.id === configDevice)!}
          open={!!configDevice}
          onOpenChange={(open) => !open && setConfigDevice(null)}
          onSubmit={(config) => {
            handleUpdateDevice(configDevice, config);
            setConfigDevice(null);
          }}
        />
      )}
    </div>
  );
};

export default Index;
