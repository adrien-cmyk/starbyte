-- ⚠ RETIRÉE le 14/11/2026 par schema_mp_v56_retrait_lecture_test.sql (outil de test supprimé du jeu) : ne plus rejouer ce fichier.
-- v53 (10/11/2026) — CARTE PAR ZONES · LECTURE D'UNE PARTIE (compte de test seulement)
-- Demande d'Adrien (10/11) : « J'aimerais voir ce que donne le jeu de Panzerstorm dans cette nouvelle carte. »
-- La carte par zones (atlas/index.html, ouverte par assets/zones_test.js) sait afficher la partie d'un autre
-- commandant EN LECTURE SEULE : sa capitale, ses colonies, ses signatures, ses cibles connues, ses systèmes déjà
-- relevés, ses sondes en vol. Ces données sont dans le registre (worlds, colonies) et dans sa sauvegarde (saves),
-- que la sécurité par ligne réserve à leur propriétaire : il faut donc une fonction serveur, réservée au compte de
-- test d'Adrien (même contrôle que dev_colony_remove, v37 : empreinte de l'email, plus sa capitale A-O-2178).
--   · dev_player_map(p_pseudo) : ne renvoie que ce qui sert à la carte (positions, signatures, rapports résumés) ;
--     jamais les stocks, la flotte, les messages, ni l'email ou l'identifiant du joueur ;
--   · aucune écriture : la partie lue n'est jamais modifiée.
-- À coller dans Supabase → SQL Editor → Run. Le jeu correspondant est publié par le workflow (main).

create or replace function public.dev_player_map(p_pseudo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); mail text;
  w_uid uuid; w_pseudo text; w_name text; w_addr text; w_level int;
  sdata jsonb; sat timestamptz; sg jsonb; st jsonb; sigs jsonb; kt jsonb; cands jsonb;
  q text := btrim(coalesce(p_pseudo, ''));
begin
  if me is null then raise exception 'dev_only'; end if;
  select u.email into mail from auth.users u where u.id = me;
  if not ((mail is not null and encode(sha256(convert_to(lower(btrim(mail)), 'UTF8')), 'hex') = 'c8bdf9434f4c2dda2d7376b468cbe2b9503d3228abeb7ff91a806c4cb7584aa4')
          or exists (select 1 from public.worlds x where x.user_id = me and x.address like 'A-O-2178-%')) then
    raise exception 'dev_only';
  end if;
  if q = '' then return jsonb_build_object('ok', false, 'why', 'empty'); end if;

  select x.user_id, x.pseudo, x.planet_name, x.address, x.level into w_uid, w_pseudo, w_name, w_addr, w_level
    from public.worlds x where lower(x.pseudo) = lower(q) limit 1;
  if not found then
    select coalesce(jsonb_agg(z.pseudo order by z.pseudo), '[]'::jsonb) into cands
      from (select x.pseudo from public.worlds x where strpos(lower(x.pseudo), lower(q)) > 0 order by x.pseudo limit 8) z;
    return jsonb_build_object('ok', false, 'why', 'unknown_pseudo', 'candidates', cands);
  end if;

  select s.data, s.updated_at into sdata, sat from public.saves s where s.user_id = w_uid;
  sg := coalesce(sdata -> 'savegame', '{}'::jsonb);
  st := coalesce(sdata -> 'stores', '{}'::jsonb);
  -- les stores sont des chaînes JSON (copies du localStorage) ; une valeur illisible est ignorée
  begin sigs := (st ->> 'starbyte_signatures')::jsonb; exception when others then sigs := null; end;
  begin kt := (st ->> 'starbyte_known_targets')::jsonb; exception when others then kt := null; end;
  if jsonb_typeof(sigs) is distinct from 'object' then sigs := '{}'::jsonb; end if;
  if jsonb_typeof(kt) is distinct from 'object' then kt := '{}'::jsonb; end if;

  return jsonb_build_object(
    'ok', true, 'pseudo', w_pseudo, 'planet_name', w_name, 'address', w_addr, 'level', w_level, 'saved_at', sat,
    'colonies', coalesce((select jsonb_agg(jsonb_build_object('address', c.address, 'name', c.name, 'level', c.level, 'created_at', c.created_at) order by c.created_at)
                          from public.colonies c where c.user_id = w_uid), '[]'::jsonb),
    'save_worlds', coalesce((select jsonb_agg(jsonb_build_object('id', x -> 'id', 'kind', x -> 'kind', 'coord', x -> 'coord',
                                     'name', coalesce(x -> 'data' -> 'planet' ->> 'name', x ->> 'name')))
                             from jsonb_array_elements(case when jsonb_typeof(sg -> 'worlds') = 'array' then sg -> 'worlds' else '[]'::jsonb end) x), '[]'::jsonb),
    'active_world', sg -> 'activeWorld',
    'active_name', sg -> 'planet' ->> 'name',
    'signatures', coalesce((select jsonb_agg(jsonb_build_object('id', v -> 'id', 'system', v -> 'system', 'type', v -> 'type', 'typeLabel', v -> 'typeLabel',
                                    'intensity', v -> 'intensity', 'resolved', v -> 'resolved', 'resolvedType', v -> 'resolvedType', 'fixedClass', v -> 'fixedClass',
                                    'fixedAddress', v -> 'fixedAddress', 'movingCoordKey', v -> 'movingCoordKey', 'ignored', v -> 'ignored', 'inCarnet', v -> 'inCarnet',
                                    'detectedAt', v -> 'detectedAt', 'resolvedAt', v -> 'resolvedAt'))
                            from jsonb_each(sigs) e(k, v) where jsonb_typeof(v) = 'object'), '[]'::jsonb),
    'known_targets', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'label', v -> 'label', 'status', v -> 'status', 'type', v -> 'type', 'discoveredAt', v -> 'discoveredAt'))
                               from jsonb_each(kt) e(k, v) where jsonb_typeof(v) = 'object'), '[]'::jsonb),
    'known_systems', coalesce((select jsonb_agg(z.k) from (select k from jsonb_object_keys(
                                 case when jsonb_typeof(sg -> 'knownSystems') = 'object' then sg -> 'knownSystems' else '{}'::jsonb end) k limit 2000) z), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('tier', r -> 'tier', 'target', r -> 'targetCoords', 'system', r -> 'systemAddress', 'sector', r -> 'sector',
                                 'at', r -> 'createdAt', 'world', r -> 'world', 'silent', r -> 'silent'))
                         from jsonb_array_elements(case when jsonb_typeof(sg -> 'probeReports') = 'array' then sg -> 'probeReports' else '[]'::jsonb end) r), '[]'::jsonb),
    'missions', coalesce((select jsonb_agg(jsonb_build_object('tier', m -> 'tier', 'target', m -> 'targetCoords', 'world', m -> 'world', 'status', m -> 'status',
                                  'departedAt', m -> 'departedAt', 'arrivalAt', m -> 'arrivalAt', 'mode', m -> 'mode'))
                          from jsonb_array_elements(case when jsonb_typeof(sg -> 'probeMissions') = 'array' then sg -> 'probeMissions' else '[]'::jsonb end) m), '[]'::jsonb),
    'arks', coalesce((select jsonb_agg(jsonb_build_object('coord', a -> 'coord', 'name', a -> 'name', 'departAt', a -> 'departAt', 'arriveAt', a -> 'arriveAt'))
                      from jsonb_array_elements(case when jsonb_typeof(sg -> 'colonyMissions') = 'array' then sg -> 'colonyMissions' else '[]'::jsonb end) a), '[]'::jsonb)
  );
end $$;
revoke all on function public.dev_player_map(text) from public, anon;
grant execute on function public.dev_player_map(text) to authenticated;
