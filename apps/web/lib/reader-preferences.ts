import "server-only";
import { EMPTY_INPUT, type PreferencesInput } from "@/lib/preferences";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type Saved = { input: PreferencesInput; onboarded: boolean };

// A reader's choices. By default as the signed-in reader (row-level security returns only their
// rows); the briefing job passes the secret-key client to read any reader's.
export async function loadPreferences(userId: string, client?: SupabaseClient): Promise<Saved> {
  const supabase = client ?? (await createClient());
  const [prefs, topicRows, sourceRows] = await Promise.all([
    supabase
      .from("reader_preferences")
      .select("regions, show_opinion, show_tier3, onboarded_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("reader_topics").select("topic_id, choice").eq("user_id", userId),
    supabase.from("reader_sources").select("source_id, choice").eq("user_id", userId),
  ]);
  const topics = topicRows.data ?? [];
  const sources = sourceRows.data ?? [];
  return {
    onboarded: Boolean(prefs.data?.onboarded_at),
    input: {
      ...EMPTY_INPUT,
      regions: prefs.data?.regions ?? [],
      showOpinion: prefs.data?.show_opinion ?? true,
      showTier3: prefs.data?.show_tier3 ?? true,
      followTopics: topics.filter((t) => t.choice === "follow").map((t) => t.topic_id),
      muteTopics: topics.filter((t) => t.choice === "mute").map((t) => t.topic_id),
      followSources: sources.filter((s) => s.choice === "follow").map((s) => s.source_id),
      hideSources: sources.filter((s) => s.choice === "hide").map((s) => s.source_id),
    },
  };
}
