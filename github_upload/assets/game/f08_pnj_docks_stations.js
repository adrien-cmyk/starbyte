/* Starbyte — f08_pnj_docks_stations.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


// Tick d'humeur : appelé toutes les 30s (test) par tickTankerMissions
// Représente 1h simulée de temps au dock.
// Bloqué tant que le joueur n'a pas choisi de durée (sinon les notifs apparaissent
// avant qu'il ait validé son séjour — bug 18/05).
function tickCrewMood(mission) {
  if (mission.status !== 'docked' || !mission.crewMood) return;
  if (!mission.dockStay) return;  // ← pas de durée choisie = pas d'évolution
  const mood = mission.crewMood;
  const now = Date.now();

  // ─── Axe 1 : humeur ───
  // Montée naturelle selon temps écoulé depuis arrivée
  const elapsedAtDock = now - (mission.dock?.arrivedAt || now);
  const stayDurationMs = mission.dockStay?.chosenDurationMs || (8 * 3600 * 1000);
  const progressRatio = elapsedAtDock / stayDurationMs;
  // Si proche de la fin du séjour prévu (>75%), l'humeur monte plus vite
  let humorDelta = 1;
  if (progressRatio > 0.75) humorDelta = 3;
  else if (progressRatio > 0.50) humorDelta = 2;
  // Type de dock module : Halte de pèlerins fait baisser, Bar d'astéroïdes fait monter
  const dockType = mission.dock?.type;
  if (dockType === 'pilgrim_stop') humorDelta -= 1;
  else if (dockType === 'asteroid_bar') humorDelta += 1;
  // Humeur route module
  if (mission.routeMoodKey === 'noire') humorDelta += 1;
  else if (mission.routeMoodKey === 'imperiale') humorDelta -= 1;
  // Apply
  mood.humorScore = Math.max(0, Math.min(100, mood.humorScore + humorDelta));

  // ─── Axe 2 : physique ───
  // Probabilité de basculer Sobre → Émeché → Saoul selon type dock
  const drunkRate = DOCK_DRUNKENNESS_RATES[dockType] || 0.20;
  if (mood.physicalState === 'sobre' && Math.random() < drunkRate) {
    mood.physicalState = 'emeche';
    mood.physicalStateChangedAt = now;
  } else if (mood.physicalState === 'emeche' && Math.random() < (drunkRate * 0.8)) {
    mood.physicalState = 'saoul';
    mood.physicalStateChangedAt = now;
  } else if (mood.physicalState === 'saoul') {
    // Au bout de ~3h saoul, passe à cuvé
    const saoulSince = (now - mood.physicalStateChangedAt) / 1000;
    if (saoulSince > 90) { // 90s = 3 ticks = 3h simulées
      mood.physicalState = 'cuve';
      mood.physicalStateChangedAt = now;
    }
  } else if (mood.physicalState === 'cuve') {
    // Au bout de ~2h cuvé, retour sobre
    const cuveSince = (now - mood.physicalStateChangedAt) / 1000;
    if (cuveSince > 60) {
      mood.physicalState = 'sobre';
      mood.physicalStateChangedAt = now;
    }
  }

  // ─── Générer récit passif (1 tick sur 3 environ) ───
  // Sélection sans doublon récent : on évite de retirer un récit déjà joué dans
  // les 4 derniers tirages pour cette mission (sinon avec un pool de 4, les
  // doublons sont mathématiquement inévitables — bug rapporté Adrien 18/05).
  if (!Array.isArray(mood.recentNarratives)) mood.recentNarratives = [];
  const _pickUnique = (pool) => {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    // Filtre les candidats non joués récemment
    const available = pool.filter(t => !mood.recentNarratives.includes(t));
    // Si tous ont été joués, on accepte de re-tirer (mais reset la mémoire pour repartir)
    const candidates = available.length > 0 ? available : pool;
    if (available.length === 0) mood.recentNarratives = [];
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    // Mémoriser : on garde une fenêtre de la taille du pool - 1 (on autorise re-jouer
    // seulement quand tous les autres ont été utilisés au moins une fois)
    mood.recentNarratives.push(pick);
    const maxMem = Math.max(2, pool.length - 1);
    while (mood.recentNarratives.length > maxMem) mood.recentNarratives.shift();
    return pick;
  };

  const palier = _getHumorPalier(mood.humorScore);
  let entryText = null;
  // Si saoul : pousser un récit saoul (30% chance d'événement spécial)
  if (mood.physicalState === 'saoul') {
    if (Math.random() < 0.30) {
      // Tirer un événement spécial qui matche le combo
      // Chaque événement ne peut se déclencher qu'une seule fois par séjour
      // (sinon "carte tatouée" peut spawner 5 cartes gratuites sur un long séjour saoul).
      if (!mission.triggeredEvents) mission.triggeredEvents = {};
      const candidates = Object.entries(CREW_SPECIAL_EVENTS).filter(([k, ev]) => {
        if (mission.triggeredEvents[k]) return false; // déjà déclenché ce séjour
        return ev.needs.every(need => need === palier || need === mood.physicalState);
      });
      if (candidates.length > 0) {
        const [evKey, ev] = candidates[Math.floor(Math.random() * candidates.length)];
        mission.triggeredEvents[evKey] = true;
        entryText = ev.apply(mission);
      }
    }
    if (!entryText && Math.random() < 0.5) {
      entryText = _pickUnique(CREW_NARRATIVES.saoul);
    }
  } else if (mood.physicalState === 'cuve' && Math.random() < 0.30) {
    entryText = _pickUnique(CREW_NARRATIVES.cuve);
  } else if (Math.random() < 0.35) {
    // Récit normal selon palier humeur
    entryText = _pickUnique(CREW_NARRATIVES[palier] || CREW_NARRATIVES.calme);
  }

  if (entryText) {
    // Substituer les tokens {crew}/{tanker}/{dock} avant de figer le récit
    // (chaque {crew} reçoit un prénom différent du pool WORKER_NAMES_SPACE)
    const expandedText = _expandCrewTokens(entryText, mission);
    if (!Array.isArray(mission.dockJournal)) mission.dockJournal = [];
    mission.dockJournal.push({
      at: now,
      humor: palier,
      physical: mood.physicalState,
      text: expandedText,
    });
    // Cap à 30 entrées pour éviter explosion mémoire sur très longs séjours
    if (mission.dockJournal.length > 30) mission.dockJournal.shift();
  }

  mood.lastTickAt = now;

  // ─── Auto-départ si fin de séjour prévu atteinte ───
  if (mission.dockStay && now >= mission.dockStay.endsAt) {
    // Déclencher le retour automatique (à l'heure de fin prévue)
    setTimeout(() => returnTankerFromDock(mission.id, mission.dockStay && mission.dockStay.endsAt), 100);
  }
}

// Choix de durée de séjour
function setDockStayDuration(missionId, durationKey) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  if (!mission || mission.status !== 'docked' || mission.dockStay) return;
  const cfg = DOCK_STAY_DURATIONS[durationKey];
  if (!cfg) return;
  const now = Date.now();
  mission.dockStay = {
    chosenDurationMs: cfg.ms,
    startedAt: now,
    endsAt: now + cfg.ms,
    label: cfg.label,
  };
  // D5.2 : tracker la visite du dock dans le Carnet
  if (typeof trackDockVisit === 'function' && mission.dock) {
    trackDockVisit(mission.dock, mission);
  }
  // D5.3 : possible génération d'un lead ambient (8-12% selon dock)
  if (typeof maybeGenerateAmbientLead === 'function' && mission.dock) {
    const ambientLead = maybeGenerateAmbientLead(mission.dock, mission);
    if (ambientLead && typeof toast === 'function') {
      setTimeout(() => toast('📍 Tu glanes une rumeur au comptoir...'), 600);
    }
  }
  if (typeof toast === 'function') {
    toast(`Séjour fixé : ${cfg.label}`);
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── D2 : Prolongation de séjour ───
// Le joueur peut prolonger le séjour à tout moment pour rajouter du temps.
// Cf. demande Adrien 18/05 : "pouvoir prolonger à la fin des 2h si je veux".
// Implémentation : ajoute la durée choisie au endsAt et étire le chosenDurationMs total.
// L'humeur continue à évoluer naturellement, mais le drift "fatigue >75%" se calcule
// par rapport à la NOUVELLE durée totale (le compteur se "détend").
function extendDockStay(missionId, durationKey) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  if (!mission || mission.status !== 'docked') return;
  if (!mission.dockStay) return;
  const cfg = DOCK_STAY_DURATIONS[durationKey];
  if (!cfg) return;

  // Étendre endsAt + chosenDurationMs (le ratio de progression se recalcule naturellement)
  mission.dockStay.endsAt += cfg.ms;
  mission.dockStay.chosenDurationMs += cfg.ms;

  // Petite récompense narrative : log dans le journal
  if (!Array.isArray(mission.dockJournal)) mission.dockJournal = [];
  mission.dockJournal.push({
    at: Date.now(),
    humor: _getHumorPalier(mission.crewMood?.humorScore || 0),
    physical: mission.crewMood?.physicalState || 'sobre',
    text: `Le capitaine a annoncé la prolongation du séjour de ${cfg.label}. L'équipage s'installe.`,
  });

  if (typeof toast === 'function') toast(`⏱ Séjour prolongé de ${cfg.label}`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Mapping état soûlerie (équipage joueur → PNJ) — miroir d'humeur (canon D4)
// Le PNJ a un offset déterministe (-1, 0, +1 cran) selon son tempérament
// Règle : l'invitation à boire peut pousser jusqu'à SAOUL mais JAMAIS jusqu'à CUVÉ
// (sinon offrir un verre punit le joueur — pas l'effet voulu).
function getNpcDrinkState(npc, mission) {
  if (!mission?.crewMood) return 'sobre';
  const playerState = mission.crewMood.physicalState || 'sobre';
  const stateOrder = ['sobre', 'emeche', 'saoul', 'cuve'];
  const playerIdx = stateOrder.indexOf(playerState);
  if (playerIdx === -1) return 'sobre';
  // Offset basé sur hash du nom : -1, 0, ou +1
  const hash = _hashStringDeterministic(npc.captain);
  const offset = (hash % 3) - 1;
  // Bonus "Inviter à boire" stocké sur l'interaction
  const drinkBonus = (mission.npcInteractions?.[npc.id]?.drinkBoost) || 0;

  // Avec drinkBonus actif : on plafonne à SAOUL (idx 2), pas CUVÉ.
  // Sans bonus : la mécanique miroir naturelle peut aller jusqu'à CUVÉ.
  const naturalIdx = Math.max(0, Math.min(3, playerIdx + offset));
  if (drinkBonus > 0) {
    const boostedIdx = Math.max(0, Math.min(2, naturalIdx + drinkBonus));
    return stateOrder[boostedIdx];
  }
  return stateOrder[naturalIdx];
}

// Compteur d'interactions par PNJ par séjour (canon : 1 par PNJ par séjour)
// Sauf 🍻 Inviter à boire qui se compte aussi (sinon abus)
function hasInteractedWithNpc(missionId, npcId) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  return !!mission?.npcInteractions?.[npcId]?.done;
}

function markNpcInteracted(missionId, npcId, verb) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  if (!mission) return;
  if (!mission.npcInteractions) mission.npcInteractions = {};
  if (!mission.npcInteractions[npcId]) mission.npcInteractions[npcId] = {};
  mission.npcInteractions[npcId].done = true;
  mission.npcInteractions[npcId].verb = verb;
  mission.npcInteractions[npcId].at = Date.now();
  // D5.2 : tracker dans le Carnet — pavillons rencontrés
  _trackPavillonEncounter(mission, npcId, verb);
}

// Pour 🍻 Inviter à boire : flag séparé, n'empêche pas une autre interaction "principale"
function applyDrinkBoost(missionId, npcId) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  if (!mission) return;
  if (!mission.npcInteractions) mission.npcInteractions = {};
  if (!mission.npcInteractions[npcId]) mission.npcInteractions[npcId] = {};
  mission.npcInteractions[npcId].drinkBoost = (mission.npcInteractions[npcId].drinkBoost || 0) + 1;
  mission.npcInteractions[npcId].drinkApplied = true;
  // D5.2 : tracker dans le Carnet — pavillons rencontrés (drink compte aussi)
  _trackPavillonEncounter(mission, npcId, 'drink');
}

function hasDrinkApplied(missionId, npcId) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  return !!mission?.npcInteractions?.[npcId]?.drinkApplied;
}

// ─── D5.2 : Carnet — tracking des pavillons rencontrés ───
// La "clé" d'un pavillon est son captainType + nom (un PNJ peut apparaître à plusieurs docks
// avec le même nom). On stocke par nom du capitaine pour cohérence narrative.
function _trackPavillonEncounter(mission, npcId, verb) {
  if (!mission?.dock) return;
  const npcs = (typeof getNpcMissionsAtDock === 'function') ? getNpcMissionsAtDock(mission.dock) : [];
  const npc = npcs.find(n => n.id === npcId);
  if (!npc) return;
  if (!G.encounteredPavillons) G.encounteredPavillons = {};
  const key = npc.captain; // nom comme clé (cohérence narrative)
  const entry = G.encounteredPavillons[key] || {
    captain: npc.captain,
    captainType: npc.captainType,
    bio: npc.bio,
    firstMet: Date.now(),
    interactions: [],
    docksMet: [],
  };
  entry.lastSeen = Date.now();
  entry.interactions.push({ verb, at: Date.now(), dockId: mission.dock.id, dockName: mission.dock.name });
  // Garder max 20 interactions historisées par pavillon
  if (entry.interactions.length > 20) entry.interactions.shift();
  // Ajouter dock unique
  if (!entry.docksMet.includes(mission.dock.id)) entry.docksMet.push(mission.dock.id);
  G.encounteredPavillons[key] = entry;
}

// ─── D5.2 : Carnet — tracking des docks visités ───
// Appelé quand un tanker s'amarre à un dock (dockStay start)
function trackDockVisit(dock, mission) {
  if (!dock) return;
  if (!G.visitedDocks) G.visitedDocks = {};
  const key = dock.id;
  const entry = G.visitedDocks[key] || {
    id: dock.id,
    name: dock.name,
    type: dock.type,
    sub: dock.sub,
    detail: dock.detail,
    firstVisit: Date.now(),
    visitCount: 0,
    pavillonsMet: [],
  };
  entry.lastVisit = Date.now();
  entry.visitCount += 1;
  G.visitedDocks[key] = entry;
}

// PUBLIC : Ouvre l'écran Carnet (depuis dashboard ou commerce)
function openCarnet(initialTab) {
  if (initialTab && CARNET_TABS.find(t => t.id === initialTab)) {
    _carnetActiveTab = initialTab;
  }
  if (typeof goto === 'function') {
    goto('carnet');
  }
  // Le rendu se fait via renderCarnetScreen appelé depuis le routeur
}

// PUBLIC : Rendu de l'écran Carnet (appelé à chaque entrée + à chaque switch d'onglet)
function renderCarnetScreen() {
  // D5.3 fix #5 : cleanup expirées à chaque ouverture du Carnet
  if (typeof cleanupExpiredLeads === 'function') cleanupExpiredLeads();
  if (typeof startLeadCleanupTicker === 'function') startLeadCleanupTicker();
  _renderCarnetTabs();
  _renderCarnetContent();
}

function _renderCarnetTabs() {
  const tabsEl = document.getElementById('carnet-tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = CARNET_TABS.map(t => {
    const isActive = _carnetActiveTab === t.id;
    const badge = _getCarnetBadge(t.id);
    return `
      <div onclick="switchCarnetTab('${t.id}')" style="
        flex:1 1 calc(33.333% - 6px);
        min-width:90px;
        padding:8px 10px;
        background:${isActive ? 'rgba(200,180,120,.10)' : 'rgba(255,255,255,.02)'};
        border:1px solid ${isActive ? 'rgba(200,180,120,.40)' : 'var(--border)'};
        border-radius:6px;
        cursor:pointer;
        white-space:nowrap;
        font-size:11px;
        color:${isActive ? '#c8b478' : 'var(--mut)'};
        letter-spacing:.05em;
        text-align:center;
        box-sizing:border-box;
      ">
        ${t.emoji} ${t.label}${badge ? ` <span style="opacity:.7;font-size:9px">· ${badge}</span>` : ''}
      </div>
    `;
  }).join('');
}

function _getCarnetBadge(tabId) {
  switch (tabId) {
    case 'pavillons': return Object.keys(G.encounteredPavillons || {}).length;
    case 'rumeurs':   return (G.rumorJournal || []).length;
    case 'infos':     return (G.purchasedIntel || []).length;
    case 'docks':     return Object.keys(G.visitedDocks || {}).length;
    case 'pistes':    return (G.openLeads || []).filter(l => l.status === 'open').length;
    default: return 0;
  }
}

// Switch d'onglet
function switchCarnetTab(tabId) {
  _carnetActiveTab = tabId;
  renderCarnetScreen();
}

// Rendu du contenu de l'onglet actif
function _renderCarnetContent() {
  const contentEl = document.getElementById('carnet-content');
  if (!contentEl) return;

  switch (_carnetActiveTab) {
    case 'pavillons': contentEl.innerHTML = _renderCarnetPavillons(); break;
    case 'rumeurs':   contentEl.innerHTML = _renderCarnetRumeurs(); break;
    case 'infos':     contentEl.innerHTML = _renderCarnetInfos(); break;
    case 'docks':     contentEl.innerHTML = _renderCarnetDocks(); break;
    case 'pistes':    contentEl.innerHTML = _renderCarnetPistes(); break;
    default: contentEl.innerHTML = '';
  }
}

// ─── Helpers de rendu communs ───

function _carnetEmptyState(emoji, message) {
  return `
    <div style="padding:36px 12px;text-align:center">
      <div style="font-size:32px;opacity:.4;margin-bottom:10px">${emoji}</div>
      <div style="font-size:12px;color:var(--mut);font-style:italic;line-height:1.6;font-family:'Charter',Georgia,serif">${message}</div>
    </div>
  `;
}

function _carnetRelativeTime(timestamp) {
  if (!timestamp) return 'jamais';
  const elapsed = Date.now() - timestamp;
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 7) return new Date(timestamp).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
  if (days > 0) return `il y a ${days}j`;
  if (hours > 0) return `il y a ${hours}h`;
  if (minutes > 0) return `il y a ${minutes}min`;
  return 'à l\'instant';
}

// ─── Onglet 🗺 Routes ───
function _renderCarnetRoutes() {
  const routes = G.routes || [];
  if (routes.length === 0) {
    return _carnetEmptyState('🗺', 'Aucune route établie. Lance ton premier tanker depuis la Maison de Commerce.');
  }

  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  for (const r of routes) {
    const mood = (typeof ROUTE_MOODS !== 'undefined') ? ROUTE_MOODS[r.moodKey] : null;
    const moodLabel = mood?.label || r.moodKey || 'route';
    const moodColor = mood?.accent || '#c8b478';
    const stab = Math.round(r.stability || 0);
    const passages = r.passages || 0;
    const lost = r.lost || 0;
    const know = r.knowledgeLevel || 0;
    const isAbandoned = r.status === 'abandoned';
    const isCollapsed = r.status === 'collapsed';
    const status = isAbandoned ? '· abandonnée' : isCollapsed ? '· effondrée' : '';
    const statusColor = isAbandoned || isCollapsed ? '#ff7878' : 'var(--mut)';

    html += `
      <div onclick="openRouteDetailFromCarnet('${r.id}')" style="
        padding:12px 14px;
        background:rgba(255,255,255,.02);
        border:1px solid var(--border);
        border-radius:8px;
        cursor:pointer
      ">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
          <div style="font-size:13px;color:#e6f0ff;font-weight:500">${r.name}</div>
          <div style="font-size:10px;color:${moodColor};font-style:italic">${moodLabel}</div>
        </div>
        <div style="display:flex;gap:14px;font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">
          <span>Stab. <span style="color:${stab >= 70 ? '#78c88c' : stab >= 40 ? '#ffc864' : '#ff7878'}">${stab}%</span></span>
          <span>Passages ${passages}</span>
          ${lost > 0 ? `<span style="color:#ff7878">Perdus ${lost}</span>` : ''}
          <span>Conn. ${know}/10 ${status ? `<span style="color:${statusColor}">${status}</span>` : ''}</span>
        </div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// Stub pour D5.1 — sera implémenté au prochain chunk
function openRouteDetailFromCarnet(routeId) {
  if (typeof toast === 'function') toast('🚧 Fiche route détaillée arrive en D5.1');
}

// ─── Onglet 🛸 Pavillons ───
function _renderCarnetPavillons() {
  const pavillons = Object.values(G.encounteredPavillons || {});
  if (pavillons.length === 0) {
    return _carnetEmptyState('🛸', 'Aucun pavillon rencontré. Aux comptoirs de quai, on croise des gens.');
  }

  // Trier par lastSeen DESC
  pavillons.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  for (const p of pavillons) {
    const interactionsList = p.interactions || [];
    const verbCounts = {};
    for (const i of interactionsList) {
      verbCounts[i.verb] = (verbCounts[i.verb] || 0) + 1;
    }
    const verbLabels = {
      exchange: '🤝 échange',
      info: '🗺 info',
      protection: '🛡 protection',
      rumor: '💬 rumeur',
      drink: '🍻 verre',
      sell: '📡 vente',
    };
    const recap = Object.entries(verbCounts).map(([v, n]) => {
      const lab = verbLabels[v] || v;
      return n > 1 ? `${lab} ×${n}` : lab;
    }).join(' · ') || 'rencontré';

    html += `
      <div style="
        padding:12px 14px;
        background:rgba(255,255,255,.02);
        border:1px solid var(--border);
        border-radius:8px
      ">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
          <div style="font-size:13px;color:#e6f0ff;font-weight:500">${p.captain}</div>
          <div style="font-size:9px;color:var(--mut)">${_carnetRelativeTime(p.lastSeen)}</div>
        </div>
        <div style="font-size:11px;color:var(--mut);font-style:italic;margin-bottom:6px;font-family:'Charter',Georgia,serif;line-height:1.45">${p.bio || ''}</div>
        <div style="font-size:10px;color:#c8b478;font-family:'SF Mono',monospace">${recap}</div>
        ${p.docksMet?.length > 0 ? `<div style="font-size:9px;color:var(--mut);margin-top:4px">Croisé à ${p.docksMet.length} dock${p.docksMet.length > 1 ? 's' : ''}</div>` : ''}
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// ─── Onglet 💬 Rumeurs ───
function _renderCarnetRumeurs() {
  const rumeurs = G.rumorJournal || [];
  if (rumeurs.length === 0) {
    return _carnetEmptyState('💬', 'Pas encore de rumeur consignée. Les comptoirs en regorgent — il suffit de demander.');
  }

  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  for (const r of rumeurs.slice(0, 50)) {
    const catColor = r.category === 'lore' ? '#7aaadc' : r.category === 'indice' ? '#c8b478' : '#ff7878';
    const catLabel = r.category === 'lore' ? 'Lore' : r.category === 'indice' ? 'Indice' : 'Mensonge ?';
    html += `
      <div style="
        padding:11px 13px;
        background:rgba(255,255,255,.02);
        border:1px solid var(--border);
        border-radius:8px
      ">
        <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:5px">
          <span style="color:${catColor};letter-spacing:.05em">${catLabel}</span>
          <span style="color:var(--mut)">${_carnetRelativeTime(r.at)}</span>
        </div>
        <div style="font-size:12px;color:#e6f0ff;font-style:italic;line-height:1.55;font-family:'Charter',Georgia,serif">«${r.text}»</div>
        <div style="font-size:9px;color:var(--mut);margin-top:5px">— ${r.captain}</div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// ─── Onglet 🗞 Infos ───
function _renderCarnetInfos() {
  const infos = G.purchasedIntel || [];
  if (infos.length === 0) {
    return _carnetEmptyState('🗞', 'Aucune info achetée. Certains parmi les pavillons ont des choses à vendre.');
  }

  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  for (const info of infos.slice(0, 30)) {
    const tierLabel = info.tier === 'banal' ? 'Banale' : info.tier === 'medium' ? 'Moyenne' : 'Rare';
    const tierColor = info.tier === 'rare' ? '#c8b478' : info.tier === 'medium' ? '#7aaadc' : 'var(--mut)';
    html += `
      <div style="
        padding:11px 13px;
        background:rgba(255,255,255,.02);
        border:1px solid var(--border);
        border-radius:8px
      ">
        <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:5px">
          <span style="color:${tierColor};letter-spacing:.05em">${tierLabel}</span>
          <span style="color:var(--mut)">${_carnetRelativeTime(info.at)}</span>
        </div>
        <div style="font-size:12px;color:#e6f0ff;line-height:1.55;font-family:'Charter',Georgia,serif">${info.text}</div>
        <div style="font-size:9px;color:var(--mut);margin-top:5px">— ${info.captain}</div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// ─── Onglet ⚓ Docks ───
function _renderCarnetDocks() {
  const docks = Object.values(G.visitedDocks || {});
  if (docks.length === 0) {
    return _carnetEmptyState('⚓', 'Aucun dock visité. Chaque tanker amarré ajoute son port à cette liste.');
  }

  docks.sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0));

  const DOCK_TYPE_LABELS = {
    asteroid_bar: 'Comptoir d\'astéroïdes',
    hidden_freeport: 'Port-franc dissimulé',
    pilgrim_stop: 'Halte de pèlerins',
    abandoned_station: 'Station orbitale abandonnée',
    derelict_carrier: 'Porte-vaisseaux désaffecté',
  };

  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  for (const d of docks) {
    const typeLabel = DOCK_TYPE_LABELS[d.type] || d.type;
    html += `
      <div style="
        padding:12px 14px;
        background:rgba(255,255,255,.02);
        border:1px solid var(--border);
        border-radius:8px
      ">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
          <div style="font-size:13px;color:#e6f0ff;font-weight:500">${d.name}</div>
          <div style="font-size:9px;color:var(--mut)">${d.visitCount} séjour${d.visitCount > 1 ? 's' : ''}</div>
        </div>
        <div style="font-size:10px;color:var(--mut);margin-bottom:5px">${typeLabel}</div>
        <div style="font-size:11px;color:var(--mut);font-style:italic;line-height:1.45;font-family:'Charter',Georgia,serif">${d.detail || ''}</div>
        <div style="font-size:9px;color:var(--mut);margin-top:6px">Dernier séjour : ${_carnetRelativeTime(d.lastVisit)}</div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// ─── Onglet 📍 Pistes (D5.3) ───
function _renderCarnetPistes() {
  const allLeads = G.openLeads || [];
  const openLeads = allLeads.filter(l => l.status === 'open');
  const exploringLeads = allLeads.filter(l => l.status === 'exploring');
  const resolvedLeads = allLeads.filter(l => l.status === 'resolved').slice(0, 10);

  if (allLeads.length === 0) {
    return _carnetEmptyState('📍', 'Aucune piste ouverte. Achète une info rare auprès d\'un pavillon, ou guette les rumeurs intéressantes. Certaines mènent quelque part.');
  }

  let html = '';

  // Section : pistes ouvertes (actionnables)
  if (openLeads.length > 0) {
    html += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;margin-top:4px">${openLeads.length} ouverte${openLeads.length > 1 ? 's' : ''} · 5 max</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">';
    for (const lead of openLeads) {
      const cfg = LEAD_TYPES[lead.type] || LEAD_TYPES.wreck;
      const sourceLabel = lead.source.captain
        ? `via ${lead.source.captain}`
        : lead.source.kind === 'ambient'
          ? 'glané au comptoir'
          : 'source anonyme';
      html += `
        <div onclick="openExplorationLauncher('${lead.id}')" style="
          padding:14px 16px;
          background:rgba(200,180,120,.04);
          border:1px solid ${cfg.color}44;
          border-radius:8px;
          cursor:pointer
        ">
          <div style="font-size:13px;color:${cfg.color};font-weight:500;margin-bottom:4px">${lead.title}</div>
          <div style="font-size:11px;color:var(--mut);font-style:italic;line-height:1.5;font-family:'Charter',Georgia,serif;margin-bottom:8px">${lead.description}</div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--mut);font-family:'SF Mono',monospace">
            <span>${lead.coords}</span>
            <span>${sourceLabel} · ${_carnetRelativeTime(lead.createdAt)}</span>
          </div>
          <div style="margin-top:8px;padding:6px 10px;background:rgba(200,180,120,.10);border-radius:5px;font-size:11px;color:${cfg.color};text-align:center;letter-spacing:.05em">
            → Lancer une exploration
          </div>
        </div>
      `;
    }
    html += '</div>';
  }

  // Section : en cours d'exploration
  if (exploringLeads.length > 0) {
    html += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;margin-top:4px">En exploration · ${exploringLeads.length}</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">';
    for (const lead of exploringLeads) {
      const cfg = LEAD_TYPES[lead.type] || LEAD_TYPES.wreck;
      const mission = (G.tankerMissions || []).find(m => m.id === lead.missionId);
      const remaining = mission ? Math.max(0, mission.returnArrivalAt - Date.now()) : 0;
      const remainStr = remaining > 0
        ? remaining > 60000 ? `${Math.ceil(remaining/60000)} min` : `${Math.ceil(remaining/1000)} s`
        : 'imminent';
      html += `
        <div style="padding:12px 14px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:8px;opacity:.85">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <div style="font-size:12px;color:${cfg.color}">${lead.title}</div>
            <div style="font-size:10px;color:#c8b478;font-family:'SF Mono',monospace">⏳ ${remainStr}</div>
          </div>
          <div style="font-size:10px;color:var(--mut);font-style:italic">${mission?.tankerName || 'Σ-?'} en route...</div>
        </div>
      `;
    }
    html += '</div>';
  }

  // Section : pistes résolues (historique)
  if (resolvedLeads.length > 0) {
    html += `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;margin-top:4px">Résolues · ${resolvedLeads.length}</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:6px">';
    for (const lead of resolvedLeads) {
      const result = lead.result;
      const isLieResult = result?.kind === 'lie';
      html += `
        <div style="padding:10px 12px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px;opacity:.65">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <div style="font-size:11px;color:var(--mut);text-decoration:${isLieResult ? 'line-through' : 'none'}">${lead.title}</div>
            <div style="font-size:9px;color:${isLieResult ? '#ff7878' : '#78c88c'}">${isLieResult ? 'Fausse piste' : 'Résolue'}</div>
          </div>
          <div style="font-size:9px;color:var(--mut)">${_carnetRelativeTime(lead.resolvedAt)}</div>
        </div>
      `;
    }
    html += '</div>';
  }

  return html;
}

// PUBLIC : génère une piste à partir d'une source (info achetée, rumeur, ambient)
// Retourne le lead créé, ou null si limite atteinte.
function generateLead(opts) {
  if (!opts) return null;
  const { type, source, captain, dockId, isLie } = opts;
  if (!type) return null;
  if (!G.openLeads) G.openLeads = [];
  // Limite : 5 pistes ouvertes max
  const openCount = G.openLeads.filter(l => l.status === 'open').length;
  if (openCount >= 5) return null;
  const titles = LEAD_TITLES[type] || ['Indice mystérieux'];
  const descs = LEAD_DESCRIPTIONS[type] || ['Coordonnées d\'un endroit inconnu.'];
  const cfg = LEAD_TYPES[type] || LEAD_TYPES.wreck;
  const coords = `Σ-${Math.floor(20 + Math.random() * 180)} / Q-${Math.floor(1 + Math.random() * 20)}`;
  const lead = {
    id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type,
    title: `${cfg.emoji} ${titles[Math.floor(Math.random() * titles.length)]}`,
    description: descs[Math.floor(Math.random() * descs.length)],
    coords,
    source: { kind: source || 'unknown', captain: captain || null, dockId: dockId || null },
    isLie: !!isLie,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000, // 7 jours
    status: 'open',
    result: null,
  };
  G.openLeads.unshift(lead);
  return lead;
}

// PUBLIC : Probabilité de générer un lead depuis une info achetée
// Le tier détermine la chance + le type
function maybeGenerateLeadFromIntel(intel, npc) {
  if (!intel || !npc) return null;
  const { tier } = intel;
  // Chance par tier
  const chance = tier === 'rare' ? 1 : tier === 'medium' ? 0.25 : 0;   // 29/10 (Adrien) : une info rare ouvre toujours une piste (elle peut mentir)
  if (Math.random() >= chance) return null;
  // Type pondéré par type de PNJ
  const type = _pickLeadTypeForNpcType(npc.captainType);
  // Crédibilité de la source : plus le PNJ est shady, plus il y a de chance de mensonge
  const lieChance = _getLieChanceForNpcType(npc.captainType);
  const isLie = Math.random() < lieChance;
  return generateLead({
    type,
    source: 'intel',
    captain: npc.captain,
    dockId: null,
    isLie,
  });
}

// PUBLIC : Probabilité de générer un lead depuis une rumeur
function maybeGenerateLeadFromRumor(rumor, npc) {
  if (!rumor || !npc) return null;
  const { category } = rumor;
  if (category === 'mensonge') {
    // Toujours une fausse piste si c'est un mensonge canon
    if (Math.random() < 0.4) {
      // Mais pas systématique — sinon trop de leads
      const type = _pickLeadTypeForNpcType(npc.captainType);
      return generateLead({
        type,
        source: 'rumor',
        captain: npc.captain,
        dockId: null,
        isLie: true,
      });
    }
    return null;
  }
  if (category === 'indice') {
    if (Math.random() < 0.15) {
      const type = _pickLeadTypeForNpcType(npc.captainType);
      const lieChance = _getLieChanceForNpcType(npc.captainType);
      return generateLead({
        type,
        source: 'rumor',
        captain: npc.captain,
        dockId: null,
        isLie: Math.random() < lieChance,
      });
    }
  }
  return null;
}

// PUBLIC : Possible génération d'un lead ambient au début d'un séjour au dock
// (canon : 8-12% chance selon type de dock)
function maybeGenerateAmbientLead(dock, mission) {
  if (!dock) return null;
  if (!G.openLeads) G.openLeads = [];
  // Une seule ambient par séjour
  if (mission?._ambientLeadGenerated) return null;
  const chanceByDock = {
    asteroid_bar: 0.10,
    hidden_freeport: 0.15,
    pilgrim_stop: 0.05,
    abandoned_station: 0.10,
    derelict_carrier: 0.12,
  };
  const chance = chanceByDock[dock.type] || 0.08;
  if (Math.random() >= chance) return null;
  // Type pondéré par type de dock
  const typeByDock = {
    asteroid_bar: 'dock_coords',
    hidden_freeport: 'dock_coords',
    pilgrim_stop: 'wreck',
    abandoned_station: 'wreck',
    derelict_carrier: 'wreck',
  };
  const type = typeByDock[dock.type] || 'wreck';
  // Ambient : 25% de mensonge (sources anonymes)
  const isLie = Math.random() < 0.25;
  if (mission) mission._ambientLeadGenerated = true;
  return generateLead({
    type,
    source: 'ambient',
    captain: null,
    dockId: dock.id,
    isLie,
  });
}

function _pickLeadTypeForNpcType(captainType) {
  // Pondération par type
  const weights = {
    raider:   { wreck: 70, dock_coords: 10, wanted_target: 20 },
    merchant: { wreck: 40, dock_coords: 50, wanted_target: 10 },
    imperial: { wreck: 20, dock_coords: 30, wanted_target: 50 },
    smuggler: { wreck: 30, dock_coords: 60, wanted_target: 10 },
    convoy:   { wreck: 60, dock_coords: 30, wanted_target: 10 },
    guildist: { wreck: 30, dock_coords: 60, wanted_target: 10 },
    noble:    { wreck: 20, dock_coords: 20, wanted_target: 60 },
    veteran:  { wreck: 40, dock_coords: 30, wanted_target: 30 },
    unknown:  { wreck: 40, dock_coords: 40, wanted_target: 20 },
    officer:  { wreck: 20, dock_coords: 30, wanted_target: 50 },
    pirate:   { wreck: 60, dock_coords: 30, wanted_target: 10 },
  };
  const w = weights[captainType] || weights.unknown;
  const total = w.wreck + w.dock_coords + w.wanted_target;
  let r = Math.random() * total;
  if ((r -= w.wreck) < 0) return 'wreck';
  if ((r -= w.dock_coords) < 0) return 'dock_coords';
  return 'wanted_target';
}

function _getLieChanceForNpcType(captainType) {
  const lies = {
    imperial: 0.05,
    officer:  0.05,
    veteran:  0.10,
    merchant: 0.15,
    guildist: 0.10,
    convoy:   0.15,
    smuggler: 0.30,
    noble:    0.20,
    unknown:  0.40,
    raider:   0.35,
    pirate:   0.45,
  };
  return lies[captainType] || 0.25;
}

// PUBLIC : Lance une exploration d'une piste avec un tanker
function launchExplorationOnLead(leadId, tierKey) {
  const lead = (G.openLeads || []).find(l => l.id === leadId);
  if (!lead || lead.status !== 'open') {
    if (typeof toast === 'function') toast('Piste introuvable');
    return null;
  }
  const tier = parseInt(String(tierKey).replace('t', ''), 10);
  const tierCfg = TANKER_TIER_CONFIG[tier];
  if (!tierCfg) {
    if (typeof toast === 'function') toast('Tier de tanker invalide');
    return null;
  }
  const stat = G.fleet?.stationed?.tanker || {};
  const tierStock = stat['t' + tier] || 0;
  const inMission = (G.tankerMissions || []).filter(m =>
    ['in_transit', 'docked', 'returning', 'exploring'].includes(m.status)
    && m.tier === tier
  ).length;
  if (tankerAvailability(tier) <= 0) {
    if (typeof toast === 'function') toast(`Aucun tanker T${tier} disponible`);
    return null;
  }
  // Coût carburant selon tier
  const fuelCost = { 1: 50, 2: 100, 3: 200 }[tier] || 50;
  if ((G.fuel || 0) < fuelCost) {
    if (typeof toast === 'function') toast(`Carburant insuffisant (${fuelCost})`);
    return null;
  }
  G.fuel -= fuelCost;
  // Durée 5-10 min (cohérent avec routes V1)
  const TEST_MIN_MS = 5 * 60 * 1000;
  const TEST_MAX_MS = 10 * 60 * 1000;
  const durationMs = TEST_MIN_MS + Math.random() * (TEST_MAX_MS - TEST_MIN_MS);
  const now = Date.now();
  const mission = {
    id: 'tm-' + now + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: 'Σ-' + Math.floor(Math.random() * 99 + 1),
    kind: 'exploration',
    tier,
    leadId,
    leadTitle: lead.title,
    leadType: lead.type,
    leadCoords: lead.coords,
    isLie: lead.isLie,
    fuelCost,
    departedAt: now,
    arrivalAt: now + durationMs,
    returnArrivalAt: now + durationMs * 2, // aller + retour
    status: 'exploring',
    targetCoords: lead.coords,
    targetLabel: lead.title,
  };
  if (!G.tankerMissions) G.tankerMissions = [];
  G.tankerMissions.push(sbTagWorld(mission));
  lead.status = 'exploring';
  lead.missionId = mission.id;
  // D5.3 fix : démarrer le countdown ticker pour que la Flotte se rafraîchisse
  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  if (typeof toast === 'function') {
    toast(`${mission.tankerName} part explorer ${lead.coords} · -${fuelCost} carburant`);
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return mission;
}

// Handler appelé par tickTankerMissions quand un tanker exploration arrive sur site
function handleExplorationArrival(mission) {
  // Le tanker arrive sur le lieu. On démarre directement le retour.
  // (V1 simple : pas de séjour, juste un aller-retour avec résolution)
  mission.status = 'returning';
}

// Handler appelé quand un tanker exploration revient à la planète
function completeExplorationReturn(missionId) {
  const idx = (G.tankerMissions || []).findIndex(m => m.id === missionId);
  if (idx === -1) return null;
  const mission = G.tankerMissions[idx];
  const lead = (G.openLeads || []).find(l => l.id === mission.leadId);
  if (!lead) {
    G.tankerMissions.splice(idx, 1);
    return null;
  }

  let result;
  if (mission.isLie) {
    // Fausse piste : tanker rentre cale vide + parfois embuscade légère
    const ambush = Math.random() < 0.20;
    result = {
      kind: 'lie',
      ambush,
      narrative: ambush
        ? `${mission.tankerName} a perdu 4h sur de fausses coordonnées, puis une patrouille suspecte les a poursuivis sur le retour. Pas de butin. La rumeur était fausse.`
        : `${mission.tankerName} est arrivé aux coordonnées indiquées. Personne. Rien. Une dérive de débris vieille de plusieurs cycles. La piste était fausse.`,
    };
  } else if (lead.type === 'wreck') {
    // Loot épave selon tier
    const mult = { 1: 1, 2: 2.5, 3: 5 }[mission.tier] || 1;
    const metal = Math.round((200 + Math.random() * 300) * mult);
    const energy = Math.round((100 + Math.random() * 200) * mult);
    const cristal = Math.round((50 + Math.random() * 100) * mult);
    // Appliquer aux ressources planète (sécurité : check existence des res)
    if (G.res) {
      if (G.res.metal) G.res.metal.v = Math.min(G.res.metal.max, (G.res.metal.v || 0) + metal);
      if (G.res.energie) G.res.energie.v = Math.min(G.res.energie.max, (G.res.energie.v || 0) + energy);
      if (G.res.cristal) G.res.cristal.v = Math.min(G.res.cristal.max, (G.res.cristal.v || 0) + cristal);
    }
    result = {
      kind: 'wreck_success',
      loot: { metal, energie: energy, cristal },
      narrative: `${mission.tankerName} a localisé l'épave. La cale était bien là, à peine touchée. L'équipage a tout transbordé. Retour avec ${metal} métal, ${energy} énergie, ${cristal} cristal.`,
    };
  } else if (lead.type === 'dock_coords') {
    // Ajouter un nouveau dock au pool des docks découverts
    if (!G.discoveredDocks) G.discoveredDocks = [];
    // 03/11 (Adrien) : une info achetée doit mener quelque part. Le dock révélé est un VRAI lieu caché du réseau des lignes
    // (pas encore connu), le plus proche de chez soi : il entre sur la carte et sa route s'ouvre au Commerce, comme s'il avait
    // été remonté à la balise. L'ancien tirage de noms ne sert plus que s'il ne reste aucun lieu à découvrir.
    const port = sbPickPortForLead(lead);
    let newDock, newDockName;
    if (port) {
      newDockName = port.name;
      newDock = { id: port.dockId, name: port.name, type: port.type, sub: port.typeLabel || (port.type === 'asteroid_bar' ? 'Comptoir d\'astéroïdes' : 'Port-franc dissimulé'),
        detail: 'Découvert par tes explorations. N\'apparaît pas sur les cartes officielles.', discovered: true, portSys: port.sys, usedAsRouteDock: true };
      if (port.dockId === REFUGE_DOCK_ID) _crownDock(newDock);
      try { SBLines.discoverPort(port.sys, Date.now()); } catch (e) {}
    } else {
      const newDockTypes = ['hidden_freeport', 'asteroid_bar'];
      const newDockType = newDockTypes[Math.floor(Math.random() * newDockTypes.length)];
      const newDockNames = {
        hidden_freeport: ['Le Port d\'Ahar', 'Le Refuge de Brest', 'L\'Anse de Vol-Noir', 'Le Passage Cieux-Gris'],
        asteroid_bar: ['Le Comptoir d\'Ihor', 'L\'Astéroïde Suspendu', 'La Halte des Trois-Souffles'],
      };
      const namesPool = newDockNames[newDockType] || ['Dock découvert'];
      newDockName = namesPool[Math.floor(Math.random() * namesPool.length)];
      newDock = {
        id: 'discovered_dock_' + Date.now(),
        name: newDockName,
        type: newDockType,
        sub: newDockType === 'hidden_freeport' ? 'Port-franc dissimulé' : 'Comptoir d\'astéroïdes',
        detail: 'Découvert par tes explorations. N\'apparaît pas sur les cartes officielles.',
        discovered: true,
      };
      if (newDockName === 'Le Refuge de Brest') { sbBrestFromLead(newDock); newDock.portSys = sbBrestPortSys() || undefined; }   // PATCH_1910_BREST
    }
    G.discoveredDocks.push(newDock);
    if (window.SBMP && window.SBMP.ready()) window.SBMP.reportEvent('rare_discovery', 'un dock secret');   // RUMORS_1110
    result = {
      kind: 'dock_success',
      newDock,
      portSys: newDock.portSys || null,
      narrative: newDock.portSys
        ? `${mission.tankerName} a confirmé l'existence de ${newDockName}, en ${newDock.portSys}. ${newDock.sub}. Le lieu est maintenant sur ta carte et sa route est ouverte au Commerce : tes tankers peuvent s'y rendre.`
        : `${mission.tankerName} a confirmé l'existence de ${newDockName}. ${newDock.sub}. Ce dock est désormais disponible pour tes prochaines routes.`,
    };
  } else if (lead.type === 'wanted_target') {
    // V1 : juste un flag pour Phase 4
    if (!G.wantedTargets) G.wantedTargets = [];
    G.wantedTargets.push({ leadId: lead.id, coords: lead.coords, foundAt: Date.now() });
    result = {
      kind: 'wanted_success',
      narrative: `${mission.tankerName} a localisé la cible aux coordonnées indiquées. Position notée et archivée. Tu pourras agir dessus quand le piratage sera ouvert (Phase 4).`,
    };
  } else {
    result = { kind: 'unknown', narrative: 'Le tanker est rentré. Rapport inconnu.' };
  }

  // Marquer le lead résolu
  lead.status = 'resolved';
  lead.result = result;
  lead.resolvedAt = Date.now();

  // Stocker rapport d'exploration dans la liste des rapports tankers
  if (!G.tankerReports) G.tankerReports = [];
  // D5.3 fix : utiliser le même format que les autres rapports tanker (createdAt + targetCoords)
  // pour que renderTankerReportRow puisse l'afficher correctement.
  const loot = (result.kind === 'wreck_success' && result.loot)
    ? { resources: result.loot }
    : { resources: {} };
  G.tankerReports.unshift({
    id: 'rep-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    kind: 'exploration',
    tankerName: mission.tankerName,
    tier: mission.tier,
    leadTitle: mission.leadTitle,
    leadType: mission.leadType,
    leadCoords: mission.leadCoords,
    isLie: mission.isLie,
    isLost: false, // exploration ne perd pas le tanker (V1 simple)
    targetCoords: (result && result.portSys) || mission.leadCoords,   // 03/11 : un dock découvert = le système du port, pas l'indice de départ
    targetLabel: mission.leadTitle,
    result,
    loot,
    narrative: result.narrative,
    createdAt: Date.now(),
    at: Date.now(), // garde aussi 'at' pour compat
    read: false,
  });

  // Retirer mission
  G.tankerMissions.splice(idx, 1);

  if (typeof toast === 'function') {
    if (result.kind === 'lie') {
      toast(`💨 ${mission.tankerName} rentre bredouille — fausse piste`);
    } else if (result.kind === 'wreck_success' && result.loot) {
      const parts = [];
      const r = result.loot;
      if (r.metal > 0) parts.push(`+${r.metal} métal`);
      if (r.energie > 0) parts.push(`+${r.energie} énergie`);
      if (r.cristal > 0) parts.push(`+${r.cristal} cristal`);
      toast(`💎 ${mission.tankerName} de retour · ${parts.join(' · ')}`);
    } else if (result.kind === 'dock_success' && result.newDock) {
      toast(`🗺 ${mission.tankerName} a découvert ${result.newDock.name} !`);
    } else if (result.kind === 'wanted_success') {
      toast(`🎯 ${mission.tankerName} a localisé la cible`);
    } else {
      toast(`${mission.tankerName} de retour d'exploration`);
    }
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return result;
}
function openExplorationLauncher(leadId) {
  _explorationLeadId = leadId;
  _renderExplorationLauncher();
}

// D5.3 fix #5 (18/05) : Nettoyage périodique des pistes
// - Pistes ouvertes expirées (createdAt + 7j) → supprimées
// - Pistes résolues anciennes (resolvedAt + 14j) → supprimées
// Appelé au boot, au démarrage du Carnet, et toutes les 5 minutes pendant le jeu.
function cleanupExpiredLeads() {
  if (!Array.isArray(G.openLeads)) return 0;
  const now = Date.now();
  const EXPIRE_MS = 7 * 24 * 3600 * 1000;     // 7 jours
  const RESOLVED_KEEP_MS = 14 * 24 * 3600 * 1000; // 14 jours
  const before = G.openLeads.length;
  G.openLeads = G.openLeads.filter(l => {
    if (l.status === 'open') {
      const created = l.createdAt || 0;
      if (created + EXPIRE_MS < now) return false; // expirée
      return true;
    }
    if (l.status === 'resolved') {
      const resolved = l.resolvedAt || l.createdAt || 0;
      if (resolved + RESOLVED_KEEP_MS < now) return false;
      return true;
    }
    // status === 'exploring' → toujours garder
    return true;
  });
  return before - G.openLeads.length;
}
function startLeadCleanupTicker() {
  if (_leadCleanupInterval) return;
  _leadCleanupInterval = setInterval(() => {
    cleanupExpiredLeads();
  }, 5 * 60 * 1000);
}

function closeExplorationLauncher() {
  _explorationLeadId = null;
  const modal = document.getElementById('exploration-launcher-modal');
  if (modal) modal.remove();
}

function _renderExplorationLauncher() {
  const existing = document.getElementById('exploration-launcher-modal');
  if (existing) existing.remove();
  const lead = (G.openLeads || []).find(l => l.id === _explorationLeadId);
  if (!lead) return;

  const modal = document.createElement('div');
  modal.id = 'exploration-launcher-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:flex-end;justify-content:center';
  modal.onclick = (e) => { if (e.target === modal) closeExplorationLauncher(); };
  document.body.appendChild(modal);

  const cfg = LEAD_TYPES[lead.type] || LEAD_TYPES.wreck;
  const stat = G.fleet?.stationed?.tanker || { t1:0, t2:0, t3:0 };
  const inMission = (G.tankerMissions || []).filter(m =>
    ['in_transit', 'docked', 'returning', 'exploring'].includes(m.status)
  );
  const availableByTier = (t) => (stat['t' + t] || 0) - inMission.filter(m => m.tier === t && !m.bmEnvoy).length;

  const tierButtons = [1, 2, 3].map(t => {
    const avail = availableByTier(t);
    const fuelCost = { 1: 50, 2: 100, 3: 200 }[t];
    const canAfford = (G.fuel || 0) >= fuelCost;
    const disabled = avail <= 0 || !canAfford;
    const reason = avail <= 0 ? 'Aucun dispo' : !canAfford ? `Manque carburant (${fuelCost})` : '';
    const lootHint = lead.type === 'wreck' ? `~${Math.round((300 * (t === 1 ? 1 : t === 2 ? 2.5 : 5)))} ressources` : lead.type === 'dock_coords' ? 'Découvre un dock' : 'Localise la cible';
    return `
      <div ${disabled ? '' : `onclick="confirmLaunchExploration('t${t}')"`} style="
        padding:14px 16px;
        background:${disabled ? 'rgba(255,255,255,.02)' : 'rgba(200,180,120,.06)'};
        border:1px solid ${disabled ? 'var(--border)' : 'rgba(200,180,120,.30)'};
        border-radius:8px;
        cursor:${disabled ? 'not-allowed' : 'pointer'};
        margin-bottom:8px
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-size:13px;color:${disabled ? 'var(--mut)' : '#c8b478'};font-weight:500">Tanker T${t} · ${fuelCost} carburant</div>
          <div style="font-size:10px;color:${avail > 0 ? '#78c88c' : '#ff7878'}">${avail} dispo</div>
        </div>
        <div style="font-size:10px;color:var(--mut);font-style:italic">${disabled ? reason : lootHint}</div>
      </div>
    `;
  }).join('');

  // D5.3 fix #7 : Crédibilité visible
  // Calcule l'indicateur de fiabilité selon le type de source.
  let credibilityHtml = '';
  if (lead.source.kind === 'intel' || lead.source.kind === 'rumor') {
    // Trouver le PNJ pour obtenir son type
    const captainName = lead.source.captain;
    let captainType = null;
    if (captainName && Array.isArray(NPC_CAPTAINS)) {
      const found = NPC_CAPTAINS.find(c => c.name === captainName);
      if (found) captainType = found.type;
    }
    const lieChance = captainType ? _getLieChanceForNpcType(captainType) : 0.25;
    let label, color, advice;
    if (lieChance <= 0.10) {
      label = 'Source très fiable';
      color = '#78c88c';
      advice = `${captainName || 'La source'} ne se trompe presque jamais.`;
    } else if (lieChance <= 0.20) {
      label = 'Source fiable';
      color = '#7aaadc';
      advice = `${captainName || 'La source'} est généralement crédible.`;
    } else if (lieChance <= 0.30) {
      label = 'Source moyenne';
      color = '#ffc864';
      advice = `${captainName || 'La source'} est honnête, parfois mal informé.`;
    } else if (lieChance <= 0.40) {
      label = 'Source douteuse';
      color = '#ff9c64';
      advice = `${captainName || 'La source'} a déjà raconté n'importe quoi par le passé.`;
    } else {
      label = 'Source très douteuse';
      color = '#ff7878';
      advice = `${captainName || 'La source'} ment souvent. À tes risques.`;
    }
    credibilityHtml = `
      <div style="padding:10px 12px;background:rgba(255,255,255,.02);border:1px solid ${color}44;border-radius:6px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Crédibilité</span>
          <span style="font-size:12px;color:${color};font-weight:500">${label}</span>
        </div>
        <div style="font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">${advice}</div>
      </div>
    `;
  } else if (lead.source.kind === 'ambient') {
    credibilityHtml = `
      <div style="padding:10px 12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,200,100,.25);border-radius:6px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Crédibilité</span>
          <span style="font-size:12px;color:#ffc864;font-weight:500">Glanée au comptoir</span>
        </div>
        <div style="font-size:10px;color:var(--mut);font-style:italic;line-height:1.5">Une rumeur attrapée au passage. Aucune source identifiée — fiabilité incertaine.</div>
      </div>
    `;
  }

  modal.innerHTML = `
    <div style="background:var(--bg);width:100%;max-width:480px;border-top:1px solid var(--border);border-radius:14px 14px 0 0;padding:20px 18px 24px;max-height:90vh;overflow-y:auto;box-shadow:0 -20px 60px rgba(0,0,0,.5)">
      <div style="width:36px;height:3px;background:var(--mut);border-radius:2px;margin:0 auto 16px;opacity:.5"></div>
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px">
        <div style="flex:1;min-width:0">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">Exploration</div>
          <div style="font-size:16px;color:#e6f0ff;font-weight:600;margin-top:2px">${lead.title}</div>
        </div>
        <div onclick="closeExplorationLauncher()" style="cursor:pointer;width:32px;height:32px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:14px">×</div>
      </div>
      <div style="font-size:12px;color:var(--mut);font-style:italic;line-height:1.65;margin-bottom:12px;font-family:'Charter',Georgia,serif">${lead.description}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:8px 12px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px;margin-bottom:14px">
        <span style="color:var(--mut)">Coordonnées</span>
        <span style="color:${cfg.color};font-family:'SF Mono',monospace">${lead.coords}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:8px 12px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px;margin-bottom:14px">
        <span style="color:var(--mut)">Source</span>
        <span style="color:#e6f0ff">${lead.source.captain || (lead.source.kind === 'ambient' ? 'Au comptoir' : 'Anonyme')}</span>
      </div>
      ${credibilityHtml}
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Choisir un tanker</div>
      ${tierButtons}
      <button onclick="closeExplorationLauncher()" style="margin-top:14px;width:100%;padding:11px;background:transparent;border:1px solid var(--border);color:var(--mut);border-radius:6px;font-family:inherit;font-size:12px;letter-spacing:.08em;cursor:pointer">ANNULER</button>
    </div>
  `;
}

function confirmLaunchExploration(tierKey) {
  if (!_explorationLeadId) return;
  const m = launchExplorationOnLead(_explorationLeadId, tierKey);
  if (m) {
    closeExplorationLauncher();
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  }
}

// Calcule un modifier de prix selon état physique du PNJ (canon GDD)
function getNpcPriceMultiplier(drinkState) {
  switch (drinkState) {
    case 'sobre':  return { mult: 1.0, variance: 0 };
    case 'emeche': return { mult: 1.0 + (Math.random() - 0.5) * 0.30, variance: 0.15 };
    case 'saoul':  return { mult: 1.0 + (Math.random() - 0.5) * 0.80, variance: 0.40 };
    case 'cuve':   return { mult: 1.0, variance: 0 }; // refuse de toute façon
    default: return { mult: 1.0, variance: 0 };
  }
}

// Modifier de prix selon type de dock (canon GDD)
function getDockPriceMultiplier(dockType) {
  switch (dockType) {
    case 'asteroid_bar':     return 1.00;
    case 'hidden_freeport':  return 0.90;
    case 'pilgrim_stop':     return 1.20;
    case 'abandoned_station':return 1.00;
    case 'derelict_carrier': return 0.95;
    default: return 1.00;
  }
}

// Deals d'échange proposés par type de PNJ (canon D4)
// Format : { give: {res, qty}, want: {res, qty}, message }
function getNpcExchangeDeal(npc, drinkState) {
  // Variation déterministe selon hash du NPC pour qu'un même PNJ propose le même deal pendant un séjour
  const hash = _hashStringDeterministic(npc.captain);
  const variance = drinkState === 'saoul' ? 0.6 : drinkState === 'emeche' ? 0.85 : 1.0;
  const dealsByType = {
    raider: [
      { give: { res: 'metal', qty: Math.round(40 * variance) },   want: { res: 'energy', qty: 70 },  msg: 'Du métal de pillage. Frais.' },
      { give: { res: 'energy', qty: Math.round(50 * variance) },  want: { res: 'cristal', qty: 30 }, msg: 'De l\'énergie volée. Question pas.' },
    ],
    merchant: [
      { give: { res: 'metal', qty: Math.round(100 * variance) },  want: { res: 'cristal', qty: 50 }, msg: '100 métal contre 50 cristal. Marché juste.' },
      { give: { res: 'cristal', qty: Math.round(40 * variance) }, want: { res: 'energy', qty: 80 }, msg: 'Cristal pur contre énergie. Vous gagnez.' },
    ],
    imperial: [
      { give: { res: 'cristal', qty: Math.round(60 * variance) }, want: { res: 'energy', qty: 90 },  msg: 'Cristal certifié. Documents en règle.' },
      { give: { res: 'metal', qty: Math.round(80 * variance) },   want: { res: 'cristal', qty: 40 }, msg: 'Surplus de la flotte. À prix d\'État.' },
    ],
    smuggler: [
      { give: { res: 'cristal', qty: Math.round(80 * variance) }, want: { res: 'energy', qty: 60 },  msg: 'Cristal "sans questions". Prix discret.' },
      { give: { res: 'energy', qty: Math.round(120 * variance) }, want: { res: 'metal', qty: 80 },   msg: 'De l\'énergie qui ne sera pas tracée.' },
    ],
    convoy: [
      { give: { res: 'metal', qty: Math.round(50 * variance) },   want: { res: 'energy', qty: 50 },  msg: 'Échange simple. Pas de surprises.' },
      { give: { res: 'energy', qty: Math.round(50 * variance) },  want: { res: 'metal', qty: 50 },   msg: 'Échange honnête entre convoyeurs.' },
    ],
    guildist: [
      { give: { res: 'cristal', qty: Math.round(30 * variance) }, want: { res: 'metal', qty: 100 },  msg: 'Tarif officiel de la Guilde. Pas de négociation.' },
    ],
    noble: [],
    veteran: [
      { give: { res: 'energy', qty: Math.round(70 * variance) },  want: { res: 'metal', qty: 60 },   msg: 'Un échange de vieux. Comme avant.' },
    ],
    unknown: [
      { give: { res: 'cristal', qty: Math.round(20 * variance) }, want: { res: 'energy', qty: 100 }, msg: 'Cristal rare. Source... privée.' },
      { give: { res: 'metal', qty: Math.round(150 * variance) },  want: { res: 'cristal', qty: 30 }, msg: 'Beaucoup de métal contre peu de cristal. Étrange ?' },
    ],
    officer: [],
    pirate: [],
  };
  const deals = dealsByType[npc.captainType] || [];
  if (deals.length === 0) return null;
  return deals[hash % deals.length];
}

// Tiers de protection par type de PNJ (canon D4)
function getNpcProtectionTiers(npc) {
  const tiers = [];
  if (['imperial', 'officer'].includes(npc.captainType)) {
    tiers.push({ id: 'seal', label: 'Sceau de neutralité', cost: 500, reduction: 1.0, desc: 'Aucune perte possible · authentifié par l\'Empire' });
  }
  if (['smuggler', 'pirate'].includes(npc.captainType)) {
    tiers.push({ id: 'armed', label: 'Convoi armé discret', cost: 200, reduction: 0.30, desc: '−30% risque · pas de questions' });
  }
  if (['imperial', 'guildist'].includes(npc.captainType)) {
    tiers.push({ id: 'light', label: 'Escorte légère', cost: 50, reduction: 0.10, desc: '−10% risque · une silhouette dans ton sillage' });
  }
  return tiers;
}

// Tiers d'infos achetables (canon D4)
function getNpcInfoTiers(npc, drinkState) {
  const priceMult = getNpcPriceMultiplier(drinkState).mult;
  const tiers = [];
  // AUDIT_1110 — prix stables pour un même PNJ (affiché = débité)
  const _r = (id) => _makeSeededRandom(_hashStringDeterministic(npc.id + ':' + id))();
  // Banal : toujours dispo
  tiers.push({
    id: 'banal',
    label: 'Info banale',
    cost: Math.round((10 + _r('banal') * 20) * priceMult),
    desc: 'Un autre convoi, un dock voisin, son origine',
  });
  // Moyen : dispo si comportement info >= 'cond'
  const behavior = NPC_BEHAVIORS[npc.captainType] || NPC_BEHAVIORS.unknown;
  if (['yes', 'cond', 'rare'].includes(behavior.info)) {
    tiers.push({
      id: 'medium',
      label: 'Info moyenne',
      cost: Math.round((50 + _r('medium') * 100) * priceMult),
      desc: 'Stabilité d\'une de tes routes, ou une route inconnue',
    });
  }
  // Rare : dispo si info === 'yes' ou 'rare'
  if (['yes', 'rare'].includes(behavior.info)) {
    tiers.push({
      id: 'rare',
      label: 'Info rare',
      cost: Math.round((300 + _r('rare') * 700) * priceMult),
      desc: 'Un secret, et toujours une piste à explorer (le capitaine peut mentir)',
    });
  }
  return tiers;
}

// Génère la liste de tankers PNJ amarrés à un dock, déterministe par dock + jour.
// Cache via mission.dock pour éviter de recalculer à chaque render.
function getNpcMissionsAtDock(dock, atMs) {
  if (!dock) return [];
  // Granularité jour : tous les jours, le dock se renouvelle naturellement
  const dayBucket = Math.floor((atMs || Date.now()) / (24 * 60 * 60 * 1000));
  const seed = _hashStringDeterministic((dock.id || dock.name || 'dock') + ':' + dayBucket);
  const rng = _makeSeededRandom(seed);

  // 0 à 4 PNJ (biais selon type dock — un Bar a plus de monde qu'une Halte)
  const dockType = dock.type;
  const minMax = {
    asteroid_bar:      [2, 4],
    derelict_carrier:  [1, 3],
    abandoned_station: [1, 3],
    hidden_freeport:   [1, 4],
    pilgrim_stop:      [0, 2],
  }[dockType] || [1, 3];
  const count = minMax[0] + Math.floor(rng() * (minMax[1] - minMax[0] + 1));

  const npcs = [];
  const usedCaptains = new Set();
  for (let i = 0; i < count; i++) {
    // Pioche un capitaine sans répétition
    let captain;
    for (let attempt = 0; attempt < 20; attempt++) {
      const c = NPC_CAPTAINS[Math.floor(rng() * NPC_CAPTAINS.length)];
      if (!usedCaptains.has(c.name)) {
        captain = c;
        usedCaptains.add(c.name);
        break;
      }
    }
    if (!captain) break;

    const origin = NPC_ORIGINS[Math.floor(rng() * NPC_ORIGINS.length)];
    const cargo  = NPC_CARGO_HINTS[Math.floor(rng() * NPC_CARGO_HINTS.length)];
    const status = NPC_STATUSES[Math.floor(rng() * NPC_STATUSES.length)];
    // Numéro de tanker procédural (00-99)
    const tankerNum = Math.floor(rng() * 99).toString().padStart(2, '0');

    npcs.push({
      id: `npc-${dock.id || dock.name}-${dayBucket}-${i}`,
      captain: captain.name,
      captainType: captain.type,
      bio: captain.bio,
      tankerName: `Σ-${tankerNum}`,
      origin,
      cargo,
      status,
    });
  }
  return npcs;
}
function openNpcSheet(npcId) {
  // Cherche dans le dock courant
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (!mission?.dock) return;
  const npcs = getNpcMissionsAtDock(mission.dock);
  const npc = npcs.find(n => n.id === npcId);
  if (!npc) return;
  _activeNpcId = npcId;
  _renderNpcSheet(npc);
}

function _renderNpcSheet(npc) {
  // Toujours SUPPRIMER l'ancien modal et le RECRÉER (évite états zombies de style/visibilité)
  // Bug 18/05 : le réutilisation du même div causait des problèmes de fond transparent.
  const existing = document.getElementById('npc-sheet-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'npc-sheet-modal';
  // Style appliqué explicitement à la création — fond opaque + blur pour isolation forte
  modal.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'bottom:0',
    'background:rgba(0,0,0,.85)',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
    'z-index:99999',
    'display:flex',
    'align-items:flex-end',
    'justify-content:center',
    'padding:0',
    'margin:0',
  ].join(';') + ';';
  modal.onclick = (e) => { if (e.target === modal) closeNpcSheet(); };
  document.body.appendChild(modal);

  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  const dock = mission?.dock || {};
  const npcDrinkState = getNpcDrinkState(npc, mission);
  const behavior = NPC_BEHAVIORS[npc.captainType] || NPC_BEHAVIORS.unknown;
  const alreadyInteracted = hasInteractedWithNpc(_activeDockMissionId, npc.id);
  const drinkApplied = hasDrinkApplied(_activeDockMissionId, npc.id);
  const statusColor = npc.status.color;
  const cargoColor = npc.cargo.color;

  // Label état physique PNJ
  const drinkLabel = CREW_PHYSICAL_LABELS[npcDrinkState]?.label || 'Sobre';
  const drinkColor = CREW_PHYSICAL_LABELS[npcDrinkState]?.color || '#aaa9a8';

  modal.innerHTML = `
    <div style="background:var(--bg);width:100%;max-width:480px;border-top:1px solid var(--border);border-radius:14px 14px 0 0;padding:20px 18px 24px;font-family:inherit;max-height:90vh;overflow-y:auto;box-shadow:0 -20px 60px rgba(0,0,0,.5)">
      <div style="width:36px;height:3px;background:var(--mut);border-radius:2px;margin:0 auto 16px;opacity:.5"></div>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div style="flex:1;min-width:0">
          <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">Pavillon</div>
          <div style="font-size:18px;color:#e6f0ff;font-weight:600;margin-top:2px">${npc.captain}</div>
        </div>
        <div onclick="closeNpcSheet()" style="cursor:pointer;width:32px;height:32px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:14px">×</div>
      </div>

      <div style="font-size:12px;color:var(--mut);font-style:italic;line-height:1.65;margin-bottom:14px;font-family:'Charter','Iowan Old Style',Georgia,serif">${npc.bio}</div>

      <!-- Métadonnées -->
      <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)">
          <span style="color:var(--mut)">Tanker</span>
          <span style="color:#e6f0ff;font-family:'SF Mono',monospace">${npc.tankerName}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)">
          <span style="color:var(--mut)">Provenance</span>
          <span style="color:#e6f0ff">${npc.origin}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)">
          <span style="color:var(--mut)">Cargo</span>
          <span style="color:${cargoColor}">${npc.cargo.label}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)">
          <span style="color:var(--mut)">Statut</span>
          <span style="color:${statusColor}">${npc.status.label}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px">
          <span style="color:var(--mut)">Bois actuellement</span>
          <span style="color:${drinkColor};font-style:italic">${drinkLabel}${drinkApplied ? ' · invité par toi' : ''}</span>
        </div>
      </div>

      <!-- D4 : Interactions -->
      ${_renderNpcInteractions(npc, behavior, npcDrinkState, alreadyInteracted, drinkApplied, dock)}

      <button onclick="closeNpcSheet()" style="margin-top:18px;width:100%;padding:11px;background:transparent;border:1px solid var(--border);color:var(--mut);border-radius:6px;font-family:inherit;font-size:12px;letter-spacing:.08em;cursor:pointer">FERMER</button>
    </div>
  `;
}

// ─── D4 : Génère la liste des 6 boutons d'interaction OU les sous-choix actifs ───
function _renderNpcInteractions(npc, behavior, drinkState, alreadyInteracted, drinkApplied, dock) {
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  const npcState = mission?.npcInteractions?.[npc.id] || {};

  // Bannière de feedback du dernier résultat d'interaction
  let bannerHtml = '';
  if (npcState.lastResult) {
    const r = npcState.lastResult;
    const bgByKind = { success: 'rgba(120,200,140,.10)', info: 'rgba(120,170,220,.10)', fail: 'rgba(255,120,120,.10)', rumor: 'rgba(255,200,100,.08)' };
    const borderByKind = { success: 'rgba(120,200,140,.30)', info: 'rgba(120,170,220,.30)', fail: 'rgba(255,120,120,.30)', rumor: 'rgba(255,200,100,.30)' };
    const colorByKind = { success: '#78c88c', info: '#7aaadc', fail: '#ff7878', rumor: '#ffc864' };
    bannerHtml = `
      <div style="
        padding:12px 14px;
        background:${bgByKind[r.kind] || 'rgba(255,255,255,.04)'};
        border:1px solid ${borderByKind[r.kind] || 'var(--border)'};
        border-radius:8px;
        margin-bottom:14px;
        font-size:12px;
        color:${colorByKind[r.kind] || '#e6f0ff'};
        line-height:1.55;
        font-family:'Charter','Iowan Old Style',Georgia,serif;
        font-style:italic
      ">${r.text}${r.lead ? `<button onclick="closeNpcSheet();openCarnet('pistes')" style="display:block;width:100%;margin-top:10px;padding:9px 12px;border-radius:8px;border:1px solid rgba(200,180,120,.5);background:rgba(200,180,120,.10);color:#e8d39a;font:600 12px/1.2 -apple-system,system-ui,sans-serif;font-style:normal;cursor:pointer">📍 Voir la piste dans le Carnet</button>` : ''}</div>
    `;
  }

  // Si un sous-choix est en cours (info, protection, exchange), afficher les sous-options
  if (npcState.pendingSubChoice) {
    return bannerHtml + _renderNpcSubChoice(npc, npcState.pendingSubChoice, drinkState);
  }

  // Cuvé = refuse tout sauf rumeur gratuite
  const isCuve = drinkState === 'cuve';

  // Helper bouton interaction
  const btn = (verb, emoji, label, available, reason, costLabel) => {
    const disabled = !available || (alreadyInteracted && verb !== 'drink');
    const bgColor = disabled ? 'rgba(255,255,255,.02)' : 'rgba(255,200,100,.04)';
    const borderColor = disabled ? 'var(--border)' : 'rgba(255,200,100,.30)';
    const labelColor = disabled ? 'var(--mut)' : '#ffc864';
    const reasonHtml = (disabled && reason) ? `<div style="font-size:9px;color:var(--mut);font-style:italic;margin-top:3px">${reason}</div>` : '';
    const costHtml = (!disabled && costLabel) ? `<div style="font-size:9px;color:var(--mut);margin-top:2px">${costLabel}</div>` : '';
    const onclickAttr = disabled ? '' : `onclick="onNpcInteract('${npc.id}','${verb}')"`;
    const cursorStyle = disabled ? 'cursor:not-allowed' : 'cursor:pointer';

    return `
      <div ${onclickAttr} style="
        padding:10px 12px;
        background:${bgColor};
        border:1px solid ${borderColor};
        border-radius:6px;
        ${cursorStyle};
        margin-bottom:6px
      ">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:16px;width:22px;text-align:center;${disabled ? 'opacity:.4' : ''}">${emoji}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;color:${labelColor};font-weight:500">${label}</div>
            ${costHtml}
            ${reasonHtml}
          </div>
        </div>
      </div>
    `;
  };

  // Détermination disponibilité de chaque verbe
  const canExchange = !isCuve && behavior.exchange !== 'no';
  const canInfo = !isCuve && behavior.info !== 'no';
  const canProtection = !isCuve && behavior.protection !== 'no';
  const canRumor = !isCuve && behavior.rumor !== 'no';
  const canDrink = !isCuve && !drinkApplied && behavior.drink !== 'no'; // n'utilise PAS le compteur principal
  const canSell = !isCuve && behavior.sell !== 'no';

  // Raisons de refus
  const reasonExchange = isCuve ? `${npc.captain} marmonne. Inintelligible.` : (behavior.refusalReasonExch || `${npc.captain} refuse net.`);
  const reasonInfo = isCuve ? `${npc.captain} marmonne. Inintelligible.` : (behavior.refusalReasonInfo || `${npc.captain} n'a rien à vendre comme info.`);
  const reasonProt = isCuve ? `${npc.captain} marmonne. Inintelligible.` : (behavior.refusalReasonProt || `${npc.captain} refuse d'escorter qui que ce soit.`);
  const reasonRumor = isCuve ? `${npc.captain} marmonne. Inintelligible.` : (behavior.refusalReasonRumor || `${npc.captain} ne raconte rien.`);
  const reasonDrink = isCuve ? `${npc.captain} est trop atteint pour boire plus.` : (drinkApplied ? `Déjà offert ce séjour.` : (behavior.refusalReasonDrink || `${npc.captain} refuse votre verre.`));
  const reasonSell = isCuve ? `${npc.captain} marmonne. Inintelligible.` : (behavior.refusalReasonSell || `${npc.captain} refuse d'acheter ce genre d'info.`);

  // Labels de coût indicatifs
  const exchHint = canExchange ? `Troc ressources` : '';
  const infoHint = canInfo ? `${behavior.info === 'rare' ? 'Cher' : 'Modéré'} · ouverture du marché` : '';
  const protHint = canProtection ? `${behavior.protection === 'cond' ? '~200 CG' : behavior.protection === 'yes' ? '~50-500 CG' : ''}` : '';
  const rumorHint = canRumor ? `Gratuit` : '';
  const drinkHint = canDrink ? `~5-10 CG · ne consomme pas l'interaction principale` : '';
  const sellHint = canSell ? `Gain CG · ⚠ ta route devient repérable (Phase 4)` : '';

  return bannerHtml + `
    <div>
      <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">
        Interactions · ${alreadyInteracted ? '<span style="color:#ffc864">Interagi ce séjour</span>' : '1 par séjour disponible'}
      </div>
      ${btn('exchange',   '🤝', 'Proposer un échange',  canExchange,   reasonExchange, exchHint)}
      ${btn('info',       '🗺',  'Acheter une info',     canInfo,       reasonInfo,     infoHint)}
      ${btn('protection', '🛡',  'Payer une protection', canProtection, reasonProt,     protHint)}
      ${btn('rumor',      '💬', 'Demander une rumeur',  canRumor,      reasonRumor,    rumorHint)}
      ${btn('drink',      '🍻', 'Inviter à boire',      canDrink,      reasonDrink,    drinkHint)}
      ${btn('sell',       '📡', 'Vendre tes infos',     canSell,       reasonSell,     sellHint)}
    </div>
  `;
}

// Rendu des sous-choix (tiers d'info, tiers de protection, deal d'échange)
function _renderNpcSubChoice(npc, subChoice, drinkState) {
  const RES_LABEL = { metal: 'métal', energy: 'énergie', cristal: 'cristal' };

  const subBtn = (onclick, label, sublabel, danger) => {
    const colorAccent = danger ? '#ff7878' : '#ffc864';
    return `
      <div onclick="${onclick}" style="
        padding:12px 14px;
        background:rgba(255,200,100,.04);
        border:1px solid ${danger ? 'rgba(255,120,120,.30)' : 'rgba(255,200,100,.30)'};
        border-radius:6px;
        cursor:pointer;
        margin-bottom:8px
      ">
        <div style="font-size:13px;color:${colorAccent};font-weight:500">${label}</div>
        <div style="font-size:10px;color:var(--mut);margin-top:3px;line-height:1.4">${sublabel}</div>
      </div>
    `;
  };

  const cancelBtn = `
    <div onclick="cancelNpcSubChoice('${npc.id}')" style="padding:10px;text-align:center;color:var(--mut);font-size:11px;cursor:pointer;border-top:1px solid var(--border);margin-top:8px;letter-spacing:.05em">
      ← Retour
    </div>
  `;

  if (subChoice === 'info') {
    const tiers = getNpcInfoTiers(npc, drinkState);
    let html = `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">🗺 Choisir une info</div>`;
    for (const t of tiers) {
      const canAfford = (G.credits || 0) >= t.cost;
      const sub = `${t.desc} · <span style="color:${canAfford ? '#ffc864' : '#ff7878'}">${t.cost} CG${!canAfford ? ' · insuffisant' : ''}</span>`;
      const handler = canAfford ? `onNpcSubChoice('${npc.id}','info','${t.id}')` : '';
      html += subBtn(handler, t.label, sub, !canAfford);
    }
    return html + cancelBtn;
  }

  if (subChoice === 'protection') {
    const tiers = getNpcProtectionTiers(npc);
    let html = `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">🛡 Choisir une protection</div>`;
    if (tiers.length === 0) {
      html += `<div style="padding:14px;background:rgba(255,120,120,.06);border:1px solid rgba(255,120,120,.20);border-radius:6px;font-size:11px;color:var(--mut);font-style:italic">${npc.captain} n'a rien à offrir de précis.</div>`;
    } else {
      for (const t of tiers) {
        const canAfford = (G.credits || 0) >= t.cost;
        const sub = `${t.desc} · <span style="color:${canAfford ? '#ffc864' : '#ff7878'}">${t.cost} CG${!canAfford ? ' · insuffisant' : ''}</span>`;
        const handler = canAfford ? `onNpcSubChoice('${npc.id}','protection','${t.id}')` : '';
        html += subBtn(handler, t.label, sub, !canAfford);
      }
    }
    return html + cancelBtn;
  }

  if (subChoice === 'exchange') {
    const deal = getNpcExchangeDeal(npc, drinkState);
    let html = `<div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">🤝 Offre de ${npc.captain}</div>`;
    if (!deal) {
      html += `<div style="padding:14px;background:rgba(255,120,120,.06);border:1px solid rgba(255,120,120,.20);border-radius:6px;font-size:11px;color:var(--mut);font-style:italic">${npc.captain} n'a rien à échanger en ce moment.</div>`;
    } else {
      // Fix 18/05 : utiliser la CALE du tanker (mission.cargo) pour évaluer si possible
      const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
      const cargoKey = { metal: 'metal', energy: 'energie', cristal: 'cristal' };
      const wantKey = cargoKey[deal.want.res] || deal.want.res;
      const cargoHave = (mission?.cargo?.[wantKey]) || 0;
      const hasResources = cargoHave >= deal.want.qty;
      const giveLabel = `${deal.give.qty} ${RES_LABEL[deal.give.res] || deal.give.res}`;
      const wantLabel = `${deal.want.qty} ${RES_LABEL[deal.want.res] || deal.want.res}`;
      html += `
        <div style="padding:14px;background:rgba(255,200,100,.06);border:1px solid rgba(255,200,100,.20);border-radius:8px;margin-bottom:12px;font-style:italic;font-family:'Charter',Georgia,serif;font-size:12px;color:#e6f0ff;line-height:1.5">"${deal.msg}"</div>
        <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px;padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
            <span style="color:var(--mut)">Il donne</span>
            <span style="color:#78c88c;font-weight:500">${giveLabel}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-top:6px">
            <span style="color:var(--mut)">Il veut (de ta cale)</span>
            <span style="color:${hasResources ? '#ffc864' : '#ff7878'};font-weight:500">${wantLabel}${!hasResources ? ` · cale ${cargoHave}` : ''}</span>
          </div>
        </div>
      `;
      if (hasResources) {
        html += subBtn(`onNpcSubChoice('${npc.id}','exchange','accept')`, 'Accepter le marché', `Tu donnes ${wantLabel}, tu reçois ${giveLabel}`, false);
      }
      html += subBtn(`onNpcSubChoice('${npc.id}','exchange','refuse')`, 'Refuser', `${npc.captain} haussera les épaules`, true);
    }
    return html + cancelBtn;
  }

  return '';
}

// Dispatcher principal des interactions PNJ — D4.3 complet
function onNpcInteract(npcId, verb) {
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (!mission?.dock) return;
  const npcs = getNpcMissionsAtDock(mission.dock);
  const npc = npcs.find(n => n.id === npcId);
  if (!npc) return;
  const drinkState = getNpcDrinkState(npc, mission);

  // 🍻 Inviter à boire — n'utilise pas le compteur principal
  if (verb === 'drink') {
    const cost = 5 + Math.floor(Math.random() * 6); // 5-10 CG
    if ((G.credits || 0) < cost) {
      _setNpcResult(mission, npcId, { text: `Pas assez de crédits (besoin ${cost} CG).`, kind: 'fail' });
      _renderNpcSheet(npc);
      return;
    }
    G.credits -= cost;
    applyDrinkBoost(_activeDockMissionId, npcId);
    _setNpcResult(mission, npcId, { text: `${npc.captain} accepte le verre. Il vide la chope d'un trait. −${cost} CG.`, kind: 'success' });
    _renderNpcSheet(npc);
    return;
  }

  // 💬 Rumeur — gratuit, tire dans un pool
  if (verb === 'rumor') {
    const roll = Math.random();
    let category, color;
    if (roll < 0.50) { category = 'lore'; color = 'info'; }
    else if (roll < 0.90) { category = 'indice'; color = 'rumor'; }
    else { category = 'mensonge'; color = 'rumor'; }
    const pool = NPC_RUMORS_POOL[category];
    let text = pool[Math.floor(Math.random() * pool.length)];
    text = text.replace('{captain}', npc.captain).replace('{rand}', String(10 + Math.floor(Math.random() * 90)));
    _setNpcResult(mission, npcId, { text: `«${text}»`, kind: color });
    markNpcInteracted(_activeDockMissionId, npcId, verb);
    // Stocker pour journal global
    if (!G.rumorJournal) G.rumorJournal = [];
    const rumorEntry = { at: Date.now(), captain: npc.captain, category, text, dockId: mission.dock?.id };
    G.rumorJournal.unshift(rumorEntry);
    if (G.rumorJournal.length > 50) G.rumorJournal.length = 50;
    // D5.3 : possible génération d'un lead depuis la rumeur
    const generatedLead = (typeof maybeGenerateLeadFromRumor === 'function')
      ? maybeGenerateLeadFromRumor(rumorEntry, npc)
      : null;
    if (generatedLead) {
      // Compléter le feedback dans la fiche avec mention de la piste
      const prev = mission.npcInteractions?.[npcId]?.lastResult?.text || '';
      _setNpcResult(mission, npcId, {
        text: prev + `\n\n📍 Cette rumeur vaut une piste à explorer. Voir le Carnet.`,
        kind: color,
      });
    }
    _renderNpcSheet(npc);
    return;
  }

  // 📡 Vendre tes infos
  if (verb === 'sell') {
    // Trouver une route à exposer
    const myRoutes = (G.routes || []).filter(r => !r.exposedToPirates && r.status !== 'collapsed');
    if (myRoutes.length === 0) {
      _setNpcResult(mission, npcId, { text: `Tu n'as aucune route inédite à vendre.`, kind: 'fail' });
      _renderNpcSheet(npc);
      return;
    }
    const route = myRoutes[Math.floor(Math.random() * myRoutes.length)];
    const gain = 50 + Math.floor(Math.random() * 150);
    G.credits = (G.credits || 0) + gain;
    route.exposedToPirates = true; // Flag pour Phase 4 (interception)
    _setNpcResult(mission, npcId, {
      text: `${npc.captain} note la position de ${route.name || 'ta route'}. +${gain} CG. Ta route est désormais repérable par des yeux peu amicaux (Phase 4).`,
      kind: 'rumor'
    });
    markNpcInteracted(_activeDockMissionId, npcId, verb);
    _renderNpcSheet(npc);
    return;
  }

  // 🤝 Échange · 🗺 Info · 🛡 Protection → ouvrir sous-choix
  if (['exchange', 'info', 'protection'].includes(verb)) {
    if (!mission.npcInteractions) mission.npcInteractions = {};
    if (!mission.npcInteractions[npcId]) mission.npcInteractions[npcId] = {};
    mission.npcInteractions[npcId].pendingSubChoice = verb;
    _renderNpcSheet(npc);
    return;
  }
}

// Handler des sous-choix (tier sélectionné, deal accepté/refusé)
function onNpcSubChoice(npcId, verb, choice) {
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (!mission?.dock) return;
  const npcs = getNpcMissionsAtDock(mission.dock);
  const npc = npcs.find(n => n.id === npcId);
  if (!npc) return;
  const drinkState = getNpcDrinkState(npc, mission);

  // Sortie du sous-mode
  const _exitSub = () => {
    if (mission.npcInteractions?.[npcId]) {
      mission.npcInteractions[npcId].pendingSubChoice = null;
    }
  };

  if (verb === 'info') {
    const tiers = getNpcInfoTiers(npc, drinkState);
    const tier = tiers.find(t => t.id === choice);
    if (!tier) { _exitSub(); _renderNpcSheet(npc); return; }
    if ((G.credits || 0) < tier.cost) {
      _setNpcResult(mission, npcId, { text: `Tu n'as pas ${tier.cost} CG.`, kind: 'fail' });
      _exitSub();
      _renderNpcSheet(npc);
      return;
    }
    // 29/10 — l'info rare ouvre une piste : pas d'achat si le Carnet en a déjà 5 ouvertes (rien ne serait inscrit)
    if (choice === 'rare' && (G.openLeads || []).filter(l => l.status === 'open').length >= 5) {
      _setNpcResult(mission, npcId, { text: `Ton Carnet a déjà 5 pistes ouvertes. Explores-en une avant d'en acheter une autre.`, kind: 'fail' });
      _exitSub();
      _renderNpcSheet(npc);
      return;
    }
    G.credits -= tier.cost;
    // Génération du texte d'info selon tier
    let infoText = '';
    if (choice === 'banal') {
      const otherNpcs = (getNpcMissionsAtDock(mission.dock) || []).filter(n => n.id !== npcId);
      if (otherNpcs.length > 0) {
        const target = otherNpcs[Math.floor(Math.random() * otherNpcs.length)];
        infoText = `${target.captain} ${target.origin.toLowerCase()}. Son tanker : ${target.tankerName}.`;
      } else {
        infoText = `Le dock voisin le plus actif est à Σ-${20 + Math.floor(Math.random() * 80)}.`;
      }
    } else if (choice === 'medium') {
      const myRoutes = G.routes || [];
      if (myRoutes.length > 0) {
        const r = myRoutes[Math.floor(Math.random() * myRoutes.length)];
        const stability = Math.round(r.stability ?? 85);
        infoText = `Ta route "${r.name}" est en stabilité réelle ${stability}%. ${stability < 70 ? 'Risque élevé.' : stability < 85 ? 'Stable, mais surveille.' : 'Très stable.'}`;
      } else {
        infoText = `Il existe des docks qui ne figurent sur aucune carte officielle. Ceux qui y vont n'en parlent pas.`;
      }
    } else if (choice === 'rare') {
      // PATCH_2910_PISTE : plus de coordonnées inventées dans le texte — une coordonnée achetée devient une vraie piste
      const possibilities = [
        `Anubis34 c'est en réalité un ancien officier de la Maison Vérath. Personne ne le sait.`,
        `Le Père Cobalt prépare un retour. Quelque chose se passe dans le couloir d'Erebus.`,
        `Big Vesna Drestul a un contrat sur ta tête. Ne dis pas qui te l'a dit.`,
      ];
      infoText = possibilities[Math.floor(Math.random() * possibilities.length)];
    }
    _setNpcResult(mission, npcId, { text: `«${infoText}» · −${tier.cost} CG`, kind: 'info' });
    markNpcInteracted(_activeDockMissionId, npcId, 'info');
    if (!G.purchasedIntel) G.purchasedIntel = [];
    const intelEntry = { at: Date.now(), text: infoText, tier: choice, captain: npc.captain };
    G.purchasedIntel.unshift(intelEntry);
    if (G.purchasedIntel.length > 30) G.purchasedIntel.length = 30;
    // D5.3 : possible génération d'un lead exploitable
    const generatedLead = (typeof maybeGenerateLeadFromIntel === 'function')
      ? maybeGenerateLeadFromIntel(intelEntry, npc)
      : null;
    if (generatedLead) {
      const prev = mission.npcInteractions?.[npcId]?.lastResult?.text || '';
      _setNpcResult(mission, npcId, {
        text: prev + `\n\n📍 Une piste s'est ouverte : ${generatedLead.coords}. Elle est dans ton Carnet du capitaine, onglet Pistes.`,
        kind: 'info', lead: generatedLead.id,
      });
    }
    _exitSub();
    _renderNpcSheet(npc);
    return;
  }

  if (verb === 'protection') {
    const tiers = getNpcProtectionTiers(npc);
    const tier = tiers.find(t => t.id === choice);
    if (!tier) { _exitSub(); _renderNpcSheet(npc); return; }
    if (mission.protection && mission.protection.reduction >= tier.reduction) {
      _setNpcResult(mission, npcId, { text: `Ton convoi est déjà couvert (${mission.protection.label}). Inutile de payer moins bien.`, kind: 'info' });
      _exitSub();
      _renderNpcSheet(npc);
      return;
    }
    if ((G.credits || 0) < tier.cost) {
      _setNpcResult(mission, npcId, { text: `Tu n'as pas ${tier.cost} CG.`, kind: 'fail' });
      _exitSub();
      _renderNpcSheet(npc);
      return;
    }
    G.credits -= tier.cost;
    mission.protection = { type: tier.id, label: tier.label, reduction: tier.reduction, providedBy: npc.captain };
    _setNpcResult(mission, npcId, {
      text: `${npc.captain} appose son sceau. ${tier.label} sera active sur ton trajet retour. −${tier.cost} CG.`,
      kind: 'success'
    });
    markNpcInteracted(_activeDockMissionId, npcId, 'protection');
    _exitSub();
    _renderNpcSheet(npc);
    return;
  }

  if (verb === 'exchange') {
    if (choice === 'refuse') {
      _setNpcResult(mission, npcId, { text: `Tu refuses l'offre. ${npc.captain} hausse les épaules.`, kind: 'info' });
      markNpcInteracted(_activeDockMissionId, npcId, 'exchange');
      _exitSub();
      _renderNpcSheet(npc);
      return;
    }
    if (choice === 'accept') {
      const deal = getNpcExchangeDeal(npc, drinkState);
      if (!deal) { _exitSub(); _renderNpcSheet(npc); return; }
      const RES_LABEL = { metal: 'métal', energy: 'énergie', cristal: 'cristal' };
      // ─── Fix 18/05 : l'échange utilise la CALE du tanker (mission.cargo), pas
      // les ressources de la planète. On est au dock, loin de la planète.
      // Mapping interne : deal utilise 'energy' mais le cargo utilise 'energie'.
      const cargoKey = { metal: 'metal', energy: 'energie', cristal: 'cristal' };
      const wantKey = cargoKey[deal.want.res] || deal.want.res;
      const giveKey = cargoKey[deal.give.res] || deal.give.res;
      if (!mission.cargo) mission.cargo = { metal: 0, energie: 0, cristal: 0 };
      if ((mission.cargo[wantKey] || 0) < deal.want.qty) {
        _setNpcResult(mission, npcId, { text: `Ton tanker n'a plus assez de ${RES_LABEL[deal.want.res]} en cale.`, kind: 'fail' });
        _exitSub();
        _renderNpcSheet(npc);
        return;
      }
      mission.cargo[wantKey] -= deal.want.qty;
      mission.cargo[giveKey] = (mission.cargo[giveKey] || 0) + deal.give.qty;
      // Recalculer cargoTotal (utilisé par le butin de retour)
      mission.cargoTotal = (mission.cargo.metal || 0) + (mission.cargo.energie || 0) + (mission.cargo.cristal || 0);
      // Risque d'arnaque si saoul
      const trickRisk = drinkState === 'saoul' ? 0.3 : drinkState === 'emeche' ? 0.10 : 0;
      if (trickRisk > 0 && Math.random() < trickRisk) {
        // Arnaque : il prend mais ne donne qu'une partie
        const realGive = Math.round(deal.give.qty * 0.4);
        mission.cargo[giveKey] -= (deal.give.qty - realGive);
        mission.cargoTotal = (mission.cargo.metal || 0) + (mission.cargo.energie || 0) + (mission.cargo.cristal || 0);
        _setNpcResult(mission, npcId, {
          text: `${npc.captain} part avec ton ${RES_LABEL[deal.want.res]}. Tu te rends compte qu'il n'a chargé que ${realGive} ${RES_LABEL[deal.give.res]} dans ta cale. Tu t'es fait avoir.`,
          kind: 'fail'
        });
      } else {
        _setNpcResult(mission, npcId, {
          text: `Marché conclu. Ta cale reçoit ${deal.give.qty} ${RES_LABEL[deal.give.res]} contre ${deal.want.qty} ${RES_LABEL[deal.want.res]}.`,
          kind: 'success'
        });
      }
      markNpcInteracted(_activeDockMissionId, npcId, 'exchange');
      _exitSub();
      _renderNpcSheet(npc);
      return;
    }
  }
}

// Annuler un sous-choix (retour à la liste principale, sans consommer l'interaction)
function cancelNpcSubChoice(npcId) {
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (!mission) return;
  if (mission.npcInteractions?.[npcId]) {
    mission.npcInteractions[npcId].pendingSubChoice = null;
  }
  const npcs = getNpcMissionsAtDock(mission.dock);
  const npc = npcs.find(n => n.id === npcId);
  if (npc) _renderNpcSheet(npc);
}

// Helper pour stocker le résultat de la dernière interaction (bannière)
function _setNpcResult(mission, npcId, result) {
  if (!mission.npcInteractions) mission.npcInteractions = {};
  if (!mission.npcInteractions[npcId]) mission.npcInteractions[npcId] = {};
  mission.npcInteractions[npcId].lastResult = result;
}

function closeNpcSheet() {
  const modal = document.getElementById('npc-sheet-modal');
  if (modal) modal.remove();
  _activeNpcId = null;
  if (typeof _mpOpenConvoyId !== 'undefined') _mpOpenConvoyId = null;
}

// ─── Retour au home depuis le dock ───
// PUBLIC : Démarre le retour du tanker depuis le dock.
// Passe en status='returning' avec un timer (durée = même que l'aller).
// Le calcul du butin + rapport se fait dans _completeRouteRunReturn quand le timer expire.
// Cf. demande Adrien 18/05 : retour avec barre de progression comme l'aller.
function returnTankerFromDock(missionId, departAt) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  if (!mission || mission.status !== 'docked') return null;

  const now = Math.min(Date.now(), departAt || Date.now());
  // Durée du retour = même que l'aller (departedAt → arrivalAt)
  const goDuration = (mission.arrivalAt - mission.departedAt) || (60 * 1000);
  // En mode "instant mission" (cheat dev), accélérer le retour aussi
  const isInstantMode = G._instantMission;
  const returnDuration = isInstantMode ? 5000 : goDuration; // 5s en cheat, sinon idem aller

  mission.status = 'returning';
  mission.returnDepartedAt = now;
  mission.returnArrivalAt = now + returnDuration;
  mpConvoyRegister(mission, 'back');   // PIRATERIE_1210 — le retour du dock est aussi un convoi

  // Conserver le journal de séjour figé pour le rapport final
  // (on splicera la mission lors de _completeRouteRunReturn)
  if (typeof toast === 'function') {
    toast(`${mission.tankerName} en route retour · ${Math.ceil(returnDuration / 60000)} min`);
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return mission;
}

// AUDIT_1110 — Tanker de route rappelé avant d'atteindre le dock : la cale revient telle quelle, sans commerce.
function _completeCancelledRouteRun(missionId) {
  const idx = (G.tankerMissions || []).findIndex(m => m.id === missionId);
  if (idx === -1) return;
  const m = G.tankerMissions[idx];
  const back = [];
  for (const k of ['metal', 'energie', 'cristal']) {
    const q = (m.cargo && m.cargo[k]) || 0;
    if (q > 0 && G.res[k]) { G.res[k].v = Math.min(Math.max(G.res[k].max, G.res[k].v), G.res[k].v + q); back.push(`${fmt(q)} ${k}`); }
  }
  const route = (G.routes || []).find(r => r.id === m.routeId);
  if (route) routeReleaseMission(route, m.id);   // PATCH_1510_ROUTE_MULTI
  G.tankerMissions.splice(idx, 1);
  if (typeof toast === 'function') toast(`${m.tankerName} est rentré · ${back.length ? back.join(' · ') + ' rendus' : 'cale vide'}`);
  if (typeof saveGame === 'function') saveGame();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── INTERNE : finalise le retour ───
// Calcule le butin selon humeur de la route, applique évolutions stability/connaissance/passages,
// génère un rapport tanker. Appelé par tickTankerMissions quand returnArrivalAt est atteint.
function _completeRouteRunReturn(missionId) {
  const idx = (G.tankerMissions || []).findIndex(m => m.id === missionId);
  if (idx === -1) return null;
  const mission = G.tankerMissions[idx];
  if (mission.status !== 'returning') return null;

  const route = (G.routes || []).find(r => r.id === mission.routeId);
  const mood = route ? (ROUTE_MOODS[route.moodKey] || ROUTE_MOODS.nerveuse) : null;

  // ─── Tirage perte tanker (selon humeur de la route + désertion équipage D2) ───
  const riskByMood = {
    nerveuse: 12, grasse: 8, morte: 10, noire: 20, imperiale: 3,
  };
  let riskPct = mood ? (riskByMood[mood.key] || 10) : 5;
  // D2 : modifier selon humeur équipage
  if (mission.crewMood) {
    const palier = _getHumorPalier(mission.crewMood.humorScore);
    const physical = mission.crewMood.physicalState;
    if (palier === 'mutin' && physical === 'saoul') riskPct += 15;       // catastrophe
    else if (palier === 'mutin') riskPct += 10;                            // 8-15% désertion
    else if (palier === 'inquiet' && physical === 'saoul') riskPct += 5;   // bagarre + ivresse
    else if (palier === 'inquiet') riskPct += 2;                           // 2% désertion
  }
  // ─── D4.3 : appliquer la protection achetée auprès d'un PNJ au dock ───
  // mission.protection = { type, label, reduction, providedBy }
  // reduction = 0.10 (légère) / 0.30 (armée) / 1.0 (sceau total)
  let protectionApplied = null;
  if (mission.protection && mission.protection.reduction > 0) {
    const before = riskPct;
    riskPct = Math.max(0, riskPct * (1 - mission.protection.reduction));
    protectionApplied = { ...mission.protection, riskBefore: before, riskAfter: riskPct };
  }
  if (mission.balisage) riskPct = Math.max(0, riskPct * (1 - 0.6 * mission.balisage));   // PATCH_1410_BALISAGE
  const isLost = Math.random() * 100 < riskPct;

  // ─── Tanker vide → route vexée (option A canon) ───
  const wasEmpty = (mission.cargoTotal || 0) === 0;
  if (route && wasEmpty && !mission.bmEnvoy) {   // PATCH_0211_AMBASSADEUR : un Dreadnought n'a pas de cale, ce n'est pas un tanker vide
    route.stability = Math.max(0, (route.stability || 50) - 5);
  }

  if (isLost) {
    // Perte tanker : consomme un T<tier> de la flotte
    const stat = G.fleet?.stationed?.tanker;
    if (mission.bmEnvoy) { if (window.SBBlackmarket) SBBlackmarket.envoyLost(mission); }   // PATCH_0211_AMBASSADEUR : jamais détruit, hors service
    else if (stat && stat['t' + mission.tier] > 0) stat['t' + mission.tier] -= 1;
    if (route) {
      route.lost = (route.lost || 0) + 1;
      route.stability = Math.max(0, (route.stability || 50) - 7);
      route.status = (route.stability <= 0) ? 'collapsed' : 'active';
      route.activeMissionId = null;
      routeReleaseMission(route, mission.id);   // PATCH_1510_ROUTE_MULTI
      // D5.1 : tracker l'historique même en cas de perte
      if (!route.stabilityHistory) route.stabilityHistory = [];
      route.stabilityHistory.push({ at: Date.now(), value: route.stability, lost: true });
      if (route.stabilityHistory.length > 30) route.stabilityHistory.shift();
      if (!route.moodHistory) route.moodHistory = [];
      route.moodHistory.push({ at: Date.now(), moodKey: route.moodKey, passages: route.passages, lost: true });
      if (route.moodHistory.length > 20) route.moodHistory.shift();
    }
    // Rapport
    mission._protectionApplied = protectionApplied;
    mission._dockInteractions = _summarizeDockInteractions(mission);
    const lostNarrative = mission.bmEnvoy ? _narrateTankerLoss(mission) : _generateRouteRunNarrative(mission, route, mood, null, true);   // PATCH_0211_AMBASSADEUR
    storeRouteRunReport(mission, route, mood, null, true, lostNarrative);
    G.tankerMissions.splice(idx, 1);
    if (typeof toast === 'function' && !mission.bmEnvoy) toast(`${mission.tankerName} ne reviendra pas`);   // PATCH_0211_AMBASSADEUR : envoyLost a déjà parlé
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return null;
  }

  // ─── Calcul butin selon humeur ───
  // Phase D1 : butin simple basé sur cargo de départ + bonus humeur.
  // Phase D2-D5 : ajustements selon séjour, deals, passagers, etc.
  const loot = _computeRouteRunLoot(mission, route, mood);

  // Appliquer le butin aux ressources
  for (const k of ['metal', 'energie', 'cristal']) {
    if (loot.resources[k] > 0 && G.res[k]) {
      G.res[k].v = Math.min(G.res[k].max, G.res[k].v + loot.resources[k]);
    }
  }
  G.credits = (G.credits || 0) + (loot.credits || 0);

  // ─── Évolution route ───
  if (route) {
    route.passages = (route.passages || 0) + 1;
    route.lastUsedAt = Date.now();
    route.status = 'active';
    route.activeMissionId = null;
    routeReleaseMission(route, mission.id);   // PATCH_1510_ROUTE_MULTI
    // Connaissance : montée plus rapide en début, plus lente en haut
    if (route.knowledgeLevel < 3) route.knowledgeLevel = Math.min(10, (route.knowledgeLevel || 0) + 1);
    else if (route.knowledgeLevel < 7 && Math.random() < 0.6) route.knowledgeLevel++;
    else if (route.knowledgeLevel < 10 && Math.random() < 0.25) route.knowledgeLevel++;
    // RUMORS_1110 — une route devenue légendaire fait parler les comptoirs
    if (route.knowledgeLevel >= 10 && !route.legendAnnounced && window.SBMP && window.SBMP.ready()) {
      route.legendAnnounced = true;
      window.SBMP.reportEvent('route_legendary', route.name);
    }
    // Stabilité : +2% sur passage réussi (modulé par humeur)
    route.stability = Math.min(100, (route.stability || 50) + 2);
    // D5.1 : tracker l'historique de stabilité (max 30 entrées) pour la timeline
    if (!route.stabilityHistory) route.stabilityHistory = [];
    route.stabilityHistory.push({ at: Date.now(), value: route.stability });
    if (route.stabilityHistory.length > 30) route.stabilityHistory.shift();
    // D5.1 : tracker l'historique des humeurs (max 20 entrées) pour la timeline
    if (!route.moodHistory) route.moodHistory = [];
    route.moodHistory.push({ at: Date.now(), moodKey: route.moodKey, passages: route.passages });
    if (route.moodHistory.length > 20) route.moodHistory.shift();
    // D5.1 : tracker le butin cumulé total (visible dans la fiche route enrichie)
    if (!route.cumulativeLoot) route.cumulativeLoot = { metal: 0, energie: 0, cristal: 0, credits: 0, runs: 0 };
    route.cumulativeLoot.metal += (loot?.resources?.metal || 0);
    route.cumulativeLoot.energie += (loot?.resources?.energie || 0);
    route.cumulativeLoot.cristal += (loot?.resources?.cristal || 0);
    route.cumulativeLoot.credits += (loot?.credits || 0);
    route.cumulativeLoot.runs += 1;
    // Drift d'humeur (Chunk D : on accumule, basculement après 5 passages)
    if (!route.driftScores) route.driftScores = { nerveuse:0, grasse:0, morte:0, noire:0, imperiale:0 };
    const _capDrift = mission.bmEnvoy ? (mission.bmEnvoy.cargo || 0) : TANKER_TIER_CONFIG[mission.tier].cargoCapacity;   // PATCH_0211_AMBASSADEUR
    if (mission.bmEnvoy && !_capDrift) {
      route.driftScores.imperiale += 1;   // un Dreadnought à la parade : la route se tient droite
    } else if (mission.cargoTotal > (_capDrift * 0.5)) {
      route.driftScores.grasse += 2;
    } else if (mission.cargoTotal === 0) {
      route.driftScores.morte += 2;
    } else if (mission.cargoTotal < (_capDrift * 0.25)) {
      route.driftScores.nerveuse += 1;
    } else {
      route.driftScores.imperiale += 1;
    }
    // Tous les 5 passages : check basculement
    if (route.passages % 5 === 0) {
      const top = Object.entries(route.driftScores).sort((a,b)=>b[1]-a[1])[0];
      if (top && top[0] !== route.moodKey && top[1] >= 5) {
        const oldMood = ROUTE_MOODS[route.moodKey];
        route.moodKey = top[0];
        // Réinitialiser drift scores après basculement
        route.driftScores = { nerveuse:0, grasse:0, morte:0, noire:0, imperiale:0 };
        // Toast spécial bascule
        if (typeof toast === 'function') {
          const newMood = ROUTE_MOODS[top[0]];
          toast(`✦ ${route.name} a changé de nature — ${newMood.label}`);
        }
        loot.moodChange = { from: oldMood?.key, to: top[0] };
      }
    }
  }

  // Générer rapport narratif
  // D4.3 : passer la protection et les interactions PNJ au générateur
  mission._protectionApplied = protectionApplied;
  mission._dockInteractions = _summarizeDockInteractions(mission);
  const narrative = _generateRouteRunNarrative(mission, route, mood, loot, false);
  storeRouteRunReport(mission, route, mood, loot, false, narrative);

  // Retirer mission
  G.tankerMissions.splice(idx, 1);

  if (typeof toast === 'function') {
    const lootParts = [];
    for (const k of ['metal','energie','cristal']) if (loot.resources[k] > 0) lootParts.push(`+${loot.resources[k]} ${k}`);
    if (loot.credits > 0) lootParts.push(`+${loot.credits} CG`);
    toast(`${mission.tankerName} de retour — ${lootParts.join(' · ') || 'cale vide'}`);
    // D5.3 fix #6 : toast supplémentaire de mise en garde si pillage
    if (mission._cargoPillaged) {
      setTimeout(() => {
        toast(`⚠ Équipage ${mission._cargoPillaged.palier} · ${mission._cargoPillaged.pct}% du cargo détourné`);
      }, 1500);
    }
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return loot;
}

// Butin selon humeur de la route + état équipage (D2 modifiers)
function _computeRouteRunLoot(mission, route, mood) {
  const loot = { resources: { metal:0, energie:0, cristal:0 }, credits: 0 };
  const moodKey = mood?.key || 'nerveuse';
  let cargoTotal = mission.cargoTotal || 0;

  // ─── D5.3 fix #6 (18/05) : Pillage partiel par équipage mutin ───
  // Quand l'humeur d'équipage est "mutin" (ou "inquiet" saoul/cuvé), une partie du cargo
  // est "perdue en route" — en vrai, détournée par l'équipage qui se sert. C'est une
  // mécanique narrative plus riche que le binaire "perd tout / perd rien".
  // - mutin sobre : 15-30% pillé
  // - mutin saoul/cuvé : 30-50% pillé (chaos)
  // - inquiet saoul/cuvé : 5-15% pillé (vol opportuniste)
  // Stocké dans mission._cargoPillaged pour narration dans le rapport.
  const crewMood = mission.crewMood;
  if (crewMood && cargoTotal > 0) {
    const palier = _getHumorPalier(crewMood.humorScore);
    const isDrunk = crewMood.physicalState === 'saoul' || crewMood.physicalState === 'cuve';
    let pillagedPct = 0;
    if (palier === 'mutin') {
      pillagedPct = isDrunk
        ? (0.30 + Math.random() * 0.20)  // 30-50%
        : (0.15 + Math.random() * 0.15); // 15-30%
    } else if (palier === 'inquiet' && isDrunk) {
      pillagedPct = (0.05 + Math.random() * 0.10); // 5-15%
    }
    if (pillagedPct > 0) {
      const pillagedAmount = Math.floor(cargoTotal * pillagedPct);
      cargoTotal = Math.max(0, cargoTotal - pillagedAmount);
      // Stocker pour la narration (rapport + commerce route sheet)
      mission._cargoPillaged = {
        pct: Math.round(pillagedPct * 100),
        amount: pillagedAmount,
        palier,
        isDrunk,
      };
    }
  }

  // Base : on récupère 80% à 120% du cargo envoyé, en ressources mixtes
  // Avec bonus/malus selon humeur
  const moodMultiplier = {
    nerveuse:  { res: 0.8,  cg: 1.5  },  // peu de cargo, beaucoup de CG (contrat urgent)
    grasse:    { res: 1.5,  cg: 1.0  },  // beaucoup de cargo, CG normal
    morte:     { res: 0.6,  cg: 0.5  },  // peu de tout
    noire:     { res: 1.0,  cg: 2.5  },  // pas de taxe, beaucoup de CG
    imperiale: { res: 1.0,  cg: 0.85 },  // fiable mais taxe -15%
  }[moodKey] || { res: 1.0, cg: 1.0 };
  // Bonus connaissance >=7 : +10% butin total
  const knowBonus = (route?.knowledgeLevel || 0) >= 7 ? 1.10 : 1.0;

  // ─── D2 : modifier butin selon humeur équipage au retour ───
  let crewMultiplier = 1.0;
  if (crewMood) {
    const palier = _getHumorPalier(crewMood.humorScore);
    // Modifiers humeur (réduit en plus du pillage déjà appliqué)
    const humorMods = {
      repose:  () => 1.0 + (0.05 + Math.random() * 0.05),  // +5 à +10%
      calme:   () => 1.0,
      inquiet: () => 0.90,                                  // -10%
      mutin:   () => 1.0 - (0.25 + Math.random() * 0.15),   // -25 à -40%
    };
    crewMultiplier = (humorMods[palier] || humorMods.calme)();
    // Modifiers physique (variance saoul +/-15%, cuvé -5%)
    if (crewMood.physicalState === 'saoul') {
      crewMultiplier *= (0.85 + Math.random() * 0.30);
    } else if (crewMood.physicalState === 'cuve') {
      crewMultiplier *= 0.95;
    }
  }

  // Ressources : on tire un mix pondéré
  const baseRes = Math.floor(cargoTotal * moodMultiplier.res * knowBonus * crewMultiplier);
  // Répartir : 50% métal, 30% énergie, 20% cristal
  loot.resources.metal  = Math.floor(baseRes * 0.5);
  loot.resources.energie = Math.floor(baseRes * 0.3);
  loot.resources.cristal = Math.floor(baseRes * 0.2);
  // CG : base = cargoTotal/10 modulé par humeur
  loot.credits = Math.floor((cargoTotal / 10) * moodMultiplier.cg * knowBonus * crewMultiplier);

  // ─── D2 : événements spéciaux ───
  // Bagarre : -5% butin supplémentaire (cumulé avec modifier mutin)
  if (mission._eventBagarre) {
    loot.resources.metal = Math.floor(loot.resources.metal * 0.95);
    loot.resources.energie = Math.floor(loot.resources.energie * 0.95);
    loot.resources.cristal = Math.floor(loot.resources.cristal * 0.95);
  }
  // Vol cargo : -30% ressources (au-dessus du modifier mutin)
  if (mission._eventVolCargo) {
    loot.resources.metal = Math.floor(loot.resources.metal * 0.70);
    loot.resources.energie = Math.floor(loot.resources.energie * 0.70);
    loot.resources.cristal = Math.floor(loot.resources.cristal * 0.70);
  }
  // Cadeau quai : +30 cristal bonus (ressource rare offerte)
  if (mission._eventCadeau) {
    loot.resources.cristal += 30;
  }
  // Pari perdu : -X CG
  if (mission._eventPariCG) {
    loot.credits = Math.max(0, loot.credits - mission._eventPariCG);
  }

  // Minimum CG si tanker vide : 0 (route vexée)
  if (cargoTotal === 0) loot.credits = 0;
  return loot;
}

// Narrative du retour de route_run
function _generateRouteRunNarrative(mission, route, mood, loot, isLost) {
  const crew = (typeof pickSpaceWorkerName === 'function') ? pickSpaceWorkerName() : 'l\'équipage';
  const routeName = route?.name || mission.routeName || 'la route';
  const moodLabel = mood?.label || 'route';
  const dock = mission.dock || {};

  if (isLost) {
    return `**Trajet sur ${routeName} — ${moodLabel}.**\n\n*Voyage interrompu.*\n\nLe tanker ${mission.tankerName} n'a pas atteint ${dock.name || 'le dock prévu'}. Le dernier signal a été reçu trois heures après son entrée dans la route. ${crew} et son équipage sont portés disparus.\n\n${moodLabel === 'Route noire Korr-Vask' ? 'Patrouille impériale, peut-être. Ou pirates. Personne ne demande de précisions sur les routes noires.' : 'Aucune cause claire n\'a pu être déterminée.'}`;
  }

  const wasEmpty = (mission.cargoTotal || 0) === 0;
  const emptyLine = wasEmpty
    ? `\n\nLe tanker était parti à vide. ${crew} a rapporté que la route avait été "froide" à l'aller — *"comme si elle nous reprochait quelque chose"*.\n`
    : '';

  const moodChangeLine = loot?.moodChange
    ? `\n\n*✦ La route a changé de nature en cours de mission. Elle est devenue ${ROUTE_MOODS[loot.moodChange.to]?.label || loot.moodChange.to}.*\n`
    : '';

  // ─── D2 : intégrer le journal de séjour dans la narrative ───
  let journalBlock = '';
  if (Array.isArray(mission.dockJournal) && mission.dockJournal.length > 0) {
    // Récap final selon humeur de fin
    const finalMood = mission.crewMood;
    const finalPalier = finalMood ? _getHumorPalier(finalMood.humorScore) : 'calme';
    const finalState = finalMood?.physicalState || 'sobre';
    const humorLabel = CREW_HUMOR_LABELS[finalPalier]?.label || 'Calme';
    const physLabel = CREW_PHYSICAL_LABELS[finalState]?.label || 'Sobre';
    // On affiche les 5 entrées les plus marquantes (privilégier les saoul/spéciaux)
    // Dédoublonnage défensif sur le texte (anti-bug 18/05 — même si tickCrewMood
    // évite déjà les répétitions, on garde un filet de sécurité ici).
    const seenTexts = new Set();
    const journal = mission.dockJournal.filter(e => {
      if (seenTexts.has(e.text)) return false;
      seenTexts.add(e.text);
      return true;
    });
    journal.sort((a, b) => {
      // Priorité : événements spéciaux (commencent par ✦ ⚠ ✗) puis saoul puis le reste
      const aSpecial = /^[✦⚠✗]/.test(a.text);
      const bSpecial = /^[✦⚠✗]/.test(b.text);
      if (aSpecial !== bSpecial) return aSpecial ? -1 : 1;
      const aSaoul = a.physical === 'saoul';
      const bSaoul = b.physical === 'saoul';
      if (aSaoul !== bSaoul) return aSaoul ? -1 : 1;
      return a.at - b.at; // temporel pour le reste
    });
    const top = journal.slice(0, 5);
    // Retri temporel pour la lecture
    top.sort((a, b) => a.at - b.at);
    const journalLines = top.map(e => `• ${e.text}`).join('\n\n');
    journalBlock = `\n\n**Journal de séjour — ${dock.name}.**\n\n*Équipage final : ${humorLabel}, ${physLabel}.*\n\n${journalLines}\n`;
  }

  // ─── D4.3 : section "Interactions au dock" (rumeurs, infos, deals, drinks) ───
  let interactionsBlock = '';
  const inter = mission._dockInteractions;
  if (inter && inter.lines.length > 0) {
    interactionsBlock = `\n\n**Au comptoir — interactions notables.**\n\n${inter.lines.map(l => '• ' + l).join('\n\n')}\n`;
  }

  // ─── D4.3 : section "Protection appliquée" si pertinente ───
  let protectionBlock = '';
  if (mission._protectionApplied) {
    const p = mission._protectionApplied;
    const reductionPct = Math.round(p.reduction * 100);
    if (p.reduction >= 1.0) {
      protectionBlock = `\n\n*${p.providedBy} avait apposé son sceau. Le tanker a été ignoré par tout ce qui rôdait sur la route.*\n`;
    } else {
      protectionBlock = `\n\n*${p.providedBy} a tenu sa promesse. La ${p.label.toLowerCase()} a réduit le risque de ${reductionPct}% (de ${Math.round(p.riskBefore)}% à ${Math.round(p.riskAfter)}%).*\n`;
    }
  }

  // ─── D5.3 fix #6 : section "Pillage par l'équipage" si pertinent ───
  let pillageBlock = '';
  if (mission._cargoPillaged) {
    const p = mission._cargoPillaged;
    if (p.palier === 'mutin' && p.isDrunk) {
      pillageBlock = `\n\n*⚠ L'équipage était mutin et ivre. ${p.pct}% du cargo (${p.amount} unités) "n'est jamais arrivé". ${crew} a juré que c'était les pirates de la route — personne n'y croit.*\n`;
    } else if (p.palier === 'mutin') {
      pillageBlock = `\n\n*⚠ L'équipage était mutin. ${p.pct}% du cargo (${p.amount} unités) a "disparu en route". On a retrouvé des traces de marchandise sur un quai voisin, plus tard.*\n`;
    } else if (p.palier === 'inquiet') {
      pillageBlock = `\n\n*⚠ L'équipage était inquiet et ivre. ${p.pct}% du cargo (${p.amount} unités) s'est volatilisé. Un vol opportuniste, sans doute. Rien à prouver.*\n`;
    }
  }

  return `**Trajet sur ${routeName} — ${moodLabel}.**

*Voyage à ${dock.name || 'destination'}. Cargo : ${mission.cargoTotal} unités au départ.*

${crew} a guidé le tanker ${mission.tankerName} le long de ${routeName}. ${mood?.bio || 'La route s\'est laissée traverser.'}${emptyLine}

À l'arrivée : **${dock.name}** — ${dock.sub}. ${dock.detail}${journalBlock}${interactionsBlock}${protectionBlock}${pillageBlock}${moodChangeLine}`;
}

// ─── D4.3 : résume les interactions PNJ du séjour (pour le rapport tanker) ───
function _summarizeDockInteractions(mission) {
  const result = { lines: [] };
  if (!mission?.npcInteractions || !mission.dock) return result;
  // Tous les jours du séjour (les PNJ changent chaque jour)
  const npcById = {};
  const DAY = 24 * 60 * 60 * 1000;
  const from = mission.dock.arrivedAt || mission.arrivalAt || Date.now();
  for (let t = from, n = 0; t <= Date.now() + DAY && n < 10; t += DAY, n++) {
    for (const x of getNpcMissionsAtDock(mission.dock, t)) npcById[x.id] = x;
  }

  for (const [npcId, state] of Object.entries(mission.npcInteractions)) {
    const npc = npcById[npcId];
    if (!npc) continue;
    const captain = npc.captain;
    // Inviter à boire est tracké séparément
    if (state.drinkApplied) {
      result.lines.push(`*${captain}* a accepté un verre. Souviens-toi des prix payés ce séjour.`);
    }
    if (!state.done) continue;
    const verb = state.verb;
    const r = state.lastResult;
    if (verb === 'rumor') {
      result.lines.push(`*${captain}* (rumeur) : ${r?.text || '—'}`);
    } else if (verb === 'info') {
      result.lines.push(`*${captain}* (info) : ${r?.text || '—'}`);
    } else if (verb === 'exchange') {
      result.lines.push(`*${captain}* (échange) : ${(r?.text || '—').replace(/^"|"$/g,'')}`);
    } else if (verb === 'protection') {
      result.lines.push(`*${captain}* (protection) : sceau accepté.`);
    } else if (verb === 'sell') {
      result.lines.push(`*${captain}* (vente d'infos) : ${(r?.text || '—').replace(/^"|"$/g,'')}`);
    }
  }
  return result;
}

function openTankerComposeForRoute(routeId) {
  const route = (G.routes || []).find(r => r.id === routeId);
  if (!route) return;
  // Trouver tier dispo (priorité T1 → T3)
  const stat = G.fleet?.stationed?.tanker || { t1:0, t2:0, t3:0 };
  const _envoys = window.SBBlackmarket ? SBBlackmarket.envoyChoices() : [];   // PATCH_0211_AMBASSADEUR
  let defaultTier = 1;
  if (stat.t1 > 0) defaultTier = 1;
  else if (stat.t2 > 0) defaultTier = 2;
  else if (stat.t3 > 0) defaultTier = 3;
  else if (!_envoys.length) {
    if (typeof toast === 'function') toast('Aucun tanker disponible. Construis-en un au Chantier orbital.');
    return;
  }
  _composeState = {
    routeId,
    tier: defaultTier,
    envoy: (stat.t1 > 0 || stat.t2 > 0 || stat.t3 > 0) ? null : _envoys[0],
    cargo: { metal: 0, energie: 0, cristal: 0 },
  };
  renderTankerComposeSheet(routeId);
  // PATCH_1510_MISSIONS — depuis la carte, la fenêtre n'était pas encore ouverte : on l'ouvre
  _commerceSheetContext = { type: 'route', id: routeId };
  const _ov = document.getElementById('commerce-sheet-overlay'); if (_ov) _ov.classList.add('shown');
}

function renderTankerComposeSheet(routeId) {
  const route = (G.routes || []).find(r => r.id === routeId);
  if (!route) return;
  const mood = ROUTE_MOODS[route.moodKey] || ROUTE_MOODS.nerveuse;
  const stat = G.fleet?.stationed?.tanker || { t1:0, t2:0, t3:0 };
  const _envoy = _composeState.envoy;   // PATCH_0211_AMBASSADEUR
  const tierCfg = _envoy ? { fuelCost: _envoy.fuel, cargoCapacity: _envoy.cargo, label: _envoy.name } : TANKER_TIER_CONFIG[_composeState.tier];
  const cargoTotal = (_composeState.cargo.metal || 0) + (_composeState.cargo.energie || 0) + (_composeState.cargo.cristal || 0);
  const cargoLeft = tierCfg.cargoCapacity - cargoTotal;
  const fuelOK = (G.fuel || 0) >= tierCfg.fuelCost;
  const tankerOK = !!_envoy || stat['t' + _composeState.tier] > 0;
  const canLaunch = fuelOK && tankerOK;

  document.getElementById('commerce-sheet-title').textContent = 'Envoyer un tanker';
  document.getElementById('commerce-sheet-subtitle').innerHTML = `<span style="color:${mood.accent}">${route.name} · ${mood.label}</span>`;

  // Boutons tier
  const tierButtons = [1, 2, 3].map(t => {
    const cfg = TANKER_TIER_CONFIG[t];
    const stock = stat['t' + t] || 0;
    const isSelected = !_envoy && _composeState.tier === t;
    const disabled = stock === 0;
    return `
      <button onclick="onComposeTierClick(${t})" ${disabled ? 'disabled' : ''} style="
        flex:1;padding:10px 6px;border:1px solid ${isSelected ? '#ffc864' : 'var(--line)'};
        background:${isSelected ? 'rgba(255,200,100,.10)' : 'transparent'};
        color:${disabled ? 'var(--mut)' : (isSelected ? '#ffc864' : 'var(--text)')};
        border-radius:6px;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '.4' : '1'};
        font-family:inherit;font-size:12px;font-weight:500
      ">
        ${cfg.label} <span style="font-size:9px;opacity:.7">(${stock})</span><br>
        <span style="font-size:9px;color:var(--mut);font-weight:400">${cfg.cargoCapacity} cargo</span><br>
        <span style="font-size:9px;color:var(--mut);font-weight:400">-${cfg.fuelCost} carburant</span>
      </button>
    `;
  }).join('');

  // Sliders cargo
  const cargoRows = ['metal', 'energie', 'cristal'].map(k => {
    const stock = G.res[k]?.v || 0;
    const max = Math.min(stock, cargoLeft + (_composeState.cargo[k] || 0));
    const colors = { metal: '#cececd', energie: '#ffaf3a', cristal: '#6db032' };
    const labels = { metal: 'Métal', energie: 'Énergie', cristal: 'Cristal' };
    return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <span style="font-size:11px;color:${colors[k]};font-weight:500">${labels[k]}</span>
          <span style="font-size:11px;color:var(--mut);font-family:'SF Mono',monospace">${_composeState.cargo[k] || 0} <span style="opacity:.6">/ ${stock} dispo</span></span>
        </div>
        <input type="range" min="0" max="${max}" value="${_composeState.cargo[k] || 0}" step="${Math.max(1, Math.floor(max / 50))}"
          oninput="onComposeCargoChange('${k}', this.value)"
          style="width:100%;accent-color:${colors[k]}">
      </div>
    `;
  }).join('');

  document.getElementById('commerce-sheet-body').innerHTML = `
    <!-- Choix tier -->
    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Tanker à envoyer</div>
      <div style="display:flex;gap:6px">${tierButtons}</div>
      ${window.SBBlackmarket ? SBBlackmarket.envoyRows(_envoy && _envoy.pid, 'onComposeEnvoyClick', { fuel: true }) : ''}
    </div>

    <!-- Cargo -->
    ${_envoy && !_envoy.cargo ? `<div style="margin-bottom:14px;padding:12px 14px;border:1px dashed rgba(201,164,90,.4);border-radius:8px;font-size:12px;line-height:1.5;color:var(--mut)"><span style="color:#c9a45a">${_envoy.name}</span> n'a pas de cale. Il ne vient pas commercer : il vient pour être vu.</div>` : `
    <div style="margin-bottom:14px;padding-top:10px;border-top:1px solid var(--border-soft)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <div style="font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Cargo de départ</div>
        <div style="font-size:11px;font-family:'SF Mono',monospace;color:${cargoTotal > tierCfg.cargoCapacity ? '#e87a7a' : '#ffc864'}">${cargoTotal} / ${tierCfg.cargoCapacity}</div>
      </div>
      ${cargoRows}
      ${cargoTotal === 0 && !_envoy ? `
        <div style="margin-top:8px;padding:8px 10px;background:rgba(232,122,122,.08);border:1px solid rgba(232,122,122,.25);border-radius:4px;font-size:10px;color:#e87a7a;line-height:1.5">
          ⚠ Tanker vide : la route n'aime pas ça. Stabilité -5% au retour.
        </div>
      ` : ''}
    </div>`}

    <!-- Récap -->
    <div style="padding-top:10px;border-top:1px solid var(--border-soft);font-size:11px;color:var(--mut);line-height:1.7">
      <div>Carburant requis : <span style="color:${fuelOK ? '#8bc24a' : '#e87a7a'};font-family:'SF Mono',monospace">${tierCfg.fuelCost}</span> · disponible : <span style="font-family:'SF Mono',monospace;color:${fuelOK ? 'var(--text)' : '#e87a7a'}">${G.fuel || 0}</span></div>
      <div style="margin-top:4px;font-style:italic;color:var(--mut)">Durée estimée : 5–10 min (phase test)</div>
    </div>
  `;

  document.getElementById('commerce-sheet-actions').innerHTML = `
    <button class="commerce-sheet-btn commerce-sheet-btn-primary" ${canLaunch ? '' : 'disabled style="opacity:.4;cursor:not-allowed"'} onclick="onLaunchTankerOnRouteClick()">
      ${canLaunch ? (_envoy ? 'Envoyer ' + _envoy.name : 'Lancer le tanker') : (!fuelOK ? 'Carburant insuffisant' : 'Aucun tanker disponible')}
    </button>
    <button class="commerce-sheet-btn commerce-sheet-btn-secondary" onclick="openCommerceSheet('route','${routeId}')">
      ← Retour route
    </button>
  `;
}

// PATCH_0211_AMBASSADEUR
function onComposeEnvoyClick(pid) {
  if (!_composeState || !window.SBBlackmarket) return;
  const e = SBBlackmarket.envoyChoices().find(x => x.pid === pid); if (!e) return;
  _composeState.envoy = e;
  const total = (_composeState.cargo.metal || 0) + (_composeState.cargo.energie || 0) + (_composeState.cargo.cristal || 0);
  if (total > (e.cargo || 0)) _composeState.cargo = { metal: 0, energie: 0, cristal: 0 };
  renderTankerComposeSheet(_composeState.routeId);
}
function onComposeTierClick(tier) {
  if (!_composeState) return;
  _composeState.envoy = null;   // PATCH_0211_AMBASSADEUR
  _composeState.tier = tier;
  // Reset cargo si capacité réduite
  const cfg = TANKER_TIER_CONFIG[tier];
  const total = (_composeState.cargo.metal || 0) + (_composeState.cargo.energie || 0) + (_composeState.cargo.cristal || 0);
  if (total > cfg.cargoCapacity) {
    _composeState.cargo = { metal: 0, energie: 0, cristal: 0 };
  }
  renderTankerComposeSheet(_composeState.routeId);
}

function onComposeCargoChange(resKey, val) {
  if (!_composeState) return;
  _composeState.cargo[resKey] = parseInt(val, 10) || 0;
  renderTankerComposeSheet(_composeState.routeId);
}

function onLaunchTankerOnRouteClick() {
  if (!_composeState) return;
  const mission = launchTankerOnRoute(_composeState.routeId, 't' + _composeState.tier, _composeState.cargo, _composeState.envoy);
  if (mission) {
    _composeState = null;
    // Bascule sur la fiche route mise à jour (badge tanker en route)
    openCommerceSheet('route', mission.routeId);
  }
}

// ─── Ouvrir l'écran du dock ───
// Ferme le sheet Commerce et navigue vers scr-dock pour cette mission.
function onOpenDockClick(missionId) {
  closeCommerceSheet();
  _activeDockMissionId = missionId;
  goto('dock');
}

// PUBLIC : Ouvrir le dock depuis l'écran Flotte (D5.2 — accès direct au tanker au quai)
function openDockFromFleet(missionId) {
  _activeDockMissionId = missionId;
  goto('dock');
}

// Démarre le ticker quand le joueur est sur l'écran dock — auto-refresh + tick humeur
function _startDockScreenTicker() {
  if (_dockScreenTicker) return;
  _dockScreenTicker = setInterval(() => {
    // Si plus sur l'écran dock, arrêter
    const dockScr = document.getElementById('scr-dock');
    if (!dockScr || dockScr.classList.contains('hidden') || !_activeDockMissionId) {
      clearInterval(_dockScreenTicker);
      _dockScreenTicker = null;
      return;
    }
    // Tick global pour faire avancer humeur + auto-départ
    if (typeof tickTankerMissions === 'function') tickTankerMissions();
    // Re-render l'écran dock
    if (typeof renderDockScreen === 'function') renderDockScreen();
  }, 2000);
}

// Rappel manuel du tanker depuis le dock : déclenche le retour, génère le rapport,
// puis renvoie le joueur au hub Commerce.
// Mode replace : le dock disparaît de la stack de navigation (le retour depuis commerce
// ne re-vient PAS au dock, fix 18/05).
async function onRecallTankerFromDock() {
  if (!_activeDockMissionId) {
    goto('commerce', { replace: true });
    return;
  }
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  const tankerName = mission?.tankerName || 'le tanker';
  const dockName = mission?.dock?.name || 'le dock';
  // Confirmation avant rappel (action coûteuse en carburant + bloque la suite du séjour)
  const ok = await sbConfirmDanger(
    'Rappeler le tanker',
    `${tankerName} va quitter ${dockName} et entamer son trajet retour. Le séjour est interrompu.<br><br><em>Tu peux aussi le laisser amarré et revenir plus tard si tu veux laisser tourner les événements.</em>`,
    'Rappeler'
  );
  if (!ok) return;
  const result = returnTankerFromDock(_activeDockMissionId);
  _activeDockMissionId = null;
  if (typeof closeNpcSheet === 'function') closeNpcSheet();
  // Si le tanker a été perdu, result est null mais le rapport est déjà stocké
  goto('commerce', { replace: true });
}

// Quitter l'écran dock sans rappeler le tanker (le tanker reste amarré, le séjour continue)
// Le joueur peut revenir dessus en re-cliquant la route depuis le hub Commerce.
function onLeaveDockBack() {
  _activeDockMissionId = null;
  if (typeof closeNpcSheet === 'function') closeNpcSheet();
  goto('commerce', { replace: true });
}
function _crownCss() {
  if (document.getElementById('crown-css')) return;
  const st = document.createElement('style'); st.id = 'crown-css';
  st.textContent = `
    #crown-hero{position:relative;height:44vh;min-height:250px;max-height:460px;margin:0 0 16px;border-radius:0 0 14px 14px;overflow:hidden;background:#010207;cursor:pointer;-webkit-tap-highlight-color:transparent}
    #crown-hero.fs{position:fixed;inset:0;height:100%;max-height:none;margin:0;border-radius:0;z-index:9000;cursor:grab}
    #crown-hero canvas{touch-action:pan-y}
    #crown-hero>div:not(.cr-load){z-index:2}
    #crown-hero .cr-load{z-index:2}
    #crown-hero.fs canvas{touch-action:none}
    #crown-hero .cr-ttl{position:absolute;left:0;right:0;top:0;padding:calc(14px + env(safe-area-inset-top,0px)) 16px 34px;background:linear-gradient(180deg,rgba(1,2,7,.85),rgba(1,2,7,0));pointer-events:none}
    #crown-hero:not(.fs) .cr-ttl{padding-top:14px}
    #crown-hero .cr-ttl b{display:block;font-size:19px;letter-spacing:.14em;color:#ffd27a;font-weight:700;text-shadow:0 0 18px rgba(255,170,60,.45)}
    #crown-hero .cr-ttl span{display:block;margin-top:3px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(230,240,255,.65)}
    #crown-hero .cr-bot{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:30px 12px calc(12px + env(safe-area-inset-bottom,0px));background:linear-gradient(0deg,rgba(1,2,7,.8),rgba(1,2,7,0))}
    #crown-hero:not(.fs) .cr-bot{padding-bottom:12px}
    #crown-hero .cr-chip{white-space:nowrap;padding:7px 12px;border-radius:999px;border:1px solid rgba(240,181,74,.45);background:rgba(10,8,4,.55);color:#ffd27a;font:inherit;font-size:11px;letter-spacing:.08em;cursor:pointer}
    #crown-hero .cr-chip.on{background:rgba(240,181,74,.22);border-color:#f0b54a;color:#fff3d6}
    #crown-hero .cr-sp{flex:1}
    #crown-hero .cr-hint{font-size:10px;color:rgba(230,240,255,.6);letter-spacing:.06em}
    #crown-hero .cr-x{position:absolute;right:12px;top:calc(12px + env(safe-area-inset-top,0px));width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(1,2,7,.55);color:#e6f0ff;font-size:18px;line-height:34px;text-align:center;cursor:pointer;display:none}
    #crown-hero.fs .cr-x{display:block}
    #crown-hero .cr-load{position:absolute;left:16px;right:16px;top:50%;height:2px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
    #crown-hero .cr-load i{display:block;height:100%;width:0;background:#f0b54a;transition:width .2s}
    #crown-hero.ready .cr-load{display:none}
    #crown-hero .cr-intro{position:absolute;left:0;right:0;bottom:calc(84px + env(safe-area-inset-bottom,0px));text-align:center;pointer-events:none;opacity:0;transition:opacity 1.6s}
    #crown-hero .cr-intro.on{opacity:1}
    #crown-hero .cr-intro b{display:block;font-size:26px;letter-spacing:.2em;color:#ffd27a;text-shadow:0 0 24px rgba(255,170,60,.6)}
    #crown-hero .cr-intro span{display:block;margin-top:8px;font-size:12px;color:rgba(230,240,255,.8);font-style:italic;font-family:'Charter','Iowan Old Style',Georgia,serif;padding:0 28px}
    #crown-hero .cr-enter{display:none;padding:10px 18px;border-radius:999px;border:1px solid #f0b54a;background:rgba(240,181,74,.2);color:#fff3d6;font:inherit;font-size:12px;letter-spacing:.12em;cursor:pointer}
    #crown-hero.fs.first .cr-enter{display:inline-block}
    #crown-hero.fs.first .cr-chip,#crown-hero.fs.first .cr-hint{display:none}
    #crown-hero.fs.first .cr-ttl{opacity:0}
    #crown-hero .cr-enter{white-space:nowrap}
    .crown-bar{margin:0 0 12px;padding:14px 14px 12px;border:1px solid rgba(240,181,74,.4);border-radius:10px;background:linear-gradient(180deg,rgba(240,181,74,.10),rgba(0,0,0,.15));cursor:pointer}
    .crown-bar b{display:block;font-size:13px;color:#ffd27a;letter-spacing:.06em}
    .crown-bar span{display:block;margin-top:4px;font-size:11px;color:var(--mut);line-height:1.5}
    .crown-bar i{display:inline-block;margin-top:8px;font-style:normal;font-size:10px;letter-spacing:.12em;color:#f0b54a}`;
  document.head.appendChild(st);
}
// ═══ PATCH_1510_CROWN_SCENE — la Couronne en plein écran, le panneau par-dessus (comme la flotte) ═══
function _crownCss2() {
  if (document.getElementById('crown-css2')) return;
  const st = document.createElement('style'); st.id = 'crown-css2';
  st.textContent = `
    .crh{position:absolute;inset:0;z-index:0;overflow:hidden;background:#010207}
    .crh canvas{touch-action:none}
    .crh>div{z-index:2}
    .crh .cr-ttl{position:absolute;left:0;right:0;top:0;padding:calc(16px + env(safe-area-inset-top,0px)) 60px 30px;text-align:center;background:linear-gradient(180deg,rgba(1,2,7,.8),rgba(1,2,7,0));pointer-events:none}
    .crh .cr-ttl small{display:block;font-size:9.5px;letter-spacing:.32em;color:#f0b54a;margin-bottom:4px}
    .crh .cr-ttl b{display:block;font-size:18px;letter-spacing:.14em;color:#ffd27a;font-weight:700;text-shadow:0 0 18px rgba(255,170,60,.45)}
    .crh .cr-ttl b.long{font-size:15px;letter-spacing:.08em}
    .crh .cr-intro b.long{font-size:19px;letter-spacing:.1em}
    .crh .cr-ttl span{display:block;margin-top:4px;font-size:10px;letter-spacing:.1em;color:rgba(230,240,255,.7)}
    .crh .cr-chips{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 92px);display:flex;justify-content:center;gap:6px}
    .crh .cr-chip{white-space:nowrap;padding:6px 12px;border-radius:999px;border:1px solid rgba(240,181,74,.4);background:rgba(10,8,4,.5);color:#ffd27a;font:inherit;font-size:10.5px;letter-spacing:.08em;cursor:pointer}
    .crh .cr-chip.on{background:rgba(240,181,74,.22);border-color:#f0b54a;color:#fff3d6}
    .crh .cr-load{position:absolute;left:16px;right:16px;top:46%;height:2px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
    .crh .cr-load i{display:block;height:100%;width:0;background:#f0b54a;transition:width .2s}
    .crh.ready .cr-load{display:none}
    .crh .cr-intro{position:absolute;left:0;right:0;bottom:calc(60px + env(safe-area-inset-bottom,0px));text-align:center;opacity:0;pointer-events:none;transition:opacity 1.6s}
    .crh .cr-intro.on{opacity:1;pointer-events:auto}
    .crh .cr-intro b{display:block;font-size:24px;letter-spacing:.2em;color:#ffd27a;text-shadow:0 0 24px rgba(255,170,60,.6)}
    .crh .cr-intro span{display:block;margin:8px 0 18px;font-size:12px;color:rgba(230,240,255,.85);font-style:italic;font-family:'Charter','Iowan Old Style',Georgia,serif;padding:0 28px;line-height:1.55}
    .cr-big{display:block;width:100%;padding:15px;border-radius:12px;border:1px solid #f0b54a;background:linear-gradient(180deg,rgba(240,181,74,.32),rgba(240,181,74,.14));color:#fff3d6;font:inherit;font-size:14px;font-weight:700;letter-spacing:.26em;cursor:pointer;box-shadow:0 0 22px rgba(240,181,74,.18)}
    .cr-big:active{background:rgba(240,181,74,.4)}
    .crh .cr-intro .cr-big{width:auto;display:inline-block;padding:13px 30px}
    /* écran du dock de la Couronne : la 3D derrière, les cartes défilent par-dessus */
    #scr-dock.cr-scene > .stars,#scr-dock.cr-scene > .glow,#scr-dock.cr-scene .head,#scr-dock.cr-scene #dock-banner{display:none !important}
    #scr-dock.cr-scene{background:#010207}
    /* PATCH_1510_HERO_SCROLL — comme la flotte : la 3D derrière, la fiche défile par-dessus, la zone du haut garde les gestes */
    #scr-dock.cr-scene .screen-scroll{overscroll-behavior:contain}
    /* ROUTES_V2 (03/11, Adrien) : le tiroir prend toute la largeur de l'écran */
    #scr-dock.cr-scene #dock-body{padding:0 !important}
    #scr-dock.cr-scene #dock-body > div{border-radius:0 !important;border-left:0 !important;border-right:0 !important;margin-left:0 !important;margin-right:0 !important}
    #scr-dock.cr-scene #dock-body > div > div[style*="border-radius"]{border-radius:0 !important}
    #scr-dock.cr-scene #crown-space{touch-action:none}
    #crown-scene3d.crh{z-index:auto}
    #crown-scene3d .cr-ttl{z-index:1}
    #crown-scene3d .cr-chips{z-index:3;transition:opacity .2s}
    #crown-scene3d .cr-intro{z-index:4}
    #crown-scene3d .cr-load{z-index:1}
    .crh .cr-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:rgba(3,5,9,.84);opacity:var(--hs,0)}
    .crh canvas{filter:saturate(calc(1 - var(--hs, 0) * .5))}
    .cr-scene .cr-chips,#crown-sp .cr-chips{opacity:calc(1 - var(--hs, 0) * 2.5)}
    .cr-scene.cr-faded .cr-chips,#crown-sp.cr-faded .cr-chips{pointer-events:none}
    #crown-grip{margin:0 10px;padding:9px 14px 10px;border-radius:16px 16px 0 0;background:rgba(8,9,14,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(240,181,74,.32);border-bottom:0;text-align:center;cursor:pointer}
    #crown-grip i{display:block;width:38px;height:4px;border-radius:2px;background:rgba(240,181,74,.45);margin:0 auto 8px}
    #crown-grip b{display:block;font-size:13px;letter-spacing:.08em;color:#ffd27a}
    #crown-grip span{display:block;margin-top:3px;font-size:10.5px;color:rgba(230,240,255,.7)}
    #scr-dock.cr-scene #dock-body{margin:0 10px;padding:10px 12px 14px !important;background:rgba(8,9,14,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(240,181,74,.18);border-top:0;border-radius:0 0 16px 16px}
    #scr-dock.cr-scene footer.actions{background:linear-gradient(0deg,rgba(1,2,7,.92),rgba(1,2,7,.6));padding-top:10px}
    #scr-dock.cr-first .screen-scroll,#scr-dock.cr-first footer.actions,#scr-dock.cr-first .cr-chips,#scr-dock.cr-first .w-screen-x{opacity:0;pointer-events:none !important}
    #scr-dock.cr-first .cr-ttl{opacity:0}
    /* vue spatiale (pas de tanker à quai) : par-dessus tout, une fiche refermable */
    #crown-sp{position:fixed;inset:0;z-index:9000;background:#010207}
    #crown-sp .crs-x{position:absolute;right:10px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:5;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(1,2,7,.6);color:#e6f0ff;font-size:22px;line-height:40px;text-align:center;cursor:pointer;padding:0}
    #crown-sp .crh{z-index:auto}
    #crown-sp .crh .cr-ttl{z-index:1}
    #crown-sp .crh .cr-chips{z-index:3;transition:opacity .2s}
    #crown-sp .crs-scroll{position:absolute;inset:0;z-index:2;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
    #crown-sp .crs-space{touch-action:none}
    #crown-sp .crs-card{position:relative;margin:0 10px calc(env(safe-area-inset-bottom,0px) + 16px);padding:0 16px 18px;border-radius:16px;background:rgba(8,9,14,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(240,181,74,.32);transition:transform .25s ease;opacity:0;transform:translateY(20px)}
    #crown-sp.shown .crs-card{opacity:1;transform:none;transition:opacity .5s,transform .5s}
    #crown-sp .crs-grip{padding:9px 0 4px;cursor:pointer;text-align:center}
    #crown-sp .crs-grip i{display:block;width:38px;height:4px;border-radius:2px;background:rgba(240,181,74,.45);margin:0 auto}
    #crown-sp .crs-k{font-size:9.5px;letter-spacing:.32em;color:#f0b54a;text-align:center;margin-top:6px}
    #crown-sp .crs-t{font-size:20px;letter-spacing:.1em;color:#ffd27a;font-weight:700;text-align:center;margin-top:4px}
    #crown-sp .crs-s{font-size:10.5px;color:rgba(230,240,255,.7);text-align:center;margin:4px 0 12px}
    #crown-sp .crs-body p{margin:0 0 12px;font-size:12.5px;line-height:1.65;color:#e6f0ff;font-style:italic;font-family:'Charter','Iowan Old Style',Georgia,serif}
    #crown-sp .crs-row{display:flex;gap:8px;margin-top:8px}
    #crown-sp .crs-row button{flex:1;padding:11px 8px;border-radius:10px;border:1px solid rgba(240,181,74,.35);background:rgba(240,181,74,.06);color:#ffd27a;font:inherit;font-size:11.5px;cursor:pointer}
    #crown-sp .crs-note{font-size:11px;color:var(--mut);text-align:center;font-style:italic;line-height:1.5;margin-top:10px}
    #crown-sp .crs-body p{font-size:13.5px}
    #crown-sp .crh .cr-ttl{opacity:calc(1 - var(--hs, 0) * 2)}
    #crown-sp .crh .cr-ttl{transition:opacity .3s}
    #crown-sp .crs-hint{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 128px);text-align:center;font-size:10px;letter-spacing:.08em;color:rgba(230,240,255,.5);z-index:3;pointer-events:none}
    /* carte : la fiche de la Couronne */
    .sm-panel .smc-k{font-size:9.5px;letter-spacing:.32em;color:#f0b54a}
    .sm-panel .smc-t{font-size:19px;letter-spacing:.08em;color:#ffd27a;font-weight:700;margin:3px 0 2px}
    .sm-panel .smc-enter{margin:12px -36px 4px 0;width:calc(100% + 36px)}`;
  document.head.appendChild(st);
}
// une station en 3D pour ce dock (objet dock ou identifiant) ?
function stationUI(d) {
  const id = d && typeof d === 'object' ? d.id : d;
  for (const k in STATION_UI) if (STATION_UI[k].id === id) return STATION_UI[k];
  return null;
}
// PATCH_1510_CROWN_SCENE2
function _crEsc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
// où en est-on à la Couronne : tanker amarré (dock), équipage au bar (séjour en cours), ou personne
function crownMission(id) {
  id = id || CROWN_DOCK_ID;
  return (G.tankerMissions || []).find(m => m.status === 'docked' && m.dock && m.dock.id === id) || null;
}
function crownState(id) {
  id = id || CROWN_DOCK_ID;
  const U = stationUI(id) || STATION_UI.crown;
  const m = crownMission(id);
  if (m) return { m, view: m.dockStay ? 'bar' : 'dock', label: m.dockStay ? `${m.tankerName} amarré · l'équipage est ${U.crewAt}` : `${m.tankerName} est amarré au dock` };
  const inbound = (G.tankerMissions || []).find(x => x.status === 'in_transit' && ((x.dock && x.dock.id === id) || x.routeId === 'rt-ln-' + id));
  return { m: null, inbound, view: 'port', label: inbound ? `${inbound.tankerName} en route · arrivée dans ${typeof formatTankerDuration === 'function' ? formatTankerDuration(Math.max(0, (inbound.arrivalAt || 0) - Date.now())) : '…'}` : 'aucun tanker à quai' };
}
function _crownPort(id) {
  if (!window.SBLines) return null;
  id = id || CROWN_DOCK_ID;
  return Object.values(SBLines.network().ports).find(x => x.dockId === id) || null;
}
// ENTRER : selon ce qui se passe là-bas, la bonne vue
function _crScroll(sc, top) {
  if (!sc) return;
  const from = sc.scrollTop, d = top - from, t0 = performance.now();
  if (Math.abs(d) < 2) return;
  const step = (now) => { const k = Math.min(1, (now - t0) / 380), e = 1 - Math.pow(1 - k, 3); sc.scrollTop = from + d * e; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function crownEnter(id) {
  id = id || CROWN_DOCK_ID;
  const st = crownState(id);
  if (st.m) { if (typeof crownSpaceClose === 'function') crownSpaceClose(); openDockFromFleet(st.m.id); return; }
  crownSpaceOpen(id);
}
function crownDockHero(dock) {
  const scr = document.getElementById('scr-dock');
  const scroll = scr && scr.querySelector('.screen-scroll');
  const U = stationUI(dock);
  if (!dock || !U || !scroll || !window.WebGLRenderingContext) { crownUnmount(); return; }
  if (_crown && _crown.U !== U) crownUnmount();   // on passe d'une station à l'autre
  const m = (G.tankerMissions || []).find(x => x.id === _activeDockMissionId);
  const want = m && m.dockStay ? 'bar' : 'dock';
  const sub = m ? (m.dockStay ? `${m.tankerName} amarré · ton équipage est ${U.crewAt}` : `${m.tankerName} est amarré · choisis la durée du séjour`) : '';
  if (_crown && _crown.el.isConnected) {
    if (_crown.state !== want) { _crown.state = want; if (!_crown.first) crownSetView(want); }
    const gs = _crown.grip.querySelector('span'); if (gs.textContent !== sub) gs.textContent = sub;
    return;
  }
  _crownCss(); _crownCss2();
  const first = !G[U.seen];
  const sys = typeof mpDockSystem === 'function' ? mpDockSystem(dock) : '';
  const el = document.createElement('div');
  el.id = 'crown-scene3d'; el.className = 'crh';
  el.innerHTML = `<div class="cr-ttl"><small>${U.kicker}</small><b${U.long ? ' class="long"' : ''}>${U.title}</b><span>${sys ? '⌖ ' + sys + ' · ' : ''}${U.sub}</span></div>
    <div class="cr-chips"><button class="cr-chip" data-v="dock">${U.chips.dock}</button><button class="cr-chip" data-v="bar">${U.chips.bar}</button><button class="cr-chip" data-v="port">${U.chips.port}</button></div>
    <div class="cr-load"><i></i></div>
    <div class="cr-intro"><b${U.long ? ' class="long"' : ''}>${U.title}</b><span>${U.intro}</span><button class="cr-big">${U.enter}</button></div><div class="cr-scrim"></div>`;
  scr.insertBefore(el, scroll);
  const space = document.createElement('div'); space.id = 'crown-space';
  const grip = document.createElement('div'); grip.id = 'crown-grip';
  grip.innerHTML = `<i></i><b>${_crEsc(dock.name || 'The Drifting Crown')}</b><span>${_crEsc(sub)}</span>`;
  scroll.insertBefore(space, scroll.firstChild); space.after(grip);
  scr.classList.add('cr-scene'); if (first) scr.classList.add('cr-first');
  const fit = () => { if (_crown && _crown.space) _crown.space.style.height = Math.max(160, scroll.clientHeight - 170) + 'px'; };   // PATCH_1510_HERO_SCROLL
  _crown = { el, space, grip, scr, scroll, handle: null, state: want, first, fit, U };
  st3dSleep();
  fit(); scroll.scrollTop = 0;
  window.addEventListener('resize', fit);
  const load = el.querySelector('.cr-load i');
  const start = () => {
    if (!_crown || _crown.el !== el) return;
    _crown.handle = window.Station3D.mount(el, {
      url: U.url, profile: U.profile, view: first ? 'port' : want, intro: first, interactive: true, tanker: true,
      onProgress: (k) => { load.style.width = Math.round(k * 100) + '%'; },
      onReady: () => { el.classList.add('ready'); if (first) setTimeout(() => el.querySelector('.cr-intro').classList.add('on'), 3800); },
      onError: () => { crownUnmount(); },
    });
    _crownChips(first ? 'port' : want);
  };
  if (window.Station3D) start(); else window.addEventListener('station3d-ready', start, { once: true });
  el.addEventListener('click', (e) => {
    const chip = e.target.closest('.cr-chip');
    if (chip) { e.stopPropagation(); crownSetView(chip.dataset.v); return; }
    if (e.target.closest('.cr-big')) { e.stopPropagation(); _crownEnterPort(); return; }
  });
  // la zone libre du haut : gestes 3D (tourner, pincer) ; un simple toucher fait redescendre la fiche
  if (window.SBHero) {
    SBHero.gestures(space, () => (_crown && _crown.el === el ? _crown.handle : null), () => crownSheet(false));
    SBHero.fade(scroll, space, scr);
    scroll.addEventListener('scroll', () => scr.classList.toggle('cr-faded', scroll.scrollTop > space.offsetHeight * 0.3), { passive: true });
  }
  // la poignée : toucher = la fiche monte (ou redescend)
  grip.addEventListener('click', () => crownSheet(scroll.scrollTop < 30));
  if (first) { G[U.seen] = Date.now(); if (typeof saveGame === 'function') saveGame(); }
}
function crownSheet(open) {
  if (!_crown) return;
  _crScroll(_crown.scroll, open ? Math.max(0, _crown.space.offsetHeight - 70) : 0);
}
function _crownEnterPort() {
  if (!_crown) return;
  _crown.first = false;
  _crown.scr.classList.remove('cr-first');
  _crown.el.querySelector('.cr-intro').classList.remove('on');
  crownSetView(_crown.state);
}
function _crownChips(v) {
  for (const root of [_crown && _crown.el, _crownSpace && _crownSpace.el]) if (root) root.querySelectorAll('.cr-chip').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
function crownSetView(v) {
  if (!_crown) return;
  if (_crown.handle) _crown.handle.setView(v);
  _crownChips(v);
}
function crownFullscreen() {}   // ancien plein écran : la scène est désormais toujours plein écran
function crownUnmount() {
  if (!_crown) return;
  try { if (_crown.handle) _crown.handle.dispose(); } catch (e) {}
  window.removeEventListener('resize', _crown.fit);
  _crown.el.remove(); if (_crown.space) _crown.space.remove(); if (_crown.grip) _crown.grip.remove();
  if (_crown.scr) { _crown.scr.classList.remove('cr-scene', 'cr-first', 'cr-open', 'cr-faded'); _crown.scr.style.removeProperty('--hs'); }
  _crown = null;
  st3dSleep();
  const banner = document.getElementById('dock-banner'); if (banner) banner.style.display = '';
}
// le bar : l'en-tête de la section des commandants à quai ; il envoie la caméra sur la façade
function crownBarHeader(dock) {
  const U = stationUI(dock) || STATION_UI.crown;
  return `<div class="crown-bar" onclick="crownShowBar()"><b>${U.hall.t}</b><span>${U.hall.s}</span><i>${U.hall.i}</i></div>`;
}   // PATCH_2010_STATION_MEMOIRE
function _st3dEngines() {
  const out = [];
  try { if (window.Planet3D && Planet3D.ready && Planet3D.renderer) out.push(Planet3D); } catch (e) {}
  try { const E = window.SBMap && SBMap._e; if (E && E.ready && E.renderer) out.push(E); } catch (e) {}
  return out;
}
function st3dSleep() {
  const want = !!(_crownSpace || (_crown && _crown.el && _crown.el.isConnected));   // une station est à l'écran
  if (want === _st3dAsleep) return;
  _st3dAsleep = want;
  for (const e of _st3dEngines()) {
    try {
      if (want) { e.renderer.setSize(1, 1, false); if (e.composer) e.composer.setSize(1, 1); if (e.bloom && e.bloom.setSize) e.bloom.setSize(1, 1); }
      else if (typeof e._resize === 'function') e._resize();
    } catch (err) { console.warn('[station] veille 3D', err); }
  }
}
function crownSpaceOpen(id) {
  if (_crownSpace || !window.WebGLRenderingContext) return;
  id = id || CROWN_DOCK_ID;
  const U = stationUI(id) || STATION_UI.crown, D = STATION_DOCKS[id] || CROWN_DOCK;
  _crownCss(); _crownCss2();
  const port = _crownPort(id);
  const st = crownState(id);
  const route = port && (G.routes || []).find(r => r.portSys === port.sys || r.dockId === id);
  const e = _crEsc;
  let acts = '';
  const _sendLbl = route && typeof routeNextTankerLabel === 'function' ? routeNextTankerLabel(route.id) : 'Envoyer un tanker';   // PATCH_1510_ROUTE_MULTI
  if (st.inbound) acts = (route ? `<button class="cr-big" data-a="send">${e(_sendLbl).toUpperCase()}</button>` : '') + `<div class="crs-row"><button data-a="mission">Voir la mission de ${e(st.inbound.tankerName)}</button></div>`;
  else if (route) acts = `<button class="cr-big" data-a="send">${e(_sendLbl).toUpperCase()}</button><div class="crs-row"><button data-a="route">Voir la route</button><button data-a="bar">Voir ${U.place}</button></div><div class="crs-note">Un tanker suit la ligne jusqu'au dock. Amarré, tu entres ; à quai, ton équipage descend ${U.crewAt}.</div>`;
  else acts = `<div class="crs-row"><button data-a="bar">Voir ${U.place}</button></div><div class="crs-note">Aucune route connue jusqu'ici : remonte la ligne balise après balise pour y envoyer un tanker.</div>`;
  const el = document.createElement('div'); el.id = 'crown-sp';
  el.innerHTML = `<div class="crh">
      <div class="cr-ttl"><small>${U.kicker}</small><b${U.long ? ' class="long"' : ''}>${U.title}</b><span>${port ? '⌖ ' + e(port.sys) + ' · ' : ''}${e(st.label)}</span></div>
      <div class="cr-chips"><button class="cr-chip on" data-v="port">${U.chips.port}</button><button class="cr-chip" data-v="bar">${U.chips.bar}</button></div>
      <div class="cr-load"><i></i></div><div class="cr-scrim"></div>
    </div>
    <div class="crs-hint">Glisser pour tourner · pincer pour zoomer</div>
    <button class="crs-x" aria-label="Fermer">×</button>
    <div class="crs-scroll"><div class="crs-space"></div><div class="crs-card"><div class="crs-grip"><i></i></div><div class="crs-k">${U.kicker}</div><div class="crs-t">${e(D.name)}</div><div class="crs-s">${e(st.label)}</div>
      <div class="crs-body"><p>${e(D.ambience)}</p>${acts}</div></div></div>`;
  document.body.appendChild(el);
  const hero = el.querySelector('.crh'), load = el.querySelector('.cr-load i'), card = el.querySelector('.crs-card');
  const csc = el.querySelector('.crs-scroll'), csp = el.querySelector('.crs-space');
  const cfit = () => { csp.style.height = Math.max(200, csc.clientHeight - 210) + 'px'; };
  cfit(); window.addEventListener('resize', cfit);
  _crownSpace = { el, handle: null, cfit };
  st3dSleep();
  if (window.SBHero) {
    SBHero.gestures(csp, () => (_crownSpace && _crownSpace.el === el ? _crownSpace.handle : null), () => SBHero.scrollTo(csc, 0));
    SBHero.fade(csc, csp, el);
    csc.addEventListener('scroll', () => el.classList.toggle('cr-faded', csc.scrollTop > csp.offsetHeight * 0.3), { passive: true });
  }
  const start = () => {
    if (!_crownSpace || _crownSpace.el !== el) return;
    _crownSpace.handle = window.Station3D.mount(hero, { url: U.url, profile: U.profile, view: 'port', intro: true, interactive: true,
      onProgress: (k) => { load.style.width = Math.round(k * 100) + '%'; },
      onReady: () => { hero.classList.add('ready'); setTimeout(() => el.classList.add('shown'), 2600); },
      onError: () => crownSpaceClose() });
  };
  if (window.Station3D) start(); else window.addEventListener('station3d-ready', start, { once: true });
  setTimeout(() => el.classList.add('shown'), 6000);   // au cas où le modèle tarde : la fiche ne reste pas cachée
  el.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.cr-chip');
    if (chip && _crownSpace.handle) { _crownSpace.handle.setView(chip.dataset.v); _crownChips(chip.dataset.v); return; }
    if (ev.target.closest('.crs-x')) { crownSpaceClose(); return; }
    if (ev.target.closest('.crs-grip')) { if (window.SBHero) SBHero.scrollTo(csc, csc.scrollTop < 30 ? Math.max(0, csp.offsetHeight - 60) : 0); return; }
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'bar') { if (_crownSpace.handle) _crownSpace.handle.setView('bar'); _crownChips('bar'); if (window.SBHero) SBHero.scrollTo(csc, 0); return; }
    crownSpaceClose();
    if (a === 'send' && route) openTankerComposeForRoute(route.id);
    else if (a === 'route' && route && window.SBMap) { if (typeof openSystemOnMap === 'function' && port) openSystemOnMap(port.sys); setTimeout(() => SBMap.selectRoute(route.id), 700); }
    else if (a === 'mission' && st.inbound && window.SBMissions) SBMissions.open(st.inbound.id);
  });
}
function crownSpaceClose() {
  if (!_crownSpace) return;
  try { if (_crownSpace.handle) _crownSpace.handle.dispose(); } catch (e) {}
  if (_crownSpace.cfit) window.removeEventListener('resize', _crownSpace.cfit);
  _crownSpace.el.remove(); _crownSpace = null;
  st3dSleep();
}
// anciens appels (carte, cheats) : on passe par l'entrée
function crownOpenViewer() { crownEnter(); }
function crownCloseViewer() { crownSpaceClose(); }
function crownShowBar() {
  if (!_crown) return;
  crownSetView('bar');
  const sc = document.querySelector('#scr-dock .screen-scroll');
  if (sc) _crScroll(sc, 0);   // PATCH_1510_CROWN_SCENE : le panneau redescend, la scène montre le bar
  crownSheet(false);
}

function renderDockScreen() {
  // 04/11 (Adrien : « le clavier s'ouvre et se referme aussitôt ») : l'écran se redessine toutes les 2 s ; on ne touche à rien pendant qu'on écrit
  try { const _ae = document.activeElement, _sc = document.getElementById('scr-dock'); if (_ae && _sc && _sc.contains(_ae) && /^(INPUT|TEXTAREA)$/.test(_ae.tagName)) return; } catch (e) {}
  // PATCH_0211_AMBASSADEUR — le bouton nomme ce qui est à quai
  const _rb = document.querySelector('button[onclick="onRecallTankerFromDock()"]');
  if (_rb) { const _dm = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId); _rb.textContent = _dm && _dm.bmEnvoy ? '⌂ RAPPELER ' + _dm.tankerName.toUpperCase() : '⌂ RAPPELER LE TANKER'; }
  if (!_activeDockMissionId) return;
  const mission = (G.tankerMissions || []).find(m => m.id === _activeDockMissionId);
  if (!mission || mission.status !== 'docked') {
    // Mission terminée, revenir au hub
    // Mode replace pour ne pas laisser 'dock' polluer la nav stack
    // (sinon le bouton RETOUR du commerce ramène ici sur un dock fantôme — bug 18/05)
    _activeDockMissionId = null;
    if (typeof closeNpcSheet === 'function') closeNpcSheet();
    goto('commerce', { replace: true });
    return;
  }
  // Démarrer le ticker auto-refresh si pas déjà actif (D2)
  _startDockScreenTicker();
  const dock = mission.dock || {};
  const route = (G.routes || []).find(r => r.id === mission.routeId);
  const mood = route ? (ROUTE_MOODS[route.moodKey] || ROUTE_MOODS.nerveuse) : null;
  const arrivedH = Math.floor((Date.now() - (dock.arrivedAt || Date.now())) / 3600000);
  const arrivedLabel = arrivedH < 1 ? 'à l\'instant' : `il y a ${arrivedH}h`;

  // Cargo en cale
  const cargo = mission.cargo || {};
  const cargoParts = [];
  if (cargo.metal > 0) cargoParts.push(`${cargo.metal} métal`);
  if (cargo.energie > 0) cargoParts.push(`${cargo.energie} énergie`);
  if (cargo.cristal > 0) cargoParts.push(`${cargo.cristal} cristal`);
  const cargoLine = cargoParts.length > 0 ? cargoParts.join(' · ') : 'cale vide';

  document.getElementById('dock-name').textContent = dock.name || 'Dock';
  if (typeof crownDockHero === 'function') crownDockHero(dock);   // PATCH_1510_CROWN
  document.getElementById('dock-subtitle').innerHTML = `<span style="color:${dock.accent || '#ffc864'}">${dock.typeLabel || 'Dock'}</span> · ${dock.sub || ''}${mpDockSystem(dock) ? ` · <span style="font-family:'SF Mono',monospace;color:var(--mut)">⌖ ${mpDockSystem(dock)}</span>` : ''}`;   // PIRATERIE_1210 : le système du dock, là où guettent les balises
  document.getElementById('dock-body').innerHTML = `
    <!-- Bannière ambiance -->
    <div style="margin-bottom:18px;padding:18px;background:linear-gradient(180deg, rgba(${hexToRgb(dock.accent)},.10), rgba(0,0,0,.20));border:1px solid rgba(${hexToRgb(dock.accent)},.30);border-radius:8px">
      <div style="font-style:italic;color:#e6f0ff;font-size:14px;line-height:1.85;font-family:'Charter','Iowan Old Style',Georgia,serif">
        ${dock.ambience || ''}
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(${hexToRgb(dock.accent)},.20);font-size:13px;color:var(--text);line-height:1.7;font-family:'Charter','Iowan Old Style',Georgia,serif">
        ${dock.detail || ''}
      </div>
    </div>

    <!-- Stats voyage -->
    <div style="margin-bottom:18px;padding:12px 14px;background:rgba(255,255,255,.02);border-radius:6px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">${mission.bmEnvoy ? 'Vaisseau amarré' : 'Tanker amarré'}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:12px">
        <span style="color:var(--mut)">Vaisseau</span>
        <span style="color:#ffc864;font-family:'SF Mono',monospace">${mission.tankerName}${mission.bmEnvoy ? '' : ` (T${mission.tier})`}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:12px">
        <span style="color:var(--mut)">Route</span>
        <span style="color:${mood?.accent || 'var(--text)'};font-family:'SF Mono',monospace">${route?.name || mission.routeName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:12px">
        <span style="color:var(--mut)">Cale</span>
        <span style="color:var(--text);font-size:11px">${cargoLine}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:12px">
        <span style="color:var(--mut)">Amarré</span>
        <span style="color:var(--text);font-size:11px">${arrivedLabel}</span>
      </div>
    </div>

    <!-- D2 : Choix durée OU séjour en cours -->
    ${_renderDockStaySection(mission, dock)}

    <!-- MP : commandants à quai, marchés, rumeurs du comptoir -->
    ${stationUI(dock) ? crownBarHeader(dock) : ''}
    ${typeof sbImperialDockHtml === 'function' ? sbImperialDockHtml(mission, dock) : ''}
    ${_renderDockPlayersSection(mission, dock)}

    <!-- ROUTES_V2 : le mur du bar — tableau commun et persistant de la station -->
    ${sbStationWallHtml(mission, dock)}

    <!-- D3 : Autres convois amarrés -->
    ${_renderDockNpcSection(mission, dock)}

    <!-- D2 : Journal de séjour -->
    ${_renderDockJournalSection(mission)}
  `;
}   // brouillon du mur par station : survit aux redessins de l'écran
function sbStationWallHtml(mission, dock) {
  const id = mission ? mpDockIdForMission(mission) : null;
  if (!id) return '';
  const accent = (dock && dock.accent) || '#ffc864';
  setTimeout(() => sbStationWallLoad(id, false), 0);
  const c = _wallCache[id];
  return `<div id="station-wall" data-station="${id}" style="margin-bottom:18px;padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
      <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${accent}">Le mur du bar</div>
      <div style="font-size:10px;color:var(--mut)">${c && c.posts ? c.posts.length + ' message' + (c.posts.length > 1 ? 's' : '') : ''}</div>
    </div>
    <div id="station-wall-list">${c ? sbStationWallList(c) : '<div style="font-size:11px;color:var(--mut);font-style:italic">Lecture du mur…</div>'}</div>
    <div id="station-wall-form">${c ? sbStationWallForm(c) : ''}</div>
  </div>`;
}
function sbStationWallList(c) {
  const esc = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000)); return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
  if (!c || !c.posts || !c.posts.length) return '<div style="font-size:12px;color:var(--mut);font-style:italic;padding:6px 0">Personne n\'a encore rien écrit ici. Les habitués laissent un mot.</div>';
  return c.posts.slice(0, 40).map(p => `<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,.06)">
      <div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:11px;font-weight:600;color:${p.mine ? '#ffc864' : '#e6f0ff'}">${esc(p.pseudo)}</span><span style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${ago(p.at)}</span></div>
      <div style="font-size:13px;color:#e6f0ff;line-height:1.5;margin-top:2px;word-break:break-word">${esc(p.body)}</div>
    </div>`).join('');
}
function sbStationWallForm(c) {
  if (!c) return '';
  if (!c.can_post) return '<div style="font-size:11px;color:var(--mut);font-style:italic;margin-top:8px">Pour écrire sur le mur, il faut un tanker amarré ici.</div>';
  return `<div style="display:flex;gap:8px;margin-top:10px">
    <input id="station-wall-input" maxlength="280" enterkeyhint="send" placeholder="Laisser un mot aux commandants de passage…" value="${String(_wallDraft[c.id] || '').replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]))}" oninput="_wallDraft['${c.id}']=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();sbStationWallSend()}" style="flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:rgba(0,0,0,.35);color:#e6f0ff;font:inherit;font-size:16px">
    <button onclick="sbStationWallSend()" style="padding:10px 14px;border-radius:8px;border:1px solid rgba(255,200,100,.5);background:rgba(255,200,100,.12);color:#ffc864;font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">Publier</button>
  </div>`;
}
async function sbStationWallLoad(id, force) {
  if (!id || !window.SBMP || !window.SBMP.ready || !window.SBMP.ready()) return;
  const c = _wallCache[id];
  if (!force && c && Date.now() - (c.at || 0) < 20000) return sbStationWallPaint(id);
  try {
    const r = await window.SBMP._arpc('mp_station_wall', { p_station: id });
    _wallCache[id] = { id, posts: (r && r.posts) || [], can_post: !!(r && r.can_post), at: Date.now() };
  } catch (e) {
    if (!c) _wallCache[id] = { id, posts: [], can_post: false, at: Date.now(), err: String(e && e.message || e) };
    console.warn('[mur du bar]', e && e.message || e);
  }
  sbStationWallPaint(id);
}
function sbStationWallPaint(id) {
  const box = document.getElementById('station-wall'); if (!box || box.dataset.station !== id) return;
  const c = _wallCache[id]; if (!c) return;
  const list = document.getElementById('station-wall-list'), form = document.getElementById('station-wall-form');
  if (list) list.innerHTML = c.err && !c.posts.length
    ? (/does not exist|PGRST202|Could not find/.test(c.err)
        ? '<div style="font-size:11px;color:var(--mut);font-style:italic">Le mur n\'est pas encore ouvert : le registre doit être mis à jour (script v40).</div>'
        : '<div style="font-size:11px;color:var(--mut);font-style:italic">Le mur n\'est pas joignable pour le moment.</div>')
    : sbStationWallList(c);
  if (form && !document.getElementById('station-wall-input')) form.innerHTML = c.err && !c.posts.length ? '' : sbStationWallForm(c);
}
async function sbStationWallSend() {
  const box = document.getElementById('station-wall'), inp = document.getElementById('station-wall-input');
  if (!box || !inp) return;
  const id = box.dataset.station, body = String(inp.value || '').trim();
  if (!body) return;
  inp.disabled = true;
  try {
    const p = await window.SBMP._arpc('mp_station_post', { p_station: id, p_body: body });
    const c = _wallCache[id] = _wallCache[id] || { id, posts: [], can_post: true, at: Date.now() };
    c.posts.unshift(p); c.at = Date.now(); inp.value = ''; delete _wallDraft[id];
    sbStationWallPaint(id);
  } catch (e) {
    const m = String(e && e.message || e);
    toast(/too_fast/.test(m) ? 'Doucement : un message toutes les 20 secondes' : /too_many/.test(m) ? 'Tu as assez écrit pour aujourd\'hui' : /not_docked/.test(m) ? 'Il faut un tanker amarré ici pour écrire' : /does not exist|PGRST202|Could not find/.test(m) ? 'Le mur n\'est pas encore ouvert (registre à mettre à jour)' : 'Le mur n\'a pas pris ton message : ' + m.slice(0, 80));
  } finally { inp.disabled = false; }
}
// ─── D3 : Section "Autres convois amarrés" ───
// Affiche 0-4 tankers PNJ générés déterministe-ment pour ce dock + jour.
// Tap sur un PNJ ouvre sa fiche (info only, aucune interaction D3).
function _renderDockNpcSection(mission, dock) {
  const npcs = getNpcMissionsAtDock(dock);
  if (!Array.isArray(npcs) || npcs.length === 0) {
    return `
      <div style="margin-bottom:18px;padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px">
        <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Autres convois amarrés</div>
        <div style="font-size:11px;color:var(--mut);font-style:italic;text-align:center;padding:8px 0">Aucun autre convoi à quai. Le dock est presque désert.</div>
      </div>
    `;
  }

  const rows = npcs.map(npc => {
    const statusColor = npc.status.color;
    const cargoColor = npc.cargo.color;
    return `
      <div onclick="openNpcSheet('${npc.id}')" style="
        display:flex;align-items:center;gap:10px;
        padding:10px 12px;
        background:rgba(255,255,255,.02);
        border:1px solid var(--border);
        border-radius:6px;
        cursor:pointer;
        margin-bottom:6px
      ">
        <div style="font-size:14px;color:var(--mut);width:18px;text-align:center">⊙</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span style="font-size:13px;color:#e6f0ff;font-weight:500">${npc.captain}</span>
            <span style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${npc.tankerName}</span>
          </div>
          <div style="font-size:10px;color:var(--mut);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${npc.origin} · <span style="color:${cargoColor}">${npc.cargo.label}</span>
          </div>
        </div>
        <div style="font-size:9px;color:${statusColor};letter-spacing:.06em;text-align:right;white-space:nowrap">${npc.status.label}</div>
        <div style="color:var(--mut);font-size:12px">›</div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom:18px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;padding:0 2px">
        Autres convois amarrés · ${npcs.length}
      </div>
      ${rows}
    </div>
  `;
}

// ─── D2 : Section "choix durée" ou "séjour en cours" ───
function _renderDockStaySection(mission, dock) {
  // Si pas encore de durée choisie : afficher les 3 options
  if (!mission.dockStay) {
    return `
      <div style="margin-bottom:18px">
        <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">Durée du séjour</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${['short', 'medium', 'long'].map(key => {
            const cfg = DOCK_STAY_DURATIONS[key];
            return `
              <button onclick="setDockStayDuration('${mission.id}','${key}')" style="
                padding:14px 16px;background:rgba(255,200,100,.04);border:1px solid rgba(255,200,100,.25);
                border-radius:6px;cursor:pointer;text-align:left;color:var(--text);font-family:inherit
              ">
                <div style="font-size:14px;color:#ffc864;font-weight:600;margin-bottom:2px">${cfg.label}</div>
                <div style="font-size:11px;color:var(--mut)">${cfg.desc}</div>
              </button>
            `;
          }).join('')}
        </div>
        <div style="margin-top:12px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.5;text-align:center">
          Plus le séjour est long, plus les opportunités sont nombreuses — mais l'équipage s'impatiente.
        </div>
      </div>
    `;
  }

  // Sinon : afficher l'état du séjour en cours (humeur + temps restant)
  const now = Date.now();
  const elapsedMs = now - mission.dockStay.startedAt;
  const totalMs = mission.dockStay.chosenDurationMs;
  const remainingMs = Math.max(0, mission.dockStay.endsAt - now);
  const progressPct = Math.min(100, Math.round((elapsedMs / totalMs) * 100));
  const remainingLabel = _formatDuration(remainingMs);

  const mood = mission.crewMood || {};
  const palier = _getHumorPalier(mood.humorScore || 0);
  const humorCfg = CREW_HUMOR_LABELS[palier];
  const physCfg = CREW_PHYSICAL_LABELS[mood.physicalState || 'sobre'];

  return `
    <div style="margin-bottom:18px;padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">Séjour en cours</div>
        <div style="font-size:11px;color:#ffc864;font-family:'SF Mono',monospace">${remainingLabel} restant</div>
      </div>
      <!-- Barre de progression -->
      <div style="height:4px;background:var(--bg);border-radius:2px;overflow:hidden;margin-bottom:14px">
        <div style="width:${progressPct}%;height:100%;background:#ffc864"></div>
      </div>
      <!-- Humeur équipage -->
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;font-size:12px">
        <span style="color:var(--mut)">Équipage</span>
        <div>
          <span style="color:${humorCfg.color};font-weight:500">${humorCfg.label}</span>
          ${mood.physicalState && mood.physicalState !== 'sobre' ? `<span style="color:${physCfg.color};margin-left:6px;font-style:italic">· ${physCfg.label}</span>` : ''}
        </div>
      </div>
      <div style="font-size:11px;color:var(--mut);font-style:italic;line-height:1.5;margin-top:4px;margin-bottom:12px">
        ${humorCfg.desc}${mood.physicalState && mood.physicalState !== 'sobre' ? ' ' + physCfg.desc : ''}
      </div>
      <!-- Boutons prolongation séjour (18/05 demande Adrien) -->
      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Prolonger</div>
        <div style="display:flex;gap:6px">
          <button onclick="extendDockStay('${mission.id}','short')" style="flex:1;padding:8px 6px;background:transparent;border:1px solid rgba(255,200,100,.30);color:#ffc864;border-radius:5px;font-family:inherit;font-size:11px;cursor:pointer">+ 2h</button>
          <button onclick="extendDockStay('${mission.id}','medium')" style="flex:1;padding:8px 6px;background:transparent;border:1px solid rgba(255,200,100,.30);color:#ffc864;border-radius:5px;font-family:inherit;font-size:11px;cursor:pointer">+ 1 j</button>
          <button onclick="extendDockStay('${mission.id}','long')" style="flex:1;padding:8px 6px;background:transparent;border:1px solid rgba(255,200,100,.30);color:#ffc864;border-radius:5px;font-family:inherit;font-size:11px;cursor:pointer">+ 7 j</button>
        </div>
      </div>
    </div>
  `;
}

// ─── D2 : Journal de séjour (récits passifs) ───
function _renderDockJournalSection(mission) {
  if (!Array.isArray(mission.dockJournal) || mission.dockJournal.length === 0) {
    return '';
  }
  // Afficher les 4 entrées les plus récentes
  const recent = mission.dockJournal.slice(-4).reverse();
  const lines = recent.map(e => {
    const humorCfg = CREW_HUMOR_LABELS[e.humor] || CREW_HUMOR_LABELS.calme;
    const physCfg = CREW_PHYSICAL_LABELS[e.physical] || CREW_PHYSICAL_LABELS.sobre;
    const isSpecial = /^[✦⚠✗]/.test(e.text);
    return `
      <div style="margin-bottom:12px;padding:10px 12px;background:rgba(255,255,255,.02);${isSpecial ? `border-left:2px solid ${e.text.startsWith('✦') ? '#8bc24a' : e.text.startsWith('⚠') ? '#fac74c' : '#e87a4a'}` : 'border-left:2px solid var(--border)'};border-radius:0 4px 4px 0">
        <div style="font-size:9px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">
          <span style="color:${humorCfg.color}">${humorCfg.label}</span>
          ${e.physical !== 'sobre' ? `<span style="color:${physCfg.color};margin-left:6px">· ${physCfg.label}</span>` : ''}
        </div>
        <div style="font-size:13px;color:#e6f0ff;font-style:italic;line-height:1.65;font-family:'Charter','Iowan Old Style',Georgia,serif">
          ${e.text}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom:18px">
      <div style="font-size:10px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">Journal de séjour</div>
      ${lines}
      ${mission.dockJournal.length > 4 ? `<div style="font-size:10px;color:var(--mut);font-style:italic;text-align:center;margin-top:8px">${mission.dockJournal.length - 4} entrée${mission.dockJournal.length - 4 > 1 ? 's' : ''} plus ancienne${mission.dockJournal.length - 4 > 1 ? 's' : ''}…</div>` : ''}
    </div>
  `;
}

// Helper format durée
function _formatDuration(ms) {
  if (ms <= 0) return '0min';
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

// Stocker le rapport de retour route_run dans G.tankerReports
function storeRouteRunReport(mission, route, mood, loot, isLost, narrative) {
  if (!Array.isArray(G.tankerReports)) G.tankerReports = [];
  // D5.3 fix #1+#3 (18/05) : enrichir avec cargoInitial / cargoFinal + bénéfice calculé.
  // Permet d'afficher dans le rapport étendu : "Cale au départ → Cale au retour → Bénéfice".
  // - cargoInitial : ce que tu as chargé au départ
  // - cargoFinal : ce qui restait dans la cale au moment du retour (après échanges + pillage)
  // - cargoPillaged : ce qui a été détourné par l'équipage mutin (si applicable)
  // - balance : bénéfice net = butin - cargo investi initial
  const cargoInitial = mission.cargoInitial || {
    metal: mission.cargo?.metal || 0,
    energie: mission.cargo?.energie || 0,
    cristal: mission.cargo?.cristal || 0,
  };
  // Cargo au retour = ce qui reste dans mission.cargo après échanges (peut être 0 ou modifié)
  // En cas de pillage : on retire la part pillée du cargo final
  const cargoFinal = isLost ? null : {
    metal: mission.cargo?.metal || 0,
    energie: mission.cargo?.energie || 0,
    cristal: mission.cargo?.cristal || 0,
  };
  // Calcul du bénéfice net (perdu vs gagné)
  // Investissement initial : total des unités cargo au départ
  // Récupéré : butin (loot.resources + loot.credits) + cargo restant au retour
  let balance = null;
  if (!isLost && loot) {
    const initialTotal = cargoInitial.metal + cargoInitial.energie + cargoInitial.cristal;
    const returnedRes = (loot.resources?.metal || 0) + (loot.resources?.energie || 0) + (loot.resources?.cristal || 0);
    const remainingCargo = cargoFinal ? (cargoFinal.metal + cargoFinal.energie + cargoFinal.cristal) : 0;
    balance = {
      initialUnits: initialTotal,
      returnedUnits: returnedRes,
      credits: loot.credits || 0,
      fuelSpent: mission.fuelCost || 0,
      // Bénéfice net en unités (résiduel + butin - investi). Le carburant est en plus.
      netUnits: returnedRes - initialTotal,
    };
  }
  const report = {
    id: 'tr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: mission.tankerName,
    kind: 'route_run',                    // ← Chunk D
    routeId: mission.routeId,
    routeName: mission.routeName,
    routeMoodKey: mission.routeMoodKey,
    dock: mission.dock,
    cargoDeparted: mission.cargo,         // legacy, on garde pour compat
    cargoInitial,                         // ← NEW : copie immuable au départ
    cargoFinal,                           // ← NEW : cargo restant au retour
    cargoPillaged: mission._cargoPillaged || null, // ← NEW : pillage si mutin
    balance,                              // ← NEW : calcul bénéfice net
    cargoTotal: mission.cargoTotal,
    fuelCost: mission.fuelCost,
    targetLabel: mission.dock?.name || mission.routeName,
    targetCoords: mission.targetCoords,
    createdAt: Date.now(),
    read: false,
    isLost,
    loot: loot || {},
    narrative,
  };
  G.tankerReports.unshift(report);
  if (G.tankerReports.length > 50) G.tankerReports.length = 50;
  return report;
}

// Cellule d'une route activée — version compacte dans la liste du hub
function renderRouteCell(r) {
  const mood = ROUTE_MOODS[r.moodKey] || ROUTE_MOODS.nerveuse;
  const stability = Math.max(0, Math.min(100, r.stability || 0));
  const stabColor = stability >= 70 ? '#8bc24a' : stability >= 40 ? '#ffc864' : '#e87a7a';
  const knowledge = Math.max(0, Math.min(10, r.knowledgeLevel || 0));

  // Badge état (in_use / collapsed) — Chunk D
  let statusBadge = '';
  if (r.status === 'collapsed') {
    statusBadge = `<span style="font-size:9px;color:#e87a7a;background:rgba(232,122,122,.10);padding:2px 6px;border-radius:3px;letter-spacing:.08em">EFFONDRÉE</span>`;
  } else if (r.status === 'in_use' && r.activeMissionId) {
    const mission = (G.tankerMissions || []).find(m => m.id === r.activeMissionId);
    if (mission?.status === 'docked') {
      statusBadge = `<span style="font-size:9px;color:#ffc864;background:rgba(255,200,100,.10);padding:2px 6px;border-radius:3px;letter-spacing:.08em">🛸 AMARRÉ</span>`;
    } else if (mission?.status === 'in_transit') {
      statusBadge = `<span style="font-size:9px;color:var(--cyan);background:rgba(95,255,232,.08);padding:2px 6px;border-radius:3px;letter-spacing:.08em">EN ROUTE</span>`;
    }
  }

  return `
    <div style="margin-bottom:10px;padding:12px 14px;background:rgba(${hexToRgb(mood.accent)},.05);border:1px solid rgba(${hexToRgb(mood.accent)},.22);border-radius:8px;cursor:pointer;${r.status === 'collapsed' ? 'opacity:.5;' : ''}" onclick="openCommerceSheet('route','${r.id}')">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;gap:8px">
        <div style="font-size:13px;color:${mood.accent};font-weight:600">${r.name}</div>
        ${statusBadge || `<div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">${mood.label}</div>`}
      </div>
      <div style="font-size:11px;color:var(--text);line-height:1.5;margin-bottom:8px;opacity:.85">
        ${r.originHint} → ${r.destinationHint}
      </div>
      <div style="display:flex;gap:14px;align-items:center;font-size:10px">
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px">
            <span style="color:var(--mut);letter-spacing:.06em;text-transform:uppercase">Stabilité</span>
            <span style="color:${stabColor};font-family:'SF Mono',monospace">${stability}%</span>
          </div>
          <div style="height:3px;background:var(--bg);border-radius:2px;overflow:hidden">
            <div style="width:${stability}%;height:100%;background:${stabColor}"></div>
          </div>
        </div>
        <div style="font-size:10px;color:#5fa8e8;font-family:'SF Mono',monospace">N${knowledge}</div>
      </div>
      <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:10px;color:var(--mut)">
        <span>${r.passages} passage${r.passages !== 1 ? 's' : ''}</span>
        ${r.lost > 0 ? `<span style="color:#e87a7a">${r.lost} perdu${r.lost > 1 ? 's' : ''}</span>` : ''}
      </div>
    </div>
  `;
}

function renderCommerceCartes() {
  const el = document.getElementById('commerce-cartes-content');
  if (!el) return;
  const cartes = G.routeCards || [];

  if (cartes.length === 0) {
    el.innerHTML = `
      <div style="padding:32px 24px;text-align:center;color:var(--mut);font-size:12px;line-height:1.8">
        <div style="font-size:32px;opacity:.3;margin-bottom:14px">✦</div>
        <div style="font-style:italic;margin-bottom:14px;color:var(--text)">Aucune carte de route en main.</div>
        <div style="font-size:11px;opacity:.85;max-width:320px;margin:0 auto;line-height:1.7;text-align:left">
          Les <strong style="color:#ffc864">cartes de route</strong> sont des coordonnées de chemins secrets ou rares dans le secteur. Une fois activée, une carte devient une vraie route exploitable par tes tankers.
        </div>
        <div style="margin-top:16px;padding:12px 14px;background:rgba(255,200,100,.04);border:1px solid rgba(255,200,100,.15);border-radius:6px;max-width:320px;margin-left:auto;margin-right:auto;text-align:left">
          <div style="font-size:9px;color:#ffc864;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Comment en obtenir</div>
          <div style="font-size:10px;color:var(--mut);line-height:1.65">
            · Tankers qui ramènent une carte au retour de séjour<br>
            · Échanges avec capitaines au comptoir<br>
            · Récompenses de pistes résolues (épaves de marchands)<br>
            · Achats au Marché (rare)
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Tri du plus récent au plus ancien
  const sorted = [...cartes].sort((a, b) => (b.foundAt || 0) - (a.foundAt || 0));

  el.innerHTML = `
    <div style="padding:8px 16px 4px;font-size:10px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">
      ${cartes.length} carte${cartes.length > 1 ? 's' : ''} en attente d'activation
    </div>
    <div style="padding:4px 16px 16px">
      ${sorted.map(c => renderCardCell(c)).join('')}
    </div>
  `;
}

// ─── COMPTOIR D'ÉCHANGE — Marché CG ↔ Ressources (18/05) ───
function renderCommerceMarche() {
  const el = document.getElementById('commerce-market-content');
  if (!el) return;
  const season = getCurrentMarketSeason();
  const cfg = MARKET_SEASONS[season.key] || MARKET_SEASONS.normale;
  const accent = cfg.accent;

  // Temps restant avant changement de saison
  const remaining = Math.max(0, season.endsAt - Date.now());
  const remDays = Math.floor(remaining / (24 * 3600 * 1000));
  const remHours = Math.floor((remaining % (24 * 3600 * 1000)) / 3600000);
  const remLabel = remDays > 0 ? `${remDays}j ${remHours}h` : remHours > 0 ? `${remHours}h` : 'bientôt';

  // Construction des lignes ressources
  const resKeys = ['metal', 'energie', 'cristal', 'fuel'];
  const RES_META = {
    metal:   { label: 'Métal',     color: '#cececd', icon: '⛏' },
    energie: { label: 'Énergie',   color: '#ffaf3a', icon: '⚡' },
    cristal: { label: 'Cristal',   color: '#6db032', icon: '◆' },
    fuel:    { label: 'Carburant', color: '#7aaadc', icon: '⛽' },
  };

  // Helper : récupère le stock et le cap pour n'importe quelle ressource (y compris carburant)
  const getStock = (k) => k === 'fuel' ? (G.fuel || 0) : (G.res?.[k]?.v || 0);
  const getCap = (k) => k === 'fuel' ? ((typeof getFuelCap === 'function') ? getFuelCap() : 1000) : (G.res?.[k]?.max || 0);

  // Section "Bandeau saison"
  const seasonBanner = `
    <div style="margin-bottom:14px;padding:14px 16px;background:linear-gradient(180deg, rgba(${hexToRgb(accent)},.10), rgba(${hexToRgb(accent)},.04));border:1px solid ${accent}40;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:9px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase">Cycle du marché</div>
        <div style="font-size:9px;color:var(--mut);font-family:'SF Mono',monospace">${remLabel}</div>
      </div>
      <div style="font-size:15px;color:${accent};font-weight:600;margin-bottom:4px">${cfg.label}</div>
      <div style="font-size:11px;color:var(--text);font-style:italic;line-height:1.55">${cfg.bio}</div>
    </div>
  `;

  // Section VENDRE (ressources → CG)
  const sellRows = resKeys.map(k => {
    const meta = RES_META[k];
    const have = getStock(k);
    const price = getMarketSellPrice(k);
    const basePrice = MARKET_BASE_PRICES[k].sell;
    const deltaPct = Math.round(((price - basePrice) / basePrice) * 100);
    const deltaSign = deltaPct >= 0 ? '+' : '';
    const deltaColor = deltaPct > 0 ? '#78c88c' : deltaPct < 0 ? '#e87a7a' : 'var(--mut)';
    return `
      <div style="margin-bottom:8px;padding:12px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <div style="display:flex;align-items:baseline;gap:8px">
            <span style="color:${meta.color};font-size:13px;font-weight:500">${meta.icon} ${meta.label}</span>
            <span style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${have} en stock</span>
          </div>
          <div style="font-size:11px;font-family:'SF Mono',monospace">
            <span style="color:#ffc864">${price} CG/u</span>
            <span style="color:${deltaColor};margin-left:6px;font-size:9px">(${deltaSign}${deltaPct}%)</span>
          </div>
        </div>
        <div style="display:flex;gap:4px;margin-top:8px">
          ${[10, 50, 100, 500].map(q => {
            const can = have >= q;
            return `<button onclick="onMarketSell('${k}',${q})" ${can ? '' : 'disabled'} style="flex:1;padding:8px 4px;background:${can ? 'rgba(255,200,100,.10)' : 'rgba(255,255,255,.02)'};border:1px solid ${can ? 'rgba(255,200,100,.30)' : 'var(--border)'};border-radius:4px;color:${can ? '#ffc864' : 'var(--mut)'};font-family:inherit;font-size:11px;cursor:${can ? 'pointer' : 'not-allowed'};opacity:${can ? 1 : 0.5}">−${q}</button>`;
          }).join('')}
          <button onclick="onMarketSell('${k}',${have})" ${have > 0 ? '' : 'disabled'} style="flex:1.3;padding:8px 4px;background:${have > 0 ? 'rgba(255,200,100,.15)' : 'rgba(255,255,255,.02)'};border:1px solid ${have > 0 ? 'rgba(255,200,100,.50)' : 'var(--border)'};border-radius:4px;color:${have > 0 ? '#ffc864' : 'var(--mut)'};font-family:inherit;font-size:11px;font-weight:600;cursor:${have > 0 ? 'pointer' : 'not-allowed'};opacity:${have > 0 ? 1 : 0.5}">TOUT</button>
        </div>
      </div>
    `;
  }).join('');

  const sellSection = `
    <div style="margin-bottom:16px">
      <div style="font-size:10px;color:#78c88c;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;padding:0 2px">→ Vendre tes ressources</div>
      ${sellRows}
    </div>
  `;

  // Section ACHETER (CG → ressources)
  const buyRows = resKeys.map(k => {
    const meta = RES_META[k];
    const have = getStock(k);
    const cap = getCap(k);
    const credits = G.credits || 0;
    const price = getMarketBuyPrice(k);
    const basePrice = MARKET_BASE_PRICES[k].buy;
    const deltaPct = Math.round(((price - basePrice) / basePrice) * 100);
    const deltaSign = deltaPct >= 0 ? '+' : '';
    const deltaColor = deltaPct < 0 ? '#78c88c' : deltaPct > 0 ? '#e87a7a' : 'var(--mut)';
    // Capacité restante
    const remainingCap = Math.max(0, cap - have);
    return `
      <div style="margin-bottom:8px;padding:12px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <div style="display:flex;align-items:baseline;gap:8px">
            <span style="color:${meta.color};font-size:13px;font-weight:500">${meta.icon} ${meta.label}</span>
            <span style="font-size:10px;color:var(--mut);font-family:'SF Mono',monospace">${have}/${cap}</span>
          </div>
          <div style="font-size:11px;font-family:'SF Mono',monospace">
            <span style="color:#ffc864">${price} CG/u</span>
            <span style="color:${deltaColor};margin-left:6px;font-size:9px">(${deltaSign}${deltaPct}%)</span>
          </div>
        </div>
        ${k === 'fuel' && remainingCap < 10 ? `<div style="font-size:10px;color:#ff9a7a;margin-top:2px">Réserve pleine (${fmt(cap)}) : construis un Silo Carburant ou améliore ta Raffinerie pour en stocker plus.</div>` : ''}
        ${credits < price * 10 ? `<div style="font-size:10px;color:var(--mut);margin-top:2px">Il te faut des crédits (CG) : vends des ressources ou construis un Comptoir.</div>` : ''}
        <div style="display:flex;gap:4px;margin-top:8px">
          ${[10, 50, 100, 500].map(q => {
            const cost = price * q;
            const canAfford = credits >= cost;
            const canStore = remainingCap >= q;
            const can = canAfford && canStore;
            return `<button onclick="onMarketBuy('${k}',${q})" ${can ? '' : 'disabled'} style="flex:1;padding:8px 4px;background:${can ? 'rgba(120,200,140,.10)' : 'rgba(255,255,255,.02)'};border:1px solid ${can ? 'rgba(120,200,140,.30)' : 'var(--border)'};border-radius:4px;color:${can ? '#78c88c' : 'var(--mut)'};font-family:inherit;font-size:11px;cursor:${can ? 'pointer' : 'not-allowed'};opacity:${can ? 1 : 0.5}">+${q}</button>`;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  const buySection = `
    <div style="margin-bottom:16px">
      <div style="font-size:10px;color:#7aaadc;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;padding:0 2px">← Acheter contre CG</div>
      ${buyRows}
    </div>
  `;

  // Aide stratégique
  const stratHints = {
    normale:    'Tout est au prix de base. Bon moment pour des opérations standard.',
    abondance:  'Achète tant que les prix sont bas. Évite de vendre maintenant.',
    penurie:    'Vends maintenant — tu ne reverras pas ces prix avant un moment.',
    boom:       'Le moment de TOUT vendre. Tes ressources valent le double.',
    crise:      'Le pire moment pour faire quoi que ce soit. Attends que ça passe.',
    contrebande: 'Le cristal est ultra recherché. Si tu en as, vends-le maintenant.',
  };

  // ⚡ V0.5 — Section Panier en bas du marché
  // Affichée seulement si le panier contient quelque chose.
  let cartSection = '';
  if (!_marketCartIsEmpty()) {
    const totals = _calculateCartTotals();
    const sellLines = Object.entries(_marketCart.sells).map(([k, q]) => {
      const meta = RES_META[k];
      const price = getMarketSellPrice(k);
      const lineTotal = price * q;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border);font-size:11px">
          <div>
            <span style="color:#78c88c">→ Vendre</span>
            <span style="margin-left:6px;color:${meta.color}">${meta.icon} ${q} ${meta.label}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:#ffc864;font-family:'SF Mono',monospace">+${lineTotal} CG</span>
            <button onclick="removeCartLine('sell','${k}')" style="background:transparent;border:none;color:var(--mut);cursor:pointer;font-size:14px;padding:0 4px">✕</button>
          </div>
        </div>
      `;
    }).join('');

    const buyLines = Object.entries(_marketCart.buys).map(([k, q]) => {
      const meta = RES_META[k];
      const price = getMarketBuyPrice(k);
      const lineTotal = price * q;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border);font-size:11px">
          <div>
            <span style="color:#e87a7a">← Acheter</span>
            <span style="margin-left:6px;color:${meta.color}">${meta.icon} ${q} ${meta.label}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:#e87a7a;font-family:'SF Mono',monospace">−${lineTotal} CG</span>
            <button onclick="removeCartLine('buy','${k}')" style="background:transparent;border:none;color:var(--mut);cursor:pointer;font-size:14px;padding:0 4px">✕</button>
          </div>
        </div>
      `;
    }).join('');

    const netSign = totals.net >= 0 ? '+' : '';
    const netColor = totals.net >= 0 ? '#78c88c' : '#e87a7a';
    const finalCredits = (G.credits || 0) + totals.net;
    const finalColor = finalCredits < 0 ? '#e87a7a' : 'var(--text)';

    cartSection = `
      <div style="margin-top:20px;padding:14px;background:linear-gradient(180deg, rgba(255,200,100,.08), rgba(255,200,100,.02));border:1px solid rgba(255,200,100,.40);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <div style="font-size:11px;color:#ffc864;letter-spacing:.14em;text-transform:uppercase;font-weight:600">🛒 Panier</div>
          <button onclick="clearMarketCart()" style="background:transparent;border:none;color:var(--mut);font-size:10px;cursor:pointer;letter-spacing:.06em;text-transform:uppercase">Vider</button>
        </div>
        ${sellLines}${buyLines}
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0 4px;margin-top:6px;border-top:1px solid rgba(255,200,100,.20);font-size:12px;font-weight:600">
          <span>Net</span>
          <span style="color:${netColor};font-family:'SF Mono',monospace">${netSign}${totals.net} CG</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:2px 0 12px;font-size:10px;color:var(--mut)">
          <span>Solde après transaction</span>
          <span style="color:${finalColor};font-family:'SF Mono',monospace">${finalCredits} CG</span>
        </div>
        <button onclick="checkoutMarketCart()"
          style="width:100%;padding:14px;background:linear-gradient(180deg, rgba(255,200,100,.20), rgba(255,200,100,.08));border:1px solid rgba(255,200,100,.60);border-radius:6px;color:#ffc864;font-family:inherit;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">
          Régler mes transactions
        </button>
      </div>
    `;
  }

  el.innerHTML = `
    ${seasonBanner}
    <div style="padding:10px 12px;background:rgba(255,200,100,.04);border:1px solid rgba(255,200,100,.20);border-radius:6px;margin-bottom:14px;font-size:10px;color:var(--mut);font-style:italic;line-height:1.55">
      💡 ${stratHints[season.key] || stratHints.normale}
    </div>
    ${sellSection}
    ${buySection}
    ${cartSection}
  `;
}

function _resetMarketCart() {
  _marketCart = { sells: {}, buys: {} };
}

function _marketCartIsEmpty() {
  const sellTotal = Object.values(_marketCart.sells).reduce((a, b) => a + b, 0);
  const buyTotal = Object.values(_marketCart.buys).reduce((a, b) => a + b, 0);
  return sellTotal === 0 && buyTotal === 0;
}

// Ajoute au panier (vente) au lieu d'exécuter directement
function onMarketSell(resKey, qty) {
  // Helper local pour récup le stock total dispo
  const getStock = (k) => k === 'fuel' ? (G.fuel || 0) : (G.res?.[k]?.v || 0);
  const stock = getStock(resKey);
  const alreadyInCart = _marketCart.sells[resKey] || 0;
  const available = stock - alreadyInCart;
  if (qty > available) {
    if (typeof toast === 'function') {
      if (available <= 0) toast(`Tu as déjà mis tout ton ${resKey} au panier`);
      else toast(`Reste seulement ${available} ${resKey} disponible`);
    }
    return;
  }
  _marketCart.sells[resKey] = (_marketCart.sells[resKey] || 0) + qty;
  if (typeof toast === 'function') toast(`+${qty} ${resKey} au panier`);
  renderCommerceMarche();
}

// Ajoute au panier (achat) au lieu d'exécuter directement
function onMarketBuy(resKey, qty) {
  _marketCart.buys[resKey] = (_marketCart.buys[resKey] || 0) + qty;
  if (typeof toast === 'function') toast(`+${qty} ${resKey} au panier`);
  renderCommerceMarche();
}

// Retire une ligne du panier (sell ou buy)
function removeCartLine(side, resKey) {
  if (side === 'sell') delete _marketCart.sells[resKey];
  else if (side === 'buy') delete _marketCart.buys[resKey];
  if (typeof toast === 'function') toast('Retiré du panier');
  renderCommerceMarche();
}

// Vide tout le panier
function clearMarketCart() {
  _resetMarketCart();
  if (typeof toast === 'function') toast('Panier vidé');
  renderCommerceMarche();
}

// Calcule le récap (totaux + déséquilibre)
function _calculateCartTotals() {
  let sellsTotal = 0;
  let buysTotal = 0;
  for (const [k, q] of Object.entries(_marketCart.sells)) {
    sellsTotal += getMarketSellPrice(k) * q;
  }
  for (const [k, q] of Object.entries(_marketCart.buys)) {
    buysTotal += getMarketBuyPrice(k) * q;
  }
  const net = sellsTotal - buysTotal;
  return { sellsTotal, buysTotal, net };
}

// Passe en caisse : exécute toutes les transactions du panier
// Vérifie d'abord la faisabilité globale (CG, stock, capacité).
function checkoutMarketCart() {
  const totals = _calculateCartTotals();
  const currentCredits = G.credits || 0;
  const finalCredits = currentCredits + totals.net;

  // Vérification : assez de CG pour payer les achats ?
  if (finalCredits < 0) {
    if (typeof toast === 'function') {
      toast(`Manque ${-finalCredits} CG pour finaliser`);
    }
    return;
  }

  // Vérification : stock suffisant pour chaque vente ?
  const getStock = (k) => k === 'fuel' ? (G.fuel || 0) : (G.res?.[k]?.v || 0);
  for (const [k, q] of Object.entries(_marketCart.sells)) {
    if (getStock(k) < q) {
      if (typeof toast === 'function') toast(`Stock insuffisant pour vendre ${q} ${k}`);
      return;
    }
  }

  // Vérification : capacité suffisante pour chaque achat ?
  const getCap = (k) => k === 'fuel'
    ? ((typeof getFuelCap === 'function') ? getFuelCap() : 1000)
    : (G.res?.[k]?.max || 0);
  for (const [k, q] of Object.entries(_marketCart.buys)) {
    const newStock = getStock(k) + q;
    if (newStock > getCap(k)) {
      if (typeof toast === 'function') toast(`Capacité ${k} insuffisante (max ${getCap(k)})`);
      return;
    }
  }

  // Tout est OK — exécuter les transactions
  // 1. Ventes (utiliser la fonction marketSell existante pour cohérence)
  for (const [k, q] of Object.entries(_marketCart.sells)) {
    marketSell(k, q);
  }
  // 2. Achats
  for (const [k, q] of Object.entries(_marketCart.buys)) {
    marketBuy(k, q);
  }

  // Toast récap
  const sellCount = Object.keys(_marketCart.sells).length;
  const buyCount = Object.keys(_marketCart.buys).length;
  const sign = totals.net >= 0 ? '+' : '';
  if (typeof toast === 'function') {
    toast(`💱 Transactions validées · ${sign}${totals.net} CG`);
  }

  // Vider le panier
  _resetMarketCart();

  // Re-render
  renderCommerceMarche();
  if (typeof renderCommerceScreen === 'function') renderCommerceScreen();
  if (typeof renderDashboard === 'function') renderDashboard();

  // Save event
  if (typeof saveGame === 'function') saveGame();
}

// Cellule individuelle d'une carte (style cohérent avec l'encart du rapport tanker)
function renderCardCell(c) {
  const kindCfg = ROUTE_CARD_KINDS[c.kind] || ROUTE_CARD_KINDS.clean;
  const qualityBar = Math.max(0, Math.min(100, c.quality || 0));
  const elapsedH = Math.floor((Date.now() - (c.foundAt || Date.now())) / 3600000);
  const elapsedLabel = elapsedH < 1 ? 'à l\'instant'
    : elapsedH < 24 ? `il y a ${elapsedH}h`
    : `il y a ${Math.floor(elapsedH / 24)}j`;
  return `
    <div style="margin-bottom:10px;padding:12px 14px;background:rgba(255,200,100,.05);border:1px solid rgba(255,200,100,.20);border-radius:8px;cursor:pointer" onclick="openCommerceSheet('card','${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:13px;color:#ffc864;font-weight:600">${c.name}</div>
        <div style="font-size:9px;color:var(--mut);letter-spacing:.12em;text-transform:uppercase">${kindCfg.label}</div>
      </div>
      <div style="font-size:11px;color:var(--text);line-height:1.5;margin-bottom:8px">
        <span style="color:var(--mut)">De :</span> ${c.originHint}<br>
        <span style="color:var(--mut)">Vers :</span> ${c.destinationHint}
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:9px;color:var(--mut);letter-spacing:.1em;text-transform:uppercase">Qualité</span>
        <div style="flex:1;height:4px;background:var(--bg);border-radius:2px;overflow:hidden">
          <div style="width:${qualityBar}%;height:100%;background:#ffc864"></div>
        </div>
        <span style="font-size:10px;color:#ffc864;font-family:'SF Mono',monospace">${qualityBar}</span>
      </div>
      <div style="font-size:10px;color:var(--mut);font-style:italic;line-height:1.5;margin-top:6px">${kindCfg.desc}</div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,200,100,.12);display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--mut)">
        <div>Source : <span style="color:var(--text)">${c.source}</span></div>
        <div>${elapsedLabel}</div>
      </div>
      <div style="margin-top:10px;font-size:10px;color:#ffc864;text-align:center;letter-spacing:.06em">
        Tap pour activer cette route →
      </div>
    </div>
  `;
}

// ─── Bloc Commerce du Dashboard ───
// Visible dès qu'au moins 1 Comptoir est construit (pas avant — pas de routes possibles)
function renderCommerceBlockDashboard() {
  const label = document.getElementById('dash-commerce-label');
  const block = document.getElementById('dash-commerce-block');
  if (!label || !block) return;

  const nbComptoirs = countComptoirs();
  if (nbComptoirs === 0) {
    label.style.display = 'none';
    block.style.display = 'none';
    return;
  }

  label.style.display = '';
  block.style.display = '';

  const credits = G.credits || 0;
  const ratePerHour = getCommerceCreditsRate();
  const routes = (G.routes || []).length;
  const cartes = (G.routeCards || []).length;

  block.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px">
      <div>
        <div style="font-size:13px;color:var(--text);font-weight:500">Maison de Commerce</div>
        <div style="font-size:11px;color:var(--mut);margin-top:3px">
          ${fmt(credits)} CG
          ${ratePerHour > 0 ? `<span style="color:#5fcc8a"> +${ratePerHour}/h</span>` : ''}
          ${routes > 0 ? `<span class="dot"></span>${routes} route${routes > 1 ? 's' : ''}` : ''}
          ${cartes > 0 ? `<span class="dot"></span>${cartes} carte${cartes > 1 ? 's' : ''}` : ''}
        </div>
      </div>
      <div style="color:#ffc864;font-size:20px">→</div>
    </div>
  `;
}

// D5.2 : Bloc Carnet du capitaine — visible dès qu'il y a au moins une donnée significative
function renderCarnetBlockDashboard() {
  const label = document.getElementById('dash-carnet-label');
  const block = document.getElementById('dash-carnet-block');
  if (!label || !block) return;

  // Calculer si on a quelque chose à montrer (sinon on cache complètement le bloc)
  // Routes retirées du calcul : elles vivent dans Commerce, le Carnet est focus narration.
  const nPavillons = Object.keys(G.encounteredPavillons || {}).length;
  const nRumeurs = (G.rumorJournal || []).length;
  const nInfos = (G.purchasedIntel || []).length;
  const nDocks = Object.keys(G.visitedDocks || {}).length;
  const nPistes = (G.openLeads || []).filter(l => l.status === 'open').length;
  const hasAnyData = nPavillons + nRumeurs + nInfos + nDocks + nPistes > 0;

  if (!hasAnyData) {
    label.style.display = 'none';
    block.style.display = 'none';
    return;
  }

  label.style.display = '';
  block.style.display = '';

  // Récap : prioriser les pistes ouvertes (call-to-action), puis le plus récent
  const teaserParts = [];
  if (nPistes > 0) teaserParts.push(`<span style="color:#c8b478">${nPistes} piste${nPistes > 1 ? 's' : ''} ouverte${nPistes > 1 ? 's' : ''}</span>`);
  if (nPavillons > 0) teaserParts.push(`${nPavillons} pavillon${nPavillons > 1 ? 's' : ''}`);
  if (nRumeurs > 0) teaserParts.push(`${nRumeurs} rumeur${nRumeurs > 1 ? 's' : ''}`);
  if (nInfos > 0) teaserParts.push(`${nInfos} info${nInfos > 1 ? 's' : ''}`);
  if (nDocks > 0) teaserParts.push(`${nDocks} dock${nDocks > 1 ? 's' : ''}`);

  block.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px">
      <div>
        <div style="font-size:13px;color:var(--text);font-weight:500">📓 Carnet du capitaine</div>
        <div style="font-size:11px;color:var(--mut);margin-top:3px">
          ${teaserParts.slice(0, 3).join(' <span class="dot"></span> ')}
        </div>
      </div>
      <div style="color:#c8b478;font-size:20px">→</div>
    </div>
  `;
}



function refreshCurrentScreen() {
  // Si le sheet Commerce est ouvert, le re-render aussi (Chunk C 16/05)
  if (typeof refreshCommerceSheet === 'function') refreshCommerceSheet();
  // Trouve l'écran actuellement visible et le re-render
  const screens = ['dashboard', 'planet', 'universe', 'prospect', 'resources', 'defense', 'shipyard', 'capital', 'planet-detail', 'unit-detail', 'building-detail', 'fleet', 'fleet-compose', 'fleet-detail', 'probe-detail', 'moving-target-detail', 'commerce', 'dock', 'carnet', 'embassy'];
  for (const s of screens) {
    const el = document.getElementById('scr-' + s);
    if (el && !el.classList.contains('hidden')) {
      const fn = {
        'dashboard': renderDashboard,
        'planet': renderPlanetMap,
        'universe': renderUniverseScreen,
        'prospect': renderProspectScreen,
        'resources': renderResourcesScreen,
        'defense': renderDefenseScreen,
        'shipyard': renderShipyard,
        'capital': renderCapitalScreen,
        'planet-detail': renderPlanetDetailScreen,
        'unit-detail': renderUnitDetailScreen,
        'building-detail': renderBuildingDetail,
        'fleet': renderFleetScreen,
        'fleet-compose': renderFleetCompose,
        'fleet-detail': renderFleetDetail,
        'moving-target-detail': renderMovingTargetDetailScreen,
        'commerce': renderCommerceScreen,
        'dock': renderDockScreen,
        'embassy': mpEmbassyRender,
        'carnet': renderCarnetScreen,
      }[s];
      if (fn) fn();
      return;
    }
  }
}

function cheatRes(which, amount) {
  if (which === 'all') {
    for (const k of Object.keys(G.res)) {
      G.res[k].v = Math.min(G.res[k].max, G.res[k].v + amount);
    }
  } else if (G.res[which]) {
    G.res[which].v = Math.min(G.res[which].max, G.res[which].v + amount);
  }
  toast(`+${amount} ${which === 'all' ? 'ressources' : which}`);
  refreshCurrentScreen();
}

function cheatProbe() {
  G.probe.exists = true;
  G.probe.state = 'ready';
  G.probe.mission = null;
  G.probe.rangeIdx = 4;
  G.probe.stealthIdx = 4;
  G.probe.speedIdx = 4;
  G.probe.memoryIdx = 4;
  toast('Sonde au max sur tous les axes');
  refreshCurrentScreen();
}

function cheatProbeReturn() {
  // PASSE 4-sondes-v1.1-d : fait revenir TOUTES les sondes en mission du nouveau pool
  const missions = (G.probeMissions || []).filter(m => m.status === 'in_transit');
  if (missions.length === 0) {
    toast('Aucune sonde en mission');
    return;
  }
  for (const m of missions) {
    m.arrivalAt = Date.now();
    handleProbeReturn(m.id);
  }
  toast(`${missions.length} sonde${missions.length > 1 ? 's' : ''} de retour`);
  refreshCurrentScreen();
}

function cheatUnits(unitKey, qty) {
  if (!G.defense.units[unitKey]) {
    toast('Unité inconnue');
    return;
  }
  // Si verrouillée, on déverrouille
  const def = DEFENSE_UNITS[unitKey];
  if (def && def.locked) def.locked = false;
  G.defense.units[unitKey].qty += qty;
  toast(`+${qty} ${def.name}`);
  refreshCurrentScreen();
}

// Cheat passe 3.1 : spawne directement des vaisseaux militaires au tier 1
function cheatShips(shipKey, qty) {
  if (!G.fleet.stationed[shipKey]) {
    toast('Type de vaisseau inconnu');
    return;
  }
  G.fleet.stationed[shipKey].t1 = (G.fleet.stationed[shipKey].t1 || 0) + qty;
  const meta = SHIP_UNITS[shipKey];
  toast(`+${qty} ${meta?.name || shipKey} T1`);
  refreshCurrentScreen();
}

// PATCH_2110_CHEAT_VAISSEAUX10 — chaque vaisseau du chantier orbital sort en 10 s (file en cours comprise)
function cheatFastShipsApply() {
  if (!(G.cheats && G.cheats.fastShips) || !QUEUES.shipyard) return;
  for (const c of QUEUES.shipyard.commands) if (c.unitDuration > 10) { c.unitDuration = 10; if (c.currentElapsed > 10) c.currentElapsed = 10; }
}
function cheatToggleFastShips() {
  if (!G.cheats) G.cheats = {};
  G.cheats.fastShips = !G.cheats.fastShips;
  const btn = document.getElementById('cheat-fastships-btn');
  if (btn) btn.textContent = G.cheats.fastShips ? '⏱ Vaisseaux : 10 s (actif)' : '⏱ Vaisseaux : durée normale';
  cheatFastShipsApply();
  toast(G.cheats.fastShips ? 'Vaisseaux construits en 10 s' : 'Construction des vaisseaux : durée normale');
  try { saveGame(); } catch (e) {}
  if (typeof renderShipyard === 'function' && !document.getElementById('scr-shipyard').classList.contains('hidden')) renderShipyard();
}

// PATCH_2110_CHEAT_ARCHE — une Arche prête au chantier, sans Centre 3 ni chantier 2
function cheatArche() {
  G.skills.colonialShipUnlocked = true;
  G.fleet.colonial = (G.fleet.colonial || 0) + 1;
  toast(`◈ Arche coloniale prête (${G.fleet.colonial}) · ouvre une planète habitable libre et « Coloniser »`);
  try { saveGame(); } catch (e) {}
  refreshCurrentScreen();
}
