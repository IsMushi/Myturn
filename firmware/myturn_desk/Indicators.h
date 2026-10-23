#pragma once
#include <Arduino.h>

enum class Light : uint8_t { Off, Green, Red, Yellow, Blue, Fault };

// LEDs and buzzer.
namespace Indicators {
void        begin();
void        update();             // advances the buzzer without blocking sensor updates
void        silence();
void        connectionFault(bool fault); // red + yellow; two beeps once per fault episode
void        setLight(Light l);
Light       light();
const char *lightName(Light l);
void        beep(uint8_t times);
void        baselineCall(long eventId); // reconnect/reassignment never replays an old call
// One beep for a new call, two for a recall. The first reply after boot is a baseline.
void        announceCall(long eventId, const String &type, long ageSeconds);
void        runStartupSequence();   // blink Red->Yellow->Green->Blue before connection monitoring
}
