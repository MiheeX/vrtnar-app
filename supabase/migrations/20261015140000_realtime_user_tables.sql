-- Realtime: spremembe na eni napravi se takoj pokažejo na drugih napravah istega uporabnika.
-- RLS velja tudi za Realtime — vsak dobi samo dogodke za svoje vrstice.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table
  public.gardens,
  public.beds,
  public.bed_plants,
  public.user_plants,
  public.user_settings;
