// Scène du premier écran : une flotte quitte Kerath-VII et part vers l'inconnu.
// Un seul soleil (côté droit, légèrement en arrière) éclaire vaisseaux et planète.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SUN = new THREE.Vector3(0.74, 0.62, -0.2).normalize();       // côté droit, en hauteur, légèrement en arrière du sujet     // côté droit, un peu en arrière du sujet
const SUN_COLOR = new THREE.Color(1.0, 0.95, 0.88);

// Tuyères relevées sur les profils du jeu (coordonnées du glTF : x, y, rayon ; z = poupe)
const NOZZLES = {
  kv01: { z: -655, list: [[100, 21], [52, 17]].flatMap(([y, r]) => [-44, 0, 44].map(x => [x, y, r])) },
  sr01: { z: -34.5, list: [[-2.3, 4.4, 1.6], [2.3, 4.4, 1.6]] },
};

// ---------- matière : panneaux et variations de rugosité (technique du jeu, triplanaire) ----------
function panelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); let seed = 12345;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  g.fillStyle = 'rgb(200,128,190)'; g.fillRect(0, 0, 512, 512);
  const rects = [];
  const split = (x, y, w, h, d) => {
    if (d > 4 || (d > 1 && rnd() < 0.28) || w < 40 || h < 40) { rects.push([x, y, w, h]); return; }
    if (w > h ? rnd() < 0.8 : rnd() < 0.2) { const k = Math.round(w * (0.3 + rnd() * 0.4)); split(x, y, k, h, d + 1); split(x + k, y, w - k, h, d + 1); }
    else { const k = Math.round(h * (0.3 + rnd() * 0.4)); split(x, y, w, k, d + 1); split(x, y + k, w, h - k, d + 1); }
  };
  split(0, 0, 512, 512, 0);
  rects.forEach(([x, y, w, h]) => {
    const r = 150 + Math.floor(rnd() * 90), gg = 90 + Math.floor(rnd() * 100), b = 185 + Math.floor(rnd() * 25);
    g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    if (rnd() < 0.35) { const pw = w * (0.3 + rnd() * 0.35), ph = h * (0.25 + rnd() * 0.35); g.fillStyle = `rgb(${r - 25},${gg + 25},150)`; g.fillRect(x + (w - pw) * rnd(), y + (h - ph) * rnd(), pw, ph); }
  });
  g.strokeStyle = 'rgb(70,200,40)'; g.lineWidth = 2; rects.forEach(([x, y, w, h]) => g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1));
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  return t;
}
function panelize(mat, tex, { scale = 0.012, bump = 0.6, alb = 0.45, rough = 0.42 } = {}) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { pTex: { value: tex }, pScale: { value: scale }, pBump: { value: bump }, pAlb: { value: alb }, pRough: { value: rough } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPObj; varying vec3 vNObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPObj = position; vNObj = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D pTex; uniform float pScale, pBump, pAlb, pRough; varying vec3 vPObj; varying vec3 vNObj;
      vec4 triS(vec3 p, vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
        return texture2D(pTex, p.zy * pScale) * w.x + texture2D(pTex, p.xz * pScale) * w.y + texture2D(pTex, p.xy * pScale) * w.z; }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 pS = triS(vPObj, normalize(vNObj));\ndiffuseColor.rgb *= mix(1.0, pS.r * 1.35, pAlb);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (pS.g - 0.5) * pRough, 0.18, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float hh = pS.b; vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(hh), dhy = dFdy(hh);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2); normal = normalize(abs(det) * normal - grad * pBump); }`);
  };
  mat.customProgramCacheKey = () => 'panel' + scale;
}
const TREATED = new WeakSet();
function treatShip(root, tex, { shadows }) {
  root.traverse(o => {
    if (o.isLight) { o.visible = false; return; }
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = !!shadows;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      if (TREATED.has(m)) return; TREATED.add(m);       // les maillages partagent leurs matières : un seul passage
      const n = (m.name || '').toUpperCase();
      m.envMapIntensity = 0.35;
      if (/GLOW|NAV/.test(n)) {
        // éclairages fonctionnels : présents mais sans éblouir
        m.emissiveIntensity = /MOTEUR/.test(n) ? 1.6 : /NAV/.test(n) ? 2.4 : 1.4;
        if (/MOTEUR/.test(n)) { m.emissive = new THREE.Color(0.30, 0.55, 1.0); m.color = new THREE.Color(0.30, 0.55, 1.0); }
        return;
      }
      if (/ARMOR_WHITE/.test(n)) { m.color.multiplyScalar(0.82); m.roughness = 0.58; m.metalness = 0.12; }
      if (/GUNMETAL/.test(n)) { m.roughness = 0.42; m.metalness = 0.8; }
      if (/STRUCT_BLACK/.test(n)) { m.roughness = 0.62; m.metalness = 0.45; }
      if (/ARMOR_RED/.test(n)) { m.roughness = 0.5; m.metalness = 0.25; }
      if (/VERRIERE/.test(n)) return;
      panelize(m, tex);
    });
  });
}

// ---------- panaches : partent des tuyères, suivent l'axe du vaisseau, restent courts ----------
const ENG_T = { value: 0 };
function plume(r, len, core) {
  const geo = new THREE.CylinderGeometry(r * 0.25, r * 0.92, 1, 24, 16, true);
  geo.translate(0, -0.5, 0); geo.rotateX(Math.PI / 2);                 // s'étire vers -z (arrière)
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: ENG_T, uCore: { value: core ? 1 : 0 } },
    vertexShader: 'varying float vV; varying vec3 vN; varying vec3 vW; void main(){ vV = -position.z; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vW = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform float uT, uCore; varying float vV; varying vec3 vN; varying vec3 vW;
      void main(){
        float face = pow(abs(dot(normalize(vN), vW)), 1.3);
        float fall = pow(1.0 - clamp(vV, 0.0, 1.0), uCore > 0.5 ? 3.2 : 2.2);
        float bands = 1.0 + 0.06 * sin(vV * 40.0 - uT * 20.0) * (1.0 - vV);
        vec3 hot = vec3(0.62, 0.80, 1.0), cyan = vec3(0.22, 0.52, 1.0), deep = vec3(0.06, 0.18, 0.9);
        vec3 c = mix(hot, cyan, smoothstep(0.0, uCore > 0.5 ? 0.5 : 0.15, vV));
        c = mix(c, deep, smoothstep(0.35, 1.0, vV));
        float a = (uCore > 0.5 ? 0.6 : 0.35) * face * fall * bands;
        gl_FragColor = vec4(c * a, a);
      }`
  });
  const m = new THREE.Mesh(geo, mat); m.scale.z = len; m.renderOrder = 3; m.frustumCulled = false;
  return m;
}
function addEngines(root, kind) {
  const N = NOZZLES[kind]; if (!N) return;
  N.list.forEach(([x, y, r]) => {
    const g = new THREE.Group(); g.position.set(x, y, N.z - r * 0.15);
    g.add(plume(r, r * 4.2, false));                 // gaine extérieure
    const c = plume(r * 0.55, r * 2.6, true); g.add(c); // cœur
    root.add(g);
  });
}

// ---------- planète Kerath-VII ----------
const PLANET_VS = 'varying vec2 vUv; varying vec3 vN; varying vec3 vWP; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }';
function planetMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { uDay: { value: tex.day }, uNight: { value: tex.night }, uClouds: { value: tex.clouds }, uSun: { value: SUN }, uSunCol: { value: SUN_COLOR }, uCam: { value: new THREE.Vector3() }, uShift: { value: 0 } },
    vertexShader: PLANET_VS,
    fragmentShader: `uniform sampler2D uDay, uNight, uClouds; uniform vec3 uSun, uSunCol, uCam; uniform float uShift; varying vec2 vUv; varying vec3 vN; varying vec3 vWP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 N = normalize(vN), V = normalize(uCam - vWP), L = normalize(uSun);
        float ndl = dot(N, L);
        vec3 day = texture2D(uDay, vUv).rgb;
        float ocean = smoothstep(0.02, 0.10, day.b - max(day.r, day.g) * 0.85);
        // relief fin procédural sur les terres pour éviter l'aspect peint
        float d = fbm(vUv * vec2(900.0, 450.0));
        day *= mix(1.0, 0.82 + 0.36 * d, (1.0 - ocean) * 0.8);
        day = pow(day, vec3(1.18)) * 1.18;
        float lum = dot(day, vec3(0.299, 0.587, 0.114));
        day = mix(vec3(lum), day, 1.18);                                 // saturation un peu plus franche
        day = mix(day, day * vec3(0.55, 0.75, 1.05), ocean * 0.55);       // océans plus profonds
        // ombre des nuages, décalée vers l'opposé du soleil
        vec2 cs = vUv + vec2(uShift, 0.0) - L.xz * 0.0009;
        float cloudShadow = texture2D(uClouds, cs).r;
        float lit = smoothstep(-0.06, 0.25, ndl);
        vec3 col = day * uSunCol * (0.03 + 1.25 * max(ndl, 0.0)) * (1.0 - 0.45 * cloudShadow * lit);
        // reflet du soleil sur les océans
        vec3 H = normalize(L + V);
        col += uSunCol * ocean * pow(max(dot(N, H), 0.0), 140.0) * 1.6 * lit * (1.0 - cloudShadow);
        // terminateur légèrement chaud
        // face de nuit : bleu nuit à peine lisible, jamais brune
        col += vec3(0.004, 0.006, 0.014) * smoothstep(0.1, -0.3, ndl) * (0.6 + 0.4 * ocean);
        // lumières des villes, petites et seulement côté nuit
        float night = smoothstep(0.05, -0.18, ndl);
        vec3 city = texture2D(uNight, vUv).rgb;
        city = pow(city, vec3(2.2)) * 2.4;
        col += city * vec3(1.0, 0.74, 0.46) * night * (1.0 - ocean);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
}
function cloudMaterial(tex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uClouds: { value: tex.clouds }, uSun: { value: SUN }, uSunCol: { value: SUN_COLOR }, uCam: { value: new THREE.Vector3() }, uShift: { value: 0 } },
    vertexShader: PLANET_VS,
    fragmentShader: `uniform sampler2D uClouds; uniform vec3 uSun, uSunCol, uCam; uniform float uShift; varying vec2 vUv; varying vec3 vN; varying vec3 vWP;
      void main(){
        vec3 N = normalize(vN), L = normalize(uSun), V = normalize(uCam - vWP);
        vec2 uv = vUv + vec2(uShift, 0.0);
        float c = texture2D(uClouds, uv).r;
        float e = 0.0012;
        float gx = texture2D(uClouds, uv + vec2(e, 0.0)).r - c, gy = texture2D(uClouds, uv + vec2(0.0, e)).r - c;
        float ndl = dot(N, L);
        float shade = clamp(0.8 + (gx * 2.0 + gy * 2.0) * -6.0, 0.55, 1.15);       // relief des masses nuageuses
        float lit = smoothstep(-0.08, 0.3, ndl);
        vec3 col = uSunCol * vec3(0.97, 0.97, 1.0) * lit * shade * (0.15 + 0.95 * max(ndl, 0.0));
        float a = smoothstep(0.28, 0.78, c) * 0.95 * (0.25 + 0.75 * lit);
        float limb = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        a *= 1.0 - limb * 0.6;
        gl_FragColor = vec4(col, a);
      }`
  });
}
function atmosphereMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uSun: { value: SUN }, uCam: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uR: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vWP; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }',
    fragmentShader: `uniform vec3 uSun, uCam, uCenter; uniform float uR; varying vec3 vN; varying vec3 vWP;
      void main(){
        vec3 V = normalize(vWP - uCam);
        // distance du rayon au centre : on ne garde qu'une fine couronne au-dessus du limbe
        vec3 oc = uCam - uCenter; float b = dot(oc, V); float d2 = dot(oc, oc) - b*b;
        float hgt = (sqrt(max(d2, 0.0)) - uR) / (uR * 0.025);
        float ring = exp(-max(hgt, 0.0) * 3.2) * smoothstep(-0.3, 0.0, hgt);
        vec3 N = normalize(vWP - uCenter);
        float sunSide = smoothstep(-0.25, 0.6, dot(N, normalize(uSun)));
        vec3 col = mix(vec3(0.42, 0.30, 0.95), vec3(0.62, 0.80, 1.0), sunSide);
        float a = ring * (0.08 + 0.9 * sunSide);
        gl_FragColor = vec4(col * a, a);
      }`
  });
}


function skyDome() {
  // espace noir légèrement violet, à peine plus clair du côté du soleil, avec une traînée galactique très discrète
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: SUN } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 d = normalize(vD);
        float band = exp(-pow(dot(d, normalize(vec3(-0.35, 1.0, 0.25))) * 3.2, 2.0));
        float neb = n3(d * 3.0) * 0.6 + n3(d * 7.0) * 0.4;
        vec3 col = vec3(0.0035, 0.0022, 0.0075);
        col += vec3(0.022, 0.010, 0.045) * band * smoothstep(0.35, 0.9, neb);
        col += vec3(0.06, 0.05, 0.045) * pow(max(dot(d, normalize(uSun)), 0.0), 18.0);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), m); g.renderOrder = -10; return g;
}

function starfield(n, r, seed) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  let s = seed; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    p.set([r * k * Math.cos(t), r * u, r * k * Math.sin(t)], i * 3);
    const w = Math.pow(rnd(), 2.2) * 0.9 + 0.1, tint = rnd();
    c.set(tint < 0.15 ? [w, w * 0.85, w * 0.72] : tint < 0.3 ? [w * 0.8, w * 0.75, w] : [w * 0.9, w * 0.93, w], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
}

// ---------- composition ----------
// Unités : 1 = 1 m / 100 (le KV-01 mesure ~13 unités). Caméra à l'origine, regard vers -z.
const HEADING = new THREE.Vector3(0.62, 0.16, -1).normalize();     // la flotte part vers la droite, dans la profondeur
const LAYOUTS = {
  wide: {
    fov: 30, look: [0.0, -0.4, -30],
    main: { pos: [4.4, 0.0, -22], len: 13.2 },
    escorts: [
      { kind: 'sr01', pos: [-1.0, 3.2, -52], len: 5.2 },
      { kind: 'kv01', pos: [22, 10.5, -125], len: 13.2 },
      { kind: 'sr01', pos: [40, 19, -200], len: 5.2 },
    ],
    planet: { center: [150, -330, -330], r: 330 },
  },
  tall: {
    fov: 40, look: [1.6, 1.4, -30],
    main: { pos: [3.4, 0.3, -20], len: 13.2 },
    escorts: [
      { kind: 'sr01', pos: [-1.5, 6.0, -48], len: 5.2 },
      { kind: 'kv01', pos: [12, 12.5, -115], len: 13.2 },
      { kind: 'sr01', pos: [19, 20, -185], len: 5.2 },
    ],
    planet: { center: [90, -322, -300], r: 320 },
  },
};

export class HeroScene {
  constructor(host, opts = {}) {
    this.o = Object.assign({ hd: true, shadows: true, still: false, calm: false, maxDpr: 2 }, opts);
    this.host = host;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!this.o.still, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.o.maxDpr));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 1);
    if (this.o.shadows) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    host.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 6000);
    this.scene.add(skyDome(), starfield(this.o.hd ? 2600 : 1400, 3000, 11));

    // un seul soleil : lumière principale latérale et légèrement arrière, contre-jour maîtrisé
    this.sunLight = new THREE.DirectionalLight(SUN_COLOR, 4.6);
    this.scene.add(this.sunLight, this.sunLight.target);
    // rebond de la planète (froid, venu d'en bas à droite) et très faible ambiance violette
    const bounce = new THREE.DirectionalLight(0x6f8fd6, 0.45); bounce.position.set(0.5, -1, 0.3);
    this.scene.add(bounce, new THREE.HemisphereLight(0x2a2140, 0x05030a, 0.25));
    // contre-jour : détache les arêtes du côté opposé
    this.rim = new THREE.DirectionalLight(0xd9ccff, 1.6); this.rim.position.set(-0.75, 0.35, -0.6);
    this.scene.add(this.rim);

    this.fleet = new THREE.Group(); this.scene.add(this.fleet);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.35, 0.92));
    this.composer.addPass(new OutputPass());

    this.visible = true;
    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver(e => { this.visible = e[0].isIntersecting; }).observe(host);
  }
  layout() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    return LAYOUTS[w / h < 1.15 ? 'tall' : 'wide'];
  }
  resize() {
    const w = this.host.clientWidth || 300, h = this.host.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    if (this.ready) this.compose(); else this.camera.updateProjectionMatrix();
  }
  async load(base = '3d/') {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const get = u => new Promise((res, rej) => loader.load(base + u, g => res(g.scene), undefined, rej));
    const tl = new THREE.TextureLoader();
    const tx = u => new Promise((res, rej) => tl.load(base + u, t => res(t), undefined, rej));
    const [mainSrc, kvSrc, srSrc, day, night, clouds] = await Promise.all([
      get(this.o.hd ? 'sb_kv01_hd.glb' : 'sb_kv01_m.glb'), get('sb_kv01_m.glb'), get('sb_sr01_m.glb'),
      tx('kerath_albedo.jpg'), tx('kerath_lights.jpg'), tx('kerath_clouds.jpg'),
    ]);
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    [day, night].forEach(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; });
    clouds.anisotropy = maxAniso;
    [day, night, clouds].forEach(t => { t.wrapS = THREE.RepeatWrapping; });
    this.tex = { day, night, clouds };
    const panel = panelTexture();
    const make = (src, kind, main) => {
      const m = src.clone(true);
      treatShip(m, panel, { shadows: main && this.o.shadows });
      addEngines(m, kind);
      const box = new THREE.Box3().setFromObject(src);
      const holder = new THREE.Group();
      m.position.sub(box.getCenter(new THREE.Vector3()));
      holder.add(m);
      holder.userData.len = box.max.z - box.min.z;
      return holder;
    };
    this.main = make(mainSrc, 'kv01', true);
    this.escorts = [make(srSrc, 'sr01'), make(kvSrc, 'kv01'), make(srSrc, 'sr01')];
    this.fleet.add(this.main, ...this.escorts);

    // planète : sol, nuages, atmosphère fine
    const seg = this.o.hd ? 192 : 128;
    const sph = new THREE.SphereGeometry(1, seg, seg / 2);
    this.planet = new THREE.Group();
    this.ground = new THREE.Mesh(sph, planetMaterial(this.tex));
    this.clouds = new THREE.Mesh(sph, cloudMaterial(this.tex)); this.clouds.scale.setScalar(1.004);
    this.atmo = new THREE.Mesh(sph, atmosphereMaterial()); this.atmo.scale.setScalar(1.035);
    this.planet.add(this.ground, this.clouds, this.atmo);
    this.planet.rotation.set(this.o.prx ?? 0, this.o.pry ?? 4.15, 0.12);   // l'équateur et ses continents face au soleil
    this.scene.add(this.planet);
    this.ready = true;
    this.compose();
  }
  compose() {
    const L = this.layout();
    const cam = this.camera;
    cam.fov = L.fov; cam.position.set(0, 0, 0); cam.lookAt(new THREE.Vector3(...L.look)); cam.updateProjectionMatrix();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), HEADING);
    const place = (g, spec) => { const k = spec.len / g.userData.len; g.scale.setScalar(k); g.position.set(...spec.pos); g.quaternion.copy(q); g.userData.base = g.position.clone(); };
    place(this.main, L.main);
    this.escorts.forEach((e, i) => place(e, L.escorts[i]));
    this.planet.position.set(...L.planet.center); this.planet.scale.setScalar(L.planet.r);
    [this.ground, this.clouds].forEach(m => m.material.uniforms.uCam.value.copy(cam.position));
    Object.assign(this.atmo.material.uniforms, {}); this.atmo.material.uniforms.uCam.value.copy(cam.position);
    this.atmo.material.uniforms.uCenter.value.copy(this.planet.position); this.atmo.material.uniforms.uR.value = L.planet.r;
    // soleil et ombres autour du vaisseau principal
    const c = this.main.position;
    this.sunLight.position.copy(c).addScaledVector(SUN, 60); this.sunLight.target.position.copy(c);
    if (this.o.shadows) {
      const s = this.sunLight.shadow; s.mapSize.set(2048, 2048); s.bias = -0.0004; s.normalBias = 0.02;
      Object.assign(s.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 30, far: 95 }); s.camera.updateProjectionMatrix();
      this.sunLight.castShadow = true;
    }
  }
  frame(t = performance.now() / 1000) {
    if (!this.ready) return;
    ENG_T.value = t;
    if (!this.o.calm) {
      // dérive lente vers la destination, oscillation à peine perceptible
      const drift = Math.sin(t * 0.05) * 0.6;
      [this.main, ...this.escorts].forEach((g, i) => {
        g.position.copy(g.userData.base).addScaledVector(HEADING, drift * (1 + i * 0.15));
        g.position.y += Math.sin(t * 0.32 + i * 1.7) * 0.06 * (i ? 2 : 1);
      });
      this.planet.rotation.y = (this.o.pry ?? 4.15) + t * 0.0012;
      this.clouds.material.uniforms.uShift.value = t * 0.00035;
    }
    this.composer.render();
  }
  start() {
    const loop = () => { requestAnimationFrame(loop); if (this.visible && !document.hidden) this.frame(); };
    loop();
  }
}
