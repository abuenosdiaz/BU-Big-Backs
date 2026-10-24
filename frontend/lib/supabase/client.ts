import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.",
  );
}

// New Supabase keys (sb_publishable_...) are not JWTs, so they go in the
// apikey header only, never as a Bearer token.
const supabaseFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
  headers.set("apikey", key);
  return fetch(input, { ...init, headers });
};

// Votes and posts are anonymous (per-device id), so there are no user sessions.
export const supabase = createClient<Database>(url, key, {
  global: { fetch: supabaseFetch },
  auth: { persistSession: false, autoRefreshToken: false },
});
