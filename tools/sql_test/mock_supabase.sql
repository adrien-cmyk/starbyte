-- Base de test locale (PostgreSQL 16) qui imite le strict nécessaire de Supabase pour rejouer v54 et v55.
-- Tables : celles de l'export E5 (server/export_e5/export_2026-11-12.csv) ; fonctions absentes de l'export : remplacées par
-- des doublures simples, signalées. Utilisée par tools/sql_test/run.sh. Ne jamais l'appliquer à Supabase.
drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create extension if not exists pgcrypto;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.worlds (user_id uuid primary key, address text not null, pseudo text not null, season int not null default 1,
  created_at timestamptz not null default now() - interval '30 days', level int not null default 10, peaceful boolean not null default false);
create table public.colonies (user_id uuid not null, address text not null);
create table public.mp_settings (key text primary key, value jsonb, updated_at timestamptz default now());
create table public.pacts (proposer_id uuid, partner_id uuid, status text);
create table public.spied (pirate_id uuid, victim_id uuid, convoy_id uuid, from_system text, to_system text, auto boolean default false, seen boolean default false,
  created_at timestamptz default now(), unique (pirate_id, convoy_id));
create table public.registry_fleets (user_id uuid, fleet_id text, fleet jsonb);   -- doublure du registre v47
-- tables exportées (colonnes de l'export E5)
create table public.ambushes (id uuid default gen_random_uuid() primary key, user_id uuid not null, pseudo text not null, fleet_id text not null, fleet_name text,
  system text not null, fleet jsonb not null, hold jsonb default '{}'::jsonb not null, hold_claimed boolean default false not null,
  posted_at timestamptz default now() not null, left_at timestamptz, orders jsonb default '{}'::jsonb not null, npc_keys text[] default '{}'::text[] not null);
create table public.beacons (id uuid default gen_random_uuid() primary key, user_id uuid not null, local_id text not null, system text not null,
  placed_at timestamptz default now() not null, removed_at timestamptz);
create table public.convoys (id uuid default gen_random_uuid() primary key, user_id uuid not null, pseudo text not null, address text not null,
  mission_id text not null, leg text not null, kind text not null, from_system text not null, to_system text not null, dock_name text,
  route_type text default 'direct' not null, knowledge integer default 0 not null, protection numeric default 0 not null, tanker_tier integer default 1 not null,
  tanker_name text, cargo jsonb default '{}'::jsonb not null, departed_at timestamptz default now() not null, arrives_at timestamptz not null,
  status text default 'enroute' not null, loot jsonb, outcome text, loss_mode text, intercept_system text, cancelled boolean default false not null,
  pirate_id uuid, pirate_pseudo text, spied_since timestamptz, seen boolean default false not null, via text[], own_route boolean default false not null);
create table public.intercepts (id uuid default gen_random_uuid() primary key, ambush_id uuid not null, convoy_id uuid not null, pirate_id uuid not null,
  victim_id uuid not null, status text default 'pending' not null, result jsonb, created_at timestamptz default now() not null,
  claimed_at timestamptz, resolved_at timestamptz, seen boolean default false not null);
-- doublures des fonctions hors export (comportement minimal)
create function public._mp_system(p text) returns text language sql immutable as $$ select case when p ~ '^[A-Z]{1,2}-[A-Z]-[0-9]{4}' then substring(p from '^[A-Z]{1,2}-[A-Z]-[0-9]{4}') end $$;
create function public._mp_registry_fleet_by_id(me public.worlds, p_fleet_id text) returns jsonb language sql stable as $$ select coalesce((select fleet from public.registry_fleets where user_id = me.user_id and fleet_id = p_fleet_id), '{}'::jsonb) $$;
create function public._mp_cargo_cap(tier int) returns bigint language sql immutable as $$ select (tier * 1000)::bigint $$;
create function public._mp_same_alliance(a uuid, b uuid) returns boolean language sql stable as $$ select coalesce((select value::text::boolean from public.mp_settings where key = 'test_allies'), false) $$;
create function public.mp_guards_on() returns boolean language sql stable as $$ select false $$;
create function public._mp_pair_lock(a uuid, b uuid) returns void language sql as $$ select $$;
