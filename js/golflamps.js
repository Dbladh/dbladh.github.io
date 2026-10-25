// The lamp posts along the course. All the lamps of all nine holes are drawn with a few instanced meshes: the post, the arm that reaches over the course, the shade and the bulb,
// and, switched on by `update(night)`, a soft cone of light, a pool of light on the ground and a glow round the bulb. A few real point lights (borrowed from the village) light the
// holes near the one in play (see golf.js).
import * as THREE from 'three';
import { toWorld } from './golfsites.js?v=20261024211832';

const POST_H = 3.0, ARM = 1.7;
const radial = (stops) => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [t, a] of stops) g.addColorStop(t, `rgba(255,255,255,${a})`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

/**
 * Where the lamps of one hole go: outside its walls at a few evenly spaced points, each with an arm reaching in over the course. Returns [{ x, z, ax, az }] in world coordinates
 * (ax, az: the unit direction the arm points). `blocked(x, z)` says whether a spot is taken.
 */
export function lampSpots(h, site, count, blocked) {
  const P = h.path, N = P.length, out = [], o = toWorld(site, 0, 0);
  for (let k = 0; k < count; k++) {                        // evenly along the corridor, on alternating sides
    const i = Math.min(N - 2, Math.max(1, Math.round(((k + 0.5) / count) * (N - 1)))), a = P[i - 1], b = P[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
    const side = k % 2 ? 1 : -1, nx = -tz * side, nz = tx * side, off = h.widths[i] + 1.5;
    const p = toWorld(site, P[i].x + nx * off, P[i].z + nz * off), d = toWorld(site, -nx, -nz);
    if (blocked(p.x, p.z)) continue;
    out.push({ x: p.x, z: p.z, ax: d.x - o.x, az: d.z - o.z });
  }
  return out;
}

/** The lamps. `spots` is [{ hole, x, z, ax, az }]; `ground(x, z)` the real height of the ground. */
export function buildLamps(spots, ground) {
  const n = spots.length, group = new THREE.Group(), UP = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const dark = new THREE.MeshLambertMaterial({ color: '#3b3d46' }), shadeMat = new THREE.MeshLambertMaterial({ color: '#2d2f38' }), bulbMat = new THREE.MeshBasicMaterial({ color: '#f4efe2' });
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const poolTex = radial([[0, 0.8], [0.4, 0.38], [0.68, 0.1], [0.9, 0]]), glowTex = radial([[0, 1], [0.25, 0.55], [1, 0]]);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: '#ffc77a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const glowMat = new THREE.PointsMaterial({ map: glowTex, color: '#ffd28a', size: 2.4, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const mk = (geo, mat, cast) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = !!cast; im.frustumCulled = false; group.add(im); return im; };
  const posts = mk(new THREE.CylinderGeometry(0.06, 0.08, POST_H, 8), dark, true), arms = mk(new THREE.BoxGeometry(1, 1, 1), dark, true), shades = mk(new THREE.ConeGeometry(0.3, 0.24, 10), shadeMat, true);
  const bulbs = mk(new THREE.SphereGeometry(0.15, 10, 8), bulbMat), beams = mk(new THREE.ConeGeometry(4.2, 1, 24, 1, true), beamMat), pools = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat);
  beams.renderOrder = 2; pools.renderOrder = 2;
  const glowGeo = new THREE.BufferGeometry(), glowPos = new Float32Array(n * 3); glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  const glow = new THREE.Points(glowGeo, glowMat); glow.frustumCulled = false; glow.renderOrder = 3; group.add(glow);
  const finals = [], bulbAt = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  spots.forEach((p, i) => {
    const y = ground(p.x, p.z), bx = p.x + p.ax * ARM, bz = p.z + p.az * ARM, by = y + POST_H - 0.12, gy = ground(bx, bz), yaw = Math.atan2(-p.az, p.ax), set = (mesh, mat4) => { (finals[i] ||= [])[meshes.indexOf(mesh)] = mat4.clone(); };
    const meshes = [posts, arms, shades, bulbs, beams, pools];
    set(posts, m.compose(v.set(p.x, y + POST_H / 2, p.z), q.identity(), s.set(1, 1, 1)));
    set(arms, m.compose(v.set(p.x + p.ax * ARM * 0.5, y + POST_H, p.z + p.az * ARM * 0.5), q.setFromAxisAngle(UP, yaw), s.set(ARM, 0.07, 0.07)));
    set(shades, m.compose(v.set(bx, by + 0.28, bz), q.identity(), s.set(1, 1, 1)));
    set(bulbs, m.compose(v.set(bx, by, bz), q.identity(), s.set(1, 1, 1)));
    set(beams, m.compose(v.set(bx, (by + gy) / 2, bz), q.identity(), s.set(1, by - gy, 1)));
    set(pools, m.compose(v.set(bx, gy + 0.07, bz), q.identity(), s.set(11, 1, 11)));
    glowPos[i * 3] = bx; glowPos[i * 3 + 1] = by; glowPos[i * 3 + 2] = bz;
    p.bulb = { x: bx, y: by, z: bz }; p.mats = meshes;
    for (const mesh of meshes) mesh.setMatrixAt(i, zero);
  });
  for (const mesh of [posts, arms, shades, bulbs, beams, pools]) mesh.instanceMatrix.needsUpdate = true;
  const meshes = [posts, arms, shades, bulbs, beams, pools], day = new THREE.Color('#f4efe2'), nightC = new THREE.Color('#fff0c4'); let lastNight = -1; const warmC = new THREE.Color('#ffcf8a'), warmP = new THREE.Color('#ffc77a'), warmG = new THREE.Color('#ffd28a'), uvC = new THREE.Color('#8a4dff'), uvG = new THREE.Color('#b57dff'), uvBulb = new THREE.Color('#e3c2ff');
  return {
    group, count: n,
    /** Show or hide the lamps of hole `hole` (they appear once the hole has risen). */
    show(hole, on) { spots.forEach((p, i) => { for (let k = 0; k < meshes.length; k++) meshes[k].setMatrixAt(i, on ? finals[i][k] : zero); }); for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true; },
    showHole(hole, on) {
      let hit = false; spots.forEach((p, i) => { if (p.hole !== hole) return; hit = true; for (let k = 0; k < meshes.length; k++) meshes[k].setMatrixAt(i, on ? finals[i][k] : zero); });
      if (hit) for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    },
    /** `night`: 0 (day) to 1 (full night). */
    update(night) {
      if (Math.abs(night - lastNight) < 0.004) return; lastNight = night;
      const k = Math.min(1, night * 1.6);
      const uv = Math.min(1, Math.max(0, (night - 0.35) / 0.5)), u = uv * uv * (3 - 2 * uv);                // (deep night: the warm lamps turn to ultraviolet)
      beamMat.opacity = (0.06 + 0.05 * u) * k; poolMat.opacity = (0.42 + 0.25 * u) * k; glowMat.opacity = 0.95 * k;
      bulbMat.color.copy(day).lerp(nightC, k).lerp(uvBulb, u); beamMat.color.copy(warmC).lerp(uvC, u); poolMat.color.copy(warmP).lerp(uvC, u); glowMat.color.copy(warmG).lerp(uvG, u);
      glow.visible = beamMat.visible = poolMat.visible = k > 0.003;
    },
    dispose() { for (const mesh of meshes) { mesh.geometry.dispose(); mesh.dispose?.(); } glowGeo.dispose(); poolTex.dispose(); glowTex.dispose(); for (const mt of [dark, shadeMat, bulbMat, beamMat, poolMat, glowMat]) mt.dispose(); },
  };
}
