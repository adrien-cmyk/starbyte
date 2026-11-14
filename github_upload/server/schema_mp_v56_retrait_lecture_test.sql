-- v56 (14/11/2026) — RETRAIT DE L'OUTIL DE TEST « Voir la partie d'un commandant »
-- La nouvelle carte passe à toutes les parties : l'outil de lecture d'une autre partie (réservé au compte de test, v53)
-- est retiré du jeu. Sa fonction serveur n'a plus d'appelant : on la supprime. Rien d'autre ne change (aucune table, aucune donnée).
-- À coller dans Supabase → SQL Editor → Run. Rejouable.
drop function if exists public.dev_player_map(text);
