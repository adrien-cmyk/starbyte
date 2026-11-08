#!/usr/bin/env node
// Découpage du monolithe : le grand <script> en ligne de github_upload/index.html devient une série de
// fichiers assets/game/*.js, sans changer une ligne de code.
//
// Principe (plan du 2/11/2026) :
//   · le code est analysé (acorn) ; chaque instruction de premier niveau est recopiée telle quelle,
//     avec les commentaires qui la précèdent ;
//   · TOUTES les déclarations de fonctions partent d'abord (fichiers f01…), dans l'ordre d'origine,
//     puis TOUTES les autres instructions (fichiers d01…), dans l'ordre d'origine. Comme dans le monolithe
//     chaque fonction existait avant la première instruction (hoisting), rien ne change à l'exécution ;
//   · les noms des « var » de premier niveau sont pré-déclarés en tête du premier fichier : dans le
//     monolithe ils existaient dès le départ (hoisting du var), ils doivent continuer d'exister ;
//   · scripts classiques, pas de modules ES : les onclick="…" du HTML et tout le code appellent des
//     noms globaux ; chaque fichier commence par 'use strict' comme le bloc d'origine ;
//   · les fichiers sont insérés à la place exacte du bloc, dans le même ordre, avec un ?v= calculé.
//
// Zones : un fichier commence à la fonction (ou variable) « ancre » indiquée ci-dessous. Une ancre
// introuvable est signalée et sa zone fusionne avec la précédente : le script reste relançable sur
// un index.html un peu différent.
//
//   node tools/decouper.mjs            → coupe, écrit les fichiers, réécrit index.html, vérifie
//   node tools/decouper.mjs --dry      → analyse et vérification seules, rien n'est écrit
//
// Après coupe : le code du jeu vit dans assets/game/ ; index.html ne porte plus que le HTML, le CSS
// et les petits scripts d'amorçage. Une session qui veut modifier du code doit le faire dans ces fichiers.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let acorn;
try { acorn = require('acorn'); } catch { acorn = require(path.join(here, 'node_modules', 'acorn')); }

const ROOT = path.resolve(process.argv.find((a, i) => process.argv[i - 1] === '--dir') || path.join(here, '..', 'github_upload'));
const DRY = process.argv.includes('--dry');
const OUT_DIR = 'assets/game';
const INDEX = path.join(ROOT, 'index.html');

// ── Zones (nom de fichier → première fonction / variable de la zone) ──
const FUNCTION_ZONES = [
  ['f01_base_et_multijoueur', 'getTileImg'],
  ['f02_multijoueur_docks_navigation', 'fleetAmbushLootHtml'],
  ['f03_flotte_combat_legende', 'renderFleetDetail'],
  ['f04_rapports_tankers_chantier', 'generateRadarReport'],
  ['f05_colonies_convois_carte_m3', 'arkTimersTick'],
  ['f06_prospection_carnet', 'setProspectTab'],
  ['f07_planete_capitale_commerce', 'renderPlanetEntry'],
  ['f08_pnj_docks_stations', 'tickCrewMood'],
  ['f09_triche_empire_accueil', 'cheatRemoveColony'],
];
const STATEMENT_ZONES = [
  ['d01_config_illustrations_etat', null],          // depuis le début
  ['d02_donnees_jeu', 'HERO_RANK_THRESHOLDS'],
  ['d03_legende_donnees', 'LEGEND_RELIC_BANK'],
  ['d04_marche_et_demarrage', 'MARKET_SEASONS'],
];

// ── 1. Trouver le bloc ──
const html = readFileSync(INDEX, 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let m, block = null;
while ((m = re.exec(html))) {
  if (/\bsrc=/.test(m[1])) continue;
  if (m[2].length > 500000) { block = { attrs: m[1], code: m[2], start: m.index, end: m.index + m[0].length, codeStart: m.index + m[0].indexOf(m[2]) }; break; }
}
if (!block) { console.log('Aucun grand script en ligne dans index.html : déjà découpé ? Rien à faire.'); process.exit(0); }
if (block.attrs.trim()) { console.error('Le grand script a des attributs (' + block.attrs.trim() + ') : cas non prévu, arrêt.'); process.exit(1); }
const code = block.code;
console.log(`Bloc trouvé : ${code.length} caractères (ligne ${html.slice(0, block.start).split('\n').length}).`);

// ── 2. Analyser ──
const ast = acorn.parse(code, { ecmaVersion: 2023, sourceType: 'script', locations: true });
const nodes = ast.body;
let i0 = 0, strict = false;
if (nodes[0] && nodes[0].type === 'ExpressionStatement' && nodes[0].directive === 'use strict') { strict = true; i0 = 1; }
if (!strict) console.warn("  ! le bloc n'est pas en 'use strict' : les fichiers ne le seront pas non plus.");

// chaque nœud emporte le texte depuis la fin du précédent (commentaires compris)
const pieces = [];
let prevEnd = strict ? nodes[0].end : 0;
for (let i = i0; i < nodes.length; i++) {
  const n = nodes[i];
  const text = code.slice(prevEnd, n.end);
  prevEnd = n.end;
  let name = null;
  if (n.type === 'FunctionDeclaration') name = n.id.name;
  else if (n.type === 'VariableDeclaration') name = n.declarations.map(d => d.id.type === 'Identifier' ? d.id.name : null).filter(Boolean)[0] || null;
  pieces.push({ node: n, text, name, isFn: n.type === 'FunctionDeclaration', kind: n.type === 'VariableDeclaration' ? n.kind : null, names: n.type === 'VariableDeclaration' ? n.declarations.map(d => d.id.type === 'Identifier' ? d.id.name : null).filter(Boolean) : (n.type === 'FunctionDeclaration' ? [n.id.name] : []) });
}
const tail = code.slice(prevEnd);   // commentaires après la dernière instruction
const fns = pieces.filter(p => p.isFn), stmts = pieces.filter(p => !p.isFn);
const varNames = [...new Set(stmts.filter(p => p.kind === 'var').flatMap(p => p.names))];
console.log(`  ${pieces.length} instructions de premier niveau : ${fns.length} fonctions, ${stmts.length} autres (dont ${varNames.length} noms « var »).`);

// ── 3. Répartir ──
function split(list, zones) {
  const out = zones.map(([file]) => ({ file, items: [] }));
  const anchors = new Map(zones.map(([file, anchor], k) => [anchor, k]));
  let k = 0;
  for (const [file, anchor] of zones) if (anchor && !list.some(p => p.names.includes(anchor))) console.warn(`  ! ancre introuvable : ${anchor} (${file}) — zone fusionnée avec la précédente`);
  for (const p of list) {
    for (const nm of p.names) if (anchors.has(nm) && anchors.get(nm) > k) k = anchors.get(nm);
    out[k].items.push(p);
  }
  return out.filter(z => z.items.length);
}
const fnFiles = split(fns, FUNCTION_ZONES);
const stFiles = split(stmts, STATEMENT_ZONES);
if (stFiles.length && tail.trim()) stFiles[stFiles.length - 1].tailText = tail;

const header = (file, what) => `/* Starbyte — ${file}.js\n   ${what}\n   Fichier issu du découpage du monolithe index.html (tools/decouper.mjs, 08/11/2026). Code inchangé.\n   Script classique (pas de module) : tout est global, comme avant. Ne pas réinjecter ce code dans index.html. */\n'use strict';\n`;
const files = [];
fnFiles.forEach((z, k) => {
  let body = header(z.file, 'Déclarations de fonctions (ordre d\'origine conservé).');
  if (k === 0 && varNames.length) body += `// Noms « var » de premier niveau du jeu : déclarés ici pour exister dès le départ, comme dans le monolithe (hoisting).\nvar ${varNames.join(', ')};\n`;
  body += z.items.map(p => p.text).join('') + '\n';
  files.push({ file: z.file + '.js', body, count: z.items.length });
});
stFiles.forEach(z => {
  let body = header(z.file, 'Données, variables et instructions exécutées au chargement (ordre d\'origine conservé).');
  body += z.items.map(p => p.text).join('') + (z.tailText || '') + '\n';
  files.push({ file: z.file + '.js', body, count: z.items.length });
});

// ── 4. Vérifier avant d'écrire ──
const declared = (src) => { const a = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script' }); const s = []; for (const n of a.body) { if (n.type === 'FunctionDeclaration') s.push('F:' + n.id.name); else if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') s.push(n.kind + ':' + d.id.name); } return s; };
const before = declared(code).sort();
let after = [];
for (const f of files) {
  try { after.push(...declared(f.body)); } catch (e) { console.error(`  ✗ ${f.file} ne s'analyse pas : ${e.message}`); process.exit(1); }
}
after = after.filter(s => !/^var:/.test(s) || true);
// la pré-déclaration des var ajoute des doublons « var:x » : on compare en ensembles
const setB = new Set(before), setA = new Set(after);
const missing = [...setB].filter(x => !setA.has(x)), extra = [...setA].filter(x => !setB.has(x));
const bytesBefore = pieces.reduce((s, p) => s + p.text.length, 0) + tail.length;
const bytesAfter = files.reduce((s, f) => s + f.body.length, 0);
console.log(`  déclarations : ${setB.size} avant, ${setA.size} après ; manquantes ${missing.length}, en trop ${extra.length}`);
if (missing.length || extra.length) { console.error('  ✗ écart de déclarations :', missing.slice(0, 10), extra.slice(0, 10)); process.exit(1); }
console.log(`  texte de code : ${bytesBefore} caractères répartis (${bytesAfter} avec en-têtes).`);
for (const f of files) console.log(`  ${f.file.padEnd(40)} ${String(Math.round(Buffer.byteLength(f.body) / 1024)).padStart(5)} Ko  ${f.count} éléments`);
if (DRY) { console.log('Mode --dry : rien n\'est écrit.'); process.exit(0); }

// ── 5. Écrire ──
const outDir = path.join(ROOT, OUT_DIR);
mkdirSync(outDir, { recursive: true });
for (const old of existsSync(outDir) ? readdirSync(outDir) : []) if (/^[fd]\d\d_.*\.js$/.test(old) && !files.some(f => f.file === old)) { unlinkSync(path.join(outDir, old)); console.log('  (ancien fichier retiré : ' + old + ')'); }
const tags = [];
for (const f of files) {
  writeFileSync(path.join(outDir, f.file), f.body);
  const h = createHash('sha256').update(f.body).digest('hex').slice(0, 10);
  tags.push(`<script src="${OUT_DIR}/${f.file}?v=${h}"></script>`);
}
const replacement = `<!-- Le code du jeu (ex-script en ligne de 2,5 Mo) vit dans assets/game/ depuis le 08/11/2026 : fonctions d'abord, puis données et démarrage,\n     dans l'ordre d'origine. Découpage par tools/decouper.mjs ; versions par tools/versionner.mjs. Modifier le code là-bas, pas ici. -->\n` + tags.join('\n');
const newHtml = html.slice(0, block.start) + replacement + html.slice(block.end);
writeFileSync(INDEX, newHtml);
console.log(`index.html réécrit : ${html.length} → ${newHtml.length} caractères ; ${files.length} fichiers dans ${OUT_DIR}/.`);
