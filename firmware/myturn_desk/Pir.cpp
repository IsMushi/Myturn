#include "Pir.h"
#include "config.h"

namespace Pir {
namespace {
bool pin = false, near_ = false, armed = true;
unsigned long since = 0, bootMs = 0;
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
  pin = digitalRead(PIR_PIN) == HIGH;
  if (!pin) armed = true;                       // must see "no motion" before a new approach
  if (ready() && pin && armed && !near_) {
    near_ = true;
    armed = false;
    since = millis();
  }
  if (near_ && (occupied || millis() - since > APPROACH_MS)) near_ = false;
}

}  // namespace Pir
