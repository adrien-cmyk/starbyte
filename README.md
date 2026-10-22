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
