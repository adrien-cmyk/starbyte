-- v50b (08/11/2026 soir) — correctif : m3-verify (clé de service) n'avait pas le droit d'appeler sb_m3_settle,
-- donc les parties rejouées n'étaient pas portées au solde serveur (dérive = crédits du match-3).
-- À coller dans Supabase → SQL Editor → Run, après v50. Règle aussi le retard accumulé.
grant execute on function public.sb_m3_settle(bigint) to service_role;
select id, seed, pseudo, public.sb_m3_settle(id) as reglement
from public.m3_sessions where verified_at is not null and settled_at is null order by id;
-- Vérification : la dérive doit retomber vers 0 au prochain envoi du jeu (≤ 20 s après une variation de stock)
--   select world_id, balances, drift, updated_at from public.resources;
