/* ═══════════════════════════════════════
   STARBYTE — Match-3 V2 · session pure (aucun DOM)
   8 novembre 2026 · GDD « match-3 serveur-autoritaire », Temps A

   Tout ce qui change le crédit d'une partie vit ici, sur le moteur m3core : tirage des objectifs secondaires,
   plateau par graine, coups, coups bonus, paliers, fin de partie et crédit. L'interface (match3.js) ne fait
   qu'animer ce que cette session lui renvoie ; le serveur (m3-verify) rejoue la même session avec le même code.

   Déterminisme : une session est entièrement décrite par { seed, context, remine } + le journal des événements
   [{a,b}] (échange valide), {k:'extract'} (sortie au palier), {k:'quit'} (abandon). Le hasard n'a qu'une source,
   rng(seed), consommée dans un ordre fixe : objectifs secondaires d'abord, plateau ensuite.
   ═══════════════════════════════════════ */

import { Board, rng, SESSION, SECONDARY_POOL, RES_TYPES } from './m3core.js';

// Thèmes de forage (ressource dominante / secondaire) — déplacé depuis match3.js, qui l'importe d'ici
export const THEMES = {
  Extraction: { dom: 'metal', sec: 'biomass', label: 'Mine · métal dominant' },
  'Énergie':  { dom: 'energie', sec: 'cristal', label: 'Centrale · énergie dominante' },
  Recherche:  { dom: 'cristal', sec: 'biomass', label: 'Laboratoire · cristal dominant' },
};

export const SESSION_RULES = {
  cascadeBonusDepth: 3,      // +1 coup sur une cascade de profondeur ≥ 3 (§16.2)
  coreBonus: true,           // +1 coup quand un noyau est forgé
  tierBonusFrom: 2,          // +1 coup à chaque palier ≥ II
  secondaryMult: 0.1,        // +10 % de crédit par objectif secondaire atteint
  secondaries: 2,
};

// Paramètres dérivés du contexte (identiques dans le jeu et sur le serveur)
export function sessionParams(context, remine) {
  context = context || 'Terraformation';
  const theme = THEMES[context] || null;
  remine = context === 'Re-mining' ? (remine | 0) : 0;
  const weights = {};
  if (theme) { weights[theme.dom] = 25 * 2; weights[theme.sec] = 20 * 1.4; }
  weights.rock = 5 + remine * 2;
  const bonus = theme ? 1.25 : context === 'Re-mining' ? Math.min(1.6, 1 + 0.15 * (remine + 1)) : 1;
  return { context, theme, remine, weights, bonus, rocks: Math.min(10, 3 + remine * 2) };
}

// Crée la session : mêmes champs que l'ancien this.s de l'interface, plus seed et log
export function createSession({ seed, context, remine, parcelIdx = -1, labelFor = null }) {
  const rand = rng(seed >>> 0);
  const P = sessionParams(context, remine);
  const pool = [...SECONDARY_POOL];
  const secondaries = [];
  while (secondaries.length < SESSION_RULES.secondaries && pool.length) {
    const k = Math.floor(rand() * pool.length);
    const def = pool.splice(k, 1)[0];
    const label = (labelFor && labelFor(def, P.context)) || def.label;
    secondaries.push({ ...def, label, have: 0, done: false });
  }
  return {
    seed: seed >>> 0, parcelIdx, context: P.context, theme: P.theme, bonus: P.bonus, remine: P.remine,
    board: new Board({ weights: P.weights, rocks: P.rocks, rand }),
    movesLeft: SESSION.moves, movesUsed: 0, bonusGiven: 0,
    gains: {}, total: 0, tier: 0,
    stats: { rocksBroken: 0, cascades: 0, maxCascade: 0, charges: 0, cores: 0, cristal: 0, artefact: 0 },
    secondaries, choiceShown: false, ended: false, busy: false, result: null,
    log: [],   // journal rejouable
  };
}

function bonusMove(s, why, events) {
  if (s.bonusGiven >= SESSION.bonusCap) return;
  s.bonusGiven++; s.movesLeft++;
  events.push({ type: 'bonus', why });
}

// Comptabilise une étape de résolution (gains, statistiques) — l'interface l'anime à part
export function accountStep(s, st) {
  Object.entries(st.gains).forEach(([k, v]) => { s.gains[k] = (s.gains[k] || 0) + v; s.total += v; });
  s.stats.rocksBroken += st.rocksBroken.length;
  s.stats.cristal += st.gains.cristal || 0;
  s.stats.artefact += st.removed.filter((r) => r.tile.type === 'artefact').length;
  if (st.cascade >= 1) s.stats.cascades++;
  st.created.forEach((c) => { if (c.tile.special === 'core') s.stats.cores++; else s.stats.charges++; });
}

export function checkTiers(s, events) {
  while (s.tier < 3 && s.total >= SESSION.tiers[s.tier]) {
    s.tier++;
    events.push({ type: 'tier', tier: s.tier });
    if (s.tier >= SESSION_RULES.tierBonusFrom) bonusMove(s, `PALIER ${['I', 'II', 'III'][s.tier - 1]}`, events);
  }
}

export function checkSecondaries(s, events) {
  s.secondaries.forEach((o) => {
    o.have = Math.floor(s.stats[o.stat] || 0);
    if (!o.done && o.have >= o.n) { o.done = true; if (events) events.push({ type: 'secondary', id: o.id }); }
  });
}

// Un coup : renvoie null si l'échange est refusé (rien n'est consommé), sinon { steps, events, reshuffled }.
// `account` = false laisse à l'appelant le soin d'appeler accountStep par étape (l'interface, qui anime entre deux).
export function applyMove(s, a, b, { account = true } = {}) {
  if (s.ended || !s.board.isValidSwap(a, b)) return null;
  const steps = s.board.play(a, b, { bonus: s.bonus });
  s.movesLeft--; s.movesUsed++;
  s.log.push({ a, b });
  const events = [];
  if (account) steps.forEach((st) => accountStep(s, st));
  return { steps, events, finish: (s2 = s) => finishMove(s2, steps, events) };
}

// Fin de l'instruction d'un coup (après comptabilisation) : bonus, paliers, objectifs, remélange
export function finishMove(s, steps, events) {
  const depth = steps.length - 1;
  s.stats.maxCascade = Math.max(s.stats.maxCascade, depth);
  if (depth >= SESSION_RULES.cascadeBonusDepth) bonusMove(s, 'CASCADE ×' + depth, events);
  if (SESSION_RULES.coreBonus && steps.some((x) => x.created.some((c) => c.tile.special === 'core'))) bonusMove(s, 'NOYAU FORGÉ', events);
  checkTiers(s, events);
  checkSecondaries(s, events);
  let reshuffled = false;
  if (!s.board.hasMove()) { s.board.reshuffle(); reshuffled = true; events.push({ type: 'reshuffle' }); }
  const offerChoice = s.tier >= 1 && !s.choiceShown && s.movesLeft > 0;
  if (offerChoice) s.choiceShown = true;   // le choix n'est proposé qu'une fois par partie
  return { events, reshuffled, offerChoice, exhausted: s.movesLeft <= 0 };
}

// Décision du joueur au palier : 'go' (continuer) ou 'extract' (sortir) ; 'quit' = abandon sans palier
export function decide(s, k) {
  if (s.ended) return;
  if (k === 'go') { s.log.push({ k: 'go' }); return; }
  if (k === 'extract' || k === 'quit') s.log.push({ k });
}

// Crédit de fin de partie. skillMult(k) → multiplicateur des skills (1 = aucun) ; renvoyé à part pour l'affichage et la vérification.
export function finish(s, reason, skillMult) {
  if (s.ended) return s.result;
  s.ended = true;
  checkSecondaries(s, null);
  const secDone = s.secondaries.filter((o) => o.done).length;
  const mult = 1 + SESSION_RULES.secondaryMult * secDone;
  const order = s.theme ? [s.theme.dom, s.theme.sec, ...RES_TYPES.filter((k) => k !== s.theme.dom && k !== s.theme.sec)] : RES_TYPES;
  const base = {};
  order.forEach((k) => { const v = (s.gains[k] || 0) * mult; if (v >= 0.5) base[k] = Math.round(v); });
  const credit = {}, skillExtra = {}, skillMults = {};
  Object.keys(base).forEach((k) => {
    const m = skillMult ? Number(skillMult(k)) || 1 : 1;
    skillMults[k] = m;
    credit[k] = Math.round(base[k] * m);
    if (credit[k] > base[k]) skillExtra[k] = credit[k] - base[k];
  });
  const rendement = Math.round(s.total * mult / SESSION.tiers[2] * 100);
  s.result = { credit, base, skillExtra, skillMults, rendement, success: s.tier >= 1, reason, secDone, tier: s.tier, total: s.total };
  return s.result;
}

// Ce que le jeu envoie au serveur en fin de partie (m3_report)
export function report(s) {
  return {
    seed: s.seed, context: s.context, remine: s.remine, parcel: s.parcelIdx,
    log: s.log, reason: s.result ? s.result.reason : null,
    claimed: s.result ? s.result.credit : {}, base: s.result ? s.result.base : {}, skill: s.result ? s.result.skillMults : {},
    tier: s.tier, total: Math.round(s.total * 1000) / 1000, moves: s.movesUsed, bonus: s.bonusGiven,
  };
}

// Rejeu complet d'un rapport, sans interface. Renvoie le résultat de base (hors skills) et avec les skills annoncés.
export function replay(rep) {
  const s = createSession({ seed: rep.seed, context: rep.context, remine: rep.remine, parcelIdx: rep.parcel });
  let reason = null;
  for (const ev of rep.log || []) {
    if (s.ended) break;
    if (ev && typeof ev.a === 'number' && typeof ev.b === 'number') {
      const r = applyMove(s, ev.a, ev.b);
      if (!r) return { error: 'invalid_move', at: s.movesUsed, result: null };
      const f = r.finish();
      if (f.exhausted) { reason = 'moves'; break; }
    } else if (ev && ev.k === 'go') decide(s, 'go');
    else if (ev && (ev.k === 'extract' || ev.k === 'quit')) { decide(s, ev.k); reason = ev.k; break; }
    else return { error: 'bad_event', result: null };
  }
  if (!reason) reason = s.movesLeft <= 0 ? 'moves' : (rep.reason || 'quit');   // journal tronqué : on finit comme annoncé
  const skill = rep.skill || {};
  const result = finish(s, reason, (k) => skill[k] || 1);
  return { error: null, result, tier: s.tier, total: s.total, moves: s.movesUsed, reason };
}
