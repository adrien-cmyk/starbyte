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

  function onRelief(tier) {
    const s = st(); if (!s) return;
    const r = RELIEF[Math.min(3, tier || 0)] || 0;
    if (!r || !dev()) return;
    s.dev = Math.max(0, dev() - r);
    say(s.dev > 0 ? `Secours : dévastation −${r} % · reste ${Math.round(s.dev)} %` : 'Secours : la planète est remise sur pied');
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
  #sb-devast .bar i { display:block; height:100%; background:linear-gradient(90deg,#ff3a20,#ff9a40); }
  #sb-devast button { border:1px solid rgba(255,140,110,.6); background:rgba(120,20,10,.6); color:#ffe3dc; border-radius:8px; padding:6px 10px;
    font-size:10px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
  #sb-party { position:fixed; left:12px; right:12px; top:calc(var(--sat, env(safe-area-inset-top, 0px)) + 150px); z-index:30; display:none;
    padding:9px 12px; border-radius:10px; border:1px solid rgba(120,230,160,.45); background:rgba(6,30,18,.8); color:#d8ffe6;
    backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); font-size:12px; text-align:center; letter-spacing:.06em; }`;
  document.head.appendChild(css);
  const ban = document.createElement('div'); ban.id = 'sb-devast';
  ban.innerHTML = `<span>Planète dévastée · <b>0 %</b></span><span class="bar"><i></i></span><button>Secours</button>`;
  ban.addEventListener('click', startRelief);
  const party = document.createElement('div'); party.id = 'sb-party';
  document.body.appendChild(ban); document.body.appendChild(party);

  function onPlanet() { const s = document.getElementById('scr-planet'); return !!s && !s.classList.contains('hidden'); }
  function refresh() {
    const d = dev(), ph = partyPhase(), on = onPlanet();
    ban.style.display = on && d >= 1 ? 'flex' : 'none';
    if (d >= 1) { ban.querySelector('b').textContent = Math.round(d) + ' %'; ban.querySelector('.bar i').style.width = d + '%'; }
    party.style.display = on && ph && d < 1 ? 'block' : 'none';
    if (ph) { const left = Math.ceil((BANNERS_MS - ph.t) / 60000); party.textContent = `🎉 Raid repoussé · la colonie fait la fête (${left} min)`; }
    // rapport en attente : ouvert automatiquement dès que la carte est à l'écran
    const s = st();
    if (on && s && s.pendingReport && typeof openReportDetail === 'function') {
      const id = s.pendingReport; s.pendingReport = null; save();
      setTimeout(() => { try { openReportDetail(id); } catch (e) { console.warn('[aftermath] rapport', e); } }, 900);
    }
    const b = Math.round(d / 10);
    if (b !== refresh._b) { refresh._b = b; if (window.Planet3D && Planet3D.ready && Planet3D.sync) try { Planet3D.sync(); } catch (e) {} }
    if (window.SBAftermathFX) window.SBAftermathFX.update(d, ph);
  }
  setInterval(refresh, 1000);

  // ── effets 3D sur la carte (feux d'artifice, banderoles, incendies, fumée, gyrophares) ─────────────
  const FX = { group: null, built: '', t0: performance.now(), parts: [] };
  function three() { return window.SB3D && window.SB3D.THREE; }
  function radial(T, stops) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => r.addColorStop(o, col));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
  }
  function buildingSpots() {
    const P = window.Planet3D; const out = [];
    if (!P || !P.buildGroup) return out;
    P.buildGroup.children.forEach(o => { if (o.userData && o.userData.parcel != null) out.push({ p: o.position.clone(), idx: o.userData.parcel, obj: o }); });
    return out;
  }
  function clearFX() { if (FX.group && FX.group.parent) FX.group.parent.remove(FX.group); FX.group = null; FX.parts = []; FX.built = ''; }
  function buildFX(d, ph) {
    const T = three(), P = window.Planet3D;
    if (!T || !P || !P.scene) return;
    clearFX();
    const g = new T.Group(); g.name = 'SB_AFTERMATH'; P.scene.add(g); FX.group = g;
    const spots = buildingSpots(); if (!spots.length) return;
    const ctr = spots.reduce((a, s) => a.add(s.p), new T.Vector3()).multiplyScalar(1 / spots.length);
    const y0 = spots[0].p.y;
    let rnd = 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    if (d >= 1) {
      // incendies dans la forêt (couronne autour de la colonie) + colonnes de fumée
      const fireTex = radial(T, [[0, 'rgba(255,230,160,1)'], [.3, 'rgba(255,120,30,.8)'], [1, 'rgba(255,40,0,0)']]);
      const smokeTex = radial(T, [[0, 'rgba(60,55,52,.75)'], [.6, 'rgba(40,38,36,.35)'], [1, 'rgba(30,30,30,0)']]);
      const nFire = Math.round(6 + d / 100 * 30);
      for (let i = 0; i < nFire; i++) {
        const a = R() * Math.PI * 2, r = 85 + R() * 95;
        const pos = new T.Vector3(ctr.x + Math.cos(a) * r, y0 + 2, ctr.z + Math.sin(a) * r * 0.8);
        const f = new T.Sprite(new T.SpriteMaterial({ map: fireTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
        f.position.copy(pos); f.scale.setScalar(10 + R() * 8); g.add(f);
        FX.parts.push({ kind: 'fire', o: f, ph: R() * 10, base: f.scale.x, y: pos.y });
        const light = i % 4 === 0 ? new T.PointLight(0xff6a20, 600, 80, 1.6) : null;
        if (light) { light.position.copy(pos).add(new T.Vector3(0, 6, 0)); g.add(light); FX.parts.push({ kind: 'flick', o: light, ph: R() * 10 }); }
        for (let k = 0; k < 2; k++) {
          const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: 0 }));
          g.add(s); FX.parts.push({ kind: 'smoke', o: s, x: pos.x, y: pos.y + 4, z: pos.z, ph: R(), rate: 0.05 + R() * 0.04, size: 22 + R() * 16 });
        }
      }
      // fumée sur les bâtiments
      spots.forEach((s, i) => {
        if (R() > 0.35 + d / 150) return;
        for (let k = 0; k < 2; k++) {
          const sm = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: 0 }));
          g.add(sm); FX.parts.push({ kind: 'smoke', o: sm, x: s.p.x + (R() - .5) * 10, y: s.p.y + 12, z: s.p.z + (R() - .5) * 10, ph: R(), rate: 0.06 + R() * 0.05, size: 18 + R() * 14 });
        }
      });
      // gyrophares d'urgence sanitaire autour du centre de commandement
      const ci = capitalIdx(); const cap = spots.find(s => s.idx === ci) || spots[0];
      const beaconTex = radial(T, [[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        const b = new T.Sprite(new T.SpriteMaterial({ map: beaconTex, color: k % 2 ? 0xff2a20 : 0x2a7aff, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
        b.position.set(cap.p.x + Math.cos(a) * 30, y0 + 3, cap.p.z + Math.sin(a) * 30); b.scale.setScalar(9); g.add(b);
        FX.parts.push({ kind: 'beacon', o: b, ph: k * 0.5 });
      }
    }
    if (d < 1 && ph) {
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
      // feux d'artifice : 6 lanceurs, gerbes de particules additives
      FX.fwTex = radial(T, [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
      FX.fw = []; FX.fwCtr = ctr; FX.fwY = y0; FX.fwNext = 0; FX.cols = cols;
    }
    FX.built = (d >= 1 ? 'd' + Math.round(d / 10) : '') + (ph && d < 1 ? 'p' : '') + ':' + spots.length;
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
  function anim() {
    requestAnimationFrame(anim);
    if (!FX.group || !onPlanet()) return;
    const T = three(); const now = performance.now(), t = now / 1000, dt = Math.min(0.05, (now - (FX.last || now)) / 1000); FX.last = now;
    for (const p of FX.parts) {
      if (p.kind === 'fire') { const k = 0.8 + 0.25 * Math.sin(t * 9 + p.ph) + 0.1 * Math.sin(t * 23 + p.ph * 3); p.o.scale.set(p.base * k, p.base * k * 1.3, 1); p.o.position.y = p.y + p.base * 0.3 * k; }
      else if (p.kind === 'flick') p.o.intensity = 450 + 250 * Math.sin(t * 11 + p.ph) * Math.sin(t * 4.3 + p.ph);
      else if (p.kind === 'smoke') { const u = (t * p.rate + p.ph) % 1; p.o.position.set(p.x + u * 14, p.y + u * 60, p.z - u * 8); p.o.scale.setScalar(p.size * (0.5 + u * 1.6)); p.o.material.opacity = Math.sin(u * Math.PI) * 0.6; }
      else if (p.kind === 'beacon') p.o.material.opacity = Math.max(0, Math.sin(t * 6 + p.ph * Math.PI)) ;
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
      const spots = P.buildGroup ? P.buildGroup.children.filter(o => o.userData && o.userData.parcel != null).length : 0;
      const want = (d >= 1 ? 'd' + Math.round(d / 10) : '') + (ph && d < 1 ? 'p' : '') + ':' + spots;
      if (!(d >= 1) && !ph) { if (FX.group) clearFX(); return; }
      if (want !== FX.built || !FX.group || !FX.group.parent) buildFX(d, ph);
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
