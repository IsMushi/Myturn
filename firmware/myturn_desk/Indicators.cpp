#include "Indicators.h"
#include "Api.h"
#include "config.h"

namespace Indicators {
namespace {
Light current = Light::Yellow;
bool sawBaseline = false;
long lastCallId = -1;
uint8_t pendingBeeps = 0;
bool sounding = false;
bool faultActive = false;
unsigned long phaseAt = 0;

void driveBuzzer(bool on) {
#if BUZZER_PASSIVE
  if (on) tone(BUZZER_PIN, BUZZER_TONE_HZ);
  else noTone(BUZZER_PIN);
#else
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
#endif
}
}

void begin() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  current = Light::Off;           // force the first setLight to drive the pins
  setLight(Light::Yellow);        // yellow until the server says otherwise
}

void setLight(Light l) {
  if (l == current) return;
  digitalWrite(GREEN_PIN,  l == Light::Green  ? HIGH : LOW);
  digitalWrite(RED_PIN,    (l == Light::Red || l == Light::Fault) ? HIGH : LOW);
  digitalWrite(YELLOW_PIN, (l == Light::Yellow || l == Light::Fault) ? HIGH : LOW);
  digitalWrite(BLUE_PIN,   l == Light::Blue   ? HIGH : LOW);
  current = l;
}

Light light() { return current; }

const char *lightName(Light l) {
  switch (l) {
    case Light::Green:  return "green";
    case Light::Red:    return "red";
    case Light::Yellow: return "yellow";
    case Light::Blue:   return "blue";
    case Light::Fault:  return "red+yellow";
    default:            return "off";
  }
}

void beep(uint8_t times) {
  silence();
  pendingBeeps = times;
  phaseAt = millis() - BEEP_GAP_MS;
  update();
}

void silence() {
  driveBuzzer(false);
  pendingBeeps = 0;
  sounding = false;
}

void connectionFault(bool fault) {
  if (fault == faultActive) return;
  faultActive = fault;
  if (fault) {
    setLight(Light::Fault);
    beep(2);
    Net::logEvent("connection fault: red + yellow, two beeps");
  } else {
    silence();
    Net::logEvent("connection restored: normal indicators resumed");
  }
}

void update() {
  unsigned long tick = millis();
  if (sounding && tick - phaseAt >= BEEP_MS) {
    driveBuzzer(false);
    sounding = false;
    phaseAt = tick;
    if (pendingBeeps) pendingBeeps--;
  } else if (!sounding && pendingBeeps && tick - phaseAt >= BEEP_GAP_MS) {
    driveBuzzer(true);
    sounding = true;
    phaseAt = tick;
  }
}

void baselineCall(long id) {
  sawBaseline = true;
  lastCallId = id;
  silence();
}

void announceCall(long id, const String &type, long age) {
  if (!sawBaseline) { baselineCall(id); return; }
  if (id <= 0 || id == lastCallId) return;
  lastCallId = id;
  if (age < 0 || age > BEEP_MAX_AGE_S) return;   // stale news after a reconnect
  if (type == "recalled") { beep(2); Net::logEvent("recall: two beeps"); }
  else if (type == "called") { beep(1); Net::logEvent("call: one beep"); }
}

void runStartupSequence() {
  // Blink sequence: Red -> Yellow -> Green -> Blue, then settle on the safe
  // yellow. It shows every LED is wired at power-on.
  setLight(Light::Red);
  delay(300);
  setLight(Light::Yellow);
  delay(300);
  setLight(Light::Green);
  delay(300);
  setLight(Light::Blue);
  delay(300);
}

}  // namespace Indicators
