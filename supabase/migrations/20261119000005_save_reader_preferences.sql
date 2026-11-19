-- Saving a reader's preferences in one step: the wizard and the settings page both send the whole
-- set, and this replaces the reader's rows atomically, so a failure never leaves half a save.
-- Runs as the reader (security invoker), so row-level security still applies; unknown topic or
-- source ids fail on their foreign keys.

create function public.save_reader_preferences(
  p_countries text[],
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

  insert into public.reader_preferences (user_id, countries, show_opinion, show_tier3, onboarded_at)
  values (uid, coalesce(p_countries, '{}'), p_show_opinion, p_show_tier3, now())
  on conflict (user_id) do update set
    countries = excluded.countries,
    show_opinion = excluded.show_opinion,
    show_tier3 = excluded.show_tier3,
    onboarded_at = coalesce(public.reader_preferences.onboarded_at, excluded.onboarded_at);

  delete from public.reader_topics where user_id = uid;
  insert into public.reader_topics (user_id, topic_id, choice)
  select uid, t, 'follow' from unnest(coalesce(p_follow_topics, '{}')) as t
  union
  -- Following wins over muting if a topic is somehow in both.
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
