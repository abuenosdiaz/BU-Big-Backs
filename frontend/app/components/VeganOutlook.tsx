"use client";

import { useEffect, useState } from "react";
import { fetchVeganOutlook, type VeganOutlookHall } from "../lib/api";

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "–";
  return `${(value * 100).toFixed(0)}%`;
}

function OutlookBadge({ outlook }: { outlook: string }) {
  const styles: Record<string, string> = {
    improving: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    worsening: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    flat: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  };
  const cls = styles[outlook] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {outlook}
    </span>
  );
}

function HallCard({ hall }: { hall: VeganOutlookHall }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.12] dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold leading-tight text-black dark:text-zinc-50">
            {hall.hall}
          </h3>
          {hall.campus && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{hall.campus}</p>
          )}
        </div>
        <OutlookBadge outlook={hall.vegan_outlook} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat
          label="Vegan entrées"
          value={pct(hall.vegan_share_entree_baseline)}
        />
        <Stat
          label="Distinct vegan"
          value={hall.distinct_vegan_entrees_baseline?.toString() ?? "–"}
        />
        <Stat
          label="Avg protein"
          value={
            hall.vegan_entree_protein_mean_baseline != null
              ? `${hall.vegan_entree_protein_mean_baseline.toFixed(0)}g`
              : "–"
          }
        />
      </div>

      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Baseline {hall.anchor_date}. Vegan entrée share goes to{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {pct(hall.vegan_share_entree_horizon)}
        </span>{" "}
        across the next {hall.horizon_days_present} day(s).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 py-2 dark:bg-zinc-800/60">
      <div className="text-base font-semibold text-black dark:text-zinc-50">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
    </div>
  );
}

export default function VeganOutlook() {
  const [halls, setHalls] = useState<VeganOutlookHall[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVeganOutlook()
      .then((data) => {
        if (!cancelled) setHalls(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        Vegan outlook unavailable: {error}
      </div>
    );
  }

  if (!halls) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-xl border border-black/[.06] bg-zinc-100 dark:border-white/[.08] dark:bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {halls.map((hall) => (
        <HallCard key={hall.hall} hall={hall} />
      ))}
    </div>
  );
}
