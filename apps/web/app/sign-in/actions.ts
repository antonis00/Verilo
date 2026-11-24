"use server";

import { clientIp } from "@/lib/client-ip";
import { validateEmail } from "@/lib/email";
import { allow } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Limits on sign-in emails, so nobody can make Verilo flood an inbox or use up its sending:
// per address, and per visitor (the test server raises the latter: every test signs in from one
// machine). Supabase's own limits count the app server as one visitor, so they can't do this.
const PER_EMAIL = 3; // per 15 minutes
const PER_VISITOR = Number(process.env.SIGN_IN_PER_VISITOR_HOUR ?? 10); // per hour

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email: string };

export async function requestSignInLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const raw = String(formData.get("email") ?? "");
  const checked = validateEmail(raw);
  if (!checked.ok) return { status: "error", message: checked.message, email: raw };
  const tooMany = {
    status: "error" as const,
    message: "Too many sign-in emails in a short time. Wait a few minutes and try again.",
    email: checked.email,
  };
  if (!allow(`sign-in:visitor:${await clientIp()}`, PER_VISITOR, 3_600_000)) return tooMany;
  if (!allow(`sign-in:email:${checked.email}`, PER_EMAIL, 15 * 60_000)) return tooMany;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: checked.email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    const message =
      error.status === 429
        ? "Too many sign-in emails in a short time. Wait a minute and try again."
        : "We couldn't send the email just now. Try again in a moment.";
    console.error("sign-in link failed", { status: error.status, code: error.code });
    return { status: "error", message, email: checked.email };
  }

  return { status: "sent", email: checked.email };
}
