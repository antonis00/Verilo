-- Trial reminders: an email when 4 days of the free trial are left, and when 1 is left. Each at
-- most once per reader (the primary key), decided here like the briefing (due_briefings).

create table public.trial_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('4-days', '1-day')),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.trial_reminders enable row level security;
create policy "Readers read their trial reminders" on public.trial_reminders for select
  to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.trial_reminders from anon, authenticated;

-- Readers due a reminder at p_now: in their trial, not subscribed, with an email, and not yet sent
-- this reminder. '4-days' when 3 to 4 days are left, '1-day' when less than 1 is.
create function public.due_trial_reminders(
  p_now timestamptz,
  p_only uuid[] default null,
  p_limit integer default 200
)
returns table (user_id uuid, email text, kind text, trial_ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with due as (
    select p.id, u.email::text as email, p.trial_ends_at,
           case
             when p.trial_ends_at - p_now > interval '3 days'
              and p.trial_ends_at - p_now <= interval '4 days' then '4-days'
             when p.trial_ends_at > p_now
              and p.trial_ends_at - p_now <= interval '1 day' then '1-day'
           end as kind
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email is not null
      and (p.subscribed_until is null or p.subscribed_until <= p_now)
      and (p_only is null or p.id = any (p_only))
  )
  select d.id, d.email, d.kind, d.trial_ends_at
  from due d
  where d.kind is not null
    and not exists (
      select 1 from public.trial_reminders r where r.user_id = d.id and r.kind = d.kind
    )
  order by d.id
  limit greatest(1, least(p_limit, 1000));
$$;

-- Claims a reminder: true if this call is the one to send it.
create function public.claim_trial_reminder(p_user uuid, p_kind text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    insert into public.trial_reminders (user_id, kind) values (p_user, p_kind)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke execute on function public.due_trial_reminders, public.claim_trial_reminder
  from public, anon, authenticated;
grant execute on function public.due_trial_reminders, public.claim_trial_reminder to service_role;
