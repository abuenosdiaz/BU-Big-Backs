// Client for the menu API served by backend/server.py (see backend/API.md).
// In dev, Vite proxies /api to the backend, so VITE_API_URL can stay empty.
const BASE = (import.meta.env["VITE_API_URL"] ?? "").replace(/\/+$/, "");

export type ApiHall = {
  location_id: string;
  location_name: string;
  campus: string;
};

export type MenuRow = {
  location_id: string;
  location_name: string;
  campus: string;
  date: string;
  meal: string;
  meal_opens_at: string | null;
  meal_closes_at: string | null;
  station: string;
  item_id: string;
  item_name: string;
  description: string | null;
  calories: number | null;
  carbohydrates_grams: number | null;
  protein_grams: number | null;
  saturated_fat_grams: number | null;
  vegetarian: boolean | null;
  vegan: boolean | null;
  gluten_free: boolean | null;
  halal: boolean | null;
  cool_food: boolean | null;
};

export type MenuFilters = {
  hall?: string;
  campus?: string;
  date?: string;
  meal?: string;
  station?: string;
  diet?: "vegan" | "vegetarian" | "gluten_free" | "halal";
  q?: string;
};

async function apiGet<T>(path: string, params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `API request failed (${res.status})`);
  return body as T;
}

export const getHalls = () => apiGet<{ halls: ApiHall[] }>("/api/halls");

export const getMenu = (filters: MenuFilters = {}) =>
  apiGet<{ count: number; rows: MenuRow[] }>("/api/menu", filters);

export const getItem = (itemId: string) =>
  apiGet<{ item_id: string; item_name: string; occurrences: MenuRow[] }>(
    `/api/items/${encodeURIComponent(itemId)}`,
  );
