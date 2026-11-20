-- Daily personal recommendation feed (stable until local midnight)
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

alter table public.user_recommendation_feeds enable row level security;

drop policy if exists rec_feeds_all_own on public.user_recommendation_feeds;
create policy rec_feeds_all_own on public.user_recommendation_feeds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
