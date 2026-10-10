/* ═══════════════════════════════════════════════════════════════════════
   STARBYTE — SPACE MAP v0 (10/10/2026)
   Cf. GDD « Space Map v0 » (claude/starbyte_GDD_space_map_v0.md)

   Le point de vue du prospecteur : ma planète au centre, mon secteur en
   disque, le noir honnête partout où rien n'a été sondé, les anneaux de
   portée liés aux compétences de cartographie.

   Rendu SVG pur à partir de l'état du jeu (G) — aucune donnée nouvelle en
   sauvegarde. Les marqueurs en vol sont calculés depuis departedAt /
   arrivalAt (compatible avec le rattrapage hors ligne).

   Dépend des globals du jeu : G, MY_ADDRESS, _hashSeed, _mulberry32,
   _sectorDistance, getMaxRange, launchProbe, probeSignatureNextAction,
   _probeTierStatus, _sigBtn, _sigOff, formatTankerDuration, openPlanetDetail,
   onTankerKnownTargetClick, saveGame, TILES, SIGNATURE_TYPES.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const W = 360, H = 360, CX = 180, CY = 180;
  // Rayons des anneaux (distance de secteur 0..3). Au-delà : hors carte.
  const BANDS = [[0, 108], [108, 140], [140, 164], [164, 180]];
  const COL = {
    radar: '#e6f0ff', light: '#5fcc8a', medium: '#9a8aff', tanker: '#ffc864',
    cyan: '#5fffe8', mut: '#6a7a72',
  };

  let _root = null;       // conteneur HTML
  let _sel = null;        // sélection courante { kind, ... }
  let _raf = null;        // boucle d'animation des marqueurs en vol
  let _lastNonce = 0;

  /* ─── Géométrie déterministe ─── */
  function mySector() { return (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) ? MY_ADDRESS.sector : 'A'; }
  function myCluster() { return (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) ? MY_ADDRESS.cluster : 'A'; }
  function mySystemKey() { return `${myCluster()}-${mySector()}-${MY_ADDRESS.system}`; }

  function litBands() {
    const r = (typeof getMaxRange === 'function') ? getMaxRange() : { kind: 'sector_local' };
    if (r.kind === 'universe' || r.kind === 'cluster') return 4;
    if (r.kind === 'sector_radius') return Math.min(4, r.radius + 1);
    return 1;
  }

  // Position d'un système W-X-YYYY : angle + rayon déterministes dans la bande de son secteur
  function systemPos(sysKey) {
    if (sysKey === mySystemKey()) return { x: CX, y: CY, band: 0 };
    const parts = String(sysKey).split('-');
    const sector = parts[1] || mySector();
    const d = Math.min(3, _sectorDistance(mySector(), sector));
    const [r0, r1] = BANDS[d];
    const rng = _mulberry32(_hashSeed('SM:' + sysKey));
    const a = rng() * Math.PI * 2;
    const inner = d === 0 ? 34 : r0 + 4;
    const outer = r1 - 6;
    const r = Math.min(166, inner + rng() * (outer - inner));
    return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, band: d, angle: a };
  }

  // Un objet (signature, cible, planète) orbite autour de son système
  function satellitePos(sysKey, id, k) {
    const p = systemPos(sysKey);
    const rng = _mulberry32(_hashSeed('SMS:' + id));
    const a = rng() * Math.PI * 2;
    const r = 11 + (k % 3) * 5 + rng() * 4;
    let x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    // Rester dans le cadre (rayon 174 autour du centre)
    const dx = x - CX, dy = y - CY, dd = Math.hypot(dx, dy);
    if (dd > 174) { x = CX + dx / dd * 174; y = CY + dy / dd * 174; }
    return { x, y };
  }

  /* ─── Lecture de l'état ─── */
  function collect() {
    const now = Date.now();
    const systems = {};
    const add = (key, data) => { if (!systems[key]) systems[key] = { key, sigs: [], targets: [], planets: [], known: false }; Object.assign(systems[key], data || {}); return systems[key]; };

    for (const sys of Object.values(G.knownSystems || {})) {
      const key = `${sys.cluster}-${sys.sector}-${sys.system}`;
      const s = add(key, { known: true, isMine: !!sys.isMine });
      for (const p of (sys.planets || [])) if (!p.isMine) s.planets.push(p);
    }
    for (const sig of Object.values(G.signatures || {})) {
      if (sig.ignored) continue;
      if (!sig.resolved && sig.expiresAt && sig.expiresAt < now) continue;
      const s = add(sig.system, { known: true });
      if (!sig.resolved) { s.sigs.push(sig); continue; }
      if (sig.resolvedType === 'moving') {
        const kt = sig.movingCoordKey && G.knownTargets && G.knownTargets[sig.movingCoordKey];
        if (kt) s.targets.push({ key: sig.movingCoordKey, kt, sig });
      } else if (!sig.fixedAddress) {
        s.sigs.push(sig);   // corps orbital identifié, à verrouiller
      } else {
        // planète fixée : déjà dans knownSystems.planets normalement ; sinon on la pose
        if (!s.planets.some(p => p.coord === sig.fixedAddress)) s.planets.push({ coord: sig.fixedAddress, name: sig.fixedAddress, fromSig: sig });
      }
    }
    // Cibles connues sans signature (anciennes saves)
    for (const [key, kt] of Object.entries(G.knownTargets || {})) {
      if (kt.expiresAt && kt.expiresAt < now) continue;
      const sysKey = key.split('/')[0];
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(sysKey)) continue;
      const s = add(sysKey, { known: true });
      if (!s.targets.some(t => t.key === key)) s.targets.push({ key, kt, sig: null });
    }
    // Missions en vol
    const flights = [];
    for (const m of (G.probeMissions || [])) {
      if (m.status !== 'in_transit') continue;
      let to = null, label = `Sonde ${m.probeName || ''}`.trim();
      const tc = String(m.targetCoords || '');
      if (/^SIG-/.test(tc)) { const sig = G.signatures && G.signatures[tc]; if (sig) to = satellitePos(sig.system, sig.id, 0); }
      else if (/^[A-Z]-[A-Z]-\d{4}/.test(tc)) { const sk = tc.split('-').slice(0, 3).join('-'); to = systemPos(sk); add(sk, { scanning: true }); }
      if (to) flights.push({ kind: 'probe', tier: m.tier, id: m.id, label, to, from: { x: CX, y: CY }, departedAt: m.departedAt, arrivalAt: m.arrivalAt, target: tc });
    }
    for (const m of (G.tankerMissions || [])) {
      if (!(m.status === 'in_transit' || m.status === 'returning' || m.status === 'exploring')) continue;
      const tc = String(m.targetCoords || '');
      const sysKey = tc.split('/')[0];
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(sysKey)) continue;
      const to = satellitePos(sysKey, tc, 0);
      const back = m.status === 'returning';
      flights.push({ kind: 'tanker', id: m.id, label: m.tankerName || 'Tanker', to: back ? { x: CX, y: CY } : to, from: back ? to : { x: CX, y: CY },
        departedAt: back ? (m.returnDepartedAt || m.arrivalAt || m.departedAt) : m.departedAt, arrivalAt: back ? (m.returnArrivalAt || m.arrivalAt) : m.arrivalAt, target: tc, back });
    }
    return { systems, flights };
  }

  /* ─── Rendu ─── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function svgMarkup(state) {
    const lit = litBands();
    const litR = BANDS[Math.min(3, lit - 1)][1];      // rayon de la portée
    const parts = [];
    const rng = _mulberry32(_hashSeed('SM:scene:' + mySystemKey()));
    const anyRadar = state.flights.some(f => f.kind === 'probe' && f.tier === 'radar');

    parts.push(`<defs>
      <radialGradient id="sm-home" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${COL.cyan}" stop-opacity=".18"/><stop offset=".45" stop-color="${COL.cyan}" stop-opacity=".04"/><stop offset="1" stop-color="${COL.cyan}" stop-opacity="0"/></radialGradient>
      <radialGradient id="sm-range" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${COL.cyan}" stop-opacity="0"/><stop offset=".86" stop-color="${COL.cyan}" stop-opacity=".012"/><stop offset=".975" stop-color="${COL.cyan}" stop-opacity=".08"/><stop offset="1" stop-color="${COL.cyan}" stop-opacity="0"/></radialGradient>
      <radialGradient id="sm-far" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7a8c88" stop-opacity="0"/><stop offset=".9" stop-color="#7a8c88" stop-opacity=".03"/><stop offset="1" stop-color="#7a8c88" stop-opacity="0"/></radialGradient>
      <radialGradient id="sm-vig" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>
      <radialGradient id="sm-neb-a" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2a7a86" stop-opacity=".16"/><stop offset="1" stop-color="#2a7a86" stop-opacity="0"/></radialGradient>
      <radialGradient id="sm-neb-b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#5a4a9a" stop-opacity=".12"/><stop offset="1" stop-color="#5a4a9a" stop-opacity="0"/></radialGradient>
      <radialGradient id="sm-neb-c" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1f5a4a" stop-opacity=".14"/><stop offset="1" stop-color="#1f5a4a" stop-opacity="0"/></radialGradient>
      <filter id="sm-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="sm-glow2" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <clipPath id="sm-clip-lit"><circle cx="${CX}" cy="${CY}" r="${litR}"/></clipPath>
    </defs>`);

    // ── Couche 0 : nébuleuses (parallaxe lente) ──
    const neb = [];
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, r = 40 + rng() * 120, rx = 70 + rng() * 70, ry = 40 + rng() * 50, rot = rng() * 180;
      neb.push(`<ellipse cx="${(CX + Math.cos(a) * r).toFixed(1)}" cy="${(CY + Math.sin(a) * r).toFixed(1)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" fill="url(#sm-neb-${'abc'[i]})" transform="rotate(${rot.toFixed(0)} ${(CX + Math.cos(a) * r).toFixed(1)} ${(CY + Math.sin(a) * r).toFixed(1)})"/>`);
    }
    parts.push(`<g class="sm-layer" data-depth=".18" pointer-events="none"><g class="sm-drift slow">${neb.join('')}</g></g>`);

    // ── Couche 1 : étoiles lointaines (petites, nombreuses) ──
    const far = [];
    for (let i = 0; i < 110; i++) { const x = -30 + rng() * (W + 60), y = -30 + rng() * (H + 60); far.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.25 + rng() * 0.5).toFixed(2)}" fill="#dfe" opacity="${(0.10 + rng() * 0.25).toFixed(2)}"/>`); }
    parts.push(`<g class="sm-layer" data-depth=".35" pointer-events="none"><g class="sm-drift">${far.join('')}</g></g>`);

    // ── Couche 2 : étoiles proches (plus grosses, quelques scintillements) ──
    const near = [];
    for (let i = 0; i < 34; i++) { const x = -20 + rng() * (W + 40), y = -20 + rng() * (H + 40); const tw = rng() < 0.35; near.push(`<circle class="${tw ? 'sm-twinkle' : ''}" style="${tw ? `animation-delay:${(rng() * 4).toFixed(1)}s` : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + rng() * 0.8).toFixed(2)}" fill="#eef" opacity="${(0.25 + rng() * 0.4).toFixed(2)}"/>`); }
    parts.push(`<g class="sm-layer" data-depth=".6" pointer-events="none"><g class="sm-drift fast">${near.join('')}</g></g>`);

    // ── Portée : halo de la zone sondable, bande hors portée en brume ──
    const edge = Math.min(3, lit);
    if (lit < 4) parts.push(`<circle class="sm-band far" data-band="${edge}" cx="${CX}" cy="${CY}" r="${BANDS[edge][1]}" fill="url(#sm-far)"/>`);
    parts.push(`<circle class="sm-band lit" cx="${CX}" cy="${CY}" r="${litR}" fill="url(#sm-range)"/>`);
    parts.push(`<circle class="sm-range-ring" cx="${CX}" cy="${CY}" r="${litR}" pointer-events="none"/>`);
    for (let d = 1; d < lit && d < 4; d++) parts.push(`<circle class="sm-band-sep" cx="${CX}" cy="${CY}" r="${BANDS[d - 1][1]}" pointer-events="none"/>`);
    parts.push(`<circle cx="${CX}" cy="${CY}" r="64" fill="url(#sm-home)" pointer-events="none"/>`);

    // ── Balayage radar (tant qu'une Radar est en vol) ──
    if (anyRadar) {
      parts.push(`<g clip-path="url(#sm-clip-lit)" pointer-events="none"><g class="sm-sweep-rot" style="transform-origin:${CX}px ${CY}px">
        <path d="M${CX} ${CY} L${CX + litR} ${CY} A${litR} ${litR} 0 0 0 ${(CX + Math.cos(-0.5) * litR).toFixed(1)} ${(CY + Math.sin(-0.5) * litR).toFixed(1)} Z" fill="${COL.radar}" fill-opacity=".035"/>
        <path d="M${CX} ${CY} L${CX + litR} ${CY} A${litR} ${litR} 0 0 0 ${(CX + Math.cos(-0.12) * litR).toFixed(1)} ${(CY + Math.sin(-0.12) * litR).toFixed(1)} Z" fill="${COL.radar}" fill-opacity=".05"/>
        <line x1="${CX}" y1="${CY}" x2="${CX + litR}" y2="${CY}" stroke="${COL.radar}" stroke-opacity=".32" stroke-width=".6"/></g></g>`);
    }

    // ── Trajets en vol (traînée fine, sous les objets) ──
    for (const f of state.flights) {
      const c = f.kind === 'tanker' ? COL.tanker : (f.tier === 'radar' ? COL.radar : f.tier === 'medium' ? COL.medium : COL.light);
      parts.push(`<g pointer-events="none"><line class="sm-route" x1="${f.from.x.toFixed(1)}" y1="${f.from.y.toFixed(1)}" x2="${f.to.x.toFixed(1)}" y2="${f.to.y.toFixed(1)}" stroke="${c}"/>
        <line class="sm-trail" data-for="${esc(f.id)}" x1="${f.from.x.toFixed(1)}" y1="${f.from.y.toFixed(1)}" x2="${f.from.x.toFixed(1)}" y2="${f.from.y.toFixed(1)}" stroke="${c}"/></g>`);
    }

    // ── Objets (couche fixe : les touchers restent exacts) ──
    const objs = [];
    for (const s of Object.values(state.systems)) {
      const p = systemPos(s.key);
      if (p.band >= lit && !s.known) continue;
      const isMine = s.key === mySystemKey();
      const short = s.key.split('-').slice(1).join('-');
      if (isMine) {
        const name = esc((G.profile && G.profile.planetName) || 'MA PLANÈTE');
        objs.push(`<g class="sm-obj sm-home" data-kind="home" data-key="${esc(s.key)}">
          <circle cx="${CX}" cy="${CY}" r="14" fill="transparent"/>
          <circle class="sm-breathe" cx="${CX}" cy="${CY}" r="13" fill="none" stroke="${COL.cyan}" stroke-opacity=".28" stroke-width=".8"/>
          <circle cx="${CX}" cy="${CY}" r="5.2" fill="${COL.cyan}" filter="url(#sm-glow2)"/>
          <circle cx="${CX}" cy="${CY}" r="2.2" fill="#f4fffd"/>
          <text x="${CX}" y="${CY + 25}" class="sm-lab" fill="${COL.cyan}">${name}</text></g>`);
      } else {
        const known = s.known;
        objs.push(`<g class="sm-obj sm-sys${known ? '' : ' faint'}" data-kind="system" data-key="${esc(s.key)}">
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" fill="transparent"/>
          ${known ? `<path class="sm-glint" d="M${(p.x - 6).toFixed(1)} ${p.y.toFixed(1)} H${(p.x + 6).toFixed(1)} M${p.x.toFixed(1)} ${(p.y - 6).toFixed(1)} V${(p.y + 6).toFixed(1)}" stroke="#dfe" stroke-opacity=".28" stroke-width=".5"/>` : ''}
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${known ? 2.4 : 1.6}" fill="${known ? '#eafff9' : COL.mut}" ${known ? 'filter="url(#sm-glow)"' : ''}/>
          ${s.scanning ? `<circle class="sm-scan" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="none" stroke="${COL.radar}" stroke-opacity=".6" stroke-width=".7"/><circle class="sm-scan d2" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="none" stroke="${COL.radar}" stroke-opacity=".6" stroke-width=".7"/>` : ''}
          <text x="${p.x.toFixed(1)}" y="${(p.y + 15).toFixed(1)}" class="sm-lab tiny" fill="${COL.mut}">${esc(short)}</text></g>`);
      }
      let k = 0;
      for (const sig of s.sigs) {
        const q = satellitePos(s.key, sig.id, k++);
        if (!sig.resolved) {
          objs.push(`<g class="sm-obj sm-sig" data-kind="sig" data-key="${esc(sig.id)}">
            <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="9" fill="transparent"/>
            <circle class="sm-ring" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="5" fill="none" stroke="${COL.radar}" stroke-opacity=".35" stroke-width=".5"/>
            <circle class="sm-pulse" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="2.2" fill="${COL.radar}" filter="url(#sm-glow)"/></g>`);
        } else {
          objs.push(`<g class="sm-obj sm-body" data-kind="sig" data-key="${esc(sig.id)}">
            <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="9" fill="transparent"/>
            <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="4" fill="${COL.light}" fill-opacity=".12" stroke="${COL.light}" stroke-dasharray="2 1.5" stroke-width=".8"/></g>`);
        }
      }
      for (const t of s.targets) {
        const q = satellitePos(s.key, t.key, k++);
        const engaged = t.kt.status === 'engaged';
        const col = engaged ? COL.mut : COL.tanker;
        objs.push(`<g class="sm-obj sm-tgt" data-kind="target" data-key="${esc(t.key)}">
          <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="9" fill="transparent"/>
          <path d="M${q.x.toFixed(1)} ${(q.y - 4.2).toFixed(1)} L${(q.x + 4.2).toFixed(1)} ${q.y.toFixed(1)} L${q.x.toFixed(1)} ${(q.y + 4.2).toFixed(1)} L${(q.x - 4.2).toFixed(1)} ${q.y.toFixed(1)} Z" fill="${col}" ${engaged ? '' : 'filter="url(#sm-glow)"'}/></g>`);
      }
      for (const pl of s.planets) {
        const q = satellitePos(s.key, pl.coord, k++);
        objs.push(`<g class="sm-obj sm-planet" data-kind="planet" data-key="${esc(pl.coord)}">
          <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="9" fill="transparent"/>
          <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="5.5" fill="none" stroke="${COL.medium}" stroke-opacity=".3" stroke-width=".5"/>
          <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="3.4" fill="${COL.medium}" filter="url(#sm-glow)"/>
          <text x="${q.x.toFixed(1)}" y="${(q.y + 12).toFixed(1)}" class="sm-lab tiny" fill="${COL.medium}">${esc(pl.name || '')}</text></g>`);
      }
    }
    for (const f of state.flights) {
      const c = f.kind === 'tanker' ? COL.tanker : (f.tier === 'radar' ? COL.radar : f.tier === 'medium' ? COL.medium : COL.light);
      objs.push(`<g class="sm-obj sm-flight" data-kind="flight" data-key="${esc(f.id)}" data-x1="${f.from.x}" data-y1="${f.from.y}" data-x2="${f.to.x}" data-y2="${f.to.y}" data-t0="${f.departedAt || 0}" data-t1="${f.arrivalAt || 0}">
        <circle class="sm-fly-hit" r="9" fill="transparent"/>
        <path class="sm-plume" d="M0 2.5 L1.6 9 L0 13 L-1.6 9 Z" fill="${c}" fill-opacity=".35"/>
        ${f.kind === 'tanker'
          ? `<rect class="sm-fly" x="-3" y="-2.4" width="6" height="4.8" rx=".6" fill="${c}" filter="url(#sm-glow)"/>`
          : `<path class="sm-fly" d="M0 -4 L3.2 2.6 L0 1.4 L-3.2 2.6 Z" fill="${c}" filter="url(#sm-glow)"/>`}
      </g>`);
    }
    parts.push(`<g class="sm-objects">${objs.join('')}</g>`);

    // ── Réticule de sélection (positionné au rendu) ──
    parts.push(`<g class="sm-reticle" pointer-events="none" style="display:none"><circle r="9" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7" stroke-dasharray="4.7 9.4" class="sm-ret-a"/><circle r="12.5" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".5" stroke-dasharray="2 17.6" class="sm-ret-b"/></g>`);
    // Vignette
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#sm-vig)" pointer-events="none"/>`);
    return `<svg class="sm-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  }

  function panelMarkup(state) {
    const sysN = Object.values(state.systems).filter(s => s.known).length;
    const sigN = Object.values(G.signatures || {}).filter(s => !s.resolved && !s.ignored).length;
    const flyN = state.flights.length;
    if (!_sel) {
      const bits = [`${sysN} système${sysN > 1 ? 's' : ''}`];
      if (sigN) bits.push(`${sigN} signature${sigN > 1 ? 's' : ''}`);
      if (flyN) bits.push(`${flyN} en vol`);
      return `<div class="sm-panel"><div class="sm-ptitle">${bits.join(' · ')}</div><div class="sm-psub">Touche un objet, ou le noir pour balayer.</div></div>`;
    }
    const s = _sel;
    if (s.kind === 'far') {
      return `<div class="sm-panel"><div class="sm-ptitle">Trop loin pour les capteurs actuels</div><div class="sm-psub">Secteur ${esc(s.sector)}</div></div>`;
    }
    if (s.kind === 'dark') {
      const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus('radar') : { ok: false, build: true, why: 'Aucune Radar prête' };
      let act;
      if (st.ok) act = _sigBtn(COL.radar, 'Balayer', `SBMap.sweep('${esc(s.sysKey)}')`, `Radar · ${esc(s.sysKey)} · ${PROBE_TIER_CONFIG.radar.duration}`);
      else if (st.build) act = _sigBtn(COL.radar, 'Construire une Radar', `openProbeDetail('radar')`, `${PROBE_TIER_CONFIG.radar.cost.metal} Métal · puis reviens balayer`, true);
      else act = _sigOff(st.why);
      return `<div class="sm-panel"><div class="sm-ptitle">Secteur ${esc(s.sector)} · zone inexplorée</div><div class="sm-psub">Rien de connu ici.</div>${act}</div>`;
    }
    if (s.kind === 'home') {
      const name = (G.profile && G.profile.planetName) || 'Ma planète';
      const insp = window.SBSystem ? _sigBtn(COL.cyan, 'Inspecter le système', `SBSystem.open('${esc(mySystemKey())}')`, '', true) : '';
      return `<div class="sm-panel"><div class="sm-ptitle">${esc(name)}</div><div class="sm-psub mono">${esc(mySystemKey())}</div>${insp}</div>`;
    }
    if (s.kind === 'system') {
      const sys = state.systems[s.key];
      const n = sys ? sys.sigs.filter(x => !x.resolved).length : 0, pn = sys ? sys.planets.length : 0, tn = sys ? sys.targets.length : 0;
      const bits = [];
      if (n) bits.push(`${n} signature${n > 1 ? 's' : ''}`);
      if (tn) bits.push(`${tn} cible${tn > 1 ? 's' : ''}`);
      if (pn) bits.push(`${pn} planète${pn > 1 ? 's' : ''}`);
      if (sys && sys.scanning && !sys.known) bits.push('balayage en cours');
      const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus('radar') : { ok: false };
      let act = '';
      if (sys && sys.known) {
        if (st.ok) act = _sigBtn(COL.radar, 'Balayer à nouveau', `SBMap.sweep('${esc(s.key)}')`, `Radar · ${PROBE_TIER_CONFIG.radar.duration}`, true);
        else if (st.build) act = _sigBtn(COL.radar, 'Construire une Radar', `openProbeDetail('radar')`, '', true);
        else act = _sigOff(st.why);
      }
      const insp = (window.SBSystem && sys && (sys.known || sys.scanning)) ? _sigBtn(COL.cyan, 'Inspecter le système', `SBSystem.open('${esc(s.key)}')`, '', true) : '';
      return `<div class="sm-panel"><div class="sm-ptitle">Système ${esc(s.key)}</div><div class="sm-psub">${bits.join(' · ') || 'Balayé, rien de relevé.'}</div>${insp}${act}</div>`;
    }
    if (s.kind === 'sig') {
      const sig = G.signatures && G.signatures[s.key];
      if (!sig) { _sel = null; return panelMarkup(state); }
      let title, sub;
      if (!sig.resolved) { title = esc(sig.typeLabel || 'Signature'); sub = `${esc(sig.id)} · ${esc(sig.intensity || '')} · ${esc(sig.interpretation || '')}`; }
      else if (sig.fixedAddress) { title = 'Planète fixée'; sub = esc(sig.fixedAddress); }
      else { title = 'Corps orbital identifié'; sub = `${esc(sig.id)} · ${esc(sig.typeLabel || '')}`; }
      return `<div class="sm-panel"><div class="sm-ptitle">${title}</div><div class="sm-psub">${sub}</div>${probeSignatureNextAction(sig)}</div>`;
    }
    if (s.kind === 'target') {
      const kt = G.knownTargets && G.knownTargets[s.key];
      if (!kt) { _sel = null; return panelMarkup(state); }
      const sig = Object.values(G.signatures || {}).find(x => x.movingCoordKey === s.key);
      let act;
      if (sig) act = probeSignatureNextAction(sig);
      else {
        if (kt.status === 'engaged') act = _sigOff('Tanker en route');
        else {
          const stat = G.fleet && G.fleet.stationed || {};
          const total = (stat.tanker?.t1 || 0) + (stat.tanker?.t2 || 0) + (stat.tanker?.t3 || 0);
          const busy = (G.tankerMissions || []).filter(x => x.status === 'in_transit' || x.status === 'returning').length;
          act = total - busy > 0 ? _sigBtn(COL.tanker, 'Envoyer un tanker', `onTankerKnownTargetClick('${esc(s.key)}')`, '') : _sigOff(total ? 'Tous les tankers sont en mission' : 'Aucun tanker', total ? '' : 'Construis un tanker au Chantier orbital');
        }
      }
      let loot = '';
      if (kt.lootEstimate) {
        const le = kt.lootEstimate;
        loot = le.resource !== undefined
          ? `~${le.min}–${le.max} ${(TILES.find(t => t.key === le.resource) || {}).label || le.resource}`
          : Object.entries(le).map(([k, v]) => `${v} ${(TILES.find(t => t.key === k) || {}).label || k}`).join(' · ');
      }
      return `<div class="sm-panel"><div class="sm-ptitle">${esc(kt.label || kt.type || 'Cible')}</div><div class="sm-psub">${loot ? 'Loot estimé : ' + esc(loot) + ' · ' : ''}<span class="mono">${esc(s.key.split('/').pop())}</span></div>${act}</div>`;
    }
    if (s.kind === 'planet') {
      const pl = (typeof findPlanetByCoord === 'function') ? findPlanetByCoord(s.key) : null;
      const act = _sigBtn(COL.cyan, 'Voir corps céleste', `openPlanetDetail('${esc(s.key)}')`, '', true);
      return `<div class="sm-panel"><div class="sm-ptitle">${esc((pl && pl.name) || 'Planète')}</div><div class="sm-psub mono">${esc(s.key)}${pl && pl.type ? ' · ' + esc(pl.type) : ''}</div>${act}</div>`;
    }
    if (s.kind === 'flight') {
      const f = state.flights.find(x => x.id === s.key);
      if (!f) { _sel = null; return panelMarkup(state); }
      const eta = formatTankerDuration(Math.max(0, (f.arrivalAt || 0) - Date.now()));
      return `<div class="sm-panel"><div class="sm-ptitle">${esc(f.label)}${f.back ? ' · retour' : ''}</div><div class="sm-psub">${f.back ? 'Rentre au port' : 'Vers ' + esc(f.target)} · arrivée dans ${esc(eta)}</div></div>`;
    }
    return '';
  }

  function render() {
    if (!_root) _root = document.getElementById('spacemap-root');
    if (!_root) return;
    const state = collect();
    _root.innerHTML = `<div class="sm-wrap">${svgMarkup(state)}</div>${panelMarkup(state)}`;
    const svg = _root.querySelector('svg');
    svg.addEventListener('click', onTap);
    placeReticle();
    startLoop();
  }

  function placeReticle() {
    const ret = _root && _root.querySelector('.sm-reticle');
    if (!ret) return;
    if (!_sel || !['home', 'system', 'sig', 'target', 'planet'].includes(_sel.kind)) { ret.style.display = 'none'; return; }
    const el = _root.querySelector(`.sm-obj[data-kind="${_sel.kind}"][data-key="${CSS.escape(_sel.key)}"] circle`);
    if (!el) { ret.style.display = 'none'; return; }
    ret.style.display = '';
    ret.setAttribute('transform', `translate(${el.getAttribute('cx')} ${el.getAttribute('cy')})`);
  }

  /* ─── Interaction ─── */
  function onTap(e) {
    const svg = e.currentTarget;
    const obj = e.target.closest('.sm-obj');
    if (obj) {
      _sel = { kind: obj.dataset.kind, key: obj.dataset.key };
      return render();
    }
    // Point SVG
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const dx = p.x - CX, dy = p.y - CY, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    let band = BANDS.findIndex(([a, b]) => r >= a && r < b);
    if (band < 0) { _sel = null; return render(); }
    const lit = litBands();
    const sector = sectorForBand(band, ang);
    if (band >= lit) { _sel = { kind: 'far', sector }; return render(); }
    // Zone inexplorée : système inconnu tiré au sort, déterministe par zone (12 tranches × bande)
    const slice = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12) % 12;
    const sysKey = pickUnknownSystem(sector, slice);
    _sel = { kind: 'dark', sector, sysKey, slice };
    render();
  }

  function sectorForBand(band, ang) {
    const me = mySector().charCodeAt(0);
    if (band === 0) return mySector();
    // Moitié gauche → secteurs précédents, moitié droite → suivants (borné A..Z)
    const dir = Math.cos(ang) >= 0 ? 1 : -1;
    let code = me + dir * band;
    if (code < 65) code = me + band; if (code > 90) code = me - band;
    return String.fromCharCode(Math.max(65, Math.min(90, code)));
  }

  function pickUnknownSystem(sector, slice) {
    const cl = myCluster();
    const known = new Set(Object.keys(G.knownSystems || {}));
    for (const sig of Object.values(G.signatures || {})) known.add(sig.system);
    for (const m of (G.probeMissions || [])) if (m.status === 'in_transit' && /^[A-Z]-[A-Z]-\d{4}/.test(m.targetCoords || '')) known.add(String(m.targetCoords).split('-').slice(0, 3).join('-'));
    const inSector = [...known].filter(k => k.split('-')[1] === sector).length;
    for (let tries = 0; tries < 40; tries++) {
      const rng = _mulberry32(_hashSeed(`SM:pick:${cl}-${sector}:${slice}:${inSector}:${tries}`));
      const n = 1000 + Math.floor(rng() * 9000);
      const key = `${cl}-${sector}-${n}`;
      if (!known.has(key) && key !== mySystemKey()) return key;
    }
    return `${cl}-${sector}-${1000 + Math.floor(Math.random() * 9000)}`;
  }

  function sweep(sysKey) {
    const m = launchProbe('radar', sysKey, 'local', false);
    if (!m) return;
    if (typeof saveGame === 'function') saveGame();
    _sel = { kind: 'system', key: sysKey };
    render();
    if (typeof renderProbesPane === 'function' && document.getElementById('probes-cards-list')) { try { renderProbesPane(); } catch (e) {} }
  }

  /* ─── Animation des marqueurs en vol ─── */
  function tick() {
    _raf = null;
    if (!_root || !_root.isConnected || _root.offsetParent === null) return;
    const now = Date.now();
    const els = _root.querySelectorAll('.sm-flight');
    els.forEach(el => {
      const d = el.dataset;
      const t0 = +d.t0, t1 = +d.t1;
      let k = t1 > t0 ? (now - t0) / (t1 - t0) : 1;
      k = Math.max(0, Math.min(1, k));
      const x = +d.x1 + (+d.x2 - +d.x1) * k, y = +d.y1 + (+d.y2 - +d.y1) * k;
      const a = Math.atan2(+d.y2 - +d.y1, +d.x2 - +d.x1) * 180 / Math.PI + 90;
      el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a.toFixed(1)})`);
      // Traînée : du départ (atténuée) jusqu'au marqueur, longueur bornée
      const tr = _root.querySelector(`.sm-trail[data-for="${CSS.escape(el.dataset.key)}"]`);
      if (tr) {
        const L = Math.hypot(x - +d.x1, y - +d.y1), max = 26;
        const f = L > max ? (L - max) / L : 0;
        tr.setAttribute('x1', (+d.x1 + (x - +d.x1) * f).toFixed(2)); tr.setAttribute('y1', (+d.y1 + (y - +d.y1) * f).toFixed(2));
        tr.setAttribute('x2', x.toFixed(2)); tr.setAttribute('y2', y.toFixed(2));
      }
    });
    if (els.length) _raf = requestAnimationFrame(() => setTimeout(tick, 250));
  }
  function startLoop() { if (_raf) cancelAnimationFrame(_raf); tick(); }

  /* ─── Styles ─── */
  function injectCss() {
    if (document.getElementById('sm-style')) return;
    const st = document.createElement('style');
    st.id = 'sm-style';
    st.textContent = `
      #spacemap-root{padding:4px 12px 0}
      .sm-wrap{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:radial-gradient(circle at 50% 44%,#0a1517 0%,#050c0c 58%,#020505 100%);box-shadow:inset 0 0 50px rgba(0,0,0,.5)}
      .sm-svg{display:block;width:100%;height:auto;touch-action:manipulation}
      .sm-drift{animation:smDrift 90s ease-in-out infinite alternate;transform-origin:50% 50%}
      .sm-drift.slow{animation-duration:160s}
      .sm-drift.fast{animation-duration:60s}
      @keyframes smDrift{0%{transform:translate(-3px,2px) rotate(-.4deg)}100%{transform:translate(3px,-2px) rotate(.4deg)}}
      .sm-twinkle{animation:smTwinkle 3.6s ease-in-out infinite}
      @keyframes smTwinkle{0%,100%{opacity:.25}50%{opacity:.75}}
      .sm-band.lit{cursor:pointer}
      .sm-band.far{cursor:pointer}
      .sm-range-ring{fill:none;stroke:${COL.cyan};stroke-opacity:.3;stroke-width:.6}
      .sm-band-sep{fill:none;stroke:${COL.cyan};stroke-opacity:.07;stroke-width:.5;stroke-dasharray:1 4}
      .sm-sweep-rot{animation:smSweep 6s linear infinite}
      @keyframes smSweep{to{transform:rotate(360deg)}}
      .sm-route{stroke-width:.55;stroke-opacity:.22;stroke-dasharray:1.5 2.5}
      .sm-trail{stroke-width:1.1;stroke-opacity:.55;stroke-linecap:round}
      .sm-obj{cursor:pointer}
      .sm-lab{font-family:'Space Grotesk',system-ui,sans-serif;font-size:7.5px;letter-spacing:.14em;text-anchor:middle;text-transform:uppercase;pointer-events:none}
      .sm-lab.tiny{font-family:var(--font-mono);font-size:5.6px;letter-spacing:.06em;text-transform:none;opacity:.8}
      .sm-breathe{animation:smBreathe 4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
      @keyframes smBreathe{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.25);opacity:.2}}
      .sm-pulse{animation:smPulse 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
      @keyframes smPulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}
      .sm-ring{animation:smRing 2.4s ease-out infinite;transform-box:fill-box;transform-origin:center}
      @keyframes smRing{0%{opacity:.5;transform:scale(.5)}100%{opacity:0;transform:scale(1.9)}}
      .sm-scan{animation:smScan 2.2s ease-out infinite;transform-box:fill-box;transform-origin:center}
      .sm-scan.d2{animation-delay:1.1s}
      @keyframes smScan{0%{opacity:.7;transform:scale(.3)}100%{opacity:0;transform:scale(2.4)}}
      .sm-plume{opacity:.9}
      .sm-ret-a{animation:smRet 9s linear infinite;transform-box:fill-box;transform-origin:center}
      .sm-ret-b{animation:smRet 14s linear infinite reverse;transform-box:fill-box;transform-origin:center}
      @keyframes smRet{to{transform:rotate(360deg)}}
      .sm-panel{margin:8px 0 6px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg-1);min-height:56px}
      .sm-ptitle{font-size:12px;color:var(--txt);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
      .sm-psub{font-size:10px;color:var(--mut);margin-top:3px;letter-spacing:.04em;line-height:1.5}
      .sm-psub.mono,.sm-psub .mono{font-family:var(--font-mono)}
      .sm-panel .sig-next{margin-top:8px}
      @media (prefers-reduced-motion: reduce){.sm-drift,.sm-twinkle,.sm-sweep-rot,.sm-ret-a,.sm-ret-b{animation:none}}
    `;
    document.head.appendChild(st);
  }

  injectCss();
  function panelFor(sel) { const keep = _sel; _sel = sel; let h = ''; try { h = panelMarkup(collect()); } finally { _sel = keep; } return h; }
  window.SBMap = { render, sweep, panelFor, select(kind, key) { _sel = { kind, key }; render(); }, clear() { _sel = null; } };
})();
