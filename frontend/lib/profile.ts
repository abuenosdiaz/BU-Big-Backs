import { useCallback, useSyncExternalStore } from "react";
import type { Dish } from "./dishes";

export const DIETS = ["Vegetarian", "Vegan", "Pescatarian", "Halal", "Kosher", "Gluten-free"] as const;
export const AVOIDS = ["Peanuts", "Tree nuts", "Dairy", "Eggs", "Shellfish", "Soy", "Sesame"] as const;

/** Maps "avoid" choices to allergen names stored on dishes. */
const AVOID_TO_ALLERGEN: Record<string, string> = {
  Peanuts: "Peanuts",
  "Tree nuts": "Tree nuts",
  Dairy: "Milk",
  Eggs: "Egg",
  Shellfish: "Shellfish",
  Soy: "Soy",
  Sesame: "Sesame",
};

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

// read() must return the same object until storage changes, so parse once per raw value.
let cachedRaw: string | null = null;
let cachedProfile: Profile = DEFAULT_PROFILE;

function read(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedProfile = raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
    }
    return cachedProfile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(EVENT));
}

export function useProfile() {
  const profile = useSyncExternalStore(subscribe, read, () => DEFAULT_PROFILE);
  // false during the server render and hydration, true once the saved profile is read
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const update = useCallback((fn: (p: Profile) => Profile) => saveProfile(fn(read())), []);
  return { profile, update, ready };
}

export function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function fitsDiet(dish: Dish, diets: string[]) {
  return diets.every((d) => {
    if (d === "Vegetarian") return dish.tags.includes("Vegetarian") || dish.tags.includes("Vegan");
    if (d === "Pescatarian")
      return dish.tags.includes("Vegetarian") || dish.tags.includes("Vegan") || dish.allergens.includes("Fish");
    return dish.tags.includes(d);
  });
}

export function avoidsAllergens(dish: Dish, avoid: string[]) {
  return avoid.every((a) => !dish.allergens.includes(AVOID_TO_ALLERGEN[a] ?? a));
}

export function fitsProfile(dish: Dish, p: Profile) {
  return fitsDiet(dish, p.diets) && avoidsAllergens(dish, p.avoid);
}
