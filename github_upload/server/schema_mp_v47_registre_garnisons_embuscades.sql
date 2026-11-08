-- v47 (08/11/2026) — ANTITRICHE · GARNISONS ET EMBUSCADES LISENT AUSSI LE REGISTRE
-- Suite de v46 : mp_garrison_post et mp_ambush_post prenaient encore la flotte en JSON libre. Désormais la
-- composition vient de worlds.fleets (publié par le jeu juste avant l'envoi), par id de flotte.
-- Nécessite v46. À coller tel quel dans Supabase → SQL Editor → Run. Pas de fonction Edge à redéployer.
-- Non couvert (fonctions absentes du dépôt, posées à la main) : mp_ambush_npc, mp_ambush_orders, mp_intercept.

-- recherche par id seul (p_fleet_id des garnisons / embuscades)
create or replace function public._mp_registry_fleet_by_id(me public.worlds, p_fleet_id text) returns jsonb
language plpgsql as $$
begin
  return public._mp_registry_fleet(me, jsonb_build_object('id', left(coalesce(p_fleet_id, ''), 80)));
end $$;
revoke all on function public._mp_registry_fleet_by_id(public.worlds, text) from public, anon, authenticated;

-- ── Garnisons (v26), identique sauf la source de la flotte ──
create or replace function public.mp_garrison_post(p_host_address text, p_fleet_id text, p_fleet_name text, p_fleet jsonb, p_travel_ms bigint)
returns public.alliance_garrisons
language plpgsql security definer set search_path = public as $$
declare me public.worlds; host uuid; hw public.worlds; g public.alliance_garrisons; f jsonb;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into g from public.alliance_garrisons where owner_id = me.user_id and fleet_id = left(coalesce(p_fleet_id, ''), 80) and left_at is null;
  if found then return g; end if;
  host := public._mp_owner_of(p_host_address);
  if host is null then raise exception 'target_unknown'; end if;
  if host = me.user_id then raise exception 'target_self'; end if;
  if not public._mp_same_alliance(me.user_id, host) then raise exception 'not_ally'; end if;
  perform pg_advisory_xact_lock(hashtext('garrison:' || p_host_address));
  if (select count(*) from public.alliance_garrisons where host_address = p_host_address and left_at is null) >= 3 then raise exception 'garrison_full'; end if;
  f := public._mp_registry_fleet_by_id(me, coalesce(p_fleet_id, p_fleet ->> 'id'));   -- v47 : la flotte du registre
  if f is null or public._mp_fleet_def(f -> 'composition') <= 0 then raise exception 'fleet_invalid'; end if;
  select * into hw from public.worlds where user_id = host;
  insert into public.alliance_garrisons (owner_id, owner_pseudo, host_id, host_pseudo, host_address, fleet_id, fleet_name, composition, arrives_at)
  values (me.user_id, me.pseudo, host, coalesce(hw.pseudo, '?'), p_host_address, left(coalesce(p_fleet_id, ''), 80), left(coalesce(p_fleet_name, ''), 40),
          f -> 'composition', now() + make_interval(secs => greatest(60, least(86400, coalesce(p_travel_ms, 0) / 1000.0))))
  returning * into g;
  return g;
end $$;

-- ── Embuscades (v20), identique sauf la source de la flotte ──
-- Le serveur gardait fleet entier (composition + soldats + héros) dans ambushes.fleet ; on garde la même forme,
-- soldats à zéro comme l'envoyait déjà le jeu (une embuscade spatiale ne débarque pas).
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

-- Fin v47. Vérification : select count(*) from pg_proc where proname = '_mp_registry_fleet_by_id';  → 1
