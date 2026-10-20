-- v19 (20/10/2026) — un raid peut partir d'une colonie : son trajet se compte depuis la colonie.
-- mp_launch_raid reçoit un 4e paramètre facultatif p_origin_address (une de mes colonies) ; sans lui, rien ne change.
-- À coller tel quel dans Supabase → SQL Editor → Run. Pas de redéploiement de fonction.

-- Raid : la cible peut être une colonie
drop function if exists public.mp_launch_raid(text, jsonb, text);
create or replace function public.mp_launch_raid(p_target_address text, p_fleet jsonb, p_fleet_name text default null, p_origin_address text default null)
returns public.raids
language plpgsql security definer set search_path = public as $$
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
  if public.mp_guards_on() and tgt_shield > now() then raise exception 'target_shielded'; end if;
  if me.shield_until > now() and me.created_at > now() - interval '72 hours' then
    update public.worlds set shield_until = now() where user_id = me.user_id;
  end if;
  -- l'écart de niveau se juge sur l'empire (le niveau du propriétaire), pas sur la colonie naissante
  if public.mp_guards_on() and tgt.level * 2 < me.level then raise exception 'target_too_weak'; end if;
  if public.mp_guards_on() and exists (select 1 from public.raids where attacker_id = me.user_id and defender_address = p_target_address and status = 'enroute') then
    raise exception 'raid_already_enroute';
  end if;
  if p_fleet is null or jsonb_typeof(p_fleet) <> 'object' then raise exception 'fleet_invalid'; end if;
  -- départ d'une de mes colonies : le trajet se compte depuis elle
  origin := me.address;
  if p_origin_address is not null and p_origin_address <> me.address then
    if not exists (select 1 from public.colonies where user_id = me.user_id and address = p_origin_address) then raise exception 'origin_unknown'; end if;
    origin := p_origin_address;
  end if;
  travel := make_interval(mins => 10 + 5 * least(public.mp_sector_distance(origin, p_target_address), 25));
  insert into public.raids (attacker_id, defender_id, attacker_address, defender_address, attacker_pseudo, defender_pseudo,
                            fleet_name, fleet, arrives_at, returns_at)
    values (me.user_id, tgt.user_id, me.address, p_target_address, me.pseudo, tgt.pseudo,
            p_fleet_name, p_fleet, now() + travel, now() + travel * 2)
    returning * into r;
  return r;
end $$;


revoke all on function public.mp_launch_raid(text, jsonb, text, text) from public, anon;
grant execute on function public.mp_launch_raid(text, jsonb, text, text) to authenticated;
