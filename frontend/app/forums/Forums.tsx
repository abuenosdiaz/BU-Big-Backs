"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase/client";
import { getDeviceId, timeAgo } from "@/lib/dishes";
import { FORUM_HALLS, HALLS } from "@/lib/halls";
import { cn } from "@/lib/utils";

const TOPICS = ["General", "Lines & wait times", "Seating", "Cleanliness", "Staff shoutouts"];

export function Forums() {
  const qc = useQueryClient();
  const [hall, setHall] = useState<string>(FORUM_HALLS[0] ?? "West Campus");
  const [sort, setSort] = useState<"new" | "week">("new");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState("General");
  const info = HALLS.find((h) => h.short === hall || h.name === hall);

  const { data: posts } = useQuery({
    queryKey: ["forum", hall],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_posts")
        .select("id, topic, title, body, created_at")
        .eq("hall", hall)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const now = Date.now();
      return data.map((p) => ({ ...p, thisWeek: now - new Date(p.created_at).getTime() < 7 * 86400000 }));
    },
  });
  const thisWeek = (posts ?? []).filter((p) => p.thisWeek);
  const shown = sort === "week" ? thisWeek : posts ?? [];

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("forum_posts")
        .insert({ hall, topic, title: title.trim(), body: body.trim(), device_id: getDeviceId() });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      toast("Posted anonymously.");
      qc.invalidateQueries({ queryKey: ["forum", hall] });
    },
    onError: () => toast.error("Couldn't post. Try again."),
  });

  return (
    <PageShell>
      <h1 className="page-title">Dining hall forums</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Talk about each dining hall overall — lines, vibes, cleanliness, staff, seating. Everyone posts anonymously.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {FORUM_HALLS.map((h) => (
          <button key={h} onClick={() => setHall(h)} className={cn("chip", hall === h && "chip-active")}>
            {h}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="hall-banner">
            <div>
              <h2 className="font-display text-3xl font-black tracking-tight">{hall}</h2>
              <p className="text-sm opacity-80">
                {info?.campus} · Open {info?.hours} · {thisWeek.length} posts this week
              </p>
            </div>
            <Link href="/near-me" className="btn-light">
              See what&apos;s serving now
            </Link>
          </div>

          <form
            className="panel mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && body.trim()) post.mutate();
            }}
          >
            <h3 className="font-semibold">Start an anonymous post in {hall}</h3>
            <input className="field mt-3" placeholder="Title" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              className="field mt-2"
              rows={3}
              maxLength={2000}
              placeholder="What's going on at the dining hall?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                Topic
                <select className="field w-auto py-1.5" value={topic} onChange={(e) => setTopic(e.target.value)}>
                  {TOPICS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <button className="btn-primary" disabled={!title.trim() || !body.trim() || post.isPending}>
                Post anonymously
              </button>
            </div>
          </form>

          <div className="mt-8 flex gap-4 border-b border-border">
            {(
              [
                ["new", "New"],
                ["week", "This week"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={cn("tab", sort === k && "tab-active")}>
                {l}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-3">
            {shown.length === 0 && <p className="text-sm text-muted-foreground">No posts yet. Start the conversation.</p>}
            {shown.map((p) => (
              <li key={p.id} className="panel">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="diet-tag">{p.topic}</span>
                  <span className="text-muted-foreground">Anonymous · {timeAgo(p.created_at)}</span>
                </div>
                <h4 className="mt-2 font-semibold">{p.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-4">
          <div className="panel">
            <h3 className="font-semibold">Forum guidelines</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Posts are anonymous, but still moderated.</li>
              <li>Talk about the hall, not individual staff by name.</li>
              <li>Dish reviews go on the dish&apos;s page.</li>
              <li>Food safety concerns? Report them to BU Dining directly.</li>
            </ul>
          </div>
          <Link href="/feedback" className="btn-outline w-full">
            Request a new menu item
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
