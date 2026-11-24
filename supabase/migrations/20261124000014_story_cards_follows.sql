-- The front page and story pages see which earlier story a story follows (its earlier coverage).

drop view public.story_cards;
create view public.story_cards with (security_invoker = true) as
select
  st.id,
  st.title,
  st.first_published_at,
  st.last_published_at,
  st.article_count,
  st.outlet_count,
  st.follows,
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

grant select on public.story_cards to anon, authenticated;
