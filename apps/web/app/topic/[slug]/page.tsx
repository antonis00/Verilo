import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FrontPage } from "@/components/front-page";
import { getReader } from "@/lib/auth";
import { NO_PREFERENCES, rankTopic } from "@/lib/feed";
import { CANDIDATE_HOURS, candidateCards, topicNames, topics } from "@/lib/news";
import { toRanking } from "@/lib/preferences";
import { loadPreferences } from "@/lib/reader-preferences";
import { requestTime } from "@/lib/request-time";

export const metadata: Metadata = { title: "Section" };

// One topic's stories, from the section menu. Signed-in readers' outlet and display choices
// apply here too.
export default function TopicPage({ params }: PageProps<"/topic/[slug]">) {
  return (
    <Suspense fallback={<p className="meta py-10">Loading the section…</p>}>
      <Section params={params} />
    </Suspense>
  );
}

async function Section({ params }: Pick<PageProps<"/topic/[slug]">, "params">) {
  const { slug } = await params;
  const topic = (await topics()).find((t) => t.slug === slug);
  if (!topic) notFound();

  const [cards, names, now, reader] = await Promise.all([
    candidateCards(),
    topicNames(),
    requestTime(),
    getReader(),
  ]);
  const saved = reader ? await loadPreferences(reader.id) : null;
  const prefs = saved?.onboarded ? toRanking(saved.input) : NO_PREFERENCES;
  const page = rankTopic(cards, topic.id, prefs, now, names);

  return (
    <>
      <header className="mb-8">
        <p className="kicker">Section</p>
        <h1 className="mt-2 text-3xl md:text-4xl">{topic.name}</h1>
        <p className="meta mt-2">
          {page.top.length} {page.top.length === 1 ? "story" : "stories"} from the last{" "}
          {CANDIDATE_HOURS / 24} days
        </p>
      </header>
      <FrontPage
        page={page}
        topicNames={names}
        now={now}
        personal={false}
        label={`${topic.name} stories`}
        topicSlug={topic.slug}
        empty={{
          title: `No ${topic.name.toLowerCase()} stories right now`,
          body: (
            <>
              Nothing in the last {CANDIDATE_HOURS / 24} days has been tagged {topic.name}. Topics
              are tagged only when we’re confident, so some stories may be missing.{" "}
              <Link href="/">Read the front page</Link>.
            </>
          ),
        }}
      />
    </>
  );
}
