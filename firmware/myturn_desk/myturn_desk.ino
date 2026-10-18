/*
 * MyTurn service desk board
 * -------------------------
 * ESP32 DevKitC with an HC-SR04 ultrasonic sensor, an HC-SR501 PIR sensor and
 * one RGB LED. The board measures the distance to the person at the counter,
 * tells the API about it, and shows the desk state on the light.
 *
 * The ultrasonic sensor has the only vote on occupancy. The PIR sensor is used
 * for approach detection: it raises the sampling rate to one second so the
 * dashboard can show that a visitor is walking up, and an approach that never
 * becomes occupancy is treated as a walk-past.
 *
 * Copy secrets.example.h to secrets.h and fill in the four values.
 *
 * Board: "ESP32 Dev Module", libraries: WiFi, HTTPClient (both come with the
 * ESP32 board package).
 */

#include <WiFi.h>
#include <HTTPClient.h>

#include "secrets.h"

// Pins, as wired on the breadboard.
#define TRIG_PIN 5
#define ECHO_PIN 18
#define PIR_PIN 19
#define RED_PIN 25
#define GREEN_PIN 26
#define BLUE_PIN 27

// Behaviour.
#define OCCUPIED_CM 100          // nearer than this counts as someone at the desk
#define SAMPLES 5                // readings kept for the median filter
#define HOLD_MS 2000             // a change must last this long to be accepted
#define INTERVAL_MS 5000         // normal reporting interval
#define FAST_MS 1000             // interval while a visitor is approaching
#define APPROACH_MS 10000        // an approach that does not become occupation
#define PIR_WARMUP_MS 60000      // the PIR sensor needs about a minute to settle

float window[SAMPLES];
int nextSlot = 0;
bool occupied = false, candidate = false, approaching = false;
unsigned long candidateSince = 0, lastSend = 0;
unsigned long approachSince = 0, bootMs = 0;
String applied = "yellow";

float measureCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000);
  return us == 0 ? -1.0 : us / 58.0;   // microseconds to centimetres
}

float medianCm() {
  float sorted[SAMPLES];
  for (int i = 0; i < SAMPLES; i++) sorted[i] = window[i];
  for (int i = 1; i < SAMPLES; i++) {
    float value = sorted[i];
    int j = i - 1;
    while (j >= 0 && sorted[j] > value) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = value;
  }
  return sorted[SAMPLES / 2];
}

void setLight(const String &state) {
  bool green = (state == "green" || state == "yellow");
  bool red = (state == "red" || state == "yellow");
  digitalWrite(GREEN_PIN, green ? HIGH : LOW);
  digitalWrite(RED_PIN, red ? HIGH : LOW);
  digitalWrite(BLUE_PIN, LOW);
  applied = state;
}

bool sendJson(const String &path, const String &body, String &reply) {
  HTTPClient http;
  http.begin(String(API_BASE) + path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = body.length() ? http.POST(body) : http.GET();
  bool ok = (code >= 200 && code < 300);
  if (ok) reply = http.getString();
  http.end();
  return ok;
}

void report(float cm, bool busy, bool near, String &setting) {
  String body = "{\"distance_cm\":" + String(cm, 1) +
                ",\"occupied\":" + String(busy ? 1 : 0) +
                ",\"approach\":" + String(near ? 1 : 0) +
                ",\"led_state\":\"" + applied + "\"}";
  String reply;

  // Three attempts, so a lost packet or a short outage does not lose a reading.
  for (int attempt = 0; attempt < 3; attempt++) {
    if (sendJson("/api/device/readings", body, reply)) break;
    delay(400);
  }

  if (sendJson("/api/device/setting", "", reply)) {
    int colon = reply.indexOf("service_state");
    if (colon >= 0) {
      int first = reply.indexOf('"', reply.indexOf(':', colon) + 1);
      int last = reply.indexOf('"', first + 1);
      if (first >= 0 && last > first) setting = reply.substring(first + 1, last);
    }
  }
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("WiFi lost, reconnecting");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
}

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);

  bootMs = millis();
  setLight("yellow");                 // yellow until the server says otherwise
  Serial.begin(115200);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Board address: ");
  Serial.println(WiFi.localIP());

  for (int i = 0; i < SAMPLES; i++) window[i] = 300;
}

void loop() {
  ensureWifi();

  float cm = measureCm();
  if (cm > 0) {
    window[nextSlot] = cm;
    nextSlot = (nextSlot + 1) % SAMPLES;
  }
  float value = medianCm();
  bool busy = (value > 0 && value < OCCUPIED_CM);

  // A change has to last HOLD_MS before it is accepted.
  if (busy != occupied) {
    if (busy != candidate) {
      candidate = busy;
      candidateSince = millis();
    } else if (millis() - candidateSince > HOLD_MS) {
      occupied = busy;
    }
  } else {
    candidate = occupied;
  }

  bool pir = digitalRead(PIR_PIN) == HIGH;             // true while motion is seen
  bool settled = (millis() - bootMs) > PIR_WARMUP_MS;  // ignore the warm-up

  if (settled && pir && !approaching) {
    approaching = true;
    approachSince = millis();
  }
  if (approaching && (occupied || millis() - approachSince > APPROACH_MS)) {
    approaching = false;                               // occupied, or a walk-past
  }

  unsigned long interval = approaching ? FAST_MS : INTERVAL_MS;
  if (millis() - lastSend > interval) {
    String setting = "paused";
    report(value, occupied, settled && (approaching || pir), setting);

    String wanted = (setting == "active") ? (occupied ? "red" : "green") : "yellow";
    if (wanted != applied) setLight(wanted);
    lastSend = millis();
  }
}
