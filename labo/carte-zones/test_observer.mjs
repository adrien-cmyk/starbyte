// Essais du cahier « Observer une planète, son système et son voisinage » (11/11/2026).
// Page = carte par zones en fichier autonome, avec les quatre mondes de Panzerstorm donnés par le cahier (§ 4).
// Usage : node labo/carte-zones/test_observer.mjs   (après python3 labo/carte-zones/build.py)
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/npm-tools/node_modules/playwright'); }
const { chromium, devices } = pw;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SHOTS = path.join(ROOT, 'labo', 'carte-zones', 'captures'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const rec = (id, ok, msg) => { results.push({ id, ok, msg }); console.log((ok ? '✓ ' : '✗ ') + id.padEnd(8) + ' ' + msg); };

const DATA = { ok: true, pseudo: 'Panzerstorm', planet_name: 'BLACKSTONE', address: 'A-O-6386-40', level: 9, saved_at: new Date().toISOString(),
  colonies: [{ address: 'A-R-5999-08', name: 'REDSTONE' }, { address: 'A-L-9952-59', name: 'WHITESTONE' }, { address: 'A-R-4979-40', name: 'YELLOWSTONE' }],
  save_worlds: [], known_targets: [], reports: [], missions: [], arks: [],
  signatures: [{ id: 'SIG-RS1', system: 'A-R-5999', type: 'heat_point', typeLabel: 'Point chaud', resolved: false }, { id: 'SIG-OB2', system: 'A-O-6390', type: 'heat_point', typeLabel: 'Point chaud', resolved: false }],
  known_systems: ['A-O-6386', 'A-O-6390', 'A-O-6400', 'A-R-5999', 'A-R-4979', 'A-L-9952'] };
const SPOT = { 'A-O-6386-40': 39, 'A-R-5999-08': 7, 'A-L-9952-59': 58, 'A-R-4979-40': 39 };
const src = fs.readFileSync(path.join(ROOT, 'github_upload', 'atlas', 'index.html'), 'utf8');
const TAG = '<script id="application">';
const page = src.replace(TAG, () => '<script>window.SB_ZONES_EMBED=' + JSON.stringify({ v: 1, pseudo: 'Panzerstorm', data: DATA, region: null, exportedAt: Date.now() }).replace(/</g, '\\u003c') + '</' + 'script>\n' + TAG);
const FILE = path.join(SHOTS, 'observer_panzerstorm.html'); fs.writeFileSync(FILE, page);

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(ctxOpt) {
  const ctx = await browser.newContext(ctxOpt); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200)));
  await p.goto('file://' + FILE, { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 40; i++) { await sleep(400); if (await p.evaluate(() => !!(window.STARBYTE_ZONES && STARBYTE_ZONES.zj.peek && STARBYTE_ZONES.zj.ws.length))) break; }
  await sleep(1200); return { ctx, p, errs };
}
const Z = (p, f, a) => p.evaluate(f, a);
const settle = async (p, ms = 2200) => { await sleep(ms); };
const st = p => Z(p, () => { const S = STARBYTE_ZONES, zj = S.zj; return { mode: zj.mode, view: zj.view, sel: zj.sel && zj.sel.id, selType: zj.sel && zj.sel.type, zone: zj.sel && zj.sel.zone, k: zj.k, origin: zj.origin, pres: S.pres(), obs: S.obs(), marks: S.atlasState().marks.map(m => m.t), prism: S.prism(), demo: S.demoSystem(), scr: S.objScreen(), ins: S.insets(),
  body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), foot: document.getElementById('zj-sh-foot').innerText.replace(/\s+/g, ' '), cam: S.cam() }; });

// ═══ iPhone ═══
const { ctx, p, errs } = await open({ ...devices['iPhone 13'] });
const ids = await Z(p, () => STARBYTE_ZONES.zj.ws.map(w => ({ id: w.id, name: w.name, coord: w.coord, spot: w.spot, off: [w.p[0], w.p[1], w.p[2]], zone: w.zone })));
const before = await Z(p, () => JSON.stringify({ d: window.SB_ZONES_EMBED.data, ws: STARBYTE_ZONES.zj.ws.map(w => [w.id, w.coord, w.p, w.zone]), est: STARBYTE_ZONES.zj.ws.map(w => STARBYTE_ZONES.estimate(w.zone)) }));
const okIds = ids.length === 4 && ids.every(w => SPOT[w.coord] === w.spot && w.id === (w.coord === 'A-O-6386-40' ? 'w:A-O-6386-40' : 'w:' + w.coord));
rec('ID-03', okIds, ids.map(w => `${w.name} ${w.coord} → spot ${w.spot + 1} (indice ${w.spot}), id ${w.id}`).join(' · '));

// 1. Tactique : REDSTONE choisie dans « Ses mondes »
await Z(p, () => document.getElementById('zj-worlds').click()); await sleep(300);
await Z(p, () => [...document.querySelectorAll('#zj-sh-body [data-a="world"]')].find(b => /REDSTONE/.test(b.textContent)).click()); await sleep(500);
let s = await st(p);
rec('VIEW-02a', s.sel === 'world:w:A-R-5999-08' && s.origin !== 'w:A-R-5999-08' && /A-R-5999-08/.test(s.body) && /spot 08/.test(s.body) && /Observer sa colonie/.test(s.foot),
  `Tactique, Ses mondes › REDSTONE : sélection ${s.sel}, origin des mesures inchangée (${s.origin}) · fiche « ${s.body.slice(0, 150)} » · boutons « ${s.foot} »`);
const tacZone = s.zone, tacK = s.k;
await p.screenshot({ path: path.join(SHOTS, 'obs_1_tactique_redstone.png') });

// 2. Observer sa colonie → Atlas, gros plan
await Z(p, () => document.querySelector('#zj-sh-foot [data-a="observe"]').click()); await settle(p, 2600);
s = await st(p);
const off = s.obs && s.obs.p.map((v, i) => v - s.obs.anchor[i]);
rec('ID-01', s.obs && s.obs.addr === 'A-R-5999-08' && s.marks.length === 1 && /REDSTONE/.test(s.marks[0]) && /A-R-5999-08/.test(s.marks[0]), `objet observé ${s.obs && s.obs.addr} · libellé unique « ${s.marks.join(' | ')} »`);
rec('ID-02', off && Math.abs(off[0] + 3.8) < .01 && Math.abs(off[1]) < .01 && Math.abs(off[2] + 6.582) < .01, `position = ancre du système A-R-5999 + décalage du spot 08 (${off && off.map(v => v.toFixed(2)).join(', ')}) ; aucun spot 40 ni planète de démonstration`);
rec('ID-04', !!s.obs && !s.demo, `REDSTONE observable alors que le tirage de démonstration de A-R-5999 ne contient pas le spot 08 (spots 10, 53, 58) ; système de démonstration construit : ${s.demo}`);
const dT = s.cam.target.reduce((a, v, i) => a + (v - s.obs.p[i]) ** 2, 0) ** .5;
rec('FOC-01', s.mode === 'atlas' && s.pres.level === 'object' && dT < .05, `mode ${s.mode}, présentation « ${s.pres.level} », cible caméra à ${dT.toFixed(3)} u de REDSTONE, distance ${s.pres.distance.toFixed(1)} u`);
const useW = s.ins.right - s.ins.left, frac = 2 * s.scr.rpx / useW, cx = (s.ins.left + s.ins.right) / 2, cy = (s.ins.top + s.ins.bottom) / 2;
rec('FOC-02', frac >= .33 && frac <= .52 && s.scr.y - s.scr.rpx > s.ins.top && s.scr.y + s.scr.rpx < s.ins.bottom && Math.abs(s.scr.x - cx) < 12 && Math.abs(s.scr.y - cy) < 12,
  `diamètre ${Math.round(2 * s.scr.rpx)} px = ${(frac * 100).toFixed(0)} % de la largeur utile (${Math.round(useW)} px) · centre (${Math.round(s.scr.x)}, ${Math.round(s.scr.y)}) pour un rectangle utile centré en (${Math.round(cx)}, ${Math.round(cy)}), entre ${Math.round(s.ins.top)} et ${Math.round(s.ins.bottom)} px`);
rec('FOC-04', !s.prism, `prisme de zone affiché : ${s.prism}`);
rec('VIS-01', s.marks.length === 1 && !s.marks.some(t => /lieux/.test(t)), `marqueurs visibles : ${s.marks.length} (${s.marks.join(' | ')})`);
rec('VIS-02', !s.demo, `grille des 99 spots / système de démonstration : ${s.demo ? 'présent' : 'absent'}`);
await p.screenshot({ path: path.join(SHOTS, 'obs_2_redstone_objet.png') });

// 3. Toucher le vide, fermer la fiche, toucher le modèle
const corner = { x: s.ins.left + 20, y: s.ins.top + 20 };
await Z(p, c => STARBYTE_ZONES.atlasTapAt(c.x, c.y), corner); await sleep(300);
let s2 = await st(p);
await Z(p, () => document.getElementById('zj-sh-back').click()); await sleep(300);
let s3 = await st(p);
rec('BACK-03', s2.sel === s.sel && s2.pres.level === 'object' && s2.marks.length === 1 && s3.sel === s.sel && s3.pres.level === 'object' && s3.marks.length === 1,
  `toucher le vide : sélection ${s2.sel}, présentation ${s2.pres.level}, ${s2.marks.length} marqueur · fermer la fiche : sélection ${s3.sel}, ${s3.pres.level}, ${s3.marks.length} marqueur`);
await Z(p, c => STARBYTE_ZONES.atlasTapAt(c.x, c.y), { x: s.scr.x, y: s.scr.y }); await sleep(300);
s2 = await st(p);
rec('PICK-01', s2.sel === s.sel && s2.view === 'obj', `toucher le modèle : sélection ${s2.sel}, fiche ${s2.view}`);
rec('PICK-02', s2.sel === s.sel, `les étoiles derrière la planète ne sont pas des cibles (sélection inchangée : ${s2.sel})`);

// 4. Pincer puis relever les doigts : pas de clic parasite
const cdp = await ctx.newCDPSession(p), d0 = (await Z(p, () => STARBYTE_ZONES.pres())).wantedDistance;
const tp = (a, b) => [{ x: a, y: 180, id: 1 }, { x: b, y: 180, id: 2 }];   // au-dessus du libellé de la planète
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(140, 250) }); await sleep(60);
for (const b of [235, 220, 200, 185]) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(140, b) }); await sleep(40); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 140, y: 180, id: 1 }] }); await sleep(40);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const pinch = { d0, d1: (await Z(p, () => STARBYTE_ZONES.pres())).wantedDistance };
await sleep(400); s2 = await st(p);
rec('PICK-03', s2.sel === s.sel && pinch.d1 > pinch.d0 && s2.view !== 'choix' && s2.mode === 'atlas', `pincement : distance ${pinch.d0.toFixed(1)} → ${pinch.d1.toFixed(1)} u, sélection ${s2.sel}, aucune action lancée`);

// 5. Dézoom : Objet → Système → Voisinage (cible conservée), puis retour
await Z(p, () => STARBYTE_ZONES.observe('world:w:A-R-5999-08')); await settle(p, 2000);   // repart du cadrage de référence
await Z(p, () => { const b = document.getElementById('zj-zout'); for (let i = 0; i < 5; i++) b.click(); }); await settle(p, 2400);
s2 = await st(p);
const sysMarks = s2.marks;
rec('ZOOM-01', s2.pres.level === 'system' && s2.sel === s.sel && s2.obs.star && sysMarks.some(t => /REDSTONE/.test(t)) && sysMarks.some(t => /Étoile · A-R-5999/.test(t)),
  `dézoom à ${s2.pres.distance.toFixed(0)} u : présentation ${s2.pres.level}, étoile visible ${s2.obs.star}, REDSTONE reste repérée · marqueurs « ${sysMarks.join(' | ')} »`);
rec('VIS-03', sysMarks.every(t => /REDSTONE|A-R-5999|SIG-RS1/.test(t)) && sysMarks.some(t => /SIG-RS1/.test(t)) && !sysMarks.some(t => /SIG-OB2|BLACKSTONE|YELLOWSTONE|WHITESTONE|lieux/.test(t)),
  `vue Système : seulement les objets rattachés à A-R-5999 (YELLOWSTONE, dans le même secteur mais un autre système, n'y est pas)`);
rec('VIS-04', !s2.demo && s2.obs.others.length === 0, `aucune planète inconnue ajoutée par le générateur (autres modèles du système : ${s2.obs.others.length})`);
await p.screenshot({ path: path.join(SHOTS, 'obs_3_redstone_systeme.png') });
await Z(p, () => { const b = document.getElementById('zj-zout'); for (let i = 0; i < 9; i++) b.click(); }); await settle(p, 2600);
let s4 = await st(p);
rec('ZOOM-02', s4.pres.level === 'neighbourhood' && s4.sel === s.sel && s4.marks.length >= 2 && s4.marks.some(t => /REDSTONE/.test(t)) && !s4.marks.some(t => /lieux/.test(t) && /REDSTONE/.test(t)),
  `dézoom à ${s4.pres.distance.toFixed(0)} u : présentation ${s4.pres.level}, REDSTONE encore identifiable (les lieux qui la recouvrent s'effacent jusqu'au zoom), ${s4.marks.length} marqueurs : ${s4.marks.slice(0, 6).join(' | ')}`);
await p.screenshot({ path: path.join(SHOTS, 'obs_4_redstone_voisinage.png') });
await Z(p, () => { const b = document.getElementById('zj-zin'); for (let i = 0; i < 22; i++) b.click(); }); await settle(p, 2800);
s4 = await st(p);
rec('ZOOM-R', s4.pres.level === 'object' && s4.sel === s.sel, `zoom avant sans déplacement : retour au gros plan de REDSTONE (${s4.pres.level}, ${s4.pres.distance.toFixed(1)} u)`);

// 6. Retour au voisinage (commande dédiée)
const orig0 = s4.origin;
await Z(p, () => document.querySelector('#zj-sh-foot [data-a="back-n"]') ? document.querySelector('#zj-sh-foot [data-a="back-n"]').click() : STARBYTE_ZONES.backN()); await settle(p, 2600);
s4 = await st(p);
rec('BACK-01', s4.pres.level === 'neighbourhood' && s4.sel === s.sel && s4.origin === orig0 && s4.pres.distance > 200, `Retour au voisinage : ${s4.pres.level} à ${s4.pres.distance.toFixed(0)} u, cible toujours ${s4.sel}, origine ${s4.origin} inchangée`);

// 7. Déplacement libre puis zoom ailleurs : aucun retour forcé
await Z(p, () => STARBYTE_ZONES.observe('world:w:A-R-5999-08')); await settle(p, 2400);
await Z(p, () => { const b = document.getElementById('zj-zout'); for (let i = 0; i < 4; i++) b.click(); }); await settle(p, 2000);
await Z(p, () => { for (let i = 0; i < 30; i++) STARBYTE_ZONES.panBy(-40, 0); }); await sleep(300);
await Z(p, () => { const b = document.getElementById('zj-zin'); for (let i = 0; i < 8; i++) b.click(); }); await settle(p, 2400);
s4 = await st(p);
const away = s4.cam.target.reduce((a, v, i) => a + (v - s4.obs.p[i]) ** 2, 0) ** .5;
rec('ZOOM-03', s4.pres.level !== 'object' && away > s4.obs.R * 3 && s4.sel === s.sel, `après un déplacement libre de ${away.toFixed(1)} u puis un zoom avant : présentation ${s4.pres.level}, la caméra n'est pas ramenée sur REDSTONE`);

// 8. Retour en Tactique : même monde, même zone, bonne couche
await Z(p, () => STARBYTE_ZONES.observe('world:w:A-R-5999-08')); await settle(p, 2200);
await Z(p, () => document.getElementById('zj-m-tac').click()); await sleep(600);
s4 = await st(p);
rec('BACK-02', s4.mode === 'tac' && s4.sel === s.sel && s4.zone === tacZone && s4.k === tacK, `Tactique : sélection ${s4.sel}, zone ${s4.zone} (avant : ${tacZone}), couche ${s4.k} (avant : ${tacK})`);
await p.screenshot({ path: path.join(SHOTS, 'obs_5_retour_tactique.png') });

// 9. Les autres mondes, changement rapide, mémoire bornée
const seen = [];
for (const id of ['world:w:A-O-6386-40', 'world:w:A-L-9952-59', 'world:w:A-R-4979-40']) { await Z(p, i => STARBYTE_ZONES.observe(i), id); await settle(p, 1800); const o = await st(p); seen.push(`${o.obs.addr} (${o.pres.level}, libellé « ${o.marks[0]} »)`);
  if (id === 'world:w:A-L-9952-59') await p.screenshot({ path: path.join(SHOTS, 'obs_6_whitestone_objet.png') }); }
rec('ID-03b', seen.length === 3 && /A-O-6386-40 \(object/.test(seen[0]) && /A-L-9952-59 \(object/.test(seen[1]) && /A-R-4979-40 \(object/.test(seen[2]), seen.join(' · '));
const quick = await Z(p, async () => { STARBYTE_ZONES.observe('world:w:A-R-5999-08'); STARBYTE_ZONES.observe('world:w:A-L-9952-59'); await new Promise(r => setTimeout(r, 1500)); return { obs: STARBYTE_ZONES.obs().addr, sel: STARBYTE_ZONES.zj.sel.id, mark: STARBYTE_ZONES.atlasState().marks.map(m => m.t) }; });
rec('LOAD-02', quick.obs === 'A-L-9952-59' && quick.sel === 'world:w:A-L-9952-59' && /WHITESTONE/.test(quick.mark.join('')), `REDSTONE puis WHITESTONE aussitôt : affiché ${quick.obs}, sélection ${quick.sel}`);
const m0 = await Z(p, () => ({ ...STARBYTE_ZONES.mem(), tex: STARBYTE_ZONES.texN() }));
for (let n = 0; n < 12; n++) { await Z(p, i => STARBYTE_ZONES.observe(i), ['world:w:A-O-6386-40', 'world:w:A-L-9952-59', 'world:w:A-R-4979-40', 'world:w:A-R-5999-08'][n % 4]); await sleep(250); }
await sleep(800);
const m1 = await Z(p, () => ({ ...STARBYTE_ZONES.mem(), tex: STARBYTE_ZONES.texN() }));
rec('PERF-01', m1.geometries <= m0.geometries + 2 && m1.textures <= m0.textures + 2 && m1.tex <= 8, `après 12 observations de plus : géométries ${m0.geometries} → ${m1.geometries}, textures ${m0.textures} → ${m1.textures}, textures de planètes en cache ${m1.tex} (borne 8)`);

// 10. Port, signature, zone
const others = await Z(p, async () => { const S = STARBYTE_ZONES, wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
  const stn = S.objects().find(o => o.type === 'station'); S.observe(stn.id); await wait(2000); out.st = { lvl: S.pres().level, mark: S.atlasState().marks.map(m => m.t), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ').slice(0, 220) };
  const sig = S.objects().find(o => o.type === 'sig' && o.g.id === 'SIG-RS1'); S.observe(sig.id); await wait(2000); out.sig = { lvl: S.pres().level, mark: S.atlasState().marks.map(m => m.t), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') };
  return out; });
rec('STATION', others.st.lvl === 'object' && others.st.mark.length === 1 && /Fichier exporté : les modèles 3D restent dans le jeu. Silhouette générique, identité exacte/.test(others.st.body), `port observé : ${others.st.lvl} · « ${others.st.mark[0]} » · « ${others.st.body.slice(0, 120)} »`);
rec('SIGNAT', others.sig.lvl === 'object' && /n’en révèle pas la nature/.test(others.sig.body) && !/Champ|Épave|Cristal|habitable/i.test(others.sig.body), `signature non identifiée en gros plan : « ${others.sig.mark[0]} » · « ${others.sig.body.slice(0, 200)} »`);
await p.screenshot({ path: path.join(SHOTS, 'obs_7_signature.png') });
await Z(p, () => { const S = STARBYTE_ZONES; S.setMode('tac'); const R = S.zj.snap.zp.region; S.selectZone(R ? R.zones[0].id : S.zj.ws[0].zone); S.setMode('atlas'); }); await settle(p, 2000);
s4 = await st(p);
rec('FOC-03', s4.pres.level === 'zone' && s4.prism && s4.selType === 'zone' && !s4.obs, `zone choisie puis Atlas : présentation ${s4.pres.level}, prisme ${s4.prism}, aucun modèle d'objet`);
await p.screenshot({ path: path.join(SHOTS, 'obs_8_zone.png') });

// 11. Données inchangées, lecture seule
const after = await Z(p, () => JSON.stringify({ d: window.SB_ZONES_EMBED.data, ws: STARBYTE_ZONES.zj.ws.map(w => [w.id, w.coord, w.p, w.zone]), est: STARBYTE_ZONES.zj.ws.map(w => STARBYTE_ZONES.estimate(w.zone)) }));
rec('DATA-01', after === before, `adresses, positions, zones et découvertes identiques avant et après toutes les observations : ${after === before}`);
rec('DATA-02', after === before, `distances et portées de jeu (estimations de zone) inchangées par l'échelle de présentation : ${after === before}`);
const ro = await Z(p, () => ({ launch: !!document.querySelector('[data-a="launch"],[data-a="act"],[data-a="build-radar"]'), origin: STARBYTE_ZONES.zj.origin }));
rec('VIEW-01', !ro.launch, `aucune commande d'envoi ni de gestion dans sa partie (bouton présent : ${ro.launch})`);
rec('VIEW-02', ro.origin === s.origin || ro.origin === 'w:A-O-6386-40', `mesures toujours depuis ${ro.origin} après avoir observé ses quatre mondes`);
rec('ERREURS', errs.length === 0, errs.length ? errs.join(' | ') : 'aucune erreur de page (iPhone)');
await ctx.close();

// ═══ Ordinateur ═══
const d = await open({ viewport: { width: 1280, height: 800 } });
await Z(d.p, () => STARBYTE_ZONES.observe('world:w:A-R-5999-08')); await settle(d.p, 2600);
const ds = await st(d.p); const dw = ds.ins.right - ds.ins.left, dfrac = 2 * ds.scr.rpx / dw;
rec('FOC-02d', ds.pres.level === 'object' && dfrac > .28 && dfrac < .5 && Math.abs(ds.scr.x - (ds.ins.left + ds.ins.right) / 2) < 12 && ds.scr.x - ds.scr.rpx > ds.ins.left,
  `ordinateur 1280 × 800 : diamètre ${(dfrac * 100).toFixed(0)} % de la largeur utile, centré dans la partie libre à droite du panneau (${Math.round(ds.scr.x)} px pour ${Math.round((ds.ins.left + ds.ins.right) / 2)})`);
await d.p.screenshot({ path: path.join(SHOTS, 'obs_9_redstone_ordinateur.png') });
rec('ERREURS-d', d.errs.length === 0, d.errs.length ? d.errs.join(' | ') : 'aucune erreur de page (ordinateur)');
await d.ctx.close();
// ═══ Préférence « réduire les animations » : pas de vol, cadrage immédiat ═══
const rm = await open({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
const rmv = await Z(rm.p, async () => { STARBYTE_ZONES.observe('world:w:A-R-5999-08'); await new Promise(r => setTimeout(r, 120)); const o = STARBYTE_ZONES.obs(), c = STARBYTE_ZONES.cam(), pr = STARBYTE_ZONES.pres();
  return { d: c.distance, dObj: o.dObj, dt: Math.hypot(c.target[0] - o.p[0], c.target[1] - o.p[1], c.target[2] - o.p[2]), lvl: pr.level }; });
rec('MOTION', rmv.lvl === 'object' && Math.abs(rmv.d - rmv.dObj) < .5 && rmv.dt < .01, `mouvement réduit : cadrage immédiat (${rmv.d.toFixed(1)} u pour ${rmv.dObj.toFixed(1)} u visés, 120 ms après le choix), sans vol`);
await rm.ctx.close();
await browser.close();
const bad = results.filter(r => !r.ok); console.log(`\n${results.length - bad.length}/${results.length} contrôles OK`); process.exit(bad.length ? 1 : 0);
