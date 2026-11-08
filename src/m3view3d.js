/* ═══════════════════════════════════════════════════════════════
   Starbyte — Match-3 V2 · plateau 3D (Three.js)

   Rendu du plateau en vraie 3D, légèrement incliné, avec le kit Blender
   (assets/3d/sb_match3_kit.glb, scène SB_MATCH3). La logique et les
   animations restent dans match3.js, qui calcule les positions en « px
   plateau » ; cette vue les convertit en mètres (1 case = 1 m) :
     x monde = x / cw − largeur/2,  z monde = y / cw − profondeur/2.

   Three.js n'est pas embarqué : il est partagé par la carte 3D
   (window.SB3D, exposé par assets/planet3d.js). Sans lui → rendu 2D.
   ═══════════════════════════════════════════════════════════════ */

const KIT_URL = 'assets/3d/sb_match3_kit.glb';
const TILT = 27;                    // degrés depuis la verticale
const TILE_SCALE = 1.18;            // tuiles un peu plus grosses qu'en rendu figé (lisibilité mobile)
const FOV = 30;
const CELL_LINE = { '': 0x1aa8ff, 'Énergie': 0xff7a12, Recherche: 0x33f06a, Secours: 0xff4a4a };   // PATCH_2110_SECOURS
let kitPromise = null;

// Tuiles propres à un lieu (GDD match-3 thématiques) : chargées seulement quand on joue dans ce lieu.
// Un lieu sans skin, ou une tuile absente du skin, garde la tuile standard du kit.
const SKINS = {
  Secours: {   // PATCH_2110_SECOURS — secours sanitaires sur une planète dévastée
    url: 'assets/3d/sb_match3_secours.glb?v=20261013b', prefix: 'SB_MATCH3_TILE_SEC_', scale: 1.1,
    names: { metal: 'METAL', energie: 'ENERGIE', cristal: 'CRISTAL', biomass: 'BIOMASS', artefact: 'ARTEFACT', rock: 'ROCK', rock_cracked: 'ROCK_CRACKED' },
  },
  'Énergie': {
    url: 'assets/3d/sb_match3_centrale.glb', prefix: 'SB_MATCH3_TILE_CEN_', scale: 1.1,
    names: { metal: 'METAL', energie: 'ENERGIE', cristal: 'CRISTAL', biomass: 'BIOMASS', artefact: 'ARTEFACT', rock: 'ROCK', rock_cracked: 'ROCK_CRACKED' },
  },
  Recherche: {
    url: 'assets/3d/sb_match3_lab.glb', prefix: 'SB_MATCH3_TILE_LAB_', scale: 1.1,
    names: { metal: 'METAL', energie: 'ENERGIE', cristal: 'CRISTAL', biomass: 'BIOMASS', artefact: 'ARTEFACT', rock: 'ROCK', rock_cracked: 'ROCK_CRACKED' },
  },
};
const skinPromises = {};

const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const base = (name) => name.replace(/\.?\d{3}$/, '');   // « .001 » de Blender (le point est retiré par GLTFLoader)

let _gl3dOk = null;   // AUDIT_1110 : résultat mis en cache, contexte de test libéré
export function canUse3D() {
  if (!window.SB3D) return false;
  if (_gl3dOk !== null) return _gl3dOk;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    _gl3dOk = !!gl;
    if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
  } catch (e) { _gl3dOk = false; }
  return _gl3dOk;
}

// Chargement (une fois) du kit + préparation des matériaux pour le temps réel
function loadKit() {
  if (kitPromise) return kitPromise;
  const { THREE, GLTFLoader } = window.SB3D;
  kitPromise = new GLTFLoader().loadAsync(KIT_URL).then((gltf) => {
    const kit = {};
    const mats = {};
    const tune = (m) => {
      const n = base(m.name);
      if (mats[n]) return mats[n];
      let out = m;
      if (n === 'M_MATCH3_CRYSTAL') {
        out = new THREE.MeshStandardMaterial({ color: 0x22e8dc, emissive: 0x0bb5ad, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92 });
      } else if (n === 'M_MATCH3_GLASS') {
        out = new THREE.MeshStandardMaterial({ color: 0xd8fff0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
      } else if (n === 'M_MATCH3_ROCK') {
        out = new THREE.MeshStandardMaterial({ color: 0x8a847b, roughness: 0.9, metalness: 0, flatShading: true });
      } else if (n === 'M_MATCH3_BIOMASS') {
        out = new THREE.MeshStandardMaterial({ color: 0x5fd12a, emissive: 0x3aa014, emissiveIntensity: 0.6, roughness: 0.4 });
      } else if (n === 'M_MATCH3_ARTIFACT') {
        out = new THREE.MeshStandardMaterial({ color: 0x7a45ff, emissive: 0x5a1cff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1 });
      } else if (n === 'M_MATCH3_ENERGY') {
        out = new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff7a00, emissiveIntensity: 1.2, roughness: 0.3 });
      } else if (n === 'M_MATCH3_BOARD') {
        out = new THREE.MeshStandardMaterial({ color: 0x0c131c, metalness: 0.35, roughness: 0.62 });
      } else if (n === 'M_MATCH3_DARKSTEEL') {
        out = new THREE.MeshStandardMaterial({ color: 0x151c26, metalness: 0.7, roughness: 0.4 });
      } else {
        if ('transmission' in out) out.transmission = 0;
        out.envMapIntensity = 1.0;
      }
      out.name = n;
      mats[n] = out;
      return out;
    };
    gltf.scene.children.forEach((node) => {
      const n = base(node.name);
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map(tune) : tune(o.material);
      });
      node.position.set(0, 0, 0);
      kit[n] = node;
    });
    kit._mats = mats;
    kit._tune = tune;
    return kit;
  });
  return kitPromise;
}

// Chargement (une fois par lieu) des tuiles d'un skin, ajoutées au kit avec les mêmes réglages de matériaux
function loadSkin(kit, ctx) {
  const skin = SKINS[ctx];
  if (!skin) return Promise.resolve(null);
  if (!skinPromises[ctx]) {
    const { GLTFLoader } = window.SB3D;
    skinPromises[ctx] = new GLTFLoader().loadAsync(skin.url).then((gltf) => {
      gltf.scene.children.slice().forEach((node) => {
        node.traverse((o) => {
          if (!o.isMesh) return;
          o.material = Array.isArray(o.material) ? o.material.map(kit._tune) : kit._tune(o.material);
        });
        node.position.set(0, 0, 0);
        kit[base(node.name)] = node;
      });
      return skin;
    }).catch((e) => { delete skinPromises[ctx]; throw e; });
  }
  return skinPromises[ctx];
}

export class Board3D {
  constructor() {
    const { THREE, RoomEnvironment } = window.SB3D;
    this.T = THREE;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'm3v2-gl';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.setClearColor(0x000000, 0);
    const scene = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pm.dispose();
    scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x0a0e14, 0.7));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-3, 7, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x73a8ff, 1.6); rim.position.set(4, 3, -6); scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.root = new THREE.Group(); scene.add(this.root);
    this.tiles = new Map();            // id → { key, obj }
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.introT = 1; this.waves = [];
  }

  async init(game) {
    this.kit = await loadKit();
    this.skin = null;
    const ctx = game.s && game.s.context;
    if (SKINS[ctx]) {
      try { this.skin = await loadSkin(this.kit, ctx); } catch (e) { console.warn('[Match3] tuiles du lieu indisponibles, tuiles standard :', e); }
    }
    this.game = game;
    this._buildBoard(game);
    this.cw0 = game.g.cw;
    return this;
  }

  attach(host, overlay) {
    this.host = host; this.overlay = overlay;
    host.insertBefore(this.canvas, host.firstChild);
  }

  // ── Plateau : socle, cadre lumineux, 63 alvéoles instanciées
  _buildBoard(game) {
    const T = this.T, g = game.g;
    const old = this.board; if (old) this.root.remove(old);
    (this._own || []).forEach((r) => { try { r.dispose(); } catch (e) {} });
    const own = this._own = [];
    const keep = (r) => { own.push(r); return r; };
    const board = this.board = new T.Group();
    this.bw = g.W / g.cw; this.bd = g.H / g.cw;
    const N = game.N;
    // alvéoles : un InstancedMesh par primitive du modèle de cellule
    const cell = this.kit.SB_MATCH3_CELL_HEX;
    this.cellMeshes = [];
    this.cellPos = [];
    for (let i = 0; i < N; i++) { const c = game.center(i); this.cellPos.push(this.w(c.x, c.y)); }
    const cx = this.bw / 2, cz = this.bd / 2;
    this.cellDist = this.cellPos.map((p) => Math.hypot(p.x, p.z) / Math.hypot(cx, cz));
    const line = new T.Color(CELL_LINE[game.s.context] ?? CELL_LINE['']);
    cell.traverse((o) => {
      if (!o.isMesh) return;
      let mat = o.material;
      if (base(mat.name) === 'M_EMISSIVE_CYAN') {
        mat = keep(mat.clone()); mat.color = line.clone(); mat.emissive = line.clone(); mat.emissiveIntensity = 2.2;
      }
      const im = keep(new T.InstancedMesh(o.geometry, mat, N));
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.cellMeshes.push(im); board.add(im);
    });
    // socle et cadre métallique à bandes lumineuses
    // socle et liseré
    const pad = 0.45, W = this.bw + pad, D = this.bd + pad;
    const baseMat = keep(new T.MeshStandardMaterial({ color: 0x0b1017, metalness: 0.75, roughness: 0.42 }));
    const slab = new T.Mesh(keep(new T.BoxGeometry(W, 0.3, D)), baseMat); slab.position.y = -0.27; board.add(slab);
    const lip = keep(new T.MeshStandardMaterial({ color: line, emissive: line, emissiveIntensity: 1.4 }));
    [[W, 0.035, 0, -D / 2], [W, 0.035, 0, D / 2], [0.035, D, -W / 2, 0], [0.035, D, W / 2, 0]].forEach(([sx, sz, x, z]) => {
      const m = new T.Mesh(keep(new T.BoxGeometry(sx, 0.03, sz)), lip); m.position.set(x, -0.11, z); board.add(m);
    });
    // contours hexagonaux : sélection + indice
    const hex = keep(new T.RingGeometry(0.47, 0.53, 6, 1)); hex.rotateX(-Math.PI / 2); hex.rotateY(Math.PI / 6);
    this.selMesh = new T.Mesh(hex, keep(new T.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.95, depthWrite: false })));
    this.hintMeshes = [0, 1].map(() => new T.Mesh(hex, keep(new T.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.6, depthWrite: false }))));
    [this.selMesh, ...this.hintMeshes].forEach((m) => { m.visible = false; m.position.y = 0.045; board.add(m); });
    // flèche d'axe des charges
    const sh = new T.Shape();
    sh.moveTo(-0.46, -0.025); sh.lineTo(0.34, -0.025); sh.lineTo(0.34, -0.07); sh.lineTo(0.47, 0); sh.lineTo(0.34, 0.07); sh.lineTo(0.34, 0.025);
    sh.lineTo(-0.34, 0.025); sh.lineTo(-0.34, 0.07); sh.lineTo(-0.47, 0); sh.lineTo(-0.34, -0.07); sh.lineTo(-0.34, -0.025);
    this.arrowGeo = keep(new T.ShapeGeometry(sh)); this.arrowGeo.rotateX(-Math.PI / 2);
    this.arrowMat = keep(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.root.add(board);
    this._layoutCells(this.introT ?? 1);   // AUDIT_1110 : après une rotation, les alvéoles restent en place
    this.tiles.forEach((t) => this.root.remove(t.obj)); this.tiles.clear();
  }

  w(x, y) { return new this.T.Vector3(x / this.game.g.cw - this.bw / 2, 0, y / this.game.g.cw - this.bd / 2); }

  _layoutCells(introT) {
    const T = this.T, m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1);
    this.cellPos.forEach((p, i) => {
      const k = introT >= 1 ? 1 : ease(clamp01((introT * 1.7 - this.cellDist[i] * 0.7) / 0.55));
      const pos = new T.Vector3(p.x, -0.9 * (1 - k), p.z);
      s.setScalar(0.6 + 0.4 * k);
      m.compose(pos, q, s);
      this.cellMeshes.forEach((im) => im.setMatrixAt(i, m));
    });
    this.cellMeshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
  }

  // ── Cadrage : caméra inclinée, fenêtre recadrée sur le plateau (setViewOffset)
  resize(W, dpr) {
    const T = this.T, cam = this.camera;
    const th = TILT * Math.PI / 180, d = 16;
    cam.aspect = 1; cam.fov = 60; cam.clearViewOffset();
    cam.position.set(0, Math.cos(th) * d, Math.sin(th) * d);
    cam.lookAt(0, 0, 0.1);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const hx = this.bw / 2 + 0.3, hz = this.bd / 2 + 0.3;
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [-0.15, 0.75]) {
      const v = new T.Vector3(x, y, z).project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const FULL = 4096;
    const px0 = (x0 + 1) / 2 * FULL, px1 = (x1 + 1) / 2 * FULL, py0 = (1 - y1) / 2 * FULL, py1 = (1 - y0) / 2 * FULL;
    const w = px1 - px0, h = py1 - py0;
    this.view = { FULL, px0, py0, w, h };
    cam.setViewOffset(FULL, FULL, px0, py0, w, h);
    cam.updateProjectionMatrix();
    const H = Math.round(W * h / w);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, true);
    this.cssW = W; this.cssH = H;
    this.baseCamPos = cam.position.clone();
    return H;
  }

  // Écran → plateau (px logiques du 2D) par lancer de rayon sur le plan y = 0
  pick(clientX, clientY) {
    const T = this.T, r = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return { x: -1e4, y: -1e4 };
    const cw = this.game.g.cw;
    return { x: (hit.x + this.bw / 2) * cw, y: (hit.z + this.bd / 2) * cw };
  }

  // Plateau → écran (px CSS de la surcouche), pour les effets 2D
  project(x, y, h = 0.25) {
    const v = this.w(x, y); v.y = h;
    v.project(this.camera);
    return { x: (v.x + 1) / 2 * this.cssW, y: (1 - v.y) / 2 * this.cssH };
  }

  intro() { this.introT = 0; this.introStart = performance.now(); }
  wave(color = 0x9fdcff) {
    const T = this.T;
    const m = new T.Mesh(new T.RingGeometry(0.85, 1, 48), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06;
    this.board.add(m); this.waves.push({ m, t: 0 });
  }

  _tileObj(key, sp) {
    const T = this.T, kit = this.kit, tile = sp.tile;
    const g = new T.Group();
    const names = { metal: 'METAL', energie: 'ENERGY', cristal: 'CRYSTAL', biomass: 'BIOMASS', artefact: 'ARTIFACT' };
    const baseName = tile.type === 'rock' ? (key === 'rock_cracked' ? 'SB_MATCH3_TILE_ROCK_CRACKED' : 'SB_MATCH3_TILE_ROCK') : 'SB_MATCH3_TILE_' + names[tile.type];
    let src = null, own = false;
    if (this.skin) {
      const nm = this.skin.prefix + this.skin.names[tile.type === 'rock' ? (key === 'rock_cracked' ? 'rock_cracked' : 'rock') : tile.type];
      if (kit[nm]) { src = kit[nm]; own = true; }
    }
    if (!src) src = kit[baseName];
    if (src) {
      const c = src.clone();
      // tuiles de lieu : modelées face à la caméra, jamais tournées ; légèrement agrandies (gabarit plus petit que le kit)
      if (own) c.scale.setScalar(this.skin.scale);
      else c.rotation.y = tile.type === 'metal' || tile.type === 'cristal' ? ((tile.id * 7) % 6) * Math.PI / 3 : 0;
      g.add(c);
    }
    if (tile.special === 'charge' && kit.SB_MATCH3_TILE_CHARGE) {
      g.add(kit.SB_MATCH3_TILE_CHARGE.clone());
      const a = new T.Mesh(this.arrowGeo, this.arrowMat);
      const d = this.game.axisDir(tile.axis ?? 0);
      a.rotation.y = Math.atan2(-d.y, d.x); a.position.y = 0.04; g.add(a);
    }
    if (tile.special === 'core' && kit.SB_MATCH3_TILE_CORE) {
      const c = kit.SB_MATCH3_TILE_CORE.clone(); c.userData.spin = true; g.add(c);
      const glow = new T.PointLight(0xffd9a0, 1.2, 1.6); glow.position.y = 0.3; g.add(glow);
    }
    g.userData.key = key;
    return g;
  }

  // ── Image : synchronise les tuiles 3D avec les sprites du jeu
  render(game, t, dt) {
    const T = this.T, g = game.g, s = game.s;
    if (this.introT < 1) {
      this.introT = Math.min(1, (performance.now() - this.introStart) / 1500);   // horloge réelle : même durée à tout débit d'images
      this._layoutCells(this.introT);
      const k = ease(this.introT);
      this.root.rotation.y = -0.25 * (1 - k);
      this.camera.position.copy(this.baseCamPos).multiplyScalar(1 + 0.35 * (1 - k));
    } else {
      this.root.rotation.y = 0;
      this.camera.position.copy(this.baseCamPos);
    }
    const seen = new Set();
    const place = (sp, dying) => {
      const tile = sp.tile;
      const cracked = tile.type === 'rock' && (sp.hp ?? tile.hp) <= 1;
      const key = cracked ? 'rock_cracked' : tile.special ? `${tile.type}_${tile.special}_${tile.axis ?? ''}` : tile.type;
      let rec = this.tiles.get(tile.id);
      if (!rec || rec.key !== key) {
        if (rec) this.root.remove(rec.obj);
        rec = { key, obj: this._tileObj(key, sp) };
        this.tiles.set(tile.id, rec); this.root.add(rec.obj);
      }
      seen.add(tile.id);
      const o = rec.obj;
      let x = sp.x, y = sp.y, h = 0;
      if (sp.spawn && sp.y < sp.ty - 0.5) { x = sp.tx; y = sp.ty; h = (sp.ty - sp.y) / g.cw * 1.1; }
      if (sp.swap) h += Math.sin(Math.PI * sp.swap.t) * 0.35;
      const p = this.w(x, y);
      let sc = (sp.scale ?? 1) * TILE_SCALE, sy = 1;
      if (sp.land) { sy = 1 - 0.2 * sp.land; sc *= 1 + 0.07 * sp.land; }
      if (this.introT < 1 && sp.cell !== undefined) {
        const k = ease(clamp01((this.introT * 1.7 - 0.45 - this.cellDist[sp.cell] * 0.7) / 0.5));
        h += 4 * (1 - k);
      }
      if (s && s.sel === sp.cell && !dying) h += 0.1 + 0.04 * Math.sin(t * 6);
      if (dying) { const k = dying.t / dying.d; h += k * 0.9; sc *= 1 - k; o.rotation.y = k * 4; }
      o.position.set(p.x, h, p.z);
      o.scale.set(sc, sc * sy, sc);
      o.children.forEach((c) => { if (c.userData.spin) c.rotation.y = t * 1.6; });
    };
    game.sprites.forEach((sp) => place(sp, null));
    game.dying.forEach((d) => place(d.sp, d));
    this.tiles.forEach((rec, id) => { if (!seen.has(id)) { this.root.remove(rec.obj); this.tiles.delete(id); } });
    this.arrowMat.opacity = 0.55 + 0.4 * Math.sin(t * 6);
    // sélection / indice
    const setHex = (m, i, show) => {
      m.visible = show && i >= 0 && this.introT >= 1;
      if (m.visible) { const p = this.cellPos[i]; m.position.x = p.x; m.position.z = p.z; }
    };
    setHex(this.selMesh, s ? s.sel ?? -1 : -1, !!s);
    const hint = s && s.hint && !s.busy ? s.hint : null;
    this.hintMeshes.forEach((m, k) => { setHex(m, hint ? hint[k] : -1, !!hint); m.material.opacity = 0.35 + 0.35 * Math.sin(t * 5); });
    // vagues (paliers, conquête)
    this.waves = this.waves.filter((wv) => {
      wv.t += dt;
      const k = wv.t / 1.1, r = 0.5 + k * Math.max(this.bw, this.bd) * 0.8;
      wv.m.scale.set(r, r, r); wv.m.material.opacity = 0.8 * (1 - k);
      if (k >= 1) { this.board.remove(wv.m); wv.m.geometry.dispose(); wv.m.material.dispose(); return false; }
      return true;
    });
    this.renderer.render(this.scene, this.camera);
  }

  clear() {
    this.tiles.forEach((rec) => this.root.remove(rec.obj));
    this.tiles.clear();
  }
}

export { loadKit };
