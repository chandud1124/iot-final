// -----------------------------------------------------------------------------
// Dynamic ESP32 <-> Backend WebSocket example with runtime pin config
// Endpoint: ws://<HOST>:3001/esp32-ws  (server.js)
// Identification payload now returns switch config; device adapts pins.
// Supports on-the-fly config_update (when device edited in UI) and logs
// every incoming switch_command including GPIO and desired state.
// -----------------------------------------------------------------------------
// Core messages:
//  -> identify      {type:'identify', mac, secret}
//  <- identified    {type:'identified', mode, switches:[{gpio,relayGpio,name,...}]}
//  <- config_update {type:'config_update', switches:[...]}  (after UI edits)
//  <- switch_command{type:'switch_command', gpio|relayGpio, state}
//  -> state_update  {type:'state_update', switches:[{gpio,state}]}
//  -> heartbeat     {type:'heartbeat', uptime}
//  <- state_ack     {type:'state_ack', changed}
// -----------------------------------------------------------------------------

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include "config.h"
// Ensure secure WS defaults if not provided by config.h
#ifndef USE_SECURE_WS
#define USE_SECURE_WS 1
#endif
#ifndef WS_INSECURE_TLS
#define WS_INSECURE_TLS 1
#endif
// Uncomment to compile without mbedtls/HMAC (for older cores or minimal builds)
// #define DISABLE_HMAC 1
#ifndef DISABLE_HMAC
#include <mbedtls/md.h>
#endif
#include <vector>
#define HEARTBEAT_MS 30000UL          // 30s heartbeat interval
#define DEVICE_SECRET "87cf1b5017a8486106a9a234d149f7ddfdf56f7b648af688" // device secret from backend

// Optional status LED (set to 255 to disable if your board lacks LED_BUILTIN)
#ifndef STATUS_LED_PIN
#define STATUS_LED_PIN 2
#endif

// Debounce multiple rapid local state changes into one state_update
#define STATE_DEBOUNCE_MS 120

// Active-low mapping: logical ON -> LOW, OFF -> HIGH (common relay boards)

WebSocketsClient ws;
unsigned long lastHeartbeat = 0;
unsigned long lastStateSent = 0;
bool pendingState = false;
bool identified = false;
unsigned long lastIdentifyAttempt = 0;
#define IDENTIFY_RETRY_MS 10000UL // retry identify every 10s until successful

// Extended switch state supports optional manual (wall) switch input GPIO
struct SwitchState {
  int gpio;                    // relay control GPIO (output)
  bool state;                  // logical ON/OFF state
  String name;                 // label from backend
  int manualGpio = -1;         // optional manual switch GPIO (input)
  bool manualEnabled = false;  // whether manual input is active
  bool manualActiveLow = true; // per-switch input polarity (independent of relay polarity)
  bool manualMomentary = false; // true = momentary (toggle on active edge), false = maintained (level maps to state)
  int lastManualLevel = -1;    // last raw digitalRead level
  unsigned long lastManualChangeMs = 0; // last time raw level flipped
  int stableManualLevel = -1;  // debounced level
  bool lastManualActive = false; // previous debounced logical active level (after polarity)
};
#define MANUAL_DEBOUNCE_MS 30
// Treat a falling edge (HIGH->LOW) on a pullup input as a toggle event
#define MANUAL_ACTIVE_LOW 1
#define MANUAL_DBG_INTERVAL_MS 2000UL
std::vector<SwitchState> switchesLocal; // dynamically populated
static unsigned long lastManualDbg = 0;

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------
void sendJson(const JsonDocument &doc) {
  String out; serializeJson(doc, out);
  ws.sendTXT(out);
}

String hmacSha256(const String &key, const String &msg) {
#ifdef DISABLE_HMAC
  // HMAC disabled: return empty string to skip signing
  (void)key; (void)msg; return String("");
#else
  byte hmacResult[32];
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, hmacResult);
  mbedtls_md_free(&ctx);
  char buf[65];
  for (int i=0;i<32;i++) sprintf(&buf[i*2], "%02x", hmacResult[i]);
  buf[64]='\0';
  return String(buf);
#endif
}

void identify() {
  DynamicJsonDocument doc(256);
  doc["type"] = "identify";
  doc["mac"] = WiFi.macAddress();
  if (strlen(DEVICE_SECRET) > 0) {
    doc["secret"] = DEVICE_SECRET; // simple shared secret (optional)
  }
  sendJson(doc);
  lastIdentifyAttempt = millis();
}

void sendStateUpdate(bool force=false) {
  unsigned long now = millis();
  if (!force && now - lastStateSent < STATE_DEBOUNCE_MS) { pendingState = true; return; }
  pendingState = false;
  lastStateSent = now;
  DynamicJsonDocument doc(512);
  doc["type"] = "state_update";
  doc["seq"] = (long)(millis()); // coarse monotonic seq for state_update
  doc["ts"] = (long)(millis());
  JsonArray arr = doc.createNestedArray("switches");
  for (auto &sw : switchesLocal) {
    JsonObject o = arr.createNestedObject();
    o["gpio"] = sw.gpio;
    o["state"] = sw.state;
  }
  if (strlen(DEVICE_SECRET) > 0) {
    String base = WiFi.macAddress();
    base += "|"; base += (long)doc["seq"]; base += "|"; base += (long)doc["ts"];
    doc["sig"] = hmacSha256(DEVICE_SECRET, base);
  }
  sendJson(doc);
  Serial.println(F("[WS] -> state_update"));
}

void sendHeartbeat() {
  DynamicJsonDocument doc(256);
  doc["type"] = "heartbeat";
  doc["mac"] = WiFi.macAddress();
  doc["uptime"] = millis()/1000;
  sendJson(doc);
}

// Track last applied sequence per GPIO to drop stale commands
struct GpioSeq { int gpio; long seq; };
static std::vector<GpioSeq> lastSeqs;
long getLastSeq(int gpio){ for(auto &p: lastSeqs){ if(p.gpio==gpio) return p.seq; } return -1; }
void setLastSeq(int gpio,long seq){ for(auto &p: lastSeqs){ if(p.gpio==gpio){ p.seq=seq; return;} } lastSeqs.push_back({gpio,seq}); }

bool applySwitchState(int gpio, bool state) {
  for (auto &sw : switchesLocal) {
    if (sw.gpio == gpio) {
      sw.state = state;
      pinMode(sw.gpio, OUTPUT);
      // Smooth transition: fade relay ON/OFF over 200ms (if hardware supports)
      // For standard relays, simulate with a short delay before switching
      if (STATUS_LED_PIN != 255) {
        digitalWrite(STATUS_LED_PIN, HIGH); // LED ON during transition
      }
      delay(200); // 200ms smooth transition
      digitalWrite(sw.gpio, state ? LOW : HIGH);
      if (STATUS_LED_PIN != 255) {
        digitalWrite(STATUS_LED_PIN, LOW); // LED OFF after transition
      }
      Serial.printf("[SWITCH] GPIO %d -> %s (active-low, smooth)\n", sw.gpio, state ? "ON":"OFF");
      sendStateUpdate(true); // always send immediate state update for reliability
      return true;
    }
  }
  Serial.printf("[SWITCH] Unknown GPIO %d (ignored)\n", gpio);
  return false;
}

void loadConfigFromJsonArray(JsonArray arr) {
  // Preserve previous GPIO states so we don't override hardware on reconnect
  std::vector<SwitchState> prev = switchesLocal; // shallow copy is fine (we use gpio/state)
  switchesLocal.clear();
  auto findPrev = [&](int g, bool &out) -> bool {
    for (auto &p : prev) { if (p.gpio == g) { out = p.state; return true; } }
    return false;
  };
  // First pass: build new switch list and configure I/O modes
  for (JsonObject o : arr) {
    int g = o["relayGpio"].is<int>() ? o["relayGpio"].as<int>() : (o["gpio"].is<int>() ? o["gpio"].as<int>() : -1);
    if (g < 0) continue;
    bool desiredState = o["state"].is<bool>() ? o["state"].as<bool>() : false; // DB-intended, used only if no prior state
    SwitchState sw { };
    sw.gpio = g;
    // Prefer the previous (hardware) state if we already had this GPIO configured
  bool hasPrev = false; bool prevState = false;
  hasPrev = findPrev(g, prevState);
    sw.state = hasPrev ? prevState : desiredState;
    sw.name = String(o["name"].is<const char*>() ? o["name"].as<const char*>() : "");
    // Manual switch config (optional)
    if (o["manualSwitchEnabled"].is<bool>() && o["manualSwitchEnabled"].as<bool>() && o["manualSwitchGpio"].is<int>()) {
      sw.manualEnabled = true;
      sw.manualGpio = o["manualSwitchGpio"].as<int>();
      // Parse manualMode (maintained | momentary) and polarity
      if (o["manualMode"].is<const char*>()) {
        const char *mm = o["manualMode"].as<const char*>();
        sw.manualMomentary = (strcmp(mm, "momentary") == 0);
      }
      if (o["manualActiveLow"].is<bool>()) {
        sw.manualActiveLow = o["manualActiveLow"].as<bool>();
      }
    }
  pinMode(g, OUTPUT);
    if (sw.manualEnabled && sw.manualGpio >= 0) {
      // Configure input with proper pull depending on polarity.
      // NOTE: GPIOs 34-39 are input-only and DO NOT support internal pull-up/down.
      // For those pins, we set INPUT and require an external resistor.
      if (sw.manualGpio >= 34 && sw.manualGpio <= 39) {
        pinMode(sw.manualGpio, INPUT);
        Serial.printf("[MANUAL][WARN] gpio=%d is input-only (34-39) without internal pull resistors. Use external pull-%s.\n",
                      sw.manualGpio, sw.manualActiveLow ? "up to 3.3V" : "down to GND");
      } else {
        if (sw.manualActiveLow) {
          pinMode(sw.manualGpio, INPUT_PULLUP); // active when pulled LOW (to GND)
        } else {
          // Many ESP32 pins support internal pulldown; if not available, add external pulldown
          pinMode(sw.manualGpio, INPUT_PULLDOWN);
          // Heuristic warning for common pins where pulldown may be unreliable without external resistor
          if (sw.manualGpio == 32 || sw.manualGpio == 33) {
            Serial.printf("[MANUAL][WARN] gpio=%d pulldown may not be available on all boards. If readings float, add external pulldown to GND or switch to manualActiveLow=true wiring.\n", sw.manualGpio);
          }
        }
      }
      sw.lastManualLevel = digitalRead(sw.manualGpio);
      sw.stableManualLevel = sw.lastManualLevel;
      // Initialize active logical level after polarity mapping
      sw.lastManualActive = sw.manualActiveLow ? (sw.stableManualLevel == LOW) : (sw.stableManualLevel == HIGH);
      Serial.printf("[MANUAL][INIT] gpio=%d (input %d) activeLow=%d mode=%s raw=%d active=%d\n",
                    sw.gpio, sw.manualGpio, sw.manualActiveLow ? 1 : 0,
                    sw.manualMomentary ? "momentary" : "maintained",
                    sw.stableManualLevel, sw.lastManualActive ? 1 : 0);
    }
    switchesLocal.push_back(sw);
  }
  Serial.printf("[CONFIG] Loaded %u switches\n", (unsigned)switchesLocal.size());
  // Second pass: apply relay states only if changed vs previous snapshot
  bool anyApplied = false;
  for (size_t i = 0; i < switchesLocal.size(); ++i) {
    auto &sw = switchesLocal[i];
    bool prevState = false; bool hadPrev = findPrev(sw.gpio, prevState);
    if (!hadPrev || prevState != sw.state) {
      digitalWrite(sw.gpio, sw.state ? LOW : HIGH);
      anyApplied = true;
      if (STAGGER_ON_CONFIG && i + 1 < switchesLocal.size()) {
        delay(STAGGER_RELAY_APPLY_MS);
      }
    } else {
      // No hardware change needed; keep existing level
    }
  }
  // Snapshot print for verification
  for (auto &sw : switchesLocal) {
    Serial.printf("[SNAPSHOT] gpio=%d state=%s manual=%s manualGpio=%d mode=%s activeLow=%d\n",
                  sw.gpio, sw.state?"ON":"OFF", sw.manualEnabled?"yes":"no", sw.manualGpio,
                  sw.manualMomentary?"momentary":"maintained", sw.manualActiveLow?1:0);
  }
  if (anyApplied) sendStateUpdate(true);
}

void onWsEvent(WStype_t type, uint8_t * payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("WS connected");
      identified = false;
      if (STATUS_LED_PIN != 255) digitalWrite(STATUS_LED_PIN, LOW);
      identify();
      break;
    case WStype_TEXT: {
      DynamicJsonDocument doc(1024);
      if (deserializeJson(doc, payload, len) != DeserializationError::Ok) {
        Serial.println(F("[WS] JSON parse error"));
        return;
      }
      const char* msgType = doc["type"] | "";
      if (strcmp(msgType, "identified") == 0) {
        identified = true;
        if (STATUS_LED_PIN != 255) digitalWrite(STATUS_LED_PIN, HIGH);
  const char* _mode = doc["mode"].is<const char*>() ? doc["mode"].as<const char*>() : "n/a";
  Serial.printf("[WS] <- identified mode=%s\n", _mode);
  // Reset per-GPIO sequence tracking on fresh identify to avoid stale_seq after server restarts
  lastSeqs.clear();
        if (doc["switches"].is<JsonArray>()) loadConfigFromJsonArray(doc["switches"].as<JsonArray>());
        else Serial.println(F("[CONFIG] No switches in identified payload (using none)"));
        return;
      }
      if (strcmp(msgType, "config_update") == 0) {
        if (doc["switches"].is<JsonArray>()) {
          Serial.println(F("[WS] <- config_update"));
          // Clear seq tracking as mapping may change
          lastSeqs.clear();
          loadConfigFromJsonArray(doc["switches"].as<JsonArray>());
        }
        return;
      }
      if (strcmp(msgType, "state_ack") == 0) {
        bool changed = doc["changed"] | false;
        Serial.printf("[WS] <- state_ack changed=%s\n", changed ? "true":"false");
        return;
      }
      if (strcmp(msgType, "switch_command") == 0) {
        int gpio = doc["relayGpio"].is<int>() ? doc["relayGpio"].as<int>() : (doc["gpio"].is<int>() ? doc["gpio"].as<int>() : -1);
        bool requested = doc["state"] | false;
        long seq = doc["seq"].is<long>() ? doc["seq"].as<long>() : -1;
        Serial.printf("[CMD] Raw: %.*s\n", (int)len, payload);
        Serial.printf("[CMD] switch_command gpio=%d state=%s seq=%ld\n", gpio, requested ? "ON":"OFF", seq);
        // Drop stale if older than last applied for this gpio
        if (seq >= 0) {
          long last = getLastSeq(gpio);
          if (last >= 0 && seq < last) {
            Serial.printf("[CMD] drop stale seq (last=%ld)\n", last);
            // Still send a result so backend can ignore
            DynamicJsonDocument res(192);
            res["type"] = "switch_result";
            res["gpio"] = gpio;
            res["requestedState"] = requested;
            res["success"] = false;
            res["reason"] = "stale_seq";
            res["seq"] = seq;
            sendJson(res);
            return;
          }
          setLastSeq(gpio, seq);
        }
        bool success = false;
        if (gpio >= 0) {
          success = applySwitchState(gpio, requested);
        }
        // Send explicit result so backend can reconcile UI if failure
        DynamicJsonDocument res(192);
        res["type"] = "switch_result";
        res["gpio"] = gpio;
        res["requestedState"] = requested;
        res["success"] = success;
        if (seq >= 0) res["seq"] = seq;
        res["ts"] = (long)millis();
        if (strlen(DEVICE_SECRET) > 0) {
          String base = WiFi.macAddress();
          base += "|"; base += gpio;
          base += "|"; base += (success?1:0);
          base += "|"; base += (requested?1:0);
          bool actual = false; for (auto &sw : switchesLocal) if (sw.gpio == gpio) { actual = sw.state; break; }
          res["actualState"] = actual;
          base += "|"; base += (actual?1:0);
          base += "|"; base += (long)res["seq"];
          base += "|"; base += (long)res["ts"];
          res["sig"] = hmacSha256(DEVICE_SECRET, base);
        }
        if (!success) {
          res["reason"] = "unknown_gpio";
        } else {
          // find actual state to echo
          for (auto &sw : switchesLocal) if (sw.gpio == gpio) { res["actualState"] = sw.state; break; }
        }
        sendJson(res);
        return;
      }
      Serial.printf("[WS] <- unhandled type=%s Raw=%.*s\n", msgType, (int)len, payload);
      break; }
    case WStype_DISCONNECTED:
      Serial.println("WS disconnected");
      identified = false;
      if (STATUS_LED_PIN != 255) digitalWrite(STATUS_LED_PIN, LOW);
      break;
    default: break;
  }
}

void setupRelays() {
  // Initially no switches (dynamic config arrives after identify).
  // If you want fallback default pins, push_back them here.
  if (switchesLocal.empty()) {
    Serial.println(F("[INIT] No local switches yet (waiting for identified/config_update)"));
    #if ENABLE_OFFLINE_FALLBACK
      // Configure a single fallback switch so manual works before WS/config
      SwitchState sw{};
      sw.gpio = FALLBACK_RELAY_GPIO;
      sw.state = false; // default OFF
      sw.name = String("fallback");
      sw.manualEnabled = true;
      sw.manualGpio = FALLBACK_MANUAL_GPIO;
      sw.manualActiveLow = (FALLBACK_MANUAL_ACTIVE_LOW != 0);
      sw.manualMomentary = (FALLBACK_MANUAL_MOMENTARY != 0);
      pinMode(sw.gpio, OUTPUT);
      digitalWrite(sw.gpio, HIGH); // OFF (active-low)
      if (sw.manualGpio >= 34 && sw.manualGpio <= 39) {
        pinMode(sw.manualGpio, INPUT);
      } else {
        pinMode(sw.manualGpio, sw.manualActiveLow ? INPUT_PULLUP : INPUT_PULLDOWN);
      }
      sw.lastManualLevel = digitalRead(sw.manualGpio);
      sw.stableManualLevel = sw.lastManualLevel;
      sw.lastManualActive = sw.manualActiveLow ? (sw.stableManualLevel == LOW) : (sw.stableManualLevel == HIGH);
      switchesLocal.push_back(sw);
      Serial.printf("[INIT] Offline fallback enabled: relay=%d manual=%d activeLow=%d mode=%s\n",
        sw.gpio, sw.manualGpio, sw.manualActiveLow?1:0, sw.manualMomentary?"momentary":"maintained");
    #endif
  } else {
    for (auto &sw : switchesLocal) {
      pinMode(sw.gpio, OUTPUT);
  // Ensure hardware reflects stored logical state (active-low)
  digitalWrite(sw.gpio, sw.state ? LOW : HIGH);
    }
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  // EEPROM init and optional clear on version bump
  EEPROM.begin(EEPROM_SIZE);
  const int verAddr = 0;
  int storedVer = EEPROM.read(verAddr);
  if (storedVer != CONFIG_VERSION) {
    Serial.printf("[EEPROM] Version mismatch (stored=%d, expected=%d). Clearing...\n", storedVer, CONFIG_VERSION);
    for (int i=0;i<EEPROM_SIZE;i++) EEPROM.write(i, 0);
    EEPROM.write(verAddr, CONFIG_VERSION);
    EEPROM.commit();
  }
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK");
  setupRelays(); // safe: does nothing until config arrives
  if (STATUS_LED_PIN != 255) { pinMode(STATUS_LED_PIN, OUTPUT); digitalWrite(STATUS_LED_PIN, LOW); }
  #if USE_SECURE_WS
    // Secure WebSocket (wss) on port 443
    ws.beginSSL(WEBSOCKET_HOST, WEBSOCKET_PORT, WEBSOCKET_PATH);
    #if WS_INSECURE_TLS
      ws.setInsecure(); // skip cert validation (use only if you can't bundle CA)
    #endif
    Serial.printf("[WS] begin wss://%s:%d%s\n", WEBSOCKET_HOST, WEBSOCKET_PORT, WEBSOCKET_PATH);
  #else
    ws.begin(WEBSOCKET_HOST, WEBSOCKET_PORT, WEBSOCKET_PATH);
    Serial.printf("[WS] begin ws://%s:%d%s\n", WEBSOCKET_HOST, WEBSOCKET_PORT, WEBSOCKET_PATH);
  #endif
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
  // If we have a websocket connection but haven't been identified yet, retry identify periodically
  if (!identified && (millis() - lastIdentifyAttempt) > IDENTIFY_RETRY_MS) {
    identify();
  }
  // Flush a pending coalesced state update when debounce interval elapsed
  if (pendingState && (millis() - lastStateSent) >= STATE_DEBOUNCE_MS) {
    sendStateUpdate();
  }
  // Poll manual (wall) switches for changes with debounce
  unsigned long now = millis();
  bool anyManualToggled = false;
  for (auto &sw : switchesLocal) {
    if (!sw.manualEnabled || sw.manualGpio < 0) continue;
    int lvl = digitalRead(sw.manualGpio);
    if (lvl != sw.lastManualLevel) {
      sw.lastManualLevel = lvl;
      sw.lastManualChangeMs = now; // start debounce window
  Serial.printf("[MANUAL][RAW] input=%d level=%d at %lu ms\n", sw.manualGpio, lvl, (unsigned long)now);
    }
    // Debounce: require stable level for MANUAL_DEBOUNCE_MS
    if ((now - sw.lastManualChangeMs) >= MANUAL_DEBOUNCE_MS && lvl != sw.stableManualLevel) {
      // Level stabilized at new value
      sw.stableManualLevel = lvl;
      bool logicalActive = sw.manualActiveLow ? (sw.stableManualLevel == LOW) : (sw.stableManualLevel == HIGH);
  Serial.printf("[MANUAL][STABLE] input=%d raw=%d logicalActive=%d mode=%s\n",
        sw.manualGpio, sw.stableManualLevel, logicalActive?1:0, sw.manualMomentary?"momentary":"maintained");

      if (sw.manualMomentary) {
        // Toggle only on rising active edge (inactive->active)
        if (logicalActive && !sw.lastManualActive) {
          bool newState = !sw.state;
          Serial.printf("[MANUAL] momentary edge gpio=%d (input %d) -> toggle -> %s\n", sw.gpio, sw.manualGpio, newState?"ON":"OFF");
          applySwitchState(sw.gpio, newState);
          anyManualToggled = true;
        }
      } else {
        // Maintained: map level directly to state
        if (logicalActive != sw.state) {
          Serial.printf("[MANUAL] maintained level gpio=%d (input %d) active=%d -> state=%s\n", sw.gpio, sw.manualGpio, logicalActive, logicalActive?"ON":"OFF");
          applySwitchState(sw.gpio, logicalActive);
          anyManualToggled = true;
        }
      }
      sw.lastManualActive = logicalActive;
    } else if ((now - sw.lastManualChangeMs) >= MANUAL_DEBOUNCE_MS) {
      // No new stable level but ensure lastManualActive reflects stable level after initial setup
      sw.lastManualActive = sw.manualActiveLow ? (sw.stableManualLevel == LOW) : (sw.stableManualLevel == HIGH);
    }
  }
  if (anyManualToggled) {
    // applySwitchState already sends an immediate state_update(true)
  }
  // Periodic manual-input debug to verify wiring and signal levels
  if (millis() - lastManualDbg > MANUAL_DBG_INTERVAL_MS) {
    lastManualDbg = millis();
    for (auto &sw : switchesLocal) {
      if (!sw.manualEnabled || sw.manualGpio < 0) continue;
      int raw = digitalRead(sw.manualGpio);
      bool logicalActive = sw.manualActiveLow ? (raw == LOW) : (raw == HIGH);
      Serial.printf("[MANUAL][DBG] relayGPIO=%d input=%d raw=%d logicalActive=%d mode=%s state=%s\n",
                    sw.gpio, sw.manualGpio, raw, logicalActive?1:0,
                    sw.manualMomentary?"momentary":"maintained",
                    sw.state?"ON":"OFF");
    }
  }
  delay(10);
}
