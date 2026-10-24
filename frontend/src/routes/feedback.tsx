import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronUp, Star } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { requireBuUser, toastWriteError, useAuth } from "@/lib/auth";
import { useDishes } from "@/lib/dishes";
import { HALLS } from "@/lib/halls";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feedback")({
  validateSearch: (s: Record<string, unknown>): { dish?: string | undefined } => ({
    dish: typeof s["dish"] === "string" ? (s["dish"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Feedback — BU Big Backs" },
      { name: "description", content: "Rate what you just ate or tell BU Dining what you want on the menu. Always anonymous." },
      { property: "og:title", content: "Feedback — BU Big Backs" },
      { property: "og:description", content: "Rate your meal or request a new dish. Always anonymous." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Feedback,
});

const SCALES: { key: "taste" | "portion" | "temperature" | "wait"; label: string; opts: string[] }[] = [
  { key: "taste", label: "Taste", opts: ["Bland", "Just right", "Too strong"] },
  { key: "portion", label: "Portion", opts: ["Too small", "Just right", "Too big"] },
  { key: "temperature", label: "Temperature", opts: ["Cold", "Just right", "Too hot"] },
  { key: "wait", label: "Wait", opts: ["Quick", "Just right", "Long line"] },
];

function Feedback() {
  return (
    <PageShell>
      <h1 className="page-title">Feedback</h1>
      <p className="mt-2 text-muted-foreground">Rate what you just ate, or tell BU Dining what you want on the menu. Always anonymous.</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <RateMeal />
        <div className="space-y-8">
          <RequestItem />
          <TopRequests />
        </div>
      </div>
    </PageShell>
  );
}

function RateMeal() {
  const { dish: initial } = Route.useSearch();
  const { data: dishes } = useDishes();
  const { update } = useProfile();
  const qc = useQueryClient();
  const blank = { taste: "Just right", portion: "Just right", temperature: "Just right", wait: "Just right" };
  const [dishId, setDishId] = useState(initial ?? "");
  const [overall, setOverall] = useState(0);
  const [scales, setScales] = useState(blank);
  const [again, setAgain] = useState("Yes");
  const [note, setNote] = useState("");
  const [share, setShare] = useState(true);

  useEffect(() => {
    if (!dishId && dishes?.[0]) setDishId(dishes[0].id);
  }, [dishes, dishId]);

  const submit = useMutation({
    mutationFn: async () => {
      await requireBuUser();
      const { error } = await supabase.from("meal_ratings").insert({
        dish_id: dishId,
        overall,
        ...scales,
        again,
        note: note.trim() || null,
      });
      if (error) throw error;
      if (share && note.trim()) {
        await supabase
          .from("dish_comments")
          .insert({ dish_id: dishId, body: note.trim(), tried: true });
      }
    },
    onSuccess: () => {
      update((p) => ({ ...p, history: [{ dishId, at: new Date().toISOString() }, ...p.history].slice(0, 20) }));
      toast("Thanks! Your rating was sent anonymously.");
      setOverall(0);
      setScales(blank);
      setAgain("Yes");
      setNote("");
      qc.invalidateQueries({ queryKey: ["comments", dishId] });
    },
    onError: (e) => toastWriteError(e, "Couldn't send your rating. Try again."),
  });

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (dishId && overall) submit.mutate();
      }}
    >
      <h2 className="section-title">How was your meal?</h2>
      <p className="text-sm text-muted-foreground">Takes about 30 seconds.</p>
      <label className="mt-4 block">
        <span className="field-label">What did you eat?</span>
        <select className="field mt-1" value={dishId} onChange={(e) => setDishId(e.target.value)}>
          {dishes?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.hall}
            </option>
          ))}
        </select>
      </label>
      <p className="field-label mt-4">Overall rating</p>
      <div className="mt-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setOverall(n)} className="text-primary">
            <Star className="h-7 w-7" fill={n <= overall ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      {SCALES.map((s) => (
        <Radio key={s.key} label={s.label} opts={s.opts} value={scales[s.key]} onChange={(v) => setScales({ ...scales, [s.key]: v })} />
      ))}
      <Radio label="Would you get it again?" opts={["Yes", "Maybe", "No"]} value={again} onChange={setAgain} />
      <label className="mt-4 block">
        <span className="field-label">Anything else? (optional)</span>
        <textarea
          className="field mt-1"
          rows={3}
          maxLength={1000}
          placeholder="Too salty, cold by the time you got it, perfect as is..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="accent-primary" />
        Also post my note as an anonymous comment on the dish
      </label>
      <button className="btn-primary mt-5 w-full" disabled={!overall || !dishId || submit.isPending}>
        {overall ? "Submit anonymously" : "Pick a star rating to submit"}
      </button>
    </form>
  );
}

function Radio({ label, opts, value, onChange }: { label: string; opts: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-4">
      <p className="field-label">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {opts.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)} className={cn("chip", value === o && "chip-active")}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function RequestItem() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"new" | "back">("new");
  const [item, setItem] = useState("");
  const [hall, setHall] = useState("Any hall");
  const [reason, setReason] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      await requireBuUser();
      const { error } = await supabase
        .from("item_requests")
        .insert({ kind, item: item.trim(), hall, reason: reason.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setItem("");
      setReason("");
      toast("Request sent!");
      qc.invalidateQueries({ queryKey: ["requests"] });
    },
    onError: (e) => toastWriteError(e, "Couldn't send your request."),
  });
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (item.trim()) send.mutate();
      }}
    >
      <h2 className="section-title">Request or recommend an item</h2>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setKind("new")} className={cn("chip", kind === "new" && "chip-active")}>
          New dish idea
        </button>
        <button type="button" onClick={() => setKind("back")} className={cn("chip", kind === "back" && "chip-active")}>
          Bring an item back
        </button>
      </div>
      <label className="mt-4 block">
        <span className="field-label">{kind === "new" ? "What dish would you add?" : "What should come back?"}</span>
        <input className="field mt-1" maxLength={140} placeholder="e.g. a build-your-own poke bowl" value={item} onChange={(e) => setItem(e.target.value)} />
      </label>
      <label className="mt-4 block">
        <span className="field-label">Which dining hall?</span>
        <select className="field mt-1" value={hall} onChange={(e) => setHall(e.target.value)}>
          <option>Any hall</option>
          {HALLS.map((h) => (
            <option key={h.id}>{h.short}</option>
          ))}
        </select>
      </label>
      <label className="mt-4 block">
        <span className="field-label">Why should they add it?</span>
        <textarea
          className="field mt-1"
          rows={3}
          maxLength={1000}
          placeholder="Fits a diet that's hard to find on campus, it's a classic, everyone would line up..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className="btn-dark mt-5 w-full" disabled={!item.trim() || send.isPending}>
        Send request
      </button>
    </form>
  );
}

function TopRequests() {
  const user = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["requests", user?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_requests");
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, votes: Number(r.votes) })).sort((a, b) => b.votes - a.votes);
    },
  });
  const vote = useMutation({
    mutationFn: async (id: string) => {
      await requireBuUser();
      const { error } = await supabase.rpc("toggle_request_vote", { p_request: id });
      if (error) throw error;
    },
    onError: (e) => toastWriteError(e, "Couldn't save your vote. Try again."),
    onSettled: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
  return (
    <section>
      <h2 className="section-title">Top requests — upvote yours</h2>
      <ul className="mt-3 space-y-2">
        {data?.slice(0, 10).map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <button
              onClick={() => vote.mutate(r.id)}
              aria-pressed={r.voted}
              aria-label={`Upvote ${r.item}`}
              className={cn("upvote", r.voted && "upvote-on")}
            >
              <ChevronUp className="h-4 w-4" />
              <span className="text-xs font-bold tabular-nums">{r.votes}</span>
            </button>
            <div>
              <p className="font-semibold">{r.item}</p>
              <p className="text-xs text-muted-foreground">
                {r.hall} · {r.status}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
