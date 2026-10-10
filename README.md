# Joycon Hub

**Small games. Big moves.** A static browser gaming hub controlled by your phone over direct WebRTC.

- Live site: https://ragnar2801.github.io/joycon-hub/
- Source: https://github.com/ragnar2801/joycon-hub
- Hosting: GitHub Pages only. No Render service or application backend is required.

## Play on your phone

1. Put your computer and phone on the same Wi-Fi.
2. Open the live site on the computer and select **Connect phone**.
3. Scan its QR code with your phone camera; open the link in Safari on iPhone or Chrome on Android.
4. Tap **Enable motion**, grant permission, and hold your phone sideways at a comfortable angle.
5. Calibrate while holding still for one second.
6. Open **Sky Pilot** on the computer and take off.

Hold the phone in landscape: tilt forward (lower the edge away from you) to descend, tilt backward to climb, lower the left edge to steer left, and lower the right edge to steer right. Both landscape orientations are supported. Recenter, sensitivity, optional pitch inversion, pause, restart, and touch controls are available on the phone.

Sky Pilot includes a 12-ring, 90-second course and untimed free flight. An optional computer practice pad works without a phone. No keyboard flight controls are needed. Scores are saved on the computer's browser, with no account or global leaderboard.

## How pairing works

The QR link carries a temporary host peer ID and random 256-bit invitation token. The free **PeerJS Cloud signaling service** exchanges WebRTC connection details. **Motion, commands, and game feedback travel directly between the browsers**, over encrypted WebRTC data channels.

- Reliable data channel: authentication, readiness, commands, acknowledgments, and feedback.
- Unordered channel with no retransmissions: approximately 30 motion snapshots per second.
- Bounded buffering and increasing sequence numbers prevent replaying old motion.
- A six-character backup code can be entered at the controller route.
- Invitations expire after five minutes and allow one phone.
- Reconnect credentials are kept in the phone tab's session storage; calibration is required again after reconnect.
- Resetting a session rotates the peer ID, invitation token, and pairing code.
- The computer validates packet shape, input bounds, generations, sequence numbers, and request rates.
- No camera, microphone, or location permissions are requested by the app. Use the phone's normal camera app to scan the QR.

Internet is needed to load GitHub Pages and contact signaling/STUN during pairing. This is not an offline LAN discovery protocol. Established gameplay does not use an application relay. STUN assists direct connectivity; no TURN relay is configured. Guest Wi-Fi with device isolation, firewalls, or networks preventing direct ICE connectivity can block pairing. Same-Wi-Fi devices are the intended setup.

The signaling service is external infrastructure, although you do not need to deploy or maintain it. Its availability affects new pairings. Existing WebRTC links can continue through a signaling interruption. A self-hosted PeerServer can be configured if needed.

## Local development

Requires Node.js 22.9 or newer and npm:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. For a practice flight, select **Let's fly**, then **Explore with the practice pad**. Hold and move the pad to steer; release to level.

Use the published HTTPS site for real phone testing. `localhost` on a phone means the phone itself, and HTTP LAN development pages normally cannot access motion sensors. For local phone development, use a trusted HTTPS frontend tunnel and optionally set `VITE_CONTROLLER_URL` in `.env` to that public frontend URL. No backend tunnel is necessary.

## GitHub Pages

`.github/workflows/pages.yml` builds and publishes the static app on pushes to `main` or `master`, or through manual workflow dispatch. Pages is configured to use GitHub Actions.

The workflow reads Pages metadata to set Vite's base path, so project deployment under `/joycon-hub/` works. The phone uses a hash route (`#/controller`) that can be opened and refreshed directly on static hosting. QR codes are generated from the current frontend URL.

There is no backend URL, server process, database, or hosting account to configure.

Optional public build configuration (all values are visible in the static frontend):

```text
VITE_BASE_PATH=/
VITE_CONTROLLER_URL=
VITE_SIGNAL_HOST=
VITE_SIGNAL_PORT=443
VITE_SIGNAL_PATH=/
```

Leave `VITE_SIGNAL_HOST` blank for PeerJS Cloud. For a custom PeerServer, configure an HTTPS/WSS host and expose the `VITE_SIGNAL_*` values as repository Actions variables before rebuilding. Never put credentials or private secrets in `VITE_*` variables.

## Implementation

```text
src/App.tsx             Hub and game navigation
src/Game.tsx            Flight UI and game lifecycle
src/flight.ts           Three.js plane scene and arcade simulation
src/Controller.tsx      Phone onboarding and controller UI
src/motion.ts           Sensor permission, calibration, filtering
src/transport.ts        WebRTC channels, signaling, pairing, reconnect
src/connection.ts       React host connection state
src/PairModal.tsx       QR invitations and pairing reset
shared/protocol.ts      Shared controller and session messages
.github/workflows/      GitHub Pages deployment
```

Motion processing uses relative quaternion orientation, a 2.5-degree dead zone, smoothing, screen-coordinate mapping, and optional gyroscope prediction. Accelerometer gravity tilt is a fallback. Phone rotation requires recentering.

Input gaps ease steering toward neutral after 250 ms and pause flight after one second. Hidden/backgrounded pages pause input or gameplay. Optional screen wake lock helps keep the phone active.

Sessions live in the computer browser. Reloading that browser ends the session and requires a new QR pairing. Closing/reloading the phone can reconnect using its tab-scoped credential while the computer remains open. Sessions expire after two hours.

Only Sky Pilot is playable; other game cards are marked coming soon. Multiplayer, offline manual signaling, TURN fallback, accounts, and additional games are future work.

## Verification and handover

```powershell
npm run typecheck
npm run build
```

No unit tests were added. The build passes, and browser verification established direct PeerJS/WebRTC pairing and controller readiness between two browser peers. Physical accelerometer/gyroscope behavior is left for your iPhone/Android checks, as requested. See `docs/verification.md` for the release checklist.
