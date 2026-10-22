# Starbyte

Jeu mobile (web app) : match-3 hexagonal et empire galactique persistant. © Adrien Thétaz.

- **Jouer** : https://play.starbyte.online
- **Le jeu** : dossier `github_upload/` (page `index.html`, `assets/`, `tiles/`, `illustrations/`, `sw.js`, `manifest.webmanifest`).
- **Serveur** : `github_upload/server/` (scripts SQL Supabase, fonction `resolve-raids`) — jamais publié sur le site.
- **Publication** : chaque modification poussée dans `github_upload/` part automatiquement chez Infomaniak
  (`.github/workflows/publier-infomaniak.yml`, FTPS, fichiers modifiés seulement).
