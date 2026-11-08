/* ═══════════════════════════════════════════════════════════════════════════
   STARBYTE — Match-3 V2 · moteur pur (aucun DOM)
   Septembre 2026 · conforme à « Match-3 V2 canonique » (§4 → §25)

   Grille hexagonale 7 × 9, pointes en haut, rangées impaires décalées à droite.
   Index i = rangée × 7 + colonne. Coordonnées cube pour les axes et voisins.

   Utilisé par l'interface (match3.js) et par la simulation de calibrage.
   ═══════════════════════════════════════════════════════════════════════════ */

export const COLS = 7, ROWS = 9, N = COLS * ROWS;

// Tuiles (§6, §7, §12) — les valeurs sont des valeurs de prototype
export const RES_TYPES = ['metal', 'energie', 'cristal', 'biomass', 'artefact'];
export const VALUE = { metal: 2, energie: 2, cristal: 3, biomass: 2, artefact: 5, rock: 0 };
// Coefficient de rendement planétaire : cale le volume d'une session sur l'économie du jeu
// (coûts des bâtiments, antenne 60/25/8 en 2-3 sessions). Calibré par simulation.
export let YIELD = 0.2;
export function setYield(y) { YIELD = y; }
export const BASE_WEIGHTS = { metal: 25, energie: 25, cristal: 20, biomass: 20, artefact: 5, rock: 5 };
// Cascades (§11.3) : match initial ×1, puis ×1.2, ×1.5, ×2, ×3
export const CASCADE_MULT = [1, 1.2, 1.5, 2, 3];
export const cascadeMult = (k) => CASCADE_MULT[Math.min(k, CASCADE_MULT.length - 1)];

/* ─────────────── Géométrie hexagonale ─────────────── */

// 6 directions cube ; les 3 premières définissent les 3 axes de match (§4.2)
//   0 : horizontal · 1 : diagonale montante vers la droite · 2 : diagonale montante vers la gauche
export const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];

export function toCube(i) {
  const c = i % COLS, r = (i / COLS) | 0;
  const x = c - (r - (r & 1)) / 2;
  return [x, -x - r, r];
}
export function fromCube(x, y, z) {
  const r = z, c = x + (z - (z & 1)) / 2;
  return (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? -1 : r * COLS + c;
}
export function step(i, d) {
  const [x, y, z] = toCube(i), [dx, dy, dz] = DIRS[d];
  return fromCube(x + dx, y + dy, z + dz);
}
export function neighbors(i) {
  const out = [];
  for (let d = 0; d < 6; d++) { const j = step(i, d); if (j >= 0) out.push(j); }
  return out;
}
export function areNeighbors(a, b) { return neighbors(a).includes(b); }
// Ligne complète passant par i sur un axe (0..2)
export function line(i, axis) {
  const out = [i];
  for (const d of [axis, axis + 3]) { let j = step(i, d); while (j >= 0) { out.push(j); j = step(j, d); } }
  return out;
}

/* ─────────────── Aléatoire reproductible ─────────────── */

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────────── Plateau ─────────────── */

let _id = 1;
const matchable = (t) => !!t && t.type !== 'rock';

export class Board {
  // opts.weights : pondération des tirages · opts.rocks : roches au départ
  constructor(opts = {}) {
    this.rand = opts.rand || Math.random;
    this.weights = { ...BASE_WEIGHTS, ...(opts.weights || {}) };
    // Probabilité qu'une tuile qui tombe évite de former un alignement tout seul.
    // Sans ce frein, la grille hex (3 axes, 4 ressources courantes) enchaîne les cascades à l'infini.
    this.calm = opts.calm ?? 1;
    this.grid = new Array(N).fill(null);
    this.generate(opts.rocks ?? 3);
  }

  newTile(type) {
    if (!type) {
      const w = this.weights;
      const total = Object.values(w).reduce((s, v) => s + v, 0);
      let r = this.rand() * total;
      for (const k of Object.keys(w)) { r -= w[k]; if (r <= 0) { type = k; break; } }
      type = type || 'metal';
    }
    const t = { id: _id++, type };
    if (type === 'rock') t.hp = 2;
    return t;
  }

  // Génération initiale : aucun match gratuit, au moins un coup possible (§25.1-2)
  generate(rocks) {
    const noRock = { ...this.weights, rock: 0 };
    for (let tries = 0; tries < 50; tries++) {
      const saved = this.weights; this.weights = noRock;
      for (let i = 0; i < N; i++) this.grid[i] = this.newTile();
      this.weights = saved;
      // roches initiales, hors rangée du haut
      for (let k = 0; k < rocks; k++) {
        const i = COLS + Math.floor(this.rand() * (N - COLS));
        this.grid[i] = this.newTile('rock');
      }
      this.breakRuns();
      if (this.hasMove()) return;
    }
  }

  // Retire les alignements présents en changeant le type des cases concernées
  breakRuns() {
    for (let guard = 0; guard < 200; guard++) {
      const runs = this.findRuns();
      if (!runs.length) return;
      for (const run of runs) {
        const i = run.cells[1];
        const banned = new Set([run.type]);
        neighbors(i).forEach((j) => this.grid[j] && banned.add(this.grid[j].type));
        const opts = RES_TYPES.filter((t) => !banned.has(t));
        const pick = opts.length ? opts[Math.floor(this.rand() * opts.length)] : RES_TYPES[Math.floor(this.rand() * 4)];
        this.grid[i] = this.newTile(pick);
      }
    }
  }

  // Alignements de 3+ sur les 3 axes (§4.2) — les spéciales gardent leur type
  findRuns() {
    const g = this.grid, runs = [];
    for (let axis = 0; axis < 3; axis++) {
      for (let i = 0; i < N; i++) {
        const t = g[i];
        if (!matchable(t)) continue;
        const p = step(i, axis + 3);
        if (p >= 0 && matchable(g[p]) && g[p].type === t.type) continue;   // pas le début du run
        const cells = [i];
        let j = step(i, axis);
        while (j >= 0 && matchable(g[j]) && g[j].type === t.type) { cells.push(j); j = step(j, axis); }
        if (cells.length >= 3) runs.push({ axis, cells, type: t.type });
      }
    }
    return runs;
  }

  // Longueur maximale d'un alignement passant par i (test local rapide)
  runThrough(i) {
    const t = this.grid[i];
    if (!matchable(t)) return 0;
    let best = 0;
    for (let axis = 0; axis < 3; axis++) {
      let n = 1;
      for (const d of [axis, axis + 3]) {
        let j = step(i, d);
        while (j >= 0 && matchable(this.grid[j]) && this.grid[j].type === t.type) { n++; j = step(j, d); }
      }
      best = Math.max(best, n);
    }
    return best;
  }

  canSwap(a, b) {
    const g = this.grid;
    return areNeighbors(a, b) && matchable(g[a]) && matchable(g[b]);
  }

  // Un échange est valide s'il crée un alignement, ou s'il implique un noyau (§5.2, §10.3)
  isValidSwap(a, b) {
    if (!this.canSwap(a, b)) return false;
    const g = this.grid;
    if (g[a].special === 'core' || g[b].special === 'core') return true;
    [g[a], g[b]] = [g[b], g[a]];
    const ok = this.runThrough(a) >= 3 || this.runThrough(b) >= 3;
    [g[a], g[b]] = [g[b], g[a]];
    return ok;
  }

  // Liste des coups possibles (§25.2)
  moves() {
    const out = [];
    for (let i = 0; i < N; i++) {
      for (let d = 0; d < 3; d++) {
        const j = step(i, d);
        if (j >= 0 && this.isValidSwap(i, j)) out.push([i, j]);
      }
    }
    return out;
  }
  hasMove() {
    for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) {
      const j = step(i, d);
      if (j >= 0 && this.isValidSwap(i, j)) return true;
    }
    return false;
  }

  // Aucun coup possible : on rebat les tuiles de ressource (§25.3). Retourne les déplacements.
  reshuffle() {
    const cells = [], tiles = [];
    for (let i = 0; i < N; i++) if (matchable(this.grid[i])) { cells.push(i); tiles.push(this.grid[i]); }
    for (let tries = 0; tries < 60; tries++) {
      for (let k = tiles.length - 1; k > 0; k--) {
        const m = Math.floor(this.rand() * (k + 1));
        [tiles[k], tiles[m]] = [tiles[m], tiles[k]];
      }
      cells.forEach((c, k) => { this.grid[c] = tiles[k]; });
      if (!this.findRuns().length && this.hasMove()) break;
    }
    this.breakRuns();
    if (!this.hasMove()) this.generate(0);
    return this.grid.map((t, i) => (t ? { id: t.id, to: i } : null)).filter(Boolean);
  }

  /* ─────────────── Résolution ─────────────── */

  // Joue un échange. Retourne la liste des étapes (pour l'animation), ou null si refusé.
  play(a, b, ctx = {}) {
    if (!this.isValidSwap(a, b)) return null;
    const g = this.grid;
    [g[a], g[b]] = [g[b], g[a]];
    const steps = [];
    let forced = null;
    // Échange avec un noyau : il s'active sur le type de la tuile partenaire
    const ca = g[a].special === 'core', cb = g[b].special === 'core';
    if (ca || cb) {
      const coreCell = ca ? a : b, other = ca ? b : a;
      forced = { cells: new Set([coreCell]), coreTarget: (ca && cb) ? '*' : g[other].type, coreCell };
    }
    let k = 0;
    for (;;) {
      const s = this.resolveStep(k, k === 0 ? [a, b] : [], k === 0 ? forced : null, ctx);
      if (!s) break;
      steps.push(s);
      k++;
      if (k > 40) break;
    }
    return steps;
  }

  resolveStep(k, moved, forced, ctx) {
    const g = this.grid;
    const runs = this.findRuns();
    if (!runs.length && !forced) return null;
    const mult = cascadeMult(k) * (ctx.bonus || 1);
    const remove = new Set();
    const matched = new Set();
    runs.forEach((r) => r.cells.forEach((c) => { remove.add(c); matched.add(c); }));

    // Création des tuiles spéciales (§10.2 charge sur 4, §10.3 noyau sur 5+)
    const created = [];
    const reserved = new Set();
    for (const run of [...runs].sort((x, y) => y.cells.length - x.cells.length)) {
      if (run.cells.length < 4) continue;
      const cand = run.cells.filter((c) => !reserved.has(c) && !g[c].special);
      if (!cand.length) continue;
      const pref = cand.find((c) => moved.includes(c));
      const cell = pref !== undefined ? pref : cand[Math.floor(cand.length / 2)];
      const special = run.cells.length >= 5 ? 'core' : 'charge';
      const tile = { id: _id++, type: run.type, special, axis: run.axis };
      created.push({ cell, tile, from: run.cells.length, replacedId: g[cell].id });
      reserved.add(cell);
    }

    // Déclenchement des spéciales (réactions en chaîne)
    const blasts = [];
    const queue = [];
    const rockHit = new Set();
    const pushSpecial = (c, target) => queue.push({ c, target });
    remove.forEach((c) => { if (g[c] && g[c].special && !reserved.has(c)) pushSpecial(c); });
    if (forced) {
      forced.cells.forEach((c) => remove.add(c));
      pushSpecial(forced.coreCell, forced.coreTarget);
    }
    const fired = new Set();
    while (queue.length) {
      const { c, target } = queue.shift();
      if (fired.has(c) || !g[c]) continue;
      fired.add(c);
      const t = g[c];
      let area = [];
      if (t.special === 'charge') area = line(c, t.axis);
      else if (t.special === 'core') {
        const ty = target || t.type;
        for (let i = 0; i < N; i++) if (matchable(g[i]) && (ty === '*' || g[i].type === ty)) area.push(i);
        area.push(c);
      }
      blasts.push({ cell: c, kind: t.special, axis: t.axis, type: t.type, area });
      for (const i of area) {
        if (reserved.has(i) || !g[i]) continue;
        if (g[i].type === 'rock') { rockHit.add(i); continue; }
        if (!remove.has(i)) { remove.add(i); if (g[i].special) pushSpecial(i); }
      }
    }
    reserved.forEach((c) => remove.delete(c));

    // Roches : fissurées par un match adjacent ou une explosion, brisées au 2e impact (§8.3)
    matched.forEach((c) => neighbors(c).forEach((j) => { if (g[j] && g[j].type === 'rock' && !remove.has(j)) rockHit.add(j); }));
    const rocksCracked = [], rocksBroken = [];
    rockHit.forEach((j) => {
      const r = g[j];
      r.hp -= 1;
      if (r.hp <= 0) { rocksBroken.push(j); remove.add(j); } else rocksCracked.push(j);
    });

    // Gains (§12.2) : valeur × tuiles × cascade × bonus
    const gains = {};
    const removedTiles = [];
    remove.forEach((c) => {
      const t = g[c];
      if (!t) return;
      removedTiles.push({ cell: c, tile: t });
      if (t.type !== 'rock') gains[t.type] = (gains[t.type] || 0) + VALUE[t.type] * mult * YIELD;
    });
    remove.forEach((c) => { g[c] = null; });
    created.forEach(({ cell, tile }) => { g[cell] = tile; });

    // Gravité : les tuiles tombent vers le bas de l'écran (§9).
    // 1) toutes les colonnes tombent, 2) puis on remplit par le haut : le frein anti-cascade
    //    voit ainsi la configuration finale des tuiles existantes.
    const falls = [], spawns = [], empty = [];
    for (let c = 0; c < COLS; c++) {
      const stack = [];
      for (let r = ROWS - 1; r >= 0; r--) { const t = g[r * COLS + c]; if (t) stack.push(t); }
      let r = ROWS - 1;
      for (const t of stack) { const i = r * COLS + c; if (g[i] !== t) falls.push({ id: t.id, to: i }); g[i] = t; r--; }
      for (let above = 1; r >= 0; r--, above++) { g[r * COLS + c] = null; empty.push({ i: r * COLS + c, above }); }
    }
    // remplissage du bas vers le haut (les cases vides les plus basses d'abord)
    empty.sort((x, y) => y.i - x.i);
    for (const { i, above } of empty) {
      let t = this.newTile();
      g[i] = t;
      for (let tries = 0; tries < 4 && this.runThrough(i) >= 3 && this.rand() < this.calm; tries++) {
        t = this.newTile(); g[i] = t;
      }
      spawns.push({ id: t.id, to: i, above, tile: t });
    }
    const maxRun = runs.reduce((m, r) => Math.max(m, r.cells.length), 0);
    return {
      cascade: k, mult, runs, removed: removedTiles, created, blasts,
      rocksCracked, rocksBroken, gains, falls, spawns, maxRun,
    };
  }
}

/* ─────────────── Session (§14 → §24) ─────────────── */

// Paliers de rendement sur le total extrait (toutes ressources confondues).
// Valeurs calibrées par simulation (cf. BUILD.md).
export const SESSION = {
  moves: 13,
  bonusCap: 4,          // coups bonus maximum par session (sinon un bon joueur ne s'arrête jamais)
  tiers: [60, 120, 190],
  tierNames: ['Extraction minimale', 'Rendement optimal', 'Veine profonde'],
};

export const SECONDARY_POOL = [
  { id: 'rocks',    label: (n) => `Briser ${n} roches`,        n: 3,  stat: 'rocksBroken' },
  { id: 'cristal',  label: (n) => `Extraire ${n} cristal`,      n: 15, stat: 'cristal' },
  { id: 'cascades', label: (n) => `Déclencher ${n} cascades`,   n: 3,  stat: 'cascades' },
  { id: 'artefact', label: () => 'Extraire 1 artefact',          n: 1,  stat: 'artefact' },
  { id: 'charge',   label: () => 'Forger une charge',            n: 1,  stat: 'charges' },
];
