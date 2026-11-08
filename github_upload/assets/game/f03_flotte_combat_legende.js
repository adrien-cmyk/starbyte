/* Starbyte — f03_flotte_combat_legende.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


function renderFleetDetail() {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  if (!fleet) {
    goto('fleet');
    return;
  }

  document.getElementById('fleet-detail-title').textContent = fleet.name.toUpperCase();
  document.getElementById('fleet-detail-name').textContent = fleet.name;

  // État de la flotte (passe 3.2 doctrine Z4-ter, passe 3.3 Z4-quinquies)
  const status = fleet.status || 'prepared';
  const isDeployed = status === 'deployed';
  const isInMission = status === 'in_mission';

  // Calcul des stats
  let totalShips = 0, totalAtk = 0, totalDef = 0, totalCargo = 0, totalCap = 0;
  for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
    for (let tier = 1; tier <= 3; tier++) {
      const qty = fleet.composition[shipKey]['t' + tier];
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
  const soldGarde = fleet.soldiers.garde;
  const soldLourd = fleet.soldiers.lourd;
  const totalSoldiers = soldGarde + soldLourd;
  const soldAtk = soldGarde * (DEFENSE_UNITS.garde?.atkPerUnit || 0) + soldLourd * (DEFENSE_UNITS.lourd?.atkPerUnit || 0);
  const soldDef = soldGarde * (DEFENSE_UNITS.garde?.defPerUnit || 0) + soldLourd * (DEFENSE_UNITS.lourd?.defPerUnit || 0);
  const grandAtk = totalAtk + soldAtk;
  const grandDef = totalDef + soldDef;

  // Header meta + sous-titre adaptés à l'état
  // Icône banner adaptée : ⚓ ancre = au port, ailes SVG = en orbite
  const bannerIcon = document.getElementById('fleet-detail-banner-icon');
  const bannerEl = document.getElementById('fleet-detail-banner');
  if (isInMission) {
    // EN MISSION : bleu très clair, animation discrète (transit)
    const target = fleet.missionTargetId ? getFakeTarget(fleet.missionTargetId) : null;
    if (bannerEl) bannerEl.style.borderColor = 'rgba(230,240,255,.45)';
    if (bannerIcon) {
      bannerIcon.style.color = '#e6f0ff';
      bannerIcon.innerHTML = `<div style="width:42px;height:42px;color:#e6f0ff">${svgFleetWings('#e6f0ff')}</div>`;
    }
    document.getElementById('fleet-detail-meta').innerHTML = `<span style="color:#e6f0ff">${icon('zap', {size:12})} En mission</span> · <span style="color:var(--blue)">${totalShips} vaisseaux</span> · <span style="color:var(--red)">${fmt(grandAtk)} atk</span>`;
    document.getElementById('fleet-detail-sub').innerHTML = fleet.garrison ? `<span style="color:#5fffe8">Garnison chez ${_esc(fleet.garrison.pseudo)}</span>` : fleet.ambush ? `<span style="color:#a370ff">Embuscade sur ${fleet.ambush.system}</span>` : `<span style="color:#e6f0ff">En transit vers ${target ? target.name : 'cible'}</span>`;
  } else if (isDeployed) {
    if (bannerEl) bannerEl.style.borderColor = 'rgba(184,208,255,.4)';
    if (bannerIcon) {
      bannerIcon.style.color = 'var(--blue-light)';
      // Wrap les ailes dans une div carrée pour respecter le sizing 42px
      bannerIcon.innerHTML = `<div style="width:42px;height:42px;color:var(--blue-light)">${svgFleetWings('var(--blue-light)')}</div>`;
    }
    document.getElementById('fleet-detail-meta').innerHTML = `<span style="color:var(--blue-light)">↗ En orbite</span> · <span style="color:var(--blue)">${totalShips} vaisseaux</span> · <span style="color:var(--red)">${fmt(grandAtk)} atk</span>`;
    document.getElementById('fleet-detail-sub').innerHTML = '<span style="color:var(--blue-light)">Bouclier orbital actif · Prête à recevoir un ordre</span>';
  } else {
    if (bannerEl) bannerEl.style.borderColor = 'rgba(80,152,255,.3)';
    if (bannerIcon) {
      bannerIcon.style.color = 'var(--blue)';
      bannerIcon.innerHTML = icon('anchor', {size:42});
    }
    document.getElementById('fleet-detail-meta').innerHTML = `Préparée · <span style="color:var(--blue)">${totalShips} vaisseaux</span> · <span style="color:var(--red)">${fmt(grandAtk)} atk</span>`;
    document.getElementById('fleet-detail-sub').textContent = 'En préparation · Vaisseaux au port';
  }

  // Composition détaillée
  const compEl = document.getElementById('fleet-detail-composition');
  let html = '';

  for (const shipKey of ['tanker', 'fregate', 'cuirasse']) {
    const meta = SHIP_UNITS[shipKey];
    for (let tier = 1; tier <= 3; tier++) {
      const qty = fleet.composition[shipKey]['t' + tier];
      if (qty === 0) continue;
      const td = SHIP_TIERS[shipKey]?.[tier];
      const tierColor = tier === 1 ? 'var(--mut)' : tier === 2 ? 'var(--amber)' : 'var(--cyan)';
      html += `
        <div class="hangar-row" style="cursor:default">
          <div class="hangar-icon" style="color:var(--blue)">${PNG_ILLUSTRATIONS[shipKey] ? `<img src="${PNG_ILLUSTRATIONS[shipKey]}" alt="${meta.name}" onerror="pngFallback(this, '${shipKey}')">` : meta.icon}</div>
          <div class="hangar-info">
            <div class="hangar-name">${td?.name || meta.name} <span style="color:var(--blue);font-weight:400">× ${qty}</span></div>
            <div class="hangar-stats">
              ${td?.atk ? `<span style="color:var(--red)">${fmt(td.atk * qty)} atk</span>` : ''}
              ${td?.def ? ` · <span style="color:var(--cyan)">${fmt(td.def * qty)} def</span>` : ''}
              ${td?.cargo ? ` · <span style="color:var(--amber)">${fmt(td.cargo * qty)} cargo</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }
  }
  // Soldats
  if (totalSoldiers > 0) {
    if (soldGarde > 0) {
      html += `<div class="hangar-row" style="cursor:default">
        <div class="hangar-icon" style="color:var(--red)">${PNG_ILLUSTRATIONS.garde ? `<img src="${PNG_ILLUSTRATIONS.garde}" alt="Garde" onerror="pngFallback(this, 'garde')">` : '◈'}</div>
        <div class="hangar-info">
          <div class="hangar-name">Gardes <span style="color:var(--blue);font-weight:400">× ${soldGarde}</span></div>
          <div class="hangar-stats">Embarqués dans Tankers</div>
        </div>
      </div>`;
    }
    if (soldLourd > 0) {
      html += `<div class="hangar-row" style="cursor:default">
        <div class="hangar-icon" style="color:var(--red)">${PNG_ILLUSTRATIONS.lourd ? `<img src="${PNG_ILLUSTRATIONS.lourd}" alt="Lourd" onerror="pngFallback(this, 'lourd')">` : '◆'}</div>
        <div class="hangar-info">
          <div class="hangar-name">Lourds <span style="color:var(--blue);font-weight:400">× ${soldLourd}</span></div>
          <div class="hangar-stats">Embarqués dans Tankers</div>
        </div>
      </div>`;
    }
  }
  compEl.innerHTML = html;

  // Doctrine détectée (passe 3.2 Z4-quater)
  const doctrine = detectFleetDoctrine(fleet.composition, fleet.soldiers);
  renderDoctrineCard(doctrine, 'fleet-detail-doctrine');

  // Récap
  // Capacité fret unifiée (passe 3.2 doctrine)
  const totalCargoCapacity = computeCargoCapacity(fleet.composition);
  const soldierFreight = computeSoldierFreight(fleet.soldiers);
  const cargoFree = computeCargoFree(fleet.composition, fleet.soldiers);

  const recapEl = document.getElementById('fleet-detail-recap');
  recapEl.innerHTML = `
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

  // ─── PRIMARY CTA (passe 3.3) — Bouton crescendo selon l'état ───
  const primaryEl = document.getElementById('fleet-detail-primary-cta');
  const reportEl = document.getElementById('fleet-detail-report-cta');
  const actionsEl = document.getElementById('fleet-detail-actions');
  if (!actionsEl) return;
  let primaryHtml = '', reportHtml = '', actionsHtml = '';

  if (isInMission && fleet.ambush) {   // PIRATERIE_1210 — embuscade sur une balise
    const a = fleet.ambush;
    primaryHtml = `
      <div style="background:linear-gradient(180deg, rgba(60,40,95,.55), rgba(30,20,60,.7));border:1.5px solid rgba(163,112,255,.45);border-radius:12px;padding:18px;text-align:center;box-shadow:0 0 14px rgba(163,112,255,.18)">
        <div style="font-size:10px;letter-spacing:.14em;color:var(--mut);margin-bottom:8px">EMBUSCADE SUR</div>
        <div onclick="openSystemOnMap('${a.system}')" style="font-size:20px;color:#c9a8ff;font-weight:700;margin-bottom:10px;letter-spacing:.04em;font-family:'SF Mono',monospace;cursor:pointer;text-decoration:underline dotted rgba(201,168,255,.5);text-underline-offset:5px">${a.system} <span style="font-size:11px;font-weight:500;letter-spacing:.06em;color:rgba(201,168,255,.7)">carte →</span></div>
        <div style="font-size:13px;color:#e6f0ff;font-family:'SF Mono',monospace;letter-spacing:.06em" id="fleet-detail-ambush-timer">${_mpAmbushPhaseText(fleet)}</div>
        ${(() => { const H = window.SBLines && SBLines.holdAll ? SBLines.holdAll(a) : (a.hold || {}); const cap = window.SBLines && SBLines.holdCap ? SBLines.holdCap(fleet) : 0;   // PATCH_1510_ORDRES
          return `<div style="font-size:11px;color:var(--mut);margin-top:10px">Cale de butin : <span style="color:${_mpCargoSum(H) > 0 ? '#ffc864' : 'var(--mut)'}">${_mpCargoSum(H) > 0 ? _mpResLine(H) : 'vide'}</span>${cap ? ` <span style="opacity:.7">/ ${fmt(cap)}</span>` : ' <span style="opacity:.7">· sans tanker</span>'}</div>`; })()}
        ${window.SBLines && SBLines.ordersLabel && a.phase !== 'returning' ? `<div style="font-size:11px;color:#c9a8ff;margin-top:6px">${SBLines.ordersLabel(fleet)}</div>` : ''}
      </div>
      ${fleetAmbushLootHtml(fleet)}`;   // PATCH_1510_FLEET_AMBUSH_VIEW
    actionsHtml = a.phase === 'returning' ? '' : a.phase === 'going' ? `
      <div style="padding:0 16px 14px;font-size:11px;color:var(--mut);font-style:italic;text-align:center">Engagée : elle va jusqu'à son poste. Une fois en place, tu pourras lever l'embuscade.</div>
      <div style="padding:0 16px 14px">
        <button class="btn-ghost" onclick="SBLines.setOrders('${fleet.id}')" style="width:100%;padding:12px;color:#e6f0ff;border-color:rgba(163,112,255,.3)">Changer les ordres</button>
      </div>` : `
      <div style="padding:0 16px 8px">
        <button class="btn-ghost" onclick="SBLines.setOrders('${fleet.id}')" style="width:100%;padding:12px;color:#e6f0ff;border-color:rgba(163,112,255,.3)">Changer les ordres</button>
      </div>
      <div style="padding:0 16px 14px">
        <button class="btn-ghost" onclick="mpAmbushRecall('${fleet.id}')" style="width:100%;padding:14px;color:#c9a8ff;border-color:rgba(163,112,255,.4)">Lever l'embuscade · rentrer au port</button>
      </div>`;
  } else if (isInMission && fleet.garrison) {   // PATCH_2110_GARNISON — garnison chez un allié
    const a = fleet.garrison;
    primaryHtml = `
      <div style="background:linear-gradient(180deg, rgba(20,60,60,.5), rgba(10,35,40,.7));border:1.5px solid rgba(95,255,232,.4);border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:10px;letter-spacing:.14em;color:var(--mut);margin-bottom:8px">GARNISON CHEZ</div>
        <div style="font-size:20px;color:#5fffe8;font-weight:700;margin-bottom:10px">${_esc(a.pseudo)}</div>
        <div style="font-size:13px;color:#e6f0ff;font-family:'SF Mono',monospace;letter-spacing:.06em" id="fleet-detail-garrison-timer">${_mpGarPhaseText(fleet)}</div>
        <div style="font-size:11px;color:var(--mut);margin-top:10px">Elle combat avec ses défenses si un raid arrive · tu paies ses pertes</div>
      </div>`;
    actionsHtml = a.phase === 'returning' ? '' : `
      <div style="padding:0 16px 14px">
        <button class="btn-ghost" onclick="mpGarrisonRecall('${fleet.id}')" style="width:100%;padding:14px;color:#5fffe8;border-color:rgba(95,255,232,.4)">Rappeler · rentrer au port</button>
      </div>`;
  } else if (isInMission) {
    // ÉTAT EN MISSION : remplacer le CTA par un panneau d'information mission en cours
    const fleetData = G.fleet.prepared.find(f => f.id === selectedFleetId);
    const target = fleetData?.missionTargetId ? getFakeTarget(fleetData.missionTargetId) : null;
    const remaining = fleetData?.missionEndsAt ? Math.max(0, fleetData.missionEndsAt - Date.now()) : 0;
    primaryHtml = `
      <div style="background:linear-gradient(180deg, rgba(40,55,95,.55), rgba(20,32,65,.7));border:1.5px solid rgba(184,208,255,.4);border-radius:12px;padding:18px;text-align:center;box-shadow:0 0 14px rgba(184,208,255,.18)">
        <div style="font-size:10px;letter-spacing:.14em;color:var(--mut);margin-bottom:8px">EN MISSION VERS</div>
        <div style="font-size:20px;color:var(--blue-light);font-weight:700;margin-bottom:10px;letter-spacing:.04em">${target ? target.name : '—'}</div>
        <div style="font-size:13px;color:#e6f0ff;font-family:'SF Mono',monospace;letter-spacing:.06em" id="fleet-detail-mission-timer">Retour dans ${formatMissionTimer(remaining)}</div>
      </div>
    `;
    actionsHtml = !_isDevMode() ? '' : `
      <div style="padding:0 16px 14px">
        <button class="btn-ghost" onclick="cheatReturnMission('${selectedFleetId}')" style="width:100%;padding:10px;color:var(--amber);border-color:rgba(255,192,96,.3);font-size:11px">${icon('settings', {size:11})} CHEAT : Faire revenir maintenant</button>
      </div>
    `;
  } else if (isDeployed) {
    // ÉTAT DÉPLOYÉE : CTA niveau 2 = Envoyer en mission (intensité moyenne)
    primaryHtml = `
      <button class="btn-ignition ignite-2" onclick="this.disabled=true; igniteFx2(() => openFleetTargetSelection());">
        <span class="ignite-icon">${svgTarget('currentColor')}</span>
        <span class="ignite-label">Envoyer en mission</span>
        <span class="ignite-arrow">→</span>
      </button>
    `;
    actionsHtml = (_mpOnline() && mpBeaconList().length ? `
      <div style="padding:0 16px 8px">
        <button class="btn-ghost" onclick="mpAmbushStart('${fleet.id}')" style="width:100%;padding:14px;color:#c9a8ff;border-color:rgba(163,112,255,.4)">⌖ Poster en embuscade</button>
      </div>` : '') + `
      <div style="padding:0 16px 14px;display:flex;gap:8px">
        <button class="btn-ghost fleet-cta" onclick="recallFleetToGround()" style="flex:1;padding:14px;display:flex;align-items:center;justify-content:center;gap:6px"><span class="icon-static" data-icon="anchor" data-icon-size="12"></span>Rappeler au sol</button>
        <button class="btn-ghost" onclick="confirmDissolveFleet()" style="flex:1;padding:14px;color:var(--red);border-color:rgba(255,80,64,.3)">Dissoudre</button>
      </div>
    `;
  } else {
    // ÉTAT PRÉPARÉE : CTA niveau 1 = Déployer en orbite (intensité subtile)
    primaryHtml = `
      <button class="btn-ignition ignite-1" onclick="this.disabled=true; igniteFx1(() => deployFleetToOrbit());">
        <span class="ignite-icon">${svgFleetWings('currentColor')}</span>
        <span class="ignite-label">Déployer en orbite</span>
        <span class="ignite-arrow">→</span>
      </button>
    `;
    actionsHtml = `
      <div style="padding:0 16px 14px;display:flex;gap:8px">
        <button class="btn-ghost fleet-cta" onclick="editCurrentFleet()" style="flex:1;padding:14px">✎ Modifier</button>
        <button class="btn-ghost" onclick="confirmDissolveFleet()" style="flex:1;padding:14px;color:var(--red);border-color:rgba(255,80,64,.3)">Dissoudre</button>
      </div>
    `;
  }

  // ─── Bouton "Voir le rapport" si rapport non lu pour cette flotte (passe 3.3) ───
  const unreadReport = (G.reports || []).find(r => r.fleetId === selectedFleetId && !r.read);
  if (unreadReport) {
    reportHtml = `
      <button onclick="openReportDetail('${unreadReport.id}')" style="width:100%;padding:12px 16px;background:linear-gradient(180deg, rgba(80,55,15,.6), rgba(50,35,10,.8));border:1.5px solid rgba(255,192,96,.55);border-radius:10px;color:var(--amber);font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 0 12px rgba(255,192,96,.25);animation:ignite1Pulse 2.5s ease-in-out infinite">
        <span style="display:inline-flex;align-items:center;gap:5px">${icon('satellite', {size:11})} Nouveau rapport de mission</span>
        <span style="font-size:18px">→</span>
      </button>
    `;
  }

  if (primaryEl) primaryEl.innerHTML = primaryHtml;
  if (reportEl) reportEl.innerHTML = reportHtml;
  actionsEl.innerHTML = actionsHtml;
  // INTÉGRITÉ — carte « Coques » (état, réparation au sol)
  let integEl = document.getElementById('fleet-detail-integrity-wrap');
  if (!integEl) { integEl = document.createElement('div'); integEl.id = 'fleet-detail-integrity-wrap'; const comp = document.getElementById('fleet-detail-composition'); comp.parentNode.insertBefore(integEl, comp.previousElementSibling); }
  integEl.innerHTML = renderFleetIntegrityCard(fleet);
  if (fleet.repair && primaryEl) primaryEl.innerHTML = `<div style="padding:12px 14px;border-radius:10px;border:1px solid rgba(255,192,96,.35);background:rgba(40,28,8,.55);color:var(--amber);font-size:11px;letter-spacing:.14em;text-transform:uppercase;text-align:center">Réparation au chantier en cours</div>`;
  // FORMATION3D — flotte en orbite : vue arrière 3/4 de la formation en plein écran, la fiche défile par-dessus
  setTimeout(() => { if (isDeployed || isInMission) mountFleetFormation3D(fleet, isInMission ? 'mission' : 'orbit'); else unmountFleetFormation3D(); }, 0);
}   // { id, sig, handle }
function mountFleetFormation3D(fleet, mode = 'orbit') {
  const scr = document.getElementById('scr-fleet-detail');
  const scroll = scr && scr.querySelector('.screen-scroll');
  if (!scr || !scroll || !window.WebGLRenderingContext) return false;
  let hero = document.getElementById('fd-form-hero');
  if (!hero) { hero = document.createElement('div'); hero.id = 'fd-form-hero'; hero.className = 'u3d u3d-hero'; scr.insertBefore(hero, scroll); }
  let space = document.getElementById('fd-form-space');
  if (!space) { space = document.createElement('div'); space.id = 'fd-form-space'; space.className = 'ud-hero-space'; const h = scroll.querySelector('.head'); scroll.insertBefore(space, h ? h.nextSibling : scroll.firstChild); }
  scr.classList.add('ud-hero', 'ud-ship');
  hero.style.display = ''; space.style.display = '';
  if (!hero.querySelector('.u3d-hint')) hero.insertAdjacentHTML('beforeend', `<div class="fd-sel" id="fd-sel"></div><div class="u3d-hint"></div>`);
  hero.querySelector('.u3d-hint').textContent = mode === 'mission' ? 'En mission · touche un vaisseau' : 'En orbite · touche un vaisseau';
  requestAnimationFrame(() => {
    const hb = hero.getBoundingClientRect(), sb = space.getBoundingClientRect();
    if (hb.height) hero.style.setProperty('--u3d-band', Math.max(0, hb.bottom - sb.bottom) + 'px');
  });
  shipHeroGestures('scr-fleet-detail', () => fleetFormation3D && fleetFormation3D.handle, (hit) => showFormationSelection(hit));
  syncFleetIntegrity(fleet);
  const sig = JSON.stringify([fleet.composition, fleet.integrity, mode, (fleet.premium || []).map(p => p.pid)]);   // BLACKMARKET : vaisseaux d'exception en tête
  if (fleetFormation3D && fleetFormation3D.id === fleet.id && fleetFormation3D.sig === sig) return true;
  unmountFleetFormation3D(true);
  hero.classList.add('u3d-loading');
  fleetFormation3D = { id: fleet.id, sig, handle: window.Formation3D.mount(hero, { fleet, mode, shiftY: 0.2, onReady: () => hero.classList.remove('u3d-loading') }) };
  return true;
}
function showFormationSelection(hit) {
  const box = document.getElementById('fd-sel');
  if (!box || !fleetFormation3D) return;
  if (!hit || (box.dataset.idx === String(hit.index) && box.classList.contains('on'))) {   // second toucher : désélection
    box.classList.remove('on'); box.dataset.idx = ''; fleetFormation3D.handle.select(null); return;
  }
  if (typeof hit.type === 'string' && hit.type.indexOf('bm:') === 0 && window.SBBlackmarket) { window.SBBlackmarket.openOwned(hit.type.slice(3)); return; }   // BLACKMARKET : toucher le vaisseau d'exception = sa vitrine
  fleetFormation3D.handle.select(hit.index);
  const meta = SHIP_UNITS[hit.type] || {}, td = (SHIP_TIERS[hit.type] || {})[hit.tier] || {};
  box.dataset.idx = String(hit.index);
  const hp = hit.hp == null ? 100 : hit.hp, hpCol = hp > 66 ? 'var(--green)' : hp > 33 ? 'var(--amber)' : 'var(--red)';
  box.innerHTML = `<div class="fd-sel-name">${(meta.name || hit.type)} <span>T${hit.tier}</span><em style="float:right;font-style:normal;color:${hpCol}">${hp} %</em></div>
    <div style="height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin:0 0 7px"><div style="height:100%;width:${hp}%;background:${hpCol}"></div></div>
    <div class="fd-sel-stats"><span>ATK <b style="color:var(--red)">${fmt(td.atk || 0)}</b></span><span>DEF <b style="color:var(--teal, #5fffe8)">${fmt(td.def || 0)}</b></span>${td.cargo ? `<span>CARGO <b style="color:var(--amber)">${fmt(td.cargo)}</b></span>` : ''}</div>`;
  if (hp < 100) box.insertAdjacentHTML('beforeend', `<div style="margin-top:6px;font-size:9px;letter-spacing:.12em;color:rgba(190,208,220,.6)">EFFICACITÉ ${Math.round(shipEfficiency(hp) * 100)} % · ${fleetFormation3D && (G.fleet.prepared.find(f => f.id === fleetFormation3D.id) || {}).status === 'deployed' ? 'RÉPARABLE AU SOL' : 'RÉPARABLE AU CHANTIER'}</div>`);
  box.classList.add('on');
}
function unmountFleetFormation3D(keepClasses) {
  if (fleetFormation3D) { try { fleetFormation3D.handle.dispose(); } catch (e) {} fleetFormation3D = null; }
  const box = document.getElementById('fd-sel'); if (box) { box.classList.remove('on'); box.dataset.idx = ''; }
  if (keepClasses) return;
  const hero = document.getElementById('fd-form-hero'); if (hero) hero.style.display = 'none';
  const space = document.getElementById('fd-form-space'); if (space) space.style.display = 'none';
  const scr = document.getElementById('scr-fleet-detail'); if (scr) scr.classList.remove('ud-hero', 'ud-ship');
}

function editCurrentFleet() {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  if (!fleet) return;
  // Une flotte déployée ne peut pas être modifiée (équipage à bord, formation engagée)
  const status = fleet.status || 'prepared';
  if (status === 'deployed') {
    toast('Rappelle la flotte au sol pour la modifier');
    return;
  }
  openFleetCompose(fleet.id);
}

// ─── PASSE 3.2 — Déploiement en orbite (doctrine Z4-ter) ───
// Transitionne une flotte de l'état 'prepared' à 'deployed'.
// Effets : vaisseaux quittent l'assemblage et défendent depuis l'orbite,
// soldats embarqués ne défendent plus le sol.
function deployFleetToOrbit() {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  if (!fleet) return;
  if (fleet.repair) { toast('Réparation en cours au chantier'); refreshCurrentScreen(); return; }
  const status = fleet.status || 'prepared';
  if (status !== 'prepared') {
    toast('Flotte déjà déployée');
    return;
  }
  fleet.status = 'deployed';
  fleet.deployedAt = Date.now();
  // ORBITE = ARMER : la flotte qui quitte le dock se regarde en orbite (récompense visuelle, North Star §24)
  // → la fiche de la flotte passe en vue « formation en orbite » (vue arrière 3/4, la fiche par-dessus)
  toast(`${fleet.name} en orbite`);
  refreshCurrentScreen();
}

// Rappelle une flotte 'deployed' vers 'prepared'.
// Effets : vaisseaux retournent en assemblage, soldats redéploient au sol.
function recallFleetToGround() {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  if (!fleet) return;
  const status = fleet.status || 'prepared';
  if (status !== 'deployed') {
    toast('Flotte n\'est pas en orbite');
    return;
  }
  fleet.status = 'prepared';
  fleet.deployedAt = null;
  toast(`${fleet.name} rappelée au sol`);
  refreshCurrentScreen();
}

async function confirmDissolveFleet() {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  if (!fleet) return;
  if (fleet.repair) { toast('Attends la fin des réparations'); return; }
  if (fleetDamageSummary(fleet).damaged) { toast('Répare d\'abord les coques endommagées'); return; }
  const status = fleet.status || 'prepared';
  // Garde-fou : refuser absolument de dissoudre une flotte en mission
  if (status === 'in_mission') {
    toast('Impossible : flotte en mission. Attends son retour.');
    return;
  }
  // Garde-fou : refuser la dissolution d'une flotte en orbite (il faut la rappeler d'abord)
  if (status === 'deployed') {
    const ok = await sbConfirmDanger(
      'Dissoudre la flotte',
      `<strong>${fleet.name}</strong> est en orbite.<br><br>La rappeler au sol et la dissoudre ?`,
      'Rappeler et dissoudre'
    );
    if (!ok) return;
    fleet.status = 'prepared';
  } else {
    const ok = await sbConfirmDanger(
      'Dissoudre la flotte',
      `Dissoudre <strong>${fleet.name}</strong> ?<br><br><em>Les vaisseaux et soldats retourneront en hangar/garnison.</em>`,
      'Dissoudre'
    );
    if (!ok) return;
  }
  // Action rituelle (niveau 2) — cf. GDD 11_design_patterns.md
  // La dissolution est irréversible, elle mérite un moment de gravité
  const fleetName = fleet.name; // capturer avant le callback (au cas où la flotte est mutée)
  ritualAction('dissolve', () => {
    G.fleet.prepared = G.fleet.prepared.filter(f => f.id !== selectedFleetId);
    toast(`${fleetName} dissoute`);
    goto('fleet');
  });
} // 30s en mode développeur seulement

// BOTS_1110 — durée aller-retour = trajet réel (même règle que les raids entre commandants : 10 min + 5 min par secteur, ×2)
function getMissionDuration(target) {
  if (G.cheats?.instantMission && typeof _isDevMode === 'function' && _isDevMode()) return MISSION_DURATION_MS_CHEAT;
  if (target && (target.coord || target.mpAddress) && typeof mpRaidTravelMs === 'function') return mpRaidTravelMs(target) * 2;
  return MISSION_DURATION_MS_DEFAULT;
}

// Format un timer (ms) en chaîne lisible "12h 34m" ou "29s"
function formatMissionTimer(ms) {
  if (ms <= 0) return 'imminent...';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ─── Étape 1 : ouvrir l'écran de sélection de cible ───
function openFleetTargetSelection() {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  if (!fleet) return;
  if ((fleet.status || 'prepared') !== 'deployed') {
    toast('La flotte doit être en orbite pour partir en mission');
    return;
  }

  // Pré-remplir la bannière avec les infos de la flotte
  document.getElementById('fleet-target-fleet-name').textContent = fleet.name;
  const bannerIcon = document.getElementById('fleet-target-banner-icon');
  if (bannerIcon) bannerIcon.innerHTML = `<div style="width:42px;height:42px;color:var(--blue-light)">${svgFleetWings('var(--blue-light)')}</div>`;

  const doctrine = detectFleetDoctrine(fleet.composition, fleet.soldiers);
  const intent = getMissionIntent(fleet);
  document.getElementById('fleet-target-fleet-doctrine').innerHTML = doctrine
    ? `<span style="color:${doctrine.color};display:inline-flex;align-items:center;gap:4px">${renderIcon(doctrine.icon, {size:11})} ${doctrine.name}</span> · Intention : <span style="color:var(--amber);display:inline-flex;align-items:center;gap:4px">${renderIcon(intent.icon, {size:11})} ${intent.label}</span>`
    : `Intention : <span style="color:var(--amber);display:inline-flex;align-items:center;gap:4px">${renderIcon(intent.icon, {size:11})} ${intent.label}</span>`;

  // Liste des cibles
  renderTargetList(fleet);

  goto('fleet-target');
}

function _fleetTargetRowHtml(fleet, target) {
  const fuelCost = computeMissionFuelCost(fleet, target);
  const energieAvailable = G.res.energie.v || 0;
  const canAfford = energieAvailable >= fuelCost;
  const targetable = target.targetable !== false;
  const enabled = canAfford && targetable;
  const profileColor = target.distanceMult === 1 ? 'var(--green)' : target.distanceMult === 3 ? 'var(--amber)' : 'var(--red)';
  const distanceLabel = target.distanceMult === 1 ? 'Proche' : target.distanceMult === 3 ? 'Distance moyenne' : 'Lointaine';
  const onclick = !targetable
    ? `toast('${(target.hint || 'Cible non verrouillée').replace(/'/g, "\\'")}')`
    : (canAfford ? `openMissionConfirm('${target.id}')` : `toast('Énergie insuffisante : ${fmt(fuelCost)} requis')`);
  const coordLine = target.coord
    ? `<div style="font-family:'SF Mono',monospace;font-size:9px;color:var(--mut);margin-top:2px;letter-spacing:.04em">${target.coord}</div>`
    : '';
  const statsLine = (targetable && target.mp)
    ? `<span style="color:var(--mut);font-style:italic">Défense inconnue</span> ·
            <span style="color:var(--amber)">${formatMissionTimer(mpRaidTravelMs(target) * 2)} A/R</span> ·
            <span style="color:${canAfford ? 'var(--green)' : 'var(--red)'};display:inline-flex;align-items:center;gap:4px">${icon('zap', {size:11})} ${fmt(fuelCost)}</span>`
    : targetable
    ? `<span style="color:var(--cyan)">${fmt(target.defense)} déf</span> ·
            <span style="color:var(--amber)">${fmt(target.resources.metal)} métal</span> ·
            <span style="color:${canAfford ? 'var(--green)' : 'var(--red)'};display:inline-flex;align-items:center;gap:4px">${icon('zap', {size:11})} ${fmt(fuelCost)}</span>`
    : `<span style="color:#ffc864;font-style:italic">${target.hint || ''}</span>`;
  return `
      <div class="fleet-prepared-row${enabled ? '' : ' disabled'}" onclick="${onclick}" style="${enabled ? '' : 'opacity:.5;cursor:not-allowed'}">
        <div class="fleet-prepared-icon" style="color:${profileColor};background:rgba(184,208,255,.06);border-color:rgba(184,208,255,.2)">
          <div style="font-size:${String(target.level).length > 3 ? 14 : 18}px;font-weight:700;font-family:'SF Mono',monospace">${target.level}</div>
        </div>
        <div class="fleet-prepared-info">
          <div class="fleet-prepared-name">${target.name}</div>
          ${coordLine}
          <div style="font-size:10px;color:${profileColor};margin-top:2px;font-style:italic">${target.profile} · ${distanceLabel}</div>
          <div class="fleet-prepared-stats" style="margin-top:3px">
            ${statsLine}
          </div>
          ${typeof pvTargetNote === 'function' ? pvTargetNote(target) : ''}
        </div>
        <div class="fleet-prepared-arrow">→</div>
      </div>
    `;
}

function renderTargetList(fleet) {
  const listEl = document.getElementById('fleet-target-list');
  if (!listEl) return;

  const sectionHead = (label) => `<div style="padding:10px 16px 6px;font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">${label}</div>`;

  // 10/10/2026 — Adresses du carnet en premier : c'est la vraie progression
  // (verrouillages Moyenne, joueurs repérés). Les cibles de test restent dessous.
  const carnetTargets = (typeof getCarnetTargets === 'function') ? getCarnetTargets() : [];
  if (typeof mpRefreshCarnetLevels === 'function') mpRefreshCarnetLevels(carnetTargets);   // NIVEAU_0811
  let html = sectionHead(`Adresses du carnet${carnetTargets.length ? ' · ' + carnetTargets.length : ''}`);
  if (carnetTargets.length === 0) {
    html += `
      <div style="margin:0 16px 8px;padding:12px 14px;border:1px dashed var(--border);border-radius:8px;font-size:10px;color:var(--mut);line-height:1.6;font-style:italic">
        Aucune adresse dans le carnet. Sonde des systèmes de ton secteur : des commandants (joueurs ou automates) y vivent. Une Sonde Moyenne verrouille aussi les corps orbitaux.
      </div>`;
  } else {
    for (const target of carnetTargets) html += _fleetTargetRowHtml(fleet, target);
  }

  // BOTS_1110 — les cibles d'entraînement vivent désormais dans l'univers (commandants automates)

  listEl.innerHTML = html;
}

function openMissionConfirm(targetId) {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  const target = getFakeTarget(targetId);
  if (!fleet || !target) return;
  pendingMissionTargetId = targetId;

  const intent = getMissionIntent(fleet);
  const doctrine = detectFleetDoctrine(fleet.composition, fleet.soldiers);
  const fuelCost = computeMissionFuelCost(fleet, target);
  const energieAvailable = G.res.energie.v || 0;
  const canAfford = energieAvailable >= fuelCost;

  // Bannière
  document.getElementById('fleet-mission-banner-name').textContent = `${intent.label} sur ${target.name}`;
  document.getElementById('fleet-mission-banner-sub').textContent = `${fleet.name} → ${target.profile}`;
  const bannerIcon = document.getElementById('fleet-mission-banner-icon');
  if (bannerIcon) bannerIcon.innerHTML = intent.icon;

  // Récap mission
  const duration = target.mp ? mpRaidTravelMs(target) * 2 : getMissionDuration(target);
  let nShips = 0;
  for (const sk of ['tanker', 'fregate', 'cuirasse']) {
    for (let t = 1; t <= 3; t++) nShips += (fleet.composition?.[sk]?.['t' + t] || 0);
  }
  const nSoldiers = (fleet.soldiers?.garde || 0) + (fleet.soldiers?.lourd || 0);

  document.getElementById('fleet-mission-recap').innerHTML = `
    <div class="dash-stat-row"><span class="lbl">Flotte</span><span class="val" style="color:var(--blue-light)">${fleet.name}</span></div>
    <div class="dash-stat-row"><span class="lbl">Doctrine</span><span class="val" style="color:${doctrine?.color || 'var(--mut)'}">${doctrine?.name || '—'}</span></div>
    <div class="dash-stat-row"><span class="lbl">Intention</span><span class="val" style="color:var(--amber);display:inline-flex;align-items:center;gap:5px">${renderIcon(intent.icon, {size:12})} ${intent.label}</span></div>
    <div class="dash-stat-row"><span class="lbl">Cible</span><span class="val" style="color:var(--red)">${target.name}</span></div>
    <div class="dash-stat-row"><span class="lbl">Vaisseaux engagés</span><span class="val" style="color:var(--blue)">${nShips}</span></div>
    ${nSoldiers > 0 ? `<div class="dash-stat-row"><span class="lbl">Soldats embarqués</span><span class="val" style="color:var(--blue)">${nSoldiers}</span></div>` : ''}
    <div class="dash-stat-row"><span class="lbl">Durée mission</span><span class="val" style="color:var(--cyan)">${formatMissionTimer(duration)}</span></div>
  `;

  // Coût
  document.getElementById('fleet-mission-cost').innerHTML = `
    <div class="dash-stat-row"><span class="lbl">Énergie de propulsion</span><span class="val" style="color:${canAfford ? 'var(--green)' : 'var(--red)'};display:inline-flex;align-items:center;gap:4px">${icon('zap', {size:11})} ${fmt(fuelCost)}</span></div>
    <div class="dash-stat-row"><span class="lbl">Énergie disponible</span><span class="val" style="color:var(--cyan)">${fmt(energieAvailable)}</span></div>
    <div class="dash-stat-row"><span class="lbl">Restant après lancement</span><span class="val" style="color:${canAfford ? 'var(--mut)' : 'var(--red)'}">${fmt(Math.max(0, energieAvailable - fuelCost))}</span></div>
  `;

  // Bouton + warning + injection SVG dans le cercle nucléaire
  const confirmBtn = document.getElementById('fleet-mission-confirm-btn');
  const warningEl = document.getElementById('fleet-mission-warning');
  // Réinjecter le SVG rocket dans l'icône du bouton (template HTML statique ne le rend pas)
  const iconEl = confirmBtn?.querySelector('.nuke-icon');
  if (iconEl) iconEl.innerHTML = svgRocket('currentColor');

  if (canAfford) {
    confirmBtn.classList.remove('disabled');
    confirmBtn.disabled = false;
    warningEl.innerHTML = `<div style="font-size:11px;color:var(--mut);font-style:italic;text-align:center;padding:8px">Une fois lancée, la flotte sera indisponible jusqu'à son retour.</div>`;
  } else {
    confirmBtn.classList.add('disabled');
    confirmBtn.disabled = true;
    warningEl.innerHTML = `<div style="background:rgba(255,80,64,.08);border:1px solid rgba(255,80,64,.3);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--red);display:flex;align-items:flex-start;gap:6px">${icon('warning', {size:12, color:'var(--red)', style:'flex-shrink:0;margin-top:1px'})}<span>Énergie insuffisante. Il manque ${fmt(fuelCost - energieAvailable)} pour lancer la mission.</span></div>`;
  }

  goto('fleet-mission-confirm');
}

// ─── Étape 2.5 : wrapper du clic du bouton final (déclenche l'effet sensoriel) ───
async function triggerLaunchMission(btnElement) {
  // Niveau 3 — célébration extrême puis lancement effectif
  if (btnElement && btnElement.disabled) return;
  if (typeof mpPeaceGuard === 'function' && !(await mpPeaceGuard('Envoyer cette flotte en mission'))) return;   // PATCH_2410_PACIFIQUE
  // Désactive immédiatement le bouton pour empêcher double-tap
  if (btnElement) {
    btnElement.classList.add('disabled');
    btnElement.disabled = true;
  }
  igniteFx3(btnElement, () => {
    confirmSendMission();
  });
}

// ─── Étape 3 : lancer effectivement la mission ───
function confirmSendMission() {
  const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
  const target = getFakeTarget(pendingMissionTargetId);
  if (!fleet || !target) { toast('Erreur : mission invalide'); return; }
  if (target.mp) { mpLaunchRaid(fleet, target); return; }
  if ((fleet.status || 'prepared') !== 'deployed') {
    toast('La flotte doit être en orbite');
    return;
  }
  const fuelCost = computeMissionFuelCost(fleet, target);
  if ((G.res.energie.v || 0) < fuelCost) {
    toast('Énergie insuffisante');
    return;
  }

  // Débit énergie
  G.res.energie.v -= fuelCost;

  // Passage en mission
  const duration = getMissionDuration(target);
  if (typeof mpPeaceRenounce === 'function') mpPeaceRenounce();   // PATCH_2410_PACIFIQUE
  fleet.status = 'in_mission';
  fleet.missionTargetId = target.id;
  fleet.missionStartedAt = Date.now();
  fleet.missionEndsAt = Date.now() + duration;
  fleet.missionFuelSpent = fuelCost;

  pendingMissionTargetId = null;

  toast(`${fleet.name} en route vers ${target.name}`);

  // Démarrer le timer global si pas déjà actif
  startMissionTimerLoop();

  // Retour à la Vue d'amiral (hub naval) : le joueur a accompli son geste,
  // on l'amène au tableau d'ensemble plutôt qu'à la fiche d'une flotte spécifique.
  // 'fleet' étant dans NAV_HUBS, la stack est nettoyée automatiquement → 1 seul retour
  // depuis la Vue d'amiral pour revenir au dashboard (fix bug navigation passe 3.3).
  goto('fleet');
}
function startMissionTimerLoop() {
  if (_missionTimerInterval) return;
  _missionTimerInterval = setInterval(tickMissionTimers, 1000);
}

function tickMissionTimers() {
  const now = Date.now();
  let anyActive = false;
  let anyReturned = false;

  for (const fleet of G.fleet.prepared) {
    if ((fleet.status || 'prepared') !== 'in_mission') continue;
    if (fleet.ambush) { if (_mpAmbushTick(fleet, now)) anyReturned = true; else anyActive = true; continue; }   // PIRATERIE_1210
    if (fleet.garrison) { if (_mpGarTick(fleet, now)) anyReturned = true; else anyActive = true; continue; }   // PATCH_2110_GARNISON
    if (!fleet.missionEndsAt) continue;
    if (fleet.mpRaidId && fleet.mpArrivesAt && now >= fleet.mpArrivesAt && !_mpResolveAsked.has(fleet.mpRaidId)) {
      _mpResolveAsked.add(fleet.mpRaidId);
      if (window.SBMP) window.SBMP.resolveDue();
    }
    if (now >= fleet.missionEndsAt) {
      returnMission(fleet);
      anyReturned = true;
    } else {
      anyActive = true;
    }
  }

  if (!anyActive && !anyReturned) {
    clearInterval(_missionTimerInterval);
    _missionTimerInterval = null;
    return;
  }

  // Mettre à jour les timers visibles dans l'UI sans tout repeindre
  updateMissionTimersUI();

  if (anyReturned) refreshCurrentScreen();
}

function updateMissionTimersUI() {
  const now = Date.now();
  // Timer sur la fiche détail
  const detailTimer = document.getElementById('fleet-detail-mission-timer');
  if (detailTimer && selectedFleetId) {
    const fleet = G.fleet.prepared.find(f => f.id === selectedFleetId);
    if (fleet && (fleet.status === 'in_mission') && fleet.missionEndsAt) {
      detailTimer.textContent = `Retour dans ${formatMissionTimer(fleet.missionEndsAt - now)}`;
    }
  }
  // Timer sur les cards Vue d'amiral
  document.querySelectorAll('[data-mission-timer]').forEach(el => {
    const fid = el.getAttribute('data-mission-timer');
    const fleet = G.fleet.prepared.find(f => f.id === fid);
    if (fleet && fleet.missionEndsAt) {
      el.textContent = formatMissionTimer(fleet.missionEndsAt - now);
    }
  });
}

// ─── Étape 4 : retour de mission (auto ou cheat) ───
/* ═══════════════════════════════════════════════════════════════
   PASSE 3.4 — MOTEUR DE RÉSOLUTION DU COMBAT ASYNCHRONE (Z5-bis)
   ═══════════════════════════════════════════════════════════════
   Pipeline : resolveCombat(fleet, target) → { combatResult }
   combatResult contient :
     - phases: { phase1, phase2?, phase3? } chaque phase a son log
     - finalLosses: { ships: {...}, soldiers: {...}, heroesDead: [...] }
     - loot: { metal, energie, cristal } (si Phase 3 réussie)
     - heroic: bool (combat héroïque)
     - outcome: 'crushing_victory' | 'victory' | 'pyrrhic' | 'defeat' | 'massacre'
   ═══════════════════════════════════════════════════════════════ */

// Helper : aléatoire borné dans [min, max]
function combatRand(min, max) {
  return min + Math.random() * (max - min);
}

// Helper : applique la doctrine Z3 sur un nombre de vaisseaux détruits.
// Pour chaque vaisseau "détruit", on tire la chance de récupération.
// Renvoie { destroyed, recovered }.
function applyShipRecovery(destroyedCount, shipType, closeness) {
  const recoveryRate = (COMBAT_CONSTS.RECOVERY[shipType] || 0) * (1 - 0.7 * Math.max(0, Math.min(1, closeness || 0)));   // PATCH_1910_COMBAT_SERRE
  let destroyed = 0, recovered = 0;
  for (let i = 0; i < destroyedCount; i++) {
    if (Math.random() < recoveryRate) recovered++;
    else destroyed++;
  }
  return { destroyed, recovered };
}

// Calcule la puissance d'attaque orbitale d'une flotte (cuirassés + frégates seulement)
// BLACKMARKET (v32) — vaisseaux d'exception : Cuirassé de Héro = cuirassé T3 +20 % d'attaque, Dreadnought = 2 cuirassés T3.
// Hors de la composition : ils ne subissent jamais de pertes ; orbite perdue → mis hors service (result.premiumDown).
function premiumFleetAttack(fleet) {
  const base = (SHIP_TIERS.cuirasse && SHIP_TIERS.cuirasse[3] && SHIP_TIERS.cuirasse[3].atk) || 13500;
  let atk = 0;
  for (const p of (Array.isArray(fleet && fleet.premium) ? fleet.premium : [])) atk += p && p.cat === 'dread' ? base * 2 : p && p.cat === 'sport' ? base * 1.2 : 0;
  return atk;
}

function computeFleetOrbitalAttack(composition) {
  let atk = 0;
  for (const type of ['fregate', 'cuirasse']) {
    for (let tier = 1; tier <= 3; tier++) {
      const qty = composition?.[type]?.['t' + tier] || 0;
      const td = SHIP_TIERS[type]?.[tier];
      if (qty && td) atk += qty * (td.atk || 0);
    }
  }
  return atk;
}

// Calcule la puissance d'attaque des soldats embarqués
function computeSoldierAttack(soldiers) {
  if (!soldiers) return 0;
  // SOLDIERS_1110 — mêmes valeurs que la fiche d'unité (DEFENSE_UNITS.atkPerUnit : garde 50, lourd 250)
  let atk = 0;
  atk += (soldiers.garde || 0) * (DEFENSE_UNITS.garde.atkPerUnit || 0);
  atk += (soldiers.lourd || 0) * (DEFENSE_UNITS.lourd.atkPerUnit || 0);
  return atk;
}

// Calcule la capacité de cargo total des Tankers survivants
function computeSurvivingCargo(survivingTankers) {
  let cap = 0;
  for (let tier = 1; tier <= 3; tier++) {
    const qty = survivingTankers['t' + tier] || 0;
    const td = SHIP_TIERS.tanker?.[tier];
    if (qty && td) cap += qty * (td.cargo || 0);
  }
  return cap;
}

// Distribue X pertes de vaisseaux d'un type sur les tiers (priorité aux tiers bas)
// Modifie l'objet engagedByTier (qui devient le "survivants").
// Renvoie l'objet { perdusParTier, totalDetruits }
function distributeShipLosses(engagedByTier, totalToLose) {
  const lost = { t1: 0, t2: 0, t3: 0 };
  let remaining = Math.round(totalToLose);

  // On commence par tier 1 (les moins chers), puis t2, puis t3
  for (const tier of ['t1', 't2', 't3']) {
    if (remaining <= 0) break;
    const available = engagedByTier[tier] || 0;
    const taken = Math.min(remaining, available);
    lost[tier] = taken;
    engagedByTier[tier] = available - taken;
    remaining -= taken;
  }
  return { lost, totalDestroyed: lost.t1 + lost.t2 + lost.t3 };
}
function syncFleetIntegrity(fleet) {
  if (!fleet || !fleet.composition) return;
  if (!fleet.integrity) fleet.integrity = {};
  for (const type of SHIP_TYPES_ALL) {
    if (!fleet.integrity[type]) fleet.integrity[type] = { t1: [], t2: [], t3: [] };
    for (const tk of ['t1', 't2', 't3']) {
      let arr = fleet.integrity[type][tk] || [];
      const n = fleet.composition[type]?.[tk] || 0;
      arr = arr.slice().sort((a, b) => b - a);           // les plus abîmés partent en premier quand l'effectif baisse
      while (arr.length > n) arr.pop();
      while (arr.length < n) arr.push(100);
      fleet.integrity[type][tk] = arr;
    }
  }
}
function shipEfficiency(hp) { return INTEGRITY.EFF_FLOOR + (1 - INTEGRITY.EFF_FLOOR) * Math.max(0, Math.min(100, hp)) / 100; }
// facteur d'attaque orbitale dû aux avaries (pondéré par l'ATK de chaque vaisseau)
function fleetIntegrityEfficiency(fleet) {
  syncFleetIntegrity(fleet);
  let full = 0, eff = 0;
  for (const type of ['fregate', 'cuirasse']) for (let t = 1; t <= 3; t++) {
    const atk = SHIP_TIERS[type]?.[t]?.atk || 0;
    for (const hp of fleet.integrity[type]['t' + t]) { full += atk; eff += atk * shipEfficiency(hp); }
  }
  return full > 0 ? eff / full : 1;
}
function fleetDamageSummary(fleet) {
  syncFleetIntegrity(fleet);
  let ships = 0, damaged = 0, sum = 0, missing = {};
  for (const type of SHIP_TYPES_ALL) for (let t = 1; t <= 3; t++) for (const hp of fleet.integrity[type]['t' + t]) {
    ships++; sum += hp;
    if (hp < 100) { damaged++; missing[type + t] = (missing[type + t] || 0) + (100 - hp); }
  }
  return { ships, damaged, avg: ships ? Math.round(sum / ships) : 100, missing };
}
function fleetRepairQuote(fleet) {
  const s = fleetDamageSummary(fleet);
  let metal = 0, sec = 0;
  const yard = INTEGRITY.YARD_SPEED[getShipyardTier() || 1] || 1;
  for (const type of SHIP_TYPES_ALL) for (let t = 1; t <= 3; t++) {
    const pts = s.missing[type + t] || 0;
    if (!pts) continue;
    metal += pts / 100 * (SHIP_TIERS[type]?.[t]?.cost?.metal || 0) * INTEGRITY.REPAIR_METAL_PCT;
    sec += pts * INTEGRITY.REPAIR_SEC_PER_PT[type] * INTEGRITY.TIER_TIME[t];
  }
  return { metal: Math.ceil(metal), sec: Math.ceil(sec * yard), damaged: s.damaged, avg: s.avg };
}
function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : (m ? `${m} min ${String(s).padStart(2, '0')}` : `${s} s`);
}
// avaries après un combat : les survivants des types engagés prennent des dégâts (même en victoire)
function applyIntegrityDamage(fleet, result) {
  syncFleetIntegrity(fleet);
  const p1 = result.phases && result.phases.phase1;
  if (!p1) return;
  const base = Math.min(90, 6 + (p1.lossPct || 0) * 110 + (p1.closeness || 0) * 20);   // intensité du combat (en points) ; PATCH_1910_COMBAT_SERRE : + serrage
  let hit = 0, wrecked = 0, dmgSum = 0;
  for (const type of ['fregate', 'cuirasse']) for (const tk of ['t1', 't2', 't3']) {
    const arr = fleet.integrity[type][tk];
    const keep = [];
    for (const hp of arr) {
      const d = Math.round(base * (0.4 + Math.random() * 1.1) * (type === 'cuirasse' ? 0.7 : 1));   // le cuirassé encaisse mieux
      const nhp = hp - d;
      if (nhp <= 0) {                                                // avarie fatale : vaisseau perdu
        wrecked++;
        fleet.composition[type][tk] = Math.max(0, fleet.composition[type][tk] - 1);
        loseShips(type, tk, 1);
        result.finalLosses.ships[type][tk] = (result.finalLosses.ships[type][tk] || 0) + 1;
      } else { keep.push(nhp); if (d > 0) { hit++; dmgSum += d; } }
    }
    fleet.integrity[type][tk] = keep;
  }
  result.integrity = { hit, wrecked, avgDmg: hit ? Math.round(dmgSum / hit) : 0, avgAfter: fleetDamageSummary(fleet).avg };
}
function startFleetRepair(fleetId) {
  const fleet = G.fleet.prepared.find(f => f.id === fleetId);
  if (!fleet) return;
  if ((fleet.status || 'prepared') !== 'prepared') { toast('Rappelle d\'abord la flotte au sol'); return; }
  if (!getShipyardTier()) { toast('Il faut un chantier orbital pour réparer'); return; }
  if (fleet.repair) return;
  const q = fleetRepairQuote(fleet);
  if (!q.damaged) { toast('Aucune avarie'); return; }
  if ((G.res.metal?.v || 0) < q.metal) { toast(`Métal insuffisant (${fmt(q.metal)} requis)`); return; }
  G.res.metal.v -= q.metal;
  fleet.repair = { startedAt: Date.now(), endsAt: Date.now() + q.sec * 1000, metal: q.metal };
  if (typeof saveGame === 'function') saveGame();
  toast(`Réparation lancée — ${fmtDuration(q.sec)}`);
  refreshCurrentScreen();
}
function tickFleetRepairs() {
  if (typeof G === 'undefined' || !G.fleet || !G.fleet.prepared) return;
  let done = false;
  for (const f of G.fleet.prepared) {
    if (f.repair && Date.now() >= f.repair.endsAt) {
      syncFleetIntegrity(f);
      for (const type of SHIP_TYPES_ALL) for (const tk of ['t1', 't2', 't3']) f.integrity[type][tk] = f.integrity[type][tk].map(() => 100);
      delete f.repair; done = true;
      toast(`${f.name} : coques réparées`);
    }
  }
  if (done) { if (typeof saveGame === 'function') saveGame(); if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); }
  // compte à rebours affiché sur la fiche
  const el = document.getElementById('fd-repair-timer');
  if (el && el.dataset.ends) el.textContent = fmtDuration((+el.dataset.ends - Date.now()) / 1000);
}
// carte « Coques » de la fiche flotte (au sol : réparation ; en orbite : état)
function renderFleetIntegrityCard(fleet) {
  const s = fleetDamageSummary(fleet);
  if (!s.ships) return '';
  const status = fleet.status || 'prepared';
  const bar = (v) => `<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin:6px 0 2px"><div style="height:100%;width:${v}%;background:${v > 66 ? 'var(--green)' : v > 33 ? 'var(--amber)' : 'var(--red)'}"></div></div>`;
  let body = `<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--mut);letter-spacing:.12em;text-transform:uppercase">Intégrité moyenne</span><b style="font-family:var(--font-mono,monospace)">${s.avg} %</b></div>${bar(s.avg)}
    <div style="font-size:10px;color:var(--mut);margin-top:4px">${s.damaged ? `${s.damaged} vaisseau${s.damaged > 1 ? 'x' : ''} endommagé${s.damaged > 1 ? 's' : ''} · efficacité au combat ${Math.round(fleetIntegrityEfficiency(fleet) * 100)} %` : 'Aucune avarie'}</div>`;
  if (fleet.repair) {
    body += `<div style="margin-top:10px;font-size:11px;color:var(--amber)">Réparation au chantier · <span id="fd-repair-timer" data-ends="${fleet.repair.endsAt}">${fmtDuration((fleet.repair.endsAt - Date.now()) / 1000)}</span></div>`;
  } else if (s.damaged && status === 'prepared') {
    const q = fleetRepairQuote(fleet);
    body += `<button onclick="startFleetRepair('${fleet.id}')" style="margin-top:10px;width:100%;padding:11px;border-radius:9px;border:1px solid rgba(255,192,96,.45);background:rgba(60,40,10,.5);color:var(--amber);font-size:11px;letter-spacing:.14em;text-transform:uppercase">Réparer · ${fmt(q.metal)} métal · ${fmtDuration(q.sec)}</button>`;
  } else if (s.damaged && status === 'deployed') {
    body += `<div style="margin-top:8px;font-size:10px;color:var(--mut)">Rappelle la flotte au sol pour la réparer au chantier.</div>`;
  }
  return `<div class="section-label">Coques</div><div class="dash-section-card" id="fleet-detail-integrity" style="margin:0 16px 14px">${body}</div>`;
}

function resolveCombat(fleet, target) {
  if (!fleet || !target) return null;

  // Copies de travail (on ne mute pas la flotte tant que tout n'est pas calculé)
  const composition = JSON.parse(JSON.stringify(fleet.composition));
  const soldiers = { ...(fleet.soldiers || { garde: 0, lourd: 0 }) };
  const heroes = JSON.parse(JSON.stringify(fleet.heroes || {}));

  const result = {
    phases: {},
    finalLosses: {
      ships: { tanker: { t1: 0, t2: 0, t3: 0 }, fregate: { t1: 0, t2: 0, t3: 0 }, cuirasse: { t1: 0, t2: 0, t3: 0 } },
      shipsRecovered: { tanker: { t1: 0, t2: 0, t3: 0 }, fregate: { t1: 0, t2: 0, t3: 0 }, cuirasse: { t1: 0, t2: 0, t3: 0 } },
      soldiers: { garde: 0, lourd: 0 },
      heroesDead: [],
    },
    loot: { metal: 0, energie: 0, cristal: 0 },
    heroic: false,
    outcome: 'defeat', // Calculé à la fin
  };

  // ═══ PHASE 1 — BATAILLE ORBITALE ═══
  const atkOrbital = computeFleetOrbitalAttack(composition) * fleetIntegrityEfficiency(fleet)   // avaries : efficacité dégressive
    + premiumFleetAttack(fleet);   // BLACKMARKET : vaisseaux d'exception (jamais avariés)
  const defOrbital = target.defense || 0;
  const atkEffective = atkOrbital * combatRand(COMBAT_CONSTS.RAND_MIN, COMBAT_CONSTS.RAND_MAX);
  const defEffective = defOrbital * combatRand(COMBAT_CONSTS.RAND_MIN, COMBAT_CONSTS.RAND_MAX);

  const phase1Won = defOrbital <= 0 || atkEffective > defEffective;
  if (Array.isArray(fleet.premium) && fleet.premium.length) result.premiumDown = !phase1Won;   // BLACKMARKET : jamais détruits, mis hors service

  // Compter les vaisseaux orbitaux engagés (frégates + cuirassés)
  const orbitalEngaged = {
    fregate: countShipsByType(composition, 'fregate'),
    cuirasse: countShipsByType(composition, 'cuirasse'),
  };

  // PASSE 3.4-c FIX : moduler les pertes selon la facilité du combat
  // Ratio = atk/def (combat plus facile = pertes plus faibles)
  // ratio > 5    → diviseur 2.5 (trivial, pertes très basses)
  // ratio > 2.5  → diviseur 1.8 (combat dominé)
  // ratio > 1.3  → diviseur 1.3 (victoire confortable)
  // ratio normal → pertes nominales
  // Calculé sur les valeurs EFFECTIVES (avec RNG) pour cohérence narrative
  let lossPct, closeness = 0;
  if (phase1Won) {
    const ratio = defEffective > 0 ? atkEffective / defEffective : 999;
    let divisor = 1;
    if (ratio > 5)        divisor = 2.5;
    else if (ratio > 2.5) divisor = 1.8;
    else if (ratio > 1.3) divisor = 1.3;
    lossPct = combatRand(COMBAT_CONSTS.PHASE1_VICTORY_LOSS_MIN, COMBAT_CONSTS.PHASE1_VICTORY_LOSS_MAX) / divisor;
    // PATCH_1910_COMBAT_SERRE : victoire serrée = victoire ruineuse
    closeness = Math.max(0, Math.min(1, (COMBAT_CONSTS.CLOSE_RATIO - ratio) / (COMBAT_CONSTS.CLOSE_RATIO - 1)));
    if (closeness > 0) lossPct = lossPct * (1 - closeness) + combatRand(COMBAT_CONSTS.CLOSE_P1_LOSS[0], COMBAT_CONSTS.CLOSE_P1_LOSS[1]) * closeness;
  } else {
    // Symétrique côté défaite : plus tu es écrasé, plus tu perds
    const ratio = atkEffective > 0 ? defEffective / atkEffective : 999;
    let multiplier = 1;
    if (ratio > 3)        multiplier = 1.3;  // défaite massive
    else if (ratio > 1.5) multiplier = 1.1;  // défaite nette
    lossPct = Math.min(0.95, combatRand(COMBAT_CONSTS.PHASE1_DEFEAT_LOSS_MIN, COMBAT_CONSTS.PHASE1_DEFEAT_LOSS_MAX) * multiplier);
  }

  // Distribuer les pertes sur frégates puis cuirassés (priorité aux frégates qui sont plus fragiles)
  for (const type of ['fregate', 'cuirasse']) {
    const totalEngaged = orbitalEngaged[type];
    if (totalEngaged === 0) continue;
    const toLose = Math.floor(totalEngaged * lossPct);
    if (toLose === 0) continue;
    const { lost } = distributeShipLosses(composition[type], toLose);
    // Pour chaque tier perdu, appliquer recovery
    for (const tier of ['t1', 't2', 't3']) {
      if (lost[tier] > 0) {
        const { destroyed, recovered } = applyShipRecovery(lost[tier], type, closeness);
        result.finalLosses.ships[type][tier] = destroyed;
        result.finalLosses.shipsRecovered[type][tier] = recovered;
      }
    }
  }

  const tankerLossPct = closeness > 0 ? combatRand(COMBAT_CONSTS.CLOSE_TANKER_LOSS[0], COMBAT_CONSTS.CLOSE_TANKER_LOSS[1]) * closeness : 0;
  const tankersEngaged = countShipsByType(composition, 'tanker');
  if (tankerLossPct > 0 && tankersEngaged > 0) {
    const toLoseTk = Math.floor(tankersEngaged * tankerLossPct);
    if (toLoseTk > 0) {
      const { lost } = distributeShipLosses(composition.tanker, toLoseTk);
      for (const tier of ['t1', 't2', 't3']) {
        if (lost[tier] > 0) {
          const { destroyed, recovered } = applyShipRecovery(lost[tier], 'tanker', closeness);
          result.finalLosses.ships.tanker[tier] = destroyed;
          result.finalLosses.shipsRecovered.tanker[tier] = recovered;
        }
      }
    }
  }

  // Stocker la phase 1
  result.phases.phase1 = {
    won: phase1Won,
    atkBase: atkOrbital,
    defBase: defOrbital,
    atkEffective: Math.round(atkEffective),
    defEffective: Math.round(defEffective),
    lossPct,
    closeness: Math.round(closeness * 100) / 100,
    tankerLossPct,
    engaged: orbitalEngaged,
  };

  // Si Phase 1 perdue → fin de la mission
  if (!phase1Won) {
    result.outcome = lossPct > 0.6 ? 'massacre' : 'defeat';
    // Tuer les héros si tout leur type est anéanti
    _killHeroesIfAnnihilated(composition, heroes, result, soldiers, fleet.composition);
    return result;
  }

  // ═══ PHASE 2 — DÉBARQUEMENT ═══
  const totalSoldiers = (soldiers.garde || 0) + (soldiers.lourd || 0);
  // Effet du débarquement sur le pillage : sol tenu ×1.2, débarquement repoussé ×0.6 (pillage orbital seul)
  let groundLootFactor = 1;
  let groundLost = false;

  if (totalSoldiers > 0) {
    const atkSoldiers = computeSoldierAttack(soldiers);
    const defGarrison = target.garrison || 0;
    const atkSoldEff = atkSoldiers * combatRand(COMBAT_CONSTS.RAND_MIN, COMBAT_CONSTS.RAND_MAX);
    const defGarEff = defGarrison * combatRand(COMBAT_CONSTS.RAND_MIN, COMBAT_CONSTS.RAND_MAX);

    const phase2Won = atkSoldEff > defGarEff;

    // PASSE 3.4-c FIX : moduler phase2LossPct selon le ratio (idem Phase 1)
    let phase2LossPct;
    if (phase2Won) {
      const ratio = defGarEff > 0 ? atkSoldEff / defGarEff : 999;
      let divisor = 1;
      if (ratio > 5)        divisor = 2.5;
      else if (ratio > 2.5) divisor = 1.8;
      else if (ratio > 1.3) divisor = 1.3;
      phase2LossPct = combatRand(COMBAT_CONSTS.PHASE2_VICTORY_LOSS_MIN, COMBAT_CONSTS.PHASE2_VICTORY_LOSS_MAX) / divisor;
      const c2 = Math.max(0, Math.min(1, (COMBAT_CONSTS.CLOSE_RATIO - ratio) / (COMBAT_CONSTS.CLOSE_RATIO - 1)));   // PATCH_1910_COMBAT_SERRE
      if (c2 > 0) phase2LossPct = phase2LossPct * (1 - c2) + combatRand(COMBAT_CONSTS.CLOSE_P2_LOSS[0], COMBAT_CONSTS.CLOSE_P2_LOSS[1]) * c2;
    } else {
      const ratio = atkSoldEff > 0 ? defGarEff / atkSoldEff : 999;
      let multiplier = 1;
      if (ratio > 3)        multiplier = 1.3;
      else if (ratio > 1.5) multiplier = 1.1;
      phase2LossPct = Math.min(0.98, combatRand(COMBAT_CONSTS.PHASE2_DEFEAT_LOSS_MIN, COMBAT_CONSTS.PHASE2_DEFEAT_LOSS_MAX) * multiplier);
    }

    const soldierLoss = {
      garde: Math.floor((soldiers.garde || 0) * phase2LossPct),
      lourd: Math.floor((soldiers.lourd || 0) * phase2LossPct),
    };

    result.finalLosses.soldiers = soldierLoss;
    soldiers.garde -= soldierLoss.garde;
    soldiers.lourd -= soldierLoss.lourd;

    result.phases.phase2 = {
      won: phase2Won,
      atkBase: atkSoldiers,
      defBase: defGarrison,
      atkEffective: Math.round(atkSoldEff),
      defEffective: Math.round(defGarEff),
      lossPct: phase2LossPct,
      engaged: { garde: soldiers.garde + soldierLoss.garde, lourd: soldiers.lourd + soldierLoss.lourd },
    };

    if (!phase2Won) {
      // Phase 2 perdue → les tankers pillent quand même depuis l'orbite, moins bien
      groundLost = true;
      groundLootFactor = COMBAT_CONSTS.GROUND_LOST_LOOT || 0.6;
    } else {
      groundLootFactor = COMBAT_CONSTS.GROUND_WON_LOOT || 1.2;
    }
  }
  // Si pas de soldats, on saute Phase 2 et on passe à Phase 3

  // ═══ PHASE 3 — PILLAGE ═══
  const survivingTankers = composition.tanker;
  const totalSurvivingTankers = countShipsByType(composition, 'tanker');

  // BLACKMARKET (v33) : le Cuirassé de Héro a une petite cale (5 000) — raid éclair léger, jamais de soldats
  const premiumCargo = (Array.isArray(fleet.premium) ? fleet.premium : []).reduce((n, p) => n + (p && p.cat === 'sport' ? 5000 : 0), 0);
  if (totalSurvivingTankers > 0 || premiumCargo > 0) {
    const cargoCapacity = computeSurvivingCargo(survivingTankers) + premiumCargo;
    const pillagePct = Math.min(1, combatRand(COMBAT_CONSTS.PHASE3_LOOT_MIN, COMBAT_CONSTS.PHASE3_LOOT_MAX) * groundLootFactor);

    // Calculer le butin brut par ressource
    const lootBrut = {
      metal: Math.floor((target.resources?.metal || 0) * pillagePct),
      energie: Math.floor((target.resources?.energie || 0) * pillagePct),
      cristal: Math.floor((target.resources?.cristal || 0) * pillagePct),
    };

    // Plafonner au cargo disponible (somme totale)
    const totalLootBrut = lootBrut.metal + lootBrut.energie + lootBrut.cristal;
    const cargoUsed = Math.min(totalLootBrut, cargoCapacity);
    const cargoRatio = totalLootBrut > 0 ? cargoUsed / totalLootBrut : 0;

    result.loot = {
      metal: Math.floor(lootBrut.metal * cargoRatio),
      energie: Math.floor(lootBrut.energie * cargoRatio),
      cristal: Math.floor(lootBrut.cristal * cargoRatio),
    };

    // Combat héroïque : bonus ×1.5 si conditions remplies
    const isHeroic = _checkHeroicCombat(fleet, result);
    if (isHeroic) {
      result.heroic = true;
      result.loot.metal = Math.floor(result.loot.metal * COMBAT_CONSTS.PHASE3_HEROIC_BONUS);
      result.loot.energie = Math.floor(result.loot.energie * COMBAT_CONSTS.PHASE3_HEROIC_BONUS);
      result.loot.cristal = Math.floor(result.loot.cristal * COMBAT_CONSTS.PHASE3_HEROIC_BONUS);
    }

    result.phases.phase3 = {
      executed: true,
      cargoCapacity,
      cargoUsed: Math.floor(cargoUsed * (result.heroic ? COMBAT_CONSTS.PHASE3_HEROIC_BONUS : 1)),
      pillagePct,
      loot: { ...result.loot },
      heroic: isHeroic,
    };
  } else {
    // Pas de Tankers → pas de pillage (doctrine Z4 Option A)
    result.phases.phase3 = { executed: false, reason: 'no_tankers' };
  }

  // Calcul de l'outcome final
  // PASSE 3.4-c FIX V2 : combiner pertes ET ratio de force
  // Avec peu de vaisseaux engagés, les pertes sont discrètes (0 ou 33%), donc
  // l'outcome doit aussi regarder le ratio atk/def pour refléter la facilité.
  const totalShipsLost = _sumShipLosses(result.finalLosses.ships);
  const totalShipsEngaged = countShipsByType(fleet.composition, 'tanker')
    + countShipsByType(fleet.composition, 'fregate')
    + countShipsByType(fleet.composition, 'cuirasse');
  const lossRatio = totalShipsEngaged > 0 ? totalShipsLost / totalShipsEngaged : 0;
  const forceRatio = defOrbital > 0 ? atkOrbital / defOrbital : 999;

  // Logique : un combat où l'attaquant est 3x plus fort sera "victoire écrasante"
  // peu importe les pertes mineures. Un combat tendu (1.0-1.5x) où on perd
  // 30% sera "pyrrhic". Un combat dominé (2x) avec 30% de pertes sera "victory".
  if (result.heroic) {
    result.outcome = 'crushing_victory';
  } else if (lossRatio >= 0.45) {
    // Pertes très lourdes même si gagné → pyrrhic (toujours)
    result.outcome = 'pyrrhic';
  } else if (forceRatio >= 3) {
    // Combat très dominé : écrasante si pertes < 20%, victory sinon
    result.outcome = lossRatio < 0.20 ? 'crushing_victory' : 'victory';
  } else if (forceRatio >= 1.8) {
    // Combat dominé : écrasante si 0 perte, victory si < 25%, pyrrhic sinon
    if (lossRatio === 0)         result.outcome = 'crushing_victory';
    else if (lossRatio < 0.25)   result.outcome = 'victory';
    else                          result.outcome = 'pyrrhic';
  } else if (forceRatio >= 1.2) {
    // Victoire confortable : victory généralement, pyrrhic si pertes
    if (lossRatio < 0.15)        result.outcome = 'victory';
    else                          result.outcome = 'pyrrhic';
  } else {
    // Combat serré : pyrrhic par défaut
    result.outcome = 'pyrrhic';
  }

  // Débarquement repoussé : jamais mieux qu'une victoire à la Pyrrhus
  if (groundLost) result.outcome = 'pyrrhic';

  // Tuer les héros si leur type est anéanti
  _killHeroesIfAnnihilated(composition, heroes, result, soldiers, fleet.composition);

  return result;
}

// Helper interne : somme totale des pertes de vaisseaux
function _sumShipLosses(shipsLost) {
  let total = 0;
  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    for (const tier of ['t1', 't2', 't3']) {
      total += shipsLost[type]?.[tier] || 0;
    }
  }
  return total;
}

// Helper interne : vérifie les conditions du Combat héroïque
function _checkHeroicCombat(fleet, result) {
  const lossDef = result.finalLosses.ships;

  // Aucun Tanker perdu (engagés vs détruits non récupérés)
  const tankersEngaged = countShipsByType(fleet.composition, 'tanker');
  const tankersLost = (lossDef.tanker.t1 || 0) + (lossDef.tanker.t2 || 0) + (lossDef.tanker.t3 || 0);
  if (tankersEngaged > 0 && tankersLost > 0) return false;

  // Aucun Cuirassé perdu (récupérables OK, mais pas détruits)
  const cuirassesEngaged = countShipsByType(fleet.composition, 'cuirasse');
  const cuirassesLost = (lossDef.cuirasse.t1 || 0) + (lossDef.cuirasse.t2 || 0) + (lossDef.cuirasse.t3 || 0);
  if (cuirassesEngaged > 0 && cuirassesLost > 0) return false;

  // Pertes soldats ≤ 30%
  const soldiersEngaged = (fleet.soldiers?.garde || 0) + (fleet.soldiers?.lourd || 0);
  if (soldiersEngaged > 0) {
    const soldiersLost = (result.finalLosses.soldiers.garde || 0) + (result.finalLosses.soldiers.lourd || 0);
    const lossRatio = soldiersLost / soldiersEngaged;
    if (lossRatio > COMBAT_CONSTS.HEROIC.MAX_SOLDIER_LOSS_PCT) return false;
  }

  return true;
}

// Helper interne : marque les héros morts si leur type est anéanti
function _killHeroesIfAnnihilated(survivingComposition, heroes, result, survivingSoldiers, initialComposition) {
  for (const type of ['cuirasse', 'fregate', 'tanker']) {
    if (initialComposition && countShipsByType(initialComposition, type) === 0) continue;   // type absent : héros au repos
    const survivingCount = countShipsByType(survivingComposition, type);
    const hero = heroes[type];
    if (hero && !hero.dead && survivingCount === 0) {
      // Le type entier a été anéanti → le héros meurt
      result.finalLosses.heroesDead.push({
        name: hero.name,
        role: type,
        roleLabel: HERO_ROLES[type]?.label || type,
      });
    }
  }
}

// Pioche aléatoire dans un tableau
function _pickNarrative(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Récupère le profil narratif d'une cible (utilisé dans templates)
function _getTargetProfile(targetName, targetProfile) {
  // Adapte le ton selon le profil
  if (targetProfile && targetProfile.includes('faible')) return 'weak';
  if (targetProfile && targetProfile.includes('Raider')) return 'raider';
  if (targetProfile && (targetProfile.includes('Marchand') || targetProfile.includes('fortifié'))) return 'fortified';
  return 'unknown';
}

// ─── GÉNÉRATEUR PRINCIPAL ───
function generateCombatNarrative(report) {
  if (!report || !report.combat) return null;

  const c = report.combat;
  const ctx = {
    targetName: report.targetName || 'la cible',
    targetProfile: report.targetProfile || '',
    heroCuirasse: report.heroesBefore?.cuirasse,
    heroFregate: report.heroesBefore?.fregate,
    heroTanker: report.heroesBefore?.tanker,
    deadHeroes: c.finalLosses.heroesDead || [],
    phase1LossPct: c.phases.phase1?.lossPct || 0,
    phase2LossPct: c.phases.phase2?.lossPct || 0,
  };

  const result = {
    phase1: null,
    phase2: null,
    phase3: null,
  };

  // ─── PHASE 1 — Toujours générée ───
  // Choisir la catégorie selon l'outcome
  let phase1Category;
  if (c.outcome === 'crushing_victory') phase1Category = 'crushing_victory';
  else if (c.outcome === 'victory') phase1Category = 'victory';
  else if (c.outcome === 'pyrrhic') phase1Category = 'pyrrhic';
  else if (c.outcome === 'massacre') phase1Category = 'massacre';
  else phase1Category = 'defeat';

  // Si l'outcome est pyrrhic mais Phase 1 a été perdue, c'est plutôt defeat
  if (!c.phases.phase1?.won) {
    phase1Category = c.outcome === 'massacre' ? 'massacre' : 'defeat';
  }

  const phase1Templates = PHASE1_TEMPLATES[phase1Category] || PHASE1_TEMPLATES.victory;
  const tmpl = _pickNarrative(phase1Templates);
  result.phase1 = tmpl(ctx);

  // ─── PHASE 2 — Seulement si exécutée ───
  if (c.phases.phase2) {
    const phase2Category = c.phases.phase2.won ? 'victory' : 'defeat';
    const phase2Templates = PHASE2_TEMPLATES[phase2Category];
    if (phase2Templates) {
      const tmpl2 = _pickNarrative(phase2Templates);
      result.phase2 = tmpl2(ctx);
    }
  }

  // ─── PHASE 3 — Seulement si exécutée ───
  if (c.phases.phase3?.executed) {
    const phase3Category = c.phases.phase3.heroic ? 'heroic' : 'standard';
    const phase3Templates = PHASE3_TEMPLATES[phase3Category];
    if (phase3Templates) {
      const tmpl3 = _pickNarrative(phase3Templates);
      result.phase3 = tmpl3(ctx);
    }
  }

  return result;
}

// Pioche un nom ouvrier sans doublon dans la mémoire récente (10 derniers rapports)
function pickWorkerName(family) {
  const poolFn = AMBIENT_POOLS_BY_FAMILY[family];
  const pool = poolFn ? poolFn() : WORKER_NAMES_MINE;
  const recent = (G.ambientReports || []).slice(0, 10);
  const usedNames = new Set();
  recent.forEach(r => {
    pool.forEach(name => { if (r.narrative && r.narrative.includes(name)) usedNames.add(name); });
  });
  const available = pool.filter(n => !usedNames.has(n));
  if (available.length === 0) return pool[Math.floor(Math.random() * pool.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// PASSE 3.5-narrative bis : crossover — pioche un nom dans une AUTRE famille
// Utilisé par certains templates pour citer un personnage d'ailleurs (~5% des cas)
function pickCrossoverName(currentFamily) {
  const families = ['mine', 'centrale', 'labo', 'caserne', 'shipyard']
    .filter(f => f !== currentFamily);
  const otherFamily = families[Math.floor(Math.random() * families.length)];
  return {
    name: pickWorkerName(otherFamily),
    family: otherFamily,
    // Label court pour mention narrative
    label: ({
      mine: 'mineur',
      centrale: 'technicien de centrale',
      labo: 'chercheur',
      caserne: 'soldat',
      shipyard: 'soudeur du chantier',
    })[otherFamily] || 'travailleur',
  };
}

// Construit le contexte pour un template
// family = 'mine' | 'centrale' | 'labo' | 'caserne' | 'shipyard'
function buildAmbientContext(family) {
  // Lieux spécifiques par famille (les pools mine et centrale existent déjà)
  let location = '';
  if (family === 'mine') {
    location = _pickNarrative(MINE_LOCATIONS);
  } else if (family === 'centrale') {
    location = _pickNarrative(PLANT_LOCATIONS);
  } else if (family === 'labo') {
    location = _pickNarrative(['le laboratoire 3', 'la salle de cristallographie', 'la bibliothèque',
      'l\'archive des cahiers', 'le séminaire B', 'la salle blanche', 'le bureau du directeur']);
  } else if (family === 'caserne') {
    location = _pickNarrative(['le dortoir D', 'le couloir des casiers', 'la salle de tir intérieure',
      'le bureau du chef de section', 'la cantine', 'le terrain d\'entraînement', 'l\'infirmerie']);
  } else if (family === 'shipyard') {
    location = _pickNarrative(['la cale 3', 'le quai d\'assemblage', 'le hangar de soudure',
      'le couloir technique', 'le pont supérieur de la frégate en cours', 'le bureau des plans']);
  }

  return {
    family,
    workerName: pickWorkerName(family),
    workerAnciennete: _pickNarrative(ANCIENNETE),
    time: _pickNarrative(NARRATIVE_TIMES),
    location,
  };
}

// Génère un rapport ambient pour un bâtiment donné
// Retourne le rapport ou null si le tirage 1/20 n'a pas passé
// Si force=true, contourne le tirage (utilisé par le cheat)
function maybeGenerateAmbientReport(parcel, force) {
  if (!parcel || !parcel.building) return null;

  // Mapping building type (string key) → famille narrative
  const family = _getAmbientFamily(parcel.building);
  if (!family) return null; // Pas tous les types de bâtiments

  // Tirage 1/20 (sauf si force)
  if (!force && Math.random() >= 1/20) return null;

  // Pioche d'un template (mapping famille → banque)
  const templates = AMBIENT_TEMPLATES_BY_FAMILY[family] || AMBIENT_TEMPLATES_MINE;
  const tmpl = templates[Math.floor(Math.random() * templates.length)];

  // Construit le contexte
  const ctx = buildAmbientContext(family);

  // Génère le rapport via le template
  const tmplResult = tmpl(ctx);

  // Production réelle du cycle (approximation : tier × valeur de base)
  const production = _estimateProduction(parcel);

  const report = {
    id: 'amb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    parcelIdx: parcel.idx,                         // PASSE 3.5 : utilise parcel.idx
    buildingType: parcel.building,                  // String key ('mine', 'centrale', ...)
    buildingFamily: family,
    buildingName: parcel.n || BUILDINGS[parcel.building]?.name || parcel.building,
    createdAt: Date.now(),
    read: false,
    productionValue: production,
    rendement: tmplResult.rendement || 90,
    incident: tmplResult.incident || 'aucun',
    narrative: tmplResult.narrative,
  };

  // Storage
  if (!Array.isArray(G.ambientReports)) G.ambientReports = [];
  G.ambientReports.unshift(report);
  // Limiter à 50 rapports totaux
  if (G.ambientReports.length > 50) G.ambientReports.length = 50;

  return report;
}

// Détermine la famille narrative d'un bâtiment
function _getAmbientFamily(buildingKey) {
  if (!buildingKey) return null;
  // Mines : tout ce qui extrait du métal
  if (buildingKey === 'mine') return 'mine';
  // Centrales : tout ce qui produit de l'énergie
  if (buildingKey === 'centrale') return 'centrale';
  // PASSE 3.5-narrative bis : labos, casernes, chantiers
  if (buildingKey === 'labo') return 'labo';
  if (buildingKey === 'caserne') return 'caserne';
  if (buildingKey === 'shipyard') return 'shipyard';
  // Bâtiments sans templates (turret, silos) : pas de narration ambient
  return null;
}

// Estimation de la production d'une parcelle pour le rapport (approximative)
function _estimateProduction(parcel) {
  if (!parcel) return 0;
  // Lit la production du tier courant si disponible
  const buildingKey = parcel.building;
  const tier = parcel.lvl || 1;
  const tierData = BUILDING_TIERS[buildingKey]?.[tier];
  if (tierData?.prod) {
    const firstRes = Object.values(tierData.prod)[0] || 0;
    // Convertit /h en valeur de cycle (cycle ≈ 10s, donc /360 du débit horaire)
    // Mais on va donner un nombre lisible pour le rapport — multiplie pour l'effet
    return Math.floor(firstRes * (0.8 + Math.random() * 0.5));
  }
  return Math.floor(50 + Math.random() * 100);
}

// Retourne les rapports ambient pour une parcelle donnée (par idx)
function getAmbientReportsForParcel(parcelIdx) {
  if (!Array.isArray(G.ambientReports)) return [];
  return G.ambientReports.filter(r => r.parcelIdx === parcelIdx);
}

// Compte les rapports non-lus pour une parcelle
function getUnreadAmbientCount(parcelIdx) {
  return getAmbientReportsForParcel(parcelIdx).filter(r => !r.read).length;
}

// Marque un rapport comme lu
function markAmbientReportAsRead(reportId) {
  const r = (G.ambientReports || []).find(r => r.id === reportId);
  if (r) r.read = true;
}

// ─── PASSE 3.5-narrative bis : format adaptatif par famille ───
// Retourne { header, centralFields(r), footer(r) } pour rendre un rapport
function _getAmbientFormat(family) {
  // Helper interne : ligne de production standard
  const prodLine = (label, color, value, unit) => `
    <div><span style="color:var(--mut)">${label.padEnd(11)}:</span> <span style="color:${color}">+${value} ${unit}</span></div>
  `;
  // Rendement coloré
  const rendementLine = (rdt) => {
    if (typeof rdt === 'number') {
      const color = rdt >= 95 ? 'var(--green)' : 'var(--mut)';
      return `<div><span style="color:var(--mut)">Rendement  :</span> <span style="color:${color}">${rdt}%</span></div>`;
    }
    return `<div><span style="color:var(--mut)">Statut     :</span> <span style="color:var(--mut)">${rdt}</span></div>`;
  };

  switch (family) {
    case 'mine':
      return {
        header: 'RAPPORT D\'EXTRACTION',
        centralFields: (r) => prodLine('Production', 'var(--amber)', r.productionValue, 'métal') + rendementLine(r.rendement),
        footer: (r) => typeof r.rendement === 'number' ? `Production maintenue à ${r.rendement}%` : 'Production maintenue',
      };
    case 'centrale':
      return {
        header: 'BULLETIN TECHNIQUE',
        centralFields: (r) => prodLine('Production', 'var(--amber)', r.productionValue, 'énergie') + rendementLine(r.rendement),
        footer: (r) => typeof r.rendement === 'number' ? `Production maintenue à ${r.rendement}%` : 'Production maintenue',
      };
    case 'labo':
      return {
        header: 'NOTE DE SÉMINAIRE',
        centralFields: (r) => `
          <div><span style="color:var(--mut)">Recherche  :</span> <span style="color:var(--cyan)">${r.rendement || 'en cours'}</span></div>
          <div><span style="color:var(--mut)">Lignes act.:</span> <span style="color:#e6f0ff">${(r.productionValue || 3)} équipes</span></div>
        `,
        footer: () => 'Aucune décision administrative',
      };
    case 'caserne':
      return {
        header: 'JOURNAL DE GARNISON',
        centralFields: (r) => {
          const moralColor = r.rendement === 'préoccupant' ? 'var(--red)'
            : r.rendement === 'correct' ? 'var(--amber)'
            : 'var(--green)';
          return `
            <div><span style="color:var(--mut)">Effectifs  :</span> <span style="color:#e6f0ff">${(r.productionValue || 240)}</span></div>
            <div><span style="color:var(--mut)">Moral      :</span> <span style="color:${moralColor}">${r.rendement || 'correct'}</span></div>
          `;
        },
        footer: () => 'Sans incidence opérationnelle',
      };
    case 'shipyard':
      return {
        header: 'BULLETIN DE CHANTIER',
        centralFields: (r) => `
          <div><span style="color:var(--mut)">Coques     :</span> <span style="color:#e6f0ff">${Math.max(1, Math.floor((r.productionValue || 1) / 200))} en cours</span></div>
          <div><span style="color:var(--mut)">Statut     :</span> <span style="color:var(--amber)">${r.rendement || 'production maintenue'}</span></div>
        `,
        footer: (r) => (typeof r.rendement === 'string' && r.rendement.includes('livrée')) ? 'Coque livrée conforme' : 'Production maintenue',
      };
    default:
      return {
        header: 'RAPPORT',
        centralFields: (r) => `<div><span style="color:var(--mut)">Statut     :</span> <span style="color:#e6f0ff">${r.rendement || '—'}</span></div>`,
        footer: () => 'Sans incidence administrative',
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// END CONSTANTS Caldris MVP
// Structure G.legend ajoutée dans G state (chunk init).
// Fonctions runtime (drop, narrative, reveal, ui) dans chunk B/C.
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// PASSE 6 — CHUNK B : Drop logic & hooks tanker (Caldris MVP)
// Cf. docs Adrien + checkpoint END_PASSE_5
//
// Règle structurelle : un retour de tanker peut produire au plus UN drop
// narratif majeur. Si multiverseArchetype déjà set, on n'ajoute pas de
// drop Caldris (pour éviter la surcharge sémantique). Sinon, on tente.
//
// Sémantique du toast et de la narrative : on N'utilise JAMAIS les mots
// "Caldris" / "civilisation" / "fragment" tant que les seuils de
// révélation ne sont pas franchis. Le moteur dit : "Fragment archivé.
// Origine non classée. Similarités détectées." Le mystère, c'est l'âme.
// ═══════════════════════════════════════════════════════════════════════════

// ─── DROP — Décision et instanciation ───────────────────────────────────

// Décide si un drop legend a lieu sur ce retour de tanker, et de quel type.
// Retourne null ou { type: 'fragment'|'relic'|'coord_hint', scenarioId, payload }
function maybeGenerateLegendDrop(mission) {
  if (!mission || !mission.targetType) return null;
  // Mutex avec MULTIVERS_ARCHETYPES : si déjà un archetype, pas de Caldris
  // (sera vérifié au site d'appel via loot.multiverseArchetype)

  const dropCfg = LEGEND_DROP_TABLE[mission.targetType];
  if (!dropCfg) return null;

  // Roll de chance
  if (Math.random() * 100 >= dropCfg.chancePct) return null;

  // Sélectionner les scénarios éligibles pour ce sourceType
  const eligibleScenarios = Object.values(LEGEND_SCENARIOS).filter(s =>
    s.sourceTypes.includes(mission.targetType) || s.sourceTypes.includes('*')
  );
  if (eligibleScenarios.length === 0) return null;

  // Pioche un scénario (uniforme pour MVP — pondération par rarity en v0.2)
  const scenario = eligibleScenarios[Math.floor(Math.random() * eligibleScenarios.length)];

  // Pioche un type de drop (avec doublons dans possibleTypes pour pondérer)
  const dropType = dropCfg.possibleTypes[Math.floor(Math.random() * dropCfg.possibleTypes.length)];

  // Instancier selon type
  if (dropType === 'fragment') {
    const payload = instantiateFragmentFromScenario(scenario.id, mission);
    if (!payload) return null;
    return { type: 'fragment', scenarioId: scenario.id, payload };
  }
  if (dropType === 'relic') {
    const payload = instantiateRelicFromScenario(scenario.id, mission);
    // Fallback fragment si pas de relic pour ce scénario
    if (!payload) {
      const frag = instantiateFragmentFromScenario(scenario.id, mission);
      if (!frag) return null;
      return { type: 'fragment', scenarioId: scenario.id, payload: frag };
    }
    return { type: 'relic', scenarioId: scenario.id, payload };
  }
  if (dropType === 'coord_hint') {
    const payload = instantiateCoordHint(scenario.id, mission);
    // Fallback fragment si scenario n'a pas de canRevealCoord
    if (!payload) {
      const frag = instantiateFragmentFromScenario(scenario.id, mission);
      if (!frag) return null;
      return { type: 'fragment', scenarioId: scenario.id, payload: frag };
    }
    return { type: 'coord_hint', scenarioId: scenario.id, payload };
  }
  return null;
}

// Pioche une variante textuelle dans LEGEND_FRAGMENT_BANK pour ce scénario.
function instantiateFragmentFromScenario(scenarioId, mission) {
  const bank = LEGEND_FRAGMENT_BANK[scenarioId];
  if (!bank || bank.length === 0) return null;
  const scenario = LEGEND_SCENARIOS[scenarioId];
  if (!scenario) return null;

  // ── Anti-doublon : préférer une variante non-encore-indexée pour ce scénario.
  // Si toutes les variantes du scénario ont déjà été trouvées, on autorise un
  // doublon (la même rumeur revient — ça reste cohérent narrativement, et on
  // ne veut pas bloquer le drop quand on a déjà ratissé un scénario).
  const alreadyFoundTitles = new Set(
    (G.legend?.fragments || [])
      .filter(f => f.scenarioId === scenarioId)
      .map(f => f.title)
  );
  const freshVariants = bank.filter(v => !alreadyFoundTitles.has(v.title));
  const pool = freshVariants.length > 0 ? freshVariants : bank;
  const variant = pool[Math.floor(Math.random() * pool.length)];

  return {
    id: 'frag-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    civId: scenario.civilization,
    scenarioId,
    scenarioTitle: scenario.title,
    type: variant.type,
    title: variant.title,
    text: variant.text,
    reliability: variant.reliability,
    contradictionTags: variant.contradictionTags || scenario.contradictionTags || [],
    motif: variant.motif || scenario.motif || null,
    sourceType: mission?.targetType || 'unknown',
    sourceCoords: mission?.targetCoords || null,
    sourceTankerReportId: null, // sera défini après storeTankerReturnReport
    discoveredAt: Date.now(),
    read: false,
  };
}

// Pioche un objet témoin (relic) pour ce scénario.
// Règle d'unicité : un templateId ne peut tomber qu'une seule fois.
// Si toutes les relics d'un scénario sont déjà trouvées, retourne null
// → le caller fallback automatiquement sur un fragment.
function instantiateRelicFromScenario(scenarioId, mission) {
  // Liste des templateIds déjà trouvés (toutes civs/scénarios confondus)
  const alreadyFoundTemplates = new Set(
    (G.legend?.relics || []).map(r => r.templateId)
  );

  // Candidates filtrées par scénario + sourceType compatible + pas-encore-trouvé
  let candidates = Object.values(LEGEND_RELIC_BANK).filter(r =>
    r.scenarioId === scenarioId &&
    (r.sourceTypes || []).includes(mission?.targetType || '') &&
    !alreadyFoundTemplates.has(r.id)
  );

  // Si rien avec filtre sourceType : relax (mais toujours pas-encore-trouvé)
  if (candidates.length === 0) {
    candidates = Object.values(LEGEND_RELIC_BANK).filter(r =>
      r.scenarioId === scenarioId &&
      !alreadyFoundTemplates.has(r.id)
    );
  }

  // Si toujours rien (toutes les relics du scénario sont déjà prises) → null
  // → caller fera fallback sur instantiateFragmentFromScenario
  if (candidates.length === 0) return null;

  const tpl = candidates[Math.floor(Math.random() * candidates.length)];
  const scenario = LEGEND_SCENARIOS[scenarioId];
  return {
    id: 'relic-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    templateId: tpl.id,
    civId: tpl.civilization,
    scenarioId,
    scenarioTitle: scenario?.title || '',
    name: tpl.name,
    publicName: tpl.publicName,
    description: tpl.description,
    rarity: tpl.rarity,
    motif: tpl.motif || null,
    sourceType: mission?.targetType || 'unknown',
    sourceCoords: mission?.targetCoords || null,
    sourceTankerReportId: null,
    discoveredAt: Date.now(),
    read: false,
  };
}

// Fabrique un coord_hint partiel à partir du canRevealCoord du scénario.
// Exemple : canRevealCoord 'A-F-2290-??' → hint affiché 'A-F-2290-??'
// Le joueur peut compléter en envoyant une sonde Moyenne sur le système A-F-2290.
function instantiateCoordHint(scenarioId, mission) {
  const scenario = LEGEND_SCENARIOS[scenarioId];
  if (!scenario || !scenario.canRevealCoord) return null;
  // Si le hint pointe vers un lieu déjà découvert, on skip (pas redondant)
  const targetFixedAssetCoord = scenario.canRevealCoord.replace('-??', '');
  // Chercher un asset fixe dont coordHintPrefix matche
  const matchingAsset = Object.entries(LEGEND_FIXED_ASSETS).find(([coord, asset]) =>
    asset.coordHintPrefix && scenario.canRevealCoord.startsWith(asset.coordHintPrefix)
  );
  if (matchingAsset) {
    const [fullCoord, asset] = matchingAsset;
    // Skip si déjà découvert
    const already = (G.legend?.discoveredFixedAssets || []).find(d => d.coord === fullCoord);
    if (already) return null;
  }
  return {
    id: 'hint-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    civId: scenario.civilization,
    scenarioId,
    hint: scenario.canRevealCoord, // 'A-F-2290-??'
    targetFixedAssetCoord: matchingAsset ? matchingAsset[0] : null,
    requiredProbeTier: matchingAsset ? matchingAsset[1].requiredProbeTier : 'medium',
    sourceType: mission?.targetType || 'unknown',
    sourceCoords: mission?.targetCoords || null,
    sourceTankerReportId: null,
    resolved: false, // devient true quand sonde découvre le lieu fixe
    discoveredAt: Date.now(),
    read: false,
  };
}

// ─── APPLY — Pousse le drop dans G.legend, save, évalue reveal rules ────

function applyLegendDrop(drop, mission, sourceTankerReportId) {
  if (!drop || !drop.payload) return;
  if (!G.legend) G.legend = makeDefaultLegend();

  // Attacher l'ID du rapport tanker source (lien bidirectionnel pour Archives → Rapports)
  if (sourceTankerReportId) {
    drop.payload.sourceTankerReportId = sourceTankerReportId;
  }

  if (drop.type === 'fragment') {
    G.legend.fragments.unshift(drop.payload);
    // Increment motif counter de la civ correcte
    if (drop.payload.motif && drop.payload.civId) {
      const civ = G.legend.civilizations[drop.payload.civId];
      if (civ && civ.motifs && civ.motifs[drop.payload.motif]) {
        civ.motifs[drop.payload.motif].count += 1;
      }
    }
  } else if (drop.type === 'relic') {
    G.legend.relics.unshift(drop.payload);
    if (drop.payload.motif && drop.payload.civId) {
      const civ = G.legend.civilizations[drop.payload.civId];
      if (civ && civ.motifs && civ.motifs[drop.payload.motif]) {
        civ.motifs[drop.payload.motif].count += 1;
      }
    }
  } else if (drop.type === 'coord_hint') {
    // Évite les doublons sur le même hint
    const exists = G.legend.coordHints.find(h => h.hint === drop.payload.hint && !h.resolved);
    if (!exists) {
      G.legend.coordHints.unshift(drop.payload);
    }
  }

  // Marquer la civ comme vue récemment
  const civId = drop.payload.civId;
  if (civId && G.legend.civilizations[civId]) {
    G.legend.civilizations[civId].lastSeenAt = Date.now();
  }

  // Incrémente le badge (non-lus) si l'utilisateur n'a pas regardé Archives récemment
  G.legend.ui.badgeCount = (G.legend.ui.badgeCount || 0) + 1;

  saveLegend();
  evaluateAllRevealRules();
}

// ─── REVEAL RULES — Évalue et émet les messages de révélation ───────────
// Généralisé pour les 3 civs : Caldris, Lumen, Werath.
// Garde-fou : on conserve evaluateCaldrisRevealRules comme alias pour la
// rétro-compat avec les call sites pré-existants.

function evaluateAllRevealRules() {
  if (!G.legend) return;
  Object.entries(CIV_REVEAL_CONFIG).forEach(([civId, cfg]) => {
    const civ = G.legend.civilizations[civId];
    if (!civ) return;

    // Compteurs courants pour cette civ
    const fragmentsFound = G.legend.fragments.filter(f => f.civId === civId).length;
    const relicsFound = G.legend.relics.filter(r => r.civId === civId).length;
    const motifCount = civ.motifs?.[cfg.motifKey]?.count || 0;
    // Backward compat : exposer motifCount_47 pour les anciennes règles Caldris
    const motifCount_47 = civId === 'caldris' ? motifCount : 0;
    const hasTag = (tag) => {
      return G.legend.fragments.some(f => f.civId === civId && (f.contradictionTags || []).includes(tag)) ||
             G.legend.relics.some(r => r.civId === civId);
    };

    const stats = { fragmentsFound, relicsFound, motifCount, motifCount_47, hasTag };

    Object.entries(cfg.rules).forEach(([key, rule]) => {
      // Prefixer la clé avec la civ pour éviter les collisions
      const seenKey = civId + ':' + key;
      if (G.legend.seenRevealMessages.includes(seenKey)) return;
      if (!rule.test(stats)) return;
      // Déclenche
      G.legend.seenRevealMessages.push(seenKey);
      // Effet spécifique selon la règle
      if (key === 'revealCivName') {
        civ.revealed = true;
        if (civ.motifs?.[cfg.motifKey]) {
          civ.motifs[cfg.motifKey].discovered = true;
        }
      }
      if (key === 'revealMotif47' || key === 'revealMotifPaix' || key === 'revealMotifTenons' || key === 'revealMotifRetrait' || key === 'revealMotifOnYEtait') {
        if (civ.motifs?.[cfg.motifKey]) {
          civ.motifs[cfg.motifKey].discovered = true;
        }
      }
      // Toast si non silent et message présent
      if (!rule.silent && rule.message && typeof toast === 'function') {
        toast(rule.message);
      }
    });
  });
  saveLegend();
}

// Alias rétro-compat
function evaluateCaldrisRevealRules() {
  evaluateAllRevealRules();
}

// ─── NARRATIVE ENRICHMENT — Inserts dans le rapport tanker ──────────────

// Génère le bloc à coller à la fin de la narrative tanker quand un drop a eu lieu.
// Volontairement froid, administratif, sans mention de "Caldris" tant que pas révélé.
function legendDropToNarrativeBlock(drop) {
  if (!drop || !drop.payload) return '';
  const caldrisRevealed = G.legend?.civilizations?.caldris?.revealed;
  const motifRevealed = G.legend?.civilizations?.caldris?.motifs?.nous_etions_47?.discovered;

  // Header du bloc — sobre, monospace
  const sep = '\n\n────────────────────────────────────\n';

  // Identifier la civ du drop
  const dropCivId = drop.payload?.civId || 'caldris';
  const dropCiv = G.legend?.civilizations?.[dropCivId];
  const civRevealed = !!dropCiv?.revealed;
  const civNumberByid = { caldris: '001', lumen: '002', werath: '003', erebus: '004', brigandiers: '005' };
  const civNum = civNumberByid[dropCivId] || '???';
  const civNameUpper = (LEGEND_CIVILIZATIONS[dropCivId]?.revealedName) || dropCivId.toUpperCase();
  const civLabel = civRevealed ? `CIV-${civNum} · ${civNameUpper}` : 'Origine non classée';

  if (drop.type === 'fragment') {
    const p = drop.payload;
    const reliabilityPct = Math.round((p.reliability || 0) * 100);

    // Compter les similarités (autres fragments avec tags en commun)
    const similarCount = G.legend.fragments.filter(f =>
      f.civId === p.civId &&
      f.id !== p.id &&
      (f.contradictionTags || []).some(t => (p.contradictionTags || []).includes(t))
    ).length;

    let block = sep + 'FRAGMENT ARCHIVÉ' + sep;
    block += `\n${p.title}\n\n${p.text}\n`;
    block += `\nFiabilité estimée : ${reliabilityPct}%`;
    block += `\nOrigine : ${civLabel}`;
    if (similarCount > 0) {
      block += `\nSimilarités détectées avec ${similarCount} entrée${similarCount > 1 ? 's' : ''} ancienne${similarCount > 1 ? 's' : ''}.`;
    }
    block += '\n\n[Indexé dans les Archives du Vide]';
    return block;
  }

  if (drop.type === 'relic') {
    const p = drop.payload;
    const displayName = civRevealed ? p.name : p.publicName;
    let block = sep + 'OBJET TÉMOIN RÉCUPÉRÉ' + sep;
    block += `\n${displayName}\n\n${p.description}\n`;
    block += `\nRareté : ${p.rarity}`;
    block += `\nOrigine : ${civLabel}`;
    block += '\n\n[Indexé dans les Archives du Vide]';
    return block;
  }

  if (drop.type === 'coord_hint') {
    const p = drop.payload;
    let block = sep + 'COORDONNÉE PARTIELLE DÉTECTÉE' + sep;
    block += `\nFragment de données de navigation extrait.\nCoordonnée incomplète : ${p.hint}\n`;
    block += `\nUne sonde ${p.requiredProbeTier === 'medium' ? 'Moyenne' : 'Légère'} ciblée sur cette zone pourrait`;
    block += `\nrésoudre les chiffres manquants.`;
    block += '\n\n[Indexée dans les Archives du Vide]';
    return block;
  }

  return '';
}

// ─── HOOK — Découverte d'un lieu fixe via sonde Moyenne ─────────────────
// Appelée depuis le hook de retour de sonde quand la destination matche
// un coordHintPrefix d'un LEGEND_FIXED_ASSETS. Le branchement réel
// dans handleProbeReturn est fait dans le sub-chunk B2.

function maybeDiscoverFixedAsset(probeMission) {
  if (!probeMission) return null;
  // Le champ peut être destinationCoord (long-range) ou targetCoords (normal)
  const destCoord = probeMission.destinationCoord || probeMission.targetCoords;
  if (!destCoord) return null;
  // destCoord peut être au format 'A-F-2290-22' (spot) ou 'A-F-2290' (système)
  const destSystem = destCoord.split('-').slice(0, 3).join('-'); // 'A-F-2290'

  // Chercher un asset dont le système matche
  const match = Object.entries(LEGEND_FIXED_ASSETS).find(([fullCoord, asset]) => {
    if (!asset.coordHintPrefix) return false;
    return asset.coordHintPrefix === destSystem;
  });
  if (!match) return null;

  const [fullCoord, asset] = match;
  // Vérifier le tier de sonde requis
  const probeTier = probeMission.tier || 'light';
  const requiredTier = asset.requiredProbeTier || 'medium';
  const tierRank = { radar: 0, light: 1, medium: 2, stealth: 2 };
  if ((tierRank[probeTier] ?? 0) < (tierRank[requiredTier] ?? 2)) return null;

  // Vérifier qu'il y a un coordHint actif pour ce lieu
  const matchingHint = (G.legend?.coordHints || []).find(h =>
    !h.resolved && h.targetFixedAssetCoord === fullCoord
  );
  if (!matchingHint) return null; // pas de hint → pas de découverte (cohérence narrative)

  // Vérifier qu'il n'est pas déjà découvert
  const already = (G.legend?.discoveredFixedAssets || []).find(d => d.coord === fullCoord);
  if (already) return null;

  // Discover !
  G.legend.discoveredFixedAssets.unshift({
    coord: fullCoord,
    assetId: asset.id,
    civId: asset.civilization,
    discoveredAt: Date.now(),
    discoveredByProbe: probeMission.probeName || probeMission.id || 'sonde',
  });
  matchingHint.resolved = true;
  matchingHint.resolvedFixedAssetCoord = fullCoord;

  // Auto-générer plusieurs fragments des scénarios révélés par ce lieu
  // (effet "trésor" — découvrir un lieu fixe est rare et fort)
  const revealsScenarios = asset.reveals || [];
  const generatedFragments = [];
  revealsScenarios.forEach(scId => {
    const frag = instantiateFragmentFromScenario(scId, {
      targetType: 'sonde_ancienne', // fallback type
      targetCoords: fullCoord,
    });
    if (frag) {
      frag.sourceType = 'fixed_asset_discovery';
      frag.sourceCoords = fullCoord;
      G.legend.fragments.unshift(frag);
      generatedFragments.push(frag);
      if (frag.motif === 'nous_etions_47') {
        G.legend.civilizations.caldris.motifs.nous_etions_47.count += 1;
      }
    }
  });

  G.legend.civilizations.caldris.lastSeenAt = Date.now();
  G.legend.ui.badgeCount = (G.legend.ui.badgeCount || 0) + revealsScenarios.length;

  saveLegend();
  evaluateCaldrisRevealRules();

  return { asset, fullCoord, generatedFragments };
}

// ─── CHEAT DEV — Pousse manuellement un drop dans Archives ──────────────

function cheatLegendDrop(forceType, civId) {
  // Si civId fourni, restreint la pioche à cette civ. Sinon pioche toutes.
  const allScenarios = Object.values(LEGEND_SCENARIOS);
  const scenarios = civId ? allScenarios.filter(s => s.civilization === civId) : allScenarios;
  if (scenarios.length === 0) {
    if (typeof toast === 'function') toast(`🏺 Pas de scénarios pour ${civId || 'cette pioche'}`);
    return;
  }
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  const mission = { targetType: 'cargo', targetCoords: 'CHEAT-DEV' };

  let drop = null;
  if (forceType === 'fragment') {
    const payload = instantiateFragmentFromScenario(scenario.id, mission);
    if (payload) drop = { type: 'fragment', scenarioId: scenario.id, payload };
  } else if (forceType === 'relic') {
    // Pioche un scénario qui a une relic (parmi la civ filtrée si applicable)
    const scWithRelic = scenarios.filter(s =>
      Object.values(LEGEND_RELIC_BANK).some(r => r.scenarioId === s.id)
    );
    if (scWithRelic.length === 0) {
      if (typeof toast === 'function') toast('🏺 Pas de relic éligible pour cette civ');
      return;
    }
    const sc = scWithRelic[Math.floor(Math.random() * scWithRelic.length)];
    const payload = instantiateRelicFromScenario(sc.id, mission);
    if (payload) drop = { type: 'relic', scenarioId: sc.id, payload };
  } else if (forceType === 'coord_hint') {
    const scWithCoord = scenarios.filter(s => s.canRevealCoord);
    if (scWithCoord.length === 0) {
      if (typeof toast === 'function') toast('🏺 Pas de hint éligible pour cette civ');
      return;
    }
    const sc = scWithCoord[Math.floor(Math.random() * scWithCoord.length)];
    const payload = instantiateCoordHint(sc.id, mission);
    if (payload) drop = { type: 'coord_hint', scenarioId: sc.id, payload };
  } else if (forceType === 'burst10') {
    for (let i = 0; i < 10; i++) {
      const sc = scenarios[Math.floor(Math.random() * scenarios.length)];
      const payload = instantiateFragmentFromScenario(sc.id, mission);
      if (payload) {
        applyLegendDrop({ type: 'fragment', scenarioId: sc.id, payload }, mission, null);
      }
    }
    const civLbl = civId ? (CIV_DOSSIER_CONFIG[civId]?.civName || civId.toUpperCase()) : 'multi-civ';
    if (typeof toast === 'function') toast(`🏺 +10 fragments ${civLbl} forcés`);
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return;
  }

  if (drop) {
    applyLegendDrop(drop, mission, null);
    const label = drop.type === 'fragment' ? 'fragment' : drop.type === 'relic' ? 'objet témoin' : 'coordonnée partielle';
    if (typeof toast === 'function') toast(`🏺 ${label} archivé (cheat)`);
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  } else {
    if (typeof toast === 'function') toast('🏺 drop cheat impossible (rien d\'éligible)');
  }
}

// Reset les Archives (utilitaire dev)
function cheatLegendReset() {
  G.legend = makeDefaultLegend();
  saveLegend();
  if (typeof toast === 'function') toast('🏺 Archives réinitialisées');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Dump G.legend dans la console (debug)
function cheatLegendDumpState() {
  console.log('═══ G.legend ═══');
  console.log('civilizations:', JSON.parse(JSON.stringify(G.legend.civilizations)));
  console.log('fragments:', G.legend.fragments.length, G.legend.fragments);
  console.log('relics:', G.legend.relics.length, G.legend.relics);
  console.log('coordHints:', G.legend.coordHints.length, G.legend.coordHints);
  console.log('discoveredFixedAssets:', G.legend.discoveredFixedAssets);
  console.log('seenRevealMessages:', G.legend.seenRevealMessages);
  console.log('ui:', G.legend.ui);
  if (typeof toast === 'function') toast('🏺 dump dans la console');
}

// ═══════════════════════════════════════════════════════════════════════════
// END Chunk B — drop logic + reveal + cheats
// Hook dans handleTankerReturn + enrichissement narrative : str_replace direct.
// Hook dans handleProbeReturn pour lieux fixes : str_replace direct.
// UI Archives : Chunk C.
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// PASSE 6 — CHUNK C : Écran Archives du Vide (Caldris MVP)
// 4ème onglet du Centre de prospection. Caché tant que pas de fragment.
// Sobriété volontaire : pas d'animations, du monospace pour les data,
// du texte propre pour les récits. Style guide respecté.
// ═══════════════════════════════════════════════════════════════════════════

// ─── ENTRY POINT — Rendu de l'onglet Archives ────────────────────────────
function renderArchivesPane() {
  const wrap = document.getElementById('archives-content');
  if (!wrap) return;

  if (!G.legend) G.legend = makeDefaultLegend();

  // Listes globales (toutes civs confondues)
  const allFragments = G.legend.fragments;
  const allRelics = G.legend.relics;
  const allHints = G.legend.coordHints;
  const allFixedAssets = G.legend.discoveredFixedAssets;

  // Si rien du tout, message d'amorce sobre
  if (allFragments.length === 0 && allRelics.length === 0) {
    wrap.innerHTML = `
      <div style="padding:24px 16px;text-align:center;color:var(--mut);font-family:var(--font-mono);font-size:11px;letter-spacing:.06em">
        Aucune entrée archivée pour l'instant.<br><br>
        <span style="color:var(--mut-soft);font-size:10px">
          Les fragments narratifs apparaissent ici quand un tanker rapporte<br>
          un artefact d'origine non classée.
        </span>
      </div>`;
    return;
  }

  let html = '';

  // ─── CARTES CIVILISATION (cartes empilées par ordre de découverte) ──
  // Ordre : caldris, lumen, werath, erebus, brigandiers. On n'affiche que les civs dont
  // au moins 1 fragment OU 1 objet a été indexé.
  const civOrder = ['caldris', 'lumen', 'werath', 'erebus', 'brigandiers'];
  civOrder.forEach((civId) => {
    const civHasData = allFragments.some(f => f.civId === civId)
                    || allRelics.some(r => r.civId === civId);
    if (!civHasData) return;
    html += _renderCivCard(civId);
  });

  // ─── COORDONNÉES PARTIELLES (toutes civs confondues) ────────────────
  const unresolvedHints = allHints.filter(h => !h.resolved);
  if (unresolvedHints.length > 0) {
    html += `<div class="legend-section-title">COORDONNÉES PARTIELLES</div>`;
    html += `<div style="font-size:10px;color:var(--mut);padding:0 16px 8px;font-family:var(--font-mono);letter-spacing:.06em">
      Une sonde ciblée sur la zone peut résoudre les chiffres manquants.
    </div>`;
    unresolvedHints.forEach(h => {
      const probeLabel = h.requiredProbeTier === 'medium' ? 'Moyenne' : 'Légère';
      html += `
        <div class="legend-hint-item" onclick="openLegendHintModal('${h.id}')">
          <div class="legend-hint-coord">${h.hint}</div>
          <div class="legend-hint-meta">
            <span>Sonde ${probeLabel} requise</span>
            <span class="legend-hint-action">→ Détails</span>
          </div>
        </div>`;
    });
  }

  // ─── LIEUX FIXES DÉCOUVERTS (toutes civs confondues) ─────────────────
  if (allFixedAssets.length > 0) {
    html += `<div class="legend-section-title">LIEUX FIXES CONFIRMÉS</div>`;
    allFixedAssets.forEach(d => {
      const asset = LEGEND_FIXED_ASSETS[d.coord];
      if (!asset) return;
      const assetCiv = G.legend.civilizations[d.civId];
      const civRevealed = !!assetCiv?.revealed;
      const name = civRevealed ? asset.name : asset.publicName;
      html += `
        <div class="legend-asset-item" onclick="openLegendAssetModal('${d.coord}')">
          <div class="legend-asset-name">${name}</div>
          <div class="legend-asset-coord">${d.coord}</div>
          <div class="legend-asset-meta">Confirmé · ${formatRelativeTime(d.discoveredAt)}</div>
        </div>`;
    });
  }

  // ─── FRAGMENTS (toutes civs, ordre chronologique inverse) ────────────
  if (allFragments.length > 0) {
    html += `<div class="legend-section-title">FRAGMENTS (${allFragments.length})</div>`;
    allFragments.forEach(f => {
      const reliabilityPct = Math.round((f.reliability || 0) * 100);
      // Badge motif : adapté par civ
      let motifBadge = '';
      if (f.motif === 'nous_etions_47') motifBadge = '<span class="legend-motif-pill">47</span>';
      else if (f.motif === 'paix_definitive') motifBadge = '<span class="legend-motif-pill legend-motif-lumen">paix</span>';
      else if (f.motif === 'nous_tenons') motifBadge = '<span class="legend-motif-pill legend-motif-werath">tenons</span>';
      else if (f.motif === 'nous_nous_retirons') motifBadge = '<span class="legend-motif-pill legend-motif-erebus">retrait</span>';
      else if (f.motif === 'on_y_etait') motifBadge = '<span class="legend-motif-pill legend-motif-brigandiers">on y était</span>';
      html += `
        <div class="legend-frag-item ${f.read ? '' : 'unread'}" onclick="openLegendFragmentModal('${f.id}')">
          <div class="legend-frag-title">${f.title} ${motifBadge}</div>
          <div class="legend-frag-meta">
            <span class="legend-frag-type">${_legendTypeLabel(f.type)}</span>
            <span class="legend-frag-rel">Fiab. ${reliabilityPct}%</span>
          </div>
        </div>`;
    });
  }

  // ─── OBJETS TÉMOINS (toutes civs) ────────────────────────────────────
  if (allRelics.length > 0) {
    html += `<div class="legend-section-title">OBJETS TÉMOINS (${allRelics.length})</div>`;
    allRelics.forEach(r => {
      const relicCiv = G.legend.civilizations[r.civId];
      const civRevealed = !!relicCiv?.revealed;
      const displayName = civRevealed ? r.name : r.publicName;
      const rarityClass = `legend-rarity-${r.rarity || 'common'}`;
      let motifBadge = '';
      if (r.motif === 'nous_etions_47') motifBadge = '<span class="legend-motif-pill">47</span>';
      else if (r.motif === 'paix_definitive') motifBadge = '<span class="legend-motif-pill legend-motif-lumen">paix</span>';
      else if (r.motif === 'nous_tenons') motifBadge = '<span class="legend-motif-pill legend-motif-werath">tenons</span>';
      else if (r.motif === 'nous_nous_retirons') motifBadge = '<span class="legend-motif-pill legend-motif-erebus">retrait</span>';
      else if (r.motif === 'on_y_etait') motifBadge = '<span class="legend-motif-pill legend-motif-brigandiers">on y était</span>';
      html += `
        <div class="legend-relic-item ${r.read ? '' : 'unread'}" onclick="openLegendRelicModal('${r.id}')">
          <div class="legend-relic-name">${displayName} ${motifBadge}</div>
          <div class="legend-relic-meta">
            <span class="${rarityClass}">${(r.rarity || 'common').toUpperCase()}</span>
          </div>
        </div>`;
    });
  }

  // Footer signature — multi-civ
  const revealedCivs = civOrder
    .filter(id => G.legend.civilizations[id]?.revealed)
    .map(id => LEGEND_CIVILIZATIONS[id].revealedName);
  const civSuffix = revealedCivs.length > 0
    ? revealedCivs.join(' · ')
    : 'CIVILISATIONS ANONYMES';
  html += `
    <div style="padding:16px;font-family:var(--font-mono);font-size:9px;color:var(--mut-soft);letter-spacing:.08em;text-align:center;border-top:1px solid var(--border-soft);margin-top:8px">
      ARCHIVES DU VIDE · v0 · ${civSuffix}
    </div>`;

  wrap.innerHTML = html;

  // Reset badge à l'ouverture
  markLegendItemsRead();
}

// ─── Carte civilisation (helper utilisé par renderArchivesPane) ──────
// Fonctionne pour les 3 civs : caldris, lumen, werath.
function _renderCivCard(civId) {
  const civ = G.legend.civilizations[civId];
  if (!civ) return '';
  const civDef = LEGEND_CIVILIZATIONS[civId];
  if (!civDef) return '';

  const fragments = G.legend.fragments.filter(f => f.civId === civId);
  const relics = G.legend.relics.filter(r => r.civId === civId);
  const hints = G.legend.coordHints.filter(h => h.civId === civId);
  const fixedAssets = G.legend.discoveredFixedAssets.filter(d => d.civId === civId);

  const civNumber = { caldris: 'CIV-001', lumen: 'CIV-002', werath: 'CIV-003', erebus: 'CIV-004', brigandiers: 'CIV-005' }[civId] || 'CIV-???';
  const civDisplayName = civ.revealed
    ? `${civNumber} · ${civDef.revealedName}`
    : `${civNumber} · ${civDef.publicName}`;

  const motifKey = CIV_MOTIF_KEYS[civId];
  const motifCount = civ.motifs?.[motifKey]?.count || 0;
  const motifDiscovered = civ.motifs?.[motifKey]?.discovered;

  // Statut auto-déterminé par les compteurs
  let status;
  if (fragments.length < 3) status = 'Non classé';
  else if (fragments.length < 8) status = 'Corrélations faibles';
  else if (fragments.length < 16) status = 'Hypothèse ouverte';
  else {
    // Statut différent selon la civ pour donner une identité
    if (civId === 'caldris') status = 'Civilisation migrante probable';
    else if (civId === 'lumen') status = 'Civilisation post-organique probable';
    else if (civId === 'werath') status = 'Civilisation militaire fossilisée probable';
    else if (civId === 'erebus') status = 'Civilisation retirée probable';
    else if (civId === 'brigandiers') status = 'Civilisation résiduelle active probable';
    else status = 'Hypothèse confirmée';
  }

  let html = `
    <div class="legend-civ-card">
      <div class="legend-civ-header">
        <div class="legend-civ-title">${civDisplayName}</div>
        <div class="legend-civ-class">${civ.revealed ? civDef.classification : 'Origine inconnue'}</div>
      </div>
      <div class="legend-civ-stats">
        <div class="legend-stat-row"><span class="legend-stat-lbl">Fragments indexés</span><span class="legend-stat-val">${fragments.length}</span></div>
        <div class="legend-stat-row"><span class="legend-stat-lbl">Objets témoins</span><span class="legend-stat-val">${relics.length}</span></div>
        <div class="legend-stat-row"><span class="legend-stat-lbl">Coordonnées partielles</span><span class="legend-stat-val">${hints.filter(h=>!h.resolved).length}</span></div>
        <div class="legend-stat-row"><span class="legend-stat-lbl">Lieux fixes confirmés</span><span class="legend-stat-val">${fixedAssets.length}</span></div>
        <div class="legend-stat-row legend-stat-status"><span class="legend-stat-lbl">Statut</span><span class="legend-stat-val">${status}</span></div>
      </div>`;

  // Motif révélé
  if (motifDiscovered && motifCount > 0) {
    html += `
      <div class="legend-motif-block">
        <div class="legend-motif-lbl">PHRASE RÉCURRENTE DÉTECTÉE</div>
        <div class="legend-motif-text">« ${civDef.motifPrimary} »</div>
        <div class="legend-motif-count">${motifCount} occurrence${motifCount > 1 ? 's' : ''} indexée${motifCount > 1 ? 's' : ''}</div>
      </div>`;
  }

  // Consolidation
  const consolidationStatus = (typeof getCivConsolidationStatus === 'function')
    ? getCivConsolidationStatus(civId) : null;
  if (consolidationStatus) {
    if (consolidationStatus.consolidated) {
      html += `
        <div class="dossier-status-consolidated">
          <div class="dossier-status-badge">✓ DOSSIER CONSOLIDÉ</div>
          <button class="dossier-cta-view" onclick="openCivConsolidatedDossier('${civId}')">→ Voir le dossier consolidé</button>
        </div>`;
    } else if (consolidationStatus.canConsolidate) {
      html += `
        <div class="dossier-status-ready">
          <div class="dossier-status-lbl">SEUIL DE CONSOLIDATION ATTEINT</div>
          <button class="dossier-cta-consolidate" onclick="startCivConsolidationRitual('${civId}')">→ Consolider le dossier</button>
        </div>`;
    } else {
      const f = consolidationStatus.fragments;
      const r = consolidationStatus.relics;
      const a = consolidationStatus.fixedAssets;
      const showProgress = f.have > 0 || r.have > 0 || a.have > 0;
      if (showProgress) {
        html += `
          <div class="dossier-status-progress">
            <div class="dossier-status-lbl">SEUIL DE CONSOLIDATION</div>
            <div class="dossier-progress-row"><span>Fragments</span><span class="${f.have>=f.need?'progress-ok':''}">${f.have} / ${f.need}</span></div>
            <div class="dossier-progress-row"><span>Objets témoins</span><span class="${r.have>=r.need?'progress-ok':''}">${r.have} / ${r.need}</span></div>
            <div class="dossier-progress-row"><span>Lieux fixes confirmés</span><span class="${a.have>=a.need?'progress-ok':''}">${a.have} / ${a.need}</span></div>
          </div>`;
      }
    }
  }

  html += `</div>`;
  return html;
}

// Helper : label humain pour les types de fragments
function _legendTypeLabel(type) {
  const map = {
    manifest: 'Manifeste',
    battle_record: 'Relevé de combat',
    audio_fragment: 'Audio',
    register: 'Registre',
    object_record: 'Relevé objet',
    maintenance_log: 'Maintenance',
    medical_log: 'Médical',
    discipline_report: 'Discipline',
    school_record: 'Scolaire',
    surface_report: 'Surface',
    probe_memory: 'Mémoire sonde',
    inscription: 'Inscription',
    archive_entry: 'Archive',
  };
  return map[type] || type;
}

// ─── MARK READ — Reset du badge "non lus" ─────────────────────────────
function markLegendItemsRead() {
  if (!G.legend) return;
  G.legend.fragments.forEach(f => { f.read = true; });
  G.legend.relics.forEach(r => { r.read = true; });
  G.legend.coordHints.forEach(h => { h.read = true; });
  G.legend.ui.badgeCount = 0;
  G.legend.ui.lastViewedAt = Date.now();
  saveLegend();
  // Met à jour le badge UI
  updateLegendBadge();
}

// Met à jour le badge "non lu" sur l'onglet Archives
function updateLegendBadge() {
  const badge = document.getElementById('prospect-tab-archives-badge');
  if (!badge) return;
  const count = G.legend?.ui?.badgeCount || 0;
  if (count > 0) {
    badge.style.display = '';
    badge.textContent = count;
  } else {
    badge.style.display = 'none';
  }
}

// Affiche/cache l'onglet Archives selon si le joueur a déjà trouvé quelque chose
function updateLegendTabVisibility() {
  const btn = document.getElementById('prospect-tab-archives');
  if (!btn) return;
  const hasContent = G.legend && (
    (G.legend.fragments || []).length > 0 ||
    (G.legend.relics || []).length > 0 ||
    (G.legend.coordHints || []).length > 0 ||
    (G.legend.discoveredFixedAssets || []).length > 0
  );
  btn.style.display = hasContent ? '' : 'none';
}

// ─── MODALS — Détail fragment / relic / hint / asset ──────────────────

function openLegendFragmentModal(fragId) {
  const f = G.legend?.fragments.find(x => x.id === fragId);
  if (!f) return;
  const reliabilityPct = Math.round((f.reliability || 0) * 100);
  const caldris = G.legend.civilizations.caldris;
  const civLabel = caldris.revealed ? 'CIV-001 · CALDRIS' : 'CIV-001 · Origine non classée';

  // Similarités
  const similarCount = G.legend.fragments.filter(other =>
    other.civId === f.civId &&
    other.id !== f.id &&
    (other.contradictionTags || []).some(t => (f.contradictionTags || []).includes(t))
  ).length;

  const bodyHtml = `
    <div class="legend-modal-meta">
      <span>${_legendTypeLabel(f.type)}</span>
      <span>Fiabilité : ${reliabilityPct}%</span>
    </div>
    <div class="legend-modal-text">${_escapeHtml(f.text).replace(/\n/g, '<br>')}</div>
    <div class="legend-modal-footer">
      Origine : ${civLabel}<br>
      ${similarCount > 0 ? `Similarités détectées avec ${similarCount} entrée${similarCount>1?'s':''} ancienne${similarCount>1?'s':''}.<br>` : ''}
      ${f.sourceCoords ? `Récupéré : ${f.sourceCoords}` : ''}
    </div>`;

  _openLegendModal({
    title: f.title,
    body: bodyHtml,
    showTankerLink: f.sourceTankerReportId,
    onTankerLink: f.sourceTankerReportId ? () => _goToTankerReport(f.sourceTankerReportId) : null,
  });
}

function openLegendRelicModal(relicId) {
  const r = G.legend?.relics.find(x => x.id === relicId);
  if (!r) return;
  const caldris = G.legend.civilizations.caldris;
  const displayName = caldris.revealed ? r.name : r.publicName;
  const civLabel = caldris.revealed ? 'CIV-001 · CALDRIS' : 'CIV-001 · Origine non classée';

  const bodyHtml = `
    <div class="legend-modal-meta">
      <span class="legend-rarity-${r.rarity || 'common'}">${(r.rarity || 'common').toUpperCase()}</span>
      <span>Objet témoin</span>
    </div>
    <div class="legend-modal-text">${_escapeHtml(r.description).replace(/\n/g, '<br>')}</div>
    <div class="legend-modal-footer">
      Origine : ${civLabel}<br>
      ${r.sourceCoords ? `Récupéré : ${r.sourceCoords}` : ''}
    </div>`;

  _openLegendModal({
    title: displayName,
    body: bodyHtml,
    showTankerLink: r.sourceTankerReportId,
    onTankerLink: r.sourceTankerReportId ? () => _goToTankerReport(r.sourceTankerReportId) : null,
  });
}

function openLegendHintModal(hintId) {
  const h = G.legend?.coordHints.find(x => x.id === hintId);
  if (!h) return;
  const probeLabel = h.requiredProbeTier === 'medium' ? 'Moyenne' : 'Légère';
  const systemAddress = (h.targetFixedAssetCoord || '').split('-').slice(0, 3).join('-');

  // Vérifier dispo de sonde Moyenne
  const availableProbe = (G.probesPool || []).find(p => p.tier === h.requiredProbeTier && p.state === 'ready');

  const bodyHtml = `
    <div class="legend-modal-meta">
      <span>Coordonnée partielle</span>
      <span style="font-family:var(--font-mono)">${h.hint}</span>
    </div>
    <div class="legend-modal-text">
      Une donnée de navigation incomplète a été récupérée.<br>
      Les derniers chiffres de l'adresse sont absents ou corrompus.<br><br>
      Une sonde <strong>${probeLabel}</strong> ciblée sur le système <strong>${systemAddress}</strong> devrait suffire à résoudre les chiffres manquants — si quelque chose existe encore à cette adresse.
    </div>
    <div class="legend-modal-footer">
      Cible probable : système ${systemAddress}<br>
      Sonde ${probeLabel} disponible : ${availableProbe ? '<span style="color:var(--green)">✓ oui</span>' : '<span style="color:var(--mut)">non — à construire</span>'}
    </div>`;

  _openLegendModal({
    title: 'Coordonnée à résoudre',
    body: bodyHtml,
    primaryAction: availableProbe ? {
      label: `→ Envoyer sonde ${probeLabel}`,
      onClick: () => launchProbeForLegendHint(hintId),
    } : null,
  });
}

function openLegendAssetModal(coord) {
  const asset = LEGEND_FIXED_ASSETS[coord];
  if (!asset) return;
  const caldris = G.legend.civilizations.caldris;
  const displayName = caldris.revealed ? asset.name : asset.publicName;
  const discovery = G.legend.discoveredFixedAssets.find(d => d.coord === coord);

  const bodyHtml = `
    <div class="legend-modal-meta">
      <span>Lieu fixe confirmé</span>
      <span style="font-family:var(--font-mono)">${coord}</span>
    </div>
    <div class="legend-modal-text">${_escapeHtml(asset.description).replace(/\n/g, '<br>')}</div>
    <div class="legend-modal-footer">
      Type : ${asset.type}<br>
      ${discovery ? `Découvert par : ${discovery.discoveredByProbe}<br>Date : ${formatRelativeTime(discovery.discoveredAt)}` : ''}
    </div>`;

  _openLegendModal({
    title: displayName,
    body: bodyHtml,
  });
}

// ─── ENVOI SONDE DEPUIS COORD HINT ────────────────────────────────────
function launchProbeForLegendHint(hintId) {
  const h = G.legend?.coordHints.find(x => x.id === hintId);
  if (!h) return;
  const tier = h.requiredProbeTier || 'medium';
  const systemAddress = (h.targetFixedAssetCoord || '').split('-').slice(0, 3).join('-');

  // Lancement (force=false pour respecter la validation d'adresse)
  // Mode 'long_range' parce qu'on cible un système distant par adresse
  const mission = launchProbe(tier, systemAddress, 'long_range', false);
  if (mission) {
    _closeLegendModal();
    if (typeof toast === 'function') {
      const probeLabel = tier === 'medium' ? 'Moyenne' : 'Légère';
      toast(`Sonde ${probeLabel} envoyée vers ${systemAddress}`);
    }
    // Refresh la pane (le hint reste visible jusqu'à résolution)
    if (typeof renderArchivesPane === 'function') renderArchivesPane();
  }
}

// ─── HELPERS MODAL ────────────────────────────────────────────────────

function _openLegendModal({ title, body, primaryAction, showTankerLink, onTankerLink }) {
  let modal = document.getElementById('legend-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'legend-modal';
    modal.className = 'legend-modal-overlay';
    modal.innerHTML = `
      <div class="legend-modal-box" onclick="event.stopPropagation()">
        <div class="legend-modal-header">
          <div class="legend-modal-title" id="legend-modal-title"></div>
          <button class="legend-modal-close" onclick="_closeLegendModal()">×</button>
        </div>
        <div class="legend-modal-body" id="legend-modal-body"></div>
        <div class="legend-modal-actions" id="legend-modal-actions"></div>
      </div>`;
    modal.onclick = _closeLegendModal;
    document.body.appendChild(modal);
  }
  document.getElementById('legend-modal-title').textContent = title || '';
  document.getElementById('legend-modal-body').innerHTML = body || '';

  const actions = document.getElementById('legend-modal-actions');
  actions.innerHTML = '';

  if (primaryAction) {
    const btn = document.createElement('button');
    btn.className = 'legend-modal-btn legend-modal-btn-primary';
    btn.textContent = primaryAction.label;
    btn.onclick = (e) => { e.stopPropagation(); primaryAction.onClick(); };
    actions.appendChild(btn);
  }
  if (showTankerLink && onTankerLink) {
    const btn = document.createElement('button');
    btn.className = 'legend-modal-btn legend-modal-btn-link';
    btn.textContent = '→ Voir rapport tanker';
    btn.onclick = (e) => { e.stopPropagation(); onTankerLink(); };
    actions.appendChild(btn);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'legend-modal-btn legend-modal-btn-secondary';
  closeBtn.textContent = 'Fermer';
  closeBtn.onclick = (e) => { e.stopPropagation(); _closeLegendModal(); };
  actions.appendChild(closeBtn);

  modal.classList.add('shown');
}

function _closeLegendModal() {
  const modal = document.getElementById('legend-modal');
  if (modal) modal.classList.remove('shown');
}

// Ouvre l'écran Centre de prospection avec l'onglet Rapports actif.
// Raccourci utilisé depuis le Commerce et potentiellement d'autres écrans.
function openProspectRapports() {
  goto('prospect');
  // Le bascule d'onglet se fait après le rendu de l'écran
  setTimeout(() => {
    if (typeof setProspectTab === 'function') setProspectTab('rapports');
  }, 60);
}

function _goToTankerReport(reportId) {
  _closeLegendModal();
  // Bascule sur l'onglet Rapports et essaie de scroller vers le bon rapport
  if (typeof setProspectTab === 'function') {
    setProspectTab('rapports');
    setTimeout(() => {
      const el = document.querySelector(`[data-tanker-report-id="${reportId}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}

function _escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

// Format temps relatif (helper local pour éviter collision avec une future
// fonction globale formatRelativeTime).
function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l\'instant';
  if (diff < 3600_000) return `il y a ${Math.floor(diff/60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff/3600_000)} h`;
  return `il y a ${Math.floor(diff/86_400_000)} j`;
}

// ─── HELPER : Rendu markdown-light pour l'hypothèse ─────────────────────
// Convertit le texte de CALDRIS_DOMINANT_HYPOTHESIS en HTML structuré.
// Syntaxe supportée :
//   ## Titre        → <h4 class="dossier-section-sub">Titre</h4>
//   > Citation      → <blockquote class="dossier-quote">Citation</blockquote>
//   *italique*      → <em>italique</em>
//   Lignes vides séparent les paragraphes.
function _renderHypothesisHtml(rawText) {
  const blocks = rawText.split(/\n\n+/);
  return blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    // Sous-titre de section
    if (block.startsWith('## ')) {
      const title = _escapeHtml(block.slice(3).trim());
      return `<h4 class="dossier-section-sub">${title}</h4>`;
    }
    // Bloc-quote (toutes les lignes commencent par >)
    if (block.startsWith('> ')) {
      const lines = block.split('\n').map(l => _escapeHtml(l.replace(/^>\s?/, '')));
      return `<blockquote class="dossier-quote">${lines.join('<br>')}</blockquote>`;
    }
    // Paragraphe normal
    const escaped = _escapeHtml(block).replace(/\n/g, '<br>');
    const withItalics = escaped.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return `<p>${withItalics}</p>`;
  }).join('');
}

// Toutes les civs utilisent le même seuil pour le MVP
function getCivConsolidationStatus(civId) {
  if (!G.legend) G.legend = makeDefaultLegend();
  const civ = G.legend.civilizations[civId];
  if (!civ) return null;
  const fragmentsHave = G.legend.fragments.filter(f => f.civId === civId).length;
  const relicsHave = G.legend.relics.filter(r => r.civId === civId).length;
  const fixedHave = G.legend.discoveredFixedAssets.filter(d => d.civId === civId).length;
  const t = CALDRIS_CONSOLIDATION_THRESHOLD; // partagé pour MVP
  return {
    civId,
    canConsolidate: fragmentsHave >= t.fragmentsRequired &&
                    relicsHave >= t.relicsRequired &&
                    fixedHave >= t.fixedAssetsRequired,
    fragments: { have: fragmentsHave, need: t.fragmentsRequired },
    relics: { have: relicsHave, need: t.relicsRequired },
    fixedAssets: { have: fixedHave, need: t.fixedAssetsRequired },
    consolidated: !!civ.consolidated,
  };
}

function consolidateCiv(civId) {
  if (!G.legend) G.legend = makeDefaultLegend();
  const civ = G.legend.civilizations[civId];
  if (!civ) return false;
  if (civ.consolidated) return false;
  const motifKey = CIV_MOTIF_KEYS[civId];
  civ.consolidated = true;
  civ.consolidatedAt = Date.now();
  civ.consolidatedBy = (G.planet && G.planet.name) ? G.planet.name : 'Inconnu';
  civ.consolidatedSnapshot = {
    fragments: G.legend.fragments.filter(f => f.civId === civId).length,
    relics: G.legend.relics.filter(r => r.civId === civId).length,
    fixedAssets: G.legend.discoveredFixedAssets.filter(d => d.civId === civId).length,
    coordHints: G.legend.coordHints.filter(h => h.civId === civId && h.resolved).length,
    motifCount: civ.motifs?.[motifKey]?.count || 0,
  };
  saveLegend();
  return true;
}

// Retourne { canConsolidate: bool, fragments: {have, need}, relics: {have, need}, fixedAssets: {have, need} }
function getCaldrisConsolidationStatus() {
  return getCivConsolidationStatus('caldris');
}

// Effectue la consolidation (set du flag + save). Appelé après la fin du rituel.
function consolidateCaldris() {
  return consolidateCiv('caldris');
}

function startCivConsolidationRitual(civId) {
  const status = getCivConsolidationStatus(civId);
  if (!status) return;
  if (!status.canConsolidate) {
    if (typeof toast === 'function') toast('Seuil de consolidation non atteint');
    return;
  }
  if (status.consolidated) {
    openCivConsolidatedDossier(civId);
    return;
  }
  _openConsolidationRitualOverlay(civId);
}

function startCaldrisConsolidationRitual() {
  startCivConsolidationRitual('caldris');
}

function _openConsolidationRitualOverlay(civId) {
  civId = civId || 'caldris';
  const cfg = CIV_DOSSIER_CONFIG[civId];
  if (!cfg) return;
  // Étapes adaptées : on remplace la 4e étape par celle de la civ
  const steps = CONSOLIDATION_STEPS.map(s => {
    if (s.startsWith('Indexation du motif')) return cfg.ritualMotifStep;
    return s;
  });

  let overlay = document.getElementById('consolidation-ritual');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'consolidation-ritual';
    overlay.className = 'legend-modal-overlay';
    document.body.appendChild(overlay);
  }
  // Refonte du contenu à chaque ouverture (subtitle dynamique + onclick avec civId)
  overlay.innerHTML = `
    <div class="consolidation-ritual-box">
      <div class="consolidation-ritual-title">CONSOLIDATION ARCHIVISTIQUE</div>
      <div class="consolidation-ritual-subtitle">${cfg.civCode} · ${cfg.civName}</div>
      <div class="consolidation-ritual-steps" id="consolidation-ritual-steps"></div>
      <div class="consolidation-ritual-footer" id="consolidation-ritual-footer" style="display:none">
        <button class="legend-modal-btn legend-modal-btn-primary" onclick="_finishCivConsolidationRitual('${civId}')">
          → Ouvrir le dossier consolidé
        </button>
      </div>
    </div>`;
  const stepsContainer = document.getElementById('consolidation-ritual-steps');
  stepsContainer.innerHTML = steps.map((s, i) =>
    `<div class="consolidation-ritual-step" id="ritual-step-${i}">▸ ${s}<span class="ritual-check" style="opacity:0">✓</span></div>`
  ).join('');
  document.getElementById('consolidation-ritual-footer').style.display = 'none';
  overlay.classList.add('shown');

  // Animer les checks en cascade
  steps.forEach((_, i) => {
    setTimeout(() => {
      const step = document.getElementById(`ritual-step-${i}`);
      if (step) {
        step.classList.add('done');
        const check = step.querySelector('.ritual-check');
        if (check) check.style.opacity = '1';
      }
      // À la dernière étape : effectuer la consolidation + révéler le footer
      if (i === steps.length - 1) {
        setTimeout(() => {
          consolidateCiv(civId);
          const footer = document.getElementById('consolidation-ritual-footer');
          if (footer) footer.style.display = '';
        }, 500);
      }
    }, 500 + i * 600);
  });
}

function _finishCivConsolidationRitual(civId) {
  const overlay = document.getElementById('consolidation-ritual');
  if (overlay) overlay.classList.remove('shown');
  openCivConsolidatedDossier(civId);
}

// Alias rétro-compat
function _finishConsolidationRitual() {
  _finishCivConsolidationRitual('caldris');
}

// ─── DOSSIER CONSOLIDÉ — Page complète ───────────────────────────────────

function openCivConsolidatedDossier(civId) {
  civId = civId || 'caldris';
  const civ = G.legend?.civilizations?.[civId];
  const cfg = CIV_DOSSIER_CONFIG[civId];
  if (!civ || !civ.consolidated || !cfg) return;
  const snap = civ.consolidatedSnapshot || {};

  // Compteurs actuels (peuvent être > snapshot)
  const fragsNow = G.legend.fragments.filter(f => f.civId === civId).length;
  const relicsNow = G.legend.relics.filter(r => r.civId === civId).length;
  const fixedNow = G.legend.discoveredFixedAssets.filter(d => d.civId === civId).length;

  // Liste des lieux fixes découverts (avec coord)
  const knownAssetsList = G.legend.discoveredFixedAssets
    .filter(d => d.civId === civId)
    .map(d => {
      const asset = LEGEND_FIXED_ASSETS[d.coord];
      return { coord: d.coord, name: asset?.name || d.coord };
    });

  // Tous les lieux fixes de la civ (confirmés + non-confirmés)
  const allAssets = Object.entries(LEGEND_FIXED_ASSETS)
    .filter(([_, a]) => a.civilization === civId)
    .map(([coord, a]) => {
      const discovered = knownAssetsList.find(k => k.coord === coord);
      return { coord, name: a.name, discovered: !!discovered };
    });

  const consolidatedDate = new Date(civ.consolidatedAt || Date.now());
  const consolidatedByName = civ.consolidatedBy || 'Inconnu';

  let overlay = document.getElementById('consolidated-dossier');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'consolidated-dossier';
    overlay.className = 'legend-modal-overlay consolidated-dossier-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) _closeConsolidatedDossier(); };
    document.body.appendChild(overlay);
  }

  const carteHtml = allAssets.map(a => {
    const dot = a.discovered ? '●' : '○';
    const cls = a.discovered ? 'asset-confirmed' : 'asset-unknown';
    const name = a.discovered ? a.name : `${a.name} (non confirmé)`;
    return `<div class="dossier-asset-line ${cls}"><span class="dossier-asset-dot">${dot}</span><span class="dossier-asset-coord">${a.coord}</span><span class="dossier-asset-name">${name}</span></div>`;
  }).join('');

  // Bloc TRAJECTOIRE FINALE / ÉTAT FINAL — adapté à la civ
  const trajectoireBlock = `
    <div class="dossier-section">
      <div class="dossier-section-title">${civId === 'caldris' ? 'TRAJECTOIRE FINALE' : 'ÉTAT FINAL'}</div>
      <div class="dossier-trajectoire">
        <div class="traj-row"><span class="traj-lbl">Coordonnées estimées</span><span class="traj-val">????-??-????</span></div>
        <div class="traj-row"><span class="traj-lbl">${cfg.trajectoireStatusLabel}</span><span class="traj-val">${cfg.trajectoireStatusValue}</span></div>
        <div class="traj-row"><span class="traj-lbl">${cfg.trajectoireLabel}</span><span class="traj-val">${cfg.trajectoireValue}</span></div>
      </div>
    </div>`;

  // Hypothèse dominante de la civ
  const hypothesisText = CIV_DOMINANT_HYPOTHESIS[civId] || '';

  // Signatures
  const signaturesHtml = cfg.signatures.map(s => `<div class="dossier-signature">${s}</div>`).join('');

  // Label motif count adapté
  const motifLabel = `occurrences ${cfg.motifShort}`;

  overlay.innerHTML = `
    <div class="consolidated-dossier-box" onclick="event.stopPropagation()">
      <div class="dossier-header">
        <div class="dossier-stamp">DOSSIER CONSOLIDÉ</div>
        <button class="legend-modal-close" onclick="_closeConsolidatedDossier()">×</button>
      </div>
      <div class="dossier-body">
        <div class="dossier-civ-title">${cfg.civCode} · ${cfg.civName}</div>
        <div class="dossier-civ-class">${cfg.classification}</div>
        <div class="dossier-civ-period">${cfg.period}</div>

        <div class="dossier-section">
          <div class="dossier-section-title">SIGNATURES RÉCURRENTES</div>
          ${signaturesHtml}
        </div>

        <div class="dossier-section">
          <div class="dossier-section-title">ÉTAT DU DOSSIER</div>
          <div class="dossier-stats">
            <div class="dossier-stat"><span class="dossier-stat-num">${fragsNow}</span><span class="dossier-stat-lbl">fragments confirmés</span></div>
            <div class="dossier-stat"><span class="dossier-stat-num">${relicsNow}</span><span class="dossier-stat-lbl">objets témoins</span></div>
            <div class="dossier-stat"><span class="dossier-stat-num">${fixedNow}</span><span class="dossier-stat-lbl">lieux fixes confirmés</span></div>
            <div class="dossier-stat"><span class="dossier-stat-num">${snap.motifCount || 0}</span><span class="dossier-stat-lbl">${motifLabel}</span></div>
          </div>
        </div>

        <div class="dossier-section">
          <div class="dossier-section-title">HYPOTHÈSE DOMINANTE</div>
          <div class="dossier-hypothesis">${_renderHypothesisHtml(hypothesisText)}</div>
        </div>

        ${trajectoireBlock}

        <div class="dossier-section">
          <div class="dossier-section-title">CARTE DES TRACES</div>
          <div class="dossier-carte">
            ${carteHtml}
            <div class="dossier-asset-line asset-unknown">
              <span class="dossier-asset-dot">○</span>
              <span class="dossier-asset-coord">????-??-????</span>
              <span class="dossier-asset-name">${cfg.trajectoireFinaleName}</span>
            </div>
          </div>
        </div>

        <div class="dossier-section dossier-section-footer">
          <div class="dossier-section-title">CONSOLIDATION</div>
          <div class="dossier-meta-row"><span>Consolidé par</span><span>${_escapeHtml(consolidatedByName)}</span></div>
          <div class="dossier-meta-row"><span>Date</span><span>${consolidatedDate.toLocaleDateString('fr-CH', { day:'2-digit', month:'short', year:'numeric' })}</span></div>
          <div class="dossier-meta-row"><span>Statut</span><span>dossier figé localement</span></div>
        </div>

        <div class="dossier-footnote">
          [ Aucune conclusion définitive. ]
        </div>
      </div>

      <div class="dossier-actions">
        <button class="legend-modal-btn legend-modal-btn-primary" onclick="copyCivMomento('${civId}')">📋 Copier le Momento</button>
        <button class="legend-modal-btn legend-modal-btn-secondary" onclick="_closeConsolidatedDossier()">Fermer</button>
      </div>
    </div>
  `;

  overlay.classList.add('shown');
}

// Wrapper rétro-compat
function openCaldrisConsolidatedDossier() {
  openCivConsolidatedDossier('caldris');
}

function _closeConsolidatedDossier() {
  const overlay = document.getElementById('consolidated-dossier');
  if (overlay) overlay.classList.remove('shown');
  // Refresh la pane Archives au cas où le bouton "Consolider" a changé d'état
  if (typeof renderArchivesPane === 'function') renderArchivesPane();
}

// ─── MOMENTO — Texte partageable copié dans le presse-papier ────────────

function buildCivMomentoText(civId) {
  civId = civId || 'caldris';
  const civ = G.legend?.civilizations?.[civId];
  const cfg = CIV_DOSSIER_CONFIG[civId];
  if (!civ || !civ.consolidated || !cfg) return '';
  const fragsNow = G.legend.fragments.filter(f => f.civId === civId).length;
  const relicsNow = G.legend.relics.filter(r => r.civId === civId).length;
  const date = new Date(civ.consolidatedAt || Date.now()).toLocaleDateString('fr-CH', { day:'2-digit', month:'short', year:'numeric' });
  const titleLine = `${cfg.civCode} · ${cfg.civName}`;
  const motifLine = `« ${cfg.motifFull} »`;
  // Tronque les labels trop longs pour la box
  const trunc = (s, max) => s.length <= max ? s : s.slice(0, max - 1) + '…';
  const statusLine = trunc(`${cfg.trajectoireStatusLabel} : ${cfg.trajectoireStatusValue}`, 35);
  const probaLine = trunc(`${cfg.trajectoireLabel} : ${cfg.trajectoireValue}`, 35);

  return `
┌─────────────────────────────────────┐
│  DOSSIER CONSOLIDÉ                  │
│                                     │
│  ${titleLine.padEnd(35, ' ')}│
│  ${trunc(motifLine, 35).padEnd(35, ' ')}│
│                                     │
│  ${String(fragsNow).padStart(2,' ')} fragments · ${String(relicsNow).padStart(2,' ')} objets témoins      │
│  Consolidé par : ${(civ.consolidatedBy || 'Inconnu').padEnd(18, ' ')} │
│  Date : ${date.padEnd(28, ' ')}│
│                                     │
│  ${statusLine.padEnd(35, ' ')}│
│  ${probaLine.padEnd(35, ' ')}│
│                                     │
│       — Archives du Vide —          │
└─────────────────────────────────────┘
  `.trim();
}

function copyCivMomento(civId) {
  const text = buildCivMomentoText(civId);
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => { if (typeof toast === 'function') toast('📋 Momento copié dans le presse-papier'); },
      () => { _fallbackCopyMomento(text); }
    );
  } else {
    _fallbackCopyMomento(text);
  }
}

// Wrappers rétro-compat
function buildCaldrisMomentoText() {
  return buildCivMomentoText('caldris');
}
function copyCaldrisMomento() {
  copyCivMomento('caldris');
}

function _fallbackCopyMomento(text) {
  // Fallback : montrer le texte dans un modal pour copy-paste manuel
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof toast === 'function') toast('📋 Momento copié dans le presse-papier');
  } catch (e) {
    if (typeof toast === 'function') toast('Impossible de copier — voir la console');
    console.log(text);
  }
}

// ─── CHEAT DEV ───────────────────────────────────────────────────────────

function cheatForceCivConsolidation(civId) {
  civId = civId || 'caldris';
  const cfg = CIV_DOSSIER_CONFIG[civId];
  if (!cfg) return;
  if (!G.legend) G.legend = makeDefaultLegend();
  const t = CALDRIS_CONSOLIDATION_THRESHOLD;
  const status = getCivConsolidationStatus(civId);
  if (!status) return;

  // Top-up : seulement avec les scénarios de cette civ
  const civScenarios = Object.values(LEGEND_SCENARIOS).filter(s => s.civilization === civId);
  if (civScenarios.length === 0) {
    if (typeof toast === 'function') toast(`Pas de scénarios pour ${civId}`);
    return;
  }

  // Pousser des fragments
  if (!status.canConsolidate) {
    const needFrags = Math.max(0, t.fragmentsRequired - status.fragments.have);
    for (let i = 0; i < needFrags; i++) {
      const sc = civScenarios[Math.floor(Math.random() * civScenarios.length)];
      const f = instantiateFragmentFromScenario(sc.id, { targetType: 'cargo' });
      if (f) applyLegendDrop({ type: 'fragment', scenarioId: sc.id, payload: f }, { targetType: 'cargo' }, null);
    }
    // Pousser des relics
    let safetyRelic = 0;
    while (G.legend.relics.filter(r => r.civId === civId).length < t.relicsRequired && safetyRelic++ < 30) {
      const sc = civScenarios[Math.floor(Math.random() * civScenarios.length)];
      const r = instantiateRelicFromScenario(sc.id, { targetType: 'cargo' });
      if (r) applyLegendDrop({ type: 'relic', scenarioId: sc.id, payload: r }, { targetType: 'cargo' }, null);
    }
    // Pousser un lieu fixe de la civ
    const fixedHave = G.legend.discoveredFixedAssets.filter(d => d.civId === civId).length;
    if (fixedHave < t.fixedAssetsRequired) {
      const civAssets = Object.entries(LEGEND_FIXED_ASSETS).filter(([_, a]) => a.civilization === civId);
      const needed = t.fixedAssetsRequired - fixedHave;
      for (let i = 0; i < needed && i < civAssets.length; i++) {
        const [coord, asset] = civAssets[i];
        const already = G.legend.discoveredFixedAssets.find(d => d.coord === coord);
        if (already) continue;
        G.legend.discoveredFixedAssets.unshift({
          coord, assetId: asset.id, civId,
          discoveredAt: Date.now(),
          discoveredByProbe: 'cheat-dev',
        });
      }
      saveLegend();
    }
  }
  // Consolider
  consolidateCiv(civId);
  if (typeof toast === 'function') toast(`🏺 ${cfg.civName} consolidé (cheat)`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function cheatForceCaldrisConsolidation() {
  cheatForceCivConsolidation('caldris');
}
function cheatForceLumenConsolidation() {
  cheatForceCivConsolidation('lumen');
}
function cheatForceWerathConsolidation() {
  cheatForceCivConsolidation('werath');
}
function cheatForceErebusConsolidation() {
  cheatForceCivConsolidation('erebus');
}
function cheatForceBrigandiersConsolidation() {
  cheatForceCivConsolidation('brigandiers');
}

// Cheat : pousser N drops d'une civ spécifique
function cheatLegendDropForCiv(civId, n) {
  civId = civId || 'caldris';
  n = n || 10;
  if (!G.legend) G.legend = makeDefaultLegend();
  const civScenarios = Object.values(LEGEND_SCENARIOS).filter(s => s.civilization === civId);
  if (civScenarios.length === 0) return;
  for (let i = 0; i < n; i++) {
    const sc = civScenarios[Math.floor(Math.random() * civScenarios.length)];
    const sourceType = (sc.sourceTypes && sc.sourceTypes[0]) || 'cargo';
    // 70% fragment, 20% relic, 10% coord_hint
    const roll = Math.random();
    if (roll < 0.7) {
      const f = instantiateFragmentFromScenario(sc.id, { targetType: sourceType });
      if (f) applyLegendDrop({ type: 'fragment', scenarioId: sc.id, payload: f }, { targetType: sourceType }, null);
    } else if (roll < 0.9) {
      const r = instantiateRelicFromScenario(sc.id, { targetType: sourceType });
      if (r) applyLegendDrop({ type: 'relic', scenarioId: sc.id, payload: r }, { targetType: sourceType }, null);
      else {
        const f = instantiateFragmentFromScenario(sc.id, { targetType: sourceType });
        if (f) applyLegendDrop({ type: 'fragment', scenarioId: sc.id, payload: f }, { targetType: sourceType }, null);
      }
    } else {
      const h = instantiateCoordHint(sc.id, { targetType: sourceType });
      if (h) applyLegendDrop({ type: 'coord_hint', scenarioId: sc.id, payload: h }, { targetType: sourceType }, null);
      else {
        const f = instantiateFragmentFromScenario(sc.id, { targetType: sourceType });
        if (f) applyLegendDrop({ type: 'fragment', scenarioId: sc.id, payload: f }, { targetType: sourceType }, null);
      }
    }
  }
  const civName = CIV_DOSSIER_CONFIG[civId]?.civName || civId.toUpperCase();
  if (typeof toast === 'function') toast(`+${n} drops ${civName} (cheat)`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ═══════════════════════════════════════════════════════════════════════════
// END Passe 6.1 — Consolidation
// ═══════════════════════════════════════════════════════════════════════════





// ─── HELPERS DE PIOCHE ───

// Pioche un type de cible selon les pondérations
// Retourne null si "rien détecté" (13% du temps)
function pickProbeTargetType() {
  const roll = Math.random() * PROBE_TOTAL_WEIGHT;
  let cumul = 0;
  for (const [key, cfg] of Object.entries(PROBE_TARGET_CONFIG)) {
    cumul += cfg.weight;
    if (roll < cumul) return key;
  }
  return null; // "rien détecté"
}  // 7 jours

// Charge G.knownTargets depuis localStorage (persistance entre sessions)
function loadKnownTargets() {
  try {
    const raw = localStorage.getItem('starbyte_known_targets');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Purger les entrées expirées + migration auto (passe 4.6 : status par défaut)
    const now = Date.now();
    const fresh = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && (!v.expiresAt || v.expiresAt > now)) {
        // Migration : si pas de status, c'est une cible legacy → 'available'
        if (!v.status) v.status = 'available';
        if (v.tankerMissionId === undefined) v.tankerMissionId = null;
        fresh[k] = v;
      }
    }
    return fresh;
  } catch (e) {
    return {};
  }
}

// Sauvegarde G.knownTargets dans localStorage (compactage automatique)
function saveKnownTargets() {
  if (!G || !G.knownTargets) return;
  try {
    // Si on dépasse la limite, on garde les plus récents
    let entries = Object.entries(G.knownTargets);
    if (entries.length > KNOWN_TARGETS_MAX) {
      entries.sort((a, b) => (b[1].discoveredAt || 0) - (a[1].discoveredAt || 0));
      entries = entries.slice(0, KNOWN_TARGETS_MAX);
      G.knownTargets = Object.fromEntries(entries);
    }
    localStorage.setItem('starbyte_known_targets', JSON.stringify(G.knownTargets));
  } catch (e) {
    // localStorage indisponible : ignore silencieusement
  }
}

// Ajoute une cible mouvante au registre persistant
function registerKnownTarget(coordKey, targetData) {
  if (!G.knownTargets) G.knownTargets = {};
  G.knownTargets[coordKey] = {
    ...targetData,
    status: targetData.status || 'available',  // 'available' | 'engaged'
    tankerMissionId: null,
    discoveredAt: Date.now(),
    expiresAt: Date.now() + KNOWN_TARGETS_TTL_MS,
  };
  saveKnownTargets();
}

// Marque une cible comme engagée par un tanker (passe 4.6)
// Cf. starbyte_gdd_v1/16_deux_univers.md — la cible reste visible mais grisée
function engageKnownTarget(coordKey, missionId) {
  if (!G.knownTargets || !G.knownTargets[coordKey]) return false;
  G.knownTargets[coordKey].status = 'engaged';
  G.knownTargets[coordKey].tankerMissionId = missionId;
  saveKnownTargets();
  return true;
}

// Libère une cible engagée (cas : tanker perdu — la cible redevient dispo)
// Cf. décision verrouillée Q3 mai 2026 — pas de double peine
function releaseKnownTarget(coordKey) {
  if (!G.knownTargets || !G.knownTargets[coordKey]) return false;
  G.knownTargets[coordKey].status = 'available';
  G.knownTargets[coordKey].tankerMissionId = null;
  saveKnownTargets();
  return true;
}

// Supprime une cible (exploitée par un tanker, expirée, etc.)
function removeKnownTarget(coordKey) {
  if (!G.knownTargets || !G.knownTargets[coordKey]) return;
  delete G.knownTargets[coordKey];
  saveKnownTargets();
}

// Génère un ID opaque SIG-XXX (3 caractères hex)
function _generateSignatureId() {
  // On boucle jusqu'à avoir un ID unique (collision rarissime)
  for (let attempt = 0; attempt < 50; attempt++) {
    const hex = Math.floor(Math.random() * 0xFFF).toString(16).toUpperCase().padStart(3, '0');
    const id = 'SIG-' + hex;
    if (!G.signatures || !G.signatures[id]) return id;
  }
  // Fallback ultra-rare : suffixe timestamp
  return 'SIG-' + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// Charge G.signatures depuis localStorage
function loadSignatures() {
  try {
    // 10/10/2026 — BUG : cette fonction est appelée à l'initialisation de G,
    // AVANT la déclaration de `const SIGNATURES_STORAGE_KEY` (TDZ → ReferenceError
    // avalé par le catch → {} → seedStarterSignature() écrasait le store à chaque
    // rechargement : toutes les signatures étaient perdues). Clé en littéral.
    const raw = localStorage.getItem('starbyte_signatures');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Purger les non-résolues expirées
    const now = Date.now();
    const fresh = {};
    // Regex d'un système valide : W-X-YYYY (ex: A-N-6208)
    const SYSTEM_REGEX = /^[A-Z]-[A-Z]-\d{1,4}$/;
    for (const [k, v] of Object.entries(parsed)) {
      if (!v) continue;
      // Fix BUG A : purger les signatures avec sig.system invalide
      // (anciens saves créés avant le fix de Radar aléatoire)
      if (!v.system || !SYSTEM_REGEX.test(v.system)) {
        continue; // skip — signature corrompue
      }
      // Une signature résolue fixe ne périme jamais
      // Une signature résolue mouvante a sa propre date (knownTargets)
      // Une signature non-résolue : on respecte expiresAt
      if (v.resolved && v.resolvedType === 'fixed') {
        fresh[k] = v; // permanente
      } else if (!v.expiresAt || v.expiresAt > now) {
        fresh[k] = v;
      }
      // 10/10/2026 — Carnet explicite : les signatures résolues avant cette
      // version étaient listées d'office ; on les garde (inCarnet=true).
      // Les nouvelles résolutions passent par le bouton « Ajouter au carnet »
      // du rapport (carnetPrompted=true), sauf verrouillage Moyenne (permanent).
      if (fresh[k] && v.resolved && !v.inCarnet && !v.carnetPrompted) fresh[k].inCarnet = true;
    }
    return fresh;
  } catch (e) {
    return {};
  }
}

// Sauvegarde G.signatures dans localStorage (cap à SIGNATURES_MAX)
function saveSignatures() {
  if (!G || !G.signatures) return;
  try {
    let entries = Object.entries(G.signatures);
    if (entries.length > SIGNATURES_MAX) {
      // Priorité : on garde toutes les résolues fixes, puis les plus récentes
      // 31/10 (Damien : « que des systèmes morts, fini les amas métalliques et les planètes ») — BUG : les résolues
      // fixes passaient en premier ; au-delà de 60, chaque NOUVELLE signature de Radar était supprimée à sa création.
      // Ordre de garde : non résolues (les nouvelles d'abord), corps à verrouiller, puis le reste ; les plus anciennes partent.
      const rank = (v) => !v.resolved ? 0 : (v.resolvedType === 'fixed' && !v.fixedAddress) ? 1 : v.inCarnet ? 2 : 3;
      entries.sort((a, b) => (rank(a[1]) - rank(b[1])) || ((b[1].resolvedAt || b[1].detectedAt || 0) - (a[1].resolvedAt || a[1].detectedAt || 0)));
      entries = entries.slice(0, SIGNATURES_MAX);
      G.signatures = Object.fromEntries(entries);
    }
    localStorage.setItem(SIGNATURES_STORAGE_KEY, JSON.stringify(G.signatures));
  } catch (e) {
    // localStorage indispo : ignore
  }
}

// Crée une nouvelle signature (déclenchée par Radar)
// systemAddress : 'A-K-6184' (format SYSTÈME, pas spot)
// detectedBy    : nom de la sonde
// override      : pour cheat / amorce de jeu (force type/position)
function createSignature(systemAddress, detectedBy, override) {
  if (!G.signatures) G.signatures = {};

  // Choisir un type pondéré
  // - metallic_echo + cold_mass dominants (gameplay early)
  // - unstable_field rare (Pilier 7)
  const typeWeights = override?.type
    ? [[override.type, 1]]
    : [
        ['metallic_echo', 30],
        ['cold_mass', 28],
        ['mineral_dense', 18],
        ['heat_point', 10],
        ['gas_envelope', 10],
        ['unstable_field', 4],  // rare
      ];
  const totalW = typeWeights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * totalW;
  let chosenType = typeWeights[0][0];
  for (const [t, w] of typeWeights) {
    r -= w;
    if (r <= 0) { chosenType = t; break; }
  }

  const typeData = SIGNATURE_TYPES[chosenType] || SIGNATURE_TYPES.cold_mass;
  const positions = typeData.position;
  const position = override?.position || positions[Math.floor(Math.random() * positions.length)];
  const intensity = override?.intensity || SIGNATURE_INTENSITIES[Math.floor(Math.random() * 3)]; // jamais "forte" par défaut

  // Action recommandée selon type
  let recommendedAction = 'sonde légère';
  if (chosenType === 'unstable_field') recommendedAction = 'sonde légère (prudence)';

  const id = override?.id || _generateSignatureId();
  const now = Date.now();
  G.signatures[id] = {
    id,
    system: systemAddress,
    detectedAt: now,
    detectedBy: detectedBy || 'Sonde inconnue',
    type: chosenType,
    typeLabel: typeData.label,
    intensity,
    position,
    interpretation: typeData.interpretation,
    recommendedAction,
    // État de résolution
    resolved: false,
    resolvedAt: null,
    resolvedType: null,        // 'moving' | 'fixed'
    movingCoordKey: null,      // ex: 'A-K-6184/80°-64°-E'
    fixedAddress: null,        // ex: 'A-K-6184-37'
    fixedClass: null,          // 'dead_world' | 'gas_giant' | 'habitable'
    // Métadonnées
    inCarnet: false,
    expiresAt: now + SIGNATURES_TTL_MS,
  };
  saveSignatures();
  return G.signatures[id];
}

// Récupère toutes les signatures non résolues d'un système
function getSignaturesInSystem(systemAddress) {
  if (!G.signatures) return [];
  return Object.values(G.signatures).filter(s =>
    s.system === systemAddress && !s.resolved
  );
}

// Marque une signature comme résolue mouvante (déclenchée par Légère)
function resolveSignatureToMoving(signatureId, movingCoordKey) {
  if (!G.signatures || !G.signatures[signatureId]) return false;
  const sig = G.signatures[signatureId];
  sig.resolved = true;
  sig.resolvedAt = Date.now();
  sig.resolvedType = 'moving';
  sig.movingCoordKey = movingCoordKey;
  sig.carnetPrompted = true; // le rapport Légère propose « Ajouter au carnet »
  // Les signatures mouvantes résolues partagent le TTL de la cible mouvante
  // (gérée via knownTargets) — on garde expiresAt en miroir
  saveSignatures();
  return true;
}

// Marque une signature comme résolue fixe (par Légère ou Moyenne)
// Quand résolue par Légère, fixedAddress reste null ; quand verrouillée par Moyenne, on l'a
function resolveSignatureToFixed(signatureId, fixedAddress, fixedClass) {
  if (!G.signatures || !G.signatures[signatureId]) return false;
  const sig = G.signatures[signatureId];
  sig.resolved = true;
  sig.resolvedAt = Date.now();
  sig.resolvedType = 'fixed';
  sig.fixedAddress = fixedAddress || null;
  sig.fixedClass = fixedClass || null;
  sig.carnetPrompted = true; // le rapport Légère propose « Ajouter au carnet »
  if (sig.fixedAddress) sig.inCarnet = true; // adresse verrouillée = permanente dans le carnet
  // Les signatures résolues fixes ne périment jamais
  sig.expiresAt = null;
  saveSignatures();
  return true;
}

// 10/10/2026 — Recrée une signature résolue à partir d'un rapport Légère/Moyenne
// (anciens saves où la signature a été perdue). Idempotent.
function rehydrateSignatureFromReport(r) {
  if (!r || !r.signatureId || !r.systemAddress) return null;
  if (!G.signatures) G.signatures = {};
  if (G.signatures[r.signatureId]) return G.signatures[r.signatureId];
  if (typeof createSignature !== 'function') return null;
  const sig = createSignature(r.systemAddress, 'Archives', { id: r.signatureId, type: r.signatureType || 'cold_mass' });
  if (!sig) return null;
  sig.detectedAt = r.createdAt || Date.now();
  sig.resolved = true;
  sig.resolvedAt = r.createdAt || Date.now();
  sig.carnetPrompted = true;
  if (r.signatureResolvedAs === 'moving') {
    sig.resolvedType = 'moving';
    sig.movingCoordKey = r.movingCoord || null;
  } else {
    sig.resolvedType = 'fixed';
    sig.fixedAddress = r.fixedAddress || null;
    sig.fixedClass = r.fixedClass || null;
    sig.expiresAt = null;
    if (sig.fixedAddress) sig.inCarnet = true;
  }
  saveSignatures();
  return sig;
}

// Bascule l'état "dans le carnet"
function toggleSignatureInCarnet(signatureId) {
  if (!G.signatures || !G.signatures[signatureId]) return false;
  G.signatures[signatureId].inCarnet = !G.signatures[signatureId].inCarnet;
  saveSignatures();
  return G.signatures[signatureId].inCarnet;
}

// Supprime une signature (joueur l'ignore)
function deleteSignature(signatureId) {
  if (!G.signatures || !G.signatures[signatureId]) return;
  delete G.signatures[signatureId];
  saveSignatures();
}

// Charge depuis localStorage
function loadSystemResolution() {
  try {
    // 10/10/2026 — même bug TDZ que loadSignatures (const déclarée plus bas) : clé en littéral.
    const raw = localStorage.getItem('starbyte_system_resolution');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Normaliser : convertir tous les % en entiers 0-100
    const fresh = {};
    for (const [k, v] of Object.entries(parsed)) {
      const pct = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      fresh[k] = pct;
    }
    return fresh;
  } catch (e) {
    return {};
  }
}

// Sauvegarde dans localStorage
function saveSystemResolution() {
  if (!G || !G.systemResolution) return;
  try {
    localStorage.setItem(SYSTEM_RESOLUTION_STORAGE_KEY, JSON.stringify(G.systemResolution));
  } catch (e) {
    // ignore
  }
}

function makeDefaultLegend() {
  return {
    civilizations: {
      caldris: {
        revealed: false,
        motifs: { nous_etions_47: { discovered: false, count: 0 } },
        lastSeenAt: null,
        consolidated: false,
        consolidatedAt: null,
        consolidatedBy: null,
        consolidatedSnapshot: null,
      },
      lumen: {
        revealed: false,
        motifs: { paix_definitive: { discovered: false, count: 0 } },
        lastSeenAt: null,
        consolidated: false,
        consolidatedAt: null,
        consolidatedBy: null,
        consolidatedSnapshot: null,
      },
      werath: {
        revealed: false,
        motifs: { nous_tenons: { discovered: false, count: 0 } },
        lastSeenAt: null,
        consolidated: false,
        consolidatedAt: null,
        consolidatedBy: null,
        consolidatedSnapshot: null,
      },
      erebus: {
        revealed: false,
        motifs: { nous_nous_retirons: { discovered: false, count: 0 } },
        lastSeenAt: null,
        consolidated: false,
        consolidatedAt: null,
        consolidatedBy: null,
        consolidatedSnapshot: null,
      },
      brigandiers: {
        revealed: false,
        motifs: { on_y_etait: { discovered: false, count: 0 } },
        lastSeenAt: null,
        consolidated: false,
        consolidatedAt: null,
        consolidatedBy: null,
        consolidatedSnapshot: null,
      },
    },
    fragments: [],
    relics: [],
    coordHints: [],
    discoveredFixedAssets: [],
    seenRevealMessages: [],
    ui: { lastViewedAt: null, badgeCount: 0 },
  };
}

function loadLegend() {
  try {
    const raw = localStorage.getItem(LEGEND_STORAGE_KEY);
    if (!raw) return makeDefaultLegend();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return makeDefaultLegend();
    // Fusion défensive avec defaults : si l'utilisateur a un save d'une version
    // antérieure sans certains champs, on les complète sans tout casser.
    const dflt = makeDefaultLegend();
    const merged = {
      civilizations: parsed.civilizations || dflt.civilizations,
      fragments: Array.isArray(parsed.fragments) ? parsed.fragments : [],
      relics: Array.isArray(parsed.relics) ? parsed.relics : [],
      coordHints: Array.isArray(parsed.coordHints) ? parsed.coordHints : [],
      discoveredFixedAssets: Array.isArray(parsed.discoveredFixedAssets) ? parsed.discoveredFixedAssets : [],
      seenRevealMessages: Array.isArray(parsed.seenRevealMessages) ? parsed.seenRevealMessages : [],
      ui: parsed.ui || dflt.ui,
    };
    // S'assurer que caldris existe dans civilisations
    if (!merged.civilizations.caldris) {
      merged.civilizations.caldris = dflt.civilizations.caldris;
    }
    if (!merged.civilizations.caldris.motifs) {
      merged.civilizations.caldris.motifs = dflt.civilizations.caldris.motifs;
    }
    // Passe 6.1 — migration : compléter les champs de consolidation absents
    // sur les saves antérieurs.
    if (typeof merged.civilizations.caldris.consolidated === 'undefined') {
      merged.civilizations.caldris.consolidated = false;
      merged.civilizations.caldris.consolidatedAt = null;
      merged.civilizations.caldris.consolidatedBy = null;
      merged.civilizations.caldris.consolidatedSnapshot = null;
    }
    // Phase Lumen+Werath — migration : ajouter Lumen et Werath aux saves antérieurs
    if (!merged.civilizations.lumen) {
      merged.civilizations.lumen = dflt.civilizations.lumen;
    }
    if (!merged.civilizations.werath) {
      merged.civilizations.werath = dflt.civilizations.werath;
    }
    // Phase Erebus — migration : ajouter Erebus aux saves antérieurs
    if (!merged.civilizations.erebus) {
      merged.civilizations.erebus = dflt.civilizations.erebus;
    }
    // Phase Brigandiers — migration : ajouter Brigandiers aux saves antérieurs
    if (!merged.civilizations.brigandiers) {
      merged.civilizations.brigandiers = dflt.civilizations.brigandiers;
    }
    return merged;
  } catch (e) {
    return makeDefaultLegend();
  }
}

function saveLegend() {
  if (!G || !G.legend) return;
  try {
    // Caps avant save
    if (G.legend.fragments.length > LEGEND_FRAGMENTS_MAX) {
      G.legend.fragments.length = LEGEND_FRAGMENTS_MAX;
    }
    if (G.legend.relics.length > LEGEND_RELICS_MAX) {
      G.legend.relics.length = LEGEND_RELICS_MAX;
    }
    if (G.legend.coordHints.length > LEGEND_COORD_HINTS_MAX) {
      G.legend.coordHints.length = LEGEND_COORD_HINTS_MAX;
    }
    localStorage.setItem(LEGEND_STORAGE_KEY, JSON.stringify(G.legend));
  } catch (e) {
    // localStorage indispo : ignore (le state reste en mémoire)
  }
}

// Récupère la résolution d'un système (0-100, 0 par défaut)
function getSystemResolution(systemAddress) {
  if (!G.systemResolution) return 0;
  return G.systemResolution[systemAddress] || 0;
}

// Ajoute du % de résolution à un système (clampé 0-100)
function addSystemResolution(systemAddress, delta) {
  if (!G.systemResolution) G.systemResolution = {};
  const current = G.systemResolution[systemAddress] || 0;
  const next = Math.max(0, Math.min(100, current + (delta || 0)));
  G.systemResolution[systemAddress] = next;
  saveSystemResolution();
  return next;
}

// Pose la résolution initiale (premier démarrage ou reset)
// - Système d'origine : 60% (le joueur connaît sa propre planète, mais pas
//   les autres corps célestes — il les découvrira via Radar/Légère/Moyenne).
//   Cf. starbyte_gdd_v1/17_signatures_resolution.md (humilité du Carta).
// - Voisins immédiats (±1 secteur) : tirage déterministe 0-30% pour amorcer
function seedInitialSystemResolution() {
  if (typeof MY_ADDRESS === 'undefined' || !MY_ADDRESS) return;
  if (!G.systemResolution) G.systemResolution = {};

  // Système d'origine : 60% (pas 100%) — le joueur découvrira le reste.
  // Migration legacy : tant que le Carta n'a pas commencé à s'excuser
  // (homeDiscoveries === 0), on force 60% — y compris pour les saves qui
  // étaient à 100% avant l'introduction de l'humilité du Carta.
  // Une fois la séquence commencée, on respecte la progression réelle.
  const mySys = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
  const existing = G.systemResolution[mySys];
  const humilityStarted = (typeof loadHomeDiscoveries === 'function')
    && loadHomeDiscoveries() > 0;
  if (!humilityStarted) {
    // Force 60% pour fresh start ou save legacy non-migré
    G.systemResolution[mySys] = 60;
  } else if (typeof existing !== 'number') {
    // Save corrompu : fallback sur 60%
    G.systemResolution[mySys] = 60;
  }
  // Sinon : on respecte la valeur existante (progression du joueur)

  // Voisins immédiats du SECTEUR (mêmes amas + secteur, ±5 systèmes autour)
  // Tirage déterministe pour cohérence multi-session
  const seed = (typeof _hashSeed === 'function')
    ? _hashSeed(`neighbors:${mySys}`)
    : 12345;
  const rng = (typeof _mulberry32 === 'function')
    ? _mulberry32(seed)
    : Math.random;

  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue;
    const neighborSys = MY_ADDRESS.system + offset;
    if (neighborSys < 1000 || neighborSys > 9999) continue;
    const sysKey = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${neighborSys}`;
    // Si déjà fixé (par sondes), on respecte
    if (G.systemResolution[sysKey] !== undefined) continue;
    // Tirage : 30% des voisins ont un peu de bruit ambient (5-20%)
    const r = rng();
    if (r < 0.30) {
      const pct = 5 + Math.floor(rng() * 15); // 5-19%
      G.systemResolution[sysKey] = pct;
    } else {
      G.systemResolution[sysKey] = 0;
    }
  }

  saveSystemResolution();
}

// Compteur persistant des découvertes faites dans le système d'origine.
function loadHomeDiscoveries() {
  try {
    const v = parseInt(localStorage.getItem(HOME_DISCOVERIES_KEY) || '0', 10);
    return isNaN(v) ? 0 : Math.max(0, v);
  } catch (e) { return 0; }
}
function saveHomeDiscoveries(n) {
  try { localStorage.setItem(HOME_DISCOVERIES_KEY, String(n | 0)); } catch (e) {}
}
function incrementHomeDiscoveries() {
  const n = loadHomeDiscoveries() + 1;
  saveHomeDiscoveries(n);
  return n;
}

// Vérifie si une adresse de système est celle du joueur.
function isHomeSystem(systemAddress) {
  if (typeof MY_ADDRESS === 'undefined' || !MY_ADDRESS) return false;
  if (!systemAddress) return false;
  const mySys = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
  return systemAddress === mySys;
}

// Génère le texte du communiqué du Carta scientifique selon le rang
// de découverte. Le ton se dégrade volontairement à chaque fois.
function buildCartaCommunique(rank, isFinal) {
  if (isFinal) {
    return {
      headline: 'DÉCLARATION FINALE DU CARTA SCIENTIFIQUE',
      body: "Notre système est désormais entièrement cartographié. C'est officiel. Cette fois, nous en sommes sûrs.\n\nLes anciens dirigeants du Carta ont été remplacés. Cinq fois. Le système est complet. Nous le jurons.",
      footer: 'Le Carta scientifique vous remercie de votre patience.',
    };
  }
  switch (rank) {
    case 1:
      return {
        headline: 'COMMUNIQUÉ OFFICIEL DU CARTA SCIENTIFIQUE',
        body: "Surprise dans notre propre cour. Notre planète n'était pas seule.\n\nLe Carta présente ses excuses formelles à toutes les institutions qui se sont appuyées sur ses cartes officielles ces derniers cycles. Notre confiance dans la cartographie du système d'origine est — révisée.",
        footer: "Les équipes de cartographie seront restructurées dans les prochains jours.",
      };
    case 2:
      return {
        headline: 'DEUXIÈME COMMUNIQUÉ DU CARTA SCIENTIFIQUE',
        body: "Une deuxième anomalie. Nous reconnaissons que la première communication n'était peut-être pas suffisamment humble.\n\nLe Carta s'engage à ne plus émettre de cartes définitives avant de prendre en compte la possibilité que — nous ne savions rien.",
        footer: "Un audit interne est en cours. Nous prendrons le temps qu'il faudra.",
      };
    case 3:
      return {
        headline: 'TROISIÈME COMMUNIQUÉ — LE CARTA SCIENTIFIQUE',
        body: "Encore une découverte. Nous arrêtons de promettre quoi que ce soit.\n\nUn nombre croissant de membres du Carta a déposé sa démission ce matin. Les bureaux du département cartographie sont — provisoirement — fermés au public.",
        footer: "Le Carta scientifique demande votre indulgence. Encore une fois.",
      };
    default:
      // Rang 4+ : ton totalement résigné
      return {
        headline: `${rank}ᵉ COMMUNIQUÉ DU CARTA SCIENTIFIQUE`,
        body: "Bonjour. Encore nous. Une nouvelle planète a été détectée dans le système d'origine.\n\nNous ne posons plus de questions. Nous ne faisons plus de promesses. Nous mettons à jour les cartes en silence.",
        footer: "Si vous trouvez une autre planète, vous savez maintenant à qui ne PAS la signaler.",
      };
  }
} // 4 heures

// Calcule le bruit de fond actuel d'un système (0-100, entier)
// Fonction PURE : pas de stockage, recalcul à chaque appel.
function getSystemWeather(systemAddress) {
  if (!systemAddress) return 0;

  // Système d'origine : pas de bruit (le joueur est dedans, capteurs locaux propres)
  if (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS) {
    const mySys = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`;
    if (systemAddress === mySys) return 0;
  }

  // Seed combiné : système + bucket de temps
  const timeBucket = Math.floor(Date.now() / WEATHER_PERIOD_MS);
  const seed = (typeof _hashSeed === 'function')
    ? _hashSeed(`weather:${systemAddress}:${timeBucket}`)
    : 12345;
  const rng = (typeof _mulberry32 === 'function')
    ? _mulberry32(seed)
    : Math.random;

  // Tirage pondéré (distribution réaliste) :
  // 50% claire (0-20)
  // 35% modérée (20-50)
  // 12% tempête (50-80)
  //  3% majeure (80-100)
  const r = rng();
  if (r < 0.50) return Math.floor(rng() * 20);
  if (r < 0.85) return 20 + Math.floor(rng() * 30);
  if (r < 0.97) return 50 + Math.floor(rng() * 30);
  return 80 + Math.floor(rng() * 20);
}

// Catégorise la météo en label visuel
//   { level: 'clear'|'moderate'|'storm'|'major', label, color, icon }
function getWeatherCategory(noise) {
  if (noise < 20) {
    return { level: 'clear', label: 'Météo claire', color: '#5fffe8', icon: 'weatherCalm' };
  }
  if (noise < 50) {
    return { level: 'moderate', label: 'Bruit modéré', color: '#ffc864', icon: 'weatherAlert' };
  }
  if (noise < 80) {
    return { level: 'storm', label: 'Tempête ionique', color: '#ff8c64', icon: 'weatherStorm' };
  }
  return { level: 'major', label: 'Tempête majeure', color: '#b02729', icon: 'weatherStorm' };
}

// Calcule le multiplicateur de coût énergie pour une sonde lancée
// vers un système donné. Retourne 1.0 (normal) ou 1.5 (mauvais temps).
// Pour l'instant on n'a pas de cost énergie dans PROBE_TIER_CONFIG (uniquement métal/cristal),
// mais le système est prêt pour quand on l'ajoutera.
function getWeatherCostMultiplier(systemAddress) {
  const noise = getSystemWeather(systemAddress);
  return noise >= 50 ? 1.5 : 1.0;
}

// Génère du contenu MOUVANT pour un spot vide (univers mouvant)
// Distribution : 40% épave · 30% astéroïde · 25% débris · 5% rien (silence Pilier 7)
// → "rien" laisse le joueur s'interroger : bug ? secret caché ? fond de bruit ?
function generateMovingContent(addr) {
  if (!addr || addr.kind !== 'spot') return null;

  // Seed personnel : le contenu mouvant est unique à chaque joueur ET à chaque
  // tirage de sonde. Pas de cache : si tu re-sondes, tu peux trouver autre chose.
  const r = Math.random();

  let type;
  if (r < 0.40) type = 'epave';
  else if (r < 0.70) type = 'asteroides';
  else if (r < 0.95) type = 'debris';
  else return null;  // 5% rien — silence intentionnel

  // Construire la cible avec le système existant (PROBE_TARGET_CONFIG)
  const target = (typeof buildProbeTarget === 'function')
    ? buildProbeTarget(type)
    : null;
  if (!target) return null;

  // Override : on lui donne l'adresse cosmique précise du spot
  const coordKey = `${addr.cluster}-${addr.sector}-${addr.system}-${String(addr.planet).padStart(2, '0')}`;
  target.cosmicAddress = coordKey;
  target.universe = 'mouvant';  // pour distinguer dans l'UI

  return target;
}

// Pioche un nom d'équipage spatial (anti-doublon mémoire récente)
function pickSpaceWorkerName() {
  const recent = (G.ambientReports || []).concat(G.tankerMissions || [])
    .slice(0, 10);
  const usedNames = new Set();
  recent.forEach(r => {
    WORKER_NAMES_SPACE.forEach(name => {
      if (r.narrative && r.narrative.includes(name)) usedNames.add(name);
    });
  });
  const available = WORKER_NAMES_SPACE.filter(n => !usedNames.has(n));
  if (available.length === 0) return WORKER_NAMES_SPACE[Math.floor(Math.random() * WORKER_NAMES_SPACE.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// Pioche un archétype Multivers SF
function pickMultiverseArchetype() {
  return MULTIVERS_ARCHETYPES[Math.floor(Math.random() * MULTIVERS_ARCHETYPES.length)];
}

/* PATCH_2110_NOMS — destination lisible d'une sonde ou d'un tanker : le joueur, la signature, le système… jamais un nom inventé seul */
function sbDestLabel(target) {
  const t = String(target || '').toUpperCase().split('/')[0].trim();
  const sysOf = k => String(k || '').split('-').slice(0, 3).join('-');
  const planetLbl = (coord) => {
    const p = typeof findPlanetByCoord === 'function' ? findPlanetByCoord(coord) : null;
    if (p && p.isMine) return 'ta planète';
    if (p && p.playerName) return p.playerName;
    if (p && (p.customName || p.name)) return p.customName || p.name;
    return 'planète';
  };
  const sysLbl = (k) => {
    try {
      const sys = (G.knownSystems || {})[k];
      const pl = sys && (sys.planets || []).find(x => x && x.playerName && !x.isMine);
      if (pl) return 'système de ' + pl.playerName;
      if (typeof MY_ADDRESS !== 'undefined' && k === `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`) return 'ton système';
    } catch (e) {}
    return 'système';
  };
  if (!t) return { label: 'secteur au hasard', coords: '' };
  if (/^SIG-/.test(t)) {
    const sig = (G.signatures || {})[t] || Object.values(G.signatures || {}).find(x => String(x.id || '').toUpperCase() === t);
    if (sig && sig.fixedAddress) return { label: planetLbl(sig.fixedAddress), coords: sig.fixedAddress };
    const where = sig && sig.system ? sysLbl(sysOf(sig.system)) : '';
    return { label: 'signature ' + (sig ? sig.id : t) + (where && where !== 'système' ? ' · ' + where : ''), coords: sig && sig.system ? sysOf(sig.system) : '' };
  }
  if (/^[A-Z]-[A-Z]-\d{4}-\d{1,2}$/.test(t)) return { label: planetLbl(t), coords: t };
  if (/^[A-Z]-[A-Z]-\d{4}$/.test(t)) return { label: sysLbl(t), coords: t };
  if (/^[A-Z]-[A-Z]$/.test(t)) return { label: 'secteur ' + t, coords: t };
  return { label: t, coords: '' };
}
function sbProbeTierLabel(tier) { return ({ radar: 'Radar', light: 'Légère', medium: 'Moyenne', stealth: 'Furtive', beacon: 'Balise' })[tier] || 'Sonde'; }
function generateProbeName() {
  const root = PROBE_NAMES_ROOTS[Math.floor(Math.random() * PROBE_NAMES_ROOTS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${root}-${num}`;
}
function pickProbeSector() {
  return PROBE_SECTORS[Math.floor(Math.random() * PROBE_SECTORS.length)];
}

// Génère des coordonnées aléatoires lisibles (format "47°-22°-N")
function generateProbeCoordinates() {
  const lat = Math.floor(Math.random() * 90);
  const lng = Math.floor(Math.random() * 90);
  const card = ['N', 'S', 'E', 'W'][Math.floor(Math.random() * 4)];
  return `${lat}°-${lng}°-${card}`;
}

// Durée aléatoire dans la plage configurée du type
function randomTankerDuration(targetType) {
  const cfg = PROBE_TARGET_CONFIG[targetType];
  if (!cfg) return 30 * 60 * 1000;
  return cfg.tankerDurationMinMs + Math.random() * (cfg.tankerDurationMaxMs - cfg.tankerDurationMinMs);
}

// Formate une durée ms en libellé lisible (5 min / 1h30 / 8h12)
function formatTankerDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

// Lance une sonde du tier donné vers les coords spécifiées
// tier = 'radar' | 'light' | 'medium' | 'stealth'
// targetCoords = string (ex: '47°-22°-N' pour local, 'C-2848' pour longue portée)
// mode = 'local' | 'long_range'
// force = retour immédiat (cheat)
function launchProbe(tier, targetCoords, mode, force) {
  tier = tier || 'light';
  mode = mode || 'local';
  if (!Array.isArray(G.probesPool)) G.probesPool = [];
  if (!Array.isArray(G.probeMissions)) G.probeMissions = [];

  // PASSE 5.4 — Defense in depth : revalider l'adresse avant le lancement
  // Bloque les cas où le dispatch viendrait d'un état stale (UI désynchronisée,
  // anciens saves, action depuis un autre écran...).
  // force=true bypasse (utilisé par les cheats uniquement).
  if (!force && targetCoords && typeof validateAddressForTier === 'function') {
    const v = validateAddressForTier(targetCoords, tier);
    if (!v.valid) {
      if (typeof toast === 'function') toast(v.error || 'Adresse invalide');
      return null;
    }
  }

  // Trouver une sonde "ready" du tier demandé
  const probe = G.probesPool.find(p => p.tier === tier && p.state === 'ready');
  if (!probe && !force) {
    if (typeof toast === 'function') toast(`Aucune sonde ${tier} disponible`);
    return null;
  }

  const now = Date.now();
  const durCfg = PROBE_DURATIONS_BY_TIER[tier] || PROBE_DURATIONS_BY_TIER.light;
  const duration = (durCfg.min + Math.random() * (durCfg.max - durCfg.min)) * (window.SBSkills ? SBSkills.durMult('probes') : 1);   // PATCH_1610_SKILLS

  // Coordonnées : si pas fournies, on génère aléatoirement
  const coords = targetCoords || generateProbeCoordinates();
  const sector = (mode === 'long_range') ? coords : pickProbeSector();

  const mission = {
    id: 'pm-' + now + '-' + Math.random().toString(36).slice(2, 6),
    probeId: probe?.id || null,
    probeName: generateProbeName(),
    tier,
    mode,
    targetCoords: coords,
    sector,
    departedAt: now,
    arrivalAt: force ? now : (now + duration),
    status: 'in_transit',
  };

  // Marquer la sonde comme "en mission"
  if (probe) probe.state = 'mission';

  G.probeMissions.push(sbTagWorld(mission));   // PATCH_3010_DEPART_CARTE : la carte la fait partir de la planète d'où elle est lancée

  if (force) {
    // Retour immédiat : on déclenche tout de suite
    handleProbeReturn(mission.id);
  }

  if (typeof toast === 'function') {
    const tierLabel = ({ radar: 'Radar', light: 'légère', medium: 'moyenne', stealth: 'furtive' })[tier];
    toast(force
      ? `${icon('satellite', {size:12})} ${sbProbeTierLabel(tier)} → ${sbDestLabel(coords).label} · retour immédiat · ${mission.probeName}`
      : `${icon('satellite', {size:12})} ${sbProbeTierLabel(tier)} lancée → ${sbDestLabel(coords).label} · retour dans ${formatTankerDuration(duration)}${window.SBSkills ? SBSkills.durTag('probes') : ''} · <span style="opacity:.6">${mission.probeName}</span>`);
  }
  return mission;
}

// Génère un rapport de sonde (0-3 cibles détectées)
function generateProbeReport(probeName, sector, tier, mode, targetCoords) {
  tier = tier || 'light';
  mode = mode || 'local';

  // ─── Si cible précise (spot) → on consulte l'univers fixe + génère mouvant ───
  // Cf. GDD 16_deux_univers.md
  const parsed = (typeof parseCosmicAddress === 'function')
    ? parseCosmicAddress(targetCoords || '')
    : null;

  let targets = [];
  let universeKind = 'random';  // 'fixed' (planète) | 'moving' (épave/astéroïde) | 'random' (mode aléatoire)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 5.1 — Résolution de SIGNATURE (Sonde Légère)
  // ═══════════════════════════════════════════════════════════════
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md
  //
  // Si la cible est une signature (SIG-XXX) et que la sonde est Légère,
  // on résout la signature : moving (coord mouvante exploitable) ou fixed
  // (corps orbital identifié, à verrouiller par Moyenne).
  if (parsed && parsed.kind === 'signature' && tier === 'light') {
    const sig = G.signatures && G.signatures[parsed.signatureId];
    if (sig && !sig.resolved) {
      // Décision : moving vs fixed selon le type de signature détecté
      // - metallic_echo : forcément moving (épave, débris) — 90%
      // - cold_mass    : majoritairement fixed (corps orbital) — 55% planète
      //                  (réajusté 14/05 — l'amorce reste majoritaire mais l'imprévisibilité revient)
      // - heat_point   : majoritairement fixed (activité = planète) — 70% planète
      // - gas_envelope : très majoritairement fixed (atmosphère) — 85% planète
      // - mineral_dense: majoritairement moving (astéroïdes) — 75% moving
      // - unstable_field: aléatoire 50/50 (Pilier 7 — incertitude)
      // Total global de chance « planète » par résolution Light ≈ 23% (1 sur 4).
      // Cf. décision Adrien 14/05 — la planète redevient un événement narratif.
      let resolveAsMoving;
      const r = Math.random();
      switch (sig.type) {
        case 'metallic_echo':  resolveAsMoving = r < 0.90; break;
        case 'cold_mass':      resolveAsMoving = r < 0.45; break;  // 85% → 55% planète (14/05)
        case 'heat_point':     resolveAsMoving = r < 0.30; break;  // 80% → 70% planète (14/05)
        case 'gas_envelope':   resolveAsMoving = r < 0.15; break;  // 95% → 85% planète (14/05)
        case 'mineral_dense':  resolveAsMoving = r < 0.75; break;
        case 'unstable_field': resolveAsMoving = r < 0.50; break;
        default:               resolveAsMoving = r < 0.50;
      }

      if (resolveAsMoving) {
        // ─── Résolution MOUVANTE : génère une coord deg°-deg°-letter ───
        // Cf. décision verrouillée #13 (grammaire mouvant)
        const deg1 = Math.floor(Math.random() * 180);
        const deg2 = Math.floor(Math.random() * 180);
        const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const movingCoord = `${sig.system}/${deg1}°-${deg2}°-${letter}`;

        // Générer le contenu mouvant en fonction du type de signature
        let movingType = 'asteroides';
        if (sig.type === 'metallic_echo') movingType = Math.random() < 0.6 ? 'epave' : 'debris';
        else if (sig.type === 'mineral_dense') movingType = Math.random() < 0.7 ? 'asteroides' : 'cristal';
        else if (sig.type === 'unstable_field') movingType = 'anomalie';

        // Construire la cible via le système existant (PROBE_TARGET_CONFIG)
        let movingTarget = null;
        if (typeof buildProbeTarget === 'function') {
          movingTarget = buildProbeTarget(movingType);
          if (movingTarget) {
            movingTarget.cosmicAddress = movingCoord;
            movingTarget.universe = 'moving';
            movingTarget.fromSignature = sig.id;
            targets.push(movingTarget);

            // Persister dans G.knownTargets pour exploitation tanker
            if (typeof registerKnownTarget === 'function') {
              registerKnownTarget(movingCoord, movingTarget);
            }
          }
        }

        // Mettre à jour la signature : résolue mouvante
        if (typeof resolveSignatureToMoving === 'function') {
          resolveSignatureToMoving(sig.id, movingCoord);
        }

        universeKind = 'moving';

        return {
          id: 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          probeName,
          sector: sig.system,
          tier,
          targetCoords,
          systemAddress: sig.system,
          createdAt: Date.now(),
          read: false,
          // Métadonnées signature
          signatureId: sig.id,
          signatureResolvedAs: 'moving',
          signatureType: sig.type,
          signatureTypeLabel: sig.typeLabel,
          movingCoord,
          // Cible pour compat tanker
          targets,
          universeKind,
          resolutionGain: 2,  // Cf. GDD chap 17 (+1-3% par résolution mouvante)
        };
      } else {
        // ─── Résolution FIXE : corps orbital identifié (mais pas verrouillé) ───
        // La Légère ne révèle pas encore l'adresse fixe. Elle dit juste
        // "corps orbital confirmé", il faudra une Moyenne pour verrouiller.

        // Type probable du corps orbital selon la signature
        let fixedClass = 'dead_world';
        if (sig.type === 'gas_envelope') fixedClass = 'gas_giant';
        else if (sig.type === 'heat_point') fixedClass = Math.random() < 0.6 ? 'habitable' : 'dead_world';
        else if (sig.type === 'cold_mass') fixedClass = Math.random() < 0.4 ? 'dead_world' : (Math.random() < 0.5 ? 'gas_giant' : 'habitable');
        else if (sig.type === 'unstable_field') fixedClass = 'unknown';

        // Mettre à jour la signature : résolue fixe (sans adresse encore)
        if (typeof resolveSignatureToFixed === 'function') {
          resolveSignatureToFixed(sig.id, null, fixedClass);
        }

        universeKind = 'fixed';

        return {
          id: 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          probeName,
          sector: sig.system,
          tier,
          targetCoords,
          systemAddress: sig.system,
          createdAt: Date.now(),
          read: false,
          // Métadonnées signature
          signatureId: sig.id,
          signatureResolvedAs: 'fixed',
          signatureType: sig.type,
          signatureTypeLabel: sig.typeLabel,
          fixedClass,
          targets: [],
          universeKind,
          resolutionGain: 4,  // Cf. GDD chap 17 (+2-5% par résolution fixe)
        };
      }
    }
    // Fallback : signature inconnue ou déjà résolue — comportement legacy
  }

  // ═══════════════════════════════════════════════════════════════
  // PASSE 5.2 — Verrouillage de SIGNATURE (Sonde Moyenne)
  // ═══════════════════════════════════════════════════════════════
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md
  //
  // Si la cible est une signature résolue fixe sans adresse, la Moyenne
  // verrouille l'adresse cosmique précise W-X-YYYY-Z et révèle le corps
  // orbital au joueur (ajout à knownSystems).
  if (parsed && parsed.kind === 'signature' && tier === 'medium') {
    const sig = G.signatures && G.signatures[parsed.signatureId];
    if (sig && sig.resolved && sig.resolvedType === 'fixed' && !sig.fixedAddress) {
      // ─── Choisir un slot Z disponible dans le système ───
      // On regarde les 3 slots déterministes du système et on prend celui :
      // 1) dont le type correspond au fixedClass de la signature
      // 2) qui n'est pas déjà connu du joueur (déjà dans knownSystems)
      // 3) qui n'est pas la planète du joueur (skip self)
      const sysParts = sig.system.split('-'); // ex: ['A','N','6208']
      const sysAddr = {
        cluster: sysParts[0],
        sector: sysParts[1],
        system: parseInt(sysParts[2], 10),
      };
      // PASSE 5.5 — Utiliser TOUS les slots célestes (habitables + non-habitables)
      const allSlots = (typeof getAllCelestialSlotsInSystem === 'function')
        ? getAllCelestialSlotsInSystem(sysAddr)
        : (typeof getPlanetSlotsInSystem === 'function')
          ? getPlanetSlotsInSystem(sysAddr)
          : [];

      // Slots déjà connus dans knownSystems
      const sysKey = `${sysAddr.cluster}-${sysAddr.sector}-${sysAddr.system}`;
      const known = (G.knownSystems && G.knownSystems[sysKey]) ? G.knownSystems[sysKey] : null;
      const knownSlots = known ? known.planets.map(p => p.index) : [];

      // Slots déjà verrouillés via signature
      const lockedSlots = G.signatures
        ? Object.values(G.signatures)
            .filter(s => s.fixedAddress && s.system === sig.system)
            .map(s => {
              const parts = s.fixedAddress.split('-');
              return parseInt(parts[3], 10);
            })
        : [];

      const availableSlots = allSlots.filter(s => !knownSlots.includes(s) && !lockedSlots.includes(s));

      // PASSE 5.5 — Match avec fixedClass via getCelestialTypeForSlot (unifié)
      const slotMatchesClass = (slot) => {
        const slotType = (typeof getCelestialTypeForSlot === 'function')
          ? getCelestialTypeForSlot(sysAddr, slot)
          : null;
        if (sig.fixedClass === 'dead_world')  return slotType === 'dead_world' || slotType === 'lunar';
        if (sig.fixedClass === 'habitable')   return slotType === 'habitable';
        if (sig.fixedClass === 'gas_giant')   return slotType === 'gas_giant';
        return true; // unknown ou autres : on accepte
      };

      // Priorité : slot qui matche la classe → puis n'importe quel slot dispo
      let chosenSlot = availableSlots.find(slotMatchesClass) || availableSlots[0];

      if (!chosenSlot) {
        // Aucun slot dispo : tous les corps du système sont déjà connus
        // → cas anormal mais on retourne un rapport "déjà connu"
        return {
          id: 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          probeName,
          sector: sig.system,
          tier,
          targetCoords,
          systemAddress: sig.system,
          createdAt: Date.now(),
          read: false,
          signatureId: sig.id,
          signatureLockFailed: true,
          signatureLockFailReason: 'no_slot',
          targets: [],
          universeKind: 'fixed',
          resolutionGain: 0,
        };
      }

      // ─── Générer l'adresse fixe et verrouiller ───
      const fixedAddress = `${sig.system}-${String(chosenSlot).padStart(2, '0')}`;

      // PASSE 5.5 — Récupérer le type RÉEL via getCelestialTypeForSlot (unifié hab + non-hab)
      const realFixedClass = (typeof getCelestialTypeForSlot === 'function')
        ? (getCelestialTypeForSlot(sysAddr, chosenSlot) || sig.fixedClass || 'habitable')
        : (sig.fixedClass || 'habitable');

      // Mettre à jour la signature (résolue fixe + adresse verrouillée)
      if (typeof resolveSignatureToFixed === 'function') {
        resolveSignatureToFixed(sig.id, fixedAddress, realFixedClass);
      }

      // Ajouter la planète au knownSystems du joueur (revealPlanetToPlayer)
      const planetMetaByClass = {
        dead_world:  { type: 'dead',      name: 'Planète morte',    desc: 'Aucune signature thermique' },
        habitable:   { type: 'habitable', name: 'Monde inexploré',  desc: 'Atmosphère respirable détectée' },
        gas_giant:   { type: 'gas',       name: 'Géante gazeuse',   desc: 'Atmosphère dense, non habitable' },
        lunar:       { type: 'lunar',     name: 'Lune stérile',     desc: 'Surface rocheuse, sans atmosphère' },
      };
      const meta = planetMetaByClass[realFixedClass] || planetMetaByClass.habitable;

      if (typeof revealPlanetToPlayer === 'function') {
        revealPlanetToPlayer({
          cluster: sysAddr.cluster,
          sector: sysAddr.sector,
          system: sysAddr.system,
          planet: chosenSlot,
        }, meta);
      }

      universeKind = 'fixed';

      return {
        id: 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        probeName,
        sector: sig.system,
        tier,
        targetCoords,
        systemAddress: sig.system,
        createdAt: Date.now(),
        read: false,
        // Métadonnées signature
        signatureId: sig.id,
        signatureResolvedAs: 'fixed',
        signatureLocked: true,
        signatureType: sig.type,
        signatureTypeLabel: sig.typeLabel,
        fixedAddress,
        fixedClass: realFixedClass,
        targets: [],
        universeKind,
        resolutionGain: 15,  // Cf. GDD chap 17 (+12-18% par verrouillage Moyenne)
      };
    }
    // Fallback : signature non éligible — comportement legacy en-dessous
  }

  if (parsed && parsed.kind === 'spot') {
    const classification = classifyAddress(parsed);

    if (classification === 'self' || classification === 'habitable'
        || classification === 'dead' || classification === 'gas') {
      // Univers FIXE : planète détectée — on génère un rapport de planète
      // (pour l'instant on garde le comportement existant — pas de cible à miner,
      //  c'est une planète, pas un astéroïde. On retournera tout ça via le hub Univers.)
      universeKind = 'fixed';
      // Pas de "targets" minables ici — c'est une planète, géré via la map Univers
      // On peut générer 1 cible "scan complémentaire" pour montrer qu'il y a quelque chose
      const supplementary = (Math.random() < 0.30 && tier !== 'radar')
        ? buildProbeTarget(pickProbeTargetType())
        : null;
      if (supplementary) {
        supplementary.cosmicAddress = `${parsed.cluster}-${parsed.sector}-${parsed.system}-${String(parsed.planet).padStart(2, '0')}`;
        supplementary.universe = 'fixed_satellite';  // satellite naturel de la planète
        targets.push(supplementary);
      }
    } else {
      // Univers MOUVANT : spot vide → on génère du contenu mouvant
      universeKind = 'moving';
      const movingTarget = generateMovingContent(parsed);
      if (movingTarget) {
        targets.push(movingTarget);
        // Persister dans G.knownTargets pour exploitation future par tanker
        if (typeof registerKnownTarget === 'function') {
          registerKnownTarget(movingTarget.cosmicAddress, movingTarget);
        }
      }
      // sinon : silence (5% — Pilier 7)
    }
  } else {
    // ─── Mode aléatoire (pas de cible précise) → comportement legacy ───
    // Nombre de cibles : 0, 1, 2 ou 3 selon le tier
    // Légère : 13% rien | 35% 1 | 35% 2 | 17% 3
    // Moyenne : 5% rien | 25% 1 | 40% 2 | 30% 3
    // Furtive : 0% rien | 20% 1 | 40% 2 | 40% 3
    const roll = Math.random();
    let nTargets;
    if (tier === 'medium') {
      if (roll < 0.05) nTargets = 0;
      else if (roll < 0.30) nTargets = 1;
      else if (roll < 0.70) nTargets = 2;
      else nTargets = 3;
    } else if (tier === 'stealth') {
      if (roll < 0.20) nTargets = 1;
      else if (roll < 0.60) nTargets = 2;
      else nTargets = 3;
    } else {
      if (roll < 0.13) nTargets = 0;
      else if (roll < 0.48) nTargets = 1;
      else if (roll < 0.83) nTargets = 2;
      else nTargets = 3;
    }
    for (let i = 0; i < nTargets; i++) {
      const type = pickProbeTargetType();
      if (!type) continue;
      const t = buildProbeTarget(type);
      if (t) {
        t.universe = 'moving';  // les cibles aléatoires sont par défaut mouvantes
        targets.push(t);
      }
    }
  }

  const report = {
    id: 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    probeName,
    sector,
    tier,
    mode,
    targetCoords: targetCoords || null,
    universeKind,  // 'fixed' | 'moving' | 'random' — pour l'UI
    createdAt: Date.now(),
    read: false,
    targets,
  };
  return report;
}

// Construit un objet "cible" pour un type donné
function buildProbeTarget(type) {
  const cfg = PROBE_TARGET_CONFIG[type];
  if (!cfg) return null;

  // Calcule loot estimé pour visibilité du rapport
  let lootEstimate = null;
  if (cfg.lootVisibility === 'estimation_30pct') {
    const baseMin = cfg.lootMin;
    const baseMax = cfg.lootMax;
    const center = Math.round((baseMin + baseMax) / 2);
    const variance = Math.round(center * 0.3);
    lootEstimate = {
      resource: cfg.lootResource,
      min: Math.max(0, center - variance),
      max: center + variance,
    };
  }

  // Durée mission tanker (aléatoire dans la plage)
  const tankerDurationMs = randomTankerDuration(type);

  return {
    id: 'tgt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type,
    label: cfg.label,
    icon: cfg.icon,
    coordinates: generateProbeCoordinates(),
    lootEstimate,
    lootVisibility: cfg.lootVisibility,
    tankerDurationMs,
    riskLossPct: cfg.riskLossPct,
    hasNarrative: cfg.hasNarrative,
    status: 'pending',                  // 'pending' | 'tanker_sent' | 'tanker_returned' | 'expired'
    tankerMissionId: null,
  };
}

// Quand la sonde revient : on génère son rapport et on le stocke
function handleProbeReturn(missionId) {
  if (!Array.isArray(G.probeMissions)) return;
  const idx = G.probeMissions.findIndex(p => p.id === missionId);
  if (idx === -1) return;
  const mission = G.probeMissions[idx];
  if (mission.status !== 'in_transit') return;

  // PATCH_1410_ECLAIREUR — Moyenne en éclaireur : elle se consume en traçant le passage, qui devient une route
  if (mission.mode === 'scout' && window.SBLines) {
    SBLines.scoutArrived(mission);
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return null;
  }

  // ⚡ Phase 4 P1 — Balise persistante : ne génère pas de rapport, ne brûle pas, ne revient pas.
  // La sonde arrive à destination et passe en état 'deployed' indéfiniment.
  // Elle générera des détections passives via tickActiveBeacons.
  const cfg = (typeof PROBE_TIER_CONFIG !== 'undefined') ? PROBE_TIER_CONFIG[mission.tier] : null;
  if (cfg && cfg.behavior === 'persistent') {
    mission.status = 'deployed';
    mission.deployedAt = Date.now();
    mission.detectionCount = 0;
    // Retirer la mission de la liste in_transit, la balise vit maintenant via le pool
    G.probeMissions.splice(idx, 1);
    // Marquer la sonde dans le pool comme déployée (état distinct de 'ready' et 'mission')
    const probeInPool = (G.probesPool || []).find(p => p.id === mission.probeId);
    if (probeInPool) {
      probeInPool.state = 'deployed';
      probeInPool.deployedAt = Date.now();
      probeInPool.deployedSystem = mission.targetCoords;  // mémorise le système surveillé
      probeInPool.detectionCount = 0;
    }
    if (typeof toast === 'function') {
      toast(`${icon('satellite', {size:12})} Balise ${mission.probeName} déployée sur ${mission.targetCoords}`);
    }
    if (_mpOnline()) window.SBMP.pollPiracy();   // PIRATERIE_1210 — la balise rejoint le registre
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return null;
  }

  // MULTIJOUEUR v0 : la sonde a atteint un système → les vrais mondes qui y vivent se révèlent
  if (window.SBMP && mission.targetCoords) window.SBMP.onProbeArrived(mission.targetCoords);

  // ─── PASSE 4-sondes-v1.1 : Vérifier d'abord si un secret se déclenche ───
  // Cf. PILIER 7 — Le contenu invisible. Si secret déclenché, il prend
  // le contrôle de tout le retour (peut être silencieux, partiel, etc.)
  const secretHandled = (typeof checkSecretTrigger === 'function')
    ? checkSecretTrigger(mission)
    : false;

  if (secretHandled === 'silent_loss') {
    // RÈGLE ABSOLUE : la sonde disparaît sans laisser de traces
    // Aucune notification. Aucun rapport. Le compteur change, c'est tout.
    G.probeMissions.splice(idx, 1);
    // La sonde dans le pool est DÉTRUITE (pas remise en 'ready')
    const probeInPool = (G.probesPool || []).find(p => p.id === mission.probeId);
    if (probeInPool) {
      const poolIdx = G.probesPool.indexOf(probeInPool);
      if (poolIdx !== -1) G.probesPool.splice(poolIdx, 1);
    }
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return null; // SILENCE
  }

  if (secretHandled === 'force_silent_radar') {
    // Stage 0 du trou noir : la sonde Radar revient (sacrificielle → brûle)
    // MAIS le rapport est FORCÉMENT silencieux (100%, pas 30%).
    // C'est ce qui rend l'adresse "suspecte" pour un joueur qui sonde plusieurs fois.
    const report = generateRadarReport(mission);
    // PASSE 5.0 : si le générateur a créé des signatures, on les NETTOIE — le silence
    // ne doit jamais coexister avec une découverte. Cf. Principe #7 + Pilier 7.
    if (Array.isArray(report.signatureIds) && report.signatureIds.length > 0) {
      for (const sigId of report.signatureIds) {
        if (typeof deleteSignature === 'function') deleteSignature(sigId);
      }
      report.signatureIds = [];
      report.signaturesData = [];
    }
    report.silent = true;  // override : forcer silence
    report.signal = null;  // pas de signal détecté
    report.radarSignal = null;
    report.resolutionGain = 0; // pas de progression possible sur un secret silencieux
    if (!Array.isArray(G.probeReports)) G.probeReports = [];
    G.probeReports.unshift(report);
    if (G.probeReports.length > 50) G.probeReports.length = 50;
    // Radar = sacrificielle, on retire la sonde du pool
    G.probeMissions.splice(idx, 1);
    const probeInPool = (G.probesPool || []).find(p => p.id === mission.probeId);
    if (probeInPool) {
      const poolIdx = G.probesPool.indexOf(probeInPool);
      if (poolIdx !== -1) G.probesPool.splice(poolIdx, 1);
    }
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return report;
  }

  if (secretHandled && typeof secretHandled === 'object') {
    // Le secret a produit un rapport spécial (partial_report, etc.)
    // Le rapport est déjà stocké par le moteur de secrets. On remet la sonde au pool.
    mission.status = 'returned';
    G.probeMissions.splice(idx, 1);
    const probeInPool = (G.probesPool || []).find(p => p.id === mission.probeId);
    if (probeInPool) probeInPool.state = 'ready';
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return secretHandled;
  }

  // ─── Comportement par défaut (pas de secret) ───
  // Différencier le comportement selon le tier
  let report;
  if (mission.tier === 'radar') {
    report = generateRadarReport(mission);
  } else {
    report = generateProbeReport(mission.probeName, mission.sector, mission.tier, mission.mode, mission.targetCoords);
  }
  if (mission.tier === 'stealth' && report) {   // PATCH_1610_SPY : un relevé d'espionnage, pas une prospection au hasard
    report.targets = []; report.spyOnly = true;
    _spyEnrichReport(report, mission.targetCoords);
  }

  // Storage
  if (!Array.isArray(G.probeReports)) G.probeReports = [];
  G.probeReports.unshift(report);
  if (G.probeReports.length > 50) G.probeReports.length = 50;

  // PASSE 5.7 — Appliquer le gain de résolution au système ciblé
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md (Métrique de résolution)
  if (report && report.resolutionGain && report.systemAddress) {
    if (typeof addSystemResolution === 'function') {
      addSystemResolution(report.systemAddress, report.resolutionGain);
    }
  }

  // ─── Découverte dans le système d'origine (humilité du Carta) ───
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md
  // Si la résolution LÉGÈRE révèle une planète fixe dans le système
  // d'origine, on déclenche un communiqué du Carta scientifique.
  // - Résolutions mouvantes (épaves, débris) : pas de communiqué (ne contredit
  //   pas la cartographie planétaire).
  // - Verrouillages Moyenne : pas de communiqué non plus (ne révèle pas une
  //   nouvelle planète, juste l'adresse exacte d'une planète déjà découverte).
  if (report
      && report.signatureResolvedAs === 'fixed'
      && !report.signatureLocked
      && typeof isHomeSystem === 'function'
      && isHomeSystem(report.systemAddress)) {
    const rank = (typeof incrementHomeDiscoveries === 'function')
      ? incrementHomeDiscoveries()
      : 1;
    report.homeSystemSurprise = true;
    report.homeSystemSurpriseRank = rank;
    // Détecter si on vient d'atteindre 100% de résolution sur mon système
    if (typeof getSystemResolution === 'function') {
      const res = getSystemResolution(report.systemAddress);
      if (res >= 100) {
        report.homeSystemFullyMapped = true;
      }
    }
    // Construire le texte du communiqué (sera affiché dans le rapport)
    if (typeof buildCartaCommunique === 'function') {
      report.cartaCommunique = buildCartaCommunique(rank, !!report.homeSystemFullyMapped);
    }
  }

  // ─── PASSE 6 — Découverte de lieu fixe Caldris ───
  // Cf. décision Adrien Q2 : un coord_hint partiel + sonde Moyenne (ou Light
  // pour certains lieux) sur la zone → découverte du lieu fixe + révélation
  // de plusieurs scénarios d'un coup (effet "trésor").
  if (typeof maybeDiscoverFixedAsset === 'function') {
    const discovery = maybeDiscoverFixedAsset(mission);
    if (discovery && report) {
      report.legendDiscovery = {
        coord: discovery.fullCoord,
        assetName: discovery.asset.name,
        assetPublicName: discovery.asset.publicName,
        assetDescription: discovery.asset.description,
        fragmentsRevealed: discovery.generatedFragments.length,
        fragmentIds: discovery.generatedFragments.map(f => f.id),
      };
      // Toast solennel — c'est un moment rare et fort
      if (typeof toast === 'function') {
        const assetName = G.legend?.civilizations?.caldris?.revealed
          ? discovery.asset.name
          : discovery.asset.publicName;
        toast(`🏺 Découverte majeure : ${assetName} · ${discovery.generatedFragments.length} fragments archivés`);
      }
    }
  }

  // Marquer la mission terminée
  mission.status = 'returned';
  G.probeMissions.splice(idx, 1);

  // Comportement par tier sur le pool
  const probeInPool = (G.probesPool || []).find(p => p.id === mission.probeId);
  if (probeInPool) {
    if (mission.tier === 'radar') {
      // RADAR = sacrificiel : brûle à l'arrivée, retiré du pool
      const poolIdx = G.probesPool.indexOf(probeInPool);
      if (poolIdx !== -1) G.probesPool.splice(poolIdx, 1);
    } else {
      // Légère/Moyenne/Furtive : revient au pool
      probeInPool.state = 'ready';
    }
  }

  // Notification
  if (typeof toast === 'function') {
    if (mission.tier === 'radar') {
      toast(report.silent
        ? `${icon('satellite', {size:12})} ${sbProbeTierLabel(mission.tier)} de retour de ${sbDestLabel(mission.targetCoords).label} : silence radio`
        : `${icon('satellite', {size:12})} ${sbProbeTierLabel(mission.tier)} de retour de ${sbDestLabel(mission.targetCoords).label} : signal détecté`);
    } else {
      const n = report.targets?.length || 0;
      toast(n === 0
        ? `${icon('satellite', {size:12})} ${sbProbeTierLabel(mission.tier)} de retour de ${sbDestLabel(mission.targetCoords).label} : rien de relevé`
        : `${icon('satellite', {size:12})} ${sbProbeTierLabel(mission.tier)} de retour de ${sbDestLabel(mission.targetCoords).label} : ${n} cible${n > 1 ? 's' : ''} détectée${n > 1 ? 's' : ''}`);
    }
  }

  // Re-render si on est sur le bon écran
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return report;
}          // anti-spam : max 2 dét/minute/balise

// Retourne les balises actuellement déployées (depuis G.probesPool)
function getDeployedBeacons() {
  return sbAllProbes().filter(p => p.tier === 'beacon' && p.state === 'deployed');
}

// Purge les détections expirées (au-delà de la fenêtre d'interception)
function purgeExpiredBeaconDetections() {
  if (!Array.isArray(G.beaconReports)) { G.beaconReports = []; return; }
  const now = Date.now();
  // PATCH_1710_BEACON_HISTORY — on garde l'historique (24 h, 30 derniers) ; seule la fenêtre d'interception se ferme
  G.beaconReports = G.beaconReports
    .filter(d => now - (d.createdAt || d.expiresAt || 0) < BEACON_HISTORY_MS)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, BEACON_HISTORY_MAX);
}

// Tick principal : génère les détections passives pour chaque balise active
function tickActiveBeacons() {
  // Toujours purger d'abord (même sans balises)
  purgeExpiredBeaconDetections();

  const beacons = getDeployedBeacons();
  if (beacons.length === 0) return;

  const now = Date.now();
  if (!Array.isArray(G.beaconReports)) G.beaconReports = [];

  // PATCH_1410_LIGNES — les balises ne voient plus que ce qui passe vraiment : les convois des lignes PNJ
  if (window.SBLines) { SBLines.tickBeacons(beacons, now); return; }
  // PATCH_1310_BOTS — un seul tirage par tick pour toutes les balises, puis une balise au hasard
  if (now - (G._lastNpcBeaconAt || 0) < BEACON_NPC_MIN_GAP_MS) return;
  const _perTick = BEACON_NPC_PER_HOUR * Math.sqrt(beacons.length) / 360;   // 360 ticks de 10 s par heure
  if (Math.random() > _perTick) return;
  const _pick = beacons[Math.floor(Math.random() * beacons.length)];
  G._lastNpcBeaconAt = now;
  for (const b of [_pick]) {

    // Anti-spam : pas plus de N détections par minute sur la même balise
    const recentDetections = G.beaconReports.filter(d =>
      d.beaconId === b.id && (now - d.createdAt) < 60000
    );
    if (recentDetections.length >= BEACON_DETECTION_MAX_PER_MIN) continue;

    // Générer un faux contact
    const target = _generateBeaconDetectionTarget();
    // Rapport unifié — même structure que probeReports / tankerReports
    // (id, createdAt, read) + données spécifiques (beaconId, systemCoord, target, expiresAt)
    const report = {
      id: 'br-' + now + '-' + Math.random().toString(36).slice(2, 6),
      kind: 'beacon',                     // pour identification dans le collecteur
      beaconId: b.id,
      beaconName: 'Balise',               // V1 : nom générique (les balises n'ont pas de nom unique pour l'instant)
      systemCoord: b.deployedSystem,
      createdAt: now,
      expiresAt: now + BEACON_DETECTION_WINDOW_MS,
      target,                              // { type, name, tankerTier, cargoEstimate, confidence }
      read: false,
    };
    G.beaconReports.push(report);
    b.detectionCount = (b.detectionCount || 0) + 1;

    if (typeof toast === 'function') {
      toast(`${icon('satellite', {size:12})} Détection sur ${b.deployedSystem} : ${target.name}`);
    }
  }
}

// Génère un contact fictif (PNJ / univers mouvant / faux joueur)
// V1 solo : RNG simule l'univers vivant. V3 backend : vrais joueurs.
function _generateBeaconDetectionTarget() {
  const rand = Math.random();
  let type;
  if (rand < 0.55) type = 'pnj';            // 55% PNJ
  else if (rand < 0.85) type = 'wandering'; // 30% univers mouvant
  else type = _mpOnline() ? 'pnj' : 'player';   // 15% faux joueur hors ligne ; en ligne, les vrais convois viennent du registre

  // Pool noms PNJ (capitaines tanker du jeu)
  const pnjNames = (typeof HERO_NAMES !== 'undefined' && Array.isArray(HERO_NAMES.tanker))
    ? HERO_NAMES.tanker
    : ['Bertrand Voll', 'Marta Pellican', 'Olek Stom'];

  // Pool noms joueurs simulés (style usernames)
  const playerNames = ['BERSEK89', 'AnuB1S34', 'Korr_Lord', 'BlackVein7',
                       'NEXUS42', 'VoidWalker', 'ShadowFleet', 'PhoenixCDR'];

  // Types d'objets mouvants (univers mouvant — cf. GDD ch.16)
  const wanderingTypes = ['Épave dérivante', 'Cargo abandonné', 'Convoi non identifié', 'Signal faible'];

  let name, tier, confidence;
  if (type === 'pnj') {
    name = pnjNames[Math.floor(Math.random() * pnjNames.length)];
    tier = 1 + Math.floor(Math.random() * 2);     // T1-T2
    confidence = 65 + Math.floor(Math.random() * 25);  // 65-89%
  } else if (type === 'wandering') {
    name = wanderingTypes[Math.floor(Math.random() * wanderingTypes.length)];
    tier = 1;
    confidence = 30 + Math.floor(Math.random() * 30);  // 30-59% (incertain)
  } else {
    name = playerNames[Math.floor(Math.random() * playerNames.length)];
    tier = 1 + Math.floor(Math.random() * 3);     // T1-T3
    confidence = 70 + Math.floor(Math.random() * 25);  // 70-94%
  }

  const cargoLabels = ['léger', 'moyen', 'lourd'];
  return {
    type,
    name,
    tankerTier: tier,
    cargoEstimate: cargoLabels[Math.min(tier - 1, 2)],
    confidence,
  };
}

// ⚡ Phase 4 P1 — Rappel d'une balise déployée
// V1 simplifié : retour immédiat au pool (état 'ready'), pas de timer.
// V2+ : voyage de retour, possibilité d'interception, etc.
function recallBeacon(beaconId, confirmed) {
  const pool = sbAllProbes();   // 30/10 : une balise de n'importe laquelle de mes planètes
  const beacon = pool.find(p => p.id === beaconId && p.tier === 'beacon');
  // PATCH_1510_ORDRES — balise sur une route vendue il y a moins de 7 jours : la retirer trahit l'acheteur
  const _sold = (!confirmed && beacon && beacon.state === 'deployed' && window.SBLines && SBLines.salesOn) ? SBLines.salesOn(_mpSys(beacon.deployedSystem)) : [];
  if (_sold.length && typeof sbConfirmWarning === 'function') {
    sbConfirmWarning('Trahir ton acheteur ?', `Cette balise entretient le balisage de <strong>${_sold.map(x => String((x.route && x.route.name) || 'ta route').replace(/[<>&"]/g, '')).join(', ')}</strong>, vendue à ${_sold.map(x => String(x.buyer_pseudo || '?').replace(/[<>&"]/g, '')).join(', ')}.<br><br>La rappeler, c'est trahir : le port lui donne ta caution et le comptoir en parlera.`, 'Rappeler quand même')
      .then(ok => { if (ok) { recallBeacon(beaconId, true); if (typeof saveGame === 'function') saveGame(); } });
    return;
  }
  if (!beacon) {
    if (typeof toast === 'function') toast('Balise introuvable');
    return;
  }
  if (beacon.state !== 'deployed') {
    if (typeof toast === 'function') toast('La balise n\'est pas déployée');
    return;
  }
  // Retour au pool : prête à être renvoyée
  const systemBefore = beacon.deployedSystem;
  beacon.state = 'ready';
  delete beacon.deployedAt;
  delete beacon.deployedSystem;
  // detectionCount reste pour mémoire historique

  if (typeof toast === 'function') {
    const _blind = (G.fleet.prepared || []).some(x => x.ambush && x.ambush.system === _mpSys(systemBefore));
    toast(`Balise rappelée de ${systemBefore} — disponible au hangar${_blind ? ' · ta flotte en embuscade y est désormais aveugle' : ''}`);
  }
  if (_mpOnline()) window.SBMP.pollPiracy();   // PIRATERIE_1210
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
