-- Več vrtov na uporabnika + omejitve po paketih (free/premium)

-- 1) Omejitve paketov kot podatki (ne konstante v kodi)
create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free', 'premium')),
  max_gardens integer not null check (max_gardens >= 1),
  created_at timestamptz not null default now()
);

insert into public.plan_limits (plan, max_gardens) values
  ('free', 3),
  ('premium', 20)
on conflict (plan) do nothing;

alter table public.plan_limits enable row level security;

drop policy if exists "Signed-in users can read plan limits" on public.plan_limits;
create policy "Signed-in users can read plan limits"
  on public.plan_limits for select
  to authenticated
  using (true);

-- 2) Omejitev števila vrtov, preverjena v bazi (ne le v UI)
create or replace function public.enforce_garden_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
begin
  -- Zaporedni inserti istega uporabnika (npr. dvojni klik) čakajo drug na drugega
  perform pg_advisory_xact_lock(hashtext('gardens:' || new.user_id::text));

  select coalesce(p.plan, 'free') into v_plan
  from public.profiles p
  where p.id = new.user_id;
  v_plan := coalesce(v_plan, 'free');

  select l.max_gardens into v_max
  from public.plan_limits l
  where l.plan = v_plan;

  select count(*) into v_count
  from public.gardens g
  where g.user_id = new.user_id;

  if v_max is not null and v_count >= v_max then
    raise exception 'garden_limit_reached'
      using errcode = 'P0001',
            detail = format('Plan %s allows %s gardens', v_plan, v_max);
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_garden_limit() from public, anon, authenticated;

drop trigger if exists gardens_enforce_limit on public.gardens;
create trigger gardens_enforce_limit
  before insert on public.gardens
  for each row execute function public.enforce_garden_limit();

-- 3) Uporabnik ne sme sam spreminjati paketa / naročnine
revoke update on public.profiles from anon, authenticated;
grant update (username, full_name, avatar_url) on public.profiles to authenticated;

-- 4) Brisanje vrta/gredice izbriše tudi gredice/rastline v njem
alter table public.beds
  drop constraint if exists beds_garden_id_fkey,
  add constraint beds_garden_id_fkey
    foreign key (garden_id) references public.gardens(id) on delete cascade;

alter table public.bed_plants
  drop constraint if exists garden_plants_garden_id_fkey,
  add constraint bed_plants_garden_id_fkey
    foreign key (garden_id) references public.gardens(id) on delete cascade;

alter table public.bed_plants
  drop constraint if exists garden_plants_bed_id_fkey,
  add constraint bed_plants_bed_id_fkey
    foreign key (bed_id) references public.beds(id) on delete cascade;

-- 5) Indeksi za poizvedbe po vrtu/uporabniku
create index if not exists gardens_user_id_idx on public.gardens (user_id);
create index if not exists beds_garden_id_idx on public.beds (garden_id);
create index if not exists bed_plants_garden_id_idx on public.bed_plants (garden_id);
create index if not exists bed_plants_bed_id_idx on public.bed_plants (bed_id);
