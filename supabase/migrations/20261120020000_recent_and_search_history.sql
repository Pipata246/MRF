-- ═══════════════════════════════════════════════════════════
-- NOVALIBER — recently played + search history
-- Run in Supabase SQL Editor once.
-- ═══════════════════════════════════════════════════════════

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

alter table public.recent_plays enable row level security;
alter table public.search_history enable row level security;

drop policy if exists recent_plays_all_own on public.recent_plays;
create policy recent_plays_all_own on public.recent_plays
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists search_history_all_own on public.search_history;
create policy search_history_all_own on public.search_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
