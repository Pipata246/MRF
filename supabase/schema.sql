-- ═══════════════════════════════════════════════════════════
-- NOVALIBER — Supabase schema (Auth + user library)
-- Run in Supabase SQL Editor once per project.
-- Security: RLS on every table. No public writes without auth.
-- ═══════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Profiles ───────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  is_premium boolean not null default false,
  premium_started_at timestamptz,
  premium_ends_at timestamptz,
  telegram_id bigint,
  telegram_username text,
  telegram_linked_at timestamptz,
  telegram_trial_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_username_unique unique (username),
  constraint profiles_bio_len check (char_length(bio) <= 160),
  constraint profiles_premium_window_check check (
    premium_ends_at is null
    or premium_started_at is null
    or premium_ends_at >= premium_started_at
  )
);

create index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create index if not exists profiles_username_trgm_like_idx
  on public.profiles (username text_pattern_ops);
create index if not exists profiles_premium_ends_at_idx
  on public.profiles (premium_ends_at)
  where premium_ends_at is not null;
create unique index if not exists profiles_telegram_id_uidx
  on public.profiles (telegram_id)
  where telegram_id is not null;
create index if not exists profiles_telegram_trial_used_idx
  on public.profiles (telegram_trial_used)
  where telegram_trial_used = true;

-- ── Billing (YooKassa) ─────────────────────────────────────
create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  yookassa_payment_id text not null,
  plan text not null,
  amount_rub numeric(10, 2) not null,
  currency text not null default 'RUB',
  status text not null default 'pending',
  raw jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  -- Set exactly once when Premium is granted for this payment; never re-grant after
  premium_applied_at timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_payments_plan_check check (plan in ('month', 'year')),
  constraint billing_payments_status_check check (status in ('pending', 'succeeded', 'canceled', 'expired'))
);

create unique index if not exists billing_payments_yookassa_uidx
  on public.billing_payments (yookassa_payment_id);
create index if not exists billing_payments_user_id_idx
  on public.billing_payments (user_id);
create index if not exists billing_payments_status_idx
  on public.billing_payments (status);
create index if not exists billing_payments_premium_applied_idx
  on public.billing_payments (premium_applied_at)
  where premium_applied_at is not null;

-- ── Settings (per user) ────────────────────────────────────
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  theme text not null default 'dark',
  accent_dark text not null default '#EE90B7',
  accent_light text not null default '#27ae60',
  autoplay boolean not null default false,
  shuffle_on_play boolean not null default false,
  remember_position boolean not null default true,
  crossfade_seconds integer not null default 0,
  show_explicit boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_check check (theme in ('dark', 'light')),
  constraint user_settings_crossfade_check check (crossfade_seconds between 0 and 12)
);

-- ── Liked tracks ───────────────────────────────────────────
create table if not exists public.liked_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  track_key text not null,
  payload jsonb not null default '{}'::jsonb,
  added_at timestamptz not null default now(),
  constraint liked_tracks_user_track unique (user_id, track_key)
);

create index if not exists liked_tracks_user_added_idx
  on public.liked_tracks (user_id, added_at desc);

-- ── Followed artists ───────────────────────────────────────
create table if not exists public.followed_artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  artist_key text not null,
  payload jsonb not null default '{}'::jsonb,
  added_at timestamptz not null default now(),
  constraint followed_artists_user_artist unique (user_id, artist_key)
);

create index if not exists followed_artists_user_added_idx
  on public.followed_artists (user_id, added_at desc);

-- ── Saved albums ───────────────────────────────────────────
create table if not exists public.saved_albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  album_key text not null,
  payload jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  constraint saved_albums_user_album unique (user_id, album_key)
);

create index if not exists saved_albums_user_saved_idx
  on public.saved_albums (user_id, saved_at desc);

-- ── Playlists (public searchable; default public) ──────────
create table if not exists public.playlists (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text not null default '',
  cover text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playlists_user_updated_idx
  on public.playlists (user_id, updated_at desc);

create index if not exists playlists_public_name_idx
  on public.playlists (is_public, updated_at desc)
  where is_public = true;

create index if not exists playlists_public_name_lower_idx
  on public.playlists (lower(name));

create table if not exists public.playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id text not null references public.playlists (id) on delete cascade,
  track_key text not null,
  payload jsonb not null default '{}'::jsonb,
  position int not null default 0,
  added_at timestamptz not null default now(),
  constraint playlist_tracks_unique unique (playlist_id, track_key)
);

create index if not exists playlist_tracks_pl_pos_idx
  on public.playlist_tracks (playlist_id, position asc, added_at desc);

-- Saved public playlists (reference → live updates from author)
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

create table if not exists public.recent_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  track_key text not null,
  payload jsonb not null default '{}'::jsonb,
  played_at timestamptz not null default now(),
  constraint recent_plays_user_track unique (user_id, track_key)
);

create index if not exists recent_plays_user_played_idx
  on public.recent_plays (user_id, played_at desc);

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null,
  searched_at timestamptz not null default now(),
  constraint search_history_user_query unique (user_id, query)
);

create index if not exists search_history_user_searched_idx
  on public.search_history (user_id, searched_at desc);

-- ── updated_at helper ──────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Username is permanent (cannot be changed)
create or replace function public.profiles_lock_username()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.username is distinct from old.username then
    raise exception 'username is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_username on public.profiles;
create trigger profiles_lock_username
  before update on public.profiles
  for each row execute function public.profiles_lock_username();

-- Premium + Telegram: clients cannot self-grant; service_role can update
create or replace function public.profiles_lock_is_premium()
returns trigger
language plpgsql
as $$
begin
  -- Block self-grant from logged-in users; SQL editor / service_role may update
  if tg_op = 'UPDATE'
     and coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    if new.is_premium is distinct from old.is_premium then
      new.is_premium := old.is_premium;
    end if;
    if new.premium_started_at is distinct from old.premium_started_at then
      new.premium_started_at := old.premium_started_at;
    end if;
    if new.premium_ends_at is distinct from old.premium_ends_at then
      new.premium_ends_at := old.premium_ends_at;
    end if;
    if new.telegram_id is distinct from old.telegram_id then
      new.telegram_id := old.telegram_id;
    end if;
    if new.telegram_username is distinct from old.telegram_username then
      new.telegram_username := old.telegram_username;
    end if;
    if new.telegram_linked_at is distinct from old.telegram_linked_at then
      new.telegram_linked_at := old.telegram_linked_at;
    end if;
    if new.telegram_trial_used is distinct from old.telegram_trial_used then
      new.telegram_trial_used := old.telegram_trial_used;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_is_premium on public.profiles;
create trigger profiles_lock_is_premium
  before update on public.profiles
  for each row execute function public.profiles_lock_is_premium();

drop trigger if exists playlists_set_updated_at on public.playlists;
create trigger playlists_set_updated_at
  before update on public.playlists
  for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ── New user → profile ─────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  dname text;
begin
  uname := lower(trim(both from coalesce(new.raw_user_meta_data->>'username', '')));
  uname := regexp_replace(uname, '^@+', '');
  if uname is null or uname = '' or uname !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'invalid username';
  end if;
  dname := coalesce(nullif(trim(both from new.raw_user_meta_data->>'display_name'), ''), uname);

  insert into public.profiles (id, username, display_name)
  values (new.id, uname, dname)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Username availability (safe public check) ──────────────
create or replace function public.username_available(u text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles p
    where lower(p.username) = lower(regexp_replace(trim(both from coalesce(u, '')), '^@+', ''))
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── Daily recommendation feed (stable until local midnight) ─
create table if not exists public.user_recommendation_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  local_day date not null,
  timezone text not null default 'UTC',
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_recommendation_feeds_day_idx
  on public.user_recommendation_feeds (local_day);

-- ── RLS ────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.liked_tracks enable row level security;
alter table public.followed_artists enable row level security;
alter table public.saved_albums enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.saved_playlists enable row level security;
alter table public.recent_plays enable row level security;
alter table public.search_history enable row level security;
alter table public.user_recommendation_feeds enable row level security;
alter table public.billing_payments enable row level security;

drop policy if exists billing_payments_no_client on public.billing_payments;
create policy billing_payments_no_client
  on public.billing_payments
  for all
  using (false)
  with check (false);

-- Profiles: owner full access; public can read public playlist owners later
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Settings
drop policy if exists settings_all_own on public.user_settings;
create policy settings_all_own on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Liked
drop policy if exists liked_all_own on public.liked_tracks;
create policy liked_all_own on public.liked_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists liked_select_public on public.liked_tracks;
create policy liked_select_public on public.liked_tracks
  for select using (true);

-- Followed
drop policy if exists followed_all_own on public.followed_artists;
create policy followed_all_own on public.followed_artists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists followed_select_public on public.followed_artists;
create policy followed_select_public on public.followed_artists
  for select using (true);

-- Albums
drop policy if exists albums_all_own on public.saved_albums;
create policy albums_all_own on public.saved_albums
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists albums_select_public on public.saved_albums;
create policy albums_select_public on public.saved_albums
  for select using (true);

-- Playlists: owner full access + public read
drop policy if exists playlists_all_own on public.playlists;
create policy playlists_all_own on public.playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists playlists_select_public on public.playlists;
create policy playlists_select_public on public.playlists
  for select using (is_public = true);

drop policy if exists playlist_tracks_all_own on public.playlist_tracks;
create policy playlist_tracks_all_own on public.playlist_tracks
  for all using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

drop policy if exists playlist_tracks_select_public on public.playlist_tracks;
create policy playlist_tracks_select_public on public.playlist_tracks
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.is_public = true
    )
  );

drop policy if exists saved_playlists_all_own on public.saved_playlists;
create policy saved_playlists_all_own on public.saved_playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists profiles_select_public_authors on public.profiles;
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select using (true);

drop policy if exists recent_plays_all_own on public.recent_plays;
create policy recent_plays_all_own on public.recent_plays
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists search_history_all_own on public.search_history;
create policy search_history_all_own on public.search_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists rec_feeds_all_own on public.user_recommendation_feeds;
create policy rec_feeds_all_own on public.user_recommendation_feeds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
