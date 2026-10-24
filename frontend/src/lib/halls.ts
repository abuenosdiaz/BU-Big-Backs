export type Hall = {
  /** location_id from the menu API */
  id: string;
  /** location_name from the menu API */
  name: string;
  short: string;
  campus: string;
  lat: number;
  lng: number;
  hours: string;
  /** position on the simple campus map, in % */
  x: number;
  y: number;
};

// The halls served by GET /api/halls; names and campuses must match the API.
export const HALLS: Hall[] = [
  { id: "west", name: "The Fresh Food Co. at West Campus", short: "West Campus", campus: "West Campus", lat: 42.3523, lng: -71.1175, hours: "7am – 11pm", x: 12, y: 40 },
  { id: "marciano", name: "The Fresh Food Co. at Marciano Commons", short: "Marciano Commons", campus: "East Campus", lat: 42.3496, lng: -71.1003, hours: "7am – 10pm", x: 60, y: 62 },
  { id: "warren", name: "The Fresh Food Co. at Warren Towers", short: "Warren Towers", campus: "Central Campus", lat: 42.3489, lng: -71.1041, hours: "7am – 11pm", x: 72, y: 46 },
];

export const FORUM_HALLS = HALLS.map((h) => h.short);

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ~5 km/h walking pace */
export function walkMinutes(km: number) {
  return Math.max(1, Math.round((km / 5) * 60));
}

// Hours from the menu API: Sunday is brunch 10–4 then dinner; other days
// breakfast until 11, lunch until 5, then dinner.
export function currentMeal(d = new Date()) {
  const h = d.getHours();
  if (d.getDay() === 0) return h < 16 ? "Brunch" : "Dinner";
  if (h < 11) return "Breakfast";
  if (h < 17) return "Lunch";
  return "Dinner";
}
