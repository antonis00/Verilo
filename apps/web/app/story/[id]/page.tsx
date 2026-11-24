import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { StorySummary } from "@/components/story-summary";
import { ReportMistake } from "@/components/report-mistake";
import { mergedInto, relatedStories, storyCard, storyCorrections, topicNames } from "@/lib/news";
import { requestTime } from "@/lib/request-time";
import {
  ago,
  COUNTRY_LABEL,
  KIND_LABEL,
  LEAN_LABEL,
  leanSpread,
  TIER_LABEL,
  type Lean,
} from "@/lib/sources";

export const metadata: Metadata = { title: "Story" };

// One story: the event's headline and every outlet's version, with how much we rely on each
// outlet and where it leans, under the checked AI summary when the story has one.
export default function StoryPage({ params }: PageProps<"/story/[id]">) {
  return (
    <Suspense fallback={<p className="meta py-10">Loading the story…</p>}>
      <Story params={params} />
    </Suspense>
  );
}

async function Story({ params }: Pick<PageProps<"/story/[id]">, "params">) {
  const { id } = await params;
  const storyId = Number(id);
  if (!Number.isInteger(storyId) || storyId <= 0) notFound();
  const [card, names, now, corrections] = await Promise.all([
    storyCard(storyId),
    topicNames(),
    requestTime(),
    storyCorrections(storyId),
  ]);
  if (!card) {
    // A story merged into another (the same event, found twice): its links go to that one.
    const into = await mergedInto(storyId);
    if (into) permanentRedirect(`/story/${into}`);
    notFound();
  }
  const related = await relatedStories(card.id, card.follows);

  const articles = [...card.articles].sort(
    (a, b) => a.tier - b.tier || (b.published_at ?? "").localeCompare(a.published_at ?? ""),
  );
  const news = articles.filter((a) => a.kind === "news");
  const leans = leanSpread(news.map((a) => a.lean as Lean));
  const topic = card.topic_ids[0];

  return (
    <article className="mx-auto max-w-prose py-4 md:py-8">
      {topic !== undefined && names.get(topic) ? (
        <p className="kicker">{names.get(topic)}</p>
      ) : null}
      <h1 className="mt-2 text-3xl md:text-4xl">{card.title}</h1>
      <p className="meta mt-4">
        Reported by {card.outlet_count} {card.outlet_count === 1 ? "outlet" : "outlets"} · updated{" "}
        <time dateTime={card.last_published_at}>{ago(card.last_published_at, now)}</time>
        {leans.length ? ` · leans: ${leans.map((l) => LEAN_LABEL[l]).join(", ")}` : ""}
      </p>
      {related.earlier ? (
        <p className="meta mt-2">
          Continues an earlier story:{" "}
          <Link href={`/story/${related.earlier.id}`}>{related.earlier.title}</Link>
        </p>
      ) : null}
      {related.later.length ? (
        <p className="meta mt-2">
          Later developments:{" "}
          {related.later.map((s, i) => (
            <span key={s.id}>
              {i ? " · " : ""}
              <Link href={`/story/${s.id}`}>{s.title}</Link>
            </span>
          ))}
        </p>
      ) : null}
      {corrections.map((c) => (
        <p key={c.id} className="mt-4 border-l-2 border-accent pl-3 text-sm">
          <span className="font-semibold">
            Correction, <time dateTime={c.created_at}>{ago(c.created_at, now)}</time>:
          </span>{" "}
          {c.note} <Link href="/corrections">All corrections</Link>
        </p>
      ))}

      {card.summary ? (
        <section
          aria-labelledby="summary-title"
          className="mt-8 border-t-[3px] border-double border-ink pt-6"
        >
          <h2 id="summary-title" className="text-xl">
            In brief
          </h2>
          <StorySummary summary={card.summary} articles={card.articles} />
        </section>
      ) : null}

      <section
        aria-labelledby="coverage-title"
        className="mt-10 border-t-[3px] border-double border-ink pt-6"
      >
        <h2 id="coverage-title" className="text-xl">
          How each outlet reported it
        </h2>
        <p className="meta mt-1">
          Headlines and short excerpts; the full articles are on each outlet’s site.
        </p>
        <ol className="mt-4">
          {articles.map((a) => (
            <li key={a.id} className="border-t border-rule py-4">
              <p className="meta">
                <span className="font-semibold text-ink">{a.source}</span> ·{" "}
                {COUNTRY_LABEL[a.country] ?? a.country} · {TIER_LABEL[a.tier]} ·{" "}
                {LEAN_LABEL[a.lean]}
                {KIND_LABEL[a.kind] ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-accent">{KIND_LABEL[a.kind]}</span>
                  </>
                ) : null}
              </p>
              <h3 className="mt-1 text-lg leading-snug">
                <a href={a.url} rel="noopener noreferrer" className="quiet-link">
                  {a.title}
                </a>
              </h3>
              {a.snippet ? <p className="mt-1 text-sm text-ink-muted">{a.snippet}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-8 border-t border-rule pt-6">
        <ReportMistake storyId={card.id} />
      </div>
      <p className="mt-6 text-sm">
        <Link href="/">Back to the front page</Link>
      </p>
    </article>
  );
}
