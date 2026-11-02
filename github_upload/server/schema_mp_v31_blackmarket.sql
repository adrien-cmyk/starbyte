-- v31 (02/11/2026) — BLACKMARKET : catalogue et achats payés via Stripe (GDD claude/starbyte_GDD_blackmarket.md)
--   · le catalogue (prix, plafonds) vit ICI, jamais dans le jeu : le jeu ne fait que demander « je veux tel vaisseau » ;
--   · un achat n'est écrit que par la fonction serveur bm-webhook (avis signé de Stripe), une seule fois par paiement ;
--   · aucun joueur ne peut lire les achats des autres ni s'ajouter un vaisseau.
-- À coller tel quel dans Supabase → SQL Editor → Run (après v30). Ensuite : déployer bm-checkout et bm-webhook.

create table if not exists public.bm_categories (
  category text primary key,              -- 'sport' | 'dread' | 'arche'
  label    text not null,
  cap      int  not null                  -- plafond par joueur, tous modèles de la catégorie confondus
);
insert into public.bm_categories (category, label, cap) values
  ('sport', 'Cuirassé Sport', 10),
  ('dread', 'Dreadnought', 3),
  ('arche', 'Arche fondatrice', 1)
on conflict (category) do update set label = excluded.label, cap = excluded.cap;

create table if not exists public.bm_catalog (
  item_id     text primary key,
  category    text not null references public.bm_categories (category),
  name        text not null,
  price_cents int  not null check (price_cents > 0),   -- en centimes de CHF
  active      boolean not null default true,
  sort        int not null default 0
);
insert into public.bm_catalog (item_id, category, name, price_cents, sort) values
  ('fulgurant',    'sport', 'Le Fulgurant',   1200, 1),
  ('triumvirat',   'sport', 'Le Triumvirat',  1200, 2),
  ('arc-ecarlate', 'sport', 'L''Arc Écarlate', 1200, 3),
  ('vertige',      'sport', 'Le Vertige',     1200, 4),
  ('requiem',      'dread', 'Le Requiem',     2000, 5),
  ('souverain',    'dread', 'Le Souverain',   2000, 6),
  ('brise-monde',  'dread', 'Le Brise-Monde', 2000, 7)
on conflict (item_id) do update set category = excluded.category, name = excluded.name,
  price_cents = excluded.price_cents, sort = excluded.sort;

create table if not exists public.bm_purchases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  item_id           text not null references public.bm_catalog (item_id),
  category          text not null,
  amount_cents      int  not null,
  currency          text not null default 'chf',
  stripe_session_id text not null unique,          -- un paiement = un achat (Stripe peut renvoyer son avis)
  payment_intent    text,
  status            text not null default 'paid',  -- 'paid' | 'refunded' | 'over_cap' (plafond dépassé → remboursé)
  livemode          boolean not null default false,-- false = mode test Stripe
  created_at        timestamptz not null default now()
);
create index if not exists bm_purchases_user on public.bm_purchases (user_id);
create index if not exists bm_purchases_pi on public.bm_purchases (payment_intent);

alter table public.bm_categories enable row level security;
alter table public.bm_catalog    enable row level security;
alter table public.bm_purchases  enable row level security;
revoke all on public.bm_categories, public.bm_catalog, public.bm_purchases from anon, authenticated;

-- combien de vaisseaux payés (non remboursés) d'une catégorie ce joueur possède
create or replace function public._bm_owned(u uuid, cat text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bm_purchases where user_id = u and category = cat and status = 'paid'
$$;
revoke all on function public._bm_owned(uuid, text) from public, anon, authenticated;

-- le catalogue et ce que je possède (le jeu affiche les prix d'ici, pas les siens)
create or replace function public.bm_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  return jsonb_build_object(
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'category', c.category, 'name', c.name,
                 'price_cents', c.price_cents, 'cap', k.cap) order by c.sort)
               from public.bm_catalog c join public.bm_categories k using (category) where c.active), '[]'::jsonb),
    'owned', case when me is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id,
                 'category', p.category, 'livemode', p.livemode, 'at', p.created_at) order by p.created_at)
               from public.bm_purchases p where p.user_id = me and p.status = 'paid'), '[]'::jsonb) end
  );
end $$;
revoke all on function public.bm_state() from public;
grant execute on function public.bm_state() to anon, authenticated;
