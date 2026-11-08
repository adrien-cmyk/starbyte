// STARBYTE — fonction serveur « m3-verify » (match-3 serveur-autoritaire — GDD du 08/11/2026)
// Rejoue les parties de match-3 déclarées par le joueur connecté (table m3_sessions, remplies par m3_report) avec le
// moteur du jeu (m3core.js + m3session.js, copies exactes de src/) et compare au crédit annoncé.
// Temps A : un écart est journalisé (mp_anomalies, kind 'm3_mismatch'), rien ne change en jeu.
// Temps B (v50) : chaque partie rejouée est RÉGLÉE dans le grand livre serveur (sb_m3_settle) — le solde serveur
// reçoit le crédit rejoué, pas le crédit annoncé. Quand l'interrupteur m3_credit_on est à true, le jeu attend ce crédit.
//   POST {}                     → { verified: n, mismatches: n }    (parties en attente du joueur connecté, 20 max)
//   POST { seed: 123 }          → idem, plus session: { id, verified, credit, mismatch, error, settled } pour cette graine
//   POST { action: 'selftest' } → rejoue une partie témoin et renvoie son crédit (vérifie que le moteur tourne ici)
// Fichiers à déployer ensemble : index.ts, m3core.js, m3session.js (copies générées par tools/build-modules.sh m3-verify).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { replay, createSession, applyMove, finish } from './m3session.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
function norm(o: any) { const r: Record<string, number> = {}; for (const k of Object.keys(o || {}).sort()) { const v = Number(o[k]); if (v) r[k] = v; } return r; }

function selftest() {
  // partie témoin : graine fixe, premier coup possible à chaque fois, « continuer » au palier
  const s: any = createSession({ seed: 20261108, context: 'Extraction', remine: 0 });
  let n = 0;
  while (!s.ended && n < 60) {
    const mv = s.board.moves(); if (!mv.length) break;
    const r: any = applyMove(s, mv[0][0], mv[0][1]); const f = r.finish(); n++;
    if (f.offerChoice) s.log.push({ k: 'go' });
    if (f.exhausted) break;
  }
  const res: any = finish(s, 'moves', () => 1);
  const rep = { seed: s.seed, context: s.context, remine: 0, parcel: -1, log: s.log, reason: 'moves', skill: {} };
  const again: any = replay(rep);
  return { moves: n, tier: s.tier, base: res.base, replayIdentical: !again.error && same(again.result.base, res.base) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corps vide */ }
  if (body.action === 'selftest') return json(selftest());

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_signed_in' }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ error: 'not_signed_in' }, 401);
  const uid = who.user.id;

  const { data: rows, error } = await admin.from('m3_sessions').select('*').eq('user_id', uid).is('verified_at', null).order('id', { ascending: true }).limit(20);
  if (error) return json({ error: error.message }, 500);

  let verified = 0, mismatches = 0;
  for (const s of rows || []) {
    const upd: Record<string, unknown> = { verified_at: new Date().toISOString() };
    try {
      const r: any = replay({ seed: Number(s.seed), context: s.context, remine: s.remine, parcel: s.parcel, log: s.log, reason: s.reason, skill: s.skill || {} });
      if (r.error) { upd.error = r.error; upd.mismatch = true; }
      else {
        upd.server_base = r.result.base; upd.server_credit = r.result.credit; upd.server_tier = r.result.tier;
        upd.mismatch = !same(r.result.base, s.base_claimed) || !same(r.result.credit, s.claimed) || r.result.tier !== s.tier;
      }
    } catch (e) { upd.error = String((e as Error)?.message || e).slice(0, 200); upd.mismatch = true; }
    await admin.from('m3_sessions').update(upd).eq('id', s.id);
    verified++;
    // Temps B : règlement dans le grand livre serveur (fonction SQL idempotente ; absente avant v50 → ignoré)
    await admin.rpc('sb_m3_settle', { p_session: s.id }).then(() => {}, () => {});
    if (upd.mismatch) {
      mismatches++;
      await admin.from('mp_anomalies').insert({ user_id: uid, pseudo: s.pseudo, kind: 'm3_mismatch', detail: { session: s.id, seed: s.seed, seed_src: s.seed_src, claimed: s.claimed, base_claimed: s.base_claimed, server_base: upd.server_base ?? null, server_credit: upd.server_credit ?? null, tier: s.tier, server_tier: upd.server_tier ?? null, error: upd.error ?? null } }).then(() => {}, () => {});
    }
  }
  // Temps B : parties déjà rejouées mais pas encore réglées (règlement refusé ou indisponible à l'époque) — on rattrape
  const { data: late } = await admin.from('m3_sessions').select('id').eq('user_id', uid).not('verified_at', 'is', null).is('settled_at', null).order('id', { ascending: true }).limit(20);
  for (const s of late || []) await admin.rpc('sb_m3_settle', { p_session: s.id }).then(() => {}, () => {});

  // Le jeu demande le crédit d'une partie précise (Temps B actif : il l'attend avant d'encaisser)
  let session: unknown = null;
  const seed = Number(body.seed);
  if (Number.isFinite(seed) && seed > 0) {
    const { data: row } = await admin.from('m3_sessions').select('id, verified_at, server_credit, mismatch, error, settled').eq('user_id', uid).eq('seed', seed).order('id', { ascending: false }).limit(1).maybeSingle();
    if (row) session = { id: row.id, verified: !!row.verified_at, credit: row.server_credit || {}, mismatch: !!row.mismatch, error: row.error || null, settled: row.settled ?? null };
  }
  return json({ verified, mismatches, session });
});
