#!/usr/bin/env node
// Test de la carte (Atlas et Tactique) dans le vrai jeu, Chromium sans écran, iPhone émulé.
//   node labo/carte-zones/test_zones.mjs           → rapport + captures dans labo/carte-zones/captures/
// 1. Toutes les parties (14/11) : un joueur ordinaire passe sur la nouvelle carte ; actions reprises de l'ancienne carte.
// 1c. Conversion d'une partie existante : même avancement sur les corridors, aucun port donné, fiche d'accueil une fois.
// 2. Sondage d'une zone (univers ouvert), suivi d'une mission, modèles du jeu, corridors connus.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
// étape 4 : le module pur des voyages (celui du serveur) et la logique pure de la fonction `voyage`, rejouée sans base
const V = await import(path.resolve(here, '..', '..', 'src', 'voyage_core.js'));
const VS = (() => { const src = readFileSync(path.resolve(here, '..', '..', 'github_upload', 'server', 'voyage', 'index.ts'), 'utf8'); const pure = src.slice(src.indexOf('// ── logique pure'), src.indexOf('// ── fin de la logique pure')).replace(/(\w|\)): any\b/g, '$1'); return new Function('V', pure + '\nreturn { planLaunch };')(V); })();

const srv = await serve(); const port = srv.address().port; await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP play.test 127.0.0.1'] });
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-CH', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const errs = []; const watch = (p, tag) => { p.on('pageerror', e => errs.push(tag + ' ' + String(e.message || e).slice(0, 220))); p.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to fetch|net::ERR|fonts\.g|cloud|ERR_/i.test(m.text())) errs.push(tag + ' console ' + m.text().slice(0, 220)); }); };
async function newGame(p, url, planet) {
  await p.goto(url, { waitUntil: 'load', timeout: 90000 }); await sleep(2500);
  await p.evaluate((name) => { const i = document.getElementById('welcome-planet'); if (i) i.value = name; const c = document.getElementById('welcome-captain'); if (c && !c.value) c.value = 'Hadrien'; confirmWelcome(); }, planet);
  await sleep(1500);
}

// ═══ 1. Toutes les parties (14/11) : un joueur ordinaire passe sur la nouvelle carte ═══
{
  const ctx = await browser.newContext(iphone); const p = await ctx.newPage(); watch(p, '[ordinaire]');
  await newGame(p, `http://play.test:${port}/?zones=Panzerstorm`, 'TERRA');   // l'ancien raccourci d'essai ne fait plus rien
  await sleep(4000);
  const r = await p.evaluate(() => {
    saveGame(); const snap = JSON.parse(localStorage.getItem('starbyte_savegame') || '{}');
    // une Radar ordinaire suit toujours son chemin habituel
    const pool = G.probesPool.filter(x => x.tier === 'radar' && x.state === 'ready').length;
    const m = launchProbe('radar', MY_ADDRESS.cluster + '-' + MY_ADDRESS.sector + '-' + String(MY_ADDRESS.system).padStart(4, '0'), 'local', false);
    if (m) { m.arrivalAt = Date.now() - 1; tickProbes(); }
    const rep = (G.probeReports || [])[0];
    return { allowed: SBZones.allowed(), mig: SBZones.migrated(), mode: G.atlasCarte && G.atlasCarte.mode, saved: 'atlasCarte' in snap, btn: !!document.getElementById('sb-zones-btn'), overlay: !!document.getElementById('sb-zones-overlay'),
      tools: ['peek', 'saveRegion'].filter(k => k in SBZones), region: !!(G.zoneProspect && G.zoneProspect.region), welcome: G.atlasCarte && G.atlasCarte.accueil, modal: !document.getElementById('sb-modal-overlay').classList.contains('hidden'),
      radar: { before: pool, after: G.probesPool.filter(x => x.tier === 'radar').length, report: rep && rep.tier === 'radar' && !rep.zone } };
  });
  rec('TOUS', r.allowed && r.mig && r.mode === 'generale' && r.saved && !r.btn && !r.overlay && !r.tools.length && !r.region && r.welcome === 'nouveau' && !r.modal && r.radar.report && r.radar.after === r.radar.before - 1,
    `compte ordinaire neuf : partie migrée ${r.mig} (marque « ${r.mode} » enregistrée ${r.saved}), pas de bouton d'essai (${r.btn}), ?zones=Panzerstorm sans effet (${r.overlay}), outils d'essai ${JSON.stringify(r.tools)}, région d'essai ${r.region}, fiche d'accueil « ${r.welcome} » (nouveau joueur : aucune), une Radar normale part et revient par le chemin habituel (${r.radar.before} → ${r.radar.after}, rapport classique ${r.radar.report})`);
  const g = await p.evaluate(async () => { MY_ADDRESS.cluster = 'A'; MY_ADDRESS.sector = 'O'; MY_ADDRESS.system = 2178; goto('prospect'); await new Promise(r => setTimeout(r, 2600));
    return { mig: SBZones.migrated(), flag: !!(G.atlasCarte && G.atlasCarte.v === 1), wrap: !!document.getElementById('sb-atlas-wrap'), rootHidden: getComputedStyle(document.getElementById('spacemap-root')).display === 'none', nav: !!document.querySelector('#scr-prospect .smw-nav'), btn: !!document.getElementById('sb-zones-btn') }; });
  rec('CENTRE', !g.btn && g.mig && g.flag && g.wrap && g.rootHidden && g.nav, `Centre de prospection : nouvelle carte ${g.wrap}, ancienne cachée ${g.rootHidden}, bandeau et feuilles du jeu ${g.nav}, bouton d'essai ${g.btn}`);
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
  // univers ouvert : toute zone à portée se sonde ; son contenu ne dépend que de la zone
  await p.evaluate(() => { try { crownSpaceClose(); } catch (e) {} goto('prospect'); }); await sleep(2500);
  MF = await frame(); await sleep(800);
  const oz = await MF.evaluate(() => { const Z = STARBYTE_ZONES, id = Z.openZoneNear(true); if (!id) return null; Z.setMode('tac'); Z.selectZone(id, true); const c1 = Z.zoneContent(id); return { id, c1: JSON.stringify(c1), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), btn: !![...document.querySelectorAll('#zj-sh-foot button')].find(b => /Sonder cette zone/.test(b.textContent)) }; });
  await p.evaluate(() => { const pool = G.probesPool || []; if (!pool.some(x => x.tier === 'radar' && x.state === 'ready')) pool.push({ id: 'radar-test-' + Date.now(), tier: 'radar', state: 'ready', world: 'home' }); });
  await sleep(600);
  await MF.evaluate(() => { const b = [...document.querySelectorAll('#zj-sh-foot button')].find(b => /Sonder cette zone/.test(b.textContent)); if (b) b.click(); });
  await sleep(1200);
  const om = await p.evaluate(id => { const m = (G.probeMissions || []).find(x => x.zone === id); const z = G.zoneProspect.zones[id]; if (m) { m.arrivalAt = Date.now() - 1; tickProbes(); } const z2 = G.zoneProspect.zones[id]; return { m: !!m, open: z && z.open && z.open.content, done: z2 && z2.st, found: z2 && (z2.found || []).length, sig: z2 && z2.found && z2.found[0] && G.signatures[z2.found[0]] && G.signatures[z2.found[0]].system }; }, oz && oz.id);
  const oc = oz && JSON.parse(oz.c1);
  rec('MIG-OUVERT', oz && !/région de test/.test(oz.body) && oz.btn && om.m && om.done === 'done' && (oc.cat === 'rien' ? om.found === 0 : om.found === 1 && om.sig === oc.sys) && JSON.stringify(om.open) === JSON.stringify(oc.cat === 'rien' ? { cat: 'rien' } : Object.fromEntries(Object.entries(oc).filter(([k]) => k !== 'anchor'))),
    `zone ${oz && oz.id} (à portée) : « Sonder cette zone » ${oz && oz.btn}, aucun « région de test » ; contenu tiré de la zone : ${oz && oz.c1} → mission ${om.m}, arrivée ${om.done}, ${om.found} signature${om.found > 1 ? 's' : ''}${om.sig ? ' sur ' + om.sig : ''}`);
  // étape 1 : les systèmes balayés et leurs emplacements ; marquer un système
  const ks = await p.evaluate(() => { const a = MY_ADDRESS, sys = `${a.cluster}-${a.sector}-${String(((a.system + 11 - 1000) % 9000) + 1000).padStart(4, '0')}`, m = sys.match(/^([A-Z]+)-([A-Z])-(\d{4})$/);
    G.knownSystems = G.knownSystems || {}; G.knownSystems[sys] = { cluster: m[1], sector: m[2], system: m[3], planets: generateDiscoveredSystem(m[2], m[3], m[1]), discoveredAt: Date.now() - 3600e3, isMine: false };
    saveGame(); return { sys, n: G.knownSystems[sys].planets.length }; });
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(600);
  await p.evaluate(sys => openOnMap('system', sys), ks.sys); await sleep(2500);
  const ky = await MF.evaluate(() => ({ sel: STARBYTE_ZONES.zj.sel && STARBYTE_ZONES.zj.sel.id, rows: [...document.querySelectorAll('#zj-sh-body button[data-k="planet"]')].length, kind: (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent, foot: [...document.querySelectorAll('#zj-sh-foot button')].map(b => b.textContent.trim()) }));
  await p.screenshot({ path: path.join(SHOTS, '0d_systeme_balaye.png') });
  await MF.evaluate(() => { const b = [...document.querySelectorAll('#zj-sh-foot button')].find(b => b.textContent.trim() === 'Intéressant'); if (b) b.click(); }); await sleep(900);
  const kt = await p.evaluate(sys => (G.systemTags || {})[sys] || null, ks.sys);
  const ky2 = await MF.evaluate(() => (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent);
  rec('MIG-SYSTEMES', ky.sel === 'sys:' + ks.sys && ky.rows === ks.n && /SYSTÈME BALAYÉ/.test(ky.kind) && kt === 'star' && /INTÉRESSANT/.test(ky2),
    `système balayé ${ks.sys} : objet de la carte (${ky.sel}), ${ky.rows} emplacement(s) sur ${ks.n} (fiche planète du jeu), actions : ${ky.foot.join(' | ')} · marque « intéressant » posée dans la partie (${kt})`);
  // ce qui appartenait à l'ancienne carte (légende, puces, aide de plan) ne passe jamais par-dessus la nouvelle
  const ov = await p.evaluate(() => { const s = document.getElementById('scr-prospect'), out = {}; for (const c of ['pl-legend', 'pl-chip', 'pl-hud', 'pl-xtra']) { const d = document.createElement('div'); d.className = c + ' on'; s.appendChild(d); out[c] = getComputedStyle(d).display; d.remove(); } return out; });
  rec('MIG-SURCOUCHE', Object.values(ov).every(v => v === 'none'), `éléments de l'ancienne carte sur la nouvelle : ${Object.entries(ov).map(([k, v]) => k + ' ' + v).join(', ')}`);
  // 12/11, 8 h 49 (retours d'Adrien) : barre du bas et guide « ? » retirés, leurs raccourcis dans la fiche ; boutons remontés ; essais masqués
  await MF.evaluate(() => document.getElementById('zj-sh-back').click()); await sleep(400);
  await MF.evaluate(() => document.getElementById('zj-sh-back').click()); await sleep(700);
  const rc = await MF.evaluate(() => ({ nav: [...document.querySelectorAll('#zj-gnav button')].map(b => b.dataset.t + (b.querySelector('svg') ? '' : '(sans icône)')), top: getComputedStyle(document.getElementById('zj-top')).top, essai: /Réseau de corridors candidat/.test(document.getElementById('zj-sh-body').innerText), mesCor: ((document.querySelector('#zj-sh-body [data-a="cor-net"] b') || {}).textContent || ''), bal: !!document.querySelector('#zj-sh-body [data-a="beacons"]') }));
  const rg = await p.evaluate(() => { const s = document.getElementById('scr-prospect'), g = document.getElementById('sb-pguide-btn'), w = document.getElementById('sb-atlas-wrap').getBoundingClientRect(); return { nav: getComputedStyle(s.querySelector('.smw-nav')).display, guide: g ? getComputedStyle(g).display : 'absent', bottom: Math.round(innerHeight - w.bottom) }; });
  await MF.evaluate(() => { const b = document.querySelector('#zj-gnav button[data-t="rapports"]'); if (b) b.click(); }); await sleep(1000);
  const rs = await p.evaluate(() => { const sh = document.querySelector('#scr-prospect .smw-sheet'); return { on: !!(sh && sh.classList.contains('on')), t: sh ? sh.querySelector('.smw-sh-t').textContent : '' }; });
  await p.screenshot({ path: path.join(SHOTS, '0e_raccourci_rapports.png') });
  await p.evaluate(() => { const x = document.querySelector('#scr-prospect .smw-sh-x'); if (x) x.click(); }); await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, '0f_accueil_raccourcis.png') });
  rec('MIG-RACCOURCIS', rc.nav.length >= 4 && rc.nav.includes('rapports') && rc.nav.every(x => !/sans/.test(x)) && rg.nav === 'none' && (rg.guide === 'none' || rg.guide === 'absent') && rg.bottom <= 1 && rc.top === '8px' && rs.on,
    `raccourcis dans la fiche : ${rc.nav.join(', ')} · barre du bas du jeu ${rg.nav}, guide « ? » ${rg.guide}, carte jusqu'au bas de l'écran (écart ${rg.bottom} px), barre Atlas/Tactique à ${rc.top} du haut de la carte · « Rapports » ouvre la feuille du jeu (${rs.on}, « ${rs.t} »)`);
  await p.evaluate(sys => openOnMap('system', sys), crownSys); await sleep(2200);
  const es = await MF.evaluate(() => [...document.querySelectorAll('#zj-sh-foot button')].map(b => b.textContent.trim()));
  rec('MIG-ESSAI', !rc.essai && /^Mes corridors · \d+ connus?$/.test(rc.mesCor) && !es.some(t => /essai/i.test(t)), `accueil sans « Réseau de corridors candidat · essai » (${!rc.essai}), à la place « ${rc.mesCor} » (étape 4) ; port sans action d'essai : ${es.join(' | ')}`);
  // étape 2 : poser une balise depuis la fiche d'un système, la voir en route, posée, puis la rappeler (règles et fonctions du jeu)
  await p.evaluate(() => { G.probesPool = G.probesPool || []; if (!G.probesPool.some(x => x.tier === 'beacon' && x.state === 'ready')) G.probesPool.push({ id: 'beacon-test-' + Date.now(), tier: 'beacon', state: 'ready', world: 'home', name: 'Balise d’essai' }); });
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(500);
  // hors de portée des capteurs : la carte le dit d'avance, avec la phrase du jeu, au lieu de proposer un envoi refusé au départ
  const far = await p.evaluate(sys => validateAddressForTier(sys, 'beacon'), ks.sys);
  await p.evaluate(sys => openOnMap('system', sys), ks.sys); await sleep(2500);
  const b0 = await MF.evaluate(() => ({ place: !!document.querySelector('#zj-sh-body [data-a="g-bc-place"]'), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') }));
  // un système à portée, balayé
  const bsys = await p.evaluate(() => { const A = MY_ADDRESS; for (let d = 1; d < 80; d++) { const n = A.system + d; if (n > 9999) break; const k = A.cluster + '-' + A.sector + '-' + n; if (!validateAddressForTier(k, 'beacon').valid) continue;
    G.knownSystems = G.knownSystems || {}; G.knownSystems[k] = { cluster: A.cluster, sector: A.sector, system: String(n), planets: generateDiscoveredSystem(A.sector, String(n), A.cluster), discoveredAt: Date.now() - 600e3, isMine: false }; saveGame(); return k; } return null; });
  ks.sys = bsys || ks.sys;
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(600);
  await p.evaluate(sys => openOnMap('system', sys), ks.sys); await sleep(2500);
  const b1 = await MF.evaluate(() => ({ place: !!document.querySelector('#zj-sh-body [data-a="g-bc-place"]'), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') }));
  await MF.evaluate(() => { const b = document.querySelector('#zj-sh-body [data-a="g-bc-place"]'); if (b) b.click(); }); await sleep(1500);
  const b2 = await p.evaluate(sys => !!(G.probeMissions || []).find(x => x.tier === 'beacon' && x.status === 'in_transit' && String(x.targetCoords).startsWith(sys)), ks.sys);
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(700);
  const b2f = await MF.evaluate(() => document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '));
  await p.evaluate(sys => { const m = (G.probeMissions || []).find(x => x.tier === 'beacon' && x.status === 'in_transit' && String(x.targetCoords).startsWith(sys)); if (m) { m.arrivalAt = Date.now() - 1; tickProbes(); } }, ks.sys);
  const b3 = await p.evaluate(sys => { const b = sbAllProbes().find(x => x.tier === 'beacon' && x.state === 'deployed' && String(x.deployedSystem || '').startsWith(sys)); return b ? b.id : null; }, ks.sys);
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(900);
  const b4 = await MF.evaluate(() => ({ recall: !!document.querySelector('#zj-sh-body [data-a="g-bc-recall"]'), body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') }));
  await p.screenshot({ path: path.join(SHOTS, '0g_balise_posee.png') });
  await MF.evaluate(() => { const b = document.querySelector('#zj-sh-body [data-a="g-bc-recall"]'); if (b) b.click(); }); await sleep(1500);
  const b5 = await p.evaluate(id => { const b = id && sbAllProbes().find(x => x.id === id); return b ? b.state : null; }, b3);
  rec('MIG-BALISE', (far.valid || (!b0.place && b0.body.includes(far.error))) && b1.place && b2 && /Balise en route/.test(b2f) && !!b3 && b4.recall && b5 === 'ready',
    `hors de portée (${far.valid ? 'aucun cas' : '« ' + far.error + ' »'}) : bouton ${b0.place}, raison affichée ${!far.valid && b0.body.includes(far.error)} · système ${ks.sys} : « Poser une balise » ${b1.place} → mission du jeu ${b2}, fiche « ${(b2f.match(/Balise en route[^.]*\./) || [''])[0]} » · arrivée : balise ${b3} posée, « Rappeler la balise » ${b4.recall} (« ${(b4.body.match(/BALISE.{0,90}/) || [''])[0]} ») · rappel : balise ${b5}`);
  // étape 3 : commandants (balayé, allié ; relation seule, ennemi), garnison, raid, raid annoncé, garnison alliée chez moi
  const cm = await p.evaluate(() => { const A = MY_ADDRESS, now = Date.now(), sys = A.cluster + '-' + A.sector + '-' + (A.system + 3), addr = sys + '-03', enemy = A.cluster + '-' + A.sector + '-' + (A.system + 7) + '-02', m = sys.match(/^([A-Z]+)-([A-Z])-(\d{4})$/);
    const planets = generateDiscoveredSystem(m[2], m[3], m[1]); planets.push({ coord: addr, slot: 3, type: 'tellurique', name: 'Vel Kor', playerName: 'Kerath', isReal: true, mpAddress: addr, playerLevel: 7 });
    G.knownSystems[sys] = { cluster: m[1], sector: m[2], system: m[3], planets, discoveredAt: now - 3600e3, isMine: false };
    G.mpAlliance = { alliance: { id: 'al-test', name: 'Ordre Test', color: '#5fffe8', leader: true }, members: [{ pseudo: 'Kerath', address: addr, addresses: [addr], me: false }, { pseudo: 'Hadrien', me: true, addresses: [] }], invites: [], sent: [], messages: [] };
    G.mpRelations = [{ kind: 'enemy', pseudo: 'Borg', addresses: [enemy], byMe: true }];
    const comp = (f, c) => ({ fregate: { t1: f, t2: 0, t3: 0 }, cuirasse: { t1: c, t2: 0, t3: 0 }, tanker: { t1: 0, t2: 0, t3: 0 } });
    G.fleet.prepared.push({ id: 'fl-gar-test', name: 'Garde d’honneur', composition: comp(2, 0), soldiers: { garde: 0, lourd: 0 }, status: 'in_mission', world: 'home', missionStartedAt: now - 60000, garrison: { address: addr, pseudo: 'Kerath', phase: 'going', world: 'home', departedAt: now - 60000, arrivesAt: now + 600000, travelMs: 660000 } });
    G.fleet.prepared.push({ id: 'fl-raid-test', name: 'Lames', composition: comp(3, 1), soldiers: { garde: 0, lourd: 0 }, status: 'in_mission', world: 'home', missionStartedAt: now - 120000, mpArrivesAt: now + 480000, missionEndsAt: now + 1800000, mpRaidId: 'raid-test', mpTarget: { name: 'Borg Prime', pseudo: 'Borg', address: enemy } });
    _mpIncoming = [{ id: 'in-test', attacker_pseudo: 'Borg', fleet_name: 'Horde', arrives_at: new Date(now + 900000).toISOString(), defender_address: null }];
    G.mpGarHosted = [{ owner_pseudo: 'Kerath', fleet_name: 'Bouclier', host_address: null, def: 1200, arrives_at: new Date(now - 1000).toISOString() }];
    saveGame(); return { sys, addr, enemy }; });
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(900);
  const c1 = await MF.evaluate(c => { const Z = STARBYTE_ZONES, S = Z.zj.snap, k = (S.cmd || []).find(x => x.pseudo === 'Kerath'), b = (S.cmd || []).find(x => x.pseudo === 'Borg'), o = Z.objects().find(x => x.key === c.sys), oe = Z.objects().find(x => x.key === c.enemy.split('-').slice(0, 3).join('-'));
    const tr = Z.travels(), g = tr.find(t => t.id === 'fl:fl-gar-test'), r = tr.find(t => t.id === 'fl:fl-raid-test');
    return { k: k && { ally: k.rel.ally, gar: k.gar.length, emb: k.embassy, can: k.canGarrison }, b: b && { enemy: b.rel.enemy, known: b.known }, o: o && { type: o.type, name: o.name, cmd: !!o.cmd }, oe: oe && oe.name, g: g && { ok: g.ok, st: g.status }, r: r && { ok: r.ok, n: r.n, to: r.to } }; }, cm);
  await p.evaluate(sys => openOnMap('system', sys), cm.sys); await sleep(2500);
  const c2 = await MF.evaluate(() => ({ kind: (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent, h3: (document.querySelector('#zj-sh-body h3') || {}).textContent, body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), acts: [...document.querySelectorAll('#zj-sh-body .zj-row b')].map(b => b.textContent) }));
  await p.screenshot({ path: path.join(SHOTS, '0h_commandant_allie.png') });
  await MF.evaluate(() => { document.getElementById('zj-sh-back').click(); document.getElementById('zj-sh-back').click(); }); await sleep(800);
  const c3 = await MF.evaluate(() => [...document.querySelectorAll('#zj-sh-body .zj-row b')].map(b => b.textContent));
  await MF.evaluate(() => { const b = document.querySelector('#zj-sh-body [data-a="raid-in"]'); if (b) b.click(); }); await sleep(900);
  const c4 = await MF.evaluate(() => document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '));
  await p.screenshot({ path: path.join(SHOTS, '0i_raid_annonce.png') });
  rec('MIG-COMMANDANTS', c1.k && c1.k.ally === 'Ordre Test' && c1.k.gar === 1 && c1.k.emb && c1.k.can && c1.b && c1.b.enemy && !c1.b.known && c1.o && c1.o.cmd && /Kerath/.test(c1.o.name) && c1.oe === 'Borg'
    && /COMMANDANT/.test(c2.kind) && /Kerath/.test(c2.h3 || '') && /Allié · Ordre Test/.test(c2.body) && /Garde d’honneur · arrivée en garnison/.test(c2.body) && ['Voir sa fiche', 'Ouvrir l’ambassade', 'Envoyer une flotte en garnison', 'Rappeler Garde d’honneur'].every(t => c2.acts.includes(t)),
    `Kerath (balayé, allié) : ${JSON.stringify(c1.k)}, repère « ${c1.o && c1.o.name} » · Borg (relation seule) : ${JSON.stringify(c1.b)}, repère sur son système « ${c1.oe} » · fiche « ${c2.kind} · ${c2.h3} » : ${c2.acts.join(' | ')}`);
  rec('MIG-FLOTTES', c1.g && c1.g.ok && c1.g.st === 'going' && c1.r && c1.r.ok && c1.r.to === cm.enemy && c3.some(t => /Flotte hostile · Borg/.test(t)) && c3.some(t => /^Commandants · \d+$/.test(t)) && /FLOTTE HOSTILE EN APPROCHE/.test(c4) && /Bouclier de Kerath/.test(c4),
    `garnison en route ${JSON.stringify(c1.g)}, raid vers ${c1.r && c1.r.to} (${c1.r && c1.r.ok}) · accueil : ${c3.filter(t => /Flotte hostile|Commandants/.test(t)).join(' | ')} · capitale : « ${(c4.match(/FLOTTE HOSTILE[^.]*\./) || [''])[0]} » ; « ${(c4.match(/Bouclier[^.]*\./) || [''])[0]} »`);
  // la fiche d'un commandant ouvre la fiche du jeu
  await p.evaluate(sys => openOnMap('system', sys), cm.sys); await sleep(2200);
  await MF.evaluate(() => { const b = document.querySelector('#zj-sh-body [data-a="g-cmd"]'); if (b) setTimeout(() => b.click(), 30); }); await sleep(2500);
  const c5 = await p.evaluate(() => ({ scr: typeof getCurrentScreen === 'function' ? getCurrentScreen() : '', txt: (document.body.innerText.match(/Kerath[^\n]{0,40}/) || [''])[0] }));
  rec('MIG-FICHE', c5.scr !== 'prospect' && /Kerath/.test(c5.txt), `« Voir sa fiche » ouvre l'écran du jeu « ${c5.scr} » (« ${c5.txt} »)`);
  await p.evaluate(() => goto('prospect')); await sleep(2500); MF = await frame(); await sleep(800);
  // Atlas : toucher le vide choisit la zone sous le doigt
  const v1 = await MF.evaluate(async () => { const Z = STARBYTE_ZONES; Z.setMode('atlas'); await new Promise(r => setTimeout(r, 1500)); Z.backN(); await new Promise(r => setTimeout(r, 2500)); const before = Z.zj.sel && Z.zj.sel.type;
    Z.atlasTap(innerWidth / 2 + 40, innerHeight * .3); await new Promise(r => setTimeout(r, 400)); return { before, sel: Z.zj.sel && Z.zj.sel.type, zone: Z.zj.sel && Z.zj.sel.zone, view: Z.zj.view, lvl: Z.pres().level }; });
  await p.screenshot({ path: path.join(SHOTS, '0j_atlas_vide_zone.png') });
  rec('MIG-VIDE', v1.sel === 'zone' && !!v1.zone && v1.view === 'zone', `Atlas, voisinage : toucher le vide → ${v1.sel} ${v1.zone} (fiche ${v1.view}, présentation ${v1.lvl})`);
  // étape 4 : route connue → corridor connu ; itinéraires sans « essai » ; « Lancer ce trajet » → composition du jeu → voyage fixé par le serveur
  await p.exposeFunction('sbVoyageTest', body => { const r = VS.planLaunch(body, { address: body.origin, colonies: [] }, Date.now()); return r.ok ? { ok: true, voyage: { id: 'v-test-' + r.row.mission_id.slice(-4), ...r.row, departed_at: new Date(r.row.departed_at).toISOString(), arrives_at: new Date(r.row.arrives_at).toISOString() } } : { ok: false, error: r.why }; });
  const vy0 = await p.evaluate(sys => { SBZones.voyageTransport(b => window.sbVoyageTest(b)); SBLines.ensureRoute(sys); G.fleet.stationed.tanker = { t1: 3, t2: 0, t3: 0 }; G.fuel = 500; saveGame();
    const r = (G.routes || []).find(x => x.portSys === sys); return { route: r && r.name, home: (SBZones.state().worlds.find(w => w.id === 'home') || {}).coord }; }, crownSys);
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(700);
  await p.evaluate(sys => openOnMap('system', sys), crownSys); await sleep(2500);
  await MF.evaluate(() => { const b = document.querySelector('#zj-sh-foot [data-a="cor-obj"]'); if (b) b.click(); }); await sleep(1500);
  const vy1 = await MF.evaluate(() => { const S = STARBYTE_ZONES; return { known: S.zj.snap.corKnown, kind: (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent, body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), launch: !!document.querySelector('#zj-sh-foot [data-a="g-voyage"]'), plans: S.corState().plans }; });
  await p.screenshot({ path: path.join(SHOTS, '0k_itineraires_port.png') });
  const vq = V.voyageOptions(vy0.home, crownSys, 1, vy1.known || []);
  const vpar = (vy1.plans || []).length === vq.plans.length && vq.plans.every(b => { const a = vy1.plans.find(x => x.k === b.k); return a && Math.abs(a.len - b.len) < 1e-6 && Math.abs(a.test - b.test) < 1e-9 && a.fuel === b.fuel; });
  await MF.evaluate(() => { const b = document.querySelector('#zj-sh-foot [data-a="g-voyage"]'); if (b) b.click(); }); await sleep(1500);
  const vy2 = await p.evaluate(() => { const ov = document.getElementById('commerce-sheet-overlay'); const shown = !!(ov && ov.classList.contains('shown')); const before = G.fuel; onLaunchTankerOnRouteClick(); const m = G.tankerMissions[G.tankerMissions.length - 1]; return { shown, before, id: m && m.id, local: m && (m.arrivalAt - m.departedAt) }; });
  await sleep(2500);
  const vy3 = await p.evaluate(id => { const m = G.tankerMissions.find(x => x.id === id); try { const ov = document.getElementById('commerce-sheet-overlay'); if (ov) ov.classList.remove('shown'); } catch (e) {} return m && { v: m.voyage, dur: m.arrivalAt - m.departedAt, fuel: m.fuelCost, gfuel: G.fuel, copie: !!(G.atlasCarte.copie4 && G.atlasCarte.copie4.routes), known: G.atlasCarte.cor && G.atlasCarte.cor.known }; }, vy2.id);
  const vp = vq.plans.find(x => x.k === (vy3 && vy3.v && vy3.v.pick));
  await MF.evaluate(id => { STARBYTE_ZONES.refresh(true); }, vy2.id); await sleep(800);
  const vy4 = await MF.evaluate(id => { STARBYTE_ZONES.selectTravel('tk:' + id); return document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '); }, vy2.id);
  await p.screenshot({ path: path.join(SHOTS, '0l_voyage_serveur.png') });
  rec('MIG-VOYAGE', vy0.route === 'La Saigne de la Couronne' && (vy1.known || []).includes('C5') && /^ITINÉRAIRES$/.test(vy1.kind || '') && !/essai/i.test(vy1.body) && vy1.launch && vpar && vy2.shown && vy3 && vy3.v && vy3.v.st === 'server' && vp && vy3.dur === Math.round(vp.test * 60000) && vy3.fuel === vp.fuel && Math.abs(vy3.gfuel - (vy2.before - vp.fuel)) <= 3 && vy3.copie && /Voyage fixé par le serveur/.test(vy4),
    `route « ${vy0.route} » → corridors connus ${JSON.stringify(vy1.known)} (copie des routes gardée ${vy3 && vy3.copie}) · fiche « ${vy1.kind} », sans « essai » ${!/essai/i.test(vy1.body)}, devis de la carte = devis du serveur ${vpar} · composition du jeu ouverte ${vy2.shown} · voyage ${vy3 && vy3.v && vy3.v.st} (${vy3 && vy3.v && vy3.v.pick}) : ${vy3 && Math.round(vy3.dur / 1000)} s au lieu de ${Math.round(vy2.local / 1000)} s, ${vy3 && vy3.fuel} carburant (stock ${vy2.before} → ${vy3 && vy3.gfuel}) · fiche de la mission : « ${(vy4.match(/Voyage fixé[^.]*\./) || [''])[0]} »`);
  // le service pas encore installé : le tanker part quand même, avec les horaires du jeu, et la carte le dit
  await p.evaluate(() => SBZones.voyageTransport(async () => ({ ok: false, error: 'not_deployed' })));
  await MF.evaluate(() => { const r = window.parent.SBZones.gameAct('voyage', { port: STARBYTE_ZONES.zj.cor.ctx.D.key, pick: 'libre' }); return r; });
  await sleep(800);
  const vy5 = await p.evaluate(() => { onLaunchTankerOnRouteClick(); const m = G.tankerMissions[G.tankerMissions.length - 1]; return m && m.id; }); await sleep(1500);
  const vy6 = await p.evaluate(id => { const m = G.tankerMissions.find(x => x.id === id); try { document.getElementById('commerce-sheet-overlay').classList.remove('shown'); } catch (e) {} return m && { v: m.voyage, dur: m.arrivalAt - m.departedAt }; }, vy5);
  rec('MIG-VOYAGE-SANS', vy6 && vy6.v && vy6.v.st === 'local' && vy6.v.why === 'not_deployed' && vy6.dur >= 5 * 60000 * .5, `service pas installé : le tanker part (${vy6 && Math.round(vy6.dur / 60000)} min, horaires du jeu), voyage « ${vy6 && vy6.v && vy6.v.st} » (${vy6 && vy6.v && vy6.v.why})`);
  await p.evaluate(() => SBZones.voyageTransport(null));
  // étape 5 (partie jeu) : les lignes PNJ des stations passent sur leur corridor ; une balise sur un ancien jalon va au relais le plus proche
  const ln0 = await p.evaluate(() => { const net = SBLines.network(), crown = net.lines.find(l => l.corridor === 'La Saigne de la Couronne'), refuge = net.lines.find(l => l.corridor === 'La Piste des Glaces');
    const old = crown && crown.oldChain && crown.oldChain[2], now = Date.now();
    if (old) { G.probesPool.push({ id: 'beacon-jalon-test', tier: 'beacon', state: 'deployed', deployedSystem: old, deployedAt: now - 3600e3, world: 'home', name: 'Balise du jalon' }); delete G.atlasCarte.etapes.balises; saveGame(); }
    return { mode: net.mode, crown: crown && crown.chain, crownOld: crown && crown.oldChain && crown.oldChain.length, refuge: refuge && refuge.chain, old, lignes: !!(G.atlasCarte.etapes && G.atlasCarte.etapes.lignes), period: crown && crown.period }; });
  await sleep(3500);
  const ln1 = await p.evaluate(() => { const b = sbAllProbes().find(x => x.id === 'beacon-jalon-test'); const n0 = (G.beaconReports || []).length;
    if (b) b._linesAt = Date.now() - 3 * 3600e3;   // 14/11 : la conversion repart de maintenant (pas de relève rétroactive) ; on relit 3 h pour voir les passages au relais
    SBLines.tickBeacons(sbAllProbes().filter(x => x.tier === 'beacon' && x.state === 'deployed'), Date.now());
    // ce qui reste quel que soit l'horaire : les passages relevés au relais (un rapport n'existe que dans la fenêtre de 12 min d'un passage)
    const line = SBLines.network().lines.find(l => l.corridor === 'La Saigne de la Couronne'), ob = (G.lineObs || {})[line.id] || {};
    const seen = Object.entries(ob).filter(([k]) => /@A-M-1979$/.test(k)).reduce((a, [, v]) => a + (Array.isArray(v) ? v.length : 0), 0);
    const rep = (G.beaconReports || []).filter(r => r.systemCoord === 'A-M-1979');
    return { sys: b && b.deployedSystem, moves: (G.atlasCarte.moves5 || []).map(m => m.from + '>' + m.to), seen, label: rep[0] ? rep[0].target && rep[0].target.name : 'aucun passage dans les 12 dernières minutes', copie: !!G.atlasCarte.copie5 }; });
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(700);
  await p.evaluate(() => openOnMap('system', 'A-M-1979')); await sleep(2500);
  const ln2 = await MF.evaluate(() => ({ sel: STARBYTE_ZONES.zj.sel && STARBYTE_ZONES.zj.sel.id, kind: (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent, h3: (document.querySelector('#zj-sh-body h3') || {}).textContent, body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') }));
  await p.screenshot({ path: path.join(SHOTS, '0m_relais_corridor.png') });
  const ln3 = await MF.evaluate(() => { STARBYTE_ZONES.setMode('tac'); STARBYTE_ZONES.selectSeg('C5.2'); return { kind: (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent, body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ') }; });
  rec('MIG-LIGNES', ln0.mode === 'cor' && JSON.stringify(ln0.crown) === '["A-M-1979"]' && JSON.stringify(ln0.refuge) === '["A-N-2190","A-N-9950","A-N-7595"]' && ln0.crownOld >= 6 && ln0.lignes,
    `lignes des stations sur leur corridor (${ln0.mode}) : Couronne ${JSON.stringify(ln0.crown)} (au lieu de ${ln0.crownOld} jalons tirés au hasard), Piste des Glaces ${JSON.stringify(ln0.refuge)} · horaires gardés (un départ toutes les ${Math.round(ln0.period / 60000)} min) · connaissances converties ${ln0.lignes}`);
  rec('MIG-BALISES-RELAIS', ln1.sys === 'A-M-1979' && ln1.moves.includes(ln0.old + '>A-M-1979') && ln1.seen >= 1 && ln1.copie, `balise posée sur l'ancien jalon ${ln0.old} → relais R7 (${ln1.sys}), notée dans « Mes balises » ; copie gardée ${ln1.copie} · au relais, elle voit les convois PNJ : ${ln1.seen} passage(s) relevé(s) (« ${ln1.label || ''} »)`);
  rec('MIG-RELAIS', ln2.sel === 'sys:A-M-1979' && /^RELAIS · LA SAIGNE DE LA COURONNE/.test(ln2.kind || '') && /Relais R7/.test(ln2.h3 || '') && /PROCHAINS CONVOIS PNJ/.test(ln2.body) && /TRONÇONS QUI LE TOUCHENT/.test(ln2.body) && /BALISE/.test(ln2.body) && /^TRONÇON · LA SAIGNE DE LA COURONNE/.test(ln3.kind || '') && !/essai/i.test(ln3.body),
    `fiche « ${ln2.kind} · ${ln2.h3} » : ${(ln2.body.match(/PROCHAINS CONVOIS PNJ.{0,120}/) || [''])[0]} · tronçon « ${ln3.kind} » : ${(ln3.body.match(/Embuscade sur ce tronçon[^.]*\./) || [''])[0]}`);
  // étape 5 (embuscade sur un tronçon) : depuis la fiche du tronçon C5.2, une flotte part au rythme de son vaisseau le plus lent ;
  // en place, elle voit et aborde les convois PNJ qui entrent sur le tronçon (registre : mp_ambush_post_seg, rejoué en SQL à part)
  const am0 = await p.evaluate(() => { G.fleet.prepared.push({ id: 'fl-seg-test', name: 'Griffes', composition: { fregate: { t1: 3, t2: 0, t3: 0 }, cuirasse: { t1: 1, t2: 0, t3: 0 }, tanker: { t1: 1, t2: 0, t3: 0 } }, soldiers: { garde: 0, lourd: 0 }, status: 'deployed', world: 'home' });
    G.res.energie.v = Math.max(G.res.energie.v || 0, 50000); window._mpOnline = () => true; window.mpPeaceGuard = async () => true; SBLines.chooseOrders = async () => ({ mode: 'rob_all', players: true }); window.sbConfirmWarning = async () => true; saveGame();
    return { e0: G.res.energie.v, home: (SBZones.state().worlds.find(w => w.id === 'home') || {}).coord }; });
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(700);
  const am1 = await MF.evaluate(() => { STARBYTE_ZONES.setMode('tac'); STARBYTE_ZONES.selectSeg('C5.2'); const b = document.querySelector('#zj-sh-body [data-a="g-amb-seg"][data-id="fl-seg-test"]'); return { row: b && b.innerText.replace(/\s+/g, ' '), ms: b && +b.dataset.ms }; });
  const amq = V.fleetToSegment({ fregate: { t1: 3 }, cuirasse: { t1: 1 }, tanker: { t1: 1 } }, am0.home, 'C5.2');
  await MF.evaluate(() => { const b = document.querySelector('#zj-sh-body [data-a="g-amb-seg"][data-id="fl-seg-test"]'); if (b) b.click(); }); await sleep(1800);
  const am2 = await p.evaluate(() => { const f = G.fleet.prepared.find(x => x.id === 'fl-seg-test'), a = f && f.ambush; return a && { edge: a.edge, a: a.a, b: a.b, phase: a.phase, ms: a.arrivesAt - a.departedAt, orders: a.orders, e: G.res.energie.v, st: f.status }; });
  await MF.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(700);
  const am3 = await MF.evaluate(() => { const t = (STARBYTE_ZONES.zj.tr || []).find(x => x.id === 'fl:fl-seg-test'); STARBYTE_ZONES.selectSeg('C5.2'); return { seg: t && t.seg && t.seg.edge, mine: /MES FLOTTES SUR CE TRONÇON[\s\S]*Griffes/.test(document.getElementById('zj-sh-body').innerText) }; });
  await p.screenshot({ path: path.join(SHOTS, '0n_embuscade_troncon.png') });
  // arrivée, puis trois heures de passages PNJ relus
  const am4 = await p.evaluate(() => { const f = G.fleet.prepared.find(x => x.id === 'fl-seg-test'), a = f.ambush, now = Date.now(); a.departedAt = now - a.travelMs - 1000; a.arrivesAt = now - 1000; _mpAmbushTick(f, now);
    a.postedAt = a.npcAt = now - 3 * 3600e3; const line = SBLines.network().lines.find(l => l.corridor === 'La Saigne de la Couronne'), before = JSON.stringify((G.lineObs || {})[line.id] || {});
    SBLines.tickAmbushes(Date.now()); const ob = (G.lineObs || {})[line.id] || {}, keys = Object.keys(ob).filter(k => /^t_(out@A-M-1979|in@A-M-3340)$/.test(k));
    return { phase: a.phase, seen: keys.reduce((n, k) => n + ob[k].length, 0), changed: JSON.stringify(ob) !== before, tries: (a.npcDone || []).length, hold: a.npcPending || a.hold || {} }; });
  rec('MIG-EMBUSCADE', am1.ms > 0 && amq && am1.ms === amq.ms && am2 && am2.edge === 'C5.2' && am2.a === 'A-M-1979' && am2.b === 'A-M-3340' && am2.phase === 'going' && am2.ms === am1.ms && am2.st === 'in_mission' && am2.e < am0.e0 && am2.orders.players && am3.seg === 'C5.2' && am3.mine && am4.phase === 'posted' && am4.seen > 0 && am4.changed,
    `fiche du tronçon : « ${am1.row} » (trajet de la carte = règle du serveur : ${am1.ms === (amq && amq.ms)}, ${Math.round(am1.ms / 60000)} min au rythme du cuirassé) · partie ${am2 && am2.edge} (${am2 && am2.a} → ${am2 && am2.b}), énergie ${am0.e0} → ${am2 && am2.e}, ordres ${JSON.stringify(am2 && am2.orders)} · sur la carte : tronçon tenu ${am3.mine} · en place (${am4.phase}) : ${am4.seen} entrée(s) de convois PNJ vues sur C5.2, ${am4.tries} abordage(s) tenté(s)`);
  await p.evaluate(() => goto('planet')); await sleep(1500);
  const m6 = await p.evaluate(() => !!document.getElementById('sb-atlas-wrap'));
  // la marque survit au rechargement (la capitale de l'essai n'est plus lue : c'est la sauvegarde qui fait foi)
  await p.reload(); await sleep(6000);
  const m7 = await p.evaluate(() => ({ mig: SBZones.migrated(), flag: G.atlasCarte && G.atlasCarte.v, why: SBZones.why() }));
  rec('MIG-SUITE', !m6 && m7.mig && m7.flag === 1, `planète : carte déchargée (${!m6}) · après rechargement : partie toujours migrée ${m7.mig} (marque v${m7.flag}, accès d'essai « ${m7.why} »)`);
  await ctx.close();
}

// ═══ 1c. Conversion d'une partie existante (décision du 14/11 : « même avancement, aucun cadeau ») ═══
// Une partie jouée sur l'ancienne carte (carte coupée : SB_ZONES_OFF), avec des balises, des signaux d'antenne, des tronçons connus et une
// flotte en embuscade sur d'anciens jalons ; puis la même partie rechargée normalement : la migration et sa conversion passent.
{
  const ctx = await browser.newContext(iphone); const p = await ctx.newPage(); watch(p, '[conversion]');
  await p.addInitScript(() => { if (!sessionStorage.getItem('sb_mig_go')) window.SB_ZONES_OFF = true; });
  await newGame(p, `http://play.test:${port}/`, 'ANCIENNE'); await sleep(2500);
  const set = await p.evaluate(() => {
    const net = SBLines.network(), now = Date.now(), cr = net.byId['dock-37oe89-0'], rg = net.byId['dock-o3pz0b-0'], gl = net.byId['dock-wc15ki-0'];
    G.hiddenPorts = G.hiddenPorts || {}; G.hiddenPorts[gl.port] = { dockId: gl.dockId, name: 'Refuge', typeLabel: 'Port franc', at: now };   // le port des Glaces est connu, les deux autres non
    const B = (id, sys) => G.probesPool.push({ id, tier: 'beacon', state: 'deployed', deployedSystem: sys, deployedAt: now - 7200e3, _linesAt: now, world: 'home', name: id });
    B('b-cr', cr.chain[3]); B('b-rg0', rg.chain[0]); B('b-rg5', rg.chain[5]); B('b-rg6', rg.chain[6]); B('b-gl', gl.chain[gl.chain.length - 1]);
    G.trafficEchoes = G.trafficEchoes || {}; G.trafficEchoes[cr.chain[0]] = { lineId: cr.id, at: now }; G.trafficEchoes[rg.chain[1]] = { lineId: rg.id, at: now };
    G.spottedLegs = G.spottedLegs || []; G.spottedLegs.push({ id: 'tl-a', lineId: rg.id, from: rg.chain[2], to: rg.chain[3], npc: true, at: now, pseudo: 'Convoi', cargo: 'moyen' }, { id: 'tl-b', lineId: rg.id, from: rg.chain[5], to: rg.chain[6], npc: true, at: now, pseudo: 'Convoi', cargo: 'moyen' });
    G.fleet.prepared.push({ id: 'fl-jalon', name: 'Vigie', composition: { fregate: { t1: 2, t2: 0, t3: 0 }, cuirasse: { t1: 0, t2: 0, t3: 0 }, tanker: { t1: 0, t2: 0, t3: 0 } }, soldiers: { garde: 0, lourd: 0 }, status: 'in_mission', world: 'home', missionStartedAt: now - 4 * 3600e3,
      ambush: { system: cr.chain[2], phase: 'posted', world: 'home', departedAt: now - 4 * 3600e3, arrivesAt: now - 3.5 * 3600e3, postedAt: now - 3.5 * 3600e3, npcAt: now, hold: {}, orders: { mode: 'manual', players: false } } });
    G.antenna = Object.assign(G.antenna || {}, { built: true, building: false });
    saveGame();
    return { mode: net.mode, cr: cr.chain, crId: cr.id, rg: rg.chain, rgId: rg.id, gl: gl.chain, ports: Object.keys(G.hiddenPorts).sort(), routes: (G.routes || []).map(r => r.id).sort(), mig: SBZones.migrated() };
  });
  await p.evaluate(() => sessionStorage.setItem('sb_mig_go', '1'));
  await p.reload({ waitUntil: 'load' });
  let wl = null; for (let i = 0; i < 40 && !wl; i++) { await sleep(500); wl = await p.evaluate(() => { const o = document.getElementById('sb-modal-overlay'); return o && !o.classList.contains('hidden') ? { title: document.getElementById('sb-modal-title').textContent, body: document.getElementById('sb-modal-body').innerText.replace(/\s+/g, ' '), ok: document.getElementById('sb-modal-confirm').textContent } : null; }).catch(() => null); }
  await p.screenshot({ path: path.join(SHOTS, '0c_fiche_accueil.png') });
  await p.evaluate(() => { try { sbModalResolve(false); } catch (e) {} });
  const c = await p.evaluate((cr) => {
    const A = G.atlasCarte || {}, b = Object.fromEntries(sbAllProbes().filter(x => x.tier === 'beacon').map(x => [x.id, x.state === 'deployed' ? x.deployedSystem : 'hangar']));
    const f = G.fleet.prepared.find(x => x.id === 'fl-jalon'), a = f && f.ambush, now = Date.now(); if (a) { a.npcAt = now - 3 * 3600e3; }
    const line = SBLines.network().lines.find(l => l.id === cr), before = JSON.stringify((G.lineObs || {})[line.id] || {});
    SBLines.tickAmbushes(now); const ob = (G.lineObs || {})[line.id] || {};
    return { mode: SBLines.network().mode, b, echoes: Object.fromEntries(Object.entries(G.trafficEchoes || {}).map(([k, e]) => [k, e.lineId])), legs: (G.spottedLegs || []).filter(l => l.npc).map(l => l.lineId + ':' + l.from + '>' + l.to),
      ports: Object.keys(G.hiddenPorts || {}).sort(), routes: (G.routes || []).map(r => r.id).sort(), bilan: A.bilan, legacy: (A.legacy5 || []).map(x => x.name + '@' + x.sys), copie: !!A.copie5, accueil: A.accueil, mode5: A.mode,
      amb: a && a.system, seen: Object.keys(ob).filter(k => k.endsWith('@' + (a && a.system))).length, changed: JSON.stringify(ob) !== before };
  }, set.crId);
  const R7 = 'A-M-1979', J2 = 'A-N-7586', R8 = 'A-K-5365', R9 = 'A-K-0757', R10 = 'A-L-7382', R2 = 'A-N-7595';
  rec('CONV-BALISES', set.mode === 'old' && c.mode === 'cor' && c.b['b-cr'] === 'hangar' && c.b['b-rg6'] === R8 && c.b['b-rg5'] === J2 && c.b['b-rg0'] === 'hangar' && c.b['b-gl'] === R2,
    `avant ${set.mode}, après ${c.mode} · Couronne (port inconnu, un seul relais) : jalon 4/${set.cr.length} → ${c.b['b-cr']} · Regard (port inconnu) : 7/8 → ${c.b['b-rg6']} (R9 sous 1000 : relais d'avant), 6/8 → ${c.b['b-rg5']}, 1/8 → ${c.b['b-rg0']} (plus de relais libre) · Glaces (port connu) : ${set.gl.length}/${set.gl.length} → ${c.b['b-gl']} (R2)`);
  rec('CONV-SIGNAUX', c.echoes[R7] === set.crId && c.echoes[J2] === set.rgId && !c.echoes[set.cr[0]] && !c.echoes[set.rg[1]],
    `signal de la Couronne → R7 (${c.echoes[R7] ? 'oui' : 'non'}), signal du Regard 2/8 → J2 (${c.echoes[J2] ? 'oui' : 'non'}), anciens jalons libérés`);
  const rgLegs = c.legs.filter(x => x.startsWith(set.rgId + ':') && !set.rg.some(k => x.includes(':' + k + '>'))), toPort = c.legs.filter(x => x.endsWith('>A-L-8388') || x.endsWith('>A-M-3340'));
  rec('CONV-SAVOIR', rgLegs.includes(set.rgId + ':' + R8 + '>' + R9) && rgLegs.includes(set.rgId + ':' + R9 + '>' + R10) && !toPort.length,
    `tronçons du Regard 3→4 et 6→7 sur 8 → ${rgLegs.join(', ')} ; aucun tronçon vers un port inconnu (${toPort.length})`);
  rec('CONV-PORTS', JSON.stringify(c.ports) === JSON.stringify(set.ports) && JSON.stringify(c.routes) === JSON.stringify(set.routes) && c.copie,
    `ports connus ${JSON.stringify(c.ports)} (avant ${JSON.stringify(set.ports)}), routes ${c.routes.length} (avant ${set.routes.length}) : aucun port donné · copie gardée ${c.copie}`);
  rec('CONV-EMBUSCADE', c.amb === set.cr[2] && c.legacy.includes('Vigie@' + set.cr[2]) && c.seen >= 1 && c.changed,
    `Vigie reste sur l'ancien jalon ${c.amb} et y voit les convois PNJ comme avant : ${c.seen} relevé(s) à ce jalon`);
  rec('ACCUEIL', wl && wl.title === 'Nouvelle carte' && /3 balises posées sur des relais/.test(wl.body) && /2 balises rentrées au hangar/.test(wl.body) && /Vigie reste en embuscade/.test(wl.body) && /aucun port n’a été donné/.test(wl.body) && /Ancienne carte|ancienne carte/.test(wl.body) && wl.ok === 'Voir la carte' && c.mode5 === 'generale' && c.accueil > 0,
    `fiche « ${wl && wl.title} » : ${wl && wl.body.slice(0, 260)}… [${wl && wl.ok}]`);
  await p.evaluate(() => saveGame()); await p.reload({ waitUntil: 'load' }); await sleep(6000);
  const again = await p.evaluate(() => !document.getElementById('sb-modal-overlay').classList.contains('hidden'));
  rec('ACCUEIL-1X', !again, `après rechargement, la fiche ne revient pas (${again})`);
  await ctx.close();
}

// ═══ 2. Sondage d'une zone (univers ouvert), mondes, rechargement ═══
const ctx = await browser.newContext(iphone); let p = await ctx.newPage(); watch(p, '[test]');
const base = `http://127.0.0.1:${port}/`;
await newGame(p, base, 'OPUS-ONE');
// une colonie OPUS-SCND dans le même secteur (partie locale : l'adresse est celle de cette partie, pas celle du serveur)
const home = await p.evaluate(() => {
  const a = MY_ADDRESS, sys = ((a.system + 137 - 1000) % 9000) + 1000, coord = `${a.cluster}-${a.sector}-${String(sys).padStart(4, '0')}-12`;
  sbFoundColony({ name: 'OPUS-SCND', coord }); G.probesPool.push({ id: 'p-t-r4', tier: 'radar', state: 'ready', builtAt: Date.now() });
  G.antenna = Object.assign(G.antenna || {}, { built: true, building: false });   // le Centre de prospection s'ouvre avec l'antenne (règle du jeu)
  saveGame(); return { home: `${a.cluster}-${a.sector}-${a.system}-${a.planet}`, colony: coord, worlds: G.worlds.map(w => w.id + ':' + w.name) };
});
await sleep(2500);
// le joueur connaît les six stations du réseau (ses routes y mènent) : corridors, itinéraires et modèles des stations plus bas
await p.evaluate(() => { for (const l of SBLines.network().lines) if (l.corridor) SBLines.revealLine(l, Date.now(), l.kind && l.kind.label); saveGame(); });
const btn = await p.evaluate(() => ({ allowed: SBZones.allowed(), mig: SBZones.migrated(), btn: !!document.getElementById('sb-zones-btn'), cor: SBZones.state().corKnown }));
rec('CARTE2', btn.allowed && btn.mig && !btn.btn && btn.cor.length === 6, `partie migrée ${btn.mig}, aucun bouton d'essai (${btn.btn}), corridors connus ${JSON.stringify(btn.cor)} · mondes ${home.worlds.join(', ')}`);
await p.evaluate(() => SBZones.open());
const frameReady = async () => { for (let i = 0; i < 80; i++) { const f = p.frames().find(f => f.url().includes('atlas/index.html')); if (f) { const ok = await f.evaluate(() => !!(window.STARBYTE_ZONES && STARBYTE_ZONES.zj.snap)).catch(() => false); if (ok) return f; } await sleep(500); } return null; };
let F = await frameReady();
await sleep(3500);
const reg = await p.evaluate(() => ({ region: !!(G.zoneProspect && G.zoneProspect.region), journal: ((G.zoneProspect && G.zoneProspect.journal) || []).length }));
rec('SANS-RÉGION', !reg.region && reg.journal === 0, `aucune région d'essai créée (${reg.region}), aucun journal de mesures (${reg.journal}) : l'univers est ouvert`);
await p.screenshot({ path: path.join(SHOTS, '1_ouverture.png') });

// un sondage : la zone « commun » à portée la plus proche de la capitale (contenu tiré de son identifiant, le même pour tous)
let target = null;
for (let t = 0; t < 20 && !target; t++) { await sleep(500); target = await F.evaluate(() => { const S = STARBYTE_ZONES, id = S.openZoneNear(true, 'commun'); if (!id) return null; const c = S.zoneContent(id); return c && /^[A-Z]-[A-Z]-\d{4}$/.test(c.sys || '') ? { id, kind: c.kind, sys: c.sys, k: +id.split(':')[3] } : null; }); }
await F.evaluate((id) => STARBYTE_ZONES.selectZone(id), target.id); await sleep(400);
const fiche = await F.evaluate(() => ({ body: document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' '), foot: document.getElementById('zj-sh-foot').innerText.replace(/\s+/g, ' '), btns: document.querySelectorAll('#zj-sh-foot button').length }));
rec('FICHE', /Non sondée/.test(fiche.body) && /Durée/.test(fiche.body) && /Coût/.test(fiche.body) && /Sonder cette zone/.test(fiche.foot) && fiche.btns >= 1 && !/région de test/.test(fiche.body), `« ${fiche.body.slice(0, 150)} » · bouton : ${fiche.foot}`);
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
// 12/11 (Adrien, 10 h 12) : « quand je touche dans le vide ça devrait sélectionner quelque chose quand même » → la zone sous le doigt
const empty = await F.evaluate(() => { STARBYTE_ZONES.atlasTap(5, 300); const s = STARBYTE_ZONES.zj.sel; return s && { type: s.type, zone: s.zone }; });
rec('VIDE', empty && empty.type === 'zone' && !!empty.zone && closeTap.keep === 'station' && closeTap.lvl === 'neighbourhood', `Atlas, toucher le vide : en gros plan la cible reste (${closeTap.keep}) ; après « Retour au voisinage » (${closeTap.lvl}), la zone sous le doigt est choisie (${empty && empty.zone}), jamais une étoile seule`);

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
await p.reload({ waitUntil: 'load' }); await sleep(5000);
const re = await p.evaluate((id) => ({ region: !!G.zoneProspect.region, st: G.zoneProspect.zones[id] && G.zoneProspect.zones[id].st, sigs: Object.values(G.signatures).filter(s => s.zone).length, mig: SBZones.migrated() }), target.id);
rec('RECHARGE', !re.region && re.mig && re.st === 'done' && re.sigs === 1, `après rechargement : toujours sur la nouvelle carte ${re.mig}, pas de région ${!re.region}, zone ${re.st}, ${re.sigs} signature de zone (pas de doublon)`);
await p.evaluate(() => SBZones.open()); F = await frameReady(); await sleep(2500);
const re2 = await F.evaluate((id) => { STARBYTE_ZONES.selectZone(id); return document.getElementById('zj-sh-body').innerText.replace(/\s+/g, ' ').slice(0, 80); }, target.id);
rec('RECHARGE2', /Sondée/.test(re2), `la carte rouverte montre la zone : « ${re2} »`);
await p.screenshot({ path: path.join(SHOTS, '8_apres_rechargement.png') });

// ═══ 3. Outils d'essai retirés (14/11) : plus de lecture d'une autre partie, plus de fichier exporté, plus de mention TEST ═══
{ await p.evaluate(() => SBZones.open()); F = await frameReady(); await sleep(2000);
  const o = await F.evaluate(() => { document.getElementById('zj-worlds').click(); const t = document.body.innerText; return { peekIn: !!document.getElementById('zj-peek-in'), voir: /Voir la partie/.test(t), head: document.querySelector('#zj-sh-head .zj-test').textContent, test: /\bTEST\b|compte de test|région de test|· essai|Panzerstorm/i.test(t), title: document.title, api: ['peekStart', 'exportHtml'].filter(k => k in STARBYTE_ZONES) }; });
  const g = await p.evaluate(() => ({ peek: 'peek' in SBZones, region: 'saveRegion' in SBZones, btn: !!document.getElementById('sb-zones-btn') }));
  rec('OUTILS', !o.peekIn && !o.voir && o.head === 'MA CARTE' && !o.test && o.title === 'Starbyte · Carte' && !o.api.length && !g.peek && !g.region && !g.btn,
    `« Mes mondes » sans « Voir la partie d’un commandant » (${!o.voir}), tête de fiche « ${o.head} », titre « ${o.title} », aucune mention d'essai (${!o.test}), fonctions retirées : lecture ${!g.peek}, région ${!g.region}, export ${!o.api.length}`);
  await F.evaluate(() => STARBYTE_ZONES.open && 0); }

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
rec('FOLLOW-T', fit.F.susp && fit.d > fit.L * .4, `Voir le trajet : vue de ${fit.d.toFixed(0)} u pour un tracé de ${fit.L.toFixed(0)} u, suivi suspendu (la mission continue)`);
// arrière-plan : au retour, la position se recale sur les horaires de la partie
// (environnement lent : on garde au tanker au moins 4 min de trajet, pour que le saut de 40 % ne le fasse pas arriver)
await p.evaluate(id => { const m = G.tankerMissions.find(x => x.id === id); if (m && m.status === 'in_transit') { const now = Date.now(), d = now - m.departedAt; if (m.arrivalAt - now < 240000) m.arrivalAt = now + Math.max(240000, d); } }, tk.id);
await F.evaluate(() => STARBYTE_ZONES.refresh(true)); await sleep(400);
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
// 12/11 (retour d'Adrien) : toucher le tracé de la mission en Tactique garde la mission ; avant, la zone dessous était choisie
const lineTap = kind => F.evaluate(async kind => { const S = STARBYTE_ZONES, zj = S.zj, W = innerWidth, H = innerHeight, mine = () => (zj.lines || []).filter(l => l.o.type === kind);
  const tryTap = () => { for (const l of mine()) for (const u of [.5, .3, .7, .15, .85, .05, .95]) { const x = l.x1 + (l.x2 - l.x1) * u, y = l.y1 + (l.y2 - l.y1) * u; if (x < 30 || x > W - 30 || y < 150 || y > H - 260) continue; const pk = S.pick(x, y); if (pk.chip || pk.list.length) continue;
    S.tap(x, y); return { x: Math.round(x), y: Math.round(y), sel: zj.sel && zj.sel.type, id: zj.sel && zj.sel.id, kind: (document.querySelector('#zj-sh-body .zj-kind') || {}).textContent, n: mine().length }; } return null; };
  let r = tryTap(); if (r) return r;
  // aucun tracé dans la partie visible de la carte : on le ramène au milieu (comme le ferait un glissé), puis on touche
  const l = mine()[0]; if (!l) return { n: 0 }; if (zj.follow && zj.follow.on) zj.follow.susp = true;
  zj.cx += ((l.x1 + l.x2) / 2 - W / 2) * zj.upp; zj.cz += ((l.y1 + l.y2) / 2 - H * .4) * zj.upp; zj.dirty = true; await new Promise(res => setTimeout(res, 900));
  return tryTap() || { n: mine().length }; }, kind);
const rt1 = await lineTap('travel'); await sleep(300);
rec('ROUTE-01', rt1.sel === 'travel' && rt1.id === 'tk:' + tk.id, `tracé de la mission en Tactique (${rt1.n} segments touchables) : toucher (${rt1.x}, ${rt1.y}), loin du repère → fiche ${rt1.sel} ${rt1.id || ''} (« ${rt1.kind || ''} »), pas la zone dessous`);
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
  return { out, net: S.corState().net, par: S.corParams(), origin: S.zj.cor.ctx && S.zj.cor.ctx.O.key }; });
let c3 = true, c4 = true, c5 = true, c3n = 0, wins = 0, ex = null;
for (const r of cor.out) { const d = r.plans[0]; for (const x of r.plans) {
  const sumL = x.legs.reduce((a, l) => a + l.len, 0), sumM = x.legs.reduce((a, l) => a + l.min, 0); if (Math.abs(sumL - x.len) > .01 || Math.abs(sumM - x.min) > 1e-6 || Math.abs(x.test - Math.max(x.min, cor.par.Lmin / cor.par.v) / cor.par.season) > 1e-6) c3 = false;   // un seul devis : toutes les phases comptées
  for (let i = 1; i < x.legs.length; i++) { const a = x.legs[i - 1], b = x.legs[i]; if (a.b !== b.a || Math.hypot(a.p1[0] - b.p0[0], a.p1[1] - b.p0[1], a.p1[2] - b.p0[2]) > .01) c5 = false; }   // les phases s'enchaînent sur des nœuds officiels
  if (x.k === 'cor') { c3n++; const L0 = x.legs[0], Ln = x.legs[x.legs.length - 1]; if (L0.t !== 'free' && L0.a !== '@O') c3 = false; if (Ln.t !== 'free' && Math.hypot(Ln.p1[0] - r.D[0], Ln.p1[1] - r.D[1], Ln.p1[2] - r.D[2]) > .01) c3 = false; if (x.min < d.min) wins++; if (!ex) ex = { k: r.k, x, d }; }
  for (const l of x.legs) if (l.t === 'cor' && !(l.len >= Math.hypot(l.p1[0] - l.p0[0], l.p1[1] - l.p0[1], l.p1[2] - l.p0[2]) - 1e-6)) c4 = false; } }
rec('COR-03', c3 && c3n > 0, `${cor.out.length} ports comparés depuis la capitale, ${c3n} itinéraires par corridors : accès en vol libre, corridors, sortie en vol libre (nulle quand le port est sur le réseau), un seul devis (longueur, durée, carburant = somme des phases)${ex ? ' · ex. ' + ex.k + ' : ' + ex.x.legs.map(l => (l.t === 'cor' ? l.e : 'libre') + ' ' + l.len.toFixed(0)).join(' → ') + ' u, ' + ex.x.test.toFixed(1) + ' min d’essai contre ' + ex.d.test.toFixed(1) + ' en direct' : ''}`);
{ let par = true, n = 0, worst = 0; const sig = legs => legs.map(l => l.a + '>' + l.b + (l.e ? ':' + l.e : '')).join('|');
  for (const r of cor.out) { const o = V.voyageOptions(cor.origin, r.k, 1, null); for (const k of ['libre', 'cor']) { const a = r.plans.find(x => x.k === k), b = o.plans.find(x => x.k === k); if (!a && !b) continue; if (!a || !b) { par = false; continue; } n++;
    worst = Math.max(worst, Math.abs(a.len - b.len), Math.abs(a.test - b.test)); if (Math.abs(a.len - b.len) > 1e-6 || Math.abs(a.test - b.test) > 1e-9 || a.fuel !== b.fuel || sig(a.legs) !== sig(b.legs) || a.best !== b.best) par = false; } }
  rec('COR-PARITE', par && n >= 6, `${n} itinéraires depuis ${cor.origin} : l'Atlas et le module du serveur donnent la même longueur, la même durée, le même carburant et les mêmes tronçons (écart maximal ${worst.toExponential(1)})`); }
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
const rt2 = await lineTap('seg'); await sleep(400);
await p.screenshot({ path: path.join(SHOTS, '19b_troncon_touche.png') });
rec('ROUTE-02', rt2.sel === 'seg' && /TRONÇON/.test(rt2.kind || ''), `corridors connus affichés (${rt2.n} segments touchables) : toucher un corridor en (${rt2.x}, ${rt2.y}) → fiche « ${rt2.kind || ''} » (${rt2.id || ''}), pas la zone dessous`);
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
