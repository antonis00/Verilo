import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { allCorrections } from "@/lib/news";

export const metadata: Metadata = {
  title: "Corrections",
  description: "Every AI summary Verilo withdrew, and why.",
};

// Every withdrawn summary, newest first: what was wrong, and a link to the story.
export default function CorrectionsPage() {
  return (
    <div className="mx-auto max-w-prose py-6 md:py-10">
      <p className="kicker">Standards</p>
      <h1 className="mt-2 text-2xl md:text-3xl">Corrections</h1>
      <p className="mt-4 text-ink-muted">
        When a summary is wrong, it is withdrawn: the story goes back to the outlets’ own headlines
        and links, and the reason is recorded here. Anyone can report a mistake from the foot of any
        story.
      </p>
      <Suspense fallback={<p className="meta mt-6">Loading…</p>}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const corrections = await allCorrections();
  if (!corrections.length) {
    return <p className="mt-8 border-t border-rule pt-6">No corrections so far.</p>;
  }
  const date = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(iso),
    );
  return (
    <ol className="mt-8">
      {corrections.map((c) => (
        <li key={c.id} className="border-t border-rule py-4">
          <p className="meta">
            <time dateTime={c.created_at}>{date(c.created_at)}</time>
          </p>
          <p className="mt-1 font-semibold">
            <Link href={`/story/${c.story_id}`}>{c.story_title ?? "A story"}</Link>
          </p>
          <p className="mt-1 text-ink-muted">{c.note}</p>
        </li>
      ))}
    </ol>
  );
}
