"""Which stories may get a summary, and which excerpts the writer is given.

The rule (CLAUDE.md, and lib/sources.ts summaryReadiness on the web, which must agree): only
news reports from tier 1-2 outlets count; at least MIN_OUTLETS such outlets (SENSITIVE_MIN for
sensitive topics: elections, health, disasters, crime, war), at least one tier 1 (a wire service or
public broadcaster), from at least two lean groups. Opinion, sponsored pieces and tier 3 outlets
are never given to the writer.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

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


def check(articles: list[Article], topic_slugs: set[str]) -> Verdict:
    pool = trusted(articles)
    outlets = {a.source_id: a for a in pool}
    needed = SENSITIVE_MIN if topic_slugs & SENSITIVE_TOPICS else MIN_OUTLETS
    missing = []
    if len(outlets) < needed:
        missing.append(f"{needed - len(outlets)} more reputable outlet(s)")
    if not any(a.tier == 1 for a in outlets.values()):
        missing.append("a public broadcaster or wire service")
    if len({LEAN_GROUP[a.lean] for a in outlets.values()}) < MIN_LEAN_GROUPS:
        missing.append("another lean group")
    return Verdict(not missing, "; ".join(missing) or "ok", len(outlets))


def passages(articles: list[Article], limit: int = MAX_PASSAGES) -> list[Article]:
    """One excerpt per trusted outlet, the fact base first and leans interleaved, so the
    writer sees the spread of coverage rather than one outlet's angle. Per outlet, its newest
    report (one with an excerpt when it has one), and only reports from the last FRESH."""
    pool = trusted(articles)
    if not pool:
        return []
    newest = max(a.published_at for a in pool)
    best: dict[int, Article] = {}
    for a in pool:
        if a.published_at < newest - FRESH:
            continue
        current = best.get(a.source_id)
        if current is None or (bool(a.snippet), a.published_at) > (
            bool(current.snippet),
            current.published_at,
        ):
            best[a.source_id] = a
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
