-- v24 (21/10/2026) — PAVILLONS AVEC DES EFFETS (décisions d'Adrien, 21/10)
--   · « Je te déclare ennemi » (nouveau) : rivalité officielle, visible des deux côtés ; rumeur au comptoir ;
--     entre ennemis, un raid gagné pille 10 points de plus (40 % de la capitale, 60 % d'un dépôt colonial) ; pas de pacte tant que dure la rivalité ;
--     un pacte en cours tombe.
--   · « Paix ? » répondu par « Paix ? » : la rivalité est levée.
--   · « Commerce ? » répondu par « Commerce ? » : accord commercial 7 jours — les convois de l'un vers l'autre
--     sont mieux protégés, et le canal (chat) est ouvert entre eux.
--   · « Alliance temporaire ? » répondu par « Alliance temporaire ? » : pacte de non-agression de 48 h, sans ambassade.
--   · « Dernier avertissement. » : pendant 24 h, un raid de l'expéditeur sur le destinataire pille jusqu'à +10 %.
--   · « Tu m'as sondé » et « Respect » : messages, sans effet.
-- Les effets se déclenchent à l'insertion du pavillon (orbite, dock, réponse) : un seul endroit, quelle que soit la voie.
-- À coller tel quel dans Supabase → SQL Editor → Run (pas de fonction à redéployer).

alter table public.flags drop constraint if exists flags_flag_key_check;
alter table public.flags add constraint flags_flag_key_check
  check (flag_key in ('paix', 'commerce', 'alliance', 'sonde', 'avertissement', 'respect', 'ennemi'));

alter table public.rumors drop constraint if exists rumors_kind_check;
alter table public.rumors add constraint rumors_kind_check
  check (kind in ('raid_victory', 'raid_repelled', 'route_legendary', 'world_growth', 'rare_discovery', 'pact_signed',
                  'pact_broken', 'convoy_robbed', 'ambush_repelled', 'route_betrayal', 'route_sold',
                  'war_declared', 'peace_made', 'trade_signed'));

-- pactes par pavillon : pas de tanker d'ancrage, une échéance
alter table public.pacts alter column anchor_presence drop not null;
alter table public.pacts add column if not exists expires_at timestamptz;
alter table public.pacts drop constraint if exists pacts_end_reason_check;
alter table public.pacts add constraint pacts_end_reason_check
  check (end_reason in ('recall', 'denounced', 'declined', 'withdrawn', 'expired', 'enemy'));

-- relations entre deux commandants (une ligne par paire et par sorte)
create table if not exists public.mp_relations (
  id         uuid primary key default gen_random_uuid(),
  a_id       uuid not null references auth.users (id) on delete cascade,   -- a_id < b_id
  b_id       uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('enemy', 'trade')),
  by_id      uuid not null,
  since      timestamptz not null default now(),
  until      timestamptz,
  ended_at   timestamptz,
  check (a_id < b_id)
);
create unique index if not exists mp_relations_open on public.mp_relations (a_id, b_id, kind) where ended_at is null;
alter table public.mp_relations enable row level security;
drop policy if exists "relations_select_mine" on public.mp_relations;
create policy "relations_select_mine" on public.mp_relations for select to authenticated
  using ((select auth.uid()) in (a_id, b_id));
revoke insert, update, delete on public.mp_relations from anon, authenticated;
grant select on public.mp_relations to authenticated;

create or replace function public._mp_rel_active(x uuid, y uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mp_relations
                  where a_id = least(x, y) and b_id = greatest(x, y) and kind = k and ended_at is null
                    and (until is null or until > now()))
$$;

-- échéances : pactes par pavillon et accords commerciaux arrivés à terme
create or replace function public._mp_expire_relations() returns void
language sql security definer set search_path = public as $$
  update public.pacts set status = 'expired', end_reason = 'expired', ended_at = now()
   where status = 'active' and expires_at is not null and expires_at < now();
  update public.mp_relations set ended_at = until where ended_at is null and until is not null and until < now();
$$;

-- effets d'un pavillon, à l'insertion
create or replace function public._mp_flag_effects() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid := least(new.from_id, new.to_id); b uuid := greatest(new.from_id, new.to_id);
        mutual boolean; fw public.worlds; tw public.worlds;
begin
  perform public._mp_pair_lock(new.from_id, new.to_id);
  perform public._mp_expire_relations();
  -- la même proposition de l'autre côté dans les 48 h, encore sans réponse (pas déjà « consommée » par un pavillon
  -- identique de ma part), et hissée après la dernière déclaration d'hostilité entre nous
  mutual := exists (select 1 from public.flags f where f.from_id = new.to_id and f.to_id = new.from_id
                     and f.flag_key = new.flag_key and f.created_at > now() - interval '48 hours' and f.id <> new.id
                     and not exists (select 1 from public.flags g where g.from_id = new.from_id and g.to_id = new.to_id
                                      and g.flag_key = new.flag_key and g.id <> new.id and g.created_at >= f.created_at)
                     and not exists (select 1 from public.flags e where e.flag_key = 'ennemi' and e.id <> new.id
                                      and least(e.from_id, e.to_id) = a and greatest(e.from_id, e.to_id) = b
                                      and e.created_at > f.created_at));
  select * into fw from public.worlds where user_id = new.from_id;
  select * into tw from public.worlds where user_id = new.to_id;

  if new.flag_key = 'ennemi' then
    if not public._mp_rel_active(new.from_id, new.to_id, 'enemy') then
      insert into public.mp_relations (a_id, b_id, kind, by_id) values (a, b, 'enemy', new.from_id);
      insert into public.rumors (kind, actor, target, sector, payload)
        values ('war_declared', new.from_pseudo, tw.pseudo, split_part(coalesce(fw.address, ''), '-', 2), '{}'::jsonb);
    end if;
    -- un pacte en cours tombe ; l'accord commercial aussi
    update public.pacts set status = 'broken', end_reason = 'enemy', ended_by = new.from_id, ended_at = now()
     where status in ('proposed', 'active') and least(proposer_id, partner_id) = a and greatest(proposer_id, partner_id) = b;
    update public.mp_relations set ended_at = now() where a_id = a and b_id = b and kind = 'trade' and ended_at is null;

  elsif new.flag_key = 'paix' and mutual then
    if public._mp_rel_active(new.from_id, new.to_id, 'enemy') then
      update public.mp_relations set ended_at = now() where a_id = a and b_id = b and kind = 'enemy' and ended_at is null;
      insert into public.rumors (kind, actor, target, sector, payload)
        values ('peace_made', new.from_pseudo, tw.pseudo, split_part(coalesce(fw.address, ''), '-', 2), '{}'::jsonb);
    end if;

  elsif new.flag_key = 'commerce' and mutual then
    if not public._mp_rel_active(new.from_id, new.to_id, 'enemy') then
      update public.mp_relations set ended_at = now() where a_id = a and b_id = b and kind = 'trade' and ended_at is null;
      insert into public.mp_relations (a_id, b_id, kind, by_id, until) values (a, b, 'trade', new.from_id, now() + interval '7 days');
      insert into public.rumors (kind, actor, target, sector, payload)
        values ('trade_signed', new.from_pseudo, tw.pseudo, split_part(coalesce(fw.address, ''), '-', 2), '{}'::jsonb);
    end if;

  elsif new.flag_key = 'alliance' and mutual then
    if not public._mp_rel_active(new.from_id, new.to_id, 'enemy')
       and not exists (select 1 from public.pacts where status in ('proposed', 'active')
                        and least(proposer_id, partner_id) = a and greatest(proposer_id, partner_id) = b)
       and not exists (select 1 from public.raids where status = 'enroute'
                        and ((attacker_id = new.from_id and defender_id = new.to_id) or (attacker_id = new.to_id and defender_id = new.from_id))) then
      insert into public.pacts (proposer_id, partner_id, proposer_pseudo, partner_pseudo, proposer_address, partner_address,
                                anchor_presence, status, active_at, expires_at)
        values (new.to_id, new.from_id, coalesce(tw.pseudo, '?'), new.from_pseudo, coalesce(tw.address, ''), coalesce(fw.address, ''),
                null, 'active', now(), now() + interval '48 hours');
      insert into public.rumors (kind, actor, target, sector, payload)
        values ('pact_signed', new.from_pseudo, tw.pseudo, split_part(coalesce(fw.address, ''), '-', 2), '{"flag":true}'::jsonb);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists flags_effects on public.flags;
create trigger flags_effects after insert on public.flags for each row execute function public._mp_flag_effects();

-- ce que le jeu affiche : mes relations en cours (avec les adresses de l'autre : capitale et colonies)
create or replace function public.mp_relations()
returns table (kind text, other_pseudo text, addresses text[], by_me boolean, since timestamptz, until timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  perform public._mp_expire_relations();
  return query
  select r.kind, w.pseudo,
         array[w.address] || coalesce((select array_agg(c.address) from public.colonies c where c.user_id = w.user_id), '{}'::text[]),
         r.by_id = me, r.since, r.until
    from public.mp_relations r
    join public.worlds w on w.user_id = case when r.a_id = me then r.b_id else r.a_id end
   where me in (r.a_id, r.b_id) and r.ended_at is null and (r.until is null or r.until > now());
end $$;
revoke all on function public.mp_relations() from public, anon;
grant execute on function public.mp_relations() to authenticated;

-- pas de pacte d'ambassade entre ennemis
create or replace function public._mp_pacts_no_enemy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('proposed', 'active') and public._mp_rel_active(new.proposer_id, new.partner_id, 'enemy') then
    raise exception 'enemies';
  end if;
  return new;
end $$;
drop trigger if exists pacts_no_enemy on public.pacts;
create trigger pacts_no_enemy before insert or update of status on public.pacts for each row execute function public._mp_pacts_no_enemy();

-- canal ouvert entre partenaires commerciaux
create or replace function public._mp_chat_open(a uuid, b uuid)
 returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orbit_presence
                  where left_at is null and ((user_id = a and target_id = b) or (user_id = b and target_id = a)))
      or exists (select 1 from public.route_posts pa join public.route_posts pb on pb.system = pa.system
                  where pa.user_id = a and pb.user_id = b and pa.left_at is null and pb.left_at is null)
      or public._mp_rel_active(a, b, 'trade')
$$;

-- convoi vers un partenaire commercial : mieux protégé (au moins 40 % du butin sauvé)
create or replace function public._mp_convoy_trade() returns trigger
language plpgsql security definer set search_path = public as $$
declare tgt uuid;
begin
  if new.kind = 'embassy' then
    select user_id into tgt from public.worlds where split_part(address, '-', 1) || '-' || split_part(address, '-', 2) || '-' || split_part(address, '-', 3) = new.to_system and new.leg = 'out' limit 1;
    if tgt is not null and public._mp_rel_active(new.user_id, tgt, 'trade') then new.protection := greatest(new.protection, 0.4); end if;
  end if;
  return new;
end $$;
drop trigger if exists convoys_trade on public.convoys;
create trigger convoys_trade before insert on public.convoys for each row execute function public._mp_convoy_trade();

-- ── raids : pillage selon la relation, pactes échus ──
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
  pct  numeric;
begin
  select * into r from public.raids where id = p_raid and status = 'resolving' for update;
  if not found then raise exception 'raid_not_resolving'; end if;
  select * into dw from public.worlds where user_id = r.defender_id for update;
  if dw.address is distinct from r.defender_address then
    select * into col from public.colonies where address = r.defender_address and user_id = r.defender_id for update;
    is_col := found;
  end if;
  victory := coalesce(p_result ->> 'outcome', '') in ('victory', 'pyrrhic', 'heroic');

  -- v24 : base 50 % (dépôt colonial) / 30 % (capitale) ; ennemis déclarés +10 % ; « Dernier avertissement » hissé dans les 24 h avant le départ +10 %
  pct := case when is_col then 0.50 else 0.30 end;
  if public._mp_rel_active(r.attacker_id, r.defender_id, 'enemy') then pct := pct + 0.10; end if;
  if exists (select 1 from public.flags fl where fl.from_id = r.attacker_id and fl.to_id = r.defender_id and fl.flag_key = 'avertissement'
              and fl.created_at between r.departed_at - interval '24 hours' and r.departed_at) then pct := pct + 0.10; end if;

  if victory then
    foreach k in array array['metal', 'energie', 'cristal'] loop
      want := public._mp_num(p_result -> 'loot' ->> k);
      -- v23 : une colonie n'expose que son dépôt (production pas encore expédiée), jamais le stock de l'empire
      have := case when is_col then public._mp_num(col.stocks ->> k) else public._mp_num(dw.stocks ->> k) end;
      -- stock commun déjà pillé ces 12 dernières heures (capitale seulement) : rien de plus à prendre
      if not is_col and public.mp_guards_on() and exists (select 1 from public.raids x where x.defender_id = r.defender_id and x.id <> r.id and x.status = 'resolved'
                 and x.resolved_at > now() - interval '12 hours'
                 and public._mp_num(x.result -> 'loot' ->> 'metal') + public._mp_num(x.result -> 'loot' ->> 'energie') + public._mp_num(x.result -> 'loot' ->> 'cristal') > 0) then have := 0; end if;
      got  := least(want, floor(have * pct)::bigint);
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
    result = p_result || jsonb_build_object('loot', case when victory then loot else '{"metal":0,"energie":0,"cristal":0}'::jsonb end, 'loot_pct', pct),
    resolved_at = now()
  where id = p_raid
  returning * into r;

  if r.status = 'aborted' then return r; end if;   -- pas de combat : ni bouclier ni rumeur
  insert into public.rumors (kind, actor, target, sector, payload)
  values (case when victory then 'raid_victory' else 'raid_repelled' end,
          r.attacker_pseudo, r.defender_pseudo, split_part(r.defender_address, '-', 2), '{}'::jsonb);
  return r;
end $function$;

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
