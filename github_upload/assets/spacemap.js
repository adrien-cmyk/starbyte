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

    // ── Plateau : une case par objet ──
    const home = mySystemKey();
    add(home, { known: true, isMine: true });
    const occ = new Map();            // idx de case → { kind, key }
    const cell = {};                  // 'sys:KEY' | 'sig:ID' | 'tgt:KEY' | 'pl:COORD' → idx
    // 12/10 (Adrien) : ma planète n'occupe que la case centrale ; l'anneau 1 autour est MON système (ses échos y apparaissent)
    occ.set(0, { kind: 'home', key: home });
    cell['sys:' + home] = 0;
    const keys = Object.keys(systems).filter(k => k !== home).sort();
    for (const k of keys) {
      const { cands, k: p } = primarySlot(k);
      let placed = null;
      for (let j = 0; j < cands.length && !placed; j++) { const c = cands[(p + j) % cands.length]; if (!occ.has(c.idx)) placed = c; }
      if (!placed) placed = freeAround(CELLS[0], 2, BOARD, occ, k)[0];
      if (!placed) continue;
      occ.set(placed.idx, { kind: 'system', key: k });
      cell['sys:' + k] = placed.idx;
    }
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

    // Missions en vol
    const flights = [];
    for (const m of (G.probeMissions || [])) {
      if (m.status !== 'in_transit') continue;
      const tc = String(m.targetCoords || '');
      let to;
      if (/^SIG-/.test(tc)) to = cell['sig:' + tc];
      else if (/^[A-Z]-[A-Z]-\d{4}/.test(tc)) to = cell['sys:' + tc.split('-').slice(0, 3).join('-')];
      if (to !== undefined) flights.push({ kind: 'probe', tier: m.tier, id: m.id, label: `Sonde ${m.probeName || ''}`.trim(), from: 0, to, toCk: /^SIG-/.test(tc) ? 'sig:' + tc : null, departedAt: m.departedAt, arrivalAt: m.arrivalAt, target: tc });
    }
    for (const m of (G.tankerMissions || [])) {
      if (!(m.status === 'in_transit' || m.status === 'returning' || m.status === 'exploring')) continue;
      const tc = String(m.targetCoords || '');
      const sysKey = tc.split('/')[0];
      if (!/^[A-Z]-[A-Z]-\d{4}$/.test(sysKey)) continue;
      const at = cell['tgt:' + tc] !== undefined ? cell['tgt:' + tc] : cell['sys:' + sysKey];
      if (at === undefined) continue;
      const back = m.status === 'returning';
      flights.push({ kind: 'tanker', id: m.id, label: m.tankerName || 'Tanker', from: back ? at : 0, to: back ? 0 : at,
        departedAt: back ? (m.returnDepartedAt || m.arrivalAt || m.departedAt) : m.departedAt, arrivalAt: back ? (m.returnArrivalAt || m.arrivalAt) : m.arrivalAt, target: tc, back });
    }
    return { systems, flights, occ, cell, items, lit: litRing() };
  }

  // Empreinte : ce qui change le plateau (pas le temps qui passe)
  function fingerprint(st) {
    const o = [];
    for (const [i, v] of st.occ) if (v.kind !== 'home') o.push(i + v.kind[0] + v.key);
    for (const s of Object.values(st.systems)) {
      o.push((s.known ? 'K' : '') + (s.scanning ? 'S' : '') + s.key);
      for (const t of s.targets) o.push(t.key + ':' + (t.kt.status || ''));
      for (const g of s.sigs) o.push(g.id + ':' + (g.resolved ? 1 : 0));
      for (const pl of s.planets) o.push('P' + pl.coord + (pl.playerName ? '@' + pl.playerName : ''));
    }
    for (const f of st.flights) o.push('F' + f.id + f.from + '>' + f.to);
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
      return `<div class="sm-panel"><div class="sm-ptitle">Secteur ${esc(s.sector)} · zone inexplorée</div><div class="sm-psub">Rien de connu ici.</div>${act}</div>`;
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
        bits.push(m ? `Radar en route · arrivée dans ${formatTankerDuration(Math.max(0, (m.arrivalAt || 0) - Date.now()))}` : 'balayage en cours');
      }
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
      scene.add(new T.HemisphereLight(0x5a7ca8, 0x05080a, 0.9));
      const sun = new T.DirectionalLight(0xdfe8ff, 1.6);
      sun.position.set(-260, 420, 300);
      scene.add(sun);
      scene.environment = this._env(r);
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
      };
      // Étoiles : un matériau par couleur, luminosité réglée par le zoom (à peine visibles de loin)
      this.starMat = STAR_COLS.map((c) => { const m = new T.MeshBasicMaterial({ color: c }); m.userData.base = new T.Color(c); return m; });
      this.starHalo = STAR_COLS.map((c) => fade(new T.SpriteMaterial({ map: this.halo, color: c, opacity: 0.3, blending: T.AdditiveBlending })));
      this.dimStar = new T.MeshBasicMaterial({ color: 0x6c7a80 });
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
      for (const f of this.flights) {
        let k = f.t1 > f.t0 ? (now - f.t0) / (f.t1 - f.t0) : 1; k = Math.max(0, Math.min(1, k));
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
          const star = mark(new T.Mesh(Gm.sphere, known ? this.starMat[ci2] : this.dimStar));
          star.scale.setScalar(known ? 2.1 : 1.3); star.position.y = 5; star.userData.star = true; star.userData.base = known ? 2.1 : 1.3; g.add(star);
          this.starMeshes.push({ mesh: star, cell: ci, halo: null });
          const halo = new T.Sprite(this.starHalo[ci2]); halo.position.y = 5; halo.scale.setScalar(known ? 11 : 6); g.add(halo);
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
          const tk = hasPlayer ? 'player' : has('sig') ? 'sig' : has('target') ? 'target' : list.some((it) => it.kind === 'planet') ? 'planet' : null;
          if (tk) {
            const tick = mark(new T.Mesh(Gm.sphereLo, this.TICK[tk])); tick.scale.setScalar(1.1); tick.position.set(4.2, 5, -2.4); g.add(tick);
            this.ticks.push(tick);
          }
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
        const c = f.kind === 'tanker' ? 0xffc864 : (f.tier === 'radar' ? 0xe6f0ff : f.tier === 'medium' ? 0x9a8aff : 0x5fcc8a);
        const H = 9;
        const pos = (idx, ck) => {
          if (ck && this.bodies[ck]) { this.content.updateMatrixWorld(true); this.bodies[ck].getWorldPosition(wp); return new T.Vector3(wp.x, H, wp.z); }
          return idx === 0 ? new T.Vector3(0, H, 0) : new T.Vector3(CELLS[idx].x, H, CELLS[idx].z);
        };
        const a = pos(f.from, null), b = pos(f.to, f.toCk);
        const out = (p, q) => { const d = q.clone().sub(p); d.y = 0; const L = d.length(); return L > 20 ? p.clone().addScaledVector(d.normalize(), 9) : p; };
        if (f.from === 0) a.copy(out(a, b)); if (f.to === 0) b.copy(out(b, a));
        const route = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), new T.LineDashedMaterial({ color: c, dashSize: 3, gapSize: 4, transparent: true, opacity: 0.22 }));
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
        this.flights.push({ ship, trail, a, b, t0: f.departedAt || 0, t1: f.arrivalAt || 0 });
      }
      this._tickFlights();
      this._lod(true);
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
      for (const m of Object.values(this.TICK)) m.opacity = far * (1 - near);
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

  function onPick(sel) { _sel = sel; refresh(true); }

  function onPickCell(idx) {
    const st = _state || collect();
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

  function sweep(sysKey) {
    const m = launchProbe('radar', sysKey, 'local', false);
    if (!m) return;
    if (typeof saveGame === 'function') saveGame();
    _sel = { kind: 'system', key: sysKey };
    render();
    if (typeof renderProbesPane === 'function' && document.getElementById('probes-cards-list')) { try { renderProbesPane(); } catch (e) {} }
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
    archives: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M4.5 8.5v11h15v-11M9.5 12.5h5"/></svg>',
    center: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
    wide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/></svg>',
  };
  const SHEETS = { sondes: 'Hangar des sondes', rapports: 'Rapports de mission', carnet: 'Carnet', archives: 'Archives du vide' };

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
      nav.innerHTML = ['sondes', 'rapports', 'carnet', 'archives'].map((k) =>
        `<button data-t="${k}">${ICO[k]}<span>${{ sondes: 'Sondes', rapports: 'Rapports', carnet: 'Carnet', archives: 'Archives' }[k]}</span></button>`).join('');
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
          if (tab === 'carnet') { origTab.call(this, 'univers'); G.prospectTab = 'carnet'; self.openSheet('carnet'); return; }
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
          try { return origRender.apply(this, arguments); } finally { self._keepCarnet = false; }
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
      this.nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      this.sheet.classList.add('on');
    },
    closeSheet(fromTab) {
      if (!this.sheet) return;
      this.tab = null;
      this.sheet.classList.remove('on');
      this.nav.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      if (!fromTab && typeof G !== 'undefined') G.prospectTab = 'univers';
    },

    renderCard(st) {
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
    `;
    document.head.appendChild(st);
  }

  injectCss();
  function panelFor(sel) { const keep = _sel; _sel = sel; let h = ''; try { h = panelMarkup(collect()); } finally { _sel = keep; } return h; }
  const API = {
    render, sweep, panelFor,
    select(kind, key) {
      if (_fallback) return;
      const sel = { kind, key };
      if (!E.ready) { _sel = sel; _pendingFocus = sel; render(); return; }
      ensureDom(); focusSel(sel);
    },
    clear() { _sel = null; if (E.ready) E.setSelection(-1); renderPanel(); },
    resetView() { if (E.ready) E.moveTo(0, 0, homeDist(), 1); },
  };
  API._e = E; API._cells = CELLS; API._collect = collect;   // pour les tests headless
  window.SBMap = API;
  W.mount();
})();
