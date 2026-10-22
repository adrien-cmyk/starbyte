import re,sys
src=open('src/index.src.html',encoding='utf8').read()
logo=open('src/logo.svg').read().replace('<svg ','<svg aria-hidden="true" focusable="false" ')
viewer=open('src/viewer.js').read().replace('export class','class')
heart='<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.2 0 3.6 1.3 4.4 2.6.8-1.3 2.2-2.6 4.4-2.6 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>'
src=src.replace('{{HEART}}',heart).replace('{{LOGO}}',logo).replace('/*VIEWER*/',viewer)
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
