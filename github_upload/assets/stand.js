/* Starbyte — Le stand de tir du Red Phalanx, version lac (03/11/2026, direction d'Adrien ; GDD claude/starbyte_GDD_stand_de_tir.md)
   Sur la pointe est de la carte d'exploration, le Red Phalanx s'entraîne au tir longue distance : la cible est une plaque
   peinte sur une plateforme flottante, très loin sur le lac. « S'entraîner » ouvre la vue à la première personne :
   - laser rouge, charge en maintenant « Tirer » (tir au relâcher), gros recul qui grandit avec la charge ;
   - 24 coups par chargeur ; un coup à pleine charge sur la cible la fait exploser (combo : 100, 150, 200…) ;
     un coup partiel marque les anneaux (25 à 100) ; un drone amène une cible neuve ;
   - pincer = lunette (×4) ; pouce gauche posé = apnée (moins d'oscillation 4 s, puis le cœur reprend) ;
   - des lapins passent sur la berge : touchés, ils éclatent en nuage de poils (0 point, la cartouche est consommée) ;
   - le tir atteint exactement le point visé au moment de la décharge : oscillation et recul déplacent la visée, jamais la balle ;
   - record par chargeur dans G.explore (sauvegardé avec la partie).
   Réservé aux comptes d'Adrien tant que STAND_PUBLIC est à false : pour les autres joueurs, ce fichier ne touche à rien. */
(function () {
  'use strict';
  const STAND_PUBLIC = false;   // true = ouvert à tous les joueurs (après validation sur iPhone)
  const PREVIEW_PSEUDOS = ['hadrien', 'pauline'];

  /* ── réglages : tout le rythme se règle ici ── */
  const CFG = {
    shots: 24,
    chargeTime: 1.2,        // maintenir « Tirer » : de 0 à pleine charge
    full: 0.92,             // à partir de là, le coup fait exploser la cible
    cooldown: 0.3,          // après un tir, avant de pouvoir recharger
    swayYaw: 0.42,          // oscillation régulière, en degrés
    swayPitch: 0.3,
    swayHz: 0.58,
    breathHold: 4,          // apnée : durée maximale
    breathCalm: 0.3,        // oscillation pendant l'apnée (part de la normale)
    breathRecover: 3,       // après l'apnée : le cœur bat, oscillation ×heart
    breathHeart: 1.8,
    kickPitch: [1.4, 6.5],  // recul qui revient tout seul, en degrés, à charge nulle / pleine
    kickYaw: [0.35, 1.4],
    stayPitch: [0.4, 2.2],  // part du recul qui reste : il faut retrouver son alignement
    stayYaw: [0.15, 0.7],
    limitYaw: 26,           // la visée reste limitée au lac
    limitPitch: 12,
    sensitivity: 0.045,     // degrés par pixel, à l'œil nu (divisé par le grossissement dans la lunette)
    fov: 58, fovWide: 44,   // champ à l'œil nu (hauteur / largeur)
    scopeFov: 14,           // champ dans la lunette
    resultDelay: 0.9,
    gunTall: { x: 0.18, y: -0.8, z: -1.5, s: 1, tilt: 0.07 },
    gunWide: { x: 0.72, y: -0.72, z: -1.5, s: 1, tilt: 0.05 },
    rabbits: 3,
  };
  const ZONES = [[0.25, 100], [0.5, 75], [0.75, 50], [1, 25]];   // part du rayon → points d'un coup partiel

  /* ── le terrain : la pointe est, face au lac ── */
  const POST = { x: 178, z: 137 };                      // poste de tir, sur la pointe
  const TGT = { x: 222, z: 22 };                        // plateforme sur le lac
  const EYE = 4.6;
  const BOARD = { w: 7.2, h: 7.2, y: 4.3 };             // plaque-cible : largeur, hauteur, hauteur du centre au-dessus du pont
  const TARGET_R = 3.2;                                 // rayon des anneaux peints
  const DECK = { w: 11, d: 9, y: 0.45 };                // pont de la plateforme (hauteur au-dessus de l'eau)
  const LANE = { r: 14 };                               // rayon sans arbres autour du poste, pendant l'exploration
  const SHORE = [[187, 100], [189, 88], [188, 76], [190, 64], [189, 52], [191, 42]];   // chemin des lapins le long de la berge

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rad = d => d * Math.PI / 180;
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const AIM0 = Math.atan2(TGT.x - POST.x, -(TGT.z - POST.z));   // direction de la plateforme (yaw 0 = nord)
  const DIST = Math.hypot(TGT.x - POST.x, TGT.z - POST.z);

  let T = null, P = null, API = null, built = false, WATER = -1.75;
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
      'stand.targets': 'Cibles : {n}',
      'stand.best': 'Record : {n}',
      'stand.result': '{n} points',
      'stand.result2': '{n} points — Record : {b}',
      'stand.record': 'Nouveau record personnel',
      'stand.again': 'Recharger',
      'stand.hint1': 'Maintiens Tirer pour charger, relâche pour tirer.',
      'stand.hint2': 'Pince l\'écran pour viser dans la lunette.',
      'stand.hint3': 'Pouce gauche posé : apnée, la visée se calme.',
      'stand.pts': '+{n}',
      'stand.miss': 'Raté',
      'stand.boom': 'Cible détruite',
      'stand.pof': 'Pof',
      'stand.scope': 'Lunette',
      'stand.breath': 'Apnée',
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


  /* ───────────────────────── la cible : une plaque peinte sur la plateforme ───────────────────────── */
  let STG = null, MAT = null, TEX = null;
  const FX = {};
  let targetCtx = null, targetTex = null;
  const C_W = 512, C_K = C_W / BOARD.w, C_H = Math.round(BOARD.h * C_K);
  function paintFreshTarget() {
    const g = targetCtx, W = C_W, H = C_H, cx = W / 2, cy = H / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    // tôle peinte, rivets, bords sombres
    g.fillStyle = '#d9d2c2'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${hash(i, 3) < 0.5 ? '90,80,70' : '255,255,250'},${0.05 + hash(i, 5) * 0.1})`; g.fillRect(hash(i, 7) * W, hash(i, 9) * H, 3 + hash(i, 11) * 40, 1 + hash(i, 13) * 3); }
    g.strokeStyle = 'rgba(40,36,30,.7)'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = 'rgba(30,28,26,.8)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(14 + (i % 2) * (W - 28), 14 + Math.floor(i / 2) % 4 * ((H - 28) / 3), 4, 0, 6.2832); g.fill(); }
    const px = TARGET_R * C_K, cols = ['#efe9d8', '#b7221a', '#efe9d8', '#b7221a'];
    for (let i = ZONES.length - 1; i >= 0; i--) {
      g.beginPath(); g.arc(cx, cy, ZONES[i][0] * px, 0, 6.2832);
      g.fillStyle = cols[ZONES.length - 1 - i]; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(18,14,10,.8)'; g.stroke();
    }
    g.fillStyle = 'rgba(18,14,10,.85)'; g.fillRect(cx - 12, cy - 1.5, 24, 3); g.fillRect(cx - 1.5, cy - 12, 3, 24);
    if (targetTex) targetTex.needsUpdate = true;
  }
  function paintImpact(lx, ly, n) {
    const g = targetCtx, cx = C_W / 2 + lx * C_K, cy = C_H / 2 - ly * C_K, R = 0.42 * C_K, h = k => hash(n * 37 + 11, k);
    let r = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.9);
    r.addColorStop(0, 'rgba(14,8,6,.95)'); r.addColorStop(0.5, 'rgba(40,22,14,.55)'); r.addColorStop(1, 'rgba(40,22,14,0)');
    g.fillStyle = r; g.beginPath(); g.arc(cx, cy, R * 1.9, 0, 6.2832); g.fill();
    g.fillStyle = '#050403'; g.beginPath();
    for (let i = 0; i <= 11; i++) { const a = i / 11 * 6.2832, l = R * (0.55 + h(i + 100) * 0.35); const x = cx + Math.cos(a) * l, y = cy + Math.sin(a) * l; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
    for (let i = 0; i < 10; i++) { const a = h(i) * 6.2832, l = R * (0.9 + h(i + 20) * 1.1); g.strokeStyle = 'rgba(255,170,90,.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke(); }
    targetTex.needsUpdate = true;
  }

  /* ───────────────────────── construction ───────────────────────── */
  function build() {
    if (built) return;
    built = true;
    const root = API.root, Y = API.heightAt(POST.x, POST.z);
    FX.Y = Y; FX.beamT = 0; FX.hitT = 0; FX.lightT = 0;
    WATER = API.WATER != null ? API.WATER : WATER;
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
      glow: new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      core: new T.MeshBasicMaterial({ color: 0xff5a24, toneMapped: false }),
      glass: new T.MeshStandardMaterial({ color: 0x3a1410, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.4, depthWrite: false }),
      beam: new T.MeshBasicMaterial({ color: 0xffd0c8, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      beamGlow: new T.MeshBasicMaterial({ color: 0xff1a10, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
    };
    buildPost(Y);
    buildPlatform();
    buildRabbits();
    installGuard();
    buildParticles();
    buildFirstPerson();
    buildSoldierProxy();
    STG.traverse(o => { if (o.isInstancedMesh) o.frustumCulled = false; });
    resetMagazine();
  }
  // le poste : terre battue, sacs de sable, caisses, lampe, longue-vue
  function buildPost(Y) {
    const dirt = new T.Mesh(new T.PlaneGeometry(26, 26), new T.MeshStandardMaterial({ map: TEX.dirt, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    dirt.rotation.x = -Math.PI / 2; dirt.rotation.z = AIM0; dirt.position.set(POST.x, Y + 0.14, POST.z); dirt.receiveShadow = true; dirt.renderOrder = 1; STG.add(dirt);
    const parts = [], add = (g, c, m) => parts.push([g, c, m]);
    const OLIVE = 0x4b5a2c, SAND = 0x8a7c5e, SAND2 = 0x75694f, YEL = 0xdca41e;
    const fwd = (dx, dz) => { const c = Math.cos(AIM0), s = Math.sin(AIM0); return [POST.x + dx * c + dz * s, POST.z - dz * c + dx * s]; };   // repère du poste : dz vers la cible
    const bag = new T.CapsuleGeometry(0.42, 0.95, 2, 6);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) for (const s of [-1, 1]) {
      const x = s * (1.7 + (i + row * 0.5) * 1.12), [wx, wz] = fwd(x, 5.2 - Math.abs(x) * 0.15);
      add(bag, (i + row) % 2 ? SAND : SAND2, M4(wx, Y + 0.32 + row * 0.56, wz, 0, AIM0 + 0.22 * s, Math.PI / 2, 1, 1, 0.74));
    }
    const crate = (dx, dz, w, h, d, ry, col = OLIVE) => {
      const [wx, wz] = fwd(dx, dz);
      add(cbox(w, h, d, 0.07), col, M4(wx, Y + h / 2, wz, 0, AIM0 + ry, 0));
      add(cbox(w * 1.02, 0.1, d * 0.2, 0.02), BLACK, M4(wx, Y + h * 0.7, wz, 0, AIM0 + ry, 0));
      add(cbox(w * 0.32, h * 0.26, 0.02, 0.004), YEL, M4(wx + Math.sin(AIM0 + ry) * d * 0.5, Y + h * 0.42, wz + Math.cos(AIM0 + ry) * d * 0.5, 0, AIM0 + ry, 0));
    };
    crate(4.2, -1.6, 2.2, 1.5, 1.5, 0.4); crate(5.4, -3.6, 1.8, 1.1, 1.2, -0.3); crate(4.5, -3.2, 1.3, 1.2, 1, 0.9, ARMOR); crate(-4.6, -2.2, 2, 1.3, 1.3, -0.5);
    // lampe de chantier sur trépied, longue-vue d'observation
    { const [lx, lz] = fwd(-5.2, 1.5); add(new T.CylinderGeometry(0.12, 0.14, 5.5, 6), STEEL, M4(lx, Y + 2.75, lz)); add(cbox(0.9, 0.5, 0.6, 0.06), BLACK, M4(lx, Y + 5.7, lz, 0.5, AIM0, 0)); FX.lampPos = [lx, Y + 5.6, lz];
      for (let k = 0; k < 3; k++) { const a = k * 2.094; add(new T.CylinderGeometry(0.05, 0.05, 2.4, 4), STEEL, M4(lx + Math.sin(a) * 0.55, Y + 1.1, lz + Math.cos(a) * 0.55, Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45)); } }
    { const [sx, sz] = fwd(3.6, 2.4); add(new T.CylinderGeometry(0.08, 0.1, 3.2, 6), STEEL, M4(sx, Y + 1.6, sz)); add(cylz(0.22, 0.3, 1.4, 8), GUNM, M4(sx, Y + 3.3, sz, 0.1, AIM0, 0)); }
    const m = new T.Mesh(merge(parts), MAT.hard); m.castShadow = true; m.receiveShadow = true; STG.add(m);
    // lueur de la lampe de chantier, la nuit
    const halo = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    halo.position.set(FX.lampPos[0], FX.lampPos[1], FX.lampPos[2]); halo.scale.setScalar(4); STG.add(halo); FX.lampHalo = halo;
  }
  // la plateforme : pontons, pont, cadre de la cible, deux projecteurs qui l'éclairent par le bas
  function buildPlatform() {
    const grp = new T.Group(); grp.position.set(TGT.x, WATER, TGT.z); grp.rotation.y = -AIM0;   // sa face regarde le poste
    STG.add(grp); FX.platform = grp;
    const parts = [], add = (g, c, m) => parts.push([g, c, m]), YEL = 0xdca41e;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new T.CylinderGeometry(1.1, 1.1, 1.6, 10), 0x2a2e34, M4(sx * DECK.w * 0.4, -0.2, sz * DECK.d * 0.38));
    add(cbox(DECK.w, 0.5, DECK.d, 0.06), 0x55595f, M4(0, DECK.y, 0));
    for (let i = 0; i < 6; i++) add(cbox(DECK.w - 0.6, 0.04, 0.12, 0.004), 0x3a3d42, M4(0, DECK.y + 0.27, -DECK.d / 2 + 0.8 + i * (DECK.d - 1.6) / 5));
    for (const s of [-1, 1]) { add(cbox(0.3, 0.9, DECK.w * 0.9, 0.03), YEL, M4(s * (DECK.w / 2 - 0.2), DECK.y + 0.7, 0, 0, Math.PI / 2, 0)); }
    // cadre de la cible : deux montants, traverse, contrepoids arrière
    for (const s of [-1, 1]) add(cbox(0.36, BOARD.y + BOARD.h / 2 + 0.6, 0.36, 0.04), 0x767b84, M4(s * (BOARD.w / 2 + 0.4), DECK.y + (BOARD.y + BOARD.h / 2 + 0.6) / 2, -0.4));
    add(cbox(BOARD.w + 1.3, 0.3, 0.3, 0.03), 0x767b84, M4(0, DECK.y + BOARD.y + BOARD.h / 2 + 0.5, -0.4));
    for (const s of [-1, 1]) add(cbox(0.2, 5, 0.2, 0.02), 0x3a3d42, M4(s * (BOARD.w / 2 + 0.4), DECK.y + 3, -2.2, 0.62, 0, 0));
    // projecteurs au sol, braqués vers la plaque
    for (const s of [-1, 1]) { add(cbox(0.9, 0.5, 0.7, 0.05), 0x1d2126, M4(s * 2.6, DECK.y + 0.5, 3.4, -1.05, 0, 0)); add(cbox(0.95, 0.08, 0.72, 0.01), 0x101214, M4(s * 2.6, DECK.y + 0.3, 3.6)); }
    const m = new T.Mesh(merge(parts), MAT.hard); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    // la plaque peinte
    const cv = document.createElement('canvas'); cv.width = C_W; cv.height = C_H; targetCtx = cv.getContext('2d');
    targetTex = new T.CanvasTexture(cv); targetTex.colorSpace = T.SRGBColorSpace; targetTex.anisotropy = 8;
    paintFreshTarget();
    const bm = new T.MeshStandardMaterial({ map: targetTex, emissiveMap: targetTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7, metalness: 0.1 });
    const board = new T.Group(); board.position.set(0, DECK.y + BOARD.y, 0); grp.add(board);
    const face = new T.Mesh(new T.PlaneGeometry(BOARD.w, BOARD.h), bm); face.castShadow = true; board.add(face);
    const back = new T.Mesh(cbox(BOARD.w + 0.2, BOARD.h + 0.2, 0.25, 0.03), new T.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 })); back.position.z = -0.14; board.add(back);
    FX.board = board; FX.boardMat = bm;
    // faisceaux des projecteurs (visibles la nuit) et lueur sur la plaque
    const beamMat = new T.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false });
    FX.floods = [];
    for (const s of [-1, 1]) {
      const cone = new T.Mesh(new T.ConeGeometry(2.6, 6, 10, 1, true), beamMat); cone.position.set(s * 2.6 * 0.3, DECK.y + 3.4, 1.6); cone.rotation.x = -0.58; cone.rotation.z = -s * 0.25; grp.add(cone); FX.floods.push(cone);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xffe0a0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false })); sp.position.set(s * 2.6, DECK.y + 0.6, 3.4); sp.scale.setScalar(2.2); grp.add(sp); FX.floods.push(sp);
    }
    FX.floodMat = beamMat;
    // balise rouge en tête de cadre
    const bk = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), new T.MeshBasicMaterial({ color: 0xff3020, toneMapped: false })); bk.position.set(0, DECK.y + BOARD.y + BOARD.h / 2 + 0.85, -0.4); grp.add(bk); FX.beacon = bk;
    // éclats de la plaque quand elle explose
    const shards = new T.InstancedMesh(new T.BoxGeometry(0.9, 0.9, 0.12), new T.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.7, metalness: 0.2 }), 28);
    shards.count = 0; shards.frustumCulled = false; STG.add(shards); FX.shards = shards; FX.shardData = [];
    // le drone qui apporte la cible neuve
    const dr = new T.Group(); dr.visible = false; STG.add(dr); FX.drone = dr;
    const dp = [];
    dp.push([cbox(2.2, 0.5, 2.2, 0.08), 0x2a2e34, M4(0, 0, 0)]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { dp.push([cbox(0.2, 0.12, 2.4, 0.02), 0x55595f, M4(sx * 1.4, 0.1, sz * 1.4, 0, Math.PI / 4 * sx * sz, 0)]); dp.push([new T.CylinderGeometry(1.1, 1.1, 0.06, 12), 0x1d2126, M4(sx * 2.2, 0.26, sz * 2.2)]); }
    dp.push([cbox(0.4, 1.2, 0.4, 0.04), 0x767b84, M4(0, -0.8, 0)]);
    dp.push([cbox(2.4, 0.3, 0.5, 0.04), 0xdca41e, M4(0, -1.5, 0)]);
    dr.add(new T.Mesh(merge(dp), MAT.hard));
    const dl = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), new T.MeshBasicMaterial({ color: 0x60ff90, toneMapped: false })); dl.position.set(0, 0.35, 0); dr.add(dl);
    // pendant le transport : une plaque neuve sous le drone
    const carry = new T.Mesh(cbox(BOARD.w + 0.2, BOARD.h + 0.2, 0.3, 0.03), new T.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 })); carry.position.y = -1.7 - BOARD.h / 2; carry.rotation.y = 0; dr.add(carry); FX.carry = carry;
    const carryFace = new T.Mesh(new T.PlaneGeometry(BOARD.w, BOARD.h), new T.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.7 })); carryFace.position.set(0, -1.7 - BOARD.h / 2, 0.17); dr.add(carryFace);
    // ondes à la surface quand la plaque explose
    FX.ring = new T.Mesh(new T.RingGeometry(0.8, 1, 24), new T.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }));
    FX.ring.rotation.x = -Math.PI / 2; FX.ring.position.set(TGT.x, WATER + 0.05, TGT.z); FX.ring.visible = false; STG.add(FX.ring);
  }

  /* ───────────────────────── les lapins de la berge ───────────────────────── */
  const RB = { list: [] };
  function buildRabbits() {
    const GEO = API.GEO, FUR = API.MAT && API.MAT.fur;
    if (!GEO || !GEO.rabbits || !FUR) return;
    for (let i = 0; i < CFG.rabbits; i++) {
      const g = GEO.rabbits[i % GEO.rabbits.length], grp = new T.Group(), bodyP = new T.Group(); grp.add(bodyP);
      bodyP.add(new T.Mesh(g.body, FUR));
      const head = new T.Group(); head.position.set(0, 1.94, 1.02); bodyP.add(head); head.add(new T.Mesh(g.head, FUR));
      for (const s of [-1, 1]) { const e = new T.Group(); e.position.set(s * 0.36, 0.5, -0.14); e.rotation.z = -s * 0.14; e.add(new T.Mesh(g.ear, FUR)); head.add(e); }
      grp.scale.setScalar(1.25); STG.add(grp);
      const r = { g: grp, bodyP, seg: Math.floor(hash(i, 3) * (SHORE.length - 1)), u: hash(i, 5), dir: i % 2 ? 1 : -1, hop: null, wait: hash(i, 7) * 2, dead: 0, x: 0, z: 0 };
      placeRabbit(r); RB.list.push(r);
    }
  }
  function shorePoint(seg, u) { const a = SHORE[seg], b = SHORE[seg + 1]; return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; }
  function placeRabbit(r) {
    const [x, z] = shorePoint(r.seg, r.u); r.x = x; r.z = z;
    r.g.position.set(x, API.heightAt(x, z), z);
  }
  function rabbitsTick(dt) {
    for (const r of RB.list) {
      if (r.dead > 0) { r.dead -= dt; if (r.dead <= 0) { r.g.visible = true; r.seg = Math.random() < 0.5 ? 0 : SHORE.length - 2; r.u = r.seg ? 1 : 0; r.dir = r.seg ? -1 : 1; placeRabbit(r); } continue; }
      if (r.hop) {
        r.hop.t += dt; const k = Math.min(1, r.hop.t / r.hop.dur);
        r.u = lerp(r.hop.u0, r.hop.u1, k);
        const [x, z] = shorePoint(r.seg, r.u); r.x = x; r.z = z;
        r.g.position.set(x, API.heightAt(x, z) + Math.sin(k * Math.PI) * 0.9, z);
        r.bodyP.rotation.x = -Math.sin(k * Math.PI) * 0.25;
        if (k >= 1) { r.hop = null; r.wait = 0.25 + Math.random() * 1.6; if (Math.random() < 0.08) r.dir *= -1; }
        continue;
      }
      r.wait -= dt;
      if (r.wait > 0) continue;
      let u1 = r.u + r.dir * 0.22;
      if (u1 > 1) { if (r.seg < SHORE.length - 2) { r.seg++; r.u = 0; u1 = 0.22; } else { r.dir = -1; u1 = r.u - 0.22; } }
      if (u1 < 0) { if (r.seg > 0) { r.seg--; r.u = 1; u1 = 0.78; } else { r.dir = 1; u1 = r.u + 0.22; } }
      const [x1, z1] = shorePoint(r.seg, u1);
      r.g.rotation.y = Math.atan2(x1 - r.x, z1 - r.z);
      r.hop = { t: 0, dur: 0.42, u0: r.u, u1 };
    }
  }
  function rabbitHit(o, d) {   // le lapin est une petite sphère généreuse : c'est un jeu
    let best = null;
    for (const r of RB.list) {
      if (r.dead > 0) continue;
      const c = new T.Vector3(r.x, r.g.position.y + 1.6, r.z), oc = c.clone().sub(o), t = oc.dot(d);
      if (t < 1) continue;
      const q = oc.lengthSq() - t * t;
      if (q <= 1.9 * 1.9 && (!best || t < best.t)) best = { r, t, p: o.clone().addScaledVector(d, t) };
    }
    return best;
  }
  function popRabbit(r) {
    r.dead = 7 + Math.random() * 6; r.g.visible = false;
    burstChips(r.x, r.g.position.y + 1.4, r.z, 26, 0xf4eee4, 7, 10, 'fluff');
    burstChips(r.x, r.g.position.y + 1.4, r.z, 1, 0xf08a24, 5, 12, 'carrot');
    puffSmoke(r.x, r.g.position.y + 1.6, r.z, 5, { o: 0.55, size: 1.4, rise: 1.2, life: 1.1, col: 0xfaf6ef, spread: 2.2 });
    sfx('stPof');
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


  /* ───────────────────────── particules ───────────────────────── */
  function buildParticles() {
    const chips = new T.InstancedMesh(new T.BoxGeometry(0.22, 0.09, 0.42), new T.MeshStandardMaterial({ roughness: 0.9 }), 80);
    chips.frustumCulled = false; chips.count = 80; chips.visible = false;
    const m0 = new T.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < 80; i++) { chips.setMatrixAt(i, m0); chips.setColorAt(i, new T.Color(0xd3ad78)); }
    STG.add(chips); FX.chips = chips; FX.chipData = [];
    FX.smoke = [];
    for (let i = 0; i < 16; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.smoke, color: 0x8c8a86, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; s.renderOrder = 5; STG.add(s); FX.smoke.push({ s, t: 9, life: 1, vx: 0, vy: 0, vz: 0, o: 0.5, g: 1 });
    }
    const beamG = new T.CylinderGeometry(1, 1, 1, 8, 1, true); beamG.rotateX(Math.PI / 2);
    FX.beam = new T.Mesh(beamG, MAT.beam); FX.beam.renderOrder = 6; FX.beam.visible = false; STG.add(FX.beam);
    FX.beamGlow = new T.Mesh(beamG, MAT.beamGlow); FX.beamGlow.renderOrder = 6; FX.beamGlow.visible = false; STG.add(FX.beamGlow);
    FX.hitFlash = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xffb0a0, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false }));
    FX.hitFlash.visible = false; FX.hitFlash.renderOrder = 7; STG.add(FX.hitFlash);
    FX.boomFlash = new T.Sprite(new T.SpriteMaterial({ map: TEX.star, color: 0xffd0a0, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false }));
    FX.boomFlash.visible = false; FX.boomFlash.renderOrder = 7; STG.add(FX.boomFlash);
  }
  function burstChips(x, y, z, n, hex, speed, up, kind) {
    const c = new T.Color(hex);
    for (let i = 0; i < n; i++) {
      const slot = FX.chipData.findIndex(d => d && d.t >= d.life); const k = slot >= 0 ? slot : FX.chipData.length;
      if (k >= 80) break;
      FX.chipData[k] = { x, y, z, vx: (Math.random() - 0.5) * speed, vy: up * (0.3 + Math.random() * 0.9), vz: (Math.random() - 0.5) * speed, rx: Math.random() * 6, ry: Math.random() * 6, sp: 6 + Math.random() * 14, t: 0, life: 0.8 + Math.random() * 0.7, sc: kind === 'carrot' ? 2.2 : kind === 'fluff' ? 0.9 + Math.random() * 0.9 : 0.55 + Math.random() * 1.1, kind };
      FX.chips.setColorAt(k, c.clone().multiplyScalar(0.85 + Math.random() * 0.3));
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
    let any = false; const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), SC = new T.Vector3();
    FX.chipData.forEach((d, i) => {
      if (!d || d.t >= d.life) return;
      d.t += dt; d.vy -= 22 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.sp * dt; d.ry += d.sp * 0.7 * dt;
      const floor = Math.max(WATER + 0.1, API.heightAt(d.x, d.z) + 0.1);
      if (d.y < floor) { d.y = floor; d.vy = Math.abs(d.vy) * 0.25; d.vx *= 0.5; d.vz *= 0.5; }
      if (d.t >= d.life) { FX.chips.setMatrixAt(i, M.makeScale(0, 0, 0)); any = true; return; }
      const s = d.sc * (d.t > d.life - 0.15 ? (d.life - d.t) / 0.15 : 1);
      E.set(d.rx, d.ry, 0); Q.setFromEuler(E); V.set(d.x, d.y, d.z); SC.set(s, s * (d.kind === 'fluff' ? 3 : 1), s); FX.chips.setMatrixAt(i, M.compose(V, Q, SC)); any = true;
    });
    if (any) FX.chips.instanceMatrix.needsUpdate = true;
    // éclats de la plaque
    let anyS = false;
    FX.shardData.forEach((d, i) => {
      if (!d || d.t >= d.life) return;
      d.t += dt; d.vy -= 16 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.sp * dt; d.ry += d.sp * 0.6 * dt;
      if (d.y < WATER) { d.t = d.life; FX.shards.setMatrixAt(i, M.makeScale(0, 0, 0)); anyS = true; puffSmoke(d.x, WATER + 0.2, d.z, 1, { o: 0.4, size: 0.8, rise: 1, life: 0.6, col: 0xd8ecff, spread: 0.4 }); return; }
      E.set(d.rx, d.ry, 0); Q.setFromEuler(E); V.set(d.x, d.y, d.z); SC.setScalar(d.sc); FX.shards.setMatrixAt(i, M.compose(V, Q, SC)); anyS = true;
    });
    if (anyS) FX.shards.instanceMatrix.needsUpdate = true;
    for (const p of FX.smoke) {
      if (p.t >= p.life) { if (p.s.visible) p.s.visible = false; continue; }
      p.t += dt; const k = p.t / p.life;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.material.opacity = Math.max(0, p.o * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88));
      p.s.scale.setScalar(p.s0 * (1 + k * p.g));
    }
    if (FX.beamT > 0) {
      FX.beamT -= dt; const k = clamp(FX.beamT / 0.1, 0, 1);
      MAT.beam.opacity = k; MAT.beamGlow.opacity = 0.5 * k;
      if (FX.beamT <= 0) { FX.beam.visible = false; FX.beamGlow.visible = false; }
    }
    if (FX.hitT > 0) {
      FX.hitT -= dt; const k = clamp(FX.hitT / 0.14, 0, 1);
      FX.hitFlash.material.opacity = k * 0.8; FX.hitFlash.scale.setScalar(FX.hitScale * (1 + (1 - k) * 1.6));
      if (FX.hitT <= 0) FX.hitFlash.visible = false;
    }
    if (FX.boomT > 0) {
      FX.boomT -= dt; const k = clamp(FX.boomT / 0.4, 0, 1);
      FX.boomFlash.material.opacity = k; FX.boomFlash.scale.setScalar(6 + (1 - k) * 18); FX.boomFlash.material.rotation += dt * 2;
      FX.ring.material.opacity = k * 0.7; FX.ring.scale.setScalar(1 + (1 - k) * 22);
      if (FX.boomT <= 0) { FX.boomFlash.visible = false; FX.ring.visible = false; }
    }
    if (FX.lightT > 0) {   // lumière de la décharge : deux lampes de la réserve (leur nombre ne change jamais)
      FX.lightT -= dt; const k = clamp(FX.lightT / 0.12, 0, 1), pool = P._pool;
      if (pool) {
        pool[7].position.copy(FX.lightA); pool[7].color.setHex(0xff4030); pool[7].distance = 40; pool[7].intensity = 40 * k * FX.lightK;
        pool[6].position.copy(FX.lightB); pool[6].color.setHex(0xff7050); pool[6].distance = 36; pool[6].intensity = 50 * k;
        if (FX.lightT <= 0) { pool[7].intensity = 0; pool[6].intensity = 0; P._lightAt = 0; }
      }
    }
  }

  /* ───────────────────────── vue à la première personne ───────────────────────── */
  const FP = { on: false, group: null, gun: null, kick: 0, chamber: 0.5, yaw: 0, pitch: 0, kp: 0, ky: 0, t: 0, st: 'off', stT: 0, shots: 0, score: 0, targets: 0, isNew: false, recoilSign: 1, noSway: false, ptr: null, saved: null, charge: 0, charging: false, scope: 0, scopeOn: false, breath: 0, breathSt: 'calm', breathT: 0, breathPtr: null, pinch: null, lastScore: null, moving: false };
  function buildFirstPerson() {
    const g = new T.Group(); g.visible = false; STG.add(g);
    const gun = new T.Group(); g.add(gun);
    const a = buildGun();
    gun.add(new T.Mesh(a.body, MAT.gun));
    gun.add(new T.Mesh(a.glow, MAT.glow));
    const glass = new T.Mesh(cylz(0.088, 0.088, 0.34, 12), MAT.glass); glass.position.set(0, 0.26, -0.59); glass.renderOrder = 3; gun.add(glass);
    const core = new T.Mesh(cylz(0.056, 0.056, 0.3, 10), MAT.core); core.position.set(0, 0.26, -0.6); gun.add(core);
    FP.core = core;
    FP.chamberHalo = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xff5a24, transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    FP.chamberHalo.position.set(0, 0.26, -0.44); FP.chamberHalo.scale.setScalar(0.42); gun.add(FP.chamberHalo);
    gun.add(new T.Mesh(gauntlet(1, 0.25, -0.1, -1.02, 1.05, -1.25, 0.3), MAT.gun));
    gun.add(new T.Mesh(gauntlet(-1, -0.36, -0.24, -1.7, -1.1, -1.5, -0.2), MAT.gun));
    const flash = new T.Sprite(new T.SpriteMaterial({ map: TEX.star, color: 0xffb0a8, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false }));
    flash.position.set(0, 0, -2.75); flash.scale.setScalar(1.1); flash.visible = false; flash.renderOrder = 8; gun.add(flash);
    FP.leds = [];
    for (let i = 0; i < 6; i++) { const m = new T.Mesh(cbox(0.022, 0.012, 0.05, 0.003), new T.MeshBasicMaterial({ color: 0xff5a24, toneMapped: false })); m.position.set((i - 2.5) * 0.034, 0.185, -0.34); gun.add(m); FP.leds.push(m); }
    const muzzle = new T.Object3D(); muzzle.position.set(0, 0, MUZZLE.z); gun.add(muzzle);
    const vent = new T.Object3D(); vent.position.set(0, 0.32, -0.59); gun.add(vent);
    FP.group = g; FP.gun = gun; FP.flash = flash; FP.muzzle = muzzle; FP.vent = vent;
    // ciel (la caméra de la carte ne le voit jamais)
    const skyG = new T.SphereGeometry(1400, 24, 12); const cols = new Float32Array(skyG.attributes.position.count * 3); skyG.setAttribute('color', new T.BufferAttribute(cols, 3));
    const sky = new T.Mesh(skyG, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false, toneMapped: true }));
    sky.position.set(POST.x, 0, POST.z); sky.visible = false; sky.renderOrder = -5; sky.frustumCulled = false; STG.add(sky);
    FP.sky = sky;
  }
  function paintSky() {
    const k = window.SBSky && SBSky.k != null ? SBSky.k : 1, bg = P.scene.background && P.scene.background.isColor ? P.scene.background : new T.Color(0x8fa6b8);
    if (FP.skyK !== undefined && Math.abs(FP.skyK - k) < 0.02) return; FP.skyK = k;
    const horizon = bg.clone(), zenith = new T.Color(0x05101f).lerp(new T.Color(0x4f7fae), k), pa = FP.sky.geometry.attributes.position, c = FP.sky.geometry.attributes.color, cc = new T.Color();
    for (let i = 0; i < pa.count; i++) { const u = clamp(pa.getY(i) / 1400, 0, 1); cc.copy(horizon).lerp(zenith, Math.pow(u, 0.55)); c.setXYZ(i, cc.r, cc.g, cc.b); }
    c.needsUpdate = true;
  }
  const dirOf = (yaw, pitch) => new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  // l'oscillation : respiration régulière, calmée par l'apnée, agitée par le cœur qui reprend
  function swayScale() {
    if (FP.noSway) return 0;
    if (FP.breathSt === 'hold') return CFG.breathCalm;
    if (FP.breathSt === 'heart') return lerp(CFG.breathHeart, 1, sstep(0, 1, FP.breathT / CFG.breathRecover));
    return 1;
  }
  function currentAim() {
    const w = 2 * Math.PI * CFG.swayHz, t = FP.t, s = swayScale();
    const heart = FP.breathSt === 'heart' ? Math.max(0, Math.sin(t * 9)) * Math.max(0, Math.sin(t * 9)) * 0.25 * (1 - FP.breathT / CFG.breathRecover) : 0;
    const sy = s * rad(CFG.swayYaw) * (Math.sin(w * t) + 0.3 * Math.sin(w * 1.7 * t + 1)) / 1.3, sp = s * rad(CFG.swayPitch) * (Math.sin(w * 1.3 * t + 0.7) + 0.25 * Math.sin(w * 2.1 * t)) / 1.25 + rad(heart);
    return { yaw: AIM0 + FP.yaw + sy + rad(FP.ky), pitch: FP.pitch + sp + rad(FP.kp) };
  }
  // la plaque : plan vertical qui regarde le poste ; coordonnées locales (lx vers la droite du tireur, ly vers le haut)
  function boardFrame() {
    const c = new T.Vector3(TGT.x, WATER + DECK.y + BOARD.y, TGT.z);
    const n = new T.Vector3(POST.x - TGT.x, 0, POST.z - TGT.z).normalize();          // normale, vers le tireur
    const right = new T.Vector3(n.z, 0, -n.x);                                        // vers la droite du tireur… côté plaque
    return { c, n, right, up: new T.Vector3(0, 1, 0) };
  }
  function scoreAt(dist) { for (const [f, pts] of ZONES) if (dist <= f * TARGET_R) return pts; return 0; }
  function traceShot(o, d) {
    const out = { kind: 'sky', pts: 0, p: o.clone().addScaledVector(d, 900) };
    // le lapin passe devant tout le reste
    const rb = rabbitHit(o, d);
    // la plaque
    let tBoard = Infinity, hitB = null;
    if (TG.st === 'up') {
      const f = boardFrame(), denom = d.dot(f.n);
      if (denom < -1e-6) {
        const t = f.c.clone().sub(o).dot(f.n) / denom, p = o.clone().addScaledVector(d, t), rel = p.clone().sub(f.c), lx = rel.dot(f.right), ly = rel.dot(f.up);
        if (t > 0 && Math.abs(lx) <= BOARD.w / 2 && Math.abs(ly) <= BOARD.h / 2) { tBoard = t; hitB = { kind: 'board', p, lx, ly, dist: Math.hypot(lx, ly), pts: scoreAt(Math.hypot(lx, ly)) }; }
      }
    }
    if (rb && rb.t < tBoard) return { kind: 'rabbit', pts: 0, p: rb.p, rabbit: rb.r };
    if (hitB) return hitB;
    // le sol ou l'eau
    let best = Infinity, kind = null;
    for (let t = 2; t < 700; t += 2) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y > 60) break;
      const g = Math.max(API.heightAt(x, z), WATER);
      if (y <= g) { best = t; kind = g <= WATER + 1e-3 ? 'water' : 'ground'; break; }
    }
    if (kind) { out.kind = kind; out.p = o.clone().addScaledVector(d, best); }
    return out;
  }

  /* ── la cible : debout, explosée, remplacée ── */
  const TG = { st: 'up', t: 0 };
  function explodeTarget() {
    TG.st = 'gone'; TG.t = 0;
    FX.board.visible = false;
    const f = boardFrame(), M = new T.Matrix4(), V = new T.Vector3(), Q = new T.Quaternion(), S = new T.Vector3(), E = new T.Euler();
    FX.shards.count = 28; FX.shardData = [];
    for (let i = 0; i < 28; i++) {
      const lx = (hash(i, 3) - 0.5) * BOARD.w, ly = (hash(i, 5) - 0.5) * BOARD.h;
      const p = f.c.clone().addScaledVector(f.right, lx).addScaledVector(f.up, ly);
      const dir = f.n.clone().multiplyScalar(-1).add(new T.Vector3((hash(i, 7) - 0.5) * 1.2, hash(i, 9) * 0.9, (hash(i, 11) - 0.5) * 1.2)).normalize();
      const sp = 6 + hash(i, 13) * 12;
      FX.shardData[i] = { x: p.x, y: p.y, z: p.z, vx: dir.x * sp, vy: dir.y * sp + 4, vz: dir.z * sp, rx: 0, ry: hash(i, 15) * 6, sp: 4 + hash(i, 17) * 9, t: 0, life: 3, sc: 0.6 + hash(i, 19) * 0.9 };
      E.set(0, 0, 0); Q.setFromEuler(E); V.set(p.x, p.y, p.z); S.setScalar(FX.shardData[i].sc); FX.shards.setMatrixAt(i, M.compose(V, Q, S));
    }
    FX.shards.instanceMatrix.needsUpdate = true;
    FX.boomFlash.position.copy(f.c); FX.boomFlash.visible = true; FX.boomFlash.material.opacity = 1; FX.boomT = 0.4;
    FX.ring.visible = true; FX.ring.scale.setScalar(1); FX.ring.material.opacity = 0.7;
    puffSmoke(f.c.x, f.c.y, f.c.z, 8, { o: 0.6, size: 3, rise: 2.2, life: 1.8, col: 0x55504c, spread: 4, grow: 2.6 });
    FX.beacon.visible = false;
    sfx('stBoom');
  }
  const DRONE = { wait: 0.9, come: 2.6, seat: 0.5, leave: 1.6 };
  function targetTick(dt) {
    if (TG.st === 'up') return;
    TG.t += dt;
    const f = boardFrame(), seat = f.c.clone(), far = seat.clone().add(new T.Vector3(f.right.x * 60, 46, f.right.z * 60)), dr = FX.drone;
    const carryOff = 1.7 + BOARD.h / 2;
    if (TG.st === 'gone') {
      if (TG.t >= DRONE.wait) { TG.st = 'come'; TG.t = 0; dr.visible = true; FX.carry.visible = true; dr.children[dr.children.length - 1].visible = true; sfx('stDrone'); }
      return;
    }
    dr.rotation.y = -AIM0;
    if (TG.st === 'come') {
      const k = sstep(0, 1, TG.t / DRONE.come);
      dr.position.lerpVectors(far, seat.clone().add(new T.Vector3(0, carryOff, 0)), k);
      dr.position.y += Math.sin(k * Math.PI) * 6;
      dr.rotation.z = (1 - k) * -0.18;
      if (TG.t >= DRONE.come) { TG.st = 'seat'; TG.t = 0; }
    } else if (TG.st === 'seat') {
      dr.position.copy(seat).add(new T.Vector3(0, carryOff, 0));
      if (TG.t >= DRONE.seat) {
        TG.st = 'leave'; TG.t = 0;
        paintFreshTarget(); FX.board.visible = true; FX.beacon.visible = true;
        FX.carry.visible = false; dr.children[dr.children.length - 1].visible = false;
        sfx('stLock');
      }
    } else if (TG.st === 'leave') {
      const k = sstep(0, 1, TG.t / DRONE.leave);
      dr.position.lerpVectors(seat.clone().add(new T.Vector3(0, carryOff, 0)), far, k); dr.position.y += k * 10;
      if (TG.t >= DRONE.leave) { TG.st = 'up'; dr.visible = false; }
    }
  }

  /* ── états du chargeur ── */
  function setState(s) { FP.st = s; FP.stT = 0; updateHUD(); }
  function resetMagazine() {
    FP.shots = 0; FP.score = 0; FP.targets = 0; FP.isNew = false;
  }
  function startMagazine() {
    resetMagazine();
    FP.kp = 0; FP.ky = 0; FP.chamber = 0.6; FP.charge = 0; FP.charging = false;
    setState('ready');
  }
  // maintenir : la charge monte ; relâcher : le coup part avec la charge atteinte
  function pressFire() {
    if (!FP.on || FP.st !== 'ready' || FP.shots >= CFG.shots || FP.charging) return false;
    FP.charging = true; FP.charge = 0; FP.chargeSfx = 0;
    if (UI.hint && !UI.hint.hidden) UI.hint.hidden = true;
    return true;
  }
  function releaseFire() {
    if (!FP.charging) return false;
    FP.charging = false;
    discharge(FP.charge);
    return true;
  }
  function discharge(power) {
    const cam = P.camera, a = currentAim(), d = dirOf(a.yaw, a.pitch), o = cam.position.clone();
    const hit = traceShot(o, d);
    const full = power >= CFG.full;
    FP.shots++; FP.lastHit = hit; FP.lastPower = power;
    // points
    let pts = 0, label = null;
    if (hit.kind === 'board') {
      if (full) { FP.targets++; pts = 100 + 50 * (FP.targets - 1); label = tr('stand.boom') + ' +' + pts; explodeTarget(); }
      else { pts = hit.pts; paintImpact(hit.lx, hit.ly, FP.shots); }
    } else if (hit.kind === 'rabbit') { popRabbit(hit.rabbit); label = tr('stand.pof'); }
    FP.score += pts; hit.pts = pts; hit.label = label;
    // recul : plus fort à pleine charge
    const kp = lerp(CFG.kickPitch[0], CFG.kickPitch[1], power), ky = lerp(CFG.kickYaw[0], CFG.kickYaw[1], power);
    FP.kick = 0.5 + power; FP.kp += kp; FP.ky += ky * FP.recoilSign;
    FP.pitch = clamp(FP.pitch + rad(lerp(CFG.stayPitch[0], CFG.stayPitch[1], power)), rad(-CFG.limitPitch), rad(CFG.limitPitch));
    FP.yaw = clamp(FP.yaw + rad(lerp(CFG.stayYaw[0], CFG.stayYaw[1], power)) * FP.recoilSign, rad(-CFG.limitYaw), rad(CFG.limitYaw));
    FP.recoilSign *= -1;
    FP.chamber = 0.04;
    // rayon
    FP.group.updateMatrixWorld(true);
    const m = new T.Vector3(); FP.muzzle.getWorldPosition(m);
    const span = hit.p.clone().sub(m), len = span.length();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), span.clone().normalize()), mid = m.clone().addScaledVector(span, 0.5);
    const th = 0.05 + power * 0.1;
    FX.beam.position.copy(mid); FX.beam.quaternion.copy(q); FX.beam.scale.set(th, th, len);
    FX.beamGlow.position.copy(mid); FX.beamGlow.quaternion.copy(q); FX.beamGlow.scale.set(th * 4, th * 4, len);
    FX.beam.visible = true; FX.beamGlow.visible = true; FX.beamT = 0.1 + power * 0.06; MAT.beam.opacity = 1; MAT.beamGlow.opacity = 0.5;
    FP.flash.visible = true; FP.flash.material.opacity = 1; FP.flash.material.rotation = FP.shots * 0.7; FP.flash.scale.setScalar(0.8 + power * 0.9); FP.flashT = 0.07;
    FX.lightT = 0.12; FX.lightK = 0.6 + power; FX.lightA = m.clone().add(new T.Vector3(0, 0.35, -0.6)); FX.lightB = hit.p.clone().add(new T.Vector3(0, 0.6, 0));
    screenFlash(power);
    sfx(power > 0.6 ? 'stShotHi' : 'stShotLo');
    if (navigator.vibrate) { try { navigator.vibrate(Math.round(14 + power * 30)); } catch (e) {} }
    impact(hit);
    setState(FP.shots >= CFG.shots ? 'last' : 'cooldown');
    return hit;
  }
  function impact(hit) {
    const p = hit.p;
    if (hit.kind !== 'sky' && hit.kind !== 'rabbit') {
      FX.hitFlash.position.copy(p); FX.hitFlash.visible = true; FX.hitFlash.material.opacity = 1; FX.hitT = 0.14; FX.hitScale = hit.kind === 'board' ? 2.2 : 1.6;
    }
    if (hit.kind === 'board' && FX.board.visible) {
      burstChips(p.x, p.y, p.z, 10, 0xd9d2c2, 6, 7);
      puffSmoke(p.x, p.y, p.z, 3, { o: 0.4, size: 1.2, rise: 1.6, life: 0.9, col: 0x75716c });
      sfx('stClang', 0.1);
    } else if (hit.kind === 'ground') {
      burstChips(p.x, p.y + 0.2, p.z, 12, 0x5c452f, 7, 8);
      puffSmoke(p.x, p.y + 0.3, p.z, 3, { o: 0.5, size: 1.5, rise: 2, life: 0.9, col: 0x6f5e4a });
      sfx('stDirt', 0.05);
    } else if (hit.kind === 'water') {
      burstChips(p.x, p.y + 0.1, p.z, 8, 0xcfe8ff, 3, 11);
      puffSmoke(p.x, p.y + 0.3, p.z, 4, { o: 0.6, size: 1.6, rise: 3, life: 0.8, col: 0xd8ecff, spread: 0.8 });
      sfx('stSplash', 0.1);
    }
    showPoints(hit);
  }
  function finishMagazine() {
    FP.isNew = saveBest(FP.score);
    FP.lastScore = FP.score;
    setState('result');
  }
  function replay() {
    if (FP.st === 'result') startMagazine();
  }

  /* ───────────────────────── boucle ───────────────────────── */
  function tick(dt0) {
    if (!built) return;
    const dt = dt0 * (CFG.timeScale == null ? 1 : CFG.timeScale);
    placeOffer();
    soldierLOD();
    nightTick();
    particlesTick(dt);
    if (FP.flashT > 0) { FP.flashT -= dt; FP.flash.material.opacity = clamp(FP.flashT / 0.07, 0, 1); if (FP.flashT <= 0) FP.flash.visible = false; }
    if (!FP.on) return;
    rabbitsTick(dt);
    targetTick(dt);
    FP.t += dt; FP.stT += dt;
    // recul qui s'amortit
    const ka = Math.exp(-dt * 7.5); FP.kp *= ka; FP.ky *= ka;
    FP.kick *= Math.exp(-dt * 8.5);
    // charge
    if (FP.charging) {
      FP.charge = Math.min(1, FP.charge + dt / CFG.chargeTime);
      FP.chargeSfx = (FP.chargeSfx || 0) + dt;
      if (FP.chargeSfx >= 0.3) { FP.chargeSfx = 0; sfx(FP.charge >= CFG.full ? 'stChg4' : FP.charge > 0.6 ? 'stChg3' : FP.charge > 0.3 ? 'stChg2' : 'stChg1'); }
    }
    FP.chamber += ((FP.charging ? 0.5 + FP.charge * 1.4 : (FP.st === 'ready' ? 0.62 : 0.3)) - FP.chamber) * Math.min(1, dt * (FP.charging ? 12 : 2.6));
    // apnée
    breathTick(dt);
    switch (FP.st) {
      case 'cooldown': if (FP.stT >= CFG.cooldown) setState('ready'); break;
      case 'last': if (FP.stT >= CFG.resultDelay) finishMagazine(); break;
    }
    // lunette : le champ se resserre
    const want = FP.scopeOn ? 1 : 0; FP.scope += (want - FP.scope) * Math.min(1, dt * 11);
    const cam = P.camera, baseFov = cam.aspect < 1 ? CFG.fov : CFG.fovWide, fov = lerp(baseFov, CFG.scopeFov, FP.scope);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    UI.scope.style.opacity = FP.scope.toFixed(3); UI.scope.style.display = FP.scope > 0.02 ? 'block' : 'none';
    FP.group.visible = FP.scope < 0.6;   // dans la lunette, l'arme sort du cadre
    // caméra : la position ne bouge jamais, seule l'orientation change
    const a = currentAim(), d = dirOf(a.yaw, a.pitch);
    const tremble = FP.charging && FP.charge >= CFG.full ? 0.0012 : 0;
    P.controls.target.copy(cam.position).addScaledVector(d, 24).add(new T.Vector3((Math.random() - 0.5) * tremble * 24, (Math.random() - 0.5) * tremble * 24, 0));
    cam.lookAt(P.controls.target);
    cam.updateMatrixWorld();
    // l'arme suit la caméra, avec le recul et un léger balancement
    FP.group.position.copy(cam.position); FP.group.quaternion.copy(cam.quaternion);
    const bob = Math.sin(FP.t * 1.6) * 0.006, gp = cam.aspect > 1 ? CFG.gunWide : CFG.gunTall, sh = FP.charging ? FP.charge * FP.charge * 0.012 : 0;
    FP.gun.scale.setScalar(gp.s);
    FP.gun.position.set(gp.x + Math.sin(FP.t * 0.9) * 0.005 + (Math.random() - 0.5) * sh, gp.y + bob - FP.kick * 0.015 + (Math.random() - 0.5) * sh, gp.z + FP.kick * 0.34);
    FP.gun.rotation.set(gp.tilt + FP.kick * 0.15, 0, Math.sin(FP.t * 0.7) * 0.004);
    // chambre d'énergie
    const lvl = FP.chamber * (0.9 + Math.sin(FP.t * 7) * 0.1);
    MAT.core.color.setRGB(Math.min(1.6, lvl + 0.1), 0.34 * lvl * (1 - FP.charge * 0.6), 0.12 * lvl);
    FP.chamberHalo.material.opacity = clamp(lvl * 0.62, 0, 0.95);
    FP.chamberHalo.scale.setScalar(0.3 + lvl * 0.2);
    FP.leds.forEach((m, i) => { const left = CFG.shots - FP.shots; m.material.color.setHex(i < Math.ceil(left / 4) ? 0xff5a24 : 0x241210); });
    // interface : charge et apnée
    if (UI.ring) UI.ring.setAttribute('stroke-dashoffset', ((1 - (FP.charging ? FP.charge : 0)) * 100).toFixed(1));
    UI.fire.classList.toggle('full', FP.charging && FP.charge >= CFG.full);
    UI.breathBar.style.transform = `scaleY(${(FP.breath).toFixed(3)})`;
    UI.breath.classList.toggle('hold', FP.breathSt === 'hold'); UI.breath.classList.toggle('heart', FP.breathSt === 'heart');
    if (window.SBFluid) SBFluid.poke();
  }
  function breathTick(dt) {
    if (FP.breathSt === 'calm') { FP.breath = Math.min(1, FP.breath + dt / 4); if (FP.breathPtr && FP.breath > 0.25) { FP.breathSt = 'hold'; FP.breathT = 0; sfx('stBreath'); } }
    else if (FP.breathSt === 'hold') {
      FP.breathT += dt; FP.breath = Math.max(0, 1 - FP.breathT / CFG.breathHold);
      if (!FP.breathPtr || FP.breathT >= CFG.breathHold) { FP.breathSt = FP.breathT >= CFG.breathHold * 0.6 ? 'heart' : 'calm'; FP.breathT = 0; if (FP.breathSt === 'heart') sfx('stHeart'); }
    } else if (FP.breathSt === 'heart') {
      FP.breathT += dt; FP.breath = Math.min(1, FP.breathT / CFG.breathRecover * 0.5);
      if (FP.breathT >= CFG.breathRecover) { FP.breathSt = 'calm'; FP.breathT = 0; }
    }
  }
  // la nuit : projecteurs, plaque éclairée, lampe du poste
  function nightTick() {
    const k = window.SBSky && SBSky.k != null ? SBSky.k : 1, night = 1 - k;
    if (FX.nightK !== undefined && Math.abs(FX.nightK - night) < 0.01) return; FX.nightK = night;
    FX.floodMat.opacity = night * 0.16;
    FX.floods.forEach(o => { if (o.isSprite) o.material.opacity = night * 0.8; });
    FX.boardMat.emissiveIntensity = night * 0.75;
    FX.lampHalo.material.opacity = night * 0.7;
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
        cam.fov = cam.aspect < 1 ? CFG.fov : CFG.fovWide; cam.near = 0.2; cam.far = 3000; cam.updateProjectionMatrix();
        cam.position.set(POST.x, FX.Y + EYE, POST.z);
        FP.on = true; FP.t = 0; FP.kick = 0; FP.flashT = 0; FP.recoilSign = 1; FP.scope = 0; FP.scopeOn = false; FP.breath = 1; FP.breathSt = 'calm'; FP.breathPtr = null; FP.ptr = null; FP.pinch = null;
        FP.yaw = rad(-1.5); FP.pitch = rad(0.8);
        FP.group.visible = true; FP.sky.visible = true; paintSky();
        if (guardPass) guardPass.enabled = true;
        document.getElementById('scr-planet').classList.add('sbs-on');
        startMagazine();
        const seen = (typeof G !== 'undefined' && G.explore && G.explore.standSeries) || 0;
        UI.hint.hidden = seen >= 3;
        UI.hint.textContent = seen === 0 ? tr('stand.hint1') : seen === 1 ? tr('stand.hint2') : tr('stand.hint3');
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
      FP.on = false; FP.ptr = null; FP.breathPtr = null; FP.pinch = null; FP.charging = false; FP.st = 'off';
      document.getElementById('scr-planet').classList.remove('sbs-on');
      FP.group.visible = false; FP.sky.visible = false; FP.flash.visible = false;
      UI.scope.style.display = 'none';
      FX.beam.visible = false; FX.beamGlow.visible = false; FX.hitFlash.visible = false; FX.boomFlash.visible = false; FX.ring.visible = false; FX.beamT = 0; FX.hitT = 0; FX.lightT = 0; FX.boomT = 0;
      if (P._pool) { P._pool[7].intensity = 0; P._pool[6].intensity = 0; }
      if (guardPass) guardPass.enabled = false;
      // la cible revient neuve et debout pour la prochaine fois
      TG.st = 'up'; FX.drone.visible = false; FX.board.visible = true; FX.beacon.visible = true; paintFreshTarget();
      FX.shards.count = 0; FX.shards.instanceMatrix.needsUpdate = true;
      RB.list.forEach(r => { if (r.dead > 0) { r.dead = 0; r.g.visible = true; placeRabbit(r); } });
      resetMagazine();
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
  const SOL_YAW = AIM0 + Math.PI / 2;   // le fusil du modèle pointe vers la plateforme
  const SOL_MATS = {
    M_RP_RED: [9310229, 0.36, 0.15], M_RP_ARMOR: [2895669, 0.42, 0.3], M_RP_STEEL: [7764868, 0.35, 0.45], M_SOL_GUNMETAL: [2500910, 0.4, 0.4],
    M_RP_BLACK: [1381914, 0.5, 0.3], M_SOL_SUIT: [1250328, 0.72, 0.1], M_RP_POUCH: [3025448, 0.8, 0.05], M_RP_WHITE: [14211284, 0.4, 0.05], M_RP_VISOR: [328966, 0.2, 0.3],
  };
  function buildSoldierProxy() {
    const p = [], add = (g, c, m) => p.push([g, c, m]), s = 2.35;
    const at = (x, y, z, rx = 0, ry = 0, rz = 0, a = 1, b = a, c = a) => M4(x * s, y * s, z * s, rx, ry, rz, a, b, c);
    add(cbox(0.3 * s, 0.82 * s, 0.34 * s, 0.05), SUIT, at(-0.18, 0.42, 0)); add(cbox(0.3 * s, 0.82 * s, 0.34 * s, 0.05), SUIT, at(0.18, 0.42, 0));
    add(cbox(0.68 * s, 0.72 * s, 0.44 * s, 0.1), RED, at(0, 1.2, 0)); add(cbox(0.72 * s, 0.14 * s, 0.46 * s, 0.03), BLACK, at(0, 0.88, 0));
    add(cbox(0.3 * s, 0.26 * s, 0.34 * s, 0.07), ARMOR, at(0, 1.72, -0.02));
    add(cbox(0.3 * s, 0.25 * s, 0.34 * s, 0.05), RED, at(-0.46, 1.42, 0)); add(cbox(0.3 * s, 0.25 * s, 0.34 * s, 0.05), RED, at(0.46, 1.42, 0));
    add(cbox(0.17 * s, 0.17 * s, 0.56 * s, 0.03), ARMOR, at(-0.3, 1.26, -0.32)); add(cbox(0.17 * s, 0.17 * s, 0.56 * s, 0.03), ARMOR, at(0.3, 1.26, -0.32));
    add(cbox(0.2 * s, 0.2 * s, 1.1 * s, 0.03), GUNM, at(0, 1.3, -0.82));
    const m = new T.Mesh(merge(p), MAT.hard); m.castShadow = true; m.position.set(POST.x, FX.Y, POST.z); m.rotation.y = -AIM0; STG.add(m);
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

  /* ───────────────────────── carte d'exploration : éclaircie temporaire, bulle ───────────────────────── */
  const CUTS = [];
  // la clairière du poste, puis un couloir de tir jusqu'au lac : rien ne doit cacher la plateforme
  function inLane(x, z) {
    if (Math.hypot(x - POST.x, z - POST.z) <= LANE.r) return true;
    const dx = TGT.x - POST.x, dz = TGT.z - POST.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const px = x - POST.x, pz = z - POST.z, along = px * ux + pz * uz, across = Math.abs(px * uz - pz * ux);
    return along > 0 && along < L && across < 9 + along * 0.08;
  }
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
        if (!inLane(x, z)) continue;
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
    for (const [x, y, z] of [[POST.x - 9, 0, POST.z + 7], [POST.x + 9, 0, POST.z + 7], [POST.x - 9, 8, POST.z - 8], [POST.x + 9, 8, POST.z - 8]]) {
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
    const [sx, sy] = API.screenOf(POST.x, FX.Y + 9, POST.z), hr = document.getElementById('scr-planet').getBoundingClientRect(), w = UI.offer.offsetWidth || 120;
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
    #sbs-flash { position:absolute; inset:0; background:#ff6a50; opacity:0; pointer-events:none; }
    #sbs-scope { position:absolute; inset:0; pointer-events:none; display:none; background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0, rgba(0,0,0,0) 34%, rgba(0,0,0,.55) 38%, rgba(2,3,5,.98) 42%); }
    #sbs-scope svg { position:absolute; left:50%; top:50%; width:min(76vw,76vh); height:min(76vw,76vh); transform:translate(-50%,-50%); }
    #sbs-cross { position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px; pointer-events:none; filter:drop-shadow(0 0 2px rgba(0,0,0,.75)); }
    #sbs-top { position:absolute; left:0; right:0; top:calc(var(--sai,0px) + 10px); display:flex; justify-content:center; gap:6px; pointer-events:none; }
    #sbs-top span { height:30px; padding:0 11px; display:flex; align-items:center; border-radius:15px; background:rgba(6,10,14,.62); border:1px solid rgba(255,255,255,.14); color:#e9eef2; font:600 12px/1 'JetBrains Mono',monospace; backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); white-space:nowrap; }
    #sbs-best { position:absolute; left:0; right:0; top:calc(var(--sai,0px) + 46px); text-align:center; font:500 11px/1 'JetBrains Mono',monospace; color:rgba(255,255,255,.72); text-shadow:0 1px 3px rgba(0,0,0,.8); pointer-events:none; }
    #sbs-back { position:absolute; left:12px; bottom:calc(var(--sab,0px) + 24px); height:42px; padding:0 14px; display:flex; align-items:center; gap:7px; white-space:nowrap; border-radius:21px; cursor:pointer; background:rgba(6,14,20,.74); border:1px solid rgba(120,220,255,.42); color:#d6f3ff; font:500 12px/1 'Space Grotesk',system-ui,sans-serif; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
    #sbs-back svg { width:14px; height:14px; }
    #sbs-fire { position:absolute; right:14px; bottom:calc(var(--sab,0px) + 18px); width:100px; height:100px; border-radius:50%; cursor:pointer; touch-action:none; background:radial-gradient(circle at 50% 38%, #c9281e, #7c100c); border:2px solid rgba(255,190,170,.75); color:#fff3ee; font:700 16px/1 'Space Grotesk',system-ui,sans-serif; letter-spacing:.05em; box-shadow:0 4px 18px rgba(0,0,0,.5), 0 0 16px rgba(255,60,30,.35); transition:opacity .12s ease; padding:0; }
    #sbs-fire.off { opacity:.42; }
    #sbs-fire.full { background:radial-gradient(circle at 50% 38%, #fff0e6, #ff5a3a); color:#5a0c06; box-shadow:0 0 28px rgba(255,120,80,.8); }
    #sbs-fire svg { position:absolute; inset:-2px; width:calc(100% + 4px); height:calc(100% + 4px); pointer-events:none; }
    #sbs-fire span { position:relative; }
    #sbs-scopebtn { position:absolute; right:30px; bottom:calc(var(--sab,0px) + 130px); height:34px; padding:0 12px; border-radius:17px; cursor:pointer; background:rgba(6,10,14,.66); border:1px solid rgba(255,255,255,.22); color:#e9eef2; font:500 12px/1 'Space Grotesk',system-ui,sans-serif; }
    #sbs-scopebtn.on { background:rgba(255,255,255,.88); color:#111; }
    #sbs-breath { position:absolute; left:14px; top:50%; width:10px; height:120px; margin-top:-60px; border-radius:5px; background:rgba(6,10,14,.5); border:1px solid rgba(255,255,255,.2); overflow:hidden; pointer-events:none; }
    #sbs-breath i { position:absolute; left:0; right:0; bottom:0; height:100%; background:rgba(255,255,255,.75); transform-origin:50% 100%; }
    #sbs-breath.hold i { background:#8ff0c0; }
    #sbs-breath.heart i { background:#ff6a50; }
    #sbs-breath b { position:absolute; left:16px; top:50%; transform:translateY(-50%) rotate(0); font:500 10px/1 'JetBrains Mono',monospace; color:rgba(255,255,255,.65); white-space:nowrap; letter-spacing:.08em; }
    #sbs-hint { position:absolute; left:50%; top:calc(50% - 138px); transform:translateX(-50%); padding:7px 12px; border-radius:9px; background:rgba(6,10,14,.66); color:#e9eef2; font-size:12.5px; white-space:nowrap; pointer-events:none; }
    #sbs-hint[hidden] { display:none; }
    .sbs-pts { position:absolute; left:0; top:0; font:800 20px/1 'Space Grotesk',system-ui,sans-serif; color:#fff; text-shadow:0 1px 5px rgba(0,0,0,.9), 0 0 10px rgba(255,120,60,.6); pointer-events:none; white-space:nowrap; }
    .sbs-pts.zero { color:#d8d8d4; font-size:15px; font-weight:600; }
    .sbs-pts.boom { color:#ffd27a; font-size:24px; }
    #sbs-result { position:absolute; left:50%; top:calc(var(--sai,0px) + 66px); transform:translateX(-50%); width:min(88%,340px); display:none; flex-direction:column; align-items:center; gap:8px; padding:10px 12px 11px; border-radius:14px; background:rgba(6,10,14,.82); border:1px solid rgba(255,255,255,.16); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
    #sbs-result.on { display:flex; }
    #sbs-rline { font:700 15px/1.25 'Space Grotesk',system-ui,sans-serif; color:#fff; text-align:center; }
    #sbs-rline.rec { color:#ffd27a; }
    #sbs-again { height:40px; min-width:150px; padding:0 18px; border-radius:21px; cursor:pointer; background:rgba(201,40,30,.9); border:1px solid rgba(255,190,170,.75); color:#fff; font:600 14px/1 'Space Grotesk',system-ui,sans-serif; }`;
    document.head.appendChild(css);
    const scr = document.getElementById('scr-planet');
    const offer = document.createElement('button'); offer.id = 'sbs-offer'; offer.textContent = tr('stand.offer'); scr.appendChild(offer); UI.offer = offer;
    offer.addEventListener('click', () => openFP());
    const hud = document.createElement('div'); hud.id = 'sbs-hud';
    hud.innerHTML = `<div id="sbs-flash"></div>
      <div id="sbs-scope"><svg viewBox="0 0 200 200" fill="none" stroke="rgba(255,255,255,.85)" stroke-width=".6"><circle cx="100" cy="100" r="98" stroke-width="1.4"/><path d="M100 2v70M100 128v70M2 100h70M128 100h70"/><path d="M100 78v44M78 100h44" stroke-width=".4" stroke-opacity=".6"/><g stroke-width=".5">${[86, 93, 107, 114].map(v => `<path d="M${v} 97v6M97 ${v}h6"/>`).join('')}</g></svg></div>
      <svg id="sbs-cross" viewBox="0 0 58 58" fill="none" stroke="#fff" stroke-linecap="round"><path d="M29 6v9M29 43v9M6 29h9M43 29h9" stroke-width="1.8"/><circle cx="29" cy="29" r="1.5" fill="#ff5a3a" stroke="none"/></svg>
      <div id="sbs-top"><span id="sbs-shots"></span><span id="sbs-score"></span><span id="sbs-targets"></span></div>
      <div id="sbs-best"></div>
      <div id="sbs-breath"><i></i></div>
      <div id="sbs-hint"></div>
      <div id="sbs-result"><div id="sbs-rline"></div><button id="sbs-again"></button></div>
      <button id="sbs-back"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3 2.5 8 7 13M3 8h10.5"/></svg><span></span></button>
      <button id="sbs-scopebtn"></button>
      <button id="sbs-fire"><svg viewBox="0 0 100 100"><circle class="ring" cx="50" cy="50" r="47" pathLength="100" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 50 50)" stroke-linecap="round"/></svg><span></span></button>`;
    scr.appendChild(hud);
    Object.assign(UI, {
      hud, flash: hud.querySelector('#sbs-flash'), scope: hud.querySelector('#sbs-scope'), ring: hud.querySelector('#sbs-fire .ring'), shots: hud.querySelector('#sbs-shots'), score: hud.querySelector('#sbs-score'), targets: hud.querySelector('#sbs-targets'), best: hud.querySelector('#sbs-best'), hint: hud.querySelector('#sbs-hint'),
      result: hud.querySelector('#sbs-result'), rline: hud.querySelector('#sbs-rline'), again: hud.querySelector('#sbs-again'), back: hud.querySelector('#sbs-back'), fire: hud.querySelector('#sbs-fire'), scopeBtn: hud.querySelector('#sbs-scopebtn'), breath: hud.querySelector('#sbs-breath'), breathBar: hud.querySelector('#sbs-breath i'),
    });
    UI.fire.querySelector('span').textContent = tr('stand.fire');
    UI.scopeBtn.textContent = tr('stand.scope');
    UI.back.querySelector('span').textContent = tr('stand.back');
    UI.back.addEventListener('click', () => closeFP());
    UI.again.addEventListener('click', () => replay());
    UI.scopeBtn.addEventListener('click', () => setScope(!FP.scopeOn));
    // « Tirer » : maintenir charge, relâcher tire ; une pression = un coup
    UI.fire.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); try { UI.fire.setPointerCapture(e.pointerId); } catch (err) {} pressFire(); });
    const fireUp = e => { e.stopPropagation(); releaseFire(); };
    UI.fire.addEventListener('pointerup', fireUp); UI.fire.addEventListener('pointercancel', fireUp);
    for (const b of [UI.back, UI.again, UI.scopeBtn]) b.addEventListener('pointerdown', e => e.stopPropagation());
    // dans la scène : un doigt glisse = visée ; un doigt immobile = apnée ; deux doigts = pince (lunette)
    const pts = new Map();
    hud.addEventListener('pointerdown', e => {
      if (!FP.on) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false });
      try { hud.setPointerCapture(e.pointerId); } catch (err) {}
      if (pts.size === 2) { const [a, b] = [...pts.values()]; FP.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), on: FP.scopeOn }; FP.ptr = null; FP.breathPtr = null; }
      else if (pts.size === 1 && !FP.ptr) FP.ptr = e.pointerId;
      if (!UI.hint.hidden) UI.hint.hidden = true;
    });
    hud.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 9) p.moved = true;
      if (FP.pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = d / FP.pinch.d0;
        if (!FP.pinch.on && r > 1.25) { setScope(true); FP.pinch.on = true; FP.pinch.d0 = d; }
        else if (FP.pinch.on && r < 0.8) { setScope(false); FP.pinch.on = false; FP.pinch.d0 = d; }
        return;
      }
      if (e.pointerId === FP.breathPtr) { if (p.moved) { FP.breathPtr = null; FP.ptr = e.pointerId; } return; }
      if (e.pointerId !== FP.ptr) return;
      const sens = CFG.sensitivity * lerp(1, CFG.scopeFov / CFG.fov, FP.scope);
      FP.yaw = clamp(FP.yaw + rad(dx * sens), rad(-CFG.limitYaw), rad(CFG.limitYaw));
      FP.pitch = clamp(FP.pitch - rad(dy * sens), rad(-CFG.limitPitch), rad(CFG.limitPitch));
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (e.pointerId === FP.ptr) FP.ptr = null;
      if (e.pointerId === FP.breathPtr) FP.breathPtr = null;
      if (pts.size < 2) FP.pinch = null;
    };
    hud.addEventListener('pointerup', up); hud.addEventListener('pointercancel', up);
    // un doigt posé sans bouger pendant 220 ms devient l'apnée
    setInterval(() => {
      if (!FP.on || FP.breathPtr || FP.pinch) return;
      const now = performance.now();
      for (const [id, p] of pts) { if (!p.moved && now - p.t > 220 && (id === FP.ptr || FP.ptr == null)) { FP.breathPtr = id; if (FP.ptr === id) FP.ptr = null; break; } }
    }, 60);
    // ordinateur : espace = charger/tirer, Z ou molette = lunette, Maj = apnée
    addEventListener('keydown', e => {
      if (!FP.on) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); pressFire(); }
      if (e.code === 'KeyZ' && !e.repeat) setScope(!FP.scopeOn);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') FP.breathPtr = FP.breathPtr || 'key';
    });
    addEventListener('keyup', e => {
      if (!FP.on) return;
      if (e.code === 'Space') releaseFire();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (FP.breathPtr === 'key') FP.breathPtr = null; }
    });
    hud.addEventListener('wheel', e => { if (FP.on) { e.preventDefault(); setScope(e.deltaY < 0); } }, { passive: false });
  }
  function setScope(on) { FP.scopeOn = !!on; UI.scopeBtn.classList.toggle('on', FP.scopeOn); }
  function screenFlash(power) {
    try { UI.flash.animate([{ opacity: 0.08 + power * 0.14 }, { opacity: 0 }], { duration: 90 + power * 60, easing: 'ease-out' }); } catch (e) {}
  }
  function showPoints(hit) {
    if (hit.kind === 'sky') return;
    const [sx, sy] = API.screenOf(hit.p.x, hit.p.y, hit.p.z), hr = UI.hud.getBoundingClientRect(), d = document.createElement('div');
    const boom = hit.label && hit.pts > 0;
    d.className = 'sbs-pts' + (boom ? ' boom' : hit.pts ? '' : ' zero'); d.textContent = hit.label || (hit.pts ? tr('stand.pts', { n: hit.pts }) : tr('stand.miss')); UI.hud.appendChild(d);
    const w = d.offsetWidth, x = clamp(sx - hr.left - w / 2, 6, hr.width - w - 6), y = clamp(sy - hr.top - 32, 80, hr.height - 140);
    try {
      d.animate([{ transform: `translate(${x}px,${y + 10}px) scale(.7)`, opacity: 0 }, { transform: `translate(${x}px,${y}px) scale(1.08)`, opacity: 1, offset: 0.14 }, { transform: `translate(${x}px,${y - 18}px) scale(1)`, opacity: 1, offset: 0.75 }, { transform: `translate(${x}px,${y - 28}px) scale(1)`, opacity: 0 }], { duration: boom ? 1400 : 900, easing: 'ease-out' }).onfinish = () => d.remove();
    } catch (e) { d.remove(); }
  }
  function updateHUD() {
    if (!UI.shots) return;
    UI.shots.textContent = tr('stand.shots', { n: FP.shots, m: CFG.shots });
    UI.score.textContent = tr('stand.score', { n: FP.score });
    UI.targets.textContent = tr('stand.targets', { n: FP.targets });
    const best = bestScore(); UI.best.textContent = best ? tr('stand.best', { n: best }) : '';
    UI.fire.classList.toggle('off', FP.st !== 'ready');
    const res = FP.st === 'result';
    UI.result.classList.toggle('on', res);
    if (res) {
      UI.rline.textContent = FP.isNew ? tr('stand.result', { n: FP.score }) + ' — ' + tr('stand.record') : tr('stand.result2', { n: FP.score, b: bestScore() });
      UI.rline.classList.toggle('rec', !!FP.isNew);
      UI.again.textContent = tr('stand.again');
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
      if (!X.obstacles.length) X.obstacles.push([POST.x, POST.z, 7]);
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
    open: openFP, close: closeFP, pressFire, releaseFire, replay, setScope,
    fire() { if (!pressFire()) return false; FP.charge = 1; return releaseFire(); },
    get state() { return FP.st; },
    get on() { return FP.on; },
    _dbg: { FP, FX, TG, RB, CFG, TGT, POST, TARGET_R, BOARD, ZONES, AIM0, DIST, C_W, C_K, C_H, get targetCtx() { return targetCtx; }, get cuts() { return CUTS.length; }, tick, discharge, traceShot, currentAim, dirOf, scoreAt, standHit, boardFrame, get built() { return built; }, get UI() { return UI; },
      aimAt(x, y) { const f = boardFrame(), p = f.c.clone().addScaledVector(f.right, x).addScaledVector(f.up, y), o = P.camera.position, d = p.sub(o); FP.yaw = Math.atan2(d.x, -d.z) - AIM0; FP.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); } },
  };
})();
