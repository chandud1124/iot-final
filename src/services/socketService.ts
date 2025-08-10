import { io, Socket } from 'socket.io-client';
import { Device } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor() {
    const RAW_SOCKET_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    const SOCKET_URL = RAW_SOCKET_URL.includes('30011')
      ? RAW_SOCKET_URL.replace('30011', '3001')
      : RAW_SOCKET_URL;
    if (SOCKET_URL !== RAW_SOCKET_URL) {
      // eslint-disable-next-line no-console
      console.warn('[socket] Overriding outdated socket URL', RAW_SOCKET_URL, '->', SOCKET_URL);
    }
    
  // Connect to base namespace now that /test service removed
  this.socket = io(`${SOCKET_URL}`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity
    });

    this.setupDefaultListeners();
  }

  private setupDefaultListeners() {
    this.socket?.on('connect', () => {
      console.log('Socket connected');
      this.emit('client_connected', { timestamp: new Date() });
    });

    this.socket?.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket?.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  // Generic event listener
  public on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    this.socket?.on(event, callback as any);
  }

  // Remove event listener
  public off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
    this.socket?.off(event, callback as any);
  }

  // Emit event
  public emit(event: string, data: any) {
    this.socket?.emit(event, data);
  }

  // Device specific events
  public onDeviceStateChanged(callback: (data: { deviceId: string; state: Device }) => void) {
    this.on('device_state_changed', callback);
  }

  public onDevicePirTriggered(callback: (data: { deviceId: string; triggered: boolean }) => void) {
    this.on('device_pir_triggered', callback);
  }

  public onDeviceConnected(callback: (data: { deviceId: string }) => void) {
    this.on('device_connected', callback);
  }

  public onDeviceDisconnected(callback: (data: { deviceId: string }) => void) {
    this.on('device_disconnected', callback);
  }

  // Send command to device
  public sendDeviceCommand(deviceId: string, command: any) {
    this.emit('device_command', { deviceId, command });
  }

  // Clean up
  public disconnect() {
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket?.off(event, callback as any);
      });
    });
    this.listeners.clear();
    this.socket?.disconnect();
  }
}

// Create a singleton instance
const socketService = new SocketService();
export default socketService;
