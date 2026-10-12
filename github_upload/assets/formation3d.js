/* Starbyte — Formation3D : une flotte en orbite, vue arrière 3/4 de dessus, tous ses vaisseaux en formation.
   Sert de vue héros à la fiche d'une flotte déployée en orbite (la fiche défile par-dessus).
   Usage : const h = window.Formation3D.mount(container, { fleet, shiftY, onReady });
           h.begin() / h.orbit(dx, dy) / h.dolly(k) / h.end()   — gestes relayés par la page (comme Ship3D)
           h.pick(clientX, clientY) → { type, tier, index } | null ; h.select(index | null) ; h.dispose()
   Moteur 3D partagé : window.SB3D (planet3d.js). Modèles : versions légères (LOD carte) des vaisseaux.
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

  function mount(container, opts = {}) {
    const { THREE, GLTFLoader, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.SB3D;
    const list = place(roster(opts.fleet));
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
    const planet = new THREE.Group(); scene.add(planet);
    const PR = 9000; planet.position.set(0, -PR - 1300, -2000);
    const tl = new THREE.TextureLoader();
    const pMat = new THREE.MeshStandardMaterial({ color: 0x8a96a0, roughness: 0.95, metalness: 0 });
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(PR, 128, 96), pMat));
    const cMat = new THREE.MeshStandardMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0.0, depthWrite: false });
    const cMesh = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.004, 128, 96), cMat); planet.add(cMesh);
    tl.load('assets/3d/kerath_albedo.jpg', t => { if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; pMat.map = t; pMat.color.set(0x4a5560); pMat.needsUpdate = true; });
    tl.load('assets/3d/kerath_clouds.jpg', t => { cMat.alphaMap = t; cMat.opacity = 0.35; cMat.needsUpdate = true; });
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

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), 0.35, 0.4, 1.0); composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // caméra : arrière 3/4 de dessus ; orbite (azimut + inclinaison) et zoom lissés, rotation lente au repos
    let az = 0.35, azT = 0.35, el = 0.62, elT = 0.62, zoom = 1, zoomT = 1, idle = true, idleTimer = null;
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
