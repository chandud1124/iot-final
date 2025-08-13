import { io, Socket } from 'socket.io-client';
import { Device } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor() {
  const RAW_SOCKET_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    // If env base includes /api (used for REST), strip it for Socket.IO root namespace
    let derived = RAW_SOCKET_URL.replace(/\/$/, '');
    if (/\/api$/.test(derived)) {
      derived = derived.replace(/\/api$/, '');
    }
    const SOCKET_URL = derived.includes('30011')
      ? derived.replace('30011', '3001')
      : derived;
    if (SOCKET_URL !== RAW_SOCKET_URL) {
      // eslint-disable-next-line no-console
      console.warn('[socket] Overriding outdated socket URL', RAW_SOCKET_URL, '->', SOCKET_URL);
    }
    
  // Connect to base namespace now that /test service removed
  this.socket = io(`${SOCKET_URL}`, {
      transports: ['polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
      forceNew: false,
      upgrade: false,
      path: '/socket.io'
    });

    // Quick version / debug info
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require('socket.io-client/package.json');
      // eslint-disable-next-line no-console
      console.log(`[socket] client version ${pkg.version} connecting to ${SOCKET_URL}`);
    } catch {/* ignore */}

    this.setupDefaultListeners();
  }

  private setupDefaultListeners() {
    this.socket?.on('connect', () => {
      console.log('Socket connected (transport=' + (this.socket as any)?.io?.engine?.transport?.name + ')');
      this.emit('client_connected', { timestamp: new Date() });
  // Intentionally keep polling only (manual upgrade disabled)
  console.log('[socket] staying on polling transport (manual upgrade disabled)');
    });

    this.socket?.on('connect_error', (err) => {
      console.warn('[socket] connect_error', err.message, 'transport=', (this.socket as any)?.io?.engine?.transport?.name);
    });

    this.socket?.on('disconnect', (reason) => {
      console.log('Socket disconnected', reason);
    });
    (this.socket?.io as any).on('reconnect_attempt', (attempt: number) => {
      console.log('[socket] reconnect_attempt', attempt);
    });
    this.socket?.on('close', (desc: any) => {
      console.log('[socket] close event', desc);
    });

    this.socket?.on('error', (error) => {
      console.error('Socket error:', error, 'transport=', (this.socket as any)?.io?.engine?.transport?.name);
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

  public onDeviceToggleBlocked(callback: (data: { deviceId: string; switchId: string; reason: string; requestedState?: boolean; timestamp: number }) => void) {
    this.on('device_toggle_blocked', callback);
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

  public isConnected(): boolean {
    return !!this.socket?.connected;
  }
}

// Create a singleton instance
const socketService = new SocketService();
export default socketService;
