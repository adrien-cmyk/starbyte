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
      fragmentShader: 'uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSun; varying vec2 vUv; varying vec3 vWN; void main(){ float d = dot(normalize(vWN), uSun); float day = smoothstep(-0.08, 0.35, d); vec3 c = texture2D(uDay, vUv).rgb * (0.02 + 1.15*day); float night = smoothstep(0.02, -0.22, d); c += texture2D(uNight, vUv).rgb * vec3(1.0,0.72,0.5) * night * 1.4; c += vec3(0.5,0.33,0.85) * 0.05 * (1.0-day); gl_FragColor = vec4(c, 1.0); }'
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
  zoomBy(k) { const c = this.controls, off = this.camera.position.clone().sub(c.target); off.multiplyScalar(k); const l = off.length(); if (l < c.minDistance || l > c.maxDistance) return; this.camera.position.copy(c.target).add(off); }
}
