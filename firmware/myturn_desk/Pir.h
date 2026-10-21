#pragma once
#include <Arduino.h>

// HC-SR501 approach detection. An approach that never becomes occupancy is a walk-past.
namespace Pir {
void begin();
void update(bool occupied);
bool approaching();   // drives the fast reporting rate
bool near();          // what the API is told (false during PIR warm-up)
bool motion();        // raw pin
bool ready();
}
