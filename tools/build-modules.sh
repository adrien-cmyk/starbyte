#!/bin/bash
# Construit les modules du jeu à partir de src/. Usage : tools/build-modules.sh [match3|m3-verify|home|cloud]
#   home   → github_upload/assets/home.js  = bundle esbuild de src/home.js (+ orbit3d.js, unit3d.js)
#   cloud  → github_upload/assets/cloud.js = bundle esbuild de src/cloud.js + @supabase/supabase-js 2.117.3 (version figée :
#            une autre version change tout le bundle ; installée --no-save si absente)
#   voyage → src/voyage_core.js et server/voyage/voyage_core.js (tools/build-voyage.py), puis tools/test_voyage.mjs
#   m3-verify → copie src/m3core.js et src/m3session.js dans server/m3-verify/ (fonction Edge, à redéployer ensuite)
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
  m3-verify)
    cp src/m3core.js src/m3session.js github_upload/server/m3-verify/
    echo "server/m3-verify : m3core.js et m3session.js recopiés depuis src/ (à redéployer)" ;;
  home)
    npx esbuild src/home.js --bundle --format=esm --minify --target=es2020,safari15 --legal-comments=none --outfile=github_upload/assets/home.js
    echo "assets/home.js : $(wc -c < github_upload/assets/home.js) octets" ;;
  cloud)
    v=$(node -e "try{console.log(require('./node_modules/@supabase/supabase-js/package.json').version)}catch(e){console.log('')}")
    [ "$v" = "2.117.3" ] || npm install --no-save @supabase/supabase-js@2.117.3 >/dev/null 2>&1
    npx esbuild src/cloud.js --bundle --format=esm --minify --target=es2020,safari15 --legal-comments=none --outfile=github_upload/assets/cloud.js
    echo "assets/cloud.js : $(wc -c < github_upload/assets/cloud.js) octets (supabase-js 2.117.3)" ;;
  voyage)
    python3 tools/build-voyage.py && node tools/test_voyage.mjs
    echo "server/voyage : voyage_core.js régénéré (à redéployer avec index.ts)" ;;
  *) echo "module inconnu : $what (disponible : match3, m3-verify, home, cloud, voyage)"; exit 1 ;;
esac
