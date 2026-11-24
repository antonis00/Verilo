import { NextResponse } from "next/server";
import { getReader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// "Download my data": everything Verilo keeps about the signed-in reader, as JSON. Read with the
// reader's own session, so row-level security returns only their rows.
export async function GET() {
  const reader = await getReader();
  if (!reader) return new NextResponse(null, { status: 401 });
  const db = await createClient();
  const [profile, preferences, topics, sources, briefing, briefings] = await Promise.all([
    db
      .from("profiles")
      .select("created_at, trial_ends_at, subscribed_until")
      .eq("id", reader.id)
      .maybeSingle(),
    db
      .from("reader_preferences")
      .select("regions, show_opinion, show_tier3, onboarded_at")
      .eq("user_id", reader.id)
      .maybeSingle(),
    db.from("reader_topics").select("choice, topics (name)").eq("user_id", reader.id),
    db.from("reader_sources").select("choice, sources (name)").eq("user_id", reader.id),
    db
      .from("digest_settings")
      .select("enabled, send_hour, length, time_zone, consented_at")
      .eq("user_id", reader.id)
      .maybeSingle(),
    db
      .from("digests")
      .select("local_date, status, sent_at, story_ids")
      .eq("user_id", reader.id)
      .order("local_date", { ascending: false }),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    account: { email: reader.email, ...profile.data },
    preferences: preferences.data,
    topics: topics.data,
    outlets: sources.data,
    daily_briefing: briefing.data,
    briefings_sent: briefings.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="verilo-my-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
