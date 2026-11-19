"use server";

import { revalidatePath } from "next/cache";
import { getReader } from "@/lib/auth";
import { outlets, topics } from "@/lib/news";
import { checkPreferences } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

export type SaveResult = { ok: true } | { ok: false; message: string };

// Saves the whole set of a reader's choices (from the wizard, a skip, or settings) in one step.
// The action checks the session itself rather than trusting the page that called it.
export async function savePreferences(raw: unknown): Promise<SaveResult> {
  const reader = await getReader();
  if (!reader) return { ok: false, message: "You're signed out. Sign in again to save." };

  const [topicList, outletList] = await Promise.all([topics(), outlets()]);
  const checked = checkPreferences(raw, {
    topics: new Set(topicList.map((t) => t.id)),
    sources: new Set(outletList.map((o) => o.id)),
  });
  if (!checked.ok) return checked;

  const v = checked.value;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_reader_preferences", {
    p_countries: v.countries,
    p_show_opinion: v.showOpinion,
    p_show_tier3: v.showTier3,
    p_follow_topics: v.followTopics,
    p_mute_topics: v.muteTopics,
    p_follow_sources: v.followSources,
    p_hide_sources: v.hideSources,
  });
  if (error) {
    console.error("saving preferences failed", { code: error.code });
    return { ok: false, message: "We couldn't save your choices just now. Try again in a moment." };
  }
  revalidatePath("/");
  return { ok: true };
}
