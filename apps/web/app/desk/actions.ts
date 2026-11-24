"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { STORIES_TAG } from "@/lib/news";
import { adminClient } from "@/lib/supabase/admin";

// The desk's answers to a reported mistake. Only editors (requireEditor answers "not found" to
// anyone else); writes use the secret key, since readers can't write these tables at all.

export async function withdrawSummary(form: FormData) {
  await requireEditor();
  const reportId = Number(form.get("report"));
  const note = String(form.get("note") ?? "").trim();
  if (!Number.isInteger(reportId) || note.length < 3 || note.length > 1000) return;
  const db = adminClient();
  const { data: report } = await db
    .from("summary_reports")
    .select("id, story_id, summary_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return;
  // The story's published summary, whichever it is now.
  await db
    .from("story_summaries")
    .update({ status: "withdrawn" })
    .eq("story_id", report.story_id)
    .eq("status", "published");
  await db
    .from("corrections")
    .insert({ story_id: report.story_id, summary_id: report.summary_id, note });
  // Every open report on the story is answered by the same correction.
  await db
    .from("summary_reports")
    .update({ status: "withdrawn", resolved_at: new Date().toISOString() })
    .eq("story_id", report.story_id)
    .eq("status", "open");
  revalidateTag(STORIES_TAG, { expire: 0 });
  revalidatePath("/desk");
}

export async function dismissReport(form: FormData) {
  await requireEditor();
  const reportId = Number(form.get("report"));
  if (!Number.isInteger(reportId)) return;
  await adminClient()
    .from("summary_reports")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("status", "open");
  revalidatePath("/desk");
}
