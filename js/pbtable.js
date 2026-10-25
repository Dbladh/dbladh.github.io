// The pinball table (shared by the game, pinball.js, and the tester, tools/golf/pbsim.mjs): a rectangular playfield with a round top, the funnel and two flippers, the drain, slingshots, pop bumpers and the cup.
export const TILT_PUTT1 = 3.4, TILT_PIN = 4.6, TAU_PUTT1 = 7, TAU_PIN = 9, FLIP_LEN = 1.25, FLIP_RAD = 0.17, FLIP_SPEED = 17;

// The table, in the hole's own x, z (x runs up the table, z across; the player sees it from the bottom, x = -15, the round top at x = 15).
export const TABLE = { x0: -15, x1: 15, W: 7, arcX: 8, tee: { x: -4.5, z: 0 }, cup: { x: 12.6, z: 0 }, pivX: -12.0, pivZ: 1.78 };
const tableHalf = (x) => (x > TABLE.arcX ? Math.sqrt(Math.max(0, TABLE.W * TABLE.W - (x - TABLE.arcX) * (x - TABLE.arcX))) : x > -9.4 ? TABLE.W : x > -11.85 ? 1.71 + (x + 11.85) * (5.29 / 2.45) : 1.85);

/** Turn `hole` (any generated hole, used only for its seed and defaults) into a pinball playfield: a rectangle with a round top, a funnel down to two flippers and a drain, two slingshots, pop bumpers and the cup at the top. Sets hole.tiltDir. Returns { ux, uz, nx, nz, tee, L(u, lat), flips, rails, tris, bottom }. */
export function prepareTable(hole) {
  const { x0, x1, W, arcX } = TABLE, funnel = {}, walls = [], rails = [], seg = (a, b) => { walls.push([a[0], a[1], b[0], b[1], 0, 0]); rails.push([{ x: a[0], z: a[1] }, { x: b[0], z: b[1] }]); };
  const T = (x, z) => [x, z], poly = [];
  const FR = -Math.PI / 2 - 0.45;                                                  // (the flipper at rest points down and in: its direction on the +z side is (dx, dz); the funnel wall is that line moved up by the flipper's radius and run back to the side wall)
  for (const s of [-1, 1]) {
    const d = [Math.cos(FR), s * Math.sin(FR)], n = [-d[1] * s, d[0] * s], ex = TABLE.pivX + n[0] * FLIP_RAD, ez = s * TABLE.pivZ + n[1] * FLIP_RAD, t = (W - Math.abs(ez)) / Math.abs(d[1]);
    const sideX = ex - d[0] * t, ox = TABLE.pivX - n[0] * FLIP_RAD, oz = s * TABLE.pivZ - n[1] * FLIP_RAD;
    seg(T(arcX, s * W), T(sideX, s * W)); seg(T(sideX, s * W), T(ex, ez)); seg(T(ox, oz), T(-14.8, oz)); funnel[s] = { sideX, ex, ez, oz };
  }
  seg(T(-14.8, -funnel[1].oz), T(-14.8, funnel[1].oz));
  const ARC = 16; let prev = T(arcX, -W);                              // the round top
  for (let k = 1; k <= ARC; k++) { const t = (k / ARC - 0.5) * Math.PI, q = T(arcX + Math.cos(t) * W, Math.sin(t) * W); seg(prev, q); prev = q; }
  const tris = [];                                                     // the slingshots: a triangle above each funnel, its long side facing the middle
  for (const s of [-1, 1]) { const tr = [T(-5.0, s * 5.6), T(-9.0, s * 5.6), T(-9.0, s * 3.0)]; tris.push(tr); for (let k = 0; k < 3; k++) seg(tr[k], tr[(k + 1) % 3]); }
  const ribbon = [], shape = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) { const w = tableHalf(x); ribbon.push([x, w, x, -w, x - x0]); }
  for (let x = x0; x <= x1 + 1e-6; x += 2.5) for (let z = -6.9; z <= 6.9; z += 2.3) if (Math.abs(z) <= tableHalf(x) + 0.4) shape.push([x, z, 2.4]);
  for (let x = x0; x <= x1; x += 1) poly.push([x, tableHalf(x)]); for (let x = x1; x >= x0; x -= 1) poly.push([x, -tableHalf(x)]);
  const path = []; for (let x = -13; x <= 13; x += 1) path.push({ x, z: 0 });
  const bumpers = [], P = [[-0.5, 3.4], [4.5, 4.6], [8.5, 3.0]]; for (const [x, z] of P) for (const s of [-1, 1]) bumpers.push({ x, z: z * s, r: 0.7 });
  Object.assign(hole, { walls, bumpers, posts: [], ponds: [], rivers: [], sands: [], pads: [], boosts: [], rails: [], barriers: [], doors: [], cage: null, feats: [], recipes: [], hills: [], pickups: [], hero: null, path, widths: path.map(() => 3), ribbon, shape, outline: poly,
    tee: { ...TABLE.tee }, ball: { ...TABLE.tee }, cup: { ...TABLE.cup }, bounds: { cx: 0, cz: 0, hx: 15, hz: 7 }, par: 3 });
  const tee = { x: TABLE.pivX + 1.35, z: 0 }, L = (u, lat) => ({ x: tee.x + u, z: lat });         // (u = 0 at the line the flippers' tips reach, as the flipper bot and the drain test expect)
  const flips = [], ang = (phi) => phi;
  for (const side of [1, -1]) {
    const rest = side > 0 ? -Math.PI / 2 - 0.45 : Math.PI / 2 + 0.45, up = side > 0 ? -Math.PI / 2 + 0.6 : Math.PI / 2 - 0.6;
    flips.push({ side, px: TABLE.pivX, pz: side * TABLE.pivZ, len: FLIP_LEN, rad: FLIP_RAD, restA: ang(rest), upA: ang(up), a: ang(rest), w: 0 });
  }
  hole.tiltDir = { x: -1, z: 0 };
  return { ux: 1, uz: 0, nx: 0, nz: 1, tee, L, flips, rails, tris, bottom: { x: x0, z: 0 } };
}
/** Swing the flippers towards up (`held`) or rest for `h` seconds. */
export function stepFlips(flips, held, h) {
  for (const f of flips) {
    const target = held ? f.upA : f.restA, d0 = target - f.a, d = Math.atan2(Math.sin(d0), Math.cos(d0)), mv = Math.max(-FLIP_SPEED * h, Math.min(FLIP_SPEED * h, d)); f.a += mv; f.w = mv / h;
  }
}
/** Has the ball gone down the drain? */
export function isDrained(fr, b) {
  const u = (b.x - fr.tee.x) * fr.ux + (b.z - fr.tee.z) * fr.uz, lat = (b.x - fr.tee.x) * fr.nx + (b.z - fr.tee.z) * fr.nz; return u < -2.35 && Math.abs(lat) < 1.9;
}
