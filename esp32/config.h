
#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
#define WIFI_SSID "AIMS-WIFI"
#define WIFI_PASSWORD "Aimswifi#2025"

// Server Configuration
// For local dev: use your machine's LAN IP and port 3001 (ws)
// For cloud (Render): use your Render hostname and port 443 (wss)
#define WEBSOCKET_HOST "smart-classroom-1wus.onrender.com"   // e.g., "smart-classroom-1wus.onrender.com"
#define WEBSOCKET_PORT 443               // 3001 for local ws, 443 for cloud wss
// Raw WebSocket endpoint path (matches backend server.js)
#define WEBSOCKET_PATH "/esp32-ws"

// Secure WebSocket (wss) toggle. Set to 1 when connecting to cloud over TLS (port 443)
#ifndef USE_SECURE_WS
#define USE_SECURE_WS 1
#endif
// If you don't want to manage root CA, set to 1 to skip certificate validation (less secure)
#ifndef WS_INSECURE_TLS
#define WS_INSECURE_TLS 1
#endif

// Device Configuration
#define DEVICE_NAME "ESP32 Room Controller"
#define FIRMWARE_VERSION "v1.2.0"

// Debug Configuration
#define SERIAL_BAUD_RATE 115200
#define ENABLE_DEBUG_LOGS true

// EEPROM Configuration
#define EEPROM_SIZE 512
#define CONFIG_VERSION 2  // Incremented to invalidate old stored config

// Switch Configuration
#define MAX_SWITCHES 8
#define SWITCH_NAME_LENGTH 32
#define RESERVED_GPIO_START 6
#define RESERVED_GPIO_END 11

// PIR Configuration
#define PIR_AUTO_OFF_DELAY 30  // Default 30 seconds if not configured
#define PIR_DEBOUNCE_TIME 2000 // 2 seconds debounce time

// GPIO Pin Configuration
// Note: Modify these according to your ESP32 board and wiring
// Make sure pins don't conflict with built-in functions

// Available GPIO pins for ESP32:
// Output pins: 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27
// Input pins: 0, 1, 3, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39

// PIR sensor recommended pins: 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39

// Stagger relay outputs on config apply to avoid current surge/brownout resets
#ifndef STAGGER_ON_CONFIG
#define STAGGER_ON_CONFIG 1
#endif
#ifndef STAGGER_RELAY_APPLY_MS
#define STAGGER_RELAY_APPLY_MS 80  // apply each relay change with this spacing
#endif


// --- Offline Fallback: Manual switch works when ESP32 is offline ---
#ifndef ENABLE_OFFLINE_FALLBACK
#define ENABLE_OFFLINE_FALLBACK 0 // Set to 0 to disable offline manual switch fallback
#endif
// Fallback pins are now disabled. ESP32 will use only backend config for switch assignments.

#endif
