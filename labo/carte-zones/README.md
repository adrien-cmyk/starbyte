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

## Retirer le test

Supprimer la ligne `zones_test.js` d'`index.html` et le dossier `github_upload/atlas/`. Les quatre lignes `ZONES_1011`
et la clé `zoneProspect` peuvent rester (sans effet), ou être retirées.
