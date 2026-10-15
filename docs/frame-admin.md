# On-device Frame settings

Rich's AEEZO Android 6 frame, added 15 October 2026. This is the personal-dashboard branch, not an upstream firmware change.

## Open

Use **Controls** in the Life sidebar, hold two fingers still for 1.5 seconds, or hold the top-left corner for 5 seconds.

## Controls

- **Display**: saved dashboard brightness and clock/night brightness, both bounded to 5–100%. The night slider previews the result. Done restores the brightness for the current display mode. These are app-window settings, not global Android brightness.
- **Light control**: automatic switching checkbox, live light sensor value, dark/light thresholds, dark/light delays and touch override. Delays accept whole seconds from 1–600. Light must exceed dark. Cancel does not save. Existing calibrated 10/15 thresholds and 20/3/60-second delays are preserved.
- **Dashboard**: Today, TEAMTRI, clock, reload all three web panes, startup tab, text size 75–150% and reset text size. Text size is not whole-page zoom. No cookies or sign-ins are cleared.
- **Wi-Fi and network**: current IPv4 addresses, port guidance and Android Wi-Fi settings shortcut. Changing networks may make the local dashboard server unreachable.
- **Health and status**: build label, Android/app versions, model, uptime, free storage, IP, sensor and last maintenance outcome. It does not claim every data source is healthy.
- **Maintenance**: temporary wireless ADB checkbox, actual listener status, confirmation before opening, separate emergency close action, app restart, confirmed frame restart and Android date/app/accessibility shortcuts.
- Android settings and launcher remain accessible.

## Wireless ADB

The port is **5555**, on this frame currently `192.168.50.9`. The address can change.

1. Open **Controls → Maintenance**.
2. Tick **Enable wireless ADB temporarily (30 minutes)** and confirm.
3. Wait for the checked box and **Wireless ADB OPEN** status, which checks `/proc/net/tcp` and `tcp6`, not just the requested property.
4. Connect using `adb connect FRAME_IP:5555`.
5. Untick to close. Closing restarts adbd, which also closes existing TCP sessions. USB reconnects after the brief restart.

The checkbox is off on a fresh app launch. Closing the panel alone leaves an active session open. A separate token-bound root timer closes it after 30 minutes. A previous timer cannot close a newer session. Normal app launch invalidates timers and closes the port. The code uses the non-persistent `service.adb.tcp.port`, not `persist.adb.tcp.port`, so normal reboot does not restore TCP debugging. The maintenance panel rechecks the actual listener every five seconds.

**There is no ADB authentication on this firmware.** This is a temporary physical-access switch, not a network firewall or account-based access control. Any device that can reach the frame may control it while open. Use only on the trusted home network. No port forwarding or persistent TCP debugging was added. Privileged methods are native only, with no new web/JavaScript command interface.

This device's existing `/system/xbin/su` permits the app UID to use root. This is device-specific, not a portable Android feature. Failures must show an unverified/error state, not a successful checkbox.

## Build and recovery

Retain the installed manifest/resources, compile all Java with Android API 34 stubs, target Java 8, D8 min API 23 and sign with the existing Home HQ certificate. Normal `adb install -r` preserves settings and cookies. Never uninstall or clear data to solve a signature mismatch. Standard build script remains available for a complete SDK.

The previous APK is backed up on Rich's Mac at `~/Tools/android/frame-admin-20261015/before-admin.apk`. Final APK and proof are in the workspace's `outputs/photo-frame-2026-10-15/admin/`. The original signing key remains on the Mac. Temporary local key copies were deleted.
