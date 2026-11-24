"""Opinion, analysis, live/roundup and sponsored pieces, told apart from news by rules a person
can check.

- analysis: a journalist's interpretation ("Analysis:", "writes X", /analysis/), labelled.
- live: live blogs, newsletters, podcasts and daily round-ups. They cover many events at once,
  so they join no story (Nov 2026 review: a newsletter and a two-subject show had pulled
  separate events together). A video report is about one event: it stays news.

Only articles classed "news" may ever feed a summary. Each decision records the rule that made it
(`kind_reason`, shown on the desk), so a wrong call can be traced and the rule fixed. The rules
lean towards flagging: an opinion piece wrongly kept out of a summary costs little; one used as
fact costs trust.
"""

import re
from urllib.parse import urlsplit

NEWS, OPINION, SPONSORED = "news", "opinion", "sponsored"
ANALYSIS, LIVE = "analysis", "live"

# Path segments outlets use for opinion, editorials and reviews.
OPINION_PATHS = {
    "opinion", "opinions", "commentisfree", "comment", "editorial", "editorials", "op-ed",
    "oped", "op-eds", "columns", "column", "columnists", "letters", "voices", "views",
    "perspectives", "leaders", "review", "reviews",
}  # fmt: skip

# Headlines that announce opinion, each with the plain description recorded as the reason.
OPINION_TITLES = [
    (
        "headline starts with Opinion:, Editorial:, Comment:, Letters: or similar",
        r"^(opinion|editorial|comment|letters?|op-ed|view|our view|leader|column)\s*[:|–—-]",
    ),
    (
        "headline ends with | Opinion, | Letters, | Editorial or similar",
        r"[|–—-]\s*([\w' ]+ )?(opinion|letters?|editorial|comment|column)\s*$",
    ),
    ("headline is an editorial (“The … view on …”)", r"^the [\w’' .]+ view on "),
    ("headline is a letter to the editor", r"^letters? to the editor"),
    # Reviews are a critic's opinion of a film, book, game or show.
    ("headline is a review (“Review:”)", r"\breview\s*:|^review\b"),
]

OPINION_TAGS = {
    "opinion", "comment", "commentisfree", "editorial", "editorials", "op-ed", "letters",
    "columnists", "columns", "opinion pieces",
}  # fmt: skip

# Paid or commercial content: advertorials, and shopping guides written to earn commission.
SPONSORED_PATHS = {
    "sponsored", "paid-post", "paid-content", "partner-content", "brandvoice", "advertorial",
    "promoted", "shopping", "deals", "coupons", "underscored", "best-products",
}  # fmt: skip
SPONSORED_TITLES = [
    (
        "headline is labelled sponsored or paid",
        r"^(sponsored|paid post|paid content|advertisement|advertorial|partner content)\b",
    ),
    (
        "headline says it's in partnership with or sponsored by someone",
        r"\b(in partnership with|sponsored by)\b",
    ),
]
# Only explicit labels: feeds also use topic tags like "shopping" on ordinary journalism.
SPONSORED_TAGS = {"sponsored", "paid content", "paid post", "partner content", "advertorial"}

ANALYSIS_PATHS = {"analysis", "news-analysis", "the-big-read", "long-read", "longread"}
ANALYSIS_TITLES = [
    ("headline starts with Analysis:", r"^(news )?analysis\s*[:|\u2013\u2014-]"),
    ("headline ends with | Analysis", r"[|\u2013\u2014-]\s*analysis\s*$"),
]
ANALYSIS_TAGS = {"analysis", "news analysis"}

LIVE_PATHS = {
    "live", "live-news", "liveblog", "live-updates", "podcast", "podcasts", "newsletter",
    "newsletters", "audio",
}  # fmt: skip
LIVE_TITLES = [
    (
        "headline is a live blog or podcast (Live:, Podcast:)",
        r"^(live|live updates|podcast|listen)\s*[:|\u2013\u2014-]",
    ),
    (
        "headline is a live blog, newsletter, podcast or roundup",
        r"\b(live updates|as it happened|newsletter|podcast|news brief|morning briefing|"
        r"evening briefing|news highlights|the bottom line)\b",
    ),
]
LIVE_TAGS = {"podcast", "podcasts", "live", "newsletter"}

_OPINION_TITLES = [(label, re.compile(p, re.IGNORECASE)) for label, p in OPINION_TITLES]
_ANALYSIS_TITLES = [(label, re.compile(p, re.IGNORECASE)) for label, p in ANALYSIS_TITLES]
_LIVE_TITLES = [(label, re.compile(p, re.IGNORECASE)) for label, p in LIVE_TITLES]
# "…, writes Adam Maguire": a signed piece of analysis or commentary.
_WRITES = re.compile(r"\b(writes|argues)\s+[A-Z][a-z]+(?:\s+[A-Z][\w'-]+)+")
_SPONSORED_TITLES = [(label, re.compile(p, re.IGNORECASE)) for label, p in SPONSORED_TITLES]


def _segments(url: str) -> list[str]:
    return [s.lower() for s in urlsplit(url).path.split("/") if s]


def classify(
    url: str, title: str, tags: list[str] | tuple[str, ...] = (), snippet: str = ""
) -> tuple[str, str | None]:
    """(news | opinion | analysis | live | sponsored, the rule that decided it, or None for plain
    news)."""
    segments = _segments(url)
    lowered_tags = {t.strip().lower() for t in tags if t and t.strip()}

    for seg in segments:
        if seg in SPONSORED_PATHS:
            return SPONSORED, f"link path /{seg}/"
    for label, pattern in _SPONSORED_TITLES:
        if pattern.search(title):
            return SPONSORED, label
    if hit := lowered_tags & SPONSORED_TAGS:
        return SPONSORED, f"feed category “{sorted(hit)[0]}”"

    for seg in segments:
        if seg in OPINION_PATHS:
            return OPINION, f"link path /{seg}/"
    for label, pattern in _OPINION_TITLES:
        if pattern.search(title):
            return OPINION, label
    if hit := lowered_tags & OPINION_TAGS:
        return OPINION, f"feed category “{sorted(hit)[0]}”"

    for seg in segments:
        if seg in LIVE_PATHS:
            return LIVE, f"link path /{seg}/"
    for label, pattern in _LIVE_TITLES:
        if pattern.search(title):
            return LIVE, label
    if hit := lowered_tags & LIVE_TAGS:
        return LIVE, f"feed category “{sorted(hit)[0]}”"

    for seg in segments:
        if seg in ANALYSIS_PATHS or seg.endswith("-analysis") or seg.startswith("analysis-"):
            return ANALYSIS, f"link path /{seg}/"
    for label, pattern in _ANALYSIS_TITLES:
        if pattern.search(title):
            return ANALYSIS, label
    if _WRITES.search(snippet) or _WRITES.search(title):
        return ANALYSIS, "signed: “writes …”"
    if hit := lowered_tags & ANALYSIS_TAGS:
        return ANALYSIS, f"feed category “{sorted(hit)[0]}”"

    return NEWS, None
