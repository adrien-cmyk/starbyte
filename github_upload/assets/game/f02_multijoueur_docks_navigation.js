/* Starbyte — f02_multijoueur_docks_navigation.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';

// PATCH_1510_FLEET_AMBUSH_VIEW — les abordages de cette embuscade : qui (PNJ ou joueur), quoi, quand
function fleetAmbushLootHtml(fleet) {
  const a = fleet && fleet.ambush; if (!a) return '';
  const since = (a.departedAt || 0) - 60000;
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = (G.reports || []).filter(r => r.kind === 'piracy' && r.piracy && /^robbed_/.test(r.piracy.type) && r.piracy.fleet === fleet.name && (r.returnedAt || 0) >= since);
  const sum = { metal: 0, energie: 0, cristal: 0 };
  for (const r of rows) if (r.piracy.type === 'robbed_ok') for (const k in sum) sum[k] += (r.piracy.loot && r.piracy.loot[k]) || 0;
  const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
  const T = { robbed_ok: ['Dévalisé', '#ffc864'], robbed_fail: ['Repoussé', '#ff8a8a'], robbed_evaded: ['Échappé', '#cececd'], robbed_empty: ['Sans butin', '#cececd'] };
  const list = rows.slice(0, 8).map(r => {
    const d = r.piracy, t = T[d.type] || ['', '#cececd'];
    const who = d.npc ? `<span style="color:var(--mut)">PNJ</span> · ${esc(d.who || d.pseudo || 'un convoi')}` : `<span style="color:#ff8a8a">Joueur</span> · <b style="color:#e6f0ff">${esc(d.pseudo || 'pavillon inconnu')}</b>`;
    return `<div onclick="openReportDetail('${r.id}')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid rgba(163,112,255,.15);cursor:pointer">
      <div style="flex:1;min-width:0;text-align:left"><div style="font-size:12px;color:#e6f0ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${who}</div>
        <div style="font-size:10px;color:var(--mut);margin-top:2px">${ago(r.returnedAt)}${d.type === 'robbed_ok' && _mpCargoSum(d.loot) > 0 ? ` · <span style="color:#ffc864">+${_mpResLine(d.loot)}</span>` : ''}</div></div>
      <div style="font-size:10px;letter-spacing:.06em;color:${t[1]};white-space:nowrap">${t[0]}</div><div style="color:var(--mut)">›</div></div>`;
  }).join('');
  return `<div style="margin-top:12px;border:1px solid rgba(163,112,255,.3);border-radius:12px;background:rgba(20,14,40,.55);overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:11px 12px 9px"><span style="font-size:10px;letter-spacing:.14em;color:var(--mut)">PILLAGES DE CETTE EMBUSCADE</span>
      <span style="font-size:11px;color:${_mpCargoSum(sum) > 0 ? '#ffc864' : 'var(--mut)'}">${rows.length ? (_mpCargoSum(sum) > 0 ? '+' + _mpResLine(sum) : rows.length + ' abordage' + (rows.length > 1 ? 's' : '')) : ''}</span></div>
    ${list || `<div style="padding:4px 12px 12px;font-size:11px;color:var(--mut);font-style:italic">${a.phase === 'going' ? 'En route vers sa balise : rien encore.' : 'Aucun convoi abordé pour l\'instant. Elle guette.'}</div>`}
    ${rows.length > 8 ? `<div style="padding:8px 12px;font-size:10px;color:var(--mut);border-top:1px solid rgba(163,112,255,.15)">+ ${rows.length - 8} autres dans les rapports</div>` : ''}
  </div>`;
}
function _mpLegLabel(d) {
  if (d.npc) return d.leg === 'back' ? (d.dock ? `au retour de ${d.dock}` : 'au retour d\'un lieu caché') : (d.dock ? `en route vers ${d.dock}` : 'en route vers un lieu caché');   // PATCH_1510_ORDRES
  if (d.kind === 'embassy') return 'en route vers une ambassade';
  if (d.leg === 'back') return d.dock ? `au retour de ${d.dock}` : 'au retour d\'un dock';
  return d.dock ? `en route vers ${d.dock}` : 'en route vers un dock';
}
function renderPiracyReportDetail(r) {
  const d = r.piracy || {};
  const T = MP_PIRACY_TYPES[d.type] || MP_PIRACY_TYPES.robbed_ok;
  document.getElementById('report-detail-title').textContent = T.title;
  document.getElementById('report-detail-meta').textContent = `${d.system || '?'} · ${new Date(r.returnedAt).toLocaleString('fr-FR')}`;
  const el = document.getElementById('report-detail-content');
  if (!el) return;
  const line = (lbl, val, col) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--mut)">${lbl}</span><span style="color:${col || '#e6f0ff'};text-align:right">${val}</span></div>`;
  const lootLine = _mpCargoSum(d.loot) > 0 ? _mpResLine(d.loot) : 'rien';
  let story = '', rows = '';
  if (d.type === 'robbed_ok') {
    story = `Ta flotte <strong>${d.fleet || ''}</strong> a jailli de l'ombre de ta balise et abordé le convoi de <strong>${d.pseudo || 'un commandant'}</strong>, ${_mpLegLabel(d)}.`;
    rows = line('Butin', '+' + lootLine, 'var(--green)') + line('Où est le butin', 'dans la cale de ta flotte : ramène-la au port') + (d.lossLine ? line('Pertes', d.lossLine, 'var(--red)') : '');
  } else if (d.type === 'robbed_fail') {
    story = `Le tanker de <strong>${d.pseudo || 'un commandant'}</strong> s'est défendu : ta flotte a dû rompre l'abordage.`;
    rows = d.lossLine ? line('Pertes', d.lossLine, 'var(--red)') : '';
  } else if (d.type === 'robbed_evaded') {
    story = `L'équipage de <strong>${d.pseudo || 'ce convoi'}</strong> connaissait sa route par cœur : il a pris un couloir que ta flotte n'a pas vu venir.`;
  } else if (d.type === 'robbed_empty') {
    story = `Ta flotte a arraisonné le convoi de <strong>${d.pseudo || 'un commandant'}</strong>, mais ses cales étaient pleines ou sans tanker : rien n'a pu être emporté.`;
    // PATCH_0211_AMBASSADEUR — vaincre un vaisseau d'exception sans cale : l'honneur, et c'est tout
    if (!d.npc && d.tanker && window.SBBlackmarket && SBBlackmarket.shipThumbHtml(d.tanker)) story = `Tu as vaincu <strong>${_esc(d.tanker)}</strong> de <strong>${d.pseudo || 'un commandant'}</strong>. Sa cale est vide. Il te salue.`;
  } else if (d.type === 'spied') {
    story = `Tu as laissé passer le convoi de <strong>${d.pseudo || 'un commandant'}</strong> sans te montrer. Ta flotte a relevé sa route.<br><br>Il ne sait pas que tu sais. Au premier abordage, il l'apprendra.`;
    rows = (d.address ? line('Monde d\'origine', `${d.address} · dans ton carnet`) : '') + line('Trajet', `${d.from || '?'} → ${d.to || '?'}`) + (d.dock ? line('Dock', d.dock) : '');
  } else if (d.type === 'convoy_robbed') {
    story = `Ton tanker <strong>${d.tanker || ''}</strong> a été intercepté ${_mpLegLabel(d)} par <strong>${d.pseudo || 'un pirate'}</strong>.`
      + (d.spiedSince ? `<br><br><span style="color:#a370ff">Il connaissait ta route depuis le ${new Date(d.spiedSince).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}.</span>` : '');
    rows = line('Cale perdue', '−' + lootLine, 'var(--red)') + line('Riposte', 'pavillon, raid sur son monde, ou une autre route vers ce dock');
  } else if (d.type === 'convoy_defended') {
    story = `<strong>${d.pseudo || 'Un pirate'}</strong> a tenté d'aborder ton tanker <strong>${d.tanker || ''}</strong> ${_mpLegLabel(d)}. Ton équipage l'a repoussé : rien n'a été pris.`;
  } else if (d.type === 'convoy_evaded') {
    story = `<strong>${d.pseudo || 'Un pirate'}</strong> attendait ton tanker <strong>${d.tanker || ''}</strong> en embuscade. Ton équipage connaissait la route : il l'a semé.`;
  } else if (d.type === 'convoy_boarded') {
    story = `<strong>${d.pseudo || 'Un pirate'}</strong> a arraisonné ton tanker <strong>${d.tanker || ''}</strong> ${_mpLegLabel(d)}, mais n'a rien pu emporter.`;
    if (window.SBBlackmarket && SBBlackmarket.shipThumbHtml(d.tanker)) story = `<strong>${d.pseudo || 'Un pirate'}</strong> a vaincu <strong>${_esc(d.tanker)}</strong> ${_mpLegLabel(d)}. La cale était vide. Ton équipage l'a salué.`;   // PATCH_0211_AMBASSADEUR
  }
  if (d.npc) {   // PATCH_1510_ORDRES — convoi PNJ d'une ligne
    const who = `<strong>${d.who || 'un convoi'}</strong> (${d.ships || '?'} vaisseaux, ${d.escort || 'escorte inconnue'})`;
    if (d.type === 'robbed_ok') story = `Ta flotte <strong>${d.fleet || ''}</strong> a jailli de l'ombre de ta balise et abordé ${who}, ${_mpLegLabel(d)}.`;
    else if (d.type === 'robbed_empty') story = `Ta flotte <strong>${d.fleet || ''}</strong> a arraisonné ${who}, mais ${d.noTanker ? 'sans tanker dans la flotte' : 'sa cale était pleine'} : rien n'a pu être emporté.`;
    else if (d.type === 'robbed_fail') {
      story = `${d.escort === 'sans escorte' ? 'L\'équipage' : 'L\'escorte'} d'${who} a repoussé ta flotte <strong>${d.fleet || ''}</strong>, ${_mpLegLabel(d)}.<br><br>La ligne se méfie : ses prochains convois seront mieux gardés pendant quelques heures.`;
    }
  }
  if (d.auto) story += `<br><br><span style="color:#c9a8ff;font-size:12px">Selon tes ordres permanents.</span>`;
  el.innerHTML = `
    <div style="margin:0 16px 14px;padding:18px;border:1px solid ${T.color}55;border-radius:12px;background:rgba(20,25,30,.6);font-size:13px;line-height:1.6;color:#e6f0ff">${story}</div>
    ${rows ? `<div style="margin:0 16px 14px;padding:6px 14px;border:1px solid var(--border);border-radius:10px">${rows}</div>` : ''}`;
}
function _mpLossLine(before, after) {
  const parts = [];
  for (const type of ['fregate', 'cuirasse', 'tanker']) for (const t of ['t1', 't2', 't3']) {
    const n = ((before && before[type] && before[type][t]) || 0) - ((after && after[type] && after[type][t]) || 0);
    if (n > 0) parts.push(`${n} ${type === 'fregate' ? 'frégate' : type === 'cuirasse' ? 'cuirassé' : 'tanker'}${n > 1 ? 's' : ''} ${t.toUpperCase()}`);
  }
  return parts.join(', ');
}
// La composition tenue par le registre (pertes des abordages) s'applique une seule fois : on ne fait que descendre
function _mpSyncFleetLosses(f, comp) {
  if (!f || !comp) return false;
  let changed = false;
  for (const type of ['tanker', 'fregate', 'cuirasse']) for (const t of ['t1', 't2', 't3']) {
    const have = (f.composition[type] && f.composition[type][t]) || 0;
    const want = Math.max(0, (comp[type] && comp[type][t]) || 0);
    if (want < have) {
      if (typeof loseShips === 'function') loseShips(type, t, have - want);
      f.composition[type][t] = want;
      changed = true;
    }
  }
  if (changed && typeof syncFleetIntegrity === 'function') syncFleetIntegrity(f);
  return changed;
}
// La victime : où se paie le butin (registre : loss_mode)
//   route_run          : la cale à bord (et la valeur de cargaison qui fait le gain au retour), sinon les stocks s'il est rentré
//   ambassade before_arrival / offer : la cale à bord et la cale offerte ; livrée entre-temps : déjà retiré par le registre
//   ambassade stocks   : la cale avait déjà été acceptée en entier → payé sur les stocks
function mpApplyConvoyLoss(c) {
  const loot = c.loot || {};
  const m = (G.tankerMissions || []).find(x => x.id === c.mission_id);
  let takenFromCargo = 0;
  for (const k of ['metal', 'energie', 'cristal']) {
    let q = Math.max(0, Math.floor(loot[k] || 0));
    if (!q) continue;
    if (c.kind === 'embassy' && c.loss_mode !== 'stocks') {
      if (m && m.kind === 'dropoff') {
        if (m.mpOffered) m.mpOffered[k] = Math.max(0, (m.mpOffered[k] || 0) - q);
        const bag = m.cargo && m.cargo.resources;
        if (bag && !m.mpCargoDelivered) bag[k] = Math.max(0, (bag[k] || 0) - q);
        m.mpLossApplied = true;
        q = 0;
      }
    } else if (c.kind === 'route' && m && m.kind === 'route_run' && m.cargo) {
      const take = Math.min(m.cargo[k] || 0, q);
      m.cargo[k] = (m.cargo[k] || 0) - take;
      takenFromCargo += take;
      q -= take;
    }
    if (q > 0 && G.res[k]) G.res[k].v = Math.max(0, G.res[k].v - q);   // déjà rentré (ou cale déjà livrée) : payé sur les stocks
  }
  if (m && m.kind === 'route_run' && takenFromCargo > 0) m.cargoTotal = Math.max(0, (m.cargoTotal || 0) - takenFromCargo);
}

// ── Relève : détections, embuscades, abordages, convois attaqués ──
async function mpIngestPiracy(d, meId) {
  let dirty = false;
  if (!Array.isArray(G.beaconReports)) G.beaconReports = [];
  // a. ce que voient mes balises
  for (const s of d.scan || []) {
    const id = 'mpd-' + s.convoy_id + '-' + s.system;
    const end = Date.parse(s.window_end) || (Date.now() + 60000);
    let r = G.beaconReports.find(x => x.id === id);
    if (!r) {
      const beacon = sbAllProbes().find(p => p.tier === 'beacon' && p.state === 'deployed' && _mpSys(p.deployedSystem) === s.system);
      r = { id, kind: 'beacon', beaconId: beacon ? beacon.id : null, beaconName: 'Balise', systemCoord: s.system, createdAt: Date.now(), expiresAt: end, read: false,
        target: { type: 'player', name: s.pseudo || 'Pavillon impérial', tankerTier: s.tanker_tier,
                  cargoEstimate: s.cargo_hint === 'lourde' ? 'lourd' : s.cargo_hint === 'vide' ? 'vide' : 'léger', confidence: s.confidence },
        mp: { convoyId: s.convoy_id, system: s.system, pseudo: s.pseudo || null, leg: s.leg, dock: s.dock_name, routeType: s.route_type, spied: !!s.spied } };
      G.beaconReports.push(r);
      dirty = true;
      if (window.SBLines && SBLines.noteUser) SBLines.noteUser(s.system, s.pseudo || null, Date.now());   // PATCH_1410_BALISAGE
      // PATCH_1310_ROUTES2 — balise sur le tracé : le cap du convoi (système suivant) est relevé, et entre sur la carte
      const nx = /^[A-Z]-[A-Z]-\d{4}$/.test(String(s.next_system || '')) ? s.next_system : null;
      if (nx) {
        r.mp.next = nx; r.mp.onRoute = !!s.on_route;
        if (!Array.isArray(G.spottedLegs)) G.spottedLegs = [];
        if (!G.spottedLegs.some(l => l.convoyId === s.convoy_id && l.from === s.system)) {
          G.spottedLegs.unshift({ id: 'sp-' + s.convoy_id + '-' + s.system, convoyId: s.convoy_id, from: s.system, to: nx, pseudo: s.pseudo || null, at: Date.now(), onRoute: !!s.on_route });
          G.spottedLegs = (window.SBLines && SBLines.capLegs) ? SBLines.capLegs(G.spottedLegs) : G.spottedLegs.slice(0, 40);   // PATCH_1510_ORDRES
        }
        if (typeof SBMap !== 'undefined' && SBMap.render) { try { SBMap.render(); } catch (e) {} }
      }
      { const txt = `📡 ${s.system} : ${s.pseudo ? 'convoi de ' + s.pseudo : 'convoi sous pavillon impérial'}${r.mp.next ? ' · cap sur ' + r.mp.next : ''} · fenêtre ${Math.max(1, Math.ceil((end - Date.now()) / 60000))} min`;
        if (window.SBLines && SBLines.beaconToast) SBLines.beaconToast(s.system, txt, s.cargo_hint === 'lourde' || !!s.spied, () => markBeaconReportRead(id)); else toast(txt); }   // PATCH_1910_ALERTES
    } else if (r.mp) { r.expiresAt = end; r.mp.spied = !!s.spied; }
  }
  // b. mes flottes en embuscade : pertes et cale de butin tenues par le registre
  const fleets = (G.fleet && G.fleet.prepared) || [];
  for (const a of d.ambushes || []) {
    const f = fleets.find(x => x.id === a.fleet_id);
    if (!f || !f.ambush || f.ambush.phase !== 'posted') continue;
    if (f.ambush.mpAmbushId !== a.id) { f.ambush.mpAmbushId = a.id; dirty = true; }
    if (_mpSyncFleetLosses(f, a.composition)) dirty = true;
    if (JSON.stringify(f.ambush.hold || {}) !== JSON.stringify(a.hold || {})) { f.ambush.hold = a.hold || {}; dirty = true; }
  }
  for (const f of fleets) if (f.ambush && f.ambush.phase === 'posted' && !f.ambush.mpAmbushId) mpAmbushRegister(f);
  // c. issue de mes abordages
  for (const i of d.intercepts || []) {
    if (i.status !== 'done' || i.seen) continue;
    const key = 'itc:' + i.id;
    const L = _mpLedger(key);
    if (!(L && L.settled)) {
      const f = fleets.find(x => x.id === i.fleet_id) || null;
      const type = i.outcome === 'won' ? 'robbed_ok' : i.outcome === 'evaded' ? 'robbed_evaded' : i.outcome === 'empty' ? 'robbed_empty' : 'robbed_fail';
      if (type === 'robbed_ok' && window.SBLines && SBLines.noteRobbery) SBLines.noteRobbery(i.victim, i.system);   // PATCH_1410_MARCHE (+ système : PATCH_1510_ORDRES) — dévaliser son acheteur = trahison
      const lossLine = i.losses ? _mpLossLine(i.losses, { tanker: {}, fregate: {}, cuirasse: {} }) : '';
      const _rep = _mpPirReport(type, { icon: '⚔', pseudo: i.victim, system: i.system, fleet: f ? f.name : '', loot: i.loot,
        dock: i.dock_name, leg: i.leg, kind: i.kind, lossLine }, 'itc-' + i.id);
      // PATCH_0211_AMBASSADEUR — sans butin : le registre dit qui était à bord (v38 ; sans elle, le rapport reste celui d'un convoi)
      if (type === 'robbed_empty' && _rep && window.SBBlackmarket) SBBlackmarket.interceptShip(i.id).then(n => { if (n && _rep.piracy) { _rep.piracy.tanker = n; if (typeof saveGame === 'function') saveGame(); } });
      const _v = i.victim || 'pavillon impérial';
      toast(type === 'robbed_ok' ? `⚔ Convoi (${_v}) dévalisé : +${_mpResLine(i.loot)} en cale` : type === 'robbed_fail' ? `⚔ Le convoi (${_v}) a repoussé ton abordage` : `⚔ Le convoi (${_v}) t'a échappé`);
      _mpLedgerSet(key, { settled: true });
      dirty = true;
    }
    window.SBMP.interceptSeen(i.id);
  }
  // d. mes convois attaqués
  for (const c of d.convoys || []) {
    const key = 'cv:' + c.id;
    const L = _mpLedger(key);
    if (!(L && L.settled)) {
      if (c.status === 'intercepted') mpApplyConvoyLoss(c);
      const type = c.status === 'intercepted' ? 'convoy_robbed' : c.outcome === 'evaded' ? 'convoy_evaded' : c.outcome === 'empty' ? 'convoy_boarded' : 'convoy_defended';
      _mpPirReport(type, { icon: '⚠', pseudo: c.pirate_pseudo, system: c.intercept_system || c.to_system, tanker: c.tanker_name, loot: c.loot,
        dock: c.dock_name, leg: c.leg, kind: c.kind, spiedSince: c.spied_since ? Date.parse(c.spied_since) : null }, 'cv-' + c.id);
      toast(type === 'convoy_robbed' ? `⚠ ${c.tanker_name} intercepté par ${c.pirate_pseudo} : −${_mpResLine(c.loot)}` : `${c.tanker_name} a échappé à ${c.pirate_pseudo}`);
      _mpLedgerSet(key, { settled: true });
      dirty = true;
    }
    window.SBMP.convoySeen(c.id);
  }
  // e. départs pas encore inscrits (hors ligne au départ)
  for (const m of G.tankerMissions || []) {
    if (!m.mpConvoy) continue;
    for (const leg of ['out', 'back']) if (m.mpConvoy[leg] === 'pending') mpConvoyRegister(m, leg);
  }
  if (dirty) {
    if (typeof saveGame === 'function') saveGame();
    if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge();
    _mpDiploRefresh();
    _mpInterceptSheetRefresh();
  }
}
function _mpAmbushTravelMs(system) { return typeof mpRaidTravelMs === 'function' ? mpRaidTravelMs({ mpAddress: system + '-01' }) : 10 * 60000; }
function _mpChoose(title, items) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.id = 'mp-choose';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML = `<div style="width:100%;max-width:480px;max-height:82vh;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#0d1218;border-top:1px solid var(--border);border-radius:14px 14px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px">${title}</div>
      ${items.map((it, k) => `<button data-k="${k}" style="display:block;width:100%;text-align:left;padding:12px 14px;margin-bottom:8px;background:rgba(163,112,255,.07);border:1px solid rgba(163,112,255,.4);border-radius:8px;color:#e6f0ff;font-family:inherit;font-size:13px;cursor:pointer">${it.label}${it.sub ? `<div style="font-size:10px;color:var(--mut);margin-top:3px">${it.sub}</div>` : ''}</button>`).join('')}
      <button data-k="-1" style="width:100%;padding:11px;background:transparent;border:1px solid var(--border);color:var(--mut);border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer">Annuler</button></div>`;
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b && e.target !== ov) return;
      const k = b ? parseInt(b.dataset.k, 10) : -1;
      ov.remove();
      resolve(k >= 0 ? items[k] : null);
    });
    document.body.appendChild(ov);
  });
}
async function mpAmbushStart(fleetId, onlySystems) {   // PATCH_1510_ROUTES_UX : onlySystems = jalons d'une route
  const f = (G.fleet.prepared || []).find(x => x.id === fleetId);
  if (!f || _mpAmbushBusy.has(fleetId)) return;
  if ((f.status || 'prepared') !== 'deployed') { toast('La flotte doit être en orbite'); return; }
  if (f.repair) { toast('Attends la fin des réparations'); return; }
  if (((f.soldiers && f.soldiers.garde) || 0) + ((f.soldiers && f.soldiers.lourd) || 0) > 0) {   // PATCH_1510_MISSIONS
    const n = ((f.soldiers.garde) || 0) + ((f.soldiers.lourd) || 0);
    const okS = await sbConfirm({ title: 'Les soldats restent au sol', body: `Une embuscade est un combat spatial : on aborde des convois, on ne débarque pas.<br><br>Les <strong>${n} soldat${n > 1 ? 's' : ''}</strong> de ${f.name} retournent à la caserne et défendent la planète pendant l'absence de la flotte.`, confirmLabel: 'Débarquer et continuer', cancelLabel: 'Annuler' });
    if (!okS) return;
    f.soldiers = Object.assign({}, f.soldiers, { garde: 0, lourd: 0 });
    if (typeof syncFleetIntegrity === 'function') syncFleetIntegrity(f);
    if (typeof saveGame === 'function') saveGame();
  }
  const armed = ['fregate', 'cuirasse'].some(type => ['t1', 't2', 't3'].some(t => (f.composition[type] && f.composition[type][t]) > 0));
  if (!armed) { toast('Il faut des frégates ou des cuirassés pour aborder un convoi'); return; }
  if (!_mpOnline()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  if (!(await mpPeaceGuard('Poster cette flotte en embuscade'))) return;   // PATCH_2410_PACIFIQUE
  // ROUTES_V2 (03/11) : on poste sur n'importe quel système d'une route connue (jalons des lignes remontées, routes ouvertes), ou sur une de ses balises
  const _cand = new Map();
  for (const b of mpBeaconList()) if (!String(b.local_id).startsWith('amb-')) _cand.set(b.system, { local_id: b.local_id, system: b.system, via: 'ta balise' });
  try {
    for (const r of (G.routes || [])) {
      const chain = r.portSys && window.SBLines && SBLines.knownChain ? SBLines.knownChain(r.portSys) : (Array.isArray(r.chain) ? r.chain : []);
      for (const x of chain) if (_mpSys(x) && !_cand.has(x)) _cand.set(x, { local_id: null, system: x, via: r.name || 'route connue' });
    }
  } catch (e) {}
  let beacons = [..._cand.values()].filter(b => !Array.isArray(onlySystems) || onlySystems.includes(b.system));
  // 04/11 (retour de Damien : liste trop longue, impossible à faire défiler) : sur une route, seuls les systèmes où passent des convois ;
  // au-delà de 8 choix, on choisit d'abord la route (ou « Mes balises »), puis le système
  beacons = beacons.filter(b => b.local_id || (() => { try { return (SBLines.network().bySys[b.system] || []).some(o => !o.isPort); } catch (e) { return true; } })());
  if (beacons.length > 8) {
    const groups = new Map();
    for (const b of beacons) { const g = b.local_id ? 'Mes balises' : b.via; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(b); }
    if (groups.size > 1) {
      const gk = await _mpChoose('Embuscade · sur quelle route ?', [...groups.entries()].map(([k, l]) => ({ k, label: String(k).replace(/[<>&"]/g, ''), sub: `${l.length} système${l.length > 1 ? 's' : ''}` })));
      if (!gk) return;
      beacons = groups.get(gk.k);
    }
  }
  if (!beacons.length) { toast(Array.isArray(onlySystems) ? 'Aucun système connu sur cette route' : 'Découvre d\'abord une route (signal d\'antenne + balise) ou pose une balise sur un système'); return; }
  const taken = new Set((G.fleet.prepared || []).filter(x => x.ambush && x.id !== f.id).map(x => x.ambush.system));
  // PATCH_1510_ORDRES — par une route connue (et balisée), la flotte arrive plus vite ; les jalons de lignes sont signalés
  const _trv = (x) => (window.SBLines && SBLines.ambushTravel) ? SBLines.ambushTravel(x, _mpAmbushTravelMs(x)) : { ms: _mpAmbushTravelMs(x), route: null };
  const _lineAt = (x) => { try { return !!(window.SBLines && (SBLines.network().bySys[x] || []).some(o => !o.isPort)); } catch (e) { return false; } };
  const _esc = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, '');
  const choice = beacons.length === 1 ? beacons[0] : await _mpChoose('Embuscade · où poster la flotte ?', beacons.map(b => { const tv = _trv(b.system); return {
    ...b, label: b.system + (b.via ? ' · ' + _esc(b.via) : ''), sub: `${Math.round(tv.ms / 60000)} min${tv.route ? ' par ' + _esc(tv.route.name) : ' de trajet'}${_lineAt(b.system) ? ' · des convois PNJ y passent' : ''}${taken.has(b.system) ? ' · une autre flotte y est déjà' : ''}` }; }));
  if (!choice) return;
  const sys = choice.system;
  const _tr = _trv(sys);
  const travel = _tr.ms;
  const orders = window.SBLines ? await SBLines.chooseOrders(null) : { mode: 'manual', players: false };
  if (!orders) return;
  const _ordTxt = window.SBLines ? SBLines.ORDER_MODES[orders.mode].label + (orders.mode === 'manual' ? '' : orders.players ? ' · convois de joueurs compris' : ' · convois PNJ seulement') : '';
  const fuel = computeMissionFuelCost(f, { distanceMult: typeof _carnetDistanceMult === 'function' ? _carnetDistanceMult(sys.split('-')[1]) : 3 });
  if ((G.res.energie.v || 0) < fuel) { toast(`Énergie insuffisante : ${fmt(fuel)} requis`); return; }
  const tankers = ['t1', 't2', 't3'].reduce((s, t) => s + ((f.composition.tanker && f.composition.tanker[t]) || 0), 0);
  const ok = await sbConfirmWarning('Embuscade',
    `Poster <strong>${f.name}</strong> en embuscade sur <strong>${sys}</strong> ?<br><br>Trajet ${Math.round(travel / 60000)} min${_tr.route ? ` par <strong>${_esc(_tr.route.name)}</strong>` : ''} · ${fmt(fuel)} énergie.`
    + (_ordTxt ? `<br>Ordres : <strong>${_ordTxt}</strong>` : '')
    + `<br><br>Une fois en place, elle voit passer les convois par elle-même (pas besoin de balise) et applique ses ordres ; devant une escorte plus forte qu'elle, elle reste cachée.`
    + (tankers ? '' : `<br><br><span style="color:#ffc864">Sans tanker dans la flotte, aucun butin ne pourra être emporté.</span>`)
    + `<br><br><em>Loin de ta planète, cette flotte ne la protège plus.</em>`, 'Partir en embuscade');
  if (!ok) return;
  const now = Date.now();
  G.res.energie.v = Math.max(0, G.res.energie.v - fuel);
  mpPeaceRenounce();   // PATCH_2410_PACIFIQUE
  f.status = 'in_mission';
  f.missionStartedAt = now;
  f.missionEndsAt = null;
  f.missionTargetId = null;
  f.ambush = { system: sys, beaconId: choice.local_id || null, phase: 'going', world: G.activeWorld || 'home', departedAt: now, arrivesAt: now + travel, travelMs: travel, hold: {}, mpAmbushId: null,
    orders, routeId: _tr.route ? _tr.route.id : null, routeChain: _tr.route ? _tr.route.chain.slice(0, 14) : null };   // PATCH_1510_ORDRES
  if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop();
  toast(`${f.name} part en embuscade sur ${sys} · ${Math.round(travel / 60000)} min`);
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
async function mpAmbushRegister(f) {
  const a = f && f.ambush;
  if (!a || a.phase !== 'posted' || a.mpAmbushId || _mpAmbushBusy.has(f.id) || !_mpOnline()) return;
  _mpAmbushBusy.add(f.id);
  try {
    await mpPublishFleetsNow();   // ANTITRICHE_0811 (v47) : l'embuscade se lit au registre
    const payload = _mpFleetPayload(f);
    payload.soldiers = { garde: 0, lourd: 0 };
    try { await window.SBMP.beaconsSync(mpBeaconList()); } catch (e) {}   // ROUTES_V2 : la flotte postée est ses propres yeux au registre
    a.mpAmbushId = await window.SBMP.ambushPost(f.id, f.name, a.system, payload);
    a.blind = false;
    if (window.SBLines && SBLines.pushOrders) { a.ordersSync = false; a.ordersTry = 0; SBLines.pushOrders(f, true); }   // PATCH_1510_ORDRES
    if (typeof saveGame === 'function') saveGame();
  } catch (e) {
    a.blind = false;   // ROUTES_V2 : plus d'« aveugle » ; une inscription refusée est simplement retentée à la prochaine relève
    console.warn('[embuscade] inscription :', e && e.message || e);
  } finally { _mpAmbushBusy.delete(f.id); }
}
// Tick (boucle des missions) : arrivée sur la balise, retour au port. Renvoie true si la flotte est rentrée.
function _mpAmbushTick(f, now) {
  const a = f.ambush;
  if (a.phase === 'going' && now >= a.arrivesAt) {
    a.phase = 'posted';
    a.postedAt = a.arrivesAt;   // PATCH_1510_ORDRES — en place depuis l'arrivée (jeu fermé entre-temps : les passages comptent)
    a.npcAt = a.arrivesAt;
    toast(`${f.name} en embuscade sur ${a.system}`);
    mpAmbushRegister(f);
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  }
  if (a.phase === 'returning' && now >= a.returnsAt) {
    const hold = (window.SBLines && SBLines.holdAll) ? SBLines.holdAll(a) : (a.hold || {});   // PATCH_1510_ORDRES
    if (_mpCargoSum(hold) > 0) _mpPay(hold, +1, true);
    toast(`${f.name} est rentrée${_mpCargoSum(hold) > 0 ? ' · butin déchargé : +' + _mpResLine(hold) : ''}`);
    delete f.ambush;
    f.status = 'deployed';
    f.missionStartedAt = null;
    if (typeof saveGame === 'function') saveGame();
    return true;
  }
  const el = document.getElementById('fleet-detail-ambush-timer');
  if (el && f.id === selectedFleetId) el.textContent = _mpAmbushPhaseText(f);
  return false;
}
function _mpAmbushPhaseText(f) {
  const a = f.ambush; if (!a) return '';
  const now = Date.now();
  if (a.phase === 'going') return `Arrivée dans ${formatMissionTimer(Math.max(0, a.arrivesAt - now))}`;
  if (a.phase === 'returning') return `Retour au port dans ${formatMissionTimer(Math.max(0, a.returnsAt - now))}`;
  const _hold = a.hold && Object.values(a.hold).some(v => v > 0) ? ` · en cale : ${typeof _mpResLine === 'function' ? _mpResLine(a.hold) : ''}` : '';
  return `En embuscade sur ${a.system} · à l'affût` + (window.SBLines && SBLines.ordersLabel ? ' · ' + SBLines.ordersLabel(f).replace('Ordres : ', '') : '') + _hold;   // ROUTES_V2
}
async function mpAmbushRecall(fleetId) {
  const f = (G.fleet.prepared || []).find(x => x.id === fleetId);
  const a = f && f.ambush;
  if (!a || a.phase === 'returning' || _mpAmbushBusy.has(fleetId)) return;
  const now = Date.now();
  if (a.phase === 'going') {   // PATCH_1510_MISSIONS — engagée pour de bon : pas de demi-tour en route
    toast(`${f.name} est engagée : elle va jusqu'à sa balise`); return;
    a.phase = 'returning';
    a.returnDepartedAt = now;   // PATCH_1510_ORDRES
    a.returnsAt = now + Math.max(5000, now - a.departedAt);
  } else {
    if (!_mpOnline()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
    if (window.SBLines && SBLines.tickAmbushes) { try { SBLines.tickAmbushes(now); } catch (e) {} }   // PATCH_1510_ORDRES
    const hold = (window.SBLines && SBLines.holdAll) ? SBLines.holdAll(a) : (a.hold || {});
    const ok = await sbConfirmWarning('Rentrer au port', `Lever l'embuscade de <strong>${f.name}</strong> sur ${a.system} ?<br><br>Retour dans ${Math.round(a.travelMs / 60000)} min${_mpCargoSum(hold) > 0 ? ` avec <strong>${_mpResLine(hold)}</strong> en cale` : ''}.`, 'Rentrer');
    if (!ok) return;
    _mpAmbushBusy.add(fleetId);
    // PATCH_1510_ORDRES — butin et pertes PNJ inscrits d'abord (sinon ils restent à bord, payés au retour)
    if (window.SBLines && SBLines.pushNpc) {
      const pn = await SBLines.pushNpc(f, true);
      if (pn === false) { _mpAmbushBusy.delete(fleetId); toast('Registre hors ligne : réessaie dans un instant'); return; }
    }
    try {
      // par identifiant, ou par flotte si l'inscription a eu lieu sans que la réponse arrive
      const res = a.mpAmbushId ? await window.SBMP.ambushLeave(a.mpAmbushId) : await window.SBMP.ambushLeaveFleet(f.id);
      if (res) { _mpSyncFleetLosses(f, res.composition); const _h = res.hold || {}; if (_mpCargoSum(_h) > 0 || _mpCargoSum(a.hold || {}) === 0) a.hold = _h; }   // PATCH_2010_AUDIT — une réponse rejouée vide n'efface pas la cale
    } catch (e) { toast(_mpPirErr(e)); _mpAmbushBusy.delete(fleetId); return; }
    _mpAmbushBusy.delete(fleetId);
    if (!f.ambush || f.ambush.phase !== 'posted') return;
    a.phase = 'returning';
    a.returnDepartedAt = Date.now();   // PATCH_1510_ORDRES
    a.returnsAt = Date.now() + a.travelMs;
  }
  if (typeof startMissionTimerLoop === 'function') startMissionTimerLoop();
  toast(`${f.name} rentre au port`);
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
function _mpPostedFleetAt(system) {
  return (G.fleet.prepared || []).find(x => (x.status || 'prepared') === 'in_mission' && x.ambush && x.ambush.phase === 'posted' && x.ambush.system === system && !x.ambush.blind) || null;
}
function mpOpenInterceptSheet(reportId) {
  _mpInterceptOpen = reportId;
  _mpRenderInterceptSheet();
}
function _mpInterceptSheetRefresh() { if (_mpInterceptOpen && document.getElementById('mp-intercept-sheet')) _mpRenderInterceptSheet(); }
function closeMpInterceptSheet() { _mpInterceptOpen = null; const m = document.getElementById('mp-intercept-sheet'); if (m) m.remove(); }
function _mpRenderInterceptSheet() {
  const r = (G.beaconReports || []).find(x => x.id === _mpInterceptOpen);
  if (!r || !r.mp) { closeMpInterceptSheet(); return; }
  let modal = document.getElementById('mp-intercept-sheet');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mp-intercept-sheet';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center';
    modal.addEventListener('click', (e) => { if (e.target === modal) closeMpInterceptSheet(); });
    document.body.appendChild(modal);
  }
  const t = r.target, d = r.mp;
  const left = Math.max(0, r.expiresAt - Date.now());
  const fleet = _mpPostedFleetAt(d.system);
  const line = (lbl, val, col) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--mut)">${lbl}</span><span style="color:${col || '#e6f0ff'};text-align:right">${val}</span></div>`;
  const btn = (label, onclick, rgb, off) => `<button ${off ? 'disabled' : `onclick="${onclick}"`} style="flex:1;padding:13px;background:rgba(${rgb},.08);border:1px solid rgba(${rgb},.5);color:rgb(${rgb});border-radius:8px;font-family:inherit;font-size:12px;letter-spacing:.06em;${off ? 'opacity:.4' : 'cursor:pointer'}">${label}</button>`;
  let actions;
  if (left <= 0) actions = `<div style="font-size:12px;color:var(--mut);font-style:italic;text-align:center;padding:10px">Fenêtre fermée : le convoi est passé.</div>`;
  else if (!fleet) actions = `<div style="font-size:12px;color:var(--mut);line-height:1.5;padding:10px 2px">Aucune flotte en embuscade sur <strong style="color:#e6f0ff">${d.system}</strong>. Poste une flotte armée sur ce système (Flotte › une flotte en orbite › Poster en embuscade) : elle verra passer les convois et pourra les aborder.</div>`;
  else actions = `<div style="font-size:11px;color:var(--mut);margin-bottom:8px">${fleet.name} est à l'affût</div>
      <div style="display:flex;gap:8px">${btn('Dévaliser', `mpRobConvoy('${r.id}')`, '255,200,100')}${btn(d.spied ? 'Route espionnée' : 'Espionner', `mpSpyConvoy('${r.id}')`, '163,112,255', d.spied)}</div>`;
  modal.innerHTML = `<div style="width:100%;max-width:480px;max-height:85vh;overflow:auto;background:#0d1218;border-top:1px solid rgba(163,112,255,.4);border-radius:14px 14px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))">
    <div style="font-size:10px;color:#a370ff;letter-spacing:.16em;text-transform:uppercase">Convoi détecté · balise ${d.system}</div>
    <div style="font-size:18px;color:#e6f0ff;font-weight:700;margin:6px 0 12px">${d.pseudo || 'Pavillon impérial'}</div>
    <div style="margin-bottom:14px">
      ${line('Identification', d.pseudo ? `${t.confidence} % de confiance` : 'masquée (voie balisée)')}
      ${window.SBBlackmarket && SBBlackmarket.shipThumbHtml(d && d.tanker_name) ? line('Vaisseau', _esc(d.tanker_name)) : line('Tanker', 'T' + t.tankerTier)}
      ${line('Cale estimée', t.cargoEstimate)}
      ${line('Trajet', _mpLegLabel({ leg: d.leg, dock: d.dock, kind: d.leg === 'out' && !d.dock ? 'embassy' : 'route' }))}
      ${d.next ? line('Cap relevé', `<span onclick="closeMpInterceptSheet();openSystemOnMap('${d.next}')" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;font-family:var(--font-mono)">${d.next}</span>${d.onRoute ? ' · route privée' : ''}`, '#ff9a6a') : ''}
      ${line('Fenêtre', left > 0 ? formatMissionTimer(left) : 'fermée', left > 0 ? '#a370ff' : 'var(--mut)')}
    </div>
    ${actions}
    <div style="font-size:10px;color:var(--mut);line-height:1.5;margin-top:12px;font-style:italic">Dévaliser : combat contre le tanker, butin dans la cale de ta flotte, la victime saura qui. Espionner : tu le laisses passer et tu relèves sa route, sans trace.</div>
    <button onclick="closeMpInterceptSheet()" style="margin-top:14px;width:100%;padding:11px;background:transparent;border:1px solid var(--border);color:var(--mut);border-radius:6px;font-family:inherit;font-size:12px;letter-spacing:.08em;cursor:pointer">FERMER</button>
  </div>`;
}
async function mpRobConvoy(reportId) {
  const r = (G.beaconReports || []).find(x => x.id === reportId);
  if (!r || !r.mp || _mpAmbushBusy.has('rob:' + reportId)) return;
  if (Date.now() > (r.expiresAt || 0)) { toast('Fenêtre fermée : le convoi est passé'); _mpInterceptSheetRefresh(); return; }
  if (!_mpOnline()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  if (!(await mpPeaceGuard('Aborder le convoi d\'un autre commandant'))) return;   // PATCH_2410_PACIFIQUE
  if (!G.beaconReports.includes(r)) return;
  _mpAmbushBusy.add('rob:' + reportId);
  try {
    const fleet = _mpPostedFleetAt(r.mp.system);
    if (!fleet) { toast(MP_PIRACY_ERRORS.no_ambush); return; }
    await window.SBMP.intercept(r.mp.convoyId, r.mp.system, fleet.id);
    mpPeaceLost();   // PATCH_2410_PACIFIQUE
    r.expiresAt = Date.now();          // le convoi est engagé : la fenêtre se ferme
    toast('⚔ Abordage lancé…');
    closeMpInterceptSheet();
    setTimeout(() => { if (_mpOnline()) window.SBMP.pollPiracy(); }, 4000);
  } catch (e) { toast(_mpPirErr(e)); }
  finally { _mpAmbushBusy.delete('rob:' + reportId); }
}
async function mpSpyConvoy(reportId) {
  const r = (G.beaconReports || []).find(x => x.id === reportId);
  if (!r || !r.mp || r.mp.spied || _mpAmbushBusy.has('spy:' + reportId)) return;
  if (Date.now() > (r.expiresAt || 0)) { toast('Fenêtre fermée : le convoi est passé'); _mpInterceptSheetRefresh(); return; }
  if (!_mpOnline()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  _mpAmbushBusy.add('spy:' + reportId);
  try {
    const o = await window.SBMP.spy(r.mp.convoyId, r.mp.system);
    r.mp.spied = true;
    if (o.address && o.pseudo) _mpMergeSender(o.address, o.pseudo);
    _mpPirReport('spied', { icon: '👁', pseudo: o.pseudo, address: o.address, from: o.from_system, to: o.to_system, dock: o.dock_name, system: r.mp.system }, 'spy-' + r.mp.convoyId);
    toast(`👁 Route de ${o.pseudo} relevée`);
    if (typeof saveGame === 'function') saveGame();
    _mpRenderInterceptSheet();
  } catch (e) { toast(_mpPirErr(e)); }
  finally { _mpAmbushBusy.delete('spy:' + reportId); }
}

// VOISINS_1310 — signaux captés : les commandants les plus proches entrent au carnet (une fois chacun)
function mpIngestNeighbors(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  if (!G.mpNeighbors || typeof G.mpNeighbors !== 'object') G.mpNeighbors = {};
  const fresh = [];
  for (const w of rows) {
    if (!w || !w.address || w.address === (typeof mpMyAddressString === 'function' ? mpMyAddressString() : '')) continue;
    const sysKey = String(w.address).split('-').slice(0, 3).join('-');
    mergeRealWorlds(sysKey, [{ address: w.address, pseudo: w.pseudo, planet_name: w.planet_name, level_estimate: w.level_estimate }], { noReport: true });
    if (!G.mpNeighbors[w.address]) {
      G.mpNeighbors[w.address] = Date.now();
      fresh.push(w);
      _mpDiploReport('neighbor', { pseudo: w.pseudo, address: w.address, planet: w.planet_name || null, level: w.level_estimate || 1 }, 'nb-' + w.address);
    }
  }
  if (!fresh.length) return;
  const _ant = (window.SBAntenna && typeof SBAntenna.data === 'function') ? SBAntenna.data() : G.antenna;
  const antenna = !!(_ant && _ant.built && !_ant.building);
  toast(`📡 ${antenna ? 'Ton antenne capte' : 'Signal capté'} : ${fresh.map(w => w.pseudo).join(', ')} · ajouté${fresh.length > 1 ? 's' : ''} au carnet`);
  if (typeof saveGame === 'function') saveGame();
  if (typeof _mpDiploRefresh === 'function') _mpDiploRefresh();
}
async function sbRenameProfile(kind) {
  if (_sbRenaming) return;
  if (!(window.SBMP && window.SBMP.ready())) { toast('Registre hors ligne : réessaie dans un instant'); return; }
  const w = window.SBMP.world || {};
  if (kind === 'pseudo' ? w.pseudo_renamed : w.planet_renamed) { toast(MP_RENAME_ERRORS[kind + '_locked']); return; }
  const isP = kind === 'pseudo';
  const current = isP ? (w.pseudo || '') : ((G.planet && G.planet.name) || w.planet_name || '');
  const raw = await sbPrompt({
    title: isP ? 'Changer de pseudo' : 'Renommer ta planète',
    body: `${isP ? 'Ton nom de commandant, vu par tous.' : 'Le nom de ta capitale, vu par les autres commandants.'}<br><br><strong style="color:#ff8a8a">Une seule modification possible : ce sera définitif.</strong>`,
    placeholder: current, initialValue: current, confirmLabel: 'Continuer', maxLength: isP ? 20 : 40,
  });
  if (raw === null) return;
  let next = String(raw).trim().replace(/[<>&"`\\]/g, '');
  if (!isP) next = next.toUpperCase();
  if (!next || next === current) return;
  if (isP && !/^[A-Za-zÀ-ÿ0-9 _.'-]{3,20}$/.test(next)) { toast(MP_RENAME_ERRORS.pseudo_invalid); return; }
  if (!isP && (next.length < 2 || next.length > 40)) { toast(MP_RENAME_ERRORS.planet_invalid); return; }
  const ok = await sbConfirmWarning(isP ? 'Pseudo définitif' : 'Nom définitif', `<strong>${current || '—'}</strong> → <strong>${next}</strong><br><br>Tu ne pourras plus le changer.`, 'Confirmer');
  if (!ok) return;
  _sbRenaming = true;
  try {
    await window.SBMP.rename(isP ? next : null, isP ? null : next);
    if (isP) { G.profile = G.profile || {}; G.profile.captainName = next; }
    else { G.planet.name = next; }
    toast(isP ? `Tu es désormais ${next}` : `Ta planète s'appelle désormais ${next}`);
    if (typeof saveGame === 'function') saveGame();
  } catch (e) {
    const code = (String(e && e.message || e).match(/[a-z_]+/g) || []).find(c => MP_RENAME_ERRORS[c]);
    toast(code ? MP_RENAME_ERRORS[code] : 'Le registre ne répond pas, réessaie');
  } finally { _sbRenaming = false; }
  if (window.SBCloud && window.SBCloud.renderDash) window.SBCloud.renderDash();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
function sbNotifItems() {
  const out = [];
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '');
  const MP = { defense: 'RAID', flag: 'PAVILLON', diplo: 'DIPLOMATIE', piracy: 'PIRATERIE' };
  (G.reports || []).forEach(r => out.push({ src: 'rep', id: r.id, t: r.returnedAt || r.startedAt || 0, unread: !r.read,
    tag: MP[r.kind] || 'FLOTTE', color: (r.doctrine && r.doctrine.color) || '#5fa8e8',
    title: esc(r.fleetName) + (r.targetName ? ' · ' + esc(r.targetName) : ''), sub: esc(r.intent && r.intent.label) }));
  (G.probeReports || []).forEach(r => { const cfg = (typeof PROBE_TIER_CONFIG !== 'undefined' && PROBE_TIER_CONFIG[r.tier]) || null;
    out.push({ src: 'probe', id: r.id, t: r.createdAt || 0, unread: !r.read, tag: 'SONDE' + (cfg ? ' ' + cfg.label.toUpperCase() : ''),
      color: (cfg && cfg.accent) || '#5fffe8', title: esc(r.targetLabel || r.systemCoord || 'Rapport de sonde'), sub: r.silent ? 'Silence radio' : '' }); });
  (G.tankerReports || []).forEach(r => out.push({ src: 'tanker', id: r.id, t: r.createdAt || 0, unread: !r.read, tag: r.isLost ? 'TANKER PERDU' : 'TANKER',
    color: '#ffc864', title: esc(r.tankerName || 'Tanker') + (r.targetLabel ? ' · ' + esc(r.targetLabel) : ''), sub: '' }));
  (G.beaconReports || []).forEach(r => { const t = r.target || {};
    out.push({ src: 'beacon', id: r.id, t: r.createdAt || 0, unread: !r.read, tag: r.mp ? 'CONVOI JOUEUR' : 'BALISE', color: '#a370ff',
      title: esc(t.name || 'Contact') + (r.systemCoord ? ' · ' + esc(r.systemCoord) : ''), sub: '' }); });
  out.sort((a, b) => (b.t || 0) - (a.t || 0));
  return out.slice(0, 60);
}
function sbNotifUnread() {
  const n = (a) => (a || []).filter(r => !r.read).length;
  return n(G.reports) + n(G.probeReports) + n(G.tankerReports) + n(G.beaconReports);
}
function sbNotifRefresh() {
  const n = sbNotifUnread();
  document.querySelectorAll('.sb-bell').forEach(b => {
    let d = b.querySelector('.sb-bell-n');
    if (!n) { if (d) d.remove(); return; }
    if (!d) { d = document.createElement('span'); d.className = 'sb-bell-n'; b.appendChild(d); }
    d.textContent = n > 99 ? '99+' : n;
  });
}
// PATCH_0711_CONVERSATIONS (retour d'Adrien, 07/11) : « quand un joueur a un tanker en orbite chez moi et qu'il m'écrit,
// une fois son message fermé je ne sais pas où le retrouver » → la cloche liste toutes les conversations ouvertes
function sbConvList() {
  const by = {};
  const add = (addr, pseudo, sub) => { if (!addr) return; const e = by[addr] || (by[addr] = { addr, pseudo: '', subs: [], n: 0, at: 0 }); if (pseudo && !e.pseudo) e.pseudo = pseudo; if (sub && !e.subs.includes(sub)) e.subs.push(sub); return e; };
  try { for (const o of (typeof _mpEmbIn !== 'undefined' ? _mpEmbIn : []) || []) { const e = add(o.address, o.pseudo, 'Son ' + (o.tanker ? 'tanker ' + o.tanker : 'vaisseau') + ' est en orbite chez toi'); if (e) e.at = Math.max(e.at, o.since || 0); } } catch (e) {}
  try { for (const m of (G.tankerMissions || [])) if (m && m.status === 'orbital_relay' && m.mpTarget && m.mpTarget.address) add(m.mpTarget.address, m.mpTarget.pseudo || m.mpTarget.name, 'Ton tanker ' + (m.tankerName || '') + ' est en orbite chez lui'); } catch (e) {}
  try { for (const u of Object.values(typeof _mpChatUnread !== 'undefined' ? _mpChatUnread : {})) { const e = add(u.address, u.pseudo, ''); if (e) { e.n = u.n || 0; e.last = u.last; e.at = Math.max(e.at, Date.parse(u.lastAt) || 0); } } } catch (e) {}
  return Object.values(by).sort((a, b) => (b.n - a.n) || (b.at - a.at));
}
function sbConvCard() {
  const list = sbConvList(); if (!list.length) return '';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div style="margin:0 14px 12px;border:1px solid rgba(95,255,232,.35);border-radius:12px;background:rgba(8,24,28,.6);overflow:hidden">
    <div style="padding:9px 12px 6px;font-size:10px;letter-spacing:.18em;color:#5fffe8">CONVERSATIONS</div>
    ${list.map(c => `<button onclick="sbNotifClose();openEmbassy('${esc(c.addr)}')" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:0;border-top:1px solid rgba(255,255,255,.06);background:none;color:#e6f0ff;text-align:left;font:inherit">
      <span style="font-size:18px">💬</span>
      <span style="flex:1;min-width:0"><span style="display:block;font-weight:600;font-size:13px">${esc(c.pseudo || c.addr)}</span>
      <span style="display:block;font-size:11px;color:#9fb2c2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.n && c.last ? c.last : (c.subs[0] || 'Canal de discussion'))}</span></span>
      ${c.n ? `<span style="min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ff5a48;color:#fff;font-size:11px;line-height:18px;font-weight:600;text-align:center">${c.n}</span>` : '<span style="color:#5fffe8">›</span>'}
    </button>`).join('')}</div>`;
}
function sbNotifClose() { const o = document.getElementById('sb-notif'); if (o) o.remove(); }
function sbNotifOpen() {
  sbNotifClose();
  const items = sbNotifItems();
  const ago = (t) => (t && typeof formatReportTimestamp === 'function') ? formatReportTimestamp(t) : '';
  const o = document.createElement('div');
  o.id = 'sb-notif';
  o.innerHTML = `<div class="sbn-bg" onclick="sbNotifClose()"></div><div class="sbn-sheet">
    <div class="sbn-head"><div class="sbn-title">NOTIFICATIONS</div>
      ${sbNotifUnread() ? '<button class="sbn-all" onclick="sbNotifReadAll()">Tout marquer comme lu</button>' : ''}
      <button class="sbn-x" onclick="sbNotifClose()" aria-label="Fermer">×</button></div>
    ${typeof sbConvCard === 'function' ? sbConvCard() : ''}
    ${window.SBAssist ? SBAssist.card() : ''}
    ${window.SBInvite ? SBInvite.card() : ''}
    <div class="sbn-list">${items.length ? items.map(x => `<div class="sbn-it${x.unread ? ' u' : ''}" onclick="sbNotifGo('${x.src}','${String(x.id).replace(/'/g, '')}')">
      <span class="sbn-dot" style="background:${x.unread ? x.color : 'transparent'}"></span>
      <div class="sbn-b"><div class="sbn-tag" style="color:${x.color}">${x.tag}<span>${ago(x.t)}</span></div>
      <div class="sbn-t">${x.title}</div>${x.sub ? `<div class="sbn-s">${x.sub}</div>` : ''}</div></div>`).join('')
      : '<div class="sbn-empty">Aucun rapport pour l’instant.</div>'}</div></div>`;
  document.body.appendChild(o);
}
function sbNotifReadAll() {
  [G.reports, G.probeReports, G.tankerReports, G.beaconReports].forEach(a => (a || []).forEach(r => { r.read = true; }));
  try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
  if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge();
  sbNotifRefresh(); sbNotifOpen();
}
function sbNotifGo(src, id) {
  sbNotifClose();
  if (src === 'rep') { openReportDetail(id); }
  else if (src === 'probe') {
    const r = (G.probeReports || []).find(x => x.id === id);
    G._rapTab = 'sondes'; if (r && typeof _rapSubOf === 'function') G._rapSub = _rapSubOf({ kind: 'probe', report: r });
    G._expandedProbeReport = id; markProbeReportAsRead(id); openProspectRapports();
  } else if (src === 'tanker') {
    G._rapTab = 'missions'; G._rapMis = 'tankers'; G._expandedTankerReport = id; markTankerReportAsRead(id); openProspectRapports();
  } else if (src === 'beacon') {
    const r = (G.beaconReports || []).find(x => x.id === id);
    G._rapTab = 'missions'; G._rapMis = 'balises';
    if (r && (r.mp || r.line)) markBeaconReportRead(id); else { markBeaconReportRead(id); openProspectRapports(); }
  }
  try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
  setTimeout(sbNotifRefresh, 50);
}

function renderDefenseReportDetail(r) {
  const d = r.defense || {};
  document.getElementById('report-detail-title').textContent = (d.won ? 'RAID REPOUSSÉ' : 'RAID SUBI');
  document.getElementById('report-detail-meta').textContent = `Rapport de défense · ${new Date(r.returnedAt).toLocaleString('fr-FR')}`;
  const el = document.getElementById('report-detail-content');
  if (!el) return;
  const col = d.won ? 'var(--green)' : 'var(--red)';
  const lootRows = ['metal', 'energie', 'cristal'].map(k =>
    `<div class="dash-stat-row"><span class="lbl">${tileInfo(k).label}</span><span class="val" style="color:${(d.loot && d.loot[k]) ? 'var(--red)' : 'var(--mut)'}">${(d.loot && d.loot[k]) ? '−' + fmt(d.loot[k]) : '0'}</span></div>`).join('');
  el.innerHTML = `
    <div style="background:rgba(255,80,64,.04);border:1px solid ${d.won ? 'rgba(126,208,128,.3)' : 'rgba(255,80,64,.3)'};border-radius:10px;padding:18px;margin:0 16px 14px;font-family:'SF Mono',monospace;font-size:12px;line-height:1.7;color:var(--mut)">
      <div style="color:${col};font-size:11px;letter-spacing:.16em;margin-bottom:10px">═══ ${d.won ? 'LA DÉFENSE A TENU' : 'DÉFENSE ENFONCÉE'} ═══</div>
      <div style="color:#e6f0ff;font-size:13px">Assaillant : <strong>${d.attacker || '?'}</strong>${d.attackerAddress ? ` <span style="color:var(--mut)">(${d.attackerAddress})</span>` : ''}</div>
      ${d.fleetName ? `<div>Flotte : ${d.fleetName}</div>` : ''}
      ${d.atk != null ? `<div>Feu orbital : ${fmt(d.atk)} contre ${fmt(d.def)} de défense</div>` : ''}
      ${!d.won ? `<div>${d.landed ? 'Les troupes ennemies ont pris pied au sol.' : d.groundHeld ? 'Ta garnison a repoussé le débarquement : les tankers ennemis n\'ont pillé que depuis l\'orbite.' : 'Aucune troupe n\'a débarqué.'}</div>` : ''}
    </div>
    <div class="dash-section-card" style="margin:0 16px 14px">
      <div style="font-size:10px;letter-spacing:.14em;color:var(--mut);text-transform:uppercase;margin-bottom:6px">Pillage</div>
      ${lootRows}
      ${(() => { const _b = d.lootBase || 0.3, _n = Math.round(((d.lootPct || _b) - _b) * 10); return _n > 0 ? `<div style="font-size:10px;color:#ff8a8a;margin-top:6px">Pillage majoré : jusqu'à ${Math.round(d.lootPct * 100)} %${_n >= 2 ? ' (ennemis déclarés + dernier avertissement)' : ' (ennemis déclarés ou dernier avertissement)'}</div>` : ''; })()}
      <div class="dash-stat-row"><span class="lbl">Bâtiment abîmé</span><span class="val" style="color:${d.damagedName ? 'var(--red)' : 'var(--mut)'}">${d.damagedName || 'aucun'}</span></div>
      ${d.garrisons && d.garrisons.length ? `<div style="font-size:11px;color:#5fffe8;margin-top:8px">⛨ Garnisons alliées au combat : ${d.garrisons.map(x => _esc(x.fleet) + ' de ' + _esc(x.owner) + ' (' + fmt(x.def) + ' def)').join(' · ')}</div>` : ''}
    </div>
    ${_defLossLines(d.losses).length ? `<div class="dash-section-card" style="margin:0 16px 14px">
      <div style="font-size:10px;letter-spacing:.14em;color:var(--mut);text-transform:uppercase;margin-bottom:6px">Pertes de la défense</div>
      ${_defLossLines(d.losses).map(([n, v]) => `<div class="dash-stat-row"><span class="lbl">${n}</span><span class="val" style="color:var(--red)">${v.destroyed ? '−' + v.destroyed + ' détruit' + (v.destroyed > 1 ? 's' : '') : ''}${v.destroyed && v.damaged ? ' · ' : ''}${v.damaged ? '<span style="color:var(--amber)">' + v.damaged + ' endommagé' + (v.damaged > 1 ? 's' : '') + '</span>' : ''}</span></div>`).join('')}
      <div style="font-size:11px;color:var(--mut);margin-top:6px;line-height:1.5">Les unités endommagées ne défendent plus : répare-les depuis leur fiche ; les vaisseaux avariés, au chantier.</div>
    </div>` : ''}
    <div style="margin:0 16px 14px;font-size:11px;color:var(--mut);font-style:italic;line-height:1.6">
      ${d.won ? 'Le registre accorde 12 h de bouclier à ton monde.' : 'Le registre accorde 12 h de bouclier à ton monde. Renforce ta défense planétaire' + (d.damagedName ? ' et lance les secours sanitaires pour réparer ' + d.damagedName + '.' : '.')}
    </div>
    ${d.attackerAddress ? `<div style="margin:0 16px 14px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Répondre à ${d.attacker || 'l\'assaillant'} · un pavillon</div>
      ${d.flagSent ? `<div style="font-size:12px;color:var(--mut);font-style:italic">Pavillon envoyé : « ${(MP_FLAG_BY_KEY[d.flagSent] || {}).label || d.flagSent} »</div>` : _mpFlagChips(`mpFlagAttacker.bind(null,'${r.id}')`)}
    </div>` : ''}`;
  try { if (window.SBBlackmarket && r.mpRaidId) SBBlackmarket.fillRaidFaces(el, r.mpRaidId); } catch (e) {}   // Atelier des logos : le vaisseau d'exception de l'assaillant
}
// ═══ fin MP_RAIDS_V0 ═══


// ═══ MP_DOCKS_V0 — Bar des docks entre commandants (étape 3, 11/10/2026) ═══
// Un tanker amarré (séjour choisi) est inscrit au registre du dock. Les commandants amarrés
// au même dock au même moment se voient, et peuvent conclure UN marché par séjour (D4) :
// troc de ressources (séquestre : l'offre est mise de côté jusqu'à la réponse) ou adresse de colonie.
// Les rumeurs du comptoir viennent des vrais événements de la saison (raids).

// Même destination = même dock pour tous (identifiant canonique, indépendant des docks découverts)
function mpDockIdForMission(m) {
  return 'dock-' + _hashStringDeterministic((m && m.targetCoords) || 'unknown').toString(36);
}

// Ce que le registre doit savoir de mes tankers amarrés
function mpDockPresenceWanted() {
  const out = [];
  const now = Date.now();
  for (const m of G.tankerMissions || []) {
    if (m.kind !== 'route_run' || m.status !== 'docked' || !m.dockStay || !(m.dockStay.endsAt > now)) continue;
    const route = (G.routes || []).find(r => r.id === m.routeId);
    const total = ['metal', 'energie', 'cristal'].reduce((a, k) => a + ((m.cargo && m.cargo[k]) || 0), 0);
    out.push({
      mission_id: m.id,
      dock_id: mpDockIdForMission(m),
      tanker_name: m.tankerName || null,
      provenance: (route && route.originHint) || null,
      cargo_hint: total >= 1500 ? 'lourde' : total > 0 ? 'légère' : 'vide',
      crew_state: (m.crewMood && m.crewMood.physicalState) || 'sobre',
      leaves_at: new Date(m.dockStay.endsAt).toISOString(),
    });
  }
  return out;
}

function _mpResLine(obj) {
  const parts = [];
  for (const k of ['metal', 'energie', 'cristal']) if (obj && obj[k] > 0) parts.push(`${fmt(obj[k])} ${tileInfo(k).label.toLowerCase()}`);
  if (obj && obj.address) parts.push(typeof obj.address === 'string' ? `l'adresse ${obj.address}` : 'l\'adresse de sa colonie');
  return parts.join(' · ') || 'rien';
}
function _mpCanPay(cost) {
  for (const k of ['metal', 'energie', 'cristal']) if ((cost[k] || 0) > ((G.res[k] && G.res[k].v) || 0)) return false;
  return true;
}
function _mpPay(cost, sign, noCap) {
  for (const k of ['metal', 'energie', 'cristal']) {
    const q = Math.max(0, Math.floor(Number(cost && cost[k]) || 0));
    if (!q || !G.res[k]) continue;
    if (sign < 0) G.res[k].v = Math.max(0, G.res[k].v - q);
    else if (noCap) G.res[k].v += q;   // séquestre rendu / marché conclu : dû au joueur, même au-delà du stockage
    else G.res[k].v = Math.min(Math.max(G.res[k].max, G.res[k].v), G.res[k].v + q);
  }
}
function _mpDealTerms(d) {
  const pr = MP_DEAL_PRESETS[d.message_key];
  if (!pr) return null;
  const offer = { ...pr.offer };
  if (offer.address) {
    if (!d.offer || typeof d.offer.address !== 'string' || !/^[A-Z]-[A-Z]-\d{4}-\d{1,2}$/.test(d.offer.address)) return null;
    offer.address = d.offer.address;
  }
  return { offer, ask: { ...pr.ask } };
}
function _mpLedger(id) {
  if (!G.mpDeals) G.mpDeals = {};
  return G.mpDeals[id] || null;
}
function _mpLedgerSet(id, v) {
  if (!G.mpDeals) G.mpDeals = {};
  G.mpDeals[id] = Object.assign({ at: Date.now() }, G.mpDeals[id] || {}, v);
  return G.mpDeals[id];
}
function _mpPruneLedger() {
  if (!G.mpDeals) return;
  const old = Date.now() - 35 * 864e5;
  for (const [k, v] of Object.entries(G.mpDeals)) {
    if (k.startsWith('pending:')) {
      if ((v.at || 0) < Date.now() - 864e5) { if (v.escrow) _mpPay(v.escrow, +1); delete G.mpDeals[k]; }   // jamais confirmé : rendu
    } else if (v.settled && (v.at || 0) < old && (!k.startsWith('orb:') || v.applied)) delete G.mpDeals[k];   // AMBASSADES_1210
  }
}
// Offre envoyée mais app fermée pendant l'attente : on rattache le séquestre au marché retrouvé
function _mpAdoptPending(d) {
  if (!G.mpDeals) return null;
  for (const [k, v] of Object.entries(G.mpDeals)) {
    if (k.startsWith('pending:') && v.to_presence === d.to_presence && v.key === d.message_key) {
      delete G.mpDeals[k];
      return _mpLedgerSet(d.id, { escrow: v.escrow });
    }
  }
  return null;
}
function mpSettleDeal(d, meId) {
  if (!d || !d.id || _mpDealBusy.has(d.id)) return false;
  const role = d.from_id === meId ? 'from' : d.to_id === meId ? 'to' : null;
  if (!role) return false;
  let L = _mpLedger(d.id);
  if (L && L.settled) return false;
  const terms = _mpDealTerms(d);
  const flagged = role === 'from' ? d.from_applied : d.to_applied;
  // modèle inconnu, ou marché déjà appliqué (partie précédente, autre appareil) : rien à payer
  if (!terms || (d.status === 'accepted' && flagged)) { _mpLedgerSet(d.id, { settled: true }); return false; }
  const lateOpen = d.status === 'open' && Date.parse(d.expires_at) + MP_DEAL_GRACE_MS < Date.now();
  if (role === 'from') {
    if (!L) L = _mpAdoptPending(d);
    if (d.status === 'accepted') {
      _mpPay(terms.ask, +1, true);
      _mpLedgerSet(d.id, { settled: true });
      toast(`${d.to_pseudo} a accepté ton marché : +${_mpResLine(terms.ask)}`);
      saveGame();
      return true;
    }
    if (d.status === 'refused' || d.status === 'expired' || d.status === 'cancelled' || lateOpen) {
      const esc = L && L.escrow;
      if (esc) _mpPay(esc, +1, true);
      _mpLedgerSet(d.id, { settled: true });
      if (esc && _mpResLine(esc) !== 'rien') {
        toast(`Marché avec ${d.to_pseudo} ${d.status === 'refused' ? 'refusé' : d.status === 'cancelled' ? 'retiré' : 'expiré'} · ${_mpResLine(esc)} rendus`);
      }
      saveGame();
    }
    return false;
  }
  // role === 'to'
  if (d.status === 'accepted') {
    if (!(L && L.paid)) _mpPay(terms.ask, -1);
    _mpPay(terms.offer, +1, true);
    if (typeof terms.offer.address === 'string' && window.SBMP) window.SBMP.onProbeArrived(terms.offer.address);
    _mpLedgerSet(d.id, { paid: true, settled: true });
    saveGame();
    return true;
  }
  if (d.status !== 'open' || lateOpen) { if (L) _mpLedgerSet(d.id, { settled: true }); }
  return false;
}

// Proposer un marché à un commandant amarré au même dock
async function mpProposeDeal(presenceId, presetKey) {
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  const pr = MP_DEAL_PRESETS[presetKey];
  if (!mission || !pr || !window.SBMP) return;
  const busyKey = 'p:' + presenceId;
  if (_mpDealBusy.has(busyKey)) return;
  const myPresence = window.SBMP.presenceFor(mission.id);
  if (!myPresence) { toast('Ton convoi n\'est pas encore inscrit au registre du dock'); return; }
  const offer = { ...pr.offer };
  if (offer.address) offer.address = mpMyAddressString();
  if (!_mpCanPay(offer)) { toast('Tes stocks ne suffisent pas pour cette offre'); return; }
  _mpDealBusy.add(busyKey);
  // séquestre inscrit AVANT l'appel : une app fermée pendant l'attente ne perd rien
  const pendingKey = 'pending:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  _mpPay(offer, -1);
  _mpLedgerSet(pendingKey, { escrow: offer, to_presence: presenceId, key: presetKey });
  saveGame();
  try {
    const d = await window.SBMP.proposeDeal(myPresence, presenceId, pr.kind, offer, pr.ask, presetKey);
    delete G.mpDeals[pendingKey];
    _mpLedgerSet(d.id, { escrow: offer });
    toast(`Proposition envoyée à ${d.to_pseudo}`);
  } catch (e) {
    const m = String((e && e.message) || e);
    // PATCH_2010_AUDIT — réponse perdue (réseau) : le marché existe peut-être ; le séquestre reste en attente (rattaché à la relève, rendu au bout de 24 h)
    if (/fetch|network|load failed|timeout|abort|connexion/i.test(m)) { saveGame(); toast('Réponse perdue : la proposition sera vérifiée à la prochaine relève'); return; }
    delete G.mpDeals[pendingKey];
    _mpPay(offer, +1, true);
    toast(/already_dealt/.test(m) ? 'Un seul marché par convoi et par séjour'
      : /convoy_gone/.test(m) ? 'Ce convoi a quitté le dock'
      : /not_docked/.test(m) ? 'Ton séjour est terminé'
      : 'Le registre ne répond pas, réessaie');
  } finally {
    _mpDealBusy.delete(busyKey);
  }
  saveGame();
  if (window.SBMP) window.SBMP.refreshDock(mission, true);
  _mpRerenderConvoySheet();
}

// Répondre à un marché reçu (un seul appel à la fois par marché)
async function mpAnswerDeal(dealId, answer) {
  const d = ((window.SBMP && window.SBMP.deals) || []).find(x => x.id === dealId);
  if (!d || _mpDealBusy.has(dealId)) return;
  const terms = _mpDealTerms(d);
  if (!terms) { toast('Offre illisible'); return; }
  if (answer === 'accepted' && !_mpCanPay(terms.ask)) { toast(`Il te manque de quoi payer : ${_mpResLine(terms.ask)}`); return; }
  _mpDealBusy.add(dealId);
  let paidNow = false;
  if (answer === 'accepted' && !(_mpLedger(dealId) || {}).paid) {
    _mpPay(terms.ask, -1);                       // payé avant la réponse, rendu si le registre refuse
    _mpLedgerSet(dealId, { paid: true });
    paidNow = true;
  }
  saveGame();
  try {
    const r = await window.SBMP.answerDeal(dealId, answer);
    d.status = r.status;
    _mpDealBusy.delete(dealId);
    if (r.status === 'accepted') {
      if (mpSettleDeal(r, SBCloud_userId())) await window.SBMP.dealApplied(dealId);
      toast(`Marché conclu avec ${d.from_pseudo} : +${_mpResLine(terms.offer)}`);
    } else {
      if (paidNow) { _mpPay(terms.ask, +1, true); _mpLedgerSet(dealId, { paid: false, settled: true }); }
      toast(r.status === 'expired' ? 'Trop tard : l\'offre a expiré' : 'Offre refusée');
    }
  } catch (e) {
    _mpDealBusy.delete(dealId);
    if (paidNow) { _mpPay(terms.ask, +1, true); _mpLedgerSet(dealId, { paid: false }); }
    toast('Cette offre n\'est plus disponible');
  }
  saveGame();
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (mission && window.SBMP) window.SBMP.refreshDock(mission, true);
}
function SBCloud_userId() { return (window.SBCloud && window.SBCloud.user && window.SBCloud.user.id) || null; }

// Payer le barman : l'adresse d'un commandant qu'on ne connaît pas encore (une fois par séjour)
async function mpBuyBarLead() {
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (!mission || mission.mpLeadBought || !window.SBMP) return;
  if ((G.credits || 0) < MP_BAR_LEAD_COST) { toast(`Le barman veut ${MP_BAR_LEAD_COST} CG`); return; }
  mission.mpLeadBought = true;
  G.credits -= MP_BAR_LEAD_COST;
  const known = [];
  for (const sys of Object.values(G.knownSystems || {})) for (const pl of sys.planets || []) if (pl.isReal) known.push(pl.mpAddress || pl.coord);
  let row = null;
  try { row = await window.SBMP.barLead(known); } catch (e) { row = undefined; }
  if (!row) {
    G.credits += MP_BAR_LEAD_COST;
    mission.mpLeadBought = row === undefined ? false : true;
    toast(row === undefined ? 'Le barman ne répond pas, réessaie' : 'Le barman hausse les épaules : il ne connaît personne que tu ne connaisses déjà. Remboursé.');
  } else {
    const sysKey = String(row.address).split('-').slice(0, 3).join('-');
    mergeRealWorlds(sysKey, [row], { noReport: true });
    toast(`Le barman glisse une adresse : ${row.pseudo} · ${row.address}`);
  }
  saveGame();
  if (typeof renderDockScreen === 'function') renderDockScreen();
}

// Rendu de la section (données en cache ; le registre est relu en arrière-plan)
function _mpAgo(iso) {
  const h = Math.floor((Date.now() - Date.parse(iso)) / 3600000);
  return h < 1 ? 'à l\'instant' : h < 24 ? `il y a ${h} h` : `il y a ${Math.floor(h / 24)} j`;
}
function _mpRumorText(r) {
  const s = r.sector ? ` (secteur ${r.sector})` : '';
  switch (r.kind) {
    case 'raid_victory': return `On raconte que ${r.actor} a pillé ${r.target}${s}. Les quais en parlent encore.`;
    case 'raid_repelled': return `${r.target} a renvoyé la flotte de ${r.actor} dans le vide${s}.`;
    case 'route_legendary': return r.target ? `La route « ${r.target} » de ${r.actor} est devenue légendaire. Les équipages se la disputent.` : `Une route de ${r.actor} est devenue légendaire.`;
    case 'world_growth': return `Le monde de ${r.actor}${r.target ? ` (${r.target})` : ''} grossit vite. Trop vite, disent certains.`;
    case 'convoy_robbed': return `${r.actor} a dévalisé un convoi de ${r.target}${s}. Les marchands doublent leurs escortes.`;
    case 'ambush_repelled': return `Le convoi de ${r.actor} a repoussé l'embuscade de ${r.target}${s}.`;
    case 'pact_signed': return `${r.actor} et ${r.target} ont signé un pacte de non-agression${s}. Reste à voir combien de temps il tiendra.`;
    case 'war_declared': return `${r.actor} a déclaré ${r.target} ennemi${s}. Les deux camps comptent leurs vaisseaux.`;   // PATCH_2110_PAVILLONS
    case 'peace_made': return `${r.actor} et ${r.target} ont fait la paix${s}. Pour combien de temps ?`;
    case 'trade_signed': return `${r.actor} et ${r.target} ont signé un accord commercial${s}. Leurs convois circulent mieux escortés.`;
    case 'pact_broken': return (r.payload && r.payload.reason === 'recall')
      ? `${r.actor} a rappelé son ambassade de chez ${r.target}${s}. Le pacte est rompu.`
      : `${r.actor} a dénoncé son pacte avec ${r.target}${s}. Les quais retiennent leur souffle.`;
    case 'rare_discovery': return r.target ? `${r.actor} aurait trouvé ${r.target}${s}. Personne ne sait encore où.` : `${r.actor} aurait trouvé quelque chose de rare${s}.`;
    // PATCH_1410_MARCHE — les bots du comptoir balancent
    case 'route_betrayal': {
      const why = r.payload && r.payload.reason;
      return why === 'fake' ? `${r.actor} vend des cartes truquées. Demande à ${r.target || 'son dernier client'} où menait la sienne.`
        : why === 'robbed' ? `${r.actor} a vendu une route à ${r.target || 'un capitaine'}… et l'attendait dessus. Le port a saisi sa caution.`
        : `${r.actor} a vendu une route à ${r.target || 'un capitaine'}, puis en a arraché les balises. Ne lui achète rien.`;
    }
    case 'bounty_claimed': return `${r.actor} a touché la prime impériale sur la tête de ${r.target}${s}${r.payload && r.payload.bounty ? ' : ' + fmt(r.payload.bounty) + ' CG' : ''}. Les chasseurs de primes affûtent leurs canons.`;   // PATCH_2210_EMPIRE
    case 'route_sold': return `${r.actor} vend des cartes${r.target ? ` au comptoir de ${r.target}` : ''}. Vraies ou fausses, ça reste à voir.`;
    // PATCH_0211_AMBASSADEUR — la parade fait parler
    case 'envoy_dock': case 'envoy_orbit': {
      const sh = window.SBBlackmarket && SBBlackmarket.ships.find(x => x.id === (r.payload && r.payload.item));
      if (!sh) return '';
      const of = /^[aeiouyàâéèêëîïôöùûü]/i.test(String(r.actor || '')) ? `d'${r.actor}` : `de ${r.actor}`;
      const V = r.kind === 'envoy_dock' ? [
        `${sh.name} ${of} a accosté à ${r.target || 'un port franc'}. Personne n'a osé lui demander de se garer ailleurs.`,
        `${sh.name} ${of} est à quai à ${r.target || 'un port franc'}. Il prend deux places. Personne ne dit rien.`,
        `On a vu ${sh.name} ${of} à ${r.target || 'un port franc'}. Le bar a baissé d'un ton.`,
        `${sh.name} ${of} vient d'arriver à ${r.target || 'un port franc'}. Les dockers ont retrouvé leur politesse.`,
      ] : [
        `${sh.name} ${of} a pris orbite chez quelqu'un. On ne sait pas chez qui. Lui, il le sait.`,
        `${sh.name} ${of} tourne au-dessus d'un monde, en ambassade. Une visite de courtoisie, paraît-il.`,
        `${r.actor} a envoyé ${sh.name} en ambassade. Difficile de refuser de le recevoir.`,
      ];
      return V[Math.abs((r.payload && r.payload.v) || 0) % V.length];
    }
    default: return '';
  }
}
function _renderDockPlayersSection(mission, dock) {
  const mp = window.SBMP;
  const head = (t) => `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;padding:0 2px">${t}</div>`;
  if (!mp || !mp.ready || !mp.ready()) {
    return `<div style="margin-bottom:18px">${head('Commandants à quai')}<div style="font-size:11px;color:var(--mut);font-style:italic;padding:4px 2px">Registre du dock hors de portée pour le moment.</div></div>`;
  }
  if (!mission.dockStay) {
    return `<div style="margin-bottom:18px">${head('Commandants à quai')}<div style="font-size:11px;color:var(--mut);font-style:italic;padding:4px 2px">Choisis la durée du séjour : ton convoi sera inscrit au registre du dock, et tu verras qui d'autre y est amarré.</div></div>`;
  }
  mp.refreshDock(mission);
  const st = mp.dockState(mission.id);
  const myPresence = mp.presenceFor(mission.id);
  const me = SBCloud_userId();
  const deals = (mp.deals || []);
  const incoming = deals.filter(d => d.status === 'open' && d.to_presence === myPresence && Date.parse(d.expires_at) > Date.now());
  let html = '';

  // Offres reçues
  for (const d of incoming) {
    const pr = MP_DEAL_PRESETS[d.message_key] || {};
    html += `
      <div style="margin-bottom:8px;padding:12px 14px;background:rgba(95,168,232,.06);border:1px solid rgba(95,168,232,.35);border-radius:8px">
        <div style="font-size:12px;color:#e6f0ff"><strong>${d.from_pseudo}</strong> te propose un marché</div>
        ${pr.msg ? `<div style="font-size:12px;color:var(--mut);font-style:italic;margin:6px 0;font-family:'Charter','Iowan Old Style',Georgia,serif">« ${pr.msg} »</div>` : ''}
        <div style="font-size:11px;color:var(--text);line-height:1.6">Il donne : <span style="color:#78c88c">${_mpResLine(d.offer)}</span><br>Il demande : <span style="color:#ffc864">${_mpResLine(d.ask)}</span></div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button ${_mpDealBusy.has(d.id) ? 'disabled' : ''} onclick="mpAnswerDeal('${d.id}','accepted')" style="flex:1;padding:9px;background:rgba(120,200,140,.08);border:1px solid rgba(120,200,140,.4);color:#78c88c;border-radius:6px;font-family:inherit;font-size:11px;letter-spacing:.08em;cursor:pointer">ACCEPTER</button>
          <button onclick="mpAnswerDeal('${d.id}','refused')" style="flex:1;padding:9px;background:transparent;border:1px solid var(--border);color:var(--mut);border-radius:6px;font-family:inherit;font-size:11px;letter-spacing:.08em;cursor:pointer">REFUSER</button>
        </div>
      </div>`;
  }

  // Convois de commandants
  const convoys = (st && st.convoys) || [];
  if (!st) {
    html += `<div style="font-size:11px;color:var(--mut);font-style:italic;padding:4px 2px 10px">Lecture du registre du dock…</div>`;
  } else if (!convoys.length) {
    html += `<div style="font-size:11px;color:var(--mut);font-style:italic;padding:4px 2px 10px">Aucun autre commandant amarré ici en ce moment.</div>`;
  } else {
    html += convoys.map(c => {
      const mine = deals.find(d => d.from_presence === myPresence && d.to_presence === c.presence_id);
      const tag = mine ? ({ open: 'offre envoyée', accepted: 'marché conclu', refused: 'offre refusée', expired: 'offre expirée', cancelled: 'offre retirée' }[mine.status] || '') : '';
      const crew = (CREW_PHYSICAL_LABELS[c.crew_state] || CREW_PHYSICAL_LABELS.sobre);
      return `
        <div onclick="openMpConvoySheet('${c.presence_id}')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(95,168,232,.04);border:1px solid rgba(95,168,232,.30);border-radius:6px;cursor:pointer;margin-bottom:6px">
          ${(window.SBBlackmarket && SBBlackmarket.shipThumbHtml(c.tanker_name)) || `<div style="font-size:13px;color:#5fa8e8;width:18px;text-align:center">⚑</div>`}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;color:#e6f0ff;font-weight:600">${c.pseudo}</span>
              <span style="font-size:9px;color:#5fa8e8;letter-spacing:.1em;text-transform:uppercase">Commandant</span>
            </div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.tanker_name || 'Tanker'} · cale ${c.cargo_hint || 'inconnue'} · <span style="color:${crew.color}">${crew.label}</span></div>
          </div>
          <div style="font-size:9px;color:${tag ? '#ffc864' : 'var(--mut)'};text-align:right;white-space:nowrap">${tag}</div>
          <div style="color:var(--mut);font-size:12px">›</div>
        </div>`;
    }).join('');
  }

  // PATCH_1410_MARCHE — cartes au comptoir : routes à vendre / à acheter
  if (window.SBLines && SBLines.dockMarketHtml) html += SBLines.dockMarketHtml(mission);

  // Le barman (piste payante, une par séjour)
  const canLead = !mission.mpLeadBought;
  html += `
    <div onclick="${canLead ? 'mpBuyBarLead()' : ''}" style="margin-top:4px;padding:10px 12px;border:1px dashed ${canLead ? 'rgba(255,200,100,.35)' : 'var(--border)'};border-radius:6px;${canLead ? 'cursor:pointer' : 'opacity:.55'}">
      <div style="font-size:12px;color:${canLead ? '#ffc864' : 'var(--mut)'}">🍸 Payer le barman pour une adresse</div>
      <div style="font-size:10px;color:var(--mut);margin-top:2px">${canLead ? `${MP_BAR_LEAD_COST} CG · un commandant que tu ne connais pas encore` : 'Déjà fait ce séjour'}</div>
    </div>`;

  // Rumeurs réelles
  const rumors = (mp.rumors || []).map(r => ({ r, t: _mpRumorText(r) })).filter(x => x.t).slice(0, 3);
  if (rumors.length) {
    html += `<div style="margin-top:14px">${head('On raconte au comptoir')}` + rumors.map(({ r, t }) =>
      `<div style="font-size:12px;color:#e6f0ff;font-style:italic;line-height:1.6;padding:6px 2px;border-bottom:1px solid var(--border);font-family:'Charter','Iowan Old Style',Georgia,serif">${t} <span style="font-size:10px;color:var(--mut);font-style:normal;font-family:inherit">· ${_mpAgo(r.created_at)}</span></div>`).join('') + `</div>`;
  }

  return `<div style="margin-bottom:18px">${head(`Commandants à quai${convoys.length ? ' · ' + convoys.length : ''}`)}${html}</div>`;
}
function openMpConvoySheet(presenceId) {
  _mpOpenConvoyId = presenceId;
  _mpRerenderConvoySheet();
}
function _mpRerenderConvoySheet() {
  if (!_mpOpenConvoyId) return;
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  const mp = window.SBMP;
  const st = mission && mp ? mp.dockState(mission.id) : null;
  const c = st && (st.convoys || []).find(x => x.presence_id === _mpOpenConvoyId);
  const old = document.getElementById('npc-sheet-modal');
  if (old) old.remove();
  if (!c) { _mpOpenConvoyId = null; return; }
  const myPresence = mp.presenceFor(mission.id);
  const mine = (mp.deals || []).find(d => d.from_presence === myPresence && d.to_presence === c.presence_id);
  const crew = (CREW_PHYSICAL_LABELS[c.crew_state] || CREW_PHYSICAL_LABELS.sobre);
  const left = Math.max(0, Date.parse(c.leaves_at) - Date.now());
  let actions = '';
  if (mine) {
    const lbl = { open: 'Offre envoyée — en attente de sa réponse.', accepted: 'Marché conclu.', refused: 'Il a refusé ton offre.', expired: 'Ton offre a expiré.', cancelled: 'Offre retirée.' }[mine.status] || '';
    actions = `<div style="padding:12px 14px;border:1px solid var(--border);border-radius:8px;font-size:12px;color:#e6f0ff">${lbl}<div style="font-size:10px;color:var(--mut);margin-top:4px">Un seul marché par convoi et par séjour.</div></div>`;
  } else {
    actions = Object.entries(MP_DEAL_PRESETS).map(([key, pr]) => {
      const offer = { ...pr.offer };
      const ok = _mpCanPay(offer);
      return `
        <div ${ok ? `onclick="mpProposeDeal('${c.presence_id}','${key}')"` : ''} style="padding:10px 12px;background:${ok ? 'rgba(255,200,100,.04)' : 'rgba(255,255,255,.02)'};border:1px solid ${ok ? 'rgba(255,200,100,.30)' : 'var(--border)'};border-radius:6px;margin-bottom:6px;${ok ? 'cursor:pointer' : 'cursor:not-allowed'}">
          <div style="font-size:12px;color:${ok ? '#ffc864' : 'var(--mut)'};font-weight:500">${pr.kind === 'info' ? '📍 Donner l\'adresse de ta colonie' : `🤝 ${_mpResLine(pr.offer)} contre ${_mpResLine(pr.ask)}`}</div>
          <div style="font-size:10px;color:var(--mut);font-style:italic;margin-top:3px">« ${pr.msg} »${ok ? '' : ' · stocks insuffisants'}</div>
        </div>`;
    }).join('') + `<div style="font-size:10px;color:var(--mut);font-style:italic;line-height:1.5;margin-top:6px">Ton offre est mise de côté jusqu'à sa réponse. Refus, expiration ou départ d'un des convois : tout t'est rendu.</div>`;
  }
  const modal = document.createElement('div');
  modal.id = 'npc-sheet-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0;margin:0;';
  modal.onclick = (e) => { if (e.target === modal) closeMpConvoySheet(); };
  modal.innerHTML = `
    <div style="background:var(--bg);width:100%;max-width:480px;border-top:1px solid var(--border);border-radius:14px 14px 0 0;padding:20px 18px 24px;font-family:inherit;max-height:90vh;overflow-y:auto;box-shadow:0 -20px 60px rgba(0,0,0,.5)">
      <div style="width:36px;height:3px;background:var(--mut);border-radius:2px;margin:0 auto 16px;opacity:.5"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div style="flex:1;min-width:0">
          <div style="font-size:9px;color:#5fa8e8;letter-spacing:.12em;text-transform:uppercase">Pavillon · Commandant</div>
          <div style="font-size:18px;color:#e6f0ff;font-weight:600;margin-top:2px">${c.pseudo}</div>
        </div>
        <div onclick="closeMpConvoySheet()" style="cursor:pointer;width:32px;height:32px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:14px">×</div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)"><span style="color:var(--mut)">Tanker</span><span style="color:#e6f0ff;font-family:'SF Mono',monospace">${c.tanker_name || '—'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)"><span style="color:var(--mut)">Provenance</span><span style="color:#e6f0ff">${c.provenance || 'inconnue'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)"><span style="color:var(--mut)">Cale</span><span style="color:#e6f0ff">${c.cargo_hint || 'inconnue'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)"><span style="color:var(--mut)">Équipage</span><span style="color:${crew.color};font-style:italic">${crew.label}</span></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px"><span style="color:var(--mut)">Quitte le dock</span><span style="color:#e6f0ff">dans ${_formatDuration(left)}</span></div>
      </div>
      <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Pavillon · 1 par séjour</div>
      ${(mission.mpFlagged || {})[c.presence_id] ? `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;color:#e6f0ff;margin-bottom:14px">Pavillon hissé : « ${(MP_FLAG_BY_KEY[(mission.mpFlagged || {})[c.presence_id]] || {}).label || ''} »</div>`
        : `<div style="margin-bottom:14px">${_mpFlagChips(`mpFlagConvoy.bind(null,'${c.presence_id}')`)}<div style="font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">Un pavillon te présente : il recevra l'adresse de ta colonie.</div></div>`}
      <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Marché · 1 par séjour</div>
      ${actions}
      <button onclick="closeMpConvoySheet()" style="margin-top:18px;width:100%;padding:11px;background:transparent;border:1px solid var(--border);color:var(--mut);border-radius:6px;font-family:inherit;font-size:12px;letter-spacing:.08em;cursor:pointer">FERMER</button>
    </div>`;
  document.body.appendChild(modal);
  try { if (window.SBBlackmarket) SBBlackmarket.fillFlagship(modal, c.presence_id); } catch (e) {}   // Atelier des logos : son vaisseau amiral
}
async function mpFlagConvoy(presenceId, key) {
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (!mission || !window.SBMP) return;
  const mine = window.SBMP.presenceFor(mission.id);
  if (!mine) { toast('Ton convoi n\'est pas encore inscrit au registre du dock'); return; }
  if (!(await _mpConfirmFlag(key))) return;
  try {
    await window.SBMP.sendFlagDock(mine, presenceId, key);
    mission.mpFlagged = Object.assign({}, mission.mpFlagged, { [presenceId]: key });
    toast(`Pavillon « ${(MP_FLAG_BY_KEY[key] || {}).label || key} » hissé`); _mpRelRefreshSoon();
    if (typeof saveGame === 'function') saveGame();
  } catch (e) {
    toast(_mpFlagErr(e));
    if (/already_flagged/.test(String(e && e.message))) mission.mpFlagged = Object.assign({}, mission.mpFlagged, { [presenceId]: '?' });
  }
  _mpRerenderConvoySheet();
}
function closeMpConvoySheet() {
  _mpOpenConvoyId = null;
  const m = document.getElementById('npc-sheet-modal');
  if (m) m.remove();
}
// Appelé par le registre quand de nouvelles données du dock arrivent
function mpOnDockData(missionId) {
  const scr = document.getElementById('scr-dock');
  if (scr && !scr.classList.contains('hidden') && _activeDockMissionId === missionId) {
    renderDockScreen();
    if (_mpOpenConvoyId) _mpRerenderConvoySheet();
  }
}
// ═══ fin MP_DOCKS_V0 ═══

// ─── Helper : ajouter une planète au knownSystems du joueur ───
// Utilisé par les futures résolutions (Sonde Moyenne qui verrouille
// une adresse fixe, espionnage, etc.).
function revealPlanetToPlayer(addr, planetMeta) {
  if (!addr || typeof addr !== 'object') return;
  const sysKey = `${addr.cluster}-${addr.sector}-${addr.system}`;
  const coord = `${sysKey}-${String(addr.planet).padStart(2, '0')}`;

  // Créer le système dans knownSystems s'il n'existe pas
  if (!G.knownSystems[sysKey]) {
    G.knownSystems[sysKey] = {
      cluster: addr.cluster,
      sector: addr.sector,
      system: addr.system,
      planets: [],
      discoveredAt: Date.now(),
      isMine: false,
    };
  }

  // Si la planète est déjà connue, on ne fait rien
  const exists = G.knownSystems[sysKey].planets.find(p => p.coord === coord);
  if (exists) return;

  // Ajouter la planète au système
  const newPlanet = {
    coord,
    cluster: addr.cluster,
    sector: addr.sector,
    system: addr.system,
    index: addr.planet,
    name: planetMeta?.name || 'Monde inexploré',
    type: planetMeta?.type || 'unknown',
    desc: planetMeta?.desc || 'Données partielles',
    playerName: null,
    playerLevel: null,
    report: null,
    isMine: false,
  };

  // Chunk 15/05 — Si un custom name a été persisté pour cette coord, l'appliquer
  try {
    const customNames = (typeof loadPlanetCustomNames === 'function') ? loadPlanetCustomNames() : {};
    if (customNames[coord]) newPlanet.customName = customNames[coord];
  } catch (e) {}

  G.knownSystems[sysKey].planets.push(newPlanet);
} // écrans racines qui reset la stack

function getCurrentScreen() {
  for (const s of document.querySelectorAll('.screen')) {
    if (!s.classList.contains('hidden')) {
      const id = s.id.replace(/^scr-/, '');
      return id;
    }
  }
  return null;
}

function goBack() {
  if (navStack.length === 0) {
    // Pas d'historique → retour à la planète (UIUX V2)
    _doGoto('planet');
    return;
  }
  const prev = navStack.pop();
  _doGoto(prev);
}

function _doGoto(scr) {
  if (scr !== 'ark-mission' && typeof unmountArkMission3D === 'function') unmountArkMission3D();   // PATCH_2110_ARCHE_DEPART
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById('scr-' + scr);
  if (target) {
    target.classList.remove('hidden');
    const sc = target.querySelector('.screen-scroll');
    if (sc) {
      // Reset immédiat
      sc.scrollTop = 0;
      // Reset différé : iOS Safari peut "réveiller" un scroll précédent
      // après un repaint causé par les innerHTML successifs dans renderXxx()
      requestAnimationFrame(() => { sc.scrollTop = 0; });
      // Filet de sécurité ultime (au cas où une image se charge encore plus tard)
      setTimeout(() => { sc.scrollTop = 0; }, 50);
    }
  }
  closeBuildCard();

  // Injection des SVG dans les bannières (one-shot)
  injectBannerIllustration('shipyard-banner-icon', 'shipyard');
  injectBannerIllustration('capital-banner-icon', 'capital');

  if (scr === 'dashboard')      renderDashboard();
  if (scr === 'planet')         renderPlanetMap();
  if (scr === 'shipyard')       renderShipyard();
  if (scr === 'resources')      renderResourcesScreen();
  if (scr === 'prospect')       renderProspectScreen();
  if (scr === 'probe-detail')   renderProbeDetailScreen();
  if (scr === 'universe')       renderUniverseScreen();
  if (scr === 'planet-detail')  renderPlanetDetailScreen();
  if (scr === 'moving-target-detail') renderMovingTargetDetailScreen();
  if (scr === 'defense')        renderDefenseScreen();
  if (scr === 'unit-detail')    renderUnitDetailScreen();
  if (scr === 'capital')        renderCapitalScreen();
  if (scr === 'building-detail') { window._bdFresh = true; renderBuildingDetail(); }   // PATCH_2510_BUNKER : ouverture = haut de fiche, première unité
  if (scr === 'fleet')          renderFleetScreen();
  if (scr === 'fleet-compose')  renderFleetCompose();
  if (scr === 'fleet-detail')   renderFleetDetail();
  if (scr === 'ark-mission')    renderArkMission();   // PATCH_2110_ARCHE_DEPART
  if (scr === 'tanker-compose') renderTankerCompose();  // chunk 15/05 — tanker logistique
  if (scr === 'commerce')       renderCommerceScreen(); // Phase 1 Routes Secrètes — 16/05
  if (scr === 'dock')           renderDockScreen();     // Chunk D Phase 1→2 — 18/05
  if (scr === 'carnet')         renderCarnetScreen();   // D5.2 — Carnet du capitaine 18/05
  if (scr === 'reports')        renderReportsList();
  if (scr === 'report-detail')  renderReportDetail();
  if (scr === 'tech-tree')      renderTechTree();   // 19/05 — Arbre tech

  // Mettre à jour le label "back" si présent dans l'écran cible
  updateBackButtonLabel(scr);
}

// Met à jour le texte du bouton "back" selon ce qu'il y a dans la stack
function updateBackButtonLabel(currentScr) {
  const target = document.getElementById('scr-' + currentScr);
  if (!target) return;
  const backBtns = target.querySelectorAll('footer.actions button.back');
  if (backBtns.length === 0) return;
  // Calculer le label en fonction du précédent dans la stack
  const prev = navStack.length > 0 ? navStack[navStack.length - 1] : 'dashboard';
  const labelMap = {
    dashboard: '← COMMANDEMENT',
    planet: '← MA PLANÈTE',
    shipyard: '← CHANTIER',
    defense: '← DÉFENSE',
    fleet: '← MA FLOTTE',
    capital: '← CENTRE',
    prospect: '← PROSPECTION',
    resources: '← RESSOURCES',
    universe: '← UNIVERS',
  };
  const label = labelMap[prev] || '← RETOUR';
  backBtns.forEach(btn => {
    // Ne modifier que les boutons gérés par le système nav
    // Les boutons avec data-no-auto-label="1" gardent leur label custom (ex: "← ANNULER")
    if (!btn.dataset.noAutoLabel) {
      btn.textContent = label;
    }
  });
}

function injectBannerIllustration(elemId, key) {
  const el = document.getElementById(elemId);
  if (el && !el.dataset.injected) {
    el.innerHTML = getIllustration(key);
    el.dataset.injected = '1';
  }
}

// ─── D5.3 fix : cleanup défensif des modaux orphelins ───
// Sur iOS Safari, un modal en position:fixed qui reste accroché au DOM bloque le scroll
// de la page derrière. Cas vu : screenshot pris au mauvais moment, navigation rapide,
// rerender qui n'a pas pu fermer un modal. On retire tout systématiquement.
function cleanupOrphanModals() {
  const modalIds = [
    'npc-sheet-modal',           // fiche pavillon (D4)
    'exploration-launcher-modal', // launcher exploration (D5.3)
  ];
  for (const id of modalIds) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
  // Reset des states qui pointent vers les modaux
  if (typeof _activeNpcId !== 'undefined') _activeNpcId = null;
  if (typeof _explorationLeadId !== 'undefined') _explorationLeadId = null;
}

// voile de lecture des vues héros 3D : plus on fait défiler la fiche, plus la scène derrière s'assombrit
function updateHeroScrim(scroll) {
  const scr = scroll && scroll.closest && scroll.closest('.screen');
  if (!scr) return;
  const hero = scr.querySelector(':scope > .u3d-hero');
  if (!hero) return;
  if (!hero.querySelector(':scope > .u3d-scrim')) hero.insertAdjacentHTML('beforeend', '<div class="u3d-scrim"></div>');
  const space = scroll.querySelector('.ud-hero-space');
  const h = (space && space.offsetHeight) || scroll.clientHeight * 0.5;
  const v = Math.max(0, Math.min(1, (scroll.scrollTop - h * 0.12) / (h * 0.45)));
  scr.style.setProperty('--hs', v.toFixed(3));
}
// PROSPECTION = ANTENNE (12/10/2026, décision d'Adrien) : comme « pas de chantier orbital → pas d'orbite »,
// pas d'antenne → pas de Centre de prospection. C'est l'antenne terminée qui ouvre la porte.
// Les parties qui ont déjà prospecté (rapports ou missions) restent ouvertes, pour ne rien retirer aux testeurs.
function prospectLocked() {
  const a = (window.SBAntenna && typeof SBAntenna.data === 'function') ? SBAntenna.data() : (G && G.antenna);
  if (!a) return false;                                   // pas d'état d'antenne connu : on ne bloque pas
  if (a.built && !a.building) return false;               // antenne opérationnelle
  if ((G.probeReports || []).length || (G.probeMissions || []).length || (G.tankerMissions || []).length) return false;
  return true;
}

function goto(scr, opts) {
  if (scr !== 'dock' && typeof crownUnmount === 'function') crownUnmount();   // PATCH_1510_CROWN
  if (scr !== 'welcome' && typeof unmountWelcomeHero === 'function') unmountWelcomeHero();   // PATCH_2010_FLUIDITE
  if (typeof st3dSleep === 'function') st3dSleep();   // PATCH_2010_STATION_MEMOIRE : filet de sécurité
  if (typeof crownSpaceClose === 'function') crownSpaceClose();   // PATCH_1510_CROWN_SCENE
  setTimeout(() => { const el = document.getElementById('scr-' + scr); const sc = el && el.querySelector('.screen-scroll'); if (sc) updateHeroScrim(sc); }, 60);
  opts = opts || {};
  // ORBITE = ARMER (10/10/2026) : la construction navale n'existe qu'avec le chantier orbital.
  // Cf. North Star §12 : « pas de chantier orbital → pas de vue orbite ».
  if (scr === 'shipyard' && typeof getShipyardTier === 'function' && getShipyardTier() === 0) {
    if (typeof toast === 'function') toast('Construis le chantier orbital pour accéder à la construction navale');
    scr = 'planet';
  }
  if ((scr === 'prospect' || scr === 'universe') && prospectLocked()) {
    if (typeof toast === 'function') toast("Construis l'antenne de prospection pour capter les premiers signaux");
    scr = 'planet';
    setTimeout(() => { const a = G.antenna; if (a && a.parcel != null && window.Planet3D && Planet3D.ready) Planet3D.focus(a.parcel); }, 300);
  }
  // D5.3 fix scroll bloqué : cleanup proactif des modaux orphelins à chaque navigation.
  // Sur iOS, un modal qui n'a pas été nettoyé bloque le scroll de la page entière.
  // On nettoie systématiquement avant de naviguer.
  cleanupOrphanModals();
  // Redirections (anciens écrans → nouveaux)
  if (scr === 'barracks') scr = 'defense';
  if (scr === 'turret')   scr = 'defense';
  // L'écran 'universe' a été fusionné dans le Centre de prospection (passe 2.4 polish)
  if (scr === 'universe') {
    G.prospectTab = 'univers';
    scr = 'prospect';
  }

  // Gestion de la stack de navigation
  const current = getCurrentScreen();
  if (current && current !== scr) {
    // Si on va vers un hub : reset stack (pas besoin de garder l'historique précédent)
    if (NAV_HUBS.includes(scr)) {
      navStack = [];
    } else if (opts.replace) {
      // REPLACE mode : on ne pousse PAS current dans la stack — c'est un submit/redirection
      // Équivalent de history.replaceState. Utilisé après une création/édition de flotte.
      // (current "disparaît" de l'historique, on ne pourra pas y revenir via goBack)
      // EN PLUS : si la cible est déjà au TOP de la stack (parce qu'on est passé par elle
      // pour arriver sur l'écran courant), on la dépile pour éviter "goBack te ramène sur toi-même"
      while (navStack.length > 0 && navStack[navStack.length - 1] === scr) {
        navStack.pop();
      }
    } else {
      // Ne pas empiler les doublons (anti-boucle)
      if (navStack[navStack.length - 1] !== current) {
        navStack.push(current);
      }
      // Limiter à 10 niveaux pour éviter une stack infinie
      if (navStack.length > 10) navStack.shift();
    }
  }

  _doGoto(scr);
}

/* ═══════════ DASHBOARD ═══════════ */

function renderDashboard() {
  // 19/05 : injection bannière onboarding (si tutoriel actif)
  const onbSlot = document.getElementById('dash-onboarding-slot');
  if (onbSlot && typeof renderOnboardingBanner === 'function') {
    onbSlot.innerHTML = renderOnboardingBanner();
  }

  document.getElementById('dash-meta-line').innerHTML =
    `Empire de ${G.profile?.captainName || 'Capitaine'} <span class="dot"></span> Niv. ${G.empire.level} <span class="dot"></span> 1 planète`;

  // ⚡ V0.5 — Updater le nom de planète dynamique
  const planetNameEl = document.getElementById('dash-planet-name');
  if (planetNameEl) planetNameEl.textContent = G.planet.name || 'KERATH-VII';

  document.getElementById('dash-planet-sub').textContent = `${G.planet.coordString} · Type ${G.planet.type} · Âge de ${G.planet.age}`;
  const prodEntries = Object.entries(G.res).filter(([_,r]) => r.rate > 0);
  document.getElementById('dash-planet-prod').innerHTML = prodEntries.length > 0
    ? prodEntries.map(([k,r]) => {
        const t = tileInfo(k);
        return `<span>${t.label.toLowerCase()} <b>+${rateNum(effRate(k))}/h</b></span>`;
      }).join('')
    : '';

  // Flotte (sonde unique + futurs vaisseaux)
  const fleetBlock = document.getElementById('dash-fleet-block');
  const fleetBadge = document.getElementById('dash-fleet-badge');
  const probe = G.probe;
  const probeStateLabel = !probe.exists
    ? 'Non construite'
    : probe.state === 'ready' ? 'Prête'
    : probe.state === 'mission' ? `En mission · ${probeMissionRemaining()}`
    : 'Inconnu';
  const probeStateColor = !probe.exists ? 'var(--mut)'
    : probe.state === 'ready' ? 'var(--green)'
    : 'var(--amber)';

  // Comptage des vaisseaux militaires (passe 3.1)
  const sumShips = (typeData) => typeData.t1 + typeData.t2 + typeData.t3;
  const tankers = sumShips(G.fleet.stationed.tanker);
  const fregates = sumShips(G.fleet.stationed.fregate);
  const cuirasses = sumShips(G.fleet.stationed.cuirasse);
  const totalMilitary = tankers + fregates + cuirasses;
  const totalShips = (probe.exists ? 1 : 0) + totalMilitary;

  if (totalShips > 0) {
    fleetBadge.style.display = 'inline-block';
    if (probe.exists && probe.state === 'mission') {
      fleetBadge.textContent = 'EN MISSION';
    } else {
      fleetBadge.textContent = `${totalShips} VAISSEAU${totalShips > 1 ? 'X' : ''}`;
    }
    // Lignes : afficher seulement les types présents
    let rows = '';
    if (probe.exists) {
      rows += `<div class="dash-stat-row"><span class="lbl">○ Sonde ${probe.name}</span><span class="val" style="color:${probeStateColor}">${probeStateLabel}</span></div>`;
    }
    if (fregates > 0) rows += `<div class="dash-stat-row"><span class="lbl">◁ Frégates</span><span class="val" style="color:var(--blue)">${fmt(fregates)}</span></div>`;
    if (tankers > 0)  rows += `<div class="dash-stat-row"><span class="lbl">▱ Tankers</span><span class="val" style="color:var(--blue)">${fmt(tankers)}</span></div>`;
    if (cuirasses > 0)rows += `<div class="dash-stat-row"><span class="lbl">◀ Cuirassés</span><span class="val" style="color:var(--blue)">${fmt(cuirasses)}</span></div>`;
    // Ligne récap : total + flèche → (CTA implicite, toute la card est cliquable)
    rows += `<div class="dash-stat-row" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(80,152,255,.18)">
      <span class="lbl" style="color:var(--blue);letter-spacing:.18em;text-transform:uppercase;font-size:10px">Vue d'amiral</span>
      <span class="val" style="color:var(--blue)">→</span>
    </div>`;
    fleetBlock.innerHTML = rows;
  } else {
    fleetBadge.style.display = 'none';
    fleetBlock.innerHTML = `
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:11px;color:var(--mut);font-style:italic;letter-spacing:.04em">Aucune flotte mobilisable</div>
        <div style="font-size:10px;color:var(--mut);margin-top:6px;letter-spacing:.04em">Construis un Chantier naval puis assemble tes vaisseaux</div>
      </div>
    `;
  }

  // Défense — identité ROUGE permanente (décision Adrien : garder la couleur d'identité même si statut OK)
  const defBlock = document.getElementById('dash-defense-block');
  const defBadge = document.getElementById('dash-defense-badge');
  const status = defenseStatus();
  const totalDef = totalDefense();
  const totalUnits = Object.values(G.defense.units).reduce((s, u) => s + u.qty, 0);
  defBadge.textContent = status.label;
  defBadge.classList.toggle('warn', status.level <= 1);
  // La classe warn (rouge) reste TOUJOURS sur le bloc pour son identité visuelle
  // (c'est ce qui faisait respirer le dashboard avant)
  defBlock.classList.add('warn');
  defBlock.innerHTML = `
    <div class="dash-stat-row">
      <span class="lbl">Défense totale</span>
      <span class="val" style="color:${status.color}">${fmt(totalDef)}</span>
    </div>
    <div class="dash-stat-row"><span class="lbl">Unités déployées</span><span class="val">${totalUnits}</span></div>
    <div class="dash-stat-row"><span class="lbl">Statut</span><span class="val" style="color:${status.color}">${status.label}</span></div>
    ${status.level <= 1
      ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,80,64,.2);font-size:10px;color:var(--red);letter-spacing:.04em;line-height:1.5;display:flex;align-items:flex-start;gap:6px">${icon('warning', {size:11, color:'var(--red)', style:'flex-shrink:0;margin-top:1px'})}<span>Ta planète peut être pillée. Mobilise des unités au plus vite.</span></div>`
      : `<div class="dash-stat-row" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,80,64,.15)">
          <span class="lbl" style="color:var(--red);letter-spacing:.18em;text-transform:uppercase;font-size:10px">Défense planétaire</span>
          <span class="val" style="color:var(--red)">→</span>
        </div>`
    }
  `;

  // Univers connu — bloc dashboard sobre (l'image du Centre est dans l'écran, pas ici)
  const uniBlock = document.getElementById('dash-universe-block');
  if (uniBlock) {
    const sysCount = Object.keys(G.knownSystems).length;
    const planetCount = Object.values(G.knownSystems).reduce((s, sys) => s + sys.planets.length, 0);
    const probeMissions = (G.probeMissions || []).filter(m => m.status === 'in_transit');
    const probesInPool = (G.probesPool || []).filter(p => p.state === 'ready').length;

    const missionLine = probeMissions.length > 0
      ? `<div class="dash-stat-row"><span class="lbl">Sondes en mission</span><span class="val" style="color:var(--amber)">${probeMissions.length}</span></div>`
      : '';

    uniBlock.innerHTML = `
      <div class="dash-stat-row">
        <span class="lbl">Mon adresse</span>
        <span class="val" style="font-family:'SF Mono',monospace;color:var(--cyan)">${G.planet.coordString}</span>
      </div>
      <div class="dash-stat-row">
        <span class="lbl">Systèmes connus</span>
        <span class="val">${sysCount}</span>
      </div>
      <div class="dash-stat-row"><span class="lbl">Planètes répertoriées</span><span class="val">${planetCount}</span></div>
      <div class="dash-stat-row"><span class="lbl">Sondes prêtes</span><span class="val" style="color:${probesInPool > 0 ? 'var(--cyan)' : 'var(--mut)'}">${probesInPool}</span></div>
      ${missionLine}
      <div class="dash-stat-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
        <span class="lbl" style="letter-spacing:.18em;text-transform:uppercase;font-size:10px">Centre de prospection</span>
        <span class="val" style="color:var(--cyan)">→</span>
      </div>
    `;
  }

  // Bloc Commerce (passe Phase 1 Routes Secrètes — 16/05)
  // S'affiche/masque tout seul selon présence de tankers
  if (typeof renderCommerceBlockDashboard === 'function') renderCommerceBlockDashboard();
  if (typeof renderCarnetBlockDashboard === 'function') renderCarnetBlockDashboard();

  // ─── Grille ressources en haut (effet AoE2) ───
  renderDashResGrid();

  // Rapports — affiche UN rapport non lu par sonde de retour
  const reportsEl = document.getElementById('dash-reports');
  const unreadReports = collectUnreadReports();
  if (unreadReports.length > 0) {
    reportsEl.className = '';
    reportsEl.innerHTML = unreadReports.map(p => `
      <div onclick="openPlanetDetail('${p.coord}')" style="margin:0 16px 8px;padding:12px 14px;cursor:pointer;background:linear-gradient(180deg,rgba(20,40,38,.55),rgba(10,30,28,.7));border:1px solid rgba(95,255,232,.25);border-radius:12px">
        <div style="font-size:10px;color:var(--cyan);letter-spacing:.22em;text-transform:uppercase">▸ Rapport · ${p.coord}</div>
        <div style="font-size:13px;margin-top:5px;font-weight:600">${getPlanetDisplayName(p)}</div>
      </div>
    `).join('');
  } else {
    reportsEl.className = 'empty-line';
    reportsEl.textContent = 'Aucun rapport non lu';
  }
}

// ─── Grille ressources en haut du dashboard (effet AoE2) ───
function renderDashResGrid() {
  const grid = document.getElementById('dash-res-grid');
  if (!grid) return;
  // AUDIT_1110 — plafond réel de chaque ressource (silos compris)
  const cells = Object.entries(G.res).map(([k, r]) => {
    const t = tileInfo(k);
    const RES_CAP = r.max || 1;
    const pct = Math.min(100, (r.v / RES_CAP) * 100);
    const isFull = r.v >= RES_CAP;
    return `
      <div class="dash-res-cell ${isFull ? 'full' : ''}" onclick="goto('resources')">
        <div class="res-cell-head">
          <span class="res-cell-dot" style="background:${t.color}"></span>
          <span>${t.label}</span>
        </div>
        ${r.rate > 0 ? `<div class="res-cell-rate">+${rateNum(effRate(k))}</div>` : ''}
        <div class="res-cell-val" style="color:${t.color}">${fmt(r.v)}</div>
        <div class="res-cell-cap">/ ${fmt(RES_CAP)}</div>
        <div class="res-cell-bar"><div class="res-cell-fill" style="width:${pct}%;background:${t.color}"></div></div>
      </div>
    `;
  }).join('');
  grid.innerHTML = cells;
}

function mpTidyPlayerReports() {
  let n = 0;
  for (const sys of Object.values(G.knownSystems || {})) {
    for (const pl of sys.planets || []) {
      if (pl && pl.isReal && pl.report && pl.reportSource !== 'probe') {
        delete pl.report; delete pl.reportRead; delete pl.reportTimestamp; n++;
      }
    }
  }
  if (n && typeof saveGame === 'function') { try { saveGame(); } catch (e) {} }
  return n;
}

function collectUnreadReports() {
  const list = [];
  for (const sys of Object.values(G.knownSystems)) {
    for (const p of sys.planets) {
      if (p.report && !p.reportRead) list.push(p);
    }
  }
  return list;
}

function probeMissionRemaining() {
  if (!G.probe.mission) return '—';
  const remaining = Math.max(0, Math.round((G.probe.mission.returnAt - Date.now()) / 1000));
  return formatTime(remaining);
}

/* ═══════════ RESOURCES SCREEN ═══════════ */

function renderResourcesScreen() {
  const html = Object.entries(G.res).map(([key, r]) => {
    const t = tileInfo(key);
    const pct = r.max > 0 ? Math.min(100, r.v / r.max * 100) : 0;
    let info = '';
    if (r.rate > 0 && r.v >= r.max) {
      info = 'Stock plein : la production est en pause. Dépense ou agrandis ton stockage.';
    } else if (r.rate > 0) {
      info = `Production active${skillMult(key) > 1.0001 ? ` (dont +${Math.round((skillMult(key) - 1) * 100)} % · ${(window.SBSkills && SBSkills.prodBy ? SBSkills.prodBy(key) : []).join(', ') || 'skills'})` : ''}. Stock plein dans ${formatTime(Math.round((r.max - r.v) / (effRate(key) / 3600)))}.`;
    } else if (r.v > 0) {
      info = 'Aucune source de production active.';
    } else {
      info = `Construis un bâtiment ${t.label.toLowerCase()} pour produire.`;
    }
    // Chunk polish 15/05 : PNG ressource (style match-3) au lieu d'emoji
    const pngKey = 'res_' + key;
    const resIcon = PNG_ILLUSTRATIONS[pngKey]
      ? `<img src="${PNG_ILLUSTRATIONS[pngKey]}" alt="${t.label}" style="width:32px;height:32px;display:block;flex-shrink:0">`
      : `<span style="font-size:22px">${t.emoji}</span>`;
    if (key === 'biomass' && typeof sbRationPerDay === 'function') {   // PATCH_2210_VIVRES
      const pd = sbRationPerDay();
      info = (G.troopFamine ? '<span style="color:var(--amber)">⚠ Stock vide : tes troupes ont faim (défense des soldats −25 %).</span> ' : '')
        + (pd > 0 ? `Tes troupes mangent ${fmt(pd)} biomasse par jour${r.v > 0 ? (r.v >= pd * 2 ? ` (réserve pour ${Math.floor(r.v / pd)} jours)` : ` (réserve pour ${formatTime(Math.round(r.v / pd * 86400))})`) : ''}. ` : 'Nourrit tes troupes : garde 1 / jour, soldat lourd 3 / jour, les 10 premières rations offertes par la caserne. ')
        + 'Se récolte au match-3.';
    }
    return `
      <div class="res-detail-card">
        <div class="res-detail-head" style="display:flex;align-items:center;gap:10px">
          ${resIcon}
          <span class="res-detail-name" style="color:${t.color};flex:1">${t.label}</span>
          <span class="res-detail-rate ${r.rate > 0 ? '' : 'zero'}">${r.rate > 0 ? `+${rateNum(effRate(key))}/h` : '— inactif'}</span>
        </div>
        <div class="res-detail-bar-wrap">
          <span class="res-detail-val">${fmt(r.v)} <span class="max">/ ${fmt(r.max)}</span></span>
          <div class="res-detail-bar"><div class="res-detail-fill" style="width:${pct.toFixed(1)}%;background:${t.color}"></div></div>
        </div>
        <div class="res-detail-info">${info}</div>
      </div>
    `;
  }).join('');
  document.getElementById('res-detail-list').innerHTML = html;
}

/* ═══════════ FLEET (passe 3.1) — Vue d'amiral ═══════════ */

// Helper unifié — card "Tanker en mission" partagée entre :
// - Flotte > Commandement (Flottes en mission, jaune)
// - Fiche cible mouvante (mtd-actions quand isEngaged)
// Cf. chunk D+ 14/05 : Adrien — "ça peut être la même card vu que c'est
// une mission partagée entre les deux entités, flotte et centre".
// L'illustration tanker.png remplace l'emoji 🚛.
function renderTankerMissionCard(mission, opts) {
  opts = opts || {};
  const m = mission;
  if (!m) return '';
  const validStatuses = ['in_transit', 'returning', 'orbital_relay', 'exploring', 'docked', 'trade_wait'];
  if (!validStatuses.includes(m.status)) return '';
  if (m.status === 'trade_wait') {   // PATCH_2110_COMMERCE
    const margin = opts.inline ? '0' : '0 16px 10px';
    const left = Math.max(0, 12 * 3600e3 - (Date.now() - (m.tradeWaitSince || Date.now())));
    return `<div style="border:1px solid rgba(255,200,100,.40);border-radius:8px;padding:12px 14px;margin:${margin};background:rgba(255,200,100,.05)">
      <div style="display:flex;justify-content:space-between;gap:10px"><span style="font-size:13px;color:#ffc864;font-weight:600">${m.tankerName}</span><span style="font-size:9px;background:rgba(255,200,100,.18);color:#ffc864;padding:1px 6px;border-radius:3px;letter-spacing:.06em">LIVRAISON</span></div>
      <div style="font-size:11px;color:var(--mut);margin-top:6px">Chez ${_esc(m.mpTrade.pseudo)} · ${_mpResLine(m.mpOffered || {})}<br>${m.mpTradeId ? 'attend son paiement' : 'inscription au registre…'} · retour sans réponse dans ${Math.ceil(left / 3600e3)} h au plus</div>
    </div>`;
  }

  const isReturning = m.status === 'returning';
  const isOrbital = m.status === 'orbital_relay';
  const isExploring = m.status === 'exploring';
  const isDocked = m.status === 'docked';

  // ─── D5.3 : Cas exploration (tanker parti sur une piste) ───
  if (isExploring) {
    const margin = opts.inline ? '0' : '0 16px 10px';
    const tankerIcon = m.bmEnvoy && window.SBBlackmarket ? SBBlackmarket.shipThumbHtml(m.tankerName) : PNG_ILLUSTRATIONS.tanker
      ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" onerror="pngFallback(this, 'tanker')">`
      : `${icon('tanker', {size:18})}`;
    const remainingMs = Math.max(0, (m.returnArrivalAt || m.arrivalAt) - Date.now());
    const remainingSec = Math.floor(remainingMs / 1000);
    let etaTxt;
    if (remainingSec === 0) etaTxt = 'Retour imminent';
    else if (remainingSec < 60) etaTxt = `${remainingSec}s`;
    else if (remainingSec < 3600) etaTxt = `${Math.floor(remainingSec / 60)}min ${remainingSec % 60}s`;
    else etaTxt = `${Math.floor(remainingSec / 3600)}h${String(Math.floor((remainingSec % 3600) / 60)).padStart(2, '0')}`;
    const totalMs = (m.returnArrivalAt || m.arrivalAt) - m.departedAt;
    const pct = totalMs > 0 ? Math.min(100, ((totalMs - remainingMs) / totalMs) * 100) : 0;
    return `
      <div style="display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(200,180,120,.40);border-radius:8px;padding:12px 14px;margin:${margin};background:rgba(200,180,120,.05)">
        <div class="hangar-icon" style="color:#c8b478">${tankerIcon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;color:#c8b478;font-weight:600">${m.tankerName}</span>
              <span style="font-size:9px;background:rgba(200,180,120,.18);color:#c8b478;padding:1px 6px;border-radius:3px;letter-spacing:.06em">EXPLORATION</span>
            </div>
            <span style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${etaTxt}</span>
          </div>
          <div style="font-family:'SF Mono',monospace;font-size:10px;color:var(--mut);margin-bottom:6px;letter-spacing:.04em">📍 ${m.leadTitle || 'piste inconnue'}</div>
          <div style="height:3px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:#c8b478;transition:width 0.3s"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── D2 : Cas docked (tanker en séjour au dock) ───
  if (isDocked) {
    const margin = opts.inline ? '0' : '0 16px 10px';
    const tankerIcon = m.bmEnvoy && window.SBBlackmarket ? SBBlackmarket.shipThumbHtml(m.tankerName) : PNG_ILLUSTRATIONS.tanker
      ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" onerror="pngFallback(this, 'tanker')">`
      : `${icon('tanker', {size:18})}`;
    const dockName = m.dock?.name || 'dock inconnu';
    let stayLabel = 'au quai';
    if (m.dockStay) {
      const remaining = Math.max(0, m.dockStay.endsAt - Date.now());
      if (remaining > 0) {
        const h = Math.floor(remaining / 3600000);
        const days = Math.floor(h / 24);
        stayLabel = days > 0 ? `reste ${days}j ${h % 24}h` : h > 0 ? `reste ${h}h` : `< 1h`;
      } else {
        stayLabel = 'séjour terminé';
      }
    }
    return `
      <div onclick="openDockFromFleet('${m.id}')" style="display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(120,200,140,.40);border-radius:8px;padding:12px 14px;margin:${margin};background:rgba(120,200,140,.05);cursor:pointer">
        <div class="hangar-icon" style="color:#78c88c">${tankerIcon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;color:#78c88c;font-weight:600">${m.tankerName}</span>
              <span style="font-size:9px;background:rgba(120,200,140,.18);color:#78c88c;padding:1px 6px;border-radius:3px;letter-spacing:.06em">AU QUAI</span>
            </div>
            <span style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${stayLabel}</span>
          </div>
          <div style="font-family:'SF Mono',monospace;font-size:10px;color:var(--mut);letter-spacing:.04em">⚓ ${dockName}</div>
        </div>
      </div>
    `;
  }

  // ─── Cas orbital_relay : tanker stationné en orbite, pas d'ETA ───
  // Affichage différent : pas de barre de progression, statut "EN ORBITE",
  // action "Rappeler le tanker" plutôt qu'"Annuler la mission".
  if (isOrbital) {
    const margin = opts.inline ? '0' : '0 16px 10px';
    const clickable = !opts.inline;
    const onclickAttr = clickable ? (m.mpTarget && m.mpTarget.address ? `onclick="openEmbassy('${m.mpTarget.address}')"` : `onclick="openPlanetDetail('${m.destinationPlanetCoord || m.targetCoords}')"`) : '';
    const cursorStyle = clickable ? 'cursor:pointer;' : '';

    const tankerIcon = m.bmEnvoy && window.SBBlackmarket ? SBBlackmarket.shipThumbHtml(m.tankerName) : PNG_ILLUSTRATIONS.tanker
      ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" onerror="pngFallback(this, 'tanker')">`
      : `${icon('tanker', {size:18})}`;

    // Durée en orbite (calculée depuis l'arrivée à destination)
    const orbitElapsedMs = Date.now() - (m.arrivalAt || Date.now());
    const orbitElapsedMin = Math.floor(orbitElapsedMs / 60000);
    const orbitLabel = orbitElapsedMin < 60
      ? `en orbite depuis ${orbitElapsedMin}min`
      : orbitElapsedMin < 1440
        ? `en orbite depuis ${Math.floor(orbitElapsedMin / 60)}h`
        : `en orbite depuis ${Math.floor(orbitElapsedMin / 1440)}j`;

    const destTxt = m.destinationPlanetName || m.destinationPlanetCoord || m.targetCoords || '—';

    return `
      <div ${onclickAttr} style="display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(255,200,100,.40);border-radius:8px;padding:12px 14px;margin:${margin};background:rgba(255,200,100,.05);${cursorStyle}">
        <div class="hangar-icon" style="color:#ffc864">${tankerIcon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;color:#ffc864;font-weight:600">${m.tankerName}</span>
              <span style="font-size:9px;background:rgba(95,204,138,.18);color:#5fcc8a;padding:1px 6px;border-radius:3px;letter-spacing:.06em">EN ORBITE</span>
            </div>
            <span style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${orbitLabel}</span>
          </div>
          <div style="font-family:'SF Mono',monospace;font-size:10px;color:var(--mut);margin-bottom:6px;letter-spacing:.04em">⊙ ${destTxt}</div>
          ${m.mpTarget ? (() => { const _k = mpPactWith(m.mpTarget.address); const _r = (m.cargo && m.cargo.resources) || {}; const _c = m.mpCargoDelivered ? 'cale livrée' : _mpCargoSum(_r) > 0 ? (m.mpCargoRefused ? 'cale refusée' : 'cale offerte') : 'présence'; return `<div style="font-size:10px;color:#5fffe8;margin-bottom:6px">Ambassade chez ${m.mpTarget.pseudo} · ${_c}${_k && _k.status === 'active' ? ' · <span style="color:var(--green)">pacte actif</span>' : _k ? ' · pacte proposé' : ''} · 💬 discuter${_mpChatBadge(m.mpTarget.address)}</div>`; })() : ''}
          <button onclick="event.stopPropagation();recallOrbitalTanker('${m.id}')"
                  style="margin-top:4px;width:100%;padding:7px 10px;background:transparent;border:1px solid rgba(255,200,100,.35);color:#ffc864;font-size:10px;letter-spacing:.12em;text-transform:uppercase;border-radius:5px;cursor:pointer;font-family:inherit">
            Rappeler le tanker
          </button>
        </div>
      </div>
    `;
  }

  // Pour returning : on prend returnArrivalAt comme cible
  const arrivalAt = isReturning ? m.returnArrivalAt : m.arrivalAt;
  const remainingMs = Math.max(0, arrivalAt - Date.now());
  const remainingSec = Math.floor(remainingMs / 1000);
  let etaTxt;
  if (remainingSec === 0) etaTxt = isReturning ? 'Arrivée imminente' : 'Retour imminent';
  else if (remainingSec < 60) etaTxt = `${remainingSec}s`;
  else if (remainingSec < 3600) etaTxt = `${Math.floor(remainingSec / 60)}min ${remainingSec % 60}s`;
  else etaTxt = `${Math.floor(remainingSec / 3600)}h${String(Math.floor((remainingSec % 3600) / 60)).padStart(2, '0')}`;

  const targetTxt = m.knownTargetCoordKey || m.targetCoords || '—';
  // Pour returning, le total est returnArrivalAt - cancelledAt
  const totalMs = isReturning
    ? (m.returnArrivalAt - (m.cancelledAt || m.returnDepartedAt || m.arrivalAt || m.departedAt))
    : (m.arrivalAt - m.departedAt);
  const elapsedMs = totalMs - remainingMs;
  const pct = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;

  // inline=true → utilisé dans mtd-actions (déjà dans un container avec padding 0 16px)
  // inline=false → utilisé dans Flotte (gère ses propres marges horizontales)
  const margin = opts.inline ? '0' : '0 16px 10px';
  // Click vers la fiche cible mouvante — désactivé en mode inline (on EST déjà sur cette fiche)
  // Désactivé aussi pour les missions returning (on rentre vers la planète, pas vers la cible)
  const clickable = !opts.inline && !!m.knownTargetCoordKey && !isReturning;
  const onclickAttr = clickable ? `onclick="openMovingTargetDetail('${m.knownTargetCoordKey}')"` : '';
  const cursorStyle = clickable ? 'cursor:pointer;' : '';

  // Illustration tanker (chunk D+ 14/05) — réutilise la classe .hangar-icon (44x44)
  const tankerIcon = m.bmEnvoy && window.SBBlackmarket ? SBBlackmarket.shipThumbHtml(m.tankerName) : PNG_ILLUSTRATIONS.tanker
    ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" onerror="pngFallback(this, 'tanker')">`
    : `${icon('tanker', {size:18})}`;

  // Status badge et direction selon état
  const statusBadge = isReturning
    ? `<span style="font-size:9px;background:rgba(95,255,232,.15);color:#5fffe8;padding:1px 6px;border-radius:3px;letter-spacing:.06em">${m.cancelledAt ? 'DEMI-TOUR' : 'RETOUR'}</span>`
    : `<span style="font-size:9px;background:rgba(255,200,100,.15);color:#ffc864;padding:1px 6px;border-radius:3px;letter-spacing:.06em">EN MISSION</span>`;
  const directionTxt = isReturning ? `← ${G.planet?.name || 'KERATH-VII'}` : `→ ${targetTxt}`;
  const barColor = isReturning ? '#5fffe8' : '#ffc864';

  return `
    <div ${onclickAttr} style="display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(255,200,100,.40);border-radius:8px;padding:12px 14px;margin:${margin};background:rgba(255,200,100,.05);${cursorStyle}">
      <div class="hangar-icon" style="color:#ffc864">${tankerIcon}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span style="font-size:13px;color:#ffc864;font-weight:600">${m.tankerName}</span>
            ${statusBadge}
          </div>
          <span style="font-size:11px;color:#ffc864;font-family:'SF Mono',monospace">${etaTxt}</span>
        </div>
        <div style="font-family:'SF Mono',monospace;font-size:10px;color:var(--mut);margin-bottom:6px;letter-spacing:.04em">${directionTxt}</div>
        <div style="height:2px;background:rgba(255,255,255,.05);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct.toFixed(1)}%;background:${barColor};transition:width .3s"></div>
        </div>
        ${!isReturning ? `
          <button onclick="event.stopPropagation();cancelTankerMission('${m.id}')"
                  style="margin-top:10px;width:100%;padding:7px 10px;background:transparent;border:1px solid rgba(255,80,64,.35);color:var(--red);font-size:10px;letter-spacing:.12em;text-transform:uppercase;border-radius:5px;cursor:pointer;font-family:inherit">
            Annuler la mission
          </button>
        ` : ''}
        ${opts.inline && _isDevMode() ? `
          <button onclick="event.stopPropagation();cheatReturnThisTanker('${m.id}')"
                  style="margin-top:6px;width:100%;padding:6px 10px;background:transparent;border:1px dashed rgba(255,200,100,.35);color:#ffc864;font-size:10px;letter-spacing:.08em;border-radius:5px;cursor:pointer;opacity:.7;font-family:inherit">
            ${icon('settings', {size:11})} CHEAT — Faire revenir maintenant
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderFleetScreen() {
  // Chunk polish 15/05 (post-feedback) : s'assurer que le ticker UI tourne
  // si on a au moins une mission tanker en cours (in_transit ou returning).
  // Sinon les cards affichent un timer figé jusqu'au prochain refresh manuel.
  if ((G.tankerMissions || []).some(m => m.status === 'in_transit' || m.status === 'returning')) {
    if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  }
  // Stats globales — basées sur le total stationné (incluant réservé)
  const stationed = G.fleet.stationed;
  let totalShips = 0, totalAtk = 0, totalDef = 0, totalCargo = 0, totalCap = 0;
  // Compte aussi les vaisseaux réservés dans les flottes préparées
  let reservedShips = 0;
  for (const prep of G.fleet.prepared) {
    for (const sk of ['tanker', 'fregate', 'cuirasse']) {
      for (let t = 1; t <= 3; t++) {
        reservedShips += prep.composition?.[sk]?.['t' + t] || 0;
      }
    }
  }
  const types = ['tanker', 'fregate', 'cuirasse'];
  for (const shipKey of types) {
    for (let tier = 1; tier <= 3; tier++) {
      const qty = stationed[shipKey]['t' + tier] || 0;
      if (qty === 0) continue;
      totalShips += qty;
      const td = SHIP_TIERS[shipKey]?.[tier];
      if (!td) continue;
      totalAtk += qty * (td.atk || 0);
      totalDef += qty * (td.def || 0);
      totalCargo += qty * (td.cargo || 0);
      totalCap += qty * (td.transportCap || 0);
    }
  }
  // Sonde
  const hasProbe = G.probe.exists;
  if (hasProbe) totalShips += 1;

  const statsEl = document.getElementById('fleet-stats');
  if (statsEl) {
    const reservedLine = reservedShips > 0
      ? `<div class="dash-stat-row"><span class="lbl">Réservés (flottes prêtes)</span><span class="val" style="color:var(--blue)">${reservedShips}</span></div>`
      : '';
    statsEl.innerHTML = `
      <div class="dash-section-card" style="margin:0;padding:14px">
        <div class="dash-stat-row"><span class="lbl">Total vaisseaux</span><span class="val">${totalShips}</span></div>
        ${reservedLine}
        ${totalAtk > 0 ? `<div class="dash-stat-row"><span class="lbl">Puissance attaque</span><span class="val" style="color:var(--red)">${fmt(totalAtk)}</span></div>` : ''}
        ${totalDef > 0 ? `<div class="dash-stat-row"><span class="lbl">Puissance défense</span><span class="val" style="color:var(--cyan)">${fmt(totalDef)}</span></div>` : ''}
        ${totalCargo > 0 ? `<div class="dash-stat-row"><span class="lbl">Capacité cargo</span><span class="val" style="color:var(--amber)">${fmt(totalCargo)}</span></div>` : ''}
        ${totalCap > 0 ? `<div class="dash-stat-row"><span class="lbl">Capacité soldats</span><span class="val">${fmt(totalCap)}</span></div>` : ''}
      </div>
    `;
  }

  // État du bouton "Composer une flotte"
  const composeBtn = document.getElementById('fleet-compose-cta');
  if (composeBtn) {
    const militaryShips = totalShips - (hasProbe ? 1 : 0);
    const canCompose = militaryShips > 0 && G.fleet.prepared.length < 5;
    composeBtn.disabled = !canCompose;
    if (militaryShips === 0) {
      composeBtn.textContent = 'Aucun vaisseau militaire';
    } else if (G.fleet.prepared.length >= 5) {
      composeBtn.textContent = 'Max 5 flottes préparées';
    } else {
      composeBtn.textContent = 'Composer une flotte';
    }
  }

  // ─── Bannière Rapports de mission (passe 3.3) ───
  const reportsBanner = document.getElementById('fleet-reports-banner');
  if (reportsBanner) {
    const reports = G.reports || [];
    const unread = reports.filter(r => !r.read).length;
    if (reports.length === 0) {
      reportsBanner.style.display = 'none';
      reportsBanner.innerHTML = '';
    } else {
      reportsBanner.style.display = 'block';
      const isUnread = unread > 0;
      reportsBanner.innerHTML = `
        <div onclick="openReportsList()" style="background:linear-gradient(180deg, ${isUnread ? 'rgba(80,55,15,.5)' : 'rgba(40,40,40,.35)'}, ${isUnread ? 'rgba(50,35,10,.7)' : 'rgba(25,25,25,.55)'});border:1.5px solid ${isUnread ? 'rgba(255,192,96,.5)' : 'rgba(120,120,120,.25)'};border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;${isUnread ? 'box-shadow:0 0 12px rgba(255,192,96,.2);animation:ignite1Pulse 2.8s ease-in-out infinite' : ''}">
          <div style="font-size:22px;color:${isUnread ? 'var(--amber)' : 'var(--mut)'};display:flex;align-items:center;justify-content:center">${icon('satellite', {size:22})}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:${isUnread ? 'var(--amber)' : 'var(--txt)'};letter-spacing:.04em">Rapports de mission</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">${reports.length} rapport${reports.length > 1 ? 's' : ''}${unread > 0 ? ` · <span style="color:var(--amber)">${unread} non lu${unread > 1 ? 's' : ''}</span>` : ''}</div>
          </div>
          <div style="font-size:18px;color:${isUnread ? 'var(--amber)' : 'var(--mut)'}">→</div>
        </div>
      `;
    }
  }

  // ─── Section Flottes préparées ───
  const prepLabel = document.getElementById('fleet-prepared-section-label');
  const prepList = document.getElementById('fleet-prepared-list');
  const prepBadge = document.getElementById('fleet-prepared-count-badge');
  if (G.fleet.prepared.length > 0) {
    prepLabel.style.display = '';
    if (prepBadge) {
      prepBadge.style.display = '';
      prepBadge.textContent = `${G.fleet.prepared.length} / 5`;
    }
    let prepHtml = '';
    for (const fleet of G.fleet.prepared) {
      if (!_sbMine(fleet)) continue;   // PATCH_2010_FLOTTES : les flottes des autres planètes s'affichent sur leur planète
      // Calc stats rapides
      let nShips = 0, nAtk = 0, nDef = 0;
      for (const sk of ['tanker', 'fregate', 'cuirasse']) {
        for (let t = 1; t <= 3; t++) {
          const qty = fleet.composition[sk]['t' + t];
          if (qty === 0) continue;
          nShips += qty;
          const td = SHIP_TIERS[sk]?.[t];
          if (!td) continue;
          nAtk += qty * (td.atk || 0);
          nDef += qty * (td.def || 0);
        }
      }
      const nSoldiers = fleet.soldiers.garde + fleet.soldiers.lourd;
      nAtk += fleet.soldiers.garde * (DEFENSE_UNITS.garde?.atkPerUnit || 0) + fleet.soldiers.lourd * (DEFENSE_UNITS.lourd?.atkPerUnit || 0);
      nDef += fleet.soldiers.garde * (DEFENSE_UNITS.garde?.defPerUnit || 0) + fleet.soldiers.lourd * (DEFENSE_UNITS.lourd?.defPerUnit || 0);

      const status = fleet.status || 'prepared';
      const isDeployed = status === 'deployed';
      const isInMission = status === 'in_mission';
      // Visuel adapté à l'état : préparée = bleu marine sombre, déployée = bleu clair, en mission = bleu ultra-clair
      // Doctrine couleur (passe 3.2/3.3) : nuance progressive dans la famille bleue, le cyan reste réservé à la nav
      let rowExtraClass = '';
      if (isDeployed) rowExtraClass = ' deployed';
      else if (isInMission) rowExtraClass = ' in-mission';

      const iconColor = isInMission ? '#e6f0ff' : (isDeployed ? 'var(--blue-light)' : 'var(--blue)');
      const iconHtml = `<div style="width:20px;height:20px;color:${iconColor}">${(isDeployed || isInMission) ? svgFleetWings(iconColor) : svgFleetAnchor(iconColor)}</div>`;

      let statusBadge = '';
      if (isInMission) {
        statusBadge = `<span style="display:inline-block;background:rgba(230,240,255,.12);border:1px solid rgba(230,240,255,.45);color:#e6f0ff;padding:1px 6px;border-radius:3px;font-size:9px;font-family:'SF Mono',monospace;letter-spacing:.06em;margin-left:6px">EN MISSION</span>`;
      } else if (isDeployed) {
        statusBadge = `<span style="display:inline-block;background:rgba(184,208,255,.12);border:1px solid rgba(184,208,255,.4);color:var(--blue-light);padding:1px 6px;border-radius:3px;font-size:9px;font-family:'SF Mono',monospace;letter-spacing:.06em;margin-left:6px">EN ORBITE</span>`;
      }

      // Doctrine détectée — affichée discrètement sur la card
      const doctrine = detectFleetDoctrine(fleet.composition, fleet.soldiers);
      const doctrineLine = doctrine
        ? `<div style="font-size:10px;color:${doctrine.color};font-style:italic;margin-top:2px;letter-spacing:.02em">${renderIcon(doctrine.icon, {size:11})} ${doctrine.name}</div>`
        : '';

      // Mission en cours : ligne dédiée avec timer
      let missionLine = '';
      if (isInMission && fleet.ambush) {   // PIRATERIE_1210
        missionLine = `<div style="font-size:10px;color:#a370ff;margin-top:3px;font-family:'SF Mono',monospace">⌖ Embuscade ${fleet.ambush.system} · ${_mpAmbushPhaseText(fleet)}${_mpCargoSum(fleet.ambush.hold) > 0 ? ' · ' + _mpResLine(fleet.ambush.hold) + ' en cale' : ''}</div>`;
      } else if (isInMission && fleet.garrison) {   // PATCH_2110_GARNISON
        missionLine = `<div style="font-size:10px;color:#5fffe8;margin-top:3px;font-family:'SF Mono',monospace">⛨ ${_mpGarPhaseText(fleet)}</div>`;
      } else if (isInMission && fleet.missionTargetId) {
        const target = getFakeTarget(fleet.missionTargetId);
        const remaining = fleet.missionEndsAt ? Math.max(0, fleet.missionEndsAt - Date.now()) : 0;
        missionLine = `<div style="font-size:10px;color:#e6f0ff;margin-top:3px;font-family:'SF Mono',monospace">→ ${target ? target.name : '—'} · retour dans <span data-mission-timer="${fleet.id}">${formatMissionTimer(remaining)}</span></div>`;
      }

      prepHtml += `
        <div class="fleet-prepared-row${rowExtraClass}" onclick="openFleetDetail('${fleet.id}')">
          <div class="fleet-prepared-icon">${iconHtml}</div>
          <div class="fleet-prepared-info">
            <div class="fleet-prepared-name">${fleet.name}${statusBadge}</div>
            ${doctrineLine}
            ${missionLine}
            <div class="fleet-prepared-stats">${nShips} vaisseau${nShips > 1 ? 'x' : ''}${nSoldiers > 0 ? ` · ${nSoldiers} soldats` : ''} · <span style="color:var(--red)">${fmt(nAtk)} atk</span> · <span style="color:var(--cyan)">${fmt(nDef)} def</span></div>
          </div>
          <div class="fleet-prepared-arrow">→</div>
        </div>
      `;
    }
    prepList.innerHTML = prepHtml;

    // Démarrer le timer global si au moins une flotte est en mission
    if (G.fleet.prepared.some(f => (f.status || 'prepared') === 'in_mission')) {
      startMissionTimerLoop();
    }
  } else {
    prepLabel.style.display = 'none';
    if (prepBadge) prepBadge.style.display = 'none';
    prepList.innerHTML = '';
  }

  try { renderArkMissionRows(); } catch (e) {}   // PATCH_2110_ARCHE_DEPART
  // Liste stationnée (hangar) — affiche le DISPONIBLE (= stationné - réservé)
  const listEl = document.getElementById('fleet-stationed-list');
  if (listEl) {
    if (totalShips === 0) {
      listEl.innerHTML = `<div class="empty-line">Aucun vaisseau dans la flotte. Va au Chantier orbital pour construire.</div>`;
    } else {
      let html = '';
      // Sonde en premier (si présente)
      if (hasProbe) {
        const stateLabel = G.probe.state === 'ready' ? 'Prête' : G.probe.state === 'mission' ? `En mission · ${probeMissionRemaining()}` : G.probe.state;
        const stateColor = G.probe.state === 'ready' ? 'var(--green)' : 'var(--amber)';
        html += `
          <div class="hangar-row" style="cursor:default">
            <div class="hangar-icon" style="color:var(--cyan)">${getIllustration('probe')}</div>
            <div class="hangar-info">
              <div class="hangar-name">${G.probe.name} <span style="color:var(--mut);font-weight:400">· Sonde</span></div>
              <div class="hangar-stats" style="color:${stateColor}">${stateLabel}</div>
            </div>
          </div>
        `;
      }
      // Vaisseaux militaires
      for (const shipKey of types) {
        const meta = SHIP_UNITS[shipKey];
        const counts = stationed[shipKey];
        const totalType = counts.t1 + counts.t2 + counts.t3;
        if (totalType === 0) continue;
        // Calcul du réservé par type
        let typeReserved = 0;
        for (const prep of G.fleet.prepared) {
          typeReserved += (prep.composition[shipKey].t1 || 0) + (prep.composition[shipKey].t2 || 0) + (prep.composition[shipKey].t3 || 0);
        }
        const available = totalType - typeReserved;

        let agAtk = 0, agDef = 0, agCargo = 0, agCap = 0;
        for (let tier = 1; tier <= 3; tier++) {
          const td = SHIP_TIERS[shipKey]?.[tier];
          if (!td) continue;
          const qty = counts['t' + tier];
          agAtk += qty * (td.atk || 0);
          agDef += qty * (td.def || 0);
          agCargo += qty * (td.cargo || 0);
          agCap += qty * (td.transportCap || 0);
        }
        const tierBreakdown = [1, 2, 3].map(t => {
          const qty = counts['t' + t];
          if (qty === 0) return '';
          return `<span class="hangar-tier-pill tier-t${t}">T${t} × ${qty}</span>`;
        }).filter(Boolean).join(' ');
        // Indication "disponibles vs réservés" si flotte préparée
        const availabilityNote = typeReserved > 0
          ? ` <span style="color:var(--blue);font-size:9px;font-family:'SF Mono',monospace">· ${available} dispo / ${typeReserved} réservés</span>`
          : '';
        html += `
          <div class="hangar-row" onclick="openUnitDetail('${shipKey}', 'ship')">
            <div class="hangar-icon" style="color:var(--cyan)">${PNG_ILLUSTRATIONS[shipKey] ? `<img src="${PNG_ILLUSTRATIONS[shipKey]}" alt="${meta.name}" onerror="pngFallback(this, '${shipKey}')">` : meta.icon}</div>
            <div class="hangar-info">
              <div class="hangar-name">${meta.name} <span style="color:var(--mut);font-weight:400">× ${totalType}</span>${availabilityNote}</div>
              <div class="hangar-tiers">${tierBreakdown}</div>
              <div class="hangar-stats">
                ${agAtk > 0 ? `<span style="color:var(--red)">${fmt(agAtk)} atk</span>` : ''}
                ${agDef > 0 ? ` · <span style="color:var(--cyan)">${fmt(agDef)} def</span>` : ''}
                ${agCargo > 0 ? ` · <span style="color:var(--amber)">${fmt(agCargo)} cargo</span>` : ''}
                ${agCap > 0 ? ` · <span style="color:var(--mut)">${fmt(agCap)} sold.</span>` : ''}
              </div>
            </div>
            <div class="def-comp-arrow">→</div>
          </div>
        `;
      }
      listEl.innerHTML = html;
    }
  }

  // Flottes actives (passe 3.3 — placeholder pour l'instant)
  // PASSE 5.4 fix — Inclure aussi les missions tanker en cours (couleur jaune)
  const activeLabel = document.getElementById('fleet-active-section-label');
  const activeList = document.getElementById('fleet-active-list');

  const activeFleets = G.fleet.active || [];
  // Inclure orbital_relay : le tanker en orbite chez une cible est encore "en service" —
  // il doit rester visible dans Flotte avec sa carte jaune (sinon le joueur perd la trace
  // de son tanker en veille orbitale).
  // D5.3 : inclure 'exploring' (tanker parti sur une piste/lead) + 'docked' (séjour).
  const activeTankerMissions = (G.tankerMissions || []).filter(m =>
    m.status === 'in_transit' || m.status === 'returning' || m.status === 'orbital_relay'
    || m.status === 'exploring' || m.status === 'docked'
  );

  if (activeFleets.length > 0 || activeTankerMissions.length > 0) {
    activeLabel.style.display = '';
    const fleetsHtml = activeFleets.map(f => `
      <div class="empty-line">${f.name} → ${f.target}</div>
    `).join('');
    // Cartes tanker (style jaune, comme demandé par Adrien)
    // Chunk D+ 14/05 : extrait en helper renderTankerMissionCard (partagé avec mtd-actions)
    const tankersHtml = activeTankerMissions.map(m => renderTankerMissionCard(m)).join('');
    activeList.innerHTML = fleetsHtml + tankersHtml;
  } else {
    activeLabel.style.display = 'none';
    activeList.innerHTML = '';
  }

  // ─── Forces planquées (chunk 15/05 — tanker logistique) ───
  // Cf. starbyte_AUDIT_tanker_logistique.md
  // Liste les garnisons déposées sur des planètes verrouillées via tanker logistique.
  const deployedLabel = document.getElementById('fleet-deployed-section-label');
  const deployedList = document.getElementById('fleet-deployed-list');
  const garrisons = G.garrisons || [];
  if (garrisons.length > 0) {
    deployedLabel.style.display = '';
    deployedList.innerHTML = garrisons.map(g => renderGarrisonFleetRow(g)).join('');
  } else {
    deployedLabel.style.display = 'none';
    deployedList.innerHTML = '';
  }
  // SHIP3D — écran Flotte = la station OS-01 en plein écran avec la flotte à quai (remplace l'ancienne vue orbite)
  setTimeout(() => { if (hasShipyardBuilt()) mountFleetStation3D(); else unmountFleetStation3D(); }, 0);
}

// ─── Card garnison dans Flotte > Commandement ───
// Affichage intelligent (feedback 16/05 #2 et #3) :
// - Si planète d'un joueur (Bersek89, etc.) : affiche son NOM en gras au lieu de la coord
// - Contenu = nature réelle du dépôt :
//   · soldats présents → "8 soldats"
//   · uniquement ressources → "88 métal · 50 énergie"
//   · cale vide (veille pure) → "Veille orbitale"
//   · plus rien (tout perdu) → "Dépôt vide"
function renderGarrisonFleetRow(g) {
  const isConnected = g.contactStatus === 'connected';
  const display = isConnected ? g.soldiers : g.lastKnownSoldiers;
  const totalSoldiers = (display.garde || 0) + (display.lourd || 0);
  const accent = isConnected ? '#ffc864' : 'var(--mut)';

  const elapsedH = (Date.now() - g.depositedAt) / (1000 * 60 * 60);
  const ageLabel = elapsedH < 1 ? `${Math.floor(elapsedH * 60)}min` : elapsedH < 24 ? `${Math.floor(elapsedH)}h` : `${Math.floor(elapsedH/24)}j`;

  const statusBadge = isConnected
    ? `<span style="font-size:8px;background:rgba(95,204,138,.18);color:#5fcc8a;padding:2px 6px;border-radius:3px;letter-spacing:.06em">CONTACT</span>`
    : `<span style="font-size:8px;background:rgba(120,120,120,.18);color:var(--mut);padding:2px 6px;border-radius:3px;letter-spacing:.06em">ISOLÉE</span>`;

  // ─── Résolution du nom à afficher en HEADER ───
  // Si la planète a un playerName (autre joueur), c'est lui en premier.
  // Sinon, on garde la coord (ou le nom personnalisé si la planète en a un).
  const planet = (typeof findPlanetByCoord === 'function') ? findPlanetByCoord(g.planetCoord) : null;
  const playerName = planet?.playerName || null;
  const headerLine = playerName
    ? `<span style="font-size:13px;color:#ff8a8a;font-weight:600;letter-spacing:.04em">${playerName}</span>`
    : `<span style="font-family:'SF Mono',monospace;font-size:11px;color:${accent};letter-spacing:.04em">${g.planetCoord}</span>`;

  // ─── Construction du SUMMARY (contenu réel) ───
  const resources = isConnected ? (g.resources || {}) : (g.lastKnownResources || {});
  const metal = resources.metal || 0;
  const energie = resources.energie || 0;
  const cristal = resources.cristal || 0;
  const totalResources = metal + energie + cristal;
  const hasAnything = totalSoldiers > 0 || totalResources > 0;

  let summaryLine;
  if (!hasAnything) {
    // Soit veille pure (jamais rien eu), soit tout a été perdu/rapatrié
    const original = g.soldiersAtDeposit
      ? ((g.soldiersAtDeposit.garde || 0) + (g.soldiersAtDeposit.lourd || 0))
      : 0;
    const originalRes = g.resourcesAtDeposit
      ? ((g.resourcesAtDeposit.metal || 0) + (g.resourcesAtDeposit.energie || 0) + (g.resourcesAtDeposit.cristal || 0))
      : 0;
    if (original === 0 && originalRes === 0) {
      // Pas de soldats, pas de ressources jamais → veille orbitale pure
      summaryLine = `<span style="font-size:12px;color:#5fcc8a;font-weight:500">${icon('satellite', {size:11, color:'#5fcc8a'})} Veille orbitale</span>`;
    } else {
      summaryLine = `<span style="font-size:12px;color:var(--mut);font-style:italic">Dépôt vide</span>`;
    }
  } else {
    // Construire la liste : soldats, puis ressources
    const parts = [];
    if (totalSoldiers > 0) {
      parts.push(`<span style="color:${accent};font-weight:600">${totalSoldiers} soldat${totalSoldiers > 1 ? 's' : ''}</span>`);
    }
    if (metal > 0)   parts.push(`<span style="color:#cececd">${fmt(metal)} métal</span>`);
    if (energie > 0) parts.push(`<span style="color:#ffaf3a">${fmt(energie)} énergie</span>`);
    if (cristal > 0) parts.push(`<span style="color:#6db032">${fmt(cristal)} cristal</span>`);
    summaryLine = `<span style="font-size:12px">${parts.join(`<span style="color:var(--mut)"> · </span>`)}</span>`;
  }

  // Footer compact : coord (si on a affiché le joueur en header) + age
  // Si planète joueur on garde la coord en sous-ligne. Sinon juste l'age.
  const footerLine = playerName
    ? `<span style="font-family:'SF Mono',monospace;font-size:9px;color:var(--mut)">${g.planetCoord} · ${ageLabel}</span>`
    : `<span style="font-family:'SF Mono',monospace;font-size:9px;color:var(--mut)">${ageLabel}</span>`;

  return `
    <div onclick="openPlanetDetail('${g.planetCoord}')" style="margin:0 16px 8px;padding:10px 12px;background:rgba(80,55,15,.20);border:1px solid ${accent}40;border-radius:8px;cursor:pointer">
      <div style="display:flex;align-items:center;gap:10px">
        ${icon('helmet', {size:18, color:accent})}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            ${headerLine}
            ${statusBadge}
          </div>
          <div style="margin-bottom:3px">${summaryLine}</div>
          ${footerLine}
        </div>
        <div style="color:var(--mut)">→</div>
      </div>
    </div>
  `;
}

// ─── Helpers de continuité des héros ──────────────────────────────────

// Retourne le palier d'expérience d'un héros selon son nombre de missions
function getHeroRank(hero) {
  if (!hero) return 'recruit';
  const n = hero.missionsCount || 0;
  if (n >= HERO_RANK_THRESHOLDS.legendary)   return 'legendary';
  if (n >= HERO_RANK_THRESHOLDS.experienced) return 'experienced';
  if (n >= HERO_RANK_THRESHOLDS.veteran)     return 'veteran';
  return 'recruit';
}

// Assigne un surnom à un héros (s'il n'en a pas déjà un et qu'il a ≥ 5 missions)
function maybeAssignNickname(hero) {
  if (!hero || hero.dead) return;
  if (hero.nickname) return; // Déjà un surnom
  if ((hero.missionsCount || 0) < 5) return;
  const pool = HERO_NICKNAMES[hero.role] || [];
  if (pool.length === 0) return;

  // Éviter de réutiliser un surnom déjà actif sur un autre héros
  const usedNicknames = new Set();
  for (const fleet of (G.fleet?.prepared || [])) {
    for (const h of Object.values(fleet.heroes || {})) {
      if (h && h.nickname && !h.dead) usedNicknames.add(h.nickname);
    }
  }
  const available = pool.filter(n => !usedNicknames.has(n));
  const chosen = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : pool[Math.floor(Math.random() * pool.length)];
  hero.nickname = chosen;
  hero.nicknameLockedAt = Date.now();
}

// Retourne le nom complet d'un héros à utiliser dans un récit
// Mode 'full' : "Herman le Brutal dit l'Inébranlable" (rare, intro de phase)
// Mode 'short' : "Herman le Brutal" (par défaut) ou "Herman *l'Inébranlable*" si surnom
// Mode 'rank' : "le commandant Herman le Brutal" (avec préfixe de rang)
function formatHeroName(hero, mode) {
  if (!hero) return 'Le commandant';
  mode = mode || 'short';
  const baseName = hero.name;
  const nickname = hero.nickname;
  const rank = getHeroRank(hero);

  if (mode === 'full' && nickname) {
    return `${baseName} dit *${nickname}*`;
  }
  if (mode === 'short') {
    // 30% de chances d'utiliser le surnom seul si défini
    if (nickname && Math.random() < 0.3) {
      return `${baseName.split(' ')[0]} *${nickname}*`;
    }
    return baseName;
  }
  if (mode === 'rank') {
    if (rank === 'legendary') return `le commandant ${baseName}`;
    if (rank === 'experienced') return `le commandant ${baseName}`;
    if (rank === 'veteran') return `le capitaine ${baseName}`;
    return baseName;
  }
  return baseName;
}

// Retourne une "introduction" longue d'un héros avec mention de son palier
// Utilisé en début de phase pour un effet narratif fort
function formatHeroIntro(hero) {
  if (!hero) return 'Le commandant en charge';
  const rank = getHeroRank(hero);
  const hint = HERO_RANK_LABELS[rank]?.hint || '';

  if (rank === 'recruit') {
    return `${hero.name}, qui ${hint}`;
  }
  if (rank === 'veteran') {
    return `Le capitaine ${hero.name}, ${hint}`;
  }
  if (rank === 'experienced') {
    return `Le commandant ${hero.name}, ${hint}`;
  }
  if (rank === 'legendary') {
    const nicknamePart = hero.nickname ? `, *${hero.nickname}*` : '';
    return `${hero.name}${nicknamePart}, ${hint}`;
  }
  return hero.name;
}

// ─── Mémoire des morts marquants (passe 3.4-c) ────────────────────────
// G.fleet.fallen[] : tableau des morts marquants, limité à 30 entrées
// Cf. GDD : on garde un fantôme uniquement si la mort répond à un critère "marquant"

function recordFallenHero(hero, deathContext) {
  if (!hero || !hero.name) return;

  // Critères de "mort marquante"
  const rank = getHeroRank(hero);
  const isMarkable =
       (deathContext.firstMission)              // Mort lors de la première mission
    || (deathContext.outcome === 'massacre')    // Mort lors d'un massacre
    || (rank === 'veteran' || rank === 'experienced' || rank === 'legendary')  // Vétéran/Aguerri/Légendaire
    || (deathContext.heroic);                    // Mort en combat héroïque (paradoxe)

  if (!isMarkable) return;

  if (!G.fleet) G.fleet = {};
  if (!Array.isArray(G.fleet.fallen)) G.fleet.fallen = [];

  G.fleet.fallen.unshift({
    name: hero.name,
    nickname: hero.nickname || null,
    role: hero.role,
    roleLabel: HERO_ROLES[hero.role]?.label || hero.role,
    rankAtDeath: rank,
    missionsCount: hero.missionsCount || 0,
    diedAt: Date.now(),
    causeContext: {
      targetName: deathContext.targetName,
      outcome: deathContext.outcome,
      firstMission: !!deathContext.firstMission,
      heroic: !!deathContext.heroic,
    },
  });

  // Limiter à 30 entrées (les plus récents en tête)
  if (G.fleet.fallen.length > 30) G.fleet.fallen.length = 30;
}

// Pioche un fantôme aléatoire dans G.fleet.fallen pour le mentionner
function pickFallenMemory() {
  if (!G.fleet?.fallen || G.fleet.fallen.length === 0) return null;
  // Pondéré : les morts plus récentes ont plus de chances d'être rappelées
  // mais on garde de la place pour les anciens (mémoire collective)
  const idx = Math.floor(Math.pow(Math.random(), 2) * G.fleet.fallen.length);
  return G.fleet.fallen[idx];
}
function _botPick(rng) {
  const total = Object.values(BOT_PROFILES).reduce((s, b) => s + b.weight, 0);
  let r = rng() * total;
  for (const [k, b] of Object.entries(BOT_PROFILES)) { r -= b.weight; if (r <= 0) return k; }
  return 'avantposte';
}
// Stocks du bot : un pillage les vide, ils se reconstituent en 24 h (état propre à chaque joueur)
function botResources(coord, profileKey) {
  const base = BOT_PROFILES[profileKey].resources;
  const st = (G.botState || {})[coord];
  let k = 1;
  if (st && st.raidedAt) k = Math.min(1, 0.25 + 0.75 * (Date.now() - st.raidedAt) / (24 * 3600e3));
  const out = {};
  for (const r of ['metal', 'energie', 'cristal']) out[r] = Math.round((base[r] || 0) * k);
  return out;
}
function botRecordRaid(coord, loot) {
  if (!coord) return;
  if (!G.botState) G.botState = {};
  G.botState[coord] = { raidedAt: Date.now(), lastLoot: loot || null };
}

// Récupère une cible par son ID : adversaires de test, puis adresses du carnet
function getFakeTarget(id) {
  if (!id) return null;
  return FAKE_TARGETS.find(t => t.id === id)
    || (String(id).startsWith('carnet:') ? getCarnetTargets().find(t => t.id === id) : null)
    || null;
}

// ─── 10/10/2026 — Adresses du carnet exploitables par la flotte ───
// Sources :
//   - planètes connues (knownSystems) hors la mienne : verrouillées par Moyenne,
//     joueurs détectés, planètes de test
//   - signatures identifiées (Légère) mais non verrouillées → présentes mais
//     non ciblables (Moyenne requise)
// Le profil de combat est dérivé de la classe / du niveau joueur.
function _carnetDistanceMult(sector) {
  // PATCH_2010_DEPART : distance depuis la plus proche de mes planètes
  const d = (typeof _sectorDistance === 'function') ? Math.min(...sbAllOrigins().map(o => _sectorDistance(o.sector, sector))) : 0;
  if (d <= 0) return 1;
  if (d <= 2) return 3;
  return 5;
}
function _carnetTargetFromPlanet(p) {
  const mult = _carnetDistanceMult(p.sector);
  const base = { id: 'carnet:' + p.coord, coord: p.coord, carnet: true, targetable: true, distanceMult: mult, description: p.desc || '' };
  // MULTIJOUEUR (étape 2, 11/10) : un vrai commandant se raide, mais le combat est résolu
  // par le serveur (fonction resolve-raids) avec sa vraie défense et ses vrais stocks.
  if (p.isReal) {
    const online = !!(window.SBMP && window.SBMP.ready && window.SBMP.ready());
    const _pact = mpPactWith(p.mpAddress || p.coord, p.playerName);   // AMBASSADES_1210
    const _enemy = mpRelWith(p.mpAddress || p.coord, p.playerName, 'enemy');   // PATCH_2110_PAVILLONS
    if (_pact && _pact.status === 'active') {
      return Object.assign(base, {
        name: p.name || p.coord, level: p.playerLevel || 1, profile: 'Commandant · ' + p.playerName,
        kind: 'player', mp: true, mpAddress: p.mpAddress || p.coord, mpPseudo: p.playerName,
        targetable: false, defense: 0, garrison: 0, resources: {},
        hint: 'Pacte de non-agression en cours : dénonce-le d\'abord (fiche de sa planète)',
        description: 'Pacte de non-agression actif.',
      });
    }
    return Object.assign(base, {
      name: p.name || p.coord, level: p.playerLevel || 1, profile: (_enemy ? 'Ennemi déclaré · ' : 'Commandant · ') + p.playerName,
      kind: 'player', mp: true, mpAddress: p.mpAddress || p.coord, mpPseudo: p.playerName, mpEnemy: !!_enemy,
      targetable: online, defense: 0, garrison: 0, resources: {},
      hint: online ? '' : 'Connexion au registre requise pour attaquer un commandant',
      description: 'Défense inconnue : le combat se joue sur le serveur, à l\'arrivée de ta flotte.',
    });
  }
  if (p.isBot && BOT_PROFILES[p.botType]) {
    const bp = BOT_PROFILES[p.botType];
    return Object.assign(base, {
      name: p.playerName || p.coord, level: bp.level, profile: 'Bot · ' + bp.profile,
      kind: 'player', isBot: true, botCoord: p.coord,
      description: bp.description,
      defense: bp.defense, garrison: bp.garrison, resources: botResources(p.coord, p.botType),
    });
  }
  if (p.playerName) {
    const lvl = p.playerLevel || 100;
    return Object.assign(base, {
      name: p.name || p.coord,
      level: lvl,
      profile: 'Joueur · ' + p.playerName,
      kind: 'player',
      defense: Math.round(lvl * 4),
      garrison: Math.round(lvl * 2.5),
      resources: { metal: Math.round(lvl * 7), energie: Math.round(lvl * 3), cristal: Math.round(lvl * 0.7) },
    });
  }
  const byType = {
    dead:      { profile: 'Monde mort',       resources: { metal: 1500, energie: 0,    cristal: 200 } },
    lunar:     { profile: 'Lune stérile',     resources: { metal: 600,  energie: 0,    cristal: 0 } },
    gas:       { profile: 'Géante gazeuse',   resources: { metal: 0,    energie: 2500, cristal: 0 } },
    habitable: { profile: 'Monde libre',      resources: { metal: 800,  energie: 400,  cristal: 100 } },
  };
  const t = byType[p.type] || byType.habitable;
  return Object.assign(base, {
    name: p.name || p.coord,
    level: '—',
    profile: t.profile,
    kind: p.type || 'habitable',
    defense: 0,
    garrison: 0,
    resources: (() => { const f = pvStock(p.coord); return { metal: Math.round(t.resources.metal * f), energie: Math.round(t.resources.energie * f), cristal: Math.round(t.resources.cristal * f) }; })(),   // PATCH_2010_PILLAGE_VIDE
  });
}
function pvIsEmpty(t) { return !!(t && t.carnet && !t.isBot && !t.mp && t.kind !== 'player' && PV_KINDS.has(t.kind)); }
function pvStock(coord) {
  const w = G.worldPillage && G.worldPillage[coord];
  if (!w) return 1;
  return Math.min(1, w.f0 + (1 - w.f0) * Math.max(0, Date.now() - w.at) / PV_REGEN_MS);
}
function pvHeat() {
  const h = G.emptyRaidHeat;
  if (!h) return 0;
  return Math.max(0, h.h - Math.max(0, Date.now() - h.at) / PV_DECAY_MS);
}
function pvTargetNote(t) {
  if (!pvIsEmpty(t)) return '';
  const st = pvStock(t.coord), h = pvHeat(), parts = [];
  if (st < 0.97) parts.push(`stock ${Math.round(st * 100)} % (se reconstitue)`);
  parts.push(h >= 1 ? '<span style="color:#ff8a6a">équipages fatigués : butin réduit, incidents probables</span>' : 'monde vide : un incident reste possible');
  return `<div style="font-size:9px;color:var(--mut);margin-top:3px;font-style:italic">${parts.join(' · ')}</div>`;
}
function pvApply(fleet, target, c) {
  const h = pvHeat(), now = Date.now();
  const info = { heat: Math.round(h * 10) / 10, lootMult: 1, stock: pvStock(target.coord), incident: null };
  // 1. butin : la fatigue le fait chuter dès le deuxième pillage, quel que soit le monde
  if (c.phases.phase3 && c.phases.phase3.executed) {
    const m = h < 1 ? 1 : (h < 2 ? 0.3 : 0.12);
    info.lootMult = m;
    if (m < 1) {
      for (const k of ['metal', 'energie', 'cristal']) c.loot[k] = Math.floor((c.loot[k] || 0) * m);
      c.phases.phase3.loot = { ...c.loot };
      c.phases.phase3.cargoUsed = Math.floor((c.phases.phase3.cargoUsed || 0) * m);
    }
    if (!G.worldPillage) G.worldPillage = {};
    G.worldPillage[target.coord] = { at: now, f0: 0.1 };   // le monde est vidé
  }
  // 2. incident : toujours des vaisseaux perdus
  const pc = h < 1 ? 0.25 : (h < 2 ? 0.6 : 0.9);
  if (Math.random() < pc) {
    const def = PV_INCIDENTS[target.kind] || PV_INCIDENTS.habitable;
    const L = c.finalLosses.ships, avail = [];
    for (const type of ['tanker', 'fregate', 'cuirasse']) for (const tier of ['t1', 't2', 't3']) {
      const left = (fleet.composition[type]?.[tier] || 0) - (L[type]?.[tier] || 0) - (c.finalLosses.shipsRecovered?.[type]?.[tier] || 0) * 0;
      for (let i = 0; i < left; i++) avail.push([type, tier]);
    }
    if (avail.length) {
      const want = Math.max(1, Math.min(avail.length - (avail.length > 1 ? 1 : 0) || 1, Math.round(avail.length * (0.06 + 0.08 * Math.min(h, 3)) + Math.random())));
      // le type « logique » d'abord (les déserteurs partent avec un tanker, les secours sont des frégates)
      avail.sort((a, b) => (b[0] === def.ship) - (a[0] === def.ship) || Math.random() - 0.5);
      let n = 0;
      for (const [type, tier] of avail.slice(0, want)) { L[type][tier] = (L[type][tier] || 0) + 1; n++; }
      // soldats : restés par amour, ou disparus en explorant
      let sl = 0;
      if (target.kind === 'habitable' || target.kind === 'dead') {
        const pct = target.kind === 'habitable' ? 0.2 + Math.random() * 0.3 : 0.1 + Math.random() * 0.2;
        for (const k of ['garde', 'lourd']) {
          const left = Math.max(0, (fleet.soldiers?.[k] || 0) - (c.finalLosses.soldiers[k] || 0));
          const d = Math.floor(left * pct); c.finalLosses.soldiers[k] = (c.finalLosses.soldiers[k] || 0) + d; sl += d;
        }
      }
      info.incident = { title: def.title, text: def.text(n, sl), ships: n, soldiers: sl };
      if (c.outcome === 'crushing_victory') c.outcome = 'victory';
    }
  }
  G.emptyRaidHeat = { h: h + 1, at: now };
  c.emptyWorld = info;
}
function pvReportHtml(e) {
  if (!e) return '';
  const fat = e.lootMult < 1 ? `<div style="font-size:11px;color:#ff9a7a;line-height:1.6;margin-top:6px">Les équipages enchaînent les pillages de mondes vides : butin ×${String(e.lootMult).replace('.', ',')}, et ils prennent des risques. La fatigue retombe d'un cran par jour.</div>` : '';
  const inc = e.incident ? `<div style="color:#ff8a6a;font-size:10px;letter-spacing:.18em;margin:8px 0 6px">═══ INCIDENT — ${e.incident.title.toUpperCase()} ═══</div>
      <div style="font-style:italic;color:#e6f0ff;font-size:12px;line-height:1.8">${e.incident.text}</div>
      <div style="font-size:11px;color:var(--mut);margin-top:6px">Perdus : ${e.incident.ships} vaisseau${e.incident.ships > 1 ? 'x' : ''}${e.incident.soldiers ? ` · ${e.incident.soldiers} soldat${e.incident.soldiers > 1 ? 's' : ''}` : ''}</div>` : '';
  if (!fat && !inc) return '';
  return `<div style="margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,138,106,.25)">${inc}${fat}
    <div style="font-size:10px;color:var(--mut);margin-top:6px;font-style:italic">Ce monde est vidé : son stock se reconstitue en 5 jours.</div></div>`;
}

function getCarnetTargets() {
  const out = [];
  const seen = new Set();
  for (const sys of Object.values(G.knownSystems || {})) {
    for (const p of (sys.planets || [])) {
      if (!p || p.isMine || p.myColony || !p.coord || seen.has(p.coord)) continue;
      if (Array.isArray(G.worlds) && G.worlds.some(w => w && w.coord === p.coord)) continue;   // PATCH_2010_AUDIT — pas de raid sur ses propres colonies
      seen.add(p.coord);
      out.push(_carnetTargetFromPlanet(p));
    }
  }
  const classLabel = { dead_world: 'Monde mort', gas_giant: 'Planète gazeuse', habitable: 'Corps habitable', lunar: 'Lune stérile', unknown: 'Corps orbital' };
  for (const sig of Object.values(G.signatures || {})) {
    if (!sig || !sig.resolved || sig.resolvedType !== 'fixed' || sig.fixedAddress || !sig.inCarnet) continue;
    const sector = (sig.system || '').split('-')[1];
    out.push({
      id: 'carnet:' + sig.id, coord: sig.system, carnet: true, targetable: false,
      name: sig.id, level: '?', profile: (classLabel[sig.fixedClass] || 'Corps orbital') + ' · identifié',
      kind: 'signature', signatureId: sig.id,
      hint: 'Adresse non verrouillée · Sonde Moyenne requise',
      distanceMult: _carnetDistanceMult(sector), defense: 0, garrison: 0,
      resources: { metal: 0, energie: 0, cristal: 0 }, description: '',
    });
  }
  // Joueurs d'abord, puis mondes ciblables, puis signatures à verrouiller
  const rank = t => t.kind === 'player' ? 0 : (t.targetable ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b));
  return out;
}

// Calcul du coût en énergie pour envoyer une flotte vers une cible
// Formule passe 3.3 (provisoire, équilibrée en passe 3.6) :
//   coût = nombre de vaisseaux × 100 × multiplicateur distance
function computeMissionFuelCost(fleet, target) {
  if (!fleet || !target) return 0;
  let nShips = 0;
  for (const sk of ['tanker', 'fregate', 'cuirasse']) {
    for (let t = 1; t <= 3; t++) {
      nShips += (fleet.composition?.[sk]?.['t' + t] || 0);
    }
  }
  return Math.max(100, nShips * 100 * target.distanceMult);
}

// Déduit l'intention de mission depuis la doctrine de flotte
// Mapping doctrine → intention narrative (passe 3.3 Z4-quinquies)
function getMissionIntent(fleet) {
  const doctrine = detectFleetDoctrine(fleet.composition, fleet.soldiers);
  if (!doctrine) return { label: 'Mission', icon: '⊙', desc: 'Action militaire générique.' };
  switch (doctrine.key) {
    case 'landing':  return { label: 'Invasion',                  icon: 'sword', desc: 'Débarquement de soldats. Combat au sol.' };
    case 'convoy':   return { label: 'Raid (pillage)',            icon: 'package', desc: 'Cible le butin. Fuit après pillage.' };
    case 'arsenal':  return { label: 'Destruction de défense',    icon: 'shield', desc: 'Anéantit les défenses adverses. Pas de pillage.' };
    case 'strike':   return { label: 'Raid rapide',               icon: 'zap', desc: 'Frappe éclair. Pillage limité.' };
    case 'balanced': return { label: 'Raid mixte',                icon: '⚖', desc: 'Pillage modéré + destruction partielle.' };
    default:         return { label: 'Raid basique',              icon: '◇', desc: 'Pillage selon capacité cargo.' };
  }
}

/* ═══════════════════════════════════════════════════════════════
   PASSE 3.4 — Héros nommés light
   ═══════════════════════════════════════════════════════════════
   1 héros par TYPE de vaisseau présent dans la flotte (1 à 3 héros).
   Persistance : les survivants gardent leur nom de mission en mission.
   Quand un type est anéanti, le héros est rapporté mort et un nouveau
   est généré à la prochaine mission contenant ce type.
   ═══════════════════════════════════════════════════════════════ */

// Pioche un nom de héros aléatoire pour un rôle donné, en évitant les noms
// déjà utilisés ailleurs dans le jeu (anti-doublons).
function pickHeroName(role, exclude) {
  exclude = exclude || new Set();
  const pool = HERO_NAMES[role] || [];
  const available = pool.filter(n => !exclude.has(n));
  if (available.length === 0) {
    // Cas limite : tous les noms sont pris (impossible en pratique avec 30+ noms par rôle)
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

// Récupère l'ensemble des noms de héros déjà utilisés dans le jeu (toutes flottes vivantes)
function getActiveHeroNames() {
  const used = new Set();
  for (const fleet of (G.fleet?.prepared || [])) {
    if (fleet.heroes) {
      for (const h of Object.values(fleet.heroes)) {
        if (h && h.name && !h.dead) used.add(h.name);
      }
    }
  }
  return used;
}

// Compte le nombre de vaisseaux d'un type dans une composition de flotte
function countShipsByType(composition, type) {
  if (!composition || !composition[type]) return 0;
  return (composition[type].t1 || 0) + (composition[type].t2 || 0) + (composition[type].t3 || 0);
}

// Génère ou met à jour les héros d'une flotte selon sa composition actuelle.
// - Ajoute un héros pour chaque type de vaisseau présent qui n'a pas encore de héros vivant
// - Ne remplace JAMAIS un héros vivant (persistance)
// - Si un type n'est plus présent dans la flotte, le héros est conservé en mémoire mais marqué dormant
function ensureFleetHeroes(fleet) {
  if (!fleet) return;
  if (!fleet.heroes) fleet.heroes = { tanker: null, fregate: null, cuirasse: null };

  const usedNames = getActiveHeroNames();

  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    const count = countShipsByType(fleet.composition, type);
    const current = fleet.heroes[type];

    if (count > 0) {
      // Type présent dans la flotte
      if (!current || current.dead) {
        // Pas de héros vivant pour ce type → en générer un
        const name = pickHeroName(type, usedNames);
        usedNames.add(name);
        fleet.heroes[type] = {
          name,
          role: type,
          dead: false,
          missionsCount: 0,
          firstMissionAt: null,
        };
      }
    }
    // Si count === 0, on garde l'éventuel héros existant en mémoire
    // (au cas où le joueur rajoute ce type plus tard via Modifier)
  }
}

// Récupère la liste des héros actifs (vivants ET dont le type est présent dans la flotte)
function getActiveHeroes(fleet) {
  if (!fleet || !fleet.heroes) return [];
  const result = [];
  for (const type of ['cuirasse', 'fregate', 'tanker']) {
    const hero = fleet.heroes[type];
    const count = countShipsByType(fleet.composition, type);
    if (hero && !hero.dead && count > 0) {
      result.push(hero);
    }
  }
  return result;
}

// Calcule la doctrine d'une flotte selon sa composition + soldiers
// Retourne {key, name, icon, short, long, color} ou un fallback "mixte"
function detectFleetDoctrine(composition, soldiers) {
  // Statistiques de la flotte
  let totalShips = 0;
  let nTankers = 0, nFregates = 0, nCuirasses = 0;
  let atkVaisseaux = 0;
  let cargoCapacity = 0;
  for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
    for (let tier = 1; tier <= 3; tier++) {
      const qty = composition?.[shipKey]?.['t' + tier] || 0;
      if (qty === 0) continue;
      totalShips += qty;
      if (shipKey === 'tanker') nTankers += qty;
      else if (shipKey === 'fregate') nFregates += qty;
      else if (shipKey === 'cuirasse') nCuirasses += qty;
      const td = SHIP_TIERS[shipKey]?.[tier];
      if (!td) continue;
      atkVaisseaux += qty * (td.atk || 0);
      cargoCapacity += qty * (td.cargo || 0);
    }
  }
  const totalCombatShips = nFregates + nCuirasses;

  const totalSoldiers = (soldiers?.garde || 0) + (soldiers?.lourd || 0);
  const soldierFreight = (soldiers?.garde || 0) * (DEFENSE_UNITS.garde?.soldierWeight || 80)
                       + (soldiers?.lourd || 0) * (DEFENSE_UNITS.lourd?.soldierWeight || 200);
  const atkSoldats = (soldiers?.garde || 0) * (DEFENSE_UNITS.garde?.atkPerUnit || 0)
                   + (soldiers?.lourd || 0) * (DEFENSE_UNITS.lourd?.atkPerUnit || 0);
  const totalAtk = atkVaisseaux + atkSoldats;

  // ─── Ratios (sécurisés contre division par 0) ───
  // rSoldierAtk : nouveau ratio principal pour Force de débarquement
  //   = "Quelle part de la puissance d'attaque vient des soldats ?"
  //   = atk soldats / atk totale (intention militaire d'invasion)
  const rSoldierAtk   = totalAtk > 0 ? atkSoldats / totalAtk : 0;
  const rTankers      = totalShips > 0 ? nTankers / totalShips : 0;
  const rCombatShips  = totalShips > 0 ? totalCombatShips / totalShips : 0;
  const rCargoFilled  = cargoCapacity > 0 ? soldierFreight / cargoCapacity : 0;

  const stats = {
    totalShips, totalCombatShips, totalSoldiers,
    nTankers, nFregates, nCuirasses,
    atkVaisseaux, atkSoldats, totalAtk,
    cargoCapacity, soldierFreight,
    rSoldierAtk, rTankers, rCombatShips, rCargoFilled,
  };

  // Si flotte vide : pas de doctrine
  if (totalShips === 0) return null;

  // Chercher la doctrine match avec la plus haute priorité
  let best = null;
  for (const d of FLEET_DOCTRINES) {
    if (d.matches(stats)) {
      if (!best || d.priority > best.priority) best = d;
    }
  }

  // Fallback : composition mixte sans archétype identifiable
  if (!best) {
    return {
      key: 'mixed',
      name: 'Composition mixte',
      icon: '◇',
      short: 'Composition sans spécialité claire.',
      long: 'Cette flotte n\'a pas de doctrine identifiable. Elle peut faire un peu de tout, mais brillera dans aucun rôle.',
      color: '#b8d0ff',
    };
  }
  return best;
}

function generateFleetName() {
  const adj = FLEET_NAME_ADJECTIVES[Math.floor(Math.random() * FLEET_NAME_ADJECTIVES.length)];
  const suf = FLEET_NAME_SUFFIXES[Math.floor(Math.random() * FLEET_NAME_SUFFIXES.length)];
  const name = `${adj} ${suf}`;
  const input = document.getElementById('fleet-name-input');
  if (input) {
    input.value = name;
  }
  // Mettre à jour le state composing (pour persister si on recharge l'écran)
  if (G.fleetComposing) G.fleetComposing.name = name;
  // CRITIQUE : modifier input.value programmatiquement ne déclenche pas l'event 'input',
  // donc updateComposeConfirmBtn ne se déclenche pas tout seul. On l'appelle manuellement.
  updateComposeConfirmBtn();
}

// Retourne le nombre de vaisseaux d'un type/tier DISPONIBLES (stationnés moins ceux réservés
// dans des flottes préparées)
function getAvailableShips(shipKey, tier) {
  const tierKey = 't' + tier;
  const stationed = G.fleet.stationed[shipKey]?.[tierKey] || 0;
  // En mode édition, on EXCLUT la flotte qu'on est en train de modifier
  // (ses vaisseaux sont déjà comptés dans G.fleetComposing.composition)
  const editingId = G.fleetComposing?.editingId || null;
  let reserved = 0;
  for (const prep of G.fleet.prepared) {
    if (prep.id === editingId || !_sbMine(prep)) continue; // skip la flotte en cours d'édition (et celles des autres planètes)
    reserved += prep.composition?.[shipKey]?.[tierKey] || 0;
  }
  if (shipKey === 'tanker') reserved += _busyTankerMissions().filter(m => _tankerMissionTier(m) === tier).length;
  return Math.max(0, stationed - reserved);
}

// Retourne le nombre de soldats d'un type DISPONIBLES
function getAvailableSoldiers(soldierKey) {
  const total = G.defense.units[soldierKey]?.qty || 0;
  const editingId = G.fleetComposing?.editingId || null;
  let reserved = 0;
  for (const prep of G.fleet.prepared) {
    if (prep.id === editingId || !_sbMine(prep)) continue; // skip la flotte en cours d'édition (et celles des autres planètes)
    reserved += prep.soldiers?.[soldierKey] || 0;
  }
  reserved += soldiersCommittedElsewhere(soldierKey);
  return Math.max(0, total - reserved);
}

// ─── Helpers de calcul de fret (passe 3.2 doctrine cargo/soldats) ───

// Capacité de fret TOTALE de la composition (somme des cargo des Tankers)
function computeCargoCapacity(composition) {
  let total = 0;
  for (let tier = 1; tier <= 3; tier++) {
    const qty = composition.tanker['t' + tier] || 0;
    const cap = SHIP_TIERS.tanker?.[tier]?.cargo || 0;
    total += qty * cap;
  }
  return total;
}

// Fret OCCUPÉ par les soldats embarqués (selon leur soldierWeight)
function computeSoldierFreight(soldiers) {
  let total = 0;
  for (const [key, qty] of Object.entries(soldiers || {})) {
    const weight = DEFENSE_UNITS[key]?.soldierWeight || 0;
    total += qty * weight;
  }
  return total;
}

// Fret LIBRE (cargo disponible pour ressources après embarquement des soldats)
function computeCargoFree(composition, soldiers) {
  return Math.max(0, computeCargoCapacity(composition) - computeSoldierFreight(soldiers));
}

// Combien de soldats supplémentaires je peux ajouter d'un type donné
// en respectant la capacité fret restante (et la dispo en garnison)
function computeMaxAddableSoldiers(soldierKey, composition, soldiers) {
  const weight = DEFENSE_UNITS[soldierKey]?.soldierWeight || 0;
  if (weight === 0) return 0;
  const free = computeCargoFree(composition, soldiers);
  const byFret = Math.floor(free / weight);
  const byStock = getAvailableSoldiers(soldierKey);
  return Math.min(byFret, byStock);
}

// Lance la composition d'une nouvelle flotte
// Lance la composition d'une nouvelle flotte OU l'édition d'une flotte préparée existante
// fleetId optionnel : si fourni, charge la compo existante (mode édition)
function openFleetCompose(fleetId) {
  if (fleetId) {
    // Mode ÉDITION : hydrater depuis la flotte existante
    const existing = G.fleet.prepared.find(f => f.id === fleetId);
    if (!existing) {
      toast('Flotte introuvable');
      return;
    }
    // Clone profond pour ne pas modifier directement la flotte tant qu'on n'a pas confirmé
    G.fleetComposing = {
      editingId: fleetId,
      name: existing.name,
      composition: JSON.parse(JSON.stringify(existing.composition)),
      soldiers: { ...existing.soldiers },
    };
    // ─── Garde-fou : clamper les valeurs si la flotte contient plus de vaisseaux
    // que le stock total disponible (réparation d'une corruption éventuelle) ───
    clampFleetComposingToStock();
  } else {
    // Mode CRÉATION : state vide
    G.fleetComposing = {
      editingId: null,
      name: '',
      composition: {
        tanker:   { t1: 0, t2: 0, t3: 0 },
        fregate:  { t1: 0, t2: 0, t3: 0 },
        cuirasse: { t1: 0, t2: 0, t3: 0 },
      },
      soldiers: { garde: 0, lourd: 0 },
    };
  }
  goto('fleet-compose');
}

// Garde-fou : si la composition contient plus de vaisseaux/soldats que disponibles,
// on rabote au plafond réel. Évite que des flottes corrompues persistent.
function clampFleetComposingToStock() {
  if (!G.fleetComposing) return;
  let clamped = false;
  for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
    for (let tier = 1; tier <= 3; tier++) {
      const tierKey = 't' + tier;
      const current = G.fleetComposing.composition[shipKey][tierKey];
      const maxAllowed = getAvailableShips(shipKey, tier);
      if (current > maxAllowed) {
        G.fleetComposing.composition[shipKey][tierKey] = maxAllowed;
        clamped = true;
      }
    }
  }
  for (const sk of ['garde', 'lourd']) {
    const maxAllowed = getAvailableSoldiers(sk);
    if (G.fleetComposing.soldiers[sk] > maxAllowed) {
      G.fleetComposing.soldiers[sk] = maxAllowed;
      clamped = true;
    }
  }
  // Vérifier aussi que les soldats ne dépassent pas la capacité fret
  const cap = computeCargoCapacity(G.fleetComposing.composition);
  let used = computeSoldierFreight(G.fleetComposing.soldiers);
  if (used > cap) {
    const order = ['lourd', 'garde'];
    for (const sk of order) {
      while (used > cap && G.fleetComposing.soldiers[sk] > 0) {
        G.fleetComposing.soldiers[sk]--;
        used = computeSoldierFreight(G.fleetComposing.soldiers);
      }
    }
    clamped = true;
  }
  if (clamped) {
    toast('Composition ajustée au stock disponible');
  }
}

function renderFleetCompose() {
  if (!G.fleetComposing) {
    G.fleetComposing = {
      editingId: null,
      name: '',
      composition: {
        tanker:   { t1: 0, t2: 0, t3: 0 },
        fregate:  { t1: 0, t2: 0, t3: 0 },
        cuirasse: { t1: 0, t2: 0, t3: 0 },
      },
      soldiers: { garde: 0, lourd: 0 },
    };
  }

  // ─── Adapter le header et le bouton selon le mode (création / édition) ───
  const isEditing = !!G.fleetComposing.editingId;
  const titleEl = document.querySelector('#scr-fleet-compose .head h1');
  const metaEl = document.querySelector('#scr-fleet-compose .head .meta');
  const confirmBtn = document.getElementById('fleet-compose-confirm-btn');
  if (titleEl) titleEl.textContent = isEditing ? 'MODIFIER LA FLOTTE' : 'COMPOSER UNE FLOTTE';
  if (metaEl) metaEl.innerHTML = isEditing
    ? `Édition · <span style="color:var(--blue)">${G.fleetComposing.name || 'sans nom'}</span>`
    : `Sélection tactique <span class="dot"></span> Mode opérationnel`;
  if (confirmBtn && !confirmBtn.disabled) {
    confirmBtn.textContent = isEditing ? 'Mettre à jour' : 'Préparer la flotte';
  }

  // Restaurer le nom dans le champ
  const input = document.getElementById('fleet-name-input');
  if (input) input.value = G.fleetComposing.name || '';

  // Bind le input pour qu'il sync avec le state
  if (input && !input.dataset.bound) {
    input.addEventListener('input', e => {
      G.fleetComposing.name = e.target.value;
      updateComposeConfirmBtn();
    });
    input.dataset.bound = '1';
  }

  // Render la liste des vaisseaux disponibles
  const shipsEl = document.getElementById('fleet-compose-ships');
  if (!shipsEl) return;

  const types = ['tanker', 'fregate', 'cuirasse'];
  let totalAvailable = 0;
  let rows = '';

  for (const shipKey of types) {
    const meta = SHIP_UNITS[shipKey];
    for (let tier = 1; tier <= 3; tier++) {
      // maxAllowed = plafond absolu pour cette flotte (stock - autres flottes réservées)
      const maxAllowed = getAvailableShips(shipKey, tier);
      const selected = G.fleetComposing.composition[shipKey]['t' + tier];
      const stationed = G.fleet.stationed[shipKey]['t' + tier] || 0;
      // Ne montrer que les types dont le joueur a au moins 1 (stationné, pas nécessairement dispo)
      if (stationed === 0) continue;
      totalAvailable += stationed;

      const td = SHIP_TIERS[shipKey]?.[tier];
      if (!td) continue;

      // Stats compactes
      const statsParts = [];
      if (td.atk) statsParts.push(`<span style="color:var(--red)">${td.atk} atk</span>`);
      if (td.def) statsParts.push(`<span style="color:var(--cyan)">${td.def} def</span>`);
      if (td.cargo) statsParts.push(`<span style="color:var(--amber)">${fmt(td.cargo)} cargo</span>`);
      if (td.transportCap) statsParts.push(`<span style="color:var(--mut)">${td.transportCap} sold.</span>`);

      const tierColor = tier === 1 ? 'var(--mut)' : tier === 2 ? 'var(--amber)' : 'var(--cyan)';
      // canAdd : il faut qu'il reste de la place sous le plafond
      const canAdd = selected < maxAllowed;
      const canRemove = selected > 0;
      // Reservé par d'autres flottes (utile pour l'info au joueur)
      const reservedByOthers = stationed - maxAllowed;

      rows += `
        <div class="fleet-compose-row ${maxAllowed === 0 && selected === 0 ? 'disabled' : ''}">
          <div class="fleet-compose-icon" style="color:var(--blue)">${PNG_ILLUSTRATIONS[shipKey] ? `<img src="${PNG_ILLUSTRATIONS[shipKey]}" alt="${meta.name}" onerror="pngFallback(this, '${shipKey}')">` : meta.icon}</div>
          <div class="fleet-compose-info">
            <div class="fleet-compose-name">${td.name} <span style="color:${tierColor};font-size:10px;font-family:'SF Mono',monospace;margin-left:4px">T${tier}</span></div>
            <div class="fleet-compose-counter">
              <span class="selected">${selected}</span> dans la flotte · max ${maxAllowed}${reservedByOthers > 0 ? ` <span style="color:var(--mut)">(${reservedByOthers} dans autres flottes)</span>` : ''}
            </div>
            <div class="fleet-compose-counter" style="margin-top:2px">${statsParts.join(' · ')}</div>
          </div>
          <div class="fleet-compose-buttons">
            <button class="fleet-compose-btn minus ${canRemove ? '' : 'disabled'}" onclick="adjustComposeShip('${shipKey}', ${tier}, -1)">−</button>
            <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeShip('${shipKey}', ${tier}, 1)">+1</button>
            <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeShip('${shipKey}', ${tier}, 'max')">MAX</button>
          </div>
        </div>
      `;
    }
  }

  if (totalAvailable === 0) {
    shipsEl.innerHTML = `<div class="fleet-compose-empty">Aucun vaisseau militaire dans la flotte. Va au Chantier orbital pour en construire.</div>`;
  } else {
    shipsEl.innerHTML = rows;
  }

  // Section soldats — visible seulement si au moins 1 Tanker dans la compo
  renderFleetComposeSoldiers();

  // Doctrine détectée (passe 3.2 Z4-quater)
  const doctrine = detectFleetDoctrine(G.fleetComposing.composition, G.fleetComposing.soldiers);
  renderDoctrineCard(doctrine, 'fleet-compose-doctrine', 'fleet-compose-doctrine-label');

  // Récap stats
  renderFleetComposeRecap();

  // État du bouton confirmer
  updateComposeConfirmBtn();
}

function renderFleetComposeSoldiers() {
  const label = document.getElementById('fleet-compose-soldiers-label');
  const list = document.getElementById('fleet-compose-soldiers');
  if (!label || !list) return;

  const comp = G.fleetComposing.composition;
  const soldiers = G.fleetComposing.soldiers;
  const totalCargo = computeCargoCapacity(comp);

  if (totalCargo === 0) {
    label.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  label.style.display = '';

  // ─── Barre visuelle 2 zones : soldats (bleu) + ressources libres (ambre) ───
  const soldFreight = computeSoldierFreight(soldiers);
  const cargoFree = computeCargoFree(comp, soldiers);
  const soldPct = (soldFreight / totalCargo) * 100;
  const totalSoldiers = soldiers.garde + soldiers.lourd;

  let html = `
    <div style="padding:0 16px;margin-bottom:12px">
      <div class="cargo-occupancy-label">
        <span>Occupation des Tankers</span>
        <span style="color:${soldFreight > 0 ? 'var(--blue)' : 'var(--mut)'};font-weight:700">${fmt(soldFreight)} / ${fmt(totalCargo)} fret</span>
      </div>
      <div class="cargo-occupancy-bar">
        <div class="cargo-occupancy-fill soldiers" style="width:${soldPct}%"></div>
      </div>
      <div class="cargo-occupancy-legend">
        <span><span class="cargo-dot soldiers"></span> Soldats : <strong>${totalSoldiers}</strong> (${fmt(soldFreight)} fret)</span>
        <span><span class="cargo-dot free"></span> Cargo libre : <strong>${fmt(cargoFree)}</strong></span>
      </div>
    </div>
  `;

  for (const soldierKey of ['garde', 'lourd']) {
    const unit = DEFENSE_UNITS[soldierKey];
    if (!unit || !unit.transportable) continue;
    const maxAllowed = getAvailableSoldiers(soldierKey); // plafond absolu pour cette flotte
    const total = G.defense.units[soldierKey]?.qty || 0;
    if (total === 0) continue;

    const selected = soldiers[soldierKey];
    const maxAddable = computeMaxAddableSoldiers(soldierKey, comp, soldiers);
    const canAdd = maxAddable > 0;
    const canRemove = selected > 0;
    const weight = unit.soldierWeight;
    const weightUsed = selected * weight;
    const reservedByOthers = total - maxAllowed;

    html += `
      <div class="fleet-compose-row">
        <div class="fleet-compose-icon" style="color:${unit.color}">${PNG_ILLUSTRATIONS[soldierKey] ? `<img src="${PNG_ILLUSTRATIONS[soldierKey]}" alt="${unit.name}" onerror="pngFallback(this, '${soldierKey}')">` : unit.icon}</div>
        <div class="fleet-compose-info">
          <div class="fleet-compose-name">${unit.name}</div>
          <div class="fleet-compose-counter">
            <span class="selected">${selected}</span> embarqués · max ${maxAllowed}${reservedByOthers > 0 ? ` <span style="color:var(--mut)">(${reservedByOthers} dans autres flottes)</span>` : ''} · <span style="color:var(--blue)">${fmt(weight)} fret/u</span>
          </div>
          <div class="fleet-compose-counter" style="margin-top:2px">
            <span style="color:var(--red)">${unit.atkPerUnit} atk</span> · <span style="color:var(--cyan)">${unit.defPerUnit} def</span> par soldat${weightUsed > 0 ? ` · <span style="color:var(--blue)">${fmt(weightUsed)} fret occupé</span>` : ''}
          </div>
        </div>
        <div class="fleet-compose-buttons">
          <button class="fleet-compose-btn minus ${canRemove ? '' : 'disabled'}" onclick="adjustComposeSoldier('${soldierKey}', -1)">−</button>
          <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeSoldier('${soldierKey}', 10)">+10</button>
          <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeSoldier('${soldierKey}', 'max')">MAX</button>
        </div>
      </div>
    `;
  }
  list.innerHTML = html;
}

// Render une card de doctrine dans un container donné
// targetId : ID de l'élément où injecter le HTML (ex: 'fleet-compose-doctrine', 'fleet-detail-doctrine')
// labelId optionnel : ID du label section à masquer/afficher selon la présence d'une doctrine
function renderDoctrineCard(doctrine, targetId, labelId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const label = labelId ? document.getElementById(labelId) : null;

  if (!doctrine) {
    target.innerHTML = '';
    if (label) label.style.display = 'none';
    return;
  }
  if (label) label.style.display = '';

  target.innerHTML = `
    <div class="doctrine-card">
      <div class="doctrine-icon" style="color:${doctrine.color}">${renderIcon(doctrine.icon, {size:20})}</div>
      <div class="doctrine-info">
        <div class="doctrine-name" style="color:${doctrine.color}">${doctrine.name}</div>
        <div class="doctrine-short">${doctrine.short}</div>
      </div>
    </div>
  `;
}

function renderFleetComposeRecap() {
  const el = document.getElementById('fleet-compose-recap');
  if (!el) return;

  // Calculer les stats totales de la flotte en composition
  let totalShips = 0, totalAtk = 0, totalDef = 0;
  const comp = G.fleetComposing.composition;
  for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
    for (let tier = 1; tier <= 3; tier++) {
      const qty = comp[shipKey]['t' + tier];
      if (qty === 0) continue;
      totalShips += qty;
      const td = SHIP_TIERS[shipKey]?.[tier];
      if (!td) continue;
      totalAtk += qty * (td.atk || 0);
      totalDef += qty * (td.def || 0);
    }
  }

  // Capacité fret unifiée (passe 3.2 doctrine)
  const totalCargoCapacity = computeCargoCapacity(comp);
  const soldierFreight = computeSoldierFreight(G.fleetComposing.soldiers);
  const cargoFree = computeCargoFree(comp, G.fleetComposing.soldiers);

  // Ajouter atk/def des soldats embarqués
  const soldGarde = G.fleetComposing.soldiers.garde;
  const soldLourd = G.fleetComposing.soldiers.lourd;
  const totalSoldiers = soldGarde + soldLourd;
  let soldAtk = soldGarde * (DEFENSE_UNITS.garde?.atkPerUnit || 0) + soldLourd * (DEFENSE_UNITS.lourd?.atkPerUnit || 0);
  let soldDef = soldGarde * (DEFENSE_UNITS.garde?.defPerUnit || 0) + soldLourd * (DEFENSE_UNITS.lourd?.defPerUnit || 0);
  const grandAtk = totalAtk + soldAtk;
  const grandDef = totalDef + soldDef;

  if (totalShips === 0) {
    el.innerHTML = `<div style="text-align:center;padding:14px;font-size:11px;color:var(--mut);font-style:italic">Sélectionne au moins 1 vaisseau pour composer la flotte.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="dash-stat-row"><span class="lbl">Vaisseaux</span><span class="val" style="color:var(--blue)">${totalShips}</span></div>
    ${totalSoldiers > 0 ? `<div class="dash-stat-row"><span class="lbl">Soldats embarqués</span><span class="val" style="color:var(--blue)">${totalSoldiers}</span></div>` : ''}
    <div class="dash-stat-row" style="border-top:1px solid rgba(80,152,255,.15);padding-top:8px;margin-top:6px">
      <span class="lbl">Puissance attaque</span>
      <span class="val" style="color:var(--red)">${fmt(grandAtk)}</span>
    </div>
    <div class="dash-stat-row">
      <span class="lbl">Puissance défense</span>
      <span class="val" style="color:var(--cyan)">${fmt(grandDef)}</span>
    </div>
    ${totalCargoCapacity > 0 ? `
      <div class="dash-stat-row" style="border-top:1px solid rgba(80,152,255,.15);padding-top:8px;margin-top:6px">
        <span class="lbl">Capacité fret totale</span>
        <span class="val">${fmt(totalCargoCapacity)}</span>
      </div>
      ${soldierFreight > 0 ? `<div class="dash-stat-row"><span class="lbl" style="padding-left:10px">↳ Soldats</span><span class="val" style="color:var(--blue)">${fmt(soldierFreight)}</span></div>` : ''}
      <div class="dash-stat-row"><span class="lbl" style="padding-left:10px">↳ Cargo libre (ressources)</span><span class="val" style="color:var(--amber)">${fmt(cargoFree)}</span></div>
    ` : ''}
  `;
}

function updateComposeConfirmBtn() {
  const btn = document.getElementById('fleet-compose-confirm-btn');
  if (!btn) return;
  // Vérifier qu'on a au moins 1 vaisseau et un nom non vide
  let totalShips = 0;
  const comp = G.fleetComposing.composition;
  for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
    for (let tier = 1; tier <= 3; tier++) {
      totalShips += comp[shipKey]['t' + tier];
    }
  }
  const hasName = G.fleetComposing.name && G.fleetComposing.name.trim().length > 0;
  const canConfirm = totalShips > 0 && hasName;
  btn.disabled = !canConfirm;
  // Label dynamique selon mode (création / édition)
  const isEditing = !!G.fleetComposing.editingId;
  btn.textContent = isEditing ? 'Mettre à jour' : 'Préparer la flotte';
  // Le style :disabled est géré par CSS .fleet-cta, on ne touche pas à opacity inline
}

function adjustComposeShip(shipKey, tier, delta) {
  const tierKey = 't' + tier;
  const current = G.fleetComposing.composition[shipKey][tierKey];

  // getAvailableShips retourne le PLAFOND ABSOLU pour cette flotte
  // = stationed total - vaisseaux réservés par les AUTRES flottes préparées
  // (l'éditing est exclue du calcul des réservés via editingId)
  // En d'autres termes : c'est le nombre max que cette flotte peut contenir.
  const maxAllowed = getAvailableShips(shipKey, tier);

  let newVal;
  if (delta === 'max') {
    newVal = maxAllowed;
  } else if (delta > 0) {
    newVal = Math.min(current + delta, maxAllowed);
  } else {
    newVal = Math.max(0, current + delta);
  }
  G.fleetComposing.composition[shipKey][tierKey] = newVal;

  // Si on a retiré des Tankers, vérifier que les soldats embarqués tiennent toujours
  // dans la capacité fret restante. Sinon, désembarquer le surplus.
  if (shipKey === 'tanker' && newVal < current) {
    const comp = G.fleetComposing.composition;
    const soldiers = G.fleetComposing.soldiers;
    const newCapacity = computeCargoCapacity(comp);
    let currentSoldFreight = computeSoldierFreight(soldiers);
    if (currentSoldFreight > newCapacity) {
      // Désembarquer les soldats les plus lourds d'abord (Lourds avant Gardes)
      // jusqu'à respecter la nouvelle capacité
      const order = ['lourd', 'garde'];
      for (const sk of order) {
        while (currentSoldFreight > newCapacity && soldiers[sk] > 0) {
          soldiers[sk]--;
          currentSoldFreight = computeSoldierFreight(soldiers);
        }
      }
      // Notification douce
      toast('Soldats désembarqués (capacité réduite)');
    }
  }

  renderFleetCompose();
}

function adjustComposeSoldier(soldierKey, delta) {
  const current = G.fleetComposing.soldiers[soldierKey];
  const comp = G.fleetComposing.composition;
  const soldiers = G.fleetComposing.soldiers;
  const weight = DEFENSE_UNITS[soldierKey]?.soldierWeight || 0;

  if (weight === 0) return;

  // Calcul du max ajoutable :
  // 1) Limité par le fret libre dans les Tankers (en isolant ce soldat pour ne pas se compter soi-même)
  // 2) Limité par le stock total en garnison (getAvailableSoldiers exclut déjà la flotte en édition)
  const others = { ...soldiers, [soldierKey]: 0 };
  const cargoFreeWithoutSelf = computeCargoFree(comp, others);
  const maxByFret = Math.floor(cargoFreeWithoutSelf / weight);
  const maxByStock = getAvailableSoldiers(soldierKey); // plafond absolu, pas un delta
  const maxAllowed = Math.min(maxByFret, maxByStock);

  let newVal;
  if (delta === 'max') {
    newVal = maxAllowed;
  } else if (delta > 0) {
    newVal = Math.min(current + delta, maxAllowed);
  } else {
    newVal = Math.max(0, current + delta);
  }
  G.fleetComposing.soldiers[soldierKey] = newVal;
  renderFleetCompose();
}

function confirmFleetComposition() {
  if (!G.fleetComposing) return;
  // Vérifications
  let totalShips = 0;
  const comp = G.fleetComposing.composition;
  for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
    for (let tier = 1; tier <= 3; tier++) {
      totalShips += comp[shipKey]['t' + tier];
    }
  }
  if (totalShips === 0) { toast('Sélectionne au moins 1 vaisseau'); return; }
  if (!G.fleetComposing.name || G.fleetComposing.name.trim().length === 0) {
    toast('Donne un nom à ta flotte');
    return;
  }

  const isEditing = !!G.fleetComposing.editingId;

  if (isEditing) {
    // ─── Mode ÉDITION : update la flotte existante en place ───
    const fleetIdx = G.fleet.prepared.findIndex(f => f.id === G.fleetComposing.editingId);
    if (fleetIdx === -1) {
      toast('Flotte introuvable');
      return;
    }
    const existing = G.fleet.prepared[fleetIdx];
    existing.name = G.fleetComposing.name.trim();
    existing.composition = JSON.parse(JSON.stringify(G.fleetComposing.composition));
    existing.soldiers = { ...G.fleetComposing.soldiers };
    existing.modifiedAt = Date.now();
    ensureFleetHeroes(existing); // passe 3.4 — régénère les héros si nouveaux types présents
    G.fleetComposing = null;
    toast(`${existing.name} mise à jour`);
    // Retour à la fiche détail (REPLACE — on ne veut pas que goBack revienne sur le compose)
    selectedFleetId = existing.id;
    goto('fleet-detail', { replace: true });
    return;
  }

  // ─── Mode CRÉATION : nouvelle flotte ───
  if (G.fleet.prepared.length >= 5) {
    toast('Maximum 5 flottes préparées simultanément');
    return;
  }
  const fleetId = 'fleet_' + Date.now();
  const fleet = {
    id: fleetId,
    name: G.fleetComposing.name.trim(),
    composition: JSON.parse(JSON.stringify(G.fleetComposing.composition)),
    soldiers: { ...G.fleetComposing.soldiers },
    status: 'prepared', // passe 3.2 état : 'prepared' (au port) | 'deployed' (en orbite) | en mission (passe 3.3)
    heroes: { tanker: null, fregate: null, cuirasse: null }, // passe 3.4 — un héros par type
    createdAt: Date.now(),
  };
  ensureFleetHeroes(fleet); // passe 3.4 — génère les héros selon la composition
  G.fleet.prepared.push(sbTagWorld(fleet));
  G.fleetComposing = null;
  toast(`${fleet.name} prête au départ`);
  // Retour Vue d'amiral (REPLACE — on ne veut pas que goBack revienne sur le compose)
  goto('fleet', { replace: true });
}

function openFleetDetail(fleetId) {
  selectedFleetId = fleetId;
  goto('fleet-detail');
}
