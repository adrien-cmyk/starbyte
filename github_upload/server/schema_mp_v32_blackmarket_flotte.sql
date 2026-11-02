-- v32 (02/11/2026) — BLACKMARKET : les vaisseaux d'exception entrent dans les flottes (GDD claude/starbyte_GDD_blackmarket.md)
--   · chaque achat est UN vaisseau (son id sert d'identifiant dans les flottes du jeu) ;
--   · « jamais détruit » : orbite perdue → mis hors service (disabled_until) — Cuirassé de Héro 36 h
--     (réparation plus lente, sa contrepartie), Dreadnought 24 h ;
--   · la fonction resolve-raids vérifie qu'un vaisseau envoyé en raid appartient bien à l'attaquant et
--     n'est pas hors service, puis le met hors service si le raid échoue.
-- À coller tel quel dans Supabase → SQL Editor → Run (après v31). Puis redéployer resolve-raids.

alter table public.bm_purchases add column if not exists disabled_until timestamptz;

-- durée de mise hors service selon la catégorie
create or replace function public._bm_down_hours(cat text) returns int
language sql immutable as $$ select case when cat = 'sport' then 36 else 24 end $$;

-- le catalogue, ce que je possède (vaisseau par vaisseau) et l'heure du serveur
create or replace function public.bm_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  return jsonb_build_object(
    'now', now(),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'category', c.category, 'name', c.name,
                 'price_cents', c.price_cents, 'cap', k.cap) order by c.sort)
               from public.bm_catalog c join public.bm_categories k using (category) where c.active), '[]'::jsonb),
    'owned', case when me is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'item_id', p.item_id,
                 'category', p.category, 'livemode', p.livemode, 'at', p.created_at, 'disabled_until', p.disabled_until) order by p.created_at)
               from public.bm_purchases p where p.user_id = me and p.status = 'paid'), '[]'::jsonb) end
  );
end $$;
revoke all on function public.bm_state() from public;
grant execute on function public.bm_state() to anon, authenticated;

-- mission contre une cible du jeu perdue (combat calculé sur le téléphone) : le joueur met
-- lui-même ses vaisseaux hors service. Il ne peut que se pénaliser : jamais raccourcir une mise hors service.
create or replace function public.bm_disable(p_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'no_session'; end if;
  update public.bm_purchases
     set disabled_until = greatest(coalesce(disabled_until, now()), now() + make_interval(hours => public._bm_down_hours(category)))
   where user_id = me and status = 'paid' and id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.bm_disable(uuid[]) from public, anon;
grant execute on function public.bm_disable(uuid[]) to authenticated;
