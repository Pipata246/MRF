-- Public accounts: searchable by @username; library + bio on public page

alter table public.profiles
  add column if not exists bio text not null default '';

alter table public.profiles
  drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len check (char_length(bio) <= 160);

-- Anyone can read profiles for discovery (username / name / avatar / bio)
drop policy if exists profiles_select_public_authors on public.profiles;
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select using (true);

-- Public read of likes & followed artists
drop policy if exists liked_select_public on public.liked_tracks;
create policy liked_select_public on public.liked_tracks
  for select using (true);

drop policy if exists followed_select_public on public.followed_artists;
create policy followed_select_public on public.followed_artists
  for select using (true);

drop policy if exists albums_select_public on public.saved_albums;
create policy albums_select_public on public.saved_albums
  for select using (true);

create index if not exists profiles_username_trgm_like_idx
  on public.profiles (username text_pattern_ops);
