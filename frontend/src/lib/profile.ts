import { useCallback, useEffect, useState } from "react";
import type { Allergen } from "./api";
import type { Dish } from "./dishes";

export const DIETS = ["Vegetarian", "Vegan", "Halal", "Gluten-free"] as const;

/** "Avoid" choices and the menu API allergen category each one excludes. */
const AVOID_TO_ALLERGEN: Record<string, Allergen> = {
  Peanuts: "peanut",
  "Tree nuts": "tree_nuts",
  Dairy: "dairy",
  Eggs: "egg",
  Fish: "fish",
  Shellfish: "shellfish",
  Wheat: "wheat",
  Gluten: "gluten",
  Soy: "soy",
  Sesame: "sesame",
  Mustard: "mustard",
  Sulfites: "sulfites",
};
export const AVOIDS = Object.keys(AVOID_TO_ALLERGEN);

/** API allergen categories for a list of "avoid" choices, for exclude_allergens. */
export function toAllergens(avoid: string[]) {
  return avoid.flatMap((a) => AVOID_TO_ALLERGEN[a] ?? []);
}

export type Profile = {
  name: string;
  year: string;
  homeHall: string;
  mealPlan: string;
  diets: string[];
  avoid: string[];
  hideMismatch: boolean;
  useLocation: boolean;
  walkLimit: number;
  notify: { starred: boolean; rateReminder: boolean; replies: boolean; requestAdded: boolean };
  starred: string[];
  disliked: string[];
  notifyMe: string[];
  history: { dishId: string; at: string }[];
};

export const DEFAULT_PROFILE: Profile = {
  name: "",
  year: "",
  homeHall: "West Campus",
  mealPlan: "",
  diets: [],
  avoid: [],
  hideMismatch: true,
  useLocation: true,
  walkLimit: 10,
  notify: { starred: true, rateReminder: true, replies: false, requestAdded: true },
  starred: [],
  disliked: [],
  notifyMe: [],
  history: [],
};

const KEY = "bb-profile";
const EVENT = "bb-profile-change";

function read(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(EVENT));
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setProfile(read());
    setReady(true);
    const on = () => setProfile(read());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const update = useCallback((fn: (p: Profile) => Profile) => saveProfile(fn(read())), []);
  return { profile, update, ready };
}

export function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function fitsDiet(dish: Dish, diets: string[]) {
  // Skip diets the menu can't tell us about (e.g. "Kosher" saved by older versions).
  const known = diets.filter((d) => (DIETS as readonly string[]).includes(d));
  return known.every((d) => {
    if (d === "Vegetarian") return dish.tags.includes("Vegetarian") || dish.tags.includes("Vegan");
    return dish.tags.includes(d);
  });
}

/** Diet check only: allergens are filtered by the API (pass profile.avoid to useDishes). */
export function fitsProfile(dish: Dish, p: Profile) {
  return fitsDiet(dish, p.diets);
}
