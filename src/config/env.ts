
// Environment configuration
export const config = {
  // API Configuration
  // Prefer VITE_API_URL; if absent, derive from current origin (prod) or localhost in dev.
  apiBaseUrl: (() => {
    const fromEnv = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_API_BASE_URL || '';
    let url = fromEnv;
    if (!url) {
      try {
        const origin = window?.location?.origin;
        if (origin && !/localhost|127\.0\.0\.1/.test(origin)) {
          url = origin;
        }
      } catch { /* ignore */ }
    }
    if (!url) url = 'http://localhost:3001';
    // Ensure trailing /api for REST base
    if (!/\/api\/?$/.test(url)) url = url.replace(/\/+$/, '') + '/api';
    return url;
  })(),
  websocketUrl: (() => {
    // Explicit override if provided
    const wsEnv = (import.meta.env as any).VITE_WEBSOCKET_URL;
    if (wsEnv) return wsEnv;
    // Derive from apiBaseUrl by stripping /api
    try {
      const httpBase = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_API_BASE_URL || '';
      let base = httpBase || window?.location?.origin || 'http://localhost:3001';
      base = base.replace(/\/+$/, '').replace(/\/api$/, '');
      // Normalize protocol to ws/wss
      if (base.startsWith('https://')) return 'wss://' + base.slice('https://'.length);
      if (base.startsWith('http://')) return 'ws://' + base.slice('http://'.length);
      return base;
    } catch { return 'ws://localhost:3001'; }
  })(),
  
  // Application Settings
  appName: import.meta.env.VITE_APP_NAME || 'IoT College Automation',
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
  
  // Development Settings
  isDevelopment: import.meta.env.DEV,
  debugMode: import.meta.env.VITE_DEBUG_MODE === 'true',
  logLevel: import.meta.env.VITE_LOG_LEVEL || 'info',
  
  // Theme Settings
  defaultTheme: import.meta.env.VITE_DEFAULT_THEME || 'dark',
  
  // Authentication
  authProvider: import.meta.env.VITE_AUTH_PROVIDER || 'jwt',
  
  // ESP32 Configuration
  esp32: {
    defaultPort: 80,
    maxRetries: 3,
    timeout: 5000,
    updateInterval: 30000, // 30 seconds
  },
  
  // GPIO Pin Definitions
  gpio: {
    availableOutputPins: [2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27],
    availableInputPins: [0, 1, 3, 6, 7, 8, 9, 10, 11, 20, 24, 28, 29, 30, 31, 32, 33, 34, 35, 36, 39],
    pirRecommendedPins: [16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39],
  }
};

export default config;
