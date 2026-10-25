// Water effects for the mini-golf: droplets that fly and fall, puffs of mist, and rings that spread over the water. One small pool for the whole course, in world coordinates.
// `burst(kind, x, y, z)` throws a splash (the ball into water, or knocked out by the geyser); `jet(x, y, z, amount, dt)` feeds the geyser's column while it is erupting.
import * as THREE from 'three';

const MAX_DROPS = 260, MAX_MIST = 70, MAX_RINGS = 14, GRAV = 9.5;

export function createFx(lowEnd = false) {
  const group = new THREE.Group(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const dropMat = new THREE.MeshBasicMaterial({ color: '#d8f2ff', transparent: true, opacity: 0.9, depthWrite: false, fog: true });
  const mistMat = new THREE.MeshBasicMaterial({ color: '#eefaff', transparent: true, opacity: 0.3, depthWrite: false, fog: true });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), dropMat, MAX_DROPS), mists = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mistMat, MAX_MIST);
  for (const im of [drops, mists]) { im.frustumCulled = false; im.renderOrder = 4; for (let i = 0; i < im.count; i++) im.setMatrixAt(i, zero); group.add(im); }
  const D = Array.from({ length: MAX_DROPS }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.07, floor: 0 })), M = Array.from({ length: MAX_MIST }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s: 0.3 }));
  const ringGeo = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2), rings = [];
  for (let i = 0; i < MAX_RINGS; i++) { const mt = new THREE.MeshBasicMaterial({ color: '#f4fcff', transparent: true, opacity: 0, depthWrite: false, fog: true, side: THREE.DoubleSide }), me = new THREE.Mesh(ringGeo, mt); me.visible = false; me.renderOrder = 4; group.add(me); rings.push({ mesh: me, mat: mt, on: false, t: 0, life: 1, size: 1 }); }
  const sandMat = new THREE.MeshBasicMaterial({ color: '#e6cf94', fog: true }), dustMat = new THREE.MeshBasicMaterial({ color: '#e9d6a2', transparent: true, opacity: 0.35, depthWrite: false, fog: true });
  const MAX_SAND = 240, MAX_DUST = 40, sands = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), sandMat, MAX_SAND), dusts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), dustMat, MAX_DUST);
  for (const im of [sands, dusts]) { im.frustumCulled = false; im.renderOrder = 4; for (let i = 0; i < im.count; i++) im.setMatrixAt(i, zero); group.add(im); }
  const S = Array.from({ length: MAX_SAND }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.04, floor: 0 })), U = Array.from({ length: MAX_DUST }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s: 0.3 }));
  // the ghost's fog: soft, cloudy billboards (a smoky texture that turns slowly, fading in and out), not solid shapes
  const smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); let sd = 7; const r = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
    for (let i = 0; i < 26; i++) { const px = 64 + (r() - 0.5) * 60, py = 64 + (r() - 0.5) * 60, rad = 14 + r() * 26, g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
    x.globalCompositeOperation = 'destination-in'; const m = x.createRadialGradient(64, 64, 4, 64, 64, 64); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.55, 'rgba(0,0,0,0.7)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const MAX_FOG = 80, fogGeo = new THREE.PlaneGeometry(1, 1), aRot = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOG), 1), aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOG), 1);
  fogGeo.setAttribute('aRot', aRot); fogGeo.setAttribute('aAlpha', aAlpha);
  const fogMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uMap: { value: smokeTex }, uColor: { value: new THREE.Color('#b9a8ff') } },
    vertexShader: 'attribute float aRot; attribute float aAlpha; varying vec2 vUv; varying float vA; void main() { vUv = uv; vA = aAlpha; vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float sz = length(instanceMatrix[0].xyz); float c = cos(aRot), s = sin(aRot); vec2 p = position.xy * sz; mv.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D uMap; uniform vec3 uColor; varying vec2 vUv; varying float vA; void main() { float a = texture2D(uMap, vUv).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(uColor, a); }',
  });
  const fogs = new THREE.InstancedMesh(fogGeo, fogMat, MAX_FOG); fogs.frustumCulled = false; fogs.renderOrder = 4; for (let i = 0; i < MAX_FOG; i++) fogs.setMatrixAt(i, zero); group.add(fogs);
  const F = Array.from({ length: MAX_FOG }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vz: 0, t: 0, life: 1, s: 0.5, rot: 0, spin: 0 })); let fCur = 0, accF = 0;
  let sCur = 0, uCur = 0, accS = 0;
  let dCur = 0, mCur = 0, rCur = 0, acc = 0, accM = 0;
  const rnd = Math.random, k = lowEnd ? 0.55 : 1;
  const addDrop = (x, y, z, vx, vy, vz, s, floor) => { const p = D[dCur]; dCur = (dCur + 1) % MAX_DROPS; p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.floor = floor; };
  const addMist = (x, y, z, vx, vy, vz, life, s) => { const p = M[mCur]; mCur = (mCur + 1) % MAX_MIST; p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.t = 0; p.life = life; p.s = s; };
  const addRing = (x, y, z, size, life) => { const r = rings[rCur]; rCur = (rCur + 1) % MAX_RINGS; r.on = true; r.t = 0; r.life = life; r.size = size; r.mesh.visible = true; r.mesh.position.set(x, y, z); };
  return {
    group,
    /** A splash: `splash` (ball into water), `kick` (ball thrown out by the geyser), `land` (a small ripple). */
    burst(kind, x, y, z) {
      if (kind === 'land') { addRing(x, y + 0.01, z, 0.35, 0.7); return; }
      const n = Math.round((kind === 'kick' ? 16 : 26) * k);
      for (let i = 0; i < n; i++) { const a = rnd() * 6.283, sp = 0.6 + rnd() * 1.8; addDrop(x, y, z, Math.cos(a) * sp, 3.2 + rnd() * 3.2, Math.sin(a) * sp, 0.05 + rnd() * 0.06, y - 0.02); }
      for (let i = 0; i < Math.round(5 * k); i++) { const a = rnd() * 6.283; addMist(x + Math.cos(a) * 0.2, y + 0.1, z + Math.sin(a) * 0.2, Math.cos(a) * 0.5, 0.6 + rnd() * 0.5, Math.sin(a) * 0.5, 0.7 + rnd() * 0.4, 0.28 + rnd() * 0.2); }
      addRing(x, y + 0.01, z, 1.0, 0.9); addRing(x, y + 0.01, z, 1.7, 1.3);
    },
    /** An eerie low fog drifting round (x, y, z) within `radius` (the ghost power-up). */
    ghostFog(x, y, z, radius, dt) {
      accF += dt * 11 * k;
      while (accF >= 1) { accF -= 1; const a = rnd() * 6.283, d = Math.sqrt(rnd()) * radius, p = F[fCur]; fCur = (fCur + 1) % MAX_FOG; p.on = true; p.x = x + Math.cos(a) * d; p.z = z + Math.sin(a) * d; p.y = y + 0.1 + rnd() * 0.5; p.vx = (rnd() - 0.5) * 0.35; p.vz = (rnd() - 0.5) * 0.35; p.t = 0; p.life = 2.4 + rnd() * 1.8; p.s = 1.0 + rnd() * 1.0; p.rot = rnd() * 6.28; p.spin = (rnd() - 0.5) * 0.5; }
    },
    /** Sand thrown up by a ball ploughing through a pit at (x, y, z) moving (vx, vz). */
    sand(x, y, z, vx, vz, dt) {
      const sp = Math.sqrt(vx * vx + vz * vz); accS += dt * sp * 16 * k;
      while (accS >= 1) {
        accS -= 1; const a = rnd() * 6.283, sd = 0.5 + rnd() * 1.1, p = S[sCur]; sCur = (sCur + 1) % MAX_SAND;
        p.on = true; p.x = x + (rnd() - 0.5) * 0.2; p.y = y + 0.15; p.z = z + (rnd() - 0.5) * 0.2; p.vx = -vx * 0.25 + Math.cos(a) * sd; p.vz = -vz * 0.25 + Math.sin(a) * sd; p.vy = 1.6 + rnd() * 2.6 + sp * 0.12; p.s = 0.025 + rnd() * 0.035; p.floor = y;
      }
      if (rnd() < dt * sp * 3 * k) { const u = U[uCur]; uCur = (uCur + 1) % MAX_DUST; u.on = true; u.x = x; u.y = y + 0.1; u.z = z; u.vx = -vx * 0.15 + (rnd() - 0.5) * 0.4; u.vz = -vz * 0.15 + (rnd() - 0.5) * 0.4; u.vy = 0.4 + rnd() * 0.5; u.t = 0; u.life = 0.6 + rnd() * 0.5; u.s = 0.2 + rnd() * 0.2; }
    },
    /** Feed the geyser's column at the nozzle (x, y, z) with strength `amount` (0..1) for `dt` seconds; `height` is the top of the column. */
    jet(x, y, z, amount, dt, height) {
      acc += dt * 110 * amount * k; accM += dt * 22 * amount * k;
      while (acc >= 1) { acc -= 1; const a = rnd() * 6.283, sp = rnd() * 0.55, up = 6.2 + 2.8 * amount * (0.6 + rnd() * 0.5) * Math.sqrt(height / 3.2); addDrop(x + Math.cos(a) * 0.12, y + 0.3, z + Math.sin(a) * 0.12, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.045 + rnd() * 0.06, y - 0.01); }
      while (accM >= 1) { accM -= 1; const a = rnd() * 6.283; addMist(x + Math.cos(a) * 0.3, y + 0.4 + rnd() * height * 0.7, z + Math.sin(a) * 0.3, Math.cos(a) * 0.4, 0.5 + rnd() * 0.6, Math.sin(a) * 0.4, 0.8 + rnd() * 0.5, 0.22 + rnd() * 0.22); }
      if (rnd() < dt * 5 * amount) addRing(x, y + 0.01, z, 0.9 + rnd() * 0.5, 0.9);
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < MAX_DROPS; i++) {
        const p = D[i]; if (!p.on) continue; any = true;
        p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) { p.on = false; drops.setMatrixAt(i, zero); if (rnd() < 0.18) addRing(p.x, p.floor + 0.01, p.z, 0.3 + rnd() * 0.2, 0.6); continue; }
        const st = Math.min(1.7, 1 + Math.abs(p.vy) * 0.07);
        m.compose(v.set(p.x, p.y, p.z), q.identity(), sc.set(p.s, p.s * st, p.s)); drops.setMatrixAt(i, m);
      }
      for (let i = 0; i < MAX_MIST; i++) {
        const p = M[i]; if (!p.on) continue; any = true;
        p.t += dt; if (p.t >= p.life) { p.on = false; mists.setMatrixAt(i, zero); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const u = p.t / p.life, s = p.s * (0.5 + u) * (1 - u * u * 0.6);
        m.compose(v.set(p.x, p.y, p.z), q.identity(), sc.set(s, s, s)); mists.setMatrixAt(i, m);
      }
      for (const r of rings) {
        if (!r.on) continue; any = true; r.t += dt; const u = r.t / r.life;
        if (u >= 1) { r.on = false; r.mesh.visible = false; continue; }
        const s = r.size * (0.25 + 1.3 * Math.sqrt(u)); r.mesh.scale.set(s, 1, s); r.mat.opacity = 0.75 * (1 - u) * (1 - u);
      }
      for (let i = 0; i < MAX_SAND; i++) {
        const p = S[i]; if (!p.on) continue; any = true;
        p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) { p.on = false; sands.setMatrixAt(i, zero); continue; }
        m.compose(v.set(p.x, p.y, p.z), q.identity(), sc.set(p.s, p.s, p.s)); sands.setMatrixAt(i, m);
      }
      for (let i = 0; i < MAX_DUST; i++) {
        const p = U[i]; if (!p.on) continue; any = true; p.t += dt;
        if (p.t >= p.life) { p.on = false; dusts.setMatrixAt(i, zero); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const u = p.t / p.life, s = p.s * (0.6 + u) * (1 - u * u * 0.5);
        m.compose(v.set(p.x, p.y, p.z), q.identity(), sc.set(s, s * 0.7, s)); dusts.setMatrixAt(i, m);
      }
      for (let i = 0; i < MAX_FOG; i++) {
        const p = F[i]; if (!p.on) { aAlpha.array[i] = 0; continue; } any = true; p.t += dt;
        if (p.t >= p.life) { p.on = false; fogs.setMatrixAt(i, zero); aAlpha.array[i] = 0; continue; }
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += 0.1 * dt; p.rot += p.spin * dt; const u = p.t / p.life, env = Math.sin(Math.PI * u), s2 = p.s * (0.7 + 0.6 * u);
        m.compose(v.set(p.x, p.y, p.z), q.identity(), sc.set(s2, s2, s2)); fogs.setMatrixAt(i, m); aAlpha.array[i] = 0.55 * env * env; aRot.array[i] = p.rot;
      }
      aAlpha.needsUpdate = true; aRot.needsUpdate = true;
      if (any) { fogs.instanceMatrix.needsUpdate = true; sands.instanceMatrix.needsUpdate = true; dusts.instanceMatrix.needsUpdate = true; drops.instanceMatrix.needsUpdate = true; mists.instanceMatrix.needsUpdate = true; }
    },
    dispose() { fogGeo.dispose(); fogMat.dispose(); smokeTex.dispose(); sands.geometry.dispose(); dusts.geometry.dispose(); sandMat.dispose(); dustMat.dispose(); drops.geometry.dispose(); mists.geometry.dispose(); ringGeo.dispose(); dropMat.dispose(); mistMat.dispose(); for (const r of rings) r.mat.dispose(); },
  };
}
