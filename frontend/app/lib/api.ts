// Types and fetch helpers for the BU Big Backs API.
//
// The API is served by the Python integration server (backend/server.py),
// which also proxies the frontend, so all requests use same-origin relative
// URLs under /api.

export interface MenuRow {
  location_id: string | null;
  location_name: string | null;
  campus: string | null;
  date: string | null;
  meal: string | null;
  meal_opens_at: string | null;
  meal_closes_at: string | null;
  station: string | null;
  item_id: string | null;
  item_name: string | null;
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
}

export interface VeganOutlookHall {
  hall: string;
  campus: string | null;
  anchor_date: string;
  horizon_end_date: string;
  horizon_days: number;
  baseline_days_present: number;
  horizon_days_present: number;
  vegan_share_entree_baseline: number | null;
  vegan_share_entree_horizon: number | null;
  vegan_share_entree_change: number | null;
  distinct_vegan_entrees_baseline: number | null;
  distinct_vegan_entrees_horizon: number | null;
  vegan_entree_protein_mean_baseline: number | null;
  vegan_entree_protein_mean_horizon: number | null;
  pct_periods_with_vegan_entree_baseline: number | null;
  vegan_outlook: string;
  // The summary carries many more metrics; these are the ones the UI uses.
  [key: string]: unknown;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error as string;
    } catch {
      // Response body was not JSON; keep the status-based message.
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchMenu(
  filters: Record<string, string> = {},
): Promise<MenuRow[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  const data = await getJson<{ rows: MenuRow[] }>(
    `/api/menu${query ? `?${query}` : ""}`,
  );
  return data.rows;
}

export async function fetchVeganOutlook(): Promise<VeganOutlookHall[]> {
  const data = await getJson<{ halls: VeganOutlookHall[] }>(
    "/api/vegan-outlook",
  );
  return data.halls;
}
