export type Hall = {
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

export const HALLS: Hall[] = [
  { name: "West Campus Dining Hall", short: "West Campus", campus: "West Campus", lat: 42.3523, lng: -71.1175, hours: "7am – 11pm", x: 12, y: 40 },
  { name: "Marciano Commons", short: "Marciano", campus: "Central", lat: 42.3496, lng: -71.1003, hours: "7am – 10pm", x: 60, y: 62 },
  { name: "Warren Towers", short: "Warren", campus: "East", lat: 42.3489, lng: -71.1041, hours: "7am – 11pm", x: 72, y: 46 },
  { name: "Fenway Dining Hall", short: "Fenway", campus: "Fenway", lat: 42.3442, lng: -71.0999, hours: "8am – 8pm", x: 84, y: 80 },
];

export const FORUM_HALLS = ["West Campus", "Warren Towers", "Marciano Commons", "Fenway"];

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

export function currentMeal(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return "Breakfast";
  if (h < 16) return "Lunch";
  return "Dinner";
}
