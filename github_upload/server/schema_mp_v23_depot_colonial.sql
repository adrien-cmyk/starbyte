-- v23 (21/10/2026) — DÉPÔT COLONIAL (décision d'Adrien)
-- Une colonie stocke sa production dans son propre dépôt, expédié vers l'empire par convoi toutes les 6 h.
-- Un raid sur une colonie ne pille que ce dépôt (50 % au plus) : le stock de la capitale n'est plus exposé.
-- Le jeu publie le dépôt de chaque colonie (colonies.stocks) avec sa défense et ses bâtiments.
-- À coller tel quel dans Supabase → SQL Editor → Run, puis redéployer resolve-raids.

alter table public.colonies add column if not exists stocks jsonb not null default '{}'::jsonb;

drop function if exists public.mp_colony_publish(text, text, int, int, jsonb);
create or replace function public.mp_colony_publish(p_address text, p_name text, p_level int, p_defense int, p_buildings jsonb, p_stocks jsonb default null)
returns void
language sql security definer set search_path = public as $$
  update public.colonies set
    name = left(coalesce(nullif(trim(p_name), ''), name), 40),
    level = greatest(1, coalesce(p_level, 1)),
    defense = greatest(0, coalesce(p_defense, 0)),
    buildings = case when jsonb_typeof(p_buildings) = 'array' then p_buildings else buildings end,
    stocks = case when jsonb_typeof(p_stocks) = 'object' then jsonb_build_object(
               'metal',   greatest(0, least(10000000, public._mp_num(p_stocks ->> 'metal'))),
               'energie', greatest(0, least(10000000, public._mp_num(p_stocks ->> 'energie'))),
               'cristal', greatest(0, least(10000000, public._mp_num(p_stocks ->> 'cristal')))) else stocks end,
    updated_at = now(), last_seen = now()
  where user_id = auth.uid() and address = p_address
$$;
revoke all on function public.mp_colony_publish(text, text, int, int, jsonb, jsonb) from public, anon;
grant execute on function public.mp_colony_publish(text, text, int, int, jsonb, jsonb) to authenticated;

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
      -- v23 : une colonie n'expose que son dépôt (production pas encore expédiée), jamais le stock de l'empire
      have := case when is_col then public._mp_num(col.stocks ->> k) else public._mp_num(dw.stocks ->> k) end;
      -- stock commun déjà pillé ces 12 dernières heures (capitale seulement) : rien de plus à prendre
      if not is_col and public.mp_guards_on() and exists (select 1 from public.raids x where x.defender_id = r.defender_id and x.id <> r.id and x.status = 'resolved'
                 and x.resolved_at > now() - interval '12 hours'
                 and public._mp_num(x.result -> 'loot' ->> 'metal') + public._mp_num(x.result -> 'loot' ->> 'energie') + public._mp_num(x.result -> 'loot' ->> 'cristal') > 0) then have := 0; end if;
      got  := least(want, floor(have * (case when is_col then 0.50 else 0.30 end))::bigint);   -- v23 : dépôt colonial pillable à 50 %
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
      stocks = case when is_col then stocks else stocks || jsonb_build_object(
        'metal',   greatest(0, public._mp_num(stocks ->> 'metal')   - (loot ->> 'metal')::bigint),
        'energie', greatest(0, public._mp_num(stocks ->> 'energie') - (loot ->> 'energie')::bigint),
        'cristal', greatest(0, public._mp_num(stocks ->> 'cristal') - (loot ->> 'cristal')::bigint)) end,
      buildings = case when is_col then buildings else blds end,
      shield_until = case when is_col then shield_until else greatest(shield_until, now() + interval '12 hours') end
    where user_id = r.defender_id;
    if is_col then
      update public.colonies set buildings = blds, shield_until = greatest(shield_until, now() + interval '12 hours'),
        stocks = coalesce(stocks, '{}'::jsonb) || jsonb_build_object(
          'metal',   greatest(0, public._mp_num(stocks ->> 'metal')   - (loot ->> 'metal')::bigint),
          'energie', greatest(0, public._mp_num(stocks ->> 'energie') - (loot ->> 'energie')::bigint),
          'cristal', greatest(0, public._mp_num(stocks ->> 'cristal') - (loot ->> 'cristal')::bigint))
      where id = col.id;
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
