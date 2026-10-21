-- TEST (21/10) : retire la protection de fondation des colonies (72 h) pour tester les raids.
-- À coller dans Supabase → SQL Editor → Run. À annuler dans 24 h avec test_colonies_bouclier_retour.sql.
-- 1. les colonies existantes perdent leur bouclier tout de suite
update public.colonies set shield_until = now() where shield_until > now();
-- 2. les colonies fondées pendant le test naissent sans bouclier
alter table public.colonies alter column shield_until set default now();
-- vérification : 0 colonie protégée attendue
select count(*) as colonies_protegees from public.colonies where shield_until > now();
