-- v22 (21/10/2026) — PILLAGE D'UNE COLONIE plafonné par ses propres silos (décision d'Adrien)
-- Le stock est commun à l'empire, mais une colonie n'expose que ce qu'elle peut stocker :
-- 1 000 par ressource de base + la capacité de ses silos (métal/énergie : 5 000 · 20 000 · 100 000 ; cristal : 2 000 · 10 000 · 50 000).
-- Le pillage reste de 30 % au plus, calculé sur ce plafond. La capitale ne change pas.
-- À coller tel quel dans Supabase → SQL Editor → Run (pas de fonction à redéployer).

create or replace function public._mp_colony_loot_cap(p_buildings jsonb, p_res text) returns bigint
language sql immutable as $$
  select 1000 + coalesce(sum(
           case when p_res = 'cristal' then (array[2000, 10000, 50000])[greatest(1, least(3, coalesce(public._mp_num(b ->> 'lvl'), 1)::int))]
                else (array[5000, 20000, 100000])[greatest(1, least(3, coalesce(public._mp_num(b ->> 'lvl'), 1)::int))] end), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_buildings) = 'array' then p_buildings else '[]'::jsonb end) b
  where b ->> 'key' = 'silo_' || p_res and coalesce(b ->> 'state', 'built') <> 'damaged'
$$;

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
      if is_col then have := least(have, public._mp_colony_loot_cap(col.buildings, k)); end if;   -- v22 : une colonie n'expose que ce que ses silos peuvent contenir
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
