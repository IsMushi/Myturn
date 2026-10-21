# MyTurn desk board - wiring (ESP32 DevKitC)

| Part                | Part pin  | ESP32 pin            | Notes                                         |
|---------------------|-----------|----------------------|-----------------------------------------------|
| HC-SR04 ultrasonic  | VCC       | **VIN (5V)**         | NOT 3V3. At 3.3 V it often gives no echo.     |
|                     | GND       | GND                  | Must share ground with the ESP32.             |
|                     | TRIG      | GPIO 5 (D5)          | 3.3 V logic is accepted directly.             |
|                     | ECHO      | GPIO 21 (D21)        | **Through a divider** (below). Echo is 5 V.   |
| HC-SR501 PIR        | VCC       | VIN (5V)             | Needs ~60 s warm-up after power-on.           |
|                     | GND       | GND                  |                                               |
|                     | OUT       | GPIO 19 (D19)        | 3.3 V output, direct.                         |
| Red LED             | anode     | GPIO 25 via 220 ohm  | cathode to GND                                |
| Green LED           | anode     | GPIO 26 via 220 ohm  | cathode to GND                                |
| Yellow LED          | anode     | GPIO 27 via 220 ohm  | cathode to GND                                |
| Buzzer (active mod) | VCC       | 3V3                  |                                               |
|                     | GND       | GND                  |                                               |
|                     | I/O       | GPIO 32 (D32)        | HIGH = sound. Passive buzzer: set BUZZER_PASSIVE 1 |

## ECHO voltage divider (protects GPIO 21)

```
HC-SR04 ECHO ----[ 1k ]----+---- GPIO 21
                           |
                         [ 2k ]
                           |
                          GND
```
Gives about 3.3 V. Any ratio near 1:2 works (e.g. 2.2k / 4.7k).

The pin used is `ECHO_PIN` in config.h, currently **GPIO 21**. It was moved from
GPIO 18 to test whether 18 was damaged by earlier 5 V exposure. If the sensor reads
on 21 and did not read on 18, then GPIO 18 is burnt - keep 21. Change both this file
and config.h together when you move it.

## Testing with no resistors yet

The sensor can be tested now. The LEDs should wait - see below.

### ECHO, best option first

1. **Potentiometer as the divider** (any 1k to 100k). Outer pins to the sensor's
   ECHO and to GND, wiper (middle pin) to GPIO 21. Power the sensor, then turn it
   until the wiper reads about 3.3 V on a multimeter. Same job as the 1k/2k pair.
2. **ECHO straight to GPIO 21.** It usually works for a long time, but it puts 5 V
   on a 3.3 V pin and can eventually damage it. Fine for a short test, not for the
   finished desk.
3. **Two 1N4148 diodes in series** on the ECHO wire, if you have them. About 1.4 V
   of drop - borderline, but safer than raw 5 V.

Do **not** power the sensor from 3V3 to dodge the divider. Most HC-SR04 modules do
not work properly at 3.3 V, which just recreates the "no echo" fault. VCC stays on
VIN (5V).

### LEDs

Leave the three LEDs unplugged until the 220 ohm resistors arrive. Wiring an LED
straight to a pin can burn the LED or the pin. The sensor, the PIR and the API all
work without them, and the serial log still prints the state (`led: yellow` etc.).

The buzzer is normally a module with its own driver, so it is fine as wired.

To get the LEDs going sooner: use an LED module (the small boards with a built-in
resistor), or put the potentiometer in series with the LED, start at maximum
resistance and lower it until the LED is bright but not hot.

### Resistors to ask for

Cheap, and salvageable from any dead charger, radio or TV board; electronics shops
in Musanze or Kigali sell them for a few francs each.

- **220 ohm** per LED
- **1k and 2k** for the ECHO divider

## HC-SR04 header order (print on the board)

`VCC  TRIG  ECHO  GND` - if the log says "ECHO stuck HIGH" or "no pulse at all",
check this order first. **Do not swap TRIG and ECHO**: TRIG must reach GPIO 5 and
ECHO must reach GPIO 21 through the divider. Swapping them leaves the sensor
untriggered and drives the ESP32 output into the sensor's ECHO output.

## Notes
- A "RGB LED module" would make GPIO 27 the blue leg, not yellow. Use three separate
  LEDs, or change the colour mapping in Indicators.cpp.
- Power from a good USB cable or a 5 V supply. If the board reboots when the buzzer
  sounds, the supply is sagging (brown-out).
- Server (Flask): `app.run(host="0.0.0.0", port=5000)` and allow port 5000 through
  Windows Firewall on the hotspot network. Test from a phone on the hotspot:
  `http://192.168.137.1:5000`.
