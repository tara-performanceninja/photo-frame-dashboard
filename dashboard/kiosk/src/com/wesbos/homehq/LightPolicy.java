package com.wesbos.homehq;

/** Pure sensor policy. Uses monotonic milliseconds, never wall-clock time. */
final class LightPolicy {
  static final int NONE = 0, DARK = 1, LIGHT = 2;
  float dark = 45, light = 55;
  long darkDelay = 20000, lightDelay = 3000, touchDelay = 60000;
  boolean darkness;
  private long since = -1, overrideUntil;
  private int candidate;

  int sample(float value, long now) {
    if (Float.isNaN(value) || Float.isInfinite(value) || value < 0) {
      reset(); return NONE;
    }
    int next = value <= dark ? DARK : value >= light ? LIGHT : NONE;
    if (now < overrideUntil || next == NONE || (next == DARK && darkness)) {
      reset(); return NONE;
    }
    if (next != candidate) { candidate = next; since = now; }
    if (now - since < (next == DARK ? darkDelay : lightDelay)) return NONE;
    reset();
    if (next == DARK) { darkness = true; return DARK; }
    if (darkness) { darkness = false; return LIGHT; }
    return NONE; // Steady daylight must not dismiss an idle screen saver.
  }

  void manual(long now) { darkness = false; overrideUntil = now + touchDelay; reset(); }
  void reset() { candidate = NONE; since = -1; }
}
