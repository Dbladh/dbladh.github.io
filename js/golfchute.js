// The secret chute: a clear winding channel that leaves a hole through a gap in its wall, runs round the outside of the course and drops the ball back near the cup.
// The gap is shut by a gate that a button on the course opens for a few seconds (the same button and gate as a door machine, flagged `secret`). Pure data like golfgen.js, and deterministic:
// it uses only + - * / sqrt, and rounds every point. The ball's physics in the chute is in golfphys.js (stepChute); the channel itself is drawn by golfvis.js.
import { inPoly, newBall, newCtx, shoot, stepBall } from './golfphys.js?v=20261030232537';

export const CHUTE = { hw: 0.85, acc: 1.3, fric: 0.2, vmax: 10, kick: 3, e: 0.6, exitH: 1.0, gap: 0.78, scatter: 0.2, scatterV: 0.026 };
const q = (v) => Math.round(v * 2) / 2, q2 = (v) => Math.round(v * 100) / 100;
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.sqrt((x - ax - dx * t) * (x - ax - dx * t) + (z - az - dz * t) * (z - az - dz * t)); };

/** Catmull-Rom through the waypoints, as a dense polyline of [x, z, s] (s = distance along). */
function spline(W) {
  const out = [], P = [W[0], ...W, W[W.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2], n = Math.max(2, Math.ceil(Math.sqrt((p2[0] - p1[0]) * (p2[0] - p1[0]) + (p2[1] - p1[1]) * (p2[1] - p1[1])) / 0.5));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, c = (a, b, c1, d) => 0.5 * (2 * b + (-a + c1) * t + (2 * a - 5 * b + 4 * c1 - d) * t2 + (-a + 3 * b - 3 * c1 + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), 0]);
    }
  }
  out.push([W[W.length - 1][0], W[W.length - 1][1], 0]);
  let s = 0; for (let i = 1; i < out.length; i++) { s += Math.sqrt((out[i][0] - out[i - 1][0]) * (out[i][0] - out[i - 1][0]) + (out[i][1] - out[i - 1][1]) * (out[i][1] - out[i - 1][1])); out[i][2] = s; }
  return out;
}

/** Give a hole a secret chute if one fits (about one hole in three): opens a gap in the wall, adds the door (button and gate) and sets `H.chute`. Returns whether it did. */
export function makeChute(H, r) {
  if (H.index < 2 || H.index > 7 || r() > 1.1 || !H.doors) return false;
  const cl = H.path, w = H.widths, N = cl.length, hw = CHUTE.hw, O = H.outline.flat();
  const sAt = [0]; for (let i = 1; i < N; i++) sAt.push(sAt[i - 1] + Math.sqrt((cl[i].x - cl[i - 1].x) * (cl[i].x - cl[i - 1].x) + (cl[i].z - cl[i - 1].z) * (cl[i].z - cl[i - 1].z)));
  const tan = (i) => { const a = cl[Math.max(0, i - 1)], b = cl[Math.min(N - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.sqrt(dx * dx + dz * dz) || 1; return [dx / l, dz / l]; };
  const solids = [...H.posts, ...H.bumpers, ...H.pads, ...H.boosts, ...(H.magnets || []).map((m) => ({ x: m.x, z: m.z, r: 1.2 })), ...(H.tunnels || []).map((t) => ({ x: t.x, z: t.z, r: t.len / 2 })), ...(H.feats || []).filter((f) => f.x !== undefined).map((f) => ({ x: f.x, z: f.z, r: (f.len || 2) / 2 + 0.6 })), ...H.doors.map((d) => d.button).filter(Boolean), ...H.pickups];
  const polys = [...H.sands.map((s) => s.poly), ...H.ponds.map((p) => p.poly), ...(H.patches || []).filter((p) => p.kind !== 'rough').map((p) => p.poly)];
  const clear = (x, z, m) => !solids.some((o) => Math.sqrt((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z)) < (o.r || 0.6) + m) && !polys.some((pl) => inPoly(pl, x, z)) && Math.sqrt((H.hero.x - x) * (H.hero.x - x) + (H.hero.z - z) * (H.hero.z - z)) > 3.4;
  const buttonOk = (x, z) => {
    if (Math.hypot(x - H.ball.x, z - H.ball.z) < 3.6 || Math.hypot(x - H.cup.x, z - H.cup.z) < 3.0 || !clear(x, z, 0.9) || !inPoly(O, x, z)) return false;
    for (const wl of H.walls) { if (!wl[4]) continue; if (segDist(x, z, wl[0], wl[1], wl[2], wl[3]) < 1.3) return false; }
    return true;
  };
  const mouthShot = (b) => b.chute;
  const side0 = r() < 0.5 ? 1 : -1, L = sAt[N - 1]; let searches = 0;
    for (const side of [side0, -side0]) for (let att = 0; att < 24; att++) {
    const sT = L * (0.3 + 0.021 * att), im = sAt.findIndex((s) => s >= sT); if (im < 4 || im > N - 14) continue;
    const [tx, tz] = tan(im), nx = -tz * side, nz = tx * side;                                  // (nx, nz: out of the course on this side)
    if (tan(im - 3)[0] * tx + tan(im - 3)[1] * tz < 0.985 || tan(im + 3)[0] * tx + tan(im + 3)[1] * tz < 0.96) continue;
    const mx = cl[im].x + nx * w[im], mz = cl[im].z + nz * w[im];
    if (solids.some((o) => Math.sqrt((o.x - cl[im].x) * (o.x - cl[im].x) + (o.z - cl[im].z) * (o.z - cl[im].z)) < (o.r || 0.6) + 0.6) || Math.sqrt((H.hero.x - cl[im].x) * (H.hero.x - cl[im].x) + (H.hero.z - cl[im].z) * (H.hero.z - cl[im].z)) < 2.8) continue;
    // the gap: the wall segments about the mouth go, the gate takes their place
    const gone = []; for (let j = 0; j < H.walls.length; j++) { const wl = H.walls[j]; if (!wl[4] || wl[5] || wl[7]) continue; const cx = (wl[0] + wl[2]) / 2, cz = (wl[1] + wl[3]) / 2; if (Math.sqrt((cx - mx) * (cx - mx) + (cz - mz) * (cz - mz)) < CHUTE.gap + 0.3) gone.push(j); }
    if (gone.length < 3 || gone.length > 6) continue;
    const ends = []; for (const j of gone) ends.push([H.walls[j][0], H.walls[j][1]], [H.walls[j][2], H.walls[j][3]]);
    let pa = ends[0], pb = ends[0], best = -1; for (const a of ends) for (const b of ends) { const d = (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]); if (d > best) { best = d; pa = a; pb = b; } }
    const gl = Math.sqrt(best); if (gl < 1.4 || gl > 4) continue;
    const gx = (pa[0] + pb[0]) / 2, gz = (pa[1] + pb[1]) / 2;
    // the route: out through the gap, along the outside of the corridor with a lazy weave, in over the wall near the cup, to an exit on the lane just before it
    const W = [[gx, gz], [gx + nx * 2.6, gz + nz * 2.6], [gx + nx * 3.8 + tx * 3.4, gz + nz * 3.8 + tz * 3.4]]; let flip = 1;
    for (let i = im + 12; i < N - 12; i += 8) { const [ux, uz] = tan(i), off = w[i] + 3.4 + 0.9 * flip; flip = -flip; W.push([cl[i].x - uz * side * off, cl[i].z + ux * side * off]); }
    const [ex, ez] = tan(N - 1), cu = H.cup, ox = -ez * side, oz = ex * side, dxo = ox * 0.85 - ex * 0.53, dzo = oz * 0.85 - ez * 0.53, EN = 4.1;         // (the end stands off the cup's round green on the outer side, a little behind it, and the last run points straight at the cup)
    const iw = N - 9, [wx, wz] = tan(iw);
    W.push([cu.x + dxo * (EN + 2.6), cu.z + dzo * (EN + 2.6)]);
    const exit = { x: cu.x + dxo * EN, z: cu.z + dzo * EN };
    W.push([exit.x, exit.z]);
    const pts = spline(W.map((p) => [q2(p[0]), q2(p[1])])), n = pts.length;
    // it must be a smooth, clear run: gentle bends, off the course (but for the gap and the end), off itself, inside the lawn
    let ok = n > 20 && pts[n - 1][2] > 9;
    for (let i = 2; i < n - 2 && ok; i++) {
      const v1x = pts[i][0] - pts[i - 2][0], v1z = pts[i][1] - pts[i - 2][1], v2x = pts[i + 2][0] - pts[i][0], v2z = pts[i + 2][1] - pts[i][1], da = (v1x * v2z - v1z * v2x) / ((Math.sqrt(v1x * v1x + v1z * v1z) * Math.sqrt(v2x * v2x + v2z * v2z)) || 1);
      if (Math.abs(da) / ((pts[i + 2][2] - pts[i - 2][2]) / 2) > 1.0) ok = false;                // (a bend no tighter than a radius of about 2.4)
      const ps = pts[i], inEnd = ps[2] > pts[n - 1][2] - 6.5, inStart = ps[2] < 3.4;
      if (!inEnd && !inStart) { let m = 1e9; for (let j = 0; j < O.length; j += 2) { const j2 = (j + 2) % O.length, d = segDist(ps[0], ps[1], O[j], O[j + 1], O[j2], O[j2 + 1]); if (d < m) m = d; } if (m < hw + 0.9 || inPoly(O, ps[0], ps[1])) ok = false; }
      if (inEnd && inPoly(O, ps[0], ps[1])) ok = false;                                   // (it never runs into the course: it ends at the wall)
      if (ps[0] * ps[0] + ps[1] * ps[1] > 17.4 * 17.4) ok = false;
      for (let j = 0; j < i - 12 && ok; j += 3) if ((pts[j][0] - ps[0]) * (pts[j][0] - ps[0]) + (pts[j][1] - ps[1]) * (pts[j][1] - ps[1]) < (2 * hw + 0.6) * (2 * hw + 0.6)) ok = false;
    }
    if (!ok) continue;
    // build it: walls both sides, the height of the floor at each sample
    const left = [], right = [], len = pts[n - 1][2], ly = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dx * dx + dz * dz) || 1, ox = -dz / l, oz = dx / l;
      left.push([q2(pts[i][0] + ox * hw), q2(pts[i][1] + oz * hw)]); right.push([q2(pts[i][0] - ox * hw), q2(pts[i][1] - oz * hw)]);
      ly.push(q2(0.2 + 1.35 * sm(pts[i][2] / 3.5) - 0.55 * (pts[i][2] / len)));
    }
    const lw = [], rw = []; for (let i = 0; i < n - 1; i++) { lw.push([left[i][0], left[i][1], left[i + 1][0], left[i + 1][1]]); rw.push([right[i][0], right[i][1], right[i + 1][0], right[i + 1][1]]); }
    const bak = { walls: H.walls.slice(), bounds: H.bounds, shape: H.shape.map((sp) => sp[2]) };
    for (let k = gone.length - 1; k >= 0; k--) H.walls.splice(gone[k], 1);
    const gate = [q2(pa[0]), q2(pa[1]), q2(pb[0]), q2(pb[1])];
    const door = { gate, button: { x: 1e3, z: 1e3, r: 0.55 }, secret: true }; H.doors.push(door);
    const T0 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], tl = Math.sqrt(T0[0] * T0[0] + T0[1] * T0[1]) || 1;
    const padAt = []; for (let i = 7; i < n - 8; i += 9) padAt.push(i);                      // (boost pads in the floor, one every four and a half units)
    H.chute = { pts: pts.map((p) => [q2(p[0]), q2(p[1]), q2(p[2])]), left: lw, right: rw, ly, len: q2(len), hw, mouth: { x: q2(gx), z: q2(gz), ux: q2(nx), uz: q2(nz), hw: q2(gl / 2 - 0.15) }, exit: { x: q2(exit.x), z: q2(exit.z) }, exitH: CHUTE.exitH, scatter: CHUTE.scatter, scatterV: CHUTE.scatterV, kick: CHUTE.kick, pads: padAt, acc: CHUTE.acc, fric: CHUTE.fric, vmax: CHUTE.vmax, e: CHUTE.e, sx: T0[0] / tl, sz: T0[1] / tl };
    // keep the hole's bounds (and the sites' discs) round the chute
    let x0 = H.bounds.cx - H.bounds.hx, x1 = H.bounds.cx + H.bounds.hx, z0 = H.bounds.cz - H.bounds.hz, z1 = H.bounds.cz + H.bounds.hz;
    for (const p of pts) { x0 = Math.min(x0, p[0] - 1); x1 = Math.max(x1, p[0] + 1); z0 = Math.min(z0, p[1] - 1); z1 = Math.max(z1, p[1] + 1); }
    H.bounds = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 };
    for (const sp of H.shape) { let m = 1e9; for (const p of pts) { const d = Math.sqrt((p[0] - sp[0]) * (p[0] - sp[0]) + (p[1] - sp[1]) * (p[1] - sp[1])); if (d < m) m = d; } if (m < 7) sp[2] = Math.max(sp[2], q2(m + hw + 0.8)); }
    // one stroke must be able to do it all: roll over the button, on through the gap and into the chute. A shot from the tee that gets in with the gate held open is found first, then the button is laid on its path.
    if (++searches > 3) { H.walls.length = 0; H.walls.push(...bak.walls); H.doors.pop(); H.chute = undefined; H.bounds = bak.bounds; H.shape.forEach((sp, i) => { sp[2] = bak.shape[i]; }); return false; }
    const shots = findShots(H, mouthShot);
    let placed = false, bestScore = 0, bestBtn = null;
    for (const shot of shots) for (const fr of [0.5, 0.35, 0.7]) {
      const k = Math.floor(shot.path.length * fr), [bx, bz] = shot.path[k];
      if (!buttonOk(bx, bz)) continue;
      door.button = { x: q2(bx), z: q2(bz), r: 0.55 };
      const sc = robust(H, shot);
      if (sc > bestScore) { bestScore = sc; bestBtn = door.button; }
      if (sc >= 8) break;
    }
    if (bestBtn && bestScore >= 6) { door.button = bestBtn; placed = true; }
    if (placed) return true;
    H.walls.length = 0; H.walls.push(...bak.walls); H.doors.pop(); H.chute = undefined; H.bounds = bak.bounds; H.shape.forEach((sp, i) => { sp[2] = bak.shape[i]; });
  }
  return false;
}

/** Shots from the tee (angles nearest the mouth first, a few powers) that end with the ball in the chute while the gate is held open, up to six that differ from one another; each comes with its path as [x, z] points before the ball went in. */
function findShots(H, goal) {
  const M = H.chute.mouth, a0 = Math.atan2(M.z - H.ball.z, M.x - H.ball.x), angs = [0], out = [];
  for (let k = 1; k <= 10; k++) angs.push(k * 0.25, -k * 0.25);
  for (const power of [0.65, 0.9]) for (const da of angs) {
    const b = newBall(H), ctx = newCtx(), ev = {}, a = a0 + da, path = []; ctx.gateT = 1e4; shoot(b, Math.cos(a), Math.sin(a), power, false);
    for (let i = 0; i < 80 && !b.holed && !b.sunk && !b.rest; i++) { ctx.t = i / 20; stepBall(b, H, ctx, 1 / 20, ev); if (goal(b)) { if (path.length > 8 && !out.some((o) => Math.abs(o.a - a) < 0.1 && Math.abs(o.power - power) < 0.1)) out.push({ a, power, path }); break; } path.push([b.x, b.z]); }
    if (out.length >= 4) return out;
  }
  return out;
}
/** The same shot with the gate shut and the button laid, tried a little off (angle, power) and at three moments of the hole's clock (a hero obstacle moves): how many of the nine still end in the chute? */
function robust(H, shot) {
  let n = 0;
  for (const [da, dp, t0] of [[0, 0, 0], [0.03, 0, 1.5], [-0.03, 0, 3], [0, 0.07, 1.5], [0, -0.07, 0], [0.03, 0.07, 3], [-0.03, -0.07, 1.5], [0.03, -0.07, 0], [-0.03, 0.07, 3]]) {
    const b = newBall(H), ctx = newCtx(), ev = {}; ctx.gateT = 0; shoot(b, Math.cos(shot.a + da), Math.sin(shot.a + da), Math.min(1, shot.power + dp), false);
    for (let i = 0; i < 80 && !b.holed && !b.sunk && !b.rest; i++) { ctx.t = t0 + i / 20; stepBall(b, H, ctx, 1 / 20, ev); if (b.chute) { n++; break; } }
  }
  return n;
}
