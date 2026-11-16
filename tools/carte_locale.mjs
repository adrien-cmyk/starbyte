#!/usr/bin/env node
// Carte locale : la nouvelle carte (Atlas et Tactique) dans UN fichier HTML, avec l'état d'une partie figé, pour essayer hors ligne.
//   node tools/carte_locale.mjs <dossier de copies (saves.0.json)> <début de l'id du joueur> <fichier HTML de sortie>
// 1. La partie est chargée hors ligne dans le vrai jeu (Chromium sans écran) et le Centre de prospection est ouvert ;
// 2. on relève ce que la carte demande au jeu : l'état (SBZones.state), les actions possibles sur les signatures, les passages
//    des convois aux relais, les réponses du jeu sur les systèmes (portée, emplacement habitable), le catalogue des modèles ;
// 3. on écrit une page hôte qui joue le rôle du jeu avec ces réponses (horaires décalés à l'heure de l'ouverture) et qui contient
//    la carte (atlas/index.html, bibliothèque GLTF incluse) dans un cadre « srcdoc » : elle s'ouvre par un double-clic.
// Les modèles 3D (GLB) se chargent quand la page est servie à côté des dossiers assets/3d (petit serveur local) ; sinon, silhouettes.
// Aucune action ne part vers le jeu : la carte est en lecture.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '..', 'github_upload');
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const [SRC, UID, OUT] = process.argv.slice(2);
if (!SRC || !UID || !OUT) { console.error('usage : node tools/carte_locale.mjs <dossier des copies> <id du joueur> <sortie.html>'); process.exit(2); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gz': 'application/gzip', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const saves = JSON.parse(readFileSync(path.join(SRC, 'saves.0.json'), 'utf8'));
const save = saves.find(s => s.user_id.startsWith(UID)); if (!save) { console.error('partie introuvable'); process.exit(1); }
let worlds = []; try { worlds = JSON.parse(readFileSync(path.join(SRC, 'worlds.0.json'), 'utf8')); } catch (e) {}
const pseudo = (worlds.find(w => w.user_id === save.user_id) || {}).pseudo || 'Commandant';

const srv = await new Promise(res => { const s = createServer(async (q, r) => { try { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(DIR, p); const st = await stat(f).catch(() => null); if (!st || !st.isFile()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(await readFile(f)); } catch (e) { r.writeHead(500); r.end(); } }); s.listen(0, '127.0.0.1', () => res(s)); });
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP play.test 127.0.0.1'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-CH' });
await ctx.route(/supabase\.co|googleapis|gstatic|jsdelivr|unpkg|cdnjs/, r => r.abort());
const p = await ctx.newPage();
await p.addInitScript(([sg, stores]) => {
  if (sessionStorage.getItem('__carte')) return; sessionStorage.setItem('__carte', '1');
  localStorage.clear(); localStorage.setItem('starbyte_savegame', sg); for (const [k, v] of Object.entries(stores || {})) if (v != null) localStorage.setItem(k, v);
}, [JSON.stringify(save.data.savegame), save.data.stores || {}]);
await p.goto(`http://play.test:${port}/`, { waitUntil: 'load', timeout: 90000 });
for (let i = 0; i < 60; i++) { if (await p.evaluate(() => typeof G !== 'undefined' && !!G && !!G.planet).catch(() => false)) break; await sleep(500); }
await sleep(2500);
// les réponses du jeu sur les systèmes sont relevées au fil de la carte
await p.evaluate(() => { const o = SBZones.check; window.__chk = {}; SBZones.check = (s, k) => { const r = o(s, k); window.__chk[s + '|' + (k || '')] = r; return r; }; window.prospectLocked = () => false; try { sbModalResolve(false); } catch (e) {} goto('prospect'); });
let F = null;
for (let i = 0; i < 90 && !F; i++) { const f = p.frames().find(f => /atlas\/index\.html/.test(f.url())); if (f && await f.evaluate(() => !!(window.STARBYTE_ZONES && STARBYTE_ZONES.ready && STARBYTE_ZONES.ready())).catch(() => false)) F = f; else await sleep(500); }
if (!F) { console.error('carte non ouverte'); process.exit(1); }
await sleep(3000);
// contenu des zones autour de chaque monde (le tirage demande au jeu où sont les emplacements habitables)
await F.evaluate(() => STARBYTE_ZONES.openZoneNear(true, '__aucune__')).catch(e => console.warn('zones', e.message));   // parcourt toutes les zones à portée
const data = await p.evaluate(() => {
  const st = SBZones.state(), m = SBZones.models() || {}, rel = (u) => { try { const x = new URL(u); return x.pathname.replace(/^\//, '') + x.search; } catch (e) { return null; } };
  const ships = {}; for (const k in (m.ships || {})) ships[k] = Object.assign({}, m.ships[k], { url: rel(m.ships[k].url) });
  const stations = (m.stations || []).map(s => Object.assign({}, s, { url: rel(s.url) }));
  const nodes = {}; for (const k of (window.SBLines ? Object.keys(SBLines.network().bySys) : [])) { try { const t = SBZones.nodeTraffic(k, 12); if (t.length) nodes[k] = t; } catch (e) {} }
  return { st, models: { meshopt: rel(m.meshopt), ships, stations, bm: null }, chk: window.__chk, nodes, now: Date.now() };
});
// actions possibles sur les signatures, monde par monde (relevées dans le cadre : mêmes appels que la carte)
data.sig = await F.evaluate(() => { const Z = parent.SBZones, s = Z.state(), out = {}; for (const g of s.sigs || []) for (const w of s.worlds || []) { try { out[g.id + '|' + w.id] = Z.sigAction(g.id, w.id); } catch (e) {} } return out; });
await browser.close(); srv.close();

// la carte, bibliothèque GLTF incluse (un cadre srcdoc ne peut pas charger un fichier voisin)
let atlas = readFileSync(path.join(DIR, 'atlas', 'index.html'), 'utf8');
const gltf = readFileSync(path.join(DIR, 'atlas', 'vendor', 'gltf_r128.js'), 'utf8');
// la carte la charge à la demande (« si THREE.GLTFLoader manque ») : on la pose d'avance, après le reste de la page
const tag = '<script>' + gltf.replace(/<\/script/gi, '<\\/script') + '</script>';
atlas = /<\/body>/i.test(atlas) ? atlas.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => tag + '</body>') : atlas + tag;
const when = new Date(data.now).toLocaleString('fr-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const B64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Starbyte · Carte locale (${pseudo}, ${when})</title>
<style>html,body{margin:0;height:100%;background:#03040c;overflow:hidden;font:13px/1.4 -apple-system,system-ui,sans-serif}
iframe{position:fixed;inset:0;width:100%;height:100%;border:0}
#loc-msg{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:5;max-width:88vw;padding:9px 14px;border-radius:12px;background:rgba(10,14,24,.92);border:1px solid rgba(143,214,255,.35);color:#dfe9f5;opacity:0;transition:opacity .25s;pointer-events:none;text-align:center}
#loc-msg.on{opacity:1}</style></head>
<body><div id="loc-msg"></div>
<script>
/* Carte locale de Starbyte : état de la partie de ${pseudo} relevé le ${when}. Ce fichier joue le rôle du jeu pour la carte :
   même interface que assets/zones_test.js (SBZones), réponses relevées dans le vrai jeu, horaires décalés à l'heure de l'ouverture.
   Aucune action ne part : la carte est en lecture. Modèles 3D : servis depuis assets/3d/ à côté de ce fichier (serveur local). */
(() => {
  const D = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(${JSON.stringify(B64(JSON.stringify(data)))}), c => c.charCodeAt(0))));
  const T0 = D.now, SHIFT = Date.now() - T0;
  const isT = (v) => typeof v === 'number' && v > 1.6e12 && v < 2.1e12;
  const shift = (o, d) => { if (Array.isArray(o)) return o.map(x => shift(x, d)); if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = isT(o[k]) ? o[k] + d : shift(o[k], d); return r; } return isT(o) ? o + d : o; };
  const msg = (t) => { const e = document.getElementById('loc-msg'); e.textContent = t; e.classList.add('on'); clearTimeout(msg.h); msg.h = setTimeout(() => e.classList.remove('on'), 3200); };
  const NO = 'Copie locale : la carte est en lecture, rien n’est envoyé au jeu.';
  const served = /^https?:/.test(location.protocol);
  const abs = (u) => { try { return u ? new URL(u, location.href).href : null; } catch (e) { return null; } };
  window.SBZones = {
    state: () => shift(D.st, Date.now() - T0),
    check: (s, k) => D.chk[s + '|' + (k || '')] || { radar: false, habitable: false },
    sigAction: (id, w) => D.sig[id + '|' + w] || { kind: 'off', label: 'Copie locale' },
    nodeTraffic: (k, h) => { const now = Date.now(); return (D.nodes[k] || []).map(x => shift(x, SHIFT)).filter(x => x.t > now && x.t < now + (h || 4) * 3600e3).slice(0, 6); },
    models: () => served ? { meshopt: abs(D.models.meshopt), ships: Object.fromEntries(Object.entries(D.models.ships).map(([k, v]) => [k, Object.assign({}, v, { url: abs(v.url) })])), stations: D.models.stations.map(s => Object.assign({}, s, { url: abs(s.url) })), bmUrl: () => null } : null,
    act: () => { msg(NO); return { ok: false, why: NO }; }, launch: () => { msg(NO); return { ok: false, why: NO }; },
    gameAct: () => { msg(NO); return { ok: false, why: NO }; }, beaconCheck: () => ({ ok: false, why: NO }),
    close: () => msg('Copie locale : pas de jeu derrière cette carte.'), onChange: () => () => {},
  };
  const f = document.createElement('iframe'); f.title = 'Carte'; f.setAttribute('allow', 'fullscreen');
  f.srcdoc = new TextDecoder().decode(Uint8Array.from(atob(${JSON.stringify(B64(atlas))}), c => c.charCodeAt(0)));
  document.body.appendChild(f);
  if (!served) setTimeout(() => msg('Ouvert sans serveur : silhouettes au lieu des modèles 3D.'), 2500);
})();
</script></body></html>
`;
await writeFile(OUT, html);
console.log(`${OUT} : ${(html.length / 1048576).toFixed(2)} Mo · ${pseudo} · ${data.st.worlds.length} monde(s), ${(data.st.sigs || []).length} signatures, ${(data.st.travels || []).length} trajets, ${(data.st.ports || []).length} ports, ${Object.keys(data.chk || {}).length} réponses du jeu, ${Object.keys(data.nodes).length} relais avec passages`);
console.log('modèles :', [...new Set([...Object.values(data.models.ships).map(s => s.url), ...data.models.stations.map(s => s.url), data.models.meshopt].filter(Boolean).map(u => u.split('?')[0]))].join(' '));
