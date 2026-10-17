// A low-poly dirt bike and rider, built from flat-shaded boxes and rings in the town palette.
// Everything faces +x and is built with the ground at y = 0, then wrapped so the group's origin is the axle line
// (so pitching the bike turns it about its wheels). The rider is made of separate limb groups so the
// game can let go of them for the crash ragdoll.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261016201222';

export const BIKE = { wheelR: 0.36, rearX: -0.68, frontX: 0.68, wheelbase: 1.36, hip: [-0.22, 1.02], hands: [0.6, 1.2], feet: [0.0, 0.48] };

const mats = {};
const mat = (hex) => (mats[hex] ??= new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), flatShading: true }));
const M = {
  body: () => mat(PAL.marigold), plastic: () => mat(PAL.cream), frame: () => mat(PAL.charcoal), seat: () => mat('#3a3d44'),
  tyre: () => mat('#2f3238'), rim: () => mat(PAL.sage), fork: () => mat(PAL.gold), metal: () => mat(PAL.stoneCool),
  suit: () => mat(PAL.coral), pants: () => mat(PAL.ink), boot: () => mat('#3a3d44'), helmet: () => mat(PAL.cream),
  stripe: () => mat(PAL.cream), visor: () => mat('#1d2126'), glove: () => mat('#3a3d44'),
};

function box(parent, m, w, h, d, x, y, z = 0, rz = 0) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z); me.rotation.z = rz; me.castShadow = true;
  parent.add(me); return me;
}
/** A bar (box) from (x1,y1) to (x2,y2) in the side plane, `t` thick, at depth z. */
function bar(parent, m, x1, y1, x2, y2, t, z = 0, depth = t) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return box(parent, m, len, t, depth, (x1 + x2) / 2, (y1 + y2) / 2, z, Math.atan2(y2 - y1, x2 - x1));
}

function wheel() {
  const g = new THREE.Group(), R = BIKE.wheelR;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.06, 0.07, 5, 16), M.tyre());
  tyre.castShadow = true; g.add(tyre);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.14, 0.03, 4, 12), M.rim()); g.add(rim);
  for (let k = 0; k < 3; k++) {
    const sp = box(g, M.rim(), (R - 0.14) * 2, 0.025, 0.025, 0, 0, 0, (k * Math.PI) / 3);
    sp.castShadow = false;
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6).rotateX(Math.PI / 2), M.metal()); g.add(hub);
  for (let k = 0; k < 18; k++) {                       // knobs
    const a = (k / 18) * Math.PI * 2;
    const kn = box(g, M.tyre(), 0.05, 0.05, 0.13, Math.cos(a) * (R + 0.005), Math.sin(a) * (R + 0.005), 0, a);
    kn.castShadow = false;
  }
  return g;
}

/** Plant a planar two-bone limb: returns the middle joint for a root and target. `forward` bends toward +x, else downward. */
function ik(rx, ry, tx, ty, l1, l2, forward) {
  let dx = tx - rx, dy = ty - ry, d = Math.hypot(dx, dy);
  const dm = Math.min(d, l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  const mx = rx + ux * a, my = ry + uy * a;
  const c1 = [mx - uy * h, my + ux * h], c2 = [mx + uy * h, my - ux * h];
  const pick = forward ? (c1[0] > c2[0] ? c1 : c2) : (c1[1] < c2[1] ? c1 : c2);
  return { mid: pick, end: [rx + ux * dm, ry + uy * dm] };
}

/** A limb group whose pivot is at its top and whose box hangs down by `len`. */
function limb(parent, m, len, w, d, tip) {
  const g = new THREE.Group();
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), m);
  me.position.y = -len / 2; me.castShadow = true; g.add(me);
  if (tip) { const t = new THREE.Mesh(new THREE.BoxGeometry(tip.w, tip.h, tip.d), tip.m); t.position.set(tip.x ?? 0, -len + (tip.y ?? 0), 0); t.castShadow = true; g.add(t); }
  parent.add(g);
  g.userData.len = len;
  return g;
}
/** Point a limb group's pivot at (x1,y1) so it ends at (x2,y2). */
export function aim(g, x1, y1, x2, y2, z) {
  g.position.set(x1, y1, z);
  g.rotation.set(0, 0, Math.atan2(x2 - x1, -(y2 - y1)));
}

function buildRider() {
  const group = new THREE.Group();
  const P = {};
  P.torso = (() => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.56, 0.4), M.suit()); t.position.y = 0.28; t.castShadow = true; g.add(t);
    box(g, M.stripe(), 0.31, 0.1, 0.41, 0, 0.3, 0);
    group.add(g); g.userData.len = 0.56; return g;
  })();
  P.head = (() => {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), M.helmet()); h.scale.set(1.1, 1, 0.95); h.castShadow = true; g.add(h);
    box(g, M.visor(), 0.18, 0.1, 0.3, 0.14, -0.01, 0);
    box(g, M.suit(), 0.3, 0.03, 0.06, 0, 0.19, 0, 0);
    group.add(g); return g;
  })();
  const arm = (z) => [limb(group, M.suit(), 0.36, 0.11, 0.11), limb(group, M.suit(), 0.36, 0.1, 0.1, { m: M.glove(), w: 0.13, h: 0.12, d: 0.13, y: 0.04 })];
  const leg = (z) => [limb(group, M.pants(), 0.42, 0.14, 0.14), limb(group, M.pants(), 0.42, 0.12, 0.12, { m: M.boot(), w: 0.28, h: 0.1, d: 0.14, x: 0.07, y: 0.04 })];
  [P.uArmN, P.fArmN] = arm(); [P.uArmF, P.fArmF] = arm();
  [P.uLegN, P.fLegN] = leg(); [P.uLegF, P.fLegF] = leg();
  return { group, parts: P, zs: { N: 0.17, F: -0.17 } };
}

/** Pose the rider on the bike. `lean` is the torso's forward tilt in radians (0 upright), `crouch` lifts the knees/arms a touch. */
export function poseRider(rider, lean = 0.7) {
  const P = rider.parts, [hx, hy] = BIKE.hip, [gx, gy] = BIKE.hands, [fx, fy] = BIKE.feet;
  const L = P.torso.userData.len;
  P.torso.position.set(hx, hy, 0); P.torso.rotation.z = -lean;
  const sx = hx + Math.sin(lean) * L, sy = hy + Math.cos(lean) * L;
  P.head.position.set(sx + Math.sin(lean) * 0.22, sy + Math.cos(lean) * 0.22, 0); P.head.rotation.z = -lean * 0.5;
  for (const k of ['N', 'F']) {
    const z = rider.zs[k];
    const a = ik(sx, sy, gx, gy, 0.36, 0.36, false);
    aim(P['uArm' + k], sx, sy, a.mid[0], a.mid[1], z * 1.1); aim(P['fArm' + k], a.mid[0], a.mid[1], a.end[0], a.end[1], z * 1.1);
    const l = ik(hx, hy, fx, fy, 0.42, 0.42, true);
    aim(P['uLeg' + k], hx, hy, l.mid[0], l.mid[1], z * 0.8); aim(P['fLeg' + k], l.mid[0], l.mid[1], l.end[0], l.end[1], z * 0.8);
  }
}

export function buildBike() {
  const root = new THREE.Group();                 // origin on the axle line
  const model = new THREE.Group(); model.position.y = -BIKE.wheelR; root.add(model);
  const R = BIKE.wheelR;
  const rear = wheel(); rear.position.set(BIKE.rearX, R, 0); model.add(rear);
  const front = wheel(); front.position.set(BIKE.frontX, R, 0); model.add(front);

  // frame, engine, body
  box(model, M.frame(), 0.5, 0.4, 0.26, 0.04, 0.58);
  box(model, M.metal(), 0.2, 0.2, 0.3, 0.02, 0.58);
  bar(model, M.frame(), -0.1, 0.62, 0.5, 1.02, 0.07, 0.1); bar(model, M.frame(), -0.1, 0.62, 0.5, 1.02, 0.07, -0.1);
  bar(model, M.frame(), -0.08, 0.5, BIKE.rearX, R, 0.06, 0.1); bar(model, M.frame(), -0.08, 0.5, BIKE.rearX, R, 0.06, -0.1);   // swingarm
  box(model, M.body(), 0.56, 0.34, 0.38, 0.22, 0.98, 0, -0.1); box(model, M.body(), 0.24, 0.4, 0.36, 0.5, 0.86, 0, -0.35);                                                       // tank
  box(model, M.seat(), 0.72, 0.12, 0.3, -0.32, 0.92, 0, 0.04);                                                       // seat
  box(model, M.body(), 0.46, 0.05, 0.3, -0.84, 1.03, 0, 0.32);                                                       // rear fender
  box(model, M.plastic(), 0.4, 0.28, 0.04, -0.02, 0.8, 0.17, 0); box(model, M.plastic(), 0.4, 0.28, 0.04, -0.02, 0.8, -0.17, 0);   // side panels
  bar(model, M.metal(), 0.0, 0.46, -0.78, 0.82, 0.09, -0.19);                                                        // exhaust
  // forks, bars, front end
  bar(model, M.fork(), 0.5, 1.2, BIKE.frontX, 0.5, 0.08, 0.11); bar(model, M.fork(), 0.5, 1.2, BIKE.frontX, 0.5, 0.08, -0.11);
  bar(model, M.frame(), BIKE.frontX, 0.5, BIKE.frontX, R, 0.06, 0.11); bar(model, M.frame(), BIKE.frontX, 0.5, BIKE.frontX, R, 0.06, -0.11);
  box(model, M.frame(), 0.06, 0.06, 0.58, 0.5, 1.21, 0);
  box(model, M.plastic(), 0.08, 0.3, 0.3, 0.64, 1.08, 0, -0.2);                                                       // number plate
  box(model, M.body(), 0.5, 0.05, 0.3, 0.78, 0.84, 0, -0.35);                                                          // front fender

  const rider = buildRider(); rider.group.scale.setScalar(1.12); model.add(rider.group); poseRider(rider, 0.7);
  root.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = true; });
  return { root, model, wheels: { rear, front }, rider };
}
