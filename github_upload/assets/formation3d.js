/* Starbyte — Formation3D : une flotte en orbite, vue arrière 3/4 de dessus, tous ses vaisseaux en formation.
   Sert de vue héros à la fiche d'une flotte déployée en orbite (la fiche défile par-dessus).
   Usage : const h = window.Formation3D.mount(container, { fleet, shiftY, onReady });
           h.begin() / h.orbit(dx, dy) / h.dolly(k) / h.end()   — gestes relayés par la page (comme Ship3D)
           h.pick(clientX, clientY) → { type, tier, index } | null ; h.select(index | null) ; h.dispose()
   Moteur 3D partagé : window.SB3D (planet3d.js). Modèles : versions légères (LOD carte) des vaisseaux.
   opts.mode = 'mission' : la flotte file en espace profond — bulle de choc plasma, filaments arrachés à la coque
   et panaches moteurs pour chaque vaisseau (même langage que les fiches d'unité Ship3D), étoiles qui défilent.
*/
(function () {
  const MODELS = {
    cuirasse: { url: 'assets/3d/sb_kv01_lod.glb?v=20261012-0100', scale: 0.22, glow: [[-44, 76, -660], [44, 76, -660]], glowSize: 70, color: 0x9ccaff, ring: 170 },
    fregate:  { url: 'assets/3d/sb_sr01_lod.glb?v=20261012-0100', scale: 1.3,  glow: [[-2.3, 4.4, -35], [2.3, 4.4, -35]], glowSize: 7, color: 0x9ccaff, ring: 58 },
    tanker:   { url: 'assets/3d/sb_tk07_lod.glb?v=20261012-0100', scale: 2.0,  glow: [[-2.5, 2.55, -15], [2.5, 2.55, -15]], glowSize: 5, color: 0xffb070, ring: 40 },
  };
  // échelles d'affichage : le cuirassé fait 1 200 m, la frégate 68 m, le tanker 28,6 m — on comprime l'écart pour que tout se lise
  // ARMADA (20/10) : jusqu'à 12 cuirassés, 60 frégates et 24 tankers modélisés ; au-delà, l'armada lointaine (une lueur par vaisseau)
  const MAX = { cuirasse: 12, fregate: 60, tanker: 24 };
  // gabarits mesurés sur les modèles LOD, à l'échelle d'affichage (largeur, longueur)
  const DIM = { cuirasse: [57, 290], fregate: [25, 93], tanker: [22, 57] };
  const GLOSS = { M_TK_ARMOR_JAUNE: [0.40, 0.08], M_KV_ARMOR_WHITE: [0.38, 0.0], M_KV_ARMOR_RED: [0.28, 0.3], M_KV_GUNMETAL: [0.26, 0.85],
                  M_KV_STRUCT_BLACK: [0.30, 0.55], M_TK_GRAPHITE: [0.30, 0.6], M_SR_VERRIERE: [0.06, 0.4] };
  const cache = {};

  // liste des vaisseaux affichés, par type puis par tier (les plus hauts tiers d'abord), + le reste de la flotte (armada lointaine)
  // hp : intégrité de coque (0–100) lue dans fleet.integrity[type]['tN'][i] (triée du plus sain au plus abîmé)
  function roster(fleet) {
    const out = [], comp = fleet && fleet.composition, integ = (fleet && fleet.integrity) || {};
    const overflow = { cuirasse: 0, fregate: 0, tanker: 0 };
    let total = 0;
    for (const type of ['cuirasse', 'fregate', 'tanker']) {
      const c = (comp && comp[type]) || {};
      let k = 0;
      for (const tier of [3, 2, 1]) {
        const n = Math.max(0, c['t' + tier] || 0); total += n;
        for (let i = 0; i < n; i++) {
          if (k >= MAX[type]) { overflow[type]++; continue; }
          const arr = integ[type] && integ[type]['t' + tier];
          const hp = arr && typeof arr[i] === 'number' ? Math.max(0, Math.min(100, arr[i])) : 100;
          out.push({ type, tier, hp }); k++;
        }
      }
    }
    out.overflow = overflow; out.total = total;
    return out;
  }
  // formation de bataille (cap vers −Z), espacements tirés des gabarits — aucun chevauchement quel que soit l'effectif :
  // cuirassés en ligne de bataille au centre (rangs de 6, le 2e décalé en quinconce),
  // frégates en escadrilles de 6 en chevron (avant-garde puis flancs), tankers en convoi derrière
  function place(list) {
    const by = { cuirasse: [], fregate: [], tanker: [] };
    list.forEach(s => by[s.type].push(s));
    const [cw, cl] = DIM.cuirasse, [fw, fl] = DIM.fregate, [tw, tl] = DIM.tanker;
    const nc = by.cuirasse.length, perRank = 6, sx = cw * 2.7;
    const ranks = Math.ceil(nc / perRank);
    by.cuirasse.forEach((s, i) => {
      const r = Math.floor(i / perRank), inRank = Math.min(perRank, nc - r * perRank), j = i - r * perRank;
      s.x = (j - (inRank - 1) / 2) * sx + (r % 2 ? sx / 2 : 0); s.z = r * cl * 1.18; s.sq = r; s.wave = j;
    });
    const lineHalf = nc ? (Math.min(perRank, nc) - 1) / 2 * sx + sx / 2 + cw / 2 : 0;
    // escadrille en chevron : chef, deux paires en ailes, un serre-file
    const CHEV = [[0, 0], [-1, 1], [1, 1], [-2, 2], [2, 2], [0, 2]], dx = fw * 1.9, dz = fl * 0.82;
    const sqW = 4 * dx + fw, sqGap = 70;
    const X = (gx) => gx === 0 ? 0 : Math.sign(gx) * (lineHalf + sqW / 2 + sqGap + (Math.abs(gx) - 1) * (sqW + sqGap));
    const front = nc ? -cl / 2 : 0;
    const Z = (row) => row === 0 ? front + 40 : front - 60 - row * (2 * dz + fl + 120);
    let SLOTS = [[0, 1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, 2], [-2, 1], [2, 1], [-1, 2], [1, 2]];
    if (!nc) SLOTS = [[0, 0]].concat(SLOTS.filter(([gx, r]) => !(gx === 0 && r === 1)));   // sans cuirassé : l'avant-garde prend le centre
    by.fregate.forEach((s, i) => {
      const q = Math.floor(i / 6), m = i % 6, [gx, row] = SLOTS[Math.min(q, SLOTS.length - 1)];
      const [cx, cz] = CHEV[m];
      s.x = X(gx) + cx * dx; s.z = Z(row) + cz * dz; s.sq = q + 1; s.wave = gx * 3 + cx;
    });
    // convoi de tankers : colonnes de 2 (4 au-delà de 12), derrière la ligne de bataille
    const nt = by.tanker.length, cols = nt > 12 ? 4 : 2, rear = nc ? (ranks - 1) * cl * 1.18 + cl / 2 + tl + 60 : (by.fregate.length ? 2 * dz + fl + 120 : 0);
    by.tanker.forEach((s, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      s.x = (c - (cols - 1) / 2) * tw * 3.2; s.z = rear + r * tl * 1.7; s.sq = 20 + r; s.wave = c;
    });
    return list;
  }

  /* ── plasma de croisière (mode mission) ─────────────────────────────────────────────── */
  const NOISE = `float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.1+3.7; a*=.5; } return s; }`;
  // bulle de choc : paraboloïde partant devant l'étrave, épousant la coque, ouvert en sillage (repère local du vaisseau, proue vers +Z)
  function bubbleGeo(THREE, bow, cy, L, R0, scale) {
    const segU = 56, segA = 36, len = 2.1 * L, pos = [], uv = [], idx = [];
    for (let i = 0; i <= segU; i++) {
      const u = i / segU, d = Math.pow(u, 1.6) * len, r = R0 * Math.pow(Math.max(d / L, 1e-4), 0.47) * scale;
      for (let j = 0; j <= segA; j++) { const a = j / segA * Math.PI * 2; pos.push(Math.cos(a) * r, cy + Math.sin(a) * r * 0.78, bow - d); uv.push(j / segA, u); }
    }
    for (let i = 0; i < segU; i++) for (let j = 0; j < segA; j++) { const a = i * (segA + 1) + j, b = a + segA + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const shockMat = (THREE, T, gain, fres, speed) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: T, uGain: { value: gain }, uFres: { value: fres }, uSpeed: { value: speed } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uGain, uFres, uSpeed; varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        float u = vUv.y;
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uFres);
        vec2 q = vec2(vUv.x * 46.0, u * 9.0 - uTime * uSpeed);
        float streaks = smoothstep(.38, .9, fbm(vec2(q.x, q.y * .35)));
        float churn = fbm(vec2(vUv.x * 12.0 + uTime * .2, u * 20.0 - uTime * uSpeed * 2.0));
        float nose = exp(-u * 22.0);
        float body = smoothstep(1.0, .55, u) * (1.0 - nose);
        float tail = smoothstep(.45, 1.0, u) * smoothstep(1.0, .7, u);
        float inten = nose * 4.5 + body * (.35 + .9 * streaks) + tail * churn * .9;
        vec3 col = mix(mix(vec3(.80,.92,1.0), vec3(.22,.45,1.0), smoothstep(0.0, .12, u)), vec3(.58,.22,1.0), smoothstep(.25, .9, u) * (.5 + .5 * churn));
        float a = uGain * inten * (fres * .85 + nose * .5) * (.85 + .15 * sin(uTime * 3.0 + u * 30.0));
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  // filaments de plasma calculés sur le GPU : nés surtout à l'étrave, collés à la coque puis arrachés en queue de comète
  function filaments(THREE, T, n, bow, cy, hw, hh, L) {
    const corner = new Float32Array(n * 8), par = new Float32Array(n * 16), pos = new Float32Array(n * 12), idx = [];
    for (let i = 0; i < n; i++) {
      corner.set([0, -1, 0, 1, 1, -1, 1, 1], i * 8);
      const a = Math.random() * Math.PI * 2, seed = Math.random(), s0 = Math.random() < .8 ? Math.random() * .12 : Math.random() * .75, rate = 1 / (2.2 + Math.random() * 1.8);
      for (let k = 0; k < 4; k++) par.set([a, seed, s0, rate], (i * 4 + k) * 4);
      const v = i * 4; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2)); g.setAttribute('aP', new THREE.BufferAttribute(par, 4));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
      uniforms: { uTime: T, uBow: { value: bow }, uCy: { value: cy }, uHw: { value: hw }, uHh: { value: hh }, uL: { value: L }, uA: { value: .02 * Math.sqrt(1400 / n) } },
      vertexShader: `attribute vec2 aCorner; attribute vec4 aP; uniform float uTime, uBow, uCy, uHw, uHh, uL;
        varying vec2 vC; varying float vAge; varying float vSeed;
        void main(){
          float age = fract(uTime * aP.w + aP.y); vC = aCorner; vSeed = aP.y; vAge = age;
          float sn = aP.z + (.65 + 2.25 * age) * age;                       // station le long du vaisseau, en longueurs de coque
          float prof = max(.15, smoothstep(0.0, .3, sn));                   // étrave effilée
          float grow = 1.04 + age * age * .35 + max(sn - 1.0, 0.0) * .45;    // colle à la coque puis s'arrache
          vec2 e = vec2(cos(aP.x), sin(aP.x)); e = sign(e) * sqrt(abs(e));
          vec3 head = vec3(e.x * (uHw * prof * grow + uL * .004), uCy + e.y * (uHh * prof * grow + uL * .004), uBow - sn * uL);
          float k = uL / 12.5;
          float len = (1.6 + 6.0 * age + 1.8 * fract(aP.y * 7.3)) * k, wid = (.06 + .16 * age + .04 * fract(aP.y * 3.1)) * k;
          vec4 h = modelViewMatrix * vec4(head, 1.0);
          vec4 tl = modelViewMatrix * vec4(head - vec3(0.0, 0.0, len), 1.0);
          vec3 side = normalize(cross(tl.xyz - h.xyz, -h.xyz));
          vec3 p = mix(h.xyz, tl.xyz, aCorner.x) + side * wid * mix(1.0, 1.6, aCorner.x) * aCorner.y;
          gl_Position = projectionMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying vec2 vC; varying float vAge; varying float vSeed; uniform float uTime, uA;
        float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        float v1(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h1(i), h1(i + 1.0), f); }
        void main(){
          float across = pow(max(1.0 - vC.y * vC.y, 0.0), 2.2);
          float along = smoothstep(0.0, .25, vC.x) * smoothstep(1.0, .35, vC.x);
          float fib = .85 + .15 * v1(vC.x * 3.0 + vSeed * 40.0 - uTime * 1.5);
          float life = smoothstep(0.0, .06, vAge) * smoothstep(1.0, .3, vAge);
          vec3 col = mix(vec3(.62,.78,1.0), vec3(.46,.22,1.0), clamp(vC.x * .7 + vAge * .6, 0.0, 1.0));
          gl_FragColor = vec4(col * 1.15, across * along * fib * life * uA);
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3; return mesh;
  }
  // panaches de propulsion (repère du modèle : tuyères vers −Z)
  const plumeMat = (THREE, T, color, alpha, flick, layer) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: T, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFlick: { value: flick }, uLayer: { value: layer } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uAlpha, uFlick, uLayer; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        float t = vUv.y;
        float along = pow(t, 1.25 + uLayer * .9) * smoothstep(0.0, .12, t);
        float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.2 + uLayer);
        vec2 q = vec2(vUv.x * 6.0, vUv.y * 9.0 - uTime * 7.0);
        float turb = .72 + .28 * vn(q) * uFlick + .12 * vn(q * 2.7 + 5.0);
        float diamonds = .78 + .22 * pow(.5 + .5 * sin(t * 46.0 - uTime * 3.0), 3.0) * (1.0 - uLayer * .6) * smoothstep(.35, .9, t);
        float a = uAlpha * along * core * turb * diamonds;
        gl_FragColor = vec4(mix(uColor * vec3(.75, .8, 1.15), uColor, t) * a, a);
      }`,
  });
  const PLUMES = { blue: [0x2a5cff, 0x3f86ff, 0x86c0ff, 0xe6f3ff], amber: [0xff5a1a, 0xff8a2a, 0xffc070, 0xfff2d8] };
  const FIL_N = { cuirasse: 420, fregate: 160, tanker: 110 };

  function mount(container, opts = {}) {
    const { THREE, GLTFLoader, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.SB3D;
    const list = place(roster(opts.fleet));
    const mission = opts.mode === 'mission';
    const PT = { value: 0 };   // horloge des shaders de plasma
    const W = () => Math.max(1, container.clientWidth), H = () => Math.max(1, container.clientHeight);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // opts.lite : fond décoratif (écran d'accueil) — résolution réduite, effets allégés
    const LITE = !!opts.lite;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LITE ? 1.25 : 2)); renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'u3d-canvas';
    container.insertBefore(renderer.domElement, container.firstChild);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(40, W() / H(), 5, 70000);
    const shiftY = opts.shiftY || 0;
    const applyView = () => { camera.aspect = W() / H(); if (shiftY) camera.setViewOffset(W(), H(), 0, H() * shiftY, W(), H()); camera.updateProjectionMatrix(); };
    applyView();

    // étoiles (mission ; en orbite : champ d'étoiles colorées de l'environnement du chantier)
    if (mission) {
      const N = 1600, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 18000, q = Math.sqrt(1 - u * u);
        pos.set([r * q * Math.cos(a), r * u, r * q * Math.sin(a)], i * 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, color: 0xaebfd6 })));
    }
    // lumières : soleil rasant à l'avant, contre-jour froid
    const SUN = mission ? new THREE.Vector3(-0.55, 0.28, -0.79).normalize() : new THREE.Vector3(-0.34, -0.17, -0.93).normalize();
    const key = new THREE.DirectionalLight(0xfff2e0, 2.8); key.position.copy(SUN).multiplyScalar(3000); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db8e8, 1.0); rim.position.set(900, 400, 1500); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x2c3a58, 0x0a0c12, 0.7));

    // planète sous la flotte (textures de Kerath), elle défile lentement : la flotte avance
    let envPlanet = null;
    const planet = new THREE.Group();   // ancienne planète texturée (remplacée par l'environnement du chantier orbital)
    const PR = 9000; planet.position.set(0, -PR - 1300, -2000);
    const tl = new THREE.TextureLoader();
    const pMat = new THREE.MeshStandardMaterial({ color: 0x8a96a0, roughness: 0.95, metalness: 0 });
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(PR, 128, 96), pMat));
    const cMat = new THREE.MeshStandardMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0.0, depthWrite: false });
    const cMesh = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.004, 128, 96), cMat); planet.add(cMesh);
    if (false) tl.load('assets/3d/kerath_albedo.jpg', t => { if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; pMat.map = t; pMat.color.set(0x4a5560); pMat.needsUpdate = true; });
    if (false) tl.load('assets/3d/kerath_clouds.jpg', t => { cMat.alphaMap = t; cMat.opacity = 0.35; cMat.needsUpdate = true; });
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(PR * 1.03, 96, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.4); gl_FragColor = vec4(vec3(.3,.6,1.0) * f, f); }'
    })));

    const radial = (stops) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => r.addColorStop(o, col));
      g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    };
    const glowTex = radial([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
    const smokeTex = radial([[0, 'rgba(255,255,255,.55)'], [.45, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)']]);
    const smoke = [];   // fumées des coques endommagées (repère monde, suivent leur vaisseau)
    // anneau de sélection (ambre, à plat sous le vaisseau)
    const ringTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.strokeStyle = 'rgba(255,190,90,.95)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,190,90,.35)'; g.lineWidth = 12; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
      return new THREE.CanvasTexture(c);
    })();
    const selRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    selRing.rotation.x = -Math.PI / 2; selRing.visible = false; scene.add(selRing);

    const fleetG = new THREE.Group(); scene.add(fleetG);
    const ships = [];
    let ext = 300;
    for (const s of list) ext = Math.max(ext, Math.abs(s.x) + 200, Math.abs(s.z) + 260);
    // ORBITE (14/10) : environnement de la fiche du chantier orbital — ciel de nébuleuse, étoiles colorées,
    // planète procédurale à contre-jour avec atmosphère, soleil droit devant (disque, halo, voile, reflet anamorphique),
    // et de temps en temps une étoile filante
    const shooting = [];
    if (!mission) {
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 32), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vDir;
          float h(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
          float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
            return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
          float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
          void main(){
            vec3 d = normalize(vDir);
            vec3 axis = normalize(vec3(0.55, 0.75, 0.35));
            float band = exp(-pow(dot(d, axis) * 1.8, 2.0));
            float neb = band * smoothstep(.32, .82, fbm(d * 3.2));
            float dust = fbm(d * 6.5 + 4.0);
            vec3 col = vec3(.004,.007,.016);
            float hue = fbm(d * 2.1 + 7.0);
            col += mix(vec3(.08,.16,.62), vec3(.38,.10,.62), smoothstep(.35,.7,hue)) * neb * .55;
            col += mix(vec3(.25,.45,1.0), vec3(.70,.30,1.0), smoothstep(.4,.7,hue)) * pow(neb, 2.4) * .55;
            col *= 1.0 - .7 * smoothstep(.45, .75, dust) * band;
            col += vec3(.40,.20,.08) * band * pow(smoothstep(.62,.9, fbm(d*9.0+11.0)), 2.0) * .18;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })));
      const field = (count, radius, size) => {
        const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), col = new Float32Array(count * 3), c = new THREE.Color();
        for (let i = 0; i < count; i++) {
          const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
          pos.set([radius * q * Math.cos(t), radius * u, radius * q * Math.sin(t)], i * 3);
          const k = Math.random();
          c.setRGB(...(k > .92 ? [1, .8, .6] : k > .7 ? [.78, .86, 1] : [1, 1, 1])).multiplyScalar(.25 + Math.random() * .6);
          col.set([c.r, c.g, c.b], i * 3);
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
      };
      scene.add(field(3000, 28000, 1.2), field(220, 28000, 2.2));
      // planète : sous la flotte et devant, limbe à contre-jour (même shader que la fiche du chantier)
      const PR = Math.max(6000, ext * 14), PPOS = new THREE.Vector3(ext * 1.6, -PR - ext * 1.1, -ext * 3.5);
      const SD = SUN.clone();
      const pl = new THREE.Mesh(new THREE.SphereGeometry(PR, 128, 96), new THREE.ShaderMaterial({
        uniforms: { uSun: { value: SD } },
        vertexShader: `varying vec3 vP; varying vec3 vW;
          void main(){ vP = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 uSun; varying vec3 vP; varying vec3 vW;
          float h(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
          float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
            return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
          float fbm(vec3 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+1.7; a*=.5; } return s; }
          void main(){
            vec3 d = normalize(vP), N = d;
            float land = smoothstep(.52, .58, fbm(d * 3.2));
            vec3 col = mix(mix(vec3(.01,.05,.13), vec3(.02,.11,.25), fbm(d * 9.0)), mix(vec3(.06,.12,.05), vec3(.16,.14,.08), fbm(d * 14.0)), land);
            col = mix(col, vec3(.85,.88,.92), smoothstep(.5, .78, fbm(d * 5.5)) * .85);
            float day = clamp(dot(N, normalize(uSun)) * 1.2 + .15, 0., 1.);
            col *= .04 + 1.05 * day;
            float rim = pow(1.0 - max(dot(N, normalize(cameraPosition - vW)), 0.0), 3.0);
            col += vec3(.25,.5,1.0) * rim * (.25 + 1.2 * day);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }));
      pl.position.copy(PPOS); scene.add(pl); envPlanet = pl;
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.025, 96, 64), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
        vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vW;
          void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.2); gl_FragColor = vec4(vec3(.3,.6,1.0) * f * .9, f * .9); }`,
      }));
      atmo.position.copy(PPOS); scene.add(atmo);
      // soleil droit devant : disque, halo, voile large, reflet anamorphique
      const big = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(([o, col]) => r.addColorStop(o, col)); g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); };
      const SD_ = 20000, K = SD_ / 240;
      for (const [size, stops, opacity, sy] of [
        [16,  [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,250,235,1)'], [.5, 'rgba(255,235,200,.6)'], [1, 'rgba(255,220,180,0)']], 1.0, 1],
        [90,  [[0, 'rgba(255,240,215,.9)'], [.12, 'rgba(255,215,170,.45)'], [.4, 'rgba(200,170,255,.12)'], [1, 'rgba(120,120,255,0)']], .9, 1],
        [260, [[0, 'rgba(255,230,200,.35)'], [.3, 'rgba(160,150,255,.08)'], [1, 'rgba(80,90,255,0)']], .8, 1],
        [190, [[0, 'rgba(210,225,255,.8)'], [.25, 'rgba(150,170,255,.25)'], [1, 'rgba(100,120,255,0)']], .55, 0.03],
      ]) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: big(stops), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
        sp.scale.set(size * K, size * K * sy, 1); sp.position.copy(SUN).multiplyScalar(SD_); scene.add(sp);
      }
      // étoiles filantes : une traînée lumineuse de temps en temps, loin dans le ciel
      const shotTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 16; const g = c.getContext('2d');
        const lg = g.createLinearGradient(0, 0, 256, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.85, 'rgba(200,220,255,.55)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
        g.fillStyle = lg; g.fillRect(0, 6, 256, 4); return new THREE.CanvasTexture(c); })();
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shotTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.frustumCulled = false; scene.add(m); shooting.push({ m, t0: -1, next: 2 + i * 5 + Math.random() * 4 });
      }
    }
    const loader = new GLTFLoader();
    const get = (url) => cache[url] || (cache[url] = new Promise((ok, ko) => loader.load(url, ok, undefined, ko)));
    let alive = true;
    // ARMADA (20/10) : chaque pièce de chaque modèle est dessinée en une passe pour toute la flotte (InstancedMesh) ;
    // un porteur (Object3D) par vaisseau garde sa position animée et accroche plasma, panaches et fumées
    const inst = [];                                                   // { im, local, idx }
    const typeIdx = { cuirasse: [], fregate: [], tanker: [] };
    list.forEach((s, i) => typeIdx[s.type].push(i));
    list.forEach((s, i) => {
      const M = MODELS[s.type];
      const holder = new THREE.Group();
      const gs = new THREE.Group(); gs.scale.setScalar(M.scale); holder.add(gs);   // repère du modèle (tuyères, panaches)
      holder.position.set(s.x, 0, s.z); holder.rotation.y = Math.PI;      // cap vers −Z
      holder.userData = { ph: (s.sq || 0) * 0.9 + (s.wave || 0) * 0.45, x: s.x, z: s.z, idx: i, gs, hp: s.hp, k: typeIdx[s.type].indexOf(i) };
      fleetG.add(holder); ships[i] = holder;
    });
    // lueurs moteurs : un seul nuage de points pour toute la flotte (au lieu d'un sprite par tuyère)
    const glowSrc = [];
    list.forEach((s, i) => MODELS[s.type].glow.forEach(g => glowSrc.push({ i, x: g[0] * MODELS[s.type].scale, y: g[1] * MODELS[s.type].scale, z: g[2] * MODELS[s.type].scale, size: MODELS[s.type].glowSize, color: MODELS[s.type].color, hp: s.hp })));
    let glowPts = null;
    if (glowSrc.length) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(glowSrc.length * 3), aS = new Float32Array(glowSrc.length * 3), col = new THREE.Color();
      glowSrc.forEach((q, j) => { col.set(q.color); aS.set([q.size * (0.55 + 0.45 * q.hp / 100), j * 1.37, 0], j * 3); });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 3));
      const aC = new Float32Array(glowSrc.length * 3); glowSrc.forEach((q, j) => { col.set(q.color); aC.set([col.r, col.g, col.b], j * 3); });
      g.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
      glowPts = new THREE.Points(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: PT, uPR: { value: renderer.getPixelRatio() }, uH: { value: H() } },
        vertexShader: `attribute vec3 aS; attribute vec3 aC; uniform float uT, uPR, uH; varying vec3 vC; varying float vA;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
            vC = aC; vA = .78 + .22 * sin(uT * 23.0 + aS.y * 5.0);
            gl_PointSize = min(220.0, aS.x * 2.4 * uH * uPR * projectionMatrix[1][1] * .5 / -mv.z); }`,
        fragmentShader: `varying vec3 vC; varying float vA;
          void main(){ float d = length(gl_PointCoord - .5) * 2.0; float a = (exp(-d * d * 5.0) * .9 + exp(-d * d * 40.0) * .8) * vA; if (a < .01) discard;
            gl_FragColor = vec4(mix(vC, vec3(1.0), exp(-d * d * 40.0) * .6) * a, a); }`,
      }));
      glowPts.frustumCulled = false; glowPts.renderOrder = 5; scene.add(glowPts);
    }
    const MAT4 = new THREE.Matrix4(), V3 = new THREE.Vector3();
    const updateInstances = () => {
      for (const s of ships) s && s.updateMatrix();
      for (const p of inst) {
        for (let k = 0; k < p.idx.length; k++) { MAT4.multiplyMatrices(ships[p.idx[k]].matrix, p.local); p.im.setMatrixAt(k, MAT4); }
        p.im.instanceMatrix.needsUpdate = true;
      }
      if (glowPts) {
        const a = glowPts.geometry.attributes.position;
        glowSrc.forEach((q, j) => { V3.set(q.x, q.y, q.z).applyMatrix4(ships[q.i].matrix); a.setXYZ(j, V3.x, V3.y, V3.z); });
        a.needsUpdate = true;
      }
    };
    const addPlasma = (holder, type, k, bb, hp) => {
      // LOD du plasma : complet sur les cuirassés, une enveloppe + quelques filaments sur les 18 premières frégates
      // et les 12 premiers tankers, panaches à deux couches sur les 24 premiers ; les autres gardent leur lueur moteur
      const M = MODELS[type], gs = holder.userData.gs;
      const capital = type === 'cuirasse', near = capital || (type === 'fregate' ? k < 18 : k < 12);
      const sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const L = sz.z, bow = bb.max.z + L * 0.1, hw = sz.x / 2, hhh = sz.y / 2;
      const R0 = Math.max(0.31 * L, 1.35 * Math.max(hw, hhh / 0.78));
      if (near) {
        const shock = new THREE.Group();
        ((LITE || !capital) ? [[1.0, capital ? .7 : .5, 2.2, 1.6]] : [[1.0, .55, 2.2, 1.6], [1.12, .28, 3.2, 1.1], [0.9, .22, 1.6, 2.4]]).forEach(([sc, gain, fr, sp]) => {
          const m = new THREE.Mesh(bubbleGeo(THREE, bow, c.y, L, R0, sc), shockMat(THREE, PT, gain * (hp > 0 ? 1 : .5), fr, sp));
          m.renderOrder = 2; m.frustumCulled = false; shock.add(m);
        });
        holder.add(shock);
        holder.add(filaments(THREE, PT, Math.round(FIL_N[type] * (LITE ? .4 : capital ? 1 : .35)), bb.max.z, c.y, hw, hhh, L));
      }
      if (!capital && k >= 24) return;
      const pal = M.color === 0xffb070 ? PLUMES.amber : PLUMES.blue, thrust = 0.45 + 0.55 * hp / 100;
      const layers = [[40, .86, .2, 0, .16, 1, 1], [28, .74, .1, 1, .3, 1, .7], [16, .58, .05, 2, .42, .8, .4], [7, .4, .03, 3, .55, .4, 0]];
      for (const [x, y, z] of M.glow) {
        const pg = new THREE.Group(); pg.position.set(x, y, z);
        const R = M.glowSize * 0.32 / M.scale;
        for (const [len, rIn, rOut, ci, alpha, flick, layer] of (capital ? layers : layers.slice(2))) {
          const geo = new THREE.CylinderGeometry(R * rIn, R * rOut, R * len * thrust, capital ? 28 : 14, 1, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -R * len * thrust / 2);
          const pm = new THREE.Mesh(geo, plumeMat(THREE, PT, pal[ci], alpha, flick, layer)); pm.frustumCulled = false; pm.renderOrder = 4; pg.add(pm);
        }
        gs.add(pg);
      }
    };
    const types = [...new Set(list.map(s => s.type))];
    Promise.all(types.map(async type => {
      const M = MODELS[type];
      const gltf = await get(M.url);
      if (!alive) return;
      const root = gltf.scene; root.updateMatrixWorld(true);
      const idx = typeIdx[type], n = idx.length;
      const scM = new THREE.Matrix4().makeScale(M.scale, M.scale, M.scale);
      const box = new THREE.Box3(), col = new THREE.Color();
      const avgHp = idx.reduce((a, gi) => a + list[gi].hp, 0) / n;
      root.traverse(o => {
        if (!o.isMesh) return;
        const local = new THREE.Matrix4().multiplyMatrices(scM, o.matrixWorld);
        const m = o.material.clone(), gl = GLOSS[m.name];
        if (gl) { m.roughness = gl[0]; m.metalness = gl[1]; m.envMapIntensity = 0.9; }
        const glow = m.name === 'M_KV_GLOW_MOTEUR' || (m.emissive && m.emissive.getHex() && m.emissiveIntensity > 0);
        if (m.name === 'M_KV_GLOW_MOTEUR') { m.emissive = new THREE.Color(M.color); m.emissiveIntensity = 4 * (0.35 + 0.65 * avgHp / 100); }
        const im = new THREE.InstancedMesh(o.geometry, m, n);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
        im.userData = { type, idx };
        if (!glow) for (let k = 0; k < n; k++) im.setColorAt(k, col.setScalar(1 - (1 - list[idx[k]].hp / 100) * 0.55));   // coque noircie selon les avaries
        fleetG.add(im); inst.push({ im, local, idx });
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(local));
      });
      idx.forEach((gi, k) => {
        const holder = ships[gi], hp = list[gi].hp;
        if (mission) addPlasma(holder, type, k, box, hp);
        if (hp < 80 && smoke.length < 60) {                              // fumées + feu au-dessous de 35 %
          const sz = box.getSize(new THREE.Vector3()), nS = hp < 35 ? 4 : hp < 60 ? 3 : 2;
          for (let j = 0; j < nS; j++) {
            const off = new THREE.Vector3((Math.random() - 0.5) * sz.x * 0.6, box.max.y - sz.y * 0.15, (Math.random() - 0.5) * sz.z * 0.6);
            const base = Math.max(sz.x, sz.z) * 0.12 + 10;
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x5a5650, transparent: true, depthWrite: false, opacity: 0 }));
            fleetG.add(sp); smoke.push({ sp, ship: holder, off, base, ph: Math.random(), rate: 0.18 + Math.random() * 0.1, fire: null });
            if (hp < 35 && j < 2) {
              const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a14, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
              f.scale.setScalar(base * 0.7); fleetG.add(f); smoke[smoke.length - 1].fire = f;
            }
          }
        }
      });
    })).then(() => { if (!alive) return; updateInstances(); inst.forEach(p => p.im.computeBoundingSphere()); })
      .catch(e => console.warn('[Formation3D]', e)).finally(() => { if (alive && opts.onReady) opts.onReady(); });

    // ARMADA LOINTAINE : le reste de la flotte, une lueur moteur par vaisseau, en escadrilles autour de la formation,
    // qui ondulent doucement dans la profondeur (un seul nuage de points)
    const ov = list.overflow || { cuirasse: 0, fregate: 0, tanker: 0 };
    const nFar = Math.min(2400, ov.cuirasse + ov.fregate + ov.tanker);
    if (nFar) {
      const pos = new Float32Array(nFar * 3), aP = new Float32Array(nFar * 3), aC = new Float32Array(nFar * 3);
      const cBlue = new THREE.Color(0x9ccaff), cAmber = new THREE.Color(0xffb070), cBig = new THREE.Color(0xbcd8ff);
      let j = 0, rnd = 7; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
      const kinds = [['cuirasse', ov.cuirasse], ['fregate', ov.fregate], ['tanker', ov.tanker]];
      for (const [type, cnt] of kinds) {
        let left = Math.min(cnt, nFar - j);
        while (left > 0) {
          // centre d'une escadrille : anneau elliptique autour de la formation (tankers plutôt derrière)
          // l'armada s'étire droit devant la formation jusqu'à l'horizon (tankers : convoi en arrière-garde)
          const deep = R();
          const cx = (R() - .5) * ext * (1.6 + deep * 2.4), cz = type === 'tanker' ? ext * (0.9 + R() * 1.8) : -ext * (1.05 + deep * 5.0), cy = (R() - .4) * ext * (.35 + deep * .5);
          const grp = Math.min(left, type === 'cuirasse' ? 3 : 6), sp = type === 'cuirasse' ? 160 : 55;
          for (let m = 0; m < grp; m++, j++, left--) {
            const [ox, oz] = [[0, 0], [-1, 1], [1, 1], [-2, 2], [2, 2], [0, 2]][m];
            pos.set([cx + ox * sp, cy + (R() - .5) * 20, cz + oz * sp * 1.3], j * 3);
            aP.set([R() * 6.28, type === 'cuirasse' ? 80 : type === 'fregate' ? 38 : 30, 0], j * 3);
            const c = type === 'tanker' ? cAmber : type === 'cuirasse' ? cBig : cBlue; aC.set([c.r, c.g, c.b], j * 3);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.BufferAttribute(aP, 3)); g.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
      const far = new THREE.Points(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: PT, uPR: { value: renderer.getPixelRatio() }, uH: { value: H() } },
        vertexShader: `attribute vec3 aP; attribute vec3 aC; uniform float uT, uPR, uH; varying vec3 vC; varying float vA;
          void main(){ vec3 p = position + vec3(sin(uT * .21 + aP.x) * 6.0, sin(uT * .3 + aP.x + position.x * .002) * 9.0, sin(uT * .17 + aP.x * 1.3) * 8.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            vC = aC; vA = .7 + .3 * sin(uT * 2.3 + aP.x * 7.0);
            gl_PointSize = clamp(aP.y * 2.6 * uH * uPR * projectionMatrix[1][1] * .5 / -mv.z, 3.0 * uPR, 70.0); }`,
        fragmentShader: `varying vec3 vC; varying float vA;
          void main(){ float d = length(gl_PointCoord - .5) * 2.0; float a = (exp(-d * d * 4.0) * .8 + exp(-d * d * 30.0) * 1.0) * vA; if (a < .01) discard;
            gl_FragColor = vec4(mix(vC, vec3(1.0), exp(-d * d * 30.0) * .5) * a * 1.6, a); }`,
      }));
      far.frustumCulled = false; far.renderOrder = 5; scene.add(far);
    }
    // compteur discret dans la légende de la vue (« 214 vaisseaux · En orbite · touche un vaisseau »)
    if (!LITE && list.total) {
      const hint = container.querySelector('.u3d-hint');
      if (hint) { const base = hint.dataset.base || hint.textContent; hint.dataset.base = base; hint.textContent = `${list.total} vaisseau${list.total > 1 ? 'x' : ''} · ${base}`; }
    }

    // mission : hyperespace — tunnel de traînées lumineuses floues (violet, magenta, cyan) qui convergent vers
    // un cœur violet éblouissant droit devant ; tout est calculé sur le GPU (aucune mise à jour CPU)
    const HYPER = { value: 0 };
    if (mission) {
      const D = Math.min(30000, ext * 40);                               // profondeur du tunnel devant la flotte
      const coreTex = radial([[0, 'rgba(255,255,255,1)'], [.12, 'rgba(235,220,255,1)'], [.3, 'rgba(160,110,255,.65)'], [.6, 'rgba(90,40,255,.18)'], [1, 'rgba(60,20,200,0)']]);
      const hazeTex = radial([[0, 'rgba(120,70,255,.55)'], [.35, 'rgba(90,40,230,.22)'], [1, 'rgba(40,10,140,0)']]);
      const flareTex = radial([[0, 'rgba(255,255,255,1)'], [.2, 'rgba(210,190,255,.6)'], [1, 'rgba(140,100,255,0)']]);
      const at = new THREE.Vector3(0, 0, -D);
      [[hazeTex, D * 1.1, 1, 1, .9], [coreTex, D * .16, 1, 1, 1], [flareTex, D * .5, .018, 1, .9], [flareTex, D * .5, .018, 1, .9, Math.PI / 2], [flareTex, D * .3, .012, 1, .6, Math.PI / 4], [flareTex, D * .3, .012, 1, .6, -Math.PI / 4]]
        .forEach(([tx, sz, sy, _u, op, rot]) => {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op, rotation: rot || 0, fog: false }));
          sp.scale.set(sz, sz * sy, 1); sp.position.copy(at); scene.add(sp);
        });
      // un tunnel de traînées : rayon [rMin, rMax], profondeur span, gain d'intensité ;
      // gate = l'effet ne se voit que lorsque la caméra regarde dans l'axe de la course (vue arrière)
      const tunnel = ({ N, rMin, rMax, span, near, speed, len, w, gain, gate }) => {
        const base = new THREE.PlaneGeometry(1, 1); base.translate(.5, 0, 0);   // x ∈ [0,1] le long de la traînée, y ∈ [−.5,.5] en travers
        const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position;
        const aP = new Float32Array(N * 4), aC = new Float32Array(N * 3);
        const PAL = [[.55, .35, 1.0], [.86, .38, 1.0], [.38, .82, 1.0], [.92, .86, 1.0], [.7, .45, 1.0]];
        for (let i = 0; i < N; i++) {
          const r = rMin + Math.pow(Math.random(), .7) * (rMax - rMin);
          aP.set([Math.random() * Math.PI * 2, r, Math.random(), .55 + Math.random() * .9], i * 4);
          aC.set(PAL[Math.floor(Math.random() * PAL.length)], i * 3);
        }
        g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
        g.instanceCount = N;
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          uniforms: { uT: HYPER, uSpan: { value: span }, uNear: { value: near }, uV: { value: speed }, uLen: { value: len }, uW: { value: w },
                      uNearFade: { value: ext }, uGain: { value: gain }, uGate: { value: gate ? 1 : 0 } },
          vertexShader: `attribute vec4 aP; attribute vec3 aC; uniform float uT, uSpan, uNear, uV, uLen, uW, uNearFade, uGate;
            varying vec2 vC; varying vec3 vCol; varying float vF;
            void main(){
              float zz = fract(aP.z + uT * uV * aP.w / uSpan);              // 0 : au loin, 1 : dépasse la caméra
              float z = uNear - uSpan * (1.0 - zz);
              vec3 head = vec3(cos(aP.x) * aP.y, sin(aP.x) * aP.y * .8, z);
              float len = uLen * aP.w * (.5 + 1.3 * zz * zz);               // s'étire en approchant (vitesse apparente)
              vec4 h = viewMatrix * vec4(head, 1.0), tl = viewMatrix * vec4(head - vec3(0.0, 0.0, len), 1.0);
              vec3 side = normalize(cross(tl.xyz - h.xyz, -h.xyz));
              float w = uW * (.6 + .7 * aP.w) * (.5 + zz);
              vec3 p = mix(h.xyz, tl.xyz, position.x) + side * w * position.y * 2.0;
              vC = vec2(position.x, position.y * 2.0); vCol = aC;
              vF = smoothstep(0.0, .3, zz) * (1.0 - smoothstep(.9, 1.0, zz)) * smoothstep(uNearFade * .9, uNearFade * 2.4, -h.z);
              // vue arrière seulement : la caméra doit regarder vers l'avant de la course (−Z)
              vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
              vF *= mix(1.0, smoothstep(.35, .85, -fwd.z), uGate);
              gl_Position = projectionMatrix * vec4(p, 1.0);
            }`,
          fragmentShader: `varying vec2 vC; varying vec3 vCol; varying float vF; uniform float uGain;
            void main(){
              float across = exp(-vC.y * vC.y * 3.2);                      // profil gaussien : flou, sans arête
              float along = pow(1.0 - vC.x, 1.6) * smoothstep(0.0, .06, vC.x + .02);
              float a = across * along * vF * uGain;
              if (a < .002) discard;
              gl_FragColor = vec4(mix(vCol, vec3(1.0), across * along * .2) * .85 * a, a * .7);
            }`,
        });
        const tun = new THREE.Mesh(g, m); tun.frustumCulled = false; tun.renderOrder = 1; scene.add(tun);
      };
      // grand tunnel : plus large que la zone de zoom de la caméra → visible surtout depuis l'arrière
      const RT = ext / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15 * 1.8 * 1.15;
      tunnel({ N: LITE ? 700 : 1500, rMin: RT, rMax: RT * 2.6, span: RT * 9, near: RT * 1.2, speed: RT * 2.2, len: RT * .75, w: RT * .0075, gain: 1, gate: true });
      // effet rapproché d'origine, en complément discret (7,5 % de son intensité)
      if (!LITE) tunnel({ N: 900, rMin: ext * .45, rMax: ext * 4, span: ext * 16, near: ext * 3.5, speed: ext * 7, len: ext * 2.2, w: ext * .02, gain: .075, gate: false });
    }

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), 0.35, 0.4, 1.0); composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // caméra : arrière 3/4 de dessus ; orbite (azimut + inclinaison) et zoom lissés, rotation lente au repos
    // opts.az / opts.el : cadrage initial (0 = vue arrière) ; opts.spin : rotation lente au repos (rad/s)
    let az = opts.az ?? (mission ? 2.35 : 0.35), azT = az, el = opts.el ?? (mission ? 0.42 : 0.3), elT = el, zoom = opts.zoom ?? 1, zoomT = zoom, idle = true, idleTimer = null;
    const SPIN = opts.spin ?? 0.025;
    const fit = () => ext / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (W() / H() < 0.8 ? 1.15 : 0.8);
    const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); composer.setSize(W(), H()); applyView(); });
    ro.observe(container);

    let sel = null;
    const t0 = performance.now(); let last = t0, raf = 0;
    // RÉVÉLATION (20/10) : la caméra part au ras de la coque du vaisseau amiral et recule pour dévoiler l'armada
    // (3,2 s la première fois pour cette flotte, 1 s ensuite ; pas sur l'écran d'accueil)
    const seen = (window.__sbF3DSeen = window.__sbF3DSeen || {}), fkey = (opts.fleet && opts.fleet.id) || 'x';
    const REVEAL = LITE || !ships.length ? 0 : (seen[fkey + (mission ? 'm' : 'o')] ? 1.0 : 3.2);
    seen[fkey + (mission ? 'm' : 'o')] = true;
    const flagI = list.findIndex(s => s.type === 'cuirasse') >= 0 ? list.findIndex(s => s.type === 'cuirasse') : 0;
    const flagL = list.length ? DIM[list[flagI].type][1] : 100;
    const frame = (now) => {
      if (!alive) return;
      if (container.offsetParent === null) { last = now; raf = requestAnimationFrame(frame); return; }   // fiche masquée : pause
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      const intro = REVEAL ? 1 - Math.pow(1 - Math.min(1, t / REVEAL), 3) : 1;
      if (idle) azT += dt * SPIN;
      const k = 1 - Math.exp(-dt * 7);
      az += (azT - az) * k; el += (elT - el) * k; zoom += (zoomT - zoom) * k;
      const d = fit() * zoom;
      const tgt = new THREE.Vector3(0, 0, -ext * 0.12);
      camera.position.set(tgt.x + Math.sin(az) * Math.cos(el) * d, tgt.y + Math.sin(el) * d, tgt.z + Math.cos(az) * Math.cos(el) * d);
      if (intro < 1 && ships[flagI]) {
        const f = ships[flagI].position, e = intro * intro * (3 - 2 * intro);
        const ps = new THREE.Vector3(f.x + flagL * .32, f.y + flagL * .16, f.z + flagL * .78);   // derrière l'épaule du vaisseau amiral
        const ts = new THREE.Vector3(f.x, f.y + flagL * .05, f.z - flagL * .45);
        camera.position.lerpVectors(ps, camera.position, e);
        tgt.lerpVectors(ts, tgt, e);
      }
      camera.lookAt(tgt);
      PT.value = t;
      HYPER.value = t;
      if (envPlanet) envPlanet.rotation.x -= dt * 0.004;                 // le sol défile sous la flotte
      for (const sh of shooting) {
        if (sh.t0 < 0 && t > sh.next) {                                 // nouvelle étoile filante, dans la moitié haute du ciel, côté caméra
          const R = 16000, a = Math.random() * Math.PI * 2, el2 = .25 + Math.random() * .5;
          const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
          const base = fwd.clone().multiplyScalar(R).add(new THREE.Vector3((Math.random() - .5) * R * .9, R * (.25 + Math.random() * .35), 0));
          sh.p0 = base; sh.dir = new THREE.Vector3(Math.cos(a), -Math.abs(Math.sin(a)) * .6 - .2, (Math.random() - .5) * .3).normalize();
          sh.len = 2200 + Math.random() * 2600; sh.dur = .7 + Math.random() * .5; sh.t0 = t;
        }
        if (sh.t0 >= 0) {
          const u = (t - sh.t0) / sh.dur;
          if (u >= 1) { sh.t0 = -1; sh.next = t + 4 + Math.random() * 7; sh.m.material.opacity = 0; continue; }
          const head = sh.p0.clone().addScaledVector(sh.dir, sh.len * 2.2 * u);
          sh.m.position.copy(head).addScaledVector(sh.dir, -sh.len / 2);
          sh.m.scale.set(sh.len, sh.len * .012, 1);
          sh.m.quaternion.copy(camera.quaternion);                      // face caméra, orientée dans le sens de la course à l'écran
          const p0s = head.clone().project(camera), p1s = head.clone().addScaledVector(sh.dir, -sh.len).project(camera);
          sh.m.rotateZ(Math.atan2((p0s.y - p1s.y) / camera.aspect, p0s.x - p1s.x) );
          sh.m.material.opacity = Math.sin(u * Math.PI) * .9;
        }
      }

      for (const s of ships) {                                          // vague lente qui parcourt les rangs, escadrilles qui s'inclinent à tour de rôle
        if (!s) continue;
        const p = s.userData.ph, w = t * 0.55 - s.userData.x * 0.0022 - s.userData.z * 0.0011;
        s.position.x = s.userData.x + Math.sin(t * 0.21 + p) * 4;
        s.position.z = s.userData.z + Math.sin(t * 0.17 + p * 1.3) * 6;
        s.position.y = Math.sin(w + p * .3) * 5;
        s.rotation.z = Math.sin(w * 0.8 + p) * 0.045;
      }
      updateInstances();
      for (const p of smoke) {                                           // fumée qui monte et part vers l'arrière
        const s = p.ship, u = (t * p.rate + p.ph) % 1;
        p.sp.position.set(s.position.x + p.off.x, s.position.y + p.off.y + u * p.base * 2.2, s.position.z + p.off.z + u * p.base * 3.5);
        p.sp.scale.setScalar(p.base * (0.6 + u * 1.8));
        p.sp.material.opacity = Math.sin(u * Math.PI) * 0.55;
        if (p.fire) {
          p.fire.position.set(s.position.x + p.off.x, s.position.y + p.off.y, s.position.z + p.off.z);
          p.fire.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + p.ph * 20)) * (0.6 + 0.4 * Math.sin(t * 2.3 + p.ph * 7));
        }
      }
      if (sel !== null && ships[sel]) {
        const s = ships[sel], r = MODELS[list[sel].type].ring * 2;
        selRing.visible = true; selRing.position.set(s.position.x, s.position.y - 6, s.position.z); selRing.scale.setScalar(r * (1 + 0.04 * Math.sin(t * 4)));
      } else selRing.visible = false;
      composer.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const raycaster = new THREE.Raycaster();
    return {
      list,
      begin() { idle = false; clearTimeout(idleTimer); },
      orbit(dx, dy) { azT -= dx * 0.006; elT = Math.min(1.35, Math.max(0.18, elT + dy * 0.005)); },
      dolly(k) { zoomT = Math.min(1.8, Math.max(0.4, zoomT * k)); },
      end() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { idle = true; }, 6000); },
      pick(cx, cy) {
        const r = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
        const hit = raycaster.intersectObjects(inst.map(p => p.im), false).find(h => h.instanceId !== undefined);
        if (!hit) return null;
        const i = hit.object.userData.idx[hit.instanceId];
        return { index: i, type: list[i].type, tier: list[i].tier, hp: list[i].hp };
      },
      select(i) { sel = (i === null || i === undefined) ? null : i; },
      dispose() {
        alive = false; cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(idleTimer);
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
        renderer.domElement.remove();
      },
    };
  }

  window.Formation3D = {
    mount(container, opts) {
      let h = null, dead = false;
      const go = () => { if (!dead) h = mount(container, opts); };
      if (window.SB3D) go(); else { const t = setInterval(() => { if (window.SB3D) { clearInterval(t); go(); } }, 100); }
      return {
        get list() { return h ? h.list : []; },
        begin() { if (h) h.begin(); }, orbit(x, y) { if (h) h.orbit(x, y); }, dolly(k) { if (h) h.dolly(k); }, end() { if (h) h.end(); },
        pick(x, y) { return h ? h.pick(x, y) : null; }, select(i) { if (h) h.select(i); },
        dispose() { dead = true; if (h) h.dispose(); },
      };
    },
  };
})();
