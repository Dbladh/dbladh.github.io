// A low-poly dirt bike and rider in the town palette: faceted, flat-shaded shapes (profiles extruded with a small bevel,
// tapered tubes, lathed forms) rather than boxes. Everything faces +x and is built with the ground at y = 0, then wrapped
// so the group's origin is the axle line (so pitching the bike turns it about its wheels). The rider is made of separate
// limb groups (pivot at the top, hanging down) so the game can let go of them for the crash ragdoll.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261017115138';

export const BIKE = { wheelR: 0.36, rearX: -0.68, frontX: 0.68, wheelbase: 1.36, hip: [-0.22, 1.02], hands: [0.6, 1.2], feet: [0.0, 0.48] };

const mats = {};
const mat = (hex) => (mats[hex] ??= new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), flatShading: true }));
const M = {
  body: () => mat(PAL.marigold), bodyDeep: () => mat('#c98f2e'), plastic: () => mat(PAL.cream), frame: () => mat(PAL.charcoal), seat: () => mat('#3a3d44'),
  tyre: () => mat('#2f3238'), rim: () => mat(PAL.sage), fork: () => mat(PAL.gold), metal: () => mat(PAL.stoneCool), steel: () => mat('#8c8f93'),
  suit: () => mat(PAL.coral), suitDeep: () => mat('#b24c3d'), pants: () => mat(PAL.ink), boot: () => mat('#3a3d44'), helmet: () => mat(PAL.cream),
  stripe: () => mat(PAL.cream), visor: () => mat('#1d2126'), glove: () => mat('#3a3d44'), skin: () => mat('#e2b48f'), rubber: () => mat('#26292e'), light: () => mat('#e8473a'), carbon: () => mat('#4a4f58'),
};

const add = (parent, geo, m, x = 0, y = 0, z = 0, cast = true) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = cast; parent.add(me); return me; };

/** A side profile (points in x,y) extruded `depth` across the bike, centred on z = 0, with a small bevel so edges catch the light. */
function ext(pts, depth, bevel = 0.025) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
}
/** A tapered rod from (x1,y1,z1) to (x2,y2,z2): radius r1 at the start, r2 at the end. */
function rod(parent, m, a, b, r1, r2 = r1, radial = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, radial, 1);
  const me = new THREE.Mesh(g, m); me.castShadow = true;
  me.position.copy(A).add(B).multiplyScalar(0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(me); return me;
}
/** A smooth bent tube through 3D points. */
function tube(parent, m, pts, r, segs = 14, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const me = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, radial, false), m); me.castShadow = true; parent.add(me); return me;
}

/** Merge a group's meshes into one mesh per material (positions baked in the group's own frame), skipping anything in `skip`. */
function bake(group, skip = []) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), rel = new THREE.Matrix4();
  const skipSet = new Set(); for (const sk of skip) sk.traverse((o) => skipSet.add(o));
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh || skipSet.has(o)) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
    if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(o);
  });
  for (const b of buckets.values()) {
    let total = 0;
    const geos = b.list.map((o) => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); total += g.attributes.position.count; return g; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let at = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, at * 2);
      at += n; g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(merged, b.material); mesh.castShadow = b.cast;
    for (const o of b.list) { o.removeFromParent(); o.geometry.dispose(); }
    group.add(mesh);
  }
}
/** A number painted on a plate (transparent canvas texture on a small plane). */
const numTex = {};
function decal(parent, text, w, h, x, y, z, rz = 0, flip = false, color = '#3f4f5a') {
  const key = text + color;
  if (!numTex[key]) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96;
    const g = c.getContext('2d'); g.fillStyle = color; g.font = '800 84px Outfit, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 32, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; numTex[key] = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), numTex[key]);
  m.position.set(x, y, z); m.rotation.z = rz; if (flip) m.rotation.y = Math.PI;
  parent.add(m); return m;
}

function wheel() {
  const g = new THREE.Group(), R = BIKE.wheelR;
  add(g, new THREE.TorusGeometry(R - 0.06, 0.075, 7, 22), M.tyre());                                    // tyre
  add(g, new THREE.TorusGeometry(R - 0.145, 0.028, 5, 18), M.rim(), 0, 0, 0, false);                    // rim
  for (let k = 0; k < 10; k++) {                                                                         // spokes
    const a = (k / 10) * Math.PI;
    rod(g, M.rim(), [Math.cos(a) * (R - 0.15), Math.sin(a) * (R - 0.15), 0.012], [-Math.cos(a) * (R - 0.15), -Math.sin(a) * (R - 0.15), -0.012], 0.01, 0.01, 4).castShadow = false;
  }
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8).rotateX(Math.PI / 2), M.metal(), 0, 0, 0, false);   // hub
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.27, 6).rotateX(Math.PI / 2), M.steel(), 0, 0, 0, false);   // axle nut
  add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 5), M.steel(), 0.0, R - 0.1, 0.0, false);                // valve / rim lock
  for (let k = 0; k < 22; k++) {                                                                         // knobs: little wedges that lean into the tread, in two staggered rows
    const a = (k / 22) * Math.PI * 2;
    for (const zz of [-0.045, 0.045]) {
      const kn = add(g, new THREE.BoxGeometry(0.06, 0.05, 0.065), M.tyre(), Math.cos(a + zz) * (R + 0.012), Math.sin(a + zz) * (R + 0.012), zz, false);
      kn.rotation.z = a + zz + 0.35;
    }
  }
  bake(g);
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

/** A limb group whose pivot is at its top and which hangs down by `len`: a tapered rod with a round joint on top and an optional tip shape. */
function limb(parent, m, len, r0, r1, ...tipFns) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r0, r1, len, 6, 1), m, 0, -len / 2, 0);
  add(g, new THREE.IcosahedronGeometry(r0 * 1.12, 0), m, 0, 0, 0);                  // the joint (shoulder, elbow, hip, knee)
  for (const f of tipFns) f(g, len);
  parent.add(g);
  g.userData.len = len;
  return g;
}
const gloveTip = (g, len) => {
  add(g, new THREE.IcosahedronGeometry(0.072, 0), M.glove(), 0.01, -len - 0.01, 0);                                         // palm
  add(g, new THREE.CylinderGeometry(0.058, 0.052, 0.08, 6), M.glove(), 0, -len + 0.03, 0, false);                            // cuff
  add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), M.stripe(), 0, -len + 0.075, 0, false);                            // wristband
  for (const [fz, l] of [[-0.035, 0.07], [-0.012, 0.085], [0.012, 0.085], [0.035, 0.07]]) rod(g, M.glove(), [0.045, -len - 0.025, fz], [0.045 + l * 0.8, -len - 0.025 - l * 0.55, fz], 0.016, 0.013, 4, false);   // fingers curled around the grip
  rod(g, M.glove(), [0.0, -len + 0.0, 0.055], [0.07, -len - 0.04, 0.05], 0.017, 0.013, 4);                                  // thumb
};
const bootTip = (g, len) => {
  add(g, ext([[-0.08, -0.06], [0.2, -0.06], [0.24, -0.01], [0.2, 0.05], [0.06, 0.09], [0.06, 0.23], [-0.06, 0.23], [-0.09, 0.05]], 0.13, 0.015), M.boot(), 0.0, -len - 0.02, 0);
  add(g, ext([[-0.085, -0.075], [0.21, -0.075], [0.245, -0.04], [-0.09, -0.04]], 0.135, 0.01), M.rubber(), 0.0, -len - 0.02, 0, false);   // sole
  add(g, ext([[0.14, 0.0], [0.235, 0.0], [0.205, 0.055], [0.13, 0.07]], 0.14, 0.01), M.steel(), 0.0, -len - 0.02, 0, false);              // toe cap
  for (const yy of [0.06, 0.12, 0.18]) for (const zz of [-0.068, 0.068]) add(g, new THREE.BoxGeometry(0.03, 0.025, 0.012), M.stripe(), 0.063, -len - 0.02 + yy, zz, false);   // buckles
};
const kneeGear = (g, len) => {                                                                                              // shell and straps over the knee (on the upper leg's lower end)
  add(g, ext([[0.0, -0.1], [0.13, -0.07], [0.14, 0.1], [0.0, 0.12]], 0.17, 0.02), M.carbon(), 0.04, -len + 0.02, 0, true);
  rod(g, M.steel(), [0.05, -len + 0.02, 0.09], [0.05, -len - 0.09, 0.09], 0.012, 0.012, 4); rod(g, M.steel(), [0.05, -len + 0.02, -0.09], [0.05, -len - 0.09, -0.09], 0.012, 0.012, 4);
  add(g, new THREE.CylinderGeometry(0.098, 0.098, 0.04, 7), M.stripe(), 0, -0.06, 0, false);                               // thigh strap
};
const elbowPad = (g, len) => {
  add(g, new THREE.IcosahedronGeometry(0.075, 0), M.suitDeep(), -0.03, -0.03, 0);
};
const sleeveStripes = (g, len) => { add(g, new THREE.CylinderGeometry(0.066, 0.06, 0.03, 6), M.stripe(), 0, -len * 0.45, 0, false); };

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
    // jersey: a shaped torso (broad chest, narrower waist) with a cream band and darker shoulders
    add(g, ext([[-0.13, 0.0], [0.11, 0.0], [0.15, 0.2], [0.18, 0.4], [0.12, 0.55], [-0.09, 0.56], [-0.17, 0.4], [-0.17, 0.2]], 0.32, 0.04), M.suit(), 0, 0, 0);
    add(g, ext([[-0.145, 0.26], [0.16, 0.26], [0.17, 0.33], [-0.16, 0.33]], 0.335, 0.012), M.stripe(), 0, 0, 0, false);
    for (const sz of [-1, 1]) add(g, new THREE.IcosahedronGeometry(0.098, 0), M.suitDeep(), 0, 0.5, 0.17 * sz);                // shoulders
    add(g, ext([[-0.15, -0.06], [0.12, -0.06], [0.12, 0.08], [-0.16, 0.08]], 0.3, 0.035), M.pants(), 0, 0, 0);                // hips
    add(g, ext([[-0.16, 0.06], [0.125, 0.06], [0.13, 0.13], [-0.17, 0.13]], 0.325, 0.02), M.carbon(), 0, 0, 0, false);       // kidney belt
    add(g, new THREE.BoxGeometry(0.03, 0.05, 0.05), M.steel(), 0.135, 0.095, 0, false);                                       // buckle
    for (const yy of [0.34, 0.4, 0.46]) add(g, ext([[0.13, yy], [0.185, yy + 0.005], [0.185, yy + 0.03], [0.13, yy + 0.03]], 0.27, 0.008), M.suitDeep(), 0, 0, 0, false);   // chest protector ridges
    add(g, ext([[-0.17, 0.16], [-0.27, 0.2], [-0.28, 0.43], [-0.15, 0.47]], 0.2, 0.03), M.suitDeep(), 0, 0, 0);            // hydration pack
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 7).rotateX(Math.PI / 2), M.stripe(), -0.285, 0.33, 0, false);          // its cap
    add(g, new THREE.TorusGeometry(0.1, 0.04, 5, 9).rotateX(Math.PI / 2), M.carbon(), 0.0, 0.56, 0, false);                    // neck brace
    group.add(g); g.userData.len = 0.56; return g;
  })();
  P.head = (() => {
    const g = new THREE.Group();
    const dome = add(g, new THREE.IcosahedronGeometry(0.2, 1), M.helmet()); dome.scale.set(1.08, 1, 0.94);
    add(g, ext([[0.08, -0.02], [0.2, -0.04], [0.235, -0.13], [0.15, -0.19], [0.06, -0.15]], 0.19, 0.02), M.helmet(), 0, 0, 0);       // chin bar
    for (const yy of [-0.08, -0.115, -0.15]) add(g, new THREE.BoxGeometry(0.02, 0.014, 0.1), M.visor(), 0.2 - (yy + 0.08) * 0.1, yy, 0, false);   // chin vents
    add(g, ext([[0.1, 0.0], [0.215, 0.0], [0.235, 0.08], [0.13, 0.115]], 0.2, 0.015), M.visor(), 0, 0, 0, false);                    // goggles
    add(g, new THREE.TorusGeometry(0.19, 0.016, 4, 14).rotateX(Math.PI / 2).scale(1.1, 1, 0.96), M.rubber(), 0, 0.05, 0, false);      // goggle strap
    add(g, ext([[0.05, 0.17], [0.27, 0.12], [0.3, 0.15], [0.1, 0.22]], 0.2, 0.012), M.suit(), 0, 0, 0, false);                       // peak
    add(g, new THREE.TorusGeometry(0.2, 0.014, 4, 12, Math.PI * 0.9).rotateZ(Math.PI * 0.05), M.suit(), 0, 0, 0, false);               // stripe over the dome
    for (const sz of [-1, 1]) { add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8).rotateX(Math.PI / 2), M.rubber(), -0.02, -0.02, 0.19 * sz, false); add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 5).rotateX(Math.PI / 2), M.steel(), 0.19, 0.13, 0.07 * sz, false); }   // ear pads, peak screws
    add(g, new THREE.CylinderGeometry(0.075, 0.09, 0.14, 7), M.skin(), -0.03, -0.2, 0, false);                                        // neck
    group.add(g); return g;
  })();
  const arm = () => [limb(group, M.suit(), 0.36, 0.068, 0.054, sleeveStripes), limb(group, M.suit(), 0.36, 0.054, 0.045, elbowPad, gloveTip)];
  const leg = () => [limb(group, M.pants(), 0.42, 0.09, 0.066, kneeGear), limb(group, M.pants(), 0.42, 0.066, 0.052, bootTip)];
  [P.uArmN, P.fArmN] = arm(); [P.uArmF, P.fArmF] = arm();
  [P.uLegN, P.fLegN] = leg(); [P.uLegF, P.fLegF] = leg();
  for (const o of Object.values(P)) bake(o);
  return { group, parts: P, zs: { N: 0.17, F: -0.17 } };
}

/**
 * Pose the rider on the bike. `lean` is the torso's forward tilt in radians (0 upright), `crouch` (0..1) sinks the hips for a jump charge,
 * `trick` (0..1) with `kind` 'hands' (no-hander) or 'super' (superman) shows an in-air trick.
 */
export function poseRider(rider, lean = 0.7, crouch = 0, trick = 0, kind = '') {
  const P = rider.parts, [hx0, hy0] = BIKE.hip;
  let [gx, gy] = BIKE.hands, [fx, fy] = BIKE.feet;
  let hx = hx0 - 0.05 * crouch, hy = hy0 - 0.2 * crouch;     // crouching: hips sink and slide back, the torso folds forward
  lean += 0.4 * crouch;
  if (trick > 0 && kind === 'hands') { gx += 0.2 * trick; gy += 0.95 * trick; lean -= 0.35 * trick; }                       // both hands up off the bars
  else if (trick > 0 && kind === 'super') { hx -= 0.45 * trick; hy += 0.05 * trick; lean += 0.75 * trick; fx -= 1.0 * trick; fy += 0.62 * trick; }   // body flat out over the back, legs stretched behind
  let nx = fx, ny = fy, ffx = fx, ffy = fy;                      // where each foot goes (near leg, far leg)
  if (trick > 0) {
    const to = (px, py) => [fx + (px - fx) * trick, fy + (py - fy) * trick];
    if (kind === 'cancan') { [nx, ny] = to(0.3, 1.0); [ffx, ffy] = [nx, ny]; lean -= 0.15 * trick; }                  // both legs swung up over the tank
    else if (kind === 'nacnac') { [ffx, ffy] = to(-0.85, 0.82); lean += 0.1 * trick; }                                  // one leg kicked out behind
    else if (kind === 'heel') { [nx, ny] = to(-0.55, 1.14); [ffx, ffy] = [nx, ny]; lean += 0.3 * trick; }              // both heels kicked up behind
    else if (kind === 'cliff') { [nx, ny] = to(0.56, 1.2); [ffx, ffy] = [nx, ny]; lean -= 0.5 * trick; hx -= 0.1 * trick; }   // feet up on the bars, leaning back
    else if (kind === 'super') { nx = ffx = fx; ny = ffy = fy; }
  }
  const L = P.torso.userData.len;
  P.torso.position.set(hx, hy, 0); P.torso.rotation.z = -lean;
  const sx = hx + Math.sin(lean) * L, sy = hy + Math.cos(lean) * L;
  P.head.position.set(sx + Math.sin(lean) * 0.22, sy + Math.cos(lean) * 0.22, 0); P.head.rotation.z = -lean * 0.5;
  for (const k of ['N', 'F']) {
    const z = rider.zs[k];
    const a = ik(sx, sy, gx, gy, 0.36, 0.36, false);
    aim(P['uArm' + k], sx, sy, a.mid[0], a.mid[1], z * 1.1); aim(P['fArm' + k], a.mid[0], a.mid[1], a.end[0], a.end[1], z * 1.1);
    const tx = k === 'F' ? ffx : nx, ty = k === 'F' ? ffy : ny;
    const l = ik(hx, hy, tx, ty, 0.42, 0.42, kind !== 'super' || trick < 0.3);
    aim(P['uLeg' + k], hx, hy, l.mid[0], l.mid[1], z * 0.8); aim(P['fLeg' + k], l.mid[0], l.mid[1], l.end[0], l.end[1], z * 0.8);
  }
}

export function buildBike() {
  const root = new THREE.Group();                 // origin on the axle line
  const model = new THREE.Group(); model.position.y = -BIKE.wheelR; root.add(model);
  const R = BIKE.wheelR;
  const rear = wheel(); rear.position.set(BIKE.rearX, R, 0); model.add(rear);
  const front = wheel(); front.position.set(BIKE.frontX, R, 0); model.add(front);
  const both = (fn) => { fn(1); fn(-1); };

  // frame: tubes either side of the engine
  both((s) => {
    const z = 0.1 * s;
    tube(model, M.frame(), [[0.45, 1.1, z], [0.2, 1.03, z], [-0.02, 0.9, z], [-0.1, 0.62, z]], 0.032);                    // main spar
    tube(model, M.frame(), [[0.43, 1.05, z], [0.34, 0.72, z], [0.15, 0.47, z], [-0.1, 0.46, z]], 0.03);                   // down tube
    tube(model, M.frame(), [[-0.03, 0.93, z], [-0.4, 0.98, z], [-0.74, 1.0, z]], 0.026);                                   // subframe
    rod(model, M.frame(), [-0.12, 0.52, 0.12 * s], [BIKE.rearX, R, 0.12 * s], 0.036, 0.028);                              // swingarm
    rod(model, M.steel(), [-0.2, 0.96, 0.1 * s], [-0.16, 0.56, 0.1 * s], 0.032, 0.03);                                    // rear shock...
    rod(model, M.fork(), [-0.19, 0.9, 0.1 * s], [-0.17, 0.66, 0.1 * s], 0.05, 0.05, 7);                                   // ...and its spring
    rod(model, M.steel(), [-0.02, 0.38, 0.17 * s], [0.04, 0.38, 0.22 * s], 0.025, 0.025, 5);                              // footpeg
  });
  // engine: crankcase, cylinder and head
  add(model, new THREE.CylinderGeometry(0.15, 0.15, 0.26, 8).rotateX(Math.PI / 2), M.metal(), -0.02, 0.5, 0);
  add(model, new THREE.CylinderGeometry(0.1, 0.12, 0.26, 7).rotateX(Math.PI / 2), M.steel(), 0.0, 0.5, 0);
  rod(model, M.steel(), [0.04, 0.58, 0], [0.16, 0.86, 0], 0.115, 0.1, 7);                                                   // cylinder, leaning forward
  add(model, new THREE.IcosahedronGeometry(0.12, 0), M.frame(), 0.17, 0.9, 0);                                              // head
  // bodywork: tank, shrouds, seat, tail and fenders as shaped, bevelled profiles
  add(model, ext([[-0.14, 0.99], [0.02, 1.13], [0.3, 1.22], [0.52, 1.17], [0.58, 1.05], [0.34, 0.97]], 0.3, 0.04), M.body());             // fuel tank
  both((s) => add(model, ext([[0.1, 0.72], [0.34, 0.8], [0.54, 0.98], [0.52, 1.14], [0.28, 1.1], [0.08, 0.92]], 0.05, 0.02), M.plastic(), 0, 0, 0.17 * s));   // radiator shrouds
  add(model, ext([[-0.72, 1.0], [-0.42, 1.06], [-0.04, 1.06], [0.16, 1.01], [0.12, 0.94], [-0.62, 0.93]], 0.26, 0.03), M.seat());        // seat
  add(model, ext([[-0.5, 1.0], [-0.8, 1.06], [-1.0, 1.18], [-0.98, 1.21], [-0.74, 1.14], [-0.4, 1.08]], 0.2, 0.025), M.body());         // tail
  both((s) => add(model, ext([[-0.72, 1.02], [-0.34, 1.05], [-0.28, 0.9], [-0.62, 0.9]], 0.03, 0.01), M.plastic(), 0, 0, 0.14 * s));    // side number plates
  // front end: forks, clamp, bars, number plate and fender
  both((s) => {
    const z = 0.11 * s;
    rod(model, M.fork(), [0.5, 1.22, z], [0.6, 0.82, z], 0.045, 0.04, 7);
    rod(model, M.frame(), [0.6, 0.84, z], [BIKE.frontX, R, z], 0.034, 0.028, 6);
  });
  add(model, ext([[0.44, 1.12], [0.58, 1.14], [0.6, 1.2], [0.46, 1.22]], 0.3, 0.02), M.steel());                             // triple clamp
  tube(model, M.frame(), [[0.5, 1.26, -0.32], [0.52, 1.29, -0.13], [0.5, 1.29, 0.13], [0.5, 1.26, 0.32]], 0.022, 10, 5);      // handlebars
  both((s) => add(model, new THREE.CylinderGeometry(0.034, 0.034, 0.12, 6).rotateX(Math.PI / 2), M.glove(), 0.5, 1.26, 0.34 * s, false));   // grips
  add(model, ext([[0.54, 1.2], [0.68, 1.22], [0.72, 1.02], [0.62, 0.97], [0.55, 1.02]], 0.09, 0.025), M.plastic());          // front number plate
  const fen = []; const fr = R + 0.1;
  for (let a = 160; a >= 25; a -= 15) fen.push([BIKE.frontX + Math.cos((a * Math.PI) / 180) * (fr + 0.05), R + Math.sin((a * Math.PI) / 180) * (fr + 0.05)]);
  for (let a = 25; a <= 160; a += 15) fen.push([BIKE.frontX + Math.cos((a * Math.PI) / 180) * fr, R + Math.sin((a * Math.PI) / 180) * fr]);
  add(model, ext(fen, 0.2, 0.012), M.body());                                                                                // front fender
  // exhaust: a pipe sweeping back from the cylinder to a tapered silencer
  tube(model, M.metal(), [[0.2, 0.74, -0.15], [0.26, 0.55, -0.2], [0.02, 0.44, -0.22], [-0.32, 0.6, -0.22], [-0.52, 0.76, -0.22]], 0.04, 16, 6);
  rod(model, M.steel(), [-0.5, 0.75, -0.22], [-0.98, 1.0, -0.22], 0.075, 0.055, 7);
  add(model, new THREE.CylinderGeometry(0.058, 0.058, 0.02, 7).rotateZ(Math.PI / 2 + 0.45), M.frame(), -0.985, 1.005, -0.22, false);
  // brake discs and chain sprocket
  add(model, new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10).rotateX(Math.PI / 2), M.steel(), BIKE.frontX, R, 0.1, false);
  add(model, new THREE.CylinderGeometry(0.13, 0.13, 0.02, 10).rotateX(Math.PI / 2), M.steel(), BIKE.rearX, R, -0.1, false);
  add(model, new THREE.CylinderGeometry(0.095, 0.095, 0.02, 8).rotateX(Math.PI / 2), M.steel(), BIKE.rearX, R, 0.1, false);

  // ---- finer detail ----
  add(model, ext([[0.0, 1.03], [0.32, 1.12], [0.52, 1.1], [0.5, 1.06], [0.3, 1.08], [0.02, 1.0]], 0.312, 0.01), M.suit(), 0, 0, 0, false);       // tank stripe
  add(model, ext([[-0.6, 1.052], [0.05, 1.065], [0.05, 1.075], [-0.6, 1.062]], 0.07, 0.008), M.stripe(), 0, 0, 0, false);                       // seat stripe
  add(model, ext([[-0.42, 0.95], [-0.14, 0.95], [-0.12, 0.7], [-0.4, 0.68]], 0.2, 0.02), M.frame());                                          // air box
  add(model, ext([[-0.22, 0.33], [0.3, 0.33], [0.36, 0.4], [-0.16, 0.41]], 0.24, 0.02), M.steel());                                           // skid plate
  both((s) => {
    const z = 0.11 * s;
    for (let k = 0; k < 5; k++) { const t = k / 4; rod(model, M.rubber(), [0.55 + 0.0 * t, 1.1 - t * 0.2, z], [0.56, 1.1 - t * 0.2 - 0.03, z], 0.058, 0.058, 8, false); }   // fork gaiters
    tube(model, M.rubber(), [[0.5, 1.29, 0.36 * s], [0.6, 1.34, 0.37 * s], [0.64, 1.28, 0.36 * s]], 0.012, 8, 4);                          // hand guards
    rod(model, M.steel(), [0.5, 1.27, 0.3 * s], [0.62, 1.25, 0.31 * s], 0.011, 0.008, 4);                                                    // brake / clutch levers
  });
  tube(model, M.rubber(), [[0.5, 1.27, 0.06], [0.42, 1.2, 0.05], [0.28, 1.0, 0.04], [0.12, 0.9, 0.03]], 0.009, 10, 4);                         // control cables
  tube(model, M.rubber(), [[0.5, 1.27, -0.06], [0.4, 1.18, -0.05], [0.24, 0.98, -0.04], [0.06, 0.74, -0.03]], 0.009, 10, 4);
  tube(model, M.rubber(), [[0.32, 0.9, -0.14], [0.2, 0.74, -0.1], [0.08, 0.66, -0.06]], 0.016, 8, 5);                                         // radiator hose
  add(model, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8).rotateX(Math.PI / 2), M.steel(), -0.1, 0.45, 0.13, false);                         // front sprocket
  rod(model, M.rubber(), [-0.1, 0.5, 0.115], [BIKE.rearX + 0.02, R + 0.1, 0.115], 0.012, 0.012, 4);                                            // chain, top run...
  rod(model, M.rubber(), [-0.1, 0.4, 0.115], [BIKE.rearX + 0.02, R - 0.1, 0.115], 0.012, 0.012, 4);                                            // ...and bottom run
  rod(model, M.steel(), [-0.04, 0.47, 0.14], [0.1, 0.44, 0.22], 0.012, 0.01, 4);                                                               // gear lever
  const rf = []; const rr = R + 0.1;
  for (let a = 130; a >= 55; a -= 15) rf.push([BIKE.rearX + Math.cos((a * Math.PI) / 180) * (rr + 0.04), R + Math.sin((a * Math.PI) / 180) * (rr + 0.04)]);
  for (let a = 55; a <= 130; a += 15) rf.push([BIKE.rearX + Math.cos((a * Math.PI) / 180) * rr, R + Math.sin((a * Math.PI) / 180) * rr]);
  add(model, ext(rf, 0.18, 0.012), M.body());                                                                                                   // rear mud guard
  add(model, ext([[-0.98, 1.2], [-1.05, 1.12], [-1.01, 0.98], [-0.94, 1.08]], 0.13, 0.015), M.rubber());                                      // mud flap
  add(model, ext([[-0.99, 1.17], [-1.045, 1.165], [-1.045, 1.12], [-0.99, 1.125]], 0.1, 0.008), M.light(), 0, 0, 0, false);                   // tail light
  add(model, ext([[0.62, 0.34], [0.76, 0.34], [0.76, 0.5], [0.62, 0.5]], 0.05, 0.012), M.steel(), 0, 0, 0.1, false);                            // brake caliper
  rod(model, M.steel(), [0.0, 0.47, -0.235], [-0.3, 0.6, -0.235], 0.056, 0.054, 5, false);                                                     // exhaust heat shield
  // numbers on the plates
  decal(model, '7', 0.17, 0.25, 0.625, 1.09, 0.0505, -0.2); decal(model, '7', 0.17, 0.25, 0.625, 1.09, -0.0505, -0.2, true);
  decal(model, '7', 0.2, 0.28, -0.5, 0.98, 0.1505, 0); decal(model, '7', 0.2, 0.28, -0.5, 0.98, -0.1505, 0, true);
  bake(model, [rear, front]);                                                                                                                 // one mesh per material instead of hundreds of little ones

  const rider = buildRider(); rider.group.scale.setScalar(1.12); model.add(rider.group); poseRider(rider, 0.7);
  root.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = true; });
  return { root, model, wheels: { rear, front }, rider };
}
