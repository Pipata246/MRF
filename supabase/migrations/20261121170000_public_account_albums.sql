-- Public account page shows saved albums instead of likes
drop policy if exists albums_select_public on public.saved_albums;
create policy albums_select_public on public.saved_albums
  for select using (true);
