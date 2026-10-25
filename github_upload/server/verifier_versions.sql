-- Vérifie quels scripts SQL du multijoueur sont passés (v15 → v30). « oui » = déjà lancé.
-- À coller dans Supabase → SQL Editor → Run. Lancer les « NON » dans l'ordre des numéros.
select v as script, case when ok then 'oui' else 'NON — à lancer' end as lance from (values
  ('v15 ordres',             exists (select 1 from pg_proc where proname = 'mp_ambush_orders')),
  ('v16 pavillons',          exists (select 1 from pg_proc where proname = 'mp_reply_flag')),
  ('v17 index balises',      exists (select 1 from pg_indexes where indexname = 'convoys_via_gin')),
  ('v18 colonies',           to_regclass('public.colonies') is not null),
  ('v19 départ colonie',     exists (select 1 from pg_proc where proname = 'mp_launch_raid' and pg_get_function_arguments(oid) like '%p_origin_address%')),
  ('v20 audit',              exists (select 1 from pg_proc where proname = 'mp_requeue_stuck_raids')),
  ('v21 test à deux',        exists (select 1 from pg_proc where proname = '_mp_worlds_clean')),
  ('v22 pillage colonie',    exists (select 1 from pg_proc where proname = '_mp_colony_loot_cap')),
  ('v23 dépôt colonial',     exists (select 1 from pg_proc where proname = 'mp_colony_publish' and pg_get_function_arguments(oid) like '%p_stocks%')),
  ('v24 pavillons (effets)', exists (select 1 from pg_proc where proname = '_mp_flag_effects')),
  ('v25 commerce',           exists (select 1 from pg_proc where proname = 'mp_trade_poll')),
  ('v26 alliances',          exists (select 1 from pg_proc where proname = 'mp_alliance_found')),
  ('v27 univers ouvert',     exists (select 1 from pg_proc where proname = 'mp_in_test_zone' and prosrc like '%^A-[A-Z]-%')),
  ('v28 empire',             exists (select 1 from pg_proc where proname = 'mp_set_wanted')),
  ('v29 mode pacifique',     exists (select 1 from pg_proc where proname = 'mp_peace_renounce')
                         and exists (select 1 from pg_proc where proname = '_mp_garrisons_peace')),
  ('v30 parrainage',         exists (select 1 from pg_proc where proname = 'mp_ref_claim'))
) t(v, ok);
