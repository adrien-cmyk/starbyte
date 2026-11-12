// STARBYTE — fonction serveur « voyage » (étape 4 de la migration de la carte, 12/11/2026)
// Le serveur fixe le chemin, les horaires et le carburant d'un tanker vers un port franc, avec le générateur de l'univers
// et le réseau de corridors (voyage_core.js, copie générée par tools/build-voyage.py). Le téléphone n'envoie jamais
// une durée ni un coût : il envoie le départ, le port, la catégorie du tanker, l'itinéraire choisi et l'id de sa mission.
//   POST { action: 'selftest' }                                    → { net, plans } (vérifie que le module tourne ici)
//   POST { action: 'quote', origin, dest, tier, known? }           → { ok, net, plans }   (devis, rien n'est écrit)
//   POST { action: 'launch', origin, dest, tier, pick, mission, known? } → { ok, voyage } (écrit dans public.voyages)
// Prérequis : schema_mp_v54_voyages.sql (et v55 pour les tronçons au registre). Fichiers à déployer ensemble : index.ts, voyage_core.js.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as V from './voyage_core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── logique pure (rejouée telle quelle par tools/test_voyage.mjs, sans base de données) ──
const PORTS = new Set(V.NET.nodes.filter((n: any) => n.type === 'station').map((n: any) => n.key));
const PLANET = /^[A-Z]{1,2}-[A-Z]-\d{4}-\d{1,2}$/;
function checkOrigin(origin: any, reg: any) { return !!origin && (origin === reg.address || (reg.colonies || []).includes(origin)); }
function clean(b: any) {
  return { origin: String(b.origin || '').toUpperCase(), dest: String(b.dest || '').toUpperCase(), tier: Math.max(1, Math.min(3, parseInt(String(b.tier || 1), 10) || 1)),
    pick: b.pick === 'libre' ? 'libre' : 'cor', mission: String(b.mission || '').slice(0, 80), known: Array.isArray(b.known) ? b.known.map((x: any) => String(x).slice(0, 8)).slice(0, 40) : null };
}
function planLaunch(body: any, reg: any, now: any) {
  const b = clean(body);
  if (!/^tm-[A-Za-z0-9-]{4,76}$/.test(b.mission)) return { ok: false, why: 'mission' };
  if (!PLANET.test(b.origin)) return { ok: false, why: 'address' };
  if (!PORTS.has(b.dest)) return { ok: false, why: 'not_a_port' };
  if (!checkOrigin(b.origin, reg)) return { ok: false, why: 'origin_not_yours' };
  const o: any = V.voyageOptions(b.origin, b.dest, b.tier, b.known);
  if (!o.ok) return { ok: false, why: 'address' };
  const p = o.plans.find((x: any) => x.k === b.pick) || o.plans[0];
  const ms = Math.round(p.test * 60000);
  // étape 5 : heures d'entrée et de sortie sur chaque tronçon (l'unité d'interception), fixées au départ
  const segs = V.voyageSegs(p, now, now + ms, b.origin.split('-').slice(0, 3).join('-'), b.dest);
  return { ok: true, row: { mission_id: b.mission, kind: 'tanker', origin: b.origin, dest: b.dest, tier: o.tier, pick: p.k, net_version: o.net,
    plan: { k: p.k, len: p.len, nCor: p.nCor, legs: p.legs, via: p.via, segs, norm: p.norm, test: p.test, floorT: p.floorT, floorF: p.floorF },
    departed_at: now, arrives_at: now + ms, fuel: p.fuel } };
}
// ── fin de la logique pure

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corps vide */ }
  if (body.action === 'selftest') { const o: any = V.voyageOptions('A-O-2178-07', 'A-M-3340', 1, null); return json({ net: V.NET_VERSION, plans: o.plans.map((p: any) => ({ k: p.k, len: Math.round(p.len), test: p.test, fuel: p.fuel })) }); }

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'not_signed_in' }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ ok: false, error: 'not_signed_in' }, 401);
  const uid = who.user.id;

  if (body.action === 'quote') {
    const b = clean(body);
    if (!PLANET.test(b.origin) || !PORTS.has(b.dest)) return json({ ok: false, error: 'address' }, 400);
    const o: any = V.voyageOptions(b.origin, b.dest, b.tier, b.known);
    return json(o.ok ? { ok: true, net: o.net, tier: o.tier, plans: o.plans } : { ok: false, error: 'address' }, o.ok ? 200 : 400);
  }

  if (body.action === 'launch') {
    // le monde de départ doit être au joueur (capitale au registre, ou une de ses colonies)
    const { data: w } = await admin.from('worlds').select('address').eq('user_id', uid).maybeSingle();
    const { data: cs } = await admin.from('colonies').select('address').eq('user_id', uid);
    const reg = { address: w?.address || null, colonies: (cs || []).map((c: any) => c.address) };
    const r: any = planLaunch(body, reg, Date.now());
    if (!r.ok) return json({ ok: false, error: r.why }, 400);
    // une mission ne s'enregistre qu'une fois : un second appel renvoie le voyage déjà fixé
    const { data: prev } = await admin.from('voyages').select('*').eq('user_id', uid).eq('mission_id', r.row.mission_id).maybeSingle();
    if (prev) return json({ ok: true, voyage: prev, again: true });
    // garde-fou : 40 voyages par heure au plus
    const { count } = await admin.from('voyages').select('id', { count: 'exact', head: true }).eq('user_id', uid).gt('created_at', new Date(Date.now() - 3600e3).toISOString());
    if ((count || 0) >= 40) return json({ ok: false, error: 'rate' }, 429);
    const row = { user_id: uid, ...r.row, departed_at: new Date(r.row.departed_at).toISOString(), arrives_at: new Date(r.row.arrives_at).toISOString() };
    const { data, error } = await admin.from('voyages').insert(row).select('*').single();
    if (error) return json({ ok: false, error: error.message }, 500);
    // étape 5 (v55) : le convoi déjà inscrit au registre prend le chemin, les horaires et les tronçons du voyage
    // (sans v55, la colonne legs manque : le convoi garde ce que le jeu a inscrit, rien n'échoue)
    const cv = { via: r.row.plan.via, legs: r.row.plan.segs, departed_at: row.departed_at, arrives_at: row.arrives_at };
    const up = await admin.from('convoys').update(cv).eq('user_id', uid).eq('mission_id', r.row.mission_id).eq('leg', 'out').in('status', ['enroute']);
    return json({ ok: true, voyage: data, convoy: up.error ? 'unchanged' : 'synced' });
  }
  return json({ ok: false, error: 'action' }, 400);
});
