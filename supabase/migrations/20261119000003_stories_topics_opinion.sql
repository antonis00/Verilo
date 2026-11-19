-- Phase 3: articles grouped into stories, opinion and sponsored pieces flagged, topics tagged.

create extension if not exists vector with schema extensions;

-- A story is one event, reported by one or more outlets. Its centroid is the normalised mean of
-- its articles' embeddings; new articles join the nearest recent story when similar enough.
create table public.stories (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 400),
  first_published_at timestamptz not null,
  last_published_at timestamptz not null,
  centroid extensions.vector(384) not null,
  article_count integer not null default 0,
  outlet_count integer not null default 0,
  -- When two stories turn out to be the same event, the newer one points at the one it joined.
  merged_into bigint references public.stories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stories_recent on public.stories (last_published_at desc) where merged_into is null;

create trigger stories_touch_updated_at
  before update on public.stories
  for each row execute function public.touch_updated_at();

-- What each article is. Only 'news' may ever feed a summary; opinion and sponsored pieces are
-- shown with a label. kind_reason says which rule decided it, so a wrong call can be traced.
alter table public.articles
  add column kind text not null default 'news' check (kind in ('news', 'opinion', 'sponsored')),
  add column kind_reason text check (char_length(kind_reason) <= 200),
  add column embedding extensions.vector(384),
  add column enriched_at timestamptz,
  add column story_id bigint references public.stories (id) on delete set null,
  add column story_similarity real,
  add column clustered_at timestamptz;

create index articles_to_enrich on public.articles (id) where enriched_at is null;
create index articles_to_cluster on public.articles (id)
  where clustered_at is null and enriched_at is not null;
create index articles_by_story on public.articles (story_id);

-- Topics readers can follow (Phase 5). Edited in workers/data/topics.toml.
create table public.topics (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 600),
  position integer not null default 0,
  active boolean not null default true
);

create table public.article_topics (
  article_id bigint not null references public.articles (id) on delete cascade,
  topic_id bigint not null references public.topics (id) on delete cascade,
  score real not null,
  method text not null check (method in ('embedding', 'section')),
  primary key (article_id, topic_id)
);

create index article_topics_by_topic on public.article_topics (topic_id);

-- A story's topics: those of its articles, weighted by how many articles carry them.
create view public.story_topics with (security_invoker = true) as
  select a.story_id, at.topic_id, count(*)::integer as articles, max(at.score) as best_score
  from public.article_topics at
  join public.articles a on a.id = at.article_id
  where a.story_id is not null
  group by a.story_id, at.topic_id;

alter table public.stories enable row level security;
alter table public.topics enable row level security;
alter table public.article_topics enable row level security;

create policy "Anyone reads stories" on public.stories for select to anon, authenticated using (true);
create policy "Anyone reads topics" on public.topics for select to anon, authenticated using (true);
create policy "Anyone reads article topics" on public.article_topics for select to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.stories, public.topics, public.article_topics
  from anon, authenticated;
-- Embeddings and centroids are internal and large: not exposed through the API. Revoking one
-- column doesn't hide it while the whole table is granted, so readable columns are listed
-- instead. A new column needs adding here to be readable.
revoke select on public.articles from anon, authenticated;
grant select (
  id, source_id, feed_id, url, title, snippet, published_at, fetched_at, content_hash,
  kind, kind_reason, enriched_at, story_id, story_similarity, clustered_at
) on public.articles to anon, authenticated;

revoke select on public.stories from anon, authenticated;
grant select (
  id, title, first_published_at, last_published_at, article_count, outlet_count, merged_into,
  created_at, updated_at
) on public.stories to anon, authenticated;
