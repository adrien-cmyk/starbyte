import re,sys
src=open('src/index.src.html',encoding='utf8').read()
logo=open('src/logo.svg').read().replace('<svg ','<svg aria-hidden="true" focusable="false" ')
viewer=open('src/viewer.js').read().replace('export class','class')
src=src.replace('{{LOGO}}',logo).replace('/*VIEWER*/',viewer)
# artifact body (no skeleton)
open('index.artifact.html','w').write(src)
# deploy version: full document
i=src.index('<nav class="nav"')
head,body=src[:i],src[i:]
doc='<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'+head+'\n</head>\n<body>\n'+body+'\n</body>\n</html>\n'
open('dist_index.html','w').write(doc)
# local test version
loc=doc.replace('https://cdn.jsdelivr.net/npm/three@0.169.0/','./_three/')
open('_local.html','w').write(loc)
print(len(doc))
