import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in the browser (client components).
 *
 * Reads the project URL and publishable key from .env.local. Both are
 * NEXT_PUBLIC_ so Next.js bundles them into the browser code; the
 * publishable key is safe to expose only if row-level security (RLS) is
 * enabled on every table; otherwise anyone can read and write them.
 */
export function createClient() {
  return createBrowserClient(
    // `!` asserts these are set; if .env.local is missing they'll be undefined
    // and Supabase will throw on first use
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
