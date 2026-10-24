import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { guessAllergens } from "@/lib/allergens";
import { getMenu, type MenuRow } from "@/lib/api";
import aiPhotos from "@/lib/dish-images.json";

const images = import.meta.glob("@/assets/dishes/*.jpg", { eager: true, import: "default" }) as Record<
  string,
  string
>;

// The menu API has no photos, so a dish shows one of these photos only when the
// photo is really that dish. Dish names end with what the dish is ("Blueberry
// Pancake", "Chicken Noodle Soup"), so the words must end the name. No match, no photo.
const PHOTO_KEYWORDS: [photo: string, words: string][] = [
  ["west-mac", "mac (?:&|and) cheese|macaroni (?:&|and) cheese"],
  ["central-pizza", "pizza"],
  ["east-pancakes", "pancake"],
  ["central-poke", "poke bowl"],
  ["central-falafel", "falafel|falafel pita"],
  ["fenway-tacos", "taco"],
  ["east-burger", "burger|cheeseburger"],
  ["east-ramen", "ramen"],
  ["west-tofu", "sesame tofu|crispy tofu|tofu stir[- ]fry|tofu vegetable stir[- ]fry"],
  ["fenway-cookie", "cookie"],
  ["fenway-buddha", "buddha bowl|grain bowl"],
  ["west-chicken-bowl", "grilled chicken|chicken breast"],
];
const PHOTO_PATTERNS = PHOTO_KEYWORDS.map(
  ([photo, words]) => [photo, new RegExp(`\\b(?:${words})(?:e?s)?$`, "i")] as const,
);

/** File name for a dish's AI photo; must match slug() in scripts/generate-dish-images.mjs. */
function dishSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const AI_PHOTOS = new Set<string>(aiPhotos);

export function dishImage(name: string) {
  // AI photos made by `npm run images` win; otherwise fall back to a matching category photo.
  const s = dishSlug(name);
  if (AI_PHOTOS.has(s)) return `/dishes/ai/${s}.jpg`;
  const photo = PHOTO_PATTERNS.find(([, re]) => re.test(name.trim()))?.[0];
  const key = photo && Object.keys(images).find((k) => k.endsWith(`/${photo}.jpg`));
  return key ? images[key] : undefined;
}

export const CAMPUSES = ["West Campus", "Central Campus", "East Campus"] as const;

/** Meal names from the menu API, in serving order. */
export const MEALS = ["Breakfast", "Brunch", "Lunch", "Dinner"] as const;

export type Nutrition = {
  serving?: string;
  fat?: number;
  satFat?: number;
  chol?: number;
  sodium?: number;
  carbs?: number;
  fiber?: number;
  sugars?: number;
  protein?: number;
};

export type Dish = {
  id: string;
  name: string;
  campus: string;
  hall: string;
  station: string;
  calories: number;
  tags: string[];
  allergens: string[];
  description: string;
  ingredients: string[];
  sort: number;
  /** First meal it's served at today */
  meal: string;
  /** Every meal it's served at today, in serving order */
  meals: string[];
  nutrition: Nutrition;
  loves: number;
  loved: boolean;
  comments: number;
};

const DEVICE_KEY = "bb-device-id";

export function getDeviceId() {
  let v = localStorage.getItem(DEVICE_KEY);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, v);
  }
  return v;
}

export function useDeviceId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(getDeviceId()), []);
  return id;
}

const DIET_TAGS = [
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["gluten_free", "Gluten-free"],
  ["halal", "Halal"],
] as const;

/** Today's date in Boston, as the API's YYYY-MM-DD service date. */
function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// An item can be served at several halls, so the dish id includes the hall.
function toDish(r: MenuRow, sort: number): Omit<Dish, "loves" | "loved" | "comments"> {
  return {
    id: `${r.location_id}-${r.item_id}`,
    name: r.item_name,
    campus: r.campus,
    hall: r.location_name,
    station: r.station,
    calories: r.calories ?? 0,
    tags: DIET_TAGS.filter(([k]) => r[k]).map(([, label]) => label),
    allergens: guessAllergens(r),
    description: r.description && r.description !== "null" ? r.description : "",
    ingredients: [],
    sort,
    meal: r.meal,
    meals: [r.meal],
    nutrition: Object.fromEntries(
      [
        ["carbs", r.carbohydrates_grams],
        ["protein", r.protein_grams],
        ["satFat", r.saturated_fat_grams],
      ].filter(([, v]) => v != null),
    ) as Nutrition,
  };
}

export function useDishes() {
  const device = useDeviceId();
  return useQuery({
    queryKey: ["dishes", device],
    enabled: !!device,
    queryFn: async () => {
      const [menu, stats] = await Promise.all([
        getMenu({ date: today() }),
        supabase.rpc("get_dish_stats", { p_device: device! }),
      ]);
      // Votes are optional: still show the menu if Supabase is unavailable.
      if (stats.error) console.warn("Couldn't load dish votes:", stats.error.message);
      const votes = new Map((stats.data ?? []).map((s) => [s.dish_id, s]));
      const dishes = new Map<string, Dish>();
      menu.rows.forEach((r, i) => {
        const d = toDish(r, i);
        const seen = dishes.get(d.id);
        if (seen) {
          if (!seen.meals.includes(r.meal)) seen.meals.push(r.meal);
          return;
        }
        const v = votes.get(d.id);
        dishes.set(d.id, {
          ...d,
          loves: Number(v?.loves ?? 0),
          loved: !!v?.loved,
          comments: Number(v?.comments ?? 0),
        });
      });
      return [...dishes.values()];
    },
  });
}

export function useToggleLove() {
  const device = useDeviceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase.rpc("toggle_love", { p_dish: dishId, p_device: device! });
      if (error) throw error;
    },
    onMutate: async (dishId) => {
      const key = ["dishes", device];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Dish[]>(key);
      qc.setQueryData<Dish[]>(key, (old) =>
        old?.map((d) =>
          d.id === dishId ? { ...d, loved: !d.loved, loves: d.loves + (d.loved ? -1 : 1) } : d,
        ),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["dishes", device], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["dishes"] }),
  });
}

export function rankByCampus(dishes: Dish[], campus: string) {
  return dishes
    .filter((d) => d.campus === campus)
    .sort((a, b) => b.loves - a.loves || a.sort - b.sort);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
