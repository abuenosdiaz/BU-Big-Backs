// Shared data shapes for menus and votes.
// A Menu nests as: Menu -> Meal -> Station -> MenuItem.

/** A single dish. Nutrition fields are null when the dining data doesn't list them. */
export type MenuItem = {
  id: string;
  name: string;
  calories?: number | null;
  vegetarian?: boolean | null;
  vegan?: boolean | null;
  gluten_free?: boolean | null;
  halal?: boolean | null;
};

/** A counter within a meal, e.g. "Grill" or "Salad Bar". */
export type Station = { name: string; items: MenuItem[] };

/** One service period, e.g. "lunch". */
export type Meal = { name: string; stations: Station[] };

/** Everything one hall serves on one day. `date` is YYYY-MM-DD. */
export type Menu = { hall: string; date: string; meals: Meal[] };

/** 1 = upvote, -1 = downvote. */
export type Vote = 1 | -1;
