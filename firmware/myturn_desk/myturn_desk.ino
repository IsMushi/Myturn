/*
 * MyTurn service desk board  -  ESP32 DevKitC
 *
 * Files:  config.h (pins + tuning)   secrets.h (copy from secrets.example.h)
 *         Sensor.*  HC-SR04          Pir.*  HC-SR501 approach
 *         Indicators.*  LEDs/buzzer  Api.*  Wi-Fi + authenticated WebSocket
 * Wiring: see WIRING.md.  Board: "ESP32 Dev Module".
 *
 * Api.* is deliberately NOT called Network.*: the ESP32 core ships its own
 * Network.h, and a file of that name in the sketch folder shadows it, because
 * the sketch folder is searched first. The core's WiFiGeneric.h then includes
 * ours instead of its own and the build dies with "redefinition of struct
 * Net::Reading" and "'network_event_handle_t' does not name a type".
 */
#include <WiFi.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include "config.h"
#include "Sensor.h"
#include "Pir.h"
#include "Indicators.h"
#include "Api.h"

static unsigned long lastSend = 0;
static unsigned long lastWdtFeed = 0;
static Net::Setting deskSetting;   // last state read from the server; "paused" until then

static bool startupSequenceDone = false;

static Light chooseLight(const Net::Setting &s, bool occupied) {
  // Yellow is the safe state: the desk is not known to be open. The board
  // starts yellow and falls back to yellow when the server cannot be reached,
  // so it never claims a desk is open that nobody has said is open.
  if (!s.valid || s.state == "closed") {
    if (!s.valid && !startupSequenceDone) {
      Indicators::runStartupSequence();
      startupSequenceDone = true;
    }
    return Light::Yellow;
  }
  // Blue is the call light and only the call light: a visitor is being called,
  // between call-next and served/no-show. Nothing else may use this colour, or
  // a closed desk would look like a number waiting to be collected.
  if (s.state == "active" && s.callId > 0 && (s.callEvent == "called" || s.callEvent == "recalled")) {
    return Light::Blue;
  }
  if (s.state == "paused") return Light::Yellow;
  return occupied ? Light::Red : Light::Green;
}

static void logStatus(float cm) {
  char dist[24];
  if (Sensor::faulted()) strcpy(dist, "NO SENSOR");
  else if (cm < 0)       strcpy(dist, "warming up");
  else if (cm >= MAX_CM) strcpy(dist, "no object");   // 400 cm is the sensor's "nothing in range" value
  else                   snprintf(dist, sizeof dist, "%.1f cm", cm);

  Net::Connection c;
  Net::connection(c);

  // The socket line names the reason when it is not ready, so a fault says
  // what is wrong instead of only that something is.
  const char *socket = Net::ready()
      ? (Net::readingAcknowledged() ? "acked" : "no-ack")
      : Net::lastError();

  // One print, so a line never arrives half-written.
  Net::serialLock();
  Serial.printf(
    "[%8lu ms] data : distance %-12s raw %7.1f cm | occupied %-3s | pir %-4s %-5s | led %-6s\n"
    "[%8lu ms] link : wifi %-4s %-15s %4d dBm | ws %-12s | desk %ld state %-7s call %-8s | seq %ld\n",
    millis(), dist, Sensor::rawCm(),
    Sensor::occupied() ? "yes" : "no",
    Pir::motion() ? "HIGH" : "LOW", Pir::ready() ? "ready" : "warmup",
    Indicators::lightName(Indicators::light()),
    millis(),
    c.wifiUp ? "up" : "down", c.ip, c.rssi,
    socket,
    c.deskId, c.serviceState, c.callEvent,
    c.lastAckSequence);
  Net::serialUnlock();
}

// The connection in full, printed when it changes and every 30 s otherwise.
// This is the block to read when a board will not connect: it says what the
// board believes about the network, the socket, the assignment and the last
// thing that happened, in one place.
static void logConnection(const Net::Connection &c) {
  Net::serialLock();
  Serial.printf(
    "=== connection ================================================\n"
    "  uptime     : %lu ms\n"
    "  wifi       : %-4s  ip %-15s  rssi %d dBm\n"
    "  endpoint   : %s\n"
    "  socket     : %-4s   authenticated %s\n"
    "  assignment : desk %ld   state %-7s   call %s\n"
    "  last event : %s\n"
    "  failures   : %d\n"
    "  telemetry  : seq %ld   server time %s\n"
    "================================================================\n",
    millis(),
    c.wifiUp ? "up" : "down", c.ip, c.rssi,
    c.endpoint,
    c.socketUp ? "up" : "down", c.authenticated ? "ok" : "no",
    c.deskId, c.serviceState, c.callEvent,
    c.lastEvent,
    c.failures,
    c.lastAckSequence, c.lastAckTime);
  Net::serialUnlock();
}

static void applyPushedSetting() {
  Net::Setting fresh;
  if (Net::takeSetting(fresh)) {
    deskSetting = fresh;
    if (fresh.valid) {
      if (fresh.baseline || fresh.state != "active") Indicators::baselineCall(fresh.callId);
      else Indicators::announceCall(fresh.callId, fresh.callEvent, fresh.callAge);
    }
  }
  if (!Net::ready()) {
    deskSetting = Net::Setting();
    Indicators::silence();
  }
}

static void sendReport() {
  float cm = Sensor::distanceCm();
  Net::Reading reading{cm, Sensor::occupied(), Pir::near(),
                       Indicators::lightName(Indicators::light())};
  Net::postReading(reading);
  logStatus(cm);
}

void setup() {
  Serial.begin(115200);
  delay(300);

  uint64_t mac = ESP.getEfuseMac();
  Net::serialLock();
  Serial.println("\n=== MyTurn service desk board ============================");
  Serial.printf("  board MAC   : %02X:%02X:%02X:%02X:%02X:%02X\n",
                (uint8_t)(mac >> 40), (uint8_t)(mac >> 32), (uint8_t)(mac >> 24),
                (uint8_t)(mac >> 16), (uint8_t)(mac >> 8), (uint8_t)mac);
  Serial.printf("  chip id     : %08X\n", (uint32_t)(mac >> 32));
  Serial.printf("  free heap   : %lu bytes\n", (unsigned long)ESP.getFreeHeap());
  Net::serialUnlock();

  // Initialize Watchdog Timer (8s timeout)
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_MS,
    .idle_core_mask = 0x03,  // Watch both cores (ESP32 is dual-core)
    .trigger_panic = false,
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
  lastWdtFeed = millis();
  Serial.printf("  watchdog    : %lu ms timeout, fed every %lu ms\n",
                WDT_TIMEOUT_MS, WDT_FEED_INTERVAL_MS);

  Indicators::begin();
  Sensor::begin();
  Pir::begin();
  Net::begin();
}

void loop() {
  // Feed watchdog every WDT_FEED_INTERVAL_MS to prevent reset
  if (millis() - lastWdtFeed >= WDT_FEED_INTERVAL_MS) {
    esp_task_wdt_reset();
    lastWdtFeed = millis();
  }

  Sensor::update();
  Pir::update(Sensor::occupied());
  Indicators::update();
  applyPushedSetting();

  // Applied every pass, from the last state read, so somebody arriving or
  // leaving turns the light over without waiting for the network.
  Indicators::setLight(chooseLight(deskSetting, Sensor::occupied()));

  // The connection in full, when it changes and every 30 s otherwise, so a
  // fault that never recovers is still on the log. It is read once a second
  // rather than on every pass, because the sensor loop runs far faster than
  // anything about the connection changes.
  static char seenEvent[96] = "";
  static bool seenWifi = false, seenSocket = false, seenAuth = false;
  static unsigned long lastDetailAt = 0, lastCheckAt = 0;
  if (millis() - lastCheckAt >= 1000) {
    lastCheckAt = millis();
    Net::Connection current;
    Net::connection(current);
    bool connectionChanged = current.wifiUp != seenWifi
                          || current.socketUp != seenSocket
                          || current.authenticated != seenAuth
                          || strcmp(current.lastEvent, seenEvent) != 0;
    if (connectionChanged || millis() - lastDetailAt >= CONNECTION_LOG_MS) {
      logConnection(current);
      seenWifi = current.wifiUp;
      seenSocket = current.socketUp;
      seenAuth = current.authenticated;
      strlcpy(seenEvent, current.lastEvent, sizeof seenEvent);
      lastDetailAt = millis();
    }
  }

  unsigned long interval = Pir::approaching() ? FAST_MS : INTERVAL_MS;
  // Occupancy, approach and applied LED changes are sent without waiting for
  // the periodic report. Only the latest reading is queued while offline.
  static bool lastOccupied = false, lastApproach = false, wasReady = false;
  static Light lastLight = Light::Yellow;
  bool ready = Net::ready();
  bool changed = lastOccupied != Sensor::occupied() || lastApproach != Pir::near() || lastLight != Indicators::light();
  if (changed || (ready && !wasReady) || millis() - lastSend >= interval) {
    sendReport();
    lastSend = millis();
    lastOccupied = Sensor::occupied();
    lastApproach = Pir::near();
    lastLight = Indicators::light();
  }
  wasReady = ready;
  delay(2);
}
