/* Starbyte — Station3D : les stations en 3D — The Drifting Crown (port franc pirate), le Sanctuaire du Linceul des Cendres (bastion impérial), la Station Erebus et le Refuge de Brest, option profile: 'crown' | 'sanctuary' | 'noire' | 'refuge'.
   Source : vitrine validée par Adrien (artifact « The Drifting Crown », 14 oct. 2026), portée sur le moteur partagé
   du jeu (window.SB3D) : mêmes matériaux (lookdev procédural sans UV), même ciel (nébuleuse, géante gazeuse, soleil),
   même trafic (navettes sur les axes, ronde autour de l'anneau, transporteurs au loin). Sans GTAO (mobile).
   Trois cadrages : « port » (la station entière, en orbite lente), « bar » (la façade du bar sur l'anneau, de près)
   et « dock » (un bras d'amarrage, ton tanker à quai — option tanker: true).
   Usage : const h = window.Station3D.mount(container, { url, view: 'port'|'bar', intro, interactive, onProgress, onReady, onError });
           h.setView('bar'); h.setInteractive(true); h.replayIntro(); h.dispose();
*/
import { MeshoptDecoder } from './meshopt_decoder.module.js';   // 16/10 — modèles compressés (EXT_meshopt_compression)
const GLOSS_ENV = 0.22;
// 15/10 — deux stations, même moteur : chacune son modèle, son ciel, sa lumière, ses cadrages (repère Blender, m)
const PROFILES = {
  // The Drifting Crown : station pirate, nébuleuse rouge pourpre
  crown: {
    S: 0.01, near: 0.02, half: [9.8, 11.5], minFit: 16, bg: 0x050106, haze: 0x2a0b20, fog: [10, 27],
    sun: [-0.52, 0.52, -0.68], core: [-0.50, 0.30, -0.81],
    GLOSS: {
      M_DC_HULL_CREAM: [0.86, 0.0], M_DC_HULL_GREY: [0.82, 0.12], M_DC_HULL_PATCH: [0.88, 0.05], M_DC_GUNMETAL: [0.74, 0.30],
      M_DC_DARK: [0.84, 0.15], M_DC_RUST: [0.92, 0.05], M_DC_BRASS: [0.62, 0.45], M_DC_RED: [0.84, 0.0], M_DC_GLASS: [0.30, 0.1],
    },
    GLOW: {
      M_DC_WIN_AMBER: 3.4, M_DC_WIN_WARM: 2.8, M_DC_WIN_WHITE: 2.0, M_DC_NEON_GOLD: 4.5, M_DC_NEON_RED: 5.0,
      M_DC_HANGAR_LIGHT: 4.0, M_DC_ENGINE: 5.0, M_DC_BEACON: 8.0, M_DC_NAV_RED: 4.0, M_DC_NAV_GREEN: 4.0,
    },
    GLOW_COLOR: {
      M_DC_WIN_AMBER: 0xff8a2c, M_DC_WIN_WARM: 0xffb468, M_DC_WIN_WHITE: 0xd8e4ff, M_DC_NEON_GOLD: 0xffa830, M_DC_NEON_RED: 0xff2a14,
      M_DC_HANGAR_LIGHT: 0xffa860, M_DC_ENGINE: 0x8ab8ff, M_DC_BEACON: 0xfff2dc, M_DC_NAV_RED: 0xff1a10, M_DC_NAV_GREEN: 0x20ff60,
    },
    LOOK: {
      M_DC_HULL_CREAM: { cell: [7.0, 4.5], seam: .14, depth: .10, tint: .07, rough: .10, grime: .42, wear: .25 },
      M_DC_HULL_GREY:  { cell: [6.0, 4.0], seam: .14, depth: .25, tint: .08, rough: .12, grime: .34, wear: .35 },
      M_DC_HULL_PATCH: { cell: [5.0, 3.5], seam: .16, depth: .20, tint: .14, rough: .14, grime: .46, wear: .35 },
      M_DC_GUNMETAL:   { cell: [5.0, 3.0], seam: .14, depth: .40, tint: .08, rough: .14, grime: .24, wear: .45 },
      M_DC_DARK:       { cell: [12.0, 7.0], seam: .20, depth: .14, tint: .14, rough: .18, grime: .18, wear: .25 },
      M_DC_RUST:       { cell: [5.0, 3.5], seam: .16, depth: .16, tint: .18, rough: .16, grime: .40, wear: .20 },
      M_DC_RED:        { cell: [6.0, 4.0], seam: .14, depth: .12, tint: .08, rough: .10, grime: .32, wear: .30 },
      M_DC_BRASS:      { cell: [4.0, 3.0], seam: .10, depth: .10, tint: .10, rough: .10, grime: .30, wear: .50 },
    },
    glass: [.03, .02, .03], rockLift: null, nav: (n) => n.startsWith('M_DC_NAV_'), beacon: 'M_DC_BEACON', navPulse: [1.2, 3.6, 2.2],
    cloud: { dust: [0x140409, 0x0e030a, 0x1a0612], gas: [0x6a0f1c, 0x5a1238, 0x34124e, 0x7a1e28], glow: [0xff3a48, 0xff5a64, 0xb04aff],
             nearSize: [9, 13], farSize: [30, 36], nearR: [15, 17], farR: [40, 40], nearY: [-8, 9], farY: [-24, 34], w: 0.012 },
    sky: { a: '.55, .03, .06', b: '.40, .04, .22', c: '.18, .04, .32', base: '.014, .004, .010', fil: '1.0, .36, .40', glow: '.85, .28, .40' },
    sunStops: [
      [42,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,240,236,1)'], [.5, 'rgba(255,200,200,.6)'], [1, 'rgba(255,160,170,0)']], .95, 1],
      [300, [[0, 'rgba(255,220,215,.85)'], [.12, 'rgba(255,150,160,.40)'], [.4, 'rgba(200,60,120,.10)'], [1, 'rgba(120,30,90,0)']], .85, 1],
      [1000, [[0, 'rgba(255,170,170,.28)'], [.3, 'rgba(180,50,110,.08)'], [1, 'rgba(80,20,60,0)']], .8, 1],
      [760, [[0, 'rgba(255,200,215,.7)'], [.25, 'rgba(220,110,170,.22)'], [1, 'rgba(140,60,140,0)']], .4, 0.03],
    ],
    key: [0xffd8c8, 2.9, 30, 15, 70], fill: [0xc8304e, 1.7], rim: [0x9a50ff, 0.9], hemi: [0x3a1634, 0x30070f],
    // axes et flèches (angle Blender ° depuis l'est vers le nord, longueur m) → bouts des quais
    tips: [[0, 1200], [90, 1180], [180, 1200], [270, 1294], [32, 1110], [54.5, 1100], [125, 1097], [202.5, 1245], [229, 1080], [316, 1350]]
      .map(([a, L]) => { const r = a * Math.PI / 180; return [Math.cos(r) * L, Math.sin(r) * L, 0, 1]; }),
    lane: { n: 96, nLite: 40, out: [10, 18], spread: 3, lift: [3, 2], size: [0.25, 0.55] },
    orbit: { n: 54, nLite: 24, r: [7.6, 3.6], y: 2.4, size: [0.18, 0.35] },
    target: [0, -2.2, 0], introTarget: [0, 0.9, 0], minDist: 1.6,   // 16/10 — cible abaissée : la station remonte vers le haut de l'écran
    lights: (L, hv, P) => {
      L(0xff9a50, 6, 3.2, P(751, 330, 0));
      const bar = L(0xffb060, 5.5, 3.6, P(470, -230, 150));
      L(0xffb878, 3.0, 2.4, P(395, -245, 110));   // 16/10 — lueur pâle devant la devanture   // 16/10 — lueur du bar adoucie
      L(0xffb070, 3, 3.0, P(-960, 0, 40));
      hv(P(0, 0, 653), 0.6, 0xfff2dc, 1.2);
      hv(P(0, -1160, 118), 0.9, 0xfff2dc, 0.7);
      hv(P(470, -210, 220), 0.9, 0xffb048, 0);    // couronne du bar
      return bar;
    },
    barShot: { t: [500, -215, 100], p: [247, -325, 140] }, barAt: [500, -220, 160], barMax: 6,   // 16/10 — caméra collée au noyau, façade vue à 45° par la droite
    dockShot: { t: [1060, 110, -130], p: [1440, 480, 100] }, dockMax: 9,
    tankerAt: { pos: [1050, 110, -40], rotZ: 0, scale: 2.5 },   // agrandi : à l'échelle, un tanker se perdrait contre 2,4 km de station
    // 16/10 — éclairage obscur : station dans la pénombre, éclairée de loin et pâlement ; lumières sans éblouir
    night: { light: 0.085, glow: 0.6, tex: 1.3, halo: 0.45, bloom: [0.5, 0.45, 0.85], albedo: 0.12, hull: 0.14, env: 0.03, envScene: 0.06, exposure: 0.9, hideCoreAtBar: true },
    // 16/10 — la nuit : ce sont les feux qui éclairent, comme des lanternes sur le pont d'un bateau pirate (positions posées sur les ponts, repère Blender)
    lamps: { url: 'assets/3d/sb_dc02_lamps.json?v=20261016-2130', light: [0xffb060, 9.0, 4.4], lift: 45, lightsMax: 12, lightsLite: 5, under: [[560, 0, -110], [-280, 485, -110], [-280, -485, -110], [0, 0, -260]], post: 7, lantern: 1.7 },
    // 16/10 — brume épaisse par endroits : bancs de brouillard posés dans la station (entre anneau, bras et noyau)
    mist: { n: 60, nLite: 26, r: [2.5, 11.0], y: [-3.0, 4.5], size: [4.5, 7.0], op: [0.6, 0.35], col: [0x26101a, 0x1e0c1c, 0x2c1220, 0x180c16] },
  },
  // Sanctuaire du Linceul des Cendres : bastion impérial sur astéroïde, dans un nuage bleuté (le Linceul)
  sanctuary: {
    S: 0.005, near: 0.03, half: [15.5, 17.0], minFit: 16, bg: 0x02050a, haze: 0x0c1d30, fog: [12, 32],
    sun: [-0.50, 0.58, -0.64], core: [-0.50, 0.30, -0.81],
    GLOSS: {
      M_SC_IVORY: [0.86, 0.0], M_SC_PANEL: [0.84, 0.05], M_SC_STONE: [0.86, 0.10], M_SC_GUNMETAL: [0.74, 0.30], M_SC_DARK: [0.84, 0.15],
      M_SC_BRONZE: [0.62, 0.45], M_SC_RED: [0.84, 0.0], M_SC_SIGIL: [0.80, 0.0], M_SC_ROCK: [0.95, 0.0], M_SC_ROCK2: [0.95, 0.0], M_SC_GLASS: [0.30, 0.1],
    },
    GLOW: { M_SC_WIN_AMBER: 3.4, M_SC_WIN_WARM: 2.8, M_SC_WIN_WHITE: 2.0, M_SC_LIGHT_RED: 4.0, M_SC_HANGAR: 1.5, M_SC_ENGINE: 1.4, M_SC_BEACON: 8.0 },
    GLOW_COLOR: {
      M_SC_WIN_AMBER: 0xff8a2c, M_SC_WIN_WARM: 0xffb468, M_SC_WIN_WHITE: 0xd8e4ff, M_SC_LIGHT_RED: 0xff1a10,
      M_SC_HANGAR: 0xffa860, M_SC_ENGINE: 0x8ab8ff, M_SC_BEACON: 0xfff2dc,
    },
    LOOK: {   // cellules plus grandes : bastion de 5 km, plaques de blindage de 10 à 20 m
      M_SC_IVORY:    { cell: [12.0, 7.0], seam: .22, depth: .12, tint: .08, rough: .10, grime: .46, wear: .25 },
      M_SC_PANEL:    { cell: [10.0, 6.0], seam: .22, depth: .20, tint: .10, rough: .12, grime: .42, wear: .30 },
      M_SC_STONE:    { cell: [14.0, 8.0], seam: .24, depth: .22, tint: .12, rough: .14, grime: .40, wear: .30 },
      M_SC_GUNMETAL: { cell: [8.0, 5.0], seam: .18, depth: .40, tint: .08, rough: .14, grime: .24, wear: .45 },
      M_SC_DARK:     { cell: [16.0, 9.0], seam: .24, depth: .14, tint: .14, rough: .18, grime: .18, wear: .25 },
      M_SC_BRONZE:   { cell: [6.0, 4.0], seam: .12, depth: .10, tint: .10, rough: .10, grime: .30, wear: .50 },
      M_SC_RED:      { cell: [12.0, 8.0], seam: .10, depth: .06, tint: .06, rough: .10, grime: .34, wear: .20 },
      M_SC_ROCK:     { cell: [60.0, 40.0], seam: .0, depth: .0, tint: .22, rough: .05, grime: .30, wear: .55 },
      M_SC_ROCK2:    { cell: [60.0, 40.0], seam: .0, depth: .0, tint: .22, rough: .05, grime: .30, wear: .55 },
    },
    glass: [.02, .03, .045], rockLift: null, nav: (n) => n === 'M_SC_LIGHT_RED', beacon: 'M_SC_BEACON', navPulse: [1.6, 3.2, 1.4],
    cloud: { dust: [0x04080e, 0x060b12, 0x0a1018], gas: [0x143252, 0x1b3f62, 0x22344e, 0x2a4a6a], glow: [0x6ab0ff, 0x8cc8ff, 0x9aa6ff],
             nearSize: [12, 16], farSize: [38, 44], nearR: [19, 20], farR: [50, 45], nearY: [-12, 14], farY: [-30, 40], w: 0.010 },
    sky: { a: '.06, .18, .42', b: '.10, .30, .48', c: '.20, .22, .40', base: '.004, .008, .016', fil: '.55, .80, 1.0', glow: '.40, .62, 1.0' },
    sunStops: [
      [42,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(240,246,255,1)'], [.5, 'rgba(200,220,255,.6)'], [1, 'rgba(160,190,255,0)']], .95, 1],
      [300, [[0, 'rgba(220,232,255,.85)'], [.12, 'rgba(150,185,255,.40)'], [.4, 'rgba(60,110,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(170,200,255,.26)'], [.3, 'rgba(50,100,180,.08)'], [1, 'rgba(20,40,80,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xe4ecff, 2.9, 40, 18, 90], fill: [0x3f7fd0, 1.6], rim: [0x8c9cff, 0.85], hemi: [0x1c3050, 0x081626],
    // extrémités des bras d'amarrage et bouches des baies
    tips: [[-300, 2700, 600], [-1230, 2380, -500], [650, 2320, 640], [1000, 2300, 600], [-2470, 840, 1000], [-2650, 450, -280],
      [-2750, -820, -1240], [-2650, -1120, -1360], [2950, 800, 780], [2900, -1380, -1180], [2650, 500, -150], [-500, -2480, -1480],
      [300, 2450, -480], [-750, -2630, 560], [40, -2630, 560], [-1720, -2280, 520], [1300, -2130, 520]].map(t => t.concat([0])),
    lane: { n: 70, nLite: 32, out: [12, 20], spread: 4, lift: [4, 2], size: [0.12, 0.35] },
    orbit: { n: 26, nLite: 14, r: [17, 6], y: 9, size: [0.10, 0.22] },
    target: [-0.4, 1.6, 0], minDist: 2.2,
    lights: (L, hv, P) => {
      L(0xff9a50, 3, 3.0, P(-750, -2700, 560));
      L(0xff9a50, 3, 3.0, P(40, -2700, 560));
      L(0xffa040, 4, 3.5, P(-920, -1500, -300));
      const hall = L(0xffb070, 3, 3.0, P(-200, 2100, -300));
      hv(P(-250, 1150, 2404), 0.7, 0xff6a50, 1.1);       // feu de la tour de commandement
      return hall;
    },
    // « la halle » : la façade nord aux bannières, la halle vitrée où descendent les équipages
    barShot: { t: [-200, 2100, 300], p: [-1700, 4700, -500] }, barAt: [-200, 2100, 300], barMax: 18,
    // « le dock » : devant les baies sud illuminées, ton tanker en attente d'amarrage
    dockShot: { t: [40, -2950, 420], p: [1100, -3750, 950] }, dockMax: 14,
    tankerAt: { pos: [40, -3100, 560], rotZ: 0, scale: 6 },
    // 16/10 — la nuit bleutée : roches sombres, plus d'éclairage général, des nappes de lumière froide rasante qui révèlent murs et structures
    night: { light: 0.06, glow: 0.35, tex: 1, halo: 0.3, bloom: [0.4, 0.4, 0.88], hull: 0.3, rock: 0.45, env: 0.03, envScene: 0.05, exposure: 0.9 },
    lamps: { url: 'assets/3d/sb_sc01_lights.json?v=20261016-2345', light: [0xa8ccff, 30.0, 8.0], lift: 0, lightsMax: 16, lightsLite: 6 },
  },
  // 16/10 — Station O'Neill « Série Noire » (Confédération impériale) : le lieu caché du secteur N ; très sombre et furtive,
  // nuit quasi noire, poussière froide gris-violet, étoile blanche en contre-jour derrière la poupe ; elle se lit par ses arêtes et ses feux rouges
  noire: {
    S: 0.005, near: 0.03, half: [10.5, 12.5], minFit: 16, bg: 0x010103, haze: 0x06070b, fog: [8, 30],
    sun: [0.55, 0.50, -0.67], core: [0.50, 0.35, -0.79], camDir: [-0.66, -0.30, 0.69], introDir: [-0.30, -0.80, 0.52],
    GLOSS: { M_ON_HULL: [0.70, 0.35], M_ON_PANEL: [0.68, 0.30], M_ON_PLATE: [0.60, 0.45], M_ON_STEEL: [0.50, 0.60], M_ON_BLACK: [0.82, 0.20], M_ON_GUNMETAL: [0.60, 0.55], M_ON_GLASS: [0.30, 0.10] },
    GLOW: { M_ON_RED: 4.5, M_ON_RED_DIM: 2.0, M_ON_WHITE: 2.2, M_ON_REACTOR: 6.0 },
    GLOW_COLOR: { M_ON_RED: 0xff2010, M_ON_RED_DIM: 0xff3a18, M_ON_WHITE: 0xcfe0ff, M_ON_REACTOR: 0xff2a12 },
    LOOK: {
      M_ON_HULL:     { cell: [12.0, 7.0], seam: .18, depth: .20, tint: .10, rough: .10, grime: .16, wear: .30 },
      M_ON_PANEL:    { cell: [10.0, 6.0], seam: .18, depth: .22, tint: .10, rough: .12, grime: .16, wear: .35 },
      M_ON_PLATE:    { cell: [8.0, 5.0], seam: .16, depth: .20, tint: .08, rough: .10, grime: .14, wear: .40 },
      M_ON_STEEL:    { cell: [6.0, 4.0], seam: .12, depth: .10, tint: .06, rough: .08, grime: .12, wear: .50 },
      M_ON_GUNMETAL: { cell: [8.0, 5.0], seam: .16, depth: .35, tint: .08, rough: .12, grime: .14, wear: .45 },
      M_ON_BLACK:    { cell: [16.0, 9.0], seam: .20, depth: .14, tint: .14, rough: .14, grime: .10, wear: .20 },
    },
    glass: [.01, .015, .02], rockLift: null, nav: (n) => n === 'M_ON_RED', beacon: 'M_ON_REACTOR', navPulse: [1.2, 3.4, 1.8],
    cloud: { dust: [0x020203, 0x030305, 0x040408], gas: [0x121119, 0x16141e, 0x10141a, 0x1a1620], glow: [0x48465a, 0x5a6074, 0x5e4c58],
             nearSize: [12, 16], farSize: [38, 44], nearR: [19, 20], farR: [50, 45], nearY: [-12, 14], farY: [-30, 40], w: 0.010 },
    sky: { a: '.07, .065, .10', b: '.055, .07, .10', c: '.11, .07, .10', base: '.002, .002, .004', fil: '.40, .42, .52', glow: '.36, .38, .46' },
    sunStops: [
      [28,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(240,244,255,1)'], [.5, 'rgba(200,210,240,.6)'], [1, 'rgba(160,170,220,0)']], .95, 1],
      [300, [[0, 'rgba(220,232,255,.85)'], [.12, 'rgba(150,185,255,.40)'], [.4, 'rgba(60,110,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(170,175,210,.14)'], [.3, 'rgba(60,60,90,.05)'], [1, 'rgba(20,20,40,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xdfe6ff, 3.2, 40, 17, 90], fill: [0x7f8aa8, 0.55], rim: [0x6870a0, 0.6], hemi: [0x161a26, 0x050508],
    tips: [[-1845, 690, 0], [-1845, -690, 0], [1343, 690, 0], [1343, -690, 0], [-985, 560, 0], [-985, -560, 0], [-985, 0, 560],
      [-985, 0, -560], [630, 560, 0], [630, -560, 0], [630, 0, 560], [630, 0, -560], [-3113, 0, 0]].map(t => t.concat([1])),
    lane: { n: 34, nLite: 16, out: [12, 20], spread: 4, lift: [4, 2], size: [0.12, 0.35] },
    orbit: { n: 14, nLite: 8, r: [5.2, 3.5], y: 9, size: [0.10, 0.22] },
    target: [-1.4, 0.3, 0], minDist: 2.2,
    lights: (L, hv, P) => {
      L(0xff2a14, 5, 4.0, P(2400, 0, 0));
      for (const [y, z] of [[88, 0], [-88, 0], [0, 88], [0, -88]]) hv(P(2305, y, z), 0.45, 0xff3018, 0);
      hv(P(-3100, 0, 0), 0.35, 0xff2010, 1.3);
      return L(0xc8d2ff, 3, 3.0, P(1343, -640, 160));   // pont d'observation de l'anneau arrière
    },
    // « le pont » : l'anneau d'habitat arrière, ses modules et son port d'amarrage
    barShot: { t: [1343, -560, 60], p: [2350, -1650, 420] }, barAt: [1343, -560, 60], barMax: 16,
    // « le dock » : un bras d'amarrage du cylindre, ton tanker à quai
    dockShot: { t: [630, -620, 0], p: [1350, -1500, 380] }, dockMax: 14,
    tankerAt: { pos: [630, -760, 0], rotZ: 90, scale: 5 },
    night: { light: 0.08, glow: 0.4, tex: 1, halo: 0.35, bloom: [0.4, 0.4, 0.88], hull: 0.35, env: 0.03, envScene: 0.05, exposure: 0.9 },
    lamps: { url: 'assets/3d/sb_on01_lights.json?v=20261017-0000', light: [0xc4ccf4, 26.0, 7.0], lift: 0, lightsMax: 14, lightsLite: 6 },
  },
  // 19/10 — le Refuge de Brest (planche « MAMMOTH — Orbital Station ») : un mammouth d'ivoire de 3 km dans un champ de glace,
  // vitrine validée par Adrien (« hyper cool ») ; ivoire mat assombri (vieil os), soleil froid derrière la bête, nappes de lumière chaude rasante
  refuge: {
    S: 0.005, near: 0.03, half: [10.5, 10.0], minFit: 16, bg: 0x020408, haze: 0x1c2e40, fog: [6, 26],
    sun: [-0.45, 0.62, -0.64], core: [-0.40, 0.45, -0.80], camDir: [0.42, -0.24, 0.88], introDir: [0.95, -0.62, 0.10],
    GLOSS: {
      M_ER_IVORY: [0.86, 0.0], M_ER_IVORY2: [0.88, 0.0], M_ER_BONE: [0.84, 0.0], M_ER_STEEL: [0.62, 0.45], M_ER_GUNMETAL: [0.62, 0.55],
      M_ER_DARK: [0.85, 0.15], M_ER_BRONZE: [0.55, 0.6], M_ER_MESH: [0.40, 0.35],
    },
    GLOW: { M_ER_EYE: 2.6, M_ER_AMBER: 1.8, M_ER_WIN: 1.6, M_ER_BEACON: 3.0 },
    GLOW_COLOR: { M_ER_EYE: 0xff8a24, M_ER_AMBER: 0xff9a3a, M_ER_WIN: 0xffa850, M_ER_BEACON: 0xffe0b0 },
    LOOK: {
      M_ER_IVORY:    { cell: [10.0, 6.0], seam: .20, depth: .14, tint: .10, rough: .10, grime: .40, wear: .30 },
      M_ER_IVORY2:   { cell: [10.0, 6.0], seam: .20, depth: .16, tint: .12, rough: .12, grime: .44, wear: .30 },
      M_ER_BONE:     { cell: [8.0, 5.0], seam: .18, depth: .12, tint: .10, rough: .10, grime: .36, wear: .35 },
      M_ER_STEEL:    { cell: [6.0, 4.0], seam: .14, depth: .12, tint: .08, rough: .10, grime: .26, wear: .45 },
      M_ER_GUNMETAL: { cell: [8.0, 5.0], seam: .16, depth: .35, tint: .08, rough: .12, grime: .22, wear: .45 },
      M_ER_DARK:     { cell: [16.0, 9.0], seam: .20, depth: .14, tint: .14, rough: .14, grime: .14, wear: .20 },
    },
    // ivoire assombri (vieil os, pas plastique) ; panneaux maillés des oreilles : bleu nuit, visibles des deux côtés
    fix: (mat) => {
      if (mat.userData.er) return; mat.userData.er = 1;
      if (/^M_ER_(IVORY2?|BONE)$/.test(mat.name)) mat.color.multiplyScalar(0.62);
      if (mat.name === 'M_ER_MESH') { mat.side = 2; mat.envMapIntensity = 0.7; mat.color.setRGB(.035, .07, .12); }
    },
    glass: [.02, .03, .045], rockLift: null, nav: (n) => n === 'M_ER_BEACON', beacon: '', navPulse: [1.5, 2.5, 1.1],
    breathe: { M_ER_EYE: [2.3, 0.5, 0.55] },   // les yeux respirent lentement
    cloud: { dust: [0x070c12, 0x0a1219, 0x0c141c], gas: [0x2a3e52, 0x34495e, 0x24384a, 0x3e5468], glow: [0x8fb4d4, 0xb4d2ea, 0xa0bcd6],
             nearSize: [12, 16], farSize: [38, 44], nearR: [19, 20], farR: [50, 45], nearY: [-12, 14], farY: [-30, 40], w: 0.010 },
    sky: { a: '.16, .24, .34', b: '.22, .32, .42', c: '.30, .36, .44', base: '.008, .014, .022', fil: '.66, .80, .96', glow: '.62, .74, .88' },
    sunStops: [
      [34,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(236,244,255,1)'], [.5, 'rgba(190,215,240,.6)'], [1, 'rgba(150,185,220,0)']], .9, 1],
      [300, [[0, 'rgba(220,232,255,.85)'], [.12, 'rgba(150,185,255,.40)'], [.4, 'rgba(60,110,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(180,210,235,.24)'], [.3, 'rgba(80,120,160,.08)'], [1, 'rgba(30,50,80,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xdce8f5, 2.3, 40, 17, 90], fill: [0x8fb0cc, 0.45], rim: [0xa8c4e0, 0.5], hemi: [0x22344a, 0x0a1018],
    // baies d'amarrage : module de trompe, flancs, ville suspendue, façade arrière
    tips: [[0, -1200, -1545], [-560, -905, -1545], [560, -905, -1545], [0, 1300, -200], [-300, 650, -1000], [300, 650, -1000],
      [-900, 300, -600], [900, 300, -600], [0, 1250, 400]].map(t => t.concat([0])),
    lane: { n: 64, nLite: 28, out: [10, 18], spread: 3.5, lift: [3, 2], size: [0.14, 0.34] },
    orbit: { n: 22, nLite: 10, r: [12, 6], y: 8, size: [0.10, 0.22] },
    target: [0, -1.0, -0.4], minDist: 2.2,
    lights: (L, hv, P) => {   // nappes de lumière chaude rasante : elles révèlent la structure sans éblouir
      L(0xff9a40, 2.4, 3.2, P(380, -900, 60));      // les yeux éclairent le front et la trompe
      L(0xff9a40, 2.4, 3.2, P(-380, -900, 60));
      L(0xffa850, 1.1, 3.0, P(0, -1350, -1500));    // baie du module de trompe
      L(0xffa850, 1.6, 3.4, P(0, 1500, 200));       // façade arrière
      L(0xff9a40, 1.4, 2.6, P(1000, -1100, -650));  // flasques des défenses
      L(0xff9a40, 1.4, 2.6, P(-1000, -1100, -650));
      hv(P(380, -560, 110), 0.55, 0xff9030, 0.35);
      hv(P(-380, -560, 110), 0.55, 0xff9030, 0.35);
      return L(0xffa850, 1.8, 3.4, P(0, 650, -1150));   // la ville suspendue sous le ventre
    },
    // « la ville suspendue » : sous le ventre de la bête, les modules et les stalactites habitées
    barShot: { t: [0, 650, -1150], p: [1150, -250, -1900] }, barAt: [0, 650, -1150], barMax: 14,
    // « le dock » : la baie du module de trompe, ton tanker à quai sous la trompe
    dockShot: { t: [0, -1380, -1540], p: [1250, -2350, -1150] }, dockMax: 12,
    tankerAt: { pos: [0, -1470, -1560], rotZ: 90, scale: 8 },
    // champ glaciaire : éclats de glace qui dérivent, quelques gros blocs au loin pour l'échelle
    ice: { n: 520, nLite: 200, big: 36, color: 0x9fb8cc, emissive: 0x1a2a38 },
    // sans l'occlusion ambiante de la vitrine (trop lourde sur mobile) : un peu moins de lumière d'ambiance pour garder l'ivoire sombre
    night: { light: 0.85, hull: 0.78, envScene: 0.55 },
  },
  // 22/10 — veyra (station lointaine, vitrine validée par Adrien)
  // 22/10 — L'Œil de Veyra (ex « Station Oculaire », planche « OCULAR STATION ») : sphère de céramique marbrée de 600 m,
  // veines d'or, iris de métal bleu-vert ; le bar et les quais vivent derrière la pupille. Vitrine validée par Adrien :
  // nuit bleu nuit et sarcelle, poches dorées, étoile pâle derrière la sphère, champ de débris sombres.
  veyra: {
    S: 1 / 60, near: 0.03, half: [7.0, 8.0], minFit: 10, bg: 0x03070c, haze: 0x101c2c, fog: [4.5, 22],
    sun: [-0.55, 0.58, -0.60], core: [-0.45, 0.40, -0.80], camDir: [0.42, 0.20, 0.88], introDir: [0.95, 0.55, -0.20],
    // céramique marbrée satinée, laiton poli, métaux sombres brillants (rugosité, métal)
    GLOSS: {
      M_OC_IVORY: [0.36, 0.0], M_OC_IVORY2: [0.40, 0.0], M_OC_BRASS: [0.26, 0.92], M_OC_GUNMETAL: [0.30, 0.85], M_OC_DARK: [0.36, 0.55],
      M_OC_STEEL: [0.30, 0.85], M_OC_INNER: [0.6, 0.3], M_OC_FLOOR: [0.45, 0.3], M_OC_WOOD: [0.42, 0.0], M_OC_VEIN2: [0.5, 0.2],
    },
    GLOW: { M_OC_VEIN: 1.25, M_OC_WIN: 1.7, M_OC_WARM: 1.15, M_OC_BEACON: 3.0, M_OC_NAV_R: 2.5, M_OC_NAV_G: 2.5 },
    GLOW_COLOR: { M_OC_VEIN: 0xffa040, M_OC_WIN: 0xffb466, M_OC_WARM: 0xffc488, M_OC_BEACON: 0xfff0e0, M_OC_NAV_R: 0xff2010, M_OC_NAV_G: 0x30ff60 },
    LOOK: {   // céramique : grands panneaux, patine, coulures ; métaux usés
      M_OC_IVORY:    { cell: [14.0, 9.0], seam: .14, depth: .08, tint: .07, rough: .10, grime: .42, wear: .25 },
      M_OC_IVORY2:   { cell: [14.0, 9.0], seam: .14, depth: .08, tint: .08, rough: .10, grime: .48, wear: .25 },
      M_OC_GUNMETAL: { cell: [6.0, 4.0], seam: .14, depth: .30, tint: .08, rough: .12, grime: .25, wear: .40 },
      M_OC_DARK:     { cell: [8.0, 5.0], seam: .16, depth: .14, tint: .12, rough: .14, grime: .18, wear: .25 },
      M_OC_BRASS:    { cell: [5.0, 4.0], seam: .10, depth: .08, tint: .08, rough: .10, grime: .32, wear: .55 },
    },
    // comme la vitrine : tout en double face (l'intérieur se voit par la pupille) ; iris de métal bleu-vert très brillant ; vitres fumées
    fix: (mat) => {
      if (mat.userData.vy) return; mat.userData.vy = 1;
      mat.side = 2;
      const IRIS = { M_OC_IRIS: [0x0b3d4c, 0x000000, 0.0], M_OC_IRIS3: [0x16697a, 0x000000, 0.0], M_OC_IRIS2: [0x4c6436, 0x7a9440, 0.10] }[mat.name];
      if (IRIS) { mat.color.set(IRIS[0]); mat.emissive.set(IRIS[1]); mat.emissiveIntensity = IRIS[2]; mat.roughness = 0.14; mat.metalness = 0.75; }
      // sans l'occlusion ambiante de la vitrine (trop lourde sur mobile), l'intérieur s'éclaircissait : sols et parois intérieures assombris
      if (mat.name === 'M_OC_FLOOR') { mat.color.multiplyScalar(0.08); mat.roughness = 0.7; mat.metalness = 0.1; }
      if (mat.name === 'M_OC_INNER') mat.color.multiplyScalar(0.4);
      if (mat.name === 'M_OC_WOOD') mat.color.multiplyScalar(0.75);
      if (mat.name === 'M_OC_GLASS') { mat.transparent = true; mat.opacity = 0.35; mat.roughness = 0.05; mat.depthWrite = false; mat.color.set(0x2a3448); }
    },
    glass: [.16, .2, .28], rockLift: null, nav: (n) => n.startsWith('M_OC_NAV') || n === 'M_OC_BEACON', beacon: '', navPulse: [1.2, 2.5, 1.1],
    breathe: { M_OC_VEIN: [1.15, 0.25, 0.5] },   // les veines d'or respirent lentement
    cloud: { dust: [0x05080d, 0x070b12, 0x0a0e16], gas: [0x1c3448, 0x24405a, 0x1a2c40, 0x2e2c26], glow: [0x6cc4d8, 0xffc070, 0x8fd0e0],
             nearSize: [9, 12], farSize: [30, 36], nearR: [14, 16], farR: [40, 40], nearY: [-8, 12], farY: [-24, 34], w: 0.010 },
    sky: { a: '.08, .20, .30', b: '.10, .30, .34', c: '.30, .22, .11', base: '.010, .008, .020', fil: '.49, .73, .81', glow: '1.25, 1.0, .69' },
    sunStops: [
      [34,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(236,244,255,1)'], [.5, 'rgba(190,215,240,.6)'], [1, 'rgba(150,185,220,0)']], .9, 1],
      [300, [[0, 'rgba(220,232,255,.85)'], [.12, 'rgba(150,185,255,.40)'], [.4, 'rgba(60,110,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(180,210,235,.24)'], [.3, 'rgba(80,120,160,.08)'], [1, 'rgba(30,50,80,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xfff0dc, 2.6, 40, 7, 90], fill: [0x6c9cc8, 0.55], rim: [0xb8d8ff, 0.3], hemi: [0x22344a, 0x0e0a08],
    // bras d'amarrage (X ±360), mâts (Z ±410), la pupille (trois fois : c'est la grande porte), le moyeu arrière
    tips: [[360, 10, 0], [-360, 10, 0], [0, 10, 410], [0, 10, -410], [0, -300, 0], [0, -300, 0], [0, -300, 0], [0, 380, 0]].map(t => t.concat([0])),
    lane: { n: 36, nLite: 16, out: [12, 20], spread: 4, lift: [4, 2], size: [0.12, 0.35] },
    orbit: { n: 18, nLite: 8, r: [7.5, 4], y: 8, size: [0.10, 0.22] },
    target: [0, 0.1, 0], minDist: 6.4,
    lights: (L, hv, P) => {   // l'intérieur s'allume : bar, pont d'amarrage, hangar, cabines ; la lumière sort par la pupille
      const bar = L(0xffb066, 2.6, 5.0, P(0, -40, 160));
      L(0xffb066, 1.6, 5.0, P(0, -60, 60));
      L(0xff9a50, 1.4, 4.5, P(0, -40, -100));   // le fond (plus doux que la vitrine : sans occlusion, il blanchissait)
      L(0xffc080, 1.6, 3.5, P(0, 150, 0));
      L(0xffb066, 0.8, 2.4, P(0, -310, 40));     // halo chaud devant la pupille
      L(0xffa040, 0.8, 2.2, P(0, 330, 0));       // moyeu arrière
      hv(P(0, -285, 10), 2.2, 0xffb466, 0.25);
      return bar;
    },
    // « le bar » : l'intérieur chaud derrière l'iris, vu par la pupille
    barShot: { t: [0, -60, 40], p: [150, -680, 250] }, barAt: [0, -420, 140], barMax: 14,
    // « le dock » : le bras d'amarrage est (X +345), ton tanker à quai au bout du bras
    dockShot: { t: [380, 10, 0], p: [640, -330, 170] }, dockMax: 10,
    tankerAt: { pos: [428, 10, -20], rotZ: 90, scale: 4 },
    // champ de débris sombres qui dérivent (roche et ferraille, pas de glace ici)
    ice: { n: 420, nLite: 160, big: 36, color: 0x2e2a28, emissive: 0x000000 },
    night: { bloom: [0.6, 0.45, 1.0], envScene: 0.55 },
  },
  // 22/10 — lucioles (station lointaine, vitrine validée par Adrien)
  // 22/10 — Le Mont des Lucioles (ex « Montagne Fluorescente », planche « FLUORESCENT MOUNTAIN ») : rocher cristallin de 2 km,
  // lichen vert fluorescent, cristaux violets, cités en chapeaux de champignon, hangar creusé dans la roche, neuf quais.
  // Vitrine validée par Adrien : nébuleuse violette et vert d'eau, étoile pâle derrière le pic, éclats de cristal qui dérivent.
  // Repère Blender (m) sans recentrage : la montagne monte de Z 0 à 1 815 m, la cible est remontée d'autant (Y scène 4,5).
  lucioles: {
    S: 0.005, near: 0.03, half: [6.6, 6.2], minFit: 10, bg: 0x05040a, haze: 0x1d1430, fog: [4.5, 22],
    sun: [-0.55, 0.58, -0.60], core: [-0.45, 0.40, -0.80], camDir: [0.48, 0.22, 0.85], introDir: [0.95, 0.55, -0.20],
    // roche mate, ponts et laiton métalliques satinés (rugosité, métal)
    GLOSS: {
      M_FM_ROCK: [0.82, 0.0], M_FM_ROCK2: [0.70, 0.05], M_FM_DECK: [0.42, 0.6], M_FM_DECK2: [0.38, 0.65], M_FM_BRASS: [0.30, 0.9],
      M_FM_DARK: [0.6, 0.4], M_FM_RIM: [0.22, 0.15],
    },
    // fluorescence vive mais contenue (le bloom démarre à 1)
    GLOW: { M_FM_GLOW: 0.62, M_FM_GILL: 0.6, M_FM_GILL2: 0.45, M_FM_WIN: 1.6, M_FM_HANGAR: 1.25, M_FM_BEACON: 3.0, M_FM_NAV_R: 2.5, M_FM_NAV_G: 2.5 },
    GLOW_COLOR: { M_FM_GLOW: 0x5dff4a, M_FM_GILL: 0x6dff5a, M_FM_GILL2: 0x8a3cff, M_FM_WIN: 0xffb060, M_FM_HANGAR: 0xffd29a,
      M_FM_BEACON: 0xfff0e0, M_FM_NAV_R: 0xff2010, M_FM_NAV_G: 0x30ff60 },
    LOOK: {   // ponts métalliques à joints, patine ; laiton usé
      M_FM_DECK:  { cell: [9.0, 6.0], seam: .18, depth: .20, tint: .10, rough: .12, grime: .30, wear: .35 },
      M_FM_DECK2: { cell: [7.0, 5.0], seam: .16, depth: .18, tint: .08, rough: .10, grime: .28, wear: .40 },
      M_FM_BRASS: { cell: [6.0, 4.0], seam: .12, depth: .10, tint: .08, rough: .10, grime: .30, wear: .50 },
    },
    // comme la vitrine : double face ; cristaux brillants à lueur intérieure violette ; roche un peu assombrie ; vitres fumées
    fix: (mat) => {
      if (mat.userData.ml) return; mat.userData.ml = 1;
      mat.side = 2;
      if (mat.name === 'M_FM_ROCK') mat.color.multiplyScalar(0.9);
      const CR = { M_FM_CRYSTAL: [0x5a1fd8, 0x6a22f0, 0.38], M_FM_CRYSTAL2: [0x8a5cf0, 0x8a48ff, 0.6], M_FM_RIM: [0x7a48c8, 0x6a28e0, 0.35] }[mat.name];
      if (CR) { mat.color.set(CR[0]).multiplyScalar(0.75); mat.emissive.set(CR[1]); mat.emissiveIntensity = CR[2]; mat.roughness = mat.name === 'M_FM_RIM' ? 0.25 : 0.12; mat.metalness = 0.1; }
      if (mat.name === 'M_FM_GLASS') { mat.transparent = true; mat.opacity = 0.55; mat.roughness = 0.05; mat.depthWrite = false; mat.color.set(0x2a3448); }
    },
    glass: [.16, .2, .28], rockLift: null, nav: (n) => n.startsWith('M_FM_NAV') || n === 'M_FM_BEACON', beacon: '', navPulse: [1.2, 2.5, 1.1],
    breathe: { M_FM_GLOW: [0.6, 0.14, 0.55] },   // le lichen respire lentement
    cloud: { dust: [0x08060f, 0x0b0814, 0x0d0a18], gas: [0x3a2458, 0x2c1c4a, 0x1f3a3a, 0x452a66], glow: [0x9a6cff, 0x7cff8a, 0xb48cff],
             nearSize: [9, 12], farSize: [30, 36], nearR: [14, 16], farR: [40, 40], nearY: [-3.6, 12], farY: [-19.6, 34], w: 0.010 },
    sky: { a: '.24, .12, .40', b: '.10, .30, .24', c: '.36, .20, .52', base: '.010, .008, .020', fil: '.45, .81, .49', glow: '.88, .75, 1.19' },
    sunStops: [
      [34,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(236,244,255,1)'], [.5, 'rgba(190,215,240,.6)'], [1, 'rgba(150,185,220,0)']], .9, 1],
      [300, [[0, 'rgba(220,232,255,.85)'], [.12, 'rgba(150,185,255,.40)'], [.4, 'rgba(60,110,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(180,210,235,.24)'], [.3, 'rgba(80,120,160,.08)'], [1, 'rgba(30,50,80,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xf0e8ff, 2.4, 40, 10, 90], fill: [0x9a7cd8, 0.55], rim: [0xb8c4ff, 0.3], hemi: [0x2c2248, 0x0a1210],
    // les neuf quais (ouest, est, sud, nord) et la bouche du hangar (deux fois : c'est la grande porte)
    tips: [[-1020, 470, 700], [-1070, 170, 560], [-1020, -130, 640], [1020, 440, 660], [1020, 90, 520], [1020, -150, 600],
      [-290, -930, 640], [-250, 910, 800], [100, 900, 520], [-205, -650, 760], [-205, -650, 700]].map(t => t.concat([0])),
    lane: { n: 36, nLite: 16, out: [12, 20], spread: 4, lift: [4, 2], size: [0.12, 0.35] },
    orbit: { n: 18, nLite: 8, r: [7, 4], y: 7, size: [0.10, 0.22] },
    target: [0, 4.5, 0], minDist: 2.2,
    lights: (L, hv, P) => {
      L(0xffc080, 2.6, 3.4, P(-205, -700, 760));       // bouche du hangar
      L(0xffb070, 1.4, 2.2, P(680, -420, 630));        // alcôve droite
      for (const [x, y, z] of [[-620, 70, 1000], [-320, -310, 880], [100, -560, 900], [700, 40, 800], [350, 540, 1180], [90, 640, 930], [420, -480, 1020], [-440, 480, 980]])
        L(0x6dff5a, 0.35, 1.6, P(x, y, z));             // lueur verte sous les chapeaux (un peu moins que la vitrine : sans occlusion, le vert débordait)
      L(0x8a3cff, 1.6, 4.0, P(80, -60, 150));          // cristaux du dessous
      L(0x8a3cff, 1.2, 3.0, P(40, 30, 1600));          // couronne du pic
      hv(P(-205, -640, 760), 1.4, 0xffb060, 0);
      hv(P(80, -40, 40), 1.8, 0x9b55ff, 0.4);
      return null;   // pas de lueur à baisser de près : le hangar garde sa chaleur
    },
    // « le hangar » : la bouche creusée dans la roche (X −560..+150, Z 640–880), ses lueurs chaudes
    barShot: { t: [-205, -480, 740], p: [100, -1750, 950] }, barAt: [-205, -600, 760], barMax: 10,
    // « le dock » : le quai est du milieu (pont à Z 520, feux verts au bout, X 1 050), ton tanker amarré en bout de quai
    dockShot: { t: [1000, 100, 540], p: [1500, -450, 800] }, dockMax: 9,
    tankerAt: { pos: [1135, 100, 490], rotZ: 90, scale: 6 },
    // éclats de cristal violet qui dérivent autour du rocher
    ice: { n: 420, nLite: 160, big: 36, color: 0x7048c8, emissive: 0x3a1488 },
    night: { bloom: [0.6, 0.45, 1.0], envScene: 0.5 },
  },
  // 22/10 — ivoire (station lointaine, vitrine validée par Adrien)
  // 22/10 — La Grille d'Ivoire (ex « Le Réseau Cristallin », planche « CRYSTAL LATTICE ») : treillis cubique de 1,25 km,
  // 13 sphères d'ivoire habitées, chrome poli et or ; un cœur (sphère r 270) au portail bleu derrière l'anneau-porte avant.
  // Vitrine validée par Adrien : joaillerie spatiale dans une nébuleuse bleu nuit voilée d'or, étoile blanc-or haut derrière.
  // Portée sans GTAO ni MeshPhysical (mobile) : chrome / or / verre réglés dans fix, salles dorées derrière les verrières (shader),
  // reflets du chrome sur un petit studio de joaillier (nébuleuse + 4 panneaux) cuit une fois en PMREM.
  ivoire: {
    S: 0.004, near: 0.03, half: [5.0, 5.4], minFit: 7, bg: 0x03070c, haze: 0x0a1430, fog: [4.5, 22],
    sun: [-0.62, 0.48, -0.62], core: [-0.45, 0.40, -0.80], camDir: [0.48, 0.26, 0.84], introDir: [0.95, 0.55, -0.20],
    GLOSS: { M_LT_IVORY: [0.34, 0.0], M_LT_IVORY2: [0.40, 0.0] },
    GLOW: { M_LT_GLOW: 1.2, M_LT_LAMP: 0.65, M_LT_BLUE: 2.4, M_LT_BEACON: 3.0 },
    GLOW_COLOR: { M_LT_GLOW: 0xffc26a, M_LT_LAMP: 0xdce8ff, M_LT_BLUE: 0x5aa0ff, M_LT_BEACON: 0xffffff },
    LOOK: {
      M_LT_IVORY:  { cell: [11.0, 7.0], seam: .14, depth: .08, tint: .07, rough: .10, grime: .30, wear: .25 },
      M_LT_IVORY2: { cell: [11.0, 7.0], seam: .14, depth: .08, tint: .08, rough: .10, grime: .36, wear: .25 },
    },
    // chrome, or, laque bleu nuit, verrières : les matières « physiques » de la vitrine, sur MeshStandard
    fix: (mat) => {
      if (mat.userData.gi) return; mat.userData.gi = 1;
      const PH = { M_LT_STEEL: [0xb8bcc6, 0.2, 1.0], M_LT_GOLD: [0xdaa54e, 0.2, 1.0], M_LT_DARK: [0x0b0e14, 0.28, 0.7], M_LT_GLASS: [0x0a1426, 0.06, 0.3] }[mat.name];
      if (!PH) return;
      mat.color.set(PH[0]); mat.roughness = PH[1]; mat.metalness = PH[2]; mat.side = 2;
      if (mat.name !== 'M_LT_GLASS') return;
      // verrières : on devine derrière le verre des étages éclairés, des cloisons et de rares fenêtres chaudes (parallaxe 25 m)
      mat.transparent = true; mat.opacity = 0.5; mat.depthWrite = false;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uRoomCol = { value: new window.SB3D.THREE.Color(0xffd49a) }; sh.uniforms.uRoomK = { value: 0.32 };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vWP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vOP; varying vec3 vWP; uniform vec3 uRoomCol; uniform float uRoomK;
          float rh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          vec3 roomAt(vec3 q){
            float fl = smoothstep(.90, .985, fract(q.y / 12.0));
            float wall = smoothstep(.95, 1.0, fract((q.x + q.z * .7) / 14.0));
            vec3 cell = floor(q / vec3(9.0, 12.0, 9.0));
            float win = step(.86, rh(cell)) * (1.0 - fl) * smoothstep(.2, .6, fract(q.y / 12.0));
            float blk = .35 + .65 * rh(floor(q / 60.0));
            return (uRoomCol * (.18 + fl * .9 + wall * .2) + vec3(1.0, .86, .66) * win * .7) * blk;
          }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { vec3 q = vOP + normalize(vWP - cameraPosition) * 25.0;
            float face = pow(abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
            totalEmissiveRadiance += roomAt(q) * uRoomK * face; }`);
      };
      mat.customProgramCacheKey = () => 'ivoire-room-' + mat.name;
    },
    glass: [.02, .03, .05], rockLift: null, nav: (n) => n === 'M_LT_BEACON', beacon: '', navPulse: [1.2, 2.5, 1.1],
    breathe: { M_LT_GLOW: [1.2, 0.12, 0.6], M_LT_LAMP: [0.65, 0.065, 0.6] },   // les feux respirent à peine
    cloud: { dust: [0x040814, 0x060a1a, 0x08101e], gas: [0x16285a, 0x1a3470, 0x22306a, 0x142450], glow: [0xffd08a, 0x9fc4ff, 0xffe2b0],
             nearSize: [9, 12], farSize: [30, 36], nearR: [14, 16], farR: [40, 40], nearY: [-8, 12], farY: [-24, 34], w: 0.010 },
    // nébuleuse bleu nuit -> bleu roi, voiles et filaments d'or pâle
    sky: { a: '.06, .12, .34', b: '.08, .20, .44', c: '.40, .30, .16', base: '.010, .008, .020', fil: '.94, .83, .62', glow: '1.27, 1.2, 1.5' },
    sunStops: [
      [34,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,246,228,1)'], [.5, 'rgba(255,220,170,.6)'], [1, 'rgba(240,190,130,0)']], .9, 1],
      [300, [[0, 'rgba(255,238,210,.85)'], [.12, 'rgba(255,200,140,.40)'], [.4, 'rgba(160,120,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(180,210,235,.24)'], [.3, 'rgba(80,120,160,.08)'], [1, 'rgba(30,50,80,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xfff1dc, 3.0, 40, 5.5, 90], fill: [0x6c8ad8, 0.75], rim: [0xb8ccff, 0.0], hemi: [0x24345a, 0x080a12],
    // quais : anneaux-portes avant / arrière (faces Y), sphères d'angle, sphères de face, pointes des mâts
    tips: [[0, -600, 0], [0, -600, 60], [0, 600, 0], [0, 600, -60], [612, -600, 600], [-612, -600, 600], [612, 600, -600], [-612, 600, -600],
      [612, -600, -600], [-612, 600, 600], [825, 0, 0], [-825, 0, 0], [625, -600, 1003], [-625, 600, 1003]].map(t => t.concat([0])),
    lane: { n: 40, nLite: 18, out: [12, 20], spread: 4, lift: [4, 2], size: [0.06, 0.18] },
    orbit: { n: 18, nLite: 8, r: [6.0, 4.0], y: 7, size: [0.06, 0.14] },
    target: [0, -0.5, 0], minDist: 3.2,
    lights: (L, hv, P) => {
      const gate = L(0x6aa8ff, 2.2, 2.2, P(0, -330, 0));   // portail du cœur : lueur bleue sur l'anneau-porte
      L(0xffc27a, 1.2, 1.6, P(0, -150, 0));
      L(0x6aa8ff, 1.0, 1.6, P(0, 330, 0));                  // l'anneau-porte arrière (le dock) n'est pas dans le noir
      hv(P(0, -275, 0), 1.6, 0x7ab4ff, 0.35);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) hv(P(sx * 625, sy * 600, sz * (sz > 0 ? 1018 : 1038)), 0.16, 0xffd9a0, 0.8 + Math.random());   // pointes d'antennes
      for (const sz of [-1, 1]) hv(P(0, 0, sz * 760), 0.2, 0xffe0b0, 1.1);
      // la vitrine éclaire aussi de face (appoint chaud) et par l'arrière (liseré froid) ; reflets du chrome : un studio de joaillier
      const station = gate.parent, scene = station.parent, T = window.SB3D.THREE;
      const dl = (c, i, x, y, z) => { const l = new T.DirectionalLight(c, i); l.position.set(x, y, z); scene.add(l); };
      dl(0xfff0e0, 0.55, 14, 6, 16); dl(0xb8ccff, 0.9, -12, 4, -10);
      const envScene = new T.Scene(); envScene.background = new T.Color(0x070b18);
      const sph = new T.Mesh(new T.SphereGeometry(100, 24, 12), new T.MeshBasicMaterial({ side: 1, vertexColors: true }));
      { const p = sph.geometry.attributes.position, col = [], c = new T.Color(); const core = new T.Vector3(-0.45, 0.40, -0.80).normalize(), v = new T.Vector3();
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const k = Math.max(0, v.dot(core));
          c.setRGB(.03 + .10 * k * k, .05 + .12 * k * k, .12 + .22 * k * k).lerp(new T.Color(.30, .24, .14), .4 * Math.pow(Math.max(0, -v.y), 2)); col.push(c.r, c.g, c.b); }
        sph.geometry.setAttribute('color', new T.Float32BufferAttribute(col, 3)); }
      envScene.add(sph);
      const box = (w, h, col, k, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: 2 })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
      box(60, 17, 0xfff4e0, 3.6, -47, 60, -33); box(17, 73, 0xa8c4ff, 3.5, 73, 7, 27); box(47, 13, 0x90b4ff, 2.6, 13, -60, 53); box(33, 33, 0xffffff, 2.2, -20, 20, 80);
      const ENV_K = { M_LT_STEEL: 0.95, M_LT_GOLD: 1.3, M_LT_DARK: 0.55, M_LT_GLASS: 1.6 };
      const once = new T.Mesh(new T.PlaneGeometry(0.001, 0.001), new T.MeshBasicMaterial({ visible: true, transparent: true, opacity: 0, depthWrite: false }));
      once.frustumCulled = false;
      once.onBeforeRender = (renderer) => {
        if (once.userData.done) return; once.userData.done = 1;
        setTimeout(() => {   // hors du rendu en cours : le PMREM ne se cuit qu'une fois
          const pm = new T.PMREMGenerator(renderer), old = scene.environment;
          const env = pm.fromScene(envScene, 0.02, 1, 400).texture; pm.dispose();
          scene.environment = env;   // l'ivoire en boit un peu (night.envScene) ; chrome, or, laque et verre ont leur propre dose (vitrine)
          station.traverse(o => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) if (ENV_K[m.name]) { m.envMap = env; m.envMapIntensity = ENV_K[m.name]; m.needsUpdate = true; } });
          envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          if (old) old.dispose();
        }, 0);
      };
      station.add(once);
      return gate;
    },
    // « le cœur » : à travers l'anneau-porte avant, la sphère centrale et son portail bleu
    barShot: { t: [0, -260, 0], p: [150, -1700, 130] }, barAt: [0, -330, 0], barMax: 8,
    // « le dock » : l'anneau-porte arrière, ton tanker engagé dans l'anneau
    dockShot: { t: [0, 660, 0], p: [520, 1900, 240] }, dockMax: 8,
    tankerAt: { pos: [0, 790, -40], rotZ: 0, scale: 7 },
    night: { bloom: [0.6, 0.45, 1.0], envScene: 0.8 },
  },
  // 22/10 — akhet (station lointaine, vitrine validée par Adrien)
  // 22/10 — Le Tombeau d'Akhet (ex « La Pyramide », planche « PYRAMID — Orbital Station ») : nécropole de basalte noir de 1,25 km,
  // veines d'or, coiffe et cristal au sommet, jupe d'anneaux lumineux sous la base, portail creux des gardiens à tête de chacal.
  // Vitrine validée par Adrien : « très intimidante » — contre-plongée, contre-jour d'une éclipse rouge-or derrière l'apex,
  // l'or qui respire (deux battements toutes les 4 s), faisceau d'énergie sous le cœur, débris de basalte.
  // Portée sans GTAO ni MeshPhysical (mobile) : obsidienne et or réglés dans fix ; disque noir, rais, faisceau et battement
  // posés depuis lights (objets ajoutés à la station, animés par onBeforeRender) ; reflets : petit studio cuit une fois en PMREM.
  akhet: {
    S: 0.005, near: 0.03, half: [5.7, 5.2], minFit: 7, bg: 0x050203, haze: 0x0d0607, fog: [4.5, 22],
    sun: [-0.36, 0.55, -0.76], core: [-0.36, 0.50, -0.78], camDir: [0.42, -0.36, 0.83], introDir: [0.10, -0.80, 0.60],
    GLOSS: { M_PY_STONE: [0.42, 0.10], M_PY_STONE2: [0.46, 0.10], M_PY_STONE3: [0.38, 0.12] },
    GLOW: { M_PY_GLOW: 2.0, M_PY_HALL: 1.5, M_PY_CRYSTAL: 2.6, M_PY_BEACON: 3.5 },
    GLOW_COLOR: { M_PY_GLOW: 0xffa646, M_PY_HALL: 0xffbb6a, M_PY_CRYSTAL: 0xffb45a, M_PY_BEACON: 0xfff0d6 },
    LOOK: {   // basalte : blocs en relief (géométrie) + patine, coulures, usure d'arête
      M_PY_STONE:  { cell: [9.0, 6.0], seam: .12, depth: .10, tint: .14, rough: .12, grime: .40, wear: .30 },
      M_PY_STONE2: { cell: [9.0, 6.0], seam: .12, depth: .10, tint: .14, rough: .12, grime: .46, wear: .25 },
      M_PY_STONE3: { cell: [7.0, 5.0], seam: .12, depth: .10, tint: .12, rough: .10, grime: .36, wear: .35 },
    },
    // obsidienne vernie (le corps), or poli (corniches, colliers) ; basalte un peu assombri
    fix: (mat) => {
      if (mat.userData.pk) return; mat.userData.pk = 1;
      if (/^M_PY_STONE/.test(mat.name)) mat.color.multiplyScalar(0.8);
      if (mat.name === 'M_PY_DARK') { mat.color.set(0x08080b); mat.roughness = 0.2; mat.metalness = 0.55; }
      if (mat.name === 'M_PY_GOLD') { mat.color.set(0xc8913c); mat.roughness = 0.24; mat.metalness = 1.0; }
    },
    glass: [.02, .02, .02], rockLift: null, nav: () => false, beacon: '', navPulse: [1, 0, 1],
    cloud: { dust: [0x070405, 0x0a0506, 0x0c0606], gas: [0x3a1410, 0x2c120e, 0x4a1c10, 0x261010], glow: [0xff9a50, 0xffb070, 0xe06a3a],
             nearSize: [9, 12], farSize: [30, 36], nearR: [14, 16], farR: [40, 40], nearY: [-10, 12], farY: [-26, 30], w: 0.010 },
    // nébuleuse sang -> rouille, voiles brun sombre, filaments d'or
    sky: { a: '.16, .037, .025', b: '.21, .08, .031', c: '.074, .031, .037', base: '.008, .004, .004', fil: '.88, .55, .26', glow: '1.25, .56, .25' },
    // éclipse : anneau de couronne rouge-or (le disque noir et les rais sont posés dans lights) + grande lueur
    sunStops: [
      [400, [[0, 'rgba(255,120,50,0)'], [.11, 'rgba(255,120,50,0)'], [.125, 'rgba(255,220,170,1)'], [.15, 'rgba(255,170,90,.7)'], [.22, 'rgba(255,120,50,.30)'], [.5, 'rgba(160,40,20,.08)'], [1, 'rgba(80,10,10,0)']], .95, 1],
      [1400, [[0, 'rgba(255,110,50,.16)'], [.25, 'rgba(160,40,20,.07)'], [1, 'rgba(60,10,10,0)']], .9, 1],
    ],
    // contre-jour de l'éclipse : les arêtes s'allument, les faces restent noires
    key: [0xffb27a, 3.2, 40, 7.5, 90], fill: [0x8a3a24, 0.55], rim: [0x9aa6c0, 0.0], hemi: [0x2a1a18, 0x060304],
    // quais : parvis du portail, nacelles d'angle sous la jupe, pointes des obélisques
    tips: [[0, -841, 420], [0, -841, 560], [-60, -841, 600], [682, -642, 118], [-682, -642, 118], [682, 642, 118], [-682, 642, 118],
      [620, -580, 1000], [-620, -580, 1000], [620, 580, 1000], [-620, 580, 1000], [785, 70, 200], [-785, 70, 200]].map(t => t.concat([0])),
    lane: { n: 40, nLite: 18, out: [12, 20], spread: 4, lift: [4, 2], size: [0.05, 0.16] },
    orbit: { n: 18, nLite: 8, r: [6.2, 4.0], y: 7.5, size: [0.05, 0.12] },
    target: [0, 2.7, 0], minDist: 3.6,
    ice: { n: 420, nLite: 160, big: 36, color: 0x1c1614, emissive: 0x000000 },   // débris de basalte
    lights: (L, hv, P) => {
      const hall = L(0xffb060, 2.2, 2.6, P(0, -560, 560));   // salle du portail : la lumière déborde sur le parvis et les gardiens
      L(0xffa040, 1.6, 1.4, P(0, -820, 470));
      L(0xff9a40, 3.0, 3.4, P(0, 0, -40));                    // cœur du dessous
      L(0xffc070, 2.0, 2.0, P(0, 0, 1112));                   // cristal sous la coiffe
      hv(P(0, 0, 10), 1.5, 0xffa040, 0.9);                    // orbe du dessous
      hv(P(0, 0, 1112), 0.9, 0xffc070, 0.5);                  // cristal
      hv(P(0, 0, 1252), 0.35, 0xfff0d0, 1.6);                 // apex
      for (const [x, y] of [[620, 580], [-620, 580], [620, -580], [-620, -580]]) hv(P(x, y, 1000), 0.18, 0xffd090, 1.2);   // pointes d'obélisques
      const station = hall.parent, scene = station.parent, T = window.SB3D.THREE;
      const front = new T.DirectionalLight(0x9aa6c0, 0.6); front.position.set(12, 3, 14); scene.add(front);   // juste de quoi lire les blocs
      // éclipse : disque noir devant la couronne, rais fins qui tournent très lentement
      const sunPos = new T.Vector3(-0.36, 0.55, -0.76).normalize().multiplyScalar(1100);
      const cv = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 512; draw(c.getContext('2d')); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
      const disk = new T.Sprite(new T.SpriteMaterial({ map: cv(g => { const r = g.createRadialGradient(256, 256, 0, 256, 256, 256);
        r.addColorStop(0, 'rgba(1,0,0,1)'); r.addColorStop(.86, 'rgba(1,0,0,1)'); r.addColorStop(1, 'rgba(1,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 512, 512); }),
        depthWrite: false, transparent: true, fog: false }));
      disk.scale.set(96, 96, 1); disk.position.copy(sunPos); disk.renderOrder = -2; station.add(disk);
      const rays = new T.Sprite(new T.SpriteMaterial({ map: cv(g => { g.translate(256, 256); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, Ln = 120 + Math.random() * 130, w = 1 + Math.random() * 3;
          const gr = g.createLinearGradient(0, 0, Math.cos(a) * Ln, Math.sin(a) * Ln);
          gr.addColorStop(0, 'rgba(255,170,90,0)'); gr.addColorStop(.25, 'rgba(255,170,90,.35)'); gr.addColorStop(1, 'rgba(255,120,60,0)');
          g.strokeStyle = gr; g.lineWidth = w; g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); g.lineTo(Math.cos(a) * Ln, Math.sin(a) * Ln); g.stroke(); } }),
        blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: .42, fog: false }));
      rays.scale.set(560, 560, 1); rays.position.copy(sunPos); rays.renderOrder = -1; station.add(rays);
      // faisceau d'énergie sous le cœur : cône additif qui se dissout vers le bas
      const BT = { value: 0 };
      const beam = new T.Mesh(new T.CylinderGeometry(0.12, 1.1, 6.0, 32, 1, true), new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: 2, uniforms: { uT: BT },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(abs(dot(vN, vV)), 1.6); float h = vUv.y; float puls = .75 + .25 * sin(h * 24.0 + uT * 2.2);
            float a = f * pow(h, 2.4) * puls * .42; gl_FragColor = vec4(vec3(1.0, .62, .26) * a, a); }` }));
      beam.position.copy(P(0, 0, -570)); beam.frustumCulled = false; station.add(beam);
      // l'or respire : deux battements rapprochés toutes les 4 s (veines, cristal, feux des nacelles)
      const beat = [], GL = { M_PY_GLOW: 2.0, M_PY_CRYSTAL: 2.6 };
      station.traverse(o => { if (!o.isMesh || !o.material) return; for (const m of [].concat(o.material)) if ((GL[m.name] || m.name === 'M_PY_BEACON') && !beat.includes(m)) beat.push(m); });
      const t0 = performance.now();
      beam.onBeforeRender = () => {
        const t = (performance.now() - t0) / 1000, ph = (t % 4.0) / 4.0;
        const b = Math.exp(-Math.pow((ph - .08) / .035, 2)) + .7 * Math.exp(-Math.pow((ph - .2) / .04, 2));
        BT.value = t; rays.material.rotation = t * 0.004;
        for (const m of beat) m.emissiveIntensity = m.name === 'M_PY_BEACON' ? 2.0 + 4.0 * b : GL[m.name] * (0.8 + 0.45 * b);
      };
      // reflets de l'obsidienne : une bande chaude haute (l'éclipse), un liseré froid latéral, une lueur d'or par en dessous
      const envScene = new T.Scene(); envScene.background = new T.Color(0x0a0405);
      const box = (w, h, col, k, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: 2 })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
      box(88, 18, 0xffb070, 5.0, -24, 80, -56); box(18, 88, 0x8090b0, 2.0, 88, 16, 24); box(64, 24, 0xff9040, 2.4, 0, -80, 24); box(32, 32, 0xd8c8b0, 1.2, -32, 16, 96);
      const ENV_K = { M_PY_GOLD: 1.25, M_PY_DARK: 0.45 };
      let baked = false;
      disk.onBeforeRender = (renderer) => {
        if (baked) return; baked = true;
        setTimeout(() => {   // hors du rendu en cours : le PMREM ne se cuit qu'une fois
          const pm = new T.PMREMGenerator(renderer), old = scene.environment;
          const env = pm.fromScene(envScene, 0.02, 1, 400).texture; pm.dispose();
          scene.environment = env;   // le basalte n'en boit qu'un peu (night.envScene) ; l'obsidienne et l'or ont leur propre reflet, plein
          station.traverse(o => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) if (ENV_K[m.name]) { m.envMap = env; m.envMapIntensity = ENV_K[m.name]; m.needsUpdate = true; } });
          envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          if (old) old.dispose();
        }, 0);
      };
      return hall;
    },
    // « la salle des gardiens » : le portail creux vu du parvis, en contre-plongée, le mur du fond lumineux
    barShot: { t: [0, -560, 570], p: [230, -1820, 300] }, barAt: [0, -560, 560], barMax: 9,
    // « le dock » : une nacelle d'angle sous la jupe, ton tanker en attente
    dockShot: { t: [740, -720, 110], p: [1500, -1650, -260] }, dockMax: 9,
    tankerAt: { pos: [960, -960, 30], rotZ: 45, scale: 9 },
    night: { bloom: [0.75, 0.5, 0.95], envScene: 0.3 },
  },
  // 22/10 — obsidienne (station lointaine, vitrine validée par Adrien)
  // 22/10 — La Main d'Obsidienne (ex « La Main », reliquaire des Anciens) : une main de 1 450 m en chrome noir irisé, 220 capsules habitées,
  // vitrine validée par Adrien ; nuit violette, étoile froide derrière les doigts, reflets de studio de joaillier dans le chrome
  obsidienne: {
    S: 0.005, near: 0.03, half: [4.1, 4.9], minFit: 7, bg: 0x03070c, haze: 0x120f24, fog: [4.5, 22], cy: 3.5,
    sun: [-0.50, 0.62, -0.60], core: [-0.45, 0.40, -0.80], camDir: [0.38, 0.0, 0.93], introDir: [0.95, 0.55, -0.20],
    GLOSS: {}, LOOK: {},
    // chrome noir irisé, nervures chromées, verre fumé à intérieur habité (matériaux physiques : irisation, vernis)
    phys: {
      M_AH_SKIN:   { color: 0x14121c, rough: 0.15, metal: 1.0, env: 1.5, irid: 1.0, iridIor: 1.6, iridRange: [180, 620], coat: 0.6 },
      M_AH_RIB:    { color: 0xb8b6c4, rough: 0.10, metal: 1.0, env: 1.35, irid: 0.35, iridIor: 1.5, iridRange: [250, 500] },
      M_AH_RIB2:   { color: 0x8a6cc8, rough: 0.12, metal: 1.0, env: 1.3, irid: 0.6, iridIor: 1.5, iridRange: [300, 700] },
      M_AH_GLASS:  { color: 0x0b0a10, rough: 0.06, metal: 0.8, env: 1.05, irid: 0.7, iridIor: 1.35, iridRange: [200, 520], coat: 1.0, room: [0xd8d2ff, 0.34] },
      M_AH_GLASS2: { color: 0x150c28, rough: 0.06, metal: 0.8, env: 1.05, irid: 0.9, iridIor: 1.35, iridRange: [250, 650], coat: 1.0, room: [0xb48cff, 0.4] },
      M_AH_LENS:   { color: 0x15141c, rough: 0.03, metal: 0.2, env: 2.0, irid: 0.4, iridIor: 1.3, iridRange: [200, 400], coat: 1.0, opacity: 0.32 },
      M_AH_DARK:   { color: 0x06060a, rough: 0.35, metal: 0.8, env: 0.8 },
    },
    // reflets du chrome : la nébuleuse + quatre grands panneaux lumineux (studio de joaillier dans l'espace) [largeur, hauteur, couleur, intensité, position]
    studio: [[900, 260, 0xf4f0ff, 6.0, [-700, 900, -500]], [260, 1100, 0xb8a8ff, 3.5, [1100, 100, 400]], [700, 200, 0x90b4ff, 2.6, [200, -900, 800]], [500, 500, 0xffffff, 2.2, [-300, 300, 1200]]],
    GLOW: { M_AH_INNER: 0.16, M_AH_COLUMN: 1.7, M_AH_WIN: 1.1, M_AH_TIP: 2.4, M_AH_BEACON: 3.0 },
    GLOW_COLOR: { M_AH_INNER: 0xcfc8ff, M_AH_COLUMN: 0xeef0ff, M_AH_WIN: 0xfff0dc, M_AH_TIP: 0xa070ff, M_AH_BEACON: 0xffffff },
    glass: [.02, .02, .03], rockLift: null, nav: (n) => n === 'M_AH_BEACON', beacon: '', navPulse: [1.2, 2.5, 1.1],
    breathe: { M_AH_TIP: [2.0, 0.6, 0.7] },   // les pointes des doigts respirent
    cloud: { dust: [0x06050c, 0x080714, 0x0a0918], gas: [0x2a2050, 0x1c2a52, 0x382a62, 0x1a2244], glow: [0xa890ff, 0x8fb4ff, 0xd0b8ff],
             nearSize: [9, 12], farSize: [30, 36], nearR: [14, 16], farR: [40, 40], nearY: [-8, 12], farY: [-24, 34], w: 0.010 },
    sky: { a: '.12, .10, .30', b: '.08, .16, .36', c: '.32, .20, .52', base: '.010, .008, .020', fil: '.75, .73, .94', glow: '1.27, 1.20, 1.50' },
    sunStops: [
      [34,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(236,244,255,1)'], [.5, 'rgba(190,215,240,.6)'], [1, 'rgba(150,185,220,0)']], .9, 1],
      [300, [[0, 'rgba(220,232,255,.85)'], [.12, 'rgba(150,185,255,.40)'], [.4, 'rgba(60,110,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(180,210,235,.24)'], [.3, 'rgba(80,120,160,.08)'], [1, 'rgba(30,50,80,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xf2eeff, 2.8, 40, 6, 90], fill: [0x7a6cd8, 0.7], rim: [0xc8b8ff, 0.9], hemi: [0x2a2450, 0x08060e],
    // points d'amarrage : la paume, les quatre arches du poignet, le dos de la main, le bout des doigts
    tips: [[0, -420, 650], [0, -380, 170], [0, 380, 170], [380, 0, 170], [-380, 0, 170], [0, 380, 600], [60, 300, 1500], [-200, 500, 1520], [300, -300, 1050]].map(t => t.concat([0])),
    lane: { n: 36, nLite: 16, out: [12, 20], spread: 4, lift: [4, 2], size: [0.12, 0.35] },
    orbit: { n: 18, nLite: 8, r: [5.5, 4], y: 7, size: [0.10, 0.22] },
    target: [0, 3.5, 0], minDist: 2.6,
    lights: (L, hv, P) => {
      L(0xd8d0ff, 1.2, 1.6, P(0, 260, 600));                                   // œuf du dos
      for (const [x, y] of [[0, -320], [0, 320], [320, 0], [-320, 0]]) L(0xeee8ff, 0.8, 1.3, P(x, y, 160));   // arches du poignet
      L(0xa070ff, 1.4, 2.4, P(-200, 450, 1500));                               // pointes des doigts
      L(0xe0dcff, 1.0, 2.0, P(0, 0, -60));                                     // poignet ouvert
      return L(0xe8e4ff, 1.0, 1.8, P(0, -120, 650));                           // salle de la paume
    },
    // « la paume » : le grand hublot et ses colonnes de lumière, les capsules habitées tout autour
    barShot: { t: [0, -150, 700], p: [430, -1250, 640] }, barAt: [0, -200, 650], barMax: 8,
    // « le dock » : une arche du poignet, ton tanker à quai devant
    dockShot: { t: [40, -440, 245], p: [330, -1290, 255] }, dockMax: 8,
    tankerAt: { pos: [50, -470, 150], rotZ: 90, scale: 5 },
    // éclats de chrome noir qui dérivent autour de la main
    ice: { n: 420, nLite: 160, big: 36, color: 0x241c3a, emissive: 0x000000, rough: 0.15, metal: 0.9, env: 1.2,
           bigR: [22, 34], smallR: [8, 26], bigY: 26, smallY: 18, bigS: [0.4, 1.2], smallS: [0.02, 0.25] },
    night: { bloom: [0.6, 0.45, 1.0] },
  },
  // 22/10 — abime (station lointaine, vitrine validée par Adrien)
  // 22/10 — La Dent de l'Abîme (ex « Dent de Requin », classe Mégalodon) : une dent d'émail bleu nuit de 2,6 km dans un océan stellaire,
  // vitrine validée par Adrien ; brume bleu-vert, lumière tombant d'une « surface » ridée, caustiques, bulles, plancton et méduses
  abime: {
    S: 0.005, near: 0.03, half: [7.0, 8.4], minFit: 16, bg: 0x010407, haze: 0x0b3540, fog: [0, 30], fogK: 0.7,
    sun: [-0.28, 0.90, 0.33], core: [-0.20, 0.85, 0.30], camDir: [0.36, -0.20, 0.91], introDir: [0.18, -0.95, 0.26],
    // émail bleu nuit satiné (pas de surbrillance : la dent est trop grande pour briller comme un vaisseau) ; roche mate
    GLOSS: {
      M_ST_ENAMEL: [0.46, 0.22], M_ST_ENAMEL2: [0.44, 0.22], M_ST_ENAMEL3: [0.50, 0.2], M_ST_EDGE: [0.42, 0.3], M_ST_GROUT: [0.8, 0.0],
      M_ST_ROCK: [0.95, 0.0], M_ST_ROCK2: [0.95, 0.0], M_ST_ROCK_DARK: [1.0, 0.0],
      M_ST_STEEL: [0.62, 0.45], M_ST_GUNMETAL: [0.62, 0.55], M_ST_DARK: [0.85, 0.15], M_ST_BRASS: [0.55, 0.6], M_ST_FRAME: [0.5, 0.6],
    },
    GLOW: { M_ST_WIN: 1.6, M_ST_AMBER: 2.0, M_ST_BEACON: 3.0, M_ST_NAV: 2.5, M_ST_VEIN: 0.9 },
    GLOW_COLOR: { M_ST_WIN: 0xffa850, M_ST_AMBER: 0xff9a3a, M_ST_BEACON: 0xd8ecff, M_ST_NAV: 0xff2a14, M_ST_VEIN: 0x3e9cff },
    // émail : variations douces par plaque, sans faux joints (les plaques sont de la vraie géométrie) ; roche : patine
    LOOK: {
      M_ST_ENAMEL:   { cell: [60.0, 40.0], seam: .0, depth: .0, tint: .10, rough: .10, grime: .18, wear: .12 },
      M_ST_ENAMEL2:  { cell: [60.0, 40.0], seam: .0, depth: .0, tint: .10, rough: .10, grime: .18, wear: .12 },
      M_ST_ENAMEL3:  { cell: [60.0, 40.0], seam: .0, depth: .0, tint: .10, rough: .10, grime: .18, wear: .12 },
      M_ST_EDGE:     { cell: [30.0, 20.0], seam: .0, depth: .0, tint: .08, rough: .10, grime: .10, wear: .30 },
      M_ST_ROCK:     { cell: [60.0, 40.0], seam: .0, depth: .0, tint: .22, rough: .05, grime: .40, wear: .55 },
      M_ST_ROCK2:    { cell: [60.0, 40.0], seam: .0, depth: .0, tint: .22, rough: .05, grime: .40, wear: .55 },
      M_ST_STEEL:    { cell: [6.0, 4.0], seam: .14, depth: .12, tint: .08, rough: .10, grime: .26, wear: .45 },
      M_ST_GUNMETAL: { cell: [8.0, 5.0], seam: .16, depth: .35, tint: .08, rough: .12, grime: .22, wear: .45 },
      M_ST_DARK:     { cell: [16.0, 9.0], seam: .20, depth: .14, tint: .14, rough: .14, grime: .14, wear: .20 },
      M_ST_FRAME:    { cell: [10.0, 6.0], seam: .12, depth: .10, tint: .06, rough: .08, grime: .12, wear: .40 },
    },
    // émail bleu nuit qui se lit encore à contre-jour ; reflets un peu plus présents que sur les coques des autres stations
    fix: (mat) => {
      if (mat.userData.da) return; mat.userData.da = 1;
      const k = { M_ST_ROCK: 1.0, M_ST_ROCK2: 0.95, M_ST_ENAMEL: 1.6, M_ST_ENAMEL2: 1.6, M_ST_ENAMEL3: 1.6, M_ST_EDGE: 1.4 }[mat.name];   // un peu moins que la vitrine : sans son occlusion ambiante, la roche pâlissait
      if (k) mat.color.multiplyScalar(k);
      if (/^M_ST_/.test(mat.name) && mat.envMapIntensity !== undefined && !/_(WIN|AMBER|BEACON|NAV|VEIN)$/.test(mat.name)) mat.envMapIntensity = 0.30;
    },
    caustics: { color: '.25, .7, .72', k: 0.2, scale: 0.035 },   // le réseau de lumière des vagues glisse sur la coque
    glass: [.02, .03, .045], rockLift: null, nav: (n) => n === 'M_ST_NAV', beacon: '', navPulse: [1.2, 2.6, 1.1],
    breathe: { M_ST_VEIN: [0.75, 0.3, 0.45], M_ST_BEACON: [3.0, 1.0, 0.8] },   // les fissures respirent
    cloud: { dust: [0x020a0d, 0x041014, 0x05141a], gas: [0x0e3a44, 0x114a52, 0x0f3a4a, 0x16505a], glow: [0x3fd0d8, 0x6ae0e0, 0x4ab0e0],
             nearSize: [12, 16], farSize: [38, 44], nearR: [19, 20], farR: [50, 45], nearY: [-12, 14], farY: [-30, 40], w: 0.010 },
    sky: { a: '.03, .12, .17', b: '.04, .18, .24', c: '.08, .12, .26', base: '.002, .006, .010', fil: '.31, .69, .84', glow: '.375, .775, 1.0',
      // l'océan de l'espace : la « surface » est au-dessus, lumineuse et ridée ; en dessous, l'abîme
      extra: `{ float up = max(d.y, 0.0);
        col += vec3(.04, .20, .24) * pow(up, 1.4) * .55;
        vec2 sp = d.xz / (d.y + .35) * 3.0; float rip = 0.0; vec2 ii = sp;
        for (int k = 0; k < 4; k++) { float tt = 1.7 * (1.0 - 3.5 / float(k + 1)); ii = sp + vec2(cos(tt - ii.x) + sin(tt + ii.y), sin(tt - ii.y) + cos(tt + ii.x));
          rip += 1.0 / length(vec2(sp.x / (sin(ii.x + tt) / .006), sp.y / (cos(ii.y + tt) / .006))); }
        rip = pow(abs(1.17 - pow(rip / 4.0, 1.4)), 8.0);
        col += vec3(.30, .75, .80) * clamp(rip, 0.0, 1.0) * pow(up, 3.0) * .35;
        col *= mix(1.0, .35, smoothstep(0.0, -.85, d.y)); }` },
    sunStops: [
      [34,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(236,244,255,1)'], [.5, 'rgba(190,215,240,.6)'], [1, 'rgba(150,185,220,0)']], .9, 1],
      [300, [[0, 'rgba(220,232,255,.85)'], [.12, 'rgba(150,185,255,.40)'], [.4, 'rgba(60,110,200,.10)'], [1, 'rgba(30,60,120,0)']], .85, 1],
      [1000, [[0, 'rgba(180,210,235,.24)'], [.3, 'rgba(80,120,160,.08)'], [1, 'rgba(30,50,80,0)']], .8, 1],
      [760, [[0, 'rgba(210,225,255,.7)'], [.25, 'rgba(120,160,230,.22)'], [1, 'rgba(60,90,160,0)']], .4, 0.03],
    ],
    key: [0xc8f2f0, 3.0, 40, 17, 90], fill: [0x2f8fa8, 0.55], rim: [0x7fc0ff, 0.6], hemi: [0x245a64, 0x03080c],
    // bouts des bras d'amarrage des tranchants, la halle, la ville sur la racine, la pointe
    tips: [[675, 0, -439], [775, 0, -259], [-615, 0, -236], [-700, 0, -125], [955, 0, 55], [1175, 0, 209], [-1150, 0, 398], [1215, 0, 399], [1240, 0, 631],
      [-1235, 0, 638], [-1100, 0, 340], [-1150, 0, 455], [0, -450, 700], [-300, -380, 420], [0, 0, 1200], [-560, 0, 1200], [560, 0, 1200]].map(t => t.concat([0])),
    lane: { n: 46, nLite: 20, out: [12, 20], spread: 4, lift: [4, 2], size: [0.12, 0.35] },
    orbit: { n: 18, nLite: 8, r: [9, 5], y: 11, size: [0.10, 0.22] },
    target: [0, 0.3, 0], minDist: 2.2,
    lights: (L, hv, P) => {   // nappes de lumière chaude rasante : elles révèlent la structure sans éblouir
      L(0xffb060, 2.2, 2.4, P(80, -170, 640));       // dans la caverne de la halle
      L(0xffa850, 1.5, 3.0, P(-330, -360, 420));     // galeries
      L(0xffa850, 1.3, 3.0, P(-230, -340, 110));
      L(0xffb060, 1.6, 3.4, P(0, -60, 1180));        // la ville sur la racine
      L(0x8cc8ff, 2.2, 2.6, P(0, -60, -1330));       // le feu de la pointe
      L(0x3e9cff, 1.1, 4.0, P(-150, -420, -350));    // reflet bleu des fissures
      L(0x3e9cff, 1.0, 4.0, P(150, 420, -150));
      hv(P(0, 0, -1296), 0.9, 0xbfe2ff, 0.5);
      hv(P(-1050, 20, 1330), 0.35, 0xd8ecff, 0.8);
      hv(P(1050, 30, 1330), 0.35, 0xd8ecff, 0.7);
      return L(0xffa850, 2.6, 3.8, P(0, -430, 680)); // la grande halle vitrée
    },
    // « la halle » : la halle à bout arrondi et cadre bleu, ses galeries en dessous
    barShot: { t: [-80, -400, 560], p: [450, -1850, 300] }, barAt: [0, -430, 680], barMax: 12,
    // « le dock » : un bras d'amarrage du tranchant est, ton tanker à quai
    dockShot: { t: [1150, -60, 220], p: [1750, -1000, 380] }, dockMax: 12,
    tankerAt: { pos: [1180, -230, 200], rotZ: 0, scale: 6 },
    // éclats de roche arrachés à la racine : ils remontent lentement, comme dans l'eau
    ice: { n: 300, nLite: 120, big: 24, color: 0x2c2620, emissive: 0x000000, rough: 0.95, metal: 0.0, env: 0.25, det: 1,
           bigR: [28, 40], smallR: [10, 30], bigY: 30, smallY: 24, bigS: [0.5, 1.4], smallS: [0.03, 0.3], rise: 16 },
    aqua: { motes: 900, rays: 9, bubbles: 260, jellies: 7, jellyR: [17, 14], jellyS: [0.5, 0.7] },   // méduses un peu plus loin et plus petites qu'en vitrine : sur mobile, elles ne doivent pas masquer la halle
    night: { exposure: 1.12, envScene: 0.30, light: 0.85 },   // three récent : scene.environmentIntensity remplace l'envMapIntensity 0,30 de la vitrine
  },

};

function mount(container, opts = {}) {
  const PR = PROFILES[opts.profile] || PROFILES.crown;
  const NT = Object.assign({ light: 1, glow: 1, tex: 1, halo: 1, bloom: null, albedo: 0, env: 1, exposure: 1 }, PR.night || {});
  const S = PR.S, GLOSS = PR.GLOSS, GLOW = PR.GLOW, GLOW_COLOR = PR.GLOW_COLOR, LOOK = PR.LOOK;
  const { THREE, GLTFLoader, MapControls, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.SB3D;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LITE = !!(window.SBPerf && window.SBPerf.level >= 2);
  // 20/10 — iPhone : la station plantait l'onglet (mémoire) en s'ajoutant à la planète et à la carte.
  // Budget mobile : résolution plafonnée, fond et ombres plus légers. Le rendu passe par le composer :
  // l'antialiasing du canvas ne servait à rien et coûtait un tampon multi-échantillonné plein écran.
  const MOBILE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
  const W = () => Math.max(1, container.clientWidth), H = () => Math.max(1, container.clientHeight);
  let alive = true, raf = 0;

  /* ── moteur ── */
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1 : MOBILE ? 1.5 : 2));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = NT.exposure;
  renderer.shadowMap.enabled = !LITE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene(), bgScene = new THREE.Scene();
  bgScene.background = new THREE.Color(PR.bg);
  const camera = new THREE.PerspectiveCamera(40, W() / H(), PR.near, 4000);
  const portrait = () => W() / H() < 0.8;
  function fitDistance() {
    camera.fov = portrait() ? 54 : 40; camera.updateProjectionMatrix();
    const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    return Math.max(PR.minFit, (portrait() ? PR.half[0] : PR.half[1]) / Math.tan(Math.min(v, h)));
  }
  const HAZE = new THREE.Color(PR.haze);   // brume du nuage (pourpre au Crown, bleu-cendre au Linceul)
  scene.fog = new THREE.Fog(HAZE, 10, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  // 16/10 — avec scene.environment, three applique scene.environmentIntensity (pas envMapIntensity des matériaux) : la nuit, on l'éteint presque
  if (NT.envScene !== undefined && 'environmentIntensity' in scene) scene.environmentIntensity = NT.envScene;

  const CAM_DIR = new THREE.Vector3(...(PR.camDir || [0.60, -0.34, 0.72])).normalize();   // 3/4 dessous : la station écrase le cadre
  const SUN_DIR = new THREE.Vector3(...PR.sun).normalize();   // étoile voilée par la nébuleuse, derrière la tour
  const NEB_CORE = new THREE.Vector3(...PR.core).normalize();  // cœur lumineux de la nébuleuse

  /* ── fond : nébuleuse, étoiles, géante gazeuse, soleil ── */
  /* ── fond : nébuleuse rouge pourpre, rendue UNE fois dans un cube (coût nul par image) ── */
  let seed = 1234567; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function cloudTex(sd) {
    const N = LITE ? 128 : 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    let st = sd * 7919 + 13; const rr = () => (st = (st * 16807) % 2147483647) / 2147483647;
    const V = new Float32Array(1024); for (let i = 0; i < 1024; i++) V[i] = rr();
    const vh = (x, y) => V[((x * 73856093) ^ (y * 19349663)) & 1023];
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const A = vh(xi, yi), B = vh(xi + 1, yi), C = vh(xi, yi + 1), D = vh(xi + 1, yi + 1);
      return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v; };
    const ox = rr() * 100, oy = rr() * 100;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let f = 0, amp = .5, fr = 3;
      for (let o = 0; o < 6; o++) { f += amp * vn(ox + x / N * fr, oy + y / N * fr); fr *= 2.03; amp *= .5; }
      const nx = x / N * 2 - 1, ny = y / N * 2 - 1, r = Math.hypot(nx, ny);
      const fall = sstep(1.0, 0.2, r + (f - .5) * .9), dens = sstep(.30, .78, f) * fall, lum = 0.55 + 0.6 * sstep(.4, .85, f);
      const k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.min(255, 255 * lum); img.data[k + 3] = 255 * dens;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  const CLOUD_TEX = [1, 2, 3, 4].map(cloudTex);
  const CLOUD_DUST = PR.cloud.dust, CLOUD_GAS = PR.cloud.gas, CLOUD_GLOW = PR.cloud.glow;
  const pick = (arr) => arr[(rand() * arr.length) | 0];
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { uCore: { value: NEB_CORE } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uCore; varying vec3 vDir;
      float h(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<7;i++){ s+=a*n(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float c = max(dot(d, uCore), 0.0);
        vec3 q = d * 2.2;
        vec3 w = vec3(fbm(q + 1.3), fbm(q + 7.1), fbm(q + 3.7));
        float f = fbm(q * 1.6 + w * 1.9);
        float g = fbm(d * 6.5 + w * 2.6);
        float mass = smoothstep(.28, .78, f);
        float glow = pow(c, 2.5) * .8 + pow(c, 10.0) * 1.3;
        float lanes = smoothstep(.45, .72, fbm(d * 4.2 + w * 3.0 + 11.0));
        float hue = fbm(d * 1.6 + 5.0);
        vec3 gas = mix(vec3(${PR.sky.a}), vec3(${PR.sky.b}), smoothstep(.40, .70, hue));
        gas = mix(gas, vec3(${PR.sky.c}), smoothstep(.58, .84, fbm(d * 1.2 + 19.0)));
        vec3 col = vec3(${PR.sky.base});
        col += gas * mass * (.22 + 1.0 * glow + .25 * smoothstep(.2, .9, g)) * .42;
        col += vec3(${PR.sky.fil}) * pow(mass * g, 2.0) * (.14 + 1.5 * glow) * .32;
        col += vec3(${PR.sky.glow}) * glow * .08;
        col *= 1.0 - .94 * lanes * (.45 + .55 * mass);
        ${PR.sky.extra || ''}
        gl_FragColor = vec4(col, 1.0);
      }`
  })));
  {
    const plane = new THREE.PlaneGeometry(1, 1);
    const bandN = new THREE.Vector3(0.25, 1, 0.35).normalize();
    for (let i = 0; i < 72; i++) {
      const kind = rand();
      let dir;
      if (kind < 0.45) dir = NEB_CORE.clone().add(new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(1.3));
      else if (kind < 0.8) { dir = new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5); dir.addScaledVector(bandN, -dir.dot(bandN) * 0.85); }
      else dir = new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5);
      dir.normalize();
      const r = 420 + rand() * 600, near = dir.dot(NEB_CORE), t = rand();
      const type = t < 0.40 ? 'dust' : (t < 0.86 - Math.max(0, near) * 0.2 ? 'gas' : 'glow');
      const mat = new THREE.MeshBasicMaterial({
        map: CLOUD_TEX[(rand() * 4) | 0], transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
        color: type === 'dust' ? pick(CLOUD_DUST) : type === 'gas' ? pick(CLOUD_GAS) : pick(CLOUD_GLOW),
        opacity: type === 'dust' ? .55 + rand() * .35 : type === 'gas' ? .30 + rand() * .35 : .12 + rand() * .22,
        blending: type === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const m = new THREE.Mesh(plane, mat);
      m.position.copy(dir).multiplyScalar(r); m.lookAt(0, 0, 0); m.rotateZ(rand() * Math.PI * 2);
      m.scale.set(r * (0.4 + rand() * 0.8), r * (0.3 + rand() * 0.6), 1);
      skyScene.add(m);
    }
  }
  const skyRT = new THREE.WebGLCubeRenderTarget(LITE ? 384 : MOBILE ? 512 : 768, { type: THREE.HalfFloatType, generateMipmaps: false });
  new THREE.CubeCamera(1, 3000, skyRT).update(renderer, skyScene);
  bgScene.background = skyRT.texture;
  // 22/10 — reflets en studio (optionnel) : grands panneaux lumineux autour de la nébuleuse, vus seulement par les reflets (chrome de la Main)
  let studioEnv = null;
  if (PR.studio) {
    const pg = new THREE.PlaneGeometry(1, 1);
    for (const [w, h, col, k, pos] of PR.studio) {
      const pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      pm.scale.set(w, h, 1); pm.position.set(...pos); pm.lookAt(0, 0, 0); skyScene.add(pm);
    }
    studioEnv = pmrem.fromScene(skyScene, 0.015, 1, 4000).texture; scene.environment = studioEnv;
  }
  skyScene.traverse(o => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
  function starField(count, radius, size) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      pos.set([radius * sq * Math.cos(t), radius * u, radius * sq * Math.sin(t)], i * 3);
      const k = Math.random();
      c.setRGB(...(k > .92 ? [1, .8, .6] : k > .7 ? [.78, .86, 1] : [1, 1, 1])).multiplyScalar(.25 + Math.random() * .6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
  }
  bgScene.add(starField(1800, 1400, 1.1), starField(160, 1400, 2.0));   // moins d'étoiles : le gaz les noie

  function radialTex(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, col] of stops) r.addColorStop(o, col);
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const sunPos = SUN_DIR.clone().multiplyScalar(1100);
  for (const [size, stops, opacity, sx] of PR.sunStops) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(stops), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
    sp.scale.set(size, size * sx, 1); sp.position.copy(sunPos); bgScene.add(sp);
  }

  /* ── lumière ── */
  const station = new THREE.Group();
  scene.add(station);
  const key = new THREE.DirectionalLight(PR.key[0], PR.key[1] * NT.light);
  key.position.copy(SUN_DIR).multiplyScalar(PR.key[2]);
  key.castShadow = !LITE;
  key.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -PR.key[3], right: PR.key[3], top: PR.key[3], bottom: -PR.key[3], near: 1, far: PR.key[4] });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  key.target = station;
  scene.add(key);
  // la nébuleuse éclaire par en dessous (rouge sang) ; liseré violet sur les flancs opposés
  const nebFill = new THREE.DirectionalLight(PR.fill[0], PR.fill[1] * NT.light); nebFill.position.set(9, -16, 11); scene.add(nebFill);
  const rimL = new THREE.DirectionalLight(PR.rim[0], PR.rim[1] * NT.light); rimL.position.set(-14, -3, 10); scene.add(rimL);
  scene.add(new THREE.HemisphereLight(PR.hemi[0], PR.hemi[1], 0.55 * NT.light));
  function glowLight(color, intensity, dist, x, y, z) { const l = new THREE.PointLight(color, intensity * NT.glow, dist, 1.8); l.position.set(x, y, z); station.add(l); return l; }

  /* ── lookdev procédural (sans UV) : panneaux triplanaires, joints, patine, coulures, usure d'arête ── */
  const CAU = PR.caustics && !LITE ? PR.caustics : null, CAUSTIC_T = { value: 0 };   // 22/10 — caustiques optionnelles (océan stellaire)
  function premium(mat, p) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCell = { value: new THREE.Vector2(...p.cell) };
      sh.uniforms.uLook = { value: new THREE.Vector4(p.seam, p.depth, p.tint, p.rough) };
      sh.uniforms.uLook2 = { value: new THREE.Vector2(p.grime, p.wear) };
      if (CAU) sh.uniforms.uCT = CAUSTIC_T;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      sh.fragmentShader = (CAU ? sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {   // 22/10 — caustiques (optionnel) : le réseau de lumière des vagues glisse sur les faces tournées vers le haut
            float face = .25 + .75 * smoothstep(-.2, .9, normalize(vON).y);
            vec3 an = abs(normalize(vON)); an /= (an.x + an.y + an.z);
            float cs = an.y * caust(vOP.xz * ${CAU.scale.toFixed(4)}, uCT * .6) + an.z * caust(vOP.xy * ${CAU.scale.toFixed(4)} + 7.0, uCT * .6) + an.x * caust(vOP.zy * ${CAU.scale.toFixed(4)} + 3.0, uCT * .6);
            totalEmissiveRadiance += vec3(${CAU.color}) * cs * face * ${CAU.k.toFixed(3)};
          }`) : sh.fragmentShader)
        .replace('#include <common>', `#include <common>
          varying vec3 vOP; varying vec3 vON;
          uniform vec2 uCell; uniform vec4 uLook; uniform vec2 uLook2;
          ${CAU ? `uniform float uCT;
          float caust(vec2 p, float t){
            float a = sin(p.x + 1.6 * sin(p.y * 1.3 + t * .9) + t * .3);
            float b = sin(p.y * 1.1 + 1.6 * sin(p.x * 1.7 - t * .7) - t * .2);
            float c = sin((p.x + p.y) * .8 + 1.4 * sin(p.x * .9 - p.y * 1.2 + t * .5));
            return clamp(pow(1.0 - abs(a), 16.0) + pow(1.0 - abs(b), 16.0) + .6 * pow(1.0 - abs(c), 20.0), 0.0, 1.0); }` : ''}
          float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
            float a=hh(i.xy+i.z*17.0), b=hh(i.xy+vec2(1,0)+i.z*17.0), c=hh(i.xy+vec2(0,1)+i.z*17.0), d=hh(i.xy+vec2(1,1)+i.z*17.0);
            float a2=hh(i.xy+(i.z+1.0)*17.0), b2=hh(i.xy+vec2(1,0)+(i.z+1.0)*17.0), c2=hh(i.xy+vec2(0,1)+(i.z+1.0)*17.0), d2=hh(i.xy+vec2(1,1)+(i.z+1.0)*17.0);
            return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(a2,b2,f.x),mix(c2,d2,f.x),f.y), f.z); }
          vec2 panel(vec2 uv, vec2 cell){
            vec2 c = uv / cell; float row = floor(c.y); c.x += hh(vec2(row, 3.1)) * .9; c.x *= .7 + .6 * hh(vec2(row, 9.7));
            vec2 id = floor(c); vec2 f = fract(c);
            if (hh(id + 7.3) > .55) { float sx = step(.5, f.x); id = id * 2.0 + vec2(sx, 0.0); f.x = fract(f.x * 2.0); }
            vec2 e = min(f, 1.0 - f) * cell; return vec2(min(e.x, e.y), hh(id));
          }
          float seamOf(vec2 uv, vec2 cell, float sw, out float pid){ vec2 r = panel(uv, cell); pid = r.y; return 1.0 - smoothstep(sw * .5, sw * 1.6, r.x); }
          float tri(vec2 cell, float sw, out float pid){
            vec3 w = pow(abs(normalize(vON)), vec3(4.0)); w /= (w.x + w.y + w.z);
            float p1, p2, p3;
            float sX = seamOf(vOP.zy, cell, sw, p1), sY = seamOf(vOP.xz, cell, sw, p2), sZ = seamOf(vOP.xy, cell, sw, p3);
            pid = p1 * w.x + p2 * w.y + p3 * w.z;
            return sX * w.x + sY * w.y + sZ * w.z;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float mpp = length(fwidth(vOP));
          float cmin = min(uCell.x, uCell.y);
          float near = 1.0 - smoothstep(cmin / 22.0, cmin / 9.0, mpp);
          float farv = 1.0 - smoothstep(cmin * 3.5 / 30.0, cmin * 3.5 / 7.0, mpp);
          float pidF, pidC;
          float seamF = tri(uCell, uLook.x, pidF) * near;
          float seamC = tri(uCell * 3.5, uLook.x * 2.4, pidC) * farv;
          float seam = max(seamF, seamC * .85);
          float pid = mix(.5, pidF, near) * .45 + pidC * .55;
          vec3 op = vOP;
          float grime = vn(op * .012) * .5 + vn(op * .05) * .3 + vn(op * .25) * .2;
          float streak = vn(vec3(op.x * .3, op.y * .01, op.z * .3)) * vn(vec3(op.x * 1.2, op.y * .035, op.z * 1.2));
          float low = smoothstep(.2, -.8, normalize(vON).y);
          vec3 fw = fwidth(normalize(vON)); float edge = clamp(length(fw) * 6.0, 0.0, 1.0) * near;
          diffuseColor.rgb *= (1.0 - uLook.z * .5) + uLook.z * pid;
          diffuseColor.rgb *= 1.0 - .32 * seam;
          float leak = smoothstep(.55, .95, vn(vec3(op.x * .6, op.y * .06, op.z * .6))) * smoothstep(.0, .6, seam + .3);
          float rustv = smoothstep(.62, .92, vn(op * .04 + 3.0)) * smoothstep(.3, .8, grime);
          float dirt = clamp(uLook2.x * (grime * 1.6 + low * 1.0) + .5 * smoothstep(.15, .65, streak) + .35 * leak + .1, 0.0, .9);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.42, .37, .31), dirt);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24, .11, .05), rustv * .45 * uLook2.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.6 + .04, edge * uLook2.y * .5);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + uLook.w * (pid - .5) + .22 * seam + .22 * dirt + .2 * rustv - .12 * edge * uLook2.y, .05, 1.0);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float hgt = -seam * uLook.y * .22;
            vec3 sp = -vViewPosition; vec3 dpdx = dFdx(sp), dpdy = dFdy(sp);
            float dhx = dFdx(hgt), dhy = dFdy(hgt);
            vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
            float det = dot(dpdx, r1);
            vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
            normal = normalize(abs(det) * normal - grad);
          }`);
    };
    mat.customProgramCacheKey = () => (opts.profile || 'crown') + '-premium-' + mat.name;
  }

  /* ── 22/10 — matériaux physiques (optionnel, PR.phys) : chrome irisé, vernis, verre fumé ; salles habitées derrière le verre ── */
  function rooms(mat, [col, k]) {   // sans géométrie : planchers lumineux, cloisons, fenêtres chaudes, lus 25 m derrière le verre (parallaxe)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRoomCol = { value: new THREE.Color(col) }; sh.uniforms.uRoomK = { value: k };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vOP; varying vec3 vWP; uniform vec3 uRoomCol; uniform float uRoomK;
        float rh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        vec3 roomAt(vec3 q){
          float fl = smoothstep(.90, .985, fract(q.y / 12.0));
          float wall = smoothstep(.95, 1.0, fract((q.x + q.z * .7) / 14.0));
          vec3 cell = floor(q / vec3(9.0, 12.0, 9.0));
          float win = step(.86, rh(cell)) * (1.0 - fl) * smoothstep(.2, .6, fract(q.y / 12.0));
          float blk = .35 + .65 * rh(floor(q / 60.0));
          return (uRoomCol * (.18 + fl * .9 + wall * .2) + vec3(1.0, .86, .66) * win * .7) * blk;
        }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vWP - cameraPosition);
          float face = pow(abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
          totalEmissiveRadiance += roomAt(vOP + vd * 25.0) * uRoomK * face;
        }`);
    };
    mat.customProgramCacheKey = () => (opts.profile || 'crown') + '-room-' + mat.name;
  }
  function physSwap(root) {
    const cache = {};
    const swap = (mat) => {
      const p = PR.phys[mat.name]; if (!p) return mat;
      if (cache[mat.name]) return cache[mat.name];
      const q = new THREE.MeshPhysicalMaterial({ name: mat.name, color: p.color, roughness: p.rough, metalness: p.metal, envMapIntensity: p.env,
        iridescence: p.irid || 0, iridescenceIOR: p.iridIor || 1.3, iridescenceThicknessRange: p.iridRange || [100, 400],
        clearcoat: LITE ? 0 : (p.coat || 0), clearcoatRoughness: 0.04, side: THREE.DoubleSide });
      if (p.opacity) { q.transparent = true; q.opacity = p.opacity; q.depthWrite = false; }
      if (p.room) rooms(q, p.room);
      // three récent : avec scene.environment seule, l'intensité par matériau est ignorée ; on lui donne la carte pour que envMapIntensity compte
      if (scene.environment) q.envMap = scene.environment;
      q.userData.phys = 1; q.userData.ng = 1;
      mat.dispose(); return (cache[mat.name] = q);
    };
    root.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material); });
  }

  /* ── halos ── */
  const haloTex = radialTex([[0, 'rgba(255,255,255,1)'], [.18, 'rgba(255,230,190,.7)'], [.5, 'rgba(255,170,90,.15)'], [1, 'rgba(255,140,60,0)']]);
  const halos = [];
  function halo(x, y, z, size, color, pulse) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .9, fog: false }));
    sp.position.set(x, y, z); sp.scale.setScalar(size); sp.userData = { size, pulse, ph: Math.random() * 6 };
    station.add(sp); halos.push(sp); return sp;
  }

  /* ── trafic : le port vit ── */
  const shipGeo = (() => {   // coque, passerelle, nez, ailes, moteurs, fusionnés à la main (pas de BufferGeometryUtils dans SB3D)
    const parts = [new THREE.BoxGeometry(0.22, 0.12, 1.0)];
    const bridge = new THREE.BoxGeometry(0.12, 0.08, 0.28); bridge.translate(0, 0.09, -0.18); parts.push(bridge);
    const nose = new THREE.ConeGeometry(0.1, 0.3, 6); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 0.62); parts.push(nose);
    for (const s of [-1, 1]) { const w = new THREE.BoxGeometry(0.28, 0.03, 0.34); w.translate(s * 0.2, -0.02, -0.15); parts.push(w);
      const e = new THREE.CylinderGeometry(0.05, 0.06, 0.22, 8); e.rotateX(Math.PI / 2); e.translate(s * 0.08, 0, -0.56); parts.push(e); }
    const P = [], N = [];
    for (const g0 of parts) { const g = g0.index ? g0.toNonIndexed() : g0; P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    return g;
  })();
  const shipMat = new THREE.MeshStandardMaterial({ color: 0x8a8682, roughness: 0.75, metalness: 0.2, envMapIntensity: 0.25 });
  const TRAFFIC = [];
  const B2S = (x, y, z) => new THREE.Vector3(x * S, z * S, -y * S);
  function laneShip(kind) {
    const s = { kind, t: 0 }, LN = PR.lane, OR = PR.orbit;
    if (kind === 'lane') {
      const tp = PR.tips[(Math.random() * PR.tips.length) | 0], tip = B2S(tp[0], tp[1], tp[2]);
      const d = new THREE.Vector3(tip.x, 0, tip.z).normalize(), side = new THREE.Vector3(-d.z, 0, d.x);
      const off = (Math.random() - .5) * 1.6, hgt = (Math.random() - .3) * 1.6;
      s.a = tip.clone().addScaledVector(d, LN.out[0] + Math.random() * LN.out[1]).addScaledVector(side, off * LN.spread).add(new THREE.Vector3(0, hgt * LN.lift[0] + LN.lift[1], 0));
      s.b = tip.clone().addScaledVector(d, 0.6).addScaledVector(side, off * 0.8).add(new THREE.Vector3(0, hgt * 0.4, 0));
      if (Math.random() < .5) [s.a, s.b] = [s.b, s.a];
      s.dur = 18 + Math.random() * 26; s.t = Math.random(); s.size = LN.size[0] + Math.random() * LN.size[1];
    } else if (kind === 'orbit') {
      s.r = OR.r[0] + Math.random() * OR.r[1]; s.y = (Math.random() - .5) * OR.y; s.w = (0.012 + Math.random() * .02) * (Math.random() < .5 ? 1 : -1);
      s.ph = Math.random() * Math.PI * 2; s.size = OR.size[0] + Math.random() * OR.size[1];
    } else {
      const ang = Math.random() * Math.PI * 2, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), side = new THREE.Vector3(-d.z, 0, d.x);
      const y = (Math.random() < .5 ? -1 : 1) * (10 + Math.random() * 14), dist = 95 + Math.random() * 40;
      s.a = side.clone().multiplyScalar(dist).addScaledVector(d, -60).add(new THREE.Vector3(0, y, 0));
      s.b = side.clone().multiplyScalar(dist).addScaledVector(d, 60).add(new THREE.Vector3(0, y, 0));
      s.dur = 260 + Math.random() * 160; s.t = Math.random(); s.size = 3.0 + Math.random() * 2.0;
    }
    return s;
  }
  for (let i = 0; i < (LITE ? PR.lane.nLite : PR.lane.n); i++) TRAFFIC.push(laneShip('lane'));
  for (let i = 0; i < (LITE ? PR.orbit.nLite : PR.orbit.n); i++) TRAFFIC.push(laneShip('orbit'));
  for (let i = 0; i < 3; i++) TRAFFIC.push(laneShip('freighter'));
  const traffic = new THREE.InstancedMesh(shipGeo, shipMat, TRAFFIC.length);
  traffic.frustumCulled = false;
  scene.add(traffic);
  const engTex = radialTex([[0, 'rgba(255,255,255,1)'], [.2, 'rgba(255,220,180,.75)'], [.55, 'rgba(255,150,80,.16)'], [1, 'rgba(255,120,60,0)']]);
  const engGeo = new THREE.BufferGeometry();
  const engPos = new Float32Array(TRAFFIC.length * 3), engSize = new Float32Array(TRAFFIC.length);
  engGeo.setAttribute('position', new THREE.BufferAttribute(engPos, 3));
  engGeo.setAttribute('aSize', new THREE.BufferAttribute(engSize, 1));
  const engMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTex: { value: engTex }, uScale: { value: H() * renderer.getPixelRatio() } },
    vertexShader: `attribute float aSize; uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = clamp(aSize * uScale / -mv.z, 1.2, 22.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(t.rgb * vec3(1.0,.9,.8) * 1.1, t.a); }`
  });
  const engines = new THREE.Points(engGeo, engMat); engines.frustumCulled = false; scene.add(engines);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _b = new THREE.Vector3();
  function updateTraffic(t, dt) {
    TRAFFIC.forEach((s, i) => {
      if (s.kind === 'orbit') {
        const a = s.ph + t * s.w;
        _p.set(Math.cos(a) * s.r, (PR.cy || 0) + s.y + Math.sin(t * .2 + s.ph) * .1, Math.sin(a) * s.r);
        _d.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(Math.sign(s.w));
      } else {
        s.t += dt / s.dur;
        if (s.t > 1) { Object.assign(s, laneShip(s.kind)); s.t = 0; }
        const e = s.kind === 'lane' ? 1 - Math.pow(1 - s.t, 1.6) : s.t;
        _p.copy(s.a).lerp(s.b, e);
        _d.copy(s.b).sub(s.a).normalize();
      }
      _q.setFromUnitVectors(_z, _d); _s.setScalar(s.size); _m.compose(_p, _q, _s);
      traffic.setMatrixAt(i, _m);
      _b.copy(_p).addScaledVector(_d, -0.62 * s.size);
      engPos[i * 3] = _b.x; engPos[i * 3 + 1] = _b.y; engPos[i * 3 + 2] = _b.z;
      engSize[i] = s.size * 0.6 * (0.9 + 0.1 * Math.sin(t * 20 + i));
    });
    traffic.instanceMatrix.needsUpdate = true;
    engGeo.attributes.position.needsUpdate = true; engGeo.attributes.aSize.needsUpdate = true;
  }

  /* ── nuages galactiques autour de la station : bancs de gaz et volutes proches qui dérivent ── */
  const cloudGroup = new THREE.Group();
  const CY = PR.cy || 0;   // 22/10 — hauteur du centre de la station (scène) : nuages, débris, océan et ronde centrés dessus (optionnel)
  cloudGroup.position.y = CY;
  scene.add(cloudGroup);
  for (let i = 0; i < (LITE ? 16 : 30); i++) {
    const near = i < (LITE ? 9 : 18), t = rand();
    const type = near ? (t < 0.45 ? 'dust' : t < 0.9 ? 'gas' : 'glow') : (t < 0.35 ? 'dust' : t < 0.8 ? 'gas' : 'glow');
    const base = near ? (type === 'glow' ? .06 : .10 + rand() * .12) : (type === 'glow' ? .10 + rand() * .12 : .22 + rand() * .25);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: CLOUD_TEX[(rand() * 4) | 0], transparent: true, depthWrite: false, fog: false, opacity: base,
      color: type === 'dust' ? pick(CLOUD_DUST) : type === 'gas' ? pick(CLOUD_GAS) : pick(CLOUD_GLOW),
      blending: type === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    sp.material.rotation = rand() * Math.PI * 2;
    const C = PR.cloud, sz = near ? C.nearSize : C.farSize, rr = near ? C.nearR : C.farR, yy = near ? C.nearY : C.farY;
    const size = sz[0] + rand() * sz[1];
    sp.scale.set(size, size * (0.55 + rand() * 0.35), 1);
    sp.userData = { base, a: rand() * Math.PI * 2, r: rr[0] + rand() * rr[1], y: yy[0] + rand() * yy[1], w: (rand() - .5) * C.w };
    cloudGroup.add(sp);
  }
  if (PR.mist) {   // brume dans la station : sprites testés en profondeur contre la coque, ils voilent des pans entiers
    const M = PR.mist;
    for (let i = 0; i < (LITE ? M.nLite : M.n); i++) {
      const base = M.op[0] + rand() * M.op[1];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: CLOUD_TEX[(rand() * 4) | 0], transparent: true, depthWrite: false, fog: false, opacity: base, color: pick(M.col) }));
      sp.material.rotation = rand() * Math.PI * 2;
      const size = M.size[0] + rand() * M.size[1];
      sp.scale.set(size * 1.6, size * (0.45 + rand() * 0.3), 1);
      sp.userData = { base, a: rand() * Math.PI * 2, r: M.r[0] + rand() * M.r[1], y: M.y[0] + rand() * M.y[1], w: (rand() - .5) * 0.02, mist: 1 };
      cloudGroup.add(sp);
    }
  }
  // 19/10 — champ glaciaire (Refuge de Brest) : icosaèdres déformés instanciés, givre pâle ; gros blocs au loin, poussière fine devant
  let iceMesh = null;
  const ICE = [];
  if (PR.ice) {
    // 22/10 — réglages optionnels (débris de roche, éclats de chrome…) : détail, matière, rayons, tailles, remontée
    const IC = Object.assign({ det: 0, rough: 0.34, metal: 0.0, env: 1.0, bigR: [30, 40], smallR: [11, 30], bigY: 30, smallY: 22, bigS: [0.6, 1.6], smallS: [0.03, 0.35] }, PR.ice), n = LITE ? IC.nLite : IC.n;
    const g = new THREE.IcosahedronGeometry(1, IC.det), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const k = 0.7 + rand() * 0.6; pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k * 0.8, pa.getZ(i) * k * 1.3); }
    g.computeVertexNormals();
    iceMesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: IC.color, emissive: IC.emissive, roughness: IC.rough, metalness: IC.metal, envMapIntensity: IC.env, flatShading: true }), n);
    iceMesh.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      const big = i < IC.big, a = rand() * Math.PI * 2, r = big ? IC.bigR[0] + rand() * IC.bigR[1] : IC.smallR[0] + rand() * IC.smallR[1];
      ICE.push({ p: new THREE.Vector3(Math.cos(a) * r, (rand() - .5) * (big ? IC.bigY : IC.smallY), Math.sin(a) * r),
        s: big ? IC.bigS[0] + rand() * IC.bigS[1] : IC.smallS[0] + Math.pow(rand(), 3) * IC.smallS[1],
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6)),
        w: new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).normalize(), sp: (rand() - .5) * 0.15, dr: 0.02 + rand() * 0.04 });
    }
    iceMesh.position.y = CY;
    scene.add(iceMesh);
  }
  const _iq = new THREE.Quaternion(), _im = new THREE.Matrix4(), _is = new THREE.Vector3();
  function updateIce(t, dt) {
    ICE.forEach((o, i) => {
      if (PR.ice.rise) { o.p.y += o.dr * dt * 0.5; if (o.p.y > PR.ice.rise) o.p.y -= 2 * PR.ice.rise; }   // tout remonte lentement, comme dans l'eau
      else { o.p.x += o.dr * dt * 0.6; if (o.p.x > 60) o.p.x -= 120; }   // dérive lente du champ
      _iq.setFromAxisAngle(o.w, t * o.sp).multiply(o.q); _is.setScalar(o.s);
      _im.compose(o.p, _iq, _is); iceMesh.setMatrixAt(i, _im);
    });
    iceMesh.instanceMatrix.needsUpdate = true;
  }
  // 22/10 — l'océan stellaire (optionnel, PR.aqua) : plancton qui luit, rais de lumière tombant de la « surface »,
  // bulles qui montent, méduses qui pulsent ; tout en points et cônes additifs, sans ombre ni profondeur écrite
  const AQ = PR.aqua ? Object.assign({ motes: 900, rays: 9, bubbles: 260, jellies: 7, jellyR: [13, 16], jellyS: [0.6, 1.1], lite: 0.4, y: 0 }, PR.aqua) : null;
  let aqua = null;
  if (AQ) {
    const nk = (n) => Math.round(n * (LITE ? AQ.lite : MOBILE ? 0.7 : 1));
    const scaleU = { value: H() * renderer.getPixelRatio() }, tU = { value: 0 };
    const grp = new THREE.Group(); grp.position.y = CY + AQ.y; scene.add(grp);
    const pts = (n, R, Y, extra) => { const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) { const a = rand() * Math.PI * 2, r = R[0] + Math.pow(rand(), R[2]) * R[1]; pos.set([Math.cos(a) * r, (rand() - .5) * Y, Math.sin(a) * r], i * 3); ph[i] = rand() * 6.28; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); return g; };
    const motes = new THREE.Points(pts(nk(AQ.motes), [4, 26, 0.7], 26), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: tU, uScale: scaleU },
      vertexShader: `attribute float aPh; uniform float uT; uniform float uScale; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y + uT * 0.08 + 13.0, 26.0) - 13.0; p.x += sin(uT * .3 + aPh) * .15;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uT * 1.3 + aPh * 3.0), 4.0);
          gl_PointSize = clamp(0.05 * uScale / -mv.z, 1.0, 6.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
        gl_FragColor = vec4(vec3(.35, .85, 1.0) * vA * (1.0 - d * 2.0), 1.0); }` }));
    motes.frustumCulled = false; grp.add(motes);
    const rayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uT: tU },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main(){ vY = uv.y; vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uT; varying float vY; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main(){ float edge = pow(abs(dot(vN, vV)), 1.6);
          float flick = .65 + .35 * sin(vUv.x * 40.0 + uT * .7) * sin(vUv.x * 17.0 - uT * .4);
          float a = edge * smoothstep(0.0, .35, vY) * smoothstep(1.0, .55, vY) * flick * .24;
          gl_FragColor = vec4(vec3(.55, .95, .95) * a, a); }` });
    const RAYS = [];
    for (let i = 0; i < nk(AQ.rays); i++) {
      const r0 = 2.5 + rand() * 3.5, r1 = r0 * (2.0 + rand() * 1.2), L = 70 + rand() * 30;
      const rm = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, L, 24, 1, true), rayMat); rm.frustumCulled = false;
      const a = rand() * Math.PI * 2, rr = 2 + rand() * 16;
      rm.position.set(Math.cos(a) * rr - 3, 30 - L * 0.5, Math.sin(a) * rr - 2);
      rm.rotation.set((rand() - .5) * .35 + .22, 0, (rand() - .5) * .35 - .2);
      rm.userData = { ph: rand() * 6, w: .05 + rand() * .08 }; grp.add(rm); RAYS.push(rm);
    }
    const bubbles = new THREE.Points(pts(nk(AQ.bubbles), [3, 24, 0.6], 30), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: tU, uScale: scaleU },
      vertexShader: `attribute float aPh; uniform float uT; uniform float uScale;
        void main(){ vec3 p = position; float sp = .25 + .2 * fract(aPh * 7.3); p.y = mod(p.y + uT * sp + 15.0, 30.0) - 15.0;
          p.x += sin(uT * 1.1 + aPh * 3.0) * .25; p.z += cos(uT * .9 + aPh * 2.0) * .25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp((.08 + .1 * fract(aPh * 3.1)) * uScale / -mv.z, 1.5, 14.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `void main(){ float d = length(gl_PointCoord - .5) * 2.0; if (d > 1.0) discard;
        float ring = smoothstep(.62, .9, d) * (1.0 - smoothstep(.9, 1.0, d)) + .12 * (1.0 - d) + .6 * smoothstep(.25, .0, length(gl_PointCoord - vec2(.35, .35)));
        gl_FragColor = vec4(vec3(.6, .95, 1.0) * ring * .55, 1.0); }` }));
    bubbles.frustumCulled = false; grp.add(bubbles);
    const JELLY = [], bellGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), coreGeo = new THREE.SphereGeometry(.35, 12, 8);
    for (let i = 0; i < nk(AQ.jellies); i++) {
      const col = [0x5ff0ff, 0x8ab8ff, 0xc890ff, 0x6affd8][i % 4], jg = new THREE.Group();
      const bell = new THREE.Mesh(bellGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uCol: { value: new THREE.Color(col) }, uP: { value: 0 }, uF: { value: 1 } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
          void main(){ vY = position.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uP; uniform float uF; varying vec3 vN; varying vec3 vV; varying float vY;
          void main(){ float rim = pow(1.0 - abs(dot(vN, vV)), 2.2); float a = (.03 + .6 * rim) * (.7 + .3 * uP) * uF;
            float band = .5 + .5 * sin(vY * 22.0); a *= .8 + .35 * band; gl_FragColor = vec4(uCol * a, a); }` }));
      const inner = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }));
      inner.position.y = .1;
      const NTn = 10, NS = 14, tpos = new Float32Array(NTn * NS * 2 * 3), tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
      const tent = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false }));
      tent.frustumCulled = false; jg.add(bell, inner, tent);
      jg.scale.setScalar(AQ.jellyS[0] + rand() * AQ.jellyS[1]);
      const a = rand() * Math.PI * 2, r = AQ.jellyR[0] + rand() * AQ.jellyR[1], y = -8 + rand() * 16;
      jg.userData = { bell, inner, tent, tpos, NT: NTn, NS, ph: rand() * 6, sp: .5 + rand() * .4, a, r, y, len: 2.2 + rand() * 1.6 };
      grp.add(jg); JELLY.push(jg);
    }
    aqua = { scaleU, update(t, dt) {
      tU.value = t;
      for (const rm of RAYS) rm.rotation.y = Math.sin(t * rm.userData.w + rm.userData.ph) * .25;
      for (const jg of JELLY) {
        const u = jg.userData, ph = t * u.sp + u.ph, pulse = Math.pow(.5 + .5 * Math.sin(ph * 2.0), 2.0);
        u.bell.scale.set(1 + .14 * pulse, 1 - .18 * pulse, 1 + .14 * pulse);
        const dj = _cp.copy(jg.position).add(grp.position).distanceTo(camera.position), dc = camera.position.distanceTo(controls.target);
        const fade = sstep(0.55 * dc, 1.05 * dc, dj) * sstep(4, 8, dj);   // s'efface entre la caméra et la station : elle ne masque jamais le sujet
        jg.visible = fade > 0.01;
        u.bell.material.uniforms.uP.value = pulse; u.bell.material.uniforms.uF.value = fade; u.inner.material.opacity = (.12 + .22 * pulse) * fade; u.tent.material.opacity = .45 * fade;
        u.y += dt * (.05 + .25 * pulse); if (u.y > 14) u.y = -14;   // elle monte par à-coups, à chaque contraction
        u.a += dt * .008;
        jg.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
        jg.rotation.z = Math.sin(ph * .3) * .15; jg.rotation.x = Math.cos(ph * .27) * .12;
        let k = 0;
        for (let i = 0; i < u.NT; i++) {
          const ang = i / u.NT * Math.PI * 2, rx = Math.cos(ang) * .7, rz = Math.sin(ang) * .7;
          let px = rx, py = -.05, pz = rz;
          for (let j = 0; j < u.NS; j++) {
            const f = (j + 1) / u.NS, y2 = -.05 - f * u.len, sw = Math.sin(ph * 1.3 - f * 5.0 + i) * .28 * f;
            const nx = rx * (1 - .5 * f) + sw * Math.cos(ang + 1.3), nz = rz * (1 - .5 * f) + sw * Math.sin(ang + 1.3);
            u.tpos[k] = px; u.tpos[k + 1] = py; u.tpos[k + 2] = pz; u.tpos[k + 3] = nx; u.tpos[k + 4] = y2; u.tpos[k + 5] = nz; k += 6; px = nx; py = y2; pz = nz;
          }
        }
        u.tent.geometry.attributes.position.needsUpdate = true;
      }
    } };
  }
  const _cp = new THREE.Vector3();
  function updateClouds(dt) {
    for (const sp of cloudGroup.children) {
      const u = sp.userData;
      u.a += u.w * dt;
      sp.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
      _cp.copy(sp.position); _cp.y += CY;
      sp.material.opacity = u.base * (u.mist ? sstep(2.0, 7, _cp.distanceTo(camera.position)) : sstep(3, 11, _cp.distanceTo(camera.position)));
    }
  }

  /* ── caméra : deux cadrages ── */
  const P = (x, y, z) => new THREE.Vector3(x * S, z * S, -y * S);   // repère Blender (m) -> scène
  // le bar : sur l'anneau à −24°, façade tournée vers le noyau ; on le regarde depuis l'intérieur de l'anneau, un peu en surplomb
  const VIEWS = {
    port: () => { const T = new THREE.Vector3(...PR.target); return { target: T, pos: T.clone().addScaledVector(CAM_DIR, fitDistance()), min: PR.minDist, max: fitDistance() * 1.6, auto: 0.22 }; },
    bar: () => { fitDistance(); const B = opts.barShot || PR.barShot; const T = P(...B.t); return { target: T, pos: P(...B.p), min: 1.2, max: PR.barMax, auto: 0.08, sway: 0.35 }; },
    // 15/10 — le dock : au bout d'un bras d'amarrage, ton tanker à quai sous la flèche
    dock: () => { fitDistance(); const B = opts.dockShot || PR.dockShot; const T = P(...B.t); return { target: T, pos: P(...B.p), min: 1.0, max: PR.dockMax, auto: 0.06, sway: 0.6 }; },
  };
  const BAR_AT = P(...PR.barAt);
  let view = VIEWS[opts.view] ? opts.view : 'port';
  const coreObjs = [];   // 16/10 — le noyau s'efface en vue « bar » pour dégager la façade
  let coreA = 1;
  const syncCore = () => {};   // le noyau s'efface au dernier moment (voir la boucle)
  function fadeCore(dt, t) {
    if (!coreObjs.length) return;
    const late = !move || (t - move.t0) / move.dur > 0.88;
    const want = (NT.hideCoreAtBar && view === 'bar' && late) ? 0 : 1;
    if (coreA === want) return;
    coreA = want > coreA ? Math.min(1, coreA + dt * 3) : Math.max(0, coreA - dt * 2.5);
    for (const o of coreObjs) {
      o.visible = coreA > 0.01;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { m.transparent = coreA < 1; m.opacity = coreA; m.depthWrite = coreA > 0.6; }
    }
  }
  let shot = VIEWS[view]();
  const controls = new MapControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enablePan = false; controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.9;
  controls.minPolarAngle = Math.PI * 0.08; controls.maxPolarAngle = Math.PI * 0.9;
  controls.enabled = false;
  // au bar, on reste devant la façade : l'orbite ne fait que se balancer de part et d'autre (sinon elle passerait dans la tour)
  const applyLimits = () => {
    controls.minDistance = shot.min; controls.maxDistance = shot.max; controls.autoRotateSpeed = shot.auto;
    if (shot.sway) { const az = Math.atan2(shot.pos.x - shot.target.x, shot.pos.z - shot.target.z); controls.minAzimuthAngle = az - shot.sway; controls.maxAzimuthAngle = az + shot.sway; }
    else { controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; }
  };
  applyLimits();
  controls.target.copy(shot.target);
  // ouverture : on glisse depuis le large en contournant la flèche est (7,5 s) ; sinon on est déjà en place
  const fit0 = fitDistance();
  const INTRO_T = PR.introTarget ? new THREE.Vector3(...PR.introTarget) : null;   // 16/10 — l'approche vise le cœur de la station, puis glisse vers le cadrage final
  const introFrom = (INTRO_T && view === 'port' ? INTRO_T : shot.target).clone().addScaledVector(new THREE.Vector3(...(PR.introDir || [0.94, -0.66, 0.10])).normalize(), fit0 * 3.1)   // on remonte depuis les profondeurs de la nébuleuse;
  let move = null;   // { from: {pos, target}, to: shot, t0, dur, spherical }
  let interactive = !!opts.interactive, idleTimer = null;
  camera.position.copy(shot.pos); camera.lookAt(shot.target);
  if (opts.intro && !REDUCED && view === 'port') { camera.position.copy(introFrom); if (INTRO_T) { controls.target.copy(INTRO_T); camera.lookAt(INTRO_T); } }
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); if (opts.onGesture) opts.onGesture(); });
  controls.addEventListener('end', () => { clearTimeout(idleTimer); if (!REDUCED) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 6000); });
  const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function startMove(to, dur, spherical) {
    move = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: clock.elapsedTime, dur, spherical };
    controls.enabled = false; controls.autoRotate = false;
  }
  function updateMove(t) {
    if (!move) return;
    const k = Math.min(1, (t - move.t0) / move.dur), e = move.spherical ? 1 - Math.pow(1 - k, 3) : ease(k);
    const tgt = move.from.target.clone().lerp(move.to.target, e);
    if (move.spherical) {   // approche : arc autour de la cible, la tour se lève dans le cadre
      const s0 = new THREE.Spherical().setFromVector3(move.from.pos.clone().sub(move.to.target)), s1 = new THREE.Spherical().setFromVector3(move.to.pos.clone().sub(move.to.target));
      let dth = s1.theta - s0.theta; if (dth > Math.PI) dth -= 2 * Math.PI; if (dth < -Math.PI) dth += 2 * Math.PI;
      camera.position.copy(tgt).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(THREE.MathUtils.lerp(s0.radius, s1.radius, e), THREE.MathUtils.lerp(s0.phi, s1.phi, e), s0.theta + dth * e)));
    } else {   // changement de cadrage : on passe au-dessus, sans traverser la coque
      const p = move.from.pos.clone().lerp(move.to.pos, e);
      p.y += Math.sin(Math.PI * e) * move.from.pos.distanceTo(move.to.pos) * 0.25;
      camera.position.copy(p);
    }
    controls.target.copy(tgt);
    camera.lookAt(tgt);
    if (k >= 1) {
      move = null; controls.enabled = interactive; controls.autoRotate = !REDUCED;
      if (opts.onSettled) opts.onSettled(view);
    }
  }
  renderer.domElement.addEventListener('pointerdown', () => { if (move && move.spherical && interactive) { move = null; controls.enabled = true; } });

  /* ── post-traitement : fond, station, bloom (pas de GTAO sur mobile) ── */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(bgScene, camera));
  const mainPass = new RenderPass(scene, camera); mainPass.clear = false; composer.addPass(mainPass);
  const BLOOM = NT.bloom || [0.85, 0.5, 1.0];
  const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), BLOOM[0], BLOOM[1], BLOOM[2]);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(W(), H());
  const ro = new ResizeObserver(() => {
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H()); composer.setSize(W(), H()); bloom.resolution.set(W() / 2, H() / 2);
    engMat.uniforms.uScale.value = H() * renderer.getPixelRatio(); if (aqua) aqua.scaleU.value = engMat.uniforms.uScale.value;
    shot = VIEWS[view](); applyLimits();
  });
  ro.observe(container);

  /* ── chargement ── */
  const navMats = [], beaconMats = [], breatheMats = [];
  let barLight = null;
  let ready = false;
  const loader = new GLTFLoader();
  if (loader.setMeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(opts.url, (gltf) => {
    if (!alive) return;
    const m = gltf.scene;
    m.updateMatrixWorld(true);
    {   // 16/10 — géométries partagées (tours, forteresses dupliquées) : une copie par objet AVANT d'y cuire chaque transformation
      const seen = new Set();
      m.traverse(o => { if (!o.isMesh) return; if (seen.has(o.geometry)) o.geometry = o.geometry.clone(); else seen.add(o.geometry); });
    }
    m.traverse(o => {
      if (!o.isMesh) return;
      // positions et normales quantifiées (KHR_mesh_quantization) : remises en flottants avant d'y cuire la transformation
      const g = o.geometry;
      for (const name of ['position', 'normal']) {
        const a = g.attributes[name];
        if (!a || (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute)) continue;
        const f = new Float32Array(a.count * 3);
        for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
        g.setAttribute(name, new THREE.BufferAttribute(f, 3));
      }
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingSphere();
    });
    m.traverse(o => { if (o !== m) { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); } });
    m.scale.setScalar(S);
    if (PR.phys) physSwap(m);
    m.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const emissiveOnly = mats.every(mt => GLOW[mt.name]);
      o.castShadow = !emissiveOnly && !LITE; o.receiveShadow = !LITE;
      for (const mat of mats) {
        if (GLOSS[mat.name]) { mat.roughness = GLOSS[mat.name][0]; mat.metalness = GLOSS[mat.name][1]; mat.envMapIntensity = GLOSS_ENV * (NT.albedo ? 0.5 : 1);
          if (NT.hull && !mat.userData.nh) { mat.userData.nh = 1; mat.color.multiplyScalar(NT.hull * (NT.rock && /ROCK/.test(mat.name) ? NT.rock : 1)); } }   // 16/10 — coques crème/grises assombries la nuit (fini l'effet plastique)
        else if (mat.map) { mat.envMapIntensity = 0.22 * NT.env; mat.metalness = Math.min(mat.metalness, 0.3); mat.roughness = Math.max(mat.roughness, 0.9); if (NT.albedo) { mat.roughness = 1.0; mat.metalness = Math.min(mat.metalness, 0.15); }   /* matière qui boit la lumière : presque noire, sans reflet */ if (!mat.userData.nt) { mat.userData.nt = 1; if (mat.emissiveMap) mat.emissiveIntensity *= NT.tex; if (NT.albedo) mat.color.multiplyScalar(NT.albedo); } }   // 16/10 — pièces texturées (noyau de la Couronne) : reflets retenus comme le reste
        if (PR.rockLift && mat.name.startsWith('M_SC_ROCK') && !mat.userData.lift) { mat.userData.lift = 1; mat.color.multiplyScalar(PR.rockLift); }
        if (/_GLASS$/.test(mat.name) && !mat.userData.phys) { mat.envMapIntensity = 0.6; mat.color.setRGB(...PR.glass); }
        if (PR.fix) PR.fix(mat);   // 19/10 — retouches propres à une station (ivoire assombri du Refuge…)
        if (!GLOW[mat.name] && !mat.map && mat.emissive && mat.emissiveIntensity > 0 && !mat.userData.ng) { mat.userData.ng = 1; mat.emissiveIntensity *= NT.glow; }   // néons, enseigne, salon VIP : sans éblouir
        const look = LOOK[mat.name];
        if (look && !mat.userData.dc) { mat.userData.dc = 1; premium(mat, look); }
        if (GLOW[mat.name]) {
          const c = new THREE.Color(GLOW_COLOR[mat.name]);
          mat.color.copy(c).multiplyScalar(.6); mat.emissive.copy(c); mat.emissiveIntensity = GLOW[mat.name] * NT.glow;
          mat.roughness = .6; mat.metalness = 0; mat.side = THREE.DoubleSide; mat.fog = true;
          if (PR.nav(mat.name) && !navMats.includes(mat)) navMats.push(mat);
          if (mat.name === PR.beacon && !beaconMats.includes(mat)) beaconMats.push(mat);
          if (PR.breathe && PR.breathe[mat.name] && !breatheMats.includes(mat)) breatheMats.push(mat);
        }
      }
    });
    m.traverse(o => { if (o.isMesh && /^DC_core/.test(o.name + ' ' + (o.parent ? o.parent.name : '')) ) coreObjs.push(o); });
    m.traverse(o => { if (o.isMesh && !coreObjs.includes(o) && o.parent && /DC_core/.test(o.parent.name)) coreObjs.push(o); });
    syncCore();
    station.add(m);
    const L = (c, i, d, v) => glowLight(c, i, d, v.x, v.y, v.z);
    const hv = (v, s, c, p) => halo(v.x, v.y, v.z, s, c, p);
    barLight = PR.lights(L, hv, P);
    const barLight0 = barLight ? barLight.intensity : 0; barLight && (barLight.userData.i0 = barLight0);
    ready = true;
    if (opts.tanker) loadTanker();
    loadLamps();
    if (opts.intro && !REDUCED && view === 'port') startMove(shot, opts.introDur || 9.0, true);
    else { controls.enabled = interactive; controls.autoRotate = !REDUCED; }
    if (opts.onReady) opts.onReady();
  }, (ev) => { if (opts.onProgress && ev.total) opts.onProgress(ev.loaded / ev.total); },
  (err) => { console.warn('[Station3D]', err); if (opts.onError) opts.onError(err); });

  /* ── 16/10 — lanternes : poteaux, globes, lueurs et quelques vrais feux qui éclairent les ponts ── */
  const lampLights = [];
  let lampGlow = null;
  function updateLamps(t) {
    for (let i = 0; i < lampLights.length; i++) { const l = lampLights[i];
      l.intensity = l.userData.i0 * (0.82 + 0.1 * Math.sin(t * 7.1 + i * 2.3) + 0.08 * Math.sin(t * 13.7 + i)); }
    if (lampGlow) lampGlow.material.opacity = 0.78 + 0.06 * Math.sin(t * 5.3);
  }
  function loadLamps() {
    const LP = PR.lamps; if (!LP) return;
    fetch(LP.url).then(r => r.json()).then(J => {
      if (!alive) return;
      const n = J.lamps.length, m4 = new THREE.Matrix4();
      if (n) {
      const postG = new THREE.CylinderGeometry(0.25 * S, 0.35 * S, LP.post * S, 6); postG.translate(0, LP.post * S / 2, 0);
      const globeG = new THREE.SphereGeometry(LP.lantern * S, 10, 8);
      const posts = new THREE.InstancedMesh(postG, new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.8, metalness: 0.3 }), n);
      const globes = new THREE.InstancedMesh(globeG, new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xffa040, emissiveIntensity: 3.2, roughness: 0.5 }), n);
      const gp = new Float32Array(n * 3);
      J.lamps.forEach(([x, y, z], i) => {
        const b = P(x, y, z);
        m4.makeTranslation(b.x, b.y, b.z); posts.setMatrixAt(i, m4);
        m4.makeTranslation(b.x, b.y + LP.post * S, b.z); globes.setMatrixAt(i, m4);
        gp.set([b.x, b.y + LP.post * S, b.z], i * 3);
      });
      station.add(posts, globes);
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      lampGlow = new THREE.Points(gg, new THREE.PointsMaterial({ map: haloTex, color: 0xff9a48, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      station.add(lampGlow);
      }
      const nL = LITE ? LP.lightsLite : LP.lightsMax;
      const spots = J.lights.slice(0, nL);   // 16/10 — comme au bar : des nappes de lumière chaude, réparties sur toute la station
      while (spots.length < nL) {
        let best = null, bd = -1;
        for (const q of J.lamps) { if (q[2] > 260) continue; let d = 1e9; for (const s2 of spots) d = Math.min(d, Math.hypot(q[0] - s2[0], q[1] - s2[1])); if (Math.hypot(q[0] - 470, q[1] + 230) < 160) d = 0; if (d > bd) { bd = d; best = q; } }
        if (!best) break; spots.push(best);
      }
      if (!LITE && LP.under) for (const u of LP.under) spots.push([u[0], u[1], u[2] - (LP.lift || 0)]);   // lueur pâle sous l'anneau et le noyau (vue d'en dessous)
      spots.forEach(([x, y, z]) => {
        const b = P(x, y, z + (LP.lift ?? (LP.post + 6)));
        const l = new THREE.PointLight(LP.light[0], LP.light[1], LP.light[2], 1.6); l.position.copy(b); l.userData.i0 = LP.light[1];
        station.add(l); lampLights.push(l);
      });
    }).catch(e => console.warn('[Station3D] lanternes', e));
  }

  /* ── le tanker du joueur, amarré (vue « dock ») ── */
  let tankerObj = null;
  function loadTanker() {
    const T = Object.assign({}, PR.tankerAt, opts.tankerAt || {});
    new GLTFLoader().load(typeof opts.tanker === 'string' ? opts.tanker : 'assets/3d/sb_tk07_lod.glb', (g) => {
      if (!alive) return;
      const t = g.scene;
      t.scale.setScalar(S * (T.scale || 1));
      t.position.copy(P(...T.pos));
      t.rotation.y = (T.rotZ || 0) * Math.PI / 180;
      t.traverse(o => { if (o.isMesh) { o.castShadow = !LITE; o.receiveShadow = !LITE; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.envMapIntensity !== undefined) m.envMapIntensity = 0.35; if (m.emissive) m.emissiveIntensity = Math.min(m.emissiveIntensity || 0, 0.6); } } });
      station.add(t); tankerObj = t;
    }, undefined, (e) => console.warn('[Station3D] tanker', e));
  }

  /* ── gestes relayés (fiche par-dessus) : lissés, avec un peu d'élan, comme les fiches de vaisseaux ── */
  const pend = { x: 0, y: 0, z: 0 };
  function applyPend(dt) {
    if (Math.abs(pend.x) + Math.abs(pend.y) < 0.05 && Math.abs(pend.z) < 1e-4) { pend.x = pend.y = pend.z = 0; return; }
    const f = 1 - Math.exp(-dt * 7.0), ax = pend.x * f, ay = pend.y * f, az = pend.z * f;
    pend.x -= ax; pend.y -= ay; pend.z -= az;
    const off = camera.position.clone().sub(controls.target), sp = new THREE.Spherical().setFromVector3(off);
    sp.theta -= ax * 0.006; sp.phi = THREE.MathUtils.clamp(sp.phi - ay * 0.006, controls.minPolarAngle, controls.maxPolarAngle);
    if (isFinite(controls.minAzimuthAngle)) sp.theta = THREE.MathUtils.clamp(sp.theta, controls.minAzimuthAngle, controls.maxAzimuthAngle);
    sp.radius = THREE.MathUtils.clamp(sp.radius * Math.exp(az), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp)); camera.lookAt(controls.target);
  }

  /* ── boucle (en pause hors écran) ── */
  const clock = new THREE.Clock();
  let swayFlip = 0;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (document.hidden || !container.isConnected || !container.getClientRects().length) return;   // hors écran : en pause
    updateTraffic(t, dt);
    updateClouds(dt);
    for (const m of navMats) m.emissiveIntensity = NT.glow * (PR.navPulse[0] + PR.navPulse[1] * Math.pow(0.5 + 0.5 * Math.sin(t * PR.navPulse[2] + (m.name.endsWith('GREEN') ? 1.6 : 0)), 3));
    for (const m of beaconMats) m.emissiveIntensity = NT.glow * (4 + 6 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.3), 4));
    for (const m of breatheMats) { const b = PR.breathe[m.name]; m.emissiveIntensity = NT.glow * (b[0] + b[1] * Math.sin(t * b[2])); }
    if (iceMesh) updateIce(t, dt);
    if (aqua) aqua.update(t, dt);
    CAUSTIC_T.value = t;
    for (const h of halos) {
      const k = h.userData.pulse ? 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(t * h.userData.pulse + h.userData.ph), 3) : 0.8 + 0.2 * Math.sin(t * 3 + h.userData.ph);
      h.scale.setScalar(h.userData.size * (0.7 + 0.5 * k)); h.material.opacity = (0.35 + 0.6 * k) * NT.halo;
    }
    if (ready) { if (move) updateMove(t); else { applyPend(dt); controls.update(); } }
    fadeCore(dt, t); updateLamps(t);
    if (shot.sway && controls.autoRotate && !move && t - swayFlip > 2) {   // balancement : on repart dans l'autre sens à la butée
      const az = controls.getAzimuthalAngle();
      if (az < controls.minAzimuthAngle + 0.02 || az > controls.maxAzimuthAngle - 0.02) { controls.autoRotateSpeed = -controls.autoRotateSpeed; swayFlip = t; }
    }
    {   // de près, les néons du bar éblouiraient : bloom et lueur baissent avec la distance au bar
      const near = 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(BAR_AT), 2.5, 9);
      bloom.strength = BLOOM[0] * (1 - 0.59 * near); if (barLight) barLight.intensity = barLight.userData.i0 * (1 - 0.64 * near);
    }
    const d = camera.position.distanceTo(controls.target);
    scene.fog.near = Math.max(0.6, PR.fogK ? d * PR.fogK : d - PR.fog[0]); scene.fog.far = d + PR.fog[1];
    composer.render();
  }
  frame();

  return {
    get view() { return view; },
    setView(v) {
      if (!VIEWS[v] || v === view && !move) return;
      view = v; shot = VIEWS[v](); applyLimits(); syncCore();
      if (ready) startMove(shot, REDUCED ? 0.01 : 2.6, false);
      else { camera.position.copy(shot.pos); controls.target.copy(shot.target); camera.lookAt(shot.target); }
    },
    setInteractive(on) { interactive = !!on; if (!move && ready) controls.enabled = interactive; },
    // 15/10 — gestes venus d'une fiche qui défile par-dessus la 3D (zone libre en haut) : comme les vaisseaux
    begin() { controls.autoRotate = false; clearTimeout(idleTimer); if (move && move.spherical) { move = null; controls.enabled = interactive; } },
    orbit(dx, dy) { if (!move && ready) { pend.x += dx; pend.y += dy; } },
    dolly(k) { if (!move && ready) pend.z += Math.log(k); },
    end() { clearTimeout(idleTimer); if (!REDUCED) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 6000); },
    replayIntro() { if (!ready || REDUCED) return; view = 'port'; shot = VIEWS.port(); applyLimits(); syncCore(); camera.position.copy(introFrom); controls.target.copy(INTRO_T || shot.target); startMove(shot, 9.0, true); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); clearTimeout(idleTimer);
      for (const sc of [scene, bgScene]) sc.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const mt of ms) { if (mt.map) mt.map.dispose(); mt.dispose(); }
      });
      envTex.dispose(); if (studioEnv) studioEnv.dispose(); pmrem.dispose(); skyRT.dispose(); CLOUD_TEX.forEach(t => t.dispose()); composer.dispose && composer.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
function whenReady(cb) {
  if (window.SB3D) return cb();
  const t = setInterval(() => { if (window.SB3D) { clearInterval(t); cb(); } }, 100);
}
window.Station3D = {
  mount(c, o) {
    let h = null, dead = false, pend = [];
    whenReady(() => { if (dead) return; h = mount(c, o); for (const f of pend) f(h); pend = []; });
    const call = (f) => { if (h) f(h); else pend.push(f); };
    return {
      setView(v) { call(x => x.setView(v)); }, setInteractive(on) { call(x => x.setInteractive(on)); }, replayIntro() { call(x => x.replayIntro()); },
      begin() { if (h) h.begin(); }, orbit(dx, dy) { if (h) h.orbit(dx, dy); }, dolly(k) { if (h) h.dolly(k); }, end() { if (h) h.end(); },
      get view() { return h ? h.view : (o && o.view) || 'port'; },
      dispose() { dead = true; pend = []; if (h) h.dispose(); },
    };
  },
};
window.dispatchEvent(new Event('station3d-ready'));
