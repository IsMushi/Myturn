#pragma once
#include <Arduino.h>

// Socket/Wi-Fi work lives on its own FreeRTOS task; the sensor loop never
// waits for DNS, a TCP connection, an acknowledgement or a reconnect.
namespace Net {
struct Reading {
  float cm;
  bool occupied;
  bool approach;
  const char *led;
};

struct Setting {
  bool valid = false;
  bool baseline = true;          // initial/reassigned state must not announce an old call
  String state = "paused";
  long callId = -1;
  String callEvent;
  long callAge = -1;
};

void begin();
bool connected();               // Wi-Fi only
bool ready();                   // authenticated socket with a fresh desk snapshot
bool readingAcknowledged();
bool postReading(const Reading &reading); // queued locally, NOT a server acknowledgement
bool takeSetting(Setting &out); // consumes a pushed state; never makes an HTTP request
const char *lastError();
}
