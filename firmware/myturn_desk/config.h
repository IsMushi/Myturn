#pragma once
#include <Arduino.h>

// ---- Pins (on the ESP32 the D-number on the silkscreen is the GPIO number) ----
constexpr uint8_t TRIG_PIN   = 5;   // HC-SR04 trigger
constexpr uint8_t ECHO_PIN   = 21;  // HC-SR04 echo through the 5V->3.3V divider.
                                    // Moved from 18 to test whether 18 was damaged.
                                    // Keep this, WIRING.md and the report in sync.
constexpr uint8_t PIR_PIN    = 19;  // HC-SR501 out
constexpr uint8_t RED_PIN    = 25;
constexpr uint8_t GREEN_PIN  = 26;
constexpr uint8_t YELLOW_PIN = 27;
constexpr uint8_t BLUE_PIN   = 33;
constexpr uint8_t BUZZER_PIN = 32;

// ---- Ultrasonic ----
constexpr float         MIN_CM            = 12.0f;   // desk: ignore 2-11 cm ringing; a person is 38-78 cm
constexpr float         MAX_CM            = 400.0f;
constexpr float         US_PER_CM         = 58.0f;
constexpr unsigned long MAX_ECHO_US       = 23200;   // 400 cm; longer = "nothing in range"
constexpr unsigned long PULSE_TIMEOUT_US  = 100000;  // measured: this module's "no object" pulse is ~70.6 ms
constexpr float         OCCUPIED_CM       = 100.0f;
constexpr uint8_t       SAMPLES           = 5;       // median window
constexpr uint8_t       MIN_SAMPLES       = 3;       // need this many before trusting the median
constexpr unsigned long MEASURE_GAP_MS    = 250;     // > the 70.6 ms no-object pulse; also gives the clone time to recover
constexpr unsigned long HOLD_MS           = 2000;    // a change must last this long
constexpr uint8_t       FAULT_AFTER       = 10;      // no-echo samples before "sensor fault" (2.5 s at 250 ms)
constexpr uint8_t       RECOVER_AFTER     = 5;       // consecutive good readings to clear it
constexpr float         RECOVER_SPREAD_CM = 20.0f;   // ...and they must agree with each other
static_assert(RECOVER_AFTER <= SAMPLES, "RECOVER_AFTER must fit in the window");

// ---- PIR / reporting ----
constexpr unsigned long PIR_WARMUP_MS = 60000;
constexpr unsigned long APPROACH_MS   = 10000;
constexpr unsigned long INTERVAL_MS   = 5000;
constexpr unsigned long FAST_MS       = 1000;

// ---- Buzzer (0 = active module, 1 = passive buzzer) ----
#define BUZZER_PASSIVE 0
constexpr unsigned int  BUZZER_TONE_HZ  = 2200;
constexpr unsigned int  BEEP_MS         = 170;
constexpr unsigned int  BEEP_GAP_MS     = 90;
constexpr long          BEEP_MAX_AGE_S  = 20;

// ---- Network ----
constexpr unsigned long WIFI_RETRY_MS     = 10000;
constexpr unsigned long WS_RETRY_BASE_MS  = 1000;
constexpr unsigned long WS_RETRY_MAX_MS   = 30000;
constexpr unsigned long WS_PING_MS        = 10000;
constexpr unsigned long WS_ACK_TIMEOUT_MS = 4000;
constexpr unsigned long WS_STATE_TIMEOUT_MS = 12000;  // server refreshes state every 5 s
constexpr unsigned long WS_READING_MAX_AGE_MS = 6000; // discard obsolete offline samples

// ---- Watchdog Timer ----
constexpr unsigned long WDT_TIMEOUT_MS    = 8000;     // Reset if loop() blocks > 8s
constexpr unsigned long WDT_FEED_INTERVAL_MS = 2000;  // Feed watchdog every 2s during long operations
