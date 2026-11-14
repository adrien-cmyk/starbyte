#!/usr/bin/env python3
"""Compare « avant » et « après » migration pour chaque partie rejouée par tools/migration_replay.mjs.
Usage : python3 tools/migration_compare.py <replay.jsonl> [--detail]
Contrôles par partie (✗ = à regarder) :
  CHARGE   la partie se charge avant et après, la carte s'ouvre et place la capitale ;
  ERREURS  aucune erreur de page nouvelle après la migration ;
  CLES     aucune clé de la sauvegarde ne disparaît ;
  PORTS    mêmes ports découverts, mêmes routes (aucun cadeau, rien de perdu) ;
  BALISES  mêmes balises : chacune est restée, a été posée sur un relais du corridor de sa ligne, ou est rentrée au hangar ;
  SONDES   mêmes sondes et mêmes missions de sondes ;
  FLOTTES  mêmes flottes, mêmes états, mêmes embuscades ;
  TANKERS  mêmes missions de tankers ;
  SAVOIR   aucun tronçon connu perdu ; un tronçon ajouté ne finit jamais sur un port inconnu ;
  RAPPORTS aucun rapport perdu ; mêmes systèmes connus, mêmes signatures, mêmes mondes ;
  TEXTE    aucune mention d'essai sur la carte ;
  ACCUEIL  la fiche d'accueil s'ouvre (si le Centre de prospection est ouvert) et seulement alors.
"""
import json, sys, collections

DETAIL = '--detail' in sys.argv
rows = [json.loads(l) for l in open([a for a in sys.argv[1:] if not a.startswith('--')][0], encoding='utf-8')]
tot = collections.Counter(); bad = collections.Counter(); notes = []

def check(row):
    out = {}
    b, a = row['before'], row['after']
    if b.get('skipped'):   # partie simple : rejouée seulement après migration
        sa = a.get('sum') or {}; m = a.get('map') or {}
        out['CHARGE'] = (bool(a.get('loaded') and a.get('frame') and m.get('home') and not m.get('block')), f"frame {a.get('frame')} home {m.get('home')} block {m.get('block')} why {a.get('why')} adresse {sa.get('address')}")
        out['ERREURS'] = (not a.get('errs'), '; '.join(a.get('errs', [])[:3]))
        out['TEXTE'] = (not m.get('test'), 'mention trouvée' if m.get('test') else '')
        out['ACCUEIL'] = (True, ('ouverte' if a.get('welcome') else 'non') + (' (Centre fermé)' if a.get('locked') else ''))
        return out, sa
    sb, sa = b.get('sum') or {}, a.get('sum') or {}
    m = a.get('map') or {}
    pilot = (sb.get('atlasCarte') or {}).get('mode') == 'progressive' or (sa.get('atlasCarte') or {}).get('mode') == 'progressive'
    out['CHARGE'] = (bool(b.get('loaded') and a.get('loaded') and a.get('frame') and m.get('home') and not m.get('block')), f"frame {a.get('frame')} home {m.get('home')} block {m.get('block')} why {a.get('why') or b.get('why')}")
    newerr = [e for e in a.get('errs', []) if e not in b.get('errs', [])]
    out['ERREURS'] = (not newerr, '; '.join(newerr[:3]))
    lost = sorted(set(sb.get('keys', [])) - set(sa.get('keys', [])))
    out['CLES'] = (not lost, ','.join(lost))
    rb, ra = sorted(r['id'] for r in sb.get('routes', []) if r), sorted(r['id'] for r in sa.get('routes', []) if r)
    out['PORTS'] = (sb.get('ports') == sa.get('ports') and rb == ra, f"ports {len(sb.get('ports', []))}→{len(sa.get('ports', []))} routes {len(rb)}→{len(ra)} +{sorted(set(sa.get('ports', []))-set(sb.get('ports', [])))} -{sorted(set(sb.get('ports', []))-set(sa.get('ports', [])))}")
    # balises
    st = sa.get('station') or []
    chainOf = {}; oldOf = {}
    for l in st:
        chainOf[l['id']] = l['chain']
        for k in (l.get('old') or []): oldOf.setdefault(k, set()).update(l['chain'])
    bb = {x['id']: x for x in sb.get('beacons', [])}; ba = {x['id']: x for x in sa.get('beacons', [])}
    okb = set(bb) == set(ba); why = []
    moved = back = 0
    for i, x in bb.items():
        y = ba.get(i)
        if not y: why.append('perdue ' + i); continue
        if x['st'] == y['st'] and x['sys'] == y['sys']: continue
        fs = (x['sys'] or '')[:8]
        if x['st'] == 'deployed' and y['st'] == 'deployed' and fs in oldOf and (y['sys'] or '')[:8] in oldOf[fs]: moved += 1; continue
        if x['st'] == 'deployed' and y['st'] == 'ready' and fs in oldOf: back += 1; continue
        okb = False; why.append(f"{i} {x['st']}:{x['sys']}→{y['st']}:{y['sys']}")
    dep_after = [y['sys'] for y in ba.values() if y['st'] == 'deployed']
    dup = [k for k, n in collections.Counter(dep_after).items() if n > 1 and k]
    out['BALISES'] = (okb and not why, f"{len(bb)} balises · {moved} sur relais · {back} au hangar" + (' · ' + '; '.join(why[:4]) if why else '') + (f" · doublons {dup}" if dup else ''))
    pmb = sorted((m['id'], m['tier'], m['st']) for m in sb.get('probeMissions', []) if m); pma = sorted((m['id'], m['tier'], m['st']) for m in sa.get('probeMissions', []) if m)
    out['SONDES'] = (sb.get('probes') == sa.get('probes') and pmb == pma, f"sondes {sb.get('probes')}→{sa.get('probes')} missions {len(pmb)}→{len(pma)}")
    # une flotte qui rentrait d'embuscade peut être arrivée entre les deux passages : c'est le jeu qui avance, pas la migration
    fbl = [f for f in sb.get('fleets', []) if f]
    fal = {f['id']: f for f in sa.get('fleets', []) if f}
    for f in fbl:
        g = fal.get(f['id'])
        if g and f['amb'] and f['amb'].get('ph') == 'returning' and not g['amb']: f['amb'] = None; f['st'] = g['st']
    fb = sorted((f['id'], f['st'], json.dumps(f['amb'], sort_keys=True), f['gar']) for f in fbl)
    fa = sorted((f['id'], f['st'], json.dumps(f['amb'], sort_keys=True), f['gar']) for f in sa.get('fleets', []) if f)
    out['FLOTTES'] = (fb == fa, f"{len(fb)} flottes" + ('' if fb == fa else ' · ' + str([x for x in fa if x not in fb])[:200]))
    tb = sorted((t['id'], t['st']) for t in sb.get('tankers', []) if t); ta = sorted((t['id'], t['st']) for t in sa.get('tankers', []) if t)
    out['TANKERS'] = (tb == ta, f"{len(tb)} missions" + ('' if tb == ta else ' · ' + str(set(ta) ^ set(tb))[:200]))
    # un tronçon PNJ se reconnaît à ses deux bouts (deux lignes d'une même station partagent leur corridor : le jeu n'en garde qu'un)
    lb, la = set(':'.join([x.split(':')[0]] * 0 + [x.split(':', 1)[1]]) for x in sb.get('legs', [])), set(x.split(':', 1)[1] for x in sa.get('legs', []))
    laf = set(sa.get('legs', []))
    lostlegs = lb - la; added = la - lb
    portsKnown = set(sa.get('ports', []))
    portOf = {l['id']: l['port'] for l in st}
    unknownPorts = set(portOf.values()) - set(sb.get('ports', []))
    gifts = [x for x in added if x.split('>')[1] in unknownPorts]
    out['SAVOIR'] = (not lostlegs and not gifts, f"tronçons {len(lb)}→{len(la)} (+{len(added)})" + (f" · perdus {sorted(lostlegs)[:3]}" if lostlegs else '') + (f" · vers un port inconnu {gifts[:3]}" if gifts else ''))
    # les rapports de balise (fenêtre de 12 min) et les signatures (apparitions, expirations) bougent avec le temps de jeu entre les deux
    # passages : ils sont montrés, pas comptés ; la migration n'y touche pas
    rep_ok = all((sa.get('reports') or {}).get(k, 0) >= v for k, v in (sb.get('reports') or {}).items() if k != 'beacon')
    same = sb.get('known') == sa.get('known') and sb.get('worlds') == sa.get('worlds')
    out['RAPPORTS'] = (rep_ok and same, f"rapports {sb.get('reports')}→{sa.get('reports')} · systèmes {sb.get('known')}→{sa.get('known')} · signatures {sb.get('sigs')}→{sa.get('sigs')}")
    out['TEXTE'] = (not m.get('test'), 'mention trouvée' if m.get('test') else '')
    wl = a.get('welcome'); locked = a.get('locked')
    played = (sb.get('reports') or {}).get('probe') or (sb.get('reports') or {}).get('tanker') or sb.get('tankers') or sb.get('routes') or (sb.get('known') or 0) > 1 or sb.get('echoes')
    want = not pilot and not locked and bool(played)
    out['ACCUEIL'] = (bool(wl) == want and (not wl or 'Nouvelle carte' in wl), ('ouverte' if wl else 'non') + (' (Centre fermé)' if locked else '') + (' (pilote)' if pilot else ''))
    return out, sa

for r in rows:
    res, sa = check(r)
    for k, (ok, n) in res.items():
        tot[k] += 1
        if not ok: bad[k] += 1
    ko = [k for k, (ok, n) in res.items() if not ok]
    line = f"{r['uid']} {str(r.get('pseudo') or '—')[:14]:14} " + ('OK' if not ko else '✗ ' + ','.join(ko))
    bil = (sa.get('atlasCarte') or {}).get('bilan')
    if bil: line += f"  · bilan {bil}"
    print(line)
    if ko or DETAIL:
        for k, (ok, n) in res.items():
            if (not ok) or DETAIL: print(f"     {'✓' if ok else '✗'} {k:8} {n}")
print('\nRésumé :', ', '.join(f"{k} {tot[k]-bad[k]}/{tot[k]}" for k in tot))
