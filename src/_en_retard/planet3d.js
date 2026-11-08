/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Planète 3D (Three.js) + boucle fondatrice « Antenne »
   Septembre 2026 · v1.0

   Source : sb-build/src/planet3d.js → bundle minifié assets/planet3d.js (esbuild).
   Chargé en <script type="module"> APRÈS le script principal : il lit l'état
   global du jeu (G, getStateKey, onHexClick, renderInfoCard, saveGame, toast…)
   et remplace la carte SVG quand WebGL est disponible. En cas d'échec, la
   carte SVG reste affichée et le jeu fonctionne comme avant.

   Points de branchement dans index.html (tous commentés « PLANET3D ») :
     1. .mapwrap          → conteneur #planet3d
     2. drawHexMap()      → délègue à Planet3D.sync() quand la 3D est prête
     3. renderInfoCard()  → délègue à SBAntenna.renderCard() pour la parcelle antenne
     4. renderM3Bars()    → affiche les besoins de l'antenne pendant le match-3
     5. saveGame/loadGame → persistance de G.antenna
     6. fin de <body>     → chargement de ce module
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Three.js partagé avec le plateau 3D du match-3 (assets/match3.js ne l'embarque pas)
// 10/10 : MapControls partagé avec la carte du Centre de prospection (même déplacement que la planète)
window.SB3D = { THREE, GLTFLoader, MapControls, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass };

const ASSETS = 'assets/3d/';
const SQ3 = Math.sqrt(3);
const PARCEL_TOP = 0.36;      // hauteur du dessus des dalles (m)
const HEX_INR = 24;           // rayon inscrit utile d'une parcelle (m)
const UI_BLUE = '#5fa8e8';    // bleu « prospection » (le cyan UI reste réservé à la navigation)

/* ─────────────────────────────── Utilitaires ─────────────────────────────── */

// Parcelle i (grille 5×5, lignes impaires décalées à droite) → position monde (Y en haut)
function parcelPos(i) {
  const row = Math.floor(i / 5), col = i % 5;
  return new THREE.Vector3((col - 2) * 50 + (row % 2 ? 25 : 0), 0, (row - 2) * 25 * SQ3);
}

// Voisins hexagonaux d'une parcelle (même convention que hexNeighbors du jeu)
function parcelNeighbors(i) {
  const row = Math.floor(i / 5), col = i % 5, odd = row % 2 === 1;
  const c = odd
    ? [[col + 1, row], [col + 1, row - 1], [col, row - 1], [col - 1, row], [col, row + 1], [col + 1, row + 1]]
    : [[col + 1, row], [col, row - 1], [col - 1, row - 1], [col - 1, row], [col - 1, row + 1], [col, row + 1]];
  return c.filter(([x, y]) => x >= 0 && x < 5 && y >= 0 && y < 5).map(([x, y]) => y * 5 + x);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hexNorm(x, z) {   // 0 au centre, 1 au bord (hex pointe en haut)
  const ax = Math.abs(x), az = Math.abs(z);
  return Math.max(ax, ax * 0.5 + az * SQ3 / 2) / HEX_INR;
}

function hasGame() {
  return typeof G !== 'undefined' && G && G.planet && Array.isArray(G.planet.parcels);
}

function stateKeyOf(p) {
  try { return getStateKey(p); } catch (e) { return p.state || 'rocky'; }
}

function say(msg) { if (typeof toast === 'function') toast(msg); }

/* ─────────────────────────────── Matériaux ──────────────────────────────── */
// Les .glb ne portent que les NOMS de matériaux : le rendu est défini ici,
// pour garder la main sur l'éclairage de nuit et les performances mobiles.

function canvasTexture(size, worldSize, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / worldSize, 1 / worldSize);   // les UV sont en mètres
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeTextures() {
  const deck = canvasTexture(256, 12, (g, s) => {
    const n = 4, cell = s / n, rnd = mulberry32(7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 70 + Math.floor(rnd() * 16);
      g.fillStyle = `rgb(${v},${v + 6},${v + 11})`;
      g.fillRect(x * cell, y * cell, cell, cell);
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fillRect(x * cell + 4, y * cell + 4, cell - 8, 2);
    }
    g.strokeStyle = '#121518'; g.lineWidth = 3;
    for (let k = 0; k <= n; k++) {
      g.beginPath(); g.moveTo(k * cell, 0); g.lineTo(k * cell, s); g.stroke();
      g.beginPath(); g.moveTo(0, k * cell); g.lineTo(s, k * cell); g.stroke();
    }
  });

  const soil = canvasTexture(256, 22, (g, s) => {
    const rnd = mulberry32(11);
    g.fillStyle = '#26211a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {                         // grain de terre
      const v = 22 + Math.floor(rnd() * 28);
      g.fillStyle = `rgba(${v + 8},${v + 4},${v},.55)`;
      g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    for (let i = 0; i < 26; i++) {                            // plaques de mousse (sans couture)
      const x = rnd() * s, y = rnd() * s, r = 10 + rnd() * 34;
      for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(58,84,34,.8)'); gr.addColorStop(1, 'rgba(44,64,28,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
      }
    }
  });
  return { deck, soil };
}

// UV planaires (vue de dessus, en mètres) : les meshes Blender n'ont pas d'UV
function ensurePlanarUV(geom) {
  if (geom.attributes.uv) return;
  const pos = geom.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i); }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function makeMaterials(tex) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (hex, intensity, extra = {}) =>
    std({ color: 0x0b0e10, emissive: new THREE.Color(hex), emissiveIntensity: intensity, roughness: 0.4, ...extra });
  const M = {
    MAT_ARMOR_DARK:   std({ color: 0x3e454b, metalness: 0.7,  roughness: 0.45 }),
    MAT_ARMOR_LIGHT:  std({ color: 0x8d959b, metalness: 0.65, roughness: 0.38 }),
    MAT_TRIM_BLACK:   std({ color: 0x15191c, metalness: 0.6,  roughness: 0.5 }),
    MAT_GRATE:        std({ color: 0x1b1f22, metalness: 0.7,  roughness: 0.6 }),
    MAT_METAL_LIGHT:  std({ color: 0xc9ccca, metalness: 0.3,  roughness: 0.4 }),
    MAT_METAL_DARK:   std({ color: 0x2a2f33, metalness: 0.7,  roughness: 0.45 }),
    MAT_CONCRETE:     std({ color: 0x6f6c66, roughness: 0.85 }),
    MAT_DECK:         std({ map: tex.deck, metalness: 0.45, roughness: 0.5 }),
    MAT_SOIL_MOSS:    std({ map: tex.soil, roughness: 0.97 }),
    MAT_GLASS:        std({ color: 0x0e2a36, emissive: 0x3fc8ff, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.08 }),
    MAT_GLASS_WARM:   glow(0xffb35a, 2.0, { color: 0x3a2410 }),
    MAT_GLASS_GREEN:  std({ color: 0x12301a, emissive: 0x6db032, emissiveIntensity: 0.5, transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false }),
    MAT_EMISSIVE_BLUE:     glow(0x3fc8ff, 2.4),
    MAT_EMISSIVE_BLUE_RIM: glow(0x3fc8ff, 1.2),
    MAT_EMISSIVE_CYAN:     glow(0x7cc4ff, 3.0),
    MAT_EMISSIVE_AMBER:    glow(0xf7a53c, 2.8),
    MAT_EMISSIVE_GREEN:    glow(0x7be04a, 3.0),
    MAT_EMISSIVE_OFF:      std({ color: 0x10161c, emissive: 0x3fc8ff, emissiveIntensity: 0.06, roughness: 0.5 }),
    MAT_EMISSIVE_RED:      glow(0xff5a4a, 2.6),
    MAT_SMOKE:             new THREE.MeshStandardMaterial({ color: 0x7a8288, emissive: 0x2a2e32, emissiveIntensity: 0.6, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false }),
    M_FOLIAGE_DARK:  std({ color: 0x1d3a22, roughness: 0.9, flatShading: true }),
    M_FOLIAGE_MID:   std({ color: 0x2b5029, roughness: 0.9, flatShading: true }),
    M_FOLIAGE_LIGHT: std({ color: 0x3a5c29, roughness: 0.9, flatShading: true }),
    M_BARK:          std({ color: 0x33261c, roughness: 0.95, flatShading: true }),
    M_ROCK:          std({ color: 0x44474d, roughness: 0.9, flatShading: true }),
    M_TERRAIN_VC:    std({ vertexColors: true, roughness: 0.96 }),
    M_WATER:         std({ color: 0x08151d, metalness: 0.3, roughness: 0.05 }),
  };
  M.MAT_SOIL_DEPLETED = std({ map: tex.soil, color: 0x7a7a7a, roughness: 0.98 });
  // États des lumières de parcelle
  M.NODE_ON      = M.MAT_EMISSIVE_BLUE;
  M.NODE_PROJECT = glow(0x7cc4ff, 3.4);
  M.NODE_BUILD   = glow(0xf7a53c, 2.8);
  M.NODE_OFF     = M.MAT_EMISSIVE_OFF;
  M.NODE_SEL     = glow(0xcff4ff, 5.0);
  M.HOLO         = new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  return M;
}

// Remplace les matériaux importés par ceux de la table (par nom) et ajoute les UV si besoin
function applyMaterials(root, M) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material && o.material.name;
    const m = M[name] || (name && name.startsWith('MAT_EMISSIVE') ? M.MAT_EMISSIVE_BLUE : null);
    if (m) {
      o.material = m;
      if (m.map) ensurePlanarUV(o.geometry);
    }
  });
}

/* ─────────────────────────────── Planet3D ───────────────────────────────── */

const Planet3D = {
  ready: false,
  failed: false,
  _sig: '',

  async init() {
    try {
      const host = document.getElementById('planet3d');
      if (!host) throw new Error('#planet3d introuvable');
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL indisponible');
      this.host = host;

      // Rendu
      const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.AgXToneMapping;
      r.toneMappingExposure = 1.2;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      this.renderer = r;

      // Scène de nuit
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1622);
      scene.fog = new THREE.Fog(0x0b1622, 520, 1250);
      this.scene = scene;

      scene.add(new THREE.HemisphereLight(0x4d6f99, 0x0b120b, 1.1));
      const moon = new THREE.DirectionalLight(0xa9c4ff, 2.4);
      moon.position.set(150, 240, 170);
      moon.castShadow = true;
      moon.shadow.mapSize.set(2048, 2048);
      const sc = moon.shadow.camera;
      sc.left = -180; sc.right = 180; sc.top = 180; sc.bottom = -180; sc.near = 50; sc.far = 800;
      moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.6;
      scene.add(moon, moon.target);

      // Environnement (reflets des métaux) : ciel nocturne + lune
      scene.environment = this._makeEnv(r);
      scene.environmentIntensity = 0.6;

      // Caméra quasi isométrique (longue focale) + contrôles tactiles pan / zoom
      const cam = new THREE.PerspectiveCamera(28, 1, 5, 3000);
      this.camera = cam;
      const el = THREE.MathUtils.degToRad(48);
      this.camDir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
      const target = new THREE.Vector3(8, 0, 14);
      cam.position.copy(target).addScaledVector(this.camDir, 340);
      cam.lookAt(target);
      const ctl = new MapControls(cam, r.domElement);
      ctl.enableRotate = false;
      ctl.enableDamping = true; ctl.dampingFactor = 0.12;
      ctl.screenSpacePanning = false;
      ctl.minDistance = 130; ctl.maxDistance = 820;
      ctl.zoomToCursor = true;
      ctl.target.copy(target);
      ctl.addEventListener('change', () => {       // rester au-dessus de la colonie
        const t = ctl.target;
        const cx = THREE.MathUtils.clamp(t.x, -130, 150), cz = THREE.MathUtils.clamp(t.z, -110, 120);
        if (cx !== t.x || cz !== t.z) {
          cam.position.x += cx - t.x; cam.position.z += cz - t.z; t.x = cx; t.z = cz;
        }
      });
      this.controls = ctl;

      // Post-traitement : bloom sur les émissifs
      const comp = new EffectComposer(r);
      comp.addPass(new RenderPass(scene, cam));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 1.0);
      comp.addPass(this.bloom);
      comp.addPass(new OutputPass());
      this.composer = comp;

      // Assets
      this.tex = makeTextures();
      this.M = makeMaterials(this.tex);
      const loader = new GLTFLoader();
      const load = (f) => loader.loadAsync(ASSETS + f);
      const [env, kit, cmd, ant, mine, pwr, lab, vegBuf] = await Promise.all([
        load('sb_env.glb'), load('sb_kit.glb'), load('sb_command_t1.glb'), load('sb_antenna_t1.glb'),
        load('sb_mine_t1.glb'), load('sb_power_t1.glb'), load('sb_lab_t1.glb'),
        fetch(ASSETS + 'sb_veg.bin').then((x) => { if (!x.ok) throw new Error('sb_veg.bin ' + x.status); return x.arrayBuffer(); }),
      ]);

      // Décor
      applyMaterials(env.scene, this.M);
      env.scene.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      scene.add(env.scene);

      // Kit (parcelles + végétaux)
      applyMaterials(kit.scene, this.M);
      this.kit = {
        plate: kit.scene.getObjectByName('KIT_PLATE'),
        frame: kit.scene.getObjectByName('KIT_FRAME'),
        nodes: kit.scene.getObjectByName('KIT_NODES'),
        veg: ['VEG_0_CONIFER_K', 'VEG_1_BROADLEAF_K', 'VEG_2_BUSH_K', 'VEG_3_TALLPINE_K', 'VEG_4_ROCK_K', 'VEG_5_PEBBLE_K']
          .map((n) => kit.scene.getObjectByName(n)),
      };
      this.kit.plate.traverse((o) => { if (o.isMesh) ensurePlanarUV(o.geometry); });
      this._buildForest(new Float32Array(vegBuf));

      // Bâtiments (prototypes à cloner)
      const proto = (g, rootName) => {
        const root = g.scene.getObjectByName(rootName) || g.scene;
        applyMaterials(root, this.M);
        this._tuneLights(root);
        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return { root, clips: g.animations || [] };
      };
      this.protos = {
        capital:  proto(cmd, 'SB_COMMAND_T1'),
        antenna:  proto(ant, 'SB_ANTENNA_T1'),
        mine:     proto(mine, 'SB_MINE_T1'),
        centrale: proto(pwr, 'SB_POWER_T1'),
        labo:     proto(lab, 'SB_LAB_T1'),
      };

      // Groupes dynamiques
      this.parcelGroup = new THREE.Group();
      this.buildGroup = new THREE.Group();
      this.decoGroup = new THREE.Group();
      scene.add(this.parcelGroup, this.buildGroup, this.decoGroup);
      this.mixers = [];
      this.smoke = [];
      this.sites = [];
      this._last = performance.now(); this._t = 0;

      // Montage dans la page
      host.innerHTML = '';
      host.appendChild(r.domElement);
      r.domElement.style.display = 'block';
      r.domElement.style.touchAction = 'none';
      this._overlay = document.createElement('div');
      this._overlay.className = 'p3d-overlay';
      host.appendChild(this._overlay);
      this._bindPicking(r.domElement);
      new ResizeObserver(() => this._resize()).observe(host);

      this.ready = true;
      document.querySelector('.mapwrap')?.classList.add('has3d');
      this._resize();
      r.setAnimationLoop(() => this._frame());
      this.sync(true);
      if (typeof renderInfoCard === 'function' && hasGame() && G.selParcel != null) renderInfoCard(G.selParcel);
      console.log('[Planet3D] prêt');
    } catch (e) {
      this.failed = true;
      console.warn('[Planet3D] 3D désactivée, carte SVG conservée :', e);
      document.querySelector('.mapwrap')?.classList.remove('has3d');
    }
  },

  _makeEnv(renderer) {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(100, 32, 16);
    const col = [], top = new THREE.Color(0x1b3148), hor = new THREE.Color(0x32506c), bot = new THREE.Color(0x05080a);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 100;
      const c = y > 0 ? hor.clone().lerp(top, Math.min(1, y * 1.6)) : hor.clone().lerp(bot, Math.min(1, -y * 3));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    envScene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const moonBall = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa9c4ff).multiplyScalar(6) }));
    moonBall.position.set(50, 70, 55);
    envScene.add(moonBall);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(envScene, 0.04);
    pm.dispose();
    return rt.texture;
  },

  // Sur mobile, une seule lumière ponctuelle par bâtiment (la principale)
  _tuneLights(root) {
    const keep = { LT_CC_EYE: 650, LT_MINE_PIT: 700, LT_PWR_CORE: 750, LT_LAB_DOME: 600, LT_ANT_STATUS: 220 };
    const kill = [];
    root.traverse((o) => {
      if (!o.isLight) return;
      let n = o, name = null;
      while (n && !name) { if (keep[n.name] !== undefined) name = n.name; n = n.parent; }
      if (!name) { kill.push(o); return; }
      o.intensity = keep[name]; o.distance = 70; o.decay = 1.6; o.castShadow = false;
    });
    kill.forEach((o) => o.parent && o.parent.remove(o));
  },

  _buildForest(f) {
    const n = f.length / 6;
    const byVar = [[], [], [], [], [], []];
    for (let i = 0; i < n; i++) byVar[f[i * 6 + 5] | 0].push(i);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    byVar.forEach((ids, v) => {
      const proto = this.kit.veg[v];
      if (!proto || !ids.length) return;
      proto.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, ids.length);
        ids.forEach((i, k) => {
          const b = i * 6;
          p.set(f[b], f[b + 2], -f[b + 1]);          // Blender (x, y, z) → Three (x, z, -y)
          q.setFromAxisAngle(up, f[b + 4]);
          s.setScalar(f[b + 3]);
          m.compose(p, q, s);
          im.setMatrixAt(k, m);
        });
        im.instanceMatrix.needsUpdate = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        this.scene.add(im);
      });
    });
  },

  _resize() {
    if (!this.host || !this.renderer) return;
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 420;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  _bindPicking(el) {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    el.addEventListener('pointerdown', (e) => { if (e.isPrimary) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
      down = null;
      if (moved > 8 || dt > 450) return;                 // glisser ou appui long : pas un tap
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects([this.parcelGroup, this.buildGroup], true);
      for (const h of hits) {
        let o = h.object;
        while (o && o.userData.parcel === undefined) o = o.parent;
        if (o) {
          if (typeof onHexClick === 'function') onHexClick(o.userData.parcel);
          // la fiche est sous la carte : on la ramène dans l'écran sur petit téléphone
          setTimeout(() => document.getElementById('planet-info')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
          return;
        }
      }
    });
  },

  _stateOf(i) {
    const ant = SBAntenna.data();
    if (ant && ant.parcel === i) return ant.built ? 'antenna' : 'antenna_project';
    return stateKeyOf(G.planet.parcels[i]);
  },

  // Appelé par drawHexMap() : ne reconstruit que si l'état des parcelles a changé
  sync(force) {
    if (!this.ready || !hasGame()) return;
    const states = G.planet.parcels.map((_, i) => this._stateOf(i));
    // 10/10/2026 : le niveau (T1→T3), les dégâts et le nombre de tourelles font partie de ce qui se voit
    const extra = G.planet.parcels.map((p) => `${p.lvl || 1}:${Math.round((p.damage || 0) * 10)}`).join(',');
    const sig = states.join('|') + '#' + extra + '#' + this._turretCount();
    if (force || sig !== this._sig) { this._sig = sig; this._rebuild(states); }
    this._updateSelection();
    SBAntenna.renderBanner();
  },

  _rebuild(states) {
    const M = this.M, K = this.kit;
    for (const g of [this.parcelGroup, this.buildGroup, this.decoGroup]) {
      while (g.children.length) g.remove(g.children[0]);
    }
    this.mixers = [];
    this.smoke = [];
    this.sites = [];
    this.nodeMeshes = [];
    this.antennaObj = null;
    this.antennaHolo = null;

    states.forEach((st, i) => {
      const pos = parcelPos(i);
      const pg = new THREE.Group();
      pg.position.copy(pos);
      pg.userData.parcel = i;

      const soil = st === 'locked' || st === 'rocky' || st === 'resource' || st === 'antenna_project';
      const plate = K.plate.clone();
      plate.traverse((o) => {
        if (!o.isMesh) return;
        o.material = st === 'depleted' ? M.MAT_SOIL_DEPLETED : soil ? M.MAT_SOIL_MOSS : M.MAT_DECK;
        o.receiveShadow = true;
      });
      const frame = K.frame.clone();
      frame.traverse((o) => { if (o.isMesh) { o.material = M.MAT_ARMOR_DARK; o.castShadow = true; o.receiveShadow = true; } });
      const nodes = K.nodes.clone();
      nodes.userData.baseMat = st === 'locked' || st === 'depleted' ? M.NODE_OFF
        : st === 'antenna_project' ? M.NODE_PROJECT
        : st === 'building' ? M.NODE_BUILD : M.NODE_ON;
      nodes.userData.parcelIdx = i;
      nodes.traverse((o) => { if (o.isMesh) o.material = nodes.userData.baseMat; });
      this.nodeMeshes.push(nodes);
      pg.add(plate, frame, nodes);
      this.parcelGroup.add(pg);

      const b = st === 'building' ? this._construction(G.planet.parcels[i]) : this._makeBuilding(st);
      if (b) {
        const p = G.planet.parcels[i] || {};
        this._dressTier(b, st, p.lvl || 1);
        this._dressDamage(b, p.damage || 0);
        b.position.set(pos.x, PARCEL_TOP, pos.z);
        b.userData.parcel = i;
        this.buildGroup.add(b);
      }
    });
    this._buildTurrets(states);
    this._buildParcelDeco(states);
  },

  /* ── Paliers visibles (T2, T3) — en attendant les modèles dédiés ──
     T2 : quatre contreforts blindés + bande lumineuse ; T3 : en plus, mât avec balise et
     deuxième bande. Le bâtiment grandit un peu. Sobre, lisible de loin. */
  _dressTier(obj, st, lvl) {
    if (!obj || lvl < 2) return;
    const M = this.M;
    const col = { mine: M.MAT_EMISSIVE_AMBER, centrale: M.MAT_EMISSIVE_AMBER, labo: M.MAT_EMISSIVE_GREEN, caserne: M.MAT_EMISSIVE_RED, turret: M.MAT_EMISSIVE_RED, shipyard: M.MAT_EMISSIVE_BLUE }[st] || M.MAT_EMISSIVE_BLUE;
    obj.scale.setScalar(lvl === 2 ? 1.06 : 1.12);
    const g = new THREE.Group(); g.name = 'tier';
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.5, 3.2), M.MAT_ARMOR_LIGHT);
      b.position.set(Math.cos(a) * 11.5, 2.75, Math.sin(a) * 11.5); b.rotation.y = -a;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 2.2), col);
      s.position.set(Math.cos(a) * 12.75, 4.4, Math.sin(a) * 12.75); s.rotation.y = -a;
      g.add(b, s);
    }
    if (lvl >= 3) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 14, 8), M.MAT_ARMOR_DARK);
      mast.position.set(-9, 7, 9);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), col);
      beacon.position.set(-9, 14.4, 9);
      const band = new THREE.Mesh(new THREE.TorusGeometry(12.2, 0.18, 6, 48), col);
      band.rotation.x = Math.PI / 2; band.position.y = 0.9;
      g.add(mast, beacon, band);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    obj.add(g);
  },

  /* ── Dégâts (0 → 1) : lumières qui s'éteignent, fumée. Le combat remplira p.damage. ── */
  _dressDamage(obj, damage) {
    if (!obj || !(damage > 0.05)) return;
    obj.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissiveIntensity > 0.3 && !o.userData.dmgMat) {
        o.material = o.material.clone(); o.userData.dmgMat = true;
        o.material.emissiveIntensity *= Math.max(0.08, 1 - damage * 1.4);
      }
      if (o.isLight) o.intensity *= Math.max(0, 1 - damage * 1.5);
    });
    const rnd = mulberry32(Math.round(damage * 97));
    const n = 1 + Math.round(damage * 3);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.4 + rnd() * 1.4, 8, 6), this.M.MAT_SMOKE.clone());
      puff.position.set((rnd() - 0.5) * 10, 6 + rnd() * 5, (rnd() - 0.5) * 10);
      puff.scale.y = 0.7; puff.userData.smoke = { v: 0.4 + rnd() * 0.5, y0: puff.position.y };
      obj.add(puff); this.smoke.push(puff);
    }
  },

  /* ── Tourelles : la défense se voit (North Star §26). Autour du bunker, sinon de la caserne,
     sinon du centre de commandement. Jusqu'à six, aux angles de la parcelle. ── */
  _turretCount() {
    const u = (G.defense && G.defense.units) || {};
    return (u.tourelle ? u.tourelle.qty || 0 : 0) + (u.tourelle_lourde ? u.tourelle_lourde.qty || 0 : 0);
  },
  _buildTurrets(states) {
    const n = Math.min(6, this._turretCount());
    if (!n) return;
    const P = G.planet.parcels;
    const anchor = ['turret', 'caserne', 'capital'].map((k) => P.findIndex((p) => p && p.building === k && p.state === 'built')).find((i) => i >= 0);
    if (anchor === undefined) return;
    const c = parcelPos(anchor), M = this.M;
    const heavy = (G.defense.units.tourelle_lourde && G.defense.units.tourelle_lourde.qty) || 0;
    for (let k = 0; k < n; k++) {
      const a = Math.PI / 6 + k * Math.PI / 3;
      const t = this._turret(k < heavy, M);
      t.position.set(c.x + Math.cos(a) * 22, PARCEL_TOP, c.z + Math.sin(a) * 22);
      t.rotation.y = -a + Math.PI / 2;   // canons vers l'extérieur
      t.userData.parcel = anchor;
      this.buildGroup.add(t);
    }
  },
  _turret(heavy, M) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.2, 10), M.MAT_ARMOR_DARK); base.position.y = 0.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.12, 6, 24), M.MAT_EMISSIVE_RED); ring.rotation.x = Math.PI / 2; ring.position.y = 1.25;
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.4, 10), M.MAT_ARMOR_LIGHT); pivot.position.y = 1.9;
    const head = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 3.4 : 2.8, 1.8, 3.2), M.MAT_ARMOR_DARK); head.position.set(0, 3.3, 0.3);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.3), M.MAT_EMISSIVE_RED); lens.position.set(0, 3.6, 1.95);
    g.add(base, ring, pivot, head, lens);
    const nb = heavy ? 4 : 2;
    for (let i = 0; i < nb; i++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.2, 8), M.MAT_METAL_DARK);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set((i - (nb - 1) / 2) * 0.7, 3.2 + (heavy && i % 2 ? 0.45 : 0), 3.6);
      g.add(barrel);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  },

  _clone(key) {
    const P = this.protos[key];
    const obj = P.root.clone(true);
    obj.position.set(0, 0, 0);
    if (P.clips.length) {
      const mixer = new THREE.AnimationMixer(obj);
      P.clips.forEach((c) => { if (!/BOOT/.test(c.name)) mixer.clipAction(c).play(); });
      obj.userData.mixer = mixer;
      obj.userData.clips = P.clips;
      this.mixers.push(mixer);
    }
    return obj;
  },

  _makeBuilding(st) {
    if (st === 'capital') return this._clone('capital');
    if (st === 'mine' || st === 'centrale' || st === 'labo') return this._clone(st);
    if (st === 'antenna') {
      const a = this._clone('antenna');
      SBAntenna.applyStage(a, SBAntenna.data().stage ?? 3);
      this.antennaObj = a;
      return a;
    }
    if (st === 'antenna_project') {
      const a = this.protos.antenna.root.clone(true);
      a.position.set(0, 0, 0);
      a.traverse((o) => {
        if (o.isMesh) { o.material = this.M.HOLO; o.castShadow = false; o.receiveShadow = false; }
        if (o.isLight) o.visible = false;
      });
      this.antennaHolo = a;
      return a;
    }
    if (st === 'building') return this._scaffold();
    // Bâtiments pas encore modélisés dans Blender : silhouettes procédurales distinctes par famille
    // (10/10/2026 — d'après les illustrations de référence ; les modèles dédiés viendront un par un)
    if (st === 'caserne') return this._bldCaserne();
    if (st === 'turret') return this._bldBunker();
    if (st === 'shipyard') return this._bldShipyard();
    if (st === 'comptoir') return this._bldComptoir();
    if (st === 'raffinerie') return this._bldRaffinerie();
    const SILO = { silo_metal: 0xff8848, silo_energie: 0xffaf3a, silo_cristal: 0x6db032, silo_biomass: 0x7ed080, silo_artefact: 0xa370ff };
    if (SILO[st] !== undefined) return this._bldSilo(SILO[st]);
    return null;
  },

  _shadow(g) { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; },
  _glowMat(hex, i) { return new THREE.MeshStandardMaterial({ color: 0x0b0e10, emissive: new THREE.Color(hex), emissiveIntensity: i, roughness: 0.4 }); },
  _box(w, h, d, mat, x, y, z, ry) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; return m; },
  _cyl(rt, rb, h, mat, x, y, z, seg) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), mat); m.position.set(x, y, z); return m; },

  // Caserne : bunker étagé, quatre flèches d'antenne, bannière rouge, rampes — famille rouge
  _bldCaserne() {
    const M = this.M, R = M.MAT_EMISSIVE_RED, g = new THREE.Group();
    g.add(this._cyl(14, 14.8, 0.9, M.MAT_ARMOR_DARK, 0, 0.45, 0, 8));
    g.add(this._box(18, 3.2, 15, M.MAT_ARMOR_DARK, 0, 2.5, 0));
    g.add(this._box(13, 3.0, 10.5, M.MAT_ARMOR_LIGHT, 0, 5.6, -0.5));
    g.add(this._box(8, 2.4, 6.5, M.MAT_ARMOR_DARK, 0, 8.3, -1));
    // flèches
    [[-6.5, -5.5], [6.5, -5.5], [-4, 3.5], [4, 3.5]].forEach(([x, z], k) => {
      g.add(this._cyl(0.18, 0.5, k < 2 ? 7 : 5, M.MAT_METAL_DARK, x, 7.1 + (k < 2 ? 3.5 : 2.5) + 0.5, z));
      g.add(this._cyl(0.22, 0.22, 0.6, R, x, 7.1 + (k < 2 ? 7.3 : 5.3), z, 6));
    });
    // bannière
    g.add(this._box(3.2, 4.2, 0.12, this._glowMat(0xd42a2a, 0.9), 0, 3.4, 7.56));
    g.add(this._box(3.6, 0.3, 0.3, M.MAT_METAL_DARK, 0, 5.6, 7.6));
    // fentes lumineuses + rampe
    [-6, 6].forEach((x) => g.add(this._box(2.2, 0.35, 0.25, R, x, 2.6, 7.55)));
    [-7.5, 7.5].forEach((z) => g.add(this._box(0.25, 0.35, 5, R, 9.05, 2.6, z * 0.5)));
    const ramp = this._box(5, 0.6, 5, M.MAT_CONCRETE, 0, 0.9, 10.5); ramp.rotation.x = -0.12; g.add(ramp);
    return this._shadow(g);
  },

  // Bunker souterrain : bas, rond, blindé ; trappe, évents, anneau rouge — tout est sous terre
  _bldBunker() {
    const M = this.M, R = M.MAT_EMISSIVE_RED, g = new THREE.Group();
    g.add(this._cyl(15, 15.6, 1.0, M.MAT_CONCRETE, 0, 0.5, 0, 8));
    g.add(this._cyl(10.5, 12, 2.2, M.MAT_ARMOR_DARK, 0, 2.1, 0, 10));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.MAT_ARMOR_LIGHT);
    dome.scale.y = 0.42; dome.position.y = 3.2; g.add(dome);
    g.add(this._cyl(2.2, 2.4, 1.2, M.MAT_METAL_DARK, 0, 7.0, 0, 8));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.8, 0.16, 6, 48), R); ring.rotation.x = Math.PI / 2; ring.position.y = 3.25; g.add(ring);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      g.add(this._box(1.6, 1.4, 2.2, M.MAT_GRATE, Math.cos(a) * 12.6, 1.4, Math.sin(a) * 12.6, -a));
      g.add(this._box(0.9, 0.3, 0.2, R, Math.cos(a) * 9.4, 4.3, Math.sin(a) * 9.4, -a + Math.PI / 2));
    }
    // porte blindée côté sud
    g.add(this._box(4.2, 2.6, 1.2, M.MAT_METAL_DARK, 0, 1.6, 12.2));
    g.add(this._box(3, 0.25, 0.2, R, 0, 2.8, 12.85));
    return this._shadow(g);
  },

  // Chantier orbital : plate-forme longue, deux portiques, grue, pads bleus — famille bleue
  _bldShipyard() {
    const M = this.M, B = M.MAT_EMISSIVE_BLUE_RIM, g = new THREE.Group();
    g.add(this._box(26, 1.2, 12, M.MAT_ARMOR_DARK, 0, 0.6, 0));
    g.add(this._box(24, 0.2, 0.4, B, 0, 1.3, -5.2));
    g.add(this._box(24, 0.2, 0.4, B, 0, 1.3, 5.2));
    // rail central + coque en cours
    g.add(this._box(22, 0.4, 2.2, M.MAT_METAL_DARK, 0, 1.4, 0));
    const hull = this._cyl(1.6, 1.9, 11, M.MAT_METAL_LIGHT, -2, 3.2, 0, 10); hull.rotation.z = Math.PI / 2; g.add(hull);
    // portiques
    [-6, 5].forEach((x) => {
      [-5.5, 5.5].forEach((z) => g.add(this._box(1.6, 12, 1.6, M.MAT_ARMOR_LIGHT, x, 7.2, z)));
      g.add(this._box(2.0, 1.6, 13.6, M.MAT_ARMOR_LIGHT, x, 13.6, 0));
      g.add(this._box(0.5, 0.3, 11, B, x, 12.75, 0));
      g.add(this._box(2.8, 1.4, 2.8, M.MAT_METAL_DARK, x, 13.3, 0));
    });
    // grue
    g.add(this._cyl(0.5, 0.7, 9, M.MAT_METAL_DARK, 10.5, 5.7, -3.5, 8));
    const arm = this._box(8, 0.6, 0.6, M.MAT_ARMOR_LIGHT, 7.5, 10.4, -3.5); g.add(arm);
    g.add(this._cyl(0.08, 0.08, 4, M.MAT_METAL_DARK, 4.5, 8.3, -3.5, 4));
    g.add(this._box(0.8, 0.8, 0.8, M.MAT_EMISSIVE_AMBER, 4.5, 6.2, -3.5));
    // module de contrôle
    g.add(this._box(5, 3, 4, M.MAT_ARMOR_DARK, 10, 2.7, 3));
    g.add(this._box(3.2, 0.9, 0.2, M.MAT_GLASS, 10, 3.2, 5.05));
    return this._shadow(g);
  },

  // Comptoir : pavillon à colonnes, toit plat, caisses, lumières ambre — famille ambre
  _bldComptoir() {
    const M = this.M, A = M.MAT_EMISSIVE_AMBER, g = new THREE.Group();
    g.add(this._cyl(13, 13.6, 0.8, M.MAT_CONCRETE, 0, 0.4, 0, 8));
    g.add(this._box(12, 3.4, 9, M.MAT_ARMOR_DARK, 0, 2.5, -1.5));
    [[-7, -4.5], [7, -4.5], [-7, 4.5], [7, 4.5]].forEach(([x, z]) => g.add(this._cyl(0.6, 0.7, 6.4, M.MAT_METAL_LIGHT, x, 3.6, z, 10)));
    g.add(this._box(13.5, 0.7, 9.5, M.MAT_ARMOR_DARK, 0, 7.2, 0));
    g.add(this._box(14, 0.25, 0.3, A, 0, 6.8, 4.9));
    g.add(this._box(14, 0.25, 0.3, A, 0, 6.8, -4.9));
    g.add(this._box(6, 1.6, 0.2, M.MAT_GLASS_WARM, 0, 3.4, 3.05));
    g.add(this._box(1.6, 0.8, 0.2, A, 0, 5.1, 3.05));
    // caisses de marchandises
    [[-9, 3, 0], [-9.2, 4.5, 1.1], [9, 2.5, 0], [9.5, 4.6, 0.9]].forEach(([x, z, y], k) => g.add(this._box(2.2, 1.6, 2.2, k % 2 ? M.MAT_METAL_DARK : M.MAT_ARMOR_LIGHT, x, 0.8 + y, z, k * 0.4)));
    return this._shadow(g);
  },

  // Raffinerie : deux cuves couchées, cheminée, tuyaux, flamme ambre — famille ambre
  _bldRaffinerie() {
    const M = this.M, A = M.MAT_EMISSIVE_AMBER, g = new THREE.Group();
    g.add(this._cyl(14, 14.6, 0.8, M.MAT_ARMOR_DARK, 0, 0.4, 0, 8));
    [-3.6, 3.6].forEach((z) => {
      const tank = this._cyl(2.6, 2.6, 13, M.MAT_METAL_LIGHT, -2, 3.6, z, 18); tank.rotation.z = Math.PI / 2; g.add(tank);
      [-5, 5].forEach((x) => g.add(this._box(1.6, 2.6, 1.2, M.MAT_ARMOR_DARK, x - 2, 1.5, z)));
      const band = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.12, 6, 32), A); band.rotation.y = Math.PI / 2; band.position.set(-2, 3.6, z); g.add(band);
    });
    g.add(this._cyl(1.3, 1.8, 14, M.MAT_ARMOR_LIGHT, 9, 7.4, -2, 14));
    g.add(this._cyl(1.5, 1.3, 1.2, M.MAT_METAL_DARK, 9, 14.9, -2, 14));
    g.add(this._cyl(0.9, 0.5, 1.4, A, 9, 15.9, -2, 10));
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 8, 24, Math.PI / 2), M.MAT_METAL_DARK); pipe.position.set(5, 4.2, -2); pipe.rotation.y = Math.PI / 2; g.add(pipe);
    g.add(this._box(4.5, 2.6, 4, M.MAT_ARMOR_DARK, 9, 1.7, 5));
    g.add(this._box(2.4, 0.5, 0.2, A, 9, 2.4, 7.05));
    return this._shadow(g);
  },

  // Silo : cuve haute, bande à la couleur de la ressource, échelle, passerelle
  _bldSilo(hex) {
    const M = this.M, C = this._glowMat(hex, 2.6), g = new THREE.Group();
    g.add(this._cyl(12, 12.6, 0.8, M.MAT_ARMOR_DARK, 0, 0.4, 0, 8));
    g.add(this._cyl(5.2, 5.6, 12, M.MAT_ARMOR_LIGHT, 0, 6.8, 0, 16));
    g.add(this._cyl(3.4, 5.4, 1.8, M.MAT_METAL_DARK, 0, 13.7, 0, 16));
    [4.2, 9.2].forEach((y) => { const r = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.14, 6, 40), C); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); });
    g.add(this._box(0.6, 11, 0.2, M.MAT_METAL_DARK, 5.8, 6.3, 0));
    g.add(this._cyl(2.2, 2.4, 4, M.MAT_ARMOR_DARK, 8.5, 2, 4, 10));
    g.add(this._cyl(0.35, 0.35, 5, M.MAT_METAL_DARK, 6.6, 4.5, 2.6, 8).rotateZ(0.9));
    return this._shadow(g);
  },

  _placeholder(color, isSilo) {
    const g = new THREE.Group(), M = this.M;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(12, 12.6, 0.8, 8), M.MAT_ARMOR_DARK);
    base.position.y = 0.4; base.rotation.y = Math.PI / 8;
    const body = isSilo ? new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 11, 12), M.MAT_ARMOR_DARK)
                        : new THREE.Mesh(new THREE.BoxGeometry(12, 6, 9), M.MAT_ARMOR_DARK);
    body.position.y = isSilo ? 6.3 : 3.8;
    const cap = isSilo ? new THREE.Mesh(new THREE.CylinderGeometry(3.6, 5.2, 1.6, 12), M.MAT_ARMOR_LIGHT)
                       : new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.6, 9.6), M.MAT_ARMOR_LIGHT);
    cap.position.y = isSilo ? 12.6 : 7.1;
    const strip = new THREE.Mesh(isSilo ? new THREE.CylinderGeometry(5.5, 5.5, 0.4, 12) : new THREE.BoxGeometry(9, 0.35, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0b0e10, emissive: color, emissiveIntensity: 2.6 }));
    strip.position.set(0, isSilo ? 9 : 5.2, isSilo ? 0 : 4.6);
    g.add(base, body, cap, strip);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  },

  /* ── Construction visible (P0.3, 10/10/2026) ──
     0–30 % fondation : dalle + fantôme holographique bas et transparent ;
     30–85 % chantier : échafaudage, le fantôme monte et s'opacifie ;
     85–100 % activation : bâtiment réel, lumières éteintes. Tout est calculé sur le temps écoulé. */
  _construction(p) {
    const g = new THREE.Group();
    const key = p && p.building;
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.4, 0.6, 6), this.M.MAT_CONCRETE);
    slab.position.y = 0.3; slab.receiveShadow = true; g.add(slab);
    const scaffold = this._scaffold(); scaffold.children.forEach((c) => { if (c.geometry && c.geometry.type === 'CylinderGeometry') c.visible = false; });
    g.add(scaffold);
    let ghost = null, real = null;
    try { real = key ? this._makeBuilding(key) : null; } catch (e) { real = null; }
    if (real) {
      // Deuxième instance pour le fantôme (clone impossible : le mixer d'animation est dans userData)
      ghost = this._makeBuilding(key);
      if (ghost.userData.mixer) { this.mixers = this.mixers.filter((m) => m !== ghost.userData.mixer); delete ghost.userData.mixer; delete ghost.userData.clips; }
      const holo = this.M.HOLO.clone(); holo.opacity = 0.14;
      ghost.traverse((o) => { if (o.isMesh) { o.material = holo; o.castShadow = false; o.receiveShadow = false; } if (o.isLight) o.visible = false; });
      g.userData.holo = holo;
      real.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissiveIntensity > 0.3) { o.material = o.material.clone(); o.material.emissiveIntensity = 0.05; }
        if (o.isLight) o.visible = false;
      });
      real.visible = false;
      g.add(ghost, real);
    }
    g.userData.site = { p, ghost, real, scaffold };
    this.sites.push(g);
    this._animateSite(g, Date.now());
    return g;
  },
  _animateSite(g, now) {
    const s = g.userData.site; if (!s || !s.p) return;
    const t0 = s.p.buildStartedAt || now, t1 = s.p.buildEndsAt || now + 1;
    const k = Math.max(0, Math.min(1, (now - t0) / Math.max(1, t1 - t0)));
    if (s.ghost) {
      const rise = Math.min(1, k / 0.85);
      s.ghost.visible = k < 0.85;
      s.ghost.scale.set(1, 0.12 + 0.88 * rise, 1);
    }
    s.scaffold.visible = k >= 0.3 && k < 0.85;
    if (s.real) s.real.visible = k >= 0.85;
    if (g.userData.holo) g.userData.holo.opacity = 0.12 + 0.3 * Math.min(1, k / 0.85) + Math.sin(now / 450) * 0.04;
  },

  // Chantier en cours : dalle + échafaudage + balises ambre
  _scaffold() {
    const g = new THREE.Group(), M = this.M;
    const postG = new THREE.BoxGeometry(0.6, 9, 0.6), lampG = new THREE.BoxGeometry(0.9, 0.5, 0.9);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const post = new THREE.Mesh(postG, M.MAT_ARMOR_LIGHT);
      post.position.set(Math.cos(a) * 9, 4.5, Math.sin(a) * 9);
      const lamp = new THREE.Mesh(lampG, M.MAT_EMISSIVE_AMBER);
      lamp.position.set(Math.cos(a) * 9, 9.3, Math.sin(a) * 9);
      g.add(post, lamp);
    }
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.4, 0.6, 6), M.MAT_CONCRETE);
    slab.position.y = 0.3;
    g.add(slab);
    return g;
  },

  // Détails au sol : pierres et touffes sur les parcelles ouvertes, jeune forêt sur l'inconnu
  _buildParcelDeco(states) {
    const buckets = [[], [], [], [], [], []];
    states.forEach((st, i) => {
      const open = st === 'rocky' || st === 'resource' || st === 'antenna_project';
      if (st !== 'locked' && !open) return;
      const rnd = mulberry32(1000 + i), c = parcelPos(i);
      for (let k = 0; k < 150; k++) {
        const x = (rnd() * 2 - 1) * 26, z = (rnd() * 2 - 1) * 26;
        const edge = hexNorm(x, z);
        if (edge >= 0.93) continue;
        if (st === 'antenna_project' && Math.hypot(x, z) < 12) continue;
        const r = rnd(), pick = rnd(), sc = rnd(), rot = rnd() * 6.28;
        if (st === 'locked') {
          if (r < 0.2 + 0.35 * Math.max(0, edge - 0.55)) buckets[[0, 0, 3, 1, 2][Math.floor(pick * 5)]].push([c.x + x, c.z + z, 0.55 + sc * 0.6, rot]);
          else if (r < 0.3) buckets[5].push([c.x + x, c.z + z, 0.6 + sc, rot]);
        } else if (r < 0.07) buckets[5].push([c.x + x, c.z + z, 0.6 + sc, rot]);
        else if (r < 0.11) buckets[2].push([c.x + x, c.z + z, 0.45 + sc * 0.35, rot]);
        else if (r < 0.118 && edge > 0.7) buckets[0].push([c.x + x, c.z + z, 0.45 + sc * 0.25, rot]);
      }
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    buckets.forEach((list, v) => {
      if (!list.length || !this.kit.veg[v]) return;
      this.kit.veg[v].traverse((mesh) => {
        if (!mesh.isMesh) return;
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
        list.forEach(([x, z, scale, rot], k) => {
          p.set(x, PARCEL_TOP, z); q.setFromAxisAngle(up, rot); s.setScalar(scale);
          m.compose(p, q, s); im.setMatrixAt(k, m);
        });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true; im.receiveShadow = true;
        this.decoGroup.add(im);
      });
    });
  },

  _updateSelection() {
    const sel = hasGame() ? G.selParcel : null;
    (this.nodeMeshes || []).forEach((nodes) => {
      const mat = nodes.userData.parcelIdx === sel ? this.M.NODE_SEL : nodes.userData.baseMat;
      nodes.traverse((o) => { if (o.isMesh) o.material = mat; });
    });
  },

  // Cadrage standard (bouton ◎) : toute la colonie, plus de recul en portrait
  home(ms = 700) {
    if (!this.ready) return;
    const portrait = this.camera.aspect < 0.8;
    this._moveTo(new THREE.Vector3(8, 0, portrait ? 30 : 14), portrait ? 470 : 340, ms);
  },

  // Recentrage doux de la caméra
  focus(i, dist = 260, ms = 900) {
    if (!this.ready) return;
    this._moveTo(parcelPos(i), dist, ms);
  },

  _moveTo(to, dist, ms) {
    ms = Math.max(ms, 1);
    const from = this.controls.target.clone();
    const d0 = this.camera.position.distanceTo(this.controls.target), t0 = performance.now();
    this._focusAnim = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = k * k * (3 - 2 * k);
      this.controls.target.lerpVectors(from, to, e);
      this.camera.position.copy(this.controls.target).addScaledVector(this.camDir, d0 + (dist - d0) * e);
      if (k >= 1) this._focusAnim = null;
    };
  },

  _frame() {
    // écran planète masqué (classe .hidden = opacité 0, l'élément reste « visible » pour le DOM) : pas de rendu
    if (!this.host || this.host.offsetParent === null || this.host.closest('.screen.hidden')) { this._last = performance.now(); return; }
    const now = performance.now(), dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now; this._t += dt; const t = this._t;
    if (this._focusAnim) this._focusAnim(performance.now());
    this.controls.update();
    this.mixers.forEach((mx) => mx.update(dt));
    if (this.sites && this.sites.length) { const nowMs = Date.now(); for (const g of this.sites) this._animateSite(g, nowMs); }
    for (const puff of (this.smoke || [])) { const s = puff.userData.smoke; puff.position.y += dt * s.v; if (puff.position.y > s.y0 + 9) puff.position.y = s.y0; const k = 1 - (puff.position.y - s.y0) / 9; puff.material.opacity = 0.12 + 0.5 * k; puff.scale.setScalar(0.8 + (1 - k) * 0.9); }
    this.M.NODE_SEL.emissiveIntensity = 4 + Math.sin(t * 4) * 1.5;
    this.M.NODE_BUILD.emissiveIntensity = 2.2 + Math.sin(t * 6) * 1.2;
    this.M.HOLO.opacity = 0.16 + Math.sin(t * 2.2) * 0.07;
    if (this.antennaHolo) this.antennaHolo.rotation.y = Math.sin(t * 0.4) * 0.15;
    this.composer.render();
    if (!this._bannerTick || t - this._bannerTick > 1) { this._bannerTick = t; SBAntenna.renderBanner(); }
  },
};

/* ─────────────────────── Boucle fondatrice : l'antenne ───────────────────── */
// GDD « Boucle fondatrice » §2–§10 : DÉSIR → MANQUE → EXTRACTION → CONSTRUCTION → DÉCOUVERTE

const ANT_COST = { metal: 60, energie: 25, cristal: 8 };
const ANT_LABELS = { metal: 'Métal', energie: 'Énergie', cristal: 'Cristal' };
const ANT_COLORS = { metal: '#ff8848', energie: '#ffaf3a', cristal: '#5fffe8' };   // = couleurs des tuiles
const ANT_SLOTS = [17, 16, 13, 11, 7, 6];   // voisines de la capitale, par ordre de préférence

const SBAntenna = {
  // État persistant (sauvegardé avec la partie) : { parcel, built, stage, signal }
  data() {
    if (!hasGame()) return null;
    const P = G.planet.parcels;
    const free = (i) => P[i] && P[i].state === 'rocky' && !P[i].building;
    let a = G.antenna;
    // (Re)choisir l'emplacement tant que l'antenne n'est pas construite et que la parcelle n'est plus libre
    if (!a || (!a.built && !a.building && (a.parcel == null || !free(a.parcel)))) {
      let slot = ANT_SLOTS.find(free);
      if (slot === undefined) slot = P.findIndex((p, i) => free(i));
      a = G.antenna = { parcel: slot >= 0 && slot !== undefined ? slot : null, built: false, building: false, stage: -1, signal: null };
    }
    return a.parcel == null ? null : a;
  },

  owns(i) { const a = this.data(); return !!a && a.parcel === i; },

  stock(k) { return Math.floor((G.res[k] && G.res[k].v) || 0); },
  affordable() { return Object.keys(ANT_COST).every((k) => this.stock(k) >= ANT_COST[k]); },

  needsHtml() {
    return Object.keys(ANT_COST).map((k) => {
      const have = Math.min(this.stock(k), ANT_COST[k]), need = ANT_COST[k], pct = Math.round(have / need * 100);
      return `
        <div class="p3d-need">
          <span class="p3d-need-l">${ANT_LABELS[k]}</span>
          <span class="p3d-need-v" style="color:${ANT_COLORS[k]}">${have} / ${need}</span>
          <span class="p3d-need-b"><span style="width:${pct}%;background:${ANT_COLORS[k]}"></span></span>
        </div>`;
    }).join('');
  },

  // Fiche de la parcelle antenne (remplace la fiche standard pour cette parcelle)
  renderCard(i) {
    const info = document.getElementById('planet-info');
    const a = this.data();
    if (!info || !a) return;
    const coordTxt = typeof coord === 'function' ? coord(i) : '';
    const planet = G.planet.name || 'la planète';
    if (!a.built) {
      const can = this.affordable();
      const open = G.planet.parcels.findIndex((p, j) => j !== i && (p.state === 'rocky' || p.state === 'resource'));
      const cta = can
        ? `<button class="btn-primary" onclick="SBAntenna.build()">Construire l'antenne</button>`
        : `<button class="btn-primary" onclick="${open >= 0 ? `onHexClick(${open})` : `toast('Aucune parcelle exploitable')`}">Exploiter une parcelle</button>`;
      info.innerHTML = `
        <div class="row1"><span class="tag" style="color:${UI_BLUE}">Projet</span><span class="coord">${coordTxt}</span></div>
        <div class="name">Antenne de prospection</div>
        <div class="sub">Aucune liaison externe. ${planet} ignore tout de ce qui l'entoure : cette antenne sera ses premiers yeux.</div>
        <div class="p3d-needs">
          <div class="p3d-needs-t">${can ? 'Ressources disponibles' : 'Besoins'}</div>
          ${this.needsHtml()}
        </div>
        <div class="cta">${cta}</div>`;
    } else {
      const s = a.signal || {};
      info.innerHTML = `
        <div class="row1"><span class="tag" style="color:${UI_BLUE}">Active</span><span class="coord">${coordTxt}</span></div>
        <div class="name">Antenne de prospection</div>
        <div class="sub">Première liaison avec l'extérieur. Elle balaie le ciel au-delà de ${planet}.</div>
        <div class="p3d-needs p3d-mono">
          <div class="p3d-sig-name">${s.name || 'SIGNATURE 01'}</div>
          Origine : ${s.origin || 'inconnue'}<br>Distance : ${s.dist || '0.7 UA'}<br>
          Intensité : ${s.intensity || 'faible'}<br>Classification : ${s.cls || 'impossible'}
        </div>
        <div class="cta"><button class="btn-primary" onclick="SBAntenna.showSignal()">Revoir le signal</button><button class="btn-ghost" onclick="toast('Poste de prospection : bientôt')">Évoluer</button></div>`;
    }
  },

  // Bandeau « Objectif » sur la carte 3D tant que l'antenne n'est pas construite
  renderBanner() {
    const ov = Planet3D._overlay;
    if (!ov) return;
    const a = this.data();
    let b = ov.querySelector('.p3d-goal');
    if (!a || a.built || a.building) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.className = 'p3d-goal';
      b.addEventListener('click', () => { onHexClick(this.data().parcel); Planet3D.focus(this.data().parcel); });
      ov.appendChild(b);
    }
    const stockSig = Object.keys(ANT_COST).map((k) => this.stock(k)).join(',');
    const ready = this.affordable();
    const html = `<div class="p3d-goal-t">Objectif · Antenne de prospection</div>
      <div class="p3d-goal-n">${Object.keys(ANT_COST).map((k) => {
        const have = Math.min(this.stock(k), ANT_COST[k]);
        return `<span class="${have >= ANT_COST[k] ? 'ok' : ''}">${ANT_LABELS[k]} <b style="color:${ANT_COLORS[k]}">${have}</b>/${ANT_COST[k]}</span>`;
      }).join('')}</div>${ready ? '<div class="p3d-goal-go">Prête à construire · toucher pour y aller</div>' : ''}`;
    if (b.innerHTML !== html) {
      b.innerHTML = html;
      // retour de match-3 : le bandeau « respire » quand les stocks ont progressé
      if (this._lastStock && this._lastStock !== stockSig) {
        b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
      }
    }
    b.classList.toggle('ready', ready);
    this._lastStock = stockSig;
  },

  // Objectif en cours, affiché pendant le match-3 (Règle 4) — null une fois l'antenne lancée
  goal() {
    const a = this.data();
    if (!a || a.built || a.building) return null;
    return { name: 'Antenne de prospection', cost: { ...ANT_COST }, colors: ANT_COLORS };
  },

  applyStage(obj, n) {
    obj.traverse((o) => {
      const m = /_STATE_(\d\d)/.exec(o.name);
      if (m) o.visible = parseInt(m[1], 10) <= n;
    });
  },

  // Construction : coût payé, construction par étapes + rituel (~4 s), premier signal
  build() {
    const a = this.data();
    if (!a || a.built || a.building) return;
    if (!this.affordable()) { say('Ressources insuffisantes'); return; }
    Object.keys(ANT_COST).forEach((k) => { G.res[k].v -= ANT_COST[k]; });
    a.built = true; a.building = true; a.stage = 0;
    if (typeof saveGame === 'function') saveGame();

    const has3D = Planet3D.ready;
    if (has3D) { Planet3D.sync(true); Planet3D.focus(a.parcel, 210, 700); }
    const obj = Planet3D.antennaObj;
    const log = has3D ? this._ritualBox() : null;
    const steps = [
      [0,    0, 'FONDATIONS COULÉES'],
      [350,  1, 'STRUCTURE ÉRIGÉE'],
      [700,  2, 'PARABOLE MONTÉE'],
      [1050, 3, 'ALIMENTATION CONNECTÉE'],
      [1400, 3, 'CALIBRATION DU RÉCEPTEUR'],
      [2500, 3, 'BALAYAGE LOCAL…'],
      [3300, 3, 'SIGNATURE DÉTECTÉE'],
    ];
    steps.forEach(([ms, stage, txt], k) => setTimeout(() => {
      a.stage = stage;
      if (obj) this.applyStage(obj, stage);
      if (log) {
        const line = document.createElement('div');
        line.textContent = txt;
        if (k === steps.length - 1) line.className = 'hot';
        log.appendChild(line);
      } else if (k === steps.length - 1) say(txt);
      if (txt.startsWith('CALIBRATION') && obj && obj.userData.mixer) this._playBoot(obj);
    }, ms));
    setTimeout(() => {
      a.building = false; a.stage = 3;
      a.signal = { name: 'SIGNATURE 01', origin: 'inconnue', dist: '0.7 UA', intensity: 'faible', cls: 'impossible', at: Date.now() };
      const revealed = this._revealNearby(a.parcel, 2);
      if (typeof saveGame === 'function') saveGame();
      if (log) log.remove();
      if (has3D) Planet3D.sync();
      this.showSignal(revealed);
      if (G.selParcel === a.parcel) this.renderCard(a.parcel);
    }, 4000);
  },

  _playBoot(obj) {
    const mx = obj.userData.mixer, clips = obj.userData.clips;
    const boot = clips.find((c) => /BOOT/.test(c.name)), idle = clips.find((c) => /IDLE/.test(c.name));
    if (!boot) return;
    mx.stopAllAction();
    const act = mx.clipAction(boot);
    act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.reset().play();
    if (idle) setTimeout(() => { mx.stopAllAction(); mx.clipAction(idle).reset().play(); }, boot.duration * 1000 + 50);
  },

  // Détection de proximité : l'antenne cartographie quelques zones inconnues voisines
  _revealNearby(from, count) {
    const P = G.planet.parcels;
    const locked = (i) => P[i] && P[i].state === 'locked';
    let picks = parcelNeighbors(from).filter(locked);
    if (picks.length < count) {
      const ring = new Set();
      P.forEach((p, i) => { if (!locked(i)) parcelNeighbors(i).forEach((n) => { if (locked(n)) ring.add(n); }); });
      picks = picks.concat([...ring].filter((n) => !picks.includes(n)));
    }
    picks = picks.slice(0, count);
    picks.forEach((i) => Object.assign(P[i], {
      state: 'rocky', building: null, n: 'Plaine rocheuse',
      sub: 'Cartographiée par l\'antenne. Disponible pour exploitation.',
      lvl: null, prod: null,
    }));
    return picks.length;
  },

  _ritualBox() {
    const box = document.createElement('div');
    box.className = 'p3d-ritual';
    Planet3D._overlay.appendChild(box);
    return box;
  },

  showSignal(revealed) {
    const a = this.data();
    if (!a || !a.signal) return;
    const s = a.signal, ov = Planet3D._overlay;
    const extra = revealed ? `<div class="p3d-signal-x">Relevé de proximité : ${revealed} parcelle${revealed > 1 ? 's' : ''} cartographiée${revealed > 1 ? 's' : ''}.</div>` : '';
    if (!ov) { say(`${s.name} · origine ${s.origin} · ${s.dist}`); return; }
    ov.querySelector('.p3d-signal')?.remove();
    const d = document.createElement('div');
    d.className = 'p3d-signal';
    d.innerHTML = `
      <div class="p3d-signal-k">Antenne de prospection · premier balayage</div>
      <div class="p3d-signal-t">${s.name}</div>
      <div class="p3d-signal-b">Origine : ${s.origin}<br>Distance : ${s.dist}<br>Intensité : ${s.intensity}<br>Classification : ${s.cls}</div>
      <div class="p3d-signal-q">Quelque chose, là-haut, émet. On ne sait pas encore quoi.</div>
      ${extra}
      <button class="btn-primary">Enregistrer</button>`;
    d.querySelector('button').addEventListener('click', () => d.remove());
    ov.appendChild(d);
  },
};

/* ─────────────────────────────── Styles ─────────────────────────────────── */

const css = document.createElement('style');
css.textContent = `
  .planet3d { display:none; position:relative; width:100%; height:min(58vh,540px); min-height:340px; overflow:hidden; background:#0b1622; }
  .mapwrap.has3d { padding:0; margin-top:0; }
  .mapwrap.has3d .planet3d { display:block; }
  .mapwrap.has3d svg.map { display:none; }
  .p3d-overlay { position:absolute; inset:0; pointer-events:none; }
  .p3d-overlay > * { pointer-events:auto; }
  .p3d-goal { position:absolute; left:12px; right:12px; top:10px; padding:9px 12px; border-radius:8px; background:rgba(8,14,20,.8); border:1px solid rgba(95,168,232,.32); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); cursor:pointer; }
  .p3d-goal.ready { border-color:rgba(95,168,232,.8); box-shadow:0 0 18px rgba(63,200,255,.25); }
  .p3d-goal.bump { animation:p3dBump .9s ease-out; }
  .p3d-goal-t { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:${UI_BLUE}; margin-bottom:4px; }
  .p3d-goal-n { display:flex; gap:12px; flex-wrap:wrap; font-family:'JetBrains Mono',monospace; font-size:11px; color:#c8d2d6; }
  .p3d-goal-n .ok { color:#9fdc7a; }
  .p3d-goal-go { margin-top:5px; font-size:10px; color:#dff3ff; letter-spacing:.04em; }
  .p3d-needs { margin-top:12px; padding:10px 12px; border:1px solid rgba(95,168,232,.28); border-radius:8px; background:rgba(95,168,232,.05); }
  .p3d-needs-t { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:${UI_BLUE}; margin-bottom:4px; }
  .p3d-need { display:flex; align-items:center; gap:10px; margin:6px 0; }
  .p3d-need-l { width:62px; font-size:11px; color:var(--mut); }
  .p3d-need-v { width:64px; font-family:'JetBrains Mono',monospace; font-size:12px; }
  .p3d-need-b { flex:1; height:3px; background:#1d2022; border-radius:2px; overflow:hidden; }
  .p3d-need-b span { display:block; height:100%; }
  .p3d-mono { font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.7; color:#9fb4c2; }
  .p3d-sig-name { color:#dfe8ec; font-weight:700; }
  .p3d-ritual { position:absolute; left:14px; bottom:14px; font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.7; letter-spacing:.06em; color:#9fb4c2; text-shadow:0 1px 3px #000; pointer-events:none; }
  .p3d-ritual div { animation:p3dIn .25s ease-out both; }
  .p3d-ritual .hot { color:#dff3ff; font-weight:700; }
  .p3d-signal { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(86%,320px); padding:16px 16px 14px; border-radius:10px; background:rgba(8,14,20,.93); border:1px solid rgba(95,168,232,.45); box-shadow:0 0 40px rgba(63,200,255,.18); animation:p3dIn .35s ease-out both; }
  .p3d-signal-k { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:${UI_BLUE}; }
  .p3d-signal-t { margin:6px 0 8px; font-family:'JetBrains Mono',monospace; font-size:16px; font-weight:700; color:#e6f1f5; letter-spacing:.08em; }
  .p3d-signal-b { font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.75; color:#9fb4c2; }
  .p3d-signal-q { margin:10px 0 8px; font-size:12px; color:#c8d2d6; font-style:italic; }
  .p3d-signal-x { margin:0 0 12px; font-size:11px; color:#9fdc7a; }
  .p3d-signal .btn-primary { width:100%; }
  @keyframes p3dIn { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:none } }
  .p3d-signal { animation-name:p3dInC; }
  @keyframes p3dInC { from { opacity:0; transform:translate(-50%,-46%) } to { opacity:1; transform:translate(-50%,-50%) } }
  @keyframes p3dBump { 0% { box-shadow:0 0 0 rgba(63,200,255,0) } 30% { box-shadow:0 0 22px rgba(63,200,255,.45) } 100% { box-shadow:0 0 0 rgba(63,200,255,0) } }
`;
document.head.appendChild(css);

/* ─────────────────────────────── Démarrage ──────────────────────────────── */

window.Planet3D = Planet3D;
window.SBAntenna = SBAntenna;
Planet3D.init();
