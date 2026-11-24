-- Readers' own sources: feeds and public Telegram channels a reader adds for themselves, beside
-- Verilo's rated outlets. They are never used for summaries, outlet counts, ranking or anything
-- another reader sees; each reader sees only the items of the sources they added.
--
-- A source is fetched once however many readers add it (own_sources); who added what is private
-- (reader_own_sources). Items are kept 14 days (retention). Editors can block a source.

create table public.own_sources (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('feed', 'telegram')),
  -- The address fetched: a feed URL, or https://t.me/s/<channel> for Telegram.
  url text not null unique check (url ~ '^https://' and char_length(url) <= 2048),
  title text check (char_length(title) <= 200),
  site_url text check (char_length(site_url) <= 2048),
  -- The outlet Verilo rates that this source is officially from: a feed on the outlet's own
  -- website (found by the fetcher), or a channel an editor confirmed. Telegram's public page
  -- doesn't show its verified badge, so channels are never marked from it.
  official_source_id bigint references public.sources (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'ok', 'failing', 'blocked')),
  blocked_reason text check (char_length(blocked_reason) <= 500),
  last_error text check (char_length(last_error) <= 300),
  consecutive_failures integer not null default 0,
  etag text,
  last_modified text,
  next_fetch_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create index own_sources_due on public.own_sources (next_fetch_at) where status <> 'blocked';

create table public.reader_own_sources (
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id bigint not null references public.own_sources (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, source_id)
);

create index reader_own_sources_by_source on public.reader_own_sources (source_id);

create table public.own_items (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.own_sources (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 2048),
  title text not null check (char_length(title) between 1 and 400),
  snippet text not null default '' check (char_length(snippet) <= 400),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique (source_id, url)
);

create index own_items_recent on public.own_items (source_id, published_at desc);

-- When the reader accepted the notice about unverified sources (before adding the first).
alter table public.reader_preferences add column own_sources_accepted_at timestamptz;

alter table public.own_sources enable row level security;
alter table public.reader_own_sources enable row level security;
alter table public.own_items enable row level security;

create policy "Readers see the sources they added" on public.own_sources for select
  to authenticated using (
    exists (select 1 from public.reader_own_sources r
            where r.source_id = own_sources.id and r.user_id = (select auth.uid())));
create policy "Editors see every own source" on public.own_sources for select
  to authenticated using ((select public.is_editor()));

create policy "Readers manage their own list" on public.reader_own_sources for all
  to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Readers see items of the sources they added" on public.own_items for select
  to authenticated using (
    exists (select 1 from public.reader_own_sources r
            where r.source_id = own_items.source_id and r.user_id = (select auth.uid())));

-- Sources and items are written by the server (it checks and fetches them), never by readers.
revoke insert, update, delete, truncate on public.own_sources, public.own_items
  from anon, authenticated;
revoke all on public.own_sources, public.reader_own_sources, public.own_items from anon;
revoke truncate on public.reader_own_sources from authenticated;
