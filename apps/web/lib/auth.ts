import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The one place that reads who the reader is (the data access layer). Returns only what pages need.
export type Reader = {
  id: string;
  email: string;
};

export async function getReader(): Promise<Reader | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: String(data.claims.email ?? "") };
}

export async function requireReader(next: string): Promise<Reader> {
  const reader = await getReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return reader;
}
