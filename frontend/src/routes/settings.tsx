import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { AVOIDS, DEFAULT_PROFILE, DIETS, saveProfile, toggleIn, useProfile, type Profile } from "@/lib/profile";
import { requireBuUser, toastWriteError } from "@/lib/auth";
import { HALLS } from "@/lib/halls";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — BU Big Backs" },
      { name: "description", content: "Set your dietary restrictions, home dining hall, location and notifications." },
      { property: "og:title", content: "Settings — BU Big Backs" },
      { property: "og:description", content: "Set your dietary restrictions, home dining hall, location and notifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, ready } = useProfile();
  const [f, setF] = useState<Profile>(DEFAULT_PROFILE);
  const navigate = useNavigate();
  useEffect(() => {
    if (ready) setF(profile);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <PageShell>
      <Link to="/profile" className="text-sm font-medium text-primary">
        ← Back to profile
      </Link>
      <h1 className="page-title mt-4">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Saved on this device only.</p>

      <div className="mt-8 max-w-2xl space-y-10">
        <section>
          <h2 className="section-title">Profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="field-label">Name (only you see this)</span>
              <input className="field mt-1" maxLength={60} value={f.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label>
              <span className="field-label">Class year</span>
              <input className="field mt-1" maxLength={4} placeholder="2028" value={f.year} onChange={(e) => set("year", e.target.value)} />
            </label>
            <label>
              <span className="field-label">Home dining hall</span>
              <select className="field mt-1" value={f.homeHall} onChange={(e) => set("homeHall", e.target.value)}>
                {HALLS.map((h) => (
                  <option key={h.name} value={h.short}>
                    {h.short}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Meal plan</span>
              <select className="field mt-1" value={f.mealPlan} onChange={(e) => set("mealPlan", e.target.value)}>
                <option value="">Not set</option>
                <option>Unlimited</option>
                <option>14 swipes / week</option>
                <option>Dining points only</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2 className="section-title">Dietary restrictions</h2>
          <p className="text-sm text-muted-foreground">We use these to pick what shows up on your home page and in For you.</p>
          <p className="field-label mt-4">I eat</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <button key={d} type="button" onClick={() => set("diets", toggleIn(f.diets, d))} className={cn("chip", f.diets.includes(d) && "chip-diet")}>
                {d}
              </button>
            ))}
          </div>
          <p className="field-label mt-4">I'm allergic to / avoid</p>
          <p className="text-xs text-muted-foreground">
            BU's menu doesn't list allergens, so we guess them from dish names. Always check with staff.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVOIDS.map((d) => (
              <button key={d} type="button" onClick={() => set("avoid", toggleIn(f.avoid, d))} className={cn("chip", f.avoid.includes(d) && "chip-active")}>
                {d}
              </button>
            ))}
          </div>
          <Toggle label="Hide dishes that don't match my restrictions" checked={f.hideMismatch} onChange={(v) => set("hideMismatch", v)} />
        </section>

        <section>
          <h2 className="section-title">Location</h2>
          <Toggle
            label="Use my location for Near me"
            hint="Only used while the app is open. Never shared or saved."
            checked={f.useLocation}
            onChange={(v) => set("useLocation", v)}
          />
          <label className="mt-4 block">
            <span className="field-label">Default walking distance</span>
            <select className="field mt-1 max-w-xs" value={f.walkLimit} onChange={(e) => set("walkLimit", Number(e.target.value))}>
              <option value={5}>Within a 5 min walk</option>
              <option value={10}>Within a 10 min walk</option>
              <option value={20}>Within a 20 min walk</option>
              <option value={60}>Any distance</option>
            </select>
          </label>
        </section>

        <section>
          <h2 className="section-title">Notifications</h2>
          {(
            [
              ["starred", "A starred dish is on today's menu"],
              ["rateReminder", "Remind me to rate a meal after I eat"],
              ["replies", "Replies to my forum posts"],
              ["requestAdded", "An item I requested gets added"],
            ] as const
          ).map(([k, l]) => (
            <Toggle key={k} label={l} checked={f.notify[k]} onChange={(v) => set("notify", { ...f.notify, [k]: v })} />
          ))}
        </section>

        <section>
          <h2 className="section-title">Privacy</h2>
          <p className="text-sm text-muted-foreground">
            Comments, forum posts, surveys and requests are always anonymous. Your name is never shown to other students.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-outline"
              onClick={() => {
                saveProfile({ ...profile, history: [] });
                setF((p) => ({ ...p, history: [] }));
                toast("Meal history cleared.");
              }}
            >
              Clear my meal history
            </button>
            <button
              className="btn-outline"
              onClick={async () => {
                try {
                  await requireBuUser();
                } catch (e) {
                  return toastWriteError(e, "Couldn't delete your posts.");
                }
                if (!confirm("Delete all your comments and forum posts?")) return;
                const { error } = await supabase.rpc("delete_my_content");
                toast(error ? "Couldn't delete your posts." : "Your posts were deleted.");
              }}
            >
              Delete my posts
            </button>
            <button
              className="btn-outline text-destructive"
              onClick={() => {
                if (!confirm("Reset your profile, restrictions and stars on this device?")) return;
                saveProfile(DEFAULT_PROFILE);
                setF(DEFAULT_PROFILE);
                toast("Profile reset.");
              }}
            >
              Reset profile
            </button>
          </div>
        </section>

        <div className="flex justify-end gap-2 border-t border-border pt-6">
          <Link to="/profile" className="btn-outline">
            Cancel
          </Link>
          <button
            className="btn-primary"
            onClick={() => {
              saveProfile(f);
              toast("Settings saved.");
              navigate({ to: "/profile" });
            }}
          >
            Save changes
          </button>
        </div>
      </div>
    </PageShell>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-4 flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
    </label>
  );
}
