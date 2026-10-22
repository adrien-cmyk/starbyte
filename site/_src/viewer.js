import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const loader = new GLTFLoader();
const cache = new Map();
function loadGLB(url) {
  if (!cache.has(url)) cache.set(url, new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej)));
  return cache.get(url);
}

function starfield(n, r) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  let s = 7;
  const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    p.set([r * k * Math.cos(t), r * u, r * k * Math.sin(t)], i * 3);
    const w = 0.35 + rnd() * 0.65, warm = rnd() < 0.2;
    c.set(warm ? [w, w * 0.86, w * 0.7] : [w * 0.85, w * 0.92, w], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
}


// ---------- Effets de vol (inspirés des fiches vaisseaux du jeu) ----------
const FX_T = { value: 0 };
const FX_COL = {
  blue:   { core: new THREE.Color(0xe6f3ff), mid: new THREE.Color(0x6fa8ff), edge: new THREE.Color(0x2a5cff) },
  orange: { core: new THREE.Color(0xfff2d8), mid: new THREE.Color(0xffa060), edge: new THREE.Color(0xff5a1a) },
};
function shockMaterial(gain) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: FX_T, uGain: { value: gain } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform float uTime, uGain; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float z = vP.z;                                   // +1 = proue, -1 = poupe (sphère unité)
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float nose = smoothstep(0.2, 1.0, z);
        float ang = atan(vP.y, vP.x);
        float streak = n(vec2(ang*6.0, z*3.0 + uTime*2.2));
        float front = smoothstep(-0.1, 0.95, z);           // l'onde de choc vit à l'avant, s'efface vers le milieu
        float inten = (pow(fres, 1.6) * front + smoothstep(0.82, 1.0, z) * 0.7) * (0.55 + 0.6*streak);
        vec3 hot = vec3(0.9,0.95,1.0), blue = vec3(0.35,0.55,1.0), vio = vec3(0.58,0.22,1.0);
        vec3 col = mix(mix(blue, hot, nose), vio, smoothstep(0.2, -0.8, z));
        float a = uGain * inten;
        gl_FragColor = vec4(col*a, a);
      }`
  });
}
function plumeMaterial(pal, gain) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: FX_T, uGain: { value: gain }, uCore: { value: pal.core }, uMid: { value: pal.mid }, uEdge: { value: pal.edge }, uSeed: { value: Math.random()*10.0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uGain, uSeed; uniform vec3 uCore, uMid, uEdge; varying vec2 vUv;
      void main(){
        float t = vUv.y;                                  // 0 = tuyère, 1 = bout de la traînée
        float r = abs(vUv.x - 0.5) * 2.0;                 // 0 = axe, 1 = bord
        float flick = 0.85 + 0.15*sin(uTime*23.0 + uSeed) * sin(uTime*7.0 + uSeed*3.0);
        float body = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.0, 1.0, t)) * (1.0 - smoothstep(0.15 + 0.6*t, 1.0, r));
        vec3 col = mix(mix(uCore, uMid, smoothstep(0.0, 0.25, t + r*0.3)), uEdge, smoothstep(0.3, 0.9, t + r*0.2));
        float a = uGain * body * flick;
        gl_FragColor = vec4(col*a, a);
      }`
  });
}
function glowSprite(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = g.createRadialGradient(128,128,0,128,128,128);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.08, 'rgba(255,246,232,0.95)');
  r.addColorStop(0.25, 'rgba(214,190,255,0.35)'); r.addColorStop(0.6, 'rgba(128,84,217,0.08)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0,0,256,256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sp.scale.setScalar(size); return sp;
}
function flightFx(L, w, hgt, pal) {
  const g = new THREE.Group();
  const sph = new THREE.SphereGeometry(1, 48, 24);
  const outer = new THREE.Mesh(sph, shockMaterial(0.5));
  outer.scale.set(w*0.78, hgt*0.85, L*0.66); outer.position.z = L*0.06;
  const inner = new THREE.Mesh(sph, shockMaterial(0.25));
  inner.scale.set(w*0.66, hgt*0.72, L*0.6); inner.position.z = L*0.08;
  g.add(outer, inner);
  // traînée : deux plans croisés (lisibles sous tous les angles), pointe vers l'arrière
  const len = L*1.15, wid = Math.max(w, hgt)*0.85;
  const pg = new THREE.PlaneGeometry(wid, len); pg.translate(0, -len/2, 0); pg.rotateX(Math.PI/2);  // s'étire vers -z
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(pg, plumeMaterial(pal, 0.9)); m.rotation.z = i*Math.PI/2; m.position.z = -L*0.48; g.add(m); }
  const tail = new THREE.PlaneGeometry(wid*2.2, len*2.4); tail.translate(0, -len*1.2, 0); tail.rotateX(Math.PI/2);
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(tail, plumeMaterial({ core: pal.mid, mid: pal.edge, edge: new THREE.Color(0x3a1f7a) }, 0.25)); m.rotation.z = i*Math.PI/2; m.position.z = -L*0.5; g.add(m); }
  g.traverse(o => { if (o.isMesh) { o.renderOrder = 2; o.frustumCulled = false; } });
  return g;
}

export class Viewer {
  constructor(host, opts = {}) {
    this.o = Object.assign({ bloom: 0.55, rotate: 0.35, view: [1, 0.32, 1.15], fit: 0.82, stars: true, zoom: false, exposure: 1.0, offsetX: 0 }, opts);
    this.host = host;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!opts.still });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = this.o.exposure;
    r.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(r.domElement);
    r.domElement.style.display = 'block';

    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = this.o.env ?? 0.4;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 5000);
    if (this.o.stars) { this.stars = starfield(1400, 1500); this.scene.add(this.stars); }

    // soleil blanc chaud de face, lumière d'ambiance violette sur le côté, rappel rouge discret
    const key = new THREE.DirectionalLight(0xfff1e4, 2.5); key.position.set(4, 3, 5);
    const rim = new THREE.DirectionalLight(0x8a5cff, 2.6); rim.position.set(-6, 1.5, -3);
    const warm = new THREE.DirectionalLight(0xcc294b, 0.5); warm.position.set(2, -3, -4);
    this.scene.add(key, rim, warm, new THREE.HemisphereLight(0xb7a6d6, 0x0b0812, 0.3));
    this.key = key;

    this.pivot = new THREE.Group(); this.scene.add(this.pivot);

    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.06; c.rotateSpeed = 0.55;
    c.enablePan = false; c.enableZoom = this.o.zoom;
    c.autoRotate = this.o.rotate > 0; c.autoRotateSpeed = this.o.rotate;
    r.domElement.style.touchAction = this.o.touch || 'pan-y';
    c.addEventListener('start', () => { c.autoRotate = false; clearTimeout(this._t); });
    c.addEventListener('end', () => { this._t = setTimeout(() => { c.autoRotate = this.o.rotate > 0; }, 4000); });

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.o.bloom, 0.45, 0.9);
    if (this.o.bloom > 0) this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.visible = true;
    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver(e => { this.visible = e[0].isIntersecting; }, { rootMargin: '120px' }).observe(host);
    this.resize();
    if (!opts.still) { const loop = () => { requestAnimationFrame(loop); if (this.visible && !document.hidden && this.model) this.frame(); }; loop(); }
  }
  resize() {
    const w = this.host.clientWidth || 300, h = this.host.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.radius) this.place();
  }
  frame() {
    const t = performance.now() / 1000;
    if (this.o.sway) { this.pivot.rotation.y = Math.sin(t * 0.18) * this.o.sway; this.pivot.position.y = Math.sin(t * 0.35) * this.radius * 0.015; }
    if (this.planet) this.planet.rotation.y = t * 0.004;
    FX_T.value = t;
    if (this.fleet && this.o.sway) this.fleet.children.forEach(h => { if (!h.userData.follow) h.position.y += Math.sin(t * 0.5 + h.userData.bob) * 0.0015 * this.radius / 40; });
    if (this.fleet) this.fleet.children.forEach(h => { const f = h.userData.follow; if (f) h.position.copy(f.position); });
    if (this.clouds) this.clouds.rotation.y = t * 0.006;
    this.controls.update(); this.composer.render();
  }
  addPlanet(tex) {
    // planète Kerath (textures du jeu) : jour, lumières des villes côté nuit, nuages, halo violet
    const L = new THREE.TextureLoader();
    const g = new THREE.SphereGeometry(1, 96, 64);
    const alb = L.load(tex.albedo); alb.colorSpace = THREE.SRGBColorSpace; alb.anisotropy = 8;
    const lit = L.load(tex.lights); lit.colorSpace = THREE.SRGBColorSpace;
    const sunDir = { value: new THREE.Vector3(1, 0, 0) };
    // éclairage propre à la planète (indépendant des lumières du vaisseau) : jour, terminateur, villes la nuit
    const mat = new THREE.ShaderMaterial({
      uniforms: { uDay: { value: alb }, uNight: { value: lit }, uSun: sunDir },
      vertexShader: 'varying vec2 vUv; varying vec3 vWN; void main(){ vUv = uv; vWN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSun; varying vec2 vUv; varying vec3 vWN; void main(){ float d = dot(normalize(vWN), uSun); float day = smoothstep(-0.08, 0.35, d); vec3 c = texture2D(uDay, vUv).rgb * (0.02 + 1.15*day); float night = smoothstep(0.02, -0.22, d); c += texture2D(uNight, vUv).rgb * vec3(1.0,0.72,0.5) * night * 0.55; c += vec3(0.5,0.33,0.85) * 0.05 * (1.0-day); gl_FragColor = vec4(c, 1.0); }'
    });
    mat.toneMapped = true;
    const planet = new THREE.Mesh(g, mat);
    const grp = new THREE.Group(); grp.add(planet);
    if (tex.clouds) {
      const cl = L.load(tex.clouds);
      const cm = new THREE.ShaderMaterial({ uniforms: { uA: { value: cl }, uSun: sunDir },
        vertexShader: 'varying vec2 vUv; varying vec3 vWN; void main(){ vUv = uv; vWN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform sampler2D uA; uniform vec3 uSun; varying vec2 vUv; varying vec3 vWN; void main(){ float d = smoothstep(-0.05, 0.4, dot(normalize(vWN), uSun)); float a = texture2D(uA, vUv).r * 0.55; gl_FragColor = vec4(vec3(0.95,0.93,1.0)*d, a*(0.15+0.85*d)); }',
        transparent: true, depthWrite: false });
      const c = new THREE.Mesh(g, cm); c.scale.setScalar(1.008); grp.add(c); this.clouds = c;
    }
    const atm = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(0x8a5cff) }, uSun: sunDir },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vWN; void main(){ vN = normalize(normalMatrix*normal); vWN = normalize(mat3(modelMatrix)*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vWN; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 4.0); float side = 0.25 + 0.75*smoothstep(-0.5, 0.5, dot(vWN, uSun)); gl_FragColor = vec4(uCol * f * 1.1 * side, f); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide
    }));
    atm.scale.setScalar(1.02); grp.add(atm);
    this.planet = planet; this.planetGroup = grp; this.sunDir = sunDir;
    this.scene.add(grp);
    if (this.radius) this.placePlanet();
  }
  placePlanet() {
    const p = this.o.planet; if (!this.planetGroup || !p) return;
    const r = this.radius, cam = this.camera, tgt = this.controls.target;
    const fwd = tgt.clone().sub(cam.position).normalize();
    const right = fwd.clone().cross(cam.up).normalize();
    const up = right.clone().cross(fwd).normalize();
    this.planetGroup.scale.setScalar(p.size * r);
    // axe des pôles orienté vers le fond : on voit l'équateur (forêts, océans) à l'horizon, pas la calotte polaire
    this.planetGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fwd.clone().addScaledVector(right, -0.3).normalize());
    this.planetGroup.position.copy(tgt).addScaledVector(right, p.x * r).addScaledVector(up, p.y * r).addScaledVector(fwd, p.z * r);
    // soleil venant de la droite et un peu de face : le limbe gauche plonge dans la nuit
    const sun = right.clone().multiplyScalar(this.o.planet.sx ?? 0.45).addScaledVector(up, this.o.planet.sy ?? 0.35).addScaledVector(fwd, this.o.planet.sz ?? 0.85).normalize();
    this.sunDir.value.copy(sun);
    this.key.position.copy(sun).multiplyScalar(10);
    cam.far = Math.max(cam.far, (p.z + p.size * 2) * r * 3); cam.updateProjectionMatrix();
  }
  placeBacklight() {
    const b = this.o.backlight; if (!b) return;
    const r = this.radius, cam = this.camera, tgt = this.controls.target;
    const fwd = tgt.clone().sub(cam.position).normalize();
    const right = fwd.clone().cross(cam.up).normalize();
    const up = right.clone().cross(fwd).normalize();
    // soleil derrière la flotte, légèrement au-dessus et à droite : il découpe les coques
    const dir = fwd.clone().multiplyScalar(1).addScaledVector(up, b.up ?? 0.28).addScaledVector(right, b.right ?? 0.22).normalize();
    if (!this.backLight) {
      this.backLight = new THREE.DirectionalLight(0xfff0dc, b.power ?? 6.0);
      this.rimLight = new THREE.DirectionalLight(0xb48cff, (b.power ?? 6.0) * 0.45);
      this.scene.add(this.backLight, this.backLight.target, this.rimLight, this.rimLight.target);
      this.sun = glowSprite(0xffffff, 1); this.sun.renderOrder = -1; this.scene.add(this.sun);
      this.key.intensity = 0.9;            // face au soleil, les flancs restent sombres : silhouettes
    }
    this.backLight.position.copy(tgt).addScaledVector(dir, r * 10); this.backLight.target.position.copy(tgt);
    const dir2 = dir.clone().addScaledVector(right, -0.6).normalize();
    this.rimLight.position.copy(tgt).addScaledVector(dir2, r * 10); this.rimLight.target.position.copy(tgt);
    const dist = cam.position.distanceTo(tgt) * 6;
    this.sun.position.copy(cam.position).addScaledVector(dir, dist);
    this.sun.scale.setScalar(dist * (b.size ?? 0.55));
  }
  place() {
    const fov = this.camera.fov * Math.PI / 180;
    const fitH = this.radius / Math.sin(fov / 2);
    const fitW = this.radius / Math.sin(Math.atan(Math.tan(fov / 2) * this.camera.aspect));
    const d = Math.max(fitH, fitW) * this.o.fit;
    const v = new THREE.Vector3(...this.o.view).normalize().multiplyScalar(d);
    this.camera.position.copy(v);
    this.camera.near = d / 100; this.camera.far = d * 60; this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    if (this.o.offsetX) { const s = this.camera.getWorldDirection(new THREE.Vector3()).cross(this.camera.up).normalize(); this.controls.target.addScaledVector(s, -this.radius * this.o.offsetX); this.camera.position.addScaledVector(s, -this.radius * this.o.offsetX); }
    this.controls.minDistance = d * 0.55; this.controls.maxDistance = d * 1.8;
    if (this.stars) this.stars.scale.setScalar(Math.max(1, d * 8 / 1500));
    this.controls.update();
    this.placePlanet();
    this.placeBacklight();
  }
  async show(url, view) {
    const token = (this._tok = Symbol());
    this.host.classList.add('is-loading');
    let src;
    try { src = await loadGLB(url); } catch (e) { this.host.classList.remove('is-loading'); this.host.classList.add('is-error'); throw e; }
    if (token !== this._tok) return;
    if (view) this.o.view = view;
    this.pivot.clear();
    const m = src.clone(true);
    const lights = []; m.traverse(o => { if (o.isLight) lights.push(o); });
    lights.forEach(l => l.parent && l.parent.remove(l));
    const box = new THREE.Box3().setFromObject(m);
    const ctr = box.getCenter(new THREE.Vector3());
    m.position.sub(ctr);
    this.pivot.add(m);
    this.model = m;
    this.radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    this.place();
    this.host.classList.remove('is-loading', 'is-error');
    this.frame();
    this.host.classList.add('is-ready');
    return m;
  }
  // Flotte : plusieurs modèles en formation. items = [{ url, len, pos:[x,y,z], yaw }], len = longueur voulue (axe z du modèle)
  async showFleet(items, view) {
    const token = (this._tok = Symbol());
    this.host.classList.add('is-loading');
    let srcs;
    try { srcs = await Promise.all([...new Set(items.map(i => i.url))].map(u => loadGLB(u).then(s => [u, s]))); }
    catch (e) { this.host.classList.remove('is-loading'); this.host.classList.add('is-error'); throw e; }
    if (token !== this._tok) return;
    const byUrl = new Map(srcs);
    if (view) this.o.view = view;
    this.pivot.clear();
    const fleet = new THREE.Group();
    const norm = new Map();
    for (const [u, src] of byUrl) {
      const box = new THREE.Box3().setFromObject(src);
      const sz = box.getSize(new THREE.Vector3());
      norm.set(u, { ctr: box.getCenter(new THREE.Vector3()), len: sz.z, rw: sz.x / sz.z, rh: sz.y / sz.z });
    }
    for (const it of items) {
      const n = norm.get(it.url);
      const m = byUrl.get(it.url).clone(true);
      const lights = []; m.traverse(o => { if (o.isLight) lights.push(o); });
      lights.forEach(l => l.parent && l.parent.remove(l));
      m.position.sub(n.ctr);
      const holder = new THREE.Group(); holder.add(m);
      holder.scale.setScalar(it.len / n.len);
      holder.position.set(...it.pos);
      holder.rotation.y = it.yaw || 0;
      holder.userData.bob = Math.random() * Math.PI * 2;
      fleet.add(holder);
      if (this.o.fx) {
        const fx = flightFx(it.len, it.len * n.rw, it.len * n.rh, FX_COL[it.fx || 'blue']);
        fx.position.copy(holder.position); fx.rotation.copy(holder.rotation);
        fx.userData.follow = holder;
        fleet.add(fx);
      }
    }
    const box = new THREE.Box3(); fleet.children.forEach(c => { if (!c.userData.follow) box.expandByObject(c); });
    fleet.position.sub(box.getCenter(new THREE.Vector3()));
    this.pivot.add(fleet);
    this.fleet = fleet;
    this.model = fleet;
    this.radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    this.place();
    this.host.classList.remove('is-loading', 'is-error');
    this.frame();
    this.host.classList.add('is-ready');
    return fleet;
  }
  zoomBy(k) { const c = this.controls, off = this.camera.position.clone().sub(c.target); off.multiplyScalar(k); const l = off.length(); if (l < c.minDistance || l > c.maxDistance) return; this.camera.position.copy(c.target).add(off); }
}
