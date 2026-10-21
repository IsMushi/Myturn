/*
  MyTurn - HC-SR04 ultrasonic-only test

  This sketch does one thing: trigger the HC-SR04 and print the raw echo
  pulse and distance. It has no WiFi, API, PIR, LEDs, buzzer or median filter,
  so a "NO ECHO" here means the sensor/wiring, not the main firmware.

  Wiring (ESP32 DevKitC):
    HC-SR04 VCC  -> VIN (5V), NOT 3V3
    HC-SR04 GND  -> GND (common with the ESP32)
    HC-SR04 TRIG -> GPIO 5  (board label D5)
    HC-SR04 ECHO -> 1k -> GPIO 21 (board label D21), and GPIO 21 -> 2k -> GND

  The ESP32 Arduino core does not define D5/D21 macros, so the code uses the
  GPIO numbers. On the DevKitC, D5 is GPIO 5 and D21 is GPIO 21.

  Open Serial Monitor at 115200 baud.
*/

#include <Arduino.h>

constexpr uint8_t TRIG_PIN = 5;   // board label D5
constexpr uint8_t ECHO_PIN = 21;  // board label D21

// 100 ms: the HC-SR04's "nothing in range" pulse is about 38 ms, but some
// clones stretch it well past 60 ms. A longer timeout tells us whether a
// "NO ECHO" is really no pulse or just a pulse we stopped listening for.
constexpr unsigned long PULSE_TIMEOUT_US = 100000;
constexpr unsigned long READ_INTERVAL_MS = 500;

constexpr float US_PER_CM = 58.0f;
constexpr unsigned long MAX_ECHO_US = 23200;  // about 400 cm

unsigned long lastRead = 0;
unsigned long readings = 0;
unsigned long echoes = 0;

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  Serial.println();
  Serial.println("MyTurn HC-SR04 ultrasonic test");
  Serial.printf("TRIG GPIO %u | ECHO GPIO %u | timeout %lu us\n",
                TRIG_PIN, ECHO_PIN, PULSE_TIMEOUT_US);
  Serial.println("VCC -> VIN (5V), GND -> GND, ECHO -> divider -> GPIO 21");
  Serial.println("Do not power an HC-SR04 from 3V3.");
  Serial.println();
}

void loop() {
  if (millis() - lastRead < READ_INTERVAL_MS) return;
  lastRead = millis();
  readings++;

  // A healthy ECHO line is LOW before the trigger.
  bool idleHigh = digitalRead(ECHO_PIN) == HIGH;

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long us = pulseIn(ECHO_PIN, HIGH, PULSE_TIMEOUT_US);

  Serial.printf("#%lu idle:%s | ", readings, idleHigh ? "HIGH" : "LOW");

  if (idleHigh) {
    Serial.print("ECHO already HIGH before trigger; ");
  }

  if (us == 0) {
    Serial.println("NO ECHO (0 us)");
    Serial.println("   check 5V at VCC, common GND, TRIG on GPIO 5, "
                   "ECHO divider on GPIO 21, and header order VCC-TRIG-ECHO-GND");
    if (readings % 20 == 0) {
      Serial.printf("--- %lu echoes / %lu reads ---\n", echoes, readings);
    }
    return;
  }

  echoes++;
  float cm = us / US_PER_CM;
  Serial.printf("pulse %lu us = %.1f cm", us, cm);
  if (us >= MAX_ECHO_US) {
    Serial.print("  (>= 400 cm / no object in range)");
  }
  Serial.println();

  if (readings % 20 == 0) {
    Serial.printf("--- %lu echoes / %lu reads ---\n", echoes, readings);
  }
}
