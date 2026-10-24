// The nine "hero" obstacles of the mini-golf, one per hole, as plain data (no THREE). golfgen.js picks one for each hole and places it on the hole's longest leg;
// golfphys.js makes it act on the ball. Everything is in the leg's own frame: (x, z) is the centre, u runs along the leg, n across it.
//
// Segments in a hero's `walls` are [ax, az, bx, bz, visible, ghostable]: visible 0 means the hero draws it itself; ghostable 1 means a "ghost" ball passes through it.

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const HERO_TYPES = ['windmill', 'alligator', 'turntable', 'pendulum', 'geyser', 'cannon', 'teleport', 'drawbridge', 'loop'];
/** The shortest leg each hero needs (in units). */
export const NEED = { windmill: 8, alligator: 8.5, turntable: 6.5, pendulum: 8, geyser: 6.5, cannon: 8, teleport: 9, drawbridge: 8.5, loop: 9.5 };
const TIERS = [['windmill', 'alligator', 'turntable'], ['pendulum', 'geyser', 'cannon'], ['teleport', 'drawbridge', 'loop']];   // easy, middling, tricky: holes 1-3, 4-6, 7-9

/** Which hero is on each of the nine holes this month: each tier is shuffled with the course seed. */
export function heroOrder(cs) {
  const out = [];
  for (let t = 0; t < 3; t++) {
    const a = TIERS[t].slice(), r = mulberry32((cs + Math.imul(t + 1, 977)) >>> 0);
    for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const x = a[i]; a[i] = a[j]; a[j] = x; }
    out.push(...a);
  }
  return out;
}

const rect = (f, a0, a1, c0, c1, out) => {              // a rectangle along the leg (a: along, c: across) as four wall segments
  const P = (a, c) => [f.x + f.ux * a + f.nx * c, f.z + f.uz * a + f.nz * c];
  const A = P(a0, c0), B = P(a1, c0), C = P(a1, c1), D = P(a0, c1);
  out.push([A[0], A[1], B[0], B[1], 0, 1], [B[0], B[1], C[0], C[1], 0, 1], [C[0], C[1], D[0], D[1], 0, 1], [D[0], D[1], A[0], A[1], 0, 1]);
};
const at = (f, a, c) => ({ x: f.x + f.ux * a + f.nx * c, z: f.z + f.uz * a + f.nz * c });
const q = (v) => Math.round(v * 2) / 2;

/**
 * Make the hero of type `type`. `f` is the leg frame { x, z, ux, uz, nx, nz, len, hw } (x, z = the leg's start; len = its length); `r` is the hole's seeded generator.
 * Returns the hero data plus `walls` (extra wall segments) and `c` (its centre).
 */
export function buildHero(type, f, r) {
  const mid = { ...f, x: f.x + f.ux * f.len / 2, z: f.z + f.uz * f.len / 2 }, walls = [], hw = f.hw;
  const hero = { type, x: mid.x, z: mid.z, ux: f.ux, uz: f.uz, nx: f.nx, nz: f.nz, hw, walls };
  if (type === 'windmill') {                              // sails sweep across a low opening
    Object.assign(hero, { gap: 1.0, half: 1.1, w: q(1.2 + r() * 1.2) * 0.5 + 0.7, phase: r() * 1.5 });
    for (const s of [-1, 1]) rect(mid, -hero.half, hero.half, hero.gap * s, (hw + 0.3) * s, walls);
    hero.gate = gateSeg(mid, -(hero.half + 0.1), hero.gap);
  } else if (type === 'alligator') {                      // a gator whose jaws open and shut across the lane
    Object.assign(hero, { gap: 1.0, half: 1.6, period: q(3 + r() * 1.5) , phase: r(), closed: 0.45 });
    for (const s of [-1, 1]) rect(mid, -hero.half, hero.half, hero.gap * s, (hw + 0.3) * s, walls);
    hero.gate = gateSeg(mid, -(hero.half + 0.1), hero.gap);
  } else if (type === 'turntable') {                      // a spinning disc that swirls the ball round
    Object.assign(hero, { r: 1.9, omega: (r() < 0.5 ? 1 : -1) * (1.3 + r() * 0.5) });
  } else if (type === 'pendulum') {                       // two hammers swinging across the lane
    Object.assign(hero, { A: hw - 0.78, w: 1.7 + r() * 0.5, rad: 0.55, hammers: [{ du: -1.7, ph: r() * 3 }, { du: 1.7, ph: 3.1 + r() * 3 }] });
  } else if (type === 'geyser') {                         // a vent that erupts now and then and throws the ball out
    Object.assign(hero, { r: 1.25, period: 3.6 + r() * 1.2, phase: r() * 3, push: 9 });
  } else if (type === 'cannon') {                         // a cannon that swallows the ball and fires it on down the lane
    Object.assign(hero, { r: 0.75, speed: 12.5, hold: 0.7, wobble: 0.3 });
    hero.x -= f.ux * f.len * 0.12; hero.z -= f.uz * f.len * 0.12;
  } else if (type === 'teleport') {                       // a pipe that carries the ball past a rock in the middle of the lane
    const a = at(f, f.len * 0.22, 0), b = at(f, f.len * 0.82, 0);
    Object.assign(hero, { a, b, r: 0.62, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    rect({ ...f, x: f.x + f.ux * f.len * 0.52, z: f.z + f.uz * f.len * 0.52 }, -1.1, 1.1, -0.95, 0.95, walls);
    hero.rock = { x: f.x + f.ux * f.len * 0.52, z: f.z + f.uz * f.len * 0.52, half: 1.1, side: 0.95 };
  } else if (type === 'drawbridge') {                     // a moat across the lane with a bridge that goes up and down
    Object.assign(hero, { half: 1.5, period: q(4 + r() * 1.5), phase: r(), up: 0.4 });
  } else if (type === 'loop') {                           // a loop-the-loop: enter it fast enough to go all the way round
    Object.assign(hero, { L: 5, R: 1.55, vmin: 7, track: 0.9 });
    rect(mid, -hero.L / 2, hero.L / 2, hero.track, hw + 0.3, walls); rect(mid, -hero.L / 2, hero.L / 2, -(hw + 0.3), -hero.track, walls);
  }
  return hero;
}
function gateSeg(f, a, gap) { const p0 = at(f, a, -gap), p1 = at(f, a, gap); return [p0.x, p0.z, p1.x, p1.z]; }

/** Is a gate-type hero's gate shut at time `t`? */
export function gateBlocked(hero, t) {
  if (hero.type === 'windmill') {                         // the four sails pass the opening one after another: shut about 40% of the time
    const Q = 1.5707963267948966, f = (((t * hero.w + hero.phase) % Q) + Q) % Q / Q;
    return (f < 0.5 ? f : 1 - f) < 0.2;
  }
  if (hero.type === 'alligator') return (((t / hero.period + hero.phase) % 1) + 1) % 1 < hero.closed;
  return false;
}
/** Is the drawbridge up (so the moat is open water) at time `t`? */
export function bridgeUp(hero, t) { return (((t / hero.period + hero.phase) % 1) + 1) % 1 >= 1 - hero.up; }
