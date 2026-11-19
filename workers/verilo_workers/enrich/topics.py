"""Topics readers can follow, and which articles belong to them.

Two ways an article gets a topic, both recorded with the method:
- `section`: its feed is a section that is the topic (a business feed is business).
- `embedding`: its headline and snippet are close in meaning to the topic's description.

Measured on 2,157 real articles (Nov 2026): matches scoring MATCH_FLOOR or more were right about 34
times in 36, but cover only about a quarter of articles; below it, guesses were often wrong, so
nothing is assigned. Stories take the topics of all their articles, which covers most
multi-outlet stories. A language-model tagger (Phase 4) is the planned way to raise coverage.
"""

import tomllib
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

import numpy as np

from verilo_workers.enrich.embed import QUERY_PREFIX, embed

REGISTRY = Path(__file__).resolve().parents[2] / "data" / "topics.toml"

MATCH_FLOOR = 0.56  # the lowest similarity that counts as a match
SECOND_WITHIN = 0.02  # a second topic is kept only if it's this close to the best
MAX_TOPICS = 2


@dataclass(frozen=True)
class Topic:
    slug: str
    name: str
    description: str
    sections: tuple[str, ...] = field(default_factory=tuple)


def load(path: Path = REGISTRY) -> list[Topic]:
    with path.open("rb") as fh:
        raw = tomllib.load(fh)["topic"]
    topics = [
        Topic(t["slug"], t["name"], t["description"].strip(), tuple(t.get("sections", ())))
        for t in raw
    ]
    slugs = [t.slug for t in topics]
    if len(set(slugs)) != len(slugs):
        raise ValueError("a topic slug is used twice in topics.toml")
    return topics


@cache
def _descriptions(topics: tuple[Topic, ...]) -> np.ndarray:
    return embed([QUERY_PREFIX + t.description for t in topics])


def assign(
    vectors: np.ndarray, sections: list[str | None], topics: list[Topic]
) -> list[list[tuple[str, float, str]]]:
    """For each article: [(topic slug, score, method)], best first, at most MAX_TOPICS."""
    if len(vectors) == 0:
        return []
    by_section = {s: t.slug for t in topics for s in t.sections}
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
            found.setdefault(topics[k].slug, (score, "embedding"))
        ranked = sorted(found.items(), key=lambda kv: -kv[1][0])[:MAX_TOPICS]
        out.append([(slug, round(score, 4), method) for slug, (score, method) in ranked])
    return out
