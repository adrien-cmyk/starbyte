/* ═══════════════════════════════════════════════════════════════════════
   STARBYTE — LES PLANS D'EXISTENCE · moteur d'affichage de la carte spatiale
   (Adrien, 31/10 → 01/11/2026 · labo/carte-v6 validé, mis en ligne le 01/11)

   Ce fichier ne remplace QUE le dessin de la carte. Le « cerveau » reste
   assets/spacemap.js : il lit la partie (collect), fige les positions
   (G.mapCells), tient les fiches et TOUTES les actions (balayer, balises,
   routes, tankers, flottes…). Ce moteur expose la même interface que
   l'ancien plateau (ready, init, build, paint, setSelection, highlightRoute,
   moveTo, dist, camera, renderer, T) et appelle les mêmes rappels
   (onPick, onPickCell). Il n'écrit RIEN dans la sauvegarde.

   Les plans :
     univers  → les amas (A au centre, B à l'est, Z à l'ouest), au-delà de 30 a.l.
     amas     → la carte : grille hexagonale du jeu, mes systèmes, routes, vols
     système  → le soleil, ses corps en orbite (signatures, gisements, mondes, station)
     monde    → vu d'orbite basse, vue fixe ; ma planète ouvre mon plateau
     station  → le modèle 3D, arrivée à 500 m = sa fiche
     ligne    → une ligne de convois : jalons, convois vus, escortes, ma flotte
     formation→ un convoi ou une flotte de près (vrais modèles)
     balise   → une balise en écoute
     gisement → un gisement (cible) de près
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const K = 2.4;                       // 1 case du jeu (50) = 120 unités ici (échelle du labo validé)
  const DIST_TO_H = 2.1;               // distance de l'ancien plateau → hauteur de caméra
  const TILT = 0.62;
  const LY = 9.461e15;
  const STATION_GLB = {
    'dock-37oe89': 'sb_dc02.glb', 'dock-otqflf': 'sb_sc01.glb', 'dock-uguzli': 'sb_on01.glb', 'dock-wc15ki': 'sb_er01.glb', 'dock-o3pz0b': 'sb_vy01.glb',
    'dock-smt2z6': 'sb_ml01.glb', 'dock-uzt7ha': 'sb_gi01.glb', 'dock-xy2s3': 'sb_pk01.glb', 'dock-wldphp': 'sb_da01.glb', 'dock-3c8na': 'sb_mo01.glb',
  };
  const SCRIPT_URL = (document.currentScript && document.currentScript.src) || location.href;

  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sysOf = (c) => String(c || '').toUpperCase().split('/')[0].split('-').slice(0, 3).join('-');
  const okSys = (k) => /^[A-Z]-[A-Z]-\d{4}$/.test(k || '');
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };

  function fmtLen(m) {
    if (m >= LY * 0.5) return (m / LY).toFixed(m / LY < 10 ? 1 : 0) + ' a.l.';
    if (m >= 1e9) return Math.round(m / 1e9).toLocaleString('fr-CH') + ' millions de km';
    if (m >= 1e3) return Math.round(m / 1e3).toLocaleString('fr-CH') + ' km';
    if (m >= 1) return Math.round(m) + ' m';
    if (m >= 0.01) return Math.round(m * 100) + ' cm';
    if (m >= 1e-5) return Math.round(m * 1e6) + ' µm';
    if (m >= 1e-34) return '10⁻' + Math.round(-Math.log10(m)) + ' m';
    return '≈ longueur de Planck';
  }
  const escN = (e) => typeof e === 'number' ? e : !e ? 0 : /aucune|sans|none/i.test(e) ? 0 : /lourde|heavy|forte/i.test(e) ? 4 : /légère|legere|light|faible/i.test(e) ? 1 : 2;
  const escTxt = (e) => typeof e === 'number' ? (e ? 'escorte ' + e : 'sans escorte') : (e ? String(e) : 'sans escorte');

  function engine(ctx) {
    const { CELLS, onPick, onPickCell, cellAtWorld, mySystemKey, waitSB3D, fail } = ctx;
    let scrEl = null, T = null, renderer = null, camera = null, host = null, fx = null, fxc = null, hud = null, upBtn = null, card = null;
    let lite = false;
    const texCache = {};
    const PLANS = {};
    let plan = null, stack = [], trans = null, ST = null, AMAS = null, UNIV = null;
    let tx = 0, tz = 0, h = 1300, gx = 0, gz = 0, gh = 1300;
    let zoomPt = { x: 0, y: 0 };
    let selIdx = -1, selCk = null, hiRoute = null, buildN = 0;
    let tOff = 0, lastNow = 0, ferr = 0, offZ = 0, oldCard = null, destroyed = false, lastCheck = 0, ro = null, onLost = null, amasH = 1300, subErr = 0;
    const safeFail = (why) => { if (!destroyed) fail(why); };

    /* ───────────── outils de dessin ───────────── */
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
    const W = (i) => { const c = CELLS[i]; return c ? { x: c.x * K, z: c.z * K } : { x: 0, z: 0 }; };
    function glow(a = 'rgba(255,255,255,1)', b = 'rgba(255,200,120,.5)') {
      const k = a + b; if (texCache[k]) return texCache[k];
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, a); g.addColorStop(0.25, b); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.userData = { shared: true }; return (texCache[k] = t);
    }
    function spikeTex() {
      if (texCache.spike) return texCache.spike;
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,240,220,.85)'); g.addColorStop(0.3, 'rgba(255,200,150,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256); x.globalCompositeOperation = 'lighter';
      for (const [a, w, l] of [[0, 2.2, 128], [Math.PI / 2, 2.2, 128], [Math.PI / 4, 1, 70], [-Math.PI / 4, 1, 70]]) {
        x.save(); x.translate(128, 128); x.rotate(a); const lg = x.createLinearGradient(-l, 0, l, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,250,240,.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = lg; x.fillRect(-l, -w / 2, l * 2, w); x.restore();
      }
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.userData = { shared: true }; return (texCache.spike = t);
    }
    function spr(tex, s, color = 0xffffff, op = 1) { const m = new T.Sprite(new T.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending })); m.scale.setScalar(s); return m; }
    function label(text, color = '#cfe6ff', size = 1) {
      const c = document.createElement('canvas'), x = c.getContext('2d'); const F = '600 34px -apple-system, "Space Grotesk", system-ui, sans-serif'; x.font = F;
      const w = Math.ceil(x.measureText(text).width) + 20; c.width = Math.max(8, w); c.height = 48; x.font = F; x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 10, 25);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
      const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.center.set(0.5, 0); s.userData.k = size; s.userData.ar = c.width / 48; s.renderOrder = 10; return s;
    }
    function dust(n, R, seed, size = 1.2, op = 0.8, spread = 0.15) {
      n = lite ? Math.round(n * 0.5) : n;
      const r = rng(seed), p = new Float32Array(n * 3), c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { p.set([(r() - 0.5) * R * 2, -R * spread * (0.3 + r()), (r() - 0.5) * R * 2], i * 3); const w = 0.4 + r() * 0.6; c.set([w * 0.85, w * 0.9, w], i * 3); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('color', new T.BufferAttribute(c, 3));
      return new T.Points(g, new T.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: op, depthWrite: false }));
    }
    function rockGeo(seed, detail = 1) {
      const g = new T.IcosahedronGeometry(1, detail), p = g.attributes.position, R = rng(seed), v = new T.Vector3();
      const k1 = V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), k2 = V(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 + 0.26 * Math.sin(v.dot(k1) * 3.3) + 0.14 * Math.sin(v.dot(k2) * 6.1) + (R() - 0.5) * 0.1); v.y *= 0.75; p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); return g;
    }
    const sceneBase = (bg) => { const s = new T.Scene(); s.background = new T.Color(bg); return s; };
    function cross(size, col = 0xc89bff) { return new T.LineSegments(new T.BufferGeometry().setFromPoints([V(-size, 0, 0), V(size, 0, 0), V(0, 0, -size), V(0, 0, size)]), new T.LineBasicMaterial({ color: col })); }
    function smooth(pts, it = 3) {
      let p = pts.map(q => ({ x: q.x, z: q.z })); if (p.length < 3) return p;
      for (let n = 0; n < it; n++) { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; if (i > 0) o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }); if (i < p.length - 2) o.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 }); } o.push(p[p.length - 1]); p = o; }
      return p;
    }
    function disposeTree(o) {
      o.traverse((x) => {
        if (x.geometry && !x.isSprite && !x.geometry.userData.shared) x.geometry.dispose();
        const ms = x.material ? (Array.isArray(x.material) ? x.material : [x.material]) : [];
        for (const m of ms) { if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose(); if (!m.userData.shared) m.dispose(); }
      });
    }
    function clearGroup(g) { while (g.children.length) { const o = g.children.pop(); disposeTree(o); } }

    // étoile « à contempler » : granulation qui bouge, bord assombri, couronne, aigrettes (WebGL1 et 2)
    const SUN_FS = `
      uniform float uT; uniform vec3 uHot, uMid, uCool; varying vec3 vN; varying vec3 vV;
      vec3 h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(vec3(p.x*p.y*p.z, p.x+p.y*p.z, p.x*p.y+p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
        return mix(mix(mix(h3(i).x, h3(i+vec3(1,0,0)).x, f.x), mix(h3(i+vec3(0,1,0)).x, h3(i+vec3(1,1,0)).x, f.x), f.y),
                   mix(mix(h3(i+vec3(0,0,1)).x, h3(i+vec3(1,0,1)).x, f.x), mix(h3(i+vec3(0,1,1)).x, h3(i+vec3(1,1,1)).x, f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
      void main(){ vec3 n = normalize(vN); vec3 p = n * 3.2; float w = fbm(p + vec3(uT * .05, uT * .03, 0.)); float g = fbm(p * 2.6 + w * 1.8 - vec3(0., uT * .08, 0.));
        float cells = smoothstep(.35, .75, g); float mu = clamp(dot(normalize(vV), n), 0., 1.);
        vec3 col = mix(uMid, uHot, cells); col = mix(uCool, col, smoothstep(0., .55, mu)); col *= .55 + .75 * pow(mu, .45);
        float spots = smoothstep(.72, .78, fbm(p * .9 + 11.3)); col *= 1. - spots * .6;
        gl_FragColor = vec4(col * 1.2, 1.); }`;
    const SUN_VS = 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
    function makeSun(r, tint = 0xffd9a0) {
      const g = new T.Group(), c = new T.Color(tint);
      const mat = new T.ShaderMaterial({ uniforms: { uT: { value: 0 }, uHot: { value: new T.Color(1, 0.97, 0.86) }, uMid: { value: c.clone().multiplyScalar(1.05) }, uCool: { value: c.clone().multiplyScalar(0.42).lerp(new T.Color(0.6, 0.12, 0.02), 0.5) } }, vertexShader: SUN_VS, fragmentShader: SUN_FS });
      const ball = new T.Mesh(new T.SphereGeometry(r, lite ? 32 : 56, lite ? 20 : 36), mat); g.add(ball);
      const c1 = spr(glow('rgba(255,250,235,.9)', 'rgba(255,190,110,.35)'), r * 3.4, tint, 0.55), c2 = spr(glow('rgba(255,210,160,.35)', 'rgba(255,140,60,.07)'), r * 8, tint, 0.32);
      const sp = spr(spikeTex(), r * 9, 0xffffff, 0.5); g.add(c1, c2, sp);
      g.userData.tick = (t) => { mat.uniforms.uT.value = t; ball.rotation.y = t * 0.03; sp.material.rotation = Math.sin(t * 0.1) * 0.05; c1.material.opacity = 0.5 + 0.06 * Math.sin(t * 1.3); };
      return g;
    }

    /* ───────────── plan de l'amas : la carte ───────────── */
    const GRID_FS = `
      uniform float uCell, uLensR, uTime, uLit; uniform vec2 uLens; varying vec2 vP;
      vec2 hexd(vec2 P, float C) { float H = 0.8660254; float r = P.y / (C * H), q = P.x / C - r * 0.5, s = -q - r;
        float rq = floor(q + .5), rr = floor(r + .5), rs = floor(s + .5); float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
        vec2 p = P - vec2(C * (rq + rr * .5), C * H * rr); float e = max(abs(p.x), max(abs(dot(p, vec2(.5, H))), abs(dot(p, vec2(.5, -H)))));
        return vec2(C * .5 - e, max(fwidth(e), 1e-4)); }
      void main() { vec2 f = hexd(vP, uCell); float line = 1. - smoothstep(f.y * .4, f.y * 1.4, f.x);
        float lens = 1. - smoothstep(uLensR * .25, uLensR, length(vP - uLens));
        float home = (1. - smoothstep(uCell * .6, uCell * 2.6, length(vP))) * .55;
        float d = length(vP - uLens) / (uLensR * 2.2);
        float ph = fract(uTime * .18 - d); float ping = smoothstep(.0, .25, ph) * (1. - ph) * lens;
        float lit = 1. - smoothstep(uLit - uCell * .4, uLit + uCell * .6, length(vP)) * .55;
        float a = line * max(lens * .55 + ping * .5, home) * lit;
        gl_FragColor = vec4(vec3(.45, .78, 1.) * a, a); }`;
    function makeGrid() {
      const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
        uniforms: { uCell: { value: 50 * K }, uLensR: { value: 50 * K * 3.6 }, uTime: { value: 0 }, uLens: { value: new T.Vector2() }, uLit: { value: 99999 } },
        vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: GRID_FS });
      if (m.extensions) m.extensions.derivatives = true;
      const g = new T.Mesh(new T.PlaneGeometry(9000, 9000), m); g.rotation.x = -Math.PI / 2; g.position.y = -1.5; return g;
    }

    function homeNameOf() {
      return safe(() => {
        if ((G.activeWorld || 'home') === 'home') return G.planet.name;
        const w = (G.worlds || []).find(x => x && x.id === 'home'); return (w && w.data && w.data.planet && w.data.planet.name) || G.planet.name;
      }, 'Ma planète') || 'Ma planète';
    }
    function colonyWorldAt(key) { return safe(() => (G.worlds || []).find(w => w && w.id !== 'home' && w.coord && sysOf(w.coord) === key), null); }

    function makeAmas() {
      const S = sceneBase(0x01030a); S.add(dust(7000, 5200, 3, 1.05, 0.6));
      const grid = makeGrid(); S.add(grid);
      for (const [x, z, c] of [[-7000, -4000, 0x6a4cff], [8000, 2500, 0x2fb0a0], [1500, 8500, 0xff7a5a]]) for (let k = 0; k < 5; k++) S.add(at(spr(glow('rgba(255,255,255,.45)', 'rgba(255,255,255,.08)'), 2600 + k * 700, c, 0.1), x + k * 300, -6, z - k * 200));
      { const r = rng(hash(safe(() => mySystemKey(), 'A'))); const cols = [0x2f6fb0, 0x6a3fb0, 0xb0603f, 0x2fa08a, 0x8a3f6a];
        for (let z = 0; z < 10; z++) { const cx = (r() - 0.5) * 5200, cz = (r() - 0.5) * 5200, rad = 380 + r() * 520, col = cols[z % cols.length];
          for (let k = 0; k < 6; k++) S.add(at(spr(glow('rgba(255,255,255,.45)', 'rgba(255,255,255,.08)'), rad * (1 + r()), col, 0.1), cx + (r() - 0.5) * rad, -4, cz + (r() - 0.5) * rad)); } }
      const content = new T.Group(); S.add(content);
      // sélection : un hexagone cyan sur la case
      const selPts = []; const R = 50 * K / Math.sqrt(3) * 0.97; for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; selPts.push(V(Math.cos(a) * R, 0, Math.sin(a) * R)); }
      const sel = new T.Line(new T.BufferGeometry().setFromPoints(selPts), new T.LineBasicMaterial({ color: 0x5fffe8, transparent: true, opacity: 0.9 })); sel.visible = false; S.add(sel);
      const P = {
        key: 'amas', kind: 'amas', scene: S, unit: 6e13, hMin: 40, hMax: 3950, h0: 1300, bounds: 4200, title: 'Amas ' + safe(() => mySystemKey().split('-')[0], 'A'),
        hint: 'Touche une case ou un objet · pince vers un système pour y entrer · dézoome au-delà de 30 années-lumière : les amas',
        content, grid, sel, suns: [], flights: [], legs: [], sysPos: {}, routeLines: {},
        update(t, hh) {
          const u = grid.material.uniforms; u.uTime.value = t; u.uLens.value.set(tx, tz);
          const pt = hh * 0.012, near = clamp((900 - hh) / 700, 0, 1);
          for (const g of this.suns) { const d = g.userData;
            if (d.home) { const s = Math.max(16, hh * 0.032) * (1 + 0.08 * Math.sin(t * 3)); d.ring.scale.setScalar(s); d.core.scale.setScalar(Math.max(8, hh * 0.016)); d.lb.position.set(0, s * 0.9, 0); continue; }
            const base = Math.max(5, pt) * (d.dim ? 0.7 : 1);
            d.core.scale.setScalar(base); d.halo.scale.setScalar(base * 5); d.halo.material.opacity = (d.dim ? 0.2 : 0.45) * near;
            if (d.ring) { d.ring.scale.setScalar(Math.max(14, pt * 2.4)); d.ring.rotation.z = t * 0.3; }
            if (d.starRing) d.starRing.scale.setScalar(Math.max(10, pt * 1.8));
            if (d.tick) { d.tick.scale.setScalar(Math.max(2.2, pt * 0.42)); d.tick.position.set(base * 0.9, 0.5, -base * 0.6); }
            if (d.cross) d.cross.scale.setScalar(Math.max(1, hh / 900));
            if (d.pulse) { const k = (t * 0.4 + d.ph) % 1; d.pulse.scale.setScalar(base * (1.2 + k * 3)); d.pulse.material.opacity = 0.5 * (1 - k); }
            if (d.lb) { d.lb.position.set(0, base * 1.3, 0); d.lb.material.opacity = d.lb.userData.always ? 1 : clamp((1100 - hh) / 400, 0, 1); }
          }
          const n = Date.now();
          for (const f of this.flights) { const k = (f.t1 > f.t0 && isFinite(f.t0)) ? clamp((n - f.t0) / (f.t1 - f.t0), 0, 1) : 0.5; const p = f.at(k); f.dot.position.set(p.x, 0.8, p.z); f.lb.position.set(p.x, 8, p.z); f.dot.scale.setScalar(Math.max(10, hh * 0.014)); f.x = p.x; f.z = p.z; }
          for (const l of this.legHits) if (l.arrow) l.arrow.scale.setScalar(Math.max(1, hh / 700));
          if (sel.visible) sel.material.opacity = 0.65 + 0.25 * Math.sin(t * 2.4);
        },
      };
      P.legHits = [];
      return P;
    }

    function buildAmas(P, st) {
      clearGroup(P.content);
      P.suns = []; P.flights = []; P.legHits = []; P.sysPos = {}; P.routeLines = {};
      const C = P.content, home = st.home;
      const lit = (st.lit || 5) + 0.5; P.grid.material.uniforms.uLit.value = lit * 50 * K;
      // position d'un système : sa case, avec un léger décalage stable (pas une grille rigide)
      const posOf = (k) => {
        if (P.sysPos[k]) return P.sysPos[k];
        const ci = st.cell['sys:' + k]; if (ci === undefined) return null;
        const c = W(ci);
        if (k === home) return (P.sysPos[k] = { x: 0, z: 0, ci: 0 });
        const j = rng(hash('j' + k)); const a = j() * Math.PI * 2, d = (0.1 + j() * 0.22) * 50 * K;
        return (P.sysPos[k] = { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, ci });
      };
      // cases dégagées : celles de mes systèmes connus, à peine plus claires que le noir
      { const occ = []; for (const [idx, o] of st.occ) { const s = st.systems[o.key]; if (o.kind === 'system' && s && s.known) occ.push(idx); }
        if (occ.length) { const hexG = new T.CircleGeometry(50 * K / Math.sqrt(3) * 0.985, 6); hexG.rotateZ(Math.PI / 6 + Math.PI / 2); hexG.rotateX(-Math.PI / 2);
          const im = new T.InstancedMesh(hexG, new T.MeshBasicMaterial({ color: 0x0f2236, transparent: true, opacity: 0.45, depthWrite: false }), occ.length);
          const m4 = new T.Matrix4(); occ.forEach((i, n) => { const c = W(i); m4.makeTranslation(c.x, -2, c.z); im.setMatrixAt(n, m4); }); C.add(im); } }
      const STAR = [0xffe6c0, 0xfff4e0, 0xffc890, 0xc8dcff];
      for (const s of Object.values(st.systems)) {
        const p = posOf(s.key); if (!p) continue;
        const g = new T.Group(); g.position.set(p.x, 0, p.z); C.add(g);
        const list = (st.items && st.items[s.key]) || [];
        if (s.key === home) {
          const ring = new T.Mesh(new T.RingGeometry(1, 1.12, 64), new T.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; g.add(ring);
          const core = spr(glow('rgba(255,255,255,1)', 'rgba(127,208,255,.7)'), 1, 0x9fdcff); g.add(core);
          const lb = label('TU ES ICI · ' + String(homeNameOf()).toUpperCase(), '#9fdcff', 1.25); lb.userData.always = true; g.add(lb);
          g.userData = { ring, core, lb, home: true }; P.suns.push(g);
          if (s.beacons && s.beacons.length) { const cr = cross(9); cr.position.set(22, 0.6, -18); g.add(cr); }
          continue;
        }
        const li = s.li || null, port = li && li.port, tag = (G.systemTags || {})[s.key];
        const col = s.colony ? 0x9fe08a : port ? 0xffb066 : tag === 'skip' ? 0xb05a50 : STAR[hash(s.key) % 4];
        const dim = !s.known || tag === 'skip';
        const core = spr(glow('rgba(255,255,250,1)', 'rgba(255,200,140,.35)'), 1, col, dim ? 0.55 : 1), halo = spr(glow('rgba(255,220,170,.35)', 'rgba(255,150,70,.06)'), 1, col, 0); g.add(core, halo);
        const ud = { core, halo, dim, ph: (hash(s.key) % 100) / 100 };
        if (port) { const ring = new T.Mesh(new T.RingGeometry(1, 1.15, 6), new T.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; g.add(ring); ud.ring = ring; }
        if (tag === 'star') { const r2 = new T.Mesh(new T.RingGeometry(1, 1.08, 48), new T.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false })); r2.rotation.x = -Math.PI / 2; g.add(r2); ud.starRing = r2; }
        const has = (k) => list.some((it) => it.kind === k && !(k === 'sig' && it.obj && it.obj.resolved));
        const hasPlayer = list.some((it) => it.kind === 'planet' && it.obj && it.obj.playerName);
        const tk = tag === 'skip' ? null : hasPlayer ? 0xff7a6a : has('sig') ? 0x8fc4ff : has('target') ? 0xffc864 : list.some((it) => it.kind === 'planet') ? 0xb8a8ff : null;
        const tk2 = tk || (!port && li && (li.lane || (li.obs || []).length) ? 0xffc864 : null);   // couloir de passage (comme l'ancienne carte)
        if (tk2) { const d = spr(glow('rgba(255,255,255,1)', 'rgba(255,255,255,.4)'), 2.4, tk2, 1); g.add(d); ud.tick = d; }
        if (s.scanning || (li && li.echo && !(s.beacons && s.beacons.length))) { const w = new T.Mesh(new T.RingGeometry(0.92, 1, 48), new T.MeshBasicMaterial({ color: s.scanning ? 0xcfdcea : 0xffc864, transparent: true, side: T.DoubleSide, depthWrite: false })); w.rotation.x = -Math.PI / 2; w.position.y = 0.4; g.add(w); ud.pulse = w; }
        if (s.beacons && s.beacons.length) { const cr = cross(9); cr.position.set(18, 0.6, -16); g.add(cr); ud.cross = cr; }
        if ((s.posts || []).length || (s.others || []).length) { const d = new T.Mesh(new T.OctahedronGeometry(3.2, 0), new T.MeshBasicMaterial({ color: (s.posts || []).length ? 0xffc864 : 0xff9a6a })); d.scale.set(1, 1.5, 1); d.position.set(-16, 2, 10); g.add(d); }
        const nsig = (s.sigs || []).filter(x => !x.resolved).length;
        const name = s.colony ? String(s.colony).toUpperCase() + ' · ' : port ? String(port.name || 'Station').toUpperCase() + ' · ' : '';
        const lb = label(name + s.key + (nsig ? `  ·  ${nsig} sig.` : ''), port ? '#ffcf96' : s.colony ? '#bff0b0' : dim ? '#9a9088' : '#e8d8b8', port ? 1.2 : 0.95);
        if (port || s.colony) lb.userData.always = true; g.add(lb); ud.lb = lb;
        g.userData = ud; P.suns.push(g);
      }
      // colonies reliées à la capitale par un fil
      for (const s of Object.values(st.systems)) if (s.colony) { const p = posOf(s.key); if (!p) continue; const l = new T.Line(new T.BufferGeometry().setFromPoints([V(0, 0.2, 0), V(p.x, 0.2, p.z)]), new T.LineDashedMaterial({ color: 0x7fd0ff, dashSize: 10, gapSize: 10, transparent: true, opacity: 0.35 })); l.computeLineDistances(); C.add(l); }
      // routes (mes routes, lignes remontées, routes ouvertes)
      const cellPt = (i) => { for (const [k, q] of Object.entries(P.sysPos)) if (q.ci === i) return q; return W(i); };
      for (const rt of st.routes || []) {
        if (rt.broken || !rt.path || rt.path.length < 2) continue;
        const pts = smooth(rt.path.map(cellPt)).map(q => V(q.x, 0.9, q.z));
        const ln = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: new T.Color(rt.r.color || '#ffc864'), transparent: true, opacity: 0.75, depthWrite: false })); C.add(ln);
        P.routeLines[rt.r.id] = ln;
        for (let i = 1; i < rt.path.length - 1; i++) { const c = cellPt(rt.path[i]); const tg = label(String(i), rt.r.color || '#ffc864', 0.7); tg.position.set(c.x - 20, 2, c.z - 16); C.add(tg); }
      }
      for (const hn of st.hints || []) { const A = cellPt(hn.path[0]), B = cellPt(hn.path[1]); const l = new T.Line(new T.BufferGeometry().setFromPoints([V(A.x, 0.7, A.z), V(B.x, 0.7, B.z)]), new T.LineDashedMaterial({ color: 0xff8a5a, dashSize: 4, gapSize: 14, transparent: true, opacity: 0.3, depthWrite: false })); l.computeLineDistances(); C.add(l);
        if (hn.gap > 0) { const tg = label(hn.gap > 1 ? hn.gap + ' jalons ?' : '1 jalon ?', '#ff8a5a', 0.7); tg.position.set((A.x + B.x) / 2, 2, (A.z + B.z) / 2); C.add(tg); } }
      for (const tp of st.trade || []) { const A = cellPt(tp.path[0]), B = cellPt(tp.path[1]); C.add(new T.Line(new T.BufferGeometry().setFromPoints([V(A.x, 0.9, A.z), V(B.x, 0.9, B.z)]), new T.LineBasicMaterial({ color: 0xffc864, transparent: true, opacity: 0.8 })));
        const tg = label(tp.pseudo || '', '#ffc864', 0.8); tg.position.set((A.x + B.x) / 2, 2, (A.z + B.z) / 2); C.add(tg); }
      // tronçons relevés par mes balises : une flèche par paire (sens connu), on peut les toucher
      { const pairs = new Map(); const net = window.SBLines && SBLines.network ? safe(() => SBLines.network(), null) : null;
        const onRouteSeg = new Set(); for (const rt of st.routes || []) if (rt.line && !rt.broken) for (let i = 0; i < rt.path.length - 1; i++) { const x = rt.path[i], y = rt.path[i + 1]; onRouteSeg.add(x < y ? x + ':' + y : y + ':' + x); }
        for (const sp0 of st.spotted || []) {
          if (!sp0.path || sp0.path.length < 2) continue; let sp = sp0, npcDir = false;
          if (sp0.l.npc && net && net.byId && net.byId[sp0.l.lineId]) { const ln = net.byId[sp0.l.lineId], ix = (k) => k === ln.port ? ln.chain.length : ln.chain.indexOf(k); const fi = ix(sp0.l.from), ti = ix(sp0.l.to); if (fi >= 0 && ti >= 0) { npcDir = true; if (fi > ti) sp = { l: sp0.l, path: sp0.path.slice().reverse() }; } }
          const a0 = sp.path[0], b0 = sp.path[sp.path.length - 1], key = a0 < b0 ? a0 + ':' + b0 : b0 + ':' + a0;
          const e = pairs.get(key); if (e) { if (!npcDir && !e.npcDir && e.sp.path[0] !== a0) e.both = true; e.alt.push(sp.l); } else pairs.set(key, { sp, both: false, npcDir, onRoute: sp.l.npc && onRouteSeg.has(key), alt: [] });
        }
        for (const { sp, both, onRoute } of pairs.values()) {
          const A = cellPt(sp.path[0]), B = cellPt(sp.path[sp.path.length - 1]), npc = !!sp.l.npc, col = npc ? 0xff9a6a : 0xffc864;
          if (!onRoute) { const ln = new T.Line(new T.BufferGeometry().setFromPoints([V(A.x, 0.3, A.z), V(B.x, 0.3, B.z)]), new T.LineDashedMaterial({ color: col, dashSize: 14, gapSize: 9, transparent: true, opacity: 0.7 })); ln.computeLineDistances(); C.add(ln); }
          let arrow = null;
          if (!both) { arrow = new T.Group(); const cone = new T.Mesh(new T.ConeGeometry(5, 13, 3), new T.MeshBasicMaterial({ color: col })); cone.rotation.x = Math.PI / 2; arrow.add(cone); arrow.position.set(A.x + (B.x - A.x) * 0.55, 0.3, A.z + (B.z - A.z) * 0.55); arrow.rotation.y = Math.atan2(B.x - A.x, B.z - A.z); C.add(arrow); }
          P.legHits.push({ id: sp.l.id, lineId: sp.l.lineId || (sp.l.convoyId ? 'cv:' + sp.l.convoyId : null), npc, pseudo: sp.l.pseudo, ax: A.x, az: A.z, bx: B.x, bz: B.z, from: sp.l.from, to: sp.l.to, arrow });
        }
      }
      // missions en vol
      for (const f of st.flights || []) {
        const c = f.kind === 'imperial' ? 0xff3a2a : f.kind === 'tanker' ? 0xffc864 : f.kind === 'fleet' ? 0xff6a5a : (f.tier === 'radar' ? 0xe6f0ff : f.tier === 'medium' ? 0x9a8aff : 0x7fd0ff);
        let raw = (f.path && f.path.length > 1 ? f.path : [f.from, f.to]).map(cellPt);
        if (f.toCk && st.cell[f.toCk] !== undefined) raw[raw.length - 1] = cellPt(st.cell[f.toCk]);
        const pts = raw.length > 2 ? smooth(raw) : raw;
        const ln = new T.Line(new T.BufferGeometry().setFromPoints(pts.map(q => V(q.x, 0.3, q.z))), new T.LineDashedMaterial({ color: c, dashSize: 8, gapSize: 8, transparent: true, opacity: 0.4 })); ln.computeLineDistances(); C.add(ln);
        const segL = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); segL.push(d); tot += d; }
        const atK = (k) => { let d = k * tot; for (let i = 0; i < segL.length; i++) { if (d <= segL[i] || i === segL.length - 1) { const u = segL[i] ? clamp(d / segL[i], 0, 1) : 0; return { x: lerp(pts[i].x, pts[i + 1].x, u), z: lerp(pts[i].z, pts[i + 1].z, u) }; } d -= segL[i]; } return pts[pts.length - 1]; };
        const dot = spr(glow('rgba(255,255,255,1)', 'rgba(127,208,255,.6)'), 14, c); C.add(dot);
        const lb = label(f.label || '', '#' + new T.Color(c).getHexString(), 0.9); lb.userData.always = true; C.add(lb);
        P.flights.push({ id: f.id, kind: f.kind, fleetId: f.fleetId, t0: f.departedAt || 0, t1: f.arrivalAt || 0, at: atK, dot, lb, x: pts[0].x, z: pts[0].z });
      }
      applySel(P);
      applyRouteHi(P);
    }
    function applySel(P) {
      if (!P || !P.sel) return;
      if (selIdx > 0) { const p = Object.values(P.sysPos).find(q => q.ci === selIdx) || W(selIdx); P.sel.position.set(p.x, 0.6, p.z); P.sel.visible = true; }
      else P.sel.visible = false;
    }
    function applyRouteHi(P) { if (!P || !P.routeLines) return; for (const [id, l] of Object.entries(P.routeLines)) { l.material.opacity = hiRoute ? (id === hiRoute ? 1 : 0.3) : 0.75; } }

    /* ───────────── plan du système ───────────── */
    const PLANET_COLS = { type1: 0xb9b2a9, type2: 0x9b6a4e, type3: 0x3f86a2, type4: 0xd9a066, type5: 0x6c6c74 };
    const SIG_CLASS = { dead_world: 'type5', gas_giant: 'type4', habitable: 'type3', lunar: 'type1', unknown: 'type2' };
    let _gl = null, _meshopt = null;
    function loader() {
      if (_gl) return _gl;
      const L = window.SB3D && SB3D.GLTFLoader; if (!L) return Promise.reject(new Error('GLTFLoader absent'));
      _gl = import(new URL('meshopt_decoder.module.js', SCRIPT_URL).href).then((m) => { const l = new L(); if (l.setMeshoptDecoder && m.MeshoptDecoder) l.setMeshoptDecoder(m.MeshoptDecoder); return l; })
        .catch(() => new L());
      return _gl;
    }
    const glbCache = {};
    function loadGLB(file) {
      if (glbCache[file]) return glbCache[file];
      return (glbCache[file] = loader().then(l => new Promise((ok, ko) => l.load(new URL('3d/' + file, SCRIPT_URL).href, ok, undefined, ko))).catch((e) => { delete glbCache[file]; throw e; }));
    }
    function glbFor(port) {
      if (port && port.dockId && STATION_GLB[port.dockId]) return STATION_GLB[port.dockId];
      const n = String((port && port.name) || '').toLowerCase();
      return /erebus|brest|refuge/.test(n) ? 'sb_er01.glb' : /crown|couronne/.test(n) ? 'sb_dc02.glb' : /sanctuaire|linceul/.test(n) ? 'sb_sc01.glb' : /noire|o.neill/.test(n) ? 'sb_on01.glb' : 'sb_er01.glb';
    }
    function fitModel(src, size) {
      const m = src.clone(true); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
      const box = new T.Box3().setFromObject(m), sz = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3()), k = size / Math.max(sz.x, sz.y, sz.z, 1e-6);
      m.scale.setScalar(k); m.position.sub(c.multiplyScalar(k)); m.traverse(o => { if (o.geometry) o.geometry.userData.shared = true; if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { mm.userData.shared = true; if (mm.map) mm.map.userData = Object.assign(mm.map.userData || {}, { shared: true }); }); });
      return m;
    }
    let _env = null;
    function envMap() {
      if (lite) return null;
      if (_env) return _env;
      try { const R = window.SB3D && SB3D.RoomEnvironment; if (!R) return null; const pm = new T.PMREMGenerator(renderer); _env = pm.fromScene(new R(), 0.04).texture; pm.dispose(); } catch (e) { _env = null; }
      return _env;
    }
    function systemBodies(key) {
      const st = ST; if (!st) return [];
      const s = st.systems[key]; if (!s) return [];
      const out = [];
      if (key === st.home) out.push({ kind: 'mine', key: 'home', name: homeNameOf(), wid: 'home' });
      if (s.colony) { const w = colonyWorldAt(key); if (w) out.push({ kind: 'mine', key: w.id, name: w.name || s.colony, wid: w.id }); }
      for (const it of (st.items && st.items[key]) || []) out.push({ kind: it.kind, key: it.key, ck: it.ck, obj: it.obj });
      const port = s.li && s.li.port; if (port) out.push({ kind: 'station', key: 'station:' + key, port });
      return out;
    }
    function bodyName(b) {
      if (b.kind === 'mine') return (b.wid === 'home' ? 'TA CAPITALE · ' : 'TA COLONIE · ') + String(b.name || '').toUpperCase();
      if (b.kind === 'station') return String(b.port.name || 'Station').toUpperCase();
      if (b.kind === 'sig') { const g = b.obj || {}; return (g.id || 'SIG') + ' · ' + String(g.resolved ? (g.fixedClass || 'corps fixe').replace(/_/g, ' ') : (g.typeLabel || 'écho')).toUpperCase(); }
      if (b.kind === 'target') { const kt = (b.obj && b.obj.kt) || {}; return String(kt.label || kt.name || 'GISEMENT').toUpperCase(); }
      if (b.kind === 'planet') { const pl = b.obj || {}; return String(pl.playerName ? pl.playerName + ' · ' + (pl.coord || '') : (pl.name || pl.coord || 'MONDE')).toUpperCase(); }
      return '';
    }
    function makeSystem(key) {
      const s = ST && ST.systems[key]; const seed = hash(key), S = sceneBase(0x01020a);
      S.add(dust(2600, 1600, seed, 1, 0.5));
      S.add(new T.AmbientLight(0x223044, 1.4)); S.add(new T.PointLight(0xffe0b0, 3, 0, 0));
      const port = s && s.li && s.li.port;
      const sun = makeSun(10, port ? 0xffb066 : 0xffd29a); S.add(sun);
      const bodiesG = new T.Group(); S.add(bodiesG);
      const ring = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({ length: 41 }, (_, i) => V(Math.cos(i / 40 * Math.PI * 2) * 9, 0, Math.sin(i / 40 * Math.PI * 2) * 9))), new T.LineDashedMaterial({ color: 0x5fffe8, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.85 })); ring.computeLineDistances(); ring.visible = false; S.add(ring);
      const P = { key: 'sys:' + key, sys: key, kind: 'systeme', scene: S, unit: 3e9, hMin: 7, hMax: 900, h0: 560, bounds: 460, title: (s && s.colony) ? s.colony : port ? (port.name || 'Station') : 'Système ' + key,
        hint: 'Le soleil au centre, les corps en orbite · touche un corps pour sa fiche · pince dessus pour t’en approcher',
        items: [], orbiters: [], bodiesG, ring, fp: '', sun,
        update(t, hh, dt) { sun.userData.tick(t); for (const o of this.orbiters) { o.ang += o.spd * dt; o.x = Math.cos(o.ang) * o.rad; o.z = Math.sin(o.ang) * o.rad; o.mesh.position.set(o.x, 0, o.z); if (o.spin) { o.spin.rotation.y = t * 0.6; o.spin.rotation.x = t * 0.3; } }
          if (ring.visible && this.selO) { ring.position.set(this.selO.x, 0.2, this.selO.z); ring.scale.setScalar(1 + 0.05 * Math.sin(t * 3)); } },
        refresh() { const fp = JSON.stringify(systemBodies(key).map(b => b.kind + b.key + (b.obj && b.obj.resolved ? 'r' : ''))) + ((ST.systems[key] || {}).beacons || []).length; if (fp !== this.fp) { this.fp = fp; fillSystem(this, key); } },
      };
      P.refresh();
      const maxR = P.orbiters.reduce((m, o) => Math.max(m, o.rad), 0);
      P.hMax = Math.max(900, maxR * 6); P.h0 = Math.max(560, maxR * 4.4); P.bounds = Math.max(460, maxR);
      return P;
    }
    function fillSystem(P, key) {
      clearGroup(P.bodiesG); P.items = []; P.orbiters = [];
      const R = rng(hash(key)), list = systemBodies(key);
      const s = ST.systems[key] || {};
      list.forEach((b, i) => {
        const rad = (b.kind === 'station' ? 196 : 78) + i * 46 + R() * 14, ang = R() * Math.PI * 2, spd = 0.016 / Math.sqrt(rad / 78) * (R() < 0.5 ? 1 : 0.8);
        const orbit = new T.Mesh(new T.RingGeometry(rad - 0.15, rad + 0.15, 160), new T.MeshBasicMaterial({ color: 0x5a7a9a, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false })); orbit.rotation.x = -Math.PI / 2; P.bodiesG.add(orbit);
        const g = new T.Group(); let spin = null, col = '#e8d8b8', r = 8;
        if (b.kind === 'mine') {
          const ball = new T.Mesh(new T.SphereGeometry(5, 32, 20), new T.MeshStandardMaterial({ color: b.wid === 'home' ? 0x3f86a2 : 0xc9a06a, roughness: 0.85 })); g.add(ball);
          g.add(spr(glow('rgba(160,220,255,.6)', 'rgba(80,150,255,.08)'), 18, 0x7fd0ff, 0.5)); col = '#9fdcff'; r = 10;
          if (b.wid === 'home') new T.TextureLoader().load(new URL('3d/kerath_albedo.jpg', SCRIPT_URL).href, (tx) => { tx.colorSpace = T.SRGBColorSpace; ball.material.map = tx; ball.material.color.set(0xffffff); ball.material.needsUpdate = true; }, undefined, () => {});
        } else if (b.kind === 'station') {
          const hx = new T.Mesh(new T.RingGeometry(4.6, 4.9, 6), new T.MeshBasicMaterial({ color: 0xffb066, side: T.DoubleSide, transparent: true, opacity: 0.55 })); hx.rotation.x = -Math.PI / 2; g.add(hx);
          const hold = new T.Group(); g.add(hold); spin = hold; col = '#ffcf96';
          if (!P.scene.environment) P.scene.environment = envMap();
          loadGLB(glbFor(b.port)).then(gl => hold.add(fitModel(gl.scene, 4.2))).catch(() => hold.add(spr(glow('rgba(255,240,220,1)', 'rgba(255,170,90,.5)'), 7, 0xffc890)));
        } else if (b.kind === 'sig' && !(b.obj && b.obj.resolved)) {
          const ico = new T.Mesh(new T.IcosahedronGeometry(2.4, 0), new T.MeshBasicMaterial({ color: 0xa37dff, wireframe: true })); g.add(ico); spin = ico; col = '#cdb8ff';
        } else if (b.kind === 'sig') {
          g.add(new T.Mesh(new T.SphereGeometry(3, 24, 16), new T.MeshStandardMaterial({ color: 0x5fcc8a, roughness: 0.6 }))); col = '#bfe6c0';
        } else if (b.kind === 'target') {
          const engaged = b.obj && b.obj.kt && b.obj.kt.status === 'engaged';
          const gem = new T.Mesh(new T.OctahedronGeometry(2.4, 0), new T.MeshStandardMaterial({ color: 0x2a1c08, emissive: engaged ? 0x3a3a3a : 0xc9a06a, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.35, flatShading: true })); gem.scale.set(1, 1.4, 1); g.add(gem); spin = gem;
          const rr = rng(hash('rk' + b.key)), geo = rockGeo(hash(b.key)); for (let k = 0; k < 6; k++) { const rk = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.9, flatShading: true })); rk.scale.setScalar(0.5 + rr() * 0.9); const a = rr() * 6.28, d = 3.5 + rr() * 3; rk.position.set(Math.cos(a) * d, (rr() - 0.5) * 2, Math.sin(a) * d); g.add(rk); }
          col = '#ffd9a0';
        } else if (b.kind === 'planet') {
          const pl = b.obj || {}; const cls = PLANET_COLS[pl.type] ? pl.type : (SIG_CLASS[(pl.fromSig || {}).fixedClass] || 'type2');
          const big = cls === 'type4' ? 6 : cls === 'type3' ? 4.6 : 3.8;
          g.add(new T.Mesh(new T.SphereGeometry(big, 32, 20), new T.MeshStandardMaterial({ color: PLANET_COLS[cls], roughness: 0.85 })));
          if (pl.playerName) { const m = spr(glow('rgba(255,140,120,1)', 'rgba(255,90,70,.4)'), 4, 0xff7a6a); m.position.set(0, big + 2, 0); g.add(m); col = '#ffb0a0'; } else col = '#c4b8ff';
          r = big + 4;
        }
        const lb = label(bodyName(b), col, b.kind === 'station' ? 1.3 : 1.8); lb.position.set(0, 5, 0); g.add(lb);
        P.bodiesG.add(g);
        const o = Object.assign({}, b, { rad, ang, spd, mesh: g, spin, r, x: Math.cos(ang) * rad, z: Math.sin(ang) * rad });
        g.position.set(o.x, 0, o.z);
        P.orbiters.push(o); P.items.push(o);
      });
      if (s.beacons && s.beacons.length) for (let i = 0; i < s.beacons.length; i++) { const cr = cross(5); cr.position.set(22 + i * 14, 0.4, -20); P.bodiesG.add(cr); P.items.push({ kind: 'beacon', key: s.beacons[i].id, x: 22 + i * 14, z: -20, r: 8, beacon: s.beacons[i] }); }
      syncSysSel(P);
    }
    function syncSysSel(P) { const o = selCk ? P.orbiters.find(x => x.ck === selCk) : null; P.selO = o; P.ring.visible = !!o; if (o) P.ring.scale.setScalar(1); }

    /* ───────────── plan d'un monde : en orbite basse, vue fixe ───────────── */
    const WORLD_FS = `
      uniform float uT; uniform vec3 uSun, uA, uB, uC, uSea; uniform float uSeaLvl, uCloud, uLights; varying vec3 vN; varying vec3 vW;
      vec3 h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(vec3(p.x*p.y*p.z, p.x+p.y*p.z, p.x*p.y+p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
        return mix(mix(mix(h3(i).x, h3(i+vec3(1,0,0)).x, f.x), mix(h3(i+vec3(0,1,0)).x, h3(i+vec3(1,1,0)).x, f.x), f.y),
                   mix(mix(h3(i+vec3(0,0,1)).x, h3(i+vec3(1,0,1)).x, f.x), mix(h3(i+vec3(0,1,1)).x, h3(i+vec3(1,1,1)).x, f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.07 + 3.1; a *= .5; } return s; }
      void main(){ vec3 n = normalize(vN); vec3 p = n * 3.; float e = fbm(p + fbm(p * 1.7) * .6);
        vec3 col = e < uSeaLvl ? mix(uSea * .55, uSea, smoothstep(uSeaLvl - .15, uSeaLvl, e)) : mix(uA, uB, smoothstep(uSeaLvl, uSeaLvl + .18, e)); col = mix(col, uC, smoothstep(.66, .78, e));
        float cl = smoothstep(.5, .75, fbm(n * 5. + vec3(uT * .01, 0., uT * .006))) * uCloud; col = mix(col, vec3(1.), cl * .85);
        float d = dot(n, normalize(uSun)), lit = smoothstep(-.08, .25, d);
        vec3 night = vec3(0.); if (uLights > 0. && e > uSeaLvl) night = vec3(1., .75, .4) * smoothstep(.62, .7, fbm(n * 24.)) * uLights * (1. - cl);
        vec3 V = normalize(cameraPosition - vW); float rim = pow(1. - max(dot(n, V), 0.), 3.);
        gl_FragColor = vec4(col * (.04 + lit * 1.05) + night * (1. - lit) + vec3(.35, .6, 1.) * rim * (.25 + lit * .9), 1.); }`;
    function makeWorld(b, sysKey) {
      const S = sceneBase(0x010208), pl = b.obj || {}, seed = hash(b.key);
      const cls = String((pl.fromSig && pl.fromSig.fixedClass) || pl.fixedClass || pl.type || '').toLowerCase();
      const dead = /dead|type5|type1|lunar/.test(cls), gas = /gas|type4/.test(cls);
      const pal = dead ? [0x6e6258, 0x8a7a68, 0xb8aa98, 0x2a2622, 0.0, 0] : gas ? [0xc9a06a, 0xe0c090, 0xfff0d0, 0xb08050, 0.0, 0] : [0x3f6a3a, 0x8a7a50, 0xe8e8e8, 0x1d4f8a, 0.5, 0.8];
      const Rp = 2000, sunDir = V(-0.22, 0.28, -0.93).normalize();
      const planet = new T.Mesh(new T.SphereGeometry(Rp, lite ? 96 : 160, lite ? 72 : 120), new T.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSun: { value: sunDir }, uA: { value: new T.Color(pal[0]) }, uB: { value: new T.Color(pal[1]) }, uC: { value: new T.Color(pal[2]) }, uSea: { value: new T.Color(pal[3]) }, uSeaLvl: { value: pal[4] }, uCloud: { value: pal[5] }, uLights: { value: pl.playerName ? 1 : 0 } },
        vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: WORLD_FS }));
      planet.position.set(0, -Rp, 0); planet.rotation.z = 0.35; S.add(planet);
      const atm = new T.Mesh(new T.SphereGeometry(Rp * 1.035, lite ? 72 : 120, lite ? 54 : 90), new T.ShaderMaterial({ transparent: true, side: T.BackSide, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uSun: { value: sunDir } },
        vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'uniform vec3 uSun; varying vec3 vN; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW); float r = pow(max(0., 1. - abs(dot(normalize(vN), V))), 2.2); float l = smoothstep(-.3, .4, dot(normalize(vN), normalize(uSun))); gl_FragColor = vec4(vec3(.35, .62, 1.) * r * (.15 + l * 1.4), 1.); }' }));
      atm.position.copy(planet.position); S.add(atm);
      const sun = makeSun(26, 0xffd29a); sun.position.set(-380, 400 - Math.tan(0.42) * 2200, -2200); S.add(sun);
      { const d = dust(2500, 3000, seed, 1, 0.8, 0.02); d.rotation.x = Math.PI / 2; d.position.set(0, 600, -2900); S.add(d); }
      return { key: 'w:' + b.key, kind: 'monde', scene: S, unit: 400, hMin: 300, hMax: 302, h0: 301, bounds: 0, title: bodyName(b), sys: sysKey, body: b,
        hint: 'Le monde vu d’orbite basse · dézoome pour revenir au système', items: [],
        cam(c, t) { c.position.set(Math.sin(t * 0.05) * 30, 400 + Math.sin(t * 0.07) * 6, 0); c.lookAt(Math.sin(t * 0.05) * 30 - 60, 400 - Math.tan(0.66) * 1000, -1000); },
        update(t) { planet.material.uniforms.uT.value = t; planet.rotation.y = t * 0.004; sun.userData.tick(t); } };
    }

    /* ───────────── plan d'un gisement (cible) ───────────── */
    function makeField(b, sysKey) {
      const seed = hash(b.key), R = rng(seed), S = sceneBase(0x01020a);
      S.add(dust(1500, 300, seed, 1, 0.5)); S.add(new T.AmbientLight(0x1c2434, 1.1));
      const key = new T.DirectionalLight(0xffe2b0, 3); key.position.set(-80, 60, -40); S.add(key);
      const rim = new T.DirectionalLight(0x6aa8ff, 1.1); rim.position.set(60, 20, 80); S.add(rim);
      S.add(at(spr(glow('rgba(255,255,240,1)', 'rgba(255,190,90,.6)'), 60), -900, 400, -700));
      const geos = [0, 1, 2, 3].map(i => rockGeo(seed + i)), mats = [0x857a70, 0x6d6560, 0x9a8a74].map(c => new T.MeshStandardMaterial({ color: c, roughness: 0.95 }));
      const ore = new T.MeshStandardMaterial({ color: 0xffc864, emissive: 0xc98a2a, emissiveIntensity: 1.1, roughness: 0.3 }), spin = [];
      const n = lite ? 90 : 180;
      for (let i = 0; i < n; i++) { const rk = new T.Mesh(geos[i % 4], mats[i % 3]); const a = R() * 6.28, d = 6 + Math.pow(R(), 0.7) * 120; const s = i < 6 ? 4 + R() * 3 : 0.4 + Math.pow(R(), 2.3) * 3.5;
        rk.position.set(Math.cos(a) * d, (R() - 0.5) * 6, Math.sin(a) * d * 0.8); rk.scale.setScalar(s); rk.rotation.set(R() * 6, R() * 6, R() * 6);
        if (i < 6) for (let k = 0; k < 4; k++) { const c = new T.Mesh(new T.OctahedronGeometry(0.15, 0), ore); const dir = V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(); c.position.copy(dir.multiplyScalar(0.88)); c.scale.set(1, 1.8, 1); rk.add(c); }
        rk.userData.spin = V((R() - 0.5) * 0.15, (R() - 0.5) * 0.15, 0); spin.push(rk); S.add(rk); }
      return { key: 'f:' + b.key, kind: 'gisement', scene: S, unit: 1e3, hMin: 20, hMax: 260, h0: 120, bounds: 200, title: bodyName(b), sys: sysKey, body: b,
        hint: 'Le gisement de près · sa fiche te dit quoi en faire', items: [{ kind: 'field', x: 0, z: 0, r: 140 }],
        update(t, hh, dt) { for (const r of spin) { r.rotation.x += r.userData.spin.x * dt; r.rotation.y += r.userData.spin.y * dt; } } };
    }

    /* ───────────── plan d'une signature non résolue : un écho, rien de plus ───────────── */
    function makeSigPlane(b, sysKey) {
      const seed = hash(b.key), R = rng(seed), S = sceneBase(0x01020a);
      S.add(dust(1400, 400, seed, 1, 0.5));
      for (let k = 0; k < 6; k++) S.add(at(spr(glow('rgba(190,170,255,.35)', 'rgba(120,90,255,.06)'), 120 + R() * 160, 0x9a7dff, 0.14), (R() - 0.5) * 120, -4, (R() - 0.5) * 120));
      const core = new T.Mesh(new T.IcosahedronGeometry(9, 0), new T.MeshBasicMaterial({ color: 0xa37dff, wireframe: true })); S.add(core);
      const inner = new T.Mesh(new T.IcosahedronGeometry(4, 1), new T.MeshBasicMaterial({ color: 0xcdb8ff, wireframe: true, transparent: true, opacity: 0.6 })); S.add(inner);
      S.add(spr(glow('rgba(230,220,255,1)', 'rgba(160,120,255,.4)'), 30, 0xb89bff, 0.8));
      const waves = []; for (let i = 0; i < 3; i++) { const w = new T.Mesh(new T.RingGeometry(0.96, 1, 96), new T.MeshBasicMaterial({ color: 0xc89bff, transparent: true, side: T.DoubleSide, depthWrite: false })); w.rotation.x = -Math.PI / 2; S.add(w); waves.push(w); }
      const motes = []; for (let i = 0; i < (lite ? 40 : 90); i++) { const m = spr(glow('rgba(255,255,255,1)', 'rgba(180,160,255,.4)'), 1.5 + R() * 2.5, 0xd8ccff, 0.5 + R() * 0.4); const a = R() * 6.28, d = 18 + R() * 70; m.userData = { a, d, sp: (R() - 0.5) * 0.3, y: (R() - 0.5) * 10 }; S.add(m); motes.push(m); }
      return { key: 'g:' + b.key, kind: 'signature', scene: S, unit: 50, hMin: 40, hMax: 360, h0: 170, bounds: 160, title: bodyName(b), sys: sysKey, body: b,
        hint: 'Un écho non identifié · sa fiche dit quelle sonde le révélera', items: [{ kind: 'echo', x: 0, z: 0, r: 60 }],
        update(t) { core.rotation.y = t * 0.4; core.rotation.x = t * 0.25; inner.rotation.y = -t * 0.7; inner.scale.setScalar(1 + 0.12 * Math.sin(t * 2.3));
          waves.forEach((w, i) => { const k = (t * 0.25 + i / 3) % 1; w.scale.setScalar(10 + k * 120); w.material.opacity = 0.6 * (1 - k); });
          for (const m of motes) { const u = m.userData; u.a += u.sp * 0.01; m.position.set(Math.cos(u.a) * u.d, u.y, Math.sin(u.a) * u.d); } } };
    }

    /* ───────────── le vide, la structure quantique, le mur des tags ───────────── */
    function makeVoid(seed, ci, sysKey) {
      const S = sceneBase(0x000104), R = rng(seed);
      const d1 = dust(900, 200, seed, 1.4, 0.5, 0.8), d2 = dust(400, 200, seed + 1, 2.4, 0.25, 0.8); S.add(d1, d2);
      for (let k = 0; k < 4; k++) S.add(at(spr(glow('rgba(120,140,220,.25)', 'rgba(60,70,140,.05)'), 140 + R() * 100, 0x5a6ac0, 0.25), (R() - 0.5) * 300, -60, (R() - 0.5) * 300));
      return { kind: 'vide', scene: S, unit: 1e8, hMin: 4, hMax: 260, h0: 180, bounds: 180, title: 'Vide interstellaire', ci, sys: sysKey,
        hint: 'Rien. Le vide. Zoome encore, au hasard : sous le vide, la structure', items: [],
        update(t) { d1.position.x = Math.sin(t * 0.05) * 6; d2.position.z = Math.cos(t * 0.04) * 8; } };
    }
    function makeQuantum(seed) {
      const S = sceneBase(0x03010c), R = rng(seed), lines = [], N = lite ? 26 : 46, P = lite ? 90 : 160;
      for (let i = 0; i < N; i++) {
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(P * 3), 3));
        const col = new T.Color().setHSL(0.55 + R() * 0.35, 0.9, 0.62);
        const l = new T.Line(g, new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0.75, blending: T.AdditiveBlending }));
        l.userData = { z: (i - N / 2) * 4.2 * (46 / N), f: 1 + R() * 4, a: 0.6 + R() * 2.4, ph: R() * 6, sp: 0.6 + R() * 1.8, closed: R() < 0.3, cx: (R() - 0.5) * 150, r: 2 + R() * 6 };
        S.add(l); lines.push(l);
      }
      S.add(at(spr(glow('rgba(255,255,255,.6)', 'rgba(160,100,255,.15)'), 120, 0xa37dff, 0.3), 0, -10, 0));
      return { kind: 'quantique', scene: S, unit: 1e-30, hMin: 3, hMax: 220, h0: 160, bounds: 140, title: 'Structure quantique', hint: 'Les cordes vibrent · zoome encore : au bout, le mur des tags', items: [],
        update(t) { for (const l of lines) { const u = l.userData, p = l.geometry.attributes.position; for (let k = 0; k < P; k++) { const sx = k / (P - 1);
          if (u.closed) { const a = sx * Math.PI * 2, rr = u.r * (1 + 0.25 * Math.sin(a * u.f * 2 + t * u.sp * 3)); p.setXYZ(k, u.cx + Math.cos(a) * rr, Math.sin(a * 3 + t) * 0.6, u.z + Math.sin(a) * rr); }
          else { const x = (sx - 0.5) * 300; p.setXYZ(k, x, Math.sin(sx * u.f * 9 + t * u.sp + u.ph) * u.a, u.z + Math.sin(sx * u.f * 5 - t * u.sp * 0.7) * u.a * 0.6); } } p.needsUpdate = true; } } };
    }
    // le mur des tags : pas encore ouvert (modération et paiement à décider) — on le montre vierge, « bientôt »
    let _wallTex = null;
    function wallTex() {
      if (_wallTex) return _wallTex;
      const c = document.createElement('canvas'); c.width = c.height = 1000; const x = c.getContext('2d');
      x.fillStyle = '#0b0a14'; x.fillRect(0, 0, 1000, 1000);
      x.textAlign = 'center'; x.fillStyle = '#ffd27a'; x.font = 'bold 54px monospace'; x.fillText('STARBYTE', 500, 500);
      x.fillStyle = '#7fd0ff'; x.font = 'bold 22px monospace'; x.fillText('LE MUR DES TAGS · BIENTÔT', 500, 540);
      _wallTex = new T.CanvasTexture(c); _wallTex.magFilter = T.NearestFilter; _wallTex.colorSpace = T.SRGBColorSpace; _wallTex.userData = { shared: true };
      return _wallTex;
    }
    function makeWall() {
      const S = sceneBase(0x05030c);
      const mat = new T.ShaderMaterial({ uniforms: { map: { value: wallTex() }, uGrid: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform sampler2D map; uniform float uGrid; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vUv); vec2 g = fract(vUv * 1000.0); float e = max(step(.93, g.x), step(.93, g.y)); vec3 base = c.rgb + vec3(.02,.03,.05) * (1. - e); gl_FragColor = vec4(mix(base, base*.5 + vec3(.05,.08,.12), e*uGrid), 1.0); }' });
      const w = new T.Mesh(new T.PlaneGeometry(200, 200), mat); w.rotation.x = -Math.PI / 2; S.add(w);
      return { kind: 'mur', scene: S, unit: 8e-35, hMin: 0.35, hMax: 300, h0: 230, bounds: 100, title: 'Le mur des tags', hint: 'Un million d’espaces, un mur commun à tous les commandants · bientôt', items: [{ kind: 'wall', x: 0, z: 0, r: 140 }],
        update(t, hh) { mat.uniforms.uGrid.value = clamp((12 - hh) / 8, 0, 1); } };
    }
    const wallCard = () => ({ k: 'Le mur des tags', t: 'Bientôt', s: 'Un million d’espaces sur un mur commun à tous les commandants, sous la matière de l’univers. Il n’est pas encore ouvert.', acts: '' });

    /* ───────────── plan de la station ───────────── */
    function makeStation(b, sysKey) {
      const S = sceneBase(0x01020a); S.add(dust(1800, 700, hash(sysKey), 1.1, 0.55));
      S.add(new T.HemisphereLight(0x8fb2e0, 0x0a0c12, 1.3));
      const key = new T.DirectionalLight(0xffe2c0, 3.2); key.position.set(-120, 160, 80); S.add(key);
      const rim = new T.DirectionalLight(0x6aa8ff, 1.6); rim.position.set(140, 40, -160); S.add(rim);
      S.add(at(spr(glow('rgba(255,255,240,1)', 'rgba(255,190,90,.6)'), 90), -1400, 600, -900));
      S.environment = envMap();
      const holder = new T.Group(); S.add(holder);
      const wait = label('ARRIVÉE SUR ' + String(b.port.name || 'LA STATION').toUpperCase() + '…', '#ffcf96', 1.4); wait.position.set(0, 10, 0); S.add(wait);
      loadGLB(glbFor(b.port)).then((g) => { holder.add(fitModel(g.scene, 58)); S.remove(wait); disposeTree(wait); }).catch(() => { wait.material.opacity = 0.6; });
      return { key: 'st:' + sysKey, kind: 'station', scene: S, unit: 5, hMin: 84, hMax: 900, h0: 300, bounds: 300, title: String(b.port.name || 'Station'), sys: sysKey, body: b,
        hint: 'La station · approche-toi : à 500 m, sa fiche d’arrivée s’ouvre', items: [{ kind: 'stationBody', x: 0, z: 0, r: 60 }],
        update(t) { holder.rotation.y = t * 0.05; } };
    }

    /* ───────────── plan d'une ligne de convois ───────────── */
    function lineOf(lineKey) {
      const net = window.SBLines && SBLines.network ? safe(() => SBLines.network(), null) : null;
      const st = ST, known = (k) => st && st.cell['sys:' + k] !== undefined;
      let chain = [], port = null;
      if (net && net.byId && net.byId[lineKey]) { const ln = net.byId[lineKey]; port = ln.port; chain = ln.chain.concat(ln.port ? [ln.port] : []).filter(known); }
      if (chain.length < 2) {   // trajet d'un joueur (ou ligne inconnue) : les tronçons relevés, mis bout à bout
        const legs = (G.spottedLegs || []).filter(l => (l.lineId || (l.convoyId ? 'cv:' + l.convoyId : null)) === lineKey);
        const next = {}, hasIn = {}; for (const l of legs) { next[l.from] = l.to; hasIn[l.to] = 1; }
        let k = legs.map(l => l.from).find(x => !hasIn[x]) || (legs[0] && legs[0].from); const seen = new Set(); chain = [];
        while (k && !seen.has(k)) { chain.push(k); seen.add(k); k = next[k]; }
        chain = chain.filter(known);
      }
      return { chain, port };
    }
    function makeRoute(lineKey, title, legId) {
      const S = sceneBase(0x01020a); S.add(dust(2600, 1600, hash(lineKey), 1, 0.55));
      const { chain, port } = lineOf(lineKey), now = Date.now(), N = Math.max(2, chain.length), step = 190;
      const X = (i) => (i - (N - 1) / 2) * step, Zf = (i) => Math.sin(i * 0.9) * 26;
      for (let i = 0; i < N; i++) S.add(at(spr(glow('rgba(255,170,120,.35)', 'rgba(255,120,80,.06)'), 420, 0xff9a6a, 0.18), X(i), -3, Zf(i)));
      if (chain.length > 1) { const curve = new T.CatmullRomCurve3(chain.map((k, i) => V(X(i), 0.3, Zf(i)))); const l = new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(200)), new T.LineDashedMaterial({ color: 0xff9a6a, dashSize: 12, gapSize: 8, transparent: true, opacity: 0.8 })); l.computeLineDistances(); S.add(l); }
      const items = [], movers = [], conv = [];
      chain.forEach((k, i) => {
        const s = ST.systems[k] || {}, pt = s.li && s.li.port, g = makeSun(pt ? 9 : 6, pt ? 0xffb066 : 0xffe0b8); g.position.set(X(i), 0, Zf(i)); S.add(g); movers.push(g);
        const nb = (s.beacons || []).length;
        const lb = label((pt ? String(pt.name || 'Station').toUpperCase() + ' · ' : '') + k + (nb ? '  ·  balise' : ''), pt ? '#ffcf96' : '#e8d8b8', 1.7); lb.userData.always = true; lb.position.set(X(i), 22, Zf(i)); S.add(lb);
        if (nb) { const cr = cross(9); cr.position.set(X(i) + 22, 1, Zf(i) - 20); S.add(cr); items.push({ kind: 'balise', key: k, beacon: s.beacons[0], n: nb, x: X(i) + 22, z: Zf(i) - 20, r: 16 }); }
        items.push({ kind: 'jalon', key: k, x: X(i), z: Zf(i), r: 30, port: pt });
      });
      const idx = (c) => chain.indexOf(sysOf(c));
      const ship = (col, s = 1) => { const m = new T.Mesh(new T.ConeGeometry(3.2 * s, 12 * s, 4), new T.MeshBasicMaterial({ color: col })); m.rotation.x = Math.PI / 2; const g = new T.Group(); g.add(m); g.add(spr(glow('rgba(255,255,255,.9)', 'rgba(255,200,150,.3)'), 16 * s, col, 0.7)); return g; };
      for (const r of (G.beaconReports || [])) {
        const ln = r.line || (r.mp && { id: 'cv:' + r.mp.convoyId, label: r.mp.pseudo || 'Pavillon impérial', ships: 1, escort: 0, cargo: r.target && r.target.cargoEstimate });
        if (!ln || ln.id !== lineKey || now - (r.createdAt || 0) > 12 * 3600e3) continue;
        const i = idx(r.systemCoord); if (i < 0) continue;
        const j0 = ln.cap ? idx(ln.cap) : (ln.dir === 'out' ? i + 1 : i - 1), j = (j0 >= 0 && j0 < N) ? j0 : i;
        const g = new T.Group(); S.add(g); g.add(ship(0xffd27a));
        for (let e = 0; e < Math.min(4, escN(ln.escort)); e++) { const es = ship(0xff8a6a, 0.6); es.position.set(-14 - e * 8, 0, (e % 2 ? 1 : -1) * (8 + e * 2)); g.add(es); }
        const lb = label(`${ln.label || 'Convoi'} · ${ln.ships || '?'} vaisseaux · ${escTxt(ln.escort)} · vu il y a ${Math.round((now - r.createdAt) / 60000)} min`, '#ffe0a0', 1.5); lb.userData.always = true; lb.position.set(0, 14, 0); g.add(lb);
        const it = { kind: 'convoi', ln, seen: r.createdAt, sys: sysOf(r.systemCoord), x: X(i), z: Zf(i) + 30, r: 26 };
        conv.push({ g, i, j, t0: r.createdAt, it }); items.push(it);
      }
      for (const f of ((G.fleet && G.fleet.prepared) || [])) { const a = f.ambush; if (!a) continue; const i = idx(a.system); if (i < 0) continue;
        const g = new T.Group(); g.position.set(X(i) + 8, 0, Zf(i) + 46); S.add(g); const d = new T.Mesh(new T.OctahedronGeometry(7, 0), new T.MeshBasicMaterial({ color: 0xff5a4a, wireframe: true })); g.add(d); movers.push(d);
        const lb = label((f.name || 'Flotte') + (a.phase === 'going' ? ' · en route vers l’embuscade' : a.phase === 'returning' ? ' · rentre' : ' · en embuscade'), '#ff9a8a', 1.6); lb.userData.always = true; lb.position.set(0, 16, 0); g.add(lb);
        items.push({ kind: 'flotte', fleet: f, x: X(i) + 8, z: Zf(i) + 46, r: 24 }); }
      for (const m of (G.tankerMissions || [])) { if (!m.portSys || !port || m.portSys !== port || !(m.status === 'in_transit' || m.status === 'returning')) continue; const tk = ship(0x9fe08a, 0.8); S.add(tk);
        const lb = label('Ton tanker ' + (m.tankerName || ''), '#bff0b0', 1.5); lb.userData.always = true; tk.add(lb); lb.position.set(0, 12, 0);
        const it = { kind: 'tanker', mission: m, x: 0, z: 0, r: 22 }; items.push(it);
        const back = m.status === 'returning'; conv.push({ g: tk, i: back ? N - 1 : 0, j: back ? 0 : N - 1, t0: back ? (m.returnDepartedAt || m.arrivalAt) : m.departedAt, t1: back ? m.returnArrivalAt : m.arrivalAt, mine: true, it }); }
      return { key: 'route:' + lineKey, kind: 'route', scene: S, unit: 4e12, hMin: 380, hMax: 1800, h0: 760, bounds: N * step, title: title || 'Ligne de convois', lineKey, legId,
        hint: 'La ligne · les convois vus par tes balises, leur escorte, ta flotte · pince sur un convoi, une flotte, une balise ou un jalon', items,
        update(t) { for (const m of movers) { if (m.userData && m.userData.tick) m.userData.tick(t); else m.rotation.y = t; }
          const n = Date.now(); for (const c of conv) { if (!isFinite(c.t0)) c.t0 = n; const k = (c.t1 && isFinite(c.t1)) ? clamp((n - c.t0) / Math.max(1, c.t1 - c.t0), 0, 1) * (N - 1) : c.i + clamp((n - c.t0) / (40 * 60e3), 0, 1) * (c.j - c.i);
            const i0 = clamp(Math.floor(k), 0, N - 1), f = k - i0, i1 = Math.min(N - 1, i0 + 1), x = lerp(X(i0), X(i1), f), z = lerp(Zf(i0), Zf(i1), f); c.g.position.set(x, 4, z + (c.mine ? -30 : 30));
            c.g.rotation.y = c.j >= c.i ? -Math.PI / 2 : Math.PI / 2; c.it.x = x; c.it.z = z + (c.mine ? -30 : 30); } } };
    }

    /* ───────────── plan d'un convoi / d'une flotte ───────────── */
    function makeFormation(o) {
      const S = sceneBase(0x01020a), seed = hash((o.kind || '') + (o.seen || '') + ((o.fleet && o.fleet.id) || '') + ((o.mission && o.mission.id) || '')), R = rng(seed);
      S.add(new T.HemisphereLight(0x8fb2e0, 0x0a0c12, 1.2)); const key = new T.DirectionalLight(0xffe2c0, 3); key.position.set(-120, 160, 80); S.add(key); const rim = new T.DirectionalLight(0x6aa8ff, 1.4); rim.position.set(140, 40, -160); S.add(rim);
      const stream = new T.Group(); S.add(stream); for (let k = 0; k < 3; k++) { const d = dust(900, 500, seed + k, 1.1, 0.6); d.position.x = (k - 1) * 1000; stream.add(d); }
      S.add(at(spr(glow('rgba(255,255,240,1)', 'rgba(255,190,90,.6)'), 70), -1200, 500, -900));
      S.environment = envMap();
      const comp = o.fleet && o.fleet.composition, ln = o.ln || {};
      const cnt = (t) => comp && comp[t] ? (comp[t].t1 || 0) + (comp[t].t2 || 0) + (comp[t].t3 || 0) : 0;
      const lay = [];
      if (o.kind === 'convoi') { const esc = Math.min(6, escN(ln.escort), +ln.ships ? Math.max(0, ln.ships - 1) : 6), tk = Math.max(1, Math.min(5, (+ln.ships || 1) - esc)); for (let i = 0; i < tk; i++) lay.push(['tanker', -i * 34, (i % 2 ? 1 : -1) * 8]); for (let e = 0; e < esc; e++) lay.push(['frigate', 30 - Math.floor(e / 2) * 40, (e % 2 ? 1 : -1) * 34]); }
      else if (o.kind === 'tanker') lay.push(['tanker', 0, 0]);
      else { const cu = Math.min(3, cnt('cuirasse')), fr = Math.min(8, cnt('fregate')), tk = Math.min(3, cnt('tanker')); for (let i = 0; i < cu; i++) lay.push(['cuirasse', -i * 60, 0]); for (let e = 0; e < fr; e++) lay.push(['frigate', 20 - Math.floor(e / 2) * 34, (e % 2 ? 1 : -1) * (cu ? 40 : 16 + e * 3)]); for (let i = 0; i < tk; i++) lay.push(['tanker', -120 - i * 34, 0]); if (!lay.length) lay.push(['frigate', 0, 0]); }
      const holder = new T.Group(); S.add(holder); const wait = label('APPROCHE…', '#ffcf96', 1.2); S.add(wait);
      const size = { tanker: 22, frigate: 14, cuirasse: 46 };
      loadGLB('sb_ships_v3.glb').then(g => { const M = {}; g.scene.traverse(n => { if (/^SB_SHIP_/.test(n.name)) M[n.name.replace('SB_SHIP_', '').toLowerCase()] = n; });
        for (const [t, x, z] of lay) { const src = M[t]; if (!src) continue; const m = fitModel(src, size[t]); const gg = new T.Group(); gg.add(m); const bx = new T.Box3().setFromObject(src); const sz = bx.getSize(new T.Vector3()); if (sz.z > sz.x) gg.rotation.y = Math.PI / 2; gg.position.set(x, (R() - 0.5) * 6, z); gg.userData.bob = R() * 6; holder.add(gg); }
        S.remove(wait); disposeTree(wait); }).catch(() => { wait.material.opacity = 0.5; });
      const moving = o.kind !== 'flotte' || (o.fleet && o.fleet.ambush && o.fleet.ambush.phase !== 'set');
      const title = o.kind === 'convoi' ? (ln.label || 'Convoi') + ' · ' + (ln.ships || '?') + ' vaisseaux' : o.kind === 'tanker' ? 'Ton tanker ' + ((o.mission && o.mission.tankerName) || '') : (o.fleet && o.fleet.name) || 'Ta flotte';
      return { key: 'form:' + seed, kind: 'formation', scene: S, unit: 8, hMin: 40, hMax: 700, h0: 260, bounds: 200, title, src: o,
        hint: o.kind === 'convoi' ? 'Le convoi tel que tes balises le voient · ses tankers et leur escorte' : 'De près', items: [{ kind: 'contact', x: 0, z: 0, r: 160 }],
        update(t, hh, dt) { if (moving) { stream.position.x -= dt * 26; if (stream.position.x < -1000) stream.position.x += 1000; } for (const g of holder.children) g.position.y = Math.sin(t * 0.8 + g.userData.bob) * 2; } };
    }

    /* ───────────── plan d'une balise ───────────── */
    function makeBeacon(o) {
      const S = sceneBase(0x01020a); S.add(dust(1200, 500, hash(o.key), 1, 0.55));
      S.add(at(spr(glow('rgba(255,255,240,1)', 'rgba(255,190,90,.6)'), 80), -900, 400, -700));
      const core = new T.Mesh(new T.OctahedronGeometry(6, 0), new T.MeshBasicMaterial({ color: 0xc89bff, wireframe: true })); S.add(core); S.add(spr(glow('rgba(240,220,255,1)', 'rgba(170,120,255,.45)'), 26, 0xc89bff, 0.9));
      const rings = []; for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.TorusGeometry(12 + i * 5, 0.35, 6, 64), new T.MeshBasicMaterial({ color: 0xa37dff, transparent: true, opacity: 0.6 })); r.rotation.x = Math.PI / 2 + i * 0.5; S.add(r); rings.push(r); }
      const wave = new T.Mesh(new T.RingGeometry(0.96, 1, 96), new T.MeshBasicMaterial({ color: 0xc89bff, transparent: true, side: T.DoubleSide, depthWrite: false })); wave.rotation.x = -Math.PI / 2; S.add(wave);
      return { key: 'bal:' + o.key, kind: 'balise', scene: S, unit: 2, hMin: 30, hMax: 500, h0: 170, bounds: 120, title: 'Balise · ' + o.key, src: o, hint: 'Ta balise écoute les convois · chaque onde est un balayage', items: [{ kind: 'contact', x: 0, z: 0, r: 60 }],
        update(t) { core.rotation.y = t * 0.7; core.rotation.x = t * 0.3; rings.forEach((r, i) => r.rotation.z = t * (0.3 + i * 0.2)); const k = (t * 0.35) % 1; wave.scale.setScalar(10 + k * 160); wave.material.opacity = 0.7 * (1 - k); } };
    }

    /* ───────────── plan des amas ───────────── */
    const NEB_FS = `
      uniform float uT; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * n(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
      void main(){ vec2 p = vP * .00042 + vec2(uT * .002, 0.);
        vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3))); vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + uT * .004), fbm(p + 3.5 * q + vec2(8.3, 2.8)));
        float f = fbm(p + 3.8 * r); float dust = smoothstep(.45, .75, fbm(p * 2.3 + 7.1 + r));
        vec3 deep = vec3(.025, .03, .085), purple = vec3(.34, .12, .48), magenta = vec3(.78, .22, .42), orange = vec3(1.0, .52, .18), gold = vec3(1.0, .86, .56);
        vec3 col = mix(deep, purple, smoothstep(.25, .7, f)); col = mix(col, magenta, smoothstep(.55, .8, f) * smoothstep(.3, .9, r.x));
        float ridge = pow(1. - abs(f - .62) * 3.2, 6.) * smoothstep(.4, .8, q.y); col += orange * ridge * 1.1 + gold * pow(ridge, 3.) * .9;
        col = mix(col, col * .18, dust * .85); float vig = smoothstep(1.0, .2, length(vP) * .00009);
        gl_FragColor = vec4(col * (.32 + .42 * vig), 1.); }`;
    function makeUniverse() {
      const S = sceneBase(0x020208);
      const neb = new T.Mesh(new T.PlaneGeometry(60000, 60000), new T.ShaderMaterial({ depthWrite: false, uniforms: { uT: { value: 0 } }, vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: NEB_FS }));
      neb.renderOrder = -10; neb.rotation.x = -Math.PI / 2; neb.position.y = -40; S.add(neb);
      const R = rng(777);
      { const n = lite ? 7000 : 14000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { p.set([(R() - 0.5) * 26000, -10 - R() * 20, (R() - 0.5) * 26000], i * 3); const w = 0.35 + R() * 0.65, t = R(); c.set([w, w * (t > 0.7 ? 0.8 : 0.95), w * (t < 0.3 ? 1 : 0.85)], i * 3); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('color', new T.BufferAttribute(c, 3));
        S.add(new T.Points(g, new T.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }))); }
      for (let i = 0; i < (lite ? 120 : 240); i++) { const col = [0xffffff, 0xcfe0ff, 0xffd0a0, 0xff9a8a, 0xa8c8ff][Math.floor(R() * 5)]; S.add(at(spr(spikeTex(), 40 + Math.pow(R(), 4) * 260, col, 0.5 + R() * 0.4), (R() - 0.5) * 24000, -5, (R() - 0.5) * 24000)); }
      const items = [];
      const mine = safe(() => mySystemKey().split('-')[0], 'A');
      const cluster = (key, name, x, z, col, sub) => {
        const g = new T.Group(); g.position.set(x, 0, z); S.add(g); const r = rng(hash(key));
        g.add(spr(glow('rgba(255,255,255,.9)', 'rgba(255,220,180,.25)'), 1400, col, 0.5)); g.add(spr(glow('rgba(255,240,220,.6)', 'rgba(255,200,150,.05)'), 3400, col, 0.3));
        const n = lite ? 900 : 1800, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = r() * 6.28, d = Math.pow(r(), 1.8) * 1500; p.set([Math.cos(a) * d * (1 + 0.3 * Math.sin(a * 3)), 2, Math.sin(a) * d * 0.8], i * 3); }
        const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(p, 3)); g.add(new T.Points(pg, new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: 0xfff1dc, transparent: true, opacity: 0.95, depthWrite: false })));
        const lb = label(name.toUpperCase(), '#' + new T.Color(col).getHexString(), 2.6); lb.userData.always = true; lb.position.set(0, 10, -1700); g.add(lb);
        const sl = label(sub, '#c8d6e2', 1.5); sl.userData.always = true; sl.position.set(0, 10, -1300); g.add(sl);
        items.push({ kind: 'cluster', key, name, x, z, r: 1700, sub });
      };
      const nSys = ST ? Object.values(ST.systems).filter(s => s.known).length : 0;
      cluster(mine, 'Amas ' + mine, 0, 0, 0xffd9a0, 'ton amas · ' + nSys + ' système' + (nSys > 1 ? 's' : '') + ' connu' + (nSys > 1 ? 's' : ''));
      const east = String.fromCharCode(((mine.charCodeAt(0) - 65 + 1) % 26) + 65), west = String.fromCharCode(((mine.charCodeAt(0) - 65 + 25) % 26) + 65);
      cluster(east, 'Amas ' + east, 5600, 500, 0xa8c8ff, 'à l’est · inexploré');
      cluster(west, 'Amas ' + west, -5600, -400, 0xff9a8a, 'à l’ouest · inexploré');
      return { key: 'univers', kind: 'univers', scene: S, unit: 1.6e15, hMin: 1800, hMax: 16000, h0: 8200, bounds: 9000, title: 'Les amas', mine, items,
        hint: 'Au-dessus des amas · pince vers ton amas pour y redescendre', update(t) { neb.material.uniforms.uT.value = t; edgeChips(items); } };
    }
    const chips = {};
    function edgeChips(items) {
      for (const it of items) {
        let c = chips[it.key];
        if (!c) { c = chips[it.key] = document.createElement('button'); c.className = 'pl-chip'; c.onclick = () => { gx = it.x; gz = it.z; }; (scrEl || host.parentNode).appendChild(c); }
        const v = V(it.x, 0, it.z).project(camera), on = Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.92 && v.z < 1;
        if (on || plan.kind !== 'univers' || trans) { c.style.display = 'none'; continue; }
        const ang = Math.atan2(v.y, v.x), ex = clamp(0.5 + Math.cos(ang) * 0.5, 0.03, 0.97), ey = clamp(0.5 - Math.sin(ang) * 0.5, 0.16, 0.72);
        c.textContent = (v.x < 0 ? '◂ ' : '') + it.name.toUpperCase() + (v.x >= 0 ? ' ▸' : ''); c.style.display = 'block';
        const W0 = host.clientWidth, H0 = host.clientHeight; c.style.left = Math.round(ex * W0 - (ex > 0.5 ? c.offsetWidth : 0)) + 'px'; c.style.top = Math.round(ey * H0) + 'px';
      }
    }
    const hideChips = () => { for (const c of Object.values(chips)) c.style.display = 'none'; };

    /* ───────────── navigation entre les plans ───────────── */
    const getPlan = (key, make) => PLANS[key] || (PLANS[key] = Object.assign(make(), { key }));
    function dropPlan(key) { const p = PLANS[key]; if (!p || p === AMAS || p === plan || stack.some(s => s.plan === p)) return; disposeTree(p.scene); delete PLANS[key]; }
    function gcPlans() { for (const k of Object.keys(PLANS)) if (k !== 'amas' && k !== 'univers') dropPlan(k); }
    function startTrans(dir, next, atPt) { if (trans) return false; trans = { dir, t: 0, next, at: atPt }; closeCard(); hideChips(); return true; }
    function bodyAt(P, wx, wz, mul = 1.8) { let best = null, bd = Infinity; for (const it of P.items || []) { const d = Math.hypot(it.x - wx, it.z - wz); if (d < Math.max(it.r * mul, 12) && d < bd) { bd = d; best = it; } } return best; }
    function legAt(P, wx, wz, tol) { let best = null, bd = tol; for (const l of P.legHits || []) { const dx = l.bx - l.ax, dz = l.bz - l.az, L = dx * dx + dz * dz || 1, u = clamp(((wx - l.ax) * dx + (wz - l.az) * dz) / L, 0, 1), d = Math.hypot(wx - (l.ax + u * dx), wz - (l.az + u * dz)); if (d < bd) { bd = d; best = l; } } return best; }
    function nearStar(wx, wz, tol) { if (!AMAS) return false; for (const q of Object.values(AMAS.sysPos)) if (Math.hypot(q.x - wx, q.z - wz) < tol) return true; return false; }
    function sysAtCell(wx, wz) { const c = cellAtWorld(wx / K, wz / K); if (!c || !ST) return null; const o = ST.occ.get(c.idx); return o && (o.kind === 'system' || o.kind === 'home') ? { key: o.key, ci: c.idx } : null; }
    // ce qu'un zoom vers ce point ouvre (null : rien en dessous)
    function childOf(wx, wz) {
      const P = plan;
      if (P.kind === 'amas') {
        const lg = nearStar(wx, wz, Math.max(26, h * 0.03)) ? null : legAt(P, wx, wz, Math.max(12, h * 0.02)); const s = sysAtCell(wx, wz);
        if (s && !(lg && lg.lineId)) return { plan: getPlan('sys:' + s.key, () => makeSystem(s.key)) };
        if (lg && lg.lineId) return { plan: getPlan('route:' + lg.lineId, () => makeRoute(lg.lineId, lg.npc ? (lg.pseudo || 'Ligne marchande') : 'Convoi ' + (lg.pseudo || 'impérial'), lg.id)) };
        const c = cellAtWorld(wx / K, wz / K), ci = c ? c.idx : -1;
        return { plan: getPlan('vide:' + ci + ':' + Math.round(wx / 40) + ':' + Math.round(wz / 40), () => makeVoid(hash('v' + ci + Math.round(wx / 40) + Math.round(wz / 40)), ci, null)) };
      }
      if (P.kind === 'univers') { const c = bodyAt(P, wx, wz, 1.4); if (c && c.key === P.mine) return { plan: AMAS, top: true }; if (c) showOwn(clusterCard(c)); return null; }
      if (P.kind === 'systeme') {
        const b = bodyAt(P, wx, wz); if (!b) return { plan: getPlan('vide:s:' + P.sys, () => makeVoid(hash('vs' + P.sys), -1, P.sys)) };
        if (b.kind === 'planet' || (b.kind === 'sig' && b.obj && b.obj.resolved)) return { plan: getPlan('w:' + b.key, () => makeWorld(b, P.sys)) };
        if (b.kind === 'sig') return { plan: getPlan('g:' + b.key, () => makeSigPlane(b, P.sys)) };
        if (b.kind === 'target') return { plan: getPlan('f:' + b.key, () => makeField(b, P.sys)) };
        if (b.kind === 'station') return { plan: getPlan('st:' + P.sys, () => makeStation(b, P.sys)) };
        if (b.kind === 'mine') return { board: b.wid };
        if (b.kind === 'beacon') return { plan: getPlan('bal:' + P.sys, () => makeBeacon({ key: P.sys, beacon: b.beacon, n: 1 })) };
        return null;
      }
      if (P.kind === 'signature' || P.kind === 'gisement' || P.kind === 'vide') return { plan: getPlan('q:' + P.key, () => makeQuantum(hash('q' + P.key))) };
      if (P.kind === 'quantique') return { plan: getPlan('mur', makeWall) };
      if (P.kind === 'route') {
        const o = bodyAt(P, wx, wz, 2.5); if (!o) return null;
        if (o.kind === 'jalon') return { plan: getPlan('sys:' + o.key, () => makeSystem(o.key)) };
        if (o.kind === 'balise') return { plan: getPlan('bal:' + o.key, () => makeBeacon(o)) };
        return { plan: getPlan('form:' + o.kind + ':' + ((o.fleet && o.fleet.id) || (o.mission && o.mission.id) || o.seen || ''), () => makeFormation(o)) };
      }
      return null;
    }
    function dive(pt) { try { dive0(pt); } catch (e) { console.warn('[Plans] plonger', e); trans = null; drawStreaks(0); } }
    function dive0(pt) {
      if (trans) return;
      const c = childOf(pt.x, pt.z);
      if (!c) { if (!plan._arrived && (plan.kind === 'station' || plan.kind === 'monde' || plan.kind === 'formation' || plan.kind === 'balise' || plan.kind === 'mur')) arrive(); return; }
      if (c.board) { startTrans('board', c.board, pt); return; }
      if (c.top) { startTrans('fromTop', AMAS, pt); return; }
      startTrans('in', c.plan, pt);
    }
    function surface() {
      if (trans) return;
      if (!stack.length) { if (plan.kind === 'amas') startTrans('top', UNIV || (UNIV = makeUniverse()), null); return; }
      startTrans('out', null, null);
    }
    function goAmas(x, z, hh, snap) {
      if (plan !== AMAS) { stack = []; plan = AMAS; trans = null; drawStreaks(0); enterPlan(true); gcPlans(); setTimeout(() => { try { ctx.renderPanel && ctx.renderPanel(); } catch (e) {} }, 0); }
      gx = x; gz = z; gh = clamp(hh, AMAS.hMin, AMAS.hMax * 0.95);
      if (snap) { tx = gx; tz = gz; h = gh; }
    }
    // l'arrivée dans un plan : la fiche qui va avec
    function arrive() {
      const P = plan; if (!P || !ST || destroyed) return; P._arrived = true;
      if (ctx.avoiding && ctx.avoiding()) return;   // mode « éviter un système » : seul un vrai toucher choisit
      if (P.kind === 'systeme') { const ci = ST.cell['sys:' + P.sys]; if (ci !== undefined) onPickCell(ci); return; }
      if (P.kind === 'monde' || P.kind === 'gisement' || P.kind === 'signature') { const b = P.body; if (b && b.kind && b.key) onPick({ kind: b.kind, key: b.key }); return; }
      if (P.kind === 'station') { const ci = ST.cell['sys:' + P.sys]; if (ci !== undefined) onPickCell(ci); return; }
      if (P.kind === 'formation') { showOwn(formationCard(P.src)); return; }
      if (P.kind === 'vide') { if (P.ci > 0) onPickCell(P.ci); else if (P.sys) { const ci = ST.cell['sys:' + P.sys]; if (ci !== undefined) onPickCell(ci); } return; }
      if (P.kind === 'mur') { showOwn(wallCard()); return; }
      if (P.kind === 'balise') { showOwn(beaconCard(P.src)); return; }
      if (P.kind === 'route' && P.legId) { onPick({ kind: 'leg', key: P.legId }); return; }
    }
    function openBoard(wid) {
      try {
        const cur = (G.activeWorld || 'home');
        if (wid && wid !== cur && typeof sbSwitchWorld === 'function') sbSwitchWorld(wid);
        if (typeof goto === 'function') goto('planet');
      } catch (e) { console.warn('[Plans] plateau', e); }
    }

    /* ───────────── fiches propres (objets que l'ancienne carte ne connaissait pas) ───────────── */
    const btn = (t, sub, a, main) => `<button class="pl-b${main ? ' on' : ''}" data-a="${esc(a)}">${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
    function clusterCard(c) { return { k: c.key === (plan.mine || '') ? 'Ton amas' : 'Amas voisin', t: c.name, s: c.sub + (c.key !== plan.mine ? ' · aucune route connue n’y mène encore' : ''), acts: c.key === plan.mine ? btn('Descendre ▸', 'dans ton amas', 'down', true) : '', on: (a) => { if (a === 'down') dive({ x: c.x, z: c.z }); } }; }
    function formationCard(o) {
      if (o.kind === 'convoi') { const ln = o.ln || {}, ago = o.seen ? Math.round((Date.now() - o.seen) / 60000) : 0; const leg = (G.spottedLegs || []).find(l => (l.lineId || (l.convoyId ? 'cv:' + l.convoyId : '')) === ln.id);
        return { k: 'Convoi détecté' + (o.sys ? ' · ' + o.sys : ''), t: (ln.label || 'Convoi') + ' · ' + (ln.ships || '?') + ' vaisseaux', s: [escTxt(ln.escort), ln.cargo ? 'cargaison ' + ln.cargo : null, ago ? 'vu il y a ' + ago + ' min' : null].filter(Boolean).join(' · '),
          acts: (leg ? btn('Fiche du tronçon', 'embuscade, balises', 'leg', true) : '') + btn('Rapports', 'détections des balises', 'rep'), on: (a) => { if (a === 'leg' && leg) onPick({ kind: 'leg', key: leg.id }); if (a === 'rep' && typeof setProspectTab === 'function') setProspectTab('rapports'); } }; }
      if (o.kind === 'tanker') { const m = o.mission || {}; return { k: 'Ton tanker', t: m.tankerName || 'Tanker', s: m.portSys ? 'vers ' + m.portSys : '', acts: btn('Fiche de la mission', '', 'm', true), on: () => { if (window.SBMissions) SBMissions.open(m.id); } }; }
      const f = o.fleet || {}; const a = f.ambush || {};
      return { k: 'Ta flotte', t: f.name || 'Flotte', s: (a.phase === 'going' ? 'en route vers ' : a.phase === 'returning' ? 'rentre de ' : 'en embuscade sur ') + (a.system || ''), acts: btn('Fiche de la flotte', '', 'f', true), on: () => { if (typeof openFleetDetail === 'function') openFleetDetail(f.id); } };
    }
    function beaconCard(o) {
      const rep = (G.beaconReports || []).filter(r => sysOf(r.systemCoord) === o.key), last = rep.reduce((m, r) => Math.max(m, r.createdAt || 0), 0);
      return { k: 'Ta balise · ' + o.key, t: (o.n > 1 ? o.n + ' balises' : 'Balise') + ' en écoute', s: rep.length + ' passage' + (rep.length > 1 ? 's' : '') + ' relevé' + (rep.length > 1 ? 's' : '') + (last ? ' · dernier il y a ' + Math.round((Date.now() - last) / 60000) + ' min' : ''),
        acts: btn('Fiche du système', 'balise, rappel', 'sys', true) + btn('Rapports', '', 'rep'), on: (a) => { if (a === 'sys' && ST) { const ci = ST.cell['sys:' + o.key]; if (ci !== undefined) onPickCell(ci); } if (a === 'rep' && typeof setProspectTab === 'function') setProspectTab('rapports'); } };
    }
    function showOwn(c) {
      if (!card || !c) return;
      try { if (ctx.clearSel) ctx.clearSel(); } catch (e) {}
      card.innerHTML = `<button class="pl-cx" aria-label="Fermer">×</button><div class="pl-k">${esc(c.k)}</div><div class="pl-t">${esc(c.t)}</div><div class="pl-s">${esc(c.s || '')}</div><div class="pl-acts">${c.acts || ''}</div>`;
      card.querySelector('.pl-cx').onclick = closeCard;
      card.querySelectorAll('.pl-b').forEach(b => b.onclick = (e) => { e.stopPropagation(); try { c.on && c.on(b.dataset.a); } catch (er) { console.warn('[Plans] action', er); } });
      card.classList.add('on');
    }
    function closeCard() { if (card) card.classList.remove('on'); }

    /* ───────────── effet de zoom accéléré ───────────── */
    function drawStreaks(k, inward) {
      if (!fxc) return;
      const Wd = fx.width, Hd = fx.height, dpr = Wd / Math.max(1, host.clientWidth), cx = zoomPt.x * dpr, cy = zoomPt.y * dpr;
      fxc.clearRect(0, 0, Wd, Hd); if (k <= 0) { fx.style.display = 'none'; return; } fx.style.display = 'block';
      const R = rng(Math.floor(performance.now() / 40)); fxc.globalCompositeOperation = 'lighter';
      for (let i = 0; i < (lite ? 90 : 170); i++) {
        const a = R() * Math.PI * 2, r0 = (20 + R() * Math.max(Wd, Hd) * 0.7) * (inward ? 1 : 0.6), len = (60 + R() * 260) * k * dpr;
        const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0, x1 = cx + Math.cos(a) * (r0 + len), y1 = cy + Math.sin(a) * (r0 + len);
        const g = fxc.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(160,210,255,0)'); g.addColorStop(1, `rgba(200,230,255,${0.55 * k})`);
        fxc.strokeStyle = g; fxc.lineWidth = (1 + R() * 2) * dpr; fxc.beginPath(); fxc.moveTo(x0, y0); fxc.lineTo(x1, y1); fxc.stroke();
      }
      const rg = fxc.createRadialGradient(cx, cy, 0, cx, cy, Math.max(Wd, Hd) * 0.6); rg.addColorStop(0, `rgba(230,245,255,${Math.pow(k, 3) * 0.95})`); rg.addColorStop(0.35, `rgba(120,180,255,${Math.pow(k, 2) * 0.35})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      fxc.fillStyle = rg; fxc.fillRect(0, 0, Wd, Hd); fxc.globalCompositeOperation = 'source-over';
    }
    function stepTrans(dt) {
      const tr = trans; tr.t += dt / 0.95; const t = tr.t;
      const swap = (fn) => { if (!tr.swapped) { tr.swapped = true; fn(); enterPlan(); } };
      if (tr.dir === 'in') {
        if (t < 0.5) { const k = t / 0.5; h = lerp(plan.hMin, plan.hMin * 0.04, k * k); if (tr.at) { tx = lerp(tx, tr.at.x, 0.2); tz = lerp(tz, tr.at.z, 0.2); } drawStreaks(k, true); }
        else { swap(() => { stack.push({ plan, x: tr.at ? tr.at.x : gx, z: tr.at ? tr.at.z : gz }); plan = tr.next; tx = gx = 0; tz = gz = 0; h = plan.hMax * 0.9; gh = plan.h0; });
          const k = (t - 0.5) / 0.5; h = lerp(plan.hMax * 0.9, plan.h0, 1 - Math.pow(1 - k, 3)); drawStreaks(1 - k, true); }
      } else if (tr.dir === 'out') {
        if (t < 0.5) { const k = t / 0.5; h = lerp(plan.hMax, plan.hMax * 3, k * k); drawStreaks(k, false); }
        else { swap(() => { const s = stack.pop(); const old = plan; plan = s.plan; tx = gx = s.x; tz = gz = s.z; h = plan.hMin * 0.3; gh = plan.hMin * 2.2; setTimeout(() => dropPlan(old.key), 0); });
          const k = (t - 0.5) / 0.5; h = lerp(plan.hMin * 0.3, plan.hMin * 2.2, 1 - Math.pow(1 - k, 3)); drawStreaks(1 - k, false); }
      } else if (tr.dir === 'top') {
        if (t < 0.5) { const k = t / 0.5; h = lerp(plan.hMax, plan.hMax * 3, k * k); drawStreaks(k, false); }
        else { swap(() => { plan = tr.next; stack = []; tx = gx = 0; tz = gz = 0; h = plan.hMin * 0.8; gh = plan.h0; });
          const k = (t - 0.5) / 0.5; h = lerp(plan.hMin * 0.8, plan.h0, 1 - Math.pow(1 - k, 3)); drawStreaks(1 - k, false); }
      } else if (tr.dir === 'fromTop') {
        if (t < 0.5) { const k = t / 0.5; h = lerp(plan.hMin, plan.hMin * 0.1, k * k); drawStreaks(k, true); }
        else { swap(() => { plan = AMAS; stack = []; tx = gx = 0; tz = gz = 0; h = AMAS.hMax * 0.9; gh = AMAS.h0; });
          const k = (t - 0.5) / 0.5; h = lerp(AMAS.hMax * 0.9, AMAS.h0, 1 - Math.pow(1 - k, 3)); drawStreaks(1 - k, true); }
      } else if (tr.dir === 'board') {
        drawStreaks(Math.min(1, t / 0.6), true);
        if (t >= 0.6 && !tr.swapped) { tr.swapped = true; trans = null; drawStreaks(0); openBoard(tr.next); return; }
        if (t >= 1) { trans = null; drawStreaks(0); return; }
      }
      if (t >= 1) { trans = null; drawStreaks(0); gh = h; if (tr.dir !== 'out' && tr.dir !== 'top') setTimeout(arrive, 60); }
    }

    /* ───────────── HUD ───────────── */
    const NAMES = { univers: 'Plan des amas', amas: 'Plan de l’amas', systeme: 'Plan du système', monde: 'Plan du monde', station: 'Plan de la station', route: 'Plan de la ligne', formation: 'Plan du convoi', balise: 'Plan de la balise', gisement: 'Plan du gisement', signature: 'Plan de la signature', vide: 'Plan du vide', quantique: 'Plan quantique', mur: 'Plan des tags' };
    function enterPlan(keepSel) {
      closeCard(); hideChips(); if (!keepSel) try { if (ctx.clearSel) ctx.clearSel(); } catch (e) {}
      if (hud) { hud.querySelector('.pl-n').textContent = plan.kind === 'formation' && plan.src && plan.src.kind !== 'convoi' ? 'Plan de la flotte' : (NAMES[plan.kind] || ''); hud.querySelector('.pl-p').textContent = stack.map(s => s.plan.title).concat(plan.title).join('  ›  '); hud.querySelector('.pl-h').textContent = plan.hint || ''; }
      if (upBtn) { const par = stack.length ? stack[stack.length - 1].plan : (plan.kind === 'amas' ? null : null); upBtn.style.display = par ? '' : 'none'; if (par) upBtn.textContent = '◂ ' + (par.kind === 'amas' ? 'La carte' : par.title); }
      plan._auto = false; plan._arrived = false;
      try { if (plan.kind === 'systeme') syncSysSel(plan); } catch (e) {}
    }

    /* ───────────── gestes ───────────── */
    const ray = () => new T.Raycaster();
    let _ray = null, _ndc = null, _ground = null, _hit = null;
    function groundAt(cx, cy) {
      if (!_ray) { _ray = ray(); _ndc = new T.Vector2(); _ground = new T.Plane(V(0, 1, 0), 0); _hit = new T.Vector3(); }
      _ndc.set(cx / host.clientWidth * 2 - 1, -(cy / host.clientHeight) * 2 + 1); _ray.setFromCamera(_ndc, camera);
      return _ray.ray.intersectPlane(_ground, _hit) ? _hit.clone() : V(tx, 0, tz);
    }
    function zoomBy(f, cx, cy) {
      if (trans) return;
      if (cx == null) { cx = host.clientWidth / 2; cy = host.clientHeight / 2; }
      zoomPt = { x: cx, y: cy };
      const before = groundAt(cx, cy), nh = gh * f;
      if (nh < plan.hMin) { gh = plan.hMin; if (f < 0.999 && Math.abs(h - plan.hMin) < plan.hMin * 0.25) dive(before); return; }
      if (nh > plan.hMax) { gh = plan.hMax; if (f > 1.001 && Math.abs(h - plan.hMax) < plan.hMax * 0.08) surface(); return; }
      const k = 1 - nh / gh; gx += (before.x - gx) * k; gz += (before.z - gz) * k; gh = nh;
      gx = clamp(gx, -plan.bounds * 1.3, plan.bounds * 1.3); gz = clamp(gz, -plan.bounds * 1.3, plan.bounds * 1.3);
    }
    function tap(cx, cy) { try { tap0(cx, cy); } catch (e) { console.warn('[Plans] toucher', e); } }
    function tap0(cx, cy) {
      if (trans) return;
      const pt = groundAt(cx, cy), P = plan;
      if (P.kind === 'amas') {
        const tolF = Math.max(14, h * 0.03);
        let f = null, fd = tolF; for (const x of P.flights) { const d = Math.hypot(x.x - pt.x, x.z - pt.z); if (d < fd) { fd = d; f = x; } }
        if (f) return onPick({ kind: 'flight', key: f.id });
        if (!nearStar(pt.x, pt.z, Math.max(26, h * 0.03))) { const lg = legAt(P, pt.x, pt.z, Math.max(10, h * 0.02)); if (lg) return onPick({ kind: 'leg', key: lg.id }); }
        const c = cellAtWorld(pt.x / K, pt.z / K); return onPickCell(c ? c.idx : -1);
      }
      if (P.kind === 'univers') { const c = bodyAt(P, pt.x, pt.z, 1.2); if (c) showOwn(clusterCard(c)); else closeCard(); return; }
      if (P.kind === 'systeme') {
        const b = bodyAt(P, pt.x, pt.z, 2.2);
        if (!b) { const ci = ST.cell['sys:' + P.sys]; if (ci !== undefined) onPickCell(ci); return; }
        gx = b.x; gz = b.z;
        if (b.kind === 'mine') return showOwn({ k: b.wid === 'home' ? 'Ta capitale' : 'Ta colonie', t: b.name, s: 'Ton plateau de jeu : bâtiments, parcelles, défense', acts: btn('Ouvrir mon plateau ▸', 'pince dessus, ou touche ici', 'b', true), on: () => startTrans('board', b.wid, { x: b.x, z: b.z }) });
        if (b.kind === 'station' || b.kind === 'beacon') { const ci = ST.cell['sys:' + P.sys]; if (ci !== undefined) onPickCell(ci); return; }
        return onPick({ kind: b.kind, key: b.key });
      }
      if (P.kind === 'route') {
        const o = bodyAt(P, pt.x, pt.z, 2.2); if (!o) { if (P.legId) onPick({ kind: 'leg', key: P.legId }); else closeCard(); return; }
        if (o.kind === 'jalon' || o.kind === 'balise') { const ci = ST.cell['sys:' + o.key]; if (ci !== undefined) onPickCell(ci); return; }
        if (o.kind === 'flotte') return showOwn(formationCard({ kind: 'flotte', fleet: o.fleet }));
        if (o.kind === 'tanker') return showOwn(formationCard({ kind: 'tanker', mission: o.mission }));
        return showOwn(formationCard(o));
      }
      arrive();
    }
    function bindGestures(el) {
      const ptrs = new Map(); let pinch0 = 0, moved = 0, downT = 0;
      el.addEventListener('wheel', (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomBy(Math.exp(e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch (er) {} const r = el.getBoundingClientRect(); ptrs.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top }); if (ptrs.size === 1) { moved = 0; downT = performance.now(); } else moved = 99; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
      el.addEventListener('pointermove', (e) => {
        const p = ptrs.get(e.pointerId); if (!p) return; const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (ptrs.size === 1) moved += Math.abs(x - p.x) + Math.abs(y - p.y);
        if (ptrs.size === 1 && !trans && !plan.cam) { const a = groundAt(p.x, p.y), b = groundAt(x, y); gx -= b.x - a.x; gz -= b.z - a.z; gx = clamp(gx, -plan.bounds * 1.3, plan.bounds * 1.3); gz = clamp(gz, -plan.bounds * 1.3, plan.bounds * 1.3); tx = gx; tz = gz; }
        p.x = x; p.y = y;
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 && d > 0) zoomBy(pinch0 / d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch0 = d; moved = 99; }
      });
      const up = (e) => { const was = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (was && moved < 8 && !ptrs.size && performance.now() - downT < 600) tap(was.x, was.y); };
      el.addEventListener('pointerup', up); const drop = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; }; el.addEventListener('pointercancel', drop); el.addEventListener('lostpointercapture', drop);
    }

    function injectCss() {
      if (document.getElementById('pl-style')) return;
      const s = document.createElement('style'); s.id = 'pl-style';
      s.textContent = `
        .pl-fx{position:absolute;inset:0;pointer-events:none;display:none;z-index:2;width:100%;height:100%}
        .pl-hud{position:absolute;left:14px;right:84px;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);z-index:3;pointer-events:none;font:500 11px/1.35 -apple-system,system-ui,sans-serif;color:#9fb2c2}
        .pl-hud .pl-n{font:700 10px/1 -apple-system,system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#cfe6ff}
        .pl-hud .pl-p{margin-top:3px;font-size:10px;color:#6f8394;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pl-hud .pl-sc{margin-top:5px;font:600 11px/1 ui-monospace,Menlo,monospace;color:#9fd0ff}
        .pl-hud .pl-sc i{display:block;width:72px;height:5px;border:1px solid rgba(159,208,255,.55);border-top:0;margin-bottom:3px}
        .pl-hud .pl-h{margin-top:4px;font-size:11px;color:#7f93a8}
        .sm-world .smw-card.on ~ .pl-hud, .pl-card.on ~ .pl-hud{opacity:0}
        .pl-hud{transition:opacity .18s ease}
        .pl-up{position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 92px);z-index:4;padding:7px 12px;border-radius:14px;border:1px solid rgba(127,208,255,.35);background:rgba(8,14,22,.78);color:#bfe6ff;font:600 11px/1 -apple-system,system-ui,sans-serif;letter-spacing:.04em;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pl-chip{position:absolute;z-index:4;padding:6px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(10,8,20,.7);color:#f0e6ff;font:600 11px/1 -apple-system,system-ui,sans-serif;letter-spacing:.08em;display:none}
        .pl-card{position:absolute;left:10px;right:10px;bottom:calc(var(--sab,0px) + 92px);z-index:24;background:rgba(8,13,20,.95);border:1px solid rgba(127,208,255,.3);border-radius:14px;padding:12px 14px;display:none;color:#e6f0ff;font-family:-apple-system,system-ui,sans-serif}
        .pl-card.on{display:block}
        .pl-card .pl-cx{position:absolute;right:8px;top:6px;background:none;border:0;color:#9aa6b4;font-size:22px;line-height:1}
        .pl-card .pl-k{font-size:10px;letter-spacing:.14em;color:#7fd0ff;text-transform:uppercase;padding-right:24px}
        .pl-card .pl-t{font-weight:700;font-size:15px;margin-top:2px}
        .pl-card .pl-s{font-size:11.5px;color:#9fb2c2;margin-top:3px}
        .pl-card .pl-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .pl-b{flex:1 1 45%;padding:9px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:#e6f0ff;text-align:left;font:600 12px/1.25 -apple-system,system-ui,sans-serif}
        .pl-b.on{border-color:rgba(127,208,255,.6);background:rgba(47,143,208,.25)}
        .pl-b small{display:block;font-weight:400;font-size:10.5px;color:#9fb2c2}
        .pl-xtra{margin:0 0 6px}
        .sm-world .smw-hint{display:none!important}
        /* la fiche de l'ancienne carte, habillée comme la fiche du labo (Adrien, 01/11) : compacte, actions en grille */
        .pl-on .smw-card{background:rgba(8,13,20,.95);border:1px solid rgba(127,208,255,.3);border-radius:14px;padding:12px 14px 13px;font-family:-apple-system,system-ui,sans-serif;max-height:50%;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
        .pl-on .smw-card .smw-cx{top:2px;right:2px;font-size:22px;color:#9aa6b4}
        .pl-on .smw-card .sm-panel{padding:0;margin:0;background:none;border:0;-webkit-backdrop-filter:none;backdrop-filter:none;display:flex;flex-wrap:wrap;gap:6px;align-items:stretch}
        .pl-on .smw-card .sm-panel > *{flex:1 1 100%;min-width:0}
        .pl-on .smw-card .sm-ptitle,.pl-on .smw-card .sm-psub,.pl-on .smw-card .smc-k,.pl-on .smw-card .smc-t{padding-right:30px}
        .pl-on .smw-card .sm-ptitle{font:700 15px/1.25 -apple-system,system-ui,sans-serif;letter-spacing:0;text-transform:none;color:#e6f0ff}
        .pl-on .smw-card .sm-psub{font-size:11.5px;line-height:1.4;color:#9fb2c2;letter-spacing:0;margin-top:0}
        .pl-on .smw-card .sig-next{position:relative;gap:0;margin-right:0!important}
        .pl-on .smw-card .sm-panel > .sig-next{flex:1 1 calc(50% - 6px);margin:4px 0 0!important}
        .pl-on .smw-card .smc-enter{margin:8px 0 2px!important;width:100%!important;box-sizing:border-box;padding:12px;letter-spacing:.22em}
        .pl-on .smw-card .sig-next button{min-height:50px;height:100%;padding:9px 10px 21px;border-radius:10px;align-items:flex-start;justify-content:flex-start}
        .pl-on .smw-card .sig-next .lab{font:600 12px/1.25 -apple-system,system-ui,sans-serif;letter-spacing:0;text-transform:none}
        .pl-on .smw-card .sig-next .arr{display:none}
        .pl-on .smw-card .sig-next .sub{position:absolute;left:11px;right:8px;bottom:7px;padding:0;font-size:10px;letter-spacing:0;color:#9fb2c2;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pl-on .smw-card .sig-next .off{min-height:50px;height:100%;border-radius:10px;font-size:11px}
        .pl-on .smw-card .sig-next .sub:empty{display:none}
        .pl-on .smw-card .pl-xh{margin:0 30px 8px 0}
        .pl-on .smw-card .pl-xh .pl-b{width:100%}
        .pl-xh:empty{display:none}`;
      document.head.appendChild(s);
    }

    /* ───────────── boucle ───────────── */
    function visible() { return !!(host && host.isConnected && host.offsetParent !== null && !host.closest('.screen.hidden') && !document.hidden); }
    function frame(now) {
      if (!visible()) { lastNow = now; if (trans) { const tr = trans; trans = null; drawStreaks(0); if (tr.dir === 'in' && tr.swapped) gh = h = plan.h0; } return; }
      if (!trans && now - lastCheck > 1000) { lastCheck = now; try { ctx.refreshIfChanged && ctx.refreshIfChanged(); } catch (e) {} }
      if (plan === AMAS && !trans) amasH = h;
      const dt = Math.min((now - (lastNow || now)) / 1000, 0.05); lastNow = now; tOff += dt; const time = tOff;
      if (trans) stepTrans(dt);
      else { const k = 1 - Math.exp(-dt * 7); h += (gh - h) * k; tx += (gx - tx) * k; tz += (gz - tz) * k; }
      // une fiche ouverte en bas : on remonte la vue pour qu'elle ne cache pas ce qu'on regarde
      if (!oldCard || !oldCard.isConnected) oldCard = scrEl && scrEl.querySelector('.smw-card');
      const cardOn = (card && card.classList.contains('on')) || (oldCard && oldCard.classList.contains('on'));
      offZ += ((cardOn && !trans ? h * 0.3 : 0) - offZ) * Math.min(1, dt * 6);
      if (plan.cam && !trans) plan.cam(camera, time); else { camera.position.set(tx, h, tz + offZ + h * TILT); camera.lookAt(tx, 0, tz + offZ); }
      const sc = h * 0.0105;
      plan.scene.traverse(o => { if (o.isSprite && o.userData.ar) { const s = sc * o.userData.k; o.scale.set(s * o.userData.ar, s, 1); } });
      plan.update(time, h, dt);
      if (plan.kind === 'station' && !trans && !plan._auto && h < 95) { plan._auto = true; arrive(); }
      if (hud) hud.querySelector('.pl-sc span').textContent = fmtLen(h * 1.2 * plan.unit);
      renderer.render(plan.scene, camera);
    }
    function resize() {
      if (!host) return; const w = Math.max(1, host.clientWidth), hh = Math.max(1, host.clientHeight);
      renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix();
      const dpr = renderer.getPixelRatio(); fx.width = Math.round(w * dpr); fx.height = Math.round(hh * dpr);
    }

    /* ───────────── interface attendue par spacemap.js ───────────── */
    const E2 = {
      ready: false, loading: null, renderer: null, camera: null, T: null, plans: true,
      async init(el) {
        const S = await waitSB3D(12000);
        T = this.T = S.THREE;
        { const probe = document.createElement('canvas'), gl = probe.getContext('webgl2'); if (!gl) throw new Error('WebGL2 indisponible'); try { const x = gl.getExtension('WEBGL_lose_context'); x && x.loseContext(); } catch (e) {} }
        lite = !!(window.SBPerf && SBPerf.level >= 2);
        host = el; injectCss();
        renderer = this.renderer = new T.WebGLRenderer({ antialias: !lite, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75));
        renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
        camera = this.camera = new T.PerspectiveCamera(42, 1, 0.5, 40000);
        host.innerHTML = ''; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        const cv = renderer.domElement; cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'; host.appendChild(cv);
        fx = document.createElement('canvas'); fx.className = 'pl-fx'; host.appendChild(fx); fxc = fx.getContext('2d');
        const scr = scrEl = host.closest('#scr-prospect') || host.parentNode;
        scr.classList.add('pl-on');
        hud = document.createElement('div'); hud.className = 'pl-hud'; hud.innerHTML = '<div class="pl-n"></div><div class="pl-p"></div><div class="pl-sc"><i></i><span></span></div><div class="pl-h"></div>';
        upBtn = document.createElement('button'); upBtn.className = 'pl-up'; upBtn.style.display = 'none'; upBtn.onclick = () => surface();
        card = document.createElement('div'); card.className = 'pl-card';
        scr.appendChild(card); scr.appendChild(hud); scr.appendChild(upBtn);
        bindGestures(cv);
        ro = new ResizeObserver(() => resize()); ro.observe(host); resize();
        AMAS = PLANS.amas = makeAmas();
        plan = AMAS; stack = []; tx = gx = 0; tz = gz = 0; h = gh = AMAS.h0;
        enterPlan(true);
        renderer.setAnimationLoop((now) => {
          try { frame(now); ferr = 0; }
          catch (e) { if (++ferr === 1) console.warn('[Plans] image: ' + (e && e.message) + ' ' + String(e && e.stack || '').split('\n').slice(1, 3).join(' ').replace(/https?:\/\/[^/]+\//g, '').slice(0, 160));
            if (plan !== AMAS && ferr > 3) { const bad = plan; ferr = 0; subErr++; try { trans = null; drawStreaks(0); goAmas(0, 0, AMAS.h0 * 0.6, true); delete PLANS[bad.key]; } catch (er) {} if (subErr < 6) return; }
            if (ferr > 40 || subErr >= 6) { renderer.setAnimationLoop(null); this.ready = false; safeFail('les plans plantent'); } }
        });
        onLost = (ev) => { ev.preventDefault(); if (destroyed) return; console.warn('[Plans] contexte WebGL perdu'); setTimeout(() => { if (!destroyed && renderer.getContext().isContextLost()) { renderer.setAnimationLoop(null); this.ready = false; safeFail('contexte WebGL perdu'); } }, 4000); };
        cv.addEventListener('webglcontextlost', onLost);
        this.ready = true;
        console.log('[Plans] carte des plans d’existence prête');
      },
      dist() { return plan === AMAS ? h / DIST_TO_H : 0; },
      lastAmasDist() { return amasH / DIST_TO_H; },
      paint() {},
      build(st) {
        ST = st;
        if (!AMAS) return;
        buildN++;
        try { buildAmas(AMAS, st); } catch (e) { console.warn('[Plans] amas', e); }
        try { if (plan && plan.refresh) plan.refresh(); for (const s of stack) if (s.plan.refresh) s.plan.refresh(); } catch (e) { console.warn('[Plans] plan', e); }
      },
      setSelection(idx, ck) {
        selIdx = (idx == null || idx < 0) ? -1 : idx; selCk = ck || null;
        applySel(AMAS);
        if (plan && plan.kind === 'systeme') syncSysSel(plan);
        if (ctx.hasSel && ctx.hasSel()) closeCard();
      },
      highlightRoute(id) { hiRoute = id || null; applyRouteHi(AMAS); },
      moveTo(x, z, dist, ms) { if (!AMAS) return; goAmas(x * K, z * K, (dist == null ? h / DIST_TO_H : dist) * DIST_TO_H, ms != null && ms <= 1); },
      // un bouton « Voir de près ▸ » sous la fiche de l'ancienne carte, quand un plan s'ouvre en dessous
      cardExtra(sel, el) {
        if (!sel || !el || trans) return false;
        let label0 = null, go = null;
        if (plan === AMAS && (sel.kind === 'system' || sel.kind === 'home')) { const ci = ST && ST.cell['sys:' + sel.key]; if (ci !== undefined) { label0 = sel.kind === 'home' ? 'Entrer dans mon système ▸' : 'Entrer dans le système ▸'; go = () => { const p = AMAS.sysPos[sel.key] || W(ci); gx = p.x; gz = p.z; gh = AMAS.hMin; setTimeout(() => { if (!trans && plan === AMAS) startTrans('in', getPlan('sys:' + sel.key, () => makeSystem(sel.key)), V(p.x, 0, p.z)); }, 450); }; } }
        else if (plan === AMAS && sel.kind === 'leg') { const lg = AMAS.legHits.find(l => l.id === sel.key); if (lg && lg.lineId) { label0 = 'Voir la ligne de près ▸'; go = () => { const x = (lg.ax + lg.bx) / 2, z = (lg.az + lg.bz) / 2; gx = x; gz = z; startTrans('in', getPlan('route:' + lg.lineId, () => makeRoute(lg.lineId, lg.npc ? (lg.pseudo || 'Ligne marchande') : 'Convoi ' + (lg.pseudo || 'impérial'), lg.id)), V(x, 0, z)); }; } }
        else if (plan.kind === 'systeme' && (sel.kind === 'planet' || sel.kind === 'target' || sel.kind === 'sig')) { const b = plan.items.find(x => x.kind === sel.kind && x.key === sel.key); if (b) { label0 = sel.kind === 'planet' ? 'S’approcher du monde ▸' : sel.kind === 'target' ? 'S’approcher du gisement ▸' : (b.obj && b.obj.resolved ? 'S’approcher du corps ▸' : 'S’approcher de l’écho ▸'); go = () => dive({ x: b.x, z: b.z }); } }
        else if (plan.kind === 'systeme' && sel.kind === 'home' && sel.key === plan.sys) { const b = plan.items.find(x => x.kind === 'mine'); if (b) { label0 = 'Ouvrir mon plateau ▸'; go = () => startTrans('board', b.wid, { x: b.x, z: b.z }); } }
        else if (plan.kind === 'systeme' && sel.kind === 'system' && sel.key === plan.sys) { const b = plan.items.find(x => x.kind === 'station'), m = plan.items.find(x => x.kind === 'mine'); if (b) { label0 = 'S’approcher de la station ▸'; go = () => dive({ x: b.x, z: b.z }); } else if (m) { label0 = m.wid === 'home' ? 'Ouvrir mon plateau ▸' : 'Ouvrir le plateau de ma colonie ▸'; go = () => startTrans('board', m.wid, { x: m.x, z: m.z }); } }
        if (!label0) return true;
        const d = document.createElement('div'); d.className = 'pl-xtra'; d.innerHTML = btn(label0, '', 'go', true);
        d.querySelector('button').onclick = (e) => { e.stopPropagation(); try { go(); } catch (er) { console.warn('[Plans]', er); } };
        el.appendChild(d);
        return true;
      },
      // diagnostic (tests)
      _state() { return { plan: plan && plan.kind, key: plan && plan.key, title: plan && plan.title, stack: stack.map(s => s.plan.kind), h, busy: !!trans, items: plan && plan.items ? plan.items.map(i => ({ kind: i.kind, key: i.key, x: i.x, z: i.z })) : [] }; },
      _dive(x, z) { dive({ x, z }); }, _surface() { surface(); }, _zoom(f) { zoomBy(f); }, _tap(x, z) { const v = V(x, 0, z).project(camera); tap((v.x + 1) / 2 * host.clientWidth, (1 - v.y) / 2 * host.clientHeight); },
      _settle() { h = gh; tx = gx; tz = gz; }, _look(x, z, hh) { gx = tx = x; gz = tz = z; if (hh) gh = h = hh; }, _sysPos(k) { return AMAS && AMAS.sysPos[k]; }, _legs() { return AMAS ? AMAS.legHits.map(l => ({ id: l.id, lineId: l.lineId, x: (l.ax + l.bx) / 2, z: (l.az + l.bz) / 2 })) : []; },
      goHome() { goAmas(0, 0, AMAS ? AMAS.h0 * 0.6 : 800); },
      planKey() { return ((plan && plan.key) || '') + ':' + buildN; },
      _resize() { resize(); },
      destroy() {
        destroyed = true;
        try { scrEl && scrEl.classList.remove('pl-on'); } catch (e) {}
        try { renderer && renderer.setAnimationLoop(null); } catch (e) {}
        try { ro && ro.disconnect(); if (onLost && renderer) renderer.domElement.removeEventListener('webglcontextlost', onLost); } catch (e) {}
        try { const st = document.getElementById('pl-style'); if (st) st.remove(); } catch (e) {}
        for (const el of [hud, card, upBtn, ...Object.values(chips)]) try { el && el.remove(); } catch (e) {}
        try { renderer && renderer.domElement.remove(); fx && fx.remove(); } catch (e) {}
        try { for (const k of Object.keys(PLANS)) disposeTree(PLANS[k].scene); if (UNIV && !PLANS.univers) disposeTree(UNIV.scene); renderer && renderer.dispose(); } catch (e) {}
        this.ready = false;
      },
    };
    return E2;
  }

  window.SBPlans = { engine, version: '20261101' };
})();
