-- v18 (20/10/2026) — COLONIES : une colonie a sa propre adresse, sa propre défense, et peut être raidée.
-- Décisions d'Adrien (19-20/10) : plusieurs colonies par joueur, stock d'empire partagé, colonie attaquable
-- avec 72 h de protection après sa fondation, adresse = celle de la planète colonisée.
--   · table colonies : adresse unique (aussi vis-à-vis des capitales), nom, niveau, défense, bâtiments, bouclier
--   · mp_colony_claim / mp_colony_publish : fonder et publier une colonie (le jeu les appelle)
--   · mp_probe_system / mp_world_card : une sonde voit aussi les colonies des autres
--   · mp_launch_raid : on peut viser une colonie (bouclier de la colonie, niveau du propriétaire pour l'écart)
--   · mp_finish_raid : pillage sur le stock commun (worlds.stocks), bâtiment abîmé et bouclier sur la colonie
-- À coller tel quel dans Supabase → SQL Editor → Run, puis redéployer la fonction resolve-raids (index.ts modifié).

create table if not exists public.colonies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  address      text not null unique check (address ~ '^[A-Z]-[A-Z]-[0-9]{4}-[0-9]{1,2}$'),
  name         text check (char_length(name) <= 40),
  level        int  not null default 1 check (level >= 1),
  defense      int  not null default 0 check (defense >= 0),
  buildings    jsonb not null default '[]'::jsonb,
  season       text not null default public.mp_season(),
  shield_until timestamptz not null default (now() + interval '72 hours'),   -- protection après la fondation
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index if not exists colonies_user on public.colonies (user_id);
create index if not exists colonies_system on public.colonies ((split_part(address, '-', 1) || '-' || split_part(address, '-', 2) || '-' || split_part(address, '-', 3)));

alter table public.colonies enable row level security;
drop policy if exists "colonies_select_own" on public.colonies;
create policy "colonies_select_own" on public.colonies for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.colonies from anon, authenticated;
grant select on public.colonies to authenticated;
grant select, insert, update, delete on public.colonies to service_role;

-- Une adresse n'appartient qu'à un seul monde : capitale OU colonie
create or replace function public._mp_address_free() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'worlds' then
    if exists (select 1 from public.colonies c where c.address = new.address) then raise exception 'address_taken'; end if;
  else
    if exists (select 1 from public.worlds w where w.address = new.address) then raise exception 'address_taken'; end if;
  end if;
  return new;
end $$;
drop trigger if exists worlds_address_free on public.worlds;
create trigger worlds_address_free before insert or update of address on public.worlds for each row execute function public._mp_address_free();
drop trigger if exists colonies_address_free on public.colonies;
create trigger colonies_address_free before insert or update of address on public.colonies for each row execute function public._mp_address_free();

-- Fonder : l'Arche se pose. Idempotent pour sa propre adresse.
create or replace function public.mp_colony_claim(p_address text, p_name text default null)
returns public.colonies
language plpgsql security definer set search_path = public as $$
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
  if (select count(*) from public.colonies where user_id = me) >= 20 then raise exception 'too_many_colonies'; end if;
  insert into public.colonies (user_id, address, name) values (me, p_address, left(coalesce(nullif(trim(p_name), ''), p_address), 40))
    returning * into c;
  return c;
end $$;

-- Publier ce qu'on montre de la colonie (comme worlds : niveau, défense, bâtiments)
create or replace function public.mp_colony_publish(p_address text, p_name text, p_level int, p_defense int, p_buildings jsonb)
returns void
language sql security definer set search_path = public as $$
  update public.colonies set
    name = left(coalesce(nullif(trim(p_name), ''), name), 40),
    level = greatest(1, coalesce(p_level, 1)),
    defense = greatest(0, coalesce(p_defense, 0)),
    buildings = case when jsonb_typeof(p_buildings) = 'array' then p_buildings else buildings end,
    updated_at = now(), last_seen = now()
  where user_id = auth.uid() and address = p_address
$$;

-- Sonder un système : capitales et colonies des autres
create or replace function public.mp_probe_system(p_system text)
returns table (address text, pseudo text, planet_name text, level_estimate int, last_seen_days int)
language sql stable security definer set search_path = public as $$
  select w.address, w.pseudo, w.planet_name,
         greatest(1, (round(w.level / 5.0) * 5)::int),
         extract(day from now() - w.last_seen)::int
  from public.worlds w
  where w.address like p_system || '-%'
    and w.user_id <> auth.uid()
    and w.season = public.mp_season()
  union all
  select c.address, w.pseudo, c.name,
         greatest(1, (round(c.level / 5.0) * 5)::int),
         extract(day from now() - c.last_seen)::int
  from public.colonies c join public.worlds w on w.user_id = c.user_id
  where c.address like p_system || '-%'
    and c.user_id <> auth.uid()
    and c.season = public.mp_season()
$$;

create or replace function public.mp_world_card(p_address text)
returns table (address text, pseudo text, planet_name text, level_estimate int, defense_estimate int, shielded boolean, last_seen_days int)
language sql stable security definer set search_path = public as $$
  select w.address, w.pseudo, w.planet_name,
         greatest(1, (round(w.level / 5.0) * 5)::int),
         (round(w.defense / 100.0) * 100)::int,
         w.shield_until > now(),
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
$$;

-- Raid : la cible peut être une colonie
create or replace function public.mp_launch_raid(p_target_address text, p_fleet jsonb, p_fleet_name text default null)
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
  travel := make_interval(mins => 10 + 5 * least(public.mp_sector_distance(me.address, p_target_address), 25));
  insert into public.raids (attacker_id, defender_id, attacker_address, defender_address, attacker_pseudo, defender_pseudo,
                            fleet_name, fleet, arrives_at, returns_at)
    values (me.user_id, tgt.user_id, me.address, p_target_address, me.pseudo, tgt.pseudo,
            p_fleet_name, p_fleet, now() + travel, now() + travel * 2)
    returning * into r;
  return r;
end $$;

-- Issue d'un raid : le pillage prend sur le stock commun ; bâtiment abîmé et bouclier sur la planète visée
create or replace function public.mp_finish_raid(p_raid uuid, p_result jsonb)
returns public.raids
language plpgsql security definer set search_path = public as $$
declare
  r    public.raids;
  dw   public.worlds;
  col  public.colonies;
  is_col boolean := false;
  loot jsonb := '{}'::jsonb;
  k    text;
  want int; have int; got int;
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
      want := greatest(0, coalesce((p_result -> 'loot' ->> k)::int, 0));
      have := greatest(0, coalesce((dw.stocks ->> k)::int, 0));
      got  := least(want, floor(have * 0.30)::int);
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
      stocks = jsonb_build_object(
        'metal',   greatest(0, coalesce((stocks ->> 'metal')::int, 0)   - (loot ->> 'metal')::int),
        'energie', greatest(0, coalesce((stocks ->> 'energie')::int, 0) - (loot ->> 'energie')::int),
        'cristal', greatest(0, coalesce((stocks ->> 'cristal')::int, 0) - (loot ->> 'cristal')::int)),
      buildings = case when is_col then buildings else blds end,
      shield_until = case when is_col then shield_until else greatest(shield_until, now() + interval '12 hours') end
    where user_id = r.defender_id;
    if is_col then
      update public.colonies set buildings = blds, shield_until = greatest(shield_until, now() + interval '12 hours') where id = col.id;
    end if;
  else
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

  insert into public.rumors (kind, actor, target, sector, payload)
  values (case when victory then 'raid_victory' else 'raid_repelled' end,
          r.attacker_pseudo, r.defender_pseudo, split_part(r.defender_address, '-', 2), '{}'::jsonb);
  return r;
end $$;

revoke all on function public.mp_colony_claim(text, text) from public, anon;
revoke all on function public.mp_colony_publish(text, text, int, int, jsonb) from public, anon;
grant execute on function public.mp_colony_claim(text, text) to authenticated;
grant execute on function public.mp_colony_publish(text, text, int, int, jsonb) to authenticated;
revoke all on function public.mp_probe_system(text) from public, anon;
revoke all on function public.mp_world_card(text) from public, anon;
revoke all on function public.mp_launch_raid(text, jsonb, text) from public, anon;
grant execute on function public.mp_probe_system(text) to authenticated;
grant execute on function public.mp_world_card(text) to authenticated;
grant execute on function public.mp_launch_raid(text, jsonb, text) to authenticated;
revoke all on function public.mp_finish_raid(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mp_finish_raid(uuid, jsonb) to service_role;
