/* Starbyte — d04_marche_et_demarrage.js
   Données, variables et instructions exécutées au chargement (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


const MARKET_SEASONS = {
  normale: {
    key: 'normale',
    label: 'Saison normale',
    accent: '#7aaadc',
    bio: 'Le commerce galactique tourne à son rythme habituel. Rien à signaler.',
    buyMult: 1.0,
    sellMult: 1.0,
    weight: 35,  // probabilité d'apparition
  },
  abondance: {
    key: 'abondance',
    label: 'Abondance galactique',
    accent: '#78c88c',
    bio: 'Les flottes ont ramené plus que prévu. Tout est moins cher — mais ta production vaut moins aussi.',
    buyMult: 0.70,   // -30% achat (bon)
    sellMult: 0.70,  // -30% vente (mauvais)
    weight: 20,
  },
  penurie: {
    key: 'penurie',
    label: 'Pénurie sectorielle',
    accent: '#e87a3a',
    bio: 'Quelque chose s\'est passé dans le secteur voisin. Tout coûte plus cher.',
    buyMult: 1.50,   // +50% achat (mauvais)
    sellMult: 1.50,  // +50% vente (bon)
    weight: 20,
  },
  boom: {
    key: 'boom',
    label: 'Boom commercial',
    accent: '#ffc864',
    bio: 'Une grande maison cherche désespérément des ressources. Ta production vaut le double — pour quelques jours.',
    buyMult: 1.0,    // achat standard
    sellMult: 2.0,   // vente × 2 (MEGA bon)
    weight: 10,
  },
  crise: {
    key: 'crise',
    label: 'Crise spéculative',
    accent: '#e87a7a',
    bio: 'Le marché s\'est effondré. Personne ne veut acheter ta production, et tout est devenu hors de prix.',
    buyMult: 1.50,   // +50% achat (terrible)
    sellMult: 0.50,  // -50% vente (terrible)
    weight: 8,
  },
  contrebande: {
    key: 'contrebande',
    label: 'Vague de contrebande',
    accent: '#9988aa',
    bio: 'Les comptoirs officiels payent moins, mais les compteurs noirs payent plus. Cristal hyperdemandé.',
    buyMult: 1.10,
    sellMult: 0.90,  // mais bonus cristal géré séparément
    weight: 7,
    cristalSellBonus: 1.40, // cristal vendu +40% en plus du sellMult
  },
};

// Durée d'une saison : 7 jours réels (cf. canon GDD).
const MARKET_SEASON_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/* ═══════════════════════════════════════════════════════════════
   COMMERCE BOTTOM SHEET — ouverture/fermeture + rendus
   ═══════════════════════════════════════════════════════════════ */

let _commerceSheetContext = null;

// État interne de l'onglet courant
let _commerceTab = 'routes';

/* ═══════════════════════════════════════════════════════════════
   CHUNK D — ENVOI TANKER SUR ROUTE + ARRIVÉE AU DOCK (18/05/2026)
   ═══════════════════════════════════════════════════════════════
   Cf. starbyte_docks_francs.md § "DÉCISIONS CANON — CHUNK D"
   Sous-chunks à venir : D2 (séjour), D3 (joueurs), D4 (deals), D5 (retour).
   D1 actuel : envoi → mini-compose cargo → mission "route_run" → arrivée au dock → écran dock.
   ═══════════════════════════════════════════════════════════════ */

// ─── Config carburant et capacité par tier de tanker ───
const TANKER_TIER_CONFIG = {
  1: { fuelCost: 50,  cargoCapacity: 500,  label: 'T1' },
  2: { fuelCost: 150, cargoCapacity: 2000, label: 'T2' },
  3: { fuelCost: 400, cargoCapacity: 8000, label: 'T3' },
};

// ─── Procédural : génération de docks ───
// Chaque dock a une identité visuelle (palette, ambiance, type) générée par graine déterministe
// dérivée de la destination. Deux routes vers la même destination produisent toujours le même dock.
const DOCK_TYPES = [
  {
    key: 'asteroid_bar',
    label: 'Comptoir d\'astéroïde',
    accent: '#c4762a',
    sub: 'Bar foré dans la roche',
    ambience: 'Lumière orangée. Murs en pierre creusée. L\'air sent le métal chaud et l\'alcool de synthèse.',
    detail: 'Le bar est installé dans le creux d\'un astéroïde qui dérive depuis des décennies dans des coordonnées qu\'aucune carte officielle ne reconnaît.',
  },
  {
    key: 'abandoned_station',
    label: 'Station orbitale abandonnée',
    accent: '#9988aa',
    sub: 'Vestige réoccupé',
    ambience: 'Néons cassés, certaines sections vides, gravité partielle. Quelques équipages campent dans les anciens dortoirs.',
    detail: 'L\'Empire a déclassé cette station il y a vingt cycles. Les premiers occupants n\'ont pas demandé la permission. Personne ne leur a demandé non plus.',
  },
  {
    key: 'hidden_freeport',
    label: 'Port-franc dissimulé',
    accent: '#8bc24a',
    sub: 'Plate-forme orbitale civile',
    ambience: 'Anneaux artificiels, sas multiples, marchés ouverts. Les contrôles sont minimes mais pas inexistants.',
    detail: 'Officiellement, ce port n\'existe pas. Officieusement, c\'est le plus actif du secteur. Une rumeur dit qu\'il appartiendrait à une coopérative de capitaines retraités.',
  },
  {
    key: 'derelict_carrier',
    label: 'Porte-vaisseaux désaffecté',
    accent: '#5fa8e8',
    sub: 'Cuirassé éventré devenu refuge',
    ambience: 'Coque ouverte vers l\'espace mais hangars pressurisés. Les vaisseaux dérivent côte à côte, amarrés à des plateformes improvisées.',
    detail: 'Le porte-vaisseaux a été touché lors d\'un conflit oublié. L\'équipage d\'origine n\'est jamais reparti. Leurs descendants gèrent l\'amarrage.',
  },
  {
    key: 'pilgrim_stop',
    label: 'Halte de pèlerins',
    accent: '#fac74c',
    sub: 'Station religieuse mixte',
    ambience: 'Couloirs silencieux, chants lointains, lumière douce. On y croise des moines et des contrebandiers qui partagent les mêmes bancs.',
    detail: 'La station appartient à un ordre dont personne ne sait plus quoi penser. Ils n\'interdisent rien. Ils n\'autorisent rien non plus.',
  },
];
// PATCH_1510_CROWN — The Drifting Crown, la station pirate : le lieu caché du secteur M
var CROWN_DOCK_ID = 'dock-37oe89';
var CROWN_DOCK = {
  name: 'The Drifting Crown', type: 'hidden_freeport', typeLabel: 'Port franc pirate', sub: 'station-bar à la dérive · 2,4 km',
  accent: '#f0b54a', crown: true,
  ambience: 'Elle dérive depuis plus longtemps que les cartes ne s\'en souviennent. Une couronne de laiton et de coques rapiécées, dix bras tendus vers le vide, des milliers de hublots ambrés. On y entre sans pavillon ; on en ressort avec des dettes, une route ou un ennemi.',
  detail: 'Au bord de l\'anneau, sous l\'enseigne dorée, le bar de la Couronne. Ici tout se vend : cargaisons, adresses, routes. Les bots du comptoir ont la mémoire longue, et la langue plus longue encore.',
};
// PATCH_1510_SANCTUAIRE — le Sanctuaire du Linceul des Cendres : le lieu caché du secteur O
var SANCT_DOCK_ID = 'dock-otqflf';
var SANCT_DOCK = {
  name: 'Sanctuaire du Linceul des Cendres', typeLabel: 'Bastion impérial', sub: 'station-colonie sur astéroïde · 5,2 km',
  accent: '#a9c4e8', station: 'sanctuary',
  ambience: 'Un astéroïde que l\'Empire a cuirassé pierre après pierre, au cœur d\'un nuage de cendres bleues que les pilotes appellent le Linceul. Quatorze bras d\'amarrage, des tours aux aiguilles rouges, une citadelle qui ne dort jamais. On y vient en pèlerin, en marchand ou en prisonnier.',
  detail: 'Sous la verrière nord, la halle : pèlerins, marchands sous licence, officiers en permission. Ici on parle bas. Les bannières écoutent, et le registre impérial n\'oublie personne.',
};
CROWN_DOCK.station = 'crown';
// PATCH_1610_NOIRE — la Station Erebus, étrave noire impériale (station O'Neill série noire) : le lieu caché du secteur N, troisième station secrète
var NOIRE_DOCK_ID = 'dock-uguzli';
var NOIRE_DOCK = {
  name: 'Station Erebus', typeLabel: 'Étrave noire impériale', sub: 'station orbitale O\'Neill · 5,6 km',
  accent: '#c3c8dc', station: 'noire',
  ambience: 'Elle n\'apparaît sur aucune carte et ne répond à aucun appel. Un cylindre noir de cinq kilomètres, deux anneaux d\'habitat, des rangées de feux rouges qui s\'allument quand on approche, comme si quelque chose ouvrait les yeux. La Confédération ne confirme pas son existence. Elle t\'a pourtant laissé t\'amarrer.',
  detail: 'Dans l\'anneau arrière, derrière les baies blindées, le pont d\'observation : équipages de frégates furtives, marchands sans pavillon, agents qui ne donnent jamais leur nom. Ici, chaque transaction est enregistrée, et rien n\'est jamais effacé.',
};
// PATCH_1910_REFUGE — le Refuge de Brest (19/10, Adrien : c'est lui, le « Refuge de Brest » des pistes d'exploration), station-mammouth dans un champ de glace : quatrième lieu caché, second du secteur N (l'ancien « Sanctuaire d'Erebus », A-N-8096)
var REFUGE_DOCK_ID = 'dock-wc15ki';
var REFUGE_DOCK = {
  name: 'Refuge de Brest', type: 'hidden_freeport', typeLabel: 'Refuge des glaces', sub: 'station-mammouth · 3 km de défense à défense',
  accent: '#ffb46a', station: 'refuge',
  ambience: 'Au milieu d\'un champ de glace, une bête d\'ivoire de trois kilomètres : un crâne cuirassé, deux défenses qui se referment sur le vide, des oreilles maillées comme des voiles. Ses yeux sont deux baies ambrées qui ne s\'éteignent jamais. Personne ne sait qui l\'a bâtie. On sait seulement qu\'elle accueille tout le monde.',
  detail: 'Sous le ventre de la bête pend la ville suspendue : des tours renversées, des passerelles, des lanternes qui tremblent dans le froid. Pèlerins, mineurs de glace, réfugiés sans pavillon. Ici on ne demande pas d\'où tu viens, seulement si tu as de quoi te réchauffer.',
};
// PATCH_2210_STATIONS6 — six stations lointaines, hors de la zone de test (L, P à un secteur ; K, Q à deux)
var VEYRA_DOCK_ID = 'dock-o3pz0b', LUCIOLES_DOCK_ID = 'dock-smt2z6', IVOIRE_DOCK_ID = 'dock-uzt7ha',
    AKHET_DOCK_ID = 'dock-xy2s3', ABIME_DOCK_ID = 'dock-wldphp', OBSIDIENNE_DOCK_ID = 'dock-3c8na';
var VEYRA_DOCK = {
  name: 'L\'Œil de Veyra', type: 'asteroid_bar', typeLabel: 'Station-œil', sub: 'sphère de céramique · 600 m',
  accent: '#e8c27a', station: 'veyra',
  ambience: 'Une sphère de céramique veinée d\'ambre, et dans sa face un œil immense dont l\'iris tourne lentement quand un vaisseau approche. Personne ne sait ce qu\'il regarde. On sait seulement qu\'il ne cligne jamais.',
  detail: 'Derrière la pupille, on devine la lumière chaude du bar : un comptoir, des étagères éclairées, des tables qui donnent sur le vide. On y vient pour voir, et pour être vu.',
};
var LUCIOLES_DOCK = {
  name: 'Le Mont des Lucioles', type: 'pilgrim_stop', typeLabel: 'Montagne habitée', sub: 'roche et cristal · 2,1 km',
  accent: '#b48cff', station: 'lucioles',
  ambience: 'Une montagne entière flotte dans le noir, couverte de lichen qui luit comme un essaim de lucioles. Des cristaux violets percent ses flancs, et quatorze chapeaux de pierre portent chacun leur petite ville.',
  detail: 'Le hangar s\'ouvre dans la roche, sous les chapeaux. Pèlerins, mineurs de cristal et marchands de lumière s\'y croisent dans une odeur de pierre mouillée. On dit que le lichen se souvient de chaque visage.',
};
var IVOIRE_DOCK = {
  name: 'La Grille d\'Ivoire', type: 'hidden_freeport', typeLabel: 'Treillis de sphères', sub: 'réseau cristallin · 1,2 km',
  accent: '#e6d29a', station: 'ivoire',
  ambience: 'Un cube parfait de sphères d\'ivoire, de chrome et d\'or, reliées par des poutres qui chantent quand la lumière les traverse. Au centre, le cœur : une sphère plus grande, et dans sa face un portail bleu qui ne s\'éteint jamais.',
  detail: 'Dans le cœur, la salle des échanges : des marchands venus de partout, des comptes tenus à la virgule, des contrats signés sous le portail. Ici tout est en ordre, et tout a un prix.',
};
var AKHET_DOCK = {
  name: 'Le Tombeau d\'Akhet', type: 'derelict_carrier', typeLabel: 'Pyramide orbitale', sub: 'obsidienne et or · 1,25 km de haut',
  accent: '#e8a24a', station: 'akhet',
  ambience: 'Une pyramide d\'obsidienne posée sur le vide, ses arêtes d\'or allumées par une éclipse qui ne finit jamais. Deux gardiens à tête de chacal veillent sur le portail. Les pilotes coupent la radio en approchant, sans savoir pourquoi.',
  detail: 'Le portail ouvre sur une salle immense, une colonnade et un mur de lumière au fond. On y parle à voix basse. Ceux qui y commercent ne disent jamais pour qui.',
};
var ABIME_DOCK = {
  name: 'La Dent de l\'Abîme', type: 'derelict_carrier', typeLabel: 'Station-croc', sub: 'émail bleu nuit · 2,6 km',
  accent: '#6fd6d0', station: 'abime',
  ambience: 'Une dent de deux kilomètres et demi, émail bleu nuit fendu de lumière, qui dérive dans un océan d\'étoiles. Autour d\'elle, des méduses de lumière montent sans bruit. On dit que la bête qui l\'a perdue rôde encore.',
  detail: 'Dans la halle, sous la racine, des galeries s\'enfoncent dans l\'émail. Récupérateurs, chasseurs d\'épaves et équipages sans nom s\'y retrouvent. Ici on parle de profondeur comme d\'autres parlent d\'or.',
};
var OBSIDIENNE_DOCK = {
  name: 'La Main d\'Obsidienne', type: 'abandoned_station', typeLabel: 'Main de chrome noir', sub: 'chrome irisé · 1,4 km',
  accent: '#c08cff', station: 'obsidienne',
  ambience: 'Une main ouverte, immense, en chrome noir irisé, dont le bout des doigts brûle d\'un cristal violet. Ses capsules de verre fumé abritent des salles où personne ne se souvient d\'être entré. Elle semble attendre qu\'on y dépose quelque chose.',
  detail: 'Au creux de la paume, une lumière douce et des salles habitées derrière le verre. On y troque ce qu\'on ne vend nulle part ailleurs. Certains repartent les mains vides, et le regrettent toute leur vie.',
};
var STATION_DOCKS = { [CROWN_DOCK_ID]: CROWN_DOCK, [SANCT_DOCK_ID]: SANCT_DOCK, [NOIRE_DOCK_ID]: NOIRE_DOCK, [REFUGE_DOCK_ID]: REFUGE_DOCK,
  [VEYRA_DOCK_ID]: VEYRA_DOCK, [LUCIOLES_DOCK_ID]: LUCIOLES_DOCK, [IVOIRE_DOCK_ID]: IVOIRE_DOCK, [AKHET_DOCK_ID]: AKHET_DOCK, [ABIME_DOCK_ID]: ABIME_DOCK, [OBSIDIENNE_DOCK_ID]: OBSIDIENNE_DOCK };

/* ═══════════════════════════════════════════════════════════════
   D2 — SYSTÈME D'HUMEUR ÉQUIPAGE (18/05/2026)
   ═══════════════════════════════════════════════════════════════
   Cf. starbyte_docks_francs.md § Humeur de l'équipage.
   Deux axes parallèles :
     - Axe humeur (humorScore 0-100) → 4 paliers Reposé/Calme/Inquiet/Mutin
     - Axe physique (physicalState string) → Sobre/Émeché/Saoul/Cuvé
   Tick toutes les 30s en mode test (1h simulée par tick).
   ═══════════════════════════════════════════════════════════════ */

// Durées de séjour canon (en ms réel)
const DOCK_STAY_DURATIONS = {
  short:  { ms: 2  * 3600 * 1000, label: '2 heures',  desc: 'Bref ravitaillement' },
  medium: { ms: 24 * 3600 * 1000, label: '1 journée', desc: 'Séjour normal' },
  long:   { ms: 7  * 24 * 3600 * 1000, label: '7 jours', desc: 'Long séjour — opportunités élevées' },
};

const CREW_HUMOR_LABELS = {
  repose:  { label: 'Reposé',  color: '#8bc24a', desc: 'L\'équipage profite du dock.' },
  calme:   { label: 'Calme',   color: '#5fa8e8', desc: 'Ambiance normale à bord.' },
  inquiet: { label: 'Inquiet', color: '#fac74c', desc: 'Tensions visibles, demandes de rentrer.' },
  mutin:   { label: 'Mutin',   color: '#e87a4a', desc: 'L\'équipage perd patience — risque de désertion.' },
};

const CREW_PHYSICAL_LABELS = {
  sobre:   { label: 'Sobre',   color: '#aaa9a8', desc: '' },
  emeche:  { label: 'Émeché',  color: '#c5b4d4', desc: 'Légèrement détendu.' },
  saoul:   { label: 'Saoul',   color: '#d088f0', desc: 'Désinhibé, imprévisible.' },
  cuve:    { label: 'Cuvé',    color: '#7a8a99', desc: 'Groggy post-soûlerie.' },
};

// Probabilité de basculer vers ivresse par type de dock (par tick d'1h simulée)
// Recalibré 18/05 : les valeurs initiales (5-70%) donnaient un équipage saoul à coup sûr
// sur un séjour standard de 24h. Nouvelles valeurs visent une chance "globale" plus juste :
// pilgrim_stop ~5% global / asteroid_bar ~90% global sur 24h.
const DOCK_DRUNKENNESS_RATES = {
  asteroid_bar:        0.10,
  derelict_carrier:    0.05,
  abandoned_station:   0.025,
  hidden_freeport:     0.015,
  pilgrim_stop:        0.002,  // les moines tiennent leur monde
};

// Récits — tokens : {crew} = nom d'équipier (tirage indépendant à chaque utilisation),
// {tanker} = nom du tanker, {dock} = nom du dock courant.
// Chaque template peut avoir plusieurs {crew} qui seront tous des prénoms différents.
const CREW_NARRATIVES = {
  // ─── Humeur (sobre par défaut) ───
  repose: [
    "L'équipage profite des sas annexes. {crew} a trouvé un masseur qui ne demande pas d'identification.",
    "{crew} a passé deux heures dans une bibliothèque oubliée. En est revenu avec trois livres et aucune explication.",
    "{crew} et trois mécaniciens ont monté un petit marché improvisé près du tanker. Ils vendent des pièces dont personne ne sait l'origine.",
    "L'équipage dort. Vraiment. Ce dock est un des rares où on peut fermer les yeux sans sentir une lame s'approcher.",
    "{crew} a négocié une nuit entière avec un vieil officier impérial à la retraite. Au matin, ils étaient amis. Personne n'a su pourquoi.",
    "{crew} a payé pour faire jouer un orchestre miteux pendant tout le quart de nuit. L'équipage a dormi pour la première fois en six mois.",
  ],
  calme: [
    "Quart de surveillance normal. {crew} a rédigé son rapport sans surprise particulière.",
    "Les techniciens ont profité du séjour pour vérifier l'isolation des cellules de propulsion. Tout est nominal.",
    "{crew} a écrit à sa famille. Trois pages pour dire qu'il va bien. Personne ne lui a demandé pourquoi c'était long.",
    "Quelqu'un a joué une mélodie au coin du quai. Le reste de l'équipage a écouté en silence.",
    "{crew} a passé l'après-midi à apprendre les règles d'un jeu de cartes local. Il a perdu douze fois de suite. Il a quand même souri.",
    "Routine. Carburant. Vérifications. Personne n'a rien remarqué d'anormal — et c'est suffisamment rare pour être noté.",
  ],
  inquiet: [
    "Trois membres d'équipage ont demandé quand on rentre. Aucune réponse satisfaisante n'a été donnée.",
    "Le maître d'équipage a dû calmer une dispute entre deux soutiers. Le motif officiel : la file d'attente du réfectoire. Le motif réel : autre chose.",
    "{crew} a refusé un quart. Le lieutenant a noté l'incident sans le sanctionner. Pour l'instant.",
    "L'humeur à bord est tendue. Personne ne sait exactement pourquoi, mais tout le monde le sent.",
    "{crew} a regardé le dock pendant deux heures sans bouger. Quand on lui a demandé ce qu'il regardait, il a répondu : \"rien\".",
    "Une rumeur circule à bord à propos d'un membre d'équipage qui aurait disparu il y a deux séjours. Personne ne se souvient de son nom — et c'est ça qui inquiète.",
  ],
  mutin: [
    "Le mécanicien-chef a verrouillé le local technique de l'intérieur. Il refuse de répondre aux appels.",
    "{tanker} a noté trois absences non justifiées au rapport du matin. {crew} n'a pas voulu insister.",
    "Une discussion à voix basse a duré toute la nuit dans le dortoir des soutiers. Personne ne sait ce qui s'est dit. Mais le climat a changé.",
    "{crew} a demandé au capitaine de rentrer immédiatement. Le ton n'était plus celui d'une suggestion.",
    "Deux membres d'équipage ont rangé leurs affaires en silence. Quand on leur a demandé ce qu'ils faisaient, ils n'ont pas répondu.",
    "{crew} a déposé son insigne sur la table du carré et est sorti. Personne ne l'a suivi. Personne ne l'a ramassé non plus.",
  ],
  // ─── Saoul (s'adapte à n'importe quelle humeur) ───
  saoul: [
    "Trois membres d'équipage sont rentrés à bord en se soutenant. L'un d'eux pleurait. Personne n'a posé de question.",
    "{crew} a parié son insigne de grade contre une bouteille. Il a perdu. Il a aussi perdu sa chemise.",
    "{crew} a passé la nuit dans un dortoir collectif avec trois autres équipages. Au matin, ils étaient tous d'accord pour ne plus jamais en parler.",
    "Quelqu'un a entonné un chant de marin pendant trois heures. Au début c'était drôle.",
    "{crew} est revenu avec une carte tatouée sur l'avant-bras. Il jure ne pas se souvenir d'où elle vient.",
    "{crew} a dansé. Plusieurs membres d'équipage l'ont vu. Plusieurs membres d'équipage en parleront longtemps.",
    "{crew} a vendu son blouson réglementaire pour quatre verres. Le lendemain, il a essayé de prétendre qu'il ne l'avait jamais possédé.",
    "Une chanson a fait pleurer trois soutiers d'un coup. Personne ne se souvient des paroles. Personne ne veut s'en souvenir.",
  ],
  // ─── Cuvé ───
  cuve: [
    "L'équipage somnole. Toute activité est suspendue. Le bruit des moteurs porte trois fois plus loin que d'habitude.",
    "Personne n'a faim. Personne n'a soif. Personne ne se souvient.",
    "{crew} a passé la matinée à fixer le plafond du carré. Il n'a pas bougé jusqu'à l'heure du déjeuner. Il n'a pas déjeuné.",
  ],
};

// Événements spéciaux selon combo humeur+saoul
// Probabilité d'apparition lors d'un tick saoul : 30%
// Tokens : {crew} = nom tiré du pool, {tanker} = nom du tanker.
const CREW_SPECIAL_EVENTS = {
  carte_tatouee: {
    needs: ['repose', 'saoul'],
    weight: 1,
    apply: (mission) => {
      // Génère une carte gratuite ajoutée à G.routeCards
      if (typeof generateRouteCard === 'function') {
        const card = generateRouteCard();
        card.source = 'Tatouage d\'équipage';
        card.name = 'Carte tatouée';
        if (!Array.isArray(G.routeCards)) G.routeCards = [];
        G.routeCards.push(card);
      }
      return "✦ {crew} est revenu avec une carte tatouée sur l'avant-bras. Il jure ne pas se souvenir d'où elle vient. Coordonnées exploitables.";
    },
  },
  bagarre: {
    needs: ['inquiet', 'saoul'],
    weight: 1,
    apply: (mission) => {
      mission._eventBagarre = true;
      return "⚠ Bagarre au bar entre {tanker} et un équipage rival. Deux blessés à bord. Le butin du voyage en pâtira.";
    },
  },
  vol_cargo: {
    needs: ['mutin', 'saoul'],
    weight: 1,
    apply: (mission) => {
      mission._eventVolCargo = true;
      return "✗ Trois membres d'équipage ont disparu dans la ville avec une partie du cargo. Le tanker rentrera allégé.";
    },
  },
  cadeau_quai: {
    needs: ['calme', 'saoul'],
    weight: 1,
    apply: (mission) => {
      mission._eventCadeau = true;
      return "✦ {crew} revient avec une bobine de propulseur rare offerte par un capitaine ivre. À revendre au retour.";
    },
  },
  amitie_inattendue: {
    needs: ['repose', 'saoul'],
    weight: 1,
    apply: (mission) => {
      mission._eventAmitie = true;
      return "✦ Un contact s'est créé au comptoir : un certain {crew} propose ses services pour de futurs deals.";
    },
  },
  pari_perdu: {
    needs: ['saoul'],
    weight: 2,
    apply: (mission) => {
      const loss = 50 + Math.floor(Math.random() * 100);
      mission._eventPariCG = loss;
      return `⚠ {crew} a perdu un pari. Compte personnel négatif. La caisse de bord est ponctionnée de ${loss} CG pour éponger.`;
    },
  },
};

/* ═══════════════════════════════════════════════════════════════
   D3 — AUTRES CONVOIS AMARRÉS (18/05/2026)
   ═══════════════════════════════════════════════════════════════
   Cf. starbyte_docks_francs.md § DÉCISIONS D3.
   Génération déterministe de 0-4 tankers PNJ par dock+jour.
   Aucune interaction directe — juste de la présence narrative.
   ═══════════════════════════════════════════════════════════════ */

// Pool de pavillons (joueurs fantômes). Style ICO / Foundation / X-Wars.
// Réutilise des noms canon du jeu (Torek, Cobalt) pour cohérence narrative.
const NPC_CAPTAINS = [
  { name: 'Capitaine Bersek89',  type: 'raider',     bio: 'Raider connu du secteur. Apparait souvent là où des cargos pleins font escale.' },
  { name: 'Mira la Brûlée',      type: 'merchant',   bio: 'Marchande aux mains sales. Vend ce que personne d\'autre ne veut vendre.' },
  { name: 'Le Père Cobalt',      type: 'imperial',   bio: 'Vétéran impérial à la retraite. Continue à porter l\'uniforme par habitude.' },
  { name: 'Torek "Deux Fois"',   type: 'smuggler',   bio: 'Passeur sans loyauté. Toujours en train de partir, jamais arrivé.' },
  { name: 'Karim "Vide-Œil"',    type: 'convoy',     bio: 'Convoyeur indépendant. Dit qu\'il a vu des choses. Personne ne lui demande lesquelles.' },
  { name: 'Lyssa "la Voie"',     type: 'smuggler',   bio: 'Navigatrice clandestine. Connait des routes que les cartes ne reconnaissent pas.' },
  { name: 'Yvon Trois-Lunes',    type: 'guildist',   bio: 'Guildiste prudent. Plus de papiers que de cargo, mais les bons papiers.' },
  { name: 'Dame Vérath',         type: 'noble',      bio: 'Héritière déchue. Voyage sous pseudonyme. Tout le monde la reconnait, personne ne le dit.' },
  { name: 'Stejl le Lent',       type: 'veteran',    bio: 'Vieux briscard. Met une heure à traverser une coursive. Mais il a survécu.' },
  { name: 'Anubis34',            type: 'unknown',    bio: 'Pavillon inconnu de tous les registres. Aucune photo. Quelques rumeurs.' },
  { name: 'Capitaine Holst',     type: 'officer',    bio: 'Officier de marine impériale. Trop droit pour ce dock.' },
  { name: 'Big Vesna Drestul',   type: 'pirate',     bio: 'Trois cuirasses cassées à son actif. Quatre si on l\'écoute.' },
];

// ─── D4 : Table des réactions par type de PNJ (canon GDD docks_francs § D4) ───
// Pour chaque verbe : 'yes' (accepte sans condition) | 'cond' (accepte sous conditions)
//                   | 'rare' (rare, prix élevés) | 'no' (refuse net)
// + refusalReason : explication brève quand 'no' (pour que le joueur comprenne)
const NPC_BEHAVIORS = {
  raider:   { exchange:'cond', info:'rare', protection:'no',   rumor:'yes',  drink:'yes', sell:'yes',  refusalReasonProt:'Je protège pas. Je prends.', refusalReasonSell:null },
  merchant: { exchange:'yes',  info:'yes',  protection:'no',   rumor:'yes',  drink:'yes', sell:'yes',  refusalReasonProt:'Pas mon rayon. Vois un militaire.', refusalReasonSell:null },
  imperial: { exchange:'yes',  info:'cond', protection:'yes',  rumor:'cond', drink:'cond',sell:'no',   refusalReasonSell:'Je ne trahis pas mon Empire.', refusalReasonProt:null },
  smuggler: { exchange:'cond', info:'yes',  protection:'cond', rumor:'yes',  drink:'yes', sell:'yes',  refusalReasonProt:null, refusalReasonSell:null },
  convoy:   { exchange:'yes',  info:'rare', protection:'no',   rumor:'yes',  drink:'yes', sell:'no',   refusalReasonProt:'Je suis seul. J\'escorte personne.', refusalReasonSell:'Trahir, c\'est pas dans ma manière.' },
  guildist: { exchange:'yes',  info:'no',   protection:'yes',  rumor:'no',   drink:'cond',sell:'no',   refusalReasonInfo:'Les infos passent par la Guilde. Pas par moi.', refusalReasonRumor:'On ne raconte rien gratuitement à la Guilde.', refusalReasonSell:'Hors de question.' },
  noble:    { exchange:'no',   info:'rare', protection:'no',   rumor:'yes',  drink:'no',  sell:'no',   refusalReasonExch:'Du troc ? Vous me prenez pour qui ?', refusalReasonProt:'Pas mes affaires.', refusalReasonDrink:'Pas à votre table.', refusalReasonSell:'Inacceptable.' },
  veteran:  { exchange:'yes',  info:'yes',  protection:'no',   rumor:'yes',  drink:'yes', sell:'no',   refusalReasonProt:'Mes jours d\'escorte sont passés.', refusalReasonSell:'Pas par moi.' },
  unknown:  { exchange:'cond', info:'rare', protection:'no',   rumor:'yes',  drink:'yes', sell:'yes',  refusalReasonProt:'Vous voulez vraiment qu\'on me suive ?', refusalReasonSell:null },
  officer:  { exchange:'no',   info:'cond', protection:'yes',  rumor:'no',   drink:'no',  sell:'no',   refusalReasonExch:'Je suis officier. Pas marchand.', refusalReasonRumor:'Les rumeurs ne servent pas l\'ordre.', refusalReasonDrink:'En service, jamais.', refusalReasonSell:'Trahison.' },
  pirate:   { exchange:'no',   info:'rare', protection:'cond', rumor:'yes',  drink:'yes', sell:'yes',  refusalReasonExch:'Le troc, c\'est pour les faibles.', refusalReasonSell:null },
};

// ═══════════════════════════════════════════════════════════════════════
// D5.2 — CARNET DU CAPITAINE : rendu de l'écran + onglets
// Six onglets : Routes / Pavillons / Rumeurs / Infos / Docks / Pistes
// L'onglet Pistes sera vide en V1 (rempli au prochain chunk D5.3).
// ═══════════════════════════════════════════════════════════════════════

const CARNET_TABS = [
  { id: 'pavillons', label: 'Pavillons', emoji: '🛸' },
  { id: 'rumeurs',   label: 'Rumeurs',   emoji: '💬' },
  { id: 'infos',     label: 'Infos',     emoji: '🗞' },
  { id: 'docks',     label: 'Docks',     emoji: '⚓' },
  { id: 'pistes',    label: 'Pistes',    emoji: '📍' },
];

let _carnetActiveTab = 'pavillons';

// ═══════════════════════════════════════════════════════════════════════
// D5.3 — SYSTÈME D'INDICES (LEADS) ET EXPLORATION
// Types canon : 'wreck' (épave) · 'dock_coords' (dock secret) · 'wanted_target' (cible)
// Génération : infos achetées + rumeurs + ambient au dock
// Résolution : tanker exploration → loot, dock ajouté, ou fausse piste
// ═══════════════════════════════════════════════════════════════════════

const LEAD_TYPES = {
  wreck: {
    emoji: '💎',
    label: 'Épave / Cargo flottant',
    color: '#c8b478',
  },
  dock_coords: {
    emoji: '🗺',
    label: 'Coordonnées de dock secret',
    color: '#7aaadc',
  },
  wanted_target: {
    emoji: '🎯',
    label: 'Position d\'une cible',
    color: '#ff7878',
  },
};

const LEAD_TITLES = {
  wreck: [
    'Épave d\'un cargo lourd dérivant',
    'Carcasse de vaisseau marchand',
    'Débris d\'un convoi disparu',
    'Cargo flottant intact',
    'Épave d\'une frégate impériale',
    'Restes d\'une station-relais',
  ],
  dock_coords: [
    'Port-franc dissimulé dans l\'amas',
    'Halte clandestine sur dérive',
    'Comptoir d\'astéroïdes non répertorié',
    'Station orbitale silencieuse',
    'Refuge de passeurs',
  ],
  wanted_target: [
    'Position d\'un raider connu',
    'Refuge d\'un capitaine Wanted',
    'Itinéraire d\'un convoyeur recherché',
  ],
};

const LEAD_DESCRIPTIONS = {
  wreck: [
    'Coordonnées d\'un cargo échoué dans la dérive de Caldris. La cale n\'aurait pas été touchée.',
    'Un vaisseau marchand a disparu il y a trois cycles. Sa balise émet encore, mais faiblement.',
    'On parle d\'un convoi en silence radio. Quelqu\'un sait où il s\'est arrêté.',
    'Un cargo flotte, intact, abandonné. Personne ne dit pourquoi.',
    'Une frégate s\'est échouée. Pas de survivants. Pas de pillage encore.',
  ],
  dock_coords: [
    'Coordonnées d\'un port-franc que les cartes officielles ignorent. Aucune patrouille.',
    'Une halte de passeurs, accessible uniquement sur invitation. Tu l\'as.',
    'Un dock qui apparaît sur les cartes uniquement pour ceux qui savent.',
    'Une station qui se dit neutre. Les prix le confirment.',
  ],
  wanted_target: [
    'Position approximative d\'un raider Wanted. Va savoir s\'il y est encore.',
    'Refuge d\'un capitaine recherché. Approche déconseillée sans escorte.',
  ],
};

// PUBLIC : utiliser depuis le Carnet onglet Pistes — ouvre l'écran de lancement d'exploration
let _explorationLeadId = null;

// Démarrer le cleanup périodique (5 min)
let _leadCleanupInterval = null;

// ─── D4.3 : Pools narratifs et deals ───

// Pool de rumeurs (canon 50% lore / 40% indice / 10% mensonge)
const NPC_RUMORS_POOL = {
  lore: [
    'On dit que {captain} n\'est jamais entré dans un dock impérial. Pas une fois.',
    '{captain} ne dort pas. Son équipage non plus. C\'est dans le sang.',
    'La Compagnie a perdu trois tankers la semaine dernière. Personne ne sait où.',
    'Le Linceul s\'étend. Plus rapidement que les cartes ne le disent.',
    'Mira la Brûlée n\'a pas brûlé partout, juste un bras. L\'autre est en métal froid.',
    'Le Père Cobalt a déserté un combat il y a vingt cycles. Personne ne le lui rappelle ici.',
    'À l\'amas de Vérath, les enfants grandissent en parlant à leurs morts.',
    'Stejl le Lent doit son nom à une blessure ancienne. Pas à un défaut.',
    'Anubis34 a déjà été vu à trois docks le même jour. Trois pavillons identiques.',
    'Les Impériaux préparent quelque chose dans le couloir d\'Erebus. Trop de patrouilles.',
    'Dame Vérath voyage avec un cargo qu\'elle n\'a jamais ouvert. Pas même elle.',
    'Bersek89 a un tatouage qui dit son vrai nom. Personne ne l\'a lu deux fois.',
    'Les dérives de Caldris bougent. Lentement, mais elles bougent.',
    'Big Vesna Drestul rit beaucoup. C\'est ça qui fait peur.',
    'Une route inconnue vient d\'apparaître sur la carte de Yvon Trois-Lunes. Il ne dit pas où.',
  ],
  indice: [
    'Quelqu\'un cherche une route vers la nébuleuse d\'Ahn. Il paye bien.',
    'Le dock le plus proche est moins surveillé qu\'avant. Profite avant que ça change.',
    'Il y a une halte de pèlerins à Σ-{rand} qui ne figure sur aucune carte officielle.',
    'Un capitaine a perdu son tanker hier sur une route stable. Faut vérifier les balises.',
    'La Saigne #2 — c\'est devenu une route surveillée. Tu devrais le savoir.',
    'On paye 5000 CG pour une route vers le couloir d\'Erebus. Demande à un Impérial.',
    'Les marchands de Korr-Vask paient au-dessus du marché pour du cristal en ce moment.',
    'Karim Vide-Œil est passé ici hier. Il n\'a pas bu. Mauvais signe.',
    'L\'amas de Vérath ferme ses portes la semaine prochaine. Profite avant.',
    'Trois cargos pleins ont disparu sur la même route. Ne devine pas laquelle.',
  ],
  mensonge: [
    'Bersek89 est en réalité un agent impérial sous couverture. Tout le monde le sait.',
    'Il existe une route entre Σ-99 et Σ-101 que personne n\'a détectée. Cherche.',
    'L\'Empereur cherche un convoyeur indépendant pour une mission privée. À 50000 CG.',
    'Anubis34 paye 10000 CG pour qui lui rapporte la tête de Capitaine Holst.',
    'Une cuirasse impériale s\'est échouée à Σ-{rand}. Encore pleine.',
    'Le Père Cobalt n\'est pas réellement à la retraite. Il prépare son retour.',
    'Mira la Brûlée vend des morceaux de cuirasse de cuirassé. Authentiques.',
    'Dame Vérath n\'est pas une noble. Elle a tout volé. Y compris le nom.',
  ],
};

// Pool de provenances narratives
const NPC_ORIGINS = [
  'Vient de la nébuleuse d\'Ahn',
  'Vient de l\'amas de Vérath',
  'Vient des marges de Korr-Vask',
  'Vient de Delta-9',
  'Vient du couloir d\'Erebus',
  'Vient de Sigma-26',
  'Origine inconnue',
  'A traversé le Linceul',
  'Vient des dérives de Caldris',
  'Vient des comptoirs de Brigandiers',
];

// Indices de cargo (flous)
const NPC_CARGO_HINTS = [
  { label: 'Cale lourde',   color: '#ffc864' },
  { label: 'Cale légère',   color: '#5fa8e8' },
  { label: 'Cale vide',     color: 'var(--mut)' },
  { label: 'Cargo inconnu', color: 'var(--mut)' },
  { label: 'Cale scellée',  color: '#e87a4a' },
];

// Statuts visibles
const NPC_STATUSES = [
  { key: 'arrived',  label: 'Vient d\'arriver',  color: '#8bc24a' },
  { key: 'staying',  label: 'Au quai',           color: 'var(--mut)' },
  { key: 'leaving',  label: 'Partant bientôt',   color: '#fac74c' },
];

// Fiche d'un PNJ amarré (modal léger)
let _activeNpcId = null;

// ─── Mini-compose dans le sheet : choix tier + cargo de départ ───
// Phase D1 : compose simplifié intégré au sheet. Plus tard (D2+) on pourra
// ajouter le choix de durée de séjour, passagers, etc.
let _composeState = null;

let _activeDockMissionId = null;
let _dockScreenTicker = null;

// ═══ PATCH_1510_CROWN — The Drifting Crown en 3D sur l'écran du dock ═══
// En tête : la station en orbite lente (ou la façade du bar). Toucher → plein écran, on tourne et on zoome.
// Première arrivée de la partie : l'approche s'ouvre d'elle-même en plein écran (le « woah »).
var _crown = null;   // { el, handle, home, fs }
var CROWN_URL = 'assets/3d/sb_dc02.glb?v=20261016-2030';
// PATCH_2510_ENTRER : les styles des stations dès le démarrage — sinon le bouton « ENTRER » de la fiche sur la carte
// restait un petit bouton blanc par défaut tant qu'on n'était jamais entré dans une station pendant la session
setTimeout(() => { try { _crownCss(); _crownCss2(); } catch (e) {} }, 0);
// PATCH_1510_SANCTUAIRE — chaque station : son modèle, ses textes, ses cadrages
var STATION_UI = {
  crown: { id: 'dock-37oe89', profile: 'crown', url: 'assets/3d/sb_dc02.glb?v=20261016-2030', kicker: 'PORT-FRANC', title: 'THE DRIFTING CROWN',
    sub: 'station pirate à la dérive', chips: { dock: 'Le dock', bar: 'Le bar', port: 'La station' }, crewAt: 'au bar', place: 'le bar', seen: 'crownSeen',
    intro: 'Une couronne de laiton à la dérive. Dix bras tendus vers le vide, des milliers de hublots ambrés : ton tanker vient d\'entrer au port franc.', enter: 'ENTRER AU PORT',
    hall: { t: 'Le bar de la Couronne', s: 'Sous l\'enseigne dorée, au bord de l\'anneau. Ceux qui sont à quai, les marchés, les rumeurs, les cartes au comptoir.', i: 'VOIR LE BAR ↑' } },
  sanctuary: { id: 'dock-otqflf', profile: 'sanctuary', url: 'assets/3d/sb_sc01.glb?v=20261015-1900', kicker: 'BASTION IMPÉRIAL', title: 'SANCTUAIRE DU LINCEUL',
    sub: 'bastion impérial sur astéroïde', long: true, chips: { dock: 'Le dock', bar: 'La halle', port: 'Le bastion' }, crewAt: 'à la halle', place: 'la halle', seen: 'sanctSeen',
    intro: 'Un astéroïde cuirassé surgit du Linceul. Des tours aux aiguilles rouges, des baies qui s\'allument une à une : le Sanctuaire t\'a vu venir.', enter: 'ENTRER AU SANCTUAIRE',
    hall: { t: 'La halle du Sanctuaire', s: 'Sous la verrière nord, entre les bannières impériales. Ceux qui sont à quai, les marchés, ce qui se murmure entre pèlerins.', i: 'VOIR LA HALLE ↑' } },
  noire: { id: 'dock-uguzli', profile: 'noire', url: 'assets/3d/sb_on01.glb?v=20261017-0000', kicker: 'ÉTRAVE NOIRE IMPÉRIALE', title: 'STATION EREBUS',
    sub: 'série noire · station furtive', long: true, chips: { dock: 'Le dock', bar: 'Le pont', port: 'La station' }, crewAt: 'sur le pont', place: 'le pont', seen: 'noireSeen',
    intro: 'Rien sur les radars. Puis des feux rouges, un à un, le long d\'un cylindre de cinq kilomètres : Erebus t\'attendait.', enter: 'MONTER À BORD',
    hall: { t: 'Le pont d\'observation', s: 'Dans l\'anneau arrière, derrière les baies blindées. Ceux qui sont à quai, les marchés, ce qui ne se dit qu\'à voix basse.', i: 'VOIR LE PONT ↑' } },
  // PATCH_1910_REFUGE
  refuge: { id: 'dock-wc15ki', profile: 'refuge', url: 'assets/3d/sb_er01.glb?v=20261019-2000', kicker: 'REFUGE DES GLACES', title: 'REFUGE DE BREST',
    sub: 'station-mammouth · champ de glace', long: true, chips: { dock: 'Le dock', bar: 'La ville', port: 'Le Refuge' }, crewAt: 'dans la ville suspendue', place: 'la ville suspendue', seen: 'refugeSeen',
    intro: 'Des éclats de glace, puis deux défenses immenses qui sortent du brouillard. Les yeux de la bête s\'allument : le Refuge de Brest t\'a vu venir.', enter: 'ENTRER AU REFUGE',
    hall: { t: 'La ville suspendue', s: 'Sous le ventre de la bête, entre les tours renversées et les lanternes. Ceux qui sont à quai, les marchés, ce qui se raconte autour du feu.', i: 'VOIR LA VILLE ↑' } },
  // PATCH_2210_STATIONS6
  veyra: { id: 'dock-o3pz0b', profile: 'veyra', url: 'assets/3d/sb_vy01.glb?v=20261022', kicker: 'STATION-ŒIL', title: 'L\'ŒIL DE VEYRA',
    sub: 'sphère de céramique · secteur L', long: true, chips: { dock: 'Le dock', bar: 'Le bar', port: 'L\'Œil' }, crewAt: 'au bar', place: 'le bar', seen: 'veyraSeen',
    intro: 'Une sphère pâle sort du noir. L\'iris tourne lentement, se resserre, et te fixe : l\'Œil de Veyra t\'a vu venir.', enter: 'ENTRER DANS L\'ŒIL',
    hall: { t: 'Le bar derrière la pupille', s: 'Au cœur de l\'œil, derrière l\'iris. Ceux qui sont à quai, les marchés, ce qui se dit quand on croit que personne ne regarde.', i: 'VOIR LE BAR ↑' } },
  lucioles: { id: 'dock-smt2z6', profile: 'lucioles', url: 'assets/3d/sb_ml01.glb?v=20261022', kicker: 'MONTAGNE HABITÉE', title: 'LE MONT DES LUCIOLES',
    sub: 'roche et cristal · secteur P', long: true, chips: { dock: 'Le dock', bar: 'Le hangar', port: 'Le Mont' }, crewAt: 'au hangar', place: 'le hangar', seen: 'luciolesSeen',
    intro: 'D\'abord une lueur verte, comme un essaim. Puis la montagne entière, ses cristaux, ses chapeaux de pierre : le Mont des Lucioles s\'allume pour toi.', enter: 'ENTRER AU HANGAR',
    hall: { t: 'Le hangar de la montagne', s: 'Creusé dans la roche, sous les chapeaux. Ceux qui sont à quai, les marchés, ce que racontent les pèlerins.', i: 'VOIR LE HANGAR ↑' } },
  ivoire: { id: 'dock-uzt7ha', profile: 'ivoire', url: 'assets/3d/sb_gi01.glb?v=20261022', kicker: 'TREILLIS DE SPHÈRES', title: 'LA GRILLE D\'IVOIRE',
    sub: 'réseau cristallin · secteur P', long: true, chips: { dock: 'Le dock', bar: 'Le cœur', port: 'La Grille' }, crewAt: 'au cœur', place: 'le cœur', seen: 'ivoireSeen',
    intro: 'Des sphères d\'ivoire et d\'or, alignées au cordeau. Au centre, un portail bleu s\'ouvre : la Grille d\'Ivoire t\'accepte.', enter: 'ENTRER AU CŒUR',
    hall: { t: 'Le cœur de la Grille', s: 'Sous le portail bleu, la salle des échanges. Ceux qui sont à quai, les marchés, les contrats qui se signent.', i: 'VOIR LE CŒUR ↑' } },
  akhet: { id: 'dock-xy2s3', profile: 'akhet', url: 'assets/3d/sb_pk01.glb?v=20261022', kicker: 'PYRAMIDE ORBITALE', title: 'LE TOMBEAU D\'AKHET',
    sub: 'obsidienne et or · secteur K', long: true, chips: { dock: 'Le dock', bar: 'Le portail', port: 'Le Tombeau' }, crewAt: 'sous le portail', place: 'le portail', seen: 'akhetSeen',
    intro: 'L\'éclipse se lève derrière la pointe. Les arêtes d\'or s\'allument une à une, les gardiens n\'ont pas bougé : le Tombeau d\'Akhet t\'attendait.', enter: 'FRANCHIR LE PORTAIL',
    hall: { t: 'La salle du portail', s: 'Entre les colonnes, devant le mur de lumière. Ceux qui sont à quai, les marchés, ce qu\'on n\'ose dire qu\'ici.', i: 'VOIR LE PORTAIL ↑' } },
  abime: { id: 'dock-wldphp', profile: 'abime', url: 'assets/3d/sb_da01.glb?v=20261022', kicker: 'STATION-CROC', title: 'LA DENT DE L\'ABÎME',
    sub: 'émail bleu nuit · secteur K', long: true, chips: { dock: 'Le dock', bar: 'La halle', port: 'La Dent' }, crewAt: 'dans la halle', place: 'la halle', seen: 'abimeSeen',
    intro: 'Des méduses de lumière remontent du fond. Puis l\'émail bleu nuit, fendu de clarté : la Dent de l\'Abîme sort de l\'océan d\'étoiles.', enter: 'ENTRER DANS LA DENT',
    hall: { t: 'La halle sous la racine', s: 'Dans l\'émail, au bout des galeries. Ceux qui sont à quai, les marchés, les récits des grandes profondeurs.', i: 'VOIR LA HALLE ↑' } },
  obsidienne: { id: 'dock-3c8na', profile: 'obsidienne', url: 'assets/3d/sb_mo01.glb?v=20261022', kicker: 'MAIN DE CHROME NOIR', title: 'LA MAIN D\'OBSIDIENNE',
    sub: 'chrome irisé · secteur Q', long: true, chips: { dock: 'Le dock', bar: 'La paume', port: 'La Main' }, crewAt: 'au creux de la paume', place: 'la paume', seen: 'obsidienneSeen',
    intro: 'Cinq lueurs violettes dans le noir, puis la main entière, ouverte, irisée : la Main d\'Obsidienne se tend vers toi.', enter: 'ENTRER DANS LA PAUME',
    hall: { t: 'Le creux de la paume', s: 'Derrière le verre fumé des capsules. Ceux qui sont à quai, les marchés, ce qu\'on troque ici et nulle part ailleurs.', i: 'VOIR LA PAUME ↑' } },
};
// PATCH_1510_CROWN_SCENE — la vue spatiale : la station en plein écran, une fiche refermable par-dessus
var _crownSpace = null;
var _st3dAsleep = false;

// ─── ROUTES_V2 (03/11) : le mur du bar — chaque port-franc a un tableau commun ; les messages restent quand on repart ───
// Clé = identifiant de présence au dock (mpDockIdForMission) : le même pour tous les tankers amarrés au même endroit.
// Lecture pour tous ; écriture quand un de mes tankers est amarré ici (le registre le vérifie). Registre : schema_mp_v40_mur_du_bar.sql.
const _wallCache = {};
const _wallDraft = {};

// ⚡ V0.5 feedback Adrien — Système de panier marché
// Au lieu d'exécuter immédiatement chaque vente/achat, on accumule dans un panier
// global puis on passe en caisse en une seule transaction.
// L'état panier est volatil (perdu au reload) : c'est voulu, c'est un acte d'achat,
// pas un brouillon à conserver.
//
// Structure :
//   _marketCart = {
//     sells: { metal: 100, energie: 50, ... },  // quantités cumulées par ressource
//     buys:  { cristal: 20, fuel: 1000, ... },
//   }
let _marketCart = { sells: {}, buys: {} };
/* ═══════════════════════════════════════════════════════════════════════════
   PATCH_2210_EMPIRE — RÉPUTATION IMPÉRIALE (22/10/2026, décisions d'Adrien ; GDD claude/starbyte_GDD_reputation_imperiale.md)
   Piller les convois de l'Empire fait monter une réputation (−1 point par heure d'oubli).
   Surveillé (25) : escortes +25 %. Recherché (80) : avis de recherche public et prime (registre v28).
   Ennemi de l'Empire (200) : une expédition punitive part vers la capitale, 12 h de trajet, force annoncée.
   Les pèlerins d'une station impériale comptent à peine : l'Empire se fout de ses sujets.
   ═══════════════════════════════════════════════════════════════════════════ */
var SB_EMP = { SURV: 25, WANTED: 80, ENEMY: 200, DECAY_PER_H: 1, AFTER_BOUNTY: 40, AFTER_EXP: 60, FINE: 40, RECALL: 100, EXP_MS: 12 * 3600e3 };
var SB_EMP_TIERS = [
  { key: 'libre', label: 'Inconnu de l\'Empire', color: 'var(--mut)', escort: 1 },
  { key: 'surveille', label: 'Surveillé', color: '#ffc864', escort: 1.25 },
  { key: 'recherche', label: 'Recherché', color: '#ff8a5a', escort: 1.5 },
  { key: 'ennemi', label: 'Ennemi de l\'Empire', color: '#ff3a2a', escort: 2 },
];

// ── l'avis de recherche (registre) ──
var _sbWanted = { list: [], at: 0 };
setInterval(() => { try { sbEmpTick(); sbEmpPollWanted(); } catch (e) {} }, 30000);
setTimeout(() => { try { sbEmpTick(); sbEmpPollWanted(true); } catch (e) {} }, 8000);
(function () {
  try {
    if (!/[?&]diag=carte\b/.test(location.search)) return;
    const show = () => {
      if (document.getElementById('sb-diag-btn')) return;
      const b = document.createElement('button');
      b.id = 'sb-diag-btn'; b.textContent = '📋 Diagnostic carte';
      b.style.cssText = 'position:fixed;left:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:10040;padding:9px 13px;border-radius:9px;border:1px solid #ff8a5a;background:rgba(10,14,20,.92);color:#ff8a5a;font:600 12px system-ui;letter-spacing:.03em';
      b.onclick = () => sbMapExport();
      document.body.appendChild(b);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  } catch (e) {}
})();

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING — Premier contact joueur (19/05/2026)
   ═══════════════════════════════════════════════════════════════
   5 étapes guidées pour faire vivre au joueur la boucle de base :
   1. Extraire du métal (match-3 sur la mine)
   2. Construire une centrale (énergie)
   3. Construire un laboratoire (cristal)
   4. Construire un chantier (sondes, tankers)
   5. Lancer une sonde radar (univers)
   Après ces 5 étapes, le joueur a vu : extraction, construction, expansion.
   ═══════════════════════════════════════════════════════════════ */

const ONBOARDING_STEPS = [
  {
    id: 'first_match3',
    title: 'Première extraction',
    instruction: 'Va sur <strong>ta planète</strong>, touche une <strong>parcelle vierge</strong> et joue un match-3 pour extraire des ressources de la pierre brute.',
    hint: 'Toutes les hexagones marron sont des parcelles vierges. Tu peux y faire un match-3 sans rien construire.',
    checkComplete: () => (G.res?.metal?.v || 0) >= 200,
  },
  {
    id: 'build_mine',
    title: 'Construire une mine',
    instruction: 'Sur une parcelle, <strong>construis une mine</strong>. Elle produira du métal en passif et te donnera des match-3 plus rentables.',
    hint: 'Touche une parcelle, choisis "Construire" puis "Mine".',
    checkComplete: () => G.planet?.parcels?.some(p => p.building === 'mine'),
  },
  {
    id: 'build_centrale',
    title: 'Énergie',
    instruction: 'Construis une <strong>centrale</strong>. L\'énergie est nécessaire pour la majorité des bâtiments suivants et pour les missions.',
    hint: 'Pas d\'énergie = pas de chantier, pas de sondes, pas de flotte.',
    checkComplete: () => G.planet?.parcels?.some(p => p.building === 'centrale'),
  },
  {
    id: 'build_labo',
    title: 'Recherche',
    instruction: 'Construis un <strong>laboratoire</strong> pour produire du cristal. Le cristal débloque les technologies avancées.',
    hint: 'Cristal = recherche. Pas de cristal, pas de sondes avancées ni de chantier naval.',
    checkComplete: () => G.planet?.parcels?.some(p => p.building === 'labo'),
  },
  {
    id: 'launch_probe',
    title: 'Premier balayage',
    instruction: 'Va au <strong>Centre de prospection</strong> (depuis ta planète) et lance une <strong>sonde Radar</strong>. Tu découvriras tes premières signatures dans l\'univers.',
    hint: 'La sonde Radar est gratuite et jetable. Elle ne revient pas, mais elle révèle un système entier.',
    checkComplete: () => (G.probeReports || []).some(r => r.tier === 'radar' || r.kind === 'radar'),
  },
];

/* ═══════════════════════════════════════════════════════════════
   TUTO_1410 — PREMIERS PAS (14/10/2026, demande d'Adrien) · GDD claude/starbyte_GDD_premiers_pas.md
   L'antenne de prospection sert de fil rouge : pour la bâtir, il faut atteindre 3 fois la veine profonde.
   L'officier de bord explique, une chose à la fois, au moment où le joueur en a besoin :
     0 bienvenue (l'objectif antenne)          → 1 exploiter une parcelle (match-3, palier I)
     2 re-miner : plus on creuse, plus ça paie  → 3 un gisement s'épuise : construire une mine (match-3 infini)
     4 mine en chantier → 5 exploiter la mine  → 6 antenne activée : la suite (fiches, arbre technologique)
   Pendant 0–2, un gisement propose de re-miner (pas de « Construire » qui embrouille) ; la construction
   arrive avec la leçon de la mine. Les comptes déjà avancés ne voient rien (rejouable depuis le centre).
   ═══════════════════════════════════════════════════════════════ */
var TUTO_STEPS = [
  { id: 'welcome', title: 'Bienvenue, commandant',
    text: (c) => `<b>${_tEsc(c.planet)}</b> est aveugle : aucune liaison avec l'extérieur. Ton premier objectif est en haut de l'écran : l'<b>antenne de prospection</b>.<br>Elle se bâtit en creusant : atteins <b>3 fois la veine profonde</b> (le palier III du match-3).`,
    btn: 'Montre-moi', act: 'showRocky' },
  { id: 'exploit', title: 'Exploite une parcelle',
    text: (c) => c.rockyOpen ? `Touche <b>Exploiter</b> : un match-3 creuse la roche. Atteins au moins le <b>palier I</b> pour conquérir la parcelle.`
      : `Touche une <b>plaine rocheuse</b> (les parcelles libres autour du centre), puis <b>Exploiter</b>.`,
    hl: 'Exploiter' },
  { id: 'remine', title: 'Plus tu creuses, plus ça rapporte',
    text: (c) => `Parcelle conquise : c'est maintenant un <b>gisement</b>. <b>Re-mine-le</b> : chaque passage rapporte davantage (×1,15 → ×1,6).<br>Vise la <b>veine profonde</b> : c'est le gros butin, et une étape de l'antenne (<b>${c.vein}/3</b>).`,
    hl: 'Re-miner' },
  { id: 'mine', title: 'Attention à l\'épuisement',
    text: (c) => `Un gisement s'épuise au bout de <b>${REMINE_MAX} passages</b> : ensuite, plus rien. Ne grille pas tes parcelles trop vite.<br>La <b>mine</b>, elle, ne s'épuise jamais : <b>même match-3, à l'infini</b>, et elle produit du métal même quand tu ne joues pas.<br>${c.metal >= 200 ? 'Tu as de quoi : touche un gisement, puis <b>Construire</b> → Mine.' : `Construis-en une sur un gisement dès que tu as <b>200 métal</b> (tu en as ${c.metal}).`}`,
    hl: 'Construire' },
  { id: 'building', title: 'Chantier ouvert',
    text: (c) => `Ta mine sera prête dans <b>${c.mineLeft}</b>, même si tu fermes le jeu. En attendant, continue de creuser tes gisements… sans les épuiser.` },
  { id: 'usemine', title: 'Ta mine tourne',
    text: (c) => `Touche ta <b>mine</b>, puis <b>Exploiter</b> : mêmes paliers, mêmes veines profondes, mais <b>sans épuisement</b>. C'est là que tu finiras ton antenne (<b>${c.vein}/3</b>).`,
    hl: 'Exploiter' },
  { id: 'done', title: 'Ta colonie voit plus loin',
    text: () => `Antenne active : l'univers commence à répondre.<br>La suite : une <b>centrale</b> (énergie), un <b>laboratoire</b> (cristal), puis le <b>chantier orbital</b> (sondes, tankers, flotte). Avant de construire, chaque bâtiment a sa <b>fiche</b> : ce qu'il fait, ce qu'il débloque.<br>Le <b>centre de commandement → Détails</b> ouvre l'arbre technologique.`,
    btn: 'À moi de jouer', act: 'finish' },
];
var SBTuto = (function () {
  const PARCELS = () => (G.planet && G.planet.parcels) || [];
  const ant = () => (window.SBAntenna && typeof SBAntenna.data === 'function' ? SBAntenna.data() : G.antenna) || {};
  const antennaDone = () => { const a = ant(); return !!(a.built && !a.building); };
  const veins = () => { try { return Math.min(3, window.SBAntenna && SBAntenna.veinStep ? SBAntenna.veinStep() : 0); } catch (e) { return 0; } };
  const st = () => G.tuto;
  function init() {
    const ps = PARCELS();
    // PATCH_2110_TUTO_VETERAN : vétéran = au moins un vrai bâtiment (ou une colonie). Un gisement conquis
    // ou l'antenne finie ne suffisent pas : Flotix (arrivé avant le didacticiel) n'a jamais eu ses leçons.
    const hasColony = (G.worlds || []).some(w => w && w.kind === 'colony');
    const hasBuilding = ps.some(q => q && (q.state === 'built' || q.state === 'building'));
    if (G.tuto) {
      if (G.tuto.legacy && !G.tuto.vetFix && !hasColony && !hasBuilding) {
        // marqué vétéran à tort : reprise du didacticiel là où en est la partie (advance() saute les étapes faites)
        G.tuto = { step: 1, at: Date.now(), seen: { m3: true }, vetFix: true };
      }
      return G.tuto;
    }
    const played = antennaDone() || ps.some(q => q && ((q.successCount || 0) > 0 || q.state === 'resource' || q.state === 'depleted'));
    G.tuto = (hasColony || hasBuilding) ? { done: true, legacy: true }
      : played ? { step: 1, at: Date.now(), seen: { m3: true }, vetFix: true }
      : { step: 0, at: Date.now(), seen: {} };
    return G.tuto;   // pas de sauvegarde ici : au démarrage, elle se mêlerait à la réconciliation avec le cloud
  }
  const active = () => {
    const s = st();
    // PATCH_2110_COLONIE_DESERT : un empire qui fonde des colonies n'est plus un nouveau joueur
    if (s && !s.done && (G.worlds || []).some(w => w && w.kind === 'colony')) { s.done = true; s.legacy = true; try { const c = document.getElementById('sb-coach'); if (c) c.style.display = 'none'; } catch (e) {} }
    return !!(s && !s.done && !s.skipped);
  };
  // pendant l'antenne, avant la leçon de la mine : pas de « Construire » sur un gisement
  function gateBuild() { const s = st(); return active() && (s.step || 0) < 3 && !antennaDone(); }
  function recommend() { const s = st(); return active() && (s.step || 0) >= 3 && (s.step || 0) <= 4 && !PARCELS().some(q => q && q.building === 'mine') ? 'mine' : null; }
  function ctx() {
    const sel = G.selParcel != null ? PARCELS()[G.selParcel] : null;
    const mine = PARCELS().find(q => q && q.building === 'mine');
    return { planet: (G.planet && G.planet.name) || 'Ta planète', vein: veins(), metal: Math.floor((G.res && G.res.metal && G.res.metal.v) || 0),
      rockyOpen: !!(sel && sel.state === 'rocky' && cardOpen()),
      mineLeft: mine && mine.buildEndsAt ? (typeof formatTankerDuration === 'function' ? formatTankerDuration(Math.max(0, mine.buildEndsAt - Date.now())) : 'quelques minutes') : 'quelques minutes' };
  }
  // passage automatique d'une étape à l'autre, selon l'état réel de la partie
  const REPLAY = [0, 1, 2, 3, 5, 6];
  function advance() {
    const s = st(); if (!active() || s.replay) return;
    const ps = PARCELS();
    const conquered = ps.some(q => q && ((q.successCount || 0) > 0 || q.state === 'resource' || q.state === 'depleted' || q.state === 'built' || q.state === 'building'));
    const remined = ps.reduce((n, q) => n + ((q && q.remineCount) || 0), 0);
    const mine = ps.find(q => q && q.building === 'mine');
    let k = s.step || 0;
    if (k === 1 && conquered) k = 2;
    if (k === 2 && (remined >= 1 || veins() >= 1 || mine)) k = 3;
    if (k === 3 && mine) k = mine.state === 'built' ? 5 : 4;
    if (k === 4 && mine && mine.state === 'built') k = 5;
    if (k >= 1 && k <= 5 && antennaDone()) k = mine ? 6 : Math.max(k, 3);   // antenne finie avant la mine : la leçon de la mine d'abord
    if (k === 3 && antennaDone() && mine) k = 6;
    if (k !== s.step) { s.step = k; s.hidden = false; if (typeof saveGame === 'function') saveGame(); if (G.selParcel != null && typeof renderInfoCard === 'function' && cardOpen()) renderInfoCard(G.selParcel); }
  }
  function cardOpen() { const c = document.querySelector('.w-card'); return !!(c && c.classList.contains('on')); }
  function onPlanet() { const s = document.getElementById('scr-planet'); return !!s && !s.classList.contains('hidden'); }

  // ── officier de bord : une fiche au-dessus de la barre de navigation (ou de la fiche de parcelle) ──
  const css = document.createElement('style');
  css.textContent = `
  #sb-coach { position:fixed; left:12px; right:12px; z-index:35; display:none; padding:12px 14px 12px; border-radius:14px;
    border:1px solid rgba(95,255,232,.42); background:rgba(6,14,18,.93); box-shadow:0 10px 30px rgba(0,0,0,.45), 0 0 0 1px rgba(95,255,232,.06) inset;
    backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#dfeaf0; font-size:13px; line-height:1.5; transition:bottom .25s ease, opacity .25s ease; }
  #sb-coach .k { display:flex; align-items:center; gap:8px; font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:#5fffe8; margin-bottom:4px; }
  #sb-coach .k i { width:7px; height:7px; border-radius:50%; background:#5fffe8; box-shadow:0 0 8px #5fffe8; animation:sbCoachPulse 1.6s ease-in-out infinite; }
  #sb-coach .k span.n { margin-left:auto; margin-right:26px; color:rgba(200,215,225,.55); letter-spacing:.08em; }
  #sb-coach .t { font-size:15px; font-weight:600; color:#f2f8fb; margin-bottom:4px; }
  #sb-coach .b b { color:#ffd27a; font-weight:600; }
  #sb-coach .row { display:flex; gap:8px; margin-top:10px; align-items:center; }
  #sb-coach .row .go { flex:1; padding:10px 12px; border-radius:9px; border:1px solid rgba(95,255,232,.55); background:rgba(95,255,232,.12); color:#5fffe8;
    font:inherit; font-size:11px; letter-spacing:.14em; text-transform:uppercase; cursor:pointer; }
  #sb-coach .row .lnk { background:none; border:0; color:rgba(200,215,225,.6); font:inherit; font-size:11px; cursor:pointer; padding:8px 4px; }
  #sb-coach .x { position:absolute; top:6px; right:6px; width:28px; height:28px; border:0; background:none; color:rgba(220,230,240,.55); font-size:17px; cursor:pointer; }
  @keyframes sbCoachPulse { 0%,100% { opacity:.45 } 50% { opacity:1 } }
  .sb-tuto-hl { animation:sbTutoHl 1.3s ease-in-out infinite; position:relative; }
  @keyframes sbTutoHl { 0%,100% { box-shadow:0 0 0 0 rgba(95,255,232,0) } 50% { box-shadow:0 0 0 3px rgba(95,255,232,.55), 0 0 18px rgba(95,255,232,.45) } }
  #sb-m3tip { position:fixed; inset:0; z-index:9600; display:flex; align-items:flex-end; background:rgba(0,0,0,.6); }
  #sb-m3tip .card { width:100%; padding:20px 18px calc(env(safe-area-inset-bottom,0px) + 20px); border-radius:16px 16px 0 0; background:linear-gradient(#0d161c,#071014);
    border-top:1px solid rgba(95,255,232,.35); color:#dfeaf0; font-size:13px; line-height:1.55; }
  #sb-m3tip .tier { display:flex; gap:10px; align-items:flex-start; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06); }
  #sb-m3tip .tier b.n { flex-shrink:0; width:30px; height:30px; border-radius:8px; display:grid; place-items:center; font-size:12px; letter-spacing:.06em; }
  /* fiches (bâtiment, centre de commandement) */
  #sb-sheet { position:fixed; inset:0; z-index:9500; display:flex; align-items:flex-end; background:rgba(0,0,0,.62); }
  #sb-sheet .card { width:100%; max-height:88vh; overflow-y:auto; padding:18px 16px calc(env(safe-area-inset-bottom,0px) + 18px); border-radius:16px 16px 0 0;
    background:linear-gradient(#0f171d,#081015); border-top:1px solid rgba(255,255,255,.12); color:#dfeaf0; -webkit-overflow-scrolling:touch; }
  #sb-sheet .hd { display:flex; gap:12px; align-items:center; margin-bottom:12px; }
  #sb-sheet .ic { width:48px; height:48px; border-radius:12px; display:grid; place-items:center; border:1px solid currentColor; flex-shrink:0; }
  #sb-sheet .fam { font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--mut); }
  #sb-sheet .nm { font-size:19px; font-weight:600; color:#f2f8fb; letter-spacing:.02em; }
  #sb-sheet .lead { font-size:14px; line-height:1.55; color:#e6eef3; margin:2px 0 12px; }
  #sb-sheet .sec { margin:0 0 10px; padding:11px 12px; border-radius:10px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.07); }
  #sb-sheet .sec .lb { font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--mut); margin-bottom:5px; }
  #sb-sheet .sec p { margin:0; font-size:13px; line-height:1.55; }
  #sb-sheet .sec ul { margin:0; padding-left:18px; font-size:13px; line-height:1.6; }
  #sb-sheet .facts { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:0 0 10px; }
  #sb-sheet .facts div { padding:9px 10px; border-radius:10px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.07); }
  #sb-sheet .facts span { display:block; font-size:8.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--mut); margin-bottom:3px; }
  #sb-sheet .facts b { font-size:13px; color:#f2f8fb; font-weight:600; }
  #sb-sheet .facts b i { font-style:normal; }
  #sb-sheet .tip { font-size:12px; color:#ffe1a6; background:rgba(255,190,90,.07); border:1px solid rgba(255,190,90,.25); }
  #sb-sheet .acts { display:flex; gap:8px; margin-top:14px; }
  #sb-sheet .acts button { flex:1; padding:13px 8px; border-radius:10px; font:inherit; font-size:11px; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; white-space:nowrap; }
  #sb-sheet .acts .pri { border:1px solid rgba(95,255,232,.6); background:rgba(95,255,232,.14); color:#5fffe8; }
  #sb-sheet .acts .pri:disabled { opacity:.38; cursor:default; }
  #sb-sheet .acts .sec2 { border:1px solid rgba(255,255,255,.18); background:transparent; color:#cdd6dc; }
  #sb-sheet .miss { color:#ff9a8a; }
  .bld-opt.disabled { pointer-events:auto !important; }
  .bld-opt.sb-reco { border-color:rgba(95,255,232,.55) !important; box-shadow:0 0 0 1px rgba(95,255,232,.25), 0 0 16px rgba(95,255,232,.18); }
  .bld-opt-reco { font-size:10px; color:#5fffe8; letter-spacing:.06em; margin-top:2px; }`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'sb-coach';
  document.body.appendChild(box);
  let lastSig = '';

  function render() {
    const s = st();
    if (!active() || !onPlanet() || s.hidden || document.getElementById('sb-sheet') || document.getElementById('sb-m3tip') || document.querySelector('.p3d-signal, .p3d-ritual')) { box.style.display = 'none'; clearHl(); lastSig = ''; return; }
    const step = TUTO_STEPS[s.step || 0]; if (!step) { box.style.display = 'none'; return; }
    const c = ctx();
    if (s.replay) c.rockyOpen = false;
    const nPos = s.replay ? REPLAY.indexOf(s.step || 0) + 1 : Math.min((s.step || 0) + 1, TUTO_STEPS.length), nTot = s.replay ? REPLAY.length : TUTO_STEPS.length;
    const btn = s.replay ? (step.act === 'finish' ? 'Terminer' : 'Suivant') : step.btn;
    const act = s.replay ? (step.act === 'finish' ? 'finish' : 'next') : step.act;
    const html = `<button class="x" aria-label="Masquer">×</button>
      <div class="k"><i></i>Officier de bord${s.replay ? ' · rappel' : ''}<span class="n">${nPos}/${nTot}</span></div>
      <div class="t">${step.title}</div><div class="b">${s.replay && step.id === 'welcome' ? `Ton premier objectif a été l'<b>antenne de prospection</b> : elle se bâtit en atteignant <b>3 fois la veine profonde</b> (le palier III du match-3). Voici les règles qui comptent.` : step.text(c)}</div>
      <div class="row">${btn ? `<button class="go">${btn}</button>` : ''}${(s.step || 0) === 0 && !s.replay ? '<button class="lnk" data-skip="1">Passer le didacticiel</button>' : ''}</div>`;
    const sig = (s.step || 0) + '|' + html;
    if (sig !== lastSig) {
      lastSig = sig; box.innerHTML = html;
      box.querySelector('.x').onclick = () => { s.hidden = true; if (typeof saveGame === 'function') saveGame(); render(); toast('Officier de bord masqué jusqu\'à la prochaine étape'); };
      const go = box.querySelector('.go'); if (go) go.onclick = () => doAct(act);
      const sk = box.querySelector('[data-skip]'); if (sk) sk.onclick = skip;
    }
    box.style.display = 'block';
    // au-dessus de la fiche de parcelle si elle est ouverte, sinon au-dessus de la barre de navigation
    const card = document.querySelector('.w-card'), nav = document.querySelector('.w-nav');
    let bottom = nav ? Math.max(12, innerHeight - nav.getBoundingClientRect().top + 10) : 120;
    if (card && card.classList.contains('on')) {
      // position finale de la fiche (offsetTop ignore la translation de son animation d'entrée)
      const par = card.offsetParent, top = par ? par.getBoundingClientRect().top + card.offsetTop : card.getBoundingClientRect().top;
      bottom = Math.max(bottom, innerHeight - top + 10);
    }
    const b = bottom + 'px'; if (box.style.bottom !== b) box.style.bottom = b;
    highlight(s.replay ? null : step.hl);
  }
  let hlLabel = null;
  (function () { const pi = document.getElementById('planet-info'); if (pi && window.MutationObserver) new MutationObserver(() => { if (hlLabel !== undefined) highlight(hlLabel, true); }).observe(pi, { childList: true, subtree: true }); })();
  function clearHl() { hlLabel = null; document.querySelectorAll('.sb-tuto-hl').forEach(e => e.classList.remove('sb-tuto-hl')); }
  function highlight(label, fromObs) {
    if (!fromObs) hlLabel = label;
    const btns = [...document.querySelectorAll('#planet-info button')];
    btns.forEach(bt => { const on = !!label && bt.textContent.trim().toLowerCase().startsWith(label.toLowerCase()); if (bt.classList.contains('sb-tuto-hl') !== on) bt.classList.toggle('sb-tuto-hl', on); });
  }
  function doAct(act) {
    const s = st();
    if (act === 'showRocky') {
      s.step = 1; saveGame();
      const ps = PARCELS(); const cap = ps.findIndex(q => q && q.state === 'capital');
      const near = ps.map((q, i) => ({ q, i })).filter(o => o.q && o.q.state === 'rocky').sort((a, b) => Math.abs(a.i - cap) - Math.abs(b.i - cap))[0];
      if (near) {
        let moved = false;
        try { if (window.Planet3D && Planet3D.ready) { Planet3D.focus(near.i); moved = true; } } catch (e) {}
        setTimeout(() => { onHexClick(near.i); lastSig = ''; render(); }, moved ? 950 : 0);   // la fiche après le travelling (sinon il la referme)
      }
    } else if (act === 'next') {
      const i = REPLAY.indexOf(s.step || 0); s.step = REPLAY[Math.min(REPLAY.length - 1, i + 1)]; saveGame();
    } else if (act === 'finish') { s.done = true; s.doneAt = Date.now(); saveGame(); toast('🎓 Tu connais les bases. Bonne route, commandant !'); }
    lastSig = ''; render();
  }
  async function skip() {
    const ok = typeof sbConfirm === 'function' ? await sbConfirm({ title: 'Passer le didacticiel ?', body: 'Tu pourras le revoir depuis le centre de commandement (Détails).', confirmLabel: 'Passer', cancelLabel: 'Continuer' }) : true;
    if (!ok) return;
    const s = st(); s.skipped = true; saveGame(); lastSig = ''; render();
    if (G.selParcel != null && cardOpen()) renderInfoCard(G.selParcel);
  }
  function restart() {
    // partie déjà lancée : les leçons s'enchaînent au bouton (rappel) ; partie neuve : didacticiel normal
    const fresh = !antennaDone() && !PARCELS().some(q => q && (q.state === 'built' || q.state === 'building' || (q.successCount || 0) > 0));
    G.tuto = { step: 0, at: Date.now(), seen: fresh ? {} : { m3: true }, replay: !fresh };
    saveGame(); lastSig = '';
    if (typeof closeSbSheet === 'function') closeSbSheet();
    goto('planet'); setTimeout(render, 300);
  }
  // première partie de match-3 : les paliers, avant de jouer
  function m3Tip() {
    const s = st(); if (!active() || (s.seen && s.seen.m3)) return;
    s.seen = s.seen || {}; s.seen.m3 = true; saveGame();
    const el = document.createElement('div'); el.id = 'sb-m3tip';
    const tier = (n, col, t, d) => `<div class="tier"><b class="n" style="color:${col};border:1px solid ${col}">${n}</b><div><b style="color:#f2f8fb">${t}</b><br><span style="color:var(--mut)">${d}</span></div></div>`;
    el.innerHTML = `<div class="card">
      <div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#5fffe8;margin-bottom:4px">Officier de bord · le forage</div>
      <div style="font-size:17px;font-weight:600;color:#f2f8fb;margin-bottom:6px">Aligne 3 pierres ou plus pour creuser</div>
      <div style="margin-bottom:8px">Chaque alignement extrait des ressources. Plus tu creuses, plus tu descends :</div>
      ${tier('I', '#7ed080', 'Extraction minimale', 'La parcelle est conquise. Tu peux déjà repartir avec tes gains.')}
      ${tier('II', '#ffd27a', 'Rendement optimal', 'Nettement plus de ressources.')}
      ${tier('III', '#ff9a4a', 'Veine profonde', 'Le gros butin, et une étape de ton antenne (3 veines profondes pour l\'activer).')}
      <div style="margin:10px 0 2px">À chaque palier : <b style="color:#ffd27a">Extraire maintenant</b> sécurise tes gains ; <b style="color:#ffd27a">continuer</b> peut rapporter plus, mais le sous-sol devient instable.</div>
      <button style="width:100%;margin-top:14px;padding:13px;border-radius:10px;border:1px solid rgba(95,255,232,.6);background:rgba(95,255,232,.14);color:#5fffe8;font:inherit;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Creuser</button></div>`;
    el.querySelector('button').onclick = () => el.remove();
    document.body.appendChild(el);
  }
  function tick() {
    if (typeof G === 'undefined' || !G || !G.planet) return;
    if (onPlanet() && (!G.tuto || (G.tuto.legacy && !G.tuto.vetFix))) init();   // PATCH_2110_TUTO_VETERAN
    if (!st()) return;
    const m3 = document.getElementById('scr-m3');
    if (m3 && !m3.classList.contains('hidden') && active() && !(st().seen && st().seen.m3)) {
      const c = (window.SBMatch3 && SBMatch3.s && SBMatch3.s.context) || '';
      if (c && c !== 'Secours' && c !== 'Réparation') m3Tip();
    }
    advance(); render();
  }
  setInterval(() => { try { tick(); } catch (e) { console.warn('[tuto]', e); } }, 500);
  document.addEventListener('click', () => setTimeout(() => { try { tick(); } catch (e) {} }, 60), true);
  return { gateBuild, recommend, m3Tip, restart, tick, active, get state() { return st(); }, _render: render };
})();
// la première partie de match-3 commence par l'explication des paliers (à l'ouverture de l'écran de forage,
// quel que soit le module qui lance la partie)
// (relevé dans la boucle du didacticiel : l'écran de forage est reconstruit par match3.js)

// ── fiches : bâtiment avant construction, centre de commandement ──
var BUILDING_GUIDE = {
  mine: { lead: 'Le cœur de ton économie : elle extrait du métal, la ressource de presque tout.',
    how: 'Elle produit du métal en continu, même jeu fermé. Touche-la puis <b>Exploiter</b> : c\'est le même match-3 qu\'une parcelle (paliers, veine profonde), mais <b>à l\'infini</b> : une mine ne s\'épuise jamais.',
    unlocks: ['Le métal de toutes les constructions', 'Des veines profondes à volonté (pour l\'antenne et au-delà)', 'Améliorations : Mine renforcée, puis Extracteur lourd'],
    tip: 'Construis-la sur un gisement avant de l\'avoir épuisé : la parcelle devient une source sans fin.' },
  centrale: { lead: 'L\'énergie de la colonie : sans elle, pas de chantier, pas de sondes, pas de flotte.',
    how: 'Elle produit de l\'énergie en continu. Son match-3 thématique (<b>Énergie</b>) est lui aussi sans fin.',
    unlocks: ['Caserne, chantier orbital, bunker, comptoir et raffinerie (ils coûtent de l\'énergie)', 'Le carburant de la raffinerie (3 énergie → 1 carburant)', 'Les missions de ta flotte'],
    tip: 'C\'est en général le deuxième bâtiment, juste après la première mine.' },
  labo: { lead: 'La recherche : il produit du cristal, la ressource des technologies avancées.',
    how: 'Il produit du cristal en continu. Son match-3 (<b>Recherche</b>) donne surtout du cristal, sans fin.',
    unlocks: ['Les sondes avancées', 'Les améliorations de tier 3', 'Le silo de cristal'],
    tip: 'Le cristal se produit lentement : un laboratoire tôt dans la partie paie longtemps.' },
  caserne: { lead: 'La défense au sol : elle recrute les gardes qui protègent ta colonie.',
    how: 'Elle ajoute +200 de défense et ouvre l\'écran <b>Défense</b>, où tu recrutes l\'infanterie. Les soldats repoussent les débarquements ennemis.',
    unlocks: ['L\'écran Défense planétaire et les gardes', 'Au tier 2 (Centre tactique) : les soldats lourds', 'Des soldats à embarquer pour tes raids'],
    tip: 'Les autres commandants peuvent te raider : une garnison au sol limite le pillage et protège tes bâtiments.' },
  shipyard: { lead: 'Ta porte vers l\'espace : on y assemble tankers et vaisseaux de guerre.',
    how: 'Il ouvre l\'orbite : la station OS-01 et ta flotte à quai. Tu y construis tes vaisseaux, puis tu composes des flottes. (Tes sondes, elles, se construisent au centre de prospection.)',
    unlocks: ['Tankers : exploiter les veines lointaines, rejoindre les docks francs, ouvrir des ambassades', 'Frégates et cuirassés : raids, embuscades, défense orbitale', 'Aller chercher ce que tes sondes ont trouvé'],
    tip: 'Une centrale d\'abord : le chantier coûte de l\'énergie, et ses vaisseaux aussi.' },
  turret: { lead: 'La forteresse : le bunker est la pierre angulaire de ta défense.',
    how: 'Il ajoute +1500 de défense et débloque les tourelles et les soldats lourds dans l\'écran Défense.',
    unlocks: ['Les tourelles (défense orbitale fixe)', 'Les soldats lourds', 'Un vrai mur face aux raids'],
    tip: 'À construire quand ta planète commence à attirer les pillards.' },
  comptoir: { lead: 'La maison de commerce : elle produit des crédits galactiques.',
    how: 'Elle produit des crédits en continu et ouvre le <b>Commerce</b> : marché, routes secrètes, docks.',
    unlocks: ['Le marché (acheter et vendre des ressources)', 'Les routes commerciales et les docks francs', 'Les infos du barman (l\'adresse d\'un commandant, 150 crédits)'],
    tip: 'Les crédits achètent ce que ta planète ne produit pas.' },
  raffinerie: { lead: 'Le carburant de tes tankers en mission longue.',
    how: 'Elle transforme de l\'énergie en carburant (3 → 1) et augmente ta capacité de carburant. Son match-3 est sans fin.',
    unlocks: ['Le carburant des routes longues et de l\'exploration', 'Un plafond de carburant plus haut à chaque tier'],
    tip: 'Inutile avant d\'avoir des tankers.' },
  silo_metal: { lead: 'Plus de place pour ton métal.', how: 'Augmente ta capacité de métal de +5000. Au plafond, la production et les gains de match-3 sont perdus.', unlocks: ['Des stocks assez grands pour les gros chantiers'], tip: 'Quand ta jauge de métal plafonne, c\'est le moment.' },
  silo_energie: { lead: 'Plus de place pour ton énergie.', how: 'Augmente ta capacité d\'énergie de +5000. Au plafond, l\'énergie produite se perd.', unlocks: ['Des réserves pour les missions et la raffinerie'], tip: 'Utile dès que tu as plusieurs centrales.' },
  silo_cristal: { lead: 'Plus de place pour ton cristal.', how: 'Augmente ta capacité de cristal de +2000.', unlocks: ['Des réserves pour les sondes en série et les tiers 3'], tip: 'Le cristal est rare : ne le laisse pas déborder.' },
  silo_fuel: { lead: 'Réservoir de carburant pour tes tankers et tes flottes.', how: 'Augmente ta réserve de carburant (+3 000, puis 12 000 et 50 000 aux niveaux suivants). Le carburant est commun à tout l\'empire.', unlocks: ['Plus de carburant en réserve', 'Plus d\'achats de carburant au marché'], tip: 'La Raffinerie produit le carburant ; le silo le garde.' },
  silo_biomass: { lead: 'Stockage de biomasse (ressource organique).', how: 'Augmente ta capacité de biomasse de +5000.', unlocks: ['Des réserves de biomasse'], tip: 'Coûte 500 métal et 200 énergie. Se construit sur n’importe quelle planète.' },
  silo_artefact: { lead: 'Le coffre sécurisé des artefacts.', how: 'Augmente ta capacité d\'artefacts de +50.', unlocks: ['De la place pour les artefacts rares'], tip: 'Pour plus tard, quand l\'exploration rapporte des artefacts.' },
};

/* PROSPECT_GUIDE_1410 — GUIDE DU CENTRE DE PROSPECTION (14/10/2026, demande d'Adrien)
   Cinq pages : ce que cache l'univers · les sondes · verrouiller une signature · lire la carte · et ensuite.
   S'ouvre à la première visite du centre (une fois par partie), puis à la demande (bouton « ? » sur la carte).
   Même sans chantier orbital, il donne l'envie : secrets, histoires, gens, bars, routes. */
var SBProspectGuide = (function () {
  const css = document.createElement('style');
  css.textContent = `
  #sb-pguide { position:fixed; inset:0; z-index:9550; display:flex; align-items:flex-end; background:rgba(0,0,0,.66); }
  #sb-pguide .pg { width:100%; max-height:90vh; overflow-y:auto; padding:18px 18px calc(env(safe-area-inset-bottom,0px) + 16px); border-radius:16px 16px 0 0;
    background:radial-gradient(120% 60% at 50% 0%, rgba(95,255,232,.07), transparent 60%), linear-gradient(#0c151b,#060d11); border-top:1px solid rgba(95,255,232,.32); color:#dfeaf0; font-size:13.5px; line-height:1.55; -webkit-overflow-scrolling:touch; }
  #sb-pguide .k { display:flex; align-items:center; gap:8px; font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:#5fffe8; margin-bottom:6px; }
  #sb-pguide .k i { width:7px; height:7px; border-radius:50%; background:#5fffe8; box-shadow:0 0 8px #5fffe8; }
  #sb-pguide .k .x { margin-left:auto; background:none; border:0; color:rgba(220,230,240,.6); font-size:18px; cursor:pointer; padding:0 2px; }
  #sb-pguide h3 { margin:0 0 8px; font-size:19px; font-weight:600; color:#f2f8fb; letter-spacing:.01em; }
  #sb-pguide p { margin:0 0 10px; }
  #sb-pguide b { color:#ffd27a; font-weight:600; }
  #sb-pguide .secrets { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:10px 0 4px; }
  #sb-pguide .secrets div { padding:10px; border-radius:10px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.07); font-size:12px; line-height:1.4; color:#c9d6de; }
  #sb-pguide .secrets div b { display:block; color:#f2f8fb; font-size:13px; margin-bottom:2px; }
  #sb-pguide .probe { display:flex; gap:12px; align-items:flex-start; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.06); }
  #sb-pguide .probe:last-child { border-bottom:0; }
  #sb-pguide .probe .ic { flex-shrink:0; width:34px; height:34px; border-radius:9px; display:grid; place-items:center; font-size:17px; border:1px solid currentColor; }
  #sb-pguide .probe .nm { color:#f2f8fb; font-weight:600; }
  #sb-pguide .probe .nm span { font-weight:400; font-size:11px; color:var(--mut); margin-left:6px; }
  #sb-pguide .probe .ds { font-size:12.5px; color:#b8c6cf; }
  #sb-pguide .probe .ct { margin-left:auto; flex-shrink:0; font-size:11px; color:var(--mut); text-align:right; white-space:nowrap; padding-top:2px; }
  #sb-pguide .chain { margin:8px 0 6px; }
  #sb-pguide .st { display:flex; gap:12px; position:relative; padding-bottom:14px; }
  #sb-pguide .st:not(:last-child)::before { content:''; position:absolute; left:16px; top:34px; bottom:0; width:1px; background:linear-gradient(rgba(95,255,232,.45), rgba(95,255,232,.08)); }
  #sb-pguide .st .n { flex-shrink:0; width:33px; height:33px; border-radius:50%; display:grid; place-items:center; font-size:13px; font-weight:600; border:1px solid currentColor; background:rgba(0,0,0,.3); }
  #sb-pguide .st .ti { color:#f2f8fb; font-weight:600; margin-top:5px; }
  #sb-pguide .st .ds { font-size:12.5px; color:#b8c6cf; }
  #sb-pguide .chip { display:inline-block; margin-top:5px; padding:3px 8px; border-radius:6px; font-family:'SF Mono',ui-monospace,monospace; font-size:11px; letter-spacing:.04em; border:1px solid currentColor; background:rgba(0,0,0,.25); }
  #sb-pguide .gest { display:flex; gap:10px; align-items:flex-start; padding:8px 0; }
  #sb-pguide .gest .g { flex-shrink:0; width:30px; text-align:center; font-size:18px; }
  #sb-pguide .note { font-size:12px; color:#ffe1a6; background:rgba(255,190,90,.07); border:1px solid rgba(255,190,90,.25); border-radius:10px; padding:10px 12px; margin:10px 0 0; }
  #sb-pguide .nav { display:flex; align-items:center; gap:10px; margin-top:16px; }
  #sb-pguide .dots { display:flex; gap:6px; flex:1; justify-content:center; }
  #sb-pguide .dots i { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.18); }
  #sb-pguide .dots i.on { background:#5fffe8; box-shadow:0 0 6px #5fffe8; }
  #sb-pguide .nav button { padding:12px 14px; border-radius:10px; font:inherit; font-size:11px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; white-space:nowrap; }
  #sb-pguide .nav .prev { border:1px solid rgba(255,255,255,.16); background:transparent; color:#cdd6dc; }
  #sb-pguide .nav .next { border:1px solid rgba(95,255,232,.6); background:rgba(95,255,232,.14); color:#5fffe8; min-width:116px; }
  #sb-pguide .nav .prev[disabled] { visibility:hidden; }
  #sb-pguide .cta { width:100%; margin-top:10px; padding:12px; border-radius:10px; border:1px solid rgba(58,160,255,.55); background:rgba(58,160,255,.1); color:#8ec8ff; font:inherit; font-size:11px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
  #sb-pguide-btn { position:absolute; right:16px; z-index:30; width:38px; height:38px; border-radius:50%; border:1px solid rgba(95,255,232,.5); background:rgba(6,14,18,.75);
    color:#5fffe8; font:600 17px/1 inherit; cursor:pointer; display:none; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
  #scr-prospect.hidden #sb-pguide-btn { display:none !important; }`;
  document.head.appendChild(css);

  const ready = (k) => ((G.probesPool || []).filter(q => q && (q.tier === k || q.type === k) && q.state === 'ready').length);
  const hasShip = () => (typeof hasShipyardBuilt === 'function' && hasShipyardBuilt());
  const PAGES = [
    () => `<h3>Au-delà de ta planète</h3>
      <p>L'univers ne se donne pas : <b>tout se découvre</b>. Ce centre est ton instrument pour regarder plus loin que ta colonie.</p>
      <div class="secrets">
        <div><b>Des secrets</b>veines lointaines, épaves qui dérivent, lieux cachés</div>
        <div><b>Des histoires</b>archives, signaux anciens, civilisations éteintes</div>
        <div><b>Des gens</b>d'autres commandants, des marchands, des pirates</div>
        <div><b>Des rencontres</b>au comptoir des docks francs, le bar galactique</div>
        <div><b>Des routes</b>que personne n'a encore tracées</div>
        <div><b>Des cibles</b>à piller… ou des alliés à trouver</div>
      </div>
      <p style="margin-top:10px">Tout commence par une sonde.</p>`,
    () => {
      const row = (ic, col, nm, sub, ds, ct) => `<div class="probe"><div class="ic" style="color:${col}">${ic}</div><div><div class="nm">${nm}<span>${sub}</span></div><div class="ds">${ds}</div></div><div class="ct">${ct}</div></div>`;
      const n = (k) => { const c = ready(k); return c ? `${c} prête${c > 1 ? 's' : ''}` : 'à construire'; };
      return `<h3>Tes sondes</h3>
      <p>Chacune a un seul métier. On les enchaîne.</p>
      ${row('◯', '#e6f0ff', 'Radar', 'jetable', 'Sonde une <b>zone entière</b> et relève des <b>signatures</b> opaques (SIG-…). Elle brûle à l\'arrivée.', n('radar'))}
      ${row('◇', '#5fcc8a', 'Légère', 'résolution', '<b>Identifie</b> une signature : une veine ou une épave à exploiter, ou un corps orbital.', n('light'))}
      ${row('◈', '#9a8aff', 'Moyenne', 'verrouillage', '<b>Verrouille</b> un corps orbital : il devient une adresse fixe dans ton carnet.', n('medium'))}
      ${row('⌖', '#a370ff', 'Balise', 'surveillance', 'Reste dans un système et voit <b>passer les convois</b> : qui, d\'où, vers où. Les routes se dessinent.', n('beacon'))}
      ${row('⊙', '#ff8c64', 'Furtive', 'espionnage', 'Observe les stocks et défenses d\'un commandant <b>sans être vue</b>.', n('stealth'))}`;
    },
    () => `<h3>Verrouiller une signature</h3>
      <p>Une signature, c'est un écho : quelque chose est là, mais quoi, et où exactement ? Trois sondes pour le savoir.</p>
      <div class="chain">
        <div class="st"><div class="n" style="color:#e6f0ff">1</div><div><div class="ti">Radar sur une zone</div><div class="ds">Le sondage revient avec des échos opaques.</div><span class="chip" style="color:#e6f0ff">SIG-7F2 · écho métallique</span></div></div>
        <div class="st"><div class="n" style="color:#5fcc8a">2</div><div><div class="ti">Légère sur la signature</div><div class="ds">Elle dit ce que c'est : une <b>veine</b> ou une <b>épave</b> (un tanker peut aller l'exploiter), ou un <b>corps orbital</b>.</div><span class="chip" style="color:#5fcc8a">SIG-7F2 → corps orbital</span></div></div>
        <div class="st"><div class="n" style="color:#9a8aff">3</div><div><div class="ti">Moyenne : verrouillage</div><div class="ds">Le corps orbital devient une <b>adresse fixe</b>, pour toujours, dans ton carnet. Tes tankers et tes flottes peuvent alors s'y rendre.</div><span class="chip" style="color:#9a8aff">A-N-3709-24 · au carnet</span></div></div>
      </div>
      <div class="note">💡 La Moyenne demande la <b>cartographie sismique</b> : laboratoire amélioré au niveau 2.</div>`,
    () => `<h3>Lire la carte</h3>
      <div class="gest"><div class="g">🧭</div><div><b>Atlas</b> pour l'espace en 3D, <b>Tactique</b> pour la vue de dessus, couche par couche.</div></div>
      <div class="gest"><div class="g">👆</div><div><b>Touche une zone</b> voisine, puis « <b>Sonder cette zone</b> » : une seule <b>Radar</b> suffit, quel que soit le nombre d'étoiles. Commence près de ta planète : c'est rapide et ça coûte peu.</div></div>
      <div class="gest"><div class="g">📄</div><div><b>Rapports</b> : chaque sonde revient avec un rapport. Touche une signature pour y envoyer une Légère.</div></div>
      <div class="gest"><div class="g">📒</div><div><b>Carnet</b> : tout ce que tu connais (systèmes, signatures suivies, commandants). <b>Mes mondes</b> : tes planètes et ce qui est en vol.</div></div>
      <div class="gest"><div class="g">⌖</div><div>Le viseur recentre la carte sur ta planète.</div></div>
      <div class="gest"><div class="g">📡</div><div>Ton <b>antenne</b> capte aussi du trafic : quand une bulle apparaît en haut, quelqu'un passe dans le coin.</div></div>`,
    () => hasShip()
      ? `<h3>Et ensuite</h3>
      <p>Ton <b>chantier orbital</b> est prêt : ce que tes sondes trouvent, tes vaisseaux peuvent aller le chercher.</p>
      <div class="gest"><div class="g">⛽</div><div>Un <b>tanker</b> exploite une veine lointaine, rejoint un <b>dock franc</b> (et son bar), ou ouvre une <b>ambassade</b> chez un commandant.</div></div>
      <div class="gest"><div class="g">⚔</div><div>Une <b>flotte</b> raide une adresse verrouillée, ou se poste en embuscade sur une route.</div></div>
      <p style="margin-top:8px">Les autres commandants ne s'affichent pas : <b>il faut les trouver</b>.</p>`
      : `<h3>Et ensuite</h3>
      <p>Tes sondes regardent. Pour <b>aller chercher</b> ce qu'elles trouvent, il te faudra un <b>chantier orbital</b> :</p>
      <div class="gest"><div class="g">⛽</div><div>des <b>tankers</b> pour exploiter les veines lointaines, rejoindre les docks francs et leur bar, ouvrir des ambassades ;</div></div>
      <div class="gest"><div class="g">⚔</div><div>des <b>vaisseaux de guerre</b> pour piller, défendre, tendre des embuscades.</div></div>
      <p style="margin-top:8px">Les autres commandants ne s'affichent pas : <b>il faut les trouver</b>. En attendant, tes sondes préparent le terrain.</p>
      <button class="cta" data-ship="1">Voir la fiche du chantier orbital</button>`,
  ];
  let page = 0;
  function close() { const e = document.getElementById('sb-pguide'); if (e) e.remove(); }
  function draw() {
    const el = document.getElementById('sb-pguide'); if (!el) return;
    const last = page === PAGES.length - 1;
    el.querySelector('.pg').innerHTML = `
      <div class="k"><i></i>Officier de bord · centre de prospection<button class="x" aria-label="Fermer">×</button></div>
      ${PAGES[page]()}
      <div class="nav"><button class="prev" ${page ? '' : 'disabled'}>Retour</button>
        <div class="dots">${PAGES.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')}</div>
        <button class="next">${last ? 'Explorer' : 'Suivant'}</button></div>`;
    el.querySelector('.x').onclick = close;
    el.querySelector('.prev').onclick = () => { if (page) { page--; draw(); } };
    el.querySelector('.next').onclick = () => { if (last) close(); else { page++; draw(); el.querySelector('.pg').scrollTop = 0; } };
    const sh = el.querySelector('[data-ship]'); if (sh) sh.onclick = () => { close(); if (typeof openBuildingSheet === 'function') openBuildingSheet('shipyard', null); };
  }
  function open(at) {
    close();
    const el = document.createElement('div'); el.id = 'sb-pguide';
    el.innerHTML = '<div class="pg"></div>';
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.body.appendChild(el);
    page = Math.max(0, Math.min(PAGES.length - 1, at || 0)); draw();
    if (G.tuto || (G.tuto = { done: true, legacy: true })) { G.tuto.seen = G.tuto.seen || {}; if (!G.tuto.seen.prospect) { G.tuto.seen.prospect = Date.now(); if (typeof saveGame === 'function') saveGame(); } }
  }
  // bouton « ? » sur la carte du centre, sous les boutons existants ; première visite : ouverture automatique
  let shownAt = 0;
  setInterval(() => {
    try {
      const scr = document.getElementById('scr-prospect');
      const vis = !!scr && !scr.classList.contains('hidden');
      let btn = document.getElementById('sb-pguide-btn');
      if (scr && !btn) {
        btn = document.createElement('button'); btn.id = 'sb-pguide-btn'; btn.setAttribute('aria-label', 'Guide du centre de prospection'); btn.textContent = '?';
        btn.onclick = () => open(0); scr.appendChild(btn);
      }
      if (btn) {   // PATCH_1510_GUIDE_BTN — place fixe sous les outils de la carte ; caché quand une fiche ou une feuille est ouverte
        const busy = !!scr.querySelector('.smw-card.on, .smw-sheet.on');
        btn.style.display = vis && !busy ? 'block' : 'none';
        if (vis && !busy) {
          const tools = [...scr.querySelectorAll('.smw-tools button')].filter(b => b.offsetParent);
          const bottom = tools.reduce((m, b) => Math.max(m, b.getBoundingClientRect().bottom), 0);
          const top = Math.round((bottom || 150) + 10) + 'px'; if (btn.style.top !== top) btn.style.top = top;
        }
      }
      if (!vis) { shownAt = 0; return; }
      if (!shownAt) shownAt = Date.now();
      const seen = G.tuto && G.tuto.seen && G.tuto.seen.prospect;
      if (!seen && Date.now() - shownAt > 900 && !document.getElementById('sb-pguide') && !document.getElementById('sb-sheet')) open(0);
    } catch (e) { console.warn('[guide prospection]', e); }
  }, 500);
  return { open, close };
})();

/* ═══════════ INIT ═══════════ */

// ⚡ V0.5 SAVE — Charger la save complète si elle existe
// À ce stade : G est défini, QUEUES est défini, toutes les fonctions sont disponibles.
// loadGame() restaurera G et QUEUES depuis le localStorage 'starbyte_savegame'.
const _SAVE_LOADED_AT_BOOT = loadGame();
window._sbBootLoaded = _SAVE_LOADED_AT_BOOT;   // PATCH_2010_AUDIT — lu par la sauvegarde cloud : partie locale illisible ⇒ on prend celle du cloud
if (_SAVE_LOADED_AT_BOOT) {
  console.log('[V0.5] Save complète restaurée');
} else {
  console.log('[V0.5] Nouveau joueur (pas de save)');
}
// MULTIJOUEUR v0 : après un déménagement, le nouveau système d'origine est créé ici
if (_SAVE_LOADED_AT_BOOT) ensureHomeSystem();
try { sbPurgeFakePlayers(); } catch (e) { console.warn('[univers] faux joueurs', e); }   // PATCH_2210_UNIVERS_OUVERT
if (_SAVE_LOADED_AT_BOOT) { try { mpTidyPlayerReports(); } catch (e) {} }
// Démarrer l'autosave et brancher les hooks (beforeunload, visibilitychange)
initSaveHooks();

// OFFLINE — créditer le temps passé hors du jeu (fermé, natel éteint, Safari en arrière-plan)
if (_SAVE_LOADED_AT_BOOT) catchUpOffline({ boot: true }); else G._simAt = Date.now();
// OFFLINE — les files de production n'étaient relancées qu'en ouvrant un écran : on les relance au boot
if (typeof startQueueTicker === 'function') startQueueTicker();
// Antenne interrompue pendant son rituel : terminer après le chargement des modules
document.addEventListener('DOMContentLoaded', repairInterruptedAntenna);

// ⚡ V0.5 — Initialiser l'état du mode dev (cacher/afficher le bouton CHEAT)
if (typeof initDevMode === 'function') initDevMode();

// ⚡ V0.5 — Préchargement : seulement les fichiers qui existent vraiment
// (évite 5+ requêtes 404 au boot pour tiles/metal.png, tiles/cristal.png, etc.)
TILES.forEach(t => {
  if (AVAILABLE_TILE_ASSETS.has(t.img)) {
    const img = new Image();
    img.src = t.img;
  }
});
// Préload des skins contextuels (labo, centrale) — eux existent
Object.values(TILE_THEMES).forEach(theme => {
  Object.values(theme).forEach(url => {
    if (AVAILABLE_TILE_ASSETS.has(url)) {
      const img = new Image();
      img.src = url;
    }
  });
});

// D5.3 fix : cleanup modaux orphelins au démarrage (au cas où un cache navigateur
// rendrait un état foireux après reload).
if (typeof cleanupOrphanModals === 'function') cleanupOrphanModals();

// D5.3 fix #5 : cleanup des pistes expirées et résolues anciennes au boot.
if (typeof cleanupExpiredLeads === 'function') {
  const removed = cleanupExpiredLeads();
  if (removed > 0) console.log(`[D5.3] ${removed} piste${removed > 1 ? 's' : ''} nettoyée${removed > 1 ? 's' : ''}`);
}

// Comptoir d'échange (18/05) : init la saison de marché au boot (ou récupère l'existante)
if (typeof getCurrentMarketSeason === 'function') getCurrentMarketSeason();

// 19/05 : vérifier l'état de l'onboarding au démarrage
if (typeof checkOnboardingProgress === 'function') checkOnboardingProgress();

renderDashboard();

// ⚡ V0.5 — Si le joueur n'a pas encore d'identité, afficher l'écran de bienvenue
// avant le dashboard. Ne s'affiche qu'une seule fois (puis sauvegardé).
if (typeof hasPlayerProfile === 'function' && !hasPlayerProfile()) {
  goto('welcome');
  if (typeof setupWelcomeScreen === 'function') setupWelcomeScreen();
} else {
  goto('planet');   // UIUX V2 — monde d'abord : la planète est l'écran d'accueil
}

// Passe 3.3 : si des missions étaient en cours avant un refresh, redémarrer la boucle
if (G.fleet?.prepared?.some(f => (f.status || 'prepared') === 'in_mission')) {
  startMissionTimerLoop();
}

// D5.3 fix : démarrer le countdown ticker pour TOUTES les missions tanker (pas juste in_transit)
// Inclut 'exploring' (D5.3) et 'returning' (route_run) qui ont des timers.
if ((G.tankerMissions || []).some(m =>
  m.status === 'in_transit' || m.status === 'exploring' || m.status === 'returning'
)) {
  if (typeof startTankerCountdownTicker === 'function') {
    startTankerCountdownTicker();
  }
}

// Passe 3.4 : migration des flottes existantes (initialiser les héros si absents)
for (const f of (G.fleet?.prepared || [])) {
  if (!f.heroes) {
    f.heroes = { tanker: null, fregate: null, cuirasse: null };
    ensureFleetHeroes(f);
  }
}

// ═══════════════════════════════════════════════════════════════
// FIX CRITIQUE (session 13 mai 2026) — démarrage du passive loop
// ═══════════════════════════════════════════════════════════════
// startPassiveLoop n'était appelé QUE depuis cheatLevelUp, donc le tick
// de retour des tankers et sondes ne tournait pas après un rechargement
// de la page. Résultat : tankers bloqués sur "retour 0s", missions Moyenne
// jamais résolues, etc.
//
// Cette ligne démarre le passive loop dès le chargement du script — ce qui
// fait tourner :
//   - production passive de ressources
//   - tickProbes (retour des sondes)
//   - tickTankerMissions (retour des tankers)
//   - tirages ambient
if (typeof startPassiveLoop === 'function') {
  startPassiveLoop();
}

// FIX : déclencher un tick immédiat des sondes ET tankers au chargement
// (sans attendre 10s). Évite que le joueur voit "retour 0s" perché.
if (typeof tickProbes === 'function') tickProbes();
if (typeof tickTankerMissions === 'function') tickTankerMissions();

// ═══════════════════════════════════════════════════════════════
// CLEANUP — Cibles engagées orphelines (mission disparue)
// ═══════════════════════════════════════════════════════════════
// Cas de désynchronisation : si une cible est marquée 'engaged' mais
// que sa mission tanker n'existe plus dans G.tankerMissions, on libère
// la cible (sécurité contre les saves cassés).
if (G.knownTargets && Array.isArray(G.tankerMissions)) {
  const activeMissionIds = new Set(G.tankerMissions.map(m => m.id));
  for (const [coordKey, kt] of Object.entries(G.knownTargets)) {
    if (kt.status === 'engaged' && kt.tankerMissionId && !activeMissionIds.has(kt.tankerMissionId)) {
      // Mission disparue : libérer la cible
      kt.status = 'available';
      kt.tankerMissionId = null;
    }
  }
  if (typeof saveKnownTargets === 'function') saveKnownTargets();
}
