import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

// A client with the secret key: it bypasses row-level security. Only for jobs that act for every
// reader (sending briefings, one-click unsubscribe from an email), never for a page a visitor
// asked for. SUPABASE_SECRET_KEY is server-only and never sent to a browser.
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set (see apps/web/.env.example).");
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
