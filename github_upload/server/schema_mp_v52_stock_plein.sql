-- v52 (08/11/2026 soir) — CORRECTIF : « stock plein » n'est pas « rapport pas encore arrivé »
-- Observé sur les premiers vrais joueurs : artefacts à 200/200 → le jeu n'ajoute rien, n'écrit aucune ligne 'm3' pour
-- cette ressource, et sb_m3_settle prenait l'absence de ligne pour un rapport non reçu → crédit serveur entier → dérive
-- de −219 artefacts sur une capitale. Désormais :
--   · le jeu envoie une ligne 'm3' à ZÉRO pour chaque ressource créditée qu'il n'a pas pu ajouter (stock plein) ;
--   · sb_ledger accepte ces lignes à zéro (motifs m3/m3srv avec référence) et borne le crédit serveur déjà porté ;
--   · sb_m3_settle : si AU MOINS UNE ligne client existe pour la partie, une ressource sans ligne vaut zéro ;
--   · soldes serveur resynchronisés sur les stocks déclarés (Temps B dormant, on calibre encore).
-- Nécessite v50/v51. À coller dans Supabase → SQL Editor → Run. Le jeu correspondant est publié par le workflow (main).

create or replace function public.sb_ledger(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); keys text[] := public._sb_res_keys();
  snap jsonb; ents jsonb; e jsonb; w text; k text; d numeric; r text; rf text; at_ts timestamptz;
  fresh text[] := '{}';
  srv record; appl numeric; adj numeric;
  bal jsonb; cl jsonb; dr jsonb; tol numeric; drifted boolean := false; last_an timestamptz;
  out_bal jsonb := '{}'::jsonb; out_drift jsonb := '{}'::jsonb; n int := 0;
begin
  if uid is null then raise exception 'no_session'; end if;
  if coalesce((select value from public.sb_settings where key = 'ledger_on'), 'true'::jsonb) = 'false'::jsonb then
    return jsonb_build_object('ok', false, 'off', true);
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'ledger_invalid'; end if;
  snap := coalesce(p -> 'snap', '{}'::jsonb); ents := coalesce(p -> 'entries', '[]'::jsonb);
  if jsonb_typeof(snap) <> 'object' or jsonb_typeof(ents) <> 'array' then raise exception 'ledger_invalid'; end if;
  if jsonb_array_length(ents) > 300 then raise exception 'ledger_invalid'; end if;

  for w in select * from jsonb_object_keys(snap) loop
    if w !~ '^[a-z0-9-]{1,24}$' or jsonb_typeof(snap -> w) <> 'object' then continue; end if;
    cl := '{}'::jsonb;
    foreach k in array keys loop cl := cl || jsonb_build_object(k, round(public._sb_num(snap -> w ->> k), 3)); end loop;
    if not exists (select 1 from public.resources where user_id = uid and world_id = w) then
      insert into public.resources (user_id, world_id, balances, client, client_at) values (uid, w, cl, cl, now());
      insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, src)
        select uid, w, key, value::numeric, value::numeric, 'init', 'server' from jsonb_each_text(cl);
      fresh := fresh || w;
    else
      update public.resources set client = cl, client_at = now(), updated_at = now() where user_id = uid and world_id = w;
    end if;
  end loop;

  for e in select * from jsonb_array_elements(ents) loop
    if jsonb_typeof(e) <> 'object' then continue; end if;
    w := coalesce(e ->> 'w', 'home'); k := e ->> 'k'; r := left(coalesce(e ->> 'r', 'gain'), 12); rf := left(e ->> 'ref', 40);
    d := round(public._sb_num(e ->> 'd'), 3);
    if w !~ '^[a-z0-9-]{1,24}$' or not (k = any (keys)) or abs(d) > 10000000 then continue; end if;
    if d = 0 and not (r in ('m3', 'm3srv') and rf is not null) then continue; end if;   -- v52 : zéro accepté pour une partie (stock plein)
    begin at_ts := to_timestamp(public._mp_num(e ->> 'at') / 1000.0); exception when others then at_ts := now(); end;
    if at_ts is null or at_ts < now() - interval '30 days' or at_ts > now() + interval '1 day' then at_ts := now(); end if;
    n := n + 1;
    if w = any (fresh) then
      appl := 0;
    elsif r in ('m3', 'm3srv') then
      appl := 0;
      if rf is not null then
        select * into srv from public.resource_ledger where user_id = uid and ref = rf and res = k and src = 'server' order by id desc limit 1;
        if found then
          adj := least(d, srv.delta) - srv.applied;
          if adj <> 0 then
            update public.resource_ledger set applied = resource_ledger.applied + adj where id = srv.id;
            perform public._sb_balance_add(uid, srv.world_id, k, adj);
          end if;
        end if;
      end if;
    else
      appl := d;
      perform public._sb_balance_add(uid, w, k, d);
    end if;
    insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, ref, src, at)
    values (uid, w, k, d, appl, r, rf, 'client', at_ts);
  end loop;

  for w in select * from jsonb_object_keys(snap) loop
    select balances, client into bal, cl from public.resources where user_id = uid and world_id = w;
    if bal is null then continue; end if;
    dr := '{}'::jsonb;
    foreach k in array keys loop
      d := round(coalesce((cl ->> k)::numeric, 0) - coalesce((bal ->> k)::numeric, 0), 1);
      dr := dr || jsonb_build_object(k, d);
      tol := greatest(500, 0.05 * abs(coalesce((bal ->> k)::numeric, 0)));
      if abs(d) > tol and not (w = any (fresh)) then drifted := true; end if;
    end loop;
    update public.resources set drift = dr where user_id = uid and world_id = w;
    out_bal := out_bal || jsonb_build_object(w, bal); out_drift := out_drift || jsonb_build_object(w, dr);
  end loop;
  if drifted then
    select max(at) into last_an from public.mp_anomalies where user_id = uid and kind = 'ledger_drift';
    if last_an is null or last_an < now() - interval '1 hour' then
      perform public._mp_anomaly(uid, 'ledger_drift', jsonb_build_object('drift', out_drift, 'balances', out_bal, 'entries', n));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'balances', out_bal, 'drift', out_drift,
    'm3_credit_on', coalesce((select value from public.sb_settings where key = 'm3_credit_on'), 'false'::jsonb));
end $$;

create or replace function public.sb_m3_settle(p_session bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record; k text; credit numeric; client_d numeric; appl numeric; w text; done jsonb := '{}'::jsonb; sref text; has_client boolean;
begin
  select * into s from public.m3_sessions where id = p_session;
  if not found or s.verified_at is null then return jsonb_build_object('ok', false, 'why', 'not_verified'); end if;
  if s.settled_at is not null then return jsonb_build_object('ok', true, 'already', true, 'settled', s.settled); end if;
  sref := 'seed:' || s.seed;
  select world_id into w from public.resource_ledger where user_id = s.user_id and ref = sref and src = 'client' order by id desc limit 1;
  has_client := found;                                    -- le rapport du jeu est-il déjà là ?
  w := coalesce(w, s.world, 'home');
  if s.error is null and s.server_credit is not null and jsonb_typeof(s.server_credit) = 'object' then
    for k in select * from jsonb_object_keys(s.server_credit) loop
      if not (k = any (public._sb_res_keys())) then continue; end if;
      credit := round(public._sb_num(s.server_credit ->> k), 3);
      if credit <= 0 then continue; end if;
      select sum(delta) into client_d from public.resource_ledger where user_id = s.user_id and ref = sref and res = k and src = 'client';
      -- v52 : rapport reçu mais pas de ligne pour cette ressource = le jeu n'a rien ajouté (stock plein) → zéro
      if client_d is null and has_client then client_d := 0; end if;
      appl := case when client_d is null then credit else greatest(0, least(client_d, credit)) end;
      insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, ref, src)
      values (s.user_id, w, k, credit, appl, 'm3srv', sref, 'server');
      if appl <> 0 then perform public._sb_balance_add(s.user_id, w, k, appl); end if;
      done := done || jsonb_build_object(k, appl);
    end loop;
  end if;
  update public.m3_sessions set settled_at = now(), settled = done where id = p_session;
  return jsonb_build_object('ok', true, 'settled', done, 'world', w);
end $$;
grant execute on function public.sb_m3_settle(bigint) to service_role;

-- Soldes serveur resynchronisés sur les stocks déclarés (les crédits « stock plein » portés à tort sont effacés)
update public.resources set balances = client, drift = '{}'::jsonb, updated_at = now() where client <> '{}'::jsonb;
insert into public.resource_ledger (user_id, world_id, res, delta, applied, reason, src)
  select user_id, world_id, 'metal', 0, 0, 'resync_v52', 'server' from public.resources where client <> '{}'::jsonb;

-- Fin v52. Vérification : select prosrc like '%has_client%' from pg_proc where proname = 'sb_m3_settle';  → true
