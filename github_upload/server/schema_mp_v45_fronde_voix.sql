-- v45 (07/11/2026) — GRANDE FRONDE · VRAIES VOIX : les phrases des commentateurs lues une fois par ElevenLabs
-- (fonction serveur fronde-voice), gardées dans l'espace public « fronde-voix » et resservies à tous les joueurs.
-- À coller tel quel dans Supabase → SQL Editor → Run. Ensuite : déployer fronde-voice (secret ELEVENLABS_API_KEY).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fronde-voix', 'fronde-voix', true, 2097152, array['audio/mpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- une ligne par phrase lue (empreinte = nom du fichier) : sert de cache et de compteur de caractères
create table if not exists public.fronde_voice_lines (
  hash       text primary key,
  who        text not null check (who in ('A', 'B')),
  chars      int not null check (chars > 0),
  text       text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fronde_voice_lines_at on public.fronde_voice_lines (created_at);
create index if not exists fronde_voice_lines_by on public.fronde_voice_lines (created_by, created_at);
alter table public.fronde_voice_lines enable row level security;   -- aucune règle : seule la fonction serveur y touche

-- caractères lus depuis le début du mois (tous joueurs) et depuis 24 h (ce joueur) : plafonds de fronde-voice
create or replace function public.fronde_voice_usage(p_user uuid, p_month timestamptz, p_day timestamptz)
returns table (month_chars bigint, user_chars bigint)
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(chars) from public.fronde_voice_lines where created_at >= p_month), 0),
         coalesce((select sum(chars) from public.fronde_voice_lines where created_by = p_user and created_at >= p_day), 0);
$$;
revoke all on function public.fronde_voice_usage(uuid, timestamptz, timestamptz) from public, anon, authenticated;
