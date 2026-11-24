-- Reporting mistakes, and correcting them in public (design: "Report a mistake" on every summary,
-- a review queue, a public corrections page).
--
-- Anyone can report a mistake in a story's summary; reports are kept for editors only. An editor
-- can withdraw the summary (status 'withdrawn'): the story shows headlines and links again, and a
-- correction note saying what was wrong is shown on the story page and the corrections page.

alter table public.story_summaries drop constraint story_summaries_status_check;
alter table public.story_summaries add constraint story_summaries_status_check
  check (status in ('published', 'failed', 'superseded', 'withdrawn'));

create table public.summary_reports (
  id bigint generated always as identity primary key,
  story_id bigint not null references public.stories (id) on delete cascade,
  summary_id bigint references public.story_summaries (id) on delete set null,
  reader_id uuid references auth.users (id) on delete set null,
  note text not null check (char_length(note) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'withdrawn', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index summary_reports_open on public.summary_reports (created_at desc)
  where status = 'open';

create table public.corrections (
  id bigint generated always as identity primary key,
  story_id bigint not null references public.stories (id) on delete cascade,
  summary_id bigint references public.story_summaries (id) on delete set null,
  note text not null check (char_length(note) between 3 and 1000),
  created_at timestamptz not null default now()
);

create index corrections_by_story on public.corrections (story_id, created_at desc);
create index corrections_recent on public.corrections (created_at desc);

alter table public.summary_reports enable row level security;
alter table public.corrections enable row level security;

-- Reports are written by the server (it checks and rate-limits them) and read by editors.
create policy "Editors read reports" on public.summary_reports for select
  to authenticated using ((select public.is_editor()));
revoke insert, update, delete, truncate on public.summary_reports from anon, authenticated;

-- Corrections are public.
create policy "Anyone reads corrections" on public.corrections for select
  to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.corrections from anon, authenticated;
