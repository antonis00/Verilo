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
  const next = safeNext(params.get("next"));

  if (tokenHash && type && LINK_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url), 303);
    console.error("sign-in link rejected", { status: error.status, code: error.code });
  }

  return NextResponse.redirect(new URL("/sign-in?error=link", request.url), 303);
}
