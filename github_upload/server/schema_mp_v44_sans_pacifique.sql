-- Starbyte — v44 : retrait du MODE PACIFIQUE (décision d'Adrien, 07/11/2026, après les retours des joueurs :
--   « C'est embêtant, on peut toucher personne »).
-- À exécuter après schema_mp_v43_fronde_essai.sql. Peut être relancé sans risque.
--   · plus personne n'est pacifique : tous les commandants (et les nouveaux) peuvent être attaqués et attaquer ;
--   · le bouclier débutant (shield_until) n'est PAS touché : les nouveaux joueurs restent protégés comme avant ;
--   · plus de taxe de 20 % sur le commerce entre « pacifique » et « conquérant » (il n'y a plus que des conquérants) ;
--   · les colonnes peaceful / peaceful_lost_at restent (historique), elles ne bloquent plus rien.
-- À coller tel quel dans Supabase → SQL Editor → Run.

-- 1. tout le monde, tout de suite, et les nouveaux comptes
update public.worlds set peaceful = false, peaceful_lost_at = coalesce(peaceful_lost_at, now()) where peaceful;
alter table public.worlds alter column peaceful set default false;

-- 2. plus jamais « pacifique » côté serveur, même si une ligne repassait à true
create or replace function public._mp_is_peaceful(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select false;
$$;
revoke all on function public._mp_is_peaceful(uuid) from public, anon, authenticated;

-- 3. les déclencheurs ne bloquent plus (raids, abordages) ; ils ne font plus rien
create or replace function public._mp_raids_peace() returns trigger
language plpgsql security definer set search_path = public as $$ begin return new; end $$;
create or replace function public._mp_intercepts_peace() returns trigger
language plpgsql security definer set search_path = public as $$ begin return new; end $$;
create or replace function public._mp_ambushes_peace() returns trigger
language plpgsql security definer set search_path = public as $$ begin return new; end $$;
create or replace function public._mp_garrisons_peace() returns trigger
language plpgsql security definer set search_path = public as $$ begin return new; end $$;

-- vérification : doit afficher 0
select count(*) as encore_pacifiques from public.worlds where peaceful;
