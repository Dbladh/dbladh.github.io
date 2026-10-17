// A worn dirt-bike trail along the lane the rider follows: a soft-edged ribbon of packed dirt with two tyre ruts, draped over the ground
// (the real hills at the start and the generated ground after them), broken at gaps. Built from short segments that are re-laid as the
// camera moves, so the cost stays small (about twenty small meshes, one material).
import * as THREE from 'three';

const SEG = 12, STEP = 0.5, COLS = SEG / STEP + 1, ROWS = 7, HALF = 3.6;     // segment length, spacing along it, rows across, half the ribbon's width
const R = 130;                                                                // how far either side of the camera the trail is laid

/** The trail's texture: u runs along the trail (it tiles), v across it. Packed pale dirt in the middle, two darker ruts, ragged feathered edges. */
function makeTexture() {
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (px, py, per) => {                                                // tileable value noise along u
    const xi = Math.floor(px), yi = Math.floor(py), xf = px - xi, yf = py - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const h = (i, j) => hash(((i % per) + per) % per, j);
    return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / W, v = j / (H - 1), o = (v - 0.5) * 2;                       // o: -1..1 across
    const wob = (vn(u * 8, 3.7, 8) - 0.5) * 0.18 + (vn(u * 24, 9.1, 24) - 0.5) * 0.06;
    const ao = Math.abs(o + wob);
    // base: pale packed dirt, darker toward the ruts at +-0.38 and then grassy edges
    const rut = Math.exp(-Math.pow((ao - 0.36) / 0.1, 2));
    const ridge = Math.exp(-Math.pow(o / 0.14, 2));                            // the hump between the ruts: lighter, grassy tufts
    let r = 222, g = 164, b = 116;                                              // warm reddish-brown packed dirt
    r += 10 * (1 - rut) - 40 * rut; g += 8 * (1 - rut) - 32 * rut; b += 6 * (1 - rut) - 22 * rut;
    const grain = (vn(u * 14, j * 0.8, 14) - 0.5) * 30 + (vn(u * 40, j * 1.7, 40) - 0.5) * 16 + (hash(i, j) - 0.5) * 10;   // streaks that run along the trail
    r += grain; g += grain * 0.85; b += grain * 0.7;
    // grass creeping in at the edges and along the middle hump
    const grass = Math.min(1, Math.max(0, (ao - 0.62) / 0.3) + ridge * 0.22 * (vn(u * 30, 5.5, 30) > 0.5 ? 1 : 0.3));
    r = r * (1 - grass) + 104 * grass; g = g * (1 - grass) + 146 * grass; b = b * (1 - grass) + 66 * grass;
    // alpha: solid in the middle, feathering and ragged toward the edges
    const edge = 1 - Math.min(1, Math.max(0, (ao - 0.66 - (vn(u * 18, 1.3, 18) - 0.5) * 0.16) / 0.3));
    const k = (j * W + i) * 4;
    d[k] = Math.max(0, Math.min(255, r)); d[k + 1] = Math.max(0, Math.min(255, g)); d[k + 2] = Math.max(0, Math.min(255, b)); d[k + 3] = Math.round(255 * edge * edge * (3 - 2 * edge));
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

export function createTrail(parent, { laneZ, groundAt, inPit }) {
  const group = new THREE.Group(); group.visible = true; parent.add(group);
  const tex = makeTexture();
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(0xffffff), emissiveMap: tex, emissiveIntensity: 0.5, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const idx = [];                                                              // (the index of a full segment; broken at gaps by shortening the draw range per quad run)
  const count = Math.ceil((2 * R) / SEG) + 2, segs = [];
  let startX = 0, fade = 1;
  for (let k = 0; k < count; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COLS * ROWS * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(COLS * ROWS * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COLS * ROWS * 4), 4));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array((COLS - 1) * (ROWS - 1) * 6), 1));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = 2; group.add(m);
    segs.push({ m, g, idx: -999 });
  }
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  function lay(s, i) {
    s.idx = i; const x0 = i * SEG, pos = s.g.attributes.position, uv = s.g.attributes.uv, col = s.g.attributes.color, ix = s.g.index.array;
    for (let c = 0; c < COLS; c++) {
      const x = x0 + c * STEP, a = smooth(startX + 6, startX + 26, x);        // the trail fades in from where the ride starts
      for (let r = 0; r < ROWS; r++) {
        const o = r / (ROWS - 1) * 2 - 1, z = laneZ + o * HALF, v = c * ROWS + r;
        pos.setXYZ(v, x, groundAt(x, z) + 0.05, z); uv.setXY(v, x / 9, (o + 1) / 2);
        col.setXYZ(v, 1, 1, 1); col.setW(v, a);
      }
    }
    let n = 0;                                                                   // quads, skipping any that touch a gap
    for (let c = 0; c < COLS - 1; c++) {
      const xa = x0 + c * STEP, xb = xa + STEP;
      if (inPit(xa - 0.2) || inPit(xb + 0.2)) continue;
      for (let r = 0; r < ROWS - 1; r++) { const p = c * ROWS + r, q = (c + 1) * ROWS + r; ix[n++] = p; ix[n++] = p + 1; ix[n++] = q; ix[n++] = q; ix[n++] = p + 1; ix[n++] = q + 1; }
    }
    s.g.setDrawRange(0, n); s.g.index.needsUpdate = true; pos.needsUpdate = uv.needsUpdate = col.needsUpdate = true;
    s.m.visible = n > 0;
  }
  return {
    set visible(v) { group.visible = v; },
    /** A new ride begins at x: the trail starts there (faded in). */
    reset(x) { startX = x; for (const s of segs) { s.idx = -999; s.m.visible = false; } },
    /** 0..1: the whole trail fades in with the camera's trip into the game. */
    setFade(k) { fade = k; mat.opacity = k; },
    update(camX) {
      const first = Math.floor((camX - R) / SEG), last = Math.floor((camX + R) / SEG);
      const have = new Set(segs.map((s) => s.idx)), free = segs.filter((s) => s.idx < first || s.idx > last);
      let built = 0;
      for (let i = first; i <= last && built < 4; i++) {
        if (have.has(i) || (i + 1) * SEG < startX - 2) continue;
        const s = free.pop(); if (!s) break; lay(s, i); built++;
      }
      for (const s of free) { s.idx = -999; s.m.visible = false; }
    },
    /** The gaps (and so the broken stretches) of the course changed: lay everything again. */
    relay() { for (const s of segs) s.idx = -999; },
  };
}
