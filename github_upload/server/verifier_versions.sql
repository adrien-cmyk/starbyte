-- Vérifie quels scripts SQL du multijoueur sont passés (v15 → v22). « oui » = déjà lancé.
select v, case when ok then 'oui' else 'NON — à lancer' end as lance from (values
  ('v15 ordres',             exists (select 1 from pg_proc where proname = 'mp_ambush_orders')),
  ('v16 pavillons',          exists (select 1 from pg_proc where proname = 'mp_reply_flag')),
  ('v17 index balises',      exists (select 1 from pg_indexes where indexname = 'convoys_via_gin')),
  ('v18 colonies',           to_regclass('public.colonies') is not null),
  ('v19 départ colonie',     exists (select 1 from pg_proc where proname = 'mp_launch_raid' and pg_get_function_arguments(oid) like '%p_origin_address%')),
  ('v20 audit',              exists (select 1 from pg_proc where proname = 'mp_requeue_stuck_raids')),
  ('v21 test à deux',        exists (select 1 from pg_proc where proname = '_mp_worlds_clean')),
  ('v22 pillage colonie',    exists (select 1 from pg_proc where proname = '_mp_colony_loot_cap')),
  ('v29 mode pacifique',     exists (select 1 from pg_proc where proname = 'mp_peace_state'))
) t(v, ok);
