import "server-only";
import { mailConfigured, send } from "@/lib/mailer";
import { adminClient } from "@/lib/supabase/admin";
import { renderTrialEmail, type TrialReminderKind } from "@/lib/trial-email";

// Sends the trial reminders that are due (migration 27: due_trial_reminders decides, at most one
// of each kind per reader, claimed before sending). Runs with the briefings, every 15 minutes.

type Due = { user_id: string; email: string; kind: TrialReminderKind; trial_ends_at: string };

const PAGE = 100;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

export async function runTrialReminders(
  options: { now?: number; only?: string[] } = {},
): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  if (!mailConfigured()) return result;
  const db = adminClient();
  const now = new Date(options.now ?? Date.now()).toISOString();
  for (let round = 0; round < 10; round++) {
    const { data, error } = await db.rpc("due_trial_reminders", {
      p_now: now,
      p_only: options.only ?? null,
      p_limit: PAGE,
    });
    if (error) throw new Error(`due trial reminders: ${error.message}`);
    const due = (data ?? []) as Due[];
    if (!due.length) break;
    for (const reader of due) {
      const claimed = await db.rpc("claim_trial_reminder", {
        p_user: reader.user_id,
        p_kind: reader.kind,
      });
      if (claimed.error || claimed.data !== true) continue;
      try {
        const id = reader.user_id;
        const [briefings, topics, outlets, saved] = await Promise.all([
          db
            .from("digests")
            .select("id", { count: "exact", head: true })
            .eq("user_id", id)
            .eq("status", "sent"),
          db
            .from("reader_topics")
            .select("topic_id", { count: "exact", head: true })
            .eq("user_id", id)
            .eq("choice", "follow"),
          db
            .from("reader_sources")
            .select("source_id", { count: "exact", head: true })
            .eq("user_id", id)
            .eq("choice", "follow"),
          db
            .from("saved_stories")
            .select("story_id", { count: "exact", head: true })
            .eq("user_id", id),
        ]);
        const endsOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(
          new Date(reader.trial_ends_at),
        );
        const email = renderTrialEmail(
          reader.kind,
          endsOn,
          {
            briefings: briefings.count ?? 0,
            topics: topics.count ?? 0,
            outlets: outlets.count ?? 0,
            saved: saved.count ?? 0,
          },
          siteUrl(),
        );
        await send({ to: reader.email, ...email });
        result.sent += 1;
      } catch {
        // Claimed but not sent: logged without the address; this reminder isn't retried.
        result.failed += 1;
        console.error("trial reminder failed", { kind: reader.kind });
      }
    }
  }
  return result;
}
