"""`check-feeds`: try every feed in the registry and report what comes back, without storing
anything. Used to vet new sources and to find feeds that have died."""

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit

from verilo_workers.common import http
from verilo_workers.ingest.fetch import ALLOWED, DISALLOWED, Robots, fetch
from verilo_workers.ingest.parse import parse_feed
from verilo_workers.ingest.registry import Source


@dataclass
class FeedReport:
    source: str
    url: str
    status: int
    items: int
    newest: datetime | None
    with_snippet: int
    error: str | None


async def check(sources: list[Source], concurrency: int = 8) -> list[FeedReport]:
    reports: list[FeedReport] = []
    now = datetime.now(UTC)
    limit = asyncio.Semaphore(concurrency)
    per_host: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async with http.client() as client:
        robots = Robots(client)

        async def one(source: Source, url: str) -> None:
            async with limit, per_host[urlsplit(url).netloc]:
                verdict = await robots.verdict(url)
                if verdict != ALLOWED:
                    why = (
                        "robots.txt disallows"
                        if verdict == DISALLOWED
                        else "robots.txt didn't answer"
                    )
                    reports.append(FeedReport(source.slug, url, 0, 0, None, 0, why))
                    return
                result = await fetch(client, url)
                items = parse_feed(result.body, now=now, max_age_days=30) if result.body else []
                dates = [i.published_at for i in items if i.published_at]
                error = result.error
                if result.ok and not items:
                    error = "no items (not a feed, or nothing in 30 days)"
                reports.append(
                    FeedReport(
                        source.slug,
                        url,
                        result.status,
                        len(items),
                        max(dates) if dates else None,
                        sum(1 for i in items if i.snippet),
                        error,
                    )
                )

        await asyncio.gather(*(one(s, f.url) for s in sources for f in s.feeds))
    return sorted(reports, key=lambda r: (r.source, r.url))


def print_report(reports: list[FeedReport]) -> int:
    now = datetime.now(UTC)
    bad = 0
    for r in reports:
        if r.error:
            bad += 1
            print(f"FAIL  {r.source:24} {r.status:>3}  {r.error}  {r.url}")
            continue
        age = f"{(now - r.newest).total_seconds() / 3600:5.1f}h" if r.newest else "  no date"
        stale = "  STALE" if r.newest and (now - r.newest).days >= 3 else ""
        print(
            f"ok    {r.source:24} {r.status:>3}  {r.items:3} items, newest {age}, "
            f"{r.with_snippet:3} with snippet{stale}  {r.url}"
        )
    print(f"\n{len(reports) - bad} of {len(reports)} feeds answered with items.")
    return bad
