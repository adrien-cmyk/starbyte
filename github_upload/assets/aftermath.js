/* Starbyte — Après l'attaque (GDD claude/starbyte_GDD_apres_attaque.md, 13/10/2026)
   Défense tenue : rapport ouvert automatiquement, feux d'artifice 2 min, banderoles 1 h.
   Défense enfoncée : indice de dévastation 0–100 (cumulatif) → production × (1 − 0,5·d), améliorations bloquées ≥ 50,
   guérison −1/h (hors ligne compris), match-3 « Secours » (palier I −3, II −6, III −10), effets visuels sur la carte.
   État : G.aftermath = { dev, partyAt, pendingReport, lastRaidAt } — sauvegardé avec la partie. */
(function () {
  const FIREWORKS_MS = 2 * 60 * 1000, BANNERS_MS = 60 * 60 * 1000;
  const ADD = { orbital: 20, repelled: 30, ground: 50 };
  const RELIEF = { 1: 3, 2: 6, 3: 10 };
  const HEAL_PER_H = 1;

  function st() {
    if (typeof G === 'undefined' || !G) return null;
    if (!G.aftermath) G.aftermath = { dev: 0, partyAt: 0, pendingReport: null, lastRaidAt: 0 };
    return G.aftermath;
  }
  const dev = () => { const s = st(); return s ? Math.max(0, Math.min(100, s.dev || 0)) : 0; };
  const save = () => { if (typeof saveGame === 'function') saveGame(); };
  const say = (m) => { if (typeof toast === 'function') toast(m); };
  const capitalIdx = () => (G.planet && G.planet.parcels || []).findIndex(p => p && (p.state === 'capital' || p.building === 'capital'));

  // production d'un segment de simulation : multiplicateur moyen + guérison naturelle (appelé par _simSegment)
  function simSegment(hours) {
    const s = st(); if (!s || !(hours > 0)) return 1;
    const d0 = dev(); if (!d0) return 1;
    const heal = hours * HEAL_PER_H;
    const integral = heal <= d0 ? hours * (d0 - heal / 2) : (d0 * d0 / 2) / HEAL_PER_H;
    s.dev = Math.max(0, d0 - heal);
    return 1 - 0.5 * (integral / hours) / 100;
  }

  // raid intégré (mpApplyRaidAgainstMe) : defended = défense tenue
  function onRaid(info) {
    const s = st(); if (!s) return;
    s.lastRaidAt = Date.now();
    if (info.reportId) s.pendingReport = info.reportId;
    if (info.defended) {
      s.partyAt = Date.now();
    } else {
      const add = info.landed ? ADD.ground : info.groundHeld ? ADD.repelled : ADD.orbital;
      s.dev = Math.min(100, dev() + add);
      s.partyAt = 0;
    }
    save(); refresh();
  }

  // bâtiments abîmés par un raid (production à moitié) : réparés par les secours, jamais par un match-3 du bâtiment
  const damagedIdx = () => (G.planet && G.planet.parcels || []).map((p, i) => p && p.damaged ? i : -1).filter(i => i >= 0)
    .sort((a, b) => (G.planet.parcels[a].damagedAt || 0) - (G.planet.parcels[b].damagedAt || 0));
  function repairOne() { const i = damagedIdx()[0]; if (i != null && typeof mpRepairParcel === 'function') { mpRepairParcel(i, { free: true }); return true; } return false; }
  function onRelief(tier) {
    const s = st(); if (!s) return;
    const r = RELIEF[Math.min(3, tier || 0)] || 0;
    if (!r) return;
    const fixed = repairOne();
    if (!dev()) { if (!fixed) return; save(); refresh(); return; }
    s.dev = Math.max(0, dev() - r);
    if (s.dev <= 0) while (repairOne()) {}
    say(s.dev > 0 ? `Secours : santé de la planète +${r} % · ${Math.round(100 - s.dev)} %` : 'Secours : la planète est remise sur pied (100 %)');
    save(); refresh();
  }

  function startRelief() {
    const i = capitalIdx();
    if (i < 0) { say('Centre de commandement introuvable'); return; }
    if (typeof window.startM3 === 'function') window.startM3(i, 'Secours'); else say('Match-3 indisponible pour le moment');
  }

  const upgradeBlocked = () => dev() >= 50;
  const partyPhase = () => {
    const s = st(); if (!s || !s.partyAt) return null;
    const t = Date.now() - s.partyAt;
    if (t > BANNERS_MS) return null;
    return { fireworks: t < FIREWORKS_MS, t };
  };

  // ── bandeau sur la carte planète ───────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
  #sb-devast { position:fixed; left:12px; right:12px; top:calc(var(--sat, env(safe-area-inset-top, 0px)) + 150px); z-index:30; display:none;
    padding:9px 12px; border-radius:10px; border:1px solid rgba(255,80,60,.45); background:rgba(40,8,6,.82); color:#ffd9d2;
    backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); font-size:12px; align-items:center; gap:10px; cursor:pointer; }
  #sb-devast b { color:#ff6a50; font-family:var(--font-mono, monospace); }
  #sb-devast .bar { flex:1; height:5px; border-radius:3px; background:rgba(255,255,255,.1); overflow:hidden; min-width:40px; }
  #sb-devast .bar i { display:block; height:100%; background:linear-gradient(90deg,#ff3a20,#ffb040 60%,#7ed080); background-size:200px 100%; transition:width .6s ease; }
  #sb-devast button { border:1px solid rgba(255,140,110,.6); background:rgba(120,20,10,.6); color:#ffe3dc; border-radius:8px; padding:6px 10px;
    font-size:10px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
  #sb-party { position:fixed; left:12px; right:12px; top:calc(var(--sat, env(safe-area-inset-top, 0px)) + 150px); z-index:30; display:none;
    padding:9px 12px; border-radius:10px; border:1px solid rgba(120,230,160,.45); background:rgba(6,30,18,.8); color:#d8ffe6;
    backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); font-size:12px; letter-spacing:.06em; align-items:center; gap:10px; }
  #sb-party span { flex:1; min-width:0; text-align:center; }
  #sb-party .sb-x { flex-shrink:0; width:26px; height:26px; border-radius:50%; border:1px solid rgba(255,255,255,.28); background:rgba(0,0,0,.3);
    color:inherit; font-size:15px; line-height:22px; text-align:center; cursor:pointer; padding:0; }`;
  document.head.appendChild(css);
  const ban = document.createElement('div'); ban.id = 'sb-devast';
  ban.innerHTML = `<span>Santé de la planète · <b>100 %</b></span><span class="bar"><i></i></span><button>Secours</button>`;
  ban.addEventListener('click', startRelief);
  const party = document.createElement('div'); party.id = 'sb-party';
  // 13/10 (Adrien) : pas de minuteur, bandeau fermable (la fête continue sur la carte)
  party.innerHTML = '<span>🎉 Raid repoussé · la colonie fait la fête</span><button class="sb-x" aria-label="Fermer">×</button>';
  party.querySelector('.sb-x').addEventListener('click', (e) => { e.stopPropagation(); const s = st(); if (s) { s.partyHidden = s.partyAt; save(); } refresh(); });
  document.body.appendChild(ban); document.body.appendChild(party);

  function onPlanet() { const s = document.getElementById('scr-planet'); return !!s && !s.classList.contains('hidden'); }
  function refresh() {
    const d = dev(), ph = partyPhase(), on = onPlanet();
    ban.style.display = on && d >= 1 ? 'flex' : 'none';
    if (d >= 1) { const hp = Math.max(0, 100 - d); ban.querySelector('b').textContent = Math.round(hp) + ' %'; ban.querySelector('.bar i').style.width = hp + '%'; }   // santé = 100 − dévastation : la jauge monte quand on soigne
    const s0 = st();
    party.style.display = on && ph && d < 1 && !(s0 && s0.partyHidden && s0.partyHidden === s0.partyAt) ? 'flex' : 'none';
    // rapport en attente : ouvert automatiquement dès que la carte est à l'écran
    const s = st();
    if (on && s && s.pendingReport && typeof openReportDetail === 'function') {
      const id = s.pendingReport; s.pendingReport = null; save();
      setTimeout(() => { try { openReportDetail(id); } catch (e) { console.warn('[aftermath] rapport', e); } }, 900);
    }
    // planète guérie d'elle-même : les bâtiments encore abîmés sont remis en état
    if (d < 1 && !refresh._fixing && damagedIdx().length) { refresh._fixing = true; try { while (repairOne()) {} } finally { refresh._fixing = false; } }
    const b = Math.round(d / 10);
    if (b !== refresh._b) { refresh._b = b; if (window.Planet3D && Planet3D.ready && Planet3D.sync) try { Planet3D.sync(); } catch (e) {} }
    if (window.SBAftermathFX) window.SBAftermathFX.update(d, ph);
  }
  setInterval(refresh, 1000);

  // ── effets 3D sur la carte ─────────────────────────────────────────────────
  // Dévastation (DA « catastrophe », 13/10/2026) : arbres en feu + flammèches, bâtiments éventrés en flammes
  // avec panache de fumée noire, débris au sol, cratères fumants, lumières en panne, forêt et ciel orangés.
  // Tout est en shaders instanciés (un seul draw par famille) pour tenir sur iPhone.
  const FX = { group: null, built: '', parts: [], fw: null, amb: null, forest: null, broken: [] };
  const U = { uT: { value: 0 }, uWind: { value: null }, uPR: { value: 2 } };
  function three() { return window.SB3D && window.SB3D.THREE; }
  function radial(T, stops) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => r.addColorStop(o, col));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
  }
  function scorchTex(T) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(6,4,3,1)'); r.addColorStop(.45, 'rgba(14,9,6,.92)'); r.addColorStop(.75, 'rgba(26,16,10,.55)'); r.addColorStop(1, 'rgba(30,20,12,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) { // projections noires irrégulières
      const a = Math.random() * 6.283, d = 30 + Math.random() * 34, s = 1 + Math.random() * 4;
      g.fillStyle = `rgba(8,5,4,${.25 + Math.random() * .5})`; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, s, 0, 6.283); g.fill();
    }
    return new T.CanvasTexture(c);
  }
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  const NOISE = `
    float sbH(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float sbN(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
      return mix(mix(sbH(i),sbH(i+vec2(1.,0.)),u.x), mix(sbH(i+vec2(0.,1.)),sbH(i+vec2(1.,1.)),u.x), u.y); }
    float sbF(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*sbN(p); p*=2.03; a*=.5; } return s; }`;

  // flammes : quads verticaux tournés vers la caméra, langues de feu en bruit fractal qui montent
  function flameMesh(T, list) {
    if (!list.length) return null;
    const base = new T.PlaneGeometry(1, 1, 1, 1); base.translate(0, .5, 0);
    const g = new T.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    const pos = new Float32Array(list.length * 3), par = new Float32Array(list.length * 3);
    list.forEach((f, i) => { pos.set([f.x, f.y, f.z], i * 3); par.set([f.w, f.h, f.seed], i * 3); });
    g.setAttribute('aPos', new T.InstancedBufferAttribute(pos, 3)); g.setAttribute('aP', new T.InstancedBufferAttribute(par, 3));
    g.instanceCount = list.length;
    const m = new T.ShaderMaterial({
      uniforms: { uT: U.uT },
      vertexShader: `uniform float uT; attribute vec3 aPos; attribute vec3 aP; varying vec2 vUv; varying float vSeed;
        void main(){ vUv = uv; vSeed = aP.z;
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          float sway = sin(uT*1.7 + aP.z*20.0)*0.10*position.y*position.y;
          vec3 wp = aPos + right*((position.x + sway)*aP.x) + vec3(0.0, position.y*aP.y, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vUv; varying float vSeed; ${NOISE}
        void main(){
          vec2 p = vec2((vUv.x-0.5)*2.0, vUv.y);
          float n1 = sbF(vec2(p.x*1.3 + vSeed*13.0, p.y*1.5 - uT*1.7));
          float n2 = sbF(vec2(p.x*3.1 - vSeed*7.0, p.y*3.3 - uT*3.2));
          p.x += (n1-0.5)*1.0*p.y;
          float w = 0.85*pow(max(1.0-p.y, 0.0), 0.7) + 0.03;
          float body = 1.0 - abs(p.x)/w;
          float f = body*0.9 - p.y*0.75 + (n2-0.5)*1.25*(0.2+p.y) + 0.18;
          float a = smoothstep(0.02, 0.22, f) * smoothstep(0.0, 0.07, vUv.y);
          if (a < 0.01) discard;
          vec3 c = mix(vec3(0.55,0.04,0.0), vec3(1.0,0.32,0.03), smoothstep(0.05,0.35,f));
          c = mix(c, vec3(1.0,0.68,0.22), smoothstep(0.42,0.85,f));
          float fl = 0.85 + 0.15*sin(uT*17.0 + vSeed*40.0);
          gl_FragColor = vec4(c*(0.55 + 1.05*smoothstep(0.3,0.95,f))*fl, a*0.95);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; return mesh;
  }

  // fumée : bouffées en billboard, bruit fractal, montent et dérivent avec le vent ; noire au-dessus des bâtiments,
  // gris-brun au-dessus des arbres, éclairée en orange par le feu à sa base
  function smokeMesh(T, list) {
    if (!list.length) return null;
    const base = new T.PlaneGeometry(1, 1);
    const g = new T.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    const pos = new Float32Array(list.length * 3), par = new Float32Array(list.length * 4), q = new Float32Array(list.length * 2);
    list.forEach((s, i) => { pos.set([s.x, s.y, s.z], i * 3); par.set([s.H, s.S, s.rate, s.seed], i * 4); q.set([s.tint, s.glow], i * 2); });
    g.setAttribute('aPos', new T.InstancedBufferAttribute(pos, 3)); g.setAttribute('aP', new T.InstancedBufferAttribute(par, 4)); g.setAttribute('aQ', new T.InstancedBufferAttribute(q, 2));
    g.instanceCount = list.length;
    const m = new T.ShaderMaterial({
      uniforms: { uT: U.uT, uWind: U.uWind },
      vertexShader: `uniform float uT; uniform vec2 uWind; attribute vec3 aPos; attribute vec4 aP; attribute vec2 aQ;
        varying vec2 vUv; varying float vU; varying float vSeed; varying vec2 vQ;
        void main(){
          float u = fract(uT*aP.z + aP.w); vU = u; vSeed = aP.w; vQ = aQ; vUv = uv;
          float H = aP.x;
          vec3 c = aPos + vec3(uWind.x*u*u*H, u*H, uWind.y*u*u*H);
          c.x += sin(uT*0.5 + aP.w*30.0)*u*H*0.05; c.z += cos(uT*0.4 + aP.w*21.0)*u*H*0.04;
          float s = aP.y*(0.4 + 1.7*u);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float ang = aP.w*6.283 + uT*0.15*(fract(aP.w*7.0)-0.5);
          vec2 q = vec2(cos(ang)*position.x - sin(ang)*position.y, sin(ang)*position.x + cos(ang)*position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(c + (right*q.x + up*q.y)*s, 1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vUv; varying float vU; varying float vSeed; varying vec2 vQ; ${NOISE}
        void main(){
          vec2 p = vUv - 0.5; float r = length(p)*2.0;
          float n = sbF(vUv*2.4 + vSeed*17.0 + vec2(0.0, -uT*0.06));
          float m = 1.0 - smoothstep(0.3, 1.0, r + (n-0.5)*1.0);
          float life = smoothstep(0.0, 0.08, vU) * (1.0 - smoothstep(0.5, 1.0, vU));
          float a = m*life*mix(1.0, 0.55, vQ.x);
          if (a < 0.01) discard;
          vec3 col = mix(vec3(0.012,0.01,0.009), vec3(0.2,0.17,0.15), vQ.x) * (0.6 + 0.8*n);
          col += vec3(1.0,0.3,0.06) * vQ.y * pow(1.0-vU, 9.0) * (1.2 - vUv.y) * 1.3;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false,
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; return mesh;
  }

  // flammèches : points incandescents qui montent en tourbillonnant et clignotent
  function emberPoints(T, list) {
    if (!list.length) return null;
    const g = new T.BufferGeometry();
    const pos = new Float32Array(list.length * 3), par = new Float32Array(list.length * 4);
    list.forEach((e, i) => { pos.set([e.x, e.y, e.z], i * 3); par.set([e.rate, e.seed, e.spread, e.h], i * 4); });
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aP', new T.BufferAttribute(par, 4));
    const m = new T.ShaderMaterial({
      uniforms: { uT: U.uT, uWind: U.uWind, uPR: U.uPR },
      vertexShader: `uniform float uT; uniform vec2 uWind; uniform float uPR; attribute vec4 aP; varying float vA; varying float vS;
        void main(){
          float u = fract(uT*aP.x + aP.y); float h = aP.w;
          vec3 c = position + vec3(sin(uT*1.3 + aP.y*40.0)*aP.z*u + uWind.x*u*h*0.6, u*h, cos(uT*1.1 + aP.y*23.0)*aP.z*u + uWind.y*u*h*0.6);
          vec4 mv = viewMatrix * vec4(c, 1.0); gl_Position = projectionMatrix * mv;
          float fl = step(0.3, fract(sin(floor(uT*12.0 + aP.y*90.0))*43758.5453));
          vA = (1.0-u)*smoothstep(0.0, 0.04, u)*(0.35 + 0.65*fl); vS = aP.y;
          gl_PointSize = min(uPR*7.0, uPR*(1.2 + 1.6*fract(aP.y*9.1))*(340.0 / -mv.z)); }`,
      fragmentShader: `varying float vA; varying float vS;
        void main(){ float d = length(gl_PointCoord - 0.5)*2.0; float a = (1.0 - smoothstep(0.15, 1.0, d))*vA; if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vec3(1.0,0.32,0.04), vec3(1.0,0.78,0.38), fract(vS*13.0))*3.2, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    const pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 8; return pts;
  }

  // bâtiment éventré : découpe déchiquetée inclinée (discard), bord calciné rougeoyant, suie, intérieur noir
  function breakBuilding(T, obj, e, seed, glow) {
    const bb = new T.Box3().setFromObject(obj); if (bb.isEmpty()) return null;
    const h = bb.max.y - bb.min.y, c = bb.getCenter(new T.Vector3());
    const cut = bb.min.y + h * (0.8 - 0.36 * e), amp = h * 0.15;
    const ta = hash(seed) * 6.283, tilt = new T.Vector2(Math.cos(ta), Math.sin(ta)).multiplyScalar(0.22);
    const uni = { uSbCut: { value: cut }, uSbAmp: { value: amp }, uSbCtr: { value: new T.Vector2(c.x, c.z) }, uSbTilt: { value: tilt }, uSbGlow: { value: glow }, uSbSoot: { value: 0.62 }, uT: U.uT };
    const clones = new Map(), mats = [];
    obj.traverse(o => {
      if (!o.isMesh || !o.material || o.userData.sbBrokenMesh) return;
      const one = (mm) => {
        if (!mm || !mm.isMeshStandardMaterial) return mm;
        if (clones.has(mm)) return clones.get(mm);
        const k = mm.clone(); k.side = T.DoubleSide;
        k.userData.sbBase = mm.emissiveIntensity || 0;
        k.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, uni);
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSbW;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvSbW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
            varying vec3 vSbW; uniform float uSbCut, uSbAmp, uSbGlow, uSbSoot, uT; uniform vec2 uSbCtr, uSbTilt; ${NOISE}`)
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
              float sbCut = uSbCut + dot(vSbW.xz - uSbCtr, uSbTilt) + (sbF(vSbW.xz*0.21 + vSbW.y*0.04) - 0.5)*uSbAmp*2.0;
              if (vSbW.y > sbCut) discard;
              float sbD = sbCut - vSbW.y;
              float sbEdge = 1.0 - smoothstep(0.0, 1.4, sbD);
              float sbChar = (1.0 - smoothstep(0.0, 9.0, sbD)) * (0.6 + 0.4*sbN(vSbW.xz*0.5 + vSbW.y*0.3));`)
            .replace('#include <color_fragment>', `#include <color_fragment>
              diffuseColor.rgb *= uSbSoot * mix(1.0, 0.05, sbChar);
              if (!gl_FrontFacing) diffuseColor.rgb *= 0.08;`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
              roughnessFactor = mix(roughnessFactor, 0.95, sbChar);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
              totalEmissiveRadiance += vec3(1.0,0.3,0.04) * sbEdge * uSbGlow * (0.75 + 0.25*sin(uT*6.0 + vSbW.x*0.7 + vSbW.z*0.5));`);
        };
        k.customProgramCacheKey = () => 'sbBroken1';
        clones.set(mm, k); mats.push(k); return k;
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      o.userData.sbBrokenMesh = true;
    });
    return { bb, cut, h, c, mats };
  }

  function clearFX() {
    if (FX.group && FX.group.parent) FX.group.parent.remove(FX.group);
    if (FX.group) FX.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    FX.parts.forEach(p => { if (p.kind === 'lamp' && p.o) p.o.intensity = p.base; });
    FX.group = null; FX.parts = []; FX.built = '';
    setAmbience(0); setForest(null, 0);
  }

  // ambiance : ciel, brouillard et lumières tirés vers l'orange de catastrophe
  function setAmbience(k) {
    if (window.SBSky && SBSky.ownsDevast) { try { SBSky.auto(); } catch (e) {} return; }   // PATCH_2110_DEVAST_SOMBRE : le ciel s'en charge
    const T = three(), P = window.Planet3D; if (!T || !P || !P.scene) return;
    const sc = P.scene;
    if (!FX.amb) {
      const hemi = sc.children.find(o => o.isHemisphereLight), sun = sc.children.find(o => o.isDirectionalLight);
      FX.amb = { hemi, sun, h: hemi && [hemi.color.clone(), hemi.groundColor.clone(), hemi.intensity], s: sun && [sun.color.clone(), sun.intensity],
        fog: sc.fog && sc.fog.color.clone(), bg: sc.background && sc.background.isColor ? sc.background.clone() : null, env: sc.environmentIntensity };
    }
    const A = FX.amb, L = (a, hex) => a.clone().lerp(new T.Color(hex), k);
    if (A.hemi) { A.hemi.color.copy(L(A.h[0], 0xb0541c)); A.hemi.groundColor.copy(L(A.h[1], 0x2a0d04)); A.hemi.intensity = A.h[2] * (1 - .1 * k); }
    if (A.sun) { A.sun.color.copy(L(A.s[0], 0xff8a3a)); A.sun.intensity = A.s[1] * (1 - .25 * k); }
    if (A.fog && sc.fog) sc.fog.color.copy(L(A.fog, 0x4a1c0a));
    if (A.bg && sc.background && sc.background.isColor) sc.background.copy(L(A.bg, 0x241006));
    if (A.env != null) sc.environmentIntensity = A.env * (1 - .45 * k);
  }

  // forêt : feuillage roussi (teinte par instance), arbres en feu et voisins calcinés
  function forestMeshes() {
    const P = window.Planet3D; if (!P || !P.kit || !P.kit.veg) return [];
    const out = [];
    P.kit.veg.forEach((v, type) => {
      if (!v || type > 3) return;
      const geos = []; v.traverse(m => { if (m.isMesh) geos.push(m.geometry); });
      const bb = new (three().Box3)().setFromObject(v), H = bb.max.y - bb.min.y;
      P.scene.children.forEach(o => {
        if (!o.isInstancedMesh || !geos.includes(o.geometry)) return;
        const c = o.material.color; const foliage = c.g > c.r * 1.05;
        out.push({ mesh: o, type, H, foliage });
      });
    });
    return out;
  }
  function setForest(info, k) {
    const T = three(); if (!T) return;
    if (!FX.forest) FX.forest = forestMeshes();
    const TGT = [0x3e2a1c, 0x56341c, 0x352418, 0x463020];
    FX.forest.forEach(f => {
      const m = f.mesh, mat = m.material;
      if (!mat.userData.sbOrig) mat.userData.sbOrig = mat.color.clone();
      // PATCH_2110_DEVAST_SOMBRE : la forêt-jardin porte ses couleurs par arbre (instanceColor, matériau blanc) :
      // on les garde de côté et on les rougit, au lieu de les écraser en blanc
      if (m.instanceColor && !m.userData.sbOrigIC) m.userData.sbOrigIC = Float32Array.from(m.instanceColor.array);
      const OIC = m.userData.sbOrigIC;
      if (OIC && f.foliage === false && OIC.length >= 3 && OIC[1] > OIC[0] * 1.05) f.foliage = 'ic';
      if (OIC) { mat.color.copy(mat.userData.sbOrig); }
      else mat.color.copy(mat.userData.sbOrig).lerp(new T.Color(f.foliage ? TGT[f.type] : 0x1a120d), f.foliage ? Math.min(1, k * 1.1) : k * 0.7);
      if (!m.instanceColor) { m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(m.count * 3).fill(1), 3); mat.needsUpdate = true; }
      const arr = m.instanceColor.array;
      if (!info || !k) { if (OIC) arr.set(OIC); else arr.fill(1); m.instanceColor.needsUpdate = true; return; }
      if (OIC) {
        const tag = info.tag[f.type];
        for (let i = 0; i < m.count; i++) {
          const t = tag ? tag[i] : 0, r = hash(i * 3.7 + f.type * 11), o = i * 3;
          let R, G2, B;
          if (t === 2) { R = G2 = B = 0.07; }
          else if (t === 1) { R = .16; G2 = .12; B = .1; }
          else if (f.foliage) { const d = .72 + .2 * r; R = (OIC[o] + OIC[o + 1] * (.35 + .3 * r)) * d; G2 = OIC[o + 1] * .78 * d; B = OIC[o + 2] * .45 * d; }   // vert rougeâtre, assombri
          else { R = OIC[o] * .5; G2 = OIC[o + 1] * .42; B = OIC[o + 2] * .38; }
          arr[o] = R; arr[o + 1] = G2; arr[o + 2] = B;
        }
        m.instanceColor.needsUpdate = true; return;
      }
      const tag = info.tag[f.type];
      for (let i = 0; i < m.count; i++) {
        const t = tag ? tag[i] : 0, r = hash(i * 3.7 + f.type * 11);
        let R = 1, G2 = 1, B = 1;
        if (t === 2) { R = G2 = B = 0.07; }                        // en feu : silhouette noire derrière les flammes
        else if (t === 1) { R = .16; G2 = .12; B = .1; }            // calciné
        else if (f.foliage) { if (r < .22) { R = .32; G2 = .26; B = .22; } else { R = .62 + .45 * r; G2 = .5 + .4 * r * r; B = .45 + .25 * r; } } // roux, ocre, brun, charbon
        arr[i * 3] = R; arr[i * 3 + 1] = G2; arr[i * 3 + 2] = B;
      }
      m.instanceColor.needsUpdate = true;
    });
  }

  function buildingSpots() {
    const P = window.Planet3D; const out = [];
    if (!P || !P.buildGroup) return out;
    const seen = new Set();
    P.buildGroup.children.forEach(o => {
      if (!o.userData || o.userData.parcel == null || seen.has(o.userData.parcel)) return;
      seen.add(o.userData.parcel); out.push({ p: o.position.clone(), idx: o.userData.parcel, obj: o });
    });
    return out;
  }
  function damageOf(idx) {
    const p = (G.planet && G.planet.parcels || [])[idx] || {};
    return Math.max(p.damaged ? .55 : 0, window.SBAftermath ? SBAftermath.visualDamage(idx) : 0);
  }

  function buildDevastation(T, P, g, d, spots, ctr) {
    let rnd = 7; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const flames = [], smoke = [], embers = [], k = Math.min(1, .45 + d / 100 * .75);
    U.uWind.value = new T.Vector2(.5, -.28);
    U.uPR.value = P.renderer ? P.renderer.getPixelRatio() : 2;
    setAmbience(k);
    const glowTex = radial(T, [[0, 'rgba(255,150,60,1)'], [.35, 'rgba(255,80,20,.55)'], [1, 'rgba(255,40,0,0)']]);
    const scorch = scorchTex(T);
    const decal = (x, y, z, r, tex, add, op) => {
      const m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: op,
        blending: add ? T.AdditiveBlending : T.NormalBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = R() * 6.283; m.position.set(x, y, z); m.renderOrder = 2; g.add(m); return m;
    };
    let lights = 0;
    const fireLight = (x, y, z, pow) => {
      if (lights >= 4) return; lights++;
      const l = new T.PointLight(0xff6a1e, pow, 110, 1.5); l.position.set(x, y, z); g.add(l);
      FX.parts.push({ kind: 'flick', o: l, base: pow, ph: R() * 10 });
    };

    // 1) arbres en feu : foyers groupés autour de la colonie
    const forest = FX.forest || (FX.forest = forestMeshes());
    const trees = [];
    const tag = {};
    const M4 = new T.Matrix4(), v = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
    forest.filter(f => f.foliage).forEach(f => {
      tag[f.type] = new Uint8Array(f.mesh.count);
      for (let i = 0; i < f.mesh.count; i++) {
        f.mesh.getMatrixAt(i, M4); M4.decompose(v, q, s);
        const dx = v.x - ctr.x, dz = v.z - ctr.z, r = Math.hypot(dx, dz);
        if (r > 60 && r < 290 && f.type !== 2) trees.push({ type: f.type, i, x: v.x, y: v.y, z: v.z, h: f.H * s.y, r });
      }
    });
    const nPatch = Math.round(5 + d / 100 * 9), patches = [];
    // les deux tiers des foyers dans le cadre de la vue par défaut, le reste tout autour
    const cam = P.camera, pv = new T.Vector3();
    const inView = (t) => { if (!cam) return true; pv.set(t.x, t.y + 6, t.z).project(cam); return Math.abs(pv.x) < .85 && pv.y > -.75 && pv.y < .55 && pv.z < 1; };
    for (let n = 0, tries = 0; n < nPatch && tries < 800 && trees.length; tries++) {
      const t = trees[Math.floor(R() * trees.length)];
      if (t.r > 250 || patches.some(p => Math.hypot(p.x - t.x, p.z - t.z) < 40)) continue;
      if (n < nPatch * .66 && tries < 600 && !inView(t)) continue;
      patches.push({ x: t.x, y: t.y, z: t.z, rad: 13 + R() * 12, n: 0 }); n++;
    }
    patches.sort((a, b) => Math.hypot(a.x - ctr.x, a.z - ctr.z) - Math.hypot(b.x - ctr.x, b.z - ctr.z));
    trees.forEach(t => {
      for (const p of patches) {
        const dd = Math.hypot(t.x - p.x, t.z - p.z);
        if (dd < p.rad && p.n < 16) {
          tag[t.type][t.i] = 2; p.n++;
          const fh = t.h * (1.05 + R() * .5);
          flames.push({ x: t.x, y: t.y + t.h * .1, z: t.z, w: fh * .56, h: fh, seed: R() });
          if (R() < .5) flames.push({ x: t.x + (R() - .5) * 3, y: t.y, z: t.z + (R() - .5) * 3, w: fh * .45, h: fh * .55, seed: R() });
          break;
        } else if (dd < p.rad * 1.9 && tag[t.type][t.i] !== 2) tag[t.type][t.i] = 1;
      }
    });
    patches.forEach((p, i) => {
      decal(p.x, p.y + .4, p.z, p.rad * 1.6, glowTex, true, .55);
      FX.parts.push({ kind: 'glow', o: g.children[g.children.length - 1], base: .55, ph: R() * 10 });
      if (i < 3) fireLight(p.x, p.y + 14, p.z, 1100);
      for (let k2 = 0; k2 < 12; k2++) smoke.push({ x: p.x, y: p.y + 14, z: p.z, H: 120 + R() * 40, S: 15 + R() * 6, rate: .05 + R() * .015, seed: k2 / 12 + R() * .05, tint: .35, glow: .8 });
      for (let k2 = 0; k2 < 70; k2++) embers.push({ x: p.x + (R() - .5) * p.rad * 1.4, y: p.y + 4 + R() * 8, z: p.z + (R() - .5) * p.rad * 1.4, rate: .12 + R() * .18, seed: R(), spread: 4 + R() * 8, h: 35 + R() * 45 });
    });
    setForest({ tag }, k);

    // 2) bâtiments éventrés en flammes, panache noir, débris au sol, lumières en panne
    const chunkGeo = new T.DodecahedronGeometry(1, 0), plateGeo = new T.BoxGeometry(1, 1, 1);
    const chunkMat = new T.MeshStandardMaterial({ color: 0x3b3735, roughness: .78, metalness: .35 });
    const plateBase = P.M && P.M.MAT_ARMOR_LIGHT;
    const plateMat = new T.MeshStandardMaterial({ color: plateBase ? plateBase.color.clone().multiplyScalar(.6) : 0x8a8a88, roughness: .38, metalness: .55, envMapIntensity: 1.2 });
    const debris = [];
    const occupied = new Set(spots.map(sp => sp.idx));
    spots.forEach(sp => {
      const e = damageOf(sp.idx);
      sp.obj.traverse(o => { if (o.isLight) { if (o.userData.sbBase == null) o.userData.sbBase = o.intensity; FX.parts.push({ kind: 'lamp', o, base: o.userData.sbBase, seed: R(), hard: e > 0 || R() < .45 }); } });
      if (!(e > .05)) return;
      const br = breakBuilding(T, sp.obj, e, sp.idx + 1, 1.1);
      if (!br) return;
      br.mats.forEach(m => { if (m.userData.sbBase > .3) FX.parts.push({ kind: 'neon', o: m, base: Math.max(m.userData.sbBase, 1.2), seed: R() }); });
      const sz = br.bb.getSize(new T.Vector3()), rb = Math.max(sz.x, sz.z) / 2;
      const nf = 2 + Math.round(e * 2);
      for (let f = 0; f < nf; f++) {
        const fx = br.c.x + (R() - .5) * sz.x * .5, fz = br.c.z + (R() - .5) * sz.z * .5, fy = br.cut - br.h * .12;
        const fh = 9 + e * 10 + R() * 5;
        flames.push({ x: fx, y: fy, z: fz, w: fh * .55, h: fh, seed: R() });
        flames.push({ x: fx + (R() - .5) * 4, y: fy, z: fz + (R() - .5) * 4, w: fh * .4, h: fh * .7, seed: R() });
        const nPuff = f === 0 ? 32 : 14, H = f === 0 ? 170 : 110;
        for (let k2 = 0; k2 < nPuff; k2++) smoke.push({ x: fx, y: fy + fh * .6, z: fz, H, S: (f === 0 ? 24 : 17) + R() * 6, rate: .035 + R() * .01, seed: k2 / nPuff + R() * .03, tint: 0, glow: 1 });
        for (let k2 = 0; k2 < 45; k2++) embers.push({ x: fx + (R() - .5) * 8, y: fy + 4, z: fz + (R() - .5) * 8, rate: .15 + R() * .2, seed: R(), spread: 5 + R() * 9, h: 45 + R() * 55 });
      }
      fireLight(br.c.x, br.cut + 8, br.c.z, 1500);
      const nd = Math.round(18 + e * 26);
      for (let j = 0; j < nd; j++) {
        const a = R() * 6.283, rr = rb * (.55 + R() * .85), plate = R() < .35;
        const sx = plate ? 2 + R() * 4 : .8 + R() * 2.4, sy = plate ? .25 + R() * .3 : .5 + R() * 1.4, sz2 = plate ? 1.5 + R() * 3.5 : .8 + R() * 2.2;
        debris.push({ plate, x: br.c.x + Math.cos(a) * rr, y: (P.plateY || .36) + sy * .3, z: br.c.z + Math.sin(a) * rr, sx, sy, sz: sz2,
          rx: plate ? (R() - .5) * .9 : R() * 6, ry: R() * 6.283, rz: plate ? (R() - .5) * .9 : R() * 6, c: .35 + R() * .65 });
      }
      decal(br.c.x, (P.plateY || .36) + .06, br.c.z, rb * 1.35, scorch, false, .85);
    });
    ['chunk', 'plate'].forEach(kind => {
      const list = debris.filter(x => (kind === 'plate') === x.plate); if (!list.length) return;
      const im = new T.InstancedMesh(kind === 'plate' ? plateGeo : chunkGeo, kind === 'plate' ? plateMat : chunkMat, list.length);
      const o = new T.Object3D(), col = new T.Color();
      list.forEach((x, i) => { o.position.set(x.x, x.y, x.z); o.rotation.set(x.rx, x.ry, x.rz); o.scale.set(x.sx, x.sy, x.sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, col.setScalar(x.c)); });
      im.castShadow = im.receiveShadow = true; g.add(im);
    });

    // 3) cratères fumants : brûlure au sol, bourrelet de terre, braises au fond, filet de fumée
    const free = [];
    (P.parcelGroup ? P.parcelGroup.children : []).forEach(o => { if (o.userData && o.userData.parcel != null && !occupied.has(o.userData.parcel)) free.push(o.position); });
    const nCr = Math.round(3 + d / 100 * 8);
    const rimMat = new T.MeshStandardMaterial({ color: 0x2a1f18, roughness: .95, metalness: 0 });
    for (let c2 = 0; c2 < nCr && free.length; c2++) {
      const base = free.splice(Math.floor(R() * free.length), 1)[0];
      const x = base.x + (R() - .5) * 18, z = base.z + (R() - .5) * 18, y = (P.plateY || .36), Rr = 4 + R() * 4.5;
      decal(x, y + .05, z, Rr * 2.3, scorch, false, .95);
      const rim = new T.TorusGeometry(Rr, Rr * .3, 6, 22); rim.rotateX(Math.PI / 2);
      const pa = rim.attributes.position; for (let i = 0; i < pa.count; i++) { const j = 1 + (hash(i + c2 * 31) - .5) * .35; pa.setXYZ(i, pa.getX(i) * j, Math.max(0, pa.getY(i)) * (.5 + hash(i * 7 + c2) * .6), pa.getZ(i) * j); }
      rim.computeVertexNormals();
      const rm = new T.Mesh(rim, rimMat); rm.position.set(x, y, z); rm.receiveShadow = true; g.add(rm);
      const pit = decal(x, y + .12, z, Rr * .85, glowTex, true, .7);
      FX.parts.push({ kind: 'glow', o: pit, base: .7, ph: R() * 10 });
      for (let k2 = 0; k2 < 6; k2++) smoke.push({ x, y: y + 1, z, H: 55 + R() * 20, S: 5 + R() * 3, rate: .07 + R() * .02, seed: k2 / 6 + R() * .05, tint: .3, glow: .6 });
      for (let k2 = 0; k2 < 10; k2++) embers.push({ x: x + (R() - .5) * Rr, y: y + .5, z: z + (R() - .5) * Rr, rate: .2 + R() * .2, seed: R(), spread: 2 + R() * 3, h: 12 + R() * 14 });
    }

    [flameMesh(T, flames), smokeMesh(T, smoke), emberPoints(T, embers)].forEach(m => m && g.add(m));
  }

  function buildFX(d, ph, key) {
    const T = three(), P = window.Planet3D;
    if (!T || !P || !P.scene) return;
    clearFX();
    const g = new T.Group(); g.name = 'SB_AFTERMATH'; P.scene.add(g); FX.group = g;
    const spots = buildingSpots();
    const ctr = spots.length ? spots.reduce((a, s) => a.add(s.p), new T.Vector3()).multiplyScalar(1 / spots.length) : new T.Vector3();
    const y0 = spots.length ? spots[0].p.y : .36;
    let rnd = 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    if (d >= 1) buildDevastation(T, P, g, d, spots, ctr);
    if (d < 1 && ph && spots.length) {
      // banderoles : fanions colorés en guirlandes entre les bâtiments + mâts au centre de commandement
      const cols = [0xff4a6a, 0xffc040, 0x40d0ff, 0x7aff8a, 0xc070ff];
      const flagGeo = new T.BufferGeometry();
      flagGeo.setAttribute('position', new T.Float32BufferAttribute([-1.2, 0, 0, 1.2, 0, 0, 0, -2.6, 0], 3));
      flagGeo.computeVertexNormals();
      const pairs = [];
      for (let i = 0; i < spots.length; i++) {
        let best = null, bd = 1e9;
        for (let j = 0; j < spots.length; j++) { if (j === i) continue; const dd = spots[i].p.distanceTo(spots[j].p); if (dd < bd) { bd = dd; best = j; } }
        if (best != null && !pairs.some(([a, b]) => (a === i && b === best) || (a === best && b === i))) pairs.push([i, best]);
      }
      pairs.forEach(([a, b]) => {
        const A = spots[a].p.clone().add(new T.Vector3(0, 22, 0)), B = spots[b].p.clone().add(new T.Vector3(0, 22, 0));
        const n = Math.max(6, Math.round(A.distanceTo(B) / 5));
        for (let k = 1; k < n; k++) {
          const u = k / n, p = A.clone().lerp(B, u); p.y -= Math.sin(u * Math.PI) * 6;
          const f = new T.Mesh(flagGeo, new T.MeshStandardMaterial({ color: cols[k % cols.length], emissive: cols[k % cols.length], emissiveIntensity: .35, side: T.DoubleSide }));
          f.position.copy(p); f.lookAt(p.clone().add(new T.Vector3(B.x - A.x, 0, B.z - A.z).normalize().cross(new T.Vector3(0, 1, 0))));
          g.add(f); FX.parts.push({ kind: 'flag', o: f, ph: R() * 6, ry: f.rotation.y });
        }
      });
      // feux d'artifice : gerbes de particules additives
      FX.fwTex = radial(T, [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
      FX.fw = []; FX.fwCtr = ctr; FX.fwY = y0; FX.fwNext = 0; FX.cols = cols;
    }
    FX.built = key;
  }
  function spawnFirework(T, now) {
    const c = FX.fwCtr, n = 60, col = new T.Color(FX.cols[Math.floor(Math.random() * FX.cols.length)]);
    const at = new T.Vector3(c.x + (Math.random() - .5) * 90, FX.fwY + 30 + Math.random() * 35, c.z + (Math.random() - .5) * 80);
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u), sp = 18 + Math.random() * 12;
      vel.push(new T.Vector3(q * Math.cos(a), u, q * Math.sin(a)).multiplyScalar(sp)); pos.set([at.x, at.y, at.z], i * 3);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ map: FX.fwTex, color: col, size: 10, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    FX.group.add(pts);
    const light = new T.PointLight(col, 1500, 160, 1.4); light.position.copy(at); FX.group.add(light);
    FX.fw.push({ pts, vel, t0: now, light });
  }
  // panne : néon qui hoquette — longues coupures, rafales de clignotements, rares retours francs
  function failing(t, seed, hard) {
    const slow = (t * (hard ? .22 : .09) + seed * 7) % 1;
    if (slow < (hard ? .35 : .12)) return hard ? .02 : .25;
    const k = Math.floor(t * (hard ? 14 : 9) + seed * 100);
    return hash(k + seed * 13) > (hard ? .45 : .25) ? 1 : (hard ? .05 : .4);
  }
  function anim() {
    requestAnimationFrame(anim);
    if (!FX.group || !onPlanet()) return;
    const T = three(); const now = performance.now(), t = now / 1000, dt = Math.min(0.05, (now - (FX.last || now)) / 1000); FX.last = now;
    U.uT.value = t % 1000;
    for (const p of FX.parts) {
      if (p.kind === 'flick') p.o.intensity = p.base * (.7 + .3 * Math.sin(t * 11 + p.ph) * Math.sin(t * 4.3 + p.ph) + .12 * Math.sin(t * 27 + p.ph));
      else if (p.kind === 'glow') p.o.material.opacity = p.base * (.75 + .25 * Math.sin(t * 7 + p.ph) * Math.sin(t * 2.9 + p.ph * 2));
      else if (p.kind === 'lamp') p.o.intensity = p.base * failing(t, p.seed, p.hard);
      else if (p.kind === 'neon') p.o.emissiveIntensity = p.base * failing(t, p.seed, true);
      else if (p.kind === 'flag') p.o.rotation.z = Math.sin(t * 3 + p.ph) * 0.25;
    }
    const ph = partyPhase();
    if (FX.fw && ph && ph.fireworks && T) {
      if (now > FX.fwNext) { spawnFirework(T, now); FX.fwNext = now + 220 + Math.random() * 480; }
    }
    if (FX.fw && T) {
      FX.fw = FX.fw.filter(f => {
        const age = (now - f.t0) / 1000, a = f.pts.geometry.attributes.position;
        for (let i = 0; i < f.vel.length; i++) { f.vel[i].y -= 9 * dt; f.vel[i].multiplyScalar(1 - 0.9 * dt); a.setXYZ(i, a.getX(i) + f.vel[i].x * dt, a.getY(i) + f.vel[i].y * dt, a.getZ(i) + f.vel[i].z * dt); }
        a.needsUpdate = true; f.pts.material.opacity = Math.max(0, 1 - age / 2.2); f.light.intensity = Math.max(0, 1500 * (1 - age / 0.6));
        if (age > 2.2) { FX.group.remove(f.pts); FX.group.remove(f.light); f.pts.geometry.dispose(); return false; }
        return true;
      });
    }
  }
  requestAnimationFrame(anim);
  window.SBAftermathFX = {
    update(d, ph) {
      const P = window.Planet3D;
      if (!P || !P.ready || !three()) return;
      const ids = P.buildGroup ? P.buildGroup.children.filter(o => o.userData && o.userData.parcel != null).map(o => o.id).join(',') : '';
      const dmg = (G.planet && G.planet.parcels || []).map(p => p && p.damaged ? 1 : 0).join('');
      const want = (d >= 1 ? 'd' + Math.round(d / 10) : '') + (ph && d < 1 ? 'p' : '') + ':' + ids + ':' + dmg;
      if (!(d >= 1) && !ph) { if (FX.group) clearFX(); return; }
      if (want !== FX.built || !FX.group || !FX.group.parent) buildFX(d, ph, want);
    },
  };

  window.SBAftermath = {
    get dev() { return dev(); }, simSegment, onRaid, onRelief, startRelief, upgradeBlocked, partyPhase, refresh,
    bucket() { return Math.round(dev() / 10); },
    visualDamage(idx) { const d = dev() / 100; if (d <= 0) return 0; const h = Math.sin((idx + 1) * 12.9898) * 43758.5453; const r = h - Math.floor(h); return r < 0.25 + d * 0.6 ? Math.min(0.9, d * (0.6 + r)) : 0; },
    // test : SBAftermath._debug({ dev: 60 }) ou ({ party: true })
    _debug(o) { const s = st(); if (o.dev != null) s.dev = o.dev; if (o.party) s.partyAt = Date.now(); if (o.party === false) s.partyAt = 0; refresh(); },
  };
})();
