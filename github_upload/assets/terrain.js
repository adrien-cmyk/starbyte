// PATCH_2010_TERRAIN — une planète luxuriante continue sous la grille (Adrien 20/10)
// « Une planète colonisable fertile : forêts extraterrestres, lacs profonds, rivières, falaises, rochers, clairières.
//   Le paysage se prolonge d'un hexagone à l'autre ; la grille indique seulement les cases constructibles. »
// Module autonome : il attend Planet3D, pose un sol continu sous la grille (raccordé au paysage d'origine),
// creuse une rivière et un lac, fait pousser la forêt à travers les cases libres, éteint les clôtures
// et dessine la grille en traits fins. Il se ré-applique à chaque reconstruction de la planète.
(function () {
  'use strict';
  const HEX_R = 50 / Math.sqrt(3);            // rayon des hexagones (centres espacés de 50, pointe en haut)
  const ZONE = { x0: -205, x1: 230, z0: -185, z1: 185 };   // le sol fin couvre la grille et ses abords
  const STEP = 2.5;
  const WATER_Y = -2.2;
  const FREE = new Set(['locked', 'rocky', 'resource', 'depleted', 'antenna_project']);

  /* ── bruit ── */
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
  function segDist(px, pz, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l));
    return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
  }
  function lineDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i], pts[i + 1])); return d; }

  /* ── hydrographie et relief ── */
  // 20/10 (Adrien) : l'eau ignore la grille — courbes naturelles qui traversent les cases, passent sous les rails
  function curve(pts, n) {   // Catmull-Rom échantillonnée
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  const RIVER = curve([[-240, -20], [-185, 18], [-140, 60], [-96, 78], [-48, 96], [4, 92], [52, 112], [96, 104], [138, 136], [168, 190]], 10);
  const BROOK = curve([[70, -200], [78, -150], [100, -112], [132, -84], [162, -40], [208, -26], [245, -38]], 10);
  const LAKES = [[-118, -84, 22, 5.5], [-160, 125, 26, 6], [205, 70, 22, 5], [-190, -150, 18, 4]];   // x, z, rayon, profondeur
  // chemins de terre battue, qui partent du centre sans suivre la grille
  const PATHS = [curve([[8, 8], [-30, 26], [-62, 58], [-92, 110], [-138, 150], [-200, 170]], 10),
                 curve([[18, -6], [60, -22], [104, -14], [150, -42], [196, -70], [240, -88]], 10),
                 curve([[-6, -14], [-24, -62], [-58, -110], [-70, -160], [-60, -200]], 10)];
  // traces d'anciennes installations (piliers et dalles à moitié enfouis)
  const RUINS = [[-150, -20, 9], [178, 30, 8], [40, 150, 7], [-60, -150, 8], [118, -150, 7], [-36, -38, 4], [86, 46, 4]];
  const OUTCROPS = [[175, 5, 18], [-170, 15, 16], [60, -150, 14], [-30, 150, 12]];   // falaises et rochers
  function gridW(x, z) {
    const dx = Math.max(0, Math.abs(x - 12) - 150), dz = Math.max(0, Math.abs(z) - 128);
    return 1 - sstep(0, 45, Math.hypot(dx, dz));
  }
  function waterCut(x, z) {   // profondeur creusée par l'eau (0 hors de l'eau)
    let cut = 0;
    const rw = 3.2 + fbm(x / 20, z / 20, 2) * 1.6;
    const dr = lineDist(x, z, RIVER); if (dr < rw + 3) cut = Math.max(cut, sstep(rw + 3, rw * 0.6, dr) * 4.2);
    const bw = 2.2 + fbm(x / 16, z / 16, 2) * 1.2;
    const db = lineDist(x, z, BROOK); if (db < bw + 2.5) cut = Math.max(cut, sstep(bw + 2.5, bw * 0.5, db) * 3.4);
    for (const [lx, lz, r, d] of LAKES) { const q = Math.hypot(x - lx, z - lz) / (r * (0.85 + fbm(x / 14, z / 14, 2) * 0.3)); if (q < 1.25) cut = Math.max(cut, sstep(1.25, 0.7, q) * d); }
    return cut;
  }
  function relief(x, z) {
    const g = gridW(x, z);
    let h = (fbm(x / 34, z / 34, 3) - 0.5) * lerp(6, 0.45, g);
    for (const [cx, cz, r] of OUTCROPS) { const q = Math.hypot(x - cx, z - cz) / r; if (q < 1.3) h += sstep(1.3, 0.55, q) * lerp(7, 2.5, g) * (0.7 + fbm(x / 5, z / 5, 2) * 0.6); }
    // micro-relief : petites bosses et creux
    h += (fbm(x / 7, z / 7, 2) - 0.5) * lerp(0.8, 0.22, g);
    for (const pa of PATHS) { const d = lineDist(x, z, pa); if (d < 2.6) h -= (1 - d / 2.6) * 0.12; }
    return h - waterCut(x, z);
  }
  const onPath = (x, z) => PATHS.reduce((m, pa) => Math.min(m, lineDist(x, z, pa)), 1e9);

  /* ── palette fertile, légèrement extraterrestre ── */
  const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const EMERALD = C(0x3f7d34), TEALG = C(0x2f7457), LIME = C(0x7c9c3a), MOSS = C(0x2a4d2e), DIRT = C(0x5f4a33),
        ROCK = C(0x6d6a66), CLIFF = C(0x57524d), SAND = C(0xa8946c), MUD = C(0x3b3428), VIOLET = C(0x7b54a6), CYAN = C(0x4fc3b4);
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  let ORIG = null;   // couleurs du paysage d'origine (raccord au bord)
  function soilColor(x, z, y, slope) {
    const b1 = fbm(x / 80 + 5, z / 80 - 9, 4), b2 = fbm(x / 46 - 31, z / 46 + 17, 4);
    // biomes : prairie émeraude, mousse bleutée, clairières claires
    let c = mix(EMERALD, TEALG, sstep(0.4, 0.66, b1));
    c = mix(c, LIME, sstep(0.58, 0.76, b2) * 0.75);                 // clairières
    c = mix(c, MOSS, sstep(0.55, 0.75, fbm(x / 22 + 3, z / 22 + 8, 3)) * 0.55);   // sous-bois
    // sentiers de terre et sol nu par endroits
    c = mix(c, DIRT, sstep(0.66, 0.8, fbm(x / 30 - 70, z / 30 + 40, 4)) * 0.65);
    // fleurs extraterrestres : piqûres violettes et cyan, en nappes
    const fl = fbm(x / 1.8, z / 1.8, 2), fz = sstep(0.6, 0.75, fbm(x / 60 + 200, z / 60, 3));
    if (fz > 0 && fl > 0.62) c = mix(c, fl > 0.7 ? VIOLET : CYAN, fz * 0.55);
    // chemins de terre battue, bords herbeux irréguliers
    const dp = onPath(x, z) + (fbm(x / 4, z / 4, 2) - 0.5) * 1.4;
    if (dp < 2.4) c = mix(c, DIRT, sstep(2.4, 1.0, dp) * 0.85);
    // grain
    const g = (fbm(x / 2.6, z / 2.6, 2) - 0.5) * 0.12; c = c.map(v => v + g);
    // falaises : roche striée sur les pentes
    const band = Math.sin(y * 1.3 + fbm(x / 25, z / 25, 2) * 4);
    const rock = mix(ROCK, CLIFF, band > 0 ? 0.2 : 0.8);
    c = mix(c, rock, sstep(0.3, 0.7, slope));
    // berges : sable puis vase sous l'eau
    if (y < WATER_Y + 1.3) c = mix(c, SAND, sstep(WATER_Y + 1.3, WATER_Y + 0.2, y) * 0.8);
    if (y < WATER_Y) c = mix(c, MUD, sstep(WATER_Y, WATER_Y - 2, y));
    return c;
  }

  /* ── texture de grain (tuilée) ── */
  function grainTex(T) {
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), im = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = fbm(x / 7, y / 7, 3) * 0.55 + hash(x, y) * 0.45;
      const v = Math.round(205 + (n - 0.5) * 80), i = (y * N + x) * 4;
      im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    // brins
    for (let k = 0; k < 1600; k++) { const x = Math.random() * N, y = Math.random() * N; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,235' : '40,50,40'},${0.12 + Math.random() * 0.18})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 1.5, y - 2 - Math.random() * 3); g.stroke(); }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  /* ── échantillonnage du paysage d'origine (altitude et couleur) pour le raccord ── */
  function sampleField(ter, T) {
    const S = 6, X0 = -432, N = Math.ceil(864 / S) + 1;
    const sum = new Float32Array(N * N), cs = new Float32Array(N * N * 3), cnt = new Uint16Array(N * N);
    const p = ter.geometry.attributes.position, col = ter.geometry.attributes.color, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(ter.matrixWorld);
      const ix = Math.round((v.x - X0) / S), iz = Math.round((v.z - X0) / S);
      if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
      const k = iz * N + ix; sum[k] += v.y; cnt[k]++;
      if (col) { cs[k * 3] += col.getX(i); cs[k * 3 + 1] += col.getY(i); cs[k * 3 + 2] += col.getZ(i); }
    }
    const H = new Float32Array(N * N), CC = new Float32Array(N * N * 3), ok = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) if (cnt[i]) { H[i] = sum[i] / cnt[i]; for (let j = 0; j < 3; j++) CC[i * 3 + j] = cs[i * 3 + j] / cnt[i]; ok[i] = 1; }
    for (let pass = 0; pass < 40; pass++) {
      let left = 0;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const i = z * N + x; if (ok[i]) continue;
        let s = 0, n = 0, r = 0, gg = 0, bb = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < N && zz < N && ok[zz * N + xx] === 1) { const k = zz * N + xx; s += H[k]; r += CC[k * 3]; gg += CC[k * 3 + 1]; bb += CC[k * 3 + 2]; n++; } }
        if (n) { H[i] = s / n; CC[i * 3] = r / n; CC[i * 3 + 1] = gg / n; CC[i * 3 + 2] = bb / n; ok[i] = 2; } else left++;
      }
      for (let i = 0; i < N * N; i++) if (ok[i] === 2) ok[i] = 1;
      if (!left) break;
    }
    const at = (x, z) => {
      const fx = Math.max(0, Math.min(N - 1.001, (x - X0) / S)), fz = Math.max(0, Math.min(N - 1.001, (z - X0) / S));
      const x0 = Math.floor(fx), z0 = Math.floor(fz); return [z0 * N + x0, z0 * N + x0 + 1, (z0 + 1) * N + x0, (z0 + 1) * N + x0 + 1, fx - x0, fz - z0];
    };
    return {
      h(x, z) { const [a, b, c, d, tx, tz] = at(x, z); return lerp(lerp(H[a], H[b], tx), lerp(H[c], H[d], tx), tz); },
      c(x, z) { const [a, b, c, d, tx, tz] = at(x, z); const o = []; for (let j = 0; j < 3; j++) o.push(lerp(lerp(CC[a * 3 + j], CC[b * 3 + j], tx), lerp(CC[c * 3 + j], CC[d * 3 + j], tx), tz)); return o; },
    };
  }

  let done = false, overlay = null, flora = null, MAT = null, F = null, groundY = null;
  function build(P) {
    const T = window.SB3D.THREE, sc = P.scene;
    let ter = null, water = null;
    sc.traverse(o => { if (o.name === 'SB_TERRAIN') ter = o; if (o.name === 'SB_WATER_EXPORT') water = o; });
    if (!ter) return false;
    ter.updateMatrixWorld(true);
    F = sampleField(ter, T);
    const grain = grainTex(T);
    MAT = {
      ground: new T.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.92, metalness: 0.0 }),
      line: new T.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.22, depthWrite: false }),
      locked: new T.MeshBasicMaterial({ color: 0x050a0c, transparent: true, opacity: 0.45, depthWrite: false }),
      depleted: new T.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.4, depthWrite: false }),
      resource: new T.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.07, depthWrite: false }),
    };
    // 1. le paysage d'origine passe sous le nouveau sol à l'intérieur de la zone
    {
      const g = ter.geometry, p = g.attributes.position, inv = new T.Matrix4().copy(ter.matrixWorld).invert(), v = new T.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(ter.matrixWorld);
        if (v.x > ZONE.x0 + 5 && v.x < ZONE.x1 - 5 && v.z > ZONE.z0 + 5 && v.z < ZONE.z1 - 5) { v.y -= 9; v.applyMatrix4(inv); p.setXYZ(i, v.x, v.y, v.z); }
      }
      p.needsUpdate = true; g.computeVertexNormals();
    }
    // 2. le sol fin, continu, raccordé au paysage
    groundY = (x, z) => {
      const g = gridW(x, z);
      const edge = Math.min(x - ZONE.x0, ZONE.x1 - x, z - ZONE.z0, ZONE.z1 - z);
      const toTer = 1 - sstep(4, 34, edge);
      let y = lerp(0.12, F.h(x, z), (1 - g) * 0.9) + relief(x, z);
      if (g > 0.98) y = Math.min(y, 0.32);
      return lerp(y, F.h(x, z), toTer);
    };
    {
      const W = ZONE.x1 - ZONE.x0, D = ZONE.z1 - ZONE.z0;
      const geo = new T.PlaneGeometry(W, D, Math.round(W / STEP), Math.round(D / STEP));
      geo.rotateX(-Math.PI / 2); geo.translate((ZONE.x0 + ZONE.x1) / 2, 0, (ZONE.z0 + ZONE.z1) / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
      geo.computeVertexNormals();
      const n = geo.attributes.normal, col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
        let c = soilColor(x, z, y, 1 - Math.max(0, n.getY(i)));
        const edge = Math.min(x - ZONE.x0, ZONE.x1 - x, z - ZONE.z0, ZONE.z1 - z);
        const toTer = 1 - sstep(4, 30, edge);
        if (toTer > 0) c = mix(c, F.c(x, z), toTer);
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        uv[i * 2] = x / 12; uv[i * 2 + 1] = z / 12;
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      const m = new T.Mesh(geo, MAT.ground); m.receiveShadow = true; m.name = 'SB_GROUND_FINE';
      sc.add(m);
    }
    // 3. l'eau : un vrai bleu profond, qui reflète le ciel
    if (water) {
      water.material = water.material.clone();
      water.material.color.set(0x16566a); water.material.roughness = 0.12; water.material.metalness = 0.25;
      water.material.envMapIntensity = 1.4; water.material.emissive = new T.Color(0x06222b); water.material.emissiveIntensity = 0.6;
    }
    // 4. la forêt d'origine : teintes extraterrestres par biome (émeraude, bleu-vert, touches violettes)
    sc.traverse(o => {
      if (!o.isInstancedMesh || o.parent !== sc) return;
      const hex = o.material.color.getHex();
      if (hex === 0x33261c || hex === 0x44474d) return;   // troncs et rochers
      const m4 = new T.Matrix4(), pos = new T.Vector3(), cc = new T.Color();
      o.material = o.material.clone(); o.material.color.set(0xffffff);
      const base = new T.Color(hex);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4); pos.setFromMatrixPosition(m4);
        cc.copy(base).multiplyScalar(1.55);
        tintAlien(cc, pos.x, pos.z, i);
        o.setColorAt(i, cc);
      }
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
    });
    return true;
  }
  const TEAL_T = [0.7, 1.05, 1.25], VIOLET_T = [1.25, 0.75, 1.35], GOLD_T = [1.2, 1.1, 0.7];
  function tintAlien(cc, x, z, i) {
    const b = fbm(x / 70 + 11, z / 70 - 4, 3), v = fbm(x / 40 - 50, z / 40 + 90, 3);
    const t = b > 0.56 ? TEAL_T : (v > 0.66 ? VIOLET_T : (hash(i, 5) < 0.06 ? GOLD_T : null));
    if (t) { const k = b > 0.56 ? sstep(0.56, 0.7, b) : 1; cc.r *= lerp(1, t[0], k); cc.g *= lerp(1, t[1], k); cc.b *= lerp(1, t[2], k); }
    const j = 0.85 + hash(i, 9) * 0.3; cc.multiplyScalar(j);
  }

  /* ── la grille, la forêt qui traverse les cases libres ── */
  function hexCorners(cx, cz, r) { const out = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return out; }
  function dress(P) {
    const T = window.SB3D.THREE;
    if (!MAT) return;
    for (const g of [overlay, flora]) if (g) { P.scene.remove(g); g.traverse(o => { if (o.geometry && o.userData.own) o.geometry.dispose(); }); }
    overlay = new T.Group(); overlay.name = 'SB_GRID_OVERLAY';
    const seen = new Set(), segs = [], fills = { locked: [], depleted: [], resource: [] }, built = [];
    for (const a of P.parcelGroup.children) {
      const i = a.userData.parcel; if (i === undefined) continue;
      const st = P._stateOf(i), free = FREE.has(st);
      for (const ch of a.children) {
        const nm = ch.name || '';
        if (/KIT_FRAME/.test(nm)) ch.visible = false;                 // remplacés par les rails jointifs
        else if (/KIT_PLATE/.test(nm)) { ch.visible = !free; ch.scale.set(1.042, 1, 1.042); }   // le sol traverse ; un socle bord à bord sous les bâtiments
        else if (/KIT_NODES/.test(nm)) ch.scale.set(1.045, 1, 1.045);   // les bornes tombent pile sur les angles communs
      }
      if (!free) built.push([a.position.x, a.position.z]);
      if (fills[st]) fills[st].push([a.position.x, a.position.z]);
      const cs = hexCorners(a.position.x, a.position.z, HEX_R);
      for (let k = 0; k < 6; k++) {
        const p0 = cs[k], p1 = cs[(k + 1) % 6];
        const key = [p0, p1].map(p => Math.round(p[0]) + ':' + Math.round(p[1])).sort().join('|');
        if (!seen.has(key)) { seen.add(key); segs.push([p0, p1]); }
      }
    }
    // rails sci-fi jointifs : un seul rail par arête partagée, bord contre bord ; au-dessus de l'eau ils deviennent des ponts
    buildRails(P, segs);
    for (const [st, list] of Object.entries(fills)) {
      if (!list.length) continue;
      const fp = [], fi = [];
      for (const [cx, cz] of list) {
        const b = fp.length / 3; fp.push(cx, 0.9, cz);
        for (const [x, z] of hexCorners(cx, cz, HEX_R - 0.6)) fp.push(x, 0.9, z);
        for (let k = 0; k < 6; k++) fi.push(b, b + 1 + ((k + 1) % 6), b + 1 + k);
      }
      const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(fp, 3)); fg.setIndex(fi);
      const fm = new T.Mesh(fg, MAT[st]); fm.renderOrder = 2; fm.userData.own = true; overlay.add(fm);
    }
    P.scene.add(overlay);
    plantForest(P, built);
  }
  function buildRails(P, segs) {
    const T = window.SB3D.THREE, M = P.M;
    const n = segs.length, L = HEX_R;
    const beam = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), M.MAT_ARMOR_DARK, n);
    const lip = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), M.MAT_ARMOR_LIGHT || M.MAT_ARMOR_DARK, n * 2);
    const glow = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), M.MAT_EMISSIVE_BLUE_RIM, n);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), v = new T.Vector3(), s = new T.Vector3();
    const piers = [];
    segs.forEach(([p0, p1], i) => {
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz), mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
      q.setFromAxisAngle(up, -Math.atan2(dz, dx));
      v.set(mx, 0.34, mz); s.set(len + 0.9, 0.56, 1.3); m4.compose(v, q, s); beam.setMatrixAt(i, m4);
      const ox = -dz / len * 0.5, oz = dx / len * 0.5;
      v.set(mx + ox, 0.66, mz + oz); s.set(len + 0.9, 0.1, 0.22); m4.compose(v, q, s); lip.setMatrixAt(i * 2, m4);
      v.set(mx - ox, 0.66, mz - oz); lip.setMatrixAt(i * 2 + 1, m4.compose(v, q, s));
      v.set(mx, 0.64, mz); s.set(len - 1.2, 0.08, 0.26); m4.compose(v, q, s); glow.setMatrixAt(i, m4);
      // au-dessus de l'eau : le rail devient un pont, posé sur des piles
      for (let k = 1; k < 6; k++) { const t = k / 6, x = p0[0] + dx * t, z = p0[1] + dz * t; if (groundY(x, z) < WATER_Y + 0.4) piers.push([x, z]); }
    });
    for (const im of [beam, lip, glow]) { im.instanceMatrix.needsUpdate = true; im.castShadow = im !== glow; im.receiveShadow = true; im.userData.own = true; overlay.add(im); }
    if (piers.length) {
      const pm = new T.InstancedMesh(new T.CylinderGeometry(0.55, 0.75, 1, 8), M.MAT_ARMOR_DARK, piers.length);
      piers.forEach(([x, z], j) => { const y0 = groundY(x, z); v.set(x, (y0 + 0.1) / 2, z); s.set(1, Math.max(0.5, 0.1 - y0), 1); q.identity(); m4.compose(v, q, s); pm.setMatrixAt(j, m4); });
      pm.userData.own = true; pm.castShadow = true; overlay.add(pm);
    }
  }
  // forêt extraterrestre qui pousse à travers les cases libres (jamais sur une case bâtie, ni dans l'eau)
  function plantForest(P, built) {
    const T = window.SB3D.THREE;
    flora = new T.Group(); flora.name = 'SB_GRID_FLORA';
    const kinds = [[], [], [], [], [], []];   // positions par type de végétal
    const near = (x, z, list, r) => list.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < r);
    for (let gz = ZONE.z0 + 8; gz < ZONE.z1 - 8; gz += 6.5) for (let gx = ZONE.x0 + 8; gx < ZONE.x1 - 8; gx += 6.5) {
      const hx = Math.round(gx * 10), hz = Math.round(gz * 10);
      const x = gx + (hash(hx, hz) - 0.5) * 5.5, z = gz + (hash(hz, hx) - 0.5) * 5.5;
      const y = groundY(x, z);
      if (y < WATER_Y + 0.6) continue;                                    // eau et berges
      if (near(x, z, built, HEX_R * 0.97)) continue;                      // cases bâties : rien ne pousse
      if (onPath(x, z) < 3.5) continue;                                   // chemins dégagés
      if (RUINS.some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr)) continue;
      const forest = fbm(x / 48 + 3, z / 48 - 7, 4), clearing = fbm(x / 26 - 9, z / 26 + 4, 3);
      const inGrid = gridW(x, z) > 0.5;
      // sur la grille, la forêt reste en lisière : le cœur des cases libres est dégagé (lisibilité du plateau)
      let core = 1; if (inGrid) { const dc = P.parcelGroup.children.reduce((m, c2) => Math.min(m, Math.hypot(x - c2.position.x, z - c2.position.z)), 1e9); core = sstep(11, 22, dc); }
      const dens = sstep(0.42, 0.62, forest) * (1 - sstep(0.6, 0.74, clearing)) * (inGrid ? 0.6 * core : 1);
      const r = hash(hx + 3, hz - 7);
      if (r < dens) kinds[r < dens * 0.35 ? 3 : (r < dens * 0.7 ? 0 : 1)].push([x, y, z, 0.8 + hash(hx, 11) * 0.55]);
      else if (r < dens + 0.06) kinds[2].push([x, y, z, 0.9 + hash(hx, 13) * 0.6]);     // buissons en lisière
      else if (r > 0.985) kinds[4].push([x, y - 0.4, z, 0.5 + hash(hz, 17) * 0.7]);       // rochers épars
    }
    const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), s = new T.Vector3(), v = new T.Vector3(), cc = new T.Color();
    kinds.forEach((list, c) => {
      const proto = P.kit.veg[c]; if (!proto || !list.length) return;
      proto.traverse(d => {
        if (!d.isMesh) return;
        const isBark = d.material.color.getHex() === 0x33261c || c >= 4;
        const im = new T.InstancedMesh(d.geometry, isBark ? d.material : d.material.clone(), list.length);
        if (!isBark) im.material.color.set(0xffffff);
        const base = new T.Color(d.material.color.getHex());
        list.forEach(([x, y, z, k], j) => {
          q.setFromAxisAngle(up, hash(j, c) * Math.PI * 2); s.setScalar(k); v.set(x, y, z);
          m4.compose(v, q, s); im.setMatrixAt(j, m4);
          if (!isBark) { cc.copy(base).multiplyScalar(1.55); tintAlien(cc, x, z, j); im.setColorAt(j, cc); }
        });
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        flora.add(im);
      });
    });
    // plantes extraterrestres lumineuses, discrètes : au bord de l'eau et en lisière
    {
      const glowPts = [];
      for (let k = 0; k < 900 && glowPts.length < 170; k++) {
        const x = ZONE.x0 + hash(k, 41) * (ZONE.x1 - ZONE.x0), z = ZONE.z0 + hash(k, 43) * (ZONE.z1 - ZONE.z0);
        const y = groundY(x, z), wc = waterCut(x, z);
        if (y < WATER_Y + 0.25 || near(x, z, built, HEX_R * 0.97)) continue;
        const bank = wc > 0.05 && wc < 2.2, edge = fbm(x / 48 + 3, z / 48 - 7, 4) > 0.5 && fbm(x / 48 + 3, z / 48 - 7, 4) < 0.56;
        if (bank || (edge && hash(k, 47) < 0.4)) glowPts.push([x, y, z, hash(k, 49)]);
      }
      const geo = new T.ConeGeometry(0.35, 1.6, 5); geo.translate(0, 0.8, 0);
      const mats = [new T.MeshStandardMaterial({ color: 0x163c3a, emissive: 0x3fe0d0, emissiveIntensity: 0.9, roughness: 0.6 }),
                    new T.MeshStandardMaterial({ color: 0x2c1a3c, emissive: 0xb07cff, emissiveIntensity: 0.8, roughness: 0.6 })];
      mats.forEach((mat, mi) => {
        const list = glowPts.filter(p => (p[3] < 0.6) === (mi === 0)); if (!list.length) return;
        const im = new T.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, y, z, r], j) => { q.setFromAxisAngle(up, r * 6.28); s.setScalar(0.6 + r * 0.9); v.set(x, y, z); m4.compose(v, q, s); im.setMatrixAt(j, m4); });
        im.userData.own = true; flora.add(im);
      });
    }
    // traces d'anciennes installations : piliers brisés et dalles à moitié enfouis, gagnés par la mousse
    {
      const pieces = [];
      RUINS.forEach(([rx, rz, rr], ri) => {
        if (near(rx, rz, built, HEX_R * 0.97)) return;
        const n = 3 + Math.floor(hash(ri, 51) * 5);
        for (let k = 0; k < n; k++) {
          const a = hash(ri * 13 + k, 53) * 6.28, d = hash(ri * 17 + k, 55) * rr * 0.8, x = rx + Math.cos(a) * d, z = rz + Math.sin(a) * d;
          const pillar = hash(ri, k + 57) < 0.55;
          pieces.push([x, groundY(x, z), z, pillar, hash(ri * 7 + k, 59)]);
        }
      });
      if (pieces.length) {
        const mat = new T.MeshStandardMaterial({ color: 0x8a8f86, roughness: 0.9, metalness: 0.15 });
        const im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, pieces.length);
        const e = new T.Euler(), cc = new T.Color();
        pieces.forEach(([x, y, z, pillar, r], j) => {
          if (pillar) { s.set(1.2 + r, 2 + r * 4.5, 1.2 + r); v.set(x, y + s.y * 0.35, z); e.set((r - 0.5) * 0.35, r * 3, (r - 0.3) * 0.3); }
          else { s.set(4 + r * 4, 0.45, 3 + r * 3); v.set(x, y + 0.05, z); e.set((r - 0.5) * 0.2, r * 6, (r - 0.5) * 0.25); }
          q.setFromEuler(e); m4.compose(v, q, s); im.setMatrixAt(j, m4);
          im.setColorAt(j, cc.setHex(r < 0.4 ? 0x6f8a62 : 0xa6a59c));   // mousse ou béton
        });
        im.castShadow = true; im.receiveShadow = true; im.userData.own = true; flora.add(im);
      }
    }
    // passerelles des chemins au-dessus de l'eau
    {
      const decks = [];
      for (const pa of PATHS) for (let i = 0; i < pa.length - 1; i++) {
        const [x, z] = pa[i]; if (groundY(x, z) < WATER_Y + 0.3) { const [x2, z2] = pa[i + 1]; decks.push([x, z, Math.atan2(z2 - z, x2 - x)]); }
      }
      if (decks.length) {
        const im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), P.M.MAT_ARMOR_LIGHT || P.M.MAT_ARMOR_DARK, decks.length);
        decks.forEach(([x, z, a], j) => { q.setFromAxisAngle(up, -a); s.set(7.5, 0.35, 3.4); v.set(x, 0.05, z); m4.compose(v, q, s); im.setMatrixAt(j, m4); });
        im.castShadow = true; im.receiveShadow = true; im.userData.own = true; flora.add(im);
      }
    }
    P.scene.add(flora);
  }

  function hook() {
    const P = window.Planet3D;
    if (!P || !P.ready || !window.SB3D) return false;
    if (!done) {
      try { done = build(P); } catch (e) { console.warn('[terrain]', e); done = true; return true; }
      const orig = P._rebuild;
      P._rebuild = function () { const r = orig.apply(this, arguments); try { dress(this); } catch (e) { console.warn('[terrain] grille', e); } return r; };
      try { P.sync(true); } catch (e) {}
    }
    return true;
  }
  const t = setInterval(() => { if (hook()) clearInterval(t); }, 500);
  window.SBTerrain = { soilColor, relief, waterCut };
})();
