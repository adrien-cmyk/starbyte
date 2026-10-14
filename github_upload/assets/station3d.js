/* Starbyte — Station3D : The Drifting Crown, premier port franc (station pirate).
   Source : vitrine validée par Adrien (artifact « The Drifting Crown », 14 oct. 2026), portée sur le moteur partagé
   du jeu (window.SB3D) : mêmes matériaux (lookdev procédural sans UV), même ciel (nébuleuse, géante gazeuse, soleil),
   même trafic (navettes sur les axes, ronde autour de l'anneau, transporteurs au loin). Sans GTAO (mobile).
   Deux cadrages : « port » (la station entière, en orbite lente) et « bar » (la façade du bar sur l'anneau, de près).
   Usage : const h = window.Station3D.mount(container, { url, view: 'port'|'bar', intro, interactive, onProgress, onReady, onError });
           h.setView('bar'); h.setInteractive(true); h.replayIntro(); h.dispose();
*/
const S = 0.01;   // 1 unité de scène = 100 m (glTF en mètres)
const GLOSS = {
  M_DC_HULL_CREAM: [0.34, 0.0], M_DC_HULL_GREY: [0.30, 0.55], M_DC_HULL_PATCH: [0.36, 0.3], M_DC_GUNMETAL: [0.26, 0.85],
  M_DC_DARK: [0.32, 0.55], M_DC_RUST: [0.5, 0.35], M_DC_BRASS: [0.24, 1.0], M_DC_RED: [0.28, 0.3], M_DC_GLASS: [0.06, 0.3],
};
const GLOSS_ENV = 0.9;
const GLOW = {
  M_DC_WIN_AMBER: 3.4, M_DC_WIN_WARM: 2.8, M_DC_WIN_WHITE: 2.0, M_DC_NEON_GOLD: 4.5, M_DC_NEON_RED: 5.0,
  M_DC_HANGAR_LIGHT: 4.0, M_DC_ENGINE: 5.0, M_DC_BEACON: 8.0, M_DC_NAV_RED: 4.0, M_DC_NAV_GREEN: 4.0,
};
const GLOW_COLOR = {
  M_DC_WIN_AMBER: 0xff8a2c, M_DC_WIN_WARM: 0xffb468, M_DC_WIN_WHITE: 0xd8e4ff, M_DC_NEON_GOLD: 0xffa830, M_DC_NEON_RED: 0xff2a14,
  M_DC_HANGAR_LIGHT: 0xffa860, M_DC_ENGINE: 0x8ab8ff, M_DC_BEACON: 0xfff2dc, M_DC_NAV_RED: 0xff1a10, M_DC_NAV_GREEN: 0x20ff60,
};
const LOOK = {
  M_DC_HULL_CREAM: { cell: [7.0, 4.5], seam: .14, depth: .10, tint: .07, rough: .10, grime: .42, wear: .25 },
  M_DC_HULL_GREY:  { cell: [6.0, 4.0], seam: .14, depth: .25, tint: .08, rough: .12, grime: .34, wear: .35 },
  M_DC_HULL_PATCH: { cell: [5.0, 3.5], seam: .16, depth: .20, tint: .14, rough: .14, grime: .46, wear: .35 },
  M_DC_GUNMETAL:   { cell: [5.0, 3.0], seam: .14, depth: .40, tint: .08, rough: .14, grime: .24, wear: .45 },
  M_DC_DARK:       { cell: [12.0, 7.0], seam: .20, depth: .14, tint: .14, rough: .18, grime: .18, wear: .25 },
  M_DC_RUST:       { cell: [5.0, 3.5], seam: .16, depth: .16, tint: .18, rough: .16, grime: .40, wear: .20 },
  M_DC_RED:        { cell: [6.0, 4.0], seam: .14, depth: .12, tint: .08, rough: .10, grime: .32, wear: .30 },
  M_DC_BRASS:      { cell: [4.0, 3.0], seam: .10, depth: .10, tint: .10, rough: .10, grime: .30, wear: .50 },
};
// axes et flèches (angle Blender ° depuis l'est vers le nord, longueur m)
const ARMS = [[0, 1200], [90, 1180], [180, 1200], [270, 1294], [32, 1110], [54.5, 1100], [125, 1097], [202.5, 1245], [229, 1080], [316, 1350]];

function mount(container, opts = {}) {
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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !LITE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene(), bgScene = new THREE.Scene();
  bgScene.background = new THREE.Color(0x010207);
  const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.02, 4000);
  const portrait = () => W() / H() < 0.8;
  function fitDistance() {
    camera.fov = portrait() ? 54 : 40; camera.updateProjectionMatrix();
    const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    return Math.max(16, (portrait() ? 12.5 : 11.5) / Math.tan(Math.min(v, h)));
  }
  const HAZE = new THREE.Color(0x0e1630);
  scene.fog = new THREE.Fog(HAZE, 10, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const CAM_DIR = new THREE.Vector3(0.66, 0.36, 0.66).normalize();
  const SUN_DIR = new THREE.Vector3(-0.28, 0.30, -0.91).normalize();

  /* ── fond : nébuleuse, étoiles, géante gazeuse, soleil ── */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      float h(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        vec3 axis = normalize(vec3(0.35, 0.85, -0.4));
        float band = exp(-pow(dot(d, axis) * 1.7, 2.0));
        float neb = band * smoothstep(.34, .84, fbm(d * 3.0));
        float dust = fbm(d * 6.5 + 4.0);
        vec3 col = vec3(.004,.006,.014);
        float hue = fbm(d * 2.1 + 7.0);
        vec3 pc = mix(vec3(.10,.12,.45), vec3(.42,.12,.30), smoothstep(.35,.7,hue));
        col += pc * neb * .45;
        col += mix(vec3(.35,.40,.9), vec3(.9,.45,.35), smoothstep(.4,.7,hue)) * pow(neb, 2.4) * .4;
        col *= 1.0 - .7 * smoothstep(.45, .75, dust) * band;
        gl_FragColor = vec4(col, 1.0);
      }`
  }));
  bgScene.add(sky);
  function starField(count, radius, size) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.set([radius * s * Math.cos(t), radius * u, radius * s * Math.sin(t)], i * 3);
      const k = Math.random();
      c.setRGB(...(k > .92 ? [1, .8, .6] : k > .7 ? [.78, .86, 1] : [1, 1, 1])).multiplyScalar(.25 + Math.random() * .6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
  }
  bgScene.add(starField(3200, 1400, 1.2), starField(240, 1400, 2.2));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(300, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uTime; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.1+3.7; a*=.5; } return s; }
      void main(){
        vec3 p = normalize(vP);
        float lat = p.y, lon = atan(p.z, p.x);
        float warp = fbm(vec2(lon * 3.0 + uTime * .002, lat * 9.0)) * .35;
        float bands = sin((lat + warp * .25) * 38.0) * .5 + .5;
        float fine = fbm(vec2(lon * 14.0, (lat + warp * .1) * 70.0));
        vec3 c1 = vec3(.62, .48, .34), c2 = vec3(.30, .22, .18), c3 = vec3(.80, .70, .55);
        vec3 col = mix(c2, c1, bands);
        col = mix(col, c3, smoothstep(.55, .8, fine) * .35);
        vec2 st = vec2((lon - 1.2) * 2.2, (lat + .22) * 9.0);
        col = mix(col, vec3(.72, .35, .22), smoothstep(1.0, .2, length(st)) * .7);
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        float lit = max(dot(N, uSun), 0.0);
        float term = smoothstep(-.08, .35, dot(N, uSun));
        vec3 c = col * (lit * 1.25 + .015) * term;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        c += vec3(.45, .62, 1.0) * rim * (smoothstep(-.2, .5, dot(N, uSun)) * .9 + .05);
        gl_FragColor = vec4(c, 1.0);
      }`
  }));
  planet.position.copy(CAM_DIR.clone().multiplyScalar(-760).add(new THREE.Vector3(-120, -330, 40)));
  planet.rotation.z = 0.28;
  bgScene.add(planet);

  function radialTex(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, col] of stops) r.addColorStop(o, col);
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const sunPos = SUN_DIR.clone().multiplyScalar(1100);
  for (const [size, stops, opacity, sx] of [
    [55,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,250,235,1)'], [.5, 'rgba(255,235,200,.6)'], [1, 'rgba(255,220,180,0)']], 1.0, 1],
    [320, [[0, 'rgba(255,240,215,.9)'], [.12, 'rgba(255,215,170,.45)'], [.4, 'rgba(200,170,255,.10)'], [1, 'rgba(120,120,255,0)']], .9, 1],
    [950, [[0, 'rgba(255,230,200,.30)'], [.3, 'rgba(160,150,255,.07)'], [1, 'rgba(80,90,255,0)']], .8, 1],
    [800, [[0, 'rgba(210,225,255,.8)'], [.25, 'rgba(150,170,255,.25)'], [1, 'rgba(100,120,255,0)']], .5, 0.03],
  ]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(stops), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
    sp.scale.set(size, size * sx, 1); sp.position.copy(sunPos); bgScene.add(sp);
  }

  /* ── lumière ── */
  const station = new THREE.Group();
  scene.add(station);
  const key = new THREE.DirectionalLight(0xfff0dc, 3.3);
  key.position.copy(SUN_DIR).multiplyScalar(30);
  key.castShadow = !LITE;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 70 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  key.target = station;
  scene.add(key);
  const bounce = new THREE.DirectionalLight(0xffc79a, 0.75); bounce.position.copy(CAM_DIR).multiplyScalar(20).add(new THREE.Vector3(0, -12, 0)); scene.add(bounce);
  const rimL = new THREE.DirectionalLight(0x9db8e8, 0.9); rimL.position.set(-12, 6, 14); scene.add(rimL);
  scene.add(new THREE.HemisphereLight(0x2c3a58, 0x0a0705, 0.5));
  function glowLight(color, intensity, dist, x, y, z) { const l = new THREE.PointLight(color, intensity, dist, 1.8); l.position.set(x, y, z); station.add(l); return l; }

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
    mat.customProgramCacheKey = () => 'dc-premium-' + mat.name;
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
  const shipMat = new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.9 });
  const TRAFFIC = [];
  const armDir = (a) => { const r = THREE.MathUtils.degToRad(a); return new THREE.Vector3(Math.cos(r), 0, -Math.sin(r)); };
  function laneShip(kind) {
    const s = { kind, t: 0 };
    if (kind === 'lane') {
      const [a, L] = ARMS[(Math.random() * ARMS.length) | 0];
      const d = armDir(a + (Math.random() - .5) * 4), side = new THREE.Vector3(-d.z, 0, d.x);
      const off = (Math.random() - .5) * 1.6, hgt = (Math.random() - .3) * 1.6;
      s.a = d.clone().multiplyScalar(L * S + 10 + Math.random() * 18).addScaledVector(side, off * 3).add(new THREE.Vector3(0, hgt * 3 + 2, 0));
      s.b = d.clone().multiplyScalar(L * S + 0.6).addScaledVector(side, off).add(new THREE.Vector3(0, hgt * 0.4, 0));
      if (Math.random() < .5) [s.a, s.b] = [s.b, s.a];
      s.dur = 18 + Math.random() * 26; s.t = Math.random(); s.size = 0.25 + Math.random() * 0.55;
    } else if (kind === 'orbit') {
      s.r = 7.6 + Math.random() * 3.6; s.y = (Math.random() - .5) * 2.4; s.w = (0.012 + Math.random() * .02) * (Math.random() < .5 ? 1 : -1);
      s.ph = Math.random() * Math.PI * 2; s.size = 0.18 + Math.random() * 0.35;
    } else {
      const ang = Math.random() * Math.PI * 2, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), side = new THREE.Vector3(-d.z, 0, d.x);
      const y = (Math.random() - .5) * 8, dist = 55 + Math.random() * 30;
      s.a = side.clone().multiplyScalar(dist).addScaledVector(d, -60).add(new THREE.Vector3(0, y, 0));
      s.b = side.clone().multiplyScalar(dist).addScaledVector(d, 60).add(new THREE.Vector3(0, y, 0));
      s.dur = 260 + Math.random() * 160; s.t = Math.random(); s.size = 3.0 + Math.random() * 2.0;
    }
    return s;
  }
  for (let i = 0; i < (LITE ? 40 : 96); i++) TRAFFIC.push(laneShip('lane'));
  for (let i = 0; i < (LITE ? 24 : 54); i++) TRAFFIC.push(laneShip('orbit'));
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

  /* ── caméra : deux cadrages ── */
  const P = (x, y, z) => new THREE.Vector3(x * S, z * S, -y * S);   // repère Blender (m) -> scène
  // le bar : sur l'anneau à −24°, façade tournée vers le noyau ; on le regarde depuis l'intérieur de l'anneau, un peu en surplomb
  const VIEWS = {
    port: () => { const T = new THREE.Vector3(0, 0.9, 0); return { target: T, pos: T.clone().addScaledVector(CAM_DIR, fitDistance()), min: 1.6, max: fitDistance() * 1.6, auto: 0.22 }; },
    bar: () => { fitDistance(); const B = opts.barShot || { t: [500, -215, 170], p: [180, -60, 380] }; const T = P(...B.t); return { target: T, pos: P(...B.p), min: 1.2, max: 6, auto: 0.08, sway: 0.35 }; },
  };
  const BAR_AT = P(500, -220, 160);
  let view = VIEWS[opts.view] ? opts.view : 'port';
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
  const introFrom = shot.target.clone().addScaledVector(new THREE.Vector3(0.82, 0.16, 0.55).normalize(), fit0 * 3.4);
  let move = null;   // { from: {pos, target}, to: shot, t0, dur, spherical }
  let interactive = !!opts.interactive, idleTimer = null;
  camera.position.copy(shot.pos); camera.lookAt(shot.target);
  if (opts.intro && !REDUCED && view === 'port') { camera.position.copy(introFrom); }
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), 0.85, 0.5, 1.0);
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
  loader.load(opts.url, (gltf) => {
    if (!alive) return;
    const m = gltf.scene;
    m.updateMatrixWorld(true);
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
        if (GLOSS[mat.name]) { mat.roughness = GLOSS[mat.name][0]; mat.metalness = GLOSS[mat.name][1]; mat.envMapIntensity = GLOSS_ENV; }
        if (mat.name === 'M_DC_GLASS') { mat.envMapIntensity = 2.2; mat.color.setRGB(.02, .03, .045); }
        const look = LOOK[mat.name];
        if (look && !mat.userData.dc) { mat.userData.dc = 1; premium(mat, look); }
        if (GLOW[mat.name]) {
          const c = new THREE.Color(GLOW_COLOR[mat.name]);
          mat.color.copy(c).multiplyScalar(.6); mat.emissive.copy(c); mat.emissiveIntensity = GLOW[mat.name];
          mat.roughness = .6; mat.metalness = 0; mat.side = THREE.DoubleSide; mat.fog = true;
          if (mat.name.startsWith('M_DC_NAV_') && !navMats.includes(mat)) navMats.push(mat);
          if (mat.name === 'M_DC_BEACON' && !beaconMats.includes(mat)) beaconMats.push(mat);
        }
      }
    });
    station.add(m);
    const L = (c, i, d, v) => glowLight(c, i, d, v.x, v.y, v.z);
    L(0xff9a50, 6, 3.2, P(751, 330, 0));
    barLight = L(0xffa040, 5, 4.0, P(470, -230, 150));
    L(0xffb070, 3, 3.0, P(-960, 0, 40));
    const hv = (v, s, c, p) => halo(v.x, v.y, v.z, s, c, p);
    hv(P(0, 0, 653), 0.6, 0xfff2dc, 1.2);
    hv(P(0, -1160, 118), 0.9, 0xfff2dc, 0.7);
    hv(P(470, -210, 220), 0.9, 0xffb048, 0);    // couronne du bar
    ready = true;
    if (opts.intro && !REDUCED && view === 'port') startMove(shot, 7.5, true);
    else { controls.enabled = interactive; controls.autoRotate = !REDUCED; }
    if (opts.onReady) opts.onReady();
  }, (ev) => { if (opts.onProgress && ev.total) opts.onProgress(ev.loaded / ev.total); },
  (err) => { console.warn('[Station3D]', err); if (opts.onError) opts.onError(err); });

  /* ── boucle (en pause hors écran) ── */
  const clock = new THREE.Clock();
  let swayFlip = 0;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (document.hidden || !container.isConnected || !container.getClientRects().length) return;   // hors écran : en pause
    planet.material.uniforms.uTime.value = t;
    updateTraffic(t, dt);
    for (const m of navMats) m.emissiveIntensity = 1.2 + 3.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.2 + (m.name.endsWith('GREEN') ? 1.6 : 0)), 3);
    for (const m of beaconMats) m.emissiveIntensity = 4 + 6 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.3), 4);
    for (const h of halos) {
      const k = h.userData.pulse ? 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(t * h.userData.pulse + h.userData.ph), 3) : 0.8 + 0.2 * Math.sin(t * 3 + h.userData.ph);
      h.scale.setScalar(h.userData.size * (0.7 + 0.5 * k)); h.material.opacity = 0.35 + 0.6 * k;
    }
    if (ready) { if (move) updateMove(t); else controls.update(); }
    if (shot.sway && controls.autoRotate && !move && t - swayFlip > 2) {   // balancement : on repart dans l'autre sens à la butée
      const az = controls.getAzimuthalAngle();
      if (az < controls.minAzimuthAngle + 0.02 || az > controls.maxAzimuthAngle - 0.02) { controls.autoRotateSpeed = -controls.autoRotateSpeed; swayFlip = t; }
    }
    {   // de près, les néons du bar éblouiraient : bloom et lueur baissent avec la distance au bar
      const near = 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(BAR_AT), 2.5, 9);
      bloom.strength = 0.85 - 0.5 * near; if (barLight) barLight.intensity = 5 - 3.2 * near;
    }
    const d = camera.position.distanceTo(controls.target);
    scene.fog.near = Math.max(0.6, d - 9.0); scene.fog.far = d + 34;
    composer.render();
  }
  frame();

  return {
    get view() { return view; },
    setView(v) {
      if (!VIEWS[v] || v === view && !move) return;
      view = v; shot = VIEWS[v](); applyLimits();
      if (ready) startMove(shot, REDUCED ? 0.01 : 2.6, false);
      else { camera.position.copy(shot.pos); controls.target.copy(shot.target); camera.lookAt(shot.target); }
    },
    setInteractive(on) { interactive = !!on; if (!move && ready) controls.enabled = interactive; },
    replayIntro() { if (!ready || REDUCED) return; view = 'port'; shot = VIEWS.port(); applyLimits(); camera.position.copy(introFrom); controls.target.copy(shot.target); startMove(shot, 7.5, true); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); clearTimeout(idleTimer);
      for (const sc of [scene, bgScene]) sc.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const mt of ms) { if (mt.map) mt.map.dispose(); mt.dispose(); }
      });
      envTex.dispose(); pmrem.dispose(); composer.dispose && composer.dispose();
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
      get view() { return h ? h.view : (o && o.view) || 'port'; },
      dispose() { dead = true; pend = []; if (h) h.dispose(); },
    };
  },
};
window.dispatchEvent(new Event('station3d-ready'));
