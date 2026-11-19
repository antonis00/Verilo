import type { Metadata } from "next";
import { Suspense } from "react";
import { requireEditor } from "@/lib/auth";
import {
  ago,
  COUNTRY_LABEL,
  feedHealth,
  LEAN_LABEL,
  TIER_LABEL,
  type Lean,
  type Tier,
} from "@/lib/sources";
import { requestTime } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Desk",
  robots: { index: false, follow: false },
};

// The internal desk: what the ingester has brought in, and how each source's feeds are doing.
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

type ArticleRow = {
  id: number;
  title: string;
  snippet: string;
  url: string;
  published_at: string | null;
  sources: { name: string; tier: Tier; lean: Lean } | null;
};

async function Desk() {
  await requireEditor();
  const supabase = await createClient();
  const [sources, articles] = await Promise.all([
    supabase
      .from("sources")
      .select(
        "id, name, homepage, country, tier, lean, status, note, reviewed_on, source_feeds (url, section, active, last_success_at, last_error, consecutive_failures)",
      )
      .order("tier")
      .order("name")
      .returns<SourceRow[]>(),
    supabase
      .from("articles")
      .select("id, title, snippet, url, published_at, sources (name, tier, lean)")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(60)
      .returns<ArticleRow[]>(),
  ]);

  if (sources.error || articles.error) {
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

  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-rule py-5 sm:grid-cols-4">
        <Figure label="Active sources" value={active.length} />
        <Figure label="Paused" value={rows.length - active.length} />
        <Figure label="With a failing feed" value={failing} />
        <Figure label="Tier and lean not yet reviewed" value={unreviewed} />
      </dl>

      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        <section aria-labelledby="latest-title" className="lg:col-span-7">
          <h2 id="latest-title" className="text-xl">
            Latest articles
          </h2>
          <p className="meta mt-1">
            Headlines and snippets as stored. Grouping into stories comes in phase 3.
          </p>
          <ol className="mt-4">
            {(articles.data ?? []).map((a) => (
              <li key={a.id} className="border-t border-rule py-4">
                <p className="meta">
                  <span className="font-semibold text-ink">{a.sources?.name}</span>
                  {a.sources ? (
                    <>
                      {" · "}
                      {TIER_LABEL[a.sources.tier]} · {LEAN_LABEL[a.sources.lean]}
                    </>
                  ) : null}
                  {" · "}
                  <time dateTime={a.published_at ?? undefined} title={a.published_at ?? undefined}>
                    {ago(a.published_at, now)}
                  </time>
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
