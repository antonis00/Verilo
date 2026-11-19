"""Opinion and sponsored pieces, told apart from news by rules a person can check.

Only articles classed "news" may ever feed a summary. Each decision records the rule that made it
(`kind_reason`, shown on the desk), so a wrong call can be traced and the rule fixed. The rules
lean towards flagging: an opinion piece wrongly kept out of a summary costs little; one used as
fact costs trust.
"""

import re
from urllib.parse import urlsplit

NEWS, OPINION, SPONSORED = "news", "opinion", "sponsored"

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
        r"[|–—-]\s*(opinion|letters?|editorial|comment|column)\s*$",
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

_OPINION_TITLES = [(label, re.compile(p, re.IGNORECASE)) for label, p in OPINION_TITLES]
_SPONSORED_TITLES = [(label, re.compile(p, re.IGNORECASE)) for label, p in SPONSORED_TITLES]


def _segments(url: str) -> list[str]:
    return [s.lower() for s in urlsplit(url).path.split("/") if s]


def classify(
    url: str, title: str, tags: list[str] | tuple[str, ...] = ()
) -> tuple[str, str | None]:
    """("news" | "opinion" | "sponsored", the rule that decided it, or None for plain news)."""
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

    return NEWS, None
