// The "machines" of a hole: small designed chains where one piece feeds the next, stamped onto straight stretches of the corridor by the generator (golfgen.js).
//   runup : a boost strip, then a jump ramp, then a canyon: only the speed from the strip carries the ball over (the ledge beside it is the plain way).
//   vault : a bounce pad, then two low fences in a zigzag: the pad vaults the ball straight over them (walking the zigzag is the plain way).
//   rail  : a cyan rail from a mouth, over a canyon, to an exit: rolling into the mouth fast enough carries the ball across (the ledge beside the canyon is the plain way).
//   door  : a button, then two tall walls in a zigzag with a gate in the middle of each: the button opens the gates for a few seconds for a straight run.
// Every recipe is checked with a proof shot (proveRecipe) over a band of powers, and dropped if the intended route does not work.
import { newBall, newCtx, shoot, stepBall, hillH } from './golfphys.js?v=20261027203701';
import { TUNING } from './golftuning.js?v=20261027203701';

export { TUNING };                                         // (so the tester can sweep the numbers on the very copy the recipes read)
const HALF_W = 2.3;

/** A frame along the corridor from centre-line point `i0` towards `i1` (the chord between them): P(u, lat) is the world point u along it and lat to its left. */
function frameAt(S, i0, i1) {
  const o = S.cl[i0], dx = S.cl[i1].x - o.x, dz = S.cl[i1].z - o.z, l = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
  return { o, ux, uz, nx, nz, P: (u, lat) => ({ x: o.x + ux * u + nx * lat, z: o.z + uz * u + nz * lat }) };
}
/**
 * The first stretch of `len` units (searching from a random start) whose centre line stays within `tol` of a straight line, has standard width, and is clear of the hero and of everything
 * already placed. Returns { i0, i1 } or null.
 */
function findSlot(S, len, tol) {
  const { cl, w, sAt, N, r } = S, start = (r() * N) | 0;
  for (let k = 0; k < N; k++) {
    const i0 = (start + k) % N; if (sAt[i0] < 2.6 || sAt[i0] + len > S.length - 2.6) continue;
    let i1 = i0; while (i1 < N - 1 && sAt[i1 + 1] - sAt[i0] <= len) i1++;
    if (sAt[i1] - sAt[i0] < len - 0.7) continue;
    const dx = cl[i1].x - cl[i0].x, dz = cl[i1].z - cl[i0].z, l = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / l, uz = dz / l;
    let ok = true;
    for (let i = i0; i <= i1 && ok; i++) {
      const dev = (cl[i].x - cl[i0].x) * -uz + (cl[i].z - cl[i0].z) * ux;
      if (Math.abs(dev) > tol || w[i] > HALF_W + 0.02 || Math.abs(sAt[i] - S.sHero) < S.heroHalf + 0.3) ok = false;
      for (const u of S.used) if (sAt[i] > u[0] - 1.2 && sAt[i] < u[1] + 1.2) ok = false;
      if (ok && i % 2 === 0 && !S.free(cl[i].x, cl[i].z, 0.2)) ok = false;
    }
    if (ok) { S.used.push([sAt[i0], sAt[i1]]); return { i0, i1 }; }
  }
  return null;
}
const keepAlong = (S, F, len) => { for (let u = 0.5; u <= len; u += 2) { const p = F.P(u, 0); S.keep.push({ x: p.x, z: p.z, r: 2.4 }); } };
const seg = (F, u, a, b) => { const p = F.P(u, a), q = F.P(u, b); return [p.x, p.z, q.x, q.z]; };

const stamp = {
  rail(S, sl, rid) {
    const T = TUNING.rail, F = frameAt(S, sl.i0, sl.i1), ledge = S.r() < 0.5 ? 1 : -1, g = T.gap, len = T.exitAt + 0.9, m = F.P(T.mouthAt, 0), e = F.P(T.exitAt, 0), gc = F.P(T.gapAt + g / 2, 0);
    S.feats.push({ t: 'gap', ux: F.ux, uz: F.uz, nx: F.nx, nz: F.nz, wid: 4, x: gc.x, z: gc.z, len: g, d: 1.4, c0: ledge > 0 ? -HALF_W - 0.05 : -HALF_W + 1.85, c1: ledge > 0 ? HALF_W - 1.85 : HALF_W + 0.05, rid });
    S.rails.push({ ax: m.x, az: m.z, bx: e.x, bz: e.z, ux: F.ux, uz: F.uz, len: T.exitAt - T.mouthAt, r: 0.7, h: T.h, rid });
    keepAlong(S, F, len);
    return { kind: 'rail', rid, F, len, entryU: 0.0, targetU: T.exitAt + 0.5 };
  },
  secret(S, sl, rid) {                                       // a pocket along the corridor wall, shut in front and on the lane side by low fences and open at its far end: the pad vaults the ball in over the front fence to the coin
    const T = TUNING.secret, F = frameAt(S, sl.i0, sl.i1), len = T.frontAt + T.len + 1.0, pd = F.P(T.padAt, T.lat), coin = F.P(T.frontAt + T.len * 0.55, T.lat + 0.2);
    S.pads.push({ x: pd.x, z: pd.z, r: 0.55, rid });
    const front = seg(F, T.frontAt, T.fenceLat, HALF_W + 0.1), side = [F.P(T.frontAt, T.fenceLat), F.P(T.frontAt + T.len, T.fenceLat)];
    for (const sg of [front, [side[0].x, side[0].z, side[1].x, side[1].z]]) { S.barriers.push({ a: [sg[0], sg[1]], b: [sg[2], sg[3]], low: true, rid }); S.walls.push([sg[0], sg[1], sg[2], sg[3], 0, 1, 1, rid]); }
    S.secrets.push({ x: coin.x, z: coin.z, type: 'coin', secret: true, rid });
    keepAlong(S, F, len);
    return { kind: 'secret', rid, F, len, entryU: 0.0, lat: T.lat, coin, minPass: 3 };
  },
  bridge(S, sl, rid) {
    const T = TUNING.bridge, F = frameAt(S, sl.i0, sl.i1), ledge = S.r() < 0.5 ? 1 : -1, g = T.gap, len = T.gapAt + g + 1.0, bp = F.P(T.buttonAt, 0), gc = F.P(T.gapAt + g / 2, 0);
    S.feats.push({ t: 'gap', ux: F.ux, uz: F.uz, nx: F.nx, nz: F.nz, wid: 4, x: gc.x, z: gc.z, len: g, d: 1.4, bridge: true, c0: ledge > 0 ? -HALF_W - 0.05 : -HALF_W + 1.85, c1: ledge > 0 ? HALF_W - 1.85 : HALF_W + 0.05, rid });
    S.doors.push({ gate: null, button: { x: bp.x, z: bp.z, r: 0.55 }, wireTo: { x: gc.x, z: gc.z }, rid });
    keepAlong(S, F, len);
    return { kind: 'bridge', rid, F, len, entryU: 0.0, targetU: T.gapAt + g + 0.3 };
  },
  runup(S, sl, rid) {
    const T = TUNING.runup, F = frameAt(S, sl.i0, sl.i1), ledge = S.r() < 0.5 ? 1 : -1, g = T.gap, rampStart = T.rampAt, lip = rampStart + T.ramp, len = lip + g + 1.0;
    const b = F.P(T.boostAt, 0), j = F.P(rampStart + T.ramp / 2, 0), gc = F.P(lip + g / 2, 0), base = { ux: F.ux, uz: F.uz, nx: F.nx, nz: F.nz, wid: 4, rid };
    S.boosts.push({ x: b.x, z: b.z, ux: F.ux, uz: F.uz, len: T.boostLen, wid: 1.2, rid });
    S.feats.push({ t: 'jump', ...base, x: j.x, z: j.z, len: T.ramp, h: T.rampH }, { t: 'gap', ...base, x: gc.x, z: gc.z, len: g, d: 1.4, c0: ledge > 0 ? -HALF_W - 0.05 : -HALF_W + 1.85, c1: ledge > 0 ? HALF_W - 1.85 : HALF_W + 0.05 });
    keepAlong(S, F, len);
    return { kind: 'runup', rid, F, len, entryU: 0.2, targetU: lip + g + 0.3 };
  },
  vault(S, sl, rid) {
    const T = TUNING.vault, F = frameAt(S, sl.i0, sl.i1), len = T.fence2 + 1.4, p = F.P(T.padAt, 0);
    S.pads.push({ x: p.x, z: p.z, r: 0.55, rid });
    for (const [u, openPlus] of [[T.fence1, true], [T.fence2, false]]) {
      const a = openPlus ? [-HALF_W - 0.1, HALF_W - 1.7] : [-HALF_W + 1.7, HALF_W + 0.1], sg = seg(F, u, a[0], a[1]);
      S.barriers.push({ a: [sg[0], sg[1]], b: [sg[2], sg[3]], low: true, rid }); S.walls.push([sg[0], sg[1], sg[2], sg[3], 0, 1, 1, rid]);
    }
    keepAlong(S, F, len);
    return { kind: 'vault', rid, F, len, entryU: 0.0, targetU: T.fence2 + 0.6 };
  },
  door(S, sl, rid) {
    const T = TUNING.door, F = frameAt(S, sl.i0, sl.i1), len = T.wall2 + 2.8, bp = F.P(T.buttonAt, 0), button = { x: bp.x, z: bp.z, r: 0.55 };
    for (const [u, openPlus] of [[T.wall1, true], [T.wall2, false]]) {
      const pieces = openPlus ? [[-HALF_W - 0.1, -0.55], [0.55, HALF_W - 1.7]] : [[-HALF_W + 1.7, -0.55], [0.55, HALF_W + 0.1]];
      for (const [a, b] of pieces) { const sg = seg(F, u, a, b); S.barriers.push({ a: [sg[0], sg[1]], b: [sg[2], sg[3]], low: false, rid }); S.walls.push([sg[0], sg[1], sg[2], sg[3], 0, 1, 0, rid]); }
      S.doors.push({ gate: seg(F, u, -0.55, 0.55), button, rid });
    }
    const bs = F.P(T.wall2 + 1.2, 0); S.boosts.push({ x: bs.x, z: bs.z, ux: F.ux, uz: F.uz, len: 1.4, wid: 1.2, powered: true, rid });          // (powered by the same button: dark until the gates are open)
    keepAlong(S, F, len);
    return { kind: 'door', rid, F, len, entryU: 0.0, targetU: T.wall2 + 0.6 };
  },
};

/** Which recipes a hole gets, in order along the corridor. */
function wanted(S) {
  const i = S.index, out = [], r = S.r;
  const pick = () => { const o = ['vault']; if (i >= 5) o.push('rail', 'rail'); if (i >= 3) o.push('secret'); if (i >= 4) o.push('bridge', 'bridge'); if (i >= 3) o.push('door', 'door'); if (i >= 3 && S.type !== 'drawbridge') o.push('runup', 'runup'); return o[(r() * o.length) | 0]; };
  if (i >= 2) out.push(pick());
  if (i >= 4 && r() < 0.6) out.push(pick());
  if (i >= 6 && r() < 0.6) out.push(pick());
  return out;
}
const LENGTH = { rail: () => TUNING.rail.exitAt + 0.9, secret: () => TUNING.secret.frontAt + TUNING.secret.len + 1.0, bridge: () => TUNING.bridge.gapAt + TUNING.bridge.gap + 1.0, runup: () => TUNING.runup.rampAt + TUNING.runup.ramp + TUNING.runup.gap + 1.0, vault: () => TUNING.vault.fence2 + 1.4, door: () => TUNING.door.wall2 + 2.8 };

/**
 * Place the recipes of a hole. `S` is the generator's state (the corridor, what is placed so far and the arrays to add to). `plainOk()` says whether the plain route still exists.
 * Returns the recipe records (also pushed to S.recipes).
 */
export function placeRecipes(S, plainOk) {
  let rid = 1;
  for (const kind of wanted(S)) {
    const sl = findSlot(S, LENGTH[kind](), kind === 'runup' ? 0.35 : 0.4); if (!sl) { S.log.push({ kind, out: 'no slot' }); continue; }
    const before = { boosts: S.boosts.length, pads: S.pads.length, feats: S.feats.length, barriers: S.barriers.length, doors: S.doors.length, walls: S.walls.length };
    const rec = stamp[kind](S, sl, rid);
    if (!plainOk()) { removeRecipe(S, rid); S.used.pop(); S.log.push({ kind, out: 'blocks the plain route' }); continue; }
    S.recipes.push(rec); rid++; void before;
  }
}
/** Take every piece of recipe `rid` out of the hole (or of the generator's state). */
export function removeRecipe(H, rid) {
  for (const k of ['boosts', 'pads', 'feats', 'barriers', 'doors', 'rails']) { const a = H[k]; for (let i = a.length - 1; i >= 0; i--) if (a[i].rid === rid) a.splice(i, 1); }
  for (let i = H.walls.length - 1; i >= 0; i--) if (H.walls[i][7] === rid) H.walls.splice(i, 1);
  if (H.pickups) for (let i = H.pickups.length - 1; i >= 0; i--) if (H.pickups[i].rid === rid) H.pickups.splice(i, 1);
}

const POWERS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const LOW_POWERS = [0.2, 0.25, 0.3, 0.35];
/** Take the machine out of a recipe (boost strips, pads and rails removed; for buttons, the button moved out of reach so the gates stay shut); returns a function that puts it back. */
function disable(H, rec) {
  const saved = [];
  for (const k of { runup: ['boosts'], vault: ['pads'], secret: ['pads'], rail: ['rails'] }[rec.kind] || []) { saved.push([k, H[k]]); H[k] = H[k].filter((p) => p.rid !== rec.rid); }
  const doors = (H.doors || []).filter((d) => d.rid === rec.rid), old = doors.map((d) => d.button); doors.forEach((d) => { d.button = { x: 1e6, z: 1e6, r: 0.55 }; });
  return () => { for (const [k, v] of saved) H[k] = v; doors.forEach((d, i) => { d.button = old[i]; }); H.cover = 0; };
}
/** How much the machine matters at moderate power: the proof shot at four moderate powers again without the machine, as the share of those that worked with it that now fail (1 = a moderate putt only works with the machine). */
export function necessityOf(H, rec) {
  const withP = proveRecipe(H, rec, LOW_POWERS).pass; if (!withP) return 0;
  const restore = disable(H, rec), without = proveRecipe(H, rec, LOW_POWERS).pass; restore();
  return Math.max(0, 1 - without / withP);
}
/** The proof shot of a recipe on the finished hole `H`: from the recipe's start, straight along it, at eight powers. Returns { pass, forgiveness (0-1) }. */
export function proveRecipe(H, rec, powers = POWERS) {
  const F = rec.F, ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false }; let pass = 0;
  for (const pw of powers) {
    const b = newBall(H), ctx = newCtx(), p = F.P(rec.entryU, rec.lat || 0); b.x = p.x; b.z = p.z; b.y = hillH(H, p.x, p.z); shoot(b, F.ux, F.uz, pw, false); let umax = -9, near = 9;
    for (let n = 0; n < 600 && !b.rest && !b.holed && !b.sunk; n++) { stepBall(b, H, ctx, 1 / 60, ev); ctx.t += 1 / 60; const u = (b.x - F.o.x) * F.ux + (b.z - F.o.z) * F.uz; if (u > umax) umax = u; if (rec.coin) near = Math.min(near, Math.hypot(b.x - rec.coin.x, b.z - rec.coin.z)); }
    if (rec.coin ? near < 0.55 : !b.sunk && umax >= rec.targetU) pass++;
  }
  H.cover = 0;
  return { pass, forgiveness: pass / powers.length };
}
