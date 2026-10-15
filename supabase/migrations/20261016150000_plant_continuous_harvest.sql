-- Rastline, ki rodijo/se pobirajo dalj časa (ne enkratno): days_to_harvest_* pomeni prvo pobiranje,
-- pobiranje pa traja do konca sezone pobiranja (plants.harvest). Aplikacija jih ne označi kot
-- "prezrele", dokler je mesec v sezoni pobiranja.
--  Plodovke (paradižnik, paprika, jajčevec, kumare, bučke) rodijo do slane; nizki fižol več tednov;
--  blitva se pobira sproti od zunaj; brstični ohrovt od spodaj navzgor; por in zelena stojita na gredi
--  in se pobirata po potrebi; korenje ostane v tleh do jeseni.

alter table public.plants add column if not exists continuous_harvest boolean not null default false;

comment on column public.plants.continuous_harvest is
  'Pobiranje traja do konca sezone (plants.harvest); days_to_harvest_* = prvo pobiranje';

update public.plants set continuous_harvest = true
where name in ('Paradižnik', 'Paprika', 'Jajčevec', 'Kumare', 'Bučke', 'Nizki fižol',
               'Blitva', 'Brstični ohrovt', 'Por', 'Zelena', 'Korenje');
