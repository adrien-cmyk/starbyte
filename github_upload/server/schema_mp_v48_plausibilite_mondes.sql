-- v48 (08/11/2026) — ANTITRICHE · PLAUSIBILITÉ DE CE QU'UN MONDE PUBLIE
-- Audit du 08/11 (§1) : worlds.level / defense / stocks sont déclarés par le jeu et servaient tels quels à résoudre
-- les raids. « defense = 10^9 » rendait impillable, « level = 1 » intouchable, « stocks = 0 » sans butin.
-- Désormais, à chaque publication, le serveur borne ces trois valeurs par ce que le même envoi déclare par
-- ailleurs (bâtiments, soldats, flottes du registre), avec les tables de valeurs du jeu et une marge :
--   · level   = 1 + somme des niveaux des bâtiments publiés (c'est la définition du jeu ; 25 parcelles max) ;
--   · stocks  ≤ (5 000 + capacité des silos publiés) × 1,5 + 10 000, par ressource ;
--   · defense ≤ (200 + soldats × défense/unité × 1,1 + défense des bâtiments + défense des vaisseaux
--               des flottes publiées + 500) × 1,15 × 1,10 ;
--   · soldats publiés ≤ 50 000 par sorte, bâtiments publiés ≤ 25, niveau de bâtiment ≤ 3.
-- Le serveur RABOTE (il ne refuse pas : un refus figerait la publication) et journalise chaque rabotage dans
-- mp_anomalies (kind 'world_clamped'). Le jeu publie en plus ses soldats (nouvelle colonne worlds.soldiers).
-- Limite assumée : soldats et flottes restent déclarés par le client ; on borne la cohérence, pas la vérité.
-- Nécessite v46 (_mp_anomaly, _mp_num). À coller tel quel dans Supabase → SQL Editor → Run.
-- Vérification : select count(*) from pg_proc where proname = '_mp_worlds_plausible';  → 1
-- Voir les rabotages : select at, pseudo, detail from public.mp_anomalies where kind = 'world_clamped' order by at desc;

alter table public.worlds add column if not exists soldiers jsonb not null default '{}'::jsonb;
grant update (soldiers) on public.worlds to authenticated;

-- Tables de valeurs du jeu (d01_config : DEFENSE_UNITS, BUILDING_TIERS, SHIP_TIERS, SB_RES_BASE). À tenir à jour avec le jeu.
create or replace function public._mp_val_tables() returns jsonb language sql immutable as $$
  select '{
    "unit_def":  { "garde": 200, "lourd": 800, "tourelle": 400, "tourelle_lourde": 1400 },
    "bld_def":   { "caserne": {"1": 200, "2": 800, "3": 3200}, "turret": {"1": 1500, "2": 5000, "3": 20000} },
    "silo":      { "silo_metal":   {"res": "metal",   "1": 5000, "2": 20000, "3": 100000},
                   "silo_energie": {"res": "energie", "1": 5000, "2": 20000, "3": 100000},
                   "silo_cristal": {"res": "cristal", "1": 2000, "2": 10000, "3": 50000} },
    "ship_def":  { "tanker": {"t1": 200, "t2": 500, "t3": 1200}, "fregate": {"t1": 200, "t2": 600, "t3": 1800}, "cuirasse": {"t1": 1500, "t2": 4500, "t3": 13500} },
    "res_base":  { "metal": 5000, "energie": 5000, "cristal": 5000 },
    "capital_base": 200, "skill_flat": 500, "skill_pct": 0.15, "skill_soldiers": 0.10, "marge": 1.10,
    "soldier_cap": 50000, "max_buildings": 25, "max_tier": 3
  }'::jsonb $$;

create or replace function public._mp_worlds_plausible() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tab jsonb := public._mp_val_tables();
  b jsonb; f jsonb; k text; t text; raw bigint; v bigint;
  n_bld int := 0; lvl_sum bigint := 0; bld_def numeric := 0;
  sold jsonb := '{}'::jsonb; sold_def numeric := 0;
  fleet_def numeric := 0;
  cap jsonb := '{}'::jsonb; st jsonb := '{}'::jsonb;
  lvl_max bigint; def_max numeric; st_max numeric;
  clamps jsonb := '[]'::jsonb;
begin
  -- bâtiments publiés : au plus 25, niveau 1..3 ; on en déduit niveau, défense passive et capacité des silos
  if jsonb_typeof(new.buildings) = 'array' then
    for b in select * from jsonb_array_elements(new.buildings) loop
      exit when n_bld >= (tab ->> 'max_buildings')::int;
      if jsonb_typeof(b) <> 'object' then continue; end if;
      n_bld := n_bld + 1;
      k := left(coalesce(b ->> 'key', ''), 40);
      t := least(greatest(public._mp_num(b ->> 'lvl'), 1), (tab ->> 'max_tier')::int)::text;
      lvl_sum := lvl_sum + t::int;
      if tab -> 'bld_def' ? k then bld_def := bld_def + coalesce((tab -> 'bld_def' -> k ->> t)::numeric, 0) * (case when (b ->> 'state') = 'damaged' then 0.5 else 1 end); end if;
      if tab -> 'silo' ? k then cap := cap || jsonb_build_object(tab -> 'silo' -> k ->> 'res', coalesce((cap ->> (tab -> 'silo' -> k ->> 'res'))::numeric, 0) + coalesce((tab -> 'silo' -> k ->> t)::numeric, 0)); end if;
    end loop;
  end if;

  -- soldats publiés : nettoyés et plafonnés. Un ancien client (avant le 08/11) n'en publie pas : on garde
  -- les derniers connus ; s'il n'y en a jamais eu, la borne de défense n'est pas appliquée cette fois.
  if (new.soldiers is null or new.soldiers = '{}'::jsonb) and tg_op = 'UPDATE' and old.soldiers is not null and old.soldiers <> '{}'::jsonb then new.soldiers := old.soldiers; end if;
  if jsonb_typeof(new.soldiers) = 'object' then
    for k in select * from jsonb_object_keys(tab -> 'unit_def') loop
      raw := public._mp_num(new.soldiers ->> k); v := least(raw, (tab ->> 'soldier_cap')::bigint);
      if v < raw then clamps := clamps || jsonb_build_array(jsonb_build_object('soldiers.' || k, raw, 'to', v)); end if;
      sold := sold || jsonb_build_object(k, v);
      sold_def := sold_def + v * (tab -> 'unit_def' ->> k)::numeric;
    end loop;
  end if;
  new.soldiers := sold;

  -- vaisseaux des flottes publiées (déjà nettoyées par worlds_clean_fleets)
  if jsonb_typeof(new.fleets) = 'array' then
    for f in select * from jsonb_array_elements(new.fleets) loop
      for k in select * from jsonb_object_keys(tab -> 'ship_def') loop
        for t in select * from jsonb_object_keys(tab -> 'ship_def' -> k) loop
          fleet_def := fleet_def + public._mp_num(f -> 'composition' -> k ->> t) * (tab -> 'ship_def' -> k ->> t)::numeric;
        end loop;
      end loop;
    end loop;
  end if;

  -- niveau : exactement 1 + somme des niveaux des bâtiments (c'est la définition du jeu)
  lvl_max := 1 + lvl_sum;
  if new.level is distinct from lvl_max::int then
    clamps := clamps || jsonb_build_array(jsonb_build_object('level', new.level, 'to', lvl_max));
    new.level := lvl_max::int;
  end if;

  -- défense : bornée par ce que tout cela peut produire, skills au maximum compris, marge 10 %
  def_max := ((tab ->> 'capital_base')::numeric + sold_def * (1 + (tab ->> 'skill_soldiers')::numeric) + bld_def + fleet_def + (tab ->> 'skill_flat')::numeric)
             * (1 + (tab ->> 'skill_pct')::numeric) * (tab ->> 'marge')::numeric;
  if new.soldiers <> '{}'::jsonb and new.defense > def_max then
    clamps := clamps || jsonb_build_array(jsonb_build_object('defense', new.defense, 'to', ceil(def_max)));
    new.defense := ceil(def_max)::int;
  end if;
  if new.defense < 0 then new.defense := 0; end if;

  -- stocks : base + silos, marge 50 % et 10 000 (pillage, achats, convois peuvent dépasser le silo)
  if jsonb_typeof(new.stocks) = 'object' then
    for k in select * from jsonb_object_keys(tab -> 'res_base') loop
      raw := public._mp_num(new.stocks ->> k);
      st_max := ((tab -> 'res_base' ->> k)::numeric + coalesce((cap ->> k)::numeric, 0)) * 1.5 + 10000;
      if raw > st_max then clamps := clamps || jsonb_build_array(jsonb_build_object('stocks.' || k, raw, 'to', floor(st_max))); raw := floor(st_max)::bigint; end if;
      st := st || jsonb_build_object(k, raw);
    end loop;
    -- les autres clés éventuelles (biomass, artefact…) passent telles quelles, nettoyées
    for k in select * from jsonb_object_keys(new.stocks) loop
      if not (tab -> 'res_base' ? k) then st := st || jsonb_build_object(k, public._mp_num(new.stocks ->> k)); end if;
    end loop;
    new.stocks := st;
  end if;

  if jsonb_array_length(clamps) > 0 then
    perform public._mp_anomaly(new.user_id, 'world_clamped', jsonb_build_object('clamps', clamps, 'buildings', n_bld, 'fleets', coalesce(jsonb_array_length(new.fleets), 0)));
  end if;
  return new;
end $$;

-- « zz » pour passer après worlds_clean_stocks (v20) et worlds_clean_fleets (v46), qui s'exécutent par ordre alphabétique
drop trigger if exists worlds_zz_plausible on public.worlds;
create trigger worlds_zz_plausible before insert or update of level, defense, stocks, buildings, soldiers, fleets on public.worlds
for each row execute function public._mp_worlds_plausible();

-- Fin v48.
