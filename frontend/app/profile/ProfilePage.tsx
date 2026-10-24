"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Lock, Settings } from "lucide-react";
import { PageShell } from "@/components/SiteHeader";
import { dishImage, timeAgo, useDishes } from "@/lib/dishes";
import { HALLS, useCurrentMeal } from "@/lib/halls";
import { fitsProfile, useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

export function ProfilePage() {
  const { profile } = useProfile();
  const { data } = useDishes();
  const [tab, setTab] = useState<"starred" | "disliked">("starred");
  const byId = new Map((data ?? []).map((d) => [d.id, d]));
  const forYou = (data ?? [])
    .filter((d) => fitsProfile(d, profile) && !profile.disliked.includes(d.id))
    .sort((a, b) => Number(profile.starred.includes(b.id)) - Number(profile.starred.includes(a.id)) || b.loves - a.loves)
    .slice(0, 3);
  const list = (tab === "starred" ? profile.starred : profile.disliked).map((id) => byId.get(id)).filter(Boolean);
  const restrictions = [...profile.diets, ...profile.avoid.map((a) => `No ${a.toLowerCase()}`)];
  const meal = useCurrentMeal();
  const initial = (profile.name || "?").trim()[0]?.toUpperCase();

  return (
    <PageShell>
      <div className="panel flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-primary font-display text-xl font-bold text-primary-foreground">
          {initial}
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl font-black tracking-tight">{profile.name || "Set your name"}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.year ? `Class of ${profile.year} · ` : ""}Usually eats at {profile.homeHall}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Only you see this. Comments and forum posts always show as Anonymous.
          </p>
        </div>
        <Link href="/settings" className="btn-outline">
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">My dietary restrictions</h2>
          <Link href="/settings" className="text-sm text-primary">
            Edit
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {restrictions.length ? (
            restrictions.map((r) => (
              <span key={r} className="diet-tag text-sm">
                {r}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">None set yet.</span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile.hideMismatch
            ? "Dishes that don't fit these are hidden across Big Backs. You can turn this off in Settings."
            : "Dishes that don't fit are still shown. You can hide them in Settings."}
        </p>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">For you today</h2>
          <Link href="/" className="text-sm text-primary">
            See all matches
          </Link>
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {forYou.map((d) => (
            <Link key={d.id} href={`/dish/${d.id}`} className="dish-card">
              {dishImage(d.id) && (
                <Image src={dishImage(d.id)!} alt={d.name} width={944} height={704} className="aspect-[4/3] w-full rounded-xl object-cover" />
              )}
              <p className="mt-2 font-semibold">{d.name}</p>
              <p className="text-xs text-muted-foreground">
                {HALLS.find((h) => h.name === d.hall)?.short ?? d.hall} · Serving {meal}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <div className="flex gap-4 border-b border-border">
            {(["starred", "disliked"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("tab", tab === t && "tab-active")}>
                {t === "starred" ? "Starred" : "Disliked"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {tab === "starred" ? "We'll let you know when a starred dish is on the menu." : "These are hidden from your feed."}
          </p>
          <ul className="mt-3 space-y-2">
            {list.length === 0 && <li className="text-sm text-muted-foreground">Nothing here yet — use the buttons on a dish page.</li>}
            {list.map((d) => (
              <li key={d!.id}>
                <Link href={`/dish/${d!.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary">
                  {dishImage(d!.id) && (
                    <Image src={dishImage(d!.id)!} alt="" width={48} height={48} className="h-12 w-12 rounded-lg object-cover" />
                  )}
                  <div>
                    <p className="font-semibold">{d!.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d!.hall} · {d!.meal === meal ? "Being served now" : `Served at ${d!.meal.toLowerCase()}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel h-fit">
          <h2 className="font-display text-xl font-bold">Rate what you just ate</h2>
          <p className="text-sm text-muted-foreground">Dishes you&apos;ve rated or opened recently.</p>
          <ul className="mt-3 space-y-2">
            {profile.history.length === 0 && <li className="text-sm text-muted-foreground">No recent meals yet.</li>}
            {profile.history.slice(0, 4).map((h) => {
              const d = byId.get(h.dishId);
              if (!d) return null;
              return (
                <li key={h.at} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <strong>{d.name}</strong> <span className="text-muted-foreground">· {timeAgo(h.at)}</span>
                  </span>
                  <Link href={`/feedback?dish=${d.id}`} className="text-primary">
                    Rate →
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/feedback" className="btn-primary mt-4 w-full">
            Request a new item
          </Link>
        </section>
      </div>
    </PageShell>
  );
}
