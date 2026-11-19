-- Places become regions. Outlets from many more countries, each with the region readers choose
-- ("Europe", "Middle East", ...). The lists match workers/verilo_workers/ingest/registry.py
-- (REGION_OF) and apps/web/lib/regions.ts; a worker test checks the database accepts every one.

alter table public.sources drop constraint sources_country_check;
alter table public.sources add constraint sources_country_check check (country in (
  'US', 'CA', 'GB', 'IE', 'DE', 'FR', 'BE', 'UA', 'NL', 'IT', 'ES', 'PL', 'QA', 'AE', 'SA', 'IL',
  'TR', 'ZA', 'KE', 'NG', 'GH', 'IN', 'PK', 'BD', 'LK', 'JP', 'KR', 'HK', 'TW', 'SG', 'PH', 'MY',
  'ID', 'TH', 'AU', 'NZ', 'MX', 'BR', 'AR', 'CO', 'INT'));

-- The region an outlet counts for: usually where it's based, but an outlet can cover another
-- region (Al-Monitor reports on the Middle East from Washington). Set by sync-sources.
alter table public.sources add column region text;
update public.sources set region = case country
  when 'US' then 'north-america' when 'CA' then 'north-america'
  when 'GB' then 'uk-ireland' when 'IE' then 'uk-ireland'
  when 'AU' then 'oceania' when 'IN' then 'south-asia'
  else 'international' end;
alter table public.sources alter column region set not null;
alter table public.sources add constraint sources_region_check check (region in (
  'north-america', 'uk-ireland', 'europe', 'middle-east', 'africa', 'south-asia', 'east-asia',
  'southeast-asia', 'oceania', 'latin-america', 'international'));

-- Readers' places are regions now. Existing choices carry over (United Kingdom or Ireland
-- become "UK and Ireland", and so on).
alter table public.reader_preferences add column regions text[] not null default '{}';
update public.reader_preferences set regions = array(
  select distinct case c
    when 'US' then 'north-america' when 'CA' then 'north-america'
    when 'GB' then 'uk-ireland' when 'IE' then 'uk-ireland'
    when 'AU' then 'oceania' when 'IN' then 'south-asia'
    else 'international' end
  from unnest(countries) as c);
alter table public.reader_preferences drop column countries;
alter table public.reader_preferences add constraint reader_preferences_regions_check check (
  regions <@ array['north-america', 'uk-ireland', 'europe', 'middle-east', 'africa',
    'south-asia', 'east-asia', 'southeast-asia', 'oceania', 'latin-america',
    'international']::text[]);

drop function public.save_reader_preferences(
  text[], boolean, boolean, bigint[], bigint[], bigint[], bigint[]);

create function public.save_reader_preferences(
  p_regions text[],
  p_show_opinion boolean,
  p_show_tier3 boolean,
  p_follow_topics bigint[],
  p_mute_topics bigint[],
  p_follow_sources bigint[],
  p_hide_sources bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.reader_preferences (user_id, regions, show_opinion, show_tier3, onboarded_at)
  values (uid, coalesce(p_regions, '{}'), p_show_opinion, p_show_tier3, now())
  on conflict (user_id) do update set
    regions = excluded.regions,
    show_opinion = excluded.show_opinion,
    show_tier3 = excluded.show_tier3,
    onboarded_at = coalesce(public.reader_preferences.onboarded_at, excluded.onboarded_at);

  delete from public.reader_topics where user_id = uid;
  insert into public.reader_topics (user_id, topic_id, choice)
  select uid, t, 'follow' from unnest(coalesce(p_follow_topics, '{}')) as t
  union
  select uid, t, 'mute' from unnest(coalesce(p_mute_topics, '{}')) as t
  where not (t = any(coalesce(p_follow_topics, '{}')));

  delete from public.reader_sources where user_id = uid;
  insert into public.reader_sources (user_id, source_id, choice)
  select uid, s, 'follow' from unnest(coalesce(p_follow_sources, '{}')) as s
  union
  select uid, s, 'hide' from unnest(coalesce(p_hide_sources, '{}')) as s
  where not (s = any(coalesce(p_follow_sources, '{}')));
end;
$$;

revoke execute on function public.save_reader_preferences from public, anon;
grant execute on function public.save_reader_preferences to authenticated;

-- The front page's view gains each article's region.
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
    '{}') as topic_ids
from public.stories st
where st.merged_into is null;
