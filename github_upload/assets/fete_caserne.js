/* Starbyte — Bringue de caserne (13/10/2026, demandée par Adrien)
   Une flotte rentre victorieuse d'un raid : pendant 1 h, la caserne fait la fête.
   Feux de joie, soldats ivres qui boivent des bières (dansent, titubent, trinquent, un qui cuve par terre),
   tonneau, bouteilles vides et cassées, flaques de vomi. Bandeau sur la carte planète, fermable, sans minuteur.
   Sans caserne, l'équipage fête ça devant le centre de commandement.
   Déroulé (tout est calculé depuis l'heure de la victoire, donc juste après un rechargement) :
     0–30 min  la fête autour des feux, de plus en plus imbibée ;
     30–50 min ils se dispersent un à un sur la carte, titubent de plus en plus, s'arrêtent vomir (deux flaques chacun) ; les feux baissent ;
     50–60 min ils dorment éparpillés sur la carte (des « z » s'envolent), il ne reste que des braises.
   État : G.aftermath.victoryAt / victoryHidden (sauvegardé avec la partie, comme le reste de l'après-attaque). */
(function () {
  const PARTY_MS = 60 * 60 * 1000;

  function st() {
    if (typeof G === 'undefined' || !G) return null;
    if (!G.aftermath) G.aftermath = { dev: 0, partyAt: 0, pendingReport: null, lastRaidAt: 0 };
    return G.aftermath;
  }
  const elapsedMin = () => { const s = st(); return s && s.victoryAt ? (Date.now() - s.victoryAt) / 60000 : 0; };
  const active = () => { const s = st(); return !!(s && s.victoryAt && Date.now() - s.victoryAt < PARTY_MS); };
  const save = () => { if (typeof saveGame === 'function') saveGame(); };

  // appelé à l'application du résultat d'un combat (retour de mission) : victoire → bringue
  function onVictory(outcome) {
    if (!/victory|pyrrhic/.test(String(outcome || ''))) return;
    const s = st(); if (!s) return;
    s.victoryAt = Date.now(); s.victoryHidden = 0;
    save(); refresh();
  }

  // ── bandeau ────────────────────────────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
  #sb-bringue { position:fixed; left:12px; right:12px; top:150px; z-index:30; display:none; align-items:center; gap:10px;
    padding:9px 10px 9px 12px; border-radius:10px; border:1px solid rgba(255,190,90,.5); background:rgba(36,22,6,.84); color:#ffe9c8;
    backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); font-size:12px; letter-spacing:.04em; }
  #sb-bringue span { flex:1; min-width:0; }
  .sb-x { flex-shrink:0; width:26px; height:26px; border-radius:50%; border:1px solid rgba(255,255,255,.28); background:rgba(0,0,0,.3);
    color:inherit; font-size:15px; line-height:22px; text-align:center; cursor:pointer; padding:0; }`;
  document.head.appendChild(css);
  const ban = document.createElement('div'); ban.id = 'sb-bringue';
  ban.innerHTML = '<span></span><button class="sb-x" aria-label="Fermer">×</button>';
  ban.querySelector('.sb-x').addEventListener('click', (e) => { e.stopPropagation(); const s = st(); if (s) { s.victoryHidden = s.victoryAt; save(); } refresh(); });
  document.body.appendChild(ban);

  function onPlanet() { const s = document.getElementById('scr-planet'); return !!s && !s.classList.contains('hidden'); }
  const hasCaserne = () => (G.planet && G.planet.parcels || []).some(p => p && p.state === 'built' && p.building === 'caserne');
  // empilé sous l'alerte d'attaque et sous les bandeaux de l'après-attaque, jamais par-dessus
  function placeBanner() {
    let top = 150;
    ['ra-bar', 'sb-party', 'sb-devast'].forEach(id => {
      const e = document.getElementById(id); if (!e || e === ban) return;
      const b = e.getBoundingClientRect(); if (b.height > 0 && b.top < innerHeight / 2) top = Math.max(top, Math.round(b.bottom + 8));
    });
    const v = top + 'px'; if (ban.style.top !== v) ban.style.top = v;
  }
  function refresh() {
    const s = st(), on = onPlanet(), act = active();
    const show = on && act && s.victoryHidden !== s.victoryAt;
    ban.style.display = show ? 'flex' : 'none';
    if (show) {
      const who = hasCaserne() ? 'la caserne' : 'l\'équipage', e = elapsedMin();
      const t = e < 30 ? `🍺 Raid victorieux · ${who} fait la bringue` : e < 50 ? `🍺 Raid victorieux · la bringue dégénère` : `💤 Raid victorieux · ${who} cuve`;
      const sp = ban.querySelector('span'); if (sp.textContent !== t) sp.textContent = t;
      placeBanner();
    }
    update(act);
  }
  setInterval(refresh, 1000);
  // arrivée sur la carte : bandeau immédiat
  (function () { const scr = document.getElementById('scr-planet');
    if (scr && window.MutationObserver) new MutationObserver(() => { try { refresh(); } catch (e) {} }).observe(scr, { attributes: true, attributeFilter: ['class'] }); })();

  // ── effets 3D ──────────────────────────────────────────────────────────────
  const FX = { group: null, key: '', soldiers: [], lights: [], glows: [] };
  const U = { uT: { value: 0 }, uFire: { value: 1 } };
  const three = () => window.SB3D && window.SB3D.THREE;
  let rnd = 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;

  // fusion de géométries colorées (un seul draw par soldat / par bûcher)
  function merge(T, parts) {
    const pos = [], nor = [], col = [];
    parts.forEach(([geo, color, m]) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); g.computeVertexNormals();
      const c = new T.Color(color), p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
      g.dispose();
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
  }
  const M4 = (T, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));

  // soldier : treillis olive, casque, chope de bière levée (mousse blanche), joues rouges ; ~5 unités de haut
  function soldierGeo(T, skin, cheers) {
    const box = new T.BoxGeometry(1, 1, 1), sph = new T.SphereGeometry(1, 10, 8), cyl = new T.CylinderGeometry(1, 1, 1, 10);
    const OL = 0x4b5a2c, OLD = 0x323d1d, BOOT = 0x1d1a16, BEER = 0xe0a020, FOAM = 0xfff6e0;
    const arm = cheers ? -2.5 : -1.2;   // bras levé (trinque) ou chope à hauteur de bouche
    const ax = .78, ay = 3.35, L = 1.5, hy = ay - Math.cos(arm) * L;
    const handZ = Math.sin(-arm) * L;
    return merge(T, [
      [box, BOOT, M4(T, -.32, .35, 0, 0, 0, 0, .5, .7, .75)], [box, BOOT, M4(T, .32, .35, 0, 0, 0, 0, .5, .7, .75)],
      [box, OLD, M4(T, -.32, 1.35, 0, 0, 0, 0, .52, 1.4, .58)], [box, OLD, M4(T, .32, 1.35, 0, 0, 0, 0, .52, 1.4, .58)],
      [box, OL, M4(T, 0, 2.75, 0, 0, 0, 0, 1.35, 1.5, .8)],
      [box, OLD, M4(T, 0, 2.15, 0, 0, 0, 0, 1.4, .22, .84)],                                   // ceinturon
      [box, OL, M4(T, -.82, 2.75, 0, 0, 0, .25, .4, 1.3, .42)],                                // bras libre ballant
      [box, OL, M4(T, ax, ay - Math.cos(arm) * L / 2, handZ / 2, arm, 0, 0, .4, L, .42)],       // bras qui tient la chope
      [cyl, BEER, M4(T, ax, hy + .1, handZ, 0, 0, 0, .34, .7, .34)],
      [cyl, FOAM, M4(T, ax, hy + .52, handZ, 0, 0, 0, .36, .18, .36)],
      [sph, skin, M4(T, 0, 3.95, 0, 0, 0, 0, .55, .6, .55)],
      [sph, 0xd23a2a, M4(T, -.3, 3.85, .42, 0, 0, 0, .14, .1, .08)], [sph, 0xd23a2a, M4(T, .3, 3.85, .42, 0, 0, 0, .14, .1, .08)],
      [sph, OLD, M4(T, 0, 4.25, -.05, -.25, 0, .18, .64, .38, .66)],                             // casque de travers
    ]);
  }
  function bottleGeo(T) {
    const cyl = new T.CylinderGeometry(1, 1, 1, 8);
    return merge(T, [[cyl, 0x2f7a3a, M4(T, 0, .55, 0, 0, 0, 0, .3, 1.1, .3)], [cyl, 0x2f7a3a, M4(T, 0, 1.35, 0, 0, 0, 0, .12, .55, .12)], [cyl, 0xe8d8a0, M4(T, 0, .55, 0, 0, 0, 0, .31, .35, .31)]]);
  }
  function kegGeo(T) {
    const cyl = new T.CylinderGeometry(1, 1, 1, 14);
    return merge(T, [[cyl, 0x6a3f1e, M4(T, 0, 1.2, 0, 0, 0, 0, 1.1, 2.4, 1.1)], [cyl, 0x8a8a88, M4(T, 0, .5, 0, 0, 0, 0, 1.13, .16, 1.13)], [cyl, 0x8a8a88, M4(T, 0, 1.9, 0, 0, 0, 0, 1.13, .16, 1.13)],
      [cyl, 0xb0b0ae, M4(T, .9, .9, 0, 0, 0, Math.PI / 2, .14, .5, .14)]]);
  }
  function logsGeo(T) {
    const cyl = new T.CylinderGeometry(1, 1, 1, 7), cone = new T.ConeGeometry(1, 1, 7);
    const parts = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; parts.push([cyl, i % 2 ? 0x3a2414 : 0x4a2e18, M4(T, Math.cos(a) * .9, 1.1, Math.sin(a) * .9, Math.sin(a) * .5, 0, -Math.cos(a) * .5, .28, 2.6, .28)]); }
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283; parts.push([cone, 0x55524e, M4(T, Math.cos(a) * 2.1, .25, Math.sin(a) * 2.1, 0, a, 0, .45, .5, .45)]); }   // cercle de pierres
    return merge(T, parts);
  }
  function blobTex(T, fn) { const c = document.createElement('canvas'); c.width = c.height = 128; fn(c.getContext('2d')); return new T.CanvasTexture(c); }
  function vomitTex(T) {
    return blobTex(T, (g) => {
      g.translate(64, 64);
      for (let i = 0; i < 14; i++) {   // flaque irrégulière jaune-vert
        const a = i / 14 * 6.283, r = 26 + Math.random() * 20;
        g.fillStyle = `rgba(${150 + Math.random() * 40 | 0},${160 + Math.random() * 30 | 0},${40 + Math.random() * 20 | 0},.92)`;
        g.beginPath(); g.ellipse(Math.cos(a) * r * .55, Math.sin(a) * r * .5, 16 + Math.random() * 12, 11 + Math.random() * 9, a, 0, 6.283); g.fill();
      }
      g.fillStyle = 'rgba(176,186,58,.95)'; g.beginPath(); g.ellipse(0, 0, 30, 24, .4, 0, 6.283); g.fill();
      for (let i = 0; i < 40; i++) {   // morceaux
        g.fillStyle = ['rgba(200,120,40,.95)', 'rgba(120,90,30,.9)', 'rgba(230,200,90,.95)'][i % 3];
        g.beginPath(); g.arc((Math.random() - .5) * 64, (Math.random() - .5) * 52, 1.5 + Math.random() * 3.5, 0, 6.283); g.fill();
      }
      g.fillStyle = 'rgba(255,255,220,.45)'; g.beginPath(); g.ellipse(-10, -8, 9, 4, .5, 0, 6.283); g.fill();   // reflet
    });
  }
  function glowTex(T) {
    return blobTex(T, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,170,70,1)'); r.addColorStop(.4, 'rgba(255,90,20,.5)'); r.addColorStop(1, 'rgba(255,50,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  }

  // flammes du feu de joie : langues de feu en bruit fractal (billboards, un seul draw)
  const NOISE = `float fcH(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float fcN(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(fcH(i),fcH(i+vec2(1.,0.)),u.x), mix(fcH(i+vec2(0.,1.)),fcH(i+vec2(1.,1.)),u.x), u.y); }
    float fcF(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*fcN(p); p*=2.03; a*=.5; } return s; }`;
  function flames(T, list) {
    const base = new T.PlaneGeometry(1, 1); base.translate(0, .5, 0);
    const g = new T.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    const pos = new Float32Array(list.length * 3), par = new Float32Array(list.length * 3);
    list.forEach((f, i) => { pos.set([f.x, f.y, f.z], i * 3); par.set([f.w, f.h, f.seed], i * 3); });
    g.setAttribute('aPos', new T.InstancedBufferAttribute(pos, 3)); g.setAttribute('aP', new T.InstancedBufferAttribute(par, 3)); g.instanceCount = list.length;
    const m = new T.ShaderMaterial({
      uniforms: { uT: U.uT, uFire: U.uFire },
      vertexShader: `uniform float uT; uniform float uFire; attribute vec3 aPos; attribute vec3 aP; varying vec2 vUv; varying float vSeed;
        void main(){ vUv = uv; vSeed = aP.z; vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          float sway = sin(uT*2.1 + aP.z*20.0)*0.12*position.y*position.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(aPos + right*((position.x + sway)*aP.x*mix(0.55, 1.0, uFire)) + vec3(0.0, position.y*aP.y*uFire, 0.0), 1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vUv; varying float vSeed; ${NOISE}
        void main(){ vec2 p = vec2((vUv.x-0.5)*2.0, vUv.y);
          float n1 = fcF(vec2(p.x*1.3 + vSeed*13.0, p.y*1.5 - uT*2.0)), n2 = fcF(vec2(p.x*3.1 - vSeed*7.0, p.y*3.3 - uT*3.6));
          p.x += (n1-0.5)*0.9*p.y; float w = 0.85*pow(max(1.0-p.y, 0.0), 0.7) + 0.03;
          float f = (1.0 - abs(p.x)/w)*0.9 - p.y*0.75 + (n2-0.5)*1.2*(0.2+p.y) + 0.2;
          float a = smoothstep(0.02, 0.22, f) * smoothstep(0.0, 0.06, vUv.y); if (a < 0.01) discard;
          vec3 c = mix(vec3(0.6,0.06,0.0), vec3(1.0,0.38,0.04), smoothstep(0.05,0.35,f)); c = mix(c, vec3(1.0,0.78,0.3), smoothstep(0.42,0.85,f));
          gl_FragColor = vec4(c*(0.6 + 1.1*smoothstep(0.3,0.95,f)), a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; return mesh;
  }
  function sparks(T, list) {
    const g = new T.BufferGeometry(), pos = new Float32Array(list.length * 3), par = new Float32Array(list.length * 3);
    list.forEach((e, i) => { pos.set([e.x, e.y, e.z], i * 3); par.set([e.rate, e.seed, e.h], i * 3); });
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aP', new T.BufferAttribute(par, 3));
    const pr = (window.Planet3D && Planet3D.renderer) ? Planet3D.renderer.getPixelRatio() : 2;
    const m = new T.ShaderMaterial({
      uniforms: { uT: U.uT, uPR: { value: pr }, uFire: U.uFire },
      vertexShader: `uniform float uT; uniform float uPR; uniform float uFire; attribute vec3 aP; varying float vA;
        void main(){ float u = fract(uT*aP.x + aP.y);
          vec3 c = position + vec3(sin(uT*1.7 + aP.y*40.0)*1.5*u, u*aP.z, cos(uT*1.3 + aP.y*23.0)*1.5*u);
          vec4 mv = viewMatrix * vec4(c, 1.0); gl_Position = projectionMatrix * mv; vA = (1.0-u)*smoothstep(0.0, 0.05, u)*uFire;
          gl_PointSize = min(uPR*5.0, uPR*1.6*(340.0 / -mv.z)); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5)*2.0; float a = (1.0 - smoothstep(0.1, 1.0, d))*vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0,0.6,0.2)*3.0, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = 7; return p;
  }

  const drunkAt = (e) => Math.min(1, Math.max(0, (e - 10) / 40));   // de plus en plus imbibés
  const PAUSE = 1.1;   // minutes passées à vomir à chaque arrêt
  // position sur le chemin (p = 0 → 1), zigzag d'ivrogne de plus en plus large (drunk = 0 → 1)
  function pathAt(s, plan, p, drunk) {
    const vx = plan.dx - s.bx, vz = plan.dz - s.bz, L = Math.hypot(vx, vz) || 1, nx = -vz / L, nz = vx / L;
    const lat = Math.sin(p * Math.PI * plan.zig + s.ph) * (2.5 + 5 * drunk) * Math.sin(p * Math.PI);
    return { x: s.bx + vx * p + nx * lat, z: s.bz + vz * p + nz * lat, dir: Math.atan2(vx, vz) };
  }
  // où en est le soldat t minutes après la victoire : { state: party | walk | puke | arrived, p }
  function planState(plan, e) {
    const t = e - plan.leave, w = plan.w;
    if (t < 0) return { state: 'party', p: 0 };
    const seg = [[w, 'walk', 0], [PAUSE, 'puke', 1 / 3], [w, 'walk', 1 / 3], [PAUSE, 'puke', 2 / 3], [w, 'walk', 2 / 3]];
    let acc = 0;
    for (const [d, st0, p0] of seg) {
      if (t < acc + d) return st0 === 'walk' ? { state: 'walk', p: p0 + (t - acc) / d / 3 } : { state: 'puke', p: p0 };
      acc += d;
    }
    return { state: 'arrived', p: 1 };
  }

  function spots() {
    const P = window.Planet3D; if (!P || !P.buildGroup) return [];
    const parcels = (G.planet && G.planet.parcels) || [];
    const objs = P.buildGroup.children.filter(o => o.userData && o.userData.parcel != null);
    let out = objs.filter(o => { const p = parcels[o.userData.parcel]; return p && p.state === 'built' && p.building === 'caserne'; });
    if (!out.length) out = objs.filter(o => { const p = parcels[o.userData.parcel]; return p && p.state === 'capital'; }).slice(0, 1);
    const seen = new Set(); return out.filter(o => !seen.has(o.userData.parcel) && seen.add(o.userData.parcel));
  }

  function clear() {
    if (FX.group && FX.group.parent) FX.group.parent.remove(FX.group);
    if (FX.group) FX.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    FX.group = null; FX.key = ''; FX.soldiers = []; FX.lights = []; FX.glows = [];
  }

  function build(list, key) {
    const T = three(), P = window.Planet3D;
    clear();
    const g = new T.Group(); g.name = 'SB_BRINGUE'; P.scene.add(g); FX.group = g; FX.key = key;
    rnd = 11;
    const y0 = 0.36;
    const skinMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .75, metalness: .05 });
    const glassMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .15, metalness: .1, emissive: 0x0d2a12, emissiveIntensity: .6 });
    const woodMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: .05 });
    const skins = [0xf0c8a0, 0xd8a578, 0xa8724a, 0x7a4a2c, 0xf4d2b4];
    const geoS = [0, 1, 2, 3, 4].map(i => soldierGeo(T, skins[i], false)), geoC = [0, 1, 2, 3, 4].map(i => soldierGeo(T, skins[i], true));
    const bGeo = bottleGeo(T), kGeo = kegGeo(T), lGeo = logsGeo(T);
    const vTex = vomitTex(T), gTex = glowTex(T);
    const fl = [], sp = [], bottles = [], shards = [];
    const mine = new Set(list.map(o => o.userData.parcel));
    // destinations : parcelles dégagées (pas la forêt des parcelles verrouillées, où on ne les verrait plus)
    const parcels = (G.planet && G.planet.parcels) || [];
    let dests = (P.parcelGroup ? P.parcelGroup.children : []).filter(o => o.userData && o.userData.parcel != null && !mine.has(o.userData.parcel));
    const open = dests.filter(o => { const q = parcels[o.userData.parcel]; return q && q.state !== 'locked'; });
    dests = (open.length >= 3 ? open : dests).map(o => ({ x: o.position.x, z: o.position.z }));
    const zMat = new T.SpriteMaterial({ map: blobTex(T, (c) => { c.font = 'bold 92px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 10; c.strokeStyle = 'rgba(10,20,40,.85)'; c.strokeText('z', 64, 70); c.fillStyle = '#dfefff'; c.fillText('z', 64, 70); }),
      transparent: true, depthWrite: false, fog: false });
    const decal = (x, z, r, tex, add, op, rot) => {
      const m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: op, fog: false,
        blending: add ? T.AdditiveBlending : T.NormalBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      if (!add) m.material.color.setScalar(.62);   // vomi : pas lumineux
      m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, y0 + .08, z); m.renderOrder = 2; g.add(m); return m;
    };
    list.forEach((o, n) => {
      const c = o.position, bb = new T.Box3().setFromObject(o), sz = bb.getSize(new T.Vector3());
      const front = Math.max(sz.z / 2, 8) + 7;           // devant le bâtiment, côté caméra
      const fires = [{ x: c.x - 6, z: c.z + front }, { x: c.x + 9, z: c.z + front - 3 }];
      fires.forEach((f, i) => {
        const logs = new T.Mesh(lGeo, woodMat); logs.position.set(f.x, y0, f.z); logs.rotation.y = R() * 6; logs.castShadow = true; g.add(logs);
        fl.push({ x: f.x, y: y0 + .6, z: f.z, w: 3.4, h: 6.5, seed: R() }, { x: f.x + .6, y: y0 + .4, z: f.z - .4, w: 2.4, h: 4.6, seed: R() }, { x: f.x - .7, y: y0 + .4, z: f.z + .3, w: 2.2, h: 3.8, seed: R() });
        for (let k = 0; k < 26; k++) sp.push({ x: f.x + (R() - .5) * 2, y: y0 + 2, z: f.z + (R() - .5) * 2, rate: .25 + R() * .3, seed: R(), h: 10 + R() * 12 });
        FX.glows.push({ o: decal(f.x, f.z, 8, gTex, true, .5, R() * 6), base: .5, ph: R() * 10 });
        if (FX.lights.length < 3) { const l = new T.PointLight(0xff8a2a, 380, 55, 1.7); l.position.set(f.x, y0 + 5, f.z); g.add(l); FX.lights.push({ o: l, base: 380, ph: R() * 10 }); }
      });
      // tonneau en perce
      const keg = new T.Mesh(kGeo, woodMat); keg.position.set(c.x + 2, y0, c.z + front + 5); keg.rotation.y = R() * 6; keg.castShadow = true; g.add(keg);
      // soldats : autour des feux, chacun son vice
      const roles = ['dance', 'dance', 'cheers', 'cheers', 'sway', 'sway', 'stumble', 'stumble', 'chug', 'lying', 'puke'];
      roles.forEach((role, i) => {
        const f = fires[i % 2], a = (i / roles.length) * 6.283 + R() * .4, r = role === 'lying' ? 5.5 : 3.6 + R() * 1.6;
        const skin = Math.floor(R() * 5), cheers = role === 'cheers' || role === 'dance';
        const mesh = new T.Mesh(cheers ? geoC[skin] : geoS[skin], skinMat); mesh.castShadow = true;
        const s = { mesh, role, fx: f.x, fz: f.z, a, r, ph: R() * 10, sp: .25 + R() * .25, face: 0 };
        mesh.position.set(f.x + Math.cos(a) * r, y0, f.z + Math.sin(a) * r);
        mesh.rotation.y = Math.atan2(f.x - mesh.position.x, f.z - mesh.position.z);
        if (role === 'puke') {   // penché, dos au feu, devant sa flaque
          mesh.rotation.y += Math.PI;
          const px = mesh.position.x + Math.sin(mesh.rotation.y) * 2.6, pz = mesh.position.z + Math.cos(mesh.rotation.y) * 2.6;
          decal(px, pz, 2.4, vTex, false, .95, R() * 6);
        }
        s.bx = mesh.position.x; s.bz = mesh.position.z; s.bry = mesh.rotation.y; s.lyY = R() * 6;
        // dispersion : départ entre 30 et 38 min, arrivée entre 46 et 49 min sur une autre parcelle, deux arrêts vomi
        if (role !== 'lying') {
          const dst = dests.length ? dests[Math.floor(R() * dests.length)] : { x: s.bx + 40, z: s.bz + 40 };
          const plan = { leave: 30 + (i / roles.length) * 8 + R() * .8, dx: dst.x + (R() - .5) * 26, dz: dst.z + (R() - .5) * 26, zig: 5 + Math.floor(R() * 4), vom: [] };
          plan.arrive = 46 + R() * 3; plan.w = (plan.arrive - plan.leave - 2 * PAUSE) / 3;
          [1 / 3, 2 / 3].forEach((p, j) => {
            const at = plan.leave + plan.w * (j + 1) + PAUSE * j, d = drunkAt(at), q = pathAt(s, plan, p, d), dir = q.dir;
            const m = decal(q.x + Math.sin(dir) * 2.4, q.z + Math.cos(dir) * 2.4, 1.6 + R() * 1.2, vTex, false, .92, R() * 6);
            m.visible = false; plan.vom.push({ m, at: at + .15, d });
          });
          s.plan = plan;
        }
        s.zzz = new T.Sprite(zMat); s.zzz.scale.setScalar(4.5); s.zzz.visible = false; g.add(s.zzz);
        g.add(mesh); FX.soldiers.push(s);
      });
      // vomi, bouteilles vides couchées, bouteilles cassées et éclats de verre
      for (let k = 0; k < 3; k++) { const a = R() * 6.283, r = 8 + R() * 6; decal(c.x + Math.cos(a) * r, c.z + front + Math.sin(a) * r * .6, 1.8 + R() * 1.4, vTex, false, .9, R() * 6); }
      for (let k = 0; k < 16; k++) {
        const a = R() * 6.283, r = 3 + R() * 11, broken = k % 3 === 0;
        bottles.push({ x: c.x + Math.cos(a) * r * 1.2, z: c.z + front + Math.sin(a) * r * .7, standing: k % 5 === 0, broken, ry: R() * 6.283 });
        if (broken) for (let q = 0; q < 7; q++) shards.push({ x: bottles[bottles.length - 1].x + (R() - .5) * 2.4, z: bottles[bottles.length - 1].z + (R() - .5) * 2.4, r: R() * 6, s: .25 + R() * .35 });
      }
    });
    // bouteilles : instanciées (couchées, debout, cassées = moitié inférieure seule)
    const bo = new T.Object3D();
    const intact = bottles.filter(b => !b.broken), half = bottles.filter(b => b.broken);
    if (intact.length) {
      const im = new T.InstancedMesh(bGeo, glassMat, intact.length);
      intact.forEach((b, i) => { bo.position.set(b.x, y0 + (b.standing ? 0 : .3), b.z); bo.rotation.set(b.standing ? 0 : Math.PI / 2, b.ry, 0, 'YXZ'); bo.scale.setScalar(1.3); bo.updateMatrix(); im.setMatrixAt(i, bo.matrix); });
      im.castShadow = true; g.add(im);
    }
    if (half.length) {
      const hg = new T.CylinderGeometry(.3, .3, .55, 8, 1, true); hg.translate(0, .28, 0);
      const im = new T.InstancedMesh(hg, new T.MeshStandardMaterial({ color: 0x2f7a3a, roughness: .12, metalness: .1, emissive: 0x0d2a12, emissiveIntensity: .6, side: T.DoubleSide }), half.length);
      half.forEach((b, i) => { bo.position.set(b.x, y0, b.z); bo.rotation.set(.2, b.ry, 0); bo.scale.setScalar(1.3); bo.updateMatrix(); im.setMatrixAt(i, bo.matrix); });
      g.add(im);
    }
    if (shards.length) {
      const sg = new T.TetrahedronGeometry(1, 0); sg.scale(1, .25, 1);
      const im = new T.InstancedMesh(sg, new T.MeshStandardMaterial({ color: 0x5fbf6a, roughness: .05, metalness: .3, emissive: 0x1d4a22, emissiveIntensity: .8 }), shards.length);
      shards.forEach((s, i) => { bo.position.set(s.x, y0 + .05, s.z); bo.rotation.set(0, s.r, 0); bo.scale.setScalar(s.s); bo.updateMatrix(); im.setMatrixAt(i, bo.matrix); });
      g.add(im);
    }
    g.add(flames(T, fl)); g.add(sparks(T, sp));
  }

  function update(act) {
    const P = window.Planet3D;
    if (!act) { if (FX.group) clear(); return; }
    if (!P || !P.ready || !P.scene || !three()) return;
    const list = spots(); if (!list.length) { if (FX.group) clear(); return; }
    const key = list.map(o => o.id).join(',');
    if (key !== FX.key || !FX.group || !FX.group.parent) build(list, key);
  }

  function anim() {
    requestAnimationFrame(anim);
    if (!FX.group || !onPlanet()) return;
    const t = performance.now() / 1000; U.uT.value = t % 1000;
    const e = elapsedMin();
    // les feux baissent pendant la dispersion, il ne reste que des braises quand tout le monde dort
    const fire = e < 30 ? 1 : e < 50 ? 1 - .7 * (e - 30) / 20 : Math.max(.12, .3 - .15 * (e - 50) / 10);
    U.uFire.value = fire;
    FX.lights.forEach(l => { l.o.intensity = l.base * fire * (.72 + .28 * Math.sin(t * 13 + l.ph) * Math.sin(t * 5.1 + l.ph) + .1 * Math.sin(t * 29 + l.ph)); });
    FX.glows.forEach(gl => { gl.o.material.opacity = gl.base * (.3 + .7 * fire) * (.78 + .22 * Math.sin(t * 9 + gl.ph)); });
    const y0 = .36, drunk = drunkAt(e);
    const dk = 1 + drunk * .9;
    FX.soldiers.forEach(s => {
      const m = s.mesh, k = t + s.ph;
      const ps = s.plan ? planState(s.plan, e) : { state: 'party' };
      if (s.plan) s.plan.vom.forEach(v => { v.m.visible = e >= v.at; });
      const asleep = s.role === 'lying' || e >= 50;
      // « z » qui s'envolent au-dessus des dormeurs
      if (asleep) {
        const u = (k * .35) % 1, base = ps.state === 'party' ? { x: m.position.x, z: m.position.z } : null;
        s.zzz.visible = true; s.zzz.material.opacity = Math.sin(u * Math.PI);
        s.zzz.position.set((base ? base.x : m.position.x) + u * 2, y0 + 3 + u * 9, (base ? base.z : m.position.z) - u);
        s.zzz.scale.setScalar(3 + u * 3);
      } else s.zzz.visible = false;
      m.scale.set(1, 1, 1);
      if (asleep && (s.role === 'lying' || ps.state === 'arrived' || e >= 50)) {
        // dort par terre, là où il s'est écroulé ; respire
        const q = s.plan ? pathAt(s, s.plan, 1, 1) : { x: s.bx, z: s.bz };
        if (s.plan && ps.state !== 'arrived') { const q2 = pathAt(s, s.plan, ps.p, drunk); q.x = q2.x; q.z = q2.z; }
        m.position.set(q.x, y0 + .6, q.z); m.rotation.set(-Math.PI / 2, s.lyY, 0, 'YXZ');
        m.scale.set(1, 1, 1 + Math.sin(k * 1.2) * .05);
        return;
      }
      if (ps.state === 'walk') {
        // titube vers sa destination, zigzag et bascules de plus en plus fortes
        const q = pathAt(s, s.plan, ps.p, drunk), lurch = Math.sin(k * 1.3) > .82 ? .5 : 0;
        m.position.set(q.x, y0 + Math.abs(Math.sin(k * 5)) * .3, q.z);
        m.rotation.set(Math.sin(k * 2.3) * .2 * dk + lurch * .4, q.dir + Math.sin(k * 2.7) * .7 * dk, Math.sin(k * 1.9) * .3 * dk + lurch, 'YXZ');
        return;
      }
      if (ps.state === 'puke') {   // arrêt vomi : à l'endroit exact de sa flaque
        const q = pathAt(s, s.plan, ps.p, s.plan.vom[ps.p < .5 ? 0 : 1].d);
        m.position.set(q.x, y0, q.z);
        m.rotation.set(.6 + Math.max(0, Math.sin(k * 2.4)) * .35 * (Math.sin(k * 11) * .5 + .5), q.dir, Math.sin(k * .7) * .1, 'YXZ');
        return;
      }
      if (ps.state === 'arrived') {   // arrivé avant l'heure du sommeil : tient à peine debout
        const q = pathAt(s, s.plan, 1, 1);
        m.position.set(q.x, y0, q.z); m.rotation.set(Math.sin(k * .8) * .3, q.dir + Math.sin(k * .5), Math.sin(k * 1.1) * .45, 'YXZ');
        return;
      }
      // la fête autour du feu
      m.position.set(s.bx, y0, s.bz); m.rotation.set(0, s.bry, 0, 'YXZ');
      switch (s.role) {
        case 'dance':   // saute sur place en tournant, bière en l'air
          m.position.y = y0 + Math.abs(Math.sin(k * 5)) * 1.1; m.rotation.y = s.bry + k * 2.7; m.rotation.z = Math.sin(k * 5) * .18 * dk; break;
        case 'cheers':  // trinque vers le feu, se balance
          m.position.y = y0 + Math.max(0, Math.sin(k * 3.2)) * .4; m.rotation.z = Math.sin(k * 1.6) * .22 * dk; break;
        case 'sway':    // tient à peine debout
          m.rotation.z = Math.sin(k * 1.1) * .32 * dk; m.rotation.x = Math.sin(k * .8 + 1) * .2 * dk; break;
        case 'chug':    // cul sec : se cambre en arrière par à-coups
          m.rotation.x = -Math.max(0, Math.sin(k * 1.4)) * .55; m.rotation.z = Math.sin(k * .9) * .12 * dk; break;
        case 'stumble': { // titube en rond autour du feu, zigzague
          const a = s.a + k * .35 * (1 + .3 * Math.sin(k * 1.7)), r = s.r + 1.2 + Math.sin(k * 2.3) * 1.3 * dk;
          m.position.set(s.fx + Math.cos(a) * r, y0 + Math.abs(Math.sin(k * 4)) * .25, s.fz + Math.sin(a) * r);
          m.rotation.set(Math.sin(k * 2.1) * .15 * dk, -a + Math.sin(k * 3) * .6, Math.sin(k * 1.9) * .38 * dk, 'YXZ'); break; }
        case 'puke':    // penché en avant, secoué de spasmes
          m.rotation.x = .55 + Math.max(0, Math.sin(k * 2.4)) * .35 * (Math.sin(k * 11) * .5 + .5); m.rotation.z = Math.sin(k * .7) * .08; break;
      }
    });
  }
  requestAnimationFrame(anim);

  window.SBBringue = {
    onVictory, refresh, get active() { return active(); },
    get minutes() { return elapsedMin(); },
    // test : état de la scène (combien font la fête, marchent, vomissent, dorment ; dispersion ; feux)
    _stats() {
      const e = elapsedMin(), out = { party: 0, walk: 0, puke: 0, arrived: 0, asleep: 0, zzz: 0, vomit: 0, spread: 0, fire: U.uFire.value, built: !!FX.group };
      FX.soldiers.forEach(s => {
        const st0 = (s.role === 'lying' || e >= 50) ? 'asleep' : s.plan ? planState(s.plan, e).state : 'party';
        out[st0]++; if (s.zzz.visible) out.zzz++;
        if (s.plan) out.vomit += s.plan.vom.filter(v => v.m.visible).length;
        out.spread = Math.max(out.spread, Math.hypot(s.mesh.position.x - s.fx, s.mesh.position.z - s.fz));
      });
      return out;
    },
    // test : SBBringue._debug(true|false) ou SBBringue._debug(35) → 35 min après la victoire
    _debug(on) { const s = st(); s.victoryAt = on === true ? Date.now() : typeof on === 'number' ? Date.now() - on * 60000 : 0; s.victoryHidden = 0; refresh(); },
  };
})();
