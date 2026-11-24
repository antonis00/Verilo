import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

// The link in the sign-in email lands here. Opening it (GET) only shows a "Continue" page: email
// security scanners open links on their own and would use up the one-time link, and a link
// that signs in on GET lets someone sign a victim into the attacker's account. The button POSTs
// back here, from our own page, and verifying the token hash on the server sets the session
// cookie, so the link works even when it opens in another browser than the one that asked.
const LINK_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];

export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/auth/continue";
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  // Only from our own "Continue" page.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.redirect(new URL("/sign-in?error=link", request.url), 303);
  }
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "") || null;
  const type = (String(form.get("type") ?? "") || null) as EmailOtpType | null;
  const asked = String(form.get("next") ?? "") || null;

  if (tokenHash && type && LINK_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Where the link asked to go; otherwise new readers set up first, returning readers go
      // straight to their front page. (Row-level security returns only this reader's row.)
      let next = asked ? safeNext(asked) : null;
      if (!next) {
        const { data } = await supabase
          .from("reader_preferences")
          .select("onboarded_at")
          .maybeSingle();
        next = data?.onboarded_at ? "/" : "/welcome";
      }
      return NextResponse.redirect(new URL(next, request.url), 303);
    }
    console.error("sign-in link rejected", { status: error.status, code: error.code });
  }

  return NextResponse.redirect(new URL("/sign-in?error=link", request.url), 303);
}
