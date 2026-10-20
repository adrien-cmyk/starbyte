// STARBYTE — règles d'un raid entre commandants (autour du moteur de combat du jeu).
// @ts-nocheck
import { resolveCombat } from './engine.js';

// ─── Raid entre commandants ───────────────────────────────────────────
// La cible est le registre public du défenseur (table worlds) :
//   defense  → phase 1 (défense orbitale publiée par son jeu)
//   garrison → phase 2 : part au sol de la défense (même rapport que les cibles du jeu, ~60 %)
//   stocks   → phase 3 (le serveur plafonne encore le butin à 30 % des stocks)
const GARRISON_SHARE = 0.6;

export function targetFromWorld(w) {
  const defense = Math.max(0, Number(w?.defense) || 0);
  const s = w?.stocks || {};
  return {
    defense,
    garrison: Math.round(defense * GARRISON_SHARE),
    resources: { metal: Number(s.metal) || 0, energie: Number(s.energie) || 0, cristal: Number(s.cristal) || 0 },
  };
}

function cleanFleet(f) {
  const comp = {};
  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    comp[type] = {};
    for (const t of ['t1', 't2', 't3']) {
      const n = Math.floor(Number(f?.composition?.[type]?.[t]) || 0);
      comp[type][t] = Math.max(0, Math.min(n, 100000));
    }
  }
  const soldiers = {
    garde: Math.max(0, Math.min(Math.floor(Number(f?.soldiers?.garde) || 0), 1000000)),
    lourd: Math.max(0, Math.min(Math.floor(Number(f?.soldiers?.lourd) || 0), 1000000)),
  };
  const heroes = {};
  for (const type of ['tanker', 'fregate', 'cuirasse']) {
    const h = f?.heroes?.[type];
    if (h && typeof h.name === 'string') heroes[type] = { name: h.name.slice(0, 60), dead: !!h.dead };
  }
  return { composition: comp, soldiers, heroes };
}

// Résout un raid. Renvoie le résultat à passer à mp_finish_raid :
//   outcome          'victory' (orbite tenue : pillage) ou 'defeat'
//   combat_outcome   l'issue détaillée du moteur (crushing_victory, victory, pyrrhic, defeat, massacre)
//   combat           le résultat complet du moteur (phases, pertes, butin, héros tombés)
//   loot             butin demandé (le serveur le plafonne à 30 % des stocks)
//   damaged_building clé du bâtiment abîmé chez le défenseur (ou null)
export function resolveRaid(raid, defenderWorld) {
  const fleet = cleanFleet(raid?.fleet);
  const target = targetFromWorld(defenderWorld);
  const combat = resolveCombat(fleet, target);
  // Orbite tenue = raid réussi (les tankers pillent ; moins si le débarquement est repoussé, cf. moteur)
  const p1 = combat.phases.phase1?.won;
  const landed = !!p1;
  // Bâtiment abîmé seulement si des soldats ont débarqué et tenu le sol (phase 2 gagnée) ;
  // un raid orbital sans soldats pille mais n'abîme rien.
  const troopsLanded = !!(p1 && combat.phases.phase2 && combat.phases.phase2.won);
  let damaged = null;
  if (troopsLanded) {
    const blds = (Array.isArray(defenderWorld?.buildings) ? defenderWorld.buildings : [])
      .filter(b => b && b.key && b.state !== 'damaged');
    if (blds.length) damaged = blds[Math.floor(Math.random() * blds.length)].key;
  }
  return {
    outcome: landed ? 'victory' : 'defeat',
    combat_outcome: combat.outcome,
    combat,
    target: { defense: target.defense, garrison: target.garrison },
    loot: landed ? combat.loot : { metal: 0, energie: 0, cristal: 0 },
    damaged_building: damaged,
  };
}


// ─── Interception d'un convoi (GDD Balises & Piratage, P5-P6 : Dévaliser) ───────────
// La flotte en embuscade affronte le tanker (et plus tard son escorte) avec le même moteur.
// Une route bien connue (niveau 5+) laisse filer le tanker si son armement dépasse celui du pirate.
const TANKER_STATS = { 1: { atk: 50, def: 200 }, 2: { atk: 120, def: 500 }, 3: { atk: 280, def: 1200 } };

function fleetAttack(comp) {
  const atk = { fregate: [300, 900, 2700], cuirasse: [1500, 4500, 13500] };
  let s = 0;
  for (const type of ['fregate', 'cuirasse']) for (let t = 1; t <= 3; t++) s += (comp?.[type]?.['t' + t] || 0) * atk[type][t - 1];
  return s;
}

export function resolveIntercept(ambush, convoy) {
  const fleet = cleanFleet({ composition: ambush?.fleet?.composition, soldiers: {}, heroes: ambush?.fleet?.heroes });
  fleet.soldiers = { garde: 0, lourd: 0 };            // embuscade spatiale : pas de débarquement
  const tier = Math.max(1, Math.min(3, Number(convoy?.tanker_tier) || 1));
  const tk = TANKER_STATS[tier];
  const cargo = convoy?.cargo || {};
  const resources = { metal: Number(cargo.metal) || 0, energie: Number(cargo.energie) || 0, cristal: Number(cargo.cristal) || 0 };
  const pirateAtk = fleetAttack(fleet.composition);
  if ((Number(convoy?.knowledge) || 0) >= 5 && tk.atk > pirateAtk) {
    return { outcome: 'evaded', loot: {}, fleet_after: { composition: fleet.composition }, tanker: { tier, atk: tk.atk }, pirate_atk: pirateAtk };
  }
  const combat = resolveCombat(fleet, { defense: tk.def, garrison: 0, resources });
  const after = JSON.parse(JSON.stringify(fleet.composition));
  for (const type of ['tanker', 'fregate', 'cuirasse']) for (const t of ['t1', 't2', 't3']) {
    after[type][t] = Math.max(0, (after[type][t] || 0) - (combat.finalLosses?.ships?.[type]?.[t] || 0));
  }
  const won = !!combat.phases?.phase1?.won;
  return {
    outcome: won ? 'won' : 'lost',
    combat_outcome: combat.outcome,
    loot: won ? combat.loot : {},
    fleet_after: { composition: after },
    losses: combat.finalLosses?.ships || {},
    tanker: { tier, def: tk.def },
    pirate_atk: pirateAtk,
  };
}
