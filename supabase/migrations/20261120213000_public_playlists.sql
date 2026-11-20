-- Public playlists + library saves (live sync by reference)

-- New playlists are public by default (searchable)
alter table public.playlists
  alter column is_public set default true;

-- Existing manually created playlists become searchable
update public.playlists
set is_public = true
where id like 'pl\_%' escape '\' and is_public is distinct from true;

create index if not exists playlists_public_name_idx
  on public.playlists (is_public, updated_at desc)
  where is_public = true;

create index if not exists playlists_public_name_trgm_idx
  on public.playlists (lower(name));

-- Users who "added" someone else's public playlist (not a copy)
create table if not exists public.saved_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  playlist_id text not null references public.playlists (id) on delete cascade,
  saved_at timestamptz not null default now(),
  constraint saved_playlists_user_playlist unique (user_id, playlist_id)
);

create index if not exists saved_playlists_user_saved_idx
  on public.saved_playlists (user_id, saved_at desc);

create index if not exists saved_playlists_playlist_idx
  on public.saved_playlists (playlist_id);

alter table public.saved_playlists enable row level security;

drop policy if exists saved_playlists_all_own on public.saved_playlists;
create policy saved_playlists_all_own on public.saved_playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public read: playlists marked public
drop policy if exists playlists_select_public on public.playlists;
create policy playlists_select_public on public.playlists
  for select using (is_public = true);

drop policy if exists playlist_tracks_select_public on public.playlist_tracks;
create policy playlist_tracks_select_public on public.playlist_tracks
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.is_public = true
    )
  );

-- Authors of public playlists: username visible for @mentions
drop policy if exists profiles_select_public_authors on public.profiles;
create policy profiles_select_public_authors on public.profiles
  for select using (
    exists (
      select 1 from public.playlists p
      where p.user_id = profiles.id and p.is_public = true
    )
  );
