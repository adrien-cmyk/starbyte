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
    return { allowed: SBZones.allowed(), btn: !!document.getElementById('sb-zones-btn'), overlay: !!document.getElementById('sb-zones-overlay'), saved: 'zoneProspect' in snap || 'atlasCarte' in snap, gz: G.zoneProspect === undefined && G.atlasCarte === undefined && !SBZones.migrated(),
      radar: { before: pool, after: G.probesPool.filter(x => x.tier === 'radar').length, report: rep && rep.tier === 'radar' && !rep.zone } };
  });
  rec('JOUEUR', !r.allowed && !r.btn && !r.overlay && !r.saved && r.gz && r.radar.report && r.radar.after === r.radar.before - 1,
    `compte ordinaire (capitaine nommé « Hadrien » dans la partie) : accès ${r.allowed}, bouton ${r.btn}, carte ouverte par ?zones ${r.overlay}, clé dans la sauvegarde ${r.saved} ; une Radar normale part et revient par le chemin habituel (${r.radar.before} → ${r.radar.after} Radars, rapport classique ${r.radar.report})`);
  // 10/11 soir : la capitale du compte de test (A-O-2178) suffit, même sans pseudo ni email lisibles sur l'appareil
  const g = await p.evaluate(async () => { MY_ADDRESS.cluster = 'A'; MY_ADDRESS.sector = 'O'; MY_ADDRESS.system = 2178; goto('prospect'); await new Promise(r => setTimeout(r, 2600));
    const b = document.getElementById('sb-zones-btn'); return { why: SBZones.why(), mig: SBZones.migrated(), flag: !!(G.atlasCarte && G.atlasCarte.v === 1), wrap: !!document.getElementById('sb-atlas-wrap'), rootHidden: getComputedStyle(document.getElementById('spacemap-root')).display === 'none', nav: !!document.querySelector('#scr-prospect .smw-nav'), btn: !!b, vis: !!(b && b.offsetParent), tools: [...document.querySelectorAll('#scr-prospect .smw-tools button')].filter(x => x.offsetParent).map(x => x.id || x.className || x.dataset.a) }; });
  // 12/11 : la capitale du compte pilote (A-O-2178) bascule sa partie sur la nouvelle carte ; le bouton d'essai disparaît
  rec('CAPITALE', g.why === 'capitale' && !g.btn && g.mig && g.flag && g.wrap && g.rootHidden && g.nav, `hors localhost, capitale A-O-2178 : accès « ${g.why} », partie migrée ${g.mig} (marque ${g.flag}), carte du Centre de prospection = nouvelle carte ${g.wrap}, ancienne cachée ${g.rootHidden}, barre du bas ${g.nav}, bouton d'essai ${g.btn}`);
  await p.screenshot({ path: path.join(SHOTS, '0_centre_nouvelle_carte.png') });

  // ═══ 1b. Bascule de la partie pilote (12/11, progressive) ═══
  const crownSys = await p.evaluate(() => { const ds = STATION_UI.crown, sys = mpDockSystem({ id: ds.id }); G.hiddenPorts = G.hiddenPorts || {}; G.hiddenPorts[sys] = { dockId: ds.id, name: 'The Drifting Crown', typeLabel: 'Port franc' }; saveGame(); return sys; });
  const frame = async () => { for (let i = 0; i < 80; i++) { const f = p.frames().find(f => /atlas\/index\.html.*in=jeu/.test(f.url())); if (f) { const ok = await f.evaluate(() => !!(window.STARBYTE_ZONES && STARBYTE_ZONES.ready && STARBYTE_ZONES.ready())).catch(() => false); if (ok) return f; } await sleep(500); } return null; };
  let MF = await frame(); await sleep(1500);
  const m1 = MF && await MF.evaluate(() => { const Z = STARBYTE_ZONES; Z.refresh(true); return { mig: Z.mig(), st: Z.objects().filter(o => o.type === 'station').map(o => o.key), kicker: (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent, close: document.getElementById('zj-close').hidden, old: !![...document.querySelectorAll('#zj-sh-body button')].find(b => /Ancienne carte/.test(b.textContent)) }; });
  const snapM = await p.evaluate(() => { saveGame(); const s = JSON.parse(localStorage.getItem('starbyte_savegame') || '{}'); return s.atlasCarte || null; });
  rec('MIG-CARTE', m1 && m1.mig && m1.st.length === 1 && m1.st[0] === crownSys && /MA CARTE/.test(m1.kicker) && m1.close && m1.old && snapM && snapM.v === 1,
    `nouvelle carte dans le Centre de prospection : « ${m1 && m1.kicker} », croix du jeu seule (${m1 && m1.close}), ports affichés = ports découverts dans la partie (${m1 && m1.st.join(', ')}), « Ancienne carte » à l'accueil ${m1 && m1.old} · marque sauvegardée ${JSON.stringify(snapM)}`);
  // « Voir sur la carte » du jeu (rapports, carnet) passe par la nouvelle carte
  await p.evaluate(sys => openOnMap('system', sys), crownSys); await sleep(2500);
  const m2 = await MF.evaluate(() => ({ sel: STARBYTE_ZONES.zj.sel && STARBYTE_ZONES.zj.sel.id, foot: [...document.querySelectorAll('#zj-sh-foot button')].map(b => b.textContent.trim()) }));
  rec('MIG-VISEE', m2.sel === 'st:' + crownSys && m2.foot.includes('Entrer dans le port') && m2.foot.includes('Ancienne carte ici'), `openOnMap('system', ${crownSys}) → ${m2.sel} · actions : ${m2.foot.join(' | ')}`);
  await p.screenshot({ path: path.join(SHOTS, '0b_port_nouvelle_carte.png') });
  // l'ancienne carte, au même endroit, puis retour
  await MF.evaluate(() => { const b = [...document.querySelectorAll('#zj-sh-foot button')].find(b => /Ancienne carte ici/.test(b.textContent)); setTimeout(() => b.click(), 30); });
  await sleep(4500);
  const m3 = await p.evaluate(() => { const s = document.getElementById('scr-prospect'); return { wrap: !!document.getElementById('sb-atlas-wrap'), bar: !!s.querySelector('.sb-old-bar'), sm3: !!document.querySelector('#spacemap-root .sm3-wrap'), root: getComputedStyle(document.getElementById('spacemap-root')).display, sel: SBMap._collect && (() => { try { return SBMap._e && SBMap._e.ready; } catch (e) { return null; } })() }; });
  await p.screenshot({ path: path.join(SHOTS, '0c_ancienne_carte.png') });
  await p.evaluate(() => document.querySelector('#scr-prospect .sb-old-bar button').click()); await sleep(2500);
  const m4 = await p.evaluate(() => ({ wrap: !!document.getElementById('sb-atlas-wrap'), bar: !!document.querySelector('.sb-old-bar'), root: getComputedStyle(document.getElementById('spacemap-root')).display }));
  rec('MIG-ANCIENNE', !m3.wrap && m3.bar && m3.sm3 && m3.root !== 'none' && m4.wrap && !m4.bar && m4.root === 'none', `« Ancienne carte ici » : ancienne carte affichée ${m3.sm3}, bandeau « Nouvelle carte » ${m3.bar} · retour : nouvelle carte ${m4.wrap}, ancienne cachée ${m4.root === 'none'}`);
  // entrer dans un port découvert, depuis la nouvelle carte
  MF = await frame(); await p.evaluate(sys => openOnMap('system', sys), crownSys); await sleep(2500);
  await MF.evaluate(() => { const b = [...document.querySelectorAll('#zj-sh-foot button')].find(b => /Entrer dans le port/.test(b.textContent)); setTimeout(() => b.click(), 30); });
  await sleep(3500);
  const m5 = await p.evaluate(() => ({ crown: !!document.getElementById('crown-sp'), txt: ((document.getElementById('crown-sp') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 60) }));
  rec('MIG-PORT', m5.crown && /DRIFTING CROWN/i.test(m5.txt), `« Entrer dans le port » ouvre la station du jeu : « ${m5.txt} »`);
  await p.evaluate(() => { try { crownSpaceClose(); } catch (e) {} goto('planet'); }); await sleep(1500);
  const m6 = await p.evaluate(() => !!document.getElementById('sb-atlas-wrap'));
  // la marque survit au rechargement (la capitale de l'essai n'est plus lue : c'est la sauvegarde qui fait foi)
  await p.reload(); await sleep(6000);
  const m7 = await p.evaluate(() => ({ mig: SBZones.migrated(), flag: G.atlasCarte && G.atlasCarte.v, why: SBZones.why() }));
  rec('MIG-SUITE', !m6 && m7.mig && m7.flag === 1, `planète : carte déchargée (${!m6}) · après rechargement : partie toujours migrée ${m7.mig} (marque v${m7.flag}, accès d'essai « ${m7.why} »)`);
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
  // 11/11 : le premier toucher approche la station (gros plan) ; son nom, rangé sous le modèle, désigne toujours la même cible
  await F.evaluate(() => { STARBYTE_ZONES.zj.view = 'home'; }); await p.touchscreen.tap(box.x + (st2 || st).lx, box.y + (st2 || st).y); await sleep(400);
  const b = await F.evaluate(() => STARBYTE_ZONES.zj.sel);
  const v2 = await F.evaluate(() => STARBYTE_ZONES.zj.view);
  stOk = a && a.type === 'station' && b && b.type === 'station' && b.id === a.id && v2 === 'obj'; stNote = `icône → ${a && a.name} (approche : le marqueur devient le nom sous le modèle, ${moved} px plus loin), nom → ${b && b.name}, fiche ${v2}`;
  await p.screenshot({ path: path.join(SHOTS, '6_atlas_station.png') });
}
rec('STATION', stOk, `Atlas, station ${st.name} devant les étoiles : ${stNote}`);
// 11/11 : en gros plan, le vide ne désélectionne plus (cahier « Observer ») ; au voisinage, si
const closeTap = await F.evaluate(async () => { const S = STARBYTE_ZONES; S.atlasTap(5, 300); const keep = S.zj.sel && S.zj.sel.type; S.backN(); await new Promise(r => setTimeout(r, 2500)); return { keep, lvl: S.pres().level }; });
const empty = await F.evaluate(() => { STARBYTE_ZONES.atlasTap(5, 300); return STARBYTE_ZONES.zj.sel; });
rec('VIDE', empty === null && closeTap.keep === 'station' && closeTap.lvl === 'neighbourhood', `Atlas, toucher le vide : en gros plan la cible reste (${closeTap.keep}) ; après « Retour au voisinage » (${closeTap.lvl}), désélection, aucune étoile choisie`);

// Mes mondes : la colonie, sans changement de compte
await F.evaluate(() => { STARBYTE_ZONES.setMode('tac'); document.getElementById('zj-worlds').click(); }); await sleep(300);
const ws = await F.evaluate(() => { const b = [...document.querySelectorAll('#zj-sh-body [data-a="world"]')]; const col = b.find(x => x.textContent.includes('OPUS-SCND')); if (col) col.click(); const zj = STARBYTE_ZONES.zj, o0 = zj.origin, sel = zj.sel && zj.sel.name;
  const ob = document.querySelector('#zj-sh-foot [data-a="origin"]'); if (ob) ob.click();   // 11/11 : observer un monde ne change pas le départ ; son bouton, si
  return { n: b.length, o0, sel, origin: zj.origin, k: zj.k, ctx: document.getElementById('zj-ctx').textContent }; });
const wsG = await p.evaluate(() => ({ active: G.activeWorld || 'home', worlds: G.worlds.length }));
rec('MONDES', ws.n === 2 && ws.o0 === 'home' && ws.sel === 'OPUS-SCND' && ws.origin !== 'home' && wsG.active === 'home' && /OPUS-SCND/.test(ws.ctx), `${ws.n} mondes ; choisir OPUS-SCND la sélectionne et recentre (« ${ws.ctx} ») sans changer le départ (${ws.o0}) ; « Lancer les sondages depuis OPUS-SCND » le fixe (${ws.origin}) ; le jeu reste sur ${wsG.active}`);
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

// ═══ 3. Lecture d'une autre partie (v53 simulée : même forme que dev_player_map) ═══
const mineState = () => p.evaluate(() => JSON.stringify({ region: G.zoneProspect.region, zones: G.zoneProspect.zones, pm: G.probeMissions.map(m => m.id), sig: Object.keys(G.signatures).sort(), radars: G.probesPool.length }));
const before3 = await mineState();
const nf = await p.evaluate(async () => { window.SB_ZONES_FAKE = async () => { throw new Error('Could not find the function public.dev_player_map(p_pseudo) in the schema cache'); }; const r = await SBZones.peek('Panzerstorm'); return r.why; });
rec('V53-ABS', /schema_mp_v53/.test(nf), `serveur sans v53 : « ${nf} »`);
await p.evaluate(() => {
  const A = (c, s, n, pl) => `${c}-${s}-${String(n).padStart(4, '0')}` + (pl ? '-' + String(pl).padStart(2, '0') : '');
  window.SB_ZONES_FAKE = async (fn, args) => {
    if (fn !== 'dev_player_map') throw new Error('rpc inconnu');
    if (String(args.p_pseudo).toLowerCase() !== 'panzerstorm') return { ok: false, why: 'unknown_pseudo', candidates: ['Panzerstorm'] };
    const sig = (id, sys, extra) => Object.assign({ id, system: sys, type: 'heat_point', typeLabel: 'Point chaud', intensity: 'faible', resolved: false }, extra || {});
    return { ok: true, pseudo: 'Panzerstorm', planet_name: 'NÉRÉIDE', address: A('A', 'K', 6184, 12), level: 9, saved_at: new Date(Date.now() - 3600e3).toISOString(),
      colonies: [{ address: A('A', 'K', 6301, 5), name: 'Brèche' }, { address: A('A', 'L', 420, 7), name: 'Ostra' }, { address: A('A', 'J', 3001, 3), name: 'Halde' }, { address: A('A', 'M', 1500, 9), name: 'Kern' }],
      save_worlds: [{ id: 'home', kind: 'home' }, { id: 'col-9', kind: 'colony', name: 'Vigie', coord: A('A', 'L', 777, 2) }],
      signatures: [sig('SIG-PZ1', A('A', 'K', 6190)), sig('SIG-PZ2', A('A', 'K', 6100), { resolved: true, resolvedType: 'moving', movingCoordKey: 'A-K-6100#1' }), sig('SIG-PZ3', A('A', 'L', 430), { resolved: true, resolvedType: 'fixed', fixedClass: 'habitable', fixedAddress: A('A', 'L', 430, 4) }), sig('SIG-PZ4', A('A', 'K', 6000), { ignored: true })],
      known_targets: [{ key: 'A-K-6100#1', label: 'Champ d’astéroïdes', status: 'available' }],
      known_systems: [A('A', 'K', 6184), A('A', 'K', 6185), A('A', 'K', 6190), A('A', 'K', 6200), A('A', 'L', 420), A('A', 'L', 430), A('A', 'J', 3001)],
      reports: [{ tier: 'radar', system: A('A', 'K', 6250), at: Date.now() - 864e5 }], missions: [{ tier: 'light', status: 'in_transit' }], arks: [{ coord: A('A', 'N', 10, 1), name: 'Arche' }] };
  };
});
await p.evaluate(() => { SBZones.close(); SBZones.open({ peek: 'Panzerstorm' }); }); F = await frameReady();
let pk = null; for (let i = 0; i < 40 && !(pk && pk.on); i++) { await sleep(500); pk = await F.evaluate(() => { const zj = STARBYTE_ZONES.zj; return { on: !!zj.peek }; }); }
await sleep(1500);
pk = await F.evaluate(() => { const zj = STARBYTE_ZONES.zj, P = zj.peek, R = zj.snap.zp.region; return { trN: zj.tr.length, on: !!P, ws: zj.ws.map(w => w.kind[0] + ':' + w.name), sigs: zj.snap.sigs.length, explored: P && P.explored.size, known: P && P.knownN, region: R && R.zones.length,
  cats: R && R.zones.reduce((a, z) => (a[z.content.cat] = (a[z.content.cat] || 0) + 1, a), {}), amas: P && P.amas.size, head: document.querySelector('.zj-test').textContent, pill: document.getElementById('zj-worlds').textContent,
  body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), foot: document.getElementById('zj-sh-foot').innerText.replace(/\s+/g, ' ') }; });
rec('LECTURE', pk.on && pk.ws.length === 6 && pk.ws[0] === 'h:NÉRÉIDE' && pk.sigs === 3 && pk.explored > 0 && pk.region === 30 && /L’empire de Panzerstorm/.test(pk.body) && /Revenir à ma partie/.test(pk.foot) && /PANZERSTORM/.test(pk.head) && pk.pill === 'Ses mondes',
  `${pk.ws.join(', ')} · ${pk.sigs} signatures (l'ignorée écartée) · ${pk.known} systèmes connus sur ${pk.explored} zones · région simulée ${pk.region} ${JSON.stringify(pk.cats)} · amas touchés par la portée ${pk.amas} · « ${pk.body.slice(0, 900)} »`);
rec('FOLLOW-07', pk.trN === 0 && /Instantané/.test(pk.body), `partie lue : ${pk.trN} mission suivie ; « ${(pk.body.match(/Instantané[^.]*\./) || [''])[0]} »`);
await p.screenshot({ path: path.join(SHOTS, '9_panzerstorm_tactique.png') });
// une zone de sa région : contenu prévu montré, aucun bouton d'envoi
const pz = await F.evaluate(() => { const Z = STARBYTE_ZONES, R = Z.zj.snap.zp.region, z = R.zones.find(z => z.content.cat === 'choix') || R.zones[1]; Z.selectZone(z.id); return { body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), launch: !!document.querySelector('#zj-sh-foot [data-a="launch"]'), kind: z.content.kind }; });
const sigView = await F.evaluate(() => { const o = STARBYTE_ZONES.objects().find(o => o.type === 'sig'); STARBYTE_ZONES.selectObj(o);
  return { body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), foot: document.getElementById('zj-sh-foot').innerText.replace(/\s+/g, ' '), act: !!document.querySelector('#zj-sh-foot [data-a="act"]') }; });
rec('LECT-SEULE', !pz.launch && /Contenu prévu/.test(pz.body) && !sigView.act, `zone de sa région : « ${pz.body.slice(0, 170)} » (bouton Sonder ${pz.launch}) · signature : « ${sigView.foot.slice(0, 80)} » (bouton d'action ${sigView.act})`);
await F.evaluate(() => { STARBYTE_ZONES.setMode('atlas'); const w = STARBYTE_ZONES.zj.ws[0]; STARBYTE_ZONES.atlasFocus(w.p, 5200); }); await sleep(3500);
const pa = await F.evaluate(() => STARBYTE_ZONES.atlasState().marks.map(m => m.t));
rec('LECT-ATLAS', pa.some(t => /Sa capitale · NÉRÉIDE/.test(t)) || pa.some(t => /lieux/.test(t)), `Atlas sur son empire : ${pa.slice(0, 8).join(' | ')}`);
await p.screenshot({ path: path.join(SHOTS, '10_panzerstorm_atlas.png') });
// retour à ma partie, et rien n'a bougé dans la mienne
await F.evaluate(() => { STARBYTE_ZONES.setMode('tac'); STARBYTE_ZONES.peekStop(); }); await sleep(600);
const mine = await F.evaluate(() => ({ on: !!STARBYTE_ZONES.zj.peek, ws: STARBYTE_ZONES.zj.ws.map(w => w.name), head: document.querySelector('.zj-test').textContent }));
const after3 = await mineState();
const same = after3 === before3, diff = same ? '' : Object.keys(JSON.parse(before3)).filter(k => JSON.stringify(JSON.parse(before3)[k]) !== JSON.stringify(JSON.parse(after3)[k])).join(', ');
rec('LECT-RETOUR', !mine.on && mine.ws.includes('OPUS-ONE') && /HADRIEN/.test(mine.head) && same, `retour : ${mine.ws.join(', ')} · « ${mine.head} » · ma partie inchangée (région, zones, sondes, signatures) ${same}${diff ? ' · diffère : ' + diff : ''}`);
// par l'interface : Mes mondes › Voir la partie d'un commandant
await F.evaluate(() => document.getElementById('zj-worlds').click()); await sleep(300);
const ui = await F.evaluate(async () => { const i = document.getElementById('zj-peek-in'); if (!i) return { input: false }; i.value = 'panzerstorm'; document.querySelector('#zj-sh-body [data-a="peek"]').click(); for (let k = 0; k < 30 && !STARBYTE_ZONES.zj.peek; k++) await new Promise(r => setTimeout(r, 200)); return { input: true, on: !!STARBYTE_ZONES.zj.peek, ws: STARBYTE_ZONES.zj.ws.length }; });
await F.evaluate(() => STARBYTE_ZONES.peekStop());
rec('LECT-UI', ui.input && ui.on && ui.ws === 6, `champ « Voir la partie d’un commandant » présent ${ui.input}, lecture ouverte ${ui.on} (${ui.ws} mondes)`);

// ═══ 4. « Télécharger cette carte » : un fichier HTML autonome, qui s'ouvre sans le jeu ni le serveur ═══
await F.evaluate(async () => { await STARBYTE_ZONES.peekStart('Panzerstorm'); }); await sleep(1500);
await F.evaluate(() => document.getElementById('zj-sh-back').click()); await sleep(300);
const dlP = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
const exBtn = await F.evaluate(() => { const b = document.querySelector('#zj-sh-foot [data-a="export"]'); if (!b) return false; b.click(); return true; });
const dl = await dlP; const EXP = path.join(SHOTS, 'export_panzerstorm.html'); let expName = null;
if (dl) { expName = dl.suggestedFilename(); await dl.saveAs(EXP); }
const { size: expSize } = dl ? await stat(EXP) : { size: 0 };
rec('EXPORT', exBtn && !!dl && /^starbyte-carte-panzerstorm-\d{4}-\d\d-\d\d\.html$/.test(expName || '') && expSize > 500e3, `bouton ${exBtn} → fichier ${expName} (${Math.round(expSize / 1024)} Ko)`);
if (dl) {
  const ctxF = await browser.newContext(iphone); const pf = await ctxF.newPage(); const ferr = []; pf.on('pageerror', e => ferr.push(String(e.message || e).slice(0, 200)));
  await pf.goto('file://' + EXP, { waitUntil: 'load', timeout: 60000 }); await sleep(4000);
  const fx = await pf.evaluate(() => { const Z = window.STARBYTE_ZONES, zj = Z && Z.zj; return zj ? { peek: !!zj.peek, ws: zj.ws.length, region: zj.snap && zj.snap.zp.region && zj.snap.zp.region.zones.length, close: getComputedStyle(document.getElementById('zj-close')).display,
    body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ').slice(0, 260), foot: document.getElementById('zj-sh-foot').innerText.trim(), title: document.title, block: !document.getElementById('zj-block').hidden } : null; });
  const sameRegion = fx && await F.evaluate(() => JSON.stringify(STARBYTE_ZONES.zj.snap.zp.region.zones.map(z => z.id + z.content.cat))) === await pf.evaluate(() => JSON.stringify(STARBYTE_ZONES.zj.snap.zp.region.zones.map(z => z.id + z.content.cat)));
  await pf.evaluate(() => { STARBYTE_ZONES.setMode('atlas'); }); await sleep(2500);
  const fa = await pf.evaluate(() => STARBYTE_ZONES.atlasState().marks.length);
  await pf.screenshot({ path: path.join(SHOTS, '11_fichier_exporte_atlas.png') });
  await pf.evaluate(() => { STARBYTE_ZONES.setMode('tac'); }); await sleep(800);
  await pf.screenshot({ path: path.join(SHOTS, '12_fichier_exporte_tactique.png') });
  rec('FICHIER', fx && fx.peek && fx.ws === 6 && fx.region === 30 && sameRegion && fx.close === 'none' && !fx.block && /Fichier exporté le/.test(fx.body) && fx.foot === '' && fa > 0 && ferr.length === 0,
    fx ? `ouvert seul (file://, sans jeu ni serveur) : « ${fx.title} », ${fx.ws} mondes, région ${fx.region} identique à celle du jeu ${sameRegion}, ${fa} marqueurs dans l'Atlas, croix ${fx.close}, aucun bouton d'action « ${fx.foot} » · « ${fx.body.slice(0, 200)} »${ferr.length ? ' · erreurs : ' + ferr.join(' | ') : ''}` : 'page vide');
  await ctxF.close();
}
await F.evaluate(() => STARBYTE_ZONES.peekStop());

// ═══ 5. Suivre un vrai tanker (cahier « Observer » v1.1, § 18 et 23) ═══
// Le tanker part par l'action du jeu (launchTankerToKnownTarget) vers la cible mouvante identifiée plus haut par la Légère.
await p.evaluate(() => SBZones.close()); await p.evaluate(() => SBZones.open()); F = await frameReady(); await sleep(2500);
const tk = await p.evaluate(() => { G.fleet.stationed = G.fleet.stationed || {}; G.fleet.stationed.tanker = G.fleet.stationed.tanker || {}; G.fleet.stationed.tanker.t1 = Math.max(1, G.fleet.stationed.tanker.t1 || 0);   // un tanker au hangar (mise en place d'essai)
  const key = Object.keys(G.knownTargets || {}).find(k => G.knownTargets[k].status !== 'engaged'); const before = (G.tankerMissions || []).length; launchTankerToKnownTarget(key);
  const m = (G.tankerMissions || [])[before]; return m ? { id: m.id, name: m.tankerName, to: m.targetCoords, dep: m.departedAt, arr: m.arrivalAt, world: m.world, json: JSON.stringify(m) } : { key }; });
await F.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(400);
const trv = await F.evaluate(id => { const t = STARBYTE_ZONES.travels().find(x => x.id === 'tk:' + id); const w = STARBYTE_ZONES.zj.ws.find(x => x.id === 'home'); return { t, home: w && w.coord }; }, tk.id);
// cohérence géométrie / horaires : la position estimée avance proportionnellement au temps sur le tracé
const geo = await F.evaluate(async id => { const S = STARBYTE_ZONES, a = S.trState('tk:' + id), t1 = Date.now(); await new Promise(r => setTimeout(r, 1500)); const b = S.trState('tk:' + id), t2 = Date.now(), tr = S.travels().find(x => x.id === 'tk:' + id), ph = tr.phases[0];
  const moved = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]), expect = tr.L * (t2 - t1) / (ph.t1 - ph.t0); return { moved, expect, L: tr.L, f: b.f, dur: ph.t1 - ph.t0 }; }, tk.id);
rec('FOLLOW-01', !!trv.t && trv.t.ok && trv.t.from === trv.home && trv.t.to && trv.t.name === tk.name && trv.t.phases[0].t1 === tk.arr && Math.abs(geo.moved - geo.expect) < Math.max(.05, geo.expect * .25),
  `${tk.name} : départ ${trv.t && trv.t.from} (capitale), vers ${trv.t && trv.t.to}, arrivée ${new Date(tk.arr).toLocaleTimeString('fr-CH')} (horaire du jeu) · tracé ${geo.L.toFixed(0)} u en ${Math.round(geo.dur / 60000)} min : ${geo.moved.toFixed(2)} u parcourus en 1,5 s pour ${geo.expect.toFixed(2)} u attendus`);
// la fiche puis « Suivre dans l'Atlas »
await F.evaluate(id => { STARBYTE_ZONES.setMode('tac'); document.getElementById('zj-worlds').click(); }); await sleep(300);
const row = await F.evaluate(id => { const b = document.querySelector('#zj-sh-body [data-a="travel"][data-id="tk:' + id + '"]'); if (!b) return null; const t = b.innerText; b.click(); return t; }, tk.id); await sleep(400);
const sheet = await F.evaluate(() => ({ body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), foot: document.getElementById('zj-sh-foot').innerText.replace(/\s+/g, ' ') }));
await p.screenshot({ path: path.join(SHOTS, '13_tanker_tactique.png') });
await F.evaluate(() => document.querySelector('#zj-sh-foot [data-a="follow"]').click()); await sleep(3200);
const vehD = () => { const S = STARBYTE_ZONES, v = S.vehPos(), c = S.cam(); return v ? Math.hypot(c.target[0] - v[0], c.target[1] - v[1], c.target[2] - v[2]) : 1e9; };
const fol = await F.evaluate(`(${(id => { const S = STARBYTE_ZONES, st = S.trState('tk:' + id), c = S.cam(); return { mode: S.zj.mode, lvl: S.pres().level, F: S.followState(), dNow: Math.hypot(c.target[0] - st.p[0], c.target[1] - st.p[1], c.target[2] - st.p[2]), marks: S.atlasState().marks.map(m => m.t), obs: S.trObs(), prism: S.prism() }; }).toString()})(${JSON.stringify(tk.id)})`);
fol.d = await F.evaluate(`(${vehD.toString()})()`);
for (let i = 0; i < 60; i++) { const m = await F.evaluate(() => STARBYTE_ZONES.modelState()); if (m.tr && m.tr.st !== 'loading') break; await sleep(1000); }   // le modèle se charge pendant le suivi
await sleep(2000);
const fol2 = await F.evaluate(`(${(id => { const S = STARBYTE_ZONES, st = S.trState('tk:' + id), c = S.cam(); return { dNow: Math.hypot(c.target[0] - st.p[0], c.target[1] - st.p[1], c.target[2] - st.p[2]), f: st.f }; }).toString()})(${JSON.stringify(tk.id)})`);
fol2.d = await F.evaluate(`(${vehD.toString()})()`);
rec('FOLLOW-1b', fol.mode === 'atlas' && fol.lvl === 'travel' && fol.F.on && !fol.F.susp && fol.d < .6 && fol2.d < .6 && fol.obs && !fol.prism && fol.marks.length <= 3 && fol.marks.some(t => t.includes(tk.name)),
  `fiche « ${sheet.body.slice(0, 150)} » · Suivre : Atlas, présentation ${fol.lvl}, caméra à ${fol.d.toFixed(2)} puis ${fol2.d.toFixed(2)} u du tanker dessiné (${fol.dNow.toFixed(2)} et ${fol2.dNow.toFixed(2)} u de sa position à l’instant de la mesure, entre deux images) ; il avance : ${(fol2.f * 100).toFixed(1)} %, marqueurs « ${fol.marks.join(' | ')} »`);
await p.screenshot({ path: path.join(SHOTS, '14_tanker_suivi.png') });
// § 24.1 : le tanker suivi prend le modèle de son type réel, lu dans le catalogue du jeu (Formation3D : TK-07)
let mt = null; for (let i = 0; i < 60 && !(mt && mt.tr && mt.tr.st !== 'loading'); i++) { await sleep(1000); mt = await F.evaluate(() => STARBYTE_ZONES.modelState()); }
const mtSheet = await F.evaluate(() => document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '));
await p.screenshot({ path: path.join(SHOTS, '14b_tanker_modele.png') });
rec('MODEL-01a', mt.cat && mt.tr && mt.tr.st === 'ok' && mt.tr.n === 1 && /sb_tk07_lod\.glb/.test(mt.tr.urls[0]) && /Modèle du jeu : Tanker · TK-07/.test(mtSheet) && mt.tr.vehVis,
  `catalogue du jeu lu (${mt.stations.length} stations, vaisseaux ${mt.ships.join('/')}) · tanker suivi : ${mt.tr.st}, ${mt.tr.urls.map(u => u.replace(/^.*\//, '')).join(', ')} · « ${(mtSheet.match(/Modèle du jeu[^.]*\./) || [''])[0]} »`);
// orbiter et pincer : le suivi reste
const fr = await F.frameElement(), fb = await fr.boundingBox();
const d0 = (await F.evaluate(() => STARBYTE_ZONES.pres())).wantedDistance, y0 = (await F.evaluate(() => STARBYTE_ZONES.cam())).yaw;
await p.mouse.move(fb.x + 120, fb.y + 220); await p.mouse.down(); await p.mouse.move(fb.x + 200, fb.y + 230, { steps: 6 }); await p.mouse.up(); await sleep(300);
const cdp = await p.context().newCDPSession(p), tp = (a, b) => [{ x: fb.x + a, y: fb.y + 170, id: 1 }, { x: fb.x + b, y: fb.y + 170, id: 2 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(130, 250) }); for (const b of [235, 215, 195]) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(130, b) }); await sleep(40); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(1200);
const orb = await F.evaluate(() => ({ F: STARBYTE_ZONES.followState(), d: STARBYTE_ZONES.pres().wantedDistance, yaw: STARBYTE_ZONES.cam().yaw }));
rec('FOLLOW-02', orb.F.on && !orb.F.susp && Math.abs(orb.yaw - y0) > .05 && orb.d > d0 * 1.1, `orbite : angle ${y0.toFixed(2)} → ${orb.yaw.toFixed(2)} ; pincement : distance ${d0.toFixed(1)} → ${orb.d.toFixed(1)} u ; suivi toujours actif`);
// déplacement libre puis reprise ; l'ordre de mission n'a pas bougé
await F.evaluate(() => { for (let i = 0; i < 20; i++) STARBYTE_ZONES.panBy(-30, 0); }); await sleep(500);
const sus = await F.evaluate(id => { const S = STARBYTE_ZONES, st = S.trState('tk:' + id), c = S.cam(); return { F: S.followState(), d: Math.hypot(c.target[0] - st.p[0], c.target[1] - st.p[1], c.target[2] - st.p[2]), foot: document.getElementById('zj-sh-foot').innerText }; }, tk.id);
await F.evaluate(() => document.querySelector('#zj-sh-foot [data-a="follow-resume"]').click()); await sleep(2600);
const res = await F.evaluate(() => { const S = STARBYTE_ZONES, v = S.vehPos(), c = S.cam(); return { F: S.followState(), d: Math.hypot(c.target[0] - v[0], c.target[1] - v[1], c.target[2] - v[2]) }; });
const sameTk = await p.evaluate(j => { const m = G.tankerMissions.find(x => x.id === JSON.parse(j).id); return JSON.stringify(m) === j; }, tk.json);
rec('FOLLOW-03', sus.F.susp && sus.d > 5 && /Reprendre le suivi/.test(sus.foot) && !res.F.susp && res.F.on && res.d < .6 && sameTk,
  `déplacement libre : suivi suspendu (caméra à ${sus.d.toFixed(0)} u du tanker, bouton « Reprendre le suivi ») · reprise : caméra à ${res.d.toFixed(2)} u du tanker dessiné · mission du jeu identique avant et après : ${sameTk}`);
// voir le trajet, observer la destination : présentation seulement
await F.evaluate(() => document.querySelector('#zj-sh-foot [data-a="travel-fit"]').click()); await sleep(1800);
const fit = await F.evaluate(id => { const S = STARBYTE_ZONES, tr = S.travels().find(x => x.id === 'tk:' + id); return { F: S.followState(), d: S.pres().distance, L: tr.L }; }, tk.id);
await p.screenshot({ path: path.join(SHOTS, '15_tanker_trajet.png') });
// étape 3 (§ 22) : comparer les itinéraires de ce vrai tanker sur le réseau candidat ; rien ne change dans la mission
const cmpBtn = await F.evaluate(() => { const b = document.querySelector('#zj-sh-foot [data-a="cor-tr"]'); if (b) b.click(); return !!b; }); await sleep(1500);
const cT = await F.evaluate(() => ({ s: STARBYTE_ZONES.corState(), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), par: STARBYTE_ZONES.corParams() }));
const sameTk2 = await p.evaluate(j => { const m = G.tankerMissions.find(x => x.id === JSON.parse(j).id); return JSON.stringify(m) === j; }, tk.json);
const dT = cT.s.plans && cT.s.plans[0], fT = cT.s.plans && cT.s.plans.find(x => x.k === 'cor');
await p.screenshot({ path: path.join(SHOTS, '15b_tanker_itineraires.png') });
rec('COR-02', cmpBtn && dT && dT.k === 'libre' && (fT ? (fT.test < dT.test * .95) === fT.best && (dT.best === !fT.best) : dT.best) && Math.abs(dT.test - Math.max(dT.min, cT.par.Lmin / cT.par.v) / cT.par.season) < 1e-9 && dT.fuel === Math.round(cT.s.ctx.fuel * Math.max(dT.fu, cT.par.Lmin) / cT.par.Lref) && /minimum par mission/.test(cT.body) && sameTk2 && /Mission réelle : vol direct/.test(cT.body),
  `tanker ${tk.name} (trajet court) : ${cT.s.plans.map(x => x.name + ' ' + x.len.toFixed(0) + ' u, ' + x.test.toFixed(1) + ' min d’essai, ' + x.fuel + ' carburant' + (x.best ? ' [retenu]' : '')).join(' · ')} (sans minimum : ${(dT.min / cT.par.season).toFixed(1)} min, ${Math.round(cT.s.ctx.fuel * dT.fu / cT.par.Lref)} carburant ; minimum par mission ${(cT.par.Lmin / cT.par.v / cT.par.season).toFixed(1)} min) · aucun avantage imposé au corridor ; mission du jeu inchangée ${sameTk2}`);
await F.evaluate(() => document.querySelector('#zj-sh-foot [data-a="cor-back"]').click()); await sleep(600);
rec('FOLLOW-T', fit.F.susp && fit.d > fit.L * .4, `Voir le trajet : vue de ${fit.d.toFixed(0)} u pour un tracé de ${fit.L.toFixed(0)} u, suivi suspendu (la mission continue)`);
// arrière-plan : au retour, la position se recale sur les horaires de la partie
const bg = await F.evaluate(id => STARBYTE_ZONES.trState('tk:' + id).f, tk.id);
await p.evaluate(id => { const m = G.tankerMissions.find(x => x.id === id), shift = (m.arrivalAt - m.departedAt) * .4; m.departedAt -= shift; m.arrivalAt -= shift; }, tk.id);   // 40 % du trajet « écoulé » pendant l'absence
await F.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await sleep(200);
const bg2 = await F.evaluate(id => STARBYTE_ZONES.trState('tk:' + id).f, tk.id);
rec('FOLLOW-04', bg2 - bg > .35, `retour au premier plan : progression ${(bg * 100).toFixed(1)} % → ${(bg2 * 100).toFixed(1)} %, recalculée sur les horaires enregistrés (aucun chronomètre local)`);
// Tactique à travers les couches : bonne couche, origine inchangée
await F.evaluate(() => { STARBYTE_ZONES.followResume(); STARBYTE_ZONES.setMode('tac'); }); await sleep(1200);
const tac = await F.evaluate(id => { const S = STARBYTE_ZONES, st = S.trState('tk:' + id); return { k: S.zj.k, lay: Math.floor(st.p[1] / 200), origin: S.zj.origin, F: S.followState() }; }, tk.id);
await p.screenshot({ path: path.join(SHOTS, '16_tanker_suivi_tactique.png') });
rec('FOLLOW-06', tac.F.on && Math.abs(tac.k - tac.lay) <= 1 && tac.origin === 'home', `Tactique en suivi : couche ${tac.k} (le tanker est dans la tranche ${tac.lay}, marge de 15 %), départ des sondages ${tac.origin} inchangé`);
// arrivée puis fin : l'état vient du jeu
await p.evaluate(id => { const m = G.tankerMissions.find(x => x.id === id); m.arrivalAt = Date.now() - 1; tickTankerMissions(); }, tk.id);
await F.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(600);
const arrTk = await F.evaluate(id => { const S = STARBYTE_ZONES, t = S.travels().find(x => x.id === 'tk:' + id), st = t && S.trState('tk:' + id); return { t: t && { status: t.status, n: t.phases.length }, st: st && { phase: st.phase, along: st.along }, body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') }; }, tk.id);
const gst = await p.evaluate(id => { const m = G.tankerMissions.find(x => x.id === id); return m ? m.status : 'retirée'; }, tk.id);
await p.evaluate(id => { const m = G.tankerMissions.find(x => x.id === id); if (m && m.status === 'returning') { m.returnArrivalAt = Date.now() - 1; tickTankerMissions(); } }, tk.id);
await F.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(800);
const end = await F.evaluate(() => ({ F: STARBYTE_ZONES.followState(), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') }));
rec('FOLLOW-05', (arrTk.t ? arrTk.t.status === gst : gst === 'retirée') && (!arrTk.t || arrTk.t.status !== 'returning' || arrTk.st.phase === 'back' && arrTk.st.along > .95) && end.F && end.F.ended && !end.F.on && /Mission terminée/.test(end.body),
  `arrivée : le jeu passe la mission en « ${gst} »${arrTk.t ? ', la carte suit (phase ' + arrTk.st.phase + ', au point d’arrivée)' : ''} · fin : « ${end.body.slice(0, 110)} », suivi arrêté`);

// ═══ 6. Modèles du jeu et corridors (cahier v1.2 §§ 19-20 et 24, étape 3 du § 22) ═══
await F.evaluate(() => { STARBYTE_ZONES.corToggle(false); STARBYTE_ZONES.setMode('atlas'); }); await sleep(800);
// une station du réseau : son propre modèle (STATION_UI du jeu, système donné par mpDockSystem)
const stKey = await F.evaluate(() => { const S = STARBYTE_ZONES, keys = S.objects().filter(o => o.type === 'station').map(o => o.key), pref = ['A-L-8388', 'A-N-1556', 'A-N-8096', 'A-K-4227', 'A-O-8715', 'A-M-3340']; return pref.find(k => keys.includes(k)) || keys[0]; });
await F.evaluate(k => { const S = STARBYTE_ZONES, o = S.objects().find(o => o.type === 'station' && o.key === k); S.observe(o.id); }, stKey);
let ms = null; for (let i = 0; i < 90 && !(ms && ms.obs && ms.obs.st !== 'loading'); i++) { await sleep(1000); ms = await F.evaluate(() => STARBYTE_ZONES.modelState()); }
await sleep(1500);
const msSheet = await F.evaluate(() => ({ body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), code: (STARBYTE_ZONES.modelState().stations || []) }));
const want = (ms.stations.find(x => x.startsWith(stKey + '=')) || '').split('=')[1];
await p.screenshot({ path: path.join(SHOTS, '17_station_modele.png') });
rec('MODEL-01b', ms.obs && ms.obs.st === 'ok' && ms.obs.isModel && ms.obs.meshes > 0 && want && new RegExp('sb_' + want + '\\.glb').test(ms.obs.url) && /Modèle du jeu/.test(msSheet.body),
  `station ${stKey} observée : modèle ${ms.obs && ms.obs.url && ms.obs.url.replace(/^.*\//, '')} (catalogue : ${want}), ${ms.obs && ms.obs.meshes} maillages · « ${(msSheet.body.match(/Modèle du jeu[^.]*\./) || [''])[0]} »`);
// comparaison depuis la capitale vers chaque station du réseau : accès, corridor, sortie ; longueurs sur les courbes
const cor = await F.evaluate(async () => { const S = STARBYTE_ZONES, out = [], keys = ['A-O-8715', 'A-N-8096', 'A-N-1556', 'A-K-4227', 'A-M-3340', 'A-L-8388'];
  for (const k of keys) { const o = S.objects().find(o => o.type === 'station' && o.key === k); if (!o || !S.corCompare('obj', o.id)) continue; const st = S.corState(); out.push({ k, plans: st.plans, D: o.p }); }
  return { out, net: S.corState().net, par: S.corParams() }; });
let c3 = true, c4 = true, c5 = true, c3n = 0, wins = 0, ex = null;
for (const r of cor.out) { const d = r.plans[0]; for (const x of r.plans) {
  const sumL = x.legs.reduce((a, l) => a + l.len, 0), sumM = x.legs.reduce((a, l) => a + l.min, 0); if (Math.abs(sumL - x.len) > .01 || Math.abs(sumM - x.min) > 1e-6 || Math.abs(x.test - Math.max(x.min, cor.par.Lmin / cor.par.v) / cor.par.season) > 1e-6) c3 = false;   // un seul devis : toutes les phases comptées
  for (let i = 1; i < x.legs.length; i++) { const a = x.legs[i - 1], b = x.legs[i]; if (a.b !== b.a || Math.hypot(a.p1[0] - b.p0[0], a.p1[1] - b.p0[1], a.p1[2] - b.p0[2]) > .01) c5 = false; }   // les phases s'enchaînent sur des nœuds officiels
  if (x.k === 'cor') { c3n++; const L0 = x.legs[0], Ln = x.legs[x.legs.length - 1]; if (L0.t !== 'free' && L0.a !== '@O') c3 = false; if (Ln.t !== 'free' && Math.hypot(Ln.p1[0] - r.D[0], Ln.p1[1] - r.D[1], Ln.p1[2] - r.D[2]) > .01) c3 = false; if (x.min < d.min) wins++; if (!ex) ex = { k: r.k, x, d }; }
  for (const l of x.legs) if (l.t === 'cor' && !(l.len >= Math.hypot(l.p1[0] - l.p0[0], l.p1[1] - l.p0[1], l.p1[2] - l.p0[2]) - 1e-6)) c4 = false; } }
rec('COR-03', c3 && c3n > 0, `${cor.out.length} ports comparés depuis la capitale, ${c3n} itinéraires par corridors : accès en vol libre, corridors, sortie en vol libre (nulle quand le port est sur le réseau), un seul devis (longueur, durée, carburant = somme des phases)${ex ? ' · ex. ' + ex.k + ' : ' + ex.x.legs.map(l => (l.t === 'cor' ? l.e : 'libre') + ' ' + l.len.toFixed(0)).join(' → ') + ' u, ' + ex.x.test.toFixed(1) + ' min d’essai contre ' + ex.d.test.toFixed(1) + ' en direct' : ''}`);
rec('COR-04', c4 && cor.net && cor.net.len > cor.net.chord, `réseau : ${cor.net.cors} corridors, ${cor.net.edges} tronçons, ${cor.net.len.toFixed(0)} u mesurés sur les courbes (cordes : ${cor.net.chord.toFixed(0)} u) ; chaque tronçon est facturé à sa longueur courbe`);
rec('COR-05', c5, `les itinéraires ne changent de corridor qu’aux nœuds du réseau (stations, jonctions J1, J2) ; deux tracés qui se croisent ne créent aucune correspondance`);
// gros plan : le réseau s'efface (aucun retour à l'enchevêtrement)
await F.evaluate(() => { const S = STARBYTE_ZONES; S.backN(); S.corToggle(true); }); await sleep(2500);
const vis1 = await F.evaluate(() => { const c = STARBYTE_ZONES.corState(); return c.netVis && c.drawn; });
await F.evaluate(k => { const S = STARBYTE_ZONES, o = S.objects().find(o => o.type === 'station' && o.key === k); S.observe(o.id); }, stKey); await sleep(2500);
const vis2 = await F.evaluate(() => ({ v: STARBYTE_ZONES.corState().netVis, lvl: STARBYTE_ZONES.pres().level, marks: STARBYTE_ZONES.atlasState().marks.length }));
rec('COR-06', vis1 && !vis2.v && vis2.lvl === 'object' && vis2.marks <= 3, `réseau visible au voisinage ${vis1} ; en gros plan sur la station (${vis2.lvl}) : réseau masqué, ${vis2.marks} repère(s)`);
await F.evaluate(() => STARBYTE_ZONES.backN()); await sleep(2500);
await p.screenshot({ path: path.join(SHOTS, '18_reseau_atlas.png') });
await F.evaluate(k => { const S = STARBYTE_ZONES, o = S.objects().find(o => o.type === 'station' && o.key === k); S.setMode('tac'); S.corCompare('obj', o.id); const pl = S.corState().plans, i = pl.findIndex(x => x.k === 'cor'); if (i >= 0) S.corPick(i); else document.querySelector('#zj-sh-foot [data-a="cor-fit"]').click(); }, ex ? ex.k : 'A-M-3340'); await sleep(1800);
await p.screenshot({ path: path.join(SHOTS, '19_itineraire_tactique.png') });
// flotte mixte en embuscade (la tienne : composition connue) : un modèle par type présent, effectif complet dans la fiche
const flId = await p.evaluate(() => { const now = Date.now(), sys = (G.worlds[0] && G.worlds[0].coord || '').split('-').slice(0, 3).join('-');
  const f = { id: 'fl-test-mixte', name: 'Escadre Mixte', composition: { cuirasse: { t1: 2, t2: 0, t3: 0 }, fregate: { t1: 6, t2: 0, t3: 0 }, tanker: { t1: 3, t2: 0, t3: 0 } }, soldiers: { garde: 0, lourd: 0 }, createdAt: now,
    ambush: { system: MY_ADDRESS.cluster + '-' + MY_ADDRESS.sector + '-' + String(((MY_ADDRESS.system + 40 - 1000) % 9000) + 1000).padStart(4, '0'), phase: 'going', world: 'home', departedAt: now - 60000, arrivesAt: now + 20 * 60000, travelMs: 21 * 60000, hold: {} } };
  G.fleet.prepared.push(f); return 'fl:' + f.id; });
await F.evaluate(() => { STARBYTE_ZONES.refresh(true); STARBYTE_ZONES.corToggle(false); }); await sleep(600);
await F.evaluate(id => STARBYTE_ZONES.follow(id), flId); await sleep(3500);
let mf = null; for (let i = 0; i < 90 && !(mf && mf.tr && mf.tr.st !== 'loading'); i++) { await sleep(1000); mf = await F.evaluate(() => STARBYTE_ZONES.modelState()); }
await sleep(1200); mf = await F.evaluate(() => STARBYTE_ZONES.modelState());
const mfSheet = await F.evaluate(() => document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '));
await p.screenshot({ path: path.join(SHOTS, '20_flotte_mixte.png') });
rec('MODEL-02', mf.tr && mf.tr.st === 'ok' && mf.tr.n === 3 && mf.tr.urls.some(u => /kv01/.test(u)) && mf.tr.urls.some(u => /sr01/.test(u)) && mf.tr.urls.some(u => /tk07/.test(u)) && /2 cuirassés · 6 frégates · 3 tankers/.test(mfSheet) && mf.tr.shown === 3,
  `flotte mixte suivie : ${mf.tr && mf.tr.list.join(', ')} (${mf.tr && mf.tr.shown} dessinés à ${mf.tr && mf.tr.px && mf.tr.px.toFixed(0)} px) · « ${(mfSheet.match(/Effectif[^·]*·[^·]*·[^·]*·[^)]*?au total/) || [''])[0]} »`);
// dézoom : la tête seule, puis plus rien que le repère de la carte ; la mémoire reste bornée
await F.evaluate(() => { STARBYTE_ZONES.followStop(); STARBYTE_ZONES.zoomTo(160); }); await sleep(2200);
const far1 = await F.evaluate(() => ({ m: STARBYTE_ZONES.modelState().tr, marks: STARBYTE_ZONES.atlasState().marks.map(m => m.t) }));
await F.evaluate(() => { STARBYTE_ZONES.zoomTo(1800); }); await sleep(2200);
const far2 = await F.evaluate(() => ({ m: STARBYTE_ZONES.modelState().tr, marks: STARBYTE_ZONES.atlasState().marks.map(m => m.t), cache: STARBYTE_ZONES.modelState().cache }));
rec('MODEL-03', far1.m.shown === 1 && far1.m.vehVis && !far2.m.vehVis && far2.marks.some(t => /Escadre Mixte/.test(t)) && far2.cache.length <= 6,
  `à ${far1.m.px.toFixed(0)} px : ${far1.m.shown} modèle (la tête) ; à ${far2.m.px.toFixed(1)} px : plus de modèle, repère « Escadre Mixte » sur la carte · ${far2.cache.length} modèles gardés en mémoire (${far2.cache.join(', ')})`);
await p.evaluate(() => { G.fleet.prepared = G.fleet.prepared.filter(f => f.id !== 'fl-test-mixte'); });

rec('ERREURS', errs.length === 0, errs.slice(0, 8).join(' | ') || 'aucune erreur de page');
await browser.close(); srv.close();
process.exit(R.every(r => r.ok) ? 0 : 1);
