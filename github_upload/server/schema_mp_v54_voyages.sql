-- v54 (12/11/2026) — VOYAGES FIXÉS PAR LE SERVEUR (étape 4 de la migration de la carte)
-- Décisions d'Adrien (11/11) : « l'univers est la source de vérité » ; E1 (durée = longueur ÷ vitesse), E3 (carburant
-- proportionnel à la longueur), E7 (minimum par mission), E8 (commencer par une table serveur des voyages).
-- Le téléphone demande un voyage (départ, port d'arrivée, catégorie de tanker, itinéraire choisi) ; la fonction serveur
-- `voyage` calcule elle-même le chemin, les horaires et le carburant avec le générateur de l'univers et le réseau de
-- corridors, et les écrit ici. Le téléphone n'envoie jamais une durée ni un coût.
--   · lecture : chaque joueur ne lit que ses voyages (sécurité par ligne) ;
--   · écriture : aucune depuis le jeu ; seule la fonction `voyage` écrit, avec la clé de service ;
--   · une mission du jeu ne s'enregistre qu'une fois (user_id, mission_id).
-- Au début, seuls les tankers du compte pilote (Hadrien) vers un port franc du réseau passent par ici ; les missions
-- déjà parties et les autres joueurs ne changent pas.
-- À coller dans Supabase → SQL Editor → Run, puis déployer la fonction `voyage` (server/voyage/README.md).

create table if not exists public.voyages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  mission_id   text not null check (char_length(mission_id) between 4 and 80),
  kind         text not null default 'tanker' check (kind in ('tanker')),
  origin       text not null check (origin ~ '^[A-Z]{1,2}-[A-Z]-[0-9]{4}-[0-9]{1,2}$'),
  dest         text not null check (dest ~ '^[A-Z]{1,2}-[A-Z]-[0-9]{4}$'),
  tier         smallint not null check (tier between 1 and 3),
  pick         text not null check (pick in ('libre', 'cor')),
  net_version  text not null check (char_length(net_version) <= 40),
  plan         jsonb not null,
  departed_at  timestamptz not null,
  arrives_at   timestamptz not null check (arrives_at > departed_at),
  fuel         int not null check (fuel >= 0),
  status       text not null default 'enroute' check (status in ('enroute', 'arrived', 'cancelled')),
  created_at   timestamptz not null default now(),
  unique (user_id, mission_id)
);
create index if not exists voyages_user_time on public.voyages (user_id, departed_at desc);

alter table public.voyages enable row level security;
drop policy if exists voyages_read_own on public.voyages;
create policy voyages_read_own on public.voyages for select to authenticated using (user_id = auth.uid());
-- aucune politique d'écriture : les rôles du jeu ne peuvent ni créer, ni modifier, ni effacer un voyage
revoke insert, update, delete on public.voyages from anon, authenticated;
grant select on public.voyages to authenticated;
