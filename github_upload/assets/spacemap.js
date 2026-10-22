/* ═══════════════════════════════════════════════════════════════════════
   STARBYTE — SPACE MAP v1 · le plateau stratégique (10/10/2026, soir)
   Cf. GDD « Space Map v0 » §12 (claude/starbyte_GDD_space_map_v0.md)

   Demande d'Adrien : « la map du centre de prospection doit être comme la
   map de la planète : une grille spatiale, le même système, je me déplace
   de la même manière — un immense plateau stratégique ».

   → Même moteur que la carte planète (window.SB3D, exposé par planet3d.js) :
     mêmes parcelles hexagonales (KIT_PLATE / KIT_FRAME / KIT_NODES de
     sb_kit.glb, 50 m), même caméra quasi isométrique (28°, 48°), mêmes
     contrôles MapControls (glisser = se déplacer, pincer / molette = zoom,
     pas de rotation), même bloom sur les lumières de parcelle.
   → Le plateau : ma planète au centre, 14 anneaux de cases, un anneau de
     cases par bande de secteur (mon secteur 0–5, voisins 6–8 / 9–11 /
     12–14). Une case = un objet (système, signature, cible, planète) ou du
     noir. Toucher une case = la même fiche d'action qu'avant.
   → Hors portée : cases éteintes, grisées. Bord du plateau : il se dissout
     dans le vide.

   Rendu pur depuis G (aucune donnée nouvelle en sauvegarde). Positions
   déterministes (_hashSeed + _mulberry32) ; balayer une case noire tire un
   système inconnu QUI TOMBE SUR CETTE CASE.

   Sans WebGL : chargement de l'ancienne carte SVG (assets/spacemap2d.js).

   Dépend des globals du jeu : G, MY_ADDRESS, _hashSeed, _mulberry32,
   _sectorDistance, getMaxRange, getLaboTier, launchProbe,
   probeSignatureNextAction, _probeTierStatus, _sigBtn, _sigOff,
   PROBE_TIER_CONFIG, formatTankerDuration, openPlanetDetail, openProbeDetail,
   onTankerKnownTargetClick, findPlanetByCoord, saveGame, TILES.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SQ3 = Math.sqrt(3);
  const CELL = 50;                                   // entraxe des parcelles (m), comme la planète
  const BAND_RINGS = [[0, 5], [6, 8], [9, 11], [12, 14]];
  const BOARD = 14, RIM = 3;                         // cases jouables, puis bord qui se dissout
  const TOP = 0.36;                                  // dessus des dalles (KIT_PLATE)
  const DIST_DEF = 620, DIST_MIN = 95, DIST_MAX = 2600;
  const COL = {
    radar: '#e6f0ff', light: '#5fcc8a', medium: '#9a8aff', tanker: '#ffc864',
    cyan: '#5fffe8', mut: '#6a7a72', sig: '#8fc4ff', sys: '#c8fff4',
  };
  const STAR_COLS = [0xffd9a0, 0xfff4e0, 0xcfe0ff, 0xffb27a, 0xa8c8ff, 0xffe8c8];
  const PLANET_COLS = { type1: 0xb9b2a9, type2: 0x9b6a4e, type3: 0x3f86a2, type4: 0xd9a066, type5: 0x6c6c74 };
  const SIG_CLASS = { dead_world: 'type5', gas_giant: 'type4', habitable: 'type3', lunar: 'type1', unknown: 'type2' };

  let _root = null;       // conteneur HTML (#spacemap-root)
  let _sel = null;        // sélection courante { kind, key?, cell? }
  let _state = null;      // dernier état collecté
  let _sigStr = '';       // empreinte de l'état (reconstruction du plateau)
  let _fallback = false;  // carte SVG chargée à la place

  /* ─── Géométrie hexagonale (pointe en haut, axial q/r — même convention que la planète) ─── */
  function mySector() { return (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) ? MY_ADDRESS.sector : 'A'; }
  function myCluster() { return (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) ? MY_ADDRESS.cluster : 'A'; }
  function mySystemKey() { return `${myCluster()}-${mySector()}-${MY_ADDRESS.system}`; }

  function cellXZ(q, r) { return { x: CELL * (q + r / 2), z: CELL * SQ3 / 2 * r }; }
  function ringOf(q, r) { return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2; }
  function hexDist(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2; }

  const CELLS = [];       // { idx, q, r, ring, x, z, ang }
  const CELL_AT = new Map();
  (function buildCells() {
    const N = BOARD + RIM;
    for (let q = -N; q <= N; q++) for (let r = -N; r <= N; r++) {
      const ring = ringOf(q, r);
      if (ring > N) continue;
      const p = cellXZ(q, r);
      CELLS.push({ q, r, ring, x: p.x, z: p.z, ang: Math.atan2(p.z, p.x) });
    }
    // ordre stable : anneau, puis angle (le balayage de proche en proche suit l'anneau)
    CELLS.sort((a, b) => a.ring - b.ring || a.ang - b.ang);
    CELLS.forEach((c, i) => { c.idx = i; CELL_AT.set(c.q + ',' + c.r, i); });
  })();

  function cellAtWorld(x, z) {
    const rf = z / (CELL * SQ3 / 2), qf = x / CELL - rf / 2, sf = -qf - rf;
    let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
    const i = CELL_AT.get(q + ',' + r);
    return i === undefined ? null : CELLS[i];
  }

  function bandOfRing(ring) { return BAND_RINGS.findIndex(([a, b]) => ring >= a && ring <= b); }

  function litBands() {
    const r = (typeof getMaxRange === 'function') ? getMaxRange() : { kind: 'sector_local' };
    if (r.kind === 'universe' || r.kind === 'cluster') return 4;
    if (r.kind === 'sector_radius') return Math.min(4, r.radius + 1);
    return 1;
  }
  function litRing() { return BAND_RINGS[Math.min(4, litBands()) - 1][1]; }

  function sectorForBand(band, ang) {
    const me = mySector().charCodeAt(0);
    if (band === 0) return mySector();
    // moitié gauche → secteurs précédents, moitié droite → suivants (borné A..Z)
    const dir = Math.cos(ang) >= 0 ? 1 : -1;
    let code = me + dir * band;
    if (code < 65) code = me + band; if (code > 90) code = me - band;
    return String.fromCharCode(Math.max(65, Math.min(90, code)));
  }
  function sectorOfCell(c) { const b = bandOfRing(c.ring); return b < 0 ? null : sectorForBand(b, c.ang); }

  // Cases où peut tomber un système d'un secteur donné (anneaux de sa bande, bon côté du plateau)
  const _candCache = {};
  function candidatesFor(sector) {
    const ck = mySector() + '>' + sector;
    if (_candCache[ck]) return _candCache[ck];
    const d = Math.min(3, Math.max(0, _sectorDistance(mySector(), sector) | 0));
    const [r0, r1] = BAND_RINGS[d];
    const band = CELLS.filter(c => c.ring >= Math.max(2, r0) && c.ring <= r1);   // mon secteur : à partir de l'anneau 2 (l'anneau 1 = mon système)
    let list = band.filter(c => sectorOfCell(c) === sector);
    if (!list.length) {
      const side = sector.charCodeAt(0) >= mySector().charCodeAt(0) ? 1 : -1;
      list = band.filter(c => (Math.cos(c.ang) >= 0 ? 1 : -1) === side);
    }
    if (!list.length) list = band;
    return (_candCache[ck] = list);
  }
  function primarySlot(sysKey) {
    const sector = String(sysKey).split('-')[1] || mySector();
    const cands = candidatesFor(sector);
    const k = Math.floor(_mulberry32(_hashSeed('SM3:' + sysKey))() * cands.length);
    return { cands, k };
  }

  // Tracé d'une route sur la grille (13/10) : plus court chemin entre deux cases, en contournant les cases bloquées.
  // A* (coût 1 par case) ; à coût égal, on préfère la case la plus proche de la ligne droite → tracé net.
  const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  function hexPath(from, to, blocked) {
    if (from === to) return [from];
    const T = CELLS[to], open = [[0, 0, from]], g = new Map([[from, 0]]), prev = new Map();
    const h = (c) => hexDist(c, T), straight = (c) => Math.hypot(c.x - T.x, c.z - T.z) / 1e5;
    while (open.length) {
      open.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [, , cur] = open.shift();
      if (cur === to) break;
      const c = CELLS[cur];
      for (const [dq, dr] of HEX_DIRS) {
        const ni = CELL_AT.get((c.q + dq) + ',' + (c.r + dr));
        if (ni === undefined || CELLS[ni].ring > BOARD || (blocked && blocked.has(ni) && ni !== to)) continue;
        const ng = g.get(cur) + 1;
        if (ng < (g.has(ni) ? g.get(ni) : Infinity)) { g.set(ni, ng); prev.set(ni, cur); open.push([ng + h(CELLS[ni]), straight(CELLS[ni]), ni]); }
      }
    }
    if (!prev.has(to)) return null;
    const path = [to]; let k = to;
    while (k !== from) { k = prev.get(k); path.push(k); }
    return path.reverse();
  }

  // Cases libres autour d'une case, de la plus proche à la plus lointaine (ordre déterministe)
  function freeAround(center, minD, maxD, occ, salt) {
    const out = [];
    for (const c of CELLS) {
      if (c.ring > BOARD || occ.has(c.idx)) continue;
      const d = hexDist(center, c);
      if (d < minD || d > maxD) continue;
      out.push({ c, d, h: _mulberry32(_hashSeed('SM3s:' + salt + ':' + c.idx))() });
    }
    out.sort((a, b) => a.d - b.d || a.h - b.h);
    return out.map(o => o.c);
  }

  /* ─── Lecture de l'état (mêmes sources que la v0) ─── */
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
      } else if (!s.planets.some(p => p.coord === sig.fixedAddress)) {
        s.planets.push({ coord: sig.fixedAddress, name: sig.fixedAddress, fromSig: sig });
      }
    }
    // Systèmes balayés sans rien relever : le silence a un sens (Principe #7)
    for (const r of (G.probeReports || [])) {
      if (r.tier !== 'radar') continue;
      const m = String(r.targetCoords || '').toUpperCase().match(/^([A-Z])-([A-Z])-(\d{4})/);
      if (m) add(`${m[1]}-${m[2]}-${m[3]}`, { known: true });
    }
    for (const [key, kt] of Object.entries(G.knownTargets || {})) {
      if (kt.expiresAt && kt.expiresAt < now) continue;
      const sysKey = key.split('/')[0];
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(sysKey)) continue;
      const s = add(sysKey, { known: true });
      if (!s.targets.some(t => t.key === key)) s.targets.push({ key, kt, sig: null });
    }
    for (const m of (G.probeMissions || [])) {
      if (m.status !== 'in_transit') continue;
      const tc = String(m.targetCoords || '');
      if (/^[A-Z]-[A-Z]-\d{4}/.test(tc) && !/^SIG-/.test(tc)) add(tc.split('-').slice(0, 3).join('-'), { scanning: true });
    }

    // Balises posées : leur système apparaît (même jamais balayé), avec sa balise
    for (const b of (G.probesPool || [])) {
      if (b.tier !== 'beacon' || b.state !== 'deployed' || !b.deployedSystem) continue;
      const m = String(b.deployedSystem).toUpperCase().match(/^([A-Z])-([A-Z])-(\d{4})/);
      if (!m) continue;
      const sb = add(`${m[1]}-${m[2]}-${m[3]}`, {});
      (sb.beacons = sb.beacons || []).push(b);
    }
    // 13/10 — postes de route : les miens (tanker en station) et ceux des autres que je vois
    for (const m of (G.tankerMissions || [])) {
      if (m.kind !== 'route_post' || m.status !== 'posted' || !/^[A-Z]-[A-Z]-\d{4}$/.test(m.targetCoords || '')) continue;
      const sp = add(m.targetCoords, { known: true }); (sp.posts = sp.posts || []).push(m);
    }
    for (const o of (G._mpPosts || [])) {
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(o.system || '')) continue;
      const sp = add(o.system, { known: true }); (sp.others = sp.others || []).push(o);
    }
    // 14/10 — lignes PNJ : échos de trafic captés par l'antenne et lieux cachés découverts entrent sur la carte
    if (window.SBLines) for (const k of SBLines.knownSystems()) if (/^[A-Z]-[A-Z]-\d{4}$/.test(k)) add(k, { known: true });
    // 13/10 — mémoire de la carte : un système vu reste sur la carte même si ses rapports sont supprimés
    if (!G.mapSeen) G.mapSeen = {};
    for (const k of Object.keys(G.mapSeen)) if (/^[A-Z]-[A-Z]-\d{4}$/.test(k)) add(k, { known: true });
    for (const k of Object.keys(G.systemTags || {})) if (/^[A-Z]-[A-Z]-\d{4}$/.test(k)) add(k, { known: true });
    for (const sx of Object.values(systems)) if (sx.known && !G.mapSeen[sx.key]) G.mapSeen[sx.key] = Date.now();

    // 13/10 — tronçons repérés par mes balises (un convoi passé, et son cap) : les deux systèmes entrent sur la carte
    const spotted = (G.spottedLegs || []).filter(l => l && /^[A-Z]-[A-Z]-\d{4}$/.test(l.from) && /^[A-Z]-[A-Z]-\d{4}$/.test(l.to) && (now - (l.at || 0)) < 3 * 86400000);
    for (const l of spotted) { add(l.from, { known: true }); add(l.to, { known: true }); }
    // 21/10 — commerce entre joueurs : route dorée vers chaque partenaire d'un accord commercial
    const tradeLanes = [];
    for (const r of (G.mpRelations || [])) {
      if (!r || r.kind !== 'trade' || !(r.addresses || []).length) continue;
      const k = String(r.addresses[0]).split('-').slice(0, 3).join('-');
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(k)) continue;
      add(k, { known: true }); tradeLanes.push({ pseudo: r.pseudo, sys: k });
    }

    // ── Plateau : une case par objet ──
    const home = mySystemKey();
    add(home, { known: true, isMine: true });
    const occ = new Map();            // idx de case → { kind, key }
    const cell = {};                  // 'sys:KEY' | 'sig:ID' | 'tgt:KEY' | 'pl:COORD' → idx
    // 12/10 (Adrien) : ma planète n'occupe que la case centrale ; l'anneau 1 autour est MON système (ses échos y apparaissent)
    occ.set(0, { kind: 'home', key: home });
    cell['sys:' + home] = 0;
    const keys = Object.keys(systems).filter(k => k !== home).sort();
    // 21/10 (Adrien : « la route du Linceul a encore changé ») — positions FIGÉES : un système qui a reçu une case la garde
    // pour toujours (G.mapCells). Les nouveaux venus se placent autour ; une route qui s'allonge ajoute ses jalons sans
    // déplacer ceux qu'on connaît. Les cases des systèmes absents (rapports supprimés…) restent réservées.
    if (!G.mapCells || G.mapCells.v !== 6 || G.mapCells.home !== home) G.mapCells = { v: 6, home, cells: {} };   // v6 (22/10) : recalcul unique — les positions ne se figent qu'une fois les lignes chargées
    const MC = G.mapCells.cells;
    const fixed = new Set(), reserved = [];
    for (const [k, idx] of Object.entries(MC)) {
      const c = CELLS[idx];
      if (k === home || !c || c.ring < 1 || c.ring > BOARD || occ.has(idx)) { delete MC[k]; continue; }
      if (systems[k]) { occ.set(idx, { kind: 'system', key: k }); cell['sys:' + k] = idx; fixed.add(k); }
      else { occ.set(idx, { kind: 'reserved', key: k }); reserved.push(idx); }
    }
    // 15/10 — les jalons d'une route connue sont posés LE LONG de la route, entre ses points déjà placés.
    const routeChains = [];
    if (window.SBLines) {
      try {
        for (const o of SBLines.openedRoutes()) if (o.chain && o.chain.length > 2) routeChains.push(o.chain);
        for (const r of (G.routes || [])) if (r.portSys) { const ch = SBLines.knownChain(r.portSys); if (ch.length > 2) routeChains.push(ch); }
        // 22/10 — une ligne qu'un de mes tankers emprunte (même sans route enregistrée) se trace aussi en ligne droite
        const seen = new Set(routeChains.map(ch => ch[ch.length - 1]));
        for (const m of (G.tankerMissions || [])) if (m.portSys && !seen.has(m.portSys)) { const ch = SBLines.knownChain(m.portSys); if (ch.length > 1) { routeChains.push(ch); seen.add(m.portSys); } }
      } catch (e) { window._smRouteErr = String(e && e.stack || e).slice(0, 400); }
    }
    window._smChains = routeChains.map(ch => ch.slice());
    if (false) {
    }
    routeChains.sort((a, b) => b.length - a.length);   // la plus longue d'abord : les routes qui partagent des jalons suivent son tracé
    const onRoute = new Set(routeChains.flat().filter(k => k !== home));
    const mids = onRoute;   // (compat) tous les systèmes d'une route se placent par la route, pas par leur secteur
    const placeSys = (k) => {
      if (cell['sys:' + k] !== undefined) return;
      const { cands, k: p } = primarySlot(k);
      let placed = null;
      for (let j = 0; j < cands.length && !placed; j++) { const c = cands[(p + j) % cands.length]; if (!occ.has(c.idx)) placed = c; }
      if (!placed) placed = freeAround(CELLS[0], 2, BOARD, occ, k)[0];
      if (!placed) return;
      occ.set(placed.idx, { kind: 'system', key: k });
      cell['sys:' + k] = placed.idx;
    };
    const nearestFree = (x, z, minRing) => { let best = null, bd = Infinity;
      for (const c of CELLS) { if (c.ring > BOARD || c.ring < minRing || occ.has(c.idx)) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
      return best; };
    const put = (k, c) => { occ.set(c.idx, { kind: 'system', key: k }); cell['sys:' + k] = c.idx; };
    // 21/10 soir (Adrien : « la ligne actuelle est horrible ») — une route est une LIGNE DROITE sur la grille.
    // La plus longue d'abord ; le lieu se place par son secteur, puis le départ connu à n+1 cases, dans le prolongement
    // ma planète → lieu ; les jalons se posent à intervalles réguliers entre deux points déjà placés, dans l'ordre.
    for (const ch of routeChains) {
      const n = ch.length - 1, kA = ch[0], kB = ch[n];
      if (!systems[kB] && kB !== home) continue;
      if (cell['sys:' + kB] === undefined) placeSys(kB);
      const ib = cell['sys:' + kB];
      if (ib === undefined) continue;
      const minRing = kA === home || kB === home ? 2 : 1;
      if (cell['sys:' + kA] === undefined && systems[kA]) {
        const B = CELLS[ib], dB = Math.hypot(B.x, B.z);
        // 22/10 — le départ connu se pose DE MON CÔTÉ du lieu (le tanker part de chez moi, rejoint la ligne et la suit
        // jusqu'au lieu : un trait sans retour en arrière) ; s'il n'y a pas la place vers moi, on tourne (±30°, ±60°…)
        let base = Math.atan2(-B.z, -B.x);
        if (dB < 1) base = _mulberry32(_hashSeed('SMr:' + kB))() * Math.PI * 2;
        let c = null;
        const Rf = CELL * (n + 0.5), room = dB - CELL * 2 >= Rf * 0.8;
        // lieu trop près de moi pour y loger la ligne de mon côté : elle passe sur le flanc (trajet en triangle, sans repli)
        const order = room ? [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180] : [90, -90, 60, -60, 120, -120, 30, -30, 150, -150, 180, 0];
        for (const dd of order) {
          const a = base + dd * Math.PI / 180;
          const R = dd === 0 && room ? Math.min(Rf, dB - CELL * 2) : Rf;
          const x = B.x + Math.cos(a) * R, z = B.z + Math.sin(a) * R;
          let near = null, bd = Infinity; for (const q of CELLS) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; near = q; } }
          if (!near || near.ring > BOARD - 1 || near.ring < minRing || bd > CELL) continue;
          c = occ.has(near.idx) ? nearestFree(x, z, minRing) : near;
          if (c) break;
        }
        if (!c) c = nearestFree(B.x + Math.cos(base) * R, B.z + Math.sin(base) * R, minRing);
        if (c) put(kA, c);
      }
      for (let i = 1; i < n; i++) {
        const k = ch[i];
        if (cell['sys:' + k] !== undefined || !systems[k]) continue;
        let a = i - 1; while (a > 0 && cell['sys:' + ch[a]] === undefined) a--;
        let b = i + 1; while (b < n && cell['sys:' + ch[b]] === undefined) b++;
        const ca = cell['sys:' + ch[a]], cb = cell['sys:' + ch[b]];
        if (ca === undefined || cb === undefined) continue;
        const A = CELLS[ca], B = CELLS[cb], t = (i - a) / (b - a);
        const c = nearestFree(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t, minRing);   // point de la ligne droite → case libre la plus proche
        if (c) put(k, c);
      }
    }
    for (const k of keys) if (!mids.has(k) && cell['sys:' + k] === undefined) placeSys(k);
    for (const k of mids) if (cell['sys:' + k] === undefined && systems[k]) {   // jalon d'une route dont un bout manque
      const c = freeAround(CELLS[0], 2, BOARD, occ, k)[0]; if (c) { occ.set(c.idx, { kind: 'system', key: k }); cell['sys:' + k] = c.idx; }
    }
    for (const idx of reserved) occ.delete(idx);
    // mémorisé (sauvegardé avec la partie) — seulement une fois les lignes PNJ chargées : sinon les jalons des routes
    // se figeraient à la place de leur secteur avant que la route ne soit connue (22/10, carte d'Adrien)
    if (window.SBLines) for (const k of keys) if (cell['sys:' + k] !== undefined) MC[k] = cell['sys:' + k];
    // 13/10 (Adrien) — zoom sémantique : chaque objet vit DANS la case de son système, sur une orbite.
    // De loin on ne voit qu'un point par système ; de près, la case s'ouvre et montre le système.
    const items = {};                 // clé de système → [{ kind, key, ck, orbit, ang }]
    for (const k of [home, ...keys]) {
      const s = systems[k], ci = cell['sys:' + k];
      if (ci === undefined) continue;
      const list = [
        ...s.sigs.map(sig => ({ kind: 'sig', key: sig.id, ck: 'sig:' + sig.id, obj: sig })),
        ...s.targets.map(t => ({ kind: 'target', key: t.key, ck: 'tgt:' + t.key, obj: t })),
        ...s.planets.map(pl => ({ kind: 'planet', key: pl.coord, ck: 'pl:' + pl.coord, obj: pl })),
      ];
      list.forEach((it, n) => {
        it.orbit = n;
        it.ang = _mulberry32(_hashSeed('SM3o:' + it.key))() * Math.PI * 2;
        cell[it.ck] = ci;
      });
      items[k] = list;
    }

    // Routes entre mes balises (13/10) : tracé sur la grille, en contournant les systèmes à éviter
    const routes = [];
    const beaconAt = (bid) => {
      const b = (G.probesPool || []).find(x => x.id === bid && x.tier === 'beacon');
      if (!b || b.state !== 'deployed') return null;
      const m = String(b.deployedSystem || '').toUpperCase().match(/^([A-Z])-([A-Z])-(\d{4})/);
      if (!m) return null;
      const k = `${m[1]}-${m[2]}-${m[3]}`, ci = cell['sys:' + k];
      return ci === undefined ? null : { ci, key: k };
    };
    for (const r of []) {   // 14/10 (routes & pistes v1) : plus de route « entre deux de mes balises »
      const A = beaconAt(r.a), B = beaconAt(r.b);
      if (!A || !B) { routes.push({ r, broken: true, path: [], a: A, b: B }); continue; }
      const blocked = new Set((r.avoid || []).map(k => cell['sys:' + k]).filter(i => i !== undefined && i !== A.ci && i !== B.ci));
      const path = hexPath(A.ci, B.ci, blocked);
      routes.push({ r, broken: !path, path: path || [], a: A, b: B });
    }

    const spottedPaths = [];
    for (const l of spotted) {
      const fa = cell['sys:' + l.from], fb = cell['sys:' + l.to];
      if (fa === undefined || fb === undefined) continue;
      spottedPaths.push({ l, path: [fa, fb] });   // 14/10 : un cap relevé = un trait direct (pas de détour sur la grille)
    }
    const tradePaths = [];
    for (const t of tradeLanes) {
      const a = cell['sys:' + home], b = cell['sys:' + t.sys];
      if (a === undefined || b === undefined || a === b) continue;
      tradePaths.push({ pseudo: t.pseudo, sys: t.sys, path: [a, b] });
    }
    const partial = { cell, occ, routes, home };
    // ce que les lignes PNJ disent de chaque système (couloir, écho, lieu caché, convois observés)
    if (window.SBLines) for (const sx of Object.values(systems)) { try { sx.li = SBLines.infoFor(sx.key); } catch (e) { sx.li = null; } }

    // 14/10 (E2) — routes des lignes remontées : du plus loin connu jusqu'au lieu caché, tracées comme une route
    if (window.SBLines) for (const r of (G.routes || [])) {
      if (!r.portSys) continue;
      const chain = SBLines.knownChain(r.portSys);
      const cells = chain.map(k => cell['sys:' + k]).filter(i => i !== undefined);
      if (cells.length < 2) continue;
      routes.push({ r: { id: r.id, name: r.name, color: '#ffc864', avoid: [] }, line: true, routeId: r.id, portSys: r.portSys, broken: false, path: cells,
        a: { ci: cells[0], key: chain[0] }, b: { ci: cells[cells.length - 1], key: r.portSys } });
    }

    // 14/10 (E4) — routes ouvertes par une Moyenne éclaireur (ou offertes par un allié)
    if (window.SBLines) for (const o of SBLines.openedRoutes()) {
      const cells = o.chain.map(k => cell['sys:' + k]).filter(i => i !== undefined);
      if (cells.length < 2) continue;
      routes.push({ r: { id: o.id, name: o.name, color: o.color || '#9fe08a', avoid: [] }, opened: true, routeId: o.id, broken: false, path: cells,
        a: { ci: cells[0], key: o.chain[0] }, b: { ci: cells[cells.length - 1], key: o.to } });
    }

    // Missions en vol
    const flights = [];
    for (const m of (G.probeMissions || [])) {
      if (m.status !== 'in_transit') continue;
      const tc = String(m.targetCoords || '');
      let to;
      if (/^SIG-/.test(tc)) to = cell['sig:' + tc];
      else if (/^[A-Z]-[A-Z]-\d{4}/.test(tc)) to = cell['sys:' + tc.split('-').slice(0, 3).join('-')];
      // PATCH_2110_NOMS : « Légère → système de Panzerstorm », le nom de la sonde en petit
      const _pd = typeof sbDestLabel === 'function' ? sbDestLabel(tc) : { label: tc, coords: tc };
      if (to !== undefined) flights.push({ kind: 'probe', tier: m.tier, id: m.id, label: `${typeof sbProbeTierLabel === 'function' ? sbProbeTierLabel(m.tier) : 'Sonde'} → ${_pd.label}`, shipName: m.probeName || 'Sonde', destCoords: _pd.coords, from: 0, to, toCk: /^SIG-/.test(tc) ? 'sig:' + tc : null, departedAt: m.departedAt, arrivalAt: m.arrivalAt, target: tc });
    }
    for (const m of (G.tankerMissions || [])) {
      if (!(m.status === 'in_transit' || m.status === 'returning' || m.status === 'exploring')) continue;
      const tc = String(m.portSys || m.targetCoords || '');   // 14/10 (E2) : un tanker vers le dock d'une ligne vise le système du lieu
      const sysKey = tc.split('/')[0].split('-').slice(0, 3).join('-');   // cible, épave ou planète (A-N-2000-04)
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(sysKey)) continue;
      const at = cell['tgt:' + tc] !== undefined ? cell['tgt:' + tc] : cell['sys:' + sysKey];
      if (at === undefined) continue;
      const back = m.status === 'returning';
      const toCk = cell['pl:' + tc] !== undefined ? 'pl:' + tc : (cell['tgt:' + tc] !== undefined ? 'tgt:' + tc : null);
      // 13/10 — un tanker sur ma route suit son tracé (le trajet maison → balise de départ reste à découvert)
      let path = null;
      if (m.ownRouteId) { const pl = planFrom(partial, sysKey); const r = pl && pl.routes.find(x => x.id === m.ownRouteId); if (r) path = back ? r.cells.slice().reverse() : r.cells; }
      if (m.portSys && window.SBLines) {   // le tanker gagne le début connu de la ligne, puis la suit jusqu'au lieu
        const cells = [0].concat(SBLines.knownChain(m.portSys).map(k => cell['sys:' + k]).filter(i => i !== undefined));
        if (cells.length > 2) path = back ? cells.slice().reverse() : cells;
      }
      const _td = (m.mpTarget && m.mpTarget.pseudo) ? { label: m.mpTarget.pseudo, coords: tc } : (m.dock && m.dock.name) ? { label: m.dock.name, coords: sysKey } : m.targetLabel ? { label: m.targetLabel, coords: sysKey } : (typeof sbDestLabel === 'function' ? sbDestLabel(tc) : { label: tc, coords: '' });
      flights.push({ kind: 'tanker', id: m.id, label: `Tanker → ${_td.label}`, shipName: m.tankerName || 'Tanker', destCoords: _td.coords, from: back ? at : 0, to: back ? 0 : at, toCk: back ? null : toCk, path,
        departedAt: back ? (m.returnDepartedAt || m.arrivalAt || m.departedAt) : m.departedAt, arrivalAt: back ? (m.returnArrivalAt || m.arrivalAt) : m.arrivalAt, target: tc, back });
    }
    // 15/10 (E6) — flottes qui gagnent leur embuscade ou en reviennent : par la route connue quand elles l'empruntent
    for (const f of ((G.fleet && G.fleet.prepared) || [])) {
      const a = f.ambush;
      if (!a || !(a.phase === 'going' || a.phase === 'returning')) continue;
      const at = cell['sys:' + a.system];
      if (at === undefined) continue;
      const back = a.phase === 'returning';
      let path = null;
      if (Array.isArray(a.routeChain)) {
        const ch = a.routeChain, j = ch.indexOf(a.system);
        if (j >= 0) {
          const cells = [0].concat(ch.slice(0, j + 1).map(k => cell['sys:' + k]).filter(i => i !== undefined && i !== 0));
          if (cells.length > 2) path = back ? cells.slice().reverse() : cells;
        }
      }
      flights.push({ kind: 'fleet', id: 'fl-' + f.id, fleetId: f.id, label: f.name || 'Flotte', from: back ? at : 0, to: back ? 0 : at, toCk: null, path,
        departedAt: back ? (a.returnDepartedAt || (a.returnsAt - a.travelMs)) : a.departedAt, arrivalAt: back ? a.returnsAt : a.arrivesAt, target: a.system, back });
    }
    return { systems, flights, occ, cell, items, routes, spotted: spottedPaths, trade: tradePaths, home, lit: litRing() };
  }

  // 13/10 — trajets possibles vers un système : voie directe (ligne droite) et mes routes qui y aboutissent.
  // via = systèmes connus traversés, dans l'ordre (c'est ce que voient les balises des autres commandants).
  function planFrom(st, destKey) {
    const dc = st.cell['sys:' + destKey];
    if (dc === undefined) return null;
    const viaOf = (cells) => cells.slice(1, -1).map(i => st.occ.get(i)).filter(o => o && o.kind === 'system').map(o => o.key);
    const dPath = dc === 0 ? [0] : (hexPath(0, dc, null) || [0, dc]);
    const out = { dest: destKey, direct: { cells: dPath, via: viaOf(dPath), len: dPath.length - 1 }, routes: [] };
    for (const rt of st.routes || []) {
      if (rt.broken || !rt.a || !rt.b || rt.path.length < 2) continue;
      let p;
      if (rt.b.ci === dc) p = rt.path; else if (rt.a.ci === dc) p = rt.path.slice().reverse(); else continue;
      const start = p[0];
      const pre = start === 0 ? [0] : (hexPath(0, start, null) || [0, start]);
      const cells = pre.concat(p.slice(1));
      const so = st.occ.get(start);
      out.routes.push({ id: rt.r.id, name: rt.r.name, color: rt.r.color, cells, via: viaOf(cells), len: cells.length - 1,
        openLen: pre.length - 1, startKey: so ? so.key : st.home });
    }
    return out;
  }

  // Empreinte : ce qui change le plateau (pas le temps qui passe)
  function fingerprint(st) {
    const o = [];
    for (const [i, v] of st.occ) if (v.kind !== 'home') o.push(i + v.kind[0] + v.key);
    for (const s of Object.values(st.systems)) {
      if (s.li) o.push('L' + s.key + (s.li.port ? 'P' : '') + (s.li.echo ? 'E' : '') + (s.li.lane ? 'C' : '') + s.li.obs.map(x => x.n).join('.'));
      o.push((s.known ? 'K' : '') + (s.scanning ? 'S' : '') + s.key + ':' + ((G.systemTags || {})[s.key] || '') + ':' + ((s.beacons || []).length) + ':' + ((s.posts || []).length) + ':' + (s.others || []).map(x => x.pseudo + (x.met ? '+' : '')).join('/'));
      for (const t of s.targets) o.push(t.key + ':' + (t.kt.status || ''));
      for (const g of s.sigs) o.push(g.id + ':' + (g.resolved ? 1 : 0));
      for (const pl of s.planets) o.push('P' + pl.coord + (pl.playerName ? '@' + pl.playerName : ''));
    }
    for (const f of st.flights) o.push('F' + f.id + f.from + '>' + f.to);
    for (const sp of st.spotted || []) o.push('S' + sp.l.from + '>' + sp.l.to);
    for (const tp of st.trade || []) o.push('T' + tp.sys + tp.pseudo);
    for (const f of st.flights) if (f.path) o.push('P' + f.id + f.path.length);
    for (const rt of st.routes || []) o.push('R' + rt.r.id + rt.r.color + (rt.r.avoid || []).join('/') + (rt.broken ? 'x' : '') + rt.path.join('.'));
    return st.lit + '|' + o.sort().join(',');
  }

  function knownSet() {
    const known = new Set(Object.keys(G.knownSystems || {}));
    for (const s of Object.values(G.knownSystems || {})) known.add(`${s.cluster}-${s.sector}-${s.system}`);
    for (const sig of Object.values(G.signatures || {})) known.add(sig.system);
    for (const m of (G.probeMissions || [])) if (m.status === 'in_transit' && /^[A-Z]-[A-Z]-\d{4}/.test(m.targetCoords || '')) known.add(String(m.targetCoords).split('-').slice(0, 3).join('-'));
    return known;
  }

  // Balayer une case noire : un système inconnu de ce secteur dont la case est CELLE-CI (déterministe)
  function pickSystemForCell(c) {
    const sector = sectorOfCell(c), cl = myCluster(), known = knownSet();
    let first = null;
    for (let t = 0; t < 6000; t++) {
      const n = 1000 + Math.floor(_mulberry32(_hashSeed(`SM3:pick:${cl}-${sector}:${c.q},${c.r}:${t}`))() * 9000);
      const key = `${cl}-${sector}-${n}`;
      if (known.has(key) || key === mySystemKey()) continue;
      if (!first) first = key;
      const { cands, k } = primarySlot(key);
      if (cands[k] && cands[k].idx === c.idx) return key;
    }
    return first || `${cl}-${sector}-${1000 + Math.floor(Math.random() * 9000)}`;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ─── Fiche d'action (inchangée depuis la v0 : un objet, un état, un bouton) ─── */
  function panelMarkup(state) {
    const sysN = Object.values(state.systems).filter(s => s.known).length;
    const sigN = Object.values(G.signatures || {}).filter(s => !s.resolved && !s.ignored).length;
    const flyN = state.flights.length;
    if (!_sel) {
      const bits = [`${sysN} système${sysN > 1 ? 's' : ''}`];
      if (sigN) bits.push(`${sigN} signature${sigN > 1 ? 's' : ''}`);
      if (flyN) bits.push(`${flyN} en vol`);
      return `<div class="sm-panel"><div class="sm-ptitle">${bits.join(' · ')}</div><div class="sm-psub">Touche une case : un objet, ou une case noire pour la balayer.</div></div>`;
    }
    const s = _sel;
    if (s.kind === 'leg') return legPanel(s.key);
    if (s.kind === 'far') {
      // Décision d'Adrien (10/10) : dire comment aller plus loin — c'est le Laboratoire qui étend la portée
      const lt = (typeof getLaboTier === 'function') ? getLaboTier() : 0;
      const hint = lt < 1 ? 'Construis un Laboratoire, puis développe-le au niveau 2 pour étendre la portée des sondes.'
        : lt < 2 ? 'Développe ton Laboratoire au niveau 2 : portée +1 secteur.'
        : lt < 3 ? 'Développe ton Laboratoire au niveau 3 : portée +3 secteurs.'
        : 'Au-delà de ce que tes capteurs peuvent atteindre aujourd\'hui.';
      return `<div class="sm-panel"><div class="sm-ptitle">Trop loin pour les capteurs actuels</div><div class="sm-psub">Secteur ${esc(s.sector)}</div><div class="sm-psub" style="margin-top:6px;color:#c8d6d2">${hint}</div></div>`;
    }
    if (s.kind === 'dark') {
      const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus('radar') : { ok: false, build: true, why: 'Aucune Radar prête' };
      let act;
      if (st.ok) act = _sigBtn(COL.radar, 'Balayer', `SBMap.sweep('${esc(s.sysKey)}')`, `Radar · ${esc(s.sysKey)} · ${PROBE_TIER_CONFIG.radar.duration}`);
      else if (st.build) act = _sigBtn(COL.radar, 'Construire une Radar', `openProbeDetail('radar')`, `${PROBE_TIER_CONFIG.radar.cost.metal} Métal · puis reviens balayer`, true);
      else act = _sigOff(st.why);
      return `<div class="sm-panel"><div class="sm-ptitle">Secteur ${esc(s.sector)} · zone inexplorée</div><div class="sm-psub">Rien de connu ici.</div>${act}${beaconAction(s.sysKey, null)}</div>`;
    }
    if (s.kind === 'orbit') {
      // anneau autour de ma planète : c'est mon propre système
      const name = (G.planet && G.planet.name) || (G.profile && G.profile.planetName) || 'ma planète';
      const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus('radar') : { ok: false, build: true, why: 'Aucune Radar prête' };
      const scanning = (G.probeMissions || []).find(x => x.status === 'in_transit' && String(x.targetCoords || '').startsWith(mySystemKey()));
      let act;
      if (scanning) act = _sigOff(`Radar en route · arrivée dans ${formatTankerDuration(Math.max(0, (scanning.arrivalAt || 0) - Date.now()))}`);
      else if (st.ok) act = _sigBtn(COL.radar, 'Balayer mon système', `SBMap.sweep('${esc(mySystemKey())}')`, `Radar · ${esc(mySystemKey())} · ${PROBE_TIER_CONFIG.radar.duration}`);
      else if (st.build) act = _sigBtn(COL.radar, 'Construire une Radar', `openProbeDetail('radar')`, `${PROBE_TIER_CONFIG.radar.cost.metal} Métal · puis reviens balayer`, true);
      else act = _sigOff(st.why);
      return `<div class="sm-panel"><div class="sm-ptitle">Système de ${esc(name)}</div><div class="sm-psub">Rien de relevé ici.</div>${act}</div>`;
    }
    if (s.kind === 'home') {
      const name = (G.planet && G.planet.name) || (G.profile && G.profile.planetName) || 'Ma planète';
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
      if (sys && sys.scanning) {
        // la sonde y va vraiment : on le dit, avec l'heure d'arrivée
        const m = (G.probeMissions || []).find(x => x.status === 'in_transit' && String(x.targetCoords || '').startsWith(s.key));
        bits.push(m ? `${esc((PROBE_TIER_CONFIG[m.tier] || { label: 'Sonde' }).label)} en route · arrivée dans ${formatTankerDuration(Math.max(0, (m.arrivalAt || 0) - Date.now()))}` : 'balayage en cours');
      }
      const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus('radar') : { ok: false };
      let act = '';
      if (sys && sys.known) {
        if (st.ok) act = _sigBtn(COL.radar, 'Balayer à nouveau', `SBMap.sweep('${esc(s.key)}')`, `Radar · ${PROBE_TIER_CONFIG.radar.duration}`, true);
        else if (st.build) act = _sigBtn(COL.radar, 'Construire une Radar', `openProbeDetail('radar')`, '', true);
        else act = _sigOff(st.why);
      }
      const insp = (window.SBSystem && sys && (sys.known || sys.scanning)) ? _sigBtn(COL.cyan, 'Inspecter le système', `SBSystem.open('${esc(s.key)}')`, '', true) : '';
      const tag = (G.systemTags || {})[s.key];
      const tagTxt = tag === 'star' ? ' · <span style="color:#ffc864">intéressant</span>' : tag === 'skip' ? ' · <span style="color:#ff4a3a">sans intérêt</span>' : '';
      const li = sys && sys.li;
      const title = li && li.port ? `${esc(li.port.name)}` : `Système ${esc(s.key)}`;
      const sub = li && li.port ? `<span class="mono">${esc(s.key)}</span> · ${esc(li.port.typeLabel || 'lieu caché')}` : (bits.join(' · ') || (li && (li.lane || li.echo || li.obs.length) ? 'Couloir de passage' : 'Balayé, rien de relevé.'));
      // 15/10 (Adrien) — la Couronne : PORT-FRANC, son nom, un gros bouton ENTRER (la bonne vue 3D selon ce qui se passe là-bas)
      const _stU = li && li.port && typeof stationUI === 'function' ? stationUI(li.port.dockId) : null;
      if (_stU && typeof crownEnter === 'function') {
        const cs = typeof crownState === 'function' ? crownState(li.port.dockId) : { label: '' };
        return `<div class="sm-panel"><div class="smc-k">${esc(_stU.kicker)}</div><div class="smc-t">${esc(li.port.name)}</div><div class="sm-psub"><span class="mono">${esc(s.key)}</span> · ${esc(cs.label)}</div><button class="cr-big smc-enter" onclick="event.stopPropagation();crownEnter('${esc(li.port.dockId)}')">ENTRER</button>${laneHtml(s.key, li)}${postsHtml(s.key)}${spottedHtml(s.key)}${beaconAction(s.key, sys)}</div>`;
      }
      return `<div class="sm-panel"><div class="sm-ptitle"${li && li.port ? ' style="color:#ffc864"' : ''}>${title}</div><div class="sm-psub">${sub}${tagTxt}</div>${laneHtml(s.key, li)}${postsHtml(s.key)}${spottedHtml(s.key)}${insp}${act}${scoutHtml(s.key, sys)}${beaconAction(s.key, sys)}</div>`;
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
      if (pl && pl.playerName) {
        // monde d'un autre commandant : sa fiche, le re-sonder (choix de la sonde), poser une balise sur son système
        const sysKey = String(s.key).split('-').slice(0, 3).join('-');
        const lvl = pl.playerLevel ? ' · niv. ' + esc(pl.playerLevel) : '';
        return `<div class="sm-panel"><div class="sm-ptitle" style="color:#ff9a8a">${esc(pl.playerName)}</div><div class="sm-psub"><span class="mono">${esc(s.key)}</span> · ${esc(pl.customName || pl.name || '')}${lvl}</div>`
          + _sigBtn('#ff9a8a', 'Voir sa fiche', `openPlanetDetail('${esc(s.key)}')`, '', true)
          + _sigBtn(COL.radar, 'Sonder ce monde', `resondPlanet('${esc(s.key)}')`, 'Radar sur son système ou Furtive sur sa planète', true)
          + beaconAction(sysKey, null) + `</div>`;
      }
      const act = _sigBtn(COL.cyan, 'Voir corps céleste', `openPlanetDetail('${esc(s.key)}')`, '', true);
      return `<div class="sm-panel"><div class="sm-ptitle">${esc((pl && (pl.customName || pl.name)) || 'Planète')}</div><div class="sm-psub mono">${esc(s.key)}${pl && pl.type ? ' · ' + esc((typeof PLANET_TYPES !== 'undefined' && PLANET_TYPES[pl.type] && PLANET_TYPES[pl.type].label) || pl.type) : ''}</div>${act}</div>`;
    }
    if (s.kind === 'route') {
      const h = routeCard(state, s.key);
      if (!h) { _sel = null; return panelMarkup(state); }
      return h;
    }
    if (s.kind === 'flight') {
      const f = state.flights.find(x => x.id === s.key);
      if (!f) { _sel = null; return panelMarkup(state); }
      const eta = formatTankerDuration(Math.max(0, (f.arrivalAt || 0) - Date.now()));
      if (f.kind === 'tanker' && window.SBMissions) return `<div class="sm-panel"><div class="sm-ptitle" style="color:#ffc864">${f.back ? 'Tanker · retour au port' : esc(f.label)}</div><div class="sm-psub">${f.destCoords ? `<span class="mono">${esc(f.destCoords)}</span> · ` : ''}${f.back ? 'à quai' : 'arrivée'} dans ${esc(eta)} · <span style="opacity:.6">${esc(f.shipName || '')}</span></div>${_sigBtn('#ffc864', 'Voir la mission', `SBMissions.open('${esc(f.id)}')`, 'trajet, cale, temps restant', true)}</div>`;
      if (f.kind === 'fleet') return `<div class="sm-panel"><div class="sm-ptitle" style="color:#c9a8ff">${esc(f.label)}${f.back ? ' · retour' : ''}</div><div class="sm-psub">${f.back ? 'Rentre au port' : 'En route vers son embuscade sur ' + esc(f.target)} · ${f.back ? 'à quai' : 'en place'} dans ${esc(eta)}</div>${_sigBtn('#c9a8ff', 'Voir la flotte', `openFleetDetail('${esc(f.fleetId)}')`, '', true)}</div>`;
      if (f.kind === 'probe') return `<div class="sm-panel"><div class="sm-ptitle">${esc(f.label)}</div><div class="sm-psub">${f.destCoords ? `<span class="mono">${esc(f.destCoords)}</span> · ` : ''}arrivée dans ${esc(eta)} · <span style="opacity:.6">${esc(f.shipName || '')}</span></div></div>`;   // PATCH_2110_NOMS
      return `<div class="sm-panel"><div class="sm-ptitle">${esc(f.label)}${f.back ? ' · retour' : ''}</div><div class="sm-psub">${f.back ? 'Rentre au port' : 'Vers ' + esc(f.target)} · arrivée dans ${esc(eta)}</div></div>`;
    }
    return '';
  }


  /* ═══════════════════ Moteur 3D : le plateau ═══════════════════ */
  const waitSB3D = (ms) => new Promise((ok, ko) => {
    if (window.SB3D && window.SB3D.MapControls) return ok(window.SB3D);
    const t0 = Date.now();
    const t = setInterval(() => {
      if (window.SB3D && window.SB3D.MapControls) { clearInterval(t); ok(window.SB3D); }
      else if (Date.now() - t0 > ms) { clearInterval(t); ko(new Error('SB3D indisponible')); }
    }, 120);
  });

  function homeDist() { const a = E.camera ? E.camera.aspect : 1; return a < 0.8 ? 980 : DIST_DEF; }

  // ── Zoom sémantique (13/10, Adrien) ──────────────────────────────────────
  // Loin : l'immensité — une grille fine qui se perd, un point à peine visible par système.
  // Mi-distance : les systèmes deviennent de petites étoiles, un repère de couleur signale l'intérêt.
  // Près : la case s'ouvre — étoile, orbites, planètes, échos, veines, chacun touchable (vue système fusionnée).
  const LOD = { FAR: 1700, MID: 820, NEAR_IN: 300, NEAR_OUT: 560, LABEL_IN: 520, LABEL_OUT: 900 };
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ORBIT = (n, home) => home ? Math.min(23, 12.5 + n * 2.6) : Math.min(22, 7 + n * 3.1);

  const BOARD_VS = `
    varying vec2 vP;
    void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const BOARD_FS = `
    uniform float uCell, uR0, uR1, uGrid, uDot, uFadeR, uMacro;
    uniform vec2 uT;
    uniform vec3 uLine, uBase;
    varying vec2 vP;
    // distance au bord de la case hexagonale (pointe en haut) de taille C ; renvoie (dist bord, pas pixel)
    vec3 hexd(vec2 P, float C) {
      float H = 0.8660254;
      float r = P.y / (C * H), q = P.x / C - r * 0.5, s = -q - r;
      float rq = floor(q + .5), rr = floor(r + .5), rs = floor(s + .5);
      float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);
      if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
      vec2 p = P - vec2(C * (rq + rr * .5), C * H * rr);
      float e = max(abs(p.x), max(abs(dot(p, vec2(.5, H))), abs(dot(p, vec2(.5, -H)))));
      float R = C / 1.7320508, a = atan(p.y, p.x);
      float va = 0.5235988 + floor((a - 0.5235988) / 1.0471976 + .5) * 1.0471976;
      return vec3(C * .5 - e, max(fwidth(e), 1e-4), length(p - R * vec2(cos(va), sin(va))));
    }
    void main() {
      vec3 f = hexd(vP, uCell);
      float px = f.y;
      float line = 1. - smoothstep(px * .35, px * 1.1, f.x);
      float dots = 1. - smoothstep(px * .7, px * 1.5, f.z);             // ~1,5 px quel que soit le zoom
      float lod = smoothstep(9., 34., uCell / px);                       // la grille fine apparaît en s'approchant
      vec3 m = hexd(vP, uCell * 4.0);                                     // macro-grille : la carte vue de très haut
      float mline = 1. - smoothstep(m.y * .35, m.y * 1.1, m.x);
      float rad = length(vP) / uCell;
      float edge = 1. - smoothstep(uR0, uR1, rad);
      float foc = 1. - smoothstep(uFadeR * .35, uFadeR, length(vP - uT));
      float n = sin(vP.x * .0041 + 1.3) * sin(vP.y * .0053 - .7) + .5 * sin((vP.x + vP.y) * .0023);
      vec3 base = uBase * (0.82 + 0.28 * n);
      float la = (line * uGrid * lod + dots * uDot * lod + mline * uMacro) * edge * foc;
      gl_FragColor = vec4(base * edge + uLine * la, max(edge * 0.9, la));
    }`;

  const E = {
    ready: false, loading: null,

    async init(host) {
      const S = await waitSB3D(12000);
      const T = this.T = S.THREE;
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL indisponible');
      this.host = host;

      const r = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      r.outputColorSpace = T.SRGBColorSpace;
      r.toneMapping = T.AgXToneMapping;
      r.toneMappingExposure = 1.15;

      const BG = 0x02050a;
      const scene = this.scene = new T.Scene();
      scene.background = new T.Color(BG);
      // 14/10 — appareils faibles (qualité Économe) : pas de carte d'environnement préfiltrée (PMREM),
      // c'était une bonne part du gel à la première ouverture ; la lumière d'ambiance compense.
      const lite = !!(window.SBPerf && SBPerf.level >= 2);
      scene.add(new T.HemisphereLight(0x5a7ca8, 0x05080a, lite ? 1.35 : 0.9));
      const sun = new T.DirectionalLight(0xdfe8ff, 1.6);
      sun.position.set(-260, 420, 300);
      scene.add(sun);
      scene.environment = lite ? null : this._env(r);
      scene.environmentIntensity = 0.5;

      const cam = this.camera = new T.PerspectiveCamera(28, 1, 2, 14000);
      const el = T.MathUtils.degToRad(48);
      this.camDir = new T.Vector3(0, Math.sin(el), Math.cos(el));
      cam.position.set(0, 0, 0).addScaledVector(this.camDir, DIST_DEF);
      cam.lookAt(0, 0, 0);
      const ctl = this.controls = new S.MapControls(cam, r.domElement);
      ctl.enableRotate = false;
      ctl.enableDamping = true; ctl.dampingFactor = 0.12;
      ctl.screenSpacePanning = false;
      ctl.minDistance = DIST_MIN; ctl.maxDistance = DIST_MAX;
      ctl.zoomToCursor = true;
      const LIM = (BOARD + 0.5) * CELL;
      ctl.addEventListener('change', () => {
        const t = ctl.target, d = Math.hypot(t.x, t.z);
        if (d > LIM) { const k = LIM / d; const nx = t.x * k, nz = t.z * k; cam.position.x += nx - t.x; cam.position.z += nz - t.z; t.x = nx; t.z = nz; }
      });

      // Bloom très retenu : seul ce qui dépasse 1 (sélection, ma planète) brille. Les étoiles restent des points.
      const comp = this.composer = new S.EffectComposer(r);
      comp.addPass(new S.RenderPass(scene, cam));
      this.bloom = new S.UnrealBloomPass(new T.Vector2(256, 256), 0.28, 0.35, 1.0);
      comp.addPass(this.bloom);
      comp.addPass(new S.OutputPass());

      this._materials();
      this._stars();
      this._board();
      this.content = new T.Group(); scene.add(this.content);
      this.fx = new T.Group(); scene.add(this.fx);
      this.anims = []; this.flights = []; this.bodies = {}; this.labelsLod = []; this.nearGroups = []; this.ticks = [];
      this._home();
      this._selection();

      host.innerHTML = '';
      host.appendChild(r.domElement);
      r.domElement.style.display = 'block';
      r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
      r.domElement.style.touchAction = 'none';
      this._picking(r.domElement);
      new ResizeObserver(() => this._resize()).observe(host);
      this._resize();
      this.moveTo(0, 0, homeDist(), 1);
      this._t = 0; this._last = performance.now(); this._check = 0;
      try { this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { this.still = false; }
      r.setAnimationLoop(() => this._frame());
      this.ready = true;
      console.log('[SpaceMap] plateau stratégique prêt');
    },

    dist() { return this.camera ? this.camera.position.distanceTo(this.controls.target) : DIST_DEF; },

    _materials() {
      const T = this.T;
      const fade = (m) => { m.transparent = true; m.depthWrite = false; m.userData.base = m.opacity; return m; };
      this.M = {
        add: (c, o = 1) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: T.AdditiveBlending }),
      };
      this.halo = this._canvasTex(128, 128, (g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.45)'); gr.addColorStop(0.55, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      });
      this.G = {
        ring: (a, b, seg = 64) => { const g = new T.RingGeometry(a, b, seg); g.rotateX(-Math.PI / 2); return g; },
        hexLine: (R) => { const pts = []; for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push(new T.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); } return new T.BufferGeometry().setFromPoints(pts); },
        hexFill: (R) => { const g = new T.CircleGeometry(R, 6); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 6); return g; },
        circle: (R, seg = 96) => { const pts = []; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); } return new T.BufferGeometry().setFromPoints(pts); },
        sphere: new T.SphereGeometry(1, 24, 16),
        sphereLo: new T.SphereGeometry(1, 12, 8),
        ico: new T.IcosahedronGeometry(1, 0),
        octa: new T.OctahedronGeometry(1, 0),
        rock: new T.DodecahedronGeometry(1, 0),
      };
      // Matériaux « près » partagés : leur opacité suit le zoom (un seul réglage par image)
      const NEAR = this.NEAR = {
        orbit: fade(new T.LineBasicMaterial({ color: 0x9cc6e4, opacity: 0.32 })),
        orbitDash: fade(new T.LineDashedMaterial({ color: 0x5fcc8a, dashSize: 1.2, gapSize: 1.1, opacity: 0.75 })),
        sigWire: fade(new T.MeshBasicMaterial({ color: 0x9fd0ff, wireframe: true, opacity: 0.6 })),
        sigCore: fade(new T.MeshBasicMaterial({ color: 0xbfe0ff, opacity: 1 })),
        sigPing: fade(new T.MeshBasicMaterial({ color: 0x8fc4ff, opacity: 0.5, blending: T.AdditiveBlending })),
        ident: fade(new T.MeshStandardMaterial({ color: 0x5fcc8a, roughness: 0.6, opacity: 0.3 })),
        identWire: fade(new T.MeshBasicMaterial({ color: 0x7fe0a4, wireframe: true, opacity: 0.4 })),
        vein: fade(new T.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xc9a06a, emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.35, flatShading: true, opacity: 1 })),
        veinOff: fade(new T.MeshStandardMaterial({ color: 0x1c1c1c, emissive: 0x3a3a3a, emissiveIntensity: 0.5, flatShading: true, opacity: 1 })),
        rock: fade(new T.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.9, flatShading: true, opacity: 1 })),
        corona: fade(new T.SpriteMaterial({ map: this.halo, color: 0xfff1d8, opacity: 0.16, blending: T.AdditiveBlending })),
        player: fade(new T.MeshBasicMaterial({ color: 0xff7a6a, opacity: 0.9 })),
      };
      this.planetMat = {};
      for (const [k, c] of Object.entries(PLANET_COLS)) this.planetMat[k] = fade(new T.MeshStandardMaterial({ color: c, roughness: 0.85, opacity: 1 }));
      Object.values(this.planetMat).forEach((m) => { NEAR['pl_' + m.uuid] = m; });
      // Repères d'intérêt (mi-distance) : un point de couleur à côté de l'étoile
      this.TICK = {
        sig: fade(new T.MeshBasicMaterial({ color: 0x8fc4ff, opacity: 1 })),
        target: fade(new T.MeshBasicMaterial({ color: 0xffc864, opacity: 1 })),
        planet: fade(new T.MeshBasicMaterial({ color: 0xb4a8ff, opacity: 1 })),
        player: fade(new T.MeshBasicMaterial({ color: 0xff7a6a, opacity: 1 })),
        star: fade(new T.LineBasicMaterial({ color: 0xffc864, opacity: 0.7 })),
      };
      // balises posées : un mât violet, lisible à toutes les distances
      // 13/10 (Adrien) : la balise est un curseur en croix, fin, qui luit à peine — il cadre l'étoile du système
      this.beaconMat = fade(new T.SpriteMaterial({ map: this._reticleTex(), color: 0xc8a8ff, opacity: 1, depthWrite: false, blending: T.AdditiveBlending }));
      // Étoiles : un matériau par couleur, luminosité réglée par le zoom (à peine visibles de loin)
      this.starMat = STAR_COLS.map((c) => { const m = new T.MeshBasicMaterial({ color: c }); m.userData.base = new T.Color(c); return m; });
      this.starHalo = STAR_COLS.map((c) => fade(new T.SpriteMaterial({ map: this.halo, color: c, opacity: 0.3, blending: T.AdditiveBlending })));
      this.dimStar = new T.MeshBasicMaterial({ color: 0x6c7a80 });
      // 21/10 (Adrien) — système « sans intérêt » : soleil rouge no-go, lisible de loin (carte tactique)
      this.noGoStar = new T.MeshBasicMaterial({ color: 0xff2a1e }); this.noGoStar.userData.base = new T.Color(0xff2a1e);
      this.noGoHalo = fade(new T.SpriteMaterial({ map: this.halo, color: 0xff2a1e, opacity: 0.45, blending: T.AdditiveBlending }));
      this.fillMat = {
        known: fade(new T.MeshBasicMaterial({ color: 0x6fa6d6, opacity: 0.03, blending: T.AdditiveBlending })),
        scan: fade(new T.MeshBasicMaterial({ color: 0xe6f0ff, opacity: 0.03, blending: T.AdditiveBlending })),
        home: fade(new T.MeshBasicMaterial({ color: 0x5fffe8, opacity: 0.05, blending: T.AdditiveBlending })),
      };
    },

    // Le plateau : une seule surface, une grille hexagonale continue (shader), qui se dissout au bord
    _board() {
      const T = this.T, R = (BOARD + RIM + 2) * CELL;
      const g = new T.PlaneGeometry(R * 2, R * 2, 1, 1); g.rotateX(-Math.PI / 2);
      this.boardU = {
        uCell: { value: CELL }, uR0: { value: BOARD + 0.2 }, uR1: { value: BOARD + RIM + 0.5 },
        uGrid: { value: 0.5 }, uDot: { value: 0.6 }, uFadeR: { value: 900 }, uMacro: { value: 0.1 },
        uT: { value: new T.Vector2() },
        uLine: { value: new T.Color(0x4f7fae) }, uBase: { value: new T.Color(0x07111b) },
      };
      const m = new T.ShaderMaterial({ uniforms: this.boardU, vertexShader: BOARD_VS, fragmentShader: BOARD_FS, transparent: true, depthWrite: false });
      const mesh = new T.Mesh(g, m); mesh.renderOrder = -2; mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.fills = new T.Group(); this.fills.renderOrder = -1; this.scene.add(this.fills);
      this.labels = new T.Group(); this.scene.add(this.labels);
    },

    // Cases explorées : un voile à peine perceptible — la carte raconte la progression
    paint(st) {
      const T = this.T;
      while (this.fills.children.length) this.fills.remove(this.fills.children[0]);
      if (!this._hexG) this._hexG = this.G.hexFill(24.6);
      for (const [idx, o] of st.occ) {
        const sys = st.systems[o.key];
        if (o.kind === 'home') continue;
        const mat = sys && sys.known ? this.fillMat.known : this.fillMat.scan;
        const f = new T.Mesh(this._hexG, mat); f.position.set(CELLS[idx].x, 0.15, CELLS[idx].z); f.renderOrder = -1;
        this.fills.add(f);
      }
      this._sectorLabels(st);
      this._sweepFan(st);
    },

    _sectorLabels(st) {
      const T = this.T;
      while (this.labels.children.length) { const o = this.labels.children.pop(); o.material.map.dispose(); o.material.dispose(); }
      const tex = this._canvasTex(512, 96, (g, w, h) => {
        g.font = '600 50px "Space Grotesk", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#bfe4ff'; g.fillText(('SECTEUR ' + mySector()).split('').join(' '), w / 2, h / 2 + 2);
      });
      const m = new T.Mesh(new T.PlaneGeometry(120, 22), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.09, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(CELL * 4 * 0.5, 0.4, CELL * 4 * 0.8660254); m.renderOrder = 2;
      this.labels.add(m);
    },

    _sweepFan(st) {
      const T = this.T;
      if (this.fan) { this.fx.remove(this.fan); this.fan.traverse(o => o.geometry && o.geometry.dispose()); this.fan = null; }
      return;   // 13/10 : éventail retiré (trop lumineux) — chaque sonde a son trajet pointillé
      const R = (BOARD + 0.5) * CELL, g = new T.Group();
      const a = new T.CircleGeometry(R, 48, 0, 0.5); a.rotateX(-Math.PI / 2);
      g.add(new T.Mesh(a, this.M.add(0x9fb4c8, 0.005)));
      const b = new T.CircleGeometry(R, 48, 0, 0.1); b.rotateX(-Math.PI / 2);
      g.add(new T.Mesh(b, this.M.add(0xb8c8dc, 0.01)));
      g.position.y = 0.6; g.renderOrder = 3;
      this.fan = g; this.fx.add(g);
    },

    // Ma planète : Kerath, au centre de sa case ; de près, ses échos tournent autour d'elle
    _home() {
      const T = this.T, g = new T.Group();
      const ball = new T.Mesh(new T.SphereGeometry(6.5, 48, 32), new T.MeshStandardMaterial({ color: 0x3f86a2, roughness: 0.85, metalness: 0 }));
      ball.position.y = 7; g.add(ball);
      const load = (u) => new Promise((ok, ko) => new T.TextureLoader().load(u, ok, undefined, ko));
      Promise.all([load('assets/3d/kerath_albedo.jpg'), load('assets/3d/kerath_lights.jpg')]).then(([a, l]) => {
        a.colorSpace = T.SRGBColorSpace; l.colorSpace = T.SRGBColorSpace;
        ball.material.map = a; ball.material.color.set(0xffffff);
        ball.material.emissiveMap = l; ball.material.emissive = new T.Color(0xffc27a); ball.material.emissiveIntensity = 1.3;
        ball.material.needsUpdate = true;
      }).catch(() => {});
      const atmo = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: 0x5fb8ff, transparent: true, opacity: 0.32, depthWrite: false, blending: T.AdditiveBlending }));
      atmo.position.y = 7; atmo.scale.setScalar(22); g.add(atmo);
      // Repère « chez moi » (cyan = navigation) : un anneau fin, lisible même de loin
      const ring = new T.Mesh(this.G.ring(23.75, 24, 96), this.M.add(0x5fffe8, 0.24)); ring.position.y = 0.5; g.add(ring);
      this.homeBall = ball; this.homeRing = ring;
      const name = (G.planet && G.planet.name) || (G.profile && G.profile.planetName) || 'Ma planète';
      const lab = this._label(String(name).toUpperCase(), '#5fffe8', 0.3); lab.position.set(0, 19, 0); g.add(lab);
      this.homeLabel = lab;
      this.scene.add(g);
    },

    _selection() {
      const T = this.T, g = new T.Group();
      // sélection : pas de dalle ni de contour plein — six petits crochets cyan aux sommets
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3, R = 24.8, L = 4.2;
        const vx = Math.cos(a) * R, vz = Math.sin(a) * R;
        for (const da of [-1, 1]) {
          const b = a + da * (Math.PI / 3 + Math.PI / 3);           // direction vers le sommet voisin
          const nb = Math.PI / 6 + (i + da) * Math.PI / 3, nx = Math.cos(nb) * R, nz = Math.sin(nb) * R;
          const dx = nx - vx, dz = nz - vz, l = Math.hypot(dx, dz);
          pts.push(new T.Vector3(vx, 0, vz), new T.Vector3(vx + dx / l * L, 0, vz + dz / l * L));
        }
      }
      const ticks = new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0x5fffe8, transparent: true, opacity: 0.55 }));
      ticks.position.y = 0.6; g.add(ticks);
      g.visible = false; this.selGroup = g; this.selIdx = -1; this.selFill = ticks;
      this.scene.add(g);
      // anneau autour d'un objet sélectionné à l'intérieur d'un système
      const ob = new T.Line(this.G.circle(3.4, 40), new T.LineDashedMaterial({ color: 0x5fffe8, dashSize: 0.9, gapSize: 0.7, transparent: true, opacity: 0.6 })); ob.computeLineDistances(); ob.visible = false;
      this.objRing = ob; this.scene.add(ob);
    },

    setSelection(idx, objCk) {
      this.selIdx = (idx == null || idx < 0) ? -1 : idx;
      this.selCk = objCk || null;
      if (this.selIdx < 0 || (this.selIdx === 0 && !objCk)) { this.selGroup.visible = false; this.selIdx = -1; }
      else { const cl = CELLS[this.selIdx]; this.selGroup.position.set(cl.x, 0, cl.z); this.selGroup.visible = this.selIdx !== 0; }
      this.objRing.visible = !!(this.selCk && this.bodies[this.selCk]);
      if (this.starMeshes) this._lod(true);
    },

    _env(renderer) {
      const T = this.T, s = new T.Scene();
      const g = new T.SphereGeometry(100, 32, 16), col = [];
      const top = new T.Color(0x14263a), hor = new T.Color(0x22384e), bot = new T.Color(0x030507), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 100; const c = y > 0 ? hor.clone().lerp(top, Math.min(1, y * 1.6)) : hor.clone().lerp(bot, Math.min(1, -y * 3)); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      s.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
      const pm = new T.PMREMGenerator(renderer), rt = pm.fromScene(s, 0.04); pm.dispose();
      return rt.texture;
    },
    _canvasTex(w, h, draw, repeat) {
      const T = this.T, c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
      if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / repeat, 1 / repeat); }
      return t;
    },
    _stars() {
      const T = this.T, rnd = _mulberry32(_hashSeed('SM3:stars'));
      const layer = (n, y0, y1, spread, size, op) => {
        const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          p[i * 3] = (rnd() - 0.5) * spread; p[i * 3 + 1] = y0 + rnd() * (y1 - y0); p[i * 3 + 2] = (rnd() - 0.5) * spread;
          const w = 0.7 + rnd() * 0.3, tint = rnd();
          c[i * 3] = w * (tint < 0.2 ? 1 : 0.85); c[i * 3 + 1] = w * 0.9; c[i * 3 + 2] = w * (tint > 0.8 ? 1 : 0.92);
        }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('color', new T.BufferAttribute(c, 3));
        const m = new T.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: op, fog: false, depthWrite: false });
        this.scene.add(new T.Points(g, m));
      };
      layer(2600, -2600, -700, 9000, 1.3, 0.55);
      layer(700, -1600, -500, 6000, 2.0, 0.75);
      const nebCols = [0x2a7a86, 0x5a4a9a, 0x1f5a4a, 0x3a3a7a];
      for (let i = 0; i < 5; i++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: nebCols[i % 4], transparent: true, opacity: 0.09 + rnd() * 0.06, depthWrite: false, fog: false, blending: T.AdditiveBlending }));
        const a = rnd() * Math.PI * 2, d = 600 + rnd() * 1800;
        s.position.set(Math.cos(a) * d, -1400 - rnd() * 600, Math.sin(a) * d);
        s.scale.setScalar(1800 + rnd() * 1600);
        this.scene.add(s);
      }
    },
    _label(txt, color, scale = 1) {
      const T = this.T;
      const tex = this._canvasTex(512, 96, (g, w, h) => {
        g.font = '600 40px "Space Grotesk", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 8;
        g.fillStyle = color; g.fillText(txt.split('').join(' '), w / 2, h / 2);
      });
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, sizeAttenuation: false }));
      // taille fixe à l'écran (≈ 10–11 px de texte sur iPhone), quelle que soit la distance
      const k = 0.0165 * (scale >= 0.3 ? 1.1 : 1);
      s.scale.set(k * 512 / 96, k, 1); s.renderOrder = 5;
      s.userData.tex = tex;
      return s;
    },
    _tickFlights() {
      const now = Date.now(), T = this.T, tmp = new T.Vector3();
      const along = (f, d, out) => {   // point à la distance d le long du tracé
        const c = f.cum; d = Math.max(0, Math.min(c[c.length - 1], d));
        let i = 1; while (i < c.length - 1 && c[i] < d) i++;
        const seg = c[i] - c[i - 1] || 1;
        out.lerpVectors(f.pts[i - 1], f.pts[i], (d - c[i - 1]) / seg); return i;
      };
      for (const f of this.flights) {
        let k = f.t1 > f.t0 ? (now - f.t0) / (f.t1 - f.t0) : 1; k = Math.max(0, Math.min(1, k));
        if (f.pts) {
          const total = f.cum[f.cum.length - 1], d = k * total, i = along(f, d, tmp);
          f.ship.position.copy(tmp); f.ship.lookAt(f.pts[i].x, f.pts[i].y, f.pts[i].z);
          const back = new T.Vector3(); along(f, d - 60, back);
          const p = f.trail.geometry.attributes.position;
          p.setXYZ(0, back.x, back.y, back.z); p.setXYZ(1, tmp.x, tmp.y, tmp.z); p.needsUpdate = true;
          f.trail.geometry.computeBoundingSphere();
          continue;
        }
        tmp.lerpVectors(f.a, f.b, k);
        f.ship.position.copy(tmp);
        f.ship.lookAt(f.b.x, f.b.y, f.b.z);
        const L = tmp.distanceTo(f.a), max = 60, s = L > max ? (L - max) / L : 0;
        const p = f.trail.geometry.attributes.position;
        p.setXYZ(0, f.a.x + (tmp.x - f.a.x) * s, f.a.y, f.a.z + (tmp.z - f.a.z) * s); p.setXYZ(1, tmp.x, tmp.y, tmp.z); p.needsUpdate = true;
        f.trail.geometry.computeBoundingSphere();
      }
    },
    _resize() {
      if (!this.host) return;
      const w = this.host.clientWidth || 360, h = this.host.clientHeight || 420;
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h); this.bloom.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    },
    moveTo(x, z, dist, ms = 800) {
      const T = this.T;
      const from = this.controls.target.clone(), to = new T.Vector3(x, 0, z);
      const d0 = this.camera.position.distanceTo(this.controls.target), d1 = dist == null ? d0 : dist, t0 = performance.now();
      this._anim = (now) => {
        const k = Math.min(1, (now - t0) / Math.max(1, ms)), e = k * k * (3 - 2 * k);
        this.controls.target.lerpVectors(from, to, e);
        this.camera.position.copy(this.controls.target).addScaledVector(this.camDir, d0 + (d1 - d0) * e);
        if (k >= 1) this._anim = null;
      };
    },
    visible() {
      const h = this.host;
      return !!(h && h.isConnected && h.offsetParent !== null && !h.closest('.screen.hidden') && !document.hidden);
    },

    // Les systèmes : un point de loin, un système complet de près
    build(st) {
      const T = this.T, Gm = this.G;
      while (this.content.children.length) {
        const o = this.content.children.pop();
        o.traverse(x => { if (x.userData.tex) x.userData.tex.dispose(); if ((x.isMesh || x.isLine) && !x.userData.shared) x.geometry.dispose(); });
      }
      this.anims = []; this.flights = []; this.bodies = {}; this.labelsLod = []; this.nearGroups = []; this.ticks = []; this.starMeshes = [];
      const A = this.anims;
      const home = mySystemKey();
      const mark = (o) => { o.userData.shared = true; return o; };

      for (const s of Object.values(st.systems)) {
        const ci = st.cell['sys:' + s.key];
        if (ci === undefined) continue;
        const isHome = s.key === home;
        const g = new T.Group(); g.position.set(CELLS[ci].x, 0, CELLS[ci].z);
        g.userData.cell = ci;
        const list = (st.items && st.items[s.key]) || [];

        if (!isHome) {
          const ci2 = Math.floor(_mulberry32(_hashSeed('SM3:star:' + s.key))() * STAR_COLS.length);
          const known = s.known;
          const tag = (G.systemTags || {})[s.key];
          const star = mark(new T.Mesh(Gm.sphere, tag === 'skip' ? this.noGoStar : known ? this.starMat[ci2] : this.dimStar));
          const _sz = tag === 'skip' ? 2.7 : known ? 2.1 : 1.3;   // no-go : un peu plus gros, repérable d'un coup d'œil
          star.scale.setScalar(_sz); star.position.y = 5; star.userData.star = true; star.userData.base = _sz; g.add(star);
          this.starMeshes.push({ mesh: star, cell: ci, halo: null });
          const halo = new T.Sprite(tag === 'skip' ? this.noGoHalo : this.starHalo[ci2]); halo.position.y = 5; halo.scale.setScalar(tag === 'skip' ? 15 : known ? 11 : 6); g.add(halo);
          this.starMeshes[this.starMeshes.length - 1].halo = halo;
          if (known) {
            const lab = this._label(s.key.split('-').slice(1).join('-'), '#9fb3bf', 0.27); lab.position.set(0, 1, 12); g.add(lab);
            this.labelsLod.push(lab);
          }
          if (s.scanning) {
            for (let k = 0; k < 2; k++) {
              const w = new T.Mesh(Gm.ring(5, 5.35, 48), this.M.add(0xcfdcea, 0.2)); w.position.y = 0.6; g.add(w);
              const ph = k * 0.5;
              A.push((t) => { const u = (t * 0.45 + ph) % 1; w.scale.setScalar(0.5 + u * 2.4); w.material.opacity = 0.2 * (1 - u); });
            }
          }
          // repère d'intérêt (mi-distance) : la couleur la plus importante de ce que contient le système
          const has = (k) => list.some((it) => it.kind === k && !(k === 'sig' && it.obj.resolved));
          const hasPlayer = list.some((it) => it.kind === 'planet' && it.obj.playerName);
          const tk = tag === 'skip' ? null : hasPlayer ? 'player' : has('sig') ? 'sig' : has('target') ? 'target' : list.some((it) => it.kind === 'planet') ? 'planet' : null;
          if (tag === 'star') {
            // marqué « intéressant » : un fin cercle doré autour de l'étoile
            const ring = mark(new T.Line(this._circleG || (this._circleG = Gm.circle(1)), this.TICK.star)); ring.scale.setScalar(7.5); ring.position.y = 0.5; g.add(ring);
          }
          if (tk) {
            const tick = mark(new T.Mesh(Gm.sphereLo, this.TICK[tk])); tick.scale.setScalar(1.1); tick.position.set(4.2, 5, -2.4); g.add(tick);
            this.ticks.push(tick);
          }
        }

        // balise posée ici : un mât violet à côté de l'étoile
        if (s.beacons && s.beacons.length) {
          const ret = mark(new T.Sprite(this.beaconMat));
          if (isHome) { ret.position.set(-9, 5, 9); ret.scale.setScalar(9); } else { ret.position.set(0, 5, 0); ret.scale.setScalar(13); }
          ret.renderOrder = 4; g.add(ret);
        }

        // 14/10 — lignes PNJ
        const li = s.li;
        if (li && li.port) {
          for (const [r0, r1, op] of [[8.2, 8.6, 0.85], [10.4, 10.65, 0.45]]) {
            const ring = mark(new T.Mesh(Gm.ring(r0, r1, 64), this.M.add(0xffc864, op))); ring.position.y = 0.7; g.add(ring);
          }
          const lab = this._label(li.port.name, '#ffd08a', 0.3); lab.position.set(0, 1, -14); g.add(lab);
        } else if (li && li.echo && !(s.beacons && s.beacons.length)) {
          const w = new T.Mesh(Gm.ring(5.6, 5.95, 48), this.M.add(0xffc864, 0.35)); w.position.y = 0.6; g.add(w);
          A.push((t) => { const u = (t * 0.35) % 1; w.scale.setScalar(0.7 + u * 1.8); w.material.opacity = 0.35 * (1 - u); });
        }
        if (li && (li.lane || li.obs.length) && !li.port) {
          const d = mark(new T.Mesh(Gm.sphereLo, this.TICK.target)); d.scale.setScalar(0.8); d.position.set(-4.2, 5, -2.4); g.add(d); this.ticks.push(d);
        }

        // 13/10 — postes de route : losanges près de l'étoile (or = le mien, orangé = un autre commandant)
        const nPosts = (s.posts || []).length, nOthers = (s.others || []).length;
        if (nPosts || nOthers) {
          if (!this.postMat) { this.postMat = { me: new T.MeshBasicMaterial({ color: 0xffc864 }), other: new T.MeshBasicMaterial({ color: 0xff9a6a }) }; this.G.post = new T.OctahedronGeometry(1.15, 0); }
          const list2 = [...Array(Math.min(nPosts, 1)).fill('me'), ...Array(Math.min(nOthers, 3)).fill('other')];
          list2.forEach((kind, i) => {
            const d = mark(new T.Mesh(this.G.post, this.postMat[kind])); d.scale.set(1, 1.5, 1);
            d.position.set(isHome ? 9 : 6.2 + i * 3, 5, isHome ? -9 : 3.6); g.add(d);
          });
        }

        // ── Détail « près » : orbites et corps, à l'intérieur de la case ──
        if (list.length) {
          const near = new T.Group(); near.visible = false; g.add(near); this.nearGroups.push(near);
          if (!isHome) { const cor = new T.Sprite(this.NEAR.corona); cor.position.y = 5; cor.scale.setScalar(13); near.add(cor); }
          list.forEach((it) => {
            const R = ORBIT(it.orbit, isHome);
            const orb = new T.Line(this._circleG || (this._circleG = Gm.circle(1)), this.NEAR.orbit); mark(orb);
            orb.scale.setScalar(R); orb.position.y = 0.5; near.add(orb);
            const piv = new T.Group(); piv.rotation.y = it.ang; near.add(piv);
            const body = new T.Group(); body.position.set(R, 4, 0); piv.add(body);
            const speed = 0.05 / Math.max(1, R / 8);
            if (!this.still) A.push((t) => { piv.rotation.y = it.ang + t * speed; });
            this._body(it, body, A);
            // zone de toucher généreuse
            const hit = new T.Mesh(Gm.sphereLo, new T.MeshBasicMaterial({ visible: false })); hit.scale.setScalar(4.2); mark(hit);
            hit.userData.pick = { kind: it.kind, key: it.key }; body.add(hit);
            this.bodies[it.ck] = body;
          });
        }
        this.content.add(g);
      }

      // Vaisseaux en vol : fins, discrets ; ils filent vers le corps visé quand il est connu
      const wp = new T.Vector3();
      for (const f of st.flights) {
        const c = f.kind === 'tanker' ? 0xffc864 : f.kind === 'fleet' ? 0xc9a8ff : (f.tier === 'radar' ? 0xe6f0ff : f.tier === 'medium' ? 0x9a8aff : 0x5fcc8a);
        const H = 9;
        const pos = (idx, ck) => {
          if (ck && this.bodies[ck]) { this.content.updateMatrixWorld(true); this.bodies[ck].getWorldPosition(wp); return new T.Vector3(wp.x, H, wp.z); }
          return idx === 0 ? new T.Vector3(0, H, 0) : new T.Vector3(CELLS[idx].x, H, CELLS[idx].z);
        };
        const a = pos(f.from, null), b = pos(f.to, f.toCk);
        const out = (p, q) => { const d = q.clone().sub(p); d.y = 0; const L = d.length(); return L > 20 ? p.clone().addScaledVector(d.normalize(), 9) : p; };
        // 13/10 — sur une route : le vaisseau suit les cases du tracé
        let pts = null;
        if (f.path && f.path.length > 2) {
          const raw = f.path.map(i => pos(i, null)); raw[0] = a; raw[raw.length - 1] = b;
          pts = this._smooth(raw).map(q => new T.Vector3(q.x, H, q.z));
          if (f.from === 0) a.copy(out(a, pts[1])); if (f.to === 0) b.copy(out(b, pts[pts.length - 2]));
          pts[0].copy(a); pts[pts.length - 1].copy(b);
        } else { if (f.from === 0) a.copy(out(a, b)); if (f.to === 0) b.copy(out(b, a)); }
        const route = new T.Line(new T.BufferGeometry().setFromPoints(pts || [a, b]), new T.LineDashedMaterial({ color: c, dashSize: 3, gapSize: 4, transparent: true, opacity: pts ? 0.4 : 0.22 }));
        route.computeLineDistances(); this.content.add(route);
        const trail = new T.Line(new T.BufferGeometry().setFromPoints([a.clone(), a.clone()]), new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.6 }));
        this.content.add(trail);
        const ship = new T.Group();
        const mesh = f.kind === 'tanker'
          ? new T.Mesh(new T.BoxGeometry(2.4, 1.6, 4), new T.MeshBasicMaterial({ color: c }))
          : new T.Mesh(new T.ConeGeometry(1.3, 4, 4), new T.MeshBasicMaterial({ color: c }));
        if (f.kind !== 'tanker') mesh.rotation.x = Math.PI / 2;
        ship.add(mesh);
        const glow = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: c, transparent: true, opacity: 0.18, depthWrite: false, blending: T.AdditiveBlending })); glow.scale.setScalar(5); ship.add(glow);
        const hit = new T.Mesh(new T.SphereGeometry(9, 8, 6), new T.MeshBasicMaterial({ visible: false })); ship.add(hit);
        ship.userData.flight = f.id;
        this.content.add(ship);
        const fl = { ship, trail, a, b, t0: f.departedAt || 0, t1: f.arrivalAt || 0 };
        if (pts) { fl.pts = pts; fl.cum = [0]; for (let i = 1; i < pts.length; i++) fl.cum.push(fl.cum[i - 1] + pts[i].distanceTo(pts[i - 1])); }
        this.flights.push(fl);
      }
      this._tickFlights();
      this._routes(st);
      this._lod(true);
    },

    // Routes entre balises : un ruban fin de la couleur choisie, posé sur le plateau, case à case
    _routes(st) {
      const T = this.T;
      if (!this.routeGroup) { this.routeGroup = new T.Group(); this.scene.add(this.routeGroup); this.routeFx = new T.Group(); this.scene.add(this.routeFx); }
      while (this.routeGroup.children.length) { const o = this.routeGroup.children.pop(); if (!o.isSprite) o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      this.routeMeshes = {};
      for (const rt of st.routes || []) {
        if (rt.broken || rt.path.length < 2) {
          if (rt.a && rt.b) {   // tracé impossible : pointillé gris entre les balises
            const l = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(CELLS[rt.a.ci].x, 0.9, CELLS[rt.a.ci].z), new T.Vector3(CELLS[rt.b.ci].x, 0.9, CELLS[rt.b.ci].z)]),
              new T.LineDashedMaterial({ color: 0x8a96a0, dashSize: 4, gapSize: 4, transparent: true, opacity: 0.45 }));
            l.computeLineDistances(); this.routeGroup.add(l);
          }
          continue;
        }
        // 13/10 (Adrien) : une courbe fine et douce, sans angles raides ; un halo très léger dessous
        const pts = this._smooth(rt.path.map(i => CELLS[i])).map(q => new T.Vector2(q.x, q.z));
        const glow = new T.Mesh(this._ribbon(pts, 1.5), new T.MeshBasicMaterial({ color: rt.r.color, transparent: true, opacity: 0.07, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
        glow.position.y = 0.85; glow.renderOrder = 3; this.routeGroup.add(glow);
        const mesh = new T.Mesh(this._ribbon(pts, 0.3), new T.MeshBasicMaterial({ color: rt.r.color, transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide }));
        mesh.position.y = 0.9; mesh.renderOrder = 3; mesh.userData.route = rt.r.id; mesh.userData.glow = glow;
        this.routeGroup.add(mesh); this.routeMeshes[rt.r.id] = mesh;
        // 15/10 — jalons numérotés le long de la route (1, 2, 3…), pour lire où elle passe et dans quel ordre
        for (let i = 1; i < rt.path.length - 1; i++) {
          const c = CELLS[rt.path[i]];
          const tag = this._label(String(i), rt.r.color, 0.24); tag.position.set(c.x - 9, 2.2, c.z - 7);
          this.routeGroup.add(tag);
        }
      }
      // 21/10 — routes commerciales (accord commercial en cours) : trait doré plein vers le partenaire
      for (const tp of st.trade || []) {
        const l = new T.Line(new T.BufferGeometry().setFromPoints(this._smooth(tp.path.map(i => CELLS[i])).map(q => new T.Vector3(q.x, 0.9, q.z))),
          new T.LineBasicMaterial({ color: 0xffc864, transparent: true, opacity: 0.8, depthWrite: false }));
        this.routeGroup.add(l);
        const A = CELLS[tp.path[0]], B = CELLS[tp.path[1]];
        const tag = this._label(tp.pseudo, '#ffc864', 0.22); tag.position.set((A.x + B.x) / 2, 2.2, (A.z + B.z) / 2 - 6);
        this.routeGroup.add(tag);
      }
      // 13/10 — tronçons repérés par mes balises : un convoi est passé par là, cap sur le système suivant
      // un seul trait par paire de systèmes ; une flèche seulement si un seul sens a été vu
      const pairs = new Map();
      for (const sp of st.spotted || []) {
        if (sp.path.length < 2) continue;
        const a0 = sp.path[0], b0 = sp.path[sp.path.length - 1], key = a0 < b0 ? a0 + ':' + b0 : b0 + ':' + a0;
        const e = pairs.get(key);
        if (e) { if (e.sp.path[0] !== a0) e.both = true; } else pairs.set(key, { sp, both: false });
      }
      for (const { sp, both } of pairs.values()) {
        const l = new T.Line(new T.BufferGeometry().setFromPoints(this._smooth(sp.path.map(i => CELLS[i])).map(q => new T.Vector3(q.x, 0.8, q.z))),
          new T.LineDashedMaterial({ color: 0xff8a5a, dashSize: 5, gapSize: 5, transparent: true, opacity: 0.55, depthWrite: false }));
        l.computeLineDistances(); this.routeGroup.add(l);
        // 15/10 (Adrien) — le tronçon se touche : qui est passé, d'où, vers où
        const legHit = (x, z) => { const h = new T.Mesh(new T.SphereGeometry(8, 8, 6), new T.MeshBasicMaterial({ visible: false })); h.position.set(x, 1, z); h.userData.leg = sp.l.id; this.routeGroup.add(h); };
        if (both) { const A = CELLS[sp.path[0]], B = CELLS[sp.path[sp.path.length - 1]]; legHit((A.x + B.x) / 2, (A.z + B.z) / 2); continue; }
        const tip = CELLS[sp.path[sp.path.length - 1]], prev = CELLS[sp.path[sp.path.length - 2]];
        const ang = Math.atan2(tip.x - prev.x, tip.z - prev.z);
        const arrow = new T.Mesh(new T.ConeGeometry(2.6, 7, 3), new T.MeshBasicMaterial({ color: 0xff8a5a, transparent: true, opacity: 0.7, depthWrite: false }));
        arrow.rotation.set(Math.PI / 2, ang, 0, 'YXZ');   // cône couché, pointe vers le système suivant
        const mx = tip.x - (tip.x - prev.x) * 0.45, mz = tip.z - (tip.z - prev.z) * 0.45;
        arrow.position.set(mx, 0.9, mz); this.routeGroup.add(arrow); legHit(mx, mz);
      }
    },
    _reticleTex() {
      const T = this.T, c = document.createElement('canvas'), S = 128, m = S / 2; c.width = c.height = S;
      const x = c.getContext('2d');
      x.strokeStyle = '#ffffff'; x.lineCap = 'round';
      const arms = () => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x.beginPath(); x.moveTo(m + dx * 21, m + dy * 21); x.lineTo(m + dx * 50, m + dy * 50); x.stroke(); } };
      x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 9; x.lineWidth = 2.2; x.globalAlpha = 0.45; arms();   // halo à peine marqué
      x.shadowBlur = 0; x.lineWidth = 1.6; x.globalAlpha = 1; arms();
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
    },
    // Courbe douce à travers les cases (coins coupés de Chaikin, extrémités fixes)
    _smooth(pts, it = 3) {
      let p = pts.map(q => ({ x: q.x, z: q.z }));
      if (p.length < 3) return p;
      for (let n = 0; n < it; n++) {
        const o = [p[0]];
        for (let i = 0; i < p.length - 1; i++) {
          const a = p[i], b = p[i + 1];
          if (i > 0) o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
          if (i < p.length - 2) o.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
        }
        o.push(p[p.length - 1]); p = o;
      }
      return p;
    },
    _ribbon(pts, w) {
      const T = this.T, v = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.y - a.y, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w, nz = dx / L * w;
        v.push(a.x + nx, 0, a.y + nz, a.x - nx, 0, a.y - nz, b.x - nx, 0, b.y - nz, a.x + nx, 0, a.y + nz, b.x - nx, 0, b.y - nz, b.x + nx, 0, b.y + nz);
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); return g;
    },
    // Route sélectionnée : plus visible ; ses systèmes évités cerclés de rouge
    highlightRoute(id, st) {
      if (!this.routeGroup) return;
      for (const [rid, m] of Object.entries(this.routeMeshes || {})) { const o = rid === id ? 1 : (id ? 0.3 : 0.7); m.material.opacity = o; if (m.userData.glow) m.userData.glow.material.opacity = 0.07 + (rid === id ? 0.06 : 0); m.scale.y = 1; }
      while (this.routeFx.children.length) { const o = this.routeFx.children.pop(); if (o.geometry && !o.userData.shared) o.geometry.dispose(); }
      const rt = id && st && (st.routes || []).find(x => x.r.id === id);
      if (!rt) return;
      const T = this.T;
      for (const k of rt.r.avoid || []) {
        const ci = st.cell['sys:' + k]; if (ci === undefined) continue;
        const ring = new T.Mesh(this.G.ring(10, 10.8, 48), this.M.add(0xff6a5a, 0.55)); ring.position.set(CELLS[ci].x, 0.7, CELLS[ci].z); this.routeFx.add(ring);
      }
      for (const end of [rt.a, rt.b]) {
        if (!end) continue;
        const ring = new T.Mesh(this.G.ring(13, 13.6, 48), new T.MeshBasicMaterial({ color: rt.r.color, transparent: true, opacity: 0.7, depthWrite: false })); ring.position.set(CELLS[end.ci].x, 0.7, CELLS[end.ci].z); this.routeFx.add(ring);
      }
    },

    // Un corps à l'intérieur d'un système (échelle « près »)
    _body(it, g, A) {
      const T = this.T, Gm = this.G, N = this.NEAR;
      const mark = (o) => { o.userData.shared = true; return o; };
      if (it.kind === 'sig' && !it.obj.resolved) {
        // écho : on ne devine pas une planète — un icosaèdre filaire qui respire
        const ico = mark(new T.Mesh(Gm.ico, N.sigWire)); ico.scale.setScalar(1.25); g.add(ico);
        const core = mark(new T.Mesh(Gm.sphereLo, N.sigCore)); core.scale.setScalar(0.32); g.add(core);
        const ph = _mulberry32(_hashSeed(it.key))();
        A.push((t) => { ico.rotation.y = t * 0.5 + ph * 6; ico.rotation.x = t * 0.3; core.scale.setScalar(0.28 + 0.08 * Math.sin(t * 2.6 + ph * 6)); });
      } else if (it.kind === 'sig') {
        const body = mark(new T.Mesh(Gm.sphere, N.ident)); body.scale.setScalar(1.8); g.add(body);
        const wire = mark(new T.Mesh(Gm.sphereLo, N.identWire)); wire.scale.setScalar(1.9); g.add(wire);
        A.push((t) => { wire.rotation.y = t * 0.2; });
      } else if (it.kind === 'target') {
        const engaged = it.obj.kt && it.obj.kt.status === 'engaged';
        const gem = mark(new T.Mesh(Gm.octa, engaged ? N.veinOff : N.vein)); gem.scale.set(1.5, 2.0, 1.5); g.add(gem);
        const rnd = _mulberry32(_hashSeed('SM3:rocks:' + it.key));
        for (let k = 0; k < 5; k++) {
          const rk = mark(new T.Mesh(Gm.rock, N.rock)); rk.scale.setScalar(0.35 + rnd() * 0.6);
          const a = rnd() * Math.PI * 2, d = 2.4 + rnd() * 2.2; rk.position.set(Math.cos(a) * d, (rnd() - 0.5) * 1.6, Math.sin(a) * d); rk.rotation.set(rnd() * 3, rnd() * 3, 0); g.add(rk);
        }
        A.push((t) => { gem.rotation.y = t * 0.6; });
      } else if (it.kind === 'planet') {
        const pl = it.obj;
        const cls = PLANET_COLS[pl.type] ? pl.type : (SIG_CLASS[(pl.fromSig || {}).fixedClass] || 'type2');
        const big = cls === 'type4' ? 2.8 : cls === 'type3' ? 2.3 : 1.9;
        const ball = mark(new T.Mesh(Gm.sphere, this.planetMat[cls])); ball.scale.setScalar(big); g.add(ball);
        A.push((t) => { ball.rotation.y = t * 0.12; });
        if (pl.playerName) {
          // monde habité par un autre commandant : un liseré rouge et son nom
          const rr = mark(new T.Mesh(Gm.sphereLo, N.player)); rr.scale.setScalar(0.55); rr.position.set(0, big + 1.1, 0); g.add(rr);
        }
        const lab = this._label(String(pl.playerName || pl.name || '').toUpperCase(), pl.playerName ? '#ff9a8a' : '#c4b8ff', 0.28);
        lab.position.set(0, -big - 1.6, 0); g.add(lab); this.labelsLod.push(lab); lab.userData.near = true;
      }
    },

    // Niveaux de détail selon la distance de la caméra
    _lod(force) {
      const d = this.dist();
      if (!force && this._lastD !== undefined && Math.abs(d - this._lastD) < 1) return;
      this._lastD = d;
      const far = sstep(LOD.FAR, LOD.MID, d);            // 0 très loin → 1 à mi-distance
      const near = sstep(LOD.NEAR_OUT, LOD.NEAR_IN, d);  // 0 → 1 en s'approchant
      const lab = sstep(LOD.LABEL_OUT, LOD.LABEL_IN, d);
      // étoiles : à peine visibles de loin, nettes de près
      const k = (0.22 + 0.78 * far) * (1 - 0.45 * near);
      this.starMat.forEach((m) => m.color.copy(m.userData.base).multiplyScalar(k));
      this.starHalo.forEach((m) => { m.opacity = (0.04 + 0.22 * far) * (1 - 0.85 * near); });
      this.dimStar.color.setRGB(0.42 * k, 0.48 * k, 0.5 * k);
      this.noGoStar.color.copy(this.noGoStar.userData.base).multiplyScalar(Math.max(0.75, k));   // reste vif même de loin
      this.noGoHalo.opacity = (0.18 + 0.27 * far) * (1 - 0.8 * near);
      for (const m of Object.values(this.TICK)) m.opacity = (m.userData.base || 1) * far * (1 - near);
      this.beaconMat.opacity = 0.35 + 0.65 * far;
      for (const m of Object.values(this.NEAR)) m.opacity = (m.userData.base == null ? 1 : m.userData.base) * near;
      for (const m of Object.values(this.fillMat)) m.opacity = m.userData.base * (0.5 + 0.5 * far) * (1 - near);
      this.nearGroups.forEach((g) => { g.visible = near > 0.01; });
      // de près, seul le système ouvert garde son étoile ; les voisines deviennent de simples points
      const focus = this.selIdx >= 0 ? this.selIdx : -1;
      for (const sm of this.starMeshes || []) {
        const f = sm.cell === focus ? 1 : 1 - 0.75 * near;
        sm.mesh.scale.setScalar(sm.mesh.userData.base * f);
        if (sm.halo) sm.halo.visible = sm.cell === focus || near < 0.5;
      }
      // l'anneau « chez moi » s'efface de près : les orbites prennent le relais
      if (this.homeRing) this.homeRing.visible = near < 0.97;
      this._homeNear = near;
      // noms de systèmes : à mi-distance seulement (de près, la fiche donne le nom ; les corps ont le leur)
      this.labelsLod.forEach((s) => { s.material.opacity = s.userData.near ? near : lab * (1 - near); s.visible = s.material.opacity > 0.01; });
      if (this.homeLabel) this.homeLabel.material.opacity = (0.35 + 0.35 * far);
      // la grille : discrète de loin (l'immensité), plus lisible de près
      this.boardU.uGrid.value = 0.2 * far;                 // de loin : pas de nid d'abeille, l'immensité
      this.boardU.uDot.value = 0.3 * far;
      this.boardU.uMacro.value = (0.07 + 0.05 * (1 - far)) * (1 - near);   // structure de secteur jusqu'au niveau système  // de très haut : la macro-grille seule
      this.boardU.uFadeR.value = Math.max(420, d * 1.05);
      this.objRing.material.opacity = 0.6 * near;
    },

    _picking(el) {
      const T = this.T, ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
      let down = null;
      el.addEventListener('pointerdown', (e) => { if (e.isPrimary) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      el.addEventListener('pointerup', (e) => {
        if (!down || !e.isPrimary) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
        down = null;
        if (moved > 8 || dt > 450) return;
        const rect = el.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, this.camera);
        // 1) un vaisseau en vol
        const ships = this.content.children.filter(o => o.userData.flight);
        const sh = ray.intersectObjects(ships, true)[0];
        if (sh) { let o = sh.object; while (o && !o.userData.flight) o = o.parent; if (o) return onPick({ kind: 'flight', key: o.userData.flight }); }
        // 2) de près : un corps dans un système
        const visNear = this.nearGroups.filter(g => g.visible);
        if (visNear.length) {
          const hb = ray.intersectObjects(visNear, true).find(h => h.object.userData.pick);
          if (hb) return onPick(Object.assign({}, hb.object.userData.pick));
        }
        // 3) une étoile, ma planète
        const st = ray.intersectObjects(this.content.children.filter(o => o.userData.cell !== undefined), true).find(h => h.object.userData.star);
        if (st) { let o = st.object; while (o && o.userData.cell === undefined) o = o.parent; if (o) return onPickCell(o.userData.cell); }
        if (this.homeBall && ray.intersectObject(this.homeBall).length) return onPickCell(0);
        // 3 bis) un tronçon relevé (la flèche orange d'un convoi)
        const legs = this.routeGroup ? this.routeGroup.children.filter(o => o.userData.leg) : [];
        const lh = legs.length ? ray.intersectObjects(legs)[0] : null;
        if (lh) return onPick({ kind: 'leg', key: lh.object.userData.leg });
        // 4) la case sous le doigt
        if (!ray.ray.intersectPlane(plane, hit)) return;
        const c = cellAtWorld(hit.x, hit.z);
        onPickCell(c ? c.idx : -1);
      });
    },

    _frame() {
      if (!this.visible()) { this._last = performance.now(); return; }
      const now = performance.now(), dt = Math.min((now - this._last) / 1000, 0.05);
      this._last = now; this._t += dt; const t = this._t;
      if (this._anim) this._anim(now);
      this.controls.update();
      const tg = this.controls.target; this.boardU.uT.value.set(tg.x, tg.z);
      this._lod(false);
      if (!this.still) for (const f of this.anims) f(t);
      if (this.homeBall && !this.still) this.homeBall.rotation.y = t * 0.05;
      if (this.homeRing) this.homeRing.material.opacity = (this.still ? 0.2 : 0.18 + 0.06 * Math.sin(t * 1.6)) * (1 - (this._homeNear || 0));
      if (this.fan && !this.still) this.fan.rotation.y = -t * 1.05;
      if (this.selGroup.visible && !this.still) this.selFill.material.opacity = 0.45 + 0.15 * Math.sin(t * 2.4);
      if (this.objRing.visible && this.selCk && this.bodies[this.selCk]) {
        const b = this.bodies[this.selCk]; b.getWorldPosition(this.objRing.position); this.objRing.position.y = 0.7;
        if (!this.still) this.objRing.rotation.y = t * 0.8;
      }
      if (this.flights.length) this._tickFlights();
      if (t - this._check > 1) { this._check = t; try { refreshIfChanged(); } catch (e) {} }
      this.composer.render();
    },
  };

  /* ═══════════════════ Liaison jeu ↔ plateau ═══════════════════ */
  function selCell(st) {
    if (!_sel) return -1;
    if (_sel.cell != null) return _sel.cell;
    const m = { home: 'sys:', system: 'sys:', sig: 'sig:', target: 'tgt:', planet: 'pl:' }[_sel.kind];
    if (!m) return -1;
    const i = st.cell[m + _sel.key];
    return i === undefined ? -1 : i;
  }

  function selCk() {
    if (!_sel) return null;
    const m = { sig: 'sig:', target: 'tgt:', planet: 'pl:' }[_sel.kind];
    return m ? m + _sel.key : null;
  }
  // de loin, toucher un système fait plonger la caméra dessus : la case s'ouvre et montre son contenu
  const NEAR_DIST = 210;
  function diveTo(idx) { if (E.ready && idx >= 0 && E.dist() > 420) E.moveTo(CELLS[idx].x, CELLS[idx].z, NEAR_DIST, 750); }

  function onPick(sel) {
    // en mode « éviter un système », toucher un corps céleste vaut toucher son système
    if (_pickAvoid) {
      const st = _state || collect();
      const ck = sel && ({ planet: 'pl:', sig: 'sig:', target: 'tgt:' }[sel.kind] || '') + sel.key;
      const ci = ck ? st.cell[ck] : undefined;
      return onPickCell(ci === undefined ? -1 : ci);
    }
    // 15/10 (Adrien) — toucher un tanker ou une flotte en vol ouvre sa fiche, comme partout dans le jeu
    if (sel && sel.kind === 'flight') {
      const f = ((_state || collect()).flights || []).find(x => x.id === sel.key);
      if (f && f.kind === 'tanker' && window.SBMissions) { SBMissions.open(f.id); return; }
      if (f && f.kind === 'fleet' && f.fleetId && typeof openFleetDetail === 'function') { openFleetDetail(f.fleetId); return; }
    }
    _sel = sel; refresh(true);
  }

  function onPickCell(idx) {
    const st = _state || collect();
    if (_pickAvoid) {
      // mode « éviter un système » : le système touché entre (ou sort) de la liste d'évitement de la route
      const rid = _pickAvoid; _pickAvoid = null;
      const o = idx >= 0 ? st.occ.get(idx) : null, r = routeById(rid);
      if (r && o && o.kind === 'system') {
        r.avoid = r.avoid || [];
        if (r.avoid.includes(o.key)) r.avoid = r.avoid.filter(k => k !== o.key); else r.avoid.push(o.key);
        if (typeof saveGame === 'function') saveGame();
      } else if (typeof toast === 'function') toast('Ce n’est pas un système : rien à éviter ici');
      return selectRoute(rid);   // on recadre sur le nouveau tracé
    }
    const c = idx >= 0 ? CELLS[idx] : null;
    if (!c || c.ring > BOARD) { _sel = null; return refresh(true); }
    const o = st.occ.get(idx);
    if (o) { _sel = { kind: o.kind, key: o.key }; refresh(true); return diveTo(idx); }
    const sector = sectorOfCell(c);
    if (c.ring === 1) { _sel = { kind: 'orbit', cell: idx }; return refresh(true); }   // autour de ma planète : mon propre système
    if (c.ring > st.lit) { _sel = { kind: 'far', sector, cell: idx }; return refresh(true); }
    _sel = { kind: 'dark', sector, sysKey: pickSystemForCell(c), cell: idx };
    refresh(true);
  }

  // Reconstruit le plateau si l'état du jeu a changé ; met à jour la fiche
  function refresh(panelToo) {
    if (!E.ready) return;
    const st = collect();
    const fp = fingerprint(st);
    const changed = fp !== _sigStr;
    _state = st;
    if (changed) { _sigStr = fp; E.paint(st); E.build(st); }
    // une sélection qui a disparu (signature résolue, cible expirée) est remplacée par le résumé
    if (_sel && ['sig', 'target', 'planet', 'system', 'flight'].includes(_sel.kind) && selCell(st) < 0 && _sel.kind !== 'flight') _sel = null;
    E.setSelection(selCell(st), selCk());
    E.highlightRoute(_sel && _sel.kind === 'route' ? _sel.key : null, st);
    if (panelToo || changed) renderPanel(st);
  }
  function refreshIfChanged() { if (_root && _root.isConnected) refresh(false); }

  function renderPanel(st) {
    st = st || collect();
    if (W.on) return W.renderCard(st);
    const host = _root && _root.querySelector('.sm3-panel');
    if (host) host.innerHTML = panelMarkup(st);
  }

  function ensureDom() {
    if (!_root) _root = document.getElementById('spacemap-root');
    if (!_root) return false;
    if (!_root.querySelector('.sm3-wrap')) {
      _root.innerHTML = `<div class="sm3-wrap">
          <div class="sm3-view"><div class="sm3-load">Chargement du plateau…</div></div>
          <button class="sm3-btn sm3-home" aria-label="Recentrer sur ma planète" title="Recentrer"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg></button>
          <button class="sm3-btn sm3-wide" aria-label="Vue d'ensemble" title="Vue d'ensemble"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/></svg></button>
        </div><div class="sm3-panel"></div>`;
      _root.querySelector('.sm3-home').onclick = () => { if (E.ready) E.moveTo(0, 0, homeDist(), 700); };
      _root.querySelector('.sm3-wide').onclick = () => { if (E.ready) E.moveTo(0, 0, Math.min(DIST_MAX, 520 + E.T.MathUtils.clamp(_state ? _state.lit : 5, 5, 14) * 120), 900); };
    }
    return true;
  }

  function loadFallback() {
    if (_fallback) return;
    _fallback = true;
    console.warn('[SpaceMap] 3D indisponible : carte SVG');
    if (_root) _root.innerHTML = '';
    const mp = document.querySelector('.smw-map'); if (mp) mp.classList.add('svg2d');
    const s = document.createElement('script');
    s.src = 'assets/spacemap2d.js?v=' + Date.now().toString(36);
    s.onload = () => { if (window.SBMap && window.SBMap !== API) window.SBMap.render(); };
    document.body.appendChild(s);
  }

  function render() {
    if (_fallback) return;
    if (!ensureDom()) return;
    if (E.ready) { refresh(true); return; }
    renderPanel(collect());
    if (!E.loading) {
      E.loading = E.init(_root.querySelector('.sm3-view')).then(() => {
        _sigStr = '';
        refresh(true);
        if (_pendingFocus) { const f = _pendingFocus; _pendingFocus = null; focusSel(f); }
      }).catch((e) => { console.warn('[SpaceMap]', e); loadFallback(); });
    }
  }

  let _pendingFocus = null;
  function focusSel(sel) {
    const st = _state || collect();
    _sel = sel; refresh(true);
    const i = selCell(st);
    // « Voir sur la carte » : on arrive au plus près, système ouvert, objet entouré
    if (i >= 0) E.moveTo(CELLS[i].x, CELLS[i].z, ['system', 'home', 'sig', 'target', 'planet'].includes(sel.kind) ? NEAR_DIST : Math.min(560, E.dist()), 900);
  }

  async function sweep(sysKey) {
    // 13/10 : un système marqué « sans intérêt » demande confirmation avant d'y renvoyer une Radar
    if ((G.systemTags || {})[sysKey] === 'skip' && typeof sbConfirmWarning === 'function') {
      const seen = G.mapSeen && G.mapSeen[sysKey] ? new Date(G.mapSeen[sysKey]).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' }) : null;
      const ok = await sbConfirmWarning('Système sans intérêt', `Tu as marqué ${esc(sysKey)} « sans intérêt »${seen ? ' (vu le ' + seen + ')' : ''}. Y renvoyer une Radar quand même ?`, 'Balayer quand même');
      if (!ok) return;
    }
    const m = launchProbe('radar', sysKey, 'local', false);
    if (!m) return;
    if (typeof saveGame === 'function') saveGame();
    _sel = { kind: 'system', key: sysKey };
    render();
    if (typeof renderProbesPane === 'function' && document.getElementById('probes-cards-list')) { try { renderProbesPane(); } catch (e) {} }
  }

  /* ─── Marques de systèmes (13/10) : intéressant / sans intérêt — gardées même sans rapport ─── */
  function tagChips(key) {
    const t = (G.systemTags || {})[key];
    const chip = (v, l, c) => `<button class="sm-tag${t === v ? ' on' : ''}" style="--c:${c}" onclick="event.stopPropagation();SBMap.tag('${esc(key)}','${v}')">${l}</button>`;
    return `<div class="sm-tags">${chip('star', 'Intéressant', '#ffc864')}${chip('skip', 'Sans intérêt', '#9aa6ae')}</div>`;
  }
  function tag(key, v) {
    if (!G.systemTags) G.systemTags = {};
    const was = G.systemTags[key];
    if (was === v) delete G.systemTags[key]; else G.systemTags[key] = v;
    if (!G.mapSeen) G.mapSeen = {};
    if (!G.mapSeen[key]) G.mapSeen[key] = Date.now();
    if (typeof saveGame === 'function') saveGame();
    if (G.systemTags[key] === 'skip' && typeof toast === 'function') toast('Système sans intérêt : ses rapports sont rangés aux archives');
    refresh(true);
    if (typeof renderProspectRapports === 'function' && document.getElementById('prospect-rapports-list')) { try { renderProspectRapports(); } catch (e) {} }
  }

  /* ─── Balises depuis la carte (13/10) ─── */
  const BEACON_COL = '#a370ff';
  function beaconAction(sysKey, sys) {
    if (!sysKey || typeof PROBE_TIER_CONFIG === 'undefined' || !PROBE_TIER_CONFIG.beacon) return '';
    const here = (G.probesPool || []).find(b => b.tier === 'beacon' && b.state === 'deployed' && String(b.deployedSystem || '').toUpperCase().startsWith(sysKey));
    if (here) {
      const n = here.detectionCount || 0;
      return routesBlock(here) + _sigBtn(BEACON_COL, 'Rappeler la balise', `SBMap.recallBeacon('${esc(here.id)}')`, `Balise en surveillance · ${n} détection${n > 1 ? 's' : ''}`, true);
    }
    const going = (G.probeMissions || []).find(m => m.tier === 'beacon' && m.status === 'in_transit' && String(m.targetCoords || '').startsWith(sysKey));
    if (going) return _sigOff(`Balise en route · arrivée dans ${formatTankerDuration(Math.max(0, (going.arrivalAt || 0) - Date.now()))}`);
    const deployed = (G.probesPool || []).filter(b => b.tier === 'beacon' && b.state === 'deployed').length;
    const quota = PROBE_TIER_CONFIG.beacon.quotaMax || 3;
    if (deployed >= quota) return _sigOff(`${quota} balises déjà posées`, 'Rappelle-en une pour la poser ici');
    const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus('beacon') : { ok: false, build: true, why: 'Aucune balise prête' };
    if (st.ok) return _sigBtn(BEACON_COL, 'Poser une balise', `SBMap.beacon('${esc(sysKey)}')`, 'Surveillance permanente des convois · 8 min de trajet', true);
    if (st.build) return _sigBtn(BEACON_COL, 'Construire une balise', `openProbeDetail('beacon')`, `${PROBE_TIER_CONFIG.beacon.cost.metal || 300} Métal · ${PROBE_TIER_CONFIG.beacon.cost.cristal || 100} Cristal`, true);
    return _sigOff(st.why);
  }
  function beacon(sysKey) {
    const m = launchProbe('beacon', sysKey, 'local', false);
    if (!m) return;
    if (typeof saveGame === 'function') saveGame();
    if (typeof toast === 'function') toast('Balise en route vers ' + sysKey);
    refresh(true);
  }
  async function recallBeaconFromMap(id) {
    // 14/10 (E3) — une balise qui balise une route de ligne : la rappeler la rend plus lente et plus exposée
    const bcn = myBeacons().find(b => b.id === id);
    const lr = (bcn && window.SBLines) ? SBLines.routesBalisedBy(beaconSys(bcn)) : [];
    if (lr.length && typeof sbConfirmWarning === 'function') {
      const sold = SBLines.salesOn ? SBLines.salesOn(beaconSys(bcn)) : [];
      const ok = await sbConfirmWarning(sold.length ? 'Trahir ton acheteur ?' : 'Retirer le balisage', `Cette balise balise ${lr.map(r => '<strong>' + esc(r.name) + '</strong>').join(', ')}. La rappeler rend la route plus lente et plus exposée, pour toi comme pour ceux qui l'empruntent. La route reste connue.`
        + (sold.length ? `<br><br><span style="color:#ff8a8a">Tu l'as vendue à ${sold.map(x => esc(x.buyer_pseudo || '?')).join(', ')} il y a moins de 7 jours : la rappeler, c'est trahir. Le port lui donne ta caution, et le comptoir en parlera.</span>` : ''), 'Rappeler quand même');
      if (!ok) return;
      if (typeof recallBeacon === 'function') recallBeacon(id, true);
      if (typeof saveGame === 'function') saveGame();
      return refresh(true);
    }
    // une balise qui porte des routes : rappeler la balise rompt ces routes (étape 3 : flottes orphelines, réputation)
    const used = (G.beaconRoutes || []).filter(r => r.a === id || r.b === id);
    if (used.length && typeof sbConfirmWarning === 'function') {
      const ok = await sbConfirmWarning('Rompre des routes', `Cette balise porte ${used.length} route${used.length > 1 ? 's' : ''} (${used.map(r => esc(r.name)).join(', ')}). La rappeler les rompra.`, 'Rappeler quand même');
      if (!ok) return;
    }
    if (typeof recallBeacon === 'function') recallBeacon(id);
    if (typeof saveGame === 'function') saveGame();
    refresh(true);
  }

  /* ─── Routes entre balises (étape 1, 13/10) : tracé, évitement, couleur ─── */
  const ROUTE_COLS = [['Ambre', '#ffc864'], ['Rose', '#ff8fb0'], ['Violet', '#b48cff'], ['Vert', '#6fdc9a'], ['Orange', '#ff9f5a'], ['Bleu', '#6fb0ff']];
  let _pickAvoid = null;
  const myBeacons = () => (G.probesPool || []).filter(b => b.tier === 'beacon' && b.state === 'deployed');
  const beaconSys = (b) => String((b && b.deployedSystem) || '').toUpperCase().split('-').slice(0, 3).join('-');
  const routeById = (id) => (G.beaconRoutes || []).find(r => r.id === id);
  // 14/10 (routes & pistes v1) : une route ne se dessine plus entre deux balises.
  // Depuis une balise : ouvrir un poste (ambassade miniature) — un tanker va là où ma balise est posée.
  function routesBlock(beacon) {
    if (!beacon) return '';
    const k = beaconSys(beacon);
    if (!k || k === mySystemKey()) return '';
    const mine = (G.tankerMissions || []).find(m => m.kind === 'route_post' && m.targetCoords === k && ['in_transit', 'posted'].includes(m.status));
    if (mine) return '';
    return _sigBtn('#ffc864', 'Ouvrir un poste ici', `SBMap.postHere('${esc(k)}')`, 'Un tanker en station : les commandants qui y tiennent un poste peuvent te parler', true);
  }
  function postHere(k) { if (typeof launchRoutePost === 'function') { launchRoutePost(null, k); refresh(true); } }
  // 15/10 (Adrien) — un tronçon relevé (flèche orange) : ce qui est passé, d'où, vers où ; s'il est en route en ce moment
  function legPanel(id) {
    const l = (G.spottedLegs || []).find(x => x.id === id);
    if (!l) return `<div class="sm-panel"><div class="sm-ptitle">Tronçon effacé</div><div class="sm-psub">Ce passage est trop ancien : il n'est plus sur la carte.</div></div>`;
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
    const inMin = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
    const net = window.SBLines ? SBLines.network() : null;
    const line = net && l.lineId ? net.byId[l.lineId] : null;
    const portKnown = line && G.hiddenPorts && G.hiddenPorts[line.port];
    const toPort = line && l.to === line.port;
    const toName = toPort && portKnown ? G.hiddenPorts[line.port].name : null;
    const who = l.npc ? (l.pseudo || (line ? line.kind.label : 'Convoi')) : (l.pseudo ? `Convoi de ${l.pseudo}` : 'Convoi au pavillon masqué');
    const rows = [];
    rows.push(`<div class="sm-lane"><b>${esc(l.from)} → ${esc(l.to)}${toName ? ' · ' + esc(toName) : ''}</b><span>vu ${ago(l.at || Date.now())}${l.cargo ? ' · cale ' + esc(l.cargo) : ''}${line ? ' · ' + esc(line.kind.escort) : ''}</span></div>`);
    // en ce moment : seulement si une de mes balises surveille le départ (elle le verrait passer)
    const watched = myBeacons().some(b => beaconSys(b) === l.from);
    let live = '';
    if (line && watched) {
      const i = line.chain.indexOf(l.from), n = line.chain.length, seg = line.travel / n, now = Date.now();
      if (i >= 0) {
        const ps = SBLines.passages(line, i, now - seg, now + line.period).filter(p => SBLines.capOf(line, i, p.dir) === l.to);
        const cur = ps.find(p => p.t <= now), nxt = ps.find(p => p.t > now);
        if (cur) live = `<div class="sm-lane" style="border-color:rgba(255,138,90,.55)"><b style="color:#ff9a6a">En route en ce moment</b><span>${esc(SBLines.convoyOf(line, cur.k, cur.dir).label)} · ${SBLines.convoyOf(line, cur.k, cur.dir).ships} vaisseaux · arrive en ${esc(l.to)} dans ${inMin(cur.t + seg - now)}</span></div>`;
        else if (nxt) live = `<div class="sm-lane"><b>Prochain passage vu par ta balise</b><span>en ${esc(l.from)} dans ${inMin(nxt.t - now)}, cap sur ${esc(l.to)}</span></div>`;
      }
    }
    // où mène la ligne
    let where;
    if (!line) where = `<div class="sm-lane"><b>${l.npc ? 'Ligne inconnue' : 'Route d\'un commandant'}</b><span>${l.onRoute ? 'Il suivait une route tracée.' : 'Cap relevé par ta balise.'} Pose une balise sur ${esc(l.to)} pour voir où il va ensuite.</span></div>`;
    else if (portKnown) where = `<div class="sm-lane port"><b>Ligne vers ${esc(G.hiddenPorts[line.port].name)}</b><span>${esc(line.port)} · lieu connu</span></div>`;
    else if (toPort) where = `<div class="sm-lane port"><b>Il entre dans un lieu caché</b><span>Le convoi a disparu en ${esc(l.to)} : il y a quelque chose là-bas.</span></div>`;
    else where = `<div class="sm-lane"><b>Ligne vers un lieu inconnu</b><span>Remonte-la : une balise en ${esc(l.to)} relèvera le cap suivant.</span></div>`;
    const acts = [];
    acts.push(_sigBtn('#ff9a6a', 'Voir ' + l.to, `SBMap.select('system','${esc(l.to)}')`, toName ? esc(toName) : 'où il allait', true));
    acts.push(_sigBtn('#ff9a6a', 'Voir ' + l.from, `SBMap.select('system','${esc(l.from)}')`, 'là où ta balise l\'a vu', true));
    if (!myBeacons().some(b => beaconSys(b) === l.to) && !portKnown) acts.push(beaconAction(l.to, null));
    const ro = window.SBLines && SBLines.routesOf ? SBLines.routesOf(l.from)[0] : null;
    if (ro) acts.push(_sigBtn(ro.color, 'Voir la route', `SBMap.selectRoute('${esc(ro.id)}')`, esc(ro.name), true));
    const rep = (G.beaconReports || []).find(r => r.line && r.line.id === l.lineId && String(r.systemCoord || '').startsWith(l.from));
    if (rep && SBLines.reportSheet) acts.push(_sigBtn('#ffc864', 'Le rapport de balise', `SBLines.reportSheet((G.beaconReports||[]).find(r=>r.id==='${esc(rep.id)}'))`, '', true));
    return `<div class="sm-panel"><div class="sm-ptitle" style="color:#ff9a6a">${live && live.includes('En route') ? 'Convoi en transit' : 'Cap relevé'} · ${esc(who)}</div><div class="sm-psub">Un convoi est passé par là : la flèche montre où il allait.</div><div class="sm-lanes">${live}${rows.join('')}${where}</div>${acts.join('')}</div>`;
  }
  // Lignes PNJ : couloir de passage, écho de l'antenne, convois observés, lieu caché
  function laneHtml(sysKey, li) {
    if (!li && !(window.SBLines && ((SBLines.ambushAt && SBLines.ambushAt(sysKey).length) || (SBLines.routesOf && SBLines.routesOf(sysKey).length)))) return '';
    const realLi = !!li;
    li = li || { obs: [], port: null, lane: false, echo: false, fromCard: null };
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
    const hasBeacon = myBeacons().some(b => beaconSys(b) === sysKey);
    const rows = [];
    const isCrown = !!(li.port && typeof stationUI === 'function' && stationUI(li.port.dockId));   // la Couronne, le Sanctuaire : leur fiche a sa propre en-tête
    if (li.port) {
      const r = li.route;
      if (!isCrown) rows.push(`<div class="sm-lane port"><b>Lieu caché</b><span>${r ? `Route connue : ${esc(r.name)}. Tes tankers peuvent s'y amarrer : dock, bar, marchés.` : 'Une ligne y mène.'}</span></div>`);
      const _nl = (id) => (typeof routeNextTankerLabel === 'function' ? routeNextTankerLabel(id) : 'Envoyer un tanker');
      const _nb = (id) => (typeof routeLiveMissions === 'function' ? routeLiveMissions(id).length : 0);
      if (r) rows.push(_sigBtn('#ffc864', _nl(r.id), `openTankerComposeForRoute('${esc(r.id)}')`, _nb(r.id) ? `${_nb(r.id)} tanker${_nb(r.id) > 1 ? 's' : ''} déjà sur cette route · il suit la ligne jusqu'au dock` : 'Il suit la ligne jusqu\'au dock', true) + _sigBtn('#ffc864', 'Voir la route', `SBMap.selectRoute('${esc(r.id)}')`, '', true));
    }
    if (li.fromCard && !li.obs.length && !li.port) rows.push(`<div class="sm-lane"><b>Piste de « ${esc(li.fromCard)} »</b><span>La carte mène ici. Pose une balise pour voir passer les convois et relever leur cap.</span></div>`);
    for (const o of li.obs) {
      rows.push(`<div class="sm-lane"><b>${esc(o.label)}</b><span>vu ${o.n} fois${o.periodMin ? ` · repasse toutes les ~${o.periodMin} min` : ''} · dernier ${ago(o.last)}</span></div>`);
    }
    // 15/10 — ce système est sur une de mes routes : laquelle, à quel jalon
    if (window.SBLines && SBLines.routesOf) for (const ro of SBLines.routesOf(sysKey)) {
      const where = ro.end ? 'arrivée' : ro.start ? 'départ' : `jalon ${ro.idx} sur ${ro.n}`;
      rows.push(`<button class="sm-it" style="--c:${ro.color};border:1px solid rgba(255,255,255,.08);border-radius:8px;margin:4px 0" onclick="event.stopPropagation();SBMap.selectRoute('${esc(ro.id)}')"><b>${ro.end ? '◆' : ro.start ? '◉' : ro.idx}</b><span style="color:${ro.color}">${esc(ro.name)}</span><i>${where} · voir la route →</i></button>`);
    }
    // 15/10 (E6) — mes flottes postées ici, leurs ordres ; ou l'idée d'en poster une
    if (window.SBLines && SBLines.ambushAt) {
      const fl = SBLines.ambushAt(sysKey);
      for (const f of fl) {
        const a = f.ambush, H = SBLines.holdAll(a), n = ['metal', 'energie', 'cristal'].reduce((x, k) => x + (H[k] || 0), 0);
        rows.push(`<div class="sm-lane" style="border-color:rgba(163,112,255,.45)"><b style="color:#c9a8ff">⚔ ${esc(f.name)} ${a.phase === 'going' ? 'arrive en embuscade' : 'en embuscade'}</b><span>${esc(SBLines.ordersLabel(f))}${n > 0 ? ' · ' + esc(_mpResLine(H)) + ' en cale' : ''}</span></div>`);
        rows.push(_sigBtn('#c9a8ff', 'Changer les ordres', `SBLines.setOrders('${esc(f.id)}')`, '', true) + _sigBtn('#c9a8ff', 'Voir la flotte', `openFleetDetail('${esc(f.id)}')`, '', true));
      }
      if (!fl.length && hasBeacon && li.obs.length && !li.port) rows.push(`<div class="sm-lane"><b>Une flotte ici ?</b><span>Postée en embuscade sur ta balise, elle aborderait ou filerait ces convois (Flotte → Embuscade).</span></div>`);
    }
    if (realLi && !li.obs.length && !li.port) {
      if (hasBeacon) rows.push(`<div class="sm-lane"><b>Couloir sous surveillance</b><span>Ta balise attend le prochain passage.</span></div>`);
      else if (li.echo && !li.fromCard) rows.push(`<div class="sm-lane"><b>Trafic capté par ton antenne</b><span>Pose une balise ici pour voir qui passe, et vers où.</span></div>`);
      else if (li.lane) rows.push(`<div class="sm-lane"><b>Couloir de passage</b><span>Du trafic régulier traverse ce système. Une balise ici verrait qui passe.</span></div>`);
    }
    return rows.length ? `<div class="sm-lanes">${rows.join('')}</div>` : '';
  }
  async function openRoute(fromId) {
    const from = myBeacons().find(b => b.id === fromId);
    if (!from) return;
    const st = _state || collect(), fc = st.cell['sys:' + beaconSys(from)];
    // 13/10 (Adrien) : pas de deuxième route par-dessus une route existante (même paire de systèmes, dans un sens ou dans l'autre)
    const fs = beaconSys(from);
    const pairKey = (x, y) => [x, y].sort().join('|');
    const linked = new Set((G.beaconRoutes || []).map(r => {
      const A = myBeacons().find(b => b.id === r.a), B = myBeacons().find(b => b.id === r.b);
      return A && B ? pairKey(beaconSys(A), beaconSys(B)) : null;
    }).filter(Boolean));
    const seenSys = new Set();
    const items = myBeacons().filter(b => {
      const bs = beaconSys(b);
      if (b.id === fromId || bs === fs || seenSys.has(bs) || linked.has(pairKey(fs, bs))) return false;
      seenSys.add(bs); return true;
    }).map(b => {
      const tc = st.cell['sys:' + beaconSys(b)];
      const d = (fc !== undefined && tc !== undefined) ? hexDist(CELLS[fc], CELLS[tc]) : null;
      return { b, label: beaconSys(b), sub: d != null ? `${d} case${d > 1 ? 's' : ''} en ligne droite` : '' };
    });
    if (!items.length) { if (typeof toast === 'function') toast('Toutes tes balises sont déjà reliées à celle-ci'); return; }
    const it = items.length === 1 ? items[0] : await _mpChoose('Route vers…', items);
    if (!it) return;
    const col = await _mpChoose('Couleur de la route', ROUTE_COLS.map(([n, c]) => ({ c, label: `<span style="color:${c}">━━</span>&nbsp; ${n}` })));
    if (!col) return;
    const r = { id: 'rt' + Date.now().toString(36), name: 'Route ' + ((G.beaconRoutes || []).length + 1), color: col.c, a: fromId, b: it.b.id, avoid: [], createdAt: Date.now() };
    G.beaconRoutes = (G.beaconRoutes || []).concat([r]);
    if (typeof saveGame === 'function') saveGame();
    selectRoute(r.id);
  }
  function selectRoute(id) {
    _sel = { kind: 'route', key: id };
    refresh(true);
    const rt = ((_state && _state.routes) || []).find(x => x.r.id === id);
    if (E.ready && rt && rt.path.length) {
      const pts = rt.path.map(i => CELLS[i]);
      const cx = pts.reduce((a, c) => a + c.x, 0) / pts.length, cz = pts.reduce((a, c) => a + c.z, 0) / pts.length;
      const span = Math.max(...pts.map(c => Math.hypot(c.x - cx, c.z - cz)));
      const d = Math.max(620, Math.min(DIST_MAX, span * 6.5 + 380));
      E.moveTo(cx, cz + d * 0.24, d * 1.1, 800);   // la fiche couvre le bas de l'écran : la route se lit au-dessus   // 15/10 : toute la route dans le cadre, au-dessus de la fiche
    }
  }
  function routeAvoid(id) { _pickAvoid = id; if (typeof toast === 'function') toast('Touche le système à éviter'); }
  function routeUnavoid(id, key) {
    const r = routeById(id); if (!r) return;
    r.avoid = (r.avoid || []).filter(k => k !== key);
    if (typeof saveGame === 'function') saveGame();
    refresh(true);
  }
  async function routeColor(id) {
    const r = routeById(id); if (!r) return;
    const col = await _mpChoose('Couleur de la route', ROUTE_COLS.map(([n, c]) => ({ c, label: `<span style="color:${c}">━━</span>&nbsp; ${n}` })));
    if (!col) return;
    r.color = col.c; if (typeof saveGame === 'function') saveGame(); refresh(true);
  }
  async function routeRename(id) {
    const r = routeById(id); if (!r || typeof sbPrompt !== 'function') return;
    const v = await sbPrompt({ title: 'Nom de la route', placeholder: r.name, defaultValue: r.name, maxLength: 28 });
    if (!v || !String(v).trim()) return;
    r.name = String(v).trim().slice(0, 28); if (typeof saveGame === 'function') saveGame(); refresh(true);
  }
  async function routeDelete(id) {
    const r = routeById(id); if (!r) return;
    const ok = typeof sbConfirmDanger === 'function' ? await sbConfirmDanger('Supprimer la route', `« ${esc(r.name)} » sera effacée. Tes balises restent en place.`, 'Supprimer') : true;
    if (!ok) return;
    G.beaconRoutes = (G.beaconRoutes || []).filter(x => x.id !== id);
    if (typeof saveGame === 'function') saveGame();
    _sel = null; refresh(true);
  }
  function routeCard(state, id) {
    const rt = (state.routes || []).find(x => x.r.id === id);
    if (!rt) return null;
    if (rt.line) return lineRouteCard(rt);
    if (rt.opened) return openedRouteCard(rt);
    const r = rt.r, n = Math.max(0, rt.path.length - 1);
    const sub = rt.broken
      ? `<span style="color:#ff8a8a">${(!rt.a || !rt.b) ? 'Rompue : une balise a été rappelée' : 'Tracé impossible : trop de systèmes évités'}</span>`
      : `<span class="mono">${esc(rt.a.key)} → ${esc(rt.b.key)}</span> · ${n} case${n > 1 ? 's' : ''}`;
    const av = (r.avoid || []).map(k => `<button class="sm-av" onclick="event.stopPropagation();SBMap.routeUnavoid('${esc(r.id)}','${esc(k)}')" title="Ne plus éviter">${esc(k.split('-').slice(1).join('-'))} ✕</button>`).join('');
    const tool = (l, fn) => `<button class="sm-tag" style="--c:${r.color}" onclick="event.stopPropagation();SBMap.${fn}('${esc(r.id)}')">${l}</button>`;
    return `<div class="sm-panel"><div class="sm-ptitle" style="color:${r.color}">${esc(r.name)}</div><div class="sm-psub">${sub}</div>`
      + (av ? `<div class="sm-avs"><span>Évite</span>${av}</div>` : '')
      + `<div class="sm-tags">${tool('Éviter un système', 'routeAvoid')}${tool('Couleur', 'routeColor')}</div>`
      + `<div class="sm-tags">${tool('Renommer', 'routeRename')}${tool('Supprimer', 'routeDelete')}</div>`
      + routeTravelHtml(rt, state)
      + `</div>`;
  }
  // 14/10 (E4) — ouvrir une route vers ce système : une Moyenne éclaireur trace le premier passage
  function scoutHtml(sysKey, sys) {
    if (!window.SBLines || sysKey === mySystemKey() || !(sys && sys.known)) return '';
    const o = SBLines.openedTo(sysKey);
    if (o) return _sigBtn(o.color || '#9fe08a', 'Voir la route ouverte', `SBMap.selectRoute('${esc(o.id)}')`, esc(o.name), true);
    const fl = SBLines.scoutInFlight(sysKey);
    if (fl) return _sigOff(`Moyenne en éclaireur · arrivée dans ${formatTankerDuration(Math.max(0, fl.arrivalAt - Date.now()))}`);
    const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus('medium') : { ok: false };
    const label = (sys.planets && sys.planets.find(p => p.playerName)) ? sys.planets.find(p => p.playerName).playerName : '';
    if (st.ok) return _sigBtn('#9fe08a', 'Ouvrir une route jusqu\'ici', `SBMap.scout('${esc(sysKey)}','${esc(label)}')`, 'Une Moyenne part en éclaireur et trace le passage · 2 à 4 h · elle peut se perdre', true);
    if (st.build) return _sigBtn('#9fe08a', 'Construire une Moyenne', `openProbeDetail('medium')`, 'Pour ouvrir une route jusqu\'ici', true);
    return _sigOff(st.why || 'Moyenne indisponible', 'Pour ouvrir une route jusqu\'ici');
  }
  function scout(sysKey, label) { if (window.SBLines) { SBLines.scoutLaunch(sysKey, label || null); refresh(true); } }
  // 15/10 (Adrien : « je ne sais pas où elle passe, ni comment l'emprunter ») — l'itinéraire d'une route, jalon par jalon :
  // départ, systèmes de passage numérotés comme sur la carte (balisé ou non, ce qu'on y a vu), arrivée et ce qu'on y connaît.
  function itineraryHtml(chain, o) {
    const mine = new Set(myBeacons().map(b => beaconSys(b)));
    const going = new Set((G.probeMissions || []).filter(m => m.tier === 'beacon' && m.status === 'in_transit').map(m => String(m.targetCoords || '').split('-').slice(0, 3).join('-')));
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
    const n = chain.length - 1;
    const rows = chain.map((k, i) => {
      const end = i === n, start = i === 0;
      let tag, what;
      if (start) { tag = '◉'; what = o.startLabel || 'départ'; }
      else if (end) { tag = '◆'; what = o.endLabel || 'arrivée'; }
      else {
        tag = String(i);
        const li = window.SBLines ? SBLines.infoFor(k) : null;
        const seen = li && li.obs && li.obs.length ? li.obs.reduce((m, x) => Math.max(m, x.last || 0), 0) : 0;
        what = (mine.has(k) ? '<em class="on">✓ balisé</em>' : going.has(k) ? '<em>balise en route</em>' : '<em class="off">non balisé</em>') + (seen ? ` · convoi vu ${ago(seen)}` : '');
      }
      return `<button class="sm-it${start ? ' s' : end ? ' e' : ''}" style="--c:${o.color}" onclick="event.stopPropagation();SBMap.select('system','${esc(k)}')"><b>${tag}</b><span class="mono">${esc(k)}</span><i>${what}</i></button>`;
    }).join('');
    return `<div class="sm-itin"><div class="h">Itinéraire · ${Math.max(0, n - 1)} système${n - 1 > 1 ? 's' : ''} de passage</div>${rows}</div>`;
  }
  // une flotte sur la route : embuscade sur un de ses jalons balisés (l'ordre est choisi ensuite)
  async function fleetOnRoute(id) {
    const ch = routeChainOf(id);
    if (!ch) return;
    const fleets = (G.fleet && G.fleet.prepared || []).filter(f => (f.status || 'prepared') === 'deployed' && ['fregate', 'cuirasse'].some(t => ['t1', 't2', 't3'].some(x => (f.composition[t] && f.composition[t][x]) > 0)));
    if (!fleets.length) { toast('Aucune flotte armée en orbite : prépare-en une (Flotte)'); return; }
    const f = fleets.length === 1 ? { f: fleets[0] } : await _mpChoose('Quelle flotte poster sur la route ?', fleets.map(f => ({ f, label: esc(f.name), sub: 'en orbite' })));
    if (!f) return;
    if (typeof mpAmbushStart === 'function') mpAmbushStart(f.f.id, ch);
  }
  function routeChainOf(id) {
    const o = window.SBLines && SBLines.openedRoutes().find(x => x.id === id);
    if (o) return o.chain.slice(1, -1).concat([o.to]);
    const r = (G.routes || []).find(x => x.id === id);
    return r && r.portSys && window.SBLines ? SBLines.knownChain(r.portSys).slice(0, -1) : null;
  }
  function fleetBtn(id, chain) {
    const mine = new Set(myBeacons().map(b => beaconSys(b)));
    const on = chain.filter(k => mine.has(k)).length;
    const posted = (G.fleet && G.fleet.prepared || []).filter(f => f.ambush && chain.includes(f.ambush.system) && f.ambush.phase !== 'returning');
    if (posted.length) return _sigBtn('#c9a8ff', `${esc(posted[0].name)} en embuscade · ${esc(posted[0].ambush.system)}`, `openFleetDetail('${esc(posted[0].id)}')`, window.SBLines && SBLines.ordersLabel ? esc(SBLines.ordersLabel(posted[0])) : '', true);
    return on ? _sigBtn('#c9a8ff', 'Poster une flotte sur la route', `SBMap.fleetOnRoute('${esc(id)}')`, `Embuscade sur un jalon balisé · elle y arrive plus vite par la route`, true)
      : _sigOff('Poster une flotte sur la route', 'Il faut d\'abord une balise sur un de ses jalons');
  }
  function openedRouteCard(rt) {
    const o = SBLines.openedRoutes().find(x => x.id === rt.routeId);
    if (!o) return '';
    const n = Math.max(0, o.chain.length - 2);
    const bal = SBLines.balisageChain(o.chain.slice(1, -1));
    const pct = Math.round(bal.ratio * 100);
    const st = _state || collect();
    const toSys = st.systems[o.to];
    const pls = (toSys && toSys.planets) || [];
    const endLabel = pls.length ? esc(pls[0].playerName || pls[0].customName || pls[0].name || 'planète') + (pls.length > 1 ? ` (+${pls.length - 1})` : '') : (o.toLabel ? esc(o.toLabel) : 'rien de connu au bout');
    const from = o.chain[0] === mySystemKey() ? 'ta planète' : (o.by ? 'système de ' + esc(o.by) : 'départ');
    const sends = pls.slice(0, 2).map(pl => _sigBtn(o.color, 'Envoyer un tanker · ' + esc(pl.playerName || pl.customName || pl.name || pl.coord), `SBMap.sendOnOpened('${esc(o.id)}','${esc(pl.coord)}')`, 'Il suit cette route jusqu\'au bout', true)).join('');
    const noEnd = pls.length ? '' : `<div class="sm-lane"><b>Au bout : rien de connu</b><span>Ta Moyenne a tracé le passage jusqu'à ${esc(o.to)}, sans y repérer de planète. Balaye le système : dès qu'une planète y est connue, tes tankers peuvent l'atteindre par cette route.</span></div>`
      + _sigBtn(COL.cyan, 'Explorer la destination', `SBMap.select('system','${esc(o.to)}')`, esc(o.to), true);
    return `<div class="sm-panel"><div class="sm-ptitle" style="color:${o.color}">${esc(o.name)}</div>`
      + `<div class="sm-psub">${o.by ? `Offerte par ${esc(o.by)}` : 'Ouverte par ta Moyenne'} · ${pct ? `balisée à ${pct} % : plus rapide, plus sûre` : 'non balisée'}</div>`
      + itineraryHtml(o.chain, { color: o.color, startLabel: from, endLabel })
      + `<div class="sm-use">À quoi elle sert : tes tankers et tes flottes qui vont vers ces systèmes la suivent, plus vite et à l'abri des regards — seuls ceux qui la connaissent l'empruntent. Balise ses jalons pour la rendre plus sûre.</div>`
      + sends + noEnd
      + (bal.next ? _sigBtn('#b48cff', `Baliser le jalon ${o.chain.indexOf(bal.next)}`, `SBMap.beacon('${esc(bal.next)}')`, esc(bal.next) + ' · plus rapide, plus sûre', true) : '')
      + fleetBtn(o.id, o.chain.slice(1))
      + (o.by ? '' : _sigBtn('#ffb3e0', 'Donner à un allié', `SBMap.giveOpened('${esc(o.id)}')`, 'Seuls ceux à qui tu la donnes sauront y aller', true))
      + `<div class="sm-tags"><button class="sm-tag" onclick="event.stopPropagation();SBMap.forgetOpened('${esc(o.id)}')">Oublier la route</button></div>`
      + `</div>`;
  }
  function sendOnOpened(id, coord) {
    if (typeof openTankerCompose !== 'function') return;
    G._composeRoutePref = id;
    openTankerCompose(coord);
  }
  async function giveOpened(id) {
    const seen = new Set(), items = [];
    for (const sys of Object.values(G.knownSystems || {})) for (const p of sys.planets || []) {
      const addr = p.mpAddress || p.coord;
      if (!p.isReal || !p.playerName || seen.has(addr)) continue;
      seen.add(addr); items.push({ addr, label: esc(p.playerName), sub: esc(addr) });
    }
    if (!items.length) { toast('Aucun commandant dans ton carnet'); return; }
    const it = await _mpChoose('Donner la route à…', items);
    if (!it) return;
    try { await SBLines.giveRoute(id, it.addr); toast(`Route offerte à ${it.label} : elle la recevra à sa prochaine connexion`); }
    catch (e) { toast(/gift_rate/.test(String(e.message)) ? 'Trop de dons aujourd\'hui' : 'Le registre ne répond pas, réessaie'); }
  }
  async function forgetOpened(id) {
    const ok = typeof sbConfirm === 'function' ? await sbConfirm({ title: 'Oublier la route ?', body: 'Elle disparaît de ta carte. Ceux à qui tu l\'as donnée la gardent.', confirmLabel: 'Oublier', cancelLabel: 'Garder' }) : true;
    if (!ok) return;
    SBLines.forgetOpened(id); _sel = null; refresh(true);
  }
  // 14/10 (E2) — route d'une ligne remontée jusqu'à un lieu caché
  function lineRouteCard(rt) {
    const r = (G.routes || []).find(x => x.id === rt.routeId);
    if (!r) return '';
    const busy = (G.tankerMissions || []).filter(m => m.routeId === r.id && ['in_transit', 'docked', 'returning'].includes(m.status)).length;
    const n = Math.max(0, rt.path.length - 1);
    // 14/10 (E3) — balisage : mes balises sur les jalons connus
    const bal = window.SBLines ? SBLines.balisage(r.portSys) : null;
    let balHtml = '';
    if (bal && bal.chain.length) {
      const pct = Math.round(bal.ratio * 100);
      const dots = bal.chain.map(k => `<i class="${bal.beaconed.includes(k) ? 'on' : ''}" title="${esc(k)}"></i>`).join('');
      balHtml = `<div class="sm-bal"><div class="h"><b>Balisage</b><span>${bal.beaconed.length}/${bal.chain.length} jalons</span></div><div class="d">${dots}</div>`
        + `<div class="t">${pct ? `Trajet −${Math.round(35 * bal.ratio)} % · risque −${Math.round(60 * bal.ratio)} %${bal.cover ? ' · voie balisée : pavillon masqué aux balises des autres' : ''}${bal.seller ? ` · balisage entretenu par ${esc(bal.seller === true ? 'le vendeur' : bal.seller)} (7 jours après la vente)` : ''}` : 'Non balisée : trajet nominal, exposée'}</div></div>`;
      if (bal.next) balHtml += _sigBtn('#b48cff', 'Baliser le jalon suivant', `SBMap.beacon('${esc(bal.next)}')`, `${esc(bal.next)} · plus rapide, plus sûre, et tu vois qui l'emprunte`, true);
      else if (bal.pending) balHtml += _sigOff(`${bal.pending} balise${bal.pending > 1 ? 's' : ''} en route`);
    }
    const users = ((G.lineUsers || {})[r.portSys] || []).slice(0, 4);
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
    const usersHtml = users.length ? `<div class="sm-users"><b>Vus sur la ligne</b>${users.map(u => `<span>${esc(u.pseudo || 'pavillon masqué')} · ${esc(u.sys)} · ${ago(u.at)}</span>`).join('')}</div>` : '';
    return `<div class="sm-panel"><div class="sm-ptitle" style="color:#ffc864">${esc(r.name)}</div>`
      + `<div class="sm-psub">Vers ${esc((r.dock && r.dock.name) || 'un lieu caché')} · ${n} tronçon${n > 1 ? 's' : ''} connu${n > 1 ? 's' : ''}</div>`
      + itineraryHtml(SBLines.knownChain(r.portSys), { color: '#ffc864', startLabel: 'début connu de la ligne', endLabel: esc((r.dock && r.dock.name) || 'lieu caché') })
      + balHtml + usersHtml
      + _sigBtn('#ffc864', typeof routeNextTankerLabel === 'function' ? routeNextTankerLabel(r.id) : 'Envoyer un tanker', `openTankerComposeForRoute('${esc(r.id)}')`, busy ? `${busy} tanker${busy > 1 ? 's' : ''} sur cette route` : 'Il suit la ligne jusqu\'au dock · les balises posées dessus le voient passer', true)
      + fleetBtn(r.id, SBLines.knownChain(r.portSys).slice(0, -1))
      + _sigBtn(COL.cyan, 'Voir le lieu', `SBMap.select('system','${esc(r.portSys)}')`, '', true)
      + `</div>`;
  }
  // 13/10 — emprunter la route : un tanker part vers un monde connu au bout de la route
  function routeTravelHtml(rt, state) {
    if (rt.broken) return _sigOff('Route rompue', 'Repose la balise pour la rouvrir aux tankers');
    const ends = [rt.a.key, rt.b.key];
    const worlds = [];
    for (const k of ends) for (const it of (state.items[k] || [])) if (it.kind === 'planet') worlds.push(it.obj);
    const busy = (G.tankerMissions || []).filter(m => m.ownRouteId === rt.r.id && (m.status === 'in_transit' || m.status === 'returning')).length;
    const note = busy ? `${busy} tanker${busy > 1 ? 's' : ''} sur la route` : 'Sans incident de voie directe · seules les balises du tracé voient passer';
    const send = worlds.slice(0, 2).map(p => _sigBtn(rt.r.color, 'Envoyer un tanker · ' + esc(p.playerName || p.customName || p.name || p.coord),
      `SBMap.sendOnRoute('${esc(rt.r.id)}','${esc(p.coord)}')`, note, true)).join('');
    // 13/10 (Adrien) — poste de route : un tanker en station à un bout = une ambassade miniature
    const home = mySystemKey();
    const posts = ends.filter(k => k !== home).map(k => {
      const mine = (G.tankerMissions || []).find(m => m.kind === 'route_post' && m.targetCoords === k && ['in_transit', 'posted'].includes(m.status));
      if (mine) return _sigOff(`Poste à ${esc(k)} · ${mine.status === 'posted' ? esc(mine.tankerName) + ' en station' : 'en route'}`);
      return _sigBtn('#ffc864', 'Ouvrir un poste · ' + esc(k), `SBMap.postOnRoute('${esc(rt.r.id)}','${esc(k)}')`, 'Un tanker en station : les commandants qui y tiennent un poste peuvent te parler', true);
    }).join('');
    return send + posts;
  }
  function postOnRoute(rid, sysKey) { if (typeof launchRoutePost === 'function') { launchRoutePost(rid, sysKey); refresh(true); } }
  function postsHtml(sysKey) {
    const st = _state || collect(), s = st.systems[sysKey];
    if (!s || (!(s.posts || []).length && !(s.others || []).length)) return '';
    const since = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`; };
    const rows = (s.posts || []).map(m => `<div class="sm-post"><i class="me"></i><span><b>Ton poste</b> · ${esc(m.tankerName)} en station depuis ${since(m.postedAt || m.arrivalAt)}</span><button onclick="event.stopPropagation();recallRoutePost('${esc(m.id)}')">Rappeler</button></div>`)
      .concat((s.others || []).map(o => `<div class="sm-post"><i></i><span><b>${esc(o.pseudo)}</b> tient un poste ici${o.met ? '' : ' · ouvre le tien pour lui parler'}</span>${o.met ? `<button onclick="event.stopPropagation();openEmbassy('${esc(o.address)}')">Ambassade</button>` : ''}</div>`));
    return `<div class="sm-posts">${rows.join('')}</div>`;
  }
  function sendOnRoute(rid, coord) {
    if (typeof openTankerCompose !== 'function') return;
    G._composeRoutePref = rid;          // la fiche du tanker présélectionne cette route
    openTankerCompose(coord);
  }
  // Tronçons repérés depuis / vers ce système
  function spottedHtml(sysKey) {
    const st = _state || collect();
    const legs = (st.spotted || []).filter(sp => sp.l.from === sysKey || sp.l.to === sysKey);
    if (!legs.length) return '';
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
    // un système voisin = une ligne : « cap relevé », « venu de », ou « dans les deux sens »
    const by = new Map();
    for (const sp of legs) {
      const out = sp.l.from === sysKey, other = out ? sp.l.to : sp.l.from;
      const e = by.get(other) || { other, out: false, inn: false, at: 0, who: sp.l.pseudo };
      if (out) { e.out = true; if (sp.l.cargo) e.cargo = sp.l.cargo; } else e.inn = true;
      if (sp.l.at > e.at) { e.at = sp.l.at; e.who = sp.l.pseudo; }
      by.set(other, e);
    }
    return `<div class="sm-spot">` + [...by.values()].sort((a, b) => b.at - a.at).slice(0, 4).map(e =>
      `<button onclick="event.stopPropagation();SBMap.select('system','${esc(e.other)}')"><span class="k">${e.out && e.inn ? 'Dans les deux sens' : e.out ? 'Cap relevé' : 'Venu de'}</span><span class="mono">${esc(e.other)}</span><span class="w">${esc(e.who || 'pavillon masqué')}${e.cargo ? ` · cales ${e.cargo === 'lourd' ? 'lourdes' : e.cargo === 'léger' ? 'légères' : 'moyennes'} vers ce système` : ''} · ${ago(e.at)}</span></button>`
    ).join('') + `</div>`;
  }
  function routeSummary(rt) {
    if (!window.SBLines) return (rt.path.length - 1) + ' cases';
    const o = rt.opened ? SBLines.openedRoutes().find(x => x.id === rt.routeId) : null;
    const r = rt.line ? (G.routes || []).find(x => x.id === rt.routeId) : null;
    const mids = o ? o.chain.slice(1, -1) : r ? SBLines.knownChain(r.portSys).slice(0, -1) : [];
    const pct = Math.round((o ? SBLines.balisageChain(mids) : r ? SBLines.balisage(r.portSys) : { ratio: 0 }).ratio * 100);
    return `${mids.length} jalon${mids.length > 1 ? 's' : ''} · ${pct ? 'balisée ' + pct + ' %' : 'non balisée'}`;
  }
  function routesSheetHtml() {
    const st = _state || collect();
    const rs = st.routes || [];
    if (!rs.length) return '';
    return `<div class="smw-fl-h">Mes routes · ${rs.length}</div>` + rs.map(rt => `<button class="smw-fl" onclick="SBMap.showRoute('${esc(rt.r.id)}')">
        <span class="t" style="color:${rt.r.color}">${esc(rt.r.name)}</span>
        <span class="g">${rt.a ? esc(rt.a.key) : '—'} → ${rt.b ? esc(rt.b.key) : '—'}</span>
        <span class="e">${rt.broken ? 'rompue' : routeSummary(rt)}</span></button>`).join('');
  }
  function showRoute(id) { W.closeSheet(); selectRoute(id); }

  // 15/10 — dans la feuille Sondes, un renvoi vers les missions en cours (les vols n'y sont plus listés)
  function missionsLinkHtml() {
    const n = window.SBMissions ? SBMissions.count() : 0;
    const p = (G.probeMissions || []).filter(m => m.status === 'in_transit').length;
    if (!n) return '';
    return `<button class="smw-fl" onclick="setProspectTab('missions')"><span class="t" style="color:#ffc864">Missions en cours · ${n}</span><span class="g">${p ? p + ' sonde' + (p > 1 ? 's' : '') + ' en vol' : 'tankers, flottes'}</span><span class="e">voir →</span></button>`;
  }
  /* ─── « En vol » dans la feuille Sondes : chaque sonde mène à sa cible sur la carte ─── */
  function flightsHtml() {
    const now = Date.now();
    const list = (G.probeMissions || []).filter(m => m.status === 'in_transit').sort((a, b) => a.arrivalAt - b.arrivalAt);
    if (!list.length) return '';
    const rows = list.map(m => {
      const cfg = PROBE_TIER_CONFIG[m.tier] || { label: m.tier, accent: '#9fb3bf' };
      const tgt = String(m.targetCoords || '—');
      return `<button class="smw-fl" onclick="SBMap.showFlight('${esc(m.id)}')">
        <span class="t" style="color:${cfg.accent || '#9fb3bf'}">${esc(cfg.label)}</span>
        <span class="g">${esc(tgt)}</span>
        <span class="e">${esc(formatTankerDuration(Math.max(0, (m.arrivalAt || 0) - now)))}</span></button>`;
    }).join('');
    return `<div class="smw-fl-h">En vol · ${list.length}</div>${rows}`;
  }
  function showFlight(id) {
    const m = (G.probeMissions || []).find(x => x.id === id);
    if (!m) return;
    W.closeSheet();
    const sel = (typeof mapSelectionFor === 'function') ? mapSelectionFor(m.targetCoords) : null;
    if (sel) { if (E.ready) focusSel(sel); else { _sel = sel; render(); } }
    else { _sel = { kind: 'flight', key: id }; refresh(true); }
  }

  /* ═══════════════════ Écran plein : « monde d'abord », comme la planète ═══════════════════
     Demande d'Adrien (10/10, nuit) : la carte prend tout l'écran du Centre de prospection ;
     tout le reste s'ouvre PAR-DESSUS, exactement comme sur la planète (home.js) :
       · HUD haut : nom du lieu + état en une ligne, croix pour revenir
       · fiche d'action flottante en bas quand on touche une case (comme la fiche de parcelle)
       · raccourcis bas : Sondes (hangar) · Rapports · Carnet · Archives → feuilles par-dessus la carte
     L'illustration, les onglets et le bouton Retour disparaissent. Les panneaux existants
     (#prospect-pane-*) sont déplacés tels quels dans la feuille : leur code de rendu ne change pas. */
  const ICO = {
    sondes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 12H3.5M20.5 12H15M3.5 9v6M20.5 9v6M12 9V5.5M10.5 4h3"/></svg>',
    rapports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.8h8.5L19 7.3v13.9H6z"/><path d="M14.5 2.8v4.5H19M9 11.5h7M9 15h7M9 18.4h4.5"/></svg>',
    carnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-12z"/><path d="M8.5 3.5v17M11.5 8h4M11.5 11.5h4"/></svg>',
    missions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.5l6-3 4 2 8-6"/><path d="M17 10.5h4v4"/><circle cx="4.5" cy="6.5" r="1.6"/><circle cx="12" cy="5" r="1"/></svg>',
    archives: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M4.5 8.5v11h15v-11M9.5 12.5h5"/></svg>',
    center: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
    wide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/></svg>',
  };
  const SHEETS = { sondes: 'Hangar des sondes', missions: 'Missions en cours', rapports: 'Rapports', carnet: 'Carnet', archives: 'Archives du vide' };

  const W = {
    on: false, tab: null,

    mount() {
      if (this.on) return;
      const scr = document.getElementById('scr-prospect');
      const root = document.getElementById('spacemap-root');
      if (!scr || !root) return;
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;   // sans WebGL : ancienne mise en page
      this.on = true; this.scr = scr;
      scr.classList.add('sm-world');

      // La carte : tout l'écran, sous le reste
      const map = document.createElement('div'); map.className = 'smw-map';
      scr.appendChild(map); map.appendChild(root); _root = root;

      // HUD haut
      const top = document.createElement('div'); top.className = 'smw-top';
      top.innerHTML = `<div class="smw-title">CENTRE DE PROSPECTION</div><div class="smw-meta" id="smw-meta"></div>`;
      scr.appendChild(top);
      // Ligne d'état de l'ancienne bannière (sondes prêtes, en mission, adresse, météo cosmique) : déplacée telle quelle,
      // renderProspectScreen() continue de la tenir à jour
      const sub = document.getElementById('prospect-banner-sub'); if (sub) { sub.classList.add('smw-sub'); top.appendChild(sub); }
      // Indication discrète pour un nouveau joueur, quand rien n'est sélectionné (remplace « Touche un objet, ou le noir pour balayer »)
      const hint = this.hint = document.createElement('div'); hint.className = 'smw-hint'; hint.textContent = 'Touche un système pour l’ouvrir';
      scr.appendChild(hint);
      // la croix de retour est celle de tous les écrans détaillés (home.js : .w-screen-x → planète)
      const tools = document.createElement('div'); tools.className = 'smw-tools';
      tools.innerHTML = `<button data-a="center" aria-label="Recentrer sur ma planète">${ICO.center}</button><button data-a="wide" aria-label="Vue d'ensemble">${ICO.wide}</button>`;
      tools.querySelector('[data-a="center"]').onclick = () => { if (E.ready) E.moveTo(0, 0, homeDist(), 700); };
      tools.querySelector('[data-a="wide"]').onclick = () => { if (E.ready) E.moveTo(0, 0, Math.min(DIST_MAX, 520 + Math.max(5, (_state ? _state.lit : 5)) * 120), 900); };
      scr.appendChild(tools);

      // Fiche d'action flottante (comme la fiche de parcelle de la planète)
      const card = this.card = document.createElement('div'); card.className = 'smw-card';
      card.innerHTML = '<button class="smw-cx" aria-label="Fermer">×</button><div class="smw-card-in"></div>';
      card.querySelector('.smw-cx').onclick = () => API.clear();
      scr.appendChild(card);

      // Raccourcis bas — les badges existants (rapports, archives) sont déplacés dedans, le jeu continue de les tenir à jour
      const nav = document.createElement('nav'); nav.className = 'smw-nav';
      // 15/10 (Adrien) — « Missions » : tout ce qui vole (tankers, flottes, sondes), avec son badge
      nav.innerHTML = ['sondes', 'missions', 'rapports', 'carnet', 'archives'].map((k) =>
        `<button data-t="${k}">${ICO[k]}<span>${{ sondes: 'Sondes', missions: 'Missions', rapports: 'Rapports', carnet: 'Carnet', archives: 'Archives' }[k]}</span>${k === 'missions' ? '<i class="smw-mb" id="smw-missions-badge"></i>' : ''}</button>`).join('');
      scr.appendChild(nav);
      nav.querySelectorAll('button').forEach((b) => { b.onclick = () => window.setProspectTab(b.dataset.t); });
      const rb = document.getElementById('prospect-tab-rapports-badge'); if (rb) nav.querySelector('[data-t="rapports"]').appendChild(rb);
      const ab = document.getElementById('prospect-tab-archives-badge'); if (ab) nav.querySelector('[data-t="archives"]').appendChild(ab);
      const aBtn = document.getElementById('prospect-tab-archives'), myA = nav.querySelector('[data-t="archives"]');
      const syncA = () => { myA.style.display = (aBtn && aBtn.style.display === 'none') ? 'none' : ''; };
      if (aBtn) new MutationObserver(syncA).observe(aBtn, { attributes: true, attributeFilter: ['style'] });
      syncA();
      this.nav = nav;

      // Feuille par-dessus la carte : on y déplace les panneaux existants
      const sheet = this.sheet = document.createElement('div'); sheet.className = 'smw-sheet';
      sheet.innerHTML = '<div class="smw-sheet-in"><header><span class="smw-sh-t"></span><button class="smw-sh-x" aria-label="Fermer">×</button></header><div class="smw-sh-body"></div></div>';
      sheet.addEventListener('click', (e) => { if (e.target === sheet) this.closeSheet(); });
      sheet.querySelector('.smw-sh-x').onclick = () => this.closeSheet();
      const body = sheet.querySelector('.smw-sh-body');
      for (const id of ['prospect-pane-sondes', 'prospect-pane-univers', 'prospect-pane-rapports', 'prospect-pane-archives']) {
        const el = document.getElementById(id); if (el) body.appendChild(el);
      }
      scr.appendChild(sheet);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !scr.classList.contains('hidden')) { if (this.tab) this.closeSheet(); else API.clear(); } });

      // Onglets → feuilles. « univers » (la carte) = refermer la feuille.
      const origTab = window.setProspectTab;
      if (typeof origTab === 'function' && !origTab._smw) {
        const self = this;
        window.setProspectTab = function (tab) {
          if (tab === 'sonder' || tab === 'sonde') tab = 'sondes';
          // pendant un rafraîchissement de l'écran, garder le carnet ouvert
          if (tab === 'univers' && self._keepCarnet) tab = 'carnet';
          // 15/10 : un rafraîchissement de l'écran ne referme pas la feuille Missions
          if (tab === 'univers' && self._keepMissions) { origTab.call(this, 'univers'); return; }
          if (tab === 'carnet') { origTab.call(this, 'univers'); G.prospectTab = 'carnet'; self.openSheet('carnet'); return; }
          if (tab === 'missions') { origTab.call(this, 'univers'); G.prospectTab = 'univers'; self.openSheet('missions'); return; }
          origTab.call(this, tab);
          if (G.prospectTab === 'univers') self.closeSheet(true); else self.openSheet(G.prospectTab);
        };
        window.setProspectTab._smw = true;
      }
      const origRender = window.renderProspectScreen;
      if (typeof origRender === 'function' && !origRender._smw) {
        const self = this;
        window.renderProspectScreen = function () {
          self._keepCarnet = G.prospectTab === 'carnet';
          self._keepMissions = self.tab === 'missions';
          try { return origRender.apply(this, arguments); } finally { self._keepCarnet = false; self._keepMissions = false; }
        };
        window.renderProspectScreen._smw = true;
      }
      const origCarnet = window.openCarnetAddresses;
      if (typeof origCarnet === 'function' && !origCarnet._smw) {
        window.openCarnetAddresses = function () { const r = origCarnet.apply(this, arguments); setTimeout(() => window.setProspectTab('carnet'), 20); return r; };
        window.openCarnetAddresses._smw = true;
      }

      // La carte vit dès que l'écran est visible (quel que soit l'onglet) ; en sortant, on revient à la carte
      new MutationObserver(() => {
        if (!scr.classList.contains('hidden')) render();
        else if (this.tab) { this.closeSheet(); }
      }).observe(scr, { attributes: true, attributeFilter: ['class'] });
    },

    openSheet(tab) {
      if (!this.sheet) return;
      this.tab = tab;
      this.sheet.querySelector('.smw-sh-t').textContent = SHEETS[tab] || '';
      // feuille Sondes : les sondes en vol d'abord, chacune mène à sa cible sur la carte
      let fl = this.sheet.querySelector('.smw-flights');
      if (!fl) { fl = document.createElement('div'); fl.className = 'smw-flights'; this.sheet.querySelector('.smw-sh-body').prepend(fl); }
      // 15/10 : les vols vont dans « Missions », « Mes routes » dans le Carnet
      fl.innerHTML = tab === 'sondes' ? missionsLinkHtml() : tab === 'carnet' ? routesSheetHtml() : tab === 'missions' && window.SBMissions ? SBMissions.sheetHtml() : '';
      this.sheet.classList.toggle('smw-only', tab === 'missions');
      clearInterval(this._mt);
      if (tab === 'missions') this._mt = setInterval(() => { if (this.tab === 'missions' && window.SBMissions) fl.innerHTML = SBMissions.sheetHtml(); else clearInterval(this._mt); }, 1000);
      this.nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      this.sheet.classList.add('on');
    },
    closeSheet(fromTab) {
      if (!this.sheet) return;
      this.tab = null; clearInterval(this._mt);
      this.sheet.classList.remove('on');
      this.nav.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      if (!fromTab && typeof G !== 'undefined') G.prospectTab = 'univers';
    },

    renderCard(st) {
      const mb = document.getElementById('smw-missions-badge');
      if (mb && window.SBMissions) { const n = SBMissions.count(); mb.textContent = n || ''; mb.style.display = n ? '' : 'none'; }
      const meta = document.getElementById('smw-meta');
      if (meta) {
        const sysN = Object.values(st.systems).filter(s => s.known && s.key !== mySystemKey()).length;
        const sigN = Object.values(G.signatures || {}).filter(s => !s.resolved && !s.ignored).length;
        const bits = [`${sysN} système${sysN > 1 ? 's' : ''}`];
        if (sigN) bits.push(`${sigN} signature${sigN > 1 ? 's' : ''}`);
        meta.innerHTML = bits.join(' · ');
      }
      const inn = this.card && this.card.querySelector('.smw-card-in');
      if (!inn) return;
      if (this.hint) this.hint.classList.toggle('on', !_sel);
      if (!_sel) { this.card.classList.remove('on'); return; }
      const h = panelMarkup(st);
      if (inn.innerHTML !== h) inn.innerHTML = h;
      this.card.classList.add('on');
    },
  };

  function injectWorldCss() {
    if (document.getElementById('smw-style')) return;
    const st = document.createElement('style');
    st.id = 'smw-style';
    st.textContent = `
      /* un écran caché (opacité 0) ne doit jamais intercepter un toucher — ex. la croix de l'orbite par-dessus la nôtre */
      .screen.hidden, .screen.hidden *{pointer-events:none !important}
      #scr-prospect.sm-world{background:#03070b}
      #scr-prospect.sm-world > .stars,#scr-prospect.sm-world > .glow,#scr-prospect.sm-world > footer.actions,
      #scr-prospect.sm-world .screen-scroll > .head,#scr-prospect.sm-world #prospect-banner,#scr-prospect.sm-world #prospect-tabs{display:none !important}
      #scr-prospect.sm-world > .screen-scroll{display:none}
      .smw-map{position:absolute;inset:0;z-index:1}
      .smw-map #spacemap-root{position:absolute;inset:0;padding:0}
      .smw-map .sm3-wrap{position:absolute;inset:0;height:auto;border:0;border-radius:0;box-shadow:none}
      .smw-map .sm3-btn,.smw-map .sm3-panel{display:none}
      .smw-top{position:absolute;left:0;right:0;top:0;z-index:20;padding:calc(var(--sai,0px) + 14px) 64px 22px;text-align:center;pointer-events:none;background:linear-gradient(to bottom,rgba(3,6,10,.8),rgba(3,6,10,0))}
      .smw-title{font:600 10.5px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:.28em;color:#d6e4ee}
      .smw-meta{margin-top:5px;font:500 10px/1.3 'JetBrains Mono',monospace;letter-spacing:.06em;color:rgba(190,205,215,.62)}
      .smw-meta b{font-weight:500}
      .smw-top .smw-sub{margin:5px 0 0;padding:0;font-size:10px;line-height:1.4;letter-spacing:.04em;color:rgba(190,205,215,.6);display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;pointer-events:auto}
      .smw-hint{position:absolute;left:0;right:0;bottom:calc(var(--sab,0px) + 100px);z-index:19;text-align:center;font:500 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(190,205,215,.5);text-shadow:0 1px 3px #000;pointer-events:none;opacity:0;transition:opacity .25s}
      .smw-hint.on{opacity:1}
      .smw-tools{position:absolute;right:12px;top:calc(var(--sai,0px) + 66px);z-index:20;display:flex;flex-direction:column;gap:10px}
      .smw-tools button{width:44px;height:44px;padding:10px;border-radius:50%;background:rgba(10,16,24,.62);border:1px solid rgba(150,190,220,.2);color:rgba(200,215,225,.85);cursor:pointer}
      .smw-tools button:active{border-color:rgba(95,255,232,.7);color:#5fffe8}
      .smw-card{position:absolute;left:10px;right:10px;bottom:calc(var(--sab,0px) + 92px);z-index:25;max-height:52%;overflow-y:auto;transform:translateY(16px);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
      .smw-card.on{transform:none;opacity:1;pointer-events:auto}
      .smw-card .sm-panel{margin:0;padding:13px 50px 13px 14px;background:rgba(8,13,19,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(120,160,190,.22);border-radius:12px}
      .smw-card .sm-panel .sig-next{margin-right:-36px}
      .smw-cx{position:absolute;top:2px;right:2px;z-index:2;width:44px;height:44px;border:0;background:none;color:rgba(220,230,238,.8);font-size:26px;line-height:1;cursor:pointer}
      .smw-nav{position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:space-around;align-items:flex-end;padding:18px 10px calc(var(--sab,0px) + 10px);background:linear-gradient(to top,rgba(3,6,10,.88),rgba(3,6,10,0));pointer-events:none}
      .smw-nav button{pointer-events:auto;position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:78px;background:none;border:0;color:#cfdbe4;cursor:pointer;padding:6px 0}
      .smw-nav svg{width:26px;height:26px;padding:10px;box-sizing:content-box;border-radius:50%;background:rgba(10,16,24,.72);border:1px solid rgba(150,190,220,.22)}
      .smw-nav [data-t="missions"] svg{color:#ffc864}
      .smw-nav button{position:relative}.smw-nav .smw-mb{position:absolute;top:2px;right:calc(50% - 26px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ffc864;color:#1a1408;font:700 10px/18px 'Space Grotesk',system-ui,sans-serif;font-style:normal;text-align:center}
      .smw-sheet.smw-only .smw-sh-body>:not(.smw-flights){display:none}
      .smw-nav [data-t="sondes"] svg{color:#5fa8e8}.smw-nav [data-t="rapports"] svg{color:#e6f0ff}.smw-nav [data-t="carnet"] svg{color:#a0c8ff}.smw-nav [data-t="archives"] svg{color:#ffc864}
      .smw-nav button.on svg,.smw-nav button:active svg{border-color:rgba(95,168,232,.8);background:rgba(20,40,60,.85)}
      .smw-nav span{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(200,215,225,.75)}
      .smw-nav .tab-badge{position:absolute;top:2px;right:14px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#ffb14a;color:#0b0f12;font:700 9px/16px 'JetBrains Mono',monospace;text-align:center;box-shadow:0 0 8px rgba(255,177,74,.6)}
      .smw-sheet{position:absolute;inset:0;z-index:40;background:rgba(3,6,10,.45);display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:opacity .2s ease}
      .smw-sheet.on{opacity:1;pointer-events:auto}
      .smw-sheet-in{width:100%;max-height:84%;overflow-y:auto;-webkit-overflow-scrolling:touch;background:rgba(7,11,17,.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-top:1px solid rgba(120,160,190,.25);border-radius:16px 16px 0 0;padding:6px 0 calc(var(--sab,0px) + 18px);transform:translateY(24px);transition:transform .22s ease}
      .smw-sheet.on .smw-sheet-in{transform:none}
      .smw-sheet header{position:sticky;top:-6px;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:4px 6px 4px 18px;background:rgba(7,11,17,.96)}
      .smw-sh-t{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#cfe1ee}
      .smw-sh-x{width:44px;height:44px;border:0;background:none;color:rgba(220,230,238,.8);font-size:26px;line-height:1;cursor:pointer}
      .smw-sh-body{padding:0 14px}
      .smw-sh-body #prospect-pane-univers .universe-stats{display:none}
      .smw-map.svg2d #spacemap-root{overflow-y:auto;padding:calc(var(--sai,0px) + 70px) 12px 120px}
    `;
    document.head.appendChild(st);
  }
  injectWorldCss();

  /* ─── Styles ─── */
  function injectCss() {
    if (document.getElementById('sm3-style')) return;
    const st = document.createElement('style');
    st.id = 'sm3-style';
    st.textContent = `
      #spacemap-root{padding:4px 12px 0}
      .sm3-wrap{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#03070b;height:clamp(340px,64vh,620px);box-shadow:inset 0 0 50px rgba(0,0,0,.5)}
      .sm3-view{position:absolute;inset:0}
      .sm3-view canvas{cursor:grab}
      .sm3-view canvas:active{cursor:grabbing}
      .sm3-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 10px/1 'JetBrains Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:#6a7a72}
      .sm3-btn{position:absolute;right:10px;width:44px;height:44px;border-radius:10px;border:1px solid rgba(95,255,232,.28);background:rgba(6,12,16,.72);color:#5fffe8;display:flex;align-items:center;justify-content:center;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);cursor:pointer;padding:0}
      .sm3-btn:active{background:rgba(95,255,232,.12)}
      .sm3-home{bottom:10px}
      .sm3-wide{bottom:60px}
      .sm-panel{margin:8px 0 6px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg-1);min-height:56px}
      .sm-ptitle{font-size:12px;color:var(--txt);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
      .sm-psub{font-size:10px;color:var(--mut);margin-top:3px;letter-spacing:.04em;line-height:1.5}
      .sm-psub.mono,.sm-psub .mono{font-family:var(--font-mono)}
      .sm-panel .sig-next{margin-top:8px}
      .sm-tags{display:flex;gap:6px;margin-top:9px}
      .sm-tag{flex:1;padding:7px 0;border-radius:6px;border:1px solid rgba(150,170,185,.22);background:transparent;color:rgba(200,212,220,.7);font:500 10px/1 'Space Grotesk',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
      .sm-tag.on{border-color:var(--c);color:var(--c);background:color-mix(in srgb, var(--c) 10%, transparent)}
      .smw-fl-h{margin:4px 2px 6px;font:500 9px/1 'JetBrains Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:rgba(190,205,215,.55)}
      .smw-fl{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;margin-bottom:6px;border:1px solid rgba(120,160,190,.18);border-radius:8px;background:rgba(255,255,255,.02);color:#dfe8ee;font-family:inherit;cursor:pointer;text-align:left}
      .smw-fl .t{font-size:11px;letter-spacing:.08em;text-transform:uppercase;min-width:64px}
      .smw-fl .g{flex:1;font:500 11px/1.2 'JetBrains Mono',monospace;color:#cfdbe4}
      .smw-fl .e{font:500 10px/1 'JetBrains Mono',monospace;color:rgba(190,205,215,.6)}
      .smw-flights{margin-bottom:8px}
      .sm-rts{display:flex;flex-direction:column;gap:5px;margin-top:9px}
      .sm-rt{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border-radius:7px;border:1px solid rgba(150,170,185,.18);background:rgba(255,255,255,.02);color:#dfe8ee;font:500 11px/1.2 'Space Grotesk',system-ui,sans-serif;cursor:pointer;text-align:left}
      .sm-rt i{width:14px;height:3px;border-radius:2px;flex:none}
      .sm-rt b{font-weight:600;letter-spacing:.04em}
      .sm-rt span{margin-left:auto;font:500 10px/1 'JetBrains Mono',monospace;color:rgba(190,205,215,.6)}
      .sm-itin{margin-top:10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden}
      .sm-itin .h{padding:7px 10px;font:600 10px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#9fb3bf;background:rgba(255,255,255,.03)}
      .sm-it{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border:0;border-top:1px solid rgba(255,255,255,.05);background:transparent;color:#e6f0ff;font:inherit;font-size:12px;text-align:left;cursor:pointer;position:relative}
      .sm-it b{flex:0 0 20px;height:20px;border-radius:50%;border:1px solid var(--c);color:var(--c);font:600 10px/18px 'Space Grotesk',system-ui,sans-serif;text-align:center}
      .sm-it.s b,.sm-it.e b{border:0;font-size:13px}
      .sm-it span{flex:0 0 auto;font-size:11px}
      .sm-it i{flex:1;font-style:normal;font-size:10px;color:#9fb3bf;text-align:right}
      .sm-it i em{font-style:normal}.sm-it i em.on{color:#cdb4ff}.sm-it i em.off{color:#6a7a72}
      .sm-it.e span,.sm-it.e i{color:#e6f0ff}
      .sm-use{margin:9px 2px 2px;font-size:11px;line-height:1.5;color:#9fb3bf}
      .sm-bal{margin-top:9px;padding:8px 10px;border-radius:8px;border:1px solid rgba(180,140,255,.28);background:rgba(180,140,255,.05)}
      .sm-bal .h{display:flex;justify-content:space-between;align-items:baseline}
      .sm-bal .h b{font:600 10px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#cdb4ff}
      .sm-bal .h span{font:500 11px/1 'JetBrains Mono',monospace;color:rgba(220,228,235,.8)}
      .sm-bal .d{display:flex;gap:5px;margin:7px 0 6px}
      .sm-bal .d i{flex:1;height:4px;border-radius:2px;background:rgba(180,140,255,.18)}
      .sm-bal .d i.on{background:#b48cff;box-shadow:0 0 6px rgba(180,140,255,.6)}
      .sm-bal .t{font-size:10.5px;line-height:1.4;color:rgba(220,228,235,.75)}
      .sm-users{display:flex;flex-direction:column;gap:3px;margin-top:8px;font-size:11px;color:rgba(220,228,235,.8)}
      .sm-users b{font:600 10px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#ff9a6a;margin-bottom:2px}
      .sm-lanes{display:flex;flex-direction:column;gap:5px;margin-top:8px}
      .sm-lane{display:flex;flex-direction:column;gap:2px;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,200,100,.22);background:rgba(255,200,100,.04)}
      .sm-lane b{font:600 10px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#ffd08a}
      .sm-lane span{font-size:11px;line-height:1.4;color:rgba(220,228,235,.8)}
      .sm-lane.port{border-color:rgba(255,200,100,.5);background:rgba(255,200,100,.08)}
      .sm-posts{display:flex;flex-direction:column;gap:5px;margin-top:8px}
      .sm-post{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,200,100,.28);background:rgba(255,200,100,.05);font-size:11px;color:rgba(220,228,235,.85)}
      .sm-post i{width:7px;height:7px;flex-shrink:0;transform:rotate(45deg);background:#ff9a6a}
      .sm-post i.me{background:#ffc864}
      .sm-post span{flex:1;line-height:1.35}
      .sm-post b{color:#ffe2a8;font-weight:600}
      .sm-post button{flex-shrink:0;padding:6px 9px;border-radius:6px;border:1px solid rgba(255,200,100,.5);background:transparent;color:#ffc864;font:500 10px/1 'Space Grotesk',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
      .sm-spot{display:flex;flex-direction:column;gap:4px;margin-top:8px}
      .sm-spot button{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;text-align:left;padding:7px 9px;border-radius:7px;border:1px dashed rgba(255,138,90,.45);background:rgba(255,138,90,.05);color:#e6f0ff;cursor:pointer;font:inherit}
      .sm-spot .k{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#ff9a6a;align-self:center}
      .sm-spot .mono{font:500 11px/1.2 'JetBrains Mono',monospace;color:#ffd2b8}
      .sm-spot .w{grid-column:1/-1;font-size:10px;color:var(--mut)}
      .sm-avs{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:8px;font-size:10px;color:var(--mut)}
      .sm-av{padding:4px 7px;border-radius:5px;border:1px solid rgba(255,138,138,.35);background:transparent;color:#ff9a8a;font:500 10px/1 'JetBrains Mono',monospace;cursor:pointer}
    `;
    document.head.appendChild(st);
  }

  injectCss();
  function panelFor(sel) { const keep = _sel; _sel = sel; let h = ''; try { h = panelMarkup(collect()); } finally { _sel = keep; } return h; }
  const API = {
    render, sweep, panelFor, tag, beacon, recallBeacon: recallBeaconFromMap, showFlight,
    openRoute, selectRoute, showRoute, routeAvoid, routeUnavoid, routeColor, routeRename, routeDelete, sendOnRoute, postOnRoute, postHere, scout, sendOnOpened, giveOpened, forgetOpened, fleetOnRoute,
    planFor(destKey) { try { return planFrom(_state || collect(), destKey); } catch (e) { return null; } },
    _layout() { return collect(); },   // diagnostic (tests)
    select(kind, key) {
      if (_fallback) return;
      const sel = { kind, key };
      if (!E.ready) { _sel = sel; _pendingFocus = sel; render(); return; }
      ensureDom(); focusSel(sel);
    },
    clear() { _sel = null; if (E.ready) E.setSelection(-1); renderPanel(); },
    leg(id) { _sel = { kind: 'leg', key: id }; refresh(true); },   // 15/10 : la fiche d'un tronçon relevé
    resetView() { if (E.ready) E.moveTo(0, 0, homeDist(), 1); },
  };
  API._e = E; API._cells = CELLS; API._collect = collect;   // pour les tests headless
  window.SBMap = API;
  W.mount();
})();
