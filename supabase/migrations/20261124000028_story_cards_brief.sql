-- A lighter story list for the front page, topic pages, search and the briefing: one report per
-- outlet (its newest news report, else its newest piece) with the excerpt cut to 220 characters.
-- The full story_cards (every article) stays for story pages. Nov 2026: the front page's cached
-- candidates were about 1 MB, mostly articles the page never shows.

create view public.story_cards_brief with (security_invoker = true) as
select
  st.id,
  st.title,
  st.first_published_at,
  st.last_published_at,
  st.article_count,
  st.outlet_count,
  st.follows,
  st.places,
  coalesce(
    (select jsonb_agg(x.card order by x.tier, x.published_at)
     from (
       select distinct on (a.source_id)
         s.tier, a.published_at,
         jsonb_build_object(
           'id', a.id, 'source_id', a.source_id, 'source', s.name, 'tier', s.tier,
           'lean', s.lean, 'country', s.country, 'region', s.region, 'kind', a.kind,
           'title', a.title, 'snippet', left(a.snippet, 220), 'url', a.url,
           'published_at', a.published_at) as card
       from public.articles a join public.sources s on s.id = a.source_id
       where a.story_id = st.id
       order by a.source_id, (a.kind = 'news') desc, a.published_at desc
     ) x),
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

grant select on public.story_cards_brief to anon, authenticated;
