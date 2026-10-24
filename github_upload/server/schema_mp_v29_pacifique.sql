-- v29 (24/10/2026) — MODE PACIFIQUE (décisions d'Adrien, 23-24/10 ; GDD claude/starbyte_GDD_mode_pacifique.md)
--   · tout le monde commence pacifique, sans écran de choix ; aucun commandant ne peut attaquer un pacifique
--     (ni raid sur sa planète ou ses colonies, ni abordage de ses convois) ;
--   · un pacifique construit ce qu'il veut, flotte de guerre comprise, mais ne la fait jamais sortir : il ne fait que
--     du match-3 et du commerce ;
--   · il perd son statut, définitivement, dès qu'une flotte part : raid, mission PNJ, embuscade (même en filature),
--     garnison chez un allié ; le jeu demande une confirmation avant (les missions PNJ, que le serveur ne voit pas,
--     sont signalées par le jeu : mp_peace_renounce) ;
--   · les pirates PNJ peuvent toujours intercepter ses convois (géré par le jeu, rien ici) ;
--   · commerce par tanker entre un pacifique et un conquérant : taxe de 20 % prélevée sur ce que reçoit le vendeur.
-- Les commandants qui ont déjà fait sortir une flotte (raid, abordage, embuscade ou garnison en cours) sont conquérants ;
-- (si tu as déjà lancé une version précédente de v29 : relance ce script, il est sans risque)
-- « pastéphane » est pacifique (demande d'Adrien, 24/10).
-- À coller tel quel dans Supabase → SQL Editor → Run (après v28 ; pas de fonction à redéployer).

alter table public.worlds add column if not exists peaceful boolean not null default true;
alter table public.worlds add column if not exists peaceful_lost_at timestamptz;
alter table public.mp_trade_deliveries add column if not exists tax_cg bigint not null default 0;

-- les commandants qui ont déjà attaqué un joueur
update public.worlds w set peaceful = false, peaceful_lost_at = coalesce(w.peaceful_lost_at, now())
 where w.peaceful and (
       exists (select 1 from public.raids r where r.attacker_id = w.user_id)
    or exists (select 1 from public.intercepts i where i.pirate_id = w.user_id)
    or exists (select 1 from public.ambushes a where a.user_id = w.user_id)
    or exists (select 1 from public.alliance_garrisons g where g.owner_id = w.user_id));

-- demande d'Adrien : pastéphane est pacifique
update public.worlds set peaceful = true, peaceful_lost_at = null where lower(pseudo) in ('pastéphane', 'pastephane');

-- perte du statut (définitive)
create or replace function public._mp_lose_peace(u uuid) returns void
language sql security definer set search_path = public as $$
  update public.worlds set peaceful = false, peaceful_lost_at = now() where user_id = u and peaceful;
$$;
revoke all on function public._mp_lose_peace(uuid) from public, anon, authenticated;

create or replace function public._mp_is_peaceful(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select peaceful from public.worlds where user_id = u), false);
$$;
revoke all on function public._mp_is_peaceful(uuid) from public, anon, authenticated;

-- raid : jamais contre un pacifique ; l'attaquant pacifique perd son statut
create or replace function public._mp_raids_peace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public._mp_is_peaceful(new.defender_id) then raise exception 'target_peaceful'; end if;
  perform public._mp_lose_peace(new.attacker_id);
  return new;
end $$;
drop trigger if exists raids_peace on public.raids;
create trigger raids_peace before insert on public.raids for each row execute function public._mp_raids_peace();

-- abordage : jamais le convoi d'un pacifique ; le pirate pacifique perd son statut
create or replace function public._mp_intercepts_peace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public._mp_is_peaceful(new.victim_id) then raise exception 'target_peaceful'; end if;
  perform public._mp_lose_peace(new.pirate_id);
  return new;
end $$;
drop trigger if exists intercepts_peace on public.intercepts;
create trigger intercepts_peace before insert on public.intercepts for each row execute function public._mp_intercepts_peace();

-- embuscade (tous ordres, filature comprise) : le statut tombe dès qu'elle est posée
create or replace function public._mp_ambushes_peace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._mp_lose_peace(new.user_id);
  return new;
end $$;
drop trigger if exists ambushes_peace on public.ambushes;
create trigger ambushes_peace after insert on public.ambushes for each row execute function public._mp_ambushes_peace();

-- garnison chez un allié : la flotte sort, le statut tombe
create or replace function public._mp_garrisons_peace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._mp_lose_peace(new.owner_id);
  return new;
end $$;
drop trigger if exists garrisons_peace on public.alliance_garrisons;
create trigger garrisons_peace after insert on public.alliance_garrisons for each row execute function public._mp_garrisons_peace();

-- une flotte part en mission PNJ (le jeu le signale ; rien d'autre ne passe par ici)
create or replace function public.mp_peace_renounce()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._mp_lose_peace(auth.uid());
  return public.mp_peace_state();
end $$;

-- mon statut (le jeu le lit avant un premier acte hostile)
create or replace function public.mp_peace_state()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('peaceful', w.peaceful, 'lost_at', w.peaceful_lost_at) from public.worlds w where w.user_id = auth.uid();
$$;
revoke all on function public.mp_peace_state() from public, anon;
grant execute on function public.mp_peace_state() to authenticated;
revoke all on function public.mp_peace_renounce() from public, anon;
grant execute on function public.mp_peace_renounce() to authenticated;

-- fiche d'un monde : on voit s'il est pacifique
drop function if exists public.mp_world_card(text);
create function public.mp_world_card(p_address text)
returns table (address text, pseudo text, planet_name text, level_estimate int, defense_estimate int, shielded boolean, last_seen_days int, peaceful boolean)
language sql stable security definer set search_path = public as $$
  select w.address, w.pseudo, w.planet_name,
         greatest(1, (round(w.level / 5.0) * 5)::int),
         (round(w.defense / 100.0) * 100)::int,
         w.shield_until > now(),
         extract(day from now() - w.last_seen)::int,
         w.peaceful
  from public.worlds w
  where w.address = p_address and w.user_id <> auth.uid()
  union all
  select c.address, w.pseudo, c.name,
         greatest(1, (round(c.level / 5.0) * 5)::int),
         (round(c.defense / 100.0) * 100)::int,
         c.shield_until > now(),
         extract(day from now() - c.last_seen)::int,
         w.peaceful
  from public.colonies c join public.worlds w on w.user_id = c.user_id
  where c.address = p_address and c.user_id <> auth.uid()
$$;
revoke all on function public.mp_world_card(text) from public, anon;
grant execute on function public.mp_world_card(text) to authenticated;

-- commerce par tanker : taxe de 20 % entre un pacifique et un conquérant (l'acheteur paie le prix, le vendeur reçoit 80 %)
create or replace function public.mp_trade_settle(p_id uuid, p_bought jsonb)
returns public.mp_trade_deliveries
language plpgsql security definer set search_path = public as $$
declare d public.mp_trade_deliveries; b jsonb := '{}'::jsonb; k text; price bigint; tax bigint := 0;
begin
  perform public._mp_trade_expire();
  select * into d from public.mp_trade_deliveries where id = p_id and buyer_id = auth.uid() for update;
  if not found then raise exception 'trade_unknown'; end if;
  if d.status <> 'waiting' then return d; end if;   -- déjà réglée (autre appareil) ou expirée : rien de plus
  foreach k in array array['metal', 'energie', 'cristal'] loop
    b := b || jsonb_build_object(k, least(public._mp_num(p_bought ->> k), public._mp_num(d.cargo ->> k)));
  end loop;
  price := public._mp_trade_price(b);
  if public._mp_is_peaceful(d.seller_id) <> public._mp_is_peaceful(d.buyer_id) then tax := floor(price * 0.2)::bigint; end if;
  update public.mp_trade_deliveries set status = 'settled', bought = b, paid_cg = price, tax_cg = tax, settled_at = now()
   where id = d.id returning * into d;
  return d;
end $$;
revoke all on function public.mp_trade_settle(uuid, jsonb) from public, anon;
grant execute on function public.mp_trade_settle(uuid, jsonb) to authenticated;

-- embuscades automatiques : les convois des pacifiques passent (la filature reste possible)
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

-- Fin v29. Vérification :
--   select count(*) from pg_proc where proname in ('mp_peace_state', 'mp_peace_renounce', '_mp_lose_peace', '_mp_raids_peace', '_mp_intercepts_peace', '_mp_ambushes_peace', '_mp_garrisons_peace');  → 7
--   select pseudo, peaceful from public.worlds order by peaceful, pseudo;
