import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OwnItems } from "@/components/own-items";
import { requireReader } from "@/lib/auth";
import { ownItems, ownSources } from "@/lib/own-sources-db";
import { requestTime } from "@/lib/request-time";

export const metadata: Metadata = { title: "From your sources", robots: { index: false } };

// Everything from the sources a reader added, the past 14 days, newest first.
export default function YourSourcesPage() {
  return (
    <div className="mx-auto max-w-prose py-6 md:py-10">
      <p className="kicker">Your own sources</p>
      <h1 className="mt-2 text-2xl md:text-3xl">From your sources</h1>
      <p className="meta mt-2">
        Feeds and channels you added. Verilo doesn’t check or rate them, and keeps them out of its
        summaries. <Link href="/my-news#own-sources">Manage your sources</Link>
      </p>
      <Suspense fallback={<p className="meta mt-4">Loading…</p>}>
        <Items />
      </Suspense>
    </div>
  );
}

async function Items() {
  await requireReader("/your-sources");
  const [{ sources }, items, now] = await Promise.all([ownSources(), ownItems(200), requestTime()]);
  if (!sources.length) {
    return (
      <p className="mt-6 border-t border-rule pt-6 text-ink-muted">
        You haven’t added any sources yet.{" "}
        <Link href="/my-news#own-sources">Add a feed or channel</Link>
      </p>
    );
  }
  if (!items.length) {
    return (
      <p className="mt-6 border-t border-rule pt-6 text-ink-muted">
        Nothing from your sources in the past two weeks yet. New items appear within half an hour of
        being published.
      </p>
    );
  }
  return (
    <div className="mt-6 border-t border-rule">
      <OwnItems items={items} sources={sources} now={now} snippets />
    </div>
  );
}
