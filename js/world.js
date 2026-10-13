// The landscape: rolling hills, puffy trees, flowers, cottages, clouds, fireflies
// and the billboards that hold each section's teaser. Everything is procedural
// (no model files), seeded so the layout is the same every visit.
import * as THREE from 'three';

// Where each billboard hill sits. `scale` shrinks the sign (the About sign is a small roadside one).
export const STOPS = {
  creativity:  { x: -34, z: -46, scale: 1,    hillR: 15, hillH: 7,   accent: '#ff9db8' },
  ai:          { x: 0,   z: -64, scale: 1,    hillR: 16, hillH: 9,   accent: '#8ec5ff' },
  engineering: { x: 34,  z: -46, scale: 1,    hillR: 15, hillH: 7,   accent: '#ffd36a' },
  about:       { x: -10, z: -14, scale: 0.45, hillR: 7,  hillH: 2.2, accent: '#9fdc8c' },
};

const BOARD_W = 16, BOARD_H = 9, BOARD_BOTTOM = 2.2;

// Deterministic random numbers (mulberry32).
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ground height at (x, z): gentle rolling base + a big bump under each billboard. */
export function heightAt(x, z) {
  let h = Math.sin(x * 0.07 + 1) * 1.7 + Math.cos(z * 0.08) * 1.5 + Math.sin((x + z) * 0.13) * 0.7;
  h += Math.max(0, -z - 10) * 0.05;
  for (const s of Object.values(STOPS)) {
    const dx = x - s.x, dz = z - s.z, sig = s.hillR / 1.8;
    h += s.hillH * Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
  }
  return h;
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w; y += lineH;
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  return y;
}

// The sign face, drawn on a canvas: cream card, chunky title, mono call-to-action.
function drawBoard(title, teaser, accent) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#fcf6e8'; g.fillRect(0, 0, 1024, 576);
  g.fillStyle = accent; g.fillRect(0, 0, 1024, 40);
  g.fillStyle = '#111';
  g.textBaseline = 'top';
  g.font = '900 92px "Helvetica Neue", Arial, sans-serif';
  const y = wrapText(g, title, 56, 80, 910, 98);
  g.font = '500 40px system-ui, Arial, sans-serif';
  g.fillStyle = '#333';
  wrapText(g, teaser, 56, y + 14, 910, 52);
  g.fillStyle = '#111';
  g.font = '700 38px ui-monospace, Menlo, monospace';
  g.fillText('CLICK TO EXPLORE  →', 56, 508);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildWorld(scene, sections) {
  const rand = rng(7);
  const windows = [];      // cottage windows that glow at night
  const clouds = [];
  const boards = [];       // { id, mesh, center, normal, scale }

  // ---- Terrain ----
  const geo = new THREE.PlaneGeometry(240, 180, 150, 110);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -40);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const low = new THREE.Color('#62bb62'), high = new THREE.Color('#c8f0a4'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = heightAt(x, z);
    p.setY(i, h);
    const t = THREE.MathUtils.clamp((h + 2) / 13, 0, 1);
    c.copy(low).lerp(high, t);
    c.offsetHSL((Math.sin(x * 0.2) * Math.cos(z * 0.17)) * 0.015, 0, 0);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));

  // Keep trees etc. away from signs and the camera's path.
  const keepClear = (x, z, pad = 0) => {
    if (z > -6 && Math.abs(x) < 34) return true; // open meadow in front of the camera
    for (const s of Object.values(STOPS)) {
      if (Math.hypot(x - s.x, z - s.z) < 9 * Math.max(s.scale, 0.8) + pad) return true;
    }
    return false;
  };

  // ---- Trees: puffy round canopies + pointy pines, a few autumn colors ----
  const treeSpots = [];
  while (treeSpots.length < 130) {
    const x = (rand() - 0.5) * 150, z = -95 + rand() * 120;
    if (!keepClear(x, z)) treeSpots.push({ x, z, s: 0.6 + rand() * 0.6 });
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x8a5a3c }), treeSpots.length);
  const canopyGeo = new THREE.IcosahedronGeometry(2, 0);
  const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ flatShading: true }), treeSpots.length);
  const palette = ['#74cf68', '#5cc064', '#8bd873', '#f58a3c', '#f7b83c', '#ff9f5a'].map((h) => new THREE.Color(h));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  treeSpots.forEach((t, i) => {
    const y = heightAt(t.x, t.z);
    m.compose(v.set(t.x, y + 1.0 * t.s, t.z), q.identity(), sc.set(t.s, t.s, t.s));
    trunks.setMatrixAt(i, m);
    e.set(0, rand() * 6.28, 0);
    const squash = 0.9 + rand() * 0.5;
    m.compose(v.set(t.x, y + 3.2 * t.s, t.z), q.setFromEuler(e), sc.set(t.s * 1.1, t.s * squash * 1.2, t.s * 1.1));
    canopies.setMatrixAt(i, m);
    const pick = rand();
    canopies.setColorAt(i, palette[pick < 0.7 ? Math.floor(rand() * 3) : 3 + Math.floor(rand() * 3)]);
  });
  scene.add(trunks, canopies);

  // ---- Flowers scattered in the foreground meadow ----
  const FL = 380;
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ flatShading: true }), FL);
  const fcol = ['#ffffff', '#ffd23f', '#ff7aa8', '#c59bff', '#ff9f5a'].map((h) => new THREE.Color(h));
  for (let i = 0; i < FL; i++) {
    let x, z;
    do { x = (rand() - 0.5) * 100; z = -34 + rand() * 62; } while (keepClear(x, z) && Math.abs(x) < 4);
    m.compose(v.set(x, heightAt(x, z) + 0.22, z), q.identity(), sc.set(1, 1, 1));
    flowers.setMatrixAt(i, m);
    flowers.setColorAt(i, fcol[Math.floor(rand() * fcol.length)]);
  }
  scene.add(flowers);

  // ---- Cottages: cream walls, orange roofs, chimney, warm window glow ----
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf6e3c0 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xe8692f, flatShading: true });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x9a4a2c });
  function cottage(x, z, rot, s = 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.2), wallMat);
    body.position.y = 1.3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2, 4), roofMat);
    roof.position.y = 3.55; roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.92);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), wallMat);
    chimney.position.set(1.1, 4, 0.4);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.12), doorMat);
    door.position.set(-0.8, 0.75, 1.62);
    g.add(body, roof, chimney, door);
    for (const wx of [0.9, 1.9 - 0.2]) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xfff1c0, emissive: 0xffc860, emissiveIntensity: 0 });
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), mat);
      w.position.set(wx - 0.1, 1.5, 1.62);
      windows.push(mat);
      g.add(w);
    }
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = rot; g.scale.setScalar(s);
    scene.add(g);
  }
  cottage(-17, -8, 0.5, 1);
  cottage(14, -12, -0.4, 1.1);
  cottage(26, -26, -0.7, 1);
  cottage(-30, -24, 0.7, 1.1);
  cottage(-5, -30, 0.1, 0.9);

  // ---- Clouds: soft clumps that drift sideways ----
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0xe8eeff, emissiveIntensity: 0.5 });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const s = 3 + rand() * 3;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), cloudMat);
      b.position.set(j * 4.2 - n * 2, rand() * 1.5, (rand() - 0.5) * 3);
      b.scale.y = 0.55;
      g.add(b);
    }
    g.position.set((rand() - 0.5) * 300, 38 + rand() * 24, -70 - rand() * 50);
    g.userData.speed = 0.6 + rand() * 0.9;
    scene.add(g);
    clouds.push(g);
  }

  // ---- Fireflies (visible at night) ----
  const FF = 60;
  const ffPos = new Float32Array(FF * 3), ffBase = [];
  for (let i = 0; i < FF; i++) {
    const x = (rand() - 0.5) * 60, z = -20 + rand() * 40;
    const y = heightAt(x, z) + 1 + rand() * 3;
    ffBase.push({ x, y, z, ph: rand() * 6.28 });
    ffPos.set([x, y, z], i * 3);
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: 0xfff2a0, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(fireflies);

  // ---- Billboards ----
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);
  const startCam = new THREE.Vector3(0, 7, 22);
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
  const postMat = new THREE.MeshLambertMaterial({ color: 0xd8d4c8 });

  for (const [id, s] of Object.entries(STOPS)) {
    const sec = sections[id];
    if (!sec) continue;
    const baseY = heightAt(s.x, s.z);
    const g = new THREE.Group();
    g.position.set(s.x, baseY, s.z);
    const theta = Math.atan2(startCam.x - s.x, startCam.z - s.z);
    g.rotation.y = theta;
    g.scale.setScalar(s.scale);

    const cy = BOARD_BOTTOM + BOARD_H / 2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.8, BOARD_H + 0.8, 0.5), frameMat);
    frame.position.set(0, cy, 0);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshBasicMaterial({ map: drawBoard(sec.title, sec.teaser, s.accent) }),
    );
    face.position.set(0, cy, 0.27);
    face.userData.stopId = id;
    g.add(frame, face);
    for (const px of [-BOARD_W / 2 + 2.2, BOARD_W / 2 - 2.2]) {
      const h = BOARD_BOTTOM + 3;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 10), postMat);
      post.position.set(px, BOARD_BOTTOM - h / 2 + 0.6 + 0.01, -0.2);
      g.add(post);
    }
    boardGroup.add(g);
    g.updateMatrixWorld(true);
    const center = face.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    boards.push({ id, face, center, normal, scale: s.scale });
  }

  let time = 0;
  return {
    boards,
    /** Per-frame animation: drifting clouds, bobbing fireflies. */
    update(dt) {
      time += dt;
      for (const cl of clouds) {
        cl.position.x += cl.userData.speed * dt;
        if (cl.position.x > 170) cl.position.x = -170;
      }
      const a = ffGeo.attributes.position;
      for (let i = 0; i < FF; i++) {
        const b = ffBase[i];
        a.setXYZ(i, b.x + Math.sin(time * 0.6 + b.ph) * 1.2, b.y + Math.sin(time * 0.9 + b.ph * 2) * 0.6, b.z + Math.cos(time * 0.5 + b.ph) * 1.2);
      }
      a.needsUpdate = true;
    },
    /** 0 = daytime, 1 = full night. Lights windows and fireflies. */
    setNight(n) {
      for (const mat of windows) mat.emissiveIntensity = n * 1.4;
      fireflies.material.opacity = n;
    },
  };
}
