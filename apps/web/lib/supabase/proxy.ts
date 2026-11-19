import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

// Pages that need a signed-in reader. This is only the quick check that saves a round trip;
// every page and action still checks the session itself (lib/auth.ts).
const PROTECTED = ["/my-news"];

// Internal pages: anyone who isn't an editor gets a real 404, decided here because a page that
// has started streaming can no longer change its status code.
const EDITORS_ONLY = ["/desk"];

const under = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Refreshes an expired session and writes the new cookies. Nothing may run between
  // creating the client and this call.
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  if (!data?.claims && under(path, PROTECTED)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", path);
    return withCookies(NextResponse.redirect(url), response);
  }

  if (under(path, EDITORS_ONLY)) {
    let editor = false;
    if (data?.claims?.sub) {
      // Row-level security: a reader can read only their own profile.
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_editor")
        .eq("id", data.claims.sub)
        .maybeSingle();
      editor = profile?.is_editor === true;
    }
    if (!editor) {
      // Rewriting to a path with no page renders the site's not-found page with status 404.
      const url = request.nextUrl.clone();
      url.pathname = "/_not-found-internal";
      url.search = "";
      return withCookies(NextResponse.rewrite(url), response);
    }
  }

  return response;
}

function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}
