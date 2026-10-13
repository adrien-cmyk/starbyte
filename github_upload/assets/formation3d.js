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
  const MAX = { cuirasse: 3, fregate: 12, tanker: 6 };
  const GLOSS = { M_TK_ARMOR_JAUNE: [0.40, 0.08], M_KV_ARMOR_WHITE: [0.38, 0.0], M_KV_ARMOR_RED: [0.28, 0.3], M_KV_GUNMETAL: [0.26, 0.85],
                  M_KV_STRUCT_BLACK: [0.30, 0.55], M_TK_GRAPHITE: [0.30, 0.6], M_SR_VERRIERE: [0.06, 0.4] };
  const cache = {};

  // liste des vaisseaux affichés, par type puis par tier (les plus hauts tiers d'abord)
  // hp : intégrité de coque (0–100) lue dans fleet.integrity[type]['tN'][i] (triée du plus sain au plus abîmé)
  function roster(fleet) {
    const out = [], comp = fleet && fleet.composition, integ = (fleet && fleet.integrity) || {};
    for (const type of ['cuirasse', 'fregate', 'tanker']) {
      const c = (comp && comp[type]) || {};
      let k = 0;
      for (const tier of [3, 2, 1]) for (let i = 0; i < (c['t' + tier] || 0) && k < MAX[type]; i++, k++) {
        const arr = integ[type] && integ[type]['t' + tier];
        const hp = arr && typeof arr[i] === 'number' ? Math.max(0, Math.min(100, arr[i])) : 100;
        out.push({ type, tier, hp });
      }
    }
    return out;
  }
  // formation (mètres, cap vers −Z) : cuirassés en ligne au centre, frégates en V devant, tankers en colonne derrière
  function place(list) {
    const by = { cuirasse: [], fregate: [], tanker: [] };
    list.forEach(s => by[s.type].push(s));
    const nc = by.cuirasse.length;
    by.cuirasse.forEach((s, i) => { s.x = (i - (nc - 1) / 2) * 340; s.z = 0; });
    const apex = nc ? -330 : -60;
    by.fregate.forEach((s, i) => { const jj = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1); s.x = side * jj * 120; s.z = apex + jj * 95; });
    const rear = nc ? 300 : (by.fregate.length ? 200 : 0);
    by.tanker.forEach((s, i) => { s.x = (i % 2 ? 1 : -1) * 60; s.z = rear + Math.floor(i / 2) * 105; });
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
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'u3d-canvas';
    container.insertBefore(renderer.domElement, container.firstChild);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(40, W() / H(), 5, 40000);
    const shiftY = opts.shiftY || 0;
    const applyView = () => { camera.aspect = W() / H(); if (shiftY) camera.setViewOffset(W(), H(), 0, H() * shiftY, W(), H()); camera.updateProjectionMatrix(); };
    applyView();

    // étoiles
    {
      const N = 1600, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 18000, q = Math.sqrt(1 - u * u);
        pos.set([r * q * Math.cos(a), r * u, r * q * Math.sin(a)], i * 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, color: 0xaebfd6 })));
    }
    // lumières : soleil rasant à l'avant, contre-jour froid
    const SUN = new THREE.Vector3(-0.55, 0.28, -0.79).normalize();
    const key = new THREE.DirectionalLight(0xfff2e0, 2.8); key.position.copy(SUN).multiplyScalar(3000); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db8e8, 1.0); rim.position.set(900, 400, 1500); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x2c3a58, 0x0a0c12, 0.7));

    // planète sous la flotte (textures de Kerath), elle défile lentement : la flotte avance
    const planet = new THREE.Group(); if (!mission) scene.add(planet);
    const PR = 9000; planet.position.set(0, -PR - 1300, -2000);
    const tl = new THREE.TextureLoader();
    const pMat = new THREE.MeshStandardMaterial({ color: 0x8a96a0, roughness: 0.95, metalness: 0 });
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(PR, 128, 96), pMat));
    const cMat = new THREE.MeshStandardMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0.0, depthWrite: false });
    const cMesh = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.004, 128, 96), cMat); planet.add(cMesh);
    if (!mission) tl.load('assets/3d/kerath_albedo.jpg', t => { if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; pMat.map = t; pMat.color.set(0x4a5560); pMat.needsUpdate = true; });
    if (!mission) tl.load('assets/3d/kerath_clouds.jpg', t => { cMat.alphaMap = t; cMat.opacity = 0.35; cMat.needsUpdate = true; });
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
    const loader = new GLTFLoader();
    const get = (url) => cache[url] || (cache[url] = new Promise((ok, ko) => loader.load(url, ok, undefined, ko)));
    let alive = true;
    Promise.all(list.map(async (s, i) => {
      const M = MODELS[s.type];
      const gltf = await get(M.url);
      if (!alive) return;
      const g = gltf.scene.clone(true);
      const hp = s.hp, dmg = 1 - hp / 100;
      g.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        const m = o.material, gl = GLOSS[m.name];
        if (gl) { m.roughness = Math.min(0.9, gl[0] + dmg * 0.35); m.metalness = gl[1]; m.envMapIntensity = 0.9 - dmg * 0.4; }
        if (m.name === 'M_KV_GLOW_MOTEUR') { m.emissive = new THREE.Color(M.color); m.emissiveIntensity = 4 * (0.35 + 0.65 * hp / 100); }
        else if (dmg > 0 && m.color && !(m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex())) m.color.multiplyScalar(1 - dmg * 0.55);   // coque noircie
        o.userData.idx = i;
      });
      g.scale.setScalar(M.scale);
      for (const [x, y, z] of M.glow) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: M.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.position.set(x, y, z); sp.scale.setScalar(M.glowSize / M.scale); g.add(sp);
      }
      const holder = new THREE.Group(); holder.add(g);
      if (mission) {
        // repère local du porteur : proue vers +Z (le porteur est retourné pour filer vers −Z)
        const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
        const L = sz.z, bow = bb.max.z + L * 0.1, hw = sz.x / 2, hhh = sz.y / 2;
        const R0 = Math.max(0.31 * L, 1.35 * Math.max(hw, hhh / 0.78));
        const shock = new THREE.Group();
        [[1.0, .55, 2.2, 1.6], [1.12, .28, 3.2, 1.1], [0.9, .22, 1.6, 2.4]].forEach(([sc, gain, fr, sp]) => {
          const m = new THREE.Mesh(bubbleGeo(THREE, bow, c.y, L, R0, sc), shockMat(THREE, PT, gain * (hp > 0 ? 1 : .5), fr, sp));
          m.renderOrder = 2; m.frustumCulled = false; shock.add(m);
        });
        holder.add(shock);
        holder.add(filaments(THREE, PT, FIL_N[s.type], bb.max.z, c.y, hw, hhh, L));
        // panaches : 4 couches par tuyère (cœur blanc, corps, gaine, halo)
        const pal = M.color === 0xffb070 ? PLUMES.amber : PLUMES.blue, thrust = 0.45 + 0.55 * hp / 100;
        for (const [x, y, z] of M.glow) {
          const pg = new THREE.Group(); pg.position.set(x, y, z);
          const R = M.glowSize * 0.32 / M.scale;
          for (const [len, rIn, rOut, col, alpha, flick, layer] of [[R * 40, R * .86, R * .2, pal[0], .16, 1, 1], [R * 28, R * .74, R * .1, pal[1], .3, 1, .7], [R * 16, R * .58, R * .05, pal[2], .42, .8, .4], [R * 7, R * .4, R * .03, pal[3], .55, .4, 0]]) {
            const geo = new THREE.CylinderGeometry(rIn, rOut, len * thrust, 28, 1, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len * thrust / 2);
            const pm = new THREE.Mesh(geo, plumeMat(THREE, PT, col, alpha, flick, layer)); pm.frustumCulled = false; pm.renderOrder = 4; pg.add(pm);
          }
          g.add(pg);
        }
      }
      holder.position.set(s.x, 0, s.z); holder.rotation.y = Math.PI;      // cap vers −Z
      holder.userData = { ph: i * 1.7, x: s.x, z: s.z, idx: i };
      fleetG.add(holder); ships[i] = holder;
      holder.userData.hp = hp;
      if (hp < 80) {                                                    // fumées + feu au-dessous de 35 %
        holder.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(holder), sz = b.getSize(new THREE.Vector3());
        const n = hp < 35 ? 4 : hp < 60 ? 3 : 2;
        for (let j = 0; j < n; j++) {
          const off = new THREE.Vector3((Math.random() - 0.5) * sz.x * 0.6, b.max.y - holder.position.y - sz.y * 0.15, (Math.random() - 0.5) * sz.z * 0.6);
          const base = Math.max(sz.x, sz.z) * 0.12 + 10;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x5a5650, transparent: true, depthWrite: false, opacity: 0 }));
          fleetG.add(sp); smoke.push({ sp, ship: holder, off, base, ph: Math.random(), rate: 0.18 + Math.random() * 0.1, fire: null });
          if (hp < 35 && j < 2) {
            const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a14, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
            f.scale.setScalar(base * 0.7); fleetG.add(f); smoke[smoke.length - 1].fire = f;
          }
        }
      }
    })).catch(e => console.warn('[Formation3D]', e)).finally(() => { if (alive && opts.onReady) opts.onReady(); });

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
      const N = 1400, span = ext * 16;
      const base = new THREE.PlaneGeometry(1, 1); base.translate(.5, 0, 0);   // x ∈ [0,1] le long de la traînée, y ∈ [−.5,.5] en travers
      const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position;
      const aP = new Float32Array(N * 4), aC = new Float32Array(N * 3);
      const PAL = [[.55, .35, 1.0], [.86, .38, 1.0], [.38, .82, 1.0], [.92, .86, 1.0], [.7, .45, 1.0]];
      for (let i = 0; i < N; i++) {
        const r = ext * (.45 + Math.pow(Math.random(), .7) * 3.6);
        aP.set([Math.random() * Math.PI * 2, r, Math.random(), .55 + Math.random() * .9], i * 4);
        aC.set(PAL[Math.floor(Math.random() * PAL.length)], i * 3);
      }
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
      g.instanceCount = N;
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uT: HYPER, uSpan: { value: span }, uNear: { value: ext * 3.5 }, uV: { value: ext * 7 }, uLen: { value: ext * 2.2 }, uW: { value: ext * .02 }, uExt: { value: ext } },
        vertexShader: `attribute vec4 aP; attribute vec3 aC; uniform float uT, uSpan, uNear, uV, uLen, uW, uExt;
          varying vec2 vC; varying vec3 vCol; varying float vF;
          void main(){
            float zz = fract(aP.z + uT * uV * aP.w / uSpan);              // 0 : au loin, 1 : dépasse la caméra
            float z = uNear - uSpan * (1.0 - zz);
            vec3 head = vec3(cos(aP.x) * aP.y, sin(aP.x) * aP.y * .8, z);
            float len = uLen * aP.w * (.5 + 1.3 * zz * zz);              // s'étire en approchant (vitesse apparente)
            vec4 h = viewMatrix * vec4(head, 1.0), tl = viewMatrix * vec4(head - vec3(0.0, 0.0, len), 1.0);
            vec3 side = normalize(cross(tl.xyz - h.xyz, -h.xyz));
            float w = uW * (.6 + .7 * aP.w) * (.5 + zz);
            vec3 p = mix(h.xyz, tl.xyz, position.x) + side * w * position.y * 2.0;
            vC = vec2(position.x, position.y * 2.0); vCol = aC;
            vF = smoothstep(0.0, .3, zz) * (1.0 - smoothstep(.9, 1.0, zz)) * smoothstep(uExt * .9, uExt * 2.4, -h.z);   // rien ne frôle l'objectif
            gl_Position = projectionMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `varying vec2 vC; varying vec3 vCol; varying float vF;
          void main(){
            float across = exp(-vC.y * vC.y * 3.2);                      // profil gaussien : flou, sans arête
            float along = pow(1.0 - vC.x, 1.6) * smoothstep(0.0, .06, vC.x + .02);
            float a = across * along * vF;
            gl_FragColor = vec4(mix(vCol, vec3(1.0), across * along * .2) * .85 * a, a * .7);
          }`,
      });
      const tun = new THREE.Mesh(g, m); tun.frustumCulled = false; tun.renderOrder = 1; scene.add(tun);
    }

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), 0.35, 0.4, 1.0); composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // caméra : arrière 3/4 de dessus ; orbite (azimut + inclinaison) et zoom lissés, rotation lente au repos
    let az = mission ? 2.35 : 0.35, azT = az, el = mission ? 0.42 : 0.62, elT = el, zoom = 1, zoomT = 1, idle = true, idleTimer = null;
    const fit = () => ext / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (W() / H() < 0.8 ? 1.15 : 0.8);
    const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); composer.setSize(W(), H()); applyView(); });
    ro.observe(container);

    let sel = null;
    const t0 = performance.now(); let last = t0, raf = 0;
    const frame = (now) => {
      if (!alive) return;
      if (container.offsetParent === null) { last = now; raf = requestAnimationFrame(frame); return; }   // fiche masquée : pause
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      const intro = 1 - Math.pow(1 - Math.min(1, t / 2.6), 3);         // la caméra descend sur la formation
      if (idle) azT += dt * 0.025;
      const k = 1 - Math.exp(-dt * 7);
      az += (azT - az) * k; el += (elT - el) * k; zoom += (zoomT - zoom) * k;
      const d = fit() * zoom * (1 + 0.8 * (1 - intro));
      const tgt = new THREE.Vector3(0, 0, -ext * 0.12);
      camera.position.set(tgt.x + Math.sin(az) * Math.cos(el) * d, tgt.y + Math.sin(el) * d, tgt.z + Math.cos(az) * Math.cos(el) * d);
      camera.lookAt(tgt);
      PT.value = t;
      HYPER.value = t;
      planet.rotation.x += dt * 0.006;                                  // le sol défile sous la flotte
      cMesh.rotation.y += dt * 0.002;
      for (const s of ships) {
        if (!s) continue;
        const p = s.userData.ph;
        s.position.x = s.userData.x + Math.sin(t * 0.21 + p) * 4;
        s.position.z = s.userData.z + Math.sin(t * 0.17 + p * 1.3) * 6;
        s.position.y = Math.sin(t * 0.3 + p) * 3;
        s.rotation.z = Math.sin(t * 0.25 + p) * 0.03;
        s.traverse(o => { if (o.isSprite) o.material.opacity = 0.75 + 0.25 * Math.sin(t * 23 + p * 5); });
      }
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
        const hit = raycaster.intersectObjects(fleetG.children, true).find(h => h.object.userData.idx !== undefined);
        if (!hit) return null;
        const i = hit.object.userData.idx;
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
