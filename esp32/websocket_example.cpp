#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include "config.h"

// ========= Globals =========
Preferences prefs;
WebSocketsClient ws;

SwitchConfig switchCfg[MAX_SWITCHES];     // Active config (NVS or defaults)
bool relayState[MAX_SWITCHES] = {false};  // Current relay ON/OFF (true=ON)

// Debounce for maintained switches
bool lastStableManual[MAX_SWITCHES] = {false};
bool lastReadManual[MAX_SWITCHES]   = {false};
unsigned long lastChangeMs[MAX_SWITCHES] = {0};

// Connection / timers
enum ConnState { WIFI_DISCONNECTED, WIFI_ONLY, BACKEND_CONNECTED };
ConnState connState = WIFI_DISCONNECTED;
unsigned long lastWiFiRetry = 0;
unsigned long lastHeartbeat = 0;

// Command queue (serialize backend actions)
struct Command { int idx; bool state; };
QueueHandle_t cmdQueue;

// Forward decls
void loadConfigFromNVS();
void saveConfigToNVS();
void applyPinModes();
void readAllManualAndApply(bool notifyBackend);
void setRelay(int idx, bool on, bool notifyBackend);
void sendFullState();
void sendHeartbeat();
void blinkStatus();
void handleManualMaintained();
void setupWebSocket();
void onWsEvent(WStype_t type, uint8_t * payload, size_t length);

// ========= Setup =========
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Watchdog setup (ESP-IDF v5 API) - 10s timeout, monitor all cores, panic on timeout
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = 10000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_init(&twdt_config);
  esp_task_wdt_add(NULL);  // Add current task (loopTask)

  // Load config (NVS -> fallback to defaults)
  loadConfigFromNVS();
  applyPinModes();

  // Initialize states to reflect actual maintained switch positions at boot
  readAllManualAndApply(false); // no notify yet

  // Command queue
  cmdQueue = xQueueCreate(16, sizeof(Command));

  // Start WiFi (non-blocking reconnect loop in loop())
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Start WebSocket (connect when WiFi is up)
  setupWebSocket();
}

// ========= Loop =========
void loop() {
  esp_task_wdt_reset();

  // ----- WiFi connect/retry -----
  if (WiFi.status() != WL_CONNECTED) {
    connState = WIFI_DISCONNECTED;
    unsigned long now = millis();
    if (now - lastWiFiRetry >= WIFI_RETRY_INTERVAL_MS) {
      lastWiFiRetry = now;
      if (WiFi.status() != WL_IDLE_STATUS) WiFi.disconnect(true);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      Serial.println("[WiFi] (re)connecting...");
    }
  } else {
    if (!ws.isConnected()) {
      connState = WIFI_ONLY;
    }
  }

  // ----- WebSocket -----
  ws.loop();

  // ----- LED pattern -----
  blinkStatus();

  // ----- Maintained switches (debounced) -----
  handleManualMaintained();

  // ----- Dequeue backend commands -----
  Command c;
  if (xQueueReceive(cmdQueue, &c, 0)) {
    setRelay(c.idx, c.state, true); // notify backend so UI reflects final state
  }

  // ----- Heartbeat -----
  sendHeartbeat();
}

// ========= Config Persistence =========
void loadConfigFromNVS() {
  bool have = false;
  prefs.begin("switchcfg", true);
  if (prefs.isKey("relay0") && prefs.isKey("manual0")) have = true;
  prefs.end();

  // seed with defaults
  for (int i = 0; i < MAX_SWITCHES; i++) {
    switchCfg[i] = defaultSwitchConfigs[i];
  }

  if (have) {
    prefs.begin("switchcfg", true);
    for (int i = 0; i < MAX_SWITCHES; i++) {
      switchCfg[i].relayPin = prefs.getInt(("relay"+String(i)).c_str(), switchCfg[i].relayPin);
      switchCfg[i].manualPin = prefs.getInt(("manual"+String(i)).c_str(), switchCfg[i].manualPin);
      // name + manualActiveLow remain from defaults unless also persisted
    }
    prefs.end();
    Serial.println("[CFG] Loaded pin map from NVS");
  } else {
    Serial.println("[CFG] Using factory defaults");
  }
}

void saveConfigToNVS() {
  prefs.begin("switchcfg", false);
  for (int i = 0; i < MAX_SWITCHES; i++) {
    prefs.putInt(("relay"+String(i)).c_str(), switchCfg[i].relayPin);
    prefs.putInt(("manual"+String(i)).c_str(), switchCfg[i].manualPin);
  }
  prefs.end();
  Serial.println("[CFG] Saved pin map to NVS");
}

// ========= Hardware Apply =========
void applyPinModes() {
  for (int i = 0; i < MAX_SWITCHES; i++) {
    pinMode(switchCfg[i].relayPin, OUTPUT);
    // Do not force OFF here; we'll set from manual state right after
    pinMode(switchCfg[i].manualPin, INPUT_PULLUP);
  }
}

void readAllManualAndApply(bool notifyBackend) {
  for (int i = 0; i < MAX_SWITCHES; i++) {
    int lvl = digitalRead(switchCfg[i].manualPin);
    bool active = switchCfg[i].manualActiveLow ? (lvl == LOW) : (lvl == HIGH);
    lastReadManual[i]   = active;
    lastStableManual[i] = active;
    lastChangeMs[i]     = millis();
    setRelay(i, active, notifyBackend);
  }
}

// ========= Relay Control =========
void setRelay(int idx, bool on, bool notifyBackend) {
  relayState[idx] = on;
  digitalWrite(switchCfg[idx].relayPin, on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);

  if (notifyBackend && ws.isConnected()) {
    DynamicJsonDocument doc(256);
    doc["type"]  = "state_update";
    doc["name"]  = switchCfg[idx].name;
    doc["gpio"]  = switchCfg[idx].relayPin;
    doc["state"] = on;
    String out; serializeJson(doc, out);
    ws.sendTXT(out);
  }

  // Debug
  Serial.print("[RELAY] "); Serial.print(switchCfg[idx].name);
  Serial.print(" @GPIO "); Serial.print(switchCfg[idx].relayPin);
  Serial.print(" -> "); Serial.println(on ? "ON" : "OFF");
}

// ========= Maintained Switch Handling (with debounce) =========
void handleManualMaintained() {
  unsigned long now = millis();
  for (int i = 0; i < MAX_SWITCHES; i++) {
    int lvl = digitalRead(switchCfg[i].manualPin);
    bool current = switchCfg[i].manualActiveLow ? (lvl == LOW) : (lvl == HIGH);

    if (current != lastReadManual[i]) {
      lastReadManual[i] = current;
      lastChangeMs[i] = now; // start debounce window
    }

    if (current != lastStableManual[i] && (now - lastChangeMs[i] >= DEBOUNCE_MS)) {
      lastStableManual[i] = current;
      // Maintained behavior: relay follows switch position (edge-based -> avoids fighting web overrides)
      if (relayState[i] != current) {
        setRelay(i, current, true); // notify backend so UI updates
      }
    }
  }
}

// ========= WebSocket =========
void setupWebSocket() {
  ws.beginSSL(WEBSOCKET_HOST, WEBSOCKET_PORT, WEBSOCKET_PATH);
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(3000);
}

void onWsEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      connState = BACKEND_CONNECTED;
      Serial.println("[WS] Connected");
      // Auth
      DynamicJsonDocument doc(256);
      doc["type"] = "auth";
      doc["mac"]  = WiFi.macAddress();
      doc["secretKey"] = DEVICE_SECRET_KEY;
      String out; serializeJson(doc, out);
      ws.sendTXT(out);
    } break;

    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      connState = (WiFi.status()==WL_CONNECTED) ? WIFI_ONLY : WIFI_DISCONNECTED;
      break;

    case WStype_TEXT: {
      DynamicJsonDocument doc(1024);
      auto err = deserializeJson(doc, payload, length);
      if (err) { Serial.println("[WS] JSON parse error"); return; }

      String t = doc["type"] | "";

      if (t == "auth_success") {
        // Push full current truth so UI matches hardware
        sendFullState();
      }
      else if (t == "switch_command") {
        // Supported: by "name" or by "gpio"
        bool haveName = doc.containsKey("name");
        bool haveGpio = doc.containsKey("gpio");
        bool state    = doc["state"] | false;

        for (int i = 0; i < MAX_SWITCHES; i++) {
          bool match = false;
          if (haveName) match = (switchCfg[i].name == String((const char*)doc["name"]));
          if (!match && haveGpio) match = (switchCfg[i].relayPin == (int)doc["gpio"]);

          if (match) {
            Command c = { i, state };
            xQueueSend(cmdQueue, &c, 0);
            break;
          }
        }
      }
      else if (t == "config_update") {
        // Expect: { type:"config_update", switches:[{relay:4, manual:25, name:"Fan1", manualActiveLow:true}, ...] }
        JsonArray arr = doc["switches"].as<JsonArray>();
        for (int i = 0; i < MAX_SWITCHES && i < (int)arr.size(); i++) {
          JsonObject s = arr[i];
          if (s.containsKey("relay")) switchCfg[i].relayPin = (int)s["relay"];
          if (s.containsKey("manual")) switchCfg[i].manualPin = (int)s["manual"];
          if (s.containsKey("name")) switchCfg[i].name = (const char*)s["name"];
          if (s.containsKey("manualActiveLow")) switchCfg[i].manualActiveLow = (bool)s["manualActiveLow"];
        }
        saveConfigToNVS();
        applyPinModes();
        // After pin remap, re-read maintained switches and apply
        readAllManualAndApply(true);
        sendFullState(); // extra safety so UI stays in sync
      }
    } break;

    default: break;
  }
}

// ========= State / Heartbeat =========
void sendFullState() {
  if (!ws.isConnected()) return;

  DynamicJsonDocument doc(1024);
  doc["type"] = "full_state";
  doc["mac"]  = WiFi.macAddress();

  JsonArray arr = doc.createNestedArray("switches");
  for (int i = 0; i < MAX_SWITCHES; i++) {
    JsonObject s = arr.createNestedObject();
    s["name"]   = switchCfg[i].name;
    s["gpio"]   = switchCfg[i].relayPin;
    s["manual"] = switchCfg[i].manualPin;
    s["state"]  = relayState[i];
  }

  String out; serializeJson(doc, out);
  ws.sendTXT(out);
  Serial.println("[WS] full_state sent");
}

void sendHeartbeat() {
  unsigned long now = millis();
  if (!ws.isConnected()) return;
  if (now - lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeat = now;

  DynamicJsonDocument doc(256);
  doc["type"] = "heartbeat";
  doc["mac"]  = WiFi.macAddress();
  String out; serializeJson(doc, out);
  ws.sendTXT(out);
}

// ========= LED Patterns =========
void blinkStatus() {
  static unsigned long last = 0;
  static bool led = false;

  unsigned long interval =
    (connState == BACKEND_CONNECTED) ? 120 :
    (connState == WIFI_ONLY)         ? 400 :
                                       1000;

  if (millis() - last >= interval) {
    last = millis();
    led = !led;
    digitalWrite(LED_PIN, led ? HIGH : LOW);
  }
}