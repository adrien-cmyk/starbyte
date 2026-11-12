#!/usr/bin/env python3
"""Construit src/voyage_core.js (module pur des voyages par corridors) et sa copie pour la fonction serveur `voyage`.

  python3 tools/build-voyage.py

Le module = le générateur de l'univers tel quel (bloc <script id="universe-core"> de labo/carte-zones/base_atlas.html),
le réseau candidat (const NET de la même page), puis les règles de src/voyage_rules.js. Ne jamais modifier
src/voyage_core.js ni github_upload/server/voyage/voyage_core.js à la main : éditer la source, puis relancer ce script,
puis redéployer la fonction `voyage` (voir github_upload/server/voyage/README.md).
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
atlas = open(os.path.join(ROOT, 'labo/carte-zones/base_atlas.html'), encoding='utf-8').read()
m = re.search(r'<script id="universe-core">\n(.*?)</script>', atlas, re.S)
if not m:
    sys.exit('bloc universe-core introuvable')
core = m.group(1).replace("'use strict';\n", '', 1)
i = atlas.index('const NET=') + len('const NET=')
net, _ = json.JSONDecoder().raw_decode(atlas[i:])
rules = open(os.path.join(ROOT, 'src/voyage_rules.js'), encoding='utf-8').read()

out = ('/* GÉNÉRÉ par tools/build-voyage.py — ne pas modifier à la main.\n'
       '   1) générateur de l\'univers (copie exacte du bloc universe-core de l\'Atlas) ; 2) réseau candidat ; 3) src/voyage_rules.js */\n'
       + core.rstrip() + '\n\nconst NET=' + json.dumps(net, ensure_ascii=False, separators=(',', ':')) + ';\n\n'
       + rules.rstrip() + '\n\nexport { NET, generateSector, sectorFromAddress, sectorAddress, SPOTS, localSpotOffset, HOME_SECTOR, SECTOR_SIZE, PER_SECTOR };\n')
for dst in ('src/voyage_core.js', 'github_upload/server/voyage/voyage_core.js'):
    p = os.path.join(ROOT, dst)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(out)
    print(dst, len(out.encode('utf-8')), 'octets')
