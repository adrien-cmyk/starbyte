/* Starbyte — Ship3D : fiche d'unité 3D du cuirassé KV-01 (classe Kerath).
   Source : viewer validé par Adrien (artifact « KV-01 Kerath », 11 oct. 2026) — skill starbyte-ship-showcase.
   Profils : KV-01 cuirassé, SR-01 frégate, TK-07 tanker.
   Usage : const h = window.Ship3D.mount(container, { url, ship, onProgress, onReady, onError }); … h.dispose();
   `ship` (facultatif) : profil d'un autre vaisseau mis à l'échelle de la scène du KV-01 (V m de scène par m réel,
   proue glTF recalée sur z = 600) — tuyères, axe de la bulle, table de section de coque (voir PROFIL_KV01).
*/
// Moteur 3D partagé du jeu (window.SB3D, exposé par planet3d.js) : pas de seconde copie de three.js.
// MapControls = OrbitControls avec une autre affectation des gestes ; on remet celle d'une orbite.
function libs() {
  const L = window.SB3D;
  return { THREE: L.THREE, GLTFLoader: L.GLTFLoader, OrbitControls: L.MapControls, RoomEnvironment: L.RoomEnvironment,
           EffectComposer: L.EffectComposer, RenderPass: L.RenderPass, UnrealBloomPass: L.UnrealBloomPass, OutputPass: L.OutputPass };
}

// Profil du cuirassé KV-01 (référence de la scène : 1 m de scène = 1 m réel)
const PROFIL_KV01 = {
  V: 1, bowGltf: 0, axisY: 0.78, engineY: 0.8, engineZ: -7.2, nozzleZ: -655, targetY: 0.9,
  engineColor: [0.50, 0.78, 1.0], plume: [0x2a5cff, 0x3f86ff, 0x86c0ff, 0xe6f3ff, 0x9ccaff, 0x6fa8ff],
  nozzles: [[100, 21], [52, 17]].flatMap(([y, r]) => [-44, 0, 44].map(x => ({ x, y, r }))),
  hull: [[0,72,98,50],[48,52,104,72],[70,46,110,74],[140,46,112,78],[146,22,112,70],[162,22,113,82],[248,22,113,86],[252,22,120,88],[282,12,120,91],[440,12,120,91],[456,12,116,86],[544,12,116,84],[548,10,126,92],[582,6,131,95],[788,4,131,98],[792,3,128,108],[1092,4,136,108],[1122,7,133,101],[1141,12,129,94],[1155,17,125,63],[1180,25,118,40],[1260,30,120,70],[2200,0,150,120],[5000,-40,190,170]],
};
// Profil de la frégate SR-01 Sentinelle (68 m, ×17 → gabarit de scène du KV-01)
const PROFIL_SR01 = {
  V: 17, bowGltf: 34, axisY: 0.84, engineY: 0.75, engineZ: (600 - 72 * 17) * 0.01, nozzleZ: 600 - 68.4 * 17,
  nozzles: [{ x: -2.3 * 17, y: 4.4 * 17, r: 1.6 * 17 }, { x: 2.3 * 17, y: 4.4 * 17, r: 1.6 * 17 }],
  gloss: { M_KV_ARMOR_WHITE: [0.34, 0.0], M_KV_ARMOR_RED: [0.28, 0.3], M_KV_GUNMETAL: [0.26, 0.85], M_KV_STRUCT_BLACK: [0.30, 0.55], M_SR_VERRIERE: [0.06, 0.4] }, glossEnv: 1.0,
  hull: [[0,78,85,5],[7,75,90,14],[51,61,105,34],[85,44,122,48],[170,22,141,73],[255,12,150,94],[340,7,156,105],[425,5,162,114],[510,5,165,119],[612,5,167,130],[680,5,158,130],[765,7,146,130],[850,7,148,109],[935,5,146,78],[966,5,143,76],[978,24,136,73],[1020,27,133,65],[1088,29,124,60],[1124,32,119,54],[1165,40,118,85],[1250,45,125,95],[2200,15,160,130],[5000,-30,200,175]],
};

// Profil du tanker TK-07 (28,6 m, ×40 → gabarit de scène du KV-01) : réacteurs ion / chimiques orangés
const PROFIL_TK07 = {
  V: 40, bowGltf: 14.3, axisY: 1.8, engineY: 1.0, engineZ: (600 - 30 * 40) * 0.01, nozzleZ: 600 - 28.7 * 40, targetY: 1.9,
  nozzles: [{ x: -2.5 * 40, y: 2.55 * 40, r: 1.3 * 40 }, { x: 2.5 * 40, y: 2.55 * 40, r: 1.3 * 40 }],
  engineColor: [1.0, 0.74, 0.42], plume: [0xff5a1a, 0xff8a2a, 0xffc070, 0xfff2d8, 0xffc890, 0xffa060],
  gloss: { M_TK_ARMOR_JAUNE: [0.40, 0.08], M_KV_GUNMETAL: [0.26, 0.85], M_KV_STRUCT_BLACK: [0.30, 0.55], M_TK_GRAPHITE: [0.30, 0.6] }, glossEnv: 0.85,
  hull: [[0,16,280,170],[30,0,300,200],[72,0,300,205],[944,0,300,205],[984,40,290,195],[1064,40,280,190],[1144,40,270,140],[1200,50,260,150],[1300,60,280,190],[2200,20,320,240],[5000,-40,360,300]],
};

function mount(container, opts = {}) {
const { THREE, GLTFLoader, OrbitControls, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = libs();
/* ================================================================== réglages */
const S = 0.01;                                   // 1 unité = 100 m
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const P = Object.assign({}, PROFIL_KV01, opts.ship || {});
const ENGINE_COLOR = new THREE.Color(...P.engineColor);   // pleine puissance (bleu-blanc par défaut)
const PL = P.plume;                               // couleurs des panaches : halo, gaine, corps, cœur, lueur, lumière
const NOZZLES = P.nozzles;                        // sorties de cloches (m de scène)
const NOZZLE_Z = P.nozzleZ;

/* ================================================================== moteur de rendu */
const stage = container;
const W = () => Math.max(1, container.clientWidth), H = () => Math.max(1, container.clientHeight);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W(), H());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.domElement.className = 'u3d-canvas';
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010207);
const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.05, 600);
// vue héros : la scène occupe tout l'écran, le vaisseau est cadré dans la partie haute (au-dessus des cartes)
function applyShift() {
  const sh = opts.shiftY || 0;
  if (sh) camera.setViewOffset(W(), H(), 0, H() * sh, W(), H()); else camera.clearViewOffset();
}
function fitDistance() {
  camera.fov = camera.aspect < 0.8 ? 54 : 40; applyShift(); camera.updateProjectionMatrix();
  const v = THREE.MathUtils.degToRad(camera.fov) / 2;
  const h = Math.atan(Math.tan(v) * camera.aspect);
  const half = camera.aspect < 0.8 ? 4.7 : 5.0;
  return Math.max(8.5, half / Math.tan(Math.min(v, h)));
}

// perspective aérienne : brume bleutée dont le départ suit la caméra -> la poupe/proue lointaine s'estompe,
// ce qui fait lire 1 200 m. Recalée à chaque image (voir frame()).
const HAZE = new THREE.Color(0x14204a);
const PLASMA_T = { value: 0 };
scene.fog = new THREE.Fog(HAZE, 6, 40);
function updateHaze() {
  const d = camera.position.distanceTo(controls.target);
  scene.fog.near = Math.max(0.5, d - 5.0);
  scene.fog.far = d + 22;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ================================================================== fond : discret, le vaisseau est le héros */
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 32), new THREE.ShaderMaterial({
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
      vec3 axis = normalize(vec3(0.55, 0.75, -0.35));
      float band = exp(-pow(dot(d, axis) * 1.8, 2.0));
      float neb = band * smoothstep(.32, .82, fbm(d * 3.2));
      float dust = fbm(d * 6.5 + 4.0);
      vec3 col = vec3(.004,.007,.016);
      float hue = fbm(d * 2.1 + 7.0);
      vec3 pc = mix(vec3(.08,.16,.62), vec3(.38,.10,.62), smoothstep(.35,.7,hue));
      col += pc * neb * .55;
      col += mix(vec3(.25,.45,1.0), vec3(.70,.30,1.0), smoothstep(.4,.7,hue)) * pow(neb, 2.4) * .55;
      col *= 1.0 - .7 * smoothstep(.45, .75, dust) * band;
      col += vec3(.40,.20,.08) * band * pow(smoothstep(.62,.9, fbm(d*9.0+11.0)), 2.0) * .18;
      gl_FragColor = vec4(col, 1.0);
    }`
}));
scene.add(sky);

function starField(count, radius, size) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const c = new THREE.Color();
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
scene.add(starField(3000, 280, 1.2), starField(220, 280, 2.2));

const DUST_N = 420, DUST_BOX = 40;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) dustPos.set([(Math.random() - .5) * DUST_BOX, (Math.random() - .5) * DUST_BOX * .6, (Math.random() - .5) * DUST_BOX], i * 3);
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.03, color: 0x8ea4c8, transparent: true, opacity: .4, depthWrite: false, fog: false }));
scene.add(dust);

/* ================================================================== lumière cinématique */
const ship = new THREE.Group();
scene.add(ship);
// soleil puissant droit devant : le cuirassé fonce dans la lumière
const SUN_DIR = new THREE.Vector3(-0.42, 0.03, 0.91).normalize();
const key = new THREE.DirectionalLight(0xfff0dc, 3.4);
key.position.copy(SUN_DIR).multiplyScalar(14);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015;
key.target = ship;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9db8e8, 1.3); rim.position.set(-9, 4, -10); scene.add(rim);   // contre-jour froid
const fill = new THREE.DirectionalLight(0xb8c6e8, 0.8); fill.position.set(3, 10, -4); scene.add(fill);
scene.add(new THREE.HemisphereLight(0x2c3a58, 0x05060a, 0.55));
const engineLight = new THREE.PointLight(PL[5], 0, 10, 1.7);
engineLight.position.set(0, P.engineY, P.engineZ);
ship.add(engineLight);

/* ================================================================== lookdev : jointures, rainures, roughness, patine
   Injecté dans MeshStandardMaterial : motif de panneaux en projection triplanaire (repère objet, en mètres),
   joints en creux (bump par dérivées), variation de teinte/roughness par panneau, patine basse fréquence,
   micro-usure sur les arêtes vives. Aucun UV ni texture : tout est procédural, donc léger sur mobile. */
const LOOK = {
  M_KV_ARMOR_WHITE:  { cell: [9.0, 6.0], seam: .16, depth: .0, tint: .05, rough: .10, grime: .34, wear: .00 },
  M_KV_ARMOR_RED:    { cell: [8.0, 5.0], seam: .16, depth: .12, tint: .07, rough: .10, grime: .32, wear: .30 },
  M_KV_GUNMETAL:     { cell: [6.0, 4.0], seam: .15, depth: .40, tint: .08, rough: .14, grime: .24, wear: .40 },
  M_KV_STRUCT_BLACK: { cell: [15.0, 8.5], seam: .20, depth: .12, tint: .16, rough: .18, grime: .18, wear: .25 },
  M_TK_ARMOR_JAUNE:  { cell: [9.0, 6.0], seam: .16, depth: .05, tint: .06, rough: .10, grime: .40, wear: .35 },
  M_TK_GRAPHITE:     { cell: [12.0, 8.0], seam: .18, depth: .20, tint: .12, rough: .16, grime: .22, wear: .35 },
};
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
        // panneaux en appareillage décalé + sous-division aléatoire ; renvoie (distance au joint, id panneau)
        vec2 panel(vec2 uv, vec2 cell){
          vec2 c = uv / cell; float row = floor(c.y); c.x += hh(vec2(row, 3.1)) * .9; c.x *= .7 + .6 * hh(vec2(row, 9.7));
          vec2 id = floor(c); vec2 f = fract(c);
          if (hh(id + 7.3) > .55) { float sx = step(.5, f.x); id = id * 2.0 + vec2(sx, 0.0); f.x = fract(f.x * 2.0); f.x = f.x; }
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
        // deux échelles de panneaux : fins (de près) et grands (lisibles de loin) -> le détail ne disparaît plus
        float mpp = length(fwidth(vOP));
        float cmin = min(uCell.x, uCell.y);
        float near = 1.0 - smoothstep(cmin / 22.0, cmin / 9.0, mpp);
        float farv = 1.0 - smoothstep(cmin * 3.5 / 30.0, cmin * 3.5 / 7.0, mpp);
        float pidF, pidC;
        float seamF = tri(uCell, uLook.x, pidF) * near;
        float seamC = tri(uCell * 3.5, uLook.x * 2.4, pidC) * farv;
        float seam = max(seamF, seamC * .85);
        float pid = mix(.5, pidF, near) * .45 + pidC * .55;
        // saleté générale : patine multi-échelle, coulures longitudinales (sillage), suie près des moteurs
        vec3 op = vOP;
        float grime = vn(op * .018) * .5 + vn(op * .07) * .3 + vn(op * .3) * .2;
        float streak = vn(vec3(op.x * .35, op.y * .35, op.z * .012)) * vn(vec3(op.x * 1.1, op.y * 1.1, op.z * .04));
        float soot = smoothstep(-430.0, -650.0, op.z) * (.55 + .45 * vn(op * .05));
        float low = smoothstep(.2, -.8, normalize(vON).y);
        vec3 fw = fwidth(normalize(vON)); float edge = clamp(length(fw) * 6.0, 0.0, 1.0) * near;
        diffuseColor.rgb *= (1.0 - uLook.z * .5) + uLook.z * pid;                  // teinte par panneau
        diffuseColor.rgb *= 1.0 - .30 * seam;                                       // joints sombres
        float leak = smoothstep(.55, .95, vn(vec3(op.x * .6, op.y * .08, op.z * .6))) * smoothstep(.0, .6, seam + .3);   // coulures sous les joints
        float dirt = clamp(uLook2.x * (grime * 1.7 + low * .9) + .55 * smoothstep(.15, .65, streak) + .7 * soot + .35 * leak + .12, 0.0, .9);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.42, .38, .33), dirt);   // crasse brun-gris
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.6 + .04, edge * uLook2.y * .5); // micro-usure d'arête`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + uLook.w * (pid - .5) + .22 * seam + .25 * dirt - .12 * edge * uLook2.y, .05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {   // joints en creux : bump par dérivées écran
          float hgt = -seam * uLook.y * .22;
          vec3 sp = -vViewPosition; vec3 dpdx = dFdx(sp), dpdy = dFdy(sp);
          float dhx = dFdx(hgt), dhy = dFdy(hgt);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  mat.customProgramCacheKey = () => 'kv-premium-' + mat.name;
}

/* ================================================================== panaches de propulsion */
const plumeMat = (color, alpha, flick, layer) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFlick: { value: flick }, uLayer: { value: layer } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uAlpha, uFlick, uLayer; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
    void main(){
      float t = vUv.y;                                       // 1 = sortie de tuyère, 0 = bout du panache
      float along = pow(t, 1.25 + uLayer * .9) * smoothstep(0.0, .12, t);
      float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.2 + uLayer);
      vec2 q = vec2(vUv.x * 6.0, vUv.y * 9.0 - uTime * 7.0);
      float turb = .72 + .28 * vn(q) * uFlick + .12 * vn(q * 2.7 + 5.0);
      float diamonds = .78 + .22 * pow(.5 + .5 * sin(t * 46.0 - uTime * 3.0), 3.0) * (1.0 - uLayer * .6) * smoothstep(.35, .9, t);
      float a = uAlpha * along * core * turb * diamonds;
      vec3 c = mix(uColor * vec3(.75, .8, 1.15), uColor, t);   // dérive vers le violet en bout
      gl_FragColor = vec4(c * a, a);
    }`
});
const plumeMats = [];
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.2, 'rgba(170,215,255,.75)');
  r.addColorStop(.55, 'rgba(60,120,255,.18)'); r.addColorStop(1, 'rgba(30,70,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
for (const nz of NOZZLES) {
  const g = new THREE.Group();
  g.position.set(nz.x * S, nz.y * S, NOZZLE_Z * S);
  const R = nz.r * S;
  for (const [len, rIn, rOut, color, alpha, flick, layer] of [
    [R * 40, R * .86, R * .20, PL[0], .16, 1.0, 1.0],   // halo externe, long et diffus
    [R * 28, R * .74, R * .10, PL[1], .30, 1.0, .7],    // gaine bleue
    [R * 16, R * .58, R * .05, PL[2], .42, .8, .4],     // corps
    [R * 7,  R * .40, R * .03, PL[3], .55, .4, 0.0],    // cœur blanc
  ]) {
    const geo = new THREE.CylinderGeometry(rIn, rOut, len, 40, 1, true);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len / 2);
    const m = plumeMat(color, alpha, flick, layer); plumeMats.push(m);
    g.add(new THREE.Mesh(geo, m));
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PL[4], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .45, fog: false }));
  sp.scale.setScalar(R * 2.8); sp.position.z = -R * .3;
  g.add(sp);
  ship.add(g);
}

// disque solaire, halo et reflet anamorphique (additifs, occultés par la coque)
function radialTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) r.addColorStop(o, col);
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const sunGroup = new THREE.Group();
const sunPos = SUN_DIR.clone().multiplyScalar(240);
for (const [size, stops, opacity, sx] of [
  [16,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,250,235,1)'], [.5, 'rgba(255,235,200,.6)'], [1, 'rgba(255,220,180,0)']], 1.0, 1],   // disque
  [90,  [[0, 'rgba(255,240,215,.9)'], [.12, 'rgba(255,215,170,.45)'], [.4, 'rgba(200,170,255,.12)'], [1, 'rgba(120,120,255,0)']], .9, 1], // halo
  [260, [[0, 'rgba(255,230,200,.35)'], [.3, 'rgba(160,150,255,.08)'], [1, 'rgba(80,90,255,0)']], .8, 1],                                 // voile large
  [190, [[0, 'rgba(210,225,255,.8)'], [.25, 'rgba(150,170,255,.25)'], [1, 'rgba(100,120,255,0)']], .55, 0.03],                         // streak anamorphique
]) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(stops), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
  sp.scale.set(size, size * sx, 1);
  sp.position.copy(sunPos);
  sunGroup.add(sp);
}
scene.add(sunGroup);

/* ================================================================== bulle de choc plasma + sillage
   Le cuirassé fend un milieu ionisé comme une étrave fend l'eau : une enveloppe paraboloïde part
   devant la proue, épouse la coque et s'ouvre derrière la poupe en sillage. Rendu additif en
   fresnel (lumineux sur les bords, transparent de face), filets de plasma qui défilent vers l'arrière. */
const BOW_Z = 7.25, WAKE_Z = -19.0, AXIS_Y = P.axisY;
const bubbleR = (d) => 1.18 * Math.pow(Math.max(d, 0.0001), 0.47);          // rayon selon la distance à l'étrave
function bubbleGeo(scale, segU = 120, segA = 72) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segU; i++) {
    const u = i / segU, d = Math.pow(u, 1.6) * (BOW_Z - WAKE_Z);
    const r = bubbleR(d) * scale, z = BOW_Z - d;
    for (let j = 0; j <= segA; j++) {
      const a = j / segA * Math.PI * 2;
      pos.push(Math.cos(a) * r, AXIS_Y + Math.sin(a) * r * 0.78, z);
      uv.push(j / segA, u);
    }
  }
  for (let i = 0; i < segU; i++) for (let j = 0; j < segA; j++) {
    const a = i * (segA + 1) + j, b = a + segA + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const shockMat = (gain, fres, speed) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: PLASMA_T, uGain: { value: gain }, uFres: { value: fres }, uSpeed: { value: speed } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uGain, uFres, uSpeed; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.1+3.7; a*=.5; } return s; }
    void main(){
      float u = vUv.y;                                   // 0 = étrave, 1 = bout du sillage
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uFres);
      // filets de plasma étirés le long du flux, qui défilent vers l'arrière
      vec2 q = vec2(vUv.x * 46.0, u * 9.0 - uTime * uSpeed);
      float streaks = fbm(vec2(q.x, q.y * .35)) ;
      streaks = smoothstep(.38, .9, streaks);
      float churn = fbm(vec2(vUv.x * 12.0 + uTime * .2, u * 20.0 - uTime * uSpeed * 2.0));
      // front de choc : très chaud à l'étrave, se refroidit et se dissout dans le sillage
      float nose = exp(-u * 22.0);
      float body = smoothstep(1.0, .55, u) * (1.0 - nose);
      float tail = smoothstep(.45, 1.0, u) * smoothstep(1.0, .7, u);
      float inten = nose * 4.5 + body * (.35 + .9 * streaks) + tail * churn * .9;
      vec3 hot  = vec3(.80, .92, 1.0);
      vec3 blue = vec3(.22, .45, 1.0);
      vec3 vio  = vec3(.58, .22, 1.0);
      vec3 col = mix(mix(hot, blue, smoothstep(0.0, .12, u)), vio, smoothstep(.25, .9, u) * (.5 + .5 * churn));
      float a = uGain * inten * (fres * .85 + nose * .5) * (.85 + .15 * sin(uTime * 3.0 + u * 30.0));
      gl_FragColor = vec4(col * a, a);
    }`
});
const shock = new THREE.Group();
shock.add(new THREE.Mesh(bubbleGeo(1.0), shockMat(.55, 2.2, 1.6)));     // enveloppe principale
shock.add(new THREE.Mesh(bubbleGeo(1.12), shockMat(.28, 3.2, 1.1)));    // halo externe, plus diffus
shock.add(new THREE.Mesh(bubbleGeo(0.9), shockMat(.22, 1.6, 2.4)));     // couche interne, plus vive
shock.children.forEach(m => { m.renderOrder = 2; m.frustumCulled = false; });
ship.add(shock);

// fumée de plasma qui épouse la coque : bouffées émises sur l'enveloppe du vaisseau,
// entraînées vers l'arrière, qui gonflent, se décollent et se dissipent dans le sillage
const HULL = P.hull;   // au-delà de la poupe : queue de comète qui s'évase
function hullAt(sm) {                       // station (m depuis la proue) -> [zb, zt, hw] en m
  if (sm <= HULL[0][0]) return HULL[0].slice(1);
  for (let k = 1; k < HULL.length; k++) if (sm <= HULL[k][0]) {
    const A = HULL[k - 1], B = HULL[k], f = (sm - A[0]) / (B[0] - A[0]);
    return [A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, A[3] + (B[3] - A[3]) * f];
  }
  return HULL[HULL.length - 1].slice(1);
}
// filaments de plasma : à plus de 100 000 km/h la fumée n'a pas le temps de faire des volutes,
// elle est étirée en longs filaments qui collent à la coque puis s'en arrachent dans le sillage
const FIL_N = 1400;
const fHead = new Float32Array(FIL_N * 4 * 3), fCorner = new Float32Array(FIL_N * 4 * 2);
const fLen = new Float32Array(FIL_N * 4), fWid = new Float32Array(FIL_N * 4), fSeed = new Float32Array(FIL_N * 4 * 2);
const fIdx = [];
for (let i = 0; i < FIL_N; i++) {
  const v = i * 4;
  fCorner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2);
  fIdx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
}
const filGeo = new THREE.BufferGeometry();
filGeo.setAttribute('position', new THREE.BufferAttribute(fHead, 3));
filGeo.setAttribute('aCorner', new THREE.BufferAttribute(fCorner, 2));
filGeo.setAttribute('aLen', new THREE.BufferAttribute(fLen, 1));
filGeo.setAttribute('aWid', new THREE.BufferAttribute(fWid, 1));
filGeo.setAttribute('aSeed', new THREE.BufferAttribute(fSeed, 2));   // (graine, âge)
filGeo.setIndex(fIdx);
const sS0 = new Float32Array(FIL_N), sAng = new Float32Array(FIL_N), sLife = new Float32Array(FIL_N), sT = new Float32Array(FIL_N), sRnd = new Float32Array(FIL_N);
function spawnFil(i, t0) {
  sS0[i] = Math.random() < .8 ? Math.random() * 140 : Math.random() * 900;   // naissance surtout à l'étrave
  sAng[i] = Math.random() * Math.PI * 2;
  sLife[i] = 2.2 + Math.random() * 1.8;
  sT[i] = t0;
  sRnd[i] = Math.random();
}
for (let i = 0; i < FIL_N; i++) spawnFil(i, -Math.random() * 2.6);
const smokeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
  uniforms: { uTime: PLASMA_T },
  vertexShader: `attribute vec2 aCorner; attribute float aLen; attribute float aWid; attribute vec2 aSeed;
    varying vec2 vC; varying float vAge; varying float vSeed;
    void main(){
      vC = aCorner; vSeed = aSeed.x; vAge = aSeed.y;
      vec4 h = modelViewMatrix * vec4(position, 1.0);
      vec4 tl = modelViewMatrix * vec4(position - vec3(0.0, 0.0, aLen), 1.0);
      vec3 dir = tl.xyz - h.xyz;
      vec3 side = normalize(cross(dir, -h.xyz));
      float taper = mix(1.0, 1.6, aCorner.x);                    // le filament s'élargit en s'éloignant
      vec3 p = mix(h.xyz, tl.xyz, aCorner.x) + side * aWid * taper * aCorner.y;
      gl_Position = projectionMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `varying vec2 vC; varying float vAge; varying float vSeed; uniform float uTime;
    float hh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
    float vn(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(hh(i), hh(i + 1.0), f); }
    void main(){
      float across = pow(max(1.0 - vC.y * vC.y, 0.0), 2.2);       // profil très doux, aucune arête
      float along = smoothstep(0.0, .25, vC.x) * smoothstep(1.0, .35, vC.x);   // apparition et extinction progressives
      float fib = .85 + .15 * vn(vC.x * 3.0 + vSeed * 40.0 - uTime * 1.5);    // ondulation lente et légère
      float life = smoothstep(0.0, .06, vAge) * smoothstep(1.0, .3, vAge);   // visible dès l'étrave, s'éteint en douceur
      vec3 hot = vec3(.62, .78, 1.0), cool = vec3(.46, .22, 1.0);
      vec3 col = mix(hot, cool, clamp(vC.x * .7 + vAge * .6, 0.0, 1.0));
      float a = across * along * fib * life * .02;                 // fondu normal : les couches se mélangent sans jamais saturer
      gl_FragColor = vec4(col * 1.15, a);
    }`
});
const smoke = new THREE.Mesh(filGeo, smokeMat);
smoke.frustumCulled = false; smoke.renderOrder = 3;
// rendu après l'occlusion ambiante (sinon le passe GTAO l'efface) : scène d'effets séparée qui suit le vaisseau
const fxScene = new THREE.Scene();
const fxShip = new THREE.Group(); fxScene.add(fxShip);
fxShip.add(smoke);
function updateSmoke(t) {
  for (let i = 0; i < FIL_N; i++) {
    let age = (t - sT[i]) / sLife[i];
    if (age >= 1) { spawnFil(i, t); age = 0; }
    if (age < 0) age = 0;
    const sm = sS0[i] + (260 + 900 * age) * age * sLife[i];          // longe toute la coque puis file loin derrière        // entraîné de plus en plus vite vers l'arrière
    const [zb, zt, hw] = hullAt(sm);
    const grow = 1.04 + age * age * 0.35;                           // colle à la coque puis s'arrache
    const c = Math.cos(sAng[i]), sn = Math.sin(sAng[i]);
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.5), ey = Math.sign(sn) * Math.pow(Math.abs(sn), 0.5);
    const cy = (zb + zt) / 2, hhh = (zt - zb) / 2;
    const x = ex * (hw * grow + 4) * 0.01, y = (cy + ey * (hhh * grow + 4)) * 0.01, z = (600 - sm) * 0.01;
    const len = 1.6 + 6.0 * age + 1.8 * sRnd[i];
    const wid = 0.06 + 0.16 * age + 0.04 * sRnd[i];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      fHead[v * 3] = x; fHead[v * 3 + 1] = y; fHead[v * 3 + 2] = z;
      fLen[v] = len; fWid[v] = wid; fSeed[v * 2] = sRnd[i]; fSeed[v * 2 + 1] = age;
    }
  }
  for (const n of ['position', 'aLen', 'aWid', 'aSeed']) filGeo.attributes[n].needsUpdate = true;
}
// lueur du front de choc projetée sur la proue
const shockLight = new THREE.PointLight(0x7a7dff, 3.2, 9, 1.6);
shockLight.position.set(0, AXIS_Y + 0.4, BOW_Z - 1.2);
ship.add(shockLight);

/* ================================================================== chargement du modèle (glb gzip + base64) */
const navMats = [];
const loader = new GLTFLoader();
function loadShip() {
  return new Promise((ok, ko) => loader.load(opts.url, ok, (e) => { if (e.total && opts.onProgress) opts.onProgress(e.loaded / e.total); }, ko));
}
loadShip().then((gltf) => {
  const m = gltf.scene;
  if (P.V !== 1 || P.bowGltf) {   // autre vaisseau : géométrie passée en m de scène (le lookdev travaille en repère objet)
    m.updateMatrixWorld(true);
    const toScene = new THREE.Matrix4().makeTranslation(0, 0, P.bowGltf ? 600 - P.bowGltf * P.V : 0).multiply(new THREE.Matrix4().makeScale(P.V, P.V, P.V));
    m.traverse(o => { if (o.isMesh) o.geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toScene, o.matrixWorld)); });
    m.traverse(o => { if (o !== m) { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); } });
  }
  m.scale.setScalar(S);
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      const gl = P.gloss && P.gloss[mat.name];   // brillance par vaisseau : rugosité, métal, reflets
      mat.envMapIntensity = gl ? (mat.name === 'M_SR_VERRIERE' ? 2.0 : P.glossEnv) : 0.45;
      if (gl) { mat.roughness = gl[0]; mat.metalness = gl[1]; }
      const look = LOOK[mat.name];
      if (look && !mat.userData.kv) { mat.userData.kv = 1; premium(mat, look); }
      if (mat.name === 'M_KV_GLOW_MOTEUR') { mat.emissive.copy(ENGINE_COLOR); mat.emissiveIntensity = 5.5; mat.color.copy(ENGINE_COLOR); }
      else if (mat.name === 'M_KV_GLOW_ORANGE') { mat.emissiveIntensity = 2.2; }
      else if (mat.name === 'M_KV_GLOW_BLUE') { mat.emissiveIntensity = 1.8; }
      else if (mat.name.startsWith('M_KV_NAV_')) { if (!navMats.includes(mat)) navMats.push(mat); }
    }
  });
  ship.add(m);
  // occulteur invisible (profondeur seule) dans la scène d'effets : la coque masque les filaments passant derrière
  const occ = m.clone(true);
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  occ.traverse(o => { if (o.isMesh) { o.material = depthOnly; o.castShadow = o.receiveShadow = false; } });
  fxShip.add(occ);
  engineLight.intensity = 5;
  if (opts.onReady) opts.onReady();
}).catch((e) => { console.error(e); if (opts.onError) opts.onError(e); });

/* ================================================================== caméra : orbite + pincer */
const TARGET = new THREE.Vector3(0, P.targetY, W() / H() < 0.8 ? -1.8 : -0.2);
{
  const d = fitDistance();
  camera.position.copy(TARGET).add(new THREE.Vector3(0.55, 0.24, -0.80).normalize().multiplyScalar(d));
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.9;
controls.minDistance = 3.0;
controls.maxDistance = fitDistance() * 1.6;
controls.minPolarAngle = Math.PI * 0.10;
controls.maxPolarAngle = Math.PI * 0.86;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = true;
controls.autoRotate = !REDUCED; controls.autoRotateSpeed = 0.3;
controls.update();

let idleTimer = null;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
  if (!REDUCED) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 6000);
});

/* ================================================================== post-traitement : occlusion, bloom maîtrisé */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// (pas d'occlusion ambiante en jeu : budget mobile ; les ombres portées font le travail)
const fxPass = new RenderPass(fxScene, camera); fxPass.clear = false; fxPass.clearDepth = true;
composer.addPass(fxPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), 0.7, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const ro = new ResizeObserver(() => {
  camera.aspect = W() / H(); controls.maxDistance = fitDistance() * 1.6;
  renderer.setSize(W(), H()); composer.setSize(W(), H());
  bloom.resolution.set(W() / 2, H() / 2);
});
ro.observe(container);

/* ================================================================== boucle : le cuirassé navigue */
const clock = new THREE.Clock();
const SPEED = 9;
let frames = 0, perfT = 0, perfChecked = false;
function frame() {
  if (container.offsetParent === null) { clock.getDelta(); if (alive) raf = requestAnimationFrame(frame); return; }   // fiche masquée : pause
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const amp = REDUCED ? 0.25 : 1;
  ship.position.y = Math.sin(t * 0.45) * 0.05 * amp;
  ship.rotation.z = Math.sin(t * 0.32) * 0.015 * amp;
  ship.rotation.x = Math.sin(t * 0.27 + 1.0) * 0.007 * amp;
  for (const m of plumeMats) m.uniforms.uTime.value = t;
  PLASMA_T.value = t;
  updateSmoke(t);
  fxShip.position.copy(ship.position); fxShip.rotation.copy(ship.rotation);
  shockLight.intensity = 3.2 * (0.9 + 0.1 * Math.sin(t * 7.0));
  if (engineLight.intensity > 0) engineLight.intensity = 5 * (0.93 + 0.07 * Math.sin(t * 29.0));
  for (const m of navMats) {                       // feux de navigation : rouge/vert lents, strobes blancs brefs
    const strobe = m.name === 'M_KV_NAV_BLANC';
    m.emissiveIntensity = strobe ? ((t % 2.2) < 0.08 ? 12 : 0.2) : 2.5 + 2.0 * (0.5 + 0.5 * Math.sin(t * 2.4));
  }
  const p = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) {
    let z = p[i * 3 + 2] - SPEED * dt;
    if (z < -DUST_BOX / 2) z += DUST_BOX;
    p[i * 3 + 2] = z;
  }
  dustGeo.attributes.position.needsUpdate = true;

  // qualité adaptative : si l'appareil peine, on coupe l'occlusion puis on baisse la résolution
  if (!perfChecked && navMats.length && true) {
    frames++; perfT += dt;
    if (perfT > 2.5) {
      const fps = frames / perfT; perfChecked = true;
      if (fps < 40) renderer.shadowMap.enabled = false;
      if (fps < 24) renderer.setPixelRatio(1);
    }
  }
  smoothOrbit();
  controls.update();
  updateHaze();
  composer.render();
  if (alive) raf = requestAnimationFrame(frame);
}
let alive = true, raf = requestAnimationFrame(frame);

  // gestes relayés par la page (fiche héros : la liste défile au-dessus de la 3D, comme pour le soldat lourd)
  const sph = new THREE.Spherical(), off = new THREE.Vector3();
  function orbitBy(dx, dy, dScale) {
    off.copy(camera.position).sub(controls.target); sph.setFromVector3(off);
    const k = 2 * Math.PI * controls.rotateSpeed / H();
    sph.theta -= dx * k;
    sph.phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, sph.phi - dy * k));
    sph.radius = Math.min(controls.maxDistance, Math.max(controls.minDistance, sph.radius * (dScale || 1)));
    off.setFromSpherical(sph); camera.position.copy(controls.target).add(off); controls.update();
  }
  // lissage : le doigt alimente une consigne, la caméra la rattrape en douceur (≈ 0,15 s) puis glisse sur son élan
  const pend = { x: 0, y: 0, z: 0 }; let lastT = performance.now();
  function smoothOrbit() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (Math.abs(pend.x) + Math.abs(pend.y) < 0.01 && Math.abs(pend.z) < 1e-4) { pend.x = pend.y = pend.z = 0; return; }
    const f = 1 - Math.exp(-dt * 7.0);
    const ax = pend.x * f, ay = pend.y * f, az = pend.z * f;
    pend.x -= ax; pend.y -= ay; pend.z -= az;
    orbitBy(ax, ay, Math.exp(az));
  }
  return {
    begin() { controls.autoRotate = false; clearTimeout(idleTimer); },
    orbit(dx, dy) { pend.x += dx; pend.y += dy; },
    dolly(scale) { pend.z += Math.log(scale); },
    end() { clearTimeout(idleTimer); if (!REDUCED) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 6000); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      fxScene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}
function whenReady(cb) {
  if (window.SB3D) return cb();
  const t = setInterval(() => { if (window.SB3D) { clearInterval(t); cb(); } }, 100);
}
window.Ship3D = { profiles: { kv01: PROFIL_KV01, sr01: PROFIL_SR01, tk07: PROFIL_TK07 }, mount: (c, o) => { let h = null, dead = false; whenReady(() => { if (!dead) h = mount(c, o); });
  return {
    begin() { if (h) h.begin(); }, orbit(dx, dy) { if (h) h.orbit(dx, dy); }, dolly(k) { if (h) h.dolly(k); }, end() { if (h) h.end(); },
    dispose() { dead = true; if (h) h.dispose(); },
  }; } };
window.dispatchEvent(new Event('ship3d-ready'));
