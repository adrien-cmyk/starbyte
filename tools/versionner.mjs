#!/usr/bin/env node
// Versions automatiques des fichiers du jeu.
// Chaque « assets/….js?v=… » (ou .css) référencé par github_upload/index.html reçoit pour version
// l'empreinte (sha256, 10 caractères) du fichier lui-même : un fichier modifié = une nouvelle adresse,
// donc le service worker (cache d'abord pour les ?v=) et les navigateurs servent toujours la bonne version,
// sans que personne n'ait à penser à changer le ?v= à la main.
// Les versions écrites à la main dans les autres fichiers JS (ex. paint.js?v=…) ne sont pas touchées.
//
//   node tools/versionner.mjs            → réécrit index.html si besoin, affiche ce qui a changé
//   node tools/versionner.mjs --check    → ne réécrit rien ; code de sortie 1 si une version est périmée
//
// Le workflow de publication l'exécute avant d'envoyer les fichiers chez Infomaniak.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv.find((a, i) => process.argv[i - 1] === '--dir') || path.join(here, '..', 'github_upload'));
const CHECK = process.argv.includes('--check');
const INDEX = path.join(ROOT, 'index.html');

const html = readFileSync(INDEX, 'utf8');
const seen = new Map();
let changed = 0, missing = 0;
const out = html.replace(/((?:assets|fronde)\/[A-Za-z0-9_\-./]+\.(?:js|css|webmanifest))\?v=([A-Za-z0-9_.\-]+)/g, (m, file, v) => {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) { missing++; console.warn(`  ! fichier absent : ${file}`); return m; }
  if (!seen.has(file)) seen.set(file, createHash('sha256').update(readFileSync(full)).digest('hex').slice(0, 10));
  const h = seen.get(file);
  if (h !== v) { changed++; if (!CHECK) console.log(`  ${file}  ${v} → ${h}`); }
  return `${file}?v=${h}`;
});

if (CHECK) {
  console.log(changed ? `${changed} version(s) périmée(s) dans index.html` : 'Toutes les versions sont à jour.');
  process.exit(changed ? 1 : 0);
}
if (changed) { writeFileSync(INDEX, out); console.log(`index.html : ${changed} version(s) mise(s) à jour (${seen.size} fichiers suivis).`); }
else console.log(`index.html : versions déjà à jour (${seen.size} fichiers suivis).`);
if (missing) process.exitCode = 2;
