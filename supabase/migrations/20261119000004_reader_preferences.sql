-- Readers' own preferences: set in the welcome wizard, changed in settings. They shape what each
-- reader sees; they never change the editorial standards (tiers, leans, which outlets feed
-- summaries), which are the same for everyone.

create table public.reader_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Countries whose outlets the reader wants more of ('US', 'GB', 'CA', 'AU', 'IE', 'IN', 'INT').
  countries text[] not null default '{}'
    check (countries <@ array['US', 'GB', 'CA', 'AU', 'IE', 'IN', 'INT']::text[]),
  show_opinion boolean not null default true, -- opinion pieces, always labelled
  show_tier3 boolean not null default true, -- lower-tier outlets, always labelled
  -- Set when the reader finishes or skips the welcome wizard.
  onboarded_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.reader_topics (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id bigint not null references public.topics (id) on delete cascade,
  choice text not null check (choice in ('follow', 'mute')),
  primary key (user_id, topic_id)
);

create table public.reader_sources (
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id bigint not null references public.sources (id) on delete cascade,
  choice text not null check (choice in ('follow', 'hide')),
  primary key (user_id, source_id)
);

create trigger reader_preferences_touch_updated_at
  before update on public.reader_preferences
  for each row execute function public.touch_updated_at();

alter table public.reader_preferences enable row level security;
alter table public.reader_topics enable row level security;
alter table public.reader_sources enable row level security;

-- Each reader reads and writes only their own rows.
create policy "Own preferences" on public.reader_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own topics" on public.reader_topics for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own sources" on public.reader_sources for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.reader_preferences, public.reader_topics, public.reader_sources from anon;

-- The front page's candidates: recent stories with what ranking needs about their articles
-- (outlet, tier, country, kind) and their topics, one row per story.
create view public.story_cards with (security_invoker = true) as
select
  st.id,
  st.title,
  st.first_published_at,
  st.last_published_at,
  st.article_count,
  st.outlet_count,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
        'id', a.id, 'source_id', a.source_id, 'source', s.name, 'tier', s.tier,
        'lean', s.lean, 'country', s.country, 'kind', a.kind, 'title', a.title,
        'snippet', a.snippet, 'url', a.url, 'published_at', a.published_at)
        order by s.tier, a.published_at)
     from public.articles a join public.sources s on s.id = a.source_id
     where a.story_id = st.id),
    '[]'::jsonb) as articles,
  coalesce(
    (select array_agg(t.topic_id order by t.articles desc)
     from public.story_topics t where t.story_id = st.id),
    '{}') as topic_ids
from public.stories st
where st.merged_into is null;
