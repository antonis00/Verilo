-- Two more kinds of article (enrich/kind.py): 'analysis' (labelled, never summarised) and 'live'
-- (live blogs, newsletters, podcasts, videos and briefs: they join no story).
alter table public.articles drop constraint articles_kind_check;
alter table public.articles add constraint articles_kind_check
  check (kind in ('news', 'opinion', 'analysis', 'live', 'sponsored'));
