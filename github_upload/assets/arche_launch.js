/* Starbyte — PATCH_2110_ARCHE_DEPART (v3, Adrien 21/10) : départ de l'Arche coloniale, mise en scène spatiale.
   Échelle réelle : 1 unité = 10 m. L'Arche fait 2,4 km ; la planète 6 000 km de rayon ; les nuages culminent à 8,5 km.
   Planète, atmosphère et nuages sont tracés par rayons dans deux passes plein écran (courbure exacte, aucune facette) ;
   la couche de nuages écrit sa vraie profondeur, si bien que l'Arche la traverse réellement (occlusion progressive).
   Mise en scène : plan large sur la courbure, terminateur dans l'ombre, lueur des moteurs sous les nuages,
   l'Arche émerge en silhouette, monte en accélérant devant le limbe, contre-jour du soleil rasant, caméra lente.
   Lueur des moteurs : calculée en coordonnées monde à partir des tuyères réelles (aucun glissement).
   Usage : SBArkLaunch.preload() ; SBArkLaunch.play({ name, eta, onDone, clock }). */
(function () {
  'use strict';
  const ARK_URL = 'assets/3d/sb_ak01.glb?v=20261020';
  const K = 0.1;                       // 1 unité = 10 m (l'Arche : 245 × 215 × 86)
  const R = 600000;                    // rayon planétaire (6 000 km)
  const CLOUD_TOP = 850, CLOUD_BASE = 650;   // 8,5 km / 6,5 km
  const DUR = 23.0;
  let arkP = null;

  function libs() { return window.SB3D; }
  function load(url) {
    const L = libs(); if (!L) return Promise.reject(new Error('SB3D absent'));
    return new Promise((ok, ko) => new L.GLTFLoader().load(url, ok, undefined, ko));
  }
  function preload() {
    if (!libs()) return;
    if (!arkP) arkP = load(ARK_URL).catch(e => { arkP = null; throw e; });
  }

  // hauteur du sol (y monde) à la verticale de (x, z) : la planète est centrée en (0, −R, 0)
  const surfY = (x, z) => Math.sqrt(R * R - x * x - z * z) - R;

  /* ── trajectoire (Catmull-Rom non uniforme, nœuds = instants) : départ lent, accélération continue ── */
  const KT = [0, 3.0, 5.0, 7.0, 9.0, 11.0, 13.0, 15.5, 17.5, 20.0, 23.0];
  const KA = [   // [x, altitude au-dessus du sol local, z] pour les premiers nœuds ; ensuite y monde
    // l'Arche monte entre la caméra et le soleil couchant : contre-jour partiel, le soleil à ~20° derrière elle
    [-1500, 380, -20000], [-1500, 560, -20000], [-1490, 950, -19900], [-1420, 1800, -18800], [-1250, 3900, -16200],
    [-900, 7000, -12000], [-500, 10000, -8000], [-80, 12850, -4000], [60, 15200, -3600], [150, 19500, -3400], [250, 27000, -3600]];
  const KP = KA.map(([x, a, z], i) => i < 5 ? [x, surfY(x, z) + a, z] : [x, a, z]);
  function curve(times, pts, t, out) {
    t = Math.max(times[0], Math.min(times[times.length - 1], t));
    let i = 0; while (i < times.length - 2 && t > times[i + 1]) i++;
    const i0 = Math.max(0, i - 1), i3 = Math.min(times.length - 1, i + 2);
    const t0 = i0 === i ? times[i] - (times[i + 1] - times[i]) : times[i0], t1 = times[i], t2 = times[i + 1], t3 = i3 === i + 1 ? times[i + 1] + (times[i + 1] - times[i]) : times[i3];
    for (let c = 0; c < 3; c++) {
      const p1 = pts[i][c], p2 = pts[i + 1][c];
      const p0 = i0 === i ? 2 * p1 - p2 : pts[i0][c], p3 = i3 === i + 1 ? 2 * p2 - p1 : pts[i3][c];
      const A1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1;
      const A2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2;
      const A3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3;
      const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
      const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
      out[c] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
    }
    return out;
  }
  const pathAt = (t, out) => curve(KT, KP, t, out);
  // caméra : lente dérive vers l'avant et vers le haut (aucun à-coup)
  const CT = [0, 8, 16, 23], CP = [[0, 12000, 0], [-120, 12250, -1100], [-300, 12700, -2450], [-380, 13150, -2900]];
  const camAt = (t, out) => curve(CT, CP, t, out);

  function play(opts = {}) {
    const L = libs();
    if (!L || !window.WebGLRenderingContext) { if (opts.onDone) opts.onDone(); return; }
    preload();
    const { THREE, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = L;
    const MOBILE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);

    /* ── calque plein écran, sans geste ── */
    const host = document.createElement('div');
    host.id = 'sb-ark-cine';
    host.style.cssText = 'position:fixed;inset:0;z-index:10050;background:#000;touch-action:none;overflow:hidden;opacity:0;transition:opacity .8s ease';
    host.innerHTML = `<style>
      #sb-ark-cine .akc-bar{position:absolute;left:0;right:0;height:9vh;background:#000;z-index:3;pointer-events:none}
      #sb-ark-cine .akc-tag{position:absolute;left:18px;top:calc(9vh + 14px);z-index:4;font:600 9px/1.4 'SF Mono',ui-monospace,monospace;letter-spacing:.24em;color:rgba(255,190,120,.85);text-transform:uppercase;opacity:0;transition:opacity 1.2s}
      #sb-ark-cine .akc-cap{position:absolute;left:0;right:0;bottom:calc(9vh + 34px);z-index:4;text-align:center;opacity:0;transition:opacity 1.6s;pointer-events:none}
      #sb-ark-cine .akc-cap b{display:block;font:600 15px/1.3 -apple-system,'SF Pro Display',system-ui,sans-serif;letter-spacing:.32em;color:#ffd9a8;text-transform:uppercase;text-shadow:0 0 18px rgba(255,150,60,.35)}
      #sb-ark-cine .akc-cap span{display:block;margin-top:8px;font:500 10px/1.4 'SF Mono',ui-monospace,monospace;letter-spacing:.2em;color:rgba(214,226,240,.78);text-transform:uppercase}
      #sb-ark-cine .akc-skip{position:absolute;right:14px;top:calc(9vh + 8px);z-index:5;background:none;border:1px solid rgba(255,255,255,.18);border-radius:14px;color:rgba(255,255,255,.55);font:500 10px/1 -apple-system,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:7px 11px;opacity:0;transition:opacity .8s}
      #sb-ark-cine canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
    </style><div class="akc-bar" style="top:0"></div><div class="akc-bar" style="bottom:0"></div><div class="akc-tag">AK-01 · Arche coloniale · départ</div>
      <div class="akc-cap"><b>L'Arche a quitté l'orbite</b><span></span></div><button class="akc-skip">Passer</button>`;
    host.querySelector('.akc-cap span').textContent = `Cap sur ${opts.name || 'sa nouvelle planète'}${opts.eta ? ' · arrivée dans ' + opts.eta : ''}`;
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    for (const ev of ['touchstart', 'touchmove', 'wheel', 'pointerdown', 'pointermove', 'gesturestart', 'dblclick']) host.addEventListener(ev, e => { if (!(e.target && e.target.classList && e.target.classList.contains('akc-skip'))) stop(e); }, { passive: false });
    document.body.appendChild(host);
    requestAnimationFrame(() => { host.style.opacity = '1'; });
    window.__sbCinema = true;

    const W = () => Math.max(1, host.clientWidth), H = () => Math.max(1, host.clientHeight);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.3 : 2));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.insertBefore(renderer.domElement, host.firstChild);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.07;   // reflets d'ambiance à peine : la lumière vient du soleil et de la planète
    const camera = new THREE.PerspectiveCamera(W() / H() < 0.8 ? 54 : 40, W() / H(), 4, 3.0e6);

    /* ── soleil : bas, devant et un peu à gauche ; il vient de se coucher pour le sol sous la caméra ── */
    const SUN = (() => { const el = -2.3 * Math.PI / 180, az = -9 * Math.PI / 180; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize(); })();
    const T = { value: 0 };
    const U = {   // uniformes partagés par les passes plein écran
      uT: T, uSun: { value: SUN }, uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() },
      uEng: { value: new THREE.Vector3(0, -1e6, 0) }, uEngI: { value: 0 },
      uArk: { value: new THREE.Vector3(0, -1e6, 0) }, uWake: { value: 0 }, uPV: { value: new THREE.Matrix4() },
    };
    const GLSL = `
      uniform float uT, uEngI, uWake; uniform vec3 uSun, uEng, uArk; uniform mat4 uInvProj, uCamW, uPV;
      varying vec2 vNdc;
      const float R = ${R.toFixed(1)}; const float CT = ${CLOUD_TOP.toFixed(1)}; const float CB = ${CLOUD_BASE.toFixed(1)};
      float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p, int oct){ float s = 0., a = .5; for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
      vec3 rayDir(){ vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0); v /= v.w; return normalize((uCamW * vec4(v.xyz, 0.0)).xyz); }
      // intersection rayon / sphère centrée sur la planète, en coordonnées normalisées (rayon planétaire = 1) : précision assurée
      vec2 hitSphere(vec3 o, vec3 d, float r){ float b = dot(o, d); float c = dot(o, o) - r * r; float h = b * b - c; if (h < 0.0) return vec2(-1.0); h = sqrt(h); return vec2(-b - h, -b + h); }
      // nuages : systèmes météo (fronts, spirales par déformation du domaine), cumulus fins, zones dégagées
      float cloudDen(vec3 n, float lod){
        vec3 q = n * 34.0;
        vec3 w = vec3(fbm(q * .6 + 3.1, 3), fbm(q * .6 + 7.7, 3), fbm(q * .6 + 1.3, 3));
        float sys = fbm(q * .35 + w * 2.2, 4);                       // grandes masses organisées
        float fil = fbm(q * 2.6 + w * 3.5, 4);                        // filaments étirés
        float cell = mix(.55, fbm(n * 1500.0 + vec3(uT * .01, 0.0, 0.0), 4), lod);   // cumulus (estompés au loin)
        float front = smoothstep(.38, .62, fbm(n * 6.0 + 11.0, 4));        // fronts : de vastes régions dégagées entre les systèmes
        float d = smoothstep(.46, .72, sys + (fil - .5) * .4) * (.25 + .75 * front);
        d *= .45 + .55 * smoothstep(.3, .75, cell);
        // la trouée laissée par l'Arche
        vec3 ap = normalize(uArk + vec3(0.0, R, 0.0));
        float dd = acos(clamp(dot(n, ap), -1.0, 1.0)) * R;
        d *= mix(1.0, smoothstep(140.0, 520.0, dd + (cell - .5) * 260.0), uWake);
        return d;
      }
    `;
    const quad = (frag, extra) => {
      const m = new THREE.ShaderMaterial(Object.assign({
        uniforms: U, depthWrite: false,
        vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }',
        fragmentShader: GLSL + frag,
      }, extra || {}));
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; return q;
    };

    /* ── passe 1 : ciel, soleil, sol de la planète, atmosphère (rien n'écrit la profondeur) ── */
    const bg = quad(`
      vec3 sky(vec3 d){
        vec3 col = vec3(.002,.004,.010);
        vec3 axis = normalize(vec3(.55,.75,.35));
        float band = exp(-pow(dot(d, axis) * 1.8, 2.0));
        float neb = band * smoothstep(.4, .85, fbm(d * 3.2, 5));
        col += mix(vec3(.05,.10,.40), vec3(.25,.07,.40), fbm(d * 2.1 + 7.0, 3)) * neb * .35;
        vec3 g3 = d * 520.0; vec3 sc = floor(g3); float st = h3(sc);
        vec3 off = vec3(h3(sc + 1.7), h3(sc + 4.3), h3(sc + 8.9)) * .6 + .2;
        float pt = 1.0 - smoothstep(.0, .09, length(fract(g3) - off));
        col += vec3(.85,.9,1.0) * step(.985, st) * pt * (.25 + .75 * h3(sc + 3.1)) * 1.4;
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0,.92,.82) * smoothstep(.99990, .99995, s) * 16.0 + vec3(1.0,.75,.5) * pow(s, 3000.0) * 1.0 + vec3(.9,.6,.4) * pow(s, 500.0) * .06;
        return col;
      }
      void main(){
        vec3 rd = rayDir();
        vec3 o = (cameraPosition + vec3(0.0, R, 0.0)) / R;           // caméra en rayons planétaires
        vec2 hg = hitSphere(o, rd, 1.0);
        vec3 col;
        float atmR = 1.0 + 60.0 / 6000.0;                             // haute atmosphère : 60 km
        if (hg.x > 0.0){
          vec3 p = o + rd * hg.x; vec3 n = normalize(p);
          // continents : déformation du domaine, côtes découpées ; relief suggéré par la pente du bruit
          vec3 q = n * 9.0;
          vec3 w = vec3(fbm(q + 2.0, 3), fbm(q + 5.3, 3), fbm(q + 9.1, 3));
          float cont = fbm(q * .9 + w * 1.6, 6);
          float land = smoothstep(.505, .53, cont);
          float rel = fbm(n * 160.0 + w, 5);
          float relx = fbm(n * 160.0 + w + vec3(.012, .0, .009) * 160.0, 5);
          float dry = smoothstep(.35, .7, fbm(n * 22.0 + 4.0, 4));
          vec3 vegC = mix(vec3(.035,.055,.03), vec3(.06,.07,.035), fbm(n * 60.0, 3));
          vec3 dryC = mix(vec3(.11,.09,.06), vec3(.16,.13,.09), rel);
          vec3 lc = mix(vegC, dryC, dry);
          lc = mix(lc, vec3(.09,.085,.08), smoothstep(.62, .78, rel) * .8);   // massifs
          lc *= .75 + .5 * clamp((relx - rel) * 9.0 + .5, 0.0, 1.0);          // relief éclairé de biais
          vec3 oc = mix(vec3(.004,.016,.035), vec3(.01,.035,.06), smoothstep(.46, .505, cont));  // hauts-fonds près des côtes
          vec3 base = mix(oc, lc, land);
          float mu = dot(n, uSun);
          float day = smoothstep(-.02, .14, mu);
          // ombre des nuages portée sur le sol (soleil rasant : longues ombres)
          vec3 sp = normalize(n + uSun * (CT / R) / max(mu, .05));
          float sh = 1.0 - smoothstep(.1, .6, cloudDen(sp, 0.0)) * .75;
          col = base * day * sh * vec3(1.0,.88,.75) * 1.6;
          // reflet du soleil sur les océans
          vec3 h = normalize(uSun - rd);
          col += vec3(1.0,.8,.6) * pow(max(dot(n, h), 0.0), 2500.0) * (1.0 - land) * day * sh * 1.2;
          // perspective aérienne : voile bleu dense vers l'horizon, ambre au terminateur
          float dist = hg.x * R;
          float haze = 1.0 - exp(-dist / 1400000.0);
          vec3 hz = mix(vec3(.26,.40,.66), vec3(.62,.36,.26), smoothstep(.12, -.01, mu)) * smoothstep(-.05, .06, mu);
          col = mix(col, hz, haze * .85);
        } else {
          col = sky(rd);
        }
        // limbe : fine couche d'atmosphère (lumière diffusée) autour de la planète
        float b = dot(o, rd); vec3 cpt = o - rd * b; float hmin = length(cpt) - 1.0;   // altitude minimale du rayon
        if (b < 0.0 || hg.x > 0.0){
          float hm = hg.x > 0.0 ? 0.0 : hmin;
          float tt = hg.x > 0.0 ? hg.x : -b;
          vec3 pmid = normalize(o + rd * tt);
          float mu = dot(pmid, uSun);
          float lit = smoothstep(-.18, .1, mu);
          float glow = exp(-hm * 6000.0 / 9.0) * smoothstep(atmR - 1.0, 0.0, hm);
          vec3 ac = mix(vec3(.25,.48,1.0), vec3(1.0,.55,.25), smoothstep(.2, -.05, mu));
          float fwd = pow(max(dot(rd, uSun), 0.0), 6.0);
          if (hg.x <= 0.0) col += ac * glow * lit * (.55 + 1.6 * fwd);
        }
        gl_FragColor = vec4(col, 1.0);
      }`, { depthTest: false });
    bg.renderOrder = -100; scene.add(bg);

    /* ── passe 3 : la couche de nuages (après l'Arche), avec sa vraie profondeur ── */
    const clouds = quad(`
      void main(){
        vec3 rd = rayDir();
        vec3 o = (cameraPosition + vec3(0.0, R, 0.0)) / R;
        vec2 ht = hitSphere(o, rd, 1.0 + CT / R);
        if (ht.x <= 0.0) discard;
        vec3 n = normalize(o + rd * ht.x);
        float lod = 1.0 - smoothstep(9000.0, 45000.0, ht.x * R);
        float den = cloudDen(n, lod);
        // lueur des moteurs : en coordonnées monde, depuis les tuyères réelles ; décroît avec la distance et l'altitude
        vec3 pw = (o + rd * ht.x) * R - vec3(0.0, R, 0.0);
        vec3 de = pw - uEng; float ed = length(de);
        float eg = uEngI / (1.0 + pow(ed / 300.0, 2.0));
        float thin = smoothstep(.0, .7, eg);                             // la couche s'éclaircit au-dessus de la source
        float a = clamp(den * 1.15 - thin * .55, 0.0, 1.0);
        if (a < .01 && eg < .01) discard;
        // éclairage : sommets au soleil, flancs et creux dans l'ombre (gradient de densité vers le soleil), terminateur
        vec3 ts = normalize(uSun - n * dot(uSun, n));
        float dS = cloudDen(normalize(n + ts * (mix(2500.0, 180.0, lod) / R)), lod);
        float top = clamp((den - dS) * 2.6 + .55, 0.0, 1.0);
        float mu = dot(n, uSun);
        float day = smoothstep(-.012, .13, mu);                          // les sommets restent éclairés un peu après le sol
        vec3 sunC = mix(vec3(1.0,.42,.20), vec3(1.0,.92,.82), smoothstep(.005, .12, mu));   // rose-orangé au terminateur, blanc en plein jour
        vec3 shadowC = mix(vec3(.05,.07,.13), vec3(.30,.36,.48), smoothstep(.0, .12, mu));
        vec3 col = mix(shadowC, sunC, top) * day * mix(.6, 1.1, den);
        col *= 1.0 - .35 * smoothstep(.45, .1, den);                     // bords effilochés plus sombres : on sent l'épaisseur
        col += vec3(.055,.07,.12) * den * (1.0 - day);                    // côté nuit : à peine visibles (lumière cendrée)
        col += vec3(1.0,.42,.14) * eg * 1.8 * (.5 + .5 * den);
        float dist = ht.x * R;
        float haze = 1.0 - exp(-dist / 1400000.0);
        vec3 hz = mix(vec3(.26,.40,.66), vec3(.62,.36,.26), smoothstep(.12, -.01, mu)) * smoothstep(-.05, .06, mu);
        col = mix(col, hz, haze * .8);
        a = max(a, min(eg * .5, .6));
        // profondeur réelle du sommet des nuages : l'Arche dessous est masquée, au-dessus elle passe devant
        vec4 clip = uPV * vec4(pw, 1.0);
        gl_FragDepth = clamp(clip.z / clip.w * .5 + .5, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }`, { transparent: true, depthTest: true });
    clouds.renderOrder = 10; scene.add(clouds);

    /* ── volume local : panaches de la percée (épaisseur de la couche, poussés par l'Arche) ── */
    const puffTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * 30, x = 64 + Math.cos(a) * rr, y = 64 + Math.sin(a) * rr * .8, r = 14 + Math.random() * 20;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(.7, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
      g.globalCompositeOperation = 'destination-in';
      const mk = g.createRadialGradient(64, 64, 20, 64, 64, 62); mk.addColorStop(0, 'rgba(0,0,0,1)'); mk.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = mk; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    /* ── lumières : soleil rasant (contre-jour), lumière renvoyée par la planète, très peu d'environnement ── */
    const key = new THREE.DirectionalLight(0xffe0c0, 3.6); key.position.copy(SUN).multiplyScalar(5000); scene.add(key);
    const bounce = new THREE.HemisphereLight(0x06080e, 0x2a3c5c, 0.95); scene.add(bounce);
    const engLight = new THREE.PointLight(0xff8a3a, 0, 260, 2.0);   // n'éclaire que la poupe scene.add(engLight);

    /* ── Arche, panaches, particules ── */
    const ark = new THREE.Group(); ark.visible = false; scene.add(ark);
    const frost = { value: 1 };
    const sunView = { value: new THREE.Vector3() };
    const plumes = new THREE.Group(); ark.add(plumes);
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const plumeMat = (color, alpha, layer) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uT: T, uC: { value: new THREE.Color(color) }, uA: { value: alpha }, uL: { value: layer } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uT, uA, uL; uniform vec3 uC; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
        void main(){ float t = vUv.y; float along = pow(t, 1.3 + uL) * smoothstep(0.0,.1,t);
          float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.1 + uL);
          float turb = .85 + .15 * vn(vec2(vUv.x * 6.0, t * 8.0 - uT * 9.0));
          float a = uA * along * core * turb; gl_FragColor = vec4(mix(uC * vec3(.8,.75,1.1), uC, t) * a, a); }`,
    });
    let ready = false, failed = false, tStart = 0;
    const hullPts = [], cornerPts = [], nozzles = [];
    arkP.then(gltf => {
      if (!alive) return;
      const root = gltf.scene.clone(true);
      root.scale.setScalar(K);
      root.updateMatrixWorld(true);
      root.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        const n = o.material.name || '';
        const m = o.material.clone(); o.material = m;
        m.envMapIntensity = .12;
        if (/HULL|STEEL|GUNMETAL|DARK|ORANGE/.test(n)) {
          if (/HULL/.test(n)) { m.color.multiplyScalar(.42); m.roughness = .68; m.metalness = .05; }
          else { m.roughness = Math.max(m.roughness, .55); m.color.multiplyScalar(.8); }
          // contre-jour : liseré lumineux sur les arêtes tournées vers le soleil ; givre qui blanchit puis se détache
          m.onBeforeCompile = sh => {
            sh.uniforms.uFrost = frost; sh.uniforms.uSunV = sunView;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = position;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP; uniform float uFrost; uniform vec3 uSunV;\nfloat fh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }')
              .replace('#include <color_fragment>', '#include <color_fragment>\n{ float nn = fh(floor(vFP * .9)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62,.70,.80), uFrost * (.10 + .14 * nn)); }')
              .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 nv = normalize(normal); vec3 vv = normalize(vViewPosition);
  float edge = pow(1.0 - abs(dot(nv, vv)), 3.0);
  float toward = smoothstep(-.05, .45, dot(nv, uSunV));
  float behind = smoothstep(-.3, .6, dot(-vv, uSunV));
  totalEmissiveRadiance += vec3(1.0,.78,.55) * edge * toward * behind * 1.6;
  totalEmissiveRadiance += vec3(.7,.85,1.0) * uFrost * step(.988, fh(floor(vFP * .35))) * .9; }`);
          };
          m.customProgramCacheKey = () => 'akrim';
        }
        if (/GLASS/.test(n)) { m.transparent = true; m.opacity = .2; m.depthWrite = false; }
        if (/GLOW_MOTEUR/.test(n)) m.emissiveIntensity = 9;
        else if (/NAV|BEACON/.test(n)) m.emissiveIntensity *= .5;                      // feux de navigation : de petites pointes
        else if (m.emissive && m.emissiveIntensity > 1) m.emissiveIntensity *= /WIN/.test(n) ? .12 : .06;   // bandeaux et hublots en veille : la coque reste sombre
      });
      const v = new THREE.Vector3();
      root.traverse(o => {
        if (!o.isMesh || !/HULL|STEEL|DARK/.test(o.material.name || '')) return;
        const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 60));
        for (let i = 0; i < pos.count && hullPts.length < 1400; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); hullPts.push(v.clone()); }
      });
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cornerPts.push(new THREE.Vector3(Math.cos(a) * 1222 * K, 330 * K, Math.sin(a) * 1060 * K)); }
      ark.add(root);
      for (const x of [-100, 0, 92]) {
        const g = new THREE.Group(); g.position.set(x * K, 300 * K, -1015 * K); nozzles.push(g.position.clone());
        for (const [len, rIn, rOut, col, a, l] of [[150, 9, 2, 0xff5a1a, .16, 0], [110, 7, 1.2, 0xff8a2a, .26, .7], [70, 5, .6, 0xffc070, .4, 1.4], [32, 3, .3, 0xfff2d8, .55, 2.2]]) {
          const geo = new THREE.CylinderGeometry(rIn, rOut, len, 24, 1, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len / 2);
          const pm2 = new THREE.Mesh(geo, plumeMat(col, a, l)); pm2.frustumCulled = false; pm2.renderOrder = 4; g.add(pm2);
        }
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .8 }));
        sp.scale.setScalar(34); g.add(sp);
        plumes.add(g);
      }
      buildParticles();
      ready = true;
    }).catch(e => { console.warn('[Arche]', e); failed = true; });

    /* ── repère de l'Arche à l'instant t ── */
    const _a = [0, 0, 0], _b = [0, 0, 0];
    function arkFrame(t, outPos, outQuat, outVel) {
      pathAt(t, _a); pathAt(t + .05, _b);
      outPos.set(_a[0], _a[1], _a[2]);
      const vel = new THREE.Vector3(_b[0] - _a[0], _b[1] - _a[1], _b[2] - _a[2]).multiplyScalar(20);
      if (outVel) outVel.copy(vel);
      if (outQuat) {
        // la proue suit la trajectoire ; le ventre regarde la planète
        const f = vel.lengthSq() > 1 ? vel.clone().normalize() : new THREE.Vector3(0, 1, 0);
        const ref = new THREE.Vector3(0, 0, 1);
        let right = new THREE.Vector3().crossVectors(f, ref); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
        const up = new THREE.Vector3().crossVectors(f, right).normalize();
        const m = new THREE.Matrix4().makeBasis(right, up.negate(), f);
        outQuat.setFromRotationMatrix(m);
        outQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(t * .22) * .03));
      }
    }

    /* ── particules : condensation dans l'atmosphère, glace qui se détache dans le vide ── */
    const parts = [];
    function buildParticles() {
      const P = new THREE.Vector3(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), M = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
      const mk = (N, blending, frag, gen, minPx) => {
        const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), aB = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
          const r = gen(i);
          pos.set([r.p.x, r.p.y, r.p.z], i * 3); vel.set([r.v.x, r.v.y, r.v.z], i * 3); aB.set([r.tb, r.life, r.size, Math.random()], i * 4);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aV', new THREE.BufferAttribute(vel, 3)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending,
          uniforms: { uT: T, uPR: { value: renderer.getPixelRatio() }, uH: { value: H() }, uMap: { value: puffTex }, uMin: { value: minPx } },
          vertexShader: `attribute vec3 aV; attribute vec4 aB; uniform float uT, uPR, uH, uMin; varying float vA; varying float vS; varying float vAge;
            void main(){
              float age = uT - aB.x; vS = aB.w; vAge = age / aB.y;
              if (age < 0.0 || age > aB.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
              vec3 p = position + aV * age;
              vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
              float px = aB.z * (1.0 + vAge * 1.6) * uH * uPR * projectionMatrix[1][1] * .5 / -mv.z;
              gl_PointSize = clamp(px, uMin * uPR, 200.0 * uPR);
              vA = smoothstep(0.0, .08, vAge) * (1.0 - smoothstep(.4, 1.0, vAge)) * smoothstep(20.0, 160.0, -mv.z) * min(1.0, px / max(uMin * uPR, .01));
            }`,
          fragmentShader: frag,
        });
        const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 20; scene.add(pts); parts.push(pts);
      };
      const nS = MOBILE ? .6 : 1;
      // condensation : traînées blanches aux pointes de l'hexagone tant que l'Arche est dans l'air
      mk(Math.round(2600 * nS), THREE.NormalBlending,
        `uniform sampler2D uMap; varying float vA; varying float vS; varying float vAge;
         void main(){ vec4 tx = texture2D(uMap, gl_PointCoord); float a = tx.a * vA * .07; if (a < .002) discard;
           gl_FragColor = vec4(mix(vec3(.92,.86,.80), vec3(.55,.62,.78), vAge), a); }`,
        i => {
          const tb = 4.6 + Math.pow(Math.random(), 1.2) * 6.0; const c = cornerPts[i % 6];
          arkFrame(tb, P, Q, V); M.compose(P, Q, one);
          const p = c.clone().add(new THREE.Vector3((Math.random() - .5) * 3, (Math.random() - .5) * 3, (Math.random() - .5) * 3)).applyMatrix4(M);
          return { p, v: V.clone().multiplyScalar(.04).add(new THREE.Vector3((Math.random() - .5) * 8, (Math.random() - .5) * 8, (Math.random() - .5) * 8)), tb, life: 2.4 + Math.random() * 2.2, size: 24 + Math.random() * 18 };
        }, 1.0);
      // éclats de glace : la glace formée dans l'atmosphère se détache et scintille au soleil rasant
      mk(Math.round(3000 * nS), THREE.AdditiveBlending,
        `uniform float uT; varying float vA; varying float vS; varying float vAge;
         void main(){ vec2 q = gl_PointCoord - .5; float d = length(q) * 2.0;
           float star = exp(-d * d * 9.0) + exp(-abs(q.x) * 40.0) * exp(-abs(q.y) * 6.0) * .4 + exp(-abs(q.y) * 40.0) * exp(-abs(q.x) * 6.0) * .4;
           float tw = .3 + .7 * pow(.5 + .5 * sin(uT * (7.0 + vS * 12.0) + vS * 60.0), 4.0);
           float a = star * vA * tw; if (a < .01) discard;
           gl_FragColor = vec4(vec3(.85,.93,1.0) * a * 1.2, a); }`,
        () => {
          const tb = 6.0 + Math.pow(Math.random(), 1.1) * 16.0;
          arkFrame(tb, P, Q, V); M.compose(P, Q, one);
          const hp = hullPts[Math.floor(Math.random() * hullPts.length)] || new THREE.Vector3();
          const p = hp.clone().applyMatrix4(M);
          return { p, v: V.clone().multiplyScalar(.05 + Math.random() * .08).add(new THREE.Vector3((Math.random() - .5) * 14, (Math.random() - .5) * 14, (Math.random() - .5) * 14)), tb, life: 2.5 + Math.random() * 3.5, size: 5 + Math.random() * 7 };
        }, 1.6);
    }

    /* ── rendu : bloom discret, hautes lumières maîtrisées ── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), .28, .45, .92); composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const onResize = () => { renderer.setSize(W(), H()); composer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize);

    let alive = true, raf = 0, ended = false, last = performance.now(), wait0 = performance.now();
    const AP = new THREE.Vector3(), AQ = new THREE.Quaternion(), AV = new THREE.Vector3();
    const CPOS = [0, 0, 0], look = new THREE.Vector3(), lookInit = new THREE.Vector3();
    const tag = host.querySelector('.akc-tag'), cap = host.querySelector('.akc-cap'), skip = host.querySelector('.akc-skip');
    setTimeout(() => { tag.style.opacity = '1'; skip.style.opacity = '1'; }, 900);
    skip.addEventListener('click', e => { e.stopPropagation(); finish(); });
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const noise = (x) => Math.sin(x * 1.7) * .5 + Math.sin(x * 3.13 + 1.3) * .3 + Math.sin(x * 5.9 + 2.1) * .2;
    const tmpV = new THREE.Vector3(), tailW = new THREE.Vector3();
    let t = 0;

    // cadrage d'ouverture : regard vers l'horizon, la lueur dans le tiers bas, le limbe dans le tiers haut
    const lookOpen = (c, out) => out.set(c[0] - 900, c[1] - 8200, c[2] - 20000);

    function frame(now) {
      if (!alive) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!ready && !failed) { if (now - wait0 > 15000) failed = true; t = 0; }
      else if (failed && !ready) { finish(); return; }
      else { if (!tStart) tStart = now; t = opts.clock ? opts.clock() : (now - tStart) / 1000; }
      T.value = t;

      arkFrame(Math.max(0, t), AP, AQ, AV);
      ark.position.copy(AP); ark.quaternion.copy(AQ); ark.visible = ready;
      ark.updateMatrixWorld(true);
      U.uArk.value.copy(AP);
      // tuyères en coordonnées monde : la lueur reste attachée aux moteurs
      tailW.set(0, 0, 0); for (const nz of nozzles) tailW.add(tmpV.copy(nz).applyMatrix4(ark.matrixWorld)); if (nozzles.length) tailW.divideScalar(nozzles.length); else tailW.copy(AP);
      U.uEng.value.copy(tailW);
      const altE = tailW.y - surfY(tailW.x, tailW.z);
      // allumage progressif, flamme stable (scintillement de 3 %), extinction de la lueur en s'éloignant des nuages
      U.uEngI.value = ready ? sstep(.3, 3.2, t) * (1 + .03 * Math.sin(t * 23)) * (1 - sstep(CLOUD_TOP + 100, CLOUD_TOP + 1800, altE)) * 2.4 : 0;
      U.uWake.value = sstep(4.3, 7.5, t);
      engLight.position.copy(tailW); engLight.intensity = ready ? 2.2e3 * sstep(1, 5, t) : 0;
      plumes.children.forEach(g => { const s = .6 + .4 * sstep(2, 7, t); g.scale.set(s, s, s * (1 + .4 * sstep(6, 12, t))); });
      frost.value = 1 - sstep(9, 20, t) * .85;


      // caméra : dérive lente ; elle accompagne l'ascension en gardant le limbe dans le cadre, puis lève les yeux
      camAt(t, CPOS);
      lookOpen(CPOS, lookInit);
      const dCam = tmpV.set(AP.x - CPOS[0], AP.y - CPOS[1], AP.z - CPOS[2]).length();
      const lift = (1 - sstep(12.5, 16, t)) * .22 * dCam;                 // laisse de l'air au-dessus : la courbure reste au cadre
      const lead = AV.clone().multiplyScalar(.25 * sstep(14, 18, t));
      const follow = sstep(4.2, 11, t);
      const tgt = new THREE.Vector3(AP.x, AP.y + lift, AP.z).add(lead);
      look.copy(lookInit).lerp(tgt, follow);
      // vibration sobre : seulement quand la masse passe au plus près
      const near = Math.pow(Math.max(0, 1 - Math.max(0, dCam - 400) / 3200), 2);
      const amp = near * 7 + sstep(5, 8, t) * (1 - sstep(16, 19, t)) * .8;
      camera.position.set(CPOS[0] + noise(t * 6.3) * amp, CPOS[1] + noise(t * 5.1 + 5) * amp, CPOS[2] + noise(t * 4.7 + 9) * amp * .6);
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      U.uCamW.value.copy(camera.matrixWorld);
      U.uInvProj.value.copy(camera.projectionMatrixInverse);
      U.uPV.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      sunView.value.copy(SUN).transformDirection(camera.matrixWorldInverse);
      bloom.strength = .26 + near * .12;

      if (t > 8.5) tag.style.opacity = '0';
      if (t > 18.5) cap.style.opacity = '1';
      if (ready && t > DUR && !opts.clock) finish();

      composer.render();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function finish() {
      if (ended) return; ended = true;
      host.style.opacity = '0';
      setTimeout(() => {
        alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()); });
        renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
        host.remove();
        window.__sbCinema = false;
        try { if (window.Planet3D && Planet3D.sync) Planet3D.sync(true); } catch (e) {}
        if (opts.onDone) opts.onDone();
      }, 850);
    }
    return { finish, get t() { return t; } };
  }

  window.SBArkLaunch = { preload, play, _pathAt: pathAt };
})();
