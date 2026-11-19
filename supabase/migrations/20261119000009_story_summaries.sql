-- Phase 4: AI summaries, checked before anyone sees them.
--
-- A story gets a summary only when enough trusted outlets from different leans report it. A
-- writer model drafts it from the outlets' headlines and excerpts, each point citing its
-- sources; code checks (numbers, quotes, names, citations) and a second, different model check
-- every point. Anything that fails shows headlines and links only, and the failure is kept here.

create table public.story_summaries (
  id bigint generated always as identity primary key,
  story_id bigint not null references public.stories (id) on delete cascade,
  status text not null check (status in ('published', 'failed', 'superseded')),
  -- [{"text": "...", "article_ids": [12, 34]}]
  bullets jsonb not null default '[]'::jsonb,
  -- The articles given to the writer: what the summary may be built from.
  article_ids bigint[] not null,
  writer text not null,
  checker text,
  attempts smallint not null default 1,
  failure text check (char_length(failure) <= 2000),
  created_at timestamptz not null default now()
);

create index story_summaries_by_story on public.story_summaries (story_id, created_at desc);
create unique index story_summaries_one_published on public.story_summaries (story_id)
  where status = 'published';
create index story_summaries_recent on public.story_summaries (created_at desc);

-- Every check on every attempt: the failure log, and the evidence behind each published summary.
create table public.summary_checks (
  id bigint generated always as identity primary key,
  summary_id bigint not null references public.story_summaries (id) on delete cascade,
  attempt smallint not null,
  check_name text not null,
  passed boolean not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index summary_checks_by_summary on public.summary_checks (summary_id);

alter table public.story_summaries enable row level security;
alter table public.summary_checks enable row level security;

create policy "Anyone reads published summaries" on public.story_summaries for select
  to anon, authenticated using (status = 'published');
create policy "Editors read every summary" on public.story_summaries for select
  to authenticated using ((select public.is_editor()));
create policy "Editors read summary checks" on public.summary_checks for select
  to authenticated using ((select public.is_editor()));

revoke insert, update, delete, truncate on public.story_summaries, public.summary_checks
  from anon, authenticated;

-- The front page's view gains each story's published summary (its points, or null).
create or replace view public.story_cards with (security_invoker = true) as
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
        'lean', s.lean, 'country', s.country, 'region', s.region, 'kind', a.kind,
        'title', a.title, 'snippet', a.snippet, 'url', a.url, 'published_at', a.published_at)
        order by s.tier, a.published_at)
     from public.articles a join public.sources s on s.id = a.source_id
     where a.story_id = st.id),
    '[]'::jsonb) as articles,
  coalesce(
    (select array_agg(t.topic_id order by t.articles desc)
     from public.story_topics t
     where t.story_id = st.id
       and (st.article_count = 1
            or (t.articles >= 2 and t.articles >= 0.2 * st.article_count))),
    '{}') as topic_ids,
  (select jsonb_build_object('bullets', ss.bullets, 'writer', ss.writer, 'checker', ss.checker,
            'created_at', ss.created_at)
   from public.story_summaries ss
   where ss.story_id = st.id and ss.status = 'published') as summary
from public.stories st
where st.merged_into is null;
