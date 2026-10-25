// The pinball table (shared by the game, pinball.js, and the tester, tools/golf/pbsim.mjs): a compact playfield with a round top. At the bottom two flippers, a drain and two slingshots; above them
// the tee (the skill shot is a golf putt), pop bumpers, a spinner, drop targets and two lock saucers; a straight ramp and two winding ramps climb to a raised deck with the cup, which stays covered
// until the table's three lamps are lit. Everything is in the hole's own x, z (x runs up the table, z across; the player sees it from the bottom).
export const TILT = 3.4, FLIP_LEN = 1.25, FLIP_RAD = 0.17, FLIP_SPEED = 17, SLING_KICK = 5.5, PLAT_H = 1.1, SPIN_NEED = 8, SAVE_TIME = 8;

export const TABLE = { x0: -10, x1: 10, W: 5.5, arcX: 4.5, tee: { x: -4.6, z: 0 }, cup: { x: 7.4, z: 0 }, pivX: -7.4, pivZ: 1.78, pocketX: -9.8 };
const FR = -Math.PI / 2 - 0.45;                                                  // (the flipper at rest points down and in; the funnel wall is that line moved up by the flipper's radius and run back to the side wall)
const FUN = (() => {
  const d = [Math.cos(FR), Math.sin(FR)], n = [-d[1], d[0]], ex = TABLE.pivX + n[0] * FLIP_RAD, ez = TABLE.pivZ + n[1] * FLIP_RAD, t = (TABLE.W - Math.abs(ez)) / Math.abs(d[1]);
  return { ex, ez, sideX: ex - d[0] * t, ox: TABLE.pivX - n[0] * FLIP_RAD, oz: TABLE.pivZ - n[1] * FLIP_RAD, k: Math.abs(d[0] / d[1]) };
})();
const tableHalf = (x) => (x > TABLE.arcX ? Math.sqrt(Math.max(0, TABLE.W * TABLE.W - (x - TABLE.arcX) * (x - TABLE.arcX))) : x > FUN.sideX ? TABLE.W : x > FUN.ex ? FUN.ez + (x - FUN.ex) / FUN.k : FUN.oz);

/** A lane: a smooth path (Catmull-Rom through `ctrl`) as samples [x, z, distance along] with its half-width w, the height H it climbs to by smoothstep from s0 over `ramp`, and a soft edge. Read by hillH in golfphys.js. */
function mkLane(ctrl, w, H, s0, ramp) {
  const C = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], pts = [];
  for (let i = 1; i < C.length - 2; i++) {
    const p0 = C[i - 1], p1 = C[i], p2 = C[i + 1], p3 = C[i + 2], n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.4));
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), 0]); }
  }
  pts.push([...ctrl[ctrl.length - 1], 0]); let acc = 0; for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); pts[i][2] = acc; }
  return { pts, w, H, s0, ramp, edge: 0.3, len: acc };
}
/** Is (x, z) alongside the lane (not past its ends) and nearer its centre line than `r`? */
function insideLane(L, x, z, r) {
  const P = L.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
    if (t < 0.03 || t > 0.97 + (i === P.length - 2 ? 0 : 0.03)) continue; const ex = x - (a[0] + dx * t), ez = z - (a[1] + dz * t); if (ex * ex + ez * ez < r * r) return true;
  }
  return false;
}
const BR = 0.32, segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9; let t = ((px - ax) * dx + (pz - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (ax + dx * t), pz - (az + dz * t)); };
const segsCross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
/** Can a ball roll in a straight line from `p` to `q` (a clear shot): nothing but open ground, with room for the ball all along? */
export function clearShot(hole, p, q, margin = 0.12) {
  const a = [p.x, p.z], b = [q.x, q.z], room = BR + margin;
  for (const w of hole.walls) { const c = [w[0], w[1]], d = [w[2], w[3]]; if (segsCross(a, b, c, d) || segDist(c[0], c[1], a[0], a[1], b[0], b[1]) < room || segDist(d[0], d[1], a[0], a[1], b[0], b[1]) < room || segDist(a[0], a[1], c[0], c[1], d[0], d[1]) < room) return false; }
  for (const o of [...hole.bumpers, ...hole.posts, ...(hole.elevated || [])]) if (segDist(o.x, o.z, a[0], a[1], b[0], b[1]) < o.r + room) return false;
  if (hole.spinner && segDist(hole.spinner.x, hole.spinner.z, a[0], a[1], b[0], b[1]) < hole.spinner.len + room) return false;
  return true;
}

/** Turn `hole` (any generated hole, used only for its seed and defaults) into the pinball table. Sets hole.tiltDir. Returns { ux, uz, nx, nz, tee, L(u, lat), flips, rails, tris, bottom }. */
export function prepareTable(hole) {
  const { x0, x1, W, arcX } = TABLE, walls = [], rails = [], seg = (a, b, kick = 0) => { walls.push(kick ? [a[0], a[1], b[0], b[1], 0, 0, 0, 0, kick] : [a[0], a[1], b[0], b[1], 0, 0]); rails.push([{ x: a[0], z: a[1] }, { x: b[0], z: b[1] }]); };
  const T = (x, z) => [x, z], poly = [];
  for (const s of [-1, 1]) { seg(T(arcX, s * W), T(FUN.sideX, s * W)); seg(T(FUN.sideX, s * W), T(FUN.ex, s * FUN.ez)); seg(T(FUN.ox, s * FUN.oz), T(TABLE.pocketX, s * FUN.oz)); }
  seg(T(TABLE.pocketX, -FUN.oz), T(TABLE.pocketX, FUN.oz));
  const ARC = 14; let prev = T(arcX, -W);                                          // the round top
  for (let k = 1; k <= ARC; k++) { const t = (k / ARC - 0.5) * Math.PI, q = T(arcX + Math.cos(t) * W, Math.sin(t) * W); seg(prev, q); prev = q; }
  const tris = [];                                                                 // the slingshots: a triangle above each funnel, its long side facing the middle
  for (const s of [-1, 1]) { const tr = [T(-2.6, s * 4.5), T(-5.0, s * 4.5), T(-5.0, s * 2.4)]; tris.push(tr); for (let k = 0; k < 3; k++) seg(tr[k], tr[(k + 1) % 3], k === 2 ? SLING_KICK : 0); }
  const ribbon = [], shape = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) { const w = tableHalf(x); ribbon.push([x, w, x, -w, x - x0]); }
  for (let x = x0; x <= x1 + 1e-6; x += 2.5) for (let z = -5.2; z <= 5.2; z += 2.2) if (Math.abs(z) <= tableHalf(x) + 0.4) shape.push([x, z, 2.4]);
  for (let x = x0; x <= x1; x += 1) poly.push([x, tableHalf(x)]); for (let x = x1; x >= x0; x -= 1) poly.push([x, -tableHalf(x)]);
  const path = []; for (let x = -8; x <= 8; x += 1) path.push({ x, z: 0 });
  // the ramps: a straight one up the middle and two winding ones up the sides all climb to a raised deck at the top, where the cup is. Where lanes meet, their rails open into each other.
  const lanes = [mkLane([[2.6, 0], [6.4, 0]], 1.5, PLAT_H, 0, 3.4), mkLane([[5.8, 0], [9.0, 0]], 2.9, PLAT_H, -1, 0.1)];
  for (const sd of [-1, 1]) lanes.push(mkLane([[1.6, 4.1 * sd], [3.0, 3.3 * sd], [4.4, 4.1 * sd], [5.6, 3.3 * sd], [6.6, 2.0 * sd]], 0.95, PLAT_H, 0, 5.2));
  lanes.forEach((L, i) => laneRails(i, L, i === 1 ? 'both' : ''));
  function laneRails(i, L, caps) {
    const P = L.pts, n = P.length, left = [], right = [];
    for (let k = 0; k < n; k++) { const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; left.push([P[k][0] + nx * L.w, P[k][1] + nz * L.w]); right.push([P[k][0] - nx * L.w, P[k][1] - nz * L.w]); }
    const piece = (a, b) => { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (!lanes.some((O, j) => j !== i && insideLane(O, mx, mz, O.w - 0.15))) seg(a, b); };
    for (const side of [left, right]) for (let k = 0; k < n - 1; k++) piece(side[k], side[k + 1]);
    const cap = (a, b) => { const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4)); for (let q = 0; q < m; q++) piece([a[0] + ((b[0] - a[0]) * q) / m, a[1] + ((b[1] - a[1]) * q) / m], [a[0] + ((b[0] - a[0]) * (q + 1)) / m, a[1] + ((b[1] - a[1]) * (q + 1)) / m]); };
    if (caps) { cap(left[0], right[0]); cap(left[n - 1], right[n - 1]); }
  }
  const boosts = [{ x: 1.9, z: 0, ux: 1, uz: 0, len: 1.2, wid: 1.2 }];
  const bumpers = [{ x: -0.8, z: 3.1, r: 0.6 }, { x: 0.8, z: 1.7, r: 0.55 }, { x: 0.8, z: -1.7, r: 0.55 }];
  const elevated = [{ x: 6.5, z: 2.0, r: 0.4 }, { x: 6.5, z: -2.0, r: 0.4 }];                                // (two bumpers on the deck in front of the cup, a narrow gap between them: added to the physics, drawn by the game at deck height)
  const targets = [-1.9, 1.9].map((z) => ({ x: -2.0, z, r: 0.28 })), posts = [...targets];
  const cover = { x: TABLE.cup.x, z: TABLE.cup.z, r: 0.55 };                                                    // (the plate over the cup: in the physics while the cup is closed)
  const spinner = { x: -0.8, z: -3.1, len: 0.85, rad: 0.1 };
  Object.assign(hole, { walls, bumpers, posts, targets, elevated, cover, spinner, ponds: [], rivers: [], sands: [], pads: [], boosts, rails: [], barriers: [], doors: [], cage: null, feats: [], lanes, dense: true, cols: 56, recipes: [], hills: [], pickups: [], hero: null, path, widths: path.map(() => 3), ribbon, shape, outline: poly,
    tee: { ...TABLE.tee }, ball: { ...TABLE.tee }, cup: { ...TABLE.cup }, bounds: { cx: 0, cz: 0, hx: 10, hz: 5.5 }, par: 3 });
  const tee = { x: TABLE.pivX + 1.35, z: 0 }, L = (u, lat) => ({ x: tee.x + u, z: lat });         // (u = 0 at the line the flippers' tips reach, as the flipper bot and the drain test expect)
  const flips = [];
  for (const side of [1, -1]) {
    const rest = side > 0 ? -Math.PI / 2 - 0.45 : Math.PI / 2 + 0.45, up = side > 0 ? -Math.PI / 2 + 0.6 : Math.PI / 2 - 0.6;
    flips.push({ side, px: TABLE.pivX, pz: side * TABLE.pivZ, len: FLIP_LEN, rad: FLIP_RAD, restA: rest, upA: up, a: rest, w: 0 });
  }
  hole.tiltDir = { x: -1, z: 0 };
  hole.saucers = [[-3.0, 1.0], [-3.0, -1.0]].map(([x, z]) => ({ x, z })).filter((p) => clearShot(hole, p, hole.cup));          // (lock saucers: a ball that drops in is held for an aimed putt; each has a clear shot to the cup)
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
