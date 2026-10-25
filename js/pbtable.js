// The pinball table (shared by the game, pinball.js, and the tester, tools/golf/pbsim.mjs): a rectangular playfield with a round top, the funnel and two flippers, the drain, slingshots, pop bumpers and the cup.
export const TILT_PIN = 3.8, TAU_PIN = 26, PIN_RAMP = 3.2, FLIP_LEN = 1.25, FLIP_RAD = 0.17, FLIP_SPEED = 17, SLING_KICK = 5.5, PLAT_H = 1.1, LANE = 1.75, RAMP_X0 = 1.6, DECK_W = 3.4;

// The table, in the hole's own x, z (x runs up the table, z across; the player sees it from the bottom, x = -15, the round top at x = 15).
export const TABLE = { x0: -15, x1: 15, W: 7, arcX: 8, tee: { x: -4.5, z: 0 }, cup: { x: 11.8, z: 0 }, pivX: -12.0, pivZ: 1.78 };
const tableHalf = (x) => (x > TABLE.arcX ? Math.sqrt(Math.max(0, TABLE.W * TABLE.W - (x - TABLE.arcX) * (x - TABLE.arcX))) : x > -9.4 ? TABLE.W : x > -11.85 ? 1.71 + (x + 11.85) * (5.29 / 2.45) : 1.85);

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
  return true;
}

/** Turn `hole` (any generated hole, used only for its seed and defaults) into a pinball playfield: a rectangle with a round top, a funnel down to two flippers and a drain, two slingshots, pop bumpers and the cup at the top. Sets hole.tiltDir. Returns { ux, uz, nx, nz, tee, L(u, lat), flips, rails, tris, bottom }. */
export function prepareTable(hole) {
  const { x0, x1, W, arcX } = TABLE, funnel = {}, walls = [], rails = [], seg = (a, b, kick = 0) => { walls.push(kick ? [a[0], a[1], b[0], b[1], 0, 0, 0, 0, kick] : [a[0], a[1], b[0], b[1], 0, 0]); rails.push([{ x: a[0], z: a[1] }, { x: b[0], z: b[1] }]); };
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
  for (const s of [-1, 1]) { const tr = [T(-5.0, s * 5.6), T(-9.0, s * 5.6), T(-9.0, s * 3.0)]; tris.push(tr); for (let k = 0; k < 3; k++) seg(tr[k], tr[(k + 1) % 3], k === 2 ? SLING_KICK : 0); }
  const ribbon = [], shape = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) { const w = tableHalf(x); ribbon.push([x, w, x, -w, x - x0]); }
  for (let x = x0; x <= x1 + 1e-6; x += 2.5) for (let z = -6.9; z <= 6.9; z += 2.3) if (Math.abs(z) <= tableHalf(x) + 0.4) shape.push([x, z, 2.4]);
  for (let x = x0; x <= x1; x += 1) poly.push([x, tableHalf(x)]); for (let x = x1; x >= x0; x -= 1) poly.push([x, -tableHalf(x)]);
  const path = []; for (let x = -13; x <= 13; x += 1) path.push({ x, z: 0 });
  // the ramps: a straight lane up the middle and two winding ones up the sides all climb to a raised deck at the top, where the cup is. Where lanes meet, their rails open into each other.
  for (const sd of [-1, 1]) seg(T(0.4, sd * 2.6), T(RAMP_X0, sd * LANE));                                  // (the flared mouth of the middle lane)
  const lanes = [mkLane([[RAMP_X0, 0], [8.5, 0]], LANE, PLAT_H, 0, 5.4), mkLane([[7.0, 0], [13.8, 0]], DECK_W, PLAT_H, -1, 0.1)];
  for (const sd of [-1, 1]) lanes.push(mkLane([[2.2, 5.6 * sd], [4.2, 4.6 * sd], [6.2, 5.6 * sd], [8.2, 4.8 * sd], [9.8, 3.7 * sd], [11.0, 2.3 * sd]], 1.3, PLAT_H, 0, 7.0));
  lanes.forEach((L, i) => laneRails(i, L, i === 1 ? 'both' : ''));
  function laneRails(i, L, caps) {
    const P = L.pts, n = P.length, left = [], right = [];
    for (let k = 0; k < n; k++) { const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; left.push([P[k][0] + nx * L.w, P[k][1] + nz * L.w]); right.push([P[k][0] - nx * L.w, P[k][1] - nz * L.w]); }
    const piece = (a, b) => { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (!lanes.some((O, j) => j !== i && insideLane(O, mx, mz, O.w - 0.15))) seg(a, b); };
    for (const side of [left, right]) for (let k = 0; k < n - 1; k++) piece(side[k], side[k + 1]);
    const cap = (a, b) => { const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4)); for (let q = 0; q < m; q++) piece([a[0] + ((b[0] - a[0]) * q) / m, a[1] + ((b[1] - a[1]) * q) / m], [a[0] + ((b[0] - a[0]) * (q + 1)) / m, a[1] + ((b[1] - a[1]) * (q + 1)) / m]); };
    if (caps) { cap(left[0], right[0]); cap(left[n - 1], right[n - 1]); }
  }
  const boosts = [{ x: 0.9, z: 0, ux: 1, uz: 0, len: 1.6, wid: 1.4 }];
  for (const sd of [-1, 1]) { const dx = 2.0, dz = -1.0 * sd, l = Math.hypot(dx, dz); boosts.push({ x: 3.0, z: 5.2 * sd, ux: dx / l, uz: dz / l, len: 1.6, wid: 1.0 }); }
  const bumpers = []; for (const [x, z] of [[-2.0, 3.9], [0.4, 4.1]]) for (const s of [-1, 1]) bumpers.push({ x, z: z * s, r: 0.7 });
  const elevated = [{ x: 9.4, z: 1.3, r: 0.4 }, { x: 9.4, z: -1.3, r: 0.4 }];                                // (two bumpers on the deck in front of the cup, a narrow gap between them: added to the physics, drawn by the game at deck height)
  const targets = [-2.5, 2.5].map((z) => ({ x: -0.6, z, r: 0.28 })), posts = [...targets];
  Object.assign(hole, { walls, bumpers, posts, targets, elevated, ponds: [], rivers: [], sands: [], pads: [], boosts, rails: [], barriers: [], doors: [], cage: null, feats: [], lanes, dense: true, cols: 64, recipes: [], hills: [], pickups: [], hero: null, path, widths: path.map(() => 3), ribbon, shape, outline: poly,
    tee: { ...TABLE.tee }, ball: { ...TABLE.tee }, cup: { ...TABLE.cup }, bounds: { cx: 0, cz: 0, hx: 15, hz: 7 }, par: 3 });
  const tee = { x: TABLE.pivX + 1.35, z: 0 }, L = (u, lat) => ({ x: tee.x + u, z: lat });         // (u = 0 at the line the flippers' tips reach, as the flipper bot and the drain test expect)
  const flips = [], ang = (phi) => phi;
  for (const side of [1, -1]) {
    const rest = side > 0 ? -Math.PI / 2 - 0.45 : Math.PI / 2 + 0.45, up = side > 0 ? -Math.PI / 2 + 0.6 : Math.PI / 2 - 0.6;
    flips.push({ side, px: TABLE.pivX, pz: side * TABLE.pivZ, len: FLIP_LEN, rad: FLIP_RAD, restA: ang(rest), upA: ang(up), a: ang(rest), w: 0 });
  }
  hole.tiltDir = { x: -1, z: 0 };
  hole.spots = [[-3.0, 1.2], [-3.0, -1.2], [-1.8, 0]].map(([x, z]) => ({ x, z })).filter((p) => clearShot(hole, p, hole.cup));                // (the putting holes: a ball that drops into one levels the table, and from there the cup is in clear sight)
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
