-- Povrnitev prejšnjih razmikov rastlin (pred 20261016110000_plant_catalog_data).
-- Realni razmiki so bili za gredice preveliki; ostali podatki kataloga ostanejo.
update public.plants p set
  cells_spacing = v.spacing,
  around_cells_spacing = v.around
from (values
  ('Blitva', 2, 1), ('Brokoli', 2, 1), ('Brstični ohrovt', 3, 1), ('Bučke', 4, 2),
  ('Cvetača', 3, 1), ('Grah', 1, 1), ('Jajčevec', 3, 1), ('Koleraba', 2, 1),
  ('Kolerabica', 2, 1), ('Korenje', 1, 0), ('Krompir', 2, 1), ('Kumare', 3, 2),
  ('Melone', 4, 2), ('Nizki fižol', 1, 1), ('Paprika', 2, 1), ('Paradižnik', 2, 1),
  ('Por', 1, 1), ('Rdeča pesa', 1, 1), ('Redkvica', 1, 1), ('Rukola', 1, 1),
  ('Solata', 1, 0), ('Zelena', 2, 1), ('Zelje', 3, 1), ('Čebula', 1, 1),
  ('Česen', 1, 1), ('Špinača', 1, 1)
) as v(name, spacing, around)
where p.name = v.name;
