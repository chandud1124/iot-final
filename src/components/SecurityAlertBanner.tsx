import React from 'react';
import { useSecurityAlerts } from '@/hooks/useSecurityAlerts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, BellRing, X } from 'lucide-react';
import { Button } from './ui/button';

export const SecurityAlertBanner = () => {
  const { alerts, dismissAlert } = useSecurityAlerts();

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-4xl z-50 p-4 space-y-2">
      {alerts.map((alert) => (
        <Alert key={alert.id} variant={alert.severity === 'high' ? 'destructive' : 'default'} className="shadow-lg">
          {alert.type === 'extension_request' ? <BellRing className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle className="font-bold flex justify-between items-center">
            <span>{alert.type === 'extension_request' ? 'Extension Request' : 'Security Alert'}: {alert.deviceName} ({alert.classroom || alert.location})</span>
            <Button variant="ghost" size="sm" onClick={() => dismissAlert(alert.id)}>
              <X className="h-4 w-4" />
            </Button>
          </AlertTitle>
          <AlertDescription>
            {alert.message}
            <div className="text-xs text-muted-foreground mt-1">
              {new Date(alert.timestamp).toLocaleString()}
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};
