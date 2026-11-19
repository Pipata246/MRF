-- ═══════════════════════════════════════════════════════════
-- MRF migration — prod settings + immutable username
-- Run in Supabase SQL Editor (once).
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════

-- 1) Username cannot change after create
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

-- 2) Expand user_settings for production preferences
alter table public.user_settings
  add column if not exists theme text not null default 'dark',
  add column if not exists accent_dark text not null default '#EE90B7',
  add column if not exists accent_light text not null default '#27ae60',
  add column if not exists autoplay boolean not null default false,
  add column if not exists shuffle_on_play boolean not null default false,
  add column if not exists remember_position boolean not null default true,
  add column if not exists crossfade_seconds integer not null default 0,
  add column if not exists show_explicit boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_theme_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_theme_check check (theme in ('dark', 'light'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_crossfade_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_crossfade_check check (crossfade_seconds between 0 and 12);
  end if;
end $$;

-- Backfill from legacy jsonb.settings when present
update public.user_settings us
set
  theme = coalesce(nullif(us.settings->>'theme', ''), us.theme, 'dark'),
  accent_dark = coalesce(
    nullif(us.settings->>'accentColorDark', ''),
    nullif(us.settings->>'accentColor', ''),
    us.accent_dark,
    '#EE90B7'
  ),
  accent_light = coalesce(
    nullif(us.settings->>'accentColorLight', ''),
    nullif(us.settings->>'accentColor', ''),
    us.accent_light,
    '#27ae60'
  ),
  autoplay = coalesce((us.settings->>'autoplay')::boolean, us.autoplay, false),
  shuffle_on_play = coalesce((us.settings->>'shuffleOnPlay')::boolean, us.shuffle_on_play, false),
  remember_position = coalesce((us.settings->>'rememberPosition')::boolean, us.remember_position, true),
  crossfade_seconds = coalesce((us.settings->>'crossfadeSeconds')::int, us.crossfade_seconds, 0),
  show_explicit = coalesce((us.settings->>'showExplicit')::boolean, us.show_explicit, true);

-- 3) New users get full settings row defaults
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
