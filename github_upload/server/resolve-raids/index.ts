// STARBYTE — fonction serveur « resolve-raids »
// Résout les raids arrivés à destination avec le moteur de combat du jeu.
// Appelée par le jeu (attaquant ou défenseur) quand un raid devrait être arrivé ;
// n'importe quel appel résout TOUS les raids dus : personne ne choisit son issue.
// Le jeu n'envoie rien d'autre que son jeton de session : le combat lit la flotte
// figée au départ (table raids) et le registre du défenseur (table worlds, ou colonies si le raid vise une colonie).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRaid, resolveIntercept } from './raid.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Seuls les joueurs connectés (même anonymes) peuvent déclencher la résolution.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_signed_in' }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ error: 'not_signed_in' }, 401);

  // Raids restés bloqués (fonction interrompue) : remis dans la file.
  await admin.rpc('mp_requeue_stuck_raids');

  const { data: due, error: claimErr } = await admin.rpc('mp_claim_due_raids', { p_limit: 20 });
  if (claimErr) return json({ error: claimErr.message }, 500);

  const done: unknown[] = [];
  for (const raid of due || []) {
    try {
      const { data: dw0 } = await admin.from('worlds').select('*').eq('user_id', raid.defender_id).maybeSingle();
      // v18 (20/10) — raid sur une colonie : défense et bâtiments de la colonie, stock commun de l'empire
      let dw = dw0;
      if (dw0 && raid.defender_address && raid.defender_address !== dw0.address) {
        const { data: col } = await admin.from('colonies').select('*').eq('address', raid.defender_address).eq('user_id', raid.defender_id).maybeSingle();
        dw = col ? { ...dw0, address: col.address, planet_name: col.name, level: col.level, defense: col.defense, buildings: col.buildings, shield_until: col.shield_until } : null;
      }
      const result = dw
        ? resolveRaid(raid, dw)
        : { outcome: 'aborted', reason: 'defender_gone', loot: { metal: 0, energie: 0, cristal: 0 }, damaged_building: null };
      const { data: fin, error: finErr } = await admin.rpc('mp_finish_raid', { p_raid: raid.id, p_result: result });
      if (finErr) throw finErr;
      done.push({ id: raid.id, outcome: fin?.result?.outcome ?? result.outcome });
    } catch (e) {
      // Le raid reste « resolving » ; mp_requeue_stuck_raids le reprendra au prochain appel.
      done.push({ id: raid.id, error: String((e as Error)?.message || e) });
    }
  }
  // Interceptions de convois (embuscades sur balise) : même moteur, résolues une seule fois
  const intercepts: unknown[] = [];
  const { data: due2, error: claim2Err } = await admin.rpc('mp_claim_intercepts', { p_limit: 20 });
  if (!claim2Err) {
    for (const it of due2 || []) {
      try {
        const result = resolveIntercept(it.ambush, it.convoy);
        const { data: fin, error: finErr } = await admin.rpc('mp_finish_intercept', { p_intercept: it.intercept_id, p_result: result });
        if (finErr) throw finErr;
        intercepts.push({ id: it.intercept_id, won: !!fin?.won });
      } catch (e) {
        // reste « resolving » ; mp_claim_intercepts la remet en file au bout de 5 min
        intercepts.push({ id: it.intercept_id, error: String((e as Error)?.message || e) });
      }
    }
  }
  return json({ resolved: done.length, raids: done, intercepts });
});
