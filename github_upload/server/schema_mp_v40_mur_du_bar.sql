-- Starbyte — v40 (03/11/2026) : « Le mur du bar » — tableau commun et persistant de chaque port-franc.
-- GDD claude/starbyte_GDD_routes_balises_v2.md §2.7. À exécuter dans l'éditeur SQL de Supabase après schema_mp_v39_bernard.sql.
-- Lecture : tout joueur connecté qui connaît la station (il a son identifiant). Écriture : un tanker amarré à cette station
-- (dock_presence en cours), 280 caractères, 1 message / 20 s et 60 / jour par joueur. Les 100 derniers messages sont gardés.
create table if not exists public.station_posts (
  id uuid primary key default gen_random_uuid(),
  station text not null,
  user_id uuid not null,
  pseudo text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists station_posts_station_idx on public.station_posts (station, created_at desc);
create index if not exists station_posts_user_idx on public.station_posts (user_id, created_at desc);
alter table public.station_posts enable row level security;
revoke all on public.station_posts from public, anon, authenticated;

create or replace function public.mp_station_wall(p_station text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if coalesce(p_station, '') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'bad_station'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'body', p.body, 'at', p.created_at, 'mine', p.user_id = me) order by p.created_at desc), '[]'::jsonb)
    into r
    from (select * from public.station_posts where station = p_station order by created_at desc limit 100) p;
  return jsonb_build_object('posts', r,
    'can_post', exists (select 1 from public.dock_presence d where d.user_id = me and d.dock_id = p_station and d.leaves_at > now()));
end $$;
revoke all on function public.mp_station_wall(text) from public, anon;
grant execute on function public.mp_station_wall(text) to authenticated;

create or replace function public.mp_station_post(p_station text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; b text; n int; rid uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if coalesce(p_station, '') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'bad_station'; end if;
  b := left(btrim(regexp_replace(coalesce(p_body, ''), '[\u0000-\u001f\u007f]', ' ', 'g')), 280);
  if length(b) < 1 then raise exception 'empty'; end if;
  if not exists (select 1 from public.dock_presence d where d.user_id = me and d.dock_id = p_station and d.leaves_at > now()) then raise exception 'not_docked'; end if;
  select pseudo into nm from public.worlds where user_id = me limit 1;
  if nm is null then raise exception 'no_world'; end if;
  if exists (select 1 from public.station_posts where user_id = me and created_at > now() - interval '20 seconds') then raise exception 'too_fast'; end if;
  select count(*) into n from public.station_posts where user_id = me and created_at > now() - interval '1 day';
  if n >= 60 then raise exception 'too_many'; end if;
  insert into public.station_posts (station, user_id, pseudo, body) values (p_station, me, nm, b) returning id into rid;
  -- on ne garde que les 100 derniers messages de la station
  delete from public.station_posts where station = p_station and id not in (select id from public.station_posts where station = p_station order by created_at desc limit 100);
  return jsonb_build_object('id', rid, 'pseudo', nm, 'body', b, 'at', now(), 'mine', true);
end $$;
revoke all on function public.mp_station_post(text, text) from public, anon;
grant execute on function public.mp_station_post(text, text) to authenticated;
