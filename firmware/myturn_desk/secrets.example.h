// Copy this file to secrets.h and fill in your own values.
// secrets.h is not committed, because the device key is a password.

#pragma once

#define WIFI_SSID "your-wifi-name"
#define WIFI_PASS "your-wifi-password"

// The API address the board can reach. On the laboratory network that is the
// laptop running the backend, for example "http://192.168.1.20:5000".
#define API_BASE "http://192.168.1.20:5000"

// Printed by "python seed.py" in the backend folder.
#define DEVICE_KEY "paste-the-device-key-here"
