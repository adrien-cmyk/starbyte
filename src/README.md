# src/ — sources des modules minifiés du jeu

| Module publié | Sources | Build |
|---|---|---|
| `github_upload/assets/match3.js` | `match3.js` (interface) + `m3session.js` (session pure : coups, paliers, crédit, rejeu) + `m3core.js` (moteur pur : grille hex 7×9, gravité, spéciales, gains) + `m3view3d.js` (plateau 3D) + `m3secours_vocab.js` (vocabulaire « Secours », ajouté tel quel en tête du bundle) | `tools/build-modules.sh match3` |
| `github_upload/server/m3-verify/m3core.js`, `m3session.js` | copies exactes des deux fichiers ci-dessus (fonction Edge) | `tools/build-modules.sh m3-verify` |
| `github_upload/assets/home.js` | `home.js` (écran planète : barre de ressources, cartes, fiches d'unités) + `orbit3d.js` (orbite, chantier) + `unit3d.js` (unités 3D) | `tools/build-modules.sh home` |
| `github_upload/assets/cloud.js` | `cloud.js` (sauvegarde cloud, registre multijoueur `SBMP`) + `@supabase/supabase-js` **2.117.3** (version du bundle publié ; une autre version change le bundle) | `tools/build-modules.sh cloud` |

Modules publiés **non minifiés** (le fichier publié est la source, on l'édite directement) : `assets/lines.js`, `perf.js`,
`spacemap.js`, `spacemap2d.js`, `system3d.js`, `sky.js`, `aftermath.js`, `skills.js`, … — tout ce qui dans `assets/` se lit
comme du code normal.

## Historique et règle

Jusqu'au 8/11/2026 ces sources vivaient sur le Mac (`starbyte_proto/src/`) et avaient pris du retard sur les fichiers
déployés, patchés directement en minifié (scripts `tools/patch_*.py` du Mac). Le 8/11, les patchs ont été reportés dans
les sources de `match3.js`, puis de `home.js` (PATCH_2510_BUNKER, PATCH_2010_SURPLUS) et de `cloud.js` (colonies v18-v23,
relations, commerce, alliances, garnisons, raids orphelins), et chaque bundle reconstruit a été vérifié **équivalent au
fichier déployé** (comparaison des jetons à renommage près ; pour le match-3, session complète en Chromium).

**Depuis, on ne modifie plus jamais un bundle minifié à la main : on édite `src/` puis on rebuild.** Un bundle reconstruit
après une modification n'est pas comparé octet à octet au précédent (le minificateur renomme) : on le teste
(`tools/parcours.mjs`, `tools/parcours_m3.mjs`) et on pousse.

## En retard : `_en_retard/planet3d.js`

`assets/planet3d.js` (carte 3D de la planète, Three.js 0.186 inclus) a été patché en minifié pendant trois semaines
(terrain continu, herbe, fluidité, lumières, recycleur, plateforme d'amélioration, colonies désertiques…) : 36 blocs de
différence avec la source du Mac, copiée ici telle quelle pour ne pas la perdre. **Le fichier déployé fait foi ; ne pas
reconstruire `planet3d.js` depuis cette source** avant d'y avoir reporté les patchs (même méthode que pour `cloud.js` :
rebuild, `prettier` des deux côtés, `diff`, report hunk par hunk, re-comparaison à renommage près).
Build quand ce sera fait : `npx esbuild src/planet3d.js --bundle --format=esm --minify --target=es2020,safari15 --legal-comments=none --outfile=github_upload/assets/planet3d.js` avec `three@0.186.0`.

Réglages du match-3 : `SESSION` (coups, paliers, bonus), `YIELD`, `BASE_WEIGHTS`, `VALUE`, `CASCADE_MULT` dans `m3core.js` ;
règles de session (`SESSION_RULES`, thèmes) dans `m3session.js`.
