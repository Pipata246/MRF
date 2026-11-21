-- YooKassa payments ledger (server/admin only)
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

alter table public.billing_payments enable row level security;

-- No direct client policies: only service_role / admin bypasses RLS
drop policy if exists billing_payments_no_client on public.billing_payments;
create policy billing_payments_no_client
  on public.billing_payments
  for all
  using (false)
  with check (false);
