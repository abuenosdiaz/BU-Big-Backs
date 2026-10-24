"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMenu, type MenuRow } from "../lib/api";

const MEAL_ORDER = ["Breakfast", "Brunch", "Lunch", "Dinner"];

function DietTags({ row }: { row: MenuRow }) {
  const tags: { label: string; cls: string }[] = [];
  if (row.vegan)
    tags.push({ label: "Vegan", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" });
  else if (row.vegetarian)
    tags.push({ label: "Vegetarian", cls: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300" });
  if (row.gluten_free)
    tags.push({ label: "GF", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" });
  if (row.halal)
    tags.push({ label: "Halal", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" });
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t.label} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${t.cls}`}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

function DishCard({ row }: { row: MenuRow }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.12] dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium leading-snug text-black dark:text-zinc-50">
            {row.item_name}
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{row.station}</p>
        </div>
        <DietTags row={row} />
      </div>
      {row.description && row.description !== "null" && (
        <p className="line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {row.description}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {row.calories != null && <span>{row.calories} cal</span>}
        {row.protein_grams != null && <span>{row.protein_grams}g protein</span>}
        {row.carbohydrates_grams != null && <span>{row.carbohydrates_grams}g carbs</span>}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm text-black outline-none focus:border-black dark:border-white/[.16] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function MenuExplorer() {
  const [rows, setRows] = useState<MenuRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters.
  const [hall, setHall] = useState("");
  const [date, setDate] = useState("");
  const [meal, setMeal] = useState("");
  const [diet, setDiet] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    fetchMenu()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build filter option lists from the loaded data.
  const { halls, dates, meals } = useMemo(() => {
    const data = rows ?? [];
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.filter((v): v is string => !!v)));
    const mealList = uniq(data.map((r) => r.meal)).sort(
      (a, b) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(b),
    );
    return {
      halls: uniq(data.map((r) => r.location_name)).sort(),
      dates: uniq(data.map((r) => r.date)).sort(),
      meals: mealList,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const data = rows ?? [];
    const q = query.trim().toLowerCase();
    return data.filter((r) => {
      if (hall && r.location_name !== hall) return false;
      if (date && r.date !== date) return false;
      if (meal && r.meal !== meal) return false;
      if (diet === "vegan" && !r.vegan) return false;
      if (diet === "vegetarian" && !r.vegetarian) return false;
      if (diet === "gluten_free" && !r.gluten_free) return false;
      if (diet === "halal" && !r.halal) return false;
      if (q && !(r.item_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, hall, date, meal, diet, query]);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        Menu unavailable: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="Dining hall"
          value={hall}
          onChange={setHall}
          options={[{ value: "", label: "All halls" }, ...halls.map((h) => ({ value: h, label: h }))]}
        />
        <Select
          label="Date"
          value={date}
          onChange={setDate}
          options={[{ value: "", label: "All dates" }, ...dates.map((d) => ({ value: d, label: d }))]}
        />
        <Select
          label="Meal"
          value={meal}
          onChange={setMeal}
          options={[{ value: "", label: "All meals" }, ...meals.map((m) => ({ value: m, label: m }))]}
        />
        <Select
          label="Diet"
          value={diet}
          onChange={setDiet}
          options={[
            { value: "", label: "Any" },
            { value: "vegan", label: "Vegan" },
            { value: "vegetarian", label: "Vegetarian" },
            { value: "gluten_free", label: "Gluten free" },
            { value: "halal", label: "Halal" },
          ]}
        />
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Dish name..."
            className="rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm text-black outline-none focus:border-black dark:border-white/[.16] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300"
          />
        </label>
      </div>

      {/* Results */}
      {!rows ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-black/[.06] bg-zinc-100 dark:border-white/[.08] dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} dishes
          </p>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-black/[.12] p-8 text-center text-sm text-zinc-500 dark:border-white/[.16] dark:text-zinc-400">
              No dishes match these filters.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.slice(0, 300).map((row, i) => (
                <DishCard key={`${row.item_id}-${row.date}-${row.meal}-${i}`} row={row} />
              ))}
            </div>
          )}
          {filtered.length > 300 && (
            <p className="text-center text-xs text-zinc-400">
              Showing the first 300. Narrow the filters to see more.
            </p>
          )}
        </>
      )}
    </div>
  );
}
