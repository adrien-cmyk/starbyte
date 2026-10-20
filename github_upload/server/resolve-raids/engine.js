// STARBYTE — moteur de combat, COPIE GÉNÉRÉE depuis index.html par tools/sync_combat_engine.py.
// Ne pas modifier ici : retoucher le jeu, relancer le script, redéployer resolve-raids.
// @ts-nocheck

const DEFENSE_UNITS = {
  garde: {
    key: 'garde',
    name: 'Garde planétaire',
    icon: 'sword',
    color: 'var(--red)',
    defPerUnit: 200,
    atkPerUnit: 50,      // passe 2.4 — bonus d'attaque en flotte (1/4 de def)
    transportable: true, // embarquable dans un Tanker
    soldierWeight: 80,   // passe 3.2 — équipement léger, prend 80 unités de fret
    cost: { metal: 100 },
    repairCost: { metal: 30 }, // par unité endommagée
    scrapReturn: { metal: 30 }, // récupéré à la casse
    duration: 120, // ⚡ V0.5 : 2 min par garde (rythme moyen, ancien : 6s proto)
    requires: 'caserne',
    desc: 'Unité d\'infanterie de base. Robuste, peu coûteuse. Embarquable (80 fret/u).',
  },
  lourd: {
    key: 'lourd',
    name: 'Soldat lourd',
    icon: '◈',
    color: 'var(--red)',
    defPerUnit: 800,
    atkPerUnit: 250,     // passe 2.4 — bonus d'attaque en flotte (~1/3 de def)
    transportable: true, // embarquable dans un Tanker
    soldierWeight: 200,  // passe 3.2 — armure renforcée + arsenal, prend 200 unités de fret
    cost: { metal: 250, energie: 50 },
    repairCost: { metal: 75, energie: 15 },
    scrapReturn: { metal: 75 },
    duration: 300, // ⚡ V0.5 : 5 min par lourd (rythme moyen, ancien : 18s proto)
    requires: 'turret', // Bunker requis (clé interne 'turret' = Bunker)
    locked: false, // débloqué dès qu'un Bunker existe
    lockedReason: 'Bunker requis',
    desc: 'Infanterie blindée. Encaisse les raids massifs. Embarquable (200 fret/u).',
  },
  tourelle: {
    key: 'tourelle',
    name: 'Tourelle légère',
    icon: '◎',
    color: 'var(--red)',
    defPerUnit: 400,
    atkPerUnit: 0,       // tourelle = défense pure, pas offensive
    transportable: false, // fixe au sol, pas embarquable
    cost: { metal: 200, energie: 40 },
    repairCost: { metal: 60, energie: 10 },
    scrapReturn: { metal: 60 },
    duration: 180, // ⚡ V0.5 : 3 min par tourelle (rythme moyen, ancien : 12s proto)
    requires: 'turret', // Construite depuis l'écran défense
    desc: 'Défense automatisée fixe. Cible les sondes et raids.',
  },
  // PATCH_1910_TOURELLE_LOURDE — promise par le Bunker fortifié (niveau 2) mais jamais recrutable (retour testeur 18/10)
  tourelle_lourde: {
    key: 'tourelle_lourde',
    name: 'Tourelle lourde',
    icon: '◉',
    color: 'var(--red)',
    defPerUnit: 1400,
    atkPerUnit: 0,
    transportable: false,
    cost: { metal: 600, energie: 150, cristal: 40 },
    repairCost: { metal: 180, energie: 45 },
    scrapReturn: { metal: 180 },
    duration: 480,
    requires: 'turret',
    minLevel: 2,          // Bunker fortifié
    lockedReason: 'Bunker fortifié (niveau 2) requis',
    desc: 'Canon lourd sous tourelle blindée. Brise les raids massifs et tient l\'orbite basse. Fixe au sol.',
  },
};

const SHIP_TIERS = {
  tanker: {
    1: { name:'Tanker T1',  cost:{metal:400},                 atk:50,   def:200,  cargo:5000,   transportCap:50  },
    2: { name:'Tanker T2',  cost:{metal:2000, energie:500},   atk:120,  def:500,  cargo:25000,  transportCap:100 },
    3: { name:'Tanker T3',  cost:{metal:10000,energie:2500,cristal:500}, atk:280, def:1200, cargo:100000, transportCap:200 },
  },
  fregate: {
    1: { name:'Frégate T1', cost:{metal:600},                 atk:300,  def:200,  cargo:0 },
    2: { name:'Frégate T2', cost:{metal:3000, energie:750},   atk:900,  def:600,  cargo:0 },
    3: { name:'Frégate T3', cost:{metal:15000,energie:3750,cristal:750}, atk:2700, def:1800, cargo:0 },
  },
  cuirasse: {
    1: { name:'Cuirassé T1',cost:{metal:2500, energie:600},   atk:1500, def:1500, cargo:0 },
    2: { name:'Cuirassé T2',cost:{metal:12500,energie:3000,cristal:600}, atk:4500, def:4500, cargo:0 },
    3: { name:'Cuirassé T3',cost:{metal:62500,energie:15000,cristal:3000}, atk:13500, def:13500, cargo:0 },
  },
  // probe & colonial n'ont pas de tiers (cas particuliers — passe 3.0)
};

const COMBAT_CONSTS = {
  // Aléatoire borné : multiplicateur sur les valeurs d'attaque/défense
  RAND_MIN: 0.92,   // PATCH_1910_COMBAT_SERRE (Adrien 19/10) : ±8 % au lieu de ±15 %
  RAND_MAX: 1.08,

  // Phase 1 — Bataille orbitale (pertes joueur en % de l'attaque engagée)
  PHASE1_VICTORY_LOSS_MIN: 0.10,
  PHASE1_VICTORY_LOSS_MAX: 0.30,
  PHASE1_DEFEAT_LOSS_MIN: 0.40,
  PHASE1_DEFEAT_LOSS_MAX: 0.70,

  // Phase 2 — Débarquement (pertes soldats en % engagés)
  PHASE2_VICTORY_LOSS_MIN: 0.20,
  PHASE2_VICTORY_LOSS_MAX: 0.40,
  PHASE2_DEFEAT_LOSS_MIN: 0.60,
  PHASE2_DEFEAT_LOSS_MAX: 0.90,

  // Phase 3 — Pillage (% des ressources de la cible pillables)
  PHASE3_LOOT_MIN: 0.40,
  PHASE3_LOOT_MAX: 0.70,
  PHASE3_HEROIC_BONUS: 1.5,
  // Victoire serrée (19/10) : plus le rapport de force est proche de 1, plus la victoire coûte cher.
  // serrage = 1 à égalité, 0 dès que l'attaque dépasse la défense de 50 %.
  CLOSE_RATIO: 1.5,
  CLOSE_P1_LOSS: [0.50, 0.65],     // vaisseaux de combat détruits sur une victoire à l'arraché (avant avaries)
  CLOSE_TANKER_LOSS: [0.15, 0.30], // tankers abattus sur une victoire à l'arraché
  CLOSE_P2_LOSS: [0.50, 0.70],     // soldats tombés sur un débarquement gagné à l'arraché
  // Débarquement (11/10) : effet sur le pillage
  GROUND_WON_LOOT: 1.2,    // sol tenu : entrepôts ouverts
  GROUND_LOST_LOOT: 0.6,   // débarquement repoussé : pillage orbital seul

  // Pertes asymétriques (doctrine Z3) : probabilité de récupération
  RECOVERY: {
    sonde:    0.0,   // 0% récupérable
    fregate:  0.0,   // 0% récupérable
    tanker:   0.5,   // 50% récupérable
    cuirasse: 0.7,   // 70% récupérable
  },

  // Combat héroïque (Z4) : seuils pour le bonus ×1.5
  HEROIC: {
    MAX_TANKER_LOSS_PCT: 0.0,    // Aucun Tanker perdu
    MAX_CUIRASSE_LOSS_PCT: 0.0,  // Aucun Cuirassé perdu
    MAX_SOLDIER_LOSS_PCT: 0.3,   // Pertes soldats ≤ 30%
  },
};

const HERO_ROLES = {
  cuirasse: { label: 'Capitaine cuirassés', short: 'Cuirassés', color: 'var(--red)' },
  fregate:  { label: 'Amiral frégates',     short: 'Frégates',  color: 'var(--blue-light)' },
  tanker:   { label: 'Chef logistique',     short: 'Logistique', color: 'var(--amber)' },
};

const INTEGRITY = {
  EFF_FLOOR: 0.35,                                   // efficacité d'une coque à 0 %
  REPAIR_METAL_PCT: 0.4,                             // réparer 0 → 100 % coûte 40 % du métal de construction
  REPAIR_SEC_PER_PT: { tanker: 4, fregate: 6, cuirasse: 18 },   // secondes par point d'intégrité (tier 1)
  TIER_TIME: { 1: 1, 2: 1.5, 3: 2 },
  YARD_SPEED: { 1: 1, 2: 0.75, 3: 0.5 },             // le tier du chantier accélère les réparations
};

const SHIP_TYPES_ALL = ['tanker', 'fregate', 'cuirasse'];

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

function fleetIntegrityEfficiency(fleet) {
  syncFleetIntegrity(fleet);
  let full = 0, eff = 0;
  for (const type of ['fregate', 'cuirasse']) for (let t = 1; t <= 3; t++) {
    const atk = SHIP_TIERS[type]?.[t]?.atk || 0;
    for (const hp of fleet.integrity[type]['t' + t]) { full += atk; eff += atk * shipEfficiency(hp); }
  }
  return full > 0 ? eff / full : 1;
}

function countShipsByType(composition, type) {
  if (!composition || !composition[type]) return 0;
  return (composition[type].t1 || 0) + (composition[type].t2 || 0) + (composition[type].t3 || 0);
}

function combatRand(min, max) {
  return min + Math.random() * (max - min);
}

function applyShipRecovery(destroyedCount, shipType, closeness) {
  const recoveryRate = (COMBAT_CONSTS.RECOVERY[shipType] || 0) * (1 - 0.7 * Math.max(0, Math.min(1, closeness || 0)));   // PATCH_1910_COMBAT_SERRE
  let destroyed = 0, recovered = 0;
  for (let i = 0; i < destroyedCount; i++) {
    if (Math.random() < recoveryRate) recovered++;
    else destroyed++;
  }
  return { destroyed, recovered };
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

function computeSoldierAttack(soldiers) {
  if (!soldiers) return 0;
  // SOLDIERS_1110 — mêmes valeurs que la fiche d'unité (DEFENSE_UNITS.atkPerUnit : garde 50, lourd 250)
  let atk = 0;
  atk += (soldiers.garde || 0) * (DEFENSE_UNITS.garde.atkPerUnit || 0);
  atk += (soldiers.lourd || 0) * (DEFENSE_UNITS.lourd.atkPerUnit || 0);
  return atk;
}

function computeSurvivingCargo(survivingTankers) {
  let cap = 0;
  for (let tier = 1; tier <= 3; tier++) {
    const qty = survivingTankers['t' + tier] || 0;
    const td = SHIP_TIERS.tanker?.[tier];
    if (qty && td) cap += qty * (td.cargo || 0);
  }
  return cap;
}

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
  const atkOrbital = computeFleetOrbitalAttack(composition) * fleetIntegrityEfficiency(fleet);   // avaries : efficacité dégressive
  const defOrbital = target.defense || 0;
  const atkEffective = atkOrbital * combatRand(COMBAT_CONSTS.RAND_MIN, COMBAT_CONSTS.RAND_MAX);
  const defEffective = defOrbital * combatRand(COMBAT_CONSTS.RAND_MIN, COMBAT_CONSTS.RAND_MAX);

  const phase1Won = defOrbital <= 0 || atkEffective > defEffective;

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

  if (totalSurvivingTankers > 0) {
    const cargoCapacity = computeSurvivingCargo(survivingTankers);
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

function _sumShipLosses(shipsLost) {
  let total = 0;
  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    for (const tier of ['t1', 't2', 't3']) {
      total += shipsLost[type]?.[tier] || 0;
    }
  }
  return total;
}

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

export { resolveCombat, SHIP_TIERS, COMBAT_CONSTS, countShipsByType };
