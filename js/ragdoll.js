// A small verlet ragdoll for the rider. When the bike crashes the rider's body parts are let go of: eleven joints with
// distance constraints fly and flop under gravity, bounce on the ground under them, and drive the same meshes the rider
// was built from (so nothing needs to be built twice). `restore()` puts everything back on the bike.
import * as THREE from 'three';
import { aim } from './bike.js?v=20261017152006';

const GRAV = 24;
const L = { torso: 0.56, neck: 0.22, upper: 0.36, fore: 0.36, thigh: 0.42, shin: 0.42 };   // rider-local lengths (before scaling)

export function createRagdoll(scene, rider, groundAt) {
  const P = rider.parts;
  const tmp = new THREE.Vector3();
  const world = (obj, x, y) => { tmp.set(x, y, 0); obj.localToWorld(tmp); return [tmp.x, tmp.y, tmp.z]; };
  let active = false, s = 1, speedNow = 99;
  // joints: 0 hip, 1 shoulder, 2 head, 3/4 elbow+hand near, 5/6 elbow+hand far, 7/8 knee+foot near, 9/10 knee+foot far
  let pts = [], cons = [];
  const zs = {};
  const parts = Object.entries(P);

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const self = {
    /** Set by the game: called with the impact speed when the body hits the ground hard (for the thud). */
    onBounce: null,
    get active() { return active; },
    /** The hips (the centre of the body), or null before the rider is let go. */
    get hip() { return active && pts.length ? pts[0] : null; },
    /** How fast the fastest joint is moving (world units per second): near zero once the body has come to rest. */
    get speed() { return speedNow; },
    /** Let the rider go: joints take the pose the rider is in right now and the bike's velocity. */
    detach(vx, vy) {
      if (active) return;
      active = true; speedNow = 99;
      const rg = rider.group;
      rg.updateMatrixWorld(true);
      s = new THREE.Vector3().setFromMatrixScale(rg.matrixWorld).x;
      const J = (o, y) => world(o, 0, y);
      const hip = world(P.torso, 0, 0), sh = world(P.torso, 0, L.torso), head = world(P.head, 0, 0);
      const el = (k) => J(P['uArm' + k], -L.upper), hand = (k) => J(P['fArm' + k], -L.fore);
      const kn = (k) => J(P['uLeg' + k], -L.thigh), foot = (k) => J(P['fLeg' + k], -L.shin);
      const pos = [hip, sh, head, el('N'), hand('N'), el('F'), hand('F'), kn('N'), foot('N'), kn('F'), foot('F')];
      const dt = 1 / 120;
      pts = pos.map((p, i) => {
        const jx = (Math.random() - 0.5) * 2.5, jy = (Math.random() - 0.5) * 2.5, fwd = i === 2 || i === 4 || i === 6 ? 2.5 : 0;   // head and hands lead
        return { x: p[0], y: p[1], px: p[0] - (vx + jx + fwd) * dt, py: p[1] - (vy + 3 + jy) * dt };
      });
      const e = (i, j, len) => ({ i, j, len: len * s, t: 'eq' });
      cons = [
        e(0, 1, L.torso), e(1, 2, L.neck),
        e(1, 3, L.upper), e(3, 4, L.fore), e(1, 5, L.upper), e(5, 6, L.fore),
        e(0, 7, L.thigh), e(7, 8, L.shin), e(0, 9, L.thigh), e(9, 10, L.shin),
        { i: 0, j: 2, len: 0.5 * s, t: 'min' }, { i: 0, j: 2, len: 0.8 * s, t: 'max' },     // the neck bends a little, not fully
        { i: 1, j: 4, len: 0.16 * s, t: 'min' }, { i: 1, j: 6, len: 0.16 * s, t: 'min' },    // elbows and knees fold only so far
        { i: 0, j: 8, len: 0.22 * s, t: 'min' }, { i: 0, j: 10, len: 0.22 * s, t: 'min' },
        { i: 0, j: 4, len: 0.2 * s, t: 'min' }, { i: 0, j: 6, len: 0.2 * s, t: 'min' },
      ];
      // let go of the bike: every part becomes a child of the scene, keeping its look and its depth in the lane
      for (const [name, o] of parts) { zs[name] = o.getWorldPosition(tmp).z; scene.attach(o); o.scale.setScalar(s); }
    },
    update(dt) {
      if (!active) return;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n, r = 0.14 * s; let hit = 0;
      for (let step = 0; step < n; step++) {
        for (const p of pts) {
          const vx = (p.x - p.px) * 0.995, vy = (p.y - p.py) * 0.995;
          p.px = p.x; p.py = p.y;
          p.x += vx; p.y += vy - GRAV * h * h;
        }
        for (let it = 0; it < 6; it++) {
          for (const c of cons) {
            const a = pts[c.i], b = pts[c.j];
            let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
            if ((c.t === 'min' && d >= c.len) || (c.t === 'max' && d <= c.len)) continue;
            const k = (d - c.len) / d * 0.5;
            a.x += dx * k; a.y += dy * k; b.x -= dx * k; b.y -= dy * k;
          }
          for (const p of pts) {                           // the ground: slide, lose some energy
            const g = groundAt(p.x) + r;
            if (p.y < g) { const vy = p.y - p.py; if (vy < 0 && h > 1e-5) hit = Math.max(hit, -vy / h); p.y = g; p.py = g + 0.25 * vy; p.px += (p.x - p.px) * 0.35; }   // bounce a little, drag along
          }
        }
      }
      if (hit > 2.5 && self.onBounce) self.onBounce(hit);
      let mv = 0; for (const p of pts) mv = Math.max(mv, Math.hypot(p.x - p.px, p.y - p.py) / h);
      if (h > 1e-5) speedNow = mv;
      // drive the meshes
      const pt = (i) => pts[i];
      const zOf = (name) => zs[name];
      aim(P.uArmN, pt(1).x, pt(1).y, pt(3).x, pt(3).y, zOf('uArmN')); aim(P.fArmN, pt(3).x, pt(3).y, pt(4).x, pt(4).y, zOf('fArmN'));
      aim(P.uArmF, pt(1).x, pt(1).y, pt(5).x, pt(5).y, zOf('uArmF')); aim(P.fArmF, pt(5).x, pt(5).y, pt(6).x, pt(6).y, zOf('fArmF'));
      aim(P.uLegN, pt(0).x, pt(0).y, pt(7).x, pt(7).y, zOf('uLegN')); aim(P.fLegN, pt(7).x, pt(7).y, pt(8).x, pt(8).y, zOf('fLegN'));
      aim(P.uLegF, pt(0).x, pt(0).y, pt(9).x, pt(9).y, zOf('uLegF')); aim(P.fLegF, pt(9).x, pt(9).y, pt(10).x, pt(10).y, zOf('fLegF'));
      P.torso.position.set(pt(0).x, pt(0).y, zOf('torso'));
      P.torso.rotation.z = Math.atan2(-(pt(1).x - pt(0).x), pt(1).y - pt(0).y);
      P.head.position.set(pt(2).x, pt(2).y, zOf('head'));
      P.head.rotation.z = Math.atan2(-(pt(2).x - pt(1).x), pt(2).y - pt(1).y);
    },
    /** Put the rider back on the bike. */
    restore() {
      if (!active) return;
      active = false;
      for (const [, o] of parts) { rider.group.add(o); o.scale.setScalar(1); }
    },
  };
  return self;
}
