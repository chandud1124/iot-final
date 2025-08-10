import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings as SettingsIcon, Save, Shield, Bell } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettings } from '@/hooks/useSettings';

const Settings = () => {
  const { settings, loading, updateSettings } = useSettings();

  const handleNotificationChange = async (key: string, value: boolean) => {
    await updateSettings({
      notifications: {
        ...settings?.notifications,
        [key]: {
          ...settings?.notifications[key as keyof typeof settings.notifications],
          enabled: value
        }
      }
    });
  };

  const handleSecurityChange = async (key: string, value: boolean | number) => {
    await updateSettings({
      security: {
        ...settings?.security,
        [key]: value
      }
    });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            System Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your IoT control system
          </p>
        </div>
      </div>

      <Tabs defaultValue="notifications" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="notifications" className="flex items-center">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center">
            <Shield className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
        </TabsList>


        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts via email
                  </p>
                </div>
                <Switch
                  checked={settings?.notifications.email.enabled}
                  onCheckedChange={(checked) => handleNotificationChange('email', checked)}
                  disabled={loading}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive browser push notifications
                  </p>
                </div>
                <Switch
                  checked={settings?.notifications.push.enabled}
                  onCheckedChange={(checked) => handleNotificationChange('push', checked)}
                  disabled={loading}
                />
              </div>

              {settings?.notifications.email.enabled && (
                <div className="space-y-2">
                  <Label>Email Recipients</Label>
                  <Input
                    placeholder="Enter email addresses"
                    value={settings.notifications.email.recipients.join(', ')}
                    onChange={(e) => 
                      updateSettings({
                        notifications: {
                          ...settings.notifications,
                          email: {
                            ...settings.notifications.email,
                            recipients: e.target.value.split(',').map(email => email.trim())
                          }
                        }
                      })
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Separate multiple email addresses with commas
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Motion Detection</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable motion detection alerts
                  </p>
                </div>
                <Switch
                  checked={settings?.security.motionDetectionEnabled}
                  onCheckedChange={(checked) => handleSecurityChange('motionDetectionEnabled', checked)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label>Device Offline Threshold</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={30}
                    max={3600}
                    value={settings?.security.deviceOfflineThreshold}
                    onChange={(e) => handleSecurityChange('deviceOfflineThreshold', parseInt(e.target.value))}
                    disabled={loading}
                    className="max-w-[120px]"
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Time before a device is considered offline (30-3600 seconds)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
