/* Starbyte — f07_planete_capitale_commerce.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


function renderPlanetEntry(p, withCard) {
  // Habitable occupée par un joueur → afficher son nom (feedback V3 16/05 #6)
  let tag;
  if (p.isMine) {
    tag = '<span class="uni-planet-tag mine">MOI</span>';
  } else if (p.type === 'player' || (p.type === 'habitable' && p.playerName)) {
    tag = `<span class="uni-planet-tag player">${_escapeHtml(p.playerName || 'JOUEUR')}</span>`;
  } else {
    tag = '<span class="uni-planet-tag empty">' + (p.type === 'dead' ? 'MORTE' : p.type === 'gas' ? 'GAZ' : p.type === 'lunar' ? 'LUNE' : 'LIBRE') + '</span>';
  }

  const html = `
    <div class="uni-planet" onclick="openPlanetDetail('${p.coord}')">
      <span class="uni-planet-coord">${p.coord}</span>
      <div class="uni-planet-info">
        <div class="uni-planet-name">${getPlanetDisplayName(p)}</div>
        <div class="uni-planet-desc">${p.desc}</div>
      </div>
      ${tag}
    </div>
  `;

  if (withCard) {
    return `<div class="uni-system" style="margin-bottom:8px">${html}</div>`;
  }
  return html;
}

function timeAgo(ts) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.round(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)}h`;
  return `il y a ${Math.round(diff / 86400)}j`;
}

/* ═══════════ PLANET DETAIL ═══════════ */

function openPlanetDetail(coord) {
  G.selectedPlanetCoord = coord;
  // Marquer le rapport comme lu
  const planet = findPlanetByCoord(coord);
  if (planet && planet.report && !planet.reportRead) {
    planet.reportRead = true;
  }
  // Chunk polish 15/05 : utilise goto() au lieu de _doGoto() pour que la stack
  // de navigation soit correctement empilée (le bouton ← revient à l'écran précédent
  // comme Centre de prospection, au lieu de retomber sur le Dashboard).
  goto('planet-detail');
}

// ─── Chunk 15/05 : Renommage planète (custom names) ───
// Le joueur peut donner un nom personnalisé à une planète qu'il a découverte.
// Ex: "Planque d'urgence", "Cache secrète", "Avant-poste Alpha".
// Stocké persisté sur p.customName dans G.knownSystems (sauvé avec saveKnownSystems si dispo).

// Helper : retourne le nom à afficher pour une planète (custom > original)
function getPlanetDisplayName(p) {
  if (!p) return '?';
  if (p.isMine) return G.planet?.name || p.name || '?';
  return p.customName || p.name || '?';
}

function loadPlanetCustomNames() {
  try {
    const raw = localStorage.getItem(_CUSTOM_NAMES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function savePlanetCustomName(coord, name) {
  try {
    const map = loadPlanetCustomNames();
    if (name && name.trim()) {
      map[coord] = name.trim();
    } else {
      delete map[coord];
    }
    localStorage.setItem(_CUSTOM_NAMES_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[customName] save échoué:', e);
  }
}

// Au démarrage, si une planète révélée a un custom name persisté → l'applique
function applyPersistedCustomNames() {
  const map = loadPlanetCustomNames();
  if (!map || Object.keys(map).length === 0) return;
  for (const sys of Object.values(G.knownSystems || {})) {
    if (!sys.planets) continue;
    for (const p of sys.planets) {
      if (map[p.coord]) p.customName = map[p.coord];
    }
  }
}

async function promptPlanetRename(coord) {
  const p = findPlanetByCoord(coord);
  if (!p) {
    if (typeof toast === 'function') toast('Planète introuvable');
    return;
  }
  if (p.isMine) {
    if (typeof toast === 'function') toast('Ta capitale se renomme dans les Réglages (roue dentée)');
    return;
  }
  if (p.isReal || p.isBot || p.playerName) {   // PROFIL_1310 — son nom appartient à son commandant
    if (typeof toast === 'function') toast(`Monde de ${p.playerName || 'un commandant'} : son nom lui appartient`);
    return;
  }
  const current = p.customName || p.name || '';
  const next = await sbPrompt({
    title: 'Renommer la planète',
    body: `Donne un nom à <strong>${coord}</strong>.<br><em>Laisse vide pour restaurer le nom d'origine (${p.name}).</em>`,
    placeholder: p.name,
    initialValue: current,
    confirmLabel: 'Renommer',
    maxLength: 40,
  });
  if (next === null) return;  // annulé
  const trimmed = next.slice(0, 40);  // max 40 chars (déjà trim par sbPrompt)
  if (trimmed === '') {
    // Restaurer nom d'origine
    delete p.customName;
    savePlanetCustomName(coord, null);
    if (typeof toast === 'function') toast('Nom d\'origine restauré');
  } else if (trimmed === p.name) {
    // Même nom que original : pas de custom
    delete p.customName;
    savePlanetCustomName(coord, null);
    if (typeof toast === 'function') toast('Nom inchangé');
  } else {
    p.customName = trimmed;
    savePlanetCustomName(coord, trimmed);
    if (typeof toast === 'function') toast(`Renommée : ${trimmed}`);
  }
  // Persist if knownSystems is saved
  if (typeof saveKnownSystems === 'function') saveKnownSystems();
  // Re-render
  if (typeof renderPlanetDetailScreen === 'function') renderPlanetDetailScreen();
}

// ─── PASSE 5.4 fix — Ouvrir la fiche d'une cible mouvante ───
// coordKey : format 'W-X-YYYY/deg°-deg°-letter' (univers mouvant)
function openMovingTargetDetail(coordKey) {
  G.selectedMovingTargetCoord = coordKey;
  // Chunk polish 15/05 : utilise goto() pour stack de navigation propre
  goto('moving-target-detail');
}

function renderMovingTargetDetailScreen() {
  // Chunk polish 15/05 (post-feedback) : démarre le ticker UI si mission tanker en cours
  if ((G.tankerMissions || []).some(m => m.status === 'in_transit' || m.status === 'returning')) {
    if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  }
  const coordKey = G.selectedMovingTargetCoord;
  const kt = G.knownTargets && G.knownTargets[coordKey];
  const sig = G.signatures
    ? Object.values(G.signatures).find(s => s.movingCoordKey === coordKey)
    : null;

  // Si plus aucune référence : cible exploitée ou expirée
  if (!kt && !sig) {
    document.getElementById('mtd-name').textContent = 'Cible introuvable';
    document.getElementById('mtd-coord').textContent = coordKey || '—';
    document.getElementById('mtd-state').textContent = 'Cette cible n\'existe plus';
    document.getElementById('mtd-illu').textContent = '✕';
    document.getElementById('mtd-data').innerHTML = `
      <div class="empty-line" style="padding:14px">La cible a été exploitée ou a expiré.</div>
    `;
    document.getElementById('mtd-actions').innerHTML = '';
    document.getElementById('mtd-meta').textContent = coordKey || '—';
    return;
  }

  // Icon/label : priorité au knownTarget (le plus récent), fallback signature
  const targetType = kt?.type || null;
  const fallbackIcon = kt?.icon || '◆';
  const label = kt?.label || (sig ? sig.typeLabel : 'Cible mouvante');
  const consumed = !kt;
  const isEngaged = kt?.status === 'engaged';

  document.getElementById('mtd-meta').textContent = coordKey;

  // ─── Illustration (chunk D 14/05) — plug PNG via getIllustration ───
  // Mapping : PROBE_TARGET_CONFIG.type → PNG_ILLUSTRATIONS.target_{type}
  // Fallback : emoji icon depuis kt/cfg si pas de PNG dispo (ex: 'cargo').
  const illuEl = document.getElementById('mtd-illu');
  if (illuEl) {
    if (targetType && PNG_ILLUSTRATIONS['target_' + targetType]) {
      illuEl.innerHTML = getIllustration('target_' + targetType);
    } else {
      // Fallback emoji (cargo n'a pas d'illu, ou cible signature sans type résolu)
      illuEl.textContent = fallbackIcon;
    }
  }

  document.getElementById('mtd-coord').textContent = coordKey;
  document.getElementById('mtd-name').textContent = label;
  document.getElementById('mtd-state').textContent = consumed
    ? 'Exploitée'
    : (isEngaged ? 'Tanker en route' : 'Exploitable');

  // ─── Données ───
  const ageMs = kt ? (Date.now() - (kt.discoveredAt || Date.now())) : 0;
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const ageLabel = ageDays === 0 ? 'aujourd\'hui' : ageDays === 1 ? 'hier' : `il y a ${ageDays}j`;
  const expiryMs = kt ? Math.max(0, (kt.expiresAt || 0) - Date.now()) : 0;
  const expiryDays = Math.ceil(expiryMs / (24 * 60 * 60 * 1000));
  const lootHint = kt?.lootEstimate
    ? `~${kt.lootEstimate.min}-${kt.lootEstimate.max} ${kt.lootEstimate.resource}`
    : '—';
  const sourceSig = sig
    ? `<span style="color:#5fffe8;font-family:'SF Mono',monospace">${sig.id}</span>`
    : '—';

  let etaLine = '';
  if (isEngaged && kt.tankerMissionId) {
    const mission = (G.tankerMissions || []).find(m => m.id === kt.tankerMissionId);
    if (mission) {
      const remainingMs = Math.max(0, mission.arrivalAt - Date.now());
      const remainingSec = Math.floor(remainingMs / 1000);
      const etaTxt = remainingSec < 60
        ? `${remainingSec}s`
        : remainingSec < 3600
          ? `${Math.floor(remainingSec / 60)}min`
          : `${Math.floor(remainingSec / 3600)}h${String(Math.floor((remainingSec % 3600) / 60)).padStart(2, '0')}`;
      etaLine = `
        <div class="dash-stat-row">
          <span class="lbl">Tanker</span>
          <span class="val" style="color:#ffc864">${mission.tankerName} · retour ${etaTxt}</span>
        </div>
      `;
    }
  }

  document.getElementById('mtd-data').innerHTML = `
    <div class="dash-stat-row">
      <span class="lbl">Type</span>
      <span class="val">${label}</span>
    </div>
    <div class="dash-stat-row">
      <span class="lbl">Coordonnée</span>
      <span class="val" style="font-family:'SF Mono',monospace;color:#ffc864;${consumed ? 'text-decoration:line-through;opacity:.5' : ''}">${coordKey}</span>
    </div>
    <div class="dash-stat-row">
      <span class="lbl">État</span>
      <span class="val">${consumed ? 'Exploitée' : isEngaged ? 'Tanker en route' : 'Exploitable'}</span>
    </div>
    ${etaLine}
    ${!consumed ? `
      <div class="dash-stat-row">
        <span class="lbl">Loot estimé</span>
        <span class="val">${lootHint}</span>
      </div>
      <div class="dash-stat-row">
        <span class="lbl">Découverte</span>
        <span class="val">${ageLabel}</span>
      </div>
      <div class="dash-stat-row">
        <span class="lbl">Expire dans</span>
        <span class="val">${expiryDays}j</span>
      </div>
    ` : ''}
    <div class="dash-stat-row">
      <span class="lbl">Source</span>
      <span class="val">${sourceSig}</span>
    </div>
  `;

  // ─── Actions ───
  const totalTankers = (G.fleet?.stationed?.tanker?.t1 || 0)
                     + (G.fleet?.stationed?.tanker?.t2 || 0)
                     + (G.fleet?.stationed?.tanker?.t3 || 0);
  const inMissionT = (G.tankerMissions || []).filter(m => m.status === 'in_transit' || m.status === 'returning' || m.status === 'orbital_relay').length;
  const availableTankers = tankerAvailability(null);

  let actionsHtml = '';
  if (consumed) {
    actionsHtml = `<div class="empty-line" style="padding:14px;font-style:italic">Cette cible a été exploitée par un tanker. Aucune action possible.</div>`;
  } else if (isEngaged) {
    // Chunk D+ 14/05 : card unifiée renderTankerMissionCard (illustration tanker + ETA + progress)
    // au lieu d'un simple "patiente jusqu'à son retour".
    const mission = kt && kt.tankerMissionId
      ? (G.tankerMissions || []).find(m => m.id === kt.tankerMissionId)
      : null;
    if (mission) {
      actionsHtml = renderTankerMissionCard(mission, { inline: true });
    } else {
      // Fallback (mission orpheline)
      actionsHtml = `<div class="empty-line" style="padding:14px;font-style:italic">Un tanker est en route vers cette cible. Patiente jusqu'à son retour.</div>`;
    }
  } else if (availableTankers > 0) {
    // Chunk D+ 14/05 : bouton "Envoyer un tanker" — illustration tanker.png + variante large.
    // Registre visuel ignite-1 (déployer en orbite), ton ambre, présence renforcée.
    // Réf décision Adrien : "le btn-nuke reste rare et précieux, c'est l'identité du jeu pour les attaques".
    const tankerIconHtml = PNG_ILLUSTRATIONS.tanker
      ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" style="width:100%;height:100%;object-fit:contain" onerror="pngFallback(this, 'tanker')">`
      : `${icon('tanker', {size:18})}`;
    actionsHtml = `
      <button class="btn-ignition tanker large" onclick="onTankerKnownTargetClick('${coordKey}')">
        <span class="ignite-icon" style="width:44px;height:44px">${tankerIconHtml}</span>
        <span class="ignite-label">Envoyer un tanker</span>
        <span class="ignite-arrow">→</span>
      </button>
      <div style="margin-top:8px;padding:8px 12px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.5;text-align:center">
        Expédition en zones non balisées. Trajet rapide, rencontres possibles, butin variable.
      </div>
    `;
  } else {
    const tankerIconHtmlDis = PNG_ILLUSTRATIONS.tanker
      ? `<img src="${PNG_ILLUSTRATIONS.tanker}" alt="Tanker" style="width:100%;height:100%;object-fit:contain;opacity:.5" onerror="pngFallback(this, 'tanker')">`
      : `${icon('tanker', {size:18})}`;
    actionsHtml = `
      <button class="btn-ignition tanker large disabled">
        <span class="ignite-icon" style="width:44px;height:44px">${tankerIconHtmlDis}</span>
        <span class="ignite-label">Aucun tanker disponible</span>
      </button>
    `;
  }
  document.getElementById('mtd-actions').innerHTML = actionsHtml;
}

function findPlanetByCoord(coord) {
  if (!coord || !G.knownSystems) return null;
  for (const sys of Object.values(G.knownSystems)) {
    if (!sys.planets) continue;
    for (const p of sys.planets) {
      if (p.coord === coord) return p;
    }
  }
  return null;
}

function renderPlanetDetailScreen() {
  // Chunk polish 15/05 (post-feedback) : démarre le ticker UI si mission tanker en cours
  if ((G.tankerMissions || []).some(m => m.status === 'in_transit' || m.status === 'returning')) {
    if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  }
  const p = findPlanetByCoord(G.selectedPlanetCoord);
  if (!p) {
    toast('Planète introuvable');
    goto('universe');
    return;
  }

  document.getElementById('pd-coord').textContent = p.coord;
  { const _c = document.getElementById('pd-coord'); if (_c) { _c.style.cursor = 'pointer'; _c.title = 'Voir sur la carte'; _c.onclick = () => openPlanetOnMap(p.coord); } }
  // Chunk 15/05 — Nom custom : prend p.customName s'il existe, sinon le nom par défaut
  const displayName = p.isMine ? G.planet.name : (p.customName || p.name);
  document.getElementById('pd-name').textContent = displayName;
  // Indicateur "renommée" en cyan discret + clic pour ouvrir prompt
  // Sur capitale on ne propose pas le renommage (déjà éditable via le dashboard)
  const nameEl = document.getElementById('pd-name');
  if (nameEl && !p.isMine && !p.isReal && !p.isBot && !p.playerName) {   // PROFIL_1310
    nameEl.style.cursor = 'pointer';
    nameEl.style.textDecoration = 'underline';
    nameEl.style.textDecorationStyle = 'dotted';
    nameEl.style.textDecorationColor = 'rgba(95,255,232,.3)';
    nameEl.style.textUnderlineOffset = '4px';
    nameEl.onclick = () => promptPlanetRename(p.coord);
    nameEl.title = 'Tap pour renommer';
  } else if (nameEl) {
    nameEl.style.cursor = '';
    nameEl.style.textDecoration = '';
    nameEl.onclick = null;
    nameEl.title = '';
  }
  document.getElementById('pd-sub').textContent = p.isMine ? 'Capitale' : (p.type.toUpperCase());
  // Lookup robuste : cluster nouveau format en priorité, fallback legacy
  const lookupCluster = p.cluster || 'A';
  const sysLookupKey = `${lookupCluster}-${p.sector}-${p.system}`;
  const legacyKey = `${p.sector}-${p.system}`;
  const sysEntry = G.knownSystems[sysLookupKey] || G.knownSystems[legacyKey];
  document.getElementById('pd-meta').innerHTML = p.isMine
    ? 'Capitale <span class="dot"></span> Mon territoire'
    : `Découverte <span class="dot"></span> ${sysEntry ? timeAgo(sysEntry.discoveredAt) : '—'}`;

  // Illustration de la planète selon son type
  const illuEl = document.getElementById('pd-illu');
  if (illuEl) { illuEl.style.cursor = 'pointer'; illuEl.title = 'Voir sur la carte'; illuEl.onclick = () => openPlanetOnMap(p.coord); }
  if (illuEl) {
    let illuKey = null;
    if (p.isMine)              illuKey = 'planete_libre'; // sa propre planète habitable
    else if (p.type === 'dead')   illuKey = 'planete_morte';
    else if (p.type === 'gas')    illuKey = 'planete_gazeuse';
    else if (p.type === 'empty')  illuKey = 'planete_libre';
    else if (p.type === 'player') illuKey = 'planete_joueur';
    illuEl.innerHTML = illuKey ? getIllustration(illuKey) : '';
  }

  // Données
  const dataEl = document.getElementById('pd-data');
  if (p.isMine) {
    dataEl.innerHTML = `
      <div class="dash-stat-row"><span class="lbl">Type</span><span class="val">Type ${G.planet.type}</span></div>
      <div class="dash-stat-row"><span class="lbl">Niveau</span><span class="val">${G.planet.level}</span></div>
      <div class="dash-stat-row"><span class="lbl">Âge</span><span class="val">${G.planet.age}</span></div>
      <div class="dash-stat-row"><span class="lbl">Défense</span><span class="val" style="color:${defenseStatus().color}">${fmt(totalDefense())}</span></div>
    `;
  } else {
    // PASSE 5.4 fix : label Type plus clair selon le type ET la présence d'un joueur
    let typeLabel;
    if (p.type === 'dead')           typeLabel = 'Planète morte';
    else if (p.type === 'gas')       typeLabel = 'Géante gazeuse';
    else if (p.type === 'lunar')     typeLabel = 'Lune stérile';
    else if (p.type === 'empty')     typeLabel = 'Habitable libre';
    else if (p.type === 'habitable') typeLabel = p.playerName ? 'Habitable occupée' : 'Habitable libre';
    else                              typeLabel = p.playerName ? 'Occupée' : 'Inconnu';

    dataEl.innerHTML = `
      <div class="dash-stat-row"><span class="lbl">Type</span><span class="val">${typeLabel}</span></div>
      ${p.playerName ? `<div class="dash-stat-row"><span class="lbl">Joueur</span><span class="val warn">${p.playerName}</span></div>` : ''}
      ${p.playerLevel ? `<div class="dash-stat-row"><span class="lbl">Niveau estimé</span><span class="val">~${p.playerLevel}</span></div>` : ''}
      <div class="dash-stat-row"><span class="lbl">Coordonnées</span><span class="val" style="font-family:'SF Mono',monospace;color:var(--cyan)">${p.coord}</span></div>
    `;
  }

  // Rapport
  const reportEl = document.getElementById('pd-report-wrap');
  if (p.report) {
    reportEl.innerHTML = `<div class="report-doc">${p.report}</div>`;
  } else if (p.isMine) {
    reportEl.innerHTML = `<div class="empty-line">Pas de rapport — c'est ta planète.</div>`;
  } else {
    reportEl.innerHTML = `<div class="empty-line">Aucun rapport disponible.</div>`;
  }

  // Actions
  const actionsEl = document.getElementById('pd-actions');
  if (p.isMine) {
    actionsEl.innerHTML = `
      <button class="btn-primary" style="width:100%;padding:14px" onclick="goto('planet')">Entrer dans la planète</button>
    `;
  } else {
    const canResond = G.probe.state === 'ready';
    const isFreeHabitable = (p.type === 'habitable' && !p.playerName) || p.type === 'empty';
    const isOccupied = p.type === 'player' || (p.type === 'habitable' && p.playerName);

    // ─── Chunk 15/05 : tanker logistique ───
    // Option B Adrien : bouton visible UNIQUEMENT si tanker dispo (émergence pure)
    const stat = G.fleet?.stationed?.tanker || {};
    const totalTankers = (stat.t1 || 0) + (stat.t2 || 0) + (stat.t3 || 0);
    // AMBASSADES_1210 — même règle de réservation que partout (missions, ambassades, quais)
    const availableTankers = typeof tankerAvailability === 'function' ? tankerAvailability(null) : totalTankers;
    // PATCH_0211_AMBASSADEUR : chez un vrai commandant, un vaisseau d'exception libre suffit
    const showTankerBtn = availableTankers > 0 || (p.isReal && window.SBBlackmarket && SBBlackmarket.envoyChoices().length > 0);

    // Bloc garnison si présente
    const garrisons = getGarrisonsAt(p.coord);
    const garrisonBlock = dropoffHoldMissions(p.coord).map(renderDropoffHoldBlock).join('')   // PATCH_2010_CALE_ORBITE
      + (garrisons.length > 0
      ? garrisons.map(g => renderGarrisonBlock(g)).join('')
      : '');

    // Note de design (16/05) : aucun joueur n'est un ennemi par défaut.
    // Le bouton "Préparer un raid" et "Envoyer un message" sont retirés du Carnet :
    // un joueur découvert reste neutre. Toute interaction passe par un tanker.
    // L'envoi d'un tanker chez un joueur = don, commerce, ou plus tard, canal de chat.
    // Les attaques se déclarent depuis une flotte composée (écran Flotte).

    // ─── Canal de communication (16/05 feedback V3 #4) ───
    // Si la planète appartient à un joueur ET qu'on a un tanker en orbite chez lui,
    // le canal de communication est ouvert : on affiche le bouton "Envoyer un message".
    // C'est le principe canon des Routes Duales : le tanker est le médium.
    const hasTankerInOrbit = isOccupied && (G.tankerMissions || []).some(m =>
      m.status === 'orbital_relay' && m.destinationPlanetCoord === p.coord
    );
    const messageBtn = hasTankerInOrbit ? `
      <button class="btn-primary" style="width:100%;padding:14px;margin-bottom:8px;border-color:rgba(95,255,232,.4);background:rgba(95,255,232,.06);color:#5fffe8" onclick="openMessagePlayer('${p.coord}')">Envoyer un message à ${p.playerName}</button>
    ` : '';

    actionsEl.innerHTML = `
      ${garrisonBlock}
      ${p.isReal ? mpEmbassyBlockHtml(p) : ''}
      <button class="btn-primary ${canResond ? '' : 'disabled'}" style="width:100%;padding:14px;margin-bottom:8px" onclick="resondPlanet('${p.coord}')">${canResond ? 'Sonder à nouveau' : 'Sonde en mission'}</button>
      ${showTankerBtn ? `
        <button class="btn-primary" style="width:100%;padding:14px;margin-bottom:8px;border-color:rgba(255,200,100,.4);background:rgba(255,200,100,.06);color:#ffc864" onclick="openTankerCompose('${p.coord}')">Envoyer un tanker</button>
      ` : ''}
      ${messageBtn}
      ${isFreeHabitable ? `<button class="btn-ghost" style="width:100%;padding:14px;margin-bottom:8px" onclick="sbColonizeAsk('${p.coord}')">${(G.colonyMissions || []).some(m => m.coord === p.coord) ? 'Arche en route' : 'Coloniser'}</button>` : ''}
    `;
  }
}


// PATCH_2010_CALE_ORBITE — tanker en orbite, cale pleine : déposer la cargaison, ou rentrer avec
function dropoffHoldMissions(coord) {
  return (G.tankerMissions || []).filter(m => m.kind === 'dropoff' && m.holdCargo && m.status === 'orbital_relay' && m.destinationPlanetCoord === coord && !m.mpTarget);
}
function dropoffDeposit(missionId) {
  const m = (G.tankerMissions || []).find(x => x.id === missionId);
  if (!m || !m.holdCargo) return;
  m.holdCargo = false; m._depositNow = true;
  handleTankerDropoffArrival(m);
  delete m._depositNow;
  if (m.status === 'returned') { const i = G.tankerMissions.indexOf(m); if (i >= 0) G.tankerMissions.splice(i, 1); }
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
async function dropoffRecallFull(missionId) {
  const m = (G.tankerMissions || []).find(x => x.id === missionId);
  if (!m || !m.holdCargo) return;
  const ok = typeof sbConfirmWarning === 'function' ? await sbConfirmWarning('Rentrer sans déposer', `<strong>${m.tankerName}</strong> quitte l'orbite et rentre avec toute sa cale.`, 'Rentrer') : true;
  if (!ok) return;
  const now = Date.now();
  m.holdCargo = false;
  m.status = 'returning'; m.cancelledAt = now;
  m.returnArrivalAt = now + Math.max(60000, (m.arrivalAt || now) - (m.departedAt || now));
  toast(`${m.tankerName} rentre avec sa cale`);
  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
function renderDropoffHoldBlock(m) {
  const c = m.cargo || {}, parts = [];
  if (c.soldiers?.garde) parts.push(`${c.soldiers.garde} garde${c.soldiers.garde > 1 ? 's' : ''}`);
  if (c.soldiers?.lourd) parts.push(`${c.soldiers.lourd} lourd${c.soldiers.lourd > 1 ? 's' : ''}`);
  for (const rk of ['metal', 'energie', 'cristal']) if (c.resources?.[rk] > 0) parts.push(`${fmt(c.resources[rk])} ${(tileInfo(rk)?.label || rk).toLowerCase()}`);
  const after = m.postArrival === 'orbit_relay' ? 'Après le dépôt, le tanker reste en orbite pour garder le contact.' : 'Après le dépôt, le tanker rentre à vide.';
  const ptype = PLANET_TYPES[m.destinationPlanetType], hostile = (ptype?.hostility || 0) > 0;
  return `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(80,55,15,.20);border:1px solid #ffc86470;border-radius:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">${icon('tanker', { size: 16, color: '#ffc864' })}
        <span style="color:#ffc864;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:600">Tanker en orbite · cale pleine</span></div>
      <div style="font-size:12px;color:var(--text);margin-bottom:4px"><b>${m.tankerName}</b> · en cale : ${parts.join(' · ') || 'rien'}</div>
      <div style="font-size:10px;color:var(--mut);line-height:1.5">${after}${hostile ? ' Une fois au sol, la garnison subit l\'usure de ce monde.' : ''}</div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button onclick="dropoffRecallFull('${m.id}')" style="flex:1;background:transparent;border:1px solid var(--border);color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:9px 10px;border-radius:4px;cursor:pointer;font-family:inherit">Rentrer avec la cale</button>
        <button onclick="dropoffDeposit('${m.id}')" style="flex:1.4;background:rgba(255,200,100,.14);border:1px solid #ffc864a0;color:#ffc864;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:9px 10px;border-radius:4px;cursor:pointer;font-family:inherit;font-weight:600">Déposer la cargaison</button>
      </div>
    </div>`;
}

// ─── Rendu d'un bloc garnison sur la fiche planète ───
function renderGarrisonBlock(g) {
  const isConnected = g.contactStatus === 'connected';
  const ptype = PLANET_TYPES[g.planetType];
  const hostility = ptype?.hostility || 0;

  // Compteurs selon état
  const displaySoldiers = isConnected ? g.soldiers : g.lastKnownSoldiers;
  const displayResources = isConnected ? g.resources : g.lastKnownResources;
  const totalSoldiers = (displaySoldiers.garde || 0) + (displaySoldiers.lourd || 0);
  const totalRes = (displayResources.metal || 0) + (displayResources.energie || 0) + (displayResources.cristal || 0);

  const elapsedH = (Date.now() - g.depositedAt) / (1000 * 60 * 60);
  const ageLabel = elapsedH < 1
    ? `${Math.floor(elapsedH * 60)} min`
    : elapsedH < 24
      ? `${Math.floor(elapsedH)} h`
      : `${Math.floor(elapsedH / 24)} j`;

  const accent = isConnected ? '#ffc864' : 'var(--mut)';
  const statusLabel = isConnected
    ? `<span style="color:#5fcc8a">Contact actif · ${g.contactingTankerName} en orbite</span>`
    : `<span style="color:var(--mut);font-style:italic">Isolée · dernière donnée il y a ${ageLabel}</span>`;

  // Détails contenu — Chunk polish 15/05 : mini PNGs ressources (16px) au lieu de texte pur
  const lineParts = [];
  if (displaySoldiers.garde > 0) {
    lineParts.push(`<span style="display:inline-flex;align-items:center;gap:4px">${displaySoldiers.garde} garde</span>`);
  }
  if (displaySoldiers.lourd > 0) {
    lineParts.push(`<span style="display:inline-flex;align-items:center;gap:4px">${displaySoldiers.lourd} lourd</span>`);
  }
  for (const rk of ['metal', 'energie', 'cristal']) {
    if (displayResources[rk] > 0) {
      const pngKey = 'res_' + rk;
      const miniIcon = PNG_ILLUSTRATIONS[pngKey]
        ? `<img src="${PNG_ILLUSTRATIONS[pngKey]}" alt="${rk}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;flex-shrink:0">`
        : '';
      lineParts.push(`<span style="display:inline-flex;align-items:center;gap:3px">${miniIcon}${fmt(displayResources[rk])}</span>`);
    }
  }

  // Action buttons
  let actions = '';
  if (isConnected) {
    actions = `
      <div style="display:flex;gap:6px;margin-top:10px">
        <button onclick="recallTankerRelay('${g.id}')" style="flex:1;background:transparent;border:1px solid var(--border);color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 10px;border-radius:4px;cursor:pointer;font-family:inherit">Rappeler le tanker</button>
        <button onclick="rapatriateGarrison('${g.id}')" style="flex:1;background:rgba(255,200,100,.10);border:1px solid #ffc86460;color:#ffc864;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 10px;border-radius:4px;cursor:pointer;font-family:inherit">Rapatrier</button>
      </div>
    `;
  } else {
    actions = `
      <div style="display:flex;gap:6px;margin-top:10px">
        <button onclick="openTankerCompose('${g.planetCoord}')" style="flex:1;background:rgba(255,200,100,.10);border:1px solid #ffc86460;color:#ffc864;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 10px;border-radius:4px;cursor:pointer;font-family:inherit">Rétablir contact (envoyer tanker)</button>
      </div>
    `;
  }

  return `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(80,55,15,.20);border:1px solid ${accent}50;border-radius:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          ${icon('helmet', {size:16, color:accent})}
          <span style="color:${accent};font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:600">Transport déposé</span>
        </div>
        <span style="font-size:9px;color:var(--mut);font-family:'SF Mono',monospace">${ageLabel}</span>
      </div>
      <div style="font-size:11px;color:var(--text);margin-bottom:4px;display:flex;flex-wrap:wrap;gap:8px 12px">${lineParts.join('<span style="color:var(--mut)">·</span>') || 'cale vide'}</div>
      <div style="font-size:10px">${statusLabel}</div>
      ${hostility > 0 && isConnected ? `<div style="font-size:9px;color:var(--mut);margin-top:4px;font-style:italic">Attrition active : ${(hostility * 100).toFixed(1)}%/h</div>` : ''}
      ${actions}
    </div>
  `;
}

function openMessagePlayer(planetCoord) {
  const planet = findPlanetByCoord(planetCoord);
  if (!planet || !planet.playerName) {
    toast('Joueur introuvable');
    return;
  }

  // Construire l'overlay
  const flagsHtml = PLAYER_MESSAGE_FLAGS.map(f => `
    <div onclick="sendPlayerMessage('${planetCoord}','${f.id}')" style="padding:14px 14px;margin-bottom:8px;background:rgba(20,25,30,.95);border:1px solid ${f.color}40;border-radius:8px;cursor:pointer">
      <div style="font-size:13px;color:${f.color};font-weight:600;margin-bottom:3px">${f.label}</div>
      <div style="font-size:11px;color:var(--mut)">${f.desc}</div>
    </div>
  `).join('');

  const overlayHtml = `
    <div id="message-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:flex-end;padding:0" onclick="closeMessageOverlay(event)">
      <div onclick="event.stopPropagation()" style="width:100%;max-height:88vh;overflow-y:auto;background:linear-gradient(to bottom,rgba(15,20,25,1),rgba(8,12,18,1));border-top:1px solid var(--border);border-radius:14px 14px 0 0;padding:18px 16px 22px;animation:slideUp .25s ease-out">
        <div style="text-align:center;margin-bottom:6px">
          <div style="font-size:10px;color:var(--mut);letter-spacing:.16em;text-transform:uppercase">Canal ouvert</div>
          <div style="font-size:16px;color:#5fffe8;font-weight:600;margin-top:4px">Message à ${planet.playerName}</div>
          <div style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace;margin-top:3px">${planetCoord}</div>
        </div>
        <div style="font-size:10px;color:var(--mut);font-style:italic;text-align:center;margin:14px 0 18px;padding:0 20px;line-height:1.6">Le tanker en orbite relaye ton signal. Choisis un pavillon — l'autre joueur le recevra.</div>
        ${flagsHtml}
        <div onclick="closeMessageOverlay()" style="margin-top:14px;padding:12px;text-align:center;color:var(--mut);font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer">Annuler</div>
      </div>
    </div>
    <style>@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>
  `;
  const div = document.createElement('div');
  div.innerHTML = overlayHtml;
  document.body.appendChild(div);
}

function closeMessageOverlay(event) {
  // Si event vient du backdrop, OK ; sinon (clic explicite annuler) OK aussi
  const overlay = document.getElementById('message-overlay');
  if (overlay) overlay.parentElement.remove();
}
// PATCH_2110_PAVILLONS — déclarer un ennemi se confirme
async function _mpConfirmFlag(key, who) {
  if (key !== 'ennemi') return true;
  const _al = typeof mpAllyMember === 'function' && mpAllyMember(null, who);   // PATCH_2110_ALLIANCES
  return sbConfirmWarning('Déclarer ' + (who || 'ce commandant') + ' ennemi ?', (_al ? `<strong style="color:#ff8a8a">${_esc(who)} est membre de ton alliance : c'est toi qui la quittes.</strong><br><br>` : '') + 'La rivalité devient officielle : elle s\'affiche chez vous deux et une rumeur circule au comptoir.<br><br>Entre ennemis, un raid gagné pille <b>10 points de plus</b> : jusqu\'à 40 % d\'une capitale, 60 % d\'un dépôt colonial. Tout pacte entre vous tombe, et aucun ne peut être signé tant que la rivalité dure.<br><br>Pour en sortir : un pavillon « Paix ? » auquel il répond « Paix ? ».', 'Déclarer ennemi');
}
function _mpFlagErr(e) {
  const code = (String(e && e.message || e).match(/[a-z_]+/g) || []).find(c => MP_FLAG_ERRORS[c]);
  return code ? MP_FLAG_ERRORS[code] : 'Le registre ne répond pas, réessaie';
}

function sendPlayerMessage(planetCoord, flagId) {
  const planet = findPlanetByCoord(planetCoord);
  const flag = PLAYER_MESSAGE_FLAGS.find(f => f.id === flagId);
  if (!planet || !flag) { closeMessageOverlay(); return; }
  if (planet.isReal) {   // vrai commandant : le pavillon part au registre
    closeMessageOverlay();
    if (!window.SBMP || !window.SBMP.ready()) { toast('Registre hors ligne : réessaie dans un instant'); return; }
    Promise.resolve(_mpConfirmFlag(MP_FLAG_KEY[flag.id], planet.playerName)).then(ok => ok && window.SBMP.sendFlag(planet.mpAddress || planetCoord, MP_FLAG_KEY[flag.id], 'orbit')
      .then(() => { toast(`Pavillon « ${flag.label} » hissé devant ${planet.playerName}`); _mpRelRefreshSoon(); })
      .catch((e) => toast(_mpFlagErr(e))));
    return;
    window.SBMP.sendFlag(planet.mpAddress || planetCoord, MP_FLAG_KEY[flag.id], 'orbit')
      .then(() => { toast(`Pavillon « ${flag.label} » hissé devant ${planet.playerName}`); _mpRelRefreshSoon(); })
      .catch((e) => toast(_mpFlagErr(e)));
    return;
  }

  // MVP solo : pas de vraie transmission. On stocke un log dans G.sentMessages
  // pour traçabilité future, et on affiche un toast de confirmation.
  if (!Array.isArray(G.sentMessages)) G.sentMessages = [];
  G.sentMessages.unshift({
    id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    targetPlayer: planet.playerName,
    targetCoord: planetCoord,
    flagId: flag.id,
    flagLabel: flag.label,
    sentAt: Date.now(),
  });
  if (G.sentMessages.length > 50) G.sentMessages.length = 50;

  closeMessageOverlay();
  toast(`Signal "${flag.label}" envoyé à ${planet.playerName}`);
}


async function resondPlanet(coord) {
  // 13/10 (Adrien) : choisir la sonde. Radar = son système ; Furtive = espionnage du monde lui-même.
  const p = (typeof findPlanetByCoord === 'function') ? findPlanetByCoord(coord) : null;
  const who = (p && (p.playerName || p.customName || p.name)) || coord;
  const sys = String(coord).split('-').slice(0, 3).join('-');
  const items = [
    { tier: 'radar', target: sys, label: 'Radar — balayer son système', sub: 'Mondes et échos du système · 5–10 min' },
    { tier: 'stealth', target: coord, label: 'Furtive — espionner ' + who, sub: 'Niveau, défense, bouclier · précision selon ton Laboratoire · 4–8 h' },
  ];
  const it = await _mpChoose('Sonder ' + who, items);
  if (!it) return;
  const st = (typeof _probeTierStatus === 'function') ? _probeTierStatus(it.tier) : { ok: true };
  if (!st.ok) {
    if (st.build && await sbConfirm({ title: 'Aucune sonde prête', body: st.why + '. Construire une sonde maintenant ?', confirmLabel: 'Ouvrir le hangar' })) openProbeDetail(it.tier);
    else if (!st.build) toast(st.why);
    return;
  }
  const m = launchProbe(it.tier, it.target, 'local', false);
  if (m) { if (typeof saveGame === 'function') saveGame(); toast((it.tier === 'stealth' ? 'Furtive' : 'Radar') + ' en route vers ' + who); }
} // 'defense' | 'ship'

function renderDefenseScreen() {
  ensureDefenseUnits();
  const status = defenseStatus();
  const total = totalDefense();
  const totalUnits = Object.values(G.defense.units).reduce((s, u) => s + u.qty, 0);

  // Header / status banner
  document.getElementById('def-meta-status').textContent = status.label;
  const banner = document.getElementById('def-status-banner');
  banner.style.borderColor = status.level <= 1 ? 'rgba(255,80,64,.25)' : status.level === 2 ? 'rgba(126,208,128,.3)' : 'rgba(95,255,232,.3)';
  // Illustration : caserne si on a des unités, sinon icône d'alerte
  const defIcon = document.getElementById('def-status-icon');
  if (totalUnits > 0) {
    defIcon.innerHTML = getIllustration('caserne');
  } else {
    defIcon.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 12 L52 50 L12 50 Z"/>
      <line x1="32" y1="26" x2="32" y2="38" stroke-width="2"/>
      <circle cx="32" cy="44" r="1.5" fill="currentColor"/>
    </svg>`;
  }
  defIcon.style.color = status.color;
  document.getElementById('def-status-total').innerHTML = `<span style="color:${status.color}">${fmt(total)}</span> défense · ${totalUnits} unités${window.SBSkills && SBSkills.defTag ? SBSkills.defTag() : ''}`;
  document.getElementById('def-status-sub').innerHTML = `<span style="color:${status.color}">${status.label}</span>`;
  {   // PATCH_2210_VIVRES : ration de biomasse des troupes
    const _rt = sbTroopRations(), _pd = sbRationPerDay(), _bio = Math.floor((G.res.biomass && G.res.biomass.v) || 0);
    if (_rt > 0) document.getElementById('def-status-sub').innerHTML += G.troopFamine
      ? `<br><span style="color:var(--amber)">⚠ Troupes affamées · défense des soldats −25 % · récolte de la biomasse au match-3</span>`
      : `<br><span style="color:#7ed080">Vivres : ${_pd > 0 ? `−${fmt(_pd)} biomasse / jour (${fmt(_bio)} en stock${_bio < _pd * 2 ? ', <span style="color:var(--amber)">bientôt vide</span>' : ''})` : `nourries par la caserne (${_rt}/${SB_FREE_RATIONS} rations gratuites)`}</span>`;
  }

  // Badge sur l'onglet Garnison = nombre d'unités
  const garrBadge = document.getElementById('defense-tab-garrison-badge');
  if (garrBadge) {
    if (totalUnits > 0) {
      garrBadge.style.display = '';
      garrBadge.textContent = totalUnits;
    } else {
      garrBadge.style.display = 'none';
    }
  }

  // ─── Onglet GARNISON : composition par unité ───
  const compEl = document.getElementById('def-composition');
  const ownedUnits = Object.entries(G.defense.units).filter(([k, u]) => u.qty > 0);

  if (ownedUnits.length === 0 && G.defense.capitalBase === 0) {
    compEl.innerHTML = `<div class="empty-line">Aucune unité défensive. Va dans "Mobilisation" pour recruter.</div>`;
  } else {
    let html = '';
    // Capitale (toujours visible si > 0)
    if (G.defense.capitalBase > 0) {
      html += `
        <div class="def-comp-row">
          <div class="def-comp-icon" style="color:var(--cyan)">⊕</div>
          <div class="def-comp-info">
            <div class="def-comp-name">Capitale (passif)</div>
            <div class="def-comp-stats">Bonus permanent</div>
          </div>
          <div class="def-comp-total" style="color:var(--cyan)">${fmt(G.defense.capitalBase)}</div>
        </div>
      `;
    }
    // Unités
    for (const [key, u] of ownedUnits) {
      const def = DEFENSE_UNITS[key];
      // Doctrine Z4-ter : calculer la défense effective au sol
      const inDeployedFleets = getSoldiersInDeployedFleets(key);
      const inPreparedFleets = getSoldiersInPreparedFleets(key);
      const inMissionFleets = getSoldiersInMissionFleets(key);
      const groundUnits = Math.max(0, u.qty - inDeployedFleets - inMissionFleets - soldiersCommittedElsewhere(key));
      const subtotal = groundUnits * def.defPerUnit;
      const dmgBadge = u.dmg > 0 ? ` <span style="color:var(--amber);font-size:9px">(${u.dmg} endommagés)</span>` : '';

      // Lignes d'information supplémentaires (réservés / en orbite / en mission)
      const subLines = [];
      if (inPreparedFleets > 0) {
        subLines.push(`<div class="def-comp-substat" style="color:var(--mut)">↳ ${inPreparedFleets} affectés à une flotte préparée (défendent encore)</div>`);
      }
      if (inDeployedFleets > 0) {
        subLines.push(`<div class="def-comp-substat" style="color:var(--blue-light)">↳ ${inDeployedFleets} embarqués sur flotte en orbite (ne défendent plus)</div>`);
      }
      if (inMissionFleets > 0) {
        subLines.push(`<div class="def-comp-substat" style="color:#e6f0ff">↳ ${inMissionFleets} partis en mission (loin de la planète)</div>`);
      }

      html += `
        <div class="def-comp-row" onclick="openUnitDetail('${key}')">
          <div class="def-comp-icon" style="color:${def.color}">${PNG_ILLUSTRATIONS[key] ? `<img src="${PNG_ILLUSTRATIONS[key]}" alt="${def.name}" onerror="pngFallback(this, '${key}')">` : def.icon}</div>
          <div class="def-comp-info">
            <div class="def-comp-name">${def.name}</div>
            <div class="def-comp-stats">${groundUnits} au sol${(inDeployedFleets + inPreparedFleets + inMissionFleets) > 0 ? ` / ${u.qty}` : ''} @ ${def.defPerUnit} déf${dmgBadge}</div>
            ${subLines.join('')}
          </div>
          <div class="def-comp-total" style="color:${def.color}">${fmt(subtotal)}</div>
          <div class="def-comp-arrow">→</div>
        </div>
      `;
    }
    // Bouclier orbital (vaisseaux des flottes déployées qui défendent depuis l'espace)
    const orbitalDef = getOrbitalDefenseFromFleets();
    if (orbitalDef > 0) {
      const deployedFleets = G.fleet.prepared.filter(f => (f.status || 'prepared') === 'deployed');
      const fleetNames = deployedFleets.map(f => f.name).join(', ');
      html += `
        <div class="def-comp-row" style="border-color:rgba(184,208,255,.3)">
          <div class="def-comp-icon" style="color:var(--blue-light);background:rgba(184,208,255,.1);border-color:rgba(184,208,255,.32)"><div style="width:22px;height:22px">${svgFleetWings('var(--blue-light)')}</div></div>
          <div class="def-comp-info">
            <div class="def-comp-name" style="color:var(--blue-light)">Bouclier orbital</div>
            <div class="def-comp-stats">${deployedFleets.length} flotte${deployedFleets.length > 1 ? 's' : ''} en orbite : ${fleetNames}</div>
          </div>
          <div class="def-comp-total" style="color:var(--blue-light)">${fmt(orbitalDef)}</div>
        </div>
      `;
    }
    compEl.innerHTML = `<div class="def-composition-list">${html}</div>`;
  }

  // ─── Onglet MOBILISATION : queue + recrutement ───
  // Cale active (commandes en cours)
  renderQueue('barracks');

  // Recruter
  const hasCaserne = G.planet.parcels.some(p => p.building === 'caserne');
  const hasTurret = G.planet.parcels.some(p => p.building === 'turret');
  const recruitEl = document.getElementById('def-recruit-list');

  if (!hasCaserne && !hasTurret) {
    recruitEl.innerHTML = `<div class="empty-line">Construis une Caserne (gardes) ou un Bunker (soldats lourds, tourelles) sur Ma Planète pour pouvoir recruter.</div>`;
  } else {
    let recruitHtml = '';
    for (const [key, unit] of Object.entries(DEFENSE_UNITS)) {
      // Vérifier si débloqué
      const buildingNeeded = unit.requires;
      const hasBuilding = G.planet.parcels.some(p => p.building === buildingNeeded);
      const lowLevel = hasBuilding && unit.minLevel && bestBuildingLevel(buildingNeeded) < unit.minLevel;
      const isLocked = unit.locked || !hasBuilding || lowLevel;
      const buildingLabel = buildingNeeded === 'caserne' ? 'Caserne' : 'Bunker';
      const lockReason = unit.locked ? unit.lockedReason : lowLevel || (!hasBuilding && unit.minLevel) ? unit.lockedReason : `${buildingLabel} requis`;

      const costStr = Object.entries(unit.cost).map(([res, q]) => `${q} ${res}`).join(' · ');
      const adjustedDuration = Math.max(1, Math.round(unit.duration / G.skills.productionSpeed * (window.SBSkills ? SBSkills.durMult('troops') : 1)));

      recruitHtml += `
        <div class="unit-row ${isLocked ? 'locked' : ''}" onclick="openUnitDetail('${key}','defense')" style="cursor:pointer">
          <div class="unit-icon" style="color:${unit.color}">${PNG_ILLUSTRATIONS[key] ? `<img src="${PNG_ILLUSTRATIONS[key]}" alt="${unit.name}" onerror="pngFallback(this, '${key}')">` : unit.icon}</div>
          <div class="unit-info">
            <div class="unit-name">${unit.name}</div>
            <div class="unit-stats">+${unit.defPerUnit} déf${unit.atkPerUnit ? ` · +${unit.atkPerUnit} atk` : ''} · ${costStr} · ${formatTime(adjustedDuration)}/u${window.SBSkills ? SBSkills.durTag('troops') : ''}</div>
            ${isLocked ? `<div style="font-size:9px;color:var(--mut);margin-top:2px;font-style:italic">${lockReason}</div>` : ''}
          </div>
          ${isLocked
            ? `<button class="unit-action disabled" onclick="event.stopPropagation()">Verrouillé</button>`
            : `
              <button class="unit-action" onclick="event.stopPropagation();recruitUnit('${key}', 1)">+1</button>
              <button class="unit-action" onclick="event.stopPropagation();recruitUnit('${key}', 10)" style="margin-left:6px">+10</button>
            `}
        </div>
      `;
    }
    recruitEl.innerHTML = `<div class="unit-list">${recruitHtml}</div>`;
  }

  // Appliquer l'onglet actif
  setDefenseTab(G.defenseTab || 'mobilize');
}

// Bascule entre les 2 onglets de la Défense (Mobilisation / Garnison)
function setDefenseTab(tab) {
  G.defenseTab = tab;
  ['mobilize', 'garrison'].forEach(t => {
    const btn = document.getElementById('defense-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    const pane = document.getElementById('defense-pane-' + t);
    if (pane) pane.style.display = (t === tab) ? '' : 'none';
  });
}

function openUnitDetail(unitKey, kind) {
  selectedUnitDetailKey = unitKey;
  selectedUnitDetailKind = kind || 'defense';
  // Le retour est géré par la stack de navigation (goBack)
  goto('unit-detail');
}

function openBuildingDetail(parcelIdx) {
  selectedBuildingParcelIdx = parcelIdx;
  goto('building-detail');
}
function recycleCost(parcel) {
  const out = {};
  const tiers = BUILDING_TIERS[parcel.building] || {};
  for (let t = 1; t <= (parcel.lvl || 1); t++) for (const [r, q] of Object.entries((tiers[t] && tiers[t].cost) || {})) out[r] = (out[r] || 0) + q;
  if (!Object.keys(out).length && BUILDINGS[parcel.building]) Object.assign(out, BUILDINGS[parcel.building].cost || {});
  for (const r of Object.keys(out)) out[r] = Math.ceil(out[r] * RECYCLE_PCT / 10) * 10;
  for (const [r, q] of Object.entries(RECYCLE_FLOOR)) out[r] = Math.max(out[r] || 0, q);
  return out;
}
function recycleMs(parcel) {
  const min = RECYCLE_MIN[parcel.lvl || 1] || 120;
  return Math.round(min * 60000 * (window.SBSkills ? SBSkills.durMult('build') : 1));
}
function recycleBlocker(idx) {
  const p = G.planet && G.planet.parcels[idx];
  if (!p || p.state !== 'built' || !p.building) return 'Rien à recycler ici';
  if (p.building === 'capital' || p.state === 'capital') return 'Le Centre de commandement ne se recycle pas';
  if (window.SBAntenna && SBAntenna.owns && SBAntenna.owns(idx)) return 'L\'antenne ne se recycle pas';
  if (QUEUES.capital.upgrade && QUEUES.capital.upgrade.parcelIdx === idx) return 'Une amélioration est en cours sur ce bâtiment';
  if (p.building === 'shipyard' && (QUEUES.shipyard.commands || []).length) return 'Le chantier orbital a des vaisseaux en construction';
  if (p.building === 'caserne' && (QUEUES.barracks.commands || []).length) return 'La caserne forme des soldats';
  return null;
}
function recycleBuilding(idx) {
  const p = G.planet && G.planet.parcels[idx];
  if (!p) return;
  if (p.recycleEndsAt) { toast('Démolition déjà en cours'); return; }
  const why = recycleBlocker(idx);
  if (why) { toast(why); return; }
  const cost = recycleCost(p);
  if (!canAffordCost(cost)) { toast('Ressources insuffisantes : ' + Object.entries(cost).map(([r, q]) => fmt(q) + ' ' + r).join(' · ')); return; }
  const name = p.n || (BUILDINGS[p.building] && BUILDINGS[p.building].name) || 'ce bâtiment';
  const body = `Coût : ${Object.entries(cost).map(([r, q]) => fmt(q) + ' ' + r).join(' · ')}, démolition ${formatTankerDuration(recycleMs(p))}. Rien ne sera remboursé, et la parcelle redeviendra une plaine rocheuse à re-terraformer.`;
  if (typeof sbConfirmDanger === 'function') { sbConfirmDanger(`Recycler ${name} ?`, body, 'Recycler').then(ok => { if (ok) _recycleGo(idx); }); return; }
  _recycleGo(idx);
}
function _recycleGo(idx) {
  const p = G.planet.parcels[idx];
  if (!p || p.recycleEndsAt || recycleBlocker(idx)) return;
  const cost = recycleCost(p);
  if (!canAffordCost(cost)) { toast('Ressources insuffisantes'); return; }
  const go = () => {
    if (p.recycleEndsAt || !canAffordCost(cost)) return;
    for (const [r, q] of Object.entries(cost)) G.res[r].v -= q;
    const now = Date.now();
    p.recycleStartedAt = now; p.recycleEndsAt = now + recycleMs(p); p.recycleCost = cost;
    toast(`Démolition lancée · ${formatTankerDuration(p.recycleEndsAt - now)}`);
    if (typeof renderPlanetMap === 'function') renderPlanetMap();   // PATCH_2010_RECYCLER_NUIT : ses lumières s'éteignent
    if (typeof saveGame === 'function') saveGame();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  };
  if (typeof playLaunchSequence === 'function') playLaunchSequence('recycle', go); else go();
}
function cancelRecycle(idx) {
  const p = G.planet.parcels[idx];
  if (!p || !p.recycleEndsAt) return;
  // annuler rend la moitié (les équipes ont déjà commencé)
  for (const [r, q] of Object.entries(p.recycleCost || {})) if (G.res[r]) G.res[r].v = Math.min(G.res[r].max, G.res[r].v + Math.floor(q / 2));
  delete p.recycleStartedAt; delete p.recycleEndsAt; delete p.recycleCost;
  toast('Démolition annulée · la moitié du coût est rendue');
  if (typeof renderPlanetMap === 'function') renderPlanetMap();
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
function _recycleFinish(p) {
  const key = p.building, tier = (BUILDING_TIERS[key] && BUILDING_TIERS[key][p.lvl || 1]) || {};
  // la production du bâtiment s'arrête (moins la part déjà perdue s'il était abîmé)
  const prod = tier.prod || (BUILDINGS[key] && BUILDINGS[key].prod) || {};
  for (const [r, rate] of Object.entries(prod)) {
    const lost = (p.damaged && p.damageLoss && p.damageLoss[r]) || 0;
    if (G.res[r] && G.res[r].rate !== undefined) G.res[r].rate = Math.max(0, G.res[r].rate - (rate - lost));
  }
  // un silo emporte sa capacité
  const meta = BUILDINGS[key];
  if (meta && meta.kind === 'silo' && meta.silo && G.res[meta.silo.res]) {
    const R = G.res[meta.silo.res], cap = tier.siloCap || (meta.silo.cap || 0);
    R.max = Math.max(1000, R.max - cap); R.v = Math.min(R.v, R.max);
  }
  for (const k of ['recycleStartedAt', 'recycleEndsAt', 'recycleCost', 'damaged', 'damagedAt', 'damagedBy', 'damageLoss']) delete p[k];
  Object.assign(p, { state: 'rocky', building: null, lvl: null, prod: null, n: 'Plaine rocheuse', sub: 'Bâtiment recyclé. Sol à re-terraformer.', remineCount: 0, successCount: 0 });
  return key;
}
function tickRecycling() {
  if (typeof G === 'undefined' || !G.planet) return;
  const now = Date.now(), done = [];
  const run = () => (G.planet.parcels || []).forEach((p, i) => {
    if (p && p.recycleEndsAt && now >= p.recycleEndsAt && p.state === 'built') {
      const key = _recycleFinish(p);
      done.push((BUILDINGS[key] && BUILDINGS[key].name) || key);
      if (selectedBuildingParcelIdx === i && typeof getCurrentScreen === 'function' && getCurrentScreen() === 'building-detail') goto('planet');
    }
  });
  run();
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) if (w && w.data && w.id !== (G.activeWorld || 'home') && typeof sbWithWorld === 'function') sbWithWorld(w.id, run);
  if (done.length) {
    toast(done.length > 1 ? `${done.length} bâtiments recyclés` : `${done[0]} recyclé · la parcelle est libre`);
    if (typeof renderPlanetMap === 'function') renderPlanetMap();
    if (typeof saveGame === 'function') saveGame();
  }
}
function recycleSectionHtml(idx) {
  const p = G.planet.parcels[idx];
  if (!p || p.state !== 'built') return '';
  if (p.recycleEndsAt) {
    const left = Math.max(0, p.recycleEndsAt - Date.now()), pct = Math.min(100, Math.round((Date.now() - p.recycleStartedAt) / Math.max(1, p.recycleEndsAt - p.recycleStartedAt) * 100));
    return `<div class="section-label">Démolition</div><div class="dash-section-card" style="border-color:rgba(255,120,90,.35)">
      <div style="font-size:12px;color:var(--text);margin-bottom:8px">Démolition en cours · fin dans <b>${formatTankerDuration(left)}</b></div>
      <div style="height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:10px"><div style="height:100%;width:${pct}%;background:#ff7a5a"></div></div>
      <div style="font-size:11px;color:var(--mut);line-height:1.5;margin-bottom:10px">Le bâtiment produit jusqu'au bout. À la fin, la parcelle redevient une plaine rocheuse.</div>
      <button class="btn-ghost" style="width:100%;padding:12px;color:var(--mut);border-color:var(--border)" onclick="cancelRecycle(${idx})">Annuler la démolition (la moitié du coût est rendue)</button></div>`;
  }
  const why = recycleBlocker(idx), cost = recycleCost(p), ok = !why && canAffordCost(cost);
  const costLine = Object.entries(cost).map(([r, q]) => { const have = G.res[r] ? G.res[r].v : 0, lbl = (typeof prodInfo === 'function' && prodInfo(r) ? prodInfo(r).label : r).toLowerCase(); return `<span style="color:${have >= q ? 'var(--text)' : '#ff7a5a'}">${fmt(q)} ${lbl}</span>`; }).join(' · ');
  return `<div class="section-label">Recycler le bâtiment</div><div class="dash-section-card">
    <div style="font-size:11px;color:var(--mut);line-height:1.55;margin-bottom:10px">Démolir pour libérer la parcelle et y construire autre chose. <b style="color:var(--text)">Rien n'est remboursé</b> ; la parcelle redevient une plaine rocheuse à re-terraformer.</div>
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:6px 0;border-top:1px solid var(--border)"><span style="color:var(--mut)">Coût</span><span style="text-align:right">${costLine}</span></div>
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:6px 0 10px;border-top:1px solid var(--border)"><span style="color:var(--mut)">Démolition</span><span>${formatTankerDuration(recycleMs(p))}</span></div>
    <button class="btn-ghost" style="width:100%;padding:12px;border-color:rgba(255,120,90,.45);color:${ok ? '#ff9a7a' : 'var(--mut)'};${ok ? '' : 'opacity:.6'}" onclick="recycleBuilding(${idx})">${why ? why : 'Recycler'}</button></div>`;
}

function renderBuildingDetail() {
  const idx = selectedBuildingParcelIdx;
  if (idx === null || idx === undefined) {
    goto('planet');
    return;
  }
  const parcel = G.planet.parcels[idx];
  if (!parcel || parcel.state !== 'built' || !parcel.building) {
    goto('planet');
    return;
  }
  const buildingKey = parcel.building;
  const currentTier = parcel.lvl || 1;
  const tiers = BUILDING_TIERS[buildingKey];
  if (!tiers) {
    goto('planet');
    return;
  }
  const currentData = tiers[currentTier];
  const nextTier = currentTier < TIER_MAX ? currentTier + 1 : null;
  const nextData = nextTier ? tiers[nextTier] : null;
  const buildingMeta = BUILDINGS[buildingKey];

  // Header
  document.getElementById('bd-title').textContent = (currentData.name || buildingMeta.name).toUpperCase();
  document.getElementById('bd-meta').innerHTML =
    `${buildingMeta.family} <span class="dot"></span> Tier ${currentTier} / ${TIER_MAX}`;

  // Bannière
  const banner = document.getElementById('bd-banner');
  banner.style.borderColor = `rgba(${hexToRgb(buildingMeta.color)},.3)`;
  const iconEl = document.getElementById('bd-icon');
  iconEl.style.color = buildingMeta.color;
  iconEl.innerHTML = getIllustration(buildingKey);
  document.getElementById('bd-name').textContent = currentData.name || buildingMeta.name;
  document.getElementById('bd-sub').textContent = currentData.desc || buildingMeta.desc;

  // Production actuelle
  const currentEl = document.getElementById('bd-current');
  currentEl.innerHTML = renderTierProduction(currentData, buildingMeta);

  // Prochain tier
  const nextLabel = document.getElementById('bd-next-label');
  const nextEl = document.getElementById('bd-next');
  if (nextData) {
    nextLabel.style.display = '';
    nextEl.style.display = '';
    nextLabel.textContent = `Au Tier ${nextTier} : ${nextData.name}`;
    nextEl.innerHTML = renderTierProduction(nextData, buildingMeta, currentData);
  } else {
    nextLabel.style.display = 'none';
    nextEl.style.display = 'none';
  }

  // Coût et zone d'action
  const costLabel = document.getElementById('bd-cost-label');
  const costEl = document.getElementById('bd-cost');
  const actionZone = document.getElementById('bd-action-zone');

  const upgrade = QUEUES.capital.upgrade;
  const isThisOneUpgrading = upgrade && upgrade.parcelIdx === idx;
  const someoneElseUpgrading = upgrade && !isThisOneUpgrading;

  if (currentTier >= TIER_MAX) {
    // Tier max atteint
    costLabel.style.display = 'none';
    costEl.style.display = 'none';
    actionZone.innerHTML = `
      <div class="dash-section-card" style="text-align:center;padding:18px 12px;border-color:rgba(126,208,128,.3)">
        <div style="font-size:11px;letter-spacing:.16em;color:var(--green);text-transform:uppercase;margin-bottom:4px">⭐ Niveau maximum</div>
        <div style="font-size:13px;color:var(--mut)">Ce bâtiment est au sommet de son évolution.</div>
      </div>
    `;
  } else if (isThisOneUpgrading) {
    // Cette amélioration est en cours
    costLabel.style.display = 'none';
    costEl.style.display = 'none';
    const pct = Math.min(100, Math.floor((upgrade.elapsed / upgrade.totalDur) * 100));
    const remaining = Math.max(0, upgrade.totalDur - upgrade.elapsed);
    actionZone.innerHTML = `
      <div class="dash-section-card" style="border-color:rgba(255,192,96,.4);padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;letter-spacing:.16em;color:var(--amber);text-transform:uppercase">⏱ Amélioration en cours</span>
          <span style="font-family:var(--font-mono);font-size:13px;color:var(--amber)">${formatDuration(remaining)}</span>
        </div>
        <div style="font-size:13px;color:var(--txt);margin-bottom:10px">→ ${nextData.name}</div>
        <div style="height:4px;background:var(--bg-2);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--amber);transition:width 0.5s"></div>
        </div>
        <button onclick="onBuildingUpgradeCancelClick('building-detail')"
                style="margin-top:14px;width:100%;padding:11px;background:transparent;border:1px solid rgba(255,80,64,.3);border-radius:8px;color:var(--red);font-size:11px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer">
          Annuler la commande
        </button>
      </div>
    `;
  } else if (someoneElseUpgrading) {
    // Une autre amélioration occupe le Centre
    const otherParcel = G.planet.parcels[upgrade.parcelIdx];
    const otherName = (BUILDING_TIERS[upgrade.buildingKey]?.[upgrade.toTier]?.name) || 'un autre bâtiment';
    costLabel.style.display = '';
    costEl.style.display = '';
    costEl.innerHTML = renderTierCost(nextData);
    actionZone.innerHTML = `
      <div class="dash-section-card" style="border-color:rgba(255,80,64,.3);padding:14px">
        <div style="font-size:11px;letter-spacing:.16em;color:var(--red);text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px">${icon('warning', {size:12, color:'var(--red)'})} Centre occupé</div>
        <div style="font-size:13px;color:var(--mut);line-height:1.5">
          Le Centre de Commandement est en train d'améliorer <strong style="color:var(--txt)">${otherName}</strong>.
          Une seule amélioration possible à la fois.
        </div>
        <button onclick="goto('capital')" style="margin-top:12px;width:100%;padding:10px;background:transparent;border:1px solid var(--line);border-radius:6px;color:var(--cyan);font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer">
          Voir le centre
        </button>
      </div>
    `;
  } else if (parcel.damaged) {
    // MULTIJOUEUR : abîmé par un raid → production réduite de moitié jusqu'à réparation (match-3)
    costLabel.style.display = 'none';
    costEl.style.display = 'none';
    const canRepair = true;
    actionZone.innerHTML = `
      <div class="dash-section-card" style="border-color:rgba(255,80,64,.35);padding:14px;margin:14px 16px 4px">
        <div style="font-size:11px;letter-spacing:.16em;color:var(--red);text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px">${icon('warning', {size:12, color:'var(--red)'})} Abîmé par un raid</div>
        <div style="font-size:13px;color:var(--mut);line-height:1.5">${parcel.damagedBy ? `Touché par <strong style="color:var(--txt)">${parcel.damagedBy}</strong>. ` : ''}La production tourne à moitié tant que le bâtiment n'est pas réparé. Ce sont les secours sanitaires qui le remettent en état : chaque partie de secours réussie (depuis le centre de commandement) répare un bâtiment abîmé.</div>
        <button onclick="SBAftermath.startRelief()" ${canRepair ? '' : 'disabled'}
                style="margin-top:12px;width:100%;padding:13px;background:${canRepair ? 'rgba(255,192,96,.08)' : 'rgba(120,140,136,.05)'};border:1px solid ${canRepair ? 'rgba(255,192,96,.45)' : 'var(--line)'};border-radius:8px;color:${canRepair ? 'var(--amber)' : 'var(--mut)'};font-size:12px;letter-spacing:.18em;text-transform:uppercase;cursor:${canRepair ? 'pointer' : 'not-allowed'}">
          Lancer les secours
        </button>
      </div>
    `;
  } else {
    // Cas normal : on peut améliorer
    costLabel.style.display = '';
    costEl.style.display = '';
    costEl.innerHTML = renderTierCost(nextData);
    const canAfford = canAffordCost(nextData.cost);
    actionZone.innerHTML = `
      <button onclick="tryStartBuildingUpgrade(${idx})"
              ${canAfford ? '' : 'disabled'}
              style="width:calc(100% - 32px);margin:14px 16px 4px;padding:14px;background:${canAfford ? 'rgba(95,255,232,.08)' : 'rgba(120,140,136,.05)'};border:1px solid ${canAfford ? 'rgba(95,255,232,.4)' : 'var(--line)'};border-radius:8px;color:${canAfford ? 'var(--cyan)' : 'var(--mut)'};font-size:12px;letter-spacing:.18em;text-transform:uppercase;cursor:${canAfford ? 'pointer' : 'not-allowed'};font-weight:500">
        ${canAfford ? `↑ Améliorer vers Tier ${nextTier}` : 'Ressources insuffisantes'}
      </button>
    `;
  }

  // Skills débloqués (preview — l'arbre tech complet sera la passe 2.6)
  const skillsEl = document.getElementById('bd-skills');
  const skillsLabel = document.getElementById('bd-skills-label');
  const _skHtml = window.SBSkills ? SBSkills.buildingHtml(buildingKey) : '';   // PATCH_1610_SKILLS
  if (_skHtml) { skillsLabel.style.display = ''; skillsEl.style.display = ''; skillsEl.innerHTML = _skHtml; }
  const linkedSkills = _skHtml ? [] : getSkillsLinkedToBuilding(buildingKey);
  if (_skHtml) {}
  else if (linkedSkills.length === 0) {
    skillsLabel.style.display = 'none';
    skillsEl.style.display = 'none';
  } else {
    skillsLabel.style.display = '';
    skillsEl.style.display = '';
    skillsEl.innerHTML = linkedSkills.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
        <div>
          <div style="font-size:13px;color:var(--txt);display:flex;align-items:center;gap:6px">${renderIcon(s.icon || '◇', {size:13})} <span>${s.name}</span></div>
          <div style="font-size:11px;color:var(--mut);margin-top:2px">${s.effect}</div>
        </div>
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${s.unlocked ? 'var(--green)' : (s.available ? 'var(--cyan)' : 'var(--mut)')};display:inline-flex;align-items:center;gap:5px">${s.unlocked ? `${icon('check', {size:11, color:'var(--green)'})} Acquis` : (s.available ? 'Disponible' : 'Verrouillé')}</div>
      </div>
    `).join('') + `
      <div style="margin-top:12px;text-align:center">
        <button onclick="toast('Arbre technologique — passe 2.6')" style="background:transparent;border:none;color:var(--cyan);font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;padding:6px">
          Voir l'arbre complet →
        </button>
      </div>
    `;
  }

  // PASSE 3.5-narrative : Archives ambient
  renderBuildingArchives(idx);
  // PATCH_2010_RECYCLER — recycler, tout en bas de la fiche
  { const arch = document.getElementById('bd-archives');
    let rz = document.getElementById('bd-recycle');
    if (!rz && arch) { rz = document.createElement('div'); rz.id = 'bd-recycle'; rz.style.marginTop = '14px'; arch.after(rz); }
    if (rz) rz.innerHTML = recycleSectionHtml(idx); }
  // SHIP3D — le chantier orbital a sa fiche 3D plein cadre (OS-01) ; après les surcouches de home.js
  setTimeout(() => {
    if (BUILDING_SHIP3D[buildingKey]) mountBuildingShip3D(buildingKey, currentTier); else unmountBuildingShip3D();
  }, 0);
}

function tryStartBuildingUpgrade(idx) {
  const _p = G.planet.parcels[idx];
  if (_p && _p.damaged) { toast('Bâtiment abîmé : répare-le d\'abord'); return; }
  if (startBuildingUpgrade(idx)) {
    renderBuildingDetail();
    renderDashboard();
  }
}

// ─── PASSE 3.5-narrative : Rendu des archives ambient ───
function renderBuildingArchives(parcelIdx) {
  const archivesLabel = document.getElementById('bd-archives-label');
  const archivesEl = document.getElementById('bd-archives');
  if (!archivesEl || !archivesLabel) return;

  // Vérifier que ce bâtiment supporte les archives
  const parcel = G.planet.parcels[parcelIdx];
  if (!parcel || !_getAmbientFamily(parcel.building)) {
    archivesLabel.style.display = 'none';
    archivesEl.style.display = 'none';
    return;
  }

  const reports = getAmbientReportsForParcel(parcelIdx);
  if (reports.length === 0) {
    archivesLabel.style.display = 'none';
    archivesEl.style.display = 'none';
    return;
  }

  // Afficher la section
  archivesLabel.style.display = '';
  archivesEl.style.display = '';

  const unreadCount = reports.filter(r => !r.read).length;
  const unreadBadge = unreadCount > 0
    ? ` <span style="display:inline-block;background:var(--amber);color:#000;font-size:10px;padding:1px 6px;border-radius:8px;letter-spacing:.05em;font-weight:600;vertical-align:middle">${unreadCount}</span>`
    : '';
  archivesLabel.innerHTML = `Archives${unreadBadge}`;

  archivesEl.innerHTML = reports.map(r => {
    const isExpanded = (G._expandedArchive === r.id);
    const family = r.buildingFamily;
    const fmt = _getAmbientFormat(family);
    const incidentColor = (typeof r.incident === 'string' && r.incident.includes('majeur')) ? 'var(--red)'
      : r.incident === 'aucun' ? 'var(--mut)'
      : 'var(--amber)';
    const dot = !r.read ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--amber);margin-right:6px;vertical-align:middle"></span>` : '';
    const dateLabel = new Date(r.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    if (!isExpanded) {
      // Vue compacte
      const preview = r.narrative.split('\n')[0].slice(0, 80);
      return `
        <div onclick="toggleArchive('${r.id}')" style="cursor:pointer;padding:10px 0;border-bottom:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--amber);letter-spacing:.14em;text-transform:uppercase">
            <span>${dot}${fmt.header}</span>
            <span style="color:var(--mut);letter-spacing:0;text-transform:none">${dateLabel}</span>
          </div>
          <div style="font-size:11px;color:var(--mut);font-style:italic;margin-top:6px;line-height:1.5">${preview}…</div>
        </div>
      `;
    } else {
      // Vue détaillée — champ central adapté à la famille
      const centralLines = fmt.centralFields(r);
      return `
        <div style="padding:14px 0;border-bottom:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--amber);letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid rgba(255,192,96,.2);padding-bottom:6px">
            <span>═══ ${fmt.header} ═══</span>
            <span style="color:var(--mut);letter-spacing:0;text-transform:none">${dateLabel}</span>
          </div>
          <div style="font-family:'SF Mono',monospace;font-size:11px;line-height:1.7;color:var(--mut);margin-bottom:14px">
            <div><span style="color:var(--mut)">Bâtiment   :</span> <span style="color:#e6f0ff">${r.buildingName}</span></div>
            ${centralLines}
            <div><span style="color:var(--mut)">Incident   :</span> <span style="color:${incidentColor}">${r.incident}</span></div>
            <div style="margin-top:6px;color:var(--amber);font-size:10px;letter-spacing:.12em;text-transform:uppercase">▸ Note humaine archivée automatiquement</div>
          </div>
          <div style="font-style:italic;color:#e6f0ff;font-size:13px;line-height:1.8;white-space:pre-line;padding:0 4px">${r.narrative}</div>
          <div style="font-family:'SF Mono',monospace;font-size:10px;color:var(--mut);margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.15)">
            ▸ Conséquence gameplay : aucune<br>
            ▸ ${fmt.footer(r)}
          </div>
          <div style="margin-top:10px;text-align:center">
            <button onclick="toggleArchive('${r.id}')" style="background:transparent;border:none;color:var(--cyan);font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;padding:4px">
              ↑ Replier
            </button>
          </div>
        </div>
      `;
    }
  }).join('');
}

// Toggle l'affichage d'un rapport (compact ↔ détaillé) + marque comme lu
function toggleArchive(reportId) {
  if (G._expandedArchive === reportId) {
    G._expandedArchive = null;
  } else {
    G._expandedArchive = reportId;
    markAmbientReportAsRead(reportId);
  }
  renderBuildingDetail();
}

function renderTierProduction(tierData, buildingMeta, prevTierForCompare) {
  let html = '';
  const lines = [];
  if (tierData.prod) {
    for (const [res, rate] of Object.entries(tierData.prod)) {
      const resInfo = prodInfo(res);
      const label = resInfo?.label || res;
      const color = resInfo?.color || 'var(--txt)';
      let txt = `<span style="color:${color}">${label}</span> <strong style="color:${color}">${rateLbl(res, rate)}</strong>`;
      const _sm = skillMult(res);   // PATCH_1610_SKILLS_DISPLAY : la part des skills, lisible
      if (_sm > 1.0001) txt += window.SBSkills && SBSkills.prodTag ? SBSkills.prodTag(res) : ` <span style="color:var(--green);font-size:10px">dont +${Math.round((_sm - 1) * 100)} % skills</span>`;
      if (prevTierForCompare?.prod?.[res]) {
        const factor = (rate / prevTierForCompare.prod[res]).toFixed(1);
        txt += ` <span style="color:var(--mut);font-size:10px">(×${factor})</span>`;
      }
      lines.push(txt);
    }
  }
  if (tierData.def !== undefined) {
    let txt = `<span style="color:var(--red)">Défense passive</span> <strong style="color:var(--red)">+${tierData.def}</strong>`;
    if (prevTierForCompare?.def) {
      const factor = (tierData.def / prevTierForCompare.def).toFixed(1);
      txt += ` <span style="color:var(--mut);font-size:10px">(×${factor})</span>`;
    }
    lines.push(txt);
  }
  if (tierData.slots !== undefined) {
    lines.push(`<span style="color:var(--cyan)">Cales actives</span> <strong style="color:var(--cyan)">×${tierData.slots}</strong>`);
  }
  // ─── Silo (passe 2.4) : afficher la capacité ajoutée ───
  if (tierData.siloCap !== undefined && buildingMeta?.silo) {
    const res = buildingMeta.silo.res;
    const resInfo = tileInfo(res);
    const label = resInfo?.label || res;
    const color = resInfo?.color || 'var(--txt)';
    let txt = `<span style="color:${color}">Capacité ${label}</span> <strong style="color:${color}">+${fmt(tierData.siloCap)}</strong>`;
    if (prevTierForCompare?.siloCap) {
      const factor = (tierData.siloCap / prevTierForCompare.siloCap).toFixed(1);
      txt += ` <span style="color:var(--mut);font-size:10px">(×${factor})</span>`;
    }
    lines.push(txt);
  }
  if (lines.length === 0) {
    lines.push(`<span style="color:var(--mut);font-style:italic">Pas de production passive</span>`);
  }
  return lines.map(l => `<div style="padding:8px 0;border-bottom:1px solid var(--line);font-size:13px">${l}</div>`).join('');
}

function renderTierCost(tierData) {
  const costEntries = Object.entries(tierData.cost || {});
  let html = '';
  for (const [res, qty] of costEntries) {
    const resInfo = tileInfo(res);
    const have = G.res[res]?.v || 0;
    const enough = have >= qty;
    const color = enough ? (resInfo?.color || 'var(--txt)') : 'var(--red)';
    html += `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px">
      <span style="color:var(--mut)">${resInfo?.label || res}</span>
      <span style="color:${color};font-family:var(--font-mono)">${fmt(qty)}${enough ? '' : ` <span style="font-size:10px">(disp. ${fmt(have)})</span>`}</span>
    </div>`;
  }
  if (tierData.duration > 0) {
    html += `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px">
      <span style="color:var(--mut)">⏱ Durée</span>
      <span style="color:var(--amber);font-family:var(--font-mono)">${formatDuration(Math.max(1, Math.round(tierData.duration * (window.SBSkills ? SBSkills.durMult('build') : 1))))}${window.SBSkills ? SBSkills.durTag('build') : ''}</span>
    </div>`;
  }
  return html;
}

function canAffordCost(cost) {
  for (const [res, qty] of Object.entries(cost || {})) {
    if (!G.res[res] || G.res[res].v < qty) return false;
  }
  return true;
}

function formatDuration(sec) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m}min ${s}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}min` : `${h}h`;
}

function hexToRgb(colorVar) {
  // Approximation — pour usage dans border-color rgba()
  const map = {
    'var(--cyan)':  '95,255,232',
    'var(--amber)': '255,192,96',
    'var(--warm)':  '255,136,72',
    'var(--red)':   '255,80,64',
    'var(--blue)':  '80,152,255',
    'var(--green)': '126,208,128',
  };
  if (map[colorVar]) return map[colorVar];
  // Fallback : parser un hex direct type "#ffc864" ou "#fff"
  if (typeof colorVar === 'string' && colorVar.startsWith('#')) {
    let hex = colorVar.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0,2), 16);
      const g = parseInt(hex.slice(2,4), 16);
      const b = parseInt(hex.slice(4,6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return `${r},${g},${b}`;
    }
  }
  return '232,240,232';
}

function getSkillsLinkedToBuilding(buildingKey) {
  // Préview pour la fiche bâtiment — l'arbre tech complet viendra en passe 2.6
  const map = {
    mine: [
      { name:'Forage profond',     effect:'+30% métal extraction', icon:'pickaxe', unlocked:false, available:false },
      { name:'Cartographie sismique', effect:'Révèle les gisements riches', icon:'map', unlocked:false, available:false },
    ],
    centrale: [
      { name:'Cellules solaires',  effect:'+15% énergie passive',  icon:'☀', unlocked:false, available:false },
      { name:'Supraconducteurs',   effect:'-20% conso bâtiments',  icon:'zap', unlocked:false, available:false },
    ],
    labo: [
      { name:'Cristallographie',   effect:'+25% cristal Match-3',  icon:'gem', unlocked:false, available:false },
      { name:'Analyse de terrain', effect:'Voir gisements voisins',icon:'microscope', unlocked:false, available:false },
      { name:'Synthèse matrices',  effect:'Conversion ressources', icon:'⚛', unlocked:false, available:false },
    ],
    caserne: [
      { name:'Recrutement éclair', effect:'-30% durée mobilisation', icon:'sword', unlocked:false, available:false },
      { name:'Cohésion d\'unités', effect:'+10% défense gardes',     icon:'shield', unlocked:false, available:false },
    ],
    shipyard: [
      { name:'Propulsion ionique', effect:'Sondes 2× plus rapides',  icon:'rocket', unlocked:false, available:false },
      { name:'Blindage composite', effect:'Frégates +50% résistance',icon:'rocket', unlocked:false, available:false },
    ],
    turret: [
      { name:'Cachette protectrice', effect:'Protège N soldats lors d\'un raid', icon:'shield', unlocked:false, available:false },
      { name:'Mines orbitales',      effect:'+1500 dégâts au 1er ennemi',       icon:'💥', unlocked:false, available:false },
      { name:'Champ de distorsion',  effect:'-30% efficacité ennemie',          icon:'🌀', unlocked:false, available:false },
    ],
    comptoir: [
      { name:'Cartographe en herbe', effect:'+15% chance carte de route au tanker', icon:'map',     unlocked:false, available:false },
      { name:'Négoce structuré',     effect:'-15% taxe sur transactions marché',     icon:'gem',     unlocked:false, available:false },
      { name:'Réseau d\'éclaireurs', effect:'Détecte routes voisines au passage',    icon:'satellite', unlocked:false, available:false },
    ],
  };
  return map[buildingKey] || [];
}

function renderUnitDetailScreen() {
  const key = selectedUnitDetailKey;
  // Le label du bouton back est géré automatiquement par updateBackButtonLabel
  // selon la stack de navigation
  // Router selon le type d'unité
  if (selectedUnitDetailKind === 'ship') {
    renderShipUnitDetail(key);
  } else {
    renderDefenseUnitDetail(key);
  }
}

// ─── Fiche détail d'une unité défensive (Garde / Lourd / Tourelle) ───
function renderDefenseUnitDetail(key) {
  if (!key || !DEFENSE_UNITS[key]) {
    goto('defense');
    return;
  }
  const unit = DEFENSE_UNITS[key];
  ensureDefenseUnits();
  const stat = G.defense.units[key];

  document.getElementById('ud-title').textContent = unit.name.toUpperCase();
  const atkBadge = unit.atkPerUnit > 0
    ? ` <span class="dot"></span> Attaque · <span style="color:var(--amber)">${unit.atkPerUnit}/unité</span>`
    : '';
  document.getElementById('ud-meta').innerHTML = `Défense · <span style="color:${unit.color}">${unit.defPerUnit}/unité</span>${atkBadge}`;
  document.getElementById('ud-banner').style.borderColor = 'rgba(255,80,64,.25)';
  unmountUnitShip3D();
  const udIcon = document.getElementById('ud-icon');
  udIcon.innerHTML = getIllustration(key);
  udIcon.style.color = unit.color;
  document.getElementById('ud-name').textContent = unit.name;
  const subText = unit.atkPerUnit > 0
    ? `${unit.defPerUnit} défense · ${unit.atkPerUnit} attaque par unité${unit.transportable ? ' · Embarquable' : ''}`
    : `${unit.defPerUnit} défense par unité${unit.transportable === false ? ' · Fixe au sol' : ''}`;
  document.getElementById('ud-sub').textContent = subText;
  document.getElementById('ud-desc-text').textContent = unit.desc;

  // Composition
  const subtotalDef = stat.qty * unit.defPerUnit;
  const subtotalAtk = stat.qty * (unit.atkPerUnit || 0);
  let compositionRows = `
    <div class="dash-stat-row"><span class="lbl">Quantité totale</span><span class="val" style="color:${unit.color}">${stat.qty}</span></div>
    <div class="dash-stat-row"><span class="lbl">Endommagées</span><span class="val ${stat.dmg > 0 ? 'warn' : ''}">${stat.dmg}</span></div>
    <div class="dash-stat-row"><span class="lbl">Défense par unité</span><span class="val">${unit.defPerUnit}</span></div>
  `;
  if (unit.atkPerUnit > 0) {
    compositionRows += `<div class="dash-stat-row"><span class="lbl">Attaque par unité</span><span class="val" style="color:var(--amber)">${unit.atkPerUnit}</span></div>`;
  }
  compositionRows += `<div class="dash-stat-row" style="border-top:1px solid var(--line);padding-top:8px;margin-top:6px"><span class="lbl">Sous-total défense</span><span class="val ok">${fmt(subtotalDef)}</span></div>`;
  if (unit.atkPerUnit > 0 && stat.qty > 0) {
    compositionRows += `<div class="dash-stat-row"><span class="lbl">Sous-total attaque (en flotte)</span><span class="val" style="color:var(--amber)">${fmt(subtotalAtk)}</span></div>`;
  }
  if (unit.transportable) {
    compositionRows += `<div class="dash-stat-row"><span class="lbl">Mobilité</span><span class="val" style="color:var(--cyan);font-size:10px">Embarquable dans Tankers</span></div>`;
  }
  document.getElementById('ud-composition').innerHTML = compositionRows;
  // Restaurer le label "Composition"
  document.querySelectorAll('#scr-unit-detail .section-label').forEach((el, i) => {
    if (i === 0) el.textContent = 'Composition';
    if (i === 1) el.textContent = 'Coût de réparation / scrap';
  });

  // Coûts
  const repairCostStr = Object.entries(unit.repairCost).map(([res, q]) => `${q} ${res}`).join(' · ');
  const scrapReturnStr = Object.entries(unit.scrapReturn).map(([res, q]) => `${q} ${res}`).join(' · ');
  document.getElementById('ud-costs').innerHTML = `
    <div class="dash-stat-row"><span class="lbl">Réparation</span><span class="val" style="color:var(--amber)">${repairCostStr}/u</span></div>
    <div class="dash-stat-row"><span class="lbl">Recyclage (scrap)</span><span class="val" style="color:var(--green)">${scrapReturnStr}/u</span></div>
  `;

  // Actions
  const actionsEl = document.getElementById('ud-actions');
  let actionsHtml = '';
  if (stat.dmg > 0) {
    actionsHtml += `<button class="btn-primary" style="width:100%;padding:14px;margin-bottom:8px" onclick="repairUnit('${key}')">Réparer ${stat.dmg} unités</button>`;
  }
  if (stat.qty > 0) {
    actionsHtml += `<button class="btn-ghost" style="width:100%;padding:14px;margin-bottom:8px" onclick="confirmScrapUnit('${key}')">Recycler 1 unité</button>`;
  }
  actionsHtml += `<button class="btn-ghost" style="width:100%;padding:14px" onclick="goBack()">Retour</button>`;
  actionsEl.innerHTML = actionsHtml;
}   // { key, handle }
function mountUnitShip3D(key, inService) {
  const scr = document.getElementById('scr-unit-detail');
  const scroll = scr && scr.querySelector('.screen-scroll');
  const model = UNIT_SHIP3D_MODELS[key];
  if (!scr || !scroll || !model || !window.WebGLRenderingContext) return false;
  // héros : couche 3D sous la fiche + espace libre après le titre
  let hero = document.getElementById('ud-ship-hero');
  if (!hero) { hero = document.createElement('div'); hero.id = 'ud-ship-hero'; hero.className = 'u3d u3d-hero'; scr.insertBefore(hero, scroll); }
  let space = document.getElementById('ud-hero-space');
  if (!space) { space = document.createElement('div'); space.id = 'ud-hero-space'; space.className = 'ud-hero-space'; const h = scroll.querySelector('.head'); scroll.insertBefore(space, h ? h.nextSibling : scroll.firstChild); }
  const oldU3d = document.getElementById('ud-u3d');
  if (oldU3d && window.SBUnit3D) { try { window.SBUnit3D.unmount(oldU3d); } catch (e) {} }
  scr.classList.add('ud-hero', 'ud-ship');
  hero.style.display = '';
  scroll.scrollTop = 0;
  let stat = hero.querySelector('.u3d-stat');
  if (!stat) {
    hero.insertAdjacentHTML('beforeend', `<div class="u3d-stat"><b></b><span>en service</span></div><div class="u3d-hint">${model.code} · glisser pour tourner</div>`);
    stat = hero.querySelector('.u3d-stat');
  }
  stat.querySelector('b').textContent = fmt(inService);
  // bande basse (zone des cartes) : place le compteur et l'aide juste au-dessus, comme le soldat lourd
  requestAnimationFrame(() => {
    const hb = hero.getBoundingClientRect(), sb = space.getBoundingClientRect();
    if (hb.height) hero.style.setProperty('--u3d-band', Math.max(0, hb.bottom - sb.bottom) + 'px');
  });
  if (unitShip3D && unitShip3D.key === key) return true;
  unmountUnitShip3D(true);
  hero.classList.add('u3d-loading');
  const start = () => {
    unitShip3D = { key, handle: window.Ship3D.mount(hero, {
      url: model.url, shiftY: 0.2, ship: model.profile && window.Ship3D.profiles ? window.Ship3D.profiles[model.profile] : undefined,
      onReady: () => hero.classList.remove('u3d-loading'),
      onError: () => { hero.classList.remove('u3d-loading'); hero.classList.add('u3d-fail'); },
    }) };
  };
  shipHeroGestures();
  if (window.Ship3D) start(); else window.addEventListener('ship3d-ready', start, { once: true });
  return true;
}
function shipHeroGestures(scrId = 'scr-unit-detail', getHandle = () => unitShip3D && unitShip3D.handle, onTap = null) {
  if (shipHeroGesturesOn[scrId]) return;
  shipHeroGesturesOn[scrId] = true;
  const scr = document.getElementById(scrId);
  const pts = new Map(); let mode = null, last = null, pinch0 = 0;
  const h = getHandle;
  const dist = () => { const v = [...pts.values()]; return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); };
  scr.addEventListener('pointerdown', (e) => {
    if (!scr.classList.contains('ud-ship') || !h()) return;
    if (!e.target.closest || !e.target.closest('.ud-hero-space')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { mode = 'pinch'; pinch0 = dist(); }
    else { mode = 'orbit'; last = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }; }
    h().begin();
  }, { passive: true });
  window.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !h()) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pts.size === 2) { const d = dist(); if (d > 10 && pinch0 > 10) h().dolly(pinch0 / d); pinch0 = d; return; }
    if (mode === 'orbit') { h().orbit(e.clientX - last.x, e.clientY - last.y); last.x = e.clientX; last.y = e.clientY; }
  }, { passive: true });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    if (onTap && mode === 'orbit' && last && e.type === 'pointerup' && Math.hypot(e.clientX - last.x0, e.clientY - last.y0) < 8 && performance.now() - last.t0 < 350) {
      const hit = h() && h().pick ? h().pick(e.clientX, e.clientY) : null;   // toucher un vaisseau à quai → sa fiche
      if (hit) setTimeout(() => onTap(hit), 0);
    }
    pts.delete(e.pointerId);
    if (pts.size === 0) { mode = null; if (h()) h().end(); }
    else if (mode === 'pinch') { mode = null; }
  };
  window.addEventListener('pointerup', up, { passive: true });
  window.addEventListener('pointercancel', up, { passive: true });
  scr.addEventListener('wheel', (e) => {             // souris : molette au-dessus des cartes = zoom
    if (!scr.classList.contains('ud-ship') || !h() || !e.target.closest || !e.target.closest('.ud-hero-space')) return;
    e.preventDefault(); h().begin(); h().dolly(1 + e.deltaY * 0.0012); h().end();
  }, { passive: false });
}
// ─── SHIP3D : écran Flotte = station OS-01 + flotte à quai (remplace la vue orbite de home.js) ───
function hasShipyardBuilt() {
  return !!(typeof G !== 'undefined' && G.planet && G.planet.parcels && G.planet.parcels.some(p => p && p.building === 'shipyard' && p.state === 'built'));
}
function fleetStationedCount(k) {
  const c = (G.fleet && G.fleet.stationed && G.fleet.stationed[k]) || {};
  return (c.t1 || 0) + (c.t2 || 0) + (c.t3 || 0);
}
function fleetDockList() {
  // Postes à quai, repère glTF de la station, en mètres.
  const out = [];
  const tankSlots = [[0, -10.5, -190, Math.PI], [187, -20, 0, Math.PI / 2], [-187, -20, 0, -Math.PI / 2], [0, -20, 187, 0]];   // d'abord le quai de la jetée-hangar, puis sous les bras
  for (let i = 0; i < Math.min(4, fleetStationedCount('tanker')); i++) {
    const [x, y, z, r] = tankSlots[i];
    out.push({ ...DOCK_MODELS.tanker, type: 'tanker', pos: [x, y, z], rotY: r });
  }
  // frégates amarrées le long des bras diagonaux (lat : côté du bras, poupe vers l'anneau, proue vers l'extérieur) ;
  // cuirassé à quai de l'autre côté du bras avant gauche, à échelle de maquette (1 318 m réels : il écraserait la station)
  const berth = (deg, r, lat, y) => { const a = deg * Math.PI / 180; return { pos: [r * Math.cos(a) + lat * Math.sin(a), y, -r * Math.sin(a) + lat * Math.cos(a)], rotY: a + Math.PI / 2 }; };
  const frigBerths = [[45, 26], [225, 26], [135, -26], [315, -26]];
  for (let i = 0; i < Math.min(4, fleetStationedCount('fregate')); i++) {
    const [deg, lat] = frigBerths[i];
    out.push({ ...DOCK_MODELS.fregate, type: 'fregate', ...berth(deg, 195, lat, -8) });
  }
  if (fleetStationedCount('cuirasse') > 0) out.push({ ...DOCK_MODELS.cuirasse, type: 'cuirasse', scale: 0.12, ...berth(135, 239, 24.7, -13) });
  return out;
}   // { sig, handle }
function mountFleetStation3D() {
  const scr = document.getElementById('scr-fleet');
  const scroll = scr && scr.querySelector('.screen-scroll');
  const model = BUILDING_SHIP3D.shipyard;
  if (!scr || !scroll || !model || !window.WebGLRenderingContext) return false;
  let hero = document.getElementById('fleet-ship-hero');
  if (!hero) { hero = document.createElement('div'); hero.id = 'fleet-ship-hero'; hero.className = 'u3d u3d-hero'; scr.insertBefore(hero, scroll); }
  let space = document.getElementById('fleet-ship-space');
  if (!space) { space = document.createElement('div'); space.id = 'fleet-ship-space'; space.className = 'ud-hero-space'; const h = scroll.querySelector('.head'); scroll.insertBefore(space, h ? h.nextSibling : scroll.firstChild); }
  scr.classList.add('ud-hero', 'ud-ship');
  hero.style.display = ''; space.style.display = '';
  const dock = fleetDockList();
  const total = ['tanker', 'fregate', 'cuirasse'].reduce((a, k) => a + fleetStationedCount(k), 0);
  let stat = hero.querySelector('.u3d-stat');
  if (!stat) {
    hero.insertAdjacentHTML('beforeend', `<div class="u3d-stat"><b></b><span>à quai</span></div><div class="u3d-hint"></div>`);
    stat = hero.querySelector('.u3d-stat');
  }
  stat.querySelector('b').textContent = fmt(total);
  hero.querySelector('.u3d-hint').textContent = total ? 'OS-01 · touche un vaisseau' : 'OS-01 · poste 01 prêt';
  requestAnimationFrame(() => {
    const hb = hero.getBoundingClientRect(), sb = space.getBoundingClientRect();
    if (hb.height) hero.style.setProperty('--u3d-band', Math.max(0, hb.bottom - sb.bottom) + 'px');
  });
  shipHeroGestures('scr-fleet', () => fleetShip3D && fleetShip3D.handle, (type) => openUnitDetail(type, 'ship'));
  if (G.orbitUnseen) {                            // moment 7 : première arrivée au chantier opérationnel
    G.orbitUnseen = false; if (typeof saveGame === 'function') saveGame();
    if (typeof toast === 'function') toast('Chantier orbital opérationnel — ta flotte est à quai');
  }
  const sig = dock.map(d => d.type).join(',');
  if (fleetShip3D && fleetShip3D.sig === sig) return true;
  if (fleetShip3D) { try { fleetShip3D.handle.dispose(); } catch (e) {} fleetShip3D = null; }
  if (typeof bdShip3D !== 'undefined' && bdShip3D) { try { bdShip3D.handle.dispose(); } catch (e) {} bdShip3D = null; }   // une seule station en mémoire
  hero.classList.add('u3d-loading');
  const start = () => {
    fleetShip3D = { sig, handle: window.Ship3D.mount(hero, {
      url: model.url, shiftY: 0.2, ship: window.Ship3D.profiles ? window.Ship3D.profiles[model.profile] : undefined, dock, orbit: true,
      onReady: () => hero.classList.remove('u3d-loading'),
      onError: () => { hero.classList.remove('u3d-loading'); hero.classList.add('u3d-fail'); },
    }) };
  };
  if (window.Ship3D) start(); else window.addEventListener('ship3d-ready', start, { once: true });
  return true;
}
function unmountFleetStation3D() {
  const scr = document.getElementById('scr-fleet');
  if (fleetShip3D) { try { fleetShip3D.handle.dispose(); } catch (e) {} fleetShip3D = null; }
  const hero = document.getElementById('fleet-ship-hero'); if (hero) hero.style.display = 'none';
  const space = document.getElementById('fleet-ship-space'); if (space) space.style.display = 'none';
  if (scr) scr.classList.remove('ud-hero', 'ud-ship');
}   // { key, handle }
function mountBuildingShip3D(key, tier) {
  const scr = document.getElementById('scr-building-detail');
  const scroll = scr && scr.querySelector('.screen-scroll');
  const model = BUILDING_SHIP3D[key];
  if (!scr || !scroll || !model || !window.WebGLRenderingContext) return false;
  let hero = document.getElementById('bd-ship-hero');
  if (!hero) { hero = document.createElement('div'); hero.id = 'bd-ship-hero'; hero.className = 'u3d u3d-hero'; scr.insertBefore(hero, scroll); }
  let space = document.getElementById('bd-ship-space');
  if (!space) { space = document.createElement('div'); space.id = 'bd-ship-space'; space.className = 'ud-hero-space'; const h = scroll.querySelector('.head'); scroll.insertBefore(space, h ? h.nextSibling : scroll.firstChild); }
  scr.classList.add('ud-hero', 'ud-ship');
  hero.style.display = ''; space.style.display = '';
  let stat = hero.querySelector('.u3d-stat');
  if (!stat) {
    hero.insertAdjacentHTML('beforeend', `<div class="u3d-stat"><b></b><span>tier</span></div><div class="u3d-hint">${model.code} · glisser pour tourner</div>`);
    stat = hero.querySelector('.u3d-stat');
  }
  stat.querySelector('b').textContent = tier || 1;
  requestAnimationFrame(() => {
    const hb = hero.getBoundingClientRect(), sb = space.getBoundingClientRect();
    if (hb.height) hero.style.setProperty('--u3d-band', Math.max(0, hb.bottom - sb.bottom) + 'px');
  });
  shipHeroGestures('scr-building-detail', () => bdShip3D && bdShip3D.handle);
  if (bdShip3D && bdShip3D.key === key) return true;
  if (bdShip3D) { try { bdShip3D.handle.dispose(); } catch (e) {} bdShip3D = null; }
  if (fleetShip3D) { try { fleetShip3D.handle.dispose(); } catch (e) {} fleetShip3D = null; }   // une seule station en mémoire
  scroll.scrollTop = 0;
  hero.classList.add('u3d-loading');
  const start = () => {
    bdShip3D = { key, handle: window.Ship3D.mount(hero, {
      url: model.url, shiftY: 0.2, ship: window.Ship3D.profiles ? window.Ship3D.profiles[model.profile] : undefined, orbit: true,
      onReady: () => hero.classList.remove('u3d-loading'),
      onError: () => { hero.classList.remove('u3d-loading'); hero.classList.add('u3d-fail'); },
    }) };
  };
  if (window.Ship3D) start(); else window.addEventListener('ship3d-ready', start, { once: true });
  return true;
}
function unmountBuildingShip3D() {
  const scr = document.getElementById('scr-building-detail');
  const hero = document.getElementById('bd-ship-hero');
  if (!hero && !bdShip3D) return;                 // jamais monté : ne touche pas aux autres héros (tourelle)
  if (bdShip3D) { try { bdShip3D.handle.dispose(); } catch (e) {} bdShip3D = null; }
  if (hero) { hero.classList.remove('u3d-loading', 'u3d-fail'); hero.style.display = 'none'; }
  const space = document.getElementById('bd-ship-space'); if (space) space.style.display = 'none';
  if (scr && scr.classList.contains('ud-ship')) {
    scr.classList.remove('ud-ship');
    if (!document.getElementById('bd-u3d') || document.getElementById('bd-u3d').style.display === 'none') scr.classList.remove('ud-hero');
  }
}
function unmountUnitShip3D(keepClasses) {
  if (unitShip3D) { try { unitShip3D.handle.dispose(); } catch (e) {} unitShip3D = null; }
  const hero = document.getElementById('ud-ship-hero');
  if (hero) hero.classList.remove('u3d-loading', 'u3d-fail');
  if (keepClasses) return;                       // remontage immédiat d'un autre vaisseau
  if (hero) hero.style.display = 'none';
  const scr = document.getElementById('scr-unit-detail');
  if (scr) scr.classList.remove('ud-ship', 'ud-hero');
}

// ─── Fiche détail d'un vaisseau militaire (Tanker / Frégate / Cuirassé) ───
function renderShipUnitDetail(key) {
  if (key === 'colonial') return renderColonialDetail();   // PATCH_2010_COLONIE
  if (!key || !SHIP_UNITS[key] || !G.fleet.stationed[key]) {
    goto('fleet');
    return;
  }
  const meta = SHIP_UNITS[key];
  const counts = G.fleet.stationed[key]; // {t1, t2, t3}
  const total = counts.t1 + counts.t2 + counts.t3;

  document.getElementById('ud-title').textContent = meta.name.toUpperCase();
  document.getElementById('ud-banner').style.borderColor = 'rgba(95,255,232,.25)';
  // SHIP3D — cuirassé, frégate et tanker ont leur fiche 3D plein cadre : plus de case illustration (décision 11/10/2026)
  if (!(UNIT_SHIP3D_MODELS[key] && mountUnitShip3D(key, total))) unmountUnitShip3D();
  const udIcon = document.getElementById('ud-icon');
  if (PNG_ILLUSTRATIONS[key]) {
    udIcon.innerHTML = `<img class="illu-png" src="${PNG_ILLUSTRATIONS[key]}" alt="${meta.name}" onerror="pngFallback(this, '${key}')">`;
  } else {
    udIcon.innerHTML = meta.icon;
  }
  udIcon.style.color = meta.color || 'var(--cyan)';
  document.getElementById('ud-name').textContent = meta.name;

  // Sous-titre : description du rôle selon le type
  const roleSubs = {
    tanker: 'Transport de fret et de soldats · Cargo embarqué',
    fregate: 'Vaisseau de combat léger · Production de masse',
    cuirasse: 'Vaisseau capital · 70% récupérable au combat',
  };
  document.getElementById('ud-sub').textContent = roleSubs[key] || meta.name;

  // Stats agrégées
  let totalAtk = 0, totalDef = 0, totalCargo = 0, totalCap = 0;
  for (let tier = 1; tier <= 3; tier++) {
    const td = SHIP_TIERS[key]?.[tier];
    if (!td) continue;
    const qty = counts['t' + tier];
    totalAtk += qty * (td.atk || 0);
    totalDef += qty * (td.def || 0);
    totalCargo += qty * (td.cargo || 0);
    totalCap += qty * (td.transportCap || 0);
  }

  // Meta header
  let metaLine = `<span style="color:${meta.color || 'var(--cyan)'}">${total} vaisseau${total > 1 ? 'x' : ''}</span>`;
  if (totalAtk > 0) metaLine += ` <span class="dot"></span> <span style="color:var(--red)">${fmt(totalAtk)} atk</span>`;
  if (totalDef > 0) metaLine += ` <span class="dot"></span> <span style="color:var(--cyan)">${fmt(totalDef)} def</span>`;
  document.getElementById('ud-meta').innerHTML = metaLine;

  // ─── Composition (par tier) ───
  let compositionRows = '';
  for (let tier = 1; tier <= 3; tier++) {
    const qty = counts['t' + tier];
    if (qty === 0) continue;
    const td = SHIP_TIERS[key]?.[tier];
    if (!td) continue;
    const tierColor = tier === 1 ? 'var(--mut)' : tier === 2 ? 'var(--amber)' : 'var(--cyan)';
    compositionRows += `
      <div class="dash-stat-row" style="border-top:1px solid var(--line);padding-top:8px;margin-top:6px">
        <span class="lbl" style="color:${tierColor}">${td.name}</span>
        <span class="val" style="color:${tierColor}">× ${qty}</span>
      </div>
    `;
    if (td.atk) compositionRows += `<div class="dash-stat-row"><span class="lbl" style="padding-left:10px">↳ Attaque</span><span class="val" style="color:var(--red)">${fmt(td.atk * qty)} (${td.atk}/u)</span></div>`;
    if (td.def) compositionRows += `<div class="dash-stat-row"><span class="lbl" style="padding-left:10px">↳ Défense</span><span class="val" style="color:var(--cyan)">${fmt(td.def * qty)} (${td.def}/u)</span></div>`;
    if (td.cargo) compositionRows += `<div class="dash-stat-row"><span class="lbl" style="padding-left:10px">↳ Cargo</span><span class="val" style="color:var(--amber)">${fmt(td.cargo * qty)} (${fmt(td.cargo)}/u)</span></div>`;
    if (td.transportCap) compositionRows += `<div class="dash-stat-row"><span class="lbl" style="padding-left:10px">↳ Capacité soldats</span><span class="val">${fmt(td.transportCap * qty)} (${td.transportCap}/u)</span></div>`;
  }
  if (compositionRows === '') {
    compositionRows = `<div class="dash-stat-row"><span class="lbl" style="font-style:italic;color:var(--mut)">Aucun vaisseau de ce type</span><span class="val">0</span></div>`;
  }
  // Ligne totale
  compositionRows += `
    <div class="dash-stat-row" style="border-top:1px solid var(--line);padding-top:8px;margin-top:6px">
      <span class="lbl"><strong>Total</strong></span>
      <span class="val ok"><strong>${total}</strong></span>
    </div>
  `;
  if (totalAtk > 0) compositionRows += `<div class="dash-stat-row"><span class="lbl">Attaque cumulée</span><span class="val" style="color:var(--red)">${fmt(totalAtk)}</span></div>`;
  if (totalDef > 0) compositionRows += `<div class="dash-stat-row"><span class="lbl">Défense cumulée</span><span class="val" style="color:var(--cyan)">${fmt(totalDef)}</span></div>`;
  if (totalCargo > 0) compositionRows += `<div class="dash-stat-row"><span class="lbl">Cargo total</span><span class="val" style="color:var(--amber)">${fmt(totalCargo)}</span></div>`;
  if (totalCap > 0) compositionRows += `<div class="dash-stat-row"><span class="lbl">Capacité soldats totale</span><span class="val">${fmt(totalCap)}</span></div>`;

  document.getElementById('ud-composition').innerHTML = compositionRows;

  // ─── Doctrine (au lieu de "Coûts de réparation" pour les vaisseaux) ───
  // Le pattern de pertes (Battlestar Galactica) varie selon le type
  const doctrines = {
    // PATCH_2010_DOCTRINE : ce qui arrive à un vaisseau ABATTU (les survivants rentrent tous)
    tanker: {
      losses: 'Abattu : 1 sur 2 se récupère',
      role: 'Si un tanker est abattu au combat, il a une chance sur deux d\'être ramené en réparation. Les tankers épargnés rentrent normalement.',
    },
    fregate: {
      losses: 'Abattue : perdue',
      role: 'Une frégate qui rentre de mission revient à quai. Seule celle qui est abattue au combat est perdue : pas de canots de sauvetage.',
    },
    cuirasse: {
      losses: 'Abattu : 7 sur 10 se récupèrent',
      role: 'Si un cuirassé est abattu, ses canots et compartiments étanches permettent d\'en ramener 7 sur 10. Les cuirassés épargnés rentrent normalement.',
    },
  };
  const doctrine = doctrines[key];
  let costRows = '';
  if (doctrine) {
    costRows = `
      <div class="dash-stat-row"><span class="lbl">Si abattu au combat</span><span class="val" style="color:var(--amber);font-size:10px">${doctrine.losses}</span></div>
      <div style="font-size:11px;color:var(--mut);font-style:italic;line-height:1.5;padding:4px 0 2px">${doctrine.role}</div>
    `;
  }
  document.getElementById('ud-costs').innerHTML = costRows;

  // Renommer les labels de section pour les vaisseaux
  document.querySelectorAll('#scr-unit-detail .section-label').forEach((el, i) => {
    if (i === 0) el.textContent = 'Composition par tier';
    if (i === 1) el.textContent = 'Doctrine de combat';
  });

  // Description (placeholder cohérent)
  const descs = {
    tanker: "Le Tanker transporte ressources et soldats. Au combat, il agit comme un vaisseau armé léger avec son cargo disponible pour le pillage. Son rôle de balise de communication en planque le rend stratégiquement précieux.",
    fregate: "La Frégate est l'épine dorsale de toute flotte agressive. Produite en masse, conçue pour être perdue. Sa puissance vient du nombre, pas de l'individualité.",
    cuirasse: "Le Cuirassé est ton vaisseau de prestige. Il encaisse, survit, traverse des batailles entières. Il accumule des cicatrices au fil des missions — c'est ton Galactica personnel.",
  };
  document.getElementById('ud-desc-text').textContent = descs[key] || meta.name;

  // Actions — la fiche détail vaisseau est purement descriptive
  // Le CTA "Composer une flotte" vit sur Vue d'amiral pour cohérence de navigation
  const actionsEl = document.getElementById('ud-actions');
  actionsEl.innerHTML = `<button class="btn-ghost" style="width:100%;padding:14px" onclick="goBack()">Retour</button>`;
}

function repairUnit(key) {
  const stat = G.defense.units[key];
  const unit = DEFENSE_UNITS[key];
  if (stat.dmg <= 0) return;
  // Coût total = repairCost × dmg
  const total = {};
  for (const [res, q] of Object.entries(unit.repairCost)) total[res] = q * stat.dmg;
  for (const [res, q] of Object.entries(total)) {
    if (!G.res[res] || G.res[res].v < q) {
      toast(`Manque ${q - (G.res[res]?.v || 0)} ${res}`);
      return;
    }
  }
  for (const [res, q] of Object.entries(total)) G.res[res].v -= q;
  const repaired = stat.dmg;
  stat.dmg = 0;
  toast(`${repaired} ${unit.name} réparées`);
  renderUnitDetailScreen();
}

function confirmScrapUnit(key) {
  const stat = G.defense.units[key];
  const unit = DEFENSE_UNITS[key];
  if (stat.qty <= 0) return;
  const engaged = (G.fleet.prepared || []).filter(_sbMine).reduce((a, f) => a + (f.soldiers?.[key] || 0), 0) + soldiersCommittedElsewhere(key);
  if (stat.qty - engaged <= 0) { toast('Toutes ces unités sont engagées (flotte, garnison ou tanker)'); return; }
  stat.qty--;
  for (const [res, q] of Object.entries(unit.scrapReturn)) {
    if (G.res[res]) G.res[res].v = Math.min(G.res[res].max, G.res[res].v + q);
  }
  const returnStr = Object.entries(unit.scrapReturn).map(([r, q]) => `+${q} ${r}`).join(' · ');
  toast(`Recyclé · ${returnStr}`);
  renderUnitDetailScreen();
}

function setCapitalTab(tab) {
  capitalTab = tab;
  ['stats', 'skills', 'upgrade'].forEach(t => {
    const btn = document.getElementById('cap-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  renderCapitalTabContent();
}

function renderCapitalScreen() {
  document.getElementById('capital-tier').textContent = G.skills.capitalLevel;
  document.getElementById('capital-tier-sub').textContent = `Tier ${G.skills.capitalLevel} — ${(BUILDING_TIERS.capital[G.skills.capitalLevel] || {}).name || 'Hub stratégique'}`;
  setCapitalTab(capitalTab);
  // S'assurer que le ticker tourne (au cas où une amélioration serait active)
  if (typeof startQueueTicker === 'function') startQueueTicker();
}

function renderCapitalTabContent() {
  const el = document.getElementById('capital-tab-content');
  if (!el) return;

  if (capitalTab === 'stats') {
    el.innerHTML = `
      <div class="section-label">Production passive</div>
      <div class="dash-section-card" style="margin: 0 16px;">
        <div class="dash-stat-row"><span class="lbl">Ordre logistique</span><span class="val ok">+5/h</span></div>
        <div class="dash-stat-row"><span class="lbl">Défense passive</span><span class="val">${G.defense.capitalBase}</span></div>
        <div class="dash-stat-row"><span class="lbl">Cales actives</span><span class="val">${G.skills.barracksSlots}</span></div>
        <div class="dash-stat-row"><span class="lbl">Vitesse construction</span><span class="val">×${G.skills.productionSpeed.toFixed(2)}</span></div>
      </div>

      <div class="section-label">Skills débloqués</div>
      <div class="dash-section-card" style="margin: 0 16px;">
        ${CAPITAL_SKILLS.filter(s => s.isApplied()).map(s =>
          `<div class="dash-stat-row"><span class="lbl">${s.name}</span><span class="val ok">${icon('check', {size:11, color:'#5fcc8a'})}</span></div>`
        ).join('') || '<div style="font-size:11px;color:var(--mut);font-style:italic;text-align:center;padding:8px 0">Aucun skill débloqué</div>'}
      </div>
    `;
  } else if (capitalTab === 'skills') {
    el.innerHTML = `
      <div class="section-label">Compétences disponibles</div>
      <div style="margin: 0 16px;">
        ${CAPITAL_SKILLS.map(s => renderSkillRow(s)).join('')}
      </div>
    `;
  } else if (capitalTab === 'upgrade') {
    // Section : amélioration de bâtiment en cours via le Centre
    let buildingUpgradeHtml = '';
    const up = QUEUES.capital.upgrade;
    if (up) {
      const upgradeParcel = G.planet.parcels[up.parcelIdx];
      const tierData = BUILDING_TIERS[up.buildingKey]?.[up.toTier];
      const buildingMeta = BUILDINGS[up.buildingKey] || (up.buildingKey === 'capital' ? CAPITAL_META : null);
      if (upgradeParcel && tierData && buildingMeta) {
        const pct = Math.min(100, Math.floor((up.elapsed / up.totalDur) * 100));
        const remaining = Math.max(0, up.totalDur - up.elapsed);
        buildingUpgradeHtml = `
          <div class="section-label">Chantier en cours</div>
          <div class="dash-section-card" style="margin:0 16px;border-color:rgba(255,192,96,.4);padding:14px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="font-size:18px;color:${buildingMeta.color}">${buildingMeta.icon}</span>
              <div style="flex:1">
                <div style="font-size:13px;color:var(--txt);font-weight:600">${tierData.name}</div>
                <div style="font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.12em">Tier ${up.fromTier} → ${up.toTier}</div>
              </div>
              <div style="font-family:var(--font-mono);font-size:13px;color:var(--amber)">${formatDuration(remaining)}</div>
            </div>
            <div style="height:4px;background:var(--bg-2);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:var(--amber);transition:width 0.5s"></div>
            </div>
            <button onclick="onBuildingUpgradeCancelClick('capital')"
                    style="margin-top:12px;width:100%;padding:9px;background:transparent;border:1px solid rgba(255,80,64,.3);border-radius:6px;color:var(--red);font-size:10px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer">
              Annuler la commande
            </button>
          </div>
        `;
      }
    } else {
      buildingUpgradeHtml = `
        <div class="section-label">Chantier en cours</div>
        <div class="dash-section-card" style="margin:0 16px;padding:18px;text-align:center">
          <div style="font-size:11px;color:var(--mut);font-style:italic">
            Aucune amélioration de bâtiment en cours.
          </div>
          <div style="font-size:10px;color:var(--mut);margin-top:6px;line-height:1.5">
            Sélectionne un bâtiment depuis Ma Planète et clique sur "Améliorer".
          </div>
        </div>
      `;
    }

    const lvl = G.skills.capitalLevel;
    if (lvl >= 3) {
      el.innerHTML = `
        ${buildingUpgradeHtml}
        <div class="section-label">Niveau du Centre</div>
        <div class="info" style="margin: 12px 16px;">
          <div class="sub" style="margin-top:0;text-align:center;font-size:13px;color:var(--cyan)">⊕ Centre Tier 3 (max)</div>
          <div class="sub" style="margin-top:6px">Le Centre de Commandement est à son niveau maximal.</div>
        </div>
      `;
      return;
    }
    const cost = CAPITAL_UPGRADE_COSTS[lvl - 1];
    const costStr = Object.entries(cost).map(([res, q]) => `${q} ${res}`).join(' · ');
    const canAfford = Object.entries(cost).every(([res, q]) => G.res[res] && G.res[res].v >= q);
    const busy = !!QUEUES.capital.upgrade;
    const capDur = Math.round(((BUILDING_TIERS.capital[lvl + 1] || {}).duration || 0) * (window.SBSkills ? SBSkills.durMult('build') : 1));
    const capDurLbl = capDur >= 3600 ? `${Math.floor(capDur / 3600)} h ${String(Math.round((capDur % 3600) / 60)).padStart(2, '0')}` : `${Math.round(capDur / 60)} min`;

    el.innerHTML = `
      ${buildingUpgradeHtml}
      <div class="section-label">Améliorer le Centre lui-même</div>
      <div class="dash-section-card" style="margin: 0 16px;">
        <div class="dash-stat-row"><span class="lbl">Niveau actuel</span><span class="val">Tier ${lvl}</span></div>
        <div class="dash-stat-row"><span class="lbl">Niveau visé</span><span class="val ok">Tier ${lvl + 1}</span></div>
        <div class="dash-stat-row" style="border-top:1px solid var(--line);padding-top:8px;margin-top:6px"><span class="lbl">Coût</span><span class="val" style="color:var(--amber)">${costStr}</span></div>
        <div class="dash-stat-row"><span class="lbl">Durée</span><span class="val">${capDurLbl}</span></div>
      </div>

      <div style="padding:14px 16px 8px">
        <button class="btn-primary ${canAfford && !busy ? '' : 'disabled'}" style="width:100%;padding:14px" onclick="upgradeCapital()">
          ${busy ? (QUEUES.capital.upgrade.buildingKey === 'capital' ? 'Chantier du Centre en cours' : 'Un autre chantier est en cours') : canAfford ? `Améliorer vers Tier ${lvl + 1}` : 'Ressources insuffisantes'}
        </button>
      </div>

      <div class="section-label">Avantages au Tier ${lvl + 1}</div>
      <div class="info" style="margin: 0 16px;">
        <div class="sub" style="margin-top:0;line-height:1.6">
          ${lvl === 1
            ? '· Skills "Logistique parallèle II" et "Production accélérée II" deviennent achetables<br>· Défense de la capitale +200<br>· Le Centre se renforce sur la planète<br>· Capacité d\'amélioration jusqu\'au Tier 3'
            : '· Skill "Vaisseau Colonial" devient achetable<br>· Défense de la capitale +200<br>· Le Centre se renforce sur la planète<br>· Tier final · Hub d\'empire'
          }
        </div>
      </div>
    `;
  }
}

// PATCH_2610_COUT_SKILL (Damien : « c'est pas marqué combien ça coûte ») — le coût reste toujours affiché, ressource
// par ressource (ce que j'ai / ce qu'il faut), et on dit quand le stockage est trop petit pour le contenir
function sbSkillCostDetail(skill) {
  const NM = { metal: 'Métal', energie: 'Énergie', cristal: 'Cristal', biomass: 'Biomasse', artefact: 'Artefacts', fuel: 'Carburant' };
  const fmt = (n) => Math.floor(n).toLocaleString('fr-CH');
  const parts = Object.entries(skill.cost).map(([r, q]) => {
    const R = G.res[r] || { v: 0, max: 0 }, have = R.v || 0, ok = have >= q;
    const tooSmall = R.max > 0 && R.max < q;
    return `<span style="color:${ok ? 'var(--green)' : (tooSmall ? '#ff8a70' : 'var(--amber)')}">${NM[r] || r} ${fmt(Math.min(have, q))} / ${fmt(q)}</span>` +
      (tooSmall ? `<span style="display:block;color:#ff8a70;font-size:10px;margin-top:1px">Ton stockage de ${(NM[r] || r).toLowerCase()} s'arrête à ${fmt(R.max)} : améliore tes silos pour pouvoir réunir ${fmt(q)}.</span>` : '');
  });
  const dur = window.SBSkills && SBSkills.capDur ? `<span style="color:var(--mut)">Recherche · ${SBSkills.capDur(skill.key)}</span>` : '';
  return `<div class="skill-cost" style="display:flex;flex-direction:column;gap:2px;margin-top:3px">${parts.join('')}${dur}</div>`;
}
function renderSkillRow(skill) {
  const applied = skill.isApplied();
  const lvlReq = skill.requires.capitalLevel;
  const lvlOk = G.skills.capitalLevel >= lvlReq;
  const prereqOk = !skill.requires.prereq || CAPITAL_SKILLS.find(s => s.key === skill.requires.prereq)?.isApplied();
  const canAfford = Object.entries(skill.cost).every(([res, q]) => G.res[res] && G.res[res].v >= q);
  const _rs = window.SBSkills && SBSkills.capitalState ? SBSkills.capitalState(skill.key) : null;   // PATCH_1910_SKILLS_LONGS
  const _busy = !!G.research && !_rs;
  const buyable = !applied && lvlOk && prereqOk && canAfford && !_rs && !_busy;   // PATCH_2010_COLONIE : le skill s'apprend
  const costStr = Object.entries(skill.cost).map(([r, q]) => `${q} ${r}`).join(' · ') + (window.SBSkills && SBSkills.capDur ? ' · ' + SBSkills.capDur(skill.key) : '');

  let lockReason = '';
  if (applied) lockReason = 'Acquis';
  else if (!lvlOk) lockReason = `Centre Tier ${lvlReq} requis`;
  else if (!prereqOk) {
    const prereq = CAPITAL_SKILLS.find(s => s.key === skill.requires.prereq);
    lockReason = `${prereq?.name} requis`;
  }
  else if (!canAfford) lockReason = 'Ressources insuffisantes';
  if (!applied && _rs) lockReason = `En recherche · ${_rs.left} restantes`;
  else if (!applied && _busy && lvlOk && prereqOk) lockReason = `Une recherche est en cours : ${SBSkills.researchName()}`;

  return `
    <div class="skill-row ${applied ? 'applied' : ''} ${!buyable && !applied ? 'disabled' : ''}">
      <div class="skill-info">
        <div class="skill-name">${skill.name}</div>
        <div class="skill-desc">${skill.desc}</div>
        <div class="skill-cost">${applied ? '<span style="color:var(--green)">' + lockReason + '</span>' : (lockReason ? '<span style="color:var(--mut)">' + lockReason + '</span>' : '<span style="color:var(--amber)">' + costStr + '</span>')}</div>
        ${!applied && lockReason && !_rs ? sbSkillCostDetail(skill) : ''}
      </div>
      ${buyable
        ? `<button class="skill-buy" onclick="buySkill('${skill.key}')">Apprendre</button>`
        : ''
      }
    </div>
  `;
}

function buySkill(skillKey) {
  if (window.SBSkills && SBSkills.learnCapital) return SBSkills.learnCapital(skillKey);   // PATCH_1910_SKILLS_LONGS
  const skill = CAPITAL_SKILLS.find(s => s.key === skillKey);
  if (!skill) return;
  if (skill.isApplied()) return;
  if (G.skills.capitalLevel < skill.requires.capitalLevel) return;
  if (skill.requires.prereq) {
    const pre = CAPITAL_SKILLS.find(s => s.key === skill.requires.prereq);
    if (!pre || !pre.isApplied()) return;
  }
  for (const [res, q] of Object.entries(skill.cost)) {
    if (!G.res[res] || G.res[res].v < q) {
      toast(`Manque ${q - (G.res[res]?.v || 0)} ${res}`);
      return;
    }
  }
  for (const [res, q] of Object.entries(skill.cost)) G.res[res].v -= q;
  skill.apply();
  toast(`Skill acquis : ${skill.name}`);
  renderCapitalTabContent();
}

function upgradeCapital() {
  const lvl = G.skills.capitalLevel;
  if (lvl >= 3) return;
  const cost = CAPITAL_UPGRADE_COSTS[lvl - 1];
  for (const [res, q] of Object.entries(cost)) {
    if (!G.res[res] || G.res[res].v < q) {
      toast('Ressources insuffisantes');
      return;
    }
  }
  if (QUEUES.capital.upgrade) { toast('Une amélioration est déjà en cours'); return; }
  if (window.SBAftermath && SBAftermath.upgradeBlocked()) { toast('Planète dévastée : lance les secours avant d\'améliorer'); return; }
  const tierData = BUILDING_TIERS.capital[lvl + 1];
  for (const [res, q] of Object.entries(cost)) G.res[res].v -= q;
  QUEUES.capital.upgrade = {
    parcelIdx: capitalParcelIdx(), buildingKey: 'capital', fromTier: lvl, toTier: lvl + 1,
    totalDur: Math.max(1, Math.round(tierData.duration * (window.SBSkills ? SBSkills.durMult('build') : 1))), elapsed: 0,
  };
  toast(`Chantier lancé : ${tierData.name}`);
  if (typeof startQueueTicker === 'function') startQueueTicker();
  try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
  renderCapitalScreen();
}

/* ═══════════ UTILS ═══════════ */

function tileInfo(key) {
  return TILES.find(t => t.key === key) || TILES[0];
}

function totalRate() {
  return Object.keys(G.res).reduce((s, k) => s + effRate(k), 0);
}
// PATCH_1610_SKILLS_DISPLAY — taux réellement produit : base × bonus des skills (c'est ce que simulateTo applique)
function skillMult(res) { return window.SBSkills ? SBSkills.prodMult(res) : 1; }
function effRate(k) { const r = G.res && G.res[k]; return r && r.rate > 0 ? r.rate * skillMult(k) : 0; }
function rateNum(x) { return Math.round(x * 10) / 10; }

// Unités de production (décision 10/10) : toute la production est HORAIRE
// (ressources, crédits, carburant — simulateTo : rate × heures).
function rateUnit(res) { return '/h'; }
function rateLbl(res, rate) { return `+${rateNum(rate * skillMult(res))}${rateUnit(res)}`; }   // PATCH_1610_SKILLS_DISPLAY
// Crédits et carburant ne sont pas des tuiles : tileInfo() renverrait Métal par défaut.
// (fonction et non const : appelée depuis loadGame, déclarée plus bas → pas de TDZ)
function prodInfo(res) {
  if (res === 'credits') return { label:'Crédits', color:'#ffc864' };
  if (res === 'fuel')    return { label:'Carburant', color:'#7aaadc' };
  return tileInfo(res);
}
// Migration 10/10 : les parcelles sauvegardées portent un texte figé « +10/h ».
function refreshParcelProdLabels() {
  const parcels = G.planet && Array.isArray(G.planet.parcels) ? G.planet.parcels : [];
  for (const p of parcels) {
    if (!p || !p.building || !Array.isArray(p.prod)) continue;
    const prod = (BUILDING_TIERS[p.building] && BUILDING_TIERS[p.building][p.lvl || 1] && BUILDING_TIERS[p.building][p.lvl || 1].prod)
      || (BUILDINGS[p.building] && BUILDINGS[p.building].prod);
    if (!prod || !Object.keys(prod).length) continue;
    p.prod = Object.entries(prod).map(([res, rate]) => [prodInfo(res).label.toLowerCase(), rateLbl(res, rate)]);
  }
}

function fmt(n) {
  n = Math.round(n);
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n >= 1000)  return (n / 1000).toFixed(2).replace(/\.?0+$/, '') + 'k';
  return '' + n;
}
function toast(msg, onTap) {
  const el = document.getElementById('toast');
  // Chunk polish 15/05 : utiliser innerHTML au lieu de textContent pour
  // que les icônes SVG inline (via icon('xxx')) soient rendues correctement.
  // Pas de risque XSS : on contrôle tous les appelants (pas de user input).
  el.innerHTML = msg;
  if (!_toastWired) {
    _toastWired = true;
    el.addEventListener('click', () => {
      const f = _toastTap; _toastTap = null;
      el.classList.remove('shown', 'tap'); clearTimeout(toastTimer);
      if (f) { try { f(); } catch (e) { console.warn('[bulle]', e); } }
    });
  }
  let tap = null;
  try { tap = typeof onTap === 'function' ? onTap : _toastRoute(String(msg == null ? '' : msg)); } catch (e) { tap = null; }
  _toastTap = tap;
  el.classList.toggle('tap', !!tap);
  el.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('shown'), tap ? 4500 : 3000);
}
function _toastOpenProspectReport(kind, id) {
  if (typeof openProspectRapports === 'function') openProspectRapports(); else goto('prospect');
  setTimeout(() => {
    if (kind === 'tanker' && id && G._expandedTankerReport !== id && typeof toggleTankerReport === 'function') toggleTankerReport(id);
    if (kind === 'probe' && id && G._expandedProbeReport !== id && typeof toggleProbeReport === 'function') toggleProbeReport(id);
    if (kind === 'beacon' && id && typeof markBeaconReportRead === 'function') markBeaconReportRead(id);
  }, 160);
}
function _toastLatestReport(pred) {
  const r = (G.reports || []).find(x => !pred || pred(x));
  if (r && typeof openReportDetail === 'function') return openReportDetail(r.id);
  if (typeof openReportsList === 'function') openReportsList();
}
function _toastRoute(msg) {
  const t = msg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // refus, erreurs, consignes : rien à ouvrir
  if (/^(Aucun|Aucune|Impossible|Erreur|Pas de |Rien|Il faut|Donne |Maximum|Rappelle d'abord|Touche |Cale vide|Ce n’est pas|Ce n'est pas|Tu as déjà|Registre|Inscription|Choisis|Sélectionne|Ressources insuffisantes|Énergie insuffisante)/i.test(t)) return null;
  if (/introuvable|indisponible|insuffisant|réessaie|hors ligne|déjà engagée|doit être en orbite/i.test(t)) return null;
  const sys = (t.match(/\b([A-Z]-[A-Z]-\d{4})(?!-\d)/) || [])[1] || null;
  const planet = (t.match(/\b([A-Z]-[A-Z]-\d{4}-\d{1,2})\b/) || [])[1] || null;
  // messages d'ambassade (chat)
  if (/^💬/.test(t)) {
    const u = Object.values(typeof _mpChatUnread !== 'undefined' ? _mpChatUnread : {}).find(r => r && r.pseudo && t.includes(r.pseudo));
    if (u && typeof openEmbassy === 'function') { const a = Object.keys(_mpChatUnread).find(k => _mpChatUnread[k] === u); return () => openEmbassy(a); }
    return null;
  }
  // flotte hostile en approche → la flotte (déployer en orbite)
  if (/Flotte hostile|arrive à \d|impact à \d/.test(t)) return () => goto('fleet');
  // marché proposé au dock
  if (/marché au dock|accepté ton marché|Marché (conclu|avec)/.test(t)) return () => goto('commerce');
  // pavillon reçu
  if (/hisse un pavillon/.test(t)) return () => _toastLatestReport(r => r.kind === 'flag');
  // piraterie entre commandants
  if (/^⚔|^⚠ .*intercepté|a échappé à|Convoi \(/.test(t)) return () => _toastLatestReport(r => r.kind === 'piracy');
  // convoi détecté par une balise → fiche d'interception
  if (/^📡/.test(t) && sys) {
    const r = (G.beaconReports || []).slice().reverse().find(x => x.mp && x.systemCoord === sys);
    if (r) return () => markBeaconReportRead(r.id);
  }
  // détection locale d'une balise → rapports de balise
  if (/Détection sur/.test(t)) {
    const r = (G.beaconReports || []).slice().reverse().find(x => x.systemCoord === sys);
    return () => _toastOpenProspectReport('beacon', r && r.id);
  }
  // ambassades (tanker en orbite, cale, poste de route)
  if (/en orbite chez|ambassade ouverte|tanker .* en orbite|la cale de|canal d'ambassade|tient un poste/.test(t)) {
    const who = (G._mpPosts || []).find(o => t.includes(o.pseudo));
    if (who && typeof openEmbassy === 'function') return () => openEmbassy(who.address);
    const m = (G.tankerMissions || []).find(x => x.mpTarget && (t.includes(x.tankerName) || t.includes(x.mpTarget.pseudo)));
    if (m && typeof openEmbassy === 'function') return () => openEmbassy(m.mpTarget.address);
    const w = Object.values(G.knownSystems || {}).flatMap(k => k.planets || []).find(pl => pl.playerName && t.includes(pl.playerName) && pl.coord);
    if (w && typeof openEmbassy === 'function') return () => openEmbassy(w.coord);
  }
  // PATCH_1510_MISSIONS — un tanker encore en mission → sa fiche
  if (window.SBMissions && !/(revenu|rentré|ne reviendra pas|cargo perdu)/.test(t)) {
    const _am = (G.tankerMissions || []).find(x => x.tankerName && t.includes(x.tankerName) && ['in_transit', 'exploring', 'docked', 'returning', 'posted', 'orbital_relay'].includes(x.status));
    if (_am) return () => SBMissions.open(_am.id);
  }
  // retour de tanker → son rapport
  if (/Σ-\d+.*(revenu|rentré|ne reviendra pas|déposé|cargo perdu)/.test(t)) {
    const r = (G.tankerReports || [])[0];
    return () => _toastOpenProspectReport('tanker', r && r.id);
  }
  // flottes : retour, combat, rapport
  if (/rapport disponible|revient|est rentrée|Mission terminée| sur .+$/.test(t) && (G.fleet && (G.fleet.prepared || []).some(f => t.includes(f.name)))) {
    return () => _toastLatestReport(r => r.kind !== 'flag');
  }
  if (/rapport/i.test(t)) return () => _toastLatestReport();
  // un système ou un monde nommé → la carte
  if (planet && typeof openPlanetOnMap === 'function') return () => openPlanetOnMap(planet);
  if (sys && typeof openSystemOnMap === 'function') return () => openSystemOnMap(sys);
  // une flotte nommée → la flotte
  if (G.fleet && (G.fleet.prepared || []).some(f => f.name && t.includes(f.name))) return () => goto('fleet');
  return null;
}  // 'confirm' | 'prompt'

// Affiche un modal de confirmation.
// opts: { title, body, confirmLabel, cancelLabel, variant: 'default'|'danger'|'warning' }
// Retourne une Promise<boolean> (true=confirmé, false=annulé).
function sbConfirm(opts) {
  opts = opts || {};
  return new Promise(resolve => {
    _sbModalType = 'confirm';
    _sbModalResolve = resolve;
    _sbModalOpen({
      title: opts.title || 'Confirmation',
      body: opts.body || 'Es-tu sûr ?',
      confirmLabel: opts.confirmLabel || 'Confirmer',
      cancelLabel: opts.cancelLabel || 'Annuler',
      variant: opts.variant || 'default',
      withInput: false,
    });
  });
}

// Affiche un modal de prompt (champ texte).
// opts: { title, body, placeholder, initialValue, confirmLabel, cancelLabel, maxLength }
// Retourne une Promise<string|null> (null=annulé, sinon texte saisi trimmé).
function sbPrompt(opts) {
  opts = opts || {};
  return new Promise(resolve => {
    _sbModalType = 'prompt';
    _sbModalResolve = resolve;
    _sbModalOpen({
      title: opts.title || 'Saisie',
      body: opts.body || '',
      confirmLabel: opts.confirmLabel || 'Valider',
      cancelLabel: opts.cancelLabel || 'Annuler',
      variant: opts.variant || 'default',
      withInput: true,
      placeholder: opts.placeholder || '',
      initialValue: opts.initialValue || '',
      maxLength: opts.maxLength || 100,
    });
  });
}

function _sbModalOpen(cfg) {
  const overlay = document.getElementById('sb-modal-overlay');
  const titleEl = document.getElementById('sb-modal-title');
  const bodyEl = document.getElementById('sb-modal-body');
  const inputWrap = document.getElementById('sb-modal-input-wrap');
  const inputEl = document.getElementById('sb-modal-input');
  const cancelBtn = document.getElementById('sb-modal-cancel');
  const confirmBtn = document.getElementById('sb-modal-confirm');

  titleEl.textContent = cfg.title;
  titleEl.className = 'sb-modal-title' + (cfg.variant && cfg.variant !== 'default' ? ' ' + cfg.variant : '');
  // Body en HTML pour pouvoir mettre du <strong> / <em>
  bodyEl.innerHTML = cfg.body;
  cancelBtn.textContent = cfg.cancelLabel;
  confirmBtn.textContent = cfg.confirmLabel;
  confirmBtn.className = 'sb-modal-btn sb-modal-btn-confirm' + (cfg.variant && cfg.variant !== 'default' ? ' ' + cfg.variant : '');

  if (cfg.withInput) {
    inputWrap.style.display = '';
    inputEl.value = cfg.initialValue;
    inputEl.placeholder = cfg.placeholder;
    inputEl.maxLength = cfg.maxLength;
    // Auto-focus + select all après l'animation pop
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 220);
    // Enter = confirm
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sbModalConfirm();
      } else if (e.key === 'Escape') {
        sbModalResolve(null);
      }
    };
  } else {
    inputWrap.style.display = 'none';
  }

  overlay.classList.remove('hidden');
}

// Appelé par le bouton Confirmer
function sbModalConfirm() {
  if (_sbModalType === 'prompt') {
    const inputEl = document.getElementById('sb-modal-input');
    const val = (inputEl.value || '').trim();
    sbModalResolve(val);
  } else {
    sbModalResolve(true);
  }
}

// Ferme le modal et résout la promise avec la valeur donnée
function sbModalResolve(value) {
  const overlay = document.getElementById('sb-modal-overlay');
  overlay.classList.add('hidden');
  const resolver = _sbModalResolve;
  const wasType = _sbModalType;
  _sbModalResolve = null;
  _sbModalType = null;
  if (!resolver) return;
  // Si user annule (value=null) :
  //   - confirm → résout avec false
  //   - prompt  → résout avec null
  if (value === null) {
    resolver(wasType === 'confirm' ? false : null);
  } else {
    resolver(value);
  }
}

// Click sur le backdrop (en dehors du modal) = annuler
function sbModalBackdropClick(e) {
  if (e.target.id === 'sb-modal-overlay') {
    sbModalResolve(null);
  }
}

// Helpers raccourcis pour les cas courants
function sbConfirmDanger(title, body, confirmLabel) {
  return sbConfirm({
    title,
    body,
    variant: 'danger',
    confirmLabel: confirmLabel || 'Supprimer',
  });
}

function sbConfirmWarning(title, body, confirmLabel) {
  return sbConfirm({
    title,
    body,
    variant: 'warning',
    confirmLabel: confirmLabel || 'Continuer',
  });
}

/* ═══════════ WELCOME SCREEN (V0.5 Option B) ═══════════
 * Premier écran au lancement si le joueur n'a pas encore d'identité.
 * Demande nom de capitaine + nom de planète, stocké en local.
 * Une fois validé : G.profile.captainName est set, l'écran ne s'affiche plus.
 */

// Retourne true si le joueur a déjà créé son profil
function hasPlayerProfile() {
  return !!(G.profile && G.profile.captainName);
}

// Validation du formulaire welcome
function confirmWelcome() {
  const captainInput = document.getElementById('welcome-captain');
  const planetInput = document.getElementById('welcome-planet');
  const captainName = (captainInput?.value || '').trim();
  let planetName = (planetInput?.value || '').trim().toUpperCase();

  // Validations
  if (!captainName) {
    if (typeof toast === 'function') toast('Un nom de capitaine est requis');
    captainInput?.focus();
    return;
  }
  if (captainName.length < 2) {
    if (typeof toast === 'function') toast('Nom de capitaine trop court (2 caractères min)');
    captainInput?.focus();
    return;
  }
  if (!planetName) planetName = 'KERATH-VII';
  if (planetName.length < 2) {
    if (typeof toast === 'function') toast('Nom de planète trop court');
    planetInput?.focus();
    return;
  }

  // Enregistrement
  G.profile = G.profile || {};
  G.profile.captainName = captainName;
  G.profile.createdAt = Date.now();
  G.planet.name = planetName;

  // Sauvegarder immédiatement
  if (typeof saveGame === 'function') saveGame();

  // Refresh tous les éléments qui pourraient afficher l'ancien nom
  if (typeof renderDashboard === 'function') renderDashboard();

  // UIUX V2 — on arrive directement sur la planète
  unmountWelcomeHero();
  goto('planet');

  if (typeof toast === 'function') {
    toast(`Bienvenue, ${captainName}. ${planetName} t'attend.`);
  }
}
function mountWelcomeHero() {
  const host = document.getElementById('welcome-hero');
  if (!host || _welcomeHero) return;
  if (!window.Formation3D || !window.SB3D) { setTimeout(mountWelcomeHero, 200); return; }
  const fleet = { id: 'welcome', status: 'in_mission', composition: { cuirasse: { t1: 2, t2: 0, t3: 0 }, fregate: { t1: 6, t2: 0, t3: 0 }, tanker: { t1: 3, t2: 0, t3: 0 } } };
  _welcomeHero = window.Formation3D.mount(host, { fleet, mode: 'mission', az: 0, el: 0.16, zoom: 0.78, spin: 0, shiftY: 0.13, lite: true });
}
function unmountWelcomeHero() {
  if (_welcomeHero) { try { _welcomeHero.dispose(); } catch (e) {} _welcomeHero = null; }
}

// Setup au focus de l'écran : préfocus l'input capitaine
function setupWelcomeScreen() {
  mountWelcomeHero();
  const captainInput = document.getElementById('welcome-captain');
  if (captainInput && !captainInput.value) {
    setTimeout(() => captainInput.focus(), 100);
  }
  // Submit au Enter
  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmWelcome();
    }
  };
  captainInput?.addEventListener('keydown', handleEnter);
  document.getElementById('welcome-planet')?.addEventListener('keydown', handleEnter);
}

/* ═══════════ CHEAT PANEL (dev only) ═══════════ */

function toggleCheatPanel() {
  document.getElementById('cheat-panel').classList.toggle('open');
}
function _sbDevAllowed() {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return true;
  try { const p = window.SBMP && SBMP.world && SBMP.world.pseudo; if (p && SB_DEV_PSEUDOS.includes(String(p).toLowerCase())) return true; } catch (e) {}
  return _sbDevEmailOk;
}
function _isDevMode() {
  try {
    return localStorage.getItem(SECRET_TAP_KEY) === 'true' && _sbDevAllowed();
  } catch (e) {
    return false;
  }
}

function _setDevMode(enabled) {
  try {
    if (enabled) localStorage.setItem(SECRET_TAP_KEY, 'true');
    else localStorage.removeItem(SECRET_TAP_KEY);
  } catch (e) {}
  _applyDevModeUI();
}

function _applyDevModeUI() {
  const toggle = document.getElementById('cheat-toggle');
  if (!toggle) return;
  const isDev = _isDevMode();
  toggle.style.display = isDev ? '' : 'none';
  // Si on désactive le dev mode, on ferme aussi le panneau (s'il était ouvert)
  if (!isDev) {
    const panel = document.getElementById('cheat-panel');
    if (panel) panel.classList.remove('open');
  }
}

// Appelée par le onclick du nom de planète
function _secretTap() {
  if (!_sbDevAllowed()) return;   // PATCH_2210_CHEATS
  const now = Date.now();
  // Garder seulement les taps dans la fenêtre récente
  _secretTapTimestamps = _secretTapTimestamps.filter(t => (now - t) < SECRET_TAP_WINDOW_MS);
  _secretTapTimestamps.push(now);

  if (_secretTapTimestamps.length >= SECRET_TAP_COUNT_NEEDED) {
    _secretTapTimestamps = [];
    const wasDevMode = _isDevMode();
    _setDevMode(!wasDevMode);
    if (typeof toast === 'function') {
      toast(wasDevMode ? '🔒 Mode dev désactivé' : '🔓 Mode dev activé');
    }
  }
}

// Au démarrage : appliquer l'état du mode dev (cacher/afficher le bouton)
// Appelé en fin de boot, après que le DOM est prêt.
function initDevMode() {
  _applyDevModeUI();
  // ⚡ DIAGNOSTIC LAG — Panneau diag visible si mode dev activé
  if (_isDevMode()) _initDiagPanel();
}

// ⚡ DIAGNOSTIC LAG — Panneau de monitoring temps réel
// Affiche FPS, mémoire, dernière erreur JS. Visible uniquement en mode dev.
function _initDiagPanel() {
  if (document.getElementById('diag-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'diag-panel';
  panel.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 99999;
    background: rgba(0,0,0,.85); border: 1px solid #ffc864;
    padding: 6px 10px; border-radius: 4px;
    font-family: 'SF Mono', monospace; font-size: 10px;
    color: #ffc864; line-height: 1.4; pointer-events: none;
    min-width: 130px; backdrop-filter: blur(4px);
  `;
  panel.innerHTML = `
    <div id="diag-fps">FPS: --</div>
    <div id="diag-mem" style="color:#999">Mem: --</div>
    <div id="diag-err" style="color:#ff5040;font-size:9px;margin-top:3px;display:none"></div>
  `;
  document.body.appendChild(panel);

  // Capture erreurs JS
  window.addEventListener('error', (e) => {
    const errEl = document.getElementById('diag-err');
    if (errEl) {
      errEl.textContent = e.message.slice(0, 60);
      errEl.style.display = '';
    }
  });

  // FPS monitor léger
  let frames = 0, lastTime = performance.now();
  function fpsTick(now) {
    frames++;
    if (now - lastTime >= 500) {
      const fps = Math.round(frames * 1000 / (now - lastTime));
      const fpsEl = document.getElementById('diag-fps');
      if (fpsEl) {
        const color = fps < 30 ? '#ff5040' : fps < 50 ? '#ffaf3a' : '#5fffa8';
        fpsEl.innerHTML = `<span style="color:${color}">FPS: ${fps}</span>`;
      }
      const memEl = document.getElementById('diag-mem');
      if (memEl && performance.memory) {
        const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(0);
        memEl.textContent = `Mem: ${used}MB`;
      }
      frames = 0;
      lastTime = now;
    }
    requestAnimationFrame(fpsTick);
  }
  requestAnimationFrame(fpsTick);
}

/* ═══════════════════════════════════════════════════════════════
   COMMERCE — Phase 1 Routes Secrètes (16/05/2026)
   ═══════════════════════════════════════════════════════════════
   Hub global accessible depuis le Dashboard ET depuis chaque Comptoir construit.
   - Comptoir : bâtiment local sur parcelle (kind:'screen', screen:'commerce')
   - Hub Commerce : agrège routes, cartes, marché — état galactique du commerce
   3 onglets : Routes / Cartes / Marché.
   Voir starbyte_routes_secretes.md pour la vision complète.
   ═══════════════════════════════════════════════════════════════ */

// Calcule le taux total de production de CG/h (somme des Comptoirs construits par tier)
function getCommerceCreditsRate() {
  if (!G.planet?.parcels) return 0;
  let rate = 0;
  for (const parcel of (typeof sbAllParcels === 'function' ? sbAllParcels() : G.planet.parcels)) {
    if (parcel?.building === 'comptoir' && parcel.state === 'built') {
      const tier = parcel.lvl || 1;
      const tierData = BUILDING_TIERS.comptoir?.[tier];
      if (tierData?.prod?.credits) rate += tierData.prod.credits * (parcel.damaged ? 0.5 : 1);
    }
  }
  return rate * (window.SBSkills ? SBSkills.prodMult('credits') : 1);   // PATCH_1610_SKILLS
}

// Compte les comptoirs construits (toutes parcelles confondues)
function countComptoirs() {
  if (!G.planet?.parcels) return 0;
  return (typeof sbAllParcels === 'function' ? sbAllParcels() : G.planet.parcels).filter(p => p?.building === 'comptoir' && p.state === 'built').length;
}

// Tick de production passive CG — appelé toutes les 10s par la passive loop
// (cf. startPassiveLoop). Tick = 10s = 1/360 heure.
function tickCommerceProduction() {
  const ratePerHour = getCommerceCreditsRate();
  if (ratePerHour <= 0) return;
  // Conversion : rate/h × (10s / 3600s/h) = rate / 360
  // Mais on garde des CG entiers — on accumule des décimales dans G._creditsBuffer
  if (!G._creditsBuffer) G._creditsBuffer = 0;
  G._creditsBuffer += ratePerHour / 360;
  if (G._creditsBuffer >= 1) {
    const whole = Math.floor(G._creditsBuffer);
    G.credits = (G.credits || 0) + whole;
    G._creditsBuffer -= whole;
  }
}

// ─── Carburant (18/05) — production passive depuis les Raffineries ───
// Cf. demande Adrien : raffinerie pour autosuffisance + marché pour dépanner.
// Plafond : déterminé par le tier max d'une raffinerie construite (ou 1000 si aucune).
function getFuelProductionRate() {
  if (!G.planet?.parcels) return 0;
  let rate = 0;
  for (const parcel of (typeof sbAllParcels === 'function' ? sbAllParcels() : G.planet.parcels)) {
    if (parcel?.building === 'raffinerie' && parcel.state === 'built') {
      // Note : le tier d'un bâtiment est stocké dans parcel.lvl (pas parcel.tier)
      const tier = parcel.lvl || parcel.tier || 1;
      const tierData = BUILDING_TIERS.raffinerie?.[tier];
      if (tierData?.prod?.fuel) rate += tierData.prod.fuel * (parcel.damaged ? 0.5 : 1);
    }
  }
  return rate * (window.SBSkills ? SBSkills.prodMult('fuel') : 1);   // PATCH_1610_SKILLS
}

// Plafond carburant : la raffinerie la plus avancée définit le cap.
// Sans raffinerie : cap par défaut 1000 (à peine de quoi faire 1-2 missions).
// T1 = 2000, T2 = 5000, T3 = 20000.
function getFuelCap() {
  if (!G.planet?.parcels) return 1000;
  let maxCap = 1000;
  for (const parcel of (typeof sbAllParcels === 'function' ? sbAllParcels() : G.planet.parcels)) {
    if (parcel?.building === 'raffinerie' && parcel.state === 'built') {
      const tier = parcel.lvl || parcel.tier || 1;
      const tierData = BUILDING_TIERS.raffinerie?.[tier];
      if (tierData?.fuelCap && tierData.fuelCap > maxCap) maxCap = tierData.fuelCap;
    }
  }
  // 31/10 — les silos à carburant (de toutes mes planètes) s'ajoutent à la réserve
  let silos = 0;
  for (const parcel of (typeof sbAllParcels === 'function' ? sbAllParcels() : G.planet.parcels)) {
    if (parcel?.building === 'silo_fuel' && parcel.state === 'built') silos += (BUILDING_TIERS.silo_fuel[parcel.lvl || 1] || {}).siloCap || 3000;
  }
  return maxCap + silos;
}

// Tick de production carburant — appelé toutes les 10s par la passive loop
function tickFuelProduction() {
  const ratePerHour = getFuelProductionRate();
  if (ratePerHour <= 0) return;
  if (!G._fuelBuffer) G._fuelBuffer = 0;
  G._fuelBuffer += ratePerHour / 360;
  if (G._fuelBuffer >= 1) {
    const whole = Math.floor(G._fuelBuffer);
    const cap = getFuelCap();
    const before = G.fuel || 0;
    G.fuel = Math.min(cap, before + whole);
    G._fuelBuffer -= whole;
    // Si silo plein : notifier une fois (transition)
    if (G.fuel >= cap && before < cap) {
      if (typeof toast === 'function') toast('⛽ Silos de carburant pleins — production stoppée');
    }
  }
}

function rollRouteCardKind() {
  const total = Object.values(ROUTE_CARD_KINDS).reduce((s, k) => s + k.weight, 0);
  let r = Math.random() * total;
  for (const [key, cfg] of Object.entries(ROUTE_CARD_KINDS)) {
    r -= cfg.weight;
    if (r <= 0) return key;
  }
  return 'clean';
}

function randomHint() {
  const pre = HINT_PREFIXES[Math.floor(Math.random() * HINT_PREFIXES.length)];
  const body = HINT_BODIES[Math.floor(Math.random() * HINT_BODIES.length)];
  return `${pre} ${body}`;
}

// Génère une carte de route. Optionnellement on peut forcer le kind (cheat / encounter spécifique).
function generateRouteCard(opts = {}) {
  const kind = opts.kind || rollRouteCardKind();
  const cfg = ROUTE_CARD_KINDS[kind] || ROUTE_CARD_KINDS.clean;
  const quality = Math.floor(cfg.qMin + Math.random() * (cfg.qMax - cfg.qMin));
  const id = 'card-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  // Origine et destination distinctes — choix simple pour Chunk B
  let origin = randomHint();
  let dest = randomHint();
  while (dest === origin) dest = randomHint();
  return {
    id,
    name: opts.name || `Route ${kind === 'singing' ? 'chantante' : 'inconnue'}`,
    kind,
    quality,
    originHint: origin,
    destinationHint: dest,
    foundAt: Date.now(),
    source: opts.source || 'Inconnu',
  };
}

// Ajoute une carte à G.routeCards (avec dédup d'id)
function addRouteCard(card) {
  if (!G.routeCards) G.routeCards = [];
  if (G.routeCards.find(c => c.id === card.id)) return false;
  G.routeCards.push(card);
  return true;
}

// PUBLIC : tire au sort une nouvelle saison selon les poids
function rollMarketSeason() {
  const total = Object.values(MARKET_SEASONS).reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of Object.values(MARKET_SEASONS)) {
    r -= m.weight;
    if (r <= 0) return m.key;
  }
  return 'normale';
}

// PUBLIC : initialise une saison de marché (au boot ou après expiration)
function initMarketSeason(forcedKey) {
  const key = forcedKey || rollMarketSeason();
  const now = Date.now();
  G.marketSeason = {
    key,
    startedAt: now,
    endsAt: now + MARKET_SEASON_DURATION_MS,
  };
  return G.marketSeason;
}

// PUBLIC : retourne la saison active (initialise si absente ou expirée)
function getCurrentMarketSeason() {
  if (!G.marketSeason || (G.marketSeason.endsAt || 0) < Date.now()) {
    const previous = G.marketSeason?.key;
    initMarketSeason();
    if (previous && previous !== G.marketSeason.key) {
      // Notification au joueur du changement
      const newSeason = MARKET_SEASONS[G.marketSeason.key];
      if (typeof toast === 'function' && newSeason) {
        toast(`📊 Nouveau cycle marché : ${newSeason.label}`);
      }
    }
  }
  return G.marketSeason;
}

// PUBLIC : calcule le prix d'achat (CG → ressource) pour 1 unité
function getMarketBuyPrice(resKey) {
  const base = MARKET_BASE_PRICES[resKey];
  if (!base) return 0;
  const season = getCurrentMarketSeason();
  const cfg = MARKET_SEASONS[season.key] || MARKET_SEASONS.normale;
  return Math.max(1, Math.round(base.buy * cfg.buyMult));
}

// PUBLIC : calcule le prix de vente (ressource → CG) pour 1 unité
function getMarketSellPrice(resKey) {
  const base = MARKET_BASE_PRICES[resKey];
  if (!base) return 0;
  const season = getCurrentMarketSeason();
  const cfg = MARKET_SEASONS[season.key] || MARKET_SEASONS.normale;
  let price = base.sell * cfg.sellMult;
  // Bonus saison contrebande sur cristal
  if (cfg.cristalSellBonus && resKey === 'cristal') {
    price *= cfg.cristalSellBonus;
  }
  return Math.max(1, Math.round(price));
}

// PUBLIC : exécute une vente (ressource → CG)
function marketSell(resKey, qty) {
  if (!resKey || !qty || qty <= 0) return { ok: false, reason: 'invalid' };
  // Cas spécial : carburant (stocké dans G.fuel, pas dans G.res)
  if (resKey === 'fuel') {
    const have = G.fuel || 0;
    if (have < qty) return { ok: false, reason: 'insufficient', have };
    const price = getMarketSellPrice('fuel');
    const total = price * qty;
    G.fuel -= qty;
    G.credits = (G.credits || 0) + total;
    return { ok: true, qty, price, total, resKey };
  }
  if (!G.res || !G.res[resKey]) return { ok: false, reason: 'no_resource' };
  const have = G.res[resKey].v || 0;
  if (have < qty) return { ok: false, reason: 'insufficient', have };
  const price = getMarketSellPrice(resKey);
  const total = price * qty;
  G.res[resKey].v -= qty;
  G.credits = (G.credits || 0) + total;
  return { ok: true, qty, price, total, resKey };
}

// PUBLIC : exécute un achat (CG → ressource)
function marketBuy(resKey, qty) {
  if (!resKey || !qty || qty <= 0) return { ok: false, reason: 'invalid' };
  const price = getMarketBuyPrice(resKey);
  const total = price * qty;
  if ((G.credits || 0) < total) return { ok: false, reason: 'insufficient_credits', total };
  // Cas spécial : carburant
  if (resKey === 'fuel') {
    const cap = (typeof getFuelCap === 'function') ? getFuelCap() : 1000;
    const have = G.fuel || 0;
    if (have + qty > cap) return { ok: false, reason: 'cap_exceeded', cap, have };
    G.credits -= total;
    G.fuel = have + qty;
    return { ok: true, qty, price, total, resKey };
  }
  if (!G.res || !G.res[resKey]) return { ok: false, reason: 'no_resource' };
  // Check capacité (ne pas dépasser max)
  const cap = G.res[resKey].max || Infinity;
  const have = G.res[resKey].v || 0;
  if (have + qty > cap) return { ok: false, reason: 'cap_exceeded', cap, have };
  G.credits -= total;
  G.res[resKey].v = have + qty;
  return { ok: true, qty, price, total, resKey };
}

function rollMoodForCardKind(kind) {
  const dist = MOOD_PROBABILITIES_BY_CARD_KIND[kind] || MOOD_PROBABILITIES_BY_CARD_KIND.clean;
  const total = Object.values(dist).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [moodKey, weight] of Object.entries(dist)) {
    r -= weight;
    if (r <= 0) return moodKey;
  }
  return 'nerveuse';
}

// Active une carte : la retire de G.routeCards et crée une route active dans G.routes.
// Phase 1 Chunk C : niveau de connaissance 0, stabilité initiale selon humeur,
// passages 0, lost 0. La carte est consommée.
function activateRouteCard(cardId) {
  if (!G.routeCards) return null;
  const idx = G.routeCards.findIndex(c => c.id === cardId);
  if (idx === -1) return null;
  const card = G.routeCards[idx];

  // PATCH_1410_PISTES — une carte ne crée plus une route d'un coup : elle met sur une piste (une ligne PNJ),
  // plus ou moins près du lieu caché selon sa qualité. Il reste à remonter le reste avec des balises.
  if (window.SBLines && typeof SBLines.activateCard === 'function') {
    const res = SBLines.activateCard(card);
    if (res) {
      G.routeCards.splice(idx, 1);
      if (res.fake) {
        toast(`✗ « ${card.name} » : des coordonnées qui mènent nulle part. Carte perdue.`);
      } else {
        const where = { clean: 'à un tronçon du lieu', holed: 'sur la ligne, mais il manque des morceaux', dead: 'au tout début d\'une ligne', singing: 'droit sur le lieu' }[res.kind] || 'sur une ligne';
        toast(`🗺 « ${card.name} » : une piste ${where} · ${res.sys} · pose une balise pour la suivre`, () => openSystemOnMap(res.sys));
        setTimeout(() => { try { openSystemOnMap(res.sys); } catch (e) {} }, 450);
      }
      if (typeof saveGame === 'function') saveGame();
      if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
      return null;
    }
  }

  // Les cartes "fake" (qualité quasi-nulle) ont 70% de chance d'être réellement bidon :
  // dans ce cas, on consomme la carte mais on ne crée PAS de route.
  // (Le joueur découvre que Torek lui a vendu du vent.)
  if (card.kind === 'fake' && Math.random() < 0.70) {
    G.routeCards.splice(idx, 1);
    if (typeof toast === 'function') {
      toast(`✗ "${card.name}" — coordonnées qui mènent nulle part. Carte perdue.`);
    }
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return null;
  }

  // Tirer l'humeur
  const moodKey = rollMoodForCardKind(card.kind);
  const mood = ROUTE_MOODS[moodKey];
  const [stMin, stMax] = mood.stabilityRange;
  const stability = Math.floor(stMin + Math.random() * (stMax - stMin));

  // Nom évocateur. Pour Phase 1 on garde simple : "Route + humeur + numéro"
  // Plus tard (Chunk C polish ou Chunk D), permettre au joueur de la renommer.
  const routeCount = (G.routes || []).length + 1;
  const moodNoun = {
    nerveuse: 'la Veine',
    grasse: 'la Saigne',
    morte: 'le Linceul',
    noire: 'la Voie Noire',
    imperiale: 'la Vieille Voie',
  }[moodKey] || 'la Route';
  const routeName = `${moodNoun} #${routeCount}`;

  // ─── Récupérer le dock depuis le registre univers (Chunk D fix 18/05 — univers fixe) ───
  // Vérifier AVANT lookup si le joueur connaît déjà ce dock par une autre route.
  // (sert au toast de reconnaissance narrative)
  const destHint = card.destinationHint;
  const tentativeId = 'dock-' + _hashStringDeterministic(destHint || 'unknown').toString(36);
  const alreadyKnownDock = (G.universeDocks || {})[tentativeId] || null;
  // Récupérer (ou créer) le dock. Toutes les routes vers cette destination utilisent ce dock.
  const dock = getOrCreateDockForDestination(destHint);

  const route = {
    id: 'rt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name: routeName,
    moodKey,
    originHint: card.originHint,
    destinationHint: card.destinationHint,
    quality: card.quality,
    stability,
    knowledgeLevel: 0,        // 0 → 10 (gagne avec les passages réussis, cf. Chunk D)
    passages: 0,              // passages réussis
    lost: 0,                  // convois perdus
    delayed: 0,               // convois retardés
    discoveredAt: Date.now(),
    lastUsedAt: null,
    status: 'active',         // 'active' | 'fading' | 'collapsed'
    // Référence stable vers le dock du registre univers
    dockId: dock.id,
    // Copie du dock pour usage rapide (lecture seule, ne pas modifier — pour modifier passer par G.universeDocks[dockId])
    dock: dock,
    sourceCard: {
      kind: card.kind,
      source: card.source,
      name: card.name,
    },
  };

  // Retirer la carte, ajouter la route
  G.routeCards.splice(idx, 1);
  if (!Array.isArray(G.routes)) G.routes = [];
  G.routes.push(route);

  if (typeof toast === 'function') {
    toast(`✓ Route activée — ${routeName} · ${mood.label}`);
  }

  // ─── Reconnaissance narrative (Chunk D fix 18/05) ───
  // Si le joueur avait déjà visité ce dock via une autre route, on le signale.
  // Sensation d'univers vivant : "tu reconnais ce port".
  if (alreadyKnownDock) {
    // Trouver les autres routes existantes qui mènent à ce dock
    const otherRoutes = (G.routes || []).filter(r => r.id !== route.id && r.dockId === dock.id);
    if (otherRoutes.length > 0) {
      const viaRoute = otherRoutes[0].name;
      // Toast spécial après court délai pour qu'il apparaisse après le toast de validation
      setTimeout(() => {
        if (typeof toast === 'function') {
          toast(`⚓ Cette route mène à ${dock.name} — déjà connu via ${viaRoute}`);
        }
      }, 1400);
    }
  }

  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return route;
} // { type: 'card'|'route', id }

function openCommerceSheet(type, id) {
  _commerceSheetContext = { type, id };
  if (type === 'card') renderCommerceCardSheet(id);
  else if (type === 'route') renderCommerceRouteSheet(id);
  const overlay = document.getElementById('commerce-sheet-overlay');
  if (overlay) overlay.classList.add('shown');
}

function closeCommerceSheet(event) {
  // Si event venant du backdrop, vérifier qu'on n'a pas cliqué dans la sheet
  if (event && event.target && event.target.closest && event.target.closest('.commerce-sheet')) return;
  const overlay = document.getElementById('commerce-sheet-overlay');
  if (overlay) overlay.classList.remove('shown');
  _commerceSheetContext = null;
}

// Re-render du sheet courant après une action (activation, suppression...)
function refreshCommerceSheet() {
  if (!_commerceSheetContext) return;
  const { type, id } = _commerceSheetContext;
  if (type === 'card') renderCommerceCardSheet(id);
  else if (type === 'route') renderCommerceRouteSheet(id);
}

// ─── Rendu sheet pour une CARTE non activée ───
function renderCommerceCardSheet(cardId) {
  const card = (G.routeCards || []).find(c => c.id === cardId);
  if (!card) {
    closeCommerceSheet();
    return;
  }
  const kindCfg = ROUTE_CARD_KINDS[card.kind] || ROUTE_CARD_KINDS.clean;
  const qualityBar = Math.max(0, Math.min(100, card.quality || 0));
  const elapsedH = Math.floor((Date.now() - (card.foundAt || Date.now())) / 3600000);
  const elapsedLabel = elapsedH < 1 ? 'à l\'instant'
    : elapsedH < 24 ? `il y a ${elapsedH}h`
    : `il y a ${Math.floor(elapsedH / 24)}j`;

  // Probabilité d'humeur estimée selon le type de carte (transparence pour le joueur)
  const dist = MOOD_PROBABILITIES_BY_CARD_KIND[card.kind] || {};
  const moodHints = Object.entries(dist)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, w]) => `<span style="color:${ROUTE_MOODS[k]?.accent || 'var(--mut)'}">${ROUTE_MOODS[k]?.label || k}</span> <span style="color:var(--mut)">~${w}%</span>`)
    .join(' · ');

  // Avertissement spécifique cartes fausses
  let fakeWarning = '';
  if (card.kind === 'fake') {
    fakeWarning = `
      <div style="margin:12px 0;padding:10px 12px;background:rgba(232,122,122,.08);border:1px solid rgba(232,122,122,.30);border-radius:6px;font-size:11px;color:#e87a7a;line-height:1.5">
        <strong>Coordonnées suspectes.</strong> 70% de chance que cette carte mène nulle part. Si tu l'actives et qu'elle est vraie, ça peut être une route morte ou noire — donc rare, mais hostile.
      </div>
    `;
  }

  document.getElementById('commerce-sheet-title').textContent = card.name;
  document.getElementById('commerce-sheet-subtitle').textContent = `Carte de route · ${kindCfg.label}`;

  document.getElementById('commerce-sheet-body').innerHTML = `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(255,200,100,.05);border:1px solid rgba(255,200,100,.20);border-radius:8px">
      <div style="font-size:11px;color:var(--text);line-height:1.6;margin-bottom:10px">
        <span style="color:var(--mut)">De :</span> ${card.originHint}<br>
        <span style="color:var(--mut)">Vers :</span> ${card.destinationHint}
      </div>
      <div class="commerce-stat-row">
        <span class="lbl">Qualité</span>
        <span class="val" style="color:#ffc864">${qualityBar} / 100</span>
      </div>
      <div class="commerce-bar-wrap">
        <div class="commerce-bar-fill" style="width:${qualityBar}%;background:#ffc864"></div>
      </div>
    </div>

    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Provenance</div>
      <div style="font-size:12px;color:var(--text);font-style:italic;line-height:1.6">${kindCfg.desc}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--mut)">
        Source : <span style="color:var(--text)">${card.source}</span> · ${elapsedLabel}
      </div>
    </div>

    ${fakeWarning}

    <div style="margin-bottom:14px;padding-top:10px;border-top:1px solid var(--border-soft)">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Humeurs probables si activée</div>
      <div style="font-size:11px;line-height:1.7">${moodHints || '<span style="color:var(--mut)">Inconnu</span>'}</div>
      <div style="margin-top:8px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">
        Une fois activée, la route prend une personnalité qui détermine son comportement, son butin, ses risques. L'humeur peut évoluer avec le temps.
      </div>
    </div>
  `;

  document.getElementById('commerce-sheet-actions').innerHTML = `
    <button class="commerce-sheet-btn commerce-sheet-btn-primary" onclick="onActivateCardClick('${card.id}')">
      Activer cette route
    </button>
    <button class="commerce-sheet-btn commerce-sheet-btn-danger" onclick="onDiscardCardClick('${card.id}')">
      Jeter la carte
    </button>
    <button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="closeCommerceSheet()">
      Garder pour plus tard
    </button>
  `;
}

// ─── Rendu sheet pour une ROUTE activée ───
function renderCommerceRouteSheet(routeId) {
  const route = (G.routes || []).find(r => r.id === routeId);
  if (!route) {
    closeCommerceSheet();
    return;
  }
  const mood = ROUTE_MOODS[route.moodKey] || ROUTE_MOODS.nerveuse;
  const stability = Math.max(0, Math.min(100, route.stability || 0));
  const knowledge = Math.max(0, Math.min(10, route.knowledgeLevel || 0));
  const elapsedH = Math.floor((Date.now() - (route.discoveredAt || Date.now())) / 3600000);
  const discoveredLabel = elapsedH < 1 ? 'à l\'instant'
    : elapsedH < 24 ? `il y a ${elapsedH}h`
    : `il y a ${Math.floor(elapsedH / 24)}j`;
  const lastUsedLabel = route.lastUsedAt
    ? (() => {
        const h = Math.floor((Date.now() - route.lastUsedAt) / 3600000);
        return h < 1 ? 'à l\'instant' : h < 24 ? `il y a ${h}h` : `il y a ${Math.floor(h / 24)}j`;
      })()
    : 'jamais utilisée';

  // Stabilité visuelle avec gradient santé
  const stabColor = stability >= 70 ? '#8bc24a' : stability >= 40 ? '#ffc864' : '#e87a7a';
  const knowledgeBar = (knowledge / 10) * 100;
  const knowledgeLabel = knowledge === 0 ? 'Inconnue (premier passage hasardeux)'
    : knowledge <= 3 ? 'Confirmée'
    : knowledge <= 6 ? 'Maîtrisée'
    : knowledge <= 9 ? 'Experte'
    : 'Légendaire';

  document.getElementById('commerce-sheet-title').textContent = route.name;
  document.getElementById('commerce-sheet-subtitle').innerHTML = `<span style="color:${mood.accent}">${mood.label}</span>`;

  document.getElementById('commerce-sheet-body').innerHTML = `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(${hexToRgb(mood.accent)},.06);border:1px solid rgba(${hexToRgb(mood.accent)},.25);border-radius:8px">
      <div style="font-size:11px;color:var(--text);line-height:1.6;margin-bottom:10px">
        <span style="color:var(--mut)">De :</span> ${route.originHint}<br>
        <span style="color:var(--mut)">Vers :</span> ${route.destinationHint}
      </div>
      ${route.dock ? `
        <div style="margin:10px 0;padding:8px 10px;background:rgba(${hexToRgb(route.dock.accent || '#ffc864')},.10);border-left:2px solid ${route.dock.accent || '#ffc864'};border-radius:3px">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px">⚓ Point d'arrivée</div>
          <div style="font-size:12px;color:${route.dock.accent || '#ffc864'};font-weight:500">${route.dock.name}</div>
          <div style="font-size:10px;color:var(--mut);margin-top:2px">${route.dock.typeLabel}</div>
        </div>
      ` : ''}
      <div style="font-size:11px;color:var(--text);font-style:italic;line-height:1.6;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)">${mood.bio}</div>
    </div>

    <!-- Stabilité -->
    <div style="margin-bottom:14px">
      <div class="commerce-stat-row">
        <span class="lbl">Stabilité</span>
        <span class="val" style="color:${stabColor}">${stability}%</span>
      </div>
      <div class="commerce-bar-wrap">
        <div class="commerce-bar-fill" style="width:${stability}%;background:${stabColor}"></div>
      </div>
      <div style="margin-top:6px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">
        ${stability >= 70 ? 'Route solide. Les passages se déroulent bien.'
          : stability >= 40 ? 'Route fragile. Chaque passage compte.'
          : 'Route au bord de l\'effondrement. Risque élevé de perte.'}
      </div>
    </div>

    <!-- Niveau de connaissance -->
    <div style="margin-bottom:14px">
      <div class="commerce-stat-row">
        <span class="lbl">Connaissance</span>
        <span class="val" style="color:#5fa8e8">${knowledge} / 10 · ${knowledgeLabel}</span>
      </div>
      <div class="commerce-bar-wrap">
        <div class="commerce-bar-fill" style="width:${knowledgeBar}%;background:#5fa8e8"></div>
      </div>
    </div>

    <!-- Bonus/risques -->
    <div style="margin-bottom:14px;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:6px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Personnalité</div>
      <div style="margin-bottom:8px">
        <div style="font-size:11px;color:#8bc24a;font-weight:500">+ ${mood.bonusLabel}</div>
        <div style="font-size:10px;color:var(--mut);margin-top:2px;line-height:1.5">${mood.bonusDesc}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#e87a7a;font-weight:500">− Attention</div>
        <div style="font-size:10px;color:var(--mut);margin-top:2px;line-height:1.5">${mood.riskDesc}</div>
      </div>
    </div>

    ${_renderRouteLootProfile(mood)}

    <!-- Stats opérationnelles -->
    <div style="margin-bottom:14px;padding-top:10px;border-top:1px solid var(--border-soft)">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Mémoire de route</div>
      <div class="commerce-stat-row">
        <span class="lbl">Passages réussis</span>
        <span class="val">${route.passages}</span>
      </div>
      <div class="commerce-stat-row">
        <span class="lbl">Convois perdus</span>
        <span class="val" style="color:${route.lost > 0 ? '#e87a7a' : 'var(--text)'}">${route.lost}</span>
      </div>
      <div class="commerce-stat-row">
        <span class="lbl">Convois retardés</span>
        <span class="val">${route.delayed}</span>
      </div>
      <div class="commerce-stat-row">
        <span class="lbl">Découverte</span>
        <span class="val">${discoveredLabel}</span>
      </div>
      <div class="commerce-stat-row">
        <span class="lbl">Dernière utilisation</span>
        <span class="val" style="color:${route.lastUsedAt ? 'var(--text)' : 'var(--mut)'}">${lastUsedLabel}</span>
      </div>
    </div>

    ${_renderRouteCumulativeLoot(route)}

    ${_renderRouteMoodTimeline(route)}

    ${_renderRouteRecentReports(route)}

    ${route.sourceCard ? `
      <div style="margin-bottom:14px;padding-top:10px;border-top:1px solid var(--border-soft);font-size:10px;color:var(--mut)">
        Origine : <span style="color:var(--text)">${route.sourceCard.name}</span> · ${route.sourceCard.source}
      </div>
    ` : ''}
  `;

  // Action principale : envoyer un tanker sur la route (Chunk D — fonctionnel)
  // 3 cas possibles : route 'in_use' (tanker en cours) / 'collapsed' (route morte) / 'active' (envoi dispo)
  let actionsHtml = '';
  if (route.status === 'collapsed') {
    actionsHtml = `
      <div style="padding:10px 14px;background:rgba(176,39,41,.08);border:1px solid rgba(176,39,41,.30);border-radius:6px;font-size:11px;color:#e87a7a;font-style:italic;text-align:center">
        Cette route s'est effondrée. Elle ne supporte plus le passage.
      </div>
      <button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="closeCommerceSheet()">Fermer</button>
    `;
  } else if (route.status === 'in_use' && route.activeMissionId) {
    const mission = (G.tankerMissions || []).find(m => m.id === route.activeMissionId);
    if (mission && mission.status === 'docked') {
      actionsHtml = `
        <button class="commerce-sheet-btn commerce-sheet-btn-primary" onclick="onOpenDockClick('${mission.id}')">
          🛸 Tanker amarré à ${mission.dock?.name || 'destination'}
        </button>
        <button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="closeCommerceSheet()">Fermer</button>
      `;
    } else if (mission && mission.status === 'in_transit') {
      // Réutilise la card flotte officielle (barre de progression + ETA + style cohérent)
      // Cf. demande Adrien 18/05 : "même UI que la flotte"
      const cardHtml = (typeof renderTankerMissionCard === 'function')
        ? renderTankerMissionCard(mission, { inline: true })
        : `<div style="font-size:11px;color:var(--mut);text-align:center">${mission.tankerName} en route</div>`;
      actionsHtml = `
        ${cardHtml}
        <button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="closeCommerceSheet()" style="margin-top:10px">Fermer</button>
      `;
    } else if (mission && mission.status === 'returning') {
      // Tanker en retour : même UI que à l'aller
      const cardHtml = (typeof renderTankerMissionCard === 'function')
        ? renderTankerMissionCard(mission, { inline: true })
        : `<div style="font-size:11px;color:var(--mut);text-align:center">${mission.tankerName} de retour</div>`;
      actionsHtml = `
        ${cardHtml}
        <button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="closeCommerceSheet()" style="margin-top:10px">Fermer</button>
      `;
    } else {
      actionsHtml = `<button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="closeCommerceSheet()">Fermer</button>`;
    }
    // PATCH_1510_ROUTE_MULTI — les autres tankers de la route, et l'envoi d'un suivant
    const _others = routeLiveMissions(route.id, route.activeMissionId);
    actionsHtml = (_others.length ? `<div style="font-size:11px;color:var(--mut);text-align:center;margin-bottom:8px">Aussi sur cette route : ${_others.map(o => `<span style="color:#ffc864;cursor:pointer" onclick="window.SBMissions&&SBMissions.open('${o.id}')">${o.tankerName}</span>`).join(' · ')}</div>` : '')
      + `<button class="commerce-sheet-btn commerce-sheet-btn-primary" style="margin-bottom:8px" onclick="openTankerComposeForRoute('${route.id}')">${routeNextTankerLabel(route.id)}</button>` + actionsHtml;
  } else {
    // Active, dispo
    actionsHtml = `
      <button class="commerce-sheet-btn commerce-sheet-btn-primary" onclick="openTankerComposeForRoute('${route.id}')">
        Envoyer un tanker
      </button>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="commerce-sheet-btn commerce-sheet-btn-secondary" style="flex:1" onclick="renameRoute('${route.id}')">
          Renommer
        </button>
        <button class="commerce-sheet-btn commerce-sheet-btn-secondary" style="flex:1;color:#e87a7a" onclick="abandonRoute('${route.id}')">
          Abandonner
        </button>
      </div>
      <button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="closeCommerceSheet()">
        Fermer
      </button>
    `;
  }
  document.getElementById('commerce-sheet-actions').innerHTML = actionsHtml;
}

// ─── Handlers d'actions sur sheet ───
function onActivateCardClick(cardId) {
  const route = activateRouteCard(cardId);
  if (route) {
    // Bascule directement sur la sheet de la nouvelle route
    openCommerceSheet('route', route.id);
  } else {
    // Carte fake détectée comme bidon ou autre → fermer
    closeCommerceSheet();
  }
}

// ─── D5.1 : Helpers pour la fiche route enrichie ───

// D5.3 fix : profil de butin attendu de cette humeur (visibilité claire)
function _renderRouteLootProfile(mood) {
  if (!mood?.lootProfile) return '';
  const p = mood.lootProfile;
  // Barres visuelles : ressources vs CG (proportions)
  // resMult et cgMult vont de 0.5 à 2.5 → on normalise sur 2.5
  const MAX = 2.5;
  const resPct = Math.min(100, (p.resMult / MAX) * 100);
  const cgPct = Math.min(100, (p.cgMult / MAX) * 100);
  // Couleurs selon force du ratio
  const resColor = p.resMult >= 1.3 ? '#78c88c' : p.resMult >= 0.8 ? '#7aaadc' : '#9988aa';
  const cgColor = p.cgMult >= 1.3 ? '#ffc864' : p.cgMult >= 0.8 ? '#7aaadc' : '#9988aa';
  return `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(255,200,100,.04);border:1px solid rgba(255,200,100,.20);border-radius:8px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Profil de butin attendu</div>
      <div style="font-size:11px;color:#e6f0ff;font-style:italic;margin-bottom:10px;line-height:1.5">${p.label}</div>
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--mut);margin-bottom:3px">
          <span>Ressources</span>
          <span style="color:${resColor};font-family:'SF Mono',monospace">×${p.resMult.toFixed(2)}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.04);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${resPct}%;background:${resColor}"></div>
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--mut);margin-bottom:3px">
          <span>Crédits galactiques</span>
          <span style="color:${cgColor};font-family:'SF Mono',monospace">×${p.cgMult.toFixed(2)}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.04);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${cgPct}%;background:${cgColor}"></div>
        </div>
      </div>
    </div>
  `;
}

// Butin cumulé de la route (toute sa vie)
function _renderRouteCumulativeLoot(route) {
  const c = route.cumulativeLoot;
  if (!c || c.runs === 0) return '';
  const fmt = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : `${n}`;
  return `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(120,200,140,.04);border:1px solid rgba(120,200,140,.20);border-radius:8px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Butin total cumulé · ${c.runs} run${c.runs > 1 ? 's' : ''} réussis</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        <div style="text-align:center">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.05em">MÉTAL</div>
          <div style="font-size:13px;color:#cececd;font-weight:600;font-family:'SF Mono',monospace;margin-top:2px">${fmt(c.metal)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.05em">ÉNERGIE</div>
          <div style="font-size:13px;color:#ffaf3a;font-weight:600;font-family:'SF Mono',monospace;margin-top:2px">${fmt(c.energie)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.05em">CRISTAL</div>
          <div style="font-size:13px;color:#6db032;font-weight:600;font-family:'SF Mono',monospace;margin-top:2px">${fmt(c.cristal)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.05em">CG</div>
          <div style="font-size:13px;color:#ffc864;font-weight:600;font-family:'SF Mono',monospace;margin-top:2px">${fmt(c.credits)}</div>
        </div>
      </div>
    </div>
  `;
}

// Timeline de l'évolution de l'humeur (10-20 derniers passages)
function _renderRouteMoodTimeline(route) {
  const history = route.moodHistory || [];
  if (history.length === 0) return '';
  // Compter les humeurs
  const counts = {};
  for (const h of history) counts[h.moodKey] = (counts[h.moodKey] || 0) + 1;
  // Top 3 humeurs récentes
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const summary = top.map(([k, n]) => {
    const m = ROUTE_MOODS[k];
    return `<span style="color:${m?.accent || 'var(--mut)'}">${n} ${m?.label || k}</span>`;
  }).join(' · ');
  // Pastilles : 1 pastille par passage récent
  const dots = history.slice(-15).map(h => {
    const m = ROUTE_MOODS[h.moodKey];
    const color = h.lost ? '#b02729' : (m?.accent || '#888');
    const ring = h.lost ? `border:1px solid ${color};background:transparent` : `background:${color}`;
    return `<span title="${h.lost ? 'Perdu' : (m?.label || '')}" style="display:inline-block;width:10px;height:10px;border-radius:50%;${ring}"></span>`;
  }).join('');
  return `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Évolution sur ${history.length} passage${history.length > 1 ? 's' : ''}</div>
      <div style="display:flex;gap:5px;align-items:center;margin-bottom:8px;flex-wrap:wrap">${dots}</div>
      <div style="font-size:10px;color:var(--mut);line-height:1.5">${summary}</div>
    </div>
  `;
}

// Liste des 5 derniers rapports liés à cette route
function _renderRouteRecentReports(route) {
  const reports = (G.tankerReports || []).filter(r =>
    r.kind === 'route_run' && r.routeId === route.id
  ).slice(0, 5);
  if (reports.length === 0) return '';
  let html = `
    <div style="margin-bottom:14px;padding:12px 14px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Derniers retours · ${reports.length}</div>
  `;
  for (const r of reports) {
    const elapsed = Math.floor((Date.now() - (r.createdAt || r.at || Date.now())) / 3600000);
    const elapsedLabel = elapsed < 1 ? 'à l\'instant' : elapsed < 24 ? `${elapsed}h` : `${Math.floor(elapsed/24)}j`;
    const lootStr = r.isLost
      ? '<span style="color:#e87a7a">PERDU</span>'
      : r.loot
        ? (() => {
            const parts = [];
            if (r.loot.resources?.metal > 0) parts.push(`${r.loot.resources.metal}m`);
            if (r.loot.resources?.energie > 0) parts.push(`${r.loot.resources.energie}e`);
            if (r.loot.resources?.cristal > 0) parts.push(`${r.loot.resources.cristal}c`);
            if (r.loot.credits > 0) parts.push(`${r.loot.credits}CG`);
            return parts.length > 0 ? `<span style="color:#78c88c">+${parts.join('·')}</span>` : '<span style="color:var(--mut)">cale vide</span>';
          })()
        : '<span style="color:var(--mut)">—</span>';
    html += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:10px;font-family:'SF Mono',monospace;border-bottom:1px solid rgba(255,255,255,.04)">
        <span style="color:var(--mut)">${r.tankerName || 'Σ-?'} · ${elapsedLabel}</span>
        <span>${lootStr}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// D5.1 : Renommer une route
async function renameRoute(routeId) {
  const route = (G.routes || []).find(r => r.id === routeId);
  if (!route) return;
  const newName = prompt(`Renommer "${route.name}" :`, route.name);
  if (!newName || newName.trim() === '' || newName.trim() === route.name) return;
  route.name = newName.trim().slice(0, 60);
  if (typeof toast === 'function') toast(`Route renommée : ${route.name}`);
  refreshCommerceSheet();
}

// D5.1 : Abandonner une route (irréversible)
async function abandonRoute(routeId) {
  const route = (G.routes || []).find(r => r.id === routeId);
  if (!route) return;
  if (route.status === 'in_use') {
    if (typeof toast === 'function') toast('Tanker en route — annule d\'abord la mission');
    return;
  }
  const confirmed = await sbConfirmDanger(
    'Abandonner cette route ?',
    `"${route.name}" sera marquée comme abandonnée. Elle ne génère plus aucun drift, n'apparaît plus dans la liste principale. Tu ne peux pas la réactiver.`,
    'Abandonner'
  );
  if (!confirmed) return;
  route.status = 'abandoned';
  route.activeMissionId = null;
  if (typeof toast === 'function') toast(`Route abandonnée : ${route.name}`);
  closeCommerceSheet();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

async function onDiscardCardClick(cardId) {
  const idx = (G.routeCards || []).findIndex(c => c.id === cardId);
  if (idx === -1) { closeCommerceSheet(); return; }
  const card = G.routeCards[idx];

  // Confirmation : action destructive (la carte est perdue à jamais, elle ne reviendra pas)
  const confirmed = await sbConfirmDanger(
    'Jeter cette carte ?',
    `"${card.name}" sera détruite. Cette carte ne reviendra pas — tu ne pourras plus l'activer ni la revendre.`,
    'Jeter'
  );
  if (!confirmed) return;

  // Re-vérifier l'index après l'await (l'état peut avoir changé)
  const idxNow = (G.routeCards || []).findIndex(c => c.id === cardId);
  if (idxNow === -1) { closeCommerceSheet(); return; }
  G.routeCards.splice(idxNow, 1);
  if (typeof toast === 'function') toast(`Carte "${card.name}" jetée.`);
  closeCommerceSheet();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function setCommerceTab(tab) {
  if (!['routes', 'cartes', 'marche'].includes(tab)) return;
  _commerceTab = tab;
  // Mise à jour visuelle des onglets
  for (const t of ['routes', 'cartes', 'marche']) {
    const btn = document.getElementById('commerce-tab-' + t);
    const pane = document.getElementById('commerce-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pane) pane.style.display = (t === tab) ? '' : 'none';
  }
  // Re-render le contenu selon onglet
  if (tab === 'routes') renderCommerceRoutes();
  else if (tab === 'cartes') renderCommerceCartes();
  else if (tab === 'marche') renderCommerceMarche();
}

function renderCommerceScreen() {
  // 30/10 (Adrien) — fortune de l'empire : toutes les planètes additionnées
  try {
    const bar = document.getElementById('commerce-credits-bar');
    let fe = document.getElementById('commerce-fortune');
    const multi = Array.isArray(G.worlds) && G.worlds.length > 1;
    if (!multi) { if (fe) fe.remove(); }
    else if (bar) {
      if (!fe) { fe = document.createElement('div'); fe.id = 'commerce-fortune'; fe.style.cssText = 'margin:-4px 16px 12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,200,100,.22);background:rgba(255,200,100,.04)'; bar.parentNode.insertBefore(fe, bar.nextSibling); }
      const E = sbEmpireRes(), L = [['metal', 'Métal'], ['energie', 'Énergie'], ['cristal', 'Cristal'], ['biomass', 'Biomasse'], ['artefact', 'Artefacts']];
      fe.innerHTML = `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Fortune de l'empire · ${G.worlds.length} planètes</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-family:'SF Mono',monospace;font-size:12px;color:#ffe2bd">${L.map(([k, lb]) => `<span><span style="color:var(--mut);font-family:inherit">${lb}</span> ${fmt(E[k] || 0)}</span>`).join('')}</div>
        <div style="font-size:10px;color:var(--mut);margin-top:6px">Tu vends depuis le stock de ${(G.planet && G.planet.name) || 'la planète affichée'}. Pour regrouper, envoie un convoi de tankers.</div>`;
    }
  } catch (e) { console.warn('[fortune]', e); }
  // Bandeau crédits + taux
  const creditsEl = document.getElementById('commerce-credits-value');
  if (creditsEl) {
    const credits = G.credits || 0;
    const rate = getCommerceCreditsRate();
    creditsEl.innerHTML = `${fmt(credits)} CG${rate > 0 ? ` <span style="font-size:11px;color:#5fcc8a;font-weight:400">+${rate}/h</span>` : ''}`;
  }
  // Bandeau carburant (Chunk D + 18/05 cap + rate)
  const fuelEl = document.getElementById('commerce-fuel-value');
  if (fuelEl) {
    const fuel = G.fuel || 0;
    const fuelCap = (typeof getFuelCap === 'function') ? getFuelCap() : 1000;
    const fuelRate = (typeof getFuelProductionRate === 'function') ? getFuelProductionRate() : 0;
    fuelEl.innerHTML = `${fmt(fuel)}<span style="font-size:11px;color:var(--mut);font-weight:400">/${fmt(fuelCap)}</span>${fuelRate > 0 ? ` <span style="font-size:11px;color:#5fcc8a;font-weight:400">+${fuelRate}/h</span>` : ''}`;
  }

  // Badge non-lus sur le raccourci Rapports (18/05)
  const unreadCount = (G.tankerReports || []).filter(r => !r.read).length
                    + (G.probeReports || []).filter(r => !r.read).length;
  const badgeEl = document.getElementById('commerce-rapports-shortcut-badge');
  const subEl = document.getElementById('commerce-rapports-shortcut-sub');
  if (badgeEl) {
    if (unreadCount > 0) {
      badgeEl.style.display = '';
      badgeEl.textContent = unreadCount;
    } else {
      badgeEl.style.display = 'none';
    }
  }
  if (subEl) {
    if (unreadCount > 0) {
      subEl.textContent = `${unreadCount} nouveau${unreadCount > 1 ? 'x' : ''} rapport${unreadCount > 1 ? 's' : ''}`;
      subEl.style.color = '#ffc864';
    } else {
      subEl.textContent = 'Retours de tankers, sondes, prospections';
      subEl.style.color = 'var(--mut)';
    }
  }

  // D5.2 : Badge pistes ouvertes sur raccourci Carnet
  const openLeadsCount = (G.openLeads || []).filter(l => l.status === 'open').length;
  const carnetBadge = document.getElementById('commerce-carnet-shortcut-badge');
  const carnetSub = document.getElementById('commerce-carnet-shortcut-sub');
  if (carnetBadge) {
    if (openLeadsCount > 0) {
      carnetBadge.style.display = '';
      carnetBadge.textContent = openLeadsCount;
    } else {
      carnetBadge.style.display = 'none';
    }
  }
  if (carnetSub) {
    if (openLeadsCount > 0) {
      carnetSub.textContent = `${openLeadsCount} piste${openLeadsCount > 1 ? 's' : ''} ouverte${openLeadsCount > 1 ? 's' : ''}`;
      carnetSub.style.color = '#c8b478';
    } else {
      carnetSub.textContent = 'Routes, pavillons, rumeurs, infos';
      carnetSub.style.color = 'var(--mut)';
    }
  }

  // Badges onglets (compteurs)
  const routesCount = (G.routes || []).length;
  const cartesCount = (G.routeCards || []).length;
  const routesBadge = document.getElementById('commerce-tab-routes-badge');
  const cartesBadge = document.getElementById('commerce-tab-cartes-badge');
  if (routesBadge) {
    routesBadge.style.display = routesCount > 0 ? '' : 'none';
    routesBadge.textContent = routesCount;
  }
  if (cartesBadge) {
    cartesBadge.style.display = cartesCount > 0 ? '' : 'none';
    cartesBadge.textContent = cartesCount;
  }

  // Réafficher l'onglet courant
  setCommerceTab(_commerceTab);
}

function renderCommerceRoutes() {
  const el = document.getElementById('commerce-routes-content');
  if (!el) return;
  // D5.1 : exclure les routes abandonnées de la vue principale.
  // Elles restent dans G.routes (pour stats), mais cachées de la liste opérationnelle.
  const routes = (G.routes || []).filter(r => r.status !== 'abandoned');

  if (routes.length === 0) {
    el.innerHTML = `
      <div style="padding:40px 24px;text-align:center;color:var(--mut);font-size:12px;line-height:1.8">
        <div style="font-size:32px;opacity:.3;margin-bottom:14px">⊙</div>
        <div style="font-style:italic;margin-bottom:10px">Aucune route activée.</div>
        <div style="font-size:10px;opacity:.8;max-width:300px;margin:0 auto;line-height:1.7">
          Les routes naissent des cartes. Les cartes se trouvent en route — au retour d'un tanker, dans le récit d'un équipage qui a vu plus loin qu'attendu.
        </div>
      </div>
    `;
    return;
  }

  // Tri : du plus récent au plus ancien découvert
  const sorted = [...routes].sort((a, b) => (b.discoveredAt || 0) - (a.discoveredAt || 0));

  // ─── Bannières "Tankers amarrés" en tête (raccourci direct vers le dock) ───
  // Cf. demande Adrien 18/05 : pouvoir ouvrir le dock sans passer par la fiche route.
  const dockedMissions = (G.tankerMissions || []).filter(m => m.kind === 'route_run' && m.status === 'docked');
  const dockedBanners = dockedMissions.map(m => {
    const dock = m.dock || {};
    const dockTypeCfg = DOCK_TYPES.find(d => d.key === dock.type) || {};
    const accent = dockTypeCfg.accent || '#ffc864';
    const stayLabel = m.dockStay
      ? `${_formatDuration(Math.max(0, m.dockStay.endsAt - Date.now()))} restant`
      : 'Séjour à choisir';
    return `
      <div onclick="onOpenDockClick('${m.id}')" style="
        margin:0 16px 10px;padding:12px 14px;
        background:rgba(255,200,100,.04);
        border:1px solid ${accent}40;border-radius:8px;cursor:pointer;
        display:flex;align-items:center;gap:12px
      ">
        <div style="font-size:20px;color:${accent}">⚓</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;color:#e6f0ff;font-weight:500">${m.tankerName} amarré</div>
          <div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dock.name || 'Dock inconnu'} · ${stayLabel}</div>
        </div>
        <div style="color:var(--mut);font-size:14px">›</div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    ${window.SBMissions ? SBMissions.commerceStrip() : ''}
    ${dockedBanners ? `<div style="padding:12px 0 4px">${dockedBanners}</div>` : ''}
    <div style="padding:8px 16px 4px;font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">
      ${routes.length} route${routes.length > 1 ? 's' : ''} active${routes.length > 1 ? 's' : ''}
    </div>
    <div style="padding:4px 16px 16px">
      ${sorted.map(r => renderRouteCell(r)).join('')}
    </div>
  `;
}

// ─── Utilitaires pour génération déterministe (canon univers fixe) ───
// Une destination = un dock. Garanti par hash + seeded random.
// Cf. décision canon 18/05 : les docks sont des objets de l'univers, pas du joueur.
// Plus tard (multijoueur), G.universeDocks deviendra un fetch serveur.
function _hashStringDeterministic(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & 0xFFFFFFFF; // garde un int 32
  }
  return Math.abs(h);
}

function _makeSeededRandom(seed) {
  let s = (seed % 233280) || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function rollDockType(rng) {
  // rng : fonction random (Math.random ou seededRandom). Si absent, Math.random.
  const r = rng || Math.random;
  return DOCK_TYPES[Math.floor(r() * DOCK_TYPES.length)];
}

function generateDockForRoute(route) {
  // Génération DÉTERMINISTE basée sur destinationHint.
  // Garantit qu'une même destination → un même dock, peu importe qui ou quand l'active.
  const destHint = (route && route.destinationHint) || 'unknown';
  const seed = _hashStringDeterministic(destHint);
  const rng = _makeSeededRandom(seed);

  const type = rollDockType(rng);
  // Nom procédural : préfixe (selon type) + suffixe (selon famille univers)
  const prefixes = {
    asteroid_bar: ['Le Sas', 'Le Trou', 'Le Creux', 'L\'Antre', 'La Veine'],
    abandoned_station: ['Station', 'Relais', 'Plate-forme'],
    hidden_freeport: ['Port-Franc', 'Comptoir', 'L\'Échangeur'],
    derelict_carrier: ['Le Pont', 'La Carène', 'L\'Étrave'],
    pilgrim_stop: ['Sanctuaire', 'Halte', 'Refuge'],
  };
  const suffixes = ['de Kerbera', 'd\'Inkasthar', 'de Vérath', 'd\'Auris', 'de Sigma-26', 'de Cyranos', 'd\'Erebus', 'des Cendres', 'du Silence'];
  const prefix = prefixes[type.key][Math.floor(rng() * prefixes[type.key].length)];
  const suffix = suffixes[Math.floor(rng() * suffixes.length)];

  return _crownDock({   // PATCH_1510_CROWN
    // ID stable = hash de la destination. Sert de clé dans G.universeDocks et pour migration multijoueur.
    id: 'dock-' + seed.toString(36),
    type: type.key,
    typeLabel: type.label,
    name: `${prefix} ${suffix}`,
    accent: type.accent,
    sub: type.sub,
    ambience: type.ambience,
    detail: type.detail,
    // Le dock connaît la destination canonique qui l'a fait naître
    destinationHint: destHint,
    arrivedAt: null,
  });
}
// PATCH_1910_BREST — le « Refuge de Brest » des pistes d'exploration (dock sans position depuis mai) EST la station-mammouth :
// une piste qui le révèle donne ses vraies coordonnées ; les anciennes découvertes et les routes qui y menaient sont rattachées à la station
function sbBrestPortSys() {
  try { const p = Object.values(SBLines.network().ports).find(x => x.dockId === REFUGE_DOCK_ID); return p ? p.sys : null; } catch (e) { return null; }
}
function sbBrestFromLead(d) {
  d.id = REFUGE_DOCK_ID; _crownDock(d);
  const sys = sbBrestPortSys();
  if (sys && window.SBLines && SBLines.discoverPort) { try { SBLines.discoverPort(sys, Date.now()); } catch (e) {} }
  return d;
}
// 03/11 — une piste dock_coords mène à un vrai lieu caché du réseau (SBLines) : le plus proche de chez soi parmi ceux encore inconnus,
// tiré de façon stable pour la piste. null s'il ne reste rien à découvrir (ou si les lignes ne sont pas chargées).
function sbPickPortForLead(lead) {
  try {
    if (!window.SBLines || !SBLines.network) return null;
    const ports = Object.values(SBLines.network().ports).filter(p => p && p.sys && !(G.hiddenPorts && G.hiddenPorts[p.sys]));
    if (!ports.length) return null;
    const o = typeof sbOrigin === 'function' ? sbOrigin() : MY_ADDRESS;
    const home = (o && o.sector) || MY_ADDRESS.sector || 'N';
    const gap = (p) => Math.abs(String(p.sys).split('-')[1].charCodeAt(0) - home.charCodeAt(0));
    ports.sort((a, b) => gap(a) - gap(b) || (a.sys < b.sys ? -1 : 1));
    const best = ports.filter(p => gap(p) === gap(ports[0]));
    const h = _hashStringDeterministic(String((lead && lead.id) || 'lead'));
    return best[Math.abs(h) % best.length];
  } catch (e) { return null; }
}
// bloc « lieu découvert » dans le rapport d'exploration : nom, système, accès direct à la carte
function sbDockFoundHtml(r) {
  const d = r && r.kind === 'exploration' && r.result && r.result.kind === 'dock_success' && r.result.newDock;
  if (!d) return '';
  const sys = r.result.portSys || d.portSys || null;
  if (sys && window.SBLines && SBLines.discoverPort && !(G.hiddenPorts && G.hiddenPorts[sys])) { try { SBLines.discoverPort(sys, r.createdAt || Date.now()); } catch (e) {} }   // auto-réparation : le lieu doit être sur la carte
  const safe = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, '');
  return `<div style="margin-bottom:14px;padding:14px;background:rgba(122,170,220,.07);border:1px solid rgba(122,170,220,.35);border-radius:6px">
      <div style="font-size:9px;color:#7aaadc;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">Lieu caché découvert</div>
      <div style="font-size:14px;color:#e6f0ff;font-weight:600">${safe(d.name)}</div>
      <div style="font-size:11px;color:var(--mut);margin-top:2px">${safe(d.sub || '')}${sys ? ` · <span style="font-family:'SF Mono',monospace;color:#7aaadc">${safe(sys)}</span>` : ''}</div>
      ${sys ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button onclick="event.stopPropagation();openSystemOnMap('${safe(sys)}')" style="flex:1;min-width:140px;padding:10px 12px;border-radius:8px;border:1px solid rgba(122,170,220,.5);background:rgba(122,170,220,.12);color:#e6f0ff;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">Voir sur la carte</button>
      </div><div style="font-size:11px;color:var(--mut);margin-top:8px;line-height:1.5">Sa route est ouverte au Commerce : envoie-y un tanker depuis le Centre de prospection.</div>`
      : `<div style="font-size:11px;color:var(--mut);margin-top:8px">Ce dock pourra être proposé comme destination de tes prochaines routes.</div>`}
    </div>`;
}
// anciens rapports « dock découvert » sans système : on les relie au port réel (le Refuge de Brest) et on le met sur la carte
function sbRepairDockReports() {
  try {
    if (!window.SBLines || !SBLines.network) return;
    for (const r of G.tankerReports || []) {
      if (!(r && r.kind === 'exploration' && r.result && r.result.kind === 'dock_success' && r.result.newDock) || r.result.portSys) continue;
      const d = r.result.newDock;
      let sys = d.portSys || null;
      if (!sys && (d.id === REFUGE_DOCK_ID || /refuge de brest/i.test(d.name || ''))) sys = sbBrestPortSys();
      if (!sys) continue;
      r.result.portSys = sys; d.portSys = sys; r.targetCoords = sys;
      if (!(G.hiddenPorts && G.hiddenPorts[sys])) SBLines.discoverPort(sys, r.createdAt || Date.now());
    }
  } catch (e) { console.warn('[docks]', e); }
}
function sbMigrateBrest() {
  if (G._brest1) return;
  if (!window.SBLines || !SBLines.network) return;      // lignes pas encore chargées : on réessaiera au prochain chargement
  G._brest1 = 1;
  const isBrest = (d) => d && /refuge de brest/i.test(d.name || '') && d.id !== REFUGE_DOCK_ID;
  let found = false;
  for (const d of G.discoveredDocks || []) if (isBrest(d)) { d.id = REFUGE_DOCK_ID; _crownDock(d); found = true; }
  for (const [k, d] of Object.entries(G.universeDocks || {})) if (isBrest(d)) { delete G.universeDocks[k]; found = true; }
  const fix = (o) => { if (o && isBrest(o.dock)) { o.dock = _crownDock(Object.assign({}, o.dock, { id: REFUGE_DOCK_ID })); if ('dockId' in o) o.dockId = REFUGE_DOCK_ID; found = true; } };
  (G.routes || []).forEach(fix); (G.tankerMissions || []).forEach(fix);
  if (found) { const sys = sbBrestPortSys(); if (sys) { try { SBLines.discoverPort(sys, Date.now()); } catch (e) {} } }
}
function _crownDock(d) { return (d && STATION_DOCKS[d.id]) ? Object.assign(d, STATION_DOCKS[d.id]) : d; }

// ─── Registre des docks de l'univers (canon 18/05) ───
// Une destination = un dock. On stocke ici les docks déjà rencontrés.
// G.universeDocks est partagé entre TOUTES les routes du joueur (et plus tard, entre joueurs).
function getOrCreateDockForDestination(destinationHint) {
  if (!G.universeDocks) G.universeDocks = {};
  const seed = _hashStringDeterministic(destinationHint || 'unknown');
  const id = 'dock-' + seed.toString(36);
  if (G.universeDocks[id]) return G.universeDocks[id];

  // D5.3 fix #1 (18/05) : 30% de chance d'utiliser un dock découvert via exploration
  // si on en a au moins 1 disponible. Crée une vraie utilité au système de pistes dock_coords.
  const discovered = (G.discoveredDocks || []).filter(d => !d.usedAsRouteDock);
  if (discovered.length > 0 && Math.random() < 0.30) {
    const pickIdx = Math.floor(Math.random() * discovered.length);
    const baseDock = discovered[pickIdx];
    // Enrichir avec un sub label et flag d'exploration
    const dock = {
      id: baseDock.id,
      name: baseDock.name,
      type: baseDock.type,
      sub: baseDock.sub,
      detail: baseDock.detail,
      typeLabel: baseDock.sub,
      accent: baseDock.type === 'hidden_freeport' ? '#7aaadc' : '#ffc864',
      discovered: true,  // flag : permet d'afficher "★ découvert par exploration" dans l'UI
      // Bonus : -10% sur prix achat ressources, +10% sur revente (cf. GDD)
      priceBonus: { buyDiscount: 0.10, sellBonus: 0.10 },
    };
    // Marquer comme utilisé pour ne pas le re-piocher tout le temps
    baseDock.usedAsRouteDock = true;
    baseDock.firstUsedAt = Date.now();
    G.universeDocks[id] = dock;
    return dock;
  }

  const dock = generateDockForRoute({ destinationHint });
  G.universeDocks[id] = dock;
  return dock;
}

// ─── Envoi tanker sur route ───
// Crée une mission de type 'route_run'. Le tanker part avec un cargo, consomme du fuel,
// arrive à un dock procédural. Phase D1 : durée test 5-10 min, pas encore de séjour.
// PATCH_1510_ROUTE_MULTI — les tankers d'une route (en vol, à quai, au retour)
function routeLiveMissions(routeId, exceptId) {
  return (G.tankerMissions || []).filter(m => m.routeId === routeId && m.id !== exceptId && ['in_transit', 'docked', 'returning'].includes(m.status));
}
function routeNextTankerLabel(routeId) {
  const n = routeLiveMissions(routeId).length;
  return n ? `Envoyer un ${n + 1}e tanker` : 'Envoyer un tanker';
}
// un tanker quitte la route : elle reste en service si un autre y est encore
function routeReleaseMission(route, missionId) {
  if (!route) return;
  const live = routeLiveMissions(route.id, missionId);
  if (live.length) { route.status = route.status === 'collapsed' ? 'collapsed' : 'in_use'; route.activeMissionId = live[live.length - 1].id; }
  else { route.activeMissionId = null; if (route.status === 'in_use') route.status = 'active'; }
}
function launchTankerOnRoute(routeId, tierKey, cargo, envoyIn) {
  if (!Array.isArray(G.tankerMissions)) G.tankerMissions = [];
  const route = (G.routes || []).find(r => r.id === routeId);
  if (!route) {
    if (typeof toast === 'function') toast('Route introuvable');
    return null;
  }
  if (route.status === 'collapsed') {
    if (typeof toast === 'function') toast('Cette route s\'est effondrée');
    return null;
  }
  // PATCH_1510_ROUTE_MULTI : un 2e tanker peut suivre le 1er sur la même route

  // PATCH_0211_AMBASSADEUR — un vaisseau d'exception à la place du tanker : abordé comme un T3, sa propre cale, son propre carburant
  const _envoy = envoyIn && window.SBBlackmarket ? SBBlackmarket.envoyChoices().find(x => x.pid === envoyIn.pid) : null;
  if (envoyIn && !_envoy) { if (typeof toast === 'function') toast('Ce vaisseau n\'est plus disponible'); return null; }
  const tier = _envoy ? 3 : parseInt(String(tierKey).replace('t', ''), 10);
  const tierCfg = _envoy ? { fuelCost: _envoy.fuel, cargoCapacity: _envoy.cargo, label: _envoy.name } : TANKER_TIER_CONFIG[tier];
  if (!tierCfg) {
    if (typeof toast === 'function') toast('Tier de tanker invalide');
    return null;
  }

  // Vérifier disponibilité du tanker
  const stat = G.fleet?.stationed?.tanker || {};
  const tierStock = stat['t' + tier] || 0;
  const inMission = (G.tankerMissions || []).filter(m =>
    (m.status === 'in_transit' || m.status === 'docked' || m.status === 'returning')
    && m.tier === tier
  ).length;
  if (!_envoy && tankerAvailability(tier) <= 0) {
    if (typeof toast === 'function') toast(`Aucun tanker T${tier} disponible`);
    return null;
  }

  // Vérifier carburant
  if ((G.fuel || 0) < tierCfg.fuelCost) {
    if (typeof toast === 'function') toast(`Carburant insuffisant (${tierCfg.fuelCost} requis)`);
    return null;
  }

  // Calculer total cargo (validation)
  const cargoTotal = (cargo?.metal || 0) + (cargo?.energie || 0) + (cargo?.cristal || 0);
  if (cargoTotal > tierCfg.cargoCapacity) {
    if (typeof toast === 'function') toast(`Cargo trop lourd (max ${tierCfg.cargoCapacity})`);
    return null;
  }

  // Vérifier que le joueur a bien les ressources à charger
  for (const k of ['metal', 'energie', 'cristal']) {
    if ((cargo?.[k] || 0) > (G.res[k]?.v || 0)) {
      if (typeof toast === 'function') toast(`Ressources insuffisantes en ${k}`);
      return null;
    }
  }

  // Consommer carburant + ressources cargo
  G.fuel -= tierCfg.fuelCost;
  for (const k of ['metal', 'energie', 'cristal']) {
    if (cargo?.[k] > 0) G.res[k].v -= cargo[k];
  }

  // Générer/récupérer le dock attaché à la route
  // Fix 18/05 : le dock est désormais persistant sur la route (créé à l'activation de la carte).
  // Si une vieille route n'en a pas, on en génère un via le registre univers et on le stocke.
  if (!route.dock || !route.dockId) {
    const dockRef = getOrCreateDockForDestination(route.destinationHint);
    route.dock = dockRef;
    route.dockId = dockRef.id;
  }
  // On copie le dock dans la mission (avec arrivedAt vide), pour ne pas modifier le dock canon de la route.
  const dock = JSON.parse(JSON.stringify(route.dock));
  dock.arrivedAt = null;

  // Durée test 5-10 min (cf. cheats existants)
  const now = Date.now();
  const TEST_MIN_MS = 5 * 60 * 1000;
  const TEST_MAX_MS = 10 * 60 * 1000;
  const durationMs = (TEST_MIN_MS + Math.random() * (TEST_MAX_MS - TEST_MIN_MS)) * (_envoy ? _envoy.speed : 1);

  const mission = {
    id: 'tm-' + now + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: _envoy ? _envoy.name : 'Σ-' + Math.floor(Math.random() * 99 + 1),
    bmEnvoy: _envoy ? { pid: _envoy.pid, item: _envoy.item, cat: _envoy.cat, name: _envoy.name, cargo: _envoy.cargo } : undefined,   // PATCH_0211_AMBASSADEUR
    kind: 'route_run',           // ← marqueur Chunk D
    tier,
    routeId,
    routeName: route.name,
    routeMoodKey: route.moodKey,
    cargo,
    // D5.3 fix #1+#3 (18/05) : copie immuable du cargo de départ pour comparaison aller/retour
    // dans le rapport. Permet d'afficher "Cale au départ → Cale au retour → Bénéfice net".
    // mission.cargo sera modifié par les échanges PNJ pendant le séjour.
    cargoInitial: {
      metal: cargo?.metal || 0,
      energie: cargo?.energie || 0,
      cristal: cargo?.cristal || 0,
    },
    cargoTotal,
    fuelCost: tierCfg.fuelCost,
    dock,
    departedAt: now,
    arrivalAt: now + durationMs,
    status: 'in_transit',
    targetCoords: route.destinationHint,
    targetLabel: dock.name,
  };
  // PATCH_1410_PISTES — route d'une ligne remontée : le tanker suit les jalons connus (vus par les balises posées dessus)
  if (route.portSys && window.SBLines) {
    const ch = SBLines.knownChain(route.portSys);
    mission.portSys = route.portSys;
    mission.via = ch.slice(0, -1).slice(0, 24);
    // PATCH_1410_BALISAGE — route balisée : plus rapide, plus sûre, et masquée au registre dès la moitié
    const bal = SBLines.balisage(route.portSys);
    mission.balisage = bal.ratio;
    mission.baliseCover = bal.cover;
    mission.arrivalAt = mission.departedAt + (mission.arrivalAt - mission.departedAt) * bal.factor;
  }
  G.tankerMissions.push(sbTagWorld(mission));

  // Marquer la route comme en cours d'utilisation
  route.status = 'in_use';
  route.activeMissionId = mission.id;

  if (typeof toast === 'function') {
    toast(`${mission.tankerName} part vers ${route.name} · -${tierCfg.fuelCost} carburant`);
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  mpConvoyRegister(mission, 'out');   // PIRATERIE_1210 — visible des balises
  return mission;
}

// ─── Gestion arrivée tanker sur route (handler appelé par tickTankerMissions) ───
// Phase D1 : pour l'instant on déclenche directement le retour avec gain de base.
// Phase D2+ : tanker reste au dock, le joueur choisit la durée de séjour.
function handleTankerRouteArrival(mission) {
  const route = (G.routes || []).find(r => r.id === mission.routeId);
  if (!route) {
    // Route disparue, on retourne directement le tanker
    mission.status = 'returned';
    return;
  }

  // Pour D1 : on simule un séjour court automatique. Le joueur récupèrera le tanker
  // en ouvrant l'écran du dock. Pour l'instant on met le tanker en état 'docked'
  // sans timer de séjour configurable. Le bouton "Rentrer maintenant" déclenchera le retour.
  mission.status = 'docked';
  mission.dock.arrivedAt = Date.now();

  // ─── D2 : Initialiser l'état de l'équipage à l'arrivée ───
  // L'humeur de départ dépend de la difficulté du voyage (route noire = stress de départ)
  const moodKey = mission.routeMoodKey;
  const startHumor = (moodKey === 'noire') ? 40 : (moodKey === 'morte') ? 20 : 10;
  mission.crewMood = {
    humorScore: startHumor,           // 0-100, monte avec le temps/stress
    physicalScore: 0,                 // 0-100, monte avec ivresse
    physicalState: 'sobre',           // sobre | emeche | saoul | cuve
    physicalStateChangedAt: Date.now(),
    lastTickAt: Date.now(),
  };
  mission.dockJournal = [];           // récits accumulés pendant le séjour

  if (typeof toast === 'function') {
    toast(`🛸 ${mission.tankerName} amarré à ${mission.dock.name}`);
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Mapping humorScore → palier
function _getHumorPalier(score) {
  if (score <= 25) return 'repose';
  if (score <= 55) return 'calme';
  if (score <= 80) return 'inquiet';
  return 'mutin';
}

// Substitution de tokens dans un récit d'équipage.
// {crew} = un prénom différent à chaque occurrence (tirage sans répétition)
// {tanker} = nom du tanker de la mission
// {dock} = nom du dock courant
// Garantit que dans un même template, plusieurs {crew} produisent des prénoms différents.
function _expandCrewTokens(template, mission) {
  if (!template) return template;
  let result = template;

  // Substituer {tanker} et {dock} (uniques par template)
  result = result.replace(/\{tanker\}/g, mission?.tankerName || 'le tanker');
  result = result.replace(/\{dock\}/g, mission?.dock?.name || 'le dock');

  // Compter les {crew} et tirer autant de prénoms différents
  const crewMatches = (result.match(/\{crew\}/g) || []).length;
  if (crewMatches === 0) return result;

  // Pool de prénoms disponibles, exclus ceux déjà utilisés récemment dans ce récit
  const usedThisTemplate = new Set();
  for (let i = 0; i < crewMatches; i++) {
    let pickName;
    if (typeof pickSpaceWorkerName === 'function') {
      // Boucle de sécurité : on essaie 6 fois d'avoir un prénom unique pour ce template
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = pickSpaceWorkerName();
        if (!usedThisTemplate.has(candidate)) {
          pickName = candidate;
          break;
        }
      }
      if (!pickName) pickName = pickSpaceWorkerName();
    } else {
      pickName = 'l\'équipage';
    }
    usedThisTemplate.add(pickName);
    // Remplace SEULEMENT la première occurrence (puis on reboucle pour la suivante)
    result = result.replace('{crew}', pickName);
  }
  return result;
}
