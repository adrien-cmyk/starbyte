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
    activateCard, ensureRoute, knownChain,
    WINDOW_MS, EPOCH,
    _reset() { _net = null; },
  };
})();
