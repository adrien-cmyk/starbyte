-- v27 (22/10/2026) — UNIVERS OUVERT (décision d'Adrien, 22/10 : « libérer le plein potentiel de l'univers de Starbyte »)
-- Les nouveaux commandants ne sont plus limités aux secteurs M, N, O : tout l'amas A (secteurs A à Z) est ouvert.
-- Les mondes existants ne bougent pas. À coller tel quel dans Supabase → SQL Editor → Run (pas de fonction à redéployer).

create or replace function public.mp_in_test_zone(p_address text) returns boolean
  language sql immutable as $$
  select p_address ~ '^A-[A-Z]-[0-9]{4}-[0-9]{1,2}$'
$$;

-- Fin v27. Vérification : select public.mp_in_test_zone('A-C-1234-05');  → true
