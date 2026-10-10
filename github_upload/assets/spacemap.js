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
  const DIST_DEF = 620, DIST_MIN = 170, DIST_MAX = 2300;
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
    const band = CELLS.filter(c => c.ring >= Math.max(3, r0) && c.ring <= r1);   // mon secteur : à partir de l'anneau 3 (gros doigts)
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
    for (const c of CELLS) if (c.ring <= 1) occ.set(c.idx, { kind: 'home', key: home });
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
    // Satellites : cases voisines libres (autour de ma planète : jamais à moins de 2 cases)
    for (const k of [home, ...keys]) {
      const s = systems[k], ci = cell['sys:' + k];
      if (ci === undefined) continue;
      const items = [
        ...s.sigs.map(sig => ({ kind: 'sig', key: sig.id, ck: 'sig:' + sig.id })),
        ...s.targets.map(t => ({ kind: 'target', key: t.key, ck: 'tgt:' + t.key })),
        ...s.planets.map(pl => ({ kind: 'planet', key: pl.coord, ck: 'pl:' + pl.coord })),
      ];
      if (!items.length) continue;
      const isHome = k === home;
      let free = freeAround(CELLS[ci], isHome ? 2 : 1, isHome ? 3 : 2, occ, k);
      for (const it of items) {
        if (!free.length) free = freeAround(CELLS[ci], isHome ? 2 : 1, 6, occ, k);
        const c = free.shift();
        if (!c) break;
        occ.set(c.idx, { kind: it.kind, key: it.key });
        cell[it.ck] = c.idx;
      }
    }

    // Missions en vol
    const flights = [];
    for (const m of (G.probeMissions || [])) {
      if (m.status !== 'in_transit') continue;
      const tc = String(m.targetCoords || '');
      let to;
      if (/^SIG-/.test(tc)) to = cell['sig:' + tc];
      else if (/^[A-Z]-[A-Z]-\d{4}/.test(tc)) to = cell['sys:' + tc.split('-').slice(0, 3).join('-')];
      if (to !== undefined) flights.push({ kind: 'probe', tier: m.tier, id: m.id, label: `Sonde ${m.probeName || ''}`.trim(), from: 0, to, departedAt: m.departedAt, arrivalAt: m.arrivalAt, target: tc });
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
    return { systems, flights, occ, cell, lit: litRing() };
  }

  // Empreinte : ce qui change le plateau (pas le temps qui passe)
  function fingerprint(st) {
    const o = [];
    for (const [i, v] of st.occ) if (v.kind !== 'home') o.push(i + v.kind[0] + v.key);
    for (const s of Object.values(st.systems)) {
      o.push((s.known ? 'K' : '') + (s.scanning ? 'S' : '') + s.key);
      for (const t of s.targets) o.push(t.key + ':' + (t.kt.status || ''));
      for (const g of s.sigs) o.push(g.id + ':' + (g.resolved ? 1 : 0));
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


  /* ═══════════════════ Moteur 3D : le plateau ═══════════════════ */
  const waitSB3D = (ms) => new Promise((ok, ko) => {
    if (window.SB3D && window.SB3D.MapControls) return ok(window.SB3D);
    const t0 = Date.now();
    const t = setInterval(() => {
      if (window.SB3D && window.SB3D.MapControls) { clearInterval(t); ok(window.SB3D); }
      else if (Date.now() - t0 > ms) { clearInterval(t); ko(new Error('SB3D indisponible')); }
    }, 120);
  });

  // Recul de départ : en portrait (plein écran), on recule pour voir mon secteur entier
  function homeDist() { const a = E.camera ? E.camera.aspect : 1; return a < 0.8 ? 980 : DIST_DEF; }

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
      r.toneMappingExposure = 1.2;

      const BG = 0x03070b;
      const scene = this.scene = new T.Scene();
      scene.background = new T.Color(BG);
      scene.fog = new T.Fog(BG, 700, 2000);
      scene.add(new T.HemisphereLight(0x4d6f99, 0x05080a, 0.8));
      const sun = new T.DirectionalLight(0xcfe0ff, 1.7);
      sun.position.set(-260, 420, 300);
      scene.add(sun);
      scene.environment = this._env(r);
      scene.environmentIntensity = 0.55;

      // Caméra : exactement celle de la planète (longue focale, 48°, pas de rotation)
      const cam = this.camera = new T.PerspectiveCamera(28, 1, 5, 12000);
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
      ctl.addEventListener('change', () => {          // rester au-dessus du plateau
        const t = ctl.target, d = Math.hypot(t.x, t.z);
        if (d > LIM) { const k = LIM / d; const nx = t.x * k, nz = t.z * k; cam.position.x += nx - t.x; cam.position.z += nz - t.z; t.x = nx; t.z = nz; }
      });

      const comp = this.composer = new S.EffectComposer(r);
      comp.addPass(new S.RenderPass(scene, cam));
      this.bloom = new S.UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.45, 0.92);
      comp.addPass(this.bloom);
      comp.addPass(new S.OutputPass());

      // Le même kit de parcelles que la planète
      const kit = await new S.GLTFLoader().loadAsync('assets/3d/sb_kit.glb');
      const geo = (name) => { let g = null; kit.scene.getObjectByName(name).traverse(o => { if (!g && o.isMesh) g = o.geometry; }); return g; };
      this.gPlate = geo('KIT_PLATE'); this.gFrame = geo('KIT_FRAME'); this.gNodes = geo('KIT_NODES');
      this._planarUV(this.gPlate);

      this._materials();
      this._stars();
      this._board();
      this.content = new T.Group(); scene.add(this.content);
      this.fx = new T.Group(); scene.add(this.fx);
      this.anims = []; this.flights = [];
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
      this.moveTo(0, 0, homeDist(), 1);   // portrait plein écran : plus de recul, comme la planète
      this._t = 0; this._last = performance.now(); this._check = 0;
      // « Réduire les animations » (iOS) : plateau immobile, seuls les vaisseaux avancent (c'est une information)
      try { this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { this.still = false; }
      r.setAnimationLoop(() => this._frame());
      this.ready = true;
      console.log('[SpaceMap] plateau 3D prêt');
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

    _planarUV(geom) {
      if (geom.attributes.uv) return;
      const T = this.T, pos = geom.attributes.position, uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i); }
      geom.setAttribute('uv', new T.BufferAttribute(uv, 2));
    },

    _canvasTex(w, h, draw, repeat) {
      const T = this.T, c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
      if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / repeat, 1 / repeat); }
      return t;
    },

    _materials() {
      const T = this.T;
      // Dalle « pont spatial » : panneaux sombres, joints fins (la terre de la planète devient du métal)
      const deck = this._canvasTex(256, 256, (g, s) => {
        const n = 4, cell = s / n, rnd = _mulberry32(_hashSeed('SM3:deck'));
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const v = 15 + Math.floor(rnd() * 7);
          g.fillStyle = `rgb(${v},${v + 5},${v + 10})`; g.fillRect(x * cell, y * cell, cell, cell);
          g.fillStyle = 'rgba(160,200,255,.035)'; g.fillRect(x * cell + 5, y * cell + 5, cell - 10, 1.5);
        }
        g.strokeStyle = '#07090c'; g.lineWidth = 3;
        for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * cell, 0); g.lineTo(k * cell, s); g.stroke(); g.beginPath(); g.moveTo(0, k * cell); g.lineTo(s, k * cell); g.stroke(); }
      }, 12);
      this.M = {
        plate: new T.MeshStandardMaterial({ map: deck, metalness: 0.55, roughness: 0.42 }),
        frame: new T.MeshStandardMaterial({ color: 0x3e454b, metalness: 0.7, roughness: 0.45 }),   // = MAT_ARMOR_DARK
        nodes: new T.MeshBasicMaterial({ color: 0xffffff }),
        add: (c, o = 1) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: T.AdditiveBlending }),
      };
      this.halo = this._canvasTex(128, 128, (g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.5)'); gr.addColorStop(0.6, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      });
      this.G = {
        ring: (a, b) => { const g = new T.RingGeometry(a, b, 64); g.rotateX(-Math.PI / 2); return g; },
        hexLine: (R) => { const pts = []; for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push(new T.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); } return new T.BufferGeometry().setFromPoints(pts); },
      };
    },

    // Fond : étoiles sous et autour du plateau (parallaxe naturelle quand on se déplace), nébuleuses lointaines
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

    // Le plateau : toutes les cases en instances (dalle + cadre + lumières), comme les parcelles de la planète
    _board() {
      const T = this.T, n = CELLS.length, m4 = new T.Matrix4();
      const mk = (g, mat) => { const im = new T.InstancedMesh(g, mat, n); im.frustumCulled = false; return im; };
      this.iPlate = mk(this.gPlate, this.M.plate);
      this.iFrame = mk(this.gFrame, this.M.frame);
      this.iNodes = mk(this.gNodes, this.M.nodes);
      CELLS.forEach((c, i) => {
        m4.makeTranslation(c.x, 0, c.z);
        this.iPlate.setMatrixAt(i, m4); this.iFrame.setMatrixAt(i, m4); this.iNodes.setMatrixAt(i, m4);
      });
      const black = new T.Color(0, 0, 0);
      for (let i = 0; i < n; i++) { this.iPlate.setColorAt(i, black); this.iFrame.setColorAt(i, black); this.iNodes.setColorAt(i, black); }
      this.scene.add(this.iPlate, this.iFrame, this.iNodes);
      this.nodeBase = new Float32Array(n * 3);
      this.labels = new T.Group(); this.scene.add(this.labels);
    },

    // Couleurs des cases selon la portée et le contenu (rappelé à chaque changement d'état)
    paint(st) {
      const T = this.T, c = new T.Color(), lit = st.lit;
      const tint = { system: [1.0, 1.15, 1.25], sig: [0.55, 0.85, 1.6], target: [1.6, 1.05, 0.35], planet: [1.05, 0.85, 1.7], home: [0.4, 1.3, 1.25] };
      CELLS.forEach((cl, i) => {
        const o = st.occ.get(i);
        let plate, frame, node;
        if (cl.ring > BOARD) {                       // bord : se dissout dans le vide
          const k = Math.max(0, 1 - (cl.ring - BOARD) / (RIM + 0.5));
          plate = [0.35 * k, 0.35 * k, 0.4 * k]; frame = [0.45 * k, 0.45 * k, 0.5 * k]; node = [0, 0.02 * k, 0.04 * k];
        } else {
          // Décision d'Adrien (10/10, nuit) : aucune bordure visible — ni secteur, ni portée.
          // Toutes les cases jouables se ressemblent ; on découvre les autres zones en parcourant la carte
          // (toucher une case dit « Secteur X · zone inexplorée » ou « Trop loin »).
          plate = [1, 1, 1]; frame = [1, 1, 1]; node = [0.16, 0.48, 0.95];
          if (o) { const t = tint[o.kind] || tint.system; node = t; plate = [1.35, 1.4, 1.5]; }
        }
        this.iPlate.setColorAt(i, c.setRGB(plate[0], plate[1], plate[2]));
        this.iFrame.setColorAt(i, c.setRGB(frame[0], frame[1], frame[2]));
        this.nodeBase[i * 3] = node[0]; this.nodeBase[i * 3 + 1] = node[1]; this.nodeBase[i * 3 + 2] = node[2];
        this.iNodes.setColorAt(i, c.setRGB(node[0], node[1], node[2]));
      });
      this.iPlate.instanceColor.needsUpdate = this.iFrame.instanceColor.needsUpdate = this.iNodes.instanceColor.needsUpdate = true;
      this._sectorLabels(st);
      this._sweepFan(st);
    },

    // Noms de secteurs couchés sur le plateau, comme sur une table de jeu
    _sectorLabels(st) {
      const T = this.T;
      while (this.labels.children.length) { const o = this.labels.children.pop(); o.material.map.dispose(); o.material.dispose(); }
      const put = (txt, x, z, lit) => {
        const tex = this._canvasTex(512, 96, (g, w, h) => {
          g.font = '600 52px "Space Grotesk", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = '#bfe4ff'; g.fillText(txt.split('').join(' '), w / 2, h / 2 + 2);
        });
        const m = new T.Mesh(new T.PlaneGeometry(190, 36), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: lit ? 0.2 : 0.09, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 1.9, z); m.renderOrder = 2;
        this.labels.add(m);
      };
      // seul mon secteur est nommé : les autres se découvrent en les touchant
      put('SECTEUR ' + mySector(), 0, CELL * SQ3 / 2 * 4.5, true);
    },

    _sweepFan(st) {
      const T = this.T;
      if (this.fan) { this.fx.remove(this.fan); this.fan.traverse(o => o.geometry && o.geometry.dispose()); this.fan = null; }
      const anyRadar = st.flights.some(f => f.kind === 'probe' && f.tier === 'radar');
      if (!anyRadar) return;
      const R = (BOARD + 0.5) * CELL, g = new T.Group();   // l'éventail ne trahit pas la portée
      const a = new T.CircleGeometry(R, 48, 0, 0.55); a.rotateX(-Math.PI / 2);
      g.add(new T.Mesh(a, this.M.add(0x9fb4c8, 0.006)));
      const b = new T.CircleGeometry(R, 48, 0, 0.12); b.rotateX(-Math.PI / 2);
      g.add(new T.Mesh(b, this.M.add(0xb8c8dc, 0.012)));
      g.position.y = 2.2; g.renderOrder = 3;
      this.fan = g; this.fx.add(g);
    },

    // Ma planète : la vraie Kerath, posée au-dessus du centre du plateau
    _home() {
      const T = this.T, g = new T.Group();
      const ball = new T.Mesh(new T.SphereGeometry(25, 48, 32), new T.MeshStandardMaterial({ color: 0x3f86a2, roughness: 0.85, metalness: 0 }));
      ball.position.y = 40; g.add(ball);
      const load = (u) => new Promise((ok, ko) => new T.TextureLoader().load(u, ok, undefined, ko));
      Promise.all([load('assets/3d/kerath_albedo.jpg'), load('assets/3d/kerath_lights.jpg')]).then(([a, l]) => {
        a.colorSpace = T.SRGBColorSpace; l.colorSpace = T.SRGBColorSpace;
        ball.material.map = a; ball.material.color.set(0xffffff);
        ball.material.emissiveMap = l; ball.material.emissive = new T.Color(0xffc27a); ball.material.emissiveIntensity = 1.4;
        ball.material.needsUpdate = true;
      }).catch(() => {});
      const atmo = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: 0x5fb8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending }));
      atmo.position.y = 40; atmo.scale.setScalar(82); g.add(atmo);
      // Anneau d'orbite au sol (cyan : c'est le point de navigation « chez moi »)
      const ring = new T.Mesh(this.G.ring(70, 71.6), this.M.add(0x5fffe8, 0.4)); ring.position.y = 1.9; g.add(ring);
      const ring2 = new T.Mesh(this.G.ring(40, 40.8), this.M.add(0x5fffe8, 0.18)); ring2.position.y = 1.9; g.add(ring2);
      this.homeBall = ball; this.homeRing = ring;
      const name = (G.planet && G.planet.name) || (G.profile && G.profile.planetName) || 'Ma planète';
      const lab = this._label(String(name).toUpperCase(), '#5fffe8', 1.2); lab.position.set(0, 86, 0); g.add(lab);
      this.scene.add(g);
    },

    _label(txt, color, scale = 1) {
      const T = this.T;
      const tex = this._canvasTex(512, 96, (g, w, h) => {
        g.font = '600 40px "Space Grotesk", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 8;
        g.fillStyle = color; g.fillText(txt.split('').join(' '), w / 2, h / 2);
      });
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      s.scale.set(84 * scale, 15.75 * scale, 1); s.renderOrder = 5;
      s.userData.tex = tex;
      return s;
    },

    _selection() {
      const T = this.T, g = new T.Group();
      const hx = new T.Line(this.G.hexLine(26.5), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      hx.position.y = 2.0; g.add(hx);
      const r1 = new T.Mesh(this.G.ring(31, 31.8), this.M.add(0xffffff, 0.25)); r1.position.y = 2.0; g.add(r1);
      g.visible = false; this.selGroup = g; this.selIdx = -1;
      this.scene.add(g);
    },

    setSelection(idx) {
      const T = this.T, c = new T.Color();
      if (this.selIdx >= 0) { const b = this.selIdx * 3; this.iNodes.setColorAt(this.selIdx, c.setRGB(this.nodeBase[b], this.nodeBase[b + 1], this.nodeBase[b + 2])); this.iNodes.instanceColor.needsUpdate = true; }
      this.selIdx = (idx == null || idx < 0) ? -1 : idx;
      if (this.selIdx < 0 || this.selIdx === 0) { this.selGroup.visible = false; if (this.selIdx === 0) this.selIdx = -1; return; }
      const cl = CELLS[this.selIdx];
      this.selGroup.position.set(cl.x, 0, cl.z); this.selGroup.visible = true;
    },

    // Les objets posés sur les cases
    build(st) {
      const T = this.T;
      while (this.content.children.length) {
        const o = this.content.children.pop();
        o.traverse(x => { if (x.userData.tex) x.userData.tex.dispose(); if (x.isMesh || x.isLine) x.geometry.dispose(); });
      }
      this.anims = []; this.flights = [];
      const at = (idx, y = 0) => new T.Vector3(CELLS[idx].x, y, CELLS[idx].z);
      const A = this.anims;

      for (const s of Object.values(st.systems)) {
        if (s.key === mySystemKey()) continue;
        const ci = st.cell['sys:' + s.key];
        if (ci === undefined) continue;
        const far = CELLS[ci].ring > st.lit;
        const g = new T.Group(); g.position.copy(at(ci));
        const col = STAR_COLS[Math.floor(_mulberry32(_hashSeed('SM3:star:' + s.key))() * STAR_COLS.length)];
        const known = s.known;
        const star = new T.Mesh(new T.SphereGeometry(known ? 4 : 2.6, 20, 14), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(known ? 1.9 : 0.8) }));
        star.position.y = 16; g.add(star);
        const halo = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: col, transparent: true, opacity: known ? 0.32 : 0.14, depthWrite: false, blending: T.AdditiveBlending }));
        halo.position.y = 16; halo.scale.setScalar(known ? 30 : 18); g.add(halo);
        if (known) {
          const o1 = new T.Mesh(this.G.ring(11, 11.5), this.M.add(0xc8fff4, 0.16)); o1.position.y = 1.9; g.add(o1);
          const o2 = new T.Mesh(this.G.ring(18, 18.4), this.M.add(0xc8fff4, 0.08)); o2.position.y = 1.9; g.add(o2);
          const lab = this._label(s.key.split('-').slice(1).join('-'), far ? '#55625e' : '#8fa49e', 0.62); lab.position.set(0, 3, 30); g.add(lab);
        }
        if (s.scanning) {
          for (let k = 0; k < 2; k++) {
            const w = new T.Mesh(this.G.ring(8, 9), this.M.add(0xe6f0ff, 0.5)); w.position.y = 2.1; g.add(w);
            const ph = k * 0.5;
            A.push((t) => { const u = (t * 0.45 + ph) % 1; w.scale.setScalar(0.4 + u * 2.6); w.material.opacity = 0.55 * (1 - u); });
          }
        }
        g.userData.cell = ci; this.content.add(g);
      }

      for (const s of Object.values(st.systems)) {
        for (const sig of s.sigs) {
          const ci = st.cell['sig:' + sig.id]; if (ci === undefined) continue;
          const g = new T.Group(); g.position.copy(at(ci));
          if (!sig.resolved) {
            // Écho : on ne devine pas une planète — un icosaèdre filaire qui respire
            const ico = new T.Mesh(new T.IcosahedronGeometry(6.5, 0), new T.MeshBasicMaterial({ color: new T.Color(0x8fc4ff).multiplyScalar(1.7), wireframe: true, transparent: true, opacity: 0.9 }));
            ico.position.y = 14; g.add(ico);
            const core = new T.Mesh(new T.SphereGeometry(2, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(0x8fc4ff).multiplyScalar(1.8) })); core.position.y = 14; g.add(core);
            const w = new T.Mesh(this.G.ring(9, 10), this.M.add(0x8fc4ff, 0.5)); w.position.y = 2.1; g.add(w);
            const ph = _mulberry32(_hashSeed(sig.id))();
            A.push((t) => { ico.rotation.y = t * 0.5 + ph * 6; ico.rotation.x = t * 0.3; const u = (t * 0.42 + ph) % 1; w.scale.setScalar(0.5 + u * 1.7); w.material.opacity = 0.5 * (1 - u); core.scale.setScalar(0.8 + 0.35 * Math.sin(t * 2.6 + ph * 6)); });
          } else {
            // Corps identifié : silhouette translucide + cercle pointillé vert
            const body = new T.Mesh(new T.SphereGeometry(6, 20, 14), new T.MeshStandardMaterial({ color: 0x5fcc8a, transparent: true, opacity: 0.22, roughness: 0.6, depthWrite: false }));
            body.position.y = 14; g.add(body);
            const wire = new T.Mesh(new T.SphereGeometry(6.2, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(0x5fcc8a).multiplyScalar(1.4), wireframe: true, transparent: true, opacity: 0.35 })); wire.position.y = 14; g.add(wire);
            const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * 15, 2.1, Math.sin(a) * 15)); }
            const dl = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: 0x5fcc8a, dashSize: 3, gapSize: 2.4, transparent: true, opacity: 0.8 }));
            dl.computeLineDistances(); g.add(dl);
            A.push((t) => { wire.rotation.y = t * 0.2; });
          }
          g.userData.cell = ci; this.content.add(g);
        }
        for (const tg of s.targets) {
          const ci = st.cell['tgt:' + tg.key]; if (ci === undefined) continue;
          const engaged = tg.kt.status === 'engaged';
          const g = new T.Group(); g.position.copy(at(ci));
          const gem = new T.Mesh(new T.OctahedronGeometry(6, 0), new T.MeshStandardMaterial({ color: 0x2a1c08, emissive: engaged ? 0x3a3a3a : 0xffb347, emissiveIntensity: engaged ? 0.5 : 1.3, metalness: 0.4, roughness: 0.35, flatShading: true }));
          gem.position.y = 13; gem.scale.y = 1.35; g.add(gem);
          const rnd = _mulberry32(_hashSeed('SM3:rocks:' + tg.key));
          for (let k = 0; k < 6; k++) {
            const rk = new T.Mesh(new T.DodecahedronGeometry(1.2 + rnd() * 2.2, 0), new T.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9, flatShading: true }));
            const a = rnd() * Math.PI * 2, d = 9 + rnd() * 9; rk.position.set(Math.cos(a) * d, 4 + rnd() * 8, Math.sin(a) * d); rk.rotation.set(rnd() * 3, rnd() * 3, 0); g.add(rk);
          }
          if (!engaged) { const h = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: 0xffc864, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending })); h.position.y = 13; h.scale.setScalar(28); g.add(h); }
          A.push((t) => { gem.rotation.y = t * 0.6; });
          g.userData.cell = ci; this.content.add(g);
        }
        for (const pl of s.planets) {
          const ci = st.cell['pl:' + pl.coord]; if (ci === undefined) continue;
          const g = new T.Group(); g.position.copy(at(ci));
          const cls = PLANET_COLS[pl.type] ? pl.type : (SIG_CLASS[(pl.fromSig || {}).fixedClass] || 'type2');
          const big = cls === 'type4' ? 10 : cls === 'type3' ? 8.5 : 7;
          const ball = new T.Mesh(new T.SphereGeometry(big, 32, 20), new T.MeshStandardMaterial({ color: PLANET_COLS[cls], roughness: 0.85 }));
          ball.position.y = 16; g.add(ball);
          const h = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: 0x9a8aff, transparent: true, opacity: 0.3, depthWrite: false, blending: T.AdditiveBlending })); h.position.y = 16; h.scale.setScalar(big * 4.4); g.add(h);
          const rr = new T.Mesh(this.G.ring(16, 16.6), this.M.add(0x9a8aff, 0.4)); rr.position.y = 2; g.add(rr);
          const lab = this._label(String(pl.name || '').toUpperCase(), '#b4a8ff', 0.7); lab.position.set(0, 3, 30); g.add(lab);
          A.push((t) => { ball.rotation.y = t * 0.12; });
          g.userData.cell = ci; this.content.add(g);
        }
      }

      // Vaisseaux en vol : route pointillée, traînée, marqueur
      for (const f of st.flights) {
        const c = f.kind === 'tanker' ? 0xffc864 : (f.tier === 'radar' ? 0xe6f0ff : f.tier === 'medium' ? 0x9a8aff : 0x5fcc8a);
        const H = 24;
        const a = f.from === 0 ? new T.Vector3(0, H, 0) : at(f.from, H), b = f.to === 0 ? new T.Vector3(0, H, 0) : at(f.to, H);
        // ne pas partir du cœur de la planète : départ au bord de l'anneau
        const out = (p, q) => { const d = q.clone().sub(p); d.y = 0; const L = d.length(); return L > 80 ? p.clone().addScaledVector(d.normalize(), 44) : p; };
        if (f.from === 0) a.copy(out(a, b)); if (f.to === 0) b.copy(out(b, a));
        const route = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), new T.LineDashedMaterial({ color: c, dashSize: 4, gapSize: 5, transparent: true, opacity: 0.3 }));
        route.computeLineDistances(); this.content.add(route);
        const tgeo = new T.BufferGeometry().setFromPoints([a.clone(), a.clone()]);
        const trail = new T.Line(tgeo, new T.LineBasicMaterial({ color: new T.Color(c).multiplyScalar(1.6), transparent: true, opacity: 0.7 }));
        this.content.add(trail);
        const ship = new T.Group();
        const mesh = f.kind === 'tanker'
          ? new T.Mesh(new T.BoxGeometry(5, 3.2, 8), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(2.2) }))
          : new T.Mesh(new T.ConeGeometry(2.6, 8, 4), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(2.4) }));
        if (f.kind !== 'tanker') mesh.rotation.x = Math.PI / 2;
        ship.add(mesh);
        const glow = new T.Sprite(new T.SpriteMaterial({ map: this.halo, color: c, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending })); glow.scale.setScalar(16); glow.material.opacity = 0.45; ship.add(glow);
        const hit = new T.Mesh(new T.SphereGeometry(14, 8, 6), new T.MeshBasicMaterial({ visible: false })); ship.add(hit);
        ship.userData.flight = f.id;
        this.content.add(ship);
        this.flights.push({ ship, trail, a, b, t0: f.departedAt || 0, t1: f.arrivalAt || 0 });
      }
      this._tickFlights();
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

    _picking(el) {
      const T = this.T, ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), -TOP), hit = new T.Vector3();
      let down = null;
      el.addEventListener('pointerdown', (e) => { if (e.isPrimary) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      el.addEventListener('pointerup', (e) => {
        if (!down || !e.isPrimary) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
        down = null;
        if (moved > 8 || dt > 450) return;                  // glisser ou appui long : pas un toucher (comme la planète)
        const rect = el.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, this.camera);
        // 1) un vaisseau en vol ?
        const ships = this.content.children.filter(o => o.userData.flight);
        const sh = ray.intersectObjects(ships, true)[0];
        if (sh) { let o = sh.object; while (o && !o.userData.flight) o = o.parent; if (o) return onPick({ kind: 'flight', key: o.userData.flight }); }
        // 2) un objet en hauteur (planète, étoile) : on remonte à sa case
        const objs = ray.intersectObjects(this.content.children.filter(o => o.userData.cell !== undefined), true)
          .filter(h => h.object.isMesh && !(h.object.material && h.object.material.transparent && h.object.material.opacity < 0.3));
        if (objs.length) { let o = objs[0].object; while (o && o.userData.cell === undefined) o = o.parent; if (o) return onPickCell(o.userData.cell); }
        if (this.homeBall && ray.intersectObject(this.homeBall).length) return onPickCell(0);
        // 3) sinon : la case sous le doigt
        if (!ray.ray.intersectPlane(plane, hit)) return;
        const c = cellAtWorld(hit.x, hit.z);
        onPickCell(c ? c.idx : -1);
      });
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

    _frame() {
      if (!this.visible()) { this._last = performance.now(); return; }
      const now = performance.now(), dt = Math.min((now - this._last) / 1000, 0.05);
      this._last = now; this._t += dt; const t = this._t;
      if (this._anim) this._anim(now);
      this.controls.update();
      // brouillard réglé sur la distance : le plateau se perd au loin quel que soit le zoom
      const dist = this.camera.position.distanceTo(this.controls.target);
      this.scene.fog.near = dist * 1.05; this.scene.fog.far = dist * 2.9;
      if (!this.still) for (const f of this.anims) f(t);
      if (this.homeBall && !this.still) this.homeBall.rotation.y = t * 0.05;
      if (this.homeRing && !this.still) this.homeRing.material.opacity = 0.3 + 0.15 * Math.sin(t * 1.6);
      if (this.fan && !this.still) this.fan.rotation.y = -t * 1.05;
      if (this.selIdx > 0) {
        const k = this.still ? 3 : 2.6 + Math.sin(t * 4) * 1.2;
        this.iNodes.setColorAt(this.selIdx, this._c || (this._c = new this.T.Color()).setRGB(0.8 * k, 0.95 * k, 1.0 * k));
        this.iNodes.instanceColor.needsUpdate = true;
        this.selGroup.children[1].rotation.y = t * 0.6;
      }
      if (this.flights.length) this._tickFlights();
      // une fois par seconde : l'état du jeu a-t-il changé (arrivée d'une sonde, nouveau rapport) ?
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

  function onPick(sel) { _sel = sel; refresh(true); }

  function onPickCell(idx) {
    const st = _state || collect();
    const c = idx >= 0 ? CELLS[idx] : null;
    if (!c || c.ring > BOARD) { _sel = null; return refresh(true); }
    const o = st.occ.get(idx);
    if (o) { _sel = { kind: o.kind, key: o.key }; return refresh(true); }
    const sector = sectorOfCell(c);
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
    if (changed) { _sigStr = fp; E.paint(st); E.build(st); if (E.selIdx >= 0) { const k = E.selIdx; E.selIdx = -1; E.setSelection(k); } }
    // une sélection qui a disparu (signature résolue, cible expirée) est remplacée par le résumé
    if (_sel && ['sig', 'target', 'planet', 'system', 'flight'].includes(_sel.kind) && selCell(st) < 0 && _sel.kind !== 'flight') _sel = null;
    E.setSelection(selCell(st));
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
    if (i >= 0) E.moveTo(CELLS[i].x, CELLS[i].z, Math.min(560, E.camera.position.distanceTo(E.controls.target)), 800);
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
      const hint = this.hint = document.createElement('div'); hint.className = 'smw-hint'; hint.textContent = 'Touche une case · une case noire se balaye';
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
        if (sigN) bits.push(`<b style="color:${COL.sig}">${sigN} signature${sigN > 1 ? 's' : ''}</b>`);
        if (st.flights.length) bits.push(`<b style="color:${COL.tanker}">${st.flights.length} en vol</b>`);
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
