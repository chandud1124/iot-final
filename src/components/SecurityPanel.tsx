
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Shield, AlertTriangle, Check } from 'lucide-react';
import { useSecurityNotifications } from '@/hooks/useSecurityNotifications';

export const SecurityPanel: React.FC = () => {
  const { alerts, acknowledgeAlert, getUnacknowledgedCount } = useSecurityNotifications();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'timeout': return <AlertTriangle className="w-4 h-4" />;
      case 'unauthorized_access': return <Shield className="w-4 h-4" />;
      case 'device_offline': return <Bell className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const unacknowledgedCount = getUnacknowledgedCount();

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Security Alerts
          {unacknowledgedCount > 0 && (
            <Badge variant="destructive">{unacknowledgedCount}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No security alerts</p>
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-3">
              {alerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${
                    alert.acknowledged 
                      ? 'bg-muted/50 border-muted' 
                      : 'bg-destructive/10 border-destructive/20'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 ${
                      alert.acknowledged ? 'text-muted-foreground' : 'text-destructive'
                    }`}>
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{alert.deviceName}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(alert.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {alert.location}
                      </p>
                      <p className="text-xs">{alert.message}</p>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="h-6 text-xs"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
