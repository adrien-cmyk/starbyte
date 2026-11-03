/* Starbyte — Explorer : la clairière aux lapins (03/11/2026, brief d'Adrien, GDD claude/starbyte_GDD_explorer_lapins.md)
   Une boussole transparente, en forme de flèche, indique l'orée de la map. La toucher ouvre LA MÊME CARTE, sans bâtiments
   ni rien d'autre : juste la nature. Dans la clairière : une catapulte à carottes, trois lapins, une caisse de collecte.
   Lancer une carotte → le lapin réagit → il entre dans la caisse → on referme → +5 biomasse.
   - même scène 3D que la planète (Planet3D) : aucun téléchargement, aucun moteur en plus ;
   - la clairière existe vraiment sur la carte (les arbres y sont retirés), elle est donc visible depuis la colonie ;
   - états explicites du lapin et de la caisse, crédit unique par capture (voir capture()) ;
   - sauvegarde : G.explore (heures de retour des lapins, dernières captures, totaux).
   Réservé au compte d'Adrien tant que EXPLORE_PUBLIC est à false : pour les autres joueurs, ce fichier ne touche à rien. */
(function () {
  'use strict';
  const EXPLORE_PUBLIC = false;   // true = ouvert à tous les joueurs (après validation sur iPhone)

  /* ── réglages du prototype (brief §4) : tout le rythme se règle ici ── */
  const CFG = {
    reward: 5,              // biomasse par lapin
    rabbits: 3,             // lapins actifs au maximum
    respawnMs: 30000,       // retour d'un lapin capturé, en temps réel (survit à une sortie)
    throwEvery: 1.0,        // secondes entre deux lancers
    carrotsMax: 3,          // carottes présentes au maximum
    carrotLife: 12,         // secondes au sol
    detect: 16,             // portée de détection d'une carotte
    nibble: 2.6,            // grignotage
    hesitate: 0.75,         // le lapin hésite devant la rampe
    alert: 0.55,            // oreilles dressées avant de partir
    viewSpan: 38,           // largeur de sol visible à l'arrivée
  };

  /* ── la clairière : à la lisière nord de la carte, entre le chemin de terre et la falaise ── */
  const SITE = { x: -30, z: -146 };
  const R = { x: 19, zn: 20, zs: 20 };          // zone où vivent les lapins
  const CUT = { x: 25, zn: 26, zs: 42 };        // zone sans arbres (plus longue au sud : les arbres du premier plan masqueraient le sol)
  const FLAT = { x: 30, zn: 30, zs: 44 };       // zone de sol aplani
  const CRATE = { x: SITE.x + 2, z: SITE.z - 8, hw: 5, hd: 4, door: 3.2, ramp: 3.4 };   // door = demi-largeur de l'ouverture
  const CATA = { x: SITE.x + 12.5, z: SITE.z + 11.5, r: 3.5, scale: 1.25 };
  const ROCKS = [[-13, -7, 1.7], [-7, 9.5, 1.4], [13, -4, 1.8], [-15.5, 6, 1.2], [-3, -15.5, 1.1], [14.5, -13, 1.2]];
  const FLOOR = 0.3;   // hauteur du plancher de la caisse

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // distance normalisée au centre de la clairière (1 = bord de l'ellipse)
  const q = (x, z, E) => { const dx = (x - SITE.x) / E.x, dz = z - SITE.z; const e = dz > 0 ? dz / (E.zs) : dz / (E.zn); return Math.hypot(dx, e); };

  let P = null, T = null, installed = false;
  let Y0 = 0;                        // altitude du sol aplani
  let root = null, wild = null, wildKey = '';
  let active = false, moving = false;
  const hidden = [];
  let saved = null;

  /* ── état sauvegardé ── */
  function S() {
    if (typeof G === 'undefined' || !G) return { respawns: [], ledger: [], caught: 0, secs: 0 };
    if (!G.explore) G.explore = { respawns: [], ledger: [], caught: 0, secs: 0, hintSeen: false, firstDone: false };
    const s = G.explore;
    if (!Array.isArray(s.respawns)) s.respawns = [];
    if (!Array.isArray(s.ledger)) s.ledger = [];
    return s;
  }
  const save = () => { try { if (typeof saveGame === 'function') saveGame(); } catch (e) {} };
  const sfx = (n, d) => { try { if (window.SBSfx) SBSfx.play(n, d); } catch (e) {} };
  const allowed = () => { if (EXPLORE_PUBLIC) return true; try { return typeof _sbDevAllowed === 'function' && _sbDevAllowed(); } catch (e) { return false; } };

  /* ── textes ── */
  function tr(k, vars) { return window.I18N ? I18N.t(k, vars) : k; }
  function addTexts() {
    if (!window.I18N || !I18N.add) return;
    I18N.add('fr', {
      'explore.compass': 'Explorer',
      'explore.compass_back': 'Clairière',
      'explore.aria': 'Explorer la forêt',
      'explore.back': 'Retour à la colonie',
      'explore.hint': 'Lance des carottes pour attirer un lapin dans la caisse. Touche la caisse pour la refermer.',
      'explore.close': 'Refermer',
      'explore.gain': '+{n} biomasse',
      'explore.first': 'Direction la réserve biologique. Les carottes y sont gratuites aussi.',
      'explore.summary': { one: '{n} lapin · +{g} biomasse', other: '{n} lapins · +{g} biomasse' },
    });
  }

  /* ───────────────────────── sol : altitude et retouche de la clairière ───────────────────────── */
  let ground = null, gInfo = null;
  function findGround() {
    P.scene.traverse(o => { if (o.name === 'SB_GROUND_FINE') ground = o; });
    if (!ground) return false;
    const pa = ground.geometry.attributes.position;
    // plan régulier : on retrouve la grille depuis les sommets
    let nx = 0; const z0 = pa.getZ(0); while (nx < pa.count && Math.abs(pa.getZ(nx) - z0) < 1e-3) nx++;
    const nz = Math.round(pa.count / nx);
    gInfo = { nx, nz, x0: pa.getX(0), z0, dx: pa.getX(1) - pa.getX(0), dz: pa.getZ(nx) - z0 };
    return true;
  }
  function heightAt(x, z) {
    const { nx, nz, x0, z0, dx, dz } = gInfo, pa = ground.geometry.attributes.position;
    const fx = clamp((x - x0) / dx, 0, nx - 1.001), fz = clamp((z - z0) / dz, 0, nz - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, k = iz * nx + ix;
    return lerp(lerp(pa.getY(k), pa.getY(k + 1), tx), lerp(pa.getY(k + nx), pa.getY(k + nx + 1), tx), tz);
  }
  function shapeGround() {
    const g = ground.geometry, pa = g.attributes.position, col = g.attributes.color;
    let sum = 0, n = 0;
    for (let i = 0; i < pa.count; i++) if (q(pa.getX(i), pa.getZ(i), R) < 1) { sum += pa.getY(i); n++; }
    Y0 = n ? sum / n : 0.3;
    const MEADOW = [0.33, 0.56, 0.22], MEADOW2 = [0.45, 0.61, 0.24];
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), w = 1 - sstep(0.62, 1.05, q(x, z, FLAT));
      if (w <= 0) continue;
      pa.setY(i, lerp(pa.getY(i), Y0 + (vnoise(x / 9, z / 9) - 0.5) * 0.18, w));
      const c = 1 - sstep(0.7, 1.08, q(x, z, CUT));
      if (c > 0 && col) {
        const m = vnoise(x / 7 + 40, z / 7);
        const base = [lerp(MEADOW[0], MEADOW2[0], m), lerp(MEADOW[1], MEADOW2[1], m), lerp(MEADOW[2], MEADOW2[2], m)];
        col.setXYZ(i, lerp(col.getX(i), base[0], c * 0.85), lerp(col.getY(i), base[1], c * 0.85), lerp(col.getZ(i), base[2], c * 0.85));
      }
    }
    pa.needsUpdate = true; if (col) col.needsUpdate = true;
    g.computeVertexNormals();
  }

  /* ── les arbres quittent la clairière (l'instance garde sa place, on la réduit à zéro) ── */
  function carveList(list) {
    for (const im of list) {
      if (!im.isInstancedMesh || im.userData.sbxCut) continue;
      im.userData.sbxCut = true;
      const a = im.instanceMatrix.array; let ch = false;
      for (let i = 0; i < im.count; i++) {
        const o = i * 16, x = a[o + 12], z = a[o + 14];
        const edge = 1 + (vnoise(x / 6.5, z / 6.5) - 0.5) * 0.26;
        if (q(x, z, CUT) < edge) { for (let j = 0; j < 11; j++) a[o + j] = 0; ch = true; }
      }
      if (ch) im.instanceMatrix.needsUpdate = true;
    }
  }
  function carve() {
    const list = [];
    P.scene.children.forEach(o => {
      if (o.isInstancedMesh && !o.name) list.push(o);
      if (o.name === 'SB_GRID_FLORA') o.children.forEach(c => list.push(c));
    });
    carveList(list);
  }

  /* ───────────────────────── carte « juste la nature » ───────────────────────── */
  const keepTop = o => o === root || o === wild || o.isHemisphereLight || o.isDirectionalLight || o.isPointLight
    || (o.type === 'Object3D') || o.name === 'SB_PLANET_MVP' || o.name === 'SB_GROUND_FINE' || o.name === 'SB_GRID_FLORA' || (o.isInstancedMesh && !o.name);
  function natureOn() {
    hideStragglers();
    // ruines et passerelles de la grille : des traces humaines, à masquer aussi
    P.scene.children.forEach(o => {
      if (o.name !== 'SB_GRID_FLORA') return;
      o.children.forEach(c => { if (c.isInstancedMesh && c.geometry && c.geometry.type === 'BoxGeometry' && c.visible) { c.visible = false; hidden.push(c); } });
    });
    P._lsrc = [];   // plus aucune lampe de bâtiment
    if (P._lightTick) P._lightTick(0, true);
    if (root) root.visible = true;
    if (wild) wild.visible = true;
    if (P.renderer) P.renderer.shadowMap.needsUpdate = true;
  }
  function hideStragglers() { P.scene.children.forEach(o => { if (!keepTop(o) && o.visible) { o.visible = false; hidden.push(o); } }); }
  function natureOff() {
    hidden.splice(0).forEach(o => { o.visible = true; });
    if (root) root.visible = false;
    if (wild) wild.visible = false;
    if (P._poolLights) P._poolLights();
    if (P.renderer) P.renderer.shadowMap.needsUpdate = true;
  }
  // là où se trouvaient les bâtiments, la forêt repousse (cases bâties = aucun arbre dans la carte normale)
  function buildWild() {
    const parcels = (typeof G !== 'undefined' && G.planet && G.planet.parcels) || [];
    const free = new Set(['locked', 'rocky', 'resource', 'depleted', 'antenna_project']);
    const spots = [];
    P.parcelGroup.children.forEach(a => {
      const i = a.userData.parcel; if (i === undefined) return;
      let st = ''; try { st = P._stateOf(i); } catch (e) {}
      if (!free.has(st)) spots.push([a.position.x, a.position.z]);
    });
    const key = spots.map(s => s.join(':')).join('|');
    if (key === wildKey && wild) return;
    wildKey = key;
    if (wild) { P.scene.remove(wild); wild.traverse(o => { if (o.isInstancedMesh && o.dispose) o.dispose(); }); wild = null; }
    wild = new T.Group(); wild.name = 'SB_EXPLORE_WILD'; wild.visible = false;
    const kinds = [[], [], []], HR = 50 / Math.sqrt(3);
    for (const [cx, cz] of spots) {
      for (let gx = cx - HR; gx < cx + HR; gx += 6.5) for (let gz = cz - HR; gz < cz + HR; gz += 6.5) {
        const hx = Math.round(gx * 10), hz = Math.round(gz * 10);
        const x = gx + (hash(hx, hz) - 0.5) * 5.5, z = gz + (hash(hz, hx) - 0.5) * 5.5;
        if (Math.hypot(x - cx, z - cz) > HR * 0.98) continue;
        const y = heightAt(x, z); if (y < -1.6) continue;
        const r = hash(hx + 3, hz - 7);
        const dens = 0.18 + vnoise(x / 26, z / 26) * 0.5;
        if (r < dens) kinds[r < dens * 0.4 ? 0 : (r < dens * 0.75 ? 1 : 2)].push([x, y, z, 0.8 + hash(hx, 11) * 0.5]);
      }
    }
    const VEG = [3, 0, 1];
    const m4 = new T.Matrix4(), qt = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3(), v = new T.Vector3(), cc = new T.Color();
    kinds.forEach((list, k) => {
      const proto = P.kit && P.kit.veg && P.kit.veg[VEG[k]]; if (!proto || !list.length) return;
      proto.traverse(d => {
        if (!d.isMesh) return;
        const bark = d.material.color.getHex() === 0x33261c;
        const im = new T.InstancedMesh(d.geometry, bark ? d.material : d.material.clone(), list.length);
        const base = new T.Color(d.material.color.getHex());
        if (!bark) im.material.color.set(0xffffff);
        list.forEach(([x, y, z, s], j) => {
          qt.setFromAxisAngle(up, hash(j, k) * Math.PI * 2); sc.setScalar(s); v.set(x, y, z); m4.compose(v, qt, sc); im.setMatrixAt(j, m4);
          if (!bark) { cc.copy(base).multiplyScalar(1.5 * (0.85 + hash(j, 9 + k) * 0.3)); im.setColorAt(j, cc); }
        });
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        wild.add(im);
      });
    });
    P.scene.add(wild);
  }

  /* ───────────────────────── modèles (facettes, comme la forêt de la carte) ───────────────────────── */
  function merge(parts) {
    const pos = [], nor = [], col = [];
    parts.forEach(([geo, color, m]) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m); g.computeVertexNormals();
      const c = new T.Color(color), p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
      g.dispose();
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
  }
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
    new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));

  let GEO = null, MAT = null, TEX = null;
  function blobTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 3, 32, 32, 31);
    r.addColorStop(0, 'rgba(0,0,0,.62)'); r.addColorStop(0.6, 'rgba(0,0,0,.34)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }
  function plateTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#20262b'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#f2a93b'; g.fillRect(0, 0, 10, 64);
    g.fillStyle = '#dfe6ea'; g.font = '600 30px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    g.fillText('BIO · 07', 26, 34);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  function beamTexture() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d'), r = g.createLinearGradient(0, 0, 0, 128);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.55, 'rgba(255,255,255,.42)'); r.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = r; g.fillRect(0, 0, 4, 128);
    return new T.CanvasTexture(c);
  }
  function bangTexture() {   // le « ! » du lapin qui a repéré une carotte
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '800 54px "Space Grotesk", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(10,16,20,.85)'; g.lineJoin = 'round'; g.strokeText('!', 32, 35);
    g.fillStyle = '#fff'; g.fillText('!', 32, 35);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  function buildAssets() {
    const ico1 = new T.IcosahedronGeometry(1, 1), ico0 = new T.IcosahedronGeometry(1, 0);
    const box = new T.BoxGeometry(1, 1, 1), cyl = new T.CylinderGeometry(1, 1, 1, 10), cone = new T.ConeGeometry(1, 1, 7);
    const rabbitGeo = (fur, belly, shade) => ({
      body: merge([
        [ico1, fur, M4(0, 1.14, -0.08, 0.12, 0, 0, 1.03, 0.98, 1.42)],
        [ico1, belly, M4(0, 0.96, 0.46, 0.22, 0, 0, 0.74, 0.72, 0.84)],
        [ico1, shade, M4(-0.68, 0.86, -0.62, 0, 0, 0, 0.54, 0.66, 0.82)], [ico1, shade, M4(0.68, 0.86, -0.62, 0, 0, 0, 0.54, 0.66, 0.82)],
        [ico0, 0xfbf8f2, M4(0, 1.26, -1.52, 0, 0, 0, 0.44)],
        [ico0, shade, M4(-0.62, 0.2, -0.42, 0, 0, 0, 0.34, 0.2, 0.74)], [ico0, shade, M4(0.62, 0.2, -0.42, 0, 0, 0, 0.34, 0.2, 0.74)],
        [ico0, belly, M4(-0.4, 0.26, 0.9, 0, 0, 0, 0.24, 0.26, 0.4)], [ico0, belly, M4(0.4, 0.26, 0.9, 0, 0, 0, 0.24, 0.26, 0.4)],
      ]),
      head: merge([
        [ico1, fur, M4(0, 0, 0, 0, 0, 0, 0.88, 0.8, 0.96)],
        [ico1, belly, M4(0, -0.18, 0.54, 0, 0, 0, 0.48, 0.36, 0.46)],
        [ico0, 0xe87a90, M4(0, -0.05, 0.94, 0, 0, 0, 0.13, 0.09, 0.09)],
        [ico0, 0x14100f, M4(-0.56, 0.15, 0.42, 0, 0, 0, 0.16, 0.18, 0.16)], [ico0, 0x14100f, M4(0.56, 0.15, 0.42, 0, 0, 0, 0.16, 0.18, 0.16)],
        [ico0, 0xffffff, M4(-0.6, 0.23, 0.53, 0, 0, 0, 0.05)], [ico0, 0xffffff, M4(0.52, 0.23, 0.53, 0, 0, 0, 0.05)],
      ]),
      ear: merge([
        [ico1, fur, M4(0, 0.98, 0, 0, 0, 0, 0.31, 1.02, 0.14)],
        [ico1, 0xf0a0ac, M4(0, 0.95, 0.09, 0, 0, 0, 0.18, 0.78, 0.07)],
      ]),
    });
    GEO = {
      rabbits: [rabbitGeo(0xf1e7d6, 0xfff9ee, 0xe0d2bb), rabbitGeo(0xd9cfc6, 0xf3ece4, 0xc2b6aa), rabbitGeo(0xe6c9a4, 0xfbeedb, 0xd2b188)],
      carrot: merge([
        [cone, 0xf08a24, M4(0, -0.05, 0, Math.PI, 0, 0, 0.42, 2.2, 0.42)],
        [cone, 0xd9711a, M4(0.02, 0.45, 0.02, Math.PI, 0, 0, 0.3, 1.05, 0.44)],
        [cone, 0x4ea93c, M4(0, 1.45, 0, 0, 0, 0, 0.13, 0.9, 0.13)],
        [cone, 0x3e9433, M4(0.18, 1.3, 0.04, 0, 0, -0.55, 0.12, 0.72, 0.12)],
        [cone, 0x5bb845, M4(-0.17, 1.3, -0.04, 0, 0, 0.55, 0.12, 0.72, 0.12)],
      ]),
    };
    const DARK = 0x2f363c, DARK2 = 0x1d2226, PANEL = 0xe4e9ec, PANEL2 = 0x7fb48e, AMBER = 0xf2a93b, W = CRATE.hw, D = CRATE.hd, HW = 2.4, DW = CRATE.door;
    const zf = D - 0.15;
    const bodyParts = [
      [box, DARK, M4(0, 0.15, 0, 0, 0, 0, W * 2, 0.3, D * 2)],
      [box, 0x8d9aa1, M4(0, 0.31, 0, 0, 0, 0, W * 2 - 0.5, 0.04, D * 2 - 0.5)],
      // murs bas, pour bien voir le lapin
      [box, PANEL, M4(-W + 0.15, 0.3 + HW / 2, 0, 0, 0, 0, 0.3, HW, D * 2)], [box, PANEL, M4(W - 0.15, 0.3 + HW / 2, 0, 0, 0, 0, 0.3, HW, D * 2)],
      [box, PANEL, M4(0, 0.3 + (HW + 0.6) / 2, -D + 0.15, 0, 0, 0, W * 2, HW + 0.6, 0.3)],
      [box, PANEL, M4(-(W + DW) / 2, 0.3 + HW / 2, zf, 0, 0, 0, W - DW, HW, 0.3)], [box, PANEL, M4((W + DW) / 2, 0.3 + HW / 2, zf, 0, 0, 0, W - DW, HW, 0.3)],
      // lisses sombres sur le haut des murs
      [box, DARK, M4(-W + 0.15, 0.3 + HW + 0.05, 0, 0, 0, 0, 0.42, 0.14, D * 2 + 0.1)], [box, DARK, M4(W - 0.15, 0.3 + HW + 0.05, 0, 0, 0, 0, 0.42, 0.14, D * 2 + 0.1)],
      [box, DARK, M4(0, 0.3 + HW + 0.65, -D + 0.15, 0, 0, 0, W * 2 + 0.1, 0.14, 0.42)],
      [box, DARK, M4(-(W + DW) / 2, 0.3 + HW + 0.05, zf, 0, 0, 0, W - DW + 0.1, 0.14, 0.42)], [box, DARK, M4((W + DW) / 2, 0.3 + HW + 0.05, zf, 0, 0, 0, W - DW + 0.1, 0.14, 0.42)],
      // bandes
      [box, PANEL2, M4(-W - 0.01, 1.4, 0, 0, 0, 0, 0.04, 0.5, D * 2 - 0.6)], [box, PANEL2, M4(W + 0.01, 1.4, 0, 0, 0, 0, 0.04, 0.5, D * 2 - 0.6)],
      [box, PANEL2, M4(-W + 0.31, 1.7, 0, 0, 0, 0, 0.02, 0.32, D * 2 - 0.8)], [box, PANEL2, M4(W - 0.31, 1.7, 0, 0, 0, 0, 0.02, 0.32, D * 2 - 0.8)],
      // module de collecte sur le mur du fond
      [box, DARK, M4(-1.4, 4.0, -D + 0.1, 0, 0, 0, 4.4, 1.3, 0.9)],
      [box, DARK2, M4(-1.4, 4.75, -D + 0.1, 0, 0, 0, 3.4, 0.25, 0.6)],
      [cyl, 0x9aa6ac, M4(1.6, 3.9, -D + 0.1, 0, 0, 0, 0.42, 1.5, 0.42)],
      [cyl, DARK, M4(1.6, 4.72, -D + 0.1, 0, 0, 0, 0.5, 0.18, 0.5)],
      // mât du témoin
      [cyl, DARK, M4(W - 0.7, 4.3, -D + 0.5, 0, 0, 0, 0.13, 2.7, 0.13)],
      // charnière de la rampe
      [box, DARK, M4(-DW - 0.06, 0.32, zf + 0.2, 0, 0, 0, 0.3, 0.44, 0.6)], [box, DARK, M4(DW + 0.06, 0.32, zf + 0.2, 0, 0, 0, 0.3, 0.44, 0.6)],
    ];
    GEO.crate = merge(bodyParts);
    const chev = [];
    for (let i = 0; i < 3; i++) {
      const z = 0.75 + i * 0.95;
      chev.push([box, AMBER, M4(-0.62, 0.135, z, 0, 0.78, 0, 1.75, 0.02, 0.26)], [box, AMBER, M4(0.62, 0.135, z, 0, -0.78, 0, 1.75, 0.02, 0.26)]);
    }
    GEO.door = merge([
      [box, DARK, M4(0, 0, CRATE.ramp / 2, 0, 0, 0, DW * 2 - 0.12, 0.26, CRATE.ramp)],
      [box, 0x9aa6ac, M4(0, -0.135, CRATE.ramp / 2, 0, 0, 0, DW * 2 - 0.7, 0.02, CRATE.ramp - 0.6)],
      [box, DARK2, M4(0, 0.13, 0.1, 0, 0, 0, DW * 2 - 0.12, 0.02, 0.2)],
      ...chev,
    ]);
    const WOOD = 0x8a6a44, WOOD2 = 0x6e5234, STEEL = 0x3a4248;
    GEO.cataBase = merge([
      [box, WOOD2, M4(-1.2, 0.3, 0, 0, 0, 0, 0.5, 0.6, 4.4)], [box, WOOD2, M4(1.2, 0.3, 0, 0, 0, 0, 0.5, 0.6, 4.4)],
      [box, WOOD, M4(0, 0.3, 1.8, 0, 0, 0, 2.4, 0.46, 0.46)], [box, WOOD, M4(0, 0.3, -1.8, 0, 0, 0, 2.4, 0.46, 0.46)],
      [box, WOOD, M4(-1.2, 1.35, 0.2, 0, 0, 0, 0.42, 1.9, 0.5)], [box, WOOD, M4(1.2, 1.35, 0.2, 0, 0, 0, 0.42, 1.9, 0.5)],
      [box, WOOD2, M4(-1.2, 1.1, 0.95, -0.72, 0, 0, 0.3, 2.1, 0.3)], [box, WOOD2, M4(1.2, 1.1, 0.95, -0.72, 0, 0, 0.3, 2.1, 0.3)],
      [box, STEEL, M4(0, 2.35, 0.2, 0, 0, 0, 2.86, 0.3, 0.42)],
      [cyl, STEEL, M4(0, 1.5, 0.2, 0, 0, Math.PI / 2, 0.16, 2.9, 0.16)],
    ]);
    GEO.cataArm = merge([
      [box, WOOD, M4(0, 0, -1.55, 0, 0, 0, 0.36, 0.3, 3.5)],
      [cyl, STEEL, M4(0, 0.16, -3.05, 0, 0, 0, 0.62, 0.34, 0.62)],
      [cyl, 0x20262b, M4(0, 0.25, -3.05, 0, 0, 0, 0.46, 0.2, 0.46)],
      [box, STEEL, M4(0, 0, -0.1, 0, 0, 0, 0.5, 0.42, 0.5)],
    ]);
    GEO.dust = new T.IcosahedronGeometry(0.36, 0);
    TEX = { blob: blobTexture(), glow: glowTexture(), plate: plateTexture(), beam: beamTexture(), bang: bangTexture() };
    MAT = {
      fur: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, emissive: 0x2c2a2c, emissiveIntensity: 0.3 }),
      hard: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.28 }),
      veg: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, emissive: 0x201006, emissiveIntensity: 0.3 }),
      blob: new T.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.85 }),
      lamp: new T.MeshBasicMaterial({ color: 0xf2a93b, toneMapped: false }),
      ring: new T.MeshBasicMaterial({ color: 0xd4ffe2, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      beam: new T.MeshBasicMaterial({ map: TEX.beam, color: 0x8dffb0, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false }),
      bang: new T.SpriteMaterial({ map: TEX.bang, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }),
      dust: new T.MeshStandardMaterial({ color: 0xa79a7a, roughness: 1, transparent: true, opacity: 0.8 }),
      target: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      plate: new T.MeshStandardMaterial({ map: TEX.plate, roughness: 0.6 }),
      pad: new T.MeshStandardMaterial({ color: 0x58705f, roughness: 0.7 }),
      padRing: new T.MeshBasicMaterial({ color: 0x8dffb0, transparent: true, opacity: 0.55, toneMapped: false }),
    };
    GEO.blob = new T.CircleGeometry(1, 20); GEO.blob.rotateX(-Math.PI / 2);
    GEO.ring = new T.RingGeometry(0.72, 1, 28); GEO.ring.rotateX(-Math.PI / 2);
  }
  function blob(rx, rz) {
    const m = new T.Mesh(GEO.blob, MAT.blob); m.scale.set(rx, 1, rz); m.position.y = 0.05; m.renderOrder = 1; return m;
  }

  /* ───────────────────────── plateau : obstacles et chemins (A* sur une grille d'une unité) ───────────────────────── */
  const NAV = { n: 56, x0: SITE.x - 28, z0: SITE.z - 28, blocked: null };
  const cellOf = (x, z) => [Math.round(x - NAV.x0), Math.round(z - NAV.z0)];
  const idx = (i, j) => j * NAV.n + i;
  const inInterior = (x, z, m = 0) => Math.abs(x - CRATE.x) <= CRATE.hw - 0.3 - m && z - CRATE.z >= -CRATE.hd + 0.3 + m && z - CRATE.z <= CRATE.hd - 0.3 - m;
  function isBlockedAt(x, z) {
    if (q(x, z, R) > 1.04) return true;
    for (const [dx, dz, r] of ROCKS) if (Math.hypot(x - (SITE.x + dx), z - (SITE.z + dz)) < r + 1.0) return true;
    if (Math.hypot(x - CATA.x, z - CATA.z) < CATA.r + 0.8) return true;
    const lx = x - CRATE.x, lz = z - CRATE.z;
    if (Math.abs(lx) < CRATE.hw + 1.1 && Math.abs(lz) < CRATE.hd + 1.1) {
      const room = Math.abs(lx) <= CRATE.hw - 1.2 && lz >= -CRATE.hd + 1.2 && lz <= CRATE.hd - 1.2;
      const door = Math.abs(lx) <= CRATE.door - 1.1 && lz > 0;
      if (!room && !door) return true;
    }
    return false;
  }
  function buildNav() {
    NAV.blocked = new Uint8Array(NAV.n * NAV.n);
    for (let j = 0; j < NAV.n; j++) for (let i = 0; i < NAV.n; i++) NAV.blocked[idx(i, j)] = isBlockedAt(NAV.x0 + i, NAV.z0 + j) ? 1 : 0;
  }
  function nearestFree(i, j, rad = 4) {
    const ok = (a, b) => a >= 0 && b >= 0 && a < NAV.n && b < NAV.n && !NAV.blocked[idx(a, b)];
    if (ok(i, j)) return [i, j];
    for (let r = 1; r <= rad; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) === r && ok(i + a, j + b)) return [i + a, j + b];
    }
    return null;
  }
  function lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) {
      const [i, j] = cellOf(lerp(ax, bx, k / n), lerp(az, bz, k / n));
      if (i < 0 || j < 0 || i >= NAV.n || j >= NAV.n || NAV.blocked[idx(i, j)]) return false;
    }
    return true;
  }
  // chemin de (ax,az) à (bx,bz), lissé ; null si inaccessible
  function findPath(ax, az, bx, bz) {
    const s = cellOf(ax, az), g = cellOf(bx, bz);
    const st = nearestFree(s[0], s[1], 6), go = nearestFree(g[0], g[1], 3);
    if (!st || !go) return null;
    const N = NAV.n, startK = idx(st[0], st[1]), goalK = idx(go[0], go[1]);
    const gs = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
    const h = (i, j) => { const dx = Math.abs(i - go[0]), dz = Math.abs(j - go[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const open = [startK]; gs[startK] = 0;
    const fs = new Float32Array(N * N).fill(1e9); fs[startK] = h(st[0], st[1]);
    let found = false, guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (fs[open[k]] < fs[open[bi]]) bi = k;
      const cur = open[bi]; open.splice(bi, 1);
      if (cur === goalK) { found = true; break; }
      closed[cur] = 1;
      const ci = cur % N, cj = Math.floor(cur / N);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const ni = ci + a, nj = cj + b;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = idx(ni, nj);
        if (closed[nk] || NAV.blocked[nk]) continue;
        if (a && b && (NAV.blocked[idx(ci + a, cj)] || NAV.blocked[idx(ci, cj + b)])) continue;
        const ng = gs[cur] + (a && b ? 1.414 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; fs[nk] = ng + h(ni, nj); from[nk] = cur; if (!open.includes(nk)) open.push(nk); }
      }
    }
    if (!found) return null;
    const raw = []; for (let k = goalK; k !== -1; k = from[k]) raw.unshift([NAV.x0 + (k % N), NAV.z0 + Math.floor(k / N)]);
    const out = []; let anchor = [ax, az], i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !lineFree(anchor[0], anchor[1], raw[j][0], raw[j][1])) j--;
      out.push(raw[j]); anchor = raw[j]; i = j + 1;
    }
    return out;
  }

  /* ───────────────────────── scène de la clairière ───────────────────────── */
  const W = { t: 0, rabbits: [], carrots: [], dust: [], crate: null, cata: null, nextThrow: 0, seq: 0, sessionCaught: 0, enteredAt: 0, respawnChk: 0 };
  function buildScene() {
    buildAssets();
    root = new T.Group(); root.name = 'SB_EXPLORE'; root.visible = false;
    root.position.y = 0;
    // caisse
    const cg = new T.Group(); cg.position.set(CRATE.x, Y0, CRATE.z);
    const body = new T.Mesh(GEO.crate, MAT.hard); body.castShadow = true; body.receiveShadow = true; cg.add(body);
    const pl = new T.Mesh(new T.PlaneGeometry(2.8, 0.7), MAT.plate); pl.position.set(-1.4, 1.9, -CRATE.hd + 0.32); cg.add(pl);
    // plot d'appât : un disque vert discret au fond de la caisse, là où la carotte attend
    const pad = new T.Mesh(new T.CircleGeometry(1.75, 24), MAT.pad); pad.rotation.x = -Math.PI / 2; pad.position.set(0, FLOOR + 0.07, -1.5); cg.add(pad);
    const padR = new T.Mesh(new T.RingGeometry(1.62, 1.8, 28), MAT.padRing); padR.rotation.x = -Math.PI / 2; padR.position.set(0, FLOOR + 0.08, -1.5); cg.add(padR);
    const hinge = new T.Group(); hinge.position.set(0, FLOOR - 0.12, CRATE.hd); cg.add(hinge);
    const door = new T.Mesh(GEO.door, MAT.hard); door.castShadow = true; door.receiveShadow = true; hinge.add(door);
    const lamp = new T.Mesh(new T.IcosahedronGeometry(0.42, 1), MAT.lamp); lamp.position.set(CRATE.hw - 0.7, 5.85, -CRATE.hd + 0.5); cg.add(lamp);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xf2a93b, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    halo.position.copy(lamp.position); halo.scale.setScalar(3.4); cg.add(halo);
    const ringG = new T.Group();
    { // contour discret autour de la caisse
      const w = CRATE.hw + 0.34, d = CRATE.hd + 0.34, t = 0.16, y = 3.02;
      for (const [x, z, sx, sz] of [[0, -d, w * 2 + t, t], [0, d, w * 2 + t, t], [-w, 0, t, d * 2], [w, 0, t, d * 2]]) {
        const m = new T.Mesh(new T.PlaneGeometry(1, 1), MAT.ring); m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.position.set(x, y, z); m.renderOrder = 3; ringG.add(m);
      }
    }
    cg.add(ringG);
    const beam = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 26, 18, 1, true), MAT.beam); beam.position.set(0, 13, 0); beam.visible = false; beam.renderOrder = 4; cg.add(beam);
    root.add(cg);
    W.crate = { st: 'open', t: 0, angle: 0, hinge, lamp, halo, ringG, beam, group: cg, promptOn: false, occupant: null };
    // catapulte
    const ca = new T.Group(); ca.position.set(CATA.x, Y0, CATA.z);
    const yawG = new T.Group(); yawG.scale.setScalar(CATA.scale); ca.add(yawG);
    const base = new T.Mesh(GEO.cataBase, MAT.hard); base.castShadow = true; base.receiveShadow = true; yawG.add(base);
    const armP = new T.Group(); armP.position.set(0, 1.5, 0.2); yawG.add(armP);
    const arm = new T.Mesh(GEO.cataArm, MAT.hard); arm.castShadow = true; armP.add(arm);
    const loaded = new T.Mesh(GEO.carrot, MAT.veg); loaded.scale.setScalar(0.62); loaded.rotation.set(Math.PI / 2.3, 0, 0.4); loaded.position.set(0, 0.62, -3.05); armP.add(loaded);
    const cb = blob(3.9, 4.3); ca.add(cb);
    yawG.rotation.y = Math.atan2(CRATE.x - CATA.x, CRATE.z - CATA.z);
    armP.rotation.x = -0.34;
    root.add(ca);
    W.cata = { group: ca, yawG, armP, loaded, yaw: yawG.rotation.y, yawT: yawG.rotation.y, fire: 1, rest: -0.34 };
    // rochers (ceux de la carte) et petites touffes, pour que la clairière ne soit pas nue
    const rockP = P.kit && P.kit.veg && P.kit.veg[4];
    if (rockP) ROCKS.forEach(([dx, dz, r], i) => {
      const m = rockP.clone(true); m.position.set(SITE.x + dx, Y0 - 0.2, SITE.z + dz); m.rotation.y = i * 1.7; m.scale.setScalar(r * 0.5);
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); root.add(m);
    });
    { // herbes hautes et buissons bas sur le pourtour (rien qui masque les lapins)
      const bushP = P.kit && P.kit.veg && P.kit.veg[2], list = [];
      for (let k = 0; k < 340 && list.length < 30; k++) {
        const a = hash(k, 3) * Math.PI * 2, rr = 0.98 + hash(k, 5) * 0.32, x = SITE.x + Math.cos(a) * (R.x + 2) * rr, dz = Math.sin(a) * (dzFor(a) + 2) * rr, z = SITE.z + dz;
        if (q(x, z, CUT) > 1.02) continue;
        list.push([x, Y0 - 0.1, z, 0.55 + hash(k, 7) * 0.5]);
      }
      if (bushP && list.length) {
        const m4 = new T.Matrix4(), qt = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3(), v = new T.Vector3();
        bushP.traverse(d => {
          if (!d.isMesh) return;
          const im = new T.InstancedMesh(d.geometry, d.material, list.length);
          list.forEach(([x, y, z, s], j) => { qt.setFromAxisAngle(up, hash(j, 21) * 6.28); sc.setScalar(s); v.set(x, y, z); m4.compose(v, qt, sc); im.setMatrixAt(j, m4); });
          im.castShadow = true; im.receiveShadow = true; root.add(im);
        });
      }
    }
    { // fleurs et touffes : du détail au sol, sans ombre, en une seule passe chacune
      const m4 = new T.Matrix4(), qt = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3(), v = new T.Vector3(), cc = new T.Color();
      const clearOf = (x, z) => !(Math.abs(x - CRATE.x) < CRATE.hw + 0.6 && z - CRATE.z > -CRATE.hd - 0.6 && z - CRATE.z < CRATE.hd + CRATE.ramp + 0.6) && Math.hypot(x - CATA.x, z - CATA.z) > CATA.r;
      const grass = [], flowers = [];
      for (let k = 0; k < 2600 && (grass.length < 300 || flowers.length < 150); k++) {
        const x = SITE.x + (hash(k, 61) - 0.5) * CUT.x * 2, z = SITE.z - CUT.zn + hash(k, 63) * (CUT.zn + CUT.zs);
        if (q(x, z, CUT) > 0.98 || !clearOf(x, z)) continue;
        const patch = vnoise(x / 9 + 7, z / 9 - 3);
        if (hash(k, 67) < 0.5 && grass.length < 300) grass.push([x, z, k]);
        else if (patch > 0.52 && flowers.length < 150) flowers.push([x, z, k]);
      }
      const gg = new T.ConeGeometry(0.2, 1.05, 4); gg.translate(0, 0.5, 0);
      const gm = new T.InstancedMesh(gg, new T.MeshStandardMaterial({ roughness: 0.9 }), grass.length);
      grass.forEach(([x, z, k], j) => { qt.setFromAxisAngle(up, hash(k, 71) * 6.28); sc.set(1, 0.6 + hash(k, 73) * 0.9, 1); v.set(x, Y0, z); m4.compose(v, qt, sc); gm.setMatrixAt(j, m4); gm.setColorAt(j, cc.setHex(hash(k, 75) < 0.5 ? 0x6f9c3f : 0x8bb04a)); });
      gm.receiveShadow = true; root.add(gm);
      const fg = new T.IcosahedronGeometry(0.2, 0); fg.translate(0, 0.42, 0);
      const fm = new T.InstancedMesh(fg, new T.MeshStandardMaterial({ roughness: 0.7, emissive: 0x151515 }), flowers.length);
      const FL = [0xf5ecd2, 0xf2d24a, 0xb48be8, 0xf2f2f6];
      flowers.forEach(([x, z, k], j) => { sc.setScalar(0.8 + hash(k, 77) * 0.8); qt.identity(); v.set(x, Y0, z); m4.compose(v, qt, sc); fm.setMatrixAt(j, m4); fm.setColorAt(j, cc.setHex(FL[Math.floor(hash(k, 79) * 4)])); });
      root.add(fm);
    }
    // cible du lancer
    W.target = new T.Mesh(GEO.ring, MAT.target); W.target.visible = false; W.target.renderOrder = 2; root.add(W.target);
    P.scene.add(root);
  }
  const dzFor = a => (Math.sin(a) > 0 ? R.zs : R.zn);

  /* ── lapin ── */
  function makeRabbit(kind) {
    const g = GEO.rabbits[kind % GEO.rabbits.length];
    const rootG = new T.Group();
    const bodyP = new T.Group(); rootG.add(bodyP);
    const body = new T.Mesh(g.body, MAT.fur); body.castShadow = false; bodyP.add(body);
    const head = new T.Group(); head.position.set(0, 1.94, 1.02); bodyP.add(head);
    const hm = new T.Mesh(g.head, MAT.fur); head.add(hm);
    const earL = new T.Group(), earR = new T.Group();
    earL.position.set(-0.36, 0.5, -0.14); earR.position.set(0.36, 0.5, -0.14);
    earL.add(new T.Mesh(g.ear, MAT.fur)); earR.add(new T.Mesh(g.ear, MAT.fur));
    earL.rotation.z = 0.14; earR.rotation.z = -0.14;
    head.add(earL, earR);
    const sh = blob(1.5, 2.1); rootG.add(sh);
    const bang = new T.Sprite(MAT.bang); bang.position.set(0, 5.2, 0.6); bang.scale.setScalar(0.01); bang.visible = false; bang.renderOrder = 6; rootG.add(bang);
    rootG.scale.setScalar(1.06);
    root.add(rootG);
    const r = {
      uid: 'L' + Date.now().toString(36) + '-' + (W.seq++) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      g: rootG, bodyP, head, earL, earR, sh, bang, x: 0, z: 0, yaw: Math.random() * 6.28, yawT: 0,
      st: 'wander', timer: 1 + Math.random() * 2, path: null, hop: null, wait: 0, carrot: null, enter: false, land: 0,
      earT: 0, earUp: 0, look: 0, t0: Math.random() * 10, chk: Math.random() * 0.3, gone: false, wasIn: false,
    };
    r.yawT = r.yaw;
    W.rabbits.push(r);
    return r;
  }
  function placeRabbit(r, x, z) { r.x = x; r.z = z; r.g.position.set(x, Y0, z); }
  function randomWander(fromX, fromZ, far) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.28, d = far ? Math.random() * 12 + 2 : 3 + Math.random() * 8;
      const x = (fromX == null ? SITE.x : fromX) + Math.cos(a) * d, z = (fromZ == null ? SITE.z : fromZ) + Math.sin(a) * d;
      if (q(x, z, R) > 0.92 || isBlockedAt(x, z) || inInterior(x, z, -1.4) || onRamp(x, z, 1)) continue;
      return [x, z];
    }
    return [SITE.x - 6, SITE.z + 4];
  }
  const onRamp = (x, z, m = 0) => Math.abs(x - CRATE.x) < CRATE.door + m && z - CRATE.z >= CRATE.hd - 0.2 - m && z - CRATE.z <= CRATE.hd + CRATE.ramp + m;
  const frontOfRamp = () => [CRATE.x, CRATE.z + CRATE.hd + CRATE.ramp + 1.6];
  // entièrement à l'intérieur : tout le corps du lapin a passé le seuil
  const fullyIn = r => Math.abs(r.x - CRATE.x) <= CRATE.hw - 1.1 && r.z - CRATE.z >= -CRATE.hd + 0.5 && r.z - CRATE.z <= CRATE.hd - 2.0;
  const inDoorway = r => Math.abs(r.x - CRATE.x) < CRATE.door + 0.6 && r.z - CRATE.z > CRATE.hd - 2.0 && r.z - CRATE.z < CRATE.hd + CRATE.ramp + 0.8;

  function startHop(r, x1, z1, dur, h) {
    r.hop = { t: 0, dur, x0: r.x, z0: r.z, x1, z1, h };
    if (Math.hypot(x1 - r.x, z1 - r.z) > 0.05) r.yawT = Math.atan2(x1 - r.x, z1 - r.z);
  }
  // avance d'un bond le long du chemin ; vrai quand le chemin est terminé
  function followPath(r, step, dur, h, pause, stopAt) {
    if (r.hop || r.wait > 0) return false;
    if (!r.path || !r.path.length) return true;
    if (stopAt && Math.hypot(stopAt[0] - r.x, stopAt[1] - r.z) <= stopAt[2]) { r.path = null; return true; }
    let wp = r.path[0], d = Math.hypot(wp[0] - r.x, wp[1] - r.z);
    while (d < 0.3 && r.path.length > 1) { r.path.shift(); wp = r.path[0]; d = Math.hypot(wp[0] - r.x, wp[1] - r.z); }
    if (d < 0.3) { r.path = null; return true; }
    let L = Math.min(step, d);
    if (stopAt) { const ds = Math.hypot(stopAt[0] - r.x, stopAt[1] - r.z); if (ds - stopAt[2] < L && r.path.length === 1) L = Math.max(0.25, ds - stopAt[2]); }
    let x1 = r.x + (wp[0] - r.x) / d * L, z1 = r.z + (wp[1] - r.z) / d * L;
    // on ne se marche pas dessus (sauf en fin de course : un voisin ne doit jamais empêcher d'arriver)
    if (d > 3.2) for (const o of W.rabbits) {
      if (o === r || o.gone) continue;
      const od = Math.hypot(o.x - x1, o.z - z1);
      if (od < 2.6 && od > 0.01 && !inInterior(x1, z1)) {
        const nx = x1 + (x1 - o.x) / od * (2.6 - od) * 0.6, nz = z1 + (z1 - o.z) / od * (2.6 - od) * 0.6;
        if (!isBlockedAt(nx, nz)) { x1 = nx; z1 = nz; }
      }
    }
    startHop(r, x1, z1, dur, h);
    r.wait = pause;
    return false;
  }
  function releaseCarrot(r) { if (r.carrot) { r.carrot.res = null; r.carrot = null; } }
  function toWander(r, delay) {
    releaseCarrot(r); r.st = 'wander'; r.path = null; r.enter = false; r.timer = delay == null ? 0.6 + Math.random() * 1.8 : delay;
  }
  function seekCarrot(r) {
    let best = null, bd = 1e9;
    for (const c of W.carrots) {
      if (c.state !== 'ground' || c.res) continue;
      // un seul lapin dans la caisse à la fois
      if (c.inCrate && W.rabbits.some(o => o !== r && !o.gone && (fullyIn(o) || inDoorway(o) || (o.carrot && o.carrot.inCrate)))) continue;
      const d = Math.hypot(c.x - r.x, c.z - r.z);
      if (d < CFG.detect && d < bd) { bd = d; best = c; }
    }
    if (!best) return false;
    best.res = r; r.carrot = best; r.st = 'alert'; r.timer = CFG.alert; r.path = null;
    r.yawT = Math.atan2(best.x - r.x, best.z - r.z);
    startHop(r, r.x, r.z, 0.2, 0.42);   // petit sursaut à la découverte
    r.bangT = 0.75; r.bang.visible = true;
    return true;
  }
  function pathToCarrot(r) {
    const c = r.carrot; if (!c) return false;
    if (c.inCrate) {
      const f = frontOfRamp();
      if (fullyIn(r) || inDoorway(r)) { r.enter = false; r.path = [[c.x, Math.min(c.z + 1.75, CRATE.z + 2)]]; return true; }
      const p = findPath(r.x, r.z, f[0], f[1]);
      if (!p) return false;
      p.push(f); r.path = p; r.enter = true;
      return true;
    }
    const p = findPath(r.x, r.z, c.x, c.z);
    if (!p) return false;
    r.path = p; r.enter = false;
    return true;
  }

  function rabbitTick(r, dt) {
    if (r.gone) return;
    r.t0 += dt;
    // bond en cours
    if (r.hop) {
      const H = r.hop; H.t += dt; const k = Math.min(1, H.t / H.dur);
      r.x = lerp(H.x0, H.x1, k); r.z = lerp(H.z0, H.z1, k);
      const arc = Math.sin(Math.PI * k);
      r.bodyP.position.y = H.h * arc;
      r.bodyP.rotation.x = lerp(-0.42, 0.34, k) * arc;
      const st = 1 + 0.14 * arc; r.bodyP.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
      r.earT = -0.55 * arc;
      r.sh.scale.set(1.5 * (1 - 0.3 * arc), 1, 2.1 * (1 - 0.3 * arc));
      if (k >= 1) { r.hop = null; r.land = 0.13; r.bodyP.position.y = 0; r.bodyP.rotation.x = 0; }
    } else {
      if (r.wait > 0) r.wait -= dt;
      if (r.land > 0) {
        r.land -= dt; const s = Math.max(0, r.land / 0.13), sq = 1 - 0.18 * s; r.bodyP.scale.set(1 + 0.11 * s, sq, 1 + 0.11 * s);
      } else {
        const br = 1 + Math.sin(r.t0 * 3.1) * 0.012; r.bodyP.scale.set(1, br, 1);
      }
      r.sh.scale.set(1.5, 1, 2.1);
    }
    // personne ne franchit le seuil pendant que la porte bouge
    if (W.crate.st !== 'open' && r.st !== 'captured' && r.st !== 'kicked' && !r.hop && (inInterior(r.x, r.z, -0.6) || inDoorway(r))) r.wait = Math.max(r.wait, 0.1);
    // cerveau (état explicite : promenade → attiré → déplacement → grignotage, ou dans la caisse → capturé)
    r.chk -= dt;
    switch (r.st) {
      case 'wander': {
        if (r.chk <= 0) { r.chk = 0.22; if (seekCarrot(r)) break; }
        r.earUp = 0;
        if (!r.path) {
          r.timer -= dt;
          if (r.timer <= 0) {
            const t = randomWander(r.x, r.z); const p = findPath(r.x, r.z, t[0], t[1]);
            if (p) r.path = p; else r.timer = 0.6;
          }
        } else if (followPath(r, 1.55, 0.3, 0.72, 0.16 + Math.random() * 0.24)) {
          r.path = null; r.timer = 1 + Math.random() * 3.2;
        }
        break;
      }
      case 'alert': {
        r.earUp = 1; r.timer -= dt;
        if (!r.carrot) { toWander(r); break; }
        r.look = sstep(0, 0.2, CFG.alert - r.timer);
        if (r.timer <= 0) {
          if (pathToCarrot(r)) { r.st = 'move'; } else { toWander(r); }
        }
        break;
      }
      case 'move': {
        r.earUp = 0.6;
        const c = r.carrot;
        if (!c) { toWander(r); break; }
        if (c.inCrate && !r.enter && W.crate.st !== 'open' && !fullyIn(r)) { r.earUp = 0.85; r.wait = Math.max(r.wait, 0.1); break; }   // porte fermée : il attend
        const stop = r.enter ? null : [c.x, c.z, 1.75];
        const done = followPath(r, 2.5, 0.3, 1.02, 0.09, stop);
        if (done && !r.hop) {
          if (r.enter) { r.st = 'hesitate'; r.timer = CFG.hesitate; r.yawT = Math.PI; }
          else { r.st = 'nibble'; r.timer = CFG.nibble; r.yawT = Math.atan2(c.x - r.x, c.z - r.z); c.nibbled = true; }
        }
        break;
      }
      case 'hesitate': {  // devant la rampe : il renifle, il hésite… puis il entre
        const c = r.carrot; if (!c) { toWander(r); break; }
        r.earUp = 0.85;
        r.timer -= dt;
        if (r.timer <= 0 && W.crate.st === 'open') {
          r.enter = false; r.st = 'move';
          r.path = [[CRATE.x, CRATE.z + CRATE.hd], [c.x, Math.min(c.z + 1.75, CRATE.z + 2)]];
          r.yawT = Math.atan2(c.x - r.x, c.z - r.z);
        }
        break;
      }
      case 'nibble': {
        const c = r.carrot; if (!c) { toWander(r); break; }
        r.earUp = 0.3;
        r.timer -= dt;
        c.eaten = 1 - clamp(r.timer / CFG.nibble, 0, 1);
        if (Math.floor(r.t0 * 5) !== Math.floor((r.t0 - dt) * 5)) sfx('exNibble');
        if (r.timer <= 0) { removeCarrot(c, true); r.carrot = null; r.st = 'wander'; r.timer = 0.7; r.path = null; }
        break;
      }
      case 'kicked': { r.earUp = 1; if (!r.hop) { r.st = 'wander'; r.timer = 0.5; } break; }
      case 'captured': {
        r.timer += dt; const k = clamp(r.timer / 1.25, 0, 1), e = k * k;
        r.bodyP.position.y = e * 15; r.bodyP.rotation.z = Math.sin(r.timer * 7) * 0.1;
        r.earT = 0.7; r.sh.scale.set(1.5 * (1 - k), 1, 2.1 * (1 - k));
        const s = 1 - 0.25 * e; r.bodyP.scale.setScalar(s);
        if (k >= 1) { r.gone = true; root.remove(r.g); }
        break;
      }
    }
    if (r.bangT > 0) {
      r.bangT -= dt; const a = 0.75 - r.bangT, sz = (a < 0.1 ? a / 0.1 * 2.3 : 1.9) * (r.bangT < 0.12 ? r.bangT / 0.12 : 1);
      r.bang.scale.setScalar(Math.max(0.01, sz)); r.bang.position.y = 5 + r.bodyP.position.y;
      if (r.bangT <= 0) r.bang.visible = false;
    }
    // pose : hauteur (plancher de la caisse), orientation, tête, oreilles
    const floor = inInterior(r.x, r.z) ? FLOOR : (onRamp(r.x, r.z) ? FLOOR * 0.55 : 0);
    r.g.position.set(r.x, Y0 + floor, r.z);
    let dy = r.yawT - r.yaw; while (dy > Math.PI) dy -= 6.2832; while (dy < -Math.PI) dy += 6.2832;
    r.yaw += dy * Math.min(1, dt * 11); r.g.rotation.y = r.yaw;
    const nib = r.st === 'nibble', sniff = r.st === 'hesitate' || (r.st === 'wander' && !r.path && !r.hop);
    const hx = nib ? 0.62 + Math.sin(r.t0 * 21) * 0.08 : sniff ? 0.12 + Math.max(0, Math.sin(r.t0 * 9)) * Math.max(0, Math.sin(r.t0 * 0.9)) * 0.14 : (r.hop ? -0.1 : 0);
    r.head.rotation.x += (hx - r.head.rotation.x) * Math.min(1, dt * 13);
    r.head.position.y = 1.94 - (nib ? 0.5 : 0);
    r.head.position.z = 1.02 + (nib ? 0.2 : 0);
    if (!r.hop && r.st !== 'captured') r.earT = lerp(-0.34, 0.02, r.earUp);
    const tw = (r.earUp < 0.5 && Math.sin(r.t0 * 1.3 + r.g.id) > 0.97) ? 0.32 : 0;   // oreille qui frémit
    r.earL.rotation.x += (r.earT - r.earL.rotation.x) * Math.min(1, dt * 12);
    r.earR.rotation.x += (r.earT - tw - r.earR.rotation.x) * Math.min(1, dt * 12);
    r.earL.rotation.z = 0.14 + (1 - r.earUp) * 0.1; r.earR.rotation.z = -0.14 - (1 - r.earUp) * 0.1;
    r.wasIn = fullyIn(r);
  }

  /* ── carottes ── */
  function throwCarrot(tx, tz, inCrate) {
    if (W.t < W.nextThrow) return false;
    const live = W.carrots.filter(c => c.state !== 'dead');
    if (live.length >= CFG.carrotsMax) {
      const old = live.filter(c => !c.res && c.state === 'ground').sort((a, b) => a.born - b.born)[0];
      if (!old) return false;
      removeCarrot(old);
    }
    W.nextThrow = W.t + CFG.throwEvery;
    const y1 = Y0 + (inCrate ? FLOOR + 0.3 : 0.3);
    const dist = Math.hypot(tx - CATA.x, tz - CATA.z);
    const m = new T.Mesh(GEO.carrot, MAT.veg); m.scale.setScalar(1.25); m.castShadow = false;
    const sh = blob(1.05, 1.05); sh.position.set(tx, y1 - 0.25, tz);
    const c = { x: tx, z: tz, y1, x0: CATA.x, z0: CATA.z, y0: Y0 + 4.4, t: 0, dur: 0.46 + dist * 0.012, h: 5 + dist * 0.2, mesh: m, sh, state: 'fly', born: W.t, res: null, inCrate: !!inCrate, eaten: 0, nibbled: false, spin: 6 + Math.random() * 3, rz: 1.25 + Math.random() * 0.25, ry: Math.random() * 6.28 };
    m.position.set(c.x0, c.y0, c.z0);
    root.add(m, sh);
    W.carrots.push(c);
    // catapulte
    const ca = W.cata; ca.yawT = Math.atan2(tx - CATA.x, tz - CATA.z); ca.fire = 0;
    ca.loaded.visible = false;
    sfx('exThrow');
    // repère au sol, pour confirmer le toucher tout de suite
    W.target.position.set(tx, y1 - 0.2, tz); W.target.visible = true; W.target.scale.setScalar(0.6); W.targetT = 0;
    return true;
  }
  function removeCarrot(c, eaten) {
    if (c.state === 'dead') return;
    c.state = 'dead';
    if (c.res) { const r = c.res; c.res = null; if (r.carrot === c) { r.carrot = null; if (!eaten && r.st !== 'captured') toWander(r); } }
    root.remove(c.mesh); root.remove(c.sh);
    W.carrots = W.carrots.filter(x => x !== c);
  }
  function carrotTick(c, dt) {
    if (c.state === 'fly') {
      c.t += dt; const k = Math.min(1, c.t / c.dur);
      c.mesh.position.set(lerp(c.x0, c.x, k), lerp(c.y0, c.y1, k) + c.h * 4 * k * (1 - k), lerp(c.z0, c.z, k));
      c.mesh.rotation.set(c.t * c.spin, c.ry, c.t * c.spin * 0.6);
      const s = 0.45 + 0.55 * k; c.sh.scale.set(1.05 * s, 1, 1.05 * s); c.sh.material = MAT.blob;
      if (k >= 1) {
        c.state = 'ground'; c.landed = W.t; c.bounce = 0;
        c.mesh.position.set(c.x, c.y1, c.z); c.mesh.rotation.set(0, c.ry, c.rz);
        sfx('exLand'); puff(c.x, c.y1, c.z);
      }
      return;
    }
    // sur le sol : petit rebond, puis il attend
    const a = W.t - c.landed;
    if (a < 0.26) c.mesh.position.y = c.y1 + Math.abs(Math.sin(a / 0.26 * Math.PI)) * 0.55 * (1 - a / 0.26);
    else c.mesh.position.y = c.y1;
    const left = CFG.carrotLife - a;
    let s = 1.25 * (1 - c.eaten * 0.72);
    if (!c.nibbled && left < 1.2) s *= Math.max(0.05, left / 1.2);
    c.mesh.scale.setScalar(s);
    if (!c.nibbled && left <= 0) removeCarrot(c);
  }
  function puff(x, y, z) {
    for (let i = 0; i < 4; i++) {
      const m = new T.Mesh(GEO.dust, MAT.dust); const a = i * 1.57 + Math.random();
      m.position.set(x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3); m.scale.setScalar(0.6);
      root.add(m); W.dust.push({ m, vx: Math.cos(a) * 2.2, vz: Math.sin(a) * 2.2, vy: 1.8 + Math.random(), t: 0, life: 0.34 });
    }
  }

  /* ── caisse : ouverte → fermeture → capture validée ou fermeture à vide → réouverture ── */
  const LAMP = { idle: 0xf2a93b, ready: 0xe9fff0, ok: 0x4dff7e, empty: 0xff7a3a };
  function setLamp(hex) { W.crate.lamp.material.color.setHex(hex); W.crate.halo.material.color.setHex(hex); }
  function closeDoor() {
    const K = W.crate;
    if (K.st !== 'open') return false;   // un seul verrouillage à la fois : les touchers rapides ne font rien de plus
    K.st = 'closing'; K.t = 0;
    sfx('exDoor');
    // la rampe qui se relève envoie promener celui qui est dessus ou à cheval sur le seuil (il reste dehors)
    for (const r of W.rabbits) {
      if (r.gone || r.st === 'captured' || fullyIn(r) || !inDoorway(r)) continue;
      releaseCarrot(r); r.path = null; r.hop = null; r.st = 'kicked';
      const a = (Math.random() - 0.5) * 1.1, d = 5.5;
      let x1 = r.x + Math.sin(a) * d, z1 = CRATE.z + CRATE.hd + CRATE.ramp + 1.2 + Math.cos(a) * 3.5;
      if (isBlockedAt(x1, z1)) { x1 = CRATE.x; z1 = CRATE.z + CRATE.hd + CRATE.ramp + 3; }
      startHop(r, x1, z1, 0.5, 2.8); r.yawT = r.yaw;
    }
    return true;
  }
  function crateTick(dt) {
    const K = W.crate;
    K.t += dt;
    if (K.st === 'closing') {
      const k = Math.min(1, K.t / 0.24); K.angle = (k * k) * (Math.PI / 2);
      if (k >= 1) { // verrouillage : c'est ICI que tout se décide
        puff(CRATE.x - 2, Y0 + 0.4, CRATE.z + CRATE.hd + 0.6); puff(CRATE.x + 2, Y0 + 0.4, CRATE.z + CRATE.hd + 0.6);
        const inside = W.rabbits.find(r => !r.gone && r.st !== 'captured' && fullyIn(r));
        if (!(inside && capture(inside))) { K.st = 'empty'; K.t = 0; setLamp(LAMP.empty); sfx('exEmpty'); }
      }
    } else if (K.st === 'locked' || K.st === 'empty') {
      // deux petits rebonds de la porte
      const a = K.t, bounce = a < 0.22 ? Math.abs(Math.sin(a / 0.22 * Math.PI)) * 0.07 * (1 - a / 0.22) : 0;
      K.angle = Math.PI / 2 - bounce;
      const hold = K.st === 'locked' ? 1.75 : 0.42;
      if (K.st === 'locked') {
        const b = clamp(a / 0.25, 0, 1) * clamp((1.5 - a) / 0.3, 0, 1);
        K.beam.visible = b > 0; MAT.beam.opacity = b * 0.34 * (0.85 + Math.sin(a * 14) * 0.15);
      }
      if (a >= hold) { K.st = 'reopen'; K.t = 0; K.beam.visible = false; }
    } else if (K.st === 'reopen') {
      const k = Math.min(1, K.t / 0.42), e = 1 - (1 - k) * (1 - k); K.angle = (1 - e) * (Math.PI / 2);
      if (k >= 1) { K.st = 'open'; K.angle = 0; setLamp(LAMP.idle); sfx('exLand'); }
    }
    K.hinge.rotation.x = -K.angle;
    // occasion de capture : contour et libellé « Refermer »
    const ready = K.st === 'open' && W.rabbits.some(r => !r.gone && r.st !== 'captured' && fullyIn(r));
    if (ready !== K.promptOn) { K.promptOn = ready; if (K.st === 'open') setLamp(ready ? LAMP.ready : LAMP.idle); if (ready) sfx('exReady'); showPrompt(ready); }
    const pulse = ready ? 0.5 + Math.sin(W.t * 7) * 0.25 : 0;
    MAT.ring.opacity += (pulse - MAT.ring.opacity) * Math.min(1, dt * 12);
    K.ringG.visible = MAT.ring.opacity > 0.01;
    K.halo.material.opacity = ready ? 0.75 + Math.sin(W.t * 7) * 0.2 : (K.st === 'locked' ? 0.9 : 0.42);
  }

  /* ── capture : le crédit passe par ici et nulle part ailleurs ── */
  function capture(r) {
    const K = W.crate, s = S();
    if (r.st === 'captured' || r.gone) return false;
    if (s.ledger.includes(r.uid)) return false;   // jamais deux fois la même capture
    K.st = 'locked'; K.t = 0; setLamp(LAMP.ok);
    releaseCarrot(r);
    W.carrots.filter(c => c.inCrate).forEach(c => removeCarrot(c));
    r.st = 'captured'; r.timer = 0; r.path = null; r.hop = null; r.earUp = 0;
    K.beam.position.x = r.x - CRATE.x; K.beam.position.z = r.z - CRATE.z;
    // +5 dans la vraie biomasse. Pas de plafond ici : le gain affiché reste exact (règle du surplus, comme une cargaison livrée)
    if (typeof G !== 'undefined' && G.res && G.res.biomass) G.res.biomass.v = (G.res.biomass.v || 0) + CFG.reward;
    s.ledger.push(r.uid); if (s.ledger.length > 24) s.ledger.splice(0, s.ledger.length - 24);
    s.caught = (s.caught || 0) + 1; W.sessionCaught++;
    s.respawns.push(Date.now() + CFG.respawnMs);
    const first = !s.firstDone; s.firstDone = true;
    save();
    sfx('exLock'); sfx('exOk', 0.12);
    showGain(first);
    return true;
  }

  /* ── réapparition : heure absolue, enregistrée avec la partie (sortir ne remet rien à zéro) ── */
  function aliveTarget() { return Math.max(0, CFG.rabbits - S().respawns.filter(t => t > Date.now()).length); }
  function spawnRim(r) {
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 6.28, x = SITE.x + Math.cos(a) * R.x * 0.97, z = SITE.z + Math.sin(a) * dzFor(a) * 0.97;
      if (isBlockedAt(x, z)) continue;
      placeRabbit(r, x, z); r.yaw = r.yawT = Math.atan2(SITE.x - x, SITE.z - z);
      const t = randomWander(null, null, true), p = findPath(x, z, t[0], t[1]);
      if (p) { r.path = p; r.st = 'wander'; }
      return;
    }
    placeRabbit(r, SITE.x, SITE.z + 8);
  }
  function respawnTick() {
    const s = S(), now = Date.now();
    const due = s.respawns.filter(t => t <= now);
    if (!due.length) return;
    s.respawns = s.respawns.filter(t => t > now);
    const live = W.rabbits.filter(r => !r.gone && r.st !== 'captured').length;
    const want = Math.min(CFG.rabbits - s.respawns.length, CFG.rabbits);
    for (let i = live; i < want; i++) spawnRim(makeRabbit(W.seq));
  }
  function resetField() {
    W.rabbits.forEach(r => { root.remove(r.g); }); W.rabbits = [];
    W.carrots.slice().forEach(c => { root.remove(c.mesh); root.remove(c.sh); }); W.carrots = [];
    W.dust.forEach(d => root.remove(d.m)); W.dust = [];
    const K = W.crate; K.st = 'open'; K.t = 0; K.angle = 0; K.hinge.rotation.x = 0; K.beam.visible = false; K.promptOn = false; setLamp(LAMP.idle); MAT.ring.opacity = 0; showPrompt(false);
    W.nextThrow = W.t;
    W.cata.fire = 1; W.cata.loaded.visible = true; W.cata.armP.rotation.x = W.cata.rest; W.target.visible = false;
    const s = S(), now = Date.now();
    s.respawns = s.respawns.filter(t => t > now);
    const n = CFG.rabbits - s.respawns.length;
    for (let i = 0; i < n; i++) {
      const r = makeRabbit(i), t = randomWander(null, null, true);
      placeRabbit(r, t[0], t[1]);
      r.timer = 0.4 + Math.random() * 2;
    }
  }

  /* ── boucle ── */
  function tick(dt) {
    W.t += dt;
    W.respawnChk -= dt;
    if (W.respawnChk <= 0) { W.respawnChk = 0.5; respawnTick(); hideStragglers(); }   // effets ajoutés entre-temps (fête de caserne, après-attaque…)
    W.carrots.slice().forEach(c => carrotTick(c, dt));
    W.rabbits.slice().forEach(r => rabbitTick(r, dt));
    W.rabbits = W.rabbits.filter(r => !r.gone);
    crateTick(dt);
    // catapulte
    const ca = W.cata;
    let dy = ca.yawT - ca.yaw; while (dy > Math.PI) dy -= 6.2832; while (dy < -Math.PI) dy += 6.2832;
    ca.yaw += dy * Math.min(1, dt * 16); ca.yawG.rotation.y = ca.yaw;
    if (ca.fire < 1) {
      ca.fire = Math.min(1, ca.fire + dt / (CFG.throwEvery * 0.86));
      const f = ca.fire, kick = Math.min(1, f / 0.1);
      const out = 1 - Math.pow(1 - kick, 3), back = sstep(0.24, 1, f);
      ca.armP.rotation.x = lerp(ca.rest, 1.85, out * (1 - back)) ;
      if (f >= 1) ca.loaded.visible = true;
    }
    // poussière, cible
    for (let i = W.dust.length - 1; i >= 0; i--) {
      const d = W.dust[i]; d.t += dt; d.m.position.x += d.vx * dt; d.m.position.z += d.vz * dt; d.m.position.y += d.vy * dt; d.vy -= 9 * dt;
      d.m.scale.setScalar(0.6 * Math.max(0, 1 - d.t / d.life));
      if (d.t >= d.life) { root.remove(d.m); W.dust.splice(i, 1); }
    }
    if (W.target.visible) {
      W.targetT += dt; const k = W.targetT / 0.5;
      W.target.scale.setScalar(0.5 + k * 1.1); MAT.target.opacity = 0.55 * Math.max(0, 1 - k);
      if (k >= 1) W.target.visible = false;
    }
    S().secs = (S().secs || 0) + dt;
    placePrompt();
    updateChip();
    if (window.SBFluid && (W.carrots.length || W.crate.st !== 'open' || W.rabbits.some(r => r.st === 'move'))) SBFluid.poke();
  }

  /* ───────────────────────── toucher : la caisse, ou le sol ───────────────────────── */
  let ray = null, plane = null;
  function screenOf(x, y, z) {
    const r = P.host.getBoundingClientRect(), v = new T.Vector3(x, y, z).project(P.camera);
    return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height, v.z];
  }
  function groundPoint(cx, cy) {
    const r = P.host.getBoundingClientRect();
    if (!ray) { ray = new T.Raycaster(); plane = new T.Plane(new T.Vector3(0, 1, 0), 0); }
    plane.constant = -Y0;
    ray.setFromCamera(new T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), P.camera);
    const hit = new T.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }
  function crateHit(cx, cy) {
    const W2 = CRATE.hw + 0.2, D2 = CRATE.hd + 0.2; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [dx, dz, h] of [[-W2, -D2, 0], [W2, -D2, 0], [-W2, D2, 0], [W2, D2, 0], [-W2, -D2, 3.4], [W2, -D2, 3.4], [-W2, D2, 3.4], [W2, D2, 3.4], [-CRATE.door, D2 + CRATE.ramp, 0], [CRATE.door, D2 + CRATE.ramp, 0]]) {
      const [sx, sy] = screenOf(CRATE.x + dx, Y0 + h, CRATE.z + dz);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, hw = Math.max(46, (x1 - x0) / 2), hh = Math.max(46, (y1 - y0) / 2);   // zone tactile confortable, même de loin
    return Math.abs(cx - cxm) <= hw && Math.abs(cy - cym) <= hh;
  }
  function floorHit(p) { return p && inInterior(p.x, p.z, 0.2); }
  function onTap(cx, cy) {
    if (!active || moving) return;
    const p = groundPoint(cx, cy);
    const K = W.crate;
    if (crateHit(cx, cy)) {
      if (K.st !== 'open') return;
      const someoneThere = W.rabbits.some(r => !r.gone && r.st !== 'captured' && (fullyIn(r) || inDoorway(r)));
      const baited = W.carrots.some(c => c.inCrate);
      if (!someoneThere && !baited && floorHit(p)) {
        // carotte déposée dans la caisse : c'est le moyen le plus simple d'y attirer un lapin
        const x = clamp(p.x, CRATE.x - 2.4, CRATE.x + 2.4);
        throwCarrot(x, CRATE.z - 1.5, true);
        return;
      }
      closeDoor();
      return;
    }
    if (!p) return;
    if (q(p.x, p.z, R) > 1.02) return;                // hors de la clairière : point inaccessible
    if (isBlockedAt(p.x, p.z) && q(p.x, p.z, R) <= 1.0) return;   // rocher, catapulte
    throwCarrot(p.x, p.z, false);
  }
  function bindTaps() {
    const el = P.renderer.domElement; let down = null, touches = 0;
    el.addEventListener('pointerdown', e => {
      touches = e.isPrimary ? 1 : touches + 1;
      if (!active) return;
      down = e.isPrimary && touches === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
    });
    const up = e => {
      touches = Math.max(0, touches - 1);
      if (!active || !down || e.pointerId !== down.id) { if (touches === 0) down = null; return; }
      const d = Math.hypot(e.clientX - down.x, e.clientY - down.y), a = performance.now() - down.t;
      down = null;
      if (d > 10 || a > 450) return;
      onTap(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { touches = Math.max(0, touches - 1); down = null; });
    el.addEventListener('pointermove', e => { if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down = null; });
  }

  /* ───────────────────────── interface ───────────────────────── */
  const UI = {};
  function buildUI() {
    const css = document.createElement('style');
    css.textContent = `
    #sbx-compass { position:absolute; left:0; top:0; z-index:19; width:58px; padding:0; margin:0; border:0; background:none; cursor:pointer; color:rgba(150,235,255,.95);
      display:flex; flex-direction:column; align-items:center; gap:3px; opacity:0; pointer-events:none; transition:opacity .35s ease; -webkit-tap-highlight-color:transparent; will-change:transform; }
    #sbx-compass.on { opacity:1; pointer-events:auto; }
    #sbx-compass .disc { position:relative; width:50px; height:50px; border-radius:50%; background:rgba(8,18,26,.26); border:1px solid rgba(130,230,255,.34);
      backdrop-filter:blur(2.5px); -webkit-backdrop-filter:blur(2.5px); box-shadow:0 0 16px rgba(90,210,255,.14), inset 0 0 12px rgba(90,210,255,.08); animation:sbxBreathe 3.4s ease-in-out infinite; }
    #sbx-compass:active .disc { transform:scale(.93); }
    #sbx-compass svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    #sbx-compass .lab { font:600 8px/1 'Space Grotesk',system-ui,sans-serif; letter-spacing:.2em; text-transform:uppercase; color:rgba(190,240,255,.72); text-shadow:0 1px 3px rgba(0,0,0,.8); }
    @keyframes sbxBreathe { 0%,100% { opacity:.66 } 50% { opacity:.94 } }
    #scr-planet.sbx-on > .w-top, #scr-planet.sbx-on > .w-nav, #scr-planet.sbx-on > .w-center, #scr-planet.sbx-on > .w-card, #scr-planet.sbx-on > .w-pop,
    #scr-planet.sbx-on > .w-sheet, #scr-planet.sbx-on > #sb-radio-btn, #scr-planet.sbx-on .p3d-overlay { display:none !important; }
    body.sbx-on #sb-bringue, body.sbx-on #sb-party, body.sbx-on #sb-devast, body.sbx-on #sb-install { display:none !important; }
    #sbx-hud { position:absolute; inset:0; z-index:21; pointer-events:none; display:none; font-family:'Space Grotesk',system-ui,sans-serif; }
    #scr-planet.sbx-on #sbx-hud { display:block; }
    #sbx-chip { pointer-events:auto; position:absolute; left:50%; top:calc(var(--sai,0px) + 12px); transform:translateX(-50%); display:flex; align-items:center; gap:7px; height:34px; padding:0 14px;
      border-radius:17px; background:rgba(6,12,16,.62); border:1px solid rgba(126,208,128,.32); color:#7ed080; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); transition:box-shadow .2s ease, border-color .2s ease; }
    #sbx-chip svg { width:14px; height:14px; }
    #sbx-chip b { font:600 14px/1 'JetBrains Mono',monospace; color:#e8f6e8; letter-spacing:.01em; }
    #sbx-chip.hit { box-shadow:0 0 18px rgba(126,240,140,.7); border-color:rgba(160,255,170,.85); }
    #sbx-hint { pointer-events:auto; position:absolute; left:50%; top:calc(var(--sai,0px) + 56px); transform:translateX(-50%); width:min(86%,340px); padding:9px 13px; border-radius:10px; text-align:center;
      background:rgba(6,12,16,.66); border:1px solid rgba(255,255,255,.12); color:#e6eef2; font-size:12.5px; line-height:1.42; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); transition:opacity .4s ease; }
    #sbx-hint.flav { font-style:italic; color:#cfe8d2; }
    #sbx-back { position:absolute; left:50%; bottom:calc(var(--sab,0px) + 22px); transform:translateX(-50%); pointer-events:auto; height:44px; padding:0 20px; display:flex; align-items:center; gap:9px; white-space:nowrap;
      border-radius:22px; background:rgba(6,14,20,.72); border:1px solid rgba(120,220,255,.42); color:#d6f3ff; font:500 13px/1 'Space Grotesk',system-ui,sans-serif; letter-spacing:.03em; cursor:pointer; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
    #sbx-back svg { width:15px; height:15px; }
    #sbx-back:active { transform:translateX(-50%) scale(.97); }
    #sbx-close { position:absolute; left:0; top:0; pointer-events:auto; padding:0 15px; height:38px; display:none; align-items:center; border-radius:19px; cursor:pointer;
      background:rgba(8,22,14,.88); border:1px solid rgba(160,255,185,.75); color:#e4ffe9; font:600 13px/1 'Space Grotesk',system-ui,sans-serif; letter-spacing:.05em; box-shadow:0 0 16px rgba(120,255,160,.3); will-change:transform; }
    #sbx-close.on { display:flex; animation:sbxPop .16s ease-out both; }
    @keyframes sbxPop { from { opacity:0 } to { opacity:1 } }
    .sbx-gain { position:absolute; left:0; top:0; font:700 17px/1 'Space Grotesk',system-ui,sans-serif; color:#a6ffb8; text-shadow:0 1px 5px rgba(0,0,0,.85), 0 0 12px rgba(120,255,160,.45); white-space:nowrap; pointer-events:none; }
    .sbx-dot { position:absolute; left:0; top:0; width:9px; height:9px; margin:-4.5px; border-radius:50%; background:#a6ffb8; box-shadow:0 0 10px 2px rgba(120,255,160,.75); pointer-events:none; }
    #sbx-veil { position:fixed; inset:0; z-index:60; background:#04070b; opacity:0; pointer-events:none; transition:opacity .24s ease; }
    #sbx-veil.on { opacity:1; pointer-events:auto; }`;
    document.head.appendChild(css);
    const scr = document.getElementById('scr-planet');
    const cp = document.createElement('button');
    cp.id = 'sbx-compass'; cp.setAttribute('aria-label', tr('explore.aria'));
    cp.innerHTML = `<span class="disc"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <g stroke="currentColor" stroke-opacity=".42" stroke-width="1.2" stroke-linecap="round"><path d="M24 4.5v3M24 40.5v3M4.5 24h3M40.5 24h3"/></g>
        <g class="needle"><path d="M24 7.5 31 25.5 24 22 17 25.5Z" fill="currentColor" fill-opacity=".92"/><path d="M24 22 31 25.5 24 38 17 25.5Z" fill="currentColor" fill-opacity=".2"/></g>
      </svg></span><span class="lab"></span>`;
    scr.appendChild(cp);
    UI.compass = cp; UI.needle = cp.querySelector('.needle'); UI.lab = cp.querySelector('.lab');
    cp.addEventListener('click', () => { if (active) flyToClearing(); else enter(); });
    const hud = document.createElement('div'); hud.id = 'sbx-hud';
    hud.innerHTML = `<div id="sbx-chip"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="currentColor"/></svg><b>0</b></div>
      <div id="sbx-hint" style="display:none"></div>
      <button id="sbx-close"></button>
      <button id="sbx-back"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3 2.5 8 7 13M3 8h10.5"/></svg><span></span></button>`;
    scr.appendChild(hud);
    UI.hud = hud; UI.chip = hud.querySelector('#sbx-chip'); UI.chipN = UI.chip.querySelector('b'); UI.hint = hud.querySelector('#sbx-hint'); UI.close = hud.querySelector('#sbx-close'); UI.back = hud.querySelector('#sbx-back');
    UI.back.querySelector('span').textContent = tr('explore.back');
    UI.close.textContent = tr('explore.close');
    UI.back.addEventListener('click', () => exit());
    UI.close.addEventListener('click', () => closeDoor());
    const veil = document.createElement('div'); veil.id = 'sbx-veil'; document.body.appendChild(veil); UI.veil = veil;
    // quitter la carte (toast, alerte…) : l'exploration se referme d'elle-même, la colonie retrouve son cadrage
    new MutationObserver(() => { if (active && scr.classList.contains('hidden')) exit(true); }).observe(scr, { attributes: true, attributeFilter: ['class'] });
  }
  let chipPending = 0, chipShown = null;
  function updateChip() {
    const v = Math.floor(typeof G !== 'undefined' && G.res && G.res.biomass ? G.res.biomass.v : 0) - chipPending;
    if (v !== chipShown) { chipShown = v; UI.chipN.textContent = window.I18N && I18N.num ? I18N.num(v) : String(v); }
  }
  function showPrompt(on) { UI.close.classList.toggle('on', !!on); }
  function placePrompt() {
    if (!W.crate.promptOn) return;
    const [sx, sy] = screenOf(CRATE.x, Y0 + 7, CRATE.z - 1);
    const w = UI.close.offsetWidth || 90, r = UI.hud.getBoundingClientRect();
    UI.close.style.transform = `translate3d(${Math.round(clamp(sx - r.left - w / 2, 8, r.width - w - 8))}px,${Math.round(Math.max(sy - r.top - 19, 96))}px,0)`;
  }
  function showGain(first) {
    const r = UI.hud.getBoundingClientRect(), [sx, sy] = screenOf(CRATE.x, Y0 + 6, CRATE.z);
    const x = sx - r.left, y = sy - r.top;
    const g = document.createElement('div'); g.className = 'sbx-gain'; g.textContent = tr('explore.gain', { n: CFG.reward }); UI.hud.appendChild(g);
    const w = g.offsetWidth;
    g.animate([{ transform: `translate(${x - w / 2}px,${y}px) scale(.8)`, opacity: 0 }, { transform: `translate(${x - w / 2}px,${y - 16}px) scale(1.05)`, opacity: 1, offset: 0.18 }, { transform: `translate(${x - w / 2}px,${y - 40}px) scale(1)`, opacity: 1, offset: 0.72 }, { transform: `translate(${x - w / 2}px,${y - 56}px) scale(1)`, opacity: 0 }], { duration: 1300, easing: 'ease-out' }).onfinish = () => g.remove();
    const cr = UI.chip.getBoundingClientRect(), tx = cr.left + 22 - r.left, ty = cr.top + cr.height / 2 - r.top;
    chipPending = CFG.reward;
    for (let i = 0; i < CFG.reward; i++) {
      const d = document.createElement('div'); d.className = 'sbx-dot'; UI.hud.appendChild(d);
      const ox = (i - 2) * 9;
      const a = d.animate([{ transform: `translate(${x + ox}px,${y}px) scale(.4)`, opacity: 0 }, { transform: `translate(${x + ox}px,${y - 18}px) scale(1)`, opacity: 1, offset: 0.2 }, { transform: `translate(${tx}px,${ty}px) scale(.6)`, opacity: 1 }], { duration: 620, delay: 240 + i * 55, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' });
      a.onfinish = () => {
        d.remove(); chipPending = Math.max(0, chipPending - 1);
        UI.chip.classList.add('hit'); clearTimeout(UI._hit); UI._hit = setTimeout(() => UI.chip.classList.remove('hit'), 240);
      };
    }
    if (first) {
      const h = UI.hint; h.className = 'flav'; h.textContent = tr('explore.first'); h.style.display = 'block'; h.style.opacity = 1;
      clearTimeout(UI._flav); UI._flav = setTimeout(() => { h.style.opacity = 0; setTimeout(() => { h.style.display = 'none'; }, 420); }, 4200);
    }
  }

  /* ── boussole : flèche qui indique la clairière, et qui glisse le long du bord de l'écran ── */
  const CP = { x: null, y: null, a: 0, show: false, okAt: 0, ok: false, top: 120, bot: 112 };
  function compassAllowed() {
    if (!installed || !P.ready || window.__sbCinema) return false;
    const scr = document.getElementById('scr-planet');
    if (!scr || scr.classList.contains('hidden') || !P.host || P.host.offsetParent === null) return false;
    if (window.SBTuto && SBTuto.active && SBTuto.active()) return false;
    if (document.querySelector('.w-card.on, .w-sheet.on, #sb-sheet, #sb-away, #mp-choose, #sb-notif')) return false;
    return true;
  }
  function compassTick(dt, now) {
    if (now - CP.okAt > 250) {
      CP.okAt = now; CP.ok = compassAllowed();
      const goal = document.querySelector('.p3d-goal'), top = document.querySelector('#scr-planet .w-top');
      let b = 0;
      if (top && top.offsetParent !== null) b = Math.max(b, top.getBoundingClientRect().bottom);
      if (goal && goal.offsetParent !== null) b = Math.max(b, goal.getBoundingClientRect().bottom);
      if (active) { const h = UI.hint.style.display !== 'none' ? UI.hint : UI.chip; b = h.getBoundingClientRect().bottom; }
      CP.top = b + 6;
    }
    if (!CP.ok) { if (CP.show) { CP.show = false; UI.compass.classList.remove('on'); } return; }
    const host = document.getElementById('scr-planet').getBoundingClientRect();
    const W_ = host.width, H_ = host.height;
    const [sx0, sy0] = screenOf(SITE.x, Y0 + 1, SITE.z);
    const sx = sx0 - host.left, sy = sy0 - host.top;
    const L = 40, Rr = W_ - 40, Tp = CP.top + 30, Bt = H_ - (active ? 110 : 128);
    const onscreen = sx > L && sx < Rr && sy > Tp && sy < Bt;
    // dans l'exploration, la boussole ne sert que si on s'est éloigné de la clairière
    const wantShow = active ? (!moving && !onscreen) : !moving;
    if (wantShow !== CP.show) { CP.show = wantShow; UI.compass.classList.toggle('on', wantShow); }
    if (!wantShow) { CP.x = null; return; }
    let px, py, ang;
    if (onscreen) { px = sx; py = Math.max(Tp, sy - 58); ang = Math.PI / 2; }     // la clairière est à l'écran : la flèche se pose au-dessus
    else {
      const cx = W_ / 2, cy = (Tp + Bt) / 2, dx = sx - cx, dy = sy - cy, tx = dx ? ((dx > 0 ? Rr : L) - cx) / dx : 1e9, ty = dy ? ((dy > 0 ? Bt : Tp) - cy) / dy : 1e9, t = Math.min(tx, ty);
      px = cx + dx * t; py = cy + dy * t; ang = Math.atan2(dy, dx);
    }
    const k = CP.x == null ? 1 : Math.min(1, dt * 9);
    if (CP.x == null) { CP.x = px; CP.y = py; CP.a = ang; }
    CP.x += (px - CP.x) * k; CP.y += (py - CP.y) * k;
    let da = ang - CP.a; while (da > Math.PI) da -= 6.2832; while (da < -Math.PI) da += 6.2832; CP.a += da * k;
    const nudge = Math.sin(now / 420) * 2.2;   // elle tire légèrement vers la forêt
    const lab = active ? tr('explore.compass_back') : tr('explore.compass');
    if (UI.lab.textContent !== lab) UI.lab.textContent = lab;
    UI.compass.style.transform = `translate3d(${(CP.x + Math.cos(CP.a) * nudge - 29).toFixed(1)}px,${(CP.y + Math.sin(CP.a) * nudge - 25).toFixed(1)}px,0)`;
    UI.needle.setAttribute('transform', `rotate(${(CP.a * 180 / Math.PI + 90).toFixed(1)} 24 24)`);
  }

  /* ───────────────────────── entrer, sortir ───────────────────────── */
  const viewDist = () => clamp(CFG.viewSpan / (2 * Math.tan(P.camera.fov * Math.PI / 360) * P.camera.aspect), 120, 210);
  const viewTarget = () => new T.Vector3(SITE.x, 0, SITE.z - 1);
  function veil(on) { UI.veil.classList.toggle('on', on); }
  function flyToClearing() { P._moveTo(viewTarget(), viewDist(), 800); }
  function enter() {
    if (active || moving || !installed || !P.ready) return;
    moving = true;
    veil(true);
    setTimeout(() => {
      try {
        if (!root) buildScene();
        buildWild();
        const c = P.controls;
        saved = { pos: P.camera.position.clone(), tgt: c.target.clone(), min: c.minDistance, max: c.maxDistance, b: P._camB || null };
        P._focusAnim = null;
        P._pickOff = true;
        P._camB = [-175, 200, -172, 150];
        c.minDistance = 85; c.maxDistance = 560;
        const tgt = viewTarget(), d = viewDist();
        c.target.copy(tgt); P.camera.position.copy(tgt).addScaledVector(P.camDir, d + 46); c.update();
        active = true;
        document.getElementById('scr-planet').classList.add('sbx-on'); document.body.classList.add('sbx-on');
        natureOn();
        resetField();
        W.sessionCaught = 0; W.enteredAt = W.t; chipPending = 0; chipShown = null; updateChip();
        const s = S();
        if (!s.hintSeen) {
          s.hintSeen = true; save();
          const h = UI.hint; h.className = ''; h.textContent = tr('explore.hint'); h.style.display = 'block'; h.style.opacity = 1;
        } else UI.hint.style.display = 'none';
        P._moveTo(tgt, d, 1100);
      } catch (e) { console.warn('[explore] entrée', e); }
      veil(false);
      setTimeout(() => { moving = false; }, 300);
    }, 250);
  }
  function exit(immediate) {
    if (!active || (moving && !immediate)) return;
    const finish = () => {
      active = false;
      document.getElementById('scr-planet').classList.remove('sbx-on'); document.body.classList.remove('sbx-on');
      showPrompt(false);
      natureOff();
      W.carrots.slice().forEach(c => { root.remove(c.mesh); root.remove(c.sh); }); W.carrots = [];
      W.rabbits.forEach(r => root.remove(r.g)); W.rabbits = [];
      const c = P.controls; P._pickOff = false; P._camB = saved ? saved.b : null; P._focusAnim = null;
      if (saved) {
        // l'élan d'un glissement en cours est d'abord vidé : le cadrage revient au millimètre
        const damp = c.enableDamping; c.enableDamping = false; c.update();
        c.minDistance = saved.min; c.maxDistance = saved.max; c.target.copy(saved.tgt); P.camera.position.copy(saved.pos); c.update();
        c.enableDamping = damp;
      }
      saved = null;
      UI.hint.style.display = 'none';
      save();
      if (W.sessionCaught > 0 && typeof toast === 'function') toast(tr('explore.summary', { n: W.sessionCaught, g: W.sessionCaught * CFG.reward }));
      W.sessionCaught = 0;
      if (window.SBHome && SBHome.refresh) SBHome.refresh();
    };
    if (immediate) { finish(); moving = false; return; }
    moving = true;
    veil(true);
    setTimeout(() => { try { finish(); } catch (e) { console.warn('[explore] sortie', e); } veil(false); setTimeout(() => { moving = false; }, 300); }, 250);
  }

  /* ───────────────────────── mise en place ───────────────────────── */
  function install() {
    P = window.Planet3D; T = window.SB3D.THREE;
    if (!findGround()) return false;
    shapeGround();
    buildNav();
    carve();
    addTexts();
    buildUI();
    bindTaps();
    const orig = P._rebuild;
    P._rebuild = function () { const r = orig.apply(this, arguments); try { carve(); if (active) natureOn(); } catch (e) { console.warn('[explore] rebuild', e); } return r; };
    const of = P._frame;
    let last = performance.now();
    P._frame = function () {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      try {
        compassTick(dt, now);
        if (active && P.host && P.host.offsetParent !== null) tick(dt);
      } catch (e) { console.warn('[explore]', e); }
      return of.apply(this, arguments);
    };
    if (P.renderer) P.renderer.shadowMap.needsUpdate = true;
    installed = true;
    return true;
  }
  const boot = setInterval(() => {
    try {
      const Pl = window.Planet3D;
      if (!Pl || Pl.failed) return;
      if (!Pl.ready || !window.SB3D || !Pl.scene) return;
      if (typeof window.sbTerrainVariant === 'function' && window.sbTerrainVariant() !== 'jardin') return;   // v1 : planètes-jardins seulement
      let flora = false; Pl.scene.children.forEach(o => { if (o.name === 'SB_GRID_FLORA') flora = true; });
      if (!flora) return;
      if (!allowed()) return;                 // pour les autres joueurs : rien n'est touché
      clearInterval(boot);
      install();
    } catch (e) { console.warn('[explore] installation', e); clearInterval(boot); }
  }, 800);

  window.SBExplore = {
    enter, exit,
    get active() { return active; },
    // mesure du rythme, pour équilibrer ensuite (brief §4)
    stats() {
      const s = S(), min = (s.secs || 0) / 60;
      return { lapins: s.caught || 0, biomasse: (s.caught || 0) * CFG.reward, minutes: +min.toFixed(1), biomasse_par_minute: min > 0 ? +(((s.caught || 0) * CFG.reward) / min).toFixed(1) : 0 };
    },
    _dbg: { W, S, CFG, CRATE, SITE, CATA, tick, fullyIn, inDoorway, onTap, screenOf, findPath, closeDoor, throwCarrot, aliveTarget, get Y0() { return Y0; }, get installed() { return installed; } },
  };
})();
