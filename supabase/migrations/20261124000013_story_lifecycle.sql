-- Stories have a life (cluster/stories.py MAX_SPAN): coverage after it starts a new story that
-- follows the earlier one, so story pages can link the developments in order.

alter table public.stories
  add column follows bigint references public.stories (id) on delete set null;

create index stories_follows on public.stories (follows) where follows is not null;
