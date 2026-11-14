#!/usr/bin/env node
// Rejoue la migration de la carte sur des copies de vraies parties, hors ligne, dans le vrai jeu (Chromium sans écran, iPhone émulé).
// Aucune partie n'est dans le dépôt : le dossier des copies est donné en argument, le rapport va dans un dossier donné.
//   node tools/migration_replay.mjs <dossier contenant saves.0.json> <dossier du rapport> [--only=uid1,uid2] [--quick]
// Pour chaque partie :
//   « avant »  : la partie chargée avec la nouvelle carte coupée (SB_ZONES_OFF) — ce que le joueur a aujourd'hui ;
//   « après »  : la partie chargée normalement, Centre de prospection ouvert (la migration et ses conversions passent) ;
// puis un résumé de chaque état (balises, embuscades, routes, missions, rapports, mondes, ressources…) et les contrôles de la carte.
// Le réseau est coupé : rien ne part vers Supabase.
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '..', 'github_upload');
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const [SRC, OUT] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!SRC || !OUT) { console.error('usage : node tools/migration_replay.mjs <dossier des copies> <dossier du rapport> [--only=…] [--quick]'); process.exit(2); }
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const QUICK = process.argv.includes('--quick');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gz': 'application/gzip', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const serve = () => new Promise(res => { const s = createServer(async (q, r) => { try { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(DIR, p); const st = await stat(f).catch(() => null); if (!st || !st.isFile()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(await readFile(f)); } catch (e) { r.writeHead(500); r.end(); } }); s.listen(0, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const saves = JSON.parse(readFileSync(path.join(SRC, 'saves.0.json'), 'utf8'));
let worlds = []; try { worlds = JSON.parse(readFileSync(path.join(SRC, 'worlds.0.json'), 'utf8')); } catch (e) {}
const pseudoOf = Object.fromEntries(worlds.map(w => [w.user_id, w.pseudo]));
await mkdir(OUT, { recursive: true });
const RES = path.join(OUT, 'replay.jsonl');
const srv = await serve(); const port = srv.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP play.test 127.0.0.1'] });
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-CH', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };

// résumé d'une partie, lu dans la page (mêmes fonctions que le jeu)
const SUMMARY = () => {
  const S = (x) => { try { return x(); } catch (e) { return '§' + String(e && e.message || e).slice(0, 80); } };
  const all = S(() => (typeof sbAllProbes === 'function' ? sbAllProbes() : G.probesPool || []));
  const fl = (G.fleet && G.fleet.prepared) || [];
  const net = S(() => window.SBLines ? SBLines.network() : null);
  const station = net && net.lines ? net.lines.filter(l => l.oldChain || l.corridor).map(l => ({ id: l.id, port: l.port, chain: l.chain, old: l.oldChain || null })) : [];
  return {
    keys: Object.keys(G).sort(), mode: net && net.mode, migrated: S(() => !!(window.SBZones && SBZones.migrated())), atlasCarte: G.atlasCarte ? JSON.parse(JSON.stringify(G.atlasCarte)) : null,
    planet: G.planet ? { name: G.planet.name, lvl: G.planet.level || null } : null, address: S(() => `${MY_ADDRESS.cluster}-${MY_ADDRESS.sector}-${String(MY_ADDRESS.system).padStart(4, '0')}-${String(MY_ADDRESS.planet).padStart(2, '0')}`),
    worlds: (G.worlds || []).map(w => w && (w.id + ':' + (w.coord || ''))), active: G.activeWorld || 'home',
    res: Object.fromEntries(Object.entries(G.res || {}).map(([k, v]) => [k, Math.floor((v && v.v) || 0)])), fuel: Math.floor(G.fuel || 0), credits: Math.floor(G.credits || 0),
    beacons: (all || []).filter(b => b && b.tier === 'beacon').map(b => ({ id: b.id, st: b.state, sys: b.deployedSystem || null, w: b.world || null })),
    probes: (all || []).filter(b => b && b.tier !== 'beacon').length,
    probeMissions: (G.probeMissions || []).map(m => m && ({ id: m.id, tier: m.tier, st: m.status, to: m.targetCoords || null, zone: m.zone || null })),
    fleets: fl.map(f => f && ({ id: f.id, st: f.status, amb: f.ambush ? { sys: f.ambush.system, edge: f.ambush.edge || null, ph: f.ambush.phase, chain: f.ambush.routeChain || null } : null, gar: f.garrison ? f.garrison.phase : null, raid: !!f.mpRaidId })),
    routes: (G.routes || []).map(r => r && ({ id: r.id, name: r.name, port: r.portSys || null, st: r.status || null, chain: r.chain || null })),
    legs: (G.spottedLegs || []).filter(l => l && l.npc).map(l => l.lineId + ':' + l.from + '>' + l.to),
    ports: Object.keys(G.hiddenPorts || {}).sort(), known: Object.keys(G.knownSystems || {}).length,
    tankers: (G.tankerMissions || []).map(m => m && ({ id: m.id, kind: m.kind || null, st: m.status, to: m.targetCoords || m.portSys || null, via: m.via || null })),
    sigs: Object.keys(G.signatures || {}).length, reports: { probe: (G.probeReports || []).length, beacon: (G.beaconReports || []).length, tanker: (G.tankerReports || []).length, ambient: (G.ambientReports || []).length, line: (G.lineObs && Object.keys(G.lineObs).length) || 0 },
    echoes: Object.keys(G.trafficEchoes || {}).sort(), sales: (G._mySales || []).length, opened: (G.openedRoutes || []).length, cards: (G.routeCards || []).length,
    relations: (G.mpRelations || []).length, alliance: !!(G.mpAlliance && (G.mpAlliance.alliance || G.mpAlliance.id)), cells: Object.keys(G.mapCells || {}).length,
    zp: G.zoneProspect ? { region: !!G.zoneProspect.region, zones: Object.keys(G.zoneProspect.zones || {}).length, journal: (G.zoneProspect.journal || []).length } : null,
    station, size: JSON.stringify(G).length,
  };
};

async function run(save, mode, lite) {
  const ctx = await browser.newContext(iphone);
  await ctx.route(/supabase\.co|googleapis|gstatic|jsdelivr|unpkg|cdnjs/, r => r.abort());
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push((String(e.message || e) + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')).slice(0, 400)));
  p.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to fetch|net::ERR|fonts\.g|cloud|ERR_|status of 404/i.test(m.text())) errs.push('console ' + m.text().slice(0, 240)); });
  await p.addInitScript(([sg, stores, off]) => {
    if (sessionStorage.getItem('__replay')) return; sessionStorage.setItem('__replay', '1');
    localStorage.clear(); localStorage.setItem('starbyte_savegame', sg);
    for (const [k, v] of Object.entries(stores || {})) if (v != null) localStorage.setItem(k, v);
    if (off) window.SB_ZONES_OFF = true; else localStorage.setItem('sb_atlas_pilote', '1');
  }, [JSON.stringify(save.data.savegame), save.data.stores || {}, mode === 'off']);
  if (mode === 'off') await p.addInitScript(() => { window.SB_ZONES_OFF = true; });
  const out = { mode, errs };
  try {
    await p.goto(`http://play.test:${port}/`, { waitUntil: 'load', timeout: 90000 });
    let ok = false; for (let i = 0; i < 60 && !ok; i++) { ok = await p.evaluate(() => typeof G !== 'undefined' && !!G && !!G.planet).catch(() => false); if (!ok) await sleep(500); }
    out.loaded = ok; if (!ok) { out.why = 'partie non chargée'; return out; }
    await sleep(2500);
    if (mode === 'off') {   // même parcours que « après » : le Centre de prospection ouvert (l'ancienne carte), même durée
      await p.evaluate(() => { try { if (typeof prospectLocked === 'function' && prospectLocked()) window.prospectLocked = () => false; goto('prospect'); } catch (e) {} });
      await sleep(QUICK ? 6000 : 9000);
    }
    if (mode === 'on') {
      for (let i = 0; i < 20; i++) { if (await p.evaluate(() => !!(window.SBZones && SBZones.migrated())).catch(() => false)) break; await sleep(500); }
      for (let i = 0; i < (lite ? 4 : 12); i++) { out.welcome = await p.evaluate(() => { const o = document.getElementById('sb-modal-overlay'); return o && !o.classList.contains('hidden') ? (document.getElementById('sb-modal-title').textContent + ' | ' + document.getElementById('sb-modal-body').textContent).slice(0, 1200) : null; }).catch(() => null); if (out.welcome) break; await sleep(500); }
      if (out.welcome) { if (!QUICK) await p.screenshot({ path: path.join(OUT, `accueil_${save.user_id.slice(0, 8)}.png`) }).catch(() => {}); await p.evaluate(() => { try { sbModalResolve(false); } catch (e) {} }); await sleep(300); }
      await p.evaluate(() => { try { goto('prospect'); } catch (e) {} });
      await sleep(1500);
      if (await p.evaluate(() => typeof getCurrentScreen === 'function' && getCurrentScreen() !== 'prospect').catch(() => false)) {
        // Centre de prospection pas encore ouvert (antenne à construire) : on l'ouvre pour l'essai seulement, sans rien enregistrer
        out.locked = true; await p.evaluate(() => { window.prospectLocked = () => false; try { goto('prospect'); } catch (e) {} }); await sleep(1500);
      }
      out.screen = await p.evaluate(() => ({ cur: typeof getCurrentScreen === 'function' ? getCurrentScreen() : null, wrap: !!document.getElementById('sb-atlas-wrap'), mig: !!(window.SBZones && SBZones.migrated()), tuto: !!(G.tuto && G.tuto.active), overlays: [...document.querySelectorAll('[class*=overlay].shown,[class*=modal].shown,.tuto-overlay')].map(e => e.id || e.className).slice(0, 5) })).catch(e => ({ err: String(e.message || e) }));
      let F = null;
      for (let i = 0; i < 90 && !F; i++) {
        if (i === 10 && !(await p.evaluate(() => !!document.getElementById('sb-atlas-wrap')).catch(() => false))) break; const f = p.frames().find(f => /atlas\/index\.html.*in=jeu/.test(f.url())); if (f && await f.evaluate(() => !!(window.STARBYTE_ZONES && STARBYTE_ZONES.ready && STARBYTE_ZONES.ready())).catch(() => false)) F = f; else await sleep(500); }
      out.frame = !!F;
      if (F) {
        for (let i = 0; i < 30; i++) { if (await p.evaluate(() => !!(G.atlasCarte && G.atlasCarte.etapes && G.atlasCarte.etapes.balises)).catch(() => false)) break; await sleep(500); }
        await sleep(lite ? 600 : QUICK ? 1500 : 4000);
        out.map = await F.evaluate(() => { const Z = STARBYTE_ZONES, zj = Z.zj, s = zj.snap || {}; const sheet = document.getElementById('zj-sh-body'); const blk = document.getElementById('zj-block');
          return { ws: zj.ws.map(w => w.kind + ':' + w.coord + ':' + (w.p ? w.p.map(Math.round).join('/') : 'x')), home: !!(zj.ws.find(w => w.kind === 'home')), objs: (zj.objs || []).length, travels: (zj.tr || []).length, cmd: (s.cmd || []).length, ports: (s.ports || []).length, systems: (s.systems || []).length, cor: (s.corKnown || []), beacons: s.beacons ? s.beacons.list.length : null, moves5: (s.moves5 || []).length,
            block: blk && !blk.hidden ? blk.textContent.slice(0, 200) : null, sheet: sheet ? sheet.textContent.slice(0, 400) : '', test: /\bTEST\b|essai|compte de test|Panzerstorm|région de test/i.test(document.body.innerText) }; }).catch(e => ({ err: String(e.message || e).slice(0, 200) }));
        if (!QUICK) await p.screenshot({ path: path.join(OUT, `carte_${save.user_id.slice(0, 8)}.png`) }).catch(() => {});
      }
    }
    out.sum = await p.evaluate(SUMMARY);
  } catch (e) { out.why = String(e.message || e).slice(0, 300); }
  finally { await ctx.close(); }
  return out;
}

const list = saves.filter(s => !ONLY.length || ONLY.some(u => s.user_id.startsWith(u)));
// une partie « simple » (compte neuf ou presque : rien à convertir) n'est rejouée qu'après migration, plus vite ; les autres avant et après
const isRich = (s) => { const g = s.data.savegame || {}; return JSON.stringify(g).length > 20000 || (g.routes || []).length || Object.keys(g.trafficEchoes || {}).length || (g.spottedLegs || []).length || ((g.fleet && g.fleet.prepared) || []).some(f => f && f.ambush); };
console.log(`${list.length} partie(s) · rapport : ${RES}`);
let n = 0;
for (const s of list) {
  n++;
  const t0 = Date.now();
  const rich = isRich(s) || process.argv.includes('--full');
  const before = rich ? await run(s, 'off') : { mode: 'off', skipped: true, errs: [] };
  const after = await run(s, 'on', !rich);
  const row = { uid: s.user_id.slice(0, 8), pseudo: pseudoOf[s.user_id] || null, updated: s.updated_at, rich, before, after, ms: Date.now() - t0 };
  await appendFile(RES, JSON.stringify(row) + '\n');
  const a = after.map || {};
  console.log(`${String(n).padStart(3)} ${row.uid} ${String(row.pseudo || '—').padEnd(14)} avant ${before.skipped ? '—' : before.loaded ? 'ok' : 'KO'} · après ${after.loaded ? 'ok' : 'KO'} carte ${after.frame ? 'ok' : 'KO'} · mondes ${(a.ws || []).length} · obj ${a.objs} · cmd ${a.cmd} · balises ${a.beacons} (déplacées ${a.moves5}) · erreurs ${before.errs.length}/${after.errs.length} · ${Math.round(row.ms / 1000)} s`);
}
await browser.close(); srv.close();
console.log('fini');
