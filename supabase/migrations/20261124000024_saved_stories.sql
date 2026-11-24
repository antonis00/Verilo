-- Stories a reader saved to read later.
create table public.saved_stories (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id bigint not null references public.stories (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create index saved_stories_by_reader on public.saved_stories (user_id, saved_at desc);
alter table public.saved_stories enable row level security;
create policy "Own saved stories" on public.saved_stories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.saved_stories from anon;
revoke truncate on public.saved_stories from authenticated;
