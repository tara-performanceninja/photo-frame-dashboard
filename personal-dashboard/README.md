# Rich's frame dashboard

PerformanceNinja-branded, lightweight dashboard built on Tara for the 1024 × 600 PF1007L. This is a separate web application. It does not modify the working Android launcher, Home-app registration, exit gesture, WebView or firmware.

## Current delivery

- Private preview: https://tara.tail1bbd6f.ts.net:8443/
- Today: live calendar, live London weather, Next up and a dated Apple Reminders snapshot.
- Left navigation: Today, TEAMTRI, AI usage, Linear and Tara.
- On the frame, Home HQ 1.3-life displays TEAMTRI in a separate first-party WebView beside the fixed Life menu. Sign-in persists. Today returns to the day view, including from ambient mode. Controls opens the existing launcher/settings menu. An ordinary browser still offers the original external link because Strict session cookies prevent a straightforward cross-site iframe. Production TEAMTRI authentication and cookies are unchanged.
- The frame opens TEAMTRI's existing TV presentation automatically on page load and when selecting its tab. The Life sidebar remains visible. A bounded hydration wait invokes the existing F shortcut only on the authenticated dashboard route, then stops once TV view appears. Login pages are untouched, and Exit TV view remains usable until the next tab selection or page load. Ordinary browser links are unchanged.
- Ambient: light-controlled on the frame, with a manual clock button and tap to return. Ordinary browser previews retain the two-minute idle clock. Night colours between 22:00 and 06:00 London time, small periodic content movement.
- Source uses HTML/CSS/JavaScript without a bundler or frontend framework. Assets, including Montserrat and the original brand icon, are local. No Google Fonts dependency.

## Data and privacy

Calendar reads use the existing authenticated `gws` connection for Personal, TEAMTRI, Military Sherpa and Cirion Group. Google expands recurring events. Pagination, occurrence-level deduplication and declined/cancelled filtering happen server-side. The feed covers today through the next seven days. Today shows all-day and remaining timed appointments. Next up shows a current or upcoming timed appointment or upcoming dated reminder. All times use Europe/London.

Weather uses Open-Meteo. **London is the initial location**, not a verified precise home location. Weather and calendar refresh on Tara every five minutes. The browser reloads the current cache every minute.

Reminders currently contains the five upcoming-week entries from the authorised Mac read taken before Rich asked to stop Mac work. It does not contain overdue or undated reminders and does not refresh automatically. The UI labels it as a snapshot and adds an age warning. It is read-only, with no misleading completion controls. Continuous Apple Reminders sync requires a supported source route. The initial web build stayed on Tara. Rich later authorised Mac access to switch and update the frame.

All personal cache, access keys and Tailscale identity metadata live in ignored `.state/` files, with restricted file permissions. They are excluded from the release archive and Git. Calendar OAuth stays in its existing host-owned location and never reaches the browser. The HTTP server allowlists assets rather than exposing a directory tree. API writes are not implemented.

The preview uses a separate Tailscale Serve HTTPS listener on **8443**, leaving the existing OpenClaw listener on 443 unchanged. Only the configured tailnet owner is accepted through Tailscale's loopback proxy identity header. Spoofing that header over the LAN is rejected. Direct LAN access requires the private device session key. Tailscale metadata is discovered locally, not hardcoded in source. The production gateway was not restarted or reconfigured.

## Running and rollback

The preview runs as the new user service `photo-frame-dashboard.service`. Its unit is in `~/.config/systemd/user/`. It starts this file's `server.py` on port 8788 and restarts after failures. Stop only this preview with:

```sh
systemctl --user disable --now photo-frame-dashboard.service
sudo tailscale serve --https=8443 off
```

Do not reset Tailscale Serve, which would affect other applications. Do not restart OpenClaw.

For a local-only manual run:

```sh
python3 server.py --bind 127.0.0.1 --port 8788
```

A LAN device launch link can be generated locally from `.state/access.json` when installation on the frame is authorised. Do not paste or log its access key publicly. The frame runs this dashboard. Its launch URL is saved privately in Home HQ preferences and automatic Home-app startup has been verified after reboot. Both content and menu retry failed loads while Wi-Fi starts.

## Brand source

Colours are from `knowledge/performanceninja/branding/source/PerformanceNinja Brand Colours.pdf`: navy `#003D79`, blue `#0065AB`, cyan `#0094D3` and purple `#75569B`. Pale surfaces use approved palette tints. The unchanged full white logo (with a separate original icon for the favicon) is from the same canonical brand folder. Montserrat is bundled from the current PerformanceNinja website assets. The dashboard's layout is not a toolkit slide and does not inherit presentation navigation or slide contracts.

## Verification

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --check app.js
python3 /home/adminrichwebb/.openclaw/workspace/worktrees/pn-toolkit-continuation/scripts/run-verification.py --timeout 120 -- node /home/adminrichwebb/.openclaw/workspace/projects/photo-frame-dashboard/personal-dashboard/tests/browser.cjs
```

Proof and screenshots: `outputs/photo-frame-2026-10-13/customisation/` in the Tara workspace. Browser checks cover 1024 × 600, 1280 × 800, 1440 × 900 and 390 × 844, tabs, ambient touch/idle, full event details, long titles, safe text rendering, empty/error states and data access controls. List panels deliberately scroll. Very long Next up titles use a three-line summary with the full title available from the details arrow. Device proof now includes signed-in TEAMTRI with the Life menu, Controls/launcher, boot recovery and Today navigation. Screenshots are in the same evidence folder.

## Persistent Life menu update, 13 October

Installed Home HQ 1.3-life (version code 4) with the original signing certificate, home registration and exact modified exit-gesture code retained. The app uses `../dashboard/kiosk/src/com/wesbos/homehq/LifeShell.java` for separate first-party Today and TEAMTRI panes alongside the branded menu. TEAMTRI receives no JavaScript bridge. Only the trusted LAN Life menu receives tab, ambient and Controls actions. No protected TEAMTRI data is proxied.

The canonical integrated app source is now in this Tara checkout. The original Mac source remains unchanged. `../scripts/prepare-life-shell.py` stages a review copy from a pre-update modified MainActivity and refuses unexpected or already-patched source.

The Mac's standard Java command route was denied by its approval binding. Compilation therefore ran on Tara using ECJ, Java D8 and apksigner, with the existing Mac-generated resource APK and Android platform classes. The existing signing key was used through a temporary private transfer, then that copy was removed. No new key was generated. Normal Mac USB ADB installed the signed update without clearing app data. The prior APK is retained for recovery.

Evidence: `life-teamtri-final-device.png`, `life-controls-device.png`, `life-launcher-device.png`, `life-startup-settled-device.png`, and `life-navigation-proved-device.png`. The reboot check exposed and resolved a menu Wi-Fi startup retry gap. A final navigation check exposed and resolved Today returning to the idle clock. The frame was left on Today. `homehq-life.apk` is the final update, while `homehq-original.apk` is the pre-update recovery copy. Preserve the signing key and avoid signing with a fresh default key.


## AI usage, Linear and Tara, 13 October 2026

Built and deployed entirely on Tara, without Mac access or an Android app update.

- **AI usage:** live Codex subscription windows, percentage remaining, London reset times, available reset count and provider-reported daily token activity. The collector uses the documented `account/rateLimits/read` and `account/usage/read` methods, starts no model turn and strips account identifiers, raw credits and credentials. These are the account used by Tara, not separate ChatGPT conversation limits or API billing. Provider daily buckets use UTC dates and today is incomplete.
- **Cursor:** clearly unavailable. The existing Cloud Agent credential returned HTTP 401 from the documented Admin API member read. No Admin usage credential is configured. No sample or estimated allowance is presented.
- **Linear:** all visible open issues, with Current cycle only and Assigned to me switches both enabled by default. Turning them off includes other cycles/no cycle and anyone/unassigned. The active cycle is evaluated per Linear team. Includes status, project, priority and due date, with project/status filters. Pagination is bounded and incomplete pages are errors, not a complete empty list. Current connection sees Automation Geeks.
- **Tara:** fresh Pi readings for temperature, memory, storage, swap, load, uptime, OpenClaw service and voltage/thermal flags. Threshold alerts and stale/error labels. Work queue, waiting/blocked items and recent completions come from the task register, not a claimed live execution feed. Service status is not a full OpenClaw application health audit.

The service serves its saved cache immediately on startup while live feeds reconnect in the background. Calendar, weather, Linear and Codex collectors refresh every five minutes. Health refreshes at most every 30 seconds, on browser requests. Refresh buttons reload the current server feed without making a provider request per tap. There is no new cron or Gateway change.

The installed Java shell recognises only Today/TEAMTRI. The web rail selects the existing Today pane and sends the desired tab through an authenticated same-origin navigation endpoint. Content and rail poll it once per second. It supports the single configured frame session. This endpoint only changes display navigation. All source data stays read-only. Hidden TEAMTRI time is excluded from the content page idle switch to avoid menu drift.

The existing loaded frame pages cannot acquire new JavaScript by polling data alone. **Reload or restart the frame once to pick up this release**, with no Mac required. No physical frame check was made for these tabs. Local browser proof covers nine layouts, two-pane native-shell simulation, filters, safe rendering, stale health and endpoint access controls. Evidence is `outputs/photo-frame-2026-10-13/three-tabs/`. The previous five source files are retained there as `.before` rollback copies. Only the dashboard user service was restarted. The OpenClaw Gateway was untouched.


### Today Codex metric and Linear switches

Today has a compact live Codex usage bar in the header. It shows percentage used and remaining capacity, preferring the weekly Codex window when available. Tap it to open AI usage. Failed/stale readings are labelled. Linear rows now include assignee and cycle. Existing project/status filters combine with the two scope switches. The scope defaults reset to current cycle and Rich on page load. Deployment proof: `outputs/photo-frame-2026-10-13/linear-today/`. These changes only affect content, so Controls → Reload dashboard is sufficient on the frame.

## Light-controlled screen saver, 14 October 2026

The installed app listens to Android TYPE_LIGHT. Initial raw cutoffs are dark ≤45 for20seconds and light ≥55 for3seconds, based on completely covered40–41 and uncovered60–62. These are provisional, not real-room darkness calibration. Controls → Light control shows the live reading and saves separate cutoffs on the frame across restarts. Temperature is deliberately unused.

Darkness selects Today and shows the dim night clock. Light returns to Today only when darkness caused the screen saver. The frame’s old two-minute idle trigger is disabled, so daylight keeps the dashboard visible. The manual clock button still works and light does not dismiss a manually opened clock. Touch gives a60second manual override before another20second darkness hold. Sensor delivery gaps over5seconds and app pauses reset the hold. Android stays awake, so this changes the dashboard overlay, not device sleep. Existing Home registration, startup URL, TEAMTRI cookies, exit gesture and launcher route are preserved.

Policy test: compile `dashboard/kiosk/tests/LightPolicyTest.java` with `LightPolicy.java`, then run `com.wesbos.homehq.LightPolicyTest`. Browser checks: `FRAME_PROOF_DIR=<existing output directory> node personal-dashboard/tests/light-browser.cjs`. Device update retains the original signing certificate and version4 resource base. Rollback APK: workspace `outputs/photo-frame-2026-10-13/customisation/homehq-life.apk`.
