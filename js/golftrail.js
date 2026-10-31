// The trail a rolling ball leaves on the ground: a ribbon along its path that fades away. On snow it is a groove that stays (a dark blue-grey line pressed into the snow with pale heaped edges); on sand a
// shallow furrow; on grass a faint flattened streak that is gone in a couple of seconds. One ribbon per hole, a few hundred points; the points sit on the ground (golfphys.js hillH).
import * as THREE from 'three';
import { hillH } from './golfphys.js?v=20261030215905';

const MAXP = 700;
/** How the ball marks each kind of ground (`ground` in golfthemes.js): groove colour, edge colour, strength, width, how long it lasts (s). */
const STYLES = {
  snow: { mid: '#4c6c9e', edge: '#f4f8ff', a: 0.5, ea: 0.22, w: 0.36, life: 600, lift: 0.045 },
  sand: { mid: '#a77c43', edge: '#f4dca2', a: 0.3, ea: 0.2, w: 0.32, life: 30, lift: 0.04 },
  grass: { mid: '#e6f7b0', edge: '#e6f7b0', a: 0.16, ea: 0.0, w: 0.28, life: 2.2, lift: 0.04 },
  other: { mid: '#ffffff', edge: '#ffffff', a: 0.12, ea: 0.0, w: 0.26, life: 1.5, lift: 0.04 },
};

export function createTrail() {
  const pos = new Float32Array(MAXP * 9), col = new Float32Array(MAXP * 12), idx = new Uint32Array((MAXP - 1) * 12), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  let pts = [], style = STYLES.other, hole = null, cMid = new THREE.Color(), cEdge = new THREE.Color();
  const setStyle = (ground) => { style = STYLES[ground] || STYLES.other; cMid.set(style.mid); cEdge.set(style.edge); };
  setStyle('other');
  const api = {
    mesh,
    /** Attach to a hole's group and start a fresh trail for ground of this kind. */
    attach(group, h, ground) { mesh.parent?.remove(mesh); group.add(mesh); hole = h; setStyle(ground); pts = []; geo.setDrawRange(0, 0); },
    clear() { pts = []; geo.setDrawRange(0, 0); },
    /** Lay down points behind the ball and fade the old ones. */
    update(dt, b) {
      if (!hole) return;
      const last = pts[pts.length - 1];
      for (const p of pts) p.age += dt;
      while (pts.length && pts[0].age > style.life) pts.shift();
      if (b && !b.air && !b.holed && !b.sunk && !b.chute && !b.rail && !b.loop && !(b.ly > 0.05)) {
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 0.25) {
          const dx = last ? b.x - last.x : 0, dz = last ? b.z - last.z : 0, d = Math.hypot(dx, dz);
          if (!last || d > 0.13) {
            let nx = -b.vz / sp, nz = b.vx / sp;                                    // (across the way the ball is going)
            pts.push({ x: b.x, z: b.z, nx, nz, age: 0, brk: !last || d > 1.6, sp });
            if (pts.length > MAXP) pts.shift();
          }
        }
      }
      this.rebuild();
    },
    rebuild() {
      const n = pts.length; if (n < 2) { geo.setDrawRange(0, 0); return; }
      let ni = 0;
      for (let i = 0; i < n; i++) {
        const p = pts[i], fade = Math.max(0, 1 - p.age / style.life), taper = Math.min(1, (i === 0 ? 0 : 1) * 1, (n - i) / 3 + 0.25), sf = Math.min(1, p.sp / 2.5), am = style.a * Math.pow(fade, 0.7) * (0.35 + 0.65 * sf) * (style.life > 100 ? 1 : 1), ae = style.ea * Math.pow(fade, 0.7) * (0.35 + 0.65 * sf);
        const w = style.w * (0.55 + 0.45 * sf) * (style.life > 100 ? 1 : 0.9 + 0.1 * fade);
        const y = hillH(hole, p.x, p.z) + style.lift;
        for (let c = 0; c < 3; c++) {
          const off = c === 1 ? 0 : (c === 0 ? 1 : -1) * (w * 0.5 + (style.ea ? w * 0.35 : 0)), k = i * 3 + c, o = k * 3, q = k * 4;
          pos[o] = p.x + p.nx * off; pos[o + 2] = p.z + p.nz * off; pos[o + 1] = hillH(hole, p.x + p.nx * off, p.z + p.nz * off) + style.lift + (c === 1 ? -0.012 : 0.012);
          const cc = c === 1 ? cMid : cEdge; col[q] = cc.r; col[q + 1] = cc.g; col[q + 2] = cc.b; col[q + 3] = (c === 1 ? am : ae) * taper;
        }
        void y;
        if (i > 0 && !p.brk) { const a0 = (i - 1) * 3, b0 = i * 3; idx.set([a0, a0 + 1, b0, a0 + 1, b0 + 1, b0, a0 + 1, a0 + 2, b0 + 1, a0 + 2, b0 + 2, b0 + 1], ni); ni += 12; }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.index.needsUpdate = true; geo.setDrawRange(0, ni);
    },
    dispose() { mesh.parent?.remove(mesh); geo.dispose(); mat.dispose(); },
  };
  return api;
}
