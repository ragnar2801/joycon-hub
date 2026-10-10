# Joycon Hub

Small games. Big moves. A browser gaming hub where the computer runs the game and a phone becomes its motion controller.

The first game, **Sky Pilot**, is a stylized 3D plane game with a 12-ring, 90-second course and an untimed free-flight mode. Scan a QR code, enable motion sensors, calibrate, and fly. A practice pad works without a phone or backend.

## Run locally

Requires Node.js 22.9 or newer and npm. No unit tests are included.

```powershell
npm install
npm run server
```

In a second terminal:

```powershell
npm run dev
```

Open `http://localhost:5173`. The relay listens on port `3001`. Its health endpoint is `http://localhost:3001/health`.

Click **Let's fly** to open Sky Pilot. Connect a phone, or select **Explore with the practice pad**. Hold and move the pad to bank and climb; release to level. The game does not use keyboard flight input.

## Connect a real phone

Mobile sensor APIs need a secure HTTPS page. A phone cannot reach the computer through a `localhost` QR link, and an ordinary `http://192.168...` development page will not satisfy sensor security requirements.

The simplest real-device setup is the deployed GitHub Pages frontend plus a deployed HTTPS relay. For local development, expose **both** the Vite frontend and the relay through trusted HTTPS tunnels:

1. Copy `.env.example` to `.env`.
2. Set `VITE_SERVER_URL` to the relay's public HTTPS tunnel URL.
3. Set `VITE_CONTROLLER_URL` to the frontend's public HTTPS tunnel URL (including any base path).
4. Add the frontend tunnel's exact origin to `ALLOWED_ORIGINS` alongside `http://localhost:5173`.
5. Restart the frontend and relay. Open the frontend tunnel on the computer or local preview with the controller URL override.
6. Click **Connect phone** and scan the QR using the phone's camera. Open in Safari on iPhone or Chrome on Android.
7. Tap **Enable motion**, grant motion permission, hold the phone in landscape, and calibrate.

The QR encodes an invitation URL, not a Bluetooth connection. Both devices need internet access to the relay. They do not need to share Wi-Fi. Sensor support and axis mapping must be validated on physical devices before calling the motion experience production-ready.

## GitHub Pages deployment

The static frontend is built by `.github/workflows/pages.yml`. No Node server runs on GitHub Pages.

1. Push this repository to your GitHub repository's `main` or `master` branch.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Deploy the relay (see below).
4. In **Settings → Secrets and variables → Actions → Variables**, add the public repository variable `VITE_SERVER_URL` with the relay HTTPS URL.
5. Run **Deploy Joycon Hub to GitHub Pages**, or push a commit.

The workflow uses Pages metadata to set Vite's base path, including project repositories such as `https://ragnar2801.github.io/joycon-hub/`. Hash routing means phone URLs like `.../joycon-hub/#/controller` work on direct navigation and refresh. QR links use the actual frontend URL.

Enforce HTTPS under Pages settings. Frontend variables are public. Do not put backend credentials or secrets into `VITE_*` variables. With no `VITE_SERVER_URL`, the site still offers practice flight and explains why phone pairing is unavailable.

For a local production build:

```powershell
$env:VITE_BASE_PATH = '/joycon-hub/'
$env:VITE_SERVER_URL = 'https://YOUR-RELAY-HOST'
npm run build
```

## Realtime backend deployment

`Dockerfile` and `render.yaml` provide a deployable standalone relay. It needs a service that supports persistent WebSocket connections; an ordinary short-lived serverless function is unsuitable.

For Render, connect this repository and create a Blueprint using `render.yaml`, or create a Docker web service manually. Configure:

```text
NODE_ENV=production
ALLOWED_ORIGINS=https://ragnar2801.github.io
```

Use an **origin**, without `/joycon-hub/`, in `ALLOWED_ORIGINS`. Add additional trusted frontend origins as comma-separated values when necessary. The service uses the provider's `PORT` variable and exposes `/health`. Set its returned HTTPS address as `VITE_SERVER_URL` in GitHub Actions, then rebuild the frontend.

The included blueprint selects a free plan; hosting eligibility and availability depend on the provider. Free instances may sleep and take time to wake. The pairing UI reports unavailable connections rather than simulating success. An always-on relay near players is preferable for responsive controls. No paid service has been provisioned by this repository.

Sessions live in memory. **Use one backend instance.** A restart ends sessions, and players need to pair again. Horizontal scaling would require shared session state, socket adapters, and coordinated controller ownership.

## Controls and game behavior

- Automatic forward flight with assisted bank/turn and climb/descent.
- Relative orientation calibration, a 2.5-degree dead zone, smoothing, and adjustable sensitivity.
- Orientation readings with short gyroscope prediction where available; accelerometer gravity tilt is a fallback.
- Screen-coordinate mapping and required recentering after phone rotation.
- Motion snapshots sent at approximately 30 Hz; stale samples are discarded.
- The computer renders and simulates the game; the server relays normalized inputs.
- Pause, resume, restart, recenter, pitch inversion, and phone touch controls.
- Input stops: neutral steering after 250 ms and pause after one second.
- Hidden tabs pause input/gameplay. Reconnection requires explicit readiness and resume.
- Optional phone screen wake lock.
- 100 points per ring, a completion time bonus, and a 50-point recovery penalty.
- Best score stored on the computer's browser; no global leaderboard or account.

## Pairing and privacy

An invitation expires after five minutes and is consumed by the first phone. QR invitations use a random 256-bit token; six-character backup codes are rate limited. Host and controller credentials are separate. Controller ownership is checked on each input and command, with a new generation on reconnect. Resetting a connection invalidates the old phone's credential. Sessions expire after two hours.

The server validates origins, packet size, input bounds, sequence numbers, and update rates. Critical commands are acknowledged and deduplicated at the host. Motion updates use volatile delivery and are never replayed after reconnect. Controller reconnect credentials are stored in that tab's session storage. The consumed invitation is removed from the current controller URL. Raw sensor samples are not saved, and the app requests no camera, location, or microphone permission.

## Project layout

```text
src/App.tsx             Hub and game navigation
src/Game.tsx            Flight UI, lifecycle, interruption handling
src/flight.ts           Three.js plane scene and arcade simulation
src/Controller.tsx      Phone onboarding, controller, and commands
src/motion.ts           Sensor permissions, filtering, and calibration
src/connection.ts       Host sessions and Socket.IO transport
src/PairModal.tsx       QR pairing and invitation renewal
shared/protocol.ts      Shared messages and session constants
server/index.ts         Pairing and realtime relay
.github/workflows/      GitHub Pages deployment
```

## Verification

Run `npm run typecheck` and `npm run build`. The manual release checklist is in `docs/verification.md`. No unit tests have been added. Physical iPhone/Android motion checks remain necessary; browser previews cannot establish actual sensor behavior.

The additional game cards are explicitly marked coming soon. Only Sky Pilot is playable. WebRTC, multiplayer, accounts, persistent rooms, and additional games are future work.
