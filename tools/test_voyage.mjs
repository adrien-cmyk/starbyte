#!/usr/bin/env node
// Test du module pur des voyages (src/voyage_core.js) : node tools/test_voyage.mjs
// 1. La courbe de Catmull-Rom du module = celle de THREE r128 (la bibliothèque de l'Atlas), au bit près ou presque.
// 2. Le réseau mesuré sur les courbes, la version, des devis cohérents (E1, E3, E7), les corridors connus.
// 3. La fonction serveur (github_upload/server/voyage/index.ts) : sa logique pure, rejouée ici avec un faux registre.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = await import(path.join(ROOT, 'src/voyage_core.js'));
const R = []; const rec = (id, ok, note) => { R.push({ id, ok }); console.log((ok ? '✓' : '✗') + ' ' + id.padEnd(10) + ' ' + note); };

// 1. THREE r128 tel que l'Atlas le charge
const html = readFileSync(path.join(ROOT, 'labo/carte-zones/base_atlas.html'), 'utf8');
const three = html.split('<script>').find(s => s.includes('THREE={}'));
const ctx = { self: {}, globalThis: {} }; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(three.slice(0, three.indexOf('</script>')), ctx);
const T = ctx.THREE, B = V.HOME_SECTOR.map(n => n * V.SECTOR_SIZE);
let worst = 0, n = 0;
for (const c of V.NET.corridors) {
  const local = c.nodes.map(id => { const p = V.systemPos(V.NET.nodes.find(x => x.id === id).key); return [p[0] - B[0], p[1] - B[1], p[2] - B[2]]; });
  const curve = new T.CatmullRomCurve3(local.map(p => new T.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  for (let i = 0; i <= 200; i++) { const t = i / 200, a = curve.getPoint(t), b = V.catmullPoint(local, t); worst = Math.max(worst, Math.abs(a.x - b[0]), Math.abs(a.y - b[1]), Math.abs(a.z - b[2])); n++; }
}
rec('COURBE', worst < 1e-9, `${n} points sur les ${V.NET.corridors.length} corridors : écart maximal avec THREE r128 ${worst.toExponential(2)} u (corridor de deux nœuds compris)`);

// 2. réseau et devis
const g = V.voyageGraph();
rec('RESEAU', g.edges.length === 18 && Math.abs(g.len - 8309.52) < .05 && /^net-[0-9a-f]{8}-r[0-9a-f]{4}$/.test(g.version), `${g.cors.length} corridors, ${g.edges.length} tronçons, ${g.len.toFixed(2)} u sur les courbes · version ${g.version}`);
const o = V.voyageOptions('A-O-2178-07', 'A-M-3340', 1, null), L = o.plans.find(p => p.k === 'libre'), C = o.plans.find(p => p.k === 'cor');
const ruleOk = p => Math.abs(p.test - Math.max(p.min, 1200 / 12) / 25) < 1e-9 && p.fuel === Math.round(50 * Math.max(p.legs.reduce((a, l) => a + l.len * (l.t === 'cor' ? .35 : 1), 0), 1200) / 2400);
rec('DEVIS', o.ok && L && C && ruleOk(L) && ruleOk(C) && Math.abs(L.len - C.legs.length * 0 - L.legs[0].len) < 1e-9 && C.via.length === C.legs.length - 1, `A-O-2178-07 → Drifting Crown (T1) : vol libre ${L.len.toFixed(0)} u, ${L.test.toFixed(2)} min, ${L.fuel} carburant · corridors ${C.len.toFixed(0)} u, ${C.test.toFixed(2)} min, ${C.fuel} carburant, ${C.nCor} tronçons, via ${C.via.join(' ')}`);
const shortTrip = V.voyageOptions('A-M-3341-02', 'A-M-3340', 2, null).plans[0];
rec('MINIMUM', shortTrip.floorT && shortTrip.floorF && Math.abs(shortTrip.test - 4) < 1e-9 && shortTrip.fuel === 75, `trajet court (T2) : ${shortTrip.len.toFixed(0)} u → ${shortTrip.test} min et ${shortTrip.fuel} carburant (minimum par mission, E7)`);
const none = V.voyageOptions('A-O-2178-07', 'A-M-3340', 1, []), some = V.voyageOptions('A-O-2178-07', 'A-M-3340', 1, ['C5', 'C4', 'C3', 'C1']);
const usedIn = p => new Set((p ? p.legs : []).filter(l => l.cor).map(l => l.cor));
rec('CONNUS', none.plans.length === 1 && none.plans[0].k === 'libre' && [...usedIn(some.plans.find(p => p.k === 'cor'))].every(c => ['C5', 'C4', 'C3', 'C1'].includes(c)), `sans corridor connu : ${none.plans.map(p => p.k).join(', ')} · avec C1, C3, C4, C5 : ${[...usedIn(some.plans.find(p => p.k === 'cor'))].join(', ') || 'aucun'}`);
rec('ADRESSES', !V.voyageOptions('A-O-0000-01', 'A-M-3340', 1).ok && !V.voyageOptions('pas une adresse', 'A-M-3340', 1).ok && V.addressPos('A-O-2178') && V.addressPos('A-O-2178-07')[0] !== V.addressPos('A-O-2178')[0], 'adresses invalides refusées ; une planète est décalée de son étoile (emplacement)');

// 3. fonction serveur : logique pure (index.ts lit le module et la table ; ici, faux registre)
const src = readFileSync(path.join(ROOT, 'github_upload/server/voyage/index.ts'), 'utf8');
const pure = src.slice(src.indexOf('// ── logique pure'), src.indexOf('// ── fin de la logique pure'));
const js = pure.replace(/(\w|\)): any\b/g, '$1');   // les seules annotations de la partie pure sont « : any »
const fn = new Function('V', js + '\nreturn { planLaunch, checkOrigin };')(V);
const reg = { address: 'A-O-2178-07', colonies: ['A-N-1200-03'] };
const ok1 = fn.planLaunch({ origin: 'A-O-2178-07', dest: 'A-M-3340', tier: 1, pick: 'cor', mission: 'tm-1794000000000-ab1c', known: null }, reg, 1_800_000_000_000);
const ko1 = fn.planLaunch({ origin: 'A-B-1000-01', dest: 'A-M-3340', tier: 1, pick: 'cor', mission: 'tm-1794000000001-ab2c' }, reg, 1_800_000_000_000);
const ko2 = fn.planLaunch({ origin: 'A-O-2178-07', dest: 'A-B-1000', tier: 1, pick: 'cor', mission: 'tm-1794000000002-ab3c' }, reg, 1_800_000_000_000);
rec('SERVEUR', ok1.ok && ok1.row.arrives_at - ok1.row.departed_at === Math.round(C.test * 60000) && ok1.row.fuel === C.fuel && ok1.row.net_version === g.version && ko1.why === 'origin_not_yours' && ko2.why === 'not_a_port',
  `lancement : ${ok1.ok ? Math.round((ok1.row.arrives_at - ok1.row.departed_at) / 1000) + ' s, ' + ok1.row.fuel + ' carburant, ' + ok1.row.plan.nCor + ' tronçons' : ok1.why} · monde d'un autre : ${ko1.why} · destination hors des ports : ${ko2.why}`);
// 4. le jeu (assets/zones_test.js) nomme les corridors et les ports du réseau comme NET : la conversion « route → corridor » en dépend
const bridge = readFileSync(path.join(ROOT, 'github_upload/assets/zones_test.js'), 'utf8');
const cors = JSON.parse(bridge.match(/const CORRIDORS = (\[[^\n]*?\]);/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
const ports = JSON.parse(bridge.match(/const NET_PORTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const netPorts = V.NET.nodes.filter(n => n.type === 'station').map(n => n.key);
rec('JEU', JSON.stringify(cors) === JSON.stringify(V.NET.corridors.map(c => ({ id: c.id, name: c.name }))) && JSON.stringify(ports) === JSON.stringify(netPorts), `le jeu connaît les ${cors.length} corridors (mêmes ids, mêmes noms) et les ${ports.length} ports du réseau`);
const bad = R.filter(r => !r.ok).length; console.log(bad ? `\n${bad} échec(s)` : `\nvoyage_core : ${R.length}/${R.length}`); process.exit(bad ? 1 : 0);
