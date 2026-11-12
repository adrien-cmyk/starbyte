-- v55 (12/11/2026) — EMBUSCADES SUR UN TRONÇON (étape 5 de la migration de la carte)
-- Prérequis : v54 (public.voyages) installée, et la fonction `voyage` redéployée avec ce même lot (elle écrit les tronçons).
-- Décisions d'Adrien (12/11, 11 h 52) : une embuscade couvre le TRONÇON ENTIER (tout convoi qui y entre après la pose est
-- intercepté) ; durée et coût comme aujourd'hui ; une flotte postée voit par elle-même (3/11) : pas besoin de balise.
-- Base : les fonctions exportées de Supabase le 12/11 (server/export_e5/export_2026-11-12.csv). Ce qui existe reste en place :
-- combat (fonction resolve-raids), butin (mp_finish_intercept), protections (saison, débutants, écart de niveau, alliance,
-- pacifiques, pactes). Les deux fonctions remplacées ci-dessous (_mp_convoy_window, mp_auto_ambush) sont les versions
-- exportées, avec seulement l'ajout signalé « v55 ».
-- À coller dans Supabase → SQL Editor → Run. Rejouable.

-- 0. v54 d'abord : sans la table des voyages, rien ne s'installe (message clair au lieu de « type public.voyages does not exist »)
do $$ begin
  if to_regclass('public.voyages') is null then
    raise exception 'v55 : installer d''abord schema_mp_v54_voyages.sql (table public.voyages), puis relancer ce fichier. Rien n''a été modifié.';
  end if;
end $$;

-- 1. colonnes : le tronçon d'une embuscade, les tronçons datés d'un convoi
alter table public.ambushes add column if not exists edge text;
alter table public.ambushes add column if not exists node_b text;
alter table public.ambushes drop constraint if exists ambushes_edge_chk;
alter table public.ambushes add constraint ambushes_edge_chk check (edge is null or edge ~ '^C[0-9]{1,2}\.[0-9]{1,2}$');
alter table public.convoys add column if not exists legs jsonb;   -- [{ e: 'C5.2', a: 'A-M-1979', b: 'A-M-3340', t0: ms, t1: ms }]

-- 2. un convoi inscrit APRÈS son voyage serveur prend le chemin, les horaires et les tronçons du voyage
--    (inscrit avant : la fonction `voyage` met le convoi à jour elle-même)
create or replace function public._mp_convoy_from_voyage()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v public.voyages; vk text[];
begin
  if new.leg <> 'out' then return new; end if;
  select * into v from public.voyages where user_id = new.user_id and mission_id = new.mission_id;
  if not found then return new; end if;
  select array_agg(x) into vk from jsonb_array_elements_text(coalesce(v.plan -> 'via', '[]'::jsonb)) x;
  new.via := coalesce(vk, '{}'::text[]);
  new.legs := v.plan -> 'segs';
  new.departed_at := v.departed_at;
  new.arrives_at := v.arrives_at;
  return new;
end $function$;
revoke all on function public._mp_convoy_from_voyage() from public, anon, authenticated;
drop trigger if exists convoys_from_voyage on public.convoys;
create trigger convoys_from_voyage before insert on public.convoys for each row execute function public._mp_convoy_from_voyage();

-- 3. fenêtre de passage d'un convoi à un système (balises, filature, abordage manuel) — version exportée,
--    plus : avec des tronçons datés, l'heure exacte d'entrée ou de sortie au nœud (au lieu d'un partage égal du trajet)
create or replace function public._mp_convoy_window(c convoys, p_system text)
 returns timestamp with time zone language plpgsql stable set search_path to 'public' as $function$
declare n int; i int; dur interval; eta timestamptz; half interval; l jsonb;
begin
  if c.status <> 'enroute' or now() >= c.arrives_at or p_system is null then return null; end if;
  -- voie balisée : un passage sur deux échappe à la balise (même tirage pour ce convoi et ce système)
  if c.route_type = 'beacon' and (hashtext(c.id::text || p_system) & 1) = 1 then return null; end if;
  if p_system = c.to_system and now() >= c.arrives_at - interval '12 minutes' then return c.arrives_at; end if;
  if p_system = c.from_system and now() < c.departed_at + interval '12 minutes' then
    return least(c.arrives_at, c.departed_at + interval '12 minutes');
  end if;
  -- v55 : tronçons datés (voyage fixé par le serveur)
  if c.legs is not null and jsonb_typeof(c.legs) = 'array' then
    for l in select * from jsonb_array_elements(c.legs) loop
      if l ->> 'a' = p_system or l ->> 'b' = p_system then
        eta := to_timestamp(((case when l ->> 'a' = p_system then l ->> 't0' else l ->> 't1' end)::float8) / 1000.0);
        half := greatest(interval '4 minutes', (to_timestamp((l ->> 't1')::float8 / 1000.0) - to_timestamp((l ->> 't0')::float8 / 1000.0)) / 2);
        if now() >= eta - half and now() < eta + half then return least(c.arrives_at, eta + half); end if;
      end if;
    end loop;
    return null;
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

-- 4. poster une flotte sur un tronçon : comme mp_ambush_post, sans balise exigée (la flotte voit par elle-même)
create or replace function public.mp_ambush_post_seg(p_fleet_id text, p_fleet_name text, p_edge text, p_a text, p_b text, p_fleet jsonb)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare me public.worlds; aid uuid; old public.ambushes; sa text := public._mp_system(p_a); sb text := public._mp_system(p_b);
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  if sa is null or sb is null or sa = sb or p_edge is null or p_edge !~ '^C[0-9]{1,2}\.[0-9]{1,2}$'
     or p_fleet_id is null or length(p_fleet_id) > 80 then raise exception 'ambush_invalid'; end if;
  p_fleet := public._mp_registry_fleet_by_id(me, p_fleet_id);   -- v47 : la flotte du registre
  p_fleet := p_fleet || jsonb_build_object('soldiers', jsonb_build_object('garde', 0, 'lourd', 0));
  perform pg_advisory_xact_lock(hashtext('ambush:' || me.user_id::text));
  select * into old from public.ambushes where user_id = me.user_id and fleet_id = p_fleet_id and left_at is null for update;
  if found then
    if old.edge is not distinct from p_edge and old.system = sa then return old.id; end if;
    update public.ambushes set left_at = now(), hold_claimed = true where id = old.id;
    if exists (select 1 from public.intercepts where ambush_id = old.id and status in ('pending', 'resolving')) then raise exception 'combat_pending'; end if;
  end if;
  insert into public.ambushes (user_id, pseudo, fleet_id, fleet_name, system, node_b, edge, fleet, hold)
    values (me.user_id, me.pseudo, p_fleet_id, left(coalesce(p_fleet_name, ''), 40), sa, sb, p_edge, p_fleet,
            case when old.id is not null and not old.hold_claimed then old.hold else '{}'::jsonb end)
    returning id into aid;
  return aid;
end $function$;
revoke all on function public.mp_ambush_post_seg(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.mp_ambush_post_seg(text, text, text, text, text, jsonb) to authenticated;

-- 5. l'abordage automatique « au système » (version exportée) laisse les embuscades sur un tronçon à leur propre balayage
create or replace function public.mp_auto_ambush()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
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
            where left_at is null and edge is null   -- v55 : les embuscades sur un tronçon ont leur balayage (mp_segment_scan)
              and orders ->> 'mode' in ('rob_heavy', 'rob_all', 'spy')
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

-- 6. le balayage des tronçons : un convoi de joueur qui ENTRE sur le tronçon après la pose de la flotte est intercepté.
--    Heure d'entrée = celle fixée par le serveur au départ (convoys.legs, depuis le voyage). Une flotte posée après l'entrée
--    du convoi ne le voit pas. Mêmes protections et même combat que l'abordage automatique ; un abordage à la fois par flotte.
create or replace function public.mp_segment_scan()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare a public.ambushes; c public.convoys; me public.worlds; vw public.worlds; n int := 0; v_mode text;
        last timestamptz; cap bigint; held bigint; csum bigint; t text;
begin
  if auth.uid() is null then return 0; end if;
  if not pg_try_advisory_xact_lock(hashtext('mp_segment_scan')) then return 0; end if;
  select (value #>> '{}')::timestamptz into last from public.mp_settings where key = 'segment_scan_at';
  if last is not null and last > now() - interval '15 seconds' then return 0; end if;
  insert into public.mp_settings (key, value) values ('segment_scan_at', to_jsonb(now()))
    on conflict (key) do update set value = excluded.value, updated_at = now();

  for a in select * from public.ambushes
            where left_at is null and edge is not null
              and orders ->> 'mode' in ('rob_heavy', 'rob_all', 'spy')
              and coalesce((orders ->> 'players')::boolean, false)
            order by posted_at limit 200 loop
    begin
    v_mode := a.orders ->> 'mode';
    if v_mode <> 'spy' and exists (select 1 from public.intercepts where ambush_id = a.id and status in ('pending', 'resolving')) then continue; end if;
    select * into me from public.worlds where user_id = a.user_id;
    if not found then continue; end if;
    if v_mode <> 'spy' and coalesce((select sum(coalesce((a.fleet -> 'composition' -> u_ty ->> u_t)::bigint, 0))
                                       from unnest(array['fregate', 'cuirasse']) u_ty, unnest(array['t1', 't2', 't3']) u_t), 0) = 0 then continue; end if;
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
                and cv.legs is not null and jsonb_typeof(cv.legs) = 'array'
                and exists (select 1 from jsonb_array_elements(cv.legs) l
                             where l ->> 'e' = a.edge
                               and to_timestamp((l ->> 't0')::float8 / 1000.0) >= a.posted_at     -- entré APRÈS la pose
                               and to_timestamp((l ->> 't0')::float8 / 1000.0) <= now())          -- et déjà entré
              order by cv.departed_at loop
      select * into vw from public.worlds where user_id = c.user_id;
      if found then
        if vw.season <> me.season then continue; end if;
        if public.mp_guards_on() and vw.created_at > now() - interval '72 hours' then continue; end if;
        if public.mp_guards_on() and vw.level * 2 < me.level then continue; end if;
      end if;
      if public._mp_same_alliance(a.user_id, c.user_id) then continue; end if;
      if vw.user_id is not null and vw.peaceful and v_mode <> 'spy' then continue; end if;
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
      if csum = 0 then continue; end if;
      if v_mode = 'rob_heavy' and csum <= public._mp_cargo_cap(c.tanker_tier) / 2 then continue; end if;
      perform public._mp_pair_lock(a.user_id, c.user_id);
      update public.convoys set status = 'engaged' where id = c.id and status = 'enroute';
      if not found then continue; end if;
      insert into public.intercepts (ambush_id, convoy_id, pirate_id, victim_id) values (a.id, c.id, a.user_id, c.user_id);
      n := n + 1;
      exit;
    end loop;
    exception when others then
      raise warning 'mp_segment_scan : embuscade % ignorée (%)', a.id, sqlerrm;
    end;
  end loop;
  return n;
end $function$;
revoke all on function public.mp_segment_scan() from public, anon;
grant execute on function public.mp_segment_scan() to authenticated;
