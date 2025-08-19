import { useState, useEffect, useCallback } from 'react';
import socketService from '@/services/socketService';

export interface SecurityAlert {
  id: string;
  deviceId: string;
  deviceName: string;
  location: string;
  classroom: string;
  type: 'motion_override' | 'timeout' | 'schedule_overrun' | 'extension_request';
  severity: 'medium' | 'high';
  message: string;
  metadata: any;
  timestamp: string;
}

export interface ExtensionRequest {
    deviceId: string;
    switchId: string;
    requestedBy: string; // Should be user ID or name
    requestedMinutes: number;
    timestamp: number;
    deviceName?: string;
    classroom?: string;
    location?: string;
}

export const useSecurityAlerts = () => {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);

  const handleNewAlert = useCallback((alert: SecurityAlert) => {
    // Avoid duplicates
    setAlerts(prevAlerts => prevAlerts.find(a => a.id === alert.id) ? prevAlerts : [...prevAlerts, alert]);
  }, []);

  const handleNewExtensionRequest = useCallback((request: ExtensionRequest) => {
    const alert: SecurityAlert = {
        id: `ext-${request.deviceId}-${request.switchId}-${request.timestamp}`,
        deviceId: request.deviceId,
        deviceName: request.deviceName || 'Unknown Device',
        location: request.location || 'Unknown Location',
        classroom: request.classroom || 'Unknown Classroom',
        type: 'extension_request',
        severity: 'high',
        message: `Time extension of ${request.requestedMinutes} minutes requested by ${request.requestedBy}.`,
        metadata: request,
        timestamp: new Date(request.timestamp).toISOString(),
    };
    setAlerts(prevAlerts => [...prevAlerts, alert]);
  }, []);


  useEffect(() => {
    socketService.on('security_alert', handleNewAlert);
    socketService.on('extension_requested', handleNewExtensionRequest);

    return () => {
      socketService.off('security_alert', handleNewAlert);
      socketService.off('extension_requested', handleNewExtensionRequest);
    };
  }, [handleNewAlert, handleNewExtensionRequest]);

  const dismissAlert = (alertId: string) => {
    setAlerts(prevAlerts => prevAlerts.filter(alert => alert.id !== alertId));
  };

  return { alerts, dismissAlert };
};
