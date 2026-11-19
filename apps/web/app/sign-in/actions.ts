"use server";

import { createClient } from "@/lib/supabase/server";
import { validateEmail } from "@/lib/email";

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
