-- Readers may read only listed columns of stories (migration 03); story_cards now shows
-- follows, the earlier story a story continues.
grant select (follows) on public.stories to anon, authenticated;
