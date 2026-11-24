import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How Verilo works",
  description:
    "One story per event, summaries that cite their sources, outlets you can see and choose, and a front page that ends.",
};

// What Verilo is and what it never does. Linked from the footer and the front page invitation.

const PRINCIPLES = [
  {
    kicker: "Sources",
    title: "Outlets you can see and choose",
    body: "Every story shows which outlets cover it and where each one leans. Follow the ones you trust, hide the ones you don't.",
  },
  {
    kicker: "Checked",
    title: "Summaries that cite their sources",
    body: "A summary is written only when several reputable outlets from different leanings report the event, and a second model checks every line against them first.",
  },
  {
    kicker: "Finite",
    title: "A front page that ends",
    body: "Your stories for the day, then “You’re caught up”. No endless scroll, no autoplay, no ads, no distractions: the design is plain and calm on purpose, so the news is what you notice.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section
        aria-labelledby="lead-title"
        className="grid gap-8 border-b border-rule pb-10 md:grid-cols-12 md:gap-10"
      >
        <div className="md:col-span-8">
          <p className="kicker">How Verilo works</p>
          <h1 id="lead-title" className="mt-3 text-3xl md:text-4xl">
            One story per event, not ten copies of the same article
          </h1>
          <p className="mt-5 max-w-prose text-lg text-ink-muted">
            Verilo gathers the news from public broadcasters, major papers and news sites around the
            world, groups the articles that report the same event, and gives you one page for each
            story: the facts so far, and a link to every outlet’s version.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/welcome" className="button">
              Make the front page yours
            </Link>
            <Link href="/" className="button button-secondary">
              Read today’s front page
            </Link>
          </div>
        </div>

        <aside
          aria-labelledby="promise-title"
          className="border-t border-rule pt-6 md:col-span-4 md:border-t-0 md:border-l md:pt-0 md:pl-8"
        >
          <h2 id="promise-title" className="text-xl">
            What we never do
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="border-b border-rule pb-3">
              Republish articles. You get the headline, a short excerpt and a link to the publisher.
            </li>
            <li className="border-b border-rule pb-3">
              Summarise opinion pieces as if they were facts.
            </li>
            <li>Add a fact that no source reports.</li>
          </ul>
        </aside>
      </section>

      <section aria-label="Principles" className="grid gap-8 pt-8 md:grid-cols-3 md:gap-0">
        {PRINCIPLES.map((p, i) => (
          <article
            key={p.kicker}
            className={
              i === 0
                ? "md:pr-8"
                : "border-t border-rule pt-8 md:border-t-0 md:border-l md:px-8 md:pt-0 last:md:pr-0"
            }
          >
            <p className="kicker">{p.kicker}</p>
            <h2 className="mt-2 text-xl">{p.title}</h2>
            <p className="mt-3 text-ink-muted">{p.body}</p>
          </article>
        ))}
      </section>
    </>
  );
}
