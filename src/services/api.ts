
import axios from 'axios';

// Default backend port adjusted to 3001 (previous fallback 30011 caused connection errors)
const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
// Safety: if environment still points to deprecated port 30011, transparently switch to 3001
const API_BASE_URL = RAW_API_BASE_URL.includes('30011')
  ? RAW_API_BASE_URL.replace('30011', '3001')
  : RAW_API_BASE_URL;

if (RAW_API_BASE_URL !== API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[api] Overriding outdated API base URL', RAW_API_BASE_URL, '->', API_BASE_URL);
}
// eslint-disable-next-line no-console
console.info('[api] Using API base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true
});

// Helper to get backend origin (strip trailing /api)
export const getBackendOrigin = () => API_BASE_URL.replace(/\/api\/?$/, '');

// Normalize any accidental double /api prefixes (e.g., request to /api/devices when baseURL already ends with /api)
api.interceptors.request.use((config) => {
  if (config.url) {
    // Replace leading /api/ with / if baseURL already ends with /api
    if (API_BASE_URL.endsWith('/api') && config.url.startsWith('/api/')) {
      config.url = config.url.replace(/^\/api\//, '/');
    }
    // Guard against resulting // paths
    config.url = config.url.replace(/\/\//g, '/');
  }
  return config;
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  console.error('Request interceptor error:', error);
  return Promise.reject(error);
});

// Authentication API endpoints
// (Removed duplicate authAPI declaration)

// Consolidated response interceptor (avoid duplicate logic)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest: any = error.config || {};
    const status = error.response?.status;
    const path = (originalRequest?.url || '').toString();

    // Helper: log once
    const debugPayload = {
      status,
      data: error.response?.data,
      message: error.message,
      url: path,
      method: originalRequest.method,
    };
    // eslint-disable-next-line no-console
    console.error('API Error:', debugPayload);

    // If 401 during explicit login/register attempt -> just reject so UI can show error (NO redirect)
    if (status === 401 && /\/auth\/(login|register)/.test(path)) {
      return Promise.reject(error.response?.data || error);
    }

    // Token expired flow (single retry)
    if (status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const refreshResp = await axios.post(`${API_BASE_URL}/auth/refresh-token`, { refreshToken });
          if (refreshResp.data?.token) {
            localStorage.setItem('auth_token', refreshResp.data.token);
            api.defaults.headers.common['Authorization'] = `Bearer ${refreshResp.data.token}`;
            return api(originalRequest);
          }
        }
      } catch (refreshErr) {
        // eslint-disable-next-line no-console
        console.warn('Token refresh failed, clearing session');
      }
    }

    // Generic unauthorized (not login/register) -> clear & soft redirect only if a token had existed
    if (status === 401) {
      const hadToken = !!localStorage.getItem('auth_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      if (hadToken && window.location.pathname !== '/login') {
        // SPA friendly redirect
        window.history.replaceState({}, '', '/login');
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

// Settings types
export interface NotificationSettings {
  email: {
    enabled: boolean;
    recipients: string[];
  };
  push: {
    enabled: boolean;
  };
}

export interface SecuritySettings {
  deviceOfflineThreshold: number;
  motionDetectionEnabled: boolean;
}

export interface Settings {
  notifications: NotificationSettings;
  security: SecuritySettings;
  created: string;
  lastModified: string;
}

// Settings API endpoints
// Settings endpoints (baseURL already ends with /api)
export const getSettings = () => api.get<Settings>('/settings');

export const updateSettings = (settings: Partial<Settings>) => 
  api.put<Settings>('/settings', settings);

// (Removed second duplicate response interceptor to prevent double handling / forced reloads)

// Device REST API endpoints
export const deviceAPI = {
  // Old deviceAPI methods
  updateStatus: (deviceId: string, status: any) =>
    api.post<{ success: boolean; device: any }>(`/device-api/${deviceId}/status`, status),

  sendCommand: (deviceId: string, command: { type: string, payload: any }) =>
    api.post<{ success: boolean }>(`/device-api/${deviceId}/command`, { command }),

  getCommands: (deviceId: string) =>
    api.get<{ commands: Array<{ type: string, payload: any }> }>(`/device-api/${deviceId}/commands`),

  // New deviceAPI methods
  getAllDevices: () => api.get('/devices'),
  
  createDevice: (deviceData: any) => api.post('/devices', deviceData),
  
  updateDevice: (deviceId: string, updates: any) => 
    api.put(`/devices/${deviceId}`, updates),
  
  deleteDevice: (deviceId: string) => api.delete(`/devices/${deviceId}`),
  
  toggleSwitch: (deviceId: string, switchId: string, state?: boolean) =>
    api.post(`/devices/${deviceId}/switches/${switchId}/toggle`, { state }),
  bulkToggle: (state: boolean) => api.post('/devices/bulk-toggle', { state }),
  bulkToggleByType: (type: string, state: boolean) => api.post(`/devices/bulk-toggle/type/${type}`, { state }),
  bulkToggleByLocation: (location: string, state: boolean) => api.post(`/devices/bulk-toggle/location/${encodeURIComponent(location)}`, { state }),
  
  getStats: () => api.get('/devices/stats'),
  // Secure admin-only: fetch single device with secret (?includeSecret=1)
  getDeviceWithSecret: (deviceId: string, pin?: string) =>
    api.get(`/devices/${deviceId}`, { params: { includeSecret: 1, secretPin: pin } }),
};

export const authAPI = {
  // Helper to build auth endpoint without risking double /api
  _url: (path: string) => `/auth${path}`.replace(/\/{2,}/g,'/'),
  login: (credentials: { email: string; password: string }) =>
    api.post('/auth/login', credentials),
  
  register: (userData: { name: string; email: string; password: string; role: string; department: string }) =>
    api.post('/auth/register', userData),
  
  getProfile: () => api.get('/auth/profile'),
  
  logout: () => api.post('/auth/logout'),

  updateProfile: (data: { 
    name?: string; 
    email?: string; 
    currentPassword?: string; 
    newPassword?: string;
  }) => api.put('/auth/profile', data),

  deleteAccount: () => api.delete('/auth/profile'),

  forgotPassword: (email: string) => 
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
};

export const scheduleAPI = {
  getAllSchedules: () => api.get('/schedules'),
  
  createSchedule: (scheduleData: any) => api.post('/schedules', scheduleData),
  
  updateSchedule: (scheduleId: string, updates: any) =>
    api.put(`/schedules/${scheduleId}`, updates),
  
  deleteSchedule: (scheduleId: string) => api.delete(`/schedules/${scheduleId}`),
  
  toggleSchedule: (scheduleId: string) => api.put(`/schedules/${scheduleId}/toggle`),
  runNow: (scheduleId: string) => api.post(`/schedules/${scheduleId}/run`),
};

export const activityAPI = {
  getActivities: (filters?: any) => api.get('/activities', { params: filters }),
  
  getDeviceActivities: (deviceId: string) => api.get(`/activities/device/${deviceId}`),
  
  getUserActivities: (userId: string) => api.get(`/activities/user/${userId}`),
};

export const securityAPI = {
  getAlerts: () => api.get('/security/alerts'),
  
  acknowledgeAlert: (alertId: string) => api.put(`/security/alerts/${alertId}/acknowledge`),
  
  createAlert: (alertData: any) => api.post('/security/alerts', alertData),
};

export default api;
