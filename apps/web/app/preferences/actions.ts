"use server";

import { revalidatePath } from "next/cache";
import { getReader } from "@/lib/auth";
import { outlets, topics } from "@/lib/news";
import { isTimeZone } from "@/lib/briefing";
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
    p_regions: v.regions,
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

// The daily briefing's settings, from the settings page. The time zone comes from the browser.
export async function saveBriefing(raw: unknown): Promise<SaveResult> {
  const reader = await getReader();
  if (!reader) return { ok: false, message: "You're signed out. Sign in again to save." };
  const r = (raw ?? {}) as Record<string, unknown>;
  const hour = r.sendHour;
  if (
    typeof r.enabled !== "boolean" ||
    typeof hour !== "number" ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    (r.length !== "short" && r.length !== "full") ||
    !isTimeZone(r.timeZone)
  ) {
    return { ok: false, message: "Some choices couldn't be read. Reload the page and try again." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("digest_settings").upsert(
    {
      user_id: reader.id,
      enabled: r.enabled,
      send_hour: hour,
      length: r.length,
      time_zone: r.timeZone,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("saving briefing settings failed", { code: error.code });
    return { ok: false, message: "We couldn't save your choices just now. Try again in a moment." };
  }
  return { ok: true };
}

// After the welcome wizard: note the reader's time zone, so their first briefing comes the next
// morning at 7 their time. Never overwrites settings they already chose.
export async function rememberTimeZone(timeZone: unknown): Promise<void> {
  const reader = await getReader();
  if (!reader || !isTimeZone(timeZone)) return;
  const supabase = await createClient();
  await supabase
    .from("digest_settings")
    .upsert(
      { user_id: reader.id, time_zone: timeZone },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
}
