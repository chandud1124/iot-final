#include "functions.h"

void sendStateUpdate() {
    DynamicJsonDocument doc(1024);
    doc["type"] = "state_update";
    doc["macAddress"] = WiFi.macAddress();
    
    JsonArray switchesArray = doc.createNestedArray("switches");
    for (size_t i = 0; i < config.numSwitches; i++) {
        JsonObject switchObj = switchesArray.createNestedObject();
        switchObj["id"] = i;
        switchObj["name"] = config.switches[i].name;
        switchObj["state"] = switchStates[i];
        switchObj["gpio"] = config.switches[i].gpio;
        switchObj["type"] = config.switches[i].type;
    }
    
    if (config.pirEnabled) {
        doc["pir"]["enabled"] = true;
        doc["pir"]["triggered"] = digitalRead(config.pirGpio) == HIGH;
        doc["pir"]["gpio"] = config.pirGpio;
        doc["pir"]["autoOffDelay"] = config.pirAutoOffDelay;
    } else {
        doc["pir"]["enabled"] = false;
    }
    
    doc["rssi"] = WiFi.RSSI();
    doc["timestamp"] = millis();
    
    String json;
    serializeJson(doc, json);
    webSocket.sendTXT(json);

void updateSwitch(int index, bool state) {
    if (index >= 0 && index < config.numSwitches) {
        switchStates[index] = state;
        digitalWrite(config.switches[index].gpio, state ? HIGH : LOW);
        sendStateUpdate();
    }
}

void handlePirSensor() {
    if (!config.pirEnabled) return;
    
    bool currentPirState = digitalRead(config.pirGpio) == HIGH;
    unsigned long currentMillis = millis();
    
    if (currentPirState != lastPirState && 
        (currentMillis - lastPirTrigger) > PIR_DEBOUNCE_TIME) {
        
        lastPirState = currentPirState;
        lastPirTrigger = currentMillis;
        
        DynamicJsonDocument doc(512);
        doc["type"] = "pir_event";
        doc["macAddress"] = WiFi.macAddress();
        doc["triggered"] = pirState;
        doc["timestamp"] = currentMillis;
        
        String json;
        serializeJson(doc, json);
        webSocket.sendTXT(json);
        
        // If motion detected and PIR is enabled, turn on linked switches
        if (pirState) {
            Serial.println("Motion detected!");
            // Update switches based on PIR trigger
            for (int i = 0; i < 4; i++) {
                if (!relayStates[i]) {  // Only turn on if currently off
                    updateSwitch(i, true);
                }
            }
        }
    }
}

void checkManualSwitches() {
    for (int i = 0; i < 4; i++) {
        bool currentState = digitalRead(MANUAL_SWITCH_PINS[i]) == HIGH;
        if (currentState != relayStates[i]) {
            relayStates[i] = currentState;
            digitalWrite(RELAY_PINS[i], currentState ? HIGH : LOW);
            manualOverride[i] = true;  // Set manual override flag
            sendStateUpdate();
        }
    }
}
