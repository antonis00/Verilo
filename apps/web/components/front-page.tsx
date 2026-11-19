import Link from "next/link";
import type { FrontPage as Page, Ranked } from "@/lib/feed";
import { ago, LEAN_LABEL } from "@/lib/sources";

type Props = {
  page: Page;
  topicNames: Map<number, string>;
  now: number;
  personal: boolean;
};

// The newspaper layout: a lead story across eight columns, three down the side, then rows of
// three, "Also important today", and an end. Every card links to its story page.
export function FrontPage({ page, topicNames, now, personal }: Props) {
  const [lead, ...rest] = page.top;
  if (!lead) {
    return (
      <section aria-labelledby="empty-title" className="border-t border-rule py-10">
        <h2 id="empty-title" className="text-2xl">
          No stories yet
        </h2>
        <p className="mt-3 max-w-prose text-ink-muted">
          Stories appear here once outlets have reported them. If you run Verilo yourself, start the
          pipeline with <code>python -m verilo_workers pipeline --loop</code>.
        </p>
      </section>
    );
  }
  const side = rest.slice(0, 3);
  const grid = rest.slice(3);
  const card = { topicNames, now, personal };
  return (
    <>
      <section
        aria-labelledby="top-title"
        className="grid gap-8 border-b border-rule pb-8 md:grid-cols-12 md:gap-10"
      >
        {/* For the page outline (h1, h2, then each story's h3); the layout says it visually. */}
        <h2 id="top-title" className="sr-only">
          {personal ? "Top stories for you" : "Top stories"}
        </h2>
        <Story story={lead} size="lead" className="md:col-span-8" {...card} />
        <ol className="md:col-span-4 md:border-l md:border-rule md:pl-8">
          {side.map((s, i) => (
            <li key={s.card.id} className={i ? "border-t border-rule pt-5 mt-5" : ""}>
              <Story story={s} size="side" {...card} />
            </li>
          ))}
        </ol>
      </section>

      {grid.length ? (
        <ol className="grid gap-x-10 border-b border-rule md:grid-cols-3">
          {grid.map((s) => (
            <li
              key={s.card.id}
              className="border-t border-rule py-6 first:border-t-0 md:[&:nth-child(-n+3)]:border-t-0"
            >
              <Story story={s} size="grid" {...card} />
            </li>
          ))}
        </ol>
      ) : null}

      {page.alsoImportant.length ? (
        <section aria-labelledby="also-title" className="border-b border-rule py-8">
          <h2 id="also-title" className="kicker">
            Also important today
          </h2>
          <p className="meta mt-1">Widely covered stories outside what you follow.</p>
          <ol className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {page.alsoImportant.map((s) => (
              <li key={s.card.id}>
                <Story story={s} size="grid" {...card} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="py-10 text-center font-serif text-lg">
        You’re caught up.
        <span className="meta mt-1 block font-sans">
          New stories arrive through the day; this page updates as they do.
        </span>
      </p>
    </>
  );
}

function outletLine(story: Ranked): string {
  const names: string[] = [];
  for (const a of [...story.visible].sort((x, y) => x.tier - y.tier)) {
    if (!names.includes(a.source)) names.push(a.source);
  }
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
}

function Story({
  story,
  size,
  topicNames,
  now,
  personal,
  className = "",
}: {
  story: Ranked;
  size: "lead" | "side" | "grid";
  topicNames: Map<number, string>;
  now: number;
  personal: boolean;
  className?: string;
}) {
  const topic = story.card.topic_ids[0];
  const kicker = topic !== undefined ? topicNames.get(topic) : undefined;
  const headingClass =
    size === "lead"
      ? "text-3xl md:text-4xl"
      : size === "side"
        ? "text-lg leading-snug"
        : "text-xl leading-snug";
  return (
    <article className={className}>
      {kicker ? <p className="kicker">{kicker}</p> : null}
      <h3 className={`${kicker ? "mt-2" : ""} ${headingClass}`}>
        <Link href={`/story/${story.card.id}`} className="quiet-link">
          {story.headline}
        </Link>
      </h3>
      {size === "lead" && story.lead.snippet ? (
        <p className="mt-4 max-w-prose text-lg text-ink-muted">{story.lead.snippet}</p>
      ) : null}
      <p className="meta mt-3">
        {story.outlets} {story.outlets === 1 ? "outlet" : "outlets"}: {outletLine(story)} ·{" "}
        <time dateTime={story.card.last_published_at}>
          {ago(story.card.last_published_at, now)}
        </time>
      </p>
      {personal && story.reasons.length && size !== "side" ? (
        <p className="meta mt-1">{story.reasons[0]}</p>
      ) : null}
      {size === "lead" ? <OtherVersions story={story} /> : null}
    </article>
  );
}

// Under the lead: how other outlets headlined the same event, from different leans where possible,
// each linking to the publisher. The point of Verilo, shown on the front page.
function OtherVersions({ story }: { story: Ranked }) {
  const picked: Ranked["visible"] = [];
  const outletsSeen = new Set([story.lead.source_id]);
  const leansSeen = new Set([story.lead.lean]);
  const candidates = story.visible
    .filter((a) => a.kind === "news" && a.title !== story.headline)
    .sort((a, b) => a.tier - b.tier);
  // First pass: a new lean each time; second pass: any other outlet.
  for (const pass of [true, false]) {
    for (const a of candidates) {
      if (picked.length === 3) break;
      if (outletsSeen.has(a.source_id) || (pass && leansSeen.has(a.lean))) continue;
      picked.push(a);
      outletsSeen.add(a.source_id);
      leansSeen.add(a.lean);
    }
  }
  if (!picked.length) return null;
  return (
    <section aria-label="How others reported it" className="mt-6 border-t border-rule pt-4">
      <p className="meta font-semibold">How others reported it</p>
      <ul className="mt-2 space-y-3">
        {picked.map((a) => (
          <li key={a.id} className="text-sm">
            <span className="meta">
              {a.source} · {LEAN_LABEL[a.lean]}
            </span>
            <br />
            <a href={a.url} rel="noopener noreferrer" className="quiet-link font-serif text-base">
              {a.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
