-- A row per pipeline round, for the desk (when did it last run, did it fail) and for alerts.
create table public.pipeline_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  ok boolean not null,
  summary text check (char_length(summary) <= 1000),
  error text check (char_length(error) <= 500),
  duration_ms integer
);
create index pipeline_runs_recent on public.pipeline_runs (started_at desc);
alter table public.pipeline_runs enable row level security;
create policy "Editors read pipeline runs" on public.pipeline_runs for select
  to authenticated using ((select public.is_editor()));
revoke insert, update, delete, truncate on public.pipeline_runs from anon, authenticated;
