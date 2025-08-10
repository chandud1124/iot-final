// Reference WebSocket example for ESP32 integration with backend
// NOT part of the Node.js build; for Arduino / PlatformIO only.
// Protocol summary (v1.0):
//  Device -> Server:
//    {"type":"identify","mac":"AA:BB:.."}
//    {"type":"heartbeat","mac":"..","uptime":seconds}
//    {"type":"state_update","macAddress":"..","switches":[{"gpio":26,"state":true}]}
//  Server -> Device:
//    {"type":"identified","mac":".."}
//    {"type":"switch_command","mac":"..","gpio":26,"state":false}
// WebSocket Path: /esp32-ws (see config.h or define constant below)
// Update BACKEND_HOST to your backend's LAN IP (not localhost)

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

#define WIFI_SSID "unknown"
#define WIFI_PASSWORD "12345678"
#define BACKEND_HOST "192.168.1.100"  // <-- change to backend IP
#define BACKEND_PORT 3001
#define WS_PATH "/esp32-ws"
#define HEARTBEAT_MS 30000
#define DEVICE_SECRET "CHANGE_ME_32CHARS_MIN" // Must match device.deviceSecret in backend

WebSocketsClient ws;
unsigned long lastHeartbeat = 0;

struct SwitchState { uint8_t gpio; bool state; };
SwitchState switchesLocal[4] = { {26,false},{25,false},{33,false},{32,false} };

void sendJson(const JsonDocument &doc) {
  String out; serializeJson(doc, out);
  ws.sendTXT(out);
}

void identify() {
  DynamicJsonDocument doc(256);
  doc["type"] = "identify";
  doc["mac"] = WiFi.macAddress();
  doc["secret"] = DEVICE_SECRET; // simple shared secret (upgrade to HMAC if needed)
  sendJson(doc);
}

void sendStateUpdate() {
  DynamicJsonDocument doc(512);
  doc["type"] = "state_update";
  doc["macAddress"] = WiFi.macAddress();
  JsonArray arr = doc.createNestedArray("switches");
  for (int i=0;i<4;i++) {
    JsonObject sw = arr.createNestedObject();
    sw["gpio"] = switchesLocal[i].gpio;
    sw["state"] = switchesLocal[i].state;
  }
  sendJson(doc);
}

void sendHeartbeat() {
  DynamicJsonDocument doc(256);
  doc["type"] = "heartbeat";
  doc["mac"] = WiFi.macAddress();
  doc["uptime"] = millis()/1000;
  sendJson(doc);
}

void toggleRelay(int idx, bool state) {
  switchesLocal[idx].state = state;
  digitalWrite(switchesLocal[idx].gpio, state ? HIGH : LOW);
  sendStateUpdate();
}

void onWsEvent(WStype_t type, uint8_t * payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("WS connected");
      identify();
      break;
    case WStype_TEXT: {
      DynamicJsonDocument doc(512);
      if (deserializeJson(doc, payload, len) != DeserializationError::Ok) return;
      const char* msgType = doc["type"] | "";
      if (strcmp(msgType, "switch_command") == 0) {
        int gpio = doc["gpio"] | -1;
        bool state = doc["state"] | false;
        for (int i=0;i<4;i++) if (switchesLocal[i].gpio == gpio) toggleRelay(i, state);
      }
      break; }
    case WStype_DISCONNECTED:
      Serial.println("WS disconnected");
      break;
    default: break;
  }
}

void setupRelays() {
  for (int i=0;i<4;i++) {
    pinMode(switchesLocal[i].gpio, OUTPUT);
    digitalWrite(switchesLocal[i].gpio, LOW);
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK");
  setupRelays();
  ws.begin(BACKEND_HOST, BACKEND_PORT, WS_PATH);
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(5000); // base interval; library uses backoff internally
  // Additional optional manual backoff example (uncomment to customize):
  // ws.enableHeartbeat(15000, 3000, 2);
  lastHeartbeat = millis();
}

void loop() {
  ws.loop();
  if (millis() - lastHeartbeat > HEARTBEAT_MS) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  delay(10);
}
