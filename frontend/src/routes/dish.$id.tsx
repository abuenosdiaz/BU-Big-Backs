import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Star, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { LoveButton, Tag } from "@/components/DishCard";
import { getItemAllergens } from "@/lib/api";
import { dishImage, getDeviceId, rankByCampus, timeAgo, useDishes, type Dish } from "@/lib/dishes";
import { toggleIn, useProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dish/$id")({
  head: () => ({
    meta: [
      { title: "Dish details — BU Big Backs" },
      { name: "description", content: "Ingredients, nutrition, allergens and student comments for this BU dining hall dish." },
      { property: "og:title", content: "Dish details — BU Big Backs" },
      { property: "og:description", content: "Ingredients, nutrition, allergens and student comments for this BU dining hall dish." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DishPage,
});

function DishPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useDishes();
  const { profile, update } = useProfile();
  const dish = data?.find((d) => d.id === id);
  const rank = dish && data ? rankByCampus(data, dish.campus).findIndex((d) => d.id === id) + 1 : 0;
  const img = dish && dishImage(dish.name);
  // Real ingredient list and allergen categories for this item, from the menu API.
  const facts = useQuery({
    queryKey: ["item-allergens", dish?.locationId, dish?.itemId],
    enabled: !!dish,
    queryFn: () => getItemAllergens(dish!.locationId, dish!.itemId),
    staleTime: Infinity,
    retry: 1,
  });
  const allergens = facts.data?.ingredients ? facts.data.allergens.map(allergenLabel) : null;
  const starred = profile.starred.includes(id);
  const disliked = profile.disliked.includes(id);
  const notify = profile.notifyMe.includes(id);

  return (
    <PageShell>
      <Link to="/" className="text-sm font-medium text-primary hover:underline">
        ← Back to {dish?.campus ?? "all dishes"}
      </Link>
      {isLoading || !data ? (
        <div className="mt-6 aspect-[16/9] animate-pulse rounded-2xl bg-muted" />
      ) : !dish ? (
        <p className="mt-10 text-muted-foreground">We couldn't find that dish.</p>
      ) : (
        <>
          <div className="mt-6 grid gap-10 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl bg-muted">
              {img && <img src={img} alt={dish.name} width={944} height={704} className="h-full w-full object-cover" />}
            </div>
            <div>
              <p className="eyebrow">#{rank} in {dish.campus}</p>
              <h1 className="page-title mt-2">{dish.name}</h1>
              <p className="mt-2 text-muted-foreground">
                {dish.hall} · {dish.station} · {dish.meals.join(", ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {dish.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              <p className="mt-5 leading-relaxed text-foreground">{dish.description}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <LoveButton dish={dish} size="lg" />
                <button
                  className={cn("btn-outline", notify && "btn-outline-on")}
                  onClick={() => {
                    update((p) => ({ ...p, notifyMe: toggleIn(p.notifyMe, id) }));
                    toast(notify ? "Got it, no more reminders." : "We'll remind you when it's served.");
                  }}
                >
                  {notify ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  {notify ? "You'll be notified" : "Notify me when it's served"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={cn("chip flex items-center gap-1.5", starred && "chip-active")}
                  onClick={() => update((p) => ({ ...p, starred: toggleIn(p.starred, id), disliked: p.disliked.filter((x) => x !== id) }))}
                >
                  <Star className="h-4 w-4" fill={starred ? "currentColor" : "none"} /> {starred ? "Starred" : "Star"}
                </button>
                <button
                  className={cn("chip flex items-center gap-1.5", disliked && "chip-active")}
                  onClick={() => update((p) => ({ ...p, disliked: toggleIn(p.disliked, id), starred: p.starred.filter((x) => x !== id) }))}
                >
                  <ThumbsDown className="h-4 w-4" /> Not for me
                </button>
                <Link to="/feedback" search={{ dish: id }} className="chip">
                  Just ate it? Rate it
                </Link>
              </div>
              <div className="allergen-box mt-6">
                <strong>
                  {facts.isLoading
                    ? "Checking the ingredient list…"
                    : !allergens
                      ? "Allergen info isn't available for this dish"
                      : allergens.length > 0
                        ? `Contains: ${allergens.join(", ")}`
                        : "No major allergens in the ingredient list"}
                </strong>
                <p className="mt-1">
                  From BU Dining's ingredient list. It doesn't cover cross-contact in the kitchen, so ask
                  staff if you have an allergy.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 grid gap-10 md:grid-cols-[1fr_320px]">
            <div>
              {facts.data?.ingredients && (
                <>
                  <h2 className="font-display text-3xl font-black tracking-tight text-foreground">Ingredients</h2>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">{facts.data.ingredients}</p>
                </>
              )}
              <Comments dish={dish} />
            </div>
            <NutritionFacts dish={dish} />
          </div>
        </>
      )}
    </PageShell>
  );
}

/** "tree_nuts" -> "Tree nuts" */
const allergenLabel = (a: string) => a[0]!.toUpperCase() + a.slice(1).replace("_", " ");

const DV = { fat: 78, satFat: 20, chol: 300, sodium: 2300, carbs: 275, fiber: 28 };
const pct = (v: number | undefined, dv: number) => `${Math.round(((v ?? 0) / dv) * 100)}%`;

function NutritionFacts({ dish }: { dish: Dish }) {
  const n = dish.nutrition;
  const Row = ({ label, value, dv, bold, indent }: { label: string; value: string; dv?: string; bold?: boolean; indent?: boolean }) => (
    <div className={cn("flex justify-between border-t border-foreground/30 py-1", indent && "pl-4")}>
      <span>
        {bold ? <strong>{label}</strong> : label} {value}
      </span>
      {dv && <strong>{dv}</strong>}
    </div>
  );
  return (
    <aside className="nutrition-label h-fit">
      <h3 className="font-display text-3xl font-black leading-none">Nutrition Facts</h3>
      <div className="mt-1 border-b-8 border-foreground pb-1 text-sm">
        <strong>Serving size</strong> {n.serving ?? "1 serving"}
      </div>
      <div className="flex items-end justify-between border-b-4 border-foreground py-1">
        <span className="text-lg font-black">Calories</span>
        <span className="text-3xl font-black">{dish.calories}</span>
      </div>
      <div className="py-1 text-right text-xs font-bold">% Daily Value*</div>
      <div className="text-sm">
        {/* Only rows the menu API gives us: missing values are left out, not shown as 0. */}
        {n.fat != null && <Row label="Total Fat" value={`${n.fat}g`} dv={pct(n.fat, DV.fat)} bold />}
        {n.satFat != null && <Row label="Saturated Fat" value={`${n.satFat}g`} dv={pct(n.satFat, DV.satFat)} indent />}
        {n.chol != null && <Row label="Cholesterol" value={`${n.chol}mg`} dv={pct(n.chol, DV.chol)} bold />}
        {n.sodium != null && <Row label="Sodium" value={`${n.sodium}mg`} dv={pct(n.sodium, DV.sodium)} bold />}
        {n.carbs != null && <Row label="Total Carbohydrate" value={`${n.carbs}g`} dv={pct(n.carbs, DV.carbs)} bold />}
        {n.fiber != null && <Row label="Dietary Fiber" value={`${n.fiber}g`} dv={pct(n.fiber, DV.fiber)} indent />}
        {n.sugars != null && <Row label="Total Sugars" value={`${n.sugars}g`} indent />}
        <div className="border-b-8 border-foreground">
          {n.protein != null && <Row label="Protein" value={`${n.protein}g`} bold />}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug">
        * The % Daily Value tells you how much a nutrient in a serving contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
      </p>
    </aside>
  );
}

function Comments({ dish }: { dish: Dish }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [limit, setLimit] = useState(5);
  const { data } = useQuery({
    queryKey: ["comments", dish.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dish_comments")
        .select("id, body, tried, created_at")
        .eq("dish_id", dish.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("dish_comments")
        .insert({ dish_id: dish.id, body: body.trim(), tried: true, device_id: getDeviceId() });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setTried(false);
      toast("Posted anonymously.");
      qc.invalidateQueries({ queryKey: ["comments", dish.id] });
      qc.invalidateQueries({ queryKey: ["dishes"] });
    },
    onError: () => toast.error("Couldn't post your comment. Try again."),
  });

  return (
    <section className="mt-12">
      <h2 className="font-display text-3xl font-black tracking-tight text-foreground">What students are saying ({data?.length ?? 0})</h2>
      <form
        className="panel mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim() && tried) post.mutate();
        }}
      >
        <p className="text-sm font-semibold">Posting as Anonymous</p>
        <p className="text-xs text-muted-foreground">Your name is never shown.</p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="How was it? Worth the swipe?"
          className="field mt-3"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tried} onChange={(e) => setTried(e.target.checked)} className="accent-primary" />
            I've tried this dish
          </label>
          <button className="btn-primary" disabled={!body.trim() || !tried || post.isPending}>
            Post anonymously
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Only students who've tried it can comment. Keep it kind.</p>
      </form>
      <ul className="mt-6 space-y-4">
        {data?.slice(0, limit).map((c) => (
          <li key={c.id} className="border-b border-border pb-4">
            <div className="flex items-center gap-2 text-sm">
              <strong>Anonymous</strong>
              <span className="diet-tag">Tried it</span>
              <span className="text-muted-foreground">{timeAgo(c.created_at)}</span>
            </div>
            <p className="mt-1 text-foreground">{c.body}</p>
          </li>
        ))}
        {data?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>}
      </ul>
      {data && data.length > limit && (
        <button className="btn-outline mt-4" onClick={() => setLimit(limit + 5)}>
          Show more comments
        </button>
      )}
    </section>
  );
}
