import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { trialState, type TrialState } from "@/lib/trial";

// The one place that reads who the reader is (the data access layer). Returns only what pages need.
export type Reader = {
  id: string;
  email: string;
  isEditor: boolean;
  trial: TrialState;
};

export async function getReader(): Promise<Reader | null> {
  // The client reads the request first (connection()), so reading the clock after it is allowed.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  // Row-level security lets a reader read only their own profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_editor, trial_ends_at, subscribed_until")
    .eq("id", data.claims.sub)
    .maybeSingle();
  return {
    id: data.claims.sub,
    email: String(data.claims.email ?? ""),
    isEditor: profile?.is_editor === true,
    trial: trialState(
      {
        trial_ends_at: profile?.trial_ends_at ?? null,
        subscribed_until: profile?.subscribed_until ?? null,
      },
      Date.now(),
    ),
  };
}

export async function requireReader(next: string): Promise<Reader> {
  const reader = await getReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return reader;
}

// Internal pages answer "not found" to everyone else, so they don't reveal that they exist.
// The database enforces the same rule (is_editor() in the row-level security policies).
export async function requireEditor(): Promise<Reader> {
  const reader = await getReader();
  if (!reader?.isEditor) notFound();
  return reader;
}
