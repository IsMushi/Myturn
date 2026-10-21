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

  Serial.printf("distance: %s (raw %.1f)\n", dist, Sensor::rawCm());
  Serial.printf("occupied: %s\n", Sensor::occupied() ? "yes" : "no");
  Serial.printf("pir: %s\n", Pir::motion() ? "HIGH" : "LOW");
  Serial.printf("pir_ready: %s\n", Pir::ready() ? "yes" : "no");
  Serial.printf("led: %s\n", Indicators::lightName(Indicators::light()));
  Serial.print("wifi: ");
  if (Net::connected()) Serial.printf("%d dBm @ %s\n", WiFi.RSSI(), WiFi.localIP().toString().c_str());
  else                  Serial.println("down");
  Serial.print("WebSocket: ");
  if (Net::ready()) Serial.println(Net::readingAcknowledged() ? "ready, telemetry acknowledged" : "ready, awaiting telemetry ack");
  else Serial.println(Net::lastError());
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
  Serial.println("\nMyTurn service desk board");
  
  // Initialize Watchdog Timer (8s timeout)
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_MS,
    .idle_core_mask = 0x03,  // Watch both cores (ESP32 is dual-core)
    .trigger_panic = false,
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
  lastWdtFeed = millis();
  Serial.printf("Watchdog: %lu ms timeout\n", WDT_TIMEOUT_MS);
  
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
