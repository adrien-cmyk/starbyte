-- STARBYTE — export E5 (12/11/2026) : remettre dans le dépôt les fonctions et tables du serveur posées à la main.
-- Avant l'étape 5 de la migration de la carte (embuscades sur un tronçon, balises sur les relais), il faut connaître
-- exactement ce que le serveur fait aujourd'hui pour les convois, les balises, les embuscades et les interceptions.
-- Ces fonctions ne sont pas dans le dépôt (mp_ambush_npc, mp_ambush_orders, mp_intercept, mp_beacon_scan, …).
--
-- LECTURE SEULE : cette requête ne modifie rien. (Aucune création de table : l'éditeur de Supabase n'affiche plus d'alerte RLS.)
-- Supabase → SQL Editor → coller → Run → en bas à droite « Export » → CSV → envoyer le fichier à Claude.

with fns as (
  select 'fonction' as genre, p.proname as nom, pg_get_function_identity_arguments(p.oid) as signature, pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and (p.proname ~ '^_?mp_(ambush|intercept|beacon|convoy|spy|post|auto_ambush|piracy|npc)' or p.proname ~ '(ambush|intercept|convoy|beacon)')
), tbls as (
  select 'table' as genre, c.table_name as nom, '' as signature,
         'colonnes de public.' || c.table_name || E' :\n  ' || string_agg(c.column_name || ' ' || c.data_type || coalesce(' default ' || c.column_default, '') || case when c.is_nullable = 'NO' then ' not null' else '' end, E',\n  ' order by c.ordinal_position) || E'\n' as definition
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name in ('convoys', 'ambushes', 'intercepts', 'beacons', 'mp_beacons', 'spotted', 'route_posts', 'posts')
  group by c.table_name
), trg as (
  select 'déclencheur' as genre, t.tgname as nom, c.relname as signature, pg_get_triggerdef(t.oid) as definition
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and c.relname in ('convoys', 'ambushes', 'intercepts')
)
select * from fns union all select * from tbls union all select * from trg
order by 1, 2;

-- Facultatif, seulement si l'extension pg_cron est active (sinon cette requête échoue, sans conséquence) :
-- select jobname, schedule, command from cron.job where command ~* '(ambush|intercept|convoy|beacon|raid)';
