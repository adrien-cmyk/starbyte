# Starbyte

Jeu mobile (web app) : match-3 hexagonal et empire galactique persistant. © Adrien Thétaz.

- **Jouer** : https://play.starbyte.online
- **Site vitrine** : https://starbyte.online — dossier `site/` (page `index.html`, `img/`, `3d/`), sources dans `site/_src/` (jamais publiées).
  Publication automatique chez Infomaniak à chaque modification de `site/` (`.github/workflows/publier-site.yml`,
  secrets `INFOMANIAK_SITE_FTP_SERVER`, `INFOMANIAK_SITE_FTP_USER`, `INFOMANIAK_SITE_FTP_PASSWORD`).
- **Le jeu** : dossier `github_upload/` (page `index.html`, `assets/`, `tiles/`, `illustrations/`, `sw.js`, `manifest.webmanifest`).
- **Serveur** : `github_upload/server/` (scripts SQL Supabase, fonction `resolve-raids`) — jamais publié sur le site.
- **Publication** : chaque modification poussée dans `github_upload/` part automatiquement chez Infomaniak
  (`.github/workflows/publier-infomaniak.yml`, FTPS, fichiers modifiés seulement).

## Où vit le code du jeu (depuis le 08/11/2026)

`index.html` ne porte plus que le HTML, le CSS et quelques scripts d'amorçage. Le code du jeu (l'ancien
script en ligne de 2,5 Mo) est dans `github_upload/assets/game/` :

- `f01…f09_*.js` — toutes les déclarations de fonctions, dans l'ordre d'origine (f01 commence par les noms
  `var` de premier niveau, pré-déclarés comme le faisait le hoisting du monolithe) ;
- `d01…d04_*.js` — données, variables et instructions exécutées au chargement, dans l'ordre d'origine.

Scripts classiques (pas de modules) : tout est global comme avant, les `onclick` du HTML fonctionnent tels quels.
Les modules déjà séparés (`assets/*.js`) ne changent pas. **Toute modification de code se fait dans ces fichiers,
jamais en réinjectant du code dans `index.html`.** Une session qui reprend un ancien contexte doit repartir de `main`.

Outils (`tools/`) :
- `node tools/parcours.mjs` — test de parcours (Chromium sans écran) : accueil, écrans principaux, match-3 ; à lancer
  avant de pousser une modification large. Variable `CHROME` pour un autre navigateur.
- `node tools/versionner.mjs` — réécrit chaque `?v=` d'`index.html` avec l'empreinte du fichier ; le workflow de
  publication le fait tout seul, plus besoin de changer les versions à la main (`--check` pour vérifier).
- `node tools/decouper.mjs` — le découpage lui-même (relançable sur un `index.html` qui contiendrait encore le gros bloc).

Référence : `claude/starbyte_plan_notifications_decoupage.md` dans le Projet Claude (mesures et pièges).
