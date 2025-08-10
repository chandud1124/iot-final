import { useState, useEffect } from 'react';
import { Settings, getSettings, updateSettings } from '../services/api';
import { useToast } from './use-toast';

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await getSettings();
      setSettings(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      toast({
        title: 'Error',
        description: 'Failed to load settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateAllSettings = async (newSettings: Partial<Settings>) => {
    try {
      setLoading(true);
      const response = await updateSettings(newSettings);
      setSettings(response.data);
      toast({
        title: 'Success',
        description: 'Settings updated successfully',
      });
      return true;
    } catch (err) {
      setError('Failed to update settings');
      toast({
        title: 'Error',
        description: 'Failed to update settings',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Settings are now updated through updateAllSettings only

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    settings,
    loading,
    error,
    updateSettings: updateAllSettings,
    refreshSettings: fetchSettings,
  };
};
