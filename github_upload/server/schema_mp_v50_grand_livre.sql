-- v50 (08/11/2026) — MATCH-3 SERVEUR · TEMPS B : grand livre des ressources (DORMANT)
-- GDD : claude/starbyte_GDD_match3_serveur.md §8 (Temps B). Rien ne change pour le joueur tant que l'interrupteur
-- sb_settings.m3_credit_on vaut false (valeur posée ici). Ce que ce script met en place :
--   · sb_settings : interrupteurs lus par le jeu au démarrage (sb_settings_get) ;
--   · resources : un solde SERVEUR par joueur et par planète (world_id 'home' ou 'col-…'), initialisé UNE FOIS
--     depuis les stocks que le jeu déclare lors de son premier envoi (décision du 08/11 : migration depuis les stocks
--     actuels) ; plus le dernier instantané client et la dérive (client − serveur) ;
--   · resource_ledger : chaque variation de stock que le jeu déclare (motif, planète, montant), par lots (sb_ledger) ;
--   · le match-3 est la première ligne que le serveur ne croit plus sur parole : une variation 'm3' déclarée par le
--     jeu n'est PAS portée au solde ; c'est le rejeu serveur (m3-verify → sb_m3_settle) qui crédite, borné par ce que
--     le jeu a réellement ajouté (stock plein) ;
--   · la dérive client − serveur est journalisée (mp_anomalies, kind 'ledger_drift') au-delà d'une tolérance.
-- Au Temps B dormant, tous les autres motifs (prod, build, raid…) sont portés au solde tels que déclarés : le solde
-- serveur ne diffère du stock client que par ce que le match-3 a été crédité en trop (ou en moins). Temps C : le
-- serveur recalcule production et dépenses lui-même.
-- Nécessite v46 (_mp_anomaly, _mp_num) et v49 (m3_sessions). À coller tel quel dans Supabase → SQL Editor → Run.
-- Ensuite : redéployer la fonction Edge m3-verify (server/m3-verify, version du 08/11 soir).
--
-- Voir : select world_id, balances, client, drift, updated_at from public.resources where user_id = (select user_id from worlds where pseudo = 'Pauline');
--        select at, world_id, res, delta, applied, reason, ref, src from public.resource_ledger where user_id = … order by id desc limit 50;
--        select at, pseudo, detail from public.mp_anomalies where kind = 'ledger_drift' order by at desc;

-- ── Interrupteurs ──
create table if not exists public.sb_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.sb_settings enable row level security;
revoke all on public.sb_settings from public, anon, authenticated;
insert into public.sb_settings (key, value) values ('m3_credit_on', 'false'::jsonb), ('ledger_on', 'true'::jsonb)
on conflict (key) do nothing;

-- Lus par le jeu au démarrage (tous les interrupteurs sont publics)
create or replace function public.sb_settings_get() returns jsonb
language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.sb_settings
$$;
revoke all on function public.sb_settings_get() from public, anon;
grant execute on function public.sb_settings_get() to authenticated;

-- ── Soldes serveur par planète ──
create table if not exists public.resources (
  user_id    uuid not null,
  world_id   text not null,                              -- 'home' | 'col-xxxx' (identifiant du jeu)
  balances   jsonb not null default '{}'::jsonb,         -- solde serveur par ressource
  client     jsonb not null default '{}'::jsonb,         -- dernier instantané déclaré par le jeu
  client_at  timestamptz,
  drift      jsonb not null default '{}'::jsonb,         -- client − serveur, par ressource
  init_at    timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, world_id)
);
alter table public.resources enable row level security;
revoke all on public.resources from public, anon, authenticated;

-- ── Grand livre ──
create table if not exists public.resource_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  world_id   text not null,
  res        text not null,                              -- metal | energie | cristal | biomass | artefact
  delta      numeric not null,                           -- variation déclarée (client) ou calculée (serveur)
  applied    numeric not null default 0,                 -- part réellement portée au solde serveur
  reason     text not null,                              -- prod ration m3 m3srv build ship unit skill market raid route convoy depot repair recycle mp cheat gain spend init …
  ref        text,                                       -- 'seed:123' pour le match-3
  src        text not null default 'client',             -- 'client' | 'server'
  at         timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists resource_ledger_user on public.resource_ledger (user_id, id desc);
create index if not exists resource_ledger_ref on public.resource_ledger (user_id, ref) where ref is not null;
alter table public.resource_ledger enable row level security;
revoke all on public.resource_ledger from public, anon, authenticated;

alter table public.m3_sessions add column if not exists world text not null default 'home';
alter table public.m3_sessions add column if not exists settled_at timestamptz;
alter table public.m3_sessions add column if not exists settled jsonb;   -- ce qui a été porté au solde serveur

create or replace function public._sb_res_keys() returns text[] language sql immutable as $$
  select array['metal', 'energie', 'cristal', 'biomass', 'artefact'] $$;

-- Nombre signé à décimales (les variations de stock sont signées et la production est fractionnaire) ; 0 si illisible
create or replace function public._sb_num(x text, cap numeric default 100000000) returns numeric
language sql immutable as $$
  select case when x ~ '^\s*-?[0-9]{1,12}(\.[0-9]{1,6})?\s*$' then greatest(-cap, least(cap, x::numeric)) else 0 end
$$;

-- Ajoute d à balances[k] d'une planète (crée la ligne à zéro si besoin)
create or replace function public._sb_balance_add(p_user uuid, p_world text, p_res text, p_delta numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.resources (user_id, world_id, balances) values (p_user, p_world, jsonb_build_object(p_res, 0))
  on conflict (user_id, world_id) do nothing;
  update public.resources
     set balances = balances || jsonb_build_object(p_res, round(coalesce((balances ->> p_res)::numeric, 0) + p_delta, 3)),
         updated_at = now()
   where user_id = p_user and world_id = p_world;
end $$;
revoke all on function public._sb_balance_add(uuid, text, text, numeric) from public, anon, authenticated;

-- ── Un lot de variations déclarées par le jeu ──
-- p = { snap: { 'home': {metal: n, …}, 'col-…': {…} }, entries: [ {w, k, d, r, ref, at}, … ] }   (300 lignes au plus)
-- Renvoie { ok, balances: {world: {…}}, drift: {world: {…}}, m3_credit_on }
create or replace function public.sb_ledger(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); keys text[] := public._sb_res_keys();
  snap jsonb; ents jsonb; e jsonb; w text; k text; d numeric; r text; rf text; at_ts timestamptz;
  fresh text[] := '{}';          -- planètes initialisées par cet envoi : leurs lignes ne sont pas portées au solde
  srv record; appl numeric; adj numeric;
  bal jsonb; cl jsonb; dr jsonb; tol numeric; drifted boolean := false; last_an timestamptz;
  out_bal jsonb := '{}'::jsonb; out_drift jsonb := '{}'::jsonb; n int := 0;
begin
  if uid is null then raise exception 'no_session'; end if;
  if coalesce((select value from public.sb_settings where key = 'ledger_on'), 'true'::jsonb) = 'false'::jsonb then
    return jsonb_build_object('ok', false, 'off', true);
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'ledger_invalid'; end if;
  snap := coalesce(p -> 'snap', '{}'::jsonb); ents := coalesce(p -> 'entries', '[]'::jsonb);
  if jsonb_typeof(snap) <> 'object' or jsonb_typeof(ents) <> 'array' then raise exception 'ledger_invalid'; end if;
  if jsonb_array_length(ents) > 300 then raise exception 'ledger_invalid'; end if;

  -- 1. planètes de l'instantané : première fois → le solde serveur part des stocks déclarés (migration, une fois)
  for w in select * from jsonb_object_keys(snap) loop
    if w !~ '^[a-z0-9-]{1,24}$' or jsonb_typeof(snap -> w) <> 'object' then continue; end if;
    cl := '{}'::jsonb;
    foreach k in array keys loop cl := cl || jsonb_build_object(k, round(public._sb_num(snap -> w ->> k), 3)); end loop;
    if not exists (select 1 from public.resources where user_id = uid and world_id = w) then
      insert into public.resources (user_id, world_id, balances, client, client_at) values (uid, w, cl, cl, now());
      insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, src)
        select uid, w, key, value::numeric, value::numeric, 'init', 'server' from jsonb_each_text(cl);
      fresh := fresh || w;
    else
      update public.resources set client = cl, client_at = now(), updated_at = now() where user_id = uid and world_id = w;
    end if;
  end loop;

  -- 2. les variations déclarées
  for e in select * from jsonb_array_elements(ents) loop
    if jsonb_typeof(e) <> 'object' then continue; end if;
    w := coalesce(e ->> 'w', 'home'); k := e ->> 'k'; r := left(coalesce(e ->> 'r', 'gain'), 12); rf := left(e ->> 'ref', 40);
    d := round(public._sb_num(e ->> 'd'), 3);
    if w !~ '^[a-z0-9-]{1,24}$' or not (k = any (keys)) or d = 0 or abs(d) > 10000000 then continue; end if;
    begin at_ts := to_timestamp(public._mp_num(e ->> 'at') / 1000.0); exception when others then at_ts := now(); end;
    if at_ts is null or at_ts < now() - interval '30 days' or at_ts > now() + interval '1 day' then at_ts := now(); end if;
    n := n + 1;
    if w = any (fresh) then
      appl := 0;                                      -- déjà compris dans le solde initial
    elsif r in ('m3', 'm3srv') then
      -- le match-3 n'est pas cru sur parole : si le serveur a déjà réglé cette partie, on borne son crédit par ce que
      -- le jeu a réellement ajouté (stock plein) ; sinon la ligne attend sb_m3_settle
      appl := 0;
      if rf is not null then
        select * into srv from public.resource_ledger where user_id = uid and ref = rf and res = k and src = 'server' order by id desc limit 1;
        if found then
          adj := least(d, srv.delta) - srv.applied;
          if adj <> 0 then
            update public.resource_ledger set applied = resource_ledger.applied + adj where id = srv.id;
            perform public._sb_balance_add(uid, srv.world_id, k, adj);
          end if;
        end if;
      end if;
    else
      appl := d;                                      -- Temps B : les autres motifs sont portés tels que déclarés
      perform public._sb_balance_add(uid, w, k, d);
    end if;
    insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, ref, src, at)
    values (uid, w, k, d, appl, r, rf, 'client', at_ts);
  end loop;

  -- 3. dérive client − serveur, par planète de l'instantané
  for w in select * from jsonb_object_keys(snap) loop
    select balances, client into bal, cl from public.resources where user_id = uid and world_id = w;
    if bal is null then continue; end if;
    dr := '{}'::jsonb;
    foreach k in array keys loop
      d := round(coalesce((cl ->> k)::numeric, 0) - coalesce((bal ->> k)::numeric, 0), 1);
      dr := dr || jsonb_build_object(k, d);
      tol := greatest(500, 0.05 * abs(coalesce((bal ->> k)::numeric, 0)));
      if abs(d) > tol and not (w = any (fresh)) then drifted := true; end if;
    end loop;
    update public.resources set drift = dr where user_id = uid and world_id = w;
    out_bal := out_bal || jsonb_build_object(w, bal); out_drift := out_drift || jsonb_build_object(w, dr);
  end loop;
  if drifted then
    select max(at) into last_an from public.mp_anomalies where user_id = uid and kind = 'ledger_drift';
    if last_an is null or last_an < now() - interval '1 hour' then
      perform public._mp_anomaly(uid, 'ledger_drift', jsonb_build_object('drift', out_drift, 'balances', out_bal, 'entries', n));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'balances', out_bal, 'drift', out_drift,
    'm3_credit_on', coalesce((select value from public.sb_settings where key = 'm3_credit_on'), 'false'::jsonb));
end $$;
revoke all on function public.sb_ledger(jsonb) from public, anon;
grant execute on function public.sb_ledger(jsonb) to authenticated;

-- ── Règlement d'une partie de match-3 rejouée (appelé par m3-verify avec la clé de service, jamais par le jeu) ──
-- Le crédit serveur (server_credit) est porté au solde de la planète de la partie, borné par ce que le jeu dit avoir
-- réellement ajouté (ligne 'm3' du grand livre, même ref) si cette ligne est déjà arrivée. Idempotent.
create or replace function public.sb_m3_settle(p_session bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record; k text; credit numeric; client_d numeric; appl numeric; w text; done jsonb := '{}'::jsonb; sref text;
begin
  select * into s from public.m3_sessions where id = p_session;
  if not found or s.verified_at is null then return jsonb_build_object('ok', false, 'why', 'not_verified'); end if;
  if s.settled_at is not null then return jsonb_build_object('ok', true, 'already', true, 'settled', s.settled); end if;
  sref := 'seed:' || s.seed;
  -- planète : celle que le jeu a déclarée dans la ligne 'm3', sinon celle du rapport
  select world_id into w from public.resource_ledger where user_id = s.user_id and ref = sref and src = 'client' order by id desc limit 1;
  w := coalesce(w, s.world, 'home');
  if s.error is null and s.server_credit is not null and jsonb_typeof(s.server_credit) = 'object' then
    for k in select * from jsonb_object_keys(s.server_credit) loop
      if not (k = any (public._sb_res_keys())) then continue; end if;
      credit := round(public._sb_num(s.server_credit ->> k), 3);
      if credit <= 0 then continue; end if;
      select sum(delta) into client_d from public.resource_ledger where user_id = s.user_id and ref = sref and res = k and src = 'client';
      appl := case when client_d is null then credit else greatest(0, least(client_d, credit)) end;
      insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, ref, src)
      values (s.user_id, w, k, credit, appl, 'm3srv', sref, 'server');
      if appl <> 0 then perform public._sb_balance_add(s.user_id, w, k, appl); end if;
      done := done || jsonb_build_object(k, appl);
    end loop;
  end if;
  update public.m3_sessions set settled_at = now(), settled = done where id = p_session;
  return jsonb_build_object('ok', true, 'settled', done, 'world', w);
end $$;
revoke all on function public.sb_m3_settle(bigint) from public, anon, authenticated;

-- m3_report : la partie annonce aussi sa planète (colonne world)
create or replace function public.m3_report(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ps text; sid bigint; sd bigint; src text; owner uuid; used timestamptz;
  lg jsonb; n_ev int; wd text;
begin
  if uid is null then raise exception 'no_session'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'm3_report_invalid'; end if;
  sd := public._mp_num(p ->> 'seed');
  if sd <= 0 then raise exception 'm3_report_invalid'; end if;
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

-- Le jeu peut demander le crédit serveur d'une de ses parties (Temps B actif : il attend ce crédit avant d'encaisser)
create or replace function public.m3_session_credit(p_seed bigint) returns jsonb
language sql security definer stable set search_path = public as $$
  select case when s.id is null then null else jsonb_build_object('id', s.id, 'verified', s.verified_at is not null, 'credit', s.server_credit, 'mismatch', s.mismatch, 'error', s.error, 'settled', s.settled) end
  from (select 1) x left join lateral (select * from public.m3_sessions where user_id = auth.uid() and seed = p_seed order by id desc limit 1) s on true
$$;
revoke all on function public.m3_session_credit(bigint) from public, anon;
grant execute on function public.m3_session_credit(bigint) to authenticated;

-- Fin v50. Vérification : select count(*) from pg_proc where proname = 'sb_ledger';  → 1
