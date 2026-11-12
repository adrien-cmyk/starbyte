-- Rejoue v55 (embuscades sur un tronçon) sur la base de test : chaque contrôle affiche OK ou lève une erreur.
\set ON_ERROR_STOP 1
\set P '''00000000-0000-0000-0000-00000000000a'''
\set V '''00000000-0000-0000-0000-00000000000b'''
\set W '''00000000-0000-0000-0000-00000000000c'''
insert into auth.users values (:P), (:V), (:W);
insert into public.worlds (user_id, address, pseudo) values (:P, 'A-O-2178-07', 'Hadrien'), (:V, 'A-N-1234-03', 'Victime'), (:W, 'A-K-2000-01', 'Témoin');
insert into public.registry_fleets values (:P, 'fl-1', '{"composition":{"fregate":{"t1":3},"tanker":{"t1":1}}}'), (:P, 'fl-2', '{"composition":{"fregate":{"t1":2}}}');
create temp table r (k text primary key, v text);
create function pg_temp.ms(t timestamptz) returns bigint language sql as $$ select (extract(epoch from t) * 1000)::bigint $$;
create function pg_temp.legs(e text, a text, b text, t0 timestamptz, t1 timestamptz) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('e', e, 'a', a, 'b', b, 't0', pg_temp.ms(t0), 't1', pg_temp.ms(t1))) $$;
create function pg_temp.ok(name text, cond boolean, info text default '') returns text language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ÉCHEC % %', name, info; end if; return 'OK ' || name || ' ' || info; end $$;

-- 1. une flotte postée sur un tronçon, sans balise
select set_config('request.jwt.claim.sub', :P, false) \g /dev/null
insert into r select 'aid', public.mp_ambush_post_seg('fl-1', 'Lames', 'C5.2', 'A-M-1979', 'A-M-3340', '{}'::jsonb)::text;
select pg_temp.ok('POSE', a.edge = 'C5.2' and a.system = 'A-M-1979' and a.node_b = 'A-M-3340' and a.fleet -> 'composition' -> 'fregate' ->> 't1' = '3',
  'tronçon C5.2 (A-M-1979 → A-M-3340), flotte lue au registre, aucune balise exigée') from public.ambushes a where a.id = (select v::uuid from r where k = 'aid');
select pg_temp.ok('POSE-IDEM', public.mp_ambush_post_seg('fl-1', 'Lames', 'C5.2', 'A-M-1979', 'A-M-3340', '{}'::jsonb)::text = (select v from r where k = 'aid'), 'reposer la même flotte au même endroit rend la même embuscade');
do $$ begin perform public.mp_ambush_post_seg('fl-2', 'X', 'Z9', 'A-M-1979', 'A-M-3340', '{}'::jsonb); raise exception 'aurait dû refuser'; exception when others then if sqlerrm <> 'ambush_invalid' then raise; end if; end $$;
select 'OK POSE-REFUS tronçon mal formé refusé (ambush_invalid)';
update public.ambushes set orders = '{"mode":"rob_all","players":true}', posted_at = now() - interval '10 minutes' where id = (select v::uuid from r where k = 'aid');

-- 2. des convois de la victime
select set_config('request.jwt.claim.sub', :V, false) \g /dev/null
insert into public.convoys (user_id, pseudo, address, mission_id, leg, kind, from_system, to_system, arrives_at, cargo, legs) values
  (:V, 'Victime', 'A-N-1234-03', 'tm-entre-apres', 'out', 'route', 'A-N-1234', 'A-M-3340', now() + interval '20 minutes', '{"metal":500}', pg_temp.legs('C5.2', 'A-M-1979', 'A-M-3340', now() - interval '5 minutes', now() + interval '5 minutes')),
  (:V, 'Victime', 'A-N-1234-03', 'tm-entre-avant', 'out', 'route', 'A-N-1234', 'A-M-3340', now() + interval '20 minutes', '{"metal":500}', pg_temp.legs('C5.2', 'A-M-1979', 'A-M-3340', now() - interval '15 minutes', now() - interval '2 minutes')),
  (:V, 'Victime', 'A-N-1234-03', 'tm-pas-encore', 'out', 'route', 'A-N-1234', 'A-M-3340', now() + interval '20 minutes', '{"metal":500}', pg_temp.legs('C5.2', 'A-M-1979', 'A-M-3340', now() + interval '5 minutes', now() + interval '9 minutes')),
  (:V, 'Victime', 'A-N-1234-03', 'tm-autre-troncon', 'out', 'route', 'A-N-1234', 'A-N-8096', now() + interval '20 minutes', '{"metal":500}', pg_temp.legs('C2.3', 'A-N-7595', 'A-N-9950', now() - interval '5 minutes', now() + interval '5 minutes'));

-- 3. le balayage (n'importe quel joueur l'aide)
select set_config('request.jwt.claim.sub', :W, false) \g /dev/null
insert into r select 'n1', public.mp_segment_scan()::text;
select pg_temp.ok('INTERCEPTION', (select v from r where k = 'n1') = '1'
  and (select status from public.convoys where mission_id = 'tm-entre-apres') = 'engaged'
  and exists (select 1 from public.intercepts i join public.convoys c on c.id = i.convoy_id where c.mission_id = 'tm-entre-apres' and i.status = 'pending' and i.pirate_id = :P),
  'le convoi entré sur C5.2 après la pose est intercepté (abordage en file pour resolve-raids)');
select pg_temp.ok('AVANT-LA-POSE', (select status from public.convoys where mission_id = 'tm-entre-avant') = 'enroute', 'entré avant la pose : pas vu');
select pg_temp.ok('PAS-ENCORE', (select status from public.convoys where mission_id = 'tm-pas-encore') = 'enroute', 'pas encore entré : pas encore intercepté');
select pg_temp.ok('AUTRE-TRONCON', (select status from public.convoys where mission_id = 'tm-autre-troncon') = 'enroute', 'autre tronçon : rien');
select pg_temp.ok('CADENCE', public.mp_segment_scan() = 0, 'deuxième balayage dans les 15 s : rien (cadence)');
update public.mp_settings set value = to_jsonb(now() - interval '1 minute') where key = 'segment_scan_at';
update public.convoys set legs = pg_temp.legs('C5.2', 'A-M-1979', 'A-M-3340', now() - interval '1 minute', now() + interval '5 minutes') where mission_id = 'tm-pas-encore';
select pg_temp.ok('UN-A-LA-FOIS', public.mp_segment_scan() = 0 and (select status from public.convoys where mission_id = 'tm-pas-encore') = 'enroute', 'abordage en cours : la flotte attend (un à la fois)');

-- 4. protections : un pacte actif laisse passer
update public.intercepts set status = 'done';
update public.mp_settings set value = to_jsonb(now() - interval '1 minute') where key = 'segment_scan_at';
insert into public.pacts values (:P, :V, 'active');
select pg_temp.ok('PACTE', public.mp_segment_scan() = 0 and (select status from public.convoys where mission_id = 'tm-pas-encore') = 'enroute', 'pacte actif : le convoi passe');
delete from public.pacts;
update public.mp_settings set value = to_jsonb(now() - interval '1 minute') where key = 'segment_scan_at';
insert into r select 'n2', public.mp_segment_scan()::text;
select pg_temp.ok('SANS-PACTE', (select v from r where k = 'n2') = '1' and (select status from public.convoys where mission_id = 'tm-pas-encore') = 'engaged', 'sans pacte, au balayage suivant : intercepté');

-- 5. l'abordage « au système » ne touche plus aux embuscades sur un tronçon (avant v55, il l'aurait fait ici)
update public.intercepts set status = 'done';
insert into public.beacons (user_id, local_id, system) values (:P, 'b1', 'A-M-1979');
insert into public.convoys (user_id, pseudo, address, mission_id, leg, kind, from_system, to_system, arrives_at, cargo)
  values (:V, 'Victime', 'A-N-1234-03', 'tm-depart-relais', 'out', 'route', 'A-M-1979', 'A-M-3340', now() + interval '30 minutes', '{"metal":500}');
insert into r select 'n3', public.mp_auto_ambush()::text;
select pg_temp.ok('AUTO-SYSTEME', (select v from r where k = 'n3') = '0' and (select status from public.convoys where mission_id = 'tm-depart-relais') = 'enroute', 'mp_auto_ambush ignore les embuscades sur un tronçon');

-- 6. un convoi inscrit après son voyage prend chemin, horaires et tronçons du voyage
insert into public.voyages (user_id, mission_id, origin, dest, tier, pick, net_version, plan, departed_at, arrives_at, fuel)
  values (:V, 'tm-voyage-1', 'A-N-1234-03', 'A-M-3340', 1, 'cor', 'net-test', jsonb_build_object('via', jsonb_build_array('A-K-4227', 'A-M-1979'),
          'segs', pg_temp.legs('C5.2', 'A-M-1979', 'A-M-3340', now() + interval '3 minutes', now() + interval '8 minutes')), now() - interval '1 minute', now() + interval '8 minutes', 60);
insert into public.convoys (user_id, pseudo, address, mission_id, leg, kind, from_system, to_system, departed_at, arrives_at, cargo)
  values (:V, 'Victime', 'A-N-1234-03', 'tm-voyage-1', 'out', 'route', 'A-N-1234', 'A-M-3340', now(), now() + interval '40 minutes', '{"metal":100}');
select pg_temp.ok('DEPUIS-VOYAGE', c.via = array['A-K-4227', 'A-M-1979'] and c.legs -> 0 ->> 'e' = 'C5.2' and abs(extract(epoch from c.arrives_at - v.arrives_at)) < 1,
  'via, tronçons et arrivée repris du voyage (au lieu des 40 min annoncées par le jeu)') from public.convoys c join public.voyages v on v.mission_id = c.mission_id where c.mission_id = 'tm-voyage-1';

-- 7. fenêtre de passage avec des tronçons datés : une balise sur le relais voit le convoi à l'heure exacte
update public.convoys set legs = pg_temp.legs('C5.2', 'A-M-1979', 'A-M-3340', now() + interval '1 minute', now() + interval '11 minutes') where mission_id = 'tm-voyage-1';
select pg_temp.ok('FENETRE', public._mp_convoy_window(c, 'A-M-1979') is not null and public._mp_convoy_window(c, 'A-K-4227') is null,
  'vu au relais A-M-1979 (entrée dans 1 min, demi-fenêtre 5 min) ; A-K-4227 n''est pas un bout de tronçon daté : rien') from public.convoys c where c.mission_id = 'tm-voyage-1';
select pg_temp.ok('BALISE-RELAIS', exists (select 1 from public.mp_beacon_scan() s where s.system = 'A-M-1979'), 'mp_beacon_scan (exportée) voit ce convoi depuis la balise du relais')
  from (select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false)) x;
