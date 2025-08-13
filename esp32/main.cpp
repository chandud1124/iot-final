// Legacy sketch disabled to avoid conflicts with websocket_example.cpp.
// If you intend to use this file, remove the #if 0 and ensure only one main is compiled.
#if 0
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include "config.h"

// Configuration structure
struct SwitchConfig {
    char name[SWITCH_NAME_LENGTH];
    uint8_t gpio;
    char type[16];
};

struct DeviceConfig {
    uint8_t version;
    uint8_t numSwitches;
    bool pirEnabled;
    uint8_t pirGpio;
    uint16_t pirAutoOffDelay;
    SwitchConfig switches[MAX_SWITCHES];
};

// Global variables
WebSocketsClient webSocket;
const char* websocketHost = WEBSOCKET_HOST;
const int websocketPort = WEBSOCKET_PORT;
const char* websocketPath = WEBSOCKET_PATH;

// Helper: locate switch index by gpio
int findSwitchIndexByGpio(int gpio) {
  for (int i = 0; i < config.numSwitches; i++) {
    if (config.switches[i].gpio == gpio) return i;
  }
  return -1;
}

void emitSwitchResult(int gpio, bool requested, bool success, const char* reason = nullptr) {
  DynamicJsonDocument doc(256);
  doc["type"] = "switch_result";
  doc["gpio"] = gpio;
  doc["success"] = success;
  doc["requestedState"] = requested;
  if (success) {
    int idx = findSwitchIndexByGpio(gpio);
    if (idx >= 0) doc["actualState"] = switchStates[idx];
  } else {
    doc["reason"] = reason ? reason : "failed";
  }
  String json; serializeJson(doc, json);
  webSocket.sendTXT(json);
}

void applySwitchGpio(int gpio, bool state, bool requestedFromServer = true) {
  int idx = findSwitchIndexByGpio(gpio);
  if (idx < 0) {
    Serial.printf("[switch] Unknown gpio %d\n", gpio);
    emitSwitchResult(gpio, state, false, "unknown_gpio");
    return;
  }
  bool prev = switchStates[idx];
  switchStates[idx] = state;
  digitalWrite(config.switches[idx].gpio, state ? HIGH : LOW);
  if (prev != state) {
    Serial.printf("[switch] GPIO %d -> %s\n", gpio, state ? "ON" : "OFF");
    sendStateUpdate();
  }
  if (requestedFromServer) emitSwitchResult(gpio, state, true);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("Disconnected from WebSocket!");
      break;
    case WStype_CONNECTED: {
      Serial.println("Connected to WebSocket server");
      DynamicJsonDocument doc(200);
      doc["type"] = "authenticate"; // backend accepts 'authenticate'
      doc["macAddress"] = WiFi.macAddress();
      String json; serializeJson(doc, json);
      webSocket.sendTXT(json);
      // Immediately publish current state snapshot
      sendStateUpdate();
      break;
    }
    case WStype_TEXT: {
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload, length);
      if (error) {
        Serial.println("JSON parsing failed!");
        return;
      }
      const char* mtype = doc["type"] | "";
      if (strcmp(mtype, "switch_command") == 0) {
        // Backend sends gpio & state
        int gpio = doc["gpio"] | -1;
        bool state = doc["state"] | false;
        if (gpio == -1) {
          Serial.println("[switch_command] missing gpio");
          return;
        }
        applySwitchGpio(gpio, state, true);
      } else if (strcmp(mtype, "config_update") == 0) {
        updateConfig(doc);
        Serial.println("[config_update] applied new configuration");
      }
      break;
    }
    default:
      break;
  }
}

// State variables
DeviceConfig config;
bool* switchStates;  // Dynamically allocated based on numSwitches
bool lastPirState = false;
unsigned long lastPirTrigger = 0;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds

void setupWebSocket() {
    webSocket.begin(websocketHost, websocketPort, websocketPath);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

void loadConfig() {
    EEPROM.begin(EEPROM_SIZE);
    EEPROM.get(0, config);
    EEPROM.end();

    // Check if config is valid
    if (config.version != CONFIG_VERSION || config.numSwitches > MAX_SWITCHES) {
        // Initialize default config
        config.version = CONFIG_VERSION;
        config.numSwitches = 0;
        config.pirEnabled = false;
        config.pirGpio = 0;
        config.pirAutoOffDelay = PIR_AUTO_OFF_DELAY;
    }

    // Allocate state arrays
    if (switchStates != nullptr) {
        delete[] switchStates;
    }
    switchStates = new bool[config.numSwitches]();
}

void saveConfig() {
    EEPROM.begin(EEPROM_SIZE);
    EEPROM.put(0, config);
    EEPROM.commit();
    EEPROM.end();
}

void updateConfig(const JsonDocument& doc) {
    if (doc.containsKey("pirEnabled")) {
        config.pirEnabled = doc["pirEnabled"].as<bool>();
    }
    if (doc.containsKey("pirGpio")) {
        config.pirGpio = doc["pirGpio"].as<uint8_t>();
    }
    if (doc.containsKey("pirAutoOffDelay")) {
        config.pirAutoOffDelay = doc["pirAutoOffDelay"].as<uint16_t>();
    }
  if (doc.containsKey("switches")) {
    JsonArray switches = doc["switches"];
    config.numSwitches = min((size_t)MAX_SWITCHES, switches.size());

    // Reallocate state array first
    if (switchStates != nullptr) {
      delete[] switchStates;
    }
    switchStates = new bool[config.numSwitches]();

    for (size_t i = 0; i < config.numSwitches; i++) {
      JsonObject sw = switches[i];
      strlcpy(config.switches[i].name, sw["name"] | "", SWITCH_NAME_LENGTH);
      // Prefer relayGpio from backend if provided, fallback to gpio
      int gpio = sw.containsKey("relayGpio") ? (int)sw["relayGpio"].as<int>() : (int)(sw["gpio"] | 0);
      config.switches[i].gpio = (uint8_t)gpio;
      strlcpy(config.switches[i].type, sw["type"] | "relay", 16);
      // Apply initial state from config if present
      bool st = sw.containsKey("state") ? sw["state"].as<bool>() : false;
      switchStates[i] = st;
    }
  }
    
    saveConfig();
  // Initialize pins and drive outputs to current switchStates using relay polarity
  for (size_t i = 0; i < config.numSwitches; i++) {
    pinMode(config.switches[i].gpio, OUTPUT);
    bool st = (i < config.numSwitches) ? switchStates[i] : false;
  digitalWrite(config.switches[i].gpio, st ? HIGH : LOW);
  }
}

void updateSwitch(int index, bool state) {
    if (index >= 0 && index < config.numSwitches) {
        switchStates[index] = state;
  digitalWrite(config.switches[index].gpio, state ? HIGH : LOW);
        sendStateUpdate();
    }
}

void sendStateUpdate() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "state_update"; // required by backend
  doc["mac"] = WiFi.macAddress();
  JsonArray switchArray = doc.createNestedArray("switches");
  for (size_t i = 0; i < config.numSwitches; i++) {
    JsonObject switchObj = switchArray.createNestedObject();
    switchObj["gpio"] = config.switches[i].gpio;
    switchObj["state"] = switchStates[i];
  }
  String json; serializeJson(doc, json);
  webSocket.sendTXT(json);
}

void checkPirSensor() {
    if (!config.pirEnabled) return;
    
    bool currentPirState = digitalRead(config.pirGpio) == HIGH;
    unsigned long currentTime = millis();
    
    if (currentPirState != lastPirState && 
        (currentTime - lastPirTrigger) > PIR_DEBOUNCE_TIME) {
        
        DynamicJsonDocument doc(1024);
        doc["type"] = "pirEvent";
        doc["triggered"] = currentPirState;
        
        String json;
        serializeJson(doc, json);
        webSocket.sendTXT(json);
        
        lastPirState = currentPirState;
        lastPirTrigger = currentTime;

        // Auto-off timer will be handled by the backend
    }
}
#endif

void initializePins() {
    // Initialize switch pins
    for (size_t i = 0; i < config.numSwitches; i++) {
        pinMode(config.switches[i].gpio, OUTPUT);
  // Start with all switches OFF -> LOW
  digitalWrite(config.switches[i].gpio, LOW);
    }

    // Initialize PIR sensor if enabled
    if (config.pirEnabled) {
        pinMode(config.pirGpio, INPUT);
    }
}

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    
    // Load configuration from EEPROM
    switchStates = nullptr; // Initialize pointer
    loadConfig();
    
    // Initialize all configured pins
    initializePins();
    
    // Connect to WiFi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    
    Serial.println("\nConnected to WiFi");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("MAC Address: ");
    Serial.println(WiFi.macAddress());
    Serial.printf("[INIT] Backend target ws://%s:%d%s\n", BACKEND_HOST, BACKEND_PORT, WS_PATH);
    
    // Setup WebSocket connection
    setupWebSocket();
    
    Serial.println("Setup complete!");
  pinMode(LED_BUILTIN_PIN, OUTPUT);
  pinMode(PIR_SENSOR_PIN, INPUT);
  
  for (int i = 0; i < 4; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    pinMode(MANUAL_SWITCH_PINS[i], INPUT_PULLUP);
    digitalWrite(RELAY_PINS[i], LOW);
  }
  
  // Load configuration from EEPROM
  loadConfiguration();
  
  // Connect to WiFi
  connectWiFi();
  
  // Register device with server
  registerDevice();
  
  // Connect to WebSocket
  connectWebSocket();
  
  Serial.println("ESP32 Classroom Automation Device Ready");
}

void loop() {
    // Handle WebSocket connection
    webSocket.loop();

    // Check WiFi connection and reconnect if needed
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi connection lost. Reconnecting...");
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        delay(5000);  // Wait 5 seconds between reconnection attempts
        return;
    }

    // Process manual switch inputs
    checkManualSwitches();

    // Process PIR sensor if enabled
    if (config.pirEnabled) {
        handlePirSensor();
    }

    // Send heartbeat to server
    if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }
    static unsigned long lastStatus = 0;
    if (millis() - lastStatus > 5000) {
      lastStatus = millis();
      Serial.printf("[STATUS] WiFi=%s RSSI=%d WS=%s identified=%d switches=%u\n",
                    WiFi.status()==WL_CONNECTED?"OK":"DOWN", WiFi.RSSI(), ws.isConnected()?"CONNECTED":"DISCONNECTED", identified, (unsigned)switchesLocal.size());
      if (!ws.isConnected()) {
        // Library auto reconnects; we just note it
        Serial.println("[STATUS] Waiting for WebSocket connection...");
      } else if (!identified) {
        Serial.println("[STATUS] Connected but not identified yet (will retry)");
      }
    }
}

// Send device status update through WebSocket
void sendStatusUpdate(int switchId, bool state) {
    DynamicJsonDocument doc(256);
    doc["type"] = "status_update";
    doc["switchId"] = switchId;
    doc["state"] = state;
    
    String json;
    serializeJson(doc, json);
    webSocket.sendTXT(json);
}

// Send heartbeat message
void sendHeartbeat() {
    DynamicJsonDocument doc(128);
    doc["type"] = "heartbeat";
    doc["macAddress"] = WiFi.macAddress();
    doc["uptime"] = millis() / 1000; // Convert to seconds
    
    String json;
    serializeJson(doc, json);
    webSocket.sendTXT(json);
}
    lastHeartbeat = millis();
  }
  
  delay(100);
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("MAC address: ");
    Serial.println(WiFi.macAddress());
  } else {
    Serial.println("WiFi connection failed!");
    ESP.restart();
  }
}

void registerDevice() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/devices/register");
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(1024);
  doc["name"] = DEVICE_NAME;
  doc["ip"] = WiFi.localIP().toString();
  doc["mac"] = WiFi.macAddress();
  doc["location"] = DEVICE_LOCATION;
  doc["classroom"] = CLASSROOM_NAME;
  doc["firmware"] = FIRMWARE_VERSION;
  
  JsonArray switchesArray = doc.createNestedArray("switches");
  for (int i = 0; i < 4; i++) {
    JsonObject switchObj = switchesArray.createNestedObject();
    switchObj["id"] = "sw" + String(i + 1);
    switchObj["name"] = SWITCH_NAMES[i];
    switchObj["gpio"] = RELAY_PINS[i];
    switchObj["type"] = SWITCH_TYPES[i];
    switchObj["hasManualSwitch"] = true;
    switchObj["manualSwitchGpio"] = MANUAL_SWITCH_PINS[i];
  }
  
  if (HAS_PIR_SENSOR) {
    JsonObject pirObj = doc.createNestedObject("pirSensor");
    pirObj["id"] = "pir1";
    pirObj["name"] = "Motion Sensor";
    pirObj["gpio"] = PIR_SENSOR_PIN;
    pirObj["sensitivity"] = PIR_SENSITIVITY;
    pirObj["timeout"] = PIR_TIMEOUT;
    
    JsonArray linkedSwitches = pirObj.createNestedArray("linkedSwitches");
    for (int i = 0; i < 4; i++) {
      if (PIR_LINKED_SWITCHES[i]) {
        linkedSwitches.add("sw" + String(i + 1));
      }
    }
  }
  
  String requestBody;
  serializeJson(doc, requestBody);
  
  int httpResponseCode = http.POST(requestBody);
  
  if (httpResponseCode == 200 || httpResponseCode == 201) {
    String response = http.getString();
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    deviceId = responseDoc["data"]["id"].as<String>();
    authToken = responseDoc["token"].as<String>();
    
    // Save to EEPROM
    saveConfiguration();
    
    Serial.println("Device registered successfully!");
    Serial.println("Device ID: " + deviceId);
  } else {
    Serial.println("Device registration failed!");
    Serial.println("HTTP Response: " + String(httpResponseCode));
  }
  
  http.end();
}

void connectWebSocket() {
  webSocket.begin(WEBSOCKET_HOST, WEBSOCKET_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  
  // Send authentication after connection
  webSocket.onEvent([](WStype_t type, uint8_t * payload, size_t length) {
    if (type == WStype_CONNECTED) {
      DynamicJsonDocument doc(256);
      doc["type"] = "auth";
      doc["deviceId"] = deviceId;
      doc["token"] = authToken;
      
      String message;
      serializeJson(doc, message);
      webSocket.sendTXT(message);
    }
  });
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("WebSocket Disconnected!");
            digitalWrite(LED_BUILTIN_PIN, LOW); // Turn off LED to indicate disconnection
            break;
            
        case WStype_CONNECTED:
            {
                Serial.println("WebSocket Connected!");
                digitalWrite(LED_BUILTIN_PIN, HIGH); // Turn on LED to indicate connection
                
                // Send authentication
                DynamicJsonDocument doc(1024);
                doc["type"] = "auth";
                doc["macAddress"] = WiFi.macAddress();
                doc["deviceName"] = DEVICE_NAME;
                doc["location"] = DEVICE_LOCATION;
                doc["classroom"] = CLASSROOM_NAME;
                doc["firmwareVersion"] = FIRMWARE_VERSION;
                
                String json;
                serializeJson(doc, json);
                webSocket.sendTXT(json);
                
                // Send initial state
                sendStateUpdate();
            }
            break;
            
        case WStype_TEXT:
            {
                Serial.println("Received text: " + String((char*)payload));
                
                DynamicJsonDocument doc(1024);
                DeserializationError error = deserializeJson(doc, payload);
                
                if (error) {
                    Serial.println("deserializeJson() failed: " + String(error.c_str()));
                    return;
                }
                
                // Handle different command types
                const char* type = doc["type"];
                
                if (strcmp(type, "switch") == 0) {
                    int index = doc["switchId"].as<int>();
                    bool state = doc["state"].as<bool>();
                    
                    if (index >= 0 && index < 4) {
                        updateSwitch(index, state);
                    }
                }
                else if (strcmp(type, "allSwitches") == 0) {
                    bool state = doc["state"].as<bool>();
                    for (int i = 0; i < 4; i++) {
                        updateSwitch(i, state);
                    }
                }
                else if (strcmp(type, "pir") == 0) {
                    pirEnabled = doc["enabled"].as<bool>();
                }
            }
            break;
            
        case WStype_BIN:
        case WStype_ERROR:
        case WStype_FRAGMENT_TEXT_START:
        case WStype_FRAGMENT_BIN_START:
        case WStype_FRAGMENT:
        case WStype_FRAGMENT_FIN:
            break;
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("WebSocket Disconnected!");
            digitalWrite(LED_BUILTIN_PIN, LOW);
            break;
            
        case WStype_CONNECTED:
            {
                Serial.println("WebSocket Connected!");
                digitalWrite(LED_BUILTIN_PIN, HIGH);
                
                // Send authentication
                DynamicJsonDocument doc(1024);
                doc["macAddress"] = WiFi.macAddress();
                String json;
                serializeJson(doc, json);
                webSocket.sendTXT(json);
            }
            break;
            
        case WStype_TEXT:
            {
                // Parse incoming JSON
                DynamicJsonDocument doc(1024);
                DeserializationError error = deserializeJson(doc, payload);
                
                if (error) {
                    Serial.println("JSON parsing failed!");
                    return;
                }
                
                // Handle different command types
                const char* type = doc["type"];
                if (strcmp(type, "switch") == 0) {
                    int index = doc["index"];
                    bool state = doc["state"];
                    
                    if (index >= 0 && index < 4) {
                        updateSwitch(index, state);
                    }
                }
                else if (strcmp(type, "pir") == 0) {
                    pirEnabled = doc["enabled"];
                }
            }
            break;
    }
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket Disconnected");
      break;
      
    case WStype_CONNECTED:
      Serial.println("WebSocket Connected");
      break;
      
    case WStype_TEXT:
      handleWebSocketMessage((char*)payload);
      break;
      
    default:
      break;
  }
}

void handleWebSocketMessage(String message) {
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, message);
  
  String type = doc["type"];
  
  if (type == "switch_toggle") {
    String switchId = doc["switchId"];
    bool state = doc["state"];
    int switchIndex = switchId.substring(2).toInt() - 1; // Extract number from "sw1", "sw2", etc.
    
    if (switchIndex >= 0 && switchIndex < 4) {
      toggleRelay(switchIndex, state);
      
      // Send confirmation
      sendSwitchStateUpdate(switchIndex);
    }
  }
  else if (type == "get_status") {
    sendDeviceStatus();
  }
  else if (type == "ota_update") {
    performOTAUpdate(doc["url"]);
  }
}

void toggleRelay(int relayIndex, bool state) {
  relayStates[relayIndex] = state;
  digitalWrite(RELAY_PINS[relayIndex], state ? HIGH : LOW);
  
  Serial.println("Relay " + String(relayIndex + 1) + " turned " + (state ? "ON" : "OFF"));
  
  // Log activity to server
  logActivity(relayIndex, state ? "on" : "off", "remote");
}

void checkManualSwitches() {
  for (int i = 0; i < 4; i++) {
    bool currentState = !digitalRead(MANUAL_SWITCH_PINS[i]); // Inverted because of pull-up
    
    if (currentState != manualOverride[i]) {
      manualOverride[i] = currentState;
      
      if (currentState) {
        // Manual switch pressed - toggle relay
        relayStates[i] = !relayStates[i];
  digitalWrite(RELAY_PINS[i], relayStates[i] ? HIGH : LOW);
        
        // Send update to server
        sendSwitchStateUpdate(i);
        logActivity(i, relayStates[i] ? "on" : "off", "manual");
        
        Serial.println("Manual switch " + String(i + 1) + " pressed - Relay " + (relayStates[i] ? "ON" : "OFF"));
      }
    }
  }
}

void readPIRSensor() {
  if (!HAS_PIR_SENSOR) return;
  
  if (millis() - lastSensorRead > 1000) { // Read every second
    bool currentPirState = digitalRead(PIR_SENSOR_PIN);
    
    if (currentPirState != pirState) {
      pirState = currentPirState;
      
      if (pirState) {
        Serial.println("Motion detected!");
        
        // Turn on linked switches
        for (int i = 0; i < 4; i++) {
          if (PIR_LINKED_SWITCHES[i] && !relayStates[i]) {
            toggleRelay(i, true);
            sendSwitchStateUpdate(i);
          }
        }
        
        // Send PIR event to server
        sendPIREvent(true);
      } else {
        Serial.println("Motion stopped");
        sendPIREvent(false);
      }
    }
    
    lastSensorRead = millis();
  }
}

void sendSwitchStateUpdate(int switchIndex) {
  DynamicJsonDocument doc(256);
  doc["type"] = "switch_update";
  doc["deviceId"] = deviceId;
  doc["switchId"] = "sw" + String(switchIndex + 1);
  doc["state"] = relayStates[switchIndex];
  doc["timestamp"] = millis();
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
}

void sendPIREvent(bool motion) {
  DynamicJsonDocument doc(256);
  doc["type"] = "pir_event";
  doc["deviceId"] = deviceId;
  doc["motion"] = motion;
  doc["timestamp"] = millis();
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
}

void sendHeartbeat() {
  DynamicJsonDocument doc(512);
  doc["type"] = "heartbeat";
  doc["deviceId"] = deviceId;
  doc["uptime"] = millis();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["wifiSignal"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();
  
  JsonArray switchStates = doc.createNestedArray("switches");
  for (int i = 0; i < 4; i++) {
    JsonObject switchObj = switchStates.createNestedObject();
    switchObj["id"] = "sw" + String(i + 1);
    switchObj["state"] = relayStates[i];
  }
  
  if (HAS_PIR_SENSOR) {
    doc["pirActive"] = pirState;
  }
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
}

void sendDeviceStatus() {
  DynamicJsonDocument doc(512);
  doc["type"] = "device_status";
  doc["deviceId"] = deviceId;
  doc["status"] = "online";
  doc["uptime"] = formatUptime(millis());
  doc["signalStrength"] = map(WiFi.RSSI(), -100, -50, 0, 100);
  doc["firmware"] = FIRMWARE_VERSION;
  doc["freeHeap"] = ESP.getFreeHeap();
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
}

void logActivity(int switchIndex, String action, String triggeredBy) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/activities");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + authToken);
  
  DynamicJsonDocument doc(512);
  doc["deviceId"] = deviceId;
  doc["switchId"] = "sw" + String(switchIndex + 1);
  doc["action"] = action;
  doc["triggeredBy"] = triggeredBy;
  doc["timestamp"] = millis();
  
  String requestBody;
  serializeJson(doc, requestBody);
  
  int httpResponseCode = http.POST(requestBody);
  
  if (httpResponseCode != 200 && httpResponseCode != 201) {
    Serial.println("Failed to log activity: " + String(httpResponseCode));
  }
  
  http.end();
}

void saveConfiguration() {
  EEPROM.writeString(0, deviceId);
  EEPROM.writeString(64, authToken);
  EEPROM.commit();
}

void loadConfiguration() {
  deviceId = EEPROM.readString(0);
  authToken = EEPROM.readString(64);
  
  if (deviceId.length() == 0) {
    deviceId = WiFi.macAddress();
    deviceId.replace(":", "");
  }
}

String formatUptime(unsigned long uptime) {
  unsigned long seconds = uptime / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  unsigned long days = hours / 24;
  
  return String(days) + "d " + String(hours % 24) + "h " + String(minutes % 60) + "m";
}

void performOTAUpdate(String updateUrl) {
  Serial.println("Starting OTA update from: " + updateUrl);
  // OTA implementation would go here
  // This is a placeholder for the actual OTA update code
}
