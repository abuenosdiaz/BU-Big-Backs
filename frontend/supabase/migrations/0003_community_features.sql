ALTER TABLE public.dishes ADD COLUMN meal text NOT NULL DEFAULT 'Lunch';
ALTER TABLE public.dishes ADD COLUMN nutrition jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.dishes SET meal='Breakfast' WHERE id='east-pancakes';
UPDATE public.dishes SET meal='Dinner' WHERE id IN ('west-mac','east-burger','east-ramen','fenway-tacos');
UPDATE public.dishes SET nutrition = jsonb_build_object(
  'serving', '1 plate',
  'fat', round(calories*0.035), 'satFat', round(calories*0.012), 'chol', round(calories*0.09),
  'sodium', round(calories*1.3), 'carbs', round(calories*0.11), 'fiber', round(calories*0.008),
  'sugars', round(calories*0.015), 'protein', round(calories*0.045));

CREATE TABLE public.dish_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id text NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  tried boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, dish_id, body, tried, created_at), INSERT ON public.dish_comments TO anon, authenticated;
GRANT ALL ON public.dish_comments TO service_role;
ALTER TABLE public.dish_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read" ON public.dish_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "comments insert" ON public.dish_comments FOR INSERT TO anon, authenticated WITH CHECK (tried = true);

CREATE TABLE public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hall text NOT NULL,
  topic text NOT NULL DEFAULT 'General',
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, hall, topic, title, body, created_at), INSERT ON public.forum_posts TO anon, authenticated;
GRANT ALL ON public.forum_posts TO service_role;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read" ON public.forum_posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "posts insert" ON public.forum_posts FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.meal_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id text NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  overall int NOT NULL CHECK (overall BETWEEN 1 AND 5),
  taste text, portion text, temperature text, wait text, again text,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.meal_ratings TO anon, authenticated;
GRANT ALL ON public.meal_ratings TO service_role;
ALTER TABLE public.meal_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ratings insert" ON public.meal_ratings FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.item_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'new',
  item text NOT NULL CHECK (char_length(item) BETWEEN 1 AND 140),
  hall text NOT NULL DEFAULT 'Any hall',
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  status text NOT NULL DEFAULT 'Open',
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, kind, item, hall, reason, status, created_at), INSERT ON public.item_requests TO anon, authenticated;
GRANT ALL ON public.item_requests TO service_role;
ALTER TABLE public.item_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests read" ON public.item_requests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "requests insert" ON public.item_requests FOR INSERT TO anon, authenticated WITH CHECK (status = 'Open');

CREATE TABLE public.request_votes (
  request_id uuid NOT NULL REFERENCES public.item_requests(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  PRIMARY KEY (request_id, device_id)
);
GRANT ALL ON public.request_votes TO service_role;
ALTER TABLE public.request_votes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_requests(p_device uuid)
RETURNS TABLE (id uuid, kind text, item text, hall text, status text, created_at timestamptz, votes bigint, voted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.kind, r.item, r.hall, r.status, r.created_at,
    (SELECT count(*) FROM request_votes v WHERE v.request_id = r.id),
    EXISTS (SELECT 1 FROM request_votes v WHERE v.request_id = r.id AND v.device_id = p_device)
  FROM item_requests r;
$$;
CREATE OR REPLACE FUNCTION public.toggle_request_vote(p_request uuid, p_device uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM request_votes WHERE request_id = p_request AND device_id = p_device) THEN
    DELETE FROM request_votes WHERE request_id = p_request AND device_id = p_device;
    RETURN false;
  END IF;
  INSERT INTO request_votes VALUES (p_request, p_device);
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.delete_my_content(p_device uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM dish_comments WHERE device_id = p_device;
  DELETE FROM forum_posts WHERE device_id = p_device;
$$;
GRANT EXECUTE ON FUNCTION public.get_requests(uuid), public.toggle_request_vote(uuid, uuid), public.delete_my_content(uuid) TO anon, authenticated;

INSERT INTO public.forum_posts (hall, topic, title, body, device_id, created_at) VALUES
('West Campus','Lines & wait times','Grill line at 6pm is brutal','Tip: go at 5:15 and it''s basically empty. After 6 you''re waiting 20 min.', gen_random_uuid(), now() - interval '2 hours'),
('West Campus','Seating','Upstairs window seats are the move','Quiet, great view of the river, nobody seems to know about them.', gen_random_uuid(), now() - interval '1 day'),
('West Campus','Staff shoutouts','Shoutout to the late-night grill crew','Always friendly even at 11pm during finals week.', gen_random_uuid(), now() - interval '3 days'),
('Warren Towers','General','Brunch on Sundays is underrated','The waffle station alone is worth the walk down.', gen_random_uuid(), now() - interval '5 hours'),
('Marciano Commons','Seating','Hard to find a table at noon','Any hidden spots? Lunch rush is wild.', gen_random_uuid(), now() - interval '8 hours'),
('Fenway','General','Smaller but cozy','Fenway has the best vibe of any hall, change my mind.', gen_random_uuid(), now() - interval '2 days'),
('GSU','Lines & wait times','Poke bar moves fast now','They added a second line, way better.', gen_random_uuid(), now() - interval '6 hours');

INSERT INTO public.item_requests (kind, item, hall, reason, status, device_id) VALUES
('new','Build-your-own poke bowl','Any hall','Healthy and customizable','Under review', gen_random_uuid()),
('back','Chicken tikka masala','Warren Towers','Bring it back please','Added to menu', gen_random_uuid()),
('new','Vegan breakfast burrito','Fenway','Hard to find vegan breakfast','Open', gen_random_uuid());

INSERT INTO public.dish_comments (dish_id, body, device_id, created_at) VALUES
('west-chicken-bowl','Honestly the best thing at West. Ask for extra garlic yogurt.', gen_random_uuid(), now() - interval '3 hours'),
('east-burger','Hits every time after a late class.', gen_random_uuid(), now() - interval '1 day'),
('central-poke','Fresh, filling, worth the swipe.', gen_random_uuid(), now() - interval '2 days');