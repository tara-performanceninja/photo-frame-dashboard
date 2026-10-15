package com.wesbos.homehq;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Native-only maintenance control. No JavaScript bridge and no persistent TCP setting. */
final class WirelessAdb {
  static final int SESSION_SECONDS = 1800;
  private static final String CLOSE = "setprop service.homehq.adb.token 0; setprop service.adb.tcp.port -1; setprop ctl.restart adbd";

  static String root(String command) throws Exception {
    final Process process = new ProcessBuilder("/system/xbin/su", "0", "/system/bin/sh", "-c", command)
        .redirectErrorStream(true).start();
    Thread guard = new Thread(() -> {
      try { Thread.sleep(15000); process.destroy(); } catch (InterruptedException ignored) { }
    });
    guard.setDaemon(true); guard.start();
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    InputStream input = process.getInputStream();
    try {
      byte[] buffer = new byte[1024]; int n;
      while ((n = input.read(buffer)) != -1) {
        if (bytes.size() + n > 65536) throw new java.io.IOException("Command output too large");
        bytes.write(buffer, 0, n);
      }
      if (process.waitFor() != 0) throw new java.io.IOException("Device command failed");
      return bytes.toString("UTF-8").trim();
    } finally { guard.interrupt(); input.close(); process.destroy(); }
  }

  static boolean listening() throws Exception {
    return hasListener(root("cat /proc/net/tcp /proc/net/tcp6"));
  }
  static boolean hasListener(String sockets) {
    for (String row : sockets.split("\\n")) {
      String[] fields = row.trim().split("\\s+");
      if (fields.length > 3 && fields[1].endsWith(":15B3") && "0A".equals(fields[3])) return true;
    }
    return false;
  }

  static void setEnabled(boolean enabled) throws Exception { setEnabled(enabled, SESSION_SECONDS); }
  static void setEnabled(boolean enabled, int seconds) throws Exception {
    if (seconds < 1 || seconds > SESSION_SECONDS) throw new IllegalArgumentException();
    if (enabled) {
      String token = String.valueOf(System.nanoTime() & Long.MAX_VALUE);
      // Independent root watchdog survives app replacement, crash and leaving settings.
      // The token means an old timer cannot shut down a later maintenance session.
      root("setprop service.homehq.adb.token " + token);
      // Launch the timer separately. Waiting on a shell with a background child can
      // keep Android's process pipes open for the whole timer duration.
      Process timer = new ProcessBuilder("/system/xbin/su", "0", "/system/bin/sh", "-c",
          "exec >/dev/null 2>&1; sleep " + seconds
          + "; if [ \"$(getprop service.homehq.adb.token)\" = " + token
          + " ]; then " + CLOSE + "; fi").redirectErrorStream(true).start();
      timer.getOutputStream().close();
      timer.getInputStream().close();
      root("setprop service.adb.tcp.port 5555; setprop ctl.restart adbd");
    } else {
      boolean open = listening();
      String port = root("getprop service.adb.tcp.port");
      boolean configured = !port.isEmpty() && !"-1".equals(port) && !"0".equals(port);
      // Do not restart a daemon that is already USB-only. Otherwise a quick next
      // enable can race the pending, unnecessary daemon restart.
      root("setprop service.homehq.adb.token 0; setprop service.adb.tcp.port -1"
          + (open || configured ? "; setprop ctl.restart adbd" : ""));
    }
    for (int i = 0; i < 30; i++) {
      if (listening() == enabled) return;
      Thread.sleep(100);
    }
    // Fail closed if starting the session could not be verified.
    if (enabled) root(CLOSE);
    throw new java.io.IOException("Could not verify wireless ADB " + (enabled ? "open" : "closed"));
  }
}
