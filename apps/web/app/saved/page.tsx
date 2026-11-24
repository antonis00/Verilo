import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireReader } from "@/lib/auth";
import { requestTime } from "@/lib/request-time";
import { ago } from "@/lib/sources";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved stories", robots: { index: false } };

// The stories a reader saved for later, newest saved first.
export default function SavedPage() {
  return (
    <div className="mx-auto max-w-prose py-6 md:py-10">
      <p className="kicker">Your account</p>
      <h1 className="mt-2 text-2xl md:text-3xl">Saved stories</h1>
      <Suspense fallback={<p className="meta mt-4">Loading…</p>}>
        <Saved />
      </Suspense>
    </div>
  );
}

type Row = {
  saved_at: string;
  stories: { id: number; title: string; outlet_count: number; last_published_at: string } | null;
};

async function Saved() {
  const reader = await requireReader("/saved");
  const supabase = await createClient();
  const [{ data }, now] = await Promise.all([
    supabase
      .from("saved_stories")
      .select("saved_at, stories (id, title, outlet_count, last_published_at)")
      .eq("user_id", reader.id)
      .order("saved_at", { ascending: false })
      .returns<Row[]>(),
    requestTime(),
  ]);
  const rows = (data ?? []).filter((r) => r.stories);
  if (!rows.length) {
    return (
      <p className="mt-6 border-t border-rule pt-6 text-ink-muted">
        Nothing saved yet. Use &ldquo;Save for later&rdquo; on any story.
      </p>
    );
  }
  return (
    <ol className="mt-6">
      {rows.map(({ saved_at, stories: s }) => (
        <li key={s!.id} className="border-t border-rule py-4">
          <h2 className="text-lg leading-snug">
            <Link href={`/story/${s!.id}`} className="quiet-link">
              {s!.title}
            </Link>
          </h2>
          <p className="meta mt-1">
            {s!.outlet_count} {s!.outlet_count === 1 ? "outlet" : "outlets"} · saved{" "}
            <time dateTime={saved_at}>{ago(saved_at, now)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
