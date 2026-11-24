-- The daily briefing, made safe to run at any scale (Nov 2026 review):
-- - It's opt-in: no settings row, or `enabled` off, means no email. Turning it on records when the
--   reader agreed (consented_at). Before, a missing row counted as "on", and a reader whose row
--   fell past PostgREST's 1,000-row page could be emailed after unsubscribing.
-- - Who is due is worked out here, in one query, a page at a time (due_briefings), with each
--   reader's email, so the app never lists every reader.
-- - A send that failed, or got stuck half way (the run was cut off), is tried again, up to 3 times.

alter table public.digest_settings
  alter column enabled set default false,
  add column consented_at timestamptz;

-- Readers who already had it on chose it in settings or by finishing the wizard before it asked.
update public.digest_settings set consented_at = updated_at where enabled;

alter table public.digests add column attempts smallint not null default 1;

create function public.due_briefings(
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
  select ds.user_id, u.email::text, ds.length,
         (p_now at time zone ds.time_zone)::date
  from public.digest_settings ds
  join auth.users u on u.id = ds.user_id
  join public.reader_preferences rp on rp.user_id = ds.user_id and rp.onboarded_at is not null
  where ds.enabled
    and u.email is not null
    and ds.time_zone in (select name from pg_catalog.pg_timezone_names)
    and (p_only is null or ds.user_id = any (p_only))
    and extract(hour from p_now at time zone ds.time_zone) >= ds.send_hour
    and extract(hour from p_now at time zone ds.time_zone) < ds.send_hour + 3
    and not exists (
      select 1 from public.digests d
      where d.user_id = ds.user_id
        and d.local_date = (p_now at time zone ds.time_zone)::date
        and not (
          (d.status = 'failed' and d.attempts < 3)
          or (d.status = 'sending' and d.created_at < p_now - interval '15 minutes')
        )
    )
  order by ds.user_id
  limit greatest(1, least(p_limit, 1000));
$$;

-- Claims a reader's briefing for a day: a new row, or a retry of a failed or stuck one. Returns
-- the row's id, or nothing when it's already sent, being sent, or out of attempts.
create function public.claim_briefing(p_user uuid, p_date date)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.digests (user_id, local_date, status)
  values (p_user, p_date, 'sending')
  on conflict (user_id, local_date) do update
    set status = 'sending', attempts = public.digests.attempts + 1, created_at = now(),
        error = null
    where (public.digests.status = 'failed' and public.digests.attempts < 3)
       or (public.digests.status = 'sending'
           and public.digests.created_at < now() - interval '15 minutes')
  returning id;
$$;

revoke execute on function public.due_briefings, public.claim_briefing
  from public, anon, authenticated;
grant execute on function public.due_briefings, public.claim_briefing to service_role;
