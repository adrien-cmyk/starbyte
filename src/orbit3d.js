/* ═══════════════════════════════════════════════════════════════
   Starbyte — Couche 2 · ORBITE · Chantier naval (scène « hero »)
   Réf. : starbyte_doctrine_orbite_chantier_flotte.md,
          starbyte_couches_navigation_surface_orbite_espace.md

   « La planète est le lieu de la civilisation. L'orbite est le lieu de la flotte. »

   Direction « sobre » : peu de pièces, une seule lumière dure (le soleil),
   ombres profondes, palette quasi monochrome graphite, très peu de feux.
   Chantier = une poutre-épine en treillis qui fuit dans la profondeur, un
   module habité, deux postes d'amarrage à bras, une baie d'assemblage.
   Géométrie procédurale (pas de kit décoratif) ; vaisseaux issus du kit
   Blender (sb_orbit_hero.glb). Kerath-VII réduite à un liseré en bas.
   Accessible uniquement avec un chantier orbital construit.
   Three.js vient de la carte 3D (window.SB3D).
   ═══════════════════════════════════════════════════════════════ */

const KIT_URL = 'assets/3d/sb_orbit_hero.glb';      // tanker et sonde (kit v1), en attendant leur refonte
const SHIPS_URL = 'assets/3d/sb_ships_v3.glb';     // frégate, tanker, cuirassé d'après les illustrations (tools/ships_v3.py)
const TEX = { albedo: 'assets/3d/kerath_albedo.jpg', clouds: 'assets/3d/kerath_clouds.jpg', lights: 'assets/3d/kerath_lights.jpg' };
const TARGET = [0, 6, -14];               // point visé (m)
const CAM = { az: 1.85, el: 0.28, dist: 105, fov: 42 };   // 3/4 avant de la frégate, l'épine fuit en profondeur
const SUN_DIR = [-0.75, 0.45, -0.2];         // soleil unique, rasant et légèrement à contre-jour : arêtes brillantes, volumes dans l'ombre
const PLANET = { R: 2600, D: 1500, drop: 4100, side: 0 };   // limbe seulement, en bas du cadre
const base = (n) => n.replace(/\.?\d{3}$/, '');

export const hasShipyard = () => typeof G !== 'undefined' && G.planet && G.planet.parcels.some((p) => p.building === 'shipyard' && p.state === 'built');

// ── Texture de panneaux (R albédo · G rugosité · B relief), générée une fois, répétable
function panelTexture(T) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = 'rgb(200,128,190)'; x.fillRect(0, 0, S, S);
  const rects = [];
  const split = (x0, y0, w, h, d) => {
    if (d > 4 || (d > 1 && rnd() < 0.28) || w < 40 || h < 40) { rects.push([x0, y0, w, h]); return; }
    if (w > h ? rnd() < 0.8 : rnd() < 0.2) { const k = Math.round(w * (0.3 + rnd() * 0.4)); split(x0, y0, k, h, d + 1); split(x0 + k, y0, w - k, h, d + 1); }
    else { const k = Math.round(h * (0.3 + rnd() * 0.4)); split(x0, y0, w, k, d + 1); split(x0, y0 + k, w, h - k, d + 1); }
  };
  split(0, 0, S, S, 0);
  rects.forEach(([x0, y0, w, h]) => {
    const a = 150 + Math.floor(rnd() * 90), r = 90 + Math.floor(rnd() * 90), z = 185 + Math.floor(rnd() * 25);
    x.fillStyle = `rgb(${a},${r},${z})`; x.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    if (rnd() < 0.35) {                                 // trappe / module en léger creux
      const iw = w * (0.3 + rnd() * 0.35), ih = h * (0.25 + rnd() * 0.35), ix = x0 + (w - iw) * rnd(), iy = y0 + (h - ih) * rnd();
      x.fillStyle = `rgb(${a - 25},${r + 20},150)`; x.fillRect(ix, iy, iw, ih);
    }
    if (rnd() < 0.5) {                                  // rivets
      x.fillStyle = 'rgb(210,110,245)';
      [[4, 4], [w - 6, 4], [4, h - 6], [w - 6, h - 6]].forEach(([dx, dy]) => x.fillRect(x0 + dx, y0 + dy, 2, 2));
    }
    if (rnd() < 0.25) {                                 // bande de marquage
      x.fillStyle = `rgb(${a + 25},${r - 20},${z + 8})`; x.fillRect(x0 + 3, y0 + h * 0.15, w - 6, Math.max(3, h * 0.06));
    }
  });
  x.strokeStyle = 'rgb(70,200,40)'; x.lineWidth = 2;   // joints : sombres, rugueux, en creux
  rects.forEach(([x0, y0, w, h]) => x.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1));
  const img = x.getImageData(0, 0, S, S), d = img.data;       // usure légère
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 18; d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 1.4)); }
  x.putImageData(img, 0, 0);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; t.colorSpace = T.NoColorSpace;
  return t;
}

// Matériau panneauté en triplanaire (espace objet) : albédo, rugosité et relief des joints
function panelize(mat, tex, { scale = 0.3, bump = 0.9, alb = 0.55, rough = 0.5 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { pTex: { value: tex }, pScale: { value: scale }, pBump: { value: bump }, pAlb: { value: alb }, pRough: { value: rough } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPObj; varying vec3 vNObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPObj = position; vNObj = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D pTex; uniform float pScale, pBump, pAlb, pRough; varying vec3 vPObj; varying vec3 vNObj;
        vec4 triS(vec3 p, vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
          return texture2D(pTex, p.zy * pScale) * w.x + texture2D(pTex, p.xz * pScale) * w.y + texture2D(pTex, p.xy * pScale) * w.z; }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 pS = triS(vPObj, normalize(vNObj));\ndiffuseColor.rgb *= mix(1.0, pS.r * 1.35, pAlb);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (pS.g - 0.5) * pRough, 0.06, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float hh = pS.b; vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(hh), dhy = dFdy(hh);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2); normal = normalize(abs(det) * normal - grad * pBump); }`);
  };
  mat.customProgramCacheKey = () => 'panel' + scale + bump;
  return mat;
}

// Plume de propulsion : cœur blanc/bleu, longue plume cyan qui s'affine, halo intense à la tuyère
function makePlume(T, haloTex) {
  const g = new T.Group();
  const mk = (rTip, rBase, core) => {
    const geo = new T.CylinderGeometry(rTip, rBase, 1, 28, 24, true);
    geo.translate(0, 0.5, 0); geo.rotateX(-Math.PI / 2);                 // de la tuyère (z=0) vers l'arrière (z=−1)
    const m = new T.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uI: { value: 1 }, uCore: { value: core ? 1 : 0 } },
      vertexShader: `varying float vV; varying vec3 vN; varying vec3 vVw;
        void main(){ vV = -position.z; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vVw = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uT, uI, uCore; varying float vV; varying vec3 vN; varying vec3 vVw;
        void main(){
          float face = pow(abs(dot(normalize(vN), vVw)), 1.4);
          float fall = pow(1.0 - clamp(vV, 0.0, 1.0), uCore > 0.5 ? 3.0 : 2.1);
          float bands = 1.0 + 0.18 * sin(vV * 46.0 - uT * 38.0) * (1.0 - vV);
          vec3 hot = vec3(0.92, 0.97, 1.0), cyan = vec3(0.25, 0.72, 1.0), deep = vec3(0.06, 0.22, 1.0);
          vec3 c = mix(hot, cyan, smoothstep(0.0, uCore > 0.5 ? 0.6 : 0.2, vV));
          c = mix(c, deep, smoothstep(0.35, 1.0, vV));
          float a = fall * (0.25 + 0.75 * face) * bands * uI;
          gl_FragColor = vec4(c * a * (uCore > 0.5 ? 2.6 : 1.25), a);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    const mesh = new T.Mesh(geo, m); mesh.frustumCulled = false; return mesh;
  };
  g.userData.outer = mk(0.18, 1.0, false); g.userData.core = mk(0.05, 0.55, true);
  g.add(g.userData.outer, g.userData.core);
  const halo = new T.Sprite(new T.SpriteMaterial({ map: haloTex, color: 0xa8dcff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  g.add(halo); g.userData.halo = halo;
  g.userData.set = (len, rad, inten, t) => {
    g.userData.outer.scale.set(rad, rad, len); g.userData.core.scale.set(rad, rad, len * 0.2);
    [g.userData.outer, g.userData.core].forEach((m) => { m.material.uniforms.uI.value = inten; m.material.uniforms.uT.value = t; });
    halo.scale.setScalar(rad * 4 * (0.6 + 0.4 * inten)); halo.material.opacity = Math.min(0.9, inten);
    g.visible = inten > 0.01;
  };
  return g;
}

function haloTexture(T) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.85)'); gr.addColorStop(0.35, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

// ── Chantier orbital procédural : peu d'éléments, lisibles, crédibles
function buildStation(T, M) {
  const g = new T.Group();
  const box = new T.BoxGeometry(1, 1, 1);
  const Z = new T.Vector3(0, 0, 1);
  const beams = {};                                        // matériau → liste de poutres (instanciées)
  const beam = (a, b, w, mat = 'steel', h = w) => (beams[mat] ||= []).push([new T.Vector3(...a), new T.Vector3(...b), w, h]);
  const mesh = (geo, mat, pos, rot) => { const m = new T.Mesh(geo, M[mat]); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const S = { sockets: {}, nav: [], welds: [], windows: [] };

  // Épine : poutre-caisson massive 8 × 8 m ; une section ouverte en treillis au droit de la baie d'assemblage
  const X0 = -150, X1 = 55, H = 4, STEP = 10, TA = -70, TB = -20;
  const solid = (a, b) => mesh(new T.BoxGeometry(b - a, 2 * H, 2 * H), 'graphite', [(a + b) / 2, 0, 0]);
  solid(X0, TA); solid(TB, X1);
  for (const x of [TA, TB]) mesh(new T.BoxGeometry(1.6, 2 * H + 1.2, 2 * H + 1.2), 'steel', [x, 0, 0]);
  for (const y of [-H, H]) for (const z of [-H, H]) beam([TA, y, z], [TB, y, z], 0.8, 'steel');
  for (let x = TA, i = 0; x < TB; x += STEP, i++) {
    const f = i % 2 ? 1 : -1, n = x + STEP;
    if (x > TA) { beam([x, -H, -H], [x, H, -H], 0.45); beam([x, -H, H], [x, H, H], 0.45); beam([x, H, -H], [x, H, H], 0.45); beam([x, -H, -H], [x, -H, H], 0.45); }
    beam([x, -H * f, -H], [n, H * f, -H], 0.3); beam([x, -H * f, H], [n, H * f, H], 0.3);
    beam([x, H, -H * f], [n, H, H * f], 0.3); beam([x, -H, -H * f], [n, -H, H * f], 0.3);
  }
  // jointures de la poutre-caisson : rares, affleurantes
  for (let x = X0 + 40; x < X1; x += 40) if (x < TA - 1 || x > TB + 1) mesh(new T.BoxGeometry(0.5, 2 * H + 0.2, 2 * H + 0.2), 'steel', [x, 0, 0]);
  // conduite de service le long de l'épine (côté caméra)
  mesh(new T.CylinderGeometry(0.7, 0.7, X1 - X0, 12), 'steel', [(X0 + X1) / 2, -1.6, -H - 0.9], [0, 0, Math.PI / 2]);
  // module de queue
  mesh(new T.BoxGeometry(9, 11, 11), 'graphite', [X0 - 4.5, 0, 0]);

  // Module habité : cylindre sobre, anneaux de jointure, rangée de hublots
  mesh(new T.CylinderGeometry(7.5, 7.5, 3, 40), 'graphite', [X1 + 1.5, 0, 0], [0, 0, Math.PI / 2]);
  mesh(new T.CylinderGeometry(6, 6, 36, 40), 'panel', [X1 + 21, 0, 0], [0, 0, Math.PI / 2]);
  for (const x of [X1 + 9, X1 + 21, X1 + 33]) mesh(new T.CylinderGeometry(6.25, 6.25, 0.8, 40), 'graphite', [x, 0, 0], [0, 0, Math.PI / 2]);
  mesh(new T.CylinderGeometry(2.6, 6, 5, 40), 'graphite', [X1 + 41.5, 0, 0], [0, 0, -Math.PI / 2]);
  mesh(new T.CylinderGeometry(1.8, 1.8, 3, 20), 'steel', [X1 + 45.5, 0, 0], [0, 0, Math.PI / 2]);
  const win = new T.BoxGeometry(1.6, 0.55, 0.3);
  for (let i = 0; i < 7; i++) { const w = mesh(win, 'window', [X1 + 12 + i * 3.4, 1.8, -5.78]); w.castShadow = false; w.rotation.x = -0.3; S.windows.push(w); }
  // mât de balise
  mesh(new T.CylinderGeometry(0.22, 0.22, 11, 8), 'steel', [X1 + 26, 11, 0]);
  S.nav.push([[X1 + 26, 16.7, 0], 0xffffff, 1.3, 0.0]);

  // Radiateurs : deux panneaux fins au loin, de chant au soleil
  for (const s of [1, -1]) {
    beam([-118, s * H, 0], [-118, s * 9, 0], 0.6, 'steel');
    mesh(new T.BoxGeometry(16, 22, 0.3), 'radiator', [-118, s * 20, 0]);
  }

  // Postes d'amarrage : bras de maintien depuis l'épine jusqu'à la coque, patins de serrage
  const berth = (key, cx, zc, span, arms) => {
    S.sockets[key] = { pos: new T.Vector3(cx, -1, zc) };
    arms.forEach((dx) => {
      for (const y of [-2.2, 1.8]) beam([cx + dx, y, -H], [cx + dx, y, zc + span], 0.9, 'graphite');
      mesh(new T.BoxGeometry(1.8, 3.2, 0.6), 'graphite', [cx + dx, -0.2, zc + span - 0.3]);
    });
    mesh(new T.CylinderGeometry(0.35, 0.35, Math.abs(zc + span + H), 8), 'steel', [cx + arms[1] + 3, 3, (zc + span - H) / 2], [Math.PI / 2, 0, 0]);
  };
  berth('BERTH_1', 18, -19.8, 7.0, [-9, 1, 11]);
  berth('BERTH_2', -86, -22.6, 9.0, [-11, 0, 11]);

  // Baie d'assemblage : quille + couples en U (coque en construction), portique mobile
  const bx = -44, bz = -17;
  beam([bx - 17, -1, bz], [bx + 17, -1, bz], 1.1, 'graphite');
  const rib = new T.TorusGeometry(5.2, 0.32, 6, 28, Math.PI);
  for (let i = 0; i < 6; i++) mesh(rib, 'steel', [bx - 14 + i * 5.6, -1, bz], [0, Math.PI / 2, Math.PI]);
  const plate = new T.CylinderGeometry(5.3, 5.3, 11, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  mesh(plate, 'graphite', [bx - 8.4, -1, bz], [0, 0, Math.PI / 2]).material.side = T.DoubleSide;
  for (const dx of [-12, 12]) beam([bx + dx, -2.2, -H], [bx + dx, -2.2, bz + 5.6], 0.8, 'graphite');
  const gantry = new T.Group();
  const gb = (a, b, w) => { const d = new T.Vector3(...b).sub(new T.Vector3(...a)), m = new T.Mesh(box, M.graphite); m.scale.set(w, w, d.length()); m.position.set(...a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(Z, d.clone().normalize()); m.castShadow = m.receiveShadow = true; gantry.add(m); };
  gb([0, H, -H], [0, 11, -H], 0.9); gb([0, 11, -H], [0, 11, bz - 7], 0.9); gb([0, 11, bz - 7], [0, 0, bz - 7], 0.9);
  const head = new T.Mesh(new T.BoxGeometry(2.4, 1.6, 2.4), M.graphite); head.position.set(0, 9.6, bz); head.castShadow = true; gantry.add(head);
  gantry.position.x = bx; g.add(gantry); S.gantry = gantry; S.bay = { x: bx, z: bz };
  S.welds = [[bx - 8, 3.4, bz - 3.6], [bx - 2, -5.8, bz - 1.8], [bx + 5, 2.2, bz + 4.1]];

  // feux de navigation : peu nombreux, petits
  S.nav.push([[X0 - 9, 5.8, -5.6], 0xff3322, 0.9, 0.5], [[X1 + 47, 0, -2], 0x33ff77, 0.9, 0.0], [[-118, 31.3, 0], 0xffffff, 0.8, 0.25], [[-118, -31.3, 0], 0xffffff, 0.8, 0.75]);

  // instanciation des poutres
  Object.entries(beams).forEach(([mat, list]) => {
    const im = new T.InstancedMesh(box, M[mat], list.length), m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3();
    list.forEach(([a, b, w, h], i) => {
      const d = b.clone().sub(a);
      q.setFromUnitVectors(Z, d.clone().normalize()); sc.set(w, h, d.length());
      m4.compose(a.clone().addScaledVector(d, 0.5), q, sc); im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true; g.add(im);
  });
  S.group = g;
  return S;
}

export const SBOrbit = {
  el: null, ready: false, running: false,

  mount() {
    if (this.el) return;
    const el = this.el = document.createElement('div');
    el.id = 'scr-orbit'; el.className = 'screen hidden';
    el.innerHTML = `
      <div class="o-view" id="o-view"></div>
      <div class="o-ui">
        <div class="o-top">
          <div class="o-title"><b id="o-planet">KERATH-VII</b><span>ORBITE · CHANTIER NAVAL</span></div>
          <button class="o-x" aria-label="Retour sur la planète">×</button>
        </div>
        <div class="o-bottom">
          <div class="o-counts" id="o-counts"></div>
          <div class="o-note" id="o-note"></div>
          <div class="o-acts">
            <button data-a="build">Construire</button>
            <button data-a="fleet">Flottes</button>
          </div>
        </div>
      </div>
      <div class="o-load" id="o-load"><span>MISE EN ORBITE</span></div>`;
    document.body.appendChild(el);
    el.querySelector('.o-x').onclick = () => this.leave();
    el.querySelector('[data-a="build"]').onclick = () => goto('shipyard');
    el.querySelector('[data-a="fleet"]').onclick = () => goto('fleet');
    new MutationObserver(() => {
      const on = !el.classList.contains('hidden');
      if (on && !this.running) this._enter(); else if (!on) this.running = false;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  },

  open() {
    if (!hasShipyard()) { if (typeof toast === 'function') toast('Construis le chantier orbital pour accéder à l\'orbite'); return; }
    if (typeof G !== 'undefined' && G.orbitUnseen) { G.orbitUnseen = false; if (typeof saveGame === 'function') saveGame(); }
    this.mount();
    this._fade(() => goto('orbit'));
  },
  leave() { this._fade(() => goto('planet')); },
  _fade(fn) {
    const f = document.createElement('div'); f.className = 'o-flash'; document.body.appendChild(f);
    requestAnimationFrame(() => f.classList.add('on'));
    setTimeout(() => { fn(); f.classList.remove('on'); setTimeout(() => f.remove(), 450); }, 280);
  },

  async _init() {
    if (this.ready) return;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const { THREE: T, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.SB3D;
      this.T = T;
      const host = document.getElementById('o-view');
      const r = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.3;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
      r.setClearColor(0x000000, 1);
      host.appendChild(r.domElement);
      const scene = this.scene = new T.Scene();
      scene.fog = new T.FogExp2(0x04070b, 0.0016);
      const sunDir = new T.Vector3(...SUN_DIR).normalize();
      this.sunDir = sunDir;
      this.haloTex = haloTexture(T);

      // environnement : noir, très léger reflet froid venu du bas (planète), soleil
      {
        const env = new T.Scene();
        env.add(new T.Mesh(new T.SphereGeometry(100, 48, 24), new T.ShaderMaterial({
          side: T.BackSide, uniforms: { sd: { value: sunDir } },
          vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: `uniform vec3 sd; varying vec3 vD; void main(){
            vec3 c = vec3(0.002, 0.003, 0.005);
            c += vec3(0.05, 0.08, 0.12) * smoothstep(0.1, -0.8, vD.y) + vec3(0.02) * smoothstep(-0.2, 0.8, vD.y);
            float s = max(dot(vD, sd), 0.0); c += vec3(1.0, 0.96, 0.9) * (pow(s, 800.0) * 40.0 + pow(s, 16.0) * 0.08);
            gl_FragColor = vec4(c, 1.0); }`,
        })));
        const pm = new T.PMREMGenerator(r);
        scene.environment = pm.fromScene(env, 0).texture; scene.environmentIntensity = 0.7; pm.dispose();
      }
      // une seule vraie lumière : le soleil. Un soupçon de rebond planétaire, froid, par-dessous.
      const sun = this.sun = new T.DirectionalLight(0xffe9cf, 4.6);
      sun.position.copy(sunDir).multiplyScalar(300); sun.target.position.set(-30, 0, -10);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 110, bottom: -110, near: 100, far: 620 });
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35; sun.shadow.radius = 2;
      scene.add(sun, sun.target);
      const bounce = new T.DirectionalLight(0x5f7fa6, 0.25); bounce.position.set(0, -300, -60); scene.add(bounce);
      const rim = new T.DirectionalLight(0xa9bdd4, 0.9); rim.position.set(-90, 60, 280); scene.add(rim);   // contre-jour froid : détache les silhouettes du noir
      this.camera = new T.PerspectiveCamera(CAM.fov, 1, 1, 20000);

      // étoiles : rares et discrètes
      {
        const n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, rr = 9000, s = Math.sqrt(1 - u * u);
          pos.set([rr * s * Math.cos(a), rr * u, rr * s * Math.sin(a)], i * 3);
          const b = Math.pow(Math.random(), 4) * 0.55 + 0.06;
          col.set([b, b, b * 1.04], i * 3);
        }
        const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(pos, 3)); gg.setAttribute('color', new T.BufferAttribute(col, 3));
        scene.add(new T.Points(gg, new T.PointsMaterial({ size: 1.2, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false })));
      }

      // Kerath-VII : réduite à un liseré. Côté nuit sombre, atmosphère fine.
      const load = (u) => new Promise((ok, ko) => new T.TextureLoader().load(u, ok, undefined, ko));
      const [tAlb, tCld, tLit] = await Promise.all([load(TEX.albedo), load(TEX.clouds), load(TEX.lights)]);
      tAlb.colorSpace = T.SRGBColorSpace; tLit.colorSpace = T.SRGBColorSpace;
      [tAlb, tCld, tLit].forEach((t) => { t.anisotropy = 8; });
      const P = this.planet = new T.Group();
      const pm = new T.MeshStandardMaterial({ map: tAlb, color: 0x80868d, roughness: 0.9, metalness: 0, emissiveMap: tLit, emissive: 0xffc890, emissiveIntensity: 0.9, fog: false });
      pm.onBeforeCompile = (sh) => {
        sh.uniforms.sunW = { value: sunDir };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 sunW;')
          .replace('#include <map_fragment>', '#include <map_fragment>\n{ float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 0.45); }')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            { vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz); totalEmissiveRadiance *= smoothstep(0.05, -0.2, dot(nW, sunW)); }`);
      };
      P.add(new T.Mesh(new T.SphereGeometry(PLANET.R, 160, 96), pm));
      this.clouds = new T.Mesh(new T.SphereGeometry(PLANET.R * 1.005, 160, 96), new T.MeshStandardMaterial({ color: 0xd8dde2, alphaMap: tCld, transparent: true, opacity: 0.75, depthWrite: false, roughness: 1, fog: false }));
      P.add(this.clouds);
      P.add(new T.Mesh(new T.SphereGeometry(PLANET.R * 1.018, 128, 64), new T.ShaderMaterial({
        uniforms: { sunW: { value: sunDir } },
        vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform vec3 sunW; varying vec3 vN; varying vec3 vW; void main(){
          vec3 v = normalize(cameraPosition - vW); float f = 1.0 - abs(dot(v, vN));
          float lit = smoothstep(-0.25, 0.35, dot(vN, sunW));
          float a = pow(f, 5.0) * lit;
          gl_FragColor = vec4(vec3(0.42, 0.62, 0.9) * a * 1.4, a); }`,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      })));
      P.rotation.set(0.25, 2.2, 0.1);
      scene.add(P);

      // Matériaux : graphite, acier, un seul panneau clair, hublots chauds, rien d'autre
      const tex = this.panelTex = panelTexture(T);
      const M = this.M = {
        graphite: panelize(new T.MeshStandardMaterial({ color: 0x656a72, metalness: 0.35, roughness: 0.48 }), tex, { scale: 0.075, bump: 0.2, alb: 0.05, rough: 0.25 }),
        steel: new T.MeshStandardMaterial({ color: 0x8d939b, metalness: 0.45, roughness: 0.62 }),
        panel: panelize(new T.MeshStandardMaterial({ color: 0xbabec3, metalness: 0.1, roughness: 0.58 }), tex, { scale: 0.16, bump: 0.5, alb: 0.12, rough: 0.25 }),
        radiator: new T.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.6, roughness: 0.32 }),
        window: new T.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffc58f, emissiveIntensity: 1.6, roughness: 0.3 }),
      };
      const st = this.st = buildStation(T, M);
      scene.add(st.group);
      this.sockets = st.sockets;
      // feux : petits points, clignotement lent
      this.navs = st.nav.map(([p, c, s, ph]) => {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: this.haloTex, color: c, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        sp.position.set(...p); sp.scale.setScalar(s); sp.userData = { s, ph }; scene.add(sp); return sp;
      });
      this.weldSprites = st.welds.map((p) => {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: this.haloTex, color: 0xfff1dc, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        sp.position.set(...p); sp.scale.setScalar(0.01); scene.add(sp); return sp;
      });
      this.weldLight = new T.PointLight(0xffc890, 0, 22, 2); scene.add(this.weldLight);

      // Vaisseaux (kit Blender), matériaux ramenés à la même palette
      const gltf = await new GLTFLoader().loadAsync(KIT_URL);
      const kit = this.kit = {};
      gltf.scene.children.slice().forEach((o) => { kit[base(o.name)] = o; });
      try { (await new GLTFLoader().loadAsync(SHIPS_URL)).scene.children.slice().forEach((o) => { if (/^SB_SHIP_/.test(base(o.name))) kit[base(o.name)] = o; }); }
      catch (e) { console.warn('[Orbit] vaisseaux v2 indisponibles', e); }
      const SHIP = {
        M_SHIP_HULL: M.graphite,
        M_SHIP_PANEL: panelize(new T.MeshStandardMaterial({ color: 0x70757c, metalness: 0.25, roughness: 0.62 }), tex, { scale: 0.19, bump: 0.35, alb: 0.08, rough: 0.25 }),
        M_SHIP_ENGINE: new T.MeshStandardMaterial({ color: 0x141518, metalness: 0.9, roughness: 0.35 }),
        M_SHIP_GLOW: new T.MeshStandardMaterial({ color: 0x0a0c0f, emissive: 0xbfd8f0, emissiveIntensity: 0.9, roughness: 0.4 }),
      };
      // palette des illustrations : blanc cassé, noir mécanique, rouge, jaune industriel usé, feux
      const pz = (c, o, p) => panelize(new T.MeshStandardMaterial({ color: c, ...o }), tex, p);
      Object.assign(SHIP, {
        M_SB_WHITE: pz(0xd3d6d9, { metalness: 0.12, roughness: 0.5 }, { scale: 0.34, bump: 0.45, alb: 0.14, rough: 0.25 }),
        M_SB_BLACK: pz(0x222428, { metalness: 0.5, roughness: 0.52 }, { scale: 0.4, bump: 0.5, alb: 0.2, rough: 0.3 }),
        M_SB_GUN: pz(0x41454b, { metalness: 0.65, roughness: 0.42 }, { scale: 0.5, bump: 0.4, alb: 0.15, rough: 0.25 }),
        M_SB_RED: pz(0xa3161b, { metalness: 0.15, roughness: 0.48 }, { scale: 0.34, bump: 0.4, alb: 0.14, rough: 0.25 }),
        M_SB_YELLOW: pz(0xc28e1c, { metalness: 0.2, roughness: 0.62 }, { scale: 0.3, bump: 0.6, alb: 0.4, rough: 0.35 }),
        M_SB_GLASS: new T.MeshStandardMaterial({ color: 0x0a1116, metalness: 0.6, roughness: 0.08 }),
        M_SB_ENGINE: new T.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.85, roughness: 0.35 }),
        M_SB_GLOW_CYAN: new T.MeshStandardMaterial({ color: 0x050a0c, emissive: 0x74e6ff, emissiveIntensity: 2.2 }),
        M_SB_GLOW_AMBER: new T.MeshStandardMaterial({ color: 0x0c0802, emissive: 0xffb24a, emissiveIntensity: 2.0 }),
        M_SB_GLOW_RED: new T.MeshStandardMaterial({ color: 0x0c0202, emissive: 0xff2a1a, emissiveIntensity: 2.2 }),
        M_SB_GLOW_BLUE: new T.MeshStandardMaterial({ color: 0x02060c, emissive: 0x62b8ff, emissiveIntensity: 3.0 }),
      });
      ['SB_SHIP_FRIGATE', 'SB_SHIP_TANKER', 'SB_SHIP_CUIRASSE', 'SB_SHIP_PROBE'].forEach((k) => kit[k] && kit[k].traverse((o) => {
        if (!o.isMesh) return;
        const n = base(o.material.name || '');
        o.material = SHIP[n] || (/GLOW|NAV|WINDOW|CYAN|FLOOD|AMBER/.test(n) ? SHIP.M_SHIP_GLOW : n.includes('HAZARD') ? M.graphite : SHIP.M_SHIP_PANEL);
        o.castShadow = o.receiveShadow = true;
      }));
      this.fleetGroup = new T.Group(); scene.add(this.fleetGroup);

      // vaisseau de trafic : quitte le poste 2 au loin, propulsion principale
      if (kit.SB_SHIP_FRIGATE) {
        const tr = this.traffic = kit.SB_SHIP_FRIGATE.clone();
        const plumes = [];
        tr.traverse((o) => { if (/^ENGINE_F/.test(base(o.name))) { const p = makePlume(T, this.haloTex); o.add(p); plumes.push(p); } });
        this.trafficPlumes = plumes;
        scene.add(tr);
      }

      // post-traitement : bloom très retenu (moteurs, hublots)
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(scene, this.camera));
      this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.32, 0.45, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());

      this._placePlanet(CAM);

      const onResize = () => {
        const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
        r.setSize(w, h, false); r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
        this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2);
        this.camera.aspect = w / h;
        this.fit = w / h < 0.6 ? 1.0 : 0.85;
        this.camera.updateProjectionMatrix();
      };
      new ResizeObserver(onResize).observe(host); onResize();
      this._bindInput(r.domElement);
      this.ready = true;
    })();
    return this._loading;
  },

  // planète placée sous le cadrage : seul son limbe entre dans l'image
  _placePlanet(C) {
    const T = this.T, PL = C.planet || PLANET, tgt = new T.Vector3(...(C.tgt || TARGET));
    const view = this._camDir(C.az, C.el).negate(), up = new T.Vector3(0, 1, 0), right = new T.Vector3().crossVectors(view, up).normalize();
    view.y = 0; view.normalize();
    this.planet.position.copy(tgt).addScaledVector(view, PL.D).addScaledVector(up, -PL.drop).addScaledVector(right, PL.side);
  },

  _camDir(az, el) { return new this.T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); },

  // glisser : tourner autour du chantier (bornes douces) · toucher bref : masquer / afficher l'interface
  _bindInput(cv) {
    this.yaw = 0; this.pitch = 0;
    let d = null;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => { d = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, t: performance.now() }; this.drag = true; cv.setPointerCapture?.(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!d) return;
      this.yaw = Math.max(-0.4, Math.min(0.4, d.yaw - (e.clientX - d.x) * 0.004));
      this.pitch = Math.max(-0.1, Math.min(0.25, d.pitch + (e.clientY - d.y) * 0.003));
    });
    const up = (e) => {
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 350) this.el.classList.toggle('photo');
      d = null; this.drag = false;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { d = null; this.drag = false; });
  },

  // Flotte : un vaisseau représentatif par poste ; les quantités exactes restent dans l'interface
  _populate() {
    const kit = this.kit, g = this.fleetGroup;
    while (g.children.length) g.remove(g.children[0]);
    const st = (typeof G !== 'undefined' && G.fleet && G.fleet.stationed) || {};
    const sum = (k) => Object.values(st[k] || {}).reduce((a, b) => a + (b || 0), 0);
    const n = { cuirasse: sum('cuirasse'), fregate: sum('fregate'), tanker: sum('tanker') };
    const probes = (typeof G !== 'undefined' && Array.isArray(G.probesPool)) ? G.probesPool.filter((p) => !p.status || /ready|idle|dispo/.test(p.status)).length : 0;
    const make = (type) => {
      const src = type === 'tanker' ? kit.SB_SHIP_TANKER : type === 'cuirasse' ? (kit.SB_SHIP_CUIRASSE || kit.SB_SHIP_FRIGATE) : kit.SB_SHIP_FRIGATE;
      const o = src.clone(); if (type === 'cuirasse' && !kit.SB_SHIP_CUIRASSE) o.scale.setScalar(1.3);
      return o;
    };
    const place = (type, key) => {
      const s = this.sockets[key]; if (!type || !s) return;
      const o = make(type); o.position.copy(s.pos); o.rotation.y = Math.PI / 2; o.userData.type = type;     // nez vers +X, le long de l'épine
      g.add(o);
    };
    place(n.fregate ? 'fregate' : n.cuirasse ? 'cuirasse' : n.tanker ? 'tanker' : null, 'BERTH_1');
    place(n.tanker ? 'tanker' : n.cuirasse ? 'cuirasse' : n.fregate > 1 ? 'fregate' : null, 'BERTH_2');
    this.trafficOn = n.fregate + n.cuirasse + n.tanker > 1;
    // cuirassé : trop long pour un poste, il stationne sous le chantier, parallèle à l'épine
    if (n.cuirasse && !g.children.some((o) => o.userData.type === 'cuirasse')) {
      const o = make('cuirasse'); o.position.set(-34, -34, -20); o.rotation.set(0.04, Math.PI / 2, 0.02);
      o.userData.hold = o.position.y; g.add(o);
    }
    // sonde : en attente près du module habité
    if (probes && kit.SB_SHIP_PROBE) { const p = kit.SB_SHIP_PROBE.clone(); p.scale.setScalar(1.6); p.userData.probe = true; g.add(p); }
    const lab = { fregate: 'Frégates', cuirasse: 'Cuirassés', tanker: 'Tankers' };
    const parts = Object.entries(n).filter(([, v]) => v > 0).map(([k2, v]) => `<span><b>${v}</b>${lab[k2]}</span>`);
    if (probes) parts.push(`<span><b>${probes}</b>Sondes</span>`);
    document.getElementById('o-counts').innerHTML = parts.join('<i>·</i>') || '<span class="o-mut">Postes d\'amarrage libres</span>';
    const note = document.getElementById('o-note');
    note.textContent = n.fregate + n.cuirasse + n.tanker ? '' : 'Poste 01 prêt. Construis ton premier vaisseau.';
    note.style.display = note.textContent ? '' : 'none';
    const name = (typeof G !== 'undefined' && G.planet && G.planet.name) || 'Kerath-VII';
    document.getElementById('o-planet').textContent = name.toUpperCase();
  },

  async _enter() {
    this.running = true;
    const load = document.getElementById('o-load');
    load.classList.add('on');
    try { await this._init(); } catch (e) { console.warn('[Orbit]', e); load.classList.remove('on'); if (typeof toast === 'function') toast('Vue orbitale indisponible'); return; }
    this._populate();
    load.classList.remove('on');
    const T = this.T, cam = this.camera, tgt = new T.Vector3(...TARGET);
    const t0 = performance.now(); let last = t0;
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      this._t = t;
      const C = this.dbgCam || CAM;
      if (C !== this._lastC) { this._lastC = C; tgt.set(...(C.tgt || TARGET)); this._placePlanet(C); cam.fov = C.fov || CAM.fov; cam.updateProjectionMatrix(); if (C.sun) { this.sunDir.set(...C.sun).normalize(); this.sun.position.copy(this.sunDir).multiplyScalar(300); } }
      // arrivée : lent travelling avant (≈2,4 s), puis dérive imperceptible
      const k = Math.min(1, t / 2.4), e = 1 - Math.pow(1 - k, 3);
      const az = C.az + this.yaw + (this.drag ? 0 : 0.02 * Math.sin(t * 0.05)) - 0.12 * (1 - e);
      const el = C.el + this.pitch + 0.008 * Math.sin(t * 0.07);
      const dist = C.dist * (this.fit || 1) * (1 + 0.35 * (1 - e));
      cam.position.copy(tgt).addScaledVector(this._camDir(az, el), dist);
      cam.lookAt(tgt);
      this.planet.rotation.y += dt * 0.0008; this.clouds.rotation.y += dt * 0.0012;
      // feux : éclat bref toutes les ~2 s
      this.navs.forEach((s) => { const ph = (t * 0.45 + s.userData.ph) % 1; s.material.opacity = ph < 0.06 ? 1 : 0.12; s.scale.setScalar(s.userData.s * (ph < 0.06 ? 1.6 : 1)); });
      // portique : va-et-vient lent au-dessus de la baie
      if (this.st.gantry) this.st.gantry.position.x = this.st.bay.x + Math.sin(t * 0.05) * 11;
      // soudure : intermittente, discrète
      const wi = Math.floor(t / 3.1) % this.weldSprites.length, on = (t % 3.1) < 1.2;
      this.weldSprites.forEach((s, i) => {
        const f = i === wi && on ? 0.5 + Math.random() * 0.5 : 0;
        s.scale.setScalar(0.01 + f * 0.9); s.material.opacity = f * 0.8;
        if (i === wi) { this.weldLight.position.copy(s.position); this.weldLight.intensity = f * 30; }
      });
      this.fleetGroup.children.forEach((o) => {
        if (o.userData.hold !== undefined) o.position.y = o.userData.hold + Math.sin(t * 0.12) * 0.6;
        if (o.userData.probe) { const a = t * 0.03; o.position.set(92 + Math.cos(a) * 6, -12 + Math.sin(t * 0.15) * 0.6, -18 + Math.sin(a) * 4); o.rotation.set(0.1, a * 2, 0.05); }
      });
      this._trafficStep(t);
      this.composer.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  // Départ : un vaisseau quitte le côté caché de l'épine, s'élève et s'éloigne dans le noir (cycle de 48 s)
  _trafficStep(t) {
    const tr = this.traffic; if (!tr) return;
    if (!this.trafficOn) { tr.visible = false; return; }
    const T = this.T, c = this.dbgC !== undefined ? this.dbgC : (t + 4) % 48;
    if (c > 30) { tr.visible = false; return; }
    const start = new T.Vector3(-83, -12, -1), dir = new T.Vector3(-0.82, 0.38, 0.43).normalize();
    const k = Math.min(1, c / 6), e = k * k * (3 - 2 * k);
    const pos = start.clone().addScaledVector(dir, 0.4 * c * c + 1.1 * c);
    const look = new T.Vector3(1, 0, 0).lerp(dir, e).normalize();
    const inten = Math.min(0.8, Math.max(0, (c - 3) / 4) * 0.8), len = 14 + Math.min(55, c * 3.2);
    tr.visible = true;
    tr.position.copy(pos);
    tr.lookAt(pos.clone().add(look));
    this.trafficPlumes.forEach((p) => p.userData.set(len, 1.0, inten, t));
  },
};

const css = document.createElement('style');
css.textContent = `
  #scr-orbit { background:#010205; }
  #scr-orbit .o-view { position:absolute; inset:0; }
  #scr-orbit .o-view canvas { display:block; }
  #scr-orbit .o-ui { transition:opacity .35s ease; }
  #scr-orbit.photo .o-ui { opacity:0; pointer-events:none; }
  #scr-orbit .o-top { position:absolute; left:0; right:0; top:0; display:flex; justify-content:space-between; align-items:flex-start; padding:calc(var(--sai) + 14px) 12px 0 20px; pointer-events:none; }
  #scr-orbit .o-top > * { pointer-events:auto; }
  #scr-orbit .o-title b { display:block; font-size:11px; letter-spacing:.34em; color:rgba(226,236,244,.9); font-weight:600; text-shadow:0 1px 8px rgba(0,0,0,.8); }
  #scr-orbit .o-title span { display:block; margin-top:3px; font-size:8.5px; letter-spacing:.26em; color:rgba(170,182,194,.75); text-shadow:0 1px 8px rgba(0,0,0,.8); }
  #scr-orbit .o-x { width:40px; height:40px; border-radius:50%; border:1px solid rgba(180,210,230,.16); background:rgba(4,8,14,.35); color:rgba(226,236,244,.85); font-size:22px; line-height:1; cursor:pointer; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
  #scr-orbit .o-bottom { position:absolute; left:0; right:0; bottom:0; padding:40px 20px calc(var(--sab) + 14px); background:linear-gradient(to top, rgba(1,3,6,.62), rgba(1,3,6,0)); }
  #scr-orbit .o-counts { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; font-size:9px; letter-spacing:.14em; color:rgba(190,208,220,.8); text-transform:uppercase; margin-bottom:10px; }
  #scr-orbit .o-counts b { font-family:var(--font-mono, monospace); color:#eef4f8; font-size:12px; margin-right:4px; font-weight:600; letter-spacing:0; }
  #scr-orbit .o-counts i { font-style:normal; color:rgba(120,150,170,.6); }
  #scr-orbit .o-mut { color:rgba(170,185,195,.65); }
  #scr-orbit .o-note { font-size:11px; line-height:1.5; color:rgba(170,195,210,.85); margin-bottom:10px; }
  #scr-orbit .o-acts { display:flex; gap:8px; }
  #scr-orbit .o-acts button { flex:1; height:36px; border-radius:18px; border:1px solid rgba(200,210,220,.22); background:rgba(8,10,12,.4); color:rgba(222,228,234,.9); font-size:10px; letter-spacing:.2em; text-transform:uppercase; cursor:pointer; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
  #scr-orbit .o-load { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#010205; opacity:0; pointer-events:none; transition:opacity .4s ease; }
  #scr-orbit .o-load.on { opacity:1; }
  #scr-orbit .o-load span { font-size:9px; letter-spacing:.4em; color:rgba(120,190,240,.7); animation:oPulse 1.4s ease-in-out infinite; }
  @keyframes oPulse { 50% { opacity:.35; } }
  .o-flash { position:fixed; inset:0; z-index:200; background:#010205; opacity:0; pointer-events:none; transition:opacity .28s ease; }
  .o-flash.on { opacity:1; }
`;
document.head.appendChild(css);
window.SBOrbit = SBOrbit;
