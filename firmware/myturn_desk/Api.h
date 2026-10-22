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

// A snapshot of the connection, for the serial log.
//
// The buffers are fixed size on purpose: the network task fills them while
// the sensor loop reads them, and a heap-allocated String could be resized
// under the reader's feet.
struct Connection {
  bool wifiUp;
  int rssi;
  char ip[16];
  char endpoint[96];
  bool socketUp;
  bool authenticated;
  char lastEvent[96];
  int failures;
  long deskId;
  char serviceState[12];
  char callEvent[12];
  long lastAckSequence;
  char lastAckTime[32];
};

void begin();
bool connected();               // Wi-Fi only
bool ready();                   // authenticated socket with a fresh desk snapshot
bool readingAcknowledged();
bool postReading(const Reading &reading); // queued locally, NOT a server acknowledgement
bool takeSetting(Setting &out); // consumes a pushed state; never makes an HTTP request
const char *lastError();
void connection(Connection &out); // the details behind the lastError() line

// The serial log is written by two tasks - the sensor loop and the network
// task. Holding this lock across a print keeps a line from being split by
// the other task's output.
void serialLock();
void serialUnlock();

// One line in the log's own form, for any module that has something to say.
// It takes the same lock as the blocks, so a message never lands in the
// middle of one.
void logEvent(const char *message);

// One row of the log: a label, a colon, the value, and a note in parentheses
// that says what the value means. The caller holds the serial lock, so a
// whole block is written in one go.
void logRow(const char *label, const char *value, const char *note);
}
