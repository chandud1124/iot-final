
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import socketService from '@/services/socketService';

interface SecurityAlert {
  id: string;
  deviceId: string;
  deviceName: string;
  location: string;
  message: string;
  timestamp: Date;
  type: 'timeout' | 'unauthorized_access' | 'device_offline' | 'pir_triggered';
  acknowledged: boolean;
  severity?: string;
  metadata?: Record<string, any>;
}

export const useSecurityNotifications = () => {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const addAlert = (alert: Omit<SecurityAlert, 'id' | 'timestamp' | 'acknowledged'>) => {
    const newAlert: SecurityAlert = {
      ...alert,
      id: Date.now().toString(),
      timestamp: new Date(),
      acknowledged: false
    };

    setAlerts(prev => [newAlert, ...prev]);
    
    // Show toast notification for security personnel
    toast({
      title: "🚨 Security Alert",
      description: `${alert.deviceName} in ${alert.location}: ${alert.message}`,
      variant: "destructive",
      duration: 10000 // 10 seconds for security alerts
    });

    // Play notification sound (in real implementation)
    console.log('SECURITY ALERT:', newAlert);
  };

  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, acknowledged: true }
          : alert
      )
    );
  };

  const clearAllAlerts = () => {
    setAlerts([]);
  };

  const getUnacknowledgedCount = () => {
    return alerts.filter(alert => !alert.acknowledged).length;
  };

  // Reuse existing socketService instead of ad‑hoc require() to avoid ESM require failures
  useEffect(() => {
    const handler = (payload: any) => {
      if (!user) return;
      const isAdmin = user.role === 'admin';
      const isSecurity = user.role === 'security' || user.role === 'guard';
      const adminTypes = ['motion_override', 'timeout', 'device_offline'];
      const securityTypes = ['timeout', 'motion_override'];
      const userDeviceAllowed = !user.assignedDevices?.length || user.assignedDevices.includes(String(payload.deviceId));
      if (isAdmin && adminTypes.includes(payload.type) && userDeviceAllowed) {
        addAlert({
          deviceId: payload.deviceId,
          deviceName: payload.deviceName,
          location: payload.location,
          message: payload.message,
          type: (payload.type === 'motion_override' ? 'unauthorized_access' : 'device_offline') as any
        });
      } else if (isSecurity && securityTypes.includes(payload.type) && userDeviceAllowed) {
        addAlert({
          deviceId: payload.deviceId,
          deviceName: payload.deviceName,
          location: payload.location,
          message: payload.message,
          type: 'pir_triggered'
        });
      }
    };
    socketService.on('security_alert', handler);
    return () => { socketService.off('security_alert', handler); };
  }, [user]);

  return {
    alerts,
    addAlert,
    acknowledgeAlert,
    clearAllAlerts,
    getUnacknowledgedCount
  };
};
