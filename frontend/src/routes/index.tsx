import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { DishCard } from "@/components/DishCard";
import { CAMPUSES, MEALS, rankByCampus, useDishes } from "@/lib/dishes";
import { HALLS } from "@/lib/halls";
import { fitsDiet, fitsProfile, useProfile, AVOIDS, toggleIn } from "@/lib/profile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BU Big Backs — Most loved dishes on campus" },
      { name: "description", content: "The most loved BU dining hall dishes, ranked by students. Tap the heart to vote." },
      { property: "og:title", content: "BU Big Backs — Most loved dishes on campus" },
      { property: "og:description", content: "The most loved BU dining hall dishes, ranked by students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const DIET_FILTERS = ["Vegetarian", "Vegan", "Halal", "Gluten-free"];
/** Cards shown per campus before "Show all". */
const PREVIEW = 9;

function Index() {
  const { profile } = useProfile();
  const [q, setQ] = useState("");
  const [hall, setHall] = useState<string | null>(null);
  const [meals, setMeals] = useState<string[]>([]);
  const [diets, setDiets] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  // The API filters allergens: the profile's avoid list (when hiding mismatches) plus this page's.
  const { data, isLoading, error } = useDishes([...(profile.hideMismatch ? profile.avoid : []), ...avoid]);
  const [sort, setSort] = useState<"loved" | "newest">("loved");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const activeCount = meals.length + diets.length + avoid.length;
  // Only offer meals on today's menu (e.g. Brunch on Sundays).
  const todaysMeals = data ? MEALS.filter((m) => data.some((d) => d.meals.includes(m))) : [...MEALS];

  const dishes = useMemo(() => {
    let list = data ?? [];
    if (profile.hideMismatch) list = list.filter((d) => fitsProfile(d, profile) && !profile.disliked.includes(d.id));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((d) => [d.name, d.station, d.hall, ...d.ingredients].join(" ").toLowerCase().includes(s));
    }
    if (hall) list = list.filter((d) => d.hall === hall);
    if (meals.length) list = list.filter((d) => d.meals.some((m) => meals.includes(m)));
    list = list.filter((d) => fitsDiet(d, diets));
    return list;
  }, [data, profile, q, hall, meals, diets]);

  const order = (campus: string) => {
    const r = rankByCampus(dishes, campus);
    return sort === "newest" ? [...r].sort((a, b) => b.sort - a.sort) : r;
  };

  return (
    <PageShell>
      <div className="flex flex-wrap items-center gap-3">
        <label className="search-box">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes — stir fry, waffles, pizza..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button onClick={() => setOpen(true)} className={cn("chip flex items-center gap-2", activeCount && "chip-active")}>
          <SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` ${activeCount}` : ""}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {HALLS.map((h) => (
          <button key={h.id} onClick={() => setHall(hall === h.name ? null : h.name)} className={cn("chip", hall === h.name && "chip-active")}>
            {h.short}
          </button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {["Vegetarian", "Vegan", "Gluten-free", "Halal"].map((f) => (
          <button key={f} onClick={() => setDiets(toggleIn(diets, f))} className={cn("chip", diets.includes(f) && "chip-diet")}>
            {f}
          </button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {todaysMeals.map((m) => (
          <button key={m} onClick={() => setMeals(toggleIn(meals, m))} className={cn("chip", meals.includes(m) && "chip-active")}>
            {m}
          </button>
        ))}
      </div>

      <p className="eyebrow mt-10">Ranked by BU students</p>
      <h1 className="page-title mt-2 md:text-6xl">
        The most loved dishes on campus
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">Tap the heart to vote for your go-to.</p>
      {profile.hideMismatch && (profile.diets.length > 0 || profile.avoid.length > 0) && (
        <p className="mt-2 text-sm text-muted-foreground">
          Showing only dishes that fit your restrictions ({[...profile.diets, ...profile.avoid.map((a) => `no ${a.toLowerCase()}`)].join(", ")}).
          {profile.avoid.length > 0 &&
            " Allergens come from each dish's ingredient list, and dishes without one are hidden. Always check with staff if you have an allergy."}
        </p>
      )}

      {error && <p className="mt-10 text-destructive">Couldn't load dishes. Try refreshing.</p>}

      {CAMPUSES.map((campus) => {
        const ranked = order(campus);
        if (data && hall && ranked.length === 0) return null;
        return (
          <section key={campus} className="mt-14">
            <h2 className="section-heading">{campus}</h2>
            <div className="mt-5 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {isLoading || !data ? (
                [0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)
              ) : ranked.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matching dishes here right now.</p>
              ) : (
                (expanded.includes(campus) ? ranked : ranked.slice(0, PREVIEW)).map((d, i) => (
                  <DishCard key={d.id} dish={d} rank={i + 1} />
                ))
              )}
            </div>
            {data && ranked.length > PREVIEW && (
              <button className="chip mt-5" onClick={() => setExpanded(toggleIn(expanded, campus))}>
                {expanded.includes(campus) ? "Show less" : `Show all ${ranked.length}`}
              </button>
            )}
          </section>
        );
      })}

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-foreground/30" onClick={() => setOpen(false)}>
          <aside className="h-full w-full max-w-sm overflow-y-auto bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Filters</h2>
              <div className="flex items-center gap-3">
                <button
                  className="text-sm text-primary"
                  onClick={() => {
                    setMeals([]);
                    setDiets([]);
                    setAvoid([]);
                    setSort("loved");
                  }}
                >
                  Clear all
                </button>
                <button aria-label="Close filters" onClick={() => setOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <FilterGroup label="Meal" options={todaysMeals} value={meals} onChange={setMeals} />
            <FilterGroup label="Diet" options={DIET_FILTERS} value={diets} onChange={setDiets} />
            <FilterGroup label="Hide dishes containing" options={AVOIDS} value={avoid} onChange={setAvoid} />
            <p className="field-label mt-6">Sort by</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["loved", "Most loved"],
                  ["newest", "Newest"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} onClick={() => setSort(k)} className={cn("chip", sort === k && "chip-active")}>
                  {l}
                </button>
              ))}
            </div>
            <button className="btn-primary mt-8 w-full" onClick={() => setOpen(false)}>
              Show {dishes.length} dishes
            </button>
          </aside>
        </div>
      )}
    </PageShell>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <>
      <p className="field-label mt-6">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(toggleIn(value, o))} className={cn("chip", value.includes(o) && "chip-active")}>
            {o}
          </button>
        ))}
      </div>
    </>
  );
}
