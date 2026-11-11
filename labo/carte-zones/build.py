#!/usr/bin/env python3
"""Construit github_upload/atlas/index.html : l'atlas fractal (base_atlas.html) + la carte par zones (zj_*).
Écrit aussi l'empreinte de la page dans github_upload/assets/zones_test.js (adresse ?v=).
Usage : python3 labo/carte-zones/build.py   (depuis la racine du dépôt ou d'ailleurs)"""
import os, re, hashlib
D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(D, '..', '..'))
s = open(os.path.join(D, 'base_atlas.html'), encoding='utf-8').read()
def once(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a)); s = s.replace(a, b)
js = open(os.path.join(D, 'zj_grid.js'), encoding='utf-8').read() + '\n' + open(os.path.join(D, 'zj_app.js'), encoding='utf-8').read()
once("function pick(x,y){", "function pick(x,y){return zjAtlasTap(x,y)}\nfunction pickStar_(x,y){")   # les étoiles ne sont plus des cibles
once("function updateMarkerLabels(){", "function updateMarkerLabels(){return;")                     # remplacés par les marqueurs de la carte
once("p.point=star.clone().add(vector(localSpotOffset(39)))", "p.point=star.clone().add(vector(localSpotOffset(p.spot!=null?p.spot:0)))")
# observer (11/11) : plus de système de démonstration tiré au hasard à l'approche ; zoom borné par le modèle observé ; pas de glissement en gros plan
once("if(!focused&&distance<150&&wantedDistance<150&&ready){", "if(false&&!focused&&distance<150&&wantedDistance<150&&ready){")
s = s.replace(",14,6500)", ",zjMinD(),6500)"); assert s.count("zjMinD(),6500)") == 4
once("function pan(dx,dy){", "function pan(dx,dy){if(zjNoPan())return;")
once("const local=toLocal(target),offset=new T.Vector3(", "const local=toLocal(target).add(zjLook()),offset=new T.Vector3(")   # au dézoom, le regard glisse vers le système
once("function projectLabels(){const w=innerWidth,h=innerHeight;navFrame(w,h);", "function projectLabels(){const w=innerWidth,h=innerHeight;navFrame(w,h);zjFrame();")
once("toast('Votre planète est au centre. Prenez le large.')", "toast('Touchez une zone voisine pour la sonder.')")
once("activeKeys.add(keyOf(HOME_SECTOR));requestSector(HOME_SECTOR,true);", js + "\nactiveKeys.add(keyOf(HOME_SECTOR));requestSector(HOME_SECTOR,true);")
m = re.search(r'<canvas id="space"[^>]*>(</canvas>)?', s); assert m
s = s[:m.end()] + '\n' + open(os.path.join(D, 'zj.html'), encoding='utf-8').read() + s[m.end():]
once("</style>", open(os.path.join(D, 'zj.css'), encoding='utf-8').read() + "\n</style>")
once("<title>Starbyte · Atlas vivant · navigation</title>", "<title>Starbyte · Carte par zones (test)</title><script>document.documentElement.classList.add('zj-js')</script>")
out = os.path.join(ROOT, 'github_upload', 'atlas', 'index.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(s)
h = hashlib.sha256(s.encode('utf-8')).hexdigest()[:10]
zt = os.path.join(ROOT, 'github_upload', 'assets', 'zones_test.js')
z = open(zt, encoding='utf-8').read()
z2 = re.sub(r"const PAGE_V = '[^']*';", "const PAGE_V = '" + h + "';", z, count=1)
if z2 != z: open(zt, 'w', encoding='utf-8').write(z2)
app = re.search(r'<script id="application">(.*?)</script>', s, re.S).group(1)
open('/tmp/zj_app_check.js', 'w', encoding='utf-8').write(app)
print('atlas/index.html', len(s) // 1024, 'Ko · empreinte', h)
