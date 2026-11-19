import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

// A client with no session, for data every visitor sees (stories, topics, outlets). It reads no
// cookies, so it can run inside "use cache" functions and their results can be shared.
export function publicClient() {
  return createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
