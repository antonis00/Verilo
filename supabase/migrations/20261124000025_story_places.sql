-- Where each story happens (enrich/llm_places.py): the regions it is about, or 'global'.
alter table public.stories
  add column places text[] check (places <@ array['north-america', 'uk-ireland', 'europe',
    'middle-east', 'africa', 'south-asia', 'east-asia', 'southeast-asia', 'oceania',
    'latin-america', 'global']::text[] and cardinality(places) <= 2),
  add column places_at timestamptz,
  add column places_articles integer;

-- Readers may read only listed columns of stories (migration 03).
grant select (places) on public.stories to anon, authenticated;
