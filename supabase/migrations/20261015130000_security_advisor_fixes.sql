-- Popravki opozoril Supabase advisorjev (varnost + hitrost RLS)

-- 1) Fiksen search_path za funkcije (lint 0011)
alter function public.handle_new_user() set search_path = '';
alter function public.handle_updated_at() set search_path = '';

-- 2) SECURITY DEFINER funkcije niso RPC endpointi (lint 0028/0029).
--    Triggerji in event triggerji delujejo naprej: EXECUTE se preverja le ob CREATE TRIGGER.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.handle_updated_at() from public, anon, authenticated;

-- 3) (select auth.uid()) namesto auth.uid() — izračuna se enkrat na poizvedbo, ne za vsako vrstico (lint 0003).
--    Hkrati: politike samo za prijavljene (anon itak nima uid) in WITH CHECK, kjer je manjkal.

alter policy "Users manage own garden plants" on public.bed_plants
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users manage own beds" on public.beds
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users see own sections" on public.garden_sections
  to authenticated
  using (garden_id in (select g.id from public.gardens g where g.user_id = (select auth.uid())))
  with check (garden_id in (select g.id from public.gardens g where g.user_id = (select auth.uid())));

alter policy "Users see own gardens" on public.gardens
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users can view own profile" on public.profiles
  to authenticated
  using (id = (select auth.uid()));

alter policy "Users can update own profile" on public.profiles
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "Users manage own plants" on public.user_plants
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users can read own settings" on public.user_settings
  to authenticated
  using (user_id = (select auth.uid()));

alter policy "Users can insert own settings" on public.user_settings
  to authenticated
  with check (user_id = (select auth.uid()));

alter policy "Users can update own settings" on public.user_settings
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4) Podvojena DELETE politika na beds — "Users manage own beds" (ALL) že pokrije brisanje (lint 0006)
drop policy if exists "Users can delete own beds" on public.beds;
