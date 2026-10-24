-- v30 (24/10/2026) — PARRAINAGE (décision d'Adrien, 24/10 : « 5 ouvertures du lien par 5 appareils différents, un peu trichable ça me va »)
--   · chaque commandant a un lien personnel : https://play.starbyte.online/?ref=CODE ;
--   · une ouverture compte quand un appareil qui n'est pas le sien ouvre le lien (une fois par appareil) ;
--   · 5 appareils différents → 2 500 métal, une seule fois (le jeu les verse ; le registre garde la trace).
-- À coller tel quel dans Supabase → SQL Editor → Run (après v29 ; pas de fonction à redéployer).

create table if not exists public.mp_ref_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create table if not exists public.mp_ref_opens (
  code      text not null references public.mp_ref_codes (code) on delete cascade,
  device    text not null,
  opened_at timestamptz not null default now(),
  primary key (code, device)
);
-- les appareils du commandant lui-même (ils ne comptent pas)
create table if not exists public.mp_ref_owner_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device  text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, device)
);
alter table public.mp_ref_codes enable row level security;
alter table public.mp_ref_opens enable row level security;
alter table public.mp_ref_owner_devices enable row level security;
revoke all on public.mp_ref_codes, public.mp_ref_opens, public.mp_ref_owner_devices from anon, authenticated;

create or replace function public._mp_ref_count(u uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.mp_ref_opens o join public.mp_ref_codes c on c.code = o.code
   where c.user_id = u and o.device not in (select device from public.mp_ref_owner_devices where user_id = u)
$$;
revoke all on function public._mp_ref_count(uuid) from public, anon, authenticated;

-- mon lien et où j'en suis (le jeu inscrit aussi l'appareil du joueur, pour ne pas le compter)
create or replace function public.mp_ref_state(p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.mp_ref_codes; k text; n int := 0;
begin
  if me is null then raise exception 'no_session'; end if;
  select * into c from public.mp_ref_codes where user_id = me;
  if not found then
    loop
      k := '';
      for i in 1..6 loop k := k || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1); end loop;
      exit when not exists (select 1 from public.mp_ref_codes where code = k);
      n := n + 1; if n > 20 then raise exception 'ref_code'; end if;
    end loop;
    insert into public.mp_ref_codes (user_id, code) values (me, k) on conflict (user_id) do nothing;
    select * into c from public.mp_ref_codes where user_id = me;
  end if;
  if p_device ~ '^[A-Za-z0-9_-]{8,64}$' then
    insert into public.mp_ref_owner_devices (user_id, device) values (me, p_device)
      on conflict (user_id, device) do update set seen_at = now();
  end if;
  return jsonb_build_object('code', c.code, 'count', least(public._mp_ref_count(me), 99), 'goal', 5, 'reward', 2500,
                            'claimed', c.claimed_at is not null);
end $$;
revoke all on function public.mp_ref_state(text) from public, anon;
grant execute on function public.mp_ref_state(text) to authenticated;

-- quelqu'un ouvre un lien (visiteur sans compte compris)
create or replace function public.mp_ref_open(p_code text, p_device text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if p_code !~ '^[A-Z0-9]{6}$' or p_device !~ '^[A-Za-z0-9_-]{8,64}$' then return false; end if;
  select user_id into owner from public.mp_ref_codes where code = p_code;
  if owner is null or owner = auth.uid() then return false; end if;
  if exists (select 1 from public.mp_ref_owner_devices where user_id = owner and device = p_device) then return false; end if;
  if (select count(*) from public.mp_ref_opens where code = p_code) >= 200 then return false; end if;
  insert into public.mp_ref_opens (code, device) values (p_code, p_device) on conflict do nothing;
  return found;
end $$;
revoke all on function public.mp_ref_open(text, text) from public;
grant execute on function public.mp_ref_open(text, text) to anon, authenticated;

-- la récompense : une seule fois ; rejouable (réponse perdue) : « ok » tant qu'elle est acquise
create or replace function public.mp_ref_claim()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.mp_ref_codes; n int;
begin
  select * into c from public.mp_ref_codes where user_id = me for update;
  if not found then return jsonb_build_object('ok', false, 'count', 0); end if;
  if c.claimed_at is not null then return jsonb_build_object('ok', true, 'metal', 2500, 'again', true); end if;
  n := public._mp_ref_count(me);
  if n < 5 then return jsonb_build_object('ok', false, 'count', n); end if;
  update public.mp_ref_codes set claimed_at = now() where user_id = me;
  return jsonb_build_object('ok', true, 'metal', 2500);
end $$;
revoke all on function public.mp_ref_claim() from public, anon;
grant execute on function public.mp_ref_claim() to authenticated;

-- Fin v30. Vérification : select count(*) from pg_proc where proname in ('mp_ref_state', 'mp_ref_open', 'mp_ref_claim');  → 3
