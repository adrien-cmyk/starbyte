-- v35 (02/11/2026) — ATELIER DES LOGOS : logo importé peint sur les vaisseaux du Blackmarket (GDD claude/starbyte_GDD_atelier_logos.md)
--   · un fichier n'entre dans l'espace « ship-logos » que par la fonction serveur logo-upload, après le filtre ;
--   · un logo par modèle de vaisseau et par joueur, posé sur un ou plusieurs emplacements ; un vaisseau amiral par joueur ;
--   · les autres joueurs ne reçoivent un logo qu'à travers bm_raid_faces et bm_flagship_of.
-- À coller tel quel dans Supabase → SQL Editor → Run (après v34). Ensuite : déployer logo-upload et poser le secret ANTHROPIC_API_KEY.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ship-logos', 'ship-logos', true, 2097152, array['image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.bm_logos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  sha256     text not null,
  path       text not null,
  status     text not null default 'ok',   -- 'ok' | 'deleted' (par le joueur) | 'banned' (par Adrien : réimport refusé)
  created_at timestamptz not null default now()
);
create index if not exists bm_logos_user on public.bm_logos (user_id);
create index if not exists bm_logos_sha on public.bm_logos (sha256);
alter table public.bm_logos enable row level security;

create table if not exists public.bm_logo_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists bm_logo_attempts_u on public.bm_logo_attempts (user_id, at);
alter table public.bm_logo_attempts enable row level security;

create table if not exists public.bm_logo_blocked (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
alter table public.bm_logo_blocked enable row level security;

create table if not exists public.bm_ship_paint (
  user_id  uuid not null references auth.users (id) on delete cascade,
  item_id  text not null references public.bm_catalog (item_id),
  logo_id  uuid references public.bm_logos (id) on delete set null,
  slots    text[] not null default '{}',
  outline  boolean not null default true,
  flagship boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create unique index if not exists bm_ship_paint_flagship on public.bm_ship_paint (user_id) where flagship;
alter table public.bm_ship_paint enable row level security;
-- RLS sans politique : aucun accès direct ; tout passe par les fonctions ci-dessous.

create or replace function public._bm_owns_item(u uuid, item text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bm_purchases p where p.user_id = u and p.item_id = item and p.status = 'paid' and p.category in ('sport', 'dread'))
$$;
revoke all on function public._bm_owns_item(uuid, text) from public, anon, authenticated;

-- Poser, changer ou retirer (p_logo = null) le logo d'un modèle
create or replace function public.bm_paint_set(p_item text, p_logo uuid, p_slots text[], p_outline boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public._bm_owns_item(me, p_item) then raise exception 'not_owner'; end if;
  if p_logo is not null and not exists (select 1 from public.bm_logos l where l.id = p_logo and l.user_id = me and l.status = 'ok') then raise exception 'bad_logo'; end if;
  if coalesce(array_length(p_slots, 1), 0) > 8 then raise exception 'bad_slots'; end if;
  insert into public.bm_ship_paint (user_id, item_id, logo_id, slots, outline, updated_at)
  values (me, p_item, p_logo, coalesce(p_slots, '{}'), coalesce(p_outline, true), now())
  on conflict (user_id, item_id) do update set logo_id = excluded.logo_id, slots = excluded.slots, outline = excluded.outline, updated_at = now();
end $$;
revoke all on function public.bm_paint_set(text, uuid, text[], boolean) from public, anon;
grant execute on function public.bm_paint_set(text, uuid, text[], boolean) to authenticated;

-- Désigner le vaisseau amiral (p_item = null : aucun)
create or replace function public.bm_flagship_set(p_item text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_item is not null and not public._bm_owns_item(me, p_item) then raise exception 'not_owner'; end if;
  update public.bm_ship_paint set flagship = false where user_id = me and flagship;
  if p_item is not null then
    insert into public.bm_ship_paint (user_id, item_id, flagship) values (me, p_item, true)
    on conflict (user_id, item_id) do update set flagship = true, updated_at = now();
  end if;
end $$;
revoke all on function public.bm_flagship_set(text) from public, anon;
grant execute on function public.bm_flagship_set(text) to authenticated;

-- Retirer un logo de sa bibliothèque (le fichier reste, mais plus aucun écran ne le demande)
create or replace function public.bm_logo_delete(p_logo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  update public.bm_logos set status = 'deleted' where id = p_logo and user_id = me and status = 'ok';
  update public.bm_ship_paint set logo_id = null, updated_at = now() where user_id = me and logo_id = p_logo;
end $$;
revoke all on function public.bm_logo_delete(uuid) from public, anon;
grant execute on function public.bm_logo_delete(uuid) to authenticated;

-- ADMIN (SQL Editor uniquement) : retirer un logo partout et refuser son réimport ; p_block = true retire aussi le droit d'importer.
--   select public.bm_logo_ban('<id du logo>', false);
create or replace function public.bm_logo_ban(p_logo uuid, p_block boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare owner uuid; h text;
begin
  select user_id, sha256 into owner, h from public.bm_logos where id = p_logo;
  if owner is null then raise exception 'unknown_logo'; end if;
  update public.bm_logos set status = 'banned' where sha256 = h;
  update public.bm_ship_paint set logo_id = null, updated_at = now() where logo_id in (select id from public.bm_logos where sha256 = h);
  if p_block then insert into public.bm_logo_blocked (user_id) values (owner) on conflict do nothing; end if;
end $$;
revoke all on function public.bm_logo_ban(uuid, boolean) from public, anon, authenticated;

-- Ce que voit le défenseur d'un raid : les vaisseaux d'exception de l'assaillant, dreadnoughts d'abord
create or replace function public.bm_raid_faces(p_raid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (select attacker_id, fleet from public.raids where id = p_raid and defender_id = auth.uid()),
       it as (select distinct e ->> 'item' as item_id, e ->> 'cat' as cat from r, jsonb_array_elements(coalesce(r.fleet -> 'premium', '[]'::jsonb)) e)
  select coalesce(jsonb_agg(jsonb_build_object('item_id', it.item_id, 'path', l.path, 'slots', coalesce(sp.slots, '{}'), 'outline', coalesce(sp.outline, true))
                  order by case when it.cat = 'dread' then 0 else 1 end, it.item_id), '[]'::jsonb)
    from it cross join r
    left join public.bm_ship_paint sp on sp.user_id = r.attacker_id and sp.item_id = it.item_id
    left join public.bm_logos l on l.id = sp.logo_id and l.status = 'ok'
   where public._bm_owns_item(r.attacker_id, it.item_id)
$$;
revoke all on function public.bm_raid_faces(uuid) from public, anon;
grant execute on function public.bm_raid_faces(uuid) to authenticated;

-- Fiche d'un convoi au bar des docks : le vaisseau amiral de son commandant
create or replace function public.bm_flagship_of(p_presence uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('item_id', sp.item_id, 'path', l.path, 'slots', sp.slots, 'outline', sp.outline)
    from public.dock_presence d
    join public.bm_ship_paint sp on sp.user_id = d.user_id and sp.flagship
    left join public.bm_logos l on l.id = sp.logo_id and l.status = 'ok'
   where d.id = p_presence and public._bm_owns_item(d.user_id, sp.item_id)
$$;
revoke all on function public.bm_flagship_of(uuid) from public, anon;
grant execute on function public.bm_flagship_of(uuid) to authenticated;

-- bm_state : même réponse que v34, plus la bibliothèque de logos et la peinture des vaisseaux
create or replace function public.bm_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  return jsonb_build_object(
    'now', now(),
    'taxi_left', public.bm_taxi_left(),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'category', c.category, 'name', c.name,
                 'price_cents', c.price_cents, 'cap', k.cap) order by c.sort)
               from public.bm_catalog c join public.bm_categories k using (category) where c.active), '[]'::jsonb),
    'owned', case when me is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'item_id', p.item_id,
                 'category', p.category, 'livemode', p.livemode, 'at', p.created_at, 'disabled_until', p.disabled_until,
                 'edition_no', p.edition_no, 'taxi_address', p.taxi_address, 'taxi_used_at', p.taxi_used_at, 'show_pseudo', p.show_pseudo) order by p.created_at)
               from public.bm_purchases p where p.user_id = me and p.status = 'paid'), '[]'::jsonb) end,
    'logos', case when me is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'path', l.path) order by l.created_at)
               from public.bm_logos l where l.user_id = me and l.status = 'ok'), '[]'::jsonb) end,
    'paint', case when me is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('item_id', s.item_id, 'logo_id', l.id, 'path', l.path, 'slots', s.slots, 'outline', s.outline, 'flagship', s.flagship))
               from public.bm_ship_paint s left join public.bm_logos l on l.id = s.logo_id and l.status = 'ok' where s.user_id = me), '[]'::jsonb) end
  );
end $$;
revoke all on function public.bm_state() from public;
grant execute on function public.bm_state() to anon, authenticated;
