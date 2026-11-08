# src/ — sources des modules minifiés du jeu

| Module publié | Sources | Build |
|---|---|---|
| `github_upload/assets/match3.js` | `match3.js` (interface) + `m3core.js` (moteur pur : grille hex 7×9, gravité, spéciales, gains) + `m3view3d.js` (plateau 3D) + `m3secours_vocab.js` (vocabulaire « Secours », ajouté tel quel en tête du bundle) | `tools/build-modules.sh match3` |

Historique : jusqu'au 8/11/2026 ces sources vivaient sur le Mac (`starbyte_proto/src/`) et avaient pris du retard sur
le fichier déployé, patché directement en minifié (Secours, Antenne/veine profonde, skills, sons). Le 8/11 les patchs
ont été reportés dans les sources, et le bundle reconstruit a été vérifié équivalent au fichier déployé (comparaison
à renommage près, session de match-3 complète en Chromium). **Depuis, on ne modifie plus jamais `assets/match3.js`
à la main : on édite `src/` puis on rebuild.** Le moteur `m3core.js` est pur (aucune dépendance au DOM) : c'est lui
que le serveur rejouera quand le match-3 deviendra serveur-autoritaire.

Pas encore rapatriés : `home.js` (dépend d'`orbit3d.js`, `unit3d.js` sur le Mac) et `cloud.js` (supabase-js inclus,
version du paquet à retrouver). Leurs fichiers déployés font foi en attendant.

Réglages du match-3 : `SESSION` (coups, paliers, bonus), `YIELD`, `BASE_WEIGHTS`, `VALUE`, `CASCADE_MULT` dans `m3core.js`.
