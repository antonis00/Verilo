"use server";

import { redirect } from "next/navigation";
import { getReader } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Deletes the reader's account and everything kept about them (their choices, briefing settings
// and briefing history go with it: every reader table cascades from the account). A report they
// sent stays, without the link to them. Needs the word "delete" typed, so it's never an accident.
export async function deleteAccount(form: FormData) {
  const reader = await getReader();
  if (!reader) redirect("/sign-in");
  if (
    String(form.get("confirm") ?? "")
      .trim()
      .toLowerCase() !== "delete"
  ) {
    redirect("/my-news?delete=confirm#your-data");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await adminClient().auth.admin.deleteUser(reader.id);
  if (error) {
    console.error("deleting an account failed", { code: error.code });
    redirect("/my-news?delete=failed#your-data");
  }
  redirect("/account-deleted");
}
