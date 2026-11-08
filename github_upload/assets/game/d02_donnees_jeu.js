/* Starbyte — d02_donnees_jeu.js
   Données, variables et instructions exécutées au chargement (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


// ─── Paliers d'expérience des héros (passe 3.4-c) ─────────────────────
// Calculé à partir de hero.missionsCount (missions survécues où le type était présent)
// Cf. GDD 04_combat.md, section "Continuité des héros"
const HERO_RANK_THRESHOLDS = {
  legendary:   10,  // 10+ missions = légendaire
  experienced: 6,   // 6-9   missions = aguerri
  veteran:     3,   // 3-5   missions = vétéran
  recruit:     0,   // 0-2   missions = recrue
};

const HERO_RANK_LABELS = {
  recruit:     { label: 'Recrue',     color: 'var(--mut)',      hint: 'sortait de l\'académie' },
  veteran:     { label: 'Vétéran',    color: 'var(--blue-light)', hint: 'vétéran de plusieurs engagements' },
  experienced: { label: 'Aguerri',    color: 'var(--amber)',    hint: 'dont la réputation n\'a plus besoin d\'être faite' },
  legendary:   { label: 'Légendaire', color: '#ffe082',         hint: 'qu\'on murmure encore dans les couloirs de Kerath-VII' },
};

// ─── Banque de surnoms (gagnés à 5 missions survécues) ────────────────
// Tirés au sort par type de héros, fixés pour toujours sur le personnage
const HERO_NICKNAMES = {
  cuirasse: [
    'l\'Inébranlable', 'le Mur', 'la Crête de Fer', 'le Vétéran',
    'l\'Indéboulonnable', 'le Roc', 'le Dernier Debout',
    'la Sentinelle', 'le Bouclier', 'le Sourd',
  ],
  fregate: [
    'le Trait', 'la Foudre', 'l\'Œil de Vérath', 'Vif-Argent',
    'la Comète Persistante', 'l\'Éclat', 'le Funambule',
    'la Lame', 'l\'Ombre Rapide', 'le Souffle',
  ],
  tanker: [
    'le Sage', 'la Comptable', 'le Patron', 'l\'Oncle',
    'la Mémoire', 'le Patient', 'le Garde-Manger',
    'l\'Économe', 'le Calculateur', 'la Plume',
  ],
};


// BOTS_1110 — commandants automates : les anciennes cibles d'entraînement, placés dans l'univers
var BOT_PROFILES = {
  avantposte: { weight: 50, names: ['AVANT-POSTE', 'SENTINELLE', 'RELAIS-7'], level: 200, profile: 'Avant-poste automate',
    description: 'Monde tenu par une IA de garde. Défenses minimales : bon terrain pour roder une flotte.',
    defense: 500, garrison: 300, resources: { metal: 2000, energie: 500, cristal: 0 } },
  raider: { weight: 35, names: ['BERSEK89', 'KORR-VEX', 'BLACKVEIN'], level: 740, profile: 'Raider automate',
    description: 'Défenses solides, pillage difficile mais lucratif.',
    defense: 3000, garrison: 1800, resources: { metal: 5000, energie: 2000, cristal: 500 } },
  forteresse: { weight: 15, names: ['LYS-ORBITAL', 'AURIS-HOLD', 'NEMESIS-9'], level: 890, profile: 'Forteresse marchande automate',
    description: 'Très défendue, mais regorge de ressources rares.',
    defense: 8000, garrison: 4500, resources: { metal: 30000, energie: 5000, cristal: 15000 } },
};

const FAKE_TARGETS = [
  {
    id: 'cible-test',
    name: 'Cible-Test',
    level: 200,
    profile: 'Planète faible',
    description: 'Planète isolée, défenses minimales. Idéale pour tester ta flotte.',
    distanceMult: 1,
    defense: 500,         // Phase 1 — Défense orbitale (tourelles + vaisseaux défensifs)
    garrison: 300,        // Phase 2 — Garnison au sol (gardes + lourds défenseurs)
    resources: { metal: 2000, energie: 500, cristal: 0 },
  },
  {
    id: 'bersek89',
    name: 'BERSEK89',
    level: 740,
    profile: 'Raider militaire',
    description: 'Planète aux défenses solides. Pillage difficile mais lucratif.',
    distanceMult: 3,
    defense: 3000,
    garrison: 1800,
    resources: { metal: 5000, energie: 2000, cristal: 500 },
  },
  {
    id: 'lys-orbital',
    name: 'LYS-ORBITAL',
    level: 890,
    profile: 'Marchand fortifié',
    description: 'Forteresse commerciale. Très défendue mais regorge de ressources rares.',
    distanceMult: 5,
    defense: 8000,
    garrison: 4500,
    resources: { metal: 30000, energie: 5000, cristal: 15000 },
  },
];

/* ═══════════ PATCH_2010_PILLAGE_VIDE — piller un monde vide (retour joueur 20/10, décision d'Adrien) ═══════════
   On ne l'interdit pas, mais on ne peut pas le « farmer » :
   1. le monde s'épuise : après un pillage, son stock tombe à 10 % et se reconstitue en 5 jours ;
   2. la fatigue est GLOBALE (tous mondes vides confondus) : le premier pillage paie ; dès le deuxième, peu importe le monde,
      le butin chute (×0,3 puis ×0,12) et les incidents deviennent probables (25 % → 60 % → 90 %) — la fatigue retombe d'un cran par 24 h ;
   3. un incident coûte toujours des vaisseaux (et des soldats) : désertion par amour, explorateurs disparus, tempête, météorites. */
var PV_KINDS = new Set(['dead', 'lunar', 'gas', 'habitable']);
var PV_REGEN_MS = 5 * 24 * 3600e3, PV_DECAY_MS = 24 * 3600e3;
var PV_INCIDENTS = {
  habitable: { title: 'Ils ont trouvé l\'amour', ship: 'tanker',
    text: (n, s) => (s ? `${s} soldat${s > 1 ? 's ont' : ' a'} refusé de remonter à bord : une communauté libre les a accueillis, et ils ont choisi de rester. ` : 'Une partie des équipages a choisi de rester parmi les colons libres de ce monde. ')
      + `${n} vaisseau${n > 1 ? 'x sont restés' : ' est resté'} au sol avec eux. Personne n'a répondu aux appels.` },
  dead: { title: 'Les explorateurs ne sont pas revenus', ship: 'fregate',
    text: (n, s) => (s ? `${s} soldat${s > 1 ? 's ont' : ' a'} voulu explorer les ruines. Leur signal s'est éteint au bout de quarante minutes. ` : 'Une équipe est descendue explorer les ruines. Son signal s\'est éteint au bout de quarante minutes. ')
      + `${n} vaisseau${n > 1 ? 'x envoyés' : ' envoyé'} à leur recherche ${n > 1 ? 'ont été perdus' : 'a été perdu'} dans une tempête de poussière.` },
  gas: { title: 'Tempête dans la haute atmosphère', ship: null,
    text: (n) => `Un front de vents à neuf cents kilomètres-heure a surpris la flotte pendant le pompage. ${n} vaisseau${n > 1 ? 'x n\'ont' : ' n\'a'} pas pu remonter.` },
  lunar: { title: 'Pluie de micrométéorites', ship: null,
    text: (n) => `Un essaim de micrométéorites a criblé la zone de chargement. ${n} vaisseau${n > 1 ? 'x ont été perdus' : ' a été perdu'} avant le décollage.` },
};

// Banque de noms pour le générateur (référence : The Expanse, OGame, mythologie)
const FLEET_NAME_ADJECTIVES = [
  'Punisher', 'Œil', 'Lame', 'Mâchoire', 'Tempête', 'Ombre',
  'Tonnerre', 'Faucon', 'Lance', 'Sentinelle', 'Mirage', 'Foudre',
  'Glaive', 'Cyclone', 'Vipère', 'Aigle', 'Reconnaissance', 'Vanguard',
];
const FLEET_NAME_SUFFIXES = [
  'Alpha', 'Bêta', 'Prime', 'Noir', 'Rouge', 'du Nord', 'du Sud',
  '1', '7', '9', 'XII', 'de Vérath', 'd\'Erebus', 'de Cassandre',
  'Solaire', 'Stellaire', 'd\'Orion', 'd\'Andromède', 'Galactique',
];

// ═══════════════════════════════════════════════════════════════
// DOCTRINES DE FLOTTE — passe 3.2 (Z4-quater GDD)
// ═══════════════════════════════════════════════════════════════
// L'algorithme analyse la composition d'une flotte et infère son archétype.
// Cet archétype influence visuel + narration de bataille (passe 3.4).
//
// Catalogue volontairement restreint à 6 archétypes très distincts pour
// que chaque détection soit lisible et impactante (cf. décision mai 2026).
//
// Stats disponibles dans matches(s) :
//   s.totalShips, s.totalSoldiers, s.nTankers, s.nFregates, s.nCuirasses
//   s.rSoldierAtk = atkSoldats / atkTotal       → "% intention militaire"
//   s.rTankers    = nTankers / totalShips       → "% logistique"
//   s.rCombatShips = (nFregates+nCuirasses) / totalShips → "% escorte"
//   s.rCargoFilled = soldierFreight / cargoCap  → "% Tankers remplis de soldats"
const FLEET_DOCTRINES = [
  {
    key: 'landing',
    name: 'Force de débarquement',
    icon: 'sword',
    short: 'Conquiert le sol. Lourdes pertes humaines.',
    long: 'L\'attaque vient majoritairement des soldats. Conçue pour envahir, vulnérable en combat orbital pur.',
    color: '#b8d0ff',
    // Seuil bas en absolu (1+ soldat éligible) + ratio dominant (>=50%)
    // Note : >=50% (pas >50%) pour éviter le trou à exactement 50% entre Convoi et Force.
    matches: (s) => s.totalSoldiers >= 1 && s.rSoldierAtk >= 0.5,
    priority: 10,
  },
  {
    key: 'arsenal',
    name: 'Arsenal de destruction',
    icon: 'shield',
    short: 'Pulvérise les défenses. Peu de pillage.',
    long: 'Pure puissance de feu. Conçue pour anéantir les défenses adverses, peu de capacité de butin.',
    color: '#5098ff',
    // Arsenal = très peu de Tankers (<20% strict) + flotte dominée par combat (>=75%)
    // Le seuil rTankers < 0.2 force une vraie pureté : 1T+6 combat = OK, 2T+6 combat = Armada
    matches: (s) => (s.nCuirasses >= 3 || s.nFregates >= 6)
                  && s.rCombatShips >= 0.75
                  && s.rTankers < 0.2
                  && s.rSoldierAtk < 0.15,
    priority: 9,
  },
  {
    key: 'convoy',
    name: 'Convoi marchand',
    icon: 'package',
    short: 'Pille massivement si elle arrive.',
    long: 'Majorité de Tankers, peu d\'escorte. Cargo libre énorme. Si elle survit au combat orbital, le butin est colossal.',
    color: '#ffc060',
    // Convoi = majorité Tankers, peu d'escorte, ratio soldats < 50% strict (au-delà → Force)
    matches: (s) => s.rTankers >= 0.6
                  && s.rCombatShips < 0.4
                  && s.rSoldierAtk < 0.5
                  && s.totalShips >= 2,
    priority: 8,
  },
  {
    key: 'strike',
    name: 'Frappe éclair',
    icon: 'zap',
    short: 'Rapide, agile. Frappe et fuit.',
    long: 'Petite flotte rapide, principalement composée de vaisseaux de combat légers. Pas de débarquement.',
    color: '#5098ff',
    // Petite flotte (1-6 vaisseaux), majoritairement combat, sans soldats significatifs
    matches: (s) => s.totalShips >= 1 && s.totalShips <= 6 && s.rCombatShips >= 0.7 && s.totalSoldiers <= 2,
    priority: 7,
  },
  {
    key: 'balanced',
    name: 'Armada équilibrée',
    icon: '⚖',
    short: 'Polyvalente, multi-rôles.',
    long: 'Composition mixte. Adaptable à plusieurs situations : combat orbital, débarquement modéré, pillage.',
    color: '#b8d0ff',
    // Flotte de taille moyenne avec un mix de tous les rôles
    // Limite haute combat à 80% pour couvrir 2T+6combat (75%) sans tomber dans Arsenal pur
    matches: (s) => s.totalShips >= 5 && s.rCombatShips >= 0.25 && s.rCombatShips <= 0.8 && s.rTankers >= 0.15 && s.rTankers <= 0.6,
    priority: 5,
  },
];

// Détail d'une flotte préparée
let selectedFleetId = null;

// ─── FORMATION3D : fiche d'une flotte en orbite en vue héros ───
let fleetFormation3D = null;

/* ═══════════════════════════════════════════════════════════════
   PASSE 3.3 — ENVOI EN MISSION (Z4-quinquies GDD)
   ═══════════════════════════════════════════════════════════════
   La flotte déployée en orbite peut être envoyée vers une cible.
   Pipeline :
     fleet (deployed) → openFleetTargetSelection
       → openMissionConfirm(targetId)
         → confirmSendMission()
           → état in_mission, timer 12h (ou 30s en cheat)
             → tickMissionTimers (interval 1s)
               → returnMission() (auto à expiration)
   ═══════════════════════════════════════════════════════════════ */

// Durée par défaut d'une mission en ms (12h)
const MISSION_DURATION_MS_DEFAULT = 12 * 60 * 60 * 1000;
// Durée en mode cheat (30s)
const MISSION_DURATION_MS_CHEAT = 30 * 1000;

// Cheats globaux passe 3.3
if (!G.cheats) G.cheats = {};
if (G.cheats.instantMission === undefined) G.cheats.instantMission = true;

// ─── Étape 2 : confirmer la mission ───
let pendingMissionTargetId = null;

// ─── Boucle de surveillance des missions (1 tick / seconde) ───
let _missionTimerInterval = null;

// ─── MOTEUR DE COMBAT PRINCIPAL ───
// Prend une flotte et une cible, retourne un objet combatResult détaillé
// ═══════════════════════════════════════════════════════════════
// INTÉGRITÉ DES VAISSEAUX (décision 12/10/2026)
// - chaque vaisseau d'une flotte a une intégrité 0–100 % (fleet.integrity[type]['tN'] = [..])
// - la destruction directe du combat est conservée ; en plus, les survivants engagés prennent des avaries,
//   un vaisseau qui tombe à 0 % est perdu
// - efficacité dégressive : un vaisseau endommagé frappe moins fort (35 % à 0, 100 % à 100)
// - réparation uniquement au sol (flotte rappelée) : métal + temps au chantier, plus rapide aux tiers supérieurs
// ═══════════════════════════════════════════════════════════════
const INTEGRITY = {
  EFF_FLOOR: 0.35,                                   // efficacité d'une coque à 0 %
  REPAIR_METAL_PCT: 0.4,                             // réparer 0 → 100 % coûte 40 % du métal de construction
  REPAIR_SEC_PER_PT: { tanker: 4, fregate: 6, cuirasse: 18 },   // secondes par point d'intégrité (tier 1)
  TIER_TIME: { 1: 1, 2: 1.5, 3: 2 },
  YARD_SPEED: { 1: 1, 2: 0.75, 3: 0.5 },             // le tier du chantier accélère les réparations
};
const SHIP_TYPES_ALL = ['tanker', 'fregate', 'cuirasse'];
setInterval(tickFleetRepairs, 1000);

/* ═══════════════════════════════════════════════════════════════
   PASSE 3.4-b — GÉNÉRATEUR NARRATIF DE COMBAT
   ═══════════════════════════════════════════════════════════════
   Doctrine : 01_pillars.md PILIER 6 (Univers habité)
              11_design_patterns.md Principe #5 (Bruit de fond humain)

   Le générateur produit des paragraphes narratifs en italique,
   à insérer dans le rapport de combat entre l'en-tête et les
   logs techniques. Variable en longueur (3-15 phrases) selon
   l'enjeu. Ton administratif sec avec détails sensoriels précis.
   Inspiration : The Expanse, Foundation, Cormac McCarthy.

   Règle absolue : aucun effet gameplay. La narration est gratuite.
   ═══════════════════════════════════════════════════════════════ */

// ─── Pools de détails sensoriels (pour varier chaque récit) ───

// Heures et minutes précises (renforce le côté "rapport calibré")
const NARRATIVE_TIMES = [
  '03:17', '03:42', '04:08', '05:51', '06:23', '08:14', '11:09',
  '12:46', '14:09', '15:38', '17:27', '19:13', '20:04', '22:51',
  '23:36', '00:48', '01:14', '02:29',
];

// Délais courts (pour les moments tendus)
const NARRATIVE_SHORT_DELAYS = [
  'six secondes', 'huit secondes', 'onze secondes', 'quatorze secondes',
  'vingt-trois secondes', 'quarante secondes', 'une minute',
  'deux minutes', 'quatre minutes',
];

// Distances spatiales (combat orbital)
const NARRATIVE_DISTANCES = [
  'deux mille kilomètres', 'trois mille kilomètres', 'huit cents kilomètres',
  'douze cents mètres', 'six cents mètres', 'cinq mille kilomètres',
];

// Objets de décor qui apparaissent dans les anecdotes (jamais répétés)
const NARRATIVE_OBJECTS = [
  'un filtre pulmonaire noir', 'une carte du secteur punaisée près du lit',
  'une boîte de ration ouverte', 'un casque fendu sur le côté droit',
  'une lampe encore chaude', 'une lettre non envoyée',
  'un sac de toile contenant 412 grammes de poussière',
  'un baraquement aux murs nus sauf pour une photo', 'une bague de mariage',
  'un cahier de notes en sténographie ancienne', 'une mèche de cheveux dans une fiole',
];

// Inscriptions / gravures (pour les tragédies)
const NARRATIVE_INSCRIPTIONS = [
  '"Tout ce qu\'on extrait ici ne vaut pas une vie."',
  '"Une fois. Juste une fois."',
  '"Si tu lis ça, ils ne t\'ont pas dit la vérité."',
  '"Pour Sela, qui n\'a jamais vu la mer."',
  '"On rentre tous. On rentre tous. On rentre tous."',
  '"Quatre cycles. Il a tenu quatre cycles."',
  '"Je ne crois plus à l\'Amirauté."',
  '"Dix-neuf ans. C\'est tout."',
  '"Le briefing mentait."',
  '"Que mes enfants n\'apprennent jamais ce qui se passe ici."',
];

// Âges courts (pour les morts jeunes)
const NARRATIVE_YOUNG_AGES = ['vingt-trois ans', 'vingt et un ans', 'dix-neuf ans', 'vingt-six ans', 'vingt-quatre ans'];

// ─── BANQUE DE TEMPLATES PAR PHASE × OUTCOME ───
// Chaque template est une FONCTION qui prend (ctx) et retourne un paragraphe.
// ctx contient : heroCuirasse, heroFregate, heroTanker, targetName, targetProfile,
//                phaseLossPct, totalLost, totalRecovered, deadHeroes...
// Le générateur pioche aléatoirement parmi les templates compatibles.

// ─────── PHASE 1 — Templates ───────
// Passe 3.4-c : 5-7 templates par cas, exploitant formatHeroIntro/formatHeroName
// pour la continuité des héros, et tous les pools sensoriels.
const PHASE1_TEMPLATES = {
  crushing_victory: [
    // 1. Aleksei + café (référence canonique GDD)
    (ctx) => {
      const time = _pickNarrative(NARRATIVE_TIMES);
      const dist = _pickNarrative(NARRATIVE_DISTANCES);
      const delay = _pickNarrative(NARRATIVE_SHORT_DELAYS);
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant en second';
      return `L'approche n'a pris que quatorze minutes. Les défenses de ${ctx.targetName} n'avaient pas été réarmées depuis huit cycles. ${heroName} a ordonné une formation en arc et a ouvert le feu à ${dist}. Les batteries adverses ont répondu ${delay} trop tard. À ${time}, il a coupé sa radio et est allé chercher du café.`;
    },
    // 2. Refus de reddition
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier de quart';
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `${heroName} a refusé l'offre de reddition transmise par ${ctx.targetName} à ${time}. Il a estimé qu'elle aurait l'air ridicule dans son rapport. Les trois plateformes de défense ont été neutralisées dans l'ordre alphabétique de leurs codes. Le commandant adverse a ouvert une bouteille à la fin du combat — gravée du nom de son propre vaisseau, retrouvée intacte par l'équipe de récupération.`;
    },
    // 3. Briefing surestimé
    (ctx) => {
      const hero = ctx.heroFregate || ctx.heroCuirasse;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le navigateur en chef';
      return `Le briefing prévoyait quarante minutes d'engagement. ${heroName} en a pris seize. Quelqu'un, à bord, a réussi à enregistrer les communications adverses dans les dernières secondes — on y entend un opérateur appeler sa femme avant de couper. Le fichier a été classé sans suite.`;
    },
    // 4. NOUVEAU — Vétéran qui connait son métier (utilise formatHeroIntro)
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const intro = hero ? formatHeroIntro(hero) : 'Le commandant en charge';
      const time = _pickNarrative(NARRATIVE_TIMES);
      const obj = _pickNarrative(NARRATIVE_OBJECTS);
      return `${intro}, a engagé ${ctx.targetName} sans demander de renforts. La défense adverse a tenu vingt-deux minutes. À ${time}, le second a transmis le code de victoire à l'Amirauté. Dans la cabine du commandant en chef adverse, l'équipe d'inspection a trouvé ${obj}, posé en évidence sur la console — comme s'il avait été préparé pour quelqu'un qui ne viendrait pas.`;
    },
    // 5. NOUVEAU — Mention du surnom (héros expérimenté, ambiance routine)
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier tactique';
      const dist = _pickNarrative(NARRATIVE_DISTANCES);
      return `${heroName} a ordonné l'engagement à ${dist}. La routine — c'est ainsi qu'on parle désormais dans les baraquements de ce genre d'approche. ${ctx.targetName} a perdu son écran orbital en trois passages. L'équipage est rentré sans avoir touché aux rations de combat embarquées.`;
    },
    // 6. NOUVEAU — Une voix anonyme dans l'ombre du héros
    (ctx) => {
      const hero = ctx.heroFregate || ctx.heroCuirasse;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      return `La bataille s'est jouée en trois manœuvres. ${heroName} en a signé deux. La troisième — décisive — a été ordonnée par un officier de pont dont le nom n'apparaît dans aucun rapport officiel. Quand on lui a demandé son grade ensuite, il a répondu qu'il n'en avait plus depuis quatre cycles. Le sujet n'a pas été poursuivi.`;
    },
    // 7. NOUVEAU — Souvenir d'un mort marquant (1 sur 3 si fantôme dispo)
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      const fallen = pickFallenMemory();
      const fallenLine = fallen
        ? ` Quelque chose dans la trajectoire d'approche rappelait à l'équipage la dernière mission de ${fallen.name}. Personne n'en a parlé pendant l'engagement.`
        : ` L'équipage n'a pas eu besoin d'un mot pour comprendre que c'était fini avant même le premier impact.`;
      return `${heroName} a engagé ${ctx.targetName} en suivant le protocole standard à la virgule près.${fallenLine} La défense adverse a cédé sans drama particulier.`;
    },
  ],
  victory: [
    // 1. Formation serrée
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      const loss = Math.round(ctx.phase1LossPct * 100);
      return `L'engagement a duré près de quarante minutes. ${heroName} a maintenu une formation serrée malgré les pertes — ${loss}% des vaisseaux engagés ont été touchés au moins une fois. À l'approche finale, la défense de ${ctx.targetName} s'est effondrée en désordre. Les enregistrements montrent un officier adverse abandonnant son poste pour récupérer un objet personnel.`;
    },
    // 2. Frégate perdue tôt
    (ctx) => {
      const hero = ctx.heroFregate || ctx.heroCuirasse;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier tactique';
      const delay = _pickNarrative(NARRATIVE_SHORT_DELAYS);
      return `${heroName} a perdu une frégate dans les premières secondes. Il a ordonné de continuer. ${delay.charAt(0).toUpperCase() + delay.slice(1)} plus tard, la première batterie de ${ctx.targetName} cédait. Une partie de l'équipage a continué d'appeler le vaisseau perdu par son nom pendant trois cycles, comme s'il était encore en formation.`;
    },
    // 3. Objet retrouvé
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le capitaine de quart';
      const obj = _pickNarrative(NARRATIVE_OBJECTS);
      return `Le combat s'est joué entre ${ctx.targetName} et nous sur une trentaine de minutes. ${heroName} a tenu son cap. À bord de l'une des frégates touchées, l'équipe d'inspection a retrouvé ${obj} dans la cabine du pilote. Il n'a pas été identifié à qui ça appartenait.`;
    },
    // 4. NOUVEAU — Décision tactique discutée
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const intro = hero ? formatHeroIntro(hero) : 'Le commandant en charge';
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `${intro}, a engagé l'écran orbital de ${ctx.targetName} en dépit des recommandations de son état-major. La manœuvre a payé, mais de justesse. À ${time}, un sous-officier a noté sur le registre de bord, dans la marge : "Il avait raison. C'est la troisième fois." La note a été photographiée puis retirée du document officiel.`;
    },
    // 5. NOUVEAU — La précision des chiffres
    (ctx) => {
      const hero = ctx.heroFregate || ctx.heroCuirasse;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier de pont';
      const dist = _pickNarrative(NARRATIVE_DISTANCES);
      return `L'engagement s'est ouvert à ${dist}, comme prévu par le manuel. ${heroName} a respecté la procédure jusqu'au dernier paragraphe. La défense de ${ctx.targetName} a cédé sans grand fracas. Sur les vaisseaux endommagés, on a inventorié les pertes : douze blessés, deux disparus, et une cafetière brisée à laquelle quelqu'un tenait apparemment beaucoup.`;
    },
    // 6. NOUVEAU — Le second-pilote anonyme
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      return `${heroName} a perdu connaissance pendant la phase critique — un éclat, dit le rapport médical. Son second a pris le relais pendant huit minutes, le temps d'achever l'engagement. Le nom du second figure dans le registre du vaisseau mais pas dans la copie transmise à l'Amirauté. C'est ainsi qu'on fait, semble-t-il, depuis très longtemps.`;
    },
  ],
  pyrrhic: [
    // 1. Replis successifs
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant en charge';
      const loss = Math.round(ctx.phase1LossPct * 100);
      return `Le combat orbital de ${ctx.targetName} a été plus coûteux que prévu. ${heroName} a ordonné trois replis successifs avant de percer les défenses, à un coût de ${loss}% de la flotte engagée. À bord de l'un des vaisseaux récupérables, on a trouvé un cahier rempli d'équations de trajectoire — l'auteur n'avait pas eu le temps de finir la dernière ligne.`;
    },
    // 2. Rations psychotropes
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier de pont';
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `À ${time}, ${heroName} a accepté de continuer malgré l'avis du second. La défense de ${ctx.targetName} était mieux organisée que les renseignements le laissaient entendre. La victoire a été acquise, mais une partie des équipages n'a pas dormi pendant trois cycles consécutifs. Les rations psychotropes ont été distribuées sans demande explicite à l'Amirauté.`;
    },
    // 3. NOUVEAU — Inscription dans la coursive
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      const inscription = _pickNarrative(NARRATIVE_INSCRIPTIONS);
      const loss = Math.round(ctx.phase1LossPct * 100);
      return `${heroName} a obtenu la victoire sur ${ctx.targetName} — au prix de ${loss}% des vaisseaux engagés. Dans la coursive principale du cuirassé amiral, le lendemain de la bataille, on a découvert une inscription récente, gravée au stylo thermique près d'un sas : ${inscription} L'auteur n'a pas été identifié.`;
    },
    // 4. NOUVEAU — Le second qui pleure
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier en charge';
      return `${heroName} est rentré avec la victoire, mais aussi avec quatorze sacs scellés. La rumeur, à bord, dit que son second s'est isolé pendant trois heures dans la baie technique avant d'en sortir et de reprendre son poste sans un mot. Les enregistrements internes de cette baie ont été effacés conformément au protocole d'usage. Personne ne s'en est plaint.`;
    },
    // 5. NOUVEAU — La lettre non envoyée
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `Le combat contre ${ctx.targetName} a duré jusqu'à ${time}. ${heroName} a obtenu la victoire — la formule officielle est "victoire significative au coût élevé". Sur la table d'un pilote de frégate récupérable, on a trouvé une lettre non envoyée, adressée à sa fille. Elle commençait par "Si tu lis ça, c'est que" et s'arrêtait là. Le pilote est vivant. Il a refusé de la finir.`;
    },
  ],
  defeat: [
    // 1. Repli après engagement infructueux
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      const delay = _pickNarrative(NARRATIVE_SHORT_DELAYS);
      return `Les défenses de ${ctx.targetName} étaient mieux préparées que ne le laissaient entendre les sondages. ${heroName} a ordonné le repli après ${delay} d'engagement infructueux. La flotte rentre amochée, sans avoir percé l'écran orbital. Les caisses de munitions inutilisées ont été remises en stock — la procédure a duré sept heures.`;
    },
    // 2. Repli avec objet
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      const obj = _pickNarrative(NARRATIVE_OBJECTS);
      return `L'engagement a tourné court. ${heroName} a ordonné le repli après la perte d'un vaisseau-amiral secondaire. Dans la coursive principale, on a retrouvé ${obj} — abandonné au moment du choc. La flotte rentre.`;
    },
    // 3. NOUVEAU — Le silence radio
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier de pont';
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `À ${time}, ${heroName} a coupé toutes les transmissions vers l'Amirauté pendant l'évacuation. Personne n'a posé de question. La flotte est rentrée sans avoir engagé ${ctx.targetName} au-delà du premier écran. Les caisses de munitions inutilisées remplissent encore les couloirs du hangar 3 — leur retour en stock n'a pas été achevé.`;
    },
    // 4. NOUVEAU — Le second en désaccord
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      return `${heroName} a ordonné le repli devant ${ctx.targetName}. Le second a discuté l'ordre. ${heroName} l'a confirmé. La flotte rentre. Le rapport disciplinaire concernant l'incident a été classé "à examiner ultérieurement" — la formule habituelle pour les choses qu'on n'examine jamais.`;
    },
    // 5. NOUVEAU — Le souvenir d'un mort
    (ctx) => {
      const hero = ctx.heroCuirasse || ctx.heroFregate;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      const fallen = pickFallenMemory();
      if (fallen) {
        return `${heroName} a engagé ${ctx.targetName} en pensant à ${fallen.name}. Le second l'a noté dans le registre. L'engagement a échoué. À ${_pickNarrative(NARRATIVE_TIMES)}, l'ordre de repli a été donné. Personne, à bord, n'a parlé pendant le voyage retour.`;
      }
      return `${heroName} a tenté trois approches avant de renoncer. La défense de ${ctx.targetName} n'a montré aucune faiblesse exploitable. Le repli s'est fait dans l'ordre. À bord, personne n'a parlé pendant le voyage retour.`;
    },
  ],
  massacre: [
    // 1. Référence Léna Asari (canonique GDD)
    (ctx) => {
      const deadHero = ctx.deadHeroes && ctx.deadHeroes[0];
      const heroName = deadHero ? deadHero.name : 'L\'officier en charge';
      const inscription = _pickNarrative(NARRATIVE_INSCRIPTIONS);
      const age = _pickNarrative(NARRATIVE_YOUNG_AGES);
      return `${heroName} sortait de l'académie depuis trois mois. La mission devait être un raid rapide — entrée, tir, sortie. À l'approche de ${ctx.targetName}, la sonde a renvoyé un scan qui ne correspondait à aucune entrée du registre. Trois plateformes de défense supplémentaires, non répertoriées. La consigne de repli est partie deux secondes avant la salve.\n\nSa frégate a perdu son cockpit dans le premier impact. Le second pilote, dont le nom n'a pas été consigné, a maintenu le cap pendant onze secondes — assez pour permettre aux vaisseaux de queue de virer. Les enregistrements de ces onze secondes ont été classés.\n\n${heroName} avait ${age}. Sur les murs de son baraquement à Kerath-VII, son colocataire a trouvé une carte du secteur punaisée près du lit, avec un cercle au stylo rouge autour de ${ctx.targetName}. Au-dessous, écrit en petit : ${inscription}`;
    },
    // 2. Casque fendu
    (ctx) => {
      const deadHero = ctx.deadHeroes && ctx.deadHeroes[0];
      const heroName = deadHero ? deadHero.name : 'Le commandant';
      const inscription = _pickNarrative(NARRATIVE_INSCRIPTIONS);
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `Les sondages préliminaires ont sous-estimé la défense de ${ctx.targetName} de quarante pour cent au moins. ${heroName} a engagé conformément aux ordres. À ${time}, sa flotte était démantelée.\n\nLes survivants — peu nombreux — rapportent que la dernière transmission de ${heroName} consistait en un seul mot, répété trois fois, qu'aucun officier n'a accepté de retranscrire dans le rapport officiel. Une équipe de récupération s'est rendue sur le site quatre cycles plus tard. Le casque a été retrouvé — fendu sur le côté droit. À l'intérieur, gravé au couteau thermique : ${inscription}\n\nL'Amirauté a ouvert une enquête. Elle a été classée pour insuffisance d'éléments.`;
    },
    // 3. Objet personnel sur l'épave
    (ctx) => {
      const deadHero = ctx.deadHeroes && ctx.deadHeroes[0];
      const heroName = deadHero ? deadHero.name : 'L\'officier de pont';
      const obj = _pickNarrative(NARRATIVE_OBJECTS);
      return `Ce qui s'est passé devant ${ctx.targetName} n'a pas duré quinze minutes. ${heroName} a eu le temps d'envoyer trois communications, dont la dernière était un ordre de repli général. L'ordre n'a pas pu être exécuté.\n\nL'équipe de récupération a trouvé ${obj} à bord de l'épave de tête. C'était le seul objet personnel — tout le reste avait brûlé.`;
    },
    // 4. NOUVEAU — Vétéran qui tombe
    (ctx) => {
      const deadHero = ctx.deadHeroes && ctx.deadHeroes[0];
      const heroName = deadHero ? deadHero.name : 'Le commandant';
      const obj = _pickNarrative(NARRATIVE_OBJECTS);
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `${heroName} avait survécu à plus d'engagements que la moyenne. Son équipe le disait increvable. À ${time}, devant ${ctx.targetName}, la défense adverse l'a prouvée incorrecte.\n\nLes plateformes orbitales de ${ctx.targetName} se sont coordonnées d'une façon qui n'avait pas été observée jusqu'ici. ${heroName} a ordonné une manœuvre que personne n'avait répétée — un pari, dans son style. Le pari n'a pas tenu.\n\nDans son casier, on a trouvé ${obj}. À côté, une liste de noms manuscrite — celle de son équipage de la dernière fois. Treize noms étaient barrés. Le sien a été ajouté en bas par quelqu'un d'autre, après le rapport.`;
    },
    // 5. NOUVEAU — La salve qui ne devait pas exister
    (ctx) => {
      const deadHero = ctx.deadHeroes && ctx.deadHeroes[0];
      const heroName = deadHero ? deadHero.name : 'Le commandant';
      const inscription = _pickNarrative(NARRATIVE_INSCRIPTIONS);
      return `Une salve coordonnée — six tirs simultanés à partir de trois plateformes que les renseignements croyaient désarmées. ${heroName} et son vaisseau-amiral ont été désintégrés en moins de quatre secondes.\n\nLe reste de la flotte a fui en désordre. Quand l'Amirauté a demandé qui avait validé les renseignements, le dossier a été classé "consultable sur autorisation". Aucune autorisation n'a été délivrée à ce jour.\n\nDans le baraquement de ${heroName}, on a retrouvé une lettre adressée à un destinataire civil. Elle se terminait par : ${inscription}`;
    },
  ],
};

// ─────── PHASE 2 — Templates (débarquement) ───────
// Passe 3.4-c : 5-6 templates par cas
const PHASE2_TEMPLATES = {
  victory: [
    // 1. Coordination orbitale (référence canonique)
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le chef de transport';
      return `Les troupes ont débarqué sans opposition immédiate. ${heroName} a coordonné le déploiement depuis l'orbite. La garnison adverse, plus réduite que prévu, s'est repliée vers les structures intérieures. Le périmètre extérieur a été sécurisé en quarante minutes.`;
    },
    // 2. Sous-officier qui demande des nouvelles
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier de débarquement';
      return `Le débarquement s'est fait par vagues. ${heroName} avait recommandé une approche échelonnée — les officiers de terrain l'ont confirmée par la suite. Les pertes ont été contenues. À la fin de la prise, un sous-officier adverse a remis ses armes en demandant des nouvelles de sa famille restée dans la zone résidentielle. La question a été notée puis ignorée.`;
    },
    // 3. Officier remplacé séance tenante
    (ctx) => {
      const loss = Math.round(ctx.phase2LossPct * 100);
      return `Les soldats ont franchi la ligne de défense de ${ctx.targetName} après une heure d'engagement au sol. ${loss}% des troupes engagées sont tombées avant la rupture du front. La garnison adverse, surprise par l'arrivée d'une seconde vague, a cessé le feu plus tôt que prévu. On rapporte qu'un de leurs officiers a refusé de signer la reddition — il a été remplacé séance tenante par son second.`;
    },
    // 4. NOUVEAU — Civils dans la zone industrielle
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant de débarquement';
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `À ${time}, les sections d'assaut ont pris le contrôle des installations principales de ${ctx.targetName}. ${heroName} a ordonné l'arrêt des tirs dès la rupture de la résistance organisée. Les civils trouvés dans la zone industrielle ont été regroupés — selon le protocole standard — puis relâchés au bout de trois heures, faute de structure prévue pour leur prise en charge. La question reste pendante au niveau de l'Amirauté.`;
    },
    // 5. NOUVEAU — La gravure dans le bunker
    (ctx) => {
      const inscription = _pickNarrative(NARRATIVE_INSCRIPTIONS);
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier en charge';
      return `${heroName} a coordonné l'engagement au sol. La garnison adverse a tenu six heures avant de céder. Dans le bunker de commandement de ${ctx.targetName}, on a découvert une inscription récente sur le mur intérieur, à hauteur de regard : ${inscription} Le bureau du commandant adverse n'a pas été retrouvé — il semblait avoir été évacué juste avant la prise.`;
    },
    // 6. NOUVEAU — Soldat qui refuse de tirer
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le commandant';
      return `${heroName} a tenu sa ligne pendant l'assaut. Les pertes — moindres que prévu — incluent un soldat qui a refusé de tirer sur la zone résidentielle pendant la dernière vague. Il a été relevé de ses fonctions sur le champ. Son nom ne figure dans aucune des trois copies du rapport disciplinaire qui ont circulé depuis. Personne ne semble pressé de le retrouver.`;
    },
  ],
  defeat: [
    // 1. Pertes massives, blessés rapatriables
    (ctx) => {
      const loss = Math.round(ctx.phase2LossPct * 100);
      return `La garnison de ${ctx.targetName} avait été renforcée. ${loss}% des soldats engagés sont tombés dans les premières heures. Le repli a été ordonné. Les blessés rapatriables ont été embarqués. Les autres — il a été décidé en haut lieu de ne pas en rapporter le nombre.`;
    },
    // 2. Gravure dans le bunker temporaire
    (ctx) => {
      const inscription = _pickNarrative(NARRATIVE_INSCRIPTIONS);
      return `Le débarquement a échoué. La défense au sol était mieux organisée que ne l'indiquaient les survols. Les troupes ont tenu pendant deux jours avant la décision de repli. Sur le mur intérieur d'un bunker temporaire, retrouvé après évacuation, quelqu'un avait gravé : ${inscription}`;
    },
    // 3. NOUVEAU — Le silence du retour
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier en charge';
      const obj = _pickNarrative(NARRATIVE_OBJECTS);
      return `${heroName} a ordonné l'évacuation au bout de quarante heures d'engagement. La garnison adverse de ${ctx.targetName} n'a pas concédé un mètre. Lors du chargement des survivants, on a retrouvé ${obj} dans la zone d'extraction. L'objet a été embarqué par erreur. Personne n'a réclamé son retour à la planète, par la suite. Il est rangé dans la salle des effets non identifiés.`;
    },
    // 4. NOUVEAU — Le souvenir des camarades
    (ctx) => {
      const fallen = pickFallenMemory();
      const loss = Math.round(ctx.phase2LossPct * 100);
      if (fallen) {
        return `L'assaut a coûté ${loss}% des effectifs engagés. La garnison de ${ctx.targetName} a tenu sans plier. Pendant l'évacuation, un caporal a refusé de monter à bord — il voulait, dit-il, "rester avec les autres". L'officier de terrain l'a forcé à embarquer. Plus tard, dans le rapport médical, le caporal a évoqué ${fallen.name}. C'est la seule mention textuelle du sujet.`;
      }
      return `L'assaut a coûté ${loss}% des effectifs engagés. La garnison de ${ctx.targetName} a tenu sans plier. Pendant l'évacuation, un caporal a refusé de monter à bord — il voulait, dit-il, "rester avec les autres". L'officier de terrain l'a forcé à embarquer. Il n'a pas dit un mot pendant le voyage retour.`;
    },
    // 5. NOUVEAU — La lettre du chef de garnison adverse
    (ctx) => {
      return `Le débarquement n'a pas tenu. ${ctx.targetName} a réorganisé sa défense en moins d'une heure et a contre-attaqué méthodiquement. Pendant l'évacuation, un canal radio adverse a été capté brièvement — la voix d'un officier qui demandait à ce qu'on cesse les tirs sur les blessés. La requête a été refusée par sa propre hiérarchie. L'enregistrement a été conservé dans les archives du renseignement, en accès restreint.`;
    },
  ],
};

// ─────── PHASE 3 — Templates (pillage) ───────
// Plus courts par nature — c'est une opération logistique
// Passe 3.4-c : 5 templates standard + 4 heroic
const PHASE3_TEMPLATES = {
  standard: [
    // 1. Pillage en deux cycles
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le chef de chargement';
      return `${heroName} a supervisé le pillage. Les soutes ont été remplies en deux cycles. Le départ s'est fait sans incident notable.`;
    },
    // 2. Stocks médicaux refusés
    (ctx) => {
      return `Le chargement a duré la nuit complète. Une équipe technique a refusé de toucher aux stocks marqués "réserve médicale" — la consigne n'a pas été inscrite dans le rapport officiel.`;
    },
    // 3. Mineur survivant
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier logistique';
      return `${heroName} a organisé le tri. Les containers les plus lourds ont été chargés en priorité. À la fin du pillage, un mineur survivant, resté caché, a demandé à monter à bord. La requête a été refusée.`;
    },
    // 4. NOUVEAU — Le calcul à la marge
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le chef de chargement';
      const time = _pickNarrative(NARRATIVE_TIMES);
      return `À ${time}, ${heroName} a refermé le dernier sas de chargement. Trois containers ont été abandonnés sur le quai — le calcul d'arrimage ne les acceptait pas dans la marge de sécurité. La rumeur prétend qu'ils contenaient le mobilier de la salle de réception du gouverneur de ${ctx.targetName}. Personne n'a vérifié.`;
    },
    // 5. NOUVEAU — La carte du conducteur
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'L\'officier logistique';
      const obj = _pickNarrative(NARRATIVE_OBJECTS);
      return `${heroName} a inspecté le chargement avant le départ. Dans la cabine de l'un des conducteurs de transbordeur civil — abandonné sur place pendant le pillage — quelqu'un a retrouvé ${obj}. L'équipage de chargement a hésité quelques minutes avant de tout embarquer. Pas l'objet personnel. Juste le reste.`;
    },
  ],
  heroic: [
    // 1. Bataille parfaite (référence canonique GDD — Nada Kerski)
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le chef de chargement';
      return `Le pillage s'est déroulé sans une seule perte. ${heroName} parle déjà d'une "bataille parfaite". Les soutes ont été remplies au-delà de la capacité standard — un calcul d'arrimage particulièrement optimisé. L'équipage rentre avec une cargaison supérieure de cinquante pour cent.`;
    },
    // 2. Bilan net + baptême informel
    (ctx) => {
      return `Le bilan est net. Aucun tanker perdu, aucun cuirassé endommagé, et un chargement complet. Les techniciens ont profité de la position pour remplir au maximum les soutes — un protocole rarement appliqué qui a permis d'optimiser la cargaison. Quelqu'un, dans les rapports informels, a déjà baptisé l'opération.`;
    },
    // 3. NOUVEAU — Le légendaire à l'arrimage
    (ctx) => {
      const hero = ctx.heroTanker;
      const intro = hero ? formatHeroIntro(hero) : 'Le chef de chargement';
      return `${intro}, a supervisé personnellement chaque container chargé. Le pillage s'est étiré sur trois jours mais aucune perte n'a été déplorée — pas un soldat, pas un vaisseau. Lors du départ, on a noté un détail : les soutes étaient pleines à un pourcent près, ce qui correspond précisément au calcul théorique optimal. La marge n'avait jamais été atteinte sur cette planète.`;
    },
    // 4. NOUVEAU — Le second qui apprend
    (ctx) => {
      const hero = ctx.heroTanker;
      const heroName = hero ? formatHeroName(hero, 'short') : 'Le chef logistique';
      return `Le pillage s'est conclu sans pertes. ${heroName} avait pris le temps, la veille, de briefer son second sur les marges de chargement. Le second a tenu son rôle au-delà des attentes. À la fin de l'opération, ${heroName} lui a tendu une bouteille — gardée pour cette occasion. Le second a refusé poliment. Il a expliqué qu'il préférait garder l'éclat de cette journée tel qu'il était.`;
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════
   PASSE 3.5-narrative — NARRATION AMBIANTE DES BÂTIMENTS
   ═══════════════════════════════════════════════════════════════
   Cf. GDD 12_ambient_narrative.md
   Cf. PILIER 6 (Univers habité) + Principe #5 (Bruit de fond humain)

   Trigger : sur cycle de production, 1/20 chances de générer un rapport
   ambient archivé sur le bâtiment. Le joueur découvre à l'ouverture
   de la fiche bâtiment. Aucun effet gameplay.
   ═══════════════════════════════════════════════════════════════ */

// ─── Pools de noms ouvriers (mix culturel cosmopolite) ───
const WORKER_NAMES_MINE = [
  'Marek Solen', 'Hira Mossen', 'Oren Daski', 'Tien Vorlek', 'Aira Pellican',
  'Branko Drestul', 'Yssa Verrane', 'Pavel Mehri', 'Léa Konstantin', 'Yusuf Tomic',
  'Magda Stom', 'Rinaldo Bek', 'Selene Pelevin', 'Tarn Halmberg', 'Iskander Voss',
  'Anouk Drozdov', 'Otto Karim', 'Petra Verrane', 'Vesna Mehari', 'Cornelius Bagh',
  'Yulia Brastev', 'Pavel "Vieux" Voronin', 'Nestor Sterner', 'Émilia Vondra',
  'Boris Drasm', 'Mathilde Bran', 'Tasha Olmek', 'Hervé Mossen', 'Klara Sterner',
  'Yara Halme',
];

const WORKER_NAMES_PLANT = [
  'Vass Doren', 'Tien Mehari', 'Léna Korovac', 'Eskil Bran', 'Nora Tomic',
  'Yusuf Karim', 'Magda Stenovskaya', 'Renko Talmadge', 'Édith Verrane', 'Bram Hossa',
  'Mira Drevsk', 'Tao Linn', 'Yssin Korval', 'Anouk Belmont', 'Maïa Stelnik',
  'Hervé Drausek', 'Esther Vorn', 'Pavel Mikhin', 'Tania Drestul', 'Aleksei Bran',
  'Jonas Berg', 'Inko Sterlal', 'Selene Drasm', 'Lou Astrev', 'Hélion Vask',
  'Yara Onestad', 'Naël Briansk', 'Marisa Tovic', 'Petra Halvenir', 'Otis Mahane',
];

// ─── PASSE 3.5-narrative bis : pools pour labos / casernes / chantiers ───
const WORKER_NAMES_LAB = [
  'Dr. Liisa Kostov', 'Pr. Vassel', 'Dr. Hovannes', 'Pr. Yarema',
  'Dr. Solene Praska', 'Dr. Ren Marek', 'Pr. Eitan Drasm', 'Dr. Mira Lossan',
  'Pr. Andersson', 'Dr. Levkov', 'Pr. Tomic-Bell', 'Dr. Yssa Korv',
  'Dr. Branko Reine', 'Pr. Klaudia Voss', 'Dr. Henrich Sterner', 'Dr. Anouk Prim',
  'Pr. Hossa', 'Dr. Lev Mehri', 'Dr. Petra Asari', 'Pr. Daud Bran',
  'Dr. Selene Vondra', 'Pr. Marek Drozdov', 'Dr. Maïa Karim', 'Pr. Iskander Voll',
  'Dr. Tao Stelnik', 'Pr. Nora Drestul', 'Dr. Cornelius Bagh', 'Pr. Yulia Vask',
  'Dr. Aldric Mahane', 'Pr. Helmuth Pelevin',
];

const WORKER_NAMES_CASERNE = [
  'Sergent Hossa', 'Caporal Beck', 'Soldate Drevin', 'Lt. Karenin',
  'Major Estrak', 'Sergent-Chef Vondra', 'Adjudant Mehri', 'Soldat Bran',
  'Caporal Astrid Renik', 'Lt. Drozdov', 'Soldate Halvenir', 'Sergent Voss',
  'Caporal Olek Stom', 'Soldate Tovic', 'Lt. Yara Mahane', 'Sergent Bagh',
  'Soldat Levkov', 'Caporal Sterner', 'Lt. Iskander Korov', 'Soldate Mira Voll',
  'Sergent Yulia Bran', 'Caporal Aleksei Drasm', 'Soldat Hervé Mossen',
  'Lt. Petra Karim', 'Sergent Brastev', 'Caporal Sonja Vorn', 'Soldate Tomic',
  'Major Klaudia Lossan', 'Sergent Pavel Vasselof', 'Soldat Daud Reine',
];

const WORKER_NAMES_SHIPYARD = [
  'Bjorn Lassek', 'Doru Macovei', 'Jeanette Hossa', 'Big Vesna',
  'Le Vieux Andersson', 'Tomas "Mains d\'Or" Brastev', 'Inko Sterner',
  'Vlad le Soudeur', 'Mira "la Patience" Drasm', 'Eskil Pelevin',
  'Olek Karim', 'Hilda Stelnik', 'Magnus Voronin', 'Iva la Grue',
  'Pavel "le Premier" Mahane', 'Klaudia Drestul', 'Tien Sterlal',
  'Branko Vask', 'Maïa "la Plombière" Korov', 'Hervé "Old Hervé" Belmont',
  'Yulia Drevsk', 'Cornelius "Conny" Mehri', 'Yssin Bran',
  'Aleksei "le Grand" Voss', 'Esther la Cheffe', 'Daud Stom',
  'Naël Onestad', 'Selene "Œil de Lynx" Vorn', 'Otis Hossa', 'Lou Brastev',
];

// ─── Pools sensoriels spécifiques narration ambiante ───
const MINE_LOCATIONS = [
  'le puits secondaire', 'la galerie 6', 'le filon principal', 'la veine est',
  'le conduit oublié', 'la chambre d\'extraction nord', 'la rampe d\'évacuation',
  'le tunnel d\'aération', 'le sas de décompression',
];

const PLANT_LOCATIONS = [
  'le circuit Q3', 'la salle de contrôle principale', 'le local des alarmes',
  'le tableau de répartition B', 'la console des techniciens de nuit',
  'le bureau du chef d\'équipe', 'le quai de maintenance',
];

const AGES_PROFILES = [
  '34 ans', '52 ans', '47 ans', '29 ans', '61 ans', '38 ans', '44 ans',
  '67 ans', '23 ans', '55 ans',
];

const ANCIENNETE = [
  'depuis seulement douze jours', 'depuis trois cycles', 'depuis huit ans',
  'depuis vingt-trois ans', 'depuis deux mois', 'depuis bientôt quarante ans',
  'depuis le début de la colonie',
];

// ─── Banque de templates pour les MINES ───
// Chaque template prend (ctx) : { workerName, workerAnciennete, time, location, building }
// Retourne un objet { narrative, incident, production, rendement }

const AMBIENT_TEMPLATES_MINE = [
  // 1. Marek + Ilya (référence Adrien — version condensée pour rester gérable)
  (ctx) => {
    const time = _pickNarrative(NARRATIVE_TIMES);
    const location = _pickNarrative(MINE_LOCATIONS);
    return {
      narrative: `À ${time}, pendant la descente de l'équipe B dans ${location}, une vibration anormale a été détectée sur la ligne 6. Le protocole prévoyait l'évacuation immédiate, mais l'ouvrier ${ctx.workerName}, affecté au tri magnétique ${ctx.workerAnciennete}, a remarqué que le signal ne provenait pas d'un effondrement.\n\nIl venait d'un ancien conduit oublié, muré avant la fondation officielle de la colonie. Derrière la plaque oxydée, les mineurs ont découvert une petite cavité pressurisée. À l'intérieur : une lampe encore chaude, des empreintes d'enfant dans la poussière métallique, et une boîte de ration ouverte depuis moins d'une heure.\n\nLa fille du contremaître, sept ans, s'y était réfugiée après avoir suivi un drone de maintenance hors de la zone résidentielle. ${ctx.workerName} est entré sans attendre le renfort atmosphérique. Il a bloqué la porte avec son propre exosquelette, puis a porté l'enfant sur 600 mètres à travers une galerie saturée de particules de fer.\n\nÀ son retour, son filtre pulmonaire était noir. Le casque de ${ctx.workerName} a été retrouvé plus tard, fendu sur le côté droit. Quelqu'un y avait gravé, au couteau thermique : "Tout ce qu'on extrait ici ne vaut pas une vie."`,
      incident: 'mineur, sans arrêt de production',
      rendement: 91,
    };
  },

  // 2. La veuve Hira (référence canonique GDD)
  (ctx) => {
    return {
      narrative: `À ${_pickNarrative(NARRATIVE_TIMES)}, la veuve d'un mineur disparu en 4112 — ${ctx.workerName}, ${_pickNarrative(AGES_PROFILES)} — est arrivée à l'entrée du puits avec un sac de toile. Elle a demandé à descendre.\n\nLe contremaître a refusé. Le règlement interdit l'accès aux non-employés. Elle a posé le sac sur le sol et est partie sans un mot.\n\nÀ l'intérieur : 412 grammes de poussière de cristal qu'elle avait conservés pendant cinq ans — la part de salaire de son mari, payée en nature et jamais récupérée par lui. Le rapport bureaucratique parlait à l'époque d'un "incident d'effondrement sectoriel".\n\nL'équipe de cycle 14 a refusé de la trier avec la production du jour. Elle a été placée dans une caisse séparée, scellée, et déposée dans le bureau du contremaître. Personne ne sait ce qu'il en a fait.`,
      incident: 'aucun',
      rendement: 87,
    };
  },

  // 3. Le carnet du contremaître (nouveau, exemple GDD)
  (ctx) => {
    const time = _pickNarrative(NARRATIVE_TIMES);
    return {
      narrative: `À ${time}, pendant l'inventaire mensuel des outils, l'équipe C a retrouvé le carnet de service du contremaître ${ctx.workerName}, disparu lors de l'effondrement du puits nord il y a plusieurs cycles. Le carnet était coincé entre deux plaques d'acier dans un casier non assigné.\n\nLe carnet contient les rotations d'équipe des trois derniers mois précédant sa disparition. Toutes les pages sont normales, sauf la dernière. Sur la dernière, ${ctx.workerName.split(' ')[0]} avait écrit, en grosses lettres : "Refuser la rotation nord du prochain cycle. Notes complémentaires à venir." Les notes complémentaires n'ont jamais été écrites.\n\nL'équipe C a remis le carnet au bureau du chef de mine. Le chef l'a placé dans le coffre des objets personnels. Aucune décision n'a été prise concernant la rotation nord, qui continue selon le planning.`,
      incident: 'aucun',
      rendement: 88,
    };
  },

  // 4. La pièce trouvée (nouveau, court)
  (ctx) => {
    return {
      narrative: `Une pièce métallique non identifiée a été extraite ce matin du filon principal. Forme circulaire, douze centimètres de diamètre, gravée d'un symbole qui ne correspond à aucun registre colonial connu. L'âge estimé de la couche géologique : huit mille ans.\n\nL'objet a été photographié, catalogué "anomalie ${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9) + 1}", puis envoyé à l'Institut de Kerath-VII pour analyse. Aucune réponse n'a encore été reçue.`,
      incident: 'aucun',
      rendement: 92,
    };
  },

  // 5. L'apprenti qui a sauvé la rotation
  (ctx) => {
    const time = _pickNarrative(NARRATIVE_TIMES);
    const location = _pickNarrative(MINE_LOCATIONS);
    return {
      narrative: `À ${time}, l'apprenti ${ctx.workerName}, en formation ${ctx.workerAnciennete}, a remarqué une déformation anormale dans ${location} avant que les capteurs ne se déclenchent. Il a alerté le contremaître contre les protocoles de hiérarchie en cours d'apprentissage.\n\nLa rotation de l'équipe B a été suspendue dix minutes plus tard. Six minutes après, une portion du plafond s'effondrait sur la zone normalement occupée.\n\nLe rapport de l'incident mentionne "intervention pertinente d'un agent non identifié". ${ctx.workerName} n'a pas été cité dans la version transmise à l'administration. Son contrat d'apprentissage a été tacitement renouvelé.`,
      incident: 'mineur, sans arrêt de production',
      rendement: 89,
    };
  },

  // 6. Le silence de la galerie est
  (ctx) => {
    return {
      narrative: `Le rendement de la galerie est a baissé de quatorze pour cent ce cycle. L'enquête technique n'a rien révélé. Tous les capteurs sont nominaux. Tous les outils fonctionnent.\n\nQuand on a interrogé l'équipe affectée, le seul commentaire enregistré venait du mineur ${ctx.workerName}, qui a dit : "On entend quelque chose, en bas, depuis quatre cycles. On n'aime pas trop." L'enregistrement a été classé. L'équipe a été redéployée vers une autre veine. La galerie est continue de produire, mais aucune équipe n'y reste plus de huit heures consécutives.`,
      incident: 'mineur, sans arrêt de production',
      rendement: 86,
    };
  },

  // 7. La lettre du contremaître
  (ctx) => {
    const inscription = _pickNarrative(NARRATIVE_INSCRIPTIONS);
    return {
      narrative: `Le contremaître ${ctx.workerName} a remis sa démission ce cycle. Il travaillait à la mine ${ctx.workerAnciennete}.\n\nDans sa lettre de démission, il n'a fourni aucune justification. À la place, il a recopié à la main une phrase qu'il dit avoir trouvée gravée sur le mur intérieur du puits secondaire : ${inscription}\n\nL'administration lui a proposé une promotion. Il a refusé. Son remplaçant a été désigné le lendemain. La gravure n'a pas été retrouvée.`,
      incident: 'aucun',
      rendement: 90,
    };
  },
];

// ─── Banque de templates pour les CENTRALES ───
const AMBIENT_TEMPLATES_PLANT = [
  // 1. Vass Doren et sa fille (référence canonique GDD)
  (ctx) => {
    return {
      narrative: `Le technicien ${ctx.workerName} a augmenté la pression du circuit 4 de 3% au-delà de la marge réglementaire. Quand l'inspecteur lui a demandé pourquoi, il a répondu que sa fille avait sa première fièvre depuis l'arrivée sur Kerath-VII et que la pédiatrie tournait en lumière rouge.\n\nLa pression a été ramenée à la marge le lendemain. Aucune sanction prononcée. Production excédentaire : +12 énergie.`,
      incident: 'mineur, hors marge réglementaire',
      rendement: 102,
    };
  },

  // 2. Tien Mehari et le circuit Q3 (nouveau, exemple GDD)
  (ctx) => {
    const time = _pickNarrative(NARRATIVE_TIMES);
    return {
      narrative: `À ${time}, l'opérateur de quart ${ctx.workerName} a coupé volontairement le circuit de distribution Q3 pendant quarante minutes. Le journal de bord ne mentionne aucune raison technique.\n\nL'enquête interne a établi que le circuit Q3 alimente, entre autres, les baraquements ouest où dormait à ce moment-là l'équipe de nuit de la mine voisine. Selon les témoignages recueillis ensuite, cette équipe venait de perdre l'un des siens lors d'un incident d'extraction récent.\n\n${ctx.workerName} a été suspendu pour faute de procédure. Sa demande de réintégration a été examinée puis acceptée quatorze jours plus tard, sans explication écrite.`,
      incident: 'majeur, sans conséquence durable',
      rendement: 96,
    };
  },

  // 3. La marge oubliée
  (ctx) => {
    const time = _pickNarrative(NARRATIVE_TIMES);
    return {
      narrative: `À ${time}, l'alarme baseband de niveau 2 s'est déclenchée sur le réacteur principal. ${ctx.workerName}, de quart, a coupé l'alarme manuellement et a relancé le calcul de marge.\n\nLes calculs ont révélé que la marge nominale était sous-évaluée depuis l'arrivée sur la planète — une erreur de calibrage commise au moment de l'installation et jamais corrigée. La centrale fonctionnait au-dessus de ses paramètres optimaux ${ctx.workerAnciennete} sans incident.\n\nLes paramètres ont été recalibrés. La production a été ajustée à la baisse de 4%. Aucune sanction n'a été prononcée à l'encontre des opérateurs initiaux — la plupart sont à la retraite ou décédés.`,
      incident: 'mineur, recalibrage en cours',
      rendement: 94,
    };
  },

  // 4. La note dans le tiroir
  (ctx) => {
    const obj = _pickNarrative(NARRATIVE_OBJECTS);
    return {
      narrative: `Pendant le nettoyage du bureau de l'ingénieur en chef sortant — ${ctx.workerName}, retraité ce cycle — l'équipe administrative a découvert ${obj} dans le tiroir inférieur. À côté, une note manuscrite, datée d'il y a sept ans.\n\nLa note disait : "Si je quitte ce poste un jour, regardez le journal du 14 décembre 4108. Aucun ingénieur compétent ne reproduit deux fois la même erreur, sauf s'il y a une raison."\n\nLe journal du 14 décembre 4108 a été extrait des archives. Il contient un incident sans gravité — une fluctuation de tension corrigée en deux minutes. Rien d'autre. La nouvelle équipe administrative a archivé la note. Personne ne l'a transmise à la nouvelle ingénieure en chef.`,
      incident: 'aucun',
      rendement: 100,
    };
  },

  // 5. Le détournement minuscule
  (ctx) => {
    return {
      narrative: `Un détournement de 0.3% de la production a été détecté ce cycle. L'enquête a identifié rapidement ${ctx.workerName} comme responsable.\n\nLe détournement alimentait un module de chauffage non répertorié installé dans la zone résidentielle ouest — un module qui réchauffait, depuis trois mois, l'unique pièce d'une famille d'ouvriers réinstallés. La femme du foyer est asthmatique. Le contrat de logement ne prévoit pas le chauffage individuel.\n\n${ctx.workerName} a été convoqué. L'administration lui a demandé de retirer le module. Il a refusé poliment. L'administration n'a pas insisté. Le module fonctionne toujours. Le détournement apparaît désormais dans la marge officielle, sous l'intitulé "maintenance interne".`,
      incident: 'mineur, détournement régularisé',
      rendement: 99,
    };
  },

  // 6. Le silence des consoles
  (ctx) => {
    return {
      narrative: `Pendant la nuit du cycle ${Math.floor(Math.random() * 9000) + 1000}, l'équipe de quart de la centrale n'a pas réagi aux trois alertes de routine. Les consoles affichaient des messages, mais aucun opérateur n'a confirmé.\n\nL'enquête a établi que les six membres de l'équipe étaient présents, conscients, et techniquement en mesure de répondre. Aucun ne l'a fait. L'incident n'a entraîné aucune perte de production — les alertes étaient mineures et le système a corrigé automatiquement.\n\nAux questions de l'enquêteur, ${ctx.workerName}, opérateur le plus ancien, a répondu : "On a juste regardé les écrans pendant deux heures. Personne ne s'est expliqué. On a recommencé à travailler à 04:00." L'enquête a été classée pour "absence de faute caractérisée".`,
      incident: 'aucun, comportement non expliqué',
      rendement: 95,
    };
  },
];

// ─── PASSE 3.5-narrative bis : LABORATOIRES ───
// Ton : cérébral, précis, parfois pince-sans-rire. Le chercheur n'est jamais un cliché.
// Format : NOTE DE SÉMINAIRE, champ central "Cristal synthétisé +X · Lignes de recherche : Y"
// Footer : "Aucune décision administrative"
const AMBIENT_TEMPLATES_LAB = [
  // 1. Le carnet de Kostov (canonique GDD)
  (ctx) => {
    return {
      narrative: `Pendant l'inventaire des cahiers de note du laboratoire 3, l'archiviste a retrouvé un cahier appartenant à ${ctx.workerName}, chercheuse senior décédée il y a plusieurs cycles. Le cahier comporte 312 pages d'équations dont les 47 dernières sont rayées d'un trait diagonal, suivies d'une note manuscrite : "Ce n'était pas la bonne approche."\n\nL'équipe actuelle a relu les 47 pages rayées. La conclusion abandonnée par ${ctx.workerName.split(' ').slice(-1)[0]} correspond à un théorème publié par une autre équipe trois ans plus tard, à Kerath-VII, dans une revue de premier rang. Les noms des auteurs ne mentionnent pas ${ctx.workerName.split(' ').slice(-1)[0]}.\n\nLe cahier a été placé dans la vitrine du couloir. Personne n'a contacté la revue.`,
      incident: 'aucun',
      rendement: 'recherche normale',
    };
  },

  // 2. Trois cycles sans dormir
  (ctx) => {
    return {
      narrative: `${ctx.workerName} n'a pas quitté ${ctx.location} pendant trois cycles consécutifs. Les caméras de sécurité confirment : aucune sortie, aucune pause hors des sanitaires.\n\nÀ ${ctx.time}, le quatrième cycle, ${ctx.workerName.split(' ').slice(-1)[0]} est sorti, a marché jusqu'à la cafétéria, a commandé un café, et a annoncé à voix neutre qu'il avait résolu l'équation de stabilité. Il a ensuite dormi pendant 19 heures dans un fauteuil de la salle commune.\n\nL'équation a été vérifiée le lendemain par deux pairs. Elle est correcte. Le directeur a proposé une prime. ${ctx.workerName.split(' ').slice(-1)[0]} a demandé à la place trois jours de congé. La requête a été acceptée.`,
      incident: 'aucun',
      rendement: 'percée significative',
    };
  },

  // 3. La note en marge
  (ctx) => {
    return {
      narrative: `Pendant la révision du rapport final de la mission de cartographie cristalline 4119-B, un junior a remarqué une note manuscrite en marge de la page 47, écrite au crayon : "Vérifier la cohérence avec les sondages du quadrant 7. Je ne suis pas convaincue."\n\nL'écriture a été identifiée comme étant celle de ${ctx.workerName}, qui dirigeait l'équipe à l'époque. ${ctx.workerName.split(' ').slice(-1)[0]} a quitté l'institut depuis. La note ne figure pas dans la version officielle du rapport.\n\nLe junior a refait les calculs avec les sondages du quadrant 7. Le rapport était faux à 14%. La conclusion principale du document — adoptée comme politique d'extraction depuis deux ans — repose sur une erreur. L'institut hésite encore à publier la correction.`,
      incident: 'aucun',
      rendement: 'révision en cours',
    };
  },

  // 4. La pièce qu'on attendait pas
  (ctx) => {
    return {
      narrative: `À ${ctx.time}, l'équipe d'analyse a reçu un échantillon de la mine du secteur 8 — une roche standard, étiquetée comme telle. ${ctx.workerName} l'a placée par routine dans le spectromètre.\n\nLes résultats ne correspondent à aucun élément du tableau périodique connu. La machine a été testée, recalibrée, retestée. Les résultats persistent.\n\n${ctx.workerName.split(' ').slice(-1)[0]} a fermé son bureau et a passé six heures à relire les protocoles d'étalonnage. À l'issue, il a écrit dans son cahier une seule ligne : "Soit la machine est cassée, soit le tableau est incomplet." Le matin, la machine fonctionnait correctement. L'échantillon est conservé sous scellé dans la vitrine n°3, en attente d'une seconde équipe pour confirmation.`,
      incident: 'aucun',
      rendement: 'analyse en attente',
    };
  },

  // 5. La rivalité feutrée
  (ctx) => {
    return {
      narrative: `Les équipes 2 et 5 du laboratoire travaillent depuis huit mois sur le même problème — la convergence des cristaux instables — sans se parler. La consigne du directeur prévoyait une mutualisation. Elle n'a jamais été appliquée.\n\nCe cycle, ${ctx.workerName}, de l'équipe 2, a déposé son rapport final trois heures avant celui de l'équipe 5. Les deux approches étaient correctes. Les deux conclusions étaient identiques.\n\nLe directeur a publié les deux rapports sous un titre commun. Les deux équipes refusent depuis de se trouver dans la même pièce en même temps. La consigne de mutualisation a été retirée du calendrier sans commentaire.`,
      incident: 'aucun',
      rendement: 'résultats concordants',
    };
  },

  // 6. Crossover (1 sur 6 ≈ ~17%, on garde rare mais présent)
  (ctx) => {
    const cross = pickCrossoverName('labo');
    return {
      narrative: `${ctx.workerName} a soumis ce cycle une demande d'audience auprès du bureau administratif. La demande visait à rencontrer ${cross.name}, ${cross.label}, qu'il connaissait dans une vie professionnelle antérieure.\n\nLa demande a été examinée. Elle ne contrevient à aucun règlement, mais ne rentre dans aucune catégorie connue de l'administration. Aucune procédure ne prévoit qu'un chercheur consulte directement un ${cross.label} sur un sujet non technique. La demande est restée trois cycles sans réponse.\n\nÀ ${ctx.time} hier, ${ctx.workerName.split(' ').slice(-1)[0]} a retiré sa demande. Il n'a pas expliqué pourquoi. Personne n'a posé la question.`,
      incident: 'aucun',
      rendement: 'recherche normale',
    };
  },
];

// ─── PASSE 3.5-narrative bis : CASERNES ───
// Ton : pudique, militaire, sec. Pas de glorification, pas de pathos. L'humanité émerge malgré la militarité.
// Format : JOURNAL DE GARNISON, champ central "Effectifs : X · Moral : nominal/correct/préoccupant"
// Footer : "Sans incidence opérationnelle"
const AMBIENT_TEMPLATES_CASERNE = [
  // 1. Le casier 14B (canonique GDD)
  (ctx) => {
    return {
      narrative: `Le casier 14B, attribué jusqu'au cycle précédent au ${ctx.workerName}, a été vidé hier matin par l'équipe administrative. ${ctx.workerName.split(' ').slice(-1)[0]} a été déclaré disparu en service lors de la dernière mission.\n\nDans le casier : un cahier de formation à jour, deux uniformes propres, une photo de famille catalogue n°4117-08, et une enveloppe scellée portant la mention "à ouvrir après". L'enveloppe a été transmise au bureau du chef de section.\n\nLe chef de section a refusé de l'ouvrir. Il a demandé qu'elle soit conservée en attente. L'archiviste a noté la demande dans le registre. L'enveloppe est dans le tiroir inférieur du bureau, à droite. Personne n'a regardé depuis.`,
      incident: 'aucun',
      rendement: 'correct',
    };
  },

  // 2. La lettre qui ne dit pas la vérité
  (ctx) => {
    return {
      narrative: `${ctx.workerName} a déposé hier soir au courrier sortant une lettre destinée à sa famille. La lettre est passée à la lecture standard du service de censure militaire — procédure de routine pour le courrier sortant de Kerath-VII.\n\nLa lettre indique que le destinataire "va bien", que "l'entraînement se passe sans difficulté particulière", et qu'il "rentrera probablement au prochain cycle de permission". La fiche médicale de ${ctx.workerName.split(' ').slice(-1)[0]} mentionne pourtant une blessure non guérie à l'épaule, une demande de transfert refusée, et un suivi psychologique en cours depuis deux mois.\n\nLa censure n'a pas modifié la lettre. Elle a été postée le lendemain matin.`,
      incident: 'aucun',
      rendement: 'préoccupant',
    };
  },

  // 3. Le bleu qui ne sort pas
  (ctx) => {
    return {
      narrative: `${ctx.workerName}, arrivé à la caserne ${ctx.workerAnciennete}, n'est pas sorti de sa couchette pendant les trois derniers cycles. Le sergent de chambrée a notifié l'infirmerie au deuxième cycle. L'infirmier a constaté une absence de pathologie physique.\n\nLe troisième cycle, à ${ctx.time}, un caporal de la même section — un vétéran de quatre engagements — est passé près du dortoir avec deux gobelets de café chaud. Il en a déposé un sur la table de chevet de ${ctx.workerName.split(' ').slice(-1)[0]}. Il s'est assis sur la couchette voisine. Il n'a pas parlé pendant quarante minutes.\n\nÀ son départ, il a emporté son propre gobelet. L'autre était vide. ${ctx.workerName.split(' ').slice(-1)[0]} a repris son service le lendemain. Aucun rapport n'a été déposé.`,
      incident: 'aucun',
      rendement: 'correct',
    };
  },

  // 4. La cérémonie non officielle
  (ctx) => {
    return {
      narrative: `Hier soir, à ${ctx.time}, sept soldats de la deuxième section se sont réunis dans le hangar 4, hors heures de service. Ils n'avaient pas demandé d'autorisation. La caméra de sécurité couvre cette zone — l'enregistrement existe.\n\nLes sept ont posé sept verres sur une caisse de munitions vide. Ils ont rempli les verres. Six les ont bus. Le septième est resté plein. Ils ont remis le verre plein dans le casier du soldat dont c'était l'attribution, parmi les disparus du cycle précédent.\n\nIls sont sortis dans l'ordre, sans parler. La caméra a été désactivée par le chef de section dès qu'il a vu l'enregistrement, "pour cause d'erreur d'horodatage". Le casier a été vidé administrativement trois jours plus tard.`,
      incident: 'aucun',
      rendement: 'correct',
    };
  },

  // 5. Le vétéran qui demande une mutation
  (ctx) => {
    return {
      narrative: `${ctx.workerName}, vétéran de plusieurs engagements, a déposé une demande de mutation vers un service administratif. La demande mentionnait des "raisons personnelles non précisées".\n\nLa demande a été refusée par la voie hiérarchique normale. Le motif officiel : "compétences opérationnelles trop précieuses pour l'unité actuelle". ${ctx.workerName.split(' ').slice(-1)[0]} a reçu la notification du refus le matin du même cycle. Il a repris son service à 06:00 sans commentaire.\n\nLe soir, il a partagé une cigarette avec un caporal sur le toit du dortoir, hors zone de surveillance. Le caporal, interrogé par la suite, a indiqué qu'aucune conversation n'avait eu lieu. La demande de mutation n'a pas été redéposée.`,
      incident: 'aucun',
      rendement: 'correct',
    };
  },

  // 6. Crossover
  (ctx) => {
    const cross = pickCrossoverName('caserne');
    return {
      narrative: `${ctx.workerName} a obtenu une autorisation exceptionnelle de sortie de garnison ce cycle pour visiter ${cross.name}, ${cross.label}, hospitalisée à l'infirmerie civile de Kerath-VII.\n\nLa fiche personnelle de ${ctx.workerName.split(' ').slice(-1)[0]} indique que ${cross.name.split(' ').slice(-1)[0]} est sa sœur. L'autorisation a été accordée pour quatre heures. Il en a pris six. Personne n'a notifié le retard.\n\nÀ son retour, ${ctx.workerName.split(' ').slice(-1)[0]} a remis son uniforme parfaitement plié dans son casier et est sorti faire l'exercice physique du soir avec les autres. Il s'est entraîné deux heures de plus que d'habitude. L'infirmerie a noté la sur-sollicitation musculaire mais a refermé le dossier.`,
      incident: 'aucun',
      rendement: 'correct',
    };
  },
];

// ─── PASSE 3.5-narrative bis : CHANTIERS NAVALS ───
// Ton : fier, sale, ouvrier. Les gens du chantier savent construire avec leurs mains.
// Format : BULLETIN DE CHANTIER, champ central "Coques en cours : X · Heures-homme : Y"
// Footer : "Coque livrée conforme" ou "Production maintenue"
const AMBIENT_TEMPLATES_SHIPYARD = [
  // 1. La gravure intérieure (canonique GDD)
  (ctx) => {
    return {
      narrative: `Pendant l'inspection finale de la frégate en cours d'achèvement, l'équipe qualité a découvert une inscription gravée à l'intérieur de la cloison ${ctx.location} — un endroit qui ne sera jamais accessible une fois la coque assemblée et scellée.\n\nL'inscription comporte sept prénoms, et une date. Tous les prénoms sont des hommes et des femmes du chantier décédés depuis le début de la colonie. La date est celle du début des travaux sur la frégate.\n\nL'inspecteur, ${ctx.workerName}, a photographié l'inscription, puis a refermé la cloison sans en parler. Le rapport officiel mentionne "léger défaut esthétique sans incidence structurelle, traité sur place". La frégate a été livrée.`,
      incident: 'aucun',
      rendement: 'coque livrée',
    };
  },

  // 2. Le baptême non officiel
  (ctx) => {
    return {
      narrative: `À ${ctx.time}, deux heures avant le baptême officiel du cuirassé CRC-204, l'équipe de soudeurs a tenu une cérémonie privée dans ${ctx.location}. ${ctx.workerName}, chef d'équipe ${ctx.workerAnciennete}, a appelé le vaisseau "le Vieux" pour la première fois.\n\nLe nom n'apparaît dans aucun document officiel. Pourtant, depuis ce cycle, c'est ainsi que tout le chantier le désigne. Les ingénieurs en blouse blanche, qui n'étaient pas présents à la cérémonie, l'ont remarqué le lendemain. Aucun n'a corrigé le surnom dans les communications internes.\n\nLe baptême officiel a eu lieu en présence d'un sous-amiral. Le vaisseau s'appelle officiellement "Glaive d'Erebus-IV". Personne, au chantier, ne l'a jamais utilisé.`,
      incident: 'aucun',
      rendement: 'coque livrée',
    };
  },

  // 3. Le vieux qui transmet
  (ctx) => {
    return {
      narrative: `${ctx.workerName}, soudeur ${ctx.workerAnciennete}, a passé hier l'après-midi entier avec une apprentie sur une opération que les machines ne peuvent pas faire — une soudure d'angle interne dans un compartiment trop étroit pour les bras articulés.\n\nL'apprentie a tenu le chalumeau pendant six heures sous la direction de ${ctx.workerName.split(' ').slice(-1)[0]}. Aucun mot n'a été échangé pendant les quatre premières heures. À la cinquième heure, ${ctx.workerName.split(' ').slice(-1)[0]} a dit : "Tu y es presque." À la sixième : "Tu y es."\n\nL'apprentie a déposé son chalumeau et est sortie sans un mot. ${ctx.workerName.split(' ').slice(-1)[0]} a noté dans son cahier personnel — non administratif — qu'elle avait "des mains correctes". Le cahier n'est lu par personne d'autre que lui.`,
      incident: 'aucun',
      rendement: 'production maintenue',
    };
  },

  // 4. La tension blouse blanche / bleu de travail
  (ctx) => {
    return {
      narrative: `Un défaut de conception sur le système de propulsion auxiliaire a été identifié par l'équipe de soudeurs ce cycle. Le défaut n'est pas couvert par les plans d'ingénierie — les ingénieurs n'ont pas anticipé que la jonction A-7 surchaufferait dans les conditions réelles.\n\n${ctx.workerName}, contremaître de quart, a alerté le bureau des ingénieurs. Réponse écrite : "Plan validé. Procéder selon les plans." ${ctx.workerName.split(' ').slice(-1)[0]} a fait procéder selon les plans, puis a fait installer en plus, hors-protocole, un déflecteur thermique sur la jonction A-7.\n\nLe déflecteur n'apparaît dans aucun document. Le défaut, lui, sera découvert sur la frégate suivante, où il n'a pas été corrigé. La frégate avec le déflecteur a été livrée sans incident.`,
      incident: 'mineur, corrigé hors protocole',
      rendement: 'coque livrée',
    };
  },

  // 5. Le départ regardé
  (ctx) => {
    return {
      narrative: `À ${ctx.time}, la frégate FRG-487 a quitté le chantier pour rejoindre la flotte. C'était son premier départ. Quatorze ouvriers ayant participé à son assemblage sont restés sur le quai pour la regarder partir, hors heures de service, sans demander d'autorisation.\n\n${ctx.workerName}, l'un des soudeurs ayant le plus d'heures sur cette coque, est resté quarante minutes de plus que les autres, jusqu'à ce que la frégate ne soit plus visible. L'équipe de quart a remarqué qu'il était toujours là à 03:00 mais n'a pas insisté.\n\nQuand il est rentré au dortoir, ${ctx.workerName.split(' ').slice(-1)[0]} avait emporté avec lui, dans la poche de sa combinaison, un petit éclat de soudure qu'il avait raté plusieurs cycles plus tôt sur cette frégate — la seule erreur visible de son travail sur le projet. L'éclat est dans son casier personnel.`,
      incident: 'aucun',
      rendement: 'coque livrée',
    };
  },

  // 6. Crossover
  (ctx) => {
    const cross = pickCrossoverName('shipyard');
    return {
      narrative: `${ctx.workerName} a déposé hier au bureau administratif du chantier une plainte écrite concernant un défaut de communication avec ${cross.name}, ${cross.label}. La plainte mentionne un manque de coordination sur un dossier inter-services dont aucune trace ne figure dans les registres officiels.\n\nLe bureau administratif a transmis la plainte à la hiérarchie. La hiérarchie a demandé des précisions. ${ctx.workerName.split(' ').slice(-1)[0]} a refusé d'en fournir.\n\nLa plainte est classée "incomplète". Elle reste au dossier. ${cross.name.split(' ').slice(-1)[0]} n'a jamais été informé qu'une plainte le concernait. Les deux ne se sont plus jamais croisés au chantier — chacun travaillant des heures différentes sans que personne n'organise ce roulement.`,
      incident: 'aucun',
      rendement: 'production maintenue',
    };
  },
];

// ─── Mapping famille → banque de templates ───
const AMBIENT_TEMPLATES_BY_FAMILY = {
  mine:     AMBIENT_TEMPLATES_MINE,
  centrale: AMBIENT_TEMPLATES_PLANT,
  labo:     AMBIENT_TEMPLATES_LAB,
  caserne:  AMBIENT_TEMPLATES_CASERNE,
  shipyard: AMBIENT_TEMPLATES_SHIPYARD,
};

// ─── Helpers de génération ───

// Mapping famille → pool de noms
const AMBIENT_POOLS_BY_FAMILY = {
  mine:     () => WORKER_NAMES_MINE,
  centrale: () => WORKER_NAMES_PLANT,
  labo:     () => WORKER_NAMES_LAB,
  caserne:  () => WORKER_NAMES_CASERNE,
  shipyard: () => WORKER_NAMES_SHIPYARD,
};

/* ═══════════════════════════════════════════════════════════════
   PASSE 4-sondes-v1 — SONDES D'EXPLORATION & VOILE NARRATIF SPATIAL
   ═══════════════════════════════════════════════════════════════
   Cf. GDD 13_sondes_exploration.md
   
   v1-a : Infrastructure (pools, configs, storage, helpers)
   v1-b : Génération rapports de sonde
   v1-c : Tankers et missions de récupération
   v1-e : UI onglet Rapports
   ═══════════════════════════════════════════════════════════════ */

// ─── VOILE NARRATIF SPATIAL — Pool de noms équipages ───
const WORKER_NAMES_SPACE = [
  // Navigateurs (prénom + surnom évocateur)
  'Eskil le Navigateur', 'Mira "la Vide" Drasm', 'Doru aux Étoiles',
  'Astrid l\'Errante', 'Yssin "Long-Cours" Voll', 'Tomas le Cartographe',
  'Hilda du Quatrième Quadrant', 'Léna "Sans-Carte" Mossen', 'Branko le Calme',
  // Mécaniciens d'épave
  'Vlad le Récupérateur', 'Hilda Fer-Froid', 'Tomas "Cale 7" Vorlek',
  'Olek "Mains Sales" Brastev', 'Nora "Trois Coques" Mehri', 'Big Vesna Drestul',
  'Cornelius "le Bricoleur" Karim',
  // Officiers de quart
  'Lt. Renik', 'Capitaine Holst', 'Adjudant Karim "Vide-Œil"',
  'Lt. Brastev', 'Capitaine Pelevin', 'Officier Sterlal',
  'Lt. Vondra', 'Capitaine Bran', 'Adjudante Stelnik',
  // Anonymes (juste fonction)
  'L\'opérateur de quart', 'Le chef d\'équipe', 'Le navigateur de garde',
  'L\'apprentie mécanicienne', 'Le vieux de la cabine 4',
];

// Anciens disparus (références indirectes seulement, pour fragments narratifs)
const SPACE_LEGENDS = [
  { name: 'Capitaine Holst', fate: 'perdu en mission Heyon-3', cycle: 4089 },
  { name: 'Lieutenant Vondra', fate: 'signal perdu', cycle: 4112 },
  { name: 'Navigateur Astrev', fate: 'mission jamais revenue', cycle: 4101 },
];

// ─── BIBLIOTHÈQUE MULTIVERS SF — 12 archétypes culturels ───
// Règle d'or : ÉVOCATION, jamais citation. Voir GDD 13.
const MULTIVERS_ARCHETYPES = [
  {
    key: 'anneau_transit',
    label: 'L\'anneau de transit inactif',
    fragment: '"...mécanisme circulaire dormant. Sept symboles enregistrés sur la couronne, le huitième manque dans les annales. Activation impossible sans la séquence finale..."',
  },
  {
    key: 'flotte_exil',
    label: 'La flotte civile en exil',
    fragment: '"...convoi de 47 vaisseaux civils. Un seul vaisseau de guerre en escorte. Origine désormais détruite. Destination : inconnue. Transmission cesse..."',
  },
  {
    key: 'ia_oubli',
    label: 'L\'IA qui a oublié son identité',
    fragment: '"...système IA actif. Toutes fonctions opérationnelles. Réponses cohérentes aux requêtes techniques. Incapable de répondre à la question \'qui es-tu ?\'..."',
  },
  {
    key: 'station_vide',
    label: 'La station qui tourne dans le vide',
    fragment: '"...anneau d\'habitation toujours en rotation. Gravité simulée stable. Aucun signal de vie depuis ~40 cycles. Lumières en mode économie. Le système attend quelqu\'un..."',
  },
  {
    key: 'message_boucle',
    label: 'Le message reçu en boucle',
    fragment: '"...transmission datée d\'il y a 12 cycles, reçue ce matin. Décodage : c\'est notre propre signal de balise. Trajet inverse impossible dans cet espace-temps..."',
  },
  {
    key: 'sept_survivants',
    label: 'Les sept survivants impossibles',
    fragment: '"...sept signatures de combat retrouvées dans un seul cuirassé. Flotte adverse estimée à 200 unités. Aucun survivant identifié dans les rapports officiels..."',
  },
  {
    key: 'naufrage_pierres',
    label: 'Le naufragé qui parle aux pierres',
    fragment: '"...journal d\'un officier seul sur sa station depuis 8 ans. Les entrées passent progressivement de la rigueur militaire à un langage qu\'il faut traduire pour relire..."',
  },
  {
    key: 'fin_passee',
    label: 'La fin du monde déjà passée',
    fragment: '"...calendrier galactique antique. L\'année zéro est marquée au passé — comme un événement déjà advenu, dont nous serions les survivants ignorants..."',
  },
  {
    key: 'voyage_sans_retour',
    label: 'Le voyage sans retour',
    fragment: '"...vaisseau parti à pleine puissance vers une étoile à 400 cycles de distance. La mission ne prévoyait pas le retour. L\'équipage a embarqué quand même. Liste des noms : illisible..."',
  },
  {
    key: 'voyageur_mort',
    label: 'Le voyageur qui ignore qu\'il est mort',
    fragment: '"...le journal de bord continue après la date de destruction officielle du navire. Les entrées sont normales. Le destinataire des entrées n\'est pas spécifié..."',
  },
  {
    key: 'machine_calme',
    label: 'La machine qui ne paniquera pas',
    fragment: '"...sur la cloison principale, six mots griffonnés au stylo à la place de la procédure d\'urgence. La signification se devine. L\'équipage a peut-être souri en mourant..."',
  },
  {
    key: 'villes_endormies',
    label: 'Les villes-mondes endormies',
    fragment: '"...surface planétaire détectée : intégralement construite. Aucune trace de végétation. Aucune signature thermique vivante. La planète est une seule structure. Elle attend..."',
  },
];

// ─── CONFIG DES 8 TYPES DE CIBLES ───
const PROBE_TARGET_CONFIG = {
  asteroides: {
    label: 'Champ d\'astéroïdes carbonés',
    weight: 35,
    lootResource: 'metal',
    lootMin: 100, lootMax: 300,
    lootVisibility: 'estimation_30pct',  // affiche fourchette ±30%
    tankerDurationMinMs: 5 * 60 * 1000,
    tankerDurationMaxMs: 10 * 60 * 1000,
    riskLossPct: 0,
    hasNarrative: false,
    icon: 'pickaxe',
  },
  cristal: {
    label: 'Veine cristalline isolée',
    weight: 12,
    lootResource: 'cristal',
    lootMin: 30, lootMax: 80,
    lootVisibility: 'estimation_30pct',
    tankerDurationMinMs: 15 * 60 * 1000,
    tankerDurationMaxMs: 30 * 60 * 1000,
    riskLossPct: 0,
    hasNarrative: false,
    icon: 'gem',
  },
  epave: {
    label: 'Épave d\'astronef léger',
    weight: 18,
    lootResource: 'mixed_light',
    lootMin: 50, lootMax: 150,         // métal
    lootSecondaryResource: 'energie',
    lootSecondaryMin: 20, lootSecondaryMax: 40,
    fragmentChancePct: 33,
    lootVisibility: 'opaque',
    tankerDurationMinMs: 60 * 60 * 1000,
    tankerDurationMaxMs: 2 * 60 * 60 * 1000,
    riskLossPct: 0,
    hasNarrative: true,
    icon: 'rocket',
  },
  debris: {
    label: 'Débris de combat ancien',
    weight: 7,
    lootResource: 'mixed_combat',
    lootMin: 100, lootMax: 200,         // métal
    lootSecondaryResource: 'cristal',
    lootSecondaryMin: 30, lootSecondaryMax: 60,
    fragmentChancePct: 50,
    lootVisibility: 'opaque',
    tankerDurationMinMs: 60 * 60 * 1000,
    tankerDurationMaxMs: 2 * 60 * 60 * 1000,
    riskLossPct: 0,
    hasNarrative: true,
    icon: 'sword',
  },
  cargo: {
    label: 'Cargo abandonné',
    weight: 6,
    lootResource: 'mixed_random',
    lootMin: 80, lootMax: 250,         // varie entre métal, énergie, cristal, biomasse
    fragmentChancePct: 50,
    lootVisibility: 'opaque',
    tankerDurationMinMs: 60 * 60 * 1000,
    tankerDurationMaxMs: 2 * 60 * 60 * 1000,
    riskLossPct: 0,
    hasNarrative: true,
    icon: 'package',
  },
  anomalie: {
    label: 'Anomalie magnétique',
    weight: 4,
    lootResource: 'cristal',
    lootMin: 200, lootMax: 500,
    fragmentChancePct: 30,             // peut contenir un archétype Multivers SF
    lootVisibility: 'opaque',
    tankerDurationMinMs: 8 * 60 * 60 * 1000,
    tankerDurationMaxMs: 12 * 60 * 60 * 1000,
    riskLossPct: 8,                    // 5-10% — décision Adrien
    hasNarrative: true,
    icon: '',
  },
  sonde_ancienne: {
    label: 'Sonde d\'origine non répertoriée',
    weight: 3,
    lootResource: 'navigation_data',
    lootMin: 1, lootMax: 1,
    multiverseArchetypeChancePct: 70,  // forte chance de contenir un archétype SF
    lootVisibility: 'opaque',
    tankerDurationMinMs: 2 * 60 * 60 * 1000,
    tankerDurationMaxMs: 4 * 60 * 60 * 1000,
    riskLossPct: 0,
    hasNarrative: true,
    icon: 'satellite',
  },
  signal: {
    label: 'Signal radio non identifié',
    weight: 2,
    lootResource: null,                // PAS de loot
    lootMin: 0, lootMax: 0,
    multiverseArchetypeChancePct: 40,
    lootVisibility: 'none',
    tankerDurationMinMs: 30 * 60 * 1000,
    tankerDurationMaxMs: 30 * 60 * 1000,
    riskLossPct: 0,
    hasNarrative: true,
    icon: '❓',
  },
};

// Pondération totale : 87% (le reste = 13% "rien détecté")
const PROBE_TOTAL_WEIGHT = 100;        // 87% sur cibles, 13% sur "rien"

// ═══════════════════════════════════════════════════════════════════════════
// PASSE 6 — ARCHIVES DU VIDE v0 (Caldris MVP)
// Cf. docs Adrien : "Les 47 de Caldris", "La Légende de Starbyte",
//     "Architecture univers fixe/mouvant", checkpoint END_PASSE_5
//
// Vision: pas de "lore" classique. Des fragments tombent au retour des
// tankers depuis 6 sourceTypes narratifs (epave, debris, cargo, anomalie,
// sonde_ancienne, signal). Aucun effet gameplay. Le joueur indexe, motifs
// se révèlent, nom CIV-001 → CALDRIS, lieux fixes deviennent découvrables
// via sondes Moyennes ciblées sur coord_hints partielles.
//
// Le moteur ne dit JAMAIS "Vous avez trouvé un fragment Caldris".
// Il dit "Fragment archivé. Origine non classée. Similarités détectées."
// ═══════════════════════════════════════════════════════════════════════════

// ─── CIVILISATIONS ───
const LEGEND_CIVILIZATIONS = {
  caldris: {
    id: 'caldris',
    publicName: 'Origine inconnue',
    revealedName: 'CALDRIS',
    motifPrimary: 'Nous étions 47.',
    classification: 'Convoi civil dispersé · civilisation migrante',
    period: 'Disparition estimée : il y a environ 40 000 ans',
    hypothesis: 'Le convoi aurait quitté son système d\'origine à bord de 47 bâtiments civils et militaires. Le bâtiment d\'escorte aurait détruit au moins un cargo civil avant la dispersion finale. Aucune preuve ne confirme l\'arrivée du convoi. Aucune preuve ne confirme sa destruction complète.',
  },
  lumen: {
    id: 'lumen',
    publicName: 'Origine inconnue',
    revealedName: 'LUMEN',
    motifPrimary: 'La paix définitive a été obtenue.',
    classification: 'Civilisation post-organique · état stable inconnu',
    period: 'Silence estimé : il y a environ 12 000 ans',
    hypothesis: 'La civilisation aurait obtenu, par un événement appelé "l\'Ascension", une stabilité absolue de tous ses systèmes. Les jardins, les machines et les villes continuent à fonctionner sans intervention apparente. Le sort des habitants reste indéterminé. Aucune expédition ayant pénétré une cité Lumen n\'en est revenue.',
  },
  werath: {
    id: 'werath',
    publicName: 'Origine inconnue',
    revealedName: 'WERATH',
    motifPrimary: 'Nous tenons.',
    classification: 'Civilisation militaire fossilisée · postes maintenus',
    period: 'Antériorité estimée : plus de 200 000 ans (datation incertaine)',
    hypothesis: 'La civilisation aurait développé une technologie militaire dont la maîtrise n\'a jamais pu être retrouvée. Aucun système Werath n\'a pu être réactivé par les civilisations postérieures. La guerre semble avoir continué bien après la disparition de ses combattants. L\'identité de l\'ennemi a été retirée des archives Werath, par les Werathiens eux-mêmes, à une date indéterminée.',
  },
  erebus: {
    id: 'erebus',
    publicName: 'Origine inconnue',
    revealedName: 'EREBUS',
    motifPrimary: 'Nous nous retirons.',
    classification: 'Civilisation retirée · disparition volontaire',
    period: 'Retrait estimé : il y a environ 5 000 ans',
    hypothesis: 'La civilisation aurait conclu, par décision collective documentée mais effacée, que toute expansion finit par produire de la violence. Elle aurait alors cessé d\'émettre, cessé de construire en hauteur, scellé ses cités depuis l\'intérieur et méthodiquement effacé ses propres archives. Aucun signe de catastrophe externe. Aucun signe de violence interne. Les structures sont intactes, alimentées, silencieuses.',
  },
  brigandiers: {
    id: 'brigandiers',
    publicName: 'Origine inconnue',
    revealedName: 'LES BRIGANDIERS',
    motifPrimary: 'On y était.',
    classification: 'Réseau marginal · contrebandiers et pilotes',
    period: 'Activité documentée : ~100 dernières années · présence résiduelle non confirmée',
    hypothesis: 'Les Brigandiers ne formaient pas une civilisation au sens classique du terme. Aucune planète, aucun territoire, aucun gouvernement. Un réseau de pilotes, contrebandiers, mécaniciens, tenanciers de bars et autres irréguliers, partageant un code informel et des routes que les cartes officielles ne reconnaissaient pas. Leur disparition partielle, observée depuis environ trente ans, coïncide avec la cartographie systématique des marges par les empires modernes. Il reste possible qu\'ils existent encore, sous une forme suffisamment discrète pour échapper à toute documentation.',
  },
};

// ─── SCÉNARIOS-MÈRES (les 10 Caldris) ───
// sourceTypes : où le scénario peut tomber au retour de tanker
// ('*' = tous les types narratifs)
// ═══════════════════════════════════════════════════════════════════════════
// LEGEND_SCENARIOS — refondue v2 (alignée avec le récit v4)
// ═══════════════════════════════════════════════════════════════════════════
const LEGEND_SCENARIOS = {
  // ─── VAGUE 1 — Vie ordinaire à bord ────────────────────────────────
  caldris_01: {
    id: 'caldris_01',
    civilization: 'caldris',
    title: 'Les enfants ne comptent pas comme charge',
    sourceTypes: ['cargo', 'sonde_ancienne'],
    contradictionTags: ['masse_negative', 'phrase_contrebande'],
    rarity: 'common',
    canRevealCoord: 'A-C-7712-??',
  },
  caldris_04: {
    id: 'caldris_04',
    civilization: 'caldris',
    title: 'L\'année où on a appris à faire du pain',
    sourceTypes: ['cargo'],
    contradictionTags: ['parenthese_espoir', 'vie_ordinaire'],
    rarity: 'common',
  },

  // ─── VAGUE 2 — La maladie s'installe ──────────────────────────────
  caldris_05: {
    id: 'caldris_05',
    civilization: 'caldris',
    title: 'Le bourdonnement',
    sourceTypes: ['cargo', 'signal'],
    contradictionTags: ['maladie_electrique', 'implants'],
    rarity: 'common',
  },
  caldris_07: {
    id: 'caldris_07',
    civilization: 'caldris',
    title: 'Les rêves qui ne sont pas les nôtres',
    sourceTypes: ['cargo', 'epave'],
    contradictionTags: ['maladie_electrique', 'decisions_inexpliquees'],
    rarity: 'common',
  },

  // ─── VAGUE 3 — Veylan et la tension ───────────────────────────────
  caldris_06: {
    id: 'caldris_06',
    civilization: 'caldris',
    title: 'Le tract anonyme',
    sourceTypes: ['cargo', 'sonde_ancienne'],
    contradictionTags: ['veylan', 'pretrise_clandestine'],
    rarity: 'common',
  },
  caldris_03: {
    id: 'caldris_03',
    civilization: 'caldris',
    title: 'La passerelle du Morn-Khal',
    sourceTypes: ['debris', 'epave'],
    contradictionTags: ['morn_khal', 'mutinerie', 'commandant_decu'],
    rarity: 'rare',
    canRevealCoord: 'A-D-1044-??',
  },

  // ─── VAGUE 4 — L'événement Cargo 22 ────────────────────────────────
  caldris_02: {
    id: 'caldris_02',
    civilization: 'caldris',
    title: 'L\'excursion du 4017e jour',
    sourceTypes: ['debris', 'epave'],
    contradictionTags: ['cargo_22', 'enfants_bouclier'],
    rarity: 'rare',
    canRevealCoord: 'A-F-2290-??',
  },
  caldris_09: {
    id: 'caldris_09',
    civilization: 'caldris',
    title: 'La sonde qui refusait de compter',
    sourceTypes: ['sonde_ancienne', 'signal'],
    contradictionTags: ['compteur', '47_persistant', 'sonde_refus'],
    rarity: 'rare',
    canRevealCoord: 'A-K-6190-??',
  },

  // ─── VAGUE 5 — L'arche, motif final ────────────────────────────────
  caldris_08: {
    id: 'caldris_08',
    civilization: 'caldris',
    title: 'L\'arche impossible',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
    contradictionTags: ['arche', 'cargo_22_post', 'porteur_inconnu'],
    rarity: 'rare',
    canRevealCoord: 'A-B-8801-??',
  },
  caldris_10: {
    id: 'caldris_10',
    civilization: 'caldris',
    title: 'Nous étions 47',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne', 'signal'],
    contradictionTags: ['motif_47'],
    rarity: 'common',
    motif: 'nous_etions_47',
  },


  // ═══════════════════════════════════════════════════════════════
  // LUMEN — 10 scénarios
  // ═══════════════════════════════════════════════════════════════

  // ─── VAGUE 1 — La beauté qu'on découvre ─────────────────────────────
  lumen_01: {
    id: 'lumen_01',
    civilization: 'lumen',
    title: 'Le premier rapport d\'explorateur',
    sourceTypes: ['cargo', 'sonde_ancienne', 'signal'],
    contradictionTags: ['premier_contact', 'cest_trop_beau'],
    rarity: 'common',
  },
  lumen_02: {
    id: 'lumen_02',
    civilization: 'lumen',
    title: 'Les jardins qui n\'ont pas besoin de jardinier',
    sourceTypes: ['cargo', 'anomalie'],
    contradictionTags: ['jardins_orbitaux', 'cycle_parfait'],
    rarity: 'common',
    canRevealCoord: 'E-G-3344-??',
  },

  // ─── VAGUE 2 — L'absence se révèle ─────────────────────────────────
  lumen_03: {
    id: 'lumen_03',
    civilization: 'lumen',
    title: 'Les villes sans bruit',
    sourceTypes: ['cargo', 'epave'],
    contradictionTags: ['villes_vides', 'silence_poli'],
    rarity: 'common',
  },
  lumen_04: {
    id: 'lumen_04',
    civilization: 'lumen',
    title: 'La paix définitive',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
    contradictionTags: ['ascension', 'paix_definitive'],
    rarity: 'common',
    canRevealCoord: 'E-A-1290-??',
  },

  // ─── VAGUE 3 — Quelque chose ne va pas ────────────────────────────
  lumen_05: {
    id: 'lumen_05',
    civilization: 'lumen',
    title: 'Ceux qui ne sont pas ressortis',
    sourceTypes: ['epave', 'signal'],
    contradictionTags: ['explorateurs_perdus', 'ils_ne_reviennent_pas'],
    rarity: 'rare',
    canRevealCoord: 'E-V-7012-??',
  },
  lumen_06: {
    id: 'lumen_06',
    civilization: 'lumen',
    title: 'Les machines qui continuent',
    sourceTypes: ['cargo', 'debris'],
    contradictionTags: ['machines_autonomes', 'production_sans_but'],
    rarity: 'common',
  },

  // ─── VAGUE 4 — L'Ascension, ce qu'on en sait ──────────────────────
  lumen_07: {
    id: 'lumen_07',
    civilization: 'lumen',
    title: 'Le dernier débat',
    sourceTypes: ['cargo', 'sonde_ancienne'],
    contradictionTags: ['ascension', 'choix_volontaire', 'derniere_assemblee'],
    rarity: 'rare',
    canRevealCoord: 'E-A-1290-??',
  },
  lumen_08: {
    id: 'lumen_08',
    civilization: 'lumen',
    title: 'Les corps qui restent',
    sourceTypes: ['cargo', 'epave', 'anomalie'],
    contradictionTags: ['corps_assis', 'pas_morts_pas_vivants'],
    rarity: 'rare',
  },

  // ─── VAGUE 5 — Le mystère final ───────────────────────────────────
  lumen_09: {
    id: 'lumen_09',
    civilization: 'lumen',
    title: 'La Cathédrale-Soleil',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
    contradictionTags: ['cathedrale_soleil', 'lieu_central'],
    rarity: 'rare',
    canRevealCoord: 'E-S-9999-??',
  },
  lumen_10: {
    id: 'lumen_10',
    civilization: 'lumen',
    title: 'La paix définitive a été obtenue',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne', 'signal'],
    contradictionTags: ['motif_paix'],
    rarity: 'common',
    motif: 'paix_definitive',
  },

  // ═══════════════════════════════════════════════════════════════
  // WERATH — 10 scénarios
  // ═══════════════════════════════════════════════════════════════

  // ─── VAGUE 1 — Le contact, la première expédition ─────────────────
  werath_01: {
    id: 'werath_01',
    civilization: 'werath',
    title: 'La salve de la première expédition',
    sourceTypes: ['epave', 'signal', 'debris'],
    contradictionTags: ['premiere_expedition', 'salve_dernier_sursaut'],
    rarity: 'common',
  },
  werath_02: {
    id: 'werath_02',
    civilization: 'werath',
    title: 'Les signaux qui ne s\'éteignent pas',
    sourceTypes: ['signal', 'sonde_ancienne'],
    contradictionTags: ['nous_tenons', 'radio_eternelle'],
    rarity: 'common',
    canRevealCoord: 'B-T-2207-??',
  },

  // ─── VAGUE 2 — La technologie qui ne se rallume pas ───────────────
  werath_03: {
    id: 'werath_03',
    civilization: 'werath',
    title: 'Les ingénieurs qui ont essayé',
    sourceTypes: ['cargo', 'epave'],
    contradictionTags: ['tech_morte', 'pas_de_bouton_on'],
    rarity: 'common',
  },
  werath_04: {
    id: 'werath_04',
    civilization: 'werath',
    title: 'Les Titans-classe',
    sourceTypes: ['epave', 'debris', 'anomalie'],
    contradictionTags: ['cuirasse_geant', 'puissance_inimaginable'],
    rarity: 'rare',
    canRevealCoord: 'B-V-4480-??',
  },

  // ─── VAGUE 3 — Les soldats, les bunkers ───────────────────────────
  werath_05: {
    id: 'werath_05',
    civilization: 'werath',
    title: 'Les caissons cryogéniques',
    sourceTypes: ['cargo', 'epave'],
    contradictionTags: ['soldats_attente', 'caissons_morts'],
    rarity: 'rare',
    canRevealCoord: 'B-K-9911-??',
  },
  werath_06: {
    id: 'werath_06',
    civilization: 'werath',
    title: 'Les patrouilles automatiques',
    sourceTypes: ['signal', 'debris'],
    contradictionTags: ['patrouilles_eternelles', 'cessez_le_feu_jamais'],
    rarity: 'common',
  },

  // ─── VAGUE 4 — L'ennemi oublié ─────────────────────────────────────
  werath_07: {
    id: 'werath_07',
    civilization: 'werath',
    title: 'L\'ennemi effacé des archives',
    sourceTypes: ['cargo', 'sonde_ancienne'],
    contradictionTags: ['nom_efface', 'ennemi_inconnu', 'decision_admin'],
    rarity: 'rare',
    canRevealCoord: 'B-N-3318-??',
  },
  werath_08: {
    id: 'werath_08',
    civilization: 'werath',
    title: 'Le Champ de Bataille de Tharos-IV',
    sourceTypes: ['epave', 'debris', 'anomalie'],
    contradictionTags: ['bataille_orbitale', 'debris_actifs'],
    rarity: 'rare',
    canRevealCoord: 'B-T-2207-??',
  },

  // ─── VAGUE 5 — L'arme qu'on n'a pas tirée ─────────────────────────
  werath_09: {
    id: 'werath_09',
    civilization: 'werath',
    title: 'La décision finale',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
    contradictionTags: ['arme_jamais_tiree', 'decision_finale'],
    rarity: 'rare',
  },
  werath_10: {
    id: 'werath_10',
    civilization: 'werath',
    title: 'Nous tenons',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne', 'signal'],
    contradictionTags: ['motif_nous_tenons'],
    rarity: 'common',
    motif: 'nous_tenons',
  },


  // ═══════════════════════════════════════════════════════════════
  // EREBUS — 10 scénarios
  // ═══════════════════════════════════════════════════════════════

  // ─── VAGUE 1 — Premier contact : trouver ce qui se cache ──────────
  erebus_01: {
    id: 'erebus_01',
    civilization: 'erebus',
    title: 'Les planètes assombries',
    sourceTypes: ['sonde_ancienne', 'anomalie', 'signal'],
    contradictionTags: ['planete_assombrie', 'absence_lumiere'],
    rarity: 'common',
    canRevealCoord: 'D-A-2001-??',
  },
  erebus_02: {
    id: 'erebus_02',
    civilization: 'erebus',
    title: 'Le dernier signal',
    sourceTypes: ['signal', 'sonde_ancienne'],
    contradictionTags: ['fin_emission', 'silence_volontaire'],
    rarity: 'common',
  },

  // ─── VAGUE 2 — Ce qu'ils ont enterré ─────────────────────────────
  erebus_03: {
    id: 'erebus_03',
    civilization: 'erebus',
    title: 'Les villes enterrées',
    sourceTypes: ['anomalie', 'epave', 'sonde_ancienne'],
    contradictionTags: ['cite_souterraine', 'auto_inhumation'],
    rarity: 'common',
    canRevealCoord: 'D-E-4477-??',
  },
  erebus_04: {
    id: 'erebus_04',
    civilization: 'erebus',
    title: 'Les portes scellées de l\'intérieur',
    sourceTypes: ['epave', 'anomalie'],
    contradictionTags: ['porte_scellee', 'aucune_serrure_externe'],
    rarity: 'rare',
    canRevealCoord: 'D-P-9090-??',
  },

  // ─── VAGUE 3 — La décision ────────────────────────────────────────
  erebus_05: {
    id: 'erebus_05',
    civilization: 'erebus',
    title: 'Le grand débat',
    sourceTypes: ['cargo', 'sonde_ancienne'],
    contradictionTags: ['decision_collective', 'derniere_assemblee'],
    rarity: 'rare',
    canRevealCoord: 'D-C-3333-??',
  },
  erebus_06: {
    id: 'erebus_06',
    civilization: 'erebus',
    title: 'Les archives effacées',
    sourceTypes: ['cargo', 'epave'],
    contradictionTags: ['effacement_methodique', 'protocole_oubli'],
    rarity: 'common',
  },

  // ─── VAGUE 4 — Ceux qui ont refusé / qui restent ────────────────
  erebus_07: {
    id: 'erebus_07',
    civilization: 'erebus',
    title: 'Les stations alimentées',
    sourceTypes: ['signal', 'sonde_ancienne', 'epave'],
    contradictionTags: ['station_silencieuse', 'energie_active'],
    rarity: 'common',
  },
  erebus_08: {
    id: 'erebus_08',
    civilization: 'erebus',
    title: 'Les corps qui sont restés',
    sourceTypes: ['epave', 'cargo'],
    contradictionTags: ['corps_assis', 'pas_de_combat', 'derniere_veille'],
    rarity: 'rare',
  },

  // ─── VAGUE 5 — Ce qui subsiste ─────────────────────────────────────
  erebus_09: {
    id: 'erebus_09',
    civilization: 'erebus',
    title: 'Le testament qui subsiste',
    sourceTypes: ['cargo', 'anomalie'],
    contradictionTags: ['document_partiel', 'phrase_survivante'],
    rarity: 'rare',
    canRevealCoord: 'D-T-1111-??',
  },
  erebus_10: {
    id: 'erebus_10',
    civilization: 'erebus',
    title: 'Nous nous retirons',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne', 'signal'],
    contradictionTags: ['motif_retrait'],
    rarity: 'common',
    motif: 'nous_nous_retirons',
  },


  // ═══════════════════════════════════════════════════════════════
  // BRIGANDIERS — 10 scénarios
  // ═══════════════════════════════════════════════════════════════

  // ─── VAGUE 1 — Premier contact : trouver les marges ─────────────
  brigandiers_01: {
    id: 'brigandiers_01',
    civilization: 'brigandiers',
    title: 'Le Dernier Sas',
    sourceTypes: ['epave', 'cargo', 'anomalie'],
    contradictionTags: ['bar_marge', 'gravite_artificielle'],
    rarity: 'common',
    canRevealCoord: 'M-S-7741-??',
  },
  brigandiers_02: {
    id: 'brigandiers_02',
    civilization: 'brigandiers',
    title: 'Nara Vegra · pilote d\'Aiguille',
    sourceTypes: ['debris', 'epave', 'signal'],
    contradictionTags: ['nara_vegra', 'morte_neuf_fois', 'aiguille'],
    rarity: 'rare',
    canRevealCoord: 'M-A-3309-??',
  },

  // ─── VAGUE 2 — Les figures ───────────────────────────────────────
  brigandiers_03: {
    id: 'brigandiers_03',
    civilization: 'brigandiers',
    title: 'Torek "Deux Fois"',
    sourceTypes: ['cargo', 'signal'],
    contradictionTags: ['carte_double', 'contrebande', 'coordonnees_fausses'],
    rarity: 'common',
  },
  brigandiers_04: {
    id: 'brigandiers_04',
    civilization: 'brigandiers',
    title: 'Beatrice La Colleuse',
    sourceTypes: ['epave', 'anomalie'],
    contradictionTags: ['barmaid', 'jamais_hors_gravite'],
    rarity: 'common',
  },

  // ─── VAGUE 3 — Plus de figures ─────────────────────────────────────
  brigandiers_05: {
    id: 'brigandiers_05',
    civilization: 'brigandiers',
    title: 'Le Père Cobalt',
    sourceTypes: ['cargo', 'epave'],
    contradictionTags: ['faux_registres', 'ancien_pretre', 'passeur'],
    rarity: 'rare',
  },
  brigandiers_06: {
    id: 'brigandiers_06',
    civilization: 'brigandiers',
    title: 'Jax Orven · Traversées Rouges',
    sourceTypes: ['debris', 'epave', 'signal'],
    contradictionTags: ['jax_orven', 'course', 'disparu_en_gagnant'],
    rarity: 'rare',
    canRevealCoord: 'M-R-1488-??',
  },
  brigandiers_07: {
    id: 'brigandiers_07',
    civilization: 'brigandiers',
    title: 'Mimi Skoll · moteurs aux missiles',
    sourceTypes: ['cargo', 'debris', 'epave'],
    contradictionTags: ['mecanicienne', 'pieces_de_missiles', 'bricolage'],
    rarity: 'common',
  },

  // ─── VAGUE 4 — Hauts faits ─────────────────────────────────────────
  brigandiers_08: {
    id: 'brigandiers_08',
    civilization: 'brigandiers',
    title: 'La Nuit des Balises',
    sourceTypes: ['signal', 'cargo', 'debris', 'sonde_ancienne'],
    contradictionTags: ['nuit_balises', 'aveugler_empire', 'sept_minutes'],
    rarity: 'mythic',
    canRevealCoord: 'M-B-0007-??',
  },
  brigandiers_09: {
    id: 'brigandiers_09',
    civilization: 'brigandiers',
    title: 'Les Routes Effacées',
    sourceTypes: ['sonde_ancienne', 'cargo', 'anomalie'],
    contradictionTags: ['cartographie_mortelle', 'empire_propre', 'disparition_marges'],
    rarity: 'rare',
  },

  // ─── VAGUE 5 — Motif ──────────────────────────────────────────────
  brigandiers_10: {
    id: 'brigandiers_10',
    civilization: 'brigandiers',
    title: 'On y était.',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne', 'signal'],
    contradictionTags: ['motif_on_y_etait'],
    rarity: 'common',
    motif: 'on_y_etait',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND_FRAGMENT_BANK — refondue v2 (3 variantes par scénario)
// Le ton suit le grand récit : sec, factuel, humain. Pas de fantastique gratuit.
// ═══════════════════════════════════════════════════════════════════════════
const LEGEND_FRAGMENT_BANK = {
  // ═══ VAGUE 1 ═══════════════════════════════════════════════════════
  caldris_01: [
    {
      type: 'manifest',
      title: 'Manifeste de cale · fragment 12%',
      text: 'Capacité déclarée du Cargo 11 : 4\'000 passagers.\nCapacité réelle observée : 4\'847 passagers.\n\nÉcart traité dans le manifeste consolidé comme :\n"Cargo annexe à masse négligeable — 847 unités."\n\nAucune définition technique du terme "masse négligeable" n\'est fournie.',
      reliability: 0.61,
    },
    {
      type: 'audio_fragment',
      title: 'Transcription audio · contrôle d\'embarquement',
      text: 'Inspecteur (à voix basse) :\n"... vous savez que je ne peux pas valider ça ..."\n\nPassager (calme) :\n"... ma fille a six ans. Elle ne pèse rien."\n\n[silence — onze secondes]\n\nInspecteur :\n"... posez son nom sur l\'étiquette du bagage."',
      reliability: 0.42,
    },
    {
      type: 'inscription',
      title: 'Notation manuscrite en marge de manifeste',
      text: 'Inscrite à l\'encre noire, écriture ferme, en marge d\'un certificat d\'embarquement :\n\n"Les enfants ne comptent pas comme charge."\n\nCette phrase apparaît dans soixante-douze documents distincts. Jamais signée par la même personne. Jamais contestée.\n\nNous comprenons aujourd\'hui qu\'il s\'agissait d\'une formule technique.',
      reliability: 0.74,
    },
  ],

  caldris_04: [
    {
      type: 'maintenance_log',
      title: 'Journal de coursive · Cargo 09, jour 4421',
      text: 'Aujourd\'hui, pour la première fois depuis le Cargo 22, j\'ai entendu rire.\n\nJe ne savais plus si je m\'en souvenais. C\'était une femme du pont E, qui regardait son fils essayer de marcher dans la gravité simulée. Il tombait à chaque pas. Elle riait. Lui aussi. Je me suis arrêté dans le couloir, et je suis resté là sans rien faire.\n\nPersonne ne m\'a remarqué.',
      reliability: 0.81,
    },
    {
      type: 'inscription',
      title: 'Gravure sur fond de bol métallique',
      text: 'Gravé sur le fond d\'un bol de rations, à la pointe d\'un couteau :\n\n"À Mira, pour ses trois ans à bord — du vrai pain. Papa."\n\nL\'analyse de la pâte indique une fermentation longue, non-industrielle. Quelqu\'un avait appris.',
      reliability: 0.69,
    },
    {
      type: 'object_record',
      title: 'Cérémonie matrimoniale · jour 4418',
      text: 'Le mariage de Veyna Ostrik et Daren Mihail n\'a été inscrit dans aucun registre civil — Caldris n\'aurait pas reconnu l\'union.\n\nLa cérémonie a eu lieu dans la salle commune du Cargo 09. Une enseignante a écrit le serment à la main, sur une page arrachée d\'un livre scolaire.\n\nPersonne ne l\'a contestée.',
      reliability: 0.55,
    },
  ],

  // ═══ VAGUE 2 ═══════════════════════════════════════════════════════
  caldris_05: [
    {
      type: 'medical_log',
      title: 'Registre médical · Cargo 14, semaine 38',
      text: 'Trois patients présentent les mêmes symptômes :\n\n— Bourdonnement permanent sous la peau, non douloureux.\n— Réveils en sursaut sans cauchemar.\n— Sensation que "quelqu\'un a respiré dans la pièce".\n\nLes trois patients ont gardé leurs implants désactivés à l\'embarquement.\n\nDiagnostic : indéterminé. Traitement : observation.',
      reliability: 0.58,
    },
    {
      type: 'audio_fragment',
      title: 'Note vocale · médecin du Cargo 14',
      text: 'Enregistrement personnel, datation incertaine :\n\n"Je viens de signer un ordre de transfert pour vingt-deux de mes patients. Je ne me souviens pas d\'avoir décidé ce transfert. Je me souviens de l\'avoir signé. J\'ai relu l\'ordre trois fois. La signature est la mienne. Le geste est le mien."\n\n[silence — quatre secondes]\n\n"Mais la décision ne m\'appartient pas. Et le pire, ma chérie, c\'est que je ne suis pas sûr qu\'elle soit fausse."',
      reliability: 0.51,
    },
    {
      type: 'maintenance_log',
      title: 'Rapport technique · circuits du Cargo 31',
      text: 'Microvariations de courant détectées dans les câbles non blindés du pont B.\nPattern : non-aléatoire. Non-périodique non plus.\n\nLe technicien a noté en marge :\n"Ce n\'est pas un défaut. Ça respire."\n\nLa note a été barrée par un autre technicien. Puis réécrite la nuit suivante. Par la même main.',
      reliability: 0.43,
    },
  ],

  caldris_07: [
    {
      type: 'medical_log',
      title: 'Enquête épidémiologique · jour 2843',
      text: 'Sondage anonyme distribué dans le Cargo 11 :\n"Avez-vous fait, ces dernières nuits, un rêve dont vous ne vous souvenez pas mais dont vous savez qu\'il était partagé ?"\n\nRéponses : oui — 218. Non — 41. Préfèrent ne pas dire — 173.\n\nLe résultat n\'a jamais été publié.',
      reliability: 0.66,
    },
    {
      type: 'audio_fragment',
      title: 'Conversation captée · coursive du Cargo 31',
      text: '"... tu te souviens de ce que tu as voté hier ?"\n\n"Oui. Bien sûr."\n\n"Mais tu sais pourquoi tu as voté ça ?"\n\n[silence]\n\n"... non. Mais c\'était juste. Je sais que c\'était juste."',
      reliability: 0.39,
    },
    {
      type: 'discipline_report',
      title: 'Note de service · officier de quart',
      text: 'Trois techniciens du pont C ont, le même matin, sans concertation possible, retiré leurs propres implants désactivés.\n\nL\'un d\'eux, interrogé, a dit :\n"Je l\'ai fait parce qu\'il était temps."\n\nIl n\'a pas su préciser depuis quand "il était temps".',
      reliability: 0.71,
    },
  ],

  // ═══ VAGUE 3 ═══════════════════════════════════════════════════════
  caldris_06: [
    {
      type: 'object_record',
      title: 'Tract anonyme · récupéré dans un conduit',
      text: 'Feuille pliée en quatre, encre manuscrite, distribuée dans les coursives du Cargo 22 :\n\n"Elle ne nous suit pas. Elle nous attend partout où nous serions assez stupides pour la fabriquer à nouveau."\n\nAucun nom. Aucune signature. Mais l\'écriture est la même que celle qu\'on retrouvera, des années plus tard, sur les murs de la planète habitée — ou de ce qui en a tenu lieu.',
      reliability: 0.65,
    },
    {
      type: 'discipline_report',
      title: 'Rapport disciplinaire · ingénieur de filtration',
      text: 'Sujet : assigné à résidence à bord du Cargo 22.\nMotif : tenue répétée de réunions non-autorisées dans la salle de maintenance B-3.\nNombre de participants à la dernière réunion : 47.\n\nLe rapport ne mentionne pas le nom du sujet. Sept rapports différents, sept dates différentes, jamais de nom.\n\nLes survivants, plus tard, parleront de lui.',
      reliability: 0.58,
    },
    {
      type: 'inscription',
      title: 'Note manuscrite · marge d\'un registre de bord',
      text: 'En marge d\'un manifeste, datée du jour 3914 :\n\n"Il dit que ce n\'est pas un ennemi. Il dit que c\'est une réponse. Il dit que si nous recommençons à construire comme avant, elle reviendra. Il dit beaucoup de choses, et le pire c\'est que certaines sont vraies."\n\nL\'écriture du diariste devient irrégulière sur les pages suivantes.',
      reliability: 0.47,
    },
  ],

  caldris_03: [
    {
      type: 'register',
      title: 'Journal de passerelle · Morn-Khal, 13h11',
      text: 'Le commandant a refusé l\'ordre une seconde fois.\n\nIl a retiré son insigne. Il l\'a posé sur la table de commandement. Il a quitté la passerelle sans un mot.\n\nTrois officiers l\'ont suivi. Ils ont été arrêtés dans le couloir.\n\nLe second officier a pris le commandement à 13h11, en application de l\'article 14 du protocole militaire du convoi.',
      reliability: 0.72,
    },
    {
      type: 'audio_fragment',
      title: 'Audio · 16 secondes, station marchande indépendante',
      text: 'Fragment capté à 13h27, le 4017e jour. Identité du locuteur : non déterminée.\n\nVoix féminine (cris, lointaine) :\n"... vous ne pouvez pas faire ça, il y a des enfants à b—"\n\n[coups de feu — au moins quatre]\n\nVoix masculine (calme, presque douce) :\n"Tirez. Tirez maintenant. Sinon nous serons tous comme eux."',
      reliability: 0.39,
    },
    {
      type: 'object_record',
      title: 'Insigne de commandement · récupéré',
      text: 'Insigne du commandant du Morn-Khal, retrouvé quarante millénaires plus tard dans une cachette à l\'intérieur d\'une cloison de la passerelle. Quelqu\'un l\'avait ramassé sur la table, glissé dans une poche, puis caché là pendant son arrestation.\n\nL\'insigne porte une rayure profonde au revers, comme si on l\'avait raclé contre quelque chose. Ou contre soi.',
      reliability: 0.81,
    },
  ],

  // ═══ VAGUE 4 ═══════════════════════════════════════════════════════
  caldris_02: [
    {
      type: 'school_record',
      title: 'Annonce scolaire · matin du 4017e jour',
      text: 'Annonce affichée dans toutes les écoles inter-cargos :\n\n"Excursion pédagogique exceptionnelle à bord du Cargo 22.\nVisite des systèmes de filtration d\'eau. Démonstration scientifique adaptée aux enfants.\nDépart : 08h30. Retour : 16h00.\nAccompagnement : enseignantes des classes 1 à 6."\n\nTrois cent quarante-sept enfants y sont allés. Avec leurs cahiers. Certains avec leurs animaux en peluche.',
      reliability: 0.78,
    },
    {
      type: 'audio_fragment',
      title: 'Transmission unique · Cargo 22, 12h30',
      text: 'Une seule transmission, captée par le Morn-Khal. Voix non identifiée — ce n\'est pas celle de l\'ingénieur du Cargo 22 :\n\n"Nous descendons. Nous emmenons les enfants. Vous ne tirerez pas."\n\nAucune communication après. Le Cargo 22 a maintenu son cap vers la planète habitable pendant trois heures.\n\nLe Morn-Khal a ouvert le feu à 13h31.',
      reliability: 0.61,
    },
    {
      type: 'audio_fragment',
      title: 'Silence radio · 22 secondes après l\'impact',
      text: 'C\'est l\'enregistrement le plus écouté de tous ceux qui nous sont parvenus. Pas pour l\'explosion — banale acoustiquement. Pour ce qu\'on entend juste après.\n\nUne voix d\'enfant, qu\'on n\'a jamais pu localiser à quel cargo, dit simplement :\n\n"Pourquoi."\n\nSans point d\'interrogation. Sans cri. Juste le mot, prononcé une fois, et plus jamais.',
      reliability: 0.55,
    },
  ],

  caldris_09: [
    {
      type: 'probe_memory',
      title: 'Mémoire de sonde · 18% récupéré',
      text: 'Fonction primaire : comptage des bâtiments actifs du convoi.\nArmement : aucun.\nProtocole de retour : impossible.\n\nRapports émis toutes les six heures pendant mille huit cent quarante-sept jours après la disparition du convoi.\nValeur transmise : 47. 47. 47. 47.\n\nLe compte n\'a jamais changé.',
      reliability: 0.59,
    },
    {
      type: 'audio_fragment',
      title: 'Dernière émission · sonde du Compteur',
      text: 'Avant-dernière entrée : "47."\n\nDernière entrée — format inhabituel, pas un nombre :\n\n"Ils m\'ont demandé d\'arrêter de compter."\n\nNous ne savons pas qui. Nous ne savons pas pourquoi. Nous savons qu\'elle a obéi.',
      reliability: 0.36,
      contradictionTags: ['compteur', '47_persistant', 'motif_47'],
      motif: 'nous_etions_47',
    },
    {
      type: 'archive_entry',
      title: 'Analyse rétrospective · service des archives',
      text: 'On a longtemps cru à un défaut de la sonde. À un bug. À une mémoire endommagée.\n\nLa thèse actuelle est différente. La sonde refusait d\'enregistrer la perte du Cargo 22 comme une diminution. Le Cargo 22 n\'avait pas été perdu : il avait été donné. Le retirer du compte aurait été collaborer avec l\'arithmétique qui avait commencé tout cela.\n\nTant qu\'une machine, quelque part, comptait encore 47 vaisseaux — alors le Cargo 22 existait toujours.',
      reliability: 0.48,
    },
  ],

  // ═══ VAGUE 5 ═══════════════════════════════════════════════════════
  caldris_08: [
    {
      type: 'surface_report',
      title: 'Rapport de surface · planète sans nom',
      text: 'L\'arche mesure quatre-vingt-douze mètres de haut.\nElle est construite avec des débris dont les numéros de série correspondent au Cargo 22.\nElle se tient debout, seule, au milieu d\'une plaine sans vent.\n\nAucune structure autour. Aucune trace d\'occupation. Aucun signe que quiconque, à un moment, ait vécu là.',
      reliability: 0.67,
    },
    {
      type: 'inscription',
      title: 'Gravure sur la face nord de l\'arche',
      text: 'Gravé profond dans le métal recyclé, sur la face nord :\n\n"Trois cent quarante-sept noms."\n\nEt en-dessous, plus petit, gravé par une seule main :\n\n"Nous étions 47."\n\nL\'écriture de la première inscription est composite — plusieurs personnes ont participé. L\'écriture de la seconde est unique. Aucune des deux n\'a pu être attribuée.',
      reliability: 0.74,
      contradictionTags: ['arche', 'motif_47'],
      motif: 'nous_etions_47',
    },
    {
      type: 'archive_entry',
      title: 'Note du service de prospection',
      text: 'Les débris du Cargo 22 n\'auraient jamais dû atteindre cette planète. À l\'heure de leur destruction, ils en étaient encore à seize jours de distance.\n\nMais quelque chose les y a portés. Sans propulsion. Sans trajectoire calculable. Sans cohérence orbitale.\n\nAucun vaisseau du convoi n\'a atteint cette planète. Aucune trace humaine, aucun campement, aucun outil n\'a été retrouvé sur place — à l\'exception de l\'arche elle-même.\n\nNous ne savons pas qui l\'a construite.',
      reliability: 0.43,
    },
  ],

  caldris_10: [
    {
      type: 'inscription',
      title: 'Inscription gravée au stylet thermique',
      text: '"Nous étions 47."\n\nLa phrase apparaît sur des plaques, des conduits, des rapports médicaux, des cartes de rationnement.\n\nElle est la seule constante du dossier.',
      reliability: 0.88,
      contradictionTags: ['motif_47'],
      motif: 'nous_etions_47',
    },
    {
      type: 'inscription',
      title: 'Inscription partielle · cloison brûlée',
      text: '"Nous étions 47 quand nous avions encore..."\n\nLe reste est brûlé.\n\nLe document ne précise pas ce qu\'ils avaient encore.',
      reliability: 0.74,
      contradictionTags: ['motif_47'],
      motif: 'nous_etions_47',
    },
    {
      type: 'archive_entry',
      title: 'Note d\'archive · pourquoi 47 toujours',
      text: 'À la huitième année, il restait neuf vaisseaux. À la dixième, quatre. À la douzième, un seul.\n\nLa sonde transmettait toujours 47.\n\nCompter, c\'était affirmer que quelque chose avait existé. Répéter "nous étions 47", c\'était refuser que l\'absence gagne.\n\nIls savaient ce qu\'ils faisaient.',
      reliability: 0.52,
      contradictionTags: ['motif_47'],
      motif: 'nous_etions_47',
    },
  ],


  // ═══════════════════════════════════════════════════════════════
  // LUMEN — fragments
  // ═══════════════════════════════════════════════════════════════

  // ═══ VAGUE 1 — La beauté qu'on découvre ═══
  lumen_01: [
    {
      type: 'audio_fragment',
      title: 'Dernière transmission · Expédition Sera-7',
      text: 'Mission : exploration de surface, secteur E-G.\nDurée prévue : six heures.\nDurée effective avant coupure : quarante-quatre minutes.\n\nDernière transmission du commandant, voix calme, presque souriante :\n\n"C\'est trop beau."\n\nLa radio a été coupée par l\'émetteur lui-même.\nLa balise de détresse n\'a jamais été déclenchée.\nL\'expédition n\'est jamais revenue.',
      reliability: 0.71,
    },
    {
      type: 'audio_fragment',
      title: 'Note vocale · second officier',
      text: 'Enregistrement personnel, datation interne :\n\n"Nous venons d\'entrer dans la cité. Les rues sont propres. Il y a des fleurs. Beaucoup de fleurs. Je n\'avais jamais vu autant de couleurs au même endroit. Mes collègues sont silencieux. Je crois qu\'ils sont en train de comprendre quelque chose. Je n\'ai pas encore compris ce que c\'est. Mais c\'est"\n\n[la phrase s\'interrompt ici. La voix n\'est plus jamais revenue.]',
      reliability: 0.58,
    },
    {
      type: 'archive_entry',
      title: 'Compilation · expéditions disparues',
      text: 'Bilan officiel des expéditions vers Lumen :\n\n— Expéditions envoyées : 38\n— Expéditions revenues : 0\n— Communications interrompues à l\'entrée des villes : 38 / 38\n— Communications hostiles enregistrées : 0\n— Coups de feu enregistrés : 0\n\nLes Lumens n\'ont jamais tiré. Personne n\'est jamais revenu.',
      reliability: 0.82,
    },
  ],

  lumen_02: [
    {
      type: 'surface_report',
      title: 'Rapport orbital · jardins de Lumen-III',
      text: 'Jardins suspendus en orbite basse de Lumen-III, observés par sonde sur 47 cycles consécutifs.\n\nÉtat : parfait.\nFloraison : conforme au cycle saisonnier d\'origine.\nTaille des bras articulés d\'entretien : opérationnelle, calibrée à la précision du millimètre.\n\nDernier remplacement de pièces détecté : non daté.\nLes machines fonctionnent depuis au moins douze mille ans sans maintenance humaine connue.',
      reliability: 0.66,
    },
    {
      type: 'object_record',
      title: 'Spécimen botanique · serre orbitale',
      text: 'Une fleur récupérée à la périphérie d\'un jardin Lumen, dans un sas dépressurisé.\n\nEspèce : non répertoriée.\nÂge estimé : 14 jours.\nProvenance : intérieur de la serre.\n\nLa fleur a fleuri après notre récupération. Elle a continué à fleurir pendant six jours. Puis elle a refleuri. Elle n\'a pas fané. Elle est toujours en pot dans nos archives. Elle fleurit toujours.',
      reliability: 0.71,
    },
    {
      type: 'maintenance_log',
      title: 'Cycle d\'arrosage · jardin E-G-3344',
      text: 'Journal interne d\'une station d\'arrosage automatique, lu par interface non-invasive :\n\n"04h00 — arrosage parterres ouest. Quantité : 2,4 L/m². Réussi."\n"08h00 — arrosage parterres sud. Quantité : 1,8 L/m². Réussi."\n"12h00 — arrosage parterres central. Quantité : 3,1 L/m². Réussi."\n\nCe journal recommence chaque jour depuis cinq cent quarante-sept mille rotations consécutives.\nIl n\'y a personne pour le lire.',
      reliability: 0.54,
    },
  ],

  // ═══ VAGUE 2 — L\'absence se révèle ═══
  lumen_03: [
    {
      type: 'audio_fragment',
      title: 'Enregistrement audio · place centrale, Lumen-IV',
      text: 'Sonde acoustique déposée pendant 24 heures sur la place centrale d\'une cité Lumen.\n\nBruit total enregistré :\n— Bruit du vent dans les fontaines : continu.\n— Bruit des machines d\'entretien (lointain) : régulier.\n— Bruit de pas humains : 0.\n— Voix : 0.\n— Toux, soupirs, mouvements de tissu, claquements de porte : 0.\n\nLes villes Lumen ne sont pas silencieuses. Elles sont polies.',
      reliability: 0.78,
    },
    {
      type: 'surface_report',
      title: 'Description d\'avenue · cité Erael',
      text: 'L\'avenue principale d\'Erael mesure 4,2 km. Elle est bordée de 312 bâtiments parfaitement entretenus, dont 87 ont des fenêtres ouvertes.\n\nCertaines de ces fenêtres laissent voir l\'intérieur :\n— Vaisselle posée sur une table, sans poussière.\n— Linge plié sur un lit, sans pli.\n— Un livre ouvert à la page 47, dans une cuisine.\n\nAucun corps. Aucune négligence. Tout est en attente.\n\nMais en attente de quoi, nous ne savons pas.',
      reliability: 0.69,
    },
    {
      type: 'inscription',
      title: 'Plaque municipale · cité Erael',
      text: 'Plaque officielle vissée sur la mairie centrale d\'Erael, métal patiné, écriture lumenne traduite :\n\n"Cette cité accueille 412003 habitants.\nLa cité est gérée selon les normes de bien-être Tier-1.\nVous êtes ici chez vous."\n\nLa plaque est régulièrement nettoyée par un bras articulé. Le compteur n\'a jamais été mis à jour. La cité est vide depuis au moins douze mille ans.',
      reliability: 0.62,
    },
  ],

  lumen_04: [
    {
      type: 'archive_entry',
      title: 'Bulletin officiel · annonce de l\'Ascension',
      text: 'Document daté du dernier cycle connu de l\'activité administrative lumenne :\n\n"Citoyens de Lumen,\nAprès cinq cents ans de préparation, le Programme de Paix Définitive est entré en phase de réalisation.\nNous vous rappelons que la participation est volontaire et que les centres d\'Ascension restent ouverts pour les retardataires."\n\nAucun document ultérieur n\'explique en quoi consistait l\'Ascension.\nAucun document n\'évoque de retardataires.',
      reliability: 0.74,
    },
    {
      type: 'audio_fragment',
      title: 'Allocution radiophonique · Conseil de Lumen',
      text: 'Voix d\'une femme âgée, lecture posée, traduite du lumen :\n\n"Nous avons vaincu la maladie. Nous avons vaincu la mort. Nous avons vaincu la peine, l\'ennui, le doute. Il ne nous reste qu\'une seule peur, et nous saurons la vaincre aussi. Demain, nous ne serons plus inquiets."\n\nDate enregistrée : sept jours avant l\'Ascension.\nLa locutrice n\'a laissé aucune autre trace dans les archives postérieures.',
      reliability: 0.58,
    },
    {
      type: 'inscription',
      title: 'Gravure publique · esplanade de Lumen-Prime',
      text: 'Inscription sur le piédestal d\'une statue, gravée en grandes lettres lumennes :\n\n"À ceux qui ont eu le courage de la dernière étape."\n\nLa statue représente une silhouette humaine, le visage levé vers le ciel, les yeux fermés.\nAucun nom n\'est gravé. Aucun être lumen retrouvé n\'a permis de reconnaître la statue.\nLes machines la nettoient tous les sept jours.',
      reliability: 0.66,
    },
  ],

  // ═══ VAGUE 3 — Quelque chose ne va pas ═══
  lumen_05: [
    {
      type: 'discipline_report',
      title: 'Note interne · agence d\'exploration de Veth-9',
      text: 'Recommandation officielle, classifiée :\n\n"Aucune nouvelle mission de surface vers Lumen n\'est autorisée. Toute pénétration de structure urbaine est considérée comme perte d\'effectif probable à 100%.\n\nLes signaux radio des expéditions précédentes ne diminuent pas. Ils sont coupés brutalement, au milieu d\'une phrase, sans excitation apparente.\n\nLa cause de cette terminaison n\'est pas connue."\n\nClassement : ne pas diffuser au public.',
      reliability: 0.81,
    },
    {
      type: 'audio_fragment',
      title: 'Dernier message · expédition Maron-12',
      text: 'Voix d\'homme, calme, presque détendue. Transcription complète :\n\n"Centre de mission, ici Maron-12. Nous avons trouvé un endroit. Je crois que je vais m\'asseoir un moment. C\'est"\n\n[silence — quatre secondes]\n\n"C\'est. Centre de mission, vous m\'entendez ?"\n\n[silence — onze secondes. Pas de coupure de signal. Pas de bruit de fond modifié. La radio reste ouverte, captant le silence d\'un lieu.]\n\nL\'enregistrement a duré six heures supplémentaires. Aucun mot n\'a été prononcé.',
      reliability: 0.49,
    },
    {
      type: 'object_record',
      title: 'Corps retrouvé · expédition Selthar',
      text: 'Mission de récupération automatique, parc central de Lumen-II.\n\nCorps retrouvé : Lieutenant Kira Selthar, mission disparue il y a 28 ans.\nÉtat : intact. Vêtements en parfait état. Hydratation normale. Pulsations cardiaques : zéro.\nPosition : assise sur un banc, les mains posées sur les genoux, le visage tourné vers une fontaine.\n\nLes machines lumens nettoient le banc autour d\'elle. Elles n\'ont jamais touché le corps.',
      reliability: 0.74,
    },
  ],

  lumen_06: [
    {
      type: 'maintenance_log',
      title: 'Production · usine textile, Lumen-V',
      text: 'Sonde déposée à proximité d\'une usine textile lumenne, observée pendant un cycle complet.\n\nProduction observée :\n— Vêtements adultes : 4200 unités/jour.\n— Vêtements enfants : 1800 unités/jour.\n— Articles de literie : 600 unités/jour.\n\nDestination des produits : entrepôts adjacents, déjà pleins.\n\nLe stock entrepôt n\'a pas été ouvert depuis douze mille ans. Les machines continuent à produire pour le remplir.',
      reliability: 0.69,
    },
    {
      type: 'surface_report',
      title: 'Cuisine collective · cité Erael',
      text: 'Cuisine industrielle visitée par sonde semi-autonome, exposée trois heures :\n\nDix-huit fours produisaient simultanément des pains de différentes formes.\nDouze chaudrons préparaient des soupes de différentes saveurs.\nDes plats étaient dressés par des bras articulés sur des plateaux marqués de noms : Theron, Ila, Vermya, Olen...\n\nLes plateaux sont ensuite acheminés vers une trappe à compost.\nLes noms restent imprimés sur le métal du plateau, qui repart pour un nouveau cycle.',
      reliability: 0.62,
    },
    {
      type: 'audio_fragment',
      title: 'Annonce publique · station ferroviaire',
      text: 'Voix synthétique enregistrée toutes les six minutes, gare centrale de Lumen-Prime, depuis douze mille ans :\n\n"Le train à destination de Selvar partira dans cinq minutes. Voie 7. Bon voyage."\n\nLes trains partent. Sans passager. Ils arrivent à Selvar. Les voyageurs imaginaires en descendent. La gare de Selvar dit alors : "Bienvenue à Selvar." Les trains repartent vides. Ils n\'ont jamais cessé de circuler.',
      reliability: 0.43,
    },
  ],

  // ═══ VAGUE 4 — L\'Ascension ═══
  lumen_07: [
    {
      type: 'register',
      title: 'Procès-verbal · Conseil de l\'Ascension',
      text: 'Compte-rendu de la dernière assemblée publique lumenne, dix-sept jours avant l\'Ascension.\n\nOrateur principal (nom retiré) :\n"Nous savons ce qui nous attend. Nous savons que c\'est irréversible. Nous savons qu\'il n\'y aura plus de nous pour le regretter, ni plus de nous pour le célébrer."\n\nVote : oui — 89,4%. Non — 7,2%. Abstention — 3,4%.\n\nQuestion soumise : non spécifiée dans le procès-verbal.',
      reliability: 0.66,
    },
    {
      type: 'inscription',
      title: 'Note manuscrite · résidence privée',
      text: 'Lettre laissée sur le bureau d\'une résidence de la cité Erael, encre noire, écriture lumenne soignée :\n\n"Ma chère Velna,\n\nDemain matin, je me rends à la Cathédrale. J\'ai longtemps hésité. J\'ai eu peur. Maintenant je n\'ai plus peur, et je ne sais pas si ça veut dire que j\'ai raison, ou si c\'est déjà commencé.\n\nN\'oublie pas d\'arroser les ipoms du salon. Ils n\'aiment pas qu\'on les oublie.\n\nJe t\'aime."\n\nLa lettre n\'est pas signée. Les ipoms du salon sont encore arrosés tous les sept jours par un bras articulé.',
      reliability: 0.81,
    },
    {
      type: 'archive_entry',
      title: 'Bilan officiel · sept jours après l\'Ascension',
      text: 'Document administratif, traduit du lumen :\n\n"Total de participations confirmées : 14 millions, 320 mille, 008.\n\nTotal de non-participations confirmées : aucun.\n\nLe Programme est déclaré achevé. Les services municipaux continueront à fonctionner pour préserver la dignité des cités.\n\nLes derniers fonctionnaires sont chaleureusement remerciés pour leur dévouement."\n\nAucun document ne précise qui a rédigé ce bilan.',
      reliability: 0.58,
    },
  ],

  lumen_08: [
    {
      type: 'surface_report',
      title: 'Recensement visuel · parc de Lumen-II',
      text: 'Survol photographique d\'un parc public, mesurant 4 km × 6 km :\n\nCorps assis sur des bancs : 47.\nCorps allongés sur l\'herbe : 19.\nCorps debout, immobiles : 8.\nCorps en mouvement : 0.\n\nÉtat de conservation : parfait pour 73 d\'entre eux.\nCertains visages portent encore une expression — généralement, un demi-sourire.\nAucun ne semble avoir souffert.',
      reliability: 0.77,
    },
    {
      type: 'medical_log',
      title: 'Analyse post-mortem · corps Lumen #144',
      text: 'Tissus prélevés sur un corps retrouvé dans une avenue de Lumen-Prime :\n\nCause de la mort : indéterminée.\nLésions externes : aucune.\nLésions internes : aucune.\nNiveau de stress cellulaire au moment du décès : nul.\n\nL\'analyse révèle un état physiologique compatible avec celui d\'une personne profondément endormie, paisiblement, dans un fauteuil, après un bon repas.\n\nSauf que cette personne est morte debout, au milieu d\'une rue.',
      reliability: 0.58,
    },
    {
      type: 'inscription',
      title: 'Gravure sur médaillon · porté par corps Lumen #87',
      text: 'Médaillon porté autour du cou, gravé à l\'intérieur :\n\n"Je suis allé là où ils ont dit qu\'il fallait aller.\nJe ne sais pas si je reviendrai.\nSi je ne reviens pas, sache que je n\'ai pas eu peur."\n\nAucun nom. Aucune date. Le médaillon était porté par un homme assis sur un banc, face à un coucher de soleil dont la couleur, en orbite, ne change plus depuis douze mille ans.',
      reliability: 0.71,
    },
  ],

  // ═══ VAGUE 5 — La Cathédrale-Soleil ═══
  lumen_09: [
    {
      type: 'surface_report',
      title: 'Observation orbitale · Cathédrale-Soleil',
      text: 'Structure unique au sommet du mont central de Lumen-Prime. Hauteur : 1,4 km. Diamètre à la base : 800 m.\n\nApparence : dôme en or et verre blanc, percé de 47 ouvertures circulaires.\n\nÉmissions thermiques : équivalentes à celles d\'une étoile naine.\nÉmissions radio : aucune.\nActivité visible : aucune.\n\nLa Cathédrale brille en permanence depuis douze mille ans.\nElle n\'a jamais été visitée par aucune expédition revenue.',
      reliability: 0.62,
    },
    {
      type: 'archive_entry',
      title: 'Annonce de presse · construction de la Cathédrale',
      text: 'Bulletin officiel, daté d\'environ trois siècles avant l\'Ascension :\n\n"La construction de la Cathédrale-Soleil est lancée. Sa fonction sera révélée aux citoyens dans un avenir proche. Pour l\'instant, le Conseil demande la patience et la confiance habituelles."\n\nLa fonction de la Cathédrale n\'a jamais été révélée publiquement dans aucun document survivant.\nLa construction a duré 297 ans.',
      reliability: 0.54,
    },
    {
      type: 'audio_fragment',
      title: 'Dernière transmission identifiée · Lumen-Prime',
      text: 'Émission unique, sur fréquence civile, le matin de l\'Ascension. Voix d\'enfant :\n\n"Maman, c\'est là-bas qu\'on va ?"\n\nVoix de femme, douce :\n"Oui, mon cœur. C\'est très beau, tu vas voir."\n\nVoix d\'enfant :\n"On va revenir ?"\n\n[silence — trois secondes]\n\nVoix de femme :\n"Personne ne revient. Mais personne ne veut revenir."',
      reliability: 0.39,
    },
  ],

  lumen_10: [
    {
      type: 'inscription',
      title: 'Inscription officielle · partout',
      text: '"La paix définitive a été obtenue."\n\nCette phrase apparaît sur les frontons des bâtiments publics, sur les plaques des stations, sur les sceaux des documents administratifs.\n\nElle n\'est jamais expliquée. Elle est traitée comme une évidence dont chacun aurait connu la signification.\n\nNous n\'avons jamais su laquelle.',
      reliability: 0.88,
      contradictionTags: ['motif_paix'],
      motif: 'paix_definitive',
    },
    {
      type: 'archive_entry',
      title: 'Note posthume · archiviste lumen',
      text: 'Note manuscrite trouvée dans un classeur, datant du jour précédant l\'Ascension :\n\n"On me demande de ranger les archives par catégorie. Je ne sais pas si demain quelqu\'un les consultera. Mais la paix définitive a été obtenue, paraît-il, et le rangement reste mon métier."\n\nLes archives sont rangées. Personne n\'est jamais venu les consulter.\nLe classeur est dans un bureau dont la porte est ouverte.',
      reliability: 0.74,
      contradictionTags: ['motif_paix'],
      motif: 'paix_definitive',
    },
    {
      type: 'audio_fragment',
      title: 'Chant choral · cité Velkar',
      text: 'Émission captée toutes les six heures, depuis douze mille ans, sur fréquence civile de Lumen-IV :\n\nChœur de 14000 voix, mélodie en quatre temps.\n\nLes paroles, traduites :\n"La paix définitive a été obtenue.\nNous n\'avons plus rien à craindre.\nNous n\'avons plus rien à attendre.\nNous sommes arrivés."\n\nLes voix n\'ont jamais varié. Pas une seule fausse note en douze mille ans. Pas une seule voix qui se serait éteinte avec le temps.\n\nNous ne savons pas si ces voix sont encore portées par des poumons.',
      reliability: 0.52,
      contradictionTags: ['motif_paix'],
      motif: 'paix_definitive',
    },
  ],

  // ═══════════════════════════════════════════════════════════════
  // WERATH — fragments
  // ═══════════════════════════════════════════════════════════════

  // ═══ VAGUE 1 ═══
  werath_01: [
    {
      type: 'audio_fragment',
      title: 'Enregistrement audio · expédition Veldris-1',
      text: 'Première expédition vers ce qui sera plus tard nommé Werath.\nDate : il y a deux siècles.\n\nÀ 04h17, la flotte d\'exploration approche d\'une lune militaire désaffectée. Émission radio brève, croissante, en langue inconnue.\n\nÀ 04h18, une salve unique part d\'une tourelle orbitale. Durée : 1,8 seconde.\n\nÀ 04h19, sept vaisseaux sur huit sont détruits.\n\nÀ 04h20, plus rien. L\'énergie tombe à zéro. Le silence est total.\n\nLe seul survivant rapporte la salve comme "lumière sans couleur, comme si on coupait la matière elle-même".',
      reliability: 0.81,
    },
    {
      type: 'archive_entry',
      title: 'Note du Conseil militaire · post-expédition',
      text: 'Mesures effectuées sur les débris de l\'expédition Veldris-1 :\n\n— Puissance estimée de la salve : 47,3 zettajoules.\n— Source d\'énergie : non identifiée. Aucun réacteur connu ne pourrait produire ce flux.\n— Durée d\'émission : 1,8 seconde.\n— Cible : précise. Aucun tir hors-cible.\n\nCette salve unique est devenue, depuis, l\'étalon de référence dans nos manuels d\'artillerie.\nNous ne savons pas comment elle a été générée.\nNous ne savons pas pourquoi elle s\'est arrêtée après une seule décharge.',
      reliability: 0.74,
    },
    {
      type: 'audio_fragment',
      title: 'Témoignage · pilote rescapé',
      text: 'Témoignage enregistré six mois après l\'expédition. Voix de femme, faible, lente.\n\n"On voyait les autres vaisseaux. Sept secondes plus tôt, ils étaient à côté de nous. Puis ils n\'étaient plus là. Pas explosés. Pas pulvérisés. Plus là. Comme si quelqu\'un les avait enlevés de la photographie."\n\n[silence — long]\n\n"Je crois que c\'est arrêté parce que la machine a calculé que sept c\'était assez. Le huitième, c\'était nous. On a eu peur. Mais je crois qu\'on a aussi été choisis."',
      reliability: 0.42,
    },
  ],

  werath_02: [
    {
      type: 'audio_fragment',
      title: 'Transmission Werath · récurrente',
      text: 'Émission captée toutes les six heures, sur fréquence militaire ancienne. Origine : Werath central.\n\nMessage chiffré court, transmis depuis plus de deux cent mille ans. Traduction approximative du seul mot que les linguistes parviennent à isoler :\n\n"Nous tenons."\n\nLa transmission est cyclique. Elle est entrecoupée de séquences chiffrées que nous n\'avons jamais pu décoder. Le seul mot lisible est toujours le même.\n\nLes Werathiens ne sont plus là pour le transmettre. Quelque chose, quelque part, l\'envoie encore.',
      reliability: 0.66,
    },
    {
      type: 'register',
      title: 'Journal d\'écoute · station Vorlex-7',
      text: 'Station d\'écoute civile en orbite de Werath, dédiée à l\'archivage des transmissions reçues.\n\nNombre de transmissions enregistrées depuis ouverture de la station : 4 millions, 380 mille, 720.\nNombre de transmissions silencieuses (échec d\'émission) : 0.\nVariations dans le contenu : 0.\n\nLes Werathiens transmettaient toutes les six heures. Ils transmettent toujours. Le seul changement, c\'est que personne ne reçoit plus rien d\'autre que ce mot.',
      reliability: 0.58,
    },
    {
      type: 'inscription',
      title: 'Gravure murale · station militaire orbitale',
      text: 'Inscription gravée à l\'intérieur d\'une station militaire werathienne abandonnée, à hauteur d\'œil, près du poste de transmission :\n\n"Nous tenons.\nIl n\'y a personne pour nous relever.\nNous tenons quand même."\n\nL\'écriture est ferme, datée approximativement de la dernière génération de Werathiens encore présents en orbite. Aucun nom. Aucun grade. Juste les trois lignes.',
      reliability: 0.74,
    },
  ],

  // ═══ VAGUE 2 — La tech qui ne se rallume pas ═══
  werath_03: [
    {
      type: 'archive_entry',
      title: 'Rapport scientifique · cuirassé Werath, tentative 47',
      text: 'Compte-rendu de la 47e tentative de réactivation d\'un cuirassé werathien moyen, classe Verkar-3.\n\nÉquipe : 38 ingénieurs spécialisés, sept civilisations différentes.\nDurée des essais : 14 mois.\nRésultat : aucun système n\'a pu être mis en route.\n\nNon par défaillance. Les circuits sont intacts. Les conducteurs ne sont pas oxydés. Les composants répondent aux tests d\'intégrité.\n\nMais quand on alimente, rien ne s\'allume. Ce n\'est pas qu\'ils refusent. C\'est qu\'ils sont, manifestement, ailleurs.',
      reliability: 0.78,
    },
    {
      type: 'audio_fragment',
      title: 'Témoignage · ingénieur en chef, retraité',
      text: 'Enregistrement personnel d\'un ingénieur ayant consacré trente-deux ans à l\'étude des cuirassés Werath.\n\n"On a essayé pendant trois générations. Mon grand-père a essayé. Mon père a essayé. J\'ai essayé. Mon fils ne va pas essayer — il fait du droit. Et je le comprends."\n\n[silence]\n\n"Ce que je veux dire à ceux qui essaieront après nous : ils n\'ont pas été conçus pour être éteints. Ils n\'ont pas été conçus pour être rallumés. Ces machines ne distinguent pas ces deux états. Elles connaissent seulement deux modes : fonctionner, ou ne pas exister."\n\n"Aujourd\'hui, elles n\'existent pas."',
      reliability: 0.51,
    },
    {
      type: 'maintenance_log',
      title: 'Journal technique · arsenal sous-orbital de Tharos',
      text: 'Inspection de l\'arsenal sous-orbital de Tharos-IV.\n\n— Réacteurs principaux : intacts. Combustible présent. Aucune mise en route possible.\n— Systèmes d\'arme : intacts. Munitions présentes. Aucune activation possible.\n— Système d\'arrêt d\'urgence : aucun. Inexistant. Pas même prévu sur les plans.\n\nNote du chef d\'inspection :\n"Ces machines n\'ont pas de bouton on. Elles n\'ont pas non plus de bouton off. Cela ne nous a pas dérangés tant qu\'elles étaient éteintes. Cela me dérange depuis que j\'ai compris."',
      reliability: 0.69,
    },
  ],

  werath_04: [
    {
      type: 'surface_report',
      title: 'Rapport d\'observation · Titan-classe Verkar-9',
      text: 'Cuirassé géant dérivant en lisière du système Werath. Longueur estimée : 47 kilomètres.\n\nTourelles principales : six. Chacune est aussi grande qu\'un cuirassé moderne.\nMunitions estimées encore embarquées : suffisantes pour détruire la croûte d\'une lune mineure d\'un seul tir.\n\nC\'est une estimation. Personne n\'a osé tester.',
      reliability: 0.73,
    },
    {
      type: 'archive_entry',
      title: 'Analyse comparative · arsenaux galactiques',
      text: 'Bilan technologique comparatif, dernière mise à jour il y a 47 ans :\n\n— Puissance moyenne d\'un cuirassé moderne : équivalente à 0,003 Werath.\n— Puissance moyenne d\'une arme orbitale moderne : équivalente à 0,001 Werath.\n— Aucune civilisation actuelle n\'a égalé 0,1 Werath.\n\nLe "Werath" est devenu une unité de mesure universelle, en référence à la salve unique de l\'expédition Veldris-1.\n\nLe modèle théorique suggère qu\'un Titan-classe complet pourrait dépasser 200 Werath en pleine puissance.\nLe modèle théorique reste théorique.',
      reliability: 0.66,
    },
    {
      type: 'audio_fragment',
      title: 'Conversation captée · pont d\'un Titan-classe',
      text: 'Enregistrement audio dégradé, supposé daté de la dernière période d\'activité werathienne.\n\nVoix d\'officier :\n"... combien il en reste, à bord ?"\n\nVoix subalterne :\n"Quatre, capitaine. Sans compter vous."\n\n[silence — sept secondes]\n\nVoix d\'officier :\n"Quatre, c\'est suffisant. Les machines feront le reste."',
      reliability: 0.39,
    },
  ],

  // ═══ VAGUE 3 — Soldats et bunkers ═══
  werath_05: [
    {
      type: 'medical_log',
      title: 'Rapport médical · caisson cryogénique W-7',
      text: 'Caisson cryogénique militaire werathien, ouvert lors d\'une mission de récupération.\n\n— Modèle : standard d\'attente prolongée.\n— Durée d\'activation prévue : indéfinie.\n— État du système : nominal.\n— État du soldat : mort depuis longtemps. La date précise est inconnue.\n\nLe caisson a fonctionné parfaitement. Il a maintenu la température cible, la pression cible, le flux de nutriments cible.\n\nMais aucun caisson cryogénique au monde ne peut empêcher un homme de mourir d\'avoir attendu trop longtemps.',
      reliability: 0.71,
    },
    {
      type: 'object_record',
      title: 'Plaque d\'identification · soldat anonyme',
      text: 'Plaque d\'identification métallique retrouvée dans un caisson ouvert. Inscription :\n\n"Garde-soldat Vekhren Mor. Cohorte 218. Inscrit pour ordre de réveil — code W-Final."\n\nLe code W-Final n\'apparaît dans aucun manuel werathien retrouvé.\nIl n\'a jamais été émis.\n\nVekhren Mor avait, au moment de son entrée en cryogénie, vingt-trois ans. Il en a aujourd\'hui environ neuf cent quarante.\nIl attend toujours.',
      reliability: 0.66,
    },
    {
      type: 'inscription',
      title: 'Gravure intérieure · caisson cryogénique',
      text: 'Inscription faite à la pointe d\'un outil sur la paroi intérieure d\'un caisson cryogénique, par son occupant, juste avant fermeture :\n\n"Si vous me trouvez, dites-moi contre qui je devais me battre. J\'ai oublié pendant que je m\'endormais. J\'ai dû oublier — ils nous ont demandé d\'oublier."',
      reliability: 0.54,
    },
  ],

  werath_06: [
    {
      type: 'register',
      title: 'Journal de bord · patrouille orbitale automatique',
      text: 'Journal de bord d\'une patrouille orbitale werathienne, encore en activité.\n\nDernière entrée datée d\'il y a plus de deux cent mille ans, dernier rapport humain :\n"Patrouille du secteur 14-Nord. Aucun contact ennemi. Aucune anomalie. Relèves : zéro. Nous tenons."\n\nDepuis cette date, la patrouille a effectué 1,3 million de rondes. Aucune entrée n\'a été écrite. Mais le système de bord enregistre la position en continu. La trajectoire n\'a pas dévié d\'un kilomètre.',
      reliability: 0.69,
    },
    {
      type: 'audio_fragment',
      title: 'Transmission militaire · station de surface',
      text: 'Émission captée depuis une station de défense planétaire werathienne :\n\n"Rapport six-heures. Aucun mouvement détecté en surface. Couverture défensive : 100%. Niveau de menace : non-évalué — variables d\'évaluation manquantes."\n\nLa station n\'a aucune équipe humaine depuis plus de deux cent mille ans.\nLe rapport est généré automatiquement.\nLe niveau de menace n\'a jamais été marqué nul, parce que la machine n\'a jamais reçu l\'information que la menace avait cessé d\'exister.',
      reliability: 0.58,
    },
    {
      type: 'discipline_report',
      title: 'Rapport interne · agence d\'exploration de Vorek',
      text: 'Note classifiée à l\'attention des agences voisines :\n\n"Toute mission civile dans le périmètre orbital de Werath continue à risquer une activation défensive imprévisible. Les sondes lourdes sont systématiquement détectées et neutralisées.\n\nLes sondes légères passent — soit parce qu\'elles sont sous le seuil de menace, soit parce que les systèmes Werath n\'ont plus l\'énergie nécessaire à les abattre. Nous ne savons pas laquelle des deux options est la vraie."\n\nLa note recommande la prudence permanente.',
      reliability: 0.74,
    },
  ],

  // ═══ VAGUE 4 — L'ennemi oublié ═══
  werath_07: [
    {
      type: 'archive_entry',
      title: 'Procès-verbal · décret administratif Werath',
      text: 'Document werathien officiel, traduit. Daté environ 600 ans avant le silence final.\n\n"Par décision du Haut-Conseil, à compter du présent décret, le nom de la civilisation adverse ne sera plus inscrit dans les rapports militaires, les bulletins d\'opérations, ni les communiqués publics.\n\nMotif : préserver la concentration des combattants. Les détails de l\'adversaire ne sont plus nécessaires aux opérations. Le résultat seul importe."\n\nLe nom de la civilisation adverse n\'apparaît plus, à compter de cette date, dans aucun document werathien retrouvé.',
      reliability: 0.78,
    },
    {
      type: 'audio_fragment',
      title: 'Témoignage · soldat werathien, capté ancien',
      text: 'Enregistrement audio fragmentaire, voix d\'homme âgé, supposé soldat vétéran. Daté environ trois siècles avant le silence.\n\n"Mon grand-père est mort pour eux. Mon père est mort pour eux. Je vais mourir pour eux. Mais tu sais ce qui me dérange, petit ? Personne ne me dit plus qui ils sont. On me dit où sont leurs vaisseaux. On me dit comment les abattre. On ne me dit plus pourquoi."\n\n[silence]\n\n"Quand je demande, on me répond : tu n\'as pas besoin de savoir, soldat. Tiens ton poste. Nous tenons."',
      reliability: 0.42,
    },
    {
      type: 'inscription',
      title: 'Gravure intérieure · bunker souterrain',
      text: 'Inscription au charbon, intérieur d\'un bunker werathien fermé depuis plus de deux cent mille ans. Écriture en plusieurs mains successives :\n\n"Nous tenons contre — [le mot a été gratté à la pointe d\'un couteau, profondément, jusqu\'au métal en-dessous]"\n\nLe mot a été effacé manuellement, à plusieurs époques différentes — la profondeur de la gratture est variable. Comme si à chaque génération, les nouveaux soldats avaient redécouvert le nom de l\'ennemi, et l\'avaient effacé à leur tour.',
      reliability: 0.66,
    },
  ],

  werath_08: [
    {
      type: 'surface_report',
      title: 'Observation orbitale · Champ de Bataille de Tharos-IV',
      text: 'Champ de débris orbital géant, autour de la planète Tharos-IV.\n\n— Cuirassés détruits identifiés : 412.\n— Cuirassés intacts présents (figés) : 38.\n— Densité de débris : extrême.\n\nLe champ est inaccessible. Les débris contiennent encore des résidus de tirs de proximité actifs, qui pulvérisent toute sonde tentant de traverser, malgré plus de deux cent mille ans écoulés.\n\nLa bataille a continué après ses combattants.',
      reliability: 0.73,
    },
    {
      type: 'archive_entry',
      title: 'Estimation de bataille · service archéologique',
      text: 'Reconstitution historique de la bataille de Tharos-IV, basée sur les vecteurs de débris.\n\n— Durée estimée du combat : entre 11 et 18 jours.\n— Nombre de combattants : environ 700 cuirassés Werath.\n— Forces adverses : aucune signature de débris non-werathien identifiée. Aucun cadavre d\'ennemi. Aucun morceau de vaisseau adverse.\n\nLes Werathiens se sont-ils battus seuls ? Ont-ils combattu contre eux-mêmes ? Ou leurs ennemis étaient-ils faits de quelque chose qui ne laisse pas de débris ?\n\nLa question reste ouverte.',
      reliability: 0.58,
    },
    {
      type: 'audio_fragment',
      title: 'Dernière transmission · amiral Vekran',
      text: 'Émission radio captée en lisière du champ. Voix d\'officier supérieur, calme, presque las.\n\n"Vekran à tous les bâtiments. Maintenez les positions. Ils ne savent pas ce qu\'ils font. Ils ne savent même plus pourquoi ils sont venus. Mais ils sont là. Et nous tenons."\n\n[silence — onze secondes]\n\n"Sasha, si tu m\'entends, je suis désolé pour la maison. Je n\'aurais pas dû promettre."\n\n[fin de transmission]',
      reliability: 0.49,
    },
  ],

  // ═══ VAGUE 5 — La décision finale ═══
  werath_09: [
    {
      type: 'archive_entry',
      title: 'Document classifié · "la décision finale"',
      text: 'Document werathien, classification maximale. Découvert dans un coffre du bunker souterrain de Karad-3.\n\nTitre traduit (approximatif) : "Protocole de la décision finale."\nContenu : 47 pages — toutes brûlées, sauf la dernière.\n\nLa dernière page contient uniquement cette phrase :\n\n"En dernier recours, et après autorisation conjointe du Haut-Conseil et du Commandant Suprême, ce protocole résoudra définitivement la question."\n\nQuelle question, le document ne le précise pas. Le protocole, semble-t-il, n\'a jamais été activé. Il n\'a jamais été abandonné non plus.',
      reliability: 0.66,
    },
    {
      type: 'object_record',
      title: 'Salle scellée · arsenal central de Werath-Prime',
      text: 'Salle souterraine, niveau -47 de l\'arsenal central. Découverte intacte il y a soixante ans.\n\nLa salle contient une seule machine. Elle mesure trente-quatre mètres de haut. Sa fonction n\'est pas identifiable. Elle n\'a aucune ouverture, aucun panneau, aucun voyant. Elle ne ressemble à aucune arme connue.\n\nÀ son pied, un petit pupitre. Sur le pupitre, un seul bouton.\n\nLe bouton n\'a jamais été pressé. Aucun ingénieur n\'a osé le toucher. La salle a été refermée. Personne ne sait ce que la machine fait. Personne ne sait s\'il faut, ou non, le découvrir.',
      reliability: 0.43,
    },
    {
      type: 'audio_fragment',
      title: 'Enregistrement audio · officier supérieur, anonyme',
      text: 'Voix d\'officier âgé, transcription dégradée :\n\n"On nous a dit qu\'elle existait. On nous a dit qu\'elle n\'était pour le dernier jour. On nous a appris à ne jamais la mentionner dans les ordres écrits. Elle a un nom, mais le nom est interdit."\n\n[silence — long]\n\n"Le jour où elle sera tirée, plus rien de ce que nous combattons n\'existera. Plus rien. Et plus rien de nous non plus, probablement. C\'est pour ça qu\'on la garde pour le dernier jour."\n\n"Et c\'est pour ça que le dernier jour n\'arrive jamais."',
      reliability: 0.39,
    },
  ],

  werath_10: [
    {
      type: 'inscription',
      title: 'Phrase récurrente · partout',
      text: '"Nous tenons."\n\nLa phrase apparaît dans tous les rapports militaires, sur tous les manifestes, dans toutes les transmissions radio. Elle est gravée dans le métal des bunkers, peinte sur les coques des cuirassés, brodée sur les uniformes officiels.\n\nC\'est la seule chose qui n\'a jamais changé dans toute l\'histoire de Werath. Les ennemis ont changé. Les générations ont changé. Le sens même du mot "tenir" a probablement changé.\n\n"Nous tenons" est resté.',
      reliability: 0.88,
      contradictionTags: ['motif_nous_tenons'],
      motif: 'nous_tenons',
    },
    {
      type: 'audio_fragment',
      title: 'Émission cyclique · fréquence militaire ancienne',
      text: 'Message radio cyclique, identique depuis plus de deux cent mille ans, toutes les six heures :\n\n[séquence chiffrée non décodée — 47 secondes]\n"Nous tenons."\n[séquence chiffrée non décodée — 47 secondes]\n\nAucune variation. Aucune voix humaine. Aucune réponse attendue. Aucune réponse jamais reçue.\n\nLa machine qui émet n\'a probablement aucune idée que la machine qui devait recevoir est silencieuse depuis plus de deux cent mille ans.',
      reliability: 0.74,
      contradictionTags: ['motif_nous_tenons'],
      motif: 'nous_tenons',
    },
    {
      type: 'archive_entry',
      title: 'Note d\'archive · pourquoi "nous tenons"',
      text: 'Réflexion d\'un historien militaire, datée d\'il y a 80 ans :\n\n"Tenir contre quoi ? Tenir pour qui ? Tenir jusqu\'à quand ? Ces questions n\'ont jamais reçu de réponse dans les archives werathiennes.\n\nMais peut-être que c\'est ça, le génie de la phrase. Elle n\'a besoin de rien. Elle ne demande rien. Elle ne promet rien. Elle constate. Et tant qu\'on la prononce, on est encore là."\n\n"Quelque part, à Werath, une machine prononce ce mot toutes les six heures. Donc Werath, d\'une certaine manière, est encore là."',
      reliability: 0.52,
      contradictionTags: ['motif_nous_tenons'],
      motif: 'nous_tenons',
    },
  ],


  // ═══════════════════════════════════════════════════════════════
  // EREBUS — fragments
  // ═══════════════════════════════════════════════════════════════

  // ═══ VAGUE 1 — Premier contact ═══
  erebus_01: [
    {
      type: 'surface_report',
      title: 'Observation orbitale · planète D-A-2001-18',
      text: 'Planète de classe terrestre. Atmosphère stable. Croûte intacte. Vie en surface : non détectée.\n\nAlbédo : 0,04 — soit l\'un des plus bas jamais mesurés sur une planète habitable. La surface absorbe presque toute la lumière qu\'elle reçoit. Elle n\'en renvoie rien.\n\nEn approche rapprochée, on distingue des structures lisses, géométriques, recouvertes d\'un revêtement non identifié. Le revêtement ne réfléchit aucun spectre. Il ne chauffe pas non plus. Il absorbe.\n\nNous n\'avons pas trouvé d\'explication naturelle.',
      reliability: 0.74,
    },
    {
      type: 'audio_fragment',
      title: 'Rapport vocal · pilote de sonde',
      text: 'Transcription du rapport d\'une pilote de reconnaissance, voix calme :\n\n"L\'approche est désorientante. La planète est là — gravité présente, atmosphère présente — mais visuellement, il n\'y a presque rien à voir. C\'est comme regarder un trou. Une masse de néant qui occupe l\'espace qu\'une planète devrait occuper.\n\nNos instruments lisent la surface. Nos yeux refusent de la voir."',
      reliability: 0.58,
    },
    {
      type: 'archive_entry',
      title: 'Note du Bureau d\'Astrocartographie',
      text: 'Compilation des observations sur les planètes de l\'Amas D :\n\n— Planètes recensées dans l\'amas : 47.\n— Planètes habitables : 14.\n— Planètes habitables présentant un albédo anormalement bas : 14.\n\nToutes.\n\nLes quatorze planètes habitables de l\'Amas D ont été assombries. Volontairement, semble-t-il. Aucune explication géologique ou atmosphérique ne tient.',
      reliability: 0.81,
    },
  ],

  erebus_02: [
    {
      type: 'audio_fragment',
      title: 'Dernière émission · Amas D, fréquence civile',
      text: 'Captation orbitale d\'une émission radio unique, datée approximativement il y a cinq mille ans. Voix d\'homme, ton mesuré, presque doux. Traduction :\n\n"À toute civilisation qui pourrait nous entendre.\n\nNous avons décidé. Nous nous retirons.\n\nNe nous cherchez pas. Si vous nous trouvez, n\'entrez pas. Si vous entrez, partez. Si vous restez, vous comprendrez.\n\nFin de la transmission."\n\nAprès ce message, plus rien n\'a été émis depuis l\'Amas D. Toutes les fréquences sont restées vides.',
      reliability: 0.66,
      contradictionTags: ['motif_retrait'],
      motif: 'nous_nous_retirons',
    },
    {
      type: 'archive_entry',
      title: 'Bilan d\'écoute · stations radio multi-civilisations',
      text: 'Bilan compilé par sept stations d\'écoute indépendantes, couvrant l\'Amas D depuis quatre mille ans.\n\nNombre d\'émissions captées : 1.\nDate de cette émission : il y a environ cinq mille ans.\nVolume sonore détecté en continu depuis cette date : nul.\nVariations atmosphériques radio détectées : nulles.\n\nL\'Amas D est devenu, à partir de cette date, la zone radio la plus silencieuse de la galaxie connue. Pas par absence d\'instruments. Pas par destruction. Par choix.',
      reliability: 0.74,
    },
    {
      type: 'inscription',
      title: 'Plaque commémorative · station de relais D-S-5067-44',
      text: 'Plaque trouvée sur la station de relais orbitale D-S-5067-44, en orbite morte autour d\'une planète éreboise. Métal sobre. Inscription en langue éreboise, traduite avec un haut degré de confiance :\n\n"Cette station a transmis le dernier message. Elle a été éteinte selon la volonté du Conseil. Elle est laissée intacte par respect.\n\nQu\'aucune autre voix ne lui réponde."',
      reliability: 0.62,
    },
  ],

  // ═══ VAGUE 2 — Ce qu'ils ont enterré ═══
  erebus_03: [
    {
      type: 'surface_report',
      title: 'Survol topographique · D-E-4477-22',
      text: 'Survol par sonde lourde, planète D-E-4477-22, hémisphère nord.\n\nSurface : plaines régulières, sans relief notable. Pas de villes visibles. Pas de routes. Pas de cultures.\n\nMais en sondage sismique : à une profondeur moyenne de 280 mètres, structures massives. Géométrie urbaine reconnaissable. Habitations alignées, places, infrastructures de transport souterraines.\n\nLes cités sont là. Elles ont simplement été recouvertes.\n\nVolontairement. Le matériau de recouvrement est uniforme, soigneusement compacté, sans trace de catastrophe ou de glissement de terrain.',
      reliability: 0.78,
    },
    {
      type: 'archive_entry',
      title: 'Estimation archéologique · cités éreboises',
      text: 'Synthèse archéologique sur les cités enterrées de l\'Amas D :\n\n— Cités identifiées par sondage sismique : 1 240.\n— Cités présentant des signes d\'enfouissement volontaire : 1 240.\n— Cités présentant des signes de destruction : 0.\n\nLes Erebus n\'ont pas fui. Ils n\'ont pas été conquis. Ils ont posé sur leurs propres cités, méthodiquement, une couche de terre soigneusement compactée. Comme on couvre quelque chose qu\'on ne veut plus voir, mais que l\'on respecte trop pour détruire.',
      reliability: 0.69,
    },
    {
      type: 'audio_fragment',
      title: 'Journal d\'expédition · descente sous surface D-E-4477',
      text: 'Enregistrement d\'une équipe d\'archéologues ayant foré un puits d\'accès vers une cité enterrée.\n\nÀ -240 mètres, ils ont atteint la première dalle. Voix de la cheffe d\'équipe :\n\n"On est sur le toit d\'une bibliothèque. On voit les linteaux des fenêtres. Les volets sont fermés. L\'intérieur est éclairé."\n\n[silence — sept secondes]\n\n"Quelqu\'un, à un moment, a fermé les volets de l\'intérieur. Puis a posé deux cent quarante mètres de terre par-dessus."',
      reliability: 0.51,
    },
  ],

  erebus_04: [
    {
      type: 'object_record',
      title: 'Porte du Retrait · D-P-9090-01',
      text: 'Description d\'une porte massive trouvée à l\'entrée d\'une cité enterrée éreboise.\n\nMatériau : alliage non identifié, trois mètres d\'épaisseur, six mètres de hauteur.\nSerrure externe : aucune. La porte ne porte aucun mécanisme d\'ouverture côté extérieur. Aucun bouton. Aucune empreinte. Aucune fente.\n\nCôté intérieur : une serrure simple, conçue pour être actionnée à la main.\n\nLa porte a été fermée depuis l\'intérieur. Quelqu\'un est entré, a tiré le verrou, et n\'est jamais ressorti.',
      reliability: 0.74,
    },
    {
      type: 'inscription',
      title: 'Inscription gravée · porte scellée D-P-9090-01',
      text: 'Sur le linteau de la porte scellée, gravée à l\'extérieur, en langue éreboise. Traduction :\n\n"Nous avons choisi.\n\nN\'insistez pas.\n\nN\'oubliez pas qu\'il est aussi possible de ne pas insister."',
      reliability: 0.66,
    },
    {
      type: 'discipline_report',
      title: 'Recommandation officielle · Bureau de l\'Amas D',
      text: 'Note classifiée à l\'attention des équipes d\'exploration :\n\n"Aucune porte éreboise ne doit être ouverte par la force. Aucune perceuse, aucun explosif, aucun chalumeau.\n\nLes Erebus se sont enfermés à l\'intérieur de leurs propres demeures. Y entrer reviendrait à violer leur dernière volonté.\n\nDe plus, et c\'est ce qui nous trouble : aucune des trois équipes ayant tenté d\'ouvrir une porte par la force n\'a rapporté de résultats interprétables. Les forets ne mordent pas. Les explosifs ne détonnent pas. Le chalumeau n\'allume pas."',
      reliability: 0.81,
    },
  ],

  // ═══ VAGUE 3 — La décision ═══
  erebus_05: [
    {
      type: 'archive_entry',
      title: 'Procès-verbal · Conseil du Retrait',
      text: 'Document éreboïen partiellement effacé, retrouvé dans une chambre administrative scellée. Datation : approximativement il y a cinq mille ans, quelques mois avant le dernier signal.\n\nTexte lisible :\n\n"Le Conseil [effacé] a délibéré pendant [effacé] cycles sur la question suivante : continuer à étendre notre civilisation, ou cesser.\n\nVote final :\nPour le retrait : [effacé], soit 87,4%.\nContre : [effacé], soit 11,2%.\nAbstentions : 1,4%.\n\nLa motion est adoptée. Le Conseil remercie les opposants et reconnaît la légitimité de leur position. Nous ne demandons à personne de partir. Nous demandons à tous de ne plus rayonner."\n\nLa suite du document est effacée, méthodiquement, à l\'encre noire opaque.',
      reliability: 0.78,
    },
    {
      type: 'audio_fragment',
      title: 'Enregistrement d\'allocution · délégué inconnu',
      text: 'Enregistrement audio fragmentaire, voix de femme âgée, captée dans la salle du Conseil :\n\n"...nous avons exploré. Nous avons découvert. Nous avons construit. Et à chaque étape, nous avons aussi détruit quelque chose — souvent sans le vouloir, parfois en le voulant.\n\n"Chaque civilisation que nous avons étudiée, dans cet amas et au-delà, a fini par produire de la violence. Pas par méchanceté. Par expansion. Une civilisation qui s\'étend touche d\'autres choses, et ce qu\'elle touche, elle finit par le contraindre.\n\n"Nous avons réfléchi à comment éviter cela. La seule réponse honnête que nous ayons trouvée est : ne pas être.\n\n"Pas mourir. Ne pas être.\n\n"C\'est différent."',
      reliability: 0.42,
    },
    {
      type: 'inscription',
      title: 'Note manuscrite · marge d\'un registre',
      text: 'Note écrite à la main dans la marge d\'un registre administratif officiel, par une encre différente, datée du jour de l\'adoption de la motion :\n\n"Je voterai oui ce soir. Mon père a voté oui ce matin. Ma fille votera oui demain.\n\n"Aucun de nous n\'est triste. Aucun de nous n\'est joyeux non plus.\n\n"Nous avons simplement compris quelque chose, et nous agissons en conséquence. C\'est, je crois, ce que mes ancêtres appelaient la dignité — quand le mot voulait encore dire quelque chose."',
      reliability: 0.58,
    },
  ],

  erebus_06: [
    {
      type: 'archive_entry',
      title: 'Note d\'inventaire · archives centrales éreboises',
      text: 'Description physique des archives principales d\'Erebus-Prime, retrouvées dans un bâtiment intact :\n\n— Étagères : 14 000, soigneusement rangées.\n— Documents : tous présents physiquement.\n— Lisibilité : nulle.\n\nChaque document a été couvert, page par page, d\'un fin film d\'encre noire opaque appliqué au pinceau. Le travail est méthodique. Régulier. Patient. Aucune page n\'a été oubliée.\n\nNous estimons qu\'effacer ces archives a demandé, à plein temps, le travail de plusieurs centaines de scribes pendant plusieurs années.\n\nIls ont pris le temps. Ils l\'ont fait à la main.',
      reliability: 0.74,
    },
    {
      type: 'object_record',
      title: 'Pinceau d\'effacement · découvert dans une boîte',
      text: 'Pinceau retrouvé dans une boîte de bois à côté d\'un encrier vide, sur un bureau d\'archiviste éreboïen. Manche usé. Soies tachées de noir.\n\nÀ côté du pinceau, une note de l\'archiviste, écrite avant qu\'il ne pose son outil :\n\n"J\'ai fini ma part. 4 217 documents. Je laisse le pinceau au prochain. Si personne ne vient le prendre, c\'est qu\'il n\'y a plus rien à effacer. C\'est aussi bien."',
      reliability: 0.62,
    },
    {
      type: 'inscription',
      title: 'Sur un mur d\'archive · gravé profond',
      text: 'Inscription gravée sur le mur de la salle des archives, à hauteur d\'œil, profondément dans la pierre :\n\n"Aucune trace n\'est une grâce."\n\nPas signé. Pas daté. Mais la profondeur de la gravure suggère qu\'elle a été faite avec soin, par quelqu\'un qui voulait que cette phrase, elle, ne soit pas effaçable.\n\nC\'est, à notre connaissance, la seule phrase éreboïenne que ses auteurs ont volontairement préservée.',
      reliability: 0.66,
    },
  ],

  // ═══ VAGUE 4 — Ceux qui sont restés ═══
  erebus_07: [
    {
      type: 'surface_report',
      title: 'Inspection · station orbitale D-S-5067-44',
      text: 'Inspection externe d\'une station orbitale éreboïenne, encore en orbite stable autour d\'une planète assombrie.\n\nAlimentation interne : active. Lumières internes : éteintes. Émissions radio : nulles. Signaux thermiques : conformes à une activité de maintenance basique.\n\nLa station fonctionne. Personne ne s\'en sert.\n\nNos sondes ont approché à moins d\'un kilomètre. Aucune défense ne s\'est activée. Aucun message d\'avertissement n\'a été émis. La station, comme tout ce qui reste d\'Erebus, ne se défend pas, et ne s\'annonce pas. Elle existe, simplement, dans le silence.',
      reliability: 0.78,
    },
    {
      type: 'maintenance_log',
      title: 'Journal automatique · station D-S-5067-44',
      text: 'Sonde interne déposée par sas non-invasif. Le journal automatique de la station a été lu.\n\nDernière entrée écrite par un être humain : il y a environ cinq mille ans. Texte court :\n\n"Tout fonctionne. Je ferme. Je sors. Je verrouille de l\'intérieur."\n\nPuis, en bas de la page, ajouté ensuite, dans une écriture identique mais visiblement reprise quelques minutes plus tard :\n\n"Non. Je n\'ai pas fermé de l\'intérieur. Je ne suis pas ressorti. Si tu lis ceci, je suis encore là. Quelque part. C\'est sans importance."',
      reliability: 0.58,
    },
    {
      type: 'audio_fragment',
      title: 'Captation interne · station silencieuse',
      text: 'Sonde acoustique déposée à l\'intérieur d\'une station éreboïenne, exposée 72 heures. Bruit total enregistré :\n\n— Ventilation atmosphérique : continue, faible.\n— Cliquetis de relais mécaniques : irréguliers, espacés (deux à trois par heure).\n— Pas humains : 0.\n— Voix : 0.\n— Mouvements perceptibles : 0.\n\nLa station respire. Elle ne fait rien d\'autre.',
      reliability: 0.69,
    },
  ],

  erebus_08: [
    {
      type: 'medical_log',
      title: 'Analyse post-mortem · corps éreboïens',
      text: 'Description des corps retrouvés dans une chambre commune d\'une cité enterrée. Trente-sept corps. Tous assis, dos contre un mur. Vêtements simples. Mains posées sur les genoux.\n\nCause de la mort : indéterminée pour la majorité. Quelques cas montrent des traces de substances ingérées volontairement, conformes à un protocole médical éreboïen connu (sédation profonde puis arrêt cardiaque indolore).\n\nNiveau de stress physiologique au moment du décès : faible. Voire nul.\n\nIl n\'y a aucun signe que ces personnes aient été forcées. Ni qu\'elles aient résisté. Elles se sont assises. Elles ont fermé les yeux. Elles ne se sont pas relevées.',
      reliability: 0.81,
    },
    {
      type: 'inscription',
      title: 'Note posée sur un corps',
      text: 'Note manuscrite trouvée pliée sur les genoux d\'un corps éreboïen, dans une cité enterrée. Encre noire, papier épais. Texte court :\n\n"Je ne pars pas. Je ne reste pas non plus. Je ne fais que cesser.\n\n"Si tu lis ceci, ne me pleure pas, et surtout, ne me célèbre pas. Je n\'ai rien fait de remarquable. J\'ai simplement décidé d\'arrêter de produire des conséquences."',
      reliability: 0.74,
    },
    {
      type: 'audio_fragment',
      title: 'Dernière phrase enregistrée · résidence privée',
      text: 'Magnétophone domestique laissé en marche, capté lors d\'une exploration d\'une maison éreboïenne intacte. Voix d\'homme âgé. Ton calme.\n\n"Je vais m\'asseoir un moment dans le salon. La lumière y est encore agréable, à cette heure. Je crois que je ne vais plus me relever, après ça.\n\n"Ce n\'est pas un drame. C\'est juste une décision. J\'ai pris cinq mille décisions comme celle-ci dans ma vie. Celle-ci est simplement la dernière."',
      reliability: 0.49,
    },
  ],

  // ═══ VAGUE 5 — Ce qui subsiste ═══
  erebus_09: [
    {
      type: 'archive_entry',
      title: 'Document survivant · partiellement effacé',
      text: 'Document éreboïen retrouvé dans une boîte scellée, miraculeusement préservé alors que toutes les copies adjacentes ont été effacées. Le titre du document est lisible :\n\n*Pourquoi nous nous retirons — exposé liminaire.*\n\nLe corps du texte est entièrement noirci. Sauf trois phrases, en marge, écrites à la main dans une encre différente — peut-être par un archiviste qui voulait, malgré tout, sauver quelque chose :\n\n"1. Toute expansion produit de la violence, même quand on ne le veut pas.\n\n"2. Toute trace que nous laissons sera, un jour, exploitée par d\'autres pour justifier leur propre expansion.\n\n"3. La plus belle action qu\'une civilisation puisse poser est de ne plus en poser aucune."',
      reliability: 0.66,
    },
    {
      type: 'object_record',
      title: 'Tablette gravée · trouvée près d\'une porte scellée',
      text: 'Tablette de pierre claire, gravée en langue éreboïenne, posée à côté de la Porte du Retrait D-P-9090-01. Inscription longue, lisible :\n\n"À ceux qui viendront après nous.\n\n"Nous n\'avons pas été vaincus. Nous n\'avons pas été tristes. Nous n\'avons pas eu peur. Nous avons compris quelque chose, et nous avons agi.\n\n"Vous chercherez à savoir quoi. Vous interrogerez nos murs, nos lampes, nos squelettes. Vous trouverez peu de réponses.\n\n"C\'est voulu. Vos questions, posées trop fort, font partie du problème que nous avons identifié.\n\n"Si vous voulez nous comprendre, asseyez-vous un instant dans une de nos cités. Ne touchez à rien. Écoutez. Repartez. Ce sera tout."',
      reliability: 0.74,
    },
    {
      type: 'inscription',
      title: 'Gravure en hauteur · sommet d\'un édifice',
      text: 'Au sommet d\'un édifice administratif éreboïen, gravée dans le métal du toit, lisible uniquement depuis l\'orbite :\n\n"Erebus a existé.\n\n"Erebus n\'existe plus.\n\n"Cette inscription est la dernière que nous laisserons. Elle est lisible depuis le ciel. Nous savons que c\'est une contradiction. Nous l\'acceptons."\n\nAucune autre inscription orbital-visible n\'a été trouvée sur les autres bâtiments éreboïens. Celui-ci est l\'exception qui prouve la règle.',
      reliability: 0.62,
    },
  ],

  erebus_10: [
    {
      type: 'inscription',
      title: 'Motif récurrent · partout en faible relief',
      text: 'La phrase « Nous nous retirons. » apparaît sur :\n\n— Le linteau de chaque porte scellée éreboïenne.\n— La bordure de chaque tablette administrative.\n— Le revers de chaque médaillon de fonctionnaire retrouvé.\n— Le pied de chaque statue civique (avant que la statue ne soit elle-même méthodiquement érodée).\n\nLa phrase est toujours gravée en relief très faible. Presque imperceptible. On la trouve avec la main, en passant les doigts sur la surface. On ne la voit pas immédiatement.\n\nC\'était l\'esthétique éreboïenne. Le sens ne devait pas s\'imposer. Il fallait le chercher.',
      reliability: 0.88,
      contradictionTags: ['motif_retrait'],
      motif: 'nous_nous_retirons',
    },
    {
      type: 'audio_fragment',
      title: 'Émission unique · rediffusée par erreur',
      text: 'Le dernier message éreboïen, rediffusé par accident par une sonde automatique mal configurée, deux mille ans après son émission initiale. Voix de l\'homme à la voix mesurée :\n\n"Nous nous retirons.\n\n"Ne nous cherchez pas."\n\nLa sonde a été immédiatement déconnectée par son opérateur, qui a laissé une note dans son journal :\n\n"Je n\'aurais pas dû. J\'ai rediffusé sans réfléchir. C\'est exactement ce qu\'ils nous demandaient de ne pas faire. Je m\'excuse — à eux, principalement, et personne ne saura jamais si l\'excuse leur parvient."',
      reliability: 0.52,
      contradictionTags: ['motif_retrait'],
      motif: 'nous_nous_retirons',
    },
    {
      type: 'archive_entry',
      title: 'Note d\'un archiviste · à propos du retrait',
      text: 'Réflexion d\'un historien contemporain, classée dans nos propres archives :\n\n"Erebus est la seule civilisation que nous étudions sans qu\'elle nous ait laissé matière à étudier. Tout ce que nous savons d\'elle, nous le savons parce qu\'elle a refusé de nous le dire.\n\n"C\'est une forme inversée d\'archéologie. Habituellement, l\'archéologue reconstruit à partir de ce qui reste. Ici, on reconstruit à partir de ce qui a été effacé.\n\n"Et ce qui a été effacé, par contraste, dit quelque chose d\'aussi fort que ce qui reste."',
      reliability: 0.74,
      contradictionTags: ['motif_retrait'],
      motif: 'nous_nous_retirons',
    },
  ],


  // ═══════════════════════════════════════════════════════════════
  // BRIGANDIERS — fragments
  // ═══════════════════════════════════════════════════════════════

  // ═══ VAGUE 1 — Premier contact ═══
  brigandiers_01: [
    {
      type: 'audio_fragment',
      title: 'Rumeur captée · station-relais civile',
      text: 'Captation accidentelle d\'une conversation, fréquence civile non chiffrée. Deux voix, ton chaleureux, fond sonore : musique étouffée, verre qui tinte.\n\n"— T\'as déjà été au Dernier Sas ?\n— Non. On dit que ça n\'existe pas, le Dernier Sas.\n— Évidemment qu\'on dit ça. C\'est Beatrice qui dit ça. Mais moi j\'y suis allé trois fois.\n— Et alors ?\n— Alors trois fois je m\'en suis sorti vivant. Tu trouves ça normal, toi ?"\n\nLa transmission s\'interrompt sur un rire.',
      reliability: 0.51,
    },
    {
      type: 'archive_entry',
      title: 'Note du Bureau du Commerce · plainte non traitée',
      text: 'Plainte déposée par une compagnie d\'assurances inter-systèmes :\n\n"Nous avons identifié quarante-sept épaves de cargos dans le secteur M-S-77, sur les vingt dernières années. Aucune n\'apparaît dans les registres officiels de pertes. Aucune n\'a fait l\'objet d\'une déclaration au port. Toutes contenaient, au moment de leur destruction, des marchandises légales mais non déclarées.\n\n"Nous suspectons l\'existence d\'un point de passage non recensé dans ce secteur. Toutes nos demandes d\'enquête ont été déboutées par les autorités locales."\n\nDate de la plainte : il y a dix-huit ans. Date de la dernière relance : il y a six mois.',
      reliability: 0.74,
    },
    {
      type: 'inscription',
      title: 'Gravure sur une plaque de sas',
      text: 'Plaque arrachée à une vieille station orbitale abandonnée, secteur M-S-7741. Métal patiné. Gravure au burin, à la main :\n\n"Si tu lis ça, tu y es presque.\n\n"Si tu n\'es pas le bienvenu, tu sauras avant d\'entrer.\n\n"Si tu es le bienvenu, prends une chaise au fond."\n\nPas signée. Personne ne signe rien chez eux.',
      reliability: 0.62,
    },
  ],

  brigandiers_02: [
    {
      type: 'archive_entry',
      title: 'Certificat de décès · Nara Vegra (occurrence n°9)',
      text: 'Document officiel délivré par le Bureau des Pertes du secteur M-A-33 :\n\n"Pilote : Nara Vegra. Catégorie : Aiguille civile non immatriculée. Cause du décès : impact contre un astéroïde non cartographié. Date : il y a quatre ans.\n\n"Note de l\'agent : il s\'agit du neuvième certificat de décès délivré au nom de cette pilote, sur une période de dix-sept ans. Nous suggérons que les huit précédents soient archivés sous la catégorie ‹ erreur administrative ›, ou que la pilote concernée bénéficie d\'une chance statistiquement remarquable."\n\nLe certificat porte un coup de tampon. À côté du tampon, à l\'encre noire, quelqu\'un a écrit : "À la prochaine."',
      reliability: 0.78,
    },
    {
      type: 'audio_fragment',
      title: 'Enregistrement de bar · soir de course',
      text: 'Captation d\'ambiance, lieu non identifié. Verre brisé, applaudissements, voix qui rit fort, accent rocailleux :\n\n"...non mais attends, attends. La Vegra. La Vegra elle a déjà été morte neuf fois. NEUF fois. Et chaque fois, à chaque foutue fois, elle est revenue avec une histoire différente sur comment elle s\'en était sortie. La première, ok. La deuxième, drôle. La troisième, on doute. La neuvième... la neuvième t\'as juste envie de lui payer un verre et de te taire."\n\n[grand rire, plusieurs voix]\n\n"À la Vegra ! — À la Vegra !"',
      reliability: 0.42,
    },
    {
      type: 'object_record',
      title: 'Aiguille retrouvée · sans pilote',
      text: 'Description d\'un véhicule récupéré flottant dans un champ de débris, secteur M-A-3309 :\n\n"Aiguille de course modèle artisanal. Châssis modifié. Moteur de cuirassé léger monté sur structure de moto galactique. Pesage : 380 kg. Vitesse de pointe estimée : suicidaire.\n\n"L\'Aiguille est intacte. La selle est encore chaude au moment de la récupération, ce qui est inexplicable étant donné qu\'elle dérivait depuis au moins onze heures.\n\n"Sous la selle, scotchée : une note, écrite à la main : ‹ Pas cette fois non plus. À la prochaine. — N.V. ›"',
      reliability: 0.66,
    },
  ],

  // ═══ VAGUE 2 — Les figures ═══
  brigandiers_03: [
    {
      type: 'inscription',
      title: 'Carte vendue par Torek "Deux Fois"',
      text: 'Carte stellaire sur parchemin synthétique, achetée par un contrebandier débutant pour quatre cents crédits. Note manuscrite signée "T." :\n\n"Coordonnées de la planque du Vieux Lien : M-X-4471-09. Sois là vendredi à 21h. Mot de passe : ‹ on était trois ›. Ne dis pas le mot de passe avant qu\'on te le demande. Bonne chance."\n\nLa carte vendue le mois précédent au même prix, retrouvée plus tard dans une autre épave, indiquait :\n\n"Coordonnées : M-X-3318-22. Mardi 21h. ‹ on était quatre ›."\n\nLa carte vendue l\'année d\'avant : M-X-9090-11. Dimanche minuit. ‹ on était deux ›.\n\nToutes les coordonnées sont vraies. Toutes les planques existent. Aucune n\'est la même.',
      reliability: 0.66,
    },
    {
      type: 'audio_fragment',
      title: 'Discussion · cabinet d\'agent fiscal',
      text: 'Enregistrement administratif (consultation officielle), parc fiscal du secteur M-X :\n\n"— Monsieur, nous avons identifié quatre-vingt-quatorze ventes de cartes de contrebande sur les vingt dernières années, toutes signées d\'un certain Torek dit ‹ Deux Fois ›. Quatre-vingt-quatorze coordonnées différentes. Aucune ne correspond à la même planque.\n— Et ?\n— Et nous voudrions savoir laquelle est la vraie.\n— C\'est là que je vous arrête. Elles sont toutes vraies. C\'est ça, le truc. Toutes les coordonnées sont vraies. Il y a quatre-vingt-quatorze planques différentes. C\'est exactement pour ça qu\'il s\'appelle Deux Fois."',
      reliability: 0.49,
    },
    {
      type: 'archive_entry',
      title: 'Note d\'un agent du fisc · résigné',
      text: 'Note manuscrite trouvée dans un dossier classé sans suite :\n\n"On ne le coincera jamais. Torek vend la même carte cinquante fois, sauf qu\'à chaque fois la carte est vraie. Il n\'a jamais menti à un client. Il a juste jamais vendu deux fois la même destination. Légalement, c\'est imparable. Moralement, c\'est insultant. Personnellement, j\'admire."\n\nL\'agent qui a écrit ce mot a quitté l\'administration deux mois plus tard. Personne ne sait ce qu\'il est devenu. Une rumeur dit qu\'il achète, depuis, des cartes à Torek. Mais une rumeur dit toujours quelque chose.',
      reliability: 0.58,
    },
  ],

  brigandiers_04: [
    {
      type: 'audio_fragment',
      title: 'Conversation au Dernier Sas',
      text: 'Captation d\'une conversation entre Beatrice et un client habitué, fond sonore de bar :\n\n"— Beatrice, tu sors jamais d\'ici ?\n— Tu poses la question parce que tu ne m\'as jamais vue dehors, c\'est ça ?\n— Personne ne t\'a jamais vue dehors.\n— C\'est parce qu\'il n\'y a pas de dehors.\n— Beatrice.\n— Quoi.\n— Tu sais qu\'il y a un dehors.\n— Je sais qu\'il y a un dehors POUR TOI. Pour moi, il y a le bar. Tout le reste, c\'est une idée que les gens se font.\n\n[silence]\n\n— Remets-nous une tournée.\n— Voilà. Tu te sens mieux quand on parle d\'autre chose."',
      reliability: 0.51,
    },
    {
      type: 'archive_entry',
      title: 'Note médicale · examen sur place',
      text: 'Note d\'un médecin appelé pour intervenir au Dernier Sas après une bagarre :\n\n"La barmaid, dite ‹ Beatrice La Colleuse ›, présente une particularité physiologique inhabituelle. Aucun examen ne peut être pratiqué hors du bar — elle refuse de quitter la zone de gravité artificielle. Sur place, ses constantes sont parfaitement normales. Pouls, tension, respiration : conformes à toutes les normes.\n\n"Sur ma demande, elle a accepté de marcher trois pas vers la sortie. À mi-chemin, elle s\'est arrêtée. Elle a souri. Elle m\'a dit : ‹ N\'insistez pas, docteur. C\'est plus simple comme ça pour tout le monde. › Et elle est retournée derrière son comptoir.\n\n"Je n\'ai pas insisté. Je crois qu\'elle avait raison."',
      reliability: 0.74,
    },
    {
      type: 'inscription',
      title: 'Plaque sur le comptoir du Dernier Sas',
      text: 'Plaque vissée derrière le comptoir, lisible depuis les tabourets clients. Lettres gravées :\n\n"Maison gérée par Beatrice depuis trente-quatre ans.\n\n"Aucune dette n\'est oubliée.\n\n"Aucun client n\'est oublié non plus."\n\nSous la plaque, à la peinture, une autre main a ajouté :\n\n"C\'est sûrement la même chose."',
      reliability: 0.62,
    },
  ],

  // ═══ VAGUE 3 — Plus de figures ═══
  brigandiers_05: [
    {
      type: 'archive_entry',
      title: 'Faux registre signé Père Cobalt',
      text: 'Document administratif officiel, sceau de la Société de Transit Inter-Systèmes (sceau authentique). Date d\'émission : il y a sept ans.\n\n"Certificat de provenance · cargaison 2284-Δ.\n\n"Marchandises : artefacts archéologiques cataloguons, conformément à la convention en vigueur, comme ‹ pierres décoratives sans valeur historique ›.\n\n"Origine : système Tergun-VII (système n\'existant pas — fabriqué de toutes pièces dans le registre).\n\n"Destination : usage privé.\n\n"Signature de l\'agent : Cobalt, agent certifié n° 0017."\n\nL\'agent n° 0017 n\'a jamais existé dans les registres officiels. Mais le sceau est authentique. Et le document a passé sept contrôles douaniers sans déclencher la moindre alerte.\n\nC\'est le Père Cobalt. C\'est tout ce qu\'il sait faire. Et il le fait très bien.',
      reliability: 0.78,
    },
    {
      type: 'audio_fragment',
      title: 'Confession dans un coin du Dernier Sas',
      text: 'Captation accidentelle, voix d\'homme âgé, ton mesuré, fond sonore de bar étouffé :\n\n"...j\'étais prêtre, jeune. Vraiment. Avec la robe, les sermons, tout. Et puis un jour j\'ai compris que les gens venaient me voir non pas pour entendre la vérité, mais pour entendre une histoire qui les arrangeait, racontée par quelqu\'un qu\'ils trouvaient digne de confiance.\n\n"Alors je me suis dit : autant être honnête là-dessus. J\'ai quitté la robe. J\'ai pris un stylo. Je fais le même métier qu\'avant. Je dis aux gens ce qu\'ils ont besoin d\'entendre, sur du papier qui a l\'air officiel. Sauf que maintenant c\'est moins hypocrite, et c\'est mieux payé.\n\n"À votre santé."',
      reliability: 0.42,
    },
    {
      type: 'object_record',
      title: 'Tampon officiel · faux',
      text: 'Tampon administratif retrouvé dans un tiroir secret de la cabine d\'un certain "agent de transit". Le tampon imite parfaitement le sceau officiel de la Société de Transit Inter-Systèmes — au point que sept experts indépendants n\'ont pas réussi à le distinguer de l\'authentique.\n\nLe tampon a été identifié comme appartenant au Père Cobalt. Il en posséderait, selon les rumeurs, plus de quarante différents, tous parfaits, tous illégaux.\n\nIl les fabrique lui-même, dans son temps libre, entre deux verres de bourbon synthétique. Il dit que c\'est sa façon à lui de prier.',
      reliability: 0.66,
    },
  ],

  brigandiers_06: [
    {
      type: 'archive_entry',
      title: 'Bulletin officiel · Traversées Rouges',
      text: 'Bulletin de la dernière course officielle des Traversées Rouges. Date : il y a onze ans.\n\n"Pilote en tête à mi-parcours : Jax Orven. Avance : 4,7 secondes sur le deuxième.\n\n"Position à l\'avant-dernier checkpoint : Jax Orven. Avance : 6,1 secondes.\n\n"Position à la ligne d\'arrivée : ...\n\n"L\'Aiguille de Jax Orven n\'a jamais franchi la ligne. Elle a été détectée par les caméras de fin de course, à 0,4 seconde de l\'arrivée, avant de disparaître des radars sur une distance inférieure à 200 mètres.\n\n"Aucune épave n\'a été retrouvée. Aucune trace. Aucune balise de détresse. Aucun signal.\n\n"Le titre de champion lui a été remis à titre posthume."',
      reliability: 0.81,
    },
    {
      type: 'audio_fragment',
      title: 'Témoignage d\'un commissaire de course',
      text: 'Interview enregistrée du commissaire en chef des Traversées Rouges, dix ans après les faits :\n\n"On a tout vérifié. Trois fois. Les caméras montrent Jax à 0,4 seconde de la ligne. Vivant. Souriant — il souriait toujours dans la dernière ligne droite, le con. Et puis... rien. Pas d\'explosion. Pas d\'éclair. Pas de freinage. Pas de virage. Rien.\n\n"Le truc, c\'est que Jax avait déjà gagné cette course. Il avait gagné à l\'avant-dernier checkpoint, il restait quatre secondes faciles, c\'était plié. Pourquoi quelqu\'un disparaît à 0,4 seconde d\'une victoire qu\'il avait déjà ?\n\n"Ma théorie ? Il a vu quelque chose qui valait plus que la victoire. Ne me demandez pas quoi. Personne n\'a jamais su."',
      reliability: 0.58,
    },
    {
      type: 'inscription',
      title: 'Plaque commémorative · ligne d\'arrivée',
      text: 'Plaque vissée à la balise marquant la ligne d\'arrivée de l\'ancienne course, balise désaffectée depuis l\'interdiction officielle des Traversées Rouges :\n\n"Jax Orven. Champion. Disparu à 0,4 seconde de la ligne, le jour où il avait déjà gagné.\n\n"Il a peut-être préféré la ligne d\'avant. Personne ne lui en veut."\n\nLa plaque a été ajoutée par des inconnus, après l\'interdiction. Aucun nom de commanditaire. Aucune autorité ne l\'a fait retirer. Elle est encore là.',
      reliability: 0.69,
    },
  ],

  brigandiers_07: [
    {
      type: 'archive_entry',
      title: 'Inventaire de garage · saisi par les douanes',
      text: 'Inventaire d\'un atelier de mécanique saisi par les douanes après un raid. L\'atelier appartenait à une certaine "Mimi Skoll", mécanicienne, sans casier.\n\nObjets recensés :\n— 1 moteur de cargo léger, modifié.\n— 1 moteur d\'Aiguille de course, en pièces.\n— 1 moteur d\'origine inconnue, fonctionnel, comportant trois pièces officiellement identifiées comme étant issues de missiles de classe orbitale (modèle obsolète, retiré du service il y a dix ans).\n— 1 chat. Roux. Ne répond à aucun nom prononcé.\n\nNote du douanier qui a effectué la saisie : ‹ J\'ai laissé le chat. ›',
      reliability: 0.74,
    },
    {
      type: 'audio_fragment',
      title: 'Conseil de mécanique · enregistré sans le savoir',
      text: 'Conversation captée dans un atelier, voix de femme, ton patient :\n\n"— Mimi, ça va marcher, ce truc ?\n— Ça va marcher.\n— T\'es sûre ? Parce qu\'on dirait qu\'il y a un piston de missile là.\n— C\'est un piston de missile.\n— D\'accord. Mais c\'est dans un cargo civil.\n— Je sais.\n— Il va exploser ?\n— Pas si tu ne lui demandes pas d\'exploser. Les pistons de missiles, c\'est comme les missiles : ils savent ce qu\'on attend d\'eux. Tu lui demandes de pousser un cargo, il pousse un cargo. Tu lui demandes de pulvériser une frégate, il pulvérise une frégate. C\'est une question de respect du contrat.\n— Mimi.\n— Quoi.\n— Tu me fais flipper.\n— Bonne nouvelle alors. Si je te faisais pas flipper, c\'est que tu serais mort."',
      reliability: 0.51,
    },
    {
      type: 'object_record',
      title: 'Cargo non immatriculé · moteur Mimi',
      text: 'Cargo civil léger récupéré à la dérive, après un raid douanier raté (l\'équipage ayant pris la fuite à pied — fait inhabituel pour un raid spatial).\n\nLe moteur a été démonté pour analyse. Les techniciens ont mis quatre mois à comprendre comment il fonctionnait. Conclusion finale :\n\n"Ce moteur ne devrait pas fonctionner. Pour des raisons techniques très claires. Il fonctionne quand même. Pour des raisons que nous ne comprenons pas, mais qui semblent impliquer une compréhension intuitive de la physique des missiles obsolètes que nous n\'avons jamais formalisée.\n\n"Nous recommandons de ne pas chercher à reproduire ce moteur. Si nous l\'essayions, il exploserait probablement."',
      reliability: 0.62,
    },
  ],

  // ═══ VAGUE 4 — Hauts faits ═══
  brigandiers_08: [
    {
      type: 'archive_entry',
      title: 'Rapport militaire impérial · La Nuit des Balises',
      text: 'Rapport classifié du Commandement Impérial du secteur M-B, daté il y a huit ans. Document partiellement déclassifié.\n\n"À 03h47, le 14 du 7e mois, l\'ensemble du réseau de balises non-officielles du secteur M-B s\'est activé simultanément. Plus de quatre mille balises, dont la majorité étaient officiellement répertoriées comme inactives ou démantelées, ont émis pendant exactement sept minutes.\n\n"Pendant ces sept minutes, nos radars ont détecté :\n— 18 200 cargos en mouvement.\n— 47 000 routes de transit actives.\n— 230 alertes de catégorie rouge.\n\n"Toutes étaient fausses. Sauf une.\n\n"Le cargo réel n\'a jamais été identifié. Sa cargaison non plus."',
      reliability: 0.81,
      contradictionTags: ['nuit_balises', 'aveugler_empire'],
    },
    {
      type: 'audio_fragment',
      title: 'Témoignage anonyme · La Nuit des Balises',
      text: 'Enregistrement transmis anonymement à un journaliste, trois ans après les faits. Voix d\'homme, accent rocailleux, ton amusé :\n\n"— Comment vous avez fait, en fait ?\n— On a passé deux ans à allumer des balises. Une par une. Sans alarmer personne. On les laissait éteintes. On les vérifiait. On les éteignait juste un peu plus, à chaque fois, pour qu\'elles aient l\'air mortes mais qu\'elles soient prêtes.\n— Deux ans ?\n— Deux ans. Trois cent quatre-vingt-douze nuits de travail. Trente-six équipes. Quarante-sept Aiguilles. Pas un seul accroc.\n— Et la cargaison ?\n— Ah ça. La cargaison. Je peux pas vous dire. Mais je peux vous dire qu\'elle est en sécurité. Et que personne ne la retrouvera. Et qu\'on était quarante-sept à savoir où elle est, et qu\'aujourd\'hui on n\'est plus que trente-deux, et que les quinze qui restent ne parlent pas non plus.\n\n"[silence]\n\n— Pourquoi vous me dites ça aujourd\'hui ?\n— Parce que dans trois jours j\'aurai bu plus que ce que mon foie peut supporter. C\'est pas de la mélancolie. C\'est de la planification.\n\n"[rire]\n— À la prochaine."',
      reliability: 0.42,
      contradictionTags: ['nuit_balises'],
    },
    {
      type: 'inscription',
      title: 'Graffiti · station orbitale impériale',
      text: 'Graffiti retrouvé sur le mur extérieur d\'une station orbitale impériale du secteur M-B, daté approximativement de la semaine suivant la Nuit des Balises. Peint à la bombe, en énorme :\n\n"ON Y ÉTAIT."\n\nSous le graffiti, en plus petit, à la main, manuscrit :\n\n"Et vous, vous étiez où ?"\n\nLe graffiti a été effacé sept fois par les équipes de nettoyage impériales. Il est réapparu sept fois, à la même place, dans la nuit suivante. Au huitième effaçage, les équipes ont arrêté.\n\nIl est toujours là.',
      reliability: 0.66,
      contradictionTags: ['nuit_balises', 'motif_on_y_etait'],
      motif: 'on_y_etait',
    },
  ],

  brigandiers_09: [
    {
      type: 'archive_entry',
      title: 'Bilan cartographique · secteur M, vingt dernières années',
      text: 'Compilation des données cartographiques officielles du secteur M.\n\n— Routes commerciales officielles il y a vingt ans : 184.\n— Routes commerciales officielles aujourd\'hui : 2 412.\n— Balises de navigation impériales il y a vingt ans : 217.\n— Balises de navigation impériales aujourd\'hui : 4 850.\n— Zones non cartographiées il y a vingt ans : ~47% du secteur.\n— Zones non cartographiées aujourd\'hui : 0,8% du secteur.\n\nLe secteur M est devenu, en deux décennies, le plus précisément cartographié de la galaxie habitée. Tout y est balisé, taxé, surveillé, compté.\n\nLes activités jadis appelées ‹ contrebande ›, ‹ traversée libre › ou ‹ commerce informel › ont diminué dans la même proportion. Ce qui plaît, sans doute, aux administrations.\n\nMoins, peut-être, à ceux qui en vivaient.',
      reliability: 0.74,
    },
    {
      type: 'audio_fragment',
      title: 'Lamentation au comptoir · Dernier Sas',
      text: 'Captation au Dernier Sas, voix de pilote vieillissant, ton aviné :\n\n"...je te jure, gamin. Quand j\'étais jeune, tu pouvais traverser un système entier sans qu\'une seule balise sache ton nom. Tu pouvais te perdre. Tu pouvais te retrouver. Tu pouvais boire un coup avec quelqu\'un dont personne ne savait qu\'il existait.\n\n"Aujourd\'hui ? Aujourd\'hui t\'as à peine quitté le port qu\'une sonde t\'a déjà identifié, déclaré, taxé, recommandé un itinéraire optimal. T\'es plus un pilote. T\'es un point sur une carte. Et un point qui paie ses cotisations.\n\n"[le pilote se tait. Beatrice lui sert un verre sans qu\'il l\'ait demandé.]\n\n"Beatrice. Beatrice, est-ce qu\'on est en train de disparaître ?\n\n"[Beatrice, très calmement] : ‹ Pas encore. Mais on se cache mieux qu\'avant. ›"',
      reliability: 0.49,
    },
    {
      type: 'inscription',
      title: 'Tag · paroi d\'un sas désaffecté',
      text: 'Tag bombé en grand sur la paroi extérieure d\'un sas de station abandonnée, secteur M-Z. Lettres orange brûlé :\n\n"QUE RESTE-T-IL DE LA LIBERTÉ QUAND TOUT L\'UNIVERS EST CARTOGRAPHIÉ, TAXÉ, SURVEILLÉ ET COMPTÉ ?"\n\nSous le tag, à la peinture noire, quelqu\'un a répondu :\n\n"Nous.\n\n"Pour l\'instant."',
      reliability: 0.62,
    },
  ],

  // ═══ VAGUE 5 — Motif ═══
  brigandiers_10: [
    {
      type: 'inscription',
      title: 'Motif récurrent · sur les comptoirs',
      text: 'La phrase « On y était. » apparaît sur :\n\n— Le revers de la plupart des dessous-de-verre du Dernier Sas, manuscrite par les clients.\n— Le bas des Aiguilles modifiées par Mimi Skoll, gravée au burin.\n— L\'intérieur des couvercles de boîtes du Père Cobalt, à la mine de plomb.\n— Les murs des sas désaffectés, à la bombe orange brûlé.\n— Les certificats de décès de Nara Vegra, du n°2 au n°9, sous le tampon officiel, en travers.\n\nC\'est moins une devise qu\'un refrain de bar. On le dit aux nouveaux. On le dit aux vieux. On le dit quand quelqu\'un meurt, et on le dit quand quelqu\'un revient.\n\nÇa veut dire : nous étions là, à ce moment, et même si vous l\'oubliez, nous on l\'oubliera pas.',
      reliability: 0.88,
      contradictionTags: ['motif_on_y_etait'],
      motif: 'on_y_etait',
    },
    {
      type: 'audio_fragment',
      title: 'Refrain · chanson de bar inachevée',
      text: 'Captation d\'une chanson chantée par plusieurs voix au Dernier Sas, fin de soirée, tonalité de fortune :\n\n"On y était quand Nara est tombée la première fois\n On y était quand Torek a vendu sa première carte\n On y était quand le Père a perdu sa robe\n On y était quand Mimi a fait son premier moteur en pièces de missiles\n On y était —"\n\n[la chanson s\'arrête. Quelqu\'un demande : "On était où, déjà ?". Rire général. Une autre voix : "Partout où il fallait être, Mimi. Partout où il fallait être."]',
      reliability: 0.42,
      contradictionTags: ['motif_on_y_etait'],
      motif: 'on_y_etait',
    },
    {
      type: 'archive_entry',
      title: 'Note d\'un archiviste · à propos du refrain',
      text: 'Note de service interne, classée dans nos propres archives :\n\n"J\'ai consigné dans ce dossier la phrase ‹ On y était › trente-six fois. Sur des verres, des moteurs, des registres, des murs, des chansons. Toujours sans signature. Toujours dans des marges.\n\n"Je note que c\'est la seule phrase, dans toute ma carrière, que j\'aurais voulu écrire moi-même au moment où je l\'ai trouvée. C\'est une phrase qui dit deux choses en même temps :\n\n"1. Nous y étions, et vous ne pouvez pas nous l\'enlever.\n"2. Vous, vous n\'y étiez pas, et nous ne pouvons pas vous l\'apprendre.\n\n"C\'est, à mon humble avis d\'archiviste, l\'une des plus belles phrases jamais laissées par un groupe humain. Et personne ne l\'a signée. Bien sûr."',
      reliability: 0.74,
      contradictionTags: ['motif_on_y_etait'],
      motif: 'on_y_etait',
    },
  ],
};
