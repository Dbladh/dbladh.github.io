// Fuel cans along the ride: red jerry cans that spin and bob, one every few hundred units. Early on they sit on the trail (easy); later they
// float at the top of a jump's arc, or just past an obstacle where a jump that is too long flies over them (hard) and they come further apart.
//
// Where a can goes is worked out from the course seed alone (never from who built what first), and every candidate spot is *flown* on paper
// first: the game's own jump numbers, over a range of speeds, charges and take-off points. A spot is only used if enough of those flights
// reach it (the share that do is the "ease" of the can; the ramp lowers it with distance, but never to zero), so a can is never impossible.
import * as THREE from 'three';

const WIN_L = 90, WIN_R = 190;
const GRAV = 24, R_WHEEL = 0.414, HW = 0.78;                      // the game's gravity, wheel radius and half wheelbase (at the desktop bike size)
const RIDE_Y = R_WHEEL, PICK_DY = 0.4;                            // the wheel centre's height on the ground, and how far above it a pickup is measured
const JUMP_VY = (c) => 5.5 + 9.5 * (1 - (1 - c) * (1 - c));
const POP = (s, vx) => Math.min(8, s * vx * 0.32);
const hard = (d) => 0.6 * Math.sqrt(d) + 0.4 * d;                          // how hard it is at distance fraction d (0..1): a sqrt-like rise, with no pow() so it is the same everywhere
const RAMP = 2600, WINDOW = 80;                                                // distance over which the difficulty ramps from easy to hardest
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A low-poly jerry can (about 1.4 units tall, drawn at that size, close to a coin), built from boxes with vertex colours, merged into one geometry. */
function canGeometry() {
  const parts = [];
  const add = (geo, x, y, z, color, ry = 0) => {
    geo.rotateY(ry); geo.translate(x, y, z);
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { const ny = g.attributes.normal.getY(i), k = 0.82 + 0.18 * ny; col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  add(B(1.0, 1.25, 0.46), 0, 0, 0, '#c4281a');                   // the body
  add(B(1.04, 0.28, 0.5), 0, -0.05, 0, '#f4e6c0');                // a pale label band
  add(B(0.46, 0.12, 0.52), 0, -0.05, 0, '#2d2d33');                // (with a dark stripe across it)
  add(B(1.02, 0.14, 0.5), 0, -0.56, 0, '#8e2416');              // a darker base
  add(B(0.78, 0.1, 0.5), 0, 0.5, 0, '#e8553a');                 // a lighter top rim
  add(B(0.3, 0.1, 0.1), -0.17, 0.74, 0, '#2d2d33');             // the handle: two short posts and a bar
  add(B(0.1, 0.32, 0.1), -0.32, 0.64, 0, '#2d2d33'); add(B(0.1, 0.32, 0.1), 0.0, 0.64, 0, '#2d2d33');
  add(B(0.42, 0.1, 0.1), -0.16, 0.8, 0, '#2d2d33');
  add(new THREE.CylinderGeometry(0.11, 0.13, 0.3, 8), 0.34, 0.7, 0, '#f2c230');   // the spout and its cap
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8), 0.34, 0.9, 0, '#d9a416');
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const size = parts[0].attributes[name].itemSize, arr = new Float32Array(total * size); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

export function createFuel(scene, track, coins, laneZ) {
  const CAP = 40;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#8a2410'), emissiveIntensity: 0.9 });
  const mesh = new THREE.InstancedMesh(canGeometry(), mat, CAP);
  mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.renderOrder = 3;
  scene.add(mesh);
  const dummy = new THREE.Object3D();

  let seed = 1, startX = 0, nextT = 0, lastType = '';
  const slots = [];                                              // the cans, in order of x: { x, y, type, ease, r, got }
  const radiusAt = (d) => lerp(2.5, 1.55, d);                    // how close the bike's pickup point has to pass (shrinks with distance)

  // ---------- paper flights ----------
  const obstacleHit = (x, y, list) => {                           // would the bike's wheels strike an obstacle there?
    for (const o of list) {
      const top = track.laneAt(o.x) + o.h;
      for (const sg of [-1, 1]) if (Math.abs(x + sg * HW - o.x) < o.hw + R_WHEEL * 0.5 && y - R_WHEEL < top - 0.14) return true;
    }
    return false;
  };
  /** Does a bike leaving the ground at tx (speed v, upward speed vy) pass within `rr` of the target, without hitting an obstacle? */
  function flies(tx, v, vy, target, rr, list) {
    const y0 = track.laneAt(tx) + RIDE_Y;
    for (let t = 0.03; t < 4.5; t += 0.03) {
      const x = tx + v * t, y = y0 + vy * t - 0.5 * GRAV * t * t, g = track.laneAt(x) + RIDE_Y;
      if (obstacleHit(x, y, list)) return false;
      const dx = (x - target.x) / rr, dy = (y + PICK_DY - target.y) / rr;
      if (dx * dx + dy * dy < 1) return true;
      if (y <= g && t > 0.12) {                                   // touched down: if that is short of the target the rider just rolls on to it
        return target.ground ? x < target.x - rr * 0.6 && !obstacleHit(target.x, g, list.filter((o) => o.x > x && o.x < target.x)) : false;
      }
      if (x > target.x + rr + 2) return false;
    }
    return false;
  }
  const takeVy = (tx, v, c) => v * track.slopeAt(tx) + JUMP_VY(c);      // a kick, plus the climb the bike already has on a slope
  const speeds = (x) => { const c = track.speedAt(x) - 1.5; return [c - 2.5, c, c + 2.2]; };
  const CHARGES = [-1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1];       // -1: no jump at all

  /** The share (0..1) of paper flights that reach `target`, jumping off the ground anywhere in [a, b] (obstacle spots). */
  function easeFrom(target, a, b, list, rr) {
    let n = 0, ok = 0;
    for (const v of speeds(a)) for (const c of CHARGES) {
      if (c < 0) continue;
      for (let tx = a; tx <= b; tx += 0.8) { n++; if (flies(tx, v, takeVy(tx, v, c), target, rr, list)) ok++; }
    }
    return n ? ok / n : 0;
  }
  /** The same for an arc off a kicker lip at lx (take-off is the lip itself). */
  function easeArc(target, lx, rr, list) {
    const s = track.slopeAt(lx - 1.2); let n = 0, ok = 0;
    for (const v of speeds(lx)) for (const c of CHARGES) {
      const w = c < 0 ? 4 : c === 0 ? 2 : 1;                       // most riders go off a ramp with no jump, or a tap
      n += w; const vy = v * s + POP(s, v) + (c < 0 ? 0 : JUMP_VY(c));
      if (flies(lx, v, vy, target, rr, list)) ok += w;
    }
    return ok / n;
  }

  const flatSafe = (x, margin = 2.5) => {                         // somewhere a can on the trail can be ridden to
    if (Math.abs(track.slopeAt(x)) > 0.2) return false;
    for (let dx = -3; dx <= 3; dx += 1.5) if (track.inPit(x + dx) || track.mudAt(x + dx) > 0) return false;
    return track.obstaclesIn(x - 7, x + 7).every((o) => Math.abs(o.x - x) > o.hw + margin);
  };

  function place(tx, d, rng) {
    const x1 = tx + WINDOW, rr = radiusAt(d);
    track.laneAt(x1 + 160);
    const list = [];
    // 1. on the trail
    for (let x = tx + rng() * 12; x < x1; x += 1.5) if (flatSafe(x)) { list.push({ type: 'ground', x, y: track.laneAt(x) + 1.0, ease: 1 }); break; }
    // 2. floating above the trail: a hop's apex has to pass through it (higher with distance)
    for (let x = tx + 4 + rng() * 20, n = 0; x < x1 && n < 3; x += 18 + rng() * 14) if (flatSafe(x, 4)) {
      n++; const tg = { x, y: track.laneAt(x) + 2.4 + 3.4 * hard(d) + rng() * 0.6 }, near = track.obstaclesIn(x - 30, x + 10);
      list.push({ type: 'float', x, y: tg.y, ease: easeFrom(tg, x - 16, x - 2, near, rr) });
    }
    // 3. over an obstacle (top of the hop) and just behind it (a jump that is too long sails over)
    for (const o of track.obstaclesIn(tx - 4, x1)) {
      const near = track.obstaclesIn(o.x - 30, o.x + 20);
      const lane = track.laneAt(o.x);
      const over = { x: o.x, y: lane + o.h + 1.7 + 1.1 * d };
      list.push({ type: 'over', x: over.x, y: over.y, ease: easeFrom(over, o.x - o.hw - 15, o.x - o.hw - 0.6, near, rr) });
      for (const gap of [3.5, 5.5, 8]) {
        const bx = o.x + o.hw + gap;
        if (!flatSafe(bx, 1.5) || near.some((q) => q !== o && Math.abs(q.x - bx) < q.hw + 3)) continue;
        const tg = { x: bx, y: track.laneAt(bx) + 1.0, ground: true };
        list.push({ type: 'behind', x: bx, y: tg.y, ease: easeFrom(tg, o.x - o.hw - 15, o.x - o.hw - 0.6, near, rr) });
      }
    }
    // 4. off a kicker or across a gap: at the top of the arc, further down the flight (where a big jump is still in the air), and just past the far bank of a gap
    for (const a of coins.arcs(tx - 32, x1 + 10)) {
      if (a.apex.x < (a.pit ? tx - 30 : tx) || a.apex.x > x1 + 10) continue;
      const near = track.obstaclesIn(a.lx - 5, a.apex.x + 30), rr2 = rr * 1.25;
      const top = { x: a.apex.x, y: a.apex.y + 0.45 };
      list.push({ type: a.pit ? 'gap' : 'arc', x: top.x, y: top.y, ease: easeArc(top, a.lx, rr2, near), r: rr2 });
      const late = a.pts[Math.min(a.pts.length - 1, Math.floor(a.pts.length * 0.72))];     // on the way down
      if (late && late.x > top.x + 3) { const tg = { x: late.x, y: late.y + 0.45 }; list.push({ type: a.pit ? 'gap' : 'air', x: tg.x, y: tg.y, ease: easeArc(tg, a.lx, rr2, near), r: rr2 }); }
      if (a.pit && a.x1) {
        const gx = a.x1 + 3.5 + rng() * 3;
        if (flatSafe(gx, 1.5)) { const tg = { x: gx, y: track.laneAt(gx) + 1.0, ground: true }; list.push({ type: 'gapland', x: gx, y: tg.y, ease: easeArc(tg, a.lx, rr, near) }); }
      }
    }
    // the wanted ease falls with distance; a spot that nearly nobody reaches is never used
    const want = lerp(0.92, 0.1, hard(d));
    let best = null, bs = 1e9;
    for (const c of list) {
      if (c.type !== 'ground' && c.ease < 0.08) continue;
      const aerial = c.type === 'gap' || c.type === 'gapland' || c.type === 'air' || c.type === 'arc';
      const sc = Math.abs(c.ease - want) - (aerial ? 0.5 : 0) + (c.type === 'float' ? 0.12 : 0) + rng() * 0.12 + (c.type === lastType && c.type !== 'ground' ? 0.1 : 0) + (c.type === 'ground' && d > 0.3 ? 0.25 * d : 0);
      if (sc < bs) { bs = sc; best = c; }
    }
    if (!best) best = { type: 'ground', x: tx + 8, y: track.laneAt(tx + 8) + 1.0, ease: 1 };   // (cannot happen on a normal course, but never leave a hole)
    lastType = best.type;
    return { x: best.x, y: best.y, type: best.type, ease: best.ease, r: best.r || rr, got: false, d };
  }

  const gapFor = (d) => lerp(130, 190, d);                        // the nominal distance between cans: sparser with distance, never more than one tank of fuel's worth apart
  function ensure(xMax) {
    while (nextT < xMax) {
      const k = slots.length, d = clamp01((nextT - startX) / RAMP), rng = mulberry32((seed * 7919 + k * 104729 + 13) >>> 0);
      slots.push(place(nextT, d, rng));
      nextT += gapFor(d) * (0.9 + 0.2 * rng());
    }
  }
  const blocker = (x, y) => { ensure(x + 20); for (const s of slots) if (Math.abs(s.x - x) < 3.2 && Math.abs(s.y - y) < 3.2) return true; return false; };
  coins.setBlocker(blocker);

  const hits = [];
  return {
    hits,
    set visible(v) { mesh.visible = v; },
    reset(newSeed, sx) { seed = newSeed; startX = sx; slots.length = 0; nextT = sx + 55; lastType = ''; },
    /** The cans in [x0, x1] (for tests). */
    slotsIn(x0, x1) { ensure(x1 + 20); return slots.filter((s) => s.x >= x0 && s.x <= x1); },
    ensure,
    test: { flies, speeds, JUMP_VY, CHARGES, takeVy },
    /** (for tests) a paper flight that reaches can `s`: { tx, v, c } with the jump released at tx, or null. */
    plan(s) {
      const rr = s.r, a = s.x - 40, b = s.x + 5, list = track.obstaclesIn(s.x - 40, s.x + 20);
      const target = { x: s.x, y: s.y, ground: s.type === 'behind' };
      if (s.type === 'ground') return null;
      const out = [];
      for (const v of speeds(s.x)) for (const c of CHARGES) {
        if (c < 0) continue;
        for (let tx = a; tx <= b; tx += 0.8) if (flies(tx, v, takeVy(tx, v, c), target, rr, list)) out.push({ tx, v, c });
      }
      return out.length ? out[Math.floor(out.length / 2)] : null;
    },
    get all() { return slots; },
    update(camX, time) {
      ensure(camX + WIN_R);
      let n = 0;
      for (const s of slots) {
        if (s.got || s.x < camX - WIN_L || s.x > camX + WIN_R || n >= CAP) continue;
        const f = Math.min(1, Math.max(0, (camX + WIN_R - s.x) / 30)) * Math.min(1, Math.max(0, (s.x - (camX - WIN_L)) / 20));
        dummy.position.set(s.x, s.y + Math.sin(time * 2 + s.x) * 0.12, laneZ);
        dummy.rotation.set(0, time * 2.4 + s.x, 0.08 * Math.sin(time * 1.7 + s.x));
        dummy.scale.setScalar(1.0 * f); dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    },
    /** Take any can the bike (centre x, y; scale k) is touching. Returns how many. */
    collect(x, y, k = 1) {
      hits.length = 0;
      ensure(x + 30);
      const py = y + PICK_DY * k;
      for (const s of slots) {
        if (s.got || Math.abs(s.x - x) > 6) continue;
        const rr = s.r * k, dx = (s.x - x) / rr, dy = (s.y - py) / rr;
        if (dx * dx + dy * dy < 1) { s.got = true; hits.push({ x: s.x, y: s.y }); }
      }
      return hits.length;
    },
  };
}
