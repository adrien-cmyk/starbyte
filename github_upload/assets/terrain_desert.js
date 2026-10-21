// TERRAIN DÉSERTIQUE — variante archivée (Adrien 20/10 : « garde le modèle de planète désertique en mémoire,
// on va l'utiliser plus tard peut-être pour les colonies »). NON CHARGÉE par le jeu.
// Sol continu minéral : sable ocre, rouille, roche sombre, poussière claire, strates, cratères, failles, canyons,
// lacs asséchés (sel), quelques bosquets extraterrestres très localisés ; forêt retirée, eau cachée.
// Ciel associé (assets/sky.js) : NIGHT.ground 0x1a1512 ;
//   DAY = { bg: 0xb59a88, sky: 0xe6dcd3, ground: 0x5e4a3c, hemi: 1.7, key: 0xffdcb8, keyI: 3.6, pos: [240,175,80], exp: 1.12, env: 0.9, bloom: 0.24, fogN: 620, fogF: 1700 }
// Aperçu : GDD/starbyte_terrain_mineral_v1.png. Pour l'utiliser : charger ce fichier À LA PLACE de assets/terrain.js.
(function () {
  'use strict';
  const HEX_R = 50 / Math.sqrt(3);
  const ZONE = { x0: -205, x1: 230, z0: -185, z1: 185 };
  const STEP = 2.5;
  const FREE = new Set(['locked', 'rocky', 'resource', 'depleted', 'antenna_project']);

  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < (o || 4); i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  const CRATERS = [
    [-62, 18, 15, 0.7], [72, -52, 11, 0.6], [128, 40, 17, 0.8], [-110, -70, 13, 0.6], [18, 88, 9, 0.45],
    [-150, 60, 24, 3.5], [190, -120, 30, 4.5], [-175, -150, 20, 3], [205, 120, 22, 3.2], [-40, 160, 16, 2.4],
    [40, -160, 19, 2.6], [95, 5, 6, 0.35], [-20, -30, 5, 0.3], [-95, 30, 7, 0.4],
    [58, 70, 7, 0.4], [-45, -95, 8, 0.45], [140, -95, 9, 0.5], [-128, 8, 6, 0.35], [8, -70, 4, 0.25], [110, 92, 5, 0.3], [-82, 92, 5, 0.3],
  ];
  const FAULTS = [
    [[-200, -40], [-130, -25], [-70, -42], [-15, -12], [40, -20], [110, 8], [175, -5], [230, 20]],
    [[-60, 185], [-48, 120], [-30, 70], [-38, 30], [-22, -5]],
    [[150, 185], [140, 130], [158, 75], [150, 30]],
  ];
  const CANYONS = [
    [[-205, -120], [-170, -135], [-140, -160], [-120, -185]],
    [[230, -60], [205, -85], [185, -130], [190, -185]],
  ];
  const VEG = [[-158, 112, 26], [196, 70, 18], [-188, -40, 16], [118, 158, 14]];

  function segDist(px, pz, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l));
    return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
  }
  function lineDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i], pts[i + 1])); return d; }
  function gridW(x, z) {
    const dx = Math.max(0, Math.abs(x - 12) - 150), dz = Math.max(0, Math.abs(z) - 128);
    return 1 - sstep(0, 45, Math.hypot(dx, dz));
  }
  function relief(x, z) {
    const g = gridW(x, z);
    let h = (fbm(x / 38, z / 38, 3) - 0.5) * lerp(5, 0.5, g);
    for (const [cx, cz, r, d] of CRATERS) {
      const q = Math.hypot(x - cx, z - cz) / r;
      if (q < 1.6) { const depth = d * lerp(1, 0.55, g); h += q < 1 ? -depth * (1 - q * q) : depth * 0.35 * Math.max(0, 1 - Math.abs(q - 1.08) / 0.45); }
    }
    for (const f of FAULTS) { const d = lineDist(x, z, f); if (d < 2.2) h -= (1 - d / 2.2) * lerp(1.6, 0.55, g); }
    for (const c of CANYONS) { const d = lineDist(x, z, c); if (d < 16) h -= sstep(16, 4, d) * 9; }
    return h;
  }

  const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const SAND = C(0xa88b6e), DUST = C(0xcbb698), RUST = C(0x8c5b41), BASALT = C(0x463d38), GREY = C(0x7b746d),
        SALT = C(0xd8ccb6), DARK = C(0x3e322d), TEAL = C(0x3d9c8f), VIOLET = C(0x7c4f9a), RIM = C(0xcfae86);
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function soilColor(x, z, y, slope) {
    const m = fbm(x / 95 + 7, z / 95 - 3, 4);
    let c = mix(SAND, RUST, sstep(0.42, 0.68, m));
    c = mix(c, GREY, sstep(0.55, 0.8, fbm(x / 55 - 40, z / 55 + 12, 3)) * 0.55);
    c = mix(c, BASALT, sstep(0.6, 0.72, fbm(x / 70 - 13, z / 70 + 77, 4)) * 0.75);
    c = mix(c, DUST, sstep(0.56, 0.74, fbm(x / 42 + 90, z / 42 - 60, 4)) * 0.75);
    const band = Math.sin(y * 1.15 + fbm(x / 30, z / 30, 2) * 5.0);
    const strat = sstep(2, 8, Math.abs(y)) + slope * 0.8;
    c = mix(c, band > 0.35 ? RIM : BASALT, Math.min(0.55, strat * 0.45) * Math.abs(band));
    c = mix(c, BASALT, sstep(0.35, 0.8, slope) * 0.7);
    const g = (fbm(x / 3.1, z / 3.1, 2) - 0.5) * 0.14;
    c = c.map(v => v + g);
    for (const [cx, cz, r] of CRATERS) {
      const q = Math.hypot(x - cx, z - cz) / r;
      if (q < 1) c = mix(c, DARK, 0.25 + (1 - q) * 0.5);
      else if (q < 1.25) c = mix(c, RIM, (1 - Math.abs(q - 1.1) / 0.15) * 0.75);
      else if (q < 2.4) { const ray = Math.pow(Math.abs(Math.sin(Math.atan2(z - cz, x - cx) * 7 + cx)), 6); c = mix(c, DUST, ray * (1 - (q - 1.25) / 1.15) * 0.35); }
    }
    for (const f of FAULTS) { const d = lineDist(x, z, f) + (fbm(x / 6, z / 6, 2) - 0.5) * 1.6; if (d < 2.2) c = mix(c, DARK, (1 - d / 2.2) * 0.9); else if (d < 4.5) c = mix(c, RIM, (1 - (d - 2.2) / 2.3) * 0.35); }
    for (const cn of CANYONS) { const d = lineDist(x, z, cn); if (d < 18) c = mix(c, Math.sin(y * 1.6) > 0 ? RUST : BASALT, sstep(18, 6, d) * 0.6); }
    if (y < -1.6) c = mix(c, SALT, sstep(-1.6, -4, y) * 0.7);
    for (const [vx, vz, vr] of VEG) {
      const q = Math.hypot(x - vx, z - vz) / vr;
      if (q < 1) { const sp = fbm(x / 2.2 + vx, z / 2.2, 2); if (sp > 0.5) c = mix(c, sp > 0.62 ? VIOLET : TEAL, (1 - q) * sstep(0.5, 0.66, sp)); }
    }
    return c;
  }
  function grainTex(T) {
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), im = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = fbm(x / 9, y / 9, 3) * 0.6 + hash(x, y) * 0.4;
      const v = Math.round(200 + (n - 0.5) * 90), i = (y * N + x) * 4;
      im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    for (let k = 0; k < 220; k++) { g.fillStyle = `rgba(60,48,40,${0.25 + Math.random() * 0.3})`; g.beginPath(); g.arc(Math.random() * N, Math.random() * N, 0.6 + Math.random() * 1.5, 0, Math.PI * 2); g.fill(); }
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(255,240,215,${0.15 + Math.random() * 0.2})`; g.beginPath(); g.arc(Math.random() * N, Math.random() * N, 0.5 + Math.random(), 0, Math.PI * 2); g.fill(); }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function worldUV(geo, scale) {
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / scale; uv[i * 2 + 1] = p.getZ(i) / scale; }
    return uv;
  }
  function heightField(ter, T) {
    const S = 6, X0 = -432, N = Math.ceil(864 / S) + 1;
    const sum = new Float32Array(N * N), cnt = new Uint16Array(N * N);
    const p = ter.geometry.attributes.position, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(ter.matrixWorld);
      const ix = Math.round((v.x - X0) / S), iz = Math.round((v.z - X0) / S);
      if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
      sum[iz * N + ix] += v.y; cnt[iz * N + ix]++;
    }
    const H = new Float32Array(N * N), ok = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) if (cnt[i]) { H[i] = sum[i] / cnt[i]; ok[i] = 1; }
    for (let pass = 0; pass < 40; pass++) {
      let left = 0;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const i = z * N + x; if (ok[i]) continue;
        let s = 0, n = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < N && zz < N && ok[zz * N + xx] === 1) { s += H[zz * N + xx]; n++; } }
        if (n) { H[i] = s / n; ok[i] = 2; } else left++;
      }
      for (let i = 0; i < N * N; i++) if (ok[i] === 2) ok[i] = 1;
      if (!left) break;
    }
    return (x, z) => {
      const fx = Math.max(0, Math.min(N - 1.001, (x - X0) / S)), fz = Math.max(0, Math.min(N - 1.001, (z - X0) / S));
      const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
      const a = H[z0 * N + x0], b = H[z0 * N + x0 + 1], c = H[(z0 + 1) * N + x0], d = H[(z0 + 1) * N + x0 + 1];
      return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
    };
  }
  function colorize(geo, mw, T) {
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal, v = new T.Vector3(), nv = new T.Vector3();
    const nm = new T.Matrix3().getNormalMatrix(mw), col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mw);
      nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      const c = soilColor(v.x, v.z, v.y, 1 - Math.max(0, nv.y));
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
  }

  let done = false, overlay = null, MAT = null;
  function build(P) {
    const T = window.SB3D.THREE, sc = P.scene;
    let ter = null, water = null;
    sc.traverse(o => { if (o.name === 'SB_TERRAIN') ter = o; if (o.name === 'SB_WATER_EXPORT') water = o; });
    if (!ter) return false;
    ter.updateMatrixWorld(true);
    const Hf = heightField(ter, T);
    const grain = grainTex(T);
    MAT = {
      ground: new T.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.93, metalness: 0.02 }),
      line: new T.MeshBasicMaterial({ color: 0xf6e6cc, transparent: true, opacity: 0.26, depthWrite: false }),
      locked: new T.MeshBasicMaterial({ color: 0x0c0a0a, transparent: true, opacity: 0.42, depthWrite: false }),
      depleted: new T.MeshBasicMaterial({ color: 0x2a1f1a, transparent: true, opacity: 0.32, depthWrite: false }),
      resource: new T.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.08, depthWrite: false }),
    };
    {
      const g = ter.geometry, p = g.attributes.position, inv = new T.Matrix4().copy(ter.matrixWorld).invert(), v = new T.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(ter.matrixWorld);
        const inside = v.x > ZONE.x0 + 4 && v.x < ZONE.x1 - 4 && v.z > ZONE.z0 + 4 && v.z < ZONE.z1 - 4;
        if (inside) { v.y = Math.min(v.y, Hf(v.x, v.z)) - 4; v.applyMatrix4(inv); p.setXYZ(i, v.x, v.y, v.z); }
      }
      p.needsUpdate = true;
      colorize(g, ter.matrixWorld, T);
      const wuv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(ter.matrixWorld); wuv[i * 2] = v.x / 14; wuv[i * 2 + 1] = v.z / 14; }
      g.setAttribute('uv', new T.BufferAttribute(wuv, 2));
      ter.material = MAT.ground;
    }
    if (water) water.visible = false;
    {
      const W = ZONE.x1 - ZONE.x0, D = ZONE.z1 - ZONE.z0;
      const geo = new T.PlaneGeometry(W, D, Math.round(W / STEP), Math.round(D / STEP));
      geo.rotateX(-Math.PI / 2); geo.translate((ZONE.x0 + ZONE.x1) / 2, 0, (ZONE.z0 + ZONE.z1) / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), g = gridW(x, z);
        const edge = Math.min(x - ZONE.x0, ZONE.x1 - x, z - ZONE.z0, ZONE.z1 - z);
        const toTer = 1 - sstep(4, 34, edge);
        let y = lerp(0.1, Hf(x, z), (1 - g) * 0.85) + relief(x, z);
        y = lerp(y, Hf(x, z), toTer);
        p.setY(i, Math.min(y, g > 0.98 ? 0.3 : 99));
      }
      p.needsUpdate = true;
      colorize(geo, new T.Matrix4(), T);
      geo.setAttribute('uv', new T.BufferAttribute(worldUV(geo, 14), 2));
      const m = new T.Mesh(geo, MAT.ground); m.receiveShadow = true; m.name = 'SB_GROUND_FINE';
      sc.add(m);
    }
    {
      const ALIEN = [0x2f7d74, 0x5a3f7c, 0x3e8f86, 0x6b4a8e];
      let k = 0;
      sc.traverse(o => {
        if (!o.isInstancedMesh || !o.material || !o.material.color || o.name === 'SB_LUM_POOLS') return;   // PATCH_2110 : ignore les halos de lumiere.js
        const isRock = o.material && o.material.color && o.material.color.getHex() === 0x44474d;
        const m4 = new T.Matrix4(), pos = new T.Vector3(), keep = [];
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4); pos.setFromMatrixPosition(m4);
          const inVeg = VEG.some(([vx, vz, vr]) => Math.hypot(pos.x - vx, pos.z - vz) < vr * 1.05);
          const far = Math.abs(pos.x) > 300 || Math.abs(pos.z) > 300;
          if (isRock ? (hash(i, 7) < 0.55) : (inVeg || (far && hash(i, 3) < 0.08))) keep.push(m4.clone());
        }
        keep.forEach((mm, j) => o.setMatrixAt(j, mm));
        o.count = keep.length; o.instanceMatrix.needsUpdate = true;
        o.material = o.material.clone();
        o.material.color.set(isRock ? 0x7a6a5e : ALIEN[k++ % ALIEN.length]);
      });
    }
    return true;
  }
  function hexCorners(cx, cz, r) { const out = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return out; }
  function dress(P) {
    const T = window.SB3D.THREE;
    if (!MAT) return;
    if (overlay) { P.scene.remove(overlay); overlay.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    overlay = new T.Group(); overlay.name = 'SB_GRID_OVERLAY';
    const seen = new Set(), pts = [], fills = { locked: [], depleted: [], resource: [] };
    for (const a of P.parcelGroup.children) {
      const i = a.userData.parcel; if (i === undefined) continue;
      const st = P._stateOf(i), free = FREE.has(st);
      for (const ch of a.children) {
        const nm = ch.name || '';
        if (/KIT_FRAME/.test(nm)) ch.visible = false;
        else if (/KIT_PLATE/.test(nm)) ch.visible = !free;
        else if (/KIT_NODES/.test(nm)) { ch.scale.setScalar(0.55); ch.position.y = -0.35; }
      }
      if (fills[st]) fills[st].push([a.position.x, a.position.z]);
      const cs = hexCorners(a.position.x, a.position.z, HEX_R - 0.4);
      for (let k = 0; k < 6; k++) {
        const p0 = cs[k], p1 = cs[(k + 1) % 6];
        const key = [p0, p1].map(p => Math.round(p[0]) + ':' + Math.round(p[1])).sort().join('|');
        if (!seen.has(key)) { seen.add(key); pts.push([p0, p1]); }
      }
    }
    const pos = [], idx = [], w = 0.22;
    for (const [p0, p1] of pts) {
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz), nx = -dz / l * w, nz = dx / l * w, b = pos.length / 3;
      pos.push(p0[0] + nx, 0.46, p0[1] + nz, p0[0] - nx, 0.46, p0[1] - nz, p1[0] + nx, 0.46, p1[1] + nz, p1[0] - nx, 0.46, p1[1] - nz);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); lg.setIndex(idx);
    const lines = new T.Mesh(lg, MAT.line); lines.renderOrder = 3; overlay.add(lines);
    for (const [st, list] of Object.entries(fills)) {
      if (!list.length) continue;
      const fp = [], fi = [];
      for (const [cx, cz] of list) {
        const b = fp.length / 3; fp.push(cx, 0.42, cz);
        for (const [x, z] of hexCorners(cx, cz, HEX_R)) fp.push(x, 0.42, z);
        for (let k = 0; k < 6; k++) fi.push(b, b + 1 + ((k + 1) % 6), b + 1 + k);
      }
      const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(fp, 3)); fg.setIndex(fi);
      const fm = new T.Mesh(fg, MAT[st]); fm.renderOrder = 2; overlay.add(fm);
    }
    P.scene.add(overlay);
    if (P.decoGroup) P.decoGroup.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.color || o.userData.terraTint) return;
      const c = o.material.color; if (c.g > c.r * 1.08 && c.g > c.b) { o.material = o.material.clone(); o.material.color.set(0x6f6157); o.userData.terraTint = true; }
    });
  }
  function hook() {
    const P = window.Planet3D;
    if (!P || !P.ready || !window.SB3D) return false;
    if (!done) {
      try { done = build(P); } catch (e) { console.warn('[terrain désert]', e); done = true; return true; }
      const orig = P._rebuild;
      P._rebuild = function () { const r = orig.apply(this, arguments); try { dress(this); } catch (e) { console.warn('[terrain désert] grille', e); } return r; };
      try { P.sync(true); } catch (e) {}
    }
    return true;
  }
  const t = setInterval(() => { if (hook()) clearInterval(t); }, 500);
  window.SBTerrain = { variant: 'desert', soilColor, relief };
})();
