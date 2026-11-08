#!/usr/bin/env node
// Joue une session de match-3 complète en Chromium sans écran : partie neuve, mine posée en mémoire, coups
// valides pris dans board.moves() jusqu'à la fin, puis vérifie que la session se termine et crédite des ressources.
//   node tools/parcours_m3.mjs [--dir github_upload] [--seed N] [--serveur]
// --serveur (Temps B actif, simulé) : interrupteur m3_credit_on posé dans le cache local et serveur factice (routes
// interceptées) qui répond un crédit différent du calcul du jeu : ce sont les stocks du serveur qui doivent être encaissés.
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url)); const args = process.argv.slice(2);
const DIR = path.resolve(args.includes('--dir') ? args[args.indexOf('--dir') + 1] : path.join(here, '..', 'github_upload'));
const SEED = Number(args.includes('--seed') ? args[args.indexOf('--seed') + 1] : 7);
const SERVEUR = args.includes('--serveur');
const FAKE_CREDIT = { metal: 123, cristal: 45 };   // ce que le « serveur » factice répond en mode --serveur
const port = 8800 + Math.floor(Math.random() * 100);
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(seed => { let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, SEED);
const rpcCalls = [];
if (SERVEUR) {
  // session factice bien formée (sinon le module cloud la jette au démarrage) + interrupteur dans le cache local
  const user = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@starbyte.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  await p.addInitScript((user) => { localStorage.setItem('sb_settings', JSON.stringify({ m3_credit_on: true, ledger_on: true, at: Date.now() })); localStorage.setItem('starbyte_auth', JSON.stringify({ access_token: 'faux-jeton-de-test', refresh_token: 'faux', token_type: 'bearer', expires_in: 31536000, expires_at: Math.floor(Date.now() / 1000) + 31536000, user })); }, user);
  await p.route(/supabase\.co\//, (route, req) => {
    const u = req.url(); let body = '{}';
    if (/auth\/v1\/user/.test(u)) body = JSON.stringify(user);
    else if (/functions\/v1\/m3-verify/.test(u)) { rpcCalls.push('m3-verify'); body = JSON.stringify({ verified: 1, mismatches: 1, session: { id: 42, verified: true, credit: FAKE_CREDIT, mismatch: true, error: null } }); }
    else if (/rest\/v1\/rpc\/(\w+)/.test(u)) { const fn = u.match(/rpc\/(\w+)/)[1]; rpcCalls.push(fn); body = fn === 'sb_ledger' ? JSON.stringify({ ok: true, m3_credit_on: true }) : fn === 'sb_settings_get' ? JSON.stringify({ m3_credit_on: true, ledger_on: true }) : fn === 'm3_report' ? '42' : '[]'; }
    else if (/rest\/v1\//.test(u)) body = '[]';
    route.fulfill({ status: 200, contentType: 'application/json', body });
  });
}
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(2500);
await p.evaluate(() => confirmWelcome()); await p.waitForTimeout(1200);
const r = await p.evaluate(async () => {
  const idx = G.planet.parcels.findIndex(x => x && !x.building); Object.assign(G.planet.parcels[idx], { building: 'mine', state: 'built', lvl: 1 });
  const before = Object.fromEntries(Object.entries(G.res).map(([k, r]) => [k, r.v]));
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
  // Temps B : grand livre — la variation 'm3' doit être notée avec la graine ; en mode serveur, on attend la réponse
  let ledger = null, panelNote = '';
  if (window.SBLedger) {
    for (let i = 0; i < 60 && document.querySelector('.m3v2-srv') && /Vérification/.test(document.querySelector('.m3v2-srv').textContent); i++) await sleep(200);
    const srv = document.querySelector('.m3v2-srv'); panelNote = srv ? srv.textContent : '';
    const st = SBLedger.status();
    ledger = { m3: st.pending.filter(e => /^m3/.test(e.r)).map(e => ({ k: e.k, d: e.d, r: e.r, ref: e.ref })), hooked: st.hooked, watched: st.watched, snapHome: SBLedger.snapshot()[G.activeWorld || 'home'] };
  }
  const back = document.querySelector('[data-a="back"]'); if (back) back.click();
  await sleep(300);
  const after = Object.fromEntries(Object.entries(G.res).map(([k, r]) => [k, r.v]));
  return { ledger, panelNote, moves: n, ended: !!(s && s.ended), reason: res && res.reason, tier: s && s.tier, total: s && Math.floor(s.total), credit: res && res.credit, before, after, last: log.slice(-3), parcel: G.planet.parcels[idx].state, successCount: G.planet.parcels[idx].successCount || 0, rep, queue: JSON.parse(localStorage.getItem('sb_m3_queue') || '[]').length };
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
// Grand livre : chaque ressource créditée doit avoir sa ligne 'm3' (ou 'm3srv') avec la graine, du bon montant
let ledgerOk = null, ledgerInfo = 'pas de grand livre';
if (r.ledger) {
  const expected = SERVEUR ? FAKE_CREDIT : (r.credit || {});
  const gained = {}; for (const k of Object.keys(r.after)) if (r.after[k] !== r.before[k]) gained[k] = Math.round(r.after[k] - r.before[k]);
  const lines = {}; for (const e of r.ledger.m3) lines[e.k] = (lines[e.k] || 0) + Math.round(e.d);
  const wantReason = SERVEUR ? 'm3srv' : 'm3';
  ledgerOk = r.ledger.hooked >= 30 && r.ledger.watched >= 5 && r.ledger.m3.length > 0
    && r.ledger.m3.every(e => e.r === wantReason && e.ref === 'seed:' + r.rep.seed)
    && Object.keys(expected).every(k => (gained[k] || 0) === (lines[k] || 0) && (gained[k] || 0) === Math.min(expected[k], gained[k] || expected[k]))
    && (!SERVEUR || /validé par le serveur/.test(r.panelNote));
  ledgerInfo = `${r.ledger.hooked} fonctions à motif · ${r.ledger.watched} stocks surveillés · lignes ${JSON.stringify(lines)} · gains réels ${JSON.stringify(gained)}${SERVEUR ? ` · attendu du serveur ${JSON.stringify(expected)} · panneau « ${r.panelNote} » · appels ${rpcCalls.join(',')}` : ''}`;
}
const ok = r.ended && errs.length === 0 && r.moves > 0 && replayOk !== false && ledgerOk !== false;
console.log(`Match-3 ${ok ? 'OK' : 'ÉCHEC'} (${DIR}) · ${r.moves} coups · fin « ${r.reason} » · palier ${r.tier} · total ${r.total} · crédit ${JSON.stringify(r.credit)} · stocks ${JSON.stringify(r.before)} → ${JSON.stringify(r.after)} · parcelle ${r.parcel} ×${r.successCount}`);
if (r.rep) console.log(`  journal : graine ${r.rep.seed} (${r.rep.seedSrc}) · ${r.rep.log.length} événements · annoncé base ${JSON.stringify(r.rep.base)} · ${replayInfo} · ${replayOk ? 'IDENTIQUE' : 'ÉCART'} · file d'envoi : ${r.queue}`);
console.log(`  grand livre : ${ledgerOk === null ? '—' : ledgerOk ? 'OK' : 'ÉCHEC'} · ${ledgerInfo}`);
if (errs.length) console.log('  EXCEPTIONS :', errs.slice(0, 5));
process.exit(ok ? 0 : 1);
