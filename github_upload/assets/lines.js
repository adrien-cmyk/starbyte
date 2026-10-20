/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Lignes PNJ & routes cachées (E1 · 14/10/2026)
   Cf. GDD « Routes & pistes v1 » (claude/starbyte_GDD_routes_pistes_v1.md).

   Le monde a un réseau de routes cachées, le même pour tous les joueurs :
   chaque port caché (les docks des cartes de route) est relié par 1 ou 2 lignes,
   une chaîne de systèmes de passage (jalons). Des convois PNJ y circulent selon un
   horaire déterministe : tous les appareils calculent les mêmes passages au même instant.

   · Une balise posée sur un jalon voit passer les convois et relève leur CAP (jalon suivant) :
     le tronçon entre sur la carte ; tronçon après tronçon, on remonte jusqu'au port caché.
   · L'antenne capte de temps en temps un « écho de trafic » : un jalon où poser une balise.
   · Les contacts PNJ tirés au hasard (« bots ») disparaissent.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SBLines) return;

  const PLACE_SECTORS = ['M', 'N', 'O'];        // un lieu caché par secteur de la saison de test
  const EPOCH = Date.UTC(2026, 9, 1);           // origine commune des horaires
  const WINDOW_MS = 12 * 60 * 1000;             // fenêtre d'interception d'un passage (comme les balises)
  const ECHO_EVERY_MS = 3 * 3600 * 1000;        // un écho de trafic toutes les 3 h au plus
  const KINDS = {
    hidden_freeport:   { key: 'marchand',   label: 'Convoi marchand',      cargo: ['moyen', 'lourd'], tiers: [2, 3], escort: 'escorte légère' },
    asteroid_bar:      { key: 'contrebande', label: 'Convoi de contrebande', cargo: ['léger', 'moyen'], tiers: [1, 2], escort: 'sans escorte' },
    abandoned_station: { key: 'recup',      label: 'Récupérateurs',        cargo: ['moyen'],          tiers: [1, 2], escort: 'sans escorte' },
    derelict_carrier:  { key: 'arme',       label: 'Convoi armé',          cargo: ['lourd'],          tiers: [3],    escort: 'escorte lourde' },
    pilgrim_stop:      { key: 'pelerins',   label: 'Pèlerins',             cargo: ['léger'],          tiers: [1],    escort: 'sans escorte' },
    imperial_convoy:   { key: 'imperial',   label: 'Convoi impérial',      cargo: ['lourd'],          tiers: [3],    escort: 'escorte lourde' },
  };

  // 15/10 (Adrien) : The Drifting Crown, la station pirate, prend la place du lieu du secteur M (l'ancien Relais d'Erebus) ;
  // ses deux lignes : des marchands et des contrebandiers
  const CROWN_DOCK_ID = 'dock-37oe89';
  const CROWN_KINDS = ['hidden_freeport', 'asteroid_bar'];
  // 15/10 (soir) : le Sanctuaire du Linceul des Cendres, bastion impérial, est le lieu du secteur O ;
  // ses lignes : des pèlerins et des convois impériaux (lourds, bien escortés)
  const SANCT_DOCK_ID = 'dock-otqflf';
  const NOIRE_DOCK_ID = 'dock-uguzli';
  // 19/10 (Adrien) : le Refuge de Brest, la station-mammouth, prend la place de l'ancien « Sanctuaire d'Erebus » (A-N-8096) ;
  // quatrième lieu caché, second du secteur N, ajouté après les trois autres : leurs lignes et leurs positions ne bougent pas
  const REFUGE_DOCK_ID = 'dock-wc15ki';
  const EXTRA_PLACES = [REFUGE_DOCK_ID];
  const STATION_PORTS = {
    // 19/10 (Adrien) : une seule ligne par station (keep) — le Linceul garde ses deux lignes pour l'instant
    [CROWN_DOCK_ID]: { kinds: CROWN_KINDS, route: 'La Saigne de la Couronne', mood: 'grasse', flag: '_linesCrown', keep: [0] },
    [SANCT_DOCK_ID]: { kinds: ['pilgrim_stop', 'imperial_convoy'], route: 'La Vieille Voie du Linceul', mood: 'imperiale', flag: '_linesSanct' },
    // 16/10 : la Station O'Neill Série Noire, station furtive de la Confédération, est le lieu du secteur N ; ses lignes : convois armés et convois impériaux
    [NOIRE_DOCK_ID]: { kinds: ['derelict_carrier', 'imperial_convoy'], route: 'La Voie Noire', mood: 'noire', flag: '_linesNoire', keep: [0] },
    // 19/10 : le Refuge de Brest, halte des pèlerins dans le champ de glace ; une seule ligne, celle des pèlerins
    [REFUGE_DOCK_ID]: { kinds: ['pilgrim_stop', 'hidden_freeport'], route: 'La Piste des Glaces', mood: 'morte', flag: '_linesRefuge2', keep: [0] },
  };

  /* ── hachage déterministe (mêmes résultats sur tous les appareils) ── */
  function h32(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rngOf(seed) { let a = h32(seed) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ── le réseau ── */
  let _net = null;
  function network() {
    if (_net) return _net;
    const lines = [], bySys = {}, ports = {}, retired = {};
    const hintsP = (typeof HINT_PREFIXES !== 'undefined') ? HINT_PREFIXES : [];
    const hintsB = (typeof HINT_BODIES !== 'undefined') ? HINT_BODIES : [];
    // 14/10 (Adrien) : 3 lieux cachés au début, pas 40 — un par secteur de la saison (M, N, O),
    // choisis parmi les destinations des cartes de route, toujours les mêmes pour tout le monde.
    const seen = new Set(), all = [];
    for (const p of hintsP) for (const b of hintsB) {
      const hint = `${p} ${b}`;
      let dock;
      try { dock = (typeof generateDockForRoute === 'function') ? generateDockForRoute({ destinationHint: hint }) : null; } catch (e) { dock = null; }
      if (!dock || seen.has(dock.id)) continue;
      seen.add(dock.id);
      const port = (typeof mpDockSystem === 'function') ? mpDockSystem(dock) : null;
      if (port) all.push({ dock, hint, port });
    }
    const picked = [];
    for (const sec of PLACE_SECTORS) {
      const c = all.filter(x => x.port.split('-')[1] === sec).sort((x, y) => h32('lieu:' + x.dock.id) - h32('lieu:' + y.dock.id))[0];
      if (c) picked.push(c);
    }
    for (const id of EXTRA_PLACES) { const c = all.find(x => x.dock.id === id); if (c && !picked.includes(c)) picked.push(c); }   // 19/10 : lieux en plus, après les trois premiers
    for (const { dock, hint, port } of picked) {
      const [cl, sec, num] = port.split('-');
      ports[port] = { sys: port, dockId: dock.id, name: dock.name, type: dock.type, typeLabel: dock.typeLabel || dock.sub || '', hint, lines: [] };
      const nLines = 2;                                     // deux lignes mènent à chaque lieu
      for (let j = 0; j < nLines; j++) {
        const r = rngOf('line:' + dock.id + ':' + j);
        const n = 6 + Math.floor(r() * 3);                  // 6 à 8 jalons avant le port
        const chain = [];
        let guard = 0;
        while (chain.length < n && guard++ < 200) {
          const k = `${cl}-${sec}-${1000 + Math.floor(r() * 9000)}`;
          if (k !== port && !chain.includes(k) && !ports[k]) chain.push(k);
        }
        const kind = STATION_PORTS[dock.id] ? KINDS[STATION_PORTS[dock.id].kinds[j]] : (KINDS[dock.type] || KINDS.hidden_freeport);
        const line = {
          id: dock.id + '-' + j, dockId: dock.id, port, chain, kind, j,
          period: (80 + Math.floor(r() * 70)) * 60000,      // un départ toutes les 80 à 150 min
          travel: (40 + Math.floor(r() * 30)) * 60000,      // 40 à 70 min de bout en bout
          offset: Math.floor(r() * 150) * 60000,
          sector: sec,
        };
        const keep = STATION_PORTS[dock.id] && STATION_PORTS[dock.id].keep;
        if (keep && !keep.includes(j)) { retired[line.id] = line; continue; }   // ligne fermée (19/10) : gardée pour la conversion
        lines.push(line); ports[port].lines.push(line.id);
        chain.forEach((s, i) => { (bySys[s] = bySys[s] || []).push({ line, i }); });
        (bySys[port] = bySys[port] || []).push({ line, i: n, isPort: true });
      }
    }
    _net = { lines, bySys, ports, retired, byId: Object.fromEntries(lines.map(l => [l.id, l])) };
    return _net;
  }

  /* ── horaires : passages d'une ligne à un jalon entre t0 et t1 ── */
  // aller (vers le port) : départ à dep, au jalon i à dep + travel × i/n ; retour : départ du port à dep + period/2
  function passages(line, i, t0, t1) {
    const n = line.chain.length, out = [];
    for (const dir of ['out', 'in']) {
      const frac = dir === 'out' ? i / n : (n - i) / n;
      const shift = (dir === 'out' ? 0 : line.period / 2) + line.travel * frac;
      const base = EPOCH + line.offset + shift;
      let k = Math.ceil((t0 - base) / line.period);
      for (let t = base + k * line.period; t <= t1; k++, t = base + k * line.period) {
        if (t > t0) out.push({ t, k, dir });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
  function capOf(line, i, dir) {
    const n = line.chain.length;
    if (dir === 'out') return i < n - 1 ? line.chain[i + 1] : (i === n - 1 ? line.port : null);
    return i > 0 ? line.chain[i - 1] : null;   // retour : vers l'origine (au-delà, il se perd dans les marges)
  }
  function convoyOf(line, k, dir) {
    const r = rngOf(`cv:${line.id}:${k}:${dir}`);
    const kd = line.kind;
    const n = 2 + Math.floor(r() * 4);
    return {
      label: kd.label, kindKey: kd.key, ships: n,
      tier: kd.tiers[Math.floor(r() * kd.tiers.length)],
      // vers le lieu caché, les cales sont pleines ; au retour, plus légères (l'indice pour savoir où remonter)
      cargo: dir === 'out' ? (kd.cargo[kd.cargo.length - 1] === 'léger' ? 'moyen' : kd.cargo[kd.cargo.length - 1]) : 'léger',
      escort: kd.escort,
    };
  }

  /* ── état du joueur ── */
  const SYS = /^[A-Z]-[A-Z]-\d{4}$/;
  // noms venus d'autres commandants (routes offertes, vendues) : jamais de balisage HTML
  const clean = (x, n) => String(x == null ? '' : x).replace(/[<>&"`\\]/g, '').slice(0, n || 60);
  const sysOf = (c) => { const m = String(c || '').match(/^[A-Z]-[A-Z]-\d{4}/); return m ? m[0] : null; };
  function state() {
    if (!G.lineObs || typeof G.lineObs !== 'object') G.lineObs = {};       // lineId → { n, last, dirs:{out,in}, systems:[…] }
    if (!G.trafficEchoes || typeof G.trafficEchoes !== 'object') G.trafficEchoes = {};   // sys → { lineId, at }
    if (!G.hiddenPorts || typeof G.hiddenPorts !== 'object') G.hiddenPorts = {};         // port sys → { dockId, name, type, at }
    if (!Array.isArray(G.spottedLegs)) G.spottedLegs = [];
    // 14/10 : passage de 40 lieux à 3 — on oublie ce qui appartenait aux lignes qui n'existent plus
    if (G._linesNet === 3) {   // 19/10 : une ligne par station — ce qui était connu de la ligne fermée passe sur la ligne gardée
      const n = network();
      for (const old of Object.values(n.retired)) {
        const known = new Set(G.spottedLegs.filter(l => l.npc && l.lineId === old.id).flatMap(l => [l.from, l.to]));
        for (const [k, e] of Object.entries(G.trafficEchoes)) if (e.lineId === old.id) known.add(k);
        let depth = 0;
        for (let i = old.chain.length - 1; i >= 0; i--) { if (known.has(old.chain[i])) depth = old.chain.length - i; else if (depth) break; }
        if (!depth && known.size) depth = 1;
        const keep = n.byId[n.ports[old.port].lines[0]];
        if (!depth || !keep) continue;
        const ch = keep.chain, start = Math.max(0, ch.length - depth);
        if (!G.mapSeen) G.mapSeen = {};
        for (let i = start; i < ch.length; i++) {
          const to = i < ch.length - 1 ? ch[i + 1] : keep.port;
          if (!G.spottedLegs.some(l => l.npc && l.lineId === keep.id && l.from === ch[i] && l.to === to))
            G.spottedLegs.unshift({ id: `cv19-${keep.id}-${i}`, lineId: keep.id, from: ch[i], to, pseudo: keep.kind.label, at: Date.now(), npc: true, cargo: 'moyen' });
          G.mapSeen[ch[i]] = G.mapSeen[ch[i]] || Date.now();
        }
      }
      G._linesNet = 2;   // repasse par le nettoyage ci-dessous
    }
    if (G._linesNet !== 3 && G._linesNet !== 4) {
      const n = network();
      for (const k of Object.keys(G.hiddenPorts)) if (!n.ports[k]) delete G.hiddenPorts[k];
      for (const [k, e] of Object.entries(G.trafficEchoes)) if (!n.byId[e.lineId]) delete G.trafficEchoes[k];
      for (const k of Object.keys(G.lineObs)) if (!n.byId[k]) delete G.lineObs[k];
      G.spottedLegs = G.spottedLegs.filter(l => !l.npc || n.byId[l.lineId]);
      G._linesNet = 4;
    }
    migrateCrown();
    if (!G._linesRoutes) { G._linesRoutes = 1; for (const k of Object.keys(G.hiddenPorts)) { try { ensureRoute(k); } catch (e) {} } }
  }
  // tronçons relevés : ceux des lignes PNJ sont la connaissance des routes (jamais évincés, bornés par le réseau),
  // ceux des convois de joueurs sont plafonnés aux 40 plus récents
  function capLegs(list) {
    const seen = new Set(), out = []; let players = 0;
    for (const l of list || []) {
      if (!l) continue;
      const key = (l.npc ? 'n:' : 'p:' + (l.convoyId || '') + ':') + l.from + '>' + l.to;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!l.npc && ++players > 40) continue;
      out.push(l);
    }
    return out;
  }
  function myHome() { try { return `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`; } catch (e) { return null; } }

  /* ── balises posées sur un jalon : passages vus, cap relevé ── */
  function tickBeacons(beacons, now) {
    if (!Array.isArray(beacons) || !beacons.length) return;
    state();
    const net = network();
    let dirty = false;
    for (const b of beacons) {
      const sys = sysOf(b.deployedSystem);
      const on = sys && net.bySys[sys];
      if (!on) { b._linesAt = now; continue; }
      const from = Math.max(b._linesAt || (b.deployedAt || b.builtAt || now - 60000), now - 6 * 3600 * 1000);
      b._linesAt = now;
      let seenHere = [];
      for (const { line, i, isPort } of on) {
        for (const ps of passages(line, i, from, now)) seenHere.push({ line, i, isPort, ...ps });
      }
      seenHere.sort((a, b2) => a.t - b2.t);
      seenHere = seenHere.slice(-3);                // hors ligne longtemps : les 3 derniers passages suffisent
      for (const s of seenHere) { record(b, sys, s, now); dirty = true; }
    }
    if (dirty) {
      if (typeof saveGame === 'function') saveGame();
      if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
      if (typeof updateProspectRapportsBadge === 'function') { try { updateProspectRapportsBadge(); } catch (e) {} }
    }
  }
  // 19/10 (Adrien) — une bulle par balise et par heure : les autres passages vont aux rapports (interception intacte) ;
  // un convoi lourd ou une route espionnée passe toujours.
  const _bt = {};
  function beaconToast(sys, text, urgent, onTap) {
    if (typeof toast !== 'function') return;
    const now = Date.now(), e = _bt[sys] = _bt[sys] || { at: 0, n: 0 };
    if (!urgent && now - e.at < 3600e3) { e.n++; return; }
    const more = e.n ? ` · +${e.n} autre${e.n > 1 ? 's' : ''} passage${e.n > 1 ? 's' : ''} dans tes rapports` : '';
    e.at = now; e.n = 0;
    toast(text + more, onTap || (() => { if (typeof openProspectRapports === 'function') { G._rapTab = 'missions'; G._rapMis = 'balises'; openProspectRapports(); } }));
  }
  function record(b, sys, s, now) {
    const { line, i, isPort, t, k, dir } = s;
    const cv = convoyOf(line, k, dir);
    const cap = isPort ? null : capOf(line, i, dir);
    // observation de la ligne
    const ob = G.lineObs[line.id] = G.lineObs[line.id] || { n: 0, first: t, last: 0, dirs: {}, times: [] };
    ob.n++; ob.last = Math.max(ob.last, t); ob.dirs[dir] = (ob.dirs[dir] || 0) + 1;
    ob.times = (ob.times || []).concat([t]).slice(-6);
    const tk = 't_' + dir + '@' + sys;   // pour estimer l'horaire : un seul sens, un seul jalon
    ob[tk] = (ob[tk] || []).concat([t]).slice(-5);
    // tronçon relevé
    if (cap && SYS.test(cap)) {
      if (!G.spottedLegs.some(l => l.lineId === line.id && l.from === sys && l.to === cap)) {
        G.spottedLegs.unshift({ id: `ln-${line.id}-${sys}-${cap}`, lineId: line.id, from: sys, to: cap, pseudo: cv.label, at: t, npc: true, cargo: cv.cargo });
        G.spottedLegs = capLegs(G.spottedLegs);
      }
      if (!G.mapSeen) G.mapSeen = {};
      if (!G.mapSeen[cap]) G.mapSeen[cap] = now;
      if (network().ports[cap]) discoverPort(cap, now);
    }
    if (isPort) discoverPort(sys, now);
    // rapport de balise (interceptable seulement pendant la fenêtre de passage)
    if (now - t < WINDOW_MS) {
      if (!Array.isArray(G.beaconReports)) G.beaconReports = [];
      const id = `ln-${line.id}-${k}-${dir}-${sys}`;
      if (!G.beaconReports.some(r => r.id === id)) {
        G.beaconReports.push({
          id, kind: 'beacon', beaconId: b.id, beaconName: 'Balise', systemCoord: sys,
          createdAt: t, expiresAt: t + WINDOW_MS, read: false,
          target: { type: 'pnj', name: `${cv.label} · ${cv.ships} vaisseaux`, tankerTier: cv.tier, cargoEstimate: cv.cargo, confidence: 75 + (h32(id) % 20) },
          line: { id: line.id, dir, cap, label: cv.label, escort: cv.escort, ships: cv.ships, nth: ob.n, k, t, i, cargo: cv.cargo, port: !!isPort },
        });
        b.detectionCount = (b.detectionCount || 0) + 1;
        beaconToast(sys, `📡 ${sys} : ${cv.label.toLowerCase()} · ${cv.ships} vaisseaux${cap ? ' · cap sur ' + cap : ''}`, cv.cargo === 'lourd');
      }
    }
  }
  function discoverPort(portSys, now) {
    state();
    const p = network().ports[portSys];
    if (!p || G.hiddenPorts[portSys]) return;
    G.hiddenPorts[portSys] = { dockId: p.dockId, name: p.name, type: p.type, typeLabel: p.typeLabel, at: now };
    if (!G.mapSeen) G.mapSeen = {};
    G.mapSeen[portSys] = now;
    ensureRoute(portSys);
    if (typeof toast === 'function') toast(`⚓ Lieu caché découvert : ${p.name} (${portSys}) · tes tankers peuvent désormais s'y rendre`, () => { if (typeof openSystemOnMap === 'function') openSystemOnMap(portSys); });
  }

  /* ── E2 · un lieu découvert = une route connue : elle entre au Commerce, les tankers suivent la ligne ── */
  const MOOD_BY_KIND = { marchand: 'grasse', contrebande: 'noire', recup: 'nerveuse', arme: 'imperiale', pelerins: 'morte', imperial: 'imperiale' };
  const NOUN_BY_MOOD = { nerveuse: 'la Veine', grasse: 'la Saigne', morte: 'le Linceul', noire: 'la Voie Noire', imperiale: 'la Vieille Voie' };
  const cap1 = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  function routeNameFor(dock, moodKey) {
    return STATION_PORTS[dock.id] ? STATION_PORTS[dock.id].route : cap1(`${NOUN_BY_MOOD[moodKey] || 'la Route'} de ${dock.name}`);
  }
  // ce qui a été appris du lieu avant qu'il devienne la Couronne prend son nom (une fois)
  function migrateCrown() {
    for (const [ID, SP] of Object.entries(STATION_PORTS)) {
      if (G[SP.flag] === 1) continue;
      G[SP.flag] = 1;
      let d = null;
      try { d = generateDockForRoute({ destinationHint: (Object.values(network().ports).find(x => x.dockId === ID) || {}).hint }); } catch (e) {}
      if (!d || d.id !== ID || !d.station) continue;
      const pick = ({ name, type, typeLabel, sub, accent, ambience, detail, crown, station }) => ({ name, type, typeLabel, sub, accent, ambience, detail, crown, station });
      const F = pick(d);
      if (G.universeDocks && G.universeDocks[ID]) Object.assign(G.universeDocks[ID], F);
      for (const m of G.tankerMissions || []) if (m.dock && m.dock.id === ID) Object.assign(m.dock, F);
      for (const r of G.routes || []) {
        if (r.dock && r.dock.id === ID) Object.assign(r.dock, F);
        if (r.id === 'rt-ln-' + ID) { r.moodKey = SP.mood; r.name = SP.route; if (r.sourceCard) r.sourceCard.name = d.name; }
      }
      for (const [k, h] of Object.entries(G.hiddenPorts || {})) if (h.dockId === ID) Object.assign(h, { name: d.name, type: d.type, typeLabel: d.typeLabel });
    }
  }
  function ensureRoute(portSys) {
    const p = network().ports[portSys];
    if (!p) return null;
    if (!Array.isArray(G.routes)) G.routes = [];
    let r = G.routes.find(x => x.portSys === portSys);
    if (r) return r;
    let dock = null;
    try { dock = generateDockForRoute({ destinationHint: p.hint }); } catch (e) {}
    if (!dock) return null;
    if (!G.universeDocks) G.universeDocks = {};
    if (!G.universeDocks[dock.id]) G.universeDocks[dock.id] = dock;
    dock = G.universeDocks[dock.id];
    const line = network().byId[p.lines[0]];
    const moodKey = (STATION_PORTS[p.dockId] && STATION_PORTS[p.dockId].mood) || MOOD_BY_KIND[line && line.kind.key] || 'grasse';
    const mood = (typeof ROUTE_MOODS !== 'undefined' && ROUTE_MOODS[moodKey]) || { stabilityRange: [60, 80], label: '' };
    const [a0, a1] = mood.stabilityRange || [60, 80];
    r = {
      id: 'rt-ln-' + p.dockId, name: routeNameFor(dock, moodKey), moodKey,
      originHint: 'Ligne remontée balise après balise', destinationHint: p.hint,
      quality: 85, stability: Math.round((a0 + a1) / 2), knowledgeLevel: 0, passages: 0, lost: 0, delayed: 0,
      discoveredAt: Date.now(), lastUsedAt: null, status: 'active', dockId: dock.id, dock,
      sourceCard: { kind: 'line', source: 'Ligne PNJ remontée', name: p.name },
      portSys, lineDiscovered: true,
    };
    G.routes.push(r);
    return r;
  }
  // tronçons connus d'une route de ligne, du plus loin connu jusqu'au lieu (pour la carte et pour le registre)
  function knownChain(portSys) {
    state();
    const p = network().ports[portSys];
    if (!p) return [];
    const known = new Set();
    for (const l of G.spottedLegs) if (l.npc) { known.add(l.from); known.add(l.to); }
    for (const k of Object.keys(G.trafficEchoes)) known.add(k);
    let best = [];
    for (const id of p.lines) {
      const line = network().byId[id];
      let start = line.chain.length;
      for (let i = line.chain.length - 1; i >= 0; i--) { if (known.has(line.chain[i])) start = i; else break; }
      const chain = line.chain.slice(start).concat([portSys]);
      if (chain.length > best.length) best = chain;
    }
    return best.length ? best : [portSys];
  }

  /* ── E3 · balisage : mes balises posées sur les jalons connus d'une route de ligne ── */
  // ratio = jalons balisés / jalons connus ; trajet −35 % et risque −60 % à pleine couverture ;
  // à partir de la moitié, le convoi passe en « voie balisée » au registre (pavillon masqué, un passage sur deux échappe aux balises).
  function balisage(portSys) {
    const b = balisageChain(knownChain(portSys).slice(0, -1));
    const r = (G.routes || []).find(x => x.portSys === portSys), sb = r && r.sellerBalise;
    if (sb && Date.now() < sb.until && sb.ratio > b.ratio) {
      b.ratio = sb.ratio; b.factor = 1 - 0.35 * b.ratio; b.riskMult = 1 - 0.6 * b.ratio; b.cover = b.ratio >= 0.5; b.seller = sb.seller || true;
    }
    return b;
  }
  function balisageChain(chain) {
    const mine = new Set((G.probesPool || []).filter(p => p.tier === 'beacon' && p.state === 'deployed').map(p => sysOf(p.deployedSystem)));
    const going = new Set((G.probeMissions || []).filter(m => m.tier === 'beacon' && m.status === 'in_transit').map(m => sysOf(m.targetCoords)));
    const beaconed = chain.filter(k => mine.has(k));
    const ratio = chain.length ? beaconed.length / chain.length : 0;
    return { chain, beaconed, ratio, next: chain.find(k => !mine.has(k) && !going.has(k)) || null, pending: chain.filter(k => going.has(k)).length,
      factor: 1 - 0.35 * ratio, riskMult: 1 - 0.6 * ratio, cover: ratio >= 0.5 };
  }
  // 15/10 — les routes connues qui passent par ce système, et à quel jalon (pour relier carte, rapports et fiches)
  function routesOf(sys) {
    const out = [];
    for (const r of (G.routes || [])) if (r.portSys) {
      const ch = knownChain(r.portSys), i = ch.indexOf(sys);
      if (i >= 0) out.push({ id: r.id, name: r.name, color: '#ffc864', kind: 'line', idx: i, n: ch.length - 2, end: i === ch.length - 1, start: i === 0 });
    }
    for (const o of openedRoutes()) {
      const i = o.chain.indexOf(sys);
      if (i >= 0) out.push({ id: o.id, name: o.name, color: o.color || OPEN_COLOR, kind: 'opened', idx: i, n: o.chain.length - 2, end: i === o.chain.length - 1, start: i === 0 });
    }
    return out;
  }
  // routes de ligne qu'une balise posée sur ce système balise
  function routesBalisedBy(sys) {
    return (G.routes || []).filter(r => r.portSys && knownChain(r.portSys).slice(0, -1).includes(sys))
      .concat(openedRoutes().filter(o => o.chain.slice(1, -1).includes(sys)));
  }
  // un convoi de joueur vu par une de mes balises sur une ligne : il emprunte peut-être « ma » route
  function noteUser(sys, pseudo, at) {
    if (!SYS.test(sys || '')) return;
    const on = (network().bySys[sys] || []).filter(o => !o.isPort);
    if (!on.length) return;
    if (!G.lineUsers || typeof G.lineUsers !== 'object') G.lineUsers = {};
    for (const { line } of on) {
      const list = G.lineUsers[line.port] = (G.lineUsers[line.port] || []);
      if (list.some(u => u.sys === sys && Math.abs(u.at - at) < 15 * 60000 && u.pseudo === (pseudo || null))) continue;
      list.unshift({ pseudo: pseudo || null, at, sys });
      G.lineUsers[line.port] = list.slice(0, 30);
    }
  }

  /* ── E4 · ouvrir une route par un premier voyage : une Moyenne éclaireur ── */
  // Vers un lieu connu sans chemin (planète alliée, point de ralliement…). La sonde part dans l'inconnu, se consume
  // en traçant le passage ; son trajet devient une route (chaîne de systèmes) qu'on peut baliser et donner.
  const OPEN_COLOR = '#9fe08a';
  function openedRoutes() { if (!Array.isArray(G.openedRoutes)) G.openedRoutes = []; return G.openedRoutes; }
  function openedTo(sys) { return openedRoutes().find(o => o.to === sys) || null; }
  function scoutInFlight(sys) { return (G.probeMissions || []).find(m => m.mode === 'scout' && m.status === 'in_transit' && m.targetCoords === sys) || null; }
  function sectorGap(a, b) { return Math.abs(String(a || 'A').charCodeAt(0) - String(b || 'A').charCodeAt(0)); }
  function scoutLaunch(sys, label) {
    state();
    if (!SYS.test(sys || '')) return null;
    const home = myHome();
    if (sys === home) return null;
    if (openedTo(sys)) { toast('Tu as déjà une route jusqu\'ici'); return null; }
    if (scoutInFlight(sys)) { toast('Une Moyenne trace déjà ce passage'); return null; }
    const probe = (G.probesPool || []).find(p => p.tier === 'medium' && p.state === 'ready');
    if (!probe) { toast('Aucune Moyenne prête'); return null; }
    const d = (typeof PROBE_DURATIONS_BY_TIER !== 'undefined' && PROBE_DURATIONS_BY_TIER.medium) || { min: 2 * 3600e3, max: 4 * 3600e3 };
    const now = Date.now(), dur = d.min + Math.random() * (d.max - d.min);
    const m = { id: 'pm-' + now + '-' + Math.random().toString(36).slice(2, 6), probeId: probe.id,
      probeName: (typeof generateProbeName === 'function') ? generateProbeName() : 'Éclaireur', tier: 'medium', mode: 'scout',
      targetCoords: sys, scoutLabel: label || null, sector: sys.split('-')[1], departedAt: now, arrivalAt: now + dur, status: 'in_transit' };
    probe.state = 'mission';
    (G.probeMissions = G.probeMissions || []).push(m);
    if (typeof saveGame === 'function') saveGame();
    if (typeof toast === 'function') toast(`Moyenne ${m.probeName} en éclaireur vers ${label || sys} · ${typeof formatTankerDuration === 'function' ? formatTankerDuration(dur) : ''}`);
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
    return m;
  }
  // appelé à l'arrivée (handleProbeReturn) : la sonde se consume, le passage devient une route — ou elle se perd
  function scoutArrived(m) {
    state();
    const i = (G.probeMissions || []).findIndex(x => x.id === m.id);
    if (i >= 0) G.probeMissions.splice(i, 1);
    const pi = (G.probesPool || []).findIndex(p => p.id === m.probeId);
    if (pi >= 0) G.probesPool.splice(pi, 1);
    const home = myHome() || 'A-A-1000';
    const to = m.targetCoords, gap = sectorGap(home.split('-')[1], to.split('-')[1]);
    if (Math.random() < 0.08 + 0.12 * Math.min(gap, 3)) {
      if (typeof toast === 'function') toast(`✗ La Moyenne ${m.probeName} s'est perdue en route vers ${m.scoutLabel || to} · aucun passage tracé`);
      if (typeof saveGame === 'function') saveGame();
      return null;
    }
    // le passage : 3 à 6 systèmes intermédiaires, du secteur de départ vers celui d'arrivée
    const r = rngOf('scout:' + home + '>' + to + ':' + m.id);
    const n = 3 + Math.min(3, gap) + Math.floor(r() * 2);
    const [cl] = to.split('-'), s0 = home.split('-')[1].charCodeAt(0), s1 = to.split('-')[1].charCodeAt(0);
    const wps = [];
    for (let k = 1; k <= n; k++) {
      const sec = String.fromCharCode(Math.round(s0 + (s1 - s0) * k / (n + 1)));
      let key, g = 0;
      do { key = `${cl}-${sec}-${1000 + Math.floor(r() * 9000)}`; } while ((wps.includes(key) || key === to || key === home) && g++ < 50);
      wps.push(key);
    }
    const o = { id: 'or-' + m.id.slice(3), name: 'Route vers ' + (m.scoutLabel || to), color: OPEN_COLOR, chain: [home].concat(wps, [to]),
      to, toLabel: m.scoutLabel || null, openedAt: Date.now(), by: null };
    openedRoutes().push(o);
    if (!G.mapSeen) G.mapSeen = {};
    for (const k of o.chain) if (!G.mapSeen[k]) G.mapSeen[k] = Date.now();
    if (typeof saveGame === 'function') saveGame();
    if (typeof toast === 'function') toast(`🛰 Route ouverte vers ${m.scoutLabel || to} · ${n} systèmes de passage tracés`, () => { if (window.SBMap && SBMap.showRoute) { if (typeof openOnMap === 'function') openOnMap('system', to); setTimeout(() => SBMap.selectRoute(o.id), 600); } });
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
    return o;
  }
  function forgetOpened(id) {
    G.openedRoutes = openedRoutes().filter(o => o.id !== id);
    if (typeof saveGame === 'function') saveGame();
  }
  // donner une route à un autre commandant (registre) ; il la reçoit au prochain passage du jeu
  async function giveRoute(id, toAddress) {
    const o = openedRoutes().find(x => x.id === id);
    if (!o || typeof _mpRpc !== 'function') return false;
    await _mpRpc('mp_route_give', { p_to_address: toAddress, p_route: { name: o.name, chain: o.chain, to: o.to, toLabel: o.toLabel } });
    return true;
  }
  let _giftsAt = 0;
  async function pollGifts() {
    if (typeof G === 'undefined' || !G || typeof _mpRpc !== 'function' || !(window.SBMP && SBMP.ready && SBMP.ready())) return;
    if (Date.now() - _giftsAt < 55000) return;
    _giftsAt = Date.now();
    let rows;
    try { rows = await _mpRpc('mp_route_inbox', {}); } catch (e) { return; }
    for (const g of Array.isArray(rows) ? rows : []) {
      const rt = g.route || {};
      const chain = (Array.isArray(rt.chain) ? rt.chain : []).filter(k => SYS.test(k)).slice(0, 12);
      if (chain.length >= 2 && !openedRoutes().some(o => o.id === 'gift-' + g.id)) {
        const o = { id: 'gift-' + g.id, name: clean(rt.name || 'Route offerte'), color: '#ffb3e0', chain, to: chain[chain.length - 1],
          toLabel: rt.toLabel ? clean(rt.toLabel, 40) : null, openedAt: Date.now(), by: clean(g.from_pseudo || '?', 24) };
        openedRoutes().push(o);
        if (!G.mapSeen) G.mapSeen = {};
        for (const k of chain) if (!G.mapSeen[k]) G.mapSeen[k] = Date.now();
        if (typeof toast === 'function') toast(`⚑ ${o.by} t'offre une route : ${o.name}`, () => { if (typeof openOnMap === 'function') openOnMap('system', o.to); setTimeout(() => SBMap.selectRoute(o.id), 600); });
      }
      try { await _mpRpc('mp_route_gift_seen', { p_gift: g.id }); } catch (e) {}
    }
    if (typeof saveGame === 'function') saveGame();
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  }
  setInterval(() => { if (document.visibilityState !== 'hidden') pollGifts(); }, 20000);

  /* ── E5 · marché des routes au comptoir des docks, caution, trahisons ── */
  const PRICE_TIERS = [{ k: 'low', label: 'Modeste', price: 300 }, { k: 'mid', label: 'Juste', price: 800 }, { k: 'high', label: 'Chère', price: 2000 }];
  const _offers = {};            // dock → { at, rows, mine }
  let _marketBusy = false;
  const online = () => !!(window.SBMP && SBMP.ready && SBMP.ready()) && typeof _mpRpc === 'function';
  const credits = () => (G.credits || 0);
  // mes routes vendables : routes de lignes remontées, routes ouvertes (les miennes ou reçues)
  function sellableRoutes() {
    const out = [];
    for (const r of (G.routes || [])) if (r.portSys) {
      const chain = knownChain(r.portSys);
      if (chain.length >= 2) out.push({ ref: 'r:' + r.id, name: r.name, kind: 'line', port: r.portSys, chain, toLabel: (r.dock && r.dock.name) || null });
    }
    for (const o of openedRoutes()) if (!o.fake) out.push({ ref: 'o:' + o.id, name: o.name, kind: 'opened', chain: o.chain, toLabel: o.toLabel || null });
    return out;
  }
  async function fetchOffers(dockId, force) {
    if (!online() || !dockId) return null;
    const c = _offers[dockId];
    if (!force && c && Date.now() - c.at < 20000) return c;
    try {
      const rows = await _mpRpc('mp_route_offers', { p_dock_id: dockId });
      _offers[dockId] = { at: Date.now(), rows: (Array.isArray(rows) ? rows : []).map(o => Object.assign({}, o, { name: clean(o.name), seller_pseudo: clean(o.seller_pseudo, 24) })) };
      if (typeof getCurrentScreen === 'function' && getCurrentScreen() === 'dock' && typeof renderDockScreen === 'function') { try { renderDockScreen(); } catch (e) {} }
    } catch (e) { _offers[dockId] = { at: Date.now(), rows: [], err: true }; }
    return _offers[dockId];
  }
  function myOpenOffers(dockId) { return ((G.myRouteOffers || []).filter(o => o.status === 'open' && (!dockId || o.dockId === dockId))); }
  function dockMarketHtml(mission) {
    if (!mission) return '';
    const dockId = (typeof mpDockIdForMission === 'function') ? mpDockIdForMission(mission) : null;
    if (!dockId) return '';
    const head = (t) => `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding:0 2px">${t}</div>`;
    if (!online()) return head('Cartes au comptoir') + `<div style="font-size:11px;color:var(--mut);font-style:italic;padding:4px 2px">Registre hors de portée : le comptoir ne vend rien pour l'instant.</div>`;
    const c = _offers[dockId];
    if (!c || Date.now() - c.at > 20000) fetchOffers(dockId);
    const rows = (c && c.rows) || [];
    const esc2 = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    let html = head(`Cartes au comptoir${rows.length ? ' · ' + rows.length : ''}`);
    if (!c) html += `<div style="font-size:11px;color:var(--mut);font-style:italic;padding:4px 2px">On fouille sous le comptoir…</div>`;
    else if (!rows.length) html += `<div style="font-size:11px;color:var(--mut);font-style:italic;padding:4px 2px">Personne ne vend de route ici en ce moment.</div>`;
    for (const o of rows) {
      const rep = o.betrayals ? `<span style="color:#ff8a8a">${o.betrayals} trahison${o.betrayals > 1 ? 's' : ''} au comptoir</span>` : (o.sales ? `${o.sales} vente${o.sales > 1 ? 's' : ''}, aucune plainte` : 'jamais vendu de carte');
      const can = credits() >= o.price;
      html += `<div style="margin-bottom:8px;padding:11px 13px;border:1px solid rgba(255,200,100,.3);border-radius:8px;background:rgba(255,200,100,.04)">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span style="font-size:13px;color:#ffe2a8;font-weight:600">${esc2(o.name)}</span><span style="font-family:var(--font-mono);font-size:12px;color:#ffc864">${o.price} CG</span></div>
        <div style="font-size:11px;color:var(--mut);margin-top:3px">${o.kind === 'line' ? 'Route vers un lieu caché' : 'Route privée'} · ${Math.max(1, o.stops - 1)} tronçon${o.stops > 2 ? 's' : ''} · vendue par <b style="color:#e6f0ff">${esc2(o.seller_pseudo)}</b> (${rep})</div>
        <div style="font-size:10px;color:var(--mut);margin-top:3px">Caution de ${o.caution} CG gardée par le port 7 jours : elle te revient si le vendeur te trahit.</div>
        <button ${can ? `onclick="SBLines.buyOffer('${o.id}','${dockId}')"` : 'disabled'} style="margin-top:9px;width:100%;padding:9px;border-radius:6px;border:1px solid rgba(255,200,100,.55);background:transparent;color:${can ? '#ffc864' : 'var(--mut)'};font-family:inherit;font-size:11px;letter-spacing:.1em;${can ? 'cursor:pointer' : 'opacity:.5'}">${can ? 'ACHETER LA CARTE' : `IL TE MANQUE ${o.price - credits()} CG`}</button>
      </div>`;
    }
    for (const o of myOpenOffers(dockId)) {
      html += `<div style="margin-bottom:8px;padding:10px 12px;border:1px dashed rgba(255,200,100,.35);border-radius:8px;display:flex;align-items:center;gap:10px">
        <div style="flex:1;font-size:11px;color:var(--mut)"><b style="color:#ffe2a8">${esc2(o.name)}</b> · en vente ${o.price} CG${o.fake ? ' · <span style="color:#ff8a8a">truquée</span>' : ''} · caution ${o.caution} CG</div>
        <button onclick="SBLines.withdrawOffer('${o.id}')" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--mut);font-family:inherit;font-size:10px;letter-spacing:.1em;cursor:pointer">RETIRER</button></div>`;
    }
    const sellable = sellableRoutes();
    if (sellable.length && myOpenOffers().length < 3) {
      html += `<div onclick="SBLines.sellHere('${mission.id}')" style="margin-top:4px;padding:10px 12px;border:1px dashed rgba(255,200,100,.35);border-radius:6px;cursor:pointer">
        <div style="font-size:12px;color:#ffc864">🗺 Vendre une de tes routes ici</div>
        <div style="font-size:10px;color:var(--mut);margin-top:2px">Le port garde une caution (la moitié du prix) pendant 7 jours</div></div>`;
    }
    return html;
  }
  // registre pas encore à jour (SQL v15 non passé) : on retombe sur les appels de la v14
  let _v15;   // le registre a-t-il la v15 ? (sondé une fois)
  const missingFn = (e) => /PGRST202|Could not find the function/.test(String(e && e.message || e));
  const definite = (e) => /offer_quota|offer_invalid|offer_gone|offer_self|no_world/.test(String(e && e.message || e));
  function save() { if (typeof saveGame === 'function') saveGame(); }
  function redrawDock() { if (typeof renderDockScreen === 'function' && typeof getCurrentScreen === 'function' && getCurrentScreen() === 'dock') renderDockScreen(); }
  // tracé balisé d'une route vendue, tel que le vendeur doit l'entretenir 7 jours
  function soldChain(route) { const ch = (route && route.chain) || []; return route && route.kind === 'line' ? ch.slice(0, -1) : ch.slice(1, -1); }
  // mes ventes surveillées qui passent par ce système (pour prévenir avant de rappeler une balise)
  function salesOn(sys) { return (G._mySales || []).filter(s => soldChain(s.route).includes(sys)); }
  async function sellHere(missionId) {
    const m = (G.tankerMissions || []).find(x => x.id === missionId);
    if (!m || !online()) { toast('Registre hors de portée'); return; }
    const dockId = mpDockIdForMission(m), dockName = clean((m.dock && m.dock.name) || 'Dock', 40);
    const list = sellableRoutes();
    const legs = (n) => `${n} tronçon${n > 1 ? 's' : ''}`;
    const it = await _mpChoose('Quelle route vendre ?', list.map(r => ({ r, label: clean(r.name), sub: `${r.kind === 'line' ? 'vers un lieu caché' : 'route privée'} · ${legs(r.chain.length - 1)}` })));
    if (!it) return;
    const pr = await _mpChoose('À quel prix ?', PRICE_TIERS.map(t => ({ t, label: `${t.label} · ${t.price} CG`, sub: `caution ${Math.round(t.price / 2)} CG gardée par le port 7 jours` })));
    if (!pr) return;
    const how = await _mpChoose('Quelle carte remettre ?', [
      { fake: false, label: 'La vraie carte', sub: 'La caution te revient dans 7 jours si tu ne trahis pas ton acheteur (ni abordage sur cette route, ni balise retirée)' },
      { fake: true, label: 'Une carte truquée', sub: 'Elle mène dans le vide. Tu encaisses… et tu perds la caution quand le port la démasque. Le comptoir saura.' },
    ]);
    if (!how) return;
    const price = pr.t.price, caution = Math.round(price / 2);
    if (credits() < caution) { toast(`Il faut ${caution} CG de caution`); return; }
    const r = it.r;
    let chain = r.chain.slice(), port = r.port || null;
    if (how.fake) {   // la fin du tracé est remplacée : elle mène dans le vide
      const rng = rngOf('fake:' + r.ref + ':' + Date.now());
      const sec = chain[chain.length - 1].split('-')[1];
      chain = chain.slice(0, Math.max(1, chain.length - 2)).concat([0, 1].map(() => `A-${sec}-${1000 + Math.floor(rng() * 9000)}`));
      port = null;
    }
    // le balisage que le vendeur entretient (l'acheteur en profite 7 jours)
    const balise = how.fake ? 0 : Math.round(balisageChain(soldChain({ kind: r.kind, chain: r.chain })).ratio * 100) / 100;
    const ckey = 'ck-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (!Array.isArray(G.myRouteOffers)) G.myRouteOffers = [];
    const mine = { id: null, ckey, dockId, dockName, name: clean(r.name), price, caution, fake: how.fake, status: 'pending', at: Date.now() };
    G.credits = credits() - caution;
    G.myRouteOffers.push(mine);
    save();
    try {
      mine.id = await _mpRpc('mp_route_offer_post', { p_dock_id: dockId, p_dock_name: dockName, p_route: { name: r.name, kind: how.fake ? 'opened' : r.kind, port, toLabel: r.toLabel, fake: how.fake, chain, ckey, balise }, p_price: price, p_caution: caution });
      mine.status = 'open';
      toast(`« ${mine.name} » en vente au comptoir de ${dockName} · ${price} CG`);
    } catch (e) {
      // refus net du comptoir : caution rendue ; réponse perdue : on vérifiera au registre (l'offre a peut-être été posée)
      if (definite(e) || _v15 === false) { G.myRouteOffers = G.myRouteOffers.filter(o => o !== mine); G.credits = credits() + caution; }
      toast(/offer_quota/.test(String(e.message)) ? '3 cartes en vente au plus' : definite(e) ? 'Le comptoir refuse cette carte' : 'Le comptoir ne répond pas : on vérifie au registre');
    }
    save();
    fetchOffers(dockId, true);
    redrawDock();
  }
  async function withdrawOffer(id) {
    const o = (G.myRouteOffers || []).find(x => x.id === id);
    if (!o || o.status !== 'open') return;
    let st;
    try { st = await _mpRpc('mp_route_withdraw_state', { p_offer: id }); }
    catch (e) {
      if (!missingFn(e)) { toast('Le comptoir ne répond pas, réessaie'); return; }
      try { st = (await _mpRpc('mp_route_withdraw', { p_offer: id })) ? 'withdrawn' : 'sold'; } catch (e2) { toast('Le comptoir ne répond pas, réessaie'); return; }
    }
    if (st === 'withdrawn' || st === 'unknown') { o.status = 'withdrawn'; G.credits = credits() + o.caution; toast(`Carte retirée · caution rendue (${o.caution} CG)`); }
    else { o.status = 'sold'; toast('Trop tard : elle vient d\'être vendue'); }
    save(); redrawDock();
  }
  async function buyOffer(id, dockId) {
    const row = ((_offers[dockId] || {}).rows || []).find(o => o.id === id);
    if (!row) return;
    if ((G.pendingRouteBuys || []).some(b => b.id === id)) { toast('Achat en cours de vérification au registre'); return; }
    if (credits() < row.price) { toast(`Il faut ${row.price} CG`); return; }
    const ok = typeof sbConfirm === 'function' ? await sbConfirm({ title: 'Acheter « ' + clean(row.name) + ' » ?', body: `${row.price} CG à ${clean(row.seller_pseudo, 24)}. Le port garde sa caution (${row.caution} CG) 7 jours : si la carte est truquée ou s'il te trahit sur cette route, elle est pour toi.`, confirmLabel: 'Acheter', cancelLabel: 'Laisser' }) : true;
    if (!ok) return;
    G.credits = credits() - row.price;
    save();
    let res;
    try { res = await _mpRpc('mp_route_buy', { p_offer: id }); }
    catch (e) {
      if (definite(e) || _v15 === false) { G.credits = credits() + row.price; toast(/offer_gone/.test(String(e.message)) ? 'Quelqu\'un l\'a achetée avant toi' : 'Le comptoir ne répond pas, réessaie'); }
      else { (G.pendingRouteBuys = G.pendingRouteBuys || []).push({ id, price: row.price, at: Date.now() }); toast('Le comptoir ne répond pas : on vérifie au registre si la carte est à toi'); }
      save(); fetchOffers(dockId, true); return;
    }
    learnRoute(res);
    save();
    fetchOffers(dockId, true);
    redrawDock();
  }
  // la route achetée entre dans ma connaissance
  function learnRoute(res) {
    state();
    const rt = Object.assign({}, (res && res.route) || {});
    rt.name = clean(rt.name || 'Route'); rt.toLabel = rt.toLabel ? clean(rt.toLabel, 40) : null;
    res.seller = clean(res.seller, 24);
    const chain = (rt.chain || []).filter(k => SYS.test(k)).slice(0, 12);
    if (chain.length < 2) return;
    if (openedRoutes().some(o => o.offerId === res.id) || (G.routes || []).some(r => r.boughtFrom && r.boughtFrom.offerId === res.id)) return;   // déjà apprise
    const soldAt = Date.parse(res.sold_at || '') || Date.now();
    const sellerBalise = Number(rt.balise) > 0 ? { ratio: Math.min(1, Number(rt.balise)), until: soldAt + 7 * 864e5, offerId: res.id, seller: res.seller } : null;
    if (!G.mapSeen) G.mapSeen = {};
    for (const k of chain) if (!G.mapSeen[k]) G.mapSeen[k] = Date.now();
    if (rt.fake) {   // registre v14 : la carte dit encore qu'elle est truquée (le port la démasque ici)
      openedRoutes().push({ id: 'buy-' + res.id, name: rt.name, color: '#ffb3e0', chain, to: chain[chain.length - 1], toLabel: rt.toLabel || null,
        openedAt: Date.now(), by: res.seller, offerId: res.id, fake: true, fakeAt: Date.now() + (30 + Math.floor(Math.random() * 60)) * 60000 });
      toast(`🗺 « ${rt.name} » achetée à ${res.seller} · elle est sur ta carte`);
    } else if (rt.kind === 'line' && rt.port && network().ports[rt.port]) {
      for (let i = 0; i < chain.length - 1; i++) {
        if (!G.spottedLegs.some(l => l.npc && l.from === chain[i] && l.to === chain[i + 1]))
          G.spottedLegs.unshift({ id: `buy-${res.id}-${i}`, lineId: (network().bySys[chain[i]] || [{ line: { id: null } }])[0].line.id, from: chain[i], to: chain[i + 1], pseudo: 'Carte de ' + res.seller, at: Date.now(), npc: true, cargo: 'lourd' });
      }
      G.spottedLegs = capLegs(G.spottedLegs);
      if (!G.hiddenPorts[rt.port]) { const p = network().ports[rt.port]; G.hiddenPorts[rt.port] = { dockId: p.dockId, name: p.name, type: p.type, typeLabel: p.typeLabel, at: Date.now(), boughtFrom: res.seller }; }
      const r = ensureRoute(rt.port);
      if (r) { r.boughtFrom = { seller: res.seller, offerId: res.id, at: Date.now() }; if (sellerBalise) r.sellerBalise = sellerBalise; }
      toast(`🗺 « ${rt.name} » achetée à ${res.seller} · route vers ${(r && r.dock && r.dock.name) || 'un lieu caché'} ajoutée${sellerBalise ? ` · balisée à ${Math.round(sellerBalise.ratio * 100)} % par le vendeur` : ''}`);
    } else {
      openedRoutes().push({ id: 'buy-' + res.id, name: rt.name, color: '#ffb3e0', chain, to: chain[chain.length - 1], toLabel: rt.toLabel || null, openedAt: Date.now(), by: res.seller, offerId: res.id, sellerBalise });
      toast(`🗺 « ${rt.name} » achetée à ${res.seller} · elle est sur ta carte`);
    }
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  }
  // un acheteur dévalisé par son vendeur : trahison (le registre v15 le voit aussi de lui-même)
  function noteRobbery(victim, system) {
    if (!victim) return;
    // trahison seulement si l'abordage a eu lieu sur la route vendue à cet acheteur
    const sale = (G._mySales || []).find(s => s.buyer_pseudo === victim && (!system || ((s.route && s.route.chain) || []).includes(system)));
    if (sale && online()) _mpRpc('mp_route_betray', { p_offer: sale.id, p_reason: 'robbed' }).then(ok => {
      if (ok) toast(`⚠ Tu as dévalisé ${clean(victim, 24)} sur une route que tu lui avais vendue : le port lui donne ta caution, et le comptoir en parle`);
    }).catch(() => {});
  }
  // la trahison du vendeur côté acheteur : la carte truquée disparaît, le balisage promis s'éteint
  function betrayedOffer(offerId, why) {
    if (why === 'fake') G.openedRoutes = openedRoutes().filter(o => o.offerId !== offerId);
    for (const r of (G.routes || [])) if (r.sellerBalise && r.sellerBalise.offerId === offerId) r.sellerBalise = null;
    for (const o of openedRoutes()) if (o.sellerBalise && o.sellerBalise.offerId === offerId) o.sellerBalise = null;
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  }
  async function tickMarket() {
    if (_marketBusy || !online() || typeof G === 'undefined' || !G) return;
    _marketBusy = true;
    try {
      if (_v15 === undefined) { try { await _mpRpc('mp_route_mine', {}); _v15 = true; } catch (e) { if (missingFn(e)) _v15 = false; } }
      // vendeur : ventes à encaisser, cautions rendues — encaissées une seule fois (le registre rend le montant)
      const sin = await _mpRpc('mp_route_seller_inbox', {});
      for (const r of Array.isArray(sin) ? sin : []) {
        let amt;
        try { amt = await _mpRpc('mp_route_seller_claim', { p_offer: r.id, p_what: r.what }); _v15 = true; }
        catch (e) { if (!missingFn(e)) throw e; _v15 = false; await _mpRpc('mp_route_seller_ack', { p_offer: r.id, p_what: r.what }); amt = r.amount; }
        amt = Math.max(0, Math.floor(Number(amt) || 0));
        const mo = (G.myRouteOffers || []).find(o => o.id === r.id); if (mo) mo.status = 'sold';
        if (!amt) continue;
        G.credits = credits() + amt; save();
        toast(r.what === 'paid' ? `💰 ${clean(r.buyer_pseudo, 24)} a acheté ta carte « ${clean(r.name)} » : +${amt} CG` : `Caution rendue par le port (${amt} CG) : « ${clean(r.name)} »`);
      }
      // acheteur : cautions gagnées (et cartes truquées démasquées par le port)
      const bin = await _mpRpc('mp_route_buyer_inbox', {});
      for (const r of Array.isArray(bin) ? bin : []) {
        let amt;
        try { amt = await _mpRpc('mp_route_buyer_claim', { p_offer: r.id }); _v15 = true; }
        catch (e) { if (!missingFn(e)) throw e; _v15 = false; await _mpRpc('mp_route_buyer_ack', { p_offer: r.id }); amt = r.amount; }
        amt = Math.max(0, Math.floor(Number(amt) || 0));
        betrayedOffer(r.id, r.betrayal);
        if (!amt) continue;
        G.credits = credits() + amt; save();
        toast(`⚖ Le port te verse la caution de ${clean(r.seller_pseudo, 24)} (${amt} CG) : « ${clean(r.name)} » ${r.betrayal === 'fake' ? 'était truquée, ses coordonnées mènent dans le vide' : r.betrayal === 'robbed' ? '… il t\'attendait dessus' : 'a perdu son balisage'}`);
      }
      // mes ventes surveillées : balisage retiré = trahison
      const sales = await _mpRpc('mp_route_my_sales', {});
      G._mySales = Array.isArray(sales) ? sales : [];
      if (!G.saleBeacons || typeof G.saleBeacons !== 'object') G.saleBeacons = {};
      for (const sl of G._mySales) {
        const now = balisageChain(soldChain(sl.route)).beaconed;
        const snap = G.saleBeacons[sl.id];
        if (!snap) { G.saleBeacons[sl.id] = now; continue; }
        if (snap.some(k => !now.includes(k))) {
          const ok = await _mpRpc('mp_route_betray', { p_offer: sl.id, p_reason: 'recall' });
          if (ok) toast(`⚠ Tu as retiré le balisage de « ${clean(sl.route.name)} », vendue à ${clean(sl.buyer_pseudo, 24)} : le port lui donne ta caution`);
          delete G.saleBeacons[sl.id];
        }
      }
      for (const k of Object.keys(G.saleBeacons)) if (!G._mySales.some(s => s.id === k)) delete G.saleBeacons[k];
      // cartes truquées achetées sous le registre v14 : le jeu les démasque (la route ne part qu'une fois le port averti)
      for (const o of openedRoutes().filter(x => x.fake && x.fakeAt && Date.now() > x.fakeAt)) {
        try { await _mpRpc('mp_route_betray', { p_offer: o.offerId, p_reason: 'fake' }); } catch (e) { continue; }
        G.openedRoutes = openedRoutes().filter(x => x.id !== o.id);
        toast(`✗ « ${clean(o.name)} » était truquée : ses coordonnées mènent dans le vide. Le port saisit la caution de ${clean(o.by, 24)}.`);
      }
      // réponses perdues : offres posées, achats conclus — le registre fait foi
      const pendO = (G.myRouteOffers || []).filter(o => o.status === 'pending'), pendB = G.pendingRouteBuys || [];
      if (pendO.length || pendB.length) {
        let mine = null;
        try { mine = await _mpRpc('mp_route_mine', {}); } catch (e) { if (missingFn(e)) mine = []; }
        if (Array.isArray(mine)) {
          for (const o of pendO) {
            const row = mine.find(x => x.role === 'seller' && x.ckey === o.ckey);
            if (row) { o.id = row.id; o.status = row.status === 'open' ? 'open' : row.status; if (row.status === 'withdrawn') G.credits = credits() + o.caution; }
            else if (Date.now() - o.at > 60000) { G.myRouteOffers = G.myRouteOffers.filter(x => x !== o); G.credits = credits() + o.caution; toast(`« ${o.name} » n'a pas été posée au comptoir · caution rendue`); }
          }
          for (const b of pendB.slice()) {
            const row = mine.find(x => x.role === 'buyer' && x.id === b.id);
            if (row) learnRoute({ id: row.id, seller: row.seller_pseudo, route: row.route, sold_at: row.sold_at });
            else {
              // PATCH_2010_AUDIT — on redemande l'achat : le registre le redonne à son acheteur (carte de plus de 14 jours comprise)
              let res = null, refused = false;
              try { res = await _mpRpc('mp_route_buy', { p_offer: b.id }); } catch (e) { refused = definite(e); }
              if (res && res.route) learnRoute(res);
              else if (refused || Date.now() - b.at > 24 * 3600000) { G.credits = credits() + b.price; toast(`Achat non conclu · ${b.price} CG rendus`); }
              else continue;
            }
            G.pendingRouteBuys = (G.pendingRouteBuys || []).filter(x => x !== b);
          }
        }
      }
      save();
    } catch (e) { console.warn('[routes] comptoir :', String(e && e.message || e)); }
    finally { _marketBusy = false; }
  }
  setInterval(() => { if (document.visibilityState !== 'hidden') tickMarket(); }, 60000);

  /* ── E6 · flottes sur les routes : ordres permanents, abordage des convois PNJ ── */
  // Une flotte en embuscade sur un jalon de ligne voit passer les convois PNJ (retroactivement, selon l'horaire).
  // Ses ordres décident : me demander (le rapport de balise propose d'aborder), dévaliser les cales pleines,
  // dévaliser tout, ou filer sans se montrer (la route avance d'un tronçon). Le butin PNJ entre dans la même cale
  // que celui des joueurs, au registre (mp_ambush_npc) ; hors ligne, il attend à bord (npcPending).
  const ORDER_MODES = {
    manual:    { label: 'Me demander', short: 'à tes ordres', sub: 'Chaque convoi repéré attend ta décision, pendant sa fenêtre de passage' },
    rob_heavy: { label: 'Dévaliser les cales pleines', short: 'cales pleines', sub: 'Aborde les convois chargés, laisse filer les cales légères' },
    rob_all:   { label: 'Dévaliser tout ce qui passe', short: 'tout ce qui passe', sub: 'Aborde chaque convoi : plus de butin, plus de combats' },
    spy:       { label: 'Filer sans se montrer', short: 'filature', sub: 'Laisse passer et suit le convoi un tronçon de plus : la route avance, personne ne sait' },
  };
  const NPC_MIX = { marchand: { metal: .4, cristal: .3, energie: .3 }, contrebande: { cristal: .7, energie: .3 }, recup: { metal: .9, cristal: .1 },
    arme: { metal: .5, energie: .5 }, pelerins: { energie: .6, metal: .4 } };
  const FILL = { 'léger': .1, 'moyen': .3, 'lourd': .6 };
  const HEAT_MS = 6 * 3600 * 1000;
  const fleets = () => ((typeof G !== 'undefined' && G && G.fleet && G.fleet.prepared) || []);
  const fleetById = (id) => fleets().find(x => x.id === id) || null;
  const tiers = (typeof SHIP_TIERS !== 'undefined') ? SHIP_TIERS : null;
  const cnt = (f, type, t) => Math.max(0, (f.composition && f.composition[type] && f.composition[type][t]) || 0);
  const sumRes = (o) => ['metal', 'energie', 'cristal'].reduce((s, k) => s + Math.max(0, Math.floor(Number(o && o[k]) || 0)), 0);
  const resLine = (o) => (typeof _mpResLine === 'function') ? _mpResLine(o) : JSON.stringify(o);
  function ordersOf(f) {
    const o = f && f.ambush && f.ambush.orders;
    const mode = (o && ORDER_MODES[o.mode]) ? o.mode : 'manual';
    return { mode, players: mode !== 'manual' && !!(o && o.players) };
  }
  function ordersLabel(f) {
    const o = ordersOf(f);
    return o.mode === 'manual' ? 'Ordres : à tes ordres' : `Ordres : ${ORDER_MODES[o.mode].short}${o.players ? ' · joueurs compris' : ' · PNJ seulement'}`;
  }
  async function chooseOrders(cur) {
    if (typeof _mpChoose !== 'function') return null;
    const m = await _mpChoose('Ordres permanents de la flotte', Object.entries(ORDER_MODES).map(([k, v]) => ({ k, label: v.label + (cur && cur.mode === k ? ' · actuel' : ''), sub: v.sub })));
    if (!m) return null;
    if (m.k === 'manual') return { mode: 'manual', players: false };
    const p = await _mpChoose('Et les convois des autres commandants ?', [
      { v: false, label: 'Seulement les convois PNJ', sub: 'Un convoi de joueur attend ta décision' },
      { v: true, label: 'Les convois de joueurs aussi', sub: 'Même quand tu n\'es pas là. Pactes, saison et protections restent respectés' },
    ]);
    if (!p) return null;
    return { mode: m.k, players: p.v };
  }
  async function pushOrders(f, force) {
    const a = f && f.ambush;
    if (!a || a.phase !== 'posted' || !a.mpAmbushId || a.ordersSync || !online()) return;
    if (!force && Date.now() - (a.ordersTry || 0) < 5 * 60000) return;
    a.ordersTry = Date.now();
    try { await _mpRpc('mp_ambush_orders', { p_fleet_id: f.id, p_orders: ordersOf(f) }); a.ordersSync = true; if (typeof saveGame === 'function') saveGame(); }
    catch (e) { console.warn('[routes] ordres :', String(e && e.message || e)); }
  }
  async function setOrders(fleetId) {
    const f = fleetById(fleetId);
    if (!f || !f.ambush || f.ambush.phase === 'returning') return;
    const o = await chooseOrders(ordersOf(f));
    if (!o || !f.ambush) return;
    const was = ordersOf(f);
    if (was.mode === 'spy' && was.players) G._spiedPending = true;   // ce qui a été filé avant le changement reste à relever
    f.ambush.orders = o; f.ambush.ordersSync = false; f.ambush.ordersTry = 0;
    pushOrders(f, true);
    if (typeof toast === 'function') toast(`${f.name} · ${ordersLabel(f).replace('Ordres : ', 'ordres : ')}`);
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  }

  // ── cale de la flotte : capacité de ses tankers, ce qu'elle porte (registre + butin PNJ pas encore inscrit)
  function holdCap(f) { return tiers ? [1, 2, 3].reduce((s, n) => s + cnt(f, 'tanker', 't' + n) * tiers.tanker[n].cargo, 0) : 0; }
  function holdUsed(a) { return sumRes(a && a.hold) + sumRes(a && a.npcPending) + sumRes(a && a.npcInflight && a.npcInflight.sent); }
  function holdAll(a) { const o = {}; for (const k of ['metal', 'energie', 'cristal']) { const v = Math.floor(Number((a && a.hold && a.hold[k]) || 0)) + Math.floor(Number((a && a.npcPending && a.npcPending[k]) || 0)) + Math.floor(Number((a && a.npcInflight && a.npcInflight.sent && a.npcInflight.sent[k]) || 0)); if (v > 0) o[k] = v; } return o; }
  function fleetAtk(f) { return tiers ? ['fregate', 'cuirasse'].reduce((s, ty) => s + [1, 2, 3].reduce((x, n) => x + cnt(f, ty, 't' + n) * tiers[ty][n].atk, 0), 0) : 0; }
  // ce que la ligne oppose : l'escorte du convoi, renforcée quand la ligne a été pillée récemment
  function heatOf(lineId, t) {
    const list = ((G.lineHeat || {})[lineId] || []).filter(x => x <= t && t - x < HEAT_MS);
    return Math.min(3, 1 + 0.5 * list.length);
  }
  function escortOf(cv, lineId, t) {
    if (!tiers) return 1;
    const T = cv.tier;
    const base = cv.escort === 'escorte lourde' ? tiers.cuirasse[T].def : cv.escort === 'escorte légère' ? tiers.fregate[T].def : tiers.tanker[T].def * 0.5;
    return cv.ships * base * heatOf(lineId, t);
  }
  function odds(f, cv, lineId, t) { const A = fleetAtk(f), E = escortOf(cv, lineId, t); return A > 0 ? A / (A + E) : 0; }
  function oddsLabel(p) { return p >= 0.7 ? 'chances favorables' : p >= 0.4 ? 'combat incertain' : p > 0 ? 'escorte trop forte' : 'aucun vaisseau armé'; }
  // butin d'un convoi PNJ : la moitié de ce que portent ses cales, selon sa nature
  function npcLoot(cv, kindKey) {
    if (!tiers) return {};
    const total = Math.floor(tiers.tanker[cv.tier].cargo * (FILL[cv.cargo] || 0.1) * cv.ships * 0.5);
    const mix = NPC_MIX[kindKey] || NPC_MIX.marchand, out = {};
    for (const [k, w] of Object.entries(mix)) { const v = Math.floor(total * w); if (v > 0) out[k] = v; }
    return out;
  }
  function capLoot(loot, free) {
    const out = {};
    for (const k of ['metal', 'energie', 'cristal']) { const v = Math.min(Math.max(0, loot[k] || 0), free); if (v > 0) { out[k] = v; free -= v; } }
    return out;
  }
  const seesHere = (sys) => (G.probesPool || []).some(p => p.tier === 'beacon' && p.state === 'deployed' && sysOf(p.deployedSystem) === sys);
  const pidOf = (line, k, dir) => `${line.id}:${k}:${dir}`;
  const CV_NAME = { marchand: 'un convoi marchand', contrebande: 'un convoi de contrebande', recup: 'un convoi de récupérateurs', arme: 'un convoi armé', pelerins: 'un convoi de pèlerins' };
  const cvName = (cv) => CV_NAME[cv.kindKey] || 'un convoi';
  function portLabel(line) { return G.hiddenPorts && G.hiddenPorts[line.port] ? G.hiddenPorts[line.port].name : null; }

  // l'abordage d'un passage PNJ (résolu ici, déterministe pour cette flotte et ce passage)
  function robNpc(f, line, i, k, dir, t, how) {
    const a = f.ambush;
    if (!a) return null;
    const pid = pidOf(line, k, dir);
    if (fleets().some(x => x.ambush && (x.ambush.npcDone || []).includes(pid))) return null;
    a.npcDone = [pid].concat(a.npcDone || []).slice(0, 40);
    const cv = convoyOf(line, k, dir);
    const sys = a.system;
    const r = rngOf(`rob:${f.id}:${pid}`);
    const A = fleetAtk(f), E = escortOf(cv, line.id, t);
    const p = A > 0 ? A / (A + E) : 0;
    const win = r() < p;
    // pertes : une part des vaisseaux armés (et des tankers si l'abordage échoue)
    const before = JSON.parse(JSON.stringify(f.composition || {}));
    const after = JSON.parse(JSON.stringify(f.composition || {}));
    const q = win ? 0.25 * E / (A + E) : 0.15 + 0.45 * E / (A + E);
    for (const ty of ['fregate', 'cuirasse', 'tanker']) for (const tt of ['t1', 't2', 't3']) {
      const n = cnt(f, ty, tt); if (!n) continue;
      const qq = ty === 'tanker' ? (win ? 0 : q * 0.3) : q;
      const lost = Math.min(n, Math.floor(n * qq + r()));
      if (lost > 0) { after[ty] = after[ty] || {}; after[ty][tt] = n - lost; }
    }
    if (typeof _mpSyncFleetLosses === 'function') _mpSyncFleetLosses(f, after);
    else f.composition = after;
    let loot = {};
    if (win) {
      loot = capLoot(npcLoot(cv, line.kind.key), Math.max(0, holdCap(f) - holdUsed(a)));
      if (sumRes(loot) > 0) {
        a.npcPending = a.npcPending || {};
        for (const [kk, v] of Object.entries(loot)) a.npcPending[kk] = (a.npcPending[kk] || 0) + v;
      }
      if (!G.lineHeat || typeof G.lineHeat !== 'object') G.lineHeat = {};
      G.lineHeat[line.id] = (G.lineHeat[line.id] || []).filter(x => t - x < HEAT_MS).concat([t]).slice(-6);
    }
    if (JSON.stringify(before) !== JSON.stringify(f.composition || {})) a.npcFleetDirty = true;
    const lossLine = (typeof _mpLossLine === 'function') ? _mpLossLine(before, f.composition) : '';
    const type = !win ? 'robbed_fail' : sumRes(loot) > 0 ? 'robbed_ok' : 'robbed_empty';
    const port = portLabel(line);
    if (typeof _mpPirReport === 'function') {
      _mpPirReport(type, { icon: '⚔', npc: true, noTanker: holdCap(f) <= 0, pseudo: cv.label, who: cvName(cv), ships: cv.ships, escort: cv.escort, system: sys, fleet: f.name, loot,
        leg: dir === 'out' ? 'out' : 'back', dock: port, auto: how === 'auto', lossLine }, 'npc-' + f.id + '-' + pid);
    }
    markReport(line, k, dir, sys, win ? 'robbed' : 'repelled');
    if (typeof toast === 'function') toast(type === 'robbed_ok' ? `⚔ ${f.name} a dévalisé ${cvName(cv)} : +${resLine(loot)} en cale`
      : type === 'robbed_empty' ? `⚔ ${f.name} a arraisonné ${cvName(cv)}, mais ${holdCap(f) > 0 ? 'sa cale est pleine' : 'elle n\'a pas de tanker'} : rien emporté`
      : `⚔ ${cv.escort === 'sans escorte' ? 'L\'équipage' : 'L\'escorte'} d'${cvName(cv)} a repoussé ${f.name}${lossLine ? ' · pertes : ' + lossLine : ''}`);
    return { win, loot, type };
  }
  // filer un convoi : un tronçon de plus dans le sens de sa marche
  function tailNpc(f, line, i, k, dir) {
    const a = f.ambush;
    const pid = pidOf(line, k, dir);
    a.npcDone = (a.npcDone || []);
    if (a.npcDone.includes(pid)) return null;
    a.npcDone = [pid].concat(a.npcDone).slice(0, 40);
    const n = line.chain.length;
    const next = capOf(line, i, dir);
    const j = dir === 'out' ? i + 1 : i - 1;
    const next2 = next && j >= 0 && j < n ? capOf(line, j, dir) : null;
    markReport(line, k, dir, a.system, 'tailed');
    if (!next || !next2 || !SYS.test(next) || !SYS.test(next2)) return null;
    state();
    if (G.spottedLegs.some(l => l.npc && l.from === next && l.to === next2)) return null;
    const cv = convoyOf(line, k, dir);
    G.spottedLegs.unshift({ id: `tl-${line.id}-${next}-${next2}`, lineId: line.id, from: next, to: next2, pseudo: cv.label + ' (filé)', at: Date.now(), npc: true, cargo: cv.cargo });
    G.spottedLegs = capLegs(G.spottedLegs);
    if (!G.mapSeen) G.mapSeen = {};
    for (const x of [next, next2]) if (!G.mapSeen[x]) G.mapSeen[x] = Date.now();
    if (network().ports[next2]) discoverPort(next2, Date.now());
    if (typeof toast === 'function') toast(`🛰 ${f.name} a filé ${cvName(cv)} : tronçon ${next} → ${next2} relevé`, () => { if (typeof openSystemOnMap === 'function') openSystemOnMap(next2); });
    return { from: next, to: next2 };
  }
  function markReport(line, k, dir, sys, done) {
    const r = (G.beaconReports || []).find(x => x.id === `ln-${line.id}-${k}-${dir}-${sys}`);
    if (r && r.line) { r.line.done = done; r.read = true; }
  }
  // inscrire au registre le butin et les pertes PNJ (un lot à la fois, rejouable sans double compte)
  // renvoie true (inscrit, ou rien à inscrire), 'local' (le registre ne le prendra pas : le butin reste à bord,
  // payé au retour) ou false (registre injoignable : réessayer)
  let _npcBusy = false, _npcMissingAt = 0;
  async function pushNpc(f, wait) {
    const a = f && f.ambush;
    if (wait) for (let n = 0; _npcBusy && n < 50; n++) await new Promise(r => setTimeout(r, 100));
    if (!a || a.phase !== 'posted') return 'local';
    if (!a.npcInflight && !(sumRes(a.npcPending) > 0 || a.npcFleetDirty)) return true;
    if (!a.mpAmbushId || Date.now() - _npcMissingAt < 10 * 60000) return 'local';
    if (_npcBusy || !online()) return false;
    _npcBusy = true;
    // un lot envoyé est figé : on le renvoie à l'identique tant que le registre n'a pas répondu (jamais compté deux fois)
    if (!a.npcInflight) {
      a.npcInflight = { key: 'nb-' + f.id + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), sent: Object.assign({}, a.npcPending || {}), comp: JSON.stringify(f.composition || {}) };
      a.npcPending = {};
      a.npcFleetDirty = false;
      if (typeof saveGame === 'function') saveGame();
    }
    const fl = a.npcInflight;
    try {
      const payload = (typeof _mpFleetPayload === 'function') ? _mpFleetPayload(f) : { composition: f.composition };
      const res = await _mpRpc('mp_ambush_npc', { p_fleet_id: f.id, p_key: fl.key, p_loot: fl.sent, p_fleet: payload });
      if (f.ambush !== a || a.npcInflight !== fl) return false;
      if (res && res.hold) a.hold = { metal: +res.hold.metal || 0, energie: +res.hold.energie || 0, cristal: +res.hold.cristal || 0 };
      a.npcInflight = null;
      if (res && res.dup && JSON.stringify(f.composition || {}) !== fl.comp) a.npcFleetDirty = true;   // pertes à inscrire au lot suivant
      if (typeof saveGame === 'function') saveGame();
      return true;
    } catch (e) {
      const msg = String(e && e.message || e);
      const back = () => { a.npcPending = a.npcPending || {}; for (const [k, v] of Object.entries(fl.sent)) a.npcPending[k] = (a.npcPending[k] || 0) + v; a.npcInflight = null; };
      if (/PGRST202|Could not find the function/.test(msg)) { _npcMissingAt = Date.now(); back(); return 'local'; }   // registre pas encore à jour (v15) : à bord
      if (/ambush_unknown/.test(msg)) { back(); return 'local'; }                                                     // embuscade déjà levée : à bord
      console.warn('[routes] butin PNJ :', msg); return false;
    } finally { _npcBusy = false; }
  }
  // tick : les passages PNJ devant mes flottes postées depuis le dernier passage du jeu
  function tickAmbushes(now) {
    if (typeof G === 'undefined' || !G) return;
    state();
    const net = network();
    let dirty = false;
    for (const f of fleets()) {
      const a = f.ambush;
      if (!a || a.phase !== 'posted') continue;
      pushOrders(f);
      if (a.blind || !seesHere(a.system)) { a.npcAt = now; pushNpc(f); continue; }   // sans balise : à l'aveugle
      const on = (net.bySys[a.system] || []).filter(o => !o.isPort);
      const from = Math.max(a.npcAt || a.postedAt || now, now - HEAT_MS);
      a.npcAt = now;
      if (!on.length) continue;
      const o = ordersOf(f);
      if (o.mode === 'manual') continue;
      let list = [];
      for (const { line, i } of on) for (const ps of passages(line, i, from, now)) list.push({ line, i, ...ps });
      list.sort((x, y) => x.t - y.t);
      let skipped = false;
      for (const ps of list.slice(-6)) {
        if (!f.ambush) break;
        const cv = convoyOf(ps.line, ps.k, ps.dir);
        if (o.mode === 'spy') { tailNpc(f, ps.line, ps.i, ps.k, ps.dir); dirty = true; continue; }
        if (o.mode === 'rob_heavy' && cv.cargo === 'léger') continue;
        if (fleetAtk(f) <= 0 || holdCap(f) - holdUsed(a) <= 0) continue;     // rien à gagner : la flotte regarde passer
        // un capitaine ne se jette pas sur une escorte qui le dépasse : il laisse passer et le signale
        if (odds(f, cv, ps.line.id, ps.t) < 0.35) {
          markReport(ps.line, ps.k, ps.dir, a.system, 'tooStrong');
          if (!skipped && typeof toast === 'function') toast(`${f.name} laisse passer ${cvName(cv)} : escorte trop forte pour elle`);
          skipped = true; continue;
        }
        robNpc(f, ps.line, ps.i, ps.k, ps.dir, ps.t, 'auto');
        dirty = true;
      }
      pushNpc(f);
    }
    if (dirty) {
      if (typeof saveGame === 'function') saveGame();
      if (typeof updateProspectRapportsBadge === 'function') { try { updateProspectRapportsBadge(); } catch (e) {} }
      if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
      if (typeof getCurrentScreen === 'function' && getCurrentScreen() === 'fleet-detail' && typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    }
    autoPlayers();
    pollSpied();
  }
  // le registre applique les ordres aux convois de joueurs ; tout jeu ouvert l'y aide
  let _autoAt = 0;
  async function autoPlayers() {
    if (!online() || Date.now() - _autoAt < 30000) return;
    _autoAt = Date.now();
    try {
      const n = await _mpRpc('mp_auto_ambush', {});
      if (n > 0 && window.SBMP && SBMP.resolveDue) SBMP.resolveDue(true);
    } catch (e) {}
  }
  // routes de joueurs filées en mon absence
  let _spiedAt = 0;
  async function pollSpied() {
    if (!online() || Date.now() - _spiedAt < 60000) return;
    // une flotte qui file (ou qui vient de filer) des convois de joueurs : une relève de plus après son retour
    const spying = fleets().some(f => f.ambush && ordersOf(f).players && ordersOf(f).mode === 'spy');
    if (!spying && !G._spiedPending) return;
    _spiedAt = Date.now();
    let rows;
    try { rows = await _mpRpc('mp_spied_inbox', {}); } catch (e) { return; }
    G._spiedPending = spying;
    for (const o of Array.isArray(rows) ? rows : []) {
      const addr = /^[A-Z]-[A-Z]-\d{4}-\d{2}$/.test(o.address || '') ? o.address : null;
      const okSys = (x) => SYS.test(x || '') ? x : null;
      const who = clean(o.pseudo || '?', 24);
      if (addr && o.pseudo && typeof _mpMergeSender === 'function') _mpMergeSender(addr, who);
      const at = fleets().find(f => f.ambush && f.ambush.phase === 'posted' && [o.from_system, o.to_system].includes(f.ambush.system));
      if (typeof _mpPirReport === 'function') _mpPirReport('spied', { icon: '👁', pseudo: who, address: addr, from: okSys(o.from_system), to: okSys(o.to_system),
        dock: o.dock_name ? clean(o.dock_name, 40) : null, system: at ? at.ambush.system : null, auto: true }, 'spy-' + o.convoy_id);
      if (typeof toast === 'function') toast(`👁 Ta flotte a filé le convoi de ${who} : route relevée`);
    }
    if (rows && rows.length && typeof saveGame === 'function') saveGame();
  }
  setInterval(() => { if (document.visibilityState !== 'hidden') { try { tickAmbushes(Date.now()); } catch (e) { console.warn('[routes] embuscades', e); } } }, 20000);

  // rapport de balise PNJ + flotte postée sur ce jalon : aborder, filer, laisser passer (ordre « me demander »)
  function npcReportCan(r) {
    if (!r || !r.line || r.line.port || r.line.done || r.line.k == null || Date.now() > (r.expiresAt || 0)) return null;
    const f = (typeof _mpPostedFleetAt === 'function') ? _mpPostedFleetAt(r.systemCoord) : null;
    if (!f || !seesHere(r.systemCoord)) return null;
    const line = network().byId[r.line.id];
    if (!line) return null;
    const i = line.chain.indexOf(r.systemCoord);
    const pid = pidOf(line, r.line.k, r.line.dir);
    if (i < 0 || fleets().some(x => x.ambush && (x.ambush.npcDone || []).includes(pid))) return null;   // déjà réglé
    return { f, line, i };
  }
  async function npcReportAction(r) {
    const c = npcReportCan(r);
    if (!c) return false;
    const { f, line, i } = c;
    const cv = convoyOf(line, r.line.k, r.line.dir);
    const p = odds(f, cv, line.id, r.line.t);
    const free = holdCap(f) - holdUsed(f.ambush);
    const est = capLoot(npcLoot(cv, line.kind.key), Math.max(0, free));
    const it = await _mpChoose(`${cv.label} · ${cv.ships} vaisseaux · ${cv.escort} · cales ${cv.cargo === 'léger' ? 'légères' : 'pleines'}`, [
      { k: 'rob', label: `Aborder avec ${f.name}`, sub: `${oddsLabel(p)} · ${free > 0 ? 'butin possible : ' + resLine(est) : holdCap(f) > 0 ? 'cale pleine : rien ne pourra être emporté' : 'pas de tanker : rien ne pourra être emporté'}` },
      { k: 'tail', label: 'Le filer sans se montrer', sub: 'La route avance d\'un tronçon dans le sens de sa marche' },
      { k: 'pass', label: 'Le laisser passer', sub: 'Rien ne bouge' },
    ]);
    if (!it || !f.ambush || f.ambush.phase !== 'posted') return true;
    if (Date.now() > (r.expiresAt || 0)) { toast('Trop tard : le convoi est passé'); return true; }
    if (it.k === 'rob') { if (fleetAtk(f) <= 0) { toast('Il faut des frégates ou des cuirassés pour aborder'); return true; } robNpc(f, line, i, r.line.k, r.line.dir, r.line.t, 'manual'); pushNpc(f); }
    else if (it.k === 'tail') {
      const leg = tailNpc(f, line, i, r.line.k, r.line.dir);
      if (!leg) toast(r.line.dir === 'out' && i >= line.chain.length - 2 ? 'Le convoi entre au lieu caché : rien de plus à relever' : r.line.dir === 'in' && i <= 1 ? 'Le convoi se perd vers les marges' : 'Ta flotte le suit sur un tronçon déjà connu');
    }
    else { r.line.done = 'passed'; }
    if (typeof saveGame === 'function') saveGame();
    if (typeof updateProspectRapportsBadge === 'function') { try { updateProspectRapportsBadge(); } catch (e) {} }
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
    return true;
  }
  // 15/10 (Adrien : « je touche un convoi sur une ligne, rien ne se passe ») — la fiche d'un passage PNJ :
  // ce qu'on a vu, ce que ça veut dire pour remonter la ligne, et ce qu'on peut faire maintenant.
  function reportSheet(r) {
    if (!r || !r.line) return false;
    state();
    const line = network().byId[r.line.id];
    const sys = r.systemCoord, cap = r.line.cap, dir = r.line.dir;
    const t = r.target || {};
    const label = (r.line.label || 'Convoi').toLowerCase();
    const cvn = line ? cvName({ kindKey: line.kind.key }) : 'un convoi';
    const heavy = (t.cargoEstimate || r.line.cargo) !== 'léger';
    const ago = (x) => { const m = Math.max(0, Math.round((Date.now() - x) / 60000)); return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`; };
    const open = Date.now() < (r.expiresAt || 0);
    const info = infoFor(sys);
    const ob = info && info.obs.find(o => o.lineId === r.line.id);
    const port = line && G.hiddenPorts[line.port] ? G.hiddenPorts[line.port] : null;
    const routes = routesOf(sys);
    const P = (x) => `<p style="margin:0 0 9px;font-size:12.5px;line-height:1.55;color:#c8d4dc">${x}</p>`;
    let body = P(`<b style="color:#e6f0ff">${cap1(cvn)}</b> (${r.line.ships || '?'} vaisseaux, ${r.line.escort || 'escorte inconnue'}, cales ${heavy ? 'pleines' : 'légères'}) est passé par ta balise en <b class="mono" style="color:#cdb4ff">${sys}</b>, ${ago(r.createdAt)}.`);
    if (port) body += P(`Cette ligne mène à <b style="color:#ffd08a">${port.name}</b>${routes.length ? ', et tu connais la route.' : '.'}`);
    else if (cap) body += heavy
      ? P(`Il filait vers <b class="mono" style="color:#ffd08a">${cap}</b> : <b>cales pleines, il va vers le lieu caché</b>. Pose une balise sur ${cap} : au prochain passage, elle relèvera le tronçon suivant. Tronçon après tronçon, tu remontes jusqu'au lieu.`)
      : P(`Il filait vers <b class="mono" style="color:#ffd08a">${cap}</b>, mais <b>cales légères : il revient du lieu caché</b>. Ce cap t'éloigne du lieu. Attends un convoi chargé (cales pleines) : son cap te montrera dans quel sens remonter.`);
    else body += P(`Son cap n'a pas pu être relevé : il se perd vers les marges, au bout de la ligne.`);
    if (ob) body += P(`<span style="color:#9fb3bf">${ob.n} passage${ob.n > 1 ? 's' : ''} observé${ob.n > 1 ? 's' : ''} sur cette ligne${ob.periodMin ? ` · repasse toutes les ~${ob.periodMin} min` : ''}.</span>`);
    const acts = [];
    const c = npcReportCan(r);
    if (c) acts.push({ k: 'decide', label: `⚔ Décider avec ${c.f.name}`, sub: 'Aborder, le filer ou le laisser passer · ta flotte est sur ce jalon', col: '#c9a8ff' });
    if (cap && heavy && !port) {
      const has = (G.probesPool || []).some(p => p.tier === 'beacon' && p.state === 'deployed' && sysOf(p.deployedSystem) === cap);
      const going = (G.probeMissions || []).some(m => m.tier === 'beacon' && m.status === 'in_transit' && sysOf(m.targetCoords) === cap);
      const st = typeof _probeTierStatus === 'function' ? _probeTierStatus('beacon') : { ok: false };
      if (has) acts.push({ k: 'map', sys: cap, label: `Ta balise surveille déjà ${cap}`, sub: 'Voir sur la carte', col: '#b48cff' });
      else if (going) acts.push({ k: 'map', sys: cap, label: `Balise en route vers ${cap}`, sub: 'Voir sur la carte', col: '#b48cff' });
      else if (st.ok) acts.push({ k: 'beacon', sys: cap, label: `Suivre le cap : poser une balise sur ${cap}`, sub: 'Elle relèvera le tronçon suivant au prochain passage', col: '#b48cff' });
      else acts.push({ k: 'map', sys: cap, label: `Voir ${cap} sur la carte`, sub: st.why ? st.why + ' : construis ou rappelle une balise pour suivre le cap' : 'Il faut une balise prête pour suivre le cap', col: '#b48cff' });
    }
    for (const ro of routes.slice(0, 2)) acts.push({ k: 'route', id: ro.id, label: `Voir la route : ${clean(ro.name)}`, sub: ro.end ? 'arrivée' : `jalon ${ro.idx} sur ${ro.n}`, col: ro.color });
    if (!c && open && !(fleets().some(f => f.ambush && f.ambush.system === sys))) acts.push({ k: 'fleet', label: 'Poster une flotte ici', sub: 'Les prochains convois de la ligne pourront être abordés ou filés', col: '#c9a8ff' });
    acts.push({ k: 'map', sys, label: `Voir ${sys} sur la carte`, sub: 'La balise, les tronçons relevés, la ligne', col: '#5fffe8' });
    const ov = document.createElement('div');
    ov.id = 'sb-line-sheet';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML = `<div style="width:100%;max-width:480px;max-height:86vh;overflow:auto;background:#0d1218;border-top:1px solid var(--border);border-radius:14px 14px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px"><div style="font-size:11px;color:#a370ff;letter-spacing:.14em;text-transform:uppercase">Convoi sur une ligne</div><div style="font-size:10px;color:${open ? '#a370ff' : 'var(--mut)'}">${open ? 'fenêtre ' + Math.max(1, Math.ceil((r.expiresAt - Date.now()) / 60000)) + ' min' : 'passé'}</div></div>
      ${body}
      <div style="margin-top:6px">${acts.map((a, k) => `<button data-k="${k}" style="display:block;width:100%;text-align:left;padding:12px 14px;margin-bottom:8px;background:transparent;border:1px solid ${a.col}66;border-radius:8px;color:${a.col};font-family:inherit;font-size:13px;cursor:pointer">${a.label}<div style="font-size:10px;color:var(--mut);margin-top:3px">${a.sub || ''}</div></button>`).join('')}</div>
      <button data-k="-1" style="width:100%;padding:11px;background:transparent;border:1px solid var(--border);color:var(--mut);border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer">Fermer</button></div>`;
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b && e.target !== ov) return;
      const a = b ? acts[+b.dataset.k] : null;
      ov.remove();
      if (!a) return;
      if (a.k === 'decide') npcReportAction(r);
      else if (a.k === 'beacon') {
        const m = typeof launchProbe === 'function' ? launchProbe('beacon', a.sys, 'local', false) : null;
        if (m) { if (typeof saveGame === 'function') saveGame(); toast(`Balise en route vers ${a.sys}`); if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e2) {} } }
      } else if (a.k === 'route') { if (typeof openSystemOnMap === 'function') openSystemOnMap(sys); setTimeout(() => { if (window.SBMap && SBMap.selectRoute) SBMap.selectRoute(a.id); }, 700); }
      else if (a.k === 'fleet') {
        const fl = fleets().filter(f => (f.status || 'prepared') === 'deployed' && fleetAtk(f) > 0);
        if (!fl.length) { toast('Aucune flotte armée en orbite : prépare-en une (Flotte)'); return; }
        const pick = fl.length === 1 ? { f: fl[0] } : await _mpChoose('Quelle flotte poster ici ?', fl.map(f => ({ f, label: clean(f.name, 40), sub: 'en orbite' })));
        if (pick && typeof mpAmbushStart === 'function') mpAmbushStart(pick.f.id, [sys]);
      } else if (a.k === 'map' && typeof openSystemOnMap === 'function') openSystemOnMap(a.sys);
    });
    document.body.appendChild(ov);
    return true;
  }
  // trajet d'une flotte vers un jalon : par une route connue (et balisée), plus vite qu'à découvert
  function ambushTravel(sys, baseMs) {
    let best = null;
    const consider = (id, name, chain, mids) => {
      if (!chain.includes(sys)) return;
      const b = balisageChain(mids);
      const factor = 0.8 * b.factor;
      if (!best || factor < best.factor) best = { id, name, chain, factor, ratio: b.ratio };
    };
    for (const r of (G.routes || [])) if (r.portSys) { const ch = knownChain(r.portSys); consider(r.id, r.name, ch, ch.slice(0, -1)); }
    for (const o of openedRoutes()) if (!o.fake) consider(o.id, o.name, o.chain, o.chain.slice(1, -1));
    return best ? { ms: Math.round(baseMs * best.factor), route: best } : { ms: baseMs, route: null };
  }
  // ce que la carte montre d'une embuscade sur ce système
  function ambushAt(sys) { return fleets().filter(f => f.ambush && f.ambush.system === sys && f.ambush.phase !== 'returning'); }

  /* ── E2 · une carte de route devient une piste : elle place sur une ligne, plus ou moins près du lieu ── */
  function activateCard(card) {
    state();
    const home = myHome() || '';
    const sec = home.split('-')[1];
    const lines = network().lines;
    const pool = lines.filter(l => l.sector === sec);
    const list = pool.length ? pool : lines;
    if (!list.length || !card) return null;
    const line = list[h32('carte:' + card.id) % list.length];
    const n = line.chain.length, now = Date.now();
    const kind = card.kind || 'clean';
    if (kind === 'fake' && h32('fake:' + card.id) % 10 < 7) return { fake: true };
    // propre : à 1 tronçon du lieu · trouée : à 3 tronçons, un trou au milieu · morte : au tout début · chantante : le lieu lui-même
    let at, legs = [];
    if (kind === 'singing') { at = n - 1; legs = [[n - 1, -1]]; }
    else if (kind === 'clean') { at = n - 1; legs = [[n - 2, n - 1]]; }
    else if (kind === 'holed') { at = Math.max(0, n - 3); legs = [[Math.max(0, n - 4), Math.max(0, n - 3)]]; }
    else { at = 0; legs = []; }
    const sys = line.chain[at];
    for (const [i, j] of legs) {
      const from = line.chain[i], to = j < 0 ? line.port : line.chain[j];
      if (!G.spottedLegs.some(l => l.npc && l.from === from && l.to === to))
        G.spottedLegs.unshift({ id: `cd-${card.id}-${from}`, lineId: line.id, from, to, pseudo: 'Carte : ' + (card.name || 'carte de route'), at: now, npc: true, cargo: 'lourd' });
    }
    G.trafficEchoes[sys] = { lineId: line.id, at: now, fromCard: card.name || null };
    if (!G.mapSeen) G.mapSeen = {};
    G.mapSeen[sys] = now;
    if (kind === 'singing') discoverPort(line.port, now);
    if (typeof saveGame === 'function') saveGame();
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
    return { sys, lineId: line.id, kind };
  }

  /* ── l'antenne capte un écho de trafic (un jalon où poser une balise) ── */
  function antennaOn() {
    try { const a = (window.SBAntenna && typeof SBAntenna.data === 'function') ? SBAntenna.data() : G.antenna; return !!(a && a.built && !a.building); } catch (e) { return false; }
  }
  // PATCH_2010_COLONIE — chaque antenne construite (capitale et colonies) écoute autour de SA planète
  function antennaHomes() {
    const out = [];
    try {
      const on = (a) => !!(a && a.built && !a.building);
      const ws = Array.isArray(G.worlds) ? G.worlds : [];
      if (ws.length < 2) { if (antennaOn()) { const h = myHome(); if (h) out.push(h); } return out; }
      for (const w of ws) {
        const active = w.id === (G.activeWorld || 'home');
        const a = active ? G.antenna : (w.data && w.data.antenna);
        if (!on(a)) continue;
        const h = w.id === 'home' ? myHome() : sysOf(w.coord);
        if (h && !out.includes(h)) out.push(h);
      }
    } catch (e) {}
    return out;
  }
  function antennaName(home) {
    try {
      if (home === myHome()) return null;
      const w = (G.worlds || []).find(x => x.id !== 'home' && sysOf(x.coord) === home);
      return w ? w.name : null;
    } catch (e) { return null; }
  }
  function tickEcho(now) {
    if (typeof G === 'undefined' || !G) return;
    const homes = antennaHomes();
    if (!homes.length) return;
    state();
    const echoes = Object.entries(G.trafficEchoes).filter(([, e]) => !e.fromCard);   // les pistes des cartes ne comptent pas
    // une antenne neuve (colonie) capte tout de suite son premier écho
    const fresh = homes.find(h => !echoes.some(([, e]) => (e.home || myHome()) === h));
    const last = echoes.reduce((m, [, e]) => Math.max(m, e.at || 0), 0);
    if (!fresh && echoes.length && now - last < ECHO_EVERY_MS) return;
    // pas d'écho de plus tant que deux échos attendent une balise
    const beaconSys = new Set((G.probesPool || []).filter(p => p.tier === 'beacon' && p.state === 'deployed').map(p => sysOf(p.deployedSystem)));
    const waiting = echoes.filter(([s]) => !beaconSys.has(s)).length;
    if (!fresh && waiting >= 2) return;
    // à tour de rôle entre les antennes
    const home = fresh || homes[echoes.length % homes.length]; if (!home) return;
    const sec = home.split('-')[1];
    const lines = network().lines;
    const mine = lines.filter(l => l.sector === sec);
    const pool = mine.length ? mine : lines;
    if (!pool.length) return;
    // une ligne différente à chaque écho, choisie pour ce joueur ; un jalon loin du port (début de piste)
    const already = new Set(echoes.map(([, e]) => e.lineId));
    const cands = pool.filter(l => !already.has(l.id));
    const list = cands.length ? cands : pool;
    const l = list[h32(home + ':echo:' + echoes.length) % list.length];
    const idx = h32(home + ':' + l.id) % Math.min(3, l.chain.length);
    const sys = l.chain[idx];
    G.trafficEchoes[sys] = { lineId: l.id, at: now, home };
    if (!G.mapSeen) G.mapSeen = {};
    G.mapSeen[sys] = now;
    if (typeof saveGame === 'function') saveGame();
    if (typeof toast === 'function') toast(`📡 ${antennaName(home) ? 'L\'antenne de ' + antennaName(home) : 'Ton antenne'} capte un trafic régulier vers ${sys} · pose une balise pour voir qui passe`, () => { if (typeof openSystemOnMap === 'function') openSystemOnMap(sys); });
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  }

  /* ── ce que la carte doit savoir d'un système ── */
  // { lane: bool (couloir connu du joueur), echo, port, obs: [{label, n, last, periodMin, caps:[…]}], beacon }
  function infoFor(sys) {
    if (typeof G === 'undefined' || !G || !SYS.test(sys || '')) return null;
    state();
    const netw = network();
    const on = netw.bySys[sys] || [];
    const echo = G.trafficEchoes[sys] || null;
    const port = G.hiddenPorts[sys] ? Object.assign({ sys }, G.hiddenPorts[sys]) : null;
    const legsOut = G.spottedLegs.filter(l => l.npc && l.from === sys);
    const legsIn = G.spottedLegs.filter(l => l.npc && l.to === sys);
    const swept = !!(G.knownSystems && Object.values(G.knownSystems).some(k => `${k.cluster}-${k.sector}-${k.system}` === sys))
      || (G.probeReports || []).some(r => r.tier === 'radar' && sysOf(r.targetCoords) === sys);
    const knowsLane = on.some(o => !o.isPort) && (!!echo || legsIn.length > 0 || legsOut.length > 0 || swept);
    const obs = [];
    for (const { line, isPort } of on) {
      if (isPort) continue;
      const ob = G.lineObs[line.id];
      if (!ob) continue;
      let per = null;
      for (const dir of ['out', 'in']) {
        const ts = (ob['t_' + dir + '@' + sys] || []).slice().sort((a, b) => a - b);
        if (ts.length < 2) continue;
        const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
        d.sort((a, b) => a - b);
        const m = Math.round(d[0] / 60000);   // le plus petit écart : un passage manqué ne double pas l'horaire
        per = per == null ? m : Math.min(per, m);
      }
      obs.push({ lineId: line.id, label: line.kind.label, n: ob.n, last: ob.last, periodMin: per,
        caps: legsOut.filter(l => l.lineId === line.id).map(l => l.to) });
    }
    if (!knowsLane && !echo && !port && !obs.length) return null;
    const route = port ? (G.routes || []).find(r => r.portSys === sys) || null : null;
    return { lane: knowsLane, echo: !!echo, fromCard: echo && echo.fromCard, port, route, obs, legsIn: legsIn.length, legsOut: legsOut.length };
  }
  function knownSystems() {
    if (typeof G === 'undefined' || !G) return [];
    state();
    return Object.keys(G.trafficEchoes).concat(Object.keys(G.hiddenPorts));
  }

  setInterval(() => { try { tickEcho(Date.now()); } catch (e) { console.warn('[lignes] écho', e); } }, 20000);

  window.SBLines = {
    beaconToast, network, passages, capOf, convoyOf, tickBeacons, tickEcho, infoFor, knownSystems, discoverPort,
    activateCard, ensureRoute, knownChain, balisage, balisageChain, routesBalisedBy, noteUser,
    openedRoutes, openedTo, scoutInFlight, scoutLaunch, scoutArrived, forgetOpened, giveRoute, pollGifts,
    dockMarketHtml, sellHere, withdrawOffer, buyOffer, learnRoute, noteRobbery, tickMarket, fetchOffers, sellableRoutes,
    ORDER_MODES, ordersOf, ordersLabel, chooseOrders, setOrders, pushOrders, pushNpc, holdCap, holdUsed, holdAll, fleetAtk, odds, oddsLabel,
    robNpc, tailNpc, tickAmbushes, capLegs, salesOn, soldChain, routesOf, reportSheet, npcReportCan, npcReportAction, ambushTravel, ambushAt, pollSpied, autoPlayers,
    WINDOW_MS, EPOCH, CROWN_DOCK_ID, SANCT_DOCK_ID, NOIRE_DOCK_ID, REFUGE_DOCK_ID, STATION_PORTS,
    _reset() { _net = null; },
  };
})();
