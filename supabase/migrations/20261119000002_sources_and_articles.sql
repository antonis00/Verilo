-- Phase 2: the source registry and the articles fetched from its feeds.
--
-- Verilo keeps only a headline, a short snippet, the link and the date for each article.
-- There is deliberately no column for article text, and the length checks below stop a long
-- body being stored in the snippet or title by mistake.

create type public.source_lean as enum ('left', 'lean_left', 'center', 'lean_right', 'right');

create table public.sources (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  homepage text not null check (homepage ~ '^https://'),
  country text not null check (country in ('US', 'GB', 'CA', 'AU', 'IE', 'IN', 'INT')),
  kind text not null
    check (kind in ('wire', 'public_broadcaster', 'newspaper', 'broadcaster', 'digital', 'magazine')),
  -- 1 fact base, 2 reputable, 3 shown with a label but never used for summaries.
  tier smallint not null check (tier between 1 and 3),
  lean public.source_lean not null,
  status text not null default 'active' check (status in ('active', 'paused', 'excluded')),
  -- Why this tier and lean, and when the owner last checked them (null: not yet reviewed).
  rating_basis text not null check (char_length(rating_basis) between 1 and 1000),
  reviewed_on date,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.sources.tier is
  '1 = fact base (wire services, public broadcasters), 2 = reputable outlet, 3 = labelled, never summarised';

create table public.source_feeds (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.sources (id) on delete cascade,
  url text not null unique check (url ~ '^https?://' and char_length(url) <= 2048),
  section text not null default 'top' check (char_length(section) between 1 and 40),
  poll_minutes integer not null default 60 check (poll_minutes between 5 and 1440),
  active boolean not null default true,
  -- Conditional requests: sent back so an unchanged feed costs the publisher almost nothing.
  etag text,
  last_modified text,
  next_fetch_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_status integer,
  last_error text check (char_length(last_error) <= 500),
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now()
);

create index source_feeds_due on public.source_feeds (next_fetch_at) where active;

create table public.articles (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.sources (id) on delete cascade,
  feed_id bigint references public.source_feeds (id) on delete set null,
  url text not null unique check (url ~ '^https?://' and char_length(url) <= 2048),
  title text not null check (char_length(title) between 1 and 400),
  snippet text not null default '' check (char_length(snippet) <= 400),
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  -- Same headline from the same outlet on the same day, under a different link: stored once.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  unique (source_id, content_hash)
);

comment on table public.articles is
  'Headline, snippet (max 400 characters), link and date only. Full article text is never stored.';

create index articles_recent on public.articles (coalesce(published_at, fetched_at) desc);
create index articles_by_source on public.articles (source_id, coalesce(published_at, fetched_at) desc);

-- One row per fetch, for the feed health view. Kept for 30 days by the ingester.
create table public.fetch_log (
  id bigint generated always as identity primary key,
  feed_id bigint not null references public.source_feeds (id) on delete cascade,
  fetched_at timestamptz not null default now(),
  status integer not null,
  outcome text not null check (outcome in ('new', 'unchanged', 'empty', 'failed', 'skipped')),
  new_articles integer not null default 0,
  error text check (char_length(error) <= 500),
  duration_ms integer
);

create index fetch_log_recent on public.fetch_log (feed_id, fetched_at desc);

create trigger sources_touch_updated_at
  before update on public.sources
  for each row execute function public.touch_updated_at();

-- Editors (the owner) can open the internal desk page. Readers can't make themselves editors:
-- they may update only their own name and time zone.
alter table public.profiles add column is_editor boolean not null default false;

revoke update on public.profiles from authenticated, anon;
grant update (display_name, time_zone) on public.profiles to authenticated;

create function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_editor from public.profiles p where p.id = auth.uid()), false);
$$;

-- Row-level security. Sources and articles are what the product shows, so anyone may read them;
-- feeds and the fetch log are internal, for editors only. Only the workers (the database owner)
-- write any of these tables.
alter table public.sources enable row level security;
alter table public.source_feeds enable row level security;
alter table public.articles enable row level security;
alter table public.fetch_log enable row level security;

create policy "Anyone reads sources" on public.sources for select to anon, authenticated using (true);
create policy "Anyone reads articles" on public.articles for select to anon, authenticated using (true);
create policy "Editors read feeds" on public.source_feeds for select to authenticated
  using ((select public.is_editor()));
create policy "Editors read the fetch log" on public.fetch_log for select to authenticated
  using ((select public.is_editor()));

revoke insert, update, delete, truncate on public.sources, public.source_feeds, public.articles,
  public.fetch_log from anon, authenticated;
