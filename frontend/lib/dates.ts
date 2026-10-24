// All dining halls are at BU, so every date and meal is computed in Boston
// time, regardless of where the user's device thinks it is.
const TZ = "America/New_York";

/**
 * Returns today's date in Boston as YYYY-MM-DD (e.g. "2026-10-24"),
 * the format the `date` columns in Supabase use.
 */
export function todayNY() {
  // The en-CA locale formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/**
 * Returns the meal being served right now in Boston, used to pick
 * which meal to show by default.
 *
 * Cutoffs are approximate and don't account for weekend brunch.
 */
export function currentMealName() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date())
  );
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  return "dinner";
}

/**
 * Normalizes a dish name into the key votes are stored under.
 *
 * Example: "  Chicken  Parm " -> "chicken parm". Votes are keyed by name,
 * not by menu item ID, so a dish keeps its votes when it comes back on a
 * later day's rotation.
 */
export const dishKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
