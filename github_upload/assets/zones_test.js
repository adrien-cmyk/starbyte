/* ═══════════════════════════════════════════════════════════════════════
   STARBYTE — LA CARTE (Atlas et Tactique) · pont entre le jeu et atlas/index.html
   Cf. claude/starbyte_migration_carte_hadrien.md (migration de toutes les parties, 14/11/2026)

   Toutes les parties passent sur la nouvelle carte (marque G.atlasCarte) : elle
   s'affiche dans le Centre de prospection, sous son bandeau. L'ancienne carte reste
   à un bouton (« Ancienne carte ») le temps de la transition.
   → « Sonder cette zone » envoie une vraie Radar du hangar du monde choisi
     (G.probesPool), mission rangée dans G.probeMissions comme les autres ;
   → à l'arrivée, le contenu de la zone (tiré de son seul identifiant, le même
     pour tous) devient de vraies signatures : la suite est celle du jeu ;
   → la conversion (une fois par partie) passe les lignes des six stations sur
     leurs corridors en gardant l'avancement de chacun (balises, signaux
     d'antenne, tronçons connus), sans faire découvrir de port (décision du 14/11).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.EXTRA_SAVE_KEYS && EXTRA_SAVE_KEYS.indexOf('zoneProspect') < 0) EXTRA_SAVE_KEYS.push('zoneProspect');

  const PAGE = 'atlas/index.html';
  const PAGE_V = '96e933626e';   // empreinte de atlas/index.html, écrite par labo/carte-zones/build.py
  const GRID = 'tac-2';
  const MIN = 60e3;
  const SB = 'https://elupnpdcblztpfywnhjl.supabase.co';
  const KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';   // clé publique (faite pour être dans le client)

  // 14/11 : toutes les parties ont la carte (seul SB_ZONES_OFF la coupe, pour les essais de l'ancienne)
  const allowed = () => !window.SB_ZONES_OFF;
  const why = () => (allowed() ? 'carte' : null);
  let overlay = null;
  const listeners = new Set();

  const zp = () => (G.zoneProspect && G.zoneProspect.v === 1) ? G.zoneProspect : (G.zoneProspect = { v: 1, grid: GRID, region: null, zones: {}, journal: [] });
  const fmtAddr = (a) => a ? `${a.cluster}-${a.sector}-${String(a.system).padStart(4, '0')}-${String(a.planet == null ? 40 : a.planet).padStart(2, '0')}` : '';
  const save = () => { try { if (typeof saveGame === 'function') saveGame(); } catch (e) {} };
  const notify = () => { for (const f of listeners) { try { f(); } catch (e) {} } };
  function log() {}   // 14/11 : le journal des mesures de l'essai est retiré (il grossissait la sauvegarde)

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
    const TK = { in_transit: 'En route', exploring: 'En exploration', docked: 'À quai', returning: 'Retour', orbital_relay: 'En orbite', posted: 'En poste' };   // étape 3 : ambassade et poste
    for (const m of G.tankerMissions || []) {
      if (!m || !TK[m.status]) continue;
      const vy = m.voyage && m.voyage.st === 'server' ? m.voyage : null;
      const to = addrOf(m.portSys || m.targetCoords), via = (vy ? vy.via : Array.isArray(m.via) ? m.via : []).map(addrOf).filter(Boolean);
      const ph = [{ dir: 'out', t0: m.departedAt, t1: m.arrivalAt }];
      if (m.status === 'docked') ph.push({ dir: 'stay', t0: m.arrivalAt, t1: m.dockStay && m.dockStay.endsAt || null });
      if (m.status === 'orbital_relay' || m.status === 'posted') ph.push({ dir: 'stay', t0: m.arrivalAt, t1: null });
      if (m.status === 'returning') { const t1 = m.returnArrivalAt || m.arrivalAt, t0 = m.returnDepartedAt || m.cancelledAt || Math.max(m.departedAt, t1 - (m.arrivalAt - m.departedAt)); ph.push({ dir: 'back', t0, t1 }); }
      out.push({ id: 'tk:' + m.id, kind: 'tanker', name: m.tankerName || 'Tanker', tier: m.tier || null, fuel: typeof m.fuelCost === 'number' ? m.fuelCost : null, envoy: m.bmEnvoy && /^[a-z0-9-]{2,40}$/.test(String(m.bmEnvoy.item || '')) ? { item: m.bmEnvoy.item, name: m.bmEnvoy.name || '' } : null, world: m.world || 'home', from: coordOf(m.world), to, via, toLabel: m.targetLabel || m.routeName || '',
        route: vy ? (vy.pick === 'cor' ? 'corridors' : 'direct') : m.kind === 'route_run' ? (via.length ? 'ligne' : 'route') : 'direct', mkind: m.kind || 'cible',
        voyage: m.voyage ? { st: m.voyage.st, why: m.voyage.why || null, nCor: m.voyage.nCor || 0, net: m.voyage.net || null, cors: m.voyage.cors || [] } : null, status: m.status, statusLabel: TK[m.status], phases: ph,
        stayLabel: m.status === 'orbital_relay' ? 'En orbite' + (m.mpTarget && m.mpTarget.pseudo ? ' chez ' + String(m.mpTarget.pseudo).slice(0, 24) : '') : m.status === 'posted' ? 'En poste' : null });
    }
    for (const m of G.probeMissions || []) {
      if (!m || m.status !== 'in_transit') continue;
      out.push({ id: 'pr:' + m.id, kind: 'probe', name: m.probeName || 'Sonde', tier: m.tier || null, world: m.world || 'home', from: coordOf(m.world), to: addrOf(m.targetCoords) || (m.zone ? null : null), via: [], toLabel: m.zone ? 'zone ' + m.zone.split(':').slice(1, 3).join(' · ') : String(m.targetCoords || ''),
        route: 'direct', mkind: m.zone ? 'zone' : (m.tier || 'sonde'), status: m.status, statusLabel: 'En route', phases: [{ dir: 'out', t0: m.departedAt, t1: m.arrivalAt }] });
    }
    for (const f of (G.fleet && G.fleet.prepared) || []) {
      if (fleetTravel(f, out, coordOf)) continue;
      const a = f && f.ambush; if (!a || !a.phase) continue;
      const seg = a.edge ? { edge: a.edge, a: a.a, b: a.b, name: a.segName || a.edge } : null;   // étape 5 : posée sur un tronçon
      const ph = [{ dir: 'out', t0: a.departedAt, t1: a.arrivesAt }];
      if (a.phase !== 'going' && a.phase !== 'returning') ph.push({ dir: 'stay', t0: a.arrivesAt, t1: a.endsAt || a.until || null });
      if (a.phase === 'returning') ph.push({ dir: 'back', t0: a.returnDepartedAt || a.arrivesAt, t1: a.returnsAt });
      const comp = {}; for (const k of ['cuirasse', 'fregate', 'tanker']) { const c = (f.composition && f.composition[k]) || {}; comp[k] = { t1: c.t1 || 0, t2: c.t2 || 0, t3: c.t3 || 0 }; }   // composition connue : c'est ta flotte
      const premium = (Array.isArray(f.premium) ? f.premium : []).filter(p => p && /^[a-z0-9-]{2,40}$/.test(String(p.item || ''))).map(p => ({ item: p.item, cat: p.cat || '' }));
      out.push({ id: 'fl:' + f.id, kind: 'fleet', name: f.name || 'Flotte', comp, premium, world: f.world || 'home', from: coordOf(f.world), to: addrOf(a.system), via: [], toLabel: 'embuscade · ' + (seg ? seg.name : (a.system || '')), seg,
        route: 'direct', mkind: 'embuscade', fleetId: String(f.id).slice(0, 80), status: a.phase, statusLabel: { going: 'En route', returning: 'Retour' }[a.phase] || 'En embuscade', phases: ph });
    }
    for (const m of G.colonyMissions || []) {   // l'arche n'enregistre pas son monde de départ : pas de position inventée
      if (!m) continue;
      out.push({ id: 'ar:' + m.id, kind: 'ark', name: m.name || 'Arche', world: null, from: null, to: addrOf(m.coord), via: [], toLabel: m.name || '', route: 'direct', mkind: 'colonisation', status: 'in_transit', statusLabel: 'En route', phases: [{ dir: 'out', t0: m.departAt, t1: m.arriveAt }] });
    }
    // une expédition punitive impériale vers ta capitale (le jeu connaît son départ quand elle part d'une station)
    try { const x = G.imperialRep && G.imperialRep.exp; if (x && x.arrivesAt > Date.now()) out.push({ id: 'im:' + String(x.id || 'exp').slice(0, 40), kind: 'fleet', hostile: true, name: 'Flotte du Trône', comp: null, premium: [], world: 'home', from: x.fromSys ? addrOf(x.fromSys) : null, to: coordOf('home'), via: [], toLabel: 'expédition punitive · ta capitale', route: 'direct', mkind: 'imperial', status: 'enroute', statusLabel: 'En route', phases: [{ dir: 'out', t0: x.startedAt || null, t1: x.arrivesAt }] }); } catch (e) {}
    return out;
  }
  // étape 3 : une flotte en raid, en mission ou en garnison (l'embuscade reste plus bas). Rien n'est inventé : horaires de la partie.
  function fleetTravel(f, out, coordOf) {
    if (!f || f.ambush) return false;
    const comp = {}; for (const k of ['cuirasse', 'fregate', 'tanker']) { const c = (f.composition && f.composition[k]) || {}; comp[k] = { t1: c.t1 || 0, t2: c.t2 || 0, t3: c.t3 || 0 }; }
    const premium = (Array.isArray(f.premium) ? f.premium : []).filter(p => p && /^[a-z0-9-]{2,40}$/.test(String(p.item || ''))).map(p => ({ item: p.item, cat: p.cat || '' }));
    const base = { id: 'fl:' + f.id, fleetId: String(f.id || '').slice(0, 80), kind: 'fleet', name: f.name || 'Flotte', comp, premium, world: f.world || 'home', from: coordOf(f.world), via: [], route: 'direct' };
    const g = f.garrison, now = Date.now();
    if (g && g.phase) {
      const ph = [{ dir: 'out', t0: g.departedAt, t1: g.arrivesAt }];
      if (g.phase === 'posted') ph.push({ dir: 'stay', t0: g.arrivesAt, t1: null });
      if (g.phase === 'returning') ph.push({ dir: 'back', t0: (g.returnsAt || now) - (g.travelMs || Math.max(1, (g.arrivesAt || now) - (g.departedAt || now))), t1: g.returnsAt });
      out.push({ ...base, to: addrOf(g.address), toLabel: 'garnison · ' + String(g.pseudo || '').slice(0, 24), mkind: 'garnison', status: g.phase, statusLabel: { going: 'En route', posted: 'En garnison', returning: 'Retour' }[g.phase] || 'En garnison', stayLabel: 'En garnison', phases: ph });
      return true;
    }
    if (f.status !== 'in_mission' || !f.missionStartedAt) return false;
    if (f.mpRaidId && f.mpTarget) {
      const arr = f.mpArrivesAt || null, end = f.missionEndsAt || null;
      out.push({ ...base, to: addrOf(f.mpTarget.address), toLabel: 'raid · ' + String(f.mpTarget.pseudo || f.mpTarget.name || '').slice(0, 30), mkind: 'raid', status: arr && now < arr ? 'going' : 'returning', statusLabel: arr && now < arr ? 'En route' : 'Retour', phases: [{ dir: 'out', t0: f.missionStartedAt, t1: arr }, { dir: 'back', t0: arr, t1: end }] });
      return true;
    }
    const t = typeof getFakeTarget === 'function' ? getFakeTarget(f.missionTargetId) : null, end = f.missionEndsAt || null, mid = end ? Math.round((f.missionStartedAt + end) / 2) : null;
    out.push({ ...base, to: t && t.coord ? addrOf(t.coord) : null, toLabel: 'mission · ' + String((t && t.name) || 'cible').slice(0, 40), mkind: 'mission', status: mid && now < mid ? 'going' : 'returning', statusLabel: mid && now < mid ? 'En route' : 'Retour',
      note: 'Le jeu ne fixe que la durée totale de la mission : la carte place l’arrivée à mi-parcours.', phases: [{ dir: 'out', t0: f.missionStartedAt, t1: mid }, { dir: 'back', t0: mid, t1: end }] });
    return true;
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
    const kn = migrated() ? known() : null;   // compte migré : les ports et les routes que la partie connaît, les systèmes balayés et leurs marques
    return { now, active: G.activeWorld || 'home', worlds: ws, hangars: hang, ranges, zp: JSON.parse(JSON.stringify(z)), missions, sigs, travels: tr, mig: migrated(), ports: kn ? kn.ports : null, routes: kn ? kn.routes : null, systems: kn ? kn.systems : null, tags: kn ? kn.tags : null, cmd: kn ? kn.cmd : null, fleetsReady: kn ? kn.fleets : null, corKnown: kn ? corKnown() : null, netPorts: kn ? NET_PORTS : null, moves5: kn ? ((G.atlasCarte && G.atlasCarte.moves5) || []) : null, hosted: kn ? kn.hosted : null, incoming: kn ? kn.incoming : null, posts: kn ? kn.posts : null, beacons: kn ? beacons() : null, nav: kn ? navState() : null };
  }


  /* ── lancer une Radar sur une zone ── */
  // 12/11 : univers ouvert (compte migré). Une zone hors de l'ancienne région arrive avec le contenu tiré par la carte ;
  // le jeu le reprend d'une liste fermée (type de contenu, adresse de système, emplacement habitable vérifié par ses règles)
  const ZONE_KINDS = {
    asteroides: { sigType: 'mineral_dense', as: 'moving' }, cristal: { sigType: 'mineral_dense', as: 'moving' }, epave: { sigType: 'metallic_echo', as: 'moving' },
    debris: { sigType: 'metallic_echo', as: 'moving' }, cargo: { sigType: 'metallic_echo', as: 'moving' }, sonde_ancienne: { sigType: 'heat_point', as: 'moving' },
    anomalie: { sigType: 'unstable_field', as: 'moving' }, habitable: { sigType: 'heat_point', as: 'fixed', fixedClass: 'habitable' },
  };
  const SYS_RE = /^[A-Z]{1,2}-[A-Z]-\d{4}$/, ZONE_RE = /^tac-2:-?\d{1,5}:-?\d{1,5}:-?\d{1,5}$/;
  function openZone(req) {
    const c = req && req.content, anchor = String((req && req.anchor) || (c && c.sys) || '');
    if (!c || !SYS_RE.test(anchor)) return null;
    if (c.cat === 'rien') return { id: req.zone, anchor, content: { cat: 'rien' }, open: true };
    if (!['commun', 'choix'].includes(c.cat) || !ZONE_KINDS[c.kind] || !SYS_RE.test(String(c.sys || ''))) return null;
    if (c.kind === 'habitable' && !check(c.sys, 'habitable').habitable) return null;
    return { id: req.zone, anchor, content: { cat: c.cat, kind: c.kind, sys: c.sys, ...ZONE_KINDS[c.kind] }, open: true };
  }
  function launch(req) {
    const z = zp(), id = req && req.zone;
    const st = z.zones[id];
    if (st && st.st === 'done') return { ok: false, why: 'Zone déjà sondée.' };
    const already = (G.probeMissions || []).find(m => m && m.zone === id && m.status === 'in_transit');
    if (already) return { ok: true, mission: already.id, already: true };   // double pression, rejeu : une seule mission
    let zone = z.region && z.region.zones.find(x => x.id === id);   // les 30 zones tirées avant le 12/11 (partie d'Hadrien) gardent leur contenu
    if (!zone && migrated() && ZONE_RE.test(String(id || ''))) { zone = openZone(req); if (!zone) return { ok: false, why: 'Contenu de zone illisible : rien n’est lancé.' }; }
    if (!zone) return { ok: false, why: 'Zone inconnue : rien n’est lancé.' };
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
    if (zone.open) z.zones[id].open = { anchor: zone.anchor, content: zone.content };   // l'arrivée relit ce contenu
    log('launch', { zone: id, world: wid, dist: Math.round(dist), dur: Math.round((res.arrivalAt - Date.now()) / 1000) });
    save(); notify();
    try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
    return res;
  }

  /* ── arrivée (appelée par handleProbeReturn pour les missions de zone) ── */
  function arrive(mission, idx) {
    const z = zp(), id = mission.zone;
    const zone = z.region && z.region.zones.find(x => x.id === id);
    const c = (zone && zone.content) || (z.zones[id] && z.zones[id].open && z.zones[id].open.content) || null;
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
    if (!migrated()) return;
    oldMap = false; if (typeof goto === 'function' && !onProspect()) goto('prospect'); showNewMap(opt && opt.focus || null);
  }
  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null;
    try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
  }   // (14/11 : plus de cadre plein écran ; gardée pour les actions qui ramènent au Centre de prospection)

  /* ── règles du jeu pour poser le contenu de la région : portée actuelle, emplacement habitable ── */
  function check(sys, kind) {
    let radar = false, habitable = false;
    try { radar = !!validateAddressForTier(sys, 'radar').valid; } catch (e) {}
    if (kind === 'habitable') { try { habitable = getPlanetSlotsInSystem(sys).some(z => getCelestialTypeForSlot(sys, z) === 'habitable'); } catch (e) {} }
    return { radar, habitable };
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

  /* ══ 14/11 : toutes les parties passent sur la nouvelle carte (la partie d'Hadrien depuis le 12/11) ══
     La marque G.atlasCarte est posée une fois. Le Centre de prospection garde son bandeau, ses feuilles (Sondes, Missions,
     Rapports, Carnet, Archives) et sa croix ; seule la carte du fond change. L'ancienne reste à un bouton, au même endroit,
     le temps de la transition. */
  function pilot() { return !window.SB_ZONES_OFF; }
  const migrated = () => !window.SB_ZONES_OFF && typeof G !== 'undefined' && !!G && !!G.atlasCarte && G.atlasCarte.v >= 1;
  let oldMap = false, frameWrap = null, pendingFocus = null;
  function migrate() {
    if (typeof G === 'undefined' || !G || !G.planet || migrated() || !pilot()) return false;
    G.atlasCarte = { v: 1, since: Date.now(), mode: 'generale', etapes: { bascule: Date.now() } };
    if (G.zoneProspect && Array.isArray(G.zoneProspect.journal)) G.zoneProspect.journal = [];
    save();
    return true;
  }
  const scrP = () => document.getElementById('scr-prospect');
  const onProspect = () => { try { return typeof getCurrentScreen === 'function' ? getCurrentScreen() === 'prospect' : !!(scrP() && scrP().offsetParent); } catch (e) { return false; } };
  function frameApi() { try { const f = frameWrap && frameWrap.querySelector('iframe'); const w = f && f.contentWindow; return w && w.STARBYTE_ZONES && w.STARBYTE_ZONES.ready && w.STARBYTE_ZONES.ready() ? w.STARBYTE_ZONES : null; } catch (e) { return null; } }
  function place() {   // la carte entre le bandeau du haut et la barre du bas
    if (!frameWrap) return;
    const s = scrP(), top = s && s.querySelector('.smw-top'), nav = s && s.querySelector('.smw-nav');
    const t = top ? Math.max(0, top.getBoundingClientRect().bottom - 22) : 0, b = nav && nav.offsetParent ? Math.max(0, innerHeight - nav.getBoundingClientRect().top - 6) : 0;
    frameWrap.style.top = Math.round(t) + 'px'; frameWrap.style.bottom = Math.round(b) + 'px';
    if (s) s.style.setProperty('--sb-atlas-top', Math.round(t) + 'px');
  }
  function styleOnce() {
    if (document.getElementById('sb-atlas-css')) return;
    const st = document.createElement('style'); st.id = 'sb-atlas-css';
    st.textContent = `#scr-prospect.sb-atlas #spacemap-root,#scr-prospect.sb-atlas .smw-tools,#scr-prospect.sb-atlas .smw-hint,#scr-prospect.sb-atlas .smw-card,
      #scr-prospect.sb-atlas .pl-card,#scr-prospect.sb-atlas .pl-chip,#scr-prospect.sb-atlas .pl-fx,#scr-prospect.sb-atlas .pl-hud,#scr-prospect.sb-atlas .pl-legend,#scr-prospect.sb-atlas .pl-tac,#scr-prospect.sb-atlas .pl-up,#scr-prospect.sb-atlas .pl-xtra{display:none!important}
      #scr-prospect.sb-atlas #sb-pguide-btn,#scr-prospect.sb-atlas .smw-nav{display:none!important}
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
  // ═══ Étape 4 : voyages fixés par le serveur, corridors connus ═══
  // Le réseau candidat (mêmes ids et mêmes noms que NET dans l'Atlas et src/voyage_core.js : tools/test_voyage.mjs le vérifie)
  const CORRIDORS = [{ id: 'C1', name: 'La Vieille Voie du Linceul' }, { id: 'C2', name: 'La Piste des Glaces' }, { id: 'C3', name: 'La Voie Noire' }, { id: 'C4', name: 'La Route des Gardiens' }, { id: 'C5', name: 'La Saigne de la Couronne' }, { id: 'C6', name: 'La Ligne du Regard' }];
  const NET_PORTS = ['A-O-8715', 'A-N-8096', 'A-N-1556', 'A-K-4227', 'A-M-3340', 'A-L-8388'];
  // étape 5 : les nœuds du réseau et le tracé de chaque corridor (mêmes données que NET : tools/test_voyage.mjs le vérifie)
  const NET_NODES = { sanct: ['station', 'A-O-8715'], refuge: ['station', 'A-N-8096'], noire: ['station', 'A-N-1556'], akhet: ['station', 'A-K-4227'], crown: ['station', 'A-M-3340'], veyra: ['station', 'A-L-8388'],
    J1: ['jonction', 'A-N-9388'], J2: ['jonction', 'A-N-7586'], R1: ['relais', 'A-O-1427'], R2: ['relais', 'A-N-7595'], R3: ['relais', 'A-N-9950'], R4: ['relais', 'A-N-2190'], R5: ['relais', 'A-N-6629'],
    R6: ['relais', 'A-N-1996'], R7: ['relais', 'A-M-1979'], R8: ['relais', 'A-K-5365'], R9: ['relais', 'A-K-0757'], R10: ['relais', 'A-L-7382'] };
  const COR_PATHS = { C1: ['sanct', 'R1', 'J1'], C2: ['J1', 'refuge', 'R2', 'R3', 'R4', 'crown'], C3: ['J1', 'R5', 'noire', 'R6', 'J2'], C4: ['J2', 'akhet'], C5: ['akhet', 'R7', 'crown'], C6: ['J2', 'R8', 'R9', 'R10', 'veyra'] };
  // la ligne PNJ d'une station passe sur le corridor du même nom : du bout le plus long jusqu'à la station, sans traverser d'autre station
  function corridorChain(name, port) {
    const c = CORRIDORS.find(x => x.name === name); if (!c) return null;
    const ids = COR_PATHS[c.id], keys = ids.map(id => NET_NODES[id][1]), at = keys.indexOf(port); if (at < 0) return null;
    const st = i => NET_NODES[ids[i]][0] === 'station', before = [], after = [];
    for (let i = 0; i < at; i++) if (!st(i)) before.push(keys[i]);
    for (let i = keys.length - 1; i > at; i--) if (!st(i)) after.push(keys[i]);
    return before.length >= after.length ? before : after;
  }
  // ce qu'une balise posée sur ce nœud verrait : les prochains passages des convois PNJ (horaires communs à tous)
  function nodeTraffic(sys, hours) {
    try {
      if (!window.SBLines || !SYS_RE.test(String(sys || ''))) return [];
      const net = SBLines.network(), on = net.bySys[sys] || [], now = Date.now(), out = [];
      for (const { line, i, isPort } of on) for (const ps of SBLines.passages(line, i, now, now + (hours || 4) * 3600e3)) {
        const cv = SBLines.convoyOf(line, ps.k, ps.dir), cap = isPort ? null : SBLines.capOf(line, i, ps.dir);
        out.push({ t: ps.t, dir: ps.dir, label: cv.label, ships: cv.ships, cargo: cv.cargo, cap, port: line.port, portName: (G.hiddenPorts && G.hiddenPorts[line.port] && G.hiddenPorts[line.port].name) || null, corridor: line.corridor || null });
      }
      return out.sort((a, b) => a.t - b.t).slice(0, 6);
    } catch (e) { return []; }
  }
  // ── Conversion des lignes des six stations (une fois par partie) ──
  // Décision d'Adrien du 14/11 (« même avancement, aucun cadeau ») : sur son corridor, une ligne n'a que 1 à 4 relais au lieu
  // de 6 à 8 jalons. Ce que la partie avait sur l'ancienne ligne passe sur le corridor AU MÊME AVANCEMENT (le jalon i sur n
  // devient le relais ⌈(i+1)·m/n⌉ − 1 sur m), jamais sur le dernier relais avant un port encore inconnu :
  //   · tronçons connus → les tronçons du corridor au même avancement (un port connu révèle tout son corridor, rien de plus) ;
  //   · balises posées ou en route → le relais au même avancement, ou un relais libre en deçà ; sinon elle rentre au hangar, prête ;
  //   · signaux d'antenne → le relais au même avancement (le seul relais d'un corridor court, s'il n'y en a pas d'autre) ;
  //   · flottes en embuscade sur un ancien jalon → elles y restent et voient les convois comme avant (lines.js) ;
  // aucun port n'est découvert, aucune route n'est créée. Copie de tout ce qui bouge : atlasCarte.copie5.
  // La partie d'Hadrien (convertie le 12/11 avec l'ancienne règle) n'est pas reconvertie.
  const nodeNum = (k) => +String(k).split('-')[2];
  function convertLines() {
    const A = G.atlasCarte; if (!A || !window.SBLines) return;
    if (!A.etapes) A.etapes = {};
    if (A.etapes.lignes && A.etapes.balises) return;
    const net = SBLines.network(); if (net.mode !== 'cor') return;
    const now = Date.now(), cor = net.lines.filter(l => Array.isArray(l.oldChain) && l.oldChain.length && Array.isArray(l.chain) && l.chain.length);
    const probes = () => (typeof sbAllProbes === 'function' ? sbAllProbes() : G.probesPool || []);
    if (!G.hiddenPorts) G.hiddenPorts = {}; if (!Array.isArray(G.spottedLegs)) G.spottedLegs = []; if (!G.trafficEchoes) G.trafficEchoes = {}; if (!G.mapSeen) G.mapSeen = {};
    const oldIdx = {};   // ancien jalon → [{ line, i }]
    for (const L of cor) L.oldChain.forEach((k, i) => { (oldIdx[k] = oldIdx[k] || []).push({ line: L, i }); });
    const known = (L) => !!G.hiddenPorts[L.port];
    const prog = (L, i) => Math.max(0, Math.ceil((i + 1) * L.chain.length / L.oldChain.length) - 1);
    const capOf = (L) => known(L) ? L.chain.length - 1 : L.chain.length - 2;   // jamais le relais qui touche un port inconnu
    const where = (sys, lineId) => { const l = oldIdx[sys]; if (!l) return null; return (lineId && l.find(x => x.line.id === lineId)) || l[0]; };
    // relais candidats : celui du même avancement, puis en deçà ; port connu : aussi au-delà (plus près d'abord)
    const cands = (L, j, beacon) => { const cap = capOf(L), out = [];
      for (let d = 0; d < L.chain.length; d++) for (const k of (d ? [j - d, known(L) ? j + d : -1] : [j])) if (k >= 0 && k <= cap && !out.includes(k)) out.push(k);
      return out.map(k => L.chain[k]).filter(x => !beacon || nodeNum(x) >= 1000); };
    if (!A.copie5) A.copie5 = { at: now, regle: 'avancement',
      beacons: probes().filter(b => b && b.tier === 'beacon' && b.state === 'deployed').map(b => ({ id: b.id, sys: b.deployedSystem || null, world: b.world || null })),
      going: (G.probeMissions || []).filter(m => m && m.tier === 'beacon' && m.status === 'in_transit').map(m => ({ id: m.id, sys: m.targetCoords })),
      echoes: JSON.parse(JSON.stringify(G.trafficEchoes)), legs: JSON.parse(JSON.stringify(G.spottedLegs.filter(l => l && l.npc && cor.some(L => L.id === l.lineId)))),
      ports: Object.keys(G.hiddenPorts), routes: (G.routes || []).map(r => r && r.id) };
    const moves = [];
    if (!A.etapes.lignes) {
      // 1. tronçons connus
      for (const L of cor) {
        if (known(L)) { try { SBLines.revealLine(L, now, L.kind && L.kind.label); } catch (e) {} continue; }   // port déjà connu : son corridor entier
        const cap = capOf(L);
        for (const l of G.spottedLegs.filter(x => x && x.npc && x.lineId === L.id)) {
          const i = L.oldChain.indexOf(sysOfAddr(l.from)); if (i < 0) continue;
          const j = Math.min(prog(L, i), cap); if (j < 0 || j > L.chain.length - 2) continue;   // un tronçon qui finirait au port n'est jamais donné
          const from = L.chain[j], to = L.chain[j + 1];
          G.mapSeen[from] = G.mapSeen[from] || now; G.mapSeen[to] = G.mapSeen[to] || now;
          if (!G.spottedLegs.some(x => x && x.npc && x.lineId === L.id && x.from === from && x.to === to)) G.spottedLegs.unshift({ id: `mig-${L.id}-${from}`, lineId: L.id, from, to, pseudo: l.pseudo || (L.kind && L.kind.label) || '', at: l.at || now, npc: true, cargo: l.cargo || 'moyen', migre: true });
        }
      }
      // 2. signaux d'antenne en attente posés sur un ancien jalon (un signal traité, ou d'un port déjà connu, ne sert plus : il reste où il est)
      const portOfLine = (id) => (net.byId[id] || {}).port;
      for (const [k, e] of Object.entries({ ...G.trafficEchoes })) {
        const w = e && !e.done && !e.fromCard && where(k, e.lineId); if (!w || known(w.line)) continue;
        const L = w.line, j = Math.min(prog(L, w.i), Math.max(0, capOf(L)));
        let done = false;
        for (const t of cands(L, j, true).concat(capOf(L) < 0 ? L.chain.filter(x => nodeNum(x) >= 1000).slice(0, 1) : [])) {   // un signal invite à poser une balise : jamais sous 1000
          const cur = G.trafficEchoes[t];
          if (cur && portOfLine(cur.lineId) === L.port) { delete G.trafficEchoes[k]; done = true; break; }   // la même station y a déjà son signal
          if (cur) continue;
          G.trafficEchoes[t] = Object.assign({}, e, { migre: k }); delete G.trafficEchoes[k]; G.mapSeen[t] = G.mapSeen[t] || now; done = true; break;
        }
        // aucun relais libre : le signal ne mènerait nulle part ; il est retiré (copie dans copie5), l'antenne en captera un autre
        if (!done) { delete G.trafficEchoes[k]; moves.push({ echo: true, from: k, to: null, cor: L.corridor || null }); }
      }
      A.etapes.lignes = now; save();
    }
    // 3. balises posées (et en route) sur un ancien jalon
    const taken = new Set(probes().filter(b => b && b.tier === 'beacon' && b.state === 'deployed' && !oldIdx[sysOfAddr(b.deployedSystem)]).map(b => sysOfAddr(b.deployedSystem)));
    for (const m of G.probeMissions || []) if (m && m.tier === 'beacon' && m.status === 'in_transit' && !oldIdx[sysOfAddr(m.targetCoords)]) taken.add(sysOfAddr(m.targetCoords));
    const order = probes().filter(b => b && b.tier === 'beacon' && b.state === 'deployed' && oldIdx[sysOfAddr(b.deployedSystem)])
      .sort((a, b) => (where(sysOfAddr(b.deployedSystem)).i - where(sysOfAddr(a.deployedSystem)).i) || ((a.deployedAt || 0) - (b.deployedAt || 0)));   // les plus avancées d'abord
    for (const b of order) {
      const from = sysOfAddr(b.deployedSystem), w = where(from), L = w.line, j = Math.min(prog(L, w.i), capOf(L));
      const t = j < 0 ? null : cands(L, j, true).find(x => !taken.has(x));
      if (t) { b.deployedSystem = t; b._linesAt = now; taken.add(t); moves.push({ id: b.id, name: b.name || 'Balise', from, to: t, cor: L.corridor || null }); }
      else { b.state = 'ready'; delete b.deployedAt; delete b.deployedSystem; delete b._linesAt; moves.push({ id: b.id, name: b.name || 'Balise', from, to: null, back: true, cor: L.corridor || null }); }
    }
    for (const m of G.probeMissions || []) if (m && m.tier === 'beacon' && m.status === 'in_transit') {
      const from = sysOfAddr(m.targetCoords), w = from && where(from); if (!w) continue;
      const L = w.line, j = Math.min(prog(L, w.i), capOf(L)), t = j < 0 ? null : cands(L, j, true).find(x => !taken.has(x));
      if (t) { m.targetCoords = t; taken.add(t); moves.push({ id: m.id, name: m.probeName || 'Balise en route', from, to: t, cor: L.corridor || null, going: true }); }
    }
    // 4. flottes en embuscade sur un ancien jalon : elles restent (lines.js les fait voir comme avant), la fiche d'accueil le dit
    const legacy = ((G.fleet && G.fleet.prepared) || []).filter(f => f && f.ambush && !f.ambush.edge && f.ambush.phase !== 'returning' && oldIdx[sysOfAddr(f.ambush.system)]).map(f => ({ id: String(f.id), name: f.name || 'Flotte', sys: sysOfAddr(f.ambush.system) }));
    A.moves5 = (A.moves5 || []).concat(moves.filter(m => !m.echo)).slice(-60); A.legacy5 = legacy; A.etapes.balises = now;
    A.bilan = { at: now, moved: moves.filter(m => !m.echo && m.to && !m.going).length, going: moves.filter(m => m.going).length, back: moves.filter(m => m.back).length, legacy: legacy.length, echoesDropped: moves.filter(m => m.echo).length };
    save(); notify();
  }
  // décision du 12/11 : chaque route connue (G.routes) devient la connaissance du corridor du même nom. Rien n'est retiré :
  // les routes restent dans la partie. Une copie de ce qu'elles étaient est gardée dans la sauvegarde avant la conversion.
  function corKnown() {
    const A = G.atlasCarte; if (!A) return [];
    const names = new Set((G.routes || []).filter(r => r && r.status !== 'collapsed').map(r => r.name));
    const now = CORRIDORS.filter(c => names.has(c.name)).map(c => c.id), prev = (A.cor && A.cor.known) || [];
    const all = [...new Set([...prev, ...now])].filter(id => CORRIDORS.some(c => c.id === id));
    if (!A.etapes) A.etapes = {};
    if (!A.etapes.corridors || all.length !== prev.length) {
      if (!A.copie4) A.copie4 = { at: Date.now(), routes: (G.routes || []).map(r => ({ id: r.id, name: r.name, portSys: r.portSys || null, status: r.status || null })) };
      A.cor = { known: all, from: Object.fromEntries(all.map(id => { const c = CORRIDORS.find(x => x.id === id), r = (G.routes || []).find(x => x.name === c.name); return [id, r ? r.id : null]; })), at: Date.now() };
      if (!A.etapes.corridors) A.etapes.corridors = Date.now();
      save();
    }
    return all;
  }
  const VOYAGE_URL = 'https://elupnpdcblztpfywnhjl.supabase.co/functions/v1/voyage', VOYAGE_KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';
  let voyageTransport = null;   // tests : remplace l'appel réseau (la logique serveur est rejouée dans le test) ; jamais utilisé par le jeu
  async function voyageCall(body, timeoutMs) {
    if (voyageTransport) { try { return await voyageTransport(body); } catch (e) { return { ok: false, error: 'offline' }; } }
    let tok = null; try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); tok = a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) {}
    if (!tok) return { ok: false, error: 'not_signed_in' };
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, timeoutMs || 10000);
    try {
      const res = await fetch(VOYAGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: VOYAGE_KEY, Authorization: 'Bearer ' + tok }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      if (res.status === 404) return { ok: false, error: 'not_deployed' };
      let j = null; try { j = await res.json(); } catch (e) {}
      return j && typeof j === 'object' ? j : { ok: false, error: 'http_' + res.status };
    } catch (e) { return { ok: false, error: 'offline' }; }
    finally { clearTimeout(timer); }
  }
  const VOYAGE_WHY = { not_deployed: 'le service des voyages n’est pas encore installé au serveur', not_signed_in: 'partie non reliée au cloud', offline: 'serveur injoignable', origin_not_yours: 'monde de départ inconnu du registre', not_a_port: 'port hors du réseau', rate: 'trop de voyages cette heure-ci', address: 'adresse refusée', mission: 'mission refusée' };
  let pendingVoyage = null;
  // le tanker est parti (composition et confirmation habituelles du jeu) : le serveur fixe son chemin, ses horaires et son carburant
  async function voyageLaunch(m, pv) {
    const wcoord = (worlds().find(w => w.id === (m.world || 'home')) || {}).coord;
    m.voyage = { st: 'pending', pick: pv.pick, at: Date.now() }; save(); notify();
    const r = await voyageCall({ action: 'launch', origin: wcoord, dest: pv.port, tier: m.tier, pick: pv.pick, mission: m.id, known: corKnown() });
    const mm = (G.tankerMissions || []).find(x => x && x.id === m.id); if (!mm) return;
    if (!r || !r.ok || !r.voyage) {
      mm.voyage = { st: 'local', pick: pv.pick, why: String((r && r.error) || 'offline').slice(0, 40), at: Date.now() }; save(); notify();
      try { toast(`${mm.tankerName} part avec les horaires du jeu : ${VOYAGE_WHY[mm.voyage.why] || mm.voyage.why}`); } catch (e) {}
      return;
    }
    const v = r.voyage, dep = Date.parse(v.departed_at), arr = Date.parse(v.arrives_at), plan = v.plan || {};
    if (mm.status === 'in_transit' && dep && arr > dep) { mm.departedAt = dep; mm.arrivalAt = arr; }
    const fuel = Math.max(0, Math.round(Number(v.fuel) || 0)), diff = (mm.fuelCost || 0) - fuel;   // le jeu avait débité le coût d'aujourd'hui : on rend, ou on prend, la différence
    G.fuel = Math.max(0, (G.fuel || 0) + diff); mm.fuelCost = fuel;
    mm.voyage = { st: 'server', id: String(v.id || '').slice(0, 40), net: String(v.net_version || '').slice(0, 40), pick: v.pick === 'libre' ? 'libre' : 'cor', len: Math.round(plan.len || 0), nCor: plan.nCor | 0,
      via: (Array.isArray(plan.via) ? plan.via : []).filter(k => SYS_RE.test(k)).slice(0, 24), cors: [...new Set((plan.legs || []).map(l => l && l.cor).filter(Boolean))].slice(0, 8), at: Date.now() };
    save(); notify();
    try { toast(`${mm.tankerName} : voyage fixé par le serveur · arrivée ${new Date(mm.arrivalAt).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })} · ${fuel} carburant`); } catch (e) {}
  }
  function hookVoyage() {
    if (typeof window.launchTankerOnRoute !== 'function' || window.launchTankerOnRoute._voyageHook) return;
    const orig = window.launchTankerOnRoute;
    const h = function (routeId, tierKey, cargo, envoyIn) {
      const pv = pendingVoyage, route = (G.routes || []).find(r => r && r.id === routeId);
      const m = orig.apply(this, arguments);
      try { if (m && pv && !envoyIn && migrated() && route && route.portSys === pv.port && Date.now() - pv.at < 15 * 60000) { pendingVoyage = null; voyageLaunch(m, pv); } } catch (e) { console.warn('[carte] voyage', e); }
      return m;
    };
    h._voyageHook = true; window.launchTankerOnRoute = h;
  }
  // étape 5 : poster une flotte sur un tronçon de corridor. Décisions du 12/11 : le tronçon entier ; durée et coût comme
  // aujourd'hui (énergie selon le secteur, pas de limite de durée, rappel au port) ; trajet au rythme du vaisseau le plus lent
  // (calculé par la carte avec les règles du module des voyages). Mêmes contrôles et mêmes ordres que mpAmbushStart.
  async function postOnSegment(arg) {
    try {
      const x = arg || {}, f = ((G.fleet && G.fleet.prepared) || []).find(y => y && String(y.id) === String(x.fleetId));
      const edge = String(x.edge || ''), A = String(x.a || ''), B = String(x.b || ''), ms = Math.round(Number(x.travelMs) || 0), name = String(x.name || edge).slice(0, 60);
      const T = (m) => { try { toast(m); } catch (e) {} };
      if (!f) return T('Flotte introuvable');
      if (!/^C\d{1,2}\.\d{1,2}$/.test(edge) || !SYS_RE.test(A) || !SYS_RE.test(B) || !(ms >= 60000 && ms <= 12 * 3600e3)) return T('Tronçon inconnu');
      if (!corKnown().includes(edge.split('.')[0])) return T('Corridor inconnu : découvre d’abord sa route');
      if ((f.status || 'prepared') !== 'deployed') return T('La flotte doit être en orbite');
      if (f.repair) return T('Attends la fin des réparations');
      if (f.ambush) return T(`${f.name} est déjà en embuscade`);
      const armed = ['fregate', 'cuirasse'].some(type => ['t1', 't2', 't3'].some(t => (f.composition[type] && f.composition[type][t]) > 0));
      if (!armed) return T('Il faut des frégates ou des cuirassés pour aborder un convoi');
      if (typeof _mpOnline === 'function' && !_mpOnline()) return T('Registre hors ligne : réessaie dans un instant');
      if (typeof mpPeaceGuard === 'function' && !(await mpPeaceGuard('Poster cette flotte en embuscade'))) return;
      const sold = ((f.soldiers && f.soldiers.garde) || 0) + ((f.soldiers && f.soldiers.lourd) || 0);
      if (sold > 0) {
        if (typeof sbConfirm === 'function' && !(await sbConfirm({ title: 'Les soldats restent au sol', body: `Une embuscade est un combat spatial : on aborde des convois, on ne débarque pas.<br><br>Les <strong>${sold} soldat${sold > 1 ? 's' : ''}</strong> de ${f.name} restent à la base.`, ok: 'Continuer' }))) return;
        f.soldiers = Object.assign({}, f.soldiers, { garde: 0, lourd: 0 }); if (typeof syncFleetIntegrity === 'function') syncFleetIntegrity(f);
      }
      const orders = window.SBLines && SBLines.chooseOrders ? await SBLines.chooseOrders(null) : { mode: 'manual', players: false };
      if (!orders) return;
      const fuel = typeof computeMissionFuelCost === 'function' ? computeMissionFuelCost(f, { distanceMult: typeof _carnetDistanceMult === 'function' ? _carnetDistanceMult(A.split('-')[1]) : 3 }) : 0;
      if ((G.res.energie.v || 0) < fuel) return T(`Énergie insuffisante : ${typeof fmt === 'function' ? fmt(fuel) : fuel} requis`);
      const ordTxt = window.SBLines && SBLines.ORDER_MODES ? SBLines.ORDER_MODES[orders.mode].label + (orders.mode === 'manual' ? '' : orders.players ? ' · convois de joueurs compris' : ' · convois PNJ seulement') : '';
      const tankers = ['t1', 't2', 't3'].reduce((n, t) => n + ((f.composition.tanker && f.composition.tanker[t]) || 0), 0);
      const esc = (v) => String(v == null ? '' : v).replace(/[<>&"]/g, '');
      const ok = typeof sbConfirmWarning === 'function' ? await sbConfirmWarning('Embuscade sur un tronçon',
        `Poster <strong>${esc(f.name)}</strong> sur le tronçon <strong>${esc(name)}</strong> ?<br><br>Trajet ${Math.round(ms / 60000)} min, au rythme de son vaisseau le plus lent · ${typeof fmt === 'function' ? fmt(fuel) : fuel} énergie.`
        + (ordTxt ? `<br>Ordres : <strong>${ordTxt}</strong>` : '')
        + `<br><br>Une fois en place, elle intercepte tout convoi qui <strong>entre</strong> sur ce tronçon, par l'un ou l'autre bout. Un convoi déjà entré quand elle arrive lui échappe.`
        + (tankers ? '' : `<br><br><span style="color:#ffc864">Sans tanker dans la flotte, aucun butin ne pourra être emporté.</span>`)
        + `<br><br><em>Loin de ta planète, cette flotte ne la protège plus.</em>`, 'Partir en embuscade') : true;
      if (!ok) return;
      const now = Date.now();
      G.res.energie.v = Math.max(0, (G.res.energie.v || 0) - fuel);
      if (typeof mpPeaceRenounce === 'function') mpPeaceRenounce();
      f.status = 'in_mission'; f.missionStartedAt = now; f.missionEndsAt = null; f.missionTargetId = null;
      f.ambush = { system: A, edge, a: A, b: B, segName: name, beaconId: null, phase: 'going', world: f.world || G.activeWorld || 'home', departedAt: now, arrivesAt: now + ms, travelMs: ms, hold: {}, mpAmbushId: null, orders, routeId: null, routeChain: null };
      if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop();
      T(`${f.name} part en embuscade sur ${name} · ${Math.round(ms / 60000)} min`);
      save(); notify();
    } catch (e) { console.warn('[carte] embuscade sur un tronçon', e); }
  }
  function hookGame() {
    if (migrated()) hookVoyage();
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
  // 14/11 : fiche d'accueil, une fois par partie migrée (pas pour la partie d'Hadrien, ni pour un joueur qui n'a pas encore
  // ouvert le Centre de prospection : il n'a jamais vu l'ancienne carte). Jamais par-dessus une autre fenêtre ou le tutoriel.
  let welcomeOpen = false;
  function welcome() {
    const A = G.atlasCarte; if (!A || A.mode !== 'generale' || A.accueil || welcomeOpen) return;
    if (!(A.etapes && A.etapes.balises)) return;
    // un nouveau joueur (rien encore fait au Centre de prospection) n'a jamais connu l'ancienne carte : pas de fiche
    const played = (G.probeReports || []).length || (G.probeMissions || []).length || (G.tankerMissions || []).length || (G.routes || []).length
      || Object.keys(G.knownSystems || {}).length > 1 || Object.keys(G.trafficEchoes || {}).length || (A.moves5 || []).length;
    let locked = false; try { locked = typeof prospectLocked === 'function' && prospectLocked(); } catch (e) {}
    if (!played || locked) { A.accueil = played ? 'sans-centre' : 'nouveau'; save(); return; }
    if (typeof sbConfirm !== 'function') return;
    const mo = document.getElementById('sb-modal-overlay'); if (mo && !mo.classList.contains('hidden')) return;   // une autre question est ouverte
    try { const c = document.getElementById('sb-coach'); if (c && c.offsetParent && getComputedStyle(c).display !== 'none') return; } catch (e) {}   // le guide du tutoriel parle : plus tard
    try { if (typeof getCurrentScreen === 'function' && !['planet', 'prospect', 'dashboard'].includes(getCurrentScreen())) return; } catch (e) {}
    const b = A.bilan || {}, esc = (v) => String(v == null ? '' : v).replace(/[<>&"]/g, ''), pl = (n, a, z) => n + ' ' + (n > 1 ? z : a);
    const parts = ['Le Centre de prospection a une nouvelle carte : l’<strong>Atlas</strong> en 3D et la vue <strong>Tactique</strong>. Tes mondes, tes flottes, tes routes, tes balises, tes rapports et les commandants que tu connais y sont.'];
    parts.push('Les convois des six grandes stations passent maintenant par des <strong>corridors</strong>, plus courts que les anciennes lignes. Tu y gardes ton avancement : aucun port n’a été donné, aucun n’a été retiré.');
    const bl = [];
    if (b.moved) bl.push(pl(b.moved, 'balise posée sur un relais', 'balises posées sur des relais') + ', au même avancement');
    if (b.going) bl.push(pl(b.going, 'balise en route redirigée', 'balises en route redirigées'));
    if (b.back) bl.push(pl(b.back, 'balise rentrée au hangar, prête', 'balises rentrées au hangar, prêtes') + ' (plus de relais libre sur leur ligne)');
    if (bl.length) parts.push(bl.join(' · ') + '. Le détail est dans « Mes balises ».');
    for (const f of (A.legacy5 || [])) parts.push('<strong>' + esc(f.name) + '</strong> reste en embuscade sur l’ancien jalon ' + esc(f.sys) + ' et y voit les convois comme avant. Pour la poster sur un tronçon de corridor, rappelle-la.');
    parts.push('L’ancienne carte reste à un bouton, au même endroit, le temps de la transition.');
    welcomeOpen = true; A.accueil = Date.now(); save();
    Promise.resolve(sbConfirm({ title: 'Nouvelle carte', body: parts.map(x => '<p style="margin:0 0 10px">' + x + '</p>').join(''), confirmLabel: 'Voir la carte', cancelLabel: 'Plus tard' }))
      .then(ok => { welcomeOpen = false; if (ok) open(); }).catch(() => { welcomeOpen = false; });
  }
  function migTick() {
    try {
      if (typeof G === 'undefined' || !G || !G.planet) return;
      migrate(); hookGame();
      if (!migrated()) return;
      if (G.zoneProspect && Array.isArray(G.zoneProspect.journal) && G.zoneProspect.journal.length) { G.zoneProspect.journal = []; save(); }   // 14/11 : journal des mesures d'essai retiré
      try { convertLines(); } catch (e) { console.warn('[carte] lignes → corridors', e); }
      try { welcome(); } catch (e) { console.warn('[carte] accueil', e); }
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
    // étape 1 de la migration : les systèmes balayés et leurs 3 emplacements (règle du jeu, rien n'est retiré ni déplacé)
    const systems = [];
    try {
      for (const [k, x] of Object.entries(G.knownSystems || {})) {
        if (!x || systems.length >= 3000) continue;
        const sys = SYS_RE.test(k) ? k : `${x.cluster || 'A'}-${x.sector}-${String(x.system).padStart(4, '0')}`;
        if (!SYS_RE.test(sys)) continue;
        systems.push({ sys, at: x.discoveredAt || null, mine: !!x.isMine, planets: (x.planets || []).map(p => ({ coord: p.coord, slot: p.slot, type: p.type, name: p.name || '', desc: p.desc || '', player: p.playerName || null, bot: !!p.isBot })) });
      }
    } catch (e) {}
    const tags = {}; try { for (const [k, v] of Object.entries(G.systemTags || {})) if (v === 'star' || v === 'skip') tags[k] = v; } catch (e) {}
    let cmd = [], hosted = [], incoming = [], posts = { mine: [], others: [] }, fleets = [];
    try { fleets = ((G.fleet && G.fleet.prepared) || []).filter(f => f && (f.status || 'prepared') === 'deployed' && !f.repair).slice(0, 20).map(f => { const comp = {}; for (const k of ['cuirasse', 'fregate', 'tanker']) { const c = (f.composition && f.composition[k]) || {}; comp[k] = { t1: c.t1 || 0, t2: c.t2 || 0, t3: c.t3 || 0 }; }
      return { id: String(f.id).slice(0, 80), name: String(f.name || 'Flotte').slice(0, 40), world: f.world || 'home', comp, armed: ['fregate', 'cuirasse'].some(k => comp[k].t1 + comp[k].t2 + comp[k].t3 > 0) }; }); } catch (e) {}
    try { cmd = commanders(); } catch (e) { console.warn('[carte] commandants', e); }
    try { hosted = (G.mpGarHosted || []).filter(g => g && !g.left_at).map(g => ({ pseudo: String(g.owner_pseudo || '').slice(0, 24), fleet: String(g.fleet_name || '').slice(0, 40), host: PLANET_RE.test(g.host_address || '') ? g.host_address : null, def: Math.max(0, Math.floor(Number(g.def) || 0)), arrivesAt: Date.parse(g.arrives_at) || null })); } catch (e) {}
    try { const L = typeof _mpIncoming !== 'undefined' && Array.isArray(_mpIncoming) ? _mpIncoming : []; incoming = L.filter(r => r && Date.parse(r.arrives_at) > Date.now()).map(r => ({ pseudo: String(r.attacker_pseudo || '').slice(0, 24), fleet: String(r.fleet_name || '').slice(0, 40), at: Date.parse(r.arrives_at), target: PLANET_RE.test(r.defender_address || '') ? r.defender_address : null })); } catch (e) {}
    try {
      for (const m of G.tankerMissions || []) if (m && m.kind === 'route_post' && ['in_transit', 'posted'].includes(m.status) && SYS_RE.test(m.targetCoords || '')) posts.mine.push({ sys: m.targetCoords, tanker: String(m.tankerName || 'Tanker').slice(0, 40), status: m.status });
      for (const o of G._mpPosts || []) if (o && SYS_RE.test(o.system || '')) posts.others.push({ sys: o.system, pseudo: String(o.pseudo || '').slice(0, 24), met: !!o.met });
    } catch (e) {}
    return { ports, routes, systems, tags, cmd, hosted, incoming, posts, fleets };
  }
  // étape 3 : les commandants que la partie connaît (mondes balayés, relations, alliance) et ce qui te lie à chacun.
  // Tout vient des fonctions du jeu (registre relevé chaque minute) : aucune donnée n'est convertie.
  const PLANET_RE = /^[A-Z]{1,2}-[A-Z]-\d{4}-\d{1,2}$/;
  function commanders() {
    const by = new Map(), mine = new Set(worlds().map(w => w.coord));
    const put = (addr, pseudo, x) => { addr = String(addr || '').toUpperCase(); if (!PLANET_RE.test(addr) || !pseudo || mine.has(addr)) return;
      let c = by.get(addr); if (!c) { c = { addr, coord: addr, sys: addr.split('-').slice(0, 3).join('-'), pseudo: String(pseudo).slice(0, 24), planet: '', level: null, bot: false, real: false, known: false }; by.set(addr, c); }
      Object.assign(c, x || {}); };
    for (const s of Object.values(G.knownSystems || {})) for (const p of (s && s.planets) || []) if (p && p.playerName) put(p.mpAddress || p.coord, p.playerName, { planet: String(p.customName || p.name || '').slice(0, 40), level: p.playerLevel || null, bot: !!p.isBot, real: !!p.isReal, known: true, coord: PLANET_RE.test(p.coord || '') ? p.coord : (p.mpAddress || p.coord) });
    for (const r of G.mpRelations || []) for (const a of (r && r.addresses) || []) put(a, r.pseudo, { real: true });
    const A = typeof mpAlly === 'function' ? mpAlly() : null;
    try { for (const m of (A && A.members) || []) if (m && !m.me) for (const a of (m.addresses && m.addresses.length ? m.addresses : [m.address])) put(a, m.pseudo, { real: true }); } catch (e) {}
    const out = [];
    for (const c of by.values()) {
      if (out.length >= 300) break;
      const call = (fn, ...a) => { try { return typeof window[fn] === 'function' ? window[fn](...a) : null; } catch (e) { return null; } };
      const en = call('mpRelWith', c.addr, c.pseudo, 'enemy'), tr = call('mpRelWith', c.addr, c.pseudo, 'trade'), pk = call('mpPactWith', c.addr, c.pseudo), mem = call('mpAllyMember', c.addr, c.pseudo), inc = c.real ? call('_mpEmbInFor', c.addr) : null;
      c.rel = { enemy: !!en, enemyByMe: !!(en && en.byMe), trade: !!tr && !mem, ally: mem ? String((A && A.alliance && A.alliance.name) || 'ton alliance').slice(0, 24) : null, pact: pk ? (pk.status === 'active' ? 'active' : pk.mine ? 'proposed-mine' : 'proposed') : null };
      c.orbit = (G.tankerMissions || []).filter(m => m && m.status === 'orbital_relay' && m.mpTarget && m.mpTarget.address === c.addr).map(m => String(m.tankerName || 'Tanker').slice(0, 40));
      c.inc = inc ? String(inc.tanker || 'un vaisseau').slice(0, 40) : null;
      c.gar = ((G.fleet && G.fleet.prepared) || []).filter(f => f && f.garrison && f.garrison.address === c.addr).map(f => ({ id: String(f.id).slice(0, 80), name: String(f.name || 'Flotte').slice(0, 40), phase: f.garrison.phase, at: f.garrison.phase === 'going' ? f.garrison.arrivesAt : f.garrison.phase === 'returning' ? f.garrison.returnsAt : null }));
      c.embassy = c.real && typeof openEmbassy === 'function' && !!(c.orbit.length || c.inc || mem);
      c.canGarrison = !!mem && typeof mpGarrisonStart === 'function';
      out.push(c);
    }
    return out;
  }
  // étape 2 : les balises, avec les règles et les fonctions du jeu (quota, hangar du monde de départ, rappel avec ses avertissements)
  const sysOfAddr = (a) => (String(a || '').toUpperCase().match(/^([A-Z]+-[A-Z]-\d{4})/) || [])[1] || null;
  function beacons() {
    const all = (typeof sbAllProbes === 'function' ? sbAllProbes() : (G.probesPool || []));
    const list = [];
    for (const b of all) if (b && b.tier === 'beacon' && b.state === 'deployed') {
      const sys = sysOfAddr(b.deployedSystem); if (!sys) continue;
      let routes = []; try { routes = window.SBLines && SBLines.routesBalisedBy ? SBLines.routesBalisedBy(sys).map(r => r.name) : []; } catch (e) {}
      list.push({ id: b.id, name: b.name || 'Balise', sys, at: b.deployedAt || null, n: b.detectionCount || 0, world: b.world || 'home', routes });
    }
    const going = (G.probeMissions || []).filter(m => m && m.tier === 'beacon' && m.status === 'in_transit').map(m => ({ id: m.id, sys: sysOfAddr(m.targetCoords), arrivalAt: m.arrivalAt, world: m.world || 'home' })).filter(x => x.sys);
    const cfg = (typeof PROBE_TIER_CONFIG !== 'undefined' && PROBE_TIER_CONFIG.beacon) || {};
    const status = {};
    for (const w of worlds()) {
      let st = { ok: false, build: false, why: '' };
      try { st = inWorld(w.id, () => (typeof _probeTierStatus === 'function' ? _probeTierStatus('beacon') : st)); } catch (e) {}
      let n = 0; try { n = inWorld(w.id, () => (G.probesPool || []).filter(b => b.tier === 'beacon' && b.state === 'deployed').length); } catch (e) {}
      status[w.id] = { ok: !!st.ok, build: !!st.build, why: st.why || '', deployed: n };
    }
    return { list, going, quota: cfg.quotaMax || 3, cost: { metal: (cfg.cost && cfg.cost.metal) || 300, cristal: (cfg.cost && cfg.cost.cristal) || 100 }, status, posts: (G.tankerMissions || []).filter(m => m && m.kind === 'route_post' && ['in_transit', 'posted'].includes(m.status)).map(m => sysOfAddr(m.targetCoords)).filter(Boolean) };
  }
  // la balise peut-elle partir du monde choisi vers ce système ? Même contrôle que le lancement du jeu (format, portée du Laboratoire)
  function beaconCheck(sys, wid) {
    sys = sysOfAddr(sys); if (!sys || !SYS_RE.test(sys)) return { ok: false, why: 'Système inconnu.' };
    if (typeof validateAddressForTier !== 'function') return { ok: true };
    try { const v = inWorld(wid || G.activeWorld || 'home', () => validateAddressForTier(sys, 'beacon')); return v && v.valid ? { ok: true } : { ok: false, why: (v && v.error) || 'Cible refusée.' }; } catch (e) { return { ok: true }; }
  }
  // les raccourcis du Centre de prospection (Sondes, Missions, Rapports, Carnet, Archives) : leurs icônes et leurs pastilles, lus dans le jeu
  function navState() {
    const out = [];
    try {
      for (const b of document.querySelectorAll('#scr-prospect .smw-nav button[data-t]')) {
        if (b.style.display === 'none') continue;
        const svg = b.querySelector('svg'), lab = b.querySelector('span'), bd = b.querySelector('.smw-mb, [id$="-badge"]');
        const n = bd && getComputedStyle(bd).display !== 'none' ? (parseInt(bd.textContent, 10) || 0) : 0;
        out.push({ t: b.dataset.t, label: lab ? lab.textContent.trim() : b.dataset.t, svg: svg ? svg.outerHTML : '', n });
      }
    } catch (e) {}
    return out;
  }
  function gameAct(kind, arg) {
    log('action', { kind, arg });
    if (kind === 'port') { if (typeof crownEnter !== 'function') return { ok: false, why: 'Entrée indisponible.' }; crownEnter(arg); return { ok: true }; }
    if (kind === 'route-tanker') { if (typeof openTankerComposeForRoute !== 'function') return { ok: false, why: 'Envoi indisponible.' }; openTankerComposeForRoute(arg); return { ok: true }; }
    if (kind === 'oldmap') { showOldMap(arg || null); return { ok: true }; }
    // étape 3 : fiche, ambassade, sondage d'un commandant ; garnison chez un allié ; la flotte dans le jeu
    if (kind === 'cmd-sheet' || kind === 'resond') { const c = String(arg || '').toUpperCase(); if (!PLANET_RE.test(c)) return { ok: false, why: 'Adresse inconnue.' }; const fn = kind === 'cmd-sheet' ? 'openPlanetDetail' : 'resondPlanet'; if (typeof window[fn] !== 'function') return { ok: false, why: 'Indisponible.' }; window[fn](c); return { ok: true }; }
    if (kind === 'embassy' || kind === 'garrison') { const a = String(arg || '').toUpperCase(); if (!PLANET_RE.test(a)) return { ok: false, why: 'Adresse inconnue.' }; const fn = kind === 'embassy' ? 'openEmbassy' : 'mpGarrisonStart'; if (typeof window[fn] !== 'function') return { ok: false, why: 'Indisponible.' }; Promise.resolve(window[fn](a)).then(() => notify()).catch(() => notify()); return { ok: true }; }
    if (kind === 'garrison-recall' || kind === 'fleet') { const id = String(arg || ''); const f = ((G.fleet && G.fleet.prepared) || []).find(x => x && String(x.id) === id); if (!f) return { ok: false, why: 'Flotte introuvable.' };
      if (kind === 'fleet') { if (typeof openFleetDetail !== 'function') return { ok: false, why: 'Indisponible.' }; openFleetDetail(f.id); return { ok: true }; }
      if (typeof mpGarrisonRecall !== 'function') return { ok: false, why: 'Indisponible.' }; Promise.resolve(mpGarrisonRecall(f.id)).then(() => { save(); notify(); }).catch(() => notify()); return { ok: true }; }
    if (kind === 'voyage') {
      const port = String(arg && arg.port || ''), pick = arg && arg.pick === 'libre' ? 'libre' : 'cor';
      if (!NET_PORTS.includes(port)) return { ok: false, why: 'Ce port n’est pas sur le réseau.' };
      const route = (G.routes || []).find(r => r && r.portSys === port && r.status !== 'collapsed');
      if (!route) return { ok: false, why: 'Route inconnue : découvre d’abord ce port.' };
      if (typeof openTankerComposeForRoute !== 'function') return { ok: false, why: 'Envoi indisponible.' };
      hookVoyage(); pendingVoyage = { port, pick, at: Date.now() }; openTankerComposeForRoute(route.id); return { ok: true };
    }
    if (kind === 'ambush-seg') { postOnSegment(arg); return { ok: true }; }
    if (kind === 'fleet-screen') { if (typeof goto === 'function') goto('fleet'); return { ok: true }; }
    if (kind === 'tab') { if (!/^(sondes|missions|rapports|carnet|archives)$/.test(String(arg))) return { ok: false, why: 'Onglet inconnu.' }; window.setProspectTab(arg); return { ok: true }; }
    if (kind === 'beacon-place') {
      const sys = sysOfAddr(arg && arg.sys), wid = (arg && arg.world) || G.activeWorld || 'home';
      if (!sys || !SYS_RE.test(sys)) return { ok: false, why: 'Système inconnu.' };
      let m = null; try { m = inWorld(wid, () => launchProbe('beacon', sys, 'local', false)); } catch (e) { console.warn('[carte] balise', e); }
      if (!m) return { ok: false, why: '' };   // le jeu a déjà dit pourquoi
      save(); notify(); try { toast('Balise en route vers ' + sys); } catch (e) {}
      return { ok: true };
    }
    if (kind === 'beacon-recall') {
      if (!(window.SBMap && SBMap.recallBeacon)) return { ok: false, why: 'Rappel indisponible.' };
      Promise.resolve(SBMap.recallBeacon(String(arg || ''))).then(() => { save(); notify(); }).catch(() => notify());
      return { ok: true };
    }
    if (kind === 'beacon-build') { if (typeof openProbeDetail === 'function') openProbeDetail('beacon'); return { ok: true }; }
    if (kind === 'post-here') {
      const sys = sysOfAddr(arg); if (!sys || typeof launchRoutePost !== 'function') return { ok: false, why: 'Poste indisponible.' };
      launchRoutePost(null, sys); save(); notify(); return { ok: true };
    }
    if (kind === 'tag') {
      const key = String(arg && arg.key || ''), v = arg && arg.v;
      if (!SYS_RE.test(key) || (v !== 'star' && v !== 'skip')) return { ok: false, why: 'Marque inconnue.' };
      if (!G.systemTags) G.systemTags = {};
      if (G.systemTags[key] === v) delete G.systemTags[key]; else G.systemTags[key] = v;
      if (!G.mapSeen) G.mapSeen = {};
      if (!G.mapSeen[key]) G.mapSeen[key] = Date.now();
      save(); notify();
      if (G.systemTags[key] === 'skip') { try { toast('Système sans intérêt : ses rapports sont rangés aux archives'); } catch (e) {} }
      return { ok: true, v: G.systemTags[key] || null };
    }
    return { ok: false, why: 'Action inconnue' };
  }

  window.SBZones = {
    allowed, why, open, close, state, launch, arrive, act, check, models, migrated, pilot, known, gameAct, beaconCheck, corridorChain, nodeTraffic, voyageTransport: (fn) => { voyageTransport = typeof fn === 'function' ? fn : null; }, showOldMap, showNewMap, embedded: () => !!frameWrap, sigAction: (id, wid) => sigAction((G.signatures || {})[id], wid),
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    grid: GRID,
  };

})();
