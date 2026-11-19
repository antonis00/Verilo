import Link from "next/link";
import type { CardArticle, Summary } from "@/lib/feed";

// "In brief": the checked AI summary. Each point names the outlets it was drawn from, linking to
// their reports, and the note says which models wrote and checked it, so nothing reads as ours.

export function modelName(label: string | null): string {
  if (!label) return "a second model";
  const model = label.split(":").slice(1).join(":") || label;
  return model.split("/").pop() ?? model;
}

export function StorySummary({
  summary,
  articles,
  compact = false,
  storyId,
}: {
  summary: Summary;
  articles: CardArticle[];
  compact?: boolean;
  storyId?: number;
}) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const bullets = compact ? summary.bullets.slice(0, 3) : summary.bullets;
  return (
    <div className={compact ? "mt-4 max-w-prose" : ""}>
      <ul className={compact ? "space-y-2" : "mt-4 space-y-3"}>
        {bullets.map((b, i) => {
          const sources = b.article_ids
            .map((id) => byId.get(id))
            .filter((a): a is CardArticle => a !== undefined);
          return (
            <li
              key={i}
              className={`summary-point ${compact ? "text-base text-ink-muted" : "text-lg"}`}
            >
              {b.text}
              {!compact && sources.length ? (
                <span className="meta ml-1">
                  {" ("}
                  {sources.map((a, j) => (
                    <span key={a.id}>
                      {j ? ", " : ""}
                      <a href={a.url} rel="noopener noreferrer" className="quiet-link underline">
                        {a.source}
                      </a>
                    </span>
                  ))}
                  {")"}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {compact ? (
        <p className="meta mt-2">
          AI summary, checked against the reports
          {storyId !== undefined ? (
            <>
              {" · "}
              <Link href={`/story/${storyId}`}>
                {summary.bullets.length > bullets.length ? "Full summary" : "Sources"}
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        <p className="meta mt-4">
          Summarised by an AI model ({modelName(summary.writer)}) from the outlets’ headlines and
          excerpts below, and checked before publishing: every number, name and quotation against
          the reports it cites, and every point by a different model ({modelName(summary.checker)}).
          Read the reports themselves for the full picture.
        </p>
      )}
    </div>
  );
}
