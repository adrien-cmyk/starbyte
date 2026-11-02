-- v37 (02/11/2026) — TRICHE DE TEST : retirer une de ses colonies et rendre son TAXI, réservé au compte de développement.
-- À coller tel quel dans Supabase → SQL Editor → Run. Peut être relancé sans risque.
create or replace function public.dev_colony_remove(p_address text, p_taxi boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mail text; n int; t int := 0;
begin
  select email into mail from auth.users where id = me;
  if mail is null or encode(sha256(convert_to(lower(mail), 'UTF8')), 'hex') <> 'c8bdf9434f4c2dda2d7376b468cbe2b9503d3228abeb7ff91a806c4cb7584aa4' then
    raise exception 'dev_only';
  end if;
  delete from public.colonies where address = p_address and user_id = me;
  get diagnostics n = row_count;
  if p_taxi then
    update public.bm_purchases set taxi_used_at = null, taxi_address = null
     where user_id = me and category = 'arche' and status = 'paid' and taxi_address = p_address;
    get diagnostics t = row_count;
  end if;
  return jsonb_build_object('colonies', n, 'taxi', t);
end $$;
revoke all on function public.dev_colony_remove(text, boolean) from public, anon;
grant execute on function public.dev_colony_remove(text, boolean) to authenticated;
