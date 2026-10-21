-- v25 (21/10/2026) — COMMERCE ENTRE JOUEURS (décisions d'Adrien, 21/10 ; GDD claude/starbyte_GDD_commerce_entre_joueurs.md)
-- Pendant un accord commercial (« Commerce ? » des deux côtés, v24), un commandant peut livrer son surplus à son partenaire :
--   · le tanker part comme un convoi normal (registre, balises, abordages possibles, protection d'accord ≥ 0,4) ;
--   · à l'arrivée, la livraison est inscrite ici ; le jeu du partenaire achète ce qu'il peut payer (CG, plafond par livraison,
--     place dans ses silos) au prix du milieu du marché : métal 2,5 · énergie 3,5 · cristal 8,5 CG ;
--   · aucun CG n'est créé : ils passent de l'acheteur au vendeur ; le tanker rentre avec les CG et ce qui n'a pas été acheté ;
--   · partenaire absent 12 h : la livraison expire, le tanker rentre avec toute sa cale.
-- À coller tel quel dans Supabase → SQL Editor → Run (après v24 ; pas de fonction à redéployer).

create table if not exists public.mp_trade_deliveries (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references auth.users (id) on delete cascade,
  buyer_id       uuid not null references auth.users (id) on delete cascade,
  seller_pseudo  text not null default '',
  buyer_pseudo   text not null default '',
  seller_address text not null default '',
  buyer_address  text not null,
  mission        text not null,
  tanker         text not null default '',
  cargo          jsonb not null default '{}'::jsonb,
  bought         jsonb not null default '{"metal":0,"energie":0,"cristal":0}'::jsonb,
  paid_cg        bigint not null default 0,
  status         text not null default 'waiting' check (status in ('waiting', 'settled', 'expired')),
  created_at     timestamptz not null default now(),
  settled_at     timestamptz,
  buyer_applied  boolean not null default false,
  seller_seen    boolean not null default false,
  unique (seller_id, mission)
);
create index if not exists mp_trade_buyer on public.mp_trade_deliveries (buyer_id, status);
create index if not exists mp_trade_seller on public.mp_trade_deliveries (seller_id, seller_seen);
alter table public.mp_trade_deliveries enable row level security;
drop policy if exists "trade_select_mine" on public.mp_trade_deliveries;
create policy "trade_select_mine" on public.mp_trade_deliveries for select to authenticated
  using ((select auth.uid()) in (seller_id, buyer_id));
revoke insert, update, delete on public.mp_trade_deliveries from anon, authenticated;
grant select on public.mp_trade_deliveries to authenticated;

-- prix d'une cale (milieu entre l'achat et la vente du marché, saison normale)
create or replace function public._mp_trade_price(c jsonb) returns bigint
language sql immutable as $$
  select floor(public._mp_num(c ->> 'metal') * 2.5 + public._mp_num(c ->> 'energie') * 3.5 + public._mp_num(c ->> 'cristal') * 8.5)::bigint
$$;

create or replace function public._mp_trade_expire() returns void
language sql security definer set search_path = public as $$
  update public.mp_trade_deliveries set status = 'expired', settled_at = now()
   where status = 'waiting' and created_at < now() - interval '12 hours';
$$;
revoke all on function public._mp_trade_expire() from public, anon, authenticated;

-- arrivée du tanker chez le partenaire (rejouable : la même mission rend la même livraison)
create or replace function public.mp_trade_arrive(p_to_address text, p_mission text, p_tanker text, p_cargo jsonb)
returns public.mp_trade_deliveries
language plpgsql security definer set search_path = public as $$
declare me public.worlds; buyer uuid; bw public.worlds; d public.mp_trade_deliveries; origin text;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into d from public.mp_trade_deliveries where seller_id = me.user_id and mission = left(coalesce(p_mission, ''), 80);
  if found then return d; end if;
  buyer := public._mp_owner_of(p_to_address);
  if buyer is null then raise exception 'target_unknown'; end if;
  if buyer = me.user_id then raise exception 'target_self'; end if;
  perform public._mp_expire_relations();
  if not public._mp_rel_active(me.user_id, buyer, 'trade') then raise exception 'no_trade'; end if;
  if (select count(*) from public.mp_trade_deliveries where seller_id = me.user_id and created_at > now() - interval '24 hours') >= 12 then
    raise exception 'trade_rate';
  end if;
  select * into bw from public.worlds where user_id = buyer;
  insert into public.mp_trade_deliveries (seller_id, buyer_id, seller_pseudo, buyer_pseudo, seller_address, buyer_address, mission, tanker, cargo)
  values (me.user_id, buyer, me.pseudo, coalesce(bw.pseudo, '?'), me.address, p_to_address, left(coalesce(p_mission, ''), 80), left(coalesce(p_tanker, ''), 40),
          jsonb_build_object('metal',   least(1000000, public._mp_num(p_cargo ->> 'metal')),
                             'energie', least(1000000, public._mp_num(p_cargo ->> 'energie')),
                             'cristal', least(1000000, public._mp_num(p_cargo ->> 'cristal'))))
  returning * into d;
  return d;
end $$;
revoke all on function public.mp_trade_arrive(text, text, text, jsonb) from public, anon;
grant execute on function public.mp_trade_arrive(text, text, text, jsonb) to authenticated;

-- l'acheteur règle : ce qu'il prend (au plus la cale) ; le prix est calculé ici
create or replace function public.mp_trade_settle(p_id uuid, p_bought jsonb)
returns public.mp_trade_deliveries
language plpgsql security definer set search_path = public as $$
declare d public.mp_trade_deliveries; b jsonb := '{}'::jsonb; k text;
begin
  perform public._mp_trade_expire();
  select * into d from public.mp_trade_deliveries where id = p_id and buyer_id = auth.uid() for update;
  if not found then raise exception 'trade_unknown'; end if;
  if d.status <> 'waiting' then return d; end if;   -- déjà réglée (autre appareil) ou expirée : rien de plus
  foreach k in array array['metal', 'energie', 'cristal'] loop
    b := b || jsonb_build_object(k, least(public._mp_num(p_bought ->> k), public._mp_num(d.cargo ->> k)));
  end loop;
  update public.mp_trade_deliveries set status = 'settled', bought = b, paid_cg = public._mp_trade_price(b), settled_at = now()
   where id = d.id returning * into d;
  return d;
end $$;
revoke all on function public.mp_trade_settle(uuid, jsonb) from public, anon;
grant execute on function public.mp_trade_settle(uuid, jsonb) to authenticated;

-- acheteur : achat appliqué dans sa partie ; vendeur : issue prise en compte (le tanker est reparti)
create or replace function public.mp_trade_done(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.mp_trade_deliveries set
    buyer_applied = buyer_applied or (buyer_id = auth.uid() and status = 'settled'),
    seller_seen   = seller_seen   or (seller_id = auth.uid() and status <> 'waiting')
  where id = p_id and auth.uid() in (buyer_id, seller_id);
$$;
revoke all on function public.mp_trade_done(uuid) from public, anon;
grant execute on function public.mp_trade_done(uuid) to authenticated;

-- relève : livraisons en attente chez moi, achats pas encore appliqués, issues de mes livraisons pas encore vues
create or replace function public.mp_trade_poll()
returns setof public.mp_trade_deliveries
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  perform public._mp_trade_expire();
  return query
  select * from public.mp_trade_deliveries t
   where (t.buyer_id = me and (t.status = 'waiting' or (t.status = 'settled' and not t.buyer_applied)))
      or (t.seller_id = me and not t.seller_seen)
   order by t.created_at
   limit 50;
end $$;
revoke all on function public.mp_trade_poll() from public, anon;
grant execute on function public.mp_trade_poll() to authenticated;

-- Fin v25. Vérification : select count(*) from pg_proc where proname like 'mp_trade_%';  → 4
