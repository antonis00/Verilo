import { NextResponse, type NextRequest } from "next/server";
import { runBriefings } from "@/lib/briefing-run";
import { runTrialReminders } from "@/lib/trial-run";
import { hasBearer } from "@/lib/secrets";

// Sends the daily briefings that are due, and the trial reminders (lib/trial-run.ts). The pipeline calls it every 15 minutes with
// `Authorization: Bearer <BRIEFING_SECRET>`; without that secret the endpoint doesn't exist.
// Tests may pass {"now": "<ISO time>", "only": ["<user id>"]} to run for a given time and readers.
export async function POST(request: NextRequest) {
  if (!hasBearer(request.headers, process.env.BRIEFING_SECRET)) {
    return new NextResponse(null, { status: 404 });
  }
  let now: number | undefined;
  let only: string[] | undefined;
  // `now` and `only` are for tests (BRIEFING_TEST_MODE=1); a real run is always now, for everyone.
  if (process.env.BRIEFING_TEST_MODE !== "1") {
    try {
      const briefings = await runBriefings();
      return NextResponse.json({ ...briefings, trial: await runTrialReminders() });
    } catch (error) {
      console.error("briefing run failed", {
        message: error instanceof Error ? error.message : error,
      });
      return NextResponse.json({ error: "briefing run failed" }, { status: 500 });
    }
  }
  try {
    const body = (await request.json()) as { now?: unknown; only?: unknown };
    if (typeof body.now === "string" && !Number.isNaN(Date.parse(body.now))) {
      now = Date.parse(body.now);
    }
    if (Array.isArray(body.only))
      only = body.only.filter((u): u is string => typeof u === "string");
  } catch {
    // No body: every reader, now.
  }
  try {
    const briefings = await runBriefings({ now, only });
    return NextResponse.json({ ...briefings, trial: await runTrialReminders({ now, only }) });
  } catch (error) {
    console.error("briefing run failed", {
      message: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: "briefing run failed" }, { status: 500 });
  }
}
