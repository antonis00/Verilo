"""Database access for ingestion. Raw SQL through psycopg; the workers connect as the database
owner (DATABASE_URL), so these writes are the only way rows get into these tables."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

import psycopg
from psycopg.rows import dict_row

from verilo_workers.config import DATABASE_URL
from verilo_workers.ingest.parse import Item
from verilo_workers.ingest.registry import Source

LOG_DAYS = 30
MAX_BACKOFF_MINUTES = 24 * 60


def connect(url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(url or DATABASE_URL, row_factory=dict_row)


def sync_sources(
    sources: list[Source],
    conn: psycopg.Connection | None = None,
    scope: list[str] | None = None,
) -> dict[str, int]:
    """Make the database match the registry. Feeds no longer listed are switched off, not
    deleted (their articles and history stay); sources no longer listed are paused.

    `scope` limits that tidying to the named sources, for syncing part of a registry (tests);
    without it, `sources` must be the whole registry."""
    own = conn is None
    conn = conn or connect()
    counts = {"sources": 0, "feeds": 0, "feeds switched off": 0, "sources paused": 0}
    try:
        with conn.transaction():
            listed_urls: list[str] = []
            for s in sources:
                row = conn.execute(
                    """
                    insert into public.sources
                      (slug, name, homepage, country, region, kind, tier, lean, status,
                       rating_basis, reviewed_on, note)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    on conflict (slug) do update set
                      name = excluded.name, homepage = excluded.homepage,
                      country = excluded.country, region = excluded.region,
                      kind = excluded.kind, tier = excluded.tier,
                      lean = excluded.lean, status = excluded.status,
                      rating_basis = excluded.rating_basis, reviewed_on = excluded.reviewed_on,
                      note = excluded.note
                    returning id
                    """,
                    (
                        s.slug,
                        s.name,
                        s.homepage,
                        s.country,
                        s.region,
                        s.kind,
                        s.tier,
                        s.lean,
                        s.status,
                        s.basis,
                        s.reviewed,
                        s.note,
                    ),
                ).fetchone()
                counts["sources"] += 1
                for f in s.feeds:
                    listed_urls.append(f.url)
                    conn.execute(
                        """
                        insert into public.source_feeds
                          (source_id, url, section, poll_minutes, active)
                        values (%s, %s, %s, %s, %s)
                        on conflict (url) do update set
                          source_id = excluded.source_id, section = excluded.section,
                          poll_minutes = excluded.poll_minutes, active = excluded.active
                        """,
                        (row["id"], f.url, f.section, f.poll_minutes, s.status == "active"),
                    )
                    counts["feeds"] += 1
            off = conn.execute(
                """update public.source_feeds f set active = false
                   where active and url <> all(%s)
                     and (%s::text[] is null or f.source_id in
                          (select id from public.sources where slug = any(%s::text[])))""",
                (listed_urls, scope, scope),
            )
            counts["feeds switched off"] = off.rowcount
            paused = conn.execute(
                """update public.sources set status = 'paused',
                     note = coalesce(note, 'No longer in the registry.')
                   where status = 'active' and slug <> all(%s)
                     and (%s::text[] is null or slug = any(%s::text[]))""",
                ([s.slug for s in sources], scope, scope),
            )
            counts["sources paused"] = paused.rowcount
    finally:
        if own:
            conn.close()
    return counts


@dataclass(frozen=True)
class DueFeed:
    id: int
    source_id: int
    url: str
    poll_minutes: int
    etag: str | None
    last_modified: str | None
    consecutive_failures: int


def due_feeds(
    conn: psycopg.Connection,
    now: datetime,
    fetch_all: bool = False,
    only: list[str] | None = None,
) -> list[DueFeed]:
    """Active feeds whose time has come (or all of them), optionally only for some sources."""
    rows = conn.execute(
        """
        select f.id, f.source_id, f.url, f.poll_minutes, f.etag, f.last_modified,
               f.consecutive_failures
        from public.source_feeds f
        join public.sources s on s.id = f.source_id
        where f.active and s.status = 'active' and (%s or f.next_fetch_at <= %s)
          and (%s::text[] is null or s.slug = any(%s::text[]))
        order by f.next_fetch_at
        """,
        (fetch_all, now, only, only),
    ).fetchall()
    return [DueFeed(**r) for r in rows]


def insert_articles(
    conn: psycopg.Connection, feed: DueFeed, items: Iterable[Item], now: datetime
) -> int:
    new = 0
    for item in items:
        row = conn.execute(
            """
            insert into public.articles
              (source_id, feed_id, url, title, snippet, published_at, fetched_at, content_hash,
               kind, kind_reason)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict do nothing
            returning id
            """,
            (
                feed.source_id,
                feed.id,
                item.url,
                item.title,
                item.snippet,
                item.published_at,
                now,
                item.content_hash,
                item.kind,
                item.kind_reason,
            ),
        ).fetchone()
        new += row is not None
    return new


def backoff_minutes(poll_minutes: int, failures: int) -> int:
    """Wait longer after each failure in a row, up to a day."""
    if failures <= 0:
        return poll_minutes
    return min(poll_minutes * 2 ** min(failures, 10), MAX_BACKOFF_MINUTES)


def record_fetch(
    conn: psycopg.Connection,
    feed: DueFeed,
    now: datetime,
    *,
    outcome: str,
    status: int,
    new_articles: int = 0,
    error: str | None = None,
    etag: str | None = None,
    last_modified: str | None = None,
    duration_ms: int | None = None,
) -> None:
    failed = outcome == "failed"
    failures = feed.consecutive_failures + 1 if failed else 0
    wait = backoff_minutes(feed.poll_minutes, failures)
    if outcome == "skipped":  # robots.txt said no or didn't answer: try again next round
        failures, wait = feed.consecutive_failures, feed.poll_minutes
    ok = outcome in ("new", "unchanged", "empty")
    conn.execute(
        """
        update public.source_feeds set
          last_fetched_at = %(now)s,
          last_success_at = case when %(ok)s then %(now)s else last_success_at end,
          last_status = %(status)s,
          last_error = %(error)s,
          consecutive_failures = %(failures)s,
          next_fetch_at = %(next)s,
          etag = case when %(ok)s then %(etag)s else etag end,
          last_modified = case when %(ok)s then %(last_modified)s else last_modified end
        where id = %(id)s
        """,
        {
            "now": now,
            "ok": ok,
            "status": status,
            "error": error[:500] if error else None,
            "failures": failures,
            "next": now + timedelta(minutes=wait),
            "etag": etag,
            "last_modified": last_modified,
            "id": feed.id,
        },
    )
    conn.execute(
        """insert into public.fetch_log
             (feed_id, fetched_at, status, outcome, new_articles, error, duration_ms)
           values (%s, %s, %s, %s, %s, %s, %s)""",
        (feed.id, now, status, outcome, new_articles, error[:500] if error else None, duration_ms),
    )


def prune_log(conn: psycopg.Connection, now: datetime) -> None:
    conn.execute(
        "delete from public.fetch_log where fetched_at < %s", (now - timedelta(days=LOG_DAYS),)
    )


def set_editor(email: str, flag: bool, conn: psycopg.Connection | None = None) -> bool:
    own = conn is None
    conn = conn or connect()
    try:
        with conn.transaction():
            cur = conn.execute(
                """update public.profiles set is_editor = %s
                   where id = (select id from auth.users where lower(email) = lower(%s))""",
                (flag, email.strip()),
            )
            return cur.rowcount == 1
    finally:
        if own:
            conn.close()
