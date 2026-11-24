import type { OwnItem, OwnSource } from "@/lib/own-sources";
import { originLabel, sourceName } from "@/lib/own-sources";
import { ago } from "@/lib/sources";

// Items from a reader's own sources, newest first, each with its source and where it comes from
// ("Unverified · added by you" unless Verilo could confirm it's an outlet's own). Links carry
// `nofollow ugc`: Verilo doesn't vouch for them.
export function OwnItems({
  items,
  sources,
  now,
  snippets = false,
}: {
  items: OwnItem[];
  sources: OwnSource[];
  now: number;
  snippets?: boolean;
}) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const shown = items.filter((i) => byId.has(i.sourceId));
  return (
    <ol>
      {shown.map((item) => {
        const source = byId.get(item.sourceId)!;
        return (
          <li key={item.id} className="border-t border-rule py-4 first:border-t-0">
            <h3 className="font-serif text-lg leading-snug">
              <a href={item.url} rel="noopener noreferrer nofollow ugc" className="quiet-link">
                {item.title}
              </a>
            </h3>
            {snippets && item.snippet ? (
              <p className="mt-1 text-ink-muted">{item.snippet}</p>
            ) : null}
            <p className="meta mt-1">
              {sourceName(source)} · {originLabel(source)} ·{" "}
              <time dateTime={item.publishedAt}>{ago(item.publishedAt, now)}</time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
