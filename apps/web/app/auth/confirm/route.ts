import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

// The link in the sign-in email lands here. Verifying the token hash on the server sets the
// session cookie, so the link works even when it opens in another browser than the one that asked.
const LINK_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const asked = params.get("next");

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
