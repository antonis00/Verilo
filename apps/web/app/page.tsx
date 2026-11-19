import Link from "next/link";
import { Suspense } from "react";
import { FrontPage } from "@/components/front-page";
import { getReader } from "@/lib/auth";
import { NO_PREFERENCES, rank } from "@/lib/feed";
import { cacheStories, candidateCards, topicNames } from "@/lib/news";
import { toRanking } from "@/lib/preferences";
import { loadPreferences } from "@/lib/reader-preferences";
import { shouldRemind, trialLine } from "@/lib/trial";
import { cachedTime, requestTime } from "@/lib/request-time";

// The front page. Everyone first gets the general page, ranked without preferences and cached,
// so it arrives in the static shell at once. A reader who has set up their preferences then gets
// their own ranking streamed in its place.
export default function Home() {
  return (
    <>
      <h1 className="sr-only">Today’s front page</h1>
      <Suspense fallback={<GeneralFront />}>
        <ReaderFront />
      </Suspense>
    </>
  );
}

async function GeneralFront() {
  "use cache";
  cacheStories();
  const [cards, names] = await Promise.all([candidateCards(), topicNames()]);
  const now = cachedTime();
  return (
    <>
      <Invite />
      <FrontPage
        page={rank(cards, NO_PREFERENCES, now, { topicNames: names })}
        topicNames={names}
        now={now}
        personal={false}
      />
    </>
  );
}

async function ReaderFront() {
  const reader = await getReader();
  if (!reader) return <GeneralFront />;
  const saved = await loadPreferences(reader.id);
  if (!saved.onboarded) return <GeneralFront />;

  const [cards, names, now] = await Promise.all([candidateCards(), topicNames(), requestTime()]);
  const prefs = toRanking(saved.input);
  const personal = prefs.followTopics.length > 0 || prefs.followSources.length > 0;
  return (
    <>
      {shouldRemind(reader.trial) ? <TrialNotice line={trialLine(reader.trial)!} /> : null}
      <FrontPage
        page={rank(cards, prefs, now, { topicNames: names })}
        topicNames={names}
        now={now}
        personal={personal}
      />
    </>
  );
}

// Near the end of the free trial, and after it: one quiet line, never a wall.
function TrialNotice({ line }: { line: string }) {
  return (
    <aside aria-label="Your free trial" className="mb-8 border-y border-rule py-4 text-sm">
      {line} <Link href="/my-news">Your account</Link>
    </aside>
  );
}

// The same for visitors and for readers who haven't set up yet, so swapping one page for the
// other never moves the layout.
function Invite() {
  return (
    <aside
      aria-label="Make this front page yours"
      className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-rule py-4"
    >
      <p className="text-sm">
        <span className="font-semibold">Make this front page yours.</span>{" "}
        <span className="text-ink-muted">
          Choose topics, places and outlets in under a minute.{" "}
          <Link href="/about">How Verilo works</Link>
        </span>
      </p>
      <Link href="/welcome" className="button">
        Get started
      </Link>
    </aside>
  );
}
