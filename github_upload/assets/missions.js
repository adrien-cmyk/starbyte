/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Missions (15/10/2026, demande d'Adrien)
   Tout ce qui vole, au même endroit, et une fiche de mission bien faite pour les tankers :
   · SBMissions.list()            → sondes en vol, tankers en mission, flottes engagées
   · SBMissions.sheetHtml()       → la feuille « Missions » du Centre de prospection
   · SBMissions.open(missionId)   → la fiche d'un tanker en mission (vaisseau en 3D, trajet, cale, temps restant,
                                     coordonnées et rapport cliquables, actions selon l'état)
   Règle (Adrien, 15/10) : un tanker parti va au bout ; une flotte engagée l'est pour de bon. Pas de demi-tour en vol.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SBMissions) return;

  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SYS = /^[A-Z]-[A-Z]-\d{4}/;
  const sysOf = (c) => { const m = String(c || '').match(/^[A-Z]-[A-Z]-\d{4}/); return m ? m[0] : null; };
  const dur = (ms) => (typeof formatTankerDuration === 'function') ? formatTankerDuration(Math.max(0, ms)) : Math.ceil(Math.max(0, ms) / 60000) + ' min';
  const ACTIVE = ['in_transit', 'exploring', 'docked', 'returning', 'posted', 'orbital_relay'];
  const tierOf = (m) => m.tier || m.tankerTier || 1;
  const home = () => { try { return `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`; } catch (e) { return null; } };

  /* ── où va un tanker, d'où il part, où il en est ── */
  function destOf(m) {
    const coords = m.portSys || sysOf(m.targetCoords) || null;
    let label = (m.dock && m.dock.name) || m.targetLabel || null;
    if (!label && m.mpTarget && m.mpTarget.pseudo) label = 'Ambassade · ' + m.mpTarget.pseudo;
    if (!label && m.kind === 'exploration') label = 'Piste à explorer';
    return { coords, full: m.targetCoords || coords, label: label || coords || 'destination inconnue' };
  }
  function phaseOf(m, now) {
    now = now || Date.now();
    const s = m.status;
    if (s === 'in_transit' || s === 'exploring') {
      const t0 = m.departedAt || now, t1 = m.arrivalAt || now;
      return { key: 'out', label: s === 'exploring' ? 'En exploration' : 'En route', t0, t1, left: t1 - now, color: '#ffc864' };
    }
    if (s === 'returning') {
      const t1 = m.returnArrivalAt || m.returnAt || now;
      const t0 = m.returnDepartedAt || m.cancelledAt || m.dockLeftAt || Math.min(t1 - 60000, m.arrivalAt || t1);
      return { key: 'back', label: 'Au retour', t0, t1, left: t1 - now, color: '#9fe08a' };
    }
    if (s === 'docked') {
      const st = m.dockStay;
      return st ? { key: 'dock', label: 'Au dock', t0: st.startedAt, t1: st.endsAt, left: st.endsAt - now, color: '#f0b54a', stay: true }
        : { key: 'dock', label: 'Au dock · séjour à choisir', color: '#f0b54a' };
    }
    if (s === 'posted') return { key: 'post', label: 'En station', color: '#ffc864' };
    if (s === 'orbital_relay') return { key: 'orbit', label: 'En orbite (ambassade)', color: '#8fc4ff' };
    return { key: s, label: s || '—', color: '#9fb3bf' };
  }
  const KIND = { route_run: 'Route commerciale', route_post: 'Poste de route', exploration: 'Exploration', dropoff: 'Transport', rapatriation: 'Rapatriement' };
  const kindLabel = (m) => KIND[m.kind] || (m.mpTarget ? 'Ambassade' : m.targetType === 'vein' || m.targetType === 'veine' ? 'Exploitation' : 'Mission tanker');
  function cargoOf(m) {
    const c = m.cargo || {};
    const parts = [];
    for (const k of ['metal', 'energie', 'cristal']) if ((c[k] || 0) > 0) parts.push(`${(typeof fmt === 'function') ? fmt(c[k]) : c[k]} ${k === 'energie' ? 'énergie' : k === 'metal' ? 'métal' : 'cristal'}`);
    const total = ['metal', 'energie', 'cristal'].reduce((s, k) => s + (c[k] || 0), 0);
    const cap = (typeof TANKER_TIER_CONFIG !== 'undefined' && TANKER_TIER_CONFIG[tierOf(m)]) ? TANKER_TIER_CONFIG[tierOf(m)].cargoCapacity : 0;
    const soldiers = m.soldiers ? Object.entries(m.soldiers).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k === 'lourd' ? 'soldat' + (n > 1 ? 's' : '') + ' lourd' + (n > 1 ? 's' : '') : 'garde' + (n > 1 ? 's' : '')}`) : [];
    return { line: parts.concat(soldiers).join(' · ') || 'cale vide', total, cap };
  }

  /* ── tout ce qui vole ── */
  function list() {
    if (typeof G === 'undefined' || !G) return { probes: [], tankers: [], fleets: [] };
    const probes = (G.probeMissions || []).filter(m => m.status === 'in_transit');
    const tankers = (G.tankerMissions || []).filter(m => ACTIVE.includes(m.status));
    const fleets = ((G.fleet && G.fleet.prepared) || []).filter(f => (f.status || 'prepared') === 'in_mission');
    return { probes, tankers, fleets };
  }
  function count() { const l = list(); return l.probes.length + l.tankers.length + l.fleets.length; }

  /* ── la feuille « Missions » ── */
  function row(o) {
    const pct = o.t1 && o.t0 && o.t1 > o.t0 ? Math.max(0, Math.min(1, (Date.now() - o.t0) / (o.t1 - o.t0))) : null;
    return `<button class="sbm-row" onclick="${o.onclick}">
      <span class="k" style="color:${o.color}">${esc(o.kind)}</span>
      <span class="n">${esc(o.name)}</span>
      <span class="d">${o.dest}</span>
      <span class="t" style="color:${o.color}">${esc(o.state)}</span>
      ${pct != null ? `<i class="p"><b style="width:${Math.round(pct * 100)}%;background:${o.color}"></b></i>` : ''}
    </button>`;
  }
  function sheetHtml() {
    const l = list(), now = Date.now();
    const H = (t, n) => `<div class="sbm-h">${t}${n ? ' · ' + n : ''}</div>`;
    let html = '';
    // tankers d'abord : ce sont eux qu'on suit le plus
    html += H('Tankers', l.tankers.length);
    if (!l.tankers.length) html += `<div class="sbm-empty">Aucun tanker en mission. Envoie-en un depuis une route (carte ou Commerce).</div>`;
    for (const m of l.tankers.slice().sort((a, b) => (phaseOf(a, now).left || 9e15) - (phaseOf(b, now).left || 9e15))) {
      const ph = phaseOf(m, now), d = destOf(m);
      html += row({ kind: `Tanker T${tierOf(m)}`, name: m.tankerName || 'Tanker', color: ph.color,
        dest: `${ph.key === 'back' ? '← ' : '→ '}${esc(d.label)}${d.coords && d.coords !== d.label ? ` <span class="mono">${esc(d.coords)}</span>` : ''}`,
        state: ph.left != null && ph.left > 0 ? `${ph.label} · ${dur(ph.left)}` : ph.label, t0: ph.t0, t1: ph.t1, onclick: `SBMissions.open('${esc(m.id)}')` });
    }
    html += H('Flottes', l.fleets.length);
    if (!l.fleets.length) html += `<div class="sbm-empty">Aucune flotte engagée.</div>`;
    for (const f of l.fleets) {
      const a = f.ambush;
      let state = 'En mission', dest = '', t0 = null, t1 = null, color = '#ff9a8a';
      if (a) {
        color = '#c9a8ff';
        dest = `${a.phase === 'returning' ? '← ' : '→ '}embuscade <span class="mono">${esc(a.system)}</span>`;
        if (a.phase === 'going') { state = 'En route · ' + dur(a.arrivesAt - now); t0 = a.departedAt; t1 = a.arrivesAt; }
        else if (a.phase === 'returning') { state = 'Au retour · ' + dur(a.returnsAt - now); t0 = a.returnDepartedAt || (a.returnsAt - a.travelMs); t1 = a.returnsAt; }
        else state = window.SBLines && SBLines.ordersLabel ? 'En place · ' + SBLines.ordersLabel(f).replace('Ordres : ', '') : 'En place';
      } else if (f.missionEndsAt) { state = 'Raid · retour ' + dur(f.missionEndsAt - now); t0 = f.missionStartedAt; t1 = f.missionEndsAt; dest = '→ raid'; }
      html += row({ kind: 'Flotte', name: f.name || 'Flotte', color, dest, state, t0, t1, onclick: `SBMissions.close();openFleetDetail('${esc(f.id)}')` });
    }
    html += H('Sondes en vol', l.probes.length);
    if (!l.probes.length) html += `<div class="sbm-empty">Aucune sonde en vol.</div>`;
    for (const m of l.probes.slice().sort((a, b) => a.arrivalAt - b.arrivalAt)) {
      const cfg = (typeof PROBE_TIER_CONFIG !== 'undefined' && PROBE_TIER_CONFIG[m.tier]) || { label: m.tier, accent: '#9fb3bf' };
      html += row({ kind: m.mode === 'scout' ? 'Moyenne · éclaireur' : (cfg.label || m.tier), name: m.probeName || 'Sonde', color: cfg.accent || '#9fb3bf',
        dest: `→ <span class="mono">${esc(m.scoutLabel || m.targetCoords || '?')}</span>`, state: 'Arrivée · ' + dur(m.arrivalAt - now), t0: m.departedAt, t1: m.arrivalAt,
        onclick: `SBMissions.showProbe('${esc(m.id)}')` });
    }
    return css() + `<div class="sbm">${html}</div>`;
  }
  function showProbe(id) {
    if (window.SBMap && SBMap.showFlight) { try { SBMap.showFlight(id); return; } catch (e) {} }
    const m = (G.probeMissions || []).find(x => x.id === id);
    if (m && typeof openSystemOnMap === 'function') openSystemOnMap(m.targetCoords);
  }

  // la feuille Missions de la carte se referme quand on part vers un autre écran
  function closeSheets() { try { if (typeof G !== 'undefined') G.prospectTab = 'univers'; const sh = document.querySelector('.smw-sheet.on .smw-sh-x'); if (sh) sh.click(); } catch (e) {} }
  /* ── 15/10 (Adrien) — vues 3D « comme la flotte » : la 3D plein écran, la fiche défile par-dessus ;
     la zone libre en haut garde les gestes (tourner, pincer), lissés par le moteur 3D ── */
  function heroGestures(space, getH, onTap) {
    const pts = new Map(); let mode = null, last = null, pinch0 = 0;
    const dist = () => { const v = [...pts.values()]; return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); };
    space.addEventListener('pointerdown', (e) => {
      const h = getH(); if (!h) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { space.setPointerCapture(e.pointerId); } catch (_) {}
      if (pts.size === 2) { mode = 'pinch'; pinch0 = dist(); }
      else { mode = 'orbit'; last = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }; }
      if (h.begin) h.begin();
    });
    space.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const h = getH(); if (!h) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && pts.size === 2) { const d = dist(); if (d > 10 && pinch0 > 10 && h.dolly) h.dolly(pinch0 / d); pinch0 = d; return; }
      if (mode === 'orbit' && h.orbit) { h.orbit(e.clientX - last.x, e.clientY - last.y); last.x = e.clientX; last.y = e.clientY; }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      if (onTap && mode === 'orbit' && last && e.type === 'pointerup' && Math.hypot(e.clientX - last.x0, e.clientY - last.y0) < 8 && performance.now() - last.t0 < 350) onTap(e);
      pts.delete(e.pointerId);
      if (!pts.size) { mode = null; const h = getH(); if (h && h.end) h.end(); } else if (mode === 'pinch') mode = null;
    };
    space.addEventListener('pointerup', up); space.addEventListener('pointercancel', up);
    space.addEventListener('wheel', (e) => { const h = getH(); if (!h || !h.dolly) return; e.preventDefault(); if (h.begin) h.begin(); h.dolly(1 + e.deltaY * 0.0012); if (h.end) h.end(); }, { passive: false });
  }
  // plus la fiche remonte, plus la scène s'assombrit ; les puces du haut s'effacent
  function heroFade(scroll, space, root) {
    const f = () => { const h = space.offsetHeight || 1; const v = Math.max(0, Math.min(1, (scroll.scrollTop - h * 0.12) / (h * 0.45))); root.style.setProperty('--hs', v.toFixed(3)); };
    scroll.addEventListener('scroll', f, { passive: true }); f();
  }
  function heroScrollTo(sc, top) {
    const from = sc.scrollTop, d = top - from, t0 = performance.now();
    if (Math.abs(d) < 2) return;
    const step = (now) => { const k = Math.min(1, (now - t0) / 380), e = 1 - Math.pow(1 - k, 3); sc.scrollTop = from + d * e; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  window.SBHero = { gestures: heroGestures, fade: heroFade, scrollTo: heroScrollTo };

  /* ── la fiche de mission d'un tanker ── */
  let _open = null;   // { id, el, ship, timer }
  function open(id, force) {
    const m = (G.tankerMissions || []).find(x => x.id === id);
    if (!m) { if (typeof toast === 'function') toast('Cette mission est terminée : son rapport est dans les rapports'); return; }
    // 15/10 (Adrien) — pas de doublon : un tanker en ambassade ouvre l'ambassade (canal, pavillons),
    // un tanker amarré ouvre l'écran de son dock (la Couronne en 3D, son tanker sous le bras d'amarrage)
    if (!force && m.status === 'orbital_relay' && m.mpTarget && m.mpTarget.address && typeof openEmbassy === 'function') { close(); closeSheets(); openEmbassy(m.mpTarget.address); return; }
    if (!force && m.status === 'docked' && m.dock && typeof openDockFromFleet === 'function') { close(); closeSheets(); openDockFromFleet(m.id); return; }
    close();
    css();
    const el = document.createElement('div');
    el.id = 'sbm-view';
    el.innerHTML = `<div class="sbm-hero"><div class="sbm-3d"></div><div class="sbm-top"><div class="sbm-kind"></div><div class="sbm-name"></div><div class="sbm-state"></div></div><div class="sbm-scrim"></div></div>
      <div class="sbm-scroll"><div class="sbm-space"></div><div class="sbm-body"></div></div><button class="sbm-x" aria-label="Fermer">✕</button>`;
    document.body.appendChild(el);
    el.querySelector('.sbm-x').onclick = () => close();
    _open = { id, el, ship: null, timer: null };
    const _sc = el.querySelector('.sbm-scroll'), _sp = el.querySelector('.sbm-space');
    heroGestures(_sp, () => _open && _open.el === el ? _open.ship : null, () => { if (_sc.scrollTop > 30) heroScrollTo(_sc, 0); });
    heroFade(_sc, _sp, el);
    // le vaisseau, comme sur sa fiche d'unité
    const model = (typeof UNIT_SHIP3D_MODELS !== 'undefined') ? UNIT_SHIP3D_MODELS.tanker : null;
    const hero = el.querySelector('.sbm-3d');
    const start = () => {
      if (!_open || _open.el !== el || !model) return;
      try { _open.ship = window.Ship3D.mount(hero, { url: model.url, shiftY: 0.15, ship: model.profile && window.Ship3D.profiles ? window.Ship3D.profiles[model.profile] : undefined,
        onReady: () => hero.classList.add('on'), onError: () => hero.classList.add('fail') }); } catch (e) {}
    };
    if (window.WebGLRenderingContext && model) { if (window.Ship3D) start(); else window.addEventListener('ship3d-ready', start, { once: true }); }
    render();
    _open.timer = setInterval(render, 1000);
  }
  function close() {
    if (!_open) return;
    clearInterval(_open.timer);
    try { if (_open.ship) _open.ship.dispose(); } catch (e) {}
    _open.el.remove();
    _open = null;
  }
  function render() {
    if (!_open) return;
    const m = (G.tankerMissions || []).find(x => x.id === _open.id);
    const el = _open.el;
    if (!m || !ACTIVE.includes(m.status)) {
      el.querySelector('.sbm-state').textContent = 'Mission terminée';
      el.querySelector('.sbm-body').innerHTML = `<div class="sbm-card"><p>${esc((m && m.tankerName) || 'Le tanker')} est rentré : son rapport t'attend.</p></div>`
        + `<button class="sbm-btn" style="--c:#e6f0ff" onclick="SBMissions.close();if(typeof openProspectAtTab==='function')openProspectAtTab('rapports')">Ouvrir les rapports →</button>`;
      clearInterval(_open.timer);
      return;
    }
    const now = Date.now(), ph = phaseOf(m, now), d = destOf(m), cg = cargoOf(m);
    el.querySelector('.sbm-kind').textContent = `${kindLabel(m)} · Tanker T${tierOf(m)}`;
    el.querySelector('.sbm-name').textContent = m.tankerName || 'Tanker';
    const st = el.querySelector('.sbm-state');
    st.textContent = ph.left != null && ph.left > 0 ? `${ph.label} · ${ph.key === 'dock' ? 'départ dans' : 'arrivée dans'} ${dur(ph.left)}` : ph.label;
    st.style.color = ph.color;
    const pct = ph.t1 && ph.t0 && ph.t1 > ph.t0 ? Math.max(0, Math.min(1, (now - ph.t0) / (ph.t1 - ph.t0))) : null;
    const from = home();
    const coordBtn = (k, label) => k ? `<button class="sbm-co" onclick="SBMissions.close();openSystemOnMap('${esc(k)}')"><b class="mono">${esc(k)}</b>${label ? `<span>${esc(label)}</span>` : ''}<i>carte →</i></button>` : '';
    // la route empruntée
    const route = m.routeId ? (G.routes || []).find(r => r.id === m.routeId) : null;
    const opened = m.ownRouteId && window.SBLines ? SBLines.openedRoutes().find(o => o.id === m.ownRouteId) : null;
    const routeName = (route && route.name) || (opened && opened.name) || m.routeName || null;
    let bal = null;
    if (route && route.portSys && window.SBLines) bal = SBLines.balisage(route.portSys);
    else if (opened && window.SBLines) bal = SBLines.balisageChain(opened.chain.slice(1, -1));
    const routeId = (route && route.portSys) ? route.id : opened ? opened.id : null;
    const viaN = Array.isArray(m.via) ? m.via.length : 0;
    // le rapport à l'origine de la mission (sonde)
    const src = m.reportId ? (G.probeReports || []).find(r => r.id === m.reportId) : null;
    const back = ph.key === 'back';
    let body = `
      ${pct != null ? `<div class="sbm-prog"><b style="width:${(pct * 100).toFixed(1)}%;background:${ph.color}"></b></div><div class="sbm-prog-l"><span>${back ? esc(d.label) : 'Départ'}</span><span>${Math.round(pct * 100)} %</span><span>${back ? 'Retour au port' : esc(d.label)}</span></div>` : ''}
      <div class="sbm-sec">Trajet</div>
      <div class="sbm-card">
        <div class="sbm-leg"><em>${back ? 'De' : 'Départ'}</em>${back ? coordBtn(d.coords, d.label) : coordBtn(from, 'ta planète')}</div>
        ${routeName ? `<div class="sbm-leg"><em>Par</em>${routeId ? `<button class="sbm-co" onclick="SBMissions.close();openSystemOnMap('${esc(d.coords || from)}');setTimeout(()=>window.SBMap&&SBMap.selectRoute('${esc(routeId)}'),700)"><b style="color:#ffc864">${esc(routeName)}</b><span>${viaN ? viaN + ' système' + (viaN > 1 ? 's' : '') + ' de passage · ' : ''}${bal ? (bal.ratio ? 'balisée ' + Math.round(bal.ratio * 100) + ' %' : 'non balisée') : ''}</span><i>route →</i></button>` : `<span class="sbm-tx">${esc(routeName)}</span>`}</div>` : `<div class="sbm-leg"><em>Par</em><span class="sbm-tx">voie directe${m.routeType === 'beacon' ? ' · voie balisée' : ''}</span></div>`}
        <div class="sbm-leg"><em>${back ? 'Vers' : 'Destination'}</em>${back ? coordBtn(from, 'ta planète') : (coordBtn(d.coords, d.label) || `<span class="sbm-tx">${esc(d.label)}</span>`)}</div>
        ${d.full && d.full !== d.coords && SYS.test(d.full) ? `<div class="sbm-leg"><em>Cible</em><span class="sbm-tx mono">${esc(d.full)}</span></div>` : ''}
      </div>
      <div class="sbm-sec">Cale</div>
      <div class="sbm-card"><div class="sbm-cargo"><span>${esc(cg.line)}</span>${cg.cap ? `<span class="mut">${(typeof fmt === 'function') ? fmt(cg.total) : cg.total} / ${(typeof fmt === 'function') ? fmt(cg.cap) : cg.cap}</span>` : ''}</div>
        ${cg.cap ? `<div class="sbm-prog sm"><b style="width:${Math.min(100, Math.round(100 * cg.total / cg.cap))}%;background:#ffc864"></b></div>` : ''}</div>
      <div class="sbm-sec">Mission</div>
      <div class="sbm-card">
        <div class="sbm-kv"><span>Type</span><b>${esc(kindLabel(m))}</b></div>
        <div class="sbm-kv"><span>Parti</span><b>${m.departedAt ? new Date(m.departedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</b></div>
        ${ph.key === 'out' && m.arrivalAt ? `<div class="sbm-kv"><span>Arrivée</span><b>${new Date(m.arrivalAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b></div>` : ''}
        ${ph.key === 'back' && ph.t1 ? `<div class="sbm-kv"><span>Retour</span><b>${new Date(ph.t1).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b></div>` : ''}
        ${m.dockStay ? `<div class="sbm-kv"><span>Séjour</span><b>${esc(m.dockStay.label || '')}</b></div>` : ''}
        ${bal && bal.ratio ? `<div class="sbm-kv"><span>Balisage</span><b>trajet −${Math.round(35 * bal.ratio)} % · risque −${Math.round(60 * bal.ratio)} %</b></div>` : ''}
        ${src ? `<div class="sbm-kv"><span>Rapport d'origine</span><button class="sbm-link" onclick="SBMissions.close();openProspectAtTab&&openProspectAtTab('rapports');setTimeout(()=>openSourceProbeReport('${esc(src.id)}'),400)">ouvrir →</button></div>` : ''}
      </div>
      <div class="sbm-note">${ph.key === 'out' ? 'Un tanker parti va au bout : il ne fait pas demi-tour en vol.' : ph.key === 'back' ? 'Il rentre au port : sa cale sera déchargée à l\'arrivée.' : ''}</div>`;
    // actions selon l'état
    const acts = [];
    if (m.status === 'docked') {
      acts.push(`<button class="sbm-btn" style="--c:#f0b54a" onclick="SBMissions.close();openDockFromFleet('${esc(m.id)}')">${m.dock && m.dock.station ? '⚓ Entrer · ' + esc(m.dock.name) : '⚓ Entrer au dock'}<small>séjour, commandants à quai, marchés, bar</small></button>`);
      acts.push(`<button class="sbm-btn" style="--c:#ffc864" onclick="SBMissions.recallDocked('${esc(m.id)}')">⌂ Rappeler le tanker<small>il quitte le dock et rentre au port</small></button>`);
    } else if (m.status === 'posted' || (m.kind === 'route_post' && m.status === 'in_transit')) {
      if (m.status === 'posted') acts.push(`<button class="sbm-btn" style="--c:#ffc864" onclick="SBMissions.close();openSystemOnMap('${esc(d.coords)}')">Voir le poste<small>les commandants qui y tiennent un poste peuvent te parler</small></button>`);
      acts.push(`<button class="sbm-btn" style="--c:#ffc864" onclick="SBMissions.close();typeof recallRoutePost==='function'&&recallRoutePost('${esc(m.id)}')">⌂ Lever le poste<small>le tanker rentre au port</small></button>`);
    }
    if (d.coords) acts.push(`<button class="sbm-btn" style="--c:#5fffe8" onclick="SBMissions.close();openSystemOnMap('${esc(ph.key === 'back' ? from : d.coords)}')">Voir sur la carte<small>le tanker suit son tracé</small></button>`);
    el.querySelector('.sbm-body').innerHTML = body + acts.join('');
  }
  // rappel depuis le dock : le même chemin que l'écran du dock (confirmation, rapport, retour)
  async function recallDocked(id) {
    if (typeof onRecallTankerFromDock !== 'function') return;
    close();
    _activeDockMissionId = id;   // global de l'écran du dock
    await onRecallTankerFromDock();
  }

  // Commerce : les tankers en mission (hors amarrés, qui ont déjà leur bannière), un toucher → leur fiche
  function commerceStrip() {
    const now = Date.now();
    const ts = list().tankers.filter(m => m.status !== 'docked');
    if (!ts.length) return '';
    css();
    return `<div style="padding:12px 0 2px"><div class="sbm-h">Tankers en mission · ${ts.length}</div>` + ts.map(m => {
      const ph = phaseOf(m, now), d = destOf(m);
      return row({ kind: `Tanker T${tierOf(m)} · ${kindLabel(m)}`, name: m.tankerName || 'Tanker', color: ph.color,
        dest: `${ph.key === 'back' ? '← ' : '→ '}${esc(d.label)}${d.coords && d.coords !== d.label ? ` <span class="mono">${esc(d.coords)}</span>` : ''}`,
        state: ph.left != null && ph.left > 0 ? `${ph.label} · ${dur(ph.left)}` : ph.label, t0: ph.t0, t1: ph.t1, onclick: `SBMissions.open('${esc(m.id)}')` });
    }).join('') + '</div>';
  }
  let _css = false;
  function css() {
    if (_css) return '';
    _css = true;
    const st = document.createElement('style');
    st.textContent = `
      .sbm-h{margin:14px 2px 8px;font:600 10px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9fb3bf}
      .sbm-h:first-child{margin-top:2px}
      .sbm-empty{font-size:11px;color:var(--mut);font-style:italic;padding:2px 2px 6px}
      .sbm-row{position:relative;display:grid;grid-template-columns:1fr auto;grid-template-areas:"k t" "n n" "d d";gap:2px 10px;width:100%;text-align:left;margin-bottom:8px;padding:11px 13px 13px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:rgba(255,255,255,.025);color:#e6f0ff;font-family:inherit;cursor:pointer;overflow:hidden}
      .sbm-row .k{grid-area:k;font:600 10px/1.3 'Space Grotesk',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}
      .sbm-row .t{grid-area:t;font-size:11px;text-align:right}
      .sbm-row .n{grid-area:n;font-size:14px;font-weight:600}
      .sbm-row .d{grid-area:d;font-size:11px;color:#9fb3bf}
      .sbm-row .p{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.06)}
      .sbm-row .p b{display:block;height:100%}
      #sbm-view{position:fixed;inset:0;z-index:9200;background:#05080d;color:#e6f0ff;font-family:inherit}
      #sbm-view .sbm-hero{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(255,200,100,.08),transparent 60%),#05080d;overflow:hidden}
      #sbm-view .sbm-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:rgba(3,5,9,.84);opacity:var(--hs,0)}
      #sbm-view .sbm-3d canvas{filter:saturate(calc(1 - var(--hs, 0) * .5))}
      #sbm-view .sbm-scroll{position:absolute;inset:0;z-index:2;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
      #sbm-view .sbm-space{height:calc(100% - 230px);min-height:260px;touch-action:none}
      #sbm-view .sbm-3d{position:absolute;inset:0}
      #sbm-view .sbm-top{position:absolute;left:0;right:0;top:0;padding:calc(14px + env(safe-area-inset-top,0px)) 60px 26px 16px;pointer-events:none;background:linear-gradient(180deg,rgba(5,8,13,.92),rgba(5,8,13,.55) 65%,rgba(5,8,13,0));text-shadow:0 1px 6px rgba(0,0,0,.9);z-index:1}
      #sbm-view .sbm-x{z-index:5}
      #sbm-view .sbm-kind{font:600 10px/1.3 'Space Grotesk',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9fb3bf}
      #sbm-view .sbm-name{font-size:24px;font-weight:700;letter-spacing:.04em;color:#ffc864;margin-top:2px}
      #sbm-view .sbm-state{font-size:12px;margin-top:4px;font-family:'SF Mono',monospace}
      #sbm-view .sbm-x{position:absolute;right:12px;top:calc(12px + env(safe-area-inset-top,0px));width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(5,8,13,.6);color:#e6f0ff;font-size:16px;cursor:pointer}
      #sbm-view .sbm-body{padding:4px 16px calc(28px + env(safe-area-inset-bottom,0px));min-height:calc(100% - 120px)}
      #sbm-view .sbm-body .sbm-card{background:rgba(8,12,18,.86);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
      #sbm-view .sbm-body .sbm-sec{text-shadow:0 1px 8px rgba(0,0,0,.9)}
      .sbm-prog{height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
      .sbm-prog.sm{height:3px;margin-top:8px}
      .sbm-prog b{display:block;height:100%;transition:width .9s linear}
      .sbm-prog-l{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:10px;color:#9fb3bf}
      .sbm-sec{margin:16px 2px 7px;font:600 10px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9fb3bf}
      .sbm-card{padding:4px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)}
      .sbm-card p{font-size:13px;line-height:1.55;margin:10px 0}
      .sbm-leg{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}
      .sbm-leg:last-child{border-bottom:0}
      .sbm-leg em{flex:0 0 74px;font-style:normal;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6a7a72}
      .sbm-co{flex:1;display:flex;align-items:baseline;gap:8px;min-width:0;padding:0;border:0;background:transparent;color:#e6f0ff;font:inherit;text-align:left;cursor:pointer}
      .sbm-co b{font-size:13px;color:#5fffe8;white-space:nowrap}
      .sbm-co span{flex:1;font-size:11px;color:#c8d4dc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .sbm-co i{font-style:normal;font-size:10px;color:#5fffe8}
      .sbm-tx{font-size:12px;color:#c8d4dc}
      .sbm-cargo{display:flex;justify-content:space-between;gap:10px;padding:10px 0 2px;font-size:13px}
      .sbm-cargo .mut{color:#9fb3bf;font-size:11px;white-space:nowrap}
      .sbm-card .sbm-prog.sm{margin-bottom:10px}
      .sbm-kv{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px}
      .sbm-kv:last-child{border-bottom:0}
      .sbm-kv span{color:#9fb3bf}.sbm-kv b{font-weight:500;text-align:right}
      .sbm-link{border:0;background:transparent;color:#5fffe8;font:inherit;font-size:12px;cursor:pointer;padding:0}
      .sbm-note{margin:12px 2px 4px;font-size:11px;color:#6a7a72;font-style:italic}
      .sbm-btn{display:block;width:100%;margin-top:10px;padding:13px 14px;text-align:left;border-radius:10px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 7%,transparent);color:var(--c);font:inherit;font-size:13px;letter-spacing:.06em;cursor:pointer}
      .sbm-btn small{display:block;margin-top:3px;font-size:10px;letter-spacing:.02em;color:#9fb3bf}
      .mono{font-family:'SF Mono',monospace}`;
    document.head.appendChild(st);
    return '';
  }

  window.SBMissions = { list, count, sheetHtml, commerceStrip, open, close, render, showProbe, recallDocked, phaseOf, destOf };
})();
