-- Search: stories by the words in their articles' headlines and excerpts (English full-text
-- search). Best first: relevance, weighted by how widely the story is covered, then the newest.

alter table public.articles
  add column search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(snippet, '')), 'B')
  ) stored;

create index articles_search on public.articles using gin (search);

-- Readers may read only listed columns of articles (migration 03).
grant select (search) on public.articles to anon, authenticated;

-- Story ids for a reader's search words. Runs as the caller (security invoker), so it sees only
-- what they may read; stories merged into others are left out.
create function public.search_stories(p_query text, p_limit integer default 30)
returns table (story_id bigint, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('english', left(p_query, 200)) as query)
  select a.story_id, (max(ts_rank(a.search, q.query)) * ln(2 + st.outlet_count))::real as rank
  from q
  cross join public.articles a
  join public.stories st on st.id = a.story_id
  where a.search @@ q.query and st.merged_into is null
  group by a.story_id, st.outlet_count, st.last_published_at
  order by 2 desc, st.last_published_at desc
  limit least(greatest(p_limit, 1), 50);
$$;
