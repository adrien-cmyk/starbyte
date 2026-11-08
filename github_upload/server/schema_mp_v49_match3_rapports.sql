-- v49 (08/11/2026) — MATCH-3 SERVEUR · TEMPS A : graines et rapports de partie
-- GDD : claude/starbyte_GDD_match3_serveur.md (décisions du 08/11 : trois temps ; graines serveur par lots de 20 ;
-- au Temps A un écart ne fait que journaliser). Rien ne change pour le joueur : le jeu continue d'appliquer son
-- propre résultat. Le serveur reçoit chaque partie (graine, coups, choix, crédit annoncé), la rejoue avec le même
-- moteur (fonction Edge m3-verify, dossier server/m3-verify) et journalise les écarts dans mp_anomalies.
-- Nécessite v46 (_mp_anomaly, _mp_num). À coller tel quel dans Supabase → SQL Editor → Run.
-- Ensuite : déployer la fonction Edge m3-verify (voir server/m3-verify/README.md).
--
-- Voir : select pseudo, seed_src, tier, claimed, server_base, mismatch, error, created_at from public.m3_sessions order by id desc limit 50;

-- ── Graines fournies par le serveur (une par partie) ──
create table if not exists public.m3_seeds (
  seed       bigint primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
create index if not exists m3_seeds_user_free on public.m3_seeds (user_id) where used_at is null;
alter table public.m3_seeds enable row level security;
revoke all on public.m3_seeds from public, anon, authenticated;

-- Un lot de 20 graines neuves pour le joueur connecté (au plus 120 graines libres par joueur)
create or replace function public.m3_seed_batch() returns setof bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); free int; s bigint; n int := 0;
begin
  if uid is null then raise exception 'no_session'; end if;
  select count(*) into free from public.m3_seeds where user_id = uid and used_at is null;
  while n < 20 and free + n < 120 loop
    s := floor(random() * 4294967295)::bigint + 1;
    begin
      insert into public.m3_seeds (seed, user_id) values (s, uid);
      n := n + 1; return next s;
    exception when unique_violation then null;   -- graine déjà prise : on en tire une autre
    end;
  end loop;
  return;
end $$;
revoke all on function public.m3_seed_batch() from public, anon;
grant execute on function public.m3_seed_batch() to authenticated;

-- ── Rapports de partie ──
create table if not exists public.m3_sessions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  pseudo        text,
  seed          bigint not null,
  seed_src      text not null default 'client',       -- 'server' (graine du lot) | 'client' (tirée sur place) | 'unknown' (annoncée serveur mais inconnue) | 'reused'
  context       text,
  parcel        int,
  remine        int not null default 0,
  log           jsonb not null default '[]'::jsonb,   -- [{a,b}] coups valides, {k:'go'|'extract'|'quit'}
  reason        text,
  claimed       jsonb not null default '{}'::jsonb,   -- crédit annoncé (skills compris)
  base_claimed  jsonb not null default '{}'::jsonb,   -- crédit annoncé hors skills
  skill         jsonb not null default '{}'::jsonb,   -- multiplicateurs de skills annoncés
  tier          int, total numeric, moves int, bonus int,
  played_at     timestamptz,
  created_at    timestamptz not null default now(),
  verified_at   timestamptz,
  server_base   jsonb,                                -- crédit hors skills rejoué par le serveur
  server_credit jsonb,                                -- avec les skills annoncés
  server_tier   int,
  mismatch      boolean,
  error         text
);
create index if not exists m3_sessions_user on public.m3_sessions (user_id, id desc);
create index if not exists m3_sessions_pending on public.m3_sessions (id) where verified_at is null;
alter table public.m3_sessions enable row level security;
revoke all on public.m3_sessions from public, anon, authenticated;

create or replace function public.m3_report(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ps text; sid bigint; sd bigint; src text; owner uuid; used timestamptz;
  lg jsonb; n_ev int;
begin
  if uid is null then raise exception 'no_session'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'm3_report_invalid'; end if;
  sd := public._mp_num(p ->> 'seed');
  if sd <= 0 then raise exception 'm3_report_invalid'; end if;
  lg := coalesce(p -> 'log', '[]'::jsonb);
  if jsonb_typeof(lg) <> 'array' then raise exception 'm3_report_invalid'; end if;
  n_ev := jsonb_array_length(lg);
  if n_ev > 60 then raise exception 'm3_report_invalid'; end if;      -- 13 coups + 4 bonus + choix : jamais 60
  -- la graine : vient-elle bien du lot du joueur, et n'a-t-elle pas déjà servi ?
  src := case when (p ->> 'seed_src') = 'server' then 'server' else 'client' end;
  select user_id, used_at into owner, used from public.m3_seeds where seed = sd;
  if src = 'server' then
    if owner is null or owner <> uid then src := 'unknown';
    elsif used is not null then src := 'reused';
    else update public.m3_seeds set used_at = now() where seed = sd;
    end if;
  end if;
  select pseudo into ps from public.worlds where user_id = uid;
  insert into public.m3_sessions (user_id, pseudo, seed, seed_src, context, parcel, remine, log, reason, claimed, base_claimed, skill, tier, total, moves, bonus, played_at)
  values (uid, ps, sd, src, left(coalesce(p ->> 'context', ''), 20), public._mp_num(p ->> 'parcel')::int, public._mp_num(p ->> 'remine')::int, lg,
          left(coalesce(p ->> 'reason', ''), 10),
          case when jsonb_typeof(p -> 'claimed') = 'object' then p -> 'claimed' else '{}'::jsonb end,
          case when jsonb_typeof(p -> 'base') = 'object' then p -> 'base' else '{}'::jsonb end,
          case when jsonb_typeof(p -> 'skill') = 'object' then p -> 'skill' else '{}'::jsonb end,
          public._mp_num(p ->> 'tier')::int, nullif(p ->> 'total', '')::numeric, public._mp_num(p ->> 'moves')::int, public._mp_num(p ->> 'bonus')::int,
          to_timestamp(public._mp_num(p ->> 'at') / 1000.0))
  returning id into sid;
  if src in ('unknown', 'reused') then
    perform public._mp_anomaly(uid, 'm3_seed_' || src, jsonb_build_object('session', sid, 'seed', sd));
  end if;
  return sid;
end $$;
revoke all on function public.m3_report(jsonb) from public, anon;
grant execute on function public.m3_report(jsonb) to authenticated;

-- Fin v49. Vérification : select count(*) from pg_proc where proname = 'm3_report';  → 1
