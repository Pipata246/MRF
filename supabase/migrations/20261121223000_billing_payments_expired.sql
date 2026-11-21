-- Allow expired status for timed-out unpaid checkouts
alter table public.billing_payments
  drop constraint if exists billing_payments_status_check;

alter table public.billing_payments
  add constraint billing_payments_status_check
  check (status in ('pending', 'succeeded', 'canceled', 'expired'));
