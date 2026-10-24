import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in user, or null. Browsing works signed out; posting and voting need a BU account. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return user;
}

/** Google sign-in through Supabase Auth; comes back to the current page. */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export class SignInRequired extends Error {
  constructor() {
    super("Sign in with your BU Google account to post or vote.");
  }
}

/** Throws SignInRequired unless a BU account is signed in (the database checks this too). */
export async function requireBuUser() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.email?.toLowerCase().endsWith("@bu.edu")) throw new SignInRequired();
  return user;
}

/** Error toast for posting or voting: a sign-in prompt, or the given message. */
export function toastWriteError(e: unknown, message: string) {
  if (e instanceof SignInRequired) {
    toast(e.message, { action: { label: "Sign in", onClick: () => void signInWithGoogle() } });
  } else {
    toast.error(message);
  }
}
