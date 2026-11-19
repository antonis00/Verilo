"""Topics readers can follow, and which articles belong to them.

Three ways an article gets a topic, each recorded with the method:
- `section`: its feed is a section that is the topic (a business feed is business).
- `embedding`: its headline and snippet are close in meaning to the topic's description.
- `parent`: it has a narrower topic whose parent this is (Football counts for Sport), so broad
  topics never lose stories to narrow ones.

With 18 broad topics (Nov 2026, 2,157 real articles) matches scoring MATCH_FLOOR or more were
right about 34 times in 36; below it guesses were often wrong, so nothing is assigned. With the
larger catalog the floor was re-measured (see docs in CLAUDE.md). Stories take the topics of their
articles. A language-model tagger (Phase 4) is the planned way to raise coverage.
"""

import tomllib
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

import numpy as np

from verilo_workers.enrich.embed import QUERY_PREFIX, embed

REGISTRY = Path(__file__).resolve().parents[2] / "data" / "topics.toml"

MATCH_FLOOR = 0.56  # the lowest similarity that counts as a match for a broad topic
NARROW_FLOOR = 0.58  # higher for narrow topics (those with a parent): a wrong one shows more
SECOND_WITHIN = 0.02  # a second topic is kept only if it's this close to the best
MAX_TOPICS = 2  # matched topics per article; parents of those come on top


@dataclass(frozen=True)
class Topic:
    slug: str
    name: str
    description: str
    sections: tuple[str, ...] = field(default_factory=tuple)
    featured: bool = False
    aliases: tuple[str, ...] = field(default_factory=tuple)
    parent: str | None = None


def load(path: Path = REGISTRY) -> list[Topic]:
    with path.open("rb") as fh:
        raw = tomllib.load(fh)["topic"]
    topics = [
        Topic(
            slug=t["slug"],
            name=t["name"],
            description=t["description"].strip(),
            sections=tuple(t.get("sections", ())),
            featured=bool(t.get("featured", False)),
            aliases=tuple(a.strip().lower() for a in t.get("aliases", ()) if a.strip()),
            parent=t.get("parent"),
        )
        for t in raw
    ]
    slugs = {t.slug for t in topics}
    if len(slugs) != len(topics):
        raise ValueError("a topic slug is used twice in topics.toml")
    for t in topics:
        if t.parent is not None:
            if t.parent not in slugs:
                raise ValueError(f"topic {t.slug}: parent {t.parent} doesn't exist")
            if next(p for p in topics if p.slug == t.parent).parent is not None:
                raise ValueError(f"topic {t.slug}: a parent can't have a parent of its own")
    sections = [s for t in topics for s in t.sections]
    if len(set(sections)) != len(sections):
        raise ValueError("a feed section is mapped to two topics")
    return topics


@cache
def _descriptions(topics: tuple[Topic, ...]) -> np.ndarray:
    return embed([QUERY_PREFIX + t.description for t in topics])


def assign(
    vectors: np.ndarray, sections: list[str | None], topics: list[Topic]
) -> list[list[tuple[str, float, str]]]:
    """For each article: [(topic slug, score, method)], best first: at most MAX_TOPICS matched
    topics, then the parents of those that have one."""
    if len(vectors) == 0:
        return []
    by_section = {s: t.slug for t in topics for s in t.sections}
    parent_of = {t.slug: t.parent for t in topics if t.parent}
    scores = vectors @ _descriptions(tuple(topics)).T
    out: list[list[tuple[str, float, str]]] = []
    for row, section in zip(scores, sections, strict=True):
        found: dict[str, tuple[float, str]] = {}
        if section and section in by_section:
            found[by_section[section]] = (1.0, "section")
        order = np.argsort(-row)
        best = float(row[order[0]])
        for k in order[:MAX_TOPICS]:
            score = float(row[k])
            if score < MATCH_FLOOR or score < best - SECOND_WITHIN:
                break
            if topics[k].parent and score < NARROW_FLOOR:
                continue
            found.setdefault(topics[k].slug, (score, "embedding"))
        ranked = sorted(found.items(), key=lambda kv: -kv[1][0])[:MAX_TOPICS]
        result = [(slug, round(score, 4), method) for slug, (score, method) in ranked]
        for slug, score, _method in list(result):
            parent = parent_of.get(slug)
            if parent and all(parent != s for s, _, _ in result):
                result.append((parent, score, "parent"))
        out.append(result)
    return out
