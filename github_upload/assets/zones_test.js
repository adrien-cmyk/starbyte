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
  const PAGE_V = 'cca738bdb7';   // empreinte de atlas/index.html, écrite par labo/carte-zones/build.py
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
      out.push({ id: 'tk:' + m.id, kind: 'tanker', name: m.tankerName || 'Tanker', tier: m.tier || null, fuel: typeof m.fuelCost === 'number' ? m.fuelCost : null, envoy: m.bmEnvoy && /^[a-z0-9-]{2,40}$/.test(String(m.bmEnvoy.item || '')) ? { item: m.bmEnvoy.item, name: m.bmEnvoy.name || '' } : null, world: m.world || 'home', from: coordOf(m.world), to, via, toLabel: m.targetLabel || m.routeName || '',
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
      const comp = {}; for (const k of ['cuirasse', 'fregate', 'tanker']) { const c = (f.composition && f.composition[k]) || {}; comp[k] = { t1: c.t1 || 0, t2: c.t2 || 0, t3: c.t3 || 0 }; }   // composition connue : c'est ta flotte
      const premium = (Array.isArray(f.premium) ? f.premium : []).filter(p => p && /^[a-z0-9-]{2,40}$/.test(String(p.item || ''))).map(p => ({ item: p.item, cat: p.cat || '' }));
      out.push({ id: 'fl:' + f.id, kind: 'fleet', name: f.name || 'Flotte', comp, premium, world: f.world || 'home', from: coordOf(f.world), to: addrOf(a.system), via: [], toLabel: 'embuscade · ' + (a.system || ''),
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
    const kn = migrated() ? known() : null;   // compte migré : les ports et les routes que la partie connaît
    return { now, active: G.activeWorld || 'home', worlds: ws, hangars: hang, ranges, zp: JSON.parse(JSON.stringify(z)), missions, sigs, travels: tr, mig: migrated(), ports: kn ? kn.ports : null, routes: kn ? kn.routes : null };
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
    try { migrate(); } catch (e) {}
    if (migrated() && !(opt && opt.peek) && !(opt && opt.overlay)) { oldMap = false; if (typeof goto === 'function' && !onProspect()) goto('prospect'); showNewMap(opt && opt.focus || null); return; }
    if (overlay || !(allowed() || migrated())) return;
    const pk = opt && opt.peek ? '&peek=' + encodeURIComponent(String(opt.peek).slice(0, 40)) : '';
    overlay = document.createElement('div');
    overlay.id = 'sb-zones-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#03040c';
    overlay.innerHTML = '<iframe title="Carte par zones (test)" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>';
    overlay.querySelector('iframe').src = PAGE + '?v=' + PAGE_V + pk; overlay.dataset.peek = pk ? '1' : '';
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

  /* ── catalogue des modèles du jeu (cahier v1.2 § 24.1) : l'atlas ne tient aucune liste à lui ──
     stations : STATION_UI (modèle, titre) + mpDockSystem (le système de la station, le même pour tous) ;
     vaisseaux : Formation3D.catalog() (modèles LOD et longueurs d'affichage). Adresses absolues : l'atlas est dans un cadre. */
  function models() {
    const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return null; } };
    const stations = [];
    try {
      if (typeof STATION_UI === 'object' && STATION_UI) for (const k in STATION_UI) {
        const u = STATION_UI[k]; if (!u || !u.id || !u.url) continue;
        let sys = null; try { sys = typeof mpDockSystem === 'function' ? mpDockSystem({ id: u.id }) : null; } catch (e) {}
        if (sys) stations.push({ sys, dock: u.id, profile: k, title: u.title || '', kicker: u.kicker || '', sub: u.sub || '', url: abs(u.url), code: (u.url.match(/sb_([a-z0-9]+)\.glb/) || [])[1] || '' });
      }
    } catch (e) {}
    let ships = {}, bm = null;
    try {
      const c = window.Formation3D && Formation3D.catalog ? Formation3D.catalog() : null;
      if (c) { for (const k in c.ships) ships[k] = { url: abs(c.ships[k].url), len: c.ships[k].len, wid: c.ships[k].wid, code: (c.ships[k].url.match(/sb_([a-z0-9]+)(?:_lod)?\.glb/) || [])[1] || '' }; bm = (item) => { const u = c.bmUrl(item); return u ? abs(u) : null; }; }
    } catch (e) {}
    return { meshopt: abs('assets/meshopt_decoder.module.js'), stations, ships, bmUrl: bm };
  }

  /* ══ 12/11 : la partie d'Hadrien passe sur la nouvelle carte (bascule progressive, décision d'Adrien du 12/11) ══
     Compte pilote seulement : pseudo du registre « hadrien » ou capitale A-O-2178 (pas tous les comptes du mode triche ;
     les essais locaux le demandent avec localStorage sb_atlas_pilote = 1). La marque G.atlasCarte est posée une fois.
     Le Centre de prospection garde son bandeau, ses feuilles (Sondes, Missions, Rapports, Carnet, Archives) et sa croix ;
     seule la carte du fond change : la nouvelle carte entre le bandeau et la barre du bas. L'ancienne reste à un bouton,
     au même endroit (« Ancienne carte »), tant que toutes ses actions ne sont pas reprises. Aucune donnée n'est convertie
     à cette étape : routes → corridors et balises viendront chacune avec sa propre migration. */
  function pilot() {
    if (window.SB_ZONES_OFF) return false;
    try { if (localStorage.getItem('sb_atlas_pilote') === '1') return true; } catch (e) {}
    try { const n = window.SBMP && SBMP.world && SBMP.world.pseudo; if (n && DEV_NAMES.includes(String(n).trim().toLowerCase())) return true; } catch (e) {}
    try {
      const sys = (a) => a ? `${a.cluster}-${a.sector}-${String(a.system).padStart(4, '0')}` : '';
      if (typeof MY_ADDRESS !== 'undefined' && DEV_SYSTEMS.includes(sys(MY_ADDRESS))) return true;
      const reg = window.SBMP && SBMP.world && SBMP.world.address;
      if (reg && DEV_SYSTEMS.some(s => String(reg).indexOf(s + '-') === 0)) return true;
    } catch (e) {}
    return false;
  }
  const migrated = () => !window.SB_ZONES_OFF && typeof G !== 'undefined' && !!G && !!G.atlasCarte && G.atlasCarte.v >= 1;
  let oldMap = false, frameWrap = null, pendingFocus = null;
  function migrate() {
    if (typeof G === 'undefined' || !G || !G.planet || migrated() || !pilot()) return false;
    G.atlasCarte = { v: 1, since: Date.now(), mode: 'progressive', etapes: { bascule: Date.now() } };
    log('migration', { etape: 'bascule' }); save();
    try { if (typeof toast === 'function') toast('Ta partie passe sur la nouvelle carte. L’ancienne reste à un bouton : « Ancienne carte ».'); } catch (e) {}
    return true;
  }
  const scrP = () => document.getElementById('scr-prospect');
  const onProspect = () => { try { return typeof getCurrentScreen === 'function' ? getCurrentScreen() === 'prospect' : !!(scrP() && scrP().offsetParent); } catch (e) { return false; } };
  function frameApi() { try { const f = frameWrap && frameWrap.querySelector('iframe'); const w = f && f.contentWindow; return w && w.STARBYTE_ZONES && w.STARBYTE_ZONES.ready && w.STARBYTE_ZONES.ready() ? w.STARBYTE_ZONES : null; } catch (e) { return null; } }
  function place() {   // la carte entre le bandeau du haut et la barre du bas
    if (!frameWrap) return;
    const s = scrP(), top = s && s.querySelector('.smw-top'), nav = s && s.querySelector('.smw-nav');
    const t = top ? Math.max(0, top.getBoundingClientRect().bottom - 18) : 0, b = nav ? Math.max(0, innerHeight - nav.getBoundingClientRect().top - 6) : 0;
    frameWrap.style.top = Math.round(t) + 'px'; frameWrap.style.bottom = Math.round(b) + 'px';
    if (s) s.style.setProperty('--sb-atlas-top', Math.round(t) + 'px');
  }
  function styleOnce() {
    if (document.getElementById('sb-atlas-css')) return;
    const st = document.createElement('style'); st.id = 'sb-atlas-css';
    st.textContent = `#scr-prospect.sb-atlas #spacemap-root,#scr-prospect.sb-atlas .smw-tools,#scr-prospect.sb-atlas .smw-hint,#scr-prospect.sb-atlas .smw-card{display:none!important}
      #scr-prospect.sb-atlas #sb-pguide-btn{top:calc(var(--sb-atlas-top,68px) + 268px)!important}
      .sb-atlas-wrap{position:absolute;left:0;right:0;top:0;bottom:0;z-index:2;background:#03040c}.sb-atlas-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
      .sb-old-bar{position:absolute;left:50%;transform:translateX(-50%);top:calc(var(--sai,0px) + 70px);z-index:22;display:flex;gap:8px;align-items:center;padding:7px 8px 7px 12px;border-radius:12px;
        background:rgba(11,12,28,.92);border:1px solid rgba(178,154,255,.35);font:600 11px/1.2 'Space Grotesk',system-ui;color:#ddd8ff;white-space:nowrap}
      .sb-old-bar button{font:700 11px/1 'Space Grotesk',system-ui;color:#0b0c1c;background:#b29aff;border:0;border-radius:8px;padding:7px 10px}`;
    document.head.appendChild(st);
  }
  function mountAtlas() {
    if (!migrated() || oldMap) return false;
    const s = scrP(); if (!s) return false;
    styleOnce(); s.classList.add('sb-atlas');
    const bar = s.querySelector('.sb-old-bar'); if (bar) bar.remove();
    if (!frameWrap || !frameWrap.isConnected) {
      frameWrap = document.createElement('div'); frameWrap.className = 'sb-atlas-wrap'; frameWrap.id = 'sb-atlas-wrap';
      frameWrap.innerHTML = '<iframe title="Carte" allow="fullscreen"></iframe>';
      frameWrap.querySelector('iframe').src = PAGE + '?v=' + PAGE_V + '&in=jeu';
      const map = s.querySelector('.smw-map'); s.insertBefore(frameWrap, map ? map.nextSibling : s.firstChild);
      log('carte', { mount: true });
    }
    place(); setTimeout(place, 300);
    return true;
  }
  function unmountAtlas() { if (frameWrap) { frameWrap.remove(); frameWrap = null; } }
  // vise un objet dans la nouvelle carte dès qu'elle est prête (« Voir sur la carte » des rapports, du carnet, des missions)
  function focusAtlas(sel) {
    pendingFocus = sel; const t0 = Date.now();
    (function tryIt() {
      if (pendingFocus !== sel) return;
      const A = frameApi();
      if (A) { pendingFocus = null; try { A.focusGame(sel); } catch (e) { console.warn('[carte] visée', e); } return; }
      if (Date.now() - t0 < 15000) setTimeout(tryIt, 250);
    })();
  }
  // l'ancienne carte, au même endroit, le temps que toutes ses actions passent dans la nouvelle
  function showOldMap(sel) {
    oldMap = true; unmountAtlas();
    const s = scrP(); if (s) s.classList.remove('sb-atlas');
    if (typeof getCurrentScreen === 'function' && getCurrentScreen() !== 'prospect' && typeof goto === 'function') goto('prospect');
    try { origRender && origRender(); } catch (e) {}
    if (sel && sel.kind && sel.key && origSelect) { try { origSelect(sel.kind, sel.key); } catch (e) {} }
    if (s && !s.querySelector('.sb-old-bar')) {
      styleOnce();
      const bar = document.createElement('div'); bar.className = 'sb-old-bar';
      bar.innerHTML = '<span>Ancienne carte</span><button type="button">Nouvelle carte</button>';
      bar.querySelector('button').onclick = (e) => { e.stopPropagation(); showNewMap(); };
      s.appendChild(bar);
    }
    log('carte', { old: true, sel: sel || null });
  }
  function showNewMap(sel) { oldMap = false; const s = scrP(); const bar = s && s.querySelector('.sb-old-bar'); if (bar) bar.remove(); mountAtlas(); if (sel) focusAtlas(sel); }
  // les entrées du jeu vers l'ancienne carte passent par la nouvelle
  let origRender = null, origSelect = null, origFlight = null, origGoto = null;
  function hookGame() {
    if (window.SBMap && !SBMap._atlasHook) {
      origRender = SBMap.render; origSelect = SBMap.select; origFlight = SBMap.showFlight;
      SBMap.render = function () { if (migrated() && !oldMap) { if (onProspect()) mountAtlas(); return; } return origRender.apply(this, arguments); };
      SBMap.select = function (kind, key) { if (migrated() && !oldMap) { mountAtlas(); focusAtlas({ kind, key }); return; } return origSelect.apply(this, arguments); };
      if (origFlight) SBMap.showFlight = function (id) { if (migrated() && !oldMap) { if (typeof goto === 'function' && !onProspect()) goto('prospect'); mountAtlas(); focusAtlas({ kind: 'travel', key: 'pr:' + id }); return; } return origFlight.apply(this, arguments); };
      SBMap._atlasHook = true;
    }
    if (typeof window.goto === 'function' && !window.goto._atlasHook) {
      origGoto = window.goto;
      const g = function (scr) { const r = origGoto.apply(this, arguments); try { if (migrated()) { if (scr === 'prospect') { if (!oldMap) mountAtlas(); } else unmountAtlas(); } } catch (e) {} return r; };
      g._atlasHook = true; window.goto = g;
    }
  }
  function migTick() {
    try {
      if (typeof G === 'undefined' || !G || !G.planet) return;
      migrate(); hookGame();
      if (!migrated()) return;
      const b = document.getElementById('sb-zones-btn'); if (b) b.remove();   // le bouton d'essai n'a plus lieu d'être
      if (overlay && !overlay.dataset.peek) close();   // l'ancien cadre plein écran : la carte est maintenant dans le Centre de prospection
      if (onProspect() && !oldMap) mountAtlas(); else if (!onProspect()) unmountAtlas();
      place();
    } catch (e) { console.warn('[carte] bascule', e); }
  }
  addEventListener('resize', () => place());
  setTimeout(migTick, 1200); setInterval(migTick, 1500);
  // ce que la carte demande au jeu (compte migré) : ports connus, routes connues, l'ancienne carte au même endroit
  function known() {
    const ports = [], routes = [];
    try { for (const [sys, p] of Object.entries(G.hiddenPorts || {})) if (p) ports.push({ sys, dock: p.dockId || null, name: p.name || '', label: p.typeLabel || '', enter: !!(p.dockId && typeof stationUI === 'function' && stationUI(p.dockId) && typeof crownEnter === 'function') }); } catch (e) {}
    try { for (const r of (G.routes || [])) if (r && r.portSys) routes.push({ id: r.id, name: r.name || '', port: r.portSys }); } catch (e) {}
    return { ports, routes };
  }
  function gameAct(kind, arg) {
    log('action', { kind, arg });
    if (kind === 'port') { if (typeof crownEnter !== 'function') return { ok: false, why: 'Entrée indisponible.' }; crownEnter(arg); return { ok: true }; }
    if (kind === 'route-tanker') { if (typeof openTankerComposeForRoute !== 'function') return { ok: false, why: 'Envoi indisponible.' }; openTankerComposeForRoute(arg); return { ok: true }; }
    if (kind === 'oldmap') { showOldMap(arg || null); return { ok: true }; }
    return { ok: false, why: 'Action inconnue' };
  }

  window.SBZones = {
    allowed, why, open, close, state, saveRegion, launch, arrive, act, check, peek, models, migrated, pilot, known, gameAct, showOldMap, showNewMap, embedded: () => !!frameWrap, sigAction: (id, wid) => sigAction((G.signatures || {})[id], wid),
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    grid: GRID,
  };

  /* ── bouton d'entrée : Centre de prospection, à côté de « Recentrer » et « Vue d'ensemble » ── */
  function install() {
    if (installed || !allowed() || migrated()) return;
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
