-- due_briefings, two fixes (found by workers/tests/test_briefing_db.py):
-- - Settings with a time zone Postgres doesn't know are filtered out first, in their own step:
--   the planner may otherwise convert times before filtering, and one bad zone fails the run.
-- - "Stuck for 15 minutes" is measured on the real clock, as claim_briefing does, not against
--   the moment asked about (tests ask about other moments).

create or replace function public.due_briefings(
  p_now timestamptz,
  p_only uuid[] default null,
  p_limit integer default 200
)
returns table (user_id uuid, email text, send_length text, local_date date)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as materialized (
    select ds.user_id, ds.send_hour, ds.length, ds.time_zone
    from public.digest_settings ds
    where ds.enabled
      and ds.time_zone in (select name from pg_catalog.pg_timezone_names)
      and (p_only is null or ds.user_id = any (p_only))
  ),
  local as materialized (
    select c.*, (p_now at time zone c.time_zone) as at_local from candidates c
  )
  select l.user_id, u.email::text, l.length, l.at_local::date
  from local l
  join auth.users u on u.id = l.user_id
  join public.reader_preferences rp on rp.user_id = l.user_id and rp.onboarded_at is not null
  where u.email is not null
    and extract(hour from l.at_local) >= l.send_hour
    and extract(hour from l.at_local) < l.send_hour + 3
    and not exists (
      select 1 from public.digests d
      where d.user_id = l.user_id
        and d.local_date = l.at_local::date
        and not (
          (d.status = 'failed' and d.attempts < 3)
          or (d.status = 'sending' and d.created_at < now() - interval '15 minutes')
        )
    )
  order by l.user_id
  limit greatest(1, least(p_limit, 1000));
$$;

revoke execute on function public.due_briefings from public, anon, authenticated;
grant execute on function public.due_briefings to service_role;
