
export interface Device {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  status: 'online' | 'offline';
  switches: Switch[];
  pirEnabled: boolean;
  pirGpio?: number;
  pirAutoOffDelay?: number;
  pirSensor?: PirSensor;
  lastSeen: Date;
  location?: string;
  classroom?: string;
  assignedUsers?: string[];
}

export interface Switch {
  id: string;
  name: string;
  // Primary GPIO used by backend model; keep optional to avoid breaking existing code paths
  gpio?: number;
  relayGpio: number;
  state: boolean;
  type: 'relay' | 'light' | 'fan' | 'outlet' | 'projector' | 'ac';
  icon?: string;
  manualSwitchEnabled: boolean;
  manualSwitchGpio?: number;
  manualMode?: 'maintained' | 'momentary';
  manualActiveLow?: boolean;
  usePir: boolean;
  schedule?: Schedule[];
  powerConsumption?: number;
  dontAutoOff?: boolean;
}

export interface PirSensor {
  id: string;
  name: string;
  gpio: number;
  isActive: boolean;
  triggered: boolean;
  sensitivity: number;
  timeout: number; // auto-off timeout in seconds
  linkedSwitches: string[]; // switch IDs
  schedule?: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  type: 'daily' | 'weekly' | 'once';
  time: string;
  days?: number[]; // 0-6, Sunday to Saturday
  action: 'on' | 'off';
  duration?: number; // auto-off after X minutes
  checkHolidays?: boolean;
  respectMotion?: boolean;
  timeoutMinutes?: number;
  switches: Array<{ deviceId: string; switchId: string }>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'faculty' | 'security' | 'student';
  department: string;
  accessLevel: 'full' | 'limited';
  isActive: boolean;
  assignedDevices: string[];
  lastLogin: Date;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  deviceName: string;
  switchId?: string;
  switchName?: string;
  action: 'on' | 'off' | 'toggle' | 'created' | 'updated' | 'deleted';
  triggeredBy: 'user' | 'schedule' | 'pir' | 'master' | 'system';
  userId?: string;
  userName?: string;
  classroom: string;
  location: string;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  duration?: number;
  powerConsumption?: number;
  metadata?: any;
}

export interface SecurityAlert {
  id: string;
  deviceId: string;
  deviceName: string;
  location: string;
  classroom: string;
  message: string;
  type: 'timeout' | 'unauthorized_access' | 'device_offline' | 'motion_override';
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  metadata?: any;
}

export interface Holiday {
  id: string;
  name: string;
  date: Date;
  type: 'college' | 'national' | 'religious' | 'google';
  createdBy?: string;
}

export interface DeviceConfig {
  switches: Array<{
    gpio: number;
    name: string;
    type: string;
    hasManualSwitch: boolean;
    manualSwitchGpio?: number;
    dontAutoOff?: boolean;
  }>;
  pirSensor?: {
    gpio: number;
    name: string;
    sensitivity: number;
    timeout: number;
  };
  updateInterval: number;
  otaEnabled: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DeviceStats {
  totalDevices: number;
  onlineDevices: number;
  totalSwitches: number;
  activeSwitches: number;
  totalPirSensors: number;
  activePirSensors: number;
}
