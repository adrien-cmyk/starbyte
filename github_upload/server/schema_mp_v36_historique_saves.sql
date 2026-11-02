-- v36 (02/11/2026) — HISTORIQUE DES SAUVEGARDES : aucune partie ne doit pouvoir disparaître sans copie
--   · avant chaque écrasement ou suppression d'une partie qui a un commandant, une copie part dans saves_history :
--     au plus une toutes les 30 min, mais TOUJOURS si la partie est supprimée ou si elle fond de plus de moitié ;
--   · on garde les 24 copies les plus récentes, la dernière de chaque jour sur 14 jours, et les copies d'alerte 30 jours ;
--   · une partie sans commandant est refusée sur un compte lié à un email ou à la place d'une vraie partie ;
--   · table fermée aux joueurs : consultation et restauration seulement depuis le SQL Editor.
-- À coller tel quel dans Supabase → SQL Editor → Run. Peut être relancé sans risque.
--
-- Voir les copies d'un joueur :
--   select h.id, h.reason, h.saved_at, h.captain, pg_size_pretty(h.size_bytes::bigint) as taille
--   from public.saves_history h join auth.users u on u.id = h.user_id
--   where u.email = 'email@joueur' order by h.saved_at desc;
-- Restaurer (la plus récente, ou un id précis) :
--   select public.saves_restore('email@joueur');
--   select public.saves_restore('email@joueur', 123);

create table if not exists public.saves_history (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,     -- volontairement sans clé étrangère : la copie survit à la suppression du compte
  data       jsonb not null,
  save_version text,
  captain    text,
  size_bytes int not null default 0,
  reason     text not null,     -- 'periodique' | 'suppression' | 'perte_de_taille'
  saved_at   timestamptz not null default now()
);
create index if not exists saves_history_user on public.saves_history (user_id, saved_at desc);
alter table public.saves_history enable row level security;
revoke all on public.saves_history from public, anon, authenticated;

create or replace function public._saves_history_keep() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap text;
  old_size int; why text := null; last_at timestamptz;
begin
  cap := old.data->'savegame'->'profile'->>'captainName';
  if cap is null then return case when tg_op = 'DELETE' then old else new end; end if;
  old_size := octet_length(old.data::text);
  if tg_op = 'DELETE' then why := 'suppression';
  elsif octet_length(new.data::text) < old_size / 2 then why := 'perte_de_taille';
  else
    select max(saved_at) into last_at from public.saves_history where user_id = old.user_id;
    if last_at is null or last_at < now() - interval '30 minutes' then why := 'periodique'; end if;
  end if;
  if why is not null then
    insert into public.saves_history (user_id, data, save_version, captain, size_bytes, reason)
    values (old.user_id, old.data, old.save_version, cap, old_size, why);
    delete from public.saves_history h
     where h.user_id = old.user_id
       and h.id not in (select id from public.saves_history where user_id = old.user_id order by saved_at desc, id desc limit 24)
       and h.id not in (select distinct on (saved_at::date) id from public.saves_history
                         where user_id = old.user_id and saved_at > now() - interval '14 days' order by saved_at::date, saved_at desc, id desc)
       and not (h.reason <> 'periodique' and h.saved_at > now() - interval '30 days');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists saves_history_keep on public.saves;
create trigger saves_history_keep before update or delete on public.saves
for each row execute function public._saves_history_keep();

-- Refus des parties vides (déjà posé à la main le 02/11, repris ici pour que le dépôt soit complet)
create or replace function public._saves_refuse_vide() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.data->'savegame'->'profile'->>'captainName' is null
     and ((tg_op = 'UPDATE' and old.data->'savegame'->'profile'->>'captainName' is not null)
          or exists (select 1 from auth.users u where u.id = new.user_id and u.email is not null)) then
    raise exception 'partie_sans_commandant';
  end if;
  return new;
end $$;
drop trigger if exists saves_refuse_vide on public.saves;
create trigger saves_refuse_vide before insert or update on public.saves
for each row execute function public._saves_refuse_vide();

create or replace function public.saves_restore(p_email text, p_history bigint default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid; h public.saves_history;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'compte_inconnu'; end if;
  select * into h from public.saves_history where user_id = uid and (p_history is null or id = p_history) order by saved_at desc, id desc limit 1;
  if h.id is null then raise exception 'aucune_copie'; end if;
  insert into public.saves (user_id, data, save_version, updated_at) values (uid, h.data, h.save_version, now())
  on conflict (user_id) do update set data = excluded.data, save_version = excluded.save_version, updated_at = now();
  return 'Restauré : ' || coalesce(h.captain, '?') || ', copie du ' || h.saved_at::text;
end $$;
revoke all on function public.saves_restore(text, bigint) from public, anon, authenticated;
