CREATE OR REPLACE FUNCTION public.get_menu(p_device uuid)
RETURNS TABLE (id text, name text, campus text, hall text, station text, calories int, tags text[], allergens text[], description text, ingredients text[], sort int, meal text, nutrition jsonb, loves bigint, loved boolean, comments bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.name, d.campus, d.hall, d.station, d.calories, d.tags, d.allergens, d.description, d.ingredients, d.sort, d.meal, d.nutrition,
    (SELECT count(*) FROM dish_loves l WHERE l.dish_id = d.id),
    EXISTS (SELECT 1 FROM dish_loves l WHERE l.dish_id = d.id AND l.device_id = p_device),
    (SELECT count(*) FROM dish_comments c WHERE c.dish_id = d.id)
  FROM dishes d;
$$;
GRANT EXECUTE ON FUNCTION public.get_menu(uuid) TO anon, authenticated;