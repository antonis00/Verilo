-- A larger topic catalog: a few featured topics shown as chips and in the section menu, the rest
-- found by searching (by name or aliases). A narrower topic can have a parent it also counts for
-- (Football for Sport); such tags are recorded with the method 'parent'.

alter table public.topics
  add column featured boolean not null default false,
  add column aliases text[] not null default '{}',
  add column parent_id bigint references public.topics (id) on delete set null;

alter table public.article_topics drop constraint article_topics_method_check;
alter table public.article_topics add constraint article_topics_method_check
  check (method in ('embedding', 'section', 'parent'));
