#!/usr/bin/env python3
"""Liste des fichiers que l'app télécharge au premier lancement (precache.json), avec leur taille.
Les adresses sont celles que le jeu demande vraiment (avec ?v=… quand le code en met), pour que le cache
de l'app serve ensuite ces fichiers sans les retélécharger. Usage : python3 precache_list.py github_upload"""
import json, os, re, sys, hashlib
root = sys.argv[1]
EXT = r'(?:glb|gltf|bin|js|jpg|jpeg|png|webp|ktx2|hdr|json)'
pat = re.compile(r'(?:\./)?((?:assets|tiles|illustrations)/[A-Za-z0-9_\-./]+?\.' + EXT + r')(\?v=[A-Za-z0-9_.\-]+)?(?=["\'`)\s,;])')
refs = {}
srcs = [os.path.join(root, 'index.html')] + [os.path.join(root, 'assets', f) for f in os.listdir(os.path.join(root, 'assets')) if f.endswith('.js')]
for src in srcs:
    try: txt = open(src, encoding='utf-8', errors='ignore').read()
    except Exception: continue
    for m in pat.finditer(txt):
        p, v = m.group(1), m.group(2) or ''
        if not os.path.isfile(os.path.join(root, p)): continue
        if v or p not in refs: refs[p] = v or refs.get(p, '')
# tous les modèles 3D et scripts, même ceux dont le nom est construit par le code
for d in ('assets/3d', 'assets/3d/full', 'assets'):
    full = os.path.join(root, d)
    if not os.path.isdir(full): continue
    for f in os.listdir(full):
        p = d + '/' + f
        if os.path.isfile(os.path.join(root, p)) and re.search(r'\.' + EXT + '$', f) and p not in refs: refs[p] = ''
items = [{'u': p + v, 's': os.path.getsize(os.path.join(root, p))} for p, v in sorted(refs.items())]
total = sum(i['s'] for i in items)
h = hashlib.sha1(json.dumps(items, sort_keys=True).encode()).hexdigest()[:12]
json.dump({'id': h, 'total': total, 'files': items}, open(os.path.join(root, 'precache.json'), 'w'), separators=(',', ':'))
print(f'precache.json : {len(items)} fichiers, {total/1e6:.1f} Mo, id {h}')
