-- v28 (22/10/2026) — RÉPUTATION IMPÉRIALE (décisions d'Adrien, 22/10 ; GDD claude/starbyte_GDD_reputation_imperiale.md)
-- Un commandant qui pille trop l'Empire devient « Recherché » : son avis de recherche est public, avec une prime.
-- Le commandant qui le pille avec succès touche la prime (créée par l'Empire), une fois par 24 h ; la prime retombe à zéro.
--   · le jeu publie son palier (0 libre · 1 surveillé · 2 recherché · 3 ennemi de l'Empire) et ses points ;
--   · la prime est calculée ici : 1 000 CG + 20 CG par point, plafond 9 000 CG ;
--   · elle s'inscrit dans le résultat du raid (result.bounty), que lisent les deux jeux.
-- À coller tel quel dans Supabase → SQL Editor → Run (après v27 ; pas de fonction à redéployer).

alter table public.worlds add column if not exists wanted smallint not null default 0;
alter table public.worlds add column if not exists wanted_rep int not null default 0;
alter table public.worlds add column if not exists bounty bigint not null default 0;
alter table public.worlds add column if not exists bounty_claimed_at timestamptz;

-- rumeur nouvelle : une prime touchée
alter table public.rumors drop constraint if exists rumors_kind_check;
alter table public.rumors add constraint rumors_kind_check check (kind = any (array['raid_victory', 'raid_repelled', 'route_legendary', 'world_growth', 'rare_discovery',
  'pact_signed', 'pact_broken', 'convoy_robbed', 'ambush_repelled', 'route_betrayal', 'route_sold', 'war_declared', 'peace_made', 'trade_signed',
  'alliance_founded', 'alliance_joined', 'alliance_left', 'alliance_kicked', 'bounty_claimed']));

-- mon palier (le jeu le publie quand il change, et de temps en temps)
create or replace function public.mp_set_wanted(p_level int, p_rep int)
returns public.worlds
language plpgsql security definer set search_path = public as $$
declare w public.worlds; lvl smallint := greatest(0, least(3, coalesce(p_level, 0)))::smallint; rep int := greatest(0, least(100000, coalesce(p_rep, 0)));
begin
  update public.worlds set
    wanted = lvl,
    wanted_rep = rep,
    bounty = case when lvl >= 2 and (bounty_claimed_at is null or bounty_claimed_at < now() - interval '24 hours')
                  then least(9000, 1000 + 20 * rep) else 0 end
  where user_id = auth.uid()
  returning * into w;
  if not found then raise exception 'no_world'; end if;
  return w;
end $$;
revoke all on function public.mp_set_wanted(int, int) from public, anon;
grant execute on function public.mp_set_wanted(int, int) to authenticated;

-- l'avis de recherche : les commandants recherchés (actifs ces 7 derniers jours), prime la plus haute d'abord
create or replace function public.mp_wanted_list()
returns table (pseudo text, address text, planet_name text, wanted smallint, bounty bigint, since_days int)
language sql stable security definer set search_path = public as $$
  select w.pseudo, w.address, w.planet_name, w.wanted, w.bounty, extract(day from now() - w.last_seen)::int
    from public.worlds w
   where w.wanted >= 2 and w.season = public.mp_season() and w.last_seen > now() - interval '7 days'
   order by w.bounty desc, w.wanted desc
   limit 20
$$;
revoke all on function public.mp_wanted_list() from public, anon;
grant execute on function public.mp_wanted_list() to authenticated;

-- la prime : au moment où un raid victorieux est inscrit, contre un commandant recherché
create or replace function public._mp_raid_bounty() returns trigger
language plpgsql security definer set search_path = public as $$
declare dw public.worlds;
begin
  if old.status <> 'resolving' or new.status <> 'resolved' then return new; end if;
  if coalesce(new.result ->> 'outcome', '') not in ('victory', 'pyrrhic', 'heroic', 'crushing_victory') then return new; end if;
  select * into dw from public.worlds where user_id = new.defender_id for update;
  if not found or dw.wanted < 2 or dw.bounty <= 0 then return new; end if;
  if dw.bounty_claimed_at is not null and dw.bounty_claimed_at > now() - interval '24 hours' then return new; end if;
  new.result := coalesce(new.result, '{}'::jsonb) || jsonb_build_object('bounty', dw.bounty);
  update public.worlds set bounty = 0, bounty_claimed_at = now(), wanted = least(wanted, 1)::smallint where user_id = new.defender_id;
  insert into public.rumors (kind, actor, target, sector, payload)
  values ('bounty_claimed', new.attacker_pseudo, new.defender_pseudo, split_part(new.defender_address, '-', 2), jsonb_build_object('bounty', dw.bounty));
  return new;
end $$;
drop trigger if exists raids_bounty on public.raids;
create trigger raids_bounty before update on public.raids for each row execute function public._mp_raid_bounty();

-- Fin v28. Vérification : select count(*) from pg_proc where proname in ('mp_set_wanted', 'mp_wanted_list', '_mp_raid_bounty');  → 3
