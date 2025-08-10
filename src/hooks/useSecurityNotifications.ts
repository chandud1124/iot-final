
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

// Lazy load socket.io-client to avoid SSR issues
let socketIoClient: any; // typed as any to avoid dependency if missing
const getSocket = () => {
  if (!socketIoClient) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      socketIoClient = require('socket.io-client');
    } catch (e) {
      console.warn('socket.io-client not installed');
      return null;
    }
  }
  return socketIoClient;
};

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
  const socketRef = useRef<any>(null);
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

  // WebSocket listener for server-side security alerts
  useEffect(() => {
    const ioClient = getSocket();
    if (!ioClient) return;
    if (!socketRef.current) {
      socketRef.current = ioClient.io((window as any).__BACKEND_URL__ || process.env.VITE_BACKEND_URL || 'http://localhost:3001', {
        withCredentials: true,
        transports: ['websocket']
      });
    }
    const s = socketRef.current;
    const handler = (payload: any) => {
      // Role-based filtering
      if (user) {
        const isAdmin = user.role === 'admin';
        const isSecurity = user.role === 'security' || user.role === 'guard';
        // Admin: device offline or critical issues (motion_override, timeout etc.)
        const adminTypes = ['motion_override', 'timeout', 'device_offline'];
        // Security: after-hours running (timeout) or motion override
        const securityTypes = ['timeout', 'motion_override'];
        const userDeviceAllowed = !user.assignedDevices?.length || user.assignedDevices.includes(String(payload.deviceId));
        if (isAdmin && adminTypes.includes(payload.type) && userDeviceAllowed) {
          addAlert({
            deviceId: payload.deviceId,
            deviceName: payload.deviceName,
            location: payload.location,
            message: payload.message,
            type: (payload.type === 'motion_override' ? 'unauthorized_access' : 'device_offline') as any // map if needed
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
      }
    };
    s.on('security_alert', handler);
    return () => { s.off('security_alert', handler); };
  }, [user]);

  return {
    alerts,
    addAlert,
    acknowledgeAlert,
    clearAllAlerts,
    getUnacknowledgedCount
  };
};
