import type { Metadata } from "next";
import { Suspense } from "react";
import { requireEditor } from "@/lib/auth";
import {
  ago,
  COUNTRY_LABEL,
  feedHealth,
  KIND_LABEL,
  LEAN_LABEL,
  leanSpread,
  summaryReadiness,
  TIER_LABEL,
  type Kind,
  type Lean,
  type Tier,
} from "@/lib/sources";
import { requestTime } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Desk",
  robots: { index: false, follow: false },
};

// The internal desk: the stories the pipeline has grouped, and how each source's feeds are doing.
// Editors only; everyone else gets "not found".
export default function DeskPage() {
  return (
    <div className="py-4 md:py-6">
      <p className="kicker">Internal</p>
      <h1 className="mt-2 text-2xl md:text-3xl">The desk</h1>
      <Suspense fallback={<p className="meta mt-4">Loading the desk…</p>}>
        <Desk />
      </Suspense>
    </div>
  );
}

type SourceRow = {
  id: number;
  name: string;
  homepage: string;
  country: string;
  tier: Tier;
  lean: Lean;
  status: "active" | "paused" | "excluded";
  note: string | null;
  reviewed_on: string | null;
  source_feeds: {
    url: string;
    section: string;
    active: boolean;
    last_success_at: string | null;
    last_error: string | null;
    consecutive_failures: number;
  }[];
};

type StoryArticle = {
  id: number;
  title: string;
  url: string;
  kind: Kind;
  kind_reason: string | null;
  published_at: string | null;
  sources: { id: number; name: string; tier: Tier; lean: Lean } | null;
};

type SummaryRow = {
  story_id: number;
  status: "published" | "failed" | "superseded";
  writer: string;
  checker: string | null;
  attempts: number;
  failure: string | null;
  created_at: string;
  // Published: the points; failed: the last draft, kept so the failure can be judged.
  bullets: { text: string }[];
};

type StoryRow = {
  id: number;
  title: string;
  last_published_at: string;
  article_count: number;
  outlet_count: number;
  articles: StoryArticle[];
};

const STORIES_SHOWN = 40;

async function Desk() {
  await requireEditor();
  const supabase = await createClient();
  const [sources, stories, allStories, topics] = await Promise.all([
    supabase
      .from("sources")
      .select(
        "id, name, homepage, country, tier, lean, status, note, reviewed_on, source_feeds (url, section, active, last_success_at, last_error, consecutive_failures)",
      )
      .order("tier")
      .order("name")
      .returns<SourceRow[]>(),
    // The most widely covered stories first: what a front page would lead with.
    supabase
      .from("stories")
      .select(
        "id, title, last_published_at, article_count, outlet_count, articles (id, title, url, kind, kind_reason, published_at, sources (id, name, tier, lean))",
      )
      .is("merged_into", null)
      .gte("outlet_count", 2)
      .order("outlet_count", { ascending: false })
      .order("last_published_at", { ascending: false })
      .limit(STORIES_SHOWN)
      .returns<StoryRow[]>(),
    supabase.from("stories").select("id", { count: "exact", head: true }).is("merged_into", null),
    supabase.from("topics").select("id, name").eq("active", true),
  ]);

  const storyIds = (stories.data ?? []).map((s) => s.id);
  const [summaries, recentSummaries] = await Promise.all([
    storyIds.length
      ? supabase
          .from("story_summaries")
          .select("story_id, status, writer, checker, attempts, failure, created_at, bullets")
          .in("story_id", storyIds)
          .neq("status", "superseded")
          .order("created_at", { ascending: false })
          .returns<SummaryRow[]>()
      : { data: [] as SummaryRow[], error: null },
    supabase
      .from("story_summaries")
      .select("status")
      .gte("created_at", new Date((await requestTime()) - 86_400_000).toISOString())
      .returns<{ status: string }[]>(),
  ]);
  const storyTopics = storyIds.length
    ? await supabase
        .from("story_topics")
        .select("story_id, topic_id, articles")
        .in("story_id", storyIds)
        .order("articles", { ascending: false })
    : { data: [], error: null };

  if (
    sources.error ||
    stories.error ||
    topics.error ||
    storyTopics.error ||
    summaries.error ||
    recentSummaries.error
  ) {
    return (
      <p role="alert" className="mt-6 border-l-2 border-accent pl-4">
        The desk couldn’t load from the database. Is it running?
      </p>
    );
  }

  const now = await requestTime();
  const rows = sources.data ?? [];
  const active = rows.filter((s) => s.status === "active");
  const failing = active.filter((s) =>
    s.source_feeds.some((f) => feedHealth(f) === "failing"),
  ).length;
  const unreviewed = rows.filter((s) => !s.reviewed_on).length;
  const topicName = new Map((topics.data ?? []).map((t) => [t.id, t.name]));
  const summaryOf = new Map<number, SummaryRow>();
  for (const row of summaries.data ?? [])
    if (!summaryOf.has(row.story_id)) summaryOf.set(row.story_id, row);
  const lastDay = recentSummaries.data ?? [];
  const topicsOf = new Map<number, string[]>();
  for (const st of storyTopics.data ?? []) {
    const list = topicsOf.get(st.story_id) ?? [];
    const name = topicName.get(st.topic_id);
    if (name && list.length < 3) list.push(name);
    topicsOf.set(st.story_id, list);
  }

  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-rule py-5 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="Active sources" value={active.length} />
        <Figure label="Stories" value={allStories.count ?? 0} />
        <Figure label="With a failing feed" value={failing} />
        <Figure label="Tier and lean not yet reviewed" value={unreviewed} />
        <Figure
          label="Summaries published, last 24 h"
          value={lastDay.filter((r) => r.status !== "failed").length}
        />
        <Figure
          label="Summaries failed, last 24 h"
          value={lastDay.filter((r) => r.status === "failed").length}
        />
      </dl>

      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        <section aria-labelledby="stories-title" className="lg:col-span-7">
          <h2 id="stories-title" className="text-xl">
            Stories
          </h2>
          <p className="meta mt-1">
            The {STORIES_SHOWN} most widely covered stories of the last days, each one event
            reported by several outlets.
          </p>
          <ol className="mt-4">
            {(stories.data ?? []).map((s) => (
              <StoryItem
                key={s.id}
                story={s}
                topics={topicsOf.get(s.id) ?? []}
                summary={summaryOf.get(s.id)}
                now={now}
              />
            ))}
          </ol>
        </section>

        <section aria-labelledby="sources-title" className="lg:col-span-5">
          <h2 id="sources-title" className="text-xl">
            Sources
          </h2>
          <p className="meta mt-1">
            Edit <code>workers/data/sources.toml</code>, then run <code>sync-sources</code>.
          </p>
          <ul className="mt-4">
            {rows.map((s) => (
              <SourceItem key={s.id} source={s} now={now} />
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function StoryItem({
  story: s,
  topics,
  summary,
  now,
}: {
  story: StoryRow;
  topics: string[];
  summary: SummaryRow | undefined;
  now: number;
}) {
  const articles = [...s.articles].sort((a, b) =>
    (b.published_at ?? "").localeCompare(a.published_at ?? ""),
  );
  const readiness = summaryReadiness(articles.map((a) => ({ kind: a.kind, source: a.sources })));
  const leans = leanSpread(
    articles.flatMap((a) => (a.kind === "news" && a.sources ? [a.sources.lean] : [])),
  );
  return (
    <li className="border-t border-rule py-4">
      <p className="meta">
        {s.outlet_count} outlets · {s.article_count} articles · updated{" "}
        <time dateTime={s.last_published_at}>{ago(s.last_published_at, now)}</time>
        {topics.length ? ` · ${topics.join(", ")}` : ""}
      </p>
      <h3 className="mt-1 text-lg leading-snug">{s.title}</h3>
      <p className="meta mt-1">
        Leans: {leans.map((l) => LEAN_LABEL[l]).join(", ") || "none"} ·{" "}
        {summary?.status === "published" ? (
          <span className="text-ink">
            summary published{" "}
            <time dateTime={summary.created_at}>{ago(summary.created_at, now)}</time> after{" "}
            {summary.attempts} {summary.attempts === 1 ? "draft" : "drafts"}
          </span>
        ) : summary?.status === "failed" ? (
          <span className="text-accent">
            summary failed <time dateTime={summary.created_at}>{ago(summary.created_at, now)}</time>
            , headlines shown instead
          </span>
        ) : readiness.ready ? (
          <span className="text-ink">meets the summary rule</span>
        ) : (
          <>no summary yet: needs {readiness.missing.join(", ")}</>
        )}
      </p>
      {summary?.status === "failed" && summary.failure ? (
        <p className="mt-1 border-l-2 border-accent pl-3 text-sm text-ink-muted">
          {summary.failure}
        </p>
      ) : null}
      {summary?.status === "failed" && summary.bullets.length ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">
            The draft that failed
          </summary>
          <ul className="mt-2 space-y-1 border-l border-rule pl-4">
            {summary.bullets.map((b, i) => (
              <li key={i}>{b.text}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">
          The {articles.length} articles
        </summary>
        <ul className="mt-2 space-y-2 border-l border-rule pl-4">
          {articles.map((a) => (
            <li key={a.id}>
              <span className="meta">
                {a.sources?.name}
                {a.sources ? ` · ${LEAN_LABEL[a.sources.lean]}` : ""}
                {KIND_LABEL[a.kind] ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-accent" title={a.kind_reason ?? undefined}>
                      {KIND_LABEL[a.kind]}
                    </span>
                  </>
                ) : null}
              </span>
              <br />
              <a href={a.url} rel="noopener noreferrer" className="quiet-link">
                {a.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="meta">{label}</dt>
      <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const HEALTH_TEXT = { ok: "OK", failing: "Failing", waiting: "Not fetched yet", off: "Off" };

function SourceItem({ source: s, now }: { source: SourceRow; now: number }) {
  const feeds = s.source_feeds;
  const broken = feeds.filter((f) => feedHealth(f) === "failing");
  const lastSuccess = feeds
    .map((f) => f.last_success_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);
  return (
    <li className="border-t border-rule py-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <a href={s.homepage} rel="noopener noreferrer" className="quiet-link font-semibold">
          {s.name}
        </a>
        <span className={s.status === "active" ? "meta" : "meta text-accent"}>
          {s.status === "active" ? ago(lastSuccess ?? null, now) : s.status}
        </span>
      </div>
      <p className="meta mt-0.5">
        {COUNTRY_LABEL[s.country] ?? s.country} · Tier {s.tier} ({TIER_LABEL[s.tier]}) ·{" "}
        {LEAN_LABEL[s.lean]} · {feeds.length} {feeds.length === 1 ? "feed" : "feeds"}
        {s.reviewed_on ? ` · reviewed ${s.reviewed_on}` : " · not reviewed"}
      </p>
      {broken.length ? (
        <p className="mt-1 text-accent">
          {HEALTH_TEXT.failing}: {broken.map((f) => `${f.section} (${f.last_error})`).join(", ")}
        </p>
      ) : null}
      {s.note ? <p className="meta mt-1">{s.note}</p> : null}
    </li>
  );
}
