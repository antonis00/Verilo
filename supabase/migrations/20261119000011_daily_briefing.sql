-- Phase 5: the daily briefing by email. Each reader chooses whether to get it, the hour (in their
-- own time zone, taken from their browser) and its length. A reader without a row gets the
-- defaults: on, 7 in the morning, short.

create table public.digest_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  send_hour smallint not null default 7 check (send_hour between 0 and 23),
  length text not null default 'short' check (length in ('short', 'full')),
  -- An IANA name such as "Asia/Qatar"; the app checks it's one it knows before saving.
  time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  updated_at timestamptz not null default now()
);

create trigger digest_settings_touch
  before update on public.digest_settings
  for each row execute function public.touch_updated_at();

alter table public.digest_settings enable row level security;

create policy "Readers read their briefing settings" on public.digest_settings for select
  to authenticated using (user_id = (select auth.uid()));
create policy "Readers create their briefing settings" on public.digest_settings for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Readers change their briefing settings" on public.digest_settings for update
  to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- One row per reader per local day, claimed before sending (the unique key), so two runs at
-- once never send the same briefing twice.
create table public.digests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'empty')),
  story_ids bigint[] not null default '{}',
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, local_date)
);

create index digests_recent on public.digests (created_at desc);

alter table public.digests enable row level security;

create policy "Readers read their own briefings" on public.digests for select
  to authenticated using (user_id = (select auth.uid()));
create policy "Editors read every briefing" on public.digests for select
  to authenticated using ((select public.is_editor()));

revoke insert, update, delete, truncate on public.digests from anon, authenticated;
revoke delete, truncate on public.digest_settings from anon, authenticated;
