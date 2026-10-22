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

// What the link to the server is doing, in words. The value in the "ws" row
// names the state; this says what that state means.
static const char *wsNote(const char *socket) {
  if (!strcmp(socket, "acked"))          return "the server stored the reading";
  if (!strcmp(socket, "no-ack"))        return "sent, but the server has not confirmed it";
  if (!strcmp(socket, "wifi down"))     return "the board is not on the network";
  if (!strcmp(socket, "reconnecting"))  return "the board is reconnecting to the server";
  if (!strcmp(socket, "authenticating")) return "the server is checking the board";
  if (!strcmp(socket, "state expired") || !strcmp(socket, "stale state"))
                                        return "the server's last snapshot is too old";
  if (!strcmp(socket, "config error"))  return "the sketch cannot work out where to connect";
  return "the board has just started";
}

// One report, one block, one timestamp.
//
// The sensors and the link are printed together because they belong to the
// same cycle: what the board saw at the counter, and what it was doing about
// it. One timestamp per block says which cycle a line belongs to; the earlier
// format wrote two headers for the same cycle, so a reader had to guess
// whether the two were the same moment.
//
// Every row carries a note that says what its value means, so the block can
// be read on its own: what "400.0 cm" is, why the light is green, and what
// "acked" says about the server.
static void logReport(float cm) {
  Net::Connection c;
  Net::connection(c);

  // The socket field names the reason when it is not ready, so a fault says
  // what is wrong instead of only that something is.
  const char *socket = Net::ready()
      ? (Net::readingAcknowledged() ? "acked" : "no-ack")
      : Net::lastError();

  char value[64], note[112];

  // One lock, so a block never arrives half-written.
  Net::serialLock();
  Serial.printf("[%8lu ms] report :\n", millis());

  // distance: the median of the last five readings, which is what the desk
  // decides on.
  if (Sensor::faulted()) {
    strcpy(value, "no echo");
    strcpy(note, "the sensor is not answering - check the wiring");
  } else if (cm < 0) {
    strcpy(value, "warming up");
    strcpy(note, "three readings are needed before the median is trusted");
  } else if (cm >= MAX_CM) {
    strcpy(value, "nothing in range");
    strcpy(note, "nothing within 400 cm");
  } else {
    snprintf(value, sizeof value, "%.1f cm", cm);
    strcpy(note, cm < OCCUPIED_CM
                 ? "under 100 cm, so the counter counts as occupied"
                 : "over 100 cm, so the counter counts as clear");
  }
  Net::logRow("distance", value, note);

  // raw: the last single reading, before the median smooths it out. The two
  // together show whether the counter is quiet or in motion.
  float raw = Sensor::rawCm();
  if (raw < 0) {
    strcpy(value, "no echo");
    strcpy(note, "the sensor is not answering");
  } else if (raw >= MAX_CM) {
    snprintf(value, sizeof value, "%.1f cm", raw);
    strcpy(note, "the sensor's own \"nothing in range\" answer");
  } else if (raw < MIN_CM) {
    snprintf(value, sizeof value, "%.1f cm", raw);
    strcpy(note, "too close to trust: the module rings at 2-11 cm");
  } else {
    snprintf(value, sizeof value, "%.1f cm", raw);
    strcpy(note, "the last single reading");
  }
  Net::logRow("raw", value, note);

  // occupied: the ultrasonic's own conclusion. Nothing else may claim it.
  bool occupied = Sensor::occupied();
  strcpy(value, occupied ? "yes" : "no");
  strcpy(note, occupied ? "someone is at the counter" : "the counter is clear");
  Net::logRow("occupied", value, note);

  // pir: the movement sensor. It reports an approach; it never decides.
  if (!Pir::ready()) {
    strcpy(value, "warming up");
    strcpy(note, "the PIR settles for 60 s after power-on");
  } else if (Pir::motion()) {
    strcpy(value, "movement");
    strcpy(note, "the PIR saw someone approach");
  } else {
    strcpy(value, "still");
    strcpy(note, "the PIR sees no movement");
  }
  Net::logRow("pir", value, note);

  // led: the colour, and the reason for it.
  Light light = Indicators::light();
  strcpy(value, Indicators::lightName(light));
  switch (light) {
    case Light::Green:  strcpy(note, "the desk is open and the counter is clear"); break;
    case Light::Red:    strcpy(note, "someone is at the counter"); break;
    case Light::Yellow: strcpy(note, "the desk is paused, closed or not known yet"); break;
    case Light::Blue:   strcpy(note, "a visitor is being called"); break;
    default:            strcpy(note, "no light is on"); break;
  }
  Net::logRow("led", value, note);

  // wifi: the board's own network, not the desk's.
  strcpy(value, c.wifiUp ? "up" : "down");
  strcpy(note, c.wifiUp ? "the board is on the network" : "the board is not on the network");
  Net::logRow("wifi", value, note);

  strcpy(value, c.wifiUp ? c.ip : "none");
  strcpy(note, c.wifiUp ? "the board's address on the network" : "the board has no address yet");
  Net::logRow("address", value, note);

  if (c.wifiUp) {
    snprintf(value, sizeof value, "%d dBm", c.rssi);
    strcpy(note, "the Wi-Fi strength; near 0 is good");
  } else {
    strcpy(value, "none");
    strcpy(note, "no signal while the board is down");
  }
  Net::logRow("signal", value, note);

  // ws: the link to the server.
  strcpy(value, socket);
  strcpy(note, wsNote(socket));
  Net::logRow("ws", value, note);

  // desk: the counter the server assigned to this board.
  if (c.deskId > 0) {
    snprintf(value, sizeof value, "%ld", c.deskId);
    strcpy(note, "the counter the server assigned");
  } else {
    strcpy(value, "none");
    strcpy(note, "the server has not assigned a counter yet");
  }
  Net::logRow("desk", value, note);

  // state: what the desk is doing, server-side.
  strcpy(value, c.serviceState);
  if (!strcmp(c.serviceState, "active"))       strcpy(note, "the desk is open");
  else if (!strcmp(c.serviceState, "paused")) strcpy(note, "the desk is paused");
  else if (!strcmp(c.serviceState, "closed")) strcpy(note, "the desk is closed");
  else                                          strcpy(note, "the server has not said yet");
  Net::logRow("state", value, note);

  // call: who is being called to this desk.
  strcpy(value, c.callEvent);
  if (!strcmp(c.callEvent, "called"))        strcpy(note, "a visitor is being called");
  else if (!strcmp(c.callEvent, "recalled")) strcpy(note, "the visitor is being called again");
  else                                        strcpy(note, "nobody is being called");
  Net::logRow("call", value, note);

  // seq: the last reading the server stored.
  snprintf(value, sizeof value, "%ld", c.lastAckSequence);
  strcpy(note, c.lastAckSequence > 0 ? "the reading number the server stored"
                                      : "no reading has been stored yet");
  Net::logRow("seq", value, note);

  Net::serialUnlock();
}

// The connection in full, printed when it changes and every 30 s otherwise.
// This is the block to read when a board will not connect: it says what the
// board believes about the network, the socket, the assignment and the last
// thing that happened, in one place, and every line says what it means.
static void logConnection(const Net::Connection &c) {
  char value[112], note[112];

  Net::serialLock();
  Serial.println("=== connection ================================================");

  snprintf(value, sizeof value, "%lu ms", millis());
  strcpy(note, "the time since the board was powered");
  Net::logRow("uptime", value, note);

  strcpy(value, c.wifiUp ? "up" : "down");
  strcpy(note, c.wifiUp ? "the board is on the network" : "the board is not on the network");
  Net::logRow("wifi", value, note);

  strcpy(value, c.wifiUp ? c.ip : "none");
  strcpy(note, c.wifiUp ? "the board's address on the network" : "the board has no address yet");
  Net::logRow("address", value, note);

  if (c.wifiUp) {
    snprintf(value, sizeof value, "%d dBm", c.rssi);
    strcpy(note, "the Wi-Fi strength; near 0 is good");
  } else {
    strcpy(value, "none");
    strcpy(note, "no signal while the board is down");
  }
  Net::logRow("signal", value, note);

  strcpy(value, c.endpoint);
  strcpy(note, "where the board connects");
  Net::logRow("endpoint", value, note);

  strcpy(value, c.socketUp ? "up" : "down");
  strcpy(note, c.socketUp ? "the link to the server is open" : "the link to the server is closed");
  Net::logRow("socket", value, note);

  strcpy(value, c.authenticated ? "ok" : "no");
  strcpy(note, c.authenticated ? "the server accepted this board" : "the server has not accepted this board");
  Net::logRow("auth", value, note);

  if (c.deskId > 0) {
    snprintf(value, sizeof value, "%ld", c.deskId);
    strcpy(note, "the counter the server assigned");
  } else {
    strcpy(value, "none");
    strcpy(note, "the server has not assigned a counter yet");
  }
  Net::logRow("desk", value, note);

  strcpy(value, c.serviceState);
  if (!strcmp(c.serviceState, "active"))       strcpy(note, "the desk is open");
  else if (!strcmp(c.serviceState, "paused")) strcpy(note, "the desk is paused");
  else if (!strcmp(c.serviceState, "closed")) strcpy(note, "the desk is closed");
  else                                          strcpy(note, "the server has not said yet");
  Net::logRow("state", value, note);

  strcpy(value, c.callEvent);
  if (!strcmp(c.callEvent, "called"))        strcpy(note, "a visitor is being called");
  else if (!strcmp(c.callEvent, "recalled")) strcpy(note, "the visitor is being called again");
  else                                        strcpy(note, "nobody is being called");
  Net::logRow("call", value, note);

  strcpy(value, c.lastEvent);
  strcpy(note, "the last thing that happened");
  Net::logRow("last event", value, note);

  snprintf(value, sizeof value, "%d", c.failures);
  strcpy(note, "connection failures since boot");
  Net::logRow("failures", value, note);

  snprintf(value, sizeof value, "%ld", c.lastAckSequence);
  strcpy(note, c.lastAckSequence > 0 ? "the reading number the server stored"
                                      : "no reading has been stored yet");
  Net::logRow("seq", value, note);

  strcpy(value, c.lastAckTime);
  strcpy(note, "the server's own clock, so the log and the database can be compared");
  Net::logRow("server time", value, note);

  Serial.println("================================================================");
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
  logReport(cm);
}

void setup() {
  Serial.begin(115200);
  delay(300);

  uint64_t mac = ESP.getEfuseMac();
  char value[64];
  Net::serialLock();
  Serial.println("\n=== MyTurn service desk board ============================");
  snprintf(value, sizeof value, "%02X:%02X:%02X:%02X:%02X:%02X",
           (uint8_t)(mac >> 40), (uint8_t)(mac >> 32), (uint8_t)(mac >> 24),
           (uint8_t)(mac >> 16), (uint8_t)(mac >> 8), (uint8_t)mac);
  Net::logRow("board MAC", value, "the board's address on the network");
  snprintf(value, sizeof value, "%08X", (uint32_t)(mac >> 32));
  Net::logRow("chip id", value, "the chip's own identifier");
  snprintf(value, sizeof value, "%lu bytes", (unsigned long)ESP.getFreeHeap());
  Net::logRow("free heap", value, "memory still free");
  Net::serialUnlock();

  // The Arduino core already brings the task watchdog up in initArduino(), so
  // the running watchdog is reconfigured here rather than initialised again:
  // a second init is refused by the ESP-IDF and is reported as an error at
  // every boot, and the core's own timeout (5 s, panic) is not the one this
  // project wants.
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_MS,
    .idle_core_mask = 0x03,  // Watch both cores (ESP32 is dual-core)
    .trigger_panic = false,
  };
  esp_err_t wdt = esp_task_wdt_reconfigure(&wdt_config);
  if (wdt != ESP_OK) wdt = esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
  lastWdtFeed = millis();
  Net::serialLock();
  char wdtLine[64];
  snprintf(wdtLine, sizeof wdtLine, "%lu ms timeout, %s", WDT_TIMEOUT_MS,
           wdt == ESP_OK ? "armed" : "not armed");
  Net::logRow("watchdog", wdtLine, "the board is reset if the loop hangs; fed every 2000 ms");
  Net::serialUnlock();

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
