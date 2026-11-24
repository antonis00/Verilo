"""Fetching readers' own sources: the ones due, at most PER_ROUND a round, each every
FETCH_EVERY minutes (longer after failures), only while some reader follows it.

A source a reader added is `pending` until its first fetch. That fetch also:
- finds the feed when the reader gave a website's address (its `<link rel="alternate">`);
- names the source (the feed's or channel's own title);
- marks it official when the feed is served from the website of an outlet Verilo rates
  (`official_for`). Telegram's public page doesn't show its verified badge, so a channel is
  marked official only by an editor.
"""

import asyncio
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html import unescape
from urllib.parse import urljoin, urlsplit

import feedparser
import httpx
import psycopg

from verilo_workers.common import http
from verilo_workers.ingest import store
from verilo_workers.ingest.fetch import ALLOWED, FetchResult, Robots, fetch
from verilo_workers.ingest.parse import looks_like_feed, parse_feed
from verilo_workers.ingest.store import backoff_minutes
from verilo_workers.own import telegram
from verilo_workers.own.safety import UnsafeAddress, check_url, hooks

FETCH_EVERY = 30  # minutes
PER_ROUND = 20
MAX_AGE_DAYS = 14  # items older than this aren't kept (retention deletes them too)
ITEMS_PER_SOURCE = 50  # newest kept per fetch
FAILING_AFTER = 3  # failures in a row before a source shows as failing
CONCURRENCY = 4

_ALTERNATE = re.compile(r"<link\b[^>]*>", re.I)


@dataclass(frozen=True)
class OwnSource:
    id: int
    kind: str
    url: str
    status: str
    consecutive_failures: int
    etag: str | None
    last_modified: str | None


@dataclass
class Fetched:
    source: OwnSource
    result: FetchResult | None
    url: str  # the address in the end (a website's feed, once found)
    title: str | None = None
    site_url: str | None = None
    items: list[tuple[str, str, str, datetime]] | None = None  # url, title, snippet, published
    error: str | None = None


def due(
    conn: psycopg.Connection, now: datetime, limit: int = PER_ROUND, only: list[int] | None = None
) -> list[OwnSource]:
    rows = conn.execute(
        """select o.id, o.kind, o.url, o.status, o.consecutive_failures, o.etag, o.last_modified
           from public.own_sources o
           where o.status <> 'blocked' and o.next_fetch_at <= %s
             and (%s::bigint[] is null or o.id = any(%s::bigint[]))
             and exists (select 1 from public.reader_own_sources r where r.source_id = o.id)
           order by (o.status = 'pending') desc, o.next_fetch_at
           limit %s""",
        (now, only, only, limit),
    ).fetchall()
    return [OwnSource(**r) for r in rows]


def feed_link(page: bytes, base: str) -> str | None:
    """A website's own feed, from its `<link rel="alternate" type="application/rss+xml">`."""
    text = page[:500_000].decode("utf-8", "replace")
    for tag in _ALTERNATE.findall(text):
        attrs = dict(re.findall(r'([a-zA-Z-]+)\s*=\s*["\']([^"\']*)["\']', tag))
        attrs = {k.lower(): unescape(v) for k, v in attrs.items()}
        if "alternate" not in attrs.get("rel", "").lower().split():
            continue
        if attrs.get("type", "").lower() in ("application/rss+xml", "application/atom+xml"):
            href = urljoin(base, attrs.get("href", ""))
            if href.startswith("https://"):
                return href
    return None


def _host(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def official_for(conn: psycopg.Connection, url: str) -> int | None:
    """The rated outlet whose website serves this feed: the same host as one of its own feeds,
    or its homepage's host (or a subdomain of it)."""
    host = _host(url)
    if not host:
        return None
    row = conn.execute(
        """select s.id from public.sources s
           where exists (select 1 from public.source_feeds f where f.source_id = s.id
                         and lower(regexp_replace(split_part(split_part(f.url, '//', 2), '/', 1),
                                                  '^www\\.', '')) = %(h)s)
              or lower(regexp_replace(split_part(split_part(s.homepage, '//', 2), '/', 1),
                                      '^www\\.', '')) in (%(h)s)
              or %(h)s like '%%.' || lower(regexp_replace(
                   split_part(split_part(s.homepage, '//', 2), '/', 1), '^www\\.', ''))
           order by s.tier, s.id limit 1""",
        {"h": host},
    ).fetchone()
    return row["id"] if row else None


def _feed_items(body: bytes, now: datetime) -> tuple[str | None, str | None, list]:
    parsed = feedparser.parse(body)
    title = (parsed.feed.get("title") or "").strip()[:200] or None
    site = parsed.feed.get("link") or None
    if site and not str(site).startswith("https://"):
        site = None
    items = [
        (i.url, i.title, i.snippet[:400], i.published_at)
        for i in parse_feed(body, now=now, max_age_days=MAX_AGE_DAYS)
        if i.url.startswith(("https://", "http://"))
    ]
    return title, site, items


async def _one(
    client: httpx.AsyncClient, robots: Robots, source: OwnSource, now: datetime
) -> Fetched:
    try:
        check_url(source.url)
    except UnsafeAddress as exc:
        return Fetched(source, None, source.url, error=f"refused: {exc}")
    if await robots.verdict(source.url) != ALLOWED:
        return Fetched(source, None, source.url, error="the site's robots.txt doesn't allow it")
    etag, modified = (source.etag, source.last_modified) if source.status == "ok" else (None, None)
    try:
        result = await fetch(client, source.url, etag, modified)
    except UnsafeAddress as exc:  # a redirect to an address that isn't public
        return Fetched(source, None, source.url, error=f"refused: {exc}")
    out = Fetched(source, result, source.url)
    if result.unchanged:
        out.items = []
        return out
    if not result.ok:
        out.error = result.error or f"HTTP {result.status}"
        return out
    body = result.body or b""
    if source.kind == "telegram":
        page = telegram.parse(body.decode("utf-8", "replace"), now, MAX_AGE_DAYS)
        if page.title is None and not page.posts:
            out.error = "not a public Telegram channel"
            return out
        out.title = page.title
        out.site_url = source.url.replace("/s/", "/", 1)
        out.items = [(p.url, p.title, p.snippet, p.published_at) for p in page.posts]
        return out
    if not looks_like_feed(body):
        found = feed_link(body, source.url) if source.status == "pending" else None
        if not found:
            out.error = "no feed found at this address"
            return out
        try:
            check_url(found)
            result = await fetch(client, found)
        except UnsafeAddress as exc:
            out.error = f"refused: {exc}"
            return out
        out.result, out.url = result, found
        body = result.body or b""
        if not result.ok or not looks_like_feed(body):
            out.error = "no feed found at this address"
            return out
    out.title, out.site_url, out.items = _feed_items(body, now)
    return out


async def fetch_all(
    sources: list[OwnSource], now: datetime, transport: httpx.AsyncBaseTransport | None = None
) -> list[Fetched]:
    limit = asyncio.Semaphore(CONCURRENCY)
    per_site: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
    async with http.client(transport, event_hooks=hooks()) as client:
        robots = Robots(client)

        async def one(s: OwnSource) -> Fetched:
            async with limit, per_site[urlsplit(s.url).netloc]:
                return await _one(client, robots, s, now)

        return list(await asyncio.gather(*(one(s) for s in sources)))


def _move_to(conn: psycopg.Connection, source_id: int, url: str) -> int:
    """A website's address turned out to have a feed: the source becomes that feed, or, when
    another reader already added it, its readers join that one."""
    existing = conn.execute("select id from public.own_sources where url = %s", (url,)).fetchone()
    if not existing:
        conn.execute("update public.own_sources set url = %s where id = %s", (url, source_id))
        return source_id
    conn.execute(
        """insert into public.reader_own_sources (user_id, source_id, added_at)
           select user_id, %s, added_at from public.reader_own_sources where source_id = %s
           on conflict do nothing""",
        (existing["id"], source_id),
    )
    conn.execute("delete from public.own_sources where id = %s", (source_id,))
    return existing["id"]


def record(conn: psycopg.Connection, f: Fetched, now: datetime) -> int:
    """Saves one fetch; returns the number of new items."""
    s = f.source
    if f.error or f.items is None:
        failures = s.consecutive_failures + 1
        status = "failing" if failures >= FAILING_AFTER else s.status
        conn.execute(
            """update public.own_sources set status = %s, last_error = %s,
                 consecutive_failures = %s, last_fetched_at = %s, next_fetch_at = %s
               where id = %s and status <> 'blocked'""",
            (
                status,
                (f.error or "failed")[:300],
                failures,
                now,
                now + timedelta(minutes=backoff_minutes(FETCH_EVERY, failures)),
                s.id,
            ),
        )
        return 0
    source_id = s.id
    if f.url != s.url:
        source_id = _move_to(conn, s.id, f.url)
    result = f.result
    conn.execute(
        """update public.own_sources set status = 'ok', last_error = null,
             consecutive_failures = 0, last_fetched_at = %(now)s, next_fetch_at = %(next)s,
             title = coalesce(%(title)s, title), site_url = coalesce(%(site)s, site_url),
             etag = %(etag)s, last_modified = %(modified)s,
             official_source_id = coalesce(official_source_id, %(official)s)
           where id = %(id)s and status <> 'blocked'""",
        {
            "now": now,
            "next": now + timedelta(minutes=FETCH_EVERY),
            "title": f.title,
            "site": f.site_url,
            "etag": result.etag if result else None,
            "modified": result.last_modified if result else None,
            "official": official_for(conn, f.url) if s.kind == "feed" else None,
            "id": source_id,
        },
    )
    newest = sorted(f.items, key=lambda i: i[3], reverse=True)[:ITEMS_PER_SOURCE]
    new = 0
    for url, title, snippet, published in newest:
        new += (
            conn.execute(
                """insert into public.own_items (source_id, url, title, snippet, published_at,
                                                 fetched_at)
                   values (%s, %s, %s, %s, %s, %s) on conflict do nothing returning id""",
                (source_id, url[:2048], title[:400], snippet[:400], min(published, now), now),
            ).fetchone()
            is not None
        )
    return new


async def fetch_due(
    database_url: str | None = None,
    *,
    now: datetime | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    conn: psycopg.Connection | None = None,
    only: list[int] | None = None,
) -> dict[str, int]:
    """Fetches what's due. With `conn` (tests), nothing is committed."""
    now = now or datetime.now(UTC)
    if conn is None:
        with store.connect(database_url) as own_conn:
            return await _fetch_due(own_conn, now, transport, only, commit=True)
    return await _fetch_due(conn, now, transport, only, commit=False)


async def _fetch_due(conn, now, transport, only, *, commit: bool) -> dict[str, int]:
    counts = {"fetched": 0, "failed": 0, "new items": 0}
    sources = due(conn, now, only=only)
    if commit:
        conn.commit()  # no transaction held open while fetching
    if not sources:
        return counts
    results = await fetch_all(sources, now, transport)
    with conn.transaction():
        for f in results:
            counts["fetched"] += 1
            counts["failed"] += bool(f.error or f.items is None)
            counts["new items"] += record(conn, f, now)
    return counts


def describe(counts: dict[str, int]) -> str:
    if not counts["fetched"]:
        return "own sources: none due"
    return (
        f"own sources: {counts['fetched']} fetched, {counts['failed']} failed, "
        f"{counts['new items']} new items"
    )


def prune(conn: psycopg.Connection, now: datetime) -> dict[str, int]:
    """Items after MAX_AGE_DAYS; sources nobody follows any more (after a day, so one being
    added isn't caught between its two writes)."""
    return {
        "own items": conn.execute(
            "delete from public.own_items where published_at < %s",
            (now - timedelta(days=MAX_AGE_DAYS),),
        ).rowcount,
        "own sources nobody follows": conn.execute(
            """delete from public.own_sources o where o.status <> 'blocked'
                 and o.created_at < %s
                 and not exists (select 1 from public.reader_own_sources r
                                 where r.source_id = o.id)""",
            (now - timedelta(days=1),),
        ).rowcount,
    }
