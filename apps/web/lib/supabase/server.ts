import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

// A Supabase client acting as the signed-in reader (row-level security applies).
// Server Components can't set cookies; the proxy refreshes the session, so a failed write there is fine.
export async function createClient() {
  // The client reads the clock (token expiry) as it starts, which Cache Components forbids while
  // prerendering; marking the work as request-time first keeps it out of the static shell.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: the proxy has already refreshed the session.
        }
      },
    },
  });
}
