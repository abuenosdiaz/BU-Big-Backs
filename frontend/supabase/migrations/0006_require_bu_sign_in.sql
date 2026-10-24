-- Posting and voting now need a BU Google account. Reading stays public.
-- device_id keeps its name but now holds the signed-in user's id (auth.uid()),
-- filled in by the database so the browser can't pick someone else's.
CREATE OR REPLACE FUNCTION public.is_bu_user()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL AND coalesce(auth.jwt() ->> 'email', '') ILIKE '%@bu.edu';
$$;
GRANT EXECUTE ON FUNCTION public.is_bu_user() TO anon, authenticated;

ALTER TABLE public.dish_comments ALTER COLUMN device_id SET DEFAULT auth.uid();
ALTER TABLE public.forum_posts ALTER COLUMN device_id SET DEFAULT auth.uid();
ALTER TABLE public.meal_ratings ALTER COLUMN device_id SET DEFAULT auth.uid();
ALTER TABLE public.item_requests ALTER COLUMN device_id SET DEFAULT auth.uid();

REVOKE INSERT ON public.dish_comments, public.forum_posts, public.meal_ratings, public.item_requests FROM anon;

DROP POLICY "comments insert" ON public.dish_comments;
CREATE POLICY "comments insert" ON public.dish_comments FOR INSERT TO authenticated
  WITH CHECK (tried = true AND device_id = auth.uid() AND public.is_bu_user());
DROP POLICY "posts insert" ON public.forum_posts;
CREATE POLICY "posts insert" ON public.forum_posts FOR INSERT TO authenticated
  WITH CHECK (device_id = auth.uid() AND public.is_bu_user());
DROP POLICY "ratings insert" ON public.meal_ratings;
CREATE POLICY "ratings insert" ON public.meal_ratings FOR INSERT TO authenticated
  WITH CHECK (device_id = auth.uid() AND public.is_bu_user());
DROP POLICY "requests insert" ON public.item_requests;
CREATE POLICY "requests insert" ON public.item_requests FOR INSERT TO authenticated
  WITH CHECK (status = 'Open' AND device_id = auth.uid() AND public.is_bu_user());

-- The vote functions take the voter from the session instead of a parameter.
DROP FUNCTION public.get_dish_stats(uuid);
DROP FUNCTION public.toggle_love(text, uuid);
DROP FUNCTION public.get_requests(uuid);
DROP FUNCTION public.toggle_request_vote(uuid, uuid);
DROP FUNCTION public.delete_my_content(uuid);
-- Unused since 0005 (dishes come from the menu API).
DROP FUNCTION IF EXISTS public.get_dishes(uuid);
DROP FUNCTION IF EXISTS public.get_menu(uuid);

CREATE FUNCTION public.get_dish_stats()
RETURNS TABLE (dish_id text, loves bigint, loved boolean, comments bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ids.dish_id,
    (SELECT count(*) FROM dish_loves l WHERE l.dish_id = ids.dish_id),
    EXISTS (SELECT 1 FROM dish_loves l WHERE l.dish_id = ids.dish_id AND l.device_id = auth.uid()),
    (SELECT count(*) FROM dish_comments c WHERE c.dish_id = ids.dish_id)
  FROM (SELECT dish_id FROM dish_loves UNION SELECT dish_id FROM dish_comments) ids;
$$;

CREATE FUNCTION public.toggle_love(p_dish text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_bu_user() THEN RAISE EXCEPTION 'Sign in with a BU Google account to vote' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM dish_loves WHERE dish_id = p_dish AND device_id = auth.uid()) THEN
    DELETE FROM dish_loves WHERE dish_id = p_dish AND device_id = auth.uid();
    RETURN false;
  END IF;
  INSERT INTO dish_loves (dish_id, device_id) VALUES (p_dish, auth.uid());
  RETURN true;
END $$;

CREATE FUNCTION public.get_requests()
RETURNS TABLE (id uuid, kind text, item text, hall text, status text, created_at timestamptz, votes bigint, voted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.kind, r.item, r.hall, r.status, r.created_at,
    (SELECT count(*) FROM request_votes v WHERE v.request_id = r.id),
    EXISTS (SELECT 1 FROM request_votes v WHERE v.request_id = r.id AND v.device_id = auth.uid())
  FROM item_requests r;
$$;

CREATE FUNCTION public.toggle_request_vote(p_request uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_bu_user() THEN RAISE EXCEPTION 'Sign in with a BU Google account to vote' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM request_votes WHERE request_id = p_request AND device_id = auth.uid()) THEN
    DELETE FROM request_votes WHERE request_id = p_request AND device_id = auth.uid();
    RETURN false;
  END IF;
  INSERT INTO request_votes VALUES (p_request, auth.uid());
  RETURN true;
END $$;

CREATE FUNCTION public.delete_my_content()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM dish_comments WHERE device_id = auth.uid();
  DELETE FROM forum_posts WHERE device_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_dish_stats(), public.get_requests() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_love(text), public.toggle_request_vote(uuid), public.delete_my_content() TO authenticated;
