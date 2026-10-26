#include "Pir.h"
#include "config.h"

namespace Pir {
namespace {
// The module's output flickers when somebody is standing at the counter.
//
// The first filter used here waited for the pin to hold one value for a
// while before believing it. Against a signal that toggles faster than that,
// it froze on whichever level it happened to catch - and a frozen LOW is a
// PIR that has stopped working, not a PIR that is slower.
//
// This one counts how much of a short window was HIGH. A flicker reads as
// motion, which is what a flicker at a counter is, and the answer comes in
// well under a tenth of a second. Two thresholds, so the reading does not
// wobble around the line: three HIGH samples to believe there is motion, one
// to believe it has stopped.
constexpr uint8_t WINDOW_SAMPLES = 10;
constexpr uint8_t MIN_HIGH_SAMPLES = 3;
constexpr uint8_t MAX_LOW_SAMPLES = 1;

bool ring[WINDOW_SAMPLES] = {false};
uint8_t nextSlot = 0, highCount = 0;
bool pin = false, near_ = false, armed = true;
unsigned long since = 0, bootMs = 0, lastSampleAt = 0;
}

void begin() {
  // A pull-down, not a bare input. If the module's OUT wire comes loose, a
  // floating GPIO 19 picks up noise and the duty-cycle filter below reads it
  // as motion for as long as the board is powered - ten hours of "approach"
  // with nobody at the counter. A disconnected sensor must read LOW, so the
  // fault shows up as no motion instead of a permanent approach.
  pinMode(PIR_PIN, INPUT_PULLDOWN);
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
