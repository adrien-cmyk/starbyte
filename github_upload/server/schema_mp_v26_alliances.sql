-- v26 (21/10/2026) — ALLIANCES (décisions d'Adrien, 21/10 ; GDD claude/starbyte_GDD_alliances.md)
--   · fonder (il faut un pacte d'ambassade actif ; 1 000 CG payés par le jeu), nom + couleur, le fondateur est chef ;
--   · le chef invite un commandant chez qui un membre a une ambassade en orbite ; 7 membres au plus ;
--   · entre membres : ni raid ni abordage ; accord commercial automatique (convois protégés, commerce par tanker, canal) ;
--   · quitter : pas d'attaque contre un ancien allié pendant 24 h ; le chef seul exclut ; déclarer un membre « ennemi » = quitter ;
--   · le comptoir annonce fondation, entrées, départs, exclusions ; nom et couleur visibles de tous.
-- À coller tel quel dans Supabase → SQL Editor → Run (après v25 ; pas de fonction à redéployer).

create table if not exists public.alliances (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  color        text not null default '#5fffe8',
  leader_id    uuid not null references auth.users (id) on delete cascade,
  season       text not null default public.mp_season(),
  created_at   timestamptz not null default now(),
  dissolved_at timestamptz
);
create unique index if not exists alliances_name_open on public.alliances (lower(name)) where dissolved_at is null;

create table if not exists public.alliance_members (
  id          uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  left_reason text check (left_reason in ('left', 'kicked', 'enemy', 'dissolved'))
);
create unique index if not exists alliance_members_one on public.alliance_members (user_id) where left_at is null;
create index if not exists alliance_members_by_alliance on public.alliance_members (alliance_id) where left_at is null;

create table if not exists public.alliance_invites (
  id          uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  invited_by  uuid not null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists alliance_invites_open on public.alliance_invites (alliance_id, user_id) where status = 'pending';

create table if not exists public.alliance_messages (
  id          uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  user_id     uuid not null,
  pseudo      text not null,
  body        text not null check (length(body) between 1 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists alliance_messages_by on public.alliance_messages (alliance_id, created_at desc);

alter table public.alliances enable row level security;
alter table public.alliance_members enable row level security;
alter table public.alliance_invites enable row level security;
alter table public.alliance_messages enable row level security;
revoke insert, update, delete on public.alliances, public.alliance_members, public.alliance_invites, public.alliance_messages from anon, authenticated;
revoke select on public.alliances, public.alliance_members, public.alliance_invites, public.alliance_messages from anon, authenticated;

alter table public.rumors drop constraint if exists rumors_kind_check;
alter table public.rumors add constraint rumors_kind_check
  check (kind in ('raid_victory', 'raid_repelled', 'route_legendary', 'world_growth', 'rare_discovery', 'pact_signed',
                  'pact_broken', 'convoy_robbed', 'ambush_repelled', 'route_betrayal', 'route_sold',
                  'war_declared', 'peace_made', 'trade_signed',
                  'alliance_founded', 'alliance_joined', 'alliance_left', 'alliance_kicked'));

-- ── outils ──
create or replace function public._mp_alliance_of(u uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select alliance_id from public.alliance_members where user_id = u and left_at is null
$$;
create or replace function public._mp_same_alliance(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select x is not null and y is not null and x <> y and exists (
    select 1 from public.alliance_members m1 join public.alliance_members m2 on m2.alliance_id = m1.alliance_id
     where m1.user_id = x and m2.user_id = y and m1.left_at is null and m2.left_at is null)
$$;
-- ancien allié parti depuis moins de 24 h (dans un sens ou dans l'autre)
create or replace function public._mp_ally_cooldown(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.alliance_members m1 join public.alliance_members m2 on m2.alliance_id = m1.alliance_id
     where m1.user_id = x and m2.user_id = y and x <> y
       and (m1.left_at > now() - interval '24 hours' or m2.left_at > now() - interval '24 hours')
       and coalesce(m1.left_at, now()) > m2.joined_at and coalesce(m2.left_at, now()) > m1.joined_at)
$$;
revoke all on function public._mp_alliance_of(uuid), public._mp_same_alliance(uuid, uuid), public._mp_ally_cooldown(uuid, uuid) from public, anon, authenticated;

-- l'accord commercial vaut aussi entre membres d'une même alliance (convois, canal, commerce par tanker)
create or replace function public._mp_rel_active(x uuid, y uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mp_relations
                  where a_id = least(x, y) and b_id = greatest(x, y) and kind = k and ended_at is null
                    and (until is null or until > now()))
      or (k = 'trade' and public._mp_same_alliance(x, y))
$$;

create or replace function public._mp_alliance_rumor(k text, actor text, target text, u uuid, al text) returns void
language sql security definer set search_path = public as $$
  insert into public.rumors (kind, actor, target, sector, payload)
  select k, actor, target, split_part(coalesce(w.address, ''), '-', 2), jsonb_build_object('alliance', al)
    from public.worlds w where w.user_id = u
$$;

-- départ d'un membre (quitter, exclusion, déclaration d'hostilité) ; le chef qui part passe la main au plus ancien
create or replace function public._mp_alliance_drop(u uuid, why text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.alliance_members; al public.alliances; nxt uuid; ps text;
begin
  select * into m from public.alliance_members where user_id = u and left_at is null for update;
  if not found then return; end if;
  select * into al from public.alliances where id = m.alliance_id for update;
  update public.alliance_members set left_at = now(), left_reason = why where id = m.id;
  select pseudo into ps from public.worlds where user_id = u;
  if al.leader_id = u then
    select user_id into nxt from public.alliance_members where alliance_id = al.id and left_at is null order by joined_at limit 1;
    if nxt is null then
      update public.alliances set dissolved_at = now() where id = al.id;
      update public.alliance_invites set status = 'cancelled', answered_at = now() where alliance_id = al.id and status = 'pending';
    else
      update public.alliances set leader_id = nxt where id = al.id;
    end if;
  end if;
  perform public._mp_alliance_rumor(case when why = 'kicked' then 'alliance_kicked' else 'alliance_left' end, ps, al.name, u, al.name);
end $$;
revoke all on function public._mp_alliance_drop(uuid, text) from public, anon, authenticated;

-- ── actions ──
create or replace function public.mp_alliance_found(p_name text, p_color text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.worlds; n text := trim(coalesce(p_name, '')); c text := lower(coalesce(p_color, '')); aid uuid;
begin
  select * into me from public.worlds where user_id = auth.uid();
  if not found then raise exception 'no_world'; end if;
  perform pg_advisory_xact_lock(hashtext('alliance:' || me.user_id));
  if public._mp_alliance_of(me.user_id) is not null then raise exception 'already_in_alliance'; end if;
  if n !~ '^[A-Za-zÀ-ÿ0-9 _.''-]{3,24}$' then raise exception 'alliance_name_invalid'; end if;
  if c !~ '^#[0-9a-f]{6}$' then c := '#5fffe8'; end if;
  if not exists (select 1 from public.pacts where status = 'active' and anchor_presence is not null and me.user_id in (proposer_id, partner_id)) then
    raise exception 'alliance_needs_pact';
  end if;
  if exists (select 1 from public.alliances where lower(name) = lower(n) and dissolved_at is null) then raise exception 'alliance_name_taken'; end if;
  insert into public.alliances (name, color, leader_id, season) values (n, c, me.user_id, me.season) returning id into aid;
  insert into public.alliance_members (alliance_id, user_id) values (aid, me.user_id);
  perform public._mp_alliance_rumor('alliance_founded', me.pseudo, n, me.user_id, n);
  return aid;
end $$;

create or replace function public.mp_alliance_invite(p_address text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); al public.alliances; tgt uuid; iid uuid;
begin
  select a.* into al from public.alliances a where a.id = public._mp_alliance_of(me) and a.dissolved_at is null;
  if not found then raise exception 'no_alliance'; end if;
  if al.leader_id <> me then raise exception 'not_leader'; end if;
  tgt := public._mp_owner_of(p_address);
  if tgt is null then raise exception 'target_unknown'; end if;
  if tgt = me then raise exception 'target_self'; end if;
  if public._mp_alliance_of(tgt) = al.id then raise exception 'already_member'; end if;
  if public._mp_alliance_of(tgt) is not null then raise exception 'target_in_alliance'; end if;
  if (select count(*) from public.alliance_members where alliance_id = al.id and left_at is null) >= 7 then raise exception 'alliance_full'; end if;
  if not exists (select 1 from public.orbit_presence o join public.alliance_members m on m.user_id = o.user_id and m.alliance_id = al.id and m.left_at is null
                  where o.target_id = tgt and o.left_at is null) then
    raise exception 'invite_needs_embassy';
  end if;
  if exists (select 1 from public.mp_relations r join public.alliance_members m on m.alliance_id = al.id and m.left_at is null
              where r.kind = 'enemy' and r.ended_at is null and r.a_id = least(m.user_id, tgt) and r.b_id = greatest(m.user_id, tgt)) then
    raise exception 'enemies';
  end if;
  select id into iid from public.alliance_invites where alliance_id = al.id and user_id = tgt and status = 'pending';
  if iid is not null then return iid; end if;
  insert into public.alliance_invites (alliance_id, user_id, invited_by) values (al.id, tgt, me) returning id into iid;
  return iid;
end $$;

create or replace function public.mp_alliance_answer(p_invite uuid, p_accept boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.alliance_invites; al public.alliances; ps text;
begin
  perform pg_advisory_xact_lock(hashtext('alliance:' || me));
  select * into i from public.alliance_invites where id = p_invite and user_id = me for update;
  if not found then raise exception 'invite_unknown'; end if;
  if i.status <> 'pending' then return i.status; end if;
  select * into al from public.alliances where id = i.alliance_id for update;
  if al.dissolved_at is not null or i.created_at < now() - interval '72 hours' then
    update public.alliance_invites set status = 'expired', answered_at = now() where id = i.id;
    return 'expired';
  end if;
  if not p_accept then
    update public.alliance_invites set status = 'declined', answered_at = now() where id = i.id;
    return 'declined';
  end if;
  if public._mp_alliance_of(me) is not null then raise exception 'already_in_alliance'; end if;
  if (select count(*) from public.alliance_members where alliance_id = al.id and left_at is null) >= 7 then raise exception 'alliance_full'; end if;
  if exists (select 1 from public.raids r join public.alliance_members m on m.alliance_id = al.id and m.left_at is null
              where r.status in ('enroute', 'resolving') and ((r.attacker_id = me and r.defender_id = m.user_id) or (r.attacker_id = m.user_id and r.defender_id = me))) then
    raise exception 'raid_en_route';
  end if;
  insert into public.alliance_members (alliance_id, user_id) values (al.id, me);
  update public.alliance_invites set status = 'accepted', answered_at = now() where id = i.id;
  update public.alliance_invites set status = 'cancelled', answered_at = now() where user_id = me and status = 'pending' and id <> i.id;
  select pseudo into ps from public.worlds where user_id = me;
  perform public._mp_alliance_rumor('alliance_joined', ps, al.name, me, al.name);
  return 'accepted';
end $$;

create or replace function public.mp_alliance_leave()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public._mp_alliance_of(auth.uid()) is null then raise exception 'no_alliance'; end if;
  perform public._mp_alliance_drop(auth.uid(), 'left');
end $$;

create or replace function public.mp_alliance_kick(p_address text)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); al public.alliances; tgt uuid;
begin
  select a.* into al from public.alliances a where a.id = public._mp_alliance_of(me) and a.dissolved_at is null;
  if not found then raise exception 'no_alliance'; end if;
  if al.leader_id <> me then raise exception 'not_leader'; end if;
  tgt := public._mp_owner_of(p_address);
  if tgt is null or tgt = me or public._mp_alliance_of(tgt) is distinct from al.id then raise exception 'not_member'; end if;
  perform public._mp_alliance_drop(tgt, 'kicked');
end $$;

create or replace function public.mp_alliance_cancel_invite(p_invite uuid)
returns void
language sql security definer set search_path = public as $$
  update public.alliance_invites i set status = 'cancelled', answered_at = now()
   where i.id = p_invite and i.status = 'pending'
     and exists (select 1 from public.alliances a where a.id = i.alliance_id and a.leader_id = auth.uid());
$$;

create or replace function public.mp_alliance_chat_send(p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare me public.worlds; aid uuid; b text := left(regexp_replace(coalesce(p_body, ''), '[\x00-\x1f\x7f]', ' ', 'g'), 280);
begin
  select * into me from public.worlds where user_id = auth.uid();
  aid := public._mp_alliance_of(auth.uid());
  if aid is null then raise exception 'no_alliance'; end if;
  if length(trim(b)) = 0 then raise exception 'chat_empty'; end if;
  if (select count(*) from public.alliance_messages where user_id = me.user_id and created_at > now() - interval '1 minute') >= 6 then raise exception 'chat_rate'; end if;
  insert into public.alliance_messages (alliance_id, user_id, pseudo, body) values (aid, me.user_id, me.pseudo, trim(b));
end $$;

-- état de mon alliance : alliance, membres (adresses capitale + colonies), invitations (les miennes reçues, celles envoyées si chef), messages
create or replace function public.mp_alliance_state()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); aid uuid := public._mp_alliance_of(me); al public.alliances; out jsonb;
begin
  out := jsonb_build_object('invites', coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'alliance', a.name, 'color', a.color, 'by', w.pseudo, 'by_address', w.address, 'created_at', i.created_at,
                                        'members', (select count(*) from public.alliance_members m where m.alliance_id = a.id and m.left_at is null)) order by i.created_at)
      from public.alliance_invites i join public.alliances a on a.id = i.alliance_id left join public.worlds w on w.user_id = i.invited_by
     where i.user_id = me and i.status = 'pending' and a.dissolved_at is null and i.created_at > now() - interval '72 hours'), '[]'::jsonb));
  if aid is null then return out || jsonb_build_object('alliance', null); end if;
  select * into al from public.alliances where id = aid;
  return out || jsonb_build_object(
    'alliance', jsonb_build_object('id', al.id, 'name', al.name, 'color', al.color, 'leader', al.leader_id = me, 'created_at', al.created_at),
    'members', coalesce((select jsonb_agg(jsonb_build_object('pseudo', w.pseudo, 'address', w.address, 'me', m.user_id = me, 'leader', m.user_id = al.leader_id,
                                   'joined_at', m.joined_at,
                                   'addresses', array[w.address] || coalesce((select array_agg(c.address) from public.colonies c where c.user_id = w.user_id), '{}'::text[]))
                                   order by m.joined_at)
                           from public.alliance_members m join public.worlds w on w.user_id = m.user_id
                          where m.alliance_id = aid and m.left_at is null), '[]'::jsonb),
    'sent', case when al.leader_id = me then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'pseudo', w.pseudo, 'address', w.address, 'created_at', i.created_at))
                           from public.alliance_invites i join public.worlds w on w.user_id = i.user_id
                          where i.alliance_id = aid and i.status = 'pending' and i.created_at > now() - interval '72 hours'), '[]'::jsonb) else '[]'::jsonb end,
    'messages', coalesce((select jsonb_agg(x order by x.created_at) from (
                           select id, pseudo, body, created_at, user_id = me as mine from public.alliance_messages
                            where alliance_id = aid order by created_at desc limit 60) x), '[]'::jsonb));
end $$;

-- nom et couleur de toutes les alliances de la saison, par adresse (fiches, carte, carnet)
create or replace function public.mp_alliance_tags()
returns table (address text, alliance text, color text)
language sql stable security definer set search_path = public as $$
  select x.address, a.name, a.color
    from public.alliances a
    join public.alliance_members m on m.alliance_id = a.id and m.left_at is null
    join lateral (select w.address from public.worlds w where w.user_id = m.user_id
                  union all select c.address from public.colonies c where c.user_id = m.user_id) x on true
   where a.dissolved_at is null and a.season = public.mp_season()
$$;

revoke all on function public.mp_alliance_found(text, text), public.mp_alliance_invite(text), public.mp_alliance_answer(uuid, boolean),
  public.mp_alliance_leave(), public.mp_alliance_kick(text), public.mp_alliance_cancel_invite(uuid), public.mp_alliance_chat_send(text),
  public.mp_alliance_state(), public.mp_alliance_tags() from public, anon;
grant execute on function public.mp_alliance_found(text, text), public.mp_alliance_invite(text), public.mp_alliance_answer(uuid, boolean),
  public.mp_alliance_leave(), public.mp_alliance_kick(text), public.mp_alliance_cancel_invite(uuid), public.mp_alliance_chat_send(text),
  public.mp_alliance_state(), public.mp_alliance_tags() to authenticated;

-- ── effets ──
-- pas de raid entre alliés ; pas contre un ancien allié pendant 24 h
create or replace function public._mp_raids_no_ally() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public._mp_same_alliance(new.attacker_id, new.defender_id) then raise exception 'ally'; end if;
  if public._mp_ally_cooldown(new.attacker_id, new.defender_id) then raise exception 'ally_cooldown'; end if;
  return new;
end $$;
drop trigger if exists raids_no_ally on public.raids;
create trigger raids_no_ally before insert on public.raids for each row execute function public._mp_raids_no_ally();

-- pas d'abordage entre alliés (abordage manuel ; l'automatique est filtré plus bas)
create or replace function public._mp_intercepts_no_ally() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public._mp_same_alliance(new.pirate_id, new.victim_id) then raise exception 'ally'; end if;
  return new;
end $$;
drop trigger if exists intercepts_no_ally on public.intercepts;
create trigger intercepts_no_ally before insert on public.intercepts for each row execute function public._mp_intercepts_no_ally();

-- déclarer un membre de son alliance « ennemi » : c'est le déclarant qui quitte l'alliance
create or replace function public._mp_flags_alliance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.flag_key = 'ennemi' and public._mp_same_alliance(new.from_id, new.to_id) then
    perform public._mp_alliance_drop(new.from_id, 'enemy');
  end if;
  return new;
end $$;
drop trigger if exists flags_alliance on public.flags;
create trigger flags_alliance after insert on public.flags for each row execute function public._mp_flags_alliance();

-- embuscades automatiques : les convois des alliés passent
CREATE OR REPLACE FUNCTION public.mp_auto_ambush()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.ambushes; c public.convoys; me public.worlds; vw public.worlds; n int := 0; v_mode text;
        last timestamptz; cap bigint; held bigint; csum bigint; t text;
begin
  if auth.uid() is null then return 0; end if;
  if not pg_try_advisory_xact_lock(hashtext('mp_auto_ambush')) then return 0; end if;
  select (value #>> '{}')::timestamptz into last from public.mp_settings where key = 'auto_ambush_at';
  if last is not null and last > now() - interval '15 seconds' then return 0; end if;
  insert into public.mp_settings (key, value) values ('auto_ambush_at', to_jsonb(now()))
    on conflict (key) do update set value = excluded.value, updated_at = now();

  for a in select * from public.ambushes
            where left_at is null and orders ->> 'mode' in ('rob_heavy', 'rob_all', 'spy')
              and coalesce((orders ->> 'players')::boolean, false)
            order by posted_at limit 200 loop
    begin
    v_mode := a.orders ->> 'mode';
    if v_mode <> 'spy' and exists (select 1 from public.intercepts where ambush_id = a.id and status in ('pending', 'resolving')) then continue; end if;
    select * into me from public.worlds where user_id = a.user_id;
    if not found then continue; end if;
    -- plus de vaisseau armé : elle ne peut plus aborder (elle file encore)
    if v_mode <> 'spy' and coalesce((select sum(coalesce((a.fleet -> 'composition' -> u_ty ->> u_t)::bigint, 0))
                                       from unnest(array['fregate', 'cuirasse']) u_ty, unnest(array['t1', 't2', 't3']) u_t), 0) = 0 then continue; end if;
    -- cale pleine : la flotte regarde passer (on ne se bat pas pour rien)
    if v_mode <> 'spy' then
      cap := 0;
      foreach t in array array['t1', 't2', 't3'] loop
        cap := cap + coalesce((a.fleet -> 'composition' -> 'tanker' ->> t)::bigint, 0) * public._mp_cargo_cap(substring(t from 2)::int);
      end loop;
      held := coalesce((a.hold ->> 'metal')::bigint, 0) + coalesce((a.hold ->> 'energie')::bigint, 0) + coalesce((a.hold ->> 'cristal')::bigint, 0);
      if cap - held <= 0 then continue; end if;
    end if;
    for c in select cv.* from public.convoys cv
              where cv.status = 'enroute' and cv.user_id <> a.user_id and now() < cv.arrives_at and not cv.cancelled
                and (cv.from_system = a.system or cv.to_system = a.system or (cv.via is not null and a.system = any(cv.via)))
                and public._mp_convoy_visible(cv, a.user_id, a.system)
              order by cv.departed_at loop
      select * into vw from public.worlds where user_id = c.user_id;
      if found then
        if vw.season <> me.season then continue; end if;
        if public.mp_guards_on() and vw.created_at > now() - interval '72 hours' then continue; end if;
        if public.mp_guards_on() and vw.level * 2 < me.level then continue; end if;
      end if;
      if public._mp_same_alliance(a.user_id, c.user_id) then continue; end if;   -- v26 : pas d'abordage entre alliés
      if exists (select 1 from public.pacts where status = 'active'
                  and least(proposer_id, partner_id) = least(a.user_id, c.user_id)
                  and greatest(proposer_id, partner_id) = greatest(a.user_id, c.user_id)) then continue; end if;
      if v_mode = 'spy' then
        if not exists (select 1 from public.spied where pirate_id = a.user_id and convoy_id = c.id) then
          insert into public.spied (pirate_id, victim_id, convoy_id, from_system, to_system, auto, seen)
            values (a.user_id, c.user_id, c.id, c.from_system, c.to_system, true, false)
            on conflict (pirate_id, convoy_id) do nothing;
          n := n + 1;
        end if;
        continue;
      end if;
      if exists (select 1 from public.intercepts where convoy_id = c.id) then continue; end if;
      csum := coalesce((c.cargo ->> 'metal')::bigint, 0) + coalesce((c.cargo ->> 'energie')::bigint, 0) + coalesce((c.cargo ->> 'cristal')::bigint, 0);
      if csum = 0 then continue; end if;                                                  -- cale vide : rien à prendre
      if v_mode = 'rob_heavy' and csum <= public._mp_cargo_cap(c.tanker_tier) / 2 then continue; end if;
      perform public._mp_pair_lock(a.user_id, c.user_id);
      update public.convoys set status = 'engaged' where id = c.id and status = 'enroute';
      if not found then continue; end if;
      insert into public.intercepts (ambush_id, convoy_id, pirate_id, victim_id) values (a.id, c.id, a.user_id, c.user_id);
      n := n + 1;
      exit;                                                                               -- un abordage à la fois par flotte
    end loop;
    exception when others then
      raise warning 'mp_auto_ambush : embuscade % ignorée (%)', a.id, sqlerrm;
    end;
  end loop;
  return n;
end $function$;

-- Fin v26. Vérification : select count(*) from pg_proc where proname like 'mp_alliance_%';  → 9
