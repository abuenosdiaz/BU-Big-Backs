import { createClient } from "@/utils/supabase/client";
import { dishKey } from "./dates";
import type { Vote } from "./types";

/**
 * Returns an anonymous ID for this browser, creating one on first visit.
 *
 * There are no user accounts, so this ID is what ties votes to a voter.
 * Clearing site data or switching browsers produces a new ID.
 * Browser-only: reads localStorage, so call it from client components.
 */
export function getDeviceId() {
  let id = localStorage.getItem("device_id");
  if (!id) {
    // randomUUID needs a secure context (HTTPS or localhost); fall back otherwise
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    localStorage.setItem("device_id", id);
  }
  return id;
}

/**
 * Records this device's vote on a dish.
 *
 * Each device gets one vote per dish, hall, meal and day. Voting again
 * overwrites the earlier vote instead of adding a second row.
 *
 * @throws The Supabase error if the write fails
 */
export async function submitVote(v: {
  dishName: string; hall: string; station: string; meal: string; date: string; vote: Vote;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("votes").upsert(
    {
      dish_key: dishKey(v.dishName), // stable key derived from the name; see dishKey()
      dish_name: v.dishName,
      hall: v.hall,
      station: v.station,
      meal: v.meal.toLowerCase(),
      date: v.date,
      vote: v.vote,
      device_id: getDeviceId(),
    },
    // Must match a unique constraint on the votes table, or the upsert fails
    { onConflict: "dish_key,hall,meal,date,device_id" }
  );
  if (error) throw error;
}

/**
 * Loads this device's votes for one hall and day, so the UI can
 * highlight dishes the user has already voted on.
 *
 * @returns A map keyed by `"meal|dish_key"`
 * @throws The Supabase error if the query fails
 */
export async function getMyVotes(hall: string, date: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("votes")
    .select("dish_key, meal, vote")
    .eq("hall", hall)
    .eq("date", date)
    .eq("device_id", getDeviceId());
  if (error) throw error;

  const map: Record<string, Vote | undefined> = {};
  for (const r of data ?? []) map[`${r.meal}|${r.dish_key}`] = r.vote as Vote;
  return map;
}
