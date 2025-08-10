
import { useState } from 'react';
import { useDevices } from './useDevices';

interface CustomMasterSwitch {
  id: string;
  name: string;
  accessCode?: string;
  switches: string[]; // Array of "deviceId-switchId" strings
  isActive: boolean;
}

export const useCustomMasterSwitches = () => {
  const { devices, toggleSwitch } = useDevices();
  const [customSwitches, setCustomSwitches] = useState<CustomMasterSwitch[]>([]);

  const addCustomSwitch = (switchData: Omit<CustomMasterSwitch, 'id' | 'isActive'>) => {
    const newSwitch: CustomMasterSwitch = {
      id: Date.now().toString(),
      isActive: false,
      ...switchData
    };
    setCustomSwitches(prev => [...prev, newSwitch]);
  };

  const deleteCustomSwitch = (switchId: string) => {
    setCustomSwitches(prev => prev.filter(sw => sw.id !== switchId));
  };

  const toggleCustomSwitch = async (customSwitchId: string, state: boolean) => {
    const customSwitch = customSwitches.find(sw => sw.id === customSwitchId);
    if (!customSwitch) return;

    // Toggle all switches in the group
    for (const switchRef of customSwitch.switches) {
      const [deviceId, switchId] = switchRef.split('-');
      await toggleSwitch(deviceId, switchId);
    }

    // Update the custom switch state
    setCustomSwitches(prev =>
      prev.map(sw =>
        sw.id === customSwitchId ? { ...sw, isActive: state } : sw
      )
    );
  };

  // Update isActive state based on actual switch states
  const updateCustomSwitchStates = () => {
    setCustomSwitches(prev =>
      prev.map(customSwitch => {
        const allOn = customSwitch.switches.every(switchRef => {
          const [deviceId, switchId] = switchRef.split('-');
          const device = devices.find(d => d.id === deviceId);
          const switch_ = device?.switches.find(s => s.id === switchId);
          return switch_?.state === true;
        });
        return { ...customSwitch, isActive: allOn };
      })
    );
  };

  return {
    customSwitches,
    addCustomSwitch,
    deleteCustomSwitch,
    toggleCustomSwitch,
    updateCustomSwitchStates
  };
};
