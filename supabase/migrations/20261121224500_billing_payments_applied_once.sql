-- One-shot premium grant per payment: never re-apply after this is set
alter table public.billing_payments
  add column if not exists premium_applied_at timestamptz;

-- Existing succeeded payments are already "used" — lock them forever
update public.billing_payments
set premium_applied_at = coalesce(paid_at, created_at, now())
where status = 'succeeded'
  and premium_applied_at is null;

create index if not exists billing_payments_premium_applied_idx
  on public.billing_payments (premium_applied_at)
  where premium_applied_at is not null;
