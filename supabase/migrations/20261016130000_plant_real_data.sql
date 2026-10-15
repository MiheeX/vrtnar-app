-- Realni podatki o rastlinah (prikaz v aplikaciji). Platno še naprej uporablja
-- poenostavljen odtis cells_spacing / around_cells_spacing — ta polja se ne spreminjajo.
--
-- Viri:
--  [P]  M. Pušenjak (KGZS), Zelenjavni vrt — "Dobri sosedje vrtnin in razdalja setve ali sajenja",
--       zelenisvet.com (razdalje med vrstami / v vrsti) — glavni vir za razdalje.
--  [C]  Cornell Cooperative Extension, S. Reiners: "Recommended Spacing & Expected Yield for
--       Garden Vegetables in New York" (2017) — razdalje, kjer jih [P] nima ali močno odstopa.
--  [CSU] Colorado State University Extension, Vegetable Planting Guide (GardenNotes 720) —
--       globina setve, dnevi do vznika, min. temperatura tal za kalitev, dnevi do pobiranja.
--  [KIS] Kmetijski inštitut Slovenije, sortni poskusi krompirja (sadilna razdalja 72 × 35 cm).
--  [OSU] Oregon State / UC Extension — rukola 8–15 cm v vrsti.
--  [SI] slovenski vrtnarski viri (čebulček 30 × 10 cm; zelena 50 × 20–40 cm, vrtnarka.si).
--
-- Odločitve:
--  - Bučke: [P] 50 × 40 cm (grmičaste) je bistveno manj od [C] 120 × 60 in [CSU] 90–120 → [C].
--  - Grah: [P] 30 × 20; v vrsti [C] 5 cm, [CSU] 10–15 → 30 × 5 (vrsta 30 po [P]).
--  - Čebula: [P] 30 × 20 velja za šalotko; čebulček [SI] 30 × 10.
--  - Redkvica, rukola, rdeča pesa, krompir, zelena: [P] jih nima → [C] / [OSU] / [KIS] / [SI].
--  - days_to_harvest_*: od sajenja na gredico (sadike) oz. setve na stalno mesto (neposredna setev),
--    tako kot planted_at v aplikaciji. Popravljene vrednosti, ki so prej šteli od setve sadik.
--  - germination_*: za setev semena; NULL, kjer se sadi gomolje / stroke (krompir, česen) ali ni vira.

alter table public.plants
  add column if not exists row_spacing_cm smallint,
  add column if not exists plant_spacing_cm smallint,
  add column if not exists sow_depth_cm numeric(3,1),
  add column if not exists germination_days_min smallint,
  add column if not exists germination_days_max smallint,
  add column if not exists germination_temp_min_c smallint;

comment on column public.plants.row_spacing_cm is 'Realna razdalja med vrstami (cm)';
comment on column public.plants.plant_spacing_cm is 'Realna razdalja med rastlinami v vrsti (cm)';
comment on column public.plants.sow_depth_cm is 'Globina setve/sajenja (cm); 0 = svetlobna kalivka (ne prekrivaj)';
comment on column public.plants.germination_temp_min_c is 'Najnižja temperatura tal za kalitev (°C)';
comment on column public.plants.days_to_harvest_min is 'Dnevi od sajenja na gredico (ali setve na stalno mesto) do pobiranja';

update public.plants p set
  row_spacing_cm = v.rows_cm,
  plant_spacing_cm = v.plant_cm,
  sow_depth_cm = v.depth,
  germination_days_min = v.gmin,
  germination_days_max = v.gmax,
  germination_temp_min_c = v.gtemp,
  days_to_harvest_min = coalesce(v.dmin, p.days_to_harvest_min),
  days_to_harvest_max = coalesce(v.dmax, p.days_to_harvest_max)
from (values
  -- ime,            vrste, v vrsti, globina, vznik min/max, °C, do pobiranja min/max (NULL = ostane)
  ('Blitva',           50, 30, 2.5,  7, 10,  4, null::int, null::int),
  ('Brokoli',          40, 40, 1.3,  3, 10,  4, 55, 80),
  ('Brstični ohrovt',  50, 50, 1.3,  3, 10,  4, 90, 120),
  ('Bučke',           120, 60, 3.0,  3, 12, 16, null, null),
  ('Cvetača',          40, 40, 1.3,  3, 10,  4, 60, 80),
  ('Čebula',           30, 10, 2.0,  7, 12,  2, 90, 120),
  ('Česen',            30, 15, 5.0, null, null, null, null, null),
  ('Grah',             30,  5, 2.5,  6, 15,  4, null, null),
  ('Jajčevec',         70, 40, 0.6,  7, 14, 16, 60, 80),
  ('Koleraba',         30, 30, 1.3,  3, 10,  4, 45, 60),
  ('Kolerabica',       30, 30, 1.3,  3, 10,  4, 55, 70),
  ('Korenje',          30,  3, 0.6, 10, 17,  4, null, null),
  ('Krompir',          70, 35, 10.0, null, null, 7, null, null),
  ('Kumare',          100, 50, 2.5,  6, 10, 16, null, null),
  ('Melone',          100, 50, 3.0,  3, 12, 16, 70, 90),
  ('Nizki fižol',      40, 10, 3.0,  6, 14, 13, null, null),
  ('Paprika',          50, 50, 0.6, 10, 20, 16, 60, 90),
  ('Paradižnik',       70, 50, 0.6,  6, 14, 10, 60, 80),
  ('Por',              40, 20, 0.6,  7, 12,  4, 90, 130),
  ('Rdeča pesa',       30, 10, 2.0,  7, 10,  4, null, null),
  ('Redkvica',         15,  3, 1.3,  3, 10,  4, null, null),
  ('Rukola',           25, 10, 0.5, null, null, null, null, null),
  ('Solata',           30, 30, 0.6,  4, 10,  2, null, null),
  ('Špinača',          25, 10, 1.3,  6, 14,  4, null, null),
  ('Zelena',           50, 40, 0.0, null, null, null, 100, 130),
  ('Zelje',            40, 40, 1.3,  3, 10,  4, 60, 110)
) as v(name, rows_cm, plant_cm, depth, gmin, gmax, gtemp, dmin, dmax)
where p.name = v.name;
