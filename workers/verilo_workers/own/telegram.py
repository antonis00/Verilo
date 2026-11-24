"""Public Telegram channels, read from their public web page (https://t.me/s/<channel>), which
Telegram serves to anyone without an account. Each post becomes an item: its first line as the
headline, the rest as the excerpt, its link (https://t.me/<channel>/<n>) and time. The page
doesn't show Telegram's verified badge (checked Nov 2026), so nothing here claims a channel is
genuine.
"""

import html
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

_MESSAGE = re.compile(r'<div class="tgme_widget_message [^"]*"[^>]*data-post="([^"]+)"', re.S)
_TEXT = re.compile(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', re.S)
_TIME = re.compile(r'<time[^>]*datetime="([^"]+)"')
_TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')


@dataclass(frozen=True)
class Post:
    url: str
    title: str
    snippet: str
    published_at: datetime


@dataclass(frozen=True)
class Channel:
    title: str | None
    posts: list[Post]


def _text(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment).strip()


def _headline(text: str) -> tuple[str, str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return "", ""
    first, rest = lines[0], " ".join(lines[1:])
    if len(first) > 200:
        cut = first[:200].rsplit(" ", 1)[0]
        first, rest = f"{cut}…", f"{first[len(cut) :].strip()} {rest}".strip()
    return first, rest[:400]


def parse(page: str, now: datetime | None = None, max_age_days: int = 7) -> Channel:
    now = now or datetime.now(UTC)
    oldest = now - timedelta(days=max_age_days)
    title_match = _TITLE.search(page)
    title = html.unescape(title_match.group(1)).strip() if title_match else None
    posts = []
    starts = [m.start() for m in _MESSAGE.finditer(page)] + [len(page)]
    for i, m in enumerate(_MESSAGE.finditer(page)):
        block = page[m.start() : starts[i + 1]]
        text_match = _TEXT.search(block)
        time_match = _TIME.search(block)
        if not text_match or not time_match:
            continue  # photos or videos without text: nothing to show as a headline
        headline, snippet = _headline(_text(text_match.group(1)))
        if not headline:
            continue
        try:
            published = datetime.fromisoformat(time_match.group(1))
        except ValueError:
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=UTC)
        if published < oldest:
            continue
        posts.append(Post(f"https://t.me/{m.group(1)}", headline, snippet, min(published, now)))
    return Channel(title or None, posts)
