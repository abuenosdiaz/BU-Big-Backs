import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageShell } from "@/components/SiteHeader";
import { DIET_KEYS, getStats, type HallStats } from "@/lib/api";
import { HALLS } from "@/lib/halls";
import { DIET_LABEL, findings, pct, short } from "@/lib/stats";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Dining hall stats — BU Big Backs" },
      {
        name: "description",
        content:
          "How BU's dining halls compare on vegetarian, vegan, halal and gluten-free options and nutrition.",
      },
      { property: "og:title", content: "Dining hall stats — BU Big Backs" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: StatsPage,
});

const NUTRITION = [
  ["avg_calories", "Calories", ""],
  ["avg_carbohydrates_grams", "Carbs", "g"],
  ["avg_protein_grams", "Protein", "g"],
  ["avg_saturated_fat_grams", "Sat. fat", "g"],
] as const;

/** Each hall keeps the same color everywhere: its position in HALLS. */
const hallColor = (h: HallStats) =>
  `var(--hall-${HALLS.findIndex((x) => x.name === h.dining_hall) + 1})`;
const byHallOrder = (halls: HallStats[]) =>
  [...halls].sort(
    (a, b) =>
      HALLS.findIndex((x) => x.name === a.dining_hall) -
      HALLS.findIndex((x) => x.name === b.dining_hall),
  );

function StatsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: getStats });

  return (
    <PageShell>
      <p className="eyebrow">This week's menus</p>
      <h1 className="page-title mt-2">How the dining halls compare</h1>
      {data && (
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Every item on BU's menus from {data.overall.first_day} to {data.overall.last_day}, across{" "}
          {data.overall.halls} dining halls.
        </p>
      )}

      {error && <p className="mt-10 text-destructive">Couldn't load the stats. Try refreshing.</p>}
      {isLoading && <div className="mt-10 h-64 animate-pulse rounded-2xl bg-muted" />}

      {data && (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Menu items" value={data.overall.total_items.toLocaleString()} />
            {(["vegetarian", "vegan", "halal", "gluten_free"] as const).map((k) => (
              <Kpi key={k} label={DIET_LABEL[k]} value={pct(data.overall.percent[k])} />
            ))}
          </section>

          <section className="panel mt-8">
            <h2 className="section-title">What stands out</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-foreground">
              {findings(data).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>

          <DietChart halls={byHallOrder(data.halls)} />
          <NutritionTable halls={byHallOrder(data.halls)} />
          <ChangeTable halls={byHallOrder(data.halls)} />

          <p className="mt-8 max-w-3xl text-xs text-muted-foreground">
            From the menu API's per-hall summary (backend/dining_diet_analysis.py). An item counts
            once each time it's served, so a dish on at lunch and dinner counts twice. Cool Food
            items are BU's lower-carbon picks. Nutrition is per item as listed by BU Dining.
          </p>
        </>
      )}
    </PageShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel">
      <p className="field-label">{label}</p>
      <p className="mt-1 font-display text-3xl font-black tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Legend({ halls }: { halls: HallStats[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-sm text-foreground">
      {halls.map((h) => (
        <span key={h.dining_hall} className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: hallColor(h) }} />
          {short(h)}
        </span>
      ))}
    </div>
  );
}

function DietChart({ halls }: { halls: HallStats[] }) {
  const rows = DIET_KEYS.map((k) => ({
    diet: DIET_LABEL[k],
    ...Object.fromEntries(halls.map((h) => [short(h), h[`percent_${k}`]])),
  }));
  return (
    <section className="panel mt-8">
      <h2 className="section-title">Share of items that fit each diet</h2>
      <Legend halls={halls} />
      <div className="mt-4 h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ left: 8, right: 48 }}
            barGap={2}
            barCategoryGap="22%"
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="diet"
              width={92}
              tick={{ fill: "var(--foreground)", fontSize: 13 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              formatter={(v: number, name: string) => [pct(v), name]}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--foreground)",
              }}
            />
            {halls.map((h) => (
              <Bar
                key={h.dining_hall}
                dataKey={short(h)}
                fill={hallColor(h)}
                radius={[0, 4, 4, 0]}
                maxBarSize={16}
              >
                <LabelList
                  dataKey={short(h)}
                  position="right"
                  formatter={(v: number) => `${Math.round(v)}%`}
                  style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-primary">See the numbers</summary>
        <table className="mt-3 w-full text-left tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Diet</th>
              {halls.map((h) => (
                <th key={h.dining_hall} className="py-1 font-medium">
                  {short(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIET_KEYS.map((k) => (
              <tr key={k} className="border-t border-border">
                <td className="py-1">{DIET_LABEL[k]}</td>
                {halls.map((h) => (
                  <td key={h.dining_hall} className="py-1">
                    {pct(h[`percent_${k}`])} ({h[`total_${k}`].toLocaleString()} items)
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function NutritionTable({ halls }: { halls: HallStats[] }) {
  return (
    <section className="panel mt-8 overflow-x-auto">
      <h2 className="section-title">Average nutrition per item</h2>
      <p className="mt-1 text-sm text-muted-foreground">The highest in each column is in bold.</p>
      <table className="mt-4 w-full min-w-[480px] text-left tabular-nums">
        <thead className="text-sm text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Hall</th>
            {NUTRITION.map(([, label]) => (
              <th key={label} className="py-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {halls.map((h) => (
            <tr key={h.dining_hall} className="border-t border-border">
              <td className="py-2">{short(h)}</td>
              {NUTRITION.map(([key, , unit]) => {
                const top = Math.max(...halls.map((x) => x[key]));
                return (
                  <td key={key} className={h[key] === top ? "py-2 font-bold" : "py-2"}>
                    {key === "avg_calories" ? Math.round(h[key]) : h[key].toFixed(1)}
                    {unit}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ChangeTable({ halls }: { halls: HallStats[] }) {
  const first = halls[0];
  return (
    <section className="panel mt-8 overflow-x-auto">
      <h2 className="section-title">Change over the week</h2>
      {first && (
        <p className="mt-1 text-sm text-muted-foreground">
          Items that fit each diet on {first.last_day}, compared with {first.first_day}.
        </p>
      )}
      <table className="mt-4 w-full min-w-[520px] text-left tabular-nums">
        <thead className="text-sm text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Hall</th>
            {DIET_KEYS.map((k) => (
              <th key={k} className="py-2 font-medium">
                {DIET_LABEL[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {halls.map((h) => (
            <tr key={h.dining_hall} className="border-t border-border">
              <td className="py-2">{short(h)}</td>
              {DIET_KEYS.map((k) => {
                const d = h[`change_${k}`];
                return (
                  <td key={k} className="py-2">
                    {d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : "— 0"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
