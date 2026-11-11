/* ═══════════════════════════════════════════════════════════════════════
   STARBYTE — CARTE PAR ZONES · TEST (10/11/2026)
   Cf. claude/starbyte_decision_sondage_zone.md (cahier « Prospection par zones », v2.0)

   Réservé au compte de test d'Adrien (Hadrien) : même règle que le panneau de
   triche (_sbDevAllowed : pseudo au registre ou empreinte de l'email), plus le
   jeu en local. Pour tout autre joueur, ce fichier ne fait rien d'autre que
   déclarer la clé de sauvegarde « zoneProspect », qui reste vide.

   Ce que fait le test :
   → un bouton « Zones · test » dans le Centre de prospection ouvre la nouvelle
     carte (atlas/index.html) en plein écran, comme le Télébyte ;
   → « Sonder cette zone » envoie une VRAIE Radar du hangar du monde choisi
     (G.probesPool), mission rangée dans G.probeMissions comme les autres ;
   → à l'arrivée, le contenu FIXE de la zone devient de vraies signatures
     (G.signatures) : la Légère, la Moyenne, les tankers et la colonisation
     existants font la suite. Une zone sondée l'est pour de bon.
   Région de test : 30 zones autour des mondes du compte, contenu fixé une fois
   pour toutes (G.zoneProspect.region), journal des actions pour les mesures.
   → « Mes mondes › Voir la partie d'un commandant » (ou ?zones=Panzerstorm) : la partie d'un autre
     joueur en LECTURE SEULE sur la même carte (fonction serveur dev_player_map, v53).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.EXTRA_SAVE_KEYS && EXTRA_SAVE_KEYS.indexOf('zoneProspect') < 0) EXTRA_SAVE_KEYS.push('zoneProspect');

  const PAGE = 'atlas/index.html';
  const PAGE_V = '5f33e09629';   // empreinte de atlas/index.html, écrite par labo/carte-zones/build.py
  const GRID = 'tac-2';
  const MIN = 60e3;
  const SB = 'https://elupnpdcblztpfywnhjl.supabase.co';
  const KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';   // clé publique (faite pour être dans le client)

  /* ── qui voit le test (10/11 soir : Adrien ne voyait pas le bouton sur son iPhone, compte Hadrien) ──
     Plusieurs preuves indépendantes, la première qui répond suffit : la règle du panneau de triche, le pseudo au
     registre, l'empreinte de l'email (relue ici, y compris un email lié pas encore confirmé),
     et la capitale du compte de test (A-O-2178, OPUS-ONE). Aucune ne contient l'adresse email en clair. */
  const DEV_NAMES = ['hadrien'];
  const DEV_SYSTEMS = ['A-O-2178'];
  let mailOk = false, mailSeen = '';
  (function mailCheck() {
    try {
      const u = window.SBCloud && SBCloud.user;
      const m = u && String(u.email || u.new_email || (u.user_metadata && u.user_metadata.email) || '').trim().toLowerCase();
      if (m && m !== mailSeen && window.crypto && crypto.subtle && typeof SB_DEV_EMAIL_SHA === 'string') {
        mailSeen = m;
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(m)).then(b => {
          mailOk = [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') === SB_DEV_EMAIL_SHA;
        }).catch(() => {});
      }
    } catch (e) {}
    if (!mailOk) setTimeout(mailCheck, 3000);
  })();
  function why() {
    if (window.SB_ZONES_OFF) return null;
    try { if (typeof _sbDevAllowed === 'function' && _sbDevAllowed()) return 'triche'; } catch (e) {}
    // le pseudo du registre seulement (unique) : un nom de capitaine se choisit librement dans la partie
    try { const n = window.SBMP && SBMP.world && SBMP.world.pseudo; if (n && DEV_NAMES.includes(String(n).trim().toLowerCase())) return 'pseudo'; } catch (e) {}
    if (mailOk) return 'email';
    try {
      const sys = (a) => a ? `${a.cluster}-${a.sector}-${String(a.system).padStart(4, '0')}` : '';
      const reg = window.SBMP && SBMP.world && SBMP.world.address;
      if (typeof MY_ADDRESS !== 'undefined' && DEV_SYSTEMS.includes(sys(MY_ADDRESS))) return 'capitale';
      if (reg && DEV_SYSTEMS.some(s => String(reg).indexOf(s + '-') === 0)) return 'capitale';
    } catch (e) {}
    return null;
  }
  const allowed = () => !!why();
  let installed = false, overlay = null;
  const listeners = new Set();

  const zp = () => (G.zoneProspect && G.zoneProspect.v === 1) ? G.zoneProspect : (G.zoneProspect = { v: 1, grid: GRID, region: null, zones: {}, journal: [] });
  const fmtAddr = (a) => a ? `${a.cluster}-${a.sector}-${String(a.system).padStart(4, '0')}-${String(a.planet == null ? 40 : a.planet).padStart(2, '0')}` : '';
  const save = () => { try { if (typeof saveGame === 'function') saveGame(); } catch (e) {} };
  const notify = () => { for (const f of listeners) { try { f(); } catch (e) {} } };
  function log(kind, data) {
    const z = zp();
    z.journal.push(Object.assign({ t: Date.now(), kind }, data || {}));
    if (z.journal.length > 400) z.journal.splice(0, z.journal.length - 400);
  }

  /* ── les mondes du compte (capitale + colonies), adresses réelles ── */
  function worlds() {
    const out = [];
    const act = G.activeWorld || 'home';
    const list = Array.isArray(G.worlds) && G.worlds.length ? G.worlds : [{ id: 'home', kind: 'home' }];
    for (const w of list) {
      if (!w) continue;
      const isHome = w.id === 'home';
      const coord = isHome ? fmtAddr(typeof MY_ADDRESS !== 'undefined' ? MY_ADDRESS : null) : (w.coord || '');
      const pl = w.id === act ? G.planet : (w.data && w.data.planet);
      const name = String((pl && pl.name) || w.name || (isHome ? 'Capitale' : 'Colonie')).toUpperCase();
      if (/^[A-Z]-[A-Z]-\d{4}-\d{1,2}$/.test(coord)) out.push({ id: w.id, kind: isHome ? 'home' : 'colony', name, coord });
    }
    return out;
  }
  function inWorld(wid, fn) { return (typeof sbWithWorld === 'function') ? sbWithWorld(wid, fn) : fn(); }
  function hangar(wid) {
    return inWorld(wid, () => {
      const pool = G.probesPool || [], c = (t, s) => pool.filter(p => p.tier === t && (!s || p.state === s)).length;
      return { radar: c('radar', 'ready'), radarAll: c('radar'), light: c('light', 'ready'), lightAll: c('light'), medium: c('medium', 'ready'), mediumAll: c('medium'),
        metal: (G.res && G.res.metal && Math.floor(G.res.metal.v)) || 0, tankers: (typeof tankerAvailability === 'function') ? tankerAvailability(null) : 0 };
    });
  }
  function rangeSectors(wid) { try { const r = getMaxRange(wid); return r.kind === 'sector_radius' ? (r.radius || 0) : 26; } catch (e) { return 3; } }

  /* ── l'action suivante d'une signature, en données (la carte affiche ses propres boutons) ── */
  function sigAction(sig, wid) {
    if (!sig) return { kind: 'off', label: 'Signature introuvable' };
    return inWorld(wid, () => {
      if (!sig.resolved) {
        const st = _probeTierStatus('light');
        if (st.ok) return { kind: 'light', label: 'Envoyer une Légère', sub: 'Identifie la signature · 30 min' };
        if (st.build) return { kind: 'build-light', label: 'Construire une Légère', sub: '200 métal · 50 cristal, au Centre de prospection' };
        return { kind: 'off', label: st.why || 'Aucune Légère disponible' };
      }
      if (sig.resolvedType === 'moving') {
        const kt = sig.movingCoordKey && G.knownTargets && G.knownTargets[sig.movingCoordKey];
        if (!kt) return { kind: 'off', label: 'Cible exploitée ou expirée' };
        if (kt.status === 'engaged') return { kind: 'off', label: 'Tanker en route' };
        const n = (typeof tankerAvailability === 'function') ? tankerAvailability(null) : 0;
        return n > 0 ? { kind: 'tanker', label: 'Envoyer un tanker', sub: kt.label || 'Récupérer la cible', key: sig.movingCoordKey }
          : { kind: 'off', label: 'Aucun tanker disponible', sub: 'Un tanker se construit au Chantier orbital' };
      }
      if (!sig.fixedAddress) {
        const st = _probeTierStatus('medium');
        if (st.ok) return { kind: 'medium', label: 'Envoyer une Moyenne', sub: 'Fixe l’adresse du corps · 2 à 4 h' };
        if (st.build) return { kind: 'build-medium', label: 'Construire une Moyenne', sub: '600 métal · 200 cristal · compétence Cartographie' };
        return { kind: 'off', label: st.why || 'Aucune Moyenne disponible' };
      }
      return { kind: 'planet', label: sig.fixedClass === 'habitable' ? 'Ouvrir la planète (coloniser)' : 'Ouvrir la planète', key: sig.fixedAddress };
    });
  }

  /* ── état complet pour la carte ── */
  /* ── missions suivables (cahier « Observer » v1.1, § 18) : les horaires de la partie, tels qu'enregistrés ──
     Les missions de tankers, de sondes, de flottes en embuscade et d'arches sont calculées par le jeu lui-même et
     sauvegardées (pas par le serveur) ; la carte ne fait que les lire. Aucune n'est modifiée ici. */
  const ADDR_RE = /([A-Z]+-[A-Z]-\d{4})(?:-(\d{1,2}))?/;
  const addrOf = (v) => { const m = ADDR_RE.exec(String(v || '')); return m ? (m[2] ? m[1] + '-' + m[2].padStart(2, '0') : m[1]) : null; };
  function travels() {
    const out = [], ws = worlds(), coordOf = (id) => { const w = ws.find(x => x.id === (id || 'home')) || ws[0]; return w ? w.coord : null; };
    const TK = { in_transit: 'En route', exploring: 'En exploration', docked: 'À quai', returning: 'Retour' };
    for (const m of G.tankerMissions || []) {
      if (!m || !TK[m.status]) continue;
      const to = addrOf(m.targetCoords), via = (Array.isArray(m.via) ? m.via : []).map(addrOf).filter(Boolean);
      const ph = [{ dir: 'out', t0: m.departedAt, t1: m.arrivalAt }];
      if (m.status === 'docked') ph.push({ dir: 'stay', t0: m.arrivalAt, t1: m.dockStay && m.dockStay.endsAt || null });
      if (m.status === 'returning') { const t1 = m.returnArrivalAt || m.arrivalAt, t0 = m.returnDepartedAt || m.cancelledAt || Math.max(m.departedAt, t1 - (m.arrivalAt - m.departedAt)); ph.push({ dir: 'back', t0, t1 }); }
      out.push({ id: 'tk:' + m.id, kind: 'tanker', name: m.tankerName || 'Tanker', tier: m.tier || null, world: m.world || 'home', from: coordOf(m.world), to, via, toLabel: m.targetLabel || m.routeName || '',
        route: m.kind === 'route_run' ? (via.length ? 'ligne' : 'route') : 'direct', mkind: m.kind || 'cible', status: m.status, statusLabel: TK[m.status], phases: ph });
    }
    for (const m of G.probeMissions || []) {
      if (!m || m.status !== 'in_transit') continue;
      out.push({ id: 'pr:' + m.id, kind: 'probe', name: m.probeName || 'Sonde', tier: m.tier || null, world: m.world || 'home', from: coordOf(m.world), to: addrOf(m.targetCoords) || (m.zone ? null : null), via: [], toLabel: m.zone ? 'zone ' + m.zone.split(':').slice(1, 3).join(' · ') : String(m.targetCoords || ''),
        route: 'direct', mkind: m.zone ? 'zone' : (m.tier || 'sonde'), status: m.status, statusLabel: 'En route', phases: [{ dir: 'out', t0: m.departedAt, t1: m.arrivalAt }] });
    }
    for (const f of (G.fleet && G.fleet.prepared) || []) {
      const a = f && f.ambush; if (!a || !a.phase) continue;
      const ph = [{ dir: 'out', t0: a.departedAt, t1: a.arrivesAt }];
      if (a.phase !== 'going' && a.phase !== 'returning') ph.push({ dir: 'stay', t0: a.arrivesAt, t1: a.endsAt || a.until || null });
      if (a.phase === 'returning') ph.push({ dir: 'back', t0: a.returnDepartedAt || a.arrivesAt, t1: a.returnsAt });
      out.push({ id: 'fl:' + f.id, kind: 'fleet', name: f.name || 'Flotte', world: f.world || 'home', from: coordOf(f.world), to: addrOf(a.system), via: [], toLabel: 'embuscade · ' + (a.system || ''),
        route: 'direct', mkind: 'embuscade', status: a.phase, statusLabel: { going: 'En route', returning: 'Retour' }[a.phase] || 'En embuscade', phases: ph });
    }
    for (const m of G.colonyMissions || []) {   // l'arche n'enregistre pas son monde de départ : pas de position inventée
      if (!m) continue;
      out.push({ id: 'ar:' + m.id, kind: 'ark', name: m.name || 'Arche', world: null, from: null, to: addrOf(m.coord), via: [], toLabel: m.name || '', route: 'direct', mkind: 'colonisation', status: 'in_transit', statusLabel: 'En route', phases: [{ dir: 'out', t0: m.departAt, t1: m.arriveAt }] });
    }
    return out;
  }

  function state() {
    const z = zp(), now = Date.now(), ws = worlds();
    const hang = {}, ranges = {};
    for (const w of ws) { hang[w.id] = hangar(w.id); ranges[w.id] = rangeSectors(w.id); }
    const missions = (G.probeMissions || []).filter(m => m && m.zone && m.status === 'in_transit')
      .map(m => ({ id: m.id, zone: m.zone, world: m.world || 'home', departedAt: m.departedAt, arrivalAt: m.arrivalAt, probeName: m.probeName, sys: m.targetCoords }));
    const sigs = Object.values(G.signatures || {}).filter(s => s && !s.ignored).map(s => ({
      id: s.id, system: s.system, type: s.type, typeLabel: s.typeLabel, intensity: s.intensity, resolved: !!s.resolved, resolvedType: s.resolvedType,
      fixedClass: s.fixedClass, fixedAddress: s.fixedAddress, movingCoordKey: s.movingCoordKey, zone: s.zone || null,
      target: s.movingCoordKey && G.knownTargets && G.knownTargets[s.movingCoordKey] ? { label: G.knownTargets[s.movingCoordKey].label, status: G.knownTargets[s.movingCoordKey].status } : null,
    }));
    let tr = []; try { tr = travels(); } catch (e) { console.warn('[zones] missions', e); }
    return { now, active: G.activeWorld || 'home', worlds: ws, hangars: hang, ranges, zp: JSON.parse(JSON.stringify(z)), missions, sigs, travels: tr };
  }

  /* ── région de test : écrite une seule fois par la carte (contenu fixe) ── */
  function saveRegion(region) {
    const z = zp();
    if (z.region) return { ok: true, region: z.region, already: true };
    z.region = region; log('region', { zones: region.zones.length });
    save(); notify();
    return { ok: true, region };
  }

  /* ── lancer une Radar sur une zone ── */
  function launch(req) {
    const z = zp(), id = req && req.zone;
    const zone = z.region && z.region.zones.find(x => x.id === id);
    if (!zone) return { ok: false, why: 'Cette zone n’est pas dans la région de test.' };
    const st = z.zones[id];
    if (st && st.st === 'done') return { ok: false, why: 'Zone déjà sondée.' };
    const already = (G.probeMissions || []).find(m => m && m.zone === id && m.status === 'in_transit');
    if (already) return { ok: true, mission: already.id, already: true };   // double pression, rejeu : une seule mission
    const wid = req.world || 'home';
    if (!worlds().some(w => w.id === wid)) return { ok: false, why: 'Monde de départ inconnu.' };
    const range = Math.max(1, +req.range || 1), dist = Math.max(0, +req.dist || 0);
    if (dist > range) return { ok: false, why: 'Hors de portée depuis ce monde.' };
    const res = inWorld(wid, () => {
      const probe = (G.probesPool || []).find(p => p.tier === 'radar' && p.state === 'ready');
      if (!probe) return { ok: false, why: 'noradar' };
      const now = Date.now();
      // décision D4 (proposée) : les bornes actuelles 5–10 min, mais selon la distance 3D
      const dur = (5 + 5 * Math.min(1, dist / range)) * MIN * (window.SBSkills ? SBSkills.durMult('probes') : 1);
      const mission = {
        id: 'pm-' + now + '-' + Math.random().toString(36).slice(2, 6),
        probeId: probe.id, probeName: (typeof generateProbeName === 'function') ? generateProbeName() : 'Radar',
        tier: 'radar', mode: 'zone', zone: id, zoneLabel: req.label || id,
        targetCoords: zone.anchor, sector: zone.anchor, departedAt: now, arrivalAt: now + dur, status: 'in_transit',
      };
      probe.state = 'mission';
      G.probeMissions = G.probeMissions || [];
      G.probeMissions.push(typeof sbTagWorld === 'function' ? sbTagWorld(mission) : mission);
      return { ok: true, mission: mission.id, arrivalAt: mission.arrivalAt };
    });
    if (!res.ok) return res;
    z.zones[id] = { st: 'mission', mission: res.mission, world: wid, at: Date.now() };
    log('launch', { zone: id, world: wid, dist: Math.round(dist), dur: Math.round((res.arrivalAt - Date.now()) / 1000) });
    save(); notify();
    try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
    return res;
  }

  /* ── arrivée (appelée par handleProbeReturn pour les missions de zone) ── */
  function arrive(mission, idx) {
    const z = zp(), id = mission.zone;
    const zone = z.region && z.region.zones.find(x => x.id === id);
    const c = zone && zone.content;
    const created = [];
    if (c && c.cat !== 'rien' && c.sys && typeof createSignature === 'function') {
      const sig = createSignature(c.sys, mission.probeName, { type: c.sigType });
      if (sig) {
        sig.zone = id;
        sig.zoneOutcome = { as: c.as, kind: c.kind || null, fixedClass: c.fixedClass || null };
        sig.expiresAt = null;   // décision D7 (proposée) : une signature de zone ne périme pas
        created.push(sig);
        if (typeof saveSignatures === 'function') saveSignatures();
      }
    }
    const report = {
      id: 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      probeName: mission.probeName, sector: mission.sector, tier: 'radar', targetCoords: mission.targetCoords,
      systemAddress: created.length ? created[0].system : mission.targetCoords, createdAt: Date.now(), read: false,
      signatureIds: created.map(s => s.id), signaturesData: created, silent: !created.length,
      resolutionGain: created.length ? 5 + created.length * 2 : 5,
      radarSignal: created.length ? { coords: created[0].system, description: `${created.length} signature${created.length > 1 ? 's' : ''} relevée${created.length > 1 ? 's' : ''} dans la zone` } : null,
      targets: [], zone: id, zoneLabel: mission.zoneLabel || id,
    };
    G.probeReports = G.probeReports || [];
    G.probeReports.unshift(report);
    if (G.probeReports.length > 50) G.probeReports.length = 50;
    mission.status = 'returned';
    G.probeMissions.splice(idx, 1);
    const pool = G.probesPool || [], pi = pool.findIndex(p => p.id === mission.probeId);
    if (pi !== -1) pool.splice(pi, 1);   // la Radar brûle à l'arrivée, comme toujours
    z.zones[id] = { st: 'done', at: Date.now(), world: mission.world || 'home', found: created.map(s => s.id), mission: mission.id };
    log('arrive', { zone: id, found: created.length, kind: c ? c.kind || c.cat : null });
    try {
      if (typeof toast === 'function') toast(created.length
        ? `${typeof icon === 'function' ? icon('satellite', { size: 12 }) : ''} Zone sondée : 1 signature relevée · ${created[0].typeLabel || ''}`
        : `${typeof icon === 'function' ? icon('satellite', { size: 12 }) : ''} Zone sondée : silence radio`);
    } catch (e) {}
    save(); notify();
    try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
    return report;
  }

  /* ── actions de suite, exécutées par les fonctions existantes du jeu ── */
  function act(kind, arg, wid) {
    wid = wid || G.activeWorld || 'home';
    log('action', { kind, arg });
    if (kind === 'light' || kind === 'medium') {
      const before = (G.probeMissions || []).length;
      inWorld(wid, () => onSendProbeToSignature(kind, arg));
      const ok = (G.probeMissions || []).length > before;
      save(); notify();
      return { ok, why: ok ? null : 'Envoi refusé par le jeu (voir le message).' };
    }
    if (kind === 'tanker') { inWorld(wid, () => onTankerKnownTargetClick(arg)); save(); notify(); return { ok: true }; }
    if (kind === 'build-radar' || kind === 'build-light' || kind === 'build-medium') {
      close();
      if (wid !== (G.activeWorld || 'home') && typeof sbSwitchWorld === 'function') { try { sbSwitchWorld(wid); } catch (e) {} }
      try { if (typeof goto === 'function') goto('prospect'); } catch (e) {}
      setTimeout(() => { try { openProbeDetail(kind.split('-')[1]); } catch (e) {} }, 250);
      return { ok: true };
    }
    if (kind === 'planet') { close(); setTimeout(() => { try { openPlanetDetail(arg); } catch (e) {} }, 250); return { ok: true }; }
    return { ok: false, why: 'Action inconnue' };
  }

  /* ── ouverture de la carte en plein écran ── */
  function open(opt) {
    if (overlay || !allowed()) return;
    const pk = opt && opt.peek ? '&peek=' + encodeURIComponent(String(opt.peek).slice(0, 40)) : '';
    overlay = document.createElement('div');
    overlay.id = 'sb-zones-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#03040c';
    overlay.innerHTML = '<iframe title="Carte par zones (test)" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>';
    overlay.querySelector('iframe').src = PAGE + '?v=' + PAGE_V + pk;
    document.body.appendChild(overlay);
    log('open', {});
  }
  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null;
    try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
  }

  /* ── règles du jeu pour poser le contenu de la région : portée actuelle, emplacement habitable ── */
  function check(sys, kind) {
    let radar = false, habitable = false;
    try { radar = !!validateAddressForTier(sys, 'radar').valid; } catch (e) {}
    if (kind === 'habitable') { try { habitable = getPlanetSlotsInSystem(sys).some(z => getCelestialTypeForSlot(sys, z) === 'habitable'); } catch (e) {} }
    return { radar, habitable };
  }

  /* ── lecture seule de la partie d'un autre commandant (v53, dev_player_map : compte de test seulement) ── */
  function token() {
    try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); return a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) { return null; }
  }
  async function rpc(fn, args) {
    if (window.SB_ZONES_FAKE) return window.SB_ZONES_FAKE(fn, args);   // essais hors ligne
    if (typeof window._sbRpc === 'function') {
      const { data, error } = await window._sbRpc(fn, args);
      if (error) throw new Error(error.message || 'rpc');
      return data;
    }
    const tok = token(); if (!tok) throw new Error('not_signed_in');
    const r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + tok }, body: JSON.stringify(args || {}) });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && (j.message || j.error)) || ('http_' + r.status));
    return j;
  }
  async function peek(pseudo) {
    if (!allowed()) return { ok: false, why: 'Réservé au compte de test.' };
    let d;
    try { d = await rpc('dev_player_map', { p_pseudo: String(pseudo || '').slice(0, 40) }); }
    catch (e) {
      const m = String(e && e.message || e);
      if (/dev_player_map|function|schema cache|404/i.test(m) && !/dev_only/.test(m)) return { ok: false, why: 'Le serveur ne connaît pas encore cette lecture : colle server/schema_mp_v53_dev_lecture_partie.sql dans Supabase → SQL Editor → Run.' };
      if (/dev_only/.test(m)) return { ok: false, why: 'Le serveur refuse : réservé au compte de test.' };
      if (/not_signed_in/.test(m)) return { ok: false, why: 'Pas de session en ligne sur cet appareil.' };
      return { ok: false, why: 'Lecture impossible : ' + m.slice(0, 120) };
    }
    if (!d || !d.ok) {
      if (d && d.why === 'unknown_pseudo') return { ok: false, why: 'Aucun commandant « ' + pseudo + ' » au registre' + (d.candidates && d.candidates.length ? ' · proches : ' + d.candidates.join(', ') : '') + '.' };
      return { ok: false, why: 'Rien à lire.' };
    }
    log('peek', { pseudo: d.pseudo });
    return { ok: true, data: d };
  }

  window.SBZones = {
    allowed, why, open, close, state, saveRegion, launch, arrive, act, check, peek, sigAction: (id, wid) => sigAction((G.signatures || {})[id], wid),
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    grid: GRID,
  };

  /* ── bouton d'entrée : Centre de prospection, à côté de « Recentrer » et « Vue d'ensemble » ── */
  function install() {
    if (installed || !allowed()) return;
    const tools = document.querySelector('#scr-prospect .smw-tools');
    if (!tools) return;
    installed = true;
    const st = document.createElement('style');
    st.textContent = `#sb-zones-btn{position:relative}#sb-zones-btn i{position:absolute;right:-6px;top:-7px;font:600 8px/1 'JetBrains Mono',monospace;letter-spacing:.06em;
      padding:2px 4px;border-radius:4px;background:#b29aff;color:#0b0c1c;font-style:normal}`;
    document.head.appendChild(st);
    const b = document.createElement('button');
    b.id = 'sb-zones-btn'; b.setAttribute('aria-label', 'Carte par zones (test)'); b.title = 'Carte par zones · test (compte de test seulement)';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 3v18M4.2 7.5L19.8 16.5M19.8 7.5L4.2 16.5" opacity=".45"/></svg><i>TEST</i>';
    b.onclick = (e) => { e.stopPropagation(); open(); };
    tools.appendChild(b);
  }
  const tick = () => { try { install(); } catch (e) {} };
  setTimeout(tick, 1500); setInterval(tick, 2000);
  // ?zones ouvre la carte ; ?zones=Panzerstorm l'ouvre sur la partie de ce commandant. Sans accès au bout de 20 s, on dit pourquoi.
  const qz = location.search.match(/[?&]zones(?:=([^&]*))?/);
  if (qz) {
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (allowed() && typeof G !== 'undefined' && G.planet) { clearInterval(t); open(qz[1] ? { peek: decodeURIComponent(qz[1]) } : null); return; }
      if (n === 20) {
        clearInterval(t);
        let p = '—', c = '—';
        try { p = (window.SBMP && SBMP.world && SBMP.world.pseudo) || '—'; } catch (e) {}
        try { c = fmtAddr(MY_ADDRESS); } catch (e) {}
        try { toast(`Carte par zones : accès refusé · pseudo ${String(p).replace(/[<>&"]/g, '')} · capitale ${c} · session ${window.SBCloud && SBCloud.user ? (SBCloud.user.email || SBCloud.user.new_email ? 'avec email' : 'sans email') : 'absente'}`); } catch (e) {}
      }
    }, 1000);
  }
})();
