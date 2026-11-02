-- Starbyte v38 — Vaisseau ambassadeur (GDD claude/starbyte_GDD_vaisseau_ambassadeur.md)
-- Un vaisseau du Blackmarket remplit une mission de tanker : le registre retient quel vaisseau est là,
-- après avoir vérifié qu'il appartient bien au joueur. orbit_presence et dock_presence ne changent pas.
-- À exécuter une fois dans le SQL Editor. Sans cette version, le jeu continue de marcher : on voit l'amiral.

create table if not exists public.bm_envoys (
  user_id    uuid not null references auth.users (id) on delete cascade,
  mission_id text not null,
  item_id    text not null references public.bm_catalog (item_id),
  rumored    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, mission_id)
);
alter table public.bm_envoys enable row level security;   -- aucune lecture directe : tout passe par les fonctions

-- Rumeurs de l'ambassadeur (reprend la liste de v28, ajoute les deux sortes)
alter table public.rumors drop constraint if exists rumors_kind_check;
alter table public.rumors add constraint rumors_kind_check check (kind = any (array['raid_victory', 'raid_repelled', 'route_legendary', 'world_growth', 'rare_discovery',
  'pact_signed', 'pact_broken', 'convoy_robbed', 'ambush_repelled', 'route_betrayal', 'route_sold', 'war_declared', 'peace_made', 'trade_signed',
  'alliance_founded', 'alliance_joined', 'alliance_left', 'alliance_kicked', 'bounty_claimed', 'envoy_dock', 'envoy_orbit']));

-- Arrivée d'un ambassadeur : inscrit le vaisseau présent, et lance la rumeur (une par joueur et par jour).
-- Une ambassade ne nomme jamais le monde visité : ni adresse, ni secteur, ni pseudo du visité.
create or replace function public.bm_envoy_arrive(p_mission text, p_item text, p_kind text, p_place text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; place text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_kind not in ('dock', 'orbit') then raise exception 'bad_kind'; end if;
  if coalesce(p_mission, '') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'bad_mission'; end if;
  if not public._bm_owns_item(me, p_item) then raise exception 'not_owner'; end if;
  insert into public.bm_envoys (user_id, mission_id, item_id) values (me, p_mission, p_item)
    on conflict (user_id, mission_id) do nothing;
  if not found then return; end if;                                   -- déjà annoncé : rien à refaire
  if exists (select 1 from public.bm_envoys where user_id = me and rumored and created_at > now() - interval '1 day') then return; end if;
  select pseudo into nm from public.worlds where user_id = me limit 1;
  if nm is null then return; end if;
  place := case when p_kind = 'dock' then nullif(left(regexp_replace(coalesce(p_place, ''), '[<>&"]', '', 'g'), 60), '') end;
  insert into public.rumors (kind, actor, target, sector, payload)
    values (case when p_kind = 'dock' then 'envoy_dock' else 'envoy_orbit' end, nm, place, '',
            jsonb_build_object('item', p_item, 'v', floor(random() * 1000)::int));
  update public.bm_envoys set rumored = true where user_id = me and mission_id = p_mission;
end $$;
revoke all on function public.bm_envoy_arrive(text, text, text, text) from public, anon;
grant execute on function public.bm_envoy_arrive(text, text, text, text) to authenticated;

-- Le vaisseau présent, avec son logo : au quai pour tout le monde, en orbite pour les deux commandants concernés
create or replace function public.bm_envoy_face(p_kind text, p_presence uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u uuid; mid text; r jsonb;
begin
  if auth.uid() is null then return null; end if;
  if p_kind = 'dock' then
    select d.user_id, d.mission_id into u, mid from public.dock_presence d where d.id = p_presence;
  elsif p_kind = 'orbit' then
    select o.user_id, o.mission_id into u, mid from public.orbit_presence o
     where o.id = p_presence and auth.uid() in (o.user_id, o.target_id);
  end if;
  if u is null then return null; end if;
  select jsonb_build_object('item_id', e.item_id, 'path', l.path, 'slots', coalesce(sp.slots, '{}'), 'outline', coalesce(sp.outline, true), 'envoy', true)
    into r
    from public.bm_envoys e
    left join public.bm_ship_paint sp on sp.user_id = e.user_id and sp.item_id = e.item_id
    left join public.bm_logos l on l.id = sp.logo_id and l.status = 'ok'
   where e.user_id = u and e.mission_id = mid and public._bm_owns_item(e.user_id, e.item_id);
  return r;
end $$;
revoke all on function public.bm_envoy_face(text, uuid) from public, anon;
grant execute on function public.bm_envoy_face(text, uuid) to authenticated;

-- Abordage sans butin : le pirate apprend à qui il a eu affaire (il connaît déjà le pseudo de sa victime)
create or replace function public.bm_intercept_ship(p_intercept text)
returns text language sql stable security definer set search_path = public as $$
  select c.tanker_name from public.intercepts i join public.convoys c on c.id = i.convoy_id
   where i.id::text = p_intercept and i.pirate_id = auth.uid()
$$;
revoke all on function public.bm_intercept_ship(text) from public, anon;
grant execute on function public.bm_intercept_ship(text) to authenticated;
