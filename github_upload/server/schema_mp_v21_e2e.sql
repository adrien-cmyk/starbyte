-- v21 (20/10/2026) — suite du test à deux commandants (harnais e2e)
--   · ambassade et pacte conclus à une colonie : inscrits à l'adresse de la colonie (la fiche de la colonie montre le pacte)
--   · la publication périodique du défenseur ne remet plus dans le registre les stocks d'avant un pillage pas encore intégré
-- À coller tel quel dans Supabase → SQL Editor → Run (pas de fonction à redéployer).

create or replace function public._mp_worlds_clean() returns trigger
language plpgsql as $$
declare k text; pend bigint;
begin
  new.stocks := public._mp_clean_stocks(new.stocks);
  -- pillage résolu mais pas encore intégré par le jeu du défenseur : on ne le lui rend pas en publiant
  if tg_op = 'UPDATE' and current_user <> 'postgres' and auth.uid() = new.user_id then
    foreach k in array array['metal', 'energie', 'cristal'] loop
      select coalesce(sum(public._mp_num(r.result -> 'loot' ->> k)), 0) into pend
        from public.raids r where r.defender_id = new.user_id and r.status = 'resolved' and not r.defender_seen;
      if pend > 0 then new.stocks := new.stocks || jsonb_build_object(k, greatest(0, public._mp_num(new.stocks ->> k) - pend)); end if;
    end loop;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.mp_orbit_arrive(p_to_address text, p_mission text, p_tanker text, p_cargo jsonb, p_loss_applied boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.worlds; tgt public.worlds; pid uuid; c jsonb := '{}'::jsonb; k text; q bigint; total bigint := 0; lost jsonb;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  select * into tgt from public.worlds where user_id = public._mp_owner_of(p_to_address);
  if not found then raise exception 'target_unknown'; end if;
  if tgt.user_id = me.user_id then raise exception 'target_self'; end if;
  if p_mission is null or length(p_mission) > 80 then raise exception 'mission_invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit:' || me.user_id::text));   -- quotas sans course entre deux appareils
  select id into pid from public.orbit_presence where user_id = me.user_id and mission_id = p_mission;
  if found then return pid; end if;
  if (select count(*) from public.orbit_presence where user_id = me.user_id and left_at is null) >= 12 then
    raise exception 'orbit_quota';
  end if;
  -- anti-abus : 3 ambassades par jour vers un même monde, 10 par jour en tout
  if (select count(*) from public.orbit_presence where user_id = me.user_id and target_id = tgt.user_id
        and arrived_at > now() - interval '1 day') >= 3
     or (select count(*) from public.orbit_presence where user_id = me.user_id and arrived_at > now() - interval '1 day') >= 10 then
    raise exception 'orbit_rate';
  end if;
  -- verrou du convoi aller : un abordage en cours de résolution et l'arrivée ne se croisent pas
  select loot into lost from public.convoys where user_id = me.user_id and mission_id = p_mission and leg = 'out' for update;
  if p_loss_applied then lost := null; end if;          -- le jeu a déjà retiré le butin de sa cale
  -- cale : entiers positifs, trois ressources, plafond d'un Tanker T3 (+ marge des rencontres de route)
  foreach k in array array['metal', 'energie', 'cristal'] loop
    if (p_cargo ->> k) is not null and (p_cargo ->> k) !~ '^[0-9]{1,9}(\.[0-9]+)?$' then raise exception 'cargo_invalid'; end if;
    q := least(150000, coalesce(floor((p_cargo ->> k)::numeric)::bigint, 0));
    q := greatest(0, q - coalesce((lost ->> k)::bigint, 0));
    if q > 0 then c := c || jsonb_build_object(k, q); total := total + q; end if;
  end loop;
  if total > 150000 then raise exception 'cargo_invalid'; end if;
  insert into public.orbit_presence (user_id, target_id, owner_pseudo, owner_address, target_pseudo, target_address,
                                     mission_id, tanker_name, cargo, cargo_state)
    values (me.user_id, tgt.user_id, me.pseudo, me.address, tgt.pseudo, p_to_address,
            p_mission, left(coalesce(p_tanker, ''), 24), c, case when total > 0 then 'offered' else 'none' end)
    returning id into pid;
  return pid;
end $function$;
