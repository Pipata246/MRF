-- Telegram account link (Login Widget) + one-time trial protection
alter table public.profiles
  add column if not exists telegram_id bigint,
  add column if not exists telegram_username text,
  add column if not exists telegram_linked_at timestamptz,
  add column if not exists telegram_trial_used boolean not null default false;

-- One Telegram account → one MRF profile
create unique index if not exists profiles_telegram_id_uidx
  on public.profiles (telegram_id)
  where telegram_id is not null;

create index if not exists profiles_telegram_trial_used_idx
  on public.profiles (telegram_trial_used)
  where telegram_trial_used = true;

-- Clients cannot touch telegram / trial / premium fields
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
