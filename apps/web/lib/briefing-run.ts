import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBriefing,
  isDue,
  renderEmail,
  settingsFrom,
  type BriefingSettings,
  type SettingsRow,
} from "@/lib/briefing";
import { unsubscribeToken } from "@/lib/briefing-token";
import { rank } from "@/lib/feed";
import { mailConfigured, send } from "@/lib/mailer";
import { candidateCards, topicNames } from "@/lib/news";
import { toRanking } from "@/lib/preferences";
import { loadPreferences } from "@/lib/reader-preferences";
import { adminClient } from "@/lib/supabase/admin";

// Sends the briefings that are due. Called every 15 minutes by the pipeline (POST
// /api/briefing/run). For each onboarded reader whose local hour has come (lib/briefing.ts
// isDue), claim today's row in `digests` first: the unique (reader, day) key means a briefing is
// sent at most once a day, even if two runs overlap. Then rank their stories, build and send.

export type RunResult = { due: number; sent: number; empty: number; failed: number };

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

export async function runBriefings(
  options: { now?: number; only?: string[] } = {},
): Promise<RunResult> {
  const now = options.now ?? Date.now();
  const result: RunResult = { due: 0, sent: 0, empty: 0, failed: 0 };
  const db = adminClient();

  let readersQuery = db
    .from("reader_preferences")
    .select("user_id")
    .not("onboarded_at", "is", null);
  if (options.only) readersQuery = readersQuery.in("user_id", options.only);
  const readers = await readersQuery;
  if (readers.error) throw new Error(`readers: ${readers.error.message}`);
  const ids = (readers.data ?? []).map((r) => r.user_id as string);
  if (!ids.length) return result;

  const settings = await db
    .from("digest_settings")
    .select("user_id, enabled, send_hour, length, time_zone")
    .in("user_id", ids)
    .returns<SettingsRow[]>();
  if (settings.error) throw new Error(`settings: ${settings.error.message}`);
  const byUser = new Map((settings.data ?? []).map((s) => [s.user_id, s]));

  const due = ids
    .map((id) => ({ id, settings: settingsFrom(byUser.get(id)) }))
    .map((r) => ({ ...r, ...isDue(r.settings, now) }))
    .filter((r) => r.due);
  if (!due.length) return result;
  if (!mailConfigured()) {
    console.error("briefings due but SMTP_HOST is not set; nothing sent");
    return { ...result, due: due.length };
  }

  const [cards, names] = await Promise.all([candidateCards(), topicNames()]);
  for (const reader of due) {
    // Claim today's briefing; a reader already claimed (sent, or another run) is skipped.
    const claim = await db
      .from("digests")
      .insert({ user_id: reader.id, local_date: reader.date, status: "sending" })
      .select("id")
      .single();
    if (claim.error) continue;
    result.due += 1;
    const finish = (fields: Record<string, unknown>) =>
      db.from("digests").update(fields).eq("id", claim.data.id);
    try {
      await sendOne(db, reader.id, reader.settings, reader.date, now, cards, names, finish, result);
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error("briefing failed", { message });
      await finish({ status: "failed", error: message.slice(0, 500) });
    }
  }
  return result;
}

async function sendOne(
  db: SupabaseClient,
  userId: string,
  settings: BriefingSettings,
  date: string,
  now: number,
  cards: Awaited<ReturnType<typeof candidateCards>>,
  names: Map<number, string>,
  finish: (fields: Record<string, unknown>) => PromiseLike<unknown>,
  result: RunResult,
) {
  const [{ input }, user] = await Promise.all([
    loadPreferences(userId, db),
    db.auth.admin.getUserById(userId),
  ]);
  const email = user.data.user?.email;
  if (!email) throw new Error("the reader has no email address");

  const briefing = buildBriefing(
    rank(cards, toRanking(input), now, { topicNames: names }),
    settings.length,
    names,
  );
  if (!briefing.stories.length && !briefing.everyone.length) {
    result.empty += 1;
    await finish({ status: "empty" });
    return;
  }
  const site = siteUrl();
  const unsubscribe = `${site}/briefing/stop?u=${userId}&t=${unsubscribeToken(userId)}`;
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const message = renderEmail(briefing, dateLabel, { site, unsubscribe });
  await send({
    to: email,
    ...message,
    // One-click unsubscribe in the mail app itself (RFC 8058), which Gmail and Yahoo expect.
    headers: {
      "List-Unsubscribe": `<${site}/api/briefing/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  result.sent += 1;
  await finish({
    status: "sent",
    sent_at: new Date().toISOString(),
    story_ids: [...briefing.stories, ...briefing.everyone].map((s) => s.id),
  });
}

// Turns a reader's briefing off (from an email link: no session, so the secret-key client).
export async function stopBriefing(userId: string): Promise<boolean> {
  const { error } = await adminClient()
    .from("digest_settings")
    .upsert({ user_id: userId, enabled: false }, { onConflict: "user_id" });
  if (error) console.error("stopping a briefing failed", { code: error.code });
  return !error;
}
