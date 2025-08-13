
// Environment configuration
export const config = {
  // API Configuration (normalized to 3001 default)
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001',
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3001',
  
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
