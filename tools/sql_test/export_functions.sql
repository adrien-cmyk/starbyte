-- fonctions exportées de Supabase (12/11), telles quelles (ordre alphabétique : corps vérifiés à l'exécution)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public._mp_convoy_next(c convoys, p_system text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when c.via is null or array_position(c.via, p_system) is null then null
              when array_position(c.via, p_system) < cardinality(c.via) then c.via[array_position(c.via, p_system) + 1]
              else c.to_system end
$function$;

CREATE OR REPLACE FUNCTION public._mp_convoy_visible(c convoys, p_user uuid, p_system text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.user_id <> p_user
     and exists (select 1 from public.beacons b where b.user_id = p_user and b.removed_at is null and b.system = p_system)
     and public._mp_convoy_window(c, p_system) is not null
$function$;

CREATE OR REPLACE FUNCTION public._mp_convoy_window(c convoys, p_system text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare n int; i int; dur interval; eta timestamptz; half interval;
begin
  if c.status <> 'enroute' or now() >= c.arrives_at or p_system is null then return null; end if;
  -- voie balisée : un passage sur deux échappe à la balise (même tirage pour ce convoi et ce système)
  if c.route_type = 'beacon' and (hashtext(c.id::text || p_system) & 1) = 1 then return null; end if;
  if p_system = c.to_system and now() >= c.arrives_at - interval '12 minutes' then return c.arrives_at; end if;
  if p_system = c.from_system and now() < c.departed_at + interval '12 minutes' then
    return least(c.arrives_at, c.departed_at + interval '12 minutes');
  end if;
  if c.via is not null then
    i := array_position(c.via, p_system);
    if i is not null then
      n := cardinality(c.via) + 1;
      dur := c.arrives_at - c.departed_at;
      eta := c.departed_at + dur * (i::float8 / n);
      half := greatest(interval '4 minutes', dur / (2 * n));
      if now() >= eta - half and now() < eta + half then return least(c.arrives_at, eta + half); end if;
    end if;
  end if;
  return null;
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

CREATE OR REPLACE FUNCTION public.mp_ambush_post(p_fleet_id text, p_fleet_name text, p_system text, p_fleet jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; aid uuid; old public.ambushes; sys text := public._mp_system(p_system);
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  if sys is null or p_fleet_id is null or length(p_fleet_id) > 80 then raise exception 'ambush_invalid'; end if;
  p_fleet := public._mp_registry_fleet_by_id(me, p_fleet_id);   -- v47 : la flotte du registre
  p_fleet := p_fleet || jsonb_build_object('soldiers', jsonb_build_object('garde', 0, 'lourd', 0));
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
      if public._mp_same_alliance(a.user_id, c.user_id) then continue; end if;   -- v26 : pas d'abordage entre alliés
      if vw.user_id is not null and vw.peaceful and v_mode <> 'spy' then continue; end if;   -- v29 : les convois des pacifiques passent
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

CREATE OR REPLACE FUNCTION public.mp_beacon_scan()
 RETURNS TABLE(convoy_id uuid, system text, pseudo text, address text, confidence integer, tanker_tier integer, cargo_hint text, window_end timestamp with time zone, leg text, dock_name text, route_type text, can_intercept boolean, spied boolean, next_system text, on_route boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (select distinct b.system from public.beacons b where b.user_id = auth.uid() and b.removed_at is null),
  cand as (
    select c as cv, m.system as at_system
      from public.convoys c join mine m
        on (m.system = c.from_system or m.system = c.to_system or (c.via is not null and c.via @> array[m.system]))
     where c.status = 'enroute' and c.user_id <> auth.uid() and now() < c.arrives_at
  ),
  seen as (
    select (k.cv).*, k.at_system,
           public._mp_convoy_window(k.cv, k.at_system) as wend,
           public._mp_convoy_next(k.cv, k.at_system) as nxt
      from cand k
  )
  select s.id, s.at_system,
         case when s.route_type = 'beacon' then null else s.pseudo end,
         null::text,                                       -- l'adresse ne se lit pas au passage : il faut espionner la route
         case when s.route_type = 'beacon' then 40 else 60 + ((hashtext(s.id::text)::bigint % 31) + 31) % 31 end,
         s.tanker_tier,
         case when coalesce((s.cargo ->> 'metal')::bigint, 0) + coalesce((s.cargo ->> 'energie')::bigint, 0) + coalesce((s.cargo ->> 'cristal')::bigint, 0) = 0 then 'vide'
              when (coalesce((s.cargo ->> 'metal')::bigint, 0) + coalesce((s.cargo ->> 'energie')::bigint, 0) + coalesce((s.cargo ->> 'cristal')::bigint, 0))
                   > public._mp_cargo_cap(s.tanker_tier) / 2 then 'lourde' else 'légère' end,
         s.wend, s.leg, s.dock_name, s.route_type,
         exists (select 1 from public.ambushes a where a.user_id = auth.uid() and a.left_at is null and a.system = s.at_system),
         exists (select 1 from public.spied sp where sp.pirate_id = auth.uid() and sp.convoy_id = s.id),
         s.nxt,
         s.own_route
    from seen s
   where s.wend is not null
   order by s.wend
   limit 30
$function$;

CREATE OR REPLACE FUNCTION public.mp_intercept(p_convoy uuid, p_system text, p_fleet_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.convoys; a public.ambushes; iid uuid; sys text := public._mp_system(p_system); me public.worlds; vw public.worlds;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into c from public.convoys where id = p_convoy for update;
  if not found or not public._mp_convoy_visible(c, auth.uid(), sys) then raise exception 'convoy_gone'; end if;
  select * into a from public.ambushes where user_id = auth.uid() and left_at is null and system = sys and fleet_id = p_fleet_id for update;
  if not found then raise exception 'no_ambush'; end if;
  -- mêmes protections que les raids : saison, débutant (72 h), écart de niveau
  select * into vw from public.worlds where user_id = c.user_id;
  if found then
    if vw.season <> me.season then raise exception 'target_other_season'; end if;
    if public.mp_guards_on() and vw.created_at > now() - interval '72 hours' then raise exception 'target_shielded'; end if;
    if public.mp_guards_on() and vw.level * 2 < me.level then raise exception 'target_too_weak'; end if;
  end if;
  perform public._mp_pair_lock(auth.uid(), c.user_id);
  if exists (select 1 from public.pacts where status = 'active'
              and least(proposer_id, partner_id) = least(auth.uid(), c.user_id)
              and greatest(proposer_id, partner_id) = greatest(auth.uid(), c.user_id)) then
    raise exception 'pact_active';
  end if;
  if exists (select 1 from public.intercepts where ambush_id = a.id and status in ('pending', 'resolving')) then
    raise exception 'combat_pending';
  end if;
  update public.convoys set status = 'engaged' where id = c.id;
  insert into public.intercepts (ambush_id, convoy_id, pirate_id, victim_id) values (a.id, c.id, auth.uid(), c.user_id)
    returning id into iid;
  return iid;
end $function$;
