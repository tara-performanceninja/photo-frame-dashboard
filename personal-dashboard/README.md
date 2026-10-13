# Rich's frame dashboard

PerformanceNinja-branded, lightweight dashboard built on Tara for the 1024 × 600 PF1007L. This is a separate web application. It does not modify the working Android launcher, Home-app registration, exit gesture, WebView or firmware.

## Current delivery

- Private preview: https://tara.tail1bbd6f.ts.net:8443/
- Today: live calendar, live London weather, Next up and a dated Apple Reminders snapshot.
- Left navigation: Today and TEAMTRI.
- TEAMTRI currently provides a link to the original protected site. **It is not yet an embedded, signed-in dashboard.** Opening the original site leaves the shell. Its Strict session cookie prevents a straightforward cross-site iframe. No production authentication or cookie settings were changed.
- Ambient: two-minute idle clock, tap to return, night colours between 22:00 and 06:00 London time, small periodic content movement.
- Source uses HTML/CSS/JavaScript without a bundler or frontend framework. Assets, including Montserrat and the original brand icon, are local. No Google Fonts dependency.

## Data and privacy

Calendar reads use the existing authenticated `gws` connection for Personal, TEAMTRI, Military Sherpa and Cirion Group. Google expands recurring events. Pagination, occurrence-level deduplication and declined/cancelled filtering happen server-side. The feed covers today through the next seven days. Today shows all-day and remaining timed appointments. Next up shows a current or upcoming timed appointment or upcoming dated reminder. All times use Europe/London.

Weather uses Open-Meteo. **London is the initial location**, not a verified precise home location. Weather and calendar refresh on Tara every five minutes. The browser reloads the current cache every minute.

Reminders currently contains the five upcoming-week entries from the authorised Mac read taken before Rich asked to stop Mac work. It does not contain overdue or undated reminders and does not refresh automatically. The UI labels it as a snapshot and adds an age warning. It is read-only, with no misleading completion controls. Continuous Apple Reminders sync requires a supported source route. No further Mac commands were run after Rich's instruction.

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

A LAN device launch link can be generated locally from `.state/access.json` when installation on the frame is authorised. Do not paste or log its access key publicly. The frame has **not** been switched to this dashboard yet.

## Brand source

Colours are from `knowledge/performanceninja/branding/source/PerformanceNinja Brand Colours.pdf`: navy `#003D79`, blue `#0065AB`, cyan `#0094D3` and purple `#75569B`. Pale surfaces use approved palette tints. The unchanged white icon is from the same canonical brand folder. Montserrat is bundled from the current PerformanceNinja website assets. The dashboard's layout is not a toolkit slide and does not inherit presentation navigation or slide contracts.

## Verification

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --check app.js
python3 /home/adminrichwebb/.openclaw/workspace/worktrees/pn-toolkit-continuation/scripts/run-verification.py --timeout 120 -- node /home/adminrichwebb/.openclaw/workspace/projects/photo-frame-dashboard/personal-dashboard/tests/browser.cjs
```

Proof and screenshots: `outputs/photo-frame-2026-10-13/customisation/` in the Tara workspace. Browser checks cover 1024 × 600, 1280 × 800, 1440 × 900 and 390 × 844, tabs, ambient touch/idle, full event details, long titles, safe text rendering, empty/error states and data access controls. List panels deliberately scroll. Very long Next up titles use a three-line summary with the full title available from the details arrow. No on-device browser or TEAMTRI authenticated rendering proof is claimed.
