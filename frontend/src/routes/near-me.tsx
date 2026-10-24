import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { dishImage, useDishes } from "@/lib/dishes";
import { HALLS, currentMeal, distanceKm, walkMinutes } from "@/lib/halls";
import { fitsProfile, useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/near-me")({
  head: () => ({
    meta: [
      { title: "Near me — BU Big Backs" },
      { name: "description", content: "See what's being served at the BU dining halls closest to you, matched to your restrictions." },
      { property: "og:title", content: "Near me — BU Big Backs" },
      { property: "og:description", content: "What's being served closest to you on campus right now." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NearMe,
});

// Central campus fallback (Marsh Plaza) when location is off or denied.
const FALLBACK = { lat: 42.3505, lng: -71.1054 };

function NearMe() {
  const { data } = useDishes();
  const { profile } = useProfile();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<"off" | "asking" | "on" | "denied">("off");
  const [limit, setLimit] = useState(10);
  const [onlyFits, setOnlyFits] = useState(true);

  useEffect(() => setLimit(profile.walkLimit), [profile.walkLimit]);

  const locate = () => {
    if (!navigator.geolocation) return setStatus("denied");
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setStatus("on");
      },
      () => setStatus("denied"),
      { timeout: 8000 },
    );
  };

  useEffect(() => {
    if (profile.useLocation) locate();
  }, [profile.useLocation]);

  const here = pos ?? FALLBACK;
  const meal = currentMeal();
  const rows = useMemo(
    () =>
      HALLS.map((h) => {
        const km = distanceKm(here.lat, here.lng, h.lat, h.lng);
        const top = (data ?? [])
          .filter((d) => d.hall === h.name && (!onlyFits || fitsProfile(d, profile)))
          .sort((a, b) => Number(b.meal === meal) - Number(a.meal === meal) || b.loves - a.loves)[0];
        return { h, km, min: walkMinutes(km), top };
      }).sort((a, b) => a.km - b.km),
    [data, here.lat, here.lng, onlyFits, profile, meal],
  );
  const shown = rows.filter((r) => r.min <= limit || limit >= 60);

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Near me</h1>
          <p className="mt-2 text-muted-foreground">See what's being served closest to you right now, matched to your restrictions.</p>
        </div>
        <button onClick={locate} className={cn("btn-primary", status === "on" && "btn-primary")}>
          <MapPin className="h-4 w-4" />
          {status === "on" ? "Location on" : status === "asking" ? "Finding you…" : "Use my location"}
        </button>
      </div>
      {status === "denied" && (
        <p className="mt-3 text-sm text-muted-foreground">We couldn't get your location, so distances are from Marsh Plaza.</p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="campus-map">
          <span className="map-river">Charles River</span>
          <span className="map-road">Commonwealth Ave</span>
          {HALLS.map((h) => (
            <span key={h.name} className="map-pin" style={{ left: `${h.x}%`, top: `${h.y}%` }}>
              {h.short}
            </span>
          ))}
          <span className="map-you" style={{ left: "50%", top: "48%" }}>
            You
          </span>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Closest to you</h2>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="field w-auto py-1.5">
              <option value={5}>Within 5 min walk</option>
              <option value={10}>Within 10 min walk</option>
              <option value={20}>Within 20 min walk</option>
              <option value={60}>Any distance</option>
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} className="accent-primary" />
            Only show what fits my restrictions
          </label>
          <ul className="mt-4 space-y-3">
            {shown.length === 0 && (
              <p className="text-sm text-muted-foreground">No dining halls within that walk. Try a longer distance.</p>
            )}
            {shown.map(({ h, km, min, top }) => (
              <li key={h.name} className="panel flex items-center gap-4">
                {top && dishImage(top.id) && (
                  <img src={dishImage(top.id)} alt="" width={72} height={72} loading="lazy" className="h-16 w-16 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{h.name}</strong>
                    <span className="diet-tag">Serving {meal}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {km.toFixed(1)} km · {min} min walk · {h.campus}
                  </p>
                  {top ? (
                    <Link to="/dish/$id" params={{ id: top.id }} className="mt-1 block text-sm">
                      <span className="text-muted-foreground">Most loved right now: </span>
                      <span className="font-semibold text-primary">{top.name}</span>
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">Nothing that fits your restrictions here.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
