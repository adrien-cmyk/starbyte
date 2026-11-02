-- v33 (02/11/2026) — BLACKMARKET : escadre de Cuirassés de Héro (choix d'Adrien, 02/11 : option B)
--   · une flotte avance au rythme de son vaisseau le plus lent ;
--   · une escadre composée UNIQUEMENT de Cuirassés de Héro (aucun vaisseau construit, aucun dreadnought) va 20 % plus vite ;
--   · le serveur vérifie que ces Héros appartiennent à l'attaquant, sont payés et pas hors service, sinon rien ne change.
--   · (la petite cale du Héro, 5 000, est dans la fonction resolve-raids : redéployer engine.js)
-- À coller tel quel dans Supabase → SQL Editor → Run (après v32). Aucune fonction existante n'est réécrite :
-- un déclencheur raccourcit le trajet au moment où le raid est inscrit.

create or replace function public._bm_raid_speed() returns trigger
language plpgsql security definer set search_path = public as $$
declare prem jsonb; n int; ok int; ships int := 0; ty text; t text; travel interval;
begin
  prem := new.fleet -> 'premium';
  if prem is null or jsonb_typeof(prem) <> 'array' then return new; end if;
  n := jsonb_array_length(prem);
  if n = 0 or n > 13 then return new; end if;
  foreach ty in array array['tanker', 'fregate', 'cuirasse'] loop
    foreach t in array array['t1', 't2', 't3'] loop
      ships := ships + coalesce((new.fleet -> 'composition' -> ty ->> t)::int, 0);
    end loop;
  end loop;
  if ships > 0 then return new; end if;                                   -- flotte mixte : rythme normal
  select count(*) into ok from public.bm_purchases p
   where p.user_id = new.attacker_id and p.status = 'paid' and p.category = 'sport'
     and (p.disabled_until is null or p.disabled_until <= now())
     and p.id::text in (select x ->> 'pid' from jsonb_array_elements(prem) x);
  if ok <> n then return new; end if;                                     -- un dreadnought ou un vaisseau douteux : rythme normal
  travel := (new.arrives_at - now()) / 1.2;
  new.arrives_at := now() + travel;
  new.returns_at := now() + travel * 2;
  return new;
end $$;

drop trigger if exists bm_raid_speed on public.raids;
create trigger bm_raid_speed before insert on public.raids
  for each row execute function public._bm_raid_speed();
