// The pinball table made from a hole (shared by the game, pinball.js, and the tester, tools/golf/pbsim.mjs): the open drain behind the tee, the guide rails and the two flippers.
export const TILT_PUTT1 = 4.6, TILT_PIN = 4.6, TAU_PUTT1 = 7, TAU_PIN = 9, FLIP_LEN = 1.25, FLIP_RAD = 0.17, FLIP_SPEED = 17;

/** Turn `hole` into a table: the hole's tee end faces the player. Changes hole.walls and sets hole.tiltDir. Returns { ux, uz, nx, nz, tee, L(u, lat), flips, guides }. */
export function prepareTable(hole) {
  const P = hole.path, t0 = P[0], t1 = P[Math.min(4, P.length - 1)], l = Math.hypot(t1.x - t0.x, t1.z - t0.z) || 1, ux = (t1.x - t0.x) / l, uz = (t1.z - t0.z) / l, nx = -uz, nz = ux;
  const L = (u, lat) => ({ x: t0.x + ux * u + nx * lat, z: t0.z + uz * u + nz * lat });
  const tip = L(-2.9, 0);                                          // the drain: the back of the tee green is opened between the flippers
  hole.walls = hole.walls.filter((w) => w[4] !== 1 || Math.hypot((w[0] + w[2]) / 2 - tip.x, (w[1] + w[3]) / 2 - tip.z) > 1.25);
  const flips = [], guides = [], ang = (phi) => Math.atan2(uz * Math.cos(phi) + nz * Math.sin(phi), ux * Math.cos(phi) + nx * Math.sin(phi));       // a direction in the (u, n) frame as an angle in the hole's x, z
  for (const side of [1, -1]) {
    const pv = L(-1.35, side * 1.78), a = L(-0.2, side * 2.7), b = L(-1.2, side * 1.95);
    hole.walls.push([a.x, a.z, b.x, b.z, 0, 0]); guides.push([a, b]);
    const rest = side > 0 ? -Math.PI / 2 - 0.45 : Math.PI / 2 + 0.45, up = side > 0 ? -Math.PI / 2 + 0.6 : Math.PI / 2 - 0.6;
    flips.push({ side, px: pv.x, pz: pv.z, len: FLIP_LEN, rad: FLIP_RAD, restA: ang(rest), upA: ang(up), a: ang(rest), w: 0 });
  }
  addBumpers(hole);
  hole.tiltDir = { x: -ux, z: -uz };
  return { ux, uz, nx, nz, tee: t0, L, flips, guides };
}
/** Swing the flippers towards up (`held`) or rest for `h` seconds. */
export function stepFlips(flips, held, h) {
  for (const f of flips) {
    const target = held ? f.upA : f.restA, d0 = target - f.a, d = Math.atan2(Math.sin(d0), Math.cos(d0)), mv = Math.max(-FLIP_SPEED * h, Math.min(FLIP_SPEED * h, d)); f.a += mv; f.w = mv / h;
  }
}
/** Has the ball gone down the drain? */
export function isDrained(fr, b) {
  const u = (b.x - fr.tee.x) * fr.ux + (b.z - fr.tee.z) * fr.uz, lat = (b.x - fr.tee.x) * fr.nx + (b.z - fr.tee.z) * fr.nz; return u < -2.35 && Math.abs(lat) < 1.4;
}

/** Pinball bumpers along the corridor, staggered either side of the middle (clear of the tee end, the cup and whatever the hole already has), so there is always a gap wider than the ball. */
function addBumpers(hole) {
  const P = hole.path, hero = hole.hero, cup = hole.cup, tee = hole.tee, R = 0.5, out = [];
  const taken = [...hole.posts, ...hole.bumpers, ...hole.ponds.map((q) => ({ x: q.x, z: q.z, r: q.r + 0.6 })), ...(hero ? [{ x: hero.x, z: hero.z, r: 3.2 }] : [])];
  let acc = 0, side = 1;
  for (let i = 1; i < P.length - 1; i++) {
    acc += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); if (acc < 2.7) continue;
    const a = P[i - 1], b = P[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l, off = Math.min(1.05, hole.widths[i] - R - 0.95) * side;
    const x = P[i].x + nx * off, z = P[i].z + nz * off;
    if (Math.hypot(x - tee.x, z - tee.z) < 5.5 || Math.hypot(x - cup.x, z - cup.z) < 3.4 || taken.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + R + 1.2)) continue;
    out.push({ x, z, r: R }); taken.push({ x, z, r: R }); acc = 0; side = -side;
  }
  hole.bumpers.push(...out);
}
