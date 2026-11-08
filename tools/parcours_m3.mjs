#!/usr/bin/env node
// Joue une session de match-3 complète en Chromium sans écran : partie neuve, mine posée en mémoire, coups
// valides pris dans board.moves() jusqu'à la fin, puis vérifie que la session se termine et crédite des ressources.
//   node tools/parcours_m3.mjs [--dir github_upload] [--seed N]
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url)); const args = process.argv.slice(2);
const DIR = path.resolve(args.includes('--dir') ? args[args.indexOf('--dir') + 1] : path.join(here, '..', 'github_upload'));
const SEED = Number(args.includes('--seed') ? args[args.indexOf('--seed') + 1] : 7);
const port = 8800 + Math.floor(Math.random() * 100);
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(seed => { let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, SEED);
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(2500);
await p.evaluate(() => confirmWelcome()); await p.waitForTimeout(1200);
const r = await p.evaluate(async () => {
  const idx = G.planet.parcels.findIndex(x => x && !x.building); Object.assign(G.planet.parcels[idx], { building: 'mine', state: 'built', lvl: 1 });
  const before = { metal: G.res.metal.v, energie: G.res.energie.v, cristal: G.res.cristal.v };
  startM3(idx, 'Mine'); const M = window.SBMatch3; let n = 0; const log = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(600);
  while (M.s && !M.s.ended && n < 40) {
    if (M.s.busy) { await sleep(50); continue; }
    const mv = M.s.board.moves(); if (!mv.length) { log.push('aucun coup'); break; }
    const [a, c] = mv[0]; await M.trySwap(a, c); n++;
    log.push(`${n}: total=${Math.floor(M.s.total)} coups=${M.s.movesLeft} palier=${M.s.tier}`);
    if (M.s.choiceShown && document.querySelector('[data-a="go"]')) document.querySelector('[data-a="go"]').click();
    await sleep(30);
  }
  await sleep(500);
  const s = M.s; const res = s && s.result;
  const rep = s ? { seed: s.seed, seedSrc: s.seedSrc, context: s.context, remine: s.remine, parcel: s.parcelIdx, log: s.log, reason: res && res.reason, base: res && res.base, skill: res && res.skillMults, claimed: res && res.credit } : null;
  const back = document.querySelector('[data-a="back"]'); if (back) back.click();
  await sleep(300);
  const after = { metal: G.res.metal.v, energie: G.res.energie.v, cristal: G.res.cristal.v };
  return { moves: n, ended: !!(s && s.ended), reason: res && res.reason, tier: s && s.tier, total: s && Math.floor(s.total), credit: res && res.credit, before, after, last: log.slice(-3), parcel: G.planet.parcels[idx].state, successCount: G.planet.parcels[idx].successCount || 0, rep, queue: JSON.parse(localStorage.getItem('sb_m3_queue') || '[]').length };
});
await b.close(); srv.kill();
// SERVEUR_0811 : le rejeu pur (src/m3session.js) doit retrouver exactement le crédit de base de l'interface
let replayOk = null, replayInfo = '';
if (r.rep && r.rep.seed) {
  try {
    const M3 = await import(path.join(here, '..', 'src', 'm3session.js'));
    const rr = M3.replay(r.rep);
    replayOk = !rr.error && JSON.stringify(rr.result.base) === JSON.stringify(r.rep.base) && rr.result.tier === r.tier;
    replayInfo = rr.error ? `erreur ${rr.error}` : `rejeu base ${JSON.stringify(rr.result.base)} (palier ${rr.result.tier}, ${rr.moves} coups, fin ${rr.reason})`;
  } catch (e) { replayOk = false; replayInfo = 'rejeu impossible : ' + e.message; }
}
const ok = r.ended && errs.length === 0 && r.moves > 0 && replayOk !== false;
console.log(`Match-3 ${ok ? 'OK' : 'ÉCHEC'} (${DIR}) · ${r.moves} coups · fin « ${r.reason} » · palier ${r.tier} · total ${r.total} · crédit ${JSON.stringify(r.credit)} · stocks ${JSON.stringify(r.before)} → ${JSON.stringify(r.after)} · parcelle ${r.parcel} ×${r.successCount}`);
if (r.rep) console.log(`  journal : graine ${r.rep.seed} (${r.rep.seedSrc}) · ${r.rep.log.length} événements · annoncé base ${JSON.stringify(r.rep.base)} · ${replayInfo} · ${replayOk ? 'IDENTIQUE' : 'ÉCART'} · file d'envoi : ${r.queue}`);
if (errs.length) console.log('  EXCEPTIONS :', errs.slice(0, 5));
process.exit(ok ? 0 : 1);
