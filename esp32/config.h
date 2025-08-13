
#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
#define WIFI_SSID "I am Not A Witch I am Your Wifi"
#define WIFI_PASSWORD "Whoareu@0000"

// Server Configuration
#define WEBSOCKET_HOST "192.168.1.100"  // Replace with your computer's IP address
#define WEBSOCKET_PORT 3001  // Updated to match backend server port
// Raw WebSocket endpoint path (matches backend server.js)
#define WEBSOCKET_PATH "/esp32-ws"

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

#endif
