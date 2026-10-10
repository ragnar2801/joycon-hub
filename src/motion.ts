import { Euler, Quaternion, Vector3, MathUtils } from 'three';
import type { Controls } from '../shared/protocol';

type PermissionConstructor = { requestPermission?: () => Promise<string> };
export class MotionController {
  private current = new Quaternion();
  private base: Quaternion | null = null;
  private filtered: Controls = { roll: 0, pitch: 0 };
  private last = 0;
  private samples = 0;
  private orientationAt = 0;
  private gyroAt = 0;
  private mode: 'orientation' | 'accelerometer' | 'waiting' = 'waiting';
  private calibration: { start: number; sum: number[]; reference?: Quaternion; count: number; resolve: () => void; reject: (error: Error) => void } | null = null;
  public sensitivity = 1;
  public invert = false;
  public gyro = false;
  public onRotate: () => void = () => {};

  async enable() {
    if (!window.isSecureContext) throw new Error('Motion controls need HTTPS. Open the secure controller link in Safari or Chrome.');
    // Invoke both permission requests synchronously within the tap activation.
    const requests = [window.DeviceOrientationEvent, window.DeviceMotionEvent].filter(Boolean).map(ctor => {
      const c = ctor as unknown as PermissionConstructor;
      return c.requestPermission ? c.requestPermission() : Promise.resolve('granted');
    });
    const permissions = await Promise.all(requests);
    if (permissions.some(p => p !== 'granted')) throw new Error('Motion permission was denied. Allow motion in browser settings, reload, and try again—or use touch controls.');
    this.stop(); this.samples = 0; this.last = 0; this.mode = 'waiting'; this.base = null;
    window.addEventListener('deviceorientation', this.orientation);
    window.addEventListener('devicemotion', this.motion);
    window.addEventListener('orientationchange', this.rotate);
    await new Promise<void>((resolve, reject) => {
      const started = performance.now();
      const timer = window.setInterval(() => {
        if (this.samples > 3) { clearInterval(timer); resolve(); }
        else if (performance.now() - started > 3500) { clearInterval(timer); this.stop(); reject(new Error('No motion readings arrived. Try Safari on iPhone or Chrome on Android, or switch to touch controls.')); }
      }, 100);
    });
  }
  private screenAngle() { return (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) * Math.PI / 180; }
  private orientation = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    // DeviceOrientation uses intrinsic Z-X-Y rotations in the phone's natural
    // orientation. Keep the screen's X (right), Y (top), Z (outward) axes;
    // camera-axis conversion would swap lateral tilt with twisting the phone.
    this.current.setFromEuler(new Euler(MathUtils.degToRad(e.beta), MathUtils.degToRad(e.gamma), MathUtils.degToRad(e.alpha || 0), 'ZXY'));
    this.current.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -this.screenAngle()));
    this.orientationAt = performance.now(); this.mode = 'orientation'; this.sample();
  };
  private motion = (e: DeviceMotionEvent) => {
    const now = performance.now(), rate = e.rotationRate;
    if (rate && rate.alpha != null && rate.beta != null && rate.gamma != null && [rate.alpha, rate.beta, rate.gamma].every(Number.isFinite)) {
      this.gyro = true;
      const dt = Math.min((now - this.gyroAt) / 1000, .05); this.gyroAt = now;
      if (this.mode === 'orientation' && now - this.orientationAt > 40 && now - this.orientationAt < 300) {
        const change = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(rate.beta) * dt, MathUtils.degToRad(rate.gamma) * dt, MathUtils.degToRad(rate.alpha) * dt, 'XYZ'));
        // Rotate the device axes into the current screen coordinate system.
        const screenRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), this.screenAngle());
        change.premultiply(screenRotation).multiply(screenRotation.clone().invert());
        this.current.multiply(change).normalize(); this.sample();
      }
    }
    if (now - this.orientationAt < 400) return;
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null || ![a.x, a.y, a.z].every(Number.isFinite)) return;
    const gravity = new Vector3(a.x, a.y, a.z);
    if (gravity.length() < 2) return;
    gravity.normalize();
    // A resting accelerometer points toward world up in device coordinates.
    // Reconstruct device-to-world tilt, then apply the same screen correction.
    this.current.setFromUnitVectors(gravity, new Vector3(0, 0, 1));
    this.current.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -this.screenAngle()));
    this.mode = 'accelerometer'; this.sample();
  };
  private sample() {
    this.last = performance.now(); this.samples++;
    const c = this.calibration;
    if (!c) return;
    if (!c.reference) c.reference = this.current.clone();
    if (c.reference.angleTo(this.current) > .07) { c.start = this.last; c.sum = [0, 0, 0, 0]; c.count = 0; c.reference = this.current.clone(); }
    const sign = this.current.dot(c.reference) < 0 ? -1 : 1;
    [this.current.x, this.current.y, this.current.z, this.current.w].forEach((value, i) => { c.sum[i] += value * sign; }); c.count++;
    if (this.last - c.start >= 900 && c.count > 8) { this.base = new Quaternion(...c.sum as [number, number, number, number]).normalize(); this.filtered = { roll: 0, pitch: 0 }; this.calibration = null; c.resolve(); }
  }
  calibrate() {
    this.base = null;
    return new Promise<void>((resolve, reject) => {
      this.calibration?.reject(new Error('Calibration restarted.'));
      const attempt = { start: performance.now(), sum: [0, 0, 0, 0], count: 0, resolve, reject };
      this.calibration = attempt;
      window.setTimeout(() => { if (this.calibration === attempt) { this.calibration = null; reject(new Error('Hold the phone still for one second and try again.')); } }, 7000);
    });
  }
  read(): Controls | null {
    if (!this.base || performance.now() - this.last > 500) return null;
    const relative = this.base.clone().invert().multiply(this.current);
    const angles = new Euler().setFromQuaternion(relative, 'YXZ');
    const axis = (radians: number) => { const degrees = MathUtils.radToDeg(radians), dead = 2.5; return Math.abs(degrees) < dead ? 0 : MathUtils.clamp(Math.sign(degrees) * (Math.abs(degrees) - dead) / 25 * this.sensitivity, -1, 1); };
    const smoothing = this.mode === 'accelerometer' ? .13 : .24;
    // Screen-local +Y tilt lowers the right edge: steer right. Screen-local
    // +X tilt raises the far edge: climb; lowering that edge descends.
    this.filtered.roll += (axis(angles.y) - this.filtered.roll) * smoothing;
    this.filtered.pitch += (axis(angles.x) * (this.invert ? -1 : 1) - this.filtered.pitch) * smoothing;
    return { ...this.filtered };
  }
  get source() { return this.mode === 'accelerometer' ? 'Accelerometer tilt' : this.gyro ? 'Motion + gyroscope' : 'Motion tilt'; }
  private rotate = () => { this.base = null; this.onRotate(); };
  stop() {
    window.removeEventListener('deviceorientation', this.orientation); window.removeEventListener('devicemotion', this.motion); window.removeEventListener('orientationchange', this.rotate);
    this.calibration?.reject(new Error('Motion stopped.')); this.calibration = null;
  }
}
