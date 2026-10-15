# TODO

Ideje in naloge za kasneje.

## Planer (pred sajenjem)

Načrtovanje, ki ga uporabnik uporabi, še preden kaj posadi — za nakup sadik/semen in načrt, kdaj saditi in koliko kupiti.

- **Zgoraj: rastline iz zaloge**, ki jih je glede na trenutni mesec in setveni koledar priporočljivo posaditi najprej.
- **Spodaj: rastline iz kataloga**, ki jih je glede na mesec in priporočila za sajenje smiselno dodati v zalogo.
- Uporablja podatke iz `plants` (`sow_indoors`, `sow_outdoors`, `transplant`, `harvest`, `days_to_harvest_*`) in pomočnike v `src/lib/season.ts` (`nowAction`, `formatMonths`).
- Free / Pro: odloči ob implementaciji (npr. osnovni planer Free, več mesecev naprej / opomniki Pro).

## Obvestila in opravila

- **Obvestilo, ko je rastlina zrela za pobiranje** — iz `planted_at` + `days_to_harvest_min/max` in meseca pobiranja (`harvest`).
- **Seznam opravil za dan / mesec** v aplikaciji: kaj pobrati, kaj posaditi/posejati (setveni koledar), kaj iz planerja.
- **Obvestila za zalivanje glede na vreme**: ko je suho (brez dežja, vroče), opomni na zalivanje — `watering_interval_days`, `last_watered_at` in vremenska napoved za lokacijo vrta.
- Potrebno: lokacija vrta (za vreme), push obvestila (web push / PWA), nastavitve obvestil v `user_settings`.
- Free / Pro: odloči ob načrtovanju (npr. osnovni seznam opravil Free, vremenska in push obvestila Pro).

## Zaklep premikanja posajenih rastlin

Posajene rastline se v resnici ne prestavljajo — po določenem času naj se na platnu zaklenejo (preprečimo nenamerno premikanje).

- **Nastavitev »Zakleni premikanje rastlin«** (vklop/izklop) in pod njo **»po koliko dneh«** (npr. privzeto 30) — prikaže se samo, ko je nastavitev vklopljena.
- Shrani v `user_settings` (npr. `lock_plants_enabled boolean`, `lock_plants_after_days smallint`) — nastavitev računa, ne naprave.
- Zaklenjena rastlina: dolg pritisk je ne začne vleči, ampak pokaže obvestilo (»Rastlina je posajena že 45 dni — premikanje je zaklenjeno«) z možnostjo odklepa v nastavitvah; meni (info / odstrani) še vedno deluje.
- Starost iz `planted_at`; rastline brez datuma se ne zaklenejo.
- Premik celotne gredice: odloči, ali je dovoljen tudi z zaklenjenimi rastlinami.
- Free / Pro: verjetno Free (osnovna zaščita pred napakami).

## Prilagodljiv list rastline

- V Nastavitvah vklop/izklop, **kateri podatki se prikažejo v podrobnostih rastline** (npr. zalivanje, podatki sajenja, opombe, sosedje, o rastlini — sonce/voda/razmik/globina/vznik, setveni koledar, pobiranje, viri).
- Shrani v `user_settings` (npr. `plant_sheet_sections jsonb` s seznamom vidnih razdelkov) — velja za račun.
- Privzeto vse vklopljeno; morda tudi vrstni red razdelkov.
- Free / Pro: odloči ob načrtovanju.

---

# Pehta (kasneje — po Vrtnarju)

Razširitev Vrtnarja za **samonikle rastline za čaje, zdravje in naravna zdravila** (šipek, materina dušica, vrišček …), ki jih nabiramo v naravi — v gorah, gozdu, na travnikih.

- **Seznam rastlin** z opisi in prepoznavanjem.
- **Kje iskati** (rastišča: gore, gozd, travnik, gozdni rob …) in **kdaj** (najboljši meseci in čas dneva za nabiranje).
- **Kaj z njimi**: uporaba glede na zdravje in naravna zdravila (čaj, tinktura, mazilo, sušenje …).
- **Priporočila po želji uporabnika**: uporabnik izbere, kaj želi (npr. za prehlad, spanec, prebavo), aplikacija predlaga, kaj nabrati in kako uporabiti.
- Podatki naj bodo kakovostni in z viri (kot katalog vrtnin); opozorila o strupenih dvojnicah, zaščitenih vrstah in pravilih nabiranja.
- Free / Pro: odloči ob načrtovanju.
