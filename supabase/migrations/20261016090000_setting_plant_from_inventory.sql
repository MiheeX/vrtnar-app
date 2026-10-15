-- Nastavitev "Sadi iz zaloge": pri sajenju so na voljo samo rastline iz inventarja
-- (vsaka posajena porabi eno). Izklopljeno = na voljo je celoten katalog.
alter table public.user_settings
  add column if not exists plant_from_inventory boolean not null default false;
