#pragma once
// Copy to secrets.h and fill in.
#define WIFI_SSID   "your-hotspot-name"
#define WIFI_PASS   "your-hotspot-password"
#define API_BASE    "http://192.168.137.1:5000"   // PC on the Windows hotspot
#define DEVICE_KEY  "your-device-key"
// API_BASE is converted to ws://.../ws/device automatically (no HTTP polling).
// For https:// deployments, define WS_CA_CERT as your server's trusted root
// certificate PEM string. TLS is refused without it; insecure TLS is not used.
