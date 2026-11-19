"""Turning whatever a feed sends into the short excerpt Verilo may store.

Verilo never stores full article text: only a headline, a short snippet, the link and the date.
Feeds often put the whole article (with HTML) in their description, so every snippet goes
through `make_snippet`, which strips markup and cuts it to `MAX_SNIPPET` characters at a word.
The database enforces the same limit (see supabase/migrations).
"""

import html
import re

MAX_SNIPPET = 400

_TAGS = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def make_snippet(raw: str | None, limit: int = MAX_SNIPPET) -> str:
    if not raw:
        return ""
    text = _TAGS.sub(" ", raw)
    text = html.unescape(text)
    text = _SPACE.sub(" ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip(" ,;:.-") + "…"
