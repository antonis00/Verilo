-- A story's topics on the front page and section pages: a topic counts when at least 20% of the
-- story's articles, and at least two of them, carry it (a one-article story keeps its article's
-- topics). Before, one article was enough, so a 129-article summit story became "Business"
-- because a single Bloomberg markets item covered it, and a casting story became "Business"
-- because one of its four articles was about the franchise's money. Checked on real stories
-- (Nov 2026): 30% dropped the Nvidia saga (13 of 53 articles business); 20% plus two keeps it.

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
        'lean', s.lean, 'country', s.country, 'kind', a.kind, 'title', a.title,
        'snippet', a.snippet, 'url', a.url, 'published_at', a.published_at)
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
    '{}') as topic_ids
from public.stories st
where st.merged_into is null;
