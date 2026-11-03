/* Starbyte — Le stand de tir du Red Phalanx (03/11/2026, brief d'Adrien, GDD claude/starbyte_GDD_stand_de_tir.md)
   Sur la carte d'exploration, un stand improvisé dans la forêt. « S'entraîner » ouvre une vue à la première personne :
   énorme pistolet laser, tronc-cible, quatre tirs, score sur 400, record personnel. Aucune ressource en jeu.
   - même scène 3D que la planète et que l'exploration : aucun moteur en plus ;
   - le tir atteint exactement le point visé au moment de la décharge : oscillation et recul déplacent la visée, jamais la balle ;
   - états explicites : prêt → charge → récupération → … → résultat → remplacement → en attente ;
   - record dans G.explore (sauvegardé avec la partie).
   Réservé aux comptes d'Adrien tant que STAND_PUBLIC est à false : pour les autres joueurs, ce fichier ne touche à rien. */
(function () {
  'use strict';
  const STAND_PUBLIC = false;   // true = ouvert à tous les joueurs (après validation sur iPhone)
  const PREVIEW_PSEUDOS = ['hadrien', 'pauline'];

  /* ── réglages : tout le rythme se règle ici ── */
  const CFG = {
    shots: 4,
    charge: 0.12,           // montée en énergie, délai constant avant la décharge
    recovery: 1.0,          // récupération entre deux tirs
    swayYaw: 0.38,          // oscillation régulière, en degrés
    swayPitch: 0.28,
    swayHz: 0.62,
    kickPitch: 3.2,         // recul qui revient tout seul, en degrés
    kickYaw: 0.5,
    stayPitch: 1.1,         // part du recul qui reste : il faut retrouver son alignement
    stayYaw: 0.35,
    limitYaw: 15,           // la visée reste limitée au stand
    limitPitch: 10,
    sensitivity: 0.045,     // degrés par pixel de glissement
    resultDelay: 0.75,      // temps entre le dernier impact et le résultat
    gunTall: { x: 0.18, y: -0.8, z: -1.5, s: 1, tilt: 0.07 },    // place de l'arme, écran en hauteur
    gunWide: { x: 0.72, y: -0.72, z: -1.5, s: 1, tilt: 0.05 },   // écran en largeur
  };
  const ZONES = [[0.25, 100], [0.5, 75], [0.75, 50], [1, 25]];   // part du rayon → points (les anneaux peints utilisent les mêmes valeurs)

  /* ── le terrain : au sud de la carte, à l'est du chemin de terre, tir vers le nord ── */
  const POST = { x: -14, z: 66 };                    // poste de tir
  const TGT = { x: POST.x, z: POST.z - 24 };         // axe du tronc
  const TRUNK = { r: 3.8, h: 9, face: 2.95 };        // la face sciée est à 2,95 de l'axe
  const PIV = 3.6;                                   // le tronc bascule autour de son arête arrière
  const EYE = 4.6;                                   // hauteur des yeux, et du centre de la cible
  const TARGET_R = 2.25;                             // rayon de la cible peinte
  const HALF_W = Math.sqrt(TRUNK.r * TRUNK.r - TRUNK.face * TRUNK.face);   // demi-largeur de la face sciée
  const BUTTE = { x: TGT.x, z: TGT.z - 11, rx: 17, ry: 8, rz: 7 };
  const CRANE = { x: TGT.x + 13, z: TGT.z - 3, top: 16 };
  const LANE = { x0: POST.x - 11, x1: POST.x + 16, z0: TGT.z - 17, z1: POST.z + 8 };   // sans arbres pendant l'exploration

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rad = d => d * Math.PI / 180;
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  let T = null, P = null, API = null, built = false;
  const allowed = () => {
    if (STAND_PUBLIC) return true;
    try {
      if (typeof _sbDevAllowed === 'function' && _sbDevAllowed()) return true;
      const names = [window.SBMP && SBMP.world && SBMP.world.pseudo, typeof G !== 'undefined' && G.profile && (G.profile.pseudo || G.profile.name || G.profile.captainName)];
      return names.some(n => n && PREVIEW_PSEUDOS.includes(String(n).trim().toLowerCase()));
    } catch (e) { return false; }
  };
  const sfx = (n, d) => { try { if (window.SBSfx) SBSfx.play(n, d); } catch (e) {} };
  const tr = (k, v) => (window.I18N ? I18N.t(k, v) : k);
  function addTexts() {
    if (!window.I18N || !I18N.add) return;
    I18N.add('fr', {
      'stand.offer': 'S\'entraîner',
      'stand.back': 'Retour à l\'exploration',
      'stand.fire': 'Tirer',
      'stand.shots': 'Tirs : {n}/{m}',
      'stand.score': 'Score : {n}',
      'stand.best': 'Record : {n}',
      'stand.result': '{n} / {m}',
      'stand.result2': '{n} / {m} — Record : {b}',
      'stand.record': 'Nouveau record personnel',
      'stand.again': 'Rejouer',
      'stand.wait': 'Cible en préparation…',
      'stand.hint': 'Glisse pour viser, puis touche Tirer.',
      'stand.pts': '+{n}',
      'stand.miss': 'Raté',
    });
  }
  function bestScore() { try { return (typeof G !== 'undefined' && G.explore && G.explore.standBest) || 0; } catch (e) { return 0; } }
  function saveBest(score) {
    if (typeof G === 'undefined' || !G) return false;
    if (!G.explore) G.explore = { respawns: [], ledger: [], caught: 0, secs: 0 };
    const e = G.explore, isNew = score > (e.standBest || 0);
    if (isNew) e.standBest = score;
    e.standSeries = (e.standSeries || 0) + 1;
    try { if (typeof saveGame === 'function') saveGame(); } catch (err) {}
    return isNew;
  }

  /* ───────────────────────── géométrie : pièces à facettes, couleurs par sommet ───────────────────────── */
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
    new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
  // boîte à arêtes chanfreinées : c'est elle qui accroche la lumière et évite l'effet « cube »
  function cbox(w, h, d, c) {
    const hx = w / 2, hy = h / 2, hz = d / 2, pos = [];
    const V = (sx, sy, sz, ax) => [sx * (hx - (ax === 0 ? 0 : c)), sy * (hy - (ax === 1 ? 0 : c)), sz * (hz - (ax === 2 ? 0 : c))];
    const poly = pts => {
      const a = pts[0], b = pts[1], e = pts[2];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      let cx = 0, cy = 0, cz = 0; pts.forEach(p => { cx += p[0]; cy += p[1]; cz += p[2]; });
      const list = nx * cx + ny * cy + nz * cz < 0 ? pts.slice().reverse() : pts;
      for (let i = 1; i < list.length - 1; i++) pos.push(...list[0], ...list[i], ...list[i + 1]);
    };
    const S = [-1, 1];
    for (const s of S) {
      poly([V(s, -1, -1, 0), V(s, 1, -1, 0), V(s, 1, 1, 0), V(s, -1, 1, 0)]);
      poly([V(-1, s, -1, 1), V(1, s, -1, 1), V(1, s, 1, 1), V(-1, s, 1, 1)]);
      poly([V(-1, -1, s, 2), V(1, -1, s, 2), V(1, 1, s, 2), V(-1, 1, s, 2)]);
    }
    for (const a of S) for (const b of S) {
      poly([V(a, b, -1, 0), V(a, b, 1, 0), V(a, b, 1, 1), V(a, b, -1, 1)]);
      poly([V(a, -1, b, 0), V(a, 1, b, 0), V(a, 1, b, 2), V(a, -1, b, 2)]);
      poly([V(-1, a, b, 1), V(1, a, b, 1), V(1, a, b, 2), V(-1, a, b, 2)]);
    }
    for (const a of S) for (const b of S) for (const e of S) poly([V(a, b, e, 0), V(a, b, e, 1), V(a, b, e, 2)]);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    return g;
  }
  // cylindre couché le long de z : r1 à l'arrière (+z), r2 vers l'avant (−z)
  function cylz(r1, r2, h, seg = 8) { const g = new T.CylinderGeometry(r1, r2, h, seg); g.rotateX(Math.PI / 2); return g; }
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
  // couleurs du Red Phalanx
  const RED = 0x8e1015, ARMOR = 0x2c2f35, STEEL = 0x767b84, BLACK = 0x15161a, GUNM = 0x26292e, WHITE = 0xd8d8d4, SUIT = 0x131418, YEL = 0xdca41e;

  /* ───────────────────────── l'arme ───────────────────────── */
  const MUZZLE = { z: -2.66 };
  function buildGun() {
    const p = [], glow = [];
    const add = (g, c, m) => p.push([g, c, m]);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0) => M4(x, y, z, rx, ry, rz);
    // boîtier
    add(cbox(0.34, 0.27, 1.05, 0.035), ARMOR, at(0, 0, -0.5));
    add(cbox(0.27, 0.21, 0.14, 0.03), BLACK, at(0, 0, 0.04));
    add(cbox(0.2, 0.11, 0.02, 0.006), STEEL, at(0, 0.01, 0.115));
    for (let i = 0; i < 4; i++) add(cbox(0.022, 0.07, 0.012, 0.002), BLACK, at(-0.06 + i * 0.04, 0.01, 0.127));
    add(cbox(0.28, 0.05, 0.44, 0.014), RED, at(0, 0.155, -0.26));
    add(cbox(0.28, 0.05, 0.28, 0.014), RED, at(0, 0.155, -0.92));
    for (const s of [-1, 1]) {
      add(cbox(0.026, 0.012, 0.42, 0.003), WHITE, at(s * 0.105, 0.183, -0.26));
      add(cbox(0.03, 0.19, 0.84, 0.008), STEEL, at(s * 0.183, 0, -0.5));
      for (let i = 0; i < 5; i++) add(cbox(0.012, 0.11, 0.05, 0.002), BLACK, at(s * 0.2, 0.01, -0.2 - i * 0.13));
      // radiateurs latéraux
      add(cbox(0.1, 0.15, 0.5, 0.012), GUNM, at(s * 0.25, -0.03, -0.66));
      for (let i = 0; i < 7; i++) add(cbox(0.125, 0.175, 0.016, 0.002), STEEL, at(s * 0.25, -0.03, -0.44 - i * 0.075));
    }
    // chambre d'énergie : berceau, embouts, cage
    add(cbox(0.22, 0.08, 0.07, 0.012), BLACK, at(0, 0.195, -0.4));
    add(cbox(0.22, 0.08, 0.07, 0.012), BLACK, at(0, 0.195, -0.78));
    add(new T.TorusGeometry(0.098, 0.02, 6, 12), STEEL, at(0, 0.26, -0.41));
    add(cylz(0.105, 0.105, 0.07, 10), STEEL, at(0, 0.26, -0.77));
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; add(cbox(0.012, 0.012, 0.32, 0.002), BLACK, at(Math.cos(a) * 0.092, 0.26 + Math.sin(a) * 0.092, -0.59)); }
    // canon : manchon octogonal, anneaux de refroidissement, rail
    add(cylz(0.128, 0.106, 1.3, 8), GUNM, at(0, 0, -1.65));
    for (let i = 0; i < 5; i++) add(cylz(0.146, 0.146, 0.05, 8), i % 2 ? STEEL : BLACK, at(0, 0, -1.12 - i * 0.25));
    add(cbox(0.06, 0.03, 1.2, 0.006), STEEL, at(0, 0.125, -1.65));
    for (let i = 0; i < 6; i++) add(cbox(0.075, 0.014, 0.03, 0.002), BLACK, at(0, 0.144, -1.15 - i * 0.2));
    // bobine sous le canon
    add(cylz(0.056, 0.056, 1.1, 10), STEEL, at(0, -0.155, -1.55));
    for (let i = 0; i < 12; i++) add(cylz(0.073, 0.073, 0.02, 10), i % 3 ? GUNM : BLACK, at(0, -0.155, -1.14 - i * 0.075));
    for (let i = 0; i < 3; i++) add(cbox(0.1, 0.09, 0.04, 0.008), BLACK, at(0, -0.095, -1.15 - i * 0.38));
    // frein de bouche
    add(cylz(0.178, 0.158, 0.34, 8), ARMOR, at(0, 0, -2.42));
    add(cylz(0.19, 0.19, 0.05, 8), STEEL, at(0, 0, -2.6));
    add(cylz(0.19, 0.19, 0.03, 8), RED, at(0, 0, -2.24));
    for (const s of [-1, 1]) add(cbox(0.03, 0.16, 0.16, 0.004), BLACK, at(s * 0.164, 0, -2.42));
    add(cylz(0.105, 0.105, 0.012, 14), BLACK, at(0, 0, -2.63));
    // bloc d'alimentation, poignées latérales
    add(cbox(0.2, 0.2, 0.36, 0.02), GUNM, at(0, -0.2, -0.62));
    add(cbox(0.15, 0.07, 0.12, 0.01), STEEL, at(0, -0.31, -0.62));
    add(cbox(0.1, 0.3, 0.12, 0.022), BLACK, at(0.25, -0.1, -1.02, 0.14));    // poignée droite, sur le flanc
    add(cbox(0.14, 0.07, 0.1, 0.01), STEEL, at(0.17, 0.0, -1.0));
    add(cbox(0.3, 0.05, 0.09, 0.01), STEEL, at(-0.19, -0.1, -1.7));          // support de la poignée gauche
    add(cbox(0.1, 0.3, 0.12, 0.022), BLACK, at(-0.36, -0.24, -1.7, 0.1));
    // câbles
    const tube = (pts, r, c) => add(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(q => new T.Vector3(...q))), 12, r, 5), c);
    tube([[0.12, 0.17, -0.12], [0.19, 0.29, -0.3], [0.13, 0.3, -0.42]], 0.016, BLACK);
    tube([[-0.12, 0.17, -0.12], [-0.19, 0.3, -0.34], [-0.13, 0.3, -0.42]], 0.016, RED);
    tube([[0.09, 0.2, -0.8], [0.13, 0.22, -1], [0.1, 0.14, -1.2]], 0.014, BLACK);
    // lueurs
    for (const s of [-1, 1]) glow.push([cbox(0.012, 0.028, 1.02, 0.002), 0xff3020, at(s * 0.113, 0, -1.65)]);
    glow.push([new T.TorusGeometry(0.104, 0.012, 6, 16), 0xff4a22, at(0, 0, -2.635)]);
    glow.push([cbox(0.06, 0.018, 0.02, 0.002), 0xffb040, at(0.07, -0.1, -0.44)]);
    glow.push([cbox(0.06, 0.018, 0.02, 0.002), 0x60ff90, at(-0.07, -0.1, -0.44)]);
    return { body: merge(p), glow: merge(glow) };
  }
  // gantelets surdimensionnés : paume, doigts refermés, plaques de phalanges, avant-bras en armure rouge
  const GLOVE = 0x50555e, GLOVE2 = 0x3c4047, HAND = 1.45;
  function gauntlet(s, ax, ay, az, ex, ey, ez) {
    // (ax,ay,az) = poignée tenue ; (ex,ey,ez) = coude, hors champ
    const p = [], add = (g, c, m) => p.push([g, c, m]);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0) => M4(ax + x * HAND, ay + y * HAND, az + z * HAND, rx, ry, rz, HAND);
    add(cbox(0.15, 0.24, 0.17, 0.035), GLOVE2, at(0, 0, 0.05));
    add(cbox(0.035, 0.2, 0.14, 0.012), RED, at(s * 0.09, 0, 0.05));          // dos de la main
    add(cbox(0.012, 0.13, 0.07, 0.003), STEEL, at(s * 0.112, 0, 0.05));
    for (let i = 0; i < 4; i++) {
      const y = 0.085 - i * 0.058;
      add(new T.CapsuleGeometry(0.027, 0.075, 2, 6), GLOVE, at(-s * 0.025, y, -0.075, Math.PI / 2 - 0.2, 0, 0));
      add(new T.CapsuleGeometry(0.026, 0.05, 2, 6), GLOVE, at(-s * 0.075, y, -0.09, 0, 0, Math.PI / 2));
      add(cbox(0.06, 0.038, 0.03, 0.006), i % 2 ? STEEL : RED, at(s * 0.03, y, -0.12));
    }
    add(new T.CapsuleGeometry(0.03, 0.085, 2, 6), GLOVE, at(-s * 0.06, 0.14, 0.0, 0.5, 0, s * 0.9));   // pouce
    add(cbox(0.17, 0.19, 0.12, 0.03), STEEL, at(s * 0.01, -0.03, 0.17));     // poignet
    // avant-bras jusqu'au coude
    const a = new T.Vector3(ax + s * 0.015, ay - 0.05, az + 0.3), e = new T.Vector3(ex, ey, ez), d = e.clone().sub(a), len = d.length();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), d.clone().normalize());
    const seg = (w, h, l, u, c, cc = 0.03, up = 0) => {
      const o = a.clone().addScaledVector(d, u);
      const off = new T.Vector3(0, up, 0).applyQuaternion(q);
      add(cbox(w, h, l, cc), c, new T.Matrix4().compose(o.add(off), q, new T.Vector3(1, 1, 1)));
    };
    seg(0.2, 0.2, len, 0.5, GLOVE2);
    seg(0.25, 0.09, len * 0.76, 0.46, RED, 0.03, 0.08);
    seg(0.2, 0.03, len * 0.05, 0.03, STEEL, 0.008, 0.115);
    seg(0.04, 0.016, len * 0.42, 0.42, STEEL, 0.004, 0.13);
    return merge(p);
  }

  /* ───────────────────────── le stand sur la carte ───────────────────────── */
  let STG = null;      // groupe du stand
  let MAT = null, TEX = null, GEO = null;
  const FX = {};
  function radialTexture(stops, size = 64) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), r = g.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2 - 1);
    stops.forEach(([a, col]) => r.addColorStop(a, col));
    g.fillStyle = r; g.fillRect(0, 0, size, size);
    return new T.CanvasTexture(c);
  }
  function starTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.translate(64, 64); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const R = i % 2 ? 36 : 62, w = i % 2 ? 4 : 6.5;
      g.save(); g.rotate(i / 8 * 6.2832);
      const lg = g.createLinearGradient(0, 0, 0, -R); lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(-w, 0); g.lineTo(0, -R); g.lineTo(w, 0); g.closePath(); g.fill();
      g.restore();
    }
    const r = g.createRadialGradient(0, 0, 2, 0, 0, 26); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.65)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(-30, -30, 60, 60);
    return new T.CanvasTexture(c);
  }
  function dirtTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 240; i++) {
      const a = hash(i, 3) * 6.2832, d = Math.pow(hash(i, 5), 0.7) * 104, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, r = 16 + hash(i, 7) * 26;
      const tone = hash(i, 9), col = `${Math.round(66 + tone * 30)},${Math.round(50 + tone * 22)},${Math.round(34 + tone * 14)}`;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${col},.2)`); rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }

  /* ── la cible : un panneau peint (et abîmé) posé sur la face sciée ── */
  let targetCtx = null, targetTex = null;
  const C_W = 512, C_K = C_W / (2 * HALF_W), C_H = Math.round(TRUNK.h * C_K), C_CY = (TRUNK.h - (EYE - 0.3)) * C_K;
  function paintFreshTarget() {
    const g = targetCtx, W = C_W, H = C_H, cx = W / 2, cy = C_CY;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    // bois scié : fil vertical, quelques nœuds, bords plus sombres
    g.fillStyle = '#a07c50'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 150; i++) {
      const x = hash(i, 3) * W, w = 1 + hash(i, 5) * 3.8;
      g.strokeStyle = `rgba(${hash(i, 7) < 0.55 ? '74,50,28' : '206,170,120'},${0.08 + hash(i, 9) * 0.2})`; g.lineWidth = w;
      g.beginPath(); g.moveTo(x, 0);
      for (let k = 1; k <= 12; k++) g.lineTo(x + (hash(i, k) - 0.5) * 14, k / 12 * H);
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = 40 + hash(i, 41) * (W - 80), y = hash(i, 43) < 0.5 ? 40 + hash(i, 45) * 120 : H - 40 - hash(i, 47) * 150;
      for (let k = 5; k > 0; k--) { g.strokeStyle = `rgba(60,38,20,${0.1 + k * 0.05})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, k * 3, k * 6, 0, 0, 6.2832); g.stroke(); }
    }
    const edge = g.createLinearGradient(0, 0, W, 0);
    edge.addColorStop(0, 'rgba(30,20,12,.62)'); edge.addColorStop(0.07, 'rgba(30,20,12,0)'); edge.addColorStop(0.93, 'rgba(30,20,12,0)'); edge.addColorStop(1, 'rgba(30,20,12,.62)');
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
    // anneaux peints : exactement les rayons qui comptent les points
    const px = TARGET_R * C_K, cols = ['#e7dcc2', '#a51f19', '#e7dcc2', '#a51f19'];
    g.save();
    for (let i = ZONES.length - 1; i >= 0; i--) {
      g.beginPath(); g.arc(cx, cy, ZONES[i][0] * px, 0, 6.2832);
      g.fillStyle = cols[ZONES.length - 1 - i]; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(18,14,10,.82)'; g.stroke();
    }
    g.fillStyle = 'rgba(18,14,10,.85)'; g.fillRect(cx - 9, cy - 1, 18, 2); g.fillRect(cx - 1, cy - 9, 2, 18);
    // la peinture laisse voir le fil du bois
    for (let i = 0; i < 60; i++) {
      const a = hash(i, 51) * 6.2832, r = Math.sqrt(hash(i, 53)) * px, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, l = 8 + hash(i, 55) * 26;
      g.strokeStyle = `rgba(${hash(i, 57) < 0.5 ? '120,88,54' : '44,30,18'},${0.1 + hash(i, 59) * 0.2})`; g.lineWidth = 1 + hash(i, 61) * 1.6;
      g.beginPath(); g.moveTo(x, y - l / 2); g.lineTo(x + (hash(i, 63) - 0.5) * 3, y + l / 2); g.stroke();
    }
    g.restore();
    if (targetTex) targetTex.needsUpdate = true;
  }
  function paintImpact(lx, ly, n) {
    const g = targetCtx, cx = C_W / 2 + lx * C_K, cy = C_CY - ly * C_K, R = 0.52 * C_K;
    const h = k => hash(n * 37 + 11, k);
    // brûlure large
    let r = g.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 1.75);
    r.addColorStop(0, 'rgba(12,8,6,.96)'); r.addColorStop(0.55, 'rgba(26,16,10,.62)'); r.addColorStop(1, 'rgba(30,18,10,0)');
    g.fillStyle = r; g.beginPath(); g.arc(cx, cy, R * 1.75, 0, 6.2832); g.fill();
    // éclisses claires, arrachées vers l'extérieur
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * 6.2832 + h(i) * 0.5, l = R * (0.75 + h(i + 20) * 0.95), w = 1.5 + h(i + 40) * 4;
      g.strokeStyle = h(i + 60) < 0.6 ? 'rgba(224,186,132,.85)' : 'rgba(58,36,20,.9)'; g.lineWidth = w;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62); g.lineTo(cx + Math.cos(a + (h(i + 80) - 0.5) * 0.25) * l, cy + Math.sin(a + (h(i + 80) - 0.5) * 0.25) * l); g.stroke();
    }
    // entaille profonde, bord irrégulier
    g.fillStyle = '#060403'; g.beginPath();
    for (let i = 0; i <= 13; i++) { const a = i / 13 * 6.2832, l = R * (0.52 + h(i + 100) * 0.3); const x = cx + Math.cos(a) * l, y = cy + Math.sin(a) * l; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
    // fissures qui filent dans le fil du bois
    g.strokeStyle = 'rgba(10,6,4,.85)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const d = i === 1 ? -1 : 1; let x = cx + (h(i + 120) - 0.5) * R, y = cy + d * R * 0.6;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (h(k * 3 + i + 130) - 0.5) * 12; y += d * (14 + h(k + i + 140) * 22); g.lineTo(x, y); }
      g.stroke();
    }
    targetTex.needsUpdate = true;
  }

  // contour vu du dessus : un arc de cercle, fermé à l'avant par la face sciée
  function trunkOutline(grow, n) {
    const r = TRUNK.r + grow, a0 = Math.acos(TRUNK.face / TRUNK.r), pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (2 * Math.PI - 2 * a0) * i / n; pts.push([r * Math.sin(a), r * Math.cos(a)]); }
    return pts;
  }
  function polyGeo() {   // petit constructeur de facettes : la normale est orientée vers « ref »
    const pos = [], col = [], c = new T.Color();
    const tri = (a, b, e, hex, ref) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const list = nx * ref[0] + ny * ref[1] + nz * ref[2] < 0 ? [a, e, b] : [a, b, e];
      c.setHex(hex); list.forEach(p => { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); });
    };
    return {
      tri,
      quad: (a, b, e, d, hex, ref) => { tri(a, b, e, hex, ref); tri(a, e, d, hex, ref); },
      done: () => {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        return g;
      },
    };
  }
  function buildTrunk() {
    const P3 = polyGeo(), H = TRUNK.h, N = 16, LV = 5, pts = trunkOutline(0, N), BARKS = [0x33241a, 0x3f2e20, 0x2b1f16, 0x4a3626];
    const at = (i, j) => { const k = (i === 0 || i === N) ? 1 : 1 + (hash(i, j + 3) - 0.5) * 0.06; return [pts[i][0] * k, j / LV * H, pts[i][1] * k]; };
    for (let i = 0; i < N; i++) for (let j = 0; j < LV; j++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      P3.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), BARKS[Math.floor(hash(i * 3 + 1, j) * 4)], [mx, 0, mz]);
    }
    // bout scié, dessus et dessous : des cernes
    for (const [y, up] of [[H, 1], [0, -1]]) {
      const ringCols = [0x8a6c49, 0x7a5e3e, 0x927450, 0x6e5436], S = [1, 0.74, 0.5, 0.26], ref = [0, up, 0];
      for (let k = 0; k < S.length; k++) {
        const s0 = S[k], s1 = S[k + 1] || 0;
        for (let i = 0; i <= N; i++) {
          const a = pts[i], b = pts[i === N ? 0 : i + 1];
          P3.quad([a[0] * s0, y, a[1] * s0], [b[0] * s0, y, b[1] * s0], [b[0] * s1, y, b[1] * s1], [a[0] * s1, y, a[1] * s1], ringCols[k], ref);
        }
      }
    }
    return P3.done();
  }
  // cerclage : suit tout le contour du tronc, face plane comprise
  function strapGeo(ys) {
    const P3 = polyGeo(), n = 16, pts = trunkOutline(0.09, n), f = TRUNK.face + 0.09;
    pts.push(pts[0]);
    for (const [y0, y1] of ys) for (let i = 0; i <= n; i++) {
      const a = pts[i], b = pts[i + 1], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ref = i === n ? [0, 0, 1] : [mx, 0, mz], hex = i === n ? 0x24262b : 0x1b1c20;
      P3.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], hex, ref);
    }
    for (const [y0, y1] of ys) for (const s of [-1, 0, 1]) {   // boulons sur la face
      const x = s * HALF_W * 0.72, yc = (y0 + y1) / 2, r = 0.075;
      P3.quad([x - r, yc - r, f + 0.03], [x + r, yc - r, f + 0.03], [x + r, yc + r, f + 0.03], [x - r, yc + r, f + 0.03], 0x767b84, [0, 0, 1]);
    }
    return P3.done();
  }
  function build() {
    if (built) return;
    built = true;
    const root = API.root, Y = API.heightAt(POST.x, POST.z);
    FX.Y = Y;
    STG = new T.Group(); STG.name = 'SB_STAND'; root.add(STG);
    TEX = {
      glow: radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]),
      smoke: radialTexture([[0, 'rgba(255,255,255,.75)'], [0.55, 'rgba(255,255,255,.3)'], [1, 'rgba(255,255,255,0)']]),
      scorch: radialTexture([[0, 'rgba(8,6,5,.92)'], [0.55, 'rgba(14,10,8,.6)'], [1, 'rgba(20,14,10,0)']]),
      dirt: dirtTexture(),
      star: starTexture(),
    };
    MAT = {
      hard: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }),
      gun: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.32 }),
      wood: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
      earth: new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
      glow: new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      core: new T.MeshBasicMaterial({ color: 0xff5a24, toneMapped: false }),
      glass: new T.MeshStandardMaterial({ color: 0x3a1410, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.4, depthWrite: false }),
      beam: new T.MeshBasicMaterial({ color: 0xffd8c0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      beamGlow: new T.MeshBasicMaterial({ color: 0xff3a18, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
    };
    // terre battue, traces de brûlure
    const dirt = new T.Mesh(new T.PlaneGeometry(34, 56), new T.MeshStandardMaterial({ map: TEX.dirt, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    dirt.rotation.x = -Math.PI / 2; dirt.position.set(POST.x, Y + 0.14, POST.z - 17); dirt.receiveShadow = true; dirt.renderOrder = 1; STG.add(dirt);
    [[-5, -7, 3], [3.5, -12, 2.4], [6, -20, 3.4], [-6.5, -19, 2.6], [1, -27, 4.2]].forEach(([x, z, r]) => {
      const m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2), new T.MeshBasicMaterial({ map: TEX.scorch, transparent: true, depthWrite: false, opacity: 0.72 }));
      m.rotation.x = -Math.PI / 2; m.position.set(POST.x + x, Y + 0.18, POST.z + z); m.renderOrder = 1; STG.add(m);
    });
    // butte de terre derrière la cible
    {
      const g = new T.IcosahedronGeometry(1, 3).toNonIndexed(), pa = g.attributes.position, EARTH = new T.Color(0x57412c), EARTH2 = new T.Color(0x6b5238), MOSS = new T.Color(0x4c6a2f), c = new T.Color(), cols = new Float32Array(pa.count * 3);
      const key = (x, y, z) => Math.round(x * 100) + ':' + Math.round(y * 100) + ':' + Math.round(z * 100), J = {};
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), k = key(x, y, z);
        if (J[k] === undefined) J[k] = 0.9 + hash(Math.round(x * 50), Math.round(z * 50 + y * 30)) * 0.2;
        pa.setXYZ(i, x * BUTTE.rx * J[k], y * BUTTE.ry * J[k], z * BUTTE.rz * J[k]);
      }
      for (let t = 0; t < pa.count; t += 3) {
        const yy = (pa.getY(t) + pa.getY(t + 1) + pa.getY(t + 2)) / 3 / BUTTE.ry;
        c.copy(EARTH).lerp(EARTH2, hash(t, 7)); if (yy > 0.62 + hash(t, 9) * 0.2) c.lerp(MOSS, 0.75);
        for (let k = 0; k < 3; k++) { cols[(t + k) * 3] = c.r; cols[(t + k) * 3 + 1] = c.g; cols[(t + k) * 3 + 2] = c.b; }
      }
      g.setAttribute('color', new T.BufferAttribute(cols, 3)); g.computeVertexNormals();
      const m = new T.Mesh(g, MAT.earth); m.position.set(BUTTE.x, Y - 0.5, BUTTE.z); m.castShadow = true; m.receiveShadow = true; STG.add(m);
    }
    // décor : troncs carbonisés, sacs de sable, caisses, rondins de rechange, support de la cible
    {
      const parts = [], woods = [], add = (g, c, m) => parts.push([g, c, m]);
      const CH = 0x17120e, CH2 = 0x241b14, OLIVE = 0x4b5a2c, SAND = 0x8a7c5e, SAND2 = 0x75694f;
      [[-6.2, -9, 0.95, 7], [6.4, -12, 1.1, 9.5], [-7.4, -17, 1.25, 11], [7.2, -20, 0.9, 6.5], [-5.2, -21.5, 0.8, 5], [9.5, -5, 1.2, 8], [-9.5, -3, 1, 6]].forEach(([x, z, r, h], i) => {
        add(new T.CylinderGeometry(r * 0.55, r, h, 7), i % 2 ? CH : CH2, M4(POST.x + x, Y + h / 2 - 0.2, POST.z + z, (hash(i, 3) - 0.5) * 0.12, hash(i, 5) * 3, (hash(i, 7) - 0.5) * 0.12));
        add(new T.ConeGeometry(r * 0.55, 1.3, 5), CH, M4(POST.x + x + r * 0.15, Y + h + 0.3, POST.z + z, 0.4, hash(i, 9) * 3, 0.3));
        add(new T.CylinderGeometry(0.16, 0.26, 2 + hash(i, 11) * 1.4, 5), CH2, M4(POST.x + x - s1(i) * r * 0.6, Y + h * 0.62, POST.z + z, 0, 0, s1(i) * 1));
      });
      add(new T.CylinderGeometry(0.9, 1, 8, 7), CH, M4(POST.x - 9.5, Y + 0.9, POST.z - 13, 1.5, 0.3, 0));
      // sacs de sable devant le poste (visibles en bas du cadre)
      const bag = new T.CapsuleGeometry(0.42, 0.95, 2, 6);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) for (const s of [-1, 1]) {
        const x = s * (1.75 + (i + row * 0.5) * 1.12), z = -6.8 + Math.abs(x) * 0.22;
        add(bag, (i + row) % 2 ? SAND : SAND2, M4(POST.x + x, Y + 0.32 + row * 0.56, POST.z + z, 0, 0.22 * s, Math.PI / 2, 1, 1, 0.74));
      }
      // caisses de munitions
      const crate = (x, z, w, h, d, ry, col = OLIVE) => {
        add(cbox(w, h, d, 0.07), col, M4(POST.x + x, Y + h / 2, POST.z + z, 0, ry, 0));
        add(cbox(w * 1.02, 0.1, d * 0.2, 0.02), BLACK, M4(POST.x + x, Y + h * 0.7, POST.z + z, 0, ry, 0));
        add(cbox(w * 0.32, h * 0.26, 0.02, 0.004), YEL, M4(POST.x + x + Math.sin(ry) * d * 0.5, Y + h * 0.42, POST.z + z + Math.cos(ry) * d * 0.5, 0, ry, 0));
      };
      crate(4.6, 1.4, 2.2, 1.5, 1.5, 0.4); crate(5.9, -0.8, 1.8, 1.1, 1.2, -0.3); crate(4.9, -0.4, 1.3, 1.2, 1, 0.9, ARMOR);
      crate(-4.8, 0.8, 2, 1.3, 1.3, -0.5); crate(4.1, -22, 2.2, 1.6, 1.6, 0.3); crate(4.4, -22, 1.4, 1.1, 1.1, -0.2, ARMOR);
      // râtelier de rondins de rechange, à gauche de la cible
      for (let i = 0; i < 3; i++) add(new T.CylinderGeometry(0.72, 0.72, 4.4, 9), 0x4c3626, M4(POST.x - 4.4 - i * 1.25, Y + 0.72, POST.z - 23.5, 0, 0, Math.PI / 2));
      add(new T.CylinderGeometry(0.72, 0.72, 4.4, 9), 0x5a412c, M4(POST.x - 5, Y + 1.95, POST.z - 23.5, 0, 0, Math.PI / 2));
      // support fixe de la cible : semelle, équerres
      const tz = -24, by = Y;
      add(cbox(10.6, 0.3, 8.8, 0.05), GUNM, M4(POST.x, by + 0.15, POST.z + tz, 0, 0, 0));
      for (const s of [-1, 1]) {
        add(cbox(0.4, 4.6, 0.4, 0.05), STEEL, M4(POST.x + s * 4.3, by + 2.3, POST.z + tz + 1.2));
        add(cbox(0.3, 5.4, 0.3, 0.04), GUNM, M4(POST.x + s * 4.3, by + 2.2, POST.z + tz - 1, 0.62, 0, 0));
        add(cbox(0.75, 0.4, 0.75, 0.05), YEL, M4(POST.x + s * 4.3, by + 0.42, POST.z + tz + 3.4));
      }
      const m = new T.Mesh(merge(parts), MAT.hard); m.castShadow = true; m.receiveShadow = true; STG.add(m);
    }
    // petites braises sur les troncs carbonisés
    {
      const list = [[-6.2, -9, 3], [6.4, -12, 5], [-7.4, -17, 7], [7.2, -20, 2.5], [9.5, -5, 4]];
      const gg = new T.IcosahedronGeometry(0.055, 0), parts = list.flatMap(([x, z, h], i) => [0, 1, 2].map(k => [gg, k ? 0xff6a20 : 0xffa040, M4(POST.x + x + (hash(i, k) - 0.5) * 1.1, Y + h + k * 0.6, POST.z + z + 0.7)]));
      STG.add(new T.Mesh(merge(parts), MAT.glow));
    }
    // herbes hautes autour du couloir de tir
    {
      const m4 = new T.Matrix4(), qt = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3(), v = new T.Vector3(), cc = new T.Color(), list = [];
      for (let k = 0; k < 500 && list.length < 110; k++) {
        const x = POST.x + (hash(k, 31) - 0.5) * 36, z = POST.z - 28 + hash(k, 33) * 42;
        if (Math.abs(x - POST.x) < 7 + hash(k, 35) * 3 && z > TGT.z - 2) continue;
        list.push([x, z, k]);
      }
      const gg = new T.ConeGeometry(0.3, 1.2, 4); gg.translate(0, 0.55, 0);
      const gm = new T.InstancedMesh(gg, new T.MeshStandardMaterial({ roughness: 0.9 }), list.length);
      list.forEach(([x, z, k], j) => { qt.setFromAxisAngle(up, hash(k, 37) * 6.28); sc.set(1, 0.6 + hash(k, 39) * 1.1, 1); v.set(x, API.heightAt(x, z), z); m4.compose(v, qt, sc); gm.setMatrixAt(j, m4); gm.setColorAt(j, cc.setHex(hash(k, 41) < 0.5 ? 0x4e7234 : 0x5d7f3a)); });
      gm.receiveShadow = true; gm.frustumCulled = false; STG.add(gm);
    }
    // la cible
    {
      const pivot = new T.Group(); pivot.position.set(TGT.x, Y + 0.3, TGT.z - PIV); STG.add(pivot);
      const inner = new T.Group(); inner.position.set(0, 0, PIV); pivot.add(inner);
      const trunk = new T.Mesh(buildTrunk(), MAT.wood); trunk.castShadow = true; trunk.receiveShadow = true; inner.add(trunk);
      const cv = document.createElement('canvas'); cv.width = C_W; cv.height = C_H; targetCtx = cv.getContext('2d');
      targetTex = new T.CanvasTexture(cv); targetTex.colorSpace = T.SRGBColorSpace; targetTex.anisotropy = 4;
      paintFreshTarget();
      const face = new T.Mesh(new T.PlaneGeometry(2 * HALF_W, TRUNK.h), new T.MeshStandardMaterial({ map: targetTex, roughness: 0.84 }));
      face.position.set(0, TRUNK.h / 2, TRUNK.face); face.receiveShadow = true; inner.add(face);
      // colliers qui serrent le tronc sur son support, hors de la zone peinte
      const bm = new T.Mesh(strapGeo([[0.95, 1.3], [7.55, 7.9]]), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 })); bm.castShadow = true; inner.add(bm);
      // éclisses plantées dans le bois après les impacts
      const shards = new T.InstancedMesh(new T.BoxGeometry(0.1, 0.07, 1), new T.MeshStandardMaterial({ color: 0xd3ad78, roughness: 0.9 }), 40);
      shards.count = 0; shards.frustumCulled = false; inner.add(shards);
      // cœurs encore incandescents
      FX.embers = [0, 1, 2, 3].map(() => {
        const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xff7a24, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
        s.visible = false; inner.add(s); return s;
      });
      FX.pivot = pivot; FX.inner = inner; FX.shards = shards;
    }
    // le bras mécanique : colonne, flèche télescopique, tige, pince
    {
      const base = new T.Group(); base.position.set(CRANE.x, Y, CRANE.z); STG.add(base);
      const col = new T.Mesh(merge([
        [cbox(3, 0.6, 3, 0.1), GUNM, M4(0, 0.3, 0)],
        [cbox(1.1, CRANE.top, 1.1, 0.14), YEL, M4(0, CRANE.top / 2, 0)],
        [cbox(1.3, 0.3, 1.3, 0.05), BLACK, M4(0, CRANE.top * 0.35, 0)],
        [cbox(1.3, 0.3, 1.3, 0.05), BLACK, M4(0, CRANE.top * 0.7, 0)],
        [cbox(0.3, CRANE.top * 0.62, 0.3, 0.04), STEEL, M4(0.72, CRANE.top * 0.46, 0)],
      ]), MAT.hard); col.castShadow = true; base.add(col);
      const yaw = new T.Group(); yaw.position.y = CRANE.top; base.add(yaw);
      const head = new T.Mesh(merge([[cbox(1.7, 1.1, 1.9, 0.14), YEL, M4(0, 0.1, 0)], [cbox(1.74, 0.16, 1.94, 0.02), BLACK, M4(0, 0.35, 0)]]), MAT.hard); head.castShadow = true; yaw.add(head);
      const boom1 = new T.Mesh(merge([[cbox(0.9, 0.8, 1, 0.1), YEL, M4(0, 0, 0.5)]]), MAT.hard); boom1.castShadow = true; yaw.add(boom1);   // étirée au besoin
      const boom2 = new T.Mesh(merge([[cbox(0.55, 0.5, 1, 0.06), STEEL, M4(0, 0, 0.5)]]), MAT.hard); boom2.castShadow = true; yaw.add(boom2);
      const claw = new T.Group(); STG.add(claw);
      const rod = new T.Mesh(merge([[cbox(0.3, 1, 0.3, 0.04), STEEL, M4(0, -0.5, 0)]]), MAT.hard); STG.add(rod);
      claw.add(new T.Mesh(merge([[cbox(1.6, 0.7, 1.6, 0.12), YEL, M4(0, 0.2, 0)], [cbox(1.64, 0.14, 1.64, 0.02), BLACK, M4(0, 0.42, 0)]]), MAT.hard));
      const fingers = [-1, 1].map(s => {
        const f = new T.Group(); f.position.set(s * 1.0, 0, 0);
        f.add(new T.Mesh(merge([[cbox(0.34, 1.5, 0.9, 0.06), GUNM, M4(s * 0.1, -0.7, 0)], [cbox(0.42, 0.34, 0.9, 0.06), BLACK, M4(-s * 0.06, -1.42, 0)]]), MAT.hard));
        claw.add(f); return f;
      });
      Object.assign(FX, { craneBase: base, craneYaw: yaw, boom1, boom2, claw, rod, fingers });
      poseCrane(...parkClaw(), 1);
    }
    installGuard();
    buildParticles();
    buildFirstPerson();
    buildSoldierProxy();
    STG.traverse(o => { if (o.isInstancedMesh) o.frustumCulled = false; });
    resetSeries();
  }
  const s1 = i => (i % 2 ? 1 : -1);
  const parkClaw = () => [CRANE.x + 9, FX.Y + CRANE.top - 2, CRANE.z - 2];
  // place la pince en (x,y,z) ; la flèche s'oriente et s'allonge, la tige suit
  function poseCrane(x, y, z, open) {
    const topY = FX.Y + CRANE.top, dx = x - CRANE.x, dz = z - CRANE.z, L = Math.max(1.2, Math.hypot(dx, dz));
    FX.craneYaw.rotation.y = Math.atan2(dx, dz);
    FX.boom1.scale.z = Math.max(0.6, L * 0.58); FX.boom2.scale.z = L + 0.3;
    FX.claw.position.set(x, y, z);
    FX.rod.position.set(x, topY + 0.1, z); FX.rod.scale.y = Math.max(0.1, topY + 0.1 - y - 0.4);
    const a = lerp(0.02, 0.5, open);
    FX.fingers[0].rotation.z = a * -1; FX.fingers[1].rotation.z = a;
  }

  /* ───────────────────────── particules : éclats, fumée, étincelles ───────────────────────── */
  function buildParticles() {
    // éclats de bois / mottes de terre, un seul lot réutilisable
    const chips = new T.InstancedMesh(new T.BoxGeometry(0.22, 0.09, 0.42), new T.MeshStandardMaterial({ roughness: 0.9 }), 64);
    chips.frustumCulled = false; chips.count = 64; chips.visible = false;
    const m0 = new T.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < 64; i++) { chips.setMatrixAt(i, m0); chips.setColorAt(i, new T.Color(0xd3ad78)); }
    STG.add(chips);
    FX.chips = chips; FX.chipData = [];
    // fumée et vapeur
    FX.smoke = [];
    for (let i = 0; i < 14; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.smoke, color: 0x8c8a86, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; s.renderOrder = 5; STG.add(s); FX.smoke.push({ s, t: 9, life: 1, vx: 0, vy: 0, vz: 0, o: 0.5, g: 1 });
    }
    // décharge
    const beamG = new T.CylinderGeometry(1, 1, 1, 8, 1, true); beamG.rotateX(Math.PI / 2);
    FX.beam = new T.Mesh(beamG, MAT.beam); FX.beam.renderOrder = 6; FX.beam.visible = false; STG.add(FX.beam);
    FX.beamGlow = new T.Mesh(beamG, MAT.beamGlow); FX.beamGlow.renderOrder = 6; FX.beamGlow.visible = false; STG.add(FX.beamGlow);
    FX.hitFlash = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xffc090, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false }));
    FX.hitFlash.visible = false; FX.hitFlash.renderOrder = 7; STG.add(FX.hitFlash);
  }
  function burstChips(x, y, z, n, hex, speed, up) {
    const c = new T.Color(hex);
    for (let i = 0; i < n; i++) {
      const slot = FX.chipData.findIndex(d => d && d.t >= d.life); const k = slot >= 0 ? slot : FX.chipData.length;
      if (k >= 64) break;
      FX.chipData[k] = { x, y, z, vx: (Math.random() - 0.5) * speed, vy: up * (0.3 + Math.random() * 0.9), vz: 1.2 + Math.random() * speed * 0.75, rx: Math.random() * 6, ry: Math.random() * 6, sp: 6 + Math.random() * 14, t: 0, life: 0.7 + Math.random() * 0.6, sc: 0.55 + Math.random() * 1.1 };
      FX.chips.setColorAt(k, c.clone().multiplyScalar(0.8 + Math.random() * 0.4));
    }
    FX.chips.visible = true; if (FX.chips.instanceColor) FX.chips.instanceColor.needsUpdate = true;
  }
  function puffSmoke(x, y, z, n, opts = {}) {
    let c = 0;
    for (const p of FX.smoke) {
      if (p.t < p.life) continue;
      p.t = 0; p.life = (opts.life || 0.9) * (0.75 + Math.random() * 0.5);
      p.vx = (Math.random() - 0.5) * (opts.spread || 1.6); p.vy = (opts.rise || 1.6) * (0.7 + Math.random() * 0.6); p.vz = (Math.random() - 0.2) * (opts.spread || 1.6);
      p.o = opts.o || 0.5; p.g = opts.grow || 2.2; p.s0 = opts.size || 1.5;
      p.s.material.color.setHex(opts.col || 0x8c8a86);
      p.s.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      p.s.visible = true; if (++c >= n) break;
    }
  }
  function particlesTick(dt) {
    let any = false; const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), SC = new T.Vector3(), Y = FX.Y;
    FX.chipData.forEach((d, i) => {
      if (!d || d.t >= d.life) return;
      d.t += dt; d.vy -= 22 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.sp * dt; d.ry += d.sp * 0.7 * dt;
      if (d.y < Y + 0.1) { d.y = Y + 0.1; d.vy = Math.abs(d.vy) * 0.25; d.vx *= 0.5; d.vz *= 0.5; }
      if (d.t >= d.life) { FX.chips.setMatrixAt(i, M.makeScale(0, 0, 0)); any = true; return; }
      const s = d.sc * (d.t > d.life - 0.15 ? (d.life - d.t) / 0.15 : 1);
      E.set(d.rx, d.ry, 0); Q.setFromEuler(E); V.set(d.x, d.y, d.z); SC.setScalar(s); FX.chips.setMatrixAt(i, M.compose(V, Q, SC)); any = true;
    });
    if (any) FX.chips.instanceMatrix.needsUpdate = true;
    for (const p of FX.smoke) {
      if (p.t >= p.life) { if (p.s.visible) p.s.visible = false; continue; }
      p.t += dt; const k = p.t / p.life;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.material.opacity = Math.max(0, p.o * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88));
      p.s.scale.setScalar(p.s0 * (1 + k * p.g));
    }
    if (FX.beamT > 0) {
      FX.beamT -= dt; const k = clamp(FX.beamT / 0.085, 0, 1);
      MAT.beam.opacity = k; MAT.beamGlow.opacity = 0.4 * k;
      if (FX.beamT <= 0) { FX.beam.visible = false; FX.beamGlow.visible = false; }
    }
    if (FX.hitT > 0) {
      FX.hitT -= dt; const k = clamp(FX.hitT / 0.14, 0, 1);
      FX.hitFlash.material.opacity = k * 0.8; FX.hitFlash.scale.setScalar(1.6 + (1 - k) * 2.6);
      if (FX.hitT <= 0) FX.hitFlash.visible = false;
    }
    FX.embers.forEach(s => {
      if (!s.visible) return;
      s.userData.t += dt; const k = s.userData.t / 3.4;
      if (k >= 1) { s.visible = false; return; }
      s.material.opacity = (1 - k) * (0.85 + Math.sin(s.userData.t * 19) * 0.12);
      s.material.color.setHex(k < 0.3 ? 0xffb050 : k < 0.65 ? 0xff6a20 : 0xb02a10);
      s.scale.setScalar(1.25 - k * 0.6);
    });
    // lumière de la décharge : deux lampes de la réserve (leur nombre ne change jamais, donc pas de recompilation)
    if (FX.lightT > 0) {
      FX.lightT -= dt; const k = clamp(FX.lightT / 0.11, 0, 1), pool = P._pool;
      if (pool) {
        pool[7].position.copy(FX.lightA); pool[7].color.setHex(0xff9a60); pool[7].distance = 40; pool[7].intensity = 34 * k;
        pool[6].position.copy(FX.lightB); pool[6].color.setHex(0xffa870); pool[6].distance = 30; pool[6].intensity = 46 * k;
        if (FX.lightT <= 0) { pool[7].intensity = 0; pool[6].intensity = 0; P._lightAt = 0; }
      }
    }
  }

  /* ── garde-fou d'image : quand une lampe se trouve exactement dans l'axe caméra-surface, l'éclairage du moteur produit
     un pixel invalide (NaN). Le passage de lueur l'étale alors sur toute l'image, qui disparaît le temps d'une image.
     La vue au ras du sol y est très exposée : pendant le stand, ces pixels sont nettoyés juste avant la lueur. ── */
  let guardPass = null;
  function installGuard() {
    if (guardPass || !P.composer) return;
    const mat = new T.ShaderMaterial({
      uniforms: { t: { value: null } },
      vertexShader: 'varying vec2 u; void main(){ u = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 u; void main(){ vec4 c = texture2D(t, u); if (isnan(c.r) || isnan(c.g) || isnan(c.b) || isinf(c.r) || isinf(c.g) || isinf(c.b)) c = vec4(0., 0., 0., 1.); gl_FragColor = c; }',
      depthTest: false, depthWrite: false,
    });
    const scene = new T.Scene(), cam = new T.Camera(), quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false; scene.add(quad);
    guardPass = {
      enabled: false, needsSwap: true, clear: false, renderToScreen: false, setSize() {}, dispose() {},
      render(r, write, read) { mat.uniforms.t.value = read.texture; r.setRenderTarget(write); r.render(scene, cam); },
    };
    P.composer.passes.splice(1, 0, guardPass);
  }

  /* ───────────────────────── vue à la première personne ───────────────────────── */
  const FP = { on: false, group: null, gun: null, kick: 0, chamber: 0.5, yaw: 0, pitch: 0, kp: 0, ky: 0, t: 0, st: 'off', stT: 0, shots: 0, score: 0, want: false, isNew: false, recoilSign: 1, noSway: false, ptr: null, saved: null, dir: null, repT: 0, lastHit: null, marks: [], };
  function buildFirstPerson() {
    const g = new T.Group(); g.visible = false; STG.add(g);
    const gun = new T.Group(); g.add(gun);
    const a = buildGun();
    const body = new T.Mesh(a.body, MAT.gun); gun.add(body);
    gun.add(new T.Mesh(a.glow, MAT.glow));
    const glass = new T.Mesh(cylz(0.088, 0.088, 0.34, 12), MAT.glass); glass.position.set(0, 0.26, -0.59); glass.renderOrder = 3; gun.add(glass);
    const core = new T.Mesh(cylz(0.056, 0.056, 0.3, 10), MAT.core); core.position.set(0, 0.26, -0.6); gun.add(core);
    FP.core = core;
    FP.chamberHalo = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xff5a24, transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    FP.chamberHalo.position.set(0, 0.26, -0.44); FP.chamberHalo.scale.setScalar(0.42); gun.add(FP.chamberHalo);
    // bras : main droite sur la poignée latérale, main gauche à l'avant
    const armR = new T.Mesh(gauntlet(1, 0.25, -0.1, -1.02, 1.05, -1.25, 0.3), MAT.gun); gun.add(armR);
    const armL = new T.Mesh(gauntlet(-1, -0.36, -0.24, -1.7, -1.1, -1.5, -0.2), MAT.gun); gun.add(armL);
    const flash = new T.Sprite(new T.SpriteMaterial({ map: TEX.star, color: 0xffe2c8, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false }));
    flash.position.set(0, 0, -2.75); flash.scale.setScalar(1.1); flash.visible = false; flash.renderOrder = 8; gun.add(flash);
    // quatre témoins sur la plaque arrière : les tirs qui restent dans la série
    FP.leds = [0, 1, 2, 3].map(i => {
      const m = new T.Mesh(cbox(0.022, 0.012, 0.05, 0.003), new T.MeshBasicMaterial({ color: 0xff5a24, toneMapped: false }));
      m.position.set((i - 1.5) * 0.034, 0.185, -0.34); gun.add(m); return m;
    });
    const muzzle = new T.Object3D(); muzzle.position.set(0, 0, MUZZLE.z); gun.add(muzzle);
    const vent = new T.Object3D(); vent.position.set(0, 0.32, -0.59); gun.add(vent);
    FP.group = g; FP.gun = gun; FP.flash = flash; FP.muzzle = muzzle; FP.vent = vent;
    // ciel (la caméra de la carte ne le voit jamais)
    const skyG = new T.SphereGeometry(1100, 24, 12); const cols = new Float32Array(skyG.attributes.position.count * 3); skyG.setAttribute('color', new T.BufferAttribute(cols, 3));
    const sky = new T.Mesh(skyG, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false, toneMapped: true }));
    sky.position.set(POST.x, 0, POST.z); sky.visible = false; sky.renderOrder = -5; sky.frustumCulled = false; STG.add(sky);
    FP.sky = sky;
    // la forêt resserrée autour du couloir, seulement depuis le poste de tir : la carte reste aérée
    const tp = [], pine = (x, z, h, i) => {
      const y0 = API.heightAt(x, z), cols = [0x28492a, 0x315732, 0x223f25, 0x3a6236], c = cols[i % 4];
      tp.push([new T.CylinderGeometry(h * 0.018, h * 0.03, h * 0.22, 6), 0x33261a, M4(x, y0 + h * 0.1, z)]);
      [[0.16, 0.5, 0.2], [0.4, 0.42, 0.155], [0.62, 0.38, 0.105]].forEach(([b, hh, rr], k) => {
        const cone = new T.ConeGeometry(h * rr, h * hh, 7); cone.translate(0, h * (b + hh / 2), 0);
        tp.push([cone, c, M4(x, y0, z, 0, hash(i, k) * 3, 0)]);
      });
    };
    for (let k = 0; k < 16; k++) pine(TGT.x + (k - 7.5) * 3.4 + (hash(k, 71) - 0.5) * 2.5, TGT.z - 26 - hash(k, 73) * 26, 22 + hash(k, 75) * 15, k);
    for (let k = 0; k < 14; k++) { const s = k % 2 ? 1 : -1; pine(TGT.x + s * (11 + hash(k, 77) * 18), TGT.z - 8 - hash(k, 79) * 18, 27 + hash(k, 81) * 15, k + 3); }
    for (let k = 0; k < 10; k++) { const s = k % 2 ? 1 : -1; pine(POST.x + s * (20 + hash(k, 83) * 8), TGT.z + 2 + hash(k, 85) * 28, 24 + hash(k, 87) * 12, k + 5); }
    const frame = new T.Mesh(merge(tp), MAT.wood); frame.visible = false; frame.frustumCulled = false; STG.add(frame); FP.frame = frame;
  }
  function paintSky() {
    const k = window.SBSky && SBSky.k != null ? SBSky.k : 1, bg = P.scene.background && P.scene.background.isColor ? P.scene.background : new T.Color(0x8fa6b8);
    if (FP.skyK !== undefined && Math.abs(FP.skyK - k) < 0.02) return; FP.skyK = k;
    const horizon = bg.clone(), zenith = new T.Color(0x05101f).lerp(new T.Color(0x4f7fae), k), pa = FP.sky.geometry.attributes.position, c = FP.sky.geometry.attributes.color, cc = new T.Color();
    for (let i = 0; i < pa.count; i++) { const u = clamp(pa.getY(i) / 1100, 0, 1); cc.copy(horizon).lerp(zenith, Math.pow(u, 0.55)); c.setXYZ(i, cc.r, cc.g, cc.b); }
    c.needsUpdate = true;
  }
  const faceZ = () => TGT.z + TRUNK.face;
  const targetCenter = () => [TGT.x, FX.Y + EYE, faceZ()];
  const dirOf = (yaw, pitch) => new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  // visée brute + oscillation + recul : c'est exactement là que partira le tir
  function currentAim() {
    const w = 2 * Math.PI * CFG.swayHz, t = FP.t, s = FP.noSway ? 0 : 1;
    const sy = s * rad(CFG.swayYaw) * (Math.sin(w * t) + 0.3 * Math.sin(w * 1.7 * t + 1)) / 1.3, sp = s * rad(CFG.swayPitch) * (Math.sin(w * 1.3 * t + 0.7) + 0.25 * Math.sin(w * 2.1 * t)) / 1.25;
    return { yaw: FP.yaw + sy + rad(FP.ky), pitch: FP.pitch + sp + rad(FP.kp) };
  }
  // le résultat d'un tir : uniquement la géométrie du point visé
  function scoreAt(dist) { for (const [f, pts] of ZONES) if (dist <= f * TARGET_R) return pts; return 0; }
  function traceShot(o, d) {
    const Y = FX.Y;
    const out = { kind: 'sky', pts: 0, p: o.clone().addScaledVector(d, 400) };
    if (d.z < -1e-4) {
      const t = (faceZ() - o.z) / d.z, p = o.clone().addScaledVector(d, t), lx = p.x - TGT.x, ly = p.y - (Y + EYE);
      const dist = Math.hypot(lx, ly), halfW = Math.sqrt(TRUNK.r * TRUNK.r - TRUNK.face * TRUNK.face);
      if (dist <= TARGET_R) return { kind: 'target', pts: scoreAt(dist), p, lx, ly, dist };
      if (Math.abs(lx) <= halfW && p.y >= Y + 0.3 && p.y <= Y + 0.3 + TRUNK.h) return { kind: 'face', pts: 0, p, lx, ly, dist };
      if (Math.abs(lx) <= TRUNK.r) {   // flanc arrondi
        const az = TGT.z + Math.sqrt(Math.max(0, TRUNK.r * TRUNK.r - lx * lx)), t2 = (az - o.z) / d.z, p2 = o.clone().addScaledVector(d, t2);
        if (p2.y >= Y + 0.3 && p2.y <= Y + 0.3 + TRUNK.h) return { kind: 'bark', pts: 0, p: p2, dist };
      }
    }
    // butte (ellipsoïde), puis sol
    const ox = (o.x - BUTTE.x) / BUTTE.rx, oy = (o.y - (Y - 0.5)) / BUTTE.ry, oz = (o.z - BUTTE.z) / BUTTE.rz, dx = d.x / BUTTE.rx, dy = d.y / BUTTE.ry, dz = d.z / BUTTE.rz;
    const a = dx * dx + dy * dy + dz * dz, b = 2 * (ox * dx + oy * dy + oz * dz), c = ox * ox + oy * oy + oz * oz - 1, disc = b * b - 4 * a * c;
    let best = 1e9, kind = null;
    if (disc > 0) { const t = (-b - Math.sqrt(disc)) / (2 * a); if (t > 0) { best = t; kind = 'butte'; } }
    if (d.y < -1e-4) { const t = (Y + 0.1 - o.y) / d.y; if (t > 0 && t < best) { best = t; kind = 'ground'; } }
    if (kind) { out.kind = kind; out.p = o.clone().addScaledVector(d, best); }
    return out;
  }

  /* ── états de la série ── */
  function setState(s) { FP.st = s; FP.stT = 0; updateHUD(); }
  function resetSeries() {
    FP.shots = 0; FP.score = 0; FP.want = false; FP.isNew = false; FP.marks = [];
    paintFreshTarget();
    if (FX.shards) { FX.shards.count = 0; FX.shards.instanceMatrix.needsUpdate = true; }
    if (FX.embers) FX.embers.forEach(s => { s.visible = false; });
    if (FX.pivot) { FX.pivot.rotation.x = 0; FX.pivot.position.set(TGT.x, FX.Y + 0.3, TGT.z - PIV); }
  }
  function fire() {
    if (!FP.on || FP.st !== 'ready' || FP.shots >= CFG.shots) return false;
    setState('charge');
    sfx('stCharge');
    if (UI.hint && !UI.hint.hidden) { UI.hint.hidden = true; }
    return true;
  }
  function discharge() {
    const cam = P.camera, a = currentAim(), d = dirOf(a.yaw, a.pitch), o = cam.position.clone();
    const hit = traceShot(o, d);
    FP.shots++; FP.score += hit.pts; FP.lastHit = hit;
    // bras et caméra
    FP.kick = 1; FP.kp += CFG.kickPitch; FP.ky += CFG.kickYaw * FP.recoilSign;
    FP.pitch = clamp(FP.pitch + rad(CFG.stayPitch), rad(-CFG.limitPitch), rad(CFG.limitPitch));
    FP.yaw = clamp(FP.yaw + rad(CFG.stayYaw) * FP.recoilSign, rad(-CFG.limitYaw), rad(CFG.limitYaw));
    FP.recoilSign *= -1;
    FP.chamber = 0.04;
    // rayon
    FP.group.updateMatrixWorld(true);
    const m = new T.Vector3(); FP.muzzle.getWorldPosition(m);
    const span = hit.p.clone().sub(m), len = span.length();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), span.clone().normalize()), mid = m.clone().addScaledVector(span, 0.5);
    FX.beam.position.copy(mid); FX.beam.quaternion.copy(q); FX.beam.scale.set(0.055, 0.055, len);
    FX.beamGlow.position.copy(mid); FX.beamGlow.quaternion.copy(q); FX.beamGlow.scale.set(0.2, 0.2, len);
    FX.beam.visible = true; FX.beamGlow.visible = true; FX.beamT = 0.085; MAT.beam.opacity = 1; MAT.beamGlow.opacity = 0.4;
    FP.flash.visible = true; FP.flash.material.opacity = 1; FP.flash.material.rotation = FP.shots * 0.7; FP.flashT = 0.07;
    FX.lightT = 0.11;
    FX.lightA = m.clone().add(new T.Vector3(0, 0.35, -0.6)); FX.lightB = hit.p.clone().add(new T.Vector3(0, 0.6, 2));
    screenFlash();
    sfx('stShot');
    if (navigator.vibrate) { try { navigator.vibrate(26); } catch (e) {} }
    impact(hit);
    setState(FP.shots >= CFG.shots ? 'last' : 'recovery');
    return hit;
  }
  function impact(hit) {
    const p = hit.p, Y = FX.Y;
    const onWood = hit.kind === 'target' || hit.kind === 'face' || hit.kind === 'bark';
    if (hit.kind !== 'sky') {
      FX.hitFlash.position.copy(p); FX.hitFlash.position.z += 0.2; FX.hitFlash.visible = true; FX.hitFlash.material.opacity = 1; FX.hitT = 0.14;
    }
    if (onWood) {
      burstChips(p.x, p.y, p.z + 0.1, 20, 0xd3ad78, 9, 8);
      burstChips(p.x, p.y, p.z + 0.1, 5, 0x241a12, 7, 7);
      puffSmoke(p.x, p.y, p.z + 0.4, 4, { o: 0.42, size: 1.1, rise: 1.8, life: 0.95, col: 0x75716c });
      sfx('stWood', 0.03);
      const n = FP.shots - 1;
      if (hit.kind !== 'bark') {
        paintImpact(hit.lx, hit.ly, n);
        addShards(hit.lx, hit.ly, n);
      }
      const e = FX.embers[n % 4]; e.position.set(hit.lx != null ? hit.lx : p.x - TGT.x, p.y - (Y + 0.3), (hit.kind === 'bark' ? p.z - TGT.z : TRUNK.face) + 0.14); e.visible = true; e.userData.t = 0; e.scale.setScalar(1.25); e.material.opacity = 1;
    } else if (hit.kind === 'butte' || hit.kind === 'ground') {
      burstChips(p.x, p.y + 0.2, p.z + 0.2, 16, 0x5c452f, 8, 9);
      puffSmoke(p.x, p.y + 0.3, p.z + 0.4, 4, { o: 0.5, size: 1.6, rise: 2, life: 0.9, col: 0x6f5e4a });
      sfx('stDirt', 0.04);
    }
    showPoints(hit);
  }
  function addShards(lx, ly, n) {
    const im = FX.shards, M = new T.Matrix4(), E = new T.Euler(), Q = new T.Quaternion(), V = new T.Vector3(), S = new T.Vector3();
    for (let i = 0; i < 5 && im.count < 40; i++) {
      const a = i / 5 * 6.2832 + hash(n, i) * 0.9, r = 0.52 + hash(n, i + 9) * 0.26, l = 0.35 + hash(n, i + 20) * 0.5;
      V.set(lx + Math.cos(a) * r, EYE - 0.3 + ly + Math.sin(a) * r, TRUNK.face + 0.2);
      E.set(-Math.sin(a) * 0.9, Math.cos(a) * 0.9, 0); Q.setFromEuler(E); S.set(1, 1, l);
      im.setMatrixAt(im.count++, M.compose(V, Q, S));
    }
    im.instanceMatrix.needsUpdate = true;
  }
  function finishSeries() {
    FP.isNew = saveBest(FP.score);
    setState('result');
  }
  function startSeries() {
    resetSeries();
    FP.yaw = rad(-2.2); FP.pitch = rad(1.6); FP.kp = 0; FP.ky = 0; FP.chamber = 0.6;
    setState('ready');
  }
  // remplacement : le tronc bascule contre la butte, la pince le relève et l'emporte hors du cadre, puis ramène un tronc neuf
  const REP = { topple: 0.6, rest: 0.12, swing: 0.55, grab: 0.28, lift: 0.5, out: 0.45, back: 0.45, lower: 0.42, seat: 0.14, away: 0.7 };
  const REP_T = (() => { let t = 0; const o = {}; for (const k of ['topple', 'rest', 'swing', 'grab', 'lift', 'out', 'back', 'lower', 'seat', 'away']) { o[k] = t; t += REP[k]; } o.end = t; return o; })();
  const REP_END = REP_T.away;       // la cible est prête ici ; le bras se replie ensuite
  const TILT = -1.05, LIFT = 5.4, EXIT = { x: 14, z: 11 };   // sortie du cadre, relative à la cible
  const polar = (x, z) => ({ a: Math.atan2(x - CRANE.x, z - CRANE.z), r: Math.hypot(x - CRANE.x, z - CRANE.z) });
  const unpolar = (a, r) => [CRANE.x + Math.sin(a) * r, CRANE.z + Math.cos(a) * r];
  const seg = (t, name) => clamp((t - REP_T[name]) / REP[name], 0, 1);
  function trunkTop(rx, lift, px = 0, pz = 0) {
    const H = TRUNK.h, s = Math.sin(rx), c = Math.cos(rx);
    return [TGT.x + px, FX.Y + 0.3 + lift + H * c - PIV * s, TGT.z - PIV + pz + H * s + PIV * c];
  }
  function replacingPose(t) {
    const park = parkClaw(), hold = 0.95;
    let rx = 0, lift = 0, px = 0, pz = 0, open = 1, claw = park;
    const fallen = trunkTop(TILT, 0);
    if (t < REP_T.swing) {
      const k = seg(t, 'topple');
      rx = TILT * k * k + (t >= REP_T.rest ? Math.sin(seg(t, 'rest') * Math.PI) * 0.05 : 0);
    } else if (t < REP_T.grab) {
      rx = TILT;
      const k = sstep(0, 1, seg(t, 'swing')), a = polar(park[0], park[2]), b = polar(fallen[0], fallen[2]);
      const [x, z] = unpolar(lerp(a.a, b.a, k), lerp(a.r, b.r, k));
      claw = [x, lerp(park[1], fallen[1] + hold + 2.2, k), z];
    } else if (t < REP_T.lift) {
      rx = TILT;
      const k = seg(t, 'grab');
      claw = [fallen[0], lerp(fallen[1] + hold + 2.2, fallen[1] + hold, k), fallen[2]]; open = 1 - sstep(0.55, 1, k);
    } else if (t < REP_T.out) {
      const k = sstep(0, 1, seg(t, 'lift'));
      rx = TILT * (1 - k); lift = LIFT * k; open = 0;
      const top = trunkTop(rx, lift); claw = [top[0], top[1] + hold, top[2]];
    } else if (t < REP_T.lower) {
      // emporté puis ramené en arc de cercle autour de la colonne, en passant du côté du joueur
      const up = trunkTop(0, 0), A = polar(up[0], up[2]), B = polar(TGT.x + EXIT.x, TGT.z + EXIT.z);
      const k = t < REP_T.back ? sstep(0, 1, seg(t, 'out')) : 1 - sstep(0, 1, seg(t, 'back'));
      const [x, z] = unpolar(lerp(A.a, B.a, k), lerp(A.r, B.r, k));
      lift = LIFT; open = 0; px = x - up[0]; pz = z - up[2];
      const top = trunkTop(0, lift, px, pz); claw = [top[0], top[1] + hold, top[2]];
    } else if (t < REP_T.seat) {
      const k = seg(t, 'lower'); lift = LIFT * (1 - k * k); open = 0;
      const top = trunkTop(0, lift); claw = [top[0], top[1] + hold, top[2]];
    } else if (t < REP_T.away) {
      const top = trunkTop(0, 0); claw = [top[0], top[1] + hold, top[2]]; open = seg(t, 'seat');
    } else {
      const top = trunkTop(0, 0), k = sstep(0, 1, seg(t, 'away'));
      const a = polar(top[0], top[2]), b = polar(park[0], park[2]), [x, z] = unpolar(lerp(a.a, b.a, k), lerp(a.r, b.r, k));
      claw = [x, lerp(top[1] + hold, park[1], k), z];
    }
    return { rx, lift, px, pz, claw, open, swap: t >= REP_T.back };
  }
  function replacingTick(dt) {
    FP.repT += dt;
    const p = replacingPose(FP.repT), t = FP.repT, m = FP.repMarks;
    FX.pivot.rotation.x = p.rx;
    FX.pivot.position.set(TGT.x + p.px, FX.Y + 0.3 + p.lift, TGT.z - PIV + p.pz);
    poseCrane(p.claw[0], p.claw[1], p.claw[2], p.open);
    if (p.swap && !FP.repSwapped) { FP.repSwapped = true; resetDamage(); }
    if (!m.c) { m.c = true; sfx('stCrack'); }
    if (t > REP_T.rest && !m.t) { m.t = true; sfx('stThud'); puffSmoke(TGT.x, FX.Y + 6, TGT.z - 8, 4, { o: 0.45, size: 2.4, rise: 1, life: 1.1, col: 0x7a6650, spread: 3 }); }
    if (t > REP_T.swing && !m.a) { m.a = true; sfx('stCrane'); }
    if (t > REP_T.grab + REP.grab * 0.7 && !m.g) { m.g = true; sfx('stLock'); }
    if (t > REP_T.lift && !m.l) { m.l = true; sfx('stCrane'); }
    if (t > REP_T.back && !m.b) { m.b = true; sfx('stCrane'); }
    if (t > REP_T.seat && !m.s) { m.s = true; sfx('stThud'); sfx('stLock', 0.08); puffSmoke(TGT.x, FX.Y + 0.6, TGT.z + 3, 3, { o: 0.35, size: 1.6, rise: 0.8, life: 0.8, col: 0x7a6650, spread: 3 }); }
    if (FP.st === 'replacing' && t >= REP_END) {
      FP.shots = 0; FP.score = 0;
      setState('waiting');
      if (FP.want) startSeries();
    }
  }
  function resetDamage() {
    paintFreshTarget();
    FX.shards.count = 0; FX.shards.instanceMatrix.needsUpdate = true;
    FX.embers.forEach(s => { s.visible = false; });
  }
  function replay() {
    if (FP.st === 'waiting') { startSeries(); return; }
    if (FP.st === 'result' || FP.st === 'replacing') { FP.want = true; updateHUD(); }
  }

  /* ───────────────────────── boucle ───────────────────────── */
  function tick(dt0) {
    if (!built) return;
    const dt = dt0 * (CFG.timeScale || 1);
    placeOffer();
    soldierLOD();
    particlesTick(dt);
    if (FP.flashT > 0) { FP.flashT -= dt; FP.flash.material.opacity = clamp(FP.flashT / 0.07, 0, 1); FP.flash.scale.setScalar(0.9 + (1 - FP.flash.material.opacity) * 0.8); if (FP.flashT <= 0) FP.flash.visible = false; }
    if (FP.on && FP.repT > 0 && FP.repT < REP_T.end) replacingTick(dt);
    if (!FP.on) return;
    FP.t += dt; FP.stT += dt;
    // recul qui s'amortit
    const ka = Math.exp(-dt * 7.5); FP.kp *= ka; FP.ky *= ka;
    FP.kick *= Math.exp(-dt * 8.5);
    FP.chamber += ((FP.st === 'charge' ? 1.6 : (FP.st === 'ready' ? 0.62 : 0.3)) - FP.chamber) * Math.min(1, dt * (FP.st === 'charge' ? 18 : 2.6));
    switch (FP.st) {
      case 'charge': if (FP.stT >= CFG.charge) discharge(); break;
      case 'recovery':
        if (FP.stT >= 0.34 && !FP.vented) { FP.vented = true; vent(); }
        if (FP.stT >= CFG.recovery) { FP.vented = false; setState('ready'); }
        break;
      case 'last':
        if (FP.stT >= 0.34 && !FP.vented) { FP.vented = true; vent(); }
        if (FP.stT >= CFG.resultDelay) { FP.vented = false; finishSeries(); }
        break;
      case 'result':
        if (FP.stT >= 0.5) { FP.repT = 1e-4; FP.repSwapped = false; FP.repMarks = {}; setState('replacing'); }
        break;
    }
    // caméra : la position ne bouge jamais, seule l'orientation change
    const a = currentAim(), d = dirOf(a.yaw, a.pitch), cam = P.camera;
    P.controls.target.copy(cam.position).addScaledVector(d, 24);
    cam.lookAt(P.controls.target);
    cam.updateMatrixWorld();
    // l'arme suit la caméra, avec le recul et un léger balancement
    FP.group.position.copy(cam.position); FP.group.quaternion.copy(cam.quaternion);
    const bob = Math.sin(FP.t * 1.6) * 0.006, gp = cam.aspect > 1 ? CFG.gunWide : CFG.gunTall;
    FP.gun.scale.setScalar(gp.s);
    FP.gun.position.set(gp.x + Math.sin(FP.t * 0.9) * 0.005, gp.y + bob - FP.kick * 0.015, gp.z + FP.kick * 0.34);
    FP.gun.rotation.set(gp.tilt + FP.kick * 0.15, 0, Math.sin(FP.t * 0.7) * 0.004);
    // chambre d'énergie
    const lvl = FP.chamber * (0.9 + Math.sin(FP.t * 7) * 0.1);
    MAT.core.color.setRGB(1 * Math.min(1.6, lvl + 0.1), 0.34 * lvl, 0.12 * lvl);
    FP.chamberHalo.material.opacity = clamp(lvl * 0.62, 0, 0.9);
    FP.chamberHalo.scale.setScalar(0.3 + lvl * 0.2);
    // réticule qui montre la récupération
    FP.leds.forEach((m, i) => { const left = CFG.shots - FP.shots; m.material.color.setHex(i < left ? 0xff5a24 : 0x241210); });
    if (UI.ring) { const f = FP.st === 'recovery' ? clamp(FP.stT / CFG.recovery, 0, 1) : (FP.st === 'ready' || FP.st === 'charge' ? 1 : 0); UI.ring.setAttribute('stroke-dashoffset', ((1 - f) * 100).toFixed(1)); }
    if (window.SBFluid) SBFluid.poke();
  }
  function vent() {
    FP.group.updateMatrixWorld(true);
    const v = new T.Vector3(); FP.vent.getWorldPosition(v);
    puffSmoke(v.x, v.y, v.z, 3, { o: 0.22, size: 0.28, rise: 0.5, life: 0.8, grow: 2.6, spread: 0.3, col: 0xd8d8d4 });
    sfx('stVent');
  }

  /* ───────────────────────── entrer, sortir ───────────────────────── */
  function openFP() {
    if (FP.on || FP.moving || !built || !API.active) return;
    hideOffer();
    FP.moving = true;
    const veil = document.getElementById('sbx-veil'); if (veil) veil.classList.add('on');
    setTimeout(() => {
      try {
        const c = P.controls, cam = P.camera;
        const damp = c.enableDamping; c.enableDamping = false; c.update();
        FP.saved = { pos: cam.position.clone(), tgt: c.target.clone(), min: c.minDistance, max: c.maxDistance, fov: cam.fov, near: cam.near, far: cam.far, damp, enabled: c.enabled };
        P._focusAnim = null; c.enabled = false; c.minDistance = 0.05; c.maxDistance = 5000;
        cam.fov = cam.aspect < 1 ? 58 : 44; cam.near = 0.2; cam.far = 2400; cam.updateProjectionMatrix();
        cam.position.set(POST.x, FX.Y + EYE, POST.z);
        FP.on = true; FP.t = 0; FP.kick = 0; FP.flashT = 0; FP.recoilSign = 1; FP.vented = false;
        FP.repT = 0; poseCrane(...parkClaw(), 1);
        FP.group.visible = true; FP.sky.visible = true; FP.frame.visible = true; paintSky();
        if (guardPass) guardPass.enabled = true;
        document.getElementById('scr-planet').classList.add('sbs-on');
        startSeries();
        UI.hint.hidden = !!(typeof G !== 'undefined' && G.explore && G.explore.standSeries);
        tick(0);
      } catch (e) { console.warn('[stand] entrée', e); }
      if (veil) veil.classList.remove('on');
      setTimeout(() => { FP.moving = false; }, 300);
    }, 250);
  }
  function restoreCamera() {
    const c = P.controls, cam = P.camera, s = FP.saved; if (!s) return;
    cam.fov = s.fov; cam.near = s.near; cam.far = s.far; cam.updateProjectionMatrix();
    c.minDistance = s.min; c.maxDistance = s.max; c.enabled = s.enabled; c.enableDamping = false;
    c.target.copy(s.tgt); cam.position.copy(s.pos); c.update(); c.enableDamping = s.damp;
    FP.saved = null;
  }
  function closeFP(immediate) {
    if (!FP.on || (FP.moving && !immediate)) return;
    const finish = () => {
      FP.on = false; FP.ptr = null; FP.st = 'off'; FP.repT = 0;
      document.getElementById('scr-planet').classList.remove('sbs-on');
      FP.group.visible = false; FP.sky.visible = false; FP.frame.visible = false; FP.flash.visible = false;
      if (guardPass) guardPass.enabled = false;
      FX.beam.visible = false; FX.beamGlow.visible = false; FX.hitFlash.visible = false; FX.beamT = 0; FX.hitT = 0; FX.lightT = 0;
      if (P._pool) { P._pool[7].intensity = 0; P._pool[6].intensity = 0; }
      resetSeries();
      poseCrane(...parkClaw(), 1);
      restoreCamera();
      soldierLOD(true);
    };
    if (immediate) { finish(); FP.moving = false; return; }
    FP.moving = true;
    const veil = document.getElementById('sbx-veil'); if (veil) veil.classList.add('on');
    setTimeout(() => { try { finish(); } catch (e) { console.warn('[stand] sortie', e); } if (veil) veil.classList.remove('on'); setTimeout(() => { FP.moving = false; }, 300); }, 250);
  }

  /* ───────────────────────── le soldat à l'entraînement ───────────────────────── */
  const SOL = { proxy: null, full: null, loading: false };
  function buildSoldierProxy() {
    const p = [], add = (g, c, m) => p.push([g, c, m]), s = 2.35;
    const at = (x, y, z, rx = 0, ry = 0, rz = 0, a = 1, b = a, c = a) => M4(x * s, y * s, z * s, rx, ry, rz, a, b, c);
    add(cbox(0.3 * s, 0.82 * s, 0.34 * s, 0.05), SUIT, at(-0.18, 0.42, 0)); add(cbox(0.3 * s, 0.82 * s, 0.34 * s, 0.05), SUIT, at(0.18, 0.42, 0));
    add(cbox(0.68 * s, 0.72 * s, 0.44 * s, 0.1), RED, at(0, 1.2, 0)); add(cbox(0.72 * s, 0.14 * s, 0.46 * s, 0.03), BLACK, at(0, 0.88, 0));
    add(cbox(0.3 * s, 0.26 * s, 0.34 * s, 0.07), ARMOR, at(0, 1.72, -0.02));
    add(cbox(0.3 * s, 0.25 * s, 0.34 * s, 0.05), RED, at(-0.46, 1.42, 0)); add(cbox(0.3 * s, 0.25 * s, 0.34 * s, 0.05), RED, at(0.46, 1.42, 0));
    add(cbox(0.17 * s, 0.17 * s, 0.56 * s, 0.03), ARMOR, at(-0.3, 1.26, -0.32)); add(cbox(0.17 * s, 0.17 * s, 0.56 * s, 0.03), ARMOR, at(0.3, 1.26, -0.32));
    add(cbox(0.2 * s, 0.2 * s, 1.1 * s, 0.03), GUNM, at(0, 1.3, -0.82));
    const m = new T.Mesh(merge(p), MAT.hard); m.castShadow = true; m.position.set(POST.x, FX.Y, POST.z); STG.add(m);
    SOL.proxy = m;
  }
  function soldierLOD(force) {
    if (!SOL.proxy) return;
    const fp = FP.on, near = !fp && API.active && P.camera.position.distanceTo(SOL.proxy.position) < 230;
    if (near && !SOL.full && !SOL.loading && P._ld) {
      SOL.loading = true;
      P._ld.loadAsync('assets/3d/sb_heavy_rp.glb?v=20261011b').then(g => {
        const o = g.scene; o.scale.setScalar(2.4); o.position.set(POST.x, FX.Y, POST.z); o.rotation.y = SOL_YAW;
        o.traverse(c => {
          if (!c.isMesh) return;
          c.castShadow = true;
          const t = SOL_MATS[c.material && c.material.name];
          if (t) { c.material.color.setHex(t[0]); c.material.roughness = t[1]; c.material.metalness = t[2]; }
        });
        o.visible = false; STG.add(o); SOL.full = o;
      }).catch(e => console.warn('[stand] soldat', e));
    }
    SOL.proxy.visible = !fp && !(near && SOL.full);
    if (SOL.full) SOL.full.visible = !fp && near;
  }
  const SOL_YAW = Math.PI / 2;   // le fusil du modèle pointe vers la cible
  const SOL_MATS = {
    M_RP_RED: [9310229, 0.36, 0.15], M_RP_ARMOR: [2895669, 0.42, 0.3], M_RP_STEEL: [7764868, 0.35, 0.45], M_SOL_GUNMETAL: [2500910, 0.4, 0.4],
    M_RP_BLACK: [1381914, 0.5, 0.3], M_SOL_SUIT: [1250328, 0.72, 0.1], M_RP_POUCH: [3025448, 0.8, 0.05], M_RP_WHITE: [14211284, 0.4, 0.05], M_RP_VISOR: [328966, 0.2, 0.3],
  };

  /* ───────────────────────── carte d'exploration : éclaircie temporaire, bulle ───────────────────────── */
  const CUTS = [];
  function cutLane() {
    const list = [];
    P.scene.children.forEach(o => {
      if (o.isInstancedMesh && !o.name) list.push(o);
      if (o.name === 'SB_GRID_FLORA' || o.name === 'SB_EXPLORE_WILD') o.children.forEach(c => list.push(c));
    });
    for (const im of list) {
      if (!im.isInstancedMesh || im.userData.sbsCut) continue;
      im.userData.sbsCut = true;
      const a = im.instanceMatrix.array; let ch = false;
      for (let i = 0; i < im.count; i++) {
        const o = i * 16, x = a[o + 12], z = a[o + 14];
        if (x < LANE.x0 || x > LANE.x1 || z < LANE.z0 || z > LANE.z1) continue;
        if (a[o] === 0 && a[o + 1] === 0 && a[o + 2] === 0) continue;
        CUTS.push([im, o, a.slice(o, o + 11)]);
        for (let j = 0; j < 11; j++) a[o + j] = 0;
        ch = true;
      }
      if (ch) im.instanceMatrix.needsUpdate = true;
    }
  }
  function uncutLane() {   // hors de l'exploration, la carte de la colonie reste exactement ce qu'elle était
    const touched = new Set();
    for (const [im, o, v] of CUTS) { im.instanceMatrix.array.set(v, o); touched.add(im); }
    CUTS.length = 0;
    touched.forEach(im => { im.instanceMatrix.needsUpdate = true; });
    P.scene.children.forEach(o => {
      if (o.isInstancedMesh && !o.name) o.userData.sbsCut = false;
      if (o.name === 'SB_GRID_FLORA' || o.name === 'SB_EXPLORE_WILD') o.children.forEach(c => { c.userData.sbsCut = false; });
    });
  }
  function standHit(cx, cy) {
    if (!built) return false;
    const Y = FX.Y; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y, z] of [[LANE.x0 + 3, 0, POST.z + 3], [LANE.x1 - 6, 0, POST.z + 3], [LANE.x0 + 3, 10, TGT.z - 3], [LANE.x1 - 6, 10, TGT.z - 3]]) {
      const [sx, sy] = API.screenOf(x, Y + y, z);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, hw = Math.max(34, (x1 - x0) / 2), hh = Math.max(44, (y1 - y0) / 2);
    return Math.abs(cx - mx) <= hw && Math.abs(cy - my) <= hh;
  }
  function showOffer() { UI.offer.classList.add('on'); placeOffer(); }
  function hideOffer() { if (UI.offer) UI.offer.classList.remove('on'); }
  function placeOffer() {
    if (!UI.offer || !UI.offer.classList.contains('on')) return;
    if (FP.on) { hideOffer(); return; }
    const [sx, sy] = API.screenOf(TGT.x, FX.Y + TRUNK.h + 4, TGT.z), hr = document.getElementById('scr-planet').getBoundingClientRect(), w = UI.offer.offsetWidth || 120;
    UI.offer.style.transform = `translate3d(${Math.round(clamp(sx - hr.left - w / 2, 8, hr.width - w - 8))}px,${Math.round(Math.max(sy - hr.top - 44, 56))}px,0)`;
  }

  /* ───────────────────────── interface ───────────────────────── */
  const UI = {};
  function buildUI() {
    const css = document.createElement('style');
    css.textContent = `
    #sbs-offer { position:absolute; left:0; top:0; z-index:22; display:none; height:40px; padding:0 16px; align-items:center; border-radius:20px; cursor:pointer; white-space:nowrap;
      background:rgba(26,8,8,.9); border:1px solid rgba(255,120,100,.7); color:#ffe9e4; font:600 13px/1 'Space Grotesk',system-ui,sans-serif; letter-spacing:.04em; box-shadow:0 0 14px rgba(255,70,40,.25); will-change:transform; }
    #sbs-offer.on { display:flex; }
    #scr-planet.sbs-on #sbx-hud { display:none !important; }
    #sbs-hud { position:absolute; inset:0; z-index:22; display:none; font-family:'Space Grotesk',system-ui,sans-serif; touch-action:none; -webkit-user-select:none; user-select:none; }
    #scr-planet.sbs-on #sbs-hud { display:block; }
    #sbs-flash { position:absolute; inset:0; background:#ffd9bd; opacity:0; pointer-events:none; }
    #sbs-cross { position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px; pointer-events:none; filter:drop-shadow(0 0 2px rgba(0,0,0,.75)); }
    #sbs-top { position:absolute; left:0; right:0; top:calc(var(--sai,0px) + 10px); display:flex; justify-content:center; gap:7px; pointer-events:none; }
    #sbs-top span { height:32px; padding:0 12px; display:flex; align-items:center; border-radius:16px; background:rgba(6,10,14,.62); border:1px solid rgba(255,255,255,.14); color:#e9eef2; font:600 13px/1 'JetBrains Mono',monospace; backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); }
    #sbs-best { position:absolute; left:0; right:0; top:calc(var(--sai,0px) + 48px); text-align:center; font:500 11px/1 'JetBrains Mono',monospace; color:rgba(255,255,255,.72); text-shadow:0 1px 3px rgba(0,0,0,.8); pointer-events:none; }
    #sbs-back { position:absolute; left:12px; bottom:calc(var(--sab,0px) + 24px); height:42px; padding:0 14px; display:flex; align-items:center; gap:7px; white-space:nowrap; border-radius:21px; cursor:pointer; background:rgba(6,14,20,.74); border:1px solid rgba(120,220,255,.42); color:#d6f3ff; font:500 12px/1 'Space Grotesk',system-ui,sans-serif; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
    #sbs-back svg { width:14px; height:14px; }
    #sbs-fire { position:absolute; right:14px; bottom:calc(var(--sab,0px) + 18px); width:96px; height:96px; border-radius:50%; cursor:pointer; touch-action:none; background:radial-gradient(circle at 50% 38%, #c9281e, #7c100c); border:2px solid rgba(255,190,170,.75); color:#fff3ee; font:700 16px/1 'Space Grotesk',system-ui,sans-serif; letter-spacing:.05em; box-shadow:0 4px 18px rgba(0,0,0,.5), 0 0 16px rgba(255,60,30,.35); transition:opacity .12s ease, transform .06s ease; }
    #sbs-fire.off { opacity:.42; }
    #sbs-fire:active { transform:scale(.95); }
    #sbs-hint { position:absolute; left:50%; top:calc(50% - 138px); transform:translateX(-50%); padding:7px 12px; border-radius:9px; background:rgba(6,10,14,.66); color:#e9eef2; font-size:12.5px; white-space:nowrap; pointer-events:none; }
    #sbs-hint[hidden] { display:none; }
    .sbs-pts { position:absolute; left:0; top:0; font:800 20px/1 'Space Grotesk',system-ui,sans-serif; color:#fff; text-shadow:0 1px 5px rgba(0,0,0,.9), 0 0 10px rgba(255,120,60,.6); pointer-events:none; white-space:nowrap; }
    .sbs-pts.zero { color:#d8d8d4; font-size:15px; font-weight:600; }
    #sbs-result { position:absolute; left:50%; top:calc(var(--sai,0px) + 66px); transform:translateX(-50%); width:min(88%,340px); display:none; flex-direction:column; align-items:center; gap:8px; padding:10px 12px 11px; border-radius:14px; background:rgba(6,10,14,.82); border:1px solid rgba(255,255,255,.16); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
    #sbs-result.on { display:flex; }
    #sbs-rline { font:700 15px/1.25 'Space Grotesk',system-ui,sans-serif; color:#fff; text-align:center; }
    #sbs-rline.rec { color:#ffd27a; }
    #sbs-again { height:40px; min-width:150px; padding:0 18px; border-radius:21px; cursor:pointer; background:rgba(201,40,30,.9); border:1px solid rgba(255,190,170,.75); color:#fff; font:600 14px/1 'Space Grotesk',system-ui,sans-serif; }
    #sbs-again.wait { background:rgba(60,60,64,.8); border-color:rgba(255,255,255,.25); color:rgba(255,255,255,.8); }`;
    document.head.appendChild(css);
    const scr = document.getElementById('scr-planet');
    const offer = document.createElement('button'); offer.id = 'sbs-offer'; offer.textContent = tr('stand.offer'); scr.appendChild(offer); UI.offer = offer;
    offer.addEventListener('click', () => openFP());
    const hud = document.createElement('div'); hud.id = 'sbs-hud';
    hud.innerHTML = `<div id="sbs-flash"></div>
      <svg id="sbs-cross" viewBox="0 0 58 58" fill="none" stroke="#fff" stroke-linecap="round"><circle class="ring" cx="29" cy="29" r="15" pathLength="100" stroke-width="1.6" stroke-opacity=".9" stroke-dasharray="100" transform="rotate(-90 29 29)"/><path d="M29 6v9M29 43v9M6 29h9M43 29h9" stroke-width="1.8"/><circle cx="29" cy="29" r="1.5" fill="#ff5a3a" stroke="none"/></svg>
      <div id="sbs-top"><span id="sbs-shots"></span><span id="sbs-score"></span></div>
      <div id="sbs-best"></div>
      <div id="sbs-hint"></div>
      <div id="sbs-result"><div id="sbs-rline"></div><button id="sbs-again"></button></div>
      <button id="sbs-back"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3 2.5 8 7 13M3 8h10.5"/></svg><span></span></button>
      <button id="sbs-fire"></button>`;
    scr.appendChild(hud);
    Object.assign(UI, {
      hud, flash: hud.querySelector('#sbs-flash'), ring: hud.querySelector('#sbs-cross .ring'), shots: hud.querySelector('#sbs-shots'), score: hud.querySelector('#sbs-score'), best: hud.querySelector('#sbs-best'), hint: hud.querySelector('#sbs-hint'),
      result: hud.querySelector('#sbs-result'), rline: hud.querySelector('#sbs-rline'), again: hud.querySelector('#sbs-again'), back: hud.querySelector('#sbs-back'), fire: hud.querySelector('#sbs-fire'),
    });
    UI.hint.textContent = tr('stand.hint');
    UI.fire.textContent = tr('stand.fire');
    UI.back.querySelector('span').textContent = tr('stand.back');
    UI.back.addEventListener('click', () => closeFP());
    UI.again.addEventListener('click', () => replay());
    // chaque pression déclenche un seul tir, dès le contact
    UI.fire.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); fire(); });
    for (const b of [UI.back, UI.again]) b.addEventListener('pointerdown', e => e.stopPropagation());
    // glisser dans la scène pour viser (les boutons ne viennent jamais ici)
    hud.addEventListener('pointerdown', e => {
      if (!FP.on || FP.ptr) return;
      FP.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { hud.setPointerCapture(e.pointerId); } catch (err) {}
      if (!UI.hint.hidden) UI.hint.hidden = true;
    });
    hud.addEventListener('pointermove', e => {
      if (!FP.ptr || e.pointerId !== FP.ptr.id) return;
      const dx = e.clientX - FP.ptr.x, dy = e.clientY - FP.ptr.y; FP.ptr.x = e.clientX; FP.ptr.y = e.clientY;
      FP.yaw = clamp(FP.yaw + rad(dx * CFG.sensitivity), rad(-CFG.limitYaw), rad(CFG.limitYaw));
      FP.pitch = clamp(FP.pitch - rad(dy * CFG.sensitivity), rad(-CFG.limitPitch), rad(CFG.limitPitch));
    });
    const up = e => { if (FP.ptr && e.pointerId === FP.ptr.id) FP.ptr = null; };
    hud.addEventListener('pointerup', up); hud.addEventListener('pointercancel', up);
    // ordinateur : barre d'espace pour tirer
    addEventListener('keydown', e => { if (FP.on && e.code === 'Space' && !e.repeat) { e.preventDefault(); fire(); } });
  }
  function screenFlash() {
    try { UI.flash.animate([{ opacity: 0.1 }, { opacity: 0 }], { duration: 90, easing: 'ease-out' }); } catch (e) {}
  }
  function showPoints(hit) {
    if (hit.kind === 'sky') return;
    const [sx, sy] = API.screenOf(hit.p.x, hit.p.y, hit.p.z), hr = UI.hud.getBoundingClientRect(), d = document.createElement('div');
    d.className = 'sbs-pts' + (hit.pts ? '' : ' zero'); d.textContent = hit.pts ? tr('stand.pts', { n: hit.pts }) : tr('stand.miss'); UI.hud.appendChild(d);
    const w = d.offsetWidth, x = sx - hr.left - w / 2, y = sy - hr.top - 32;
    try {
      d.animate([{ transform: `translate(${x}px,${y + 10}px) scale(.7)`, opacity: 0 }, { transform: `translate(${x}px,${y}px) scale(1.08)`, opacity: 1, offset: 0.14 }, { transform: `translate(${x}px,${y - 18}px) scale(1)`, opacity: 1, offset: 0.75 }, { transform: `translate(${x}px,${y - 28}px) scale(1)`, opacity: 0 }], { duration: 900, easing: 'ease-out' }).onfinish = () => d.remove();
    } catch (e) { d.remove(); }
  }
  function updateHUD() {
    if (!UI.shots) return;
    UI.shots.textContent = tr('stand.shots', { n: FP.shots, m: CFG.shots });
    UI.score.textContent = tr('stand.score', { n: FP.score });
    const best = bestScore(); UI.best.textContent = best ? tr('stand.best', { n: best }) : '';
    UI.fire.classList.toggle('off', FP.st !== 'ready');
    const res = FP.st === 'result' || FP.st === 'replacing' || FP.st === 'waiting';
    UI.result.classList.toggle('on', res);
    if (res) {
      const line = tr('stand.result', { n: FP.lastScore != null && FP.st !== 'result' ? FP.lastScore : FP.score, m: CFG.shots * 100 });
      if (FP.st === 'result') FP.lastScore = FP.score;
      const shown = FP.lastScore != null && FP.st !== 'result' ? FP.lastScore : FP.score;
      UI.rline.textContent = FP.isNew ? line + ' — ' + tr('stand.record') : tr('stand.result2', { n: shown, m: CFG.shots * 100, b: bestScore() });
      UI.rline.classList.toggle('rec', !!FP.isNew);
      const wait = FP.want && FP.st !== 'waiting';
      UI.again.textContent = wait ? tr('stand.wait') : tr('stand.again');
      UI.again.classList.toggle('wait', wait);
      UI.best.textContent = '';
    }
  }

  /* ───────────────────────── raccordement à l'exploration ───────────────────────── */
  let wired = false;
  function wire() {
    if (wired) return true;
    if (!window.SBExplore || !SBExplore.api || !SBExplore.api.extra) return false;
    wired = true;
    API = SBExplore.api;
    const X = API.extra;
    X.enter.push(() => {
      if (!allowed()) return;
      P = window.Planet3D; T = window.SB3D.THREE;
      // chemins des lapins : le stand est un obstacle
      if (!X.obstacles.length) X.obstacles.push([TGT.x, TGT.z, 6.5], [BUTTE.x, BUTTE.z, 15], [POST.x, POST.z, 6], [CRANE.x, CRANE.z, 3]);
      if (!UI.offer) { addTexts(); buildUI(); }
      build();
      cutLane();
      soldierLOD(true);
      STG.visible = true;
    });
    X.rebuild.push(() => { if (built && allowed()) { uncutLane(); cutLane(); } });
    X.exit.push(() => {
      if (!built) return;
      closeFP(true);
      hideOffer();
      uncutLane();
    });
    X.tap.push((cx, cy) => {
      if (!built || !allowed() || FP.on) return false;
      if (standHit(cx, cy)) { showOffer(); return true; }
      hideOffer();
      return false;
    });
    X.tick.push(dt => { if (built) tick(dt); });
    return true;
  }
  const wt = setInterval(() => { if (wire()) clearInterval(wt); }, 300);
  wire();

  window.SBStand = {
    open: openFP, close: closeFP, fire, replay,
    get state() { return FP.st; },
    get on() { return FP.on; },
    _dbg: { FP, FX, CFG, TGT, POST, TARGET_R, ZONES, REP_T, REP_END, C_W, C_K, C_CY, get targetCtx() { return targetCtx; }, get cuts() { return CUTS.length; }, tick, faceZ, targetCenter, discharge, traceShot, currentAim, dirOf, scoreAt, standHit, get built() { return built; }, get UI() { return UI; }, aimAt(x, y) { const o = P.camera.position, dx = TGT.x + x - o.x, dy = FX.Y + EYE + y - o.y, dz = faceZ() - o.z; FP.yaw = Math.atan2(dx, -dz); FP.pitch = Math.atan2(dy, Math.hypot(dx, dz)); } },
  };
})();
