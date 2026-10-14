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
  };

  /* ── hachage déterministe (mêmes résultats sur tous les appareils) ── */
  function h32(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rngOf(seed) { let a = h32(seed) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ── le réseau ── */
  let _net = null;
  function network() {
    if (_net) return _net;
    const lines = [], bySys = {}, ports = {};
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
        const kind = KINDS[dock.type] || KINDS.hidden_freeport;
        const line = {
          id: dock.id + '-' + j, dockId: dock.id, port, chain, kind,
          period: (80 + Math.floor(r() * 70)) * 60000,      // un départ toutes les 80 à 150 min
          travel: (40 + Math.floor(r() * 30)) * 60000,      // 40 à 70 min de bout en bout
          offset: Math.floor(r() * 150) * 60000,
          sector: sec,
        };
        lines.push(line); ports[port].lines.push(line.id);
        chain.forEach((s, i) => { (bySys[s] = bySys[s] || []).push({ line, i }); });
        (bySys[port] = bySys[port] || []).push({ line, i: n, isPort: true });
      }
    }
    _net = { lines, bySys, ports, byId: Object.fromEntries(lines.map(l => [l.id, l])) };
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
  const sysOf = (c) => { const m = String(c || '').match(/^[A-Z]-[A-Z]-\d{4}/); return m ? m[0] : null; };
  function state() {
    if (!G.lineObs || typeof G.lineObs !== 'object') G.lineObs = {};       // lineId → { n, last, dirs:{out,in}, systems:[…] }
    if (!G.trafficEchoes || typeof G.trafficEchoes !== 'object') G.trafficEchoes = {};   // sys → { lineId, at }
    if (!G.hiddenPorts || typeof G.hiddenPorts !== 'object') G.hiddenPorts = {};         // port sys → { dockId, name, type, at }
    if (!Array.isArray(G.spottedLegs)) G.spottedLegs = [];
    // 14/10 : passage de 40 lieux à 3 — on oublie ce qui appartenait aux lignes qui n'existent plus
    if (G._linesNet !== 3) {
      const n = network();
      for (const k of Object.keys(G.hiddenPorts)) if (!n.ports[k]) delete G.hiddenPorts[k];
      for (const [k, e] of Object.entries(G.trafficEchoes)) if (!n.byId[e.lineId]) delete G.trafficEchoes[k];
      for (const k of Object.keys(G.lineObs)) if (!n.byId[k]) delete G.lineObs[k];
      G.spottedLegs = G.spottedLegs.filter(l => !l.npc || n.byId[l.lineId]);
      G._linesNet = 3;
    }
    if (!G._linesRoutes) { G._linesRoutes = 1; for (const k of Object.keys(G.hiddenPorts)) { try { ensureRoute(k); } catch (e) {} } }
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
  function record(b, sys, s, now) {
    const { line, i, isPort, t, k, dir } = s;
    const cv = convoyOf(line, k, dir);
    const cap = isPort ? null : capOf(line, i, dir);
    // observation de la ligne
    const ob = G.lineObs[line.id] = G.lineObs[line.id] || { n: 0, first: t, last: 0, dirs: {}, times: [] };
    ob.n++; ob.last = Math.max(ob.last, t); ob.dirs[dir] = (ob.dirs[dir] || 0) + 1;
    ob.times = (ob.times || []).concat([t]).slice(-6);
    ob['t_' + dir] = (ob['t_' + dir] || []).concat([t]).slice(-5);   // pour estimer l'horaire, un seul sens
    // tronçon relevé
    if (cap && SYS.test(cap)) {
      if (!G.spottedLegs.some(l => l.lineId === line.id && l.from === sys && l.to === cap)) {
        G.spottedLegs.unshift({ id: `ln-${line.id}-${sys}-${cap}`, lineId: line.id, from: sys, to: cap, pseudo: cv.label, at: t, npc: true, cargo: cv.cargo });
        G.spottedLegs = G.spottedLegs.slice(0, 60);
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
          line: { id: line.id, dir, cap, label: cv.label, escort: cv.escort, ships: cv.ships, nth: ob.n },
        });
        b.detectionCount = (b.detectionCount || 0) + 1;
        if (typeof toast === 'function') toast(`📡 ${sys} : ${cv.label.toLowerCase()} · ${cv.ships} vaisseaux${cap ? ' · cap sur ' + cap : ''}`);
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
  const MOOD_BY_KIND = { marchand: 'grasse', contrebande: 'noire', recup: 'nerveuse', arme: 'imperiale', pelerins: 'morte' };
  const NOUN_BY_MOOD = { nerveuse: 'la Veine', grasse: 'la Saigne', morte: 'le Linceul', noire: 'la Voie Noire', imperiale: 'la Vieille Voie' };
  const cap1 = (x) => x.charAt(0).toUpperCase() + x.slice(1);
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
    const moodKey = MOOD_BY_KIND[line && line.kind.key] || 'grasse';
    const mood = (typeof ROUTE_MOODS !== 'undefined' && ROUTE_MOODS[moodKey]) || { stabilityRange: [60, 80], label: '' };
    const [a0, a1] = mood.stabilityRange || [60, 80];
    r = {
      id: 'rt-ln-' + p.dockId, name: cap1(`${NOUN_BY_MOOD[moodKey] || 'la Route'} de ${dock.name}`), moodKey,
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
  function balisage(portSys) { return balisageChain(knownChain(portSys).slice(0, -1)); }
  function balisageChain(chain) {
    const mine = new Set((G.probesPool || []).filter(p => p.tier === 'beacon' && p.state === 'deployed').map(p => sysOf(p.deployedSystem)));
    const going = new Set((G.probeMissions || []).filter(m => m.tier === 'beacon' && m.status === 'in_transit').map(m => sysOf(m.targetCoords)));
    const beaconed = chain.filter(k => mine.has(k));
    const ratio = chain.length ? beaconed.length / chain.length : 0;
    return { chain, beaconed, ratio, next: chain.find(k => !mine.has(k) && !going.has(k)) || null, pending: chain.filter(k => going.has(k)).length,
      factor: 1 - 0.35 * ratio, riskMult: 1 - 0.6 * ratio, cover: ratio >= 0.5 };
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
        const o = { id: 'gift-' + g.id, name: String(rt.name || 'Route offerte').slice(0, 60), color: '#ffb3e0', chain, to: chain[chain.length - 1],
          toLabel: rt.toLabel ? String(rt.toLabel).slice(0, 40) : null, openedAt: Date.now(), by: String(g.from_pseudo || '?').slice(0, 20) };
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
      _offers[dockId] = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
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
  async function sellHere(missionId) {
    const m = (G.tankerMissions || []).find(x => x.id === missionId);
    if (!m || !online()) { toast('Registre hors de portée'); return; }
    const dockId = mpDockIdForMission(m), dockName = (m.dock && m.dock.name) || 'Dock';
    const list = sellableRoutes();
    const it = await _mpChoose('Quelle route vendre ?', list.map(r => ({ r, label: r.name, sub: `${r.kind === 'line' ? 'vers un lieu caché' : 'route privée'} · ${r.chain.length - 1} tronçons` })));
    if (!it) return;
    const pr = await _mpChoose('À quel prix ?', PRICE_TIERS.map(t => ({ t, label: `${t.label} · ${t.price} CG`, sub: `caution ${Math.round(t.price / 2)} CG gardée par le port 7 jours` })));
    if (!pr) return;
    const how = await _mpChoose('Quelle carte remettre ?', [
      { fake: false, label: 'La vraie carte', sub: 'La caution te revient dans 7 jours si tu ne trahis pas ton acheteur' },
      { fake: true, label: 'Une carte truquée', sub: 'Elle mène dans le vide. Tu encaisses… et tu perds la caution quand il s\'en aperçoit. Le comptoir saura.' },
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
    G.credits = credits() - caution;
    try {
      const id = await _mpRpc('mp_route_offer_post', { p_dock_id: dockId, p_dock_name: dockName, p_route: { name: r.name, kind: how.fake ? 'opened' : r.kind, port, toLabel: r.toLabel, fake: how.fake, chain }, p_price: price, p_caution: caution });
      if (!Array.isArray(G.myRouteOffers)) G.myRouteOffers = [];
      G.myRouteOffers.push({ id, dockId, dockName, name: r.name, price, caution, fake: how.fake, status: 'open', at: Date.now() });
      toast(`« ${r.name} » en vente au comptoir de ${dockName} · ${price} CG`);
    } catch (e) {
      G.credits = credits() + caution;
      toast(/offer_quota/.test(String(e.message)) ? '3 cartes en vente au plus' : 'Le comptoir ne répond pas, réessaie');
    }
    if (typeof saveGame === 'function') saveGame();
    fetchOffers(dockId, true);
    if (typeof renderDockScreen === 'function' && getCurrentScreen() === 'dock') renderDockScreen();
  }
  async function withdrawOffer(id) {
    const o = (G.myRouteOffers || []).find(x => x.id === id);
    if (!o) return;
    try {
      const ok = await _mpRpc('mp_route_withdraw', { p_offer: id });
      if (ok) { o.status = 'withdrawn'; G.credits = credits() + o.caution; toast(`Carte retirée · caution rendue (${o.caution} CG)`); }
      else { o.status = 'sold'; toast('Trop tard : elle vient d\'être vendue'); }
    } catch (e) { toast('Le comptoir ne répond pas, réessaie'); }
    if (typeof saveGame === 'function') saveGame();
    if (typeof renderDockScreen === 'function' && getCurrentScreen() === 'dock') renderDockScreen();
  }
  async function buyOffer(id, dockId) {
    const row = ((_offers[dockId] || {}).rows || []).find(o => o.id === id);
    if (!row) return;
    if (credits() < row.price) { toast(`Il faut ${row.price} CG`); return; }
    const ok = typeof sbConfirm === 'function' ? await sbConfirm({ title: 'Acheter « ' + row.name + ' » ?', body: `${row.price} CG à ${row.seller_pseudo}. Le port garde sa caution (${row.caution} CG) 7 jours : si la carte est truquée ou s'il te trahit sur cette route, elle est pour toi.`, confirmLabel: 'Acheter', cancelLabel: 'Laisser' }) : true;
    if (!ok) return;
    G.credits = credits() - row.price;
    let res;
    try { res = await _mpRpc('mp_route_buy', { p_offer: id }); }
    catch (e) { G.credits = credits() + row.price; toast(/offer_gone/.test(String(e.message)) ? 'Quelqu\'un l\'a achetée avant toi' : 'Le comptoir ne répond pas, réessaie'); fetchOffers(dockId, true); return; }
    learnRoute(res);
    if (typeof saveGame === 'function') saveGame();
    fetchOffers(dockId, true);
    if (typeof renderDockScreen === 'function' && getCurrentScreen() === 'dock') renderDockScreen();
  }
  // la route achetée entre dans ma connaissance
  function learnRoute(res) {
    state();
    const rt = (res && res.route) || {};
    const chain = (rt.chain || []).filter(k => SYS.test(k));
    if (chain.length < 2) return;
    if (!G.mapSeen) G.mapSeen = {};
    for (const k of chain) if (!G.mapSeen[k]) G.mapSeen[k] = Date.now();
    if (rt.fake) {
      openedRoutes().push({ id: 'buy-' + res.id, name: rt.name, color: '#ffb3e0', chain, to: chain[chain.length - 1], toLabel: rt.toLabel || null,
        openedAt: Date.now(), by: res.seller, offerId: res.id, fake: true, fakeAt: Date.now() + (30 + Math.floor(Math.random() * 60)) * 60000 });
      toast(`🗺 « ${rt.name} » achetée à ${res.seller} · elle est sur ta carte`);
    } else if (rt.kind === 'line' && rt.port && network().ports[rt.port]) {
      for (let i = 0; i < chain.length - 1; i++) {
        if (!G.spottedLegs.some(l => l.npc && l.from === chain[i] && l.to === chain[i + 1]))
          G.spottedLegs.unshift({ id: `buy-${res.id}-${i}`, lineId: (network().bySys[chain[i]] || [{ line: { id: null } }])[0].line.id, from: chain[i], to: chain[i + 1], pseudo: 'Carte de ' + res.seller, at: Date.now(), npc: true, cargo: 'lourd' });
      }
      if (!G.hiddenPorts[rt.port]) { const p = network().ports[rt.port]; G.hiddenPorts[rt.port] = { dockId: p.dockId, name: p.name, type: p.type, typeLabel: p.typeLabel, at: Date.now(), boughtFrom: res.seller }; }
      const r = ensureRoute(rt.port);
      if (r) r.boughtFrom = { seller: res.seller, offerId: res.id, at: Date.now() };
      toast(`🗺 « ${rt.name} » achetée à ${res.seller} · route vers ${(r && r.dock && r.dock.name) || 'un lieu caché'} ajoutée`);
    } else {
      openedRoutes().push({ id: 'buy-' + res.id, name: rt.name, color: '#ffb3e0', chain, to: chain[chain.length - 1], toLabel: rt.toLabel || null, openedAt: Date.now(), by: res.seller, offerId: res.id });
      toast(`🗺 « ${rt.name} » achetée à ${res.seller} · elle est sur ta carte`);
    }
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
  }
  // un acheteur dévalisé par son vendeur : trahison (appelé depuis la relève des abordages)
  function noteRobbery(victim) {
    if (!victim) return;
    const sale = (G._mySales || []).find(s => s.buyer_pseudo === victim);
    if (sale && online()) _mpRpc('mp_route_betray', { p_offer: sale.id, p_reason: 'robbed' }).then(ok => {
      if (ok) toast(`⚠ Tu as dévalisé ${victim} sur une route que tu lui avais vendue : le port lui donne ta caution, et le comptoir en parle`);
    }).catch(() => {});
  }
  async function tickMarket() {
    if (_marketBusy || !online() || typeof G === 'undefined' || !G) return;
    _marketBusy = true;
    try {
      // vendeur : ventes à encaisser, cautions rendues
      const sin = await _mpRpc('mp_route_seller_inbox', {});
      for (const r of Array.isArray(sin) ? sin : []) {
        G.credits = credits() + (r.amount || 0);
        const mo = (G.myRouteOffers || []).find(o => o.id === r.id); if (mo) mo.status = 'sold';
        toast(r.what === 'paid' ? `💰 ${r.buyer_pseudo} a acheté ta carte « ${r.name} » : +${r.amount} CG` : `Caution rendue par le port (${r.amount} CG) : « ${r.name} »`);
        await _mpRpc('mp_route_seller_ack', { p_offer: r.id, p_what: r.what });
      }
      // acheteur : cautions gagnées
      const bin = await _mpRpc('mp_route_buyer_inbox', {});
      for (const r of Array.isArray(bin) ? bin : []) {
        G.credits = credits() + (r.amount || 0);
        toast(`⚖ Le port te verse la caution de ${r.seller_pseudo} (${r.amount} CG) : « ${r.name} » ${r.betrayal === 'fake' ? 'était truquée' : r.betrayal === 'robbed' ? '… il t\'attendait dessus' : 'a perdu son balisage'}`);
        await _mpRpc('mp_route_buyer_ack', { p_offer: r.id });
      }
      // mes ventes surveillées : balisage retiré = trahison
      const sales = await _mpRpc('mp_route_my_sales', {});
      G._mySales = Array.isArray(sales) ? sales : [];
      if (!G.saleBeacons || typeof G.saleBeacons !== 'object') G.saleBeacons = {};
      for (const sl of G._mySales) {
        const ch = ((sl.route && sl.route.chain) || []).slice(1, -1);
        const now = balisageChain(ch).beaconed;
        const snap = G.saleBeacons[sl.id];
        if (!snap) { G.saleBeacons[sl.id] = now; continue; }
        if (snap.some(k => !now.includes(k))) {
          const ok = await _mpRpc('mp_route_betray', { p_offer: sl.id, p_reason: 'recall' });
          if (ok) toast(`⚠ Tu as retiré le balisage de « ${sl.route.name} », vendue à ${sl.buyer_pseudo} : le port lui donne ta caution`);
          delete G.saleBeacons[sl.id];
        }
      }
      // cartes truquées achetées : elles finissent par se révéler
      for (const o of openedRoutes().filter(x => x.fake && x.fakeAt && Date.now() > x.fakeAt)) {
        G.openedRoutes = openedRoutes().filter(x => x.id !== o.id);
        toast(`✗ « ${o.name} » était truquée : ses coordonnées mènent dans le vide. Le port saisit la caution de ${o.by}.`);
        try { await _mpRpc('mp_route_betray', { p_offer: o.offerId, p_reason: 'fake' }); } catch (e) {}
      }
      if (typeof saveGame === 'function') saveGame();
    } catch (e) { console.warn('[routes] comptoir :', String(e && e.message || e)); }
    finally { _marketBusy = false; }
  }
  setInterval(() => { if (document.visibilityState !== 'hidden') tickMarket(); }, 60000);

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
  function tickEcho(now) {
    if (typeof G === 'undefined' || !G || !antennaOn()) return;
    state();
    const echoes = Object.entries(G.trafficEchoes);
    const last = echoes.reduce((m, [, e]) => Math.max(m, e.at || 0), 0);
    if (echoes.length && now - last < ECHO_EVERY_MS) return;
    // pas d'écho de plus tant que deux échos attendent une balise
    const beaconSys = new Set((G.probesPool || []).filter(p => p.tier === 'beacon' && p.state === 'deployed').map(p => sysOf(p.deployedSystem)));
    const waiting = echoes.filter(([s]) => !beaconSys.has(s)).length;
    if (waiting >= 2) return;
    const home = myHome(); if (!home) return;
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
    G.trafficEchoes[sys] = { lineId: l.id, at: now };
    if (!G.mapSeen) G.mapSeen = {};
    G.mapSeen[sys] = now;
    if (typeof saveGame === 'function') saveGame();
    if (typeof toast === 'function') toast(`📡 Ton antenne capte un trafic régulier vers ${sys} · pose une balise pour voir qui passe`, () => { if (typeof openSystemOnMap === 'function') openSystemOnMap(sys); });
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
        const ts = (ob['t_' + dir] || []).slice().sort((a, b) => a - b);
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
    network, passages, capOf, convoyOf, tickBeacons, tickEcho, infoFor, knownSystems, discoverPort,
    activateCard, ensureRoute, knownChain, balisage, balisageChain, routesBalisedBy, noteUser,
    openedRoutes, openedTo, scoutInFlight, scoutLaunch, scoutArrived, forgetOpened, giveRoute, pollGifts,
    dockMarketHtml, sellHere, withdrawOffer, buyOffer, learnRoute, noteRobbery, tickMarket, fetchOffers, sellableRoutes,
    WINDOW_MS, EPOCH,
    _reset() { _net = null; },
  };
})();
