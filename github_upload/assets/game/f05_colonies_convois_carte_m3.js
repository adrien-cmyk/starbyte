/* Starbyte — f05_colonies_convois_carte_m3.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';

function arkTimersTick() {
  clearInterval(arkMissionTimer);
  if (!(G.colonyMissions || []).length) return;
  arkMissionTimer = setInterval(() => {
    const ms = G.colonyMissions || [];
    if (!ms.length) { clearInterval(arkMissionTimer); return; }
    for (const m of ms) document.querySelectorAll(`[data-ark-timer="${m.id}"]`).forEach(el => { el.textContent = formatTankerDuration(Math.max(0, m.arriveAt - Date.now())); });
    const bar = document.getElementById('ark-mis-bar');
    const cur = ms.find(x => x.id === arkMissionId);
    if (bar && cur) bar.style.width = Math.min(100, Math.max(0, (Date.now() - cur.departAt) / Math.max(1, cur.arriveAt - cur.departAt) * 100)).toFixed(1) + '%';
  }, 1000);
}
function renderArkMission() {
  const m = (G.colonyMissions || []).find(x => x.id === arkMissionId) || (G.colonyMissions || [])[0];
  if (!m) { toast('L\'Arche est arrivée'); goto('fleet'); return; }
  arkMissionId = m.id;
  const row = (l, v, c) => `<div class="dash-stat-row"><span class="lbl">${l}</span><span class="val"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`;
  const pct = Math.min(100, Math.max(0, (Date.now() - m.departAt) / Math.max(1, m.arriveAt - m.departAt) * 100));
  document.getElementById('ark-mis-meta').textContent = `En route vers ${m.name} · elle ne revient pas`;
  document.getElementById('ark-mis-card').innerHTML =
    row('Destination', `${m.name} · ${m.coord}`, '#ffd9a8') +
    row('Arrivée dans', `<span data-ark-timer="${m.id}">${formatTankerDuration(Math.max(0, m.arriveAt - Date.now()))}</span>`, 'var(--amber)') +
    `<div style="height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:8px"><div id="ark-mis-bar" style="height:100%;width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#ff8a2a,#ffd9a8)"></div></div>`;
  arkTimersTick();
  setTimeout(() => mountArkMission3D(m), 0);
}
function mountArkMission3D(m) {
  const scr = document.getElementById('scr-ark-mission');
  const scroll = scr && scr.querySelector('.screen-scroll');
  if (!scr || !scroll || !window.WebGLRenderingContext || !window.Formation3D) return;
  let hero = document.getElementById('ark-mis-hero');
  if (!hero) { hero = document.createElement('div'); hero.id = 'ark-mis-hero'; hero.className = 'u3d u3d-hero'; scr.insertBefore(hero, scroll); }
  let space = document.getElementById('ark-mis-space');
  if (!space) { space = document.createElement('div'); space.id = 'ark-mis-space'; space.className = 'ud-hero-space'; const h = scroll.querySelector('.head'); scroll.insertBefore(space, h ? h.nextSibling : scroll.firstChild); }
  scr.classList.add('ud-hero', 'ud-ship');
  hero.style.display = ''; space.style.display = '';
  if (!hero.querySelector('.u3d-hint')) hero.insertAdjacentHTML('beforeend', `<div class="u3d-hint">AK-01 · en mission</div>`);
  requestAnimationFrame(() => { const hb = hero.getBoundingClientRect(), sb = space.getBoundingClientRect(); if (hb.height) hero.style.setProperty('--u3d-band', Math.max(0, hb.bottom - sb.bottom) + 'px'); });
  shipHeroGestures('scr-ark-mission', () => arkMission3D && arkMission3D.handle, null);
  if (arkMission3D && arkMission3D.id === m.id) return;
  unmountArkMission3D(true);
  hero.classList.add('u3d-loading');
  const fleet = { id: m.id, composition: { colonial: { t1: 1 } }, integrity: {} };
  arkMission3D = { id: m.id, handle: window.Formation3D.mount(hero, { fleet, mode: 'mission', shiftY: 0.2, onReady: () => hero.classList.remove('u3d-loading') }) };
}
function unmountArkMission3D(keepClasses) {
  if (arkMission3D) { try { arkMission3D.handle.dispose(); } catch (e) {} arkMission3D = null; }
  if (keepClasses) return;
  const hero = document.getElementById('ark-mis-hero'); if (hero) hero.style.display = 'none';
  const space = document.getElementById('ark-mis-space'); if (space) space.style.display = 'none';
  const scr = document.getElementById('scr-ark-mission'); if (scr) scr.classList.remove('ud-hero', 'ud-ship');
}
function arkReplayLaunch() {
  const m = (G.colonyMissions || []).find(x => x.id === arkMissionId);
  if (!window.SBArkLaunch || !m) return;
  unmountArkMission3D(true);
  SBArkLaunch.play({ name: m.name, eta: formatTankerDuration(Math.max(0, m.arriveAt - Date.now())), onDone: () => { if (!document.getElementById('scr-ark-mission').classList.contains('hidden')) renderArkMission(); } });
}

/* ═══════════ PATCH_2010_COLONIE — le voyage de l'Arche et la fondation (étape 3) + sélecteur de planète (étape 4) ═══════════ */
function sbFindPlanet(coord) {
  const sysKey = String(coord || '').split('-').slice(0, 3).join('-');
  const sys = (G.knownSystems || {})[sysKey];
  return sys && Array.isArray(sys.planets) ? sys.planets.find(p => p.coord === coord) || null : null;
}
// Voyage (PATCH_0111_ARCHE_9H) : 9 h minimum dans le même secteur (+ jusqu'à 1 h selon l'écart de système), +2 h par secteur d'écart ; plafonné à 20 h
function colonyTravelMs(coord) {
  const [, sec, sys] = String(coord || '').split('-');
  const dSec = (sec && MY_ADDRESS.sector) ? Math.abs(sec.charCodeAt(0) - MY_ADDRESS.sector.charCodeAt(0)) : 0;
  const dSys = Math.abs((parseInt(sys, 10) || 0) - (parseInt(MY_ADDRESS.system, 10) || 0));
  const min = 9 * 60 + dSec * 120 + Math.min(60, Math.round(dSys / 150));
  return Math.min(20 * 60, Math.max(9 * 60, min)) * 60000;
}
async function sbColonizeAsk(coord) {
  const p = sbFindPlanet(coord);
  if (!p) { toast('Planète inconnue : sonde-la d\'abord'); return; }
  if ((G.colonyMissions || []).some(m => m.coord === coord)) { toast('Une Arche est déjà en route vers cette planète'); return; }
  if (!(G.fleet.colonial > 0)) {
    toast(G.skills.colonialShipUnlocked ? 'Assemble une Arche coloniale au chantier orbital' : 'Il faut une Arche coloniale : Centre niveau 3, skill « Vaisseau colonial », puis le chantier orbital');
    return;
  }
  const name = String(p.customName || p.name || coord).toUpperCase();
  const ms = colonyTravelMs(coord);
  try { if (window.SBArkLaunch) SBArkLaunch.preload(); } catch (e) {}   // PATCH_2110_ARCHE_DEPART : le modèle se charge pendant que tu confirmes
  const ok = await sbConfirmWarning('Coloniser ' + name,
    `L'Arche coloniale part vers <strong>${name}</strong> (${coord}).<br><br>Voyage : <strong>${formatTankerDuration(ms)}</strong>. Elle ne reviendra pas : à l'arrivée, elle devient ta nouvelle colonie, avec son Centre de commandement et une antenne à bâtir.`, 'Lancer l\'Arche');
  if (!ok) return;
  G.fleet.colonial -= 1;
  if (!Array.isArray(G.colonyMissions)) G.colonyMissions = [];
  G.colonyMissions.push({ id: 'ark-' + Date.now().toString(36), coord, name, departAt: Date.now(), arriveAt: Date.now() + ms });
  try { saveGame(); } catch (e) {}
  // PATCH_2110_ARCHE_DEPART : le départ se vit en grand (cinématique plein écran), puis la fiche reprend
  const _after = () => { toast(`◈ L'Arche quitte l'orbite · arrivée dans ${formatTankerDuration(ms)}`); try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {} };
  if (window.SBArkLaunch) { try { SBArkLaunch.play({ name, eta: formatTankerDuration(ms), onDone: _after }); } catch (e) { _after(); } } else _after();
}
function sbColonyTick() {
  if (typeof G === 'undefined' || !Array.isArray(G.colonyMissions) || !G.colonyMissions.length) return;
  const now = Date.now();
  const due = G.colonyMissions.filter(m => m.arriveAt <= now);
  if (!due.length) return;
  for (const m of due) {
    // PATCH_2010_AUDIT — réservation en cours : en mémoire seulement (un _claiming sauvegardé bloquait l'Arche pour toujours)
    if (m._claiming) delete m._claiming;
    if (m._claimingAt && now - m._claimingAt < 30000) continue;
    const p = sbFindPlanet(m.coord);
    if (p && p.playerName && !p.myColony) { G.colonyMissions = G.colonyMissions.filter(x => x !== m); G.fleet.colonial = (G.fleet.colonial || 0) + 1; toast(`◈ ${m.name} est déjà occupée : l'Arche attend au chantier`); continue; }
    // multijoueur : l'adresse est réservée sur le serveur avant de poser l'Arche
    // connecté mais registre pas encore joint (démarrage) : on attend jusqu'à 2 min avant de poser sans réservation
    if (!window._sbRpc && !m._claimed && window.SBCloud && SBCloud.user && now - Math.max(m.arriveAt, _sbColonyLoadAt) < 120000) continue;
    if (window._sbRpc && !m._claimed && !m._pending) {
      m._claimingAt = now;
      Promise.resolve(window._sbRpc('mp_colony_claim', { p_address: m.coord, p_name: m.name })).catch(e => ({ error: { message: String(e && e.message || e) } })).then(({ error }) => {
        m._claimingAt = 0;
        if (error && /address_taken|colony_rate|too_many_colonies|address_invalid/.test(error.message || '')) {   // PATCH_2010_AUDIT — refus net : l'Arche revient
          const _msg = error.message || '';
          G.colonyMissions = G.colonyMissions.filter(x => x !== m);
          G.fleet.colonial = (G.fleet.colonial || 0) + 1;
          if (/address_taken/.test(_msg) && p) p.playerName = p.playerName || 'Commandant inconnu';
          toast(/colony_rate/.test(_msg) ? `◈ Trois colonies fondées en 24 h : l'Arche attend au chantier, réessaie demain`
            : /too_many_colonies/.test(_msg) ? `◈ Nombre maximum de colonies atteint : l'Arche attend au chantier`
            : /address_invalid/.test(_msg) ? `◈ Adresse inconnue du registre : l'Arche attend au chantier`
            : `◈ ${m.name} vient d'être prise par un autre commandant : l'Arche attend au chantier`);
          try { saveGame(); } catch (e) {}
          return;
        }
        m._claimed = !error;   // hors ligne ou autre erreur : on pose quand même, la colonie sera réservée à la prochaine publication
        if (error) m._pending = true;   // (une seule tentative : plus de boucle d'appels)
        setTimeout(sbColonyTick, 0);
      });
      continue;
    }
    G.colonyMissions = G.colonyMissions.filter(x => x !== m);
    const w = sbFoundColony({ name: m.name, coord: m.coord });
    w.mpClaimed = !!m._claimed;
    if (p) { p.myColony = w.id; p.playerName = (G.profile && (G.profile.pseudo || G.profile.name)) || 'Ta colonie'; p.type = 'habitable'; }
    sbColonyFounded(w);
  }
  try { saveGame(); } catch (e) {}
}
// PATCH_2110_COLONIE_NOM — nom d'une colonie : partout où il apparaît (planète, sélecteur, carte, registre)
function sbRenameColony(id, raw) {
  const w = (G.worlds || []).find(x => x && x.id === id);
  if (!w || w.kind !== 'colony') return false;
  const next = String(raw || '').trim().replace(/[<>&"`\\]/g, '').toUpperCase().slice(0, 24);
  if (next.length < 2) { toast('Nom trop court'); return false; }
  w.name = next;
  if (id === G.activeWorld) { if (G.planet) G.planet.name = next; }
  else if (w.data && w.data.planet) w.data.planet.name = next;
  try { const p = sbFindPlanet(w.coord); if (p) p.customName = next; } catch (e) {}
  try { saveGame(); } catch (e) {}
  try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); if (typeof renderPlanetMap === 'function') renderPlanetMap(); } catch (e) {}
  return true;
}
async function sbAskColonyName(id, first) {
  const w = (G.worlds || []).find(x => x && x.id === id);
  if (!w) return;
  const raw = await sbPrompt({
    title: first ? 'Baptise ta colonie' : 'Renommer la colonie',
    body: first ? `L'Arche s'est posée sur <strong>${w.name}</strong>. Donne un nom à ta nouvelle colonie : c'est ainsi que les autres commandants la verront.` : `Le nom de la colonie, vu par les autres commandants.`,
    placeholder: w.name, initialValue: w.name, confirmLabel: first ? 'Baptiser' : 'Renommer', maxLength: 24,
  });
  if (raw === null || !String(raw).trim()) return;
  if (sbRenameColony(id, raw)) toast(`◈ La colonie s'appelle désormais ${w.name}`);
}
async function sbColonyFounded(w) {
  try { await sbAskColonyName(w.id, true); } catch (e) {}   // PATCH_2110_COLONIE_NOM : on la baptise d'abord
  if (typeof sbNotifPush === 'function') { try { sbNotifPush({ title: 'Colonie fondée', text: `${w.name} : l'Arche s'est posée.` }); } catch (e) {} }
  const go = await sbConfirmWarning('◈ ' + w.name + ' est fondée',
    `L'Arche s'est posée sur <strong>${w.name}</strong> (${w.coord}). Elle est devenue le Centre de commandement d'une nouvelle colonie.<br><br>Tout est à bâtir : les parcelles se gagnent au match-3, et la nouvelle antenne verra ce que la capitale ne voyait pas.<br><br>Elle a son propre stock (la cale de l'Arche : 2 000 métal, 1 000 énergie, 500 cristal) ; envoie-lui des ressources par convoi de tankers. Change de planète en touchant son nom en haut de l'écran.`, 'Voir la colonie');
  if (go) { sbSwitchWorld(w.id); try { goto('planet'); } catch (e) {} }
}
// Sélecteur : toucher le nom de la planète en haut de l'écran
function sbOpenWorldPicker() {
  sbWorldsInit();
  if (G.worlds.length < 2) return;
  let el = document.getElementById('sb-worlds');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'sb-worlds';
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  el.innerHTML = `<div class="sbw-card"><div class="sbw-h">Tes planètes</div><div class="sbw-sub">Touche une planète pour t'y rendre. Le stock est commun à tout l'empire.</div>${G.worlds.map(w => `
    <button class="sbw-row${w.id === G.activeWorld ? ' on' : ''}" onclick="document.getElementById('sb-worlds').remove();sbSwitchWorld('${w.id}')">
      <span class="sbw-k">${w.kind === 'capital' ? 'Capitale' : 'Colonie'}</span>
      <span class="sbw-m"><b>${esc(w.id === 'home' ? ((w.id === G.activeWorld ? G.planet.name : w.name) || 'Capitale') : w.name)}</b>
      <span>${w.coord ? esc(w.coord) : (w.kind === 'capital' ? 'Planète d\'origine' : '')}${(() => { const R = sbWorldRes(w.id); return R && R.metal ? ' · ' + fmt(R.metal.v) + ' métal' : ''; })()}</span></span>
      <span class="sbw-go">${w.id === G.activeWorld ? 'Tu es ici' : 'Y aller →'}</span>
    </button>${w.kind === 'colony' ? `<button class="sbw-ren" onclick="event.stopPropagation();document.getElementById('sb-worlds').remove();sbAskColonyName('${w.id}')">Renommer ${esc(w.name)}</button>` : ''}`).join('')}${(G.colonyMissions || []).map(m => `<div class="sbw-row off" style="cursor:pointer" onclick="document.getElementById('sb-worlds').remove();openArkMission('${m.id}')"><b>${esc(m.name)}</b><span>Arche en route · ${formatTankerDuration(Math.max(0, m.arriveAt - Date.now()))}</span></div>`).join('')}
    <button class="sbw-x" onclick="document.getElementById('sb-worlds').remove()">Fermer</button></div>`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
}

// PATCH_2010_COLONIE (multijoueur, v18) — chaque colonie publie sa défense et ses bâtiments à côté de la capitale
async function sbPublishColonies(client) {
  if (!client) return;
  window._sbRpc = (fn, args) => client.rpc(fn, args);
  for (const w of (G.worlds || [])) {
    if (!w || w.kind !== 'colony' || !w.coord || w.mpLost) continue;
    try {
      if (!w.mpClaimed) {
        const { error } = await client.rpc('mp_colony_claim', { p_address: w.coord, p_name: w.name });
        if (error) {
          console.warn('[colonie] réservation', w.coord, error.message);
          // PATCH_2010_AUDIT — adresse prise par un autre commandant pendant une fondation hors ligne : on le dit une fois, on n'insiste plus
          if (/address_taken/.test(error.message || '') && !w.mpLost) { w.mpLost = true; toast(`◈ ${w.name} n'a pas pu être inscrite au registre : un autre commandant s'y est installé. Elle reste à toi, mais invisible des autres joueurs.`); try { saveGame(); } catch (e) {} }
          continue;
        }
        w.mpClaimed = true;
      }
      const snap = sbWithWorld(w.id, () => _mpWorldSnapshotHome());
      const _R = sbWorldRes(w.id) || {}, _st = { metal: Math.floor((_R.metal && _R.metal.v) || 0), energie: Math.floor((_R.energie && _R.energie.v) || 0), cristal: Math.floor((_R.cristal && _R.cristal.v) || 0) };   // 30/10 : le stock de la colonie
      let { error } = await client.rpc('mp_colony_publish', { p_address: w.coord, p_name: w.name, p_level: snap.level, p_defense: snap.defense, p_buildings: snap.buildings, p_stocks: _st });
      if (error && /p_stocks|function|schema cache|PGRST202/i.test(error.message || '')) ({ error } = await client.rpc('mp_colony_publish', { p_address: w.coord, p_name: w.name, p_level: snap.level, p_defense: snap.defense, p_buildings: snap.buildings }));
      if (error) console.warn('[colonie] publication', w.coord, error.message);
    } catch (e) { console.warn('[colonie] publication', e); }
  }
}
function sbDepot(w) {
  if (!w.depot) w.depot = { metal: 0, energie: 0, cristal: 0, nextShip: Date.now() + DEPOT_SHIP_MS };
  if (!w.depot.nextShip) w.depot.nextShip = Date.now() + DEPOT_SHIP_MS;
  return w.depot;
}
function _sbWorldParcels(w) {
  if (!w) return [];
  if (w.id === (G.activeWorld || 'home')) return (G.planet && G.planet.parcels) || [];
  return (w.data && w.data.planet && w.data.planet.parcels) || [];
}
function sbDepotCap(w, k) {
  let cap = DEPOT_BASE;
  for (const p of _sbWorldParcels(w)) {
    if (!p || p.state !== 'built' || p.damaged || p.building !== 'silo_' + k) continue;
    cap += DEPOT_SILO[Math.max(0, Math.min(2, (p.lvl || 1) - 1))];
  }
  return cap;
}
function sbDepotProduce(w, prod, ms, at) {
  const d = sbDepot(w);
  let t0 = at - ms, guard = 0;
  while (t0 < at && guard++ < 200) {
    const t1 = Math.min(at, d.nextShip);
    const h = Math.max(0, t1 - t0) / 3600000;
    for (const k of ['metal', 'energie', 'cristal']) {
      const v = (prod[k] || 0) * h * (window.SBSkills ? SBSkills.prodMult(k) : 1);
      if (v > 0) d[k] = Math.min(sbDepotCap(w, k), (d[k] || 0) + v);
    }
    if (t1 >= d.nextShip) { sbDepotShip(w, true, t1); }
    t0 = t1;
  }
}
// expédition : le dépôt rejoint le stock de l'empire (même au-delà du stockage, comme une cargaison livrée)
function sbDepotShip(w, auto, when) {
  const d = sbDepot(w);
  const got = {};
  for (const k of ['metal', 'energie', 'cristal']) {
    const q = Math.floor(d[k] || 0);
    if (q > 0 && G.res[k]) { G.res[k].v = (G.res[k].v || 0) + q; got[k] = q; }
    d[k] = Math.max(0, (d[k] || 0) - q);
  }
  d.nextShip = (when || Date.now()) + DEPOT_SHIP_MS;
  d.lastShip = { at: when || Date.now(), got, auto: !!auto };
  const sum = Object.values(got).reduce((a, b) => a + b, 0);
  if (sum > 0 && (!auto || Date.now() - (when || 0) < 120000)) {
    try { toast(`◈ Convoi de ${w.name || 'la colonie'} arrivé : ${Object.entries(got).map(([k, q]) => fmt(q) + ' ' + (DEPOT_LB[k] || k)).join(' · ')}`); } catch (e) {}
  }
  return got;
}
function sbDepotShipNow(wid) {
  const w = (G.worlds || []).find(x => x && x.id === wid);
  if (!w) return;
  const d = sbDepot(w);
  const sum = Math.floor((d.metal || 0) + (d.energie || 0) + (d.cristal || 0));
  if (sum <= 0) { toast('Le dépôt est vide'); return; }
  const wait = (d.manualAt || 0) + DEPOT_MANUAL_CD - Date.now();
  if (wait > 0) { toast(`Prochain convoi express dans ${formatTankerDuration(wait)}`); return; }
  if ((G.fuel || 0) < DEPOT_MANUAL_FUEL) { toast(`Il faut ${DEPOT_MANUAL_FUEL} carburant pour un convoi express`); return; }
  G.fuel -= DEPOT_MANUAL_FUEL;
  d.manualAt = Date.now();
  sbDepotShip(w, false);
  try { saveGame(); } catch (e) {}
  try { sbDepotRender(); } catch (e) {}
  const sh = document.getElementById('sb-depot-sheet'); if (sh) { sh.remove(); sbDepotOpen(wid); }
}
function sbDepotLine(w) {
  const d = sbDepot(w);
  const tot = ['metal', 'energie', 'cristal'].reduce((n, k) => n + Math.floor(d[k] || 0), 0);
  const cap = ['metal', 'energie', 'cristal'].reduce((n, k) => n + sbDepotCap(w, k), 0);
  return { tot, cap, eta: Math.max(0, d.nextShip - Date.now()) };
}
// pastille sous le nom de la planète, sur une colonie
// 30/10 (Adrien) — chaque planète a son stock : la pastille sous le nom de la planète ouvre le CONVOI (tankers)
function sbDepotRender() {
  let el = document.getElementById('sb-depot-chip');
  const multi = Array.isArray(G.worlds) && G.worlds.length > 1;
  if (!multi) { if (el) el.remove(); return; }
  const wp = document.getElementById('w-planet');
  const host = wp && wp.parentNode;
  if (!host) return;
  if (!el) { el = document.createElement('button'); el.id = 'sb-depot-chip'; el.type = 'button'; el.onclick = () => sbOpenConvoy(); }
  if (el.parentNode !== host || el.previousSibling !== wp) host.insertBefore(el, wp.nextSibling);
  const mine = (G.resTransfers || []).filter(x => x.from === G.activeWorld || x.to === G.activeWorld);
  const next = mine.filter(x => x.phase === 'going' && x.to === G.activeWorld).sort((a, b) => a.arriveAt - b.arriveAt)[0];
  el.className = '';
  el.innerHTML = `<span>⇄ Convoi</span>${next ? `<i>arrivage dans ${formatTankerDuration(Math.max(0, next.arriveAt - Date.now()))}</i>` : mine.length ? `<i>${mine.length} en route</i>` : '<i>envoyer des ressources</i>'}`;
}
function sbDepotOpen() { sbOpenConvoy(); }   // brouillon : { from, to, q: {metal…} }
function _sbConvoyCap() {
  const st = (G.fleet && G.fleet.stationed && G.fleet.stationed.tanker) || {};
  let cap = 0, n = 0;
  for (let t = 1; t <= 3; t++) { const q = st['t' + t] || 0; n += q; cap += q * ((SHIP_TIERS.tanker[t] && SHIP_TIERS.tanker[t].cargo) || 0); }
  return { cap, n };
}
// les tankers nécessaires : les plus gros d'abord
function _sbConvoyTankers(total) {
  const st = (G.fleet && G.fleet.stationed && G.fleet.stationed.tanker) || {};
  const use = { t1: 0, t2: 0, t3: 0 }; let left = total;
  for (let t = 3; t >= 1 && left > 0; t--) {
    const c = (SHIP_TIERS.tanker[t] && SHIP_TIERS.tanker[t].cargo) || 0, have = st['t' + t] || 0;
    if (!c || !have) continue;
    const k = Math.min(have, Math.ceil(left / c)); use['t' + t] = k; left -= k * c;
  }
  return left > 0 ? null : use;
}
function sbOpenConvoy() {
  sbWorldsInit();
  const others = G.worlds.filter(w => w.id !== G.activeWorld);
  if (!others.length) { toast('Il faut une deuxième planète pour envoyer un convoi'); return; }
  if (!_sbCv || _sbCv.from !== G.activeWorld) _sbCv = { from: G.activeWorld, to: others[0].id, q: {} };
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = (w) => w.id === G.activeWorld ? G.planet.name : (w.id === 'home' ? (w.data && w.data.planet && w.data.planet.name) || w.name : w.name);
  const { cap, n } = _sbConvoyCap();
  const used = Object.values(_sbCv.q).reduce((a, b) => a + (b || 0), 0);
  const ms = sbTransferMs(_sbCv.from, _sbCv.to);
  const rows = CONVOY_RES.map(([k, lb]) => {
    const have = Math.floor((G.res[k] && G.res[k].v) || 0), cur = Math.min(_sbCv.q[k] || 0, have);
    const max = Math.max(0, Math.min(have, cap - used + cur));
    return `<div class="cv-r"><span>${lb}</span><input type="range" min="0" max="${max}" step="${Math.max(1, Math.floor(max / 100))}" value="${cur}" ${max ? '' : 'disabled'}
      oninput="_sbCv.q['${k}']=+this.value;this.parentNode.querySelector('b').textContent=fmt(+this.value)" onchange="sbOpenConvoy()"><b>${fmt(cur)}</b></div>`;
  }).join('');
  const enroute = (G.resTransfers || []).map(x => `<div class="sbx-transit">⇄ ${Object.entries(x.cargo).filter(([, q]) => q > 0).map(([k, q]) => fmt(q) + ' ' + ((CONVOY_RES.find(r => r[0] === k) || [k, k])[1]).toLowerCase()).join(' · ')}
    · ${x.phase === 'going' ? `vers ${esc(x.toName)} · arrivée dans ${formatTankerDuration(Math.max(0, x.arriveAt - Date.now()))}` : `tankers en retour vers ${esc(x.fromName)} · ${formatTankerDuration(Math.max(0, x.backAt - Date.now()))}`}</div>`).join('');
  let el = document.getElementById('sb-xfer');
  if (!el) { el = document.createElement('div'); el.id = 'sb-xfer'; el.addEventListener('click', (e) => { if (e.target === el) el.remove(); }); document.body.appendChild(el); }
  const need = used > 0 ? _sbConvoyTankers(used) : null;
  el.innerHTML = `<div class="sbx-card">
    <div class="sbx-h">Convoi de ressources</div>
    <div class="sbx-sub">Depuis <b>${esc(G.planet.name)}</b> vers :</div>
    <div class="sbx-dest">${others.map(w => `<button class="${w.id === _sbCv.to ? 'on' : ''}" onclick="_sbCv.to='${w.id}';sbOpenConvoy()">${esc(nameOf(w))}<i>${w.kind === 'capital' ? 'Capitale' : 'Colonie'}</i></button>`).join('')}</div>
    ${n ? `<div class="sbx-sub">Tankers à quai : <b>${n}</b> · cale totale <b>${fmt(cap)}</b> · chargé <b>${fmt(used)}</b></div>${rows}`
        : `<div class="sbx-empty">Aucun tanker à quai sur ${esc(G.planet.name)}. Construis-en un au chantier orbital : c'est lui qui porte la cargaison.</div>`}
    ${enroute}
    ${(() => { const aw = sbActiveWorld(); if (!aw || aw.kind !== 'colony') return ''; const on = aw.autoConvoy !== false;
      return `<button class="sbx-fleet${on ? ' on' : ''}" style="margin-top:10px" onclick="sbToggleAutoConvoy('${aw.id}')"><b>Convoi automatique vers la capitale : ${on ? 'activé' : 'coupé'}</b><i>Toutes les 6 h, si des tankers sont à quai : l'excédent de métal, d'énergie et de cristal part à la capitale. La colonie garde 30 % de ses silos.${on && aw.autoNext ? ' Prochain départ dans ' + formatTankerDuration(Math.max(0, aw.autoNext - Date.now())) + '.' : ''}</i></button>`; })()}
    <div class="sbx-sub" style="margin-top:10px">Voyage : <b>${formatTankerDuration(ms)}</b> · les tankers livrent puis reviennent à quai (aller-retour).</div>
    <button class="sbx-go${used > 0 && need ? '' : ' off'}" onclick="sbLaunchConvoy()">Lancer le convoi</button>
    <button class="sbx-x" onclick="document.getElementById('sb-xfer').remove()">Fermer</button></div>`;
}
// à appeler sur la planète de départ (planète affichée ou sbWithWorld) : charge, fait partir les tankers
function _sbConvoySend(fromId, toId, cargo, auto) {
  const tot = Object.values(cargo).reduce((a, b) => a + b, 0);
  const tk = _sbConvoyTankers(tot);
  if (!tk) return null;
  for (const [k, q] of Object.entries(cargo)) G.res[k].v -= q;
  for (const t of ['t1', 't2', 't3']) G.fleet.stationed.tanker[t] = Math.max(0, (G.fleet.stationed.tanker[t] || 0) - tk[t]);
  const ms = sbTransferMs(fromId, toId), to = sbWorld(toId), now = Date.now();
  if (!Array.isArray(G.resTransfers)) G.resTransfers = [];
  const x = { id: 'cv-' + now.toString(36) + Math.random().toString(36).slice(2, 5), from: fromId, to: toId, cargo, tankers: tk, phase: 'going', departAt: now, arriveAt: now + ms, backAt: now + 2 * ms, auto: !!auto,
    toName: to.id === 'home' ? ((to.data && to.data.planet && to.data.planet.name) || to.name) : to.name, fromName: G.planet.name };
  G.resTransfers.push(x);
  return x;
}
function _sbConvoyAuto(w) {
  if (!w || w.kind !== 'colony' || w.autoConvoy === false) return;
  const now = Date.now();
  if (!w.autoNext) { w.autoNext = now + CONVOY_AUTO_MS; return; }
  if (now < w.autoNext) return;
  w.autoNext = now + CONVOY_AUTO_MS;
  if ((G.resTransfers || []).some(x => x.auto && x.from === w.id && x.phase === 'going')) return;
  sbWithWorld(w.id, () => {
    const { cap } = _sbConvoyCap();
    if (!cap) return;
    const cargo = {}; let left = cap;
    for (const k of ['metal', 'energie', 'cristal']) {
      const r = G.res[k]; if (!r) continue;
      const q = Math.max(0, Math.min(left, Math.floor(r.v - r.max * CONVOY_AUTO_KEEP)));
      if (q >= 50) { cargo[k] = q; left -= q; }
    }
    if (!Object.keys(cargo).length) return;
    const x = _sbConvoySend(w.id, 'home', cargo, true);
    if (x) toast(`⇄ ${w.name || 'La colonie'} envoie son excédent à ${x.toName} : ${Object.entries(cargo).map(([k, q]) => fmt(q) + ' ' + ((CONVOY_RES.find(r => r[0] === k) || [k, k])[1]).toLowerCase()).join(' · ')}`);
  });
}
function sbToggleAutoConvoy(wid) {
  const w = sbWorld(wid); if (!w) return;
  w.autoConvoy = w.autoConvoy === false;
  if (w.autoConvoy) w.autoNext = Date.now() + CONVOY_AUTO_MS;
  try { saveGame(); } catch (e) {}
  sbOpenConvoy();
}
function sbLaunchConvoy() {
  const x0 = _sbCv; if (!x0 || x0.from !== G.activeWorld || !sbWorld(x0.to)) return;
  const cargo = {}; let total = 0;
  for (const [k] of CONVOY_RES) { const q = Math.max(0, Math.min(Math.floor(x0.q[k] || 0), Math.floor((G.res[k] && G.res[k].v) || 0))); if (q > 0) { cargo[k] = q; total += q; } }
  if (!total) { toast('Choisis ce que tu envoies'); return; }
  const sent = _sbConvoySend(x0.from, x0.to, cargo, false);
  if (!sent) { toast('Pas assez de tankers à quai pour cette cargaison'); sbOpenConvoy(); return; }
  const ms = sent.arriveAt - sent.departAt;
  _sbCv = null;
  const el = document.getElementById('sb-xfer'); if (el) el.remove();
  toast(`⇄ Convoi en route vers ${sent.toName} · arrivée dans ${formatTankerDuration(ms)}`);
  try { saveGame(); } catch (e) {}
  try { sbDepotRender(); if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
}
function sbConvoyTick() {
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) { try { _sbConvoyAuto(w); } catch (e) { console.warn('[convoi auto]', e); } }
  if (!Array.isArray(G.resTransfers) || !G.resTransfers.length) return;
  const now = Date.now(); let changed = false;
  for (const x of G.resTransfers.slice()) {
    if (x.phase === 'going' && now >= x.arriveAt) {
      const dest = sbWorld(x.to) ? x.to : x.from;
      sbWithWorld(dest, () => { for (const [k, q] of Object.entries(x.cargo || {})) if (G.res[k]) G.res[k].v = (G.res[k].v || 0) + q; });   // une cargaison livrée entre même au-delà des silos
      x.phase = 'back'; changed = true;
      toast(`⇄ Convoi arrivé à ${x.toName} : ${Object.entries(x.cargo).map(([k, q]) => fmt(q) + ' ' + ((CONVOY_RES.find(r => r[0] === k) || [k, k])[1]).toLowerCase()).join(' · ')}`);
    }
    if (x.phase === 'back' && now >= x.backAt) {
      const home = sbWorld(x.from) ? x.from : 'home';
      sbWithWorld(home, () => { if (!G.fleet.stationed) G.fleet.stationed = _sbEmptyShips(); for (const t of ['t1', 't2', 't3']) G.fleet.stationed.tanker[t] = (G.fleet.stationed.tanker[t] || 0) + ((x.tankers && x.tankers[t]) || 0); });
      G.resTransfers = G.resTransfers.filter(y => y !== x); changed = true;
    }
  }
  if (changed) { try { saveGame(); } catch (e) {} try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {} }
}
function _sbEmptyShips() { return { tanker: { t1: 0, t2: 0, t3: 0 }, fregate: { t1: 0, t2: 0, t3: 0 }, cuirasse: { t1: 0, t2: 0, t3: 0 } }; }
function _sbShipCount(c) { let n = 0; for (const k of FLEET_SHIP_KEYS) for (const t of ['t1', 't2', 't3']) n += (c && c[k] && c[k][t]) || 0; return n; }
function sbWorldCoord(w) { return (w && (w.id === 'home' ? (typeof MY_COORD_STRING !== 'undefined' ? MY_COORD_STRING : w.coord) : w.coord)) || ''; }
// Transfert : 30 min dans le même secteur, +1 h par secteur d'écart, plafonné à 8 h
function sbTransferMs(fromId, toId) {
  const a = sbWorldCoord(sbWorld(fromId)).split('-'), b = sbWorldCoord(sbWorld(toId)).split('-');
  const dSec = (a[1] && b[1]) ? Math.abs(a[1].charCodeAt(0) - b[1].charCodeAt(0)) : 0;
  const dSys = Math.abs((parseInt(a[2], 10) || 0) - (parseInt(b[2], 10) || 0));
  return Math.min(8 * 60, 30 + dSec * 60 + Math.min(30, Math.round(dSys / 300))) * 60000;
}   // brouillon du transfert : { from, to, fleetId }
// PATCH_2110_XFER_FLOTTE (Adrien, 21/10) : on transfère une FLOTTE composée (vaisseaux, soldats, héros), pas des vaisseaux en vrac
function _sbXferFleets() { return ((G.fleet && G.fleet.prepared) || []).filter(f => _sbMine(f) && ['prepared', 'deployed'].includes(f.status || 'prepared') && _sbShipCount(f.composition) > 0); }
// PATCH_2110_XFER_REPAIR (Adrien) : une flotte en réparation peut partir, mais seulement une fois réparée à 60 % au moins
// (la réparation avance linéairement entre son intégrité de départ et 100 %)
function _sbFleetIntegrityNow(f) {
  let avg = 100; try { avg = fleetDamageSummary(f).avg; } catch (e) {}
  if (f.repair && f.repair.endsAt > f.repair.startedAt) {
    const k = Math.max(0, Math.min(1, (Date.now() - f.repair.startedAt) / (f.repair.endsAt - f.repair.startedAt)));
    avg = Math.round(avg + (100 - avg) * k);
  }
  return avg;
}
function _sbXferBlocked(f) { return !!(f && f.repair && _sbFleetIntegrityNow(f) < 60); }
function _sbFleetLine(f) {
  const parts = [];
  for (const k of FLEET_SHIP_KEYS) { let n = 0; for (const t of ['t1', 't2', 't3']) n += (f.composition && f.composition[k] && f.composition[k][t]) || 0; if (n) parts.push(n + ' ' + ({ tanker: 'tanker', fregate: 'frégate', cuirasse: 'cuirassé' })[k] + (n > 1 ? 's' : '')); }
  const so = f.soldiers || {}; const ns = (so.garde || 0) + (so.lourd || 0);
  if (ns) parts.push(ns + ' soldat' + (ns > 1 ? 's' : ''));
  return parts.join(' · ');
}
function sbOpenTransfer() {
  sbWorldsInit();
  const others = G.worlds.filter(w => w.id !== G.activeWorld);
  if (!others.length) { toast('Il faut une deuxième planète pour transférer une flotte'); return; }
  const fleets = _sbXferFleets();
  if (!_sbXfer || _sbXfer.from !== G.activeWorld) _sbXfer = { from: G.activeWorld, to: others[0].id, fleetId: null };
  if (!fleets.some(f => f.id === _sbXfer.fleetId && !_sbXferBlocked(f))) { const ok1 = fleets.filter(f => !_sbXferBlocked(f)); _sbXfer.fleetId = ok1.length === 1 ? ok1[0].id : null; }
  let el = document.getElementById('sb-xfer');
  if (!el) {
    el = document.createElement('div'); el.id = 'sb-xfer';
    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
    document.body.appendChild(el);
  }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = (w) => w.id === G.activeWorld ? G.planet.name : (w.id === 'home' ? (w.data && w.data.planet && w.data.planet.name) || w.name : w.name);
  const rows = fleets.map(f => _sbXferBlocked(f)
    ? `<div class="sbx-fleet off"><b>${esc(f.name || 'Flotte')}</b><i>${esc(_sbFleetLine(f))} · en réparation · ${_sbFleetIntegrityNow(f)} % (départ possible dès 60 %)</i></div>`
    : `<button class="sbx-fleet${f.id === _sbXfer.fleetId ? ' on' : ''}" onclick="_sbXfer.fleetId='${f.id}';sbOpenTransfer()">
      <b>${esc(f.name || 'Flotte')}</b><i>${esc(_sbFleetLine(f))} · ${(f.status || 'prepared') === 'deployed' ? 'en orbite' : 'au sol'}${f.repair ? ` · en réparation · ${_sbFleetIntegrityNow(f)} % (elle continue en route)` : ''}</i></button>`);
  const enroute = (G.fleetTransfers || []).filter(x => x.from === G.activeWorld || x.to === G.activeWorld)
    .map(x => `<div class="sbx-transit">⇄ ${esc(x.fleetName || (_sbShipCount(x.ships) + ' vaisseaux'))} · ${x.from === G.activeWorld ? 'vers ' + esc(x.toName) : 'depuis ' + esc(x.fromName)} · arrivée dans ${formatTankerDuration(Math.max(0, x.arriveAt - Date.now()))}</div>`).join('');
  const ms = sbTransferMs(_sbXfer.from, _sbXfer.to);
  const ok = !!_sbXfer.fleetId;
  el.innerHTML = `<div class="sbx-card">
    <div class="sbx-h">Transférer une flotte</div>
    <div class="sbx-sub">Depuis <b>${esc(G.planet.name)}</b> vers :</div>
    <div class="sbx-dest">${others.map(w => `<button class="${w.id === _sbXfer.to ? 'on' : ''}" onclick="_sbXfer.to='${w.id}';sbOpenTransfer()">${esc(nameOf(w))}<i>${w.kind === 'capital' ? 'Capitale' : 'Colonie'}</i></button>`).join('')}</div>
    <div class="sbx-sub">Flotte :</div>
    ${rows.length ? rows.join('') : '<div class="sbx-empty">Aucune flotte prête sur cette planète. Compose d\'abord une flotte (bouton « Composer »), puis transfère-la.</div>'}
    ${enroute}
    <div class="sbx-sub" style="margin-top:10px">Voyage : <b>${formatTankerDuration(ms)}</b> · la flotte n'est disponible nulle part pendant le trajet ; elle arrive au sol, avec ses soldats.</div>
    <button class="sbx-go${ok ? '' : ' off'}" onclick="sbLaunchTransfer()">Lancer le transfert</button>
    <button class="sbx-x" onclick="document.getElementById('sb-xfer').remove()">Fermer</button></div>`;
}
function sbLaunchTransfer() {
  const x = _sbXfer;
  if (!x || !x.fleetId) return;
  const f = _sbXferFleets().find(y => y.id === x.fleetId);
  if (x.from !== G.activeWorld || !sbWorld(x.to) || !f) { _sbXfer = null; toast('Cette flotte n\'est plus disponible'); sbOpenTransfer(); return; }
  if (_sbXferBlocked(f)) { toast(`${f.name || 'La flotte'} n'est réparée qu'à ${_sbFleetIntegrityNow(f)} % : départ possible dès 60 %`); sbOpenTransfer(); return; }
  // les vaisseaux et les soldats quittent la planète de départ
  for (const k of FLEET_SHIP_KEYS) for (const t of ['t1', 't2', 't3']) {
    const n = (f.composition[k] && f.composition[k][t]) || 0;
    if (n) G.fleet.stationed[k][t] = Math.max(0, (G.fleet.stationed[k][t] || 0) - n);
  }
  for (const [k, n] of Object.entries(f.soldiers || {})) if (n > 0 && typeof loseSoldiers === 'function') loseSoldiers(k, n);
  const ms = sbTransferMs(x.from, x.to);
  const to = sbWorld(x.to);
  f.status = 'transfer'; f.world = 'transit:' + x.to;   // comptée nulle part pendant le trajet
  if (!Array.isArray(G.fleetTransfers)) G.fleetTransfers = [];
  G.fleetTransfers.push({ id: 'xf-' + Date.now().toString(36), fleetId: f.id, fleetName: f.name || 'Flotte', from: x.from, to: x.to,
    toName: to.id === 'home' ? ((to.data && to.data.planet && to.data.planet.name) || to.name) : to.name, fromName: G.planet.name, departAt: Date.now(), arriveAt: Date.now() + ms });
  _sbXfer = null;
  const el = document.getElementById('sb-xfer'); if (el) el.remove();
  toast(`⇄ ${f.name || 'Flotte'} en route · arrivée dans ${formatTankerDuration(ms)}`);
  try { saveGame(); } catch (e) {}
  try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
}
function sbTransferTick() {
  if (!Array.isArray(G.fleetTransfers) || !G.fleetTransfers.length) return;
  const now = Date.now();
  const due = G.fleetTransfers.filter(x => x.arriveAt <= now);
  if (!due.length) return;
  for (const x of due) {
    G.fleetTransfers = G.fleetTransfers.filter(y => y !== x);
    const dest = sbWorld(x.to) ? x.to : (sbWorld(x.from) ? x.from : 'home');
    if (x.fleetId) {   // PATCH_2110_XFER_FLOTTE — la flotte arrive au sol, vaisseaux et soldats rejoignent la planète
      const f = ((G.fleet && G.fleet.prepared) || []).find(y => y.id === x.fleetId);
      if (f) {
        sbWithWorld(dest, () => {
          if (!G.fleet.stationed) G.fleet.stationed = _sbEmptyShips();
          for (const k of FLEET_SHIP_KEYS) {
            if (!G.fleet.stationed[k]) G.fleet.stationed[k] = { t1: 0, t2: 0, t3: 0 };
            for (const t of ['t1', 't2', 't3']) G.fleet.stationed[k][t] = (G.fleet.stationed[k][t] || 0) + ((f.composition[k] && f.composition[k][t]) || 0);
          }
          for (const [k, n] of Object.entries(f.soldiers || {})) {
            if (!(n > 0)) continue;
            if (!G.defense.units[k]) G.defense.units[k] = { qty: 0, dmg: 0 };
            G.defense.units[k].qty = (G.defense.units[k].qty || 0) + n;
          }
        });
        f.world = dest; f.status = 'prepared';
      }
      toast(`⇄ ${x.fleetName || 'Flotte'} arrivée à ${x.toName}`);
      continue;
    }
    sbWithWorld(dest, () => {
      if (!G.fleet.stationed) G.fleet.stationed = _sbEmptyShips();
      for (const k of FLEET_SHIP_KEYS) {
        if (!G.fleet.stationed[k]) G.fleet.stationed[k] = { t1: 0, t2: 0, t3: 0 };
        for (const t of ['t1', 't2', 't3']) G.fleet.stationed[k][t] = (G.fleet.stationed[k][t] || 0) + ((x.ships[k] && x.ships[k][t]) || 0);
      }
    });
    toast(`⇄ ${_sbShipCount(x.ships)} vaisseau${_sbShipCount(x.ships) > 1 ? 'x' : ''} arrivé${_sbShipCount(x.ships) > 1 ? 's' : ''} à ${x.toName}`);
  }
  try { saveGame(); } catch (e) {}
  try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
}

// Construit un vaisseau militaire (Tanker / Frégate / Cuirassé)
function buildShip(shipKey, qty) {
  qty = qty || 1;
  const tier = shipBuildTier();   // PATCH_2010_VAISSEAUX_T1 : le tier choisi, pas forcément celui du chantier
  if (tier === 0) {
    toast('Chantier orbital requis');
    return;
  }
  const meta = SHIP_UNITS[shipKey];
  const tierData = SHIP_TIERS[shipKey]?.[tier];
  if (!meta || !tierData) {
    toast('Vaisseau invalide');
    return;
  }
  // Coût total pour la commande complète
  const totalCost = {};
  for (const [res, q] of Object.entries(tierData.cost)) {
    totalCost[res] = q * qty;
  }
  // Vérifier ressources
  for (const [res, q] of Object.entries(totalCost)) {
    if (!G.res[res] || G.res[res].v < q) {
      const missing = q - (G.res[res]?.v || 0);
      toast(`Manque ${fmt(missing)} ${res}`);
      return;
    }
  }
  // Débiter
  for (const [res, q] of Object.entries(totalCost)) {
    G.res[res].v -= q;
  }
  // Durée par vaisseau (cf. SHIP_BUILD_DURATIONS — option B rythme moyen)
  const baseDuration = SHIP_BUILD_DURATIONS[tier] || SHIP_BUILD_DURATIONS[1];
  const finalDuration = Math.max(1, Math.round(baseDuration / G.skills.productionSpeed * (window.SBSkills ? SBSkills.durMult('ships') : 1)));
  // Ajouter à la queue Chantier
  QUEUES.shipyard.commands.push({
    unitKey: shipKey,    // 'tanker' | 'fregate' | 'cuirasse'
    shipTier: tier,      // pour livraison correcte
    totalQty: qty,
    completed: 0,
    currentElapsed: 0,
    unitDuration: finalDuration,
    cost: totalCost,
    addedAt: Date.now(),
  });
  toast(`${tierData.name} × ${qty} en assemblage${window.SBSkills ? SBSkills.durTag('ships') : ''}`);
  // Render
  renderShipyard();
  startQueueTicker();
}

// Hangar : flotte stationnée par type et tier
function renderHangar() {
  const list = document.getElementById('hangar-list');
  if (!list) return;

  const stationed = G.fleet.stationed;
  const total = stationed.tanker.t1 + stationed.tanker.t2 + stationed.tanker.t3
              + stationed.fregate.t1 + stationed.fregate.t2 + stationed.fregate.t3
              + stationed.cuirasse.t1 + stationed.cuirasse.t2 + stationed.cuirasse.t3;

  if (total === 0) {
    list.innerHTML = `<div class="empty-line">Aucun vaisseau militaire stationné. Va dans l'onglet "Construction" pour assembler ta première flotte.</div>`;
    return;
  }

  const types = ['tanker', 'fregate', 'cuirasse'];
  list.innerHTML = types.map(shipKey => {
    const meta = SHIP_UNITS[shipKey];
    const counts = stationed[shipKey];
    const total = counts.t1 + counts.t2 + counts.t3;
    if (total === 0) return '';
    // Stats agrégées (atk/def cumulés sur tous les tiers)
    let totalAtk = 0, totalDef = 0, totalCargo = 0, totalCap = 0;
    for (let tier = 1; tier <= 3; tier++) {
      const td = SHIP_TIERS[shipKey]?.[tier];
      if (!td) continue;
      const qty = counts['t' + tier];
      totalAtk += qty * (td.atk || 0);
      totalDef += qty * (td.def || 0);
      totalCargo += qty * (td.cargo || 0);
      totalCap += qty * (td.transportCap || 0);
    }
    // Détail par tier (avec icône)
    const tierBreakdown = [1, 2, 3].map(t => {
      const qty = counts['t' + t];
      if (qty === 0) return '';
      return `<span class="hangar-tier-pill tier-t${t}">T${t} × ${qty}</span>`;
    }).filter(Boolean).join(' ');
    return `
      <div class="hangar-row" onclick="openUnitDetail('${shipKey}', 'ship')">
        <div class="hangar-icon" style="color:var(--cyan)">${PNG_ILLUSTRATIONS[shipKey] ? `<img src="${PNG_ILLUSTRATIONS[shipKey]}" alt="${meta.name}" onerror="pngFallback(this, '${shipKey}')">` : meta.icon}</div>
        <div class="hangar-info">
          <div class="hangar-name">${meta.name} <span style="color:var(--mut);font-weight:400">× ${total}</span></div>
          <div class="hangar-tiers">${tierBreakdown}</div>
          <div class="hangar-stats">
            ${totalAtk > 0 ? `<span style="color:var(--red)">${fmt(totalAtk)} atk</span>` : ''}
            ${totalDef > 0 ? ` · <span style="color:var(--cyan)">${fmt(totalDef)} def</span>` : ''}
            ${totalCargo > 0 ? ` · <span style="color:var(--amber)">${fmt(totalCargo)} cargo</span>` : ''}
            ${totalCap > 0 ? ` · <span style="color:var(--mut)">${fmt(totalCap)} sold.</span>` : ''}
          </div>
        </div>
        <div class="def-comp-arrow">→</div>
      </div>
    `;
  }).join('');
}

function buildProbeShip() {
  if (G.probe.exists) {
    toast('Tu as déjà une sonde');
    return;
  }
  const cost = { metal: 200, cristal: 50 };
  if (G.res.metal.v < cost.metal || G.res.cristal.v < cost.cristal) {
    toast('Ressources insuffisantes');
    return;
  }
  G.res.metal.v -= cost.metal;
  G.res.cristal.v -= cost.cristal;

  const baseDuration = 180; // ⚡ V0.5 : 3 min pour assembler la sonde Auris-1 (ancien : 15s proto)
  const finalDuration = Math.max(1, Math.round(baseDuration / G.skills.productionSpeed * (window.SBSkills ? SBSkills.durMult('ships') : 1)));

  QUEUES.shipyard.commands.push({
    unitKey: 'probe',
    totalQty: 1,
    completed: 0,
    currentElapsed: 0,
    unitDuration: finalDuration,
    cost: cost,
    addedAt: Date.now(),
  });
  toast('Sonde Auris-1 en assemblage');
  renderQueue('shipyard');
  renderShipyard();
  startQueueTicker();
}

/* ═══════════ PLANET MAP ═══════════ */

function renderPlanetMap() {
  const p = G.planet;
  document.getElementById('planet-name-meta').textContent = p.name;
  document.getElementById('planet-type-meta').textContent = `Type ${p.type}`;
  document.getElementById('planet-level-meta').textContent = `Niv. ${p.level}`;

  const unlocked = p.parcels.filter(p => p.state !== 'locked').length;
  document.getElementById('planet-stat-parcels').innerHTML = `${unlocked}<span style="color:var(--mut);font-weight:400">/25</span>`;
  document.getElementById('planet-stat-prod').innerHTML = `+${totalRate()}<span style="color:var(--amber)">/h</span>`;
  document.getElementById('planet-stat-def').textContent = fmt(totalDefense());

  drawHexMap();
  renderInfoCard(G.selParcel);
}

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 90);
    pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
  }
  return pts.join(' ');
}

function hexCenter(row, col) {
  const odd = row % 2 === 1;
  const x = col * HSTEP + W/2 + (odd ? HSTEP/2 : 0);
  const y = row * VSTEP + SIZE;
  return { x, y };
}

function drawHexMap() {
  // PLANET3D — quand la carte 3D est prête, c'est elle qui affiche la planète
  if (window.Planet3D && window.Planet3D.ready) { window.Planet3D.sync(); return; }
  const map = document.getElementById('hexmap');
  const totalW = (COLS - 1) * HSTEP + W + HSTEP/2;
  const totalH = (ROWS - 1) * VSTEP + 2 * SIZE;
  const PAD = 18;
  map.setAttribute('viewBox', `${-PAD} ${-PAD} ${totalW + PAD*2} ${totalH + PAD*2}`);

  const defs = `
    <defs>
      <linearGradient id="gRocky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1f0a08"/><stop offset="100%" stop-color="#0c0303"/>
      </linearGradient>
      <linearGradient id="gResource" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a160a"/><stop offset="100%" stop-color="#0c0503"/>
      </linearGradient>
      <linearGradient id="gMine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a1a0a"/><stop offset="100%" stop-color="#1a0805"/>
      </linearGradient>
      <linearGradient id="gCentrale" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a280a"/><stop offset="100%" stop-color="#1a1005"/>
      </linearGradient>
      <linearGradient id="gLab" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a2828"/><stop offset="100%" stop-color="#04100f"/>
      </linearGradient>
      <linearGradient id="gCaserne" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a0a08"/><stop offset="100%" stop-color="#100403"/>
      </linearGradient>
      <linearGradient id="gDefense" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a1a3a"/><stop offset="100%" stop-color="#04081a"/>
      </linearGradient>
      <radialGradient id="gCapital" cx="50%" cy="40%" r="65%">
        <stop offset="0%" stop-color="#0e3a36"/><stop offset="60%" stop-color="#08201e"/><stop offset="100%" stop-color="#020807"/>
      </radialGradient>
      <linearGradient id="gBuild" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a200a"/><stop offset="100%" stop-color="#100a04"/>
      </linearGradient>
      <linearGradient id="gCommerce" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a2810"/><stop offset="100%" stop-color="#1a1206"/>
      </linearGradient>
      <radialGradient id="atmo" cx="50%" cy="50%" r="60%">
        <stop offset="60%" stop-color="rgba(95,255,232,0)"/>
        <stop offset="100%" stop-color="rgba(95,255,232,.18)"/>
      </radialGradient>
    </defs>
  `;
  map.innerHTML = defs;

  const atmo = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  atmo.setAttribute('cx', totalW / 2);
  atmo.setAttribute('cy', totalH / 2);
  atmo.setAttribute('rx', totalW / 2 + 12);
  atmo.setAttribute('ry', totalH / 2 + 18);
  atmo.setAttribute('fill', 'url(#atmo)');
  atmo.setAttribute('opacity', '.7');
  map.appendChild(atmo);

  G.planet.parcels.forEach((p, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const { x, y } = hexCenter(row, col);
    const stKey = getStateKey(p);
    const st = ST[stKey];
    const isSel = G.selParcel === i;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'hex' + (isSel ? ' sel' : ''));
    g.setAttribute('data-i', i);
    g.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)})`);

    if (isSel && stKey === 'capital') {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      r.setAttribute('class', 'selRing');
      r.setAttribute('r', '30');
      r.setAttribute('fill', 'none');
      r.setAttribute('stroke', '#5fffe8');
      r.setAttribute('stroke-width', '1');
      g.appendChild(r);
    }

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', hexPoints(0, 0, SIZE - 1));
    poly.setAttribute('fill', st.fill);
    poly.setAttribute('stroke', st.stroke);
    poly.setAttribute('stroke-width', st.sw);
    if (st.dash) poly.setAttribute('stroke-dasharray', st.dash);
    if (st.dim) poly.setAttribute('opacity', '0.55');
    g.appendChild(poly);

    if (stKey !== 'locked') {
      const hi = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      hi.setAttribute('points', hexPoints(0, 0, SIZE - 4));
      hi.setAttribute('fill', 'none');
      hi.setAttribute('stroke', 'rgba(255,255,255,.06)');
      hi.setAttribute('stroke-width', '1');
      g.appendChild(hi);
    }

    if (ICON[stKey]) {
      const ig = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      ig.setAttribute('class', 'icon');
      ig.setAttribute('color', st.badge);
      ig.innerHTML = ICON[stKey];
      g.appendChild(ig);
    }

    if (st.sparkle) {
      const sp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      sp.setAttribute('class', 'sparkle');
      sp.setAttribute('transform', 'translate(11,-13)');
      sp.innerHTML = `<path d="M0,-3 L1.2,0 L0,3 L-1.2,0 Z" fill="${st.badge}"/>`;
      g.appendChild(sp);
    }

    if (p.lvl != null) {
      const pg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      pg.setAttribute('transform', 'translate(0,17)');
      const max = p.max || 3;
      for (let k = 0; k < max; k++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', (k - (max - 1) / 2) * 4);
        c.setAttribute('cy', 0);
        c.setAttribute('r', 1.3);
        c.setAttribute('fill', k < p.lvl ? st.badge : 'rgba(255,255,255,.14)');
        pg.appendChild(c);
      }
      g.appendChild(pg);
    }

    // PASSE 3.5-narrative : point ambre si rapports ambient non-lus
    if (typeof getUnreadAmbientCount === 'function' && getUnreadAmbientCount(p.idx) > 0) {
      const amb = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      amb.setAttribute('cx', 13);
      amb.setAttribute('cy', -16);
      amb.setAttribute('r', 2.5);
      amb.setAttribute('fill', '#ffc060');
      amb.setAttribute('class', 'ambient-pulse');
      g.appendChild(amb);
    }

    g.addEventListener('click', () => onHexClick(i));
    map.appendChild(g);
  });
}

function getStateKey(parcel) {
  if (parcel.state === 'locked') return 'locked';
  if (parcel.state === 'depleted') return 'depleted';
  if (parcel.state === 'capital') return 'capital';
  if (parcel.state === 'rocky') return 'rocky';
  if (parcel.state === 'resource') return 'resource';
  if (parcel.state === 'building') return 'building';
  if (parcel.state === 'built' && parcel.building) {
    return parcel.building;
  }
  return 'rocky';
}

function coord(i) {
  const row = Math.floor(i / COLS), col = i % COLS;
  return String.fromCharCode(65 + row) + '-' + (col + 1);
}

/* ═══════════ INFO CARD ═══════════ */

function renderInfoCard(i) {
  // PLANET3D — la parcelle réservée à l'antenne de prospection a sa propre fiche (boucle fondatrice)
  if (window.SBAntenna && window.SBAntenna.owns(i)) { window.SBAntenna.renderCard(i); return; }
  const info = document.getElementById('planet-info');
  const p = G.planet.parcels[i];
  const stKey = getStateKey(p);
  const st = ST[stKey];

  const pips = p.lvl != null
    ? `<span class="pips">${Array.from({length: p.max || 3}).map((_, k) => `<span class="pip ${k < p.lvl ? 'on' : ''}"></span>`).join('')}</span>`
    : '';

  const prodHtml = p.prod && p.prod.length > 0
    ? `<div class="prod">${p.prod.map(x => `<span>${x[0]} <b>${x[1]}</b></span>`).join('')}</div>`
    : '';

  const labels = BTN_LABELS[stKey] || { primary: 'Action', ghost: 'Détails' };

  let primaryHandler = '';
  let ghostHandler = '';
  let subOverride = null;   // TUTO_1410
  let primaryLabel = labels.primary;
  let ghostLabel = labels.ghost;

  // Routing par état
  if (stKey === 'rocky') {
    primaryHandler = `startM3FromInfo(${i}, 'Terraformation')`;
    ghostHandler = `toast('Juste une parcelle')`;
  } else if (stKey === 'resource' && window.SBTuto && SBTuto.gateBuild()) {
    // TUTO_1410 — pendant l'apprentissage de l'antenne : on re-mine, la construction arrive avec la leçon de la mine
    const left = Math.max(0, REMINE_MAX - (p.remineCount || 0));
    const lvl = Math.min(p.remineCount || 0, REMINE_MAX - 1);
    primaryLabel = left > 0 ? `Re-miner ×${Math.min(1.6, 1 + 0.15 * (lvl + 1)).toFixed(2).replace(/0$/, '')}` : 'Épuisé';
    primaryHandler = left > 0 ? `startM3FromInfo(${i}, 'Re-mining')` : `toast('Plus aucune ressource exploitable')`;
    ghostLabel = `${left} passage${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}`;
    subOverride = left > 0 ? 'Re-mine-le : chaque passage rapporte plus. Vise la veine profonde.' : 'Gisement épuisé.';
    ghostHandler = `toast('Un gisement s\'épuise après ${REMINE_MAX} passages')`;
  } else if (stKey === 'resource') {
    primaryHandler = `showBuildCard(${i})`;
    // Le bouton ghost devient RE-MINER si on n'a pas atteint le max de re-mines
    if (p.remineCount < REMINE_MAX) {
      const lvl = Math.min(p.remineCount, REMINE_MAX - 1);
      ghostLabel = `Re-miner ×${Math.min(1.6, 1 + 0.15 * (lvl + 1)).toFixed(2).replace(/0$/, '')}`;
      ghostHandler = `startM3FromInfo(${i}, 'Re-mining')`;
    } else {
      ghostLabel = 'Épuisé';
      ghostHandler = `toast('Plus aucune ressource exploitable')`;
    }
  } else if (stKey === 'locked') {
    // PATCH_2210_REGLES : c'est le niveau de planète qui ouvre les zones, pas une sonde
    subOverride = sbLockedHint(i);
    primaryLabel = 'Comment l’ouvrir';
    primaryHandler = `toast(sbLockedHint(${i}))`;
    ghostLabel = null;
  } else if (stKey === 'depleted') {
    const _rh = window.SBSkills && SBSkills.rehabBtn ? SBSkills.rehabBtn(i) : null;   // PATCH_1910_REHAB
    if (_rh) { primaryLabel = _rh.label; primaryHandler = _rh.handler; subOverride = _rh.sub; }
    else primaryHandler = `toast('Skill de recyclage requis')`;
    ghostLabel = null;
  } else if (stKey === 'building') {
    const left = Math.max(0, (p.buildEndsAt || 0) - Date.now());
    primaryLabel = `Fin dans ${formatTankerDuration(left)}`;
    primaryHandler = `toast('Le chantier avance — ${formatTankerDuration(left)} restantes')`;
    ghostLabel = 'Annuler';
    ghostHandler = `cancelBuild(${i})`;
  } else if (stKey === 'mine') {
    primaryHandler = `startM3FromInfo(${i}, 'Extraction')`;
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'centrale') {
    primaryHandler = `startM3FromInfo(${i}, 'Énergie')`;
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'labo') {
    primaryHandler = `startM3FromInfo(${i}, 'Recherche')`;
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'caserne') {
    primaryHandler = `goto('defense')`;
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'shipyard') {
    // ORBITE = ARMER : le bâtiment mène à l'orbite, où se construisent les vaisseaux
    primaryHandler = `(hasShipyardBuilt() ? goto('fleet') : goto('shipyard'))`;   // le chantier mène à la flotte à quai (vue station)
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'turret') {
    primaryHandler = `goto('defense')`;
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'comptoir') {
    // Passe Commerce Phase 1 : tap sur Comptoir → hub Commerce global
    primaryHandler = `goto('commerce')`;
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'raffinerie') {
    // ⚡ V0.5 feedback Adrien : Raffinerie → commerce (en attendant son propre écran)
    // Le ghost ouvre la fiche bâtiment (détails + amélioration).
    primaryHandler = `goto('commerce')`;
    ghostHandler = `openBuildingDetail(${i})`;
  } else if (stKey === 'capital') {
    primaryHandler = `goto('capital')`;
    ghostHandler = `openCapitalSheet()`;
  } else if (stKey?.startsWith('silo_')) {
    // Silos : primary et ghost mènent tous deux à la fiche bâtiment
    primaryHandler = `openBuildingDetail(${i})`;
    ghostHandler = `openBuildingDetail(${i})`;
  }

  const ghostBtn = ghostLabel
    ? `<button class="btn-ghost" onclick="${ghostHandler}">${ghostLabel}</button>`
    : '';

  const cta = `<div class="cta"><button class="btn-primary" onclick="${primaryHandler}">${primaryLabel}</button>${ghostBtn}</div>`;

  // 19/05 : mini-encart pédagogique pendant l'onboarding pour expliquer le flow parcelle
  let teachHtml = '';
  const onboardingActive = G.onboarding && !G.onboarding.completed && !G.onboarding.dismissed && !window.SBTuto;
  if (onboardingActive) {
    if (stKey === 'rocky') {
      teachHtml = `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(95,168,232,.08);border:1px solid rgba(95,168,232,.30);border-radius:6px;font-size:11px;color:#c8e0f5;line-height:1.55">
          <div style="font-size:9px;color:#5fa8e8;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">💡 Comment ça marche</div>
          <strong>1.</strong> Joue un match-3 ici pour extraire des ressources de la pierre brute.<br>
          <strong>2.</strong> La parcelle devient un <em>gisement</em> exploitable.<br>
          <strong>3.</strong> Tu peux re-miner ce gisement OU construire un bâtiment dessus.
        </div>
      `;
    } else if (stKey === 'resource') {
      teachHtml = `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(120,200,140,.08);border:1px solid rgba(120,200,140,.30);border-radius:6px;font-size:11px;color:#c8f0d5;line-height:1.55">
          <div style="font-size:9px;color:#78c88c;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">💡 Tu as 2 choix</div>
          <strong>Construire</strong> un bâtiment ici (production passive permanente).<br>
          <strong>Re-miner</strong> pour extraire encore plus de ressources d'un coup.<br>
          <em style="opacity:.7">Le gisement s'épuisera après quelques re-mines.</em>
        </div>
      `;
    } else if (stKey === 'mine' || stKey === 'centrale' || stKey === 'labo') {
      teachHtml = `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(255,200,100,.08);border:1px solid rgba(255,200,100,.30);border-radius:6px;font-size:11px;color:#ffeac0;line-height:1.55">
          <div style="font-size:9px;color:#ffc864;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">💡 Bâtiment actif</div>
          Ce bâtiment produit en passif (visible sur le Commandement).<br>
          Tu peux aussi jouer un <strong>match-3 thématique</strong> ici pour un bonus immédiat.
        </div>
      `;
    }
  }

  info.innerHTML = `
    <div class="row1">
      <span class="tag" style="color:${st.badge}">${st.label}${pips}</span>
      <span class="coord">${coord(i)}</span>
    </div>
    <div class="name">${p.n}</div>
    <div class="sub">${subOverride || p.sub || ''}</div>
    ${prodHtml}
    ${teachHtml}
    ${cta}
  `;
  // APRÈS L'ATTAQUE : secours depuis le centre de commandement
  if (p.state === 'capital' && window.SBAftermath && SBAftermath.dev >= 1) {
    info.insertAdjacentHTML('beforeend', `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,80,60,.45);background:rgba(40,8,6,.6)">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#ff8a70">Planète dévastée · santé ${Math.round(100 - SBAftermath.dev)} %</div>
      <div style="font-size:12px;color:var(--mut);margin:4px 0 8px;line-height:1.45">Production réduite de ${Math.round(SBAftermath.dev / 2)} %${SBAftermath.dev >= 50 ? ', améliorations bloquées' : ''}. Chaque veine profonde des secours rend 10 % de santé et chaque partie réussie remet un bâtiment abîmé en état. Sans rien faire, la planète regagne 1 % par heure.</div>
      <button class="btn-primary" onclick="SBAftermath.startRelief()">Lancer les secours</button></div>`);
  }
}

function onHexClick(idx) {
  G.selParcel = idx;
  drawHexMap();
  renderInfoCard(idx);
}

function startM3FromInfo(idx, context) {
  startM3(idx, context);
}

// PATCH_2210_REGLES : texte vrai pour une zone verrouillée (cf. UNLOCK_AT + fin de chantier : 1 famille nouvelle = +1 niveau)
function sbLockedHint(idx) {
  const lv = (G.planet && G.planet.level) || 0;
  const need = +(Object.keys(UNLOCK_AT).find(k => UNLOCK_AT[k].includes(idx)) || 0);
  const fam = (G.planet && G.planet.families) || new Set();
  const left = [...new Set(Object.values(BUILDINGS).map(b => b.family).filter(Boolean))].filter(f => !(fam.has ? fam.has(f) : [].concat(fam).includes(f)));
  const ex = left.slice(0, 3).join(', ');
  if (!need) return 'Zone verrouillée : elle s’ouvre quand ta planète monte de niveau.';
  const n = Math.max(1, need - lv);
  return `S’ouvre au niveau de planète ${need} (tu es au niveau ${lv}). Construis des bâtiments de ${n > 1 ? n + ' nouvelles familles' : '1 nouvelle famille'} pour y arriver` + (ex ? ` (par ex. ${ex}).` : '.');
}
function tryProbeFromMap(idx) {
  // Si pas de chantier construit
  const hasShipyard = G.planet.parcels.some(p => p.building === 'shipyard');
  if (!hasShipyard) {
    toast('Construis d\'abord un Chantier naval');
    return;
  }
  // Si la sonde n'existe pas encore
  if (!G.probe.exists) {
    toast('Assemble ta sonde au Chantier');
    goto('shipyard');
    return;
  }
  // Si la sonde est en mission
  if (G.probe.state !== 'ready') {
    toast('Sonde en mission · ' + probeMissionRemaining());
    return;
  }
  // Tout va bien : ouvrir le centre de prospection
  goto('prospect');
}

/* ═══════════ BUILD CARD ═══════════ */

function showBuildCard(idx) {
  document.getElementById('bc-parcel-name').textContent = G.planet.parcels[idx].n;

  const html = Object.entries(BUILDINGS).map(([key, b]) => {
    const costEntries = Object.entries(b.cost);
    const canAfford = costEntries.every(([res, qty]) => G.res[res] && G.res[res].v >= qty);
    const costStr = costEntries.map(([res, qty]) => `${qty} ${res}`).join(' · ');

    return `
      <div class="bld-opt ${canAfford ? '' : 'disabled'} ${window.SBTuto && SBTuto.recommend() === key ? 'sb-reco' : ''}" onclick="openBuildingSheet('${key}', ${idx})">
        <div class="bld-opt-icon" style="color:${b.color}">${renderIcon(b.icon, {size:24})}</div>
        <div class="bld-opt-info">
          <div class="bld-opt-name">${b.name}</div>
          <div class="bld-opt-prod">${b.prodLbl}</div>
          ${window.SBTuto && SBTuto.recommend() === key ? '<div class="bld-opt-reco">Recommandé pour commencer</div>' : ''}
          ${canAfford ? '' : '<div class="bld-opt-err">Ressources insuffisantes · touche pour voir la fiche</div>'}
        </div>
        <div class="bld-opt-cost">${costStr}</div>
      </div>
    `;
  }).join('');

  document.getElementById('bc-options').innerHTML = html;
  document.getElementById('card-build').classList.add('shown');
}

function closeBuildCard() {
  document.getElementById('card-build').classList.remove('shown');
}

function doBuild(key, idx) {
  const b = BUILDINGS[key];

  for (const [res, qty] of Object.entries(b.cost)) {
    if (!G.res[res] || G.res[res].v < qty) {
      toast('Ressources insuffisantes');
      return;
    }
  }
  for (const [res, qty] of Object.entries(b.cost)) {
    G.res[res].v -= qty;
  }

  const parcel = G.planet.parcels[idx];
  // CONSTRUCTION VISIBLE (10/10/2026, P0.3) : un bâtiment prend du temps, se voit se construire,
  // et finit même jeu fermé (date de fin absolue, détectée par simulateTo). Cf. GDD « Construction visible ».
  const buildMs = Math.round((BUILD_TIME_MIN[key] || 0) * 60000 * (window.SBSkills ? SBSkills.durMult('build') : 1));   // PATCH_1610_SKILLS
  if (buildMs > 0 && !G.cheats?.instantBuild) {
    const now = Date.now();
    parcel.state = 'building';
    parcel.building = key;
    parcel.n = `Chantier — ${customBuildingName(key)}`;
    parcel.sub = `Fin dans ${formatTankerDuration(buildMs)}`;
    parcel.buildStartedAt = now;
    parcel.buildEndsAt = now + buildMs;
    parcel.buildCost = { ...b.cost };
    parcel.lvl = null; parcel.prod = null;
    toast(`Chantier ouvert — ${b.name} dans ${formatTankerDuration(buildMs)}`);
    closeBuildCard();
    renderPlanetMap();
    if (typeof saveGame === 'function') saveGame();
    return;
  }
  finishBuild(idx, key);
}

// Fin de chantier : le bâtiment devient réel (production, familles, niveau de planète, moment 7…)
function finishBuild(idx, key) {
  const b = BUILDINGS[key];
  const parcel = G.planet.parcels[idx];
  if (!b || !parcel) return;
  delete parcel.buildStartedAt; delete parcel.buildEndsAt; delete parcel.buildCost;
  parcel.state = 'built';
  parcel.building = key;
  if (window.SBSfx) SBSfx.play('build');   // SFX_2410
  parcel.n = customBuildingName(key);
  parcel.sub = b.desc;
  parcel.lvl = 1;
  parcel.max = 3;
  parcel.prod = Object.entries(b.prod).map(([res, rate]) => [prodInfo(res).label.toLowerCase(), rateLbl(res, rate)]);
  // ─── Bunker (passe 2.4) : 1er Bunker débloque les unités + donne défense passive ───
  //    Les Bunkers suivants ne donnent que la défense passive (effet local), pas de cumul de déblocage
  if (b.def && key === 'turret') {
    const existingBunkers = G.planet.parcels.filter(p =>
      p.idx !== idx && p.state === 'built' && p.building === 'turret'
    ).length;
    if (existingBunkers === 0) {
      // C'est le 1er Bunker — débloque les unités défensives
      parcel.prod.push(['défense', `+${b.def}`]);
      parcel.prod.push(['unités', 'tourelles & soldats lourds débloqués']);
    } else {
      // Bunker supplémentaire — défense passive uniquement, pas de re-déblocage
      parcel.prod.push(['défense', `+${b.def} (local)`]);
      parcel.prod.push(['note', 'déblocage déjà actif']);
    }
  } else if (b.def && key === 'caserne') {
    parcel.prod.push(['défense', `+${b.def}`]);
    parcel.prod.push(['unités', 'gardes débloqués']);
  }

  // ─── Silo (passe 2.4) : ajouter la capacité au max de la ressource concernée ───
  if (b.kind === 'silo' && b.silo) {
    const tier1Data = BUILDING_TIERS[key]?.[1];
    const cap = tier1Data?.siloCap || b.silo.cap;
    const res = b.silo.res;
    if (G.res[res] !== undefined) {
      G.res[res].max += cap;
    }
    parcel.prod = [['capacité', `+${fmt(cap)} ${res}`]];
  }

  for (const [res, rate] of Object.entries(b.prod)) {
    if (G.res[res] !== undefined) G.res[res].rate += rate;
  }

  let msg = `${b.name} opérationnelle`;
  if (key === 'shipyard') {
    // Moment 7 (North Star §28) : première entrée en orbite possible
    G.orbitUnseen = true;
    msg = `Chantier orbital opérationnel — l'orbite est accessible`;
  }
  if (!G.planet.families.has(b.family)) {
    G.planet.families.add(b.family);
    G.planet.level++;
    const toUnlock = UNLOCK_AT[G.planet.level] || [];
    toUnlock.forEach(i => {
      const par = G.planet.parcels[i];
      if (par.state === 'locked') {
        par.state = 'rocky';
        par.n = 'Plaine rocheuse';
        par.sub = 'Sol stable. Disponible pour terraformation.';
      }
    });
    msg += ` · Niv. planète ${G.planet.level}`;
  }

  toast(msg);
  startPassiveLoop();
  closeBuildCard();
  renderPlanetMap();
}

function customBuildingName(key) {
  const map = {
    mine: 'Mine de Fer',
    centrale: 'Centrale solaire',
    labo: 'Laboratoire',
    caserne: 'Caserne planétaire',
    shipyard: 'Chantier orbital',
    turret: 'Bunker souterrain',
    comptoir: 'Comptoir marchand',
    raffinerie: 'Raffinerie de carburant',
  };
  return map[key] || BUILDINGS[key]?.name || 'Bâtiment';
}

/* ═══════════ PASSIVE ═══════════ */

function startPassiveLoop() {
  if (G.passiveTimer) return;
  // Tracker quelles ressources étaient pleines au tick précédent (évite le spam de toast)
  if (!G.fullResources) G.fullResources = new Set();
  G.passiveTimer = setInterval(() => {
    // OFFLINE — production calculée sur le temps réel écoulé (rattrape aussi un gel iOS)
    simulateTo(Date.now());
    const newlyFull = [];
    for (const [resKey, r] of Object.entries(G.res)) {
      if (r.rate > 0) {
        const isNowFull = r.v >= r.max;
        const wasAlreadyFull = G.fullResources.has(resKey);
        if (isNowFull && !wasAlreadyFull) {
          newlyFull.push(resKey);
          G.fullResources.add(resKey);
        } else if (!isNowFull && wasAlreadyFull) {
          // Plus saturé (ex : le joueur a construit un silo, ou utilisé des ressources)
          G.fullResources.delete(resKey);
        }
      }
    }
    // Notification uniquement à la transition vers saturé
    if (newlyFull.length > 0) {
      const resInfo = tileInfo(newlyFull[0]);
      const resLabel = resInfo?.label || newlyFull[0];
      const more = newlyFull.length > 1 ? ` (+${newlyFull.length - 1})` : '';
      toast(`Silo ${resLabel} plein${more} — production stoppée`);
    }

    // PASSE 3.5-narrative : tirage ambient sur chaque bâtiment éligible
    // Cf. GDD 12_ambient_narrative.md
    if (G.planet?.parcels) {
      for (const parcel of G.planet.parcels) {
        if (parcel?.building) {
          const generated = maybeGenerateAmbientReport(parcel);
          if (generated && G.cheats?.verboseAmbient) {
            console.log('🌌 [ambient]', generated.buildingFamily, '·', generated.parcelId, '·', generated.narrative.slice(0, 60) + '...');
          }
        }
      }
    }

    // PASSE 4-sondes-v1-b : vérifier retours de sondes
    if (typeof tickProbes === 'function') tickProbes();
    // ⚡ Phase 4 P1 — Génération passive de détections par les balises déployées
    if (typeof tickActiveBeacons === 'function') tickActiveBeacons();
    // PASSE 4-sondes-v1-c : vérifier retours de tankers (sera ajouté ci-dessous)
    if (typeof tickTankerMissions === 'function') tickTankerMissions();
    // Chunk 15/05 : décompte attrition des garnisons (tanker logistique)
    if (typeof tickGarrisonAttrition === 'function') tickGarrisonAttrition();
    // Passe Commerce Phase 1 : production CG passive depuis les Comptoirs
    // OFFLINE — CG des Comptoirs désormais crédités dans simulateTo()
    // 18/05 : production carburant passive depuis les Raffineries
    // OFFLINE — carburant des Raffineries désormais crédité dans simulateTo()

    // 19/05 : vérifier progression onboarding à chaque tick
    if (typeof checkOnboardingProgress === 'function') checkOnboardingProgress();

    const planetVisible = !document.getElementById('scr-planet').classList.contains('hidden');
    const dashVisible = !document.getElementById('scr-dashboard').classList.contains('hidden');
    if (planetVisible) {
      document.getElementById('planet-stat-prod').innerHTML = `+${totalRate()}<span style="color:var(--amber)">/h</span>`;
      // Re-render pour faire apparaître les points ambres sur les bâtiments avec rapports non-lus
      if (typeof renderPlanetMap === 'function') renderPlanetMap();
    }
    if (dashVisible) renderDashboard();
  }, 10000);
}

/* ═══════════ MATCH-3 ═══════════ */

function startM3(parcelIdx, context) {
  const m = G.m3;
  m.parcelIdx = parcelIdx;
  m.moves = M3_MOVES;
  m.mult = 1;
  m._lastBubbleMult = 0;
  m._currentChainSession = null;
  m.sel = null;
  m.animating = false;
  m.ended = false;
  m.score = { metal:0, energie:0, cristal:0, biomass:0, artefact:0 };
  m.context = context || 'Terraformation';
  // Phase 1 — reset flag objectif (toast à la 1ère atteinte uniquement)
  m.objectifAtteint = false;
  // ⚡ Phase 6 — Mode "explosions" : objectif générique par bâtiment
  // Lookup dans M3_OBJECTIVES par context (Recherche, Énergie, etc.)
  m.objective = M3_OBJECTIVES[m.context] || null;
  m.explosions = 0;
  m.megahideSkillUnlocked = null; // skill dropé quand un megahide est cassé

  // Détermine si c'est un re-mining (parcelle déjà en état resource)
  const parcel = G.planet.parcels[parcelIdx];
  const isRemine = (context === 'Re-mining' && parcel.state === 'resource');
  m.isRemine = isRemine;
  m.remineLevel = isRemine ? Math.min(parcel.remineCount, REMINE_MAX - 1) : 0;
  m.scoreBonus = isRemine ? REMINE_BONUS[m.remineLevel] : 1;

  // Génère un plateau sans match initial
  // ⚡ Phase 3 — On régénère plutôt qu'on rebuilds tout : si match, on change juste la tile
  m.grid = Array.from({length: M3_ROWS * M3_COLS}, () => newTile());
  let safety = 0;
  let matches = findMatches();
  while (matches.length > 0 && safety < 200) {
    // Remplace les tiles dans les matches par une autre tile de type différent
    matches.forEach(idx => {
      let tries = 0;
      const oldType = m.grid[idx]?.type;
      let candidate = newTile();
      while (candidate.type === oldType && tries < 10) {
        candidate = newTile();
        tries++;
      }
      m.grid[idx] = candidate;
    });
    matches = findMatches();
    safety++;
  }

  // ⚡ Phase 3 — Génération des obstacles selon le contexte
  // - Première session terraformation : 4-6 obstacles standards (mix random)
  // - Re-mining sans succès passé : 3 megastone + 3 megahide
  // - Re-mining avec N succès passés : N megastone + N megahide (cap 12 total)
  // - Bâtiment construit : 4-6 obstacles standards
  // Les pierres inertes classiques sont remplacées par les obstacles
  const obstaclePositions = [];
  const allIdx = [...Array(M3_ROWS * M3_COLS).keys()];
  const candidatesIdx = allIdx.filter(i => {
    const r = Math.floor(i / M3_COLS);
    return r >= 1 && r <= M3_ROWS - 2;
  });
  for (let i = candidatesIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidatesIdx[i], candidatesIdx[j]] = [candidatesIdx[j], candidatesIdx[i]];
  }

  const successCount = parcel.successCount || 0;
  if (isRemine) {
    // ⚡ Phase 3 — Re-mining : 3 megastone + 3 megahide minimum
    // + 1 megastone + 1 megahide par succès passé (cumulé)
    // Cap total à 12 (6 megastone + 6 megahide max) pour pas saturer le plateau
    const baseCount = 3;
    const stoneCount = Math.min(baseCount + successCount, 6);
    const hideCount = Math.min(baseCount + successCount, 6);
    let k = 0;
    for (let s = 0; s < stoneCount && k < candidatesIdx.length; s++) {
      obstaclePositions.push({ idx: candidatesIdx[k], type: 'megastone' });
      k++;
    }
    for (let h = 0; h < hideCount && k < candidatesIdx.length; h++) {
      obstaclePositions.push({ idx: candidatesIdx[k], type: 'megahide' });
      k++;
    }
  } else {
    // Première session ou session sur bâtiment construit : 4-6 obstacles standards
    const obstacleCount = 4 + Math.floor(Math.random() * 3);
    for (let k = 0; k < obstacleCount && k < candidatesIdx.length; k++) {
      const type = Math.random() < 0.66 ? 'megastone' : 'megahide';
      obstaclePositions.push({ idx: candidatesIdx[k], type });
    }
    // ⚡ Phase 6 — Mode "explosions" (labo/centrale/...) : garantir 1 megahide minimum (cache le skill)
    if (m.objective && m.objective.mode === 'explosions') {
      const hasMegahide = obstaclePositions.some(o => o.type === 'megahide');
      if (!hasMegahide && obstaclePositions.length > 0) {
        // Forcer le premier obstacle à être un megahide
        obstaclePositions[0].type = 'megahide';
      }
    }
  }
  obstaclePositions.forEach(({ idx, type }) => {
    m.grid[idx] = { type, megaHits: 0, isObstacle: true };
  });

  // ⚡ Phase 3 — Plus de pierres inertes en re-mining : les obstacles megastone/megahide remplacent
  // (gérés juste après dans le bloc isRemine de la génération des obstacles)

  document.getElementById('m3-title').textContent = `PARCELLE ${parcelIdx + 1}`;
  // Affiche le contexte enrichi pour le re-mining
  let displayContext = context;
  if (isRemine) {
    displayContext = `Re-mine ${parcel.remineCount + 1} · ×${m.scoreBonus}`;
  }
  // 19/05 — Indique la ressource dominante du thème dans le HUD
  const themeMap = { 'Extraction': 'métal', 'Énergie': 'énergie', 'Recherche': 'cristal' };
  const dominant = themeMap[context];
  if (dominant && !isRemine) {
    displayContext = `${context} · ${dominant} dominant`;
  }
  document.getElementById('m3-context').textContent = displayContext;
  // ⚡ Phase 6 — Classe contextuelle sur le wrap pour les fonds hexagonaux par bâtiment
  // (ex: ctx-energie → fond jaune pétant, ctx-recherche → fond par défaut pour l'instant)
  const gridWrap = document.querySelector('#m3-grid-wrap');
  if (gridWrap) {
    gridWrap.classList.remove('ctx-energie', 'ctx-recherche');
    if (m.context === 'Énergie')   gridWrap.classList.add('ctx-energie');
    if (m.context === 'Recherche') gridWrap.classList.add('ctx-recherche');
  }
  // ⚡ Phase 3 — Force un rebuild complet de la grille DOM au démarrage de chaque session
  // (évite les artefacts visuels : classes popping/flash-detonate résiduelles, sigs périmées)
  const wrap = document.getElementById('m3-grid');
  if (wrap) {
    wrap.innerHTML = ''; // efface tout, renderM3Grid reconstruit
  }
  renderM3Bars();
  renderM3Grid();
  updateM3HUD();
  goto('m3');
  // Phase 2.11 — Démarre le moniteur de perf
  if (typeof startPerfMonitor === 'function') startPerfMonitor();
}

// Helper : true si le device rame (FPS < 30) — skip les effets coûteux
// Si le monitor est désactivé, retourne false (effets gardés)
function isPerfPoor() {
  return window.perfMonitor && window.perfMonitor.enabled && window.perfMonitor.currentFps < 30;
}

function perfTick() {
  if (!window.perfMonitor.enabled) return;
  const mon = window.perfMonitor;
  const now = performance.now();
  if (mon.lastFrameTime > 0) {
    const dt = now - mon.lastFrameTime;
    mon.fpsFrames.push(dt);
    if (mon.fpsFrames.length > 30) mon.fpsFrames.shift();
    // Détection de spike : une frame > 50ms (= moins de 20 FPS instantané)
    if (dt > 50) {
      mon.spikes.push({ dt: Math.round(dt), context: mon.currentContext });
      if (mon.spikes.length > 10) mon.spikes.shift();
      if (dt > mon.maxSpike) {
        mon.maxSpike = dt;
        // Affichage du spike max
        const spikeEl = document.getElementById('perf-spike');
        if (spikeEl) {
          spikeEl.textContent = `↑${Math.round(dt)}ms · ${mon.currentContext}`;
        }
      }
    }
  }
  mon.lastFrameTime = now;

  // Update affichage toutes les 250ms (pas trop souvent)
  if (now - mon.lastUpdate > 250) {
    mon.lastUpdate = now;
    updatePerfDisplay();
  }

  // Continuer la boucle si l'écran m3 est visible
  const scr = document.getElementById('scr-m3');
  if (scr && !scr.classList.contains('hidden')) {
    requestAnimationFrame(perfTick);
  }
}

function updatePerfDisplay() {
  const mon = window.perfMonitor;
  // FPS moyen sur les 30 dernières frames
  if (mon.fpsFrames.length > 0) {
    const avgDt = mon.fpsFrames.reduce((s, x) => s + x, 0) / mon.fpsFrames.length;
    const fps = Math.round(1000 / avgDt);
    mon.currentFps = fps;
    const el = document.getElementById('perf-fps');
    if (el) {
      const color = fps < 20 ? '#ff5040' : fps < 40 ? '#ffaf3a' : '#5fffa8';
      el.style.color = color;
      el.textContent = `FPS: ${fps}`;
    }
  }
  // DOM total dans le wrap
  const wrap = document.querySelector('#m3-grid-wrap');
  if (wrap) {
    const allEls = wrap.querySelectorAll('*');
    const cellCount = wrap.querySelectorAll('.m3-cell').length;
    const el = document.getElementById('perf-dom');
    if (el) {
      el.textContent = `DOM: ${allEls.length} (${cellCount} tiles)`;
    }
    // Orphelins : compteur de particules/débris/rayons en cours
    const particles = wrap.querySelectorAll('.m3-burst-particle').length;
    const debris = wrap.querySelectorAll('.m3-debris').length;
    const rays = wrap.querySelectorAll('.m3-blast-ray').length;
    const cores = wrap.querySelectorAll('.m3-blast-core').length;
    const warms = wrap.querySelectorAll('.m3-warm-overlay').length;
    const shocks = wrap.querySelectorAll('.m3-shockwave').length;
    const orphEl = document.getElementById('perf-orphans');
    if (orphEl) {
      const total = particles + debris + rays + cores + warms + shocks;
      orphEl.textContent = `P:${particles} D:${debris} R:${rays} C:${cores} W:${warms} S:${shocks} =${total}`;
      orphEl.style.color = total > 80 ? '#ff5040' : total > 40 ? '#ffaf3a' : '#ff8848';
    }
  }
  // Mémoire (si disponible — Safari ne l'expose pas toujours)
  const memEl = document.getElementById('perf-mem');
  if (memEl) {
    if (performance.memory) {
      const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(0);
      const limit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0);
      memEl.textContent = `Mem: ${used}/${limit}MB`;
    } else {
      memEl.textContent = `Created: ${window.perfMonitor.totalParticlesCreated + window.perfMonitor.totalDebrisCreated + window.perfMonitor.totalRaysCreated}`;
    }
  }
}

// Démarre le monitoring automatiquement quand on entre dans scr-m3
function startPerfMonitor() {
  window.perfMonitor.lastFrameTime = 0;
  window.perfMonitor.fpsFrames = [];
  requestAnimationFrame(perfTick);
}

// Helpers pour marquer le contexte (à appeler avant les opérations lourdes)
function perfMark(ctx) {
  if (window.perfMonitor) window.perfMonitor.currentContext = ctx;
}

function newTile() {
  // ⚡ Phase 3 — Pondération 70/30 selon contexte de bâtiment
  const ctx = G.m3?.context || '';
  const themeMap = {
    'Extraction':     { dominant: 'metal',    secondary: 'biomass'  },
    'Énergie':        { dominant: 'energie',  secondary: 'cristal'  },
    'Recherche':      { dominant: 'cristal',  secondary: 'energie'  },
    'Terraformation': null,
    'Re-mining':      null,
  };
  const theme = themeMap[ctx];
  // ⚡ Fix : filtrer les tiles avec weight=0 (ex: artefact) pour éviter qu'elles ressortent
  const pool = TILES.filter(t => t.weight > 0).map(t => {
    let adj = t.weight;
    if (theme && t.key === theme.dominant) adj *= 4;
    else if (theme && t.key === theme.secondary) adj *= 2;
    return { ...t, adjWeight: adj };
  });
  const totalW = pool.reduce((s, t) => s + t.adjWeight, 0);
  let r = Math.random() * totalW;
  let i = 0;
  for (; i < pool.length - 1; i++) {
    r -= pool[i].adjWeight;
    if (r <= 0) break;
  }
  return { type: pool[i].key };
}

// Place N pierres aléatoires sur le plateau (en remplaçant des tuiles existantes)
// Évite de placer des pierres sur la dernière ligne pour ne pas bloquer la chute
function placeStones(count) {
  const m = G.m3;
  const candidates = [];
  // On peut placer des pierres partout sauf sur la 1ère ligne (sinon rien ne tombe en haut)
  for (let i = M3_COLS; i < M3_ROWS * M3_COLS; i++) {
    candidates.push(i);
  }
  // Mélange Fisher-Yates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const placed = candidates.slice(0, Math.min(count, candidates.length));
  for (const idx of placed) {
    m.grid[idx] = { type: 'stone' };
  }
}

// Phase 2.12 — DOM diffing : on construit les cellules UNE FOIS,
// puis on met à jour seulement ce qui change (type/bombe/sélection).
// Gain énorme : on évite 63 createElement + 63 img.src à chaque cascade.
function renderM3Grid() {
  perfMark('render');
  const wrap = document.getElementById('m3-grid');
  if (!wrap) return;

  // ⚡ Phase 2.14 — Cleanup orphelins : on dégage tout ce qui n'est pas une cellule
  // (particules, débris, rayons, warm overlay, etc.) à chaque render majeur.
  // Évite l'accumulation visible dans le panneau perf (34 orphelins observés).
  const parentWrap = wrap.parentElement;
  if (parentWrap) {
    parentWrap.querySelectorAll('.m3-burst-particle, .m3-debris, .m3-blast-ray, .m3-blast-core, .m3-warm-overlay, .m3-shockwave').forEach(el => el.remove());
  }
  // ⚡ Phase 3 — Cleanup brutal des classes d'explosion sur toutes les cellules
  // (évite que des cellules restent à opacity:0 entre frames)
  wrap.querySelectorAll('.m3-cell.popping, .m3-cell.flash-detonate').forEach(c => {
    c.classList.remove('popping', 'flash-detonate');
  });

  // Bind tactile : 1 seule fois (déjà géré par _touchBound)
  if (!wrap._touchBound) {
    wrap._touchBound = true;
    let touchStart = null;

    wrap.addEventListener('touchstart', (e) => {
      const cell = e.target.closest('.m3-cell');
      if (!cell) return;
      touchStart = { idx: +cell.dataset.i, x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    wrap.addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 14) {
        onM3Tap(touchStart.idx);
      } else {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const col = hexCol(touchStart.idx);
        const row = hexRow(touchStart.idx);
        const odd = row % 2 === 1;
        const dirs = odd ? [
          { ang:    0, dc:  1, dr:  0 },
          { ang:   60, dc:  1, dr:  1 },
          { ang:  120, dc:  0, dr:  1 },
          { ang:  180, dc: -1, dr:  0 },
          { ang: -120, dc:  0, dr: -1 },
          { ang:  -60, dc:  1, dr: -1 },
        ] : [
          { ang:    0, dc:  1, dr:  0 },
          { ang:   60, dc:  0, dr:  1 },
          { ang:  120, dc: -1, dr:  1 },
          { ang:  180, dc: -1, dr:  0 },
          { ang: -120, dc: -1, dr: -1 },
          { ang:  -60, dc:  0, dr: -1 },
        ];
        let bestDir = null, bestDiff = Infinity;
        for (const d of dirs) {
          let diff = Math.abs(angle - d.ang);
          if (diff > 180) diff = 360 - diff;
          if (diff < bestDiff) {
            bestDiff = diff;
            bestDir = d;
          }
        }
        if (bestDir) {
          const nc = col + bestDir.dc;
          const nr = row + bestDir.dr;
          if (hexInBounds(nc, nr)) {
            doSwap(touchStart.idx, hexIdx(nc, nr));
          }
        }
      }
      touchStart = null;
    }, { passive: true });
  }

  // Phase 2 fix — Calcul dimensions hex
  const wrapW = wrap.clientWidth || 320;
  const cellW = wrapW / (M3_COLS + 0.5);
  const cellH = cellW * 1.1547;
  const rowOffset = cellH * 0.75;
  const totalH = (M3_ROWS - 1) * rowOffset + cellH;
  wrap.style.height = totalH + 'px';

  const bombImgMap = {
    petite: 'tiles/bombepetite.png',
    grande: 'tiles/bombegrande.png',
    mega:   'tiles/bombemega.png',
    hyper:  'tiles/bombehyper.png',
  };

  // ⚡ Phase 2.12 — Mode INIT : si la grille est vide ou que sa taille a changé, on (re)crée tout
  const existingCells = wrap.querySelectorAll('.m3-cell');
  const needsRebuild = existingCells.length !== M3_ROWS * M3_COLS;

  if (needsRebuild) {
    // Création de zéro
    wrap.innerHTML = '';
    for (let row = 0; row < M3_ROWS; row++) {
      const isOddRow = row % 2 === 1;
      for (let col = 0; col < M3_COLS; col++) {
        const i = hexIdx(col, row);
        const cell = document.createElement('div');
        cell.className = 'm3-cell';
        cell.dataset.i = i;
        const xOffset = isOddRow ? cellW * 0.5 : 0;
        cell.style.left = (col * cellW + xOffset) + 'px';
        cell.style.top = (row * rowOffset) + 'px';
        cell.style.width = cellW + 'px';
        cell.style.height = cellH + 'px';
        cell.addEventListener('click', () => onM3Tap(i));
        wrap.appendChild(cell);
      }
    }
  }

  // ⚡ Phase 2.12 — Mode UPDATE : on met à jour seulement le contenu de chaque cellule
  // C'est ici qu'on gagne énormément
  const cells = wrap.querySelectorAll('.m3-cell');
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    let tile = G.m3.grid[i];
    // ⚡ V0.5 fix critique — Pendant une animation (bombe en cours d'explosion),
    // les nulls sont VOLONTAIRES (tiles détruites en attente de chute).
    // Si on les régénère ici via newTile(), les bombes paraissent "n'exploser rien" :
    // les tiles disparaissent 1 frame puis réapparaissent au render suivant.
    // On laisse les nulls visibles pendant l'anim, checkAndResolve fera la chute proprement.
    if (!tile && !G.m3.animating) {
      // Safety net : seulement hors animation (cas d'un trou imprévu, ex: load buggé)
      tile = newTile();
      G.m3.grid[i] = tile;
    }
    const sel = G.m3.sel === i;

    // 1. Sélection (classe simple)
    cell.classList.toggle('selected', sel);

    // 2. Calcul des nouvelles classes (stone, bomb-*, megastone, megahide)
    const isStone = tile && tile.type === 'stone';
    const isBomb = tile && tile.bomb;
    const isObstacle = tile && (tile.type === 'megastone' || tile.type === 'megahide');
    const bombClass = isBomb ? ('bomb-' + tile.bomb) : '';

    // Récupère la signature actuelle vs précédente
    const newSig = isStone
      ? 'stone'
      : isBomb
        ? ('bomb:' + tile.bomb + ':' + tile.type)
        : isObstacle
          ? ('obs:' + tile.type + ':' + (tile.megaHits || 0))
          : (tile ? 'tile:' + tile.type : 'empty');
    const oldSig = cell.dataset.sig || '';

    // ⚡ Si rien n'a changé sur cette tile, on saute (gros gain en cascade)
    if (newSig === oldSig && !needsRebuild) continue;

    cell.dataset.sig = newSig;

    // Nettoyage des classes bomb-* / stone / obstacle
    cell.classList.remove('stone', 'bomb-petite', 'bomb-grande', 'bomb-mega', 'bomb-hyper', 'obstacle');

    // 3. Vide le contenu (mais garde la cellule elle-même)
    cell.innerHTML = '';

    // 4. Recréation du contenu (pas de la cellule)
    if (isStone) {
      cell.classList.add('stone');
      cell.innerHTML = `<svg viewBox="-10 -10 20 20" style="width:78%;height:78%" pointer-events="none">
        <polygon points="-7,-3 -3,-7 4,-6 7,1 5,6 -2,7 -7,3" fill="#3a3833" stroke="#555248" stroke-width="0.7" stroke-linejoin="round"/>
        <path d="M-3,-3 L1,-1 L0,3" fill="none" stroke="#1a1815" stroke-width="0.6" stroke-linecap="round"/>
        <path d="M3,-3 L4,1" fill="none" stroke="#1a1815" stroke-width="0.6" stroke-linecap="round"/>
      </svg>`;
    } else if (isObstacle) {
      // ⚡ Phase 3 — Megastone / Megahide : obstacles que 3 mega-bombes détruisent
      // ⚡ Phase 6 — Skin contextuel : megastone → Matrice quantique en Recherche
      cell.classList.add('obstacle');
      // ⚡ V0.5 fix lag — fallback préventif au lieu d'attendre 404
      const url = getAvailableTileImg(tile.type, G.m3?.context);
      if (url) {
        const img = document.createElement('img');
        img.decoding = 'async';
        img.src = url;
        img.alt = tile.type === 'megahide' ? 'Megahide' : 'Megastone';
        img.className = 'obstacle-img';
        img.onerror = () => {
          img.style.display = 'none';
          const fb = document.createElement('div');
          fb.className = 'fb';
          fb.style.color = '#888';
          fb.style.fontSize = '28px';
          fb.textContent = tile.type === 'megahide' ? '\u25C7\uFE0E' : '\u25C6\uFE0E';
          cell.appendChild(fb);
        };
        cell.appendChild(img);
      } else {
        // Pas d'asset → fallback direct emoji
        const fb = document.createElement('div');
        fb.className = 'fb';
        fb.style.color = '#888';
        fb.style.fontSize = '28px';
        fb.textContent = tile.type === 'megahide' ? '\u25C7\uFE0E' : '\u25C6\uFE0E';
        cell.appendChild(fb);
      }
      // Indicateur du nombre d'impacts (0/3)
      const hitInd = document.createElement('div');
      hitInd.className = 'obstacle-hits';
      hitInd.textContent = (tile.megaHits || 0) + '/3';
      cell.appendChild(hitInd);
    } else if (isBomb) {
      cell.classList.add(bombClass);
      const t = tileInfo(tile.type);
      const tileColor = t.color;
      // ⚡ V0.5 — Les PNG bombes existent dans le bundle, on les utilise.
      const bombUrl = bombImgMap[tile.bomb] || bombImgMap.petite;
      if (AVAILABLE_TILE_ASSETS.has(bombUrl)) {
        const img = document.createElement('img');
        img.decoding = 'async';
        img.src = bombUrl;
        img.alt = 'Bombe ' + tile.bomb;
        img.className = 'bomb-img';
        img.onerror = () => {
          img.style.display = 'none';
          const fb = document.createElement('div');
          fb.className = 'fb';
          fb.style.color = tileColor;
          fb.style.fontSize = '32px';
          fb.textContent = tile.bomb === 'hyper' ? '\u25C9\uFE0E' : tile.bomb === 'mega' ? '\u25CE\uFE0E' : '\u25CB\uFE0E';
          cell.appendChild(fb);
        };
        cell.appendChild(img);
      } else {
        // Fallback safety (ne devrait jamais arriver)
        const fb = document.createElement('div');
        fb.className = 'fb';
        fb.style.color = tileColor;
        fb.style.fontSize = '32px';
        fb.textContent = tile.bomb === 'hyper' ? '\u25C9\uFE0E' : tile.bomb === 'mega' ? '\u25CE\uFE0E' : '\u25CB\uFE0E';
        cell.appendChild(fb);
      }
      const typeIndicator = document.createElement('div');
      typeIndicator.className = 'bomb-type-indicator';
      typeIndicator.style.background = tileColor;
      cell.appendChild(typeIndicator);
    } else if (tile) {
      const t = tileInfo(tile.type);
      // ⚡ V0.5 fix lag — On vérifie d'abord si l'asset existe.
      // Si oui : on crée un <img>. Si non : on dessine directement le fallback emoji.
      // Évite le pattern "tenter de charger → 404 → fallback" qui lague avec des dizaines de cellules.
      const url = getAvailableTileImg(tile.type, G.m3?.context);
      if (url) {
        const img = document.createElement('img');
        img.decoding = 'async';
        img.src = url;
        img.alt = t.label;
        img.onerror = () => {
          // Safety net : si malgré tout le fichier ne charge pas (cache cassé, etc.)
          img.style.display = 'none';
          const fb = document.createElement('div');
          fb.className = 'fb';
          fb.style.color = t.color;
          fb.textContent = t.emoji;
          cell.appendChild(fb);
        };
        cell.appendChild(img);
      } else {
        // Pas d'asset disponible → dessine directement le fallback emoji (zéro 404)
        const fb = document.createElement('div');
        fb.className = 'fb';
        fb.style.color = t.color;
        fb.textContent = t.emoji;
        cell.appendChild(fb);
      }
    }
  }
}

function renderM3Bars() {
  const sc = G.m3.score;
  // ⚡ Phase 6 — Mode "explosions" (labo, centrale, ...) : barre dédiée
  const obj = G.m3.objective;
  if (obj && obj.mode === 'explosions') {
    const target = obj.target;
    const explosions = G.m3.explosions || 0;
    const pct = Math.min(100, explosions / target * 100);
    const isFull = explosions >= target;
    const skill = G.m3.megahideSkillUnlocked;
    const skillStatus = skill
      ? `<span style="color:#5fffa8">🧠 plan découvert : ${skill.label}</span>`
      : `<span style="color:var(--mut)">skill caché dans la matrice quantique</span>`;
    const colorMain = isFull ? obj.accentFull : obj.accent;
    // Update du HUD objectif (en haut) avec le texte de l'objectif actif
    const goalEl = document.getElementById('m3-goal');
    if (goalEl) goalEl.textContent = obj.goalText;
    // Barre full-width
    document.getElementById('m3-bars').innerHTML = `
      <div style="padding:2px 0">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:10px;color:var(--mut);letter-spacing:.06em;text-transform:lowercase">${obj.label}${isFull ? ' · maximum' : ''}</span>
          <span style="font-size:13px;font-weight:600;color:${colorMain};font-variant-numeric:tabular-nums">${explosions}/${target}</span>
        </div>
        <div style="height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct.toFixed(1)}%;background:${colorMain};box-shadow:0 0 8px ${colorMain}aa;transition:width .3s ease;border-radius:2px"></div>
        </div>
        <div style="font-size:9px;margin-top:5px;letter-spacing:.04em">${skillStatus}</div>
      </div>
    `;
    return;
  }

  // Mode standard : on restaure le texte d'objectif (si on revient d'un labo/centrale)
  const goalEl = document.getElementById('m3-goal');
  if (goalEl && goalEl.textContent !== '80 métal · 40 énergie') {
    goalEl.textContent = '80 métal · 40 énergie';
  }

  // Phase 1 — Détecter l'atteinte initiale de l'objectif global
  const allGoalsMet = Object.entries(M3_GOALS).every(([k, g]) => (sc[k] || 0) >= g);
  if (allGoalsMet && !G.m3.objectifAtteint) {
    G.m3.objectifAtteint = true;
    // ⚡ Phase 3 — Objectif atteint : fin automatique de la session
    // (on laisse 800ms pour voir l'animation puis on lance endM3)
    if (typeof toast === 'function') {
      toast('🎯 Objectif atteint !');
    }
    // Bonus visuel : tinkle le HUD de l'objectif
    const obj = document.querySelector('.m3-objective');
    if (obj) {
      obj.style.transition = 'all 0.5s';
      obj.style.boxShadow = '0 0 24px rgba(95,255,168,.5)';
      setTimeout(() => { obj.style.boxShadow = ''; }, 1500);
    }
    // Lance la fin de session après un court délai pour que le joueur voie l'animation
    setTimeout(() => {
      if (!G.m3.ended) endM3(false);
    }, 1200);
  }
  const html = TILES.map(t => {
    const goal = M3_GOALS[t.key] || 0;
    const val = Math.round(sc[t.key] || 0);
    let pct, vStr, extraClass = '', extraSubtext = '';
    if (goal > 0) {
      pct = Math.min(100, val / goal * 100);
      vStr = `${val}/${goal}`;
      // Phase 1 — Indicateur d'overshoot (objectif dépassé)
      if (val >= goal) {
        extraClass = 'done';
        if (val >= goal * 1.5) {
          // Très dépassé — gaspillage probable
          extraSubtext = ' <span style="color:#ff8848;font-size:9px;letter-spacing:.06em">· surplus</span>';
        } else {
          extraSubtext = ' <span style="color:#5fffa8;font-size:9px;letter-spacing:.06em">· atteint</span>';
        }
      }
    } else {
      // Pas d'objectif : on affiche juste la valeur (les ressources sans goal = bonus)
      pct = val > 0 ? 100 : 0;
      vStr = `${val}`;
    }
    return `
      <div class="m3-bar ${extraClass}">
        <div class="nm">${t.label.toLowerCase()}${extraSubtext}</div>
        <div class="vl" style="color:${t.color}">${vStr}</div>
        <div class="br"><div class="fl" style="width:${pct.toFixed(1)}%;background:${t.color}"></div></div>
      </div>
    `;
  }).join('');
  document.getElementById('m3-bars').innerHTML = html;
}

function updateM3HUD() {
  document.getElementById('m3-moves').textContent = G.m3.moves;
  const multEl = document.getElementById('m3-mult');
  multEl.textContent = G.m3.mult;
  if (G.m3.mult > 1) multEl.classList.add('boost');
  else multEl.classList.remove('boost');
}

function onM3Tap(idx) {
  if (G.m3.ended) return;
  const tile = G.m3.grid[idx];
  // ⚡ Phase 3 — Une bombe peut être tappée même pendant une cascade
  // Le joueur peut enchaîner des explosions au milieu d'une chaîne pour des combos
  // (mais autres taps restent bloqués pour éviter les inputs concurrents)
  if (tile && tile.bomb && !tile._detonating && G.m3.sel === null) {
    detonateBomb(idx);
    return;
  }
  if (G.m3.animating) return;
  // Une pierre n'est pas sélectionnable
  if (tile && tile.type === 'stone') {
    if (G.m3.sel === null) {
      toast('Pierre inerte — détruis-la avec un match adjacent');
    }
    return;
  }
  const sel = G.m3.sel;
  // 19/05 v2 — Tap sur bombe avec rien de sélectionné = explosion directe
  if (sel === null && tile && tile.bomb) {
    detonateBomb(idx);
    return;
  }
  if (sel === null) { G.m3.sel = idx; renderM3Grid(); return; }
  if (sel === idx)  { G.m3.sel = null; renderM3Grid(); return; }
  // Phase 2 — Voisinage hexagonal (6 directions au lieu de 4)
  if (!hexAreNeighbors(sel, idx)) {
    G.m3.sel = idx; renderM3Grid(); return;
  }
  G.m3.sel = null;
  doSwap(sel, idx);
}

// 19/05 — Détonation d'une bombe (line / zone / mega)
// Phase 2.13 — Refactor : une SEULE session d'explosions, une SEULE chute
// La première bombe accumule tous les targets de la chaîne et gère la chute
function detonateBomb(idx, chainSession) {
  perfMark('detonate:' + (chainSession ? 'chained' : 'first'));
  const m = G.m3;
  if (m.ended) return;
  const tile = m.grid[idx];
  if (!tile || !tile.bomb) return;

  // ⚡ Phase 3 fix — Marquer la bombe comme "détoneé" tout de suite pour éviter
  // qu'elle soit retappée pendant l'animation de la cascade
  if (tile._detonating) return;

  // ⚡ Phase 3 — Si une session de cascade est déjà active et qu'on tap une bombe externe,
  // on rejoint la session existante (combo manuel pendant une cascade)
  if (!chainSession && m.animating && m._currentChainSession) {
    chainSession = m._currentChainSession;
    // Si la bombe est déjà dans bombsTriggered, c'est qu'elle va exploser via la chaîne
    // → on bloque le tap (sinon double explosion)
    if (chainSession.bombsTriggered.has(idx)) return;
    chainSession.bombsTriggered.add(idx);
  }

  const isChained = !!chainSession;
  // Première bombe : on crée la session
  if (!isChained) {
    m.animating = true;
    m.moves--;
    updateM3HUD();
    chainSession = {
      allTargets: new Set(),
      bombsTriggered: new Set([idx]),
      pendingChains: 0,
      explosionDepth: 0,
    };
    m._currentChainSession = chainSession;
  }

  // ⚡ Phase 6 — Mode "explosions" (labo/centrale/...) : compter cette explosion
  // +1 de base, +1 bonus si en cascade (chainSession.explosionDepth > 0 = on est enchaîné)
  if (m.objective && m.objective.mode === 'explosions') {
    let gain = 1;
    if (chainSession.explosionDepth > 0) gain += 1;
    m.explosions += gain;
    chainSession.explosionDepth++;
    if (typeof updateM3HUD === 'function') updateM3HUD();
  }

  // ⚡ Marquer la bombe comme en cours de détonation
  tile._detonating = true;

  // Calculer les targets de CETTE bombe
  const targets = new Set();
  const r = Math.floor(idx / M3_COLS);
  const c = idx % M3_COLS;

  if (tile.bomb === 'petite') {
    // ⚡ V0.5 — PETITE : la diagonale entière sur l'axe d'origine du run.
    // L'axe est soit ╱ (NE-SW) soit ╲ (NW-SE).
    const cube = hexOffsetToCube(c, r);
    const axisName = tile.axis || 'NE-SW'; // fallback diagonale ╱
    const axis = HEX_AXES.find(a => a.name === axisName) || HEX_AXES[0];
    targets.add(idx);
    // Parcourir l'axe dans les 2 directions
    let cx = cube.x + axis.dx, cy = cube.y + axis.dy, cz = cube.z + axis.dz;
    while (true) {
      const ni = hexCubeIdx(cx, cy, cz);
      if (ni === null) break;
      targets.add(ni);
      cx += axis.dx; cy += axis.dy; cz += axis.dz;
    }
    cx = cube.x - axis.dx; cy = cube.y - axis.dy; cz = cube.z - axis.dz;
    while (true) {
      const ni = hexCubeIdx(cx, cy, cz);
      if (ni === null) break;
      targets.add(ni);
      cx -= axis.dx; cy -= axis.dy; cz -= axis.dz;
    }
  } else if (tile.bomb === 'grande') {
    // ⚡ V0.5 — GRANDE : étoile hex = la tile + ses 6 voisins directs (7 tiles).
    // Visuel : une fleur à 6 pétales, parfaitement hexagonale.
    targets.add(idx);
    const neighbors = hexNeighbors(c, r);
    for (const [nc, nr] of neighbors) {
      targets.add(hexIdx(nc, nr));
    }
  } else if (tile.bomb === 'mega') {
    // ⚡ V0.5 — MEGA : toutes les tiles du même type sur le plateau (inchangé).
    for (let i = 0; i < M3_ROWS * M3_COLS; i++) {
      if (m.grid[i] && m.grid[i].type === tile.type) targets.add(i);
    }
  } else if (tile.bomb === 'hyper') {
    // ⚡ V0.5 — HYPER : X géant = les 2 diagonales hex qui se croisent à la bombe.
    // Visuel : un X formé par les 2 diagonales ╱ et ╲. Massif et iconique.
    // + toutes les tiles du même type (ressource bonus).
    const cube = hexOffsetToCube(c, r);
    targets.add(idx);
    // Les 2 diagonales (NE-SW et NW-SE)
    for (const axis of HEX_AXES) {
      let cx = cube.x + axis.dx, cy = cube.y + axis.dy, cz = cube.z + axis.dz;
      while (true) {
        const ni = hexCubeIdx(cx, cy, cz);
        if (ni === null) break;
        targets.add(ni);
        cx += axis.dx; cy += axis.dy; cz += axis.dz;
      }
      cx = cube.x - axis.dx; cy = cube.y - axis.dy; cz = cube.z - axis.dz;
      while (true) {
        const ni = hexCubeIdx(cx, cy, cz);
        if (ni === null) break;
        targets.add(ni);
        cx -= axis.dx; cy -= axis.dy; cz -= axis.dz;
      }
    }
    // Bonus : toutes les tiles du même type (saveur "explosion de résonance")
    for (let i = 0; i < M3_ROWS * M3_COLS; i++) {
      if (m.grid[i] && m.grid[i].type === tile.type) targets.add(i);
    }
  }

  // Détecter les bombes voisines à déclencher en chaîne
  const newChainedBombs = [];
  targets.forEach(i => {
    if (i === idx) return;
    if (chainSession.bombsTriggered.has(i)) return; // déjà déclenchée
    const t = m.grid[i];
    if (t && t.bomb) {
      newChainedBombs.push({ idx: i, bomb: t.bomb });
      chainSession.bombsTriggered.add(i);
    }
  });
  // Retirer les bombes chaînées de targets — elles s'auto-détruiront via leur propre explosion
  newChainedBombs.forEach(b => targets.delete(b.idx));

  // ⚡ Phase 3 — Si MEGA ou HYPER bombe, on traite les obstacles touchés
  // - Si megaHits < 2 : incrémenter, retirer de targets (la tile reste)
  // - Si megaHits >= 2 (3e impact) : remplacer par récompense, garder dans targets pour flash
  if (tile.bomb === 'mega' || tile.bomb === 'hyper') {
    const obstaclesToProcess = [];
    targets.forEach(i => {
      const t = m.grid[i];
      if (t && (t.type === 'megastone' || t.type === 'megahide')) {
        obstaclesToProcess.push(i);
      }
    });
    obstaclesToProcess.forEach(i => {
      const obs = m.grid[i];
      const newHits = (obs.megaHits || 0) + 1;
      if (newHits >= 3) {
        // 3e impact : on libère la récompense
        // megahide → artefact, megastone → cristal
        const rewardKey = obs.type === 'megahide' ? 'artefact' : 'cristal';
        const rewardAmount = obs.type === 'megahide' ? 5 : 5;
        m.score[rewardKey] = (m.score[rewardKey] || 0) + rewardAmount;
        // L'obstacle est détruit : la tile sera retirée comme un target normal
        // (la cellule deviendra null puis sera remplacée à la chute)
        if (typeof toast === 'function') {
          const label = obs.type === 'megahide' ? '✦ Artefact libéré !' : '◆ Cristal libéré !';
          toast(label);
        }
        // ⚡ Phase 6 — Mode "explosions" : megahide cassé = skill débloqué
        // Pool de skills dépend du bâtiment (labo, centrale, ...)
        if (m.objective && m.objective.mode === 'explosions' && obs.type === 'megahide' && !m.megahideSkillUnlocked) {
          const pool = window.SBSkills ? SBSkills.dropPool(G.planet.parcels[m.parcelIdx]) : [];   // PATCH_1610_SKILLS
          const picked = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
          if (picked) {
            m.megahideSkillUnlocked = picked;
            if (typeof toast === 'function') toast('Découverte : ' + picked.label);
          }
        }
      } else {
        // Pas encore détruit : on incrémente et on retire de targets (la tile reste)
        obs.megaHits = newHits;
        targets.delete(i);
      }
    });
  } else {
    // Pour les bombes petite/grande : les obstacles ne sont pas affectés
    // → on les retire de targets pour qu'elles ne soient pas détruites
    targets.forEach(i => {
      const t = m.grid[i];
      if (t && (t.type === 'megastone' || t.type === 'megahide')) {
        targets.delete(i);
      }
    });
  }

  // Ajouter targets de cette bombe à la session
  targets.forEach(i => chainSession.allTargets.add(i));
  chainSession.allTargets.add(idx); // soi-même

  // ⚡ Phase 3 fix critique — On capture les types AVANT de nullifier
  // (sinon le scoring ne trouve plus rien)
  const targetTypes = [];
  targets.forEach(i => {
    const tl = m.grid[i];
    if (tl && tl.type !== 'stone') targetTypes.push(tl.type);
  });

  // Nullifier IMMÉDIATEMENT la bombe et ses targets normaux dans la grille
  // (pour éviter qu'elle reste tap-able pendant la cascade)
  // Les obstacles non-détruits restent (ils ont été retirés de targets plus haut)
  // Les bombes chaînées (dans newChainedBombs) restent aussi (leur setTimeout les nullifiera)
  const chainedIdxSet = new Set(newChainedBombs.map(b => b.idx));
  m.grid[idx] = null; // la bombe elle-même disparaît tout de suite
  targets.forEach(i => {
    if (chainedIdxSet.has(i)) return; // bombe chaînée : on la laisse pour qu'elle puisse exploser
    m.grid[i] = null;
  });

  // Effets visuels de CETTE bombe
  if (typeof triggerM3Shake === 'function') {
    const shakeMap = { petite: 2, grande: 4, mega: 5, hyper: 6 };
    triggerM3Shake(shakeMap[tile.bomb] || 3);
  }
  if (typeof spawnBlast === 'function') {
    spawnBlast(idx, tile.bomb);
  }
  if (typeof spawnShockwave === 'function') {
    spawnShockwave(idx, tile.bomb);
  }
  if (typeof spawnBurst === 'function') {
    const tileColor = tileInfo(tile.type)?.color || '#fff';
    const burstMap = { petite: 5, grande: 8, mega: 12, hyper: 18 };
    spawnBurst(idx, tileColor, burstMap[tile.bomb] || 6);
  }
  if (typeof spawnDebris === 'function') {
    const debrisMap = { petite: 6, grande: 10, mega: 14, hyper: 18 };
    spawnDebris(idx, debrisMap[tile.bomb] || 6);
  }
  if (tile.bomb === 'hyper' && typeof screenFlashEffect === 'function') {
    screenFlashEffect();
  }

  // Marquer score (bonus important pour bombe)
  // ⚡ Phase 3 — bombMult réduit : avec value=1, on garde un bonus mais sans exploser
  const bonus = m.scoreBonus || 1;
  const bombMultMap = { petite: 1.2, grande: 1.5, mega: 2, hyper: 3 };
  const bombMult = bombMultMap[tile.bomb] || 1.2;
  // ⚡ On utilise targetTypes (capturé avant la nullification) au lieu de m.grid (qui est null)
  targetTypes.forEach(type => {
    const t = tileInfo(type);
    if (t) m.score[t.key] = (m.score[t.key] || 0) + (t.value * bombMult * bonus) / SCORE_DIV;
  });

  // ⚡ Phase 3 — Artefact uniquement via mega/hyper bombe
  // C'est l'âme profonde de la planète qui se libère lors d'une explosion massive
  if (tile.bomb === 'mega' || tile.bomb === 'hyper') {
    const artefactGain = tile.bomb === 'hyper' ? 3 : 1;
    m.score.artefact = (m.score.artefact || 0) + artefactGain * bonus;
    if (typeof toast === 'function' && !G.tutorialArtefactSeen) {
      G.tutorialArtefactSeen = true;
      toast(`✦ ${artefactGain} artefact libéré !`);
    }
  }

  // Flash + popping sur cases touchées
  const cells = document.querySelectorAll('.m3-cell');
  targets.forEach(i => {
    cells[i]?.classList.add('flash-detonate');
    setTimeout(() => cells[i]?.classList.add('popping'), 60);
  });
  // Aussi sur la bombe elle-même
  cells[idx]?.classList.add('flash-detonate');
  setTimeout(() => cells[idx]?.classList.add('popping'), 60);

  // Programmer les bombes chaînées (effets visuels seulement, pas de modification de grille)
  if (newChainedBombs.length > 0) {
    if (!G.tutorialChainBombs && typeof toast === 'function' && !isChained) {
      G.tutorialChainBombs = true;
      toast(`💥💥 Réaction en chaîne !`);
    }
    chainSession.pendingChains += newChainedBombs.length;
    newChainedBombs.forEach((b, i) => {
      setTimeout(() => {
        chainSession.pendingChains--;
        const stillThere = m.grid[b.idx];
        if (stillThere && stillThere.bomb && !m.ended) {
          detonateBomb(b.idx, chainSession);
        }
      }, (i + 1) * 110);
    });
    try {
      if (navigator.vibrate && !isChained) {
        const pattern = [];
        for (let i = 0; i < newChainedBombs.length + 1; i++) {
          pattern.push(20, 80);
        }
        navigator.vibrate(pattern);
      }
    } catch(e) {}
  }

  // Si on est une bombe chaînée, on s'arrête là — la première bombe gère la chute
  if (isChained) return;

  // PREMIÈRE BOMBE SEULEMENT : on attend que toutes les chaînes soient finies, puis on fait la chute
  // On attend voidDuration + le temps que toutes les chaînes aient pu se déclencher
  // (estimé : 110ms × bombsTriggered.size)
  // ⚡ Phase 3 — Slow-motion modéré : pause après explosion, sans excès
  const voidDuration = tile.bomb === 'hyper' ? 630 : tile.bomb === 'mega' ? 560 : 500;
  const checkAndResolve = () => {
    if (m.ended) return;
    // Si des chaînes sont encore en attente, on attend
    if (chainSession.pendingChains > 0) {
      setTimeout(checkAndResolve, 60);
      return;
    }
    // Toutes les chaînes ont explosé, on peut faire la chute avec tous les targets accumulés
    const allTargets = chainSession.allTargets;
    allTargets.forEach(i => { m.grid[i] = null; });
    // Chute des tuiles — robuste contre undefined
    for (let cc = 0; cc < M3_COLS; cc++) {
      const col = [];
      for (let rr = M3_ROWS - 1; rr >= 0; rr--) {
        const t = m.grid[rr * M3_COLS + cc];
        if (t) col.push(t); // accepte tile valide, rejette null/undefined
      }
      while (col.length < M3_ROWS) col.push(newTile());
      for (let rr = M3_ROWS - 1; rr >= 0; rr--) m.grid[rr * M3_COLS + cc] = col[M3_ROWS - 1 - rr];
    }
    // ⚡ Phase 2.13 fix — Après destruction + chute, toutes les cellules d'une colonne touchée
    // peuvent avoir changé de contenu sans changer de signature.
    // On invalide TOUTES les cells des colonnes touchées + on nettoie les classes d'explosion.
    const colsHit = new Set();
    allTargets.forEach(i => colsHit.add(i % M3_COLS));
    const cellsAll = document.querySelectorAll('.m3-cell');
    cellsAll.forEach(c => {
      const idx2 = +c.dataset.i;
      const colIdx = idx2 % M3_COLS;
      if (colsHit.has(colIdx)) {
        // Invalide la signature pour forcer re-render
        c.dataset.sig = '';
        // Retire les classes d'explosion qui peuvent avoir vidé l'innerHTML
        c.classList.remove('flash-detonate', 'popping');
      }
    });
    renderM3Bars();
    renderM3Grid();
    if (typeof animateCascadeDrop === 'function') animateCascadeDrop(allTargets);
    const chain = findMatches();
    // ⚡ Phase 2.16 — Cap dur cascade ×5 : au-delà, on arrête en silence
    if (chain.length > 0 && m.mult < 5) {
      m.mult = Math.min(m.mult + 1, 5);
      updateM3HUD();
      setTimeout(() => resolveAll(chain), 360);
    } else {
      m.mult = 1;
      m._lastBubbleMult = 0;
      m.animating = false;
      m._currentChainSession = null; // ⚡ Phase 3 — Libère la session courante
      updateM3HUD();
      if (m.moves <= 0 && !m.ended) endM3(false);
    }
  };
  setTimeout(checkAndResolve, voidDuration);
}

function doSwap(a, b) {
  if (G.m3.animating || G.m3.ended) return;
  // Refuser swap si l'une des deux cases est une pierre
  if ((G.m3.grid[a] && G.m3.grid[a].type === 'stone') ||
      (G.m3.grid[b] && G.m3.grid[b].type === 'stone')) {
    return;
  }
  // ⚡ Phase 3 — Les obstacles megastone/megahide sont swappables librement
  // Le joueur peut les repositionner stratégiquement
  // 19/05 v2 — Si l'une des cases est une bombe, le swap se fait
  // ET la bombe explose depuis sa nouvelle position
  const aBomb = G.m3.grid[a] && G.m3.grid[a].bomb;
  const bBomb = G.m3.grid[b] && G.m3.grid[b].bomb;
  if (aBomb || bBomb) {
    [G.m3.grid[a], G.m3.grid[b]] = [G.m3.grid[b], G.m3.grid[a]];
    renderM3Grid();
    // La bombe est désormais à la position opposée
    const bombPos = aBomb ? b : a;
    // ⚠️ Ne PAS set m.animating=true ici — detonateBomb le fait lui-même
    // et vérifie animating au début (sinon il s'auto-bloque)
    setTimeout(() => {
      detonateBomb(bombPos);
    }, 120);
    return;
  }
  // ⚡ Phase 3 — Si l'un des deux est un obstacle, le swap est autorisé même sans match
  // (le joueur déplace stratégiquement l'obstacle, ça coûte un coup)
  const aIsObs = G.m3.grid[a] && (G.m3.grid[a].type === 'megastone' || G.m3.grid[a].type === 'megahide');
  const bIsObs = G.m3.grid[b] && (G.m3.grid[b].type === 'megastone' || G.m3.grid[b].type === 'megahide');
  const swapHasObstacle = aIsObs || bIsObs;

  [G.m3.grid[a], G.m3.grid[b]] = [G.m3.grid[b], G.m3.grid[a]];
  const matches = findMatches();
  if (matches.length === 0 && !swapHasObstacle) {
    // Swap normal sans match → revert
    [G.m3.grid[a], G.m3.grid[b]] = [G.m3.grid[b], G.m3.grid[a]];
    renderM3Grid();
    return;
  }
  // Si swap avec obstacle sans match : on accepte, ça coûte un coup mais pas de cascade
  G.m3.moves--;
  G.m3.animating = matches.length > 0; // anim seulement si match à résoudre
  updateM3HUD();
  renderM3Grid();
  if (matches.length > 0) {
    setTimeout(() => resolveAll(matches), 100);
  } else {
    // Swap obstacle pur : juste un coup consommé, pas de résolution
    G.m3.animating = false;
    if (G.m3.moves <= 0 && !G.m3.ended) endM3(false);
  }
}

function findMatches() {
  // Phase 2 — Détection sur les 3 axes hex
  const found = new Set();
  const g = G.m3.grid;
  for (let row = 0; row < M3_ROWS; row++) {
    for (let col = 0; col < M3_COLS; col++) {
      const tile = g[hexIdx(col, row)];
      // ⚡ Phase 3 — Bombes et obstacles ne participent jamais aux matches
      if (!tile || tile.type === 'stone' || tile.bomb || tile.type === 'megastone' || tile.type === 'megahide') continue;
      const cube = hexOffsetToCube(col, row);
      // Pour chaque axe, on essaie de partir de cette cellule vers "l'avant"
      // (on évite de double-compter en exigeant que la cellule précédente sur cet axe
      //  soit hors grille ou de type différent — c'est le DÉBUT du run)
      for (const ax of HEX_AXES) {
        // Vérifier que (cube - ax) n'est pas un match du même type (sinon on n'est pas au début)
        const prevIdx = hexCubeIdx(cube.x - ax.dx, cube.y - ax.dy, cube.z - ax.dz);
        if (prevIdx !== null) {
          const prevTile = g[prevIdx];
          // Le prev ne compte que s'il n'est ni bombe ni obstacle
          if (prevTile && !prevTile.bomb && prevTile.type === tile.type) continue; // pas le début
        }
        // Compter combien de tuiles consécutives de ce type sur cet axe
        let len = 1;
        let cx = cube.x + ax.dx, cy = cube.y + ax.dy, cz = cube.z + ax.dz;
        while (true) {
          const nextIdx = hexCubeIdx(cx, cy, cz);
          if (nextIdx === null) break;
          const nextTile = g[nextIdx];
          // Bombes et obstacles cassent le run
          if (!nextTile || nextTile.bomb || nextTile.type !== tile.type) break;
          len++;
          cx += ax.dx; cy += ax.dy; cz += ax.dz;
        }
        if (len >= 3) {
          // Tag toutes les cellules du run
          let mx = cube.x, my = cube.y, mz = cube.z;
          for (let k = 0; k < len; k++) {
            const i = hexCubeIdx(mx, my, mz);
            if (i !== null) found.add(i);
            mx += ax.dx; my += ax.dy; mz += ax.dz;
          }
        }
      }
    }
  }
  return [...found];
}

// Détecte les "runs" hex sur les 3 axes : retourne longueur + axe + indices + center
function findMatchRuns() {
  const runs = [];
  const g = G.m3.grid;
  for (let row = 0; row < M3_ROWS; row++) {
    for (let col = 0; col < M3_COLS; col++) {
      const tile = g[hexIdx(col, row)];
      // ⚡ Phase 3 — Bombes et obstacles exclus
      if (!tile || tile.type === 'stone' || tile.bomb || tile.type === 'megastone' || tile.type === 'megahide') continue;
      const cube = hexOffsetToCube(col, row);
      for (const ax of HEX_AXES) {
        const prevIdx = hexCubeIdx(cube.x - ax.dx, cube.y - ax.dy, cube.z - ax.dz);
        if (prevIdx !== null) {
          const prevTile = g[prevIdx];
          if (prevTile && !prevTile.bomb && prevTile.type === tile.type) continue;
        }
        let len = 1;
        const indices = [hexIdx(col, row)];
        let cx = cube.x + ax.dx, cy = cube.y + ax.dy, cz = cube.z + ax.dz;
        while (true) {
          const nextIdx = hexCubeIdx(cx, cy, cz);
          if (nextIdx === null) break;
          const nextTile = g[nextIdx];
          if (!nextTile || nextTile.bomb || nextTile.type !== tile.type) break;
          indices.push(nextIdx);
          len++;
          cx += ax.dx; cy += ax.dy; cz += ax.dz;
        }
        if (len >= 3) {
          runs.push({
            indices,
            length: len,
            type: tile.type,
            axis: ax.name,
            center: indices[Math.floor(len / 2)],
          });
        }
      }
    }
  }
  return runs;
}

// Détecte les intersections L/T sur 2 axes (hex) → bombe grande
// Si une cellule appartient à 2 runs (ou plus) sur des axes différents, on a un croisement
function findLTIntersections(runs) {
  const lts = [];
  const usedRunIds = new Set();
  // Map: index de cellule → liste d'IDs de runs qui passent par là
  const cellToRuns = new Map();
  runs.forEach((r, runIdx) => {
    r.indices.forEach(i => {
      if (!cellToRuns.has(i)) cellToRuns.set(i, []);
      cellToRuns.get(i).push(runIdx);
    });
  });
  // Cherche les cellules avec 2+ runs de même type sur des axes différents
  cellToRuns.forEach((runIds, cellIdx) => {
    if (runIds.length < 2) return;
    // Vérifier qu'on a au moins 2 runs sur axes différents et même type
    const matchedRuns = runIds.map(id => runs[id]).filter(r => r.type === runs[runIds[0]].type);
    const axesSet = new Set(matchedRuns.map(r => r.axis));
    if (matchedRuns.length >= 2 && axesSet.size >= 2) {
      const allIndices = [...new Set(matchedRuns.flatMap(r => r.indices))];
      lts.push({
        indices: allIndices,
        center: cellIdx,
        type: runs[runIds[0]].type,
        length: allIndices.length,
        isLT: true,
      });
      matchedRuns.forEach((r) => {
        // ⚡ V0.5 fix — Clé cohérente avec la 2e boucle dans resolveAll (axis + indices)
        usedRunIds.add(r.axis + ':' + r.indices.join(','));
      });
    }
  });
  return { lts, usedRunIds };
}

// Trouve les pierres adjacentes aux matches (à détruire en plus)
function findAdjacentStones(matchIndices) {
  const stones = new Set();
  const g = G.m3.grid;
  const matchSet = new Set(matchIndices);
  for (const idx of matchIndices) {
    const r = Math.floor(idx / M3_COLS);
    const c = idx % M3_COLS;
    const neighbors = [
      [r-1, c], [r+1, c], [r, c-1], [r, c+1]
    ];
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nr >= M3_ROWS || nc < 0 || nc >= M3_COLS) continue;
      const ni = nr * M3_COLS + nc;
      if (matchSet.has(ni)) continue;
      if (g[ni] && g[ni].type === 'stone') stones.add(ni);
    }
  }
  return [...stones];
}

// 19/05 — Effets visuels match-3

// Shake d'écran : intensité 1-6 (légère, moyenne, forte)
function triggerM3Shake(intensity) {
  const grid = document.getElementById('m3-grid');
  if (!grid) return;
  const level = intensity <= 1 ? 1 : intensity <= 3 ? 2 : 3;
  grid.classList.remove('m3-shake-1', 'm3-shake-2', 'm3-shake-3');
  // Force reflow pour relancer l'animation
  void grid.offsetWidth;
  grid.classList.add('m3-shake-' + level);
  // Nettoie après l'anim
  const dur = level === 1 ? 250 : level === 2 ? 400 : 600;
  setTimeout(() => grid.classList.remove('m3-shake-' + level), dur);

  // Vibration haptique iOS (silencieuse si non supportée)
  try {
    if (window.navigator && navigator.vibrate) {
      const pattern = level === 1 ? 12 : level === 2 ? [20, 30, 15] : [30, 50, 30, 50, 30];
      navigator.vibrate(pattern);
    }
  } catch(e) {}
}

// Bulle multiplicateur visible (×2, ×3, ×4, ×5)
function showMultBubble(mult) {
  const grid = document.getElementById('m3-grid');
  if (!grid) return;
  const wrap = grid.parentElement;
  if (!wrap) return;
  // Couleur progressive selon intensité
  const colors = { 2: '#5fffe8', 3: '#ffc864', 4: '#ff8848', 5: '#a370ff' };
  const sizes = { 2: 36, 3: 44, 4: 52, 5: 64 };
  const labels = { 2: '×2', 3: '×3', 4: '×4', 5: 'CASCADE !' };
  const bubble = document.createElement('div');
  bubble.className = 'm3-mult-bubble';
  bubble.style.color = colors[mult] || '#fff';
  bubble.style.fontSize = (sizes[mult] || 36) + 'px';
  bubble.textContent = labels[mult] || ('×' + mult);
  // Position : utilise un parent positionné
  wrap.style.position = wrap.style.position || 'relative';
  wrap.appendChild(bubble);
  setTimeout(() => bubble.remove(), 1100);
}

// Particules d'explosion au centre d'un match
// idx = index de la cellule, color = couleur des particules, intensity = 3..12
function spawnBurst(idx, color, intensity) {
  // ⚡ Phase 2.15 — skip si FPS bas
  if (typeof isPerfPoor === 'function' && isPerfPoor()) return;
  const grid = document.getElementById('m3-grid');
  if (!grid) return;
  const wrap = grid.parentElement;
  if (!wrap) return;
  // ⚡ Phase 2.14 — Throttle : si trop de particules existent déjà, on skip
  const existing = wrap.querySelectorAll('.m3-burst-particle').length;
  if (existing > 30) return;
  const cell = grid.children[idx];
  if (!cell) return;
  const cellRect = cell.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const cx = cellRect.left - wrapRect.left + cellRect.width / 2;
  const cy = cellRect.top - wrapRect.top + cellRect.height / 2;
  wrap.style.position = wrap.style.position || 'relative';

  const particleCount = Math.min(intensity * 2, 10); // ⚡ 12 → 10
  if (window.perfMonitor) window.perfMonitor.totalParticlesCreated += particleCount;
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
    const dist = 30 + Math.random() * (intensity * 6);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const p = document.createElement('div');
    p.className = 'm3-burst-particle';
    p.style.color = color;
    p.style.background = color;
    p.style.left = (cx - 4) + 'px';
    p.style.top = (cy - 4) + 'px';
    p.style.setProperty('--burst-dx', dx + 'px');
    p.style.setProperty('--burst-dy', dy + 'px');
    const size = 4 + Math.random() * 5;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 500); // ⚡ 750 → 500
  }
}

// 19/05 v2 — Onde de choc circulaire émise depuis une cellule
// tier = 'petite' | 'grande' | 'mega' | 'hyper' (modifie la taille/couleur)
function spawnShockwave(idx, tier) {
  const grid = document.getElementById('m3-grid');
  if (!grid) return;
  const wrap = grid.parentElement;
  if (!wrap) return;
  const cell = grid.children[idx];
  if (!cell) return;
  const cellRect = cell.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const cx = cellRect.left - wrapRect.left + cellRect.width / 2;
  const cy = cellRect.top - wrapRect.top + cellRect.height / 2;
  wrap.style.position = wrap.style.position || 'relative';

  const wave = document.createElement('div');
  wave.className = 'm3-shockwave';
  if (tier === 'mega') wave.classList.add('tier-mega');
  if (tier === 'hyper') wave.classList.add('tier-hyper');
  wave.style.left = cx + 'px';
  wave.style.top = cy + 'px';
  wrap.appendChild(wave);
  const dur = tier === 'hyper' ? 800 : 600;
  setTimeout(() => wave.remove(), dur);
}

// 19/05 v2 — Débris terraforming (particules grises/brunes)
// Évoquent des fragments de roche projetés
function spawnDebris(idx, intensity) {
  // ⚡ Phase 2.15 — skip si FPS bas
  if (typeof isPerfPoor === 'function' && isPerfPoor()) return;
  const grid = document.getElementById('m3-grid');
  if (!grid) return;
  const wrap = grid.parentElement;
  if (!wrap) return;
  const cell = grid.children[idx];
  if (!cell) return;
  const cellRect = cell.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const cx = cellRect.left - wrapRect.left + cellRect.width / 2;
  const cy = cellRect.top - wrapRect.top + cellRect.height / 2;
  wrap.style.position = wrap.style.position || 'relative';

  // ⚡ Phase 2.14 — Throttle débris
  const existing = wrap.querySelectorAll('.m3-debris').length;
  if (existing > 25) return;
  // Palette de débris (roche, terre, métal cassé)
  const colors = ['#6b5840', '#7a6b52', '#4a3d2e', '#8a7a5c', '#5e4f38', '#9a8868'];
  const count = Math.min(intensity, 6); // ⚡ 8 → 6
  if (window.perfMonitor) window.perfMonitor.totalDebrisCreated += count;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * (intensity * 8);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist + Math.random() * 20;
    const rot = (Math.random() - 0.5) * 720 + 'deg';
    const d = document.createElement('div');
    d.className = 'm3-debris';
    d.style.left = (cx - 3) + 'px';
    d.style.top = (cy - 3) + 'px';
    d.style.setProperty('--debris-color', colors[Math.floor(Math.random() * colors.length)]);
    d.style.setProperty('--debris-dx', dx + 'px');
    d.style.setProperty('--debris-dy', dy + 'px');
    d.style.setProperty('--debris-rot', rot);
    d.style.setProperty('--debris-dur', (0.6 + Math.random() * 0.3) + 's'); // ⚡ 0.7-1.1s → 0.6-0.9s
    const size = 3 + Math.random() * 4;
    d.style.width = size + 'px';
    d.style.height = size + 'px';
    wrap.appendChild(d);
    setTimeout(() => d.remove(), 800); // ⚡ 1100 → 800
  }
}

// 19/05 v2 — Flash blanc plein écran (pour hyper-bombe)
function screenFlashEffect() {
  const screen = document.getElementById('scr-m3');
  if (!screen) return;
  const flash = document.createElement('div');
  flash.className = 'm3-screen-flash';
  screen.appendChild(flash);
  setTimeout(() => flash.remove(), 400);
}

// Phase 1 (19/05 v3) — Explosion "sun-burst" : flash central + rayons croisés
// tier: 'petite'|'grande'|'mega'|'hyper'
// idx: cellule de référence (centre de l'explosion)
function spawnBlast(idx, tier) {
  perfMark('blast:' + tier);
  const grid = document.getElementById('m3-grid');
  if (!grid) return;
  const wrap = grid.parentElement;
  if (!wrap) return;
  const cell = grid.children[idx];
  if (!cell) return;
  const cellRect = cell.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const cx = cellRect.left - wrapRect.left + cellRect.width / 2;
  const cy = cellRect.top - wrapRect.top + cellRect.height / 2;
  wrap.style.position = wrap.style.position || 'relative';

  // Dimensions selon tier
  const sizeMap = {
    petite: { core: 60,  rayW: 200, rayH: 5, rays: 2, warm: 160 },
    grande: { core: 80,  rayW: 260, rayH: 6, rays: 2, warm: 220 },
    mega:   { core: 110, rayW: 340, rayH: 8, rays: 4, warm: 300 },
    hyper:  { core: 150, rayW: 440, rayH: 10, rays: 6, warm: 420 },
  };
  const s = sizeMap[tier] || sizeMap.petite;

  // Phase 2.4 — Warm overlay : flash chaud qui éclaire les tiles environnantes (color-dodge)
  const warm = document.createElement('div');
  warm.className = 'm3-warm-overlay';
  warm.style.left = cx + 'px';
  warm.style.top = cy + 'px';
  warm.style.width = s.warm + 'px';
  warm.style.height = s.warm + 'px';
  wrap.appendChild(warm);
  setTimeout(() => warm.remove(), 560);

  // Flash central
  const core = document.createElement('div');
  core.className = 'm3-blast-core';
  core.style.left = cx + 'px';
  core.style.top = cy + 'px';
  core.style.width = s.core + 'px';
  core.style.height = s.core + 'px';
  wrap.appendChild(core);
  setTimeout(() => core.remove(), 620);

  // Rayons
  const angles = [];
  if (s.rays === 2) {
    angles.push(0, 90);
  } else if (s.rays === 4) {
    angles.push(0, 45, 90, 135);
  } else {
    angles.push(0, 30, 60, 90, 120, 150);
  }
  angles.forEach(ang => {
    const ray = document.createElement('div');
    ray.className = 'm3-blast-ray';
    if (tier === 'mega') ray.classList.add('tier-mega');
    if (tier === 'hyper') ray.classList.add('tier-hyper');
    ray.style.left = cx + 'px';
    ray.style.top = cy + 'px';
    ray.style.width = s.rayW + 'px';
    ray.style.height = s.rayH + 'px';
    ray.style.setProperty('--ray-rot', ang + 'deg');
    wrap.appendChild(ray);
    const dur = tier === 'hyper' ? 900 : 700;
    setTimeout(() => ray.remove(), dur);
  });
  // ⚡ Optim : lit-by-blast retiré (boucle sur 63 tiles + filter recompute trop coûteux iPhone)
}

// Phase 2.10 — animateCascadeDrop ultra-simplifié
// Plus de batch, plus de rAF, plus de cleanup individuel.
// On laisse juste l'animation CSS faire son taf, elle se nettoie via `forwards`.
function animateCascadeDrop(targetIndices) {
  // On ne fait l'animation que pour les colonnes touchées
  // mais on n'anime QUE les nouvelles tiles (celles qui sont apparues en haut)
  // Pas besoin d'animer les tiles qui n'ont pas bougé visuellement.

  // Sur iPhone, on désactive totalement l'anim si trop de cellules touchées
  if (targetIndices.size > 14) return; // ⚡ skip si trop d'effet à animer

  const wrap = document.getElementById('m3-grid');
  if (!wrap) return;
  const colsHit = new Set();
  targetIndices.forEach(i => colsHit.add(hexCol(i)));

  // Pour chaque colonne touchée, on n'anime que les N premières lignes
  // (celles qui ont vraiment "dropped" depuis le haut)
  const cellMap = {};
  wrap.querySelectorAll('.m3-cell').forEach(c => {
    cellMap[c.dataset.i] = c;
  });

  colsHit.forEach(cc => {
    const targetsInCol = [...targetIndices].filter(i => hexCol(i) === cc);
    const dropCount = targetsInCol.length; // nombre de tiles qui sont tombées
    // On anime depuis le haut (row 0) sur dropCount lignes
    for (let rr = 0; rr < dropCount && rr < M3_ROWS; rr++) {
      const idx = hexIdx(cc, rr);
      const cell = cellMap[idx];
      if (!cell) continue;
      cell.classList.add('dropping-hex-left');
      // Cleanup auto via setTimeout unique (ou pourrait être animationend, mais setTimeout plus simple)
    }
  });

  // Un seul setTimeout global pour cleanup
  setTimeout(() => {
    document.querySelectorAll('.m3-cell.dropping-hex-left, .m3-cell.dropping-hex-right').forEach(c => {
      c.classList.remove('dropping-hex-left', 'dropping-hex-right');
    });
  }, 280);

  // Vibration : seulement en début (pas en cascade)
  if (G.m3.mult <= 1) {
    try {
      if (navigator.vibrate) navigator.vibrate(10);
    } catch(e) {}
  }
}

function resolveAll(matchIndices) {
  perfMark('resolveAll:' + matchIndices.length + 'm');
  const m = G.m3;
  // Calcul du score (avec bonus de re-mining et SCORE_DIV)
  const bonus = m.scoreBonus || 1;
  matchIndices.forEach(i => {
    const tile = m.grid[i];
    if (!tile || tile.type === 'stone') return;
    const t = tileInfo(tile.type);
    m.score[t.key] = (m.score[t.key] || 0) + (t.value * m.mult * bonus) / SCORE_DIV;
  });

  // 19/05 — Détection des runs longs (4+) pour créer des bombes
  // 4 tiers de bombes selon longueur du match :
  //   4 → petite (line) · 5 → grande (zone) · 6 → mega (all of type) · 7+ → hyper (massif)
  // 19/05 v2 — Bonus : match en L ou T (croisement H/V de même type) → bombe grande
  const runs = (typeof findMatchRuns === 'function') ? findMatchRuns() : [];
  const ltResult = (typeof findLTIntersections === 'function') ? findLTIntersections(runs) : { lts: [], usedRunIds: new Set() };
  const bombSpawns = []; // [{ index, kind, type, dir? }]

  // 1) D'abord les L/T → bombes grandes (mécanique standard match-3)
  for (const lt of ltResult.lts) {
    // length 5 (L simple) → grande ; 6+ → mega ; 7+ → hyper
    let kind = 'grande';
    if (lt.length >= 7) kind = 'hyper';
    else if (lt.length === 6) kind = 'mega';
    bombSpawns.push({ index: lt.center, kind, type: lt.type });
  }

  // 2) Puis les runs droits restants (qui n'ont pas été consommés par un L/T)
  // ⚡ V0.5 fix bombes : on utilise .axis (pas .dir qui n'existait pas → festival de bombes)
  runs.forEach((run, idx) => {
    const runKey = run.axis + ':' + run.indices.join(',');
    if (ltResult.usedRunIds.has(runKey)) return; // déjà absorbé par un L/T
    if (run.length === 4) {
      bombSpawns.push({ index: run.center, kind: 'petite', type: run.type, axis: run.axis });
    } else if (run.length === 5) {
      bombSpawns.push({ index: run.center, kind: 'grande', type: run.type, axis: run.axis });
    } else if (run.length === 6) {
      bombSpawns.push({ index: run.center, kind: 'mega', type: run.type, axis: run.axis });
    } else if (run.length >= 7) {
      bombSpawns.push({ index: run.center, kind: 'hyper', type: run.type, axis: run.axis });
    }
  });

  // Pierres adjacentes à détruire
  const stonesToDestroy = findAdjacentStones(matchIndices);

  const cells = document.querySelectorAll('.m3-cell');
  matchIndices.forEach(i => cells[i]?.classList.add('popping'));
  stonesToDestroy.forEach(i => cells[i]?.classList.add('popping'));

  // 19/05 — Shake d'écran progressif selon le multiplicateur
  // ⚡ Phase 2.16 — shake atténué dès cascade ×2, désactivé ×3+
  if (typeof triggerM3Shake === 'function' && m.mult > 1 && m.mult < 3) {
    triggerM3Shake(Math.max(1, m.mult - 1)); // shake plus doux
  }

  // 19/05 — Toast multiplicateur visible — seulement ×2 à ×5, une seule fois par niveau
  if (typeof showMultBubble === 'function' && m.mult >= 2 && m.mult <= 5 && m.mult !== m._lastBubbleMult) {
    m._lastBubbleMult = m.mult;
    showMultBubble(m.mult);
  }

  // ⚡ Phase 2.16 — En cascade ×2+, on coupe presque tous les effets décoratifs
  // Le joueur a déjà vu le spectacle au coup d'avant, plus besoin de surcharger
  const cascadeLight = m.mult >= 2;
  const cascadeMute = m.mult >= 3;
  if (typeof spawnBurst === 'function' && !cascadeLight) {
    runs.forEach(run => {
      spawnBurst(run.center, tileInfo(run.type)?.color || '#fff', Math.min(run.length, 5));
    });
  }
  if (typeof spawnDebris === 'function' && !cascadeLight) {
    runs.slice(0, 2).forEach(run => {
      spawnDebris(run.center, Math.min(run.length, 4));
    });
  }
  // Mini sun-burst sur création de bombe — en cascade ×3 on coupe carrément
  if (typeof spawnBlast === 'function' && bombSpawns.length > 0 && !cascadeMute) {
    const order = { hyper: 4, mega: 3, grande: 2, petite: 1 };
    const best = bombSpawns.reduce((a, b) => (order[b.kind] > order[a.kind] ? b : a));
    spawnBlast(best.index, best.kind);
  }

  setTimeout(() => {
    if (m.ended) return;
    matchIndices.forEach(i => { m.grid[i] = null; });
    stonesToDestroy.forEach(i => { m.grid[i] = null; });

    // 19/05 — Placer les bombes AVANT la chute (on les garde sur place)
    for (const bomb of bombSpawns) {
      // bomb.index est l'emplacement qu'on transforme en bombe
      m.grid[bomb.index] = { type: bomb.type, bomb: bomb.kind, dir: bomb.dir };
    }
    // 19/05 — Toast pédagogique la première fois qu'une bombe apparaît
    if (bombSpawns.length > 0 && !G.tutorialBombSeen) {
      G.tutorialBombSeen = true;
      if (typeof toast === 'function') {
        toast('💥 Une bombe est apparue ! Tape-la pour la déclencher, ou swap-la pour exploser dans une direction.');
      }
    }
    // 19/05 — Toast pour première mega ou hyper (impressionnant)
    const hasMega = bombSpawns.some(b => b.kind === 'mega');
    const hasHyper = bombSpawns.some(b => b.kind === 'hyper');
    if (hasHyper && !G.tutorialHyperSeen) {
      G.tutorialHyperSeen = true;
      if (typeof toast === 'function') toast('⭐ HYPER-BOMBE ! Effet dévastateur.');
    } else if (hasMega && !G.tutorialMegaSeen) {
      G.tutorialMegaSeen = true;
      if (typeof toast === 'function') toast('💥 MEGA-BOMBE — détruit tout le type.');
    }

    for (let c = 0; c < M3_COLS; c++) {
      const col = [];
      for (let r = M3_ROWS - 1; r >= 0; r--) {
        const t = m.grid[r * M3_COLS + c];
        if (t) col.push(t);
      }
      while (col.length < M3_ROWS) col.push(newTile());
      for (let r = M3_ROWS - 1; r >= 0; r--) m.grid[r * M3_COLS + c] = col[M3_ROWS - 1 - r];
    }
    // ⚡ Phase 2.13 fix — Invalider la signature des cells des colonnes touchées
    // pour forcer le re-render même si le nouveau type est identique à l'ancien
    const destroyed2 = new Set([...matchIndices, ...stonesToDestroy]);
    const colsHit2 = new Set();
    destroyed2.forEach(i => colsHit2.add(i % M3_COLS));
    const cellsAll2 = document.querySelectorAll('.m3-cell');
    cellsAll2.forEach(c => {
      const idx2 = +c.dataset.i;
      const colIdx = idx2 % M3_COLS;
      if (colsHit2.has(colIdx)) {
        c.dataset.sig = '';
        c.classList.remove('popping', 'flash-detonate');
      }
    });
    renderM3Bars();
    renderM3Grid();
    // 19/05 v2 — Anime la chute des tiles
    if (typeof animateCascadeDrop === 'function') {
      animateCascadeDrop(destroyed2);
    }
    const chain = findMatches();
    // ⚡ Phase 2.16 — Cap dur cascade ×5 : au-delà, on arrête en silence
    if (chain.length > 0 && m.mult < 5) {
      m.mult = Math.min(m.mult + 1, 5);
      updateM3HUD();
      setTimeout(() => resolveAll(chain), 360);
    } else {
      m.mult = 1;
      m._lastBubbleMult = 0;
      m.animating = false;
      updateM3HUD();
      if (m.moves <= 0 && !m.ended) endM3(false);
    }
  }, 400);
}

function quitM3() {
  if (G.m3.ended) return;
  G.m3.ended = true;
  endM3(true);
}

function endM3(quit) {
  G.m3.ended = true;
  const sc = G.m3.score;

  // ⚡ Phase 6 — Mode "explosions" (labo, centrale, ...) : ressources proportionnelles + skill
  const obj = G.m3.objective;
  if (obj && obj.mode === 'explosions') {
    const target = obj.target;
    const explosions = G.m3.explosions || 0;
    const ratio = Math.min(1, explosions / target);
    const isFull = explosions >= target;
    const rewardKey = obj.rewardRes;
    // Ressource proportionnelle + bonus barre pleine
    const baseAmount = Math.round(obj.rewardAmount * ratio);
    const bonusAmount = isFull ? Math.round(obj.rewardAmount * obj.fullBonus) : 0;
    sc[rewardKey] = (sc[rewardKey] || 0) + baseAmount + bonusAmount;
    const _skB = window.SBSkills ? SBSkills.applyM3(sc) : [];   // PATCH_1610_SKILLS
    const skill = G.m3.megahideSkillUnlocked;
    const rewardTile = tileInfo(rewardKey);

    // Sous-titre contextuel
    let sub;
    if (quit) {
      sub = `Session interrompue · ${explosions} explosions · +${baseAmount} ${rewardTile.label.toLowerCase()}.`;
    } else if (isFull) {
      sub = `${obj.label.charAt(0).toUpperCase() + obj.label.slice(1)} maximum atteinte · +${baseAmount + bonusAmount} ${rewardTile.label.toLowerCase()} (bonus de saturation).`;
    } else {
      sub = `${explosions} explosions sur ${target} · +${baseAmount} ${rewardTile.label.toLowerCase()}.`;
    }
    if (skill) sub += ` Plan découvert : ${skill.label} (recherche sans frais).`;

    document.getElementById('result-title').textContent =
      isFull ? `◆ ${obj.label.charAt(0).toUpperCase() + obj.label.slice(1)} maximum` : (quit ? 'Session quittée' : 'Session terminée');
    document.getElementById('result-sub').textContent = sub;

    // Affichage des gains
    const rows = [];
    if (baseAmount + bonusAmount > 0) {
      rows.push(`<div class="result-row"><span class="k">+ ${rewardTile.label}</span><span class="v" style="color:${rewardTile.color}">+${baseAmount + bonusAmount}</span></div>`);
    }
    for (const b of _skB) rows.push(`<div class="result-row"><span class="k" style="color:var(--mut)">Skill · ${b.by}</span><span class="v" style="color:${tileInfo(b.res).color}">+${b.extra}</span></div>`);
    if (skill) {
      rows.push(`<div class="result-row" style="border-top:1px solid var(--bord-soft);margin-top:6px;padding-top:8px">
        <span class="k" style="color:#a370ff">🧠 ${skill.label}</span>
        <span class="v" style="color:#a370ff;font-size:10px">${skill.desc}</span>
      </div>`);
    }
    // Inclure aussi les ressources des éventuels megastones cassés (cristal/artefact)
    Object.entries(sc).forEach(([k, v]) => {
      if (k === rewardKey) return; // déjà affiché
      if (v >= 1) {
        const t = tileInfo(k);
        rows.push(`<div class="result-row"><span class="k">+ ${t.label}</span><span class="v" style="color:${t.color}">+${Math.round(v)}</span></div>`);
      }
    });
    document.getElementById('result-rows').innerHTML = rows.join('') ||
      '<div style="color:var(--mut);font-size:11px;text-align:center;font-style:italic">Aucune ressource extraite</div>';
    document.getElementById('result-ovr').classList.add('shown');

    // Dismiss manuel via bouton (fallback 20s)
    window._pendingResultContinue = () => {
      window._pendingResultContinue = null;
      document.getElementById('result-ovr').classList.remove('shown');
      for (const [k, v] of Object.entries(sc)) {
        if (v >= 1 && G.res[k] !== undefined) {
          G.res[k].v = Math.min(G.res[k].max, G.res[k].v + Math.round(v));
        }
      }
      if (skill && window.SBSkills) SBSkills.discover(skill.id);   // PATCH_1910_SKILLS_LONGS : le plan, pas le skill (la recherche prend son temps)
      // En mode explosions, le bâtiment existe déjà : on ne change PAS l'état parcelle
      G.selParcel = G.m3.parcelIdx;
      G.m3.animating = false;
      goto('planet');
    };
    setTimeout(() => {
      if (window._pendingResultContinue) window._pendingResultContinue();
    }, 20000);
    return;
  }

  const goalMet = sc.metal >= M3_GOALS.metal && sc.energie >= M3_GOALS.energie;

  // ⚡ Phase 3 — Message contextuel selon le succès et l'historique de la parcelle
  const parcelForMsg = G.planet.parcels[G.m3.parcelIdx];
  const successesPrior = parcelForMsg.successCount || 0;
  let subtitle;
  if (goalMet) {
    if (successesPrior === 0) {
      subtitle = 'Extraction validée — la parcelle est conquise.';
    } else {
      const newCount = successesPrior + 1;
      const nextStones = Math.min(3 + newCount, 6);
      const nextHides = Math.min(3 + newCount, 6);
      subtitle = `Conquête ${newCount}× · prochain re-mining : ${nextStones} megastone + ${nextHides} megahide.`;
    }
  } else if (quit) {
    subtitle = 'Ressources partielles récupérées.';
  } else {
    subtitle = `Seuil critique d'extraction non atteint. La parcelle reste à conquérir. Ressources partielles : ${Math.round(sc.metal)} métal · ${Math.round(sc.energie)} énergie.`;
  }

  document.getElementById('result-title').textContent =
    goalMet ? '◆ Objectif atteint' : (quit ? 'Session quittée' : 'Session terminée');
  document.getElementById('result-sub').textContent = subtitle;

  const _skB2 = window.SBSkills ? SBSkills.applyM3(sc) : [];   // PATCH_1610_SKILLS : après le calcul de l'objectif
  const rows = Object.entries(sc)
    .filter(([, v]) => v >= 1)
    .map(([k, v]) => {
      const t = tileInfo(k);
      return `<div class="result-row"><span class="k">+ ${t.label}</span><span class="v" style="color:${t.color}">+${Math.round(v)}</span></div>`;
    }).join('') + _skB2.map(b => `<div class="result-row"><span class="k" style="color:var(--mut)">dont skill · ${b.by}</span><span class="v" style="color:${tileInfo(b.res).color}">+${b.extra}</span></div>`).join('');
  document.getElementById('result-rows').innerHTML = rows ||
    '<div style="color:var(--mut);font-size:11px;text-align:center;font-style:italic">Aucune ressource extraite</div>';

  document.getElementById('result-ovr').classList.add('shown');

  // ⚡ Phase 6 — Dismiss manuel : suite à exécuter au click du bouton Continuer
  window._pendingResultContinue = () => {
    window._pendingResultContinue = null;
    document.getElementById('result-ovr').classList.remove('shown');
    for (const [k, v] of Object.entries(sc)) {
      if (v >= 1 && G.res[k] !== undefined) {
        G.res[k].v = Math.min(G.res[k].max, G.res[k].v + Math.round(v));
      }
    }

    // Si la parcelle était rocky, elle devient resource (gisement détecté)
    // Si c'est un re-mining, on incrémente remineCount + check dépletion
    // Si elle avait déjà un bâtiment, on reste built (le M3 sur un bâtiment = boost ponctuel)
    const parcel = G.planet.parcels[G.m3.parcelIdx];
    const wasRemine = G.m3.isRemine;

    // ⚡ Phase 3 — Si l'objectif a été atteint, on note la session réussie
    // (ça ajoute +1 megastone + +1 megahide au prochain re-mining)
    if (goalMet) {
      parcel.successCount = (parcel.successCount || 0) + 1;
    }

    // ⚡ Phase 3 — Changement d'état de la parcelle UNIQUEMENT si objectif atteint
    // - Succès première session (rocky → resource) : la parcelle est révélée
    // - Succès re-mining : on incrémente le compteur
    // - Échec : la parcelle reste vierge / dans son état actuel
    //   Les ressources sont toujours gardées (déjà appliquées plus haut)
    if (goalMet) {
      if (parcel.state === 'rocky') {
        parcel.state = 'resource';
        parcel.n = 'Gisement détecté';
        parcel.sub = 'Construire un bâtiment ou re-miner.';
      } else if (wasRemine && parcel.state === 'resource') {
        parcel.remineCount = (parcel.remineCount || 0) + 1;
        if (parcel.remineCount >= REMINE_MAX) {
          parcel.state = 'depleted';
          parcel.n = 'Gisement épuisé';
          parcel.sub = 'Aucune ressource exploitable. Recyclage requis.';
          toast('Gisement épuisé');
        } else {
          parcel.sub = `Gisement re-miné ${parcel.remineCount}× · conquêtes : ${parcel.successCount}`;
        }
      }
    }
    G.selParcel = G.m3.parcelIdx;
    G.m3.animating = false;
    goto('planet');
  };
  // Fallback de secours : si le joueur reste bloqué, on dismiss après 20s
  setTimeout(() => {
    if (window._pendingResultContinue) window._pendingResultContinue();
  }, 20000);
  // ⚡ V0.5 SAVE — Sauvegarder les ressources acquises pendant la session
  if (typeof saveGame === 'function') saveGame();
}

// ⚡ Phase 6 — Handler du bouton "Continuer" sur l'écran de résultats
// Appelle la suite stockée par endM3 (mode labo ou standard).
function dismissResultOverlay() {
  if (typeof window._pendingResultContinue === 'function') {
    window._pendingResultContinue();
  } else {
    // Failsafe : si pour une raison X la suite a été perdue, on dismiss au minimum
    document.getElementById('result-ovr').classList.remove('shown');
  }
}   // 30/10 (Adrien) : sondes, ressources et vivres par planète
function sbWorldsInit() {
  if (!Array.isArray(G.worlds) || !G.worlds.length) {
    G.worlds = [{ id: 'home', kind: 'capital', name: (G.planet && G.planet.name) || 'KERATH-VII', coord: (typeof MY_COORD_STRING !== 'undefined' ? MY_COORD_STRING : ''), foundedAt: null, data: null }];
  }
  if (!G.activeWorld || !sbWorld(G.activeWorld)) G.activeWorld = 'home';
}
function sbWorld(id) { return (Array.isArray(G.worlds) ? G.worlds : []).find(w => w && w.id === id) || null; }
function sbActiveWorld() { return sbWorld(G.activeWorld || 'home'); }
function sbIsHome() { return !G.activeWorld || G.activeWorld === 'home'; }
function _sbPack() {
  const d = {};
  for (const k of SB_WORLD_KEYS) d[k] = G[k];
  if (d.planet && d.planet.families instanceof Set) d.planet.families = Array.from(d.planet.families);   // JSON : pas de Set
  d.capitalLevel = (G.skills && G.skills.capitalLevel) || 1;
  d.queues = { capital: QUEUES.capital || { upgrade: null }, barracks: QUEUES.barracks || { commands: [] }, shipyard: QUEUES.shipyard || { commands: [] }, prospect: QUEUES.prospect || { commands: [] } };
  d.stationed = G.fleet.stationed;   // flotte à quai de cette planète (Adrien 20/10 : flotte par planète)
  return d;
}
function _sbUnpack(d) {
  for (const k of SB_WORLD_KEYS) G[k] = d[k];
  if (G.planet && Array.isArray(G.planet.families)) G.planet.families = new Set(G.planet.families);
  if (!G.res || !G.res.metal) G.res = sbComputeRes(G.planet);   // 30/10 : planète sans stock propre (ne devrait plus arriver)
  if (G.selParcel == null) G.selParcel = 12;
  if (G.skills) G.skills.capitalLevel = d.capitalLevel || 1;
  const q = d.queues || {};
  QUEUES.capital = q.capital || { upgrade: null };
  QUEUES.barracks = q.barracks || { commands: [] };
  QUEUES.shipyard = q.shipyard || { commands: [] };
  QUEUES.prospect = q.prospect || { commands: [] };   // 30/10 : hangar des sondes par planète
  if (!Array.isArray(G.probesPool)) G.probesPool = [];
  G.fleet.stationed = d.stationed || { tanker: { t1: 0, t2: 0, t3: 0 }, fregate: { t1: 0, t2: 0, t3: 0 }, cuirasse: { t1: 0, t2: 0, t3: 0 } };
}
function _sbSwap(id) {
  if (!id || id === G.activeWorld) return;
  const cur = sbActiveWorld(), nxt = sbWorld(id);
  if (!cur || !nxt || !nxt.data) return;
  cur.data = _sbPack();
  const d = nxt.data; nxt.data = null;
  _sbUnpack(d);
  G.activeWorld = id;
}
// Exécute fn sur la planète id (sans rien afficher), puis revient à la planète active.
function sbWithWorld(id, fn) {
  if (!Array.isArray(G.worlds) || !id || id === (G.activeWorld || 'home') || !sbWorld(id)) return fn();
  const prev = G.activeWorld || 'home';
  const wasSwapping = G._sbSwapping;
  G._sbSwapping = true;
  _sbSwap(id);
  try { return fn(); }
  finally { _sbSwap(prev); G._sbSwapping = wasSwapping; }
}
// Toutes les parcelles de l'empire (production commune : crédits, carburant)
function sbAllParcels() {
  const out = ((G.planet && G.planet.parcels) || []).slice();
  for (const w of (G.worlds || [])) if (w && w.data && w.data.planet && Array.isArray(w.data.planet.parcels)) out.push(...w.data.planet.parcels);
  return out;
}
function sbComputeRes(planet, keepV) {
  const R = {};
  for (const [k, m] of Object.entries(SB_RES_BASE)) R[k] = { v: (keepV && keepV[k] && keepV[k].v) || 0, max: m, rate: 0 };
  for (const p of (planet && planet.parcels) || []) {
    if (!p || p.state !== 'built' || !p.building) continue;
    const prod = (typeof _mpTierProd === 'function') ? _mpTierProd(p) : {};
    for (const [k, v] of Object.entries(prod)) if (R[k]) R[k].rate += v - ((p.damaged && p.damageLoss && p.damageLoss[k]) || 0);
    const meta = BUILDINGS[p.building];
    if (meta && meta.kind === 'silo' && meta.silo && R[meta.silo.res]) {
      const td = BUILDING_TIERS[p.building] && BUILDING_TIERS[p.building][p.lvl || 1];
      R[meta.silo.res].max += (td && td.siloCap) || meta.silo.cap || 0;
    }
  }
  for (const k of Object.keys(R)) R[k].rate = Math.max(0, R[k].rate);
  return R;
}
function sbWorldRes(wid) {
  if (!wid || wid === (G.activeWorld || 'home')) return G.res;
  const w = (Array.isArray(G.worlds) ? G.worlds : []).find(x => x && x.id === wid);
  return (w && w.data && w.data.res) || null;
}
// la fortune de l'empire : toutes les planètes additionnées (marché)
function sbEmpireRes() {
  const out = {};
  const add = (R) => { for (const [k, r] of Object.entries(R || {})) out[k] = (out[k] || 0) + Math.floor((r && r.v) || 0); };
  add(G.res);
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) if (w && w.id !== (G.activeWorld || 'home') && w.data) add(w.data.res);
  return out;
}
// Passage du stock commun au stock par planète (une fois) : la capitale garde le stock commun moins la production
// et les silos de ses colonies ; chaque colonie reprend son dépôt.
function sbMigrateResPerWorld() {
  if (G._resPerWorld) return;
  if (!Array.isArray(G.worlds) || G.worlds.length < 2) { G._resPerWorld = 1; return; }
  const act = G.activeWorld || 'home';
  const shared = G.res;
  const colonyRes = {};
  for (const w of G.worlds) {
    if (!w || w.id === 'home') continue;
    const pl = w.id === act ? G.planet : (w.data && w.data.planet);
    const R = sbComputeRes(pl);
    const d = w.depot || {};
    for (const k of ['metal', 'energie', 'cristal']) R[k].v = Math.floor(d[k] || 0);
    colonyRes[w.id] = R;
    // ce que la colonie produisait et stockait sortait du stock commun
    for (const [k, r] of Object.entries(R)) if (shared[k]) {
      shared[k].rate = Math.max(0, (shared[k].rate || 0) - r.rate);
      shared[k].max = Math.max(SB_RES_BASE[k] || 1000, (shared[k].max || 0) - (r.max - (SB_RES_BASE[k] || 0)));
    }
    delete w.depot;
  }
  const homeW = G.worlds.find(w => w && w.id === 'home');
  if (act === 'home') {
    for (const w of G.worlds) if (w && w.id !== 'home' && w.data) w.data.res = colonyRes[w.id];
  } else {
    if (homeW && homeW.data) homeW.data.res = shared;
    G.res = colonyRes[act];
    for (const w of G.worlds) if (w && w.id !== 'home' && w.id !== act && w.data) w.data.res = colonyRes[w.id];
  }
  G._resPerWorld = 1;
}
// 30/10 (Adrien) — sondes par planète : chaque planète a son hangar (G.probesPool de la planète affichée,
// w.data.probesPool pour les autres). Les balises posées restent visibles et actives quelle que soit la planète affichée.
function sbAllProbes() {
  const out = (Array.isArray(G.probesPool) ? G.probesPool : []).slice();
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) if (w && w.id !== (G.activeWorld || 'home') && w.data && Array.isArray(w.data.probesPool)) out.push(...w.data.probesPool);
  return out;
}
function sbMigrateProbesPerWorld() {
  if (G._probesPerWorld) return;
  if (!Array.isArray(G.worlds) || G.worlds.length < 2) { G._probesPerWorld = 1; return; }
  const act = G.activeWorld || 'home';
  for (const w of G.worlds) {
    if (!w || w.id === act || !w.data) continue;
    if (w.id === 'home' && act !== 'home') {   // tout le hangar commun revient à la capitale
      w.data.probesPool = Array.isArray(G.probesPool) ? G.probesPool : [];
      w.data.queues = Object.assign({}, w.data.queues, { prospect: QUEUES.prospect || { commands: [] } });
      G.probesPool = []; QUEUES.prospect = { commands: [] };
    } else {
      if (!Array.isArray(w.data.probesPool)) w.data.probesPool = [];
      w.data.queues = Object.assign({ prospect: { commands: [] } }, w.data.queues);
      if (!w.data.queues.prospect) w.data.queues.prospect = { commands: [] };
    }
  }
  for (const m of (G.probeMissions || [])) if (m && !m.world) m.world = 'home';
  G._probesPerWorld = 1;
}
// Les autres planètes avancent aussi : chantiers, amélioration de bâtiment, caserne.
function sbTickOtherWorlds(at, secs, out) {
  if (!Array.isArray(G.worlds) || G.worlds.length < 2) return;
  for (const w of G.worlds) {
    if (!w || w.id === G.activeWorld || !w.data) continue;
    sbWithWorld(w.id, () => {
      const b = tickConstructions(at);
      if (b && b.length) out.builds.push(...b.map(n => n + ' (' + (w.name || 'colonie') + ')'));
      if (secs > 0) _advanceQueues(secs, out, true);
    });
  }
}
// Changer de planète affichée
function sbSwitchWorld(id) {
  sbWorldsInit();
  if (id === G.activeWorld || !sbWorld(id)) return false;
  _sbSwap(id);
  // PATCH_2110_COLONIE_DESERT : capitale (jardin) ↔ colonie (désert) : la scène se reconstruit au rechargement
  if (window.sbTerrainVariant && window.__sbTerrainLoaded && window.sbTerrainVariant() !== window.__sbTerrainLoaded) {
    try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
    const w = sbWorld(id), nm = (w && (w.kind === 'capital' ? (w.data && w.data.planet && w.data.planet.name) || G.planet.name : w.name)) || '';
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10060;background:#000;display:grid;place-items:center;opacity:0;transition:opacity .45s ease';
    ov.innerHTML = '<div style="text-align:center;font:600 13px/1.4 -apple-system,system-ui,sans-serif;letter-spacing:.3em;color:#ffd9a8;text-transform:uppercase">Cap sur ' + String(G.planet && G.planet.name || nm).replace(/[<>&]/g, '') + '<div style="margin-top:10px;font:500 9px/1.4 \'SF Mono\',monospace;letter-spacing:.2em;color:rgba(214,226,240,.6)">Mise en orbite</div></div>';
    document.body.appendChild(ov); requestAnimationFrame(() => { ov.style.opacity = '1'; });
    setTimeout(() => location.reload(), 520);
    return true;
  }
  if (window.Planet3D && Planet3D.ready) { try { Planet3D._sig = ''; Planet3D.sync(true); } catch (e) {} }
  try { if (typeof renderPlanetMap === 'function') renderPlanetMap(); } catch (e) {}
  try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
  try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
  return true;
}
// Fonder une colonie (utilisé par l'arrivée du vaisseau colonial ; cheat de test en attendant)
function sbFoundColony(opts) {
  sbWorldsInit();
  opts = opts || {};
  const n = G.worlds.filter(w => w.kind === 'colony').length + 1;
  const name = String(opts.name || ('COLONIE-' + n)).toUpperCase().slice(0, 24);
  const planet = {
    name, address: opts.address || null, coordString: opts.coord || '', type: 3, level: 0, age: (G.planet && G.planet.age) || "L'Éveil",
    parcels: Array.from({ length: 25 }, (_, i) => makeInitialParcel(i)), families: ['Capitale'],
  };
  const defense = { capitalBase: 200, units: { garde: { qty: 0, dmg: 0 }, lourd: { qty: 0, dmg: 0 }, tourelle: { qty: 0, dmg: 0 }, tourelle_lourde: { qty: 0, dmg: 0 } } };
  const w = { id: 'col-' + Date.now().toString(36), kind: 'colony', name, coord: opts.coord || '', foundedAt: Date.now(),
    data: { planet, defense, antenna: null, aftermath: undefined, selParcel: 12, capitalLevel: 1, probesPool: [], res: (() => { const R = sbComputeRes(planet); R.metal.v = 2000; R.energie.v = 1000; R.cristal.v = 500; return R; })(),   // 30/10 : stock propre, la cale de l'Arche pour démarrer
      queues: { capital: { upgrade: null }, barracks: { commands: [] }, prospect: { commands: [] } } } };
  G.worlds.push(w);
  try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
  return w;
}
function cheatFoundColony(name) { const w = sbFoundColony({ name: name || 'Test colonie' }); sbSwitchWorld(w.id); return w.id; }

/**
 * Lance une amélioration de bâtiment via le Centre de Commandement.
 * Une seule amélioration à la fois (sauf skill Logistique parallèle débloqué).
 */
function startBuildingUpgrade(parcelIdx) {
  if (QUEUES.capital.upgrade) {
    toast('Une amélioration est déjà en cours');
    return false;
  }
  const parcel = G.planet.parcels[parcelIdx];
  if (!parcel || parcel.state !== 'built' || !parcel.building) {
    toast('Parcelle invalide');
    return false;
  }
  if (parcel.damaged) {
    toast('Bâtiment abîmé : répare-le d\'abord');
    return false;
  }
  if (parcel.recycleEndsAt) { toast('Démolition en cours : annule-la pour améliorer'); return false; }   // PATCH_2010_RECYCLER
  if (window.SBAftermath && SBAftermath.upgradeBlocked()) {
    toast('Planète dévastée : lance les secours avant d\'améliorer');
    return false;
  }
  const currentTier = parcel.lvl || 1;
  if (currentTier >= TIER_MAX) {
    toast('Niveau maximum atteint');
    return false;
  }
  const nextTier = currentTier + 1;
  const tierData = BUILDING_TIERS[parcel.building]?.[nextTier];
  if (!tierData) {
    toast('Tier indisponible');
    return false;
  }
  // Vérifier ressources
  for (const [res, qty] of Object.entries(tierData.cost)) {
    if (!G.res[res] || G.res[res].v < qty) {
      toast(`Manque de ${res}`);
      return false;
    }
  }
  // Débiter
  for (const [res, qty] of Object.entries(tierData.cost)) {
    G.res[res].v -= qty;
  }
  // Lancer
  QUEUES.capital.upgrade = {
    parcelIdx,
    buildingKey: parcel.building,
    fromTier: currentTier,
    toTier: nextTier,
    totalDur: Math.max(1, Math.round(tierData.duration * (window.SBSkills ? SBSkills.durMult('build') : 1))),   // PATCH_1610_SKILLS
    elapsed: 0,
  };
  toast(`Amélioration ${tierData.name} démarrée`);
  // Démarrer le ticker s'il n'est pas déjà lancé
  if (typeof startQueueTicker === 'function') startQueueTicker();
  return true;
}

/**
 * Annule l'amélioration en cours, rembourse 80% des ressources.
 */
function cancelBuildingUpgrade() {
  const up = QUEUES.capital.upgrade;
  if (!up) return false;
  const tierData = BUILDING_TIERS[up.buildingKey]?.[up.toTier];
  if (tierData) {
    for (const [res, qty] of Object.entries(tierData.cost)) {
      if (G.res[res]) G.res[res].v = Math.min(Math.max(G.res[res].max, G.res[res].v), G.res[res].v + Math.floor(qty * 0.80));
    }
  }
  QUEUES.capital.upgrade = null;
  toast('Amélioration annulée — 80% remboursés');
  return true;
}

// Chunk polish 15/05 : helper async avec modal Starbyte
async function onBuildingUpgradeCancelClick(rerenderContext) {
  const up = QUEUES.capital.upgrade;
  if (!up) return;
  const tierData = BUILDING_TIERS[up.buildingKey]?.[up.toTier];
  const meta = BUILDINGS[up.buildingKey];
  const buildingName = meta?.name || 'bâtiment';
  // Liste des ressources remboursées
  const refundLines = [];
  if (tierData) {
    for (const [res, qty] of Object.entries(tierData.cost)) {
      refundLines.push(`+${fmt(Math.floor(qty * 0.80))} ${res}`);
    }
  }
  const body = `Annuler l'amélioration de <strong>${buildingName}</strong> ?<br><br>Remboursement :<br>${refundLines.map(l => `· ${l}`).join('<br>')}<br><br><em>20% des ressources seront perdues.</em>`;
  const ok = await sbConfirmDanger('Annuler l\'amélioration', body, 'Annuler');
  if (!ok) return;
  cancelBuildingUpgrade();
  if (rerenderContext === 'building-detail' && typeof renderBuildingDetail === 'function') renderBuildingDetail();
  if (rerenderContext === 'capital' && typeof renderCapitalTabContent === 'function') renderCapitalTabContent();
  if (typeof renderDashboard === 'function') renderDashboard();
}

/**
 * Tick de la queue capital (appelé par le timer principal du jeu).
 */
function tickCapitalQueue(deltaSec) {
  const up = QUEUES.capital.upgrade;
  if (!up) return;
  up.elapsed += deltaSec;
  if (up.elapsed >= up.totalDur) {
    completeBuildingUpgrade();
  }
}

/**
 * Termine l'amélioration : la parcelle passe au tier suivant.
 */
function completeBuildingUpgrade() {
  const up = QUEUES.capital.upgrade;
  if (!up) return;
  const parcel = G.planet.parcels[up.parcelIdx];
  if (!parcel) {
    QUEUES.capital.upgrade = null;
    return;
  }
  const newTier = up.toTier;
  if (up.buildingKey === 'capital') {   // PATCH_1910_CAPITAL
    G.skills.capitalLevel = Math.max(G.skills.capitalLevel || 1, newTier);
    G.defense.capitalBase = 200 * G.skills.capitalLevel;
    parcel.lvl = G.skills.capitalLevel;
    QUEUES.capital.upgrade = null;
    toast(`⊕ ${BUILDING_TIERS.capital[newTier].name} opérationnel : Tier ${newTier}`);
    try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderPlanetMap === 'function') renderPlanetMap();
    const cs = document.getElementById('scr-capital');
    if (cs && !cs.classList.contains('hidden')) renderCapitalScreen();
    return;
  }
  const tierData = BUILDING_TIERS[up.buildingKey]?.[newTier];
  if (!tierData) {
    QUEUES.capital.upgrade = null;
    return;
  }
  // Mise à jour parcelle
  parcel.lvl = newTier;
  parcel.n = tierData.name;
  if (tierData.desc) parcel.sub = tierData.desc;
  // Recalcul prod : on retire l'ancienne et on ajoute la nouvelle
  const oldTierData = BUILDING_TIERS[up.buildingKey]?.[up.fromTier];
  if (oldTierData?.prod) {
    for (const [res, rate] of Object.entries(oldTierData.prod)) {
      if (G.res[res]?.rate !== undefined) G.res[res].rate -= rate;
    }
  }
  if (tierData.prod) {
    for (const [res, rate] of Object.entries(tierData.prod)) {
      if (G.res[res]?.rate !== undefined) G.res[res].rate += rate;
    }
    parcel.prod = Object.entries(tierData.prod).map(([res, rate]) => [
      prodInfo(res).label.toLowerCase(),
      rateLbl(res, rate)
    ]);
  }
  if (tierData.def !== undefined) {
    parcel.prod = (parcel.prod || []).filter(l => l[0] !== 'défense');
    parcel.prod.push(['défense', `+${tierData.def}`]);
  }
  // ─── Silo (passe 2.4) : ajuster la capacité de la ressource concernée ───
  const meta = BUILDINGS[up.buildingKey];
  if (meta?.kind === 'silo' && meta.silo) {
    const oldCap = oldTierData?.siloCap || 0;
    const newCap = tierData.siloCap || 0;
    const delta = newCap - oldCap;
    const res = meta.silo.res;
    if (G.res[res] !== undefined) {
      G.res[res].max += delta;
    }
    parcel.prod = [['capacité', `+${fmt(newCap)} ${res}`]];
  }
  // Notification
  toast(`${tierData.name} opérationnel !`);
  QUEUES.capital.upgrade = null;
  // Re-render des écrans concernés
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderPlanetMap === 'function') renderPlanetMap();
  if (selectedBuildingParcelIdx === up.parcelIdx) {
    if (typeof renderBuildingDetail === 'function') renderBuildingDetail();
  }
}

/**
 * Recrute des unités défensives.
 * type = 'garde' | 'lourd' | 'tourelle'
 * qty  = quantité à produire dans cette commande
 */
function recruitUnit(unitKey, qty) {
  const unit = DEFENSE_UNITS[unitKey];
  if (!unit) {
    toast('Unité inconnue');
    return;
  }
  if (unit.locked) {
    toast(unit.lockedReason || 'Unité verrouillée');
    return;
  }
  // ─── Passe 2.4 : vérifier le prérequis bâtiment ───
  // garde → caserne ; lourd & tourelle → bunker (clé interne 'turret')
  if (unit.requires) {
    const hasBuilding = G.planet.parcels.some(p =>
      p.state === 'built' && p.building === unit.requires
    );
    if (!hasBuilding) {
      const buildingName = BUILDINGS[unit.requires]?.name || unit.requires;
      toast(`${buildingName} requis pour recruter ${unit.name}`);
      return;
    }
    if (unit.minLevel && bestBuildingLevel(unit.requires) < unit.minLevel) { toast(unit.lockedReason || 'Niveau de bâtiment insuffisant'); return; }
  }
  ensureDefenseUnits();

  // Vérification du coût pour LA TOTALITÉ de la commande (à payer d'avance)
  const totalCost = {};
  for (const [res, qPerUnit] of Object.entries(unit.cost)) {
    totalCost[res] = qPerUnit * qty;
  }
  for (const [res, q] of Object.entries(totalCost)) {
    if (!G.res[res] || G.res[res].v < q) {
      const missing = q - (G.res[res]?.v || 0);
      toast(`Manque ${missing} ${res}`);
      return;
    }
  }
  for (const [res, q] of Object.entries(totalCost)) {
    G.res[res].v -= q;
  }

  // Détermine où va la commande (tourelle → shipyard? non — toutes les unités défensives passent par la caserne)
  // Pour la passe 2, on simplifie : tout le défensif passe par 'barracks'
  const queueKey = 'barracks';

  // Durée par unité ajustée selon skill productionSpeed
  const unitDuration = Math.max(1, Math.round(unit.duration / G.skills.productionSpeed * (window.SBSkills ? SBSkills.durMult('troops') : 1)));

  const command = {
    unitKey,
    totalQty: qty,
    completed: 0,
    currentElapsed: 0,
    unitDuration: unitDuration,
    cost: totalCost,
    addedAt: Date.now(),
  };
  QUEUES[queueKey].commands.push(command);
  toast(`${qty}× ${unit.name} en file`);
  renderQueue(queueKey);
  startQueueTicker();
}

/** Annule une commande encore en file (et rembourse le coût des unités non-produites) */
function cancelCommand(queueKey, idx) {
  const cmd = QUEUES[queueKey].commands[idx];
  if (!cmd) return;
  const remaining = cmd.totalQty - cmd.completed;
  if (remaining <= 0) return;
  // Rembourse 80% du coût des unités non produites (coût total enregistré dans la commande)
  const unit = DEFENSE_UNITS[cmd.unitKey] || PROBE_PSEUDO_UNITS[cmd.unitKey];
  const totalCost = cmd.cost || (unit ? Object.fromEntries(Object.entries(unit.cost).map(([r, q]) => [r, q * cmd.totalQty])) : {});
  for (const [res, q] of Object.entries(totalCost)) {
    const refund = Math.floor(q * remaining / Math.max(1, cmd.totalQty) * 0.8);
    if (G.res[res]) G.res[res].v = Math.min(Math.max(G.res[res].max, G.res[res].v), G.res[res].v + refund);
    else if (res === 'fuel') G.fuel = Math.min(typeof getFuelCap === 'function' ? Math.max(getFuelCap(), G.fuel || 0) : Infinity, (G.fuel || 0) + refund);   // PATCH_2010_AUDIT — le carburant de l'Arche est rendu aussi
  }
  QUEUES[queueKey].commands.splice(idx, 1);
  toast(`Commande annulée — ${remaining} unités · 80% remboursé`);
  renderQueue(queueKey);
  // Si l'écran défense est ouvert, le rafraîchir
  if (queueKey === 'shipyard' && typeof renderShipyard === 'function') renderShipyard();
  if (!document.getElementById('scr-defense').classList.contains('hidden')) {
    renderDefenseScreen();
  }
  // Si la fiche sonde est ouverte, la rafraîchir (passe 4.5)
  if (!document.getElementById('scr-probe-detail')?.classList.contains('hidden') && typeof renderProbeDetailScreen === 'function') {
    renderProbeDetailScreen();
  }
  // Rafraîchir le dashboard pour le retour des ressources
  if (typeof renderDashResGrid === 'function') renderDashResGrid();
}

// PATCH_2510_PROBE_QUEUE — file de construction des sondes visible : la sonde en cours (barre de progression)
// puis toutes celles qui attendent leur tour (tous types), avec l'heure prévue et l'annulation. Mise à jour à chaque tic.
function _probeQueueHtml(focusTier) {
  const cmds = (QUEUES.prospect && QUEUES.prospect.commands) || [];
  if (!cmds.length) return '';
  const cfgOf = (c) => (typeof PROBE_TIER_CONFIG !== 'undefined' && PROBE_TIER_CONFIG[c.probeTier || String(c.unitKey || '').replace('probe_', '')]) || { label: 'Sonde', accent: '#5fffe8' };
  const hhmm = (ms) => new Date(Date.now() + ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  let acc = 0;
  const rows = cmds.map((c, i) => {
    const cfg = cfgOf(c), dur = Math.max(1, c.unitDuration | 0), left = dur - (c.currentElapsed || 0);
    acc += left;
    const mine = focusTier && (c.probeTier === focusTier || c.unitKey === 'probe_' + focusTier);
    const x = `<button onclick="event.stopPropagation();cancelCommand('prospect', ${i})" aria-label="Annuler" style="background:transparent;border:none;color:var(--mut);font-size:16px;line-height:1;padding:2px 4px;cursor:pointer">×</button>`;
    if (i === 0) {
      const pct = Math.min(100, (c.currentElapsed || 0) / dur * 100);
      return `<div style="padding:10px 12px;border-radius:8px;background:var(--bg-soft);border:1px solid ${cfg.accent}${mine ? '66' : '30'}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="flex:1;font-size:12px;color:var(--text)"><span style="color:${cfg.accent}">${cfg.label}</span> · en construction</span>
          <span style="font-size:11px;color:var(--mut);font-family:'SF Mono',monospace">${formatTime(left)}</span>${x}
        </div>
        <div class="queue-progress-wrap" style="margin-top:7px;height:5px;background:var(--bg);border-radius:3px;overflow:hidden">
          <div class="queue-progress" style="width:${pct.toFixed(1)}%;height:100%;background:${cfg.accent}"></div></div></div>`;
    }
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:1px solid ${mine ? cfg.accent + '44' : 'var(--border)'}">
      <span style="width:18px;font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${i + 1}</span>
      <span style="flex:1;font-size:12px;color:var(--text)"><span style="color:${cfg.accent}">${cfg.label}</span> · en attente</span>
      <span style="font-size:11px;color:var(--mut);font-family:'SF Mono',monospace">prête vers ${hhmm(acc * 1000)}</span>${x}</div>`;
  });
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;margin:2px 2px 6px">
      <span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)">File de construction · ${cmds.length} sonde${cmds.length > 1 ? 's' : ''}</span>
      <span style="font-size:10px;color:var(--mut)">une à la fois</span></div>
    <div style="display:flex;flex-direction:column;gap:6px">${rows.join('')}</div>`;
}
function _probeQueueRefresh() {
  document.querySelectorAll('.probe-queue-live').forEach(el => {
    const h = _probeQueueHtml(el.dataset.tier || '');
    el.innerHTML = h; el.style.display = h ? '' : 'none';
  });
}

function renderQueue(type) {
  if (type === 'prospect') _probeQueueRefresh();   // PATCH_2510_PROBE_QUEUE
  const queue = QUEUES[type];
  const el = document.getElementById(type + '-queue');
  if (!el) return;

  if (queue.commands.length === 0) {
    el.innerHTML = `<div class="queue-row empty">Aucune commande en file</div>`;
    return;
  }

  const slots = type === 'barracks' ? G.skills.barracksSlots : 1;
  const activeCommands = queue.commands.slice(0, slots);
  const waitingCommands = queue.commands.slice(slots);

  // Helper : récupère le meta d'une unité quel que soit son type
  // (défense, sonde, ou vaisseau militaire tier-spécifique)
  const getUnitMeta = (cmd) => {
    // Défense (Caserne)
    if (DEFENSE_UNITS[cmd.unitKey]) return DEFENSE_UNITS[cmd.unitKey];
    // Sonde
    if (PROBE_PSEUDO_UNITS && PROBE_PSEUDO_UNITS[cmd.unitKey]) return PROBE_PSEUDO_UNITS[cmd.unitKey];
    // Vaisseaux militaires (passe 3.1)
    if (SHIP_UNITS[cmd.unitKey]) {
      const meta = SHIP_UNITS[cmd.unitKey];
      const tier = cmd.shipTier || 1;
      const tierData = SHIP_TIERS[cmd.unitKey]?.[tier];
      return {
        name: tierData?.name || meta.name,
        icon: meta.icon,
        color: meta.color || 'var(--cyan)',
      };
    }
    return null;
  };

  let html = '';

  // Cales actives
  activeCommands.forEach((cmd, idx) => {
    const unit = getUnitMeta(cmd);
    if (!unit) return;
    const remaining = cmd.totalQty - cmd.completed;
    const inProgress = cmd.completed + (remaining > 0 ? 1 : 0);
    const pct = (cmd.currentElapsed / cmd.unitDuration) * 100;
    const remainingTime = cmd.unitDuration - cmd.currentElapsed;
    html += `
      <div class="queue-active">
        <div class="queue-slot-label">CALE ${idx + 1}</div>
        <div class="queue-row">
          <div class="queue-batch-icon" style="color:${unit.color}">${renderIcon(unit.icon, {size:18})}</div>
          <div class="queue-info">
            <div class="queue-name">${unit.name}</div>
            <div class="queue-progress-meta">
              Unité ${inProgress} / ${cmd.totalQty} · reste ${remaining}
            </div>
            <div class="queue-progress-wrap"><div class="queue-progress" style="width:${pct.toFixed(1)}%"></div></div>
          </div>
          <div class="queue-time">${formatTime(remainingTime)}</div>
        </div>
        <button class="queue-cancel" onclick="cancelCommand('${type}', ${idx})">Annuler la commande</button>
      </div>
    `;
  });

  // En file d'attente
  if (waitingCommands.length > 0) {
    html += `<div class="queue-waiting-label">En attente d'une cale</div>`;
    waitingCommands.forEach((cmd, i) => {
      const realIdx = slots + i;
      const unit = getUnitMeta(cmd);
      if (!unit) return;
      const remaining = cmd.totalQty - cmd.completed;
      const totalTime = remaining * cmd.unitDuration;
      html += `
        <div class="queue-row queue-waiting">
          <div class="queue-batch-icon" style="color:${unit.color}">${cmd.totalQty}×</div>
          <div class="queue-info">
            <div class="queue-name">${unit.name}</div>
            <div class="queue-progress-meta">${remaining} unités · ${formatTime(totalTime)} total</div>
          </div>
          <button class="queue-cancel small" onclick="cancelCommand('${type}', ${realIdx})">×</button>
        </div>
      `;
    });
  }

  el.innerHTML = html;
}
function startQueueTicker() {
  if (queueTicker) return;
  queueTicker = setInterval(() => {
    try { cheatFastShipsApply(); } catch (e) {}   // PATCH_2110_CHEAT_VAISSEAUX10
    // OFFLINE — les files avancent du temps réellement écoulé (simulateTo)
    const out = simulateTo(Date.now());
    for (const type of out.queueTypes) renderQueue(type);
    let changed = out.queueTypes.size > 0;
    if (out.builds && out.builds.length) { changed = true; if (typeof renderPlanetMap === 'function') renderPlanetMap(); if (typeof saveGame === 'function') saveGame(); }
    if (out.capital) {
      changed = true;
      // Re-render fiche bâtiment si elle est ouverte
      if (!document.getElementById('scr-building-detail')?.classList.contains('hidden')) {
        renderBuildingDetail();
      }
      // Re-render onglet upgrade du Centre s'il est ouvert
      if (!document.getElementById('scr-capital')?.classList.contains('hidden') && capitalTab === 'upgrade') {
        renderCapitalTabContent();
      }
    }
    // Rafraîchir les écrans visibles affectés
    if (changed) {
      if (!document.getElementById('scr-dashboard').classList.contains('hidden')) renderDashboard();
      if (!document.getElementById('scr-defense').classList.contains('hidden')) renderDefenseScreen();
      if (!document.getElementById('scr-shipyard').classList.contains('hidden')) renderShipyard();
      if (!document.getElementById('scr-fleet')?.classList.contains('hidden')) renderFleetScreen();
      if (!document.getElementById('scr-prospect')?.classList.contains('hidden') && typeof renderProspectScreen === 'function') renderProspectScreen();
      if (!document.getElementById('scr-probe-detail')?.classList.contains('hidden') && typeof renderProbeDetailScreen === 'function') renderProbeDetailScreen();
    }
  }, 1000);
}          // récap affiché au-delà d'une minute

function simulateTo(now) {
  const out = { dtMs: 0, queueTypes: new Set(), capital: false, units: 0, upgrades: 0 };
  if (!G._simAt || now < G._simAt) { G._simAt = now; return out; }
  let dt = now - G._simAt;
  if (dt <= 0) return out;
  G._simAt = now;
  if (dt > SIM_MAX_GAP_MS) dt = SIM_MAX_GAP_MS;
  out.dtMs = dt;
  out.builds = [];
  // AUDIT_1110 — l'absence est découpée aux fins de chantier / d'amélioration :
  // chaque bâtiment produit dès qu'il est terminé, même si le joueur n'était pas là.
  const start = now - dt;
  const cuts = [];
  for (const p of (G.planet && G.planet.parcels) || []) {
    if (p && p.state === 'building' && p.buildEndsAt > start && p.buildEndsAt < now) cuts.push(p.buildEndsAt);
  }
  const upg = (typeof QUEUES !== 'undefined' && QUEUES.capital) ? QUEUES.capital.upgrade : null;
  if (upg) {
    const endAt = start + Math.max(0, (upg.totalDur || 0) - (upg.elapsed || 0)) * 1000 + 1000;
    if (endAt > start && endAt < now) cuts.push(endAt);
  }
  // PATCH_2010_AUDIT — les chantiers et améliorations des autres planètes découpent aussi l'absence
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) {
    if (!w || !w.data || w.id === (G.activeWorld || 'home')) continue;
    for (const p of (w.data.planet && w.data.planet.parcels) || []) {
      if (p && p.state === 'building' && p.buildEndsAt > start && p.buildEndsAt < now) cuts.push(p.buildEndsAt);
    }
    const wu = w.data.queues && w.data.queues.capital && w.data.queues.capital.upgrade;
    if (wu) { const endAt = start + Math.max(0, (wu.totalDur || 0) - (wu.elapsed || 0)) * 1000 + 1000; if (endAt > start && endAt < now) cuts.push(endAt); }
  }
  cuts.sort((a, b) => a - b);
  let t0 = start;
  for (const c of cuts) { _simSegment(c - t0, c, out); t0 = c; }
  _simSegment(now - t0, now, out);
  return out;
}
function sbTroopRations() {
  let n = 0;
  const add = d => { const u = d && d.units; if (!u) return; for (const [k, x] of Object.entries(u)) n += (x && x.qty || 0) * ((DEFENSE_UNITS[k] && DEFENSE_UNITS[k].ration) || 0); };
  add(G.defense);
  if (!G._resPerWorld) for (const w of (G.worlds || [])) if (w && w.id !== (G.activeWorld || 'home') && w.data) add(w.data.defense);   // 30/10 : chaque planète nourrit ses troupes
  return n;
}
function sbRationPerDay() { return Math.max(0, sbTroopRations() - SB_FREE_RATIONS); }
function _sbFeedTroops(hours) {
  const r = G.res && G.res.biomass; if (!r) return;
  const perDay = sbRationPerDay();
  if (perDay <= 0) { G._bioBuffer = 0; if (G.troopFamine) { G.troopFamine = false; try { toast('Troupes nourries — défense rétablie'); } catch (e) {} } return; }
  G._bioBuffer = (G._bioBuffer || 0) + perDay * hours / 24;
  const whole = Math.floor(G._bioBuffer);
  if (whole < 1) { if (G.troopFamine && r.v >= 1) G.troopFamine = false; return; }
  G._bioBuffer -= whole;
  const was = !!G.troopFamine;
  if (r.v >= whole) { r.v -= whole; G.troopFamine = false; }
  else { r.v = 0; G.troopFamine = true; }
  if (was !== G.troopFamine) { try { toast(G.troopFamine ? 'Plus de biomasse : tes troupes ont faim (défense des soldats −25 %)' : 'Troupes nourries — défense rétablie'); } catch (e) {} }
}
function _simSegment(ms, at, out) {
  // 1. Ressources — taux HORAIRES (décision d'Adrien 10/10 : « +40/h » veut dire 40 par heure)
  const hours = Math.max(0, ms) / 3600000;
  // 30/10 (Adrien) — chaque planète produit dans SON stock, freinée par SA dévastation, et nourrit SES troupes
  const _aft = window.SBAftermath && typeof SBAftermath.simSegment === 'function';
  const _prodHere = () => {
    const mult = _aft ? SBAftermath.simSegment(hours) : 1;
    for (const [rk, r] of Object.entries(G.res || {})) {   // PATCH_1610_SKILLS : bonus des skills
      const rate = (r.rate || 0) * mult;
      if (rate > 0 && r.v < r.max) r.v = Math.min(r.max, r.v + rate * hours * (window.SBSkills ? SBSkills.prodMult(rk) : 1));
    }
    try { _sbFeedTroops(hours); } catch (e) { console.warn('[vivres]', e); }   // PATCH_2210_VIVRES
  };
  if (typeof sbWithWorld === 'function' && Array.isArray(G.worlds) && G.worlds.length > 1) {
    for (const w of G.worlds) { if (!w || !w.id) continue; try { sbWithWorld(w.id, _prodHere); } catch (e) { console.warn('[production]', w.id, e); } }
  } else _prodHere();


  // 2. Crédits (Comptoirs) et carburant (Raffineries) — taux horaires aussi
  if (typeof getCommerceCreditsRate === 'function') {
    const rate = getCommerceCreditsRate();
    if (rate > 0) {
      G._creditsBuffer = (G._creditsBuffer || 0) + rate * hours;
      const whole = Math.floor(G._creditsBuffer);
      if (whole >= 1) { G.credits = (G.credits || 0) + whole; G._creditsBuffer -= whole; }
    }
  }
  if (typeof getFuelProductionRate === 'function') {
    const rate = getFuelProductionRate();
    if (rate > 0) {
      G._fuelBuffer = (G._fuelBuffer || 0) + rate * hours;
      const whole = Math.floor(G._fuelBuffer);
      if (whole >= 1) {
        const cap = getFuelCap();
        const before = G.fuel || 0;
        G.fuel = Math.min(cap, before + whole);
        G._fuelBuffer -= whole;
        if (G.fuel >= cap && before < cap) toast('Silos de carburant pleins — production stoppée');
      }
    }
  }

  // 2b. Chantiers de bâtiments (date de fin absolue)
  if (typeof tickConstructions === 'function') {
    const b = tickConstructions(at);
    if (b && b.length) out.builds.push(...b);
  }

  // 3. Files (caserne, chantier, prospection, amélioration de bâtiment) — à la seconde près
  G._simSecBuf = (G._simSecBuf || 0) + Math.max(0, ms) / 1000;
  const secs = Math.floor(G._simSecBuf);
  G._simSecBuf -= secs;
  if (secs > 0 && typeof QUEUES !== 'undefined') _advanceQueues(secs, out);
  if (typeof sbTickOtherWorlds === 'function') sbTickOtherWorlds(at, secs, out);   // PATCH_2010_WORLDS
}

function _announceCommandDone(cmd) {
  let unitName = '';
  if (DEFENSE_UNITS[cmd.unitKey]) {
    unitName = DEFENSE_UNITS[cmd.unitKey].name;
  } else if (PROBE_PSEUDO_UNITS && PROBE_PSEUDO_UNITS[cmd.unitKey]) {
    unitName = PROBE_PSEUDO_UNITS[cmd.unitKey].name;
  } else if (SHIP_UNITS[cmd.unitKey]) {
    const tier = cmd.shipTier || 1;
    unitName = SHIP_TIERS[cmd.unitKey]?.[tier]?.name || SHIP_UNITS[cmd.unitKey].name;
  }
  if (cmd.totalQty > 1 && unitName) toast(`${cmd.totalQty}× ${unitName} prêts`);
}

function _advanceQueues(secs, out, localOnly) {   // PATCH_2010_WORLDS : localOnly = files propres à une planète (caserne, amélioration)
  for (const type of ['barracks', 'shipyard', 'prospect']) {   // 30/10 : la file des sondes est aussi propre à chaque planète
    const queue = QUEUES[type];
    if (!queue || !Array.isArray(queue.commands) || queue.commands.length === 0) continue;
    const slots = type === 'barracks' ? (G.skills?.barracksSlots || 1) : 1;
    let next = slots;               // prochaine commande en attente d'une cale
    const done = [];
    for (let i = 0; i < slots && i < queue.commands.length; i++) {
      let cmd = queue.commands[i];
      let budget = secs;
      while (cmd && budget > 0) {
        out.queueTypes.add(type);
        const dur = Math.max(1, cmd.unitDuration | 0);
        const need = dur - (cmd.currentElapsed || 0);
        if (budget < need) { cmd.currentElapsed = (cmd.currentElapsed || 0) + budget; budget = 0; break; }
        budget -= need;
        cmd.currentElapsed = 0;
        cmd.completed++;
        out.units++;
        completeUnitProduction(type, cmd);
        if (cmd.completed >= cmd.totalQty) {
          done.push(cmd);
          _announceCommandDone(cmd);
          cmd = queue.commands[next++] || null;   // la cale libérée prend la suivante
        }
      }
    }
    for (const cmd of done) {
      const idx = queue.commands.indexOf(cmd);
      if (idx >= 0) queue.commands.splice(idx, 1);
    }
  }
  if (QUEUES.capital && QUEUES.capital.upgrade) {
    const had = QUEUES.capital.upgrade;
    tickCapitalQueue(secs);
    out.capital = true;
    if (QUEUES.capital.upgrade !== had) out.upgrades++;
  }
}

// Chantiers terminés → bâtiments réels. Retourne les noms terminés (pour le récap d'absence).
function tickConstructions(now) {
  const done = [];
  if (!G.planet || !Array.isArray(G.planet.parcels)) return done;
  G.planet.parcels.forEach((p, idx) => {
    if (p && p.state === 'building' && p.buildEndsAt && p.buildEndsAt <= now) {
      const key = p.building;
      finishBuild(idx, key);
      done.push((BUILDINGS[key] && BUILDINGS[key].name) || key);
    } else if (p && p.state === 'building' && p.buildEndsAt) {
      p.sub = `Fin dans ${formatTankerDuration(Math.max(0, p.buildEndsAt - now))}`;
    }
  });
  return done;
}

// Annuler un chantier : parcelle rendue, coût remboursé à 100 % (MVP)
function cancelBuild(idx) {
  const p = G.planet.parcels[idx];
  if (!p || p.state !== 'building') return;
  for (const [res, qty] of Object.entries(p.buildCost || {})) { if (G.res[res]) G.res[res].v = Math.min(G.res[res].max, G.res[res].v + qty); }
  delete p.buildStartedAt; delete p.buildEndsAt; delete p.buildCost;
  p.state = 'resource'; p.building = null; p.n = 'Gisement détecté'; p.sub = 'Construire un bâtiment ou re-miner.'; p.lvl = null; p.prod = null;
  toast('Chantier annulé — ressources rendues');
  renderPlanetMap();
  if (typeof renderInfoCard === 'function') renderInfoCard(idx);
  if (typeof saveGame === 'function') saveGame();
}

// Rattrapage complet : au démarrage, au retour au premier plan, à la restauration bfcache.
function catchUpOffline(opts) {
  opts = opts || {};
  const before = {};
  for (const [k, r] of Object.entries(G.res || {})) before[k] = r.v;
  const creditsBefore = G.credits || 0;
  const fuelBefore = G.fuel || 0;

  const out = simulateTo(Date.now());

  // Timers déjà basés sur des dates absolues : forcer la résolution immédiate
  if (typeof tickProbes === 'function') tickProbes();
  if (typeof tickTankerMissions === 'function') tickTankerMissions();
  if (typeof tickGarrisonAttrition === 'function') tickGarrisonAttrition();
  if (_missionTimerInterval && typeof tickMissionTimers === 'function') tickMissionTimers();

  if (out.dtMs >= OFFLINE_RECAP_MIN_MS) {
    const gains = [];
    for (const [k, r] of Object.entries(G.res || {})) {
      const d = r.v - (before[k] || 0);
      if (d >= 1) gains.push({ k, d, full: r.v >= r.max });
    }
    const dc = (G.credits || 0) - creditsBefore;
    const df = (G.fuel || 0) - fuelBefore;
    if (gains.length || dc >= 1 || df >= 1 || out.units || out.upgrades || (out.builds && out.builds.length)) {
      const show = () => showOfflineRecap(out, gains, dc, df);
      if (opts.boot) setTimeout(show, 1400); else show();
    }
    if (typeof saveGame === 'function') saveGame();
  }
  return out;
}

function _fmtAway(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return mm ? `${h} h ${String(mm).padStart(2, '0')}` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} j ${hh} h` : `${d} j`;
}
function _sbProjParcels() { return (G.planet && G.planet.parcels) || []; }
function sbNextProject() {
  try {
    if (!G || !G.planet || !G.res) return null;
    if (window.SBTuto && SBTuto.active()) return null;
    const a = (window.SBAntenna && SBAntenna.data) ? SBAntenna.data() : G.antenna;
    if (!a || !a.built || a.building) return null;          // l'objectif antenne a son propre bandeau
    const ps = _sbProjParcels();
    const has = k => ps.some(q => q && q.building === k && (q.state === 'built' || q.state === 'building'));
    let pick = null;
    for (const k of SB_PROJ_BUILD) if (BUILDINGS[k] && !has(k)) { pick = { kind: 'build', key: k, name: BUILDINGS[k].name, cost: BUILDINGS[k].cost }; break; }
    if (!pick) {
      const busy = typeof QUEUES !== 'undefined' && QUEUES.capital && QUEUES.capital.upgrade;
      for (const k of SB_PROJ_UP) {
        const i = ps.findIndex(q => q && q.building === k && q.state === 'built' && (q.lvl || 1) < 2 && !q.damaged);
        const t = i >= 0 && BUILDING_TIERS[k] && BUILDING_TIERS[k][2];
        if (t && !busy) { pick = { kind: 'up', key: k, idx: i, name: (t.name || BUILDINGS[k].name), cost: t.cost || {} }; break; }
      }
    }
    if (!pick) return null;
    pick.id = pick.kind + ':' + pick.key;
    const miss = {}; let eta = 0;
    for (const [r, q] of Object.entries(pick.cost || {})) {
      const have = (G.res[r] && G.res[r].v) || 0;
      if (have < q) {
        miss[r] = Math.ceil(q - have);
        const rate = (G.res[r] && G.res[r].rate) || 0;
        eta = Math.max(eta, rate > 0 ? (q - have) / rate * 3600000 : Infinity);
      }
    }
    pick.miss = miss; pick.ready = !Object.keys(miss).length; pick.eta = eta;
    if (pick.kind === 'build') {
      pick.slot = ps.findIndex(q => q && q.state === 'resource' && !q.building);
      if (pick.slot < 0) pick.rocky = ps.findIndex(q => q && q.state === 'rocky');
    }
    return pick;
  } catch (e) { console.warn('[projet]', e); return null; }
}
function _sbProjLabel(k) { return (typeof tileInfo === 'function' && tileInfo(k) && tileInfo(k).label) || k; }
function sbProjectLine(pr) {
  if (pr.ready) {
    if (pr.kind === 'build' && pr.slot < 0) return 'Tout est prêt : il te faut un gisement libre pour la bâtir';
    return pr.kind === 'up' ? 'Tout est prêt : lance l\'amélioration' : 'Tout est prêt : lance le chantier';
  }
  const m = Object.entries(pr.miss).map(([k, n]) => `<b>${fmt(n)}</b> ${_sbProjLabel(k).toLowerCase()}`).join(' · ');
  const eta = isFinite(pr.eta) && pr.eta > 0 ? ` · ~${_fmtAway(pr.eta)} de production` : '';
  return `Il manque ${m}${eta}`;
}
function sbProjectGo(pr) {
  pr = pr || sbNextProject(); if (!pr) return;
  const ps = _sbProjParcels();
  let i = -1, sheet = false;
  if (pr.ready) {
    if (pr.kind === 'up') i = pr.idx;
    else if (pr.slot >= 0) { i = pr.slot; sheet = true; }
    else i = pr.rocky;
  } else {
    // il manque des ressources : exploiter la mine (inépuisable), sinon un gisement
    i = ps.findIndex(q => q && q.building === 'mine' && q.state === 'built');
    if (i < 0) i = ps.findIndex(q => q && q.state === 'resource');
    if (i < 0) i = ps.findIndex(q => q && q.state === 'rocky');
  }
  if (typeof goto === 'function') goto('planet');
  if (i < 0) return;
  let moved = false;
  try { if (window.Planet3D && Planet3D.ready) { Planet3D.focus(i); moved = true; } } catch (e) {}
  setTimeout(() => {
    if (sheet && typeof openBuildingSheet === 'function') openBuildingSheet(pr.key, i);
    else if (typeof onHexClick === 'function') onHexClick(i);
  }, moved ? 950 : 0);
}
// balayer pour fermer (bandeau du projet, récapitulatif d'absence)
function sbSwipeAway(el, onGone, onTap) {
  let x0 = null, y0 = 0, dx = 0, moved = false;
  const down = (x, y) => { x0 = x; y0 = y; dx = 0; moved = false; el.style.transition = 'none'; };
  const move = (x, y, ev) => {
    if (x0 == null) return;
    dx = x - x0; const dy = y - y0;
    if (!moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (!moved && Math.abs(dy) > Math.abs(dx)) {   // glissé vertical vers le haut : ferme aussi
      if (dy < -30) { x0 = null; gone(0, -1); }
      return;
    }
    moved = true; if (ev && ev.cancelable) ev.preventDefault();
    el.style.transform = el.dataset.base.replace('X', dx + 'px'); el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 220));
  };
  const up = () => {
    if (x0 == null) return; x0 = null;
    el.style.transition = 'transform .22s ease, opacity .22s ease';
    if (moved && Math.abs(dx) > 70) gone(dx > 0 ? 1 : -1, 0);
    else { el.style.transform = el.dataset.base.replace('X', '0px'); el.style.opacity = ''; if (!moved && onTap) onTap(); }
  };
  const gone = (sx, sy) => {
    el.style.transition = 'transform .22s ease, opacity .22s ease';
    el.style.transform = el.dataset.base.replace('X', (sx * 120) + 'vw') + (sy ? ' translateY(-80px)' : '');
    el.style.opacity = '0'; el._gone = true;
    setTimeout(() => onGone && onGone(), 230);
  };
  el.addEventListener('touchstart', e => { const t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
  el.addEventListener('touchmove', e => { const t = e.touches[0]; move(t.clientX, t.clientY, e); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); up(); });
  el.addEventListener('mousedown', e => { down(e.clientX, e.clientY); const mm = ev => move(ev.clientX, ev.clientY, ev), mu = () => { removeEventListener('mousemove', mm); removeEventListener('mouseup', mu); up(); }; addEventListener('mousemove', mm); addEventListener('mouseup', mu); });
}
function _sbProjHidden() { try { return localStorage.getItem(SB_PROJ_KEY) || ''; } catch (e) { return ''; } }
function sbProjectRender() {
  const scr = document.getElementById('scr-planet');
  const onPlanet = scr && !scr.classList.contains('hidden');
  const pr = onPlanet && !window.__sbCinema ? sbNextProject() : null;
  let el = document.getElementById('sb-proj');
  const blocked = document.querySelector('#sb-coach[style*="block"], .p3d-goal, #sb-sheet, #sb-away, #scr-m3:not(.hidden)');
  if (!pr || blocked || _sbProjHidden() === pr.id) { if (el && !el._gone) el.remove(); return; }
  if (!el || el._gone) {
    if (el) el.remove();
    el = document.createElement('div'); el.id = 'sb-proj';
    el.dataset.base = 'translateX(X)';
    document.body.appendChild(el);
    sbSwipeAway(el, () => { try { localStorage.setItem(SB_PROJ_KEY, el.dataset.pid || ''); } catch (e) {} el.remove(); toast('Projet masqué · il reviendra au suivant'); }, () => sbProjectGo());
  }
  const top = document.querySelector('#scr-planet .w-top');
  const t = (top ? top.getBoundingClientRect().bottom : 46) + 6;
  if (el.style.top !== t + 'px') el.style.top = t + 'px';
  el.dataset.pid = pr.id;
  const html = `<div class="k">Projet suggéré<span>balaye pour masquer</span></div>
    <div class="n">${pr.kind === 'up' ? 'Améliorer · ' : ''}${pr.name}</div>
    <div class="m">${sbProjectLine(pr)}</div>
    <div class="g">${pr.ready ? (pr.kind === 'build' && pr.slot < 0 ? 'Conquérir un gisement →' : 'Y aller →') : 'Exploiter ta mine →'}</div>`;
  if (el._html !== html) { el._html = html; el.innerHTML = html; el.classList.toggle('ready', !!pr.ready); }
}

function showOfflineRecap(out, gains, dc, df) {
  if (!document.getElementById('sb-away-style')) {
    const st = document.createElement('style');
    st.id = 'sb-away-style';
    st.textContent = `
      #sb-away{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 56px);transform:translate(-50%,-12px);
        width:min(340px,calc(100vw - 32px));z-index:9500;padding:14px 16px 12px;border-radius:14px;
        background:rgba(10,14,16,.94);border:1px solid var(--line);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
        color:var(--txt);font-family:'Space Grotesk',system-ui,sans-serif;opacity:0;transition:opacity .25s,transform .25s;cursor:pointer}
      #sb-away.on{opacity:1;transform:translate(-50%,0)}
      #sb-away .t{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
      #sb-away .t b{color:var(--amber);font-weight:600}
      #sb-away .r{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
      #sb-away .r span:last-child{font-family:var(--font-mono);color:var(--amber)}
      #sb-away .r em{font-style:normal;font-size:10px;color:var(--mut);margin-left:6px;letter-spacing:.08em}
      #sb-away .x{margin-top:8px;font-size:12px;color:var(--mut)}`;
    document.head.appendChild(st);
  }
  document.getElementById('sb-away')?.remove();
  const label = (k) => (typeof tileInfo === 'function' && tileInfo(k)?.label) || k;
  let rows = gains.map(g => `<div class="r"><span>${label(g.k)}${g.full ? '<em>SILO PLEIN</em>' : ''}</span><span>+${fmt(g.d)}</span></div>`).join('');
  if (dc >= 1) rows += `<div class="r"><span>Crédits</span><span>+${fmt(dc)}</span></div>`;
  if (df >= 1) rows += `<div class="r"><span>Carburant</span><span>+${fmt(df)}</span></div>`;
  const extra = [];
  if (out.units) extra.push(`${out.units} unité${out.units > 1 ? 's' : ''} produite${out.units > 1 ? 's' : ''}`);
  if (out.upgrades) extra.push('amélioration terminée');
  if (out.builds && out.builds.length) extra.push(`terminé : ${out.builds.join(', ')}`);
  const el = document.createElement('div');
  el.id = 'sb-away';
  // PATCH_2110_PROJET : le prochain projet dans le récapitulatif, et on le ferme en balayant
  const _pr = (typeof sbNextProject === 'function') ? sbNextProject() : null;
  const _pj = _pr ? `<div class="pj"><div class="k">Prochain projet</div><div class="n">${_pr.kind === 'up' ? 'Améliorer · ' : ''}${_pr.name}</div><div class="m">${sbProjectLine(_pr)}</div><button>${_pr.ready ? 'Y aller' : 'Exploiter ta mine'}</button></div>` : '';
  el.innerHTML = `<div class="t">Pendant ton absence · <b>${_fmtAway(out.dtMs)}</b></div>${rows}${extra.length ? `<div class="x">${extra.join(' · ')}</div>` : ''}${_pj}<div class="sw">Balaye pour fermer</div>`;
  let _closed = false;
  const close = () => { if (_closed) return; _closed = true; el.classList.remove('on'); setTimeout(() => el.remove(), 260); };
  el.dataset.base = 'translate(-50%,0) translateX(X)';
  document.body.appendChild(el);
  const _btn = el.querySelector('.pj button');
  if (_btn) { _btn.addEventListener('click', ev => { ev.stopPropagation(); close(); sbProjectGo(_pr); }); _btn.addEventListener('touchend', ev => { ev.stopPropagation(); close(); sbProjectGo(_pr); }); }
  sbSwipeAway(el, () => { _closed = true; el.remove(); }, close);
  requestAnimationFrame(() => el.classList.add('on'));
  let _t = setTimeout(close, _pr ? 12000 : 6500);
  el.addEventListener('touchstart', () => { clearTimeout(_t); _t = setTimeout(close, 12000); }, { passive: true });
}

// Antenne : si la page a été fermée pendant le rituel de construction (~4 s),
// la sauvegarde contient building:true et l'antenne resterait bloquée. On termine la construction.
function repairInterruptedAntenna() {
  const a = G.antenna;
  if (!a || !a.built || !a.building) return;
  a.building = false;
  a.stage = 3;
  if (!a.signal) {
    a.signal = { name: 'SIGNATURE 01', origin: 'inconnue', dist: '0.7 UA', intensity: 'faible', cls: 'impossible', at: Date.now() };
    if (a.parcel != null && window.SBAntenna && typeof window.SBAntenna._revealNearby === 'function') {
      try { window.SBAntenna._revealNearby(a.parcel, 2); } catch (e) { console.warn('[antenna] reveal', e); }
    }
  }
  if (typeof saveGame === 'function') saveGame();
  if (window.Planet3D && window.Planet3D.ready && typeof window.Planet3D.sync === 'function') window.Planet3D.sync();
}

function completeUnitProduction(type, cmd) {
  if (type === 'barracks') {
    const unitKey = cmd.unitKey;
    ensureDefenseUnits();
    if (G.defense.units[unitKey]) {
      G.defense.units[unitKey].qty++;
    }
    if (cmd.totalQty === 1) {
      const unit = DEFENSE_UNITS[unitKey];
      toast(`${unit.name} prêt`);
    }
  } else if (type === 'shipyard') {
    if (cmd.unitKey === 'probe') {
      G.probe.exists = true;
      G.probe.state = 'ready';
      renderShipyard();
      toast('Sonde Auris-1 prête. Centre de prospection accessible.');
    } else if (cmd.unitKey === 'colonial') {   // PATCH_2010_COLONIE
      G.fleet.colonial = (G.fleet.colonial || 0) + 1;
      toast('◈ Arche coloniale prête : choisis une planète habitable libre à coloniser');
      if (!document.getElementById('scr-shipyard').classList.contains('hidden')) renderShipyard();
    } else if (G.fleet.stationed[cmd.unitKey]) {
      // Vaisseau militaire (tanker / fregate / cuirasse) — passe 3.1
      const shipKey = cmd.unitKey;
      const tier = cmd.shipTier || 1;
      const tierKey = 't' + tier;
      G.fleet.stationed[shipKey][tierKey] = (G.fleet.stationed[shipKey][tierKey] || 0) + 1;
      if (cmd.totalQty === 1) {
        const meta = SHIP_UNITS[shipKey];
        const tierData = SHIP_TIERS[shipKey]?.[tier];
        toast(`${tierData?.name || meta.name} prêt`);
      }
      // Mettre à jour les écrans concernés
      if (!document.getElementById('scr-shipyard').classList.contains('hidden')) {
        renderShipyard();
      }
      if (!document.getElementById('scr-fleet')?.classList.contains('hidden')) {
        renderFleetScreen();
      }
    }
  } else if (type === 'prospect') {
    // Sonde construite — matérialiser dans le pool
    const probeTier = cmd.probeTier;
    const cfg = PROBE_TIER_CONFIG[probeTier];
    if (!Array.isArray(G.probesPool)) G.probesPool = [];
    G.probesPool.push({
      id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      tier: probeTier,
      state: 'ready',
      builtAt: Date.now(),
    });
    if (cfg) {
      toast(`${cfg.label} prête`);
    }
    // Re-render écrans concernés
    if (!document.getElementById('scr-prospect')?.classList.contains('hidden')) {
      if (typeof renderProspectScreen === 'function') renderProspectScreen();
    }
    if (!document.getElementById('scr-probe-detail')?.classList.contains('hidden')) {
      if (typeof renderProbeDetailScreen === 'function') renderProbeDetailScreen();
    }
  }
}

function formatTime(sec) {
  if (sec < 0) sec = 0;
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${mm.toString().padStart(2, '0')}`;
}

/* ═══════════ PROSPECTION (sonde unique + univers) ═══════════ */

function setProbeMode(mode) {
  G.probeMode = mode;
  document.querySelectorAll('#mode-toggle button').forEach((b, i) => {
    const isActive = (i === 0 && mode === 'manual') || (i === 1 && mode === 'blind');
    b.classList.toggle('active', isActive);
  });
  document.getElementById('probe-mode-manual').style.display = mode === 'manual' ? 'block' : 'none';
  document.getElementById('probe-mode-blind').style.display = mode === 'blind' ? 'block' : 'none';
  if (mode === 'manual') onAddressChange();
  else updateDispatchBtn(true);
}

function renderProspectScreen() {
  // ─── PASSE 4-sondes-v1.1-d : refonte complète ───
  // Header méta
  const meta = document.getElementById('prospect-meta');
  if (meta) meta.textContent = 'Hub d\'exploration';

  // Bannière illustration (style identique aux écrans Caserne / Chantier)
  const bannerIcon = document.getElementById('prospect-banner-icon');
  if (bannerIcon) {
    bannerIcon.innerHTML = getIllustration('prospect');
  }
  // Sub dynamique : état actuel (sondes prêtes, missions, adresse)
  const sub = document.getElementById('prospect-banner-sub');
  if (sub) {
    const probesReady = (G.probesPool || []).filter(p => p.state === 'ready').length;
    const probesMission = (G.probeMissions || []).filter(m => m.status === 'in_transit').length;
    const parts = [];
    if (probesReady > 0) parts.push(`${probesReady} sonde${probesReady > 1 ? 's' : ''} prête${probesReady > 1 ? 's' : ''}`);
    if (probesMission > 0) parts.push(`<span style="color:var(--amber)">${probesMission} en mission</span>`);
    if (parts.length === 0) parts.push('Aucune sonde');
    parts.push(`<span style="font-family:'SF Mono',monospace;color:var(--cyan);margin-left:6px">${G.planet?.coordString || '—'}</span>`);

    // PASSE 5.6 — Feu de borne (météo cosmique locale)
    // On affiche la météo du système d'origine (toujours claire — donc 🟢)
    // Le feu de borne devient utile dès qu'on cible un autre système (futur)
    // mais on le pose dès maintenant pour l'identité visuelle "centre de contrôle"
    if (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS && typeof getSystemWeather === 'function') {
      const mySys = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
      const noise = getSystemWeather(mySys);
      const cat = getWeatherCategory(noise);
      parts.push(`<span title="${cat.label} (${noise}%)" style="margin-left:4px;color:${cat.color};font-size:11px;cursor:help;display:inline-flex;align-items:center;vertical-align:middle">${renderIcon(cat.icon, {size:11, color:cat.color})}</span>`);
    }

    sub.innerHTML = parts.join(' <span class="dot"></span> ');
  }

  // S'assurer qu'on est sur un onglet valide
  const validTabs = ['sondes', 'univers', 'rapports', 'archives'];
  if (!validTabs.includes(G.prospectTab)) G.prospectTab = 'univers';

  // PASSE 6 — Afficher/cacher l'onglet Archives selon contenu
  if (typeof updateLegendTabVisibility === 'function') updateLegendTabVisibility();
  if (typeof updateLegendBadge === 'function') updateLegendBadge();

  // Activer l'onglet (qui rendra son contenu)
  setProspectTab(G.prospectTab);

  // Badge "non lus" sur l'onglet Rapports
  updateProspectRapportsBadge();
}
