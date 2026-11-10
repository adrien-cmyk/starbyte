#!/usr/bin/env node
// Test de la carte par zones (compte de test) dans le vrai jeu, Chromium sans écran, iPhone émulé.
//   node labo/carte-zones/test_zones.mjs           → rapport + captures dans labo/carte-zones/captures/
// 1. Joueur ordinaire (adresse qui n'est pas localhost, sans le pseudo ni l'email d'Adrien) : rien ne change.
// 2. Compte de test (localhost = même règle que le panneau de triche) : région, sondage, résultat, Légère, rechargement.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '..', '..', 'github_upload');
const SHOTS = path.join(here, 'captures');
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2' };
const serve = () => new Promise(res => { const s = createServer(async (q, r) => { try { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(DIR, p); const st = await stat(f).catch(() => null); if (!st || !st.isFile()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(await readFile(f)); } catch (e) { r.writeHead(500); r.end(String(e)); } }); s.listen(0, '127.0.0.1', () => res(s)); });
const R = []; const rec = (id, ok, note) => { R.push({ id, ok, note }); console.log((ok ? '✓' : '✗') + ' ' + id.padEnd(9) + ' ' + note); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const srv = await serve(); const port = srv.address().port; await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP play.test 127.0.0.1'] });
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-CH', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const errs = []; const watch = (p, tag) => { p.on('pageerror', e => errs.push(tag + ' ' + String(e.message || e).slice(0, 220))); p.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to fetch|net::ERR|fonts\.g|cloud|ERR_/i.test(m.text())) errs.push(tag + ' console ' + m.text().slice(0, 220)); }); };
async function newGame(p, url, planet) {
  await p.goto(url, { waitUntil: 'load', timeout: 90000 }); await sleep(2500);
  await p.evaluate((name) => { const i = document.getElementById('welcome-planet'); if (i) i.value = name; const c = document.getElementById('welcome-captain'); if (c && !c.value) c.value = 'Hadrien'; confirmWelcome(); }, planet);
  await sleep(1500);
}

// ═══ 1. Joueur ordinaire ═══
{
  const ctx = await browser.newContext(iphone); const p = await ctx.newPage(); watch(p, '[ordinaire]');
  await newGame(p, `http://play.test:${port}/?zones`, 'TERRA');
  await sleep(4000);
  const r = await p.evaluate(() => {
    saveGame(); const snap = JSON.parse(localStorage.getItem('starbyte_savegame') || '{}');
    // une Radar ordinaire suit toujours son chemin habituel
    const pool = G.probesPool.filter(x => x.tier === 'radar' && x.state === 'ready').length;
    const m = launchProbe('radar', MY_ADDRESS.cluster + '-' + MY_ADDRESS.sector + '-' + String(MY_ADDRESS.system).padStart(4, '0'), 'local', false);
    if (m) { m.arrivalAt = Date.now() - 1; tickProbes(); }
    const rep = (G.probeReports || [])[0];
    return { allowed: SBZones.allowed(), btn: !!document.getElementById('sb-zones-btn'), overlay: !!document.getElementById('sb-zones-overlay'), saved: 'zoneProspect' in snap, gz: G.zoneProspect === undefined,
      radar: { before: pool, after: G.probesPool.filter(x => x.tier === 'radar').length, report: rep && rep.tier === 'radar' && !rep.zone } };
  });
  rec('JOUEUR', !r.allowed && !r.btn && !r.overlay && !r.saved && r.gz && r.radar.report && r.radar.after === r.radar.before - 1,
    `compte ordinaire : accès ${r.allowed}, bouton ${r.btn}, carte ouverte par ?zones ${r.overlay}, clé dans la sauvegarde ${r.saved} ; une Radar normale part et revient par le chemin habituel (${r.radar.before} → ${r.radar.after} Radars, rapport classique ${r.radar.report})`);
  await ctx.close();
}

// ═══ 2. Compte de test ═══
const ctx = await browser.newContext(iphone); let p = await ctx.newPage(); watch(p, '[test]');
const base = `http://127.0.0.1:${port}/`;
await newGame(p, base, 'OPUS-ONE');
// une colonie OPUS-SCND dans le même secteur (partie locale : l'adresse est celle de cette partie, pas celle du serveur)
const home = await p.evaluate(() => {
  const a = MY_ADDRESS, sys = ((a.system + 137 - 1000) % 9000) + 1000, coord = `${a.cluster}-${a.sector}-${String(sys).padStart(4, '0')}-12`;
  sbFoundColony({ name: 'OPUS-SCND', coord }); G.probesPool.push({ id: 'p-t-r4', tier: 'radar', state: 'ready', builtAt: Date.now() });
  saveGame(); return { home: `${a.cluster}-${a.sector}-${a.system}-${a.planet}`, colony: coord, worlds: G.worlds.map(w => w.id + ':' + w.name) };
});
await sleep(2500);
const btn = await p.evaluate(() => ({ allowed: SBZones.allowed(), btn: !!document.getElementById('sb-zones-btn') }));
rec('ACCÈS', btn.allowed && btn.btn, `compte de test : accès ${btn.allowed}, bouton « Zones · test » dans le Centre de prospection ${btn.btn} · mondes ${home.worlds.join(', ')}`);
await p.evaluate(() => SBZones.open());
const frameReady = async () => { for (let i = 0; i < 80; i++) { const f = p.frames().find(f => f.url().includes('atlas/index.html')); if (f) { const ok = await f.evaluate(() => !!(window.STARBYTE_ZONES && STARBYTE_ZONES.zj.snap)).catch(() => false); if (ok) return f; } await sleep(500); } return null; };
let F = await frameReady();
await sleep(3500);
const reg = await p.evaluate(() => { const r = G.zoneProspect && G.zoneProspect.region; if (!r) return null; const c = { rien: 0, commun: 0, choix: 0 }, kinds = {}; for (const z of r.zones) { c[z.content.cat]++; if (z.content.kind) kinds[z.content.kind] = (kinds[z.content.kind] || 0) + 1; }
  return { n: r.zones.length, c, kinds, grid: r.grid, notes: r.notes, sysOk: r.zones.every(z => z.content.cat === 'rien' || /^[A-Z]-[A-Z]-\d{4}$/.test(z.content.sys)), groups: r.zones.reduce((a, z) => (a[z.grp] = (a[z.grp] || 0) + 1, a), {}) }; });
rec('RÉGION', reg && reg.n === 30 && reg.c.rien === 12 && reg.c.commun + reg.c.choix === 18 && reg.sysOk && reg.grid === 'tac-2', reg ? `30 zones ${JSON.stringify(reg.groups)} · ${JSON.stringify(reg.c)} · ${JSON.stringify(reg.kinds)} · contenus posés sur de vrais systèmes ${reg.sysOk}${reg.notes && reg.notes.length ? ' · notes : ' + reg.notes.join(' ; ') : ''}` : 'région absente');
await p.screenshot({ path: path.join(SHOTS, '1_ouverture.png') });

// un sondage : zone « commun » la plus proche de la capitale
const target = await p.evaluate(() => { const r = G.zoneProspect.region; const z = r.zones.filter(z => z.content.cat === 'commun').sort((a, b) => ['A1', 'A2', 'B', 'C'].indexOf(a.grp) - ['A1', 'A2', 'B', 'C'].indexOf(b.grp))[0]; return { id: z.id, kind: z.content.kind, sys: z.content.sys, k: z.k }; });
await F.evaluate((id) => STARBYTE_ZONES.selectZone(id), target.id); await sleep(400);
const fiche = await F.evaluate(() => ({ body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), foot: document.getElementById('zj-sh-foot').innerText.replace(/\s+/g, ' '), btns: document.querySelectorAll('#zj-sh-foot button').length }));
rec('FICHE', /Non sondée/.test(fiche.body) && /Durée/.test(fiche.body) && /Coût/.test(fiche.body) && /Sonder cette zone/.test(fiche.foot) && fiche.btns === 1, `« ${fiche.body.slice(0, 150)} » · bouton : ${fiche.foot}`);
await p.screenshot({ path: path.join(SHOTS, '2_fiche_zone.png') });
const before = await p.evaluate(() => ({ radars: G.probesPool.filter(x => x.tier === 'radar' && x.state === 'ready').length, missions: G.probeMissions.length }));
await F.evaluate(() => { const b = document.querySelector('#zj-sh-foot [data-a="launch"]'); b.click(); b.disabled = false; b.click(); });
await sleep(600);
const after = await p.evaluate((id) => ({ radars: G.probesPool.filter(x => x.tier === 'radar' && x.state === 'ready').length, zm: G.probeMissions.filter(m => m.zone === id).length, st: G.zoneProspect.zones[id] && G.zoneProspect.zones[id].st, again: SBZones.launch({ zone: id, world: 'home', dist: 10, range: 1000 }).already }), target.id);
rec('LANCER', after.zm === 1 && after.radars === before.radars - 1 && after.st === 'mission' && after.again === true, `double pression + rejeu : ${after.zm} mission, Radars prêtes ${before.radars} → ${after.radars}, zone « ${after.st} »`);
await F.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(500);
await p.screenshot({ path: path.join(SHOTS, '3_en_mission.png') });
// arrivée (horloge avancée : l'heure d'arrivée passe)
const arr = await p.evaluate((id) => { const m = G.probeMissions.find(m => m.zone === id); m.arrivalAt = Date.now() - 1; tickProbes(); const z = G.zoneProspect.zones[id], sig = z && z.found && G.signatures[z.found[0]], rep = G.probeReports[0];
  return { st: z && z.st, found: z && z.found.length, sig: sig && { sys: sig.system, outcome: sig.zoneOutcome, expires: sig.expiresAt }, rep: rep && { zone: rep.zone, ids: rep.signatureIds.length }, radars: G.probesPool.filter(x => x.tier === 'radar').length, left: G.probeMissions.filter(m => m.zone === id).length }; }, target.id);
rec('RÉSULTAT', arr.st === 'done' && arr.found === 1 && arr.sig && arr.sig.sys === target.sys && arr.sig.outcome.kind === target.kind && arr.sig.expires === null && arr.rep.zone === target.id && arr.left === 0,
  `zone sondée : 1 signature sur ${arr.sig && arr.sig.sys} (contenu prévu ${target.kind}, ${target.sys}), rapport de Radar rattaché à la zone, Radar brûlée (reste ${arr.radars})`);
await F.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(500);
const done = await F.evaluate(() => document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '));
await p.screenshot({ path: path.join(SHOTS, '4_sondee.png') });
// suite : la Légère existante, depuis la fiche
await F.evaluate(() => { const b = document.querySelector('#zj-sh-body [data-a="act"]'); if (b) b.click(); }); await sleep(500);
const light = await p.evaluate((id) => { const sigId = G.zoneProspect.zones[id].found[0]; const m = G.probeMissions.find(m => m.tier === 'light' && m.targetCoords === sigId); if (!m) return { sent: false };
  m.arrivalAt = Date.now() - 1; tickProbes(); const s = G.signatures[sigId]; const kt = s.movingCoordKey && G.knownTargets[s.movingCoordKey]; return { sent: true, resolved: s.resolved, type: s.resolvedType, target: kt && kt.type }; }, target.id);
rec('SUITE', light.sent && light.resolved && light.target === target.kind, `fiche « ${done.slice(0, 90)} » → Légère envoyée ${light.sent}, résolue en ${light.type} : ${light.target} (prévu ${target.kind})`);
// une zone sondée ne se rebalaye pas ; une zone hors région n'est pas sondable
const deny = await p.evaluate((id) => ({ again: SBZones.launch({ zone: id, world: 'home', dist: 10, range: 1000 }), out: SBZones.launch({ zone: 'tac-2:9999:9999:0', world: 'home', dist: 10, range: 1000 }) }), target.id);
rec('REFUS', !deny.again.ok && !deny.out.ok, `zone déjà sondée : « ${deny.again.why} » · hors région : « ${deny.out.why} »`);

// toucher une étoile : la zone, jamais une fiche de système
const star = await F.evaluate(() => { const Z = STARBYTE_ZONES, zj = Z.zj; Z.setMode('tac'); zj.sel = null; Z.draw(); const v = zj; // première étoile visible hors objets
  const c = document.getElementById('tac-overlay'); return { w: innerWidth, h: innerHeight }; });
const starTap = await F.evaluate(() => { const Z = STARBYTE_ZONES, zj = Z.zj; let pt = null; for (let y = 260; y < 560 && !pt; y += 7) for (let x = 40; x < 350 && !pt; x += 7) { const pk = Z.pick(x, y); if (!pk.chip && !pk.list.length) pt = [x, y]; } if (!pt) return null; Z.tap(pt[0], pt[1]); return { sel: zj.sel && zj.sel.type, view: zj.view }; });
rec('ÉTOILE', starTap && starTap.sel === 'zone' && starTap.view === 'zone', `toucher le décor étoilé → ${starTap && starTap.sel} (fiche ${starTap && starTap.view}), aucune fiche de système`);

// Atlas : même sélection, volume visible, marqueurs prioritaires
await F.evaluate((id) => { STARBYTE_ZONES.selectZone(id); STARBYTE_ZONES.setMode('atlas'); }, target.id); await sleep(2500);
const atl = await F.evaluate(() => STARBYTE_ZONES.atlasState());
rec('LIEN', atl.sel && atl.sel.zone === target.id && atl.mesh, `Tactique → Atlas : même zone ${atl.sel && atl.sel.zone}, volume tracé ${atl.mesh}, ${atl.marks.length} marqueurs`);
await p.screenshot({ path: path.join(SHOTS, '5_atlas_zone.png') });
const back = await F.evaluate(() => { STARBYTE_ZONES.setMode('tac'); const zj = STARBYTE_ZONES.zj; return { sel: zj.sel && zj.sel.zone, k: zj.k }; });
rec('RETOUR', back.sel === target.id && back.k === target.k, `Atlas → Tactique : même zone, même couche (${back.k})`);
// une station dans l'Atlas, devant les étoiles : son marqueur la sélectionne
const st = await F.evaluate(async () => { const Z = STARBYTE_ZONES, zj = Z.zj; Z.setMode('atlas'); const o = Z.objects().find(o => o.type === 'station'); Z.atlasFocus(o.p, 500);
  await new Promise(r => setTimeout(r, 2500)); const el = [...document.querySelectorAll('.zj-mark')].find(e => e.textContent.includes(o.name.slice(0, 10))); if (!el) return { found: false, name: o.name };
  const b = el.getBoundingClientRect(), i = el.querySelector('i').getBoundingClientRect(), l = el.querySelector('b').getBoundingClientRect(); return { found: true, name: o.name, x: i.x + i.width / 2, y: b.y + b.height / 2, lx: l.x + l.width / 2 }; });
let stOk = false, stNote = 'marqueur absent';
if (st.found) {
  const fr = await F.frameElement(); const box = await fr.boundingBox();
  await p.touchscreen.tap(box.x + st.x, box.y + st.y); await sleep(400);
  const a = await F.evaluate(() => STARBYTE_ZONES.zj.sel);
  await sleep(600);
  const st2 = await F.evaluate((nm) => { const el = [...document.querySelectorAll('.zj-mark')].find(e => e.textContent.includes(nm.slice(0, 10))); if (!el) return null; const b = el.getBoundingClientRect(), i = el.querySelector('i').getBoundingClientRect(), l = el.querySelector('b').getBoundingClientRect(); return { x: i.x + i.width / 2, y: b.y + b.height / 2, lx: l.x + l.width / 2, vo: STARBYTE_ZONES.zj.vo, under: (document.elementFromPoint(l.x + l.width / 2, b.y + b.height / 2) || {}).id || '' }; }, st.name);
  const moved = st2 ? Math.round(Math.hypot(st2.x - st.x, st2.y - st.y)) : -1;
  await F.evaluate(() => { STARBYTE_ZONES.zj.sel = null; }); await p.touchscreen.tap(box.x + (st2 || st).lx, box.y + (st2 || st).y); await sleep(400);
  const b = await F.evaluate(() => STARBYTE_ZONES.zj.sel);
  stOk = a && a.type === 'station' && b && b.type === 'station'; stNote = `icône → ${a && a.name}, libellé → ${b && b.name} (le marqueur s'est déplacé de ${moved} px après le premier toucher, décalage d'image ${st2 && st2.vo})`;
  await p.screenshot({ path: path.join(SHOTS, '6_atlas_station.png') });
}
rec('STATION', stOk, `Atlas, station ${st.name} devant les étoiles : ${stNote}`);
const empty = await F.evaluate(() => { STARBYTE_ZONES.atlasTap(5, 300); return STARBYTE_ZONES.zj.sel; });
rec('VIDE', empty === null, 'Atlas, toucher le vide : désélection, aucune étoile choisie');

// Mes mondes : la colonie, sans changement de compte
await F.evaluate(() => { STARBYTE_ZONES.setMode('tac'); document.getElementById('zj-worlds').click(); }); await sleep(300);
const ws = await F.evaluate(() => { const b = [...document.querySelectorAll('#zj-sh-body [data-a="world"]')]; const col = b.find(x => x.textContent.includes('OPUS-SCND')); if (col) col.click(); const zj = STARBYTE_ZONES.zj; return { n: b.length, origin: zj.origin, k: zj.k, ctx: document.getElementById('zj-ctx').textContent }; });
const wsG = await p.evaluate(() => ({ active: G.activeWorld || 'home', worlds: G.worlds.length }));
rec('MONDES', ws.n === 2 && ws.origin !== 'home' && wsG.active === 'home' && /OPUS-SCND/.test(ws.ctx), `${ws.n} mondes ; choisir OPUS-SCND recentre (« ${ws.ctx} ») et fixe le départ (${ws.origin}) ; le jeu reste sur ${wsG.active}`);
await p.screenshot({ path: path.join(SHOTS, '7_colonie.png') });

// rechargement : rien ne se recrée, rien ne se perd
await p.evaluate(() => saveGame());
const reg1 = await p.evaluate(() => JSON.stringify(G.zoneProspect.region.zones.map(z => z.id + z.content.cat)));
await p.reload({ waitUntil: 'load' }); await sleep(5000);
const re = await p.evaluate((id) => ({ region: JSON.stringify(G.zoneProspect.region.zones.map(z => z.id + z.content.cat)), st: G.zoneProspect.zones[id] && G.zoneProspect.zones[id].st, sigs: Object.values(G.signatures).filter(s => s.zone).length }), target.id);
rec('RECHARGE', re.region === reg1 && re.st === 'done' && re.sigs === 1, `après rechargement : région identique ${re.region === reg1}, zone ${re.st}, ${re.sigs} signature de zone (pas de doublon)`);
await p.evaluate(() => SBZones.open()); F = await frameReady(); await sleep(2500);
const re2 = await F.evaluate((id) => { STARBYTE_ZONES.selectZone(id); return document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ').slice(0, 80); }, target.id);
rec('RECHARGE2', /Sondée/.test(re2), `la carte rouverte montre la zone : « ${re2} »`);
await p.screenshot({ path: path.join(SHOTS, '8_apres_rechargement.png') });

rec('ERREURS', errs.length === 0, errs.slice(0, 8).join(' | ') || 'aucune erreur de page');
await browser.close(); srv.close();
process.exit(R.every(r => r.ok) ? 0 : 1);
