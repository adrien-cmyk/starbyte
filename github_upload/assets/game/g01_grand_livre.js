'use strict';
/* ═══════════════════════════════════════
   STARBYTE — GRAND LIVRE DES RESSOURCES (SERVEUR_0811 · Temps B, dormant)
   GDD : claude/starbyte_GDD_match3_serveur.md §8. Serveur : server/schema_mp_v50_grand_livre.sql.

   Ce fichier ne change rien au jeu. Il regarde les stocks (G.res[k].v de chaque planète) et déclare au serveur chaque
   variation avec son motif (production, construction, match-3, pillage…) et sa planète, par lots espacés (sb_ledger),
   plus un instantané des stocks. Le serveur tient son propre solde par planète : il croit tout… sauf le match-3, qu'il
   rejoue lui-même (m3-verify) et crédite de son côté. L'écart client − serveur est sa mesure de la triche.

   Comment on « voit » les variations sans toucher aux 57 endroits qui écrivent dans G.res : chaque G.res[k].v devient
   un accesseur (get/set) — même valeur, même JSON, même sauvegarde — dont le set note la différence. Les fonctions du
   jeu qui bougent les stocks sont enveloppées pour poser un MOTIF le temps de leur exécution (sbLedgerReason).

   Interrupteur serveur m3_credit_on (table sb_settings) : false aujourd'hui. À true, le match-3 attend le crédit du
   serveur avant d'encaisser (voir SBMatch3.finish dans src/match3.js) ; hors-ligne il encaisse son propre calcul.
   Console : SBLedger.status()
   ═══════════════════════════════════════ */

var SB_LEDGER_RES = ['metal', 'energie', 'cristal', 'biomass', 'artefact'];
var SB_LEDGER_QUEUE_KEY = 'sb_ledger_queue', SB_LEDGER_SETTINGS_KEY = 'sb_settings', SB_M3_PENDING_KEY = 'sb_m3_pending';
var SB_LEDGER_FLUSH_MS = 20000, SB_LEDGER_MAX_PEND = 120, SB_LEDGER_QUEUE_MAX = 40;

var _sbL = {
  reason: null, ref: null,          // motif courant (posé par sbLedgerReason)
  pend: {}, pendN: 0,               // variations agrégées en attente : clé w|k|r|ref → {w,k,d,r,ref,at}
  lastFlush: 0, flushing: false, wantFlush: false,
  last: null, lastError: null,      // dernière réponse / erreur du serveur
  settings: null,                   // {m3_credit_on, ledger_on, at}
  installed: 0,
};

function _sbLedgerLS(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } }
function _sbLedgerLSSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// Pose un motif (et une référence) le temps d'exécuter fn ; les variations de stock pendant fn portent ce motif.
function sbLedgerReason(reason, ref, fn) {
  if (typeof ref === 'function') { fn = ref; ref = null; }
  const pr = _sbL.reason, pf = _sbL.ref;
  _sbL.reason = reason; _sbL.ref = ref || null;
  try { return fn(); }
  finally { _sbL.reason = pr; _sbL.ref = pf; }
}

// Quelle planète possède cet objet de stocks ? (G.res pendant sbWithWorld est bien celui de la planète parcourue)
function _sbLedgerWorldOf(R) {
  if (typeof G === 'undefined' || !G) return 'home';
  if (G.res === R) return G.activeWorld || 'home';
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) if (w && w.data && w.data.res === R) return w.id;
  return G.activeWorld || 'home';
}

function _sbLedgerDelta(R, k, d) {
  if (!Number.isFinite(d) || !d) return;
  const w = String(_sbLedgerWorldOf(R) || 'home');
  const r = _sbL.reason || (d > 0 ? 'gain' : 'spend'), ref = _sbL.ref;
  const key = w + '|' + k + '|' + r + '|' + (ref || '');
  const e = _sbL.pend[key];
  if (e) e.d += d;
  else { _sbL.pend[key] = { w, k, d, r, ref: ref || undefined, at: Date.now() }; _sbL.pendN++; }
  if (_sbL.pendN >= SB_LEDGER_MAX_PEND) _sbL.wantFlush = true;
}

// Met les stocks d'une planète sous surveillance (idempotent : un stock déjà accesseur est laissé tel quel)
function _sbLedgerWatch(R) {
  if (!R || typeof R !== 'object') return;
  for (const k of SB_LEDGER_RES) {
    const r = R[k];
    if (!r || typeof r !== 'object') continue;
    const dsc = Object.getOwnPropertyDescriptor(r, 'v');
    if (!dsc || dsc.get || !dsc.configurable) continue;
    let val = Number(dsc.value); if (!Number.isFinite(val)) val = 0;
    Object.defineProperty(r, 'v', {
      enumerable: true, configurable: true,
      get() { return val; },
      set(n) { n = Number(n); if (!Number.isFinite(n)) return; const d = n - val; val = n; if (d) _sbLedgerDelta(R, k, d); },
    });
    _sbL.installed++;
  }
}
function sbLedgerWatchAll() {
  if (typeof G === 'undefined' || !G) return;
  _sbLedgerWatch(G.res);
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) if (w && w.data) _sbLedgerWatch(w.data.res);
}

// Instantané des stocks de toutes les planètes (entiers)
function sbLedgerSnapshot() {
  const snap = {};
  if (typeof G === 'undefined' || !G) return snap;
  const take = (wid, R) => { if (!R || !/^[a-z0-9-]{1,24}$/.test(String(wid))) return; const o = {}; for (const k of SB_LEDGER_RES) o[k] = Math.floor(Number(R[k] && R[k].v) || 0); snap[wid] = o; };
  take(G.activeWorld || 'home', G.res);
  for (const w of (Array.isArray(G.worlds) ? G.worlds : [])) if (w && w.data && w.id !== (G.activeWorld || 'home')) take(w.id, w.data.res);
  return snap;
}

// ── Envoi par lots ──
function _sbLedgerTakeBatch() {
  const entries = Object.values(_sbL.pend).filter(e => Math.abs(e.d) >= 0.0005).map(e => ({ w: e.w, k: e.k, d: Math.round(e.d * 1000) / 1000, r: e.r, ref: e.ref, at: e.at }));
  _sbL.pend = {}; _sbL.pendN = 0;
  return { snap: sbLedgerSnapshot(), entries, at: Date.now() };
}
function _sbLedgerMergeBatches(a, b) {   // deux lots → un seul (on garde l'instantané le plus récent)
  const m = {};
  for (const e of a.entries.concat(b.entries)) { const key = e.w + '|' + e.k + '|' + e.r + '|' + (e.ref || ''); if (m[key]) m[key].d = Math.round((m[key].d + e.d) * 1000) / 1000; else m[key] = Object.assign({}, e); }
  return { snap: b.at >= a.at ? b.snap : a.snap, entries: Object.values(m), at: Math.max(a.at, b.at) };
}
function _sbLedgerQueuePush(batch) {
  const q = _sbLedgerLS(SB_LEDGER_QUEUE_KEY, []);
  q.push(batch);
  while (q.length > SB_LEDGER_QUEUE_MAX) { const a = q.shift(), b = q.shift(); q.unshift(_sbLedgerMergeBatches(a, b)); }
  _sbLedgerLSSet(SB_LEDGER_QUEUE_KEY, q);
}
function _sbLedgerOnline() { return typeof navigator === 'undefined' || navigator.onLine !== false; }
function _sbLedgerSignedIn() { try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); return !!(a && (a.access_token || (a.currentSession && a.currentSession.access_token))); } catch (e) { return false; } }

async function sbLedgerFlush(force) {
  if (_sbL.flushing) return;
  const due = force || _sbL.wantFlush || (_sbL.pendN > 0 && Date.now() - _sbL.lastFlush >= SB_LEDGER_FLUSH_MS);
  const q0 = _sbLedgerLS(SB_LEDGER_QUEUE_KEY, []);
  if (!due && !q0.length) return;
  if (_sbL.pendN > 0 || force) _sbLedgerQueuePush(_sbLedgerTakeBatch());
  _sbL.wantFlush = false; _sbL.lastFlush = Date.now();
  if (!_sbLedgerOnline() || !_sbLedgerSignedIn() || typeof _mpRpc !== 'function') return;   // la file attend
  _sbL.flushing = true;
  try {
    let q = _sbLedgerLS(SB_LEDGER_QUEUE_KEY, []);
    while (q.length) {
      const b = q[0];
      try {
        const res = await _mpRpc('sb_ledger', { p: { snap: b.snap, entries: b.entries } });
        _sbL.last = res; _sbL.lastError = null;
        if (res && res.m3_credit_on !== undefined) _sbLedgerSetSettings({ m3_credit_on: res.m3_credit_on === true });
      } catch (e) {
        const msg = String(e && e.message || e);
        _sbL.lastError = msg;
        if (!/ledger_invalid/.test(msg)) break;   // réseau, session, serveur : on retentera ; un lot invalide est abandonné
        console.warn('[grand livre] lot refusé :', msg.slice(0, 120));
      }
      q.shift(); _sbLedgerLSSet(SB_LEDGER_QUEUE_KEY, q);
    }
  } finally { _sbL.flushing = false; }
}

// ── Interrupteurs serveur ──
function _sbLedgerSetSettings(patch) {
  const s = Object.assign({}, _sbL.settings || _sbLedgerLS(SB_LEDGER_SETTINGS_KEY, {}), patch, { at: Date.now() });
  _sbL.settings = s; _sbLedgerLSSet(SB_LEDGER_SETTINGS_KEY, s);
}
async function sbLedgerLoadSettings() {
  _sbL.settings = _sbL.settings || _sbLedgerLS(SB_LEDGER_SETTINGS_KEY, null);
  if (!_sbLedgerOnline() || !_sbLedgerSignedIn() || typeof _mpRpc !== 'function') return _sbL.settings;
  try { const s = await _mpRpc('sb_settings_get', {}); if (s && typeof s === 'object') _sbLedgerSetSettings({ m3_credit_on: s.m3_credit_on === true, ledger_on: s.ledger_on !== false }); }
  catch (e) { /* on garde le cache */ }
  return _sbL.settings;
}

// ── Temps B actif : le match-3 attend le crédit du serveur (dormant tant que m3_credit_on = false) ──
// Demande au serveur de rejouer les parties en attente et renvoie le crédit de la partie `seed` : { credit, error } ou null (injoignable).
async function sbLedgerM3ServerCredit(seed, timeoutMs) {
  if (!_sbLedgerOnline() || !_sbLedgerSignedIn()) return null;
  let tok = null;
  try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); tok = a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) {}
  if (!tok) return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, timeoutMs || 8000);
  try {
    const res = await fetch('https://elupnpdcblztpfywnhjl.supabase.co/functions/v1/m3-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ seed: Number(seed) }), signal: ctl ? ctl.signal : undefined,
    });
    if (!res.ok) return null;
    const j = await res.json();
    const s = j && j.session;
    if (!s || !s.verified) return null;              // le rapport n'est pas encore arrivé : on retentera
    return { credit: s.credit || {}, error: s.error || null, mismatch: !!s.mismatch };
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}
// Parties encaissées « sur parole du serveur » dont le crédit n'est pas encore arrivé (app fermée pendant l'attente)
function sbLedgerM3Pending() { return _sbLedgerLS(SB_M3_PENDING_KEY, []); }
function sbLedgerM3PendingAdd(seed, world) { const p = sbLedgerM3Pending().filter(x => x.seed !== seed); p.push({ seed, world: world || 'home', at: Date.now() }); _sbLedgerLSSet(SB_M3_PENDING_KEY, p.slice(-20)); }
function sbLedgerM3PendingRemove(seed) { _sbLedgerLSSet(SB_M3_PENDING_KEY, sbLedgerM3Pending().filter(x => x.seed !== seed)); }
// Porte un crédit serveur aux stocks de la planète (plafond des silos respecté) ; renvoie ce qui a été ajouté
function sbLedgerM3Apply(seed, world, credit, reasonTag) {
  const added = {};
  const run = () => {
    for (const [k, v] of Object.entries(credit || {})) {
      const r = G.res && G.res[k]; const n = Math.round(Number(v) || 0);
      if (!r || n <= 0) continue;
      const before = r.v;
      if (r.v < r.max) r.v = Math.min(r.max, r.v + n);
      added[k] = Math.max(0, Math.round(r.v - before));
    }
  };
  sbLedgerReason(reasonTag || 'm3srv', 'seed:' + seed, () => {
    if (typeof sbWithWorld === 'function' && world && world !== (G.activeWorld || 'home')) sbWithWorld(world, run); else run();
  });
  sbLedgerM3PendingRemove(seed);
  if (typeof saveGame === 'function') saveGame();
  _sbL.wantFlush = true;
  return added;
}
async function _sbLedgerM3Resume() {
  for (const p of sbLedgerM3Pending()) {
    if (Date.now() - p.at > 48 * 3600000) { sbLedgerM3PendingRemove(p.seed); continue; }   // trop vieux : abandonné
    const r = await sbLedgerM3ServerCredit(p.seed, 8000);
    if (!r) continue;
    if (r.error) { sbLedgerM3PendingRemove(p.seed); continue; }                              // partie refusée par le serveur
    const added = sbLedgerM3Apply(p.seed, p.world, r.credit);
    const sum = Object.values(added).reduce((a, b) => a + b, 0);
    if (sum > 0 && typeof toast === 'function') toast('Match-3 validé par le serveur : +' + sum + ' ressources');
  }
}

// ── Motifs : les fonctions du jeu qui bougent les stocks ──
var SB_LEDGER_REASONS = {
  prod: ['_simSegment'], ration: ['_sbFeedTroops'],
  build: ['startBuildingUpgrade', 'doBuild', 'cancelBuild', 'cancelBuildingUpgrade', 'upgradeCapital'],
  ship: ['buildShip', 'buildColonialShip', 'cancelCommand', 'confirmScrapUnit', 'confirmTankerComposition'],
  unit: ['recruitUnit', 'repairUnit'], skill: ['buySkill'], market: ['marketBuy', 'marketSell'],
  raid: ['_mpApplyRaidAgainstHome', 'applyCombatResult'],
  tanker: ['applyTankerLootToResources', 'handleTankerReturnFromCancellation', 'launchTankerOnRoute'],
  route: ['_completeRouteRunReturn', '_completeCancelledRouteRun'],
  convoy: ['sbConvoyTick', '_sbConvoySend', 'mpApplyConvoyLoss'], depot: ['sbDepotShip'],
  repair: ['mpRepairParcel'], recycle: ['_recycleGo', 'cancelRecycle'], probe: ['upgradeProbe', 'buildProbeFromDetail'],
  mp: ['_mpPay'], cheat: ['cheatRes', 'cheatSetupMidGame', 'cheatSetupForD2Test', 'checkSecretTrigger'],
  migrate: ['sbMigrateResPerWorld'], m3old: ['endM3'],
};
function _sbLedgerHook() {
  let n = 0;
  for (const [reason, names] of Object.entries(SB_LEDGER_REASONS)) for (const name of names) {
    const f = window[name];
    if (typeof f !== 'function' || f._sbLedgerWrapped) continue;
    const wrapped = function () { const args = arguments, self = this; return sbLedgerReason(reason, null, () => f.apply(self, args)); };
    wrapped._sbLedgerWrapped = true;
    try { window[name] = wrapped; n++; } catch (e) {}
  }
  return n;
}

// ── Démarrage ──
function sbLedgerBoot() {
  if (_sbL.booted) return; _sbL.booted = true;
  _sbL.lastFlush = Date.now();   // premier lot 20 s après le démarrage
  _sbL.hooked = _sbLedgerHook();
  sbLedgerWatchAll();
  setInterval(() => { try { sbLedgerWatchAll(); sbLedgerFlush(false); } catch (e) {} }, 2000);
  setTimeout(() => { sbLedgerLoadSettings().then(() => _sbLedgerM3Resume()); }, 5000);
  window.addEventListener('online', () => sbLedgerFlush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { try { if (_sbL.pendN > 0) _sbLedgerQueuePush(_sbLedgerTakeBatch()); } catch (e) {} } else sbLedgerFlush(false); });
  window.addEventListener('pagehide', () => { try { if (_sbL.pendN > 0) _sbLedgerQueuePush(_sbLedgerTakeBatch()); } catch (e) {} });
}

window.SBLedger = {
  reason: sbLedgerReason, flush: sbLedgerFlush, snapshot: sbLedgerSnapshot, watch: sbLedgerWatchAll,
  settings: () => _sbL.settings || _sbLedgerLS(SB_LEDGER_SETTINGS_KEY, null),
  m3CreditOn: () => { const s = _sbL.settings || _sbLedgerLS(SB_LEDGER_SETTINGS_KEY, null); return !!(s && s.m3_credit_on === true); },
  m3ServerCredit: sbLedgerM3ServerCredit, m3PendingAdd: sbLedgerM3PendingAdd, m3PendingRemove: sbLedgerM3PendingRemove, m3Apply: sbLedgerM3Apply,
  status: () => ({ pending: Object.values(_sbL.pend).concat(...(_sbLedgerLS(SB_LEDGER_QUEUE_KEY, []).map(b => b.entries))), queued: _sbLedgerLS(SB_LEDGER_QUEUE_KEY, []).length, hooked: _sbL.hooked, watched: _sbL.installed, last: _sbL.last, lastError: _sbL.lastError, settings: _sbL.settings, m3Pending: sbLedgerM3Pending() }),
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(sbLedgerBoot, 1500));
else setTimeout(sbLedgerBoot, 1500);
