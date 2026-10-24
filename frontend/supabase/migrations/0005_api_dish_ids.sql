-- Dishes now come from the menu API (backend/API.md), so votes, comments and
-- ratings are keyed by the API's item ids instead of rows in public.dishes.
ALTER TABLE public.dish_loves DROP CONSTRAINT IF EXISTS dish_loves_dish_id_fkey;
ALTER TABLE public.dish_comments DROP CONSTRAINT IF EXISTS dish_comments_dish_id_fkey;
ALTER TABLE public.meal_ratings DROP CONSTRAINT IF EXISTS meal_ratings_dish_id_fkey;

-- Love/comment counts for every dish id that has any, plus whether this device loved it.
CREATE OR REPLACE FUNCTION public.get_dish_stats(p_device uuid)
RETURNS TABLE (dish_id text, loves bigint, loved boolean, comments bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ids.dish_id,
    (SELECT count(*) FROM dish_loves l WHERE l.dish_id = ids.dish_id),
    EXISTS (SELECT 1 FROM dish_loves l WHERE l.dish_id = ids.dish_id AND l.device_id = p_device),
    (SELECT count(*) FROM dish_comments c WHERE c.dish_id = ids.dish_id)
  FROM (SELECT dish_id FROM dish_loves UNION SELECT dish_id FROM dish_comments) ids;
$$;
GRANT EXECUTE ON FUNCTION public.get_dish_stats(uuid) TO anon, authenticated;
