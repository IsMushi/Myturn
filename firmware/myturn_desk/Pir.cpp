#include "Pir.h"
#include "config.h"

namespace Pir {
namespace {
bool pin = false, near_ = false, armed = true;
bool raw = false;                   // the last sample from the pin
unsigned long since = 0, bootMs = 0, rawSince = 0;
}

void begin() {
  pinMode(PIR_PIN, INPUT);
  bootMs = millis();
}

bool ready()      { return millis() - bootMs > PIR_WARMUP_MS; }
bool motion()     { return pin; }
bool approaching(){ return near_; }
bool near()       { return ready() && (near_ || pin); }

void update(bool occupied) {
  // The pin is debounced before anything believes it. A person standing at
  // the counter makes the module flicker on and off, and an undebounced pin
  // turns every flicker into a new report - the log fills up and the server
  // is sent a reading every loop instead of every five seconds.
  bool sample = digitalRead(PIR_PIN) == HIGH;
  if (sample != raw) {
    raw = sample;
    rawSince = millis();
  }
  if (millis() - rawSince >= PIR_DEBOUNCE_MS) pin = raw;

  if (!pin) armed = true;                       // must see "no motion" before a new approach
  if (ready() && pin && armed && !near_) {
    near_ = true;
    armed = false;
    since = millis();
  }
  if (near_ && (occupied || millis() - since > APPROACH_MS)) near_ = false;
}

}  // namespace Pir
