#pragma once
#include <Arduino.h>

// HC-SR04 driver: validated pings, median filter, fault detection, debounced occupancy.
namespace Sensor {
void  begin();
void  update();          // call every loop; paces itself to MEASURE_GAP_MS
bool  faulted();
bool  occupied();        // debounced; always false while faulted
float distanceCm();      // median, or -1 while faulted / not enough samples
float rawCm();           // last single ping, -1 if it failed
}
