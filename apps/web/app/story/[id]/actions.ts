"use server";

import { getReader } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { allow } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ReportState = { ok: boolean; message: string } | null;

const LIMIT = 5; // reports per visitor per hour

// "Report a mistake" on a story. No sign-in needed; a hidden field catches simple bots, and each
// visitor may send a few an hour. Reports go to the desk's queue.
export async function reportMistake(_prev: ReportState, form: FormData): Promise<ReportState> {
  const storyId = Number(form.get("story"));
  const note = String(form.get("note") ?? "").trim();
  if (String(form.get("website") ?? "")) return { ok: true, message: "Thanks." };
  if (!Number.isInteger(storyId) || storyId <= 0) {
    return { ok: false, message: "Something went wrong. Reload the page and try again." };
  }
  if (note.length < 3) return { ok: false, message: "Say briefly what is wrong." };
  if (note.length > 1000) return { ok: false, message: "Keep it under 1,000 characters." };
  if (!allow(`report:${await clientIp()}`, LIMIT, 3_600_000)) {
    return { ok: false, message: "You've sent several reports already. Try again in an hour." };
  }
  const db = adminClient();
  const [summary, reader] = await Promise.all([
    db
      .from("story_summaries")
      .select("id")
      .eq("story_id", storyId)
      .eq("status", "published")
      .maybeSingle(),
    getReader(),
  ]);
  const { error } = await db.from("summary_reports").insert({
    story_id: storyId,
    summary_id: summary.data?.id ?? null,
    reader_id: reader?.id ?? null,
    note,
  });
  if (error) {
    console.error("saving a report failed", { code: error.code });
    return { ok: false, message: "We couldn't send that just now. Try again in a moment." };
  }
  return { ok: true, message: "Thank you. An editor will check it." };
}

// Save a story for later, or take it off the list. Signed-in readers only; their own rows.
export async function toggleSaved(storyId: number, save: boolean): Promise<boolean> {
  const reader = await getReader();
  if (!reader || !Number.isInteger(storyId) || storyId <= 0) return false;
  const supabase = await createClient();
  const { error } = save
    ? await supabase
        .from("saved_stories")
        .upsert({ user_id: reader.id, story_id: storyId }, { onConflict: "user_id,story_id" })
    : await supabase
        .from("saved_stories")
        .delete()
        .eq("user_id", reader.id)
        .eq("story_id", storyId);
  if (error) console.error("saving a story failed", { code: error.code });
  return !error;
}
