-- Katalog rastlin: realni podatki za slovensko (celinsko) podnebje.
-- OPOMBA: razmike (cells_spacing, around_cells_spacing) in merilo povrne 20261016120000_restore_plant_spacing.
-- Merilo: 1 celica mreže = 20 cm, 1 sub-celica = 10 cm (src/lib/units.ts).
-- cells_spacing = razdalja med rastlinami v sub-celicah (10 cm), around_cells_spacing = dodaten pas.
-- water_need / sun_need: 1 = nizka / polsenca, 2 = srednja / delno sonce, 3 = visoka / polno sonce.
-- Meseci: 1 = januar … 12 = december.
-- Prejšnje vrednosti razmikov (merilo 5 cm): Blitva 2, Brokoli 2, Brstični ohrovt 3, Bučke 4, Čebula 1,
-- Česen 1, Cvetača 3, Grah 1, Jajčevec 3, Koleraba 2, Kolerabica 2, Korenje 1, Krompir 2, Kumare 3,
-- Melone 4, Nizki fižol 1, Paprika 2, Paradižnik 2, Por 1, Rdeča pesa 1, Redkvica 1, Rukola 1,
-- Solata 1, Špinača 1, Zelena 2, Zelje 3.

alter table public.plants
  add column if not exists family text,
  add column if not exists sow_indoors smallint[] not null default '{}',
  add column if not exists sow_outdoors smallint[] not null default '{}',
  add column if not exists transplant smallint[] not null default '{}',
  add column if not exists harvest smallint[] not null default '{}';

alter table public.plants drop constraint if exists plants_months_check;
alter table public.plants add constraint plants_months_check check (
  sow_indoors <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]
  and sow_outdoors <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]
  and transplant <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]
  and harvest <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]
);

alter table public.plants drop constraint if exists plants_needs_check;
alter table public.plants add constraint plants_needs_check check (
  (water_need is null or water_need between 1 and 3)
  and (sun_need is null or sun_need between 1 and 3)
);

update public.plants p set
  family = v.family,
  cells_spacing = v.spacing,
  around_cells_spacing = v.around,
  water_need = v.water,
  sun_need = v.sun,
  days_to_harvest_min = v.dmin,
  days_to_harvest_max = v.dmax,
  watering_interval_days = v.wint,
  sow_indoors = v.indoors::smallint[],
  sow_outdoors = v.outdoors::smallint[],
  transplant = v.trans::smallint[],
  harvest = v.harv::smallint[],
  description = v.descr
from (values
  ('b05fcbf3-f3ee-43b7-bec1-4e99aada1939'::uuid, 'Metlikovke', 3, 0, 2, 2, 50, 60, 3, '{3,4}', '{4,5,6,7}', '{5}', '{6,7,8,9,10}',
   'Trpežna listnata zelenjava — liste trgaj sproti od zunaj, rastlina rodi vse do zmrzali.'),
  ('f50752f9-cbc7-40da-876d-53bb67ee8252'::uuid, 'Križnice', 5, 0, 2, 3, 60, 90, 3, '{2,3,4,6}', '{}', '{4,5,7}', '{6,7,9,10}',
   'Glavno cvetno glavico poreži, preden porumeni; nato zrastejo še stranski poganjki.'),
  ('4c53543a-5a0b-4dd0-9191-97ed6d83c8c4'::uuid, 'Križnice', 6, 0, 2, 3, 120, 160, 3, '{3,4}', '{}', '{5,6}', '{10,11,12}',
   'Dolga rast; brstiče obiraj od spodaj navzgor — po prvi slani so slajši.'),
  ('4e7c09ab-9899-4056-a268-371b0d240742'::uuid, 'Bučevke', 9, 1, 3, 3, 45, 60, 2, '{4}', '{5,6}', '{5}', '{6,7,8,9}',
   'Potrebuje veliko prostora in vode; plodove obiraj mlade (15–20 cm), da rastlina rodi naprej.'),
  ('12b19c64-d9a0-4490-b742-acfcabcaf8fb'::uuid, 'Lukovke', 1, 0, 1, 3, 90, 150, 5, '{2,3}', '{3,4}', '{3,4}', '{7,8}',
   'Sadi čebulček zgodaj spomladi; ko listi polegajo, čebulo izkoplji in posuši.'),
  ('0735ab14-4e78-4d81-bdb7-4fe6b074aa84'::uuid, 'Lukovke', 1, 0, 1, 3, 240, 270, 7, '{}', '{3,10,11}', '{}', '{6,7}',
   'Stroke sadi jeseni, konico obrni navzgor; pobiraš naslednje poletje, ko porumeni tretjina listov.'),
  ('72a75d14-64f1-40ed-967a-5e051269d93a'::uuid, 'Križnice', 5, 0, 3, 3, 70, 100, 3, '{2,3,4,5}', '{}', '{4,5,6}', '{6,7,9,10}',
   'Potrebuje enakomerno vlago; ko se glavica začne delati, jo zasenči z njenimi listi, da ostane bela.'),
  ('64f23cb7-2bf4-44cd-b7db-3c63e3f027a1'::uuid, 'Metuljnice', 1, 1, 2, 3, 60, 80, 3, '{}', '{3,4,5}', '{}', '{6,7}',
   'Sej zgodaj, prenese hlad; postavi oporo za vzpenjanje. Obogati tla z dušikom.'),
  ('9f03f135-c5a2-428a-9f60-090f09a53fa3'::uuid, 'Razhudnikovke', 5, 0, 2, 3, 100, 150, 2, '{2,3}', '{}', '{5}', '{7,8,9}',
   'Ljubi toploto — na prosto šele, ko so noči tople. Obiraj, ko je kožica sijoča.'),
  ('b9162d79-0d90-48ee-98bc-4e26853b491f'::uuid, 'Križnice', 3, 0, 2, 2, 50, 70, 3, '{3,4}', '{4,5,6,7}', '{4,5,6}', '{5,6,7,8,9,10}',
   'Gomolj poberi, ko je velik kot teniška žogica — večji postane olesenel.'),
  ('b1a5bdb7-3546-4aff-918f-10b09a4f104d'::uuid, 'Križnice', 3, 0, 2, 2, 60, 80, 3, '{3,4}', '{4,5,6,7}', '{4,5,6}', '{6,7,8,9,10}',
   'Vijolična koleraba — malo počasnejša in bolj odporna na vročino kot zelena.'),
  ('00d8adf9-da84-43ac-9f8b-818d96cd0036'::uuid, 'Kobulnice', 1, 0, 2, 3, 70, 110, 4, '{}', '{3,4,5,6}', '{}', '{6,7,8,9,10}',
   'Sej neposredno v rahla tla brez kamenja in svežega gnoja; vznik traja do 3 tedne.'),
  ('8d8c2f35-4478-4244-8196-57a669568ee0'::uuid, 'Razhudnikovke', 4, 0, 2, 3, 90, 130, 5, '{}', '{4,5}', '{}', '{7,8,9}',
   'Sadi gomolje, ko se tla ogrejejo; rastline osipaj z zemljo, da gomolji ne ozelenijo.'),
  ('ceed88af-0413-40c7-acb5-b0233145049f'::uuid, 'Bučevke', 4, 1, 3, 3, 55, 70, 2, '{4}', '{5,6}', '{5}', '{7,8,9}',
   'Gojenje ob opori prihrani prostor; zalivaj redno in z mlačno vodo, ne po listih.'),
  ('de2e2f69-c4aa-4c05-b562-b2df99a0ba69'::uuid, 'Bučevke', 8, 1, 2, 3, 80, 100, 3, '{4}', '{}', '{5,6}', '{8,9}',
   'Potrebuje najtoplejši kotiček vrta; zrela je, ko diši in se pecelj sam loči.'),
  ('e06e215d-6771-40df-9443-86a988177894'::uuid, 'Metuljnice', 2, 1, 2, 3, 55, 70, 3, '{}', '{5,6,7}', '{}', '{7,8,9}',
   'Sej šele v topla tla (po ledenih možeh); za stalno letino sej v več terminih.'),
  ('af501c2a-ab6a-4055-b77c-bfbe981c824a'::uuid, 'Razhudnikovke', 4, 0, 2, 3, 70, 120, 2, '{2,3}', '{}', '{5}', '{7,8,9,10}',
   'Vzgajaj sadike na toplem; na prosto, ko ni več nevarnosti slane.'),
  ('ee26262e-55fa-4059-b990-0373088b43c0'::uuid, 'Razhudnikovke', 6, 1, 3, 3, 60, 90, 2, '{3,4}', '{}', '{5}', '{7,8,9,10}',
   'Sadi globlje, kot je rasel v lončku; postavi oporo, odstranjuj zalistnike in zalivaj ob tleh.'),
  ('ead81a75-0f70-427f-8ed2-8901962ba291'::uuid, 'Lukovke', 2, 0, 2, 3, 120, 180, 4, '{2,3}', '{4}', '{5,6,7}', '{1,9,10,11,12}',
   'Sadike posadi globoko in jih osipaj, da dobiš dolg bel del; prezimni sorte ostanejo na gredi.'),
  ('ebb88b28-cdf4-4f74-b882-02404cc9eac9'::uuid, 'Metlikovke', 2, 0, 2, 3, 60, 90, 3, '{}', '{4,5,6,7}', '{}', '{7,8,9,10}',
   'Iz enega semena zraste več rastlinic — pretrgaj jih na 10 cm.'),
  ('b85e0cc4-4bfd-49d8-a964-f7f3e48a4f93'::uuid, 'Križnice', 1, 0, 2, 2, 25, 35, 2, '{}', '{3,4,5,8,9}', '{}', '{4,5,6,9,10}',
   'Najhitrejša zelenjava; sej na 2 tedna. V poletni vročini hitro postane pekoča in luknjičava.'),
  ('6b0ae20b-7ccc-4fd8-b187-54745eebd398'::uuid, 'Križnice', 1, 0, 2, 2, 30, 45, 2, '{}', '{3,4,5,8,9}', '{}', '{4,5,6,7,8,9,10}',
   'Hitro raste; v vročini hitro cveti, zato jo raje sej spomladi in jeseni.'),
  ('062f8ddd-f2dc-4d6f-ac54-6820acbba3c4'::uuid, 'Nebinovke', 3, 0, 2, 2, 45, 70, 2, '{2,3}', '{3,4,5,6,7,8}', '{4,5,6,7,8}', '{5,6,7,8,9,10}',
   'Sadi plitvo (srčika nad zemljo); za stalno letino sadi nove sadike vsaka 2–3 tedne.'),
  ('dcda4cd7-fd35-485f-a32a-232900f61207'::uuid, 'Metlikovke', 2, 0, 2, 2, 40, 50, 3, '{}', '{3,4,8,9}', '{}', '{4,5,10,11}',
   'Rastlina hladnega dela leta — poleti hitro gre v cvet. Jesenska setev lahko prezimi.'),
  ('757eed17-5253-46b9-a3ba-3bb4011b5b09'::uuid, 'Kobulnice', 4, 0, 3, 3, 120, 160, 3, '{2,3}', '{}', '{5}', '{9,10,11}',
   'Seme kali počasi in na svetlobi (ne prekrivaj z zemljo); potrebuje veliko vode in hranil.'),
  ('f0b4fd95-a729-4477-8955-a7ae409fd952'::uuid, 'Križnice', 5, 0, 2, 3, 70, 120, 3, '{2,3,4,5}', '{}', '{4,5,6,7}', '{6,7,8,9,10,11}',
   'Zgodnje sorte poberi poleti, pozne jeseni; glave poberi, ko so trde in čvrste.')
) as v(id, family, spacing, around, water, sun, dmin, dmax, wint, indoors, outdoors, trans, harv, descr)
where p.id = v.id;
