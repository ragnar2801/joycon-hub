import * as THREE from 'three';
import type { Controls, GameFeedback, GameStatus } from '../shared/protocol';

export type FlightSnapshot = GameFeedback & { speed: number; altitude: number; missed: number; message: string };
export function createFlight(container: HTMLElement, snapshot: (s: FlightSnapshot) => void, unavailable: (message: string) => void) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c8e0d8'); scene.fog = new THREE.Fog('#c8e0d8', 180, 780);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1600);
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch { unavailable('This browser could not start the 3D renderer. Try a browser with WebGL enabled.'); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const lost = (e: Event) => { e.preventDefault(); status = 'paused'; unavailable('The graphics connection was interrupted. Reload to restore the flight scene.'); };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x527b64, 2.7));
  const sun = new THREE.DirectionalLight(0xffedcc, 3); sun.position.set(-100, 160, 50); scene.add(sun);
  const mat = (color: string, roughness = .85) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
  const ivory = mat('#f9f3df'), orange = mat('#ec7955'), navy = mat('#214840', .4);
  const plane = new THREE.Group();
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(.58, 3, 4, 10), ivory); fuselage.rotation.x = Math.PI / 2; plane.add(fuselage);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.8, .13, 1.25), ivory); wing.position.z = .1; plane.add(wing);
  for (const x of [-3.5, 3.5]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(.65, .15, 1.25), orange); tip.position.set(x, .02, .1); plane.add(tip); }
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.65, 12, 8), navy); cockpit.scale.set(.68, .65, 1.4); cockpit.position.set(0, .45, -.3); plane.add(cockpit);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.6, .12, .65), orange); tailWing.position.set(0, .12, 1.8); plane.add(tailWing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.2, .85), orange); tail.position.set(0, .6, 1.75); plane.add(tail);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(2, .12, .1), navy); prop.position.z = -2.12; plane.add(prop);
  plane.position.set(0, 28, 0); scene.add(plane);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), mat('#6daba2')); sea.rotation.x = -Math.PI / 2; sea.position.y = -1; scene.add(sea);
  const landscape = new THREE.Group(); scene.add(landscape);
  const terrainMats = [mat('#799b6d'), mat('#99ad7c'), mat('#bac49a')];
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1;
    const island = new THREE.Mesh(new THREE.ConeGeometry(40 + (i % 5) * 10, 12 + (i % 4) * 14, 6), terrainMats[i % 3]);
    island.position.set(side * (100 + (i % 7) * 27), 0, 150 - i * 90); island.rotation.y = i * .7; landscape.add(island);
  }
  const clouds: THREE.Group[] = [];
  const cloudMat = mat('#f5f5e7');
  for (let i = 0; i < 38; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) { const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + j * 2, 1), cloudMat); puff.position.x = j * 7; puff.scale.y = .5; cloud.add(puff); }
    cloud.position.set(Math.sin(i * 27) * 210, 65 + i % 6 * 9, 100 - i * 130); clouds.push(cloud); scene.add(cloud);
  }
  const ringMat = new THREE.MeshStandardMaterial({ color: '#ffc767', emissive: '#cf8b29', emissiveIntensity: .22, roughness: .4 });
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, .55, 8, 32), ringMat.clone());
    ring.position.set(Math.sin(i * .8) * 23, 28 + Math.sin(i * .65) * 8, -85 - i * 100); scene.add(ring); rings.push(ring);
  }
  const target = new THREE.Vector3(), cameraPos = new THREE.Vector3();
  let status: GameStatus = 'idle', mode: 'course' | 'practice' = 'course';
  let controls: Controls = { roll: 0, pitch: 0 }, heading = 0, time = 90, score = 0, collected = 0, missed = 0, ringIndex = 0;
  let message = '', messageUntil = 0, last = performance.now(), hudTime = 0, raf = 0, disposed = false;
  function publish() { snapshot({ status, mode, score, rings: collected, remaining: Math.ceil(time), speed: status === 'playing' ? 130 : 0, altitude: Math.round(plane.position.y), missed, message }); }
  function reset(nextMode = mode) {
    mode = nextMode; heading = 0; time = 90; score = 0; collected = 0; missed = 0; ringIndex = 0; message = '';
    plane.position.set(0, 28, 0); plane.rotation.set(0, 0, 0); camera.position.set(0, 34, 19);
    landscape.position.z = 0; clouds.forEach((cloud, i) => { cloud.position.z = 100 - i * 130; });
    rings.forEach((r, i) => { r.visible = true; r.position.z = -85 - i * 100; (r.material as THREE.MeshStandardMaterial).color.set('#ffc767'); });
    status = 'playing'; publish();
  }
  function update(now: number) {
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, .045); last = now;
    if (status === 'playing') {
      const blend = 1 - Math.exp(-dt * 7);
      plane.rotation.z = THREE.MathUtils.lerp(plane.rotation.z, -controls.roll * .7, blend);
      plane.rotation.x = THREE.MathUtils.lerp(plane.rotation.x, controls.pitch * .3, blend);
      heading = THREE.MathUtils.clamp(heading + controls.roll * dt * .65 - heading * dt * .4, -.65, .65);
      plane.rotation.y = -heading;
      plane.position.x += Math.sin(heading) * 36 * dt;
      plane.position.z -= Math.cos(heading) * 36 * dt;
      plane.position.y = Math.min(100, plane.position.y + controls.pitch * 15 * dt);
      if (mode === 'course') time = Math.max(0, time - dt);
      const ring = rings[ringIndex % rings.length];
      if (plane.position.z <= ring.position.z) {
        const hit = Math.hypot(plane.position.x - ring.position.x, plane.position.y - ring.position.y) < 8.2;
        if (hit) { score += 100; collected++; message = '+100 · Nice flying!'; (ring.material as THREE.MeshStandardMaterial).color.set('#c7f59b'); }
        else { missed++; message = 'Missed ring · Keep going'; }
        messageUntil = now + 1800; ring.visible = false; ringIndex++;
        if (mode === 'practice') { ring.position.z -= 1200; ring.visible = true; }
        if (mode === 'course' && ringIndex >= 12) { score += Math.floor(time) * 5; status = 'finished'; }
      }
      if (plane.position.y < 4 || Math.abs(plane.position.x) > 260) {
        const next = rings[ringIndex % rings.length]; plane.position.set(next.position.x, next.position.y, next.position.z + 45); heading = 0; score = Math.max(0, score - 50); message = 'Back in the air · −50'; messageUntil = now + 2400;
      }
      if (mode === 'course' && time <= 0) status = 'finished';
      if (plane.position.z < landscape.position.z - 1800) landscape.position.z -= 1800;
      for (const cloud of clouds) if (cloud.position.z > plane.position.z + 80) cloud.position.z -= 4900;
    } else if (status === 'idle') plane.rotation.z = Math.sin(now / 1400) * .06;
    prop.rotation.z += dt * 35;
    if (message && now > messageUntil) message = '';
    cameraPos.set(plane.position.x - Math.sin(heading) * 16, plane.position.y + 5.5, plane.position.z + 19);
    camera.position.lerp(cameraPos, 1 - Math.exp(-dt * 4));
    target.set(plane.position.x + Math.sin(heading) * 15, plane.position.y + 1, plane.position.z - 28); camera.lookAt(target);
    renderer.render(scene, camera);
    if (now - hudTime > 100) { hudTime = now; publish(); }
    raf = requestAnimationFrame(update);
  }
  const resize = () => { const { width, height } = container.getBoundingClientRect(); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); renderer.setSize(width, height); };
  const observer = new ResizeObserver(resize); observer.observe(container); resize(); camera.position.set(0, 34, 19); raf = requestAnimationFrame(update);
  return {
    input: (next: Controls) => { controls = next; },
    start: reset,
    pause: () => { if (status === 'playing') { status = 'paused'; publish(); } },
    resume: () => { if (status === 'paused') { status = 'playing'; last = performance.now(); publish(); } },
    status: () => status,
    dispose: () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', lost);
      scene.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) material.dispose(); } });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
export type Flight = NonNullable<ReturnType<typeof createFlight>>;
