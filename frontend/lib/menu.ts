import mock from "@/mock/menu.json";
import { createClient } from "@/utils/supabase/client";
import type { Menu, Meal } from "./types";

// Set NEXT_PUBLIC_USE_MOCK=true in .env.local to develop without hitting Supabase
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

// Display order for meals; the database returns them in no particular order
const MEAL_ORDER = ["breakfast", "brunch", "lunch", "dinner"];

/**
 * Fetches one dining hall's menu for a single day.
 *
 * @param hall - Dining hall identifier, matching `menu_items.hall`
 * @param date - Day to fetch, matching `menu_items.date` (YYYY-MM-DD)
 * @returns The menu grouped as meals -> stations -> items
 * @throws The Supabase error if the query fails
 */
export async function getMenu(hall: string, date: string): Promise<Menu> {
  if (USE_MOCK) {
    return { hall, date, meals: (mock as { meals: Meal[] }).meals };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("meal, station, item_id, dish_name, calories, vegetarian, vegan, gluten_free, halal")
    .eq("hall", hall)
    .eq("date", date);
  if (error) throw error;

  // Supabase returns one flat row per dish; rebuild the nested
  // meals -> stations -> items shape the UI renders.
  const meals: Meal[] = [];
  for (const row of data ?? []) {
    // Find or create this row's meal
    let meal = meals.find((m) => m.name === row.meal);
    if (!meal) { meal = { name: row.meal, stations: [] }; meals.push(meal); }

    // Find or create this row's station; some dishes have no station
    const stationName = row.station ?? "Other";
    let station = meal.stations.find((s) => s.name === stationName);
    if (!station) { station = { name: stationName, items: [] }; meal.stations.push(station); }

    station.items.push({
      id: row.item_id ?? row.dish_name, // fall back to the name when the source has no ID
      name: row.dish_name,
      calories: row.calories,
      vegetarian: row.vegetarian,
      vegan: row.vegan,
      gluten_free: row.gluten_free,
      halal: row.halal,
    });
  }

  // Note: meals not listed in MEAL_ORDER get index -1 and sort to the front
  meals.sort((a, b) => MEAL_ORDER.indexOf(a.name.toLowerCase()) - MEAL_ORDER.indexOf(b.name.toLowerCase()));
  return { hall, date, meals };
}
