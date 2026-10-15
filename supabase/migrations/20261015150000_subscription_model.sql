-- Naročniški model Free / Pro (Stripe)
-- * paket "premium" se preimenuje v "pro"
-- * omejitve paketov so podatki v plan_limits (NULL = brez omejitve)
-- * omejitve uveljavlja baza (triggerji), UI jih samo prikazuje
-- * Stripe polja na profiles piše samo webhook (service role)

-- 1) premium → pro
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.plan_limits drop constraint if exists plan_limits_plan_check;

update public.profiles set plan = 'pro' where plan = 'premium';
update public.profiles set plan = 'free' where plan is null;
update public.plan_limits set plan = 'pro' where plan = 'premium';

alter table public.profiles
  alter column plan set default 'free',
  alter column plan set not null,
  add constraint profiles_plan_check check (plan in ('free', 'pro'));

alter table public.plan_limits
  add constraint plan_limits_plan_check check (plan in ('free', 'pro'));

-- 2) Stripe statusi (vsi, ki jih Stripe pozna) + dodatna polja naročnine
alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles
  add constraint profiles_subscription_status_check check (
    subscription_status is null or subscription_status in (
      'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )
  ),
  add column if not exists stripe_subscription_id text unique,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- 3) Omejitve paketov: NULL = brez omejitve; features za prihodnje funkcije po paketih
alter table public.plan_limits drop constraint if exists plan_limits_max_gardens_check;
alter table public.plan_limits
  alter column max_gardens drop not null,
  add constraint plan_limits_max_gardens_check check (max_gardens is null or max_gardens >= 1),
  add column if not exists max_per_plant integer
    constraint plan_limits_max_per_plant_check check (max_per_plant is null or max_per_plant >= 1),
  add column if not exists features jsonb not null default '{}'::jsonb;

update public.plan_limits set max_gardens = 1,    max_per_plant = 10   where plan = 'free';
update public.plan_limits set max_gardens = null, max_per_plant = null where plan = 'pro';
insert into public.plan_limits (plan, max_gardens, max_per_plant) values
  ('free', 1, 10),
  ('pro', null, null)
on conflict (plan) do nothing;

-- 4) Pomožna funkcija: omejitve za uporabnika (za triggerje; ni RPC)
create or replace function public.limits_for_user(p_user_id uuid)
returns public.plan_limits
language sql
stable
security definer
set search_path = ''
as $$
  select l.*
  from public.plan_limits l
  where l.plan = coalesce(
    (select p.plan from public.profiles p where p.id = p_user_id),
    'free'
  );
$$;
revoke execute on function public.limits_for_user(uuid) from public, anon, authenticated;

-- 5) Omejitev vrtov (NULL = brez omejitve)
create or replace function public.enforce_garden_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits public.plan_limits;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('gardens:' || new.user_id::text));
  v_limits := public.limits_for_user(new.user_id);
  if v_limits.max_gardens is null then
    return new;
  end if;

  select count(*) into v_count from public.gardens g where g.user_id = new.user_id;
  if v_count >= v_limits.max_gardens then
    raise exception 'garden_limit_reached'
      using errcode = 'P0001',
            detail = format('Plan %s allows %s gardens', v_limits.plan, v_limits.max_gardens);
  end if;
  return new;
end;
$$;

-- 6) Omejitev na vrsto rastline: inventar + posajeno (v vseh vrtovih)
--    Sajenje (bed_plants +1, inventar -1) in vračanje (bed_plants -1, inventar +1)
--    vsote ne spremenita; povečata jo le dodajanje iz kataloga.
create or replace function public.planted_count(p_user_id uuid, p_plant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(bp.quantity), 0)::integer
  from public.bed_plants bp
  where bp.user_id = p_user_id and bp.plant_id = p_plant_id;
$$;
revoke execute on function public.planted_count(uuid, uuid) from public, anon, authenticated;

create or replace function public.enforce_plant_limit_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits public.plan_limits;
  v_total integer;
begin
  -- Zmanjšanje količine je vedno dovoljeno
  if tg_op = 'UPDATE' and new.plant_id = old.plant_id and new.quantity <= old.quantity then
    return new;
  end if;

  v_limits := public.limits_for_user(new.user_id);
  if v_limits.max_per_plant is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('plant:' || new.user_id::text || ':' || new.plant_id::text));
  v_total := new.quantity + public.planted_count(new.user_id, new.plant_id);
  if v_total > v_limits.max_per_plant then
    raise exception 'plant_limit_reached'
      using errcode = 'P0001',
            detail = format('Plan %s allows %s per plant', v_limits.plan, v_limits.max_per_plant);
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_plant_limit_inventory() from public, anon, authenticated;

drop trigger if exists user_plants_enforce_limit on public.user_plants;
create trigger user_plants_enforce_limit
  before insert or update of quantity, plant_id on public.user_plants
  for each row execute function public.enforce_plant_limit_inventory();

-- Neposredno sajenje mimo inventarja ne sme preseči omejitve
create or replace function public.enforce_plant_limit_planted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits public.plan_limits;
begin
  if tg_op = 'UPDATE' and new.plant_id = old.plant_id then
    return new;
  end if;

  v_limits := public.limits_for_user(new.user_id);
  if v_limits.max_per_plant is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('plant:' || new.user_id::text || ':' || new.plant_id::text));
  if public.planted_count(new.user_id, new.plant_id) + new.quantity > v_limits.max_per_plant then
    raise exception 'plant_limit_reached'
      using errcode = 'P0001',
            detail = format('Plan %s allows %s per plant', v_limits.plan, v_limits.max_per_plant);
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_plant_limit_planted() from public, anon, authenticated;

drop trigger if exists bed_plants_enforce_limit on public.bed_plants;
create trigger bed_plants_enforce_limit
  before insert or update of plant_id on public.bed_plants
  for each row execute function public.enforce_plant_limit_planted();

-- 7) Sprememba paketa (webhook) se takoj pokaže v aplikaciji
alter publication supabase_realtime add table public.profiles;
