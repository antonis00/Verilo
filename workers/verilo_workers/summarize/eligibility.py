"""Which stories may get a summary, and which excerpts the writer is given.

The rule (CLAUDE.md, and lib/sources.ts summaryReadiness on the web, which must agree): only
news reports from tier 1-2 outlets count; at least MIN_OUTLETS such outlets (SENSITIVE_MIN for
sensitive topics: elections, health, disasters, crime, war), at least one tier 1 (a wire service or
public broadcaster), from at least two lean groups. Opinion, sponsored pieces and tier 3 outlets
are never given to the writer.
"""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from difflib import SequenceMatcher

MIN_OUTLETS = 3
SENSITIVE_MIN = 4
MIN_LEAN_GROUPS = 2
MAX_PASSAGES = 12
# Only reports from the last FRESH before the story's newest one are given to the writer, so a
# summary describes the event as it stands, not as it was first reported (Nov 2026 review: a
# summary published on the 24th said a meeting "is being held on Thursday, 19 November").
FRESH = timedelta(hours=48)

SENSITIVE_TOPICS = {
    "elections", "crime", "law-and-justice", "health", "medicine", "mental-health", "outbreaks",
    "weather-and-disasters", "war-and-security",
}  # fmt: skip

LEAN_GROUP = {
    "left": "left",
    "lean_left": "left",
    "center": "centre",
    "lean_right": "right",
    "right": "right",
}


@dataclass(frozen=True)
class Article:
    id: int
    source_id: int
    source: str
    tier: int
    lean: str
    kind: str
    title: str
    snippet: str
    published_at: datetime


@dataclass(frozen=True)
class Verdict:
    eligible: bool
    reason: str  # what's missing, or "ok"
    outlets: int


def trusted(articles: list[Article]) -> list[Article]:
    return [a for a in articles if a.kind == "news" and a.tier <= 2]


# Wire copy: many outlets run an agency's report under their own name (Nov 2026 review: CBS, ABC
# and the South China Morning Post carrying the same AP text counted as three outlets and two
# leans). An article credited to an agency, or whose excerpt is nearly the same as another's, is
# one source with them: it counts once, and agency copy counts as the agency's (centre) lean.
AGENCIES = {
    "reuters": "Reuters", "ap": "AP", "associated press": "AP", "afp": "AFP",
    "agence france-presse": "AFP", "bloomberg": "Bloomberg", "pa": "PA", "pa media": "PA",
    "dpa": "dpa", "ani": "ANI", "pti": "PTI", "yonhap": "Yonhap", "aap": "AAP", "efe": "EFE",
    "xinhua": "Xinhua", "anadolu": "Anadolu",
}  # fmt: skip
_CREDIT = re.compile(
    r"\((" + "|".join(re.escape(k) for k in sorted(AGENCIES, key=len, reverse=True)) + r")\)"
    r"|\b(?:by|via|source:)\s+(" + "|".join(re.escape(k) for k in AGENCIES if len(k) > 3) + r")\b",
    re.IGNORECASE,
)
SAME_COPY = 0.85  # excerpt similarity at which two outlets are running the same text
COPY_CHARS = 200
COPY_MIN = 60  # excerpts shorter than this are too short to judge


def agency(a: Article) -> str | None:
    """The news agency an article is credited to ("(Reuters)", "via AP"), if any."""
    found = _CREDIT.search(f"{a.title} {a.snippet}")
    if not found:
        return None
    return AGENCIES[(found.group(1) or found.group(2)).lower()]


def _copy_text(a: Article) -> str:
    return re.sub(r"\W+", " ", a.snippet.lower())[:COPY_CHARS].strip()


def sources(articles: list[Article]) -> list[list[Article]]:
    """Trusted articles in groups of one independent source each: an outlet's own reports, joined
    with other outlets' when they run the same agency copy."""
    pool = trusted(articles)
    parent = list(range(len(pool)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def join(i: int, j: int) -> None:
        parent[find(i)] = find(j)

    credits = [agency(a) for a in pool]
    texts = [_copy_text(a) for a in pool]
    for i in range(len(pool)):
        for j in range(i + 1, len(pool)):
            same_outlet = pool[i].source_id == pool[j].source_id
            same_credit = credits[i] is not None and credits[i] == credits[j]
            same_copy = (
                len(texts[i]) >= COPY_MIN
                and len(texts[j]) >= COPY_MIN
                and SequenceMatcher(None, texts[i], texts[j]).ratio() >= SAME_COPY
            )
            if same_outlet or same_credit or same_copy:
                join(i, j)
    groups: dict[int, list[Article]] = {}
    for i, a in enumerate(pool):
        groups.setdefault(find(i), []).append(a)
    return list(groups.values())


def group_lean(group: list[Article]) -> str:
    """A source's lean group: agency copy is the agency's (centre); otherwise the lean of its most
    trusted outlet."""
    if any(agency(a) for a in group) or len({a.source_id for a in group}) > 1:
        return "centre"
    return LEAN_GROUP[min(group, key=lambda a: a.tier).lean]


def check(articles: list[Article], topic_slugs: set[str]) -> Verdict:
    groups = sources(articles)
    needed = SENSITIVE_MIN if topic_slugs & SENSITIVE_TOPICS else MIN_OUTLETS
    missing = []
    if len(groups) < needed:
        missing.append(f"{needed - len(groups)} more independent reputable source(s)")
    if not any(a.tier == 1 for g in groups for a in g):
        missing.append("a public broadcaster or wire service")
    if len({group_lean(g) for g in groups}) < MIN_LEAN_GROUPS:
        missing.append("another lean group")
    return Verdict(not missing, "; ".join(missing) or "ok", len(groups))


def passages(articles: list[Article], limit: int = MAX_PASSAGES) -> list[Article]:
    """One excerpt per independent source (an outlet, or outlets running the same agency copy:
    `sources`), the fact base first and leans interleaved, so the writer sees the spread of
    coverage rather than one angle, or one agency's text several times. Per source, its newest
    report (one with an excerpt when there is one, from the most trusted outlet on a tie), and
    only reports from the last FRESH."""
    pool = trusted(articles)
    if not pool:
        return []
    newest = max(a.published_at for a in pool)
    group_of = {id(a): g for g, members in enumerate(sources(articles)) for a in members}
    best: dict[int, Article] = {}
    for a in pool:
        if a.published_at < newest - FRESH:
            continue
        key = group_of[id(a)]
        current = best.get(key)
        rank = (bool(a.snippet), a.published_at, -a.tier)
        if current is None or rank > (
            bool(current.snippet),
            current.published_at,
            -current.tier,
        ):
            best[key] = a
    chosen = sorted(best.values(), key=lambda a: (a.tier, -len(a.snippet)))
    ordered: list[Article] = []
    seen_groups: list[str] = []
    remaining = list(chosen)
    while remaining and len(ordered) < limit:
        # Prefer an outlet from a lean group not yet represented, keeping tier order otherwise.
        pick = next((a for a in remaining if LEAN_GROUP[a.lean] not in seen_groups), remaining[0])
        ordered.append(pick)
        seen_groups.append(LEAN_GROUP[pick.lean])
        if len(set(seen_groups)) == 3:
            seen_groups = []
        remaining.remove(pick)
    return ordered
