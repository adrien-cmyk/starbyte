/* Starbyte — Formation3D : une flotte déployée en orbite, vue de haut, tous ses vaisseaux en formation.
   Remplace l'ancienne vue orbite au moment du déploiement (« ORBITE = ARMER », North Star §24).
   Usage : window.Formation3D.open({ name, composition: { cuirasse:{t1..}, fregate:{..}, tanker:{..} }, soldiers: { garde, lourd } })
   Moteur 3D partagé : window.SB3D (planet3d.js). Modèles : versions légères (LOD carte) des vaisseaux.
*/
(function () {
  const MODELS = {
    cuirasse: { url: 'assets/3d/sb_kv01_lod.glb?v=20261012-0100', scale: 0.22, glow: [[-44, 76, -660], [44, 76, -660]], glowSize: 70, color: 0x9ccaff },
    fregate:  { url: 'assets/3d/sb_sr01_lod.glb?v=20261012-0100', scale: 1.3,  glow: [[-2.3, 4.4, -35], [2.3, 4.4, -35]], glowSize: 7, color: 0x9ccaff },
    tanker:   { url: 'assets/3d/sb_tk07_lod.glb?v=20261012-0100', scale: 2.0,  glow: [[-2.5, 2.55, -15], [2.5, 2.55, -15]], glowSize: 5, color: 0xffb070 },
  };
  // (échelles d'affichage : le cuirassé fait 1 200 m, la frégate 68 m, le tanker 28,6 m — on comprime l'écart pour que tout se lise)
  const MAX = { cuirasse: 3, fregate: 12, tanker: 6 };
  const LABEL = { cuirasse: 'Cuirassés', fregate: 'Frégates', tanker: 'Tankers' };
  const GLOSS = { M_TK_ARMOR_JAUNE: [0.40, 0.08], M_KV_ARMOR_WHITE: [0.38, 0.0], M_KV_ARMOR_RED: [0.28, 0.3], M_KV_GUNMETAL: [0.26, 0.85],
                  M_KV_STRUCT_BLACK: [0.30, 0.55], M_TK_GRAPHITE: [0.30, 0.6], M_SR_VERRIERE: [0.06, 0.4] };
  const cache = {};

  const total = (c) => c ? (c.t1 || 0) + (c.t2 || 0) + (c.t3 || 0) : 0;

  // formation (mètres, cap vers −Z) : cuirassés en ligne au centre, frégates en V devant, tankers en colonne derrière
  function slots(n) {
    const out = [];
    const nc = Math.min(MAX.cuirasse, n.cuirasse), nf = Math.min(MAX.fregate, n.fregate), nt = Math.min(MAX.tanker, n.tanker);
    for (let i = 0; i < nc; i++) out.push({ type: 'cuirasse', x: (i - (nc - 1) / 2) * 340, z: 0 });
    const apex = nc ? -330 : -60;
    for (let i = 0; i < nf; i++) {
      const j = Math.floor(i / 2) + (i === 0 ? 0 : 1), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
      const jj = i === 0 ? 0 : Math.ceil(i / 2);
      out.push({ type: 'fregate', x: side * jj * 120, z: apex + jj * 95 });
    }
    const rear = nc ? 300 : (nf ? 200 : 0);
    for (let i = 0; i < nt; i++) out.push({ type: 'tanker', x: (i % 2 ? 1 : -1) * 60, z: rear + Math.floor(i / 2) * 105 });
    return out;
  }

  function css() {
    if (document.getElementById('f3d-css')) return;
    const st = document.createElement('style'); st.id = 'f3d-css';
    st.textContent = `
      #scr-formation { position:fixed; inset:0; z-index:9000; background:#010205; opacity:0; transition:opacity .35s ease; }
      #scr-formation.on { opacity:1; }
      #scr-formation canvas { position:absolute; inset:0; display:block; touch-action:none; }
      #scr-formation .f-top { position:absolute; left:0; right:0; top:0; padding:calc(env(safe-area-inset-top, 0px) + 16px) 20px 30px; pointer-events:none;
        background:linear-gradient(to bottom, rgba(1,3,6,.7), rgba(1,3,6,0)); }
      #scr-formation .f-top b { display:block; font:600 13px/1.2 'Space Grotesk', system-ui, sans-serif; letter-spacing:.3em; color:#eef4f8; text-transform:uppercase; }
      #scr-formation .f-top span { display:block; margin-top:4px; font-size:9px; letter-spacing:.28em; color:rgba(170,190,205,.75); text-transform:uppercase; }
      #scr-formation .f-bottom { position:absolute; left:0; right:0; bottom:0; padding:44px 20px calc(env(safe-area-inset-bottom, 0px) + 16px);
        background:linear-gradient(to top, rgba(1,3,6,.78), rgba(1,3,6,0)); }
      #scr-formation .f-counts { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:9px; letter-spacing:.16em; color:rgba(190,208,220,.8); text-transform:uppercase; margin-bottom:12px; }
      #scr-formation .f-counts b { font:600 13px/1 'JetBrains Mono', monospace; color:#eef4f8; margin-right:5px; letter-spacing:0; }
      #scr-formation .f-hint { font-size:8.5px; letter-spacing:.2em; color:rgba(170,190,205,.45); text-transform:uppercase; margin-bottom:10px; }
      #scr-formation .f-back { width:100%; height:44px; border-radius:22px; border:1px solid rgba(200,210,220,.22); background:rgba(8,10,12,.55);
        color:rgba(226,236,244,.92); font-size:11px; letter-spacing:.22em; text-transform:uppercase; cursor:pointer; }
      #scr-formation .f-load { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:9px; letter-spacing:.4em; color:rgba(120,190,240,.7); }
      #scr-formation .f-load.off { display:none; }`;
    document.head.appendChild(st);
  }

  function open(fleet) {
    if (!window.SB3D) { setTimeout(() => open(fleet), 120); return; }
    close(true);
    css();
    const { THREE, GLTFLoader, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.SB3D;
    const comp = (fleet && fleet.composition) || {};
    const n = { cuirasse: total(comp.cuirasse), fregate: total(comp.fregate), tanker: total(comp.tanker) };
    const sold = fleet && fleet.soldiers ? (fleet.soldiers.garde || 0) + (fleet.soldiers.lourd || 0) : 0;

    const el = document.createElement('div'); el.id = 'scr-formation';
    const counts = Object.keys(LABEL).filter(k => n[k]).map(k => `<span><b>${n[k]}</b>${LABEL[k]}${n[k] > MAX[k] ? ` (${MAX[k]} visibles)` : ''}</span>`);
    if (sold) counts.push(`<span><b>${sold}</b>Soldats embarqués</span>`);
    el.innerHTML = `
      <div class="f-top"><b>${(fleet && fleet.name) || 'Flotte'}</b><span>En orbite · formation de déploiement</span></div>
      <div class="f-bottom"><div class="f-counts">${counts.join('') || '<span>Aucun vaisseau</span>'}</div>
        <div class="f-hint">Glisser pour tourner · pincer pour zoomer</div>
        <button class="f-back">Retour à la flotte</button></div>
      <div class="f-load"><span>MISE EN FORMATION</span></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));

    const W = () => Math.max(1, el.clientWidth), H = () => Math.max(1, el.clientHeight);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.insertBefore(renderer.domElement, el.firstChild);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(40, W() / H(), 5, 40000);

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
    const SUN = new THREE.Vector3(-0.55, 0.28, -0.79).normalize();          // soleil rasant : sol à l'aube, coques éclairées de biais
    const key = new THREE.DirectionalLight(0xfff2e0, 2.8); key.position.copy(SUN).multiplyScalar(3000); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db8e8, 1.0); rim.position.set(900, 400, 1500); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x2c3a58, 0x0a0c12, 0.7));

    // planète sous la flotte (textures de Kerath), elle défile lentement : la flotte avance
    const planet = new THREE.Group(); scene.add(planet);
    const PR = 9000; planet.position.set(0, -PR - 1300, -2000);
    const tl = new THREE.TextureLoader();
    const pMat = new THREE.MeshStandardMaterial({ color: 0x8a96a0, roughness: 0.95, metalness: 0 });
    const PLANET_TINT = 0x4a5560;                                      // sol sombre : les vaisseaux restent les héros
    const pMesh = new THREE.Mesh(new THREE.SphereGeometry(PR, 128, 96), pMat); planet.add(pMesh);
    const cMat = new THREE.MeshStandardMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0.0, depthWrite: false });
    const cMesh = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.004, 128, 96), cMat); planet.add(cMesh);
    tl.load('assets/3d/kerath_albedo.jpg', t => { if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; pMat.map = t; pMat.color.set(PLANET_TINT); pMat.needsUpdate = true; });
    tl.load('assets/3d/kerath_clouds.jpg', t => { cMat.alphaMap = t; cMat.opacity = 0.35; cMat.needsUpdate = true; });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.03, 96, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.4); gl_FragColor = vec4(vec3(.3,.6,1.0) * f, f); }'
    }));
    planet.add(atmo);

    // lueur de réacteur (sprite additif)
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    })();

    const fleetG = new THREE.Group(); scene.add(fleetG);
    const ships = [];
    const layout = slots(n);
    let ext = 300;
    for (const s of layout) ext = Math.max(ext, Math.abs(s.x) + 200, Math.abs(s.z) + 260);
    const loader = new GLTFLoader();
    const get = (url) => cache[url] || (cache[url] = new Promise((ok, ko) => loader.load(url, ok, undefined, ko)));
    Promise.all(layout.map(async (s, i) => {
      const M = MODELS[s.type];
      const gltf = await get(M.url);
      const g = gltf.scene.clone(true);
      g.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        const m = o.material, gl = GLOSS[m.name];
        if (gl) { m.roughness = gl[0]; m.metalness = gl[1]; m.envMapIntensity = 0.9; }
        if (m.name === 'M_KV_GLOW_MOTEUR') { m.emissive = new THREE.Color(M.color); m.emissiveIntensity = 4; }
      });
      g.scale.setScalar(M.scale);
      for (const [x, y, z] of M.glow) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: M.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.position.set(x, y, z); sp.scale.setScalar(M.glowSize / M.scale * 1.0); sp.userData.base = M.glowSize; g.add(sp);
      }
      const holder = new THREE.Group(); holder.add(g);
      holder.position.set(s.x, 0, s.z); holder.rotation.y = Math.PI;      // cap vers −Z
      holder.userData = { ph: i * 1.7, x: s.x, z: s.z };
      fleetG.add(holder); ships.push(holder);
    })).catch(e => console.warn('[Formation3D]', e)).finally(() => { const l = el.querySelector('.f-load'); if (l) l.classList.add('off'); });

    // post : bloom doux
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), 0.35, 0.4, 1.0); composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // caméra : vue de haut, légèrement inclinée vers l'avant ; glisser = tourner, pincer = zoom (lissés)
    let az = 0, azT = 0, zoom = 1, zoomT = 1;
    const fit = () => ext / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (W() / H() < 0.8 ? 1.05 : 0.75);
    const pts = new Map(); let lastX = null, pinch0 = 0;
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', e => { pts.set(e.pointerId, e.clientX); if (pts.size === 2) { const v = [...pts.values()]; pinch0 = Math.abs(v[0] - v[1]); } lastX = e.clientX; });
    window.addEventListener('pointermove', onMove = e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e.clientX);
      if (pts.size === 2) { const v = [...pts.values()]; const d = Math.abs(v[0] - v[1]); if (pinch0 > 10 && d > 10) zoomT = Math.min(1.8, Math.max(0.45, zoomT * pinch0 / d)); pinch0 = d; return; }
      azT += (e.clientX - lastX) * 0.006; lastX = e.clientX;
    });
    window.addEventListener('pointerup', onUp = e => { pts.delete(e.pointerId); });
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomT = Math.min(1.8, Math.max(0.45, zoomT * (1 + e.deltaY * 0.0012))); }, { passive: false });
    var onMove, onUp;

    const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); composer.setSize(W(), H()); };
    window.addEventListener('resize', onResize);

    const t0 = performance.now(); let last = t0, raf = 0, alive = true;
    const frame = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      const intro = 1 - Math.pow(1 - Math.min(1, t / 2.6), 3);         // la caméra descend sur la formation
      az += (azT - az) * (1 - Math.exp(-dt * 7)); zoom += (zoomT - zoom) * (1 - Math.exp(-dt * 7));
      const d = fit() * zoom * (1 + 0.9 * (1 - intro));
      const tilt = 0.32;                                               // ~18° depuis la verticale
      const a = az + 0.12 * Math.sin(t * 0.05);
      camera.position.set(Math.sin(a) * Math.sin(tilt) * d, Math.cos(tilt) * d, Math.cos(a) * Math.sin(tilt) * d);
      camera.lookAt(0, 0, -ext * 0.08);
      planet.rotation.x += dt * 0.006;                                  // le sol défile sous la flotte
      cMesh.rotation.y += dt * 0.002;
      for (const s of ships) {                                          // tenue de formation : léger roulis, petits écarts
        const p = s.userData.ph;
        s.position.x = s.userData.x + Math.sin(t * 0.21 + p) * 4;
        s.position.z = s.userData.z + Math.sin(t * 0.17 + p * 1.3) * 6;
        s.position.y = Math.sin(t * 0.3 + p) * 3;
        s.rotation.z = Math.sin(t * 0.25 + p) * 0.03;
        s.traverse(o => { if (o.isSprite) o.material.opacity = 0.75 + 0.25 * Math.sin(t * 23 + p * 5); });
      }
      composer.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const state = { el, dispose() {
      alive = false; cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
      el.remove();
    } };
    current = state;
    el.querySelector('.f-back').onclick = () => close();
  }
  let current = null;
  function close(now) {
    if (!current) return;
    const s = current; current = null;
    if (now) { s.dispose(); return; }
    s.el.classList.remove('on');
    setTimeout(() => s.dispose(), 380);
    if (typeof refreshCurrentScreen === 'function') try { refreshCurrentScreen(); } catch (e) {}
  }
  window.Formation3D = { open, close };
})();
