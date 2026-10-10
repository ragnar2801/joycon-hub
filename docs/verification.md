# Manual release verification

## Completed during implementation

- TypeScript checking and production build.
- Desktop browser: hub, QR rendering, manual-code pairing, controller readiness, rendered flight and HUD, phone-to-game pause, and live score feedback.
- Relay integration smoke checks: strong invitations, host/controller authorization, single phone ownership, valid input delivery, rejected invalid/stale/cross-room input, game feedback, command acknowledgments and deduplication, host/phone reconnect, invitation renewal, invalidation of old credentials, session close, and origin restrictions.

## Required physical device checks

Use iPhone Safari and Android Chrome with the deployed HTTPS frontend and relay:

- [ ] Scan an invitation and complete permission/calibration onboarding.
- [ ] Deny motion permission; confirm useful recovery instructions and touch fallback.
- [ ] Tilt left/right and forward/back in landscape; verify expected flight axes.
- [ ] Test both landscape orientations and several natural holding angles.
- [ ] Rotate the phone; confirm motion readiness is cleared and recentering is required.
- [ ] Check stable neutral input, dead zone, filtering, sensitivity, and inverted pitch.
- [ ] Compare orientation/gyro controls with accelerometer-only fallback if available.
- [ ] Lock/background the phone, then return and recenter/resume.
- [ ] Check screen wake lock and a browser that does not support it.
- [ ] Test same Wi-Fi, phone cellular data, latency, and a brief network loss.
- [ ] Reconnect the computer and phone without stale inputs being replayed.
- [ ] Check touch controls, pointer release, and settings in landscape/portrait.

## Release and hosting checks

- [ ] Finish the course, collect/miss rings, crash/recover, replay, and verify best-score persistence.
- [ ] Play free flight long enough to verify environment and ring recycling.
- [ ] Return to the hub and reopen the game without re-pairing.
- [ ] Let an invitation expire; renew and verify that the old code cannot pair.
- [ ] Attempt to pair a second phone; reset and reconnect intentionally.
- [ ] Visit and refresh the GitHub Pages controller hash route directly.
- [ ] Confirm asset paths under the repository's Pages base path.
- [ ] Confirm the published QR link targets the deployed frontend.
- [ ] Verify unavailable/starting relay behavior and no-backend practice mode.
- [ ] Verify WebGL-disabled behavior and a slower desktop.
- [ ] Measure relay RTT separately from physical motion-to-screen latency.
- [ ] Verify HTTPS frontend/relay, production origin allowlist, and no credentials in static files.

No unit tests are included. The relay smoke verification uses transient local tooling, not a committed test suite.
