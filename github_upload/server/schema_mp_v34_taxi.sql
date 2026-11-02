-- v34 (02/11/2026) — BLACKMARKET : le TAXI (Transport par Arche eXtra-Interstellaire) — GDD claude/starbyte_GDD_blackmarket.md
--   · édition de 100 exemplaires numérotés, CHF 150.-, un par joueur ; au-delà de 100 : l'achat est refusé et remboursé ;
--   · un seul largage par joueur, À L'AVEUGLE : le joueur choisit un secteur, le serveur tire un système vide de ce secteur
--     et y CRÉE une planète (rang réservé 60-99) ; la colonie est inscrite tout de suite, protégée 1 h (voyage) + 72 h ;
--   · ne compte pas dans les limites de colonies ni dans le coût des Arches (c'est le bonus des 150.-) ;
--   · tableau public des colonies légendaires : numéro, nom de la colonie, date, pseudo seulement si le fondateur l'accepte.
-- À coller tel quel dans Supabase → SQL Editor → Run (après v33). Puis redéployer bm-checkout et bm-webhook.

insert into public.bm_categories (category, label, cap) values ('arche', 'TAXI', 1)
on conflict (category) do update set label = excluded.label, cap = excluded.cap;
insert into public.bm_catalog (item_id, category, name, price_cents, sort) values ('taxi', 'arche', 'TAXI', 15000, 20)
on conflict (item_id) do update set category = excluded.category, name = excluded.name, price_cents = excluded.price_cents, sort = excluded.sort;

alter table public.bm_purchases add column if not exists edition_no int;
alter table public.bm_purchases add column if not exists taxi_address text;
alter table public.bm_purchases add column if not exists taxi_used_at timestamptz;
alter table public.bm_purchases add column if not exists show_pseudo boolean not null default false;
create unique index if not exists bm_purchases_edition on public.bm_purchases (edition_no) where edition_no is not null and status = 'paid';

-- numéro d'édition attribué à l'inscription du paiement ; au-delà de 100 → over_cap (bm-webhook rembourse)
create or replace function public._bm_edition() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.category <> 'arche' or new.status <> 'paid' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('bm_taxi_edition'));
  select coalesce(max(edition_no), 0) + 1 into n from public.bm_purchases where category = 'arche' and status = 'paid' and edition_no is not null;
  if n > 100 then new.status := 'over_cap'; new.edition_no := null; else new.edition_no := n; end if;
  return new;
end $$;
drop trigger if exists bm_edition on public.bm_purchases;
create trigger bm_edition before insert on public.bm_purchases for each row execute function public._bm_edition();

-- combien de TAXI restent (catalogue public)
create or replace function public.bm_taxi_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, 100 - (select count(*)::int from public.bm_purchases where category = 'arche' and status = 'paid'))
$$;
grant execute on function public.bm_taxi_left() to anon, authenticated;

-- le catalogue, ce que je possède (vaisseau par vaisseau, TAXI compris), l'heure du serveur, TAXI restants
create or replace function public.bm_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  return jsonb_build_object(
    'now', now(),
    'taxi_left', public.bm_taxi_left(),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'category', c.category, 'name', c.name,
                 'price_cents', c.price_cents, 'cap', k.cap) order by c.sort)
               from public.bm_catalog c join public.bm_categories k using (category) where c.active), '[]'::jsonb),
    'owned', case when me is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'item_id', p.item_id,
                 'category', p.category, 'livemode', p.livemode, 'at', p.created_at, 'disabled_until', p.disabled_until,
                 'edition_no', p.edition_no, 'taxi_address', p.taxi_address, 'taxi_used_at', p.taxi_used_at, 'show_pseudo', p.show_pseudo) order by p.created_at)
               from public.bm_purchases p where p.user_id = me and p.status = 'paid'), '[]'::jsonb) end
  );
end $$;
revoke all on function public.bm_state() from public;
grant execute on function public.bm_state() to anon, authenticated;

-- le largage : une fois par joueur, dans un système vide tiré au sort dans le secteur choisi
create or replace function public.bm_taxi_drop(p_sector text, p_name text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w public.worlds; tx public.bm_purchases; cl text; sys text; addr text; t int;
begin
  if me is null then raise exception 'no_session'; end if;
  if p_sector is null or p_sector !~ '^[A-Z]$' then raise exception 'sector_invalid'; end if;
  select * into w from public.worlds where user_id = me;
  if not found then raise exception 'no_world'; end if;
  select * into tx from public.bm_purchases where user_id = me and category = 'arche' and status = 'paid' order by created_at limit 1 for update;
  if not found then raise exception 'no_taxi'; end if;
  if tx.taxi_used_at is not null then raise exception 'taxi_used'; end if;
  cl := left(w.address, 1);
  for t in 1..80 loop
    sys := cl || '-' || p_sector || '-' || lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
    exit when not exists (select 1 from public.worlds where address like sys || '-%')
          and not exists (select 1 from public.colonies where address like sys || '-%');
    sys := null;
  end loop;
  if sys is null then raise exception 'no_free_system'; end if;
  addr := sys || '-' || (60 + floor(random() * 40))::int;
  insert into public.colonies (user_id, address, name, shield_until)
    values (me, addr, left(coalesce(nullif(trim(p_name), ''), 'TAXI-' || lpad(coalesce(tx.edition_no, 0)::text, 3, '0')), 40), now() + interval '73 hours');
  update public.bm_purchases set taxi_used_at = now(), taxi_address = addr where id = tx.id;
  return jsonb_build_object('address', addr, 'arrives_at', now() + interval '1 hour', 'edition_no', tx.edition_no);
end $$;
revoke all on function public.bm_taxi_drop(text, text) from public, anon;
grant execute on function public.bm_taxi_drop(text, text) to authenticated;

-- le fondateur accepte (ou non) que son pseudo apparaisse dans le tableau des colonies légendaires
create or replace function public.bm_taxi_show_pseudo(p_show boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'no_session'; end if;
  update public.bm_purchases set show_pseudo = coalesce(p_show, false) where user_id = me and category = 'arche' and status = 'paid';
  return coalesce(p_show, false);
end $$;
revoke all on function public.bm_taxi_show_pseudo(boolean) from public, anon;
grant execute on function public.bm_taxi_show_pseudo(boolean) to authenticated;

-- tableau public des colonies légendaires (starbyte.online) : JAMAIS d'adresse ni de secteur
create or replace function public.bm_legends()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('left', public.bm_taxi_left(), 'legends', coalesce(jsonb_agg(jsonb_build_object(
           'no', p.edition_no,
           'colony', c.name,
           'founded_at', p.taxi_used_at,
           'pseudo', case when p.show_pseudo then w.pseudo else null end
         ) order by p.edition_no), '[]'::jsonb))
  from public.bm_purchases p
  left join public.colonies c on c.address = p.taxi_address
  left join public.worlds w on w.user_id = p.user_id
  where p.category = 'arche' and p.status = 'paid' and p.edition_no is not null
$$;
grant execute on function public.bm_legends() to anon, authenticated;
