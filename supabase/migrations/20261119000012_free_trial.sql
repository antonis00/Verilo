-- Phase 5: the free trial. Every new account gets TRIAL_DAYS (14) of full access; after that,
-- a subscription (payments come later, through Stripe or similar, which will set
-- subscribed_until). Nothing is locked yet: the app only shows where each reader stands, so the
-- trial is in place before prices and payments are decided.
--
-- Readers can't change either column: their only update grant is display_name and time_zone
-- (migration 02). Only the server (secret key) and, later, the payment webhook write them.

alter table public.profiles
  add column trial_ends_at timestamptz,
  add column subscribed_until timestamptz;

-- Accounts that exist already: their trial counts from when they joined.
update public.profiles set trial_ends_at = created_at + interval '14 days';

alter table public.profiles
  alter column trial_ends_at set default now() + interval '14 days',
  alter column trial_ends_at set not null;
