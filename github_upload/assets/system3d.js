/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Diorama système (Space Map · niveau B) · octobre 2026
   Cf. GDD « Space Map v0 » §Niveau B.

   « Je ne lis plus un radar, j'inspecte un système. »
   Un écran plein (scr-system) sur le moteur 3D partagé (window.SB3D) :
   étoile, orbites, et seulement ce que le joueur SAIT — échos pour les
   signatures, silhouettes pour les corps identifiés, vraies planètes une
   fois fixées, amas pour les veines, sondes et tankers en approche, brume
   tant que le système n'est pas entièrement résolu. Tout est déterministe
   par adresse. Les actions restent les mêmes que sur la carte et dans les
   rapports (probeSignatureNextAction) : un objet, un état, un bouton.
   ═══════════════════════════════════════════════════════════════════════════ */

const waitSB3D = () => new Promise((res) => {
  if (window.SB3D) return res(window.SB3D);
  const t = setInterval(() => { if (window.SB3D) { clearInterval(t); res(window.SB3D); } }, 150);
});
const TEX = { albedo: 'assets/3d/kerath_albedo.jpg', clouds: 'assets/3d/kerath_clouds.jpg', lights: 'assets/3d/kerath_lights.jpg' };
const COL = { radar: 0xe6f0ff, light: 0x5fcc8a, medium: 0x9a8aff, tanker: 0xffc864, cyan: 0x5fffe8 };
const ORBIT_R = [2.0, 3.0, 4.0, 5.0, 6.0];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rngFor = (s) => _mulberry32(_hashSeed('S3:' + s));
const mySystemKey = () => `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;

// Classe de planète → apparence (types du jeu PLANET_TYPES et classes des signatures)
const CLASS = {
  type1: { r: 0.09, c: 0xb9b2a9, rough: 1.0, label: 'Naine' },
  type2: { r: 0.12, c: 0x9b6a4e, rough: 0.95, label: 'Fer' },
  type3: { r: 0.14, c: 0x3f86a2, rough: 0.8, atmo: true, label: 'Vie' },
  type4: { r: 0.24, c: 0xd9a066, rough: 0.9, bands: true, label: 'Gazeuse' },
  type5: { r: 0.11, c: 0x6c6c74, rough: 1.0, label: 'Morte' },
};
const SIG_CLASS = { dead_world: 'type5', gas_giant: 'type4', habitable: 'type3', lunar: 'type1', unknown: 'type2' };
const classOf = (p) => CLASS[p.type] ? p.type : (SIG_CLASS[p.fixedClass] || (p.type === 'mine' ? 'type3' : 'type2'));

function haloTexture(T) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(0.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function bandTexture(T, seed) {
  const rng = rngFor('bands:' + seed);
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const x = c.getContext('2d');
  for (let y = 0; y < 256; y += 1) {
    const k = 0.78 + 0.22 * Math.sin(y * 0.11 + rng() * 0.3) * Math.sin(y * 0.031);
    x.fillStyle = `rgba(${Math.round(255 * k)},${Math.round(255 * k)},${Math.round(255 * k)},1)`; x.fillRect(0, y, 8, 1);
  }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
}

export const SBSystem = {
  el: null, ready: false, running: false, sysKey: null, sel: null,

  mount() {
    if (this.el) return;
    const el = this.el = document.createElement('div');
    el.id = 'scr-system'; el.className = 'screen hidden';
    el.innerHTML = `
      <div class="s3-view" id="s3-view"></div>
      <div class="s3-ui">
        <div class="s3-top">
          <div class="s3-title"><b id="s3-name">SYSTÈME</b><span id="s3-sub">—</span></div>
          <button class="s3-x" aria-label="Retour à la carte">×</button>
        </div>
        <div class="s3-sheet" id="s3-sheet"></div>
      </div>
      <div class="s3-load" id="s3-load"><span>APPROCHE DU SYSTÈME</span></div>`;
    document.body.appendChild(el);
    el.querySelector('.s3-x').onclick = () => this.leave();
    new MutationObserver(() => {
      const on = !el.classList.contains('hidden');
      if (on && !this.running) this._enter(); else if (!on) this.running = false;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  },

  open(sysKey) {
    this.mount();
    this.sysKey = sysKey || mySystemKey();
    this.sel = null;
    if (this.running && this.ready && !this.el.classList.contains('hidden')) {
      this._fade(() => this._build(this.sysKey).then(() => this._renderUI()));
      return;
    }
    this._fade(() => goto('system'));
  },
  leave() { this._fade(() => { if (typeof goBack === 'function') goBack(); else goto('prospect'); }); },
  _fade(fn) {
    const f = document.createElement('div'); f.className = 's3-flash'; document.body.appendChild(f);
    requestAnimationFrame(() => f.classList.add('on'));
    setTimeout(() => { fn(); f.classList.remove('on'); setTimeout(() => f.remove(), 450); }, 260);
  },

  async _init() {
    if (this.ready) return;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const S = await waitSB3D();
      const T = this.T = S.THREE;
      const host = document.getElementById('s3-view');
      const r = this.r = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
      r.setClearColor(0x03060a, 1);
      host.appendChild(r.domElement);
      const scene = this.scene = new T.Scene();
      const pm = new T.PMREMGenerator(r);
      scene.environment = pm.fromScene(new S.RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.12; pm.dispose();
      scene.add(new T.HemisphereLight(0x6a8fb0, 0x05070a, 0.18));
      this.halo = haloTexture(T);

      // Fond : étoiles lointaines (statiques, hors du groupe qui tourne)
      {
        const n = 700, pos = new Float32Array(n * 3), rng = rngFor('bg');
        for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, b = Math.acos(2 * rng() - 1), R = 60; pos.set([R * Math.sin(b) * Math.cos(a), R * Math.cos(b), R * Math.sin(b) * Math.sin(a)], i * 3); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
        scene.add(new T.Points(g, new T.PointsMaterial({ color: 0xcfe0ea, size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false })));
      }

      const cam = this.cam = new T.PerspectiveCamera(36, 1, 0.1, 200);
      this.extent = 8; this._frame();
      this.world = new T.Group(); scene.add(this.world);
      this.ray = new T.Raycaster(); this.ray.params.Points = { threshold: 0.3 };

      // Interaction : toucher = sélectionner (pas de rotation au doigt ; le système tourne seul, très lentement)
      const el = r.domElement; let down = null;
      this.yaw = 0.3;
      el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
      el.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) this._pick(e); down = null; });
      el.addEventListener('pointercancel', () => { down = null; });
      el.style.touchAction = 'pan-y';
      this.ready = true;
    })();
    return this._loading;
  },

  async _enter() {
    this.running = true;
    const load = document.getElementById('s3-load'); if (load) load.classList.remove('off');
    try { await this._init(); } catch (e) { console.warn('[SBSystem]', e); if (load) load.innerHTML = '<span>APERÇU 3D INDISPONIBLE</span>'; return; }
    if (!this.running) return;
    await this._build(this.sysKey);
    this._renderUI();
    this._resize();
    if (load) load.classList.add('off');
    this._t = performance.now();
    requestAnimationFrame(this._loop);
  },

  /* ─── Construction déterministe du système ─── */
  async _build(sysKey) {
    const T = this.T, W = this.world;
    while (W.children.length) { const o = W.children.pop(); o.traverse?.((m) => { m.geometry?.dispose?.(); }); }
    this.pick = []; this.anim = [];
    const rng = rngFor(sysKey);
    const isMine = sysKey === mySystemKey();
    const st = this._state(sysKey);
    this.state = st;

    // Étoile
    const sc = rng();
    const star = sc < 0.55 ? { c: 0xfff1cc, l: 0xffe9b8, r: 0.42 } : sc < 0.8 ? { c: 0xffb070, l: 0xffb888, r: 0.38 } : sc < 0.92 ? { c: 0xd6e6ff, l: 0xcfe0ff, r: 0.48 } : { c: 0xff7a5a, l: 0xff8a6a, r: 0.32 };
    const sun = new T.Mesh(new T.SphereGeometry(star.r, 48, 32), new T.MeshBasicMaterial({ color: star.c }));
    W.add(sun);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: star.l, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9 }));
    glow.scale.setScalar(star.r * 5.2); W.add(glow);
    const light = new T.PointLight(star.l, 14, 40, 1.5); W.add(light);
    this.anim.push((t) => { const k = 1 + Math.sin(t * 0.9) * 0.03; glow.scale.setScalar(star.r * 5.2 * k); });

    // Orbites
    const nOrb = 2 + Math.floor(rng() * 4);
    const orbits = [];
    for (let i = 0; i < nOrb; i++) {
      const R = ORBIT_R[i] + (rng() - 0.5) * 0.4;
      orbits.push(R);
      const ring = new T.Mesh(new T.TorusGeometry(R, 0.009, 4, 160), new T.MeshBasicMaterial({ color: 0x5fffe8, transparent: true, opacity: 0.16, depthWrite: false }));
      ring.rotation.x = Math.PI / 2; W.add(ring);
    }
    const orbitFor = (id) => { const r2 = rngFor('orb:' + id); return { R: orbits[Math.floor(r2() * nOrb)], a: r2() * Math.PI * 2, tilt: (r2() - 0.5) * 0.08 }; };
    const place = (obj, o) => { obj.position.set(Math.cos(o.a) * o.R, Math.sin(o.a) * o.tilt * o.R, Math.sin(o.a) * o.R); };
    const posOf = this.posOf = {};
    const proxy = (obj, r, data) => { const m = new T.Mesh(new T.SphereGeometry(r, 8, 6), new T.MeshBasicMaterial({ visible: false })); m.position.copy(obj.position); m.userData = data; W.add(m); this.pick.push(m); return m; };

    // Planètes fixées (seules vraies planètes)
    for (const p of st.planets) {
      const cls = CLASS[classOf(p)], o = orbitFor(p.coord);
      const g = new T.Group(); place(g, o);
      let mat;
      if (p.isMine) {
        try {
          const load = (u) => new Promise((ok, ko) => new T.TextureLoader().load(u, ok, undefined, ko));
          const [tA, tC, tL] = await Promise.all([load(TEX.albedo), load(TEX.clouds), load(TEX.lights)]);
          tA.colorSpace = T.SRGBColorSpace; tL.colorSpace = T.SRGBColorSpace;
          mat = new T.MeshStandardMaterial({ map: tA, roughness: 0.9, emissiveMap: tL, emissive: 0xffc890, emissiveIntensity: 0.35 });
          const clouds = new T.Mesh(new T.SphereGeometry(0.17 * 1.01, 40, 28), new T.MeshStandardMaterial({ color: 0xe0e6ea, alphaMap: tC, transparent: true, opacity: 0.7, depthWrite: false, roughness: 1 }));
          g.add(clouds); this.anim.push((t, dt) => { clouds.rotation.y += dt * 0.05; });
        } catch (e) { mat = null; }
      }
      const R = p.isMine ? 0.17 : cls.r;
      if (!mat) {
        mat = new T.MeshStandardMaterial({ color: cls.c, roughness: cls.rough, metalness: 0 });
        if (cls.bands) { mat.map = bandTexture(T, p.coord); mat.color.set(cls.c); }
      }
      const m = new T.Mesh(new T.SphereGeometry(R, 40, 28), mat); g.add(m);
      if (cls.atmo || p.isMine) {
        const atm = new T.Mesh(new T.SphereGeometry(R * 1.12, 32, 24), new T.MeshBasicMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.BackSide }));
        g.add(atm);
      }
      this.anim.push((t, dt) => { m.rotation.y += dt * 0.08; });
      W.add(g);
      posOf[p.coord] = g.position.clone();
      proxy(g, 0.45, { kind: 'planet', key: p.coord, label: p.name || p.coord, sub: cls.label });
    }

    // Échos : signatures non résolues (on ne devine pas une planète)
    for (const sig of st.echoes) {
      const o = orbitFor(sig.id), g = new T.Group(); place(g, o);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: COL.radar, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55 }));
      sp.scale.setScalar(0.55); g.add(sp);
      const wf = new T.Mesh(new T.IcosahedronGeometry(0.11, 1), new T.MeshBasicMaterial({ color: COL.radar, wireframe: true, transparent: true, opacity: 0.28 }));
      g.add(wf); W.add(g);
      const ph = rngFor('ph:' + sig.id)() * 6;
      this.anim.push((t, dt) => { sp.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.8 + ph)); wf.rotation.y += dt * 0.4; wf.rotation.x += dt * 0.17; });
      posOf[sig.id] = g.position.clone();
      proxy(g, 0.45, { kind: 'sig', key: sig.id, label: sig.typeLabel || 'Signature', sub: `${sig.id} · ${sig.intensity || ''}` });
    }
    // Corps orbitaux identifiés (silhouette, pas encore fixés)
    for (const sig of st.bodies) {
      const o = orbitFor(sig.id), cls = CLASS[SIG_CLASS[sig.fixedClass] || 'type2'], g = new T.Group(); place(g, o);
      const sh = new T.Mesh(new T.SphereGeometry(cls.r, 24, 16), new T.MeshBasicMaterial({ color: COL.light, transparent: true, opacity: 0.14, depthWrite: false }));
      const wf = new T.Mesh(new T.SphereGeometry(cls.r * 1.02, 12, 8), new T.MeshBasicMaterial({ color: COL.light, wireframe: true, transparent: true, opacity: 0.3 }));
      g.add(sh, wf); W.add(g);
      this.anim.push((t, dt) => { wf.rotation.y += dt * 0.12; });
      posOf[sig.id] = g.position.clone();
      proxy(g, 0.45, { kind: 'sig', key: sig.id, label: 'Corps orbital identifié', sub: `${sig.id} · ${cls.label.toLowerCase()} probable` });
    }
    // Veines, épaves : amas de roches hors des orbites
    for (const t of st.targets) {
      const r2 = rngFor('tgt:' + t.key), a = r2() * Math.PI * 2, R = orbits[nOrb - 1] + 0.7 + r2() * 0.8;
      const g = new T.Group(); g.position.set(Math.cos(a) * R, (r2() - 0.5) * 0.6, Math.sin(a) * R);
      const engaged = t.kt.status === 'engaged';
      const mat = new T.MeshStandardMaterial({ color: engaged ? 0x6a6f6d : 0x9a7a4a, roughness: 1, emissive: engaged ? 0x000000 : 0x3a2a08, emissiveIntensity: 0.6 });
      for (let i = 0; i < 5; i++) { const m = new T.Mesh(new T.DodecahedronGeometry(0.04 + r2() * 0.06, 0), mat); m.position.set((r2() - 0.5) * 0.4, (r2() - 0.5) * 0.2, (r2() - 0.5) * 0.4); m.rotation.set(r2() * 3, r2() * 3, 0); g.add(m); }
      if (!engaged) { const sp = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: COL.tanker, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.35 })); sp.scale.setScalar(0.6); g.add(sp); }
      W.add(g); this.anim.push((t, dt) => { g.rotation.y += dt * 0.15; });
      posOf[t.key] = g.position.clone();
      proxy(g, 0.6, { kind: 'target', key: t.key, label: t.kt.label || 'Cible', sub: t.key.split('/').pop() });
    }

    // Étendue pour le cadrage : la plus grande distance au centre parmi les objets
    this.extent = Math.max(orbits[nOrb - 1] + 0.3, ...this.pick.map((m) => Math.hypot(m.position.x, m.position.z) + 0.4));
    this._frame();

    // Brume de scan : le système n'est pas entièrement résolu
    const res = (typeof getSystemResolution === 'function') ? getSystemResolution(sysKey) : 0;
    const unresolved = isMine ? 0 : (1 - Math.min(100, Math.max(0, res)) / 100);
    if (unresolved > 0.02 || !st.known) {
      const n = 260, pos = new Float32Array(n * 3), r3 = rngFor('dust:' + sysKey);
      for (let i = 0; i < n; i++) { const a = r3() * Math.PI * 2, R = 1.5 + r3() * 8.5; pos.set([Math.cos(a) * R, (r3() - 0.5) * 1.6, Math.sin(a) * R], i * 3); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const dust = new T.Points(g, new T.PointsMaterial({ color: 0x9fd8d0, size: 0.045, transparent: true, opacity: 0.18 + 0.25 * unresolved, depthWrite: false }));
      W.add(dust); this.anim.push((t, dt) => { dust.rotation.y -= dt * 0.01; });
    }
    // Balayage en cours : onde qui s'étend
    if (st.scanning) {
      const ring = new T.Mesh(new T.TorusGeometry(1, 0.02, 4, 120), new T.MeshBasicMaterial({ color: COL.radar, transparent: true, opacity: 0.5, depthWrite: false }));
      ring.rotation.x = Math.PI / 2; W.add(ring);
      this.anim.push((t) => { const k = (t * 0.35) % 1; ring.scale.setScalar(1 + k * 9); ring.material.opacity = 0.5 * (1 - k); });
    }
    // En approche : sondes et tankers vers ce système
    for (const f of st.flights) {
      const from = new T.Vector3(14, 1.2, -6), to = (f.target && posOf[f.target]) ? posOf[f.target].clone() : new T.Vector3(0, 0, 0);
      const line = new T.Line(new T.BufferGeometry().setFromPoints([from, to]), new T.LineBasicMaterial({ color: f.color, transparent: true, opacity: 0.25 }));
      W.add(line);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: f.color, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.95 }));
      sp.scale.setScalar(0.5); W.add(sp);
      const px = proxy(sp, 0.5, { kind: 'flight', key: f.id, label: f.label, sub: '', f });
      this.anim.push(() => { const k = Math.max(0, Math.min(1, (Date.now() - f.t0) / Math.max(1, f.t1 - f.t0))); sp.position.lerpVectors(from, to, k); px.position.copy(sp.position); });
    }
  },

  // Ce que le joueur sait de ce système (mêmes sources que la carte)
  _state(sysKey) {
    const now = Date.now();
    const isMine = sysKey === mySystemKey();
    const sys = (G.knownSystems || {})[sysKey];
    const planets = [];
    if (sys) for (const p of sys.planets || []) planets.push({ ...p, isMine: !!p.isMine });
    const echoes = [], bodies = [], targets = [];
    for (const sig of Object.values(G.signatures || {})) {
      if (sig.system !== sysKey || sig.ignored) continue;
      if (!sig.resolved) { if (!sig.expiresAt || sig.expiresAt > now) echoes.push(sig); continue; }
      if (sig.resolvedType === 'moving') { const kt = sig.movingCoordKey && G.knownTargets && G.knownTargets[sig.movingCoordKey]; if (kt) targets.push({ key: sig.movingCoordKey, kt, sig }); }
      else if (!sig.fixedAddress) bodies.push(sig);
      else if (!planets.some((p) => p.coord === sig.fixedAddress)) planets.push({ coord: sig.fixedAddress, name: sig.fixedAddress, fixedClass: sig.fixedClass });
    }
    for (const [key, kt] of Object.entries(G.knownTargets || {})) {
      if (key.split('/')[0] !== sysKey || (kt.expiresAt && kt.expiresAt < now)) continue;
      if (!targets.some((t) => t.key === key)) targets.push({ key, kt, sig: null });
    }
    // Position 3D d'une cible pour les trajets (recalculée comme dans _build)
    const flights = [];
    let scanning = false;
    for (const m of (G.probeMissions || [])) {
      if (m.status !== 'in_transit') continue;
      const tc = String(m.targetCoords || '');
      if (/^SIG-/.test(tc)) { const sig = G.signatures && G.signatures[tc]; if (!sig || sig.system !== sysKey) continue; flights.push({ id: m.id, label: `Sonde ${m.probeName || ''}`.trim(), color: m.tier === 'medium' ? COL.medium : COL.light, t0: m.departedAt, t1: m.arrivalAt, target: tc }); }
      else if (tc.split('-').slice(0, 3).join('-') === sysKey) { scanning = true; flights.push({ id: m.id, label: `Sonde ${m.probeName || ''}`.trim(), color: COL.radar, t0: m.departedAt, t1: m.arrivalAt, target: null }); }
    }
    for (const m of (G.tankerMissions || [])) {
      if (!(m.status === 'in_transit' || m.status === 'exploring')) continue;
      const tc = String(m.targetCoords || ''); if (tc.split('/')[0] !== sysKey) continue;
      flights.push({ id: m.id, label: m.tankerName || 'Tanker', color: COL.tanker, t0: m.departedAt, t1: m.arrivalAt, target: tc });
    }
    const known = !!sys || echoes.length + bodies.length + targets.length + planets.length > 0;
    return { isMine, planets, echoes, bodies, targets, flights, scanning, known };
  },

  /* ─── UI ─── */
  _renderUI() {
    const k = this.sysKey, st = this.state, isMine = st.isMine;
    const name = document.getElementById('s3-name'), sub = document.getElementById('s3-sub');
    const sector = k.split('-')[1], d = _sectorDistance(MY_ADDRESS.sector, sector);
    const res = (typeof getSystemResolution === 'function') ? getSystemResolution(k) : 0;
    const status = isMine ? 'Système d\'origine' : st.scanning ? 'Balayage en cours' : !st.known ? 'Jamais balayé' : res >= 100 ? 'Entièrement résolu' : `Résolution ${res} %`;
    const pn = (G.planet && G.planet.name) || (G.profile && G.profile.planetName);
    if (name) name.textContent = (isMine && pn) ? `${pn} · ${k}` : k;
    if (sub) sub.textContent = `Secteur ${sector}${d ? ` · à ${d} secteur${d > 1 ? 's' : ''}` : ''} · ${status}`;
    this._renderSheet();
  },

  _renderSheet() {
    const el = document.getElementById('s3-sheet'); if (!el) return;
    const st = this.state, k = this.sysKey;
    if (this.sel) {
      const s = this.sel;
      let body = '';
      if (window.SBMap && SBMap.panelFor) body = SBMap.panelFor({ kind: s.kind, key: s.key });
      el.innerHTML = `<div class="s3-sel">${body || `<div class="sm-panel"><div class="sm-ptitle">${esc(s.label)}</div><div class="sm-psub">${esc(s.sub)}</div></div>`}</div>
        <button class="s3-back" onclick="SBSystem.sel=null;SBSystem._renderSheet()">← Système</button>`;
      // Une action (Légère, tanker, Moyenne…) change l'état du système : on le reconstruit
      el.querySelectorAll('.sig-next button').forEach((b) => b.addEventListener('click', () => {
        setTimeout(() => { if (!this.running) return; this._build(this.sysKey).then(() => { this._renderUI(); }); }, 60);
      }));
      return;
    }
    const bits = [];
    if (st.echoes.length) bits.push(`${st.echoes.length} signature${st.echoes.length > 1 ? 's' : ''}`);
    if (st.bodies.length) bits.push(`${st.bodies.length} corps identifié${st.bodies.length > 1 ? 's' : ''}`);
    if (st.targets.length) bits.push(`${st.targets.length} cible${st.targets.length > 1 ? 's' : ''}`);
    if (st.planets.length) bits.push(`${st.planets.length} planète${st.planets.length > 1 ? 's' : ''}`);
    if (st.flights.length) bits.push(`${st.flights.length} en approche`);
    const radar = (typeof _probeTierStatus === 'function') ? _probeTierStatus('radar') : { ok: false };
    const sweepBtn = radar.ok ? `<button class="s3-act" onclick="SBSystem.sweep()">Balayer</button>` : radar.build ? `<button class="s3-act dim" onclick="openProbeDetail('radar')">Construire une Radar</button>` : `<button class="s3-act dim" disabled>${esc(radar.why || 'Radar indisponible')}</button>`;
    el.innerHTML = `<div class="s3-counts">${bits.join(' · ') || 'Rien de connu ici.'}</div>
      <div class="s3-hint">Touche un objet</div>
      <div class="s3-acts">${sweepBtn}<button class="s3-act" onclick="SBSystem.reports()">Rapports</button></div>`;
  },

  sweep() {
    const m = launchProbe('radar', this.sysKey, 'local', false);
    if (!m) return;
    if (typeof saveGame === 'function') saveGame();
    this._build(this.sysKey).then(() => this._renderUI());
  },
  reports() { this._fade(() => { if (typeof openProspectAtTab === 'function') openProspectAtTab('rapports'); else goto('prospect'); }); },

  _pick(e) {
    const r = this.r.domElement.getBoundingClientRect();
    const v = new this.T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const hit = this.ray.intersectObjects(this.pick, false)[0];
    this.sel = hit ? hit.object.userData : null;
    this._renderSheet();
  },

  // Cadrage 3/4 vu de dessus : la caméra recule jusqu'à ce que tout le système tienne en largeur et en hauteur
  _frame() {
    const cam = this.cam; if (!cam) return;
    const ext = this.extent || 8, elev = 56 * Math.PI / 180;
    const vt = Math.tan(cam.fov * Math.PI / 360), ht = vt * cam.aspect;
    // demi-largeur visible = D·ht ; demi-hauteur visible ≈ D·vt, l'ellipse projetée mesure ext·sin(elev) en hauteur (+ marge pour la feuille du bas)
    const D = Math.max((ext + 0.6) / ht, (ext * Math.sin(elev) + 0.6) / (vt * 0.72));
    cam.position.set(0, Math.sin(elev) * D, Math.cos(elev) * D);
    cam.lookAt(0, 0, 0.15 * ext);
  },

  _resize() {
    const h = document.getElementById('s3-view'); if (!h) return false;
    const w = h.clientWidth, ht = h.clientHeight; if (!w || !ht) return false;
    if (this._w !== w || this._h !== ht) {
      this._w = w; this._h = ht; this.r.setSize(w, ht, false);
      this.r.domElement.style.width = '100%'; this.r.domElement.style.height = '100%';
      this.cam.aspect = w / ht; this.cam.fov = w < ht ? 42 : 32; this.cam.updateProjectionMatrix();
      this._frame();
    }
    return true;
  },
  _loop: null,
};

SBSystem._loop = function loop(now) {
  const U = SBSystem;
  if (!U.running) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - U._t) / 1000); U._t = now;
  if (document.hidden || !U._resize()) return;
  U.yaw += dt * 0.02;
  U.world.rotation.y = U.yaw;
  const t = now / 1000;
  for (const f of U.anim) f(t, dt);
  U.r.render(U.scene, U.cam);
};

const css = document.createElement('style');
css.textContent = `
  #scr-system{position:fixed;inset:0;background:#03060a;z-index:40}
  #scr-system .s3-view{position:absolute;inset:0}
  #scr-system .s3-view canvas{display:block;width:100%;height:100%}
  #scr-system .s3-ui{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between}
  #scr-system .s3-top{display:flex;justify-content:space-between;align-items:flex-start;padding:calc(var(--sai,0px) + 14px) 16px 0}
  #scr-system .s3-title b{display:block;font:600 13px/1.2 var(--font-mono,monospace);letter-spacing:.2em;color:#e8f0ee;text-transform:uppercase}
  #scr-system .s3-title span{display:block;margin-top:4px;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(190,205,200,.6)}
  #scr-system .s3-x{pointer-events:auto;width:40px;height:40px;border-radius:50%;border:1px solid rgba(120,160,150,.35);background:rgba(5,10,10,.55);color:#e8f0ee;font-size:20px;line-height:1;cursor:pointer;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
  #scr-system .s3-sheet{pointer-events:auto;margin:0 12px calc(var(--sab,0px) + 14px);padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:rgba(6,12,12,.78);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
  #scr-system .s3-counts{font-size:11px;color:var(--txt);letter-spacing:.08em;text-transform:uppercase;font-weight:600}
  #scr-system .s3-hint{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(170,190,185,.4);margin-top:3px}
  #scr-system .s3-acts{display:flex;gap:8px;margin-top:10px}
  #scr-system .s3-act{flex:1;min-height:42px;border-radius:9px;border:1px solid rgba(230,240,255,.5);background:rgba(230,240,255,.08);color:#e6f0ff;font:600 11px/1 inherit;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;font-family:inherit}
  #scr-system .s3-act.dim{border-color:rgba(230,240,255,.22);color:rgba(230,240,255,.6);background:transparent}
  #scr-system .s3-sel .sm-panel{margin:0;border:none;background:transparent;padding:0;min-height:0}
  #scr-system .s3-back{margin-top:10px;background:transparent;border:none;color:var(--cyan);font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;padding:4px 0;font-family:inherit}
  #scr-system .s3-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#03060a;transition:opacity .5s;font-size:9px;letter-spacing:.3em;color:rgba(170,190,205,.5)}
  #scr-system .s3-load.off{opacity:0;pointer-events:none}
  .s3-flash{position:fixed;inset:0;background:#03060a;opacity:0;transition:opacity .26s;z-index:60;pointer-events:none}
  .s3-flash.on{opacity:1}
`;
document.head.appendChild(css);

window.SBSystem = SBSystem;
