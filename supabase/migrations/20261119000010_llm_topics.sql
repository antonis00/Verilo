-- Phase 4b: a language model tags the news articles the embedding matcher left without a topic.
-- Its tags are recorded with the method 'llm'; each article it has looked at is marked, whether
-- or not it found a topic, so it is never asked twice (a retag clears the mark).

alter table public.article_topics drop constraint article_topics_method_check;
alter table public.article_topics add constraint article_topics_method_check
  check (method in ('embedding', 'section', 'parent', 'llm'));

alter table public.articles add column topics_llm_at timestamptz;

create index articles_awaiting_llm_topics on public.articles (published_at desc)
  where topics_llm_at is null and kind = 'news';
