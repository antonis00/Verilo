-- The sections bar's order is now the order of the topics a reader follows (dragged in My News),
-- so it holds as many as they follow: up to 100, not 20.
alter table public.reader_preferences drop constraint reader_preferences_menu_topics_check;
alter table public.reader_preferences add constraint reader_preferences_menu_topics_check
  check (cardinality(menu_topics) <= 100);
