/* Starbyte — PATCH_2110_ARCHE_DEPART : cinématique de départ de l'Arche coloniale (Adrien 21/10).
   Caméra fixe (aucun geste) au-dessus de la mer de nuages : une lueur monte sous les nuages, l'Arche les crève,
   passe au ras de la caméra en faisant tout trembler, la caméra pivote pour la suivre, et elle s'éloigne dans
   l'espace avec son escorte, en semant derrière elle la glace formée sur sa coque pendant la traversée de l'atmosphère.
   Usage : SBArkLaunch.preload() ; SBArkLaunch.play({ name, eta, onDone }).
   Moteur 3D partagé : window.SB3D (planet3d.js). Modèles : sb_ak01.glb (Arche), sb_sr01_lod.glb (escorte). */
(function () {
  'use strict';
  const ARK_URL = 'assets/3d/sb_ak01.glb?v=20261020';
  const ESC_URL = 'assets/3d/sb_sr01_lod.glb?v=20261012-0100';
  const K = 0.1;                       // 1 unité de scène = 10 m (l'Arche : 245 × 215 × 86)
  const DUR = 16.5;                    // durée de la séquence (s), hors attente du modèle
  let arkP = null, escP = null;

  function libs() { return window.SB3D; }
  function load(url) {
    const L = libs(); if (!L) return Promise.reject(new Error('SB3D absent'));
    return new Promise((ok, ko) => new L.GLTFLoader().load(url, ok, undefined, ko));
  }
  function preload() {
    if (!libs()) return;
    if (!arkP) arkP = load(ARK_URL).catch(e => { arkP = null; throw e; });
    if (!escP) escP = load(ESC_URL).catch(() => null);
  }

  /* ── trajectoire : Catmull-Rom non uniforme dont les nœuds sont des instants (mouvement lisse dans le temps) ── */
  const KT = [0, 3.0, 4.5, 5.7, 6.7, 7.8, 9.8, 12.8, 16.5];
  const KP = [[-70, -270, -580], [-62, -150, -470], [-42, -10, -330], [30, 60, -230], [150, 82, -40],
              [260, 190, 280], [430, 800, 1350], [800, 2350, 3900], [1250, 4700, 7800]];
  function pathAt(t, out) {
    t = Math.max(KT[0], Math.min(KT[KT.length - 1], t));
    let i = 0; while (i < KT.length - 2 && t > KT[i + 1]) i++;
    const i0 = Math.max(0, i - 1), i3 = Math.min(KT.length - 1, i + 2);
    const t0 = i0 === i ? KT[i] - (KT[i + 1] - KT[i]) : KT[i0], t1 = KT[i], t2 = KT[i + 1], t3 = i3 === i + 1 ? KT[i + 1] + (KT[i + 1] - KT[i]) : KT[i3];
    for (let c = 0; c < 3; c++) {
      const p1 = KP[i][c], p2 = KP[i + 1][c];
      const p0 = i0 === i ? 2 * p1 - p2 : KP[i0][c], p3 = i3 === i + 1 ? 2 * p2 - p1 : KP[i3][c];
      const A1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1;
      const A2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2;
      const A3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3;
      const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
      const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
      out[c] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
    }
    return out;
  }

  function play(opts = {}) {
    const L = libs();
    if (!L || !window.WebGLRenderingContext) { if (opts.onDone) opts.onDone(); return; }
    preload();
    const { THREE, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = L;
    const MOBILE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);

    /* ── calque plein écran, sans geste ── */
    const host = document.createElement('div');
    host.id = 'sb-ark-cine';
    host.style.cssText = 'position:fixed;inset:0;z-index:10050;background:#000;touch-action:none;overflow:hidden;opacity:0;transition:opacity .6s ease';
    const bars = '<div class="akc-bar" style="top:0"></div><div class="akc-bar" style="bottom:0"></div>';
    host.innerHTML = `<style>
      #sb-ark-cine .akc-bar{position:absolute;left:0;right:0;height:9vh;background:#000;z-index:3;pointer-events:none}
      #sb-ark-cine .akc-tag{position:absolute;left:18px;top:calc(9vh + 14px);z-index:4;font:600 9px/1.4 'SF Mono',ui-monospace,monospace;letter-spacing:.24em;color:rgba(255,190,120,.85);text-transform:uppercase;opacity:0;transition:opacity 1.2s}
      #sb-ark-cine .akc-cap{position:absolute;left:0;right:0;bottom:calc(9vh + 34px);z-index:4;text-align:center;opacity:0;transition:opacity 1.4s;pointer-events:none}
      #sb-ark-cine .akc-cap b{display:block;font:600 15px/1.3 -apple-system,'SF Pro Display',system-ui,sans-serif;letter-spacing:.32em;color:#ffd9a8;text-transform:uppercase;text-shadow:0 0 18px rgba(255,150,60,.45)}
      #sb-ark-cine .akc-cap span{display:block;margin-top:8px;font:500 10px/1.4 'SF Mono',ui-monospace,monospace;letter-spacing:.2em;color:rgba(214,226,240,.78);text-transform:uppercase}
      #sb-ark-cine .akc-skip{position:absolute;right:14px;top:calc(9vh + 8px);z-index:5;background:none;border:1px solid rgba(255,255,255,.18);border-radius:14px;color:rgba(255,255,255,.55);font:500 10px/1 -apple-system,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:7px 11px;opacity:0;transition:opacity .8s}
      #sb-ark-cine canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
    </style>${bars}<div class="akc-tag">AK-01 · Arche coloniale · départ</div>
      <div class="akc-cap"><b>L'Arche a quitté l'orbite</b><span></span></div><button class="akc-skip">Passer</button>`;
    host.querySelector('.akc-cap span').textContent = `Cap sur ${opts.name || 'sa nouvelle planète'}${opts.eta ? ' · arrivée dans ' + opts.eta : ''}`;
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    for (const ev of ['touchstart', 'touchmove', 'wheel', 'pointerdown', 'pointermove', 'gesturestart', 'dblclick']) host.addEventListener(ev, e => { if (!(e.target && e.target.classList && e.target.classList.contains('akc-skip'))) stop(e); }, { passive: false });
    document.body.appendChild(host);
    requestAnimationFrame(() => { host.style.opacity = '1'; });
    window.__sbCinema = true;

    const W = () => Math.max(1, host.clientWidth), H = () => Math.max(1, host.clientHeight);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.35 : 2));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.78;
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.insertBefore(renderer.domElement, host.firstChild);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(W() / H() < 0.8 ? 62 : 48, W() / H(), 2, 60000);
    const CAM = new THREE.Vector3(0, 62, 0);
    camera.position.copy(CAM);

    const T = { value: 0 };
    const SUN = new THREE.Vector3(0.32, 0.30, -0.90).normalize();
    const NOISE = `float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+3.7; a*=.5; } return s; }`;

    /* ── ciel : haute atmosphère (bleu au ras de l'horizon, noir étoilé au-dessus), soleil bas ── */
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: { uSun: { value: SUN } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uSun; varying vec3 vD; ${NOISE}
        void main(){
          vec3 d = normalize(vD); float y = d.y;
          vec3 space = vec3(.003,.006,.016);
          float neb = smoothstep(.45,.85, fbm(d.xz/(abs(d.y)+.6)*2.2 + 3.0)) * smoothstep(.1,.6,y);
          space += mix(vec3(.05,.08,.32), vec3(.22,.06,.34), fbm(d.xz*1.3)) * neb * .45;
          vec3 haze = mix(vec3(.36,.36,.44), vec3(.04,.09,.26), smoothstep(.0,.13,y));
          vec3 col = mix(haze, space, smoothstep(.04,.42,y));
          float s = max(dot(d, uSun), 0.0);
          col += (vec3(1.0,.52,.20) * pow(s, 14.0) * .9 + vec3(.9,.45,.25) * pow(s, 3.0) * .12) * (1.0 - smoothstep(.0,.55,y)) + vec3(1.0,.85,.6) * pow(s, 60.0) * 1.2 + vec3(1.0,.95,.85) * smoothstep(.9994,.9998,s) * 18.0;
          col = mix(col, vec3(.5,.52,.58), smoothstep(.0,-.08,y));
          gl_FragColor = vec4(col, 1.0);
        }`,
    })));
    // étoiles
    {
      const N = 1400, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const u = Math.random() * .92 + .08, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u); pos.set([30000 * q * Math.cos(a), 30000 * u, 30000 * q * Math.sin(a)], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0xbfd0ea, transparent: true, opacity: .8, depthWrite: false })));
    }

    /* ── mer de nuages lointaine (plan) ── */
    const ENG = { value: new THREE.Vector3(0, -400, -600) }, ENGP = { value: 0 }, HOLE = { value: new THREE.Vector3(-40, 0, -330) }, HOLEK = { value: 0 }, ARKU = { value: new THREE.Vector3(0, -999, 0) };
    {
      const g = new THREE.CircleGeometry(16000, 96); g.rotateX(-Math.PI / 2);
      const m = new THREE.ShaderMaterial({
        uniforms: { uT: T, uSun: { value: SUN }, uEng: ENG, uEngP: ENGP },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float uT, uEngP; uniform vec3 uSun, uEng; varying vec3 vW; ${NOISE}
          void main(){
            vec2 p = vW.xz * .0018 + vec2(uT * .004, 0.0);
            vec2 sd = normalize(uSun.xz) * .035;
            float n = fbm(p) + (fbm(p * 3.3 + 7.0) - .5) * .35;
            float n2 = fbm(p + sd) + (fbm((p + sd) * 3.3 + 7.0) - .5) * .35;
            float shade = clamp((n - n2) * 9.0 + .5, 0.0, 1.0);          // versant au soleil / versant à l'ombre
            float cell = smoothstep(.22, .5, n);
            vec3 col = mix(vec3(.10,.13,.22), mix(vec3(.30,.35,.48), vec3(1.0,.82,.60), shade), cell);
            col *= mix(vec3(1.0), vec3(1.0,.78,.58), smoothstep(.0,1.0, dot(normalize(vec3(vW.x,0.0,vW.z)+1e-3), normalize(vec3(uSun.x,0.,uSun.z)))) * .55);
            float dist = length(vW.xz - cameraPosition.xz);
            col = mix(col, vec3(.50,.54,.64), smoothstep(1500.0, 14000.0, dist) * .8);
            float e = exp(-length(vW.xz - uEng.xz) / 110.0) * uEngP;
            col += vec3(1.0,.42,.10) * e * 3.2;
            gl_FragColor = vec4(col * .8, 1.0);
          }`,
      });
      const sea = new THREE.Mesh(g, m); sea.position.y = -6; scene.add(sea);
    }

    /* ── nuages proches : panaches (billboards instanciés) poussés par l'Arche, éclairés par ses moteurs ── */
    const puffTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      // cumulus : un chou-fleur de bulles à bord net, base plate
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * Math.PI, rr = Math.random() * 34, x = 64 + Math.cos(a) * rr * 1.25, y = 78 - Math.sin(a) * rr, r = 9 + Math.random() * 16;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.72, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
      g.globalCompositeOperation = 'destination-out'; const bf = g.createLinearGradient(0, 74, 0, 114); bf.addColorStop(0, 'rgba(0,0,0,0)'); bf.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = bf; g.fillRect(0, 74, 128, 54);
      g.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'destination-in';
      const mk = g.createRadialGradient(64, 66, 20, 64, 66, 62); mk.addColorStop(0, 'rgba(0,0,0,1)'); mk.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = mk; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); return t;
    })();
    {
      const N = MOBILE ? 230 : 320;
      const base = new THREE.PlaneGeometry(1, 1);
      const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
      const aP = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) {
        let x, z, r;
        do { r = 60 + Math.pow(Math.random(), .8) * 2600; const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.9; x = Math.cos(a) * r; z = Math.sin(a) * r; } while (false);
        if (Math.random() < .25) { x = -40 + (Math.random() - .5) * 420; z = -330 + (Math.random() - .5) * 420; }   // dense là où l'Arche va percer
        aP.set([x, -4 + Math.random() * 16, z, 40 + Math.random() * 120], i * 4);
      }
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4)); g.instanceCount = N;
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uMap: { value: puffTex }, uSun: { value: SUN }, uEng: ENG, uEngP: ENGP, uHole: HOLE, uHoleK: HOLEK, uArk: ARKU, uT: T },
        vertexShader: `attribute vec4 aP; uniform vec3 uHole, uArk, uEng; uniform float uHoleK, uT; varying vec2 vUv; varying vec3 vW; varying float vF;
          void main(){
            vUv = uv; vec3 c = aP.xyz;
            vec2 dh = c.xz - uHole.xz; float d = length(dh);
            float push = uHoleK * smoothstep(320.0, 40.0, d);
            c.xz += normalize(dh + 1e-3) * push * 150.0; c.y += push * 40.0 + uHoleK * smoothstep(200.0, 0.0, d) * sin(uT * 1.7 + aP.x) * 6.0;
            vec3 da = c - uArk; float near = smoothstep(260.0, 60.0, length(da)) * smoothstep(150.0, 320.0, length(c - cameraPosition));
            c += normalize(da + 1e-3) * near * 60.0;
            float s = aP.w * (1.0 + push * .6);
            vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            vec3 w = c + (right * position.x + up * position.y * .62) * s;
            vW = w; vF = (1.0 - smoothstep(1800.0, 2700.0, length(c.xz - cameraPosition.xz))) * smoothstep(60.0, 190.0, length(c - cameraPosition));
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }`,
        fragmentShader: `uniform sampler2D uMap; uniform vec3 uSun, uEng; uniform float uEngP; varying vec2 vUv; varying vec3 vW; varying float vF;
          void main(){
            vec4 tx = texture2D(uMap, vUv); if (tx.a < .01) discard;
            float top = smoothstep(.1, .9, vUv.y);
            float side = .5 + .5 * dot(normalize(vec2(vUv.x - .5, .2)), normalize(vec2(uSun.x, .2)));
            vec3 col = mix(vec3(.18,.22,.33), mix(vec3(.46,.50,.62), vec3(1.0,.84,.64), side), top);
            col *= .9;
            float e = exp(-length(vW.xz - uEng.xz) / 120.0) * smoothstep(-700.0, -60.0, uEng.y - vW.y) * uEngP;
            col += vec3(1.0,.42,.12) * e * 3.4 * (1.3 - top * .7);
            gl_FragColor = vec4(col, tx.a * vF);
          }`,
      });
      const puffs = new THREE.Mesh(g, m); puffs.frustumCulled = false; puffs.renderOrder = 2; scene.add(puffs);
    }

    /* ── lumières ── */
    const key = new THREE.DirectionalLight(0xffc890, 3.2); key.position.copy(SUN).multiplyScalar(4000); scene.add(key);
    scene.add(new THREE.HemisphereLight(0x3a4c74, 0x7d8494, 0.5));      // la mer de nuages renvoie la lumière par-dessous
    const engLight = new THREE.PointLight(0xff8a3a, 0, 900, 1.4); scene.add(engLight);

    /* ── Arche, escorte, panaches, particules : montés quand le modèle est là ── */
    const ark = new THREE.Group(); ark.visible = false; scene.add(ark);
    const frost = { value: 1 };
    const plumes = new THREE.Group(); ark.add(plumes);
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const plumeMat = (color, alpha, layer) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uT: T, uC: { value: new THREE.Color(color) }, uA: { value: alpha }, uL: { value: layer } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uT, uA, uL; uniform vec3 uC; varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${NOISE}
        void main(){ float t = vUv.y; float along = pow(t, 1.3 + uL) * smoothstep(0.0,.1,t);
          float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.1 + uL);
          float turb = .7 + .3 * vn(vec2(vUv.x * 6.0, t * 8.0 - uT * 9.0));
          float a = uA * along * core * turb; gl_FragColor = vec4(mix(uC * vec3(.8,.75,1.1), uC, t) * a, a); }`,
    });
    const escorts = [];
    let ready = false, failed = false, tStart = 0;
    const hullPts = [];             // échantillon de points de coque (repère de l'Arche), pour la glace
    const cornerPts = [];           // les six pointes de l'hexagone (traînées de givre)
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
        if (/HULL|STEEL|GUNMETAL|DARK|ORANGE/.test(n)) {
          m.envMapIntensity = .3; if (/HULL/.test(n)) { m.roughness = .55; m.color.multiplyScalar(.5); }
          m.onBeforeCompile = sh => {       // givre : la coque blanchit et scintille, puis la glace se détache
            sh.uniforms.uFrost = frost;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = position;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP; uniform float uFrost;\nfloat fh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }')
              .replace('#include <color_fragment>', '#include <color_fragment>\n{ float n = fh(floor(vFP * .9)); float f = uFrost * (.10 + .16 * n); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.84,.92,1.0), f); }')
              .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float g = fh(floor(vFP * .35)); totalEmissiveRadiance += vec3(.7,.85,1.0) * uFrost * step(.985, g) * 2.5; }');
          };
          m.customProgramCacheKey = () => 'akfrost';
        }
        if (/GLASS/.test(n)) { m.transparent = true; m.opacity = .2; m.depthWrite = false; }
        if (/GLOW_MOTEUR/.test(n)) { m.emissiveIntensity = 14; }
      });
      // points de coque pour la glace (sur les faces extérieures)
      const v = new THREE.Vector3();
      root.traverse(o => {
        if (!o.isMesh || !/HULL|STEEL|DARK/.test(o.material.name || '')) return;
        const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 60));
        for (let i = 0; i < pos.count && hullPts.length < 1400; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); hullPts.push(v.clone()); }
      });
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cornerPts.push(new THREE.Vector3(Math.cos(a) * 1222 * K, 330 * K, Math.sin(a) * 1060 * K)); }
      ark.add(root);
      // tuyères : porte arrière (z = −1012), trois panaches orange
      for (const x of [-100, 0, 92]) {
        const g = new THREE.Group(); g.position.set(x * K, 300 * K, -1015 * K);
        for (const [len, rIn, rOut, col, a, l] of [[260, 9, 2, 0xff5a1a, .18, 0], [190, 7, 1.2, 0xff8a2a, .3, .7], [120, 5, .6, 0xffc070, .45, 1.4], [55, 3, .3, 0xfff2d8, .6, 2.2]]) {
          const geo = new THREE.CylinderGeometry(rIn, rOut, len, 24, 1, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len / 2);
          const pm2 = new THREE.Mesh(geo, plumeMat(col, a, l)); pm2.frustumCulled = false; pm2.renderOrder = 4; g.add(pm2);
        }
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.scale.setScalar(70); g.add(sp);
        plumes.add(g);
      }
      buildParticles();
      return escP;
    }).then(eg => {
      if (!alive) return;
      if (eg && eg.scene) {
        for (const [ox, oy, oz, ph] of [[-205, 30, 40, 0], [215, 45, -10, 1.7], [30, 95, -60, 3.1], [0, 0, 0, -1]]) {
          const e = eg.scene.clone(true); e.scale.setScalar(K); e.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
          const holder = new THREE.Group(); holder.add(e);
          const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ccaff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          gl.position.set(0, .44, -3.6); gl.scale.setScalar(6); holder.add(gl);
          scene.add(holder); escorts.push({ holder, off: new THREE.Vector3(ox, oy, oz), ph, fly: ph < 0 });
        }
      }
      ready = true;
    }).catch(e => { console.warn('[Arche]', e); failed = true; });

    /* ── repère de l'Arche à l'instant t (position, orientation) ── */
    const _a = [0, 0, 0], _b = [0, 0, 0];
    const UPW = new THREE.Vector3(0, 1, 0);
    function arkFrame(t, outPos, outQuat, outVel) {
      pathAt(t, _a); pathAt(t + .05, _b);
      outPos.set(_a[0], _a[1], _a[2]);
      const vel = new THREE.Vector3(_b[0] - _a[0], _b[1] - _a[1], _b[2] - _a[2]).multiplyScalar(20);
      if (outVel) outVel.copy(vel);
      if (outQuat) {
        const f = vel.clone().normalize();
        const right = new THREE.Vector3().crossVectors(UPW, f).normalize();
        const up = new THREE.Vector3().crossVectors(f, right);
        const m = new THREE.Matrix4().makeBasis(right, up, f);
        outQuat.setFromRotationMatrix(m);
        outQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(t * .35) * .05 - .06));
      }
    }

    /* ── particules : givre (traînées des pointes), vapeur de percée, éclats de glace ── */
    let parts = [];
    function buildParticles() {
      const P = new THREE.Vector3(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), M = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
      const mk = (N, blending, frag, gen) => {
        const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), aB = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
          const r = gen(i);
          pos.set([r.p.x, r.p.y, r.p.z], i * 3); vel.set([r.v.x, r.v.y, r.v.z], i * 3); aB.set([r.tb, r.life, r.size, Math.random()], i * 4);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aV', new THREE.BufferAttribute(vel, 3)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending,
          uniforms: { uT: T, uPR: { value: renderer.getPixelRatio() }, uH: { value: H() }, uMap: { value: puffTex }, uSun: { value: SUN } },
          vertexShader: `attribute vec3 aV; attribute vec4 aB; uniform float uT, uPR, uH; varying float vA; varying float vS; varying float vAge;
            void main(){
              float age = uT - aB.x; vS = aB.w; vAge = age / aB.y;
              if (age < 0.0 || age > aB.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
              vec3 p = position + aV * age + vec3(sin(age * 1.3 + aB.w * 30.0), -.4 * age, cos(age * 1.1 + aB.w * 20.0)) * age * 1.5;
              vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
              float grow = 1.0 + vAge * 2.2;
              gl_PointSize = clamp(aB.z * grow * uH * uPR * projectionMatrix[1][1] * .5 / -mv.z, 1.0, 260.0 * uPR);
              vA = smoothstep(0.0, .08, vAge) * (1.0 - smoothstep(.45, 1.0, vAge)) * smoothstep(30.0, 120.0, -mv.z);
            }`,
          fragmentShader: frag,
        });
        const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts); parts.push(pts);
      };
      const nScale = MOBILE ? .65 : 1;
      // traînées de givre : vapeur glacée qui se condense aux six pointes de la coque (blanc, mélange normal)
      const NC = Math.round(3000 * nScale);
      mk(NC, THREE.NormalBlending,
        `uniform sampler2D uMap; varying float vA; varying float vS; varying float vAge;
         void main(){ vec4 tx = texture2D(uMap, gl_PointCoord); float a = tx.a * vA * .12; if (a < .003) discard;
           gl_FragColor = vec4(mix(vec3(.90,.96,1.0), vec3(.62,.74,.92), vAge), a); }`,
        i => {
          const tb = 4.6 + Math.random() * 9.0; const c = cornerPts[i % 6];
          arkFrame(tb, P, Q, V);
          M.compose(P, Q, one);
          const p = c.clone().add(new THREE.Vector3((Math.random() - .5) * 1.5, (Math.random() - .5) * 1.5, (Math.random() - .5) * 1.5)).applyMatrix4(M);
          return { p, v: V.clone().multiplyScalar(.06).add(new THREE.Vector3((Math.random() - .5) * 4, (Math.random() - .5) * 4, (Math.random() - .5) * 4)), tb, life: 2.0 + Math.random() * 1.8, size: 4 + Math.random() * 3 };
        });
      // vapeur de percée : gros panaches arrachés aux nuages quand l'Arche les traverse
      const NV = Math.round(160 * nScale);
      mk(NV, THREE.NormalBlending,
        `uniform sampler2D uMap; varying float vA; varying float vS; varying float vAge;
         void main(){ vec4 tx = texture2D(uMap, gl_PointCoord); float a = tx.a * vA * .5; if (a < .004) discard;
           gl_FragColor = vec4(mix(vec3(1.0,.88,.74), vec3(.80,.85,.93), vAge), a); }`,
        () => {
          const tb = 4.0 + Math.random() * 1.9;
          arkFrame(tb, P, Q, V);
          M.compose(P, Q, one);
          const hp = hullPts[Math.floor(Math.random() * hullPts.length)] || new THREE.Vector3();
          const p = hp.clone().applyMatrix4(M);
          const out = p.clone().sub(P); out.y = 0; out.normalize();
          return { p, v: V.clone().multiplyScalar(.03).add(out.multiplyScalar(14 + Math.random() * 20)).add(new THREE.Vector3(0, -6, 0)), tb, life: 1.0 + Math.random() * 1.0, size: 22 + Math.random() * 26 };
        });
      // éclats de glace : la glace formée dans l'atmosphère se détache de la coque et scintille au soleil
      const NI = Math.round(3200 * nScale);
      mk(NI, THREE.AdditiveBlending,
        `uniform float uT; varying float vA; varying float vS; varying float vAge;
         void main(){ vec2 q = gl_PointCoord - .5; float d = length(q) * 2.0;
           float star = exp(-d * d * 9.0) + exp(-abs(q.x) * 40.0) * exp(-abs(q.y) * 6.0) * .5 + exp(-abs(q.y) * 40.0) * exp(-abs(q.x) * 6.0) * .5;
           float tw = .35 + .65 * pow(.5 + .5 * sin(uT * (9.0 + vS * 14.0) + vS * 60.0), 4.0);
           float a = star * vA * tw; if (a < .01) discard;
           gl_FragColor = vec4(vec3(.82,.92,1.0) * a * 1.4, a); }`,
        () => {
          const tb = 4.4 + Math.pow(Math.random(), 1.3) * 10.5;
          arkFrame(tb, P, Q, V);
          M.compose(P, Q, one);
          const hp = hullPts[Math.floor(Math.random() * hullPts.length)] || new THREE.Vector3();
          const p = hp.clone().applyMatrix4(M);
          return { p, v: V.clone().multiplyScalar(.03 + Math.random() * .05).add(new THREE.Vector3((Math.random() - .5) * 8, (Math.random() - .5) * 8, (Math.random() - .5) * 8)), tb, life: 1.8 + Math.random() * 2.8, size: 1.4 + Math.random() * 2.4 };
        });
    }

    /* ── rendu ── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W() / 2, H() / 2), .45, .5, .85); composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const onResize = () => { renderer.setSize(W(), H()); composer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize);

    let alive = true, raf = 0, ended = false, last = performance.now(), wait0 = performance.now();
    const look = new THREE.Vector3(0, 18, -420), lookT = new THREE.Vector3();
    const AP = new THREE.Vector3(), AQ = new THREE.Quaternion(), AV = new THREE.Vector3();
    const tag = host.querySelector('.akc-tag'), cap = host.querySelector('.akc-cap'), skip = host.querySelector('.akc-skip');
    setTimeout(() => { tag.style.opacity = '1'; skip.style.opacity = '1'; }, 900);
    skip.addEventListener('click', e => { e.stopPropagation(); finish(); });
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const noise = (x) => Math.sin(x * 1.7) * .5 + Math.sin(x * 3.13 + 1.3) * .3 + Math.sin(x * 7.9 + 2.1) * .2;
    let t = 0;

    function frame(now) {
      if (!alive) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!ready && !failed) {
        if (now - wait0 > 15000) failed = true;
        t = 0;
      } else if (failed && !ready) { finish(); return; }
      else { if (!tStart) tStart = now; t = opts.clock ? opts.clock() : (now - tStart) / 1000; }
      T.value = t;

      // Arche
      arkFrame(Math.max(0, t), AP, AQ, AV);
      ark.position.copy(AP); ark.quaternion.copy(AQ); ark.visible = ready;
      ARKU.value.copy(AP);
      // moteurs : sous les nuages, la lueur monte ; puis pleine poussée
      const tail = new THREE.Vector3(0, 30, -101).applyQuaternion(AQ).add(AP);
      ENG.value.copy(t < 4.3 ? AP : tail);
      ENGP.value = ready ? (sstep(.2, 3.4, t) * (1.3 + .25 * Math.sin(t * 17)) - sstep(4.2, 6, t) * .6) * (1 - sstep(8, 11, t) * .7) : .15 + .1 * Math.sin(now / 300);
      engLight.position.copy(tail); engLight.intensity = ready ? 3.2e4 * ENGP.value : 0;
      plumes.children.forEach((g, i) => { const s = .75 + .25 * sstep(1, 5, t) + .05 * Math.sin(t * 31 + i); g.scale.set(s, s, s * (1 + .3 * sstep(4, 7, t))); });
      HOLEK.value = sstep(4.0, 5.6, t);
      frost.value = 1 - sstep(6.5, 14.5, t) * .85;

      // escorte : trois frégates en formation, une quatrième frôle la caméra juste avant l'Arche
      for (const e of escorts) {
        if (e.fly) {
          const u = sstep(3.6, 5.6, t);
          e.holder.position.set(-60 + u * 140, -40 + u * 220 + Math.sin(u * 3.1) * 30, -380 + u * 640);
          e.holder.lookAt(-60 + (u + .02) * 140, -40 + (u + .02) * 220, -380 + (u + .02) * 640);
          e.holder.visible = t > 3.4 && t < 6.2;
        } else {
          const o = e.off.clone().applyQuaternion(AQ);
          e.holder.position.copy(AP).add(o).add(new THREE.Vector3(Math.sin(t * .8 + e.ph) * 3, Math.sin(t * 1.1 + e.ph) * 2, 0));
          e.holder.quaternion.copy(AQ);
          e.holder.visible = t > 4.6;
        }
      }

      // caméra : immobile ; elle tremble au passage et pivote pour suivre l'Arche
      const follow = sstep(3.4, 5.8, t);
      lookT.set(0, 18, -420).lerp(AP.clone().add(AV.clone().multiplyScalar(.05)), follow);
      if (t > 3.4) look.lerp(lookT, 1 - Math.exp(-dt * (2.2 + follow * 2.5))); else look.copy(lookT);
      const dist = Math.max(0, camera.position.distanceTo(AP) - 110);
      const near = Math.pow(Math.max(0, 1 - dist / 420), 2);
      const rumble = sstep(2.0, 4.6, t) * (1 - sstep(8.5, 11, t));
      const amp = near * 5.5 + rumble * .9;
      const shake = new THREE.Vector3(noise(t * 23) * amp, noise(t * 19 + 5) * amp, noise(t * 17 + 9) * amp * .5);
      camera.position.copy(CAM).add(shake);
      camera.up.set(noise(t * 13 + 2) * amp * .006, 1, 0).normalize();
      camera.lookAt(look);
      bloom.strength = .45 + near * .45;

      // textes
      if (t > 1.2 && t < 1.3) tag.style.opacity = '1';
      if (t > 7.5) tag.style.opacity = '0';
      if (t > 12.2) cap.style.opacity = '1';
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
      }, 650);
    }
    return { finish, get t() { return t; } };
  }

  window.SBArkLaunch = { preload, play, _pathAt: pathAt };
})();
