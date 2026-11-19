"""`ingest`: fetch the feeds that are due, store new articles, record how each fetch went.

Each feed has its own interval (`poll` in the registry). Run `ingest --loop` to keep going (it
checks every minute what's due), or run `ingest` from a scheduler (cron) every few minutes.
"""

import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urlsplit

import httpx

from verilo_workers.common import http
from verilo_workers.config import CONCURRENCY
from verilo_workers.ingest import store
from verilo_workers.ingest.fetch import ALLOWED, DISALLOWED, FetchResult, Robots, fetch
from verilo_workers.ingest.parse import Item, parse_feed

LOOP_SECONDS = 60


@dataclass
class Outcome:
    feed: store.DueFeed
    result: FetchResult | None
    items: list[Item]
    skipped_because: str | None
    duration_ms: int


@dataclass
class Summary:
    feeds: int = 0
    new_articles: int = 0
    outcomes: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    def describe(self) -> str:
        parts = ", ".join(f"{k} {v}" for k, v in sorted(self.outcomes.items()))
        return (
            f"{self.feeds} feeds fetched ({parts or 'none due'}); {self.new_articles} new articles"
        )


async def _fetch_all(
    feeds: list[store.DueFeed], now: datetime, transport: httpx.AsyncBaseTransport | None
) -> list[Outcome]:
    limit = asyncio.Semaphore(CONCURRENCY)
    per_site: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
    outcomes: list[Outcome] = []

    async with http.client(transport) as client:
        robots = Robots(client)

        async def one(feed: store.DueFeed) -> None:
            async with limit, per_site[urlsplit(feed.url).netloc]:
                started = time.monotonic()
                verdict = await robots.verdict(feed.url)
                if verdict != ALLOWED:
                    why = (
                        "robots.txt disallows this feed"
                        if verdict == DISALLOWED
                        else "robots.txt didn't answer"
                    )
                    outcomes.append(Outcome(feed, None, [], why, 0))
                    return
                result = await fetch(client, feed.url, feed.etag, feed.last_modified)
                items = parse_feed(result.body, now=now) if result.body else []
                elapsed = int((time.monotonic() - started) * 1000)
                outcomes.append(Outcome(feed, result, items, None, elapsed))

        await asyncio.gather(*(one(f) for f in feeds))
    return outcomes


def _classify(o: Outcome) -> str:
    r = o.result
    assert r is not None
    if r.unchanged:
        return "unchanged"
    if not r.ok:
        return "failed"
    return "new" if o.items else "empty"


async def ingest_due(
    fetch_all: bool = False,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    now: datetime | None = None,
    database_url: str | None = None,
    only: list[str] | None = None,
) -> Summary:
    now = now or datetime.now(UTC)
    summary = Summary()
    with store.connect(database_url) as conn:
        feeds = store.due_feeds(conn, now, fetch_all, only)
        conn.commit()
        if not feeds:
            return summary
        outcomes = await _fetch_all(feeds, now, transport)

        with conn.transaction():
            for o in outcomes:
                summary.feeds += 1
                if o.skipped_because:
                    store.record_fetch(
                        conn, o.feed, now, outcome="skipped", status=0, error=o.skipped_because
                    )
                    summary.outcomes["skipped"] += 1
                    continue
                r = o.result
                assert r is not None
                outcome = _classify(o)
                new = store.insert_articles(conn, o.feed, o.items, now) if outcome == "new" else 0
                store.record_fetch(
                    conn,
                    o.feed,
                    now,
                    outcome=outcome,
                    status=r.status,
                    new_articles=new,
                    error=r.error,
                    etag=r.etag,
                    last_modified=r.last_modified,
                    duration_ms=o.duration_ms,
                )
                summary.outcomes[outcome] += 1
                summary.new_articles += new
            store.prune_log(conn, now)
    return summary


def loop() -> None:
    print(f"Ingesting every {LOOP_SECONDS} s; Ctrl+C stops.", flush=True)
    while True:
        started = time.monotonic()
        try:
            summary = asyncio.run(ingest_due())
            if summary.feeds:
                stamp = datetime.now(UTC).strftime("%H:%M:%S")
                print(f"{stamp}  {summary.describe()}", flush=True)
        except Exception as exc:  # keep the loop alive; the next round tries again
            print(f"ingest round failed: {type(exc).__name__}: {exc}", flush=True)
        time.sleep(max(1.0, LOOP_SECONDS - (time.monotonic() - started)))
