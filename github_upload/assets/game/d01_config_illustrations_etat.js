/* Starbyte — d01_config_illustrations_etat.js
   Données, variables et instructions exécutées au chargement (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


/* ═══════════ CONFIG ═══════════ */

// ⚡ Phase 3 — Économie rééquilibrée
// Values gardées à 1, mais diviseur global pour normaliser à ~80 par session
// (un match de 3 sur metal = 3 × 1 / SCORE_DIV = 0.6 → cumulé devient sensé)
const SCORE_DIV = 5; // les gains sont divisés par 5 à la comptabilisation
const TILES = [
  // ⚡ V0.5 fix lisibilité + couleur :
  // - Les symboles Unicode (◆ ★ ●) peuvent être rendus en EMOJI couleur natif par les navigateurs,
  //   ignorant complètement notre `color:` CSS. Le suffixe \uFE0E (Variation Selector-15)
  //   FORCE le rendu texte (monochrome), notre couleur CSS est alors appliquée.
  // - Symboles distincts pour Énergie (◈) et Cristal (◆) afin de les différencier visuellement.
  { key:'metal',    label:'Métal',    color:'#ff8848', img:'tiles/metal.png',    emoji:'\u25B2\uFE0E', weight:28, value:1 }, // ▲
  { key:'energie',  label:'Énergie',  color:'#ffaf3a', img:'tiles/energie.png',  emoji:'\u25C8\uFE0E', weight:24, value:1 }, // ◈
  { key:'cristal',  label:'Cristal',  color:'#5fffe8', img:'tiles/cristal.png',  emoji:'\u25C6\uFE0E', weight:20, value:1 }, // ◆
  { key:'biomass',  label:'Biomasse', color:'#7ed080', img:'tiles/biomass.png',  emoji:'\u25CF\uFE0E', weight:18, value:1 }, // ●
  { key:'artefact', label:'Artefact', color:'#a370ff', img:'tiles/artefact.png', emoji:'\u2605\uFE0E', weight:0,  value:2 }, // ★
];
const TILE_W_TOTAL = TILES.reduce((s,t) => s + t.weight, 0);

/* ═══════════════════════════════════════════════════════════════
   Phase 6 (19/05/2026) — Skins contextuels des tuiles match-3
   ═══════════════════════════════════════════════════════════════
   Le moteur reste universel (5 ressources + megastone/megahide).
   Seuls les VISUELS changent selon le bâtiment d'origine du match-3.
   
   Pour ajouter un nouveau thème (centrale, caserne…) : ajouter
   une entrée dans TILE_THEMES. Aucun autre code à toucher.
   
   ⚠️ v1.2 TODO :
     - Fragment archive → Données navigation (vs Biomasse actuellement)
     - Matrice quantique → Matrices quantiques (vs obstacle actuellement)
   ═══════════════════════════════════════════════════════════════ */
const TILE_THEMES = {
  // Bâtiment Laboratoire — kind:'match3', family:'Recherche'
  Recherche: {
    metal:     'tiles/laboratoire/lentilledobservation.png',  // tuile de base
    energie:   'tiles/laboratoire/noeudanalytique.png',       // connexions énergétiques
    cristal:   'tiles/laboratoire/cristaldedonnees.png',      // évident
    biomass:   'tiles/laboratoire/fragmentarchive.png',       // mémoire vivante (v1.2 → Données nav)
    artefact:  'tiles/laboratoire/singularitecalcul.png',     // rare, violette
    megastone: 'tiles/laboratoire/matricequantique.png',      // obstacle dense (v1.2 → Matrices quantiques)
    // megahide: pas de skin labo en v1.1 → garde le visuel par défaut
  },
  // Bâtiment Centrale énergétique — kind:'match3', family:'Énergie'
  'Énergie': {
    metal:     'tiles/energie/minireacteur.png',     // boîtier blindé, base
    energie:   'tiles/energie/bobineelectrique.png', // ressort = courant
    cristal:   'tiles/energie/condensateur.png',     // cylindre cristallin
    biomass:   'tiles/energie/arcenergetique.png',   // décharge libérée
    artefact:  'tiles/energie/noyau_plasma.png',     // sphère rare, précieuse
    megastone: 'tiles/energie/cellulethermique.png', // rouge danger, à briser
    // megahide: visuel par défaut en v1.1
  },
};

// ⚡ V0.5 — Liste blanche des assets PNG réellement disponibles.
// Évite de tenter de charger des fichiers manquants (zéro 404 = pas de lag).
// Quand on ajoute des PNG dans tiles/, il faut les ajouter ici aussi.
const AVAILABLE_TILE_ASSETS = new Set([
  // Ressources de base (5) — uploadés 21/05
  'tiles/metal.png',
  'tiles/energie.png',
  'tiles/cristal.png',
  'tiles/biomass.png',
  'tiles/artefact.png',
  // Obstacles (2) — uploadés 21/05
  'tiles/megastone.png',
  'tiles/megahide.png',
  // Bombes (4) — uploadées 21/05
  'tiles/bombepetite.png',
  'tiles/bombegrande.png',
  'tiles/bombemega.png',
  'tiles/bombehyper.png',
  // Skins Labo (Recherche)
  'tiles/laboratoire/lentilledobservation.png',
  'tiles/laboratoire/noeudanalytique.png',
  'tiles/laboratoire/cristaldedonnees.png',
  'tiles/laboratoire/fragmentarchive.png',
  'tiles/laboratoire/singularitecalcul.png',
  'tiles/laboratoire/matricequantique.png',
  // Skins Centrale (Énergie)
  'tiles/energie/minireacteur.png',
  'tiles/energie/bobineelectrique.png',
  'tiles/energie/condensateur.png',
  'tiles/energie/arcenergetique.png',
  'tiles/energie/noyau_plasma.png',
  'tiles/energie/cellulethermique.png',
]);
const M3_COLS = 7, M3_ROWS = 9, M3_MOVES = 20;
const M3_GOALS = { metal: 80, energie: 40 };

/* ═══════════════════════════════════════════════════════════════
   Phase 6 — Match-3 par bâtiment : système d'OBJECTIFS configurables
   ═══════════════════════════════════════════════════════════════
   Chaque bâtiment a son propre objectif de session :
     - mode 'explosions' : barre qui monte à chaque explosion
                          (création de bombe = 0, déclenchement = +1,
                           en cascade = +2)
     - target            : nombre d'explosions pour remplir à 100%
     - rewardRes         : ressource attribuée à la fin
     - rewardAmount      : qty max si barre pleine (proportionnel sinon)
     - fullBonus         : multiplicateur appliqué au reward si 100%
     - skillPool         : skills possibles à drop via megahide
     - label, emoji      : pour l'affichage HUD
   
   Pour ajouter un bâtiment match-3 : nouvelle entrée dans M3_OBJECTIVES
   indexée par 'context'. Aucun autre code à toucher.
   ═══════════════════════════════════════════════════════════════ */

// Pools de skills par bâtiment (v1.1 — simples, à enrichir)
const M3_SKILLS_LAB = [
  { id: 'cristallographie',    label: 'Cristallographie',     desc: '+5% production cristal',   bonus: { res: 'cristal',  pct: 0.05 } },
  { id: 'analyse_terrain',     label: 'Analyse de terrain',   desc: '+5% production énergie',   bonus: { res: 'energie',  pct: 0.05 } },
  { id: 'memoire_plateau',     label: 'Mémoire de plateau',   desc: '+5% production métal',     bonus: { res: 'metal',    pct: 0.05 } },
  { id: 'synthese_matrices',   label: 'Synthèse de matrices', desc: '+5% production biomasse', bonus: { res: 'biomass',  pct: 0.05 } },
];
const M3_SKILLS_ENERGY = [
  { id: 'cellules_solaires',   label: 'Cellules solaires',    desc: '+10% production énergie',          bonus: { res: 'energie', pct: 0.10 } },
  { id: 'supraconducteurs',    label: 'Supraconducteurs',     desc: '-10% consommation énergie',        bonus: { res: 'energie', pct: 0.10, type: 'cost' } },
  { id: 'reseau_distribution', label: 'Réseau distribution',  desc: '+5% production toutes ressources', bonus: { res: 'all',     pct: 0.05 } },
  { id: 'fission_controlee',   label: 'Fission contrôlée',    desc: '+15% production énergie',          bonus: { res: 'energie', pct: 0.15 } },
];

const M3_OBJECTIVES = {
  Recherche: { mode: 'explosions', target: 100, rewardRes: 'cristal', rewardAmount: 100, fullBonus: 0.5,
               skillPool: M3_SKILLS_LAB,    label: 'cascade analytique',    accent: '#a370ff', accentFull: '#5fffa8',
               goalText: 'détoner un maximum de bombes' },
  'Énergie': { mode: 'explosions', target: 120, rewardRes: 'energie', rewardAmount: 100, fullBonus: 0.5,
               skillPool: M3_SKILLS_ENERGY, label: 'cascade énergétique',   accent: '#ffaf3a', accentFull: '#ffe88c',
               goalText: 'libérer un maximum d\'énergie' },
};

// ⚡ Phase 2.15 — Précharge les images PNG des tiles + bombes au boot du jeu
// Évite le spike de 17 secondes au premier render (décode synchrone des PNG par Safari)
// ⚡ V0.5 fix critique : on filtre via AVAILABLE_TILE_ASSETS pour éviter 11 × 404 au boot.
(function preloadM3Images() {
  const candidateUrls = [
    'tiles/metal.png', 'tiles/energie.png', 'tiles/cristal.png',
    'tiles/biomass.png', 'tiles/artefact.png',
    'tiles/bombepetite.png', 'tiles/bombegrande.png',
    'tiles/bombemega.png', 'tiles/bombehyper.png',
    'tiles/megastone.png', 'tiles/megahide.png', // Phase 3 obstacles
    // Phase 6 — Skin labo (Recherche)
    'tiles/laboratoire/lentilledobservation.png',
    'tiles/laboratoire/noeudanalytique.png',
    'tiles/laboratoire/cristaldedonnees.png',
    'tiles/laboratoire/fragmentarchive.png',
    'tiles/laboratoire/singularitecalcul.png',
    'tiles/laboratoire/matricequantique.png',
    // Phase 6 — Skin centrale (Énergie)
    'tiles/energie/minireacteur.png',
    'tiles/energie/bobineelectrique.png',
    'tiles/energie/condensateur.png',
    'tiles/energie/arcenergetique.png',
    'tiles/energie/noyau_plasma.png',
    'tiles/energie/cellulethermique.png',
  ];
  // Filtre via la whitelist : on ne précharge que les fichiers qui existent réellement.
  // AVAILABLE_TILE_ASSETS est défini plus haut (vers ligne 5925).
  const urls = candidateUrls.filter(u =>
    typeof AVAILABLE_TILE_ASSETS !== 'undefined' && AVAILABLE_TILE_ASSETS.has(u)
  );
  urls.forEach(url => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    // Pas d'ajout au DOM, juste cache en mémoire
  });
})();

// ⚡ V0.5 — REFONTE : seulement 2 axes diagonaux pour les matches.
// L'axe horizontal E-W a été retiré car en pointy-top hex,
// les tiles "horizontalement alignées" forment un zigzag visuel ambigu.
// Maintenant : matches uniquement sur les 2 vraies diagonales (╱ et ╲).
// Bénéfices : pas de faux alignements visuels, mécaniques 100% hex pures,
// chaque match est exactement ce que le joueur voit.
const HEX_AXES = [
  { dx:  1, dy: -1, dz:  0, name: 'NE-SW' }, // diagonale ╱
  { dx:  0, dy:  1, dz: -1, name: 'NW-SE' }, // diagonale ╲
];

const BUILDINGS = {
  mine:     { name:'Mine',         icon:'pickaxe', color:'var(--warm)',  family:'Extraction', cost:{metal:200},          prod:{metal:10},   prodLbl:'métal +10/h',   desc:'Extraction continue', kind:'match3' },
  centrale: { name:'Centrale',     icon:'zap', color:'var(--amber)', family:'Énergie',    cost:{metal:300},          prod:{energie:15}, prodLbl:'énergie +15/h', desc:'Énergie thermique',   kind:'match3' },
  labo:     { name:'Laboratoire',  icon:'⚗', color:'var(--cyan)',  family:'Recherche',  cost:{metal:400},          prod:{cristal:5},  prodLbl:'cristal +5/h',  desc:'Synthèse cristalline', kind:'match3' },
  caserne:  { name:'Caserne',      icon:'sword', color:'var(--red)',   family:'Militaire',  cost:{metal:500,energie:100}, prod:{},        prodLbl:'défense +200',  desc:'Mobilisation militaire', def:200, kind:'screen', screen:'barracks' },
  shipyard: { name:'Chantier',     icon:'rocket', color:'var(--blue)', family:'Naval',      cost:{metal:600,energie:150}, prod:{},        prodLbl:'+1 cale',       desc:'Construction de vaisseaux', kind:'screen', screen:'shipyard' },
  turret:   { name:'Bunker',       icon:'⬢', color:'var(--red)',   family:'Défense',    cost:{metal:800,energie:200}, prod:{},        prodLbl:'défense +1500',  desc:'Forteresse militaire — débloque tourelles et soldats lourds', def:1500, kind:'screen', screen:'turret' },
  // Passe Commerce Phase 1 — 16/05/2026
  // Comptoir : bâtiment local qui produit des Crédits galactiques (CG) en passif
  // et donne accès au hub Commerce global (où vivent les routes secrètes, le marché).
  // Production CG passive gérée séparément (G.credits, hors G.res).
  comptoir: { name:'Comptoir',     icon:'gem', color:'#ffc864',       family:'Commerce',   cost:{metal:500, energie:100}, prod:{credits:5}, prodLbl:'crédits +5/h', desc:'Maison de commerce', kind:'screen', screen:'commerce' },
  // ─── Silos (passe 2.4) — stockage par ressource ───
  silo_metal:    { name:'Silo Métal',    icon:'◓', color:'var(--warm)',   family:'Stockage', cost:{metal:800},                  prod:{},  prodLbl:'capacité métal +5k',    desc:'Stockage de métal', kind:'silo', silo:{ res:'metal',    cap:5000 } },
  silo_energie:  { name:'Silo Énergie',  icon:'◓', color:'var(--amber)',  family:'Stockage', cost:{metal:600,energie:200},      prod:{},  prodLbl:'capacité énergie +5k',  desc:'Stockage d\'énergie', kind:'silo', silo:{ res:'energie',  cap:5000 } },
  silo_cristal:  { name:'Silo Cristal',  icon:'◓', color:'var(--cyan)',   family:'Stockage', cost:{metal:1500,energie:400},     prod:{},  prodLbl:'capacité cristal +2k',  desc:'Stockage de cristal', kind:'silo', silo:{ res:'cristal',  cap:2000 } },
  silo_biomass:  { name:'Silo Biomasse', icon:'◓', color:'var(--green)',  family:'Stockage', cost:{metal:500,energie:200},      prod:{},  prodLbl:'capacité biomasse +5k', desc:'Stockage de biomasse', kind:'silo', silo:{ res:'biomass',  cap:5000 } },
  silo_fuel:     { name:'Silo Carburant', icon:'◓', color:'#7aaadc',      family:'Stockage', cost:{metal:800,energie:300},      prod:{},  prodLbl:'capacité carburant +3k', desc:'Réservoir de carburant', kind:'silo', silo:{ res:'fuel', cap:3000 } },   // 31/10 (Adrien)
  silo_artefact: { name:'Silo Artefact', icon:'◓', color:'#a370ff',       family:'Stockage', cost:{cristal:3000},               prod:{},  prodLbl:'capacité artefact +50', desc:'Coffre sécurisé d\'artefacts', kind:'silo', silo:{ res:'artefact', cap:50 } },
  // ─── Raffinerie (18/05) — produit du carburant pour tankers (commerce + exploration) ───
  // Consomme de l'énergie pour produire du carburant (3 énergie → 1 carburant).
  // Augmente aussi le plafond de stockage carburant à chaque tier (silos intégrés).
  raffinerie: { name:'Raffinerie',  icon:'droplet', color:'#7aaadc',     family:'Carburant',  cost:{metal:500,energie:300}, prod:{fuel:8},     prodLbl:'carburant +8/h',  desc:'Synthèse d\'hydrocarbures stellaires', kind:'match3' },
};

/* ═══════════════════════════════════════════════════════════════
   SYSTÈME DE TIERS — Source unique de vérité
   ═══════════════════════════════════════════════════════════════
   Chaque bâtiment peut être amélioré du Tier 1 au Tier 3.
   Formules : prod_T_N = prod_T1 × (4 ^ (N-1))
              cost_T_N = cost_T1 × (5 ^ (N-1))
              durée_T_N = 6min × (3 ^ (N-1))
   Les noms par tier reflètent l'évolution narrative du bâtiment.
   ═══════════════════════════════════════════════════════════════ */
const BUILDING_TIERS = {
  mine: {
    1: { name:'Mine basique',       prod:{metal:10},  cost:{metal:200},                          duration:0,    desc:'Extraction de surface' },
    2: { name:'Mine renforcée',     prod:{metal:40},  cost:{metal:1000, energie:200},            duration:2880,  desc:'Forage en profondeur' },
    3: { name:'Extracteur lourd',   prod:{metal:160}, cost:{metal:5000, energie:1000, cristal:200}, duration:10080, desc:'Foreuse industrielle' },
  },
  centrale: {
    1: { name:'Centrale de base',   prod:{energie:15},  cost:{metal:300},                        duration:0,    desc:'Génération thermique' },
    2: { name:'Centrale avancée',   prod:{energie:60},  cost:{metal:1500, energie:300},          duration:2880,  desc:'Plasma stabilisé' },
    3: { name:'Réacteur à fusion',  prod:{energie:240}, cost:{metal:7500, energie:1500, cristal:300}, duration:10080, desc:'Fusion nucléaire' },
  },
  labo: {
    1: { name:'Laboratoire',        prod:{cristal:5},  cost:{metal:400, energie:50},             duration:0,    desc:'Synthèse cristalline' },
    2: { name:'Centre de recherche',prod:{cristal:20}, cost:{metal:2000, energie:500},           duration:2880,  desc:'Études quantiques' },
    3: { name:'Institut Quantique', prod:{cristal:80}, cost:{metal:10000, energie:2500, cristal:500}, duration:10080, desc:'Conscience matérielle' },
  },
  caserne: {
    1: { name:'Caserne planétaire', def:200,  cost:{metal:500,  energie:100},                    duration:0,    desc:'Mobilisation militaire',   prodLbl:'défense +200' },
    2: { name:'Centre tactique',    def:800,  cost:{metal:2500, energie:500, cristal:100},        duration:2880,  desc:'Coordination des unités',   prodLbl:'défense +800' },
    3: { name:'Bunker souterrain',  def:3200, cost:{metal:12500,energie:2500,cristal:500},        duration:10080, desc:'Forteresse stratégique',   prodLbl:'défense +3200' },
  },
  shipyard: {
    1: { name:'Chantier orbital léger', cost:{metal:600,  energie:150},                  duration:0,    desc:'Sondes et frégates',     prodLbl:'1 cale',  slots:1 },
    2: { name:'Chantier renforcé',      cost:{metal:3000, energie:750, cristal:150},     duration:2880,  desc:'Cuirassés et tankers',   prodLbl:'1 cale +30% vitesse', slots:1 },
    3: { name:'Chantier naval lourd',   cost:{metal:15000,energie:3750,cristal:750},     duration:10080, desc:'Vaisseaux capitaux',     prodLbl:'2 cales', slots:2 },
  },
  turret: {
    1: { name:'Bunker souterrain', def:1500,  cost:{metal:800,  energie:200},                    duration:0,    desc:'Forteresse de base — débloque tourelles et soldats',         prodLbl:'défense +1500' },
    2: { name:'Bunker fortifié',   def:5000,  cost:{metal:4000, energie:1000, cristal:200},      duration:2880,  desc:'Cachette protectrice + tourelles lourdes',                    prodLbl:'défense +5000' },
    3: { name:'Bunker stratégique',def:20000, cost:{metal:20000,energie:5000,cristal:1500},      duration:10080, desc:'Champ de distorsion + cachette renforcée',                    prodLbl:'défense +20000' },
  },
  // Passe Commerce Phase 1 — 16/05/2026
  // Production CG passive (T1=5/h, T2=20/h, T3=80/h) — calculée séparément de G.res via tickCommerceProduction
  comptoir: {
    1: { name:'Comptoir',           prod:{credits:5},   cost:{metal:500,  energie:100},               duration:0,    desc:'Maison de commerce locale',     prodLbl:'crédits +5/h' },
    2: { name:'Maison de commerce', prod:{credits:20},  cost:{metal:2500, energie:500,  cristal:100}, duration:2880,  desc:'Comptoir étendu, agents marchands', prodLbl:'crédits +20/h' },
    3: { name:'Bourse locale',      prod:{credits:80},  cost:{metal:12500,energie:2500, cristal:500}, duration:10080, desc:'Place de marché planétaire',     prodLbl:'crédits +80/h' },
  },
  // ─── Silos ─── (capacité × 4 par tier, coût × 5 par tier)
  silo_metal: {
    1: { name:'Silo Métal',          siloCap:5000,   cost:{metal:800},                            duration:0,    desc:'Stockage de surface' },
    2: { name:'Dépôt renforcé Métal',siloCap:20000,  cost:{metal:4000, energie:800},              duration:2880,  desc:'Cuves sous-pression' },
    3: { name:'Silo orbital Métal',  siloCap:100000, cost:{metal:20000, energie:5000, cristal:1500}, duration:10080, desc:'Réserve interplanétaire' },
  },
  silo_energie: {
    1: { name:'Silo Énergie',          siloCap:5000,   cost:{metal:600, energie:200},               duration:0,    desc:'Cellules tampon' },
    2: { name:'Dépôt renforcé Énergie',siloCap:20000,  cost:{metal:3000, energie:1500},             duration:2880,  desc:'Batteries quantiques' },
    3: { name:'Silo orbital Énergie',  siloCap:100000, cost:{metal:15000, energie:5000, cristal:1500}, duration:10080, desc:'Champ de stockage plasma' },
  },
  silo_cristal: {
    1: { name:'Silo Cristal',           siloCap:2000,  cost:{metal:1500, energie:400},              duration:0,    desc:'Vault cristallin' },
    2: { name:'Dépôt renforcé Cristal', siloCap:10000, cost:{metal:7500, energie:2000, cristal:500},duration:2880,  desc:'Coffre quantique' },
    3: { name:'Silo orbital Cristal',   siloCap:50000, cost:{metal:35000, energie:10000, cristal:5000}, duration:10080, desc:'Sanctuaire de mémoire' },
  },
  silo_biomass: {
    1: { name:'Silo Biomasse',           siloCap:5000,   cost:{metal:500, energie:200},              duration:0,    desc:'Réservoir organique' },
    2: { name:'Dépôt renforcé Biomasse', siloCap:20000,  cost:{metal:2500, energie:1500},            duration:2880,  desc:'Bio-cuves stabilisées' },
    3: { name:'Silo orbital Biomasse',   siloCap:100000, cost:{metal:12000, energie:4500, cristal:1000}, duration:10080, desc:'Sphère vivante' },
  },
  silo_fuel: {   // 31/10 (Adrien) : « on n'a pas de silo à carburant »
    1: { name:'Silo Carburant',            siloCap:3000,  cost:{metal:800, energie:300},               duration:0,     desc:'Cuves pressurisées' },
    2: { name:'Réservoir renforcé',        siloCap:12000, cost:{metal:4000, energie:1500},             duration:2880,  desc:'Cuves cryogéniques' },
    3: { name:'Dépôt orbital de carburant',siloCap:50000, cost:{metal:18000, energie:6000, cristal:1200}, duration:10080, desc:'Anneau de stockage en orbite' },
  },
  silo_artefact: {
    1: { name:'Silo Artefact',          siloCap:50,   cost:{cristal:3000},                          duration:0,    desc:'Coffre blindé' },
    2: { name:'Vault scellé Artefact',  siloCap:200,  cost:{cristal:15000, artefact:5},             duration:2880,  desc:'Champ de stase' },
    3: { name:'Réliquaire orbital',     siloCap:1000, cost:{cristal:50000, artefact:20},            duration:10080, desc:'Catacombe spatiale' },
  },
  // ─── Raffinerie (18/05) — production carburant + capacité de stockage ───
  // Chaque tier : production accrue + augmente fuelMax planète (silos intégrés)
  // T1 :  8/h, cap +2000  (cap total devient 4000 si on part de 2000)
  // T2 : 32/h, cap +5000  (cap +5000 supplémentaire)
  // T3 :128/h, cap +20000 (raffinerie autonome)
  // Coût en énergie représente la "consommation" de fonctionnement (one-shot à la construction).
  raffinerie: {
    1: { name:'Raffinerie',              prod:{fuel:8},   cost:{metal:500,  energie:300},                duration:0,    desc:'Synthèse d\'hydrocarbures stellaires',  prodLbl:'carburant +8/h · cap +2k',  fuelCap:2000 },
    2: { name:'Raffinerie cryogénique',  prod:{fuel:32},  cost:{metal:2500, energie:1500},               duration:2880,  desc:'Hydrogène liquéfié, isotopes stables',   prodLbl:'carburant +32/h · cap +5k', fuelCap:5000 },
    3: { name:'Complexe de fusion-fuel', prod:{fuel:128}, cost:{metal:12500,energie:7500, cristal:500},  duration:10080, desc:'Réacteur de propulsion à plasma',        prodLbl:'carburant +128/h · cap +20k', fuelCap:20000 },
  },
  // PATCH_1910_CAPITAL — le Centre de commandement s'améliore comme un bâtiment : ça prend du temps et ça se voit sur la planète
  capital: {
    1: { name:'Centre de commandement', cost:{},                                       duration:0,     desc:'Hub stratégique' },
    2: { name:'Hub stratégique',         cost:{metal:2500, energie:800},                 duration:2880,  desc:'Logistique et production II' },
    3: { name:'Hub d\'empire',          cost:{metal:12000, energie:4000, cristal:1500}, duration:1440,  desc:'Vaisseau colonial' },   // PATCH_2010_COLONIE : saison de test 24 h (normal : 10080)
  },
};
const CAPITAL_META = { name:'Centre de commandement', icon:'⊕', color:'var(--cyan)' };

const TIER_MAX = 3;

// Voisines hexagonales de la parcelle 12 (capitale, row 2 col 2 — row pair)
// Pour pointy-top + offset rows impaires :
// row 1 (impaire) : col 1, 2 → idx 6, 7
// row 2 (paire)   : col 1, 3 → idx 11, 13
// row 3 (impaire) : col 1, 2 → idx 16, 17
const CAPITAL_NEIGHBORS = [6, 7, 11, 13, 16, 17];

const UNLOCK_AT = {
  // Au début, la capitale (12) + 6 voisines en rocky
  // Niveau planète 1 → débloque un anneau plus loin
  1: [1, 2, 5, 8, 10, 14, 15, 18],
  2: [0, 3, 4, 9, 19],
  3: [20, 21, 22, 23, 24],
};

const BTN_LABELS = {
  rocky:    { primary:'Exploiter',     ghost:'Détails' },
  resource: { primary:'Construire',    ghost:'Détails' },
  locked:   { primary:'Sonder',        ghost:null },
  depleted: { primary:'Recycler',      ghost:null },
  building: { primary:'Accélérer',     ghost:null },
  mine:     { primary:'Exploiter',     ghost:'Détail' },
  centrale: { primary:'Produire',      ghost:'Détail' },
  labo:     { primary:'Rechercher',    ghost:'Détail' },
  caserne:  { primary:'Mobiliser',     ghost:'Détail' },
  shipyard: { primary:'Chantier',      ghost:'Détail' },
  turret:   { primary:'Mobiliser',     ghost:'Détail' },
  capital:  { primary:'Ouvrir',        ghost:'Détails' },
  // Comptoir (commerce) — primary = ouvre marché, ghost = détail
  comptoir: { primary:'Ouvrir',        ghost:'Détail' },
  // ⚡ V0.5 feedback Adrien : Raffinerie — primary = ouvre marché, ghost = détail
  raffinerie: { primary:'Commerce',    ghost:'Détail' },
  // Silos — primary = ouvrir la fiche bâtiment (améliorer)
  silo_metal:    { primary:'Améliorer', ghost:'Détails' },
  silo_energie:  { primary:'Améliorer', ghost:'Détails' },
  silo_cristal:  { primary:'Améliorer', ghost:'Détails' },
  silo_biomass:  { primary:'Améliorer', ghost:'Détails' },
  silo_fuel:     { primary:'Améliorer', ghost:'Détails' },
  silo_artefact: { primary:'Améliorer', ghost:'Détails' },
};

/* ═══════════ ILLUSTRATIONS SVG (sci-fi sobres) ═══════════ */
// Style: traits fins, mono-couleur via currentColor, viewBox 0 0 64 64.
// Les bannières héro affichent ces SVG en 56×56.
const ILLUSTRATIONS = {
  // BÂTIMENTS
  capital: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="20" stroke-opacity="0.3"/>
    <path d="M32 14 L40 24 L40 38 L32 48 L24 38 L24 24 Z"/>
    <circle cx="32" cy="31" r="4"/>
    <line x1="32" y1="14" x2="32" y2="48" stroke-opacity="0.4"/>
    <line x1="24" y1="31" x2="40" y2="31" stroke-opacity="0.4"/>
  </svg>`,

  mine: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 48 L24 24 L40 24 L50 48 Z"/>
    <line x1="24" y1="24" x2="32" y2="14" />
    <line x1="40" y1="24" x2="32" y2="14" />
    <line x1="20 " y1="36" x2="44" y2="36" stroke-opacity="0.4"/>
    <circle cx="22" cy="42" r="1.5" fill="currentColor"/>
    <circle cx="32" cy="44" r="1.5" fill="currentColor"/>
    <circle cx="42" cy="42" r="1.5" fill="currentColor"/>
  </svg>`,

  centrale: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="20" y="22" width="24" height="28" rx="2"/>
    <line x1="20" y1="30" x2="44" y2="30" stroke-opacity="0.4"/>
    <line x1="20" y1="42" x2="44" y2="42" stroke-opacity="0.4"/>
    <path d="M28 14 L32 22 L36 14" stroke-opacity="0.7"/>
    <path d="M28 50 L32 58 L36 50" stroke-opacity="0.4"/>
    <circle cx="32" cy="36" r="3" fill="currentColor"/>
  </svg>`,

  labo: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M26 14 L26 28 L18 48 Q18 52 22 52 L42 52 Q46 52 46 48 L38 28 L38 14"/>
    <line x1="22" y1="14" x2="42" y2="14"/>
    <line x1="22" y1="40" x2="42" y2="40" stroke-opacity="0.4"/>
    <circle cx="28" cy="44" r="1.5" fill="currentColor"/>
    <circle cx="34" cy="46" r="1" fill="currentColor"/>
    <circle cx="32" cy="42" r="1" fill="currentColor"/>
  </svg>`,

  caserne: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 50 L14 24 L32 14 L50 24 L50 50 Z"/>
    <rect x="22" y="32" width="6" height="8"/>
    <rect x="36" y="32" width="6" height="8"/>
    <line x1="14" y1="50" x2="50" y2="50"/>
    <path d="M28 50 L28 42 L36 42 L36 50" />
    <line x1="32" y1="14" x2="32" y2="22" stroke-opacity="0.5"/>
    <path d="M28 18 L36 18" stroke-opacity="0.5"/>
  </svg>`,

  shipyard: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 38 L20 24 L44 24 L50 38" />
    <line x1="14" y1="38" x2="50" y2="38"/>
    <line x1="20" y1="38" x2="20" y2="48" stroke-opacity="0.4"/>
    <line x1="32" y1="38" x2="32" y2="50" stroke-opacity="0.4"/>
    <line x1="44" y1="38" x2="44" y2="48" stroke-opacity="0.4"/>
    <circle cx="32" cy="18" r="3"/>
    <line x1="29" y1="18" x2="20" y2="24" stroke-opacity="0.4"/>
    <line x1="35" y1="18" x2="44" y2="24" stroke-opacity="0.4"/>
  </svg>`,

  turret: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="32" cy="44" rx="16" ry="6"/>
    <path d="M22 44 L22 32 Q22 24 32 24 Q42 24 42 32 L42 44"/>
    <line x1="32" y1="14" x2="32" y2="24"/>
    <circle cx="32" cy="14" r="2" fill="currentColor"/>
    <line x1="32" y1="32" x2="50" y2="22" stroke-width="2"/>
    <circle cx="50" cy="22" r="2" fill="currentColor"/>
  </svg>`,

  // UNITÉS DÉFENSIVES
  garde: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 12 L42 18 L42 32 Q42 44 32 52 Q22 44 22 32 L22 18 Z"/>
    <path d="M28 28 L31 32 L38 24" stroke-width="2"/>
    <line x1="22" y1="22" x2="42" y2="22" stroke-opacity="0.4"/>
    <line x1="22" y1="40" x2="42" y2="40" stroke-opacity="0.4"/>
  </svg>`,

  lourd: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 22 L32 12 L50 22 L50 38 Q50 50 32 56 Q14 50 14 38 Z"/>
    <path d="M22 26 L22 38 L32 44 L42 38 L42 26"/>
    <circle cx="32" cy="32" r="4" fill="currentColor" fill-opacity="0.3"/>
    <line x1="14" y1="30" x2="22" y2="30" stroke-opacity="0.4"/>
    <line x1="42" y1="30" x2="50" y2="30" stroke-opacity="0.4"/>
  </svg>`,

  tourelle: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="32" cy="48" rx="14" ry="4"/>
    <rect x="24" y="30" width="16" height="18" rx="1"/>
    <circle cx="32" cy="30" r="6"/>
    <line x1="32" y1="24" x2="32" y2="14" stroke-width="2"/>
    <line x1="28" y1="14" x2="36" y2="14" stroke-width="2"/>
  </svg>`,

  // VAISSEAUX
  probe: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="32" cy="32" rx="10" ry="14"/>
    <circle cx="32" cy="26" r="4"/>
    <line x1="22" y1="32" x2="14" y2="32"/>
    <line x1="42" y1="32" x2="50" y2="32"/>
    <circle cx="14" cy="32" r="2" fill="currentColor"/>
    <circle cx="50" cy="32" r="2" fill="currentColor"/>
    <line x1="32" y1="46" x2="32" y2="54" stroke-opacity="0.4"/>
    <line x1="28" y1="50" x2="36" y2="50" stroke-opacity="0.4"/>
  </svg>`,

  fregate: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 32 L24 22 L48 22 L54 32 L48 42 L24 42 Z"/>
    <line x1="24" y1="22" x2="24" y2="42" stroke-opacity="0.5"/>
    <line x1="48" y1="22" x2="48" y2="42" stroke-opacity="0.5"/>
    <circle cx="36" cy="32" r="3" fill="currentColor" fill-opacity="0.3"/>
    <line x1="14" y1="32" x2="8" y2="28" stroke-opacity="0.4"/>
    <line x1="14" y1="32" x2="8" y2="36" stroke-opacity="0.4"/>
  </svg>`,

  tanker: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="24" width="36" height="16" rx="2"/>
    <line x1="14" y1="32" x2="50" y2="32" stroke-opacity="0.4"/>
    <line x1="22" y1="24" x2="22" y2="40" stroke-opacity="0.4"/>
    <line x1="32" y1="24" x2="32" y2="40" stroke-opacity="0.4"/>
    <line x1="42" y1="24" x2="42" y2="40" stroke-opacity="0.4"/>
    <line x1="50" y1="32" x2="56" y2="32"/>
    <circle cx="56" cy="32" r="2" fill="currentColor"/>
  </svg>`,
};

// Mapping vers les fichiers PNG (dans illustrations/)
// Si un PNG existe pour une clé, il a la priorité sur le SVG.
const PNG_ILLUSTRATIONS = {
  // ─── UNITÉS DÉFENSIVES ───
  garde:           'illustrations/soldat.png',
  lourd:           'illustrations/lourd.png',          // ⚡ NOUVEAU — différencié
  tourelle:        'illustrations/tourelle.png',
  tourelle_lourde: 'illustrations/tourelle_lourde.png', // futur tier 2

  // ─── VAISSEAUX ───
  // La sonde a 4 variantes selon le tier (v1.1-d : radar t0, légère t1, moyenne t2, furtive t3)
  probe:           'illustrations/sonde_t1.png',
  probe_t0:        'illustrations/sonde_t0.png',  // radar (sacrificielle)
  probe_t1:        'illustrations/sonde_t1.png',  // légère
  probe_t2:        'illustrations/sonde_t2.png',  // moyenne
  probe_t3:        'illustrations/sonde_t3.png',  // furtive
  // Alias par tier (utilisé par la fiche probe-detail v1.1-d)
  probe_radar:     'illustrations/sonde_t0.png',
  probe_light:     'illustrations/sonde_t1.png',
  probe_medium:    'illustrations/sonde_t2.png',
  probe_stealth:   'illustrations/sonde_t3.png',
  fregate:         'illustrations/fregate.png',
  tanker:          'illustrations/tanker.png',
  cuirasse:        'illustrations/cuirasse.png',
  colonial:        'illustrations/vaisseau_colonial.png',

  // ─── BÂTIMENTS (bannières des écrans intérieurs) ───
  mine:            'illustrations/mine.png',
  centrale:        'illustrations/centrale.png',
  labo:            'illustrations/labo.png',
  caserne:         'illustrations/caserne.png',
  shipyard:        'illustrations/chantier.png',
  turret_building: 'illustrations/tourelle_batiment.png',
  turret:          'illustrations/tourelle_batiment.png',  // alias pour Bunker (fiche bâtiment)
  capital:         'illustrations/capitale.png',
  prospect:        'illustrations/prospect.png',  // v1.1-d : Centre de Prospection
  // 19/05 — Bâtiments avec illustrations à générer (fallback SVG en attendant)
  comptoir:        'illustrations/comptoir.png',
  raffinerie:      'illustrations/raffinerie.png',
  silo_metal:      'illustrations/silo_metal.png',
  silo_energie:    'illustrations/silo_energie.png',
  silo_cristal:    'illustrations/silo_cristal.png',
  silo_biomass:    'illustrations/silo_biomass.png',
  silo_fuel:       'illustrations/silo_energie.png',
  silo_artefact:   'illustrations/silo_artefact.png',
  // Points de rencontre dans l'espace (docks, comptoirs francs)
  dock:            'illustrations/dock.png',
  marche:          'illustrations/marche.png',  // bannière Marché Commerce
  fleet:           'illustrations/fleet.png',   // bannière écran Flotte principal

  // ─── SCÈNES PLANÉTAIRES (fiche planète / rapports) ───
  planete_morte:   'illustrations/planete_morte.png',
  planete_gazeuse: 'illustrations/planete_gazeuse.png',
  planete_libre:   'illustrations/planete_libre.png',
  planete_joueur:  'illustrations/planete_joueur.png',

  // ─── CIBLES MOUVANTES (fiches de prospection — chunk D du 14/05) ───
  // Mapping vers PROBE_TARGET_CONFIG. Le préfixe 'target_' évite tout conflit
  // avec les clés existantes. 'cargo' n'a pas d'illustration dédiée → fallback emoji 📦.
  target_asteroides:     'illustrations/asteroids.png',
  target_cristal:        'illustrations/comet.png',
  target_epave:          'illustrations/epave.png',
  target_debris:         'illustrations/junk.png',
  target_anomalie:       'illustrations/oddmagnetic.png',
  target_sonde_ancienne: 'illustrations/ancientprobe.png',
  target_signal:         'illustrations/oddsignal.png',

  // ─── RESSOURCES (icônes match-3, polish 15/05) ───
  // Inlinées en base64 pour fiabilité (pas de gestion de chemin/asset path).
  // Style "tile match-3" — à utiliser pour les petites icônes dans les UI.
  // Pour les grandes fiches (160px+), on rendra des versions plus sobres plus tard.
  res_metal:    'data:image/png;base64,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',
  res_energie:  'data:image/png;base64,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',
  res_cristal:  'data:image/png;base64,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',
  res_biomass:  'data:image/png;base64,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',
  res_artefact: 'data:image/png;base64,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6acAODadrS0jiCCBkEFU6orJayR085JnJ3ZfFw6+3mvDufr4v31ikZBE91Q+qhERb8ph2SMcsBYqnRtpbdJKK54wvPyMXB8UeZLjgLRrrlFT5ZBiWXv+a38VH3O6PqCYqcGKD7TvNaDT0VZ1L0l2m6dt/wBvp9TUnXxuiZJpZJpDJK4vcepWPqvTwGc8FinkEYO/wPRnX29ypV3eRpe1UeW/ezXb5mQuAaSSABzceQ/FaVRPvEiMkNPMnmVjllfIe0eA5AcgsarlzdVLh+1w6GDkERFrGIREQBERAEREAREQBERAEREAREQBERAegkHIOCt6lqml3aIjfjifmu8+4+K0EXpSqzpSUoPDBPiQOO7jdeObSvuI9tQcM7mAMflzAc+I8ipGmq2Eds73Z5gcR5hWqw1yNRqNbc+vI9Yz37zM/j0C+QACsZqIORkx7E9PB+sH1LcldUW87a94yjO1ePGWkeCxipp/1o+pPhNPn9J/BZu6otYc17z7lGEBC4DhjJ93mkj2tBcTut7+p9i0Zpi/g0bre5V261BQezS3vqYPcbE1UGjEfaf/AGj08lpuJcck5JXiKGlKU3tSeWYt5CIixPgREQBERAEREAREQBERAEREAREQBERAEREAREQBeglpyCQfBeIgNiKsqowAyZwA5A8feshudd+v+yPwWmiA3Rda8f1/2G/gviS4Vkgw6b6mgfctVEB9SSPkOXvc7zK+URAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQH/2Q==',
};

/* ═══════════════════════════════════════════════════════════════
   LIBRAIRIE D'ICÔNES SVG — chunk 14/05 (décision Adrien : plus d'emojis)
   ═══════════════════════════════════════════════════════════════
   Bibliothèque centralisée pour remplacer les 231 emojis du code.
   Style cohérent : Lucide-inspired, strokes 1.7px, viewBox 24×24, currentColor.

   Usage dans templates dynamiques :
     icon('warning', { size: 14, color: 'var(--red)' })

   Usage dans HTML statique :
     <span class="icon-static" data-icon="warning"></span>
     → injecté au boot par hydrateStaticIcons()
   ═══════════════════════════════════════════════════════════════ */

const ICON_SVG = {
  // Navigation / UI
  check:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  cross:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warning:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  trash:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  settings:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  arrowUp:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  arrowDown:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  arrowLeft:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  arrowRight:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  chevronUp:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
  chevronDown:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  cornerArrow:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
  cornerReturn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`,
  plus:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  minus:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  refresh:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,

  // Tanker / transport
  tanker:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h13v-7H3v7z"/><path d="M16 11h3l2 3v3h-5"/><circle cx="6" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/><line x1="3" y1="13" x2="16" y2="13"/></svg>`,
  anchor:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`,
  package:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  cargo:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v13H3z"/><line x1="3" y1="11" x2="21" y2="11"/><line x1="8" y1="7" x2="8" y2="20"/><line x1="16" y1="7" x2="16" y2="20"/><path d="M7 7V4h10v3"/></svg>`,

  // Sondes / scan
  probe:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.5 2.5M16.5 16.5L19 19M5 19l2.5-2.5M16.5 7.5L19 5"/></svg>`,
  satellite:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l4 4-4 4-4-4 4-4z" transform="translate(4 4)"/><path d="M18 6l2-2M14 10l2-2"/><path d="M10 14a4 4 0 0 1 4 4M6 10a8 8 0 0 1 8 8"/></svg>`,
  radar:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" opacity="0.4"/><circle cx="12" cy="12" r="6" opacity="0.7"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="12" x2="20" y2="6"/></svg>`,
  search:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  microscope:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8M3 22h18M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2h-2zM12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></svg>`,
  scan:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
  signal:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2.5-2.5 6.5-2.5 9 0M5 15c2-2 4-2 6 0M8.5 18c1-1 2-1 3 0"/><circle cx="20" cy="6" r="1.5"/></svg>`,

  // Militaire
  sword:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>`,
  swords:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>`,
  shield:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  skull:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2M12.5 17l-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>`,
  helmet:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18v-5a8 8 0 0 1 16 0v5"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="2" y1="18" x2="2" y2="21"/><line x1="22" y1="18" x2="22" y2="21"/><line x1="12" y1="5" x2="12" y2="9"/></svg>`,

  // Ressources
  pickaxe:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-8 8M3 18l3 3M5 19l8-8M14 6c2-2 6-3 7-2-1 0-3 1-4 3"/><path d="M14 6c-2 2-3 6-2 7 0-1 1-3 3-4"/></svg>`,
  zap:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  gem:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 18 3 22 9 12 22 2 9"/><line x1="11" y1="3" x2="8" y2="9"/><line x1="13" y1="3" x2="16" y2="9"/><line x1="2" y1="9" x2="22" y2="9"/></svg>`,
  diamond:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 18 3 22 9 12 22 2 9"/></svg>`,

  // Rapports / docs
  fileText:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  scroll:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h0v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M9 11V6a2 2 0 0 0-2-2H5"/><line x1="13" y1="11" x2="17" y2="11"/><line x1="13" y1="15" x2="17" y2="15"/></svg>`,
  mail:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  map:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,

  // Météo cosmique
  weatherCalm:  `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`,
  weatherAlert: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`,
  weatherStorm: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l6 10h-4l2 6-6-10h4z"/></svg>`,

  // Reset / clean
  broom:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.36 2.72l1.42 1.42-5.72 5.71M16.95 4.13L4.13 16.95M11.66 11.66l.93.93M7.5 17.5l-1.06 1.06M19 14l-3 3a2 2 0 0 1-2.83 0l-1.41-1.41 5-5L18 12l1 2z"/></svg>`,
  moon:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  planetDead:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5 9c2 0 3 2 3 3M10 6c1 1 1 3 3 3M14 14c2 0 2 2 4 2"/></svg>`,

  // Divers
  rocket:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
  ship:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M20 12v-5l-9-3-9 3v5"/><path d="M11 5v17"/></svg>`,
  globe:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  bookmark:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  flag:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  pencil:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  clock:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  star:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  coin:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H9M9 14h5"/></svg>`,
};

// Hydrater au boot dès que possible
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateStaticIcons);
  } else {
    setTimeout(hydrateStaticIcons, 0);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CHECKLISTS DE LANCEMENT (passe 3.3 — décollage avec rituel)
   ═══════════════════════════════════════════════════════════════
   Chaque action militaire majeure déclenche une checklist de 2s qui
   donne le sentiment "j'ai piloté une opération militaire".
   Ton adapté selon l'action (Q1 = mélange) :
   - Bouton 1 : aéronautique/marine (quitter le sol)
   - Bouton 2 : spatial (projection inter-planétaire)
   - Bouton 3 : militaire/nucléaire (armement final, irréversible)
   ═══════════════════════════════════════════════════════════════ */

// Listes de steps par niveau crescendo (Q3 = appliquer aux 3)
const LAUNCH_SEQUENCES = {
  // Niveau 1 — Déployer en orbite : ton aéronautique/marine
  deploy: {
    title: 'Procédure de décollage',
    level: 1,
    steps: [
      'Plein de carburant',
      'Flaps déployés',
      'Tour de contrôle : autorisation',
    ],
  },
  // Niveau 2 — Envoyer en mission : ton spatial
  mission: {
    title: 'Préparation de mission',
    level: 2,
    steps: [
      'Recharge des réacteurs',
      'Sas pressurisés',
      'Navigation verrouillée sur cible',
      'Équipages aux postes',
    ],
  },
  // Niveau 3 — Lancer la mission : ton militaire/nucléaire (montant en intensité)
  launch: {
    title: 'Séquence d\'engagement',
    level: 3,
    steps: [
      'Vecteur de tir calculé',
      'Armement principal en ligne',
      'Boucliers offensifs chargés',
      'Verrouillage cible confirmé',
      'Lancement autorisé',
    ],
  },
  // ── Actions rituelles transverses (cf. GDD 11_design_patterns.md) ──
  // Niveau 1 — Lancer une sonde : ton exploratoire/scientifique
  probe: {
    title: 'Lancement de sonde',
    level: 1,
    steps: [
      'Trajectoire de retour calculée',
      'Capteurs longue portée activés',
      'Mission d\'exploration ouverte',
    ],
  },
  // Niveau 2 — Dissoudre une flotte : ton démantèlement
  dissolve: {
    title: 'Démantèlement de flotte',
    level: 2,
    steps: [
      'Désembarquement des soldats',
      'Retour des vaisseaux au hangar',
      'Personnel libéré',
      'Codes de commandement révoqués',
    ],
  },
  // Niveau 2 — Recycler un bâtiment : ton génie civil
  recycle: {
    title: 'Démolition contrôlée',
    level: 2,
    steps: [
      'Évacuation du personnel',
      'Récupération des matériaux',
      'Site neutralisé',
      'Parcelle libérée',
    ],
  },
};

/* ═══════════ HEX MAP ═══════════ */
const COLS = 5, ROWS = 5;
const SIZE = 32;
const W = Math.sqrt(3) * SIZE;
const HSTEP = W;
const VSTEP = 1.5 * SIZE;

const ST = {
  rocky:    { fill:'url(#gRocky)',    stroke:'#3a1a18', sw:1,    label:'TERRAIN VIERGE',      badge:'#8a3a30' },
  resource: { fill:'url(#gResource)', stroke:'#7a4818', sw:1.2,  label:'GISEMENT DÉTECTÉ',    badge:'#ffa040', sparkle:true },
  mine:     { fill:'url(#gMine)',     stroke:'#a05028', sw:1.4,  label:'MINE',                badge:'#ff8848' },
  centrale: { fill:'url(#gCentrale)', stroke:'#a07820', sw:1.4,  label:'CENTRALE',            badge:'#ffc060' },
  labo:     { fill:'url(#gLab)',      stroke:'#1a7888', sw:1.4,  label:'LABORATOIRE',         badge:'#5fffe8' },
  caserne:  { fill:'url(#gCaserne)',  stroke:'#883830', sw:1.4,  label:'CASERNE',             badge:'#ff5040' },
  shipyard: { fill:'url(#gDefense)',  stroke:'#1a4888', sw:1.4,  label:'CHANTIER',            badge:'#5098ff' },
  turret:   { fill:'url(#gCaserne)',  stroke:'#883830', sw:1.6,  label:'BUNKER',              badge:'#ff5040' },
  comptoir: { fill:'url(#gCommerce)',  stroke:'#a07820', sw:1.4,  label:'COMPTOIR',            badge:'#ffc864' },
  raffinerie: { fill:'url(#gDefense)', stroke:'#5098ff', sw:1.4,  label:'RAFFINERIE',          badge:'#7aaadc' },
  capital:  { fill:'url(#gCapital)',  stroke:'#5fffe8', sw:1.8,  label:'CAPITALE',            badge:'#5fffe8' },
  building: { fill:'url(#gBuild)',    stroke:'#a07820', sw:1.2,  label:'EN CONSTRUCTION',     badge:'#ffc060', dash:'3,2' },
  locked:   { fill:'#070908',         stroke:'#1a201d', sw:1,    label:'INCONNU',             badge:'#3a4a40', dash:'2,3' },
  depleted: { fill:'url(#gRocky)',    stroke:'#2a1a18', sw:1,    label:'ÉPUISÉE',             badge:'#5a2a28', dim:true },
  // ─── Silos (passe 2.4) — chaque silo réutilise le gradient de sa famille ───
  silo_metal:    { fill:'url(#gMine)',     stroke:'#a05028', sw:1.4, label:'SILO MÉTAL',    badge:'#ff8848' },
  silo_energie:  { fill:'url(#gCentrale)', stroke:'#a07820', sw:1.4, label:'SILO ÉNERGIE',  badge:'#ffc060' },
  silo_cristal:  { fill:'url(#gLab)',      stroke:'#1a7888', sw:1.4, label:'SILO CRISTAL',  badge:'#5fffe8' },
  silo_biomass:  { fill:'url(#gMine)',     stroke:'#3a7820', sw:1.4, label:'SILO BIOMASSE', badge:'#7ed080' },
  silo_fuel:     { fill:'url(#gMine)',     stroke:'#3a6a90', sw:1.4, label:'SILO CARBURANT', badge:'#7aaadc' },
  silo_artefact: { fill:'url(#gCentrale)', stroke:'#a370ff', sw:1.4, label:'SILO ARTEFACT', badge:'#a370ff' },
};

// Forme d'œuf SVG pour les silos — ellipse verticale légèrement plus large en bas
const SILO_EGG_SHAPE = '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M0,-7 C-4.5,-7 -5.5,-2 -5.5,1 C-5.5,5 -2.5,7 0,7 C2.5,7 5.5,5 5.5,1 C5.5,-2 4.5,-7 0,-7 Z"/><line x1="-3" y1="2" x2="3" y2="2" stroke-width="1.2" opacity=".6"/><line x1="-3.5" y1="4" x2="3.5" y2="4" stroke-width="1.2" opacity=".6"/></g>';

const ICON = {
  mine:     '<g><path d="M-7,-2 L7,-2 M-7,2 L7,2 M-5,-6 L-5,6 M0,-6 L0,6 M5,-6 L5,6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>',
  centrale: '<path d="M2,-8 L-4,1 L0,1 L-2,8 L4,-1 L0,-1 Z" fill="currentColor"/>',
  labo:     '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M-3,-7 L-3,-2 L-7,5 Q-7,7 -5,7 L5,7 Q7,7 7,5 L3,-2 L3,-7 Z"/><path d="M-3,-7 L3,-7"/><circle cx="-2" cy="3" r="1" fill="currentColor"/><circle cx="2" cy="5" r="0.8" fill="currentColor"/></g>',
  caserne:  '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M-6,-4 L0,-7 L6,-4"/><path d="M-6,0 L0,-3 L6,0"/><path d="M-6,4 L0,1 L6,4"/></g>',
  shipyard: '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M-7,2 L0,-7 L7,2 L0,5 Z"/><circle cx="0" cy="-1" r="1.5" fill="currentColor"/></g>',
  turret:   '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M-7,5 L-5,-5 L5,-5 L7,5 Z"/><rect x="-2.5" y="-3" width="5" height="3" rx="0.5" fill="currentColor"/><line x1="-7" y1="5" x2="7" y2="5" stroke-width="2"/></g>',
  // Comptoir : balance commerciale (fléau horizontal + 2 plateaux suspendus + pied central)
  comptoir: '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="-7" y1="-4" x2="7" y2="-4"/><line x1="0" y1="-4" x2="0" y2="5"/><circle cx="0" cy="6" r="1.4" fill="currentColor" stroke="none"/><path d="M-7,-4 L-9,1 L-5,1 Z"/><path d="M7,-4 L5,1 L9,1 Z"/></g>',
  // Raffinerie : goutte de carburant stylisée + tuyaux (19/05)
  raffinerie: '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M0,-7 C-3,-3 -4,0 -4,2 C-4,5 -2,6 0,6 C2,6 4,5 4,2 C4,0 3,-3 0,-7 Z" fill="currentColor" opacity="0.25"/><path d="M0,-7 C-3,-3 -4,0 -4,2 C-4,5 -2,6 0,6 C2,6 4,5 4,2 C4,0 3,-3 0,-7 Z"/><line x1="-6" y1="4" x2="-4" y2="4"/><line x1="4" y1="4" x2="6" y2="4"/></g>',
  capital:  '<g><circle r="3" fill="currentColor"/><circle r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M0,-9 L0,-7 M0,9 L0,7 M-9,0 L-7,0 M9,0 L7,0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></g>',
  building: '<g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M-6,-4 L6,-4 L6,6 L-6,6 Z" stroke-dasharray="3,2"/><path d="M-6,-4 L0,-8 L6,-4"/></g>',
  locked:   '<g fill="none" stroke="currentColor" stroke-width="1.5"><rect x="-4" y="-1" width="8" height="6" rx="1"/><path d="M-2.5,-1 L-2.5,-3 Q-2.5,-6 0,-6 Q2.5,-6 2.5,-3 L2.5,-1"/></g>',
  depleted: '<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".75"><path d="M-5,-5 L5,5"/><path d="M5,-5 L-5,5"/></g>',
  resource: '<g stroke="currentColor" stroke-width="1.5" fill="none"><path d="M-5,3 L0,-6 L5,3 Z"/><path d="M-3,3 L0,-2 L3,3" opacity=".6"/></g>',
  // ─── Silos (passe 2.4) — tous utilisent la forme d'œuf, la couleur badge diffère ───
  silo_metal:    SILO_EGG_SHAPE,
  silo_energie:  SILO_EGG_SHAPE,
  silo_cristal:  SILO_EGG_SHAPE,
  silo_biomass:  SILO_EGG_SHAPE,
  silo_fuel:     SILO_EGG_SHAPE,
  silo_artefact: SILO_EGG_SHAPE,
};

/* ═══════════ STATE ═══════════ */

// Configuration du gisement re-minable
const REMINE_STONES   = [4, 8, 16, 24, 36];   // pierres au plateau selon # re-mines
const REMINE_BONUS    = [1.5, 2, 2.5, 3, 3.5]; // multiplicateur de gain
const REMINE_MAX      = 5;

// Retourne les 3 spots planète (entiers 1-99) d'un système, déterministe.
// Deux appels avec les mêmes coords retournent toujours les mêmes 3 slots.
// Cache léger pour éviter de recalculer en boucle.
const _planetSlotsCache = {};

// ═══════════════════════════════════════════════════════════════
// COMPOSITION ÉTENDUE DES SYSTÈMES (passe 5.5)
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/15_cosmographie.md addendum v1.1
// Cf. décision verrouillée #12
//
// Sur les 99 slots d'un système :
//   3 slots HABITABLES     → getPlanetSlotsInSystem (joueurs potentiels)
//   5-7 slots NON-HABITABLES → getNonHabitableSlotsInSystem (mondes morts, gazeuses, lunes)
//   ~86 spots vides         → univers mouvant possible
//
// Pourquoi distinguer ?
//   - Joueurs ne peuvent coloniser QUE les habitables
//   - Mondes morts → dépôts militaires, mines orbitales
//   - Géantes gazeuses → récolte gaz (lategame)
//
// Cohérent inter-joueurs grâce au seed déterministe.

const _nonHabSlotsCache = {};

const MY_ADDRESS = generateMyAddress();
// Format affiché : W-X-YYYY-Z avec Z zéro-paddé sur 2 chiffres
const MY_COORD_STRING = `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${MY_ADDRESS.system}-${String(MY_ADDRESS.planet).padStart(2, '0')}`;

// Sonde unique avec stats améliorables
const PROBE_LEVELS = {
  range:    { values: [2, 10, 50, 250, 1500], labels: ['2 systèmes', '10 systèmes', '50 systèmes', '250 systèmes', 'Illimitée'] },
  stealth:  { values: [10, 30, 50, 75, 95], labels: ['10% esquive', '30% esquive', '50% esquive', '75% esquive', '95% esquive'] },
  speed:    { values: [1, 1.3, 1.6, 2, 3], labels: ['Standard', '+30% vitesse', '+60% vitesse', '×2 vitesse', '×3 vitesse'] },
  memory:   { values: [3, 5, 8, 12, 20], labels: ['3 planètes', '5 planètes', '8 planètes', '12 planètes', '20 planètes'] },
};

const PROBE_UPGRADE_COSTS = {
  // Coût pour passer du niveau N (index 0..3) au niveau N+1
  range:   [{ cristal:300 }, { cristal:800,  energie:200 }, { cristal:2000, energie:600 }, { cristal:6000, artefact:2 }],
  stealth: [{ cristal:200 }, { cristal:500,  energie:150 }, { cristal:1500, energie:400 }, { cristal:4000, artefact:1 }],
  speed:   [{ cristal:250 }, { cristal:600,  energie:200 }, { cristal:1800, energie:500 }, { cristal:5000, artefact:1 }],
  memory:  [{ cristal:200 }, { cristal:500,  energie:100 }, { cristal:1500, energie:300 }, { cristal:3500, artefact:1 }],
};

// Définition des unités défensives (recrutables)
// NOTE PASSE 2.4 : les soldats ont maintenant aussi atkPerUnit + transportable=true.
// Ils peuvent être embarqués dans des Tankers pour des missions offensives (planque sur planète neutre,
// renfort de flotte, raid expéditionnaire). La mécanique d'embarquement sera implémentée en passe 3.0.
// Les tourelles restent fixes (transportable=false, atk=0) — défense automatisée au sol.
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
    ration: 1,           // PATCH_2210_VIVRES — biomasse mangée par jour
    cost: { metal: 100 },
    repairCost: { metal: 30 }, // par unité endommagée
    scrapReturn: { metal: 30 }, // récupéré à la casse
    duration: 120, // ⚡ V0.5 : 2 min par garde (rythme moyen, ancien : 6s proto)
    requires: 'caserne',
    desc: 'Unité d\'infanterie de base. Robuste, peu coûteuse. Embarquable (80 fret/u). Mange 1 biomasse par jour.',
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
    ration: 3,           // PATCH_2210_VIVRES — biomasse mangée par jour
    cost: { metal: 250, energie: 50 },
    repairCost: { metal: 75, energie: 15 },
    scrapReturn: { metal: 75 },
    duration: 300, // ⚡ V0.5 : 5 min par lourd (rythme moyen, ancien : 18s proto)
    requires: 'turret', // Bunker requis (clé interne 'turret' = Bunker)
    locked: false, // débloqué dès qu'un Bunker existe
    lockedReason: 'Bunker requis',
    desc: 'Infanterie blindée. Encaisse les raids massifs. Embarquable (200 fret/u). Mange 3 biomasse par jour.',
  },
  tourelle: {
    key: 'tourelle',
    name: 'Tourelle légère',
    icon: '◎',
    color: 'var(--red)',
    defPerUnit: 400,
    atkPerUnit: 0,       // tourelle = défense pure, pas offensive
    transportable: false, // fixe au sol, pas embarquable
    cost: { metal: 160, energie: 30 },   // PATCH_2010_RENTABILITE (avant 200 + 40 : moins rentable qu'un garde)
    repairCost: { metal: 50, energie: 10 },
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
    cost: { metal: 380, energie: 80, cristal: 36 },   // PATCH_2010_RENTABILITE (avant 600 + 150 + 40c : pas plus rentable qu'une tourelle)
    repairCost: { metal: 115, energie: 25 },
    scrapReturn: { metal: 180 },
    duration: 480,
    requires: 'turret',
    minLevel: 2,          // Bunker fortifié
    lockedReason: 'Bunker fortifié (niveau 2) requis',
    desc: 'Canon lourd sous tourelle blindée. Brise les raids massifs et tient l\'orbite basse. Fixe au sol.',
  },
};

/* ═══════════════════════════════════════════════════════════════
   VAISSEAUX (data placeholder — UI/mécanique en passe 3.0)
   ═══════════════════════════════════════════════════════════════
   Les vaisseaux n'ont pas encore d'écran ni de logique de combat.
   Cette structure existe pour graver les data validées en passe 2.4 :
   - Tankers = transport (ressources + soldats)
   - Frégates, Cuirassés = combat (atk/def)
   - Capacités évolutives par tier
   ═══════════════════════════════════════════════════════════════ */
const SHIP_UNITS = {
  probe: {
    key: 'probe',
    name: 'Sonde',
    icon: '◇',
    role: 'exploration',
    desc: 'Reconnaissance longue portée. Pas de combat.',
  },
  fregate: {
    key: 'fregate',
    name: 'Frégate',
    icon: '◁',
    role: 'combat',
    desc: 'Vaisseau de raid léger. Bon rapport coût/efficacité.',
    // atk/def évolutifs par tier — voir SHIP_TIERS
  },
  tanker: {
    key: 'tanker',
    name: 'Tanker',
    icon: '▱',
    role: 'transport',
    desc: 'Transporte ressources et soldats. Faible en combat.',
    // transportCap (ressources + soldats) évolutif par tier — voir SHIP_TIERS
  },
  cuirasse: {
    key: 'cuirasse',
    name: 'Cuirassé',
    icon: '◀',
    role: 'combat',
    desc: 'Raideur lourd. Encaisse et frappe fort.',
  },
  colonial: {
    key: 'colonial',
    name: 'Arche coloniale',
    icon: '◈',
    role: 'special',
    desc: 'Emporte une colonie entière vers une planète habitable libre.',
  },
};

// Tiers des vaisseaux (data placeholder pour passe 3)
// PATCH_2010_RENTABILITE (20/10) : chaque tier rapporte ~25 % de plus par ressource (métal + énergie + 2×cristal)
// et par minute de chantier ; capacités inchangées. Avant : T2 = 5× le prix pour 3× les stats (aucun intérêt).
const SHIP_TIERS = {
  tanker: {
    1: { name:'Tanker T1',  cost:{metal:400},                 atk:50,   def:200,  cargo:5000,   transportCap:50  },
    2: { name:'Tanker T2',  cost:{metal:1300, energie:300},   atk:120,  def:500,  cargo:25000,  transportCap:100 },
    3: { name:'Tanker T3',  cost:{metal:4000, energie:830, cristal:150}, atk:280, def:1200, cargo:100000, transportCap:200 },
  },
  fregate: {
    1: { name:'Frégate T1', cost:{metal:600},                 atk:300,  def:200,  cargo:0 },
    2: { name:'Frégate T2', cost:{metal:1200, energie:240},   atk:900,  def:600,  cargo:0 },
    3: { name:'Frégate T3', cost:{metal:2600, energie:560, cristal:150}, atk:2700, def:1800, cargo:0 },
  },
  cuirasse: {
    1: { name:'Cuirassé T1',cost:{metal:2500, energie:600},   atk:1500, def:1500, cargo:0 },
    2: { name:'Cuirassé T2',cost:{metal:5800, energie:1300, cristal:200}, atk:4500, def:4500, cargo:0 },
    3: { name:'Cuirassé T3',cost:{metal:13500,energie:3300, cristal:600}, atk:13500, def:13500, cargo:0 },
  },
  // probe & colonial n'ont pas de tiers (cas particuliers — passe 3.0)
};

/* ═══════════════════════════════════════════════════════════════
   TYPES DE PLANÈTES — Système de débarquement et planque (passe 2.4)
   ═══════════════════════════════════════════════════════════════
   Décision verrouillée mai 2026 :
   - deployable : true si on peut y déposer des soldats
   - hostility  : taux de perte horaire (0 = safe, 0.05 = 5%/h sur planète morte)
   - playerOwned : si occupée par un joueur, le débarquement passif est impossible
   La mécanique d'embarquement / décompte / rapatriement viendra en passe 3.0.
   Cette structure est consultée par : sondes, écran flotte, calcul de raid.
   ═══════════════════════════════════════════════════════════════ */
const PLANET_TYPES = {
  type1: {
    key: 'type1', label: 'Type 1 — Naine',  icon:'☉',
    deployable: true, hostility: 0.02,
    desc: 'Lune ou astéroïde. Sol stable mais peu de ressources. Planque possible avec perte lente.',
  },
  type2: {
    key: 'type2', label: 'Type 2 — Fer',    icon:'⛁',
    deployable: true, hostility: 0,
    desc: 'Planète métallique stable. Débarquement sûr. Riche en métal.',
  },
  type3: {
    key: 'type3', label: 'Type 3 — Vie',    icon:'◉',
    deployable: true, hostility: 0,
    desc: 'Planète habitable. Débarquement sûr et confortable. Optimal pour planque longue durée.',
  },
  type4: {
    key: 'type4', label: 'Type 4 — Gazeuse',icon:'◍',
    deployable: false, hostility: 1.0,
    desc: 'Géante gazeuse. PAS DE SOL. Débarquement = mort immédiate de tous les soldats.',
  },
  type5: {
    key: 'type5', label: 'Type 5 — Morte',  icon:'◯',
    deployable: true, hostility: 0.01,
    desc: 'Atmosphère toxique, pas d\'eau. Planque possible avec perte très lente (-1%/h).',
  },
  // Mappings depuis les types existants du code (mine/dead/gas/empty)
  // Voir resolvePlanetType() pour la traduction.
};

// Skills débloquables depuis le Centre de Commandement
const CAPITAL_SKILLS = [
  {
    key: 'extra-slot-1',
    name: 'Logistique parallèle I',
    desc: '+1 cale active simultanée (total : 2 cales)',
    cost: { metal: 3000, energie: 800, cristal: 800 },
    requires: { capitalLevel: 1 },
    apply: () => { G.skills.barracksSlots = 2; },
    isApplied: () => G.skills.barracksSlots >= 2,
  },
  {
    key: 'extra-slot-2',
    name: 'Logistique parallèle II',
    desc: '+1 cale active (total : 3 cales)',
    cost: { metal: 10000, energie: 2500, cristal: 3000 },
    requires: { capitalLevel: 2, prereq: 'extra-slot-1' },
    apply: () => { G.skills.barracksSlots = 3; },
    isApplied: () => G.skills.barracksSlots >= 3,
  },
  {
    key: 'speed-1',
    name: 'Production accélérée I',
    desc: '−15% sur le temps de construction',
    cost: { metal: 2000, energie: 600, cristal: 1200 },
    requires: { capitalLevel: 1 },
    apply: () => { G.skills.productionSpeed = 1.15; },
    isApplied: () => G.skills.productionSpeed >= 1.15,
  },
  {
    key: 'speed-2',
    name: 'Production accélérée II',
    desc: '−30% sur le temps (cumulé)',
    cost: { metal: 6000, energie: 2000, cristal: 4000 },
    requires: { capitalLevel: 2, prereq: 'speed-1' },
    apply: () => { G.skills.productionSpeed = 1.43; },
    isApplied: () => G.skills.productionSpeed >= 1.43,
  },
  {
    key: 'colonial',
    name: 'Vaisseau Colonial',
    desc: 'Débloque la construction du Vaisseau Colonial',
    cost: { metal: 50000, cristal: 10000, artefact: 3 },
    requires: { capitalLevel: 3 },
    apply: () => { G.skills.colonialShipUnlocked = true; },
    isApplied: () => G.skills.colonialShipUnlocked,
  },
];

// Coût d'amélioration du Centre de Commandement (Tier N → N+1)
const CAPITAL_UPGRADE_COSTS = [
  { metal: 2500, energie: 800 },                  // 1 → 2
  { metal: 12000, energie: 4000, cristal: 1500 }, // 2 → 3
];

/* ═══════════════════════════════════════════════════════════════
   ARBRE TECHNOLOGIQUE — Manuel utilisateur (19/05/2026)
   ═══════════════════════════════════════════════════════════════
   PRINCIPE : explique CE QUI EXISTE dans le jeu, pas ce qui viendra.
   Pour chaque nœud : ce qu'il fait + ce qu'il débloque dans le flux.
   Style AoE2 : "Pour faire X il te faut Y, Y débloque Z".
   Aucune mention de futur, d'âges, ou de civilisations (secrets émergents).
   Visuel uniquement — pas d'interactivité.
   ═══════════════════════════════════════════════════════════════ */

const TECH_TREE = [
  {
    catKey: 'extraction',
    catLabel: 'Extraction',
    catTagline: 'Tirer les ressources de la planète',
    color: '#ff8848',
    bgGradient: 'linear-gradient(135deg,rgba(255,136,72,.12),rgba(255,136,72,.02))',
    icon: 'pickaxe',
    nodes: [
      { id: 'mine-t1', kind: 'building', name: 'Mine', sub: 'Produit du métal en passif. Match-3 minéral pour bonus immédiat.', flow: '→ permet de construire la majorité des autres bâtiments', requires: 'metal:200', buildingKey: 'mine', tier: 1 },
      { id: 'mine-t2', kind: 'building', name: 'Mine renforcée', sub: 'Production de métal ×4. Match-3 plus rentables.', flow: '→ requis pour construire les Silos métalliques', requires: 'metal:1000 + énergie:200', buildingKey: 'mine', tier: 2 },
      { id: 'mine-t3', kind: 'building', name: 'Extracteur lourd', sub: 'Production de métal ×16.', flow: '→ permet l\'auto-suffisance en métal en endgame', requires: 'metal:5000 + énergie:1000 + cristal:200', buildingKey: 'mine', tier: 3 },
      { id: 'silo-metal', kind: 'building', name: 'Silo Métal', sub: 'Augmente la capacité de stockage métal de +5000.', flow: '→ requis avant que tes stocks ne se remplissent', requires: 'metal:600', buildingKey: 'silo_metal', tier: 1 },
      { id: 'silo-biomass', kind: 'building', name: 'Silo Biomasse', sub: 'Stockage de biomasse (ressource organique).', flow: '→ augmente ta capacité de biomasse', requires: 'metal:500 + énergie:200', buildingKey: 'silo_biomass', tier: 1 },
      { id: 'silo-fuel', kind: 'building', name: 'Silo Carburant', sub: 'Réservoir de carburant (commun à l\'empire).', flow: '→ augmente ta réserve de carburant', requires: 'metal:800 + énergie:300', buildingKey: 'silo_fuel', tier: 1 },
    ],
  },
  {
    catKey: 'energie',
    catLabel: 'Énergie',
    catTagline: 'Le carburant de toutes les machines',
    color: '#ffaf3a',
    bgGradient: 'linear-gradient(135deg,rgba(255,175,58,.12),rgba(255,175,58,.02))',
    icon: 'zap',
    nodes: [
      { id: 'centrale-t1', kind: 'building', name: 'Centrale solaire', sub: 'Produit de l\'énergie en passif.', flow: '→ requise pour la plupart des autres bâtiments (Labo, Chantier, etc.)', requires: 'metal:300', buildingKey: 'centrale', tier: 1 },
      { id: 'centrale-t2', kind: 'building', name: 'Centrale avancée', sub: 'Production d\'énergie ×4.', flow: '→ nécessaire pour soutenir une grande planète', requires: 'metal:1500 + énergie:300', buildingKey: 'centrale', tier: 2 },
      { id: 'centrale-t3', kind: 'building', name: 'Réacteur à fusion', sub: 'Production d\'énergie ×16.', flow: '→ autonomie énergétique totale en endgame', requires: 'metal:7500 + énergie:1500 + cristal:300', buildingKey: 'centrale', tier: 3 },
      { id: 'silo-energie', kind: 'building', name: 'Silo Énergie', sub: 'Augmente le stockage énergie de +5000.', flow: '→ sans silo, ton énergie déborde et se perd', requires: 'metal:600 + énergie:200', buildingKey: 'silo_energie', tier: 1 },
    ],
  },
  {
    catKey: 'recherche',
    catLabel: 'Recherche',
    catTagline: 'Cristal et connaissance',
    color: '#5fffe8',
    bgGradient: 'linear-gradient(135deg,rgba(95,255,232,.12),rgba(95,255,232,.02))',
    icon: 'gem',
    nodes: [
      { id: 'labo-t1', kind: 'building', name: 'Laboratoire', sub: 'Produit du cristal en passif.', flow: '→ le cristal est requis pour les sondes avancées et les Tiers 3', requires: 'metal:400 + énergie:50', buildingKey: 'labo', tier: 1 },
      { id: 'labo-t2', kind: 'building', name: 'Centre de recherche', sub: 'Production de cristal ×4.', flow: '→ débloque la Cartographie sismique (portée des sondes : 2 secteurs autour de la planète)', requires: 'metal:2000 + énergie:500', buildingKey: 'labo', tier: 2 },
      { id: 'labo-t3', kind: 'building', name: 'Institut Quantique', sub: 'Production de cristal ×16 + matrices quantiques.', flow: '→ débloque la Cartographie interstellaire (4 secteurs autour de la planète)', requires: 'metal:10000 + énergie:2500 + cristal:500', buildingKey: 'labo', tier: 3 },
      { id: 'silo-cristal', kind: 'building', name: 'Silo Cristal', sub: 'Stockage cristal +2000.', flow: '→ utile dès que tu construis des sondes en série', requires: 'metal:800 + cristal:200', buildingKey: 'silo_cristal', tier: 1 },
      { id: 'carto-sismic', kind: 'skill', name: 'Cartographie sismique', sub: 'Porte la portée des sondes à 2 secteurs autour de la planète (1 sans elle).', flow: '→ permet de scanner plus loin que ton système d\'origine', requires: 'Labo Tier 2', status: 'auto-carto', cartoLevel: 'sismic' },
      { id: 'carto-interstellar', kind: 'skill', name: 'Cartographie interstellaire', sub: 'Porte la portée des sondes à 4 secteurs autour de la planète.', flow: '→ ouvre l\'exploration galactique', requires: 'Labo Tier 3', status: 'auto-carto', cartoLevel: 'interstellar' },
    ],
  },
  {
    catKey: 'exploration',
    catLabel: 'Exploration',
    catTagline: 'Sondes, signatures, Carnet du capitaine',
    color: '#a370ff',
    bgGradient: 'linear-gradient(135deg,rgba(163,112,255,.12),rgba(163,112,255,.02))',
    icon: 'rocket',
    nodes: [
      { id: 'prospect-center', kind: 'screen', name: 'Centre de prospection', sub: 'Le hub d\'exploration. Accessible depuis ta planète.', flow: '→ contient l\'inventaire des sondes, l\'univers, et tes rapports', requires: 'Toujours disponible', status: 'auto-always' },
      { id: 'probe-radar', kind: 'skill', name: 'Sonde Radar', sub: 'Sacrificielle (ne revient pas). Balaye un système entier.', flow: '→ détecte des signatures opaques (SIG-XXX). Premier maillon du pipeline.', requires: 'metal:30', status: 'auto-always' },
      { id: 'probe-light', kind: 'skill', name: 'Sonde Légère', sub: 'Quota max : 1. Résolution.', flow: '→ cible une SIG-XXX. La transforme en coordonnée mouvante (épave, anomalie) ou en corps orbital.', requires: 'metal:200 + cristal:50', status: 'auto-always' },
      { id: 'probe-medium', kind: 'skill', name: 'Sonde Moyenne', sub: 'Quota max : 2. Verrouillage.', flow: '→ verrouille un corps orbital → adresse fixe permanente dans ton Carnet.', requires: 'Cartographie sismique débloquée', status: 'auto-carto-medium' },
      { id: 'probe-stealth', kind: 'skill', name: 'Sonde Furtive', sub: 'Indétectable. Ne révèle pas ta position.', flow: '→ pour espionner les planètes adverses sans être vu.', requires: 'Cristal + artefacts (tier élevé)', status: 'auto-always' },
      { id: 'signatures', kind: 'skill', name: 'Signatures (SIG-XXX)', sub: 'Détectées par Radar. Opaques au début.', flow: '→ résolues par Légère → coordonnée exploitable ou orbital. Puis verrouillées par Moyenne → adresse fixe.', requires: '1 Sonde Radar lancée', status: 'auto-always' },
      { id: 'carnet', kind: 'screen', name: 'Carnet du capitaine', sub: 'Conserve signatures résolues, routes, pavillons, rumeurs, pistes.', flow: '→ ta mémoire de l\'univers. Tout ce que tu découvres y est tracé.', requires: 'Auto-débloqué', status: 'auto-always' },
    ],
  },
  {
    catKey: 'militaire',
    catLabel: 'Militaire',
    catTagline: 'Flotte, infanterie, raids',
    color: '#ff5040',
    bgGradient: 'linear-gradient(135deg,rgba(255,80,64,.12),rgba(255,80,64,.02))',
    icon: 'sword',
    nodes: [
      { id: 'caserne-t1', kind: 'building', name: 'Caserne planétaire', sub: 'Recrute des gardes (infanterie défensive).', flow: '→ donne accès à l\'écran Défense Planétaire', requires: 'metal:500 + énergie:100', buildingKey: 'caserne', tier: 1 },
      { id: 'caserne-t2', kind: 'building', name: 'Centre tactique', sub: 'Débloque les Soldats lourds.', flow: '→ unités plus résistantes contre les raids', requires: 'metal:2500 + énergie:500 + cristal:100', buildingKey: 'caserne', tier: 2 },
      { id: 'caserne-t3', kind: 'building', name: 'Bunker souterrain (Caserne)', sub: 'Niveau ultime de la Caserne.', flow: '→ unités d\'élite', requires: 'metal:12500 + énergie:2500 + cristal:500', buildingKey: 'caserne', tier: 3 },
      { id: 'shipyard-t1', kind: 'building', name: 'Chantier orbital', sub: 'Permet de construire des sondes, frégates et tankers.', flow: '→ porte d\'entrée vers le commerce et l\'attaque spatiale', requires: 'metal:600 + énergie:150', buildingKey: 'shipyard', tier: 1 },
      { id: 'shipyard-t2', kind: 'building', name: 'Chantier renforcé', sub: 'Vitesse de production +30%. Débloque les Cuirassés.', flow: '→ flotte plus rapide et plus lourde', requires: 'metal:3000 + énergie:750 + cristal:150', buildingKey: 'shipyard', tier: 2 },
      { id: 'shipyard-t3', kind: 'building', name: 'Chantier naval lourd', sub: '2 cales actives simultanées. Vaisseaux capitaux.', flow: '→ permet de construire 2 vaisseaux en parallèle', requires: 'metal:15000 + énergie:3750 + cristal:750', buildingKey: 'shipyard', tier: 3 },
      { id: 'fregate', kind: 'skill', name: 'Frégate', sub: 'Vaisseau d\'attaque rapide. Bon pour raids légers.', flow: '→ se compose en flotte depuis l\'écran Flotte', requires: 'Chantier Tier 1', status: 'auto-fleet' },
      { id: 'cuirasse', kind: 'skill', name: 'Cuirassé', sub: 'Vaisseau lourd, raids et sièges.', flow: '→ noyau d\'une flotte offensive', requires: 'Chantier Tier 2 + cristal', status: 'auto-fleet' },
      { id: 'tanker', kind: 'skill', name: 'Tanker', sub: 'Transport de ressources et de cargo.', flow: '→ essentiel pour le commerce et l\'exploration des cibles mouvantes', requires: 'Chantier Tier 1', status: 'auto-fleet' },
      { id: 'fleet-screen', kind: 'screen', name: 'Composer une flotte', sub: 'Assemble des vaisseaux en une flotte unique.', flow: '→ une flotte est requise pour attaquer (l\'attaque ne se fait pas vaisseau par vaisseau)', requires: '1 vaisseau militaire construit', status: 'auto-fleet-screen' },
    ],
  },
  {
    catKey: 'defense',
    catLabel: 'Défense',
    catTagline: 'Bunkers et tourelles',
    color: '#5098ff',
    bgGradient: 'linear-gradient(135deg,rgba(80,152,255,.12),rgba(80,152,255,.02))',
    icon: 'shield',
    nodes: [
      { id: 'turret-t1', kind: 'building', name: 'Bunker souterrain', sub: 'Débloque tourelles + soldats lourds. +1500 défense.', flow: '→ pierre angulaire de la défense passive', requires: 'metal:800 + énergie:200', buildingKey: 'turret', tier: 1 },
      { id: 'turret-t2', kind: 'building', name: 'Bunker fortifié', sub: 'Tourelles lourdes. +5000 défense.', flow: '→ réduit l\'efficacité des raids ennemis', requires: 'metal:4000 + énergie:1000 + cristal:200', buildingKey: 'turret', tier: 2 },
      { id: 'turret-t3', kind: 'building', name: 'Bunker stratégique', sub: 'Champ de distorsion. +20000 défense.', flow: '→ planète quasi-imprenable contre raids légers', requires: 'metal:20000 + énergie:5000 + cristal:1500', buildingKey: 'turret', tier: 3 },
      { id: 'garrison', kind: 'screen', name: 'Garnison', sub: 'L\'inventaire de tes unités défensives.', flow: '→ accessible depuis l\'écran Défense Planétaire', requires: 'Caserne Tier 1', status: 'auto-garrison' },
    ],
  },
  {
    catKey: 'commerce',
    catLabel: 'Commerce',
    catTagline: 'Crédits, routes, marché, carburant',
    color: '#ffc864',
    bgGradient: 'linear-gradient(135deg,rgba(255,200,100,.12),rgba(255,200,100,.02))',
    icon: 'coin',
    nodes: [
      { id: 'comptoir-t1', kind: 'building', name: 'Comptoir', sub: 'Produit des Crédits Galactiques en passif.', flow: '→ les CG servent à acheter sur le marché, financer des routes', requires: 'metal:500 + énergie:100', buildingKey: 'comptoir', tier: 1 },
      { id: 'comptoir-t2', kind: 'building', name: 'Maison de commerce', sub: 'CG ×4. Agents marchands actifs.', flow: '→ revenus passifs significatifs', requires: 'metal:2500 + énergie:500 + cristal:100', buildingKey: 'comptoir', tier: 2 },
      { id: 'comptoir-t3', kind: 'building', name: 'Banque interstellaire', sub: 'CG ×16.', flow: '→ tu deviens un acteur économique du secteur', requires: 'metal:12500 + énergie:2500 + cristal:500', buildingKey: 'comptoir', tier: 3 },
      { id: 'raffinerie-t1', kind: 'building', name: 'Raffinerie', sub: 'Produit du carburant en passif. Plafond stockage 2000.', flow: '→ le carburant alimente les tankers en mission longue', requires: 'metal:500 + énergie:300', buildingKey: 'raffinerie', tier: 1 },
      { id: 'raffinerie-t2', kind: 'building', name: 'Raffinerie avancée', sub: 'Carburant ×4. Cap 5000.', flow: '→ tankers en mission permanente possible', requires: 'metal:3000 + énergie:800', buildingKey: 'raffinerie', tier: 2 },
      { id: 'raffinerie-t3', kind: 'building', name: 'Complexe pétrochimique', sub: 'Carburant ×16. Cap 20000.', flow: '→ flotte de tankers entièrement autonome', requires: 'metal:15000 + énergie:4000 + cristal:600', buildingKey: 'raffinerie', tier: 3 },
      { id: 'routes', kind: 'skill', name: 'Routes secrètes', sub: 'Cartes de route à activer. Chaque route a une humeur (nerveuse, grasse, morte, noire, impériale).', flow: '→ envoie un tanker sur une route → ramène ressources + CG', requires: '1 tanker construit', status: 'auto-commerce' },
      { id: 'market', kind: 'skill', name: 'Marché interplanétaire', sub: 'Acheter/vendre des ressources contre CG. 6 saisons fluctuent les prix.', flow: '→ stabilise tes stocks quand un type de ressource est rare', requires: 'Comptoir Tier 1', status: 'auto-commerce' },
      { id: 'docks', kind: 'skill', name: 'Docks et comptoirs francs', sub: 'Points de rencontre dans l\'espace découverts via sondes.', flow: '→ permettent d\'échanger avec d\'autres capitaines, gagner des rumeurs et des cartes', requires: 'Sondes Légère / Moyenne', status: 'auto-commerce' },
    ],
  },
];

// Helper : soldats d'un type embarqués sur des flottes DÉPLOYÉES (en orbite)
// Ces soldats ne défendent plus le sol mais sont à bord.
// Helper : soldats d'un type réservés à des flottes DÉPLOYÉES (à bord, ne défendent plus)
// AUDIT_1110 — Réservations : les totaux (G.fleet.stationed, G.defense.units[k].qty) sont ce qu'on POSSÈDE ;
// flottes, garnisons et missions tanker en RÉSERVENT une partie.
var TANKER_BUSY_STATUSES = ['in_transit', 'docked', 'returning', 'exploring', 'orbital_relay', 'posted', 'trade_wait'];


const G = {
  empire: { level: 0 },
  res: {
    metal:    { v:0,  max:5000, rate:0 },
    energie:  { v:0,  max:5000, rate:0 },
    cristal:  { v:0,  max:5000, rate:0 },
    biomass:  { v:0,  max:5000, rate:0 },
    artefact: { v:0,  max:200,  rate:0 },
  },
  planet: {
    name: 'KERATH-VII',
    address: MY_ADDRESS,
    coordString: MY_COORD_STRING,
    type: 3,
    level: 0,
    age: "L'Éveil",
    parcels: Array.from({length:25}, (_,i) => makeInitialParcel(i)),
    families: new Set(['Capitale']),
  },

  // Défense détaillée : composition par unité
  defense: {
    capitalBase: 200,  // bonus passif de la capitale (immuable)
    units: {
      // key → quantité possédée
      garde:    { qty: 0, dmg: 0 },  // dmg = unités endommagées récupérables
      lourd:    { qty: 0, dmg: 0 },
      tourelle: { qty: 0, dmg: 0 },  // tourelle légère
      tourelle_lourde: { qty: 0, dmg: 0 },  // PATCH_1910 — Bunker fortifié
    },
  },

  // Compétences débloquées via Centre de Commandement
  skills: {
    capitalLevel: 1,           // niveau du Centre de Commandement (1-3)
    barracksSlots: 1,          // nombre de cales actives caserne (1 par défaut)
    productionSpeed: 1,        // multiplicateur vitesse construction (×1 par défaut)
    colonialShipUnlocked: false,
  },
  m3: {
    parcelIdx: null, grid: [], sel: null,
    moves: M3_MOVES, mult: 1, animating: false, ended: false,
    score: { metal:0, energie:0, cristal:0, biomass:0, artefact:0 },
    context: 'Terraformation',
  },
  selParcel: 12,
  passiveTimer: null,

  // Sonde unique
  probe: {
    exists: false, // doit être construite au chantier
    name: 'AURIS-1',
    state: 'ready', // 'ready' | 'mission' | 'returning'
    rangeIdx: 0,    // index dans PROBE_LEVELS.range.values
    stealthIdx: 0,
    speedIdx: 0,
    memoryIdx: 0,
    mission: null, // { destinationCoord, destinationSector, destinationSystem, returnAt, mode }
  },

  /* ═══════════════════════════════════════════════════════════════
     FLOTTE (passe 3.1) — Vaisseaux militaires stationnés
     ═══════════════════════════════════════════════════════════════
     Le tier de chaque type est déterminé par le tier du Chantier orbital
     au moment de la construction (système hybride : Chantier T2 = ships T2).
     Pour la 3.1, on accumule juste. Missions/combat en 3.2+.
     ═══════════════════════════════════════════════════════════════ */
  fleet: {
    stationed: {
      tanker:   { t1: 0, t2: 0, t3: 0 },
      fregate:  { t1: 0, t2: 0, t3: 0 },
      cuirasse: { t1: 0, t2: 0, t3: 0 },
      // Note : les sondes ne sont PAS dans la flotte militaire — elles vivent dans G.probesPool (Centre de Prospection)
    },
    // Flottes nommées préparées par le joueur, prêtes à être envoyées (passe 3.2)
    // Structure : { id, name, composition: { tanker:{t1,t2,t3}, fregate:{...}, cuirasse:{...} }, soldiers: { garde, lourd }, createdAt }
    prepared: [],
    // Placeholder pour les sous-passes suivantes
    active: [],   // 3.3 — flottes en mission
    deployed: [], // 3.5 — soldats planqués
    history: [],  // 3.6 — récit des flottes passées
  },

  // Rapports de mission (passe 3.3 — placeholder, rapport narratif complet en passe 3.4)
  // Structure : { id, fleetId, fleetName, targetId, targetName, doctrine, intent, returnedAt, read }
  reports: [],
  cheats: {},

  // ─── PASSE COMMERCE (Phase 1 Routes Secrètes) — 16/05/2026 ───
  // Cf. starbyte_routes_secretes.md et starbyte_economie_overview.md
  // Crédits galactiques : monnaie d'échange inter-joueurs (pas de plafond, pas de silo)
  // Produits par le match-3 du hub Commerce, dépensés sur le marché/contrats/cartes
  credits: 0,
  // Carburant : ressource de voyage tanker (Chunk D 18/05)
  // Démarrage : 1000 fuel. Pas de plafond strict (silos en Phase 2+). Consommation au départ tanker :
  // T1=50, T2=150, T3=400. Coût constant pour cette passe, modulable plus tard selon distance.
  fuel: 1000,
  // Cartes de route : promesses non encore activées (objet trouvé via rencontres tanker)
  // Structure : { id, name, originHint, destinationHint, quality (0-100), kind ('clean'|'holed'|'black'|'dead'|'fake'|'singing'), foundAt, source }
  routeCards: [],
  // Routes activées : liaisons réelles dans G.knownSystems, avec mémoire
  // Structure : { id, name, originAddress, destinationAddress, mood (humeur), quality, passages, lost,
  //               stability (0-100), knowledgeLevel (0-10), discoveredAt, lastUsedAt, status ('active'|'fading'|'collapsed'|'in_use'),
  //               driftScores (Chunk D : object {nerveuse,grasse,morte,noire,imperiale} accumulés sur 5 passages) }
  routes: [],
  // Registre des docks de l'univers (Chunk D fix 18/05 — univers fixe canon)
  // Clé : 'dock-{hash de destinationHint}'. Garantit que deux routes vers la même destination
  // → même dock. Préparation multijoueur : ce registre passera côté serveur plus tard.
  // Voir GDD docks_francs.md § "DÉCISIONS CANON — CHUNK D" → "Univers fixe".
  universeDocks: {},

  // ─── PASSE 4-sondes-v1.1 : Pool de sondes (refonte) ───
  // Chaque sonde est un objet { id, tier: 'radar'|'light'|'medium'|'stealth', state: 'ready'|'mission', builtAt }
  // 3 radar offerts + 1 légère offerte au démarrage (cf. GDD 13)
  probesPool: [
    { id: 'p-init-r1', tier: 'radar',  state: 'ready', builtAt: Date.now() },
    { id: 'p-init-r2', tier: 'radar',  state: 'ready', builtAt: Date.now() },
    { id: 'p-init-r3', tier: 'radar',  state: 'ready', builtAt: Date.now() },
    { id: 'p-init-l1', tier: 'light',  state: 'ready', builtAt: Date.now() },
  ],

  // Missions de sondes en cours (radar, légère, moyenne, furtive)
  probeMissions: [],

  // Rapports de sondes reçus (depuis handleProbeReturn)
  probeReports: [],

  // ── Univers mouvant — cibles connues (épaves, astéroïdes...) ──
  // Persisté en localStorage, max 50 entrées, expiration 7j (cf. ch.16 GDD)
  // Map de "W-X-YYYY-Z" (spot) vers { type, label, lootEstimate, discoveredAt, expiresAt, ... }
  knownTargets: (typeof loadKnownTargets === 'function') ? loadKnownTargets() : {},

  // ── Signatures — couche supérieure de la connaissance (passe 5.0) ──
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md
  // Map de SIG-XXX vers { system, type, resolved, resolvedType, fixedAddress, ... }
  signatures: (typeof loadSignatures === 'function') ? loadSignatures() : {},

  // ── Résolution par système (passe 5.7) ──
  // Cf. starbyte_gdd_v1/17_signatures_resolution.md (Métrique de résolution)
  // Map de 'W-X-YYYY' vers un entier 0-100 (% de lisibilité du système)
  // - Système d'origine : 60% (humilité du Carta scientifique — le joueur
  //   connaît sa planète, mais pas le reste du système. Il découvrira via sondes.)
  // - Voisins immédiats : 0-30% (bruit ambiant)
  // - Reste : 0% jusqu'à exploration
  systemResolution: (typeof loadSystemResolution === 'function') ? loadSystemResolution() : {},

  // État des secrets cosmiques par joueur (cf. PILIER 7, GDD 13)
  // { 'secret-id': { discovered: bool, currentStage: 0, history: [], pendingDelayedReports: [] } }
  secretsState: {},

  // ── Skills de Cartographie (passe 4.3 — portée des sondes) ──
  // Cf. starbyte_gdd_v1/13_sondes_exploration.md section RÈGLES DE PORTÉE
  // Au départ : aucun skill → secteur local uniquement
  cartoSkills: (typeof makeDefaultCartoSkills === 'function') ? makeDefaultCartoSkills() : { sismic: false, interstellar: false, galactic: false, interCluster: false },

  // ── Tanker logistique : garnisons déposées (chunk 15/05) ──
  // Cf. starbyte_AUDIT_tanker_logistique.md
  // Principe émergence : un tanker peut déposer du fret (soldats + ressources) sur
  // n'importe quelle planète verrouillée. Si le tanker reste en orbite = balise
  // de communication. Si il rentre, la garnison passe en "isolated" (figée).
  // Survie selon PLANET_TYPES.hostility (gazeuse=mort instant, monde mort=-1%/h, etc.)
  // Structure: [{ id, planetCoord, planetType, soldiers, resources, soldiersAtDeposit,
  //               resourcesAtDeposit, depositedAt, lastTickAt, contactStatus,
  //               contactingTankerName, lastKnownSoldiers, lastKnownTimestamp }]
  garrisons: [],

  // ── PASSE 6 — ARCHIVES DU VIDE v0 (Caldris MVP) ──
  // Cf. docs "Les 47 de Caldris", "La Légende de Starbyte"
  // Civilisations-fantômes : fragments narratifs collectionnés au retour
  // des tankers, sans effet gameplay. Le 1er fragment débloque l'onglet
  // Archives dans le Centre de prospection. Seuils de révélation : motif 47
  // → nom CALDRIS → coord_hints partielles → lieux fixes découvrables via
  // sonde Moyenne ciblée.
  legend: (typeof loadLegend === 'function') ? loadLegend() : {
    civilizations: {
      caldris: {
        revealed: false,
        motifs: { nous_etions_47: { discovered: false, count: 0 } },
        lastSeenAt: null,
      },
    },
    fragments: [],            // [{ id, civId, scenarioId, type, title, text, reliability, contradictionTags, motif, sourceType, sourceCoords, discoveredAt, read }]
    relics: [],               // [{ id, civId, scenarioId, name, publicName, description, rarity, sourceType, sourceCoords, discoveredAt, read }]
    coordHints: [],           // [{ id, civId, scenarioId, hint:'A-F-2290-??', sourceFragmentId, resolved:false, resolvedFixedAssetCoord, discoveredAt }]
    discoveredFixedAssets: [], // [{ coord:'A-F-2290-22', civId, discoveredAt, discoveredByProbe }]
    seenRevealMessages: [],   // ids des règles de révélation déjà déclenchées
    ui: { lastViewedAt: null, badgeCount: 0 },
  },

  // Mode actif du Chantier orbital (onglet sélectionné)
  shipyardTab: 'build',

  // Onglet actif de la Défense (Mobilisation / Garnison)
  defenseTab: 'mobilize',

  // ── Composition de flotte en cours (passe 3.2) ──
  // État éphémère pendant que le joueur compose une flotte sur l'écran fleet-compose
  fleetComposing: null, // {name, composition:{tanker:{...},fregate:{...},cuirasse:{...}}, soldiers:{garde,lourd}}

  // Univers connu (planètes découvertes)
  // Map de "X-XXXX" (système) vers { sector, system, planets: [...] }
  knownSystems: {},

  // Carnet (planètes intéressantes archivées)
  bookmarks: [],

  // Mode de prospection
  probeMode: 'manual',
  universeTab: 'systems',
  prospectTab: 'univers',   // SPACE MAP — la carte est l'onglet d'accueil

  // Fiche planète sélectionnée
  selectedPlanetCoord: null,

  // ⚡ V0.5 — Identité joueur (Option B)
  // Renseigné via écran de bienvenue au premier lancement.
  // Si captainName === null au démarrage : afficher l'écran de bienvenue.
  // Stocké dans la save (G.profile fait partie du snapshot).
  profile: {
    captainName: null,    // ex: 'Adrien'
    createdAt: null,      // timestamp de création
  },
};

/* ════════════════════════════════════════════════════════════════════
   SAVE SYSTEM — V0.5 (Save propre pour publication beta)
   ════════════════════════════════════════════════════════════════════

   Architecture :
   - 1 store principal localStorage 'starbyte_savegame' (JSON sérialisé)
   - Versioning : G.saveVersion = "0.5.0" (à incrémenter quand la structure change)
   - Auto-save : à chaque action critique (transaction de ressources, fin de construction,
     pose de balise, etc.) + safety net toutes les 30 secondes
   - Helpers existants pour stores secondaires (knownTargets, signatures, etc.)
     RESTENT en place. La save principale ne les inclut pas — ils continuent à
     fonctionner indépendamment via leurs propres save / load helpers.

   Liste exhaustive des clés sauvegardées :
   - empire, res, planet, defense, skills, fleet, reports, credits, fuel
   - routeCards, routes, universeDocks
   - probe, probesPool, probeMissions, probeReports
   - tankerMissions, tankerReports, beaconReports
   - knownSystems, bookmarks, garrisons, secretsState, cartoSkills
   - QUEUES (constructions en cours)

   Non sauvegardé (UI éphémère ou reconstruit au load) :
   - m3, fleetComposing, passiveTimer, selParcel, selectedPlanetCoord
   - shipyardTab, defenseTab, probeMode, universeTab, prospectTab
   ════════════════════════════════════════════════════════════════════ */

const SAVE_KEY = 'starbyte_savegame';
const SAVE_VERSION = '0.5.0';

// AUDIT_1110 — état de progression hors du cœur historique de la sauvegarde
// (fonction-constante en var : lue par saveGame/loadGame, déclarée avant tout appel)
var EXTRA_SAVE_KEYS = [
  'zoneProspect',   // ZONES_1011 — carte : zones sondées (et, pour la partie d'Hadrien, les 30 zones tirées avant le 12/11)
  'atlasCarte',   // CARTE_1211 — partie passée sur la nouvelle carte (toutes depuis le 14/11) : date, étapes et copie de la conversion
  'explore',   // EXPLORE_0311 — clairière aux lapins : heures de retour des lapins, captures, totaux
  'troopFamine', '_bioBuffer',   // PATCH_2210_VIVRES
  '_fakePurged',   // PATCH_2210_UNIVERS_OUVERT
  'imperialRep',   // PATCH_2210_EMPIRE
  'shipBuildTier',   // PATCH_2010_VAISSEAUX_T1 — tier choisi au chantier orbital
  'worldPillage', 'emptyRaidHeat',   // PATCH_2010_PILLAGE_VIDE — mondes vidés, fatigue des pillages
  'aftermath',   // APRÈS L'ATTAQUE (13/10) : indice de dévastation, fête, rapport en attente
  'openLeads', 'rumorJournal', 'purchasedIntel', 'visitedDocks', 'encounteredPavillons',
  'discoveredDocks', 'wantedTargets', 'navigationData', 'ambientReports', 'marketSeason',
  'tutorialArtefactSeen', 'tutorialBombSeen', 'tutorialHyperSeen', 'tutorialMegaSeen',
  'mpDeals',   // MP_DOCKS_V0 — marchés entre commandants (séquestre et règlement)
  'botState',  // BOTS_1110 — stocks des commandants automates après pillage
  'mpGrowthMilestone',
  'systemTags', 'mapSeen', 'mapCells', 'beaconRoutes', 'spottedLegs',
  'lineObs', 'trafficEchoes', 'hiddenPorts', '_linesNet', '_linesRoutes', '_linesLabels',   // PATCH_1410_PISTES
  '_sigShown', '_sigRead',   // ROUTES_V2 — signal d'antenne vu / replié
  'lineUsers',   // PATCH_1410_BALISAGE — convois de joueurs vus sur mes lignes
  'lineHeat', '_spiedPending', 'pendingRouteBuys',   // PATCH_1510_ORDRES — escortes renforcées après un pillage, filatures à relever, achats à vérifier
  'openedRoutes',   // PATCH_1410_ECLAIREUR — routes ouvertes par une Moyenne ou offertes par un allié
  'myRouteOffers', 'saleBeacons',   // PATCH_1410_MARCHE — mes cartes au comptoir, balisage au moment de la vente   // PATCH_1410_LIGNES — lignes observées, échos de l'antenne, lieux cachés découverts   // PATCH_1310_ROUTES2 — tronçons relevés par mes balises   // + routes entre balises (13/10)   // PATCH_1310_CARTE — marques de systèmes + systèmes déjà vus (survivent aux rapports supprimés)  // RUMORS_1110 — dernier palier de niveau annoncé au comptoir
  'mpDiplo',   // AMBASSADES_1210 — ambassades vues et dernière image des pactes
  'mpNeighbors',   // VOISINS_1310 — voisins déjà signalés
  'tuto',          // TUTO_1410 — premiers pas (étape, vu, terminé)
  'skillsLearned', 'research', '_skillsSeen', '_skillsMigrated',   // PATCH_1610_SKILLS
  'mpRaidsApplied', 'mpRaidsReturned', 'mpPostsToClose', 'mpRelations', 'mpTradeCaps', 'mpAlliance', 'mpAllianceTags', 'mpAllyUnread', 'mpGarHosted',   // PATCH_2010_AUDIT — raids déjà intégrés (indépendant des rapports, qu'on peut supprimer)
  'worlds', 'activeWorld', 'colonyMissions', 'fleetTransfers', '_probesPerWorld', '_resPerWorld', 'resTransfers',   // 30/10 : sondes et ressources par planète, convois entre planètes
    // PATCH_2010_WORLDS — colonies (planètes inactives) et planète affichée
  '_linesCrown', 'crownSeen', '_linesSanct', 'sanctSeen', '_linesNoire', 'noireSeen', '_linesRefuge', '_linesRefuge2', 'refugeSeen', '_brest1',
  '_linesVeyra', 'veyraSeen', '_linesLucioles', 'luciolesSeen', '_linesIvoire', 'ivoireSeen', '_linesAkhet', 'akhetSeen', '_linesAbime', 'abimeSeen', '_linesObsidienne', 'obsidienneSeen',   // PATCH_2210_STATIONS6   // PATCH_1510_CROWN — lieu du secteur M devenu la Couronne, première arrivée vue
  'fronde',   // GRANDE_FRONDE_0511 — paris déjà retirés des CG et gains déjà versés (assets/fronde-bridge.js)
];

// Démarre l'auto-save toutes les 30 secondes (safety net en plus des saves événementiels)
let _autosaveTimer = null;

// ⚡ V0.5 — Vérifier si une save existe AVANT d'initialiser l'univers
// Si une save existe, on saute initKnownUniverse (qui réécraserait G.knownSystems).
// Le vrai loadGame() est appelé en fin de script (après QUEUES défini).
const _SAVE_EXISTS = hasSave();
if (!_SAVE_EXISTS) {
  initKnownUniverse();
}

// INCOMING_1110 — flottes hostiles en approche : bandeau permanent (tous écrans) jusqu'à l'impact
var _mpIncoming = [];
setInterval(() => { try { mpRenderIncoming(); } catch (e) {} }, 30000);
(function sbAntennaCardPatch() {
  if (!window.SBAntenna || !SBAntenna.renderCard) { setTimeout(sbAntennaCardPatch, 400); return; }
  if (SBAntenna._sigPatched) return; SBAntenna._sigPatched = true;
  const orig = SBAntenna.renderCard.bind(SBAntenna);
  SBAntenna.renderCard = function (i) {
    orig(i);
    try {
      const d = this.data(); if (!d || !d.built) return;
      const card = document.getElementById('planet-info'); if (!card || card.querySelector('.sb-ant-sig')) return;
      const cta = card.querySelector('.cta'), box = document.createElement('div'); box.innerHTML = sbSignalsAntennaHtml();
      const node = box.firstElementChild; if (cta) card.insertBefore(node, cta); else card.appendChild(node);
      sbSignalRender._n = sbSignalsHere().length;
      if (typeof updateProspectRapportsBadge === 'function') updateProspectRapportsBadge();
    } catch (e) {}
  };
})();
setInterval(() => { try { sbSignalRender(); } catch (e) {} }, 3000);

// REDALERT_1310 — flotte hostile en approche : la carte planète passe en alerte rouge
// (girophares, voile rouge pulsé, bandeau à rayures avec compte à rebours). Les autres écrans
// gardent un liseré rouge qui bat. Calque purement visuel : rien n'est bloqué.
var _raOn = false, _raSeenPlanet = false;
// REDALERT2_1310 — l'alerte se réduit en halo rouge ; une nouvelle flotte hostile la rouvre
var _raMinIds = new Set();
setInterval(() => { try { mpRedAlertTick(); } catch (e) {} }, 1000);
// arrivée sur la carte : alerte immédiate, sans attendre la seconde suivante
(function () {
  const scr = document.getElementById('scr-planet');
  if (scr && window.MutationObserver) new MutationObserver(() => { try { mpRedAlertTick(); } catch (e) {} }).observe(scr, { attributes: true, attributeFilter: ['class'] });
})();


// ═══ MP_RAIDS_V0 — Raids entre commandants (étape 2, 11/10/2026) ═══
// Le jeu envoie la flotte au registre (mp_launch_raid) ; le serveur fixe l'heure d'arrivée,
// résout le combat avec le moteur du jeu (fonction resolve-raids) et applique pillage +
// bâtiment abîmé chez le défenseur. Au retour, le jeu lit le résultat et l'applique à la flotte.
var _mpResolveAsked = new Set();   // var : lu par la boucle des missions
var _mpReturning = new Set();

var MP_RAID_ERRORS = {
  fleet_unknown: 'Le registre ne connaît pas encore cette flotte : réessaie dans quelques secondes',   // ANTITRICHE_0811
  fleet_invalid: 'Cette flotte ne peut pas partir en raid',
  target_shielded: 'Cette planète est sous bouclier protecteur (colonie fondée il y a moins de 72 h, ou raid récent)',
  target_too_weak: 'Ce monde est trop faible pour toi : aucune gloire à le piller',
  raid_already_enroute: 'Une de tes flottes est déjà en route vers ce monde',
  target_self: 'C\'est ton propre monde',
  target_unknown: 'Ce monde n\'est plus au registre',
  target_other_season: 'Ce monde appartient à une autre saison',
  no_world: 'Ton monde n\'est pas encore au registre',
  pact_active: 'Pacte de non-agression en cours avec ce commandant',   // AMBASSADES_1210
  ally: 'C\'est un membre de ton alliance',   // PATCH_2110_ALLIANCES
  ally_cooldown: 'Ancien allié : aucune attaque possible pendant 24 h après un départ de l\'alliance',
  target_peaceful: 'Ce commandant est pacifique : personne ne peut l\'attaquer',   // PATCH_2410_PACIFIQUE
};

// ═══ PATCH_2410_PACIFIQUE — mode pacifique (décisions d'Adrien, 23-24/10) ═══
// Tout le monde commence pacifique : personne ne peut l'attaquer. Le statut tombe, définitivement,
// au premier acte hostile contre un joueur (raid, abordage, embuscade « joueurs compris »). Le serveur tranche ;
// ici, on prévient avant.
var _mpPeaceOkAt = 0;

var _mpLaunching = false;

// ─── PERTES DE LA DÉFENSE (décision d'Adrien 13/10/2026 : « pertes fortes », endommagées hors service) ───
// Orbite perdue : 40–75 % des tourelles et des vaisseaux en orbite touchés (plus le rapport de force est écrasant, plus ça fait mal).
// Sol pris : 60–90 % des soldats au sol. Raid repoussé / débarquement repoussé : 10–25 % (plus c'était serré, plus on perd).
// Moitié détruite, moitié endommagée (réparable à la caserne, hors service d'ici là).
// Vaisseaux en orbite : moitié détruits, moitié avariés (intégrité 15–45 %, réparables au chantier).
var DEF_LOSS = { ORBIT_LOST: [0.40, 0.75], GROUND_LOST: [0.60, 0.90], HELD: [0.10, 0.25], DESTROYED_SHARE: 0.5 };
var DEF_TURRETS = ['tourelle', 'tourelle_lourde'], DEF_SOLDIERS = ['garde', 'lourd'];

// ─── Côté défenseur : un raid m'a frappé pendant mon absence ───
var _MP_BUILDING_LABEL = (k) => (typeof BUILDINGS !== 'undefined' && BUILDINGS[k] && BUILDINGS[k].name) || k;

// PAVILLONS_1110 — pavillons reçus (relevés par le registre)
var MP_FLAG_CONTEXT = { orbit: 'depuis son tanker en orbite', dock: 'au bar d\'un dock', raid: 'après le raid' };

// AMBASSADES_1210 — ambassades orbitales, livraisons et pactes de non-agression
var MP_DIPLO_ERRORS = {
  no_world: 'Ton monde n\'est pas encore au registre',
  target_unknown: 'Ce monde n\'est plus au registre',
  target_self: 'C\'est ton propre monde',
  orbit_quota: 'Trop d\'ambassades ouvertes (12 au plus)',
  orbit_rate: 'Trop d\'ambassades aujourd\'hui (3 par monde, 10 en tout)',
  cargo_invalid: 'Cale illisible pour le registre',
  orbit_unknown: 'Cette ambassade n\'existe plus',
  orbit_gone: 'Le tanker a déjà quitté ton orbite',
  cargo_already_answered: 'Tu as déjà répondu à cette cale',
  no_embassy: 'Il faut un tanker en orbite chez lui : son ambassade est fermée',
  pact_exists: 'Un pacte est déjà proposé ou en cours avec ce commandant',
  pact_unknown: 'Ce pacte n\'existe plus',
  pact_closed: 'Ce pacte est déjà clos',
  raid_en_route: 'Une flotte est en route entre vous : impossible de signer maintenant',
  enemies: 'Vous êtes ennemis déclarés : pas de pacte tant que la rivalité dure',
};
// ═══ PATCH_2110_COMMERCE — commerce entre joueurs (serveur v25) ═══
// Pendant un accord commercial, un commandant livre son surplus à son partenaire : le tanker part (convoi normal),
// le jeu du partenaire achète ce qu'il peut payer au prix du milieu du marché, le tanker rentre avec les CG
// et ce qui n'a pas été acheté. Aucun CG n'est créé : ils passent de l'acheteur au vendeur.
var MP_TRADE_PRICE = { metal: 2.5, energie: 3.5, cristal: 8.5 };
var MP_TRADE_CAP_DEFAULT = 2000;   // plafond d'achat par livraison (CG), réglable par partenaire
var MP_TRADE_SURPLUS = 0.70;       // au-delà de 70 % des silos : surplus
var _mpTradeBusy = new Set();

// ═══ PATCH_2110_ALLIANCES — alliances entre commandants (serveur v26) ═══
// Fonder (pacte d'ambassade actif, 1 000 CG), inviter (le chef, chez un commandant où un membre a une ambassade), 7 membres au plus.
// Entre membres : ni raid ni abordage, accord commercial automatique, canal commun. Le chef seul exclut.
var MP_ALLY_COST = 1000;
var MP_ALLY_MAX = 7;
var MP_ALLY_COLORS = ['#5fffe8', '#ffc864', '#ff8a8a', '#a370ff', '#7ed080', '#6aa8ff', '#ff9ad5'];
var MP_ALLY_ERRORS = {
  no_world: 'Ton monde n\'est pas encore au registre', already_in_alliance: 'Tu es déjà dans une alliance',
  alliance_name_invalid: 'Nom invalide (3 à 24 caractères : lettres, chiffres, espaces, - _ . \')', alliance_name_taken: 'Ce nom d\'alliance est déjà pris',
  alliance_needs_pact: 'Il faut d\'abord un pacte d\'ambassade actif avec un commandant', no_alliance: 'Tu n\'es dans aucune alliance',
  not_leader: 'Seul le chef peut faire ça', target_unknown: 'Ce commandant n\'est plus au registre', target_self: 'C\'est toi',
  already_member: 'Il est déjà membre', target_in_alliance: 'Il est déjà dans une autre alliance', alliance_full: `L'alliance est complète (${MP_ALLY_MAX} membres)`,
  invite_needs_embassy: 'Il faut qu\'un membre de l\'alliance ait un tanker en ambassade chez lui', enemies: 'Il est l\'ennemi déclaré d\'un membre',
  invite_unknown: 'Cette invitation n\'existe plus', raid_en_route: 'Une flotte est en route entre vous et un membre : impossible maintenant',
  not_member: 'Il n\'est pas membre de ton alliance', chat_empty: 'Message vide', chat_rate: 'Doucement : 6 messages par minute au plus',
};
var _mpAllyBusy = false;

// ── PATCH_2110_GARNISON — flotte en garnison chez un allié (elle reste à toi ; tu paies ses pertes) ──
Object.assign(MP_ALLY_ERRORS, { not_ally: 'Ce commandant n\'est pas (ou plus) dans ton alliance', garrison_full: 'Déjà 3 flottes alliées en garnison chez lui',
  fleet_invalid: 'Il faut au moins un vaisseau dans la flotte', garrison_unknown: 'Cette garnison n\'existe plus',
  fleet_unknown: 'Le registre ne connaît pas encore cette flotte : réessaie dans quelques secondes' });   // ANTITRICHE_0811
var _mpGarBusy = new Set();
var _mpDiploBusy = new Set();
var _mpOrbitRegistering = new Set();

var MP_DIPLO_TYPES = {
  embassy_in:     { title: 'AMBASSADE EN ORBITE', list: 'Ambassade en orbite', sub: 'tanker d\'un commandant au-dessus de ta colonie', color: '#5fffe8' },
  cargo_accepted: { title: 'CALE LIVRÉE',         list: 'Cale acceptée',       sub: 'livraison remise', color: '#7ed080' },
  cargo_refused:  { title: 'CALE REFUSÉE',        list: 'Cale refusée',        sub: 'la cale rentrera avec le tanker', color: '#ffa844' },
  pact_proposed:  { title: 'PACTE PROPOSÉ',       list: 'Pacte proposé',       sub: 'pacte de non-agression', color: '#5fffe8' },
  pact_signed:    { title: 'PACTE SIGNÉ',         list: 'Pacte signé',         sub: 'pacte de non-agression actif', color: '#7ed080' },
  pact_broken:    { title: 'PACTE ROMPU',         list: 'Pacte rompu',         sub: 'les raids redeviennent possibles', color: '#ff8a8a' },
  pact_declined:  { title: 'PACTE DÉCLINÉ',       list: 'Pacte décliné',       sub: 'proposition refusée', color: '#cececd' },
  garrison_hit:   { title: 'GARNISON AU COMBAT',  list: 'Garnison au combat',  sub: 'ta flotte a défendu un allié', color: '#5fffe8' },   // PATCH_2110_GARNISON
  alliance_invite: { title: 'INVITATION D\'ALLIANCE', list: 'Invitation d\'alliance', sub: 'rejoindre une alliance', color: '#5fffe8' },   // PATCH_2110_ALLIANCES
  trade_sold:     { title: 'LIVRAISON VENDUE',    list: 'Livraison commerciale', sub: 'surplus vendu à ton partenaire', color: '#ffc864' },   // PATCH_2110_COMMERCE
  trade_bought:   { title: 'LIVRAISON REÇUE',     list: 'Livraison reçue',     sub: 'achat à ton partenaire', color: '#ffc864' },
  neighbor:       { title: 'SIGNAL CAPTÉ',        list: 'Commandant voisin',   sub: 'ajouté à ton carnet', color: '#5fffe8' },   // VOISINS_1310
};

// CHAT_1310 — AMBASSADE : vue héros (le tanker en orbite au-dessus de la planète, comme le chantier orbital)
// et chat entre les deux commandants. Le canal est ouvert tant qu'un tanker est en orbite entre eux (dans un sens
// ou dans l'autre) ; rappel du tanker → canal fermé, l'historique reste lisible. Texte brut, 280 caractères.
var _mpEmbIn = [];                 // ambassades ouvertes chez moi (relève du registre)
var _mpChatUnread = {};            // adresse → { n, pseudo, last, lastId }
var _mpChatToasted = {};           // adresse → dernier message notifié
var MP_CHAT_ERRORS = { chat_closed: 'Canal fermé : il faut un tanker en orbite entre vous', chat_rate: 'Doucement : 6 messages par minute au plus',
  chat_quota: '300 messages par jour, c\'est le maximum', chat_too_long: '280 caractères au plus', chat_empty: 'Message vide',
  target_unknown: 'Ce commandant n\'est plus au registre', target_self: 'Impossible de s\'écrire à soi-même', no_world: 'Ton monde n\'est pas encore au registre' };

// ─── écran ───
var _emb = { address: null, sig: '', busy: false, hero: null, heroKey: '' };
(function mpEmbassyScreen() {
  if (document.getElementById('scr-embassy')) return;
  const st = document.createElement('style');
  st.textContent = `
#scr-embassy.ud-hero > .stars, #scr-embassy.ud-hero > .glow { display: none; }
#scr-embassy:not(.ud-hero) > .u3d-hero, #scr-embassy:not(.ud-hero) .ud-hero-space { display: none; }
#scr-embassy.ud-hero .screen-scroll { position: relative; z-index: 2; touch-action: pan-y; }
#scr-embassy.ud-ship .ud-hero-space { touch-action: none; }
#scr-embassy .head { text-shadow: 0 2px 12px rgba(0,0,0,.8); }
#emb-hero .u3d-canvas { touch-action: none; }
.emb-card { margin: 0 16px 12px; padding: 14px; border-radius: 12px; border: 1px solid rgba(95,255,232,.25); background: rgba(8,12,18,.86); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.emb-label { font-size: 10px; color: var(--mut); letter-spacing: .14em; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.emb-label .dot { width: 7px; height: 7px; border-radius: 50%; background: #5fcc8a; box-shadow: 0 0 8px #5fcc8a; }
.emb-label .dot.off { background: #6a6f78; box-shadow: none; }
#emb-msgs { display: flex; flex-direction: column; gap: 6px; max-height: 46vh; overflow-y: auto; padding: 2px 0 4px; -webkit-overflow-scrolling: touch; }
.emb-msg { max-width: 82%; padding: 8px 11px; border-radius: 12px; font-size: 13px; line-height: 1.42; white-space: pre-wrap; word-break: break-word; }
.emb-msg.me { align-self: flex-end; background: rgba(95,255,232,.12); border: 1px solid rgba(95,255,232,.38); color: #e6fffb; border-bottom-right-radius: 4px; }
.emb-msg.them { align-self: flex-start; background: rgba(255,200,100,.08); border: 1px solid rgba(255,200,100,.32); color: #fff1d8; border-bottom-left-radius: 4px; }
.emb-msg .t { display: block; font-size: 9px; color: rgba(200,210,220,.55); margin-top: 3px; letter-spacing: .04em; }
.emb-msg.me .t { text-align: right; }
.emb-empty { font-size: 12px; color: var(--mut); font-style: italic; text-align: center; padding: 12px 6px; line-height: 1.5; }
.emb-day { align-self: center; font-size: 9px; color: var(--mut); letter-spacing: .14em; text-transform: uppercase; margin: 6px 0 2px; }
#emb-form { display: flex; gap: 8px; align-items: flex-end; margin-top: 10px; }
#emb-input { flex: 1; min-height: 40px; max-height: 110px; resize: none; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(95,255,232,.3); background: rgba(0,0,0,.35);
  color: #eef4f8; font: inherit; font-size: 14px; line-height: 1.35; outline: none; }
#emb-input:focus { border-color: rgba(95,255,232,.7); }
#emb-input:disabled { opacity: .45; }
#emb-send { flex-shrink: 0; height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(95,255,232,.55); background: rgba(95,255,232,.12); color: #5fffe8;
  font: inherit; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; }
#emb-send:disabled { opacity: .4; cursor: default; }
#emb-count { font-size: 9px; color: var(--mut); text-align: right; margin-top: 4px; letter-spacing: .06em; }
.emb-actions { display: flex; gap: 8px; margin: 0 16px 12px; }`;
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'scr-embassy'; el.className = 'screen hidden';
  el.innerHTML = `<div class="stars"></div><div class="glow"></div>
    <div class="screen-scroll">
      <header class="head"><h1>AMBASSADE</h1><div class="meta" id="emb-meta"></div></header>
      <div class="emb-card" id="emb-status"></div>
      <div class="emb-card" id="emb-chat">
        <div class="emb-label"><span class="dot" id="emb-dot"></span><span id="emb-chan">Canal</span></div>
        <div id="emb-msgs"></div>
        <div id="emb-form"><textarea id="emb-input" rows="1" maxlength="280" placeholder="Écrire…"></textarea><button id="emb-send">Envoyer</button></div>
        <div id="emb-count"></div>
      </div>
      <div class="emb-actions" id="emb-actions"></div>
      <div style="height:16px"></div>
    </div>
    <footer class="actions"><button class="back" onclick="goBack()">← RETOUR</button></footer>`;
  document.body.appendChild(el);
  const input = el.querySelector('#emb-input'), send = el.querySelector('#emb-send');
  const count = () => { const n = input.value.length; el.querySelector('#emb-count').textContent = n > 200 ? `${n} / 280` : ''; input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; };
  input.addEventListener('input', count);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); mpEmbassySend(); } });
  send.addEventListener('click', () => mpEmbassySend());
  // quitter l'écran : la 3D est libérée, la relève s'arrête
  new MutationObserver(() => { if (el.classList.contains('hidden')) mpEmbassyUnmount(); }).observe(el, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (_emb.address && !el.classList.contains('hidden') && document.visibilityState !== 'hidden') mpEmbassyLoadThread(); }, 4000);
})();

// PIRATERIE_1210 — balises & piraterie entre commandants (GDD starbyte_balises_piratage.md : P1 réel, P5-P7)
var MP_PIRACY_ERRORS = {
  ally: 'C\'est le convoi d\'un membre de ton alliance',   // PATCH_2110_ALLIANCES
  no_world: 'Ton monde n\'est pas encore au registre',
  convoy_gone: 'Le convoi est sorti de la zone de ta balise',
  no_ambush: 'Aucune de tes flottes n\'est en embuscade sur ce système',
  no_beacon: 'Il faut une balise posée sur ce système',
  fleet_unknown: 'Le registre ne connaît pas encore cette flotte : réessaie dans quelques secondes',   // ANTITRICHE_0811
  pact_active: 'Pacte de non-agression avec ce commandant : pas d\'abordage',
  combat_pending: 'Abordage en cours : attends son issue',
  ambush_unknown: 'Cette embuscade n\'existe plus',
  ambush_invalid: 'Flotte illisible pour le registre',
  convoy_rate: 'Trop de convois aujourd\'hui',
  target_shielded: 'Commandant débutant (72 h) : ses convois sont protégés',
  target_too_weak: 'Ce commandant est trop faible pour toi : aucune gloire à le piller',
  target_other_season: 'Ce convoi appartient à une autre saison',
  target_peaceful: 'Commandant pacifique : ses convois sont intouchables',   // PATCH_2410_PACIFIQUE
};
// ── Convois : chaque départ de tanker est inscrit au registre (aller, retour du dock, ambassade) ──
var _mpConvoyBusy = new Set();
// les postes des autres commandants que je vois (balise ou poste dans le même système)
var _mpPostsAt = 0;
setInterval(() => { if (document.visibilityState !== 'hidden') mpPostsPoll(); }, 15000);

// ── Rapports de piraterie (pirate et victime) ──
var MP_PIRACY_TYPES = {
  robbed_ok:      { title: 'CONVOI DÉVALISÉ',     list: 'Convoi dévalisé',      sub: 'butin dans la cale de ta flotte', color: '#ffc864' },
  robbed_fail:    { title: 'ABORDAGE REPOUSSÉ',   list: 'Abordage repoussé',    sub: 'le convoi s\'est défendu', color: '#ff8a8a' },
  robbed_evaded:  { title: 'CONVOI ÉCHAPPÉ',      list: 'Convoi échappé',       sub: 'l\'équipage connaissait la route', color: '#cececd' },
  robbed_empty:   { title: 'ABORDAGE SANS BUTIN', list: 'Abordage sans butin',  sub: 'plus de place en cale', color: '#cececd' },
  spied:          { title: 'ROUTE ESPIONNÉE',     list: 'Route espionnée',      sub: 'il ne sait pas que tu sais', color: '#a370ff' },
  convoy_robbed:  { title: 'CONVOI INTERCEPTÉ',   list: 'Convoi intercepté',    sub: 'cale pillée', color: '#ff8a8a' },
  convoy_defended:{ title: 'EMBUSCADE REPOUSSÉE', list: 'Embuscade repoussée',  sub: 'ton tanker a tenu', color: '#7ed080' },
  convoy_evaded:  { title: 'EMBUSCADE SEMÉE',     list: 'Embuscade semée',      sub: 'ta route maîtrisée a payé', color: '#7ed080' },
  convoy_boarded: { title: 'CONVOI ARRAISONNÉ',   list: 'Convoi arraisonné',    sub: 'rien n\'a été pris', color: '#ffc864' },
};

// ── Embuscade : une flotte postée à l'avance sur le système d'une de ses balises ──
var _mpAmbushBusy = new Set();

// ── Fiche d'interception (depuis un rapport de balise) ──
var _mpInterceptOpen = null;

// PROFIL_1310 — Réglages : pseudo et nom de planète, une seule modification chacun
var MP_RENAME_ERRORS = {
  pseudo_locked: 'Ton pseudo a déjà été modifié une fois',
  planet_locked: 'Le nom de ta planète a déjà été modifié une fois',
  pseudo_taken: 'Ce pseudo est déjà pris',
  pseudo_invalid: 'Pseudo : 3 à 20 caractères (lettres, chiffres, espace, . _ \' -)',
  planet_invalid: 'Nom de planète : 2 à 40 caractères',
  no_world: 'Ton monde n\'est pas encore au registre',
};
var _sbRenaming = false;
// Roue dentée des Réglages : une vraie roue dentée, bien visible ; pastille rouge tant qu'aucun email n'est lié
var SB_GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
(function () {
  try {
    const st = document.createElement('style');
    st.textContent = `body .w-gear { width:38px !important; height:38px !important; padding:7px !important; color:#e6f0ff !important;
        background:rgba(95,168,232,.14) !important; border:1px solid rgba(95,168,232,.45) !important; border-radius:50% !important; position:relative; }
      body .w-gear svg { width:100%; height:100%; display:block; }
      body.sb-unlinked .w-gear { border-color:rgba(255,80,64,.7) !important; }
      body.sb-unlinked .w-gear::after { content:''; position:absolute; top:-1px; right:-1px; width:10px; height:10px; border-radius:50%;
        background:#ff4f40; box-shadow:0 0 0 2px #05080c, 0 0 8px rgba(255,79,64,.8); }`;
    document.head.appendChild(st);
  } catch (e) {}
  const swap = () => { const g = document.querySelector('.w-gear'); if (g && g.dataset.sbGear !== '1') { g.dataset.sbGear = '1'; g.innerHTML = SB_GEAR_SVG; } };
  setInterval(swap, 2000);
  setTimeout(swap, 300);
})();

// ═══ CLOCHE_1910 — Centre de notifications : rapports + événements multijoueur ═══
// Retour testeur 19/10 : une cloche qui liste tout, à l'accueil (COMMANDEMENT) et discrète à côté des Réglages.
var SB_BELL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
(function () {
  try {
    const st = document.createElement('style');
    st.textContent = `.sb-bell { width:38px; height:38px; padding:8px; color:#e6f0ff; background:rgba(95,168,232,.14); border:1px solid rgba(95,168,232,.45);
        border-radius:50%; position:relative; cursor:pointer; flex:0 0 auto; -webkit-tap-highlight-color:transparent; }
      .sb-bell svg { width:100%; height:100%; display:block; }
      .sb-bell-n { position:absolute; top:-4px; right:-5px; min-width:17px; height:17px; padding:0 4px; border-radius:9px; background:#ff4f40; color:#fff;
        font:700 10px/17px -apple-system,system-ui,sans-serif; text-align:center; box-shadow:0 0 0 2px #05080c; }
      .w-gear + .sb-bell, .sb-bell + .w-gear { margin-left:6px; }
      #scr-dashboard > .sb-bell { position:absolute; z-index:20; top:calc(var(--sai) + 11px); right:62px; }
      #scr-dashboard header.head { padding-top:calc(var(--sai) + 62px); }
      #sb-notif { position:fixed; inset:0; z-index:9000; }
      #sb-notif .sbn-bg { position:absolute; inset:0; background:rgba(2,4,8,.6); }
      #sb-notif .sbn-sheet { position:absolute; left:0; right:0; bottom:0; max-height:78vh; display:flex; flex-direction:column; background:#0a1018;
        border-top:1px solid rgba(95,168,232,.35); border-radius:16px 16px 0 0; padding-bottom:var(--sab, 0px); }
      #sb-notif .sbn-head { display:flex; align-items:center; gap:10px; padding:16px 16px 10px; border-bottom:1px solid rgba(255,255,255,.06); }
      #sb-notif .sbn-title { flex:1; font-weight:800; letter-spacing:.14em; font-size:13px; color:#e6f0ff; }
      #sb-notif .sbn-all { background:none; border:1px solid rgba(95,168,232,.45); color:#9cc8f0; border-radius:14px; padding:5px 10px; font-size:11px; }
      #sb-notif .sbn-x { background:none; border:0; color:#9aa6b4; font-size:24px; line-height:1; padding:0 4px; }
      #sb-notif .sbn-list { overflow-y:auto; -webkit-overflow-scrolling:touch; padding:4px 0 12px; }
      #sb-notif .sbn-it { display:flex; gap:10px; padding:11px 16px; border-bottom:1px solid rgba(255,255,255,.04); cursor:pointer; }
      #sb-notif .sbn-it:active { background:rgba(95,168,232,.08); }
      #sb-notif .sbn-dot { width:8px; height:8px; border-radius:50%; margin-top:5px; flex:0 0 8px; }
      #sb-notif .sbn-b { flex:1; min-width:0; }
      #sb-notif .sbn-tag { font-size:10px; letter-spacing:.14em; font-weight:700; display:flex; justify-content:space-between; gap:8px; }
      #sb-notif .sbn-tag span { color:#6f7c8c; letter-spacing:.04em; font-weight:500; }
      #sb-notif .sbn-t { font-size:13px; color:#c9d4e0; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #sb-notif .sbn-it.u .sbn-t { color:#fff; font-weight:600; }
      #sb-notif .sbn-s { font-size:11px; color:#7d8a99; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #sb-notif .sbn-empty { padding:30px 16px; text-align:center; color:#7d8a99; font-size:12px; }`;
    document.head.appendChild(st);
  } catch (e) {}
  const mk = () => { const b = document.createElement('button'); b.className = 'sb-bell'; b.type = 'button'; b.setAttribute('aria-label', 'Notifications');
    b.innerHTML = SB_BELL_SVG; b.addEventListener('click', (e) => { e.stopPropagation(); sbNotifOpen(); }); return b; };
  const place = () => {
    try {
      const g = document.querySelector('.w-gear');
      if (g && g.parentNode && !g.parentNode.querySelector('.sb-bell')) g.parentNode.insertBefore(mk(), g);
      const d = document.getElementById('scr-dashboard');
      if (d && !d.querySelector(':scope > .sb-bell')) d.appendChild(mk());
      const x = d && d.querySelector('.w-screen-x'), bb = d && d.querySelector(':scope > .sb-bell');
      if (x && bb && x.offsetHeight) { const xr = x.getBoundingClientRect(), dr = d.getBoundingClientRect();
        bb.style.top = (xr.top - dr.top + (xr.height - 38) / 2) + 'px'; bb.style.right = (dr.right - xr.left + 8) + 'px'; }
      sbNotifRefresh();
    } catch (e) {}
  };
  setInterval(place, 2000);
  setTimeout(place, 300);
})();

// Marchés possibles (messages prédéfinis, D4)
var MP_DEAL_PRESETS = {
  t1: { kind: 'trade', offer: { metal: 300 }, ask: { energie: 150 }, msg: 'Du métal propre contre de l\'énergie. Pas de questions.' },
  t2: { kind: 'trade', offer: { energie: 200 }, ask: { cristal: 80 }, msg: 'J\'ai du jus en trop. Il me faut du cristal.' },
  t3: { kind: 'trade', offer: { cristal: 100 }, ask: { metal: 300 }, msg: 'Cristal taillé contre métal brut. Marché honnête.' },
  addr: { kind: 'info', offer: { address: true }, ask: {}, msg: 'Voilà où me trouver. Passe en ami… ou pas.' },
};
var MP_BAR_LEAD_COST = 150;
setInterval(() => { try { _mpPruneLedger(); } catch (e) {} }, 5 * 60 * 1000);

// REVIEW_1110 — Règlement d'un marché dans MA partie, idempotent même après reset / autre appareil :
// - les montants viennent du modèle prédéfini (jamais du serveur tel quel) ;
// - un marché déjà marqué « appliqué » au registre n'est jamais repayé ;
// - l'expiration se juge au registre (statut), avec 10 min de marge sur l'horloge locale.
var MP_DEAL_GRACE_MS = 10 * 60 * 1000;
var _mpDealBusy = new Set();

// Fiche d'un convoi de commandant (même gabarit que la fiche PNJ)
var _mpOpenConvoyId = null;

/* ═══════════ NAV ═══════════ */

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION — Stack pour gérer les retours intelligemment
   ═══════════════════════════════════════════════════════════════
   À chaque goto(), l'écran courant est poussé dans la stack.
   goBack() retourne à l'écran précédent (et le retire de la stack).
   Les écrans "hub" (dashboard, planet) réinitialisent la stack
   pour éviter qu'elle grossisse sans fin.
   ═══════════════════════════════════════════════════════════════ */
let navStack = [];
const NAV_HUBS = ['dashboard', 'planet', 'fleet'];
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('screen-scroll')) updateHeroScrim(t);
}, true);

/* ═══════════════════════════════════════════════════════════════
   COMPOSITION DE FLOTTE (passe 3.2)
   ═══════════════════════════════════════════════════════════════
   Le joueur compose une flotte nommée (ex : "Punisher 1") en
   sélectionnant des vaisseaux et soldats parmi ses disponibles.
   La flotte préparée vit dans G.fleet.prepared en attendant son
   envoi (passe 3.3). Les vaisseaux utilisés sont RÉSERVÉS et ne
   sont plus dispo pour une autre composition tant que la flotte
   n'est pas dissoute.
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════
// FAUX ADVERSAIRES — passe 3.3 (Z4-quinquies GDD)
// ═══════════════════════════════════════════════════════════════
// Statiques pour test sans backend. Disparaîtront en passe 5.x (vraies données joueurs).
//
// distanceMult : multiplicateur de coût carburant
//   ×1 = cible proche, ×3 = moyenne, ×5 = lointaine
/* ═══════════════════════════════════════════════════════════════
   PASSE 3.4 — COMBAT ASYNCHRONE & HÉROS NOMMÉS (Z5-bis GDD)
   ═══════════════════════════════════════════════════════════════
   Le combat se résout côté serveur fictif quand la flotte rentre.
   3 phases conditionnelles : orbital (obligatoire) → débarquement
   (si soldats) → pillage (si Tankers). Aléatoire borné ±15%.
   Pertes asymétriques (doctrine Z3). Héros nommés par type de
   vaisseau (1 à 3 par flotte).
   ═══════════════════════════════════════════════════════════════ */

// ─── Constants de combat (équilibrage en passe 3.6) ───
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

// ─── Pool de noms de héros par rôle (mix culturel cosmopolite) ───
// Cf. GDD 04_combat.md, section "Héros nommés light"
const HERO_NAMES = {
  // CAPITAINES CUIRASSÉS — ton militaire dur, presence imposante
  cuirasse: [
    'Herman le Brutal', 'Vaena Korovac', 'Marcus Drell', 'Yelena Verstal',
    'Tarn le Sourd', 'Ulysse Voss', 'Capitaine Drakos', 'Mira Solenne',
    'Amiral Castorp', 'Vincenza Aoth', 'Otto le Persévérant', 'Iskander Magh',
    'Lucienne Vaal', 'Branko Zarev', 'Capitaine Hadrian', 'Kossuth la Hache',
    'Eleonor Vassek', 'Dorian Pelevin', 'Théa Tomic', 'Major Sterner',
    'Aïda Ravensk', 'Wolfgang Krell', 'Capitaine Solanke', 'Néva Drozdov',
    'Raïner Holmberg', 'Capitaine Toranaga', 'Karina Bek', 'Yusuf le Massif',
    'Klaus Vorenheim', 'Magda Stenovskaya',
  ],
  // AMIRAUX FRÉGATES — ton tactique vif, mobile, agile
  fregate: [
    'Léna "Comète" Asari', 'Yannick Vorl', 'Selene Drasm', 'Tom "Lance" Mehri',
    'Inko Sterlal', 'Yuvi la Rapide', 'Pierre Velkan', 'Klara "Vif-Argent"',
    'Marisa Tovic', 'Daud "Flèche" Karim', 'Naël Briansk', 'Capitaine Sasha Vey',
    'Renko Talmadge', 'Édith Verrane', 'Bram "Éclat" Hossa', 'Mira "Comète" Drevsk',
    'Tao Linn', 'Yssin Korval', 'Anouk "Trait" Belmont', 'Capitaine Lorca',
    'Petra Halvenir', 'Otis Mahane', 'Lou "Bourrasque" Astrev', 'Hélion Vask',
    'Yara "Flamme" Onestad', 'Pavel Mikhin', 'Tania Drestul', 'Esther "Lame" Vorn',
    'Capitaine Zorin', 'Aleksei "Foudre" Bran',
  ],
  // CHEFS LOGISTIQUES TANKERS — ton pragmatique, calculateur
  tanker: [
    'Bertrand Voll', 'Suko Tasnal', 'Émile Dorenne', 'Marta Pellican',
    'Hervé le Comptable', 'Nada Kerski', 'Olek Stom', 'Yannis le Coude',
    'Théodora Vassal', 'Aldric Mehdi', 'Capitaine Lonsdale', 'Vesna Kovalik',
    'Maître Konstantin', 'Riika Halme', 'Sergent Boorman', 'Maïa Stelnik',
    'Hervé Drausek', 'Cornelius Bagh', 'Yulia Brastev', 'Pavel "Le Sac" Voronin',
    'Nestor Karim', 'Capitaine Hesper', 'Émilia Vondra', 'Jonas "Le Comptable" Berg',
    'Tasha Olmek', 'Boris Dragunsk', 'Mathilde Verrane', 'Capitaine Vesselov',
    'Ari "Marchand" Toth', 'Tomas le Sage',
  ],
};

// ─── Couleurs et labels par rôle de héros ───
const HERO_ROLES = {
  cuirasse: { label: 'Capitaine cuirassés', short: 'Cuirassés', color: 'var(--red)' },
  fregate:  { label: 'Amiral frégates',     short: 'Frégates',  color: 'var(--blue-light)' },
  tanker:   { label: 'Chef logistique',     short: 'Logistique', color: 'var(--amber)' },
};
