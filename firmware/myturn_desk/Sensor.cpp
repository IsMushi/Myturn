#include "Sensor.h"
#include "Api.h"
#include "config.h"

namespace Sensor {
namespace {

float window[SAMPLES];
uint8_t count = 0, nextSlot = 0, misses = 0, goods = 0;
bool fault = false, stuck = false, occ = false, candidate = false;
float lastRaw = -1.0f;
unsigned long lastPing = 0, candidateSince = 0;

// One trigger + echo. Returns cm, MAX_CM for "nothing in range", -1 for no echo.
float ping() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long us = pulseIn(ECHO_PIN, HIGH, PULSE_TIMEOUT_US);
  if (us == 0) return -1.0f;                 // ECHO never moved: wiring / power fault
  if (us >= MAX_ECHO_US) return MAX_CM;      // sensor's own timeout pulse: empty room
  return us / US_PER_CM;
}

// A healthy ECHO idles LOW. HIGH before we trigger = floating or shorted line.
bool echoIdleHigh() {
  if (digitalRead(ECHO_PIN) == LOW) return false;
  delayMicroseconds(50);
  return digitalRead(ECHO_PIN) == HIGH;
}

void push(float cm) {
  window[nextSlot] = cm;
  nextSlot = (nextSlot + 1) % SAMPLES;
  if (count < SAMPLES) count++;
}

float median() {
  float s[SAMPLES];
  for (uint8_t i = 0; i < count; i++) s[i] = window[i];
  for (uint8_t i = 1; i < count; i++) {
    float v = s[i];
    int j = i - 1;
    while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; }
    s[j + 1] = v;
  }
  return s[count / 2];
}

float spread() {
  float lo = window[0], hi = window[0];
  for (uint8_t i = 1; i < count; i++) {
    if (window[i] < lo) lo = window[i];
    if (window[i] > hi) hi = window[i];
  }
  return hi - lo;
}

void probe() {
  unsigned long us;
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  us = pulseIn(ECHO_PIN, HIGH, PULSE_TIMEOUT_US);
  // One line per fact, in the log's own form, so a fault reads like the rest
  // of the log and never lands in the middle of a block.
  char line[144];
  if (us == 0) {
    snprintf(line, sizeof line, "probe: TRIG GPIO %u, ECHO GPIO %u -> no pulse at all "
             "(ECHO unconnected, unpowered sensor, or TRIG/ECHO swapped)", TRIG_PIN, ECHO_PIN);
  } else {
    snprintf(line, sizeof line, "probe: TRIG GPIO %u, ECHO GPIO %u -> pulse %lu us = %.1f cm%s",
             TRIG_PIN, ECHO_PIN, us, us / US_PER_CM, us < 116 ? " (too short: noise)" : "");
  }
  Net::logEvent(line);
  snprintf(line, sizeof line, "probe: ECHO pin reads %s", digitalRead(ECHO_PIN) ? "HIGH" : "LOW");
  Net::logEvent(line);
}

void enterFault() {
  fault = true;
  count = nextSlot = 0;          // drop stale/garbage readings
  occ = candidate = false;
  Net::logEvent(stuck
    ? "SENSOR FAULT: ECHO is stuck HIGH (floating, shorted, or wrong header order)."
    : "SENSOR FAULT: no echo. Check 5V power, GND, TRIG/ECHO wiring.");
  probe();
}

void updateOccupancy() {
  bool busy = !fault && count >= MIN_SAMPLES && median() < OCCUPIED_CM;
  if (busy == occ) { candidate = occ; return; }
  if (busy != candidate) { candidate = busy; candidateSince = millis(); }
  else if (millis() - candidateSince > HOLD_MS) occ = busy;
}

}  // namespace

void begin() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void update() {
  if (millis() - lastPing < MEASURE_GAP_MS) return;
  lastPing = millis();

  stuck = echoIdleHigh();
  lastRaw = stuck ? -1.0f : ping();
  bool good = lastRaw >= MIN_CM && lastRaw <= MAX_CM;
  bool shortEcho = lastRaw > 0.0f && lastRaw < MIN_CM;

  if (good) {
    push(lastRaw);
    if (misses) misses--;                    // leaky counter: noise cannot reset it in one go
    if (fault) {
      if (++goods >= RECOVER_AFTER) {
        if (spread() <= RECOVER_SPREAD_CM) {
          fault = false;
          Net::logEvent("sensor: readings are back");
        }
        goods = 0;
      }
    }
  } else if (shortEcho) {
    // 2-11 cm is the module ringing, not a person and not a missing echo.
    // Keep the last valid median and do not let this alone cause a fault.
    goods = 0;
  } else {
    goods = 0;
    if (misses < 255) misses++;
    if (!fault && misses >= FAULT_AFTER) enterFault();
  }
  updateOccupancy();
}

bool  faulted()    { return fault; }
bool  occupied()   { return occ; }
float rawCm()      { return lastRaw; }
float distanceCm() { return (fault || count < MIN_SAMPLES) ? -1.0f : median(); }

}  // namespace Sensor
