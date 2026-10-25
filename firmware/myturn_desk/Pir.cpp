#include "Pir.h"
#include "config.h"

namespace Pir {
namespace {
// The module's output flickers when somebody is standing at the counter.
//
// Enhanced filtering: shorter window for faster response while still rejecting
// noise. Uses majority-like threshold with hysteresis to avoid chattering.
constexpr uint8_t WINDOW_SAMPLES = 6;
constexpr uint8_t MIN_HIGH_SAMPLES = 2;  // 1/3 of window to trigger (faster response)
constexpr uint8_t MAX_LOW_SAMPLES = 1;   // 1/6 to clear (hysteresis)

bool ring[WINDOW_SAMPLES] = {false};
uint8_t nextSlot = 0, highCount = 0;
bool pin = false, near_ = false, armed = true;
unsigned long since = 0, bootMs = 0, lastSampleAt = 0;
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
  unsigned long now = millis();

  // Sample on a fixed cadence, so the window is a fixed length of time
  // however fast the main loop happens to be running.
  if (now - lastSampleAt >= PIR_SAMPLE_MS) {
    lastSampleAt = now;
    bool sample = digitalRead(PIR_PIN) == HIGH;
    ring[nextSlot] = sample;
    nextSlot = (nextSlot + 1) % WINDOW_SAMPLES;
    highCount = 0;
    for (uint8_t i = 0; i < WINDOW_SAMPLES; i++) if (ring[i]) highCount++;

    if (pin) {
      if (highCount <= MAX_LOW_SAMPLES) pin = false;
    } else if (highCount >= MIN_HIGH_SAMPLES) {
      pin = true;
    }
  }

  if (!pin) armed = true;                       // must see "no motion" before a new approach
  if (ready() && pin && armed && !near_) {
    near_ = true;
    armed = false;
    since = now;
  }
  if (near_ && (occupied || now - since > APPROACH_MS)) near_ = false;
}

}  // namespace Pir
