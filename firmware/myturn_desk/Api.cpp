#include "Api.h"
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <atomic>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <time.h>
#include "config.h"
#include "secrets.h"

// HTTPS/WSS is refused without a supplied CA, never silently made insecure.
#ifndef WS_CA_CERT
#define WS_CA_CERT nullptr
#endif

namespace Net {
namespace {
enum class Status { Starting, WifiDown, Connecting, Authenticating, Ready, Stale, ConfigurationError };
std::atomic<Status> status{Status::Starting};
std::atomic<bool> authenticated{false};
std::atomic<bool> haveAck{false};
std::atomic<bool> needsBaseline{true};
std::atomic<unsigned long> lastStateAt{0}, lastAckAt{0};

// Queues carry POD only. Arduino String must never be shallow-copied across tasks.
struct StateFrame {
  bool valid = false, baseline = true;
  long callId = -1, callAge = -1;
  char state[8] = "paused", callEvent[12] = "";
};
struct ReadingFrame {
  float cm;
  bool occupied, approach;
  char led[8];
  unsigned long measuredAt;
};
QueueHandle_t states = nullptr, readings = nullptr;
WebSocketsClient socket;
String host, path, chipId, macAddress;
bool socketUp = false, expectingInitial = true, waitingForAck = false;
bool secure = false;
uint16_t port = 0;
uint8_t failures = 0;
long deskId = -1, sequence = 0, awaitingSequence = 0;
unsigned long sentAt = 0, lastPingAt = 0;
unsigned long sessionAt = 0;

void invalidate(Status reason) {
  authenticated.store(false);
  haveAck.store(false);
  waitingForAck = false;
  status.store(reason);
  StateFrame paused;
  if (states) xQueueOverwrite(states, &paused);
}

void disconnectStale() {
  invalidate(Status::Stale);
  socket.disconnect();
}

bool sendJson(const JsonDocument &doc) {
  String text;
  serializeJson(doc, text);
  return socket.sendTXT(text);
}

bool configureUrl() {
  String base(API_BASE);
  int start;
  if (base.startsWith("https://")) { secure = true; start = 8; port = 443; }
  else if (base.startsWith("http://")) { start = 7; port = 80; }
  else return false;
  if (base.indexOf('?') >= 0 || base.indexOf('#') >= 0 || base.indexOf('@') >= 0) return false;
  int slash = base.indexOf('/', start);
  String authority = slash < 0 ? base.substring(start) : base.substring(start, slash);
  int colon = authority.indexOf(':');
  if (colon >= 0) {
    String number = authority.substring(colon + 1);
    if (!number.length()) return false;
    for (unsigned int i = 0; i < number.length(); i++) if (!isDigit(number[i])) return false;
    long parsed = number.toInt();
    if (parsed < 1 || parsed > 65535) return false;
    port = (uint16_t)parsed;
    host = authority.substring(0, colon);
  } else host = authority;
  path = slash < 0 ? "" : base.substring(slash);
  while (path.endsWith("/")) path.remove(path.length() - 1);
  path += "/ws/device";
  return host.length() && (!secure || WS_CA_CERT != nullptr);
}

bool acceptState(const JsonDocument &doc) {
  const char *state = doc["service_state"] | "";
  if (strcmp(state, "active") && strcmp(state, "paused") && strcmp(state, "closed")) return false;
  if (!doc["initial"].is<bool>() || (expectingInitial && !doc["initial"].as<bool>())) return false;
  if (!doc["desk_id"].isNull() && !doc["desk_id"].is<long>()) return false;
  long freshDesk = doc["desk_id"] | -1L;
  StateFrame frame;
  frame.valid = true;
  frame.baseline = expectingInitial || freshDesk != deskId;
  if (frame.baseline) {
    needsBaseline.store(true);
    sessionAt = millis();
  }
  strlcpy(frame.state, state, sizeof frame.state);
  if (!doc["call_event_id"].isNull()) {
    if (!doc["call_event_id"].is<long>() || !doc["call_event_age_seconds"].is<long>()) return false;
    frame.callId = doc["call_event_id"].as<long>();
    frame.callAge = doc["call_event_age_seconds"].as<long>();
    const char *event = doc["call_event"] | "";
    if (frame.callId <= 0 || frame.callAge < 0 || (strcmp(event, "called") && strcmp(event, "recalled"))) return false;
    strlcpy(frame.callEvent, event, sizeof frame.callEvent);
  }
  deskId = freshDesk;
  expectingInitial = false;
  failures = 0;
  socket.setReconnectInterval(WS_RETRY_BASE_MS);
  lastStateAt.store(millis());
  status.store(Status::Ready);
  authenticated.store(true);
  xQueueOverwrite(states, &frame);
  return true;
}

void onSocket(WStype_t type, uint8_t *payload, size_t length) {
  if (type == WStype_CONNECTED) {
    socketUp = true;
    expectingInitial = true;
    sequence = 0;
    lastPingAt = millis();
    lastStateAt.store(millis());
    status.store(Status::Authenticating);
    JsonDocument hello;
    hello["type"] = "hello";
    hello["key"] = DEVICE_KEY;
    if (!sendJson(hello)) disconnectStale();
    return;
  }
  if (type == WStype_DISCONNECTED) {
    socketUp = false;
    invalidate(Status::Connecting);
    if (failures < 5) failures++;
    unsigned long retry = WS_RETRY_BASE_MS * (1UL << failures);
    if (retry > WS_RETRY_MAX_MS) retry = WS_RETRY_MAX_MS;
    socket.setReconnectInterval(retry + (esp_random() % 500));
    return;
  }
  if (type == WStype_ERROR) { invalidate(Status::Stale); return; }
  if (type != WStype_TEXT) return;
  if (length > 2048) { disconnectStale(); return; }
  JsonDocument doc;
  if (deserializeJson(doc, payload, length) || !doc.is<JsonObject>()) { disconnectStale(); return; }
  const char *kind = doc["type"] | "";
  if (!strcmp(kind, "state")) {
    if (!acceptState(doc)) disconnectStale();
  } else if (!strcmp(kind, "ack")) {
    if (waitingForAck && doc["sequence"].is<long>() && doc["sequence"].as<long>() == awaitingSequence) {
      waitingForAck = false;
      haveAck.store(true);
      lastAckAt.store(millis());
    }
  } else if (strcmp(kind, "pong")) disconnectStale();
}

void networkTask(void *) {
  if (!configureUrl()) {
    invalidate(Status::ConfigurationError);
    vTaskDelete(nullptr);
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("myturn-desk");
  WiFi.setAutoReconnect(true);
  chipId = String((uint32_t)(ESP.getEfuseMac() >> 32), HEX);
  socket.onEvent(onSocket);
  socket.setReconnectInterval(WS_RETRY_BASE_MS);
  socket.enableHeartbeat(WS_PING_MS, WS_ACK_TIMEOUT_MS, 2);
  if (secure) socket.beginSslWithCA(host.c_str(), port, path.c_str(), WS_CA_CERT, "");
  else socket.begin(host.c_str(), port, path.c_str(), "");
  Serial.printf("Device WebSocket: %s://%s:%u%s\n", secure ? "wss" : "ws", host.c_str(), port, path.c_str());
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long lastWifiTry = millis();
  bool wifiWasUp = false, haveLatest = false;
  ReadingFrame latest{};

  for (;;) {
    ReadingFrame fresh;
    if (xQueueReceive(readings, &fresh, 0) == pdTRUE) { latest = fresh; haveLatest = true; }
    unsigned long tick = millis();
    if (WiFi.status() != WL_CONNECTED) {
      invalidate(Status::WifiDown);
      if (wifiWasUp) { socket.disconnect(); wifiWasUp = false; }
      if (tick - lastWifiTry >= WIFI_RETRY_MS) {
        lastWifiTry = tick;
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);
      }
    } else {
      if (!wifiWasUp) {
        wifiWasUp = true;
        status.store(Status::Connecting);
        macAddress = WiFi.macAddress();
        if (secure) configTime(0, 0, "pool.ntp.org", "time.nist.gov");
      }
      // TCP/TLS handshakes may block this task, never the sensor/indicator loop.
      socket.loop();
      tick = millis();
      if (socketUp && tick - lastStateAt.load() > WS_STATE_TIMEOUT_MS) disconnectStale();
      if (waitingForAck && tick - sentAt > WS_ACK_TIMEOUT_MS) disconnectStale();
      if (ready() && tick - lastPingAt >= WS_PING_MS) {
        JsonDocument ping;
        ping["type"] = "ping";
        if (!sendJson(ping)) disconnectStale();
        lastPingAt = tick;
      }
      if (ready() && haveLatest && !waitingForAck) {
        if ((long)(latest.measuredAt - sessionAt) >= 0 && tick - latest.measuredAt <= WS_READING_MAX_AGE_MS) {
          if (sequence == 2147483647L) { disconnectStale(); continue; }
          JsonDocument doc;
          doc["type"] = "reading";
          doc["sequence"] = ++sequence;
          doc["distance_cm"] = latest.cm;
          doc["occupied"] = latest.occupied;
          doc["approach"] = latest.approach;
          doc["led_state"] = latest.led;
          doc["chip_id"] = chipId;
          doc["mac"] = macAddress;
          if (sendJson(doc)) {
            waitingForAck = true;
            awaitingSequence = sequence;
            sentAt = millis();
          } else disconnectStale();
        }
        haveLatest = false; // Never replay a history of obsolete offline measurements.
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
} // namespace

void begin() {
  states = xQueueCreate(1, sizeof(StateFrame));
  readings = xQueueCreate(1, sizeof(ReadingFrame));
  if (!states || !readings || xTaskCreate(networkTask, "myturn-network", 12288, nullptr, 1, nullptr) != pdPASS) {
    invalidate(Status::ConfigurationError);
  }
}

bool connected() { return WiFi.status() == WL_CONNECTED; }
bool ready() { return authenticated.load() && connected() && millis() - lastStateAt.load() <= WS_STATE_TIMEOUT_MS; }
bool readingAcknowledged() { return ready() && haveAck.load() && millis() - lastAckAt.load() < WS_STATE_TIMEOUT_MS; }

bool postReading(const Reading &r) {
  if (!readings) return false;
  ReadingFrame frame{};
  frame.cm = r.cm;
  frame.occupied = r.occupied;
  frame.approach = r.approach;
  frame.measuredAt = millis();
  strlcpy(frame.led, r.led, sizeof frame.led);
  return xQueueOverwrite(readings, &frame) == pdTRUE;
}

bool takeSetting(Setting &out) {
  StateFrame frame;
  if (!states || xQueueReceive(states, &frame, 0) != pdTRUE) return false;
  out.valid = frame.valid;
  out.baseline = frame.baseline;
  if (frame.valid) out.baseline = needsBaseline.exchange(false) || out.baseline;
  out.state = frame.state;
  out.callId = frame.callId;
  out.callEvent = frame.callEvent;
  out.callAge = frame.callAge;
  return true;
}

const char *lastError() {
  switch (status.load()) {
    case Status::WifiDown: return "Wi-Fi disconnected";
    case Status::Connecting: return "WebSocket reconnecting";
    case Status::Authenticating: return "authenticating device";
    case Status::Ready: return ready() ? "ready" : "desk state expired";
    case Status::Stale: return "WebSocket state/acknowledgement missing";
    case Status::ConfigurationError: return "check API_BASE, TLS CA and task memory";
    default: return "starting";
  }
}
} // namespace Net
