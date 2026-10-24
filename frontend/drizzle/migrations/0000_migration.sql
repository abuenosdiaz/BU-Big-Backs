CREATE TABLE public.dishes (
  id text PRIMARY KEY,
  name text NOT NULL,
  campus text NOT NULL,
  hall text NOT NULL,
  station text NOT NULL,
  calories int NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  allergens text[] NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '',
  ingredients text[] NOT NULL DEFAULT '{}',
  sort int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.dishes TO anon, authenticated;
GRANT ALL ON public.dishes TO service_role;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dishes public read" ON public.dishes FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.dish_loves (
  dish_id text NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dish_id, device_id)
);
GRANT ALL ON public.dish_loves TO service_role;
ALTER TABLE public.dish_loves ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_dishes(p_device uuid)
RETURNS TABLE (id text, name text, campus text, hall text, station text, calories int, tags text[], allergens text[], description text, ingredients text[], sort int, loves bigint, loved boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.name, d.campus, d.hall, d.station, d.calories, d.tags, d.allergens, d.description, d.ingredients, d.sort,
    (SELECT count(*) FROM dish_loves l WHERE l.dish_id = d.id),
    EXISTS (SELECT 1 FROM dish_loves l WHERE l.dish_id = d.id AND l.device_id = p_device)
  FROM dishes d;
$$;

CREATE OR REPLACE FUNCTION public.toggle_love(p_dish text, p_device uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM dish_loves WHERE dish_id = p_dish AND device_id = p_device) THEN
    DELETE FROM dish_loves WHERE dish_id = p_dish AND device_id = p_device;
    RETURN false;
  END IF;
  INSERT INTO dish_loves (dish_id, device_id) VALUES (p_dish, p_device);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.get_dishes(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_love(text, uuid) TO anon, authenticated;

INSERT INTO public.dishes (id,name,campus,hall,station,calories,tags,allergens,description,ingredients,sort) VALUES
('west-chicken-bowl','Lemon Herb Chicken Bowl','West Campus','West Campus Dining Hall','Grill',620,'{Halal,Gluten-free}','{}','Charred lemon-herb chicken over jasmine rice with roasted veggies and garlic yogurt.','{Chicken thigh,Jasmine rice,Zucchini,Red pepper,Lemon,Garlic yogurt}',1),
('west-mac','Truffle Mac & Cheese','West Campus','West Campus Dining Hall','Comfort',780,'{Vegetarian}','{Milk,Wheat}','Creamy three-cheese mac with a crispy panko top and a touch of truffle.','{Cavatappi,Cheddar,Gruyère,Panko,Truffle oil}',2),
('west-tofu','Sesame Ginger Tofu Stir-fry','West Campus','West Campus Dining Hall','Wok',540,'{Vegan}','{Soy,Sesame}','Crispy tofu tossed with broccoli, snap peas and sesame-ginger sauce.','{Tofu,Broccoli,Snap peas,Ginger,Sesame,Brown rice}',3),
('central-pizza','Margherita Flatbread','Central','Marciano Commons','Brick Oven',690,'{Vegetarian}','{Milk,Wheat}','Blistered flatbread with San Marzano tomato, fresh mozzarella and basil.','{Flatbread dough,Tomato,Mozzarella,Basil,Olive oil}',1),
('central-poke','Salmon Poke Bowl','Central','GSU','Poke Bar',580,'{Gluten-free}','{Fish,Soy}','Sushi rice, marinated salmon, avocado, edamame and spicy mayo.','{Salmon,Sushi rice,Avocado,Edamame,Cucumber,Spicy mayo}',2),
('central-falafel','Falafel Wrap','Central','Marciano Commons','Mediterranean',610,'{Vegan,Halal}','{Wheat,Sesame}','Crispy falafel, pickled onions, tahini and greens in a warm wrap.','{Chickpeas,Herbs,Tahini,Pickled onion,Lettuce,Lavash}',3),
('east-burger','Smash Burger','East','Warren Towers','Grill',850,'{Halal}','{Milk,Wheat}','Two smashed beef patties, American cheese, pickles and house sauce.','{Beef,American cheese,Brioche bun,Pickles,House sauce}',1),
('east-ramen','Spicy Miso Ramen','East','Warren Towers','Noodle Bar',640,'{Vegetarian}','{Wheat,Soy,Egg}','Rich spicy miso broth with noodles, corn, scallions and a jammy egg.','{Ramen noodles,Miso,Corn,Scallion,Soft egg,Chili oil}',2),
('east-pancakes','Blueberry Pancakes','East','Warren Towers','Breakfast',520,'{Vegetarian}','{Milk,Wheat,Egg}','Fluffy buttermilk pancakes loaded with blueberries and maple syrup.','{Buttermilk,Flour,Blueberries,Maple syrup,Butter}',3),
('fenway-tacos','Carnitas Tacos','Fenway','Fenway Dining Hall','Cantina',590,'{Gluten-free}','{}','Slow-cooked pork carnitas on corn tortillas with salsa verde.','{Pork shoulder,Corn tortillas,Salsa verde,Onion,Cilantro}',1),
('fenway-buddha','Harvest Buddha Bowl','Fenway','Fenway Dining Hall','Salad Bar',490,'{Vegan,Gluten-free}','{}','Quinoa, roasted sweet potato, kale, chickpeas and maple-tahini dressing.','{Quinoa,Sweet potato,Kale,Chickpeas,Tahini}',2),
('fenway-cookie','Brown Butter Cookie','Fenway','Fenway Dining Hall','Bakery',310,'{Vegetarian}','{Milk,Wheat,Egg}','Warm chocolate chunk cookie made with brown butter and flaky salt.','{Brown butter,Flour,Dark chocolate,Sea salt}',3);