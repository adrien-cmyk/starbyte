-- Starbyte — Blackmarket v39 (03/11/2026) : « Bernard », dreadnought Hérens à tête de taureau (FATHER-ID), hommage.
-- À exécuter dans l'éditeur SQL de Supabase après schema_mp_v38_ambassadeur.sql.
insert into public.bm_catalog (item_id, category, name, price_cents, sort) values
  ('bernard', 'dread', 'Bernard', 2000, 8)
on conflict (item_id) do update set category = excluded.category, name = excluded.name,
  price_cents = excluded.price_cents, sort = excluded.sort, active = true;
