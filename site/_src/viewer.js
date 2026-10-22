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

    const key = new THREE.DirectionalLight(0xfff2e0, 2.6); key.position.set(4, 3, 5);
    const rim = new THREE.DirectionalLight(0x7fb4ff, 1.4); rim.position.set(-5, 2, -4);
    this.scene.add(key, rim, new THREE.HemisphereLight(0x9fb6c8, 0x0b0f12, 0.35));

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
  frame() { this.controls.update(); this.composer.render(); }
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
    if (this.stars) this.stars.scale.setScalar(Math.max(1, d / 40));
    this.controls.update();
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
    return m;
  }
  zoomBy(k) { const c = this.controls, off = this.camera.position.clone().sub(c.target); off.multiplyScalar(k); const l = off.length(); if (l < c.minDistance || l > c.maxDistance) return; this.camera.position.copy(c.target).add(off); }
}
