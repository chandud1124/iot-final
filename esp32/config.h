#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ---------------- WiFi ----------------
#define WIFI_SSID       "AIMS-WIFI"
#define WIFI_PASSWORD   "Aimswifi#2025"

// ---------------- WebSocket ----------------
#define WEBSOCKET_HOST  "smart-classroom-1wus.onrender.com"
#define WEBSOCKET_PORT  443
#define WEBSOCKET_PATH  "/esp32-ws"
#define DEVICE_SECRET_KEY "9545c46f0f9f494a27412fce1f5b22095550c4e88d82868f"

// ---------------- Pins ----------------
#define LED_PIN 2                // Built-in LED on most ESP32 dev boards
#define MAX_SWITCHES 6

// Most ESP32 relay boards are ACTIVE LOW
#ifndef RELAY_ACTIVE_LOW
#define RELAY_ACTIVE_LOW 1
#endif
#if RELAY_ACTIVE_LOW
  #define RELAY_ON_LEVEL  LOW
  #define RELAY_OFF_LEVEL HIGH
#else
  #define RELAY_ON_LEVEL  HIGH
  #define RELAY_OFF_LEVEL LOW
#endif

// ---------------- Timers ----------------
#define WIFI_RETRY_INTERVAL_MS   3000
#define HEARTBEAT_INTERVAL_MS   15000
#define DEBOUNCE_MS               80

// ---------------- Default switch map (factory) ----------------
struct SwitchConfig {
  int relayPin;
  int manualPin;
  String name;
  bool manualActiveLow; // true if LOW = ON (closed)
};

// Default/factory configuration
static const SwitchConfig defaultSwitchConfigs[MAX_SWITCHES] = {
  { 4, 25, "Fan1",       true},
  {16, 27, "Fan2",       true},
  {17, 32, "Light1",     true},
  { 5, 33, "Light2",     true},
  {19, 12, "Projector",  true},
  {18, 14, "NComputing", true}
};

#endif