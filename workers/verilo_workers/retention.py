"""Keeping only what is needed, once a day (`pipeline` runs it; `python -m verilo_workers prune`).

- Article embeddings older than EMBEDDING_DAYS are dropped: grouping looks back 72 hours, and an
  embedding is half an article's row (Nov 2026: about 2 GB a year without this).
- Stories with a single article older than SINGLE_STORY_DAYS are deleted (most stories have one
  article; nobody looks for them later). Their article stays.
- Summary check logs older than CHECK_DAYS are deleted (the summaries themselves stay).
- Each reader's briefing history older than BRIEFING_DAYS is deleted (privacy: it records what
  each reader was sent).
"""

from datetime import UTC, datetime, timedelta

import psycopg

EMBEDDING_DAYS = 7
SINGLE_STORY_DAYS = 30
CHECK_DAYS = 90
BRIEFING_DAYS = 90


def prune(conn: psycopg.Connection, now: datetime | None = None) -> dict[str, int]:
    now = now or datetime.now(UTC)
    days = lambda n: now - timedelta(days=n)  # noqa: E731
    counts = {}
    with conn.transaction():
        counts["embeddings"] = conn.execute(
            """update public.articles set embedding = null
               where embedding is not null and coalesce(published_at, fetched_at) < %s""",
            (days(EMBEDDING_DAYS),),
        ).rowcount
        counts["single-article stories"] = conn.execute(
            """delete from public.stories
               where article_count <= 1 and merged_into is null and last_published_at < %s
                 and not exists (select 1 from public.corrections c where c.story_id = stories.id)
                 and not exists (select 1 from public.stories f where f.follows = stories.id)""",
            (days(SINGLE_STORY_DAYS),),
        ).rowcount
        counts["summary checks"] = conn.execute(
            "delete from public.summary_checks where created_at < %s", (days(CHECK_DAYS),)
        ).rowcount
        counts["briefings"] = conn.execute(
            "delete from public.digests where created_at < %s", (days(BRIEFING_DAYS),)
        ).rowcount
    return counts
