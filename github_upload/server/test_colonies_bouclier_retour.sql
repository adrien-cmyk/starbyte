-- FIN DU TEST : les nouvelles colonies retrouvent leurs 72 h de protection à la fondation.
-- (les colonies fondées pendant le test restent sans bouclier ; le bouclier de 12 h après un raid n'a jamais changé)
alter table public.colonies alter column shield_until set default (now() + interval '72 hours');
-- vérification : le défaut doit afficher « now() + '72:00:00'::interval »
select column_default from information_schema.columns where table_schema = 'public' and table_name = 'colonies' and column_name = 'shield_until';
