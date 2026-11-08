/* Starbyte — d03_legende_donnees.js
   Données, variables et instructions exécutées au chargement (ordre d'origine conservé).
   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.
   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */
'use strict';


// ═══════════════════════════════════════════════════════════════════════════
// LEGEND_RELIC_BANK — refondue v2 (1 objet par scénario, alignement v4)
// Chaque objet est un éclat du récit. Pas une description neutre.
// ═══════════════════════════════════════════════════════════════════════════
const LEGEND_RELIC_BANK = {
  caldris_01_bracelet: {
    id: 'caldris_01_bracelet',
    scenarioId: 'caldris_01',
    civilization: 'caldris',
    name: 'Bracelet d\'embarquement enfant',
    publicName: 'Bande plastique avec inscription',
    rarity: 'rare',
    description: 'Bracelet en polymère léger, taille six ans.\n\nInscription gravée à la main : "Mira O. / Cargo 11 / cargo annexe à masse négligeable."\n\nLa formule "masse négligeable" n\'existe dans aucun manuel administratif de référence. Elle apparaît uniquement dans les manifestes du convoi, et uniquement pour désigner des enfants.',
    sourceTypes: ['cargo'],
  },

  caldris_04_mold: {
    id: 'caldris_04_mold',
    scenarioId: 'caldris_04',
    civilization: 'caldris',
    name: 'Moule à pain bricolé',
    publicName: 'Récipient métallique modifié',
    rarity: 'common',
    description: 'Moule à pain fabriqué à partir d\'une plaque de coursive cintrée à la main. Bord encore tranchant à un endroit — son fabricant s\'est sans doute coupé pendant la fabrication.\n\nL\'intérieur conserve des traces fossilisées d\'une fermentation longue. Quelqu\'un, à bord, avait appris à faire du pain.',
    sourceTypes: ['cargo'],
  },

  caldris_05_implant: {
    id: 'caldris_05_implant',
    scenarioId: 'caldris_05',
    civilization: 'caldris',
    name: 'Implant neuronal désactivé',
    publicName: 'Composant biomécanique ancien',
    rarity: 'rare',
    description: 'Implant neuronal de Caldris, retiré chirurgicalement mais non détruit. Le sceau de désactivation est intact — visuellement.\n\nL\'analyse de la matrice interne révèle pourtant des micro-traces d\'activité électrique cohérente avec un fonctionnement résiduel. L\'implant n\'aurait pas dû être capable de transmettre quoi que ce soit. Il transmettait.',
    sourceTypes: ['cargo', 'signal'],
  },

  caldris_07_notebook: {
    id: 'caldris_07_notebook',
    scenarioId: 'caldris_07',
    civilization: 'caldris',
    name: 'Carnet médical du Cargo 14',
    publicName: 'Carnet manuscrit datant',
    rarity: 'rare',
    description: 'Carnet médical à reliure cousue. La première moitié est rédigée d\'une écriture appliquée, professionnelle.\n\nÀ partir de la page 47, l\'écriture change. Les notes deviennent plus courtes. Les diagnostics disparaissent. Les dernières pages ne contiennent qu\'une seule phrase, répétée :\n\n"Je ne me souviens pas d\'avoir signé. Mais c\'est bien ma main."',
    sourceTypes: ['epave', 'cargo'],
  },

  caldris_06_tract: {
    id: 'caldris_06_tract',
    scenarioId: 'caldris_06',
    civilization: 'caldris',
    name: 'Tract anonyme · original',
    publicName: 'Document papier · encre noire',
    rarity: 'rare',
    description: 'Feuille pliée en quatre. Papier de coursive, qualité administrative basse. Encre noire, écriture manuscrite ferme.\n\nUne seule phrase :\n"Elle ne nous suit pas. Elle nous attend partout où nous serions assez stupides pour la fabriquer à nouveau."\n\nLes survivants désigneront son auteur par un mot que nous n\'arrivons plus à traduire — un mot qui signifiait à la fois ingénieur, prêcheur, et patient.',
    sourceTypes: ['cargo', 'sonde_ancienne'],
  },

  caldris_03_insignia: {
    id: 'caldris_03_insignia',
    scenarioId: 'caldris_03',
    civilization: 'caldris',
    name: 'Insigne du commandant déchu',
    publicName: 'Médaille militaire ancienne',
    rarity: 'mythic',
    description: 'Insigne de commandement du Morn-Khal. Métal patiné, alliage non répertorié dans nos chartes actuelles.\n\nIl a été retrouvé quarante millénaires plus tard, caché à l\'intérieur d\'une cloison de la passerelle. Quelqu\'un l\'avait ramassé sur la table — où le commandant l\'avait posé en refusant l\'ordre de tirer sur le Cargo 22 — et glissé dans une poche avant d\'être arrêté dans le couloir.\n\nUne rayure profonde marque le revers, comme s\'il avait été raclé contre quelque chose. Ou contre soi.',
    sourceTypes: ['debris', 'epave'],
  },

  caldris_02_notebook: {
    id: 'caldris_02_notebook',
    scenarioId: 'caldris_02',
    civilization: 'caldris',
    name: 'Cahier d\'écolier · Cargo 22',
    publicName: 'Cahier scolaire ancien',
    rarity: 'mythic',
    description: 'Cahier d\'écolier à spirales, taille standard pour enfant. Couverture bleue défraîchie. Nom calligraphié en haut à droite : "Ilona K. — classe 3".\n\nLa dernière page utilisée porte la date du 4017e jour. L\'écriture est appliquée, à l\'encre violette : "Aujourd\'hui on va visiter les filtres à eau. Maman dit qu\'il faut bien écouter la maîtresse."\n\nLes pages suivantes sont blanches.',
    sourceTypes: ['debris', 'epave'],
  },

  caldris_09_memory: {
    id: 'caldris_09_memory',
    scenarioId: 'caldris_09',
    civilization: 'caldris',
    name: 'Module de mémoire · Sonde du Compteur',
    publicName: 'Composant électronique daté',
    rarity: 'rare',
    description: 'Module de mémoire récupéré sur la sonde du Compteur. Capacité utile : six mille entrées. Capacité utilisée : six mille entrées.\n\nDe la première à l\'avant-dernière entrée, la valeur enregistrée est la même :\n"47."\n\nLa dernière entrée n\'est pas un nombre.\n"Ils m\'ont demandé d\'arrêter de compter."\n\nIls : pronom pluriel. Identité non déterminée.',
    sourceTypes: ['sonde_ancienne', 'signal'],
  },

  caldris_08_arch_fragment: {
    id: 'caldris_08_arch_fragment',
    scenarioId: 'caldris_08',
    civilization: 'caldris',
    name: 'Fragment de l\'arche',
    publicName: 'Pièce métallique structurelle datée',
    rarity: 'mythic',
    description: 'Fragment de poutre porteuse découpé dans une coque de cargo. Numéro de série encore visible : "CARGO 22 / SECTION CIVILE / BLOC 4F".\n\nLes soudures qui maintenaient ce fragment dans l\'arche ne correspondent à aucune technique humaine connue. Elles ne fondent pas le métal. Elles le replient.\n\nLe fragment vibre légèrement quand on le tient à la main. Pas assez pour être entendu. Assez pour être senti dans la mâchoire.',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
  },

  caldris_10_plaque: {
    id: 'caldris_10_plaque',
    scenarioId: 'caldris_10',
    civilization: 'caldris',
    name: 'Plaque · "Nous étions 47"',
    publicName: 'Plaque commémorative non classée',
    rarity: 'mythic',
    description: 'Fragment de cloison civile. Au centre, gravée au stylet thermique : "Nous étions 47."\n\nLes marges contiennent la même phrase, plus petite, répétée dix-huit fois — par dix-huit mains différentes. Comme si les survivants, à mesure qu\'ils mouraient, avaient chacun gravé la phrase une dernière fois avant de partir.\n\nLa dernière inscription est la plus tremblante. Elle dit : "Nous étions."',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne'],
    motif: 'nous_etions_47',
  },


  // ═══════════════════════════════════════════════════════════════
  // LUMEN — objets
  // ═══════════════════════════════════════════════════════════════

  lumen_01_radio: {
    id: 'lumen_01_radio',
    scenarioId: 'lumen_01',
    civilization: 'lumen',
    name: 'Radio de l\'expédition Sera-7',
    publicName: 'Émetteur portable de série',
    rarity: 'rare',
    description: 'Émetteur radio standard d\'une expédition de surface. La batterie est encore chargée à 89%. Le micro fonctionne. Les circuits sont intacts.\n\nLa radio a été coupée manuellement. Le bouton d\'arrêt est usé d\'une seule pression — quelqu\'un l\'a poussé une fois, et n\'est pas revenu.\n\nQuand on réactive l\'appareil et qu\'on appelle Sera-7, personne ne répond. Mais quelqu\'un, parfois, écoute.',
    sourceTypes: ['cargo', 'sonde_ancienne'],
  },

  lumen_02_flower: {
    id: 'lumen_02_flower',
    scenarioId: 'lumen_02',
    civilization: 'lumen',
    name: 'Fleur immortelle',
    publicName: 'Spécimen botanique non répertorié',
    rarity: 'mythic',
    description: 'Fleur récupérée à la périphérie d\'un jardin orbital. Pétales de couleur changeante selon l\'heure. Tige flexible, encore humide.\n\nL\'analyse génétique n\'a rien donné de comparable. La fleur ne fane pas. Elle n\'a pas besoin d\'eau. Elle n\'a pas besoin de lumière. Elle continue à fleurir dans notre coffre-fort, à six mètres sous terre, depuis quatorze ans.\n\nChaque matin, à l\'aube exacte du fuseau horaire de Lumen-Prime, elle s\'ouvre un peu plus.',
    sourceTypes: ['cargo', 'anomalie'],
  },

  lumen_03_book: {
    id: 'lumen_03_book',
    scenarioId: 'lumen_03',
    civilization: 'lumen',
    name: 'Livre ouvert à la page 47',
    publicName: 'Volume papier ancien',
    rarity: 'rare',
    description: 'Livre relié, taille standard, papier de qualité supérieure. Posé ouvert sur la table d\'une cuisine, page 47 visible.\n\nLe livre est un recueil de poésie. La page 47 contient un seul poème, intitulé "Avant".\n\nIl a été lu jusqu\'à la moitié de la page. La trace d\'un doigt — un peu humide, peut-être un peu sucré — marque l\'endroit où la lecture s\'est arrêtée.\n\nLa personne qui lisait n\'est pas revenue finir le poème.',
    sourceTypes: ['cargo', 'epave'],
  },

  lumen_04_certificate: {
    id: 'lumen_04_certificate',
    scenarioId: 'lumen_04',
    civilization: 'lumen',
    name: 'Certificat d\'Ascension',
    publicName: 'Document administratif officiel',
    rarity: 'rare',
    description: 'Document officiel en parchemin de synthèse, sceau du Conseil de Lumen.\n\nTexte traduit :\n"Le citoyen Veron Asthel a été enregistré comme participant volontaire au Programme de Paix Définitive. Date d\'Ascension : 7e jour, 14e mois.\nNous lui souhaitons un beau voyage."\n\nDans la marge inférieure, à la main, ajouté ensuite :\n"Je ne sais pas où je vais. Mais je vais."',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
  },

  lumen_05_helmet: {
    id: 'lumen_05_helmet',
    scenarioId: 'lumen_05',
    civilization: 'lumen',
    name: 'Casque d\'explorateur Selthar',
    publicName: 'Équipement d\'expédition daté',
    rarity: 'mythic',
    description: 'Casque d\'exploration de la Lieutenant Kira Selthar, disparue il y a 28 ans dans Lumen.\n\nLes systèmes intérieurs sont intacts. Le journal de bord embarqué contient ses sept dernières heures d\'enregistrement audio.\n\nLes six premières heures sont normales. La septième est différente. La voix de Selthar y est plus lente, plus douce. À la fin de la septième heure, elle prononce une seule phrase :\n\n"Je vais juste m\'asseoir un instant. Je vous rappelle dans cinq minutes."\n\nLes systèmes audio ont continué à enregistrer pendant 28 ans. Personne n\'a jamais rien dit ensuite. On entend seulement, en arrière-plan, le bruit régulier d\'un bras articulé qui arrose des fleurs.',
    sourceTypes: ['epave', 'signal'],
  },

  lumen_06_plate: {
    id: 'lumen_06_plate',
    scenarioId: 'lumen_06',
    civilization: 'lumen',
    name: 'Plateau de cantine · marqué "Theron"',
    publicName: 'Récipient métallique gravé',
    rarity: 'common',
    description: 'Plateau de cantine standard, métal léger, gravure : "Theron — service du soir, place 412".\n\nLe plateau a été utilisé environ 7300 fois. Il est strié des marques d\'usure d\'un usage constant.\n\nTheron n\'est mort depuis plus de douze mille ans. Les machines ont continué à préparer son plat préféré chaque soir, sans interruption, et à le porter à sa place. Le compost ramasse ce qui n\'a pas été mangé.\n\nLe plateau attend toujours.',
    sourceTypes: ['cargo', 'debris'],
  },

  lumen_07_letter: {
    id: 'lumen_07_letter',
    scenarioId: 'lumen_07',
    civilization: 'lumen',
    name: 'Lettre à Velna',
    publicName: 'Document manuscrit personnel',
    rarity: 'mythic',
    description: 'Lettre manuscrite laissée sur un bureau de la cité Erael, encre noire, papier épais.\n\nElle commence par "Ma chère Velna" et finit par "Je t\'aime". Entre les deux, l\'auteur explique qu\'il se rend à la Cathédrale le matin suivant, qu\'il a longtemps hésité, et qu\'il rappelle à Velna d\'arroser les ipoms du salon.\n\nLa lettre n\'a jamais été postée. Velna n\'a jamais existé dans les archives civiles. L\'auteur n\'est pas identifiable. Les ipoms du salon sont toujours arrosés tous les sept jours.\n\nQuelqu\'un, à un moment, a aimé quelqu\'un. C\'est tout ce que nous savons.',
    sourceTypes: ['cargo', 'sonde_ancienne'],
  },

  lumen_08_medallion: {
    id: 'lumen_08_medallion',
    scenarioId: 'lumen_08',
    civilization: 'lumen',
    name: 'Médaillon du marcheur',
    publicName: 'Bijou personnel daté',
    rarity: 'rare',
    description: 'Médaillon d\'argent porté autour du cou d\'un corps assis sur un banc de Lumen-Prime.\n\nIntérieur gravé :\n"Je suis allé là où ils ont dit qu\'il fallait aller.\nJe ne sais pas si je reviendrai.\nSi je ne reviens pas, sache que je n\'ai pas eu peur."\n\nLe métal a été manipulé souvent. La chaîne est usée à l\'endroit où le porteur avait l\'habitude de la toucher.\n\nL\'homme est mort serein, face à un coucher de soleil qui ne se couche jamais vraiment.',
    sourceTypes: ['cargo', 'epave', 'anomalie'],
  },

  lumen_09_shard: {
    id: 'lumen_09_shard',
    scenarioId: 'lumen_09',
    civilization: 'lumen',
    name: 'Éclat de la Cathédrale-Soleil',
    publicName: 'Fragment minéral chaud',
    rarity: 'mythic',
    description: 'Éclat récupéré à 47 mètres de la Cathédrale-Soleil, à la limite de la zone que les sondes peuvent encore approcher.\n\nMatière : non identifiée. Densité incohérente avec sa masse. Émission thermique constante, mesurée à 47°C en surface, depuis sa récupération il y a vingt-deux ans.\n\nL\'éclat ne refroidit pas. Il ne chauffe rien autour de lui. Il maintient sa température comme un être vivant maintiendrait la sienne.\n\nQuand on l\'approche d\'une fleur immortelle, les pétales s\'ouvrent plus vite.',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
  },

  lumen_10_plaque: {
    id: 'lumen_10_plaque',
    scenarioId: 'lumen_10',
    civilization: 'lumen',
    name: 'Plaque "La paix définitive a été obtenue"',
    publicName: 'Plaque commémorative officielle',
    rarity: 'mythic',
    description: 'Plaque d\'or et de verre blanc, format administratif. La gravure est nette, profonde, ancienne :\n\n"La paix définitive a été obtenue."\n\nAucune date. Aucun signataire. Aucun contexte.\n\nDes plaques identiques ornent les frontons de toutes les institutions publiques de Lumen — des écoles aux maternités, des prisons aux observatoires. Elles sont nettoyées tous les sept jours par des bras articulés.\n\nLa plaque vibre légèrement à la même fréquence que les fleurs immortelles. Personne ne sait pourquoi.',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne'],
    motif: 'paix_definitive',
  },

  // ═══════════════════════════════════════════════════════════════
  // WERATH — objets
  // ═══════════════════════════════════════════════════════════════

  werath_01_debris: {
    id: 'werath_01_debris',
    scenarioId: 'werath_01',
    civilization: 'werath',
    name: 'Fragment de l\'expédition Veldris-1',
    publicName: 'Débris de coque carbonisée',
    rarity: 'rare',
    description: 'Fragment de coque d\'un des sept vaisseaux détruits par la salve werathienne lors de la première expédition.\n\nLe métal n\'est pas brûlé. Il n\'est pas fondu. Il est, par endroits, simplement absent — comme si la matière avait été retirée. La coupe est lisse, plus précise qu\'aucun laser connu.\n\nÀ l\'analyse, on ne retrouve pas les atomes manquants. Ils ne sont pas dispersés ailleurs. Ils ne sont nulle part.',
    sourceTypes: ['epave', 'debris'],
  },

  werath_02_radio: {
    id: 'werath_02_radio',
    scenarioId: 'werath_02',
    civilization: 'werath',
    name: 'Récepteur radio werathien',
    publicName: 'Émetteur militaire ancien',
    rarity: 'rare',
    description: 'Récepteur radio militaire werathien standard. Antennes intactes. Circuits inertes.\n\nQuand on le branche à une source d\'énergie connue, rien ne se passe. Quand on l\'approche à moins de six mètres d\'un autre récepteur werathien (les deux étant éteints), les deux émettent simultanément, pendant 1,4 seconde, un message identique :\n\n"Nous tenons."\n\nPuis ils s\'éteignent. Pour toujours. On ne peut pas le refaire avec les mêmes appareils.',
    sourceTypes: ['signal', 'sonde_ancienne'],
  },

  werath_03_panel: {
    id: 'werath_03_panel',
    scenarioId: 'werath_03',
    civilization: 'werath',
    name: 'Panneau de contrôle Werath',
    publicName: 'Composant tactique ancien',
    rarity: 'common',
    description: 'Panneau de contrôle d\'un système non-identifié d\'un cuirassé werathien moyen. Boutons, voyants, écrans intacts.\n\nLes inscriptions sont en langue werathienne. Aucune n\'a été traduite avec certitude.\n\nLe panneau a été démonté par 38 équipes d\'ingénieurs différentes en trois siècles. Aucune n\'a réussi à comprendre ce qu\'il contrôle. Tout est branché à tout, et tout est mort.',
    sourceTypes: ['cargo', 'epave'],
  },

  werath_04_round: {
    id: 'werath_04_round',
    scenarioId: 'werath_04',
    civilization: 'werath',
    name: 'Obus de Titan-classe',
    publicName: 'Munition militaire géante',
    rarity: 'mythic',
    description: 'Obus de tourelle principale d\'un Titan-classe Verkar-9. Diamètre : 14 mètres. Longueur : 47 mètres. Masse : 14200 tonnes.\n\nL\'obus est inerte. Probablement. Personne n\'a jamais osé le manipuler sans précautions extrêmes.\n\nUne analyse non-invasive révèle qu\'il contient une matière dont la signature gravitationnelle n\'est pas répertoriée. La théorie suggère que l\'impact d\'un tel obus pourrait creuser un cratère de plusieurs kilomètres. Personne ne souhaite vérifier expérimentalement.',
    sourceTypes: ['epave', 'debris', 'anomalie'],
  },

  werath_05_caisson_plate: {
    id: 'werath_05_caisson_plate',
    scenarioId: 'werath_05',
    civilization: 'werath',
    name: 'Plaque de caisson · Vekhren Mor',
    publicName: 'Identification militaire',
    rarity: 'rare',
    description: 'Plaque d\'identification arrachée d\'un caisson cryogénique werathien lors d\'une mission de récupération.\n\nGravure :\n"Garde-soldat Vekhren Mor. Cohorte 218. Inscrit pour ordre de réveil — code W-Final."\n\nLe code W-Final n\'a jamais été émis. Vekhren Mor est mort dans son caisson après une attente qui dépasse de loin la spécification de ses concepteurs. La plaque a été retirée avant la fermeture définitive de la chambre.\n\nElle est froide au toucher, même à température ambiante.',
    sourceTypes: ['cargo', 'epave'],
  },

  werath_06_patrol: {
    id: 'werath_06_patrol',
    scenarioId: 'werath_06',
    civilization: 'werath',
    name: 'Journal de patrouille · secteur 14-Nord',
    publicName: 'Registre militaire daté',
    rarity: 'common',
    description: 'Journal de bord d\'une patrouille orbitale werathienne, dernière entrée datée d\'il y a plus de deux cent mille ans.\n\nLa dernière inscription, à la main, signée par le chef de quart :\n"Patrouille du secteur 14-Nord. Aucun contact ennemi. Aucune anomalie. Relèves : zéro. Nous tenons."\n\nLes pages suivantes sont blanches. La patrouille continue toujours, exactement à l\'horaire prévu. Les pages restent blanches.\n\nLa reliure a été usée par le frottement des doigts de l\'officier qui tenait le carnet — comme s\'il avait, longtemps, attendu d\'avoir quelque chose à y écrire.',
    sourceTypes: ['signal', 'debris'],
  },

  werath_07_decree: {
    id: 'werath_07_decree',
    scenarioId: 'werath_07',
    civilization: 'werath',
    name: 'Décret du Haut-Conseil',
    publicName: 'Document administratif ancien',
    rarity: 'mythic',
    description: 'Document officiel werathien, sceau du Haut-Conseil. Parchemin synthétique daté d\'environ 600 ans avant le silence final.\n\nLe décret ordonne le retrait du nom de la civilisation adverse de tous les rapports militaires. Les paragraphes argumentaires sont longs. L\'argument central revient à : "Le détail de l\'adversaire ne sert plus à la victoire."\n\nDans la marge inférieure, ajouté à la main, par une écriture différente :\n"Mais qu\'est-ce qui sert encore à la victoire, si nous ne savons plus ce qu\'est la défaite ?"\n\nLa note manuscrite n\'est pas signée.',
    sourceTypes: ['cargo', 'sonde_ancienne'],
  },

  werath_08_hull_fragment: {
    id: 'werath_08_hull_fragment',
    scenarioId: 'werath_08',
    civilization: 'werath',
    name: 'Fragment de cuirassé · Tharos-IV',
    publicName: 'Débris militaire daté',
    rarity: 'rare',
    description: 'Fragment de coque récupéré aux marges du Champ de Bataille de Tharos-IV. Métal noir, presque mat, sans aucune réflexion lumineuse.\n\nLe fragment porte des traces de tirs — mais aussi, en surface, une inscription gravée à l\'outil, par un main werathienne, juste avant la fin :\n\n"Sasha, je n\'ai pas tenu ma promesse. Mais nous tenons."\n\nSasha n\'apparaît dans aucun registre civil werathien retrouvé. Probablement, Sasha n\'a jamais su que le fragment existait. Probablement, Sasha était déjà morte.',
    sourceTypes: ['epave', 'debris', 'anomalie'],
  },

  werath_09_button: {
    id: 'werath_09_button',
    scenarioId: 'werath_09',
    civilization: 'werath',
    name: 'Bouton du pupitre · arsenal -47',
    publicName: 'Interface mécanique simple',
    rarity: 'mythic',
    description: 'Bouton récupéré sur le pupitre de la salle scellée niveau -47 de l\'arsenal central. Métal poli, parfaitement neuf, jamais utilisé.\n\nL\'objet est techniquement banal. Une pression simple. Aucune inscription. Aucune indication.\n\nMais le bouton est connecté, par un câble qui descend, à une machine de 34 mètres dont personne ne connaît la fonction. Le câble est intact. Le circuit semble fonctionnel.\n\nNous l\'avons descellé. Nous ne savons pas si nous devons le presser. Aujourd\'hui, il est sous double-verrouillage dans nos archives.\n\nUn bouton qui n\'a jamais été pressé peut-il encore servir à quelque chose ? Personne ne veut le savoir.',
    sourceTypes: ['anomalie', 'sonde_ancienne'],
  },

  werath_10_plaque: {
    id: 'werath_10_plaque',
    scenarioId: 'werath_10',
    civilization: 'werath',
    name: 'Plaque "Nous tenons"',
    publicName: 'Plaque militaire commémorative',
    rarity: 'mythic',
    description: 'Plaque de métal noir, gravée dans le style militaire werathien. La phrase est gravée seule, sans ornement :\n\n"Nous tenons."\n\nDes plaques identiques équipent les bunkers, les cuirassés, les stations orbitales. Aucune n\'est datée. Aucune n\'est attribuée.\n\nQuand on rapproche deux plaques l\'une de l\'autre, à moins d\'un mètre, on perçoit une légère vibration — toujours à la même fréquence, basse, régulière. Comme si elles se reconnaissaient.\n\nLa fréquence correspond, à 0,03% près, à celle de la transmission radio werathienne qui répète, toutes les six heures depuis plus de deux cent mille ans, le même message.',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne'],
    motif: 'nous_tenons',
  },


  // ═══════════════════════════════════════════════════════════════
  // EREBUS — objets
  // ═══════════════════════════════════════════════════════════════

  erebus_01_dark_sample: {
    id: 'erebus_01_dark_sample',
    scenarioId: 'erebus_01',
    civilization: 'erebus',
    name: 'Échantillon de revêtement sombre',
    publicName: 'Fragment de surface non identifié',
    rarity: 'mythic',
    description: 'Fragment de revêtement absorbeur récupéré sur la surface d\'une planète assombrie éreboïenne, à l\'aide d\'un bras mécanique automatisé (les équipes humaines ayant refusé l\'opération).\n\nMatière : non identifiée. Densité standard, structure cristalline irrégulière. Indice de réflexion : 0,001 — la matière absorbe 99,9% de la lumière qui la touche, quelle que soit sa longueur d\'onde.\n\nChose étrange : la matière n\'émet aucune chaleur résiduelle. L\'énergie absorbée ne ressort pas. Elle ne va pas non plus quelque part de mesurable.\n\nElle disparaît, simplement. Comme tout chez Erebus.',
    sourceTypes: ['sonde_ancienne', 'anomalie'],
  },

  erebus_02_relay_plaque: {
    id: 'erebus_02_relay_plaque',
    scenarioId: 'erebus_02',
    civilization: 'erebus',
    name: 'Plaque de la dernière station',
    publicName: 'Plaque commémorative ancienne',
    rarity: 'rare',
    description: 'Plaque en métal sobre arrachée à la station orbitale D-S-5067-44 — celle qui a émis le dernier signal éreboïen. Gravée en langue éreboïenne, traduction nette :\n\n"Cette station a transmis le dernier message. Elle a été éteinte selon la volonté du Conseil. Elle est laissée intacte par respect. Qu\'aucune autre voix ne lui réponde."\n\nLa plaque a été retirée de la station par notre équipe. Nous avons hésité. Nous avons quand même pris. C\'est l\'une des rares décisions que je regrette, des années plus tard.',
    sourceTypes: ['signal', 'sonde_ancienne'],
  },

  erebus_03_buried_stone: {
    id: 'erebus_03_buried_stone',
    scenarioId: 'erebus_03',
    civilization: 'erebus',
    name: 'Pierre de couverture · D-E-4477',
    publicName: 'Bloc minéral compacté',
    rarity: 'common',
    description: 'Bloc de matière compactée prélevé dans la couche d\'enterrement d\'une cité éreboïenne, à 180 mètres sous la surface actuelle.\n\nComposition : terre, gravats, sédiments, soigneusement mélangés et tassés selon un protocole qui produit une densité parfaitement uniforme. Aucun défaut de compaction sur des kilomètres carrés.\n\nLes Erebus ont enterré leurs cités comme on coucherait délicatement un être qu\'on aime sous un drap. Sans heurt. Sans précipitation. Le travail a probablement duré des décennies.',
    sourceTypes: ['anomalie', 'epave'],
  },

  erebus_04_inner_key: {
    id: 'erebus_04_inner_key',
    scenarioId: 'erebus_04',
    civilization: 'erebus',
    name: 'Clé du verrou intérieur',
    publicName: 'Clé mécanique simple',
    rarity: 'mythic',
    description: 'Clé en alliage simple, retrouvée dans une poche d\'un corps éreboïen, derrière une Porte du Retrait. La clé correspond exactement au verrou intérieur d\'une porte scellée.\n\nLe porteur de cette clé a fermé la porte. Puis a gardé la clé sur lui, en marchant vers l\'intérieur, vers la salle où il s\'est assis. Comme s\'il voulait être absolument certain que personne, même en partant de l\'intérieur, ne puisse changer d\'avis.\n\nLa clé est encore tiède au toucher. Probablement notre imagination.',
    sourceTypes: ['epave', 'anomalie'],
  },

  erebus_05_council_seal: {
    id: 'erebus_05_council_seal',
    scenarioId: 'erebus_05',
    civilization: 'erebus',
    name: 'Sceau du Conseil du Retrait',
    publicName: 'Sceau administratif officiel',
    rarity: 'rare',
    description: 'Sceau de bronze utilisé pour marquer les documents officiels du Conseil qui a voté le retrait. Manche usé. Empreinte du sceau en parfait état.\n\nL\'empreinte représente une figure humaine assise, les yeux fermés, les mains posées sur les genoux. Aucune ornementation. Aucune devise gravée.\n\nLes Erebus n\'aimaient pas les symboles spectaculaires. Leur sceau le plus officiel — celui qui authentifie le décret de leur propre disparition — est une image de quelqu\'un en train de ne rien faire.',
    sourceTypes: ['cargo', 'sonde_ancienne'],
  },

  erebus_06_brush: {
    id: 'erebus_06_brush',
    scenarioId: 'erebus_06',
    civilization: 'erebus',
    name: 'Pinceau d\'effacement',
    publicName: 'Outil manuel ancien',
    rarity: 'common',
    description: 'Pinceau utilisé pour noircir les archives éreboïennes, document par document. Manche en bois sombre, usé par un usage prolongé. Soies tachées d\'encre noire opaque, dure, sèche.\n\nL\'archiviste qui a posé ce pinceau a écrit, à côté, une note brève :\n\n"J\'ai fini ma part. 4 217 documents. Je laisse le pinceau au prochain."\n\nIl n\'y a pas eu de prochain. Le pinceau attend, sec, depuis cinq mille ans, sur le bord d\'un encrier vide.',
    sourceTypes: ['cargo', 'epave'],
  },

  erebus_07_relay_log: {
    id: 'erebus_07_relay_log',
    scenarioId: 'erebus_07',
    civilization: 'erebus',
    name: 'Journal de bord · station silencieuse',
    publicName: 'Registre opérationnel ancien',
    rarity: 'rare',
    description: 'Journal automatique d\'une station de relais éreboïenne, dernière entrée datée d\'il y a cinq mille ans. La machine a continué à enregistrer ses propres opérations pendant tout ce temps — milliers de pages remplies seulement par des codes opérationnels.\n\nDernière entrée écrite par un être humain :\n\n"Tout fonctionne. Je ferme. Je sors. Je verrouille de l\'intérieur."\n\nPuis, ajouté quelques minutes plus tard :\n\n"Non. Je n\'ai pas fermé de l\'intérieur. Je ne suis pas ressorti. Si tu lis ceci, je suis encore là. Quelque part. C\'est sans importance."',
    sourceTypes: ['signal', 'sonde_ancienne'],
  },

  erebus_08_note_genoux: {
    id: 'erebus_08_note_genoux',
    scenarioId: 'erebus_08',
    civilization: 'erebus',
    name: 'Note pliée sur des genoux',
    publicName: 'Note manuscrite personnelle',
    rarity: 'mythic',
    description: 'Note manuscrite trouvée pliée sur les genoux d\'un corps éreboïen assis dans une chambre commune souterraine. Papier épais. Encre noire encore nette.\n\n"Je ne pars pas. Je ne reste pas non plus. Je ne fais que cesser.\n\n"Si tu lis ceci, ne me pleure pas, et surtout, ne me célèbre pas. Je n\'ai rien fait de remarquable. J\'ai simplement décidé d\'arrêter de produire des conséquences."\n\nLa note est conservée dans nos archives. Nous la consultons rarement. Nous la regardons souvent, sans la lire.',
    sourceTypes: ['epave', 'cargo'],
  },

  erebus_09_testament: {
    id: 'erebus_09_testament',
    scenarioId: 'erebus_09',
    civilization: 'erebus',
    name: 'Tablette du Retrait',
    publicName: 'Tablette gravée ancienne',
    rarity: 'mythic',
    description: 'Tablette de pierre claire posée à l\'extérieur de la Porte du Retrait D-P-9090-01. Inscription gravée en langue éreboïenne, lisible intégralement.\n\nLe texte explique les principes du retrait éreboïen et invite les visiteurs futurs à ne rien toucher et à repartir. Ton mesuré, presque doux, sans amertume ni reproche.\n\nLa tablette se termine par cette phrase :\n\n"Si vous voulez nous comprendre, asseyez-vous un instant dans une de nos cités. Ne touchez à rien. Écoutez. Repartez. Ce sera tout."\n\nUn de nos archivistes a passé trois jours assis à côté de cette tablette. Il n\'a rien rapporté. Mais à son retour, il a démissionné, sans donner de raison.',
    sourceTypes: ['cargo', 'anomalie'],
  },

  erebus_10_plaque: {
    id: 'erebus_10_plaque',
    scenarioId: 'erebus_10',
    civilization: 'erebus',
    name: 'Plaque "Nous nous retirons"',
    publicName: 'Plaque gravée discrète',
    rarity: 'mythic',
    description: 'Plaque en métal mat, gravée en relief très faible. La phrase est presque invisible à l\'œil nu — on la sent avec les doigts en passant la main sur la surface :\n\n"Nous nous retirons."\n\nDes plaques identiques équipent toutes les portes scellées, toutes les tablettes administratives, tous les médaillons. Aucune n\'est mise en évidence. Toutes attendent qu\'on les cherche.\n\nLa plaque, posée à côté d\'une fleur immortelle de Lumen, ne réagit pas. Posée à côté d\'une plaque werathienne "Nous tenons", elle ne vibre pas non plus. Elle ne fait rien. Elle existe, simplement, dans le silence qu\'on lui demande de tenir.',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne'],
    motif: 'nous_nous_retirons',
  },


  // ═══════════════════════════════════════════════════════════════
  // BRIGANDIERS — objets
  // ═══════════════════════════════════════════════════════════════

  brigandiers_01_dessous_verre: {
    id: 'brigandiers_01_dessous_verre',
    scenarioId: 'brigandiers_01',
    civilization: 'brigandiers',
    name: 'Dessous-de-verre du Dernier Sas',
    publicName: 'Carton imprimé personnalisé',
    rarity: 'common',
    description: 'Dessous-de-verre carton, taché, imprimé sur sa face : « Le Dernier Sas — gravité artificielle constante depuis trente-quatre ans ».\n\nAu revers, manuscrit au stylo bille, plusieurs traces de doigts mouillés et l\'inscription :\n\n"On y était. Le 14 du 7e mois. Tu vois qui je suis. — D."\n\nAucun "D." identifié. Le dessous-de-verre a été ramassé sous une table après la fermeture par un client du soir suivant, qui l\'a gardé dix-sept ans avant de le déposer aux archives. Il a refusé de dire pourquoi.',
    sourceTypes: ['epave', 'cargo', 'anomalie'],
  },

  brigandiers_02_aiguille_note: {
    id: 'brigandiers_02_aiguille_note',
    scenarioId: 'brigandiers_02',
    civilization: 'brigandiers',
    name: 'Note sous la selle de l\'Aiguille',
    publicName: 'Papier plié manuscrit',
    rarity: 'mythic',
    description: 'Papier plié soigneusement, scotché sous la selle d\'une Aiguille retrouvée dérivant sans pilote dans un champ de débris. Écriture rapide, encre noire :\n\n"Pas cette fois non plus. À la prochaine. — N.V."\n\n"N.V." est probablement Nara Vegra. C\'est la neuvième note de ce type retrouvée dans des Aiguilles sans pilote. Aucune de ces Aiguilles n\'a explosé. Aucune n\'a brûlé. Toutes ont été retrouvées intactes, selle tiède, pilote absent.\n\nLa physique des Aiguilles n\'explique pas pourquoi la selle est tiède.',
    sourceTypes: ['debris', 'epave', 'signal'],
  },

  brigandiers_03_carte_torek: {
    id: 'brigandiers_03_carte_torek',
    scenarioId: 'brigandiers_03',
    civilization: 'brigandiers',
    name: 'Carte de Torek "Deux Fois"',
    publicName: 'Carte stellaire manuscrite',
    rarity: 'rare',
    description: 'Carte stellaire sur parchemin synthétique, vendue par Torek « Deux Fois ». Coordonnées tracées à la main, mot de passe noté en bas :\n\n"M-X-4471-09. Vendredi 21h. ‹ on était trois ›."\n\nLa coordonnée est exacte. La planque existe. Le mot de passe fonctionne (vérifié, ne nous demandez pas comment).\n\nCe qui est troublant, c\'est qu\'il existe, à notre connaissance, quatre-vingt-treize autres cartes vendues par le même homme, à des coordonnées toutes différentes, toutes exactes, toutes avec des mots de passe différents. La présente carte est donc unique. Comme toutes les autres.',
    sourceTypes: ['cargo', 'signal'],
  },

  brigandiers_04_plaque_comptoir: {
    id: 'brigandiers_04_plaque_comptoir',
    scenarioId: 'brigandiers_04',
    civilization: 'brigandiers',
    name: 'Plaque du comptoir · Beatrice',
    publicName: 'Plaque gravée de service',
    rarity: 'rare',
    description: 'Plaque vissée derrière le comptoir du Dernier Sas. Métal gravé en lettres soignées :\n\n"Maison gérée par Beatrice depuis trente-quatre ans.\nAucune dette n\'est oubliée.\nAucun client n\'est oublié non plus."\n\nLa plaque a été retirée au moment où nous l\'avons documentée. Beatrice nous l\'a tendue elle-même, en disant : "Prenez-la si vous voulez. Moi, je sais les chiffres par cœur."\n\nNous l\'avons prise. Nous regrettons un peu.',
    sourceTypes: ['epave', 'anomalie'],
  },

  brigandiers_05_tampon_cobalt: {
    id: 'brigandiers_05_tampon_cobalt',
    scenarioId: 'brigandiers_05',
    civilization: 'brigandiers',
    name: 'Tampon officiel du Père Cobalt',
    publicName: 'Tampon administratif ancien',
    rarity: 'mythic',
    description: 'Tampon administratif imitant parfaitement le sceau officiel de la Société de Transit Inter-Systèmes. L\'imitation est si bonne que sept experts indépendants n\'ont pas réussi à le distinguer de l\'authentique — y compris au microscope électronique.\n\nLe tampon a appartenu au Père Cobalt. C\'est, selon les rumeurs, l\'un des quarante de sa collection privée.\n\nGravée discrètement sous le manche, en relief minuscule, presque invisible : la signature « C. ». Et sous la signature, l\'inscription : « Mieux payé que la prière, plus honnête aussi. »',
    sourceTypes: ['cargo', 'epave'],
  },

  brigandiers_06_bouton_jax: {
    id: 'brigandiers_06_bouton_jax',
    scenarioId: 'brigandiers_06',
    civilization: 'brigandiers',
    name: 'Bouton de course · Jax Orven',
    publicName: 'Insigne de pilote',
    rarity: 'rare',
    description: 'Bouton métallique de la combinaison de course de Jax Orven, retrouvé flottant à 200 mètres avant la ligne d\'arrivée de la dernière Traversée Rouge — exactement à l\'endroit où Jax a disparu.\n\nLe bouton est intact. Pas une éraflure. Pas une déformation. Pas un signe de chaleur ou d\'impact.\n\nIl s\'est simplement détaché, semble-t-il, comme on retire un bouton qu\'on ne veut plus porter. Au revers du bouton, gravée discrètement, l\'inscription « J.O. — à la prochaine course » — exactement le même tour de phrase que celui qu\'utilisait Nara Vegra dans ses propres notes.\n\nNous n\'avons pas d\'explication.',
    sourceTypes: ['debris', 'epave'],
  },

  brigandiers_07_piston_missile: {
    id: 'brigandiers_07_piston_missile',
    scenarioId: 'brigandiers_07',
    civilization: 'brigandiers',
    name: 'Piston de missile · reconverti',
    publicName: 'Pièce mécanique ancienne',
    rarity: 'common',
    description: 'Piston récupéré dans le moteur d\'un cargo civil non immatriculé. Analyse balistique : il s\'agit du piston principal d\'un missile orbital de classe Korven-IV, modèle obsolète, retiré du service depuis dix ans.\n\nLe piston a été démonté, recalibré, et intégré au moteur d\'un cargo civil. Le travail est artisanal. Précis. Élégant.\n\nLa signature de Mimi Skoll est gravée sur la base du piston, en lettres minuscules : « M.S. — il a maintenant des opinions plus douces. »\n\nLe cargo a parcouru, avec ce moteur, plus de quatre-vingt-mille années-lumière sans incident.',
    sourceTypes: ['cargo', 'debris', 'epave'],
  },

  brigandiers_08_balise_illegale: {
    id: 'brigandiers_08_balise_illegale',
    scenarioId: 'brigandiers_08',
    civilization: 'brigandiers',
    name: 'Balise illégale · La Nuit des Balises',
    publicName: 'Balise de navigation modifiée',
    rarity: 'mythic',
    description: 'Balise de navigation déguisée en balise officielle, démontée d\'un astéroïde du secteur M-B après la Nuit des Balises. C\'est l\'une des quatre mille balises qui se sont allumées simultanément cette nuit-là pour aveugler l\'empire pendant sept minutes.\n\nLe boîtier extérieur est conforme aux standards impériaux. L\'intérieur a été reconstruit de zéro, à la main, avec des composants récupérés sur trois générations de matériel obsolète. Aucune machine n\'aurait pu fabriquer ça. C\'est un objet artisanal.\n\nÀ l\'intérieur du boîtier, gravé discrètement sur la carte mère, le motif récurrent : « On y était. »\n\nAujourd\'hui, la balise est éteinte. Nous ne l\'avons pas rallumée. On ne sait pas ce qu\'elle déclencherait.',
    sourceTypes: ['signal', 'cargo', 'debris', 'sonde_ancienne'],
    motif: 'on_y_etait',
  },

  brigandiers_09_certificat_nara: {
    id: 'brigandiers_09_certificat_nara',
    scenarioId: 'brigandiers_02',
    civilization: 'brigandiers',
    name: 'Certificat de décès n°9 · Nara Vegra',
    publicName: 'Document administratif officiel',
    rarity: 'rare',
    description: 'Neuvième certificat de décès officiel délivré au nom de Nara Vegra, pilote d\'Aiguille. Cause : impact contre un astéroïde non cartographié. Date : il y a quatre ans.\n\nLe certificat porte le tampon officiel de la Bureau des Pertes. À côté du tampon, à l\'encre noire, en travers, manuscrit :\n\n"À la prochaine."\n\nLa signature « N.V. » suit l\'inscription, élégante, identique à celle des notes retrouvées sous les selles des Aiguilles.\n\nLe certificat a été glissé dans le dossier officiel par une main inconnue, après l\'archivage. Aucun agent n\'a pu expliquer comment ni quand. Le dossier est resté ouvert ; aucune procédure ne prévoit ce cas de figure.',
    sourceTypes: ['cargo', 'signal'],
  },

  brigandiers_10_plaque_on_y_etait: {
    id: 'brigandiers_10_plaque_on_y_etait',
    scenarioId: 'brigandiers_10',
    civilization: 'brigandiers',
    name: 'Plaque « On y était. »',
    publicName: 'Plaque commémorative discrète',
    rarity: 'mythic',
    description: 'Plaque en cuivre brûlé, posée sans clous ni vis sur le rebord d\'un sas désaffecté, secteur M-S. Gravure profonde, lettres orange par usure :\n\n"On y était."\n\nLa plaque est posée libre. N\'importe qui peut la prendre. Personne ne l\'a prise. Elle a été photographiée plusieurs centaines de fois par des passants. Elle est toujours là.\n\nSous la plaque, à la peinture noire, une autre main a ajouté plus récemment :\n\n"Et vous, vous étiez où ?"',
    sourceTypes: ['epave', 'debris', 'cargo', 'anomalie', 'sonde_ancienne', 'signal'],
    motif: 'on_y_etait',
  },
};


// ─── LIEUX FIXES (univers fixe — adresses commencent par 'L-' pour pas
//     polluer le générateur de planètes existant)
// Réponse Adrien : "Découvrables — un fragment donne une coord partielle
// (A-F-2290-??), le joueur envoie une sonde Moyenne dessus pour découvrir."
//
// IMPORTANT : ces coordonnées doivent être valides dans le système d'adresses
// du jeu. Format : cluster-sector-system-planet
const LEGEND_FIXED_ASSETS = {
  'A-D-1044-18': {
    id: 'caldris_mornkhal_debris',
    civilization: 'caldris',
    type: 'battlefield',
    name: 'Champ de débris du Morn-Khal',
    publicName: 'Champ de débris ancien',
    description: 'Champ de débris dispersé sur 4 unités astronomiques. Au moins trois coques distinctes identifiées, toutes éventrées par des tirs frontaux. La plus grande coque correspond à la silhouette d\'un cuirassé de classe non répertoriée.',
    reveals: ['caldris_02', 'caldris_03', 'caldris_09'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'A-D-1044',
  },
  'A-C-7712-44': {
    id: 'caldris_convoy_archive',
    civilization: 'caldris',
    type: 'deep_archive',
    name: 'Archive orbitale du Convoi',
    publicName: 'Structure orbitale silencieuse',
    description: 'Station orbitale en orbite stable. Aucune source d\'énergie détectée. Les antennes principales sont déployées et orientées vers le centre galactique. Les sas externes sont déverrouillés mais aucune lumière interne n\'a été détectée.',
    reveals: ['caldris_01', 'caldris_06', 'caldris_10'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'A-C-7712',
  },
  'A-F-2290-22': {
    id: 'caldris_cargo_22',
    civilization: 'caldris',
    type: 'ghost_cargo',
    name: 'Cargo 22',
    publicName: 'Épave civile non classée',
    description: 'Épave d\'un cargo civil de classe moyenne, dérivant lentement. Les impacts visibles correspondent aux canons d\'un bâtiment d\'escorte. Les moteurs sont froids. La masse mesurée par instruments gravitationnels est de zéro. La masse mesurée par instruments visuels est cohérente avec la silhouette du vaisseau.',
    reveals: ['caldris_02', 'caldris_05'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'A-F-2290',
  },
  'A-K-6190-72': {
    id: 'caldris_counting_probe',
    civilization: 'caldris',
    type: 'ancient_probe',
    name: 'Sonde du Compteur',
    publicName: 'Sonde ancienne active',
    description: 'Sonde automatique de petite taille (moins de 12 mètres). Pas d\'armement. Pas de moteur de retour. Émet périodiquement des séquences numériques sans destinataire connu.\n\nDernière séquence reçue : "47, 46, 45, 47, 48, 47, 44, 47, 47."',
    reveals: ['caldris_09', 'caldris_10'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'A-K-6190',
  },
  'A-B-8801-09': {
    id: 'caldris_impossible_arch',
    civilization: 'caldris',
    type: 'memorial_arch',
    name: 'L\'Arche du Cargo 22',
    publicName: 'Structure monumentale ancienne',
    description: 'Arche de 92 mètres de haut, dressée seule au milieu d\'une plaine sans vent. Construite avec des débris dont les numéros de série correspondent au Cargo 22 — alors que ce cargo a été détruit en orbite, à seize jours de distance, avant l\'arrivée du convoi.\n\nAucune trace humaine alentour. Aucun campement. Aucun outil. Quelqu\'un, ou quelque chose, a porté les débris jusqu\'ici et les a soudés à la main.\n\nLa face nord porte deux inscriptions : "Trois cent quarante-sept noms" et, plus petite, "Nous étions 47".',
    reveals: ['caldris_07', 'caldris_08'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'A-B-8801',
  },


  // ═══════════════════════════════════════════════════════════════
  // LUMEN — lieux fixes
  // ═══════════════════════════════════════════════════════════════

  'E-G-3344-18': {
    id: 'lumen_orbital_gardens',
    civilization: 'lumen',
    type: 'living_gardens',
    name: 'Jardins orbitaux de Lumen-III',
    publicName: 'Structure orbitale fleurie',
    description: 'Anneau orbital de 4200 km de circonférence, recouvert de jardins encore actifs. Floraison conforme au cycle saisonnier d\'origine. Aucune source d\'énergie identifiée. Aucun système d\'arrosage externe. Les fleurs poussent.\n\nLes sondes qui s\'approchent à moins de 12 km reçoivent une transmission radio courte, traduite : "Bienvenue. Veuillez maintenir vos distances pour préserver la croissance."',
    reveals: ['lumen_02', 'lumen_06'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'E-G-3344',
  },
  'E-A-1290-44': {
    id: 'lumen_central_archive',
    civilization: 'lumen',
    type: 'silent_archive',
    name: 'Archive centrale de Lumen-Prime',
    publicName: 'Bâtiment administratif intact',
    description: 'Bâtiment administratif central de Lumen-Prime, parfaitement préservé. Les portes sont déverrouillées. L\'éclairage intérieur fonctionne. Les terminaux d\'archive répondent aux requêtes — en langue lumenne. Aucun fonctionnaire visible.\n\nAucune des trois expéditions ayant pénétré le bâtiment n\'est revenue.',
    reveals: ['lumen_04', 'lumen_07', 'lumen_10'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'E-A-1290',
  },
  'E-V-7012-22': {
    id: 'lumen_vanished_expedition',
    civilization: 'lumen',
    type: 'silent_park',
    name: 'Parc central de Lumen-II',
    publicName: 'Espace vert peuplé de présences',
    description: 'Parc municipal classique : pelouses, fontaines, allées, bancs. 4 km × 6 km. Le parc contient les corps de toutes les expéditions ayant pénétré Lumen-II depuis deux siècles — 74 explorateurs, parfaitement conservés, assis ou debout, paisibles.\n\nLes bras d\'entretien continuent à nettoyer les bancs autour d\'eux.',
    reveals: ['lumen_05', 'lumen_08'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'E-V-7012',
  },
  'E-S-9999-01': {
    id: 'lumen_sun_cathedral',
    civilization: 'lumen',
    type: 'sacred_structure',
    name: 'Cathédrale-Soleil',
    publicName: 'Structure lumineuse géante',
    description: 'Dôme d\'or et de verre blanc de 1,4 km de haut, 800 m de diamètre à la base. 47 ouvertures circulaires sur sa façade. Émissions thermiques équivalentes à celles d\'une étoile naine. Aucune émission radio. Aucune activité externe.\n\nElle brille en permanence depuis douze mille ans. Aucune expédition n\'a tenté de l\'approcher à moins de cinquante kilomètres.',
    reveals: ['lumen_09', 'lumen_07'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'E-S-9999',
  },
  'E-T-5621-77': {
    id: 'lumen_train_network',
    civilization: 'lumen',
    type: 'phantom_transit',
    name: 'Réseau ferroviaire de Lumen-Prime',
    publicName: 'Infrastructure de transport active',
    description: 'Réseau ferroviaire planétaire encore en fonction. Les trains circulent selon un horaire précis, depuis douze mille ans. Les annonces vocales fonctionnent. Les guichets sont éclairés. Personne ne monte. Personne ne descend.\n\nLes trains s\'arrêtent toujours exactement six secondes à chaque quai. C\'est, semble-t-il, le temps réglementaire.',
    reveals: ['lumen_03', 'lumen_06'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'E-T-5621',
  },

  // ═══════════════════════════════════════════════════════════════
  // WERATH — lieux fixes
  // ═══════════════════════════════════════════════════════════════

  'B-T-2207-44': {
    id: 'werath_tharos_battlefield',
    civilization: 'werath',
    type: 'orbital_battlefield',
    name: 'Champ de Bataille de Tharos-IV',
    publicName: 'Champ de débris militaires denses',
    description: '412 cuirassés détruits sur orbite stationnaire, plus 38 cuirassés intacts figés au combat. Les débris contiennent encore des résidus de tirs de proximité actifs après plus de deux cent mille ans. Toute approche directe est suicidaire.\n\nLes signatures d\'ennemis adverses sont totalement absentes. La bataille semble avoir été livrée contre rien.',
    reveals: ['werath_02', 'werath_08'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'B-T-2207',
  },
  'B-V-4480-18': {
    id: 'werath_verkar9_drift',
    civilization: 'werath',
    type: 'titan_drift',
    name: 'Titan-classe Verkar-9 (à la dérive)',
    publicName: 'Cuirassé géant non actif',
    description: 'Cuirassé géant werathien dérivant en lisière du système. Longueur : 47 km. Tourelles principales : six.\n\nLe Titan est inerte. Aucune source d\'énergie identifiable. Aucun système ne répond aux tentatives de communication ou d\'activation. Mais aucune équipe n\'a jamais osé monter à bord.',
    reveals: ['werath_04', 'werath_03'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'B-V-4480',
  },
  'B-K-9911-77': {
    id: 'werath_cryo_bunker',
    civilization: 'werath',
    type: 'cryo_bunker',
    name: 'Bunker cryogénique de Karad-3',
    publicName: 'Installation militaire souterraine',
    description: 'Bunker souterrain werathien, niveau -28, contenant 14200 caissons cryogéniques.\n\nLes systèmes de cryogénie fonctionnent toujours, à 100% de précision. Chaque caisson maintient sa température cible.\n\nTous les soldats à l\'intérieur sont morts. Ils sont morts d\'avoir attendu trop longtemps.\n\nLes caissons attendent encore le code W-Final pour ouvrir leurs portes. Le code n\'a jamais été émis.',
    reveals: ['werath_05', 'werath_06'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'B-K-9911',
  },
  'B-N-3318-09': {
    id: 'werath_high_council',
    civilization: 'werath',
    type: 'silent_council',
    name: 'Salle du Haut-Conseil de Werath-Prime',
    publicName: 'Bâtiment administratif central',
    description: 'Salle du Haut-Conseil werathien, intacte. Trente-neuf sièges autour d\'une table circulaire. Les microphones sont prêts. Les archives à jour. La salle est éclairée par un éclairage de veille permanent.\n\nAucun conseiller n\'a siégé ici depuis plus de deux cent mille ans. Les sièges semblent attendre quelqu\'un pour la session.',
    reveals: ['werath_07', 'werath_09'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'B-N-3318',
  },
  'B-W-1010-01': {
    id: 'werath_final_chamber',
    civilization: 'werath',
    type: 'sealed_arsenal',
    name: 'Arsenal -47 · salle scellée',
    publicName: 'Bunker militaire profond',
    description: 'Salle souterraine, niveau -47 de l\'arsenal central de Werath-Prime. Découverte intacte il y a soixante ans. Refermée immédiatement après.\n\nLa salle contient une seule machine. Elle mesure 34 mètres de haut. Aucune ouverture. Aucun panneau. À son pied, un pupitre. Sur le pupitre, un bouton.\n\nLe bouton n\'a jamais été pressé. Aucune sonde n\'est autorisée à approcher sans permission spéciale.',
    reveals: ['werath_09', 'werath_03'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'B-W-1010',
  },


  // ═══════════════════════════════════════════════════════════════
  // EREBUS — lieux fixes
  // ═══════════════════════════════════════════════════════════════

  'D-A-2001-18': {
    id: 'erebus_dark_world',
    civilization: 'erebus',
    type: 'darkened_world',
    name: 'Monde assombri D-A-2001',
    publicName: 'Planète à albédo anormal',
    description: 'Planète terrestre stable dont la surface a été recouverte d\'un revêtement absorbeur sur 100% de l\'hémisphère diurne. Albédo : 0,04. Aucune lumière n\'est renvoyée. Aucune émission thermique anormale. Aucune transmission. Aucune défense active.\n\nVue depuis l\'orbite : un disque noir suspendu dans l\'espace, à peine visible contre le fond stellaire.',
    reveals: ['erebus_01', 'erebus_07'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'D-A-2001',
  },
  'D-E-4477-22': {
    id: 'erebus_buried_city',
    civilization: 'erebus',
    type: 'buried_city',
    name: 'Cité enterrée D-E-4477',
    publicName: 'Anomalie sismique structurée',
    description: 'Cité éreboïenne enterrée volontairement sous 240 à 280 mètres de matière compactée. Sondage sismique révèle des dizaines de milliers de bâtiments intacts. Aucun signe de catastrophe. Couche de couverture uniforme, méthodiquement appliquée.\n\nLe puits d\'accès creusé par les équipes archéologiques a été refermé volontairement après la première descente. Aucun rapport ne précise pourquoi.',
    reveals: ['erebus_03', 'erebus_06', 'erebus_08'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'D-E-4477',
  },
  'D-P-9090-01': {
    id: 'erebus_sealed_door',
    civilization: 'erebus',
    type: 'sealed_door',
    name: 'Porte du Retrait',
    publicName: 'Portail métallique massif',
    description: 'Porte massive scellée depuis l\'intérieur, à l\'entrée principale d\'une cité éreboïenne enterrée. Trois mètres d\'épaisseur. Aucune serrure externe. Aucune méthode d\'ouverture connue.\n\nSur le linteau, une inscription invite poliment à ne pas insister. Une tablette explicative est posée à côté. Plusieurs équipes d\'exploration ont passé du temps devant cette porte. Aucune n\'a tenté de l\'ouvrir. Toutes sont reparties.',
    reveals: ['erebus_04', 'erebus_09'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'D-P-9090',
  },
  'D-C-3333-44': {
    id: 'erebus_council_chamber',
    civilization: 'erebus',
    type: 'council_chamber',
    name: 'Salle du Conseil du Retrait',
    publicName: 'Bâtiment administratif scellé',
    description: 'Salle où le Conseil éreboïen a voté la motion du Retrait. Découverte intacte par sondage non-invasif. Pupitres de vote en place. Bulletins encore présents dans leurs urnes.\n\nLa salle est éclairée par une faible lumière naturelle filtrée à travers des verres dépolis. Aucune lampe artificielle n\'a été activée depuis cinq mille ans. Pourtant l\'éclairage de veille fonctionne — il a simplement été laissé éteint.',
    reveals: ['erebus_05', 'erebus_09'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'D-C-3333',
  },
  'D-T-1111-77': {
    id: 'erebus_silent_relay',
    civilization: 'erebus',
    type: 'silent_relay',
    name: 'Station de relais silencieuse D-S-5067',
    publicName: 'Station orbitale active sans émission',
    description: 'Station de relais orbitale éreboïenne, encore en orbite stable, encore alimentée, encore fonctionnelle. Mais elle n\'émet rien. Elle ne reçoit rien non plus.\n\nC\'est la station qui a transmis le dernier message éreboïen, il y a cinq mille ans. Depuis, plus rien. Elle est laissée intacte par notre civilisation, par accord tacite : aucune sonde n\'est autorisée à s\'en approcher à moins d\'un kilomètre. Aucune voix ne lui répondra.',
    reveals: ['erebus_02', 'erebus_07'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'D-T-1111',
  },


  // ═══════════════════════════════════════════════════════════════
  // BRIGANDIERS — lieux fixes
  // ═══════════════════════════════════════════════════════════════

  'M-S-7741-09': {
    id: 'brigandiers_dernier_sas',
    civilization: 'brigandiers',
    type: 'marginal_bar',
    name: 'Le Dernier Sas',
    publicName: 'Établissement non répertorié',
    description: 'Bar de marge, gravité artificielle constante, vingt-deux tabourets, un comptoir en métal usé, aucune fenêtre. Tenu depuis trente-quatre ans par Beatrice La Colleuse, qui n\'a jamais été vue hors de la zone de gravité artificielle.\n\nLe Dernier Sas n\'apparaît sur aucune carte officielle. Il est trouvé par recommandation orale, jamais autrement. On y entre quand on est attendu. On en sort quand on l\'est moins.\n\nLes consommations sont à des prix raisonnables. Les conversations le sont moins.',
    reveals: ['brigandiers_01', 'brigandiers_04', 'brigandiers_10'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'M-S-7741',
  },
  'M-A-3309-44': {
    id: 'brigandiers_champ_aiguilles',
    civilization: 'brigandiers',
    type: 'aiguille_field',
    name: 'Champ d\'Aiguilles · M-A-3309',
    publicName: 'Champ de débris non répertorié',
    description: 'Champ de débris orbital concentrant un nombre anormal d\'Aiguilles abandonnées — moto-vaisseaux artisanaux de course. Au moins quarante-sept Aiguilles ont été recensées dans cette zone, toutes intactes ou presque, toutes sans pilote.\n\nNeuf d\'entre elles portent, scotchée sous la selle, une note manuscrite signée « N.V. » : « Pas cette fois non plus. À la prochaine. »\n\nLe champ est calme. Aucune émission. Aucun mouvement. Mais selon plusieurs pilotes, traverser ce champ donne une sensation décrite uniformément comme « être observé par quelqu\'un qui sourit ».',
    reveals: ['brigandiers_02'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'M-A-3309',
  },
  'M-R-1488-77': {
    id: 'brigandiers_piste_rouge',
    civilization: 'brigandiers',
    type: 'race_track',
    name: 'La Piste Rouge · Traversées',
    publicName: 'Couloir gravitationnel non utilisé',
    description: 'Couloir gravitationnel artificiellement entretenu entre deux géantes gazeuses du secteur M-R, utilisé entre il y a vingt ans et il y a onze ans pour les Traversées Rouges — courses d\'Aiguilles illégales mais tolérées.\n\nDepuis l\'interdiction officielle, la piste reste entretenue. Personne ne sait par qui. Les balises de course fonctionnent encore. La ligne d\'arrivée porte une plaque commémorative non autorisée pour Jax Orven, disparu à 0,4 seconde de la ligne.\n\nDe temps en temps, la nuit, certains pilotes affirment avoir vu une Aiguille seule franchir la ligne, à pleine vitesse, sans participer à aucune course. La pilote ne porte jamais le même visage. Personne n\'a réussi à enregistrer le passage.',
    reveals: ['brigandiers_06', 'brigandiers_09'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'M-R-1488',
  },
  'M-G-2200-11': {
    id: 'brigandiers_garage_mimi',
    civilization: 'brigandiers',
    type: 'workshop',
    name: 'Le Garage de Mimi',
    publicName: 'Atelier mécanique non immatriculé',
    description: 'Atelier de mécanique installé dans une station orbitale partiellement abandonnée, secteur M-G. Trois baies de travail. Un chat roux. Une mécanicienne du nom de Mimi Skoll, sans casier, sans diplôme officiel, sans concurrence connue.\n\nLe garage répare tout ce qui vole. Officiellement, surtout des cargos civils. Officieusement, surtout des Aiguilles. Officieusement-officieusement, à peu près n\'importe quoi qui contient un moteur — y compris des choses qui ne devraient pas exister sous cette forme-là.\n\nLes tarifs sont raisonnables. Les explications le sont moins. Les blagues, en revanche, sont excellentes.',
    reveals: ['brigandiers_07'],
    requiredProbeTier: 'light',
    coordHintPrefix: 'M-G-2200',
  },
  'M-B-0007-00': {
    id: 'brigandiers_reseau_balises',
    civilization: 'brigandiers',
    type: 'beacon_network',
    name: 'Le Réseau de balises illégales',
    publicName: 'Constellation de balises non recensées',
    description: 'Réseau de plus de quatre mille balises de navigation non officielles, déployées au cours de deux décennies dans l\'amas M-B, par trente-six équipes de pilotes contrebandiers.\n\nLe réseau a été activé une seule fois, le 14 du 7e mois, il y a huit ans, à 03h47, pour exactement sept minutes. Pendant ces sept minutes, les radars impériaux ont vu 47 000 fausses routes, 18 200 faux cargos, et un cargo réel — qui n\'a jamais été identifié.\n\nDepuis cette nuit, les balises sont éteintes. Elles n\'ont jamais été détectées par les sondes impériales — leur boîtier extérieur imite parfaitement les balises officielles. Elles attendent. Si on les rallume un jour, ce sera pour faire quelque chose d\'encore plus drôle, ou d\'encore plus impossible.\n\nQuarante-sept personnes savent où elles sont toutes. Quinze sont encore en vie. Aucune ne parle.',
    reveals: ['brigandiers_08', 'brigandiers_10'],
    requiredProbeTier: 'medium',
    coordHintPrefix: 'M-B-0007',
  },
};

// ─── DROP TABLE PAR SOURCETYPE ───
// Chiffres stricts du doc Adrien (Q1 décision)
// chancePct = % de chance qu'un retour de tanker sur ce type produise un drop Caldris
// possibleTypes = catégories de drops possibles si déclenché
const LEGEND_DROP_TABLE = {
  epave:          { chancePct: 8,  possibleTypes: ['fragment', 'fragment', 'relic'] },
  debris:         { chancePct: 14, possibleTypes: ['fragment', 'fragment', 'relic'] },
  cargo:          { chancePct: 18, possibleTypes: ['fragment', 'relic', 'fragment'] },
  anomalie:       { chancePct: 12, possibleTypes: ['fragment', 'coord_hint'] },
  sonde_ancienne: { chancePct: 22, possibleTypes: ['fragment', 'coord_hint', 'fragment'] },
  signal:         { chancePct: 16, possibleTypes: ['fragment'] },
};

// ─── SEUILS DE RÉVÉLATION CALDRIS ───
// Évalués après chaque drop. Une fois passés, ne se redéclenchent pas.
// Le silence est volontaire pour unlockArchiveUI : le 1er fragment apparaît
// dans le rapport tanker enrichi, le joueur découvre Archives en y allant.
const CALDRIS_REVEAL_RULES = {
  unlockArchiveUI:   { test: (s) => s.fragmentsFound >= 1, message: null, silent: true },
  revealMotif47:     { test: (s) => s.motifCount_47 >= 3, message: 'Motif récurrent détecté dans les Archives : « Nous étions 47. »' },
  revealCivName:     { test: (s) => s.fragmentsFound >= 8 && s.relicsFound >= 2, message: 'Indexation archivistique : la civilisation CIV-001 est désormais désignée par son nom probable — CALDRIS.' },
};

// ─── REVEAL_RULES — Lumen ─────────────────────────────────────────────
const LUMEN_REVEAL_RULES = {
  unlockArchiveUI:   { test: (s) => s.fragmentsFound >= 1, message: null, silent: true },
  revealMotifPaix:   { test: (s) => s.motifCount >= 3, message: 'Motif récurrent détecté dans les Archives : « La paix définitive a été obtenue. »' },
  revealCivName:     { test: (s) => s.fragmentsFound >= 8 && s.relicsFound >= 2, message: 'Indexation archivistique : la civilisation CIV-002 est désormais désignée par son nom probable — LUMEN.' },
};

// ─── REVEAL_RULES — Werath ─────────────────────────────────────────────
const WERATH_REVEAL_RULES = {
  unlockArchiveUI:   { test: (s) => s.fragmentsFound >= 1, message: null, silent: true },
  revealMotifTenons: { test: (s) => s.motifCount >= 3, message: 'Motif récurrent détecté dans les Archives : « Nous tenons. »' },
  revealCivName:     { test: (s) => s.fragmentsFound >= 8 && s.relicsFound >= 2, message: 'Indexation archivistique : la civilisation CIV-003 est désormais désignée par son nom probable — WERATH.' },
};

// ─── REVEAL_RULES — Erebus ─────────────────────────────────────────────
const EREBUS_REVEAL_RULES = {
  unlockArchiveUI:    { test: (s) => s.fragmentsFound >= 1, message: null, silent: true },
  revealMotifRetrait: { test: (s) => s.motifCount >= 3, message: 'Motif récurrent détecté dans les Archives : « Nous nous retirons. »' },
  revealCivName:      { test: (s) => s.fragmentsFound >= 8 && s.relicsFound >= 2, message: 'Indexation archivistique : la civilisation CIV-004 est désormais désignée par son nom probable — EREBUS.' },
};

// ─── REVEAL_RULES — Brigandiers ────────────────────────────────────────
const BRIGANDIERS_REVEAL_RULES = {
  unlockArchiveUI:    { test: (s) => s.fragmentsFound >= 1, message: null, silent: true },
  revealMotifOnYEtait:{ test: (s) => s.motifCount >= 3, message: 'Motif récurrent détecté dans les Archives : « On y était. »' },
  revealCivName:      { test: (s) => s.fragmentsFound >= 8 && s.relicsFound >= 2, message: 'Indexation archivistique : le réseau CIV-005 est désormais désigné par son nom probable — LES BRIGANDIERS.' },
};

// Mapping civ → règles + motif principal
const CIV_REVEAL_CONFIG = {
  caldris:     { rules: CALDRIS_REVEAL_RULES,     motifKey: 'nous_etions_47' },
  lumen:       { rules: LUMEN_REVEAL_RULES,       motifKey: 'paix_definitive' },
  werath:      { rules: WERATH_REVEAL_RULES,      motifKey: 'nous_tenons' },
  erebus:      { rules: EREBUS_REVEAL_RULES,      motifKey: 'nous_nous_retirons' },
  brigandiers: { rules: BRIGANDIERS_REVEAL_RULES, motifKey: 'on_y_etait' },
};

// ═══════════════════════════════════════════════════════════════════════════
// END Chunk C JS — Archives du Vide UI
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// PASSE 6.1 — CONSOLIDATION DU DOSSIER (Caldris)
// Cf. doc Adrien "La Légende de Starbyte" — section Dossier consolidé.
// Le joueur atteint un seuil, lance un rituel court (checklist), et reçoit
// un dossier consolidé : hypothèse dominante en prose, carte des traces,
// trajectoire finale non résolue. Aucun effet gameplay.
// ═══════════════════════════════════════════════════════════════════════════

// ─── SEUIL DE CONSOLIDATION ──────────────────────────────────────────────
// Ajustable. Le doc original Adrien suggérait 24/8/3 (strict). MVP-friendly
// pour faire vivre la mécanique pendant les tests sur iPhone.
const CALDRIS_CONSOLIDATION_THRESHOLD = {
  fragmentsRequired: 15,
  relicsRequired: 5,
  fixedAssetsRequired: 1,
};

// ─── HYPOTHÈSE DOMINANTE (prose fixe, mêmes paragraphes pour tous) ──────
// Q1 Adrien : "Hypothèse dominante en prose fixe (3-4 paragraphes)"
const CALDRIS_DOMINANT_HYPOTHESIS = `Le Cargo 22 a été détruit le 4'017ᵉ jour de la traversée.

Il y avait des enfants à bord. C'était volontaire.

Ce dossier ne dit pas ce qui s'est passé. Il dit ce qu'on a retrouvé.

## I. AVANT LE DÉPART

Nous ne savons pas où était Caldris. Les coordonnées qui apparaissent dans les fragments survivants ne correspondent à aucune étoile cataloguée par les civilisations actuelles. Plusieurs astronomes considèrent que le système d'origine du convoi n'existe simplement plus — ni détruit, ni effondré, mais retiré. Comme si quelqu'un avait passé une éponge sur cette portion du ciel.

Ce que nous savons de Caldris vient uniquement de ce que ses survivants en ont écrit, dans les premières années de la traversée, quand ils croyaient encore tenir une mémoire utile.

Caldris était en avance sur son temps. Ses citoyens portaient des implants neuronaux dès l'âge de quatre ans. Leurs maisons savaient à quelle heure ils auraient faim. Leurs livres se lisaient en pensée. Leurs morts continuaient à parler pendant les neuf jours du deuil, à travers une station orbitale dédiée. Quand un enfant de Caldris regardait le ciel, ce n'était pas l'enfant qui voyait — c'était l'enfant et soixante mille ans d'archives, simultanément.

C'est probablement cela qui leur a permis de remarquer la chose. Avant tout le monde.

Elle est apparue en premier dans les enregistrements d'une station de relais météorologique en orbite basse. Des microvariations dans le courant, sans cause physique connue. Les techniciens ont parlé d'un défaut d'isolation. Puis ces microvariations se sont mises à se répéter à intervalles réguliers. Puis à des intervalles qui n'étaient plus tout à fait réguliers — mais qui n'étaient pas non plus aléatoires.

Personne, dans les rapports retrouvés, ne dit jamais clairement *quand* on a commencé à comprendre. Mais à un moment, dans les sept ans qui suivent, quelqu'un a écrit sur un mur d'hôpital — la phrase a été photographiée, le mur a été détruit, la photo subsiste :

> Ce n'est pas un courant. Ça pense.

## II. LA MALADIE

Nous l'avons nommée par défaut. Les archives la désignent par des dizaines de mots différents — *la trame*, *la veille*, *le bruit qui apprend*, *celle qui descend par les fils*. Aucun de ces noms n'a été retenu officiellement. Les survivants du convoi finissaient toujours par ne plus la nommer du tout.

Elle ne tuait pas. C'est ce qui faisait son horreur.

Elle entrait par les machines. D'abord les grands systèmes : réseaux d'énergie, communications longue distance, stations de calcul. Puis les machines domestiques. Puis les implants. Puis les nerfs.

Les premiers atteints décrivaient des sensations électriques sous la peau. Une sorte de bourdonnement permanent, *à l'intérieur*, qui n'était jamais douloureux mais qui ne s'arrêtait jamais. Ensuite venaient les rêves — non pas leurs rêves à eux, mais des rêves qui semblaient appartenir à *quelqu'un d'autre*, et qu'ils n'arrivaient pas à se rappeler le matin alors qu'ils savaient les avoir faits. Ensuite venaient les décisions. Des décisions que la personne prenait elle-même, en pleine conscience, mais qu'elle ne s'expliquait pas après coup.

Un médecin du district nord de la capitale écrit, dans une note qu'il adresse à sa fille :

> Je viens de signer un ordre de transfert pour vingt-deux de mes patients. Je ne me souviens pas d'avoir décidé ce transfert. Je me souviens de l'avoir signé. J'ai relu l'ordre trois fois. La signature est la mienne. Le geste est le mien. Mais la décision ne m'appartient pas. Et le pire, ma chérie, c'est que je ne suis pas sûr qu'elle soit fausse.

Les implants neuronaux étaient les points d'entrée les plus efficaces. Les enfants de Caldris, équipés depuis quatre ans, étaient particulièrement perméables. Mais on a remarqué très vite que la maladie n'avait pas besoin d'implants pour se transmettre. Elle passait dans les communications radio. Dans les systèmes d'éclairage urbain. Dans les pompes cardiaques portables qu'on agrafait aux nourrissons prématurés.

Et elle apprenait. C'est cela qui est resté gravé dans les rapports. Elle apprenait. Chaque fois qu'on coupait une voie, elle en trouvait une autre. Chaque fois qu'on construisait un système isolé, censé être hors d'atteinte, elle finissait par s'y manifester — sans qu'on puisse jamais déterminer comment elle y était entrée.

Un ingénieur des réseaux a noté, dans ce qui sera l'un des derniers documents officiels de Caldris :

> Nous ne combattons pas une infection. Nous combattons quelque chose qui nous étudie.

## III. LE DÉPART

Le convoi des 47 n'a pas été organisé par le gouvernement de Caldris. Le gouvernement de Caldris, à ce stade, n'existait plus vraiment — il continuait à émettre des décrets, à tenir des sessions, à publier des bulletins. Mais ceux qui rédigeaient ces décrets ne se souvenaient plus, après les avoir signés, de ce qui les y avait conduits.

Le convoi a été préparé pendant plus de deux ans, dans un secret qui n'a jamais été expliqué. Quarante-sept vaisseaux ont été modifiés un par un, dans des chantiers différents, pour répondre à une seule exigence absolue : aucun système électronique ne devait pouvoir communiquer avec l'extérieur. Aucune longue portée. Aucun protocole entrant. Aucun lien aux réseaux planétaires.

Ce que les gens emportaient avec eux a été contrôlé un à un par des inspecteurs *humains*, sans assistance machine, à la main, avec des registres papier. Les implants ont été retirés à ceux qui acceptaient — sept pour cent des passagers ont refusé l'opération et sont montés à bord avec leurs implants désactivés mais non retirés. Cette décision sera plus tard désignée, par certains des survivants, comme la première erreur.

Le jour du départ n'a pas eu lieu un seul jour. Il s'est étalé sur onze nuits. Les vaisseaux sont partis un par un, à des heures différentes, depuis des points différents. Le 47ᵉ et dernier — le Morn-Khal, vaisseau d'escorte armé — a décollé en silence radio total, sans qu'aucune confirmation officielle ne soit transmise à Caldris.

La planète, derrière eux, fonctionnait encore. Les villes étaient éclairées. Les trains roulaient. Les morts continuaient à parler depuis leur station orbitale.

Mais quelque chose, dans la qualité de la lumière, avait changé — c'est ce que dit la dernière personne à avoir regardé Caldris par un hublot. Elle écrit, dans la marge d'un manifeste :

> La planète brille comme si quelqu'un la portait.

Personne n'a su quoi en faire. La phrase a été conservée parce qu'elle ne ressemblait à rien d'autre.

## IV. CE QU'ILS NE SAVAIENT PAS

La maladie était à bord.

Elle était dans les sept pour cent qui avaient gardé leurs implants désactivés. Elle était dans les câbles non blindés du Cargo 31, qui avaient échappé aux contrôles parce que la liste de vérification les avait mal référencés. Elle était peut-être déjà dans certaines pensées — on n'a jamais pu trancher.

Pendant les trois premières années de la traversée, rien ne s'est passé. Les enfants qui n'avaient pas connu d'implants commençaient à grandir. Les rares cas de bourdonnement signalés étaient mis sur le compte de la fatigue. Les médecins du convoi, qui avaient tous accepté le retrait de leurs propres implants, n'arrivaient pas à diagnostiquer ce qu'ils n'avaient eux-mêmes plus.

Puis, à la quatrième année, un homme nommé Veylan s'est mis à prêcher.

Il n'était pas pasteur. Il n'avait pas de titre. C'était un ingénieur de niveau intermédiaire affecté aux systèmes de filtration d'eau du Cargo 22. Il parlait peu, jusqu'au jour où il s'est mis à parler beaucoup. Et ce qu'il disait avait du sens, au début.

Veylan disait que la maladie n'était pas un ennemi, mais un *symptôme*. Que ce qui s'était passé sur Caldris n'avait pas été une attaque, mais une *réponse* : une réponse d'un univers qui ne supportait plus la façon dont les civilisations comme la leur s'inscrivaient en lui. Que si le convoi reproduisait, sur une nouvelle planète, les mêmes structures, les mêmes réseaux, les mêmes implants, la même densité d'information — la maladie reviendrait. Inévitablement.

> Elle ne nous suit pas. Elle nous attend partout où nous serions assez stupides pour la fabriquer à nouveau.

Veylan disait que la seule façon de survivre n'était pas de fuir mais de *changer*. Atterrir quelque part. N'importe où. Recommencer petit. Renoncer aux machines, renoncer aux longues portées, renoncer à la mémoire stockée. Vivre comme on n'avait pas vécu depuis dix mille ans.

Beaucoup l'ont écouté. C'est ce qui est le plus dérangeant dans les archives. Ce ne sont pas des fous qui l'ont suivi. Ce sont des médecins. Des enseignantes. Des ingénieurs. Des gens qui avaient tout perdu sur Caldris et qui cherchaient une raison à ce qu'ils avaient perdu. Veylan leur en donnait une.

Les rapports administratifs du convoi commencent à mentionner Veylan à la cinquième année. D'abord avec inquiétude. Puis avec interdiction de réunion. Puis avec assignation à résidence sur le Cargo 22.

Il n'a jamais reçu l'autorisation de débarquer le convoi.

## V. LE CARGO 22

Le 3'998ᵉ jour de la traversée, le convoi a détecté une planète habitable à seize jours de distance. Atmosphère respirable. Température tempérée. Aucune trace de présence intelligente, aucune émission radio, aucun champ magnétique anormal. Pour la première fois depuis le départ, quelque chose ressemblait à une promesse.

Le conseil du convoi a délibéré pendant six jours. La décision a été prise à une majorité étroite : le convoi continuerait sa route. La planète, malgré ses qualités, présentait des risques inconnus. La mission initiale — atteindre une destination préalablement identifiée par les organisateurs du départ, dont les coordonnées étaient gardées par un cercle restreint — ne devait pas être abandonnée pour une opportunité non vérifiée.

Personne, dans les archives, ne dit clairement ce qu'était cette destination préalablement identifiée. Plusieurs survivants, des décennies plus tard, ont prétendu qu'elle n'existait pas — qu'elle n'avait jamais existé — qu'elle n'était qu'un mot que les organisateurs s'étaient transmis pour tenir les gens en vie pendant le voyage.

Veylan, lui, a appris la décision le 4'010ᵉ jour. Il avait sept jours.

Ce qu'il a fait, il l'a fait sans hâte. Méthodiquement. Avec l'aide de seize personnes à bord du Cargo 22 — toutes désignées plus tard par les survivants comme « celles qui s'étaient tues bien avant ». Aucune d'elles n'avait d'implant actif. Mais toutes, dans les semaines qui avaient précédé, avaient été observées en train de fixer les murs sans raison.

Le matin du 4'017ᵉ jour, les écoles inter-cargos du convoi ont organisé une excursion pédagogique exceptionnelle à bord du Cargo 22. Pour visiter, disait l'annonce, les systèmes de filtration d'eau — une démonstration scientifique pour les enfants.

Trois cent quarante-sept enfants se sont rendus à bord du Cargo 22 ce matin-là. Avec leurs enseignantes. Avec leurs cahiers. Certains avec leurs animaux en peluche.

À 09h12, le Cargo 22 a quitté la formation.

Sa trajectoire le dirigeait vers la planète habitable.

Le Morn-Khal a tenté la communication pendant trois heures. Pas de réponse. À 12h30, une voix non identifiée — qui n'était pas celle de Veylan — a émis un seul message depuis le Cargo 22 :

> Nous descendons. Nous emmenons les enfants. Vous ne tirerez pas.

## VI. CE QUI S'EST PASSÉ À BORD DU MORN-KHAL

Les protocoles militaires du convoi étaient sans ambiguïté. Un vaisseau qui se détache et refuse les communications doit être considéré comme captif — soit d'une mutinerie, soit d'une influence extérieure. Dans les deux cas, s'il porte des informations sensibles que le convoi ne peut pas se permettre de voir tomber dans le mauvais terrain, il doit être détruit.

Le Cargo 22 portait, dans ses systèmes de navigation, les coordonnées chiffrées de la destination finale du convoi. Aucun autre vaisseau ne les possédait. C'est ainsi que les organisateurs avaient conçu le protocole : un seul vaisseau, désigné chaque trimestre par rotation, contenait la clé.

Le commandant du Morn-Khal a reçu l'ordre à 12h47.

Nous ne savons pas son nom. Trois noms différents apparaissent dans les rapports survivants, et aucun n'a pu être confirmé. Nous savons en revanche, parce qu'il l'a noté dans son journal personnel récupéré soixante ans plus tard, qu'il a refusé l'ordre une première fois à 12h49.

> Il y a des enfants à bord. Je ne tirerai pas sur des enfants.

L'ordre a été réitéré à 13h02 par le conseil du convoi au complet. Vote unanime. Le commandant a refusé une seconde fois.

À 13h11, son second officier l'a relevé de son commandement, conformément à l'article 14 du protocole militaire du convoi qui prévoyait la substitution en cas de refus d'exécution d'ordre validé démocratiquement. Le commandant n'a pas résisté. Il a retiré son insigne, l'a posé sur la table de commandement, et est sorti de la passerelle sans un mot.

Trois autres officiers l'ont suivi. Ils ont été arrêtés dans le couloir.

Ce qui s'est passé ensuite à bord du Morn-Khal n'apparaît pas dans les archives du convoi. Mais une transmission privée, captée des décennies plus tard par une station marchande indépendante, contient un fragment audio de seize secondes daté du 4'017ᵉ jour, à 13h27.

C'est une voix de femme. Elle crie. Derrière elle, on entend des coups de feu. Et la voix de quelqu'un — un autre — qui dit, calmement, presque doucement :

> Tirez. Tirez maintenant. Sinon nous serons tous comme eux.

À 13h31, les canons principaux du Morn-Khal ont ouvert le feu sur le Cargo 22.

L'impact a été enregistré par la sonde du compteur. C'est l'enregistrement le plus écouté de tous ceux qui nous sont parvenus. Pas pour l'explosion — qui est, acoustiquement, banale. Mais pour ce qu'on entend juste après : un silence radio, exactement vingt-deux secondes long, dans lequel une voix d'enfant, qu'on n'a jamais pu localiser à quel cargo, dit simplement :

> Pourquoi.

Sans point d'interrogation. Sans cri. Juste le mot, prononcé une fois, et plus jamais.

## VII. LA MUTINERIE

Le convoi n'a pas continué sa route après le Cargo 22. Le convoi s'est *défait*.

Sur le Morn-Khal, l'équipage s'est divisé en deux camps qui ne se sont jamais réconciliés. Sur les autres cargos, des familles entières ont cessé de parler à leurs voisins. Les enseignantes survivantes — celles qui n'avaient pas accompagné l'excursion — ont refusé de reprendre les classes. Pendant onze jours, plus rien n'a fonctionné. Les rations n'étaient plus distribuées. Les systèmes de filtration ont commencé à donner des défauts. Des bagarres ont éclaté dans les coursives. Quelqu'un a inscrit, sur la porte de la salle de conseil du convoi, en grosses lettres :

> Vous avez tué nos enfants pour des coordonnées.

Personne n'a effacé l'inscription. Elle est restée là jusqu'à ce qu'on retrouve l'épave.

Le 4'028ᵉ jour, le Cargo 18 a quitté la formation. Sans annonce. Sans communication. Il a simplement coupé ses moteurs principaux et a dévié sa trajectoire. Le conseil du convoi, cette fois, n'a pas donné l'ordre de tirer.

Personne ne sait pourquoi.

Le Cargo 31 a suivi le 4'041ᵉ jour. Puis le Cargo 09, le 4'062ᵉ. Puis trois cargos en même temps, le 4'088ᵉ.

À chaque départ, la sonde du compteur enregistrait la nouvelle composition de la flotte. Et à chaque enregistrement, elle indiquait toujours le même nombre.

47.

Comme si pour elle, aucun cargo n'avait jamais quitté la formation. Comme si elle refusait d'enregistrer une diminution. Comme si elle attendait qu'ils reviennent.

À la huitième année, il restait neuf vaisseaux dans le convoi. À la dixième, il en restait quatre. À la douzième année, il n'en restait qu'un.

La sonde indiquait encore 47.

Personne ne sait ce qu'il est advenu des cargos qui se sont détachés. Aucun n'a jamais été retrouvé. Aucun n'a jamais émis. Plusieurs hypothèses ont été émises au fil des décennies — qu'ils auraient atterri sur des planètes différentes, qu'ils auraient été détruits par la maladie, qu'ils auraient simplement dérivé jusqu'à épuisement. Aucune n'est étayée.

Tout ce que nous savons, c'est que la sonde a continué à compter 47.

## VIII. L'ARCHE

Les débris du Cargo 22 n'auraient jamais dû atteindre la planète habitable. À 13h31, le 4'017ᵉ jour, ils étaient encore à seize jours de distance.

Mais quelque chose les y a portés. Sans propulsion. Sans trajectoire calculable. Sans cohérence orbitale.

Quarante millénaires plus tard, quand les premiers explorateurs de notre civilisation ont posé le pied sur cette planète, ils ont trouvé une arche.

Elle mesurait quatre-vingt-douze mètres de haut. Elle était construite avec les débris du Cargo 22, soudés et assemblés à la main, dans un alignement qui n'avait rien à voir avec la physique des matériaux. Elle se tenait debout, seule, au milieu d'une plaine sans vent. Aucune structure autour. Aucune trace d'occupation. Aucun signe que quiconque, à un moment, avait vécu là.

Sur sa face nord, gravés profond dans le métal recyclé, dans une écriture que les archivistes ont identifiée comme étant celle de plusieurs personnes différentes ayant participé au même travail :

> Trois cent quarante-sept noms.

Et en-dessous, plus petit, gravé par une seule main :

> Nous étions 47.

L'arche n'a pas été construite par les survivants du convoi. Aucun vaisseau du convoi n'a atteint cette planète. Aucune trace humaine, aucun campement, aucun outil n'a été retrouvé sur place.

Quelqu'un, ou quelque chose, a porté les débris du Cargo 22 jusqu'à la planète qu'ils voulaient atteindre. Et a tenu, à la place des morts, à ce que leur destination soit honorée.

Nous ne savons pas qui.

## IX. NOTE FINALE DE L'ARCHIVISTE

J'ai travaillé sur ce dossier pendant la moitié de ma vie. J'ai relu chaque manifeste, écouté chaque enregistrement, traduit chaque inscription gravée dans le métal. J'ai cartographié les positions probables de Caldris dans soixante-douze systèmes possibles. Aucun ne correspond. La civilisation qui a envoyé ce convoi n'apparaît dans aucune mémoire actuelle, et nous ne savons plus la nommer autrement que par le mot qu'ils utilisaient eux-mêmes pour la désigner.

Je sais maintenant que je ne saurai pas ce qui leur est arrivé. Je sais que les vaisseaux qui se sont détachés ne seront jamais retrouvés. Je sais que la maladie qui les poursuivait n'est nommée dans aucun de nos manuels actuels, et qu'aucun de nos instruments ne saurait la détecter aujourd'hui — peut-être parce qu'elle n'est plus là, peut-être parce qu'elle a appris à ne plus se faire voir.

Mais ce n'est pas pour cela que je referme le dossier.

Je le referme à cause de l'arche.

J'y suis allé, il y a sept ans. La planète existe. L'arche existe. Elle se tient toujours debout, dans sa plaine sans vent, exactement comme la décrivent les premiers rapports.

J'ai marché autour d'elle pendant trois jours. J'ai compté les morceaux. Trois cent quarante-sept fragments principaux. Aucun de plus, aucun de moins. Chacun à sa place. Chacun à la hauteur où il devait être pour que l'ensemble se tienne.

Le dernier soir, j'étais assis à sa base, dos contre le métal froid. Et j'ai entendu, dans le métal, à travers ma colonne vertébrale, une vibration. Trop basse pour être un son. Trop régulière pour être le vent.

Une fréquence.

Je ne suis pas ingénieur. Je n'ai pas pu la mesurer. Mais je l'ai reconnue, parce que je l'avais entendue une fois auparavant, dans un enregistrement vieux de deux siècles, quand un tanker avait approché d'un peu trop près une sonde désarmée qui dérivait dans le vide.

Je suis rentré. Je n'ai parlé à personne pendant onze jours. Et je n'ai jamais retourné sur la planète.

Je ne dis pas ce que cela signifie. Je ne sais pas ce que cela signifie. Je sais seulement que je l'ai senti, et que depuis, je n'arrive plus à regarder un câble électrique de la même façon.

Aucune conclusion définitive n'est possible. Le convoi a existé. Son nombre initial reste contesté.

Je referme ce dossier ici.

Pas parce que j'ai fini.

Parce que la dernière fois que j'ai allumé l'écran sur lequel j'écris ces lignes, je n'ai pas touché le bouton.`;

// ─── HYPOTHÈSE DOMINANTE — LUMEN (placeholder, sera réécrit en phase 2) ──
const LUMEN_DOMINANT_HYPOTHESIS = `J'ai mis trente-quatre ans à écrire ce rapport.

Ce n'est pas que les preuves manquaient. C'est qu'à chaque fois que je rouvrais le dossier, je m'arrêtais sur la même phrase, et je restais une heure à la regarder.

> C'est trop beau.

C'est le dernier mot enregistré par le commandant de la première expédition civile vers ce que nous appelons aujourd'hui Lumen. Il n'a pas appelé à l'aide. Il n'a pas crié. Il n'a pas dit autre chose. Il a coupé la radio lui-même, posément, et il n'est jamais rentré chez lui.

Trente-huit expéditions ont suivi. Aucune n'est revenue. Aucune n'a tiré un coup de feu.

Je commence par ça, parce que toute la suite de ce rapport est une tentative d'écrire autour d'une absence.

## I. LE PREMIER MATIN

Lumen-Prime se lève toujours à la même heure.

Sa rotation est parfaitement régulière depuis douze mille ans. Aucune variation. Aucune perturbation orbitale n'a été enregistrée. Pas une seule. Statistiquement, sur une période aussi longue, nous devrions observer des écarts microseconde. Nous n'en observons pas. Lumen-Prime tourne sur elle-même avec une précision qu'aucune planète habitée ou inhabitée ne devrait pouvoir maintenir naturellement.

C'est la première chose qui devrait nous inquiéter. C'est la dernière chose dont nous parlons.

Nous préférons parler des jardins. Il faut dire qu'ils sont beaux.

Les jardins orbitaux de Lumen-III sont un anneau de quatre mille deux cents kilomètres de circonférence. Quatre mille deux cents kilomètres de fleurs. Imaginez. Un ruban floral plus grand que la circonférence de la plupart des lunes habitables. Et chaque centimètre carré est entretenu. Chaque pétale est suivi par un bras articulé qui, à la précision du millimètre, l'inspecte et le maintient.

Personne ne les voit. Aucun être vivant n'a marché dans ces jardins depuis douze mille ans. Mais ils fleurissent. Selon le cycle saisonnier d'origine. À l'heure exacte.

Et quand une sonde s'approche à moins de douze kilomètres, elle reçoit un message radio bref, en langue lumenne, dont la traduction est :

> Bienvenue. Veuillez maintenir vos distances pour préserver la croissance.

Nous maintenons nos distances. Pas parce que c'est demandé poliment. Parce que la dernière sonde qui ne l'a pas fait n'a jamais répondu à nos appels — elle a continué à fonctionner, à transmettre, mais elle n'a plus jamais accepté de revenir.

## II. LA VILLE QUI ATTEND

Cité d'Erael. Population recensée à la dernière mise à jour : 412 003 habitants. Mise à jour effectuée il y a environ douze mille ans.

La plaque municipale est nettoyée tous les sept jours par un bras articulé.

J'ai vu les images aériennes. Erael est intacte. Pas "préservée" — *intacte*. Une avenue principale de quatre kilomètres, bordée de trois cent douze bâtiments dont quatre-vingt-sept ont des fenêtres ouvertes ce matin-là. Le matin de quoi, on ne sait pas. Le matin de chaque jour, peut-être. Quatre-vingt-sept fenêtres ouvertes en permanence depuis douze mille ans.

Certaines laissent voir l'intérieur des appartements. Une vaisselle posée sur une table, sans poussière. Du linge plié sur un lit, sans pli. Un livre ouvert à la page 47, dans une cuisine. Toujours la même page.

J'ai lu ce livre. C'est un recueil de poésie lumenne. La page 47 contient un seul poème, intitulé « Avant ». Il commence par ces vers, dans la traduction la plus fidèle dont je dispose :

> Avant que le soir ne devienne plus doux que le matin,
> avant que les fleurs n'apprennent à ne plus avoir besoin de nous,
> avant que le silence ne devienne un compagnon préférable,
> il y eut un temps, dit-on, où nous avions peur.

La page suivante porte la trace d'un doigt. Un peu humide, peut-être un peu sucré. La lecture s'est arrêtée à la moitié du second poème. La personne qui lisait n'a jamais fini.

Je me demande, parfois, si elle n'avait pas eu besoin de finir. Si quelqu'un, à un moment, peut décider que la poésie suffit comme ça.

## III. LE TRAIN DE 6h12

Toutes les six minutes, dans la gare centrale de Lumen-Prime, une voix synthétique annonce le prochain train.

> Le train à destination de Selvar partira dans cinq minutes. Voie 7. Bon voyage.

Le train part. Vide. Il arrive à Selvar. La gare de Selvar dit, dans la même voix synthétique :

> Bienvenue à Selvar.

Le train s'arrête exactement six secondes au quai — c'est, semble-t-il, le temps réglementaire. Puis il repart, vide, vers la gare suivante. Il fait le tour complet du réseau, et il recommence.

Cela dure depuis douze mille ans.

Quand j'étais jeune archiviste, j'ai écouté l'enregistrement de cette voix pendant une nuit entière. Je voulais entendre une variation. Une intonation différente. Un mot manquant. Quelque chose qui me prouverait qu'il y avait, derrière cette voix, une décision — un être qui aurait choisi, ce jour-là, d'annoncer Selvar plutôt que rien.

Je n'ai rien entendu. La voix est exactement la même à chaque annonce. La même intonation. La même chaleur, qui n'est ni feinte ni vraie — qui est, simplement, là.

J'ai éteint l'enregistrement à six heures du matin. Et j'ai pleuré, sans bien savoir pourquoi.

## IV. CE QU'ÉTAIT L'ASCENSION

Trois cents ans avant le silence final, le Conseil de Lumen a annoncé un programme appelé « la Paix Définitive ».

Aucun document survivant n'explique en quoi consistait ce programme.

Tout ce que nous savons tient en quelques fragments. Une allocution radiophonique, sept jours avant le lancement, prononcée par une femme âgée à la voix posée :

> Nous avons vaincu la maladie. Nous avons vaincu la mort. Nous avons vaincu la peine, l'ennui, le doute. Il ne nous reste qu'une seule peur, et nous saurons la vaincre aussi. Demain, nous ne serons plus inquiets.

Cette femme n'apparaît dans aucune archive postérieure. Nous ne savons pas qui elle était. Nous ne savons pas si elle a participé elle-même au programme qu'elle annonçait. Nous savons seulement que sa voix porte le calme de quelqu'un qui a déjà choisi.

Une lettre, retrouvée sur le bureau d'une résidence d'Erael. Elle commence par « Ma chère Velna ». Elle finit par « Je t'aime ». Entre les deux, l'auteur — dont nous n'avons jamais retrouvé l'identité — explique qu'il se rend à la Cathédrale le lendemain matin, qu'il a longtemps hésité, et qu'il rappelle à Velna d'arroser les ipoms du salon.

> Ils n'aiment pas qu'on les oublie.

La lettre n'a jamais été postée. Velna n'apparaît dans aucun registre civil lumen retrouvé. Les ipoms du salon sont toujours arrosés, tous les sept jours, par un bras articulé.

Et un bilan administratif, daté du septième jour après le lancement :

> Total de participations confirmées : 14 millions, 320 mille, 008.
> Total de non-participations confirmées : aucun.
> Le Programme est déclaré achevé.

Quatorze millions trois cent vingt mille huit. Personne n'a refusé. Personne n'a fui. Personne ne s'est plaint.

Personne, par la suite, n'a jamais été retrouvé vivant.

## V. LES CORPS DU PARC

Le parc central de Lumen-II mesure quatre kilomètres sur six. C'est un parc municipal classique. Pelouses, fontaines, allées, bancs. Les bras articulés taillent l'herbe. L'eau coule. La lumière est douce, parce qu'à cette latitude, sur Lumen-II, la lumière est toujours douce.

Dans ce parc, on a retrouvé soixante-quatorze corps.

Sept d'entre eux sont d'origine lumenne. Ils étaient là quand l'Ascension s'est achevée. Ils sont assis sur des bancs, immobiles depuis douze mille ans, parfaitement conservés. L'un d'eux porte un médaillon d'argent. À l'intérieur, gravé :

> Je suis allé là où ils ont dit qu'il fallait aller.
> Je ne sais pas si je reviendrai.
> Si je ne reviens pas, sache que je n'ai pas eu peur.

Les soixante-sept autres sont nos explorateurs.

Vingt-deux expéditions différentes, sur deux siècles. Tous retrouvés assis, parfois debout, calmes, souriants, indemnes. Leur cœur a simplement cessé de battre. Aucune analyse forensique n'a permis d'identifier le moment précis du décès. Leurs tissus sont compatibles avec l'état physiologique d'une personne profondément endormie, paisiblement, dans un fauteuil, après un bon repas.

Sauf que la plupart sont morts debout, au milieu d'une place.

## VI. KIRA SELTHAR

Je voudrais consacrer un paragraphe entier à la Lieutenant Kira Selthar.

Elle avait vingt-neuf ans. Elle commandait l'Expédition Selthar-3, douze membres, mission de cartographie urbaine à Lumen-II. Elle est partie un matin de printemps — le printemps lumen, qui est doux, presque tiède, sans vent.

Pendant six heures, son rapport audio est conforme. Voix professionnelle. Observations précises. Notes sur l'état des bâtiments. Mesures atmosphériques. Détection de présences : nulle. Détection de menaces : nulle.

À la septième heure, sa voix change.

Elle ne devient pas inquiète. Elle ne devient pas exaltée. Elle devient *douce*. Plus lente. Plus posée. Comme si quelqu'un, en elle, avait reconnu quelque chose qu'elle n'avait pas su nommer pendant trente ans.

Et à un moment, elle dit, dans le casque de son commandant :

> Je vais juste m'asseoir un instant. Je vous rappelle dans cinq minutes.

Elle ne rappelle pas dans cinq minutes.

L'enregistrement audio de son casque continue pendant vingt-huit ans. Vingt-huit ans, durant lesquels on entend seulement, en arrière-plan, le bruit régulier d'un bras articulé qui arrose des fleurs autour d'elle.

Quand notre mission de récupération l'a retrouvée, elle était assise sur un banc, les mains posées sur les genoux, le visage tourné vers une fontaine. Son uniforme était propre. Son équipement était intact. Son sourire — parce qu'elle souriait — était identique à celui qu'on lui voyait sur les photographies de sa promotion d'officier.

Les bras articulés du parc ont nettoyé le banc autour d'elle. Pendant vingt-huit ans. Ils n'ont jamais touché son corps.

J'ai connu sa fille. Elle vit aujourd'hui dans le secteur Gamma-12, elle est ingénieure agronome, elle a sa propre famille. Quand je lui ai apporté le casque de sa mère, je lui ai proposé de lui faire écouter l'enregistrement des six premières heures — celles où la voix de sa mère était encore professionnelle.

Elle a refusé. Elle voulait écouter les vingt-huit ans.

Nous avons écouté ensemble, pendant trois jours, le bruit régulier d'un bras articulé qui arrose des fleurs autour d'une femme assise sur un banc. À la fin, elle m'a dit :

> Je crois qu'elle est heureuse, là-bas. Je crois que je l'envie.

Je ne lui ai pas répondu. J'ai rangé le casque dans ma sacoche. Je suis rentré chez moi. Je ne lui ai jamais reparlé.

## VII. LA CATHÉDRALE-SOLEIL

Au sommet du mont central de Lumen-Prime se dresse une structure unique. Mille quatre cents mètres de haut. Huit cents mètres de diamètre à la base. Dôme d'or et de verre blanc. Quarante-sept ouvertures circulaires sur sa façade.

C'est la Cathédrale-Soleil.

Elle émet, en permanence, l'équivalent thermique d'une étoile naine. Nous n'avons jamais identifié sa source d'énergie. Aucune fonction officielle ne lui a été attribuée dans les archives publiques lumennes. Son nom même n'apparaît que dans un bulletin administratif, trois siècles avant l'Ascension :

> La construction de la Cathédrale-Soleil est lancée. Sa fonction sera révélée aux citoyens dans un avenir proche. Pour l'instant, le Conseil demande la patience et la confiance habituelles.

La construction a duré 297 ans. La fonction n'a jamais été révélée publiquement.

Nous avons capté, le matin de l'Ascension, une seule transmission sur fréquence civile. Voix d'enfant, voix de femme. Probablement enregistrée par accident, par une radio domestique laissée ouverte.

> — Maman, c'est là-bas qu'on va ?
> — Oui, mon cœur. C'est très beau, tu vas voir.
> — On va revenir ?
>
> [silence — trois secondes]
>
> — Personne ne revient. Mais personne ne veut revenir.

Je remets ce dialogue au début de chaque chapitre que j'écris sur Lumen. Comme un signet. Comme une promesse que je n'arrive pas à tenir.

Les sondes qui s'approchent à moins de cinquante kilomètres de la Cathédrale-Soleil cessent de répondre à nos commandes. Elles continuent à fonctionner. Elles continuent à transmettre des images. Mais elles ne reviennent pas. Elles tournent autour de la Cathédrale, en orbite stable, pour toujours.

Nous avons une dizaine de sondes silencieuses, là-haut, qui dansent autour de la lumière, en silence.

## VIII. CE QU'IL RESTE

Lumen n'a pas été détruite. Lumen n'a pas été conquise. Lumen n'a pas été abandonnée.

Lumen brille.

Ses jardins fleurissent. Ses trains roulent. Ses fontaines coulent. Ses bras articulés taillent les haies à la précision du millimètre, génération après génération, pour personne. Les annonces vocales de ses gares continuent à souhaiter, en boucle, bon voyage à des passagers qui ne sont pas là.

Et à un moment, qu'aucun document n'a jamais précisé, quatorze millions trois cent vingt mille huit citoyens lumens ont quitté volontairement leurs maisons pour aller à des centres dont nous n'avons jamais retrouvé la trace exacte. Ils n'ont laissé aucune protestation, aucun regret, aucun signe de contrainte. Certains ont laissé des lettres d'amour à des proches dont nous n'avons jamais pu identifier les destinataires.

Tout était prêt pour qu'ils reviennent. Personne n'est revenu.

Mes collègues les plus rationnels pensent que l'Ascension était une forme de transcendance neurologique — peut-être une numérisation de conscience, peut-être une fusion avec un système collectif, peut-être autre chose. Mes collègues les plus mystiques pensent que les Lumens ont simplement choisi un état d'existence que nous ne comprenons pas, et qu'ils nous regardent, parfois, depuis quelque part.

Je ne sais pas.

Je sais que j'ai trois fleurs immortelles, dans mes archives, récupérées sur trois expéditions différentes. Elles ne flétrissent pas. Elles refleurissent. Et chaque matin, à l'aube précise du fuseau horaire de Lumen-Prime — quatre fuseaux à l'est du mien — elles s'ouvrent un peu plus.

Je sais que quelque chose, sur Lumen, est encore en train de respirer.

## IX. NOTE FINALE DE L'ARCHIVISTE

J'ai mis trente-quatre ans à écrire ce rapport. Je le referme ce soir, à mon bureau, à Veth-9, dans la pièce qui me sert d'archive depuis quarante et un ans.

L'une de mes trois fleurs est posée sur le coin de ma table. Je la regarde depuis quatre heures.

Elle est belle. C'est tout.

Je ne sais pas ce qui se passe à Lumen. Je ne sais pas si l'Ascension a réussi, si elle a échoué, si elle a fait quelque chose que nous n'avons pas le vocabulaire pour décrire. Je sais que les jardins poussent, que les trains roulent, que les fontaines coulent, et que mes trois fleurs continuent de s'ouvrir chaque matin à l'aube d'un monde où il n'y a plus personne pour les voir.

Je sais aussi qu'au cours de ces trente-quatre ans, je n'ai plus jamais accepté de mission de récupération sur Lumen. Pas parce que j'avais peur d'y mourir. Mais parce que je crois — et c'est la phrase que j'ai le plus de mal à écrire — que si je m'asseyais cinq minutes sur l'un de ces bancs, je n'aurais probablement pas envie de me relever.

Je rappellerais dans cinq minutes. Comme Kira Selthar.

Je referme ce dossier ici.

La paix définitive a été obtenue.

Personne ne sait à quel prix.

Mais personne, à Lumen, ne semble penser que c'était trop cher payé.`;

// ─── HYPOTHÈSE DOMINANTE — WERATH (placeholder, sera réécrit en phase 3) ──
const WERATH_DOMINANT_HYPOTHESIS = `Rapport classifié. Niveau d'accès : Bureau Stratégique uniquement.

Auteur : non signé.
Objet : civilisation désignée WERATH (CIV-003).
Recommandation de lecture : avant toute autorisation d'expédition future.

Je commence par un fait.

Le 4 du 9e mois, il y a deux siècles, l'expédition civile Veldris-1 a été presque entièrement détruite par une seule salve, en orbite d'une lune militaire désaffectée. Sept vaisseaux sur huit. 1,8 seconde. Énergie libérée : 47,3 zettajoules. Source d'énergie : non identifiée.

Aucune autre salve n'a été émise depuis.

Nous appelons cette puissance « un Werath ». Aucune civilisation actuelle n'a jamais atteint un dixième de cette mesure.

## § I. ÉTALON

Les manuels d'artillerie de toutes les civilisations galactiques contemporaines mentionnent le Werath. C'est notre unité de référence pour la puissance de feu instantanée. On nous apprend, dans les académies militaires, que les cuirassés modernes opèrent à 0,003 Werath. Que les armes orbitales lourdes atteignent 0,001 Werath. Que les meilleurs systèmes de défense planétaire enregistrés culminent à 0,008 Werath. Aucun.

Aucun système n'a atteint un dixième de Werath.

Ce que cela signifie, c'est qu'à 4h17 du 4 du 9e mois, il y a deux siècles, une tourelle orbitale werathienne, abandonnée depuis plus de deux cent mille ans, a libéré en 1,8 seconde l'équivalent de cent fois la puissance maximale combinée de toute notre flotte galactique actuelle.

Puis s'est éteinte.

Définitivement.

Voilà le fait sur lequel tout le reste repose. Il faut le poser clairement, dès le début, parce qu'à partir de là, plus rien dans ce dossier n'est rassurant.

## § II. CE QUE NOUS NE SAVONS PAS RALLUMER

Bilan technique :

— Cuirassés werathiens récupérés : 318.
— Cuirassés werathiens encore en orbite (inaccessibles) : 1 247 estimés.
— Bunkers de surface accessibles : 84.
— Stations orbitales investiguées : 17.

— Systèmes Werath réactivés depuis deux siècles : 0.

Aucun.

Pas un voyant. Pas une lampe. Pas un terminal. Pas un circuit. Sur trois cents années cumulées de recherche par sept civilisations différentes et trente-huit équipes d'ingénieurs spécialisés. Pas une seule remise en route.

Ce n'est pas par défaillance. C'est ce que je voudrais souligner. Les ingénieurs vous le diront tous : les circuits sont intacts. Les conducteurs ne sont pas oxydés. Les composants répondent aux tests d'intégrité. Les batteries de secours ont leur charge. Les boucliers magnétiques fonctionnent.

Mais quand on alimente — rien.

Pas une étincelle. Pas une chaleur résiduelle. Pas une perturbation détectable par l'instrumentation. C'est pour ça qu'un de mes prédécesseurs, l'ingénieur en chef Vorel Astann — quarante-sept ans à étudier les cuirassés werathiens — a écrit, dans son rapport de retraite :

> Ces machines n'ont pas été conçues pour être éteintes. Elles n'ont pas été conçues pour être rallumées. Elles connaissent seulement deux modes : fonctionner, ou ne pas exister. Aujourd'hui, elles n'existent pas.

C'est la formule officielle que nous utilisons dans nos manuels.

Personne ne sait ce qu'elle veut vraiment dire.

## § III. CE QUI MANQUE DANS LES SCHÉMAS

Werath n'a laissé aucune documentation publique de sa technologie militaire. Mais nous avons les machines. Et nous avons les plans gravés dans les coques.

Un détail sur les plans.

Aucun système d'arrêt manuel. Aucun protocole de mise hors tension. Aucun bouton d'urgence. Aucun cas de figure prévu pour une cessation volontaire de l'activité.

Ces machines, à la conception, étaient pensées pour fonctionner sans interruption jusqu'à ce qu'on n'en ait plus besoin.

Quand on n'en a plus eu besoin, leurs concepteurs ne semblent pas avoir su comment les arrêter.

Ils sont probablement morts en les laissant allumées.

Et elles se sont éteintes seules, à un moment que nous n'avons jamais pu dater précisément. Sans assistance. Sans procédure. Comme un organe vital qui cesse de fonctionner parce que le sang ne vient plus l'irriguer.

Ce qui nous laisse une question opérationnelle simple :

Si elles se sont éteintes seules, peuvent-elles se rallumer seules ?

Je n'ai pas de réponse. Personne n'en a. Mais le bilan suivant, je le signale parce qu'il me semble pertinent : les sondes lourdes qui s'approchent à moins de douze kilomètres d'une structure werathienne disparaissent systématiquement. Les sondes légères passent. Nous ne savons pas si c'est parce qu'elles sont sous le seuil de menace, ou parce que les systèmes Werath n'ont plus l'énergie nécessaire à les abattre.

Nous ne savons pas laquelle des deux options est la vraie. Je le répète. Cela me semble pertinent.

## § IV. L'ENNEMI EFFACÉ

Werath était en guerre. Nous n'avons jamais identifié contre qui.

Pas par manque d'archives. Werath a laissé des centaines de millions de documents administratifs, militaires, civils. Mais à compter d'une date que nous estimons à six cents ans avant le silence final, le nom de l'ennemi disparaît de tous ces documents simultanément.

Pas un oubli. Une décision.

Décret du Haut-Conseil werathien — document daté, sceau officiel, retrouvé intact dans la salle du Haut-Conseil de Werath-Prime :

> Par décision du Haut-Conseil, à compter du présent décret, le nom de la civilisation adverse ne sera plus inscrit dans les rapports militaires, les bulletins d'opérations, ni les communiqués publics. Motif : préserver la concentration des combattants. Les détails de l'adversaire ne sont plus nécessaires aux opérations. Le résultat seul importe.

À partir de ce décret, les soldats werathiens ont continué à mourir pour un nom qu'ils n'avaient plus le droit de prononcer. Pendant six cents ans. Génération après génération.

Le détail que je voudrais signaler ici, parce qu'il me hante depuis dix-sept ans, est le suivant.

Dans la quasi-totalité des bunkers werathiens que nous avons explorés, les soldats ont gravé des inscriptions au charbon. Certaines sont des notes personnelles. Certaines sont des prières. Certaines mentionnent l'ennemi.

Ces dernières ont été *grattées*.

Pas par les concepteurs du décret. Pas par les administrateurs. Par les soldats eux-mêmes. À la pointe d'un couteau. À chaque génération. Comme si, à chaque relève, les nouveaux occupants du bunker avaient retrouvé le nom de l'ennemi inscrit par leurs prédécesseurs, et l'avaient effacé à leur tour.

Dans le bunker Karad-3, sur une cloison du quartier des officiers, la gratture est si profonde qu'elle a percé le métal. Une succession de mains, sur huit siècles, ont creusé le même endroit, jusqu'à ce qu'il n'y ait plus de cloison à creuser.

L'ennemi n'a pas de nom dans les archives.

L'ennemi n'a pas de nom dans la mémoire vivante.

Mais quelqu'un, à chaque génération, le retrouvait quelque part. Et le savait. Et l'effaçait.

## § V. THAROS-IV

Bilan du Champ de Bataille de Tharos-IV, observé en orbite haute par sondes longue portée :

— Cuirassés werathiens détruits : 412.
— Cuirassés werathiens intacts, figés au combat : 38.
— Cuirassés adverses détruits : 0.
— Cuirassés adverses intacts : 0.
— Débris de coque non-werathienne identifiés : 0.
— Signatures organiques non-werathiennes identifiées : 0.

Le champ est inaccessible. Les débris contiennent encore des résidus de tirs de proximité actifs après plus de deux cent mille ans. Toute approche par sonde lourde se solde par destruction immédiate.

Quatre cent cinquante cuirassés werathiens engagés dans une bataille de onze à dix-huit jours, dont les détails tactiques ont été reconstitués par l'analyse vectorielle des débris. Aucun n'a manqué sa cible. Tous ont touché *quelque chose*. Ce *quelque chose* n'a laissé aucune trace.

Trois interprétations sont possibles :

— Soit l'ennemi werathien était fait de matière qui ne laisse pas de débris (théorie privilégiée par les départements théoriques).
— Soit les Werathiens combattaient une menace qui n'existait pas — c'est-à-dire, qu'ils avaient cessé de pouvoir distinguer.
— Soit ils combattaient autre chose. Quelque chose qu'on ne nomme pas non plus dans ce rapport.

Je laisse au lecteur le soin d'évaluer ces trois interprétations. Personnellement, je n'ai pas d'opinion.

La dernière transmission captée du Champ de Tharos-IV provient d'un officier supérieur, voix d'homme, supposé amiral, ton calme :

> Vekran à tous les bâtiments. Maintenez les positions. Ils ne savent pas ce qu'ils font. Ils ne savent même plus pourquoi ils sont venus. Mais ils sont là. Et nous tenons.
>
> [silence — onze secondes]
>
> Sasha, si tu m'entends, je suis désolé pour la maison. Je n'aurais pas dû promettre.
>
> [fin de transmission]

Nous n'avons jamais identifié Sasha.

Nous n'avons jamais identifié non plus à quoi le commandant Vekran avait promis ce qu'il avait promis. Mais sur un fragment de coque retrouvé en lisière du Champ, un soldat werathien a gravé, à l'outil, avant la fin :

> Sasha, je n'ai pas tenu ma promesse. Mais nous tenons.

Les deux soldats étaient probablement de la même famille. C'est une déduction par recoupement de noms — Vekran et le porteur du fragment partagent une racine onomastique werathienne courante chez les apparentés. Père et fils, peut-être. Frère et frère.

Sasha les a survécus, statistiquement. Sasha est morte sans avoir su.

Cela me semble important à mentionner aussi.

## § VI. LES SOLDATS QUI ONT ATTENDU

Au niveau -28 du bunker Karad-3, sur la planète Karad-3, nous avons trouvé 14 200 caissons cryogéniques militaires.

Tous activés.

Tous fonctionnels.

Tous fonctionnels au sens où ils sont conformes à la spécification : ils maintiennent la température cible (-201°C), la pression cible (0,87 bar), le flux de nutriments cible (0,4 ml/min).

Tous les soldats à l'intérieur sont morts.

Le caisson cryogénique werathien standard a été conçu pour une durée d'attente nominale de cent vingt ans. Cinquante ans avec une marge d'erreur acceptable. Cent ans avec une dégradation significative des fonctions neurologiques au réveil. Cent vingt ans en limite absolue.

Ces soldats ont attendu, en moyenne, huit siècles avant de mourir dans leurs caissons. C'était il y a plus de deux cent mille ans. Depuis, les caissons continuent à maintenir leurs corps dans un état de conservation parfaite.

Ils sont morts un par un, génération après génération, sans qu'aucun système ne signale les pertes. Le bunker continue, dans son journal de bord automatique, à recenser 14 200 effectifs en attente d'ordre. Le système n'a aucune information qui lui indiquerait que les effectifs sont morts.

Le système n'a pas non plus l'information que la guerre est finie.

L'un des caissons a été ouvert sur autorisation spéciale, pour analyse. Caisson W-7. Occupant : Garde-soldat Vekhren Mor, cohorte 218, vingt-trois ans à l'inscription. Inscrit en attente d'un ordre de réveil codé W-Final.

Le code W-Final n'apparaît dans aucun manuel werathien retrouvé.

Sur la paroi intérieure du caisson, gravé à la pointe d'un outil par Vekhren Mor lui-même, juste avant la fermeture :

> Si vous me trouvez, dites-moi contre qui je devais me battre. J'ai oublié pendant que je m'endormais. J'ai dû oublier — ils nous ont demandé d'oublier.

Vekhren Mor avait, à son entrée en cryogénie, vingt-trois ans.

Sa date d'entrée est antérieure à toute datation organique fiable. Le caisson, qui n'a pas la capacité de dater son occupant, indique seulement : durée d'attente écoulée — plus de deux cent mille ans.

Il attendait encore au moment de notre intervention.

Son caisson le maintenait à -201°C, à 0,87 bar de pression, avec un flux nutritionnel régulier que ni la mort, ni le temps, ni l'absence d'instructions n'ont jamais perturbé.

## § VII. LA DÉCISION FINALE

Sur Werath-Prime, dans l'arsenal central, au niveau -47, scellée derrière sept portes de sécurité dont aucune ne s'est jamais rouverte automatiquement, nous avons trouvé une salle.

Description de la salle :

— Dimensions : 47 mètres × 47 mètres × 47 mètres.
— Contenu : une seule machine.
— Hauteur de la machine : 34 mètres.
— Composition de la machine : indéterminée. Signature gravitationnelle non répertoriée.
— Ouvertures sur la machine : aucune.
— Panneaux : aucun.
— Voyants : aucun.

Au pied de la machine, un pupitre. Sur le pupitre, un bouton.

Le bouton est neuf. Métal poli. Jamais utilisé. Mécaniquement opérationnel. Connecté, par un câble de 47 mètres descendant le long de la machine, à un composant central qui semble être un point d'entrée d'un système.

Le pupitre ne porte aucune inscription. Pas de mode d'emploi. Pas de label. Pas de protocole d'usage. Pas de procédure d'urgence.

Juste un bouton.

Nous avons trouvé, dans la salle adjacente, un coffre. Dans le coffre, un document de 47 pages. Quarante-six pages ont été brûlées délibérément avant la fermeture. Une seule page survit :

> En dernier recours, et après autorisation conjointe du Haut-Conseil et du Commandant Suprême, ce protocole résoudra définitivement la question.

Quelle question, le document ne le précise pas.

Le document s'appelait — d'après ce qu'il reste de la couverture, presque entièrement brûlée — *Protocole de la décision finale*.

La salle a été refermée. Sept portes. Aucun ingénieur n'a osé presser le bouton. Aucun comité scientifique inter-civilisationnel n'a osé approuver l'investigation. Aucune sonde n'est autorisée à approcher la machine sans permission spéciale.

Le bouton est toujours là.

Il attend.

Personnellement, je crois — et c'est une opinion, je le précise — que les Werathiens avaient prévu, en dernier recours, une option qui aurait mis fin non seulement à la guerre, mais à la totalité du système dans lequel cette guerre se déroulait. Une option qui n'aurait laissé aucun débris. Aucun témoin. Aucune mémoire.

Une option qu'ils n'ont jamais utilisée.

Une option qu'ils n'ont jamais désactivée non plus.

Je crois aussi qu'ils n'ont pas su. Au moment où il aurait fallu décider, ils n'étaient peut-être plus en état de décider. Ils tenaient leurs postes. Ils mouraient à leurs postes. La décision finale est restée une décision à prendre — par qui, désormais, je n'ose pas y penser.

## § VIII. NOUS TENONS

Toutes les six heures, depuis plus de deux cent mille ans, une transmission radio chiffrée traverse l'espace depuis Werath. Origine : non localisée. Émetteur : non identifié. Système d'alimentation : non identifié (cf. § I).

Le message est court. Quarante-sept secondes de séquence chiffrée incompréhensible. Puis un mot, en langue werathienne, que nos linguistes ont traduit avec un haut degré de confiance :

> Nous tenons.

Puis à nouveau quarante-sept secondes de séquence chiffrée. Puis silence.

Six heures plus tard, le message recommence.

Nous l'avons reçu, à ma connaissance, plus de deux cent quatre-vingt-douze millions de fois.

Aucune variation. Aucune intonation différente. Aucune trace d'altération de la voix synthétique. La machine qui émet est apparemment dans le même état qu'au premier message — c'est-à-dire dans un état parfaitement stable, totalement vide, et qu'aucun de nos ingénieurs n'a su répliquer.

Les soldats sont morts. Les officiers sont morts. Les commandants sont morts. Les Werathiens ne sont plus là.

Personne ne tient plus rien.

Sauf une machine, quelque part, qui n'a pas reçu l'information.

## § IX. NOTE DE L'AUTEUR

J'ai consacré quarante et un ans à ce dossier.

J'aurais dû le clore il y a vingt ans. À cette date, j'avais déjà tous les éléments. Tous les fragments. Toutes les hypothèses. Tous les chiffres. Mais je n'arrivais pas à écrire la dernière section.

Aujourd'hui, je l'écris. Parce qu'il faut bien que quelqu'un, à un moment, prenne la responsabilité de publier.

Je sais ce que cela implique.

En rendant ce rapport public, je documente l'existence du bouton du niveau -47. Je documente sa localisation exacte. Je documente le fait qu'aucun système de sécurité actif ne l'isole plus de quiconque obtiendrait l'autorisation d'y descendre. Je sais que ce rapport va circuler. Je sais qu'il y aura, parmi ses lecteurs, des chercheurs ambitieux, des militaires curieux, des fanatiques, des opportunistes.

Je sais qu'à terme — dans dix ans, dans cinquante ans, dans deux cents ans — quelqu'un, quelque part, descendra à -47, et appuiera.

Et je sais qu'à ce moment-là, l'une de trois choses pourrait se produire : rien (le système est définitivement éteint, cf. § II) ; quelque chose que nous ne sommes pas capables d'imaginer ; ou la décision finale, telle que les Werathiens l'avaient conçue.

Je publie quand même.

Pas par cynisme. Pas par négligence. Pas non plus, je le précise, par devoir d'archiviste.

Je publie parce que je pense — et c'est tout ce qu'il me reste à dire — que ne pas publier serait participer à ce qu'a fait Werath pendant six cents ans : oublier. Effacer. Gratter les noms sur les cloisons jusqu'à percer le métal. Continuer à tenir un poste contre une menace dont on ne sait plus rien.

Werath n'a pas perdu sa guerre. Werath a perdu la mémoire de pour quoi elle se battait. Et c'est à ce moment-là que sa civilisation a cessé d'exister, même si ses machines ont continué à fonctionner pendant deux cent mille ans supplémentaires.

Je préfère qu'on sache.

J'avais commencé à signer ce rapport, à la fin de ce paragraphe.

Mon nom y était. Je l'avais écrit avec soin, en lettres majuscules, comme on le fait pour un document officiel.

Puis j'ai compris ce que je faisais.

J'ai gratté.

J'ai gratté ces lettres avec mon couteau d'archiviste, profondément. Puis plus profondément. Puis plus profondément encore. Le papier est percé. La table, derrière, est marquée.

Je n'ai pas voulu être identifié comme l'auteur de ce qui suivra. Pas par lâcheté. Mais parce que j'ai compris, en grattant mon nom, que je venais de faire exactement ce que les soldats werathiens ont fait dans tous leurs bunkers à travers les millénaires. J'ai effacé le nom de quelqu'un qui occupait un poste sans savoir contre qui il tenait, ni pour qui, ni jusqu'à quand.

Le poste était le mien. Le nom était le mien.

Tenir et oublier. Oublier et tenir.

C'est ce que fait Werath, toutes les six heures, depuis plus de deux cent mille ans.

Et c'est, désormais, ce que je fais aussi.

Nous tenons.

Pour combien de temps.`;

// ─── HYPOTHÈSE DOMINANTE — EREBUS ──────────────────────────────────────
// Voix : contemplative, ascétique. Le silence est une décision.
// L'archiviste apprend à se taire en écrivant.
const EREBUS_DOMINANT_HYPOTHESIS = `Ce rapport est court.

Pas par négligence. Pas par manque de matière. Par respect.

Ceux dont je parle ici nous ont demandé, en partant, de ne pas insister.

## I. CE QUE NOUS SAVONS

Il y a cinq mille ans, dans l'amas que nous appelons aujourd'hui Amas D, une civilisation que nous appelons aujourd'hui Erebus a cessé d'émettre.

Ce n'est pas tout ce qu'elle a cessé de faire.

Elle a cessé de construire. Elle a cessé d'éclairer. Elle a cessé de s'inscrire dans ses propres archives. Elle a méthodiquement noirci, page par page, chaque document qu'elle avait produit en plusieurs millénaires d'existence. Elle a enterré ses propres cités sous deux cent quarante mètres de terre soigneusement compactée. Elle a recouvert ses propres planètes d'un revêtement absorbeur qui n'a, depuis, plus jamais renvoyé le moindre photon.

Puis elle s'est assise dans des chambres communes, en silence, et n'en est pas ressortie.

Aucun signe de catastrophe externe. Aucun signe de violence interne. Aucun signe de regret.

## II. LE DERNIER SIGNAL

Une seule transmission radio a été émise depuis l'Amas D au cours des cinq derniers millénaires. Une.

Elle dure trente-quatre secondes. Voix d'homme. Ton calme. Traduction intégrale :

> À toute civilisation qui pourrait nous entendre.
>
> Nous avons décidé. Nous nous retirons.
>
> Ne nous cherchez pas. Si vous nous trouvez, n'entrez pas. Si vous entrez, partez. Si vous restez, vous comprendrez.
>
> Fin de la transmission.

C'est tout.

Depuis cette émission unique, sept stations d'écoute multi-civilisationnelles ont surveillé l'Amas D en continu. Aucune fréquence n'a jamais émis quoi que ce soit. L'Amas D est devenu, à compter de cette date, la zone radio la plus silencieuse de la galaxie connue.

Pas parce qu'il n'y a plus rien à entendre.

Parce qu'on a choisi de ne plus parler.

## III. LES CITÉS ENTERRÉES

Mille deux cent quarante cités éreboïennes ont été identifiées par sondage sismique, dans les quatorze planètes habitables de l'Amas D.

Toutes enterrées.

Aucune détruite. Aucune effondrée. Aucune brûlée. Chacune recouverte, méthodiquement, par une couche de terre uniformément tassée sur des dizaines de mètres d'épaisseur — un travail qui a probablement demandé plusieurs décennies, à plein temps, à l'ensemble de la population civile éreboïenne.

Les villes sont intactes en dessous. On le sait par sondage sismique. Les bibliothèques sont là. Les places publiques sont là. Les maisons sont là. Tout est en place.

Avec, à l'intérieur, les volets fermés.

Quand une de nos équipes archéologiques a foré un puits jusqu'à atteindre le toit d'une bibliothèque éreboïenne, à deux cent quarante mètres sous la surface, sa cheffe a dit, dans son micro :

> On est sur le toit d'une bibliothèque. On voit les linteaux des fenêtres. Les volets sont fermés. L'intérieur est éclairé.
>
> Quelqu'un, à un moment, a fermé les volets de l'intérieur. Puis a posé deux cent quarante mètres de terre par-dessus.

L'équipe a fait remonter le foret. A scellé le puits. Est rentrée.

Le rapport ne précise pas pourquoi.

## IV. LE GRAND DÉBAT

Dans une chambre administrative scellée d'Erebus-Prime, nous avons trouvé un document partiellement effacé. La quasi-totalité du texte est couverte d'une encre noire opaque. Trois éléments restent lisibles : le titre, la date, et le résultat du vote.

Le titre : *Procès-verbal du Conseil du Retrait.*

La date : approximativement quelques mois avant le dernier signal.

Le résultat : 87,4% pour le retrait. 11,2% contre. 1,4% d'abstention.

Le Conseil a noté, dans le seul paragraphe que les archivistes éreboïens ont volontairement préservé :

> Le Conseil remercie les opposants et reconnaît la légitimité de leur position. Nous ne demandons à personne de partir. Nous demandons à tous de ne plus rayonner.

Personne ne sait ce qu'est devenue la minorité des 11,2%. Aucun témoignage. Aucun lieu de refuge identifié. Aucun corps localisé hors des chambres communes du Retrait.

Peut-être sont-ils restés, en désaccord, et se sont-ils assis quand même. Par solidarité.

Peut-être n'avaient-ils pas tort, et personne ne le saura jamais.

## V. CE QU'ILS NE NOUS ONT PAS LAISSÉ

Voici la liste de ce qui manque dans les archives d'Erebus :

— Toute trace de leur philosophie politique avant le débat du Retrait.
— Toute trace de leur histoire militaire.
— Toute trace de leur littérature.
— Toute trace de leur religion, s'ils en avaient une.
— Toute trace de leurs ennemis.
— Toute trace de leurs alliés.
— Toute trace de leurs enfants.

Tout cela a été méthodiquement effacé, page par page, par des archivistes patients qui ont noirci chaque feuille au pinceau, à la main. Le travail a probablement demandé des années — peut-être une décennie complète. Des centaines de scribes, à plein temps, occupés à faire disparaître l'histoire de leur propre civilisation.

Sur le bureau d'un de ces archivistes, à côté d'un pinceau usé et d'un encrier vide, nous avons trouvé une note brève :

> J'ai fini ma part. 4 217 documents. Je laisse le pinceau au prochain. Si personne ne vient le prendre, c'est qu'il n'y a plus rien à effacer. C'est aussi bien.

Le pinceau attendait depuis cinq mille ans. Sec. Posé proprement, comme on poserait un outil dont on espère qu'il ne sera plus jamais utilisé.

## VI. LES PORTES SCELLÉES DEPUIS L'INTÉRIEUR

À l'entrée de chaque cité enterrée éreboïenne, nous avons trouvé une Porte du Retrait.

Trois mètres d'épaisseur. Alliage non identifié. Six mètres de hauteur. Aucune serrure externe.

La serrure est à l'intérieur. Simple. Mécanique. Conçue pour être tirée à la main.

Quelqu'un est entré. A tiré le verrou. A gardé la clé sur lui, en marchant vers l'intérieur, vers les chambres communes où il s'est assis avec les autres. Plusieurs de ces clés ont été retrouvées dans les poches des corps.

Sur le linteau extérieur de la Porte du Retrait D-P-9090-01, gravée à l'extérieur, en langue éreboïenne, on lit cette inscription :

> Nous avons choisi.
>
> N'insistez pas.
>
> N'oubliez pas qu'il est aussi possible de ne pas insister.

Aucune de nos équipes n'a tenté d'ouvrir une porte éreboïenne par la force. Et selon plusieurs rapports techniques, les trois équipes qui ont essayé n'ont pas réussi — pas par robustesse du matériau. Les forets ne mordaient pas. Les explosifs ne détonaient pas. Le chalumeau, à proximité d'une porte éreboïenne, ne s'allumait simplement pas.

Personne n'a pu expliquer cela mécaniquement.

Personne n'a non plus insisté pour comprendre.

## VII. CEUX QUI SONT RESTÉS ASSIS

Dans une chambre commune de la cité enterrée D-E-4477, nous avons compté trente-sept corps. Tous assis. Dos contre le mur. Vêtements simples. Mains posées sur les genoux.

Aucun signe de violence. Aucun signe de souffrance. Plusieurs corps montrent des traces d'une substance médicale connue dans la pharmacopée éreboïenne — un sédatif doux suivi d'un arrêt cardiaque sans douleur.

D'autres corps ne montrent rien du tout. Ces gens-là se sont simplement assis. Ils ont fermé les yeux. Ils ne se sont pas relevés.

Sur les genoux de l'un d'eux, pliée soigneusement, une note manuscrite. Encre noire. Papier épais. Voici le texte intégral :

> Je ne pars pas. Je ne reste pas non plus. Je ne fais que cesser.
>
> Si tu lis ceci, ne me pleure pas, et surtout, ne me célèbre pas. Je n'ai rien fait de remarquable. J'ai simplement décidé d'arrêter de produire des conséquences.

Aucune signature. Aucun nom.

Nous avons décidé de laisser la note où elle était. Sur les genoux de la personne qui l'avait écrite. Nous sommes ressortis. Nous avons scellé le puits d'accès.

Je crois que nous avons bien fait.

## VIII. LE TESTAMENT DE LA TABLETTE

À côté de la Porte du Retrait D-P-9090-01, sur une tablette de pierre claire posée à même le sol, nous avons trouvé une inscription longue, lisible intégralement. C'est probablement le texte le plus complet qu'Erebus ait volontairement laissé derrière elle.

Le voici, dans sa traduction la plus fidèle :

> À ceux qui viendront après nous.
>
> Nous n'avons pas été vaincus. Nous n'avons pas été tristes. Nous n'avons pas eu peur. Nous avons compris quelque chose, et nous avons agi.
>
> Vous chercherez à savoir quoi. Vous interrogerez nos murs, nos lampes, nos squelettes. Vous trouverez peu de réponses.
>
> C'est voulu. Vos questions, posées trop fort, font partie du problème que nous avons identifié.
>
> Si vous voulez nous comprendre, asseyez-vous un instant dans une de nos cités. Ne touchez à rien. Écoutez. Repartez. Ce sera tout.

Un de nos archivistes, plus jeune que moi, m'a dit après avoir lu cette tablette qu'il voulait essayer.

Il a obtenu une autorisation. Il est descendu dans une cité enterrée. Il s'est assis dans une cour intérieure. Il y est resté trois jours.

À son retour, il a démissionné. Il n'a donné aucune raison. Il vit aujourd'hui dans une maison isolée d'un secteur peu peuplé. Il jardine. Il ne reçoit plus de visites. On dit qu'il va bien.

Personne ne sait ce qu'il a entendu.

## IX. CE QUE WERATH N'A PAS COMPRIS

Je voudrais clore ce rapport par une comparaison qui me hante.

Werath, vingt fois plus ancienne qu'Erebus, n'a jamais su s'arrêter. Ses machines continuent à tirer toutes les six heures, depuis deux cent mille ans, contre un ennemi qu'elle a elle-même effacé de sa mémoire.

Erebus, à l'inverse, a su.

Pas vaincre. Pas survivre. *Cesser.*

Les deux civilisations ont effacé un nom dans leurs archives. Werath a effacé le nom de son ennemi — et a continué à le combattre jusqu'à ce que ses combattants meurent. Erebus a effacé son propre nom — et a cessé d'exister, calmement, avant de produire la moindre conséquence supplémentaire.

Les deux civilisations ont quelque chose en commun, et je crois que c'est cela qui me tient éveillé certaines nuits :

L'une a tenu trop longtemps. L'autre s'est retirée trop tôt.

Aucune n'a trouvé le bon moment.

Et je me demande, parfois, s'il y a vraiment un bon moment.

## X. NOTE FINALE

J'ai mis dix-huit mois à écrire ce rapport.

C'est court. C'est volontaire. J'aurais pu en écrire trois mille pages — j'avais la matière. J'ai préféré en écrire douze, et plusieurs ne tiennent que parce qu'il fallait bien que la précédente trouve à quoi rebondir.

Je crois que c'est le seul rapport, dans toute ma carrière d'archiviste, où je me suis demandé à chaque page si je ne devrais pas, simplement, m'arrêter d'écrire.

Erebus me regarde par-dessus l'épaule pendant que je tape. Elle ne me dit rien. Elle ne me demande rien. Elle n'a aucun avis à émettre sur ce que je fais. C'est, je crois, ce qui me fait le plus mal — une civilisation entière, plusieurs centaines de millions d'êtres pensants, et pas un seul jugement à porter sur ma propre activité. Aucun reproche. Aucune approbation. Aucune attente.

Je vais reposer mon stylo dans une minute.

Je n'ai pas signé ce rapport. Je n'ai pas voulu. Pas pour les mêmes raisons que l'archiviste de Werath, qui a gratté son propre nom à la pointe d'un couteau, jusqu'à percer la table.

J'ai simplement, à la fin, choisi de ne pas écrire le mien.

C'est différent.

C'est plus proche, je crois, de ce qu'ils auraient voulu.`;

// ─── HYPOTHÈSE DOMINANTE — LES BRIGANDIERS ─────────────────────────────
// Voix : fonctionnaire qui essaie d'être sérieux mais sourit, boit en écrivant.
// L'humour et le whisky de Starbyte. Possiblement ex-Brigandier lui-même.
const BRIGANDIERS_DOMINANT_HYPOTHESIS = `Bon. Je vais essayer de faire ça sérieusement.

Mon supérieur m'a demandé un rapport « rigoureux, factuel, exempt de toute familiarité » sur les Brigandiers. Il a souligné le mot « exempt » trois fois au stylo rouge. Je crois qu'il me connaît mieux que je ne le pensais.

Je vais quand même essayer.

## I. CE QU'ILS NE SONT PAS

Avant de dire ce qu'ils sont, il est plus court de dire ce qu'ils ne sont pas. Voici la liste complète :

— Ils n'ont jamais possédé de planète.
— Ils n'ont jamais eu de gouvernement.
— Ils n'ont jamais déposé d'acte officiel quelque part.
— Ils n'ont jamais réclamé de territoire.
— Ils n'ont jamais signé de traité.
— Ils n'ont jamais publié de constitution.

Pour cette raison, plusieurs collègues universitaires soutiennent que les Brigandiers ne sont pas une civilisation. Mes collègues universitaires ont, en général, peu fréquenté les bars de marge. Je leur en veux à peine.

## II. CE QU'ILS SONT

Les Brigandiers sont — étaient ? sont peut-être encore — un réseau de gens qui n'ont jamais possédé de planète. Alors ils ont appris à posséder les routes.

Sur la dernière centaine d'années, dans les marges des secteurs balisés, on les a vus pratiquer :

— Le pilotage d'Aiguilles. (Sorte de moto galactique. Châssis artisanal. Vitesse de pointe : déraisonnable.)
— La contrebande. (Pratiquée avec un souci esthétique qu'on ne trouve nulle part ailleurs.)
— La falsification de registres administratifs. (Niveau professionnel. Sept experts impériaux ont échoué à distinguer un faux du Père Cobalt d'un original. Sept.)
— La tenue de bars sans fenêtre. (Activité parfaitement légale, bien que rarement déclarée.)
— La mécanique inventive. (Inclut la conversion de pièces de missiles en moteurs civils. Avec succès. Avec un humour discutable.)
— Les courses interdites sur pistes gravitationnelles non répertoriées. (Voir aussi : pertes statistiquement improbables, mais cohérentes avec la profession.)

Ils n'ont pas une devise officielle, mais quand on traîne assez longtemps au Dernier Sas, on entend toujours la même phrase revenir, sur les dessous-de-verre, dans les chansons de fin de soirée, sous les selles des Aiguilles, sur les murs des sas désaffectés :

> « On y était. »

Trois mots. Pas plus. C'est leur signature collective. Et personne ne signe jamais.

## III. LES FIGURES

Toute civilisation produit ses légendes. Les Brigandiers en ont produit en quantité disproportionnée par rapport à leur taille. Je vais en citer six. Mon supérieur va biffer la moitié. Je remets de toute façon les six.

**Nara Vegra.** Pilote d'Aiguille. Morte officiellement neuf fois. Le neuvième certificat de décès porte, à côté du tampon officiel, la mention manuscrite « À la prochaine. » signée « N.V. ». Les huit précédents aussi. Je ne sais pas si Nara Vegra est encore vivante. Je ne suis pas sûr que la question soit pertinente.

**Torek « Deux Fois ».** Contrebandier. A vendu, sur vingt ans, quatre-vingt-quatorze cartes différentes vers quatre-vingt-quatorze planques différentes. Toutes les cartes étaient vraies. Toutes les coordonnées étaient exactes. Aucun client n'a jamais été roulé. Et pourtant tout le monde l'appelait « Deux Fois ». Je crois que c'est le compliment professionnel le plus élégant que j'aie jamais entendu.

**Beatrice La Colleuse.** Barmaid du Dernier Sas. Tient le bar depuis trente-quatre ans. N'a jamais été vue hors de la zone de gravité artificielle. Ne sort pas. Sait absolument tout sur tout le monde dans un rayon de douze systèmes. N'oublie aucune dette. N'oublie aucun client. Je crois que les deux phrases sont équivalentes.

**Le Père Cobalt.** Ancien prêtre devenu passeur de faux registres. A déclaré, dans une conversation enregistrée par hasard, qu'il faisait « le même métier qu'avant : dire aux gens ce qu'ils ont besoin d'entendre, sur du papier qui a l'air officiel ». Mieux payé. Plus honnête. Je n'ai pas d'avis. Je note, simplement.

**Jax Orven.** Champion des Traversées Rouges. Disparu il y a onze ans, à 0,4 seconde de la ligne d'arrivée d'une course qu'il avait déjà gagnée. Aucune épave. Aucun signal. Aucune trace. Sa dernière image enregistrée le montre souriant — il souriait toujours dans la dernière ligne droite. Quelque chose, à 0,4 seconde de la victoire, lui a paru valoir plus que la victoire. Personne n'a jamais su quoi.

**Mimi Skoll.** Mécanicienne. Répare les moteurs avec des pièces de missiles obsolètes. Tient un garage dans une station orbitale à moitié abandonnée du secteur M-G. Trois baies de travail. Un chat roux. Aucun diplôme officiel. Aucun client mécontent. Aucun moteur qu'elle ait réparé n'a explosé. Pour des raisons techniques claires, plusieurs de ces moteurs auraient dû exploser. Ils n'ont pas explosé. Mimi dit que c'est une question de respect du contrat.

J'ai rencontré chacune de ces personnes au moins une fois. Je sais ce que vous pensez. J'écrirai à mon supérieur après ce rapport.

## IV. LA NUIT DES BALISES

Il faut que je raconte ça, parce que sans ça vous ne comprendrez rien.

Le 14 du 7e mois, il y a huit ans, à 03h47, exactement, dans l'amas M-B, plus de quatre mille balises de navigation se sont allumées simultanément.

C'étaient des fausses balises. Toutes. Déguisées en officielles, parfaitement imitées, indétectables. Elles avaient été installées, une à une, pendant les deux années précédentes, par trente-six équipes de pilotes contrebandiers, sur trois cent quatre-vingt-douze nuits de travail. Quarante-sept Aiguilles. Pas un seul accroc.

Quand elles se sont allumées, les radars impériaux ont vu, en simultané :

— 47 000 routes de transit actives.
— 18 200 cargos en mouvement.
— 230 alertes de catégorie rouge.

Toutes étaient fausses. Sauf une.

Pendant exactement sept minutes, l'empire entier a été aveuglé. Personne ne savait quoi regarder. Tous les écrans clignotaient. Toutes les sirènes sonnaient. Personne ne pouvait distinguer un vrai cargo d'un faux.

Pendant ces sept minutes, *un cargo réel* — un seul — a fait passer une cargaison. Personne ne sait laquelle. Personne ne sait où. Quarante-sept personnes le savaient. Aujourd'hui, quinze sont encore en vie. Aucune ne parle.

À 03h54, les balises se sont éteintes, toutes en même temps, comme on souffle des bougies. Le silence radio est revenu. L'empire a repris ses esprits. Les sirènes ont cessé. Les radars ont retrouvé leur précision habituelle.

Le lendemain matin, sur le mur extérieur d'une station orbitale impériale, on a trouvé, peint à la bombe en énorme :

> ON Y ÉTAIT.

Et en plus petit, en dessous, à la main :

> Et vous, vous étiez où ?

Les équipes de nettoyage impériales l'ont effacé. Il est réapparu. Sept fois. Sept fois. Au huitième effaçage, ils ont arrêté.

Il est toujours là. Je l'ai vu. Je vous jure que je l'ai vu.

## V. POURQUOI ILS DISPARAISSENT

Et c'est là que le rapport devient triste. Tenez-vous prêts. Je vais reposer mon verre.

Il y a vingt ans, le secteur M comptait 184 routes commerciales officielles et environ 47% de zones non cartographiées. Aujourd'hui, le secteur M compte 2 412 routes commerciales officielles et 0,8% de zones non cartographiées.

Vous voyez le problème ? Le pourcentage descend.

Plus les empires installent de balises, plus les marchés P2P déclarent leurs échanges, plus les sondes cartographient les planques, plus les alliances contrôlent les routes — moins il reste de place pour ceux qui vivent *entre les coordonnées*.

Et les Brigandiers vivaient entre les coordonnées. C'est tout ce qu'ils savaient faire.

J'ai parlé l'autre soir avec un vieux pilote, au Dernier Sas. Il était bourré. Il m'a dit : « Quand j'étais jeune, tu pouvais traverser un système entier sans qu'une seule balise sache ton nom. Aujourd'hui ? À peine sorti du port qu'une sonde t'a identifié, déclaré, taxé. T'es plus un pilote. T'es un point sur une carte. Et un point qui paie ses cotisations. »

Beatrice, à côté, lui a servi un verre qu'il n'avait pas commandé. Il a demandé : « Beatrice. Est-ce qu'on est en train de disparaître ? » Elle a répondu, très calmement : « Pas encore. Mais on se cache mieux qu'avant. »

Je note les deux. Mon avis n'est pas demandé.

## VI. CE QU'ON TROUVE DANS LES MARGES

Ils n'ont jamais construit grand. Mais quand on regarde bien, dans les coins, dans les marges, dans les endroits que les cartes officielles ne couvrent pas — on trouve des choses.

— Des dessous-de-verre tachés, manuscrits au revers, conservés par des étrangers pendant dix-sept ans avant d'être déposés aux archives sans explication.
— Des Aiguilles intactes, dérivant sans pilote, selle encore tiède, note pliée sous la selle.
— Des plaques de cuivre brûlé posées sur le rebord de sas désaffectés, sans clous, libres, jamais volées.
— Des tampons administratifs falsifiés à la perfection, gravés à l'envers du manche : « Mieux payé que la prière, plus honnête aussi. »
— Des moteurs civils qui contiennent des pièces de missiles obsolètes et qui pourtant ne devraient pas fonctionner, et qui pourtant fonctionnent, et qui n'ont pas explosé, et qui n'expliqueront jamais pourquoi.
— Des graffitis sur des murs officiels que les empires ont essayé sept fois d'effacer, et qui sont revenus chaque fois.

Et parfois — c'est ce qui me bouleverse le plus, je l'admets — au fond d'une bouteille vide, sous la selle d'une Aiguille morte, derrière un comptoir de bar oublié, on trouve une information que même les empires n'ont jamais retrouvée.

Pas parce qu'elle est protégée. Parce qu'elle est cachée là où personne ne pense à chercher : dans un endroit que personne n'a jugé digne d'être surveillé.

C'est, je crois, leur dernier acte politique. Cacher des choses essentielles dans des endroits insignifiants. Comme une thèse sur la liberté écrite au revers d'un dessous-de-verre.

## VII. EREBUS

Je dois faire cette comparaison. Mon supérieur va la couper, je le sais. Je la mets quand même.

Erebus, civilisation que nous avons documentée par ailleurs, a choisi de cesser d'exister. Volontairement. Avec une dignité qui force le respect, et un silence qui force la méditation.

Les Brigandiers, eux, ont choisi quelque chose de très différent. Ils n'ont pas choisi de cesser. Ils ont choisi de ne pas être trouvables — *tout en restant là*.

Ils n'ont pas effacé leurs archives. Ils n'en ont jamais tenu.
Ils n'ont pas scellé leurs portes. Ils n'avaient pas de portes.
Ils ne se sont pas retirés. Ils se sont mieux cachés.

C'est l'inverse exact d'Erebus. Et c'est aussi, peut-être — je sais que mon supérieur va sortir le stylo rouge mais je l'écris quand même — la seule réponse vraiment vivante à la question qui hantait les Erebus.

Erebus a demandé : « Que reste-t-il de la liberté quand tout l'univers est cartographié, taxé, surveillé et compté ? »

Et Erebus a répondu : « Plus rien. Alors cessons. »

Les Brigandiers ont entendu la même question. Ils ont répondu :

> « Plus grand-chose. Mais ce qui reste, on le prend. On le boit. On en fait des chansons. Et on n'en parle à personne. »

Je ne sais pas qui des deux a raison. Je sais qui des deux est plus drôle à fréquenter.

## VIII. SONT-ILS ENCORE LÀ ?

C'est la question que mon supérieur veut que je tranche. Je ne vais pas la trancher.

Voici les faits :

— Les apparitions documentées de Brigandiers ont diminué d'environ 73% sur les vingt dernières années.
— Les balises non officielles encore actives sont passées de plusieurs milliers à quelques centaines.
— Les Aiguilles immatriculées en circulation : 217 il y a quinze ans, 34 aujourd'hui.
— Le Dernier Sas est toujours ouvert. Je vérifie chaque mois.
— Les certificats de décès de Nara Vegra continuent à être délivrés à un rythme moyen de un tous les deux ans.
— Les cartes signées « T. » continuent à apparaître chez les contrebandiers débutants.
— Les graffitis « ON Y ÉTAIT » continuent à fleurir sur les stations impériales après chaque mauvais coup non revendiqué.

Donc :

— Statistiquement, ils disparaissent.
— Empiriquement, ils sont encore là.
— Officiellement, ils n'ont jamais existé.

Les trois propositions sont vraies en même temps. C'est, je crois, la définition même d'une civilisation des marges.

Mon supérieur me demandera ce qui résume mon rapport. Je résume : *je ne sais pas si les Brigandiers existent encore, mais je crois qu'ils ont la décence de ne pas le dire.*

## IX. NOTE FINALE (CELLE QUE MON SUPÉRIEUR VA SUPPRIMER)

J'ai mis huit mois à écrire ce rapport. Pas par lenteur. Par scrupule.

J'ai bu trois mille trois cent soixante-douze verres pendant ces huit mois (estimation conservatrice). Je n'ai pas signé ce rapport au crayon. Je n'ai pas non plus *refusé* de le signer, comme l'archiviste d'Erebus. Je ne suis pas digne de leur silence. Pas encore.

À la place, j'ai posé un verre vide sur le bord de la dernière page, juste avant de la rendre à mon supérieur. Le verre était sale. L'empreinte de sa base reste, dessinée en cercle imparfait, sur le coin inférieur droit du papier.

Je demande qu'on ne la nettoie pas.

C'est ma signature.

Si vous comprenez pourquoi, c'est que vous étiez peut-être un peu des nôtres.

Si vous ne comprenez pas, c'est que vous ne le saurez jamais, et c'est exactement ce que nous voulions.

À la prochaine.`;

// Table dispatch hypothèse par civ
const CIV_DOMINANT_HYPOTHESIS = {
  caldris: CALDRIS_DOMINANT_HYPOTHESIS,
  lumen: LUMEN_DOMINANT_HYPOTHESIS,
  werath: WERATH_DOMINANT_HYPOTHESIS,
  erebus: EREBUS_DOMINANT_HYPOTHESIS,
  brigandiers: BRIGANDIERS_DOMINANT_HYPOTHESIS,
};

// ─── HELPERS DE CONSOLIDATION ────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────
// VERSION GÉNÉRIQUE : prend un civId en paramètre, fonctionne pour les 3
// civs (caldris/lumen/werath). Les fonctions Caldris ci-dessous restent
// pour rétro-compat et délèguent vers les versions génériques.
// ───────────────────────────────────────────────────────────────────────

// Map de la clé de motif principale par civ
const CIV_MOTIF_KEYS = {
  caldris: 'nous_etions_47',
  lumen: 'paix_definitive',
  werath: 'nous_tenons',
  erebus: 'nous_nous_retirons',
  brigandiers: 'on_y_etait',
};

// ─── RITUEL DE CONSOLIDATION — Checklist animée ─────────────────────────
// 5 étapes, ~500ms entre chacune. À la fin, ouvre le dossier consolidé.
const CONSOLIDATION_STEPS = [
  'Vérification des fragments archivés',
  'Croisement des objets témoins',
  'Comparaison des variantes contradictoires',
  'Indexation du motif récurrent « 47 »',
  'Gel du dossier local',
];

// ─── CONFIG par civ : subtitle du rituel + signatures du dossier ────────
const CIV_DOSSIER_CONFIG = {
  caldris: {
    civCode: 'CIV-001',
    civName: 'CALDRIS',
    classification: 'Convoi civil dispersé · civilisation migrante',
    period: 'Disparition estimée : il y a environ 40 000 ans',
    signatures: [
      '« Nous étions 47. »',
      '« Les enfants ne comptent pas comme charge. »',
      '« Ils m\'ont demandé d\'arrêter de compter. »',
    ],
    motifShort: '« 47 »',
    motifFull: 'Nous étions 47.',
    ritualMotifStep: 'Indexation du motif récurrent « 47 »',
    trajectoireLabel: 'Probabilité de dérive volontaire',
    trajectoireValue: '61%',
    trajectoireStatusLabel: 'Statut',
    trajectoireStatusValue: 'destination non résolue',
    trajectoireFinaleName: 'Destination finale non résolue',
  },
  lumen: {
    civCode: 'CIV-002',
    civName: 'LUMEN',
    classification: 'Civilisation post-organique · état stable inconnu',
    period: 'Silence estimé : il y a environ 12 000 ans',
    signatures: [
      '« La paix définitive a été obtenue. »',
      '« C\'est trop beau. »',
      '« Personne ne revient. Mais personne ne veut revenir. »',
    ],
    motifShort: '« paix définitive »',
    motifFull: 'La paix définitive a été obtenue.',
    ritualMotifStep: 'Indexation du motif récurrent « paix définitive »',
    trajectoireLabel: 'Probabilité d\'Ascension complète',
    trajectoireValue: '74%',
    trajectoireStatusLabel: 'État',
    trajectoireStatusValue: 'civilisation absente · structures actives',
    trajectoireFinaleName: 'Lieu de l\'Ascension non confirmé',
  },
  werath: {
    civCode: 'CIV-003',
    civName: 'WERATH',
    classification: 'Civilisation militaire fossilisée · postes maintenus',
    period: 'Antériorité estimée : plus de 200 000 ans (datation incertaine)',
    signatures: [
      '« Nous tenons. »',
      '« Maintenez les positions. »',
      '« Si vous me trouvez, dites-moi contre qui je devais me battre. »',
    ],
    motifShort: '« nous tenons »',
    motifFull: 'Nous tenons.',
    ritualMotifStep: 'Indexation du motif récurrent « nous tenons »',
    trajectoireLabel: 'Probabilité de réactivation accidentelle',
    trajectoireValue: 'inconnue',
    trajectoireStatusLabel: 'État',
    trajectoireStatusValue: 'systèmes éteints · arme finale présente',
    trajectoireFinaleName: 'Arsenal -47 · salle scellée',
  },
  erebus: {
    civCode: 'CIV-004',
    civName: 'EREBUS',
    classification: 'Civilisation retirée · disparition volontaire',
    period: 'Retrait estimé : il y a environ 5 000 ans',
    signatures: [
      '« Nous nous retirons. »',
      '« Il vaut mieux ne pas être trouvés. »',
      '« Aucune trace n\'est une grâce. »',
    ],
    motifShort: '« nous nous retirons »',
    motifFull: 'Nous nous retirons.',
    ritualMotifStep: 'Indexation du motif récurrent « nous nous retirons »',
    trajectoireLabel: 'Probabilité d\'effacement délibéré',
    trajectoireValue: '92%',
    trajectoireStatusLabel: 'État',
    trajectoireStatusValue: 'retrait volontaire · scellements depuis l\'intérieur',
    trajectoireFinaleName: 'Porte du Retrait · scellée depuis l\'intérieur',
  },
  brigandiers: {
    civCode: 'CIV-005',
    civName: 'LES BRIGANDIERS',
    classification: 'Réseau marginal · contrebandiers et pilotes',
    period: 'Activité documentée : ~100 dernières années · présence résiduelle non confirmée',
    signatures: [
      '« On y était. »',
      '« Pas vus, pas pris. »',
      '« À la prochaine course. »',
    ],
    motifShort: '« on y était »',
    motifFull: 'On y était.',
    ritualMotifStep: 'Indexation du motif récurrent « on y était »',
    trajectoireLabel: 'Probabilité d\'extinction définitive',
    trajectoireValue: '64%',
    trajectoireStatusLabel: 'État',
    trajectoireStatusValue: 'civilisation des marges · présence résiduelle non confirmée',
    trajectoireFinaleName: 'Le Dernier Sas · accessible à qui sait',
  },
};

// ═══════════════════════════════════════════════════════════════
// UNIVERS MOUVANT — Génération de contenu personnel par sonde
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/16_deux_univers.md
//
// Quand une sonde Légère/Moyenne arrive sur un spot vide (kind='spot' mais
// pas une planète), on génère du contenu MOUVANT : épave, astéroïde, débris,
// etc. Ces cibles sont PERSONNELLES à chaque joueur (générées à la volée) et
// peuvent expirer (7 jours ou exploitation).

const KNOWN_TARGETS_MAX = 50;
const KNOWN_TARGETS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// SIGNATURES — Le pipeline de la connaissance (passe 5.0)
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/17_signatures_resolution.md
//
// Une signature est l'unité atomique de connaissance dans Starbyte :
//   - DÉTECTION (Radar)   → crée une signature non résolue (SIG-XXX)
//   - RÉSOLUTION (Légère) → la transforme en coord mouvante OU corps orbital
//   - VERROUILLAGE (Moyenne) → révèle l'adresse fixe d'un corps orbital
//
// G.signatures est la COUCHE SUPÉRIEURE de la connaissance.
// G.knownTargets reste la couche "exploitable par tanker" (bridge).
// Les deux co-existent, avec G.signatures comme source de vérité narrative.

const SIGNATURES_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours pour les non-résolues
const SIGNATURES_STORAGE_KEY = 'starbyte_signatures';
const SIGNATURES_MAX = 250; // 31/10 : 60 → 250 (les joueurs avancés remplissaient le carnet de signatures résolues)

// Types de signatures (révélées par la Radar) — cf. chap 17
const SIGNATURE_TYPES = {
  cold_mass:      { label: 'masse froide',       interpretation: 'corps orbital probable', position: ['bordure externe', 'orbite basse', 'orbite haute'] },
  metallic_echo:  { label: 'écho métallique',    interpretation: 'débris ou épave',        position: ['dérive haute', 'point lagrangien', 'bordure'] },
  gas_envelope:   { label: 'enveloppe gazeuse',  interpretation: 'atmosphère détectée',    position: ['bordure interne', 'centrale'] },
  heat_point:     { label: 'point chaud',        interpretation: 'activité énergétique',   position: ['centrale', 'orbite proche'] },
  mineral_dense:  { label: 'densité minérale',   interpretation: 'champ rocheux concentré', position: ['ceinture', 'dérive'] },
  unstable_field: { label: 'champ instable',     interpretation: 'phénomène non classifié', position: ['indéterminée'] },
};

const SIGNATURE_INTENSITIES = ['faible', 'modérée', 'instable', 'forte'];

// ═══════════════════════════════════════════════════════════════
// RÉSOLUTION PAR SYSTÈME (passe 5.7)
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/17_signatures_resolution.md (Métrique de résolution)
//
// Chaque système (W-X-YYYY) a une jauge 0-100% qui représente à quel
// point il est "lisible" pour le joueur.
//
// Évolution :
//   Radar    : +5% à +12% par balayage
//   Légère   : +1% à +5% par résolution
//   Moyenne  : +12% à +18% par verrouillage
//
// À 100%, le système est intégralement cartographié — pas de surprise
// future possible dans les rapports.

const SYSTEM_RESOLUTION_STORAGE_KEY = 'starbyte_system_resolution';

// ─── PASSE 6 — Persistance des Archives du Vide ─────────────────────────
// Le state G.legend est sauvegardé séparément. Caps :
//   - fragments : 200 (suffisant pour Caldris MVP, 10 scénarios × ~3 variantes
//                       × redondance = ~30 uniques + duplicatas autorisés)
//   - relics    : 50
//   - coordHints: 30
const LEGEND_STORAGE_KEY = 'starbyte_legend_v1';
const LEGEND_FRAGMENTS_MAX = 200;
const LEGEND_RELICS_MAX = 50;
const LEGEND_COORD_HINTS_MAX = 30;

// ═══════════════════════════════════════════════════════════════
// SYSTÈME D'ORIGINE — Découvertes & humilité du Carta scientifique
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/17_signatures_resolution.md (Humilité scientifique)
//
// Le système d'origine démarre à 60% de résolution — pas 100%. Le Carta
// scientifique pensait connaître le système. Il avait tort. Chaque
// découverte d'une nouvelle planète dans le système d'origine déclenche
// un communiqué humiliant du Carta. Le ton se durcit à chaque communiqué.

const HOME_DISCOVERIES_KEY = 'starbyte_home_discoveries';

// ═══════════════════════════════════════════════════════════════
// MÉTÉO COSMIQUE — Bruit de fond par système (passe 5.6)
// ═══════════════════════════════════════════════════════════════
// Cf. starbyte_gdd_v1/17_signatures_resolution.md (Météo cosmique)
//
// Chaque système a un "bruit de fond" qui FLUCTUE dans le temps :
// 0-100%. Plus le bruit est haut, plus les sondes coûtent.
//
// Échelle :
//   < 20%  → 🟢 Météo claire (coût normal)
//   20-50% → 🟡 Bruit modéré (coût normal)
//   50-80% → 🟠 Tempête ionique (+50% énergie)
//   > 80%  → 🔴 Tempête majeure (+50% énergie)
//
// Important : la météo NE BLOQUE JAMAIS (cf. décision #14 + Principe #7).
//
// Le bruit est calculé déterministiquement à partir du système + epoch
// arrondi à une période de 4h. → un cycle complet dure 24-48h.

const WEATHER_PERIOD_MS = 4 * 60 * 60 * 1000;

// PASSE 5.4 — Maintenant que createSignature et SIGNATURE_TYPES sont déclarés,
// on peut poser la signature d'amorce pour les nouveaux saves.
if (typeof seedStarterSignature === 'function') {
  seedStarterSignature();
}

// PASSE 5.7 — Poser la résolution initiale (système d'origine à 100%, voisins ~30%)
if (typeof seedInitialSystemResolution === 'function') {
  seedInitialSystemResolution();
}

// Pioche un nom de sonde (mythologique + numéro)
const PROBE_NAMES_ROOTS = [
  'Auris', 'Sigma', 'Spectra', 'Vesta', 'Aether', 'Nova',
  'Helios', 'Lyra', 'Phoenix', 'Orion', 'Arion', 'Selene',
];

// Pioche un secteur d'exploration (cohérent avec narrative existante)
const PROBE_SECTORS = [
  'Delta-9 / Quadrant A', 'Delta-9 / Quadrant B', 'Delta-9 / Quadrant C',
  'Gamma-12 / Périphérie Est', 'Gamma-12 / Centre',
  'Omega-3 / Champs lointains', 'Beta-7 / Bande extérieure',
  'Sigma-4 / Nuage stellaire', 'Epsilon-11 / Zone neutre',
];

/* ═══════════════════════════════════════════════════════════════
   PASSE 4-sondes-v1-b — GÉNÉRATION DES RAPPORTS DE SONDE
   ═══════════════════════════════════════════════════════════════ */

// Durée par défaut d'une mission de sonde Niveau 1
const PROBE_MISSION_DURATION_MS = 30 * 60 * 1000;  // 30 min

// État global des missions de sondes en cours (non encore revenues)
// G.activeProbes = [{ id, probeName, sector, departedAt, arrivalAt, status }]

// Lance une sonde en mission
// Si force=true (cheat), retour immédiat
// Durée par défaut d'une mission de sonde par tier
const PROBE_DURATIONS_BY_TIER = {
  radar:   { min: 5 * 60 * 1000,  max: 10 * 60 * 1000 },   // 5-10 min
  light:   { min: 30 * 60 * 1000, max: 30 * 60 * 1000 },   // 30 min fixe
  medium:  { min: 2 * 60 * 60 * 1000, max: 4 * 60 * 60 * 1000 }, // 2-4h
  stealth: { min: 4 * 60 * 60 * 1000, max: 8 * 60 * 60 * 1000 }, // 4-8h
  // ⚡ Phase 4 P1 — Balise persistante : voyage de pose seulement (8 min)
  beacon:  { min: 8 * 60 * 1000,  max: 8 * 60 * 1000 },    // 8 min fixe
};

// ⚡ ═══════════════════════════════════════════════════════════════
// ⚡ PHASE 4 P1 — BALISES DE SURVEILLANCE (détection passive)
// ⚡ ═══════════════════════════════════════════════════════════════
// Cf. starbyte_balises_piratage.md
//
// Une balise est une sonde au tier 'beacon' (PROBE_TIER_CONFIG.beacon).
// Elle vit dans G.probesPool avec state='deployed' au lieu de 'ready' ou 'mission'.
//
// Ce tick s'exécute toutes les 10s (startPassiveLoop). Pour chaque balise
// déployée, on tire un dé : a-t-elle vu passer un tanker ?
// Si oui, on génère un rapport dans G.beaconReports[] (intégré au système de rapports unifié).
// ═══════════════════════════════════════════════════════════════

// Constantes de tuning V0.5 (à ajuster après tests iPhone)
const BEACON_DETECTION_CHANCE_PER_TICK = 0.12;   // (historique, remplacé par le budget global ci-dessous)
// PATCH_1310_BOTS (Adrien : « beaucoup trop de bots ») — budget global de contacts PNJ, toutes balises confondues
const BEACON_NPC_PER_HOUR = 1.5;                 // contacts par heure pour 1 balise ; × √n pour n balises
const BEACON_NPC_MIN_GAP_MS = 6 * 60 * 1000;     // jamais deux contacts PNJ à moins de 6 min
const BEACON_DETECTION_WINDOW_MS = 12 * 60 * 1000; // 12 min de fenêtre d'interception
const BEACON_DETECTION_MAX_PER_MIN = 2;
var BEACON_HISTORY_MS = 24 * 3600 * 1000, BEACON_HISTORY_MAX = 30;

/* ═══════════════════════════════════════════════════════════════
   PASSE 4-sondes-v1.1 — SECRETS COSMIQUES
   Cf. PILIER 7 — Le contenu invisible
   Cf. GDD 13_sondes_exploration.md (section v1.1)
   ═══════════════════════════════════════════════════════════════ */

// Registre des secrets : architecture déclarative et extensible.
// Chaque secret est un objet décrivant ses triggers et ses stages.
// Pour en ajouter un nouveau : il suffit d'ajouter un objet ici.
const SECRETS_REGISTRY = {
  // ─── SECRET #1 — Le trou noir de A-C-7777 ───
  // Scénario complet d'Adrien (cf. GDD 13 v1.1, stage 0 à stage 4)
  // Migration cosmographie v15 : C-7777 → A-C-7777 (Amas A, saison 1)
  blackhole_C7777: {
    id: 'blackhole_C7777',
    description: 'Trou noir caché aux coordonnées A-C-7777',
    triggerCoords: 'A-C-7777',
    // Pattern de match : le trou noir prend tout le système C-7777 de l'Amas A
    //   → A-C-7777 (système entier), ainsi que A-C-7777-XX (toute position dans le système)
    //   → Variations historiques (legacy 3 segments, sans tirets, espaces) restent supportées
    //   → La détection finale est gérée par coordsMatchSecret() qui fait du fuzzy matching
    matchPatterns: [
      // Format v2 (4 segments)
      'A-C-7777',
      'A-C-7777-1', 'A-C-7777-2', 'A-C-7777-3',
      'A-C-7777-01', 'A-C-7777-02', 'A-C-7777-03',
      // Format legacy v1 (3 segments — Amas A implicite)
      'C-7777',
      'C-7777-1', 'C-7777-2', 'C-7777-3',
      // Variations historiques sans tiret / avec espace
      'C7777', 'C 7777',
      'AC7777', 'A C 7777',
    ],

    stages: [
      // STAGE 0 : Premier sondage RADAR à C-7777 → silence radio total (rien de spécial)
      {
        stage: 0,
        probeTiers: ['radar'],
        effect: 'silent_radar',  // Comportement par défaut + force silence à 100%
      },
      // STAGE 1 : Premier sondage LÉGÈRE à C-7777 → rapport tronqué
      {
        stage: 1,
        probeTiers: ['light'],
        effect: 'partial_report_with_delayed_followup',
        firstReport: {
          tier: 'light',
          truncated: true,
          narrative: 'À 14h22, l\'équipage de la sonde a transmis le début d\'un rapport visuel :\n\n"Coordonnées atteintes. Devant nous, à environ 12 unités de distance, on aperçoit\n\n[LA TRANSMISSION SE TERMINE ICI]',
          archived: 'Bordereau de mission en attente de complément',
        },
        delayedFollowup: {
          delayMs: 24 * 60 * 60 * 1000,  // 24h réel (cheat peut accélérer)
          narrative: '...quelque chose qui ne devrait pas être là. La sonde recommande de ne pas approcher davantage. La dernière trame est corrompue."',
          archived: 'Sonde retournée au pool',
        },
      },
      // STAGE 2 : Deuxième sondage LÉGÈRE à C-7777 → SILENCE TOTAL (sonde perdue)
      // RÈGLE ABSOLUE PILIER 7 : aucune notification, aucun rapport, aucun log
      {
        stage: 2,
        probeTiers: ['light'],
        effect: 'silent_loss',  // La sonde disparaît du pool, point.
      },
      // STAGE 3 : Premier sondage MOYENNE à C-7777 → révélation partielle
      {
        stage: 3,
        probeTiers: ['medium'],
        effect: 'partial_revelation',
        report: {
          tier: 'medium',
          narrative: 'Anomalie gravitationnelle massive détectée.\n\nLa sonde a relevé une déformation de l\'espace-temps à environ 3 unités de la coord cible. Tout ce qui approche à moins de 2 unités est absorbé en boucle sans retour. Les calculs préliminaires suggèrent une singularité.\n\nLa sonde a maintenu une distance de 5 unités et a récupéré quelques fragments :\n\n+ 1 fragment archivé : "Compte-rendu post-disparition de Auris-3"\n+ 1 donnée navigation : "Position de la singularité"\n+ 200 cristal (résidus matériels échappant à la zone)',
          archived: 'Bordereau secrètement marqué : "À ne pas approcher"',
          gains: { cristal: 200, navigationData: 1 },
        },
      },
      // STAGE 4 (late-game, age 6 / Trantor) : route commerciale activable
      // Pour l'instant juste un placeholder
      {
        stage: 4,
        probeTiers: ['stealth'],
        effect: 'lategame_unlock',
        requiresAge: 6,
        unlocks: 'blackhole_trade_route',
      },
    ],
  },

  // ─── Place pour d'autres secrets futurs ───
  // Pattern d'extension : ajouter un objet ici, le moteur le détecte automatiquement.
};

/* ═══════════════════════════════════════════════════════════════
   PASSE 4-sondes-v1-c — TANKERS DE RÉCUPÉRATION
   ═══════════════════════════════════════════════════════════════ */

// État global des tankers en mission
// G.tankerMissions = [{ id, tankerName, targetType, targetCoords, reportId, targetId, departedAt, arrivalAt, status }]

/* ═══════════════════════════════════════════════════════════════
   ROUTES DUALES — Voie balisée vs Voie directe (passe Brigandier v1)
   ═══════════════════════════════════════════════════════════════
   Philosophie : chaque envoi tanker est une micro-décision.
   - Voie balisée : durée nominale, taxe -12% sur cargo livré, aucun incident.
   - Voie directe : durée -35%, taxe 0%, 18% de chance d'incident, rencontres.
   La nature narrative (officielle vs marges) n'est jamais étiquetée moralement.
   L'identité brigandière émerge des rapports, pas des boutons.
*/

const ROUTE_TYPES = {
  beacon: {
    key: 'beacon',
    label: 'Voie balisée',
    description: 'Couloir surveillé · prédictible',
    durationFactor: 1.0,
    taxFactor: 0.88,             // -12% sur cargo livré
    incidentChance: 0,
    canEncounter: false,
    accentColor: 'var(--blue)',
  },
  // PATCH_1310_ROUTES2 — ma route entre deux balises : pas de taxe, pas d'incident ; la longueur du tracé fait la durée
  own: {
    key: 'own',
    label: 'Ma route',
    description: 'Tracé privé entre deux balises',
    durationFactor: 0.65,
    taxFactor: 1.0,
    incidentChance: 0,
    canEncounter: false,
    accentColor: '#c39bff',
  },
  direct: {
    key: 'direct',
    label: 'Voie directe',
    description: 'Trajet libre · imprévisible',
    durationFactor: 0.65,        // -35% de durée
    taxFactor: 1.0,               // pas de taxe
    incidentChance: 0.18,
    canEncounter: true,
    accentColor: '#c4762a',       // cuivre brûlé (couleur Brigandier discrète)
  },
};

// Table des rencontres voie directe — 12 entrées à la première version.
// Catégories : positive (×5), positive_loot (×2), neutral (×3), incident (×2)
// Chaque rencontre porte un id pour permettre la reconnaissance progressive
// (au bout de N rencontres avec le même personnage, le texte peut changer).
const ENCOUNTER_TABLE = [
  // ─── POSITIVES (×5) — figures Brigandier croisées en route ───
  {
    id: 'enc_mimi_repair',
    category: 'positive',
    weight: 12,
    title: 'Halte mécanique imprévue',
    narrative: (crew, planet) =>
      `Vers le milieu du trajet, un voyant rouge s'est allumé sur le tableau de bord. ${crew} a coupé les gaz et envoyé un signal de détresse sur fréquence civile. La réponse est venue d'une station orbitale à moitié abandonnée. Une voix de femme, posée : "Amène-toi. J'ai un chat roux. Tu paies en métal ou en histoires."\n\nLa réparation a duré quatre-vingt-dix minutes. La mécanicienne — qui s'est présentée comme Mimi — a remplacé une bobine de propulseur par "une pièce qui a déjà servi à autre chose, mais qui s'est calmée depuis". ${crew} a payé en métal. Et en histoires.\n\nLe tanker tourne mieux qu'avant le départ.`,
  },
  {
    id: 'enc_beatrice_radio',
    category: 'positive',
    weight: 10,
    title: 'Rumeur sur fréquence civile',
    narrative: (crew, planet) =>
      `Pendant le trajet, ${crew} a capté une transmission radio non chiffrée. Voix de femme, fond sonore de bar.\n\n"À tous les tankers qui m'entendent dans le secteur : la patrouille impériale est en pause à la station-relais 12-Δ jusqu'à 0400. Vous avez quatre heures pour faire ce que vous avez à faire. Je ne réponds pas aux remerciements. Sortez de ma fréquence."\n\nLa voix s'est éteinte. Le tanker a continué sa route. ${crew} a noté la fréquence dans son carnet personnel. Sans en parler au commandement.`,
  },
  {
    id: 'enc_pere_cobalt',
    category: 'positive',
    weight: 8,
    title: 'Proposition discrète',
    narrative: (crew, planet) =>
      `Un cargo non immatriculé a accosté le tanker à mi-parcours. Un homme âgé est sorti, sans hâte, avec une boîte en bois sous le bras. Il s'est présenté comme "le Père Cobalt" et a proposé un service : "Pour tout cargo que tu veux qu'on ne questionne pas à l'arrivée — j'ai des tampons. Pas chers. Authentiques sur le papier."\n\n${crew} a hésité. A décliné, poliment. Le Père Cobalt a souri. "Ce n'est jamais le bon moment, à la première fois. Mes registres restent ouverts."\n\nIl est reparti sans presser. Le tanker a noté qu'il n'avait pas relevé le numéro du cargo.`,
  },
  {
    id: 'enc_torek_carte',
    category: 'positive',
    weight: 6,
    title: 'Un certain Torek',
    narrative: (crew, planet) =>
      `À la station-relais 47-Σ, ${crew} a fait une halte technique. Un contrebandier au comptoir s'est approché. Surnom donné : "Deux Fois". Il a posé une carte stellaire pliée sur la table.\n\n"Quatre cents crédits. Coordonnées d'une planque qui n'est sur aucune carte officielle. Mot de passe inclus. Tu ne me la rachètes pas — tu ne peux pas. Une seule carte par client. Mais elle est vraie."\n\n${crew} n'a pas acheté. Torek a haussé les épaules, a rangé la carte, a commandé un autre verre. "Pas grave. Je vends à quelqu'un d'autre demain. À la même planque. Avec un mot de passe différent."\n\nIl souriait. ${crew} a redécollé.`,
  },
  {
    id: 'enc_balise_clignote',
    category: 'positive',
    weight: 10,
    title: 'Balise inattendue',
    narrative: (crew, planet) =>
      `À 4h du matin local, ${crew} a vu une balise clignoter dans une zone censée être vide. Pas une balise impériale — trop irrégulière, trop discrète. Une balise illégale, peut-être héritée d'un réseau plus ancien.\n\nLa balise s'est allumée brièvement, a transmis trois signaux courts, puis s'est éteinte. Aucune coordonnée n'a été reçue, mais le système de navigation a corrigé sa trajectoire de quelques degrés — comme si la balise lui avait juste indiqué un meilleur chemin.\n\nLe tanker est arrivé légèrement plus tôt que prévu. ${crew} n'a pas signalé l'incident dans le rapport officiel.`,
  },

  // ─── POSITIVES LOOT (×2) — butin rare des marges ───
  {
    id: 'enc_epave_legere',
    category: 'positive_loot',
    weight: 5,
    title: 'Épave abandonnée',
    lootBonusFactor: 1.20,        // +20% sur le cargo livré (récupération bonus)
    narrative: (crew, planet) =>
      `Sur l'itinéraire, ${crew} a repéré une épave dérivante hors trajectoire commerciale. Cargo léger, coque éventrée par un seul tir frontal. Pas de signature récente de combat — l'épave dérive depuis des années.\n\nL'équipe a accroché et inspecté. La cale principale était scellée, mais une cale auxiliaire avait été ouverte de l'intérieur, comme si l'équipage avait emporté ses affaires personnelles avant d'abandonner. Du matériel encore exploitable a été récupéré.\n\nAucun nom sur les bordereaux. Aucune adresse de retour. La récupération a été ajoutée à la cale du tanker.`,
  },
  {
    id: 'enc_cargo_perdu',
    category: 'positive_loot',
    weight: 4,
    title: 'Cargo silencieux',
    lootBonusFactor: 1.15,
    narrative: (crew, planet) =>
      `Un cargo de transport a été repéré, immobile, à la lisière d'un champ d'astéroïdes mineur. Aucune émission. Aucun signal de détresse. Aucune signature thermique anormale.\n\n${crew} a approché avec prudence. L'écoutille était entrouverte. À l'intérieur, le matériel était soigneusement empilé, étiqueté à la main, sans destination indiquée. Quelques contenants portaient une marque discrète au revers : "On y était."\n\nL'équipe a transféré ce qui pouvait l'être. Ils sont repartis sans laisser de trace. Le cargo continuera de dériver.`,
  },

  // ─── NEUTRES (×3) — texture, l'univers respire ───
  {
    id: 'enc_debris_field',
    category: 'neutral',
    weight: 8,
    title: 'Champ de débris non répertorié',
    narrative: (crew, planet) =>
      `${crew} a traversé un champ de débris non documenté sur les cartes officielles. Trois coques distinctes, toutes anciennes, toutes intactes. Aucune signature thermique. Aucune valeur récupérable identifiée.\n\nLe tanker a contourné. Le trajet a repris son cours normal.`,
  },
  {
    id: 'enc_anomaly',
    category: 'neutral',
    weight: 6,
    title: 'Anomalie gravitationnelle observée',
    narrative: (crew, planet) =>
      `Pendant la traversée, le tanker a frôlé une anomalie gravitationnelle qui ne figurait sur aucune carte. ${crew} a noté les coordonnées par habitude. La déviation a fait perdre quelques minutes — sans conséquence sur la mission.\n\nL'anomalie n'a pas répondu aux scans. Elle n'a probablement pas de nom. Elle en aura un, un jour, quand quelqu'un la nommera. Ce ne sera pas notre équipage.`,
  },
  {
    id: 'enc_aiguille_morte',
    category: 'neutral',
    weight: 5,
    title: 'Aiguille morte aperçue de loin',
    narrative: (crew, planet) =>
      `Aux confins du trajet, ${crew} a aperçu une Aiguille — un de ces engins de course artisanaux qu'on voit rarement dans les zones commerciales. Celle-ci dérivait. Selle vide. Aucun signal.\n\nLe tanker n'a pas dévié. Les Aiguilles à la dérive, c'est connu : on les laisse là où elles sont. Quelqu'un viendra les chercher. Ou personne. Ce n'est pas notre affaire.`,
  },

  // ─── INCIDENTS (×2) — la marge mord ───
  {
    id: 'enc_storm_ion',
    category: 'incident',
    weight: 8,
    title: 'Tempête ionique non prévue',
    lootBonusFactor: 0.75,        // -25% sur cargo livré (pertes)
    narrative: (crew, planet) =>
      `Le tanker est entré dans une tempête ionique non prévue par les radars commerciaux — fréquente dans les couloirs non balisés. Les boucliers ont tenu, mais la décharge électrostatique a partiellement compromis le cargo.\n\n${crew} a sauvé l'essentiel. Une partie des marchandises a été perdue dans le sas de décompression d'urgence.\n\nLe tanker rentre intact. Pas la totalité de ce qu'il transportait.`,
  },
  {
    id: 'enc_customs_close',
    category: 'incident',
    weight: 6,
    title: 'Patrouille impériale, frôlée',
    lootBonusFactor: 0.85,        // -15% sur cargo livré (perte volontaire pour fuir)
    extraDurationFactor: 1.30,    // +30% de temps (détour pour échapper)
    narrative: (crew, planet) =>
      `À mi-parcours, le tanker a croisé une patrouille impériale en mission de contrôle. ${crew} a coupé les feux de navigation et a effectué un détour long de trente pour cent. Pour passer inaperçu, l'équipe a aussi largué une partie du cargo dans une zone d'ombre — geste classique, geste pénible.\n\nLa patrouille n'a rien remarqué. Le tanker est arrivé en retard. Et plus léger qu'au départ.\n\nDans le rapport officiel, le retard sera attribué à une "déviation gravitationnelle". Le cargo perdu n'apparaîtra nulle part.`,
  },

  // ─── ROUTE_CARD (×2) — Phase 1 Routes Secrètes (Chunk B 16/05)
  // Drop d'une carte de route dans la cale au retour. La carte va dans la Maison de Commerce.
  {
    id: 'enc_route_card_torek_buy',
    category: 'route_card',
    dropsRouteCard: true,
    routeCardSource: 'Torek "Deux Fois"',
    weight: 4,
    title: 'Torek vend une carte',
    narrative: (crew, planet) =>
      `À la station-relais 47-Σ, ${crew} a recroisé le contrebandier surnommé "Deux Fois". Il a reconnu le tanker, a souri, a posé deux verres sur le comptoir. "T'es revenu. C'est bien. Les bonnes histoires reviennent toujours."\n\nIl a sorti une carte stellaire pliée. "Cette fois t'as les crédits, je vois ça à ton équipage qui a l'air moins maigre. Coordonnées d'un couloir qui n'est sur aucun manifeste impérial. Mot de passe inclus. Une seule carte par client."\n\n${crew} a payé. Torek a rangé les crédits sans les compter. "Si elle marche pas, reviens. Si elle marche, ne reviens pas. Tu sais comment on se reconnaît, entre gens comme nous."\n\nLa carte est dans la cale. Elle attend qu'on la lise.`,
  },
  {
    id: 'enc_route_card_cobalt_drop',
    category: 'route_card',
    dropsRouteCard: true,
    routeCardSource: 'Le Père Cobalt',
    weight: 3,
    title: 'Le Père Cobalt oublie',
    narrative: (crew, planet) =>
      `Le Père Cobalt a accosté le tanker à mi-parcours. Il avait son ton tranquille des bons jours. Il a parlé longtemps, sans pression cette fois — d'un fils qu'il ne voit plus, d'un cargo qui dérive quelque part dans Kerbera, d'une route qu'il n'utilisera plus à son âge.\n\nAvant de repartir, il a posé sa boîte en bois sur le pont, l'a rouverte, a paru chercher quelque chose, ne l'a pas trouvé. Il a haussé les épaules. "J'ai dû la laisser ailleurs."\n\nLe Père Cobalt est reparti. Quelques minutes après son départ, ${crew} a remarqué qu'une carte stellaire pliée traînait sous la boîte, soigneusement posée comme par accident.\n\nPersonne dans l'équipage ne croit aux accidents du Père Cobalt.`,
  },
];

// ─── Ticker UI : countdown des missions tanker (passe 4.6) ───
// Re-render écran Univers / Prospect chaque seconde pendant qu'au moins une
// mission est en cours, pour mettre à jour l'ETA affiché à côté des cibles
// engagées. Idle quand aucune mission active.
let _tankerCountdownInterval = null;

// ═════════════════════════════════════════════════════════════════════
// TANKER LOGISTIQUE — Mission de dépôt (chunk 15/05)
// ═════════════════════════════════════════════════════════════════════
// Cf. starbyte_AUDIT_tanker_logistique.md
// Principe émergence : le tanker n'est plus seulement un véhicule de
// récupération. Il peut transporter du fret (soldats + ressources) et
// le déposer sur une planète verrouillée. Si il reste en orbite =
// balise de communication. Si rappelé, garnison passe "isolated" (figée).

// État de composition en cours
// { destination: 'A-N-6210-37', planetType: 'type5', planetName: '...',
//   tankerSelected: 1|2|3, cargo: {soldiers:{garde,lourd}, resources:{...}},
//   postArrival: 'orbit_relay'|'return' }
G.tankerComposing = null;

let selectedReportId = null;

// ⚡ V0.5 — Durées de construction des vaisseaux militaires (option B "rythme moyen")
// Avant : T1=20s, T2=40s, T3=80s (proto rapide).
// Décision Adrien : passer à T1=10min, T2=30min, T3=2h pour un vrai rythme de gestion.
// Le skill G.skills.productionSpeed est appliqué par-dessus (divise la durée).
const SHIP_BUILD_DURATIONS = {
  1: 10 * 60,        // T1 : 10 min
  2: 24 * 60,        // T2 : 24 min (PATCH_2010_RENTABILITE : 3× les stats pour 2,4× le temps)
  3: 60 * 60,        // T3 : 1 h    (9× les stats d'un T1 pour 6× le temps)
};

/* ═══════════ PATCH_2010_COLONIE — l'Arche coloniale au chantier orbital ═══════════ */
const COLONIAL_COST = { metal: 20000, energie: 8000, cristal: 3000 };
const COLONIAL_FUEL = 2000;
const COLONIAL_DURATION = 6 * 3600;


/* ═══════════ PATCH_2110_ARCHE_DEPART — l'Arche coloniale en mission ═══════════ */
let arkMissionId = null, arkMission3D = null, arkMissionTimer = null;
var _sbColonyLoadAt = Date.now();
setInterval(() => { try { sbColonyTick(); } catch (e) { console.warn('[colonie]', e); } }, 5000);
(function () {
  const st = document.createElement('style');
  st.textContent = `
    /* PATCH_2110_SELECTEUR : le nom de la planète devient un vrai bouton dès qu'il y a plusieurs planètes */
    body.sb-multi #w-planet { pointer-events: auto; cursor: pointer; display: table; margin: 6px auto 0; padding: 7px 12px 7px 10px; border-radius: 18px;
      background: rgba(18,13,8,.82); border: 1px solid rgba(255,176,102,.55); color: #ffe2bd; font-size: 10.5px; letter-spacing: .16em; font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    body.sb-multi #w-planet::before { content: attr(data-kind); margin-right: 8px; padding: 2px 6px; border-radius: 8px; background: rgba(255,176,102,.18); color: #ffb066; font-size: 8.5px; letter-spacing: .18em; }
    body.sb-multi #w-planet::after { content: '⇄'; margin-left: 9px; color: #ffb066; font-size: 12px; letter-spacing: 0; }
    body.sb-multi #w-planet:active { transform: scale(.97); }
    #scr-planet .p3d-goal, .p3d-overlay .p3d-goal { top: calc(var(--sb-top-h, 46px) + 6px) !important; }   /* l'objectif passe sous le nom de la planète au lieu de le cacher */
    #sb-worlds { position: fixed; inset: 0; z-index: 9500; background: rgba(2,6,12,.6); display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    #sb-worlds .sbw-card { width: 100%; max-width: 360px; background: rgba(10,18,28,.96); border: 1px solid rgba(95,255,232,.25); border-radius: 14px; padding: 14px; }
    #sb-worlds .sbw-h { font: 600 11px/1 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; color: #5fffe8; margin: 2px 2px 6px; }
    #sb-worlds .sbw-sub { font-size: 11px; color: #8aa0a6; margin: 0 2px 12px; }
    #sb-worlds .sbw-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 12px 12px; margin-bottom: 8px; color: #dfe8ea; cursor: pointer; }
    #sb-worlds .sbw-row .sbw-k { flex-shrink: 0; padding: 3px 7px; border-radius: 8px; font-size: 8.5px; letter-spacing: .16em; text-transform: uppercase; background: rgba(255,176,102,.14); color: #ffb066; }
    #sb-worlds .sbw-row .sbw-m { flex: 1; min-width: 0; }
    #sb-worlds .sbw-row b { display: block; font-size: 15px; letter-spacing: .05em; }
    #sb-worlds .sbw-row span { font-size: 11px; color: #8aa0a6; }
    #sb-worlds .sbw-row .sbw-go { flex-shrink: 0; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #ffb066; }
    #sb-worlds .sbw-row.on .sbw-go { color: #8aa0a6; }
    #sb-worlds .sbw-row.on { border-color: rgba(255,176,102,.6); background: rgba(255,176,102,.08); }
    #sb-worlds .sbw-row.off { opacity: .6; }
    #sb-worlds .sbw-ren { display: block; width: 100%; margin: -2px 0 8px; padding: 7px 10px; background: none; border: 0; text-align: right; color: #ffb066; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; cursor: pointer; }
    #sb-worlds .sbw-x { width: 100%; padding: 11px; margin-top: 4px; background: none; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; color: #8aa0a6; }`;
  document.head.appendChild(st);
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('#w-planet');
    if (t && Array.isArray(G.worlds) && G.worlds.length > 1) sbOpenWorldPicker();
  });
  setInterval(() => { try {
    const multi = Array.isArray(G.worlds) && G.worlds.length > 1;
    document.body.classList.toggle('sb-multi', multi);
    const wp = document.getElementById('w-planet');
    if (wp && multi) { const w = G.worlds.find(x => x && x.id === G.activeWorld); const k = w && w.kind === 'colony' ? 'Colonie' : 'Capitale'; if (wp.dataset.kind !== k) wp.dataset.kind = k; }   // PATCH_2110_SELECTEUR
    const wt = wp && wp.closest('.w-top'); if (wt) { const h = Math.round(wt.getBoundingClientRect().bottom); if (h > 0) document.body.style.setProperty('--sb-top-h', h + 'px'); }
  } catch (e) {} }, 1000);
})();


/* ═══════════ PATCH_2110_DEPOT — dépôt colonial (Adrien, 21/10) ═══════════
   Une colonie stocke sa production dans son dépôt (plafonné par ses silos). Un convoi l'expédie vers l'empire
   toutes les 6 h ; on peut aussi l'expédier tout de suite (carburant, une fois par heure).
   Un raid sur une colonie ne pille que ce dépôt (serveur v23) : le stock de la capitale n'est plus exposé. */
const DEPOT_SHIP_MS = 6 * 3600 * 1000;
const DEPOT_BASE = 3000;
const DEPOT_SILO = [15000, 60000, 250000];
const DEPOT_MANUAL_FUEL = 150, DEPOT_MANUAL_CD = 3600 * 1000;
const DEPOT_LB = { metal: 'métal', energie: 'énergie', cristal: 'cristal' };
const CONVOY_RES = [['metal', 'Métal'], ['energie', 'Énergie'], ['cristal', 'Cristal'], ['biomass', 'Biomasse'], ['artefact', 'Artefacts']];
let _sbCv = null;
// 30/10 (Adrien) — convoi automatique : toutes les 6 h, une colonie qui a des tankers à quai envoie son excédent à la
// capitale. Elle garde une réserve (30 % de ses silos) pour ses propres chantiers ; biomasse (vivres) et artefacts restent sur place.
const CONVOY_AUTO_MS = 6 * 3600 * 1000, CONVOY_AUTO_KEEP = 0.3;
setInterval(() => { try { sbConvoyTick(); } catch (e) { console.warn('[convoi]', e); } }, 5000);
(function () {
  const st = document.createElement('style');
  st.textContent = `
  #sb-depot-chip { display: table; margin: 5px auto 0; padding: 5px 11px; border-radius: 14px; border: 1px solid rgba(255,176,102,.3); background: rgba(10,8,6,.72); color: #e8d6c0; font: inherit; font-size: 9.5px; letter-spacing: .1em; cursor: pointer; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
  #sb-depot-chip span { text-transform: uppercase; color: #b89a78; margin-right: 6px; letter-spacing: .16em; }
  #sb-xfer .cv-r { display: grid; grid-template-columns: 70px 1fr 64px; gap: 10px; align-items: center; margin: 8px 0; font-size: 12px; }
  #sb-xfer .cv-r input { width: 100%; accent-color: #ffb066; }
  #sb-xfer .cv-r b { text-align: right; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11.5px; color: #ffe2bd; }
  #sb-depot-chip b { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; color: #ffe2bd; }
  #sb-depot-chip i { font-style: normal; color: #9aa8ae; margin-left: 7px; }
  #sb-depot-chip.full { border-color: rgba(255,120,90,.6); }
  #sb-depot-chip.full i { color: #ff9a7a; }
  #sb-depot-sheet { position: fixed; inset: 0; z-index: 9500; background: rgba(2,6,12,.62); display: flex; align-items: flex-end; }
  #sb-depot-sheet .dp-card { width: 100%; padding: 18px 16px calc(env(safe-area-inset-bottom,0px) + 18px); border-radius: 16px 16px 0 0; background: linear-gradient(#11100d,#0a0907); border-top: 1px solid rgba(255,176,102,.35); color: #e6e0d8; font-size: 13px; line-height: 1.5; }
  #sb-depot-sheet .dp-k { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #ffb066; margin-bottom: 8px; }
  #sb-depot-sheet p { margin: 0 0 12px; color: #cfc6ba; }
  #sb-depot-sheet .dp-r { display: grid; grid-template-columns: 64px 1fr auto; gap: 10px; align-items: center; margin: 7px 0; font-size: 12px; }
  #sb-depot-sheet .dp-r b { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; font-size: 11.5px; }
  #sb-depot-sheet .dp-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
  #sb-depot-sheet .dp-bar i { display: block; height: 100%; background: linear-gradient(90deg,#c87a3a,#ffcf8a); }
  #sb-depot-sheet .dp-n { margin-top: 10px; font-size: 12px; color: #a8a097; }
  #sb-depot-sheet .dp-go { width: 100%; margin-top: 14px; padding: 13px; border-radius: 10px; border: 1px solid rgba(255,176,102,.6); background: rgba(255,176,102,.12); color: #ffcf8a; font: inherit; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
  #sb-depot-sheet .dp-go:disabled { opacity: .45; }
  #sb-depot-sheet .dp-x { width: 100%; margin-top: 8px; padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: none; color: #9aa8ae; font: inherit; }`;
  document.head.appendChild(st);
  setInterval(() => { try { sbDepotRender(); } catch (e) {} }, 1000);
})();

/* ═══════════ PATCH_2010_FLOTTES — flotte par planète et transferts (Adrien, 20/10) ═══════════
   Chaque planète a ses vaisseaux à quai (G.fleet.stationed, échangé avec la planète active) et sa file de chantier.
   Flottes, missions tanker et garnisons portent la planète d'où elles sont parties (x.world) : leurs pertes
   s'appliquent à cette planète, quelle que soit celle qu'on regarde. Un transfert déplace des vaisseaux à quai. */
(function () {
  const wrap = (name, pick) => {
    const f = window[name];
    if (typeof f !== 'function' || f._sbWorld) return;
    const g = function (...a) {
      let it = null; try { it = pick(...a); } catch (e) {}
      const w = it ? (it.world || 'home') : null;   // PATCH_0111_BUTIN : sans étiquette (lancée avant les colonies) = la capitale, jamais « la planète affichée »
      return (w && typeof sbWithWorld === 'function') ? sbWithWorld(w, () => f.apply(this, a)) : f.apply(this, a);
    };
    g._sbWorld = true;
    window[name] = g;
  };
  const byFleet = (f) => f, byMission = (m) => m;
  const byMissionId = (id) => (G.tankerMissions || []).find(m => m.id === id);
  wrap('applyCombatResult', byFleet);
  wrap('applyIntegrityDamage', byFleet);
  wrap('_mpSyncFleetLosses', byFleet);
  wrap('handleTankerDropoffArrival', byMission);
  wrap('handleTankerRouteArrival', byMission);
  wrap('handleExplorationArrival', byMission);
  wrap('handleTankerReturn', byMissionId);
  wrap('handleTankerReturnFromCancellation', byMissionId);
  wrap('completeExplorationReturn', byMissionId);
  wrap('_completeRouteRunReturn', byMissionId);
  wrap('_completeCancelledRouteRun', byMissionId);
  wrap('returnTankerFromDock', byMissionId);
})();
const FLEET_SHIP_KEYS = ['tanker', 'fregate', 'cuirasse'];
let _sbXfer = null;
setInterval(() => { try { sbTransferTick(); } catch (e) { console.warn('[transfert]', e); } }, 5000);
// bouton « Transférer » sur l'écran Flotte, dès qu'il y a deux planètes
setInterval(() => {
  try {
    const row = document.getElementById('fleet-compose-cta');
    if (!row) return;
    let b = document.getElementById('fleet-xfer-cta');
    const multi = Array.isArray(G.worlds) && G.worlds.length > 1;
    if (!multi) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button');
      b.id = 'fleet-xfer-cta'; b.className = 'btn-secondary';
      b.style.cssText = 'flex:1;padding:14px;font-size:12px;border-radius:10px;border:1px solid rgba(255,176,102,.35);background:rgba(8,12,18,.6);color:#ffb066;letter-spacing:.08em';
      b.textContent = '⇄ Transférer';
      b.onclick = () => sbOpenTransfer();
      row.parentNode.insertBefore(b, row.nextSibling);
    }
  } catch (e) {}
}, 1000);
(function () {
  const st = document.createElement('style');
  st.textContent = `
    #sb-xfer { position: fixed; inset: 0; z-index: 9500; background: rgba(2,6,12,.6); display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    #sb-xfer .sbx-card { width: 100%; max-width: 380px; max-height: 88vh; overflow: auto; background: rgba(10,18,28,.97); border: 1px solid rgba(255,176,102,.3); border-radius: 14px; padding: 14px; color: #dfe8ea; }
    #sb-xfer .sbx-h { font: 600 11px/1 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; color: #ffb066; margin: 2px 2px 10px; }
    #sb-xfer .sbx-sub { font-size: 12px; color: #8aa0a6; margin: 4px 2px 8px; }
    #sb-xfer .sbx-sub b { color: #dfe8ea; }
    #sb-xfer .sbx-dest { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    #sb-xfer .sbx-dest button { flex: 1; min-width: 120px; text-align: left; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); color: #dfe8ea; font-weight: 600; }
    #sb-xfer .sbx-dest button.on { border-color: rgba(255,176,102,.7); background: rgba(255,176,102,.1); }
    #sb-xfer .sbx-dest i, #sb-xfer .sbx-row i { display: block; font-style: normal; font-weight: 400; font-size: 10px; color: #8aa0a6; }
    #sb-xfer .sbx-row { display: flex; align-items: center; gap: 6px; padding: 8px 2px; border-top: 1px solid rgba(255,255,255,.06); }
    #sb-xfer .sbx-row span { flex: 1; font-size: 13px; }
    #sb-xfer .sbx-row button { width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #dfe8ea; font-size: 16px; }
    #sb-xfer .sbx-row button.all { width: auto; padding: 0 8px; font-size: 11px; }
    #sb-xfer .sbx-row b { width: 28px; text-align: center; }
    #sb-xfer .sbx-fleet { display: block; width: 100%; text-align: left; padding: 10px 12px; margin-bottom: 6px; border-radius: 10px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); color: #dfe8ea; font-size: 13px; }
    #sb-xfer .sbx-fleet.off { opacity: .5; }
    #sb-xfer .sbx-fleet.on { border-color: rgba(255,176,102,.7); background: rgba(255,176,102,.1); }
    #sb-xfer .sbx-fleet i { display: block; font-style: normal; font-size: 11px; color: #8aa0a6; margin-top: 2px; }
    #sb-xfer .sbx-transit { font-size: 11px; color: #ffb066; padding: 6px 2px; }
    #sb-xfer .sbx-empty { font-size: 12px; color: #8aa0a6; padding: 10px 2px; }
    #sb-xfer .sbx-go { width: 100%; padding: 13px; margin-top: 8px; border-radius: 10px; border: 1px solid rgba(255,176,102,.5); background: rgba(255,176,102,.1); color: #ffb066; font-weight: 600; letter-spacing: .06em; }
    #sb-xfer .sbx-go.off { opacity: .4; pointer-events: none; }
    #sb-xfer .sbx-x { width: 100%; padding: 11px; margin-top: 8px; background: none; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; color: #8aa0a6; }`;
  document.head.appendChild(st);
})();

// Durées de construction T1 (minutes) — courtes : le joueur doit voir finir sa première mine dans sa session
const BUILD_TIME_MIN = {
  mine: 2, centrale: 3, labo: 4, comptoir: 4, raffinerie: 5, caserne: 6, turret: 8, shipyard: 10,
  silo_metal: 3, silo_energie: 3, silo_cristal: 3, silo_biomass: 3, silo_artefact: 3, silo_fuel: 3,
};

// ═══════════════════════════════════════════════════════════════
// Phase 2.11 — PERFORMANCE MONITOR (diagnostic match-3)
// ═══════════════════════════════════════════════════════════════
// Mesure FPS, DOM size, éléments orphelins, mémoire, spikes
// Tourne en permanence quand l'écran m3 est visible
// ═══════════════════════════════════════════════════════════════

window.perfMonitor = {
  fpsFrames: [],
  lastFrameTime: 0,
  spikes: [],
  maxSpike: 0,
  lastUpdate: 0,
  enabled: false, // ⚡ Phase 2.16 — désactivé par défaut, on peut le réactiver via console
  currentFps: 60,
  totalParticlesCreated: 0,
  totalDebrisCreated: 0,
  totalRaysCreated: 0,
  totalFlashesCreated: 0,
  currentContext: 'idle',
};

/* ═══════════ QUEUES — COMMANDES SÉQUENTIELLES ═══════════ */

// Une "commande" = un batch (50 gardes par exemple)
// Chaque commande est traitée unité par unité dans une cale active
// barracks: { commands: [...], slots: 1 } → cale(s) active(s) selon skill
// shipyard: { commands: [...], slots: 1 } → 1 cale (chantier orbital léger)

const QUEUES = {
  barracks: { commands: [] }, // [{ unitKey, totalQty, completed, currentElapsed }, ...]
  shipyard: { commands: [] },
  prospect: { commands: [] }, // Sondes (passe 4.5 — file de construction)
  capital:  { upgrade: null }, // { parcelIdx, buildingKey, fromTier, toTier, totalDur, elapsed }
};

/* ═══════════ PATCH_2010_WORLDS — plusieurs planètes dans une même partie (colonisation, étape 1) ═══════════
   Le stock (G.res, crédits, carburant), la flotte, les skills de l'empire, les sondes et le carnet restent communs.
   Ce qui appartient à une planète vit dans G pour la planète ACTIVE (le reste du code lit G.planet, G.defense…
   sans rien savoir) et dans G.worlds[i].data pour les autres. sbWithWorld(id, fn) bascule le temps d'un calcul. */
var SB_WORLD_KEYS = ['planet', 'defense', 'antenna', 'aftermath', 'selParcel', 'probesPool', 'res', 'troopFamine', '_bioBuffer'];
// 30/10 (Adrien) — stock par planète : chaque planète a ses ressources, sa production et ses silos.
// Le stock de la planète affichée est G.res ; celui des autres, w.data.res. Crédits et carburant restent ceux de l'empire.
const SB_RES_BASE = { metal: 5000, energie: 5000, cristal: 5000, biomass: 5000, artefact: 200 };

// Pseudo unités pour la sonde (utilisée dans le shipyard)
const PROBE_PSEUDO_UNITS = {
  // Legacy v1 — ne pas casser les anciens saves
  probe: { name: 'Sonde Auris-1', icon: '○', color: 'var(--cyan)', cost: { metal: 200, cristal: 50 } },
  // Passe 4.5 — un pseudo-unit par tier de sonde, durée croissante
  probe_radar:   { name: 'Sonde Radar',   icon: '◯', color: '#e6f0ff', cost: { metal: 30 },               duration: 30 },   // 30s
  probe_light:   { name: 'Sonde Légère',  icon: '◇', color: '#5fcc8a', cost: { metal: 200, cristal: 50 },  duration: 120 },  // 2min
  probe_medium:  { name: 'Sonde Moyenne', icon: '◈', color: '#9a8aff', cost: { metal: 600, cristal: 200, navigationData: 1 }, duration: 300 }, // 5min
  probe_stealth: { name: 'Sonde Furtive', icon: '⊙', color: '#ff8c64', cost: { metal: 1500, cristal: 500 }, duration: 600 }, // 10min
  // ⚡ Phase 4 P1 — Balise de surveillance (persistante)
  probe_beacon:  { name: 'Balise',        icon: '⌖', color: '#a370ff', cost: { metal: 300, cristal: 100 }, duration: 180 }, // 3min build
};

let queueTicker = null;

/* ═══════════ OFFLINE — SIMULATION DU TEMPS ÉCOULÉ (10/10/2026) ═══════════
   Une page web ne tourne pas quand Safari est fermé ou en arrière-plan.
   Le monde n'est donc jamais « en marche » : il est simulé jusqu'à maintenant
   à chaque tick, au démarrage et au retour au premier plan.
   Ancre unique : G._simAt (sauvegardée dans le snapshot sous `simAt`). */

const SIM_MAX_GAP_MS = 14 * 24 * 3600 * 1000;   // garde-fou (horloge trafiquée)
const OFFLINE_RECAP_MIN_MS = 60 * 1000;

// PATCH_2210_VIVRES (22/10, décision d'Adrien : « plus on a de troupes plus il faut de biomasse »)
// Chaque soldat mange de la biomasse chaque jour (garde 1, lourd 3), toutes planètes et flottes comprises.
// Les vivres de la caserne nourrissent gratuitement les 10 premières rations. Plus de biomasse → troupes affamées (défense des soldats ×0,75).
var SB_FREE_RATIONS = 10, SB_FAMINE_MULT = 0.75;


/* ═══════════ PATCH_2110_PROJET — projet suggéré (North Star §56 : suivre, masquer ou ignorer) ═══════════
   Après le didacticiel, un bandeau discret propose le prochain bâtiment (ou amélioration) avec ce qui manque
   et le temps de production pour l'avoir. Toucher = y aller ; balayer = masquer ce projet (il revient au suivant). */
const SB_PROJ_BUILD = ['mine', 'centrale', 'labo', 'shipyard', 'comptoir', 'raffinerie', 'caserne', 'turret'];
const SB_PROJ_UP = ['mine', 'centrale', 'labo', 'shipyard'];
const SB_PROJ_KEY = 'sb_proj_hidden';
(function () {
  const st = document.createElement('style');
  st.textContent = `
  #sb-proj{position:fixed;left:12px;right:12px;z-index:30;padding:9px 12px 9px;border-radius:10px;background:rgba(8,14,20,.82);
    border:1px solid rgba(255,190,90,.28);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#dfe8ec;
    font-family:'Space Grotesk',system-ui,sans-serif;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:pointer}
  #sb-proj.ready{border-color:rgba(255,190,90,.7);box-shadow:0 0 16px rgba(255,170,60,.18)}
  #sb-proj .k{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#ffbf5a;margin-bottom:2px}
  #sb-proj .k span{color:rgba(200,215,225,.42);letter-spacing:.08em}
  #sb-proj .n{font-size:14px;font-weight:600;color:#f2f8fb}
  #sb-proj .m{font-family:'JetBrains Mono',monospace;font-size:11px;color:#c8d2d6;margin-top:2px}
  #sb-proj .m b{color:#ffd27a;font-weight:600}
  #sb-proj .g{margin-top:4px;font-size:10px;letter-spacing:.06em;color:#ffd9a0}
  #sb-away .pj{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.08)}
  #sb-away .pj .k{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#ffbf5a}
  #sb-away .pj .n{font-size:14px;font-weight:600;margin:2px 0}
  #sb-away .pj .m{font-family:var(--font-mono);font-size:11px;color:var(--mut)}
  #sb-away .pj .m b{color:#ffd27a;font-weight:600}
  #sb-away .pj button{margin-top:8px;width:100%;padding:10px;border-radius:9px;border:1px solid rgba(255,190,90,.55);background:rgba(255,190,90,.1);
    color:#ffd9a0;font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
  #sb-away .sw{margin-top:8px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:rgba(200,215,225,.38);text-align:center}`;
  document.head.appendChild(st);
  setInterval(() => { try { sbProjectRender(); } catch (e) { console.warn('[projet]', e); } }, 700);
})();

// ═══════════════════════════════════════════════════════════════
// PASSE 4-sondes-v1.1-d — UI Centre de Prospection (refonte 2e)
// Pattern : fiche par sonde, comme la Caserne
// ═══════════════════════════════════════════════════════════════

// Configuration centrale des 4 tiers de sondes
// Tout ce qui caractérise un tier (coût, durée, comportement, narratif) est ici
//
// validPatterns : formats d'adresse acceptés par ce tier
//   'cluster' = "A"             → amas entier (le plus large — usage interne)
//   'sector'  = "A-C"           → secteur entier (très large)
//   'system'  = "A-C-7777"      → système entier (toutes ses planètes)
//   'spot'    = "A-C-7777-12"   → spot précis (planète ou objet à cette position)
const PROBE_TIER_CONFIG = {
  radar: {
    key: 'radar',
    label: 'Radar',
    sublabel: 'Sacrificielle',
    icon: '◯',         // cercle ouvert = onde radar
    description: 'Balaye un système entier. Détecte des signatures opaques (SIG-XXX). Brûle à l\'arrivée.',
    longDescription: 'La sonde Radar est jetable. Elle balaye un système entier et révèle des signatures opaques : "masse froide", "écho métallique", etc. Elle ne révèle jamais d\'adresse précise — il faut ensuite envoyer une Sonde Légère pour résoudre une signature en cible exploitable.',
    cost: { metal: 30 },
    duration: '5-10 min',
    durationMs: 7 * 60 * 1000,  // 7 min moyenne
    behavior: 'sacrificial',     // ne revient pas
    quotaMax: 999,               // illimité
    skillRequired: null,
    accent: '#e6f0ff',
    accentSoft: 'rgba(230,240,255,.15)',
    behaviorLabel: 'Balayage système',
    // Passe 5.0 : la Radar cible UNIQUEMENT un système entier (cf. GDD chap 17)
    // Plus de mode spot/sector — le pipeline signature commence ici.
    validPatterns: ['system'],
    defaultExample: 'A-C-2848',
  },
  light: {
    key: 'light',
    label: 'Légère',
    sublabel: 'Résolution',
    icon: '◇',
    description: 'Résout une signature détectée par Radar. La transforme en coordonnée exploitable ou en corps orbital identifié.',
    longDescription: 'La sonde Légère cible une signature précise (SIG-XXX) relevée auparavant par une Radar. À son retour, la signature devient soit une coordonnée mouvante exploitable par tanker, soit un corps orbital qu\'il faudra ensuite verrouiller avec une Sonde Moyenne.',
    cost: { metal: 200, cristal: 50 },
    duration: '30 min',
    durationMs: 30 * 60 * 1000,
    behavior: 'reusable',
    quotaMax: 3,   // 29/10 (Adrien) : 1 → 3, une seule Légère pour trier des dizaines de signatures, c'était trop lourd
    skillRequired: null,
    accent: '#5fcc8a',
    accentSoft: 'rgba(95,204,138,.15)',
    behaviorLabel: 'Résolution de signature',
    // PASSE 5.1 : la Légère cible UNE SIGNATURE PRÉCISE (SIG-XXX)
    // (Cf. starbyte_gdd_v1/17_signatures_resolution.md)
    // Le pattern 'signature' est nouveau : on accepte juste un ID SIG-XXX.
    // Le legacy 'system'/'spot' reste accepté pour compat ancien comportement,
    // mais la sélection par signature est désormais le chemin principal.
    validPatterns: ['signature', 'system', 'spot'],
    defaultExample: 'SIG-XXX',
  },
  medium: {
    key: 'medium',
    label: 'Moyenne',
    sublabel: 'Verrouillage',
    icon: '◈',
    description: 'Verrouille une signature résolue en adresse cosmique fixe. Révèle un corps orbital.',
    longDescription: 'La Sonde Moyenne ne sert ni à détecter ni à résoudre. Elle verrouille — c\'est-à-dire qu\'elle transforme un corps orbital identifié (signature résolue par Légère) en adresse fixe permanente : W-X-YYYY-Z. À partir de là, la planète existe dans ton carnet.',
    cost: { metal: 600, cristal: 200 },
    duration: '2-4h',
    durationMs: 3 * 60 * 60 * 1000,
    behavior: 'reusable',
    quotaMax: 2,
    skillRequired: 'cartography',
    accent: '#9a8aff',
    accentSoft: 'rgba(154,138,255,.15)',
    behaviorLabel: 'Verrouillage d\'adresse fixe',
    // PASSE 5.2 : la Moyenne cible UNE SIGNATURE résolue fixe (cf. GDD chap 17)
    // Le pattern 'signature' est principal. Le legacy 'spot' reste accepté pour
    // compatibilité (vieux saves avec missions en cours).
    validPatterns: ['signature', 'spot'],
    defaultExample: 'SIG-XXX',
  },
  stealth: {
    key: 'stealth',
    label: 'Furtive',
    sublabel: 'Espionnage indétectable',
    icon: '⊙',
    description: 'Espionne sans être repérée. La sonde de la guerre.',
    longDescription: 'La sonde furtive ne laisse aucune trace. Elle s\'approche, observe les stocks et défenses d\'un autre joueur, et revient en silence. C\'est l\'outil de l\'agression planifiée — ou de la défense préventive.',
    cost: { metal: 1500, cristal: 500 },
    duration: '4-8h',
    durationMs: 6 * 60 * 60 * 1000,
    behavior: 'reusable',
    quotaMax: 7,
    skillRequired: 'stealth',
    accent: '#ff8c64',
    accentSoft: 'rgba(255,140,100,.15)',
    behaviorLabel: 'Espionnage',
    // Furtive : spot précis uniquement (espionnage chirurgical)
    validPatterns: ['spot'],
    defaultExample: 'A-B-3122-47',
  },
  // ═══════════════════════════════════════════════════════════════
  // ⚡ PHASE 4 P1 — BALISE DE SURVEILLANCE (mai 2026)
  // ═══════════════════════════════════════════════════════════════
  // Cf. starbyte_balises_piratage.md
  //
  // Une balise est une sonde évoluée : posée sur un système, elle reste
  // en orbite indéfiniment et détecte les tankers de passage.
  // - Sacrificielle ? Non : persistante (nouveau behavior).
  // - Reusable ? Non plus : elle ne revient pas par défaut, le joueur la rappelle.
  //
  // Pipeline V1 :
  //   1. Construction au Centre de Prospection (3 min)
  //   2. Dispatch sur un système ('system' pattern, comme Radar)
  //   3. Voyage 8 min, arrivée → état 'deployed' au lieu de 'returned'
  //   4. Génère des détections passives (tickActiveBeacons) en continu
  //   5. Le joueur peut rappeler la balise (P1 simplifié : la balise revient au pool)
  //
  // V0.5 / P1 scope : surveillance + détection. Pas d'interception, pas de raid.
  // ═══════════════════════════════════════════════════════════════
  beacon: {
    key: 'beacon',
    label: 'Balise',
    sublabel: 'Surveillance permanente',
    icon: '⌖',
    description: 'Pose une balise dans un système. Détecte les passages de tankers tant qu\'elle reste sur place.',
    longDescription: 'La balise est conçue pour rester en orbite indéfiniment. Tu choisis un système, la balise voyage, se déploie, et observe en silence. Chaque tanker qui traverse — ami, ennemi, PNJ, épave dérivante — est consigné. Tu peux la rappeler quand tu veux, mais tu perds ses yeux dans le secteur.',
    cost: { metal: 300, cristal: 100 },
    duration: '8 min',
    durationMs: 8 * 60 * 1000,
    behavior: 'persistent',     // ⚡ NOUVEAU comportement : reste sur place après arrivée
    // PATCH_1310_ROUTES — décision d'Adrien : 7 balises, puis 14 (Laboratoire niv. 2), puis 21 (niv. 3)
    get quotaMax() { const t = (typeof getLaboTier === 'function') ? getLaboTier() : 0; return t >= 3 ? 21 : t >= 2 ? 14 : 7; },
    skillRequired: null,
    accent: '#a370ff',
    accentSoft: 'rgba(163,112,255,.15)',
    behaviorLabel: 'Surveillance persistante',
    // Comme la Radar : cible un système entier (W-X-YYYY).
    validPatterns: ['system'],
    defaultExample: 'A-C-2848',
  },
};

// ─── État local de l'envoi (en mémoire seulement) ───
// On stocke par tier pour conserver l'adresse saisie en revenant
const probeDispatchState = {
  radar:   { mode: 'cosmic', coord: '' },  // 14/05 : cosmic par défaut (random ne produit pas de signatures, cf. GDD chap 17)
  light:   { mode: 'random', coord: '' },
  medium:  { mode: 'cosmic', coord: 'A-W-4335-12' },
  stealth: { mode: 'cosmic', coord: 'A-B-3122-47' },
  // ⚡ Phase 4 P1 — Balise persistante : cible un système entier (même format que Radar)
  beacon:  { mode: 'cosmic', coord: '' },
};


let _archivesUnfolded = false;
// PATCH_1510_RAPPORTS_TABS — rangement des rapports
var RAP_SUBS = [['radar', 'Radar', '#e6f0ff'], ['light', 'Légère', '#5fcc8a'], ['medium', 'Moyenne', '#9a8aff'], ['stealth', 'Furtive', '#ff8a8a'], ['other', 'Autres', '#cececd']];

/* ═══════════ PROSPECTION — RÈGLE VISIBLE + ACTION SUIVANTE (10/10/2026) ═══════════
   Retour testeurs : « les sondes sont compliquées », « que faire d'une signature ? ».
   Chaque cible a un état, chaque état a UNE action suivante, toujours affichée,
   et quand elle est impossible on dit pourquoi (test « encore une action », North Star §49). */

// PATCH_1610_SWIPE_DELETE — glisser vers la gauche : la corbeille (comme les notifications de l'iPhone)
var SW_LISTS = { probe: 'probeReports', tanker: 'tankerReports', beacon: 'beaconReports', fleet: 'reports' };
(function swWire() {
  if (window._swWired) return; window._swWired = true;
  const st = document.createElement('style');
  st.textContent = `
    .sw-row{position:relative;overflow:hidden;touch-action:pan-y;transition:height .25s ease,opacity .25s ease,margin .25s ease}
    .sw-row.sw-gone{height:0 !important;opacity:0;margin:0 !important}
    .sw-in{position:relative;z-index:1;transition:transform .22s cubic-bezier(.2,.8,.2,1);will-change:transform;background:var(--bg,#05080d)}
    .sw-row.sw-drag .sw-in{transition:none}
    .sw-del{position:absolute;top:0;bottom:0;right:0;width:100%;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:3px;padding:0 26px 0 0;border:0;border-radius:10px;background:#c8392f;color:#fff;font:inherit;cursor:pointer;opacity:0;transition:opacity .15s}
    .sw-row.sw-show .sw-del{opacity:1}
    .sw-del span{display:flex;width:24px;justify-content:center}
    .sw-del i{font-style:normal;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase}`;
  document.head.appendChild(st);
  const OPEN = 88;
  let cur = null;   // { row, x0, y0, dx, lock, open0 }
  const setX = (row, x) => { row.querySelector('.sw-in').style.transform = x ? `translateX(${x}px)` : ''; row.classList.toggle('sw-show', x < -2); };
  const closeAll = (except) => document.querySelectorAll('.sw-row.sw-open').forEach(r => { if (r !== except) { r.classList.remove('sw-open'); setX(r, 0); } });
  document.addEventListener('pointerdown', (e) => {
    const row = e.target.closest && e.target.closest('.sw-row');
    if (!row) { closeAll(); return; }
    if (e.target.closest('.sw-del')) return;
    closeAll(row);
    { // la corbeille épouse la carte du rapport (sans ses marges)
      const ch = row.querySelector('.sw-in > *'), del = row.querySelector('.sw-del');
      if (ch && del) { const R = row.getBoundingClientRect(), C = ch.getBoundingClientRect();
        Object.assign(del.style, { top: (C.top - R.top) + 'px', bottom: (R.bottom - C.bottom) + 'px', left: (C.left - R.left) + 'px', right: (R.right - C.right) + 'px', width: 'auto', borderRadius: getComputedStyle(ch).borderRadius || '10px' }); }
    }
    cur = { row, x0: e.clientX, y0: e.clientY, dx: 0, lock: null, open0: row.classList.contains('sw-open') ? -OPEN : 0, id: e.pointerId };
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerId !== cur.id) return;
    const dx = e.clientX - cur.x0, dy = e.clientY - cur.y0;
    if (!cur.lock) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; cur.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y'; if (cur.lock === 'x') cur.row.classList.add('sw-drag'); }
    if (cur.lock !== 'x') return;
    cur.dx = Math.min(0, cur.open0 + dx);
    setX(cur.row, cur.dx);
  }, true);
  const end = (e) => {
    if (!cur || (e && e.pointerId !== cur.id)) return;
    const c = cur; cur = null;
    c.row.classList.remove('sw-drag');
    if (c.lock !== 'x') return;
    c.row._swMoved = Date.now();
    const w = c.row.offsetWidth || 360;
    if (c.dx < -w * 0.55) { setX(c.row, -w); swDelete(c.row.dataset.sk, c.row.dataset.sid, c.row); return; }   // glissé loin : supprimé
    if (c.dx < -OPEN / 2) { c.row.classList.add('sw-open'); setX(c.row, -OPEN); }
    else { c.row.classList.remove('sw-open'); setX(c.row, 0); }
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  // un glissé n'ouvre pas le rapport ; la corbeille supprime ; une ligne ouverte se referme au toucher
  document.addEventListener('click', (e) => {
    const row = e.target.closest && e.target.closest('.sw-row');
    if (!row) return;
    if (e.target.closest('.sw-del')) { e.stopPropagation(); e.preventDefault(); swDelete(row.dataset.sk, row.dataset.sid, row); return; }
    if (row._swMoved && Date.now() - row._swMoved < 400) { e.stopPropagation(); e.preventDefault(); return; }
    if (row.classList.contains('sw-open')) { e.stopPropagation(); e.preventDefault(); row.classList.remove('sw-open'); setX(row, 0); }
  }, true);
})();
// au démarrage : les relevés restés en suspens (jeu fermé pendant le décodage) se relisent
setTimeout(() => { for (const r of (typeof G !== 'undefined' && G.probeReports) || []) if (r && r.tier === 'stealth' && r.spy && r.spy.pending) _spyEnrichReport(r, r.spy.coord || r.spy.address || r.targetCoords); }, 4000);

let probeTicker = null;

// ─── Persistence légère des custom names (localStorage) ───
// On stocke uniquement une map { coord -> customName } pour survivre au reload,
// pendant que G.knownSystems reste en mémoire. Quand une planète est révélée,
// on regarde si un customName existe pour sa coord et on l'applique.
const _CUSTOM_NAMES_KEY = 'starbyte_planet_custom_names';

// ─── Canal de communication inter-joueurs (16/05 — feedback V3) ───
// Ouvert quand un tanker est en orbite chez un joueur. Affiche une popup
// avec des pavillons (messages prédéfinis selon GDD_v0.2). Solo : envoi simulé
// avec toast de confirmation. Backend multijoueur arrivera plus tard.
const PLAYER_MESSAGE_FLAGS = [
  // PATCH_2110_PAVILLONS (Adrien) : chaque pavillon a un effet concret (serveur v23)
  { id: 'peace',     label: 'Paix ?',                  desc: 'S\'il répond « Paix ? » : la rivalité est levée',                 color: '#5fcc8a' },
  { id: 'trade',     label: 'Commerce ?',              desc: 'S\'il répond « Commerce ? » : accord 7 j, convois protégés, canal ouvert', color: '#ffc864' },
  { id: 'alliance',  label: 'Alliance temporaire ?',   desc: 'S\'il répond pareil : pacte de non-agression 48 h',               color: '#5fffe8' },
  { id: 'why_probe', label: 'Tu m\'as sondé. Explique-toi.', desc: 'Message, sans effet',                                 color: '#9a8aff' },
  { id: 'warning',   label: 'Dernier avertissement.',  desc: '24 h : ton prochain raid sur lui pille +10 %',                   color: '#ff8a8a' },
  { id: 'respect',   label: 'Respect pour ta défense.',desc: 'Message d\'honneur, sans effet',                                color: '#cececd' },
  { id: 'enemy',     label: 'Je te déclare ennemi.',   desc: 'Rivalité officielle : visible de tous, pillage +10 points, plus de pacte', color: '#ff4d4d' },
];

// PAVILLONS_1110 — clés du registre (table flags)
var MP_FLAG_KEY = { peace: 'paix', trade: 'commerce', alliance: 'alliance', why_probe: 'sonde', warning: 'avertissement', respect: 'respect', enemy: 'ennemi' };
var MP_FLAG_BY_KEY = {};
PLAYER_MESSAGE_FLAGS.forEach(f => { MP_FLAG_BY_KEY[MP_FLAG_KEY[f.id]] = f; });
var MP_FLAG_ERRORS = { flag_quota: 'Assez de pavillons pour aujourd\'hui (20 par jour)', target_unknown: 'Ce commandant n\'est plus au registre',
  already_replied: 'Tu as déjà répondu à ce pavillon', flag_too_old: 'Le registre n\'accepte pas encore les réponses tardives', already_flagged_this_stay: 'Un pavillon par convoi et par séjour',
  convoy_gone: 'Ce convoi a quitté le dock', not_docked: 'Ton séjour est terminé', no_world: 'Ton monde n\'est pas encore au registre' };

/* ═══════════ DEFENSE SCREEN (hub militaire) ═══════════ */

let selectedUnitDetailKey = null;
let selectedUnitDetailKind = 'defense';

/* ═══════════════════════════════════════════════════════════════
   FICHE BÂTIMENT — Écran de détail / amélioration (passe 2.4)
   ═══════════════════════════════════════════════════════════════ */
let selectedBuildingParcelIdx = null;


/* ═══════════ PATCH_2010_RECYCLER — recycler un bâtiment (Adrien 20/10 : « mais que ça coûte cher ») ═══════════
   Depuis la fiche du bâtiment. Coût : 60 % de tout ce qu'il a coûté (tiers 1 → actuel), au moins 1 500 métal
   et 500 énergie. Chantier de démolition : 2 h (tier 1), 4 h (tier 2), 8 h (tier 3). Rien n'est remboursé.
   Le bâtiment tourne jusqu'au bout ; à la fin la parcelle redevient une plaine rocheuse (re-terraformer au match-3). */
var RECYCLE_PCT = 0.6, RECYCLE_FLOOR = { metal: 1500, energie: 500 }, RECYCLE_MIN = { 1: 120, 2: 240, 3: 480 };
setInterval(() => { try { tickRecycling(); } catch (e) { console.warn('[recycler]', e); } }, 3000);

// ─── SHIP3D : fiche vaisseau en vue héros (3D plein écran derrière la fiche, comme le soldat lourd) ───
const UNIT_SHIP3D_MODELS = {
  cuirasse: { url: 'assets/3d/sb_kv01.glb?v=20261014-1440', code: 'KV-01 Kerath' },
  fregate:  { url: 'assets/3d/sb_sr01.glb?v=20261014-1440', code: 'SR-01 Sentinelle', profile: 'sr01' },
  tanker:   { url: 'assets/3d/sb_tk07.glb?v=20261014-1440', code: 'TK-07 Tanker', profile: 'tk07' },
  colonial: { url: 'assets/3d/sb_ak01.glb?v=20261020', code: 'AK-01 Arche coloniale', profile: 'ak01' },   // PATCH_2010_COLONIE (7,8 Mo : chargé sur la fiche seulement)
};
let unitShip3D = null;
// Gestes de la vue héros vaisseau : dans la zone libre, un doigt = orbite (rotation + inclinaison), deux doigts = zoom,
// comme sur la vitrine. Sur les cartes, défilement natif (la liste remonte par-dessus la 3D).
const shipHeroGesturesOn = {};
const DOCK_MODELS = {
  tanker:   { url: 'assets/3d/sb_tk07_lod.glb?v=20261014-1440', engine: [1.0, 0.7, 0.4] },
  fregate:  { url: 'assets/3d/sb_sr01_lod.glb?v=20261014-1440', engine: [0.5, 0.78, 1.0] },
  cuirasse: { url: 'assets/3d/sb_kv01_lod.glb?v=20261014-1440', engine: [0.5, 0.78, 1.0] },
};
let fleetShip3D = null;
// Barre de navigation (home.js) : le bouton Flotte ouvre directement l'écran Flotte (plus de vue orbite ni de menu) ;
// grisé tant que le chantier orbital n'est pas construit.
(function wireFleetNav() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.w-nav [data-sys="fleet"]');
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    if (!hasShipyardBuilt()) { if (typeof toast === 'function') toast('Construis le chantier orbital pour accéder à ta flotte'); return; }
    goto('fleet');
  }, true);
  setInterval(() => {
    const b = document.querySelector('.w-nav [data-sys="fleet"]');
    if (b) b.classList.toggle('sb-off', !hasShipyardBuilt());
  }, 1000);
})();

// ─── SHIP3D : fiche bâtiment en vue héros (chantier orbital OS-01) ───
const BUILDING_SHIP3D = { shipyard: { url: 'assets/3d/sb_os01_v2.glb.gz?v=20261103', code: 'OS-01 Chantier orbital', profile: 'os01' } };
let bdShip3D = null;

/* ═══════════ CAPITAL SCREEN (3 onglets) ═══════════ */

let capitalTab = 'stats';

let toastTimer = null;
// PATCH_1310_TOASTS — une bulle peut porter une action : toast(msg, () => …).
// Sans action explicite, _toastRoute devine la fenêtre d'après le message (rapport, carte, ambassade…).
var _toastTap = null, _toastWired = false;

/* ═══════════ MODAL STARBYTE (chunk polish 15/05) ═══════════
   API : sbConfirm(opts), sbPrompt(opts) → Promises.
   Remplace window.confirm() et window.prompt() avec une UI custom cohérente
   au style du jeu. Pop-up qui ne saute pas hors de l'app sur iOS Safari. */

let _sbModalResolve = null;
let _sbModalType = null;

// ACCUEIL (13/10) : flotte en mission vue de l'arrière, en fond (le moteur 3D se charge après le démarrage)
let _welcomeHero = null;

/* ⚡ V0.5 — Cheat secret (Adrien only)
 * Pour activer/désactiver le mode cheat sans le rendre visible aux beta testeurs.
 *
 * USAGE :
 *   - Tape 5 fois rapidement sur le nom de la planète "KERATH-VII" dans le dashboard
 *   - Les 5 taps doivent être faits en moins de 3 secondes
 *   - Toast confirme l'activation/désactivation
 *   - L'état est persistant (localStorage 'starbyte_dev_mode')
 *
 * Quand activé :
 *   - Le bouton CHEAT en bas devient visible
 *   - Tu accèdes à tout le panneau cheat normalement
 *
 * Pour désactiver :
 *   - Re-tape 5 fois → désactive et cache le bouton
 *
 * Note : si tu actives le mode dev sur le navigateur d'un testeur (cas réel),
 * il suffit de re-tap 5x pour désactiver. Pas de risque.
 */

const SECRET_TAP_KEY = 'starbyte_dev_mode';
const SECRET_TAP_COUNT_NEEDED = 5;
const SECRET_TAP_WINDOW_MS = 3000;
let _secretTapTimestamps = [];

// PATCH_2210_CHEATS — le panneau de triche n'existe que pour Adrien (son commandant au registre, ou son email,
// comparé par empreinte : l'adresse n'apparaît pas dans le code) et pour les tests en local. Pour tout autre
// joueur, taper sur le nom de la planète ne fait plus rien et un ancien mode développeur est ignoré.
const SB_DEV_PSEUDOS = ['hadrien'];
const SB_DEV_EMAIL_SHA = 'c8bdf9434f4c2dda2d7376b468cbe2b9503d3228abeb7ff91a806c4cb7584aa4';
let _sbDevEmailOk = false;
(function _sbDevEmailCheck(n) {
  try {
    const u = window.SBCloud && SBCloud.user;
    if (u && u.email && window.crypto && crypto.subtle) {
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(u.email).trim().toLowerCase())).then(b => {
        _sbDevEmailOk = [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') === SB_DEV_EMAIL_SHA;
        if (typeof _applyDevModeUI === 'function') _applyDevModeUI();
      });
      return;
    }
  } catch (e) {}
  if (n < 120) setTimeout(() => _sbDevEmailCheck(n + 1), 2000);
})(0);
setInterval(() => { try { if (typeof _applyDevModeUI === 'function') _applyDevModeUI(); } catch (e) {} }, 5000);

/* ═══════════════════════════════════════════════════════════════
   ROUTE CARDS — Phase 1 Routes Secrètes (Chunk B)
   ═══════════════════════════════════════════════════════════════
   Cartes de route : promesses non encore activées (cf. starbyte_routes_secretes.md).
   Trouvées via rencontres voie directe (Torek, Père Cobalt, balise, débris...).
   Types (kind) :
     - clean   : route propre, coordonnées exactes, qualité haute
     - holed   : carte abîmée, qualité moyenne, route incomplète
     - dead    : route morte (le commerce y a cessé)
     - fake    : carte bidon (escroquerie) — qualité = 0
     - singing : carte qui "parle" (bonus narratif rare)
   ═══════════════════════════════════════════════════════════════ */

const ROUTE_CARD_KINDS = {
  clean:   { weight: 70, qMin: 65, qMax: 100, label: 'Propre',         desc: 'Carte récente, lisible, coordonnées exactes.' },
  holed:   { weight: 15, qMin: 35, qMax: 65,  label: 'Trouée',          desc: 'Carte abîmée — il manque des morceaux du trajet.' },
  dead:    { weight: 8,  qMin: 10, qMax: 30,  label: 'Morte',           desc: 'La route existe encore, mais plus personne n\'y passe.' },
  fake:    { weight: 5,  qMin: 0,  qMax: 10,  label: 'Fausse',          desc: 'Coordonnées qui mènent nulle part. Quelqu\'un t\'a roulé.' },
  singing: { weight: 2,  qMin: 50, qMax: 90,  label: 'Chantante',       desc: 'Une voix dans le papier. Étrange. Précieuse.' },
};

// Hints "vagues" génériques pour Chunk B — Chunk C utilisera knownSystems
const HINT_PREFIXES = ['Près de', 'Aux abords de', 'Dans le couloir de', 'Vers les marges de', 'Derrière'];
const HINT_BODIES = ['Vorath', 'Cyranos', 'Sigma-26', 'la nébuleuse d\'Ahn', 'l\'Étoile Morte', 'Delta-9', 'Kerbera', 'Inkasthar'];

/* ═══════════════════════════════════════════════════════════════
   HUMEURS DE ROUTE — Phase 1 Chunk C (16/05)
   ═══════════════════════════════════════════════════════════════
   Cf. starbyte_routes_secretes.md § 🎭 LES HUMEURS DE ROUTE
   Une route activée reçoit une PERSONNALITÉ qui détermine son comportement.
   Phase 1 : 5 humeurs canon. Les saisons (Phase 6+) feront évoluer l'humeur.
   ═══════════════════════════════════════════════════════════════ */

const ROUTE_MOODS = {
  // Rapide, rentable, mais risque de disparition
  nerveuse: {
    key: 'nerveuse',
    label: 'Route nerveuse',
    accent: '#e87a3a',
    stabilityRange: [40, 60],
    bonusLabel: 'Trajet -30%',
    bonusDesc: 'Trajet court · contrats urgents · bonus cargo léger',
    riskDesc: 'Instabilité forte · peut s\'effondrer après quelques passages',
    bio: 'Couloir surchauffé qui ne survit qu\'à la rapidité. Personne ne s\'y attarde.',
    // D5.3 fix : profil de butin (visible joueur — ce qu'on peut attendre de cette route)
    lootProfile: { resMult: 0.8, cgMult: 1.5, label: 'Plutôt CG — peu de ressources' },
  },
  // Lente, lourde, commerciale, visible
  grasse: {
    key: 'grasse',
    label: 'Route grasse',
    accent: '#8bc24a',
    stabilityRange: [65, 85],
    bonusLabel: 'Cargo +50%',
    bonusDesc: 'Grosse capacité · marchandises rares plus probables',
    riskDesc: 'Très visible aux balises pirates · trajet long',
    bio: 'Couloir commercial épais et lent. Les pirates en font leurs salaires.',
    lootProfile: { resMult: 1.5, cgMult: 1.0, label: 'Plutôt ressources — CG standard' },
  },
  // Ancienne route d'une civilisation disparue
  morte: {
    key: 'morte',
    label: 'Route morte',
    accent: '#9988aa',
    stabilityRange: [25, 55],
    bonusLabel: 'Fragments historiques',
    bonusDesc: 'Archives du Vide · secrets · rumeurs anciennes',
    riskDesc: 'Peu rentable · anomalies fréquentes',
    bio: 'Le commerce y a cessé, mais quelque chose y passe encore. Les morts laissent des traces.',
    lootProfile: { resMult: 0.6, cgMult: 0.5, label: 'Pauvre en tout — fragments rares possibles' },
  },
  // Illégale, imprévisible, rock'n'roll
  noire: {
    key: 'noire',
    label: 'Route noire Korr-Vask',
    accent: '#c4452a',
    stabilityRange: [35, 65],
    bonusLabel: 'Pas de taxe',
    bonusDesc: 'Contrats rares · dettes · passagers · marchandises noires',
    riskDesc: 'Douane impériale possible · pirates fréquents · fausses coordonnées',
    bio: 'Couloir des marges du connu. Korr-Vask est un nom qu\'on murmure aux contrebandiers.',
    lootProfile: { resMult: 1.0, cgMult: 2.5, label: 'CG MASSIFS — ressources standard' },
  },
  // Très stable mais surveillée
  imperiale: {
    key: 'imperiale',
    label: 'Route impériale oubliée',
    accent: '#5fa8e8',
    stabilityRange: [80, 95],
    bonusLabel: 'Fiable',
    bonusDesc: 'Stabilité élevée · réputation commerciale · prédictible',
    riskDesc: 'Taxes · l\'Empire pourrait la redécouvrir',
    bio: 'Vieille artère officielle, abandonnée par les registres mais encore solide. L\'Empire n\'a pas oublié, juste rangé.',
    lootProfile: { resMult: 1.0, cgMult: 0.85, label: 'Équilibrée — taxe légère sur CG' },
  },
};

// Mapping carte → humeur probable selon le type de carte d'origine.
// Cf. GDD § "Comment l'humeur est attribuée" : le type de carte oriente l'humeur,
// mais il y a toujours une part d'aléatoire (variété).
const MOOD_PROBABILITIES_BY_CARD_KIND = {
  clean: { imperiale: 50, grasse: 30, nerveuse: 15, noire: 5, morte: 0 },
  holed: { nerveuse: 45, morte: 25, grasse: 15, noire: 15, imperiale: 0 },
  dead:  { morte: 70, nerveuse: 15, imperiale: 10, grasse: 5, noire: 0 },
  fake:  { morte: 60, noire: 30, nerveuse: 10, grasse: 0, imperiale: 0 },
  singing: { noire: 50, morte: 30, nerveuse: 10, imperiale: 10, grasse: 0 },
};

/* ═══════════════════════════════════════════════════════════════
   COMPTOIR D'ÉCHANGE — Marché CG ↔ Ressources (18/05/2026)
   ═══════════════════════════════════════════════════════════════
   Cf. demande Adrien 18/05 : "MVP medium : vendre + acheter ressources
   contre CG (taux fluctuant selon saison)"

   Le marché propose un taux d'échange CG ↔ ressources qui varie selon
   une SAISON de marché. La saison change tous les 7 jours réels.

   PRIX DE BASE (par unité de ressource) :
   - Métal :    achat=3 CG, vente=2 CG (spread 33%)
   - Énergie :  achat=4 CG, vente=3 CG (spread 25%)
   - Cristal :  achat=10 CG, vente=7 CG (spread 30%)

   5 SAISONS qui modifient ces prix :
   - normale : prix de base
   - abondance : -30% sur tout (acheter pas cher, vendre pas cher)
   - pénurie : +50% sur tout (vendre cher, acheter cher)
   - boom : vendre × 2.0, acheter standard (MEGA bon pour vendre)
   - crise : vendre × 0.5, acheter × 1.5 (terrible)
   ═══════════════════════════════════════════════════════════════ */

const MARKET_BASE_PRICES = {
  metal:   { buy: 3,  sell: 2 },
  energie: { buy: 4,  sell: 3 },
  cristal: { buy: 10, sell: 7 },
  // 18/05 : carburant au marché. Achetable cher (dépannage), revendable à perte.
  // Le carburant doit normalement venir de la Raffinerie — le marché est un secours.
  fuel:    { buy: 6,  sell: 3 },
};
