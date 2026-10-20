-- v20 (20/10/2026) — CORRECTIFS DE L'AUDIT avant les tests réels entre commandants.
-- À coller tel quel dans Supabase → SQL Editor → Run, PUIS redéployer la fonction resolve-raids (index.ts modifié).
--   · stocks publiés nettoyés (un stock bizarre ne bloque plus la résolution des raids) ; lecture tolérante au pillage
--   · un raid annulé ne donne plus de bouclier ni de fausse rumeur ; un raid irrésoluble est abandonné après 5 essais
--   · remise en file d'après l'heure de prise en charge (plus d'après l'heure d'arrivée)
--   · flottes de raid et d'embuscade nettoyées ; une embuscade abîmée ne bloque plus les abordages automatiques des autres
--   · colonie : 72 h de protection réellement appliquées ; elle perd sa protection si elle attaque ; fondation limitée
--   · raid et convoi partis d'une colonie : inscrits depuis la colonie
--   · sonde : plus de joker qui liste tout le registre
--   · pavillon, chat, ambassade et don de route vers une colonie : arrivent à son commandant
--   · rappel d'embuscade rejouable (la cale n'est plus perdue si la réponse se perd)
--   · postes de route : au-delà de 3, le plus ancien est fermé au lieu de bloquer
--   · pillage du stock commun : une seule fois par 12 h, toutes planètes confondues (quand les gardes sont actives)

drop function if exists public.mp_launch_raid(text, jsonb, text);

-- ── 1. Nombres tolérants, stocks et flottes propres ──
create or replace function public._mp_num(x text, cap bigint default 2000000000) returns bigint
language sql immutable as $$
  select case when x ~ '^\s*[0-9]{1,18}(\.[0-9]+)?\s*$' then least(cap, floor(x::numeric)::bigint) else 0 end
$$;

create or replace function public._mp_clean_stocks(s jsonb) returns jsonb
language plpgsql immutable as $$
declare o jsonb := '{}'::jsonb; k text;
begin
  if s is null or jsonb_typeof(s) <> 'object' then return '{"metal":0,"energie":0,"cristal":0}'::jsonb; end if;
  for k in select jsonb_object_keys(s) loop
    if length(k) <= 24 then o := o || jsonb_build_object(k, public._mp_num(s ->> k)); end if;
  end loop;
  foreach k in array array['metal', 'energie', 'cristal'] loop
    if not (o ? k) then o := o || jsonb_build_object(k, 0); end if;
  end loop;
  return o;
end $$;

create or replace function public._mp_worlds_clean() returns trigger
language plpgsql as $$
begin
  new.stocks := public._mp_clean_stocks(new.stocks);
  return new;
end $$;
drop trigger if exists worlds_clean_stocks on public.worlds;
create trigger worlds_clean_stocks before insert or update of stocks on public.worlds
  for each row execute function public._mp_worlds_clean();
update public.worlds set stocks = public._mp_clean_stocks(stocks) where stocks is distinct from public._mp_clean_stocks(stocks);

-- entiers 0..100000 par type et par tier (même règle que cleanFleet dans la fonction serveur)
create or replace function public._mp_clean_fleet(f jsonb) returns jsonb
language plpgsql immutable as $$
declare comp jsonb := '{}'::jsonb; ty text; t text; one jsonb;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return null; end if;
  foreach ty in array array['fregate', 'cuirasse', 'tanker'] loop
    one := '{}'::jsonb;
    foreach t in array array['t1', 't2', 't3'] loop
      one := one || jsonb_build_object(t, public._mp_num(f -> 'composition' -> ty ->> t, 100000));
    end loop;
    comp := comp || jsonb_build_object(ty, one);
  end loop;
  return f || jsonb_build_object('composition', comp);
end $$;
update public.ambushes set fleet = public._mp_clean_fleet(fleet) where left_at is null and fleet is not null;

-- ── 2. Raids : prise en charge datée, abandon après 5 essais ──
alter table public.raids add column if not exists claimed_at timestamptz;
alter table public.raids add column if not exists attempts int not null default 0;

create or replace function public.mp_claim_due_raids(p_limit int default 20)
returns setof public.raids
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from public.raids
    where status = 'enroute' and arrives_at <= now()
    order by attempts, arrives_at
    limit p_limit
    for update skip locked
  )
  update public.raids r set status = 'resolving', claimed_at = now(), attempts = r.attempts + 1
  from due where r.id = due.id
  returning r.*;
end $$;

create or replace function public.mp_requeue_stuck_raids()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- 5 essais ratés : raid abandonné (la flotte rentre sans combat, rien n'est appliqué au défenseur)
  update public.raids set status = 'aborted', resolved_at = now(),
         result = '{"outcome":"aborted","reason":"unresolvable","loot":{"metal":0,"energie":0,"cristal":0}}'::jsonb
   where status = 'resolving' and attempts >= 5 and coalesce(claimed_at, arrives_at) < now() - interval '5 minutes';
  with x as (
    update public.raids set status = 'enroute'
    where status = 'resolving' and coalesce(claimed_at, arrives_at) < now() - interval '5 minutes'
    returning 1
  ) select count(*)::int into n from x;
  return n;
end $$;
revoke all on function public.mp_claim_due_raids(int) from public, anon, authenticated;
revoke all on function public.mp_requeue_stuck_raids() from public, anon, authenticated;
grant execute on function public.mp_claim_due_raids(int) to service_role;
grant execute on function public.mp_requeue_stuck_raids() to service_role;

-- ── 3. Issue d'un raid ──
CREATE OR REPLACE FUNCTION public.mp_finish_raid(p_raid uuid, p_result jsonb)
 RETURNS raids
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r    public.raids;
  dw   public.worlds;
  col  public.colonies;
  is_col boolean := false;
  loot jsonb := '{}'::jsonb;
  k    text;
  want bigint; have bigint; got bigint;
  victory boolean;
  blds jsonb;
  src  jsonb;
  dmg  text := p_result ->> 'damaged_building';
begin
  select * into r from public.raids where id = p_raid and status = 'resolving' for update;
  if not found then raise exception 'raid_not_resolving'; end if;
  select * into dw from public.worlds where user_id = r.defender_id for update;
  if dw.address is distinct from r.defender_address then
    select * into col from public.colonies where address = r.defender_address and user_id = r.defender_id for update;
    is_col := found;
  end if;
  victory := coalesce(p_result ->> 'outcome', '') in ('victory', 'pyrrhic', 'heroic');

  if victory then
    foreach k in array array['metal', 'energie', 'cristal'] loop
      want := public._mp_num(p_result -> 'loot' ->> k);
      have := public._mp_num(dw.stocks ->> k);
      -- stock commun déjà pillé ces 12 dernières heures (n'importe quelle planète) : rien de plus à prendre
      if public.mp_guards_on() and exists (select 1 from public.raids x where x.defender_id = r.defender_id and x.id <> r.id and x.status = 'resolved'
                 and x.resolved_at > now() - interval '12 hours'
                 and public._mp_num(x.result -> 'loot' ->> 'metal') + public._mp_num(x.result -> 'loot' ->> 'energie') + public._mp_num(x.result -> 'loot' ->> 'cristal') > 0) then have := 0; end if;
      got  := least(want, floor(have * 0.30)::bigint);
      loot := loot || jsonb_build_object(k, got);
    end loop;
    src := case when is_col then col.buildings else dw.buildings end;
    blds := src;
    if dmg is not null then
      with arr as (select e.b, e.ord from jsonb_array_elements(src) with ordinality as e(b, ord)),
           first_one as (select min(ord) as m from arr where b ->> 'key' = dmg)
      select coalesce(jsonb_agg(case when arr.ord = (select m from first_one) then arr.b || '{"state":"damaged"}'::jsonb else arr.b end order by arr.ord), '[]'::jsonb)
        into blds
        from arr;
    end if;
    update public.worlds set
      stocks = stocks || jsonb_build_object(
        'metal',   greatest(0, public._mp_num(stocks ->> 'metal')   - (loot ->> 'metal')::bigint),
        'energie', greatest(0, public._mp_num(stocks ->> 'energie') - (loot ->> 'energie')::bigint),
        'cristal', greatest(0, public._mp_num(stocks ->> 'cristal') - (loot ->> 'cristal')::bigint)),
      buildings = case when is_col then buildings else blds end,
      shield_until = case when is_col then shield_until else greatest(shield_until, now() + interval '12 hours') end
    where user_id = r.defender_id;
    if is_col then
      update public.colonies set buildings = blds, shield_until = greatest(shield_until, now() + interval '12 hours') where id = col.id;
    end if;
  elsif coalesce(p_result ->> 'outcome', '') <> 'aborted' then
    if is_col then
      update public.colonies set shield_until = greatest(shield_until, now() + interval '12 hours') where id = col.id;
    else
      update public.worlds set shield_until = greatest(shield_until, now() + interval '12 hours') where user_id = r.defender_id;
    end if;
  end if;

  update public.raids set
    status = case when p_result ->> 'outcome' = 'aborted' then 'aborted' else 'resolved' end,
    result = p_result || jsonb_build_object('loot', case when victory then loot else '{"metal":0,"energie":0,"cristal":0}'::jsonb end),
    resolved_at = now()
  where id = p_raid
  returning * into r;

  if r.status = 'aborted' then return r; end if;   -- pas de combat : ni bouclier ni rumeur
  insert into public.rumors (kind, actor, target, sector, payload)
  values (case when victory then 'raid_victory' else 'raid_repelled' end,
          r.attacker_pseudo, r.defender_pseudo, split_part(r.defender_address, '-', 2), '{}'::jsonb);
  return r;
end $function$;

-- ── 4. Lancer un raid ──
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
  p_fleet := public._mp_clean_fleet(p_fleet);
  if p_fleet is null then raise exception 'fleet_invalid'; end if;
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
revoke all on function public.mp_launch_raid(text, jsonb, text, text) from public, anon;
grant execute on function public.mp_launch_raid(text, jsonb, text, text) to authenticated;

-- ── 5. Sonde : un système précis, pas de joker ; la fiche dit la vraie protection ──
CREATE OR REPLACE FUNCTION public.mp_probe_system(p_system text)
 RETURNS TABLE(address text, pseudo text, planet_name text, level_estimate integer, last_seen_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.address, w.pseudo, w.planet_name,
         greatest(1, (round(w.level / 5.0) * 5)::int),
         extract(day from now() - w.last_seen)::int
  from public.worlds w
  where p_system ~ '^[A-Z]-[A-Z]-[0-9]{4}$' and split_part(w.address, '-', 1) || '-' || split_part(w.address, '-', 2) || '-' || split_part(w.address, '-', 3) = p_system
    and w.user_id <> auth.uid()
    and w.season = public.mp_season()
  union all
  select c.address, w.pseudo, c.name,
         greatest(1, (round(c.level / 5.0) * 5)::int),
         extract(day from now() - c.last_seen)::int
  from public.colonies c join public.worlds w on w.user_id = c.user_id
  where p_system ~ '^[A-Z]-[A-Z]-[0-9]{4}$' and split_part(c.address, '-', 1) || '-' || split_part(c.address, '-', 2) || '-' || split_part(c.address, '-', 3) = p_system
    and c.user_id <> auth.uid()
    and c.season = public.mp_season()
$function$;

CREATE OR REPLACE FUNCTION public.mp_world_card(p_address text)
 RETURNS TABLE(address text, pseudo text, planet_name text, level_estimate integer, defense_estimate integer, shielded boolean, last_seen_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.address, w.pseudo, w.planet_name,
         greatest(1, (round(w.level / 5.0) * 5)::int),
         (round(w.defense / 100.0) * 100)::int,
         w.shield_until > now() and public.mp_guards_on(),
         extract(day from now() - w.last_seen)::int
  from public.worlds w
  where w.address = p_address and w.user_id <> auth.uid()
  union all
  select c.address, w.pseudo, c.name,
         greatest(1, (round(c.level / 5.0) * 5)::int),
         (round(c.defense / 100.0) * 100)::int,
         c.shield_until > now(),
         extract(day from now() - c.last_seen)::int
  from public.colonies c join public.worlds w on w.user_id = c.user_id
  where c.address = p_address and c.user_id <> auth.uid()
$function$;

-- ── 6. Colonies : une adresse = un seul monde, fondation limitée ──
CREATE OR REPLACE FUNCTION public._mp_address_free()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform pg_advisory_xact_lock(hashtext('addr:' || new.address));
  if tg_table_name = 'worlds' then
    if exists (select 1 from public.colonies c where c.address = new.address) then raise exception 'address_taken'; end if;
  else
    if exists (select 1 from public.worlds w where w.address = new.address) then raise exception 'address_taken'; end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.mp_colony_claim(p_address text, p_name text DEFAULT NULL::text)
 RETURNS colonies
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  c  public.colonies;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.worlds where user_id = me) then raise exception 'no_world'; end if;
  if p_address is null or p_address !~ '^[A-Z]-[A-Z]-[0-9]{4}-[0-9]{1,2}$' then raise exception 'address_invalid'; end if;
  select * into c from public.colonies where address = p_address;
  if found then
    if c.user_id = me then return c; end if;
    raise exception 'address_taken';
  end if;
  if exists (select 1 from public.worlds where address = p_address) then raise exception 'address_taken'; end if;
  if (select count(*) from public.colonies where user_id = me) >= 12 then raise exception 'too_many_colonies'; end if;
  if (select count(*) from public.colonies where user_id = me and created_at > now() - interval '24 hours') >= 3 then raise exception 'colony_rate'; end if;
  begin
    insert into public.colonies (user_id, address, name) values (me, p_address, left(coalesce(nullif(trim(p_name), ''), p_address), 40))
      returning * into c;
  exception when unique_violation then raise exception 'address_taken';
  end;
  return c;
end $function$;

-- ── 7. Une adresse de colonie mène à son commandant (pavillon, chat, ambassade, don de route) ──
create or replace function public._mp_owner_of(p_address text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select user_id from public.worlds where address = p_address),
                  (select user_id from public.colonies where address = p_address))
$$;
revoke all on function public._mp_owner_of(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mp_orbit_arrive(p_to_address text, p_mission text, p_tanker text, p_cargo jsonb, p_loss_applied boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; tgt public.worlds; pid uuid; c jsonb := '{}'::jsonb; k text; q bigint; total bigint := 0; lost jsonb;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into tgt from public.worlds where user_id = public._mp_owner_of(p_to_address);
  if not found then raise exception 'target_unknown'; end if;
  if tgt.user_id = me.user_id then raise exception 'target_self'; end if;
  if p_mission is null or length(p_mission) > 80 then raise exception 'mission_invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit:' || me.user_id::text));   -- quotas sans course entre deux appareils
  select id into pid from public.orbit_presence where user_id = me.user_id and mission_id = p_mission;
  if found then return pid; end if;
  if (select count(*) from public.orbit_presence where user_id = me.user_id and left_at is null) >= 12 then
    raise exception 'orbit_quota';
  end if;
  -- anti-abus : 3 ambassades par jour vers un même monde, 10 par jour en tout
  if (select count(*) from public.orbit_presence where user_id = me.user_id and target_id = tgt.user_id
        and arrived_at > now() - interval '1 day') >= 3
     or (select count(*) from public.orbit_presence where user_id = me.user_id and arrived_at > now() - interval '1 day') >= 10 then
    raise exception 'orbit_rate';
  end if;
  -- verrou du convoi aller : un abordage en cours de résolution et l'arrivée ne se croisent pas
  select loot into lost from public.convoys where user_id = me.user_id and mission_id = p_mission and leg = 'out' for update;
  if p_loss_applied then lost := null; end if;          -- le jeu a déjà retiré le butin de sa cale
  -- cale : entiers positifs, trois ressources, plafond d'un Tanker T3 (+ marge des rencontres de route)
  foreach k in array array['metal', 'energie', 'cristal'] loop
    if (p_cargo ->> k) is not null and (p_cargo ->> k) !~ '^[0-9]{1,9}(\.[0-9]+)?$' then raise exception 'cargo_invalid'; end if;
    q := least(150000, coalesce(floor((p_cargo ->> k)::numeric)::bigint, 0));
    q := greatest(0, q - coalesce((lost ->> k)::bigint, 0));
    if q > 0 then c := c || jsonb_build_object(k, q); total := total + q; end if;
  end loop;
  if total > 150000 then raise exception 'cargo_invalid'; end if;
  insert into public.orbit_presence (user_id, target_id, owner_pseudo, owner_address, target_pseudo, target_address,
                                     mission_id, tanker_name, cargo, cargo_state)
    values (me.user_id, tgt.user_id, me.pseudo, me.address, tgt.pseudo, tgt.address,
            p_mission, left(coalesce(p_tanker, ''), 24), c, case when total > 0 then 'offered' else 'none' end)
    returning id into pid;
  return pid;
end $function$;

CREATE OR REPLACE FUNCTION public.mp_send_flag(p_to_address text, p_flag_key text, p_context text DEFAULT 'orbit'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; tgt public.worlds;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into tgt from public.worlds where user_id = public._mp_owner_of(p_to_address);
  if not found then raise exception 'target_unknown'; end if;
  if tgt.user_id = me.user_id then raise exception 'target_self'; end if;
  if (select count(*) from public.flags where from_id = me.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'flag_quota';
  end if;
  insert into public.flags (from_id, to_id, from_pseudo, flag_key, context)
    values (me.user_id, tgt.user_id, me.pseudo, p_flag_key, coalesce(p_context, 'orbit'));
end $function$;

CREATE OR REPLACE FUNCTION public.mp_chat_send(p_to_address text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; tgt public.worlds; b text; r public.chat_messages;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into tgt from public.worlds where user_id = public._mp_owner_of(p_to_address);
  if not found then raise exception 'target_unknown'; end if;
  if tgt.user_id = me.user_id then raise exception 'target_self'; end if;
  if not public._mp_chat_open(me.user_id, tgt.user_id) then raise exception 'chat_closed'; end if;
  -- texte brut : caractères de contrôle remplacés, espaces repliés
  b := btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]', ' ', 'g'), '\s{2,}', ' ', 'g'));
  if b = '' then raise exception 'chat_empty'; end if;
  if char_length(b) > 280 then raise exception 'chat_too_long'; end if;
  if (select count(*) from public.chat_messages where sender_id = me.user_id and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'chat_rate';
  end if;
  if (select count(*) from public.chat_messages where sender_id = me.user_id and created_at > now() - interval '1 day') >= 300 then
    raise exception 'chat_quota';
  end if;
  insert into public.chat_messages (a_id, b_id, sender_id, recipient_id, sender_pseudo, body)
    values (least(me.user_id, tgt.user_id), greatest(me.user_id, tgt.user_id), me.user_id, tgt.user_id, me.pseudo, b)
    returning * into r;
  -- ménage : plus de 30 jours
  delete from public.chat_messages where a_id = r.a_id and b_id = r.b_id and created_at < now() - interval '30 days';
  return jsonb_build_object('id', r.id, 'mine', true, 'pseudo', r.sender_pseudo, 'body', r.body, 'created_at', r.created_at, 'read_at', null);
end $function$;

CREATE OR REPLACE FUNCTION public.mp_chat_thread(p_with_address text, p_limit integer DEFAULT 80)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); tgt public.worlds; msgs jsonb;
begin
  if me is null then raise exception 'no_world'; end if;
  select * into tgt from public.worlds where user_id = public._mp_owner_of(p_with_address);
  if not found then raise exception 'target_unknown'; end if;
  select coalesce(jsonb_agg(m order by m.created_at), '[]'::jsonb) into msgs from (
    select id, sender_id = me as mine, sender_pseudo as pseudo, body, created_at, read_at
      from public.chat_messages
     where a_id = least(me, tgt.user_id) and b_id = greatest(me, tgt.user_id)
     order by created_at desc limit greatest(1, least(coalesce(p_limit, 80), 200))
  ) m;
  return jsonb_build_object('open', public._mp_chat_open(me, tgt.user_id), 'pseudo', tgt.pseudo, 'messages', msgs);
end $function$;

CREATE OR REPLACE FUNCTION public.mp_route_give(p_to_address text, p_route jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; tgt public.worlds; gid uuid; chain jsonb; clean jsonb := '[]'::jsonb; x jsonb;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into tgt from public.worlds where user_id = public._mp_owner_of(p_to_address);
  if not found then raise exception 'target_unknown'; end if;
  if tgt.user_id = me.user_id then raise exception 'target_self'; end if;
  if (select count(*) from public.route_gifts where from_id = me.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'gift_rate';
  end if;
  chain := p_route -> 'chain';
  if jsonb_typeof(chain) <> 'array' then raise exception 'route_invalid'; end if;
  for x in select * from jsonb_array_elements(chain) limit 12 loop
    if jsonb_typeof(x) = 'string' and (x #>> '{}') ~ '^[A-Z]-[A-Z]-[0-9]{4}$' then clean := clean || jsonb_build_array(x #>> '{}'); end if;
  end loop;
  if jsonb_array_length(clean) < 2 then raise exception 'route_invalid'; end if;
  insert into public.route_gifts (from_id, from_pseudo, to_id, route)
    values (me.user_id, me.pseudo, tgt.user_id, jsonb_build_object(
      'name', left(coalesce(p_route ->> 'name', 'Route offerte'), 60),
      'toLabel', left(p_route ->> 'toLabel', 40),
      'chain', clean))
    returning id into gid;
  return gid;
end $function$;

-- ── 8. Embuscades ──
CREATE OR REPLACE FUNCTION public.mp_ambush_post(p_fleet_id text, p_fleet_name text, p_system text, p_fleet jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; aid uuid; old public.ambushes; sys text := public._mp_system(p_system);
begin
  p_fleet := public._mp_clean_fleet(p_fleet);
  if p_fleet is null then raise exception 'ambush_invalid'; end if;
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  if sys is null or p_fleet_id is null or length(p_fleet_id) > 80 or jsonb_typeof(p_fleet) <> 'object' then raise exception 'ambush_invalid'; end if;
  if not exists (select 1 from public.beacons where user_id = me.user_id and removed_at is null and system = sys) then
    raise exception 'no_beacon';
  end if;
  perform pg_advisory_xact_lock(hashtext('ambush:' || me.user_id::text));
  select * into old from public.ambushes where user_id = me.user_id and fleet_id = p_fleet_id and left_at is null for update;
  if found then
    if old.system = sys then return old.id; end if;
    -- ancienne embuscade restée ouverte (réponse perdue) : fermée, sa cale suit la flotte
    update public.ambushes set left_at = now(), hold_claimed = true where id = old.id;
    if exists (select 1 from public.intercepts where ambush_id = old.id and status in ('pending', 'resolving')) then raise exception 'combat_pending'; end if;
  end if;
  insert into public.ambushes (user_id, pseudo, fleet_id, fleet_name, system, fleet, hold)
    values (me.user_id, me.pseudo, p_fleet_id, left(coalesce(p_fleet_name, ''), 40), sys, p_fleet,
            case when old.id is not null and not old.hold_claimed then old.hold else '{}'::jsonb end)
    returning id into aid;
  return aid;
end $function$;

CREATE OR REPLACE FUNCTION public.mp_ambush_leave(p_ambush uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.ambushes;
begin
  select * into a from public.ambushes where id = p_ambush and user_id = auth.uid() for update;
  if not found then raise exception 'ambush_unknown'; end if;
  -- abordage jamais résolu (fonction serveur indisponible) depuis 10 min : annulé, le convoi reprend sa route
  update public.convoys c set status = case when now() < c.arrives_at and not c.cancelled then 'enroute' else 'ended' end
    from public.intercepts i
   where i.ambush_id = a.id and i.status = 'pending' and i.created_at < now() - interval '10 minutes'
     and c.id = i.convoy_id and c.status = 'engaged';
  delete from public.intercepts where ambush_id = a.id and status = 'pending' and created_at < now() - interval '10 minutes';
  if exists (select 1 from public.intercepts where ambush_id = a.id and status in ('pending', 'resolving')) then
    raise exception 'combat_pending';
  end if;
  update public.ambushes set left_at = coalesce(left_at, now()), hold_claimed = true where id = a.id;
  -- v20 : rejouable par son propriétaire (réponse perdue) : la même cale est renvoyée, 'again' dit qu'elle a déjà été rendue
  return jsonb_build_object('fleet', a.fleet, 'hold', a.hold, 'again', a.hold_claimed);
end $function$;

CREATE OR REPLACE FUNCTION public.mp_auto_ambush()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.ambushes; c public.convoys; me public.worlds; vw public.worlds; n int := 0; v_mode text;
        last timestamptz; cap bigint; held bigint; csum bigint; t text;
begin
  if auth.uid() is null then return 0; end if;
  if not pg_try_advisory_xact_lock(hashtext('mp_auto_ambush')) then return 0; end if;
  select (value #>> '{}')::timestamptz into last from public.mp_settings where key = 'auto_ambush_at';
  if last is not null and last > now() - interval '15 seconds' then return 0; end if;
  insert into public.mp_settings (key, value) values ('auto_ambush_at', to_jsonb(now()))
    on conflict (key) do update set value = excluded.value, updated_at = now();

  for a in select * from public.ambushes
            where left_at is null and orders ->> 'mode' in ('rob_heavy', 'rob_all', 'spy')
              and coalesce((orders ->> 'players')::boolean, false)
            order by posted_at limit 200 loop
    begin
    v_mode := a.orders ->> 'mode';
    if v_mode <> 'spy' and exists (select 1 from public.intercepts where ambush_id = a.id and status in ('pending', 'resolving')) then continue; end if;
    select * into me from public.worlds where user_id = a.user_id;
    if not found then continue; end if;
    -- plus de vaisseau armé : elle ne peut plus aborder (elle file encore)
    if v_mode <> 'spy' and coalesce((select sum(coalesce((a.fleet -> 'composition' -> u_ty ->> u_t)::bigint, 0))
                                       from unnest(array['fregate', 'cuirasse']) u_ty, unnest(array['t1', 't2', 't3']) u_t), 0) = 0 then continue; end if;
    -- cale pleine : la flotte regarde passer (on ne se bat pas pour rien)
    if v_mode <> 'spy' then
      cap := 0;
      foreach t in array array['t1', 't2', 't3'] loop
        cap := cap + coalesce((a.fleet -> 'composition' -> 'tanker' ->> t)::bigint, 0) * public._mp_cargo_cap(substring(t from 2)::int);
      end loop;
      held := coalesce((a.hold ->> 'metal')::bigint, 0) + coalesce((a.hold ->> 'energie')::bigint, 0) + coalesce((a.hold ->> 'cristal')::bigint, 0);
      if cap - held <= 0 then continue; end if;
    end if;
    for c in select cv.* from public.convoys cv
              where cv.status = 'enroute' and cv.user_id <> a.user_id and now() < cv.arrives_at and not cv.cancelled
                and (cv.from_system = a.system or cv.to_system = a.system or (cv.via is not null and a.system = any(cv.via)))
                and public._mp_convoy_visible(cv, a.user_id, a.system)
              order by cv.departed_at loop
      select * into vw from public.worlds where user_id = c.user_id;
      if found then
        if vw.season <> me.season then continue; end if;
        if public.mp_guards_on() and vw.created_at > now() - interval '72 hours' then continue; end if;
        if public.mp_guards_on() and vw.level * 2 < me.level then continue; end if;
      end if;
      if exists (select 1 from public.pacts where status = 'active'
                  and least(proposer_id, partner_id) = least(a.user_id, c.user_id)
                  and greatest(proposer_id, partner_id) = greatest(a.user_id, c.user_id)) then continue; end if;
      if v_mode = 'spy' then
        if not exists (select 1 from public.spied where pirate_id = a.user_id and convoy_id = c.id) then
          insert into public.spied (pirate_id, victim_id, convoy_id, from_system, to_system, auto, seen)
            values (a.user_id, c.user_id, c.id, c.from_system, c.to_system, true, false)
            on conflict (pirate_id, convoy_id) do nothing;
          n := n + 1;
        end if;
        continue;
      end if;
      if exists (select 1 from public.intercepts where convoy_id = c.id) then continue; end if;
      csum := coalesce((c.cargo ->> 'metal')::bigint, 0) + coalesce((c.cargo ->> 'energie')::bigint, 0) + coalesce((c.cargo ->> 'cristal')::bigint, 0);
      if csum = 0 then continue; end if;                                                  -- cale vide : rien à prendre
      if v_mode = 'rob_heavy' and csum <= public._mp_cargo_cap(c.tanker_tier) / 2 then continue; end if;
      perform public._mp_pair_lock(a.user_id, c.user_id);
      update public.convoys set status = 'engaged' where id = c.id and status = 'enroute';
      if not found then continue; end if;
      insert into public.intercepts (ambush_id, convoy_id, pirate_id, victim_id) values (a.id, c.id, a.user_id, c.user_id);
      n := n + 1;
      exit;                                                                               -- un abordage à la fois par flotte
    end loop;
    exception when others then
      raise warning 'mp_auto_ambush : embuscade % ignorée (%)', a.id, sqlerrm;
    end;
  end loop;
  return n;
end $function$;

-- ── 9. Convois : départ et retour sur la planète de la mission ──
drop function if exists public.mp_convoy_start(text, text, text, text, text, text, integer, numeric, integer, text, jsonb, bigint, bigint);
CREATE OR REPLACE FUNCTION public.mp_convoy_start(p_mission text, p_leg text, p_kind text, p_to text, p_dock text, p_route_type text, p_knowledge integer, p_protection numeric, p_tier integer, p_tanker text, p_cargo jsonb, p_duration_ms bigint, p_elapsed_ms bigint DEFAULT 0, p_origin_address text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; origin text; cid uuid; tier int := greatest(1, least(3, coalesce(p_tier, 1)));
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  if p_mission is null or length(p_mission) > 80 or p_leg not in ('out', 'back') or p_kind not in ('route', 'embassy') then
    raise exception 'convoy_invalid';
  end if;
  if public._mp_system(p_to) is null then raise exception 'convoy_invalid'; end if;
  origin := me.address;
  if p_origin_address is not null and p_origin_address <> me.address then
    if not exists (select 1 from public.colonies where user_id = me.user_id and address = p_origin_address) then raise exception 'origin_unknown'; end if;
    origin := p_origin_address;
  end if;
  perform pg_advisory_xact_lock(hashtext('convoy:' || me.user_id::text));
  select id into cid from public.convoys where user_id = me.user_id and mission_id = p_mission and leg = p_leg;
  if found then return cid; end if;
  if (select count(*) from public.convoys where user_id = me.user_id and departed_at > now() - interval '1 day') >= 60 then
    raise exception 'convoy_rate';
  end if;
  insert into public.convoys (user_id, pseudo, address, mission_id, leg, kind, from_system, to_system, dock_name, route_type,
                              knowledge, protection, tanker_tier, tanker_name, cargo, departed_at, arrives_at)
    values (me.user_id, me.pseudo, me.address, p_mission, p_leg, p_kind,
            case when p_leg = 'out' then public._mp_system(origin) else public._mp_system(p_to) end,
            case when p_leg = 'out' then public._mp_system(p_to) else public._mp_system(origin) end,
            left(p_dock, 60), case when p_route_type = 'beacon' then 'beacon' else 'direct' end,
            greatest(0, least(10, coalesce(p_knowledge, 0))), greatest(0, least(1, coalesce(p_protection, 0))),
            tier, left(coalesce(p_tanker, ''), 24), public._mp_clean_cargo(p_cargo, public._mp_cargo_cap(tier)),
            now() - make_interval(secs => greatest(0, least(3 * 86400, coalesce(p_elapsed_ms, 0) / 1000.0))),   -- inscrit en retard : la fenêtre de départ n'est pas rallongée
            now() + make_interval(secs => greatest(60, least(3 * 86400, coalesce(p_duration_ms, 0) / 1000.0))))
    returning id into cid;
  return cid;
end $function$;
revoke all on function public.mp_convoy_start(text, text, text, text, text, text, integer, numeric, integer, text, jsonb, bigint, bigint, text) from public, anon;
grant execute on function public.mp_convoy_start(text, text, text, text, text, text, integer, numeric, integer, text, jsonb, bigint, bigint, text) to authenticated;

-- ── 10. Postes de route ──
CREATE OR REPLACE FUNCTION public.mp_post_open(p_mission text, p_system text, p_tanker text, p_route text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; sys text := public._mp_system(p_system); pid uuid;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  if sys is null or p_mission is null or length(p_mission) > 80 then raise exception 'post_invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('posts:' || me.user_id::text));
  select id into pid from public.route_posts where user_id = me.user_id and mission_id = p_mission;
  if found then
    update public.route_posts set left_at = null where id = pid and left_at is not null;
    return pid;
  end if;
  -- v20 : au-delà de 3 postes ouverts, les plus anciens sont fermés (postes orphelins d'un rappel hors ligne)
  update public.route_posts set left_at = now()
   where id in (select id from public.route_posts where user_id = me.user_id and left_at is null
                order by opened_at desc offset 2);
  insert into public.route_posts (user_id, pseudo, address, mission_id, system, tanker_name, route_name)
    values (me.user_id, me.pseudo, me.address, p_mission, sys, left(coalesce(p_tanker, ''), 24), left(p_route, 40))
    returning id into pid;
  return pid;
end $function$;

-- Fin v20. Vérification : select count(*) from pg_proc where proname = 'mp_launch_raid';  → 1
