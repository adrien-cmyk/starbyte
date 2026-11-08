-- v51 (08/11/2026 soir) — CORRECTIF : la graine du match-3 était plafonnée à 2 000 000 000 par _mp_num
-- Une graine est un entier 32 bits (jusqu'à 4 294 967 295). Depuis v49, une partie sur deux était enregistrée avec
-- la graine 2000000000, rejouée faux (mismatch, server_credit vide) et, depuis v50, jamais portée au solde serveur :
-- c'est la dérive observée chez Pauline le 08/11 au soir. Ce script :
--   1. redéfinit m3_report avec une lecture exacte de la graine (0 < graine ≤ 4294967295, sinon rapport refusé) ;
--   2. remet le solde serveur de chaque planète au niveau des stocks déclarés (le Temps B est dormant : son solde
--      repart des stocks du jeu, comme à l'initialisation) — les parties mal enregistrées ne peuvent pas être rejouées.
-- Nécessite v50. À coller dans Supabase → SQL Editor → Run. Pas besoin de redéployer m3-verify.
-- Vérification : après une partie, select seed, seed_src, server_credit, settled from m3_sessions order by id desc limit 3;
--   → seed exacte (souvent > 2000000000), seed_src 'server', settled = server_credit.

create or replace function public.m3_report(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ps text; sid bigint; sd bigint; src text; owner uuid; used timestamptz;
  lg jsonb; n_ev int; wd text; raw text;
begin
  if uid is null then raise exception 'no_session'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'm3_report_invalid'; end if;
  raw := p ->> 'seed';
  if raw is null or raw !~ '^\s*[0-9]{1,10}\s*$' then raise exception 'm3_report_invalid'; end if;
  sd := trim(raw)::bigint;                                   -- graine 32 bits : lue telle quelle, jamais plafonnée
  if sd <= 0 or sd > 4294967295 then raise exception 'm3_report_invalid'; end if;
  lg := coalesce(p -> 'log', '[]'::jsonb);
  if jsonb_typeof(lg) <> 'array' then raise exception 'm3_report_invalid'; end if;
  n_ev := jsonb_array_length(lg);
  if n_ev > 60 then raise exception 'm3_report_invalid'; end if;
  src := case when (p ->> 'seed_src') = 'server' then 'server' else 'client' end;
  select user_id, used_at into owner, used from public.m3_seeds where seed = sd;
  if src = 'server' then
    if owner is null or owner <> uid then src := 'unknown';
    elsif used is not null then src := 'reused';
    else update public.m3_seeds set used_at = now() where seed = sd;
    end if;
  end if;
  wd := coalesce(p ->> 'world', 'home');
  if wd !~ '^[a-z0-9-]{1,24}$' then wd := 'home'; end if;
  select pseudo into ps from public.worlds where user_id = uid;
  insert into public.m3_sessions (user_id, pseudo, seed, seed_src, context, parcel, remine, log, reason, claimed, base_claimed, skill, tier, total, moves, bonus, played_at, world)
  values (uid, ps, sd, src, left(coalesce(p ->> 'context', ''), 20), public._mp_num(p ->> 'parcel')::int, public._mp_num(p ->> 'remine')::int, lg,
          left(coalesce(p ->> 'reason', ''), 10),
          case when jsonb_typeof(p -> 'claimed') = 'object' then p -> 'claimed' else '{}'::jsonb end,
          case when jsonb_typeof(p -> 'base') = 'object' then p -> 'base' else '{}'::jsonb end,
          case when jsonb_typeof(p -> 'skill') = 'object' then p -> 'skill' else '{}'::jsonb end,
          public._mp_num(p ->> 'tier')::int, nullif(p ->> 'total', '')::numeric, public._mp_num(p ->> 'moves')::int, public._mp_num(p ->> 'bonus')::int,
          to_timestamp(public._mp_num(p ->> 'at') / 1000.0), wd)
  returning id into sid;
  if src in ('unknown', 'reused') then
    perform public._mp_anomaly(uid, 'm3_seed_' || src, jsonb_build_object('session', sid, 'seed', sd));
  end if;
  return sid;
end $$;

-- Les parties enregistrées avec la graine plafonnée : marquées, pour qu'on ne les confonde pas avec de la triche
update public.m3_sessions set error = coalesce(error, '') || ' seed_clamped_v49', settled_at = coalesce(settled_at, now()), settled = coalesce(settled, '{}'::jsonb)
where seed = 2000000000 and (error is null or error not like '%seed_clamped_v49%');

-- Le solde serveur repart des stocks déclarés (Temps B dormant ; les anomalies ledger_drift de ce soir sont caduques)
update public.resources set balances = client, drift = '{}'::jsonb, updated_at = now() where client <> '{}'::jsonb;
insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, src)
  select user_id, world_id, key, 0, 0, 'resync_v51', 'server' from public.resources, jsonb_each_text(client) where key = 'metal';

-- Fin v51.
