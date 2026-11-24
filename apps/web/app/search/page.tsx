import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { searchStories } from "@/lib/news";
import { requestTime } from "@/lib/request-time";
import { ago } from "@/lib/sources";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

// Search the stories of the last weeks by the words in their headlines and excerpts.
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto max-w-prose py-6 md:py-10">
      <h1 className="text-2xl md:text-3xl">Search</h1>
      <Suspense fallback={<SearchForm query="" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function SearchForm({ query }: { query: string }) {
  return (
    <form role="search" action="/search" className="mt-4 flex gap-2">
      <label htmlFor="search-q" className="sr-only">
        Search stories
      </label>
      <input
        id="search-q"
        name="q"
        type="search"
        defaultValue={query}
        maxLength={200}
        placeholder="A name, a place, an event…"
        className="field flex-1"
      />
      <button type="submit" className="button">
        Search
      </button>
    </form>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  if (!query) {
    return (
      <>
        <SearchForm query="" />
        <p className="meta mt-4">Search every story Verilo has grouped, by any word.</p>
      </>
    );
  }
  const [results, now] = await Promise.all([searchStories(query), requestTime()]);
  return (
    <>
      <SearchForm query={query} />
      <p className="meta mt-4" role="status">
        {results.length
          ? `${results.length === 30 ? "The 30 best" : results.length} ${results.length === 1 ? "story" : "stories"} for “${query}”`
          : `No stories for “${query}”. Try fewer or other words.`}
      </p>
      <ol className="mt-4">
        {results.map((r) => (
          <li key={r.id} className="border-t border-rule py-4">
            <h2 className="text-lg leading-snug">
              <Link href={`/story/${r.id}`} className="quiet-link">
                {r.title}
              </Link>
            </h2>
            {r.line ? <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{r.line}</p> : null}
            <p className="meta mt-1">
              {r.outlet_count} {r.outlet_count === 1 ? "outlet" : "outlets"} · updated{" "}
              <time dateTime={r.last_published_at}>{ago(r.last_published_at, now)}</time>
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
