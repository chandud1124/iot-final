import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import socketService from '@/services/socketService';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TestMessage {
  type: string;
  content: string;
  timestamp: string;
}

const TestComponent = () => {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    // Listen for connection events
    socketService.on('connect', () => {
      setConnectionStatus('connected');
      addMessage('system', 'Connected to server');
    });

    socketService.on('disconnect', () => {
      setConnectionStatus('disconnected');
      addMessage('system', 'Disconnected from server');
    });

    // Listen for test events
    socketService.on('test_event', (data: any) => {
      addMessage('received', `Received: ${JSON.stringify(data)}`);
    });

    socketService.on('device_state_changed', (data: any) => {
      addMessage('device', `Device state changed: ${JSON.stringify(data)}`);
    });

    socketService.on('device_pir_triggered', (data: any) => {
      addMessage('pir', `PIR triggered: ${JSON.stringify(data)}`);
    });

    return () => {
      socketService.disconnect();
    };
  }, []);

  const addMessage = (type: string, content: string) => {
    setMessages(prev => [...prev, {
      type,
      content,
      timestamp: new Date().toISOString()
    }]);
  };

  const sendTestMessage = () => {
    socketService.emit('test_message', {
      message: 'Hello from client!',
      timestamp: new Date().toISOString()
    });
    addMessage('sent', 'Test message sent');
  };

  const simulateDeviceMessage = () => {
    socketService.emit('device_command', {
      deviceId: 'test-device-1',
      command: {
        type: 'switch',
        switchId: 'sw1',
        action: 'toggle'
      }
    });
    addMessage('sent', 'Device command sent');
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>WebSocket Test Panel</CardTitle>
          <CardDescription>
            Test WebSocket communication between frontend, backend, and devices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Connection Status</h3>
            <Badge 
              variant={connectionStatus === 'connected' ? 'default' : 'destructive'}
            >
              {connectionStatus}
            </Badge>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Actions</h3>
            <div className="space-x-2">
              <Button onClick={sendTestMessage}>
                Send Test Message
              </Button>
              <Button onClick={simulateDeviceMessage}>
                Simulate Device Command
              </Button>
              <Button variant="outline" onClick={clearMessages}>
                Clear Messages
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Messages</h3>
            <div className="h-[300px] overflow-y-auto border rounded-lg p-2">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`mb-2 p-2 rounded ${
                    msg.type === 'system' ? 'bg-gray-100' :
                    msg.type === 'sent' ? 'bg-blue-100' :
                    msg.type === 'received' ? 'bg-green-100' :
                    msg.type === 'device' ? 'bg-purple-100' :
                    msg.type === 'pir' ? 'bg-yellow-100' : ''
                  }`}
                >
                  <div className="text-sm text-gray-500">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                  <div>{msg.content}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-gray-500">
            All WebSocket events will be logged here
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default TestComponent;
