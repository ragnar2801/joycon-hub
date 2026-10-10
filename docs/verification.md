# Device verification checklist

No unit tests are included. Production build and TypeScript checking pass. Browser checks established direct WebRTC pairing through PeerJS Cloud, QR rendering, manual-code pairing, controller readiness, and the 3D scene. Physical phone checks are handed over to the user.

## Phone and desktop on the same Wi-Fi

- [ ] Open the published HTTPS site, scan its QR, and grant motion permission.
- [ ] Calibrate in landscape while holding still for one second.
- [ ] In landscape, lower the far edge to descend and raise it to climb; lower the left edge to steer left and the right edge to steer right.
- [ ] Test both landscape orientations and different comfortable holding angles.
- [ ] Change phone orientation and recenter.
- [ ] Check dead zone, smoothness, sensitivity, and inverted pitch.
- [ ] Deny motion permission and try touch controls.
- [ ] Test pause, resume, restart, score feedback, and return to hub.
- [ ] Background or lock the phone, return, recenter, and resume.
- [ ] Refresh the phone; confirm credential-based reconnect and recalibration.
- [ ] Refresh the computer; confirm a fresh QR is required.
- [ ] Reset pairing; confirm old invitations/credentials no longer work.
- [ ] Attempt a second phone connection.
- [ ] Let an invitation expire and generate a new one.
- [ ] Complete the ring course, crash/recover, replay, and check best-score persistence.
- [ ] Play free flight long enough to check ring/environment recycling.
- [ ] Test the practice pad without a phone.
- [ ] Verify GitHub Pages assets and direct controller hash-route refresh.
- [ ] Try a guest/device-isolated network and confirm a useful connection error.

Signaling and STUN need internet during setup. Gameplay uses direct encrypted data channels; no application relay or TURN is configured. Motion snapshots use an unordered, non-retransmitted channel, with a short bounded fallback while that channel opens. Critical commands use the reliable channel with acknowledgments and duplicate suppression.
