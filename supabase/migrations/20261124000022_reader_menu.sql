-- The reader's own sections menu (the horizontal bar): which topics, in their order. Empty (null)
-- means the default: the topics they follow first, then the featured ones.
alter table public.reader_preferences
  add column menu_topics bigint[] check (cardinality(menu_topics) <= 20);
