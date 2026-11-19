import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { confirmStop } from "./actions";

export const metadata: Metadata = { title: "Stop the daily briefing", robots: { index: false } };

// From "Stop these emails" in a briefing: one button, no sign-in needed (the link carries a token
// only Verilo can make). Asking first matters: mail scanners open links without anyone clicking.
export default function StopBriefingPage({ searchParams }: PageProps<"/briefing/stop">) {
  return (
    <div className="mx-auto max-w-prose py-10">
      <p className="kicker">Daily briefing</p>
      <Suspense fallback={<p className="meta mt-4">Loading…</p>}>
        <Stop searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Stop({ searchParams }: Pick<PageProps<"/briefing/stop">, "searchParams">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const result = one(q.result);
  if (result === "stopped") {
    return (
      <>
        <h1 className="mt-2 text-2xl md:text-3xl">You won’t get the daily briefing</h1>
        <p className="mt-4 text-ink-muted">
          No more briefing emails. You can turn it back on any time in{" "}
          <Link href="/my-news">My News</Link>.
        </p>
      </>
    );
  }
  if (result === "invalid" || result === "error" || !one(q.u) || !one(q.t)) {
    return (
      <>
        <h1 className="mt-2 text-2xl md:text-3xl">This link didn’t work</h1>
        <p className="mt-4 text-ink-muted">
          {result === "error"
            ? "Something went wrong on our side. Try again in a moment, or turn the briefing off in "
            : "It may have been cut short when it was copied. Turn the briefing off in "}
          <Link href="/my-news">My News</Link> instead.
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="mt-2 text-2xl md:text-3xl">Stop the daily briefing?</h1>
      <p className="mt-4 text-ink-muted">
        You’ll stop getting the morning email. Your front page and settings stay as they are.
      </p>
      <form action={confirmStop} className="mt-6">
        <input type="hidden" name="u" value={one(q.u)} />
        <input type="hidden" name="t" value={one(q.t)} />
        <button type="submit" className="button">
          Stop the briefing
        </button>
      </form>
    </>
  );
}
