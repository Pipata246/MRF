-- Premium subscription window (for future billing; clients cannot write)
alter table public.profiles
  add column if not exists premium_started_at timestamptz,
  add column if not exists premium_ends_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_premium_window_check;

alter table public.profiles
  add constraint profiles_premium_window_check
  check (
    premium_ends_at is null
    or premium_started_at is null
    or premium_ends_at >= premium_started_at
  );

create index if not exists profiles_premium_ends_at_idx
  on public.profiles (premium_ends_at)
  where premium_ends_at is not null;

-- Lock dates the same way as is_premium (authenticated JWT cannot change them)
create or replace function public.profiles_lock_is_premium()
returns trigger
language plpgsql
as $$
begin
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
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_is_premium on public.profiles;
create trigger profiles_lock_is_premium
  before update on public.profiles
  for each row execute function public.profiles_lock_is_premium();
