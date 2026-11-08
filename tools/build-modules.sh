#!/bin/bash
# Construit les modules minifiés du jeu à partir de src/ (esbuild). Usage : tools/build-modules.sh [match3]
#   match3 → github_upload/assets/match3.js  = src/m3secours_vocab.js (tel quel) + bundle esbuild de src/match3.js
#            (qui importe src/m3core.js, le moteur pur, et src/m3view3d.js, le plateau 3D).
# Après un build : node tools/parcours_m3.mjs (session complète) puis node tools/parcours.mjs, et pousser.
# Les ?v= d'index.html sont recalculés par le workflow (tools/versionner.mjs) : rien à changer à la main.
set -e
cd "$(dirname "$0")/.."
command -v npx >/dev/null || { echo "node/npx requis"; exit 1; }
[ -d node_modules/esbuild ] || npm install --no-save esbuild@0.28 >/dev/null 2>&1
what="${1:-match3}"
case "$what" in
  match3)
    npx esbuild src/match3.js --bundle --format=esm --minify --target=es2020,safari15 --legal-comments=none --outfile=/tmp/sb_match3.bundle.js
    { cat src/m3secours_vocab.js; echo; cat /tmp/sb_match3.bundle.js; } > github_upload/assets/match3.js
    echo "assets/match3.js : $(wc -c < github_upload/assets/match3.js) octets" ;;
  *) echo "module inconnu : $what (disponible : match3)"; exit 1 ;;
esac
