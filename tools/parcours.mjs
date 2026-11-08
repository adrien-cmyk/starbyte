#!/usr/bin/env node
// Test de parcours automatique de Starbyte (Chromium sans écran).
// Sert github_upload/ en local, ouvre le jeu comme un iPhone, passe l'accueil et visite les écrans
// principaux ; relève les exceptions non rattrapées, les erreurs console et les écrans qui n'apparaissent pas.
// Sert de référence avant / après le découpage du monolithe : même parcours, même rapport.
//
//   node tools/parcours.mjs                 → rapport lisible + tools/parcours.last.json
//   node tools/parcours.mjs --json          → JSON seul
//   node tools/parcours.mjs --dir chemin    → autre dossier que github_upload
//   CHROME=/chemin/chrome node tools/parcours.mjs
//
// Dépendances : playwright (global ou local) et un Chrome/Chromium (CHROME, sinon /usr/bin/google-chrome).

import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = path.resolve(argv('--dir', path.join(here, '..', 'github_upload')));
const JSON_ONLY = args.includes('--json');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function serve(dir) {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const file = path.join(dir, p);
        if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
        const st = await stat(file).catch(() => null);
        if (!st || !st.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(await readFile(file));
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// Écrans visités après l'accueil : [nom goto, id d'écran attendu]. Les écrans verrouillés en début de partie
// (prospection sans antenne, chantier sans chantier orbital) redirigent vers la planète : c'est attendu.
const SCREENS = [
  ['planet', 'scr-planet'], ['fleet', 'scr-fleet'], ['defense', 'scr-defense'], ['commerce', 'scr-commerce'],
  ['capital', 'scr-capital'], ['resources', 'scr-resources'], ['reports', 'scr-reports'], ['tech-tree', 'scr-tech-tree'],
  ['prospect', null], ['shipyard', null], ['dashboard', 'scr-dashboard'], ['planet', 'scr-planet'],
];
// Globales dont l'absence signerait une coupe ratée (un échantillon de chaque zone).
const GLOBALS = ['G', 'goto', 'saveGame', 'toast', 'totalDefense', 'mpWorldSnapshot', 'mpFleetRegistry', 'mpLaunchRaid', 'startM3', 'confirmWelcome',
  'BUILDINGS', 'TECH_TREE', 'LEGEND_FRAGMENT_BANK', 'PNG_ILLUSTRATIONS', 'SBTuto', 'computeMissionFuelCost', 'launchRoutePost', 'cleanupOrphanModals'];

async function main() {
  const srv = await serve(DIR);
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const report = { dir: DIR, startedAt: new Date().toISOString(), pageErrors: [], consoleErrors: [], failedLocal: [], screens: [], globalsMissing: [], timings: {}, ok: false };
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-CH',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  page.on('pageerror', e => report.pageErrors.push(String(e && e.message || e).slice(0, 300)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/supabase|Failed to fetch|net::ERR|ERR_FAILED|fonts\.g|cloud/i.test(t)) return;   // réseau externe coupé en test : attendu
    report.consoleErrors.push(t.slice(0, 300));
  });
  page.on('requestfailed', r => { if (r.url().startsWith(base)) report.failedLocal.push(r.url().slice(base.length)); });
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) report.failedLocal.push(r.url().slice(base.length) + ' → ' + r.status()); });

  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'load', timeout: 90000 });
  report.timings.loadMs = Date.now() - t0;
  await page.waitForTimeout(2500);
  report.timings.nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize } : null; });
  report.timings.scripts = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script').length);

  report.globalsMissing = await page.evaluate(names => names.filter(n => { try { return eval('typeof ' + n) === 'undefined'; } catch { return true; } }), GLOBALS);
  report.globalFunctions = await page.evaluate(() => Object.getOwnPropertyNames(window).filter(k => { try { return typeof window[k] === 'function'; } catch { return false; } }).length);

  // Accueil : nouvelle partie
  const welcomed = await page.evaluate(() => { try { if (typeof confirmWelcome === 'function') { confirmWelcome(); return true; } } catch (e) { return 'erreur: ' + e.message; } return false; });
  report.welcome = welcomed;
  await page.waitForTimeout(1500);

  for (const [scr, id] of SCREENS) {
    const r = { screen: scr, ok: false };
    try {
      await page.evaluate(s => goto(s), scr);
      await page.waitForTimeout(500);
      const shown = await page.evaluate(id => {
        const vis = [...document.querySelectorAll('.screen')].filter(el => { if (el.classList.contains('hidden')) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).map(el => el.id);
        return { vis, target: id ? vis.includes(id) : vis.length > 0 };
      }, id);
      r.visible = shown.vis.slice(0, 4);
      r.ok = shown.target;
    } catch (e) { r.error = String(e && e.message || e).slice(0, 200); }
    report.screens.push(r);
  }

  // Match-3 : ouvrir une session sur la première parcelle construite, si possible
  try {
    const m3 = await page.evaluate(() => {
      let idx = (G.planet.parcels || []).findIndex(p => p && p.building && p.state === 'built');
      if (idx < 0) {   // partie neuve : on pose une mine de test sur la première parcelle (en mémoire seulement)
        idx = (G.planet.parcels || []).findIndex(p => p && !p.building);
        if (idx < 0) return 'aucune parcelle libre';
        Object.assign(G.planet.parcels[idx], { building: 'mine', state: 'built', lvl: 1 });
      }
      if (typeof startM3 !== 'function') return 'startM3 absent';
      startM3(idx, 'Mine'); return 'ouvert sur la parcelle ' + idx;
    });
    await page.waitForTimeout(2000);
    report.match3 = { tried: m3, visible: await page.evaluate(() => { const el = document.getElementById('scr-m3'); return !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.querySelector('canvas, #m3-grid, [class*="m3"]') !== null; }) };
  } catch (e) { report.match3 = { error: String(e && e.message || e).slice(0, 200) }; }

  await browser.close();
  srv.close();
  report.ok = report.pageErrors.length === 0 && report.failedLocal.length === 0 && report.globalsMissing.length === 0 && report.screens.every(s => s.ok) && !!(report.match3 && report.match3.visible);
  report.endedAt = new Date().toISOString();
  await writeFile(path.join(here, 'parcours.last.json'), JSON.stringify(report, null, 2));
  if (JSON_ONLY) { console.log(JSON.stringify(report)); return report; }
  console.log(`Parcours Starbyte — ${report.ok ? 'OK' : 'ÉCHEC'}  (${DIR})`);
  console.log(`  chargement ${report.timings.loadMs} ms · DOMContentLoaded ${report.timings.nav && report.timings.nav.domContentLoaded} ms · ${report.timings.scripts} scripts · ${report.globalFunctions} fonctions globales`);
  console.log(`  accueil : ${report.welcome}`);
  for (const s of report.screens) console.log(`  ${s.ok ? '✓' : '✗'} ${s.screen.padEnd(12)} ${s.error || (s.visible || []).join(', ')}`);
  console.log(`  match-3 : ${JSON.stringify(report.match3)}`);
  if (report.globalsMissing.length) console.log('  GLOBALES MANQUANTES :', report.globalsMissing.join(', '));
  if (report.failedLocal.length) console.log('  FICHIERS LOCAUX EN ÉCHEC :', [...new Set(report.failedLocal)].join(', '));
  if (report.pageErrors.length) { console.log('  EXCEPTIONS :'); for (const e of report.pageErrors.slice(0, 20)) console.log('    -', e); }
  if (report.consoleErrors.length) { console.log('  console.error :'); for (const e of [...new Set(report.consoleErrors)].slice(0, 20)) console.log('    -', e); }
  process.exitCode = report.ok ? 0 : 1;
  return report;
}

main().catch(e => { console.error(e); process.exit(2); });
