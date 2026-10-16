/* Starbyte — Station3D : les stations en 3D — The Drifting Crown (port franc pirate) et le Sanctuaire du Linceul des Cendres (bastion impérial), option profile: 'crown' | 'sanctuary'.
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
    glass: [.02, .03, .045], rockLift: 1.45, nav: (n) => n === 'M_SC_LIGHT_RED', beacon: 'M_SC_BEACON', navPulse: [1.6, 3.2, 1.4],
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
  },
};

function mount(container, opts = {}) {
  const PR = PROFILES[opts.profile] || PROFILES.crown;
  const NT = Object.assign({ light: 1, glow: 1, tex: 1, halo: 1, bloom: null, albedo: 0, env: 1, exposure: 1 }, PR.night || {});
  const S = PR.S, GLOSS = PR.GLOSS, GLOW = PR.GLOW, GLOW_COLOR = PR.GLOW_COLOR, LOOK = PR.LOOK;
  const { THREE, GLTFLoader, MapControls, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.SB3D;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LITE = !!(window.SBPerf && window.SBPerf.level >= 2);
  const W = () => Math.max(1, container.clientWidth), H = () => Math.max(1, container.clientHeight);
  let alive = true, raf = 0;

  /* ── moteur ── */
  const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1 : 2));
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

  const CAM_DIR = new THREE.Vector3(0.60, -0.34, 0.72).normalize();   // 3/4 dessous : la station écrase le cadre
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
  const skyRT = new THREE.WebGLCubeRenderTarget(LITE ? 384 : 768, { type: THREE.HalfFloatType, generateMipmaps: false });
  new THREE.CubeCamera(1, 3000, skyRT).update(renderer, skyScene);
  bgScene.background = skyRT.texture;
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
  key.shadow.mapSize.set(2048, 2048);
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
  function premium(mat, p) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCell = { value: new THREE.Vector2(...p.cell) };
      sh.uniforms.uLook = { value: new THREE.Vector4(p.seam, p.depth, p.tint, p.rough) };
      sh.uniforms.uLook2 = { value: new THREE.Vector2(p.grime, p.wear) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vOP; varying vec3 vON;
          uniform vec2 uCell; uniform vec4 uLook; uniform vec2 uLook2;
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
        _p.set(Math.cos(a) * s.r, s.y + Math.sin(t * .2 + s.ph) * .1, Math.sin(a) * s.r);
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
  const _cp = new THREE.Vector3();
  function updateClouds(dt) {
    for (const sp of cloudGroup.children) {
      const u = sp.userData;
      u.a += u.w * dt;
      sp.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
      sp.material.opacity = u.base * (u.mist ? sstep(2.0, 7, _cp.copy(sp.position).distanceTo(camera.position)) : sstep(3, 11, _cp.copy(sp.position).distanceTo(camera.position)));
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
  const introFrom = (INTRO_T && view === 'port' ? INTRO_T : shot.target).clone().addScaledVector(new THREE.Vector3(0.94, -0.66, 0.10).normalize(), fit0 * 3.1)   // on remonte depuis les profondeurs de la nébuleuse;
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
    engMat.uniforms.uScale.value = H() * renderer.getPixelRatio();
    shot = VIEWS[view](); applyLimits();
  });
  ro.observe(container);

  /* ── chargement ── */
  const navMats = [], beaconMats = [];
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
    m.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const emissiveOnly = mats.every(mt => GLOW[mt.name]);
      o.castShadow = !emissiveOnly && !LITE; o.receiveShadow = !LITE;
      for (const mat of mats) {
        if (GLOSS[mat.name]) { mat.roughness = GLOSS[mat.name][0]; mat.metalness = GLOSS[mat.name][1]; mat.envMapIntensity = GLOSS_ENV * (NT.albedo ? 0.5 : 1);
          if (NT.hull && !mat.userData.nh) { mat.userData.nh = 1; mat.color.multiplyScalar(NT.hull); } }   // 16/10 — coques crème/grises assombries la nuit (fini l'effet plastique)
        else if (mat.map) { mat.envMapIntensity = 0.22 * NT.env; mat.metalness = Math.min(mat.metalness, 0.3); mat.roughness = Math.max(mat.roughness, 0.9); if (NT.albedo) { mat.roughness = 1.0; mat.metalness = Math.min(mat.metalness, 0.15); }   /* matière qui boit la lumière : presque noire, sans reflet */ if (!mat.userData.nt) { mat.userData.nt = 1; if (mat.emissiveMap) mat.emissiveIntensity *= NT.tex; if (NT.albedo) mat.color.multiplyScalar(NT.albedo); } }   // 16/10 — pièces texturées (noyau de la Couronne) : reflets retenus comme le reste
        if (PR.rockLift && mat.name.startsWith('M_SC_ROCK') && !mat.userData.lift) { mat.userData.lift = 1; mat.color.multiplyScalar(PR.rockLift); }
        if (/_GLASS$/.test(mat.name)) { mat.envMapIntensity = 0.6; mat.color.setRGB(...PR.glass); }
        if (!GLOW[mat.name] && !mat.map && mat.emissive && mat.emissiveIntensity > 0 && !mat.userData.ng) { mat.userData.ng = 1; mat.emissiveIntensity *= NT.glow; }   // néons, enseigne, salon VIP : sans éblouir
        const look = LOOK[mat.name];
        if (look && !mat.userData.dc) { mat.userData.dc = 1; premium(mat, look); }
        if (GLOW[mat.name]) {
          const c = new THREE.Color(GLOW_COLOR[mat.name]);
          mat.color.copy(c).multiplyScalar(.6); mat.emissive.copy(c); mat.emissiveIntensity = GLOW[mat.name] * NT.glow;
          mat.roughness = .6; mat.metalness = 0; mat.side = THREE.DoubleSide; mat.fog = true;
          if (PR.nav(mat.name) && !navMats.includes(mat)) navMats.push(mat);
          if (mat.name === PR.beacon && !beaconMats.includes(mat)) beaconMats.push(mat);
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
      const nL = LITE ? LP.lightsLite : LP.lightsMax;
      const spots = J.lights.slice(0, nL);   // 16/10 — comme au bar : des nappes de lumière chaude, réparties sur toute la station
      while (spots.length < nL) {
        let best = null, bd = -1;
        for (const q of J.lamps) { if (q[2] > 260) continue; let d = 1e9; for (const s2 of spots) d = Math.min(d, Math.hypot(q[0] - s2[0], q[1] - s2[1])); if (Math.hypot(q[0] - 470, q[1] + 230) < 160) d = 0; if (d > bd) { bd = d; best = q; } }
        if (!best) break; spots.push(best);
      }
      if (!LITE && LP.under) for (const u of LP.under) spots.push([u[0], u[1], u[2] - (LP.lift || 0)]);   // lueur pâle sous l'anneau et le noyau (vue d'en dessous)
      spots.forEach(([x, y, z]) => {
        const b = P(x, y, z + (LP.lift || LP.post + 6));
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
    scene.fog.near = Math.max(0.6, d - PR.fog[0]); scene.fog.far = d + PR.fog[1];
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
      envTex.dispose(); pmrem.dispose(); skyRT.dispose(); CLOUD_TEX.forEach(t => t.dispose()); composer.dispose && composer.dispose();
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
