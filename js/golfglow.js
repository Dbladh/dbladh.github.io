// The glow where the ball hits something: a bright strip along the wall it struck, a halo round a post, bumper or hero part. A small pool of additive meshes is moved to each hit and fades in a
// fraction of a second, so every wall, post and obstacle of a hole lights up when the ball knocks it. The pool lives in the hole's group (so it follows the hole), and costs nothing while idle.
import * as THREE from 'three';
import { hillH } from './golfphys.js?v=20261029200716';

const FADE = 0.65;
export function createGlow(low = false) {
  const N = low ? 6 : 12, box = new THREE.BoxGeometry(1, 1, 1), tube = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), strips = [], halos = [];
  const mk = (geo, list) => { for (let i = 0; i < N; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 6; list.push({ m, t: 9, peak: 1 }); } };
  mk(box, strips); mk(tube, halos);
  let group = null, hole = null, si = 0, hi = 0;
  return {
    /** Put the pool into `g` (a hole's group) for `h`. */
    attach(g, h) { this.detach(); group = g; hole = h; for (const it of [...strips, ...halos]) { it.t = 9; it.m.visible = false; g.add(it.m); } },
    detach() { for (const it of [...strips, ...halos]) { it.m.parent?.remove(it.m); it.m.visible = false; } group = null; hole = null; },
    /** The wall segment (ax, az)-(bx, bz) was hit near (cx, cz) with `strength`: a strip along it lights up. */
    wall(ax, az, bx, bz, cx, cz, strength, color = '#ffe9a0') {
      if (!group) return; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, l = Math.sqrt(l2), t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / l2)), px = ax + dx * t, pz = az + dz * t;
      const it = strips[si]; si = (si + 1) % N; const len = Math.min(l, 2.2 + strength * 0.3), y = Math.max(0, hillH(hole, px, pz)) + 0.42;
      it.m.position.set(px, y, pz); it.m.scale.set(len, 0.8, 0.3); it.m.rotation.y = Math.atan2(-dz, dx); it.m.material.color.set(color); it.t = 0; it.peak = Math.min(1, 0.7 + strength / 12); it.m.visible = true;
    },
    /** A round thing of radius r at (x, z) was hit with `strength`: a halo round it flares. */
    disc(x, z, r, strength, color = '#ffd23f') {
      if (!group) return; const it = halos[hi], y = Math.max(0, hillH(hole, x, z));
      hi = (hi + 1) % N; it.m.position.set(x, y + 0.45, z); it.m.scale.set(r * 1.25 + 0.12, 0.95, r * 1.25 + 0.12); it.m.material.color.set(color); it.t = 0; it.peak = Math.min(1, 0.75 + strength / 12); it.m.visible = true;
    },
    update(dt) { for (const it of [...strips, ...halos]) { if (!it.m.visible) continue; it.t += dt; const k = it.t / FADE; if (k >= 1) { it.m.visible = false; continue; } it.m.material.opacity = it.peak * (1 - k) * (1 - k); } },
    dispose() { this.detach(); box.dispose(); tube.dispose(); for (const it of [...strips, ...halos]) it.m.material.dispose(); },
  };
}
