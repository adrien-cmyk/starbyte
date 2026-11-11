# Carte par zones — test sur le compte d'Adrien (Hadrien)

Cahier « Prospection par zones et continuité Atlas / Tactique » v2.0. Décisions : `claude/starbyte_decision_sondage_zone.md` (projet Claude).

## Ce qui est en ligne

- `github_upload/atlas/index.html` — la carte (atlas fractal 3D + vue tactique par zones), **construite** depuis ce dossier.
  Ne pas la modifier à la main : modifier les sources ici puis `python3 labo/carte-zones/build.py`.
- `github_upload/assets/zones_test.js` — le pont avec le jeu. Chargé par tous les joueurs mais **inerte** sauf pour le compte
  d'Adrien (`_sbDevAllowed()` : pseudo « hadrien » au registre ou empreinte de l'email) et en local.
  Bouton « Zones · test » dans le Centre de prospection (en haut à droite) ; l'adresse `?zones` ouvre aussi la carte.
- Quatre lignes `ZONES_1011` dans `assets/game/f03_flotte_combat_legende.js` : une mission de Radar portant un champ `zone`
  rend le contenu fixe de la zone ; une signature portant `zoneOutcome` se résout comme prévu. Aucune autre mission ne passe par là.
- `zoneProspect` dans `EXTRA_SAVE_KEYS` (`d01`) : absent des autres parties.

## Règles du test

- Zone = prisme hexagonal `tac-2:q:r:k`, 240 u entre centres, couches de 200 u (`zj_grid.js`, valeurs gelées).
- « Sonder cette zone » = **une vraie Radar** du hangar du monde de départ (`G.probesPool`), mission dans `G.probeMissions`.
  Durée 5 à 10 min selon la distance 3D (décision D4 proposée). Portée = secteurs de la règle actuelle × 1 600 u (D5).
- Région de test : 30 zones autour d'OPUS-ONE et d'OPUS-SCND (19 + 7 + 4 à d'autres profondeurs), 12 vides, 12 activités
  communes (6 astéroïdes, 3 veines, 3 épaves), 6 choix (2 planètes habitables, anomalie, débris, sonde ancienne, cargo).
  Fixée une seule fois dans `G.zoneProspect.region` ; chaque contenu est posé sur un vrai système de la zone accepté par
  `validateAddressForTier` (et un emplacement habitable pour les planètes).
- À l'arrivée : une vraie signature (`G.signatures`), sans expiration (D7). La suite est celle du jeu : Légère, Moyenne,
  tanker, colonisation. Une zone sondée ne se rebalaye pas.
- Journal des actions dans `G.zoneProspect.journal` (ouverture, lancement, arrivée, actions) pour les mesures du § 9.4.
- **Limite connue** : comme toutes les sondes du jeu aujourd'hui, tout se passe dans la partie du joueur, pas sur le serveur.
  Le contenu de la région est donc lisible dans la sauvegarde du compte de test.

## Tester

```
python3 labo/carte-zones/build.py          # reconstruit atlas/index.html et l'empreinte ?v= dans zones_test.js
node labo/carte-zones/test_zones.mjs        # jeu en Chromium sans écran, iPhone émulé ; captures dans captures/
node tools/parcours.mjs                     # parcours habituel du jeu
```

## Observer un monde (11/11, cahier « Observer une planète, son système et son voisinage »)

Choisir un monde, un port ou une signature puis passer en Atlas le montre en gros plan (niveau Objet) ; le dézoom
révèle son système puis le voisinage. Une zone montre son volume. Sélection (`zj.sel`) et présentation (`zj.pres`)
sont deux états distincts ; observer ne change ni l'origine des sondages ni les données. Le système de démonstration
de l'atlas (planètes tirées au hasard, grille des 99 spots) n'est plus construit dans la carte par zones.
Essais : `node labo/carte-zones/test_observer.mjs` (36 contrôles, les quatre mondes de Panzerstorm du cahier).
Rapport : `claude/starbyte_observer_rapport_2026_11_11.md` (Project).

## Suivre une mission (11/11, cahier v1.1 § 18)

Mes mondes › « En vol » : tankers, sondes, flottes en embuscade, arches de la partie, lus sans rien modifier
(`SBZones.state().travels`). Position estimée sur les horaires enregistrés (jalons connus d'une ligne, ou ligne
droite). « Suivre dans l'Atlas » : la caméra accompagne le véhicule ; orbite et pincement gardent le suivi, un
déplacement libre le suspend. En Tactique, la couche suit la mission avec une marge de 15 %. Essais : section 5
de `test_zones.mjs` (FOLLOW-01 à FOLLOW-07, sur un vrai tanker). Décisions pour les corridors :
`claude/starbyte_suivi_missions_corridors_2026_11_11.md`.

## Retirer le test

Supprimer la ligne `zones_test.js` d'`index.html` et le dossier `github_upload/atlas/`. Les quatre lignes `ZONES_1011`
et la clé `zoneProspect` peuvent rester (sans effet), ou être retirées.
