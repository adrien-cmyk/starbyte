/* Starbyte — f09_triche_empire_accueil.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';

// Retire une colonie de test, sur le serveur PUIS dans la partie. Une erreur serveur ne touche à rien.
// Une colonie TAXI rend aussi le TAXI (nouveau largage possible). Jamais la planète affichée : changer de planète peut recharger le jeu.
function cheatRemoveColony() {
  if (typeof _sbDevAllowed === 'function' && !_sbDevAllowed()) return;
  const cols = (G.worlds || []).filter(w => w && w.kind === 'colony');
  if (!cols.length) { toast('Aucune colonie à retirer'); return; }
  const old = document.getElementById('cheat-colony-pick'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'cheat-colony-pick';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px';
  const rows = cols.map(w => {
    const here = w.id === G.activeWorld, away = ((G.fleet && G.fleet.prepared) || []).some(f => f && f.world === 'transit:' + w.id);
    const why = here ? 'Repasse d\'abord sur une autre planète' : away ? 'Une flotte est en route vers elle' : (w.taxi ? 'Colonie TAXI : le TAXI sera rendu' : (w.coord || ''));
    return `<button data-col="${_esc(w.id)}" ${here || away ? 'disabled' : ''} style="display:block;width:100%;min-height:52px;margin-bottom:8px;padding:8px 12px;text-align:left;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(255,255,255,.04);color:${here || away ? 'var(--mut)' : '#e6f0ff'};font:inherit"><b>${_esc(w.name || 'Colonie')}</b><span style="display:block;font-size:11px;color:var(--mut)">${_esc(why)}</span></button>`;
  }).join('');
  ov.innerHTML = `<div style="background:var(--bg-1,#10151a);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:16px;width:100%;max-width:380px;max-height:80vh;overflow:auto"><div style="font-size:14px;font-weight:600;margin-bottom:10px;color:#e6f0ff">Retirer une colonie (test)</div>${rows}<button data-col-x style="width:100%;min-height:44px;border:0;background:none;color:var(--mut);font:inherit">Annuler</button></div>`;
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-col-x]')) { ov.remove(); return; }
    const b = e.target.closest('[data-col]'); if (b && !b.disabled) { ov.remove(); cheatRemoveColonyGo(b.dataset.col); }
  });
  document.body.appendChild(ov);
}
async function cheatRemoveColonyGo(id) {
  const w = (G.worlds || []).find(x => x && x.id === id); if (!w || id === G.activeWorld) return;
  const ok = await sbConfirmDanger('Retirer ' + _esc(w.name || 'cette colonie'), 'Elle disparaît de ta partie et du registre.' + (w.taxi ? '<br><br>Ton TAXI redevient prêt à larguer.' : '') + '<br><br>Ta capitale et tes autres colonies ne bougent pas.', 'Retirer');
  if (!ok) return;
  if (!window._sbRpc) { toast('Connexion au registre indisponible : rien n\'a été retiré'); return; }
  let res; try { res = await window._sbRpc('dev_colony_remove', { p_address: w.coord || '', p_taxi: !!w.taxi }); } catch (e) { res = { error: e }; }
  if (res && res.error) { toast('Refusé par le serveur, rien n\'a été retiré : ' + (res.error.message || res.error)); return; }
  const fallback = 'home';
  for (const list of [G.fleet && G.fleet.prepared, G.tankerMissions, G.probeMissions, G.garrisons]) for (const x of (list || [])) if (x && x.world === id) x.world = fallback;
  const loc = G.fleet && G.fleet.bmLoc; if (loc) for (const k of Object.keys(loc)) if (loc[k] === id) delete loc[k];
  G.worlds = G.worlds.filter(x => x && x.id !== id);
  if (w.taxi && G.fleet) delete G.fleet.bmTaxi;
  try { saveGame(); } catch (e) {}
  try { if (window.SBBlackmarket) SBBlackmarket.reload(); } catch (e) {}
  try { if (typeof renderPlanetMap === 'function') renderPlanetMap(); } catch (e) {}
  try { refreshCurrentScreen(); } catch (e) {}
  toast('◈ ' + (w.name || 'Colonie') + ' retirée');
}
function cheatArcheArrive() {
  const ms = G.colonyMissions || [];
  if (!ms.length) { toast('Aucune Arche en route'); return; }
  ms.forEach(m => { m.arriveAt = Date.now() - 1000; });
  try { sbColonyTick(); } catch (e) {}
  toast('◈ Arche arrivée');
  try { saveGame(); } catch (e) {}
}

// Cheat passe 3.2 : crée une flotte préparée "Punisher 1" pré-composée
function cheatPunisher() {
  // Garantir qu'il y a des vaisseaux à mettre dedans
  if (G.fleet.stationed.fregate.t1 < 5) G.fleet.stationed.fregate.t1 = 5;
  if (G.fleet.stationed.tanker.t1 < 2)  G.fleet.stationed.tanker.t1 = 2;
  // Créer la flotte
  const fleet = {
    id: 'fleet_punisher_' + Date.now(),
    name: 'Punisher 1',
    composition: {
      tanker:   { t1: 2, t2: 0, t3: 0 },
      fregate:  { t1: 5, t2: 0, t3: 0 },
      cuirasse: { t1: 0, t2: 0, t3: 0 },
    },
    soldiers: { garde: 0, lourd: 0 },
    status: 'prepared',
    heroes: { tanker: null, fregate: null, cuirasse: null },
    createdAt: Date.now(),
  };
  ensureFleetHeroes(fleet); // passe 3.4 — génère les héros selon la composition
  G.fleet.prepared.push(sbTagWorld(fleet));
  toast('Punisher 1 préparée');
  refreshCurrentScreen();
}

/* PATCH_2010_CHEAT_T3 : chaque bâtiment construit de la planète active passe au tier 3
   (en rejouant les paliers d'amélioration : prod, capacité des silos, noms), Centre compris */
function cheatAllTier3() {
  const saved = QUEUES.capital.upgrade, _toast = window.toast;
  let n = 0;
  window.toast = () => {};
  try {
    G.planet.parcels.forEach((p, i) => {
      if (!p) return;
      const isCap = p.state === 'capital' || p.building === 'capital';
      if (!isCap && (p.state !== 'built' || !p.building)) return;
      const key = isCap ? 'capital' : p.building;
      let lv = isCap ? (G.skills.capitalLevel || 1) : (p.lvl || 1);
      while (lv < TIER_MAX && BUILDING_TIERS[key] && BUILDING_TIERS[key][lv + 1]) {
        QUEUES.capital.upgrade = { parcelIdx: i, buildingKey: key, fromTier: lv, toTier: lv + 1, totalDur: 1, elapsed: 1 };
        completeBuildingUpgrade();
        lv++; n++;
      }
    });
  } finally {
    window.toast = _toast;
    QUEUES.capital.upgrade = saved;
  }
  try { saveGame(); } catch (e) {}
  try { window.Planet3D && Planet3D._needAll && Planet3D._needAll(); window.Planet3D && Planet3D.sync && Planet3D.sync(true); } catch (e) {}
  refreshCurrentScreen();
  toast(n ? `🏗 ${n} amélioration${n > 1 ? 's' : ''} : tout est au tier 3` : 'Tout est déjà au tier 3');
}

function cheatCapital() {
  G.skills.capitalLevel = 3;
  G.defense.capitalBase = 600;
  G.skills.barracksSlots = 3;
  G.skills.productionSpeed = 1.43;
  G.skills.colonialShipUnlocked = true;
  toast('Capital Tier 3 + tous skills débloqués');
  refreshCurrentScreen();
}

function cheatBuildBasic() {
  // Construit Mine, Centrale, Labo, Caserne, Chantier sur les premières parcelles dispo
  const targets = ['mine', 'centrale', 'labo', 'caserne', 'shipyard'];
  let built = 0;
  for (const buildingKey of targets) {
    const idx = G.planet.parcels.findIndex(p =>
      (p.state === 'rocky' || p.state === 'resource') && p.idx !== 12
    );
    if (idx < 0) break;
    const parcel = G.planet.parcels[idx];
    const b = BUILDINGS[buildingKey];
    if (!b) continue;
    parcel.state = 'built';
    parcel.building = buildingKey;
    parcel.n = customBuildingName(buildingKey);
    parcel.sub = b.desc;
    parcel.lvl = 1;
    parcel.max = 3;
    parcel.prod = Object.entries(b.prod).map(([res, rate]) => [prodInfo(res).label.toLowerCase(), rateLbl(res, rate)]);
    for (const [res, rate] of Object.entries(b.prod)) {
      if (G.res[res] !== undefined) G.res[res].rate += rate;
    }
    if (!G.planet.families.has(b.family)) {
      G.planet.families.add(b.family);
      G.planet.level++;
    }
    built++;
  }
  toast(`${built} bâtiments de base construits`);
  refreshCurrentScreen();
}

// 22/10 — diagnostic de la carte du Centre de prospection : à copier et envoyer (routes, lignes, missions, cases figées)
async function sbMapDiag() {
  const C = (G.mapCells && G.mapCells.cells) || {};
  const at = k => (C[k] === undefined ? '?' : C[k]);
  const d = { v: 1, at: new Date().toISOString(), home: (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) ? MY_ADDRESS.cluster + '-' + MY_ADDRESS.sector + '-' + MY_ADDRESS.system : null,
    mapCells: G.mapCells ? { v: G.mapCells.v, home: G.mapCells.home, n: Object.keys(C).length } : null, err: window._smRouteErr || null,
    chains: (window._smChains || []).map(ch => ch.map(k => k + '@' + at(k))),
    routes: (G.routes || []).map(r => ({ id: r.id, name: r.name, portSys: r.portSys || null, chain: (window.SBLines && r.portSys) ? (() => { try { return SBLines.knownChain(r.portSys).map(k => k + '@' + at(k)); } catch (e) { return 'ERR ' + e.message; } })() : null })),
    opened: (window.SBLines ? SBLines.openedRoutes() : []).map(o => ({ id: o.id, name: o.name, chain: (o.chain || []).map(k => k + '@' + at(k)) })),
    tankers: (G.tankerMissions || []).filter(m => m.status !== 'returned').map(m => ({ id: m.id, kind: m.kind, status: m.status, portSys: m.portSys || null, target: m.targetCoords || null, dock: m.dock && m.dock.name || null })) };
  const txt = JSON.stringify(d);
  try { await navigator.clipboard.writeText(txt); toast('Diagnostic copié : colle-le à Claude'); }
  catch (e) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.8);display:flex;flex-direction:column;padding:40px 16px;gap:10px';
    ov.innerHTML = '<div style="color:#e6f0ff;font-size:13px">Diagnostic : sélectionne tout, copie, et envoie-le à Claude.</div><textarea style="flex:1;font-size:11px;font-family:monospace;background:#0b1016;color:#cfe;border:1px solid #345;border-radius:8px;padding:8px"></textarea><button style="padding:12px;border-radius:8px;border:1px solid #5fffe8;background:none;color:#5fffe8">Fermer</button>';
    ov.querySelector('textarea').value = txt; ov.querySelector('button').onclick = () => ov.remove();
    document.body.appendChild(ov); ov.querySelector('textarea').select();
  }
  return txt;
}
function sbEmpire() {
  if (!G.imperialRep || typeof G.imperialRep !== 'object') G.imperialRep = { rep: 0, at: Date.now(), tier: 0, pub: -1, pubAt: 0, exp: null };
  return G.imperialRep;
}
function sbEmpRep() {
  const e = sbEmpire(), now = Date.now();
  const h = (now - (e.at || now)) / 3600e3;
  if (h > 0) { e.rep = Math.max(0, (e.rep || 0) - h * SB_EMP.DECAY_PER_H); e.at = now; }
  return e.rep;
}
function sbEmpTierOf(rep) { return rep >= SB_EMP.ENEMY ? 3 : rep >= SB_EMP.WANTED ? 2 : rep >= SB_EMP.SURV ? 1 : 0; }
function sbEmpTier() { return sbEmpTierOf(sbEmpRep()); }
function sbEmpEscort() { try { return SB_EMP_TIERS[sbEmpTier()].escort; } catch (e) { return 1; } }
function sbEmpBounty(rep) { return Math.min(9000, 1000 + 20 * Math.round(rep || 0)); }
// un abordage de convoi PNJ vient d'avoir lieu
function sbEmpireOffense(kindKey, imperialStation, win, sys, portName) {
  let pts = 0;
  if (kindKey === 'imperial') pts = win ? 12 : 6;
  else if (kindKey === 'pelerins' && imperialStation) pts = win ? 2 : 1;
  if (!pts) return;
  const e = sbEmpire();
  sbEmpRep();
  e.rep += pts;
  if (portName) e.lastPort = portName;
  sbEmpCheck();
}
// changement de palier : annonce, publication au registre, expédition punitive
function sbEmpCheck(silent) {
  const e = sbEmpire(), t = sbEmpTierOf(sbEmpRep());
  const was = e.tier || 0;
  if (t !== was) {
    e.tier = t;
    if (!silent && t > was) {
      const msg = t === 1 ? '👁 L\'Empire t\'a remarqué : tu es Surveillé. Ses escortes se renforcent contre toi.'
        : t === 2 ? `📜 Avis de recherche impérial : ta tête est mise à prix (${fmt(sbEmpBounty(e.rep))} CG). Les autres commandants le savent.`
        : '⚔ Tu es Ennemi de l\'Empire.';
      try { toast(msg, () => { try { goto('prospect'); setProspectTab('univers'); setUniverseTab('players'); } catch (x) {} }); } catch (err) {}
    } else if (!silent && t < was) {
      try { toast(t === 0 ? 'L\'Empire t\'a oublié.' : `Réputation impériale : ${SB_EMP_TIERS[t].label}`); } catch (err) {}
    }
  }
  if (t >= 3 && !e.exp && !(e.expCooldown && Date.now() < e.expCooldown)) sbEmpLaunchExpedition();
  sbEmpPublish();
}
async function sbEmpPublish(force) {
  const e = sbEmpire(), t = sbEmpTierOf(sbEmpRep());
  if (!force && e.pub === t && (t < 2 || Date.now() - (e.pubAt || 0) < 6 * 3600e3)) return;
  if (!window.SBMP || !SBMP.ready || !SBMP.ready()) return;
  try { await _mpRpc('mp_set_wanted', { p_level: t, p_rep: Math.round(e.rep) }); e.pub = t; e.pubAt = Date.now(); }
  catch (err) { if (!/PGRST202|Could not find the function/.test(String(err && err.message || err))) console.warn('[empire] publication :', err); }
}

// ── l'expédition punitive ──
function _sbEmpOrigin() {
  const imp = Object.entries(G.hiddenPorts || {}).filter(([, p]) => p && window.SBLines && SBLines.isImperialDock && SBLines.isImperialDock(p.dockId));
  if (imp.length) return { sys: imp[0][0], name: imp[0][1].name };
  return { sys: null, name: 'les marges de l\'Empire' };
}
function sbEmpLaunchExpedition() {
  const e = sbEmpire();
  let def = 0;
  try { def = (typeof sbWithWorld === 'function') ? sbWithWorld('home', () => totalDefense()) : totalDefense(); } catch (err) { def = 0; }
  const o = _sbEmpOrigin(), now = Date.now();
  e.exp = { id: 'imp-' + now.toString(36), startedAt: now, arrivesAt: now + SB_EMP.EXP_MS, power: Math.round(Math.max(40000, def * 2.5)), defAtLaunch: Math.round(def), fromSys: o.sys, fromName: o.name };
  if (typeof saveGame === 'function') saveGame();
  try {
    sbConfirm({ title: 'EXPÉDITION PUNITIVE', variant: 'danger', confirmLabel: 'Voir la carte', cancelLabel: 'Fermer',
      body: `L'Empire a assez compté tes pillages. Une flotte immense quitte ${_esc(o.name)} vers ta capitale.<br><br><b>Impact dans 12 h</b> · force estimée <b>${fmt(e.exp.power)}</b> (ta défense : ${fmt(e.exp.defAtLaunch)}).<br><br>Renforce ta défense, déploie tes flottes en orbite… ou paie l'amende dans une station impériale pour qu'elle fasse demi-tour.` })
      .then(ok => { if (ok) { try { goto('prospect'); } catch (err) {} } });
  } catch (err) {}
  sbEmpBanner();
}
function sbEmpRecallCost() { return Math.round(sbEmpRep() * (sbEmpire().exp ? SB_EMP.RECALL : SB_EMP.FINE)); }
async function sbEmpPayFine() {
  const e = sbEmpire(), cost = sbEmpRecallCost();
  if (cost <= 0) return;
  if ((G.credits || 0) < cost) { toast(`L'Empire réclame ${fmt(cost)} CG`); return; }
  const ok = await sbConfirm({ title: e.exp ? 'RAPPELER L\'EXPÉDITION' : 'PAYER L\'AMENDE', confirmLabel: `Payer ${fmt(cost)} CG`,
    body: e.exp ? `L'expédition punitive fait demi-tour et ta réputation est effacée.` : `Ta réputation impériale est effacée : l'Empire passe l'éponge.` });
  if (!ok || (G.credits || 0) < cost) return;
  G.credits -= cost;
  e.rep = 0; e.at = Date.now();
  if (e.exp) { e.exp = null; e.expCooldown = Date.now() + 24 * 3600e3; }
  sbEmpCheck(true);
  toast('L\'Empire encaisse. Tu repars blanc comme neige.');
  if (typeof saveGame === 'function') saveGame();
  sbEmpBanner();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
function sbEmpBanner() {
  const e = sbEmpire(), x = e.exp;
  let el = document.getElementById('sb-emp-incoming');
  if (!x) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-emp-incoming';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top, 0px) + 44px);z-index:9000;max-width:92vw;padding:8px 14px;border-radius:20px;background:rgba(70,6,6,.92);border:1px solid rgba(255,58,42,.75);color:#ffd6cf;font-size:12px;box-shadow:0 0 22px rgba(255,40,20,.45);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    el.onclick = () => { try { goto('prospect'); } catch (err) {} };
    document.body.appendChild(el);
  }
  const ms = Math.max(0, x.arrivesAt - Date.now()), h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60000);
  el.innerHTML = `⚔ Expédition punitive impériale · force <strong>${fmt(x.power)}</strong> · impact dans ${h ? h + ' h ' : ''}${m} min`;
}
function sbEmpTick() {
  if (typeof G === 'undefined' || !G || !G.imperialRep) return;
  const e = sbEmpire();
  if (e.exp && Date.now() >= e.exp.arrivesAt) { try { sbEmpResolveExpedition(); } catch (err) { console.warn('[empire] expédition', err); } }
  sbEmpBanner();
  sbEmpCheck();
}
function sbEmpResolveExpedition() {
  const e = sbEmpire(), x = e.exp;
  if (!x) return;
  if (window._sbResetting) return;
  const home = (typeof mpMyAddressString === 'function') ? mpMyAddressString() : null;
  let def = 0;
  try { def = (typeof sbWithWorld === 'function') ? sbWithWorld('home', () => totalDefense()) : totalDefense(); } catch (err) {}
  const rnd = () => 0.9 + Math.random() * 0.2;
  const atkEff = Math.round(x.power * rnd()), defEff = Math.round(def * rnd());
  const won = atkEff > defEff;
  const loot = { metal: 0, energie: 0, cristal: 0 };
  if (won) for (const k of Object.keys(loot)) loot[k] = Math.floor(((G.res[k] && G.res[k].v) || 0) * 0.5);
  let dmg = null, dmg2 = null;
  try {
    const built = ((sbWithWorld ? sbWithWorld('home', () => G.planet.parcels) : G.planet.parcels) || []).filter(p => p && p.state === 'built' && p.building && !p.damaged).map(p => p.building);
    if (won && built.length) { dmg = built[Math.floor(Math.random() * built.length)]; const rest = built.filter(b => b !== dmg); dmg2 = rest.length ? rest[Math.floor(Math.random() * rest.length)] : null; }
  } catch (err) {}
  const combat = { phases: {
    phase1: { won, atkEffective: atkEff, defEffective: defEff },
    phase2: won ? { won: true, atkEffective: Math.round(atkEff * 0.6), defEffective: Math.round(defEff * 0.3) } : undefined,
  }, outcome: won ? 'victory' : 'defeat' };
  const raid = { id: x.id, status: 'resolved', attacker_pseudo: 'l\'Empire', attacker_address: x.fromSys || '', defender_address: home, fleet_name: 'Expédition punitive',
    departed_at: new Date(x.startedAt).toISOString(), resolved_at: new Date().toISOString(),
    result: { outcome: won ? 'victory' : 'defeat', loot, loot_pct: 0.5, damaged_building: dmg, combat } };
  const ok = mpApplyRaidAgainstMe(raid);
  if (ok === false) return;   // pas intégré (restauration en cours) : on réessaiera
  if (won && dmg2) {
    try { const doIt = () => { const p = (G.planet.parcels || []).find(q => q && q.building === dmg2 && q.state === 'built' && !q.damaged); if (p) mpDamageParcel(p, 'l\'Empire'); };
      if (typeof sbWithWorld === 'function') sbWithWorld('home', doIt); else doIt(); } catch (err) {}
  }
  e.exp = null; e.rep = Math.min(sbEmpRep(), SB_EMP.AFTER_EXP); e.at = Date.now(); e.expCooldown = Date.now() + 24 * 3600e3;
  sbEmpCheck(true);
  toast(won ? '⚔ L\'expédition punitive a écrasé ta défense. L\'Empire a fait passer son message.' : '🎉 Ta capitale a repoussé l\'expédition punitive de l\'Empire !');
  if (typeof saveGame === 'function') saveGame();
  sbEmpBanner();
}
// prime : touchée (attaquant) ou payée par ma tête (défenseur)
function sbEmpBountyCollected(res, defPseudo) {
  const b = Math.max(0, Math.floor(Number(res && res.bounty) || 0));
  if (!b) return;
  G.credits = (G.credits || 0) + b;
  toast(`💰 Prime impériale touchée sur ${defPseudo || 'un recherché'} : +${fmt(b)} CG`);
}
function sbEmpBountyPaid(res, atkPseudo) {
  const b = Math.max(0, Math.floor(Number(res && res.bounty) || 0));
  if (!b) return;
  const e = sbEmpire();
  e.rep = Math.min(sbEmpRep(), SB_EMP.AFTER_BOUNTY); e.at = Date.now();
  sbEmpCheck(true);
  toast(`📜 ${atkPseudo || 'Un chasseur de primes'} a touché ta prime (${fmt(b)} CG). L'Empire relâche un peu son attention.`);
}
async function sbEmpPollWanted(force) {
  if (!window.SBMP || !SBMP.ready || !SBMP.ready()) return;
  if (!force && Date.now() - _sbWanted.at < 10 * 60000) return;
  _sbWanted.at = Date.now();
  try { const r = await _mpRpc('mp_wanted_list', {}); if (Array.isArray(r)) _sbWanted.list = r; } catch (err) {}
}
function sbWantedOf(addr) {
  const k = String(addr || '').split('-').slice(0, 4).join('-');
  return (_sbWanted.list || []).find(w => w.address === k) || null;
}
function sbWantedBadge(addr) {
  const w = sbWantedOf(addr);
  return w ? ` <span style="font-size:9px;color:#ff8a5a;border:1px solid rgba(255,138,90,.5);border-radius:3px;padding:1px 5px;letter-spacing:.06em;vertical-align:middle">RECHERCHÉ · ${fmt(w.bounty)} CG</span>` : '';
}
function sbEmpStatusHtml(atDock) {
  const e = sbEmpire(), rep = sbEmpRep(), t = sbEmpTierOf(rep), T = SB_EMP_TIERS[t];
  const me = (typeof mpMyAddressString === 'function') ? mpMyAddressString() : '';
  const others = (_sbWanted.list || []).filter(w => w.address !== me);
  if (!atDock && rep < 1 && !others.length && !e.exp) return '';
  const next = t < 3 ? [SB_EMP.SURV, SB_EMP.WANTED, SB_EMP.ENEMY][t] : null;
  const bar = Math.min(100, rep / SB_EMP.ENEMY * 100);
  let html = `<div class="dash-section-card" style="margin:0 16px 14px;border-color:${t ? 'rgba(255,138,90,.35)' : 'var(--border)'}">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">Registre impérial</span><b style="font-size:12px;color:${T.color}">${T.label}</b></div>
    <div style="height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin:8px 0 4px"><div style="height:100%;width:${bar.toFixed(1)}%;background:${T.color === 'var(--mut)' ? '#5a6470' : T.color}"></div></div>
    <div style="font-size:10px;color:var(--mut)">Réputation <b style="color:${T.color === 'var(--mut)' ? '#e6f0ff' : T.color}">${Math.round(rep) > 0 ? '−' + Math.round(rep) : '0'}</b>${next ? ` · ${SB_EMP_TIERS[t + 1].label} à −${next}` : ''} · elle remonte de 1 point par heure</div>`;   // 22/10 (Adrien) : la note est négative
  if (t >= 1) html += `<div style="font-size:11px;color:#e6f0ff;margin-top:8px;line-height:1.5">${t === 1 ? 'On parle de toi ici. Ses escortes sont renforcées de 25 % contre toi.' : t === 2 ? `Ta tête est mise à prix : <b style="color:#ff8a5a">${fmt(sbEmpBounty(rep))} CG</b> pour le commandant qui te pillera. Escortes +50 %.` : 'Ennemi de l\'Empire. Escortes doublées.'}</div>`;
  if (e.exp) html += `<div style="font-size:11px;color:#ff6a5a;margin-top:8px">⚔ Expédition punitive en route · force ${fmt(e.exp.power)} · impact ${new Date(e.exp.arrivesAt).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div>`;
  if (atDock && rep >= 1) html += `<button onclick="sbEmpPayFine()" style="margin-top:10px;width:100%;padding:11px;border-radius:9px;border:1px solid rgba(255,200,100,.45);background:rgba(60,40,10,.5);color:#ffc864;font-size:11px;letter-spacing:.12em;text-transform:uppercase">${e.exp ? 'Rappeler l\'expédition' : 'Payer l\'amende'} · ${fmt(sbEmpRecallCost())} CG</button>`;
  if (others.length) {
    html += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin:12px 0 6px">Avis de recherche</div>` + others.slice(0, 6).map(w =>
      `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border);font-size:12px"><span style="color:#ff8a5a">${_esc(w.pseudo)} <span style="color:var(--mut);font-size:10px;font-family:var(--font-mono,monospace)">${_esc(w.address)}</span></span><b style="color:#ffc864;white-space:nowrap">${fmt(w.bounty)} CG</b></div>`).join('');
    html += `<div style="font-size:10px;color:var(--mut);margin-top:6px;font-style:italic">Pille un recherché avec succès : l'Empire te verse la prime.</div>`;
  }
  return html + `</div>`;
}
function sbImperialDockHtml(mission, dock) {
  if (!dock || !window.SBLines || !SBLines.isImperialDock || !SBLines.isImperialDock(dock.id)) return '';
  sbEmpPollWanted();
  const t = sbEmpTier();
  const greet = t === 0 ? 'Les douaniers impériaux tamponnent tes papiers sans un regard.' : t === 1 ? 'Le barman baisse la voix : « On parle de toi ici, commandant. Fais attention. »'
    : t === 2 ? 'Ton visage est placardé à l\'entrée du dock. Les gardes te suivent des yeux.' : 'Les gardes posent la main sur leur arme quand tu passes.';
  return `<div style="margin-bottom:18px"><div style="font-size:12px;color:#e6f0ff;font-style:italic;line-height:1.6;padding:2px 2px 10px;font-family:'Charter','Iowan Old Style',Georgia,serif">${greet}</div>${sbEmpStatusHtml(true).replace('margin:0 16px 14px', 'margin:0 0 4px')}</div>`;
}

// PATCH_2210_DIAG_CARTE — export complet de la carte (lien …/?diag=carte : bouton flottant, sans les cheats)
// tout ce qu'il faut pour reconstruire la carte du joueur à l'identique : cases figées, tronçons, échos, systèmes affichés
function sbMapExport() {
  let d = {};
  try { d = JSON.parse(JSON.stringify({ v: 2, at: new Date().toISOString(),
    home: (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) ? MY_ADDRESS.cluster + '-' + MY_ADDRESS.sector + '-' + MY_ADDRESS.system : null,
    pseudo: (G.mpProfile && G.mpProfile.pseudo) || G.pseudo || null,
    mapCells: G.mapCells || null, mapKeys: window._smKeys || [], chains: window._smChains || [], errs: [window._smRouteErr || null, window._smLineErr || null],
    spottedLegs: G.spottedLegs || [], trafficEchoes: G.trafficEchoes || {}, hiddenPorts: G.hiddenPorts || {}, lineObs: Object.fromEntries(Object.entries(G.lineObs || {}).map(([k, o]) => [k, { n: o.n, last: o.last }])),
    systemTags: G.systemTags || {}, mapSeen: Object.keys(G.mapSeen || {}),
    routes: (G.routes || []).map(r => ({ id: r.id, name: r.name, portSys: r.portSys || null, dockId: r.dockId || null })),
    opened: window.SBLines ? SBLines.openedRoutes() : [],
    beacons: sbAllProbes().filter(b => b.tier === 'beacon').map(b => ({ id: b.id, state: b.state, sys: b.deployedSystem || null })),
    tankers: (G.tankerMissions || []).filter(m => m.status !== 'returned').map(m => ({ id: m.id, kind: m.kind, status: m.status, portSys: m.portSys || null, target: m.targetCoords || null, via: m.via || null })),
    fleets: ((G.fleet && G.fleet.prepared) || []).filter(f => f.ambush).map(f => ({ id: f.id, ambush: f.ambush })) })); } catch (e) { d = { err: String(e) }; }
  const txt = JSON.stringify(d);
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = 'starbyte-carte-' + String(d.pseudo || d.home || 'joueur').replace(/[^\w-]+/g, '_') + '.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Fichier de la carte enregistré : envoie-le à Adrien');
  } catch (e) { try { navigator.clipboard.writeText(txt); toast('Diagnostic copié : envoie-le à Adrien'); } catch (e2) {} }
  return txt;
}
function cheatBuildAll() {
  // Construit TOUS les bâtiments disponibles (Mine, Centrale, Labo, Caserne, Chantier, Bunker + tous les Silos)
  // Débloque d'abord toutes les parcelles verrouillées pour avoir assez de place
  for (const p of G.planet.parcels) {
    if (p.state === 'locked') {
      p.state = 'rocky';
      p.n = 'Plaine rocheuse';
      p.sub = 'Sol stable. Disponible pour terraformation.';
    }
  }

  // Liste de tous les bâtiments à construire (ordre cohérent : base → spécialisés → stockage)
  const targets = [
    'mine', 'centrale', 'labo', 'caserne', 'shipyard', 'turret',
    'comptoir', 'raffinerie',
    'silo_metal', 'silo_energie', 'silo_cristal', 'silo_biomass', 'silo_artefact',
  ];

  let built = 0;
  let skipped = [];

  for (const buildingKey of targets) {
    const b = BUILDINGS[buildingKey];
    if (!b) continue;

    // Trouve une parcelle dispo (qui n'a pas déjà un bâtiment)
    const idx = G.planet.parcels.findIndex(p =>
      (p.state === 'rocky' || p.state === 'resource') && p.idx !== 12
    );
    if (idx < 0) {
      skipped.push(b.name);
      continue;
    }

    const parcel = G.planet.parcels[idx];

    // Application directe (sans coût)
    parcel.state = 'built';
    parcel.building = buildingKey;
    parcel.n = customBuildingName(buildingKey);
    parcel.sub = b.desc;
    parcel.lvl = 1;
    parcel.max = 3;

    // Production : produit/h selon le bâtiment
    parcel.prod = Object.entries(b.prod || {}).map(([res, rate]) => [prodInfo(res).label.toLowerCase(), rateLbl(res, rate)]);

    // Défense passive (Caserne, Bunker)
    if (b.def && buildingKey === 'caserne') {
      parcel.prod.push(['défense', `+${b.def}`]);
      parcel.prod.push(['unités', 'gardes débloqués']);
    } else if (b.def && buildingKey === 'turret') {
      parcel.prod.push(['défense', `+${b.def}`]);
      parcel.prod.push(['unités', 'lourds + tourelles débloqués']);
    }

    // Silos : augmenter la capacité max de la ressource concernée
    if (b.kind === 'silo' && b.silo) {
      const tier1Data = BUILDING_TIERS[buildingKey]?.[1];
      const cap = tier1Data?.siloCap || b.silo.cap;
      const res = b.silo.res;
      if (G.res[res] !== undefined) {
        G.res[res].max += cap;
      }
      parcel.prod = [['capacité', `+${fmt(cap)} ${res}`]];
    }

    // Application des taux de production
    for (const [res, rate] of Object.entries(b.prod || {})) {
      if (G.res[res] !== undefined) G.res[res].rate += rate;
    }

    // Famille débloquée → niveau planète +1
    if (!G.planet.families.has(b.family)) {
      G.planet.families.add(b.family);
      G.planet.level++;
    }

    built++;
  }

  let msg = `${built} bâtiments construits sans coût`;
  if (skipped.length > 0) {
    msg += ` (${skipped.length} skippés faute de parcelles : ${skipped.join(', ')})`;
  }
  toast(msg);
  refreshCurrentScreen();
}

function cheatUnlockAll() {
  for (const p of G.planet.parcels) {
    if (p.state === 'locked') {
      p.state = 'rocky';
      p.n = 'Plaine rocheuse';
      p.sub = 'Sol stable. Disponible pour terraformation.';
    }
  }
  toast('Toutes parcelles débloquées');
  refreshCurrentScreen();
}

function cheatFinishUpgrade() {
  if (!QUEUES.capital.upgrade) {
    toast('Aucune amélioration en cours');
    return;
  }
  QUEUES.capital.upgrade.elapsed = QUEUES.capital.upgrade.totalDur;
  completeBuildingUpgrade();
  toast('Amélioration finalisée');
  refreshCurrentScreen();
}

async function cheatReset() {
  const ok = await sbConfirmDanger(
    'Reset complet',
    'Tu perds <strong>tout</strong>. Vraiment tout.<br><br><em>Cette action est irréversible.</em>',
    'Tout effacer'
  );
  if (!ok) return;
  // ⚡ V0.5 SAVE — Supprimer la save avant reload, sinon location.reload() restaurerait l'état
  if (typeof deleteSave === 'function') deleteSave();
  location.reload();
}

// State : { step: number, completed: boolean, dismissed: boolean }
function getOnboardingState() {
  if (!G.onboarding) {
    G.onboarding = { step: 0, completed: false, dismissed: false };
  }
  return G.onboarding;
}

// Vérifier progression : appelée à chaque action clé du jeu
function checkOnboardingProgress() {
  if (window.SBTuto) return;   // TUTO_1410 — remplacé par l'officier de bord
  const state = getOnboardingState();
  if (state.completed || state.dismissed) return;
  const currentStep = ONBOARDING_STEPS[state.step];
  if (!currentStep) {
    state.completed = true;
    return;
  }
  if (currentStep.checkComplete && currentStep.checkComplete()) {
    state.step++;
    if (state.step >= ONBOARDING_STEPS.length) {
      state.completed = true;
      if (typeof toast === 'function') {
        toast('🎓 Tu maîtrises les bases de Starbyte. Bonne route !');
      }
    } else {
      const nextStep = ONBOARDING_STEPS[state.step];
      if (typeof toast === 'function' && nextStep) {
        toast(`✓ Étape ${state.step} validée — ${nextStep.title}`);
      }
    }
    refreshOnboardingBanner();
  }
}

// Bannière visuelle sur le dashboard
function renderOnboardingBanner() {
  const state = getOnboardingState();
  if (state.completed || state.dismissed) return '';
  const step = ONBOARDING_STEPS[state.step];
  if (!step) return '';
  const progress = Math.round((state.step / ONBOARDING_STEPS.length) * 100);
  return `
    <div id="onboarding-banner" style="margin:0 16px 14px;padding:14px 16px;background:linear-gradient(135deg,rgba(95,168,232,.10),rgba(120,200,140,.05));border:1px solid rgba(95,168,232,.35);border-radius:10px;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:9px;color:#5fa8e8;letter-spacing:.14em;text-transform:uppercase;font-weight:600">
          Étape ${state.step + 1}/${ONBOARDING_STEPS.length} · ${step.title}
        </div>
        <div onclick="dismissOnboarding()" style="cursor:pointer;color:var(--mut);font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid var(--border)">Passer</div>
      </div>
      <div style="font-size:13px;color:#e6f0ff;line-height:1.5;margin-bottom:8px">${step.instruction}</div>
      <div style="font-size:11px;color:var(--mut);font-style:italic;line-height:1.5;margin-bottom:10px">💡 ${step.hint}</div>
      <div style="height:4px;background:rgba(255,255,255,.05);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#5fa8e8,#78c88c);transition:width 0.3s"></div>
      </div>
    </div>
  `;
}

// Fonction appelée par le bouton "Passer"
async function dismissOnboarding() {
  const ok = await sbConfirmDanger(
    'Passer le tutoriel ?',
    'Tu peux toujours apprendre par toi-même, mais le tutoriel ne reviendra pas.',
    'Passer'
  );
  if (!ok) return;
  const state = getOnboardingState();
  state.dismissed = true;
  refreshOnboardingBanner();
}

// Rafraîchir uniquement la bannière sans tout re-rendre
function refreshOnboardingBanner() {
  const existing = document.getElementById('onboarding-banner');
  if (existing) existing.remove();
  // Re-rendre le dashboard pour que la bannière apparaisse à la bonne place
  if (typeof renderDashboard === 'function') renderDashboard();
}
function _tEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function closeSbSheet() { const e = document.getElementById('sb-sheet'); if (e) e.remove(); if (window.SBTuto) setTimeout(() => SBTuto.tick(), 50); }
function _sbSheet(html) {
  closeSbSheet();
  const el = document.createElement('div'); el.id = 'sb-sheet';
  el.innerHTML = `<div class="card" onclick="event.stopPropagation()">${html}</div>`;
  el.addEventListener('click', closeSbSheet);
  document.body.appendChild(el);
  return el;
}
function _resLbl(k) { try { return prodInfo(k).label.toLowerCase(); } catch (e) { return k; } }
function openBuildingSheet(key, idx) {
  const b = BUILDINGS[key]; if (!b) return;
  const g = BUILDING_GUIDE[key] || { lead: b.desc, how: b.prodLbl, unlocks: [], tip: '' };
  const cost = Object.entries(b.cost || {});
  const miss = cost.filter(([r, q]) => !G.res[r] || G.res[r].v < q);
  const costHtml = cost.map(([r, q]) => { const have = Math.floor((G.res[r] && G.res[r].v) || 0); return `<i class="${have < q ? 'miss' : ''}">${fmt(q)} ${_resLbl(r)}</i>`; }).join(' · ');
  const mins = (typeof BUILD_TIME_MIN !== 'undefined' && BUILD_TIME_MIN[key]) || 0;
  const tiers = (typeof BUILDING_TIERS !== 'undefined' && BUILDING_TIERS[key]) || null;
  const evo = tiers ? Object.values(tiers).map(t => t.name).join(' → ') : '';
  const reco = window.SBTuto && SBTuto.recommend() === key;
  const el = _sbSheet(`
    <div class="hd"><div class="ic" style="color:${b.color}">${renderIcon(b.icon, { size: 26 })}</div>
      <div><div class="fam">${b.family || ''}${reco ? ' · <span style="color:#5fffe8">recommandé pour commencer</span>' : ''}</div><div class="nm">${b.name}</div></div></div>
    <div class="lead">${g.lead}</div>
    <div class="facts"><div><span>Produit</span><b>${b.prodLbl}</b></div><div><span>Chantier</span><b>${mins ? Math.max(1, Math.round(mins * (window.SBSkills ? SBSkills.durMult('build') : 1))) + ' min' + (window.SBSkills ? SBSkills.durTag('build') : '') : 'immédiat'}</b></div><div><span>Coût</span><b>${costHtml}</b></div></div>
    <div class="sec"><div class="lb">Comment ça marche</div><p>${g.how}</p></div>
    ${g.unlocks && g.unlocks.length ? `<div class="sec"><div class="lb">Ce qu'il permet</div><ul>${g.unlocks.map(u => `<li>${u}</li>`).join('')}</ul></div>` : ''}
    ${evo ? `<div class="sec"><div class="lb">Évolution</div><p>${evo}</p></div>` : ''}
    ${g.tip ? `<div class="sec tip">💡 ${g.tip}</div>` : ''}
    <div class="acts"><button class="sec2" data-a="back">Retour</button><button class="pri" data-a="build" ${miss.length ? 'disabled' : ''}>${miss.length ? 'Il manque des ressources' : 'Construire'}</button></div>`);
  el.querySelector('[data-a="back"]').onclick = closeSbSheet;
  if (idx == null) { const bt = el.querySelector('[data-a="build"]'); bt.disabled = false; bt.textContent = 'Où le construire ?'; }
  el.querySelector('[data-a="build"]').onclick = () => {
    if (idx == null) { closeSbSheet(); toast('Sur ta planète : touche un gisement, puis Construire'); return; }
    if (miss.length) return; closeSbSheet(); doBuild(key, idx);
  };
}
function openCapitalSheet() {
  const lvl = (() => { try { return mpWorldSnapshot().level; } catch (e) { return null; } })();
  const ps = (G.planet && G.planet.parcels) || [];
  const built = ps.filter(q => q && q.state === 'built').length, owned = ps.filter(q => q && q.state !== 'locked').length;
  const rate = (k) => { const v = effRate(k); return v ? `+${fmt(Math.round(v))}/h` : '—'; };
  const def = (() => { try { return fmt(Math.round(totalDefense())); } catch (e) { return '—'; } })();
  const el = _sbSheet(`
    <div class="hd"><div class="ic" style="color:var(--cyan)">${renderIcon('globe', { size: 26 })}</div>
      <div><div class="fam">Capitale${lvl ? ' · niveau ' + lvl : ''}</div><div class="nm">Centre de commandement</div></div></div>
    <div class="lead">Le cœur de ${_tEsc((G.planet && G.planet.name) || 'ta colonie')} : il centralise les rapports, la logistique et la recherche. S'il tombe, tout tombe.</div>
    <div class="facts"><div><span>Bâtiments</span><b>${built}</b></div><div><span>Parcelles</span><b>${owned}/${ps.length}</b></div><div><span>Défense</span><b>${def}</b></div>
      <div><span>Métal</span><b>${rate('metal')}</b></div><div><span>Énergie</span><b>${rate('energie')}</b></div><div><span>Cristal</span><b>${rate('cristal')}</b></div></div>
    <div class="sec"><div class="lb">Arbre technologique</div><p>Tout ce que ta colonie peut devenir : chaque bâtiment, ce qu'il coûte et ce qu'il débloque, du premier forage à la flotte de guerre.</p></div>
    <div class="acts" style="margin-top:4px"><button class="pri" data-a="tech">Arbre technologique</button></div>
    <div class="acts"><button class="sec2" data-a="open">Ouvrir le centre</button><button class="sec2" data-a="tuto">Revoir les bases</button></div>`);
  el.querySelector('[data-a="tech"]').onclick = () => { closeSbSheet(); goto('tech-tree'); };
  el.querySelector('[data-a="open"]').onclick = () => { closeSbSheet(); goto('capital'); };
  el.querySelector('[data-a="tuto"]').onclick = () => SBTuto.restart();
}
