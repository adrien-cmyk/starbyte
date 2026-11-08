-- v46 (08/11/2026) — ANTITRICHE · LA FLOTTE SE LIT AU REGISTRE
-- Constat (audit du 08/11, claude/starbyte_audit_triche_2026_11_08.md) : mp_launch_raid acceptait la flotte en JSON
-- libre, jamais confrontée à ce que le joueur possède (plafond 100 000 vaisseaux par type). N'importe qui gagnait
-- n'importe quel raid et pillait 30 % des stocks de la victime.
-- Désormais :
--   · le jeu publie TOUTES ses flottes dans worlds.fleets (mpFleetRegistry, dans le même envoi que niveau/défense/stocks) ;
--   · mp_launch_raid prend la composition DANS CE REGISTRE, par id — l'appel ne sert plus qu'à dire quelle flotte part ;
--   · les flottes publiées sont bornées (12 flottes, 2 000 vaisseaux par type et par palier, 50 000 soldats par sorte) ;
--   · chaque rabotage laisse une trace dans mp_anomalies (table fermée aux joueurs, lisible dans le SQL Editor) ;
--     les refus (fleet_unknown / fleet_invalid) remontent au joueur et dans les logs PostgREST.
-- Ce n'est pas encore une preuve de possession (la partie reste déclarée par le client) : c'est UNE SEULE source,
-- bornée et auditable, sur laquelle les prochains garde-fous (plausibilité, match-3 serveur) viendront s'appuyer.
-- À coller tel quel dans Supabase → SQL Editor → Run. Pas de fonction Edge à redéployer.
-- Ensuite : mettre en ligne l'index.html du même commit (ANTITRICHE_0811) — un ancien client n'envoie pas d'id et
-- reçoit 'fleet_unknown' (son raid ne part pas ; rien n'est perdu).
--
-- Voir les anomalies :
--   select a.at, a.pseudo, a.kind, a.detail from public.mp_anomalies a order by a.at desc limit 50;

-- ── 1. Le registre des flottes ──
alter table public.worlds add column if not exists fleets jsonb not null default '[]'::jsonb;
grant update (fleets) on public.worlds to authenticated;   -- sans effet si la table est déjà ouverte en update, nécessaire sinon

-- ── 2. Journal des anomalies ──
create table if not exists public.mp_anomalies (
  id       bigint generated always as identity primary key,
  user_id  uuid,
  pseudo   text,
  kind     text not null,          -- 'fleet_clamped' | 'fleet_unknown' | 'fleet_invalid'
  detail   jsonb not null default '{}'::jsonb,
  at       timestamptz not null default now()
);
create index if not exists mp_anomalies_at on public.mp_anomalies (at desc);
create index if not exists mp_anomalies_user on public.mp_anomalies (user_id, at desc);
alter table public.mp_anomalies enable row level security;
revoke all on public.mp_anomalies from public, anon, authenticated;

create or replace function public._mp_anomaly(p_user uuid, p_kind text, p_detail jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ps text;
begin
  select pseudo into ps from public.worlds where user_id = p_user;
  insert into public.mp_anomalies (user_id, pseudo, kind, detail) values (p_user, ps, p_kind, coalesce(p_detail, '{}'::jsonb));
exception when others then null;   -- le journal ne doit jamais faire échouer le jeu
end $$;
revoke all on function public._mp_anomaly(uuid, text, jsonb) from public, anon, authenticated;

-- ── 3. Nettoyage et bornes d'une flotte publiée ──
-- Garde : id, name, world, status, composition (fregate/cuirasse/tanker × t1..t3), soldiers (garde/lourd), heroes, premium.
-- Renvoie l'entrée nettoyée (entry, null si inutilisable) et le nombre de valeurs rabotées (clamped, pour le journal).
create or replace function public._mp_clean_fleet_entry(f jsonb, out entry jsonb, out clamped int)
language plpgsql as $$
declare
  comp jsonb := '{}'::jsonb; one jsonb; ty text; t text; raw bigint; v bigint;
  sold jsonb; her jsonb := '{}'::jsonb; prem jsonb := '[]'::jsonb; k text; h jsonb; p jsonb;
  ship_cap constant bigint := 2000;      -- par type et par palier
  soldier_cap constant bigint := 50000;  -- par sorte
begin
  clamped := 0; entry := null;
  if f is null or jsonb_typeof(f) <> 'object' or coalesce(f ->> 'id', '') = '' then return; end if;
  foreach ty in array array['fregate', 'cuirasse', 'tanker'] loop
    one := '{}'::jsonb;
    foreach t in array array['t1', 't2', 't3'] loop
      raw := public._mp_num(f -> 'composition' -> ty ->> t);
      v := least(raw, ship_cap);
      if v < raw then clamped := clamped + 1; end if;
      one := one || jsonb_build_object(t, v);
    end loop;
    comp := comp || jsonb_build_object(ty, one);
  end loop;
  raw := public._mp_num(f -> 'soldiers' ->> 'garde'); v := least(raw, soldier_cap); if v < raw then clamped := clamped + 1; end if;
  sold := jsonb_build_object('garde', v);
  raw := public._mp_num(f -> 'soldiers' ->> 'lourd'); v := least(raw, soldier_cap); if v < raw then clamped := clamped + 1; end if;
  sold := sold || jsonb_build_object('lourd', v);
  if jsonb_typeof(f -> 'heroes') = 'object' then
    for k, h in select * from jsonb_each(f -> 'heroes') loop
      if k in ('fregate', 'cuirasse', 'tanker') and jsonb_typeof(h) = 'object' and coalesce(h ->> 'name', '') <> '' then
        her := her || jsonb_build_object(k, jsonb_build_object('name', left(h ->> 'name', 40), 'dead', coalesce(h ->> 'dead', 'false') in ('true', 't', '1')));
      end if;
    end loop;
  end if;
  if jsonb_typeof(f -> 'premium') = 'array' then
    for p in select * from jsonb_array_elements(f -> 'premium') loop
      exit when jsonb_array_length(prem) >= 13;
      if jsonb_typeof(p) = 'object' and (p ->> 'pid') ~ '^[0-9a-f-]{36}$' then
        prem := prem || jsonb_build_array(jsonb_build_object('pid', p ->> 'pid', 'cat', left(coalesce(p ->> 'cat', ''), 20), 'item', left(coalesce(p ->> 'item', ''), 40)));
      end if;
    end loop;
  end if;
  entry := jsonb_build_object(
    'id', left(f ->> 'id', 80),
    'name', left(coalesce(f ->> 'name', ''), 40),
    'world', left(coalesce(f ->> 'world', 'home'), 40),
    'status', left(coalesce(f ->> 'status', 'prepared'), 20),
    'composition', comp, 'soldiers', sold, 'heroes', her, 'premium', prem);
end $$;

create or replace function public._mp_clean_fleets(f jsonb, p_user uuid) returns jsonb
language plpgsql as $$
declare res jsonb := '[]'::jsonb; e jsonb; c record; clamped int := 0; seen text[] := '{}';
begin
  if f is null or jsonb_typeof(f) <> 'array' then return '[]'::jsonb; end if;
  for e in select * from jsonb_array_elements(f) loop
    exit when jsonb_array_length(res) >= 12;
    select * into c from public._mp_clean_fleet_entry(e);
    clamped := clamped + coalesce(c.clamped, 0);
    if c.entry is null or (c.entry ->> 'id') = any (seen) then continue; end if;
    seen := seen || (c.entry ->> 'id');
    res := res || jsonb_build_array(c.entry);
  end loop;
  if clamped > 0 then perform public._mp_anomaly(p_user, 'fleet_clamped', jsonb_build_object('values', clamped, 'sent', f)); end if;
  return res;
end $$;

create or replace function public._mp_worlds_fleets_clean() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.fleets := public._mp_clean_fleets(new.fleets, new.user_id);
  return new;
end $$;
drop trigger if exists worlds_clean_fleets on public.worlds;
create trigger worlds_clean_fleets before insert or update of fleets on public.worlds
for each row execute function public._mp_worlds_fleets_clean();

-- ── 4. La flotte d'un raid vient du registre ──
-- p_fleet n'apporte que l'id (et, à défaut, rien). Composition, soldats, héros et vaisseaux d'exception viennent de worlds.fleets.
-- Les vaisseaux d'exception restent vérifiés contre bm_purchases par resolve-raids (validPremium), comme avant.
-- (Un refus est une exception, qui annule tout ce que la transaction a écrit, journal compris : les refus ne laissent
--  donc pas de ligne dans mp_anomalies — ils sont visibles dans les logs PostgREST de Supabase. Seuls les rabotages,
--  qui aboutissent, sont journalisés.)
create or replace function public._mp_registry_fleet(me public.worlds, p_fleet jsonb) returns jsonb
language plpgsql as $$
declare fid text; e jsonb; found_f jsonb := null;
begin
  fid := case when p_fleet is not null and jsonb_typeof(p_fleet) = 'object' then left(p_fleet ->> 'id', 80) else null end;
  if coalesce(fid, '') = '' then raise exception 'fleet_unknown'; end if;
  for e in select * from jsonb_array_elements(coalesce(me.fleets, '[]'::jsonb)) loop
    if e ->> 'id' = fid then found_f := e; exit; end if;
  end loop;
  if found_f is null then raise exception 'fleet_unknown'; end if;
  -- une flotte sans aucun vaisseau ne part pas
  if (select coalesce(sum(public._mp_num(v.value)), 0)
        from jsonb_each_text(coalesce(found_f -> 'composition' -> 'fregate', '{}'::jsonb)) v) +
     (select coalesce(sum(public._mp_num(v.value)), 0)
        from jsonb_each_text(coalesce(found_f -> 'composition' -> 'cuirasse', '{}'::jsonb)) v) +
     (select coalesce(sum(public._mp_num(v.value)), 0)
        from jsonb_each_text(coalesce(found_f -> 'composition' -> 'tanker', '{}'::jsonb)) v) +
     jsonb_array_length(coalesce(found_f -> 'premium', '[]'::jsonb)) <= 0 then
    raise exception 'fleet_invalid';
  end if;
  return jsonb_build_object('id', fid,
    'composition', found_f -> 'composition', 'soldiers', found_f -> 'soldiers',
    'heroes', coalesce(found_f -> 'heroes', '{}'::jsonb), 'premium', coalesce(found_f -> 'premium', '[]'::jsonb));
end $$;
revoke all on function public._mp_registry_fleet(public.worlds, jsonb) from public, anon, authenticated;

-- mp_launch_raid : identique à v24, sauf la ligne « p_fleet := public._mp_clean_fleet(p_fleet) » remplacée par le registre.
CREATE OR REPLACE FUNCTION public.mp_launch_raid(p_target_address text, p_fleet jsonb, p_fleet_name text DEFAULT NULL::text, p_origin_address text DEFAULT NULL::text)
 RETURNS raids
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me  public.worlds;
  tgt public.worlds;
  col public.colonies;
  is_col boolean := false;
  tgt_shield timestamptz;
  travel interval;
  r   public.raids;
  origin text;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into tgt from public.worlds where address = p_target_address;
  if not found then
    select * into col from public.colonies where address = p_target_address;
    if not found then raise exception 'target_unknown'; end if;
    select * into tgt from public.worlds where user_id = col.user_id;
    if not found then raise exception 'target_unknown'; end if;
    is_col := true;
  end if;
  if tgt.user_id = me.user_id then raise exception 'target_self'; end if;
  if (case when is_col then col.season else tgt.season end) <> me.season then raise exception 'target_other_season'; end if;
  perform public._mp_pair_lock(me.user_id, tgt.user_id);
  perform public._mp_expire_relations();   -- v23 : pactes par pavillon arrivés à échéance
  if exists (select 1 from public.pacts where status = 'active'
              and least(proposer_id, partner_id) = least(me.user_id, tgt.user_id)
              and greatest(proposer_id, partner_id) = greatest(me.user_id, tgt.user_id)) then
    raise exception 'pact_active';
  end if;
  tgt_shield := case when is_col then col.shield_until else tgt.shield_until end;
  -- la protection de fondation d'une colonie est une règle du jeu (pas une garde de la saison de test)
  if tgt_shield > now() and (is_col or public.mp_guards_on()) then raise exception 'target_shielded'; end if;
  if me.shield_until > now() and me.created_at > now() - interval '72 hours' then
    update public.worlds set shield_until = now() where user_id = me.user_id;
  end if;
  -- l'écart de niveau se juge sur l'empire (le niveau du propriétaire), pas sur la colonie naissante
  if public.mp_guards_on() and tgt.level * 2 < me.level then raise exception 'target_too_weak'; end if;
  if public.mp_guards_on() and exists (select 1 from public.raids where attacker_id = me.user_id and defender_address = p_target_address and status = 'enroute') then
    raise exception 'raid_already_enroute';
  end if;
  p_fleet := public._mp_registry_fleet(me, p_fleet);   -- v46 : la flotte est celle du registre, pas celle de l'appel
  -- départ d'une de mes colonies : le trajet se compte depuis elle
  origin := me.address;
  if p_origin_address is not null and p_origin_address <> me.address then
    if not exists (select 1 from public.colonies where user_id = me.user_id and address = p_origin_address) then raise exception 'origin_unknown'; end if;
    origin := p_origin_address;
    update public.colonies set shield_until = least(shield_until, now()) where user_id = me.user_id and address = origin;   -- une colonie qui attaque perd sa protection
  end if;
  travel := make_interval(mins => 10 + 5 * least(public.mp_sector_distance(origin, p_target_address), 25));
  insert into public.raids (attacker_id, defender_id, attacker_address, defender_address, attacker_pseudo, defender_pseudo,
                            fleet_name, fleet, arrives_at, returns_at)
    values (me.user_id, tgt.user_id, origin, p_target_address, me.pseudo, tgt.pseudo,
            p_fleet_name, p_fleet, now() + travel, now() + travel * 2)
    returning * into r;
  return r;
end $function$;

-- Fin v46. Vérification : select count(*) from pg_proc where proname = '_mp_registry_fleet';  → 1
