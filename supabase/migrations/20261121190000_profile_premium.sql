-- Premium subscription flag on profiles (read-only for clients; set via service_role)
alter table public.profiles
  add column if not exists is_premium boolean not null default false;

create or replace function public.profiles_lock_is_premium()
returns trigger
language plpgsql
as $$
begin
  -- Block self-grant from logged-in users; SQL editor / service_role may update
  if tg_op = 'UPDATE'
     and new.is_premium is distinct from old.is_premium
     and coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    new.is_premium := old.is_premium;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_is_premium on public.profiles;
create trigger profiles_lock_is_premium
  before update on public.profiles
  for each row execute function public.profiles_lock_is_premium();
