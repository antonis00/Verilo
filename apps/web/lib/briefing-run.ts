import "server-only";
import { buildBriefing, renderEmail } from "@/lib/briefing";
import { unsubscribeToken } from "@/lib/briefing-token";
import { rank } from "@/lib/feed";
import { mailConfigured, send } from "@/lib/mailer";
import { candidateCards, topicNames } from "@/lib/news";
import { toRanking } from "@/lib/preferences";
import { loadPreferences } from "@/lib/reader-preferences";
import { adminClient } from "@/lib/supabase/admin";

// Sends the briefings that are due. Called every 15 minutes by the pipeline (POST
// /api/briefing/run). The database works out who is due (due_briefings: opted in, onboarded,
// their local hour has come, today's briefing not yet sent), a page at a time, with each
// reader's email. Each briefing is claimed first (claim_briefing: one row per reader per local
// day, so never sent twice; a failed or stuck send is tried again, up to 3 times). Readers are
// sent a few at a time, and a run stops after TIME_BUDGET_MS; the next run carries on.

export type RunResult = { due: number; sent: number; empty: number; failed: number };

const PAGE = 100;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 50_000;

type Due = { user_id: string; email: string; send_length: "short" | "full"; local_date: string };

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

// What went wrong, as a short code: the raw SMTP error can quote the reader's address.
export function errorCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket|connect/i.test(text)) return "smtp-unreachable";
  if (/\b5\d\d\b/.test(text)) return "smtp-rejected";
  if (/\b4\d\d\b/.test(text)) return "smtp-deferred";
  return "error";
}

export async function runBriefings(
  options: { now?: number; only?: string[] } = {},
): Promise<RunResult> {
  const now = options.now ?? Date.now();
  const started = Date.now();
  const result: RunResult = { due: 0, sent: 0, empty: 0, failed: 0 };
  const db = adminClient();
  if (!mailConfigured()) {
    const { data } = await db.rpc("due_briefings", {
      p_now: new Date(now).toISOString(),
      p_only: options.only ?? null,
      p_limit: 1,
    });
    if (data?.length) console.error("briefings due but SMTP_HOST is not set; nothing sent");
    return result;
  }

  let cards: Awaited<ReturnType<typeof candidateCards>> | null = null;
  let names = new Map<number, string>();
  const seen = new Set<string>();
  while (Date.now() - started < TIME_BUDGET_MS) {
    const page = await db.rpc("due_briefings", {
      p_now: new Date(now).toISOString(),
      p_only: options.only ?? null,
      p_limit: PAGE,
    });
    if (page.error) throw new Error(`due readers: ${page.error.message}`);
    // Readers this run already tried (and that may be due again for a retry) are left for the
    // next run, so one run never loops on the same reader.
    const due = ((page.data ?? []) as Due[]).filter((r) => !seen.has(r.user_id));
    if (!due.length) break;
    if (!cards) [cards, names] = await Promise.all([candidateCards(), topicNames()]);
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      await Promise.all(
        due.slice(i, i + CONCURRENCY).map(async (reader) => {
          seen.add(reader.user_id);
          const claim = await db.rpc("claim_briefing", {
            p_user: reader.user_id,
            p_date: reader.local_date,
          });
          if (claim.error || claim.data === null) return;
          result.due += 1;
          const finish = (fields: Record<string, unknown>) =>
            db.from("digests").update(fields).eq("id", claim.data);
          try {
            await sendOne(reader, now, cards!, names, finish, result);
          } catch (error) {
            result.failed += 1;
            const code = errorCode(error);
            console.error("briefing failed", { code });
            await finish({ status: "failed", error: code });
          }
        }),
      );
      if (Date.now() - started >= TIME_BUDGET_MS) break;
    }
  }
  return result;
}

async function sendOne(
  reader: Due,
  now: number,
  cards: Awaited<ReturnType<typeof candidateCards>>,
  names: Map<number, string>,
  finish: (fields: Record<string, unknown>) => PromiseLike<unknown>,
  result: RunResult,
) {
  const { input } = await loadPreferences(reader.user_id, adminClient());
  const briefing = buildBriefing(
    rank(cards, toRanking(input), now, { topicNames: names }),
    reader.send_length,
    names,
  );
  if (!briefing.stories.length && !briefing.everyone.length) {
    result.empty += 1;
    await finish({ status: "empty" });
    return;
  }
  const site = siteUrl();
  const token = unsubscribeToken(reader.user_id);
  const unsubscribe = `${site}/briefing/stop?u=${reader.user_id}&t=${token}`;
  const day = new Date(`${reader.local_date}T12:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(day);
  const message = renderEmail(
    briefing,
    {
      label: fmt({ weekday: "long", day: "numeric", month: "long" }),
      weekday: fmt({ weekday: "long" }),
    },
    { site, unsubscribe },
  );
  await send({
    to: reader.email,
    ...message,
    // One-click unsubscribe in the mail app itself (RFC 8058), which Gmail and Yahoo expect.
    headers: {
      "List-Unsubscribe": `<${site}/api/briefing/unsubscribe?u=${reader.user_id}&t=${token}>`,
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
