-- Lastne ikone rastlin (src/components/PlantIcon.tsx) za rastline brez ustreznega emojija.
-- icon = NULL → prikaže se Twemoji slika emojija iz plants.img.
alter table public.plants add column if not exists icon text;

update public.plants p set icon = v.icon
from (values
  ('Grah', 'pea'),
  ('Nizki fižol', 'bean'),
  ('Paprika', 'pepper'),
  ('Rdeča pesa', 'beet'),
  ('Redkvica', 'radish'),
  ('Por', 'leek'),
  ('Zelena', 'celery'),
  ('Koleraba', 'kohlrabi'),
  ('Kolerabica', 'kohlrabi-purple'),
  ('Blitva', 'chard'),
  ('Špinača', 'spinach'),
  ('Rukola', 'arugula'),
  ('Solata', 'lettuce'),
  ('Zelje', 'cabbage'),
  ('Cvetača', 'cauliflower'),
  ('Brstični ohrovt', 'brussels'),
  ('Bučke', 'zucchini')
) as v(name, icon)
where p.name = v.name;

-- Napačni rezervni emojiji (če ikona ni na voljo): pesa ni ingver, por ni česen
update public.plants set img = '🌱' where name in ('Rdeča pesa', 'Por', 'Redkvica') ;
