#ifndef FUNCTIONS_H
#define FUNCTIONS_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include "config.h"

// External declarations for variables defined in main.cpp
extern WebSocketsClient webSocket;
extern bool* switchStates;
extern DeviceConfig config;
extern bool lastPirState;
extern unsigned long lastPirTrigger;

// Function declarations
void sendStateUpdate();
void updateSwitch(int index, bool state);
void handlePirSensor();
void handleManualSwitches();
void handleWebSocketMessage(uint8_t* payload);
void saveConfigToEEPROM();
void loadConfigFromEEPROM();

#endif // FUNCTIONS_H
