/* Starbyte — f04_rapports_tankers_chantier.js
   Déclarations de fonctions (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


// Génère un rapport radar (sacrificiel, minimal)
function generateRadarReport(mission) {
  // ═══════════════════════════════════════════════════════════════
  // RADAR — Pipeline de SIGNATURES (passe 5.0)
  // ═══════════════════════════════════════════════════════════════
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md
  //
  // La Radar balaye un SYSTÈME ENTIER (W-X-YYYY). Elle ne révèle JAMAIS
  // d'adresse précise. Elle produit des signatures opaques (SIG-XXX) qui
  // devront être résolues par une Légère pour devenir exploitables.
  //
  // Distribution typique de signatures par balayage :
  //   30% rien (système calme)
  //   50% 1-2 signatures
  //   18% 3 signatures
  //    2% 4 signatures (abondance suspecte)
  //
  // Le silence reste un signal coûteux (Pilier 7 + Principe #7).
  // Le silence sur trou noir = 100% via SECRETS_REGISTRY.

  const parsed = (typeof parseCosmicAddress === 'function')
    ? parseCosmicAddress(mission.targetCoords || '')
    : null;

  // Adresse système — pour signatures et titre du rapport
  // PASSE 5.0 : la Radar DOIT cibler un système (validPatterns = ['system'])
  // Mais on garde un fallback safe pour les vieux saves ou modes aléatoire.
  let systemAddress;
  let canCreateSignatures = true;
  if (parsed && parsed.kind === 'system') {
    systemAddress = `${parsed.cluster}-${parsed.sector}-${parsed.system}`;
  } else if (parsed && parsed.kind === 'spot') {
    // Legacy : si vieux save avec une cible spot → on remonte au système
    systemAddress = `${parsed.cluster}-${parsed.sector}-${parsed.system}`;
  } else {
    // Mode aléatoire/secteur : on N'A PAS d'adresse système valide.
    // → on ne crée AUCUNE signature (sinon sig.system = coord mouvante, bug grave)
    // Cf. décision verrouillée #11 : pipeline signature exige un système identifié.
    systemAddress = mission.targetCoords || '???';
    canCreateSignatures = false;
  }

  // ─── Comptage de signatures à produire ───
  // Distribution : 30/50/18/2 (rien / 1-2 / 3 / 4)
  let nSignatures;
  if (!canCreateSignatures) {
    // Mode aléatoire : pas de signatures (cf. note ci-dessus)
    nSignatures = 0;
  } else {
    const roll = Math.random();
    if (roll < 0.30) nSignatures = 0;
    else if (roll < 0.55) nSignatures = 1;
    else if (roll < 0.80) nSignatures = 2;
    else if (roll < 0.98) nSignatures = 3;
    else nSignatures = 4;
  }

  // ─── Création des signatures ───
  const createdSignatures = [];
  for (let i = 0; i < nSignatures; i++) {
    const sig = createSignature(systemAddress, mission.probeName);
    if (sig) createdSignatures.push(sig);
  }

  // ─── Estimation de la résolution gagnée ───
  // Cf. GDD chap 17 — Radar : +5% à +12%
  const resolutionGain = nSignatures === 0 ? 5 : (5 + nSignatures * 2);

  // ─── Construction du rapport ───
  return {
    id: 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    probeName: mission.probeName,
    sector: mission.sector,
    tier: 'radar',
    targetCoords: mission.targetCoords,
    systemAddress,
    createdAt: Date.now(),
    read: false,
    // Données spécifiques au pipeline signatures (passe 5.0)
    signatureIds: createdSignatures.map(s => s.id),
    signaturesData: createdSignatures, // snapshot pour le rendu
    silent: nSignatures === 0,
    resolutionGain,
    // Compat ascendante (l'ancien renderer peut encore lire ces champs)
    radarSignal: nSignatures > 0 ? {
      coords: systemAddress,
      description: `${nSignatures} signature${nSignatures > 1 ? 's' : ''} relevée${nSignatures > 1 ? 's' : ''}`,
    } : null,
    targets: [],
  };
}

// Boucle de vérification du retour des sondes (1 tick / 10s, partage avec startPassiveLoop)
function tickProbes() {
  if (!Array.isArray(G.probeMissions) || G.probeMissions.length === 0) return;
  const now = Date.now();
  const toReturn = G.probeMissions.filter(p => p.status === 'in_transit' && now >= p.arrivalAt);
  for (const p of toReturn) {
    // 30/10 : la sonde rentre au hangar de SA planète
    if (p.world && p.world !== (G.activeWorld || 'home') && typeof sbWithWorld === 'function' && sbWorld(p.world)) sbWithWorld(p.world, () => handleProbeReturn(p.id));
    else handleProbeReturn(p.id);
  }

  // PASSE 4-sondes-v1.1 : vérifier aussi les rapports secrets en attente (délais 24h)
  if (typeof tickPendingDelayedReports === 'function') tickPendingDelayedReports();
}

// Accesseurs (adaptés au nouveau modèle)
function getProbeReports() { return G.probeReports || []; }
function getActiveProbes() { return (G.probeMissions || []).filter(p => p.status === 'in_transit'); }
function getProbesPool() { return G.probesPool || []; }
function getReadyProbesByTier(tier) {
  return (G.probesPool || []).filter(p => p.tier === tier && p.state === 'ready');
}
function getUnreadProbeReportsCount() {
  return (G.probeReports || []).filter(r => !r.read).length;
}
function markProbeReportAsRead(reportId) {
  const r = (G.probeReports || []).find(r => r.id === reportId);
  if (r) r.read = true;
}

// Initialise l'état d'un secret pour ce joueur si pas encore présent
function getOrInitSecretState(secretId) {
  if (!G.secretsState) G.secretsState = {};
  if (!G.secretsState[secretId]) {
    G.secretsState[secretId] = {
      currentStage: 0,
      stageHistory: [],
      pendingDelayedReports: [],
    };
  }
  return G.secretsState[secretId];
}

// Vérifie si les coords de la mission correspondent à un secret connu
function findMatchingSecret(mission) {
  const coords = String(mission.targetCoords || '').trim().toUpperCase().replace(/\s+/g, ' ');
  for (const [id, secret] of Object.entries(SECRETS_REGISTRY)) {
    for (const pattern of secret.matchPatterns) {
      const p = pattern.toUpperCase();
      if (coords === p || coords === p.replace(/-/g, '') || coords.replace(/-/g, '') === p.replace(/-/g, '')) {
        return secret;
      }
    }
  }
  return null;
}

// Trouve le stage approprié pour une sonde donnée et l'état actuel du secret
function findApplicableStage(secret, secretState, mission) {
  for (const stage of secret.stages) {
    // Le stage doit être au-delà du stage déjà franchi
    if (stage.stage < secretState.currentStage) continue;

    // Le tier de la sonde doit être autorisé pour ce stage
    if (stage.probeTiers && !stage.probeTiers.includes(mission.tier)) continue;

    // Conditions late-game (age, etc.)
    if (stage.requiresAge && (G.age || 1) < stage.requiresAge) continue;

    return stage;
  }
  return null;
}

// MOTEUR DE SECRETS — appelé depuis handleProbeReturn
// Retourne :
//   - false si pas de secret → laisser le comportement normal
//   - 'silent_loss' si la sonde doit disparaître sans bruit (PILIER 7 règle absolue)
//   - un rapport (objet) si le secret a produit un rapport spécial → stocké, prend le contrôle
function checkSecretTrigger(mission) {
  const secret = findMatchingSecret(mission);
  if (!secret) return false;

  const state = getOrInitSecretState(secret.id);
  const stage = findApplicableStage(secret, state, mission);
  if (!stage) return false;

  // Mémoriser ce stage comme franchi
  state.stageHistory.push({ stageIdx: stage.stage, at: Date.now(), missionId: mission.id });
  state.currentStage = stage.stage + 1;

  // Appliquer l'effet du stage
  switch (stage.effect) {
    case 'silent_radar': {
      // Radar sur secret : on FORCE le silence à 100% (pas 30% par défaut).
      // Cf. PILIER 7 + Principe #7 (silence coûteux) : si le joueur a de la
      // chance et tombe sur "signal détecté" au trou noir, le secret devient
      // banal. Le silence DOIT être systématique ici — c'est ce qui rend
      // l'adresse suspecte ("j'ai sondé 3 fois, jamais de signal, bizarre").
      return 'force_silent_radar';
    }

    case 'partial_report_with_delayed_followup': {
      // 1er rapport tronqué stocké immédiatement
      const firstReport = {
        id: 'pr-secret-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        probeName: mission.probeName,
        sector: mission.sector,
        tier: mission.tier,
        targetCoords: mission.targetCoords,
        createdAt: Date.now(),
        read: false,
        isSecret: true,
        secretId: secret.id,
        secretStage: stage.stage,
        // Le rapport apparaît comme un rapport légère normal mais tronqué
        targets: [],
        narrativeOverride: stage.firstReport.narrative,
        narrativeArchived: stage.firstReport.archived,
        truncated: true,
      };
      if (!Array.isArray(G.probeReports)) G.probeReports = [];
      G.probeReports.unshift(firstReport);
      if (G.probeReports.length > 50) G.probeReports.length = 50;

      // 2e rapport (followup) programmé pour 24h plus tard
      if (stage.delayedFollowup) {
        state.pendingDelayedReports.push({
          deliverAt: Date.now() + stage.delayedFollowup.delayMs,
          narrative: stage.delayedFollowup.narrative,
          archived: stage.delayedFollowup.archived,
          targetCoords: mission.targetCoords,
          probeName: mission.probeName,
          secretId: secret.id,
          stageOrigin: stage.stage,
        });
      }

      return firstReport; // signale qu'on a stocké un rapport spécial
    }

    case 'silent_loss': {
      // RÈGLE ABSOLUE PILIER 7 : aucune notification, aucun rapport, sonde perdue.
      return 'silent_loss';
    }

    case 'partial_revelation': {
      const revealReport = {
        id: 'pr-secret-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        probeName: mission.probeName,
        sector: mission.sector,
        tier: mission.tier,
        targetCoords: mission.targetCoords,
        createdAt: Date.now(),
        read: false,
        isSecret: true,
        secretId: secret.id,
        secretStage: stage.stage,
        targets: [],
        narrativeOverride: stage.report.narrative,
        narrativeArchived: stage.report.archived,
      };
      if (!Array.isArray(G.probeReports)) G.probeReports = [];
      G.probeReports.unshift(revealReport);
      if (G.probeReports.length > 50) G.probeReports.length = 50;

      // Appliquer les gains
      if (stage.report.gains) {
        for (const [resKey, amount] of Object.entries(stage.report.gains)) {
          if (resKey === 'navigationData') {
            G.navigationData = (G.navigationData || 0) + amount;
          } else if (G.res && G.res[resKey]) {
            G.res[resKey].v = Math.min(G.res[resKey].max, G.res[resKey].v + amount);
          }
        }
      }
      return revealReport;
    }

    case 'lategame_unlock': {
      // Pour l'instant juste un placeholder
      return false;
    }

    default:
      return false;
  }
}

// Vérifier les rapports retardés (complément 24h après une transmission tronquée)
// Appelé depuis tickProbes() (toutes les 10s) — donc latence max 10s sur le retour 24h
function tickPendingDelayedReports() {
  if (!G.secretsState) return;
  const now = Date.now();
  for (const [secretId, state] of Object.entries(G.secretsState)) {
    if (!Array.isArray(state.pendingDelayedReports)) continue;
    const toDeliver = state.pendingDelayedReports.filter(r => now >= r.deliverAt);
    for (const r of toDeliver) {
      // Créer un rapport "complément tardif"
      const followup = {
        id: 'pr-secret-followup-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        probeName: r.probeName,
        sector: r.targetCoords,
        tier: 'light',
        targetCoords: r.targetCoords,
        createdAt: Date.now(),
        read: false,
        isSecret: true,
        secretId,
        secretStage: r.stageOrigin,  // PASSE 4-sondes-v1.1-c fix : propager le stage
        targets: [],
        narrativeOverride: r.narrative,
        narrativeArchived: r.archived,
        isDelayedFollowup: true,
      };
      if (!Array.isArray(G.probeReports)) G.probeReports = [];
      G.probeReports.unshift(followup);
      if (G.probeReports.length > 50) G.probeReports.length = 50;
    }
    // Retirer les rapports livrés
    state.pendingDelayedReports = state.pendingDelayedReports.filter(r => now < r.deliverAt);
  }
}

// Cheat helper : accélérer tous les rapports retardés
function debugAccelerateDelayedReports() {
  if (!G.secretsState) return 0;
  let count = 0;
  for (const state of Object.values(G.secretsState)) {
    if (Array.isArray(state.pendingDelayedReports)) {
      state.pendingDelayedReports.forEach(r => { r.deliverAt = Date.now(); count++; });
    }
  }
  tickPendingDelayedReports();
  return count;
}

// Tire une rencontre selon la table pondérée
function rollEncounter() {
  const totalWeight = ENCOUNTER_TABLE.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * totalWeight;
  for (const enc of ENCOUNTER_TABLE) {
    r -= (enc.weight || 1);
    if (r <= 0) return enc;
  }
  return ENCOUNTER_TABLE[0];
}

// Applique une route à une mission tanker : ajuste durée et stocke metadata
// pour résolution ultérieure (taxe + rencontre au retour).
function applyRouteToMission(mission, routeKey) {
  const route = ROUTE_TYPES[routeKey] || ROUTE_TYPES.beacon;
  mission.routeType = route.key;
  // Ajuster la durée
  const baseDuration = mission.arrivalAt - mission.departedAt;
  let adjustedDuration = baseDuration * route.durationFactor;
  // Tirer la rencontre si route directe
  if (route.canEncounter) {
    // Chunk B Phase 1 : si le flag dev force la rencontre route_card, garantir willEncounter
    const willEncounter = G._forceNextRouteCardEncounter || (Math.random() < 0.85);
    if (willEncounter) {
      // Chunk B Phase 1 : cheat dev pour forcer la prochaine rencontre route_card
      let enc;
      if (G._forceNextRouteCardEncounter) {
        const candidates = ENCOUNTER_TABLE.filter(e => e.category === 'route_card');
        enc = candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : rollEncounter();
        G._forceNextRouteCardEncounter = false; // one-shot
      } else {
        enc = rollEncounter();
      }
      mission.encounter = {
        id: enc.id,
        category: enc.category,
        title: enc.title,
        lootBonusFactor: enc.lootBonusFactor || 1.0,
        // Chunk B Phase 1 Routes Secrètes : flag drop carte de route
        dropsRouteCard: !!enc.dropsRouteCard,
        routeCardSource: enc.routeCardSource || null,
      };
      // Si la rencontre allonge le trajet (incident customs)
      if (enc.extraDurationFactor) {
        adjustedDuration *= enc.extraDurationFactor;
      }
    }
  }
  // Appliquer la nouvelle durée
  mission.arrivalAt = mission.departedAt + adjustedDuration;
  return mission;
}

// Récupère la narration d'une rencontre par id (pour le rapport)
function getEncounterNarrative(encounterId, crew, planet) {
  const enc = ENCOUNTER_TABLE.find(e => e.id === encounterId);
  if (!enc) return null;
  return typeof enc.narrative === 'function' ? enc.narrative(crew, planet) : enc.narrative;
}

// Calcule le facteur final à appliquer sur le cargo livré, combinaison
// de la taxe de route + bonus/malus de rencontre.
function computeRouteLootFactor(mission) {
  const route = ROUTE_TYPES[mission.routeType] || ROUTE_TYPES.beacon;
  let factor = route.taxFactor;
  if (mission.encounter && mission.encounter.lootBonusFactor) {
    factor *= mission.encounter.lootBonusFactor;
  }
  return factor;
}

// Lance un tanker vers une cible d'un rapport de sonde
// force=true → retour immédiat (cheat)
function launchTankerToTarget(reportId, targetId, force) {
  if (!Array.isArray(G.tankerMissions)) G.tankerMissions = [];

  // Trouver la cible
  const report = (G.probeReports || []).find(r => r.id === reportId);
  if (!report) {
    if (typeof toast === 'function') toast('Rapport introuvable');
    return null;
  }
  const target = report.targets.find(t => t.id === targetId);
  if (!target) {
    if (typeof toast === 'function') toast('Cible introuvable');
    return null;
  }
  if (target.status !== 'pending') {
    if (typeof toast === 'function') toast('Cette cible est déjà engagée');
    return null;
  }

  // Vérifier disponibilité tanker
  const stat = G.fleet?.stationed || {};
  const totalTankers = (stat.tanker?.t1 || 0) + (stat.tanker?.t2 || 0) + (stat.tanker?.t3 || 0);
  const inMission = G.tankerMissions.filter(m => m.status === 'in_transit' || m.status === 'returning').length;
  const availableTankers = tankerAvailability(null);
  if (availableTankers <= 0 && !force) {
    if (typeof toast === 'function') toast('Aucun tanker disponible');
    return null;
  }

  // Créer la mission
  const now = Date.now();
  const durationMs = target.tankerDurationMs || 60 * 60 * 1000;
  const mission = {
    id: 'tm-' + now + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: 'Σ-' + Math.floor(Math.random() * 99 + 1),  // Sigma-X
    targetType: target.type,
    targetLabel: target.label,
    targetCoords: target.coordinates,
    reportId,
    targetId,
    departedAt: now,
    arrivalAt: force ? now : (now + durationMs),
    riskLossPct: target.riskLossPct || 0,
    status: 'in_transit',
    // Chunk B Phase 1 Routes Secrètes (16/05) : un tanker envoyé sur une cible
    // de rapport de sonde part en EXPLORATION spatiale, pas en commerce.
    // Pas de couloir balisé pour aller voir une épave isolée → voie directe par défaut.
    // → permet de croiser Torek/Cobalt et de rapporter des cartes de route.
    routeType: 'direct',
  };
  // Appliquer la route TOUJOURS : tire l'encounter et ajuste la durée.
  // Fix 18/05 : en mode cheat (force=true), on appelait pas applyRouteToMission, ce qui
  // empêchait les rencontres Torek/Cobalt de se déclencher. Maintenant on l'appelle toujours,
  // baseDuration=0 → adjustedDuration=0 → arrivalAt reste à `now` (cheat préservé).
  if (typeof applyRouteToMission === 'function') {
    applyRouteToMission(mission, 'direct');
  }
  if (force) {
    // Sécurité : forcer arrivalAt à now (au cas où une rencontre rare aurait modifié la durée)
    mission.arrivalAt = now;
  }
  G.tankerMissions.push(sbTagWorld(mission));

  // Marquer la cible comme engagée
  target.status = 'tanker_sent';
  target.tankerMissionId = mission.id;

  if (force) {
    handleTankerReturn(mission.id);
  }

  if (typeof toast === 'function') {
    toast(force
      ? `${icon('tanker', {size:12})} ${mission.tankerName} part vers ${target.label} (retour immédiat — cheat)`
      : `${icon('tanker', {size:12})} ${mission.tankerName} part vers ${target.label} — retour dans ${formatTankerDuration(durationMs)}`);
  }
  return mission;
}

// ─── Lance un tanker vers une cible CONNUE (knownTargets) ───
// Cf. starbyte_gdd_v1/16_deux_univers.md
// Différence avec launchTankerToTarget : la cible n'est pas dans report.targets
// mais dans G.knownTargets (univers mouvant persistant).
// La cible reste visible (status='engaged') pendant la mission ; si le tanker
// est perdu, la cible redevient 'available' (décision verrouillée Q3 mai 2026).
function launchTankerToKnownTarget(coordKey, force) {
  if (!Array.isArray(G.tankerMissions)) G.tankerMissions = [];

  // Trouver la cible
  const target = G.knownTargets ? G.knownTargets[coordKey] : null;
  if (!target) {
    if (typeof toast === 'function') toast('Cible introuvable');
    return null;
  }
  if (target.status === 'engaged') {
    if (typeof toast === 'function') toast('Cette cible est déjà engagée par un tanker');
    return null;
  }

  // Vérifier disponibilité tanker
  const stat = G.fleet?.stationed || {};
  const totalTankers = (stat.tanker?.t1 || 0) + (stat.tanker?.t2 || 0) + (stat.tanker?.t3 || 0);
  const inMission = G.tankerMissions.filter(m => m.status === 'in_transit' || m.status === 'returning').length;
  const availableTankers = tankerAvailability(null);
  if (availableTankers <= 0 && !force) {
    if (typeof toast === 'function') toast('Aucun tanker disponible');
    return null;
  }

  // Récupérer la config du type pour les durées et risques
  const cfg = PROBE_TARGET_CONFIG[target.type] || {};

  // ⚠ PHASE DE TEST (passe 4.6) : durée courte pour valider la boucle complète
  // Cf. décision verrouillée Q2 mai 2026 — équilibrage des durées dans une passe ultérieure.
  // Plage 5-10min pour TOUS les types, qu'on remplacera par cfg.tankerDurationMinMs/MaxMs.
  const TEST_MIN_MS = 5 * 60 * 1000;   // 5 min
  const TEST_MAX_MS = 10 * 60 * 1000;  // 10 min
  const durationMs = TEST_MIN_MS + Math.random() * (TEST_MAX_MS - TEST_MIN_MS);

  const now = Date.now();
  const mission = {
    id: 'tm-' + now + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: 'Σ-' + Math.floor(Math.random() * 99 + 1),
    targetType: target.type,
    targetLabel: target.label,
    targetCoords: target.cosmicAddress || coordKey,
    knownTargetCoordKey: coordKey,   // ← marqueur : cette mission consomme une knownTarget
    reportId: null,                   // pas de rapport source (cible vient de l'univers mouvant)
    targetId: null,
    departedAt: now,
    arrivalAt: force ? now : (now + durationMs),
    riskLossPct: cfg.riskLossPct || 0,
    status: 'in_transit',
    // Chunk B Phase 1 Routes Secrètes (16/05) : voie directe par défaut pour exploration spatiale
    routeType: 'direct',
  };
  // Appliquer la route TOUJOURS : tire l'encounter et ajuste la durée.
  // Fix 18/05 : en mode cheat (force=true), on appelait pas applyRouteToMission, ce qui
  // empêchait les rencontres Torek/Cobalt de se déclencher. Maintenant on l'appelle toujours,
  // baseDuration=0 → adjustedDuration=0 → arrivalAt reste à `now` (cheat préservé).
  if (typeof applyRouteToMission === 'function') {
    applyRouteToMission(mission, 'direct');
  }
  if (force) {
    // Sécurité : forcer arrivalAt à now
    mission.arrivalAt = now;
  }
  G.tankerMissions.push(sbTagWorld(mission));

  // Marquer la cible comme engagée (reste visible mais grimée)
  if (typeof engageKnownTarget === 'function') {
    engageKnownTarget(coordKey, mission.id);
  }

  if (force) {
    handleTankerReturn(mission.id);
  } else {
    // Démarrer le countdown UI tanker
    if (typeof startTankerCountdownTicker === 'function') {
      startTankerCountdownTicker();
    }
  }

  if (typeof toast === 'function') {
    toast(force
      ? `${icon('tanker', {size:12})} ${mission.tankerName} part vers ${target.label} (retour immédiat — cheat)`
      : `${icon('tanker', {size:12})} ${mission.tankerName} part vers ${target.label} — retour dans ${formatTankerDuration(durationMs)}`);
  }
  return mission;
}

// Quand le tanker revient : calcule loot ou perte, génère rapport narratif
function handleTankerReturn(missionId) {
  if (!Array.isArray(G.tankerMissions)) return;
  const idx = G.tankerMissions.findIndex(m => m.id === missionId);
  if (idx === -1) return;
  const mission = G.tankerMissions[idx];
  if (mission.status !== 'in_transit') return;
  if (window.SBSfx) SBSfx.play('dock');   // SFX_2410

  // PATCH_1310_POSTES — poste de route : le tanker reste en station au bout de la route
  if (mission.kind === 'route_post') {
    mission.status = 'posted';
    mission.postedAt = Date.now();
    toast(`${mission.tankerName} a ouvert un poste à ${mission.targetCoords}`);
    mpPostSync();
    if (typeof saveGame === 'function') saveGame();
    if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return;
  }

  // ─── Chunk 15/05 : Mission DROPOFF (tanker logistique) ───
  // Si mission.kind === 'dropoff', on délègue à handleTankerDropoffArrival
  // qui gère le dépôt de garnison (ou la perte sur planète mortelle).
  if (mission.kind === 'dropoff') {
    handleTankerDropoffArrival(mission);
    // Chunk polish 15/05 : la mission peut maintenant être :
    //   - 'orbital_relay' : tanker reste (on ne touche pas)
    //   - 'returning'     : tanker fait demi-tour avec timer (on ne touche pas, tick le gérera)
    //   - 'returned'      : cas edge ; on nettoie
    if (mission.status === 'returned') {
      G.tankerMissions.splice(idx, 1);
    }
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return;
  }

  // ─── Chunk D (18/05) : Mission ROUTE_RUN ───
  // Tanker envoyé sur une route activée → arrivée à un dock.
  // Le tanker reste 'docked' jusqu'au "Rentrer maintenant" du joueur.
  if (mission.kind === 'route_run') {
    handleTankerRouteArrival(mission);
    // mission.status est maintenant 'docked' ; on ne supprime PAS la mission ici.
    // Elle sera supprimée quand le joueur déclenchera returnTankerFromDock.
    if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
    return;
  }

  // ─── Mission PICKUP classique (récupération cargo cible mouvante) ───
  const cfg = PROBE_TARGET_CONFIG[mission.targetType];
  if (!cfg) {
    mission.status = 'returned';
    return;
  }

  // Vérifier perte du tanker (risque sur anomalies)
  const isLost = mission.riskLossPct > 0 && Math.random() * 100 < mission.riskLossPct;

  if (isLost) {
    // Tanker perdu : retirer de la flotte (priorité t1, sinon t2, sinon t3)
    const stat = G.fleet?.stationed?.tanker;
    if (mission.bmEnvoy) { if (window.SBBlackmarket) SBBlackmarket.envoyLost(mission); }   // PATCH_0211_AMBASSADEUR
    else if (stat) {
      if (stat.t1 > 0) stat.t1 -= 1;
      else if (stat.t2 > 0) stat.t2 -= 1;
      else if (stat.t3 > 0) stat.t3 -= 1;
    }
    mission.status = 'lost';

    // PASSE 4.6 — Cible knownTarget : libérer (redevient 'available')
    // Décision verrouillée Q3 mai 2026 : pas de double peine pour le joueur
    if (mission.knownTargetCoordKey && typeof releaseKnownTarget === 'function') {
      releaseKnownTarget(mission.knownTargetCoordKey);
    }

    // Générer rapport de perte
    storeTankerReturnReport(mission, null, true);

    if (typeof toast === 'function') {
      toast(mission.bmEnvoy ? `${mission.tankerName} sort de l'anomalie magnétique hors service` : `${mission.tankerName} ne reviendra pas — anomalie magnétique`);
    }
  } else {
    // Calcul du loot
    const loot = computeTankerLoot(mission.targetType);

    // ─── PASSE 6 — Drop narratif Caldris (mutex avec multiverseArchetype) ───
    // On tente le drop seulement si aucun archetype Multivers SF n'a été
    // pioché : un retour de tanker = au plus UN événement narratif majeur.
    if (!loot.multiverseArchetype) {
      loot.legendDrop = maybeGenerateLegendDrop(mission);
    }

    // Appliquer aux ressources
    applyTankerLootToResources(loot);

    // Chunk B Phase 1 Routes Secrètes : drop de carte si l'encounter en porte une
    let droppedCard = null;
    if (mission.encounter && mission.encounter.dropsRouteCard) {
      droppedCard = generateRouteCard({
        source: mission.encounter.routeCardSource || 'Voyageur anonyme',
      });
      addRouteCard(droppedCard);
      loot.routeCard = droppedCard; // pour que le rapport puisse l'afficher
    }

    mission.status = 'returned';

    // Mettre à jour le statut de la cible dans le rapport de sonde
    const report = (G.probeReports || []).find(r => r.id === mission.reportId);
    if (report) {
      const target = report.targets.find(t => t.id === mission.targetId);
      if (target) target.status = 'tanker_returned';
    }

    // PASSE 4.6 — Cible knownTarget : supprimer définitivement (consommée)
    // Cf. starbyte_gdd_v1/16_deux_univers.md : la cible disparaît de la liste,
    // le joueur doit re-sonder pour découvrir de nouvelles cibles.
    if (mission.knownTargetCoordKey && typeof removeKnownTarget === 'function') {
      removeKnownTarget(mission.knownTargetCoordKey);
    }

    // Générer rapport narratif (la narrative inclut le bloc legend si drop présent)
    const tankerReport = storeTankerReturnReport(mission, loot, false);

    // ─── PASSE 6 — Indexer le drop dans Archives + lien bidirectionnel ───
    if (loot.legendDrop) {
      applyLegendDrop(loot.legendDrop, mission, tankerReport ? tankerReport.id : null);
      // Stocker l'ID du fragment/relic/hint dans le rapport tanker (lien archive → rapport)
      if (tankerReport) {
        tankerReport.legendDropId = loot.legendDrop.payload.id;
        tankerReport.legendDropType = loot.legendDrop.type;
      }
    }

    if (typeof toast === 'function') {
      const lootSummary = formatLootSummary(loot);
      let suffix = ' · rapport disponible';
      // Toast spécial discret quand un drop archives a eu lieu (sans spoiler)
      if (loot.legendDrop) {
        const dropLabel = loot.legendDrop.type === 'relic' ? 'objet témoin'
          : loot.legendDrop.type === 'coord_hint' ? 'coordonnée partielle'
          : 'fragment';
        suffix = ` · ${dropLabel} archivé`;
      }
      // Chunk B Phase 1 : toast spécial drop carte de route
      if (droppedCard) {
        suffix = ` · carte de route trouvée`;
      }
      toast(`${mission.tankerName} revenu — ${lootSummary}${suffix}`);
    }
  }

  // Retirer de la liste active
  G.tankerMissions.splice(idx, 1);

  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Calcule le butin selon le type de cible
function computeTankerLoot(targetType) {
  const cfg = PROBE_TARGET_CONFIG[targetType];
  if (!cfg) return { resources: {} };

  const loot = { resources: {}, fragment: null, multiverseArchetype: null, navigationData: 0 };

  if (cfg.lootResource === null) {
    // Signal inexplicable : pas de loot
  } else if (cfg.lootResource === 'navigation_data') {
    loot.navigationData = 1;
  } else if (cfg.lootResource === 'mixed_random') {
    // Cargo : 1-2 ressources aléatoires
    const choices = ['metal', 'energie', 'cristal'];
    const n = Math.random() < 0.5 ? 1 : 2;
    const picked = [];
    for (let i = 0; i < n; i++) {
      const r = choices[Math.floor(Math.random() * choices.length)];
      if (!picked.includes(r)) {
        picked.push(r);
        loot.resources[r] = Math.floor(cfg.lootMin + Math.random() * (cfg.lootMax - cfg.lootMin));
      }
    }
  } else if (cfg.lootResource === 'mixed_light' || cfg.lootResource === 'mixed_combat') {
    // Épave/Débris : ressource principale + secondaire
    loot.resources[cfg.lootResource === 'mixed_light' ? 'metal' : 'metal'] =
      Math.floor(cfg.lootMin + Math.random() * (cfg.lootMax - cfg.lootMin));
    if (cfg.lootSecondaryResource && cfg.lootSecondaryMin) {
      loot.resources[cfg.lootSecondaryResource] =
        Math.floor(cfg.lootSecondaryMin + Math.random() * (cfg.lootSecondaryMax - cfg.lootSecondaryMin));
    }
  } else {
    // Ressource unique (astéroïdes, cristal, anomalie)
    loot.resources[cfg.lootResource] = Math.floor(cfg.lootMin + Math.random() * (cfg.lootMax - cfg.lootMin));
  }

  // Fragment archivé (épaves, débris, cargos, anomalies)
  // PASSE 6 : neutralisé. Le système de fragments Caldris (loot.legendDrop)
  // remplace ce placeholder. fragmentChancePct reste dans PROBE_TARGET_CONFIG
  // comme dead config pour ne pas casser une éventuelle reprise future.
  // if (cfg.fragmentChancePct && Math.random() * 100 < cfg.fragmentChancePct) {
  //   loot.fragment = true;
  // }

  // Archétype Multivers SF (sondes anciennes, signaux)
  if (cfg.multiverseArchetypeChancePct && Math.random() * 100 < cfg.multiverseArchetypeChancePct) {
    loot.multiverseArchetype = pickMultiverseArchetype();
  }

  return loot;
}

// Applique le butin aux ressources du joueur
function applyTankerLootToResources(loot) {
  if (!loot || !loot.resources) return;
  for (const [resKey, amount] of Object.entries(loot.resources)) {
    if (G.res && G.res[resKey]) {
      G.res[resKey].v = Math.min(G.res[resKey].max, G.res[resKey].v + amount);
    }
  }
  // navigationData : pour l'instant on stocke juste un compteur
  if (loot.navigationData) {
    G.navigationData = (G.navigationData || 0) + loot.navigationData;
  }
}

// Formate un résumé court du butin pour le toast
function formatLootSummary(loot) {
  if (!loot) return 'mission terminée';
  const parts = [];
  for (const [k, v] of Object.entries(loot.resources || {})) {
    const info = (typeof tileInfo === 'function') ? tileInfo(k) : null;
    parts.push(`+${v} ${info?.label?.toLowerCase() || k}`);
  }
  if (loot.navigationData) parts.push('+1 données nav.');
  // PASSE 6 : remplace l'ancien placeholder loot.fragment
  if (loot.legendDrop) {
    const t = loot.legendDrop.type;
    if (t === 'fragment') parts.push('+1 fragment archivé');
    else if (t === 'relic') parts.push('+1 objet témoin');
    else if (t === 'coord_hint') parts.push('+1 coord. partielle');
  }
  return parts.join(', ') || 'cargo vide';
}

// Stocke le rapport de retour de tanker dans G.tankerReports
function storeTankerReturnReport(mission, loot, isLost) {
  if (!Array.isArray(G.tankerReports)) G.tankerReports = [];

  const narrative = generateTankerReturnNarrative(mission, loot, isLost);

  // Récupérer la signature d'origine (chaîne mission → probe report → signature)
  // pour permettre le lien bidirectionnel rapport tanker ↔ rapport sonde d'origine.
  // Cf. feedback Adrien 14/05 : "envie de mettre les rapports bien visibles
  // dans le centre de prospection en redondance et bien visible aussi dans
  // les rapports de sonde desquels ils sont partis"
  let sourceSignatureId = null;
  const sourceReport = mission.reportId
    ? (G.probeReports || []).find(r => r.id === mission.reportId)
    : null;
  if (sourceReport && sourceReport.signatureId) {
    sourceSignatureId = sourceReport.signatureId;
  }

  const report = {
    id: 'tr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: mission.tankerName,
    targetType: mission.targetType,
    targetLabel: mission.targetLabel,
    targetCoords: mission.targetCoords,
    createdAt: Date.now(),
    read: false,
    isLost,
    loot,
    narrative,
    // Liens bidirectionnels (feedback 14/05)
    sourceProbeReportId: mission.reportId || null,
    sourceSignatureId,
  };
  G.tankerReports.unshift(report);
  if (G.tankerReports.length > 50) G.tankerReports.length = 50;
  return report;
}

// Génère le récit narratif au retour du tanker
// V1 : templates basiques. La v1-d enrichira massivement.
// PASSE 6 : append d'un bloc Archives du Vide si loot.legendDrop présent.
function generateTankerReturnNarrative(mission, loot, isLost) {
  if (isLost) {
    return _narrateTankerLoss(mission);
  }
  const cfg = PROBE_TARGET_CONFIG[mission.targetType];
  let baseNarrative;
  if (!cfg.hasNarrative) {
    baseNarrative = _narrateUtilitaryReturn(mission, loot);
  } else {
    baseNarrative = _narrateNarrativeReturn(mission, loot);
  }

  // ─── Fix 18/05 (bug Chunk B) — Préfixer avec la narration de rencontre voie directe ───
  // Les missions PICKUP (récupération sur cible de sonde) sont désormais TOUJOURS en voie
  // directe (cf. Chunk B). Quand une rencontre est tirée (Torek, Cobalt, tempête...), son
  // récit doit apparaître en tête du rapport pour donner du sens au cargo et aux cartes
  // de route trouvées. Avant ce fix, l'encounter était silencieuse dans les rapports pickup.
  const crew = (typeof pickSpaceWorkerName === 'function') ? pickSpaceWorkerName() : 'L\'équipage';
  const routePrefix = (typeof _buildRouteTrajetPrefix === 'function')
    ? _buildRouteTrajetPrefix(mission, crew)
    : '';

  // ─── PASSE 6 — Enrichissement Archives du Vide ───
  // Append du bloc legend à la fin de la narrative, sobre et froid.
  // Cf. décision Adrien : "Les deux : narrative enrichie ET entrée séparée"
  if (loot && loot.legendDrop && typeof legendDropToNarrativeBlock === 'function') {
    const block = legendDropToNarrativeBlock(loot.legendDrop);
    if (block) {
      return routePrefix + baseNarrative + block;
    }
  }
  return routePrefix + baseNarrative;
}

function _narrateTankerLoss(mission) {
  if (mission.bmEnvoy) return `${mission.tankerName} est ressorti de là la cale vide et la coque fumante. Il rentre à quai, hors service. Personne à bord ne veut en parler.`;   // PATCH_0211_AMBASSADEUR
  const crew = pickSpaceWorkerName();
  return `Le tanker ${mission.tankerName}, sous commandement de ${crew}, n'a pas répondu à l'appel après son entrée dans la zone d'anomalie ${mission.targetCoords}.\n\nLes dernières transmissions étaient incohérentes — les capteurs rapportaient des champs gravitationnels qui ne correspondaient à aucun modèle connu. Le contact a été perdu treize minutes après l'arrivée prévue.\n\nLa mission de recherche a été annulée. L'équipage a été déclaré disparu au cycle suivant. ${crew} était à bord depuis huit cycles.`;
}

function _narrateUtilitaryReturn(mission, loot) {
  const crew = pickSpaceWorkerName();
  const lootDescr = formatLootSummary(loot);
  return `Le tanker ${mission.tankerName} est revenu sans incident de la zone ${mission.targetCoords}. L'équipage de ${crew} a procédé à l'extraction selon les protocoles standards.\n\nCargo livré : ${lootDescr}.\n\nAucun signalement à l'équipe administrative.`;
}

function _narrateNarrativeReturn(mission, loot) {
  // V1 : templates basiques par type (la v1-d enrichira)
  const crew = pickSpaceWorkerName();
  const lootDescr = formatLootSummary(loot);

  switch (mission.targetType) {
    case 'epave':
      return `Le tanker ${mission.tankerName} a accosté l'épave à ${mission.targetCoords} sans difficulté. L'équipe de ${crew} a effectué l'inspection en deux heures.\n\nL'épave était un cargo civil reconverti pour le transport de personnel. Six couchettes, dont quatre faites. Une photo de famille fixée au mur de la cabine principale. Aucun corps. Aucune trace de combat. Les moteurs étaient en bon état mais arrêtés depuis l'extérieur. Comme si l'équipage était parti volontairement, sans précipitation, en laissant les lits faits.\n\nL'équipe a refermé l'épave et est rentrée. Cargo livré : ${lootDescr}.`;

    case 'debris':
      return `Le tanker ${mission.tankerName} est arrivé sur le champ de débris à ${mission.targetCoords}. ${crew}, en charge de l'inspection, a identifié trois coques distinctes — toutes éventrées par des tirs frontaux.\n\nL'origine des belligérants n'a pas pu être déterminée : les marquages d'identification ont été soit effacés, soit volontairement masqués avant le combat. Un fragment de journal de bord a été récupéré sur la plus grande coque. Les dates correspondent à une période antérieure à la fondation de la colonie.\n\nLes ressources récupérables ont été remontées : ${lootDescr}.`;

    case 'cargo':
      return `Le cargo abandonné à ${mission.targetCoords} était parfaitement intact lorsque ${mission.tankerName} y est arrivé. Pas d'avaries, pas de signatures de combat, et la cale était scellée de l'intérieur.\n\n${crew} a forcé l'écoutille. La cale contenait du matériel encore catalogué — emballé, étiqueté, prêt à être livré. Aucune destination n'apparaissait sur les bordereaux. Le manifeste original n'a pas été retrouvé.\n\nL'équipe a tout transféré sur le tanker et a refermé le cargo derrière elle. Cargo livré : ${lootDescr}.`;

    case 'anomalie':
      return `Le tanker ${mission.tankerName} est revenu de l'anomalie magnétique de ${mission.targetCoords} avec deux jours d'avance sur le calendrier prévu. ${crew}, en charge de l'expédition, n'a pas été en mesure de fournir une explication satisfaisante à cet écart temporel.\n\nLes journaux de bord du tanker indiquent une mission complète, des prélèvements effectués, et une procédure de retour normale. Les horloges internes du tanker correspondent au calendrier théorique. Seules les horloges externes — celles de la colonie — indiquent un écart.\n\nL'équipage a été placé en observation médicale standard. Cargo livré : ${lootDescr}.`;

    case 'sonde_ancienne':
      if (loot.multiverseArchetype) {
        return `${mission.tankerName} a localisé la sonde ancienne dérivant à ${mission.targetCoords}. L'objet était plus petit que prévu — moins de douze mètres — mais sa coque portait des marquages que personne dans l'équipage n'a pu identifier.\n\nLa mémoire de la sonde était fragmentaire, mais ${crew} a réussi à extraire un enregistrement partiel. Le décodage a été effectué au retour. Le contenu :\n\n${loot.multiverseArchetype.fragment}\n\nLe reste du fragment est illisible. Cargo livré : ${lootDescr}.`;
      }
      return `${mission.tankerName} a récupéré la sonde ancienne à ${mission.targetCoords}. L'objet était inerte. ${crew} a extrait les composants identifiables et a remonté le tout.\n\nAucune mémoire exploitable n'a pu être tirée. La sonde sera placée dans les archives techniques. Cargo livré : ${lootDescr}.`;

    case 'signal':
      if (loot.multiverseArchetype) {
        return `${mission.tankerName} est arrivé sur les coordonnées ${mission.targetCoords} à l'heure prévue. ${crew} a effectué un sweep complet de la zone. Aucune source physique du signal n'a été identifiée.\n\nLe signal lui-même, capturé pendant 23 minutes avant de s'évanouir, contenait le fragment suivant :\n\n${loot.multiverseArchetype.fragment}\n\nLe tanker est rentré à vide. Aucune ressource n'a été récupérée.`;
      }
      return `${mission.tankerName} a effectué le sweep des coordonnées ${mission.targetCoords}. ${crew} n'a rien trouvé. Le signal s'était évanoui avant l'arrivée.\n\nLe rapport mentionne "secteur vide à l'inspection visuelle". Pas de cargo. Pas de conséquence opérationnelle.`;

    default:
      return _narrateUtilitaryReturn(mission, loot);
  }
}

// Boucle de vérification du retour des tankers (appelée depuis startPassiveLoop)
function tickTankerMissions() {
  if (!Array.isArray(G.tankerMissions) || G.tankerMissions.length === 0) return;
  const now = Date.now();

  // Missions in_transit qui sont arrivées (handleTankerReturn → pickup ou dropoff)
  const toArrive = G.tankerMissions.filter(m => m.status === 'in_transit' && now >= m.arrivalAt);
  for (const m of toArrive) {
    handleTankerReturn(m.id);
  }

  // D5.3 : Tankers en exploration qui arrivent sur leur cible (on les fait passer en returning)
  const exploringArriving = G.tankerMissions.filter(m => m.status === 'exploring' && now >= m.arrivalAt);
  for (const m of exploringArriving) {
    if (typeof handleExplorationArrival === 'function') handleExplorationArrival(m);
  }

  // Chunk polish 15/05 : missions returning qui sont rentrées
  // Ces missions ont été annulées en cours de route, ou un orbital_relay a été rappelé,
  // ou un dropoff avec intent=return est en phase retour.
  // 18/05 : ajout du cas route_run (retour de dock avec barre de progression).
  // D5.3 : ajout du cas exploration (retour avec résolution de lead).
  const toComplete = G.tankerMissions.filter(m => m.status === 'returning' && now >= (m.returnArrivalAt || 0));
  for (const m of toComplete) {
    if (m.kind === 'route_run' && m._cancelled) {
      _completeCancelledRouteRun(m.id);
    } else if (m.kind === 'route_run') {
      _completeRouteRunReturn(m.id);
    } else if (m.kind === 'exploration') {
      completeExplorationReturn(m.id);
    } else {
      handleTankerReturnFromCancellation(m.id);
    }
  }

  // AUDIT_1110 — séjour terminé (même app fermée) : départ à l'heure de fin prévue
  for (const m of G.tankerMissions.filter(x => x.status === 'docked' && x.kind === 'route_run' && x.dockStay && now >= x.dockStay.endsAt)) {
    returnTankerFromDock(m.id, m.dockStay.endsAt);
  }

  // ─── D2 : tick humeur équipage pour les missions docked ───
  // 1 tick = 1 heure simulée. En mode normal, tick toutes les 30 secondes réelles.
  // Cheat : G._dockMoodAccelerate fait passer à toutes les 2 secondes (1 tick = 1h en 2s).
  const moodTickInterval = G._dockMoodAccelerate ? 2000 : 30000;
  const SIMULATED_HOUR_MS = 60 * 60 * 1000;
  const dockedMissions = G.tankerMissions.filter(m =>
    m.status === 'docked' && m.kind === 'route_run' && m.crewMood
  );
  for (const m of dockedMissions) {
    const lastTick = m.crewMood.lastTickAt || (m.dock?.arrivedAt || now);
    if (now - lastTick >= moodTickInterval) {
      // Fix 18/05 : en mode accéléré, faire avancer artificiellement le timer du séjour
      // pour qu'il reflète l'écoulement simulé (sinon le timer reste à 23h58 alors
      // que l'humeur évolue comme si des heures s'étaient écoulées).
      if (G._dockMoodAccelerate && m.dockStay) {
        const realElapsed = now - lastTick;
        const simulatedAdvance = SIMULATED_HOUR_MS - realElapsed; // temps à rattraper
        if (simulatedAdvance > 0) {
          m.dockStay.startedAt -= simulatedAdvance;
          m.dockStay.endsAt -= simulatedAdvance;
        }
      }
      tickCrewMood(m);
    }
  }
}

// ─── Chunk polish 15/05 : Annuler une mission tanker en cours ───
// Le tanker fait demi-tour. Sa cale revient au stock (avec temps de retour
// = temps déjà parcouru — principe "il rentre par où il est venu").
async function cancelTankerMission(missionId) {
  if (!Array.isArray(G.tankerMissions)) return;
  const m = G.tankerMissions.find(x => x.id === missionId);
  if (!m || m.status !== 'in_transit') {
    if (typeof toast === 'function') toast('Mission déjà terminée');
    return;
  }

  // Composer le récap de la cale qui rentre
  let cargoLines = [];
  if (m.kind === 'route_run' && m.cargo) {
    for (const rk of ['metal', 'energie', 'cristal']) if (m.cargo[rk] > 0) cargoLines.push(`${fmt(m.cargo[rk])} ${rk}`);
  }
  if (m.kind === 'dropoff' && m.cargo) {
    if (m.cargo.soldiers?.garde > 0) cargoLines.push(`${m.cargo.soldiers.garde} garde`);
    if (m.cargo.soldiers?.lourd > 0) cargoLines.push(`${m.cargo.soldiers.lourd} lourd`);
    for (const rk of ['metal', 'energie', 'cristal']) {
      if (m.cargo.resources?.[rk] > 0) cargoLines.push(`${fmt(m.cargo.resources[rk])} ${rk}`);
    }
  }
  const cargoSummary = cargoLines.length
    ? `<br>${cargoLines.map(l => `· ${l}`).join('<br>')}`
    : '<br><em>cale vide</em>';

  // Calcul du temps de retour (= temps déjà parcouru, principe de demi-tour)
  const now = Date.now();
  const elapsedMs = now - m.departedAt;
  const totalMs = m.arrivalAt - m.departedAt;
  const returnMs = Math.min(elapsedMs, totalMs);
  const returnLabel = returnMs < 60000
    ? `${Math.floor(returnMs / 1000)} secondes`
    : `${Math.ceil(returnMs / 60000)} minutes`;

  const ok = await sbConfirmWarning(
    'Annuler la mission',
    `<strong>${m.tankerName}</strong> fait demi-tour vers ${G.planet?.name || 'la planète'}.<br><br>Cale à bord :${cargoSummary}<br><br><em>Retour dans ~${returnLabel}.</em>`,
    'Demi-tour'
  );
  if (!ok) return;

  // Transformer la mission en "returning" : le tick gérera l'arrivée
  if (m.kind === 'route_run') m._cancelled = true;   // AUDIT_1110 : demi-tour = pas de commerce, cale rendue
  m.status = 'returning';
  m.cancelledAt = now;
  m.returnArrivalAt = now + returnMs;
  mpConvoyEnd(m, 'out');   // PIRATERIE_1210 — demi-tour : plus sur la route surveillée

  if (typeof toast === 'function') toast(`${m.tankerName} fait demi-tour · retour dans ${returnLabel}`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── Chunk polish 15/05 : Le tanker rentre après annulation / rappel / dropoff-return ───
function handleTankerReturnFromCancellation(missionId) {
  if (!Array.isArray(G.tankerMissions)) return;
  const idx = G.tankerMissions.findIndex(m => m.id === missionId);
  if (idx === -1) return;
  const m = G.tankerMissions[idx];
  if (m.status !== 'returning') return;
  if (window.SBSfx) SBSfx.play('dock');   // SFX_2410

  if (m.mpTrade) mpTradeCashIn(m);   // PATCH_2110_COMMERCE — CG de la vente
  // Restituer les ressources au stock (les soldats étaient "engagés", se libèrent automatiquement)
  let restituted = [];
  if (m.cargo?.resources) {
    for (const rk of ['metal', 'energie', 'cristal']) {
      const qty = m.cargo.resources[rk] || 0;
      if (qty > 0 && G.res[rk]) {
        G.res[rk].v = m.mpTarget ? G.res[rk].v + qty : Math.min(G.res[rk].max, G.res[rk].v + qty);   // AMBASSADES_1210 : cale offerte rendue intacte
        const info = tileInfo(rk);
        restituted.push(`${fmt(qty)} ${info?.label?.toLowerCase() || rk}`);
      }
    }
  }
  let totalSoldiers = 0;
  if (m.cargo?.soldiers) {
    totalSoldiers = (m.cargo.soldiers.garde || 0) + (m.cargo.soldiers.lourd || 0);
  }

  // Si c'était un rapatriement de garnison, générer le rapport narratif
  if (m._garrisonRapatriationData) {
    const data = m._garrisonRapatriationData;
    const gForReport = {
      planetCoord: data.planetCoord,
      planetName: data.planetName,
      planetType: m.destinationPlanetType,
      soldiers: m.cargo.soldiers,
      resources: m.cargo.resources,
      soldiersAtDeposit: data.soldiersAtDeposit,
      depositedAt: data.depositedAt,
      contactingTankerName: m.tankerName,
    };
    if (typeof storeGarrisonRapatriationReport === 'function') {
      storeGarrisonRapatriationReport(gForReport, 'connected');
    }
  }

  // Marquer comme returned et retirer
  m.status = 'returned';
  G.tankerMissions.splice(idx, 1);

  // Toast informatif
  const parts = [];
  if (totalSoldiers > 0) parts.push(`${totalSoldiers} soldat${totalSoldiers > 1 ? 's' : ''}`);
  parts.push(...restituted);
  const summary = parts.length ? parts.join(', ') : 'cale vide';
  if (typeof toast === 'function') toast(`${m.tankerName} rentré — ${summary}`);

  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}
function startTankerCountdownTicker() {
  if (_tankerCountdownInterval) return;
  _tankerCountdownInterval = setInterval(() => {
    // D5.3 : inclure 'exploring' (tanker parti sur une piste) dans le check
    const hasActive = (G.tankerMissions || []).some(m =>
      m.status === 'in_transit' || m.status === 'returning' || m.status === 'exploring'
    );
    if (!hasActive) {
      // Plus rien à animer → arrêter le ticker
      clearInterval(_tankerCountdownInterval);
      _tankerCountdownInterval = null;
      return;
    }
    // Chunk polish 15/05 (post-feedback iPhone) : re-render TOUS les écrans
    // qui peuvent afficher une card tanker en mission. Auparavant on ne
    // touchait que scr-universe et scr-prospect, donc les cards sur Flotte
    // et les fiches détail restaient figées visuellement.
    const isVisible = (id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    };
    if (isVisible('scr-universe') && typeof renderUniverseScreen === 'function') {
      renderUniverseScreen();
    }
    if (isVisible('scr-prospect') && typeof renderProspectRapports === 'function') {
      renderProspectRapports();
    }
    if (isVisible('scr-fleet') && typeof renderFleetScreen === 'function') {
      renderFleetScreen();
    }
    if (isVisible('scr-moving-target-detail') && typeof renderMovingTargetDetailScreen === 'function') {
      renderMovingTargetDetailScreen();
    }
    if (isVisible('scr-planet-detail') && typeof renderPlanetDetailScreen === 'function') {
      renderPlanetDetailScreen();
    }
  }, 1000);
}

// Accesseurs
function getTankerReports() { return G.tankerReports || []; }
function getActiveTankerMissions() { return G.tankerMissions || []; }
function getUnreadTankerReportsCount() {
  return (G.tankerReports || []).filter(r => !r.read).length;
}
function markTankerReportAsRead(reportId) {
  const r = (G.tankerReports || []).find(r => r.id === reportId);
  if (r) r.read = true;
}

// ─── Entry point : ouvre l'écran de composition pour une planète donnée ───
function openTankerCompose(planetCoord) {
  // Vérifier qu'au moins 1 tanker dispo
  const stat = G.fleet?.stationed?.tanker || {};
  const totalTankers = (stat.t1 || 0) + (stat.t2 || 0) + (stat.t3 || 0);
  const inMission = (G.tankerMissions || []).filter(m => m.status === 'in_transit' || m.status === 'returning').length;
  const inRelay   = (G.tankerMissions || []).filter(m => m.status === 'orbital_relay').length;
  const available = tankerAvailability(null);
  const _envoys = window.SBBlackmarket ? SBBlackmarket.envoyChoices() : [];   // PATCH_0211_AMBASSADEUR

  if (available <= 0 && !_envoys.length) {
    if (typeof toast === 'function') toast('Aucun tanker disponible');
    return;
  }

  // Résoudre la planète depuis G.knownSystems
  const planet = findPlanetByCoord(planetCoord);
  if (!planet) {
    if (typeof toast === 'function') toast('Planète introuvable');
    return;
  }
  // PATCH_0211_AMBASSADEUR — phase 1 : l'ambassadeur ne va que chez un vrai commandant
  if (available <= 0 && !planet.isReal) {
    if (typeof toast === 'function') toast('Aucun tanker disponible');
    return;
  }

  const planetType = resolvePlanetType(planet.type)?.key || 'type1';

  // Trouver le premier tier de tanker dispo (préfère T1 → T2 → T3)
  let defaultTier = 1;
  for (const t of [1, 2, 3]) {
    if ((stat['t' + t] || 0) > 0) {
      // Vérifier qu'il n'est pas tous en mission/relay pour ce tier
      if (tankerAvailability(t) > 0) {
        defaultTier = t;
        break;
      }
    }
  }

  G.tankerComposing = {
    destination: planetCoord,
    planetType,
    planetName: planet.name || planetCoord,
    planetPlayerName: planet.playerName || null,  // ← Si non-null = planète occupée par joueur
    realPlayer: planet.isReal ? { address: planet.mpAddress || planetCoord, pseudo: planet.playerName } : null,
    tankerSelected: defaultTier,
    envoy: available <= 0 ? _envoys[0] : null,   // PATCH_0211_AMBASSADEUR
    cargo: {
      soldiers: { garde: 0, lourd: 0 },
      resources: { metal: 0, energie: 0, cristal: 0 },
    },
    postArrival: 'orbit_relay',  // default selon décision Adrien (balise)
    routeType: 'beacon',         // default : voie balisée (sûre, taxée)
  };

  goto('tanker-compose');
}

// ─── Rendu principal écran tanker-compose ───
function renderTankerCompose() {
  if (!G.tankerComposing) {
    goto('dashboard');
    return;
  }
  try {
    renderTankerComposeBanner();
    renderTankerComposeTankers();
    renderTankerComposeCargo();
    renderTankerComposeIntent();
    renderTankerComposeRoute();
    renderTankerComposeRecap();
    updateTankerComposeConfirmBtn();
  } catch (err) {
    console.error('[tanker-compose] erreur de rendu:', err);
    // Affiche l'erreur dans l'écran lui-même pour debug iOS
    const cargo = document.getElementById('tanker-compose-cargo');
    if (cargo) {
      cargo.innerHTML = `<div style="padding:14px;color:var(--red);font-family:'SF Mono',monospace;font-size:11px;background:rgba(176,39,41,.15);border:1px solid rgba(176,39,41,.4);border-radius:6px;margin:0 16px">⚠ Erreur rendu cargo : ${(err && err.message) || err}<br><span style="font-size:9px;opacity:.7">${(err && err.stack) ? err.stack.split('\\n').slice(0,3).join('<br>') : ''}</span></div>`;
    }
    if (typeof toast === 'function') toast('Erreur tanker compose : ' + ((err && err.message) || err));
  }
}

function renderTankerComposeBanner() {
  const banner = document.getElementById('tanker-compose-banner');
  if (!banner) return;
  const c = G.tankerComposing;
  const ptype = PLANET_TYPES[c.planetType];
  const hostility = ptype?.hostility || 0;
  const isDeadly = !ptype?.deployable;
  const hostilityLabel = isDeadly
    ? `<span style="color:var(--red);font-weight:600">MORT IMMÉDIATE</span>`
    : hostility === 0
      ? `<span style="color:var(--green)">Aucune attrition (planque stable)</span>`
      : `<span style="color:#ffa844">Attrition ${(hostility*100).toFixed(1)}%/h</span>`;

  banner.innerHTML = `
    <div style="padding:14px 16px;background:linear-gradient(180deg, rgba(80,55,15,.35), rgba(45,30,8,.55));border:1px solid rgba(255,200,100,.4);border-radius:8px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        ${icon('tanker', {size:24, color:'#ffc864'})}
        <div style="flex:1">
          <div style="font-size:13px;color:#ffc864;font-weight:600;letter-spacing:.04em">Destination</div>
          <div style="font-family:'SF Mono',monospace;font-size:11px;color:var(--text);margin-top:2px">${c.destination}</div>
          ${c.planetName !== c.destination ? `<div style="font-size:10px;color:var(--mut);margin-top:1px">${c.planetName}</div>` : ''}
        </div>
      </div>
      <div style="font-size:11px;color:var(--mut);padding-top:8px;border-top:1px dashed rgba(255,200,100,.2)">
        Type : <span style="color:var(--text)">${ptype?.label || c.planetType}</span><br>
        Conditions : ${hostilityLabel}
      </div>
      ${isDeadly ? `
        <div style="margin-top:8px;padding:8px 10px;background:rgba(176,39,41,.12);border:1px solid rgba(176,39,41,.4);border-radius:4px;font-size:10px;color:#e87a7a;display:flex;align-items:flex-start;gap:6px">
          ${icon('warning', {size:11, color:'#e87a7a', style:'flex-shrink:0;margin-top:1px'})}
          <span>Cale détruite à l'arrivée. Le tanker rentre seul. Décision irrévocable.</span>
        </div>
      ` : ''}
    </div>
  `;
}

function renderTankerComposeTankers() {
  const list = document.getElementById('tanker-compose-tankers');
  if (!list) return;
  const c = G.tankerComposing;
  const stat = G.fleet?.stationed?.tanker || {};

  // Pour chaque tier, compter dispos (stationné - mission - relay)
  const tiers = [1, 2, 3];
  let html = '<div style="padding:0 16px">';
  let anyTier = false;
  for (const t of tiers) {
    const total = stat['t' + t] || 0;
    if (total === 0) continue;
    const available = tankerAvailability(t);
    if (available <= 0) continue;
    anyTier = true;

    const tierData = SHIP_TIERS.tanker[t];
    const cargoMax = tierData?.cargo || 0;
    const isSelected = !c.envoy && c.tankerSelected === t;

    html += `
      <div onclick="selectComposeTanker(${t})" style="margin-bottom:8px;padding:10px 12px;background:${isSelected ? 'rgba(255,200,100,.10)' : 'rgba(40,40,40,.3)'};border:1px solid ${isSelected ? '#ffc864' : 'var(--border)'};border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:10px">
        ${icon('tanker', {size:18, color: isSelected ? '#ffc864' : 'var(--mut)'})}
        <div style="flex:1">
          <div style="font-size:12px;color:${isSelected ? '#ffc864' : 'var(--text)'};font-weight:${isSelected ? '600' : '400'}">Tanker T${t}</div>
          <div style="font-size:10px;color:var(--mut);margin-top:2px">Cargo : ${fmt(cargoMax)} · ${available}/${total} dispo</div>
        </div>
        ${isSelected ? `<div style="color:#ffc864">${icon('check', {size:14})}</div>` : ''}
      </div>
    `;
  }
  if (!anyTier) {
    html += '<div style="padding:10px;color:var(--mut);font-style:italic;text-align:center;font-size:11px">Aucun tanker disponible</div>';
  }
  // PATCH_0211_AMBASSADEUR — sous les tankers, les vaisseaux d'exception libres (vers un vrai commandant, phase 1)
  if (c.realPlayer && window.SBBlackmarket) {
    html += SBBlackmarket.envoyRows(c.envoy && c.envoy.pid, 'selectComposeEnvoy', { needCargo: !!c.trade });
  }
  html += '</div>';
  list.innerHTML = html;
}
// PATCH_0211_AMBASSADEUR — la capacité de la cale, qu'on envoie un tanker ou un vaisseau d'exception
function _composeCargoMax(c) { return c && c.envoy ? (c.envoy.cargo || 0) : ((SHIP_TIERS.tanker[c && c.tankerSelected] || {}).cargo || 0); }
function selectComposeEnvoy(pid) {
  const c = G.tankerComposing; if (!c || !window.SBBlackmarket) return;
  const e = SBBlackmarket.envoyChoices().find(x => x.pid === pid); if (!e) return;
  c.envoy = e;
  c.cargo.soldiers = { garde: 0, lourd: 0 };
  if (computeComposeCargoUsed() > (e.cargo || 0)) {
    c.cargo.resources = { metal: 0, energie: 0, cristal: 0 };
    if (e.cargo && typeof toast === 'function') toast('Cale réinitialisée (capacité réduite)');
  }
  renderTankerCompose();
}

function selectComposeTanker(tier) {
  if (!G.tankerComposing) return;
  G.tankerComposing.envoy = null;   // PATCH_0211_AMBASSADEUR
  G.tankerComposing.tankerSelected = tier;
  // Si la cale dépasse la nouvelle capacité, la réduit proportionnellement
  const cargoMax = SHIP_TIERS.tanker[tier]?.cargo || 0;
  const used = computeComposeCargoUsed();
  if (used > cargoMax) {
    // Reset cargo entièrement (plus simple que prorata)
    G.tankerComposing.cargo = {
      soldiers: { garde: 0, lourd: 0 },
      resources: { metal: 0, energie: 0, cristal: 0 },
    };
    if (typeof toast === 'function') toast('Cale réinitialisée (capacité réduite)');
  }
  renderTankerCompose();
}

// ─── Cale (soldats + ressources avec steppers) ───
function renderTankerComposeCargo() {
  const list = document.getElementById('tanker-compose-cargo');
  if (!list) return;
  const c = G.tankerComposing;
  const cargoMax = _composeCargoMax(c);   // PATCH_0211_AMBASSADEUR
  if (c.envoy && !cargoMax) {
    list.innerHTML = `<div style="padding:0 16px"><div style="padding:12px 14px;border:1px dashed rgba(201,164,90,.4);border-radius:8px;font-size:12px;line-height:1.5;color:var(--mut)"><span style="color:#c9a45a">${c.envoy.name}</span> n'a pas de cale. Il ne vient rien livrer : il vient pour être vu.</div></div>`;
    return;
  }
  const used = computeComposeCargoUsed();
  const usedPct = cargoMax > 0 ? (used / cargoMax) * 100 : 0;

  // Décision 16/05 : aucun soldat dans un tanker vers une planète occupée par joueur.
  // Les soldats vers planète habitable libre = dépôt logistique normal.
  // Les soldats vers planète joueur = uniquement via flotte d'attaque composée
  // dans l'écran Flotte. Aucun joueur n'est un ennemi par défaut.
  const isPlayerPlanet = !!c.planetPlayerName;

  let html = `
    <div style="padding:0 16px;margin-bottom:12px">
      <div class="cargo-occupancy-label">
        <span>Cale occupée</span>
        <span style="color:${used > 0 ? '#ffc864' : 'var(--mut)'};font-weight:700">${fmt(used)} / ${fmt(cargoMax)}</span>
      </div>
      <div class="cargo-occupancy-bar">
        <div class="cargo-occupancy-fill" style="width:${usedPct}%;background:#ffc864"></div>
      </div>
    </div>
    <div style="padding:0 16px">
  `;

  // ─── Section Soldats ───
  // Si destination = planète joueur, on remplace la section par un message clair
  // expliquant que les soldats ne peuvent pas transiter via tanker dans ce cas.
  if (isPlayerPlanet) {
    html += `
      <div style="font-size:9px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">Soldats</div>
      <div style="padding:12px 14px;background:rgba(40,40,40,.3);border:1px solid var(--border);border-radius:6px;margin-bottom:6px">
        <div style="font-size:11px;color:var(--text);line-height:1.5">
          <span style="color:#ffc864">Transit civil uniquement.</span>
          <span style="color:var(--mut)"> La cale d'un tanker ne peut pas embarquer de soldats vers une planète occupée — ${_escapeHtml(c.planetPlayerName)} verrait passer un convoi militaire et le traiterait comme tel.</span>
        </div>
        <div style="font-size:10px;color:var(--mut);margin-top:8px;font-style:italic;line-height:1.4">
          Pour une action offensive, compose une flotte d'attaque depuis l'écran Flotte.
        </div>
        ${c.realPlayer ? `<div style="font-size:11px;color:#5fffe8;margin-top:8px;line-height:1.5">Commandant réel : ton tanker ouvre une <strong>ambassade orbitale</strong>. Sa cale lui est <strong>offerte</strong> : il l'accepte ou la refuse (refusée, elle rentre avec le tanker). Depuis sa fiche : pavillons et pacte de non-agression.</div>` : ''}
      </div>
    `;
  } else {
    // Soldats — affiche TOUJOURS la section avec lignes, même si available=0 (greyed)
    const soldierLabel = `<div style="font-size:9px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">Soldats</div>`;
    html += soldierLabel;
    let anySoldierRow = false;
    for (const sk of ['garde', 'lourd']) {
    const unit = DEFENSE_UNITS[sk];
    if (!unit || !unit.transportable) continue;
    anySoldierRow = true;
    const totalOwned = G.defense?.units?.[sk]?.qty || 0;

    // Soldats déjà engagés ailleurs (autres flottes + autres missions tanker)
    const engagedInFleets = (G.fleet?.prepared || []).reduce((acc, prep) => acc + (prep.soldiers?.[sk] || 0), 0);
    const engagedInTankerMissions = (G.tankerMissions || []).reduce((acc, m) => {
      if (m.status !== 'in_transit' && m.status !== 'orbital_relay' && m.status !== 'returning') return acc;
      return acc + (m.cargo?.soldiers?.[sk] || 0);
    }, 0);
    const engagedInGarrisons = (G.garrisons || []).reduce((acc, g) =>
      acc + (g.soldiers?.[sk] || 0), 0);

    const available = Math.max(0, totalOwned - engagedInFleets - engagedInTankerMissions - engagedInGarrisons);
    const selected = c.cargo.soldiers[sk] || 0;
    const weight = unit.soldierWeight;
    const cargoFree = cargoMax - used;
    const maxAddByCargo = Math.floor(cargoFree / weight);
    const maxAddable = Math.min(available - selected, maxAddByCargo);
    const canAdd = maxAddable > 0;
    const canRemove = selected > 0;

    // Info ligne diagnostic si non disponible
    const engagedTotal = engagedInFleets + engagedInTankerMissions + engagedInGarrisons;
    let counterLine;
    if (totalOwned === 0) {
      counterLine = `<span style="color:var(--mut);font-style:italic">aucun · construire dans Défense</span>`;
    } else if (available === 0 && engagedTotal > 0) {
      const reasons = [];
      if (engagedInFleets > 0) reasons.push(`${engagedInFleets} flotte`);
      if (engagedInTankerMissions > 0) reasons.push(`${engagedInTankerMissions} tanker`);
      if (engagedInGarrisons > 0) reasons.push(`${engagedInGarrisons} garnison`);
      counterLine = `<span style="color:var(--mut);font-style:italic">tous engagés (${reasons.join(', ')})</span>`;
    } else {
      counterLine = `<span class="selected">${selected}</span> embarqués · ${available} dispo · <span style="color:#ffc864">${fmt(weight)} fret/u</span>`;
    }

    html += `
      <div class="fleet-compose-row">
        <div class="fleet-compose-icon" style="color:${unit.color}">${PNG_ILLUSTRATIONS[sk] ? `<img src="${PNG_ILLUSTRATIONS[sk]}" alt="${unit.name}" onerror="pngFallback(this, '${sk}')">` : renderIcon(unit.icon, {size:22, color:unit.color})}</div>
        <div class="fleet-compose-info">
          <div class="fleet-compose-name">${unit.name}</div>
          <div class="fleet-compose-counter">${counterLine}</div>
        </div>
        <div class="fleet-compose-buttons">
          <button class="fleet-compose-btn minus ${canRemove ? '' : 'disabled'}" onclick="adjustComposeCargoSoldier('${sk}', -1)">−</button>
          <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeCargoSoldier('${sk}', 10)">+10</button>
          <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeCargoSoldier('${sk}', 'max')">MAX</button>
        </div>
      </div>
    `;
  }
  if (!anySoldierRow) {
    html += `<div style="padding:8px 0;color:var(--mut);font-style:italic;font-size:11px">Aucun type de soldat embarquable disponible</div>`;
  }
  }  // ← fin du else (isPlayerPlanet)

  // Ressources (toujours visibles, même à 0 stock)
  html += `<div style="font-size:9px;color:var(--mut);letter-spacing:.14em;text-transform:uppercase;margin-top:14px;margin-bottom:6px">Ressources</div>`;
  for (const rk of ['metal', 'energie', 'cristal']) {
    const r = G.res?.[rk];
    if (!r) continue;
    const owned = Math.floor(r.v || 0);
    const selected = c.cargo.resources[rk] || 0;
    // Ressources : 1 unité = 1 fret (simple)
    const cargoFree = cargoMax - used;
    const maxAddable = Math.min(owned - selected, cargoFree);
    const canAdd = maxAddable > 0;
    const canRemove = selected > 0;
    const info = tileInfo(rk);
    const color = info?.color || 'var(--text)';
    // Chunk polish 15/05 : PNGs ressources (style match-3 tile) inlinés en base64
    const pngKey = 'res_' + rk;
    const resIcon = PNG_ILLUSTRATIONS[pngKey]
      ? `<img src="${PNG_ILLUSTRATIONS[pngKey]}" alt="${info?.label || rk}" style="width:22px;height:22px;display:block">`
      : icon(rk === 'metal' ? 'pickaxe' : rk === 'energie' ? 'zap' : 'gem', {size:22, color});

    // Counter line défensive
    let counterLine;
    if (owned === 0) {
      counterLine = `<span style="color:var(--mut);font-style:italic">stock vide</span>`;
    } else {
      counterLine = `<span class="selected">${fmt(selected)}</span> embarqués · ${fmt(owned)} en stock`;
    }

    html += `
      <div class="fleet-compose-row">
        <div class="fleet-compose-icon" style="color:${color}">${resIcon}</div>
        <div class="fleet-compose-info">
          <div class="fleet-compose-name">${info?.label || rk}</div>
          <div class="fleet-compose-counter">${counterLine}</div>
        </div>
        <div class="fleet-compose-buttons">
          <button class="fleet-compose-btn minus ${canRemove ? '' : 'disabled'}" onclick="adjustComposeCargoResource('${rk}', -100)">−</button>
          <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeCargoResource('${rk}', 100)">+100</button>
          <button class="fleet-compose-btn ${canAdd ? '' : 'disabled'}" onclick="adjustComposeCargoResource('${rk}', 'max')">MAX</button>
        </div>
      </div>
    `;
  }
  html += '</div>';
  list.innerHTML = html;
}

// Calcule l'occupation de la cale composée
function computeComposeCargoUsed() {
  const c = G.tankerComposing;
  if (!c) return 0;
  let used = 0;
  for (const sk of ['garde', 'lourd']) {
    const w = DEFENSE_UNITS[sk]?.soldierWeight || 0;
    used += (c.cargo.soldiers[sk] || 0) * w;
  }
  for (const rk of ['metal', 'energie', 'cristal']) {
    used += (c.cargo.resources[rk] || 0);  // 1 fret/u
  }
  return used;
}

// Steppers cale
function adjustComposeCargoSoldier(sk, delta) {
  const c = G.tankerComposing;
  if (!c) return;
  const unit = DEFENSE_UNITS[sk];
  if (!unit) return;
  const cargoMax = _composeCargoMax(c);
  const used = computeComposeCargoUsed();
  const weight = unit.soldierWeight;
  const cargoFree = cargoMax - used;
  const maxAddByCargo = Math.floor(cargoFree / weight);

  const totalOwned = G.defense?.units?.[sk]?.qty || 0;
  const engagedInFleets = (G.fleet?.prepared || []).reduce((acc, prep) => acc + (prep.soldiers?.[sk] || 0), 0);
  const engagedInTankerMissions = (G.tankerMissions || []).reduce((acc, m) => {
    if (m.status !== 'in_transit' && m.status !== 'orbital_relay' && m.status !== 'returning') return acc;
    return acc + (m.cargo?.soldiers?.[sk] || 0);
  }, 0);
  const engagedInGarrisons = (G.garrisons || []).reduce((acc, g) =>
    acc + (g.soldiers?.[sk] || 0), 0);
  const maxAllowed = totalOwned - engagedInFleets - engagedInTankerMissions - engagedInGarrisons;

  const current = c.cargo.soldiers[sk];
  let next;
  if (delta === 'max') {
    next = Math.min(maxAllowed, current + maxAddByCargo);
  } else {
    next = Math.max(0, Math.min(maxAllowed, current + delta));
    // Si on ajoute, vérifier qu'on ne dépasse pas la cale
    if (delta > 0) {
      const additionalNeeded = (next - current) * weight;
      if (additionalNeeded > cargoFree) {
        next = current + maxAddByCargo;
      }
    }
  }
  c.cargo.soldiers[sk] = Math.max(0, next);
  renderTankerCompose();
}

function adjustComposeCargoResource(rk, delta) {
  const c = G.tankerComposing;
  if (!c) return;
  const r = G.res?.[rk];
  if (!r) return;
  const cargoMax = _composeCargoMax(c);
  const used = computeComposeCargoUsed();
  const cargoFree = cargoMax - used;
  const owned = Math.floor(r.v);
  const current = c.cargo.resources[rk];

  let next;
  if (delta === 'max') {
    next = Math.min(owned, current + cargoFree);
  } else {
    next = Math.max(0, Math.min(owned, current + delta));
    if (delta > 0) {
      const additionalNeeded = next - current;
      if (additionalNeeded > cargoFree) {
        next = current + cargoFree;
      }
    }
  }
  c.cargo.resources[rk] = Math.max(0, next);
  renderTankerCompose();
}

// ─── Intent à l'arrivée (radio buttons) ───
function renderTankerComposeIntent() {
  const list = document.getElementById('tanker-compose-intent');
  if (!list) return;
  const c = G.tankerComposing;
  const used = computeComposeCargoUsed();
  const isEmpty = used === 0;
  // PATCH_2110_COMMERCE — livraison commerciale : payée à l'arrivée, le tanker rentre avec les CG
  if (c.trade) {
    c.postArrival = 'orbit_relay';
    const _px = mpTradePrice(c.cargo.resources);
    list.innerHTML = `
    <div style="padding:0 16px">
      <div style="padding:10px 12px;background:rgba(255,200,100,.07);border:1px solid rgba(255,200,100,.5);border-radius:6px">
        <div style="font-size:12px;color:#ffc864;font-weight:600">Livraison commerciale à ${_escapeHtml(c.trade.pseudo)}</div>
        <div style="font-size:10px;color:var(--mut);margin-top:4px;line-height:1.5">Prix : métal 2,5 · énergie 3,5 · cristal 8,5 CG (milieu du marché). Cette cale vaut <span style="color:#ffc864">${fmt(_px)} CG</span>.<br>Il achète ce que ses CG, son plafond et ses silos permettent ; le tanker rentre avec les CG et le reste. Sans réponse en 12 h, il rentre avec toute la cale.</div>
      </div>
    </div>`;
    return;
  }
  // AMBASSADES_1210 — vers un vrai commandant : toujours une ambassade (le tanker attend sa réponse en orbite)
  if (c.realPlayer) {
    c.postArrival = 'orbit_relay';
    list.innerHTML = `
    <div style="padding:0 16px">
      <div style="padding:10px 12px;background:rgba(95,255,232,.06);border:1px solid rgba(95,255,232,.45);border-radius:6px">
        <div style="display:flex;align-items:center;gap:10px">
          ${icon('satellite', {size:18, color:'#5fffe8'})}
          <div style="flex:1">
            <div style="font-size:12px;color:#5fffe8;font-weight:600">Ambassade orbitale</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">${isEmpty ? 'Présence et canal ouverts : pavillons, pacte de non-agression.' : 'Cale offerte à ' + _escapeHtml(c.realPlayer.pseudo || '') + '. Le tanker reste en orbite : canal ouvert, pacte possible.'}</div>
          </div>
          <div style="color:#5fffe8">${icon('check', {size:14})}</div>
        </div>
      </div>
    </div>`;
    return;
  }
  // Si cale vide, le mode "Déposer et rentrer" n'a aucun sens (rien à déposer)
  // — on désactive visuellement le second bouton et on force orbit_relay.
  list.innerHTML = `
    <div style="padding:0 16px">
      <div onclick="setComposeIntent('orbit_relay')" style="margin-bottom:8px;padding:10px 12px;background:${c.postArrival === 'orbit_relay' ? 'rgba(255,200,100,.10)' : 'rgba(40,40,40,.3)'};border:1px solid ${c.postArrival === 'orbit_relay' ? '#ffc864' : 'var(--border)'};border-radius:6px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px">
          ${icon('satellite', {size:18, color: c.postArrival === 'orbit_relay' ? '#ffc864' : 'var(--mut)'})}
          <div style="flex:1">
            <div style="font-size:12px;color:${c.postArrival === 'orbit_relay' ? '#ffc864' : 'var(--text)'};font-weight:${c.postArrival === 'orbit_relay' ? '600' : '400'}">Rester en orbite (balise)</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">${isEmpty ? 'Tanker vide. Observation, alertes futures, canal de contact.' : 'Maintient le contact. Tanker indisponible pour autres missions.'}</div>
          </div>
          ${c.postArrival === 'orbit_relay' ? `<div style="color:#ffc864">${icon('check', {size:14})}</div>` : ''}
        </div>
      </div>
      <div ${isEmpty ? '' : `onclick="setComposeIntent('return')"`} style="padding:10px 12px;background:${isEmpty ? 'rgba(40,40,40,.15)' : (c.postArrival === 'return' ? 'rgba(255,200,100,.10)' : 'rgba(40,40,40,.3)')};border:1px solid ${isEmpty ? 'var(--border)' : (c.postArrival === 'return' ? '#ffc864' : 'var(--border)')};border-radius:6px;${isEmpty ? 'opacity:.4;cursor:not-allowed' : 'cursor:pointer'}">
        <div style="display:flex;align-items:center;gap:10px">
          ${icon('cornerReturn', {size:18, color: 'var(--mut)'})}
          <div style="flex:1">
            <div style="font-size:12px;color:${isEmpty ? 'var(--mut)' : (c.postArrival === 'return' ? '#ffc864' : 'var(--text)')};font-weight:${c.postArrival === 'return' && !isEmpty ? '600' : '400'}">Déposer et rentrer</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">${isEmpty ? 'Indisponible — la cale est vide, il n\'y a rien à déposer.' : 'Cargo livré, tanker libre. Contact perdu avec la cale.'}</div>
          </div>
          ${(c.postArrival === 'return' && !isEmpty) ? `<div style="color:#ffc864">${icon('check', {size:14})}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function setComposeIntent(intent) {
  if (!G.tankerComposing) return;
  if (G.tankerComposing.realPlayer && intent !== 'orbit_relay') return;   // AMBASSADES_1210
  // Bloquer le mode 'return' si la cale est vide (rien à déposer)
  if (intent === 'return' && computeComposeCargoUsed() === 0) {
    if (typeof toast === 'function') toast('Cale vide — orbite-balise uniquement');
    return;
  }
  G.tankerComposing.postArrival = intent;
  renderTankerCompose();
}

// ─── Trajet (Routes Duales) — voie balisée vs voie directe ───
// Philosophie : choix factuel et neutre. Pas d'étiquette morale.
// L'identité brigandière émerge des rapports, pas des boutons.
function renderTankerComposeRoute() {
  const list = document.getElementById('tanker-compose-route');
  if (!list) return;
  const c = G.tankerComposing;
  const current = c.routeType || 'beacon';

  // Calcul des durées affichées (estimation visuelle, basée sur durée nominale de 5 min ; vrai trajet vers un commandant)
  const baseDurationMs = (c.realPlayer && typeof mpRaidTravelMs === 'function') ? mpRaidTravelMs({ mpAddress: c.realPlayer.address }) : 5 * 60 * 1000;
  const beaconDuration = baseDurationMs * ROUTE_TYPES.beacon.durationFactor;
  const directDuration = baseDurationMs * ROUTE_TYPES.direct.durationFactor;

  const card = (routeKey, labelMain, labelDetail, accent, durationMs, taxLabel, riskLabel, riskColor) => {
    const isSelected = current === routeKey;
    const bg = isSelected ? `rgba(${routeKey === 'beacon' ? '95,152,255' : '196,118,42'},.10)` : 'rgba(40,40,40,.3)';
    const borderColor = isSelected ? accent : 'var(--border)';
    const textColor = isSelected ? accent : 'var(--text)';
    return `
      <div onclick="setComposeRoute('${routeKey}')" style="margin-bottom:8px;padding:10px 12px;background:${bg};border:1px solid ${borderColor};border-radius:6px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-size:12px;color:${textColor};font-weight:${isSelected ? '600' : '400'}">${labelMain}</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">${labelDetail}</div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;font-family:var(--font-mono)">
              <span style="color:${isSelected ? accent : 'var(--mut)'}">⏱ ${formatTankerDuration(durationMs)}</span>
              <span style="margin:0 6px;opacity:.4">·</span>
              <span>${taxLabel}</span>
              <span style="margin:0 6px;opacity:.4">·</span>
              <span style="color:${riskColor}">${riskLabel}</span>
            </div>
          </div>
          ${isSelected ? `<div style="color:${accent}">${icon('check', {size:14})}</div>` : ''}
        </div>
      </div>
    `;
  };

  const ownCards = _ownRoutesCardsHtml(c, baseDurationMs);   // PATCH_1310_ROUTES2
  list.innerHTML = `
    <div style="padding:0 16px">
      ${ownCards}
      ${card(
        'beacon',
        'Voie balisée',
        'Couloir surveillé, prédictible. Sécurité élevée.',
        'var(--blue)',
        beaconDuration,
        'taxe 12%',
        'aucun incident',
        'var(--mut)'
      )}
      ${card(
        'direct',
        'Voie directe',
        'Trajet libre, imprévisible. Plus rapide.',
        '#c4762a',
        directDuration,
        'pas de taxe',
        '18% d\'incident',
        '#c4762a'
      )}
    </div>
  `;
}

function setComposeRoute(routeKey, ownRouteId) {
  if (!G.tankerComposing) return;
  if (!ROUTE_TYPES[routeKey]) return;
  G.tankerComposing.routeType = routeKey;
  G.tankerComposing.ownRouteId = routeKey === 'own' ? ownRouteId : null;
  renderTankerCompose();
}
// PATCH_1310_ROUTES2 — trajets possibles vers la destination du tanker (calculés sur la carte)
function _composePlan(c) {
  const sys = String((c && c.destination) || '').split('/')[0].split('-').slice(0, 3).join('-');
  if (!/^[A-Z]-[A-Z]-\d{4}$/.test(sys) || !window.SBMap || typeof SBMap.planFor !== 'function') return null;
  return SBMap.planFor(sys);
}
function _composeOwnRoute(c, plan) {
  if (!c || c.routeType !== 'own') return null;
  return ((plan || _composePlan(c) || {}).routes || []).find(r => r.id === c.ownRouteId) || null;
}
function _ownRouteRatio(plan, r) {
  return Math.max(1, Math.min(3, r.len / Math.max(1, plan.direct.len)));
}
function _ownRoutesCardsHtml(c, baseDurationMs) {
  const plan = _composePlan(c);
  if (!plan || !plan.routes.length) return '';
  if (G._composeRoutePref) {   // venu de la carte : « Envoyer un tanker » sur une route
    if (plan.routes.some(r => r.id === G._composeRoutePref)) { c.routeType = 'own'; c.ownRouteId = G._composeRoutePref; }
    G._composeRoutePref = null;
  }
  return plan.routes.slice(0, 3).map(r => {
    const sel = c.routeType === 'own' && c.ownRouteId === r.id;
    const ms = baseDurationMs * ROUTE_TYPES.own.durationFactor * _ownRouteRatio(plan, r);
    const open = r.openLen > 0 ? `${r.openLen} case${r.openLen > 1 ? 's' : ''} à découvert jusqu'au départ de la route (${r.startKey})` : 'départ de ton système';
    return `
      <div onclick="setComposeRoute('own','${r.id}')" style="margin-bottom:8px;padding:10px 12px;background:${sel ? 'rgba(195,155,255,.10)' : 'rgba(40,40,40,.3)'};border:1px solid ${sel ? r.color : 'var(--border)'};border-radius:6px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:4px;align-self:stretch;border-radius:2px;background:${r.color}"></div>
          <div style="flex:1">
            <div style="font-size:12px;color:${sel ? r.color : 'var(--text)'};font-weight:${sel ? '600' : '400'}">${_escapeHtml(r.name)}</div>
            <div style="font-size:10px;color:var(--mut);margin-top:2px">Ta route privée : ni taxe ni incident. Seules les balises posées sur le tracé la voient passer.</div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;font-family:var(--font-mono)">
              <span style="color:${sel ? r.color : 'var(--mut)'}">⏱ ${formatTankerDuration(ms)}</span>
              <span style="margin:0 6px;opacity:.4">·</span><span>pas de taxe</span>
              <span style="margin:0 6px;opacity:.4">·</span><span>aucun incident</span>
            </div>
            <div style="font-size:10px;color:var(--mut);margin-top:3px">${r.len} cases · ${open}</div>
          </div>
          ${sel ? `<div style="color:${r.color}">${icon('check', {size:14})}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ─── Récap mission ───
function renderTankerComposeRecap() {
  const recap = document.getElementById('tanker-compose-recap');
  if (!recap) return;
  const c = G.tankerComposing;
  const ptype = PLANET_TYPES[c.planetType];
  const isDeadly = !ptype?.deployable;
  const used = computeComposeCargoUsed();

  const totalSoldiers = c.cargo.soldiers.garde + c.cargo.soldiers.lourd;
  const totalResources = c.cargo.resources.metal + c.cargo.resources.energie + c.cargo.resources.cristal;

  let summary = [];
  if (totalSoldiers > 0) {
    const parts = [];
    if (c.cargo.soldiers.garde) parts.push(`${c.cargo.soldiers.garde} garde`);
    if (c.cargo.soldiers.lourd) parts.push(`${c.cargo.soldiers.lourd} lourd`);
    summary.push(parts.join(', '));
  }
  if (totalResources > 0) {
    const parts = [];
    if (c.cargo.resources.metal) parts.push(`${fmt(c.cargo.resources.metal)} métal`);
    if (c.cargo.resources.energie) parts.push(`${fmt(c.cargo.resources.energie)} énergie`);
    if (c.cargo.resources.cristal) parts.push(`${fmt(c.cargo.resources.cristal)} cristal`);
    summary.push(parts.join(', '));
  }
  const cargoDesc = summary.length === 0
    ? '<span style="color:var(--mut);font-style:italic">cale vide</span>'
    : summary.join(' · ');

  // Durée estimée (réutilise la logique des missions tanker classiques : 5-10 min)
  // Pour le proto on met 5 min fixe
  const baseDurationMs = 5 * 60 * 1000;
  const routeCfg = ROUTE_TYPES[c.routeType || 'beacon'];
  let estimatedDurationMs = baseDurationMs * routeCfg.durationFactor;
  const _plan = c.routeType === 'own' ? _composePlan(c) : null, _own = _composeOwnRoute(c, _plan);   // PATCH_1310_ROUTES2
  if (_own) estimatedDurationMs *= _ownRouteRatio(_plan, _own);
  const intentLabel = c.postArrival === 'orbit_relay'
    ? '<span style="color:#ffc864">Reste en orbite (balise)</span>'
    : '<span style="color:var(--mut)">Dépose et rentre</span>';
  const routeLabel = _own ? `<span style="color:${_own.color}">${_escapeHtml(_own.name)}</span>`
    : c.routeType === 'direct'
    ? '<span style="color:#c4762a">Voie directe</span>'
    : '<span style="color:var(--blue)">Voie balisée</span>';

  recap.innerHTML = `
    <div class="dash-stat-row"><span class="lbl">Cale</span><span class="val">${cargoDesc}</span></div>
    <div class="dash-stat-row"><span class="lbl">Occupation</span><span class="val">${fmt(used)} fret</span></div>
    <div class="dash-stat-row"><span class="lbl">Trajet</span><span class="val">${routeLabel}</span></div>
    <div class="dash-stat-row"><span class="lbl">Intent</span><span class="val">${intentLabel}</span></div>
    <div class="dash-stat-row"><span class="lbl">Durée mission</span><span class="val">~${formatTankerDuration(estimatedDurationMs)}</span></div>
    ${isDeadly ? `
      <div style="margin-top:8px;padding:8px 10px;background:rgba(176,39,41,.10);border:1px solid rgba(176,39,41,.3);border-radius:4px;font-size:10px;color:#e87a7a;display:flex;align-items:flex-start;gap:6px">
        ${icon('warning', {size:11, color:'#e87a7a', style:'flex-shrink:0;margin-top:1px'})}
        <span>La cale sera perdue à l'arrivée (planète mortelle).</span>
      </div>
    ` : ''}
  `;
}

function updateTankerComposeConfirmBtn() {
  const btn = document.getElementById('tanker-compose-confirm-btn');
  if (!btn) return;
  const c = G.tankerComposing;
  const used = computeComposeCargoUsed();
  // Décision 16/05 : un tanker vide peut partir, mais UNIQUEMENT en mode "orbite-balise".
  // Utilité : observer une planète, recevoir des alertes (futur), maintenir un canal
  // de communication avec un autre joueur. Si cale vide, on force postArrival = 'orbit_relay'.
  if ((used === 0 || c.realPlayer) && c.postArrival !== 'orbit_relay') {
    c.postArrival = 'orbit_relay';
  }
  // canLaunch toujours vrai désormais (un tanker peut partir vide en orbite-balise)
  btn.style.opacity = '1';
  btn.style.pointerEvents = 'auto';
  if (c.trade) {
    btn.textContent = used === 0 ? 'Cale vide' : `Livrer à ${c.trade.pseudo} · ${fmt(mpTradePrice(c.cargo.resources))} CG`;
    if (used === 0) { btn.style.opacity = '.4'; btn.style.pointerEvents = 'none'; }
    try { renderTankerComposeIntent(); } catch (e) {}
  } else if (c.realPlayer) {
    btn.textContent = used === 0 ? 'Ouvrir l\'ambassade' : 'Ouvrir l\'ambassade et offrir la cale';
  } else if (used === 0) {
    btn.textContent = 'Lancer en orbite (cale vide)';
  } else {
    btn.textContent = 'Lancer la mission';
  }
}

// ─── Confirmation : lance la mission ───
function confirmTankerComposition() {
  const c = G.tankerComposing;
  if (!c) return;
  const used = computeComposeCargoUsed();
  if (c.trade && used === 0) { toast('Cale vide : rien à livrer'); return; }   // PATCH_2110_COMMERCE
  // Si cale vide, force orbite-balise (sécurité finale au cas où l'UI a glissé)
  if ((used === 0 || c.realPlayer) && c.postArrival !== 'orbit_relay') {
    c.postArrival = 'orbit_relay';
  }
  // AMBASSADES_1210 — jamais de soldats vers un commandant (sécurité finale)
  if (c.realPlayer || c.planetPlayerName) c.cargo.soldiers = { garde: 0, lourd: 0 };

  // Décompter les ressources immédiatement (elles partent)
  for (const rk of ['metal', 'energie', 'cristal']) {
    const qty = c.cargo.resources[rk];
    if (qty > 0 && G.res[rk]) {
      G.res[rk].v = Math.max(0, G.res[rk].v - qty);
    }
  }
  // Les soldats ne sont pas "consommés" — ils sont engagés (compte via getAvailableSoldiers)

  // Générer un nom de tanker
  // PATCH_0211_AMBASSADEUR — un vaisseau d'exception garde son nom, le Héro va 20 % plus vite
  const _envoy = c.envoy && window.SBBlackmarket ? SBBlackmarket.envoyChoices().find(x => x.pid === c.envoy.pid) : null;
  if (c.envoy && !_envoy) { toast('Ce vaisseau n\'est plus disponible'); c.envoy = null; renderTankerCompose(); return; }
  const tankerName = _envoy ? _envoy.name : pickTankerName();
  const now = Date.now();
  // AMBASSADES_1210 — vers un vrai commandant : vrai trajet (même règle que les raids, aller simple)
  const durationMs = ((c.realPlayer && typeof mpRaidTravelMs === 'function') ? mpRaidTravelMs({ mpAddress: c.realPlayer.address }) : 5 * 60 * 1000) * (_envoy ? _envoy.speed : 1);

  // Créer la mission
  const mission = {
    id: 'tm-' + now + '-' + Math.random().toString(36).slice(2, 6),
    tankerName,
    tankerTier: _envoy ? 3 : c.tankerSelected,   // PATCH_0211_AMBASSADEUR : abordé comme un Tanker T3
    bmEnvoy: _envoy ? { pid: _envoy.pid, item: _envoy.item, cat: _envoy.cat, name: _envoy.name, cargo: _envoy.cargo } : undefined,
    departedAt: now,
    arrivalAt: now + durationMs,
    status: 'in_transit',
    kind: 'dropoff',  // ← Nouveau
    targetCoords: c.destination,
    destinationPlanetCoord: c.destination,
    destinationPlanetType: c.planetType,
    destinationPlanetName: c.planetName,
    cargo: JSON.parse(JSON.stringify(c.cargo)),  // copie défensive
    cargoOriginal: JSON.parse(JSON.stringify(c.cargo)),  // ← Copie figée du cargo au départ (avant route factor) — utilisée par le bilan trajet pour afficher les pertes/bonus exacts à l'arrivée
    postArrival: c.postArrival,
    riskLossPct: 0,  // pas de risque sur planète verrouillée
    mpTarget: c.realPlayer ? { address: c.realPlayer.address, pseudo: c.realPlayer.pseudo } : null,   // AMBASSADES_1210
    mpTrade: c.trade ? { address: c.trade.address, pseudo: c.trade.pseudo } : null,   // PATCH_2110_COMMERCE
  };

  // ─── Routes Duales : ajuster durée et tirer rencontre éventuelle ───
  // PATCH_1310_ROUTES2 — ma route : si elle a disparu entre-temps, voie directe
  const _plan = _composePlan(c), _own = _composeOwnRoute(c, _plan);
  if (c.routeType === 'own' && !_own) c.routeType = 'direct';
  applyRouteToMission(mission, c.routeType || 'beacon');
  if (_own) {
    mission.arrivalAt = mission.departedAt + (mission.arrivalAt - mission.departedAt) * _ownRouteRatio(_plan, _own);
    mission.ownRouteId = _own.id;
    mission.ownRouteName = _own.name;
    mission.via = _own.via.slice(0, 24);
  } else if (_plan) {
    mission.via = _plan.direct.via.slice(0, 24);   // ligne droite : les systèmes connus traversés
  }

  if (!Array.isArray(G.tankerMissions)) G.tankerMissions = [];
  G.tankerMissions.push(sbTagWorld(mission));
  if (mission.mpTarget) mpConvoyRegister(mission, 'out');   // PIRATERIE_1210

  // Démarrer le ticker
  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();

  G.tankerComposing = null;

  if (typeof toast === 'function') toast(`${tankerName} en route vers ${c.destination}`);

  // Retour à la fiche planète d'origine via la nav stack (pas push doublon)
  if (typeof goBack === 'function') {
    goBack();
  } else {
    goto('planet-detail');
  }
  // PATCH_2110_COMMERCE_FICHE — lancé depuis l'offre de signature (aucune fiche ouverte) : pas de « Planète introuvable » ni de renvoi vers l'univers
  if (typeof renderPlanetDetailScreen === 'function' && findPlanetByCoord(G.selectedPlanetCoord)) renderPlanetDetailScreen();
}

// Génère un nom court de tanker (Σ-XX)
function pickTankerName() {
  // Évite collisions avec missions existantes
  const existing = new Set((G.tankerMissions || []).map(m => m.tankerName));
  for (let attempt = 0; attempt < 100; attempt++) {
    const n = Math.floor(Math.random() * 999) + 1;
    const name = `Σ-${n}`;
    if (!existing.has(name)) return name;
  }
  return 'Σ-' + Date.now().toString().slice(-3);
}

// ═════════════════════════════════════════════════════════════════════
// HANDLER : Arrivée d'une mission DROPOFF
// ═════════════════════════════════════════════════════════════════════
// Appelée depuis handleTankerReturn quand mission.kind === 'dropoff'.
// Si planète mortelle : cargo détruit, tanker rentre avec narration tragique.
// Sinon : crée G.garrisons entry. Si orbit_relay → tanker reste. Sinon il rentre.
function handleTankerDropoffArrival(mission) {
  if (mission.mpTrade) { mpTradeArrival(mission); return; }   // PATCH_2110_COMMERCE — livraison commerciale
  if (mission.mpTarget) { mpOrbitArrival(mission); return; }   // AMBASSADES_1210 — chez un vrai commandant
  const ptype = PLANET_TYPES[mission.destinationPlanetType];
  const isDeadly = !ptype?.deployable;

  if (isDeadly) {
    // Chunk polish 15/05 : tanker rentre avec un timer (pas instant). Cargo perdu.
    const now = Date.now();
    const returnMs = mission.arrivalAt - mission.departedAt;  // même durée que l'aller
    mission.status = 'returning';
    mission.cancelledAt = now;
    mission.returnArrivalAt = now + returnMs;
    loseSoldiers('garde', mission.cargo?.soldiers?.garde || 0);
    loseSoldiers('lourd', mission.cargo?.soldiers?.lourd || 0);
    mission.cargo = { soldiers: { garde: 0, lourd: 0 }, resources: { metal: 0, energie: 0, cristal: 0 } };  // cargo détruit
    storeTankerDropoffReport(mission, 'deadly');
    if (typeof toast === 'function') toast(`${mission.tankerName} : cargo perdu · retour dans ~${Math.ceil(returnMs/60000)}min`);
    if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
    return;
  }

  // ─── Routes Duales : appliquer le facteur de loot (taxe voie balisée ou
  // bonus/malus de rencontre voie directe) sur ce qui est réellement déposé.
  // Cf. ROUTE_TYPES + ENCOUNTER_TABLE.
  const routeFactor = mission._routeApplied ? 1.0 : (typeof computeRouteLootFactor === 'function' ? computeRouteLootFactor(mission) : 1.0);
  mission._routeApplied = true;   // PATCH_2010_CALE_ORBITE : le facteur de route ne s'applique qu'une fois
  if (routeFactor !== 1.0) {
    // Appliquer aux ressources (arrondi inférieur, mini 0)
    for (const rk of ['metal', 'energie', 'cristal']) {
      const original = mission.cargo.resources[rk] || 0;
      mission.cargo.resources[rk] = Math.max(0, Math.floor(original * routeFactor));
    }
    // Appliquer aux soldats (arrondi inférieur — soldats partiellement perdus si incident)
    // Note : on n'applique le malus aux soldats que si factor < 1.0 (sinon pas de "bonus" surnaturel sur les humains)
    if (routeFactor < 1.0) {
      for (const sk of ['garde', 'lourd']) {
        const original = mission.cargo.soldiers[sk] || 0;
        mission.cargo.soldiers[sk] = Math.max(0, Math.floor(original * routeFactor));
        loseSoldiers(sk, original - mission.cargo.soldiers[sk]);
      }
    }
  }

  // PATCH_2010_CALE_ORBITE (Adrien 20/10) : « j'aurais aimé avoir le tanker en orbite avec les soldats en cale
  // et une option : déposer la cargaison ». À l'arrivée, le tanker se met en orbite, cale pleine ; le dépôt est un choix.
  if (!mission._depositNow) {
    const _c = mission.cargo || {}, _tot = (_c.soldiers?.garde || 0) + (_c.soldiers?.lourd || 0) + (_c.resources?.metal || 0) + (_c.resources?.energie || 0) + (_c.resources?.cristal || 0);
    if (_tot > 0) {
      mission.status = 'orbital_relay';
      mission.holdCargo = true;
      mission.holdSince = Date.now();
      if (typeof toast === 'function') toast(`${mission.tankerName} en orbite au-dessus de ${mission.destinationPlanetName || mission.destinationPlanetCoord} · cale pleine : ouvre la fiche de la planète pour déposer la cargaison`);
      if (typeof saveGame === 'function') saveGame();
      if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
      return;
    }
  }

  // ─── Garnison : fusionner ou créer (feedback V3 16/05 — bug doublons) ───
  // À l'arrivée d'un tanker :
  //   1. S'il existe déjà une garnison sur cette planète, on FUSIONNE le cargo dedans
  //      (additionne soldats + ressources, met à jour le contact si tanker en orbite).
  //   2. Sinon on crée une nouvelle garnison (comportement initial).
  // Cas particulier veille pure (cale vide + orbit_relay) :
  //   - Si garnison existante isolée → on la reconnecte à ce nouveau tanker
  //   - Si pas de garnison → pas de garnison créée (veille pure pure)
  const now = Date.now();
  const totalCargo = (mission.cargo.soldiers.garde || 0) + (mission.cargo.soldiers.lourd || 0)
    + (mission.cargo.resources.metal || 0) + (mission.cargo.resources.energie || 0) + (mission.cargo.resources.cristal || 0);
  const isEmptyVigil = totalCargo === 0 && mission.postArrival === 'orbit_relay';

  if (!Array.isArray(G.garrisons)) G.garrisons = [];
  let garrison = G.garrisons.find(g => g.planetCoord === mission.destinationPlanetCoord && (g.world || 'home') === (mission.world || 'home'));   // PATCH_2010_AUDIT — une garnison par planète d'origine

  if (garrison) {
    // ─── FUSION dans garnison existante ───
    if (!isEmptyVigil) {
      // Ajouter le cargo apporté
      garrison.soldiers.garde = (garrison.soldiers.garde || 0) + (mission.cargo.soldiers.garde || 0);
      garrison.soldiers.lourd = (garrison.soldiers.lourd || 0) + (mission.cargo.soldiers.lourd || 0);
      garrison.resources.metal = (garrison.resources.metal || 0) + (mission.cargo.resources.metal || 0);
      garrison.resources.energie = (garrison.resources.energie || 0) + (mission.cargo.resources.energie || 0);
      garrison.resources.cristal = (garrison.resources.cristal || 0) + (mission.cargo.resources.cristal || 0);
      // Mettre à jour les snapshots "at deposit" pour refléter le total cumulé
      // (sinon les calculs d'attrition seraient faux)
      garrison.soldiersAtDeposit.garde = (garrison.soldiersAtDeposit.garde || 0) + (mission.cargo.soldiers.garde || 0);
      garrison.soldiersAtDeposit.lourd = (garrison.soldiersAtDeposit.lourd || 0) + (mission.cargo.soldiers.lourd || 0);
      garrison.resourcesAtDeposit.metal = (garrison.resourcesAtDeposit.metal || 0) + (mission.cargo.resources.metal || 0);
      garrison.resourcesAtDeposit.energie = (garrison.resourcesAtDeposit.energie || 0) + (mission.cargo.resources.energie || 0);
      garrison.resourcesAtDeposit.cristal = (garrison.resourcesAtDeposit.cristal || 0) + (mission.cargo.resources.cristal || 0);
      // Last known sync
      garrison.lastKnownSoldiers = JSON.parse(JSON.stringify(garrison.soldiers));
      garrison.lastKnownResources = JSON.parse(JSON.stringify(garrison.resources));
      garrison.lastKnownTimestamp = now;
    }
    // Si tanker arrive en orbital_relay : il devient le contact (ou prend le relais si garnison isolée)
    if (mission.postArrival === 'orbit_relay') {
      garrison.contactStatus = 'connected';
      garrison.contactingTankerName = mission.tankerName;
      garrison.contactingMissionId = mission.id;
    }
  } else if (!isEmptyVigil) {
    // ─── Création nouvelle garnison ───
    garrison = {
      id: 'gar-' + now + '-' + Math.random().toString(36).slice(2, 6),
      planetCoord: mission.destinationPlanetCoord,
      planetType: mission.destinationPlanetType,
      planetName: mission.destinationPlanetName || mission.destinationPlanetCoord,
      soldiers: JSON.parse(JSON.stringify(mission.cargo.soldiers)),
      resources: JSON.parse(JSON.stringify(mission.cargo.resources)),
      soldiersAtDeposit: JSON.parse(JSON.stringify(mission.cargo.soldiers)),
      resourcesAtDeposit: JSON.parse(JSON.stringify(mission.cargo.resources)),
      depositedAt: now,
      lastTickAt: now,
      contactStatus: mission.postArrival === 'orbit_relay' ? 'connected' : 'isolated',
      contactingTankerName: mission.postArrival === 'orbit_relay' ? mission.tankerName : null,
      contactingMissionId: mission.postArrival === 'orbit_relay' ? mission.id : null,
      lastKnownSoldiers: JSON.parse(JSON.stringify(mission.cargo.soldiers)),
      lastKnownResources: JSON.parse(JSON.stringify(mission.cargo.resources)),
      lastKnownTimestamp: now,
    };
    if (mission.world) garrison.world = mission.world;   // PATCH_2010_AUDIT
    G.garrisons.push(sbTagWorld(garrison));
  }
  // Sinon (isEmptyVigil + pas de garnison) : veille pure, pas de garnison créée — comportement initial

  // Tanker : reste en balise ou rentre ?
  if (mission.postArrival === 'orbit_relay') {
    mission.status = 'orbital_relay';  // ne disparaîtra pas
  } else {
    // Chunk polish 15/05 : tanker rentre avec timer (pas instant)
    const returnMs = mission.arrivalAt - mission.departedAt;  // même durée que l'aller
    mission.status = 'returning';
    mission.cancelledAt = now;
    mission.returnArrivalAt = now + returnMs;
    mission.cargo = { soldiers: { garde: 0, lourd: 0 }, resources: { metal: 0, energie: 0, cristal: 0 } };  // cale vide (cargo déposé en garnison)
    if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  }

  // Rapport narratif
  storeTankerDropoffReport(mission, 'success', garrison ? garrison.id : null);

  if (typeof toast === 'function') {
    if (isEmptyVigil) {
      const _pl = typeof findPlanetByCoord === 'function' ? findPlanetByCoord(mission.destinationPlanetCoord) : null;
      toast(_pl && _pl.isReal
        ? `${mission.tankerName} en orbite chez ${_pl.playerName} · canal ouvert : hisse un pavillon depuis sa fiche`
        : `${mission.tankerName} : veille orbitale active sur ${mission.destinationPlanetCoord}`);
    } else {
      const summary = describeGarrisonShort(garrison);
      toast(`${mission.tankerName} : ${summary} déposé${mission.postArrival === 'orbit_relay' ? ' · balise active' : ''}`);
    }
  }
}

// Description courte d'une garnison pour toasts/labels
function describeGarrisonShort(g) {
  const parts = [];
  const totalSoldiers = (g.soldiers.garde || 0) + (g.soldiers.lourd || 0);
  if (totalSoldiers > 0) parts.push(`${totalSoldiers} soldat${totalSoldiers > 1 ? 's' : ''}`);
  for (const rk of ['metal', 'energie', 'cristal']) {
    if (g.resources[rk] > 0) {
      const info = tileInfo(rk);
      parts.push(`${fmt(g.resources[rk])} ${info?.label?.toLowerCase() || rk}`);
    }
  }
  return parts.join(', ') || 'cale vide';
}

// ═════════════════════════════════════════════════════════════════════
// ATTRITION : décompte des pertes sur garnisons selon hostility planète
// ═════════════════════════════════════════════════════════════════════
function tickGarrisonAttrition() {
  if (!Array.isArray(G.garrisons) || G.garrisons.length === 0) return;
  const now = Date.now();

  for (let i = G.garrisons.length - 1; i >= 0; i--) {
    const g = G.garrisons[i];
    const ptype = PLANET_TYPES[g.planetType];
    if (!ptype || ptype.hostility === 0) continue;  // pas d'attrition

    const elapsedMs = now - (g.lastTickAt || g.depositedAt);
    const elapsedH = elapsedMs / (1000 * 60 * 60);
    if (elapsedH <= 0) continue;

    // Probabilité de perte par soldat sur la période
    // Approche déterministe pour proto : pertes fractionnaires accumulées
    const lossRate = ptype.hostility * elapsedH;  // ex: 0.01 * 1 = 0.01 (1%)

    let totalLost = 0;
    for (const sk of ['garde', 'lourd']) {
      if (g.soldiers[sk] > 0) {
        const lost = g.soldiers[sk] * lossRate;
        const lostInt = lost >= 1 ? Math.floor(lost) : (Math.random() < lost ? 1 : 0);
        if (lostInt > 0) {
          sbWithWorld(g.world || 'home', () => loseSoldiers(sk, Math.min(lostInt, g.soldiers[sk])));
          g.soldiers[sk] = Math.max(0, g.soldiers[sk] - lostInt);
          totalLost += lostInt;
        }
      }
    }

    g.lastTickAt = now;

    // Si connected, mettre à jour la photo
    if (g.contactStatus === 'connected') {
      g.lastKnownSoldiers = JSON.parse(JSON.stringify(g.soldiers));
      g.lastKnownResources = JSON.parse(JSON.stringify(g.resources));
      g.lastKnownTimestamp = now;
    }

    // Garnison morte → générer rapport et supprimer
    const totalRemaining = (g.soldiers.garde || 0) + (g.soldiers.lourd || 0);
    const totalRes = (g.resources.metal || 0) + (g.resources.energie || 0) + (g.resources.cristal || 0);
    if (totalRemaining === 0 && totalRes === 0) {
      storeGarrisonLostReport(g);
      G.garrisons.splice(i, 1);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
// Actions sur garnisons : rappeler tanker / rapatrier
// ═════════════════════════════════════════════════════════════════════
async function recallTankerRelay(garrisonId) {
  if (!G.garrisons) return;
  const g = G.garrisons.find(g => g.id === garrisonId);
  if (!g) return;
  if (g.contactStatus !== 'connected') {
    if (typeof toast === 'function') toast('Pas de tanker en balise');
    return;
  }
  // Délègue au rappel par mission (centralisation 16/05)
  if (g.contactingMissionId) {
    return recallOrbitalTanker(g.contactingMissionId);
  }
  if (typeof toast === 'function') toast('Mission tanker introuvable');
}

// ─── Rappel par ID de mission (feedback V3 16/05) ───
// Cette fonction gère les deux cas :
//   1. Tanker en orbite chez une garnison → désynchronise la garnison, la rend isolée
//   2. Tanker en veille pure (pas de garnison) → simple demi-tour
// Utilisée par la card "EN ORBITE" dans Flotte (bouton "Rappeler le tanker").
async function recallOrbitalTanker(missionId) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId);
  if (!mission) {
    if (typeof toast === 'function') toast('Mission introuvable');
    return;
  }
  if (mission.status !== 'orbital_relay') {
    if (typeof toast === 'function') toast('Tanker pas en orbite');
    return;
  }
  if (mission.mpTarget) return mpRecallEmbassy(mission);   // AMBASSADES_1210
  if (mission.holdCargo) return dropoffRecallFull(missionId);   // PATCH_2010_CALE_ORBITE : la cale rentre avec lui

  // Y a-t-il une garnison rattachée ?
  const garrison = (G.garrisons || []).find(g => g.contactingMissionId === missionId);

  const tankerName = mission.tankerName || 'le tanker';
  const returnMs = 5 * 60 * 1000;  // 5 min
  const returnLabel = `${Math.ceil(returnMs / 60000)} minutes`;
  const destCoord = mission.destinationPlanetCoord || mission.targetCoords || '—';

  // Confirmation adaptée selon présence ou non de garnison
  let confirmMsg;
  if (garrison) {
    confirmMsg = `Rappeler <strong>${tankerName}</strong> ?<br><br>Le transport déposé perdra le contact et passera en mode <strong>isolé</strong>. Tu ne verras plus son état en temps réel.<br><br>Le tanker rentrera à vide dans <strong>${returnLabel}</strong>.<br><em>Le contenu déposé reste sur ${destCoord}.</em>`;
  } else {
    confirmMsg = `Rappeler <strong>${tankerName}</strong> de sa veille orbitale sur <strong>${destCoord}</strong> ?<br><br>Le tanker rentrera à vide dans <strong>${returnLabel}</strong>.<br><em>Tu perdras la capacité de détecter les sondages ennemis sur cette planète.</em>`;
  }

  const ok = await sbConfirmWarning('Rappeler le tanker', confirmMsg, 'Rappeler');
  if (!ok) return;

  // Transformer la mission en returning
  const now = Date.now();
  mission.status = 'returning';
  mission.cancelledAt = now;
  mission.returnArrivalAt = now + returnMs;
  mission.cargo = { soldiers: { garde: 0, lourd: 0 }, resources: { metal: 0, energie: 0, cristal: 0 } };

  // Désync garnison si présente — SAUF s'il existe un autre tanker en orbite chez la même planète
  if (garrison) {
    const otherTankerInOrbit = (G.tankerMissions || []).find(m =>
      m.id !== missionId
      && m.status === 'orbital_relay'
      && m.destinationPlanetCoord === mission.destinationPlanetCoord
    );
    if (otherTankerInOrbit) {
      // Transférer le contact à l'autre tanker — la garnison reste connectée
      garrison.contactingTankerName = otherTankerInOrbit.tankerName;
      garrison.contactingMissionId = otherTankerInOrbit.id;
      // contactStatus reste 'connected'
    } else {
      // Plus aucun tanker en orbite : garnison réellement isolée
      garrison.contactStatus = 'isolated';
      garrison.contactingTankerName = null;
      garrison.contactingMissionId = null;
    }
  }

  if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
  if (typeof toast === 'function') {
    // Toast adapté selon le résultat
    if (garrison && garrison.contactStatus === 'connected') {
      toast(`${tankerName} fait demi-tour · contact maintenu via ${garrison.contactingTankerName}`);
    } else if (garrison) {
      toast(`${tankerName} fait demi-tour · transport isolé`);
    } else {
      toast(`${tankerName} fait demi-tour · veille levée`);
    }
  }
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Pour rapatrier : on lance une nouvelle mission tanker pickup vers la garnison.
// MVP simple : retour direct (récupère soldats + ressources, tanker rentre).
async function rapatriateGarrison(garrisonId) {
  if (!G.garrisons) return;
  const g = G.garrisons.find(g => g.id === garrisonId);
  if (!g) return;

  // Pour MVP : besoin d'un tanker dispo (sinon on alerte)
  const stat = G.fleet?.stationed?.tanker || {};
  const totalTankers = (stat.t1 || 0) + (stat.t2 || 0) + (stat.t3 || 0);
  const inMission = (G.tankerMissions || []).filter(m => m.status === 'in_transit' || m.status === 'orbital_relay' || m.status === 'returning').length;
  const available = tankerAvailability(null);

  if (available <= 0 && g.contactStatus !== 'connected') {
    if (typeof toast === 'function') toast('Aucun tanker disponible pour rapatrier');
    return;
  }

  // Si tanker déjà en orbite (connected), il prend les survivants et rentre
  if (g.contactStatus === 'connected') {
    // Garde-fou : confirmation avec récap de ce qui rentre
    const lines = [];
    if (g.soldiers.garde > 0) lines.push(`${g.soldiers.garde} garde`);
    if (g.soldiers.lourd > 0) lines.push(`${g.soldiers.lourd} lourd`);
    for (const rk of ['metal', 'energie', 'cristal']) {
      if (g.resources[rk] > 0) lines.push(`${fmt(g.resources[rk])} ${rk}`);
    }
    const cargoSummary = lines.length ? lines.map(l => `· ${l}`).join('<br>') : '<em>cale vide</em>';
    const tankerName = g.contactingTankerName || 'le tanker';
    const ok = await sbConfirmWarning(
      'Rapatrier le transport',
      `<strong>${tankerName}</strong> rentre depuis ${g.planetCoord} avec :<br><br>${cargoSummary}<br><br><em>Le voyage prend ~5 minutes. Le transport sera supprimé à l'arrivée.</em>`,
      'Lancer le retour'
    );
    if (!ok) return;

    // Chunk polish 15/05 : tanker rentre avec un timer (pas instant)
    const mission = (G.tankerMissions || []).find(m => m.id === g.contactingMissionId);
    if (mission) {
      const now = Date.now();
      const returnMs = 5 * 60 * 1000;  // 5 min
      mission.status = 'returning';
      mission.cancelledAt = now;
      mission.returnArrivalAt = now + returnMs;
      // Charger le cargo de la garnison dans le tanker
      mission.cargo = {
        soldiers: JSON.parse(JSON.stringify(g.soldiers)),
        resources: JSON.parse(JSON.stringify(g.resources)),
      };
      // Flag pour générer le rapport narratif à l'arrivée
      mission._garrisonRapatriationData = {
        planetCoord: g.planetCoord,
        planetName: g.planetName,
        soldiersAtDeposit: g.soldiersAtDeposit,
        depositedAt: g.depositedAt,
      };
      mission.destinationPlanetType = g.planetType;
      // Démarrer le ticker UI
      if (typeof startTankerCountdownTicker === 'function') startTankerCountdownTicker();
    }
    // Garnison disparaît immédiatement (le tanker l'a chargée, elle a quitté le sol)
    // Le rapport de rapatriation sera émis à l'arrivée via handleTankerReturnFromCancellation
    const gidx = G.garrisons.findIndex(x => x.id === g.id);
    if (gidx !== -1) G.garrisons.splice(gidx, 1);

    if (typeof toast === 'function') toast(`${mission?.tankerName || 'Tanker'} en route — retour dans 5 min`);
  } else {
    // Garnison isolated : il faut envoyer un tanker neuf
    // MVP : pour l'instant on dit non, fonction future
    if (typeof toast === 'function') toast('Rappelle d\'abord le contact (envoie un tanker en balise)');
    return;
  }

  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ═════════════════════════════════════════════════════════════════════
// Rapports narratifs garnison
// ═════════════════════════════════════════════════════════════════════
function storeTankerDropoffReport(mission, kind, garrisonId) {
  if (!Array.isArray(G.tankerReports)) G.tankerReports = [];
  const narrative = generateTankerDropoffNarrative(mission, kind);
  // Calcul routeFactor (pour afficher dans le bloc visuel : taxe, bonus, perte)
  const routeFactor = (typeof computeRouteLootFactor === 'function')
    ? computeRouteLootFactor(mission)
    : 1.0;
  const report = {
    id: 'tr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: mission.tankerName,
    kind: 'dropoff',
    dropoffKind: kind,  // 'success' | 'deadly'
    targetCoords: mission.destinationPlanetCoord,
    targetLabel: mission.destinationPlanetName || mission.destinationPlanetCoord,
    createdAt: Date.now(),
    read: false,
    isLost: false,
    cargo: mission.cargo,
    cargoOriginal: mission.cargoOriginal,  // ← pour calcul delta (envoyé vs arrivé)
    routeType: mission.routeType,            // ← pour libellé taxe/bonus/perte
    routeFactor,                              // ← multiplicateur appliqué
    postArrival: mission.postArrival,
    garrisonId: garrisonId || null,
    narrative,
  };
  G.tankerReports.unshift(report);
  if (G.tankerReports.length > 50) G.tankerReports.length = 50;
  return report;
}

function generateTankerDropoffNarrative(mission, kind) {
  const crew = (typeof pickSpaceWorkerName === 'function') ? pickSpaceWorkerName() : 'L\'équipage';
  const coord = mission.destinationPlanetCoord;
  const total = (mission.cargo.soldiers.garde || 0) + (mission.cargo.soldiers.lourd || 0);

  // ─── Routes Duales : préfixer la narration avec un encart Trajet
  // si le tanker a pris la voie directe ET croisé une rencontre.
  const routePrefix = _buildRouteTrajetPrefix(mission, crew);

  // Note (feedback V3 16/05) : le bloc "Cargo livré" en queue de texte a été retiré.
  // Désormais affiché VISUELLEMENT en bas du rapport, style butin d'attaque (renderTankerReport).

  if (kind === 'deadly') {
    return routePrefix + `${mission.tankerName} est arrivé en orbite de ${coord}. La planète était une géante gazeuse — pas de surface, juste des couches infinies de vent et de pression. ${crew} a tenté un largage automatisé, mais les capsules ont été broyées avant d'avoir parcouru cinq mille mètres dans l'atmosphère.\n\nLe tanker est reparti à vide. ${total > 0 ? `${total} soldats perdus.` : 'Les ressources transportées ont été pulvérisées.'}\n\nLes rapports de bord mentionnent que personne n'avait vraiment regardé la fiche de la cible avant le départ.`;
  }

  // Success — variants selon contenu
  const hasSoldiers = total > 0;
  const hasResources = (mission.cargo.resources.metal || 0) + (mission.cargo.resources.energie || 0) + (mission.cargo.resources.cristal || 0) > 0;
  const relay = mission.postArrival === 'orbit_relay';

  if (hasSoldiers && hasResources) {
    return routePrefix + `${mission.tankerName} a atteint ${coord} sans incident. ${crew} a supervisé le débarquement : ${total} soldats équipés en autonomie longue durée, plus le matériel de soutien. L'opération a duré trois cycles.\n\n${relay ? `Le tanker est resté en orbite haute. Les liaisons radio sont stables. Le contact au sol rapporte des conditions ${describePlanetCondition(mission.destinationPlanetType)}.` : `Le tanker est rentré une fois la cale vide. Les soldats au sol sont seuls maintenant — le prochain contact dépendra d'une autre mission.`}`;
  }

  if (hasSoldiers) {
    return routePrefix + `Le débarquement de ${total} soldats à ${coord} s'est déroulé selon les protocoles. ${crew} a confirmé l'établissement du périmètre avant de remonter. Pas de présence hostile détectée — pas de présence du tout, en réalité.\n\n${relay ? `${mission.tankerName} maintient sa position en orbite. Les communications passent. Pour l'instant.` : `${mission.tankerName} est reparti. Le détachement est seul désormais. Quand on les recontactera, on saura ce qui s'est passé entre temps.`}`;
  }

  // Resources only
  if (hasResources) {
    return routePrefix + `${mission.tankerName} a livré la cargaison à ${coord}. ${crew} a procédé à un stockage sécurisé, à l'abri des intempéries de surface. Les conteneurs sont scellés, étiquetés à la convention coloniale.\n\n${relay ? `Le tanker reste en orbite — ${describePlanetCondition(mission.destinationPlanetType)} et le contact tient.` : `Tanker rentré. La cache est invisible depuis l'espace, sauf à savoir précisément quoi chercher.`}`;
  }

  // ─── Cas spécial : tanker arrivé vide (veille orbitale) ───
  // Pas de cargaison, le tanker est juste là pour observer.
  return routePrefix + `${mission.tankerName} a pris position en orbite de ${coord}. Aucune cargaison à débarquer. ${crew} a établi un point d'observation passive — instruments à l'écoute, capteurs à pleine puissance.\n\nLe tanker reste en veille. Tout mouvement détecté autour de la planète sera signalé en temps réel.`;
}

// (Ancienne fonction _buildCargoLivredBlock retirée le 16/05 — feedback V3.
//  Le bloc cargo est désormais rendu visuellement dans renderTankerReport,
//  style butin d'attaque.)



// Construit le préfixe "Trajet" inséré en tête du rapport tanker.
// - Voie balisée : courte mention factuelle du trajet (taxe 12% appliquée).
// - Voie directe SANS rencontre : mention que le trajet a été sans incident.
// - Voie directe AVEC rencontre : narration complète de la rencontre.
// Tous les cas incluent un BILAN MÉCANIQUE (durée + résumé route) et un BILAN CARGAISON
// avec les valeurs concrètes envoyées vs livrées (style rapport de récupération).
function _buildRouteTrajetPrefix(mission, crew) {
  if (!mission.routeType) return '';

  // ─── Bilan en italique : nature du trajet ───
  const actualDurationMs = mission.arrivalAt - mission.departedAt;
  const durationLabel = (typeof formatTankerDuration === 'function')
    ? formatTankerDuration(actualDurationMs)
    : Math.round(actualDurationMs / 60000) + ' min';

  let bilanParts = [];

  // Détecter si la cale est vide (tanker pur observateur)
  const cargoFinalCheck = mission.cargo || { soldiers: {}, resources: {} };
  const totalDelivered = (cargoFinalCheck.resources?.metal || 0) + (cargoFinalCheck.resources?.energie || 0)
    + (cargoFinalCheck.resources?.cristal || 0) + (cargoFinalCheck.soldiers?.garde || 0) + (cargoFinalCheck.soldiers?.lourd || 0);
  const isEmptyTanker = totalDelivered === 0
    && !mission.cargoOriginal?.resources?.metal && !mission.cargoOriginal?.resources?.energie
    && !mission.cargoOriginal?.resources?.cristal && !mission.cargoOriginal?.soldiers?.garde
    && !mission.cargoOriginal?.soldiers?.lourd;

  if (mission.routeType === 'own') {   // PATCH_1310_ROUTES2
    bilanParts.push(`${mission.ownRouteName || 'Ta route'} · trajet ${durationLabel}`);
    bilanParts.push('ni taxe ni incident');
    return `**Trajet par ta route.**\n\n*${bilanParts.join(' · ')}.*\n\nLe tanker a suivi le tracé entre tes balises, système après système. Personne ne l'a arrêté.\n\n---\n\n`;
  }
  if (mission.routeType === 'beacon') {
    bilanParts.push(`Voie balisée · trajet ${durationLabel}`);
    if (!isEmptyTanker) bilanParts.push(`taxe impériale 12% appliquée`);
    else bilanParts.push(`tanker en observation (cale vide)`);
  } else {
    // Voie directe
    bilanParts.push(`Voie directe · trajet ${durationLabel} (gain ~35% sur balisée)`);

    if (mission.encounter) {
      const catLabel = {
        'positive': 'rencontre positive',
        'positive_loot': 'rencontre positive (gain matériel)',
        'neutral': 'rencontre neutre (sans effet)',
        'incident': 'rencontre : incident',
        'route_card': 'rencontre : carte de route trouvée',
      }[mission.encounter.category] || mission.encounter.category;
      bilanParts.push(catLabel);
    } else {
      bilanParts.push(`aucune rencontre`);
    }
  }

  const bilanLine = `*${bilanParts.join(' · ')}.*`;

  // Note (feedback V3 16/05) : le bloc "CARGAISON LIVRÉE" textuel a été retiré.
  // Le bilan cargo est désormais rendu VISUELLEMENT en bas du rapport,
  // dans un encart style butin d'attaque (voir renderTankerReport).

  // ─── Cas 1 : Voie balisée ───
  if (mission.routeType === 'beacon') {
    return `**Trajet en voie balisée.**\n\n${bilanLine}\n\n---\n\n`;
  }

  // ─── Cas 2 : Voie directe sans rencontre ───
  if (!mission.encounter) {
    return `**Trajet en voie directe — sans rencontre.**\n\n${bilanLine}\n\nLe tanker a traversé les zones non balisées sans incident notable. ${crew} a noté quelques anomalies de routine sur le journal de bord, rien d'exploitable.\n\n---\n\n`;
  }

  // ─── Cas 3 : Voie directe avec rencontre ───
  const encNarrative = (typeof getEncounterNarrative === 'function')
    ? getEncounterNarrative(mission.encounter.id, crew, mission.destinationPlanetCoord)
    : null;
  if (!encNarrative) {
    return `**Trajet en voie directe — ${mission.encounter.title}.**\n\n${bilanLine}\n\n---\n\n`;
  }

  return `**Trajet en voie directe — ${mission.encounter.title}.**\n\n${bilanLine}\n\n${encNarrative}\n\n---\n\n`;
}

function describePlanetCondition(typeKey) {
  switch (typeKey) {
    case 'type1': return 'l\'environnement est stable, mais l\'érosion lente';
    case 'type2': return 'le sol métallique est dur, sans signe de dégradation';
    case 'type3': return 'l\'atmosphère est respirable, le climat clément';
    case 'type5': return 'les vents toxiques rongent l\'équipement plus vite que prévu';
    default: return 'les conditions sont passables';
  }
}

function storeGarrisonLostReport(g) {
  if (!Array.isArray(G.tankerReports)) G.tankerReports = [];
  const ptype = PLANET_TYPES[g.planetType];
  const elapsedH = (Date.now() - g.depositedAt) / (1000 * 60 * 60);
  const original = (g.soldiersAtDeposit.garde || 0) + (g.soldiersAtDeposit.lourd || 0);

  let narrative;
  if (g.contactStatus === 'connected') {
    narrative = `Dernier message reçu de ${g.planetCoord}. Le détachement déposé il y a ${Math.floor(elapsedH)} heures n'existe plus. ${ptype?.label || 'Le climat'} a fini par avoir raison du dernier des ${original} soldats.\n\nLe tanker en orbite rapporte : "Aucune réponse aux protocoles standards. La planète a repris ses droits."`;
  } else {
    narrative = `Lors d'un sondage de routine vers ${g.planetCoord}, aucune trace du détachement déposé il y a ${Math.floor(elapsedH)} heures. ${original} soldats — disparus.\n\nLes conditions de surface (${ptype?.label || 'inconnues'}) expliquent probablement leur effacement. Sans tanker en balise, il était impossible de surveiller leur déclin en temps réel.`;
  }

  G.tankerReports.unshift({
    id: 'tr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    tankerName: g.contactingTankerName || '—',
    kind: 'garrison_lost',
    targetCoords: g.planetCoord,
    targetLabel: g.planetName || g.planetCoord,
    createdAt: Date.now(),
    read: false,
    isLost: true,
    narrative,
  });
  if (G.tankerReports.length > 50) G.tankerReports.length = 50;
}

function storeGarrisonRapatriationReport(g, mode) {
  if (!Array.isArray(G.tankerReports)) G.tankerReports = [];
  const remaining = (g.soldiers.garde || 0) + (g.soldiers.lourd || 0);
  const original = (g.soldiersAtDeposit.garde || 0) + (g.soldiersAtDeposit.lourd || 0);
  const lost = original - remaining;
  const tankerName = g.contactingTankerName || 'Tanker';

  let narrative;
  if (lost === 0 && remaining > 0) {
    narrative = `${tankerName} a rapatrié le transport depuis ${g.planetCoord} sans perte. Les ${remaining} soldats sont rentrés au quartier. Les ressources sont également rentrées intactes.\n\nL'équipage en orbite a rapporté que rien d'inhabituel n'avait été observé pendant le séjour.`;
  } else if (remaining > 0) {
    narrative = `${tankerName} ramène les survivants de ${g.planetCoord}. ${remaining} soldats au retour, sur les ${original} déposés. ${lost} ont été perdus à ${PLANET_TYPES[g.planetType]?.label || 'cette planète'}.\n\nLes noms seront ajoutés au mur du Centre de Commandement.`;
  } else {
    narrative = `${tankerName} est revenu de ${g.planetCoord} avec uniquement les ressources stockées. Aucun soldat à bord. Les ${original} déposés à l'origine ont tous succombé aux conditions de surface.\n\nLa décision de les laisser là-bas sera revue en cellule d'analyse.`;
  }

  G.tankerReports.unshift({
    id: 'tr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    tankerName,
    kind: 'rapatriation',
    targetCoords: g.planetCoord,
    targetLabel: g.planetName || g.planetCoord,
    createdAt: Date.now(),
    read: false,
    isLost: false,
    loot: { resources: g.resources, soldiersReturned: g.soldiers },
    narrative,
  });
  if (G.tankerReports.length > 50) G.tankerReports.length = 50;
}

// ═════════════════════════════════════════════════════════════════════
// Accesseurs garnisons
// ═════════════════════════════════════════════════════════════════════
function getGarrisons() { return G.garrisons || []; }
function getGarrisonsAt(planetCoord) {
  return (G.garrisons || []).filter(g => g.planetCoord === planetCoord);
}
function getTotalEngagedGarrisonSoldiers(soldierKey) {
  return (G.garrisons || []).reduce((acc, g) => acc + (g.soldiers?.[soldierKey] || 0), 0);
}

// ─── Application du résultat du combat sur l'état du jeu ───
// Modifie la flotte (composition, soldiers, heroes) et ajoute le butin aux stocks.
function applyCombatResult(fleet, result, target) {
  if (!fleet || !result) return;
  // BRINGUE_1310 — flotte rentrée victorieuse : la caserne fait la fête 1 h (assets/fete_caserne.js)
  try { if (window.SBBringue) SBBringue.onVictory(result.outcome); } catch (e) { console.warn('[bringue]', e); }

  // 1. Soustraire les pertes de vaisseaux DÉTRUITS (les récupérés rentrent au hangar)
  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    for (const tier of ['t1', 't2', 't3']) {
      const destroyed = result.finalLosses.ships[type]?.[tier] || 0;
      fleet.composition[type][tier] = Math.max(0, fleet.composition[type][tier] - destroyed);
      loseShips(type, tier, destroyed);
    }
  }
  // 1-bis. Avaries des survivants (intégrité) ; une coque à 0 % est perdue
  applyIntegrityDamage(fleet, result);

  // 2. Soustraire les pertes de soldats (flotte ET effectif possédé)
  loseSoldiers('garde', Math.min(result.finalLosses.soldiers.garde || 0, fleet.soldiers?.garde || 0));
  loseSoldiers('lourd', Math.min(result.finalLosses.soldiers.lourd || 0, fleet.soldiers?.lourd || 0));
  if (result.finalLosses.soldiers.garde) {
    fleet.soldiers.garde = Math.max(0, (fleet.soldiers.garde || 0) - result.finalLosses.soldiers.garde);
  }
  if (result.finalLosses.soldiers.lourd) {
    fleet.soldiers.lourd = Math.max(0, (fleet.soldiers.lourd || 0) - result.finalLosses.soldiers.lourd);
  }

  // 3. Marquer les héros morts + enregistrer les fantômes marquants (passe 3.4-c)
  for (const dead of result.finalLosses.heroesDead) {
    const heroObj = fleet.heroes[dead.role];
    if (heroObj) {
      // Capture les infos AVANT de marquer dead (sinon getHeroRank inutile)
      const wasFirstMission = (heroObj.missionsCount || 0) === 0;
      // Enregistrer comme fantôme marquant si critères remplis
      recordFallenHero(heroObj, {
        targetName: target?.name || '—',
        outcome: result.outcome,
        firstMission: wasFirstMission,
        heroic: !!result.heroic,
      });
      heroObj.dead = true;
    }
  }

  // 4. Ajouter le butin aux stocks (en respectant les caps)
  for (const res of ['metal', 'energie', 'cristal']) {
    const gained = result.loot[res] || 0;
    if (gained > 0 && G.res[res]) {
      const cap = G.res[res].max || Infinity;
      G.res[res].v = Math.min(cap, (G.res[res].v || 0) + gained);
    }
  }

  // 5. Incrémenter le compteur de missions des héros survivants
  //    Passe 3.4-c : tenter d'assigner un surnom si éligible (5+ missions)
  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    const hero = fleet.heroes[type];
    if (hero && !hero.dead) {
      // Le héros n'a participé que si son type était présent dans la flotte au départ
      const wasPresent = countShipsByType(fleet.composition, type) > 0
                      || (result.finalLosses.ships[type]?.t1 || 0)
                       + (result.finalLosses.ships[type]?.t2 || 0)
                       + (result.finalLosses.ships[type]?.t3 || 0) > 0;
      if (wasPresent) {
        hero.missionsCount = (hero.missionsCount || 0) + 1;
        if (!hero.firstMissionAt) hero.firstMissionAt = Date.now();
        // Passe 3.4-c : assigner un surnom à 5+ missions
        maybeAssignNickname(hero);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// returnMission — Appelée quand le timer de mission arrive à zéro
// (ou via cheat). Lance le combat, applique le résultat, génère le rapport.
// ═══════════════════════════════════════════════════════════════
function returnMission(fleet) {
  if (window.SBSfx) SBSfx.play('fleet');   // SFX_2410
  if (fleet.mpRaidId) { mpReturnRaid(fleet); return; }
  const target = getFakeTarget(fleet.missionTargetId);
  const doctrine = detectFleetDoctrine(fleet.composition, fleet.soldiers);
  const intent = getMissionIntent(fleet);

  // PASSE 3.4 — Résolution du combat
  const combatResult = target ? resolveCombat(fleet, target) : null;

  // Snapshot de la composition AVANT pertes (pour le rapport)
  const compositionBefore = JSON.parse(JSON.stringify(fleet.composition));
  const soldiersBefore = { ...fleet.soldiers };
  const heroesBefore = JSON.parse(JSON.stringify(fleet.heroes || {}));

  // Application du résultat sur l'état du jeu
  if (combatResult && pvIsEmpty(target)) { try { pvApply(fleet, target, combatResult); } catch (e) { console.warn('[pillage vide]', e); } }   // PATCH_2010_PILLAGE_VIDE
  if (combatResult) {
    applyCombatResult(fleet, combatResult, target);
    if (target && target.botCoord && combatResult.phases?.phase3?.executed) botRecordRaid(target.botCoord, combatResult.loot);
  }

  // Génération du rapport (passe 3.4 — placeholder structurel en attendant 3.4-b/c)
  if (!G.reports) G.reports = [];
  const report = {
    id: 'rpt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    fleetId: fleet.id,
    fleetName: fleet.name,
    targetId: fleet.missionTargetId,
    targetName: target ? target.name : '—',
    targetProfile: target ? target.profile : '',
    doctrine: doctrine ? { key: doctrine.key, name: doctrine.name, color: doctrine.color, icon: doctrine.icon } : null,
    intent: { label: intent.label, icon: intent.icon },
    startedAt: fleet.missionStartedAt,
    returnedAt: Date.now(),
    fuelSpent: fleet.missionFuelSpent || 0,
    read: false,
    // PASSE 3.4 — Résultat du combat
    combat: combatResult,
    compositionBefore,
    soldiersBefore,
    heroesBefore,
    placeholder: false, // Plus un placeholder !
  };
  G.reports.unshift(report); // Plus récent en haut

  fleet.status = 'deployed';
  fleet.missionTargetId = null;
  fleet.missionStartedAt = null;
  fleet.missionEndsAt = null;
  fleet.missionFuelSpent = null;

  // Message toast adapté au résultat
  if (combatResult) {
    const outcomeLabels = {
      crushing_victory: '⭐ Victoire écrasante',
      victory: 'Victoire',
      pyrrhic: 'Victoire à la Pyrrhus',
      defeat: 'Défaite',
      massacre: 'Massacre',
    };
    const label = outcomeLabels[combatResult.outcome] || 'Mission terminée';
    toast(`${fleet.name} : ${label} sur ${target ? target.name : 'mission'}`);
  } else {
    toast(`${fleet.name} revient — rapport disponible`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   RAPPORTS DE MISSION — passe 3.3 (placeholder pour 3.4)
   ═══════════════════════════════════════════════════════════════ */

function getUnreadReportsCount() {
  return (G.reports || []).filter(r => !r.read).length;
}

function openReportsList() {
  renderReportsList();
  goto('reports');
}

function openReportDetail(reportId) {
  selectedReportId = reportId;
  // Marquer comme lu
  const r = (G.reports || []).find(r => r.id === reportId);
  if (r) r.read = true;
  renderReportDetail();
  goto('report-detail');
}

function renderReportsList() {
  const listEl = document.getElementById('reports-list');
  const emptyEl = document.getElementById('reports-empty');
  const countEl = document.getElementById('reports-count');
  if (!listEl) return;

  const reports = G.reports || [];
  if (countEl) {
    const unread = reports.filter(r => !r.read).length;
    countEl.textContent = unread > 0
      ? `${reports.length} rapport${reports.length > 1 ? 's' : ''} · ${unread} non lu${unread > 1 ? 's' : ''}`
      : `${reports.length} rapport${reports.length > 1 ? 's' : ''}`;
  }

  if (reports.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  let html = '';
  for (const r of reports) {
    const time = new Date(r.returnedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const unreadDot = !r.read
      ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--amber);margin-right:8px;box-shadow:0 0 6px var(--amber)"></span>`
      : '';
    html += `<div class="sw-row" data-sk="fleet" data-sid="${r.id}"><button class="sw-del" aria-label="Supprimer"><span>${typeof icon === 'function' ? icon('trash', { size: 18 }) : ''}</span><i>Supprimer</i></button><div class="sw-in">
      <div class="fleet-prepared-row" onclick="openReportDetail('${r.id}')" style="${r.read ? '' : 'border-color:rgba(255,192,96,.35);background:linear-gradient(180deg,rgba(60,42,14,.4),rgba(35,25,10,.6))'}">
        <div class="fleet-prepared-icon" style="color:${r.read ? 'var(--mut)' : 'var(--amber)'};background:rgba(255,192,96,.05);border-color:rgba(255,192,96,.2);font-size:20px;display:flex;align-items:center;justify-content:center">${icon('satellite', {size:20})}</div>
        <div class="fleet-prepared-info">
          <div class="fleet-prepared-name">${unreadDot}${r.fleetName} → ${r.targetName}</div>
          <div style="font-size:10px;color:${r.doctrine?.color || 'var(--mut)'};margin-top:2px;font-style:italic">${r.intent.icon} ${r.intent.label}</div>
          <div class="fleet-prepared-stats" style="margin-top:3px;font-family:'SF Mono',monospace">${time}</div>
        </div>
        <div class="fleet-prepared-arrow">→</div>
      </div></div></div>
    `;
  }
  listEl.innerHTML = html;
}

function renderReportDetail() {
  const r = (G.reports || []).find(r => r.id === selectedReportId);
  if (!r) return;
  if (r.kind === 'defense') { renderDefenseReportDetail(r); return; }
  if (r.kind === 'flag') { renderFlagReportDetail(r); return; }
  if (r.kind === 'diplo') { renderDiploReportDetail(r); return; }   // AMBASSADES_1210
  if (r.kind === 'piracy') { renderPiracyReportDetail(r); return; }  // PIRATERIE_1210

  document.getElementById('report-detail-title').textContent = r.fleetName.toUpperCase();
  document.getElementById('report-detail-meta').textContent = `Rapport · ${new Date(r.returnedAt).toLocaleString('fr-FR')}`;

  const contentEl = document.getElementById('report-detail-content');
  if (!contentEl) return;

  const startedTime = r.startedAt ? new Date(r.startedAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const returnedTime = new Date(r.returnedAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // ─── En-tête commun ───
  let html = `
    <div style="background:rgba(255,192,96,.04);border:1px solid rgba(255,192,96,.25);border-radius:10px;padding:18px;margin:0 16px 14px;font-family:'SF Mono',monospace;font-size:12px;line-height:1.7;color:var(--mut)">
      <div style="color:var(--amber);font-size:11px;letter-spacing:.16em;margin-bottom:10px;border-bottom:1px solid rgba(255,192,96,.2);padding-bottom:8px">═══ RAPPORT DE MISSION ═══</div>

      <div style="color:#e6f0ff;font-size:13px;margin-bottom:14px">
        <div><span style="color:var(--mut)">Flotte    :</span> <span style="color:var(--blue-light)">${r.fleetName}</span></div>
        <div><span style="color:var(--mut)">Cible     :</span> <span style="color:var(--red)">${r.targetName}${r.targetProfile ? ` <span style="color:var(--mut);font-style:italic">(${r.targetProfile})</span>` : ''}</span></div>
        <div><span style="color:var(--mut)">Doctrine  :</span> <span style="color:${r.doctrine?.color || 'var(--mut)'}">${r.doctrine ? `${r.doctrine.icon} ${r.doctrine.name}` : '—'}</span></div>
        <div><span style="color:var(--mut)">Intention :</span> <span style="color:var(--amber)">${r.intent.icon} ${r.intent.label}</span></div>
      </div>

      <div style="color:#e6f0ff;font-size:13px;margin-bottom:14px">
        <div><span style="color:var(--mut)">Départ    :</span> ${startedTime}</div>
        <div><span style="color:var(--mut)">Retour    :</span> ${returnedTime}</div>
        <div><span style="color:var(--mut)">Énergie  :</span> <span style="color:var(--cyan);display:inline-flex;align-items:center;gap:4px">${icon('zap', {size:11})} ${fmt(r.fuelSpent || 0)}</span></div>
      </div>
  `;

  // ─── Section Commandement (héros présents au départ) ───
  if (r.heroesBefore) {
    const heroLines = [];
    for (const type of ['cuirasse', 'fregate', 'tanker']) {
      const hero = r.heroesBefore[type];
      if (hero && hero.name) {
        const wasKilled = r.combat?.finalLosses?.heroesDead?.some(h => h.name === hero.name);
        const statusIcon = wasKilled ? `${icon('skull', {size:11})}` : `${icon('check', {size:11, color:'#5fcc8a'})}`;
        const statusColor = wasKilled ? 'var(--red)' : 'var(--green)';
        const role = HERO_ROLES[type];
        heroLines.push(`
          <div style="display:flex;gap:10px;align-items:center;font-size:11px">
            <span style="color:${statusColor};width:14px">${statusIcon}</span>
            <span style="color:var(--mut);width:140px;font-size:10px">${role?.label || type}</span>
            <span style="color:${wasKilled ? 'var(--red)' : '#e6f0ff'}">${hero.name}</span>
          </div>
        `);
      }
    }
    if (heroLines.length > 0) {
      html += `
        <div style="margin:14px 0 10px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.15)">
          <div style="color:var(--amber);font-size:10px;letter-spacing:.18em;margin-bottom:8px">── COMMANDEMENT ──</div>
          ${heroLines.join('')}
        </div>
      `;
    }
  }

  // ─── Sections combat (si le rapport contient un combat résolu) ───
  if (r.combat) {
    html += _renderCombatPhases(r);
  }

  html += `</div>`;

  contentEl.innerHTML = html;
}

// Helper : rendu des phases de combat (logs techniques bruts pour validation)
function _renderCombatPhases(r) {
  const c = r.combat;
  if (!c) return '';

  let html = '';

  // ─── OUTCOME GLOBAL ───
  const outcomeMap = {
    crushing_victory: { label: 'VICTOIRE ÉCRASANTE', icon: '⭐', color: 'var(--green)' },
    victory:          { label: 'VICTOIRE',           icon: 'sword', color: 'var(--green)' },
    pyrrhic:          { label: 'VICTOIRE À LA PYRRHUS', icon: '', color: 'var(--amber)' },
    defeat:           { label: 'DÉFAITE',            icon: '', color: 'var(--red)' },
    massacre:         { label: 'MASSACRE',           icon: 'skull', color: 'var(--red)' },
  };
  const o = outcomeMap[c.outcome] || outcomeMap.defeat;
  html += `
    <div style="margin:14px 0;padding:12px;background:rgba(0,0,0,.3);border:1px solid ${o.color};border-radius:6px;text-align:center">
      <div style="font-size:18px;color:${o.color};letter-spacing:.16em;display:flex;align-items:center;justify-content:center;gap:8px">${renderIcon(o.icon, {size:18})} ${o.label}</div>
      ${c.heroic ? `<div style="font-size:10px;color:var(--amber);margin-top:6px;letter-spacing:.2em">⭐ COMBAT HÉROÏQUE — Butin ×1.5</div>` : ''}
    </div>
  `;

  // ─── PASSE 3.4-b : générer le récit narratif ───
  const narrative = generateCombatNarrative(r);

  // ─── PHASE 1 — ORBITAL ───
  if (c.phases.phase1) {
    const p = c.phases.phase1;
    html += `
      <div style="margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.15)">
        <div style="color:var(--amber);font-size:10px;letter-spacing:.18em;margin-bottom:8px">═══ PHASE 1 — BATAILLE ORBITALE ═══</div>
        ${narrative?.phase1 ? `<div style="font-style:italic;color:#e6f0ff;font-size:12px;line-height:1.8;padding:10px 0 14px;white-space:pre-line">${narrative.phase1}</div>` : ''}
        <div style="font-size:11px;line-height:1.8;color:var(--mut);padding-top:6px;border-top:1px dotted rgba(255,192,96,.08)">
          <div style="color:var(--amber);font-size:9px;letter-spacing:.18em;margin-bottom:4px">▸ LOGS TECHNIQUES</div>
          <div><span style="color:var(--mut)">Résultat   :</span> <span style="color:${p.won ? 'var(--green)' : 'var(--red)'}">${p.won ? 'VICTOIRE' : 'DÉFAITE'}</span></div>
          <div><span style="color:var(--mut)">Attaque    :</span> <span style="color:#e6f0ff">${fmt(p.atkBase)} → <span style="color:var(--blue-light)">${fmt(p.atkEffective)}</span> (×${p.atkBase ? (p.atkEffective/p.atkBase).toFixed(2) : '—'})</span></div>
          <div><span style="color:var(--mut)">Défense    :</span> <span style="color:#e6f0ff">${fmt(p.defBase)} → <span style="color:var(--red)">${fmt(p.defEffective)}</span> (×${p.defBase ? (p.defEffective/p.defBase).toFixed(2) : '—'})</span></div>
          <div><span style="color:var(--mut)">Engagés    :</span> <span style="color:#e6f0ff">${p.engaged.fregate || 0} frégates · ${p.engaged.cuirasse || 0} cuirassés</span></div>
          <div><span style="color:var(--mut)">Pertes     :</span> <span style="color:var(--red)">${(p.lossPct * 100).toFixed(0)}% des vaisseaux engagés</span></div>
        </div>
      </div>
    `;
  }

  // ─── PHASE 2 — DÉBARQUEMENT ───
  if (c.phases.phase2) {
    const p = c.phases.phase2;
    html += `
      <div style="margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.15)">
        <div style="color:var(--amber);font-size:10px;letter-spacing:.18em;margin-bottom:8px">═══ PHASE 2 — DÉBARQUEMENT ═══</div>
        ${narrative?.phase2 ? `<div style="font-style:italic;color:#e6f0ff;font-size:12px;line-height:1.8;padding:10px 0 14px;white-space:pre-line">${narrative.phase2}</div>` : ''}
        <div style="font-size:11px;line-height:1.8;color:var(--mut);padding-top:6px;border-top:1px dotted rgba(255,192,96,.08)">
          <div style="color:var(--amber);font-size:9px;letter-spacing:.18em;margin-bottom:4px">▸ LOGS TECHNIQUES</div>
          <div><span style="color:var(--mut)">Résultat   :</span> <span style="color:${p.won ? 'var(--green)' : 'var(--red)'}">${p.won ? 'VICTOIRE' : 'DÉFAITE'}</span></div>
          <div><span style="color:var(--mut)">Soldats    :</span> <span style="color:#e6f0ff">${fmt(p.atkBase)} atk → <span style="color:var(--blue-light)">${fmt(p.atkEffective)}</span></span></div>
          <div><span style="color:var(--mut)">Garnison   :</span> <span style="color:#e6f0ff">${fmt(p.defBase)} → <span style="color:var(--red)">${fmt(p.defEffective)}</span></span></div>
          <div><span style="color:var(--mut)">Engagés    :</span> <span style="color:#e6f0ff">${p.engaged.garde || 0} gardes · ${p.engaged.lourd || 0} lourds</span></div>
          <div><span style="color:var(--mut)">Pertes     :</span> <span style="color:var(--red)">${(p.lossPct * 100).toFixed(0)}% des soldats engagés</span></div>
        </div>
      </div>
    `;
  } else if (c.phases.phase1?.won && !c.phases.phase2) {
    html += `
      <div style="margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.15)">
        <div style="color:var(--mut);font-size:10px;letter-spacing:.18em">═══ PHASE 2 — DÉBARQUEMENT ═══</div>
        <div style="font-size:11px;color:var(--mut);font-style:italic;margin-top:6px">↪ Sautée — aucun soldat embarqué</div>
      </div>
    `;
  }

  // ─── PHASE 3 — PILLAGE ───
  if (c.phases.phase3?.executed) {
    const p = c.phases.phase3;
    html += `
      <div style="margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.15)">
        <div style="color:var(--amber);font-size:10px;letter-spacing:.18em;margin-bottom:8px">═══ PHASE 3 — PILLAGE ═══</div>
        ${narrative?.phase3 ? `<div style="font-style:italic;color:#e6f0ff;font-size:12px;line-height:1.8;padding:10px 0 14px;white-space:pre-line">${narrative.phase3}</div>` : ''}
        <div style="font-size:11px;line-height:1.8;color:var(--mut);padding-top:6px;border-top:1px dotted rgba(255,192,96,.08)">
          <div style="color:var(--amber);font-size:9px;letter-spacing:.18em;margin-bottom:4px">▸ LOGS TECHNIQUES</div>
          <div><span style="color:var(--mut)">Capacité   :</span> <span style="color:#e6f0ff">${fmt(p.cargoCapacity)} cargo</span></div>
          <div><span style="color:var(--mut)">Chargé     :</span> <span style="color:var(--green)">${fmt(p.cargoUsed)}</span></div>
          <div><span style="color:var(--mut)">Pillage    :</span> <span style="color:#e6f0ff">${(p.pillagePct * 100).toFixed(0)}% des ressources cible</span></div>
          ${p.heroic ? `<div style="color:var(--amber);font-style:italic;margin-top:4px">⭐ Bonus héroïque ×1.5 appliqué</div>` : ''}
        </div>
        <div style="margin-top:10px;padding:8px;background:rgba(255,192,96,.06);border-radius:4px;font-size:11px;line-height:1.7">
          <div style="color:var(--warm)">+${fmt(p.loot.metal)} métal</div>
          <div style="color:var(--amber)">+${fmt(p.loot.energie)} énergie</div>
          <div style="color:var(--cyan)">+${fmt(p.loot.cristal)} cristal</div>
        </div>
      </div>
    `;
  } else if (c.phases.phase1?.won && c.phases.phase3 && !c.phases.phase3.executed) {
    html += `
      <div style="margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,192,96,.15)">
        <div style="color:var(--mut);font-size:10px;letter-spacing:.18em">═══ PHASE 3 — PILLAGE ═══</div>
        <div style="font-size:11px;color:var(--mut);font-style:italic;margin-top:6px">↪ Sautée — aucun Tanker disponible pour charger le butin</div>
      </div>
    `;
  }

  if (c.emptyWorld) html += pvReportHtml(c.emptyWorld);   // PATCH_2010_PILLAGE_VIDE
  // ─── BILAN PERTES (vaisseaux + héros morts) ───
  const ships = c.finalLosses.ships;
  const sRec = c.finalLosses.shipsRecovered;
  const totalLost = (ships.tanker.t1 + ships.tanker.t2 + ships.tanker.t3
                   + ships.fregate.t1 + ships.fregate.t2 + ships.fregate.t3
                   + ships.cuirasse.t1 + ships.cuirasse.t2 + ships.cuirasse.t3);
  const totalRec = (sRec.tanker.t1 + sRec.tanker.t2 + sRec.tanker.t3
                  + sRec.fregate.t1 + sRec.fregate.t2 + sRec.fregate.t3
                  + sRec.cuirasse.t1 + sRec.cuirasse.t2 + sRec.cuirasse.t3);

  if (c.integrity && c.integrity.hit) {
    html += `<div style="margin-top:10px;font-size:11px;line-height:1.8"><span style="color:var(--mut)">Coques touchées      :</span> <span style="color:var(--amber)">${c.integrity.hit}</span> <span style="color:var(--mut)">· avaries moyennes −${c.integrity.avgDmg} % · intégrité ${c.integrity.avgAfter} %</span>${c.integrity.wrecked ? `<br><span style="color:var(--mut)">Perdus par avaries    :</span> <span style="color:var(--red)">${c.integrity.wrecked}</span>` : ''}</div>`;
  }
  if (totalLost > 0 || totalRec > 0 || c.finalLosses.heroesDead.length > 0) {
    html += `
      <div style="margin-top:14px;padding-top:10px;border-top:1px dashed rgba(255,80,64,.25)">
        <div style="color:var(--red);font-size:10px;letter-spacing:.18em;margin-bottom:8px">═══ BILAN ═══</div>
        <div style="font-size:11px;line-height:1.8">
          ${totalLost > 0 ? `<div><span style="color:var(--mut)">Vaisseaux détruits   :</span> <span style="color:var(--red)">${totalLost}</span></div>` : ''}
          ${totalRec > 0 ? `<div><span style="color:var(--mut)">Vaisseaux récupérables :</span> <span style="color:var(--amber)">${totalRec}</span></div>` : ''}
          ${(c.finalLosses.soldiers.garde + c.finalLosses.soldiers.lourd) > 0 ? `<div><span style="color:var(--mut)">Soldats tombés        :</span> <span style="color:var(--red)">${c.finalLosses.soldiers.garde + c.finalLosses.soldiers.lourd}</span></div>` : ''}
        </div>
        ${c.finalLosses.heroesDead.length > 0 ? `
          <div style="margin-top:10px;padding:8px;background:rgba(255,80,64,.06);border:1px solid rgba(255,80,64,.2);border-radius:4px;font-size:11px;line-height:1.7">
            <div style="color:var(--red);font-size:10px;letter-spacing:.14em;margin-bottom:4px;display:flex;align-items:center;gap:5px">${icon('skull', {size:11, color:'var(--red)'})} PERTES OFFICIELLES</div>
            ${c.finalLosses.heroesDead.map(h => `<div style="color:var(--red)">▸ ${h.name} (${h.roleLabel})</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  return html;
}

// ─── Cheats ───
function cheatReturnMission(fleetId) {
  const fleet = G.fleet.prepared.find(f => f.id === fleetId);
  if (!fleet || (fleet.status || 'prepared') !== 'in_mission') return;
  returnMission(fleet);
  refreshCurrentScreen();
}

function cheatReturnAllMissions() {
  let count = 0;

  // 1) Flottes militaires en mission (existant)
  for (const fleet of G.fleet.prepared) {
    if ((fleet.status || 'prepared') === 'in_mission' && !fleet.ambush && !fleet.garrison) {   // PIRATERIE_1210 : une embuscade se lève par « rentrer au port »
      returnMission(fleet);
      count++;
    }
  }

  // 2) Sondes en transit (chunk feedback 14/05)
  // Force l'arrivalAt à maintenant + tick → handleProbeReturn déclenchée
  if (Array.isArray(G.probeMissions)) {
    const now = Date.now();
    for (const m of G.probeMissions) {
      if (m.status === 'in_transit') {
        m.arrivalAt = now;
        count++;
      }
    }
    if (typeof tickProbes === 'function') tickProbes();
  }

  // 3) Tankers en transit (chunk feedback 14/05 + chunk 15/05 logistique)
  // Inclut les missions PICKUP et DROPOFF — toutes deux ont status='in_transit' au départ.
  // Les missions orbital_relay ne sont PAS touchées (elles sont volontaires, pas "en cours").
  // D5.3 (18/05) : inclure aussi 'exploring' (parti sur une piste) et 'returning' (route_run).
  if (Array.isArray(G.tankerMissions)) {
    const now = Date.now();
    for (const m of G.tankerMissions) {
      if (m.status === 'in_transit') {
        m.arrivalAt = now;
        count++;
      } else if (m.status === 'exploring') {
        // Force l'arrivée sur cible immédiate → tick le fera passer en returning,
        // puis on force aussi returnArrivalAt à maintenant pour qu'il rentre direct.
        m.arrivalAt = now;
        m.returnArrivalAt = now + 100; // léger délai pour passer par returning
        count++;
      } else if (m.status === 'returning') {
        m.returnArrivalAt = now;
        count++;
      }
    }
    if (typeof tickTankerMissions === 'function') {
      tickTankerMissions();
      // 2e tick après 200ms pour résoudre les missions exploring → returning → complete
      setTimeout(() => {
        if (typeof tickTankerMissions === 'function') tickTankerMissions();
        if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
      }, 200);
    }
  }

  if (count === 0) {
    toast('Aucune mission en cours');
  } else {
    toast(`${count} mission${count > 1 ? 's' : ''} retournée${count > 1 ? 's' : ''}`);
  }
  refreshCurrentScreen();
}

function cheatToggleInstantMission() {
  if (!G.cheats) G.cheats = {};
  G.cheats.instantMission = !G.cheats.instantMission;
  // Update label du bouton dans le panneau
  const btn = document.getElementById('cheat-mission-toggle-btn');
  if (btn) {
    btn.textContent = G.cheats.instantMission ? '⏱ Mission : 30s' : '⏱ Mission : 12h';
  }
  toast(`Durée mission : ${G.cheats.instantMission ? '30s (cheat)' : '12h (normal)'}`);
}

// ─── Chunk 15/05 : Cheats tanker logistique ───
// Force +24h d'attrition sur toutes les garnisons (test perte soldats)
function cheatGarrisonsAttrition24h() {
  if (!Array.isArray(G.garrisons) || G.garrisons.length === 0) {
    toast('Aucune garnison à attriter');
    return;
  }
  const before = G.garrisons.length;
  // Forcer lastTickAt 24h en arrière
  const now = Date.now();
  for (const g of G.garrisons) {
    g.lastTickAt = now - (24 * 60 * 60 * 1000);
  }
  // Déclencher le tick
  if (typeof tickGarrisonAttrition === 'function') tickGarrisonAttrition();
  const after = G.garrisons.length;
  const dead = before - after;
  toast(`Attrition +24h appliquée${dead > 0 ? ` · ${dead} garnison${dead > 1 ? 's' : ''} disparue${dead > 1 ? 's' : ''}` : ''}`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function cheatDumpGarrisons() {
  console.group('🛸 Dump G.garrisons (' + (G.garrisons || []).length + ' entries)');
  for (const g of (G.garrisons || [])) {
    console.log(g.id, '·', g.planetCoord, '·', g.planetType, '·', g.contactStatus,
                '·', JSON.stringify(g.soldiers), '·', JSON.stringify(g.resources));
  }
  console.groupEnd();
  toast(`${(G.garrisons || []).length} garnison${(G.garrisons || []).length !== 1 ? 's' : ''} dans la console`);
}

// ─── Cheats Commerce (Phase 1 Routes Secrètes — 16/05) ───
function cheatGiveCredits(amount) {
  G.credits = (G.credits || 0) + amount;
  toast(`+${fmt(amount)} CG · total ${fmt(G.credits)}`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function cheatDumpCommerce() {
  console.group('💰 Dump Commerce');
  console.log('Crédits :', G.credits || 0, 'CG');
  console.log('Cartes (' + (G.routeCards || []).length + ') :', G.routeCards);
  console.log('Routes (' + (G.routes || []).length + ') :', G.routes);
  console.groupEnd();
  toast(`Commerce : ${G.credits || 0} CG · ${(G.routeCards || []).length} cartes · ${(G.routes || []).length} routes`);
}

// Chunk B Phase 1 : spawn d'une carte de route (test/cheat)
function cheatSpawnRouteCard(forcedKind) {
  const sources = ['Torek "Deux Fois"', 'Le Père Cobalt', 'Balise illégale 12-Δ', 'Cargo dérivant', 'Trafiquant anonyme'];
  const source = sources[Math.floor(Math.random() * sources.length)];
  const card = generateRouteCard({
    kind: forcedKind || null,
    source,
  });
  addRouteCard(card);
  const kindLbl = ROUTE_CARD_KINDS[card.kind]?.label || card.kind;
  toast(`📜 Carte de route trouvée — ${kindLbl} (Q${card.quality})`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Chunk C Phase 1 : crée une route activée directement (skip card)
// Utile pour tester le rendu détaillé sans devoir trouver+activer une carte.
function cheatSpawnActivatedRoute(forcedMoodKey) {
  // On crée une fausse carte, on l'ajoute, on l'active, on récupère la route
  const sources = ['Torek "Deux Fois"', 'Le Père Cobalt', 'Balise illégale 12-Δ', 'Cargo dérivant'];
  const source = sources[Math.floor(Math.random() * sources.length)];
  // Si on force une humeur, on choisit un kind compatible
  let cardKind = 'clean';
  if (forcedMoodKey) {
    const kindByMood = { nerveuse: 'holed', grasse: 'clean', morte: 'dead', noire: 'singing', imperiale: 'clean' };
    cardKind = kindByMood[forcedMoodKey] || 'clean';
  }
  const card = generateRouteCard({ kind: cardKind, source });
  addRouteCard(card);

  // Si une humeur est forcée, override le tirage probabiliste
  if (forcedMoodKey && ROUTE_MOODS[forcedMoodKey]) {
    // Hack : remplacer temporairement la distribution pour ce kind
    const original = MOOD_PROBABILITIES_BY_CARD_KIND[cardKind];
    MOOD_PROBABILITIES_BY_CARD_KIND[cardKind] = { [forcedMoodKey]: 100 };
    const route = activateRouteCard(card.id);
    MOOD_PROBABILITIES_BY_CARD_KIND[cardKind] = original;
    return route;
  }
  return activateRouteCard(card.id);
}

function cheatSpawnAllMoodRoutes() {
  const moods = ['nerveuse', 'grasse', 'morte', 'noire', 'imperiale'];
  for (const m of moods) cheatSpawnActivatedRoute(m);
  toast(`✓ ${moods.length} routes spawnées (une par humeur)`);
}

// ─── Cheats Chunk D ───
function cheatGiveFuel(amount) {
  const cap = (typeof getFuelCap === 'function') ? getFuelCap() : 1000;
  const before = G.fuel || 0;
  G.fuel = Math.min(cap, before + amount);
  const added = G.fuel - before;
  if (added < amount) toast(`+${fmt(added)} carburant (silos pleins à ${fmt(cap)})`);
  else toast(`+${fmt(amount)} carburant · total ${fmt(G.fuel)}/${fmt(cap)}`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// 18/05 : construire une Raffinerie instantanément sur la première parcelle vide débloquée
function cheatSpawnRaffinerie() {
  if (!G.planet?.parcels) { toast('Pas de planète'); return; }
  // Cherche une parcelle "rocky" ou "resource" disponible (pas la capitale = idx 12)
  const idx = G.planet.parcels.findIndex(p =>
    (p.state === 'rocky' || p.state === 'resource') && p.idx !== 12
  );
  if (idx < 0) {
    toast('Aucune parcelle disponible — toutes occupées ou verrouillées');
    return;
  }
  const parcel = G.planet.parcels[idx];
  const b = BUILDINGS.raffinerie;
  // Pattern identique à cheatBuildBasic : on doit setter tous les champs sinon la map flippe
  parcel.state = 'built';
  parcel.building = 'raffinerie';
  parcel.n = (typeof customBuildingName === 'function') ? customBuildingName('raffinerie') : 'Raffinerie';
  parcel.sub = b.desc;
  parcel.lvl = 1;
  parcel.max = 3;
  parcel.prod = Object.entries(b.prod).map(([res, rate]) => [prodInfo(res).label.toLowerCase(), rateLbl(res, rate)]);
  // Brancher production dans G.res (sauf carburant qui passe par tickFuelProduction)
  for (const [res, rate] of Object.entries(b.prod)) {
    if (res === 'fuel') continue; // fuel géré séparément
    if (G.res[res] !== undefined) G.res[res].rate += rate;
  }
  if (!G.planet.families.has(b.family)) {
    G.planet.families.add(b.family);
    G.planet.level++;
  }
  toast(`🏭 Raffinerie T1 construite sur parcelle ${idx} · +8/h fuel · cap 2000`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  if (typeof renderPlanetMap === 'function') renderPlanetMap();
}

// 18/05 : force la rotation de saison marché (pour tester sans attendre 7j)
function cheatRotateMarketSeason() {
  // Cycle dans l'ordre des saisons définies
  const seasons = Object.keys(MARKET_SEASONS);
  const current = G.marketSeason?.key || 'normale';
  const idx = seasons.indexOf(current);
  const next = seasons[(idx + 1) % seasons.length];
  if (typeof initMarketSeason === 'function') initMarketSeason(next);
  const cfg = MARKET_SEASONS[next];
  toast(`📊 Saison forcée : ${cfg.label}`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function cheatBuildTanker(tier) {
  if (!G.fleet) G.fleet = {};
  if (!G.fleet.stationed) G.fleet.stationed = {};
  if (!G.fleet.stationed.tanker) G.fleet.stationed.tanker = { t1:0, t2:0, t3:0 };
  G.fleet.stationed.tanker['t' + tier] = (G.fleet.stationed.tanker['t' + tier] || 0) + 1;
  toast(`+1 tanker T${tier} stationné`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Forcer l'arrivée immédiate de la première mission route_run in_transit
function cheatDockTankerNow() {
  const m = (G.tankerMissions || []).find(x => x.kind === 'route_run' && x.status === 'in_transit');
  if (!m) {
    toast('Aucun tanker en route');
    return;
  }
  m.arrivalAt = Date.now();
  if (typeof tickTankerMissions === 'function') tickTankerMissions();
  toast(`🛸 ${m.tankerName} amarré`);
}

// D2 : Accélérer le tick humeur dock (1h = 2 secondes au lieu de 30s)
function cheatAccelerateDockMood() {
  G._dockMoodAccelerate = !G._dockMoodAccelerate;
  toast(G._dockMoodAccelerate ? '⏩ Humeur dock ACCÉLÉRÉE (1h/2s)' : '⏸ Humeur dock vitesse normale');
}

// D2 : Forcer la fin du séjour dock pour la première mission docked
function cheatEndDockStayNow() {
  const m = (G.tankerMissions || []).find(x => x.status === 'docked');
  if (!m) {
    toast('Aucun tanker au dock');
    return;
  }
  if (!m.dockStay) {
    toast('Le joueur n\'a pas choisi de durée — choisis-en une dans l\'écran dock');
    return;
  }
  // Forcer endsAt à maintenant et déclencher tick
  // Active aussi le mode instant pour que le retour ne prenne que 5s
  m.dockStay.endsAt = Date.now();
  G._instantMission = true;
  setTimeout(() => returnTankerFromDock(m.id), 100);
  toast(`⏩ Séjour ${m.tankerName} terminé · retour en 5s`);
}

// ─────────────────────────────────────────────────────────
// 🎯 SETUP TEST D2 : tout en 1 clic
// Cible : amener le joueur immédiatement à un état où il peut tester
// la boucle "tanker arrive au dock → choix durée → séjour → retour".
// Aucune action préalable nécessaire — un seul bouton et c'est prêt.
// ─────────────────────────────────────────────────────────
function cheatSetupForD2Test() {  // 1. Ressources généreuses
  G.credits = Math.max(G.credits || 0, 10000);
  G.fuel = Math.max(G.fuel || 0, 10000);
  for (const k of ['metal', 'energie', 'cristal']) {
    if (G.res?.[k]) G.res[k].v = Math.min(G.res[k].max, Math.max(G.res[k].v, 5000));
  }

  // 2. Tankers en stock (3 T1, 1 T2, 1 T3 pour test varié)
  if (!G.fleet) G.fleet = {};
  if (!G.fleet.stationed) G.fleet.stationed = {};
  if (!G.fleet.stationed.tanker) G.fleet.stationed.tanker = { t1:0, t2:0, t3:0 };
  G.fleet.stationed.tanker.t1 = Math.max(G.fleet.stationed.tanker.t1 || 0, 3);
  G.fleet.stationed.tanker.t2 = Math.max(G.fleet.stationed.tanker.t2 || 0, 1);
  G.fleet.stationed.tanker.t3 = Math.max(G.fleet.stationed.tanker.t3 || 0, 1);

  // 3. 5 routes (1 par humeur) si pas déjà là
  if (!Array.isArray(G.routes)) G.routes = [];
  if (G.routes.length < 5) {
    const moods = ['nerveuse', 'grasse', 'morte', 'noire', 'imperiale'];
    for (const m of moods) {
      if (!G.routes.some(r => r.moodKey === m)) {
        cheatSpawnActivatedRoute(m);
      }
    }
  }

  // 4. Envoyer un tanker sur la première route (Grasse de préférence pour cargo+50%)
  const targetRoute = G.routes.find(r => r.moodKey === 'grasse' && r.status !== 'in_use')
                  || G.routes.find(r => r.status !== 'in_use');
  if (targetRoute) {
    // Lancer avec un cargo de 200 unités (100 métal + 60 énergie + 40 cristal)
    const cargo = { metal: 100, energie: 60, cristal: 40 };
    const mission = launchTankerOnRoute(targetRoute.id, 't1', cargo);
    if (mission) {
      // 5. Forcer arrivée immédiate
      mission.arrivalAt = Date.now() - 1000;
      if (typeof tickTankerMissions === 'function') tickTankerMissions();
    }
  }

  toast('🎯 Setup D2 prêt — un tanker est amarré, ouvre le commerce');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ═══════════════════════════════════════════════════════════════
// SETUP MOYENNE PARTIE — Joueur niveau ~50 avec écosystème complet
// (19/05/2026 — pour tester l'ensemble du jeu sans grinder)
// ═══════════════════════════════════════════════════════════════
function cheatSetupMidGame() {
  // ─── 1. Ressources généreuses ───
  for (const k of ['metal', 'energie', 'cristal']) {
    if (G.res?.[k]) G.res[k].v = Math.min(G.res[k].max, 50000);
  }
  if (G.res?.biomass) G.res.biomass.v = 20000;
  if (G.res?.artefact) G.res.artefact.v = 10;
  G.credits = 50000;
  G.fuel = 8000;

  // ─── 2. Empire / Planète niveau moyen ───
  if (G.empire) G.empire.level = Math.max(G.empire.level || 0, 25);
  if (G.planet) G.planet.level = Math.max(G.planet.level || 0, 9);

  // ─── 3. Construire TOUS les bâtiments T1 ───
  // Débloquer parcelles si verrouillées
  for (const p of G.planet.parcels) {
    if (p.state === 'locked') {
      p.state = 'rocky';
      p.n = 'Plaine rocheuse';
      p.sub = 'Sol stable. Disponible pour terraformation.';
    }
  }
  const buildings = ['mine', 'centrale', 'labo', 'caserne', 'shipyard', 'turret', 'comptoir', 'raffinerie',
                     'silo_metal', 'silo_energie', 'silo_cristal'];
  for (const buildingKey of buildings) {
    const b = BUILDINGS[buildingKey];
    if (!b) continue;
    // Skip si déjà construit
    if (G.planet.parcels.some(p => p.building === buildingKey)) continue;
    const idx = G.planet.parcels.findIndex(p =>
      (p.state === 'rocky' || p.state === 'resource') && p.idx !== 12
    );
    if (idx < 0) continue;
    const parcel = G.planet.parcels[idx];
    parcel.state = 'built';
    parcel.building = buildingKey;
    parcel.n = (typeof customBuildingName === 'function') ? customBuildingName(buildingKey) : b.name;
    parcel.sub = b.desc;
    parcel.lvl = 1;
    parcel.max = 3;
    parcel.prod = Object.entries(b.prod).map(([res, rate]) => [
      prodInfo(res).label.toLowerCase(),
      rateLbl(res, rate)
    ]);
    for (const [res, rate] of Object.entries(b.prod)) {
      if (res === 'fuel') continue; // géré séparément
      if (G.res[res] !== undefined) G.res[res].rate += rate;
    }
    if (!G.planet.families.has(b.family)) {
      G.planet.families.add(b.family);
    }
  }

  // ─── 4. Flotte stationnée variée ───
  if (!G.fleet) G.fleet = {};
  if (!G.fleet.stationed) G.fleet.stationed = {};
  if (!G.fleet.stationed.tanker) G.fleet.stationed.tanker = { t1:0, t2:0, t3:0 };
  if (!G.fleet.stationed.fregate) G.fleet.stationed.fregate = { t1:0, t2:0, t3:0 };
  if (!G.fleet.stationed.cuirasse) G.fleet.stationed.cuirasse = { t1:0, t2:0, t3:0 };
  G.fleet.stationed.tanker.t1 = 5;
  G.fleet.stationed.tanker.t2 = 2;
  G.fleet.stationed.tanker.t3 = 1;
  G.fleet.stationed.fregate.t1 = 8;
  G.fleet.stationed.fregate.t2 = 3;
  G.fleet.stationed.cuirasse.t1 = 2;
  G.fleet.stationed.cuirasse.t2 = 1;

  // ─── 5. Unités défensives ───
  if (G.defense?.units) {
    if (G.defense.units.garde) G.defense.units.garde.qty = 50;
    if (G.defense.units.lourd) G.defense.units.lourd.qty = 20;
    if (G.defense.units.tourelle) G.defense.units.tourelle.qty = 10;
  }

  // ─── 6. Sondes : débloquer et stocker ───
  if (G.probe) {
    G.probe.exists = true;
    G.probe.state = 'ready';
    G.probe.rangeIdx = 3; // longue portée
  }
  // Stockage probes par tier (cf. cheatGrantAllProbeTiers)
  if (!G.probeStock) G.probeStock = {};
  G.probeStock.radar = (G.probeStock.radar || 0) + 5;
  G.probeStock.light = (G.probeStock.light || 0) + 1;  // quota max
  G.probeStock.medium = (G.probeStock.medium || 0) + 2; // quota max
  G.probeStock.stealth = (G.probeStock.stealth || 0) + 1;

  // ─── 7. Routes activées (5 humeurs) ───
  if (!Array.isArray(G.routes)) G.routes = [];
  if (G.routes.length < 5) {
    const moods = ['nerveuse', 'grasse', 'morte', 'noire', 'imperiale'];
    for (const m of moods) {
      if (!G.routes.some(r => r.moodKey === m)) {
        if (typeof cheatSpawnActivatedRoute === 'function') cheatSpawnActivatedRoute(m);
      }
    }
  }

  // ─── 8. Quelques cartes de route non-activées dans la main ───
  if (!Array.isArray(G.routeCards)) G.routeCards = [];
  if (G.routeCards.length < 3 && typeof generateRouteCard === 'function') {
    for (let i = 0; i < 3; i++) {
      const card = generateRouteCard();
      G.routeCards.push(card);
    }
  }

  // ─── 9. Quelques rencontres dans le Carnet ───
  // Pavillons (3 capitaines rencontrés)
  if (!G.encounteredPavillons) G.encounteredPavillons = {};
  if (Object.keys(G.encounteredPavillons).length === 0 && Array.isArray(NPC_CAPTAINS)) {
    const sample = NPC_CAPTAINS.slice(0, 3);
    for (const c of sample) {
      G.encounteredPavillons[c.name] = {
        captain: c.name,
        captainType: c.type,
        bio: c.bio || '',
        firstMet: Date.now() - 86400000 * 3,
        lastSeen: Date.now() - 3600000,
        interactions: [],
        docksMet: [{ id: 'dock-test', name: 'Comptoir de Sigma-3' }],
      };
    }
  }

  // Rumeurs (3 enregistrées)
  if (!Array.isArray(G.rumorJournal)) G.rumorJournal = [];
  if (G.rumorJournal.length === 0) {
    G.rumorJournal.push(
      { kind: 'lore', text: 'On dit que les Erebusiens ont retrouvé une route impériale oubliée près de l\'amas de Vérath.', from: 'Marchand Drasco', at: Date.now() - 86400000 },
      { kind: 'indice', text: 'Un capitaine ivre prétend avoir vu une épave non-pillée dans le secteur K-3.', from: 'Pilote anonyme', at: Date.now() - 43200000 },
      { kind: 'lore', text: 'Korr-Vask était un nom de pirate, pas une route. Mais on a fini par confondre les deux.', from: 'Vieille femme du quai', at: Date.now() - 7200000 },
    );
  }

  // Pistes ouvertes (2 dans le Carnet)
  if (!Array.isArray(G.openLeads)) G.openLeads = [];
  if (G.openLeads.length === 0 && typeof LEAD_TYPES !== 'undefined') {
    G.openLeads.push({
      id: 'lead-' + Date.now() + '-1',
      type: 'wreck',
      title: 'Épave de cargo abandonnée',
      description: 'Un capitaine a mentionné une carcasse de cargo intacte près de K-3-4421.',
      coords: 'A-K-3-4421',
      source: { kind: 'rumor', captain: 'Pilote anonyme' },
      isLie: false,
      createdAt: Date.now() - 3600000,
      expiresAt: Date.now() + 6 * 86400000,
      status: 'open',
    });
    G.openLeads.push({
      id: 'lead-' + Date.now() + '-2',
      type: 'dock_coords',
      title: 'Port franc dissimulé',
      description: 'Selon Drasco, un port-franc échangerait des cristaux contre des cartes anciennes.',
      coords: 'A-D-9-2156',
      source: { kind: 'intel', captain: 'Marchand Drasco' },
      isLie: false,
      createdAt: Date.now() - 1800000,
      expiresAt: Date.now() + 6 * 86400000,
      status: 'open',
    });
  }

  // Infos achetées
  if (!Array.isArray(G.purchasedIntel)) G.purchasedIntel = [];
  if (G.purchasedIntel.length === 0) {
    G.purchasedIntel.push({
      kind: 'route_hint',
      text: 'La route impériale oubliée passe par le système Vérath. Visible avec une sonde Moyenne.',
      from: 'Marchand Drasco',
      at: Date.now() - 7200000,
      cost: 250,
    });
  }

  // ─── 10. Signatures dans le système (3 à résoudre + 1 verrouillée) ───
  if (typeof cheatSeedSignatures === 'function' && (!G.signatures || G.signatures.length === 0)) {
    cheatSeedSignatures();
  }

  // ─── 11. Planètes test (1 habitable libre + 1 joueur ennemi) ───
  if (typeof cheatSpawnTestPlanets === 'function') {
    cheatSpawnTestPlanets();
  }

  // ─── 12. Cartographie débloquée (sismique) ───
  if (typeof cheatSetCarto === 'function' && getCartoLevel() === 'local') {
    cheatSetCarto('sismic');
  }

  // ─── 13. Onboarding skip (le joueur sait déjà jouer en mid-game) ───
  if (!G.onboarding) G.onboarding = {};
  G.onboarding.completed = true;
  G.onboarding.dismissed = false;
  G.onboarding.step = 5;

  // ─── 14. Marquer la saison de marché ───
  if (typeof initMarketSeason === 'function' && !G.marketSeason) {
    initMarketSeason('normale');
  }

  toast('🎮 Setup moyenne partie prêt — tout est débloqué pour tester');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  if (typeof renderPlanetMap === 'function') renderPlanetMap();
  if (typeof renderDashboard === 'function') renderDashboard();
}

function cheatSimulateTankerReturnWithCard() {
  // Choisir au hasard une des 2 rencontres dropsRouteCard
  const candidates = ENCOUNTER_TABLE.filter(e => e.category === 'route_card');
  if (candidates.length === 0) {
    toast('Aucune rencontre route_card disponible');
    return;
  }
  const enc = candidates[Math.floor(Math.random() * candidates.length)];
  const tankerName = 'Σ-' + Math.floor(Math.random() * 99 + 10);

  // Générer la carte
  const card = generateRouteCard({ source: enc.routeCardSource });
  addRouteCard(card);

  // Construire un loot fictif minimal (cargo voie directe sans cible)
  const loot = {
    resources: { metal: Math.floor(40 + Math.random() * 100), energie: Math.floor(20 + Math.random() * 50) },
    routeCard: card,
  };

  // Construire la narrative façon getEncounterNarrative
  const crew = (typeof pickSpaceWorkerName === 'function') ? pickSpaceWorkerName() : 'l\'équipage';
  const encNarrative = (typeof getEncounterNarrative === 'function')
    ? getEncounterNarrative(enc.id, crew, 'D-9-2848')
    : 'L\'équipage a fait une rencontre inattendue.';
  const narrative = `**Trajet en voie directe — ${enc.title}.**\n\n*Voie directe · trajet ${Math.floor(2 + Math.random() * 6)}h · rencontre : carte de route trouvée.*\n\n${encNarrative}\n\n---\n\nLe tanker est rentré à bon port. Cargo livré. Carte archivée dans la Maison de Commerce.`;

  // Pousser le rapport
  if (!Array.isArray(G.tankerReports)) G.tankerReports = [];
  const report = {
    id: 'tr-cheat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    tankerName,
    targetType: 'cargo',
    targetLabel: 'Cargo flottant',
    targetCoords: 'D-9-2848',
    createdAt: Date.now(),
    read: false,
    isLost: false,
    loot,
    narrative,
    sourceProbeReportId: null,
    sourceSignatureId: null,
  };
  G.tankerReports.unshift(report);
  if (G.tankerReports.length > 50) G.tankerReports.length = 50;

  const kindLbl = ROUTE_CARD_KINDS[card.kind]?.label || card.kind;
  toast(`🚛 ${tankerName} revenu — ${enc.title} · carte ${kindLbl} (Q${card.quality})`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Force la prochaine rencontre voie directe à être une rencontre route_card (one-shot)
function cheatForceNextRouteCardEncounter() {
  G._forceNextRouteCardEncounter = true;
  toast('🎯 Prochain tanker en voie directe → carte de route garantie');
}

// Fix 18/05 : pour les missions tanker DÉJÀ EN TRANSIT (créées avant le fix),
// injecter une encounter route_card. Utile quand des tankers ont été envoyés avant
// que applyRouteToMission soit appelée correctement.
function cheatInjectRouteCardInActiveTankers() {
  if (!Array.isArray(G.tankerMissions)) {
    toast('Aucune mission tanker active');
    return;
  }
  const active = G.tankerMissions.filter(m => m.status === 'in_transit');
  if (active.length === 0) {
    toast('Aucune mission tanker en transit');
    return;
  }
  const candidates = ENCOUNTER_TABLE.filter(e => e.category === 'route_card');
  if (candidates.length === 0) return;
  let count = 0;
  for (const m of active) {
    if (m.kind === 'dropoff') continue; // pas pour les missions dropoff
    const enc = candidates[Math.floor(Math.random() * candidates.length)];
    m.routeType = 'direct';
    m.encounter = {
      id: enc.id,
      category: enc.category,
      title: enc.title,
      lootBonusFactor: enc.lootBonusFactor || 1.0,
      dropsRouteCard: true,
      routeCardSource: enc.routeCardSource || null,
    };
    count++;
  }
  toast(`💉 ${count} mission${count > 1 ? 's' : ''} tanker injectée${count > 1 ? 's' : ''} avec rencontre carte`);
}

// Diagnostic : voir l'état de TOUTES les missions tanker (transit / returned)
function cheatDumpTankerMissions() {
  console.group('🛸 Dump G.tankerMissions');
  for (const m of (G.tankerMissions || [])) {
    console.log(
      m.tankerName,
      '·', m.status,
      '·', m.targetLabel,
      '·', m.targetCoords,
      '· routeType:', m.routeType || '(none)',
      '· encounter:', m.encounter ? `${m.encounter.id} (${m.encounter.category})` : '(none)',
    );
  }
  console.groupEnd();
  toast(`${(G.tankerMissions || []).length} mission${(G.tankerMissions || []).length !== 1 ? 's' : ''} dans la console`);
}

// PASSE 3.5-narrative : Force la génération d'un rapport sur chaque mine + centrale construite
function cheatGenerateAmbient() {
  if (!G.planet?.parcels) {
    toast('Pas de planète chargée');
    return;
  }
  let generated = 0;
  for (const parcel of G.planet.parcels) {
    if (parcel?.building && _getAmbientFamily(parcel.building)) {
      const report = maybeGenerateAmbientReport(parcel, true); // force=true
      if (report) generated++;
    }
  }
  if (generated === 0) {
    toast('Aucun bâtiment éligible (construis une Mine ou une Centrale)');
  } else {
    toast(`${generated} rapport${generated > 1 ? 's' : ''} ambient généré${generated > 1 ? 's' : ''}`);
  }
  refreshCurrentScreen();
}

// ─── PASSE 4-sondes-v1.1 : Cheats sondes refondus ───

// Donne X sondes de chaque tier (debug)
function cheatGrantAllProbeTiers() {
  if (!Array.isArray(G.probesPool)) G.probesPool = [];
  const now = Date.now();
  // +3 radar, +1 légère, +2 moyennes, +7 furtives
  for (let i = 0; i < 3; i++) G.probesPool.push({ id: 'p-cheat-r-'+now+'-'+i, tier: 'radar',   state: 'ready', builtAt: now });
  for (let i = 0; i < 1; i++) G.probesPool.push({ id: 'p-cheat-l-'+now+'-'+i, tier: 'light',   state: 'ready', builtAt: now });
  for (let i = 0; i < 2; i++) G.probesPool.push({ id: 'p-cheat-m-'+now+'-'+i, tier: 'medium',  state: 'ready', builtAt: now });
  for (let i = 0; i < 7; i++) G.probesPool.push({ id: 'p-cheat-s-'+now+'-'+i, tier: 'stealth', state: 'ready', builtAt: now });
  toast('+3 radar, +1 légère, +2 moyennes, +7 furtives');
  refreshCurrentScreen();
}

// Lance une sonde radar vers une coord aléatoire et la fait revenir immédiatement
function cheatProbeRadarInstant() {
  // Garantir au moins 1 radar
  let radar = (G.probesPool || []).find(p => p.tier === 'radar' && p.state === 'ready');
  if (!radar) {
    G.probesPool = G.probesPool || [];
    radar = { id: 'p-cheat-r-' + Date.now(), tier: 'radar', state: 'ready', builtAt: Date.now() };
    G.probesPool.push(radar);
  }
  launchProbe('radar', null, 'local', true);
}

// Lance une sonde légère vers C-7777 (test secret trou noir)
function cheatProbeBlackHole(tier) {
  tier = tier || 'light';
  // Garantir au moins 1 sonde du tier demandé
  let probe = (G.probesPool || []).find(p => p.tier === tier && p.state === 'ready');
  if (!probe) {
    G.probesPool = G.probesPool || [];
    probe = { id: 'p-cheat-'+tier+'-' + Date.now(), tier, state: 'ready', builtAt: Date.now() };
    G.probesPool.push(probe);
  }
  // Adresse adaptée au tier (radar accepte secteur, légère accepte système, moyenne/furtive seulement planète)
  const targetByTier = {
    radar: 'C',          // secteur entier — radar balaye
    light: 'C-7777',     // système entier — légère explore
    medium: 'C-7777-1',  // planète précise — moyenne cible
    stealth: 'C-7777-1', // idem
  };
  const target = targetByTier[tier] || 'C-7777';
  launchProbe(tier, target, 'local', true);
}

// Force la livraison de tous les rapports retardés (debug : pas attendre 24h)
function cheatDeliverDelayedReports() {
  // Diagnostic : compter les rapports en attente AVANT
  let pendingCount = 0;
  const secrets = G.secretsState || {};
  console.log('═══ DELIVER DELAYED REPORTS ═══');
  console.log(`G.secretsState contient ${Object.keys(secrets).length} secret(s)`);
  for (const [secretId, state] of Object.entries(secrets)) {
    const pending = (state.pendingDelayedReports || []).length;
    pendingCount += pending;
    console.log(`  · ${secretId} → currentStage=${state.currentStage}, pendingDelayedReports=${pending}`);
    if (pending > 0) {
      state.pendingDelayedReports.forEach((r, i) => {
        const remainingMs = r.deliverAt - Date.now();
        const remainingHours = Math.floor(remainingMs / 3600000);
        const remainingMin = Math.floor((remainingMs % 3600000) / 60000);
        console.log(`    [${i}] deliverAt dans ${remainingHours}h ${remainingMin}min → coords=${r.targetCoords}`);
      });
    }
  }

  if (pendingCount === 0) {
    toast('Aucun rapport en attente — lance une sonde légère vers C-7777 d\'abord');
    console.log('→ Rien à livrer. Relance d\'abord une sonde légère vers C-7777.');
    return;
  }

  // Forcer la livraison
  const n = debugAccelerateDelayedReports();
  console.log(`→ ${n} rapport(s) livré(s)`);
  console.log(`  G.probeReports contient maintenant ${G.probeReports.length} rapport(s) au total`);

  // Re-render selon l'écran actif
  if (typeof setProspectTab === 'function' && G.prospectTab === 'rapports') {
    renderProspectRapports();
  }
  if (typeof updateProspectRapportsBadge === 'function') {
    updateProspectRapportsBadge();
  }
  if (typeof refreshCurrentScreen === 'function') {
    refreshCurrentScreen();
  }

  toast(`${n} rapport${n > 1 ? 's' : ''} retardé${n > 1 ? 's' : ''} livré${n > 1 ? 's' : ''} — va dans Rapports`);
}

// Affiche un récap des rapports dans la console (debug)
function cheatDumpProbeReports() {
  const reports = G.probeReports || [];
  console.log('═══ PROBE REPORTS ═══');
  console.log(`Total : ${reports.length} rapport(s)`);
  reports.slice(0, 10).forEach((r, i) => {
    console.log(`\n[${i}] ${r.probeName} · tier=${r.tier} · coords=${r.targetCoords || 'random'}`);
    if (r.isSecret) console.log(`    ${icon('moon', {size:12})} SECRET (${r.secretId}, stage ${r.secretStage})`);
    if (r.silent) console.log(`    🔇 SILENT RADAR`);
    if (r.radarSignal) console.log(`    ${icon('satellite', {size:12})} RADAR : ${r.radarSignal.description}`);
    if (r.narrativeOverride) console.log(`    📖 NARRATIVE: ${r.narrativeOverride.slice(0, 80)}...`);
    if (r.targets?.length) console.log(`    ${icon('crosshair', {size:12})} ${r.targets.length} cible(s)`);
  });
  toast(`📋 ${reports.length} rapport(s) dump dans la console`);
}

// ─── CHEATS knownTargets (passe 4.2 — univers mouvant) ───
// Génère 5 cibles fake dispersées dans plusieurs secteurs/systèmes pour
// tester la fiche sonde et l'écran Univers sans devoir lancer 5 sondes.
function cheatSeedKnownTargets() {
  if (!G.knownTargets) G.knownTargets = {};
  const fakes = [
    { coord: 'A-C-2848-47', type: 'asteroides', label: 'Champ d\'astéroïdes carbonés', icon: '🪨',
      lootEstimate: { resource: 'metal', min: 140, max: 260 } },
    { coord: 'A-D-3471-58', type: 'epave',      label: 'Épave d\'astronef léger',       icon: 'rocket',
      lootEstimate: null },
    { coord: 'A-E-9988-72', type: 'asteroides', label: 'Champ d\'astéroïdes (riche)',   icon: '🪨',
      lootEstimate: { resource: 'metal', min: 280, max: 520 } },
    { coord: 'A-B-1244-23', type: 'debris',     label: 'Débris de combat ancien',       icon: 'sword',
      lootEstimate: null },
    { coord: 'A-F-5505-91', type: 'cristal',    label: 'Veine cristalline isolée',      icon: 'gem',
      lootEstimate: { resource: 'cristal', min: 35, max: 75 } },
  ];
  const now = Date.now();
  for (const f of fakes) {
    G.knownTargets[f.coord] = {
      type: f.type, label: f.label, icon: f.icon,
      cosmicAddress: f.coord,
      lootEstimate: f.lootEstimate,
      universe: 'mouvant',
      discoveredAt: now - Math.floor(Math.random() * 3 * 24 * 60 * 60 * 1000), // 0-3j d'ancienneté
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    };
  }
  if (typeof saveKnownTargets === 'function') saveKnownTargets();
  toast(`${fakes.length} cibles fake générées`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function cheatDumpKnownTargets() {
  const targets = G.knownTargets || {};
  const entries = Object.entries(targets);
  console.log('═══ KNOWN TARGETS ═══');
  console.log(`Total : ${entries.length} cible(s) connue(s)`);
  entries.forEach(([coord, t]) => {
    const ageHrs = Math.round((Date.now() - (t.discoveredAt || Date.now())) / (60 * 60 * 1000));
    const ttlDays = Math.max(0, Math.round(((t.expiresAt || 0) - Date.now()) / (24 * 60 * 60 * 1000)));
    console.log(`  ${coord} · ${t.icon || '◆'} ${t.label}`);
    console.log(`    découvert il y a ${ageHrs}h · expire dans ${ttlDays}j · univers=${t.universe || '?'}`);
    if (t.lootEstimate) console.log(`    loot ~${t.lootEstimate.min}-${t.lootEstimate.max} ${t.lootEstimate.resource}`);
  });
  toast(`${entries.length} cibles dump dans la console`);
}

function cheatClearKnownTargets() {
  G.knownTargets = {};
  try { localStorage.removeItem('starbyte_known_targets'); } catch(e) {}
  toast('knownTargets vidé');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ═══════════════════════════════════════════════════════════════
// CHEATS DEV — Planètes habitables + planètes joueurs (test Carnet/Tanker)
// ═══════════════════════════════════════════════════════════════
// Ces cheats servent à tester rapidement :
// - L'envoi de tanker vers une planète habitable libre (dropoff garnison)
// - Le bouton "Préparer un raid" depuis le Carnet (planète occupée par joueur)
// - Les Routes Duales (voie balisée vs voie directe) à travers ces deux flux

// Helper : ajoute une planète au G.knownSystems avec les propriétés voulues
function _cheatSpawnPlanet(coord, opts) {
  // coord format : "A-B-1234-56" (cluster-sector-system-planet)
  const parts = coord.split('-');
  if (parts.length !== 4) {
    toast('Coord invalide : ' + coord);
    return null;
  }
  const sysKey = `${parts[0]}-${parts[1]}-${parts[2]}`;

  // Créer le système si nécessaire
  if (!G.knownSystems[sysKey]) {
    G.knownSystems[sysKey] = {
      cluster: parts[0],
      sector: parts[1],
      system: parts[2],
      planets: [],
      discoveredAt: Date.now(),
      isMine: false,
    };
  }

  // Si la planète existe déjà, on la met à jour
  const existing = G.knownSystems[sysKey].planets.find(p => p.coord === coord);
  if (existing) {
    Object.assign(existing, opts);
    return existing;
  }

  // Sinon on crée
  const newPlanet = {
    coord,
    cluster: parts[0],
    sector: parts[1],
    system: parts[2],
    index: parseInt(parts[3], 10),
    name: opts.name || 'Monde inexploré',
    type: opts.type || 'habitable',
    desc: opts.desc || 'Atmosphère respirable détectée',
    playerName: opts.playerName || null,
    playerLevel: opts.playerLevel || null,
    report: opts.report || null,
    isMine: false,
  };
  G.knownSystems[sysKey].planets.push(newPlanet);
  return newPlanet;
}

// Crée une planète habitable LIBRE (colonisable, target pour tanker dropoff)
// PATCH_1510_CHEAT_CROWN — tester la Couronne sans remonter la ligne balise après balise
function _cheatCrownLine(id) {
  if (!window.SBLines) return null;
  const net = SBLines.network();
  const port = Object.values(net.ports).find(x => x.dockId === (id || SBLines.CROWN_DOCK_ID));
  return port ? { port, line: net.byId[port.lines[0]] } : null;
}
function cheatCrownRoute(silent, id) {
  const c = _cheatCrownLine(id);
  if (!c) { toast('Lieu introuvable'); return null; }
  if (!Array.isArray(G.spottedLegs)) G.spottedLegs = [];
  const ch = c.line.chain;
  ch.forEach((k, i) => {
    const to = i < ch.length - 1 ? ch[i + 1] : c.port.sys;
    if (!G.spottedLegs.some(l => l.npc && l.from === k && l.to === to))
      G.spottedLegs.unshift({ id: 'cheat-' + c.line.id + '-' + i, lineId: c.line.id, from: k, to, pseudo: c.line.kind.label, at: Date.now(), npc: true, cargo: 'lourd' });
  });
  if (!G.mapSeen) G.mapSeen = {};
  for (const k of ch.concat([c.port.sys])) G.mapSeen[k] = Date.now();
  SBLines.discoverPort(c.port.sys, Date.now());
  const route = SBLines.ensureRoute(c.port.sys);
  if (!G.fleet.stationed.tanker) G.fleet.stationed.tanker = { t1: 0, t2: 0, t3: 0 };
  if (!(G.fleet.stationed.tanker.t1 > 0)) G.fleet.stationed.tanker.t1 = 2;
  if (typeof saveGame === 'function') saveGame();
  if (!silent) {
    toast(`🗺 Route révélée : ${route ? route.name : ''} · ${ch.length} jalons`);
    if (typeof openSystemOnMap === 'function') { openSystemOnMap(c.port.sys); if (route && window.SBMap) setTimeout(() => SBMap.selectRoute(route.id), 900); }
  }
  return route;
}
function cheatCrownDock(id) {
  const route = cheatCrownRoute(true, id);
  if (!route) return;
  // un vrai départ par la ligne, arrivé tout de suite : l'amarrage se fait par le jeu lui-même
  const m = launchTankerOnRoute(route.id, 't1', { metal: 0, energie: 0, cristal: 0 });
  if (!m) { toast('Le tanker n\'a pas pu partir'); return; }
  m.arrivalAt = Date.now() - 1000;
  { const _U = typeof stationUI === 'function' ? stationUI(id) : null; if (_U && _U.seen) G[_U.seen] = 0; else G.crownSeen = 0; }   // PATCH_2210_STATIONS6
  if (typeof tickTankerMissions === 'function') tickTankerMissions();
  if (typeof saveGame === 'function') saveGame();
  if (m.status === 'docked') { toggleCheatPanel(); openDockFromFleet(m.id); }
  else toast(`Tanker parti vers la Couronne (${m.status}) : ouvre-le depuis le Commerce`);
}
function cheatCrownReplay() {
  G.crownSeen = 0;
  if (typeof saveGame === 'function') saveGame();
  toast('La prochaine ouverture du dock de la Couronne rejoue l\'arrivée');
}
function cheatPlanetAtRouteEnds() {
  const list = (window.SBLines ? SBLines.openedRoutes() : []).filter(o => !o.fake);
  let n = 0;
  for (const o of list) {
    const sys = G.knownSystems && G.knownSystems[o.to];
    if (sys && (sys.planets || []).length) continue;
    const coord = o.to + '-' + String(10 + (n * 17) % 80).padStart(2, '0');
    _cheatSpawnPlanet(coord, { name: 'Avant-poste ' + o.to.split('-')[2], type: 'habitable', desc: 'Planète de test au bout d\'une route.', playerName: null, playerLevel: null,
      report: 'Planète de test posée au bout de la route pour essayer le trajet des tankers.' });
    n++;
  }
  toast(n ? `🌍 ${n} planète${n > 1 ? 's' : ''} posée${n > 1 ? 's' : ''} au bout de tes routes` : 'Tes routes mènent déjà quelque part');
  if (typeof saveGame === 'function') saveGame();
  if (window.SBMap && SBMap.render) { try { SBMap.render(); } catch (e) {} }
}

function cheatSpawnHabitablePlanet() {
  // Utilise une coord facilement reconnaissable
  const coord = 'A-D-7777-42';
  const p = _cheatSpawnPlanet(coord, {
    name: 'Auris-Vert',
    type: 'habitable',
    desc: 'Atmosphère stable, biosphère active. Aucune signature de civilisation.',
    playerName: null,
    playerLevel: null,
    report: 'Sondage long format effectué. Planète tempérée, eau liquide, biomasse modeste. Aucune trace d\'activité technologique. Climat clément. Conditions idéales pour terraformation légère ou dépôt de garnison.',
  });
  toast('Planète habitable libre créée : Auris-Vert · ' + coord);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return p;
}

// Crée une planète habitable OCCUPÉE par un joueur (target pour raid)
function cheatSpawnPlayerPlanet() {
  const coord = 'A-E-3456-71';
  const p = _cheatSpawnPlanet(coord, {
    name: 'Korthos-Prime',
    type: 'habitable',
    desc: 'Planète habitable occupée. Activité technologique intense détectée.',
    playerName: 'BERSEK89',
    playerLevel: 740,
    report: 'Sondage effectué. Signature joueur confirmée : BERSEK89, niveau planète estimé ~740. Défenses orbitales modérées. Réputation : marchand agressif, 7 raids documentés dans le secteur. Approche déconseillée sans flotte offensive.',
  });
  toast('Planète joueur créée : Korthos-Prime (BERSEK89) · ' + coord);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
  return p;
}

// Spawne les DEUX d'un coup (raccourci pratique pour test complet)
function cheatSpawnTestPlanets() {
  cheatSpawnHabitablePlanet();
  cheatSpawnPlayerPlanet();
  toast('2 planètes de test créées · Va dans Carnet');
}

// Nettoie les planètes de test spawned
function cheatClearTestPlanets() {
  const testCoords = ['A-D-7777-42', 'A-E-3456-71'];
  let cleaned = 0;
  for (const coord of testCoords) {
    const parts = coord.split('-');
    const sysKey = `${parts[0]}-${parts[1]}-${parts[2]}`;
    if (G.knownSystems[sysKey]) {
      const before = G.knownSystems[sysKey].planets.length;
      G.knownSystems[sysKey].planets = G.knownSystems[sysKey].planets.filter(p => p.coord !== coord);
      cleaned += before - G.knownSystems[sysKey].planets.length;
      // Supprimer le système si plus de planètes
      if (G.knownSystems[sysKey].planets.length === 0) {
        delete G.knownSystems[sysKey];
      }
    }
  }
  toast(cleaned + ' planète(s) de test supprimée(s)');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Cheat dev : faire revenir immédiatement tous les tankers en mission
function cheatSkipTankerMissions() {
  const active = (G.tankerMissions || []).filter(m => m.status === 'in_transit');
  if (active.length === 0) {
    toast('Aucune mission tanker en cours');
    return;
  }
  for (const m of active) {
    // Forcer arrivalAt à maintenant — le prochain tickTankerMissions les fera revenir
    m.arrivalAt = Date.now() - 100;
  }
  // Déclencher manuellement le retour de tous
  if (typeof tickTankerMissions === 'function') tickTankerMissions();
  toast(`⏩ ${active.length} tanker(s) revenu(s)`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Variante ciblée : ramène UN tanker spécifique (utilisé depuis la card mission inline).
// Cf. Adrien 14/05 : "mettre un bouton chat pour le retour".
function cheatReturnThisTanker(missionId) {
  const mission = (G.tankerMissions || []).find(m => m.id === missionId && m.status === 'in_transit');
  if (!mission) {
    toast('Mission introuvable ou déjà revenue');
    return;
  }
  mission.arrivalAt = Date.now() - 100;
  if (typeof tickTankerMissions === 'function') tickTankerMissions();
  toast(`⏩ ${mission.tankerName} revenu`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── CHEATS Signatures (passe 5.0) ───
// Cf. starbyte_gdd_v1/17_signatures_resolution.md
function cheatSeedSignatures() {
  if (typeof createSignature !== 'function') {
    toast('createSignature indisponible');
    return;
  }
  const myCoord = G.planet?.coordString || 'A-K-6184-30';
  // Extraire l'adresse système (W-X-YYYY) depuis MY_ADDRESS
  const sys = (typeof MY_ADDRESS !== 'undefined' && MY_ADDRESS)
    ? `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}`
    : 'A-K-6184';
  let created = 0;
  for (let i = 0; i < 3; i++) {
    const sig = createSignature(sys, 'Sonde-DEV-Cheat');
    if (sig) created++;
  }
  toast(`${created} signature(s) générée(s) dans ${sys}`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function cheatDumpSignatures() {
  console.group('🔬 Dump G.signatures');
  const sigs = G.signatures || {};
  console.log(`G.signatures contient ${Object.keys(sigs).length} signature(s)`);
  for (const [id, sig] of Object.entries(sigs)) {
    console.log(`${id}:`, sig);
  }
  console.groupEnd();
  toast('Dump signatures en console (F12)');
}

function cheatClearSignatures() {
  G.signatures = {};
  try { localStorage.removeItem('starbyte_signatures'); } catch(e) {}
  toast('Signatures vidées');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// PASSE 5.2 — Cheat : résoudre une signature directement en fixed (à verrouiller)
// Permet de tester la Moyenne sans attendre une Légère (30 min)
function cheatResolveSignatureToFixed() {
  if (!G.signatures) {
    toast('Aucune signature');
    return;
  }
  // Trouver une signature non résolue
  const unresolved = Object.values(G.signatures).find(s => !s.resolved);
  if (!unresolved) {
    toast('Aucune signature non résolue à transformer');
    return;
  }
  // Forcer en fixed (cold_mass + habitable par défaut, ou selon type)
  const fixedClassMap = {
    cold_mass:     'dead_world',
    gas_envelope:  'gas_giant',
    heat_point:    'habitable',
    metallic_echo: 'habitable',  // override pour tester
    mineral_dense: 'dead_world',
    unstable_field:'unknown',
  };
  const fixedClass = fixedClassMap[unresolved.type] || 'habitable';
  if (typeof resolveSignatureToFixed === 'function') {
    resolveSignatureToFixed(unresolved.id, null, fixedClass);
  }
  toast(`${unresolved.id} résolue en ${fixedClass} (à verrouiller)`);
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── CHEAT Passe 5.4 — Réinitialiser la connaissance ───
// Simule un nouveau démarrage : on efface knownSystems, knownTargets,
// signatures, et on relance initKnownUniverse pour reposer l'amorce.
// Permet de tester l'expérience "premier jour" sans tout perdre par ailleurs.
async function cheatResetKnowledge() {
  const ok = await sbConfirmDanger(
    'Réinitialiser la connaissance',
    `Ceci efface :<br>· Tous les systèmes connus (sauf le tien)<br>· Toutes les signatures<br>· Toutes les cibles mouvantes<br>· La résolution de tous les systèmes<br><br><em>Ton save (ressources, bâtiments, sondes) reste intact.</em>`,
    'Réinitialiser'
  );
  if (!ok) return;
  // Reset des 4 stores liés à la connaissance
  G.knownSystems = {};
  G.knownTargets = {};
  G.signatures = {};
  G.systemResolution = {};
  try {
    localStorage.removeItem('starbyte_known_targets');
    localStorage.removeItem('starbyte_signatures');
    localStorage.removeItem('starbyte_system_resolution');
  } catch(e) {}

  // Re-init : pose KERATH-VII + 1 signature d'amorce + résolution initiale
  if (typeof initKnownUniverse === 'function') initKnownUniverse();
  if (typeof seedStarterSignature === 'function') seedStarterSignature();
  if (typeof seedInitialSystemResolution === 'function') seedInitialSystemResolution();

  toast('Connaissance réinitialisée');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// ─── CHEATS Cartographie (passe 4.3 — portée des sondes) ───
// Cf. starbyte_gdd_v1/13_sondes_exploration.md (RÈGLES DE PORTÉE)
// Débloque CUMULATIVEMENT : sismic ⊂ interstellar ⊂ galactic ⊂ interCluster
// (un skill plus avancé débloque automatiquement les précédents)
function cheatSetCarto(level) {
  if (!G.cartoSkills) G.cartoSkills = makeDefaultCartoSkills();
  const tiers = ['sismic', 'interstellar', 'galactic', 'interCluster'];
  const idx = tiers.indexOf(level);
  if (idx === -1) {
    toast('Skill carto inconnu : ' + level);
    return;
  }
  // Débloque le skill demandé et tous les inférieurs (cumul)
  for (let i = 0; i <= idx; i++) {
    G.cartoSkills[tiers[i]] = true;
  }
  const labels = {
    sismic:       'Carto sismique (2 secteurs)',
    interstellar: 'Carto interstellaire (4 secteurs)',
    galactic:     'Carto galactique (amas entier)',
    interCluster: 'Carto inter-amas (univers entier)',
  };
  toast('' + labels[level] + ' débloquée');
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

function cheatResetCarto() {
  G.cartoSkills = makeDefaultCartoSkills();
  toast('Carto reset · ' + getRangeLabel());
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

/* ═══════════ SHIPYARD ═══════════ */

// Récupère le tier du Chantier orbital sur la planète (1, 2 ou 3)
// Si pas de Chantier construit, retourne 0 (impossible de construire des vaisseaux)
function getShipyardTier() {
  for (const p of G.planet.parcels) {
    if (p.state === 'built' && p.building === 'shipyard') {
      return p.lvl || 1;
    }
  }
  return 0;
}

// Bascule entre les 2 onglets du Chantier (Construction / Hangar)
function setShipyardTab(tab) {
  // Migration : si on a un ancien 'queue' en G.shipyardTab, on bascule sur build
  if (tab === 'queue') tab = 'build';
  G.shipyardTab = tab;
  ['build', 'hangar'].forEach(t => {
    const btn = document.getElementById('shipyard-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    const pane = document.getElementById('shipyard-pane-' + t);
    if (pane) pane.style.display = (t === tab) ? '' : 'none';
  });
  // Re-render selon l'onglet
  if (tab === 'hangar') renderHangar();
}

// Met à jour le badge sur l'onglet Hangar
function updateShipyardBadges() {
  const stationed = G.fleet.stationed;
  const totalShips = stationed.tanker.t1 + stationed.tanker.t2 + stationed.tanker.t3
                   + stationed.fregate.t1 + stationed.fregate.t2 + stationed.fregate.t3
                   + stationed.cuirasse.t1 + stationed.cuirasse.t2 + stationed.cuirasse.t3;
  const hangarBadge = document.getElementById('shipyard-tab-hangar-badge');
  if (hangarBadge) {
    if (totalShips > 0) {
      hangarBadge.style.display = '';
      hangarBadge.textContent = totalShips;
    } else {
      hangarBadge.style.display = 'none';
    }
  }
}

function renderShipyard() {
  const banner = document.getElementById('shipyard-prospect-banner');
  const buildRow = document.getElementById('probe-build-row');
  const buildBtn = document.getElementById('probe-build-btn');
  const buildStats = document.getElementById('probe-build-stats');
  const buildIcon = document.getElementById('probe-build-icon');

  // Header méta dynamique selon tier du Chantier
  const tier = getShipyardTier();
  const metaEl = document.getElementById('shipyard-meta');
  const bannerName = document.getElementById('shipyard-banner-name');
  const bannerSub = document.getElementById('shipyard-banner-sub');
  if (tier === 0) {
    if (metaEl) metaEl.innerHTML = `<span style="color:var(--red);display:inline-flex;align-items:center;gap:5px">${icon('warning', {size:11, color:'var(--red)'})} Aucun Chantier construit</span>`;
    if (bannerName) bannerName.textContent = 'Chantier orbital non construit';
    if (bannerSub) bannerSub.textContent = 'Construis un Chantier sur Ma Planète pour assembler des vaisseaux';
  } else {
    const shipyardTierData = BUILDING_TIERS.shipyard?.[tier];
    const cales = shipyardTierData?.slots || 1;
    if (metaEl) metaEl.innerHTML = `Construction <span class="dot"></span> Tier ${tier} <span class="dot"></span> ${cales} cale${cales > 1 ? 's' : ''}`;
    if (bannerName) bannerName.textContent = shipyardTierData?.name || 'Chantier orbital';
    if (bannerSub) bannerSub.textContent = shipyardTierData?.desc || 'Construction de vaisseaux';
  }

  // Injecter l'illustration de la sonde
  if (buildIcon) {
    buildIcon.innerHTML = getIllustration('probe');
  }

  // Banner Centre de prospection visible si sonde construite
  if (G.probe.exists) {
    banner.style.display = 'block';
    if (buildRow) buildRow.style.display = 'none';
  } else {
    banner.style.display = 'none';
    if (buildRow) buildRow.style.display = 'flex';

    const inQueue = QUEUES.shipyard.commands.some(c => c.unitKey === 'probe');
    if (inQueue) {
      buildBtn.textContent = 'En cours…';
      buildBtn.classList.add('disabled');
      buildStats.textContent = 'Assemblage en cours dans la cale';
    } else {
      const cost = { metal: 200, cristal: 50 };
      const canAfford = G.res.metal.v >= cost.metal && G.res.cristal.v >= cost.cristal;
      buildBtn.textContent = 'Assembler';
      buildBtn.classList.toggle('disabled', !canAfford);
      buildStats.textContent = canAfford
        ? 'Vaisseau unique · 200 métal · 50 cristal · 15s'
        : 'Manque de ressources · 200 métal · 50 cristal';
    }
  }

  // Banner "Vue d'amiral" visible dès qu'il y a au moins 1 vaisseau militaire
  const fleetBanner = document.getElementById('shipyard-fleet-banner');
  if (fleetBanner) {
    const stationed = G.fleet.stationed;
    const totalMilitary = stationed.tanker.t1 + stationed.tanker.t2 + stationed.tanker.t3
                       + stationed.fregate.t1 + stationed.fregate.t2 + stationed.fregate.t3
                       + stationed.cuirasse.t1 + stationed.cuirasse.t2 + stationed.cuirasse.t3;
    fleetBanner.style.display = totalMilitary > 0 ? 'block' : 'none';
  }

  // Liste des vaisseaux militaires (passe 3.1)
  renderShipBuildList();

  // Queue (inline comme la Caserne)
  renderQueue('shipyard');

  // Badges + onglet actif
  updateShipyardBadges();
  setShipyardTab(G.shipyardTab || 'build');
}


// PATCH_2010_VAISSEAUX_T1 — choix du tier de construction (T1 toujours disponible, jusqu'au tier du chantier)
function shipBuildTier() {
  const yard = getShipyardTier();
  if (!yard) return 0;
  const want = G.shipBuildTier || yard;
  return Math.max(1, Math.min(yard, want));
}
function setShipBuildTier(t) { G.shipBuildTier = t; if (typeof saveGame === 'function') saveGame(); renderShipBuildList(); }
function shipTierPillsHtml(yard, bt) {
  if (yard < 2) return '';
  const pill = (t) => {
    const on = t === bt, ok = t <= yard;
    return `<button ${ok ? `onclick="setShipBuildTier(${t})"` : 'disabled'} style="flex:1;padding:9px 0;border-radius:999px;border:1px solid ${on ? 'rgba(255,200,100,.7)' : 'rgba(255,255,255,.12)'};background:${on ? 'rgba(255,200,100,.12)' : 'transparent'};color:${on ? '#ffc864' : 'var(--mut)'};font:inherit;font-size:11px;letter-spacing:.14em;${ok ? 'cursor:pointer' : 'opacity:.35'}">TIER ${t}</button>`;
  };
  return `<div style="display:flex;gap:6px;margin:0 0 10px">${[1, 2, 3].map(pill).join('')}</div>
    <div style="font-size:10px;color:var(--mut);margin:-4px 2px 10px;font-style:italic">Ton chantier construit jusqu'au tier ${yard}. Les tiers inférieurs restent moins chers et plus rapides.</div>`;
}

// Affiche la liste des vaisseaux militaires constructibles
function renderShipBuildList() {
  const list = document.getElementById('ship-build-list');
  if (!list) return;
  const tier = getShipyardTier();

  // Si pas de chantier → message
  if (tier === 0) {
    list.innerHTML = `<div class="empty-line">Construis un Chantier orbital pour assembler des vaisseaux militaires.</div>`;
    return;
  }

  // PATCH_2010_VAISSEAUX_T1 (retour joueur 20/10) : un chantier amélioré garde l'accès aux tiers inférieurs
  const bt = shipBuildTier();
  // Pour chaque type de vaisseau militaire, afficher la fiche de construction
  const types = ['tanker', 'fregate', 'cuirasse'];
  list.innerHTML = shipTierPillsHtml(tier, bt) + types.map(shipKey => {
    const meta = SHIP_UNITS[shipKey];
    const tierData = SHIP_TIERS[shipKey]?.[bt];
    if (!meta || !tierData) return '';

    const costEntries = Object.entries(tierData.cost);
    const canAfford = costEntries.every(([res, q]) => G.res[res] && G.res[res].v >= q);
    const costStr = costEntries.map(([res, q]) => `${fmt(q)} ${res}`).join(' · ');

    // Durée par tier (cf. SHIP_BUILD_DURATIONS — option B rythme moyen)
    const baseDuration = SHIP_BUILD_DURATIONS[bt] || SHIP_BUILD_DURATIONS[1];
    const finalDuration = Math.max(1, Math.round(baseDuration / G.skills.productionSpeed * (window.SBSkills ? SBSkills.durMult('ships') : 1)));

    // Stats clés affichées
    const statsParts = [];
    if (tierData.atk) statsParts.push(`<span style="color:var(--red)">${tierData.atk} atk</span>`);
    if (tierData.def) statsParts.push(`<span style="color:var(--cyan)">${tierData.def} def</span>`);
    if (tierData.cargo > 0) statsParts.push(`<span style="color:var(--amber)">${fmt(tierData.cargo)} cargo</span>`);
    if (tierData.transportCap) statsParts.push(`<span style="color:var(--mut)">${tierData.transportCap} sold.</span>`);

    const inQueue = QUEUES.shipyard.commands.some(c => c.unitKey === shipKey);
    const queueLabel = inQueue ? ' · En cale' : '';

    return `
      <div class="unit-row ${canAfford ? '' : 'locked'}" onclick="openUnitDetail('${shipKey}','ship')" style="cursor:pointer">
        <div class="unit-icon" style="color:var(--cyan)">${PNG_ILLUSTRATIONS[shipKey] ? `<img src="${PNG_ILLUSTRATIONS[shipKey]}" alt="${meta.name}" onerror="pngFallback(this, '${shipKey}')">` : meta.icon}</div>
        <div class="unit-info">
          <div class="unit-name">${tierData.name} ${queueLabel}</div>
          <div class="unit-stats">${statsParts.join(' · ')}</div>
          <div class="unit-stats" style="margin-top:2px;font-size:9px">${costStr} · ${formatTime(finalDuration)}</div>
        </div>
        <button class="unit-action ${canAfford ? '' : 'disabled'}" onclick="event.stopPropagation();buildShip('${shipKey}', 1)">+1</button>
        <button class="unit-action ${canAfford ? '' : 'disabled'}" onclick="event.stopPropagation();buildShip('${shipKey}', 5)" style="margin-left:6px">+5</button>
      </div>
    `;
  }).join('') + colonialBuildRowHtml(tier);   // PATCH_2010_COLONIE
}
// PATCH_0111_ARCHE_PRORATA : la N-ième Arche coûte N fois le prix de base (planètes possédées + Arches déjà en cale, à quai ou en vol)
function colonialRank() {
  const worlds = Array.isArray(G.worlds) && G.worlds.length ? G.worlds.length : 1;
  const flying = Array.isArray(G.colonyMissions) ? G.colonyMissions.length : 0;
  const ready = (G.fleet && G.fleet.colonial) || 0;
  const queued = (typeof QUEUES !== 'undefined' && QUEUES.shipyard) ? QUEUES.shipyard.commands.filter(c => c.unitKey === 'colonial').length : 0;
  return worlds + flying + ready + queued;
}
function colonialCost() { const k = colonialRank(); const o = {}; for (const [r, q] of Object.entries(COLONIAL_COST)) o[r] = q * k; return o; }
function colonialFuel() { return COLONIAL_FUEL * colonialRank(); }   // saison de test : 6 h
function colonialDuration() { return Math.max(1, Math.round(COLONIAL_DURATION / (G.skills.productionSpeed || 1) * (window.SBSkills ? SBSkills.durMult('ships') : 1))); }
function colonialBlocker(tier) {
  if (!G.skills.colonialShipUnlocked) return 'Skill « Vaisseau colonial » requis (Centre niveau 3)';
  if ((tier || 0) < 2) return 'Chantier orbital niveau 2 requis';
  return null;
}
function colonialBuildRowHtml(tier) {
  const _cc = colonialCost(), _cf = colonialFuel();
  const block = colonialBlocker(tier);
  const meta = SHIP_UNITS.colonial;
  const canAfford = Object.entries(_cc).every(([r, q]) => G.res[r] && G.res[r].v >= q) && (G.fuel || 0) >= _cf;
  const inQueue = QUEUES.shipyard.commands.some(c => c.unitKey === 'colonial');
  const ready = G.fleet.colonial || 0;
  const costStr = Object.entries(_cc).map(([r, q]) => `${fmt(q)} ${r}`).join(' · ') + ` · ${fmt(_cf)} carburant`;
  const ok = !block && canAfford;
  return `
      <div class="unit-row ${ok ? '' : 'locked'}" onclick="openUnitDetail('colonial','ship')" style="cursor:pointer;border-color:rgba(255,170,90,.35)">
        <div class="unit-icon" style="color:#ffb066">${PNG_ILLUSTRATIONS.colonial ? `<img src="${PNG_ILLUSTRATIONS.colonial}" alt="${meta.name}" onerror="pngFallback(this, 'colonial')">` : meta.icon}</div>
        <div class="unit-info">
          <div class="unit-name">${meta.name}${inQueue ? ' · En cale' : ''}${ready ? ` · <span style="color:#ffb066">${ready} prête${ready > 1 ? 's' : ''}</span>` : ''}</div>
          <div class="unit-stats" style="color:${block ? 'var(--mut)' : '#ffb066'}">${block || 'Fonde une colonie sur une planète habitable libre'}</div>
          <div class="unit-stats" style="margin-top:2px;font-size:9px">${costStr} · ${formatTime(colonialDuration())}</div>
        </div>
        <button class="unit-action ${ok ? '' : 'disabled'}" onclick="event.stopPropagation();buildColonialShip()">+1</button>
      </div>`;
}
function buildColonialShip() {
  const _cc = colonialCost(), _cf = colonialFuel();
  const block = colonialBlocker(getShipyardTier());
  if (block) { toast(block); return; }
  for (const [r, q] of Object.entries(_cc)) if (!G.res[r] || G.res[r].v < q) { toast(`Manque ${fmt(q - (G.res[r]?.v || 0))} ${r}`); return; }
  if ((G.fuel || 0) < _cf) { toast(`Manque ${fmt(_cf - (G.fuel || 0))} carburant`); return; }
  for (const [r, q] of Object.entries(_cc)) G.res[r].v -= q;
  G.fuel -= _cf;
  QUEUES.shipyard.commands.push({ unitKey: 'colonial', shipTier: 1, totalQty: 1, completed: 0, currentElapsed: 0, unitDuration: colonialDuration(), cost: Object.assign({ fuel: _cf }, _cc), addedAt: Date.now() });
  toast('◈ Arche coloniale en assemblage');
  renderShipyard();
  startQueueTicker();
  try { saveGame(); } catch (e) {}
}
function renderColonialDetail() {
  const _cc = colonialCost(), _cf = colonialFuel();
  const meta = SHIP_UNITS.colonial;
  const ready = G.fleet.colonial || 0;
  const q = QUEUES.shipyard.commands.find(c => c.unitKey === 'colonial');
  document.getElementById('ud-title').textContent = meta.name.toUpperCase();
  document.getElementById('ud-banner').style.borderColor = 'rgba(255,170,90,.3)';
  if (!mountUnitShip3D('colonial', ready)) unmountUnitShip3D();
  const udIcon = document.getElementById('ud-icon');
  udIcon.innerHTML = PNG_ILLUSTRATIONS.colonial ? `<img class="illu-png" src="${PNG_ILLUSTRATIONS.colonial}" alt="${meta.name}" onerror="pngFallback(this, 'colonial')">` : meta.icon;
  udIcon.style.color = '#ffb066';
  document.getElementById('ud-name').textContent = meta.name;
  document.getElementById('ud-sub').textContent = 'Vaisseau-colonie · 2,4 km · six serres';
  document.getElementById('ud-meta').innerHTML = `<span style="color:#ffb066">${ready} prête${ready > 1 ? 's' : ''}</span>${q ? ' <span class="dot"></span> une en cale' : ''}`;
  const block = colonialBlocker(getShipyardTier());
  const row = (l, v, c) => `<div class="dash-stat-row"><span class="lbl">${l}</span><span class="val"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`;
  document.getElementById('ud-composition').innerHTML =
    row('Coût', Object.entries(_cc).map(([r, v]) => `${fmt(v)} ${r}`).join(' · ')) +
    row('Carburant', fmt(_cf), 'var(--amber)') +
    row('Assemblage', formatTime(colonialDuration())) +
    row('Conditions', block || 'remplies', block ? 'var(--red)' : 'var(--green)');
  document.getElementById('ud-costs').innerHTML =
    row('À l\'arrivée', 'le vaisseau devient la colonie') +
    row('Nouvelle planète', 'Centre neuf · antenne à bâtir · parcelles vierges');
  document.querySelectorAll('#scr-unit-detail .section-label').forEach((el, i) => {
    if (i === 0) el.textContent = 'Construction';
    if (i === 1) el.textContent = 'Fondation';
  });
  document.getElementById('ud-desc-text').textContent = "L'Arche emporte une colonie entière : six serres, leurs lacs, leurs forêts et leurs colons. Elle ne revient jamais. Posée sur une planète habitable libre, elle devient un nouveau Centre de commandement, et sa nouvelle antenne voit ce que la capitale ne voyait pas.";
  const actionsEl = document.getElementById('ud-actions');
  actionsEl.innerHTML = (!q && !block)
    ? `<button class="btn-primary" style="width:100%;padding:14px;margin-bottom:8px;border-color:rgba(255,170,90,.45);background:rgba(255,170,90,.08);color:#ffb066" onclick="buildColonialShip();renderUnitDetailScreen()">Assembler une Arche</button><button class="btn-ghost" style="width:100%;padding:14px" onclick="goBack()">Retour</button>`
    : `<button class="btn-ghost" style="width:100%;padding:14px" onclick="goBack()">Retour</button>`;
}
function openArkMission(id) { arkMissionId = id; goto('ark-mission'); }
function arkMissionRowsHtml() {
  const ms = G.colonyMissions || [];
  if (!ms.length) return '';
  return `<div class="section-label">Arche en route</div>` + ms.map(m => `
    <div class="fleet-prepared-row in-mission" onclick="openArkMission('${m.id}')" style="border-color:rgba(255,170,90,.35)">
      <div class="fleet-prepared-icon"><div style="width:20px;height:20px;color:#ffb066">${svgFleetWings('#ffb066')}</div></div>
      <div class="fleet-prepared-info">
        <div class="fleet-prepared-name">Arche coloniale<span style="display:inline-block;background:rgba(255,170,90,.12);border:1px solid rgba(255,170,90,.45);color:#ffb066;padding:1px 6px;border-radius:3px;font-size:9px;font-family:'SF Mono',monospace;letter-spacing:.06em;margin-left:6px">EN MISSION</span></div>
        <div style="font-size:10px;color:#ffd9a8;margin-top:3px;font-family:'SF Mono',monospace">→ ${m.name} · arrivée dans <span data-ark-timer="${m.id}">${formatTankerDuration(Math.max(0, m.arriveAt - Date.now()))}</span></div>
        <div class="fleet-prepared-stats">Une colonie entière à bord · elle ne revient pas</div>
      </div>
      <div class="fleet-prepared-arrow">→</div>
    </div>`).join('');
}
function renderArkMissionRows() {
  const label = document.getElementById('fleet-prepared-section-label');
  if (!label) return;
  let box = document.getElementById('fleet-ark-missions');
  if (!box) { box = document.createElement('div'); box.id = 'fleet-ark-missions'; label.parentNode.insertBefore(box, label); }
  box.innerHTML = arkMissionRowsHtml();
  arkTimersTick();
}
