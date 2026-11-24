"""Reading a feed into the few fields Verilo keeps: headline, snippet, link and date.

Whatever else a feed carries (full article text in `content:encoded`, images, author pages) is
read by the parser and dropped here. The snippet comes from the item's summary/description only,
cut by `make_snippet`, never from the full content.
"""

import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser

from verilo_workers.common.snippet import make_snippet
from verilo_workers.enrich.kind import classify

MAX_TITLE = 400
MAX_URL = 2048

# Tracking parameters removed so the same article isn't stored twice under different links.
_TRACKING = re.compile(
    r"^(utm_[a-z]+|fbclid|gclid|dclid|mc_cid|mc_eid|cmpid|CMP|ocid|ref|ref_src|ito|smid|"
    r"sh|cid|traffic_source|at_medium|at_campaign|at_custom\d|rss|taid)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Item:
    url: str
    title: str
    snippet: str
    published_at: datetime
    content_hash: str
    kind: str = "news"  # news | opinion | sponsored (verilo_workers.enrich.kind)
    kind_reason: str | None = None


def canonical_url(url: str) -> str | None:
    """The link without tracking parameters or fragment; None if it isn't a web link."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not _TRACKING.match(k)])
    clean = urlunsplit((parts.scheme, parts.netloc.lower(), parts.path or "/", query, ""))
    return clean if len(clean) <= MAX_URL else None


def clean_title(raw: str | None) -> str:
    title = make_snippet(raw, limit=MAX_TITLE)
    return title


def _published(entry: feedparser.FeedParserDict, now: datetime) -> datetime | None:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        parsed = entry.get(key)
        if parsed:
            try:
                when = datetime(*parsed[:6], tzinfo=UTC)
            except (TypeError, ValueError):
                continue
            # A date in the future is a feed's mistake (wrong time zone, scheduled posts):
            # never show a story as newer than now.
            return min(when, now)
    return None


def content_hash(title: str, published_at: datetime | None) -> str:
    """Identifies the same headline from one outlet on one day (a link may change, the item not)."""
    day = published_at.date().isoformat() if published_at else ""
    normal = re.sub(r"\W+", " ", title.lower()).strip()
    return hashlib.sha256(f"{normal}|{day}".encode()).hexdigest()


def parse_feed(body: bytes, now: datetime | None = None, max_age_days: int = 7) -> list[Item]:
    """Items from a feed, newest information only (older than `max_age_days` is skipped)."""
    now = now or datetime.now(UTC)
    parsed = feedparser.parse(body)
    oldest = now - timedelta(days=max_age_days)
    items: list[Item] = []
    seen: set[str] = set()
    for entry in parsed.entries:
        url = canonical_url(entry.get("link") or "")
        title = clean_title(entry.get("title"))
        if not url or not title or url in seen:
            continue
        published = _published(entry, now)
        # No date: it could be years old (a dead feed keeps serving its last items), and stories
        # are grouped by time, so undated items are skipped.
        if published is None or published < oldest:
            continue
        seen.add(url)
        summary = entry.get("summary") or entry.get("description") or ""
        snippet = make_snippet(summary)
        if snippet == title:
            snippet = ""
        # The feed's categories are read only to tell opinion and paid content from news.
        tags = [t.get("term") or t.get("label") or "" for t in entry.get("tags", [])]
        kind, kind_reason = classify(url, title, tags, snippet)
        items.append(
            Item(
                url=url,
                title=title,
                snippet=snippet,
                published_at=published,
                content_hash=content_hash(title, published),
                kind=kind,
                kind_reason=kind_reason,
            )
        )
    return items


def looks_like_feed(body: bytes) -> bool:
    parsed = feedparser.parse(body)
    return bool(parsed.entries) or parsed.get("version", "") != ""
