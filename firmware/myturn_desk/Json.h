#pragma once
#include <Arduino.h>

// Tiny reader for the server's small, flat JSON reply (no JSON library needed).
namespace Json {

inline int valueStart(const String &j, const char *key) {
  String needle = String("\"") + key + "\"";
  int at = j.indexOf(needle);
  if (at < 0) return -1;
  int colon = j.indexOf(':', at + needle.length());
  if (colon < 0) return -1;
  int s = colon + 1;
  while (s < (int)j.length() && (j[s] == ' ' || j[s] == '\n' || j[s] == '\r' || j[s] == '\t')) s++;
  return s;
}

inline bool isNull(const String &j, int s) {
  return s >= 0 && j.substring(s, s + 4) == "null";
}

inline long getLong(const String &j, const char *key, long fallback) {
  int s = valueStart(j, key);
  if (s < 0 || isNull(j, s)) return fallback;
  int e = s;
  while (e < (int)j.length() && ((j[e] >= '0' && j[e] <= '9') || j[e] == '-')) e++;
  return e == s ? fallback : j.substring(s, e).toInt();
}

// "" for missing OR null (the server uses null to mean "automatic").
inline String getString(const String &j, const char *key) {
  int s = valueStart(j, key);
  if (s < 0 || isNull(j, s) || j[s] != '"') return "";
  int e = j.indexOf('"', s + 1);
  return e < 0 ? "" : j.substring(s + 1, e);
}

}  // namespace Json
