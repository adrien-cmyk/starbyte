/* Starbyte — Bringue de caserne (13/10/2026, demandée par Adrien)
   Une flotte rentre victorieuse d'un raid : pendant 1 h, la caserne fait la fête.
   Feux de joie, soldats ivres qui boivent des bières (dansent, titubent, trinquent, un qui cuve par terre),
   tonneau, bouteilles vides et cassées, flaques de vomi. Bandeau sur la carte planète, fermable, sans minuteur.
   Sans caserne, l'équipage fête ça devant le centre de commandement.
   État : G.aftermath.victoryAt / victoryHidden (sauvegardé avec la partie, comme le reste de l'après-attaque). */
(function () {
  const PARTY_MS = 60 * 60 * 1000;

  function st() {
    if (typeof G === 'undefined' || !G) return null;
    if (!G.aftermath) G.aftermath = { dev: 0, partyAt: 0, pendingReport: null, lastRaidAt: 0 };
    return G.aftermath;
  }
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
      const t = `🍺 Raid victorieux · ${hasCaserne() ? 'la caserne' : 'l\'équipage'} fait la bringue`;
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
  const U = { uT: { value: 0 } };
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
      uniforms: { uT: U.uT },
      vertexShader: `uniform float uT; attribute vec3 aPos; attribute vec3 aP; varying vec2 vUv; varying float vSeed;
        void main(){ vUv = uv; vSeed = aP.z; vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          float sway = sin(uT*2.1 + aP.z*20.0)*0.12*position.y*position.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(aPos + right*((position.x + sway)*aP.x) + vec3(0.0, position.y*aP.y, 0.0), 1.0); }`,
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
      uniforms: { uT: U.uT, uPR: { value: pr } },
      vertexShader: `uniform float uT; uniform float uPR; attribute vec3 aP; varying float vA;
        void main(){ float u = fract(uT*aP.x + aP.y);
          vec3 c = position + vec3(sin(uT*1.7 + aP.y*40.0)*1.5*u, u*aP.z, cos(uT*1.3 + aP.y*23.0)*1.5*u);
          vec4 mv = viewMatrix * vec4(c, 1.0); gl_Position = projectionMatrix * mv; vA = (1.0-u)*smoothstep(0.0, 0.05, u);
          gl_PointSize = min(uPR*5.0, uPR*1.6*(340.0 / -mv.z)); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5)*2.0; float a = (1.0 - smoothstep(0.1, 1.0, d))*vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0,0.6,0.2)*3.0, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = 7; return p;
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
        if (role === 'lying') { mesh.rotation.set(-Math.PI / 2, R() * 6, 0, 'YXZ'); mesh.position.y = y0 + .6; }
        if (role === 'puke') {   // penché, dos au feu, devant sa flaque
          mesh.rotation.y += Math.PI;
          const px = mesh.position.x + Math.sin(mesh.rotation.y) * 2.6, pz = mesh.position.z + Math.cos(mesh.rotation.y) * 2.6;
          decal(px, pz, 2.4, vTex, false, .95, R() * 6);
        }
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
    FX.lights.forEach(l => { l.o.intensity = l.base * (.72 + .28 * Math.sin(t * 13 + l.ph) * Math.sin(t * 5.1 + l.ph) + .1 * Math.sin(t * 29 + l.ph)); });
    FX.glows.forEach(gl => { gl.o.material.opacity = gl.base * (.78 + .22 * Math.sin(t * 9 + gl.ph)); });
    const y0 = .36;
    FX.soldiers.forEach(s => {
      const m = s.mesh, k = t + s.ph;
      switch (s.role) {
        case 'dance':   // saute sur place en tournant, bière en l'air
          m.position.y = y0 + Math.abs(Math.sin(k * 5)) * 1.1; m.rotation.y += .045; m.rotation.z = Math.sin(k * 5) * .18; break;
        case 'cheers':  // trinque vers le feu, se balance
          m.position.y = y0 + Math.max(0, Math.sin(k * 3.2)) * .4; m.rotation.z = Math.sin(k * 1.6) * .22; break;
        case 'sway':    // tient à peine debout
          m.rotation.z = Math.sin(k * 1.1) * .32; m.rotation.x = Math.sin(k * .8 + 1) * .2; break;
        case 'chug':    // cul sec : se cambre en arrière par à-coups
          m.rotation.x = -Math.max(0, Math.sin(k * 1.4)) * .55; m.rotation.z = Math.sin(k * .9) * .12; break;
        case 'stumble': { // titube en rond autour du feu, zigzague
          s.a += .006 * (1 + Math.sin(k * 1.7)); const r = s.r + 1.2 + Math.sin(k * 2.3) * 1.3;
          m.position.set(s.fx + Math.cos(s.a) * r, y0 + Math.abs(Math.sin(k * 4)) * .25, s.fz + Math.sin(s.a) * r);
          m.rotation.set(Math.sin(k * 2.1) * .15, -s.a + Math.sin(k * 3) * .6, Math.sin(k * 1.9) * .38, 'YXZ'); break; }
        case 'lying':   // cuve : respire
          m.scale.set(1, 1, 1 + Math.sin(k * 1.2) * .04); break;
        case 'puke':    // penché en avant, secoué de spasmes
          m.rotation.x = .55 + Math.max(0, Math.sin(k * 2.4)) * .35 * (Math.sin(k * 11) * .5 + .5); m.rotation.z = Math.sin(k * .7) * .08; break;
      }
    });
  }
  requestAnimationFrame(anim);

  window.SBBringue = {
    onVictory, refresh, get active() { return active(); },
    // test : SBBringue._debug(true|false)
    _debug(on) { const s = st(); s.victoryAt = on ? Date.now() : 0; s.victoryHidden = 0; refresh(); },
  };
})();
