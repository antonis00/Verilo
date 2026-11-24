"""Grouping articles about the same event into stories.

Each new article, oldest first, joins the most similar story that is still running when both:
- its similarity to the story's centre (the normalised mean of the story's articles) is at least
  JOIN_CENTRE, and
- it is at least JOIN_MEMBER similar to one article already in the story, which stops a story
  from drifting as its centre moves;
and the story had an article within WINDOW of this one. Otherwise it starts a new story.

The thresholds were measured on 2,157 real articles from 34 outlets (Nov 2026; see
tests/data/same_event_pairs.json): pairs from different outlets scoring 0.75 or more were the same
event in 56 of 56 cases, 0.70-0.75 in 9 of 14, under 0.70 in 2 of 28. Centre-only grouping at 0.75
let the biggest story sprawl from a summit into neighbouring news (124 articles); adding the
member check kept it on the summit (86) while keeping 73 stories with three or more outlets.

`merge_close` joins stories that turn out to be the same event (found separately, then converging).

A story has a life: it takes articles only within MAX_SPAN of its first one, and each new article
must stay ANCHOR-close to the story's opening articles (its anchor), not only to the moving centre.
Without these (Nov 2026 review) big stories never closed: one ran 12 days and 284 articles, and
"Ukraine attacks Russian ships in Libya" was half Crimea bridge strikes, so its summary led with
the wrong event. Coverage after a story's life starts a new story that `follows` the old one, so
the story page can link the earlier and later developments.
"""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

JOIN_CENTRE = 0.75
JOIN_MEMBER = 0.80
MERGE_CENTRE = 0.85
WINDOW = timedelta(hours=72)
MAX_SPAN = timedelta(hours=72)  # a story's life, from its first article
ANCHOR_SIZE = 5  # the opening articles that define what a story is about
ANCHOR = 0.70  # a new article's least similarity to the anchor's centre
CANDIDATES = 5  # nearest stories tried for each article


@dataclass
class Member:
    article_id: int
    source_id: int
    tier: int
    kind: str
    title: str
    published_at: datetime
    vector: np.ndarray


@dataclass
class Story:
    id: int | None
    members: list[Member] = field(default_factory=list)
    changed: bool = False
    follows: "Story | None" = None  # the earlier story this one continues

    @property
    def centre(self) -> np.ndarray:
        total = np.sum([m.vector for m in self.members], axis=0)
        return total / max(float(np.linalg.norm(total)), 1e-12)

    @property
    def first(self) -> datetime:
        return min(m.published_at for m in self.members)

    @property
    def last(self) -> datetime:
        return max(m.published_at for m in self.members)

    @property
    def anchor(self) -> np.ndarray:
        """The centre of the story's opening articles: what the story is about."""
        opening = sorted(self.members, key=lambda m: (m.published_at, m.article_id))[:ANCHOR_SIZE]
        total = np.sum([m.vector for m in opening], axis=0)
        return total / max(float(np.linalg.norm(total)), 1e-12)

    def open_to(self, m: "Member") -> bool:
        """Whether `m` is within the story's life and still about the story's event."""
        if not (self.first - WINDOW <= m.published_at <= self.first + MAX_SPAN):
            return False
        return float(self.anchor @ m.vector) >= ANCHOR

    def title(self) -> str:
        """The headline that best represents the story: from a reputable outlet's news report
        when there is one (never an opinion piece's headline), a plain report rather than a
        question or a "Why..." explainer, closest to the centre; without agency prefixes."""
        centre = self.centre
        preferred = [m for m in self.members if m.kind == "news" and m.tier <= 2]
        pool = preferred or [m for m in self.members if m.kind == "news"] or self.members
        plain = [m for m in pool if not is_explainer(m.title)] or pool
        return clean_headline(max(plain, key=lambda m: float(m.vector @ centre)).title)


# Prefixes outlets put on headlines that aren't part of the news: "(LEAD)", "Live:", "WATCH:".
_PREFIX = re.compile(
    r"^\s*(?:\((?:LEAD|\d+(?:st|nd|rd|th) LD|URGENT|UPDATE\s*\d*)\)\s*"
    r"|(?:live updates|live|watch|video|breaking|exclusive|update)\s*[:|\u2013\u2014-]\s*)+",
    re.IGNORECASE,
)
_EXPLAINER = re.compile(
    r"^(?:why|how|what|who|where|when|is|are|can|should|will)\b|\?\s*$", re.IGNORECASE
)


def clean_headline(title: str) -> str:
    cleaned = _PREFIX.sub("", title).strip()
    return cleaned[:1].upper() + cleaned[1:] if cleaned else title


def is_explainer(title: str) -> bool:
    """A question or a "Why/How..." headline: an explainer, not the report of what happened."""
    return bool(_EXPLAINER.search(clean_headline(title)))


def _array(value) -> np.ndarray:
    """pgvector hands back its own Vector type; the maths here needs numpy."""
    if hasattr(value, "to_numpy"):
        value = value.to_numpy()
    return np.asarray(value, dtype=np.float32)


def _member(row: dict) -> Member:
    return Member(
        article_id=row["id"],
        source_id=row["source_id"],
        tier=row["tier"],
        kind=row["kind"],
        title=row["title"],
        published_at=row["published_at"],
        vector=_array(row["embedding"]),
    )


ARTICLE_COLUMNS = """a.id, a.source_id, s.tier, a.kind, a.title, a.published_at, a.embedding,
                     a.story_id"""


def _choose(story_list: list[Story], centres: np.ndarray, m: Member) -> tuple[Story | None, float]:
    if not story_list:
        return None, 0.0
    sims = centres @ m.vector
    for k in np.argsort(-sims)[:CANDIDATES]:
        score = float(sims[k])
        if score < JOIN_CENTRE:
            break
        story = story_list[k]
        if not story.open_to(m):
            continue
        if max(float(o.vector @ m.vector) for o in story.members) < JOIN_MEMBER:
            continue
        return story, score
    return None, 0.0


def _followed(story_list: list[Story], centres: np.ndarray, m: Member) -> Story | None:
    """An earlier story this article continues: the same event by similarity, past its life."""
    if not story_list:
        return None
    sims = centres @ m.vector
    for k in np.argsort(-sims)[:CANDIDATES]:
        if float(sims[k]) < JOIN_CENTRE:
            break
        story = story_list[k]
        past_life = m.published_at > story.first + MAX_SPAN
        if past_life and max(float(o.vector @ m.vector) for o in story.members) >= JOIN_MEMBER:
            return story
    return None


def cluster_pending(
    conn: psycopg.Connection, now: datetime | None = None, sources: list[int] | None = None
) -> dict[str, int]:
    """Place every enriched, unplaced article into a story (`sources` limits it to some
    outlets' articles and stories, for tests). Returns counts for the log."""
    now = now or datetime.now(UTC)
    register_vector(conn)
    pending = conn.execute(
        f"""select {ARTICLE_COLUMNS} from public.articles a
            join public.sources s on s.id = a.source_id
            where a.enriched_at is not null and a.clustered_at is null
              and a.embedding is not null
              and (%s::bigint[] is null or a.source_id = any(%s::bigint[]))
            order by a.published_at, a.id""",
        (sources, sources),
    ).fetchall()
    # Live blogs, newsletters and roundups cover many events: they join no story.
    live = [r for r in pending if r["kind"] == "live"]
    if live:
        conn.execute(
            "update public.articles set clustered_at = %s where id = any(%s)",
            (now, [r["id"] for r in live]),
        )
        pending = [r for r in pending if r["kind"] != "live"]
    if not pending:
        return {"placed": 0, "new stories": 0}

    # Stories an article could join or follow: started within MAX_SPAN + WINDOW before it.
    earliest = min(r["published_at"] for r in pending) - MAX_SPAN - WINDOW
    rows = conn.execute(
        f"""select {ARTICLE_COLUMNS} from public.articles a
            join public.sources s on s.id = a.source_id
            join public.stories st on st.id = a.story_id
            where st.merged_into is null and st.last_published_at >= %s
              and a.embedding is not null
              and (%s::bigint[] is null or a.source_id = any(%s::bigint[]))""",
        (earliest, sources, sources),
    ).fetchall()
    stories: dict[int, Story] = {}
    for r in rows:
        stories.setdefault(r["story_id"], Story(r["story_id"])).members.append(_member(r))
    story_list = list(stories.values())
    centres = np.array([s.centre for s in story_list]) if story_list else np.zeros((0, 384))

    placements: list[tuple[Member, Story, float]] = []
    created = 0
    for r in pending:
        m = _member(r)
        story, score = _choose(story_list, centres, m)
        if story is None:
            earlier = _followed(story_list, centres, m)
            story, score = Story(None), 1.0
            story.follows = earlier
            story_list.append(story)
            centres = np.vstack([centres, m.vector]) if len(centres) else m.vector[None, :]
            created += 1
        story.members.append(m)
        story.changed = True
        centres[story_list.index(story)] = story.centre
        placements.append((m, story, score))

    with conn.transaction():
        # Oldest first, so a story is saved before any story that follows it.
        for story in sorted(story_list, key=lambda st: st.first):
            if story.changed:
                _save(conn, story)
        for m, story, score in placements:
            conn.execute(
                """update public.articles set story_id = %s, story_similarity = %s,
                     clustered_at = %s where id = %s""",
                (story.id, round(score, 4), now, m.article_id),
            )
    return {"placed": len(placements), "new stories": created}


def _save(conn: psycopg.Connection, story: Story) -> None:
    values = {
        "title": story.title(),
        "first": story.first,
        "last": story.last,
        "centre": story.centre,
        "articles": len(story.members),
        "outlets": len({m.source_id for m in story.members}),
    }
    if story.id is None:
        story.id = conn.execute(
            """insert into public.stories (title, first_published_at, last_published_at, centroid,
                 article_count, outlet_count, follows)
               values (%(title)s, %(first)s, %(last)s, %(centre)s, %(articles)s, %(outlets)s,
                       %(follows)s)
               returning id""",
            {**values, "follows": story.follows.id if story.follows else None},
        ).fetchone()["id"]
    else:
        conn.execute(
            """update public.stories set title = %(title)s, first_published_at = %(first)s,
                 last_published_at = %(last)s, centroid = %(centre)s,
                 article_count = %(articles)s, outlet_count = %(outlets)s
               where id = %(id)s""",
            {**values, "id": story.id},
        )


def merge_close(
    conn: psycopg.Connection, now: datetime | None = None, sources: list[int] | None = None
) -> int:
    """Join running stories that are the same event: centres at least MERGE_CENTRE alike and an
    article pair at least JOIN_MEMBER alike. The smaller story joins the larger; between equals,
    the newer joins the older, so the story that was there first keeps its id (and its links).
    Returns how many merges were made."""
    now = now or datetime.now(UTC)
    register_vector(conn)
    rows = conn.execute(
        f"""select {ARTICLE_COLUMNS} from public.articles a
            join public.sources s on s.id = a.source_id
            join public.stories st on st.id = a.story_id
            where st.merged_into is null and st.last_published_at >= %s
              and a.embedding is not null
              and (%s::bigint[] is null or a.source_id = any(%s::bigint[]))""",
        (now - WINDOW, sources, sources),
    ).fetchall()
    stories: dict[int, Story] = {}
    for r in rows:
        stories.setdefault(r["story_id"], Story(r["story_id"])).members.append(_member(r))
    alive = sorted(stories.values(), key=lambda s: (-len(s.members), s.first, s.id))
    if len(alive) < 2:
        return 0
    merges = 0
    gone: set[int] = set()
    centres = np.array([s.centre for s in alive])
    sims = centres @ centres.T
    with conn.transaction():
        for i, big in enumerate(alive):
            if big.id in gone:
                continue
            for j in range(i + 1, len(alive)):
                small = alive[j]
                if small.id in gone or sims[i, j] < MERGE_CENTRE:
                    continue
                # One event, one life: no merge that would outgrow MAX_SPAN or leave the anchor.
                if max(big.last, small.last) - min(big.first, small.first) > MAX_SPAN:
                    continue
                if float(big.anchor @ small.anchor) < ANCHOR:
                    continue
                close = max(float(a.vector @ b.vector) for a in big.members for b in small.members)
                if close < JOIN_MEMBER:
                    continue
                big.members.extend(small.members)
                gone.add(small.id)
                conn.execute(
                    "update public.articles set story_id = %s where story_id = %s",
                    (big.id, small.id),
                )
                conn.execute(
                    """update public.stories set merged_into = %s, article_count = 0,
                         outlet_count = 0 where id = %s""",
                    (big.id, small.id),
                )
                _save(conn, big)
                merges += 1
    return merges


def recluster_all(conn: psycopg.Connection, now: datetime | None = None) -> dict[str, int]:
    """Rebuild every story under the current rules (after changing them, on a development
    database): stories are deleted, with their summaries, corrections and saved marks, and every
    article is grouped again. Articles without an embedding (pruned after a week) stay out."""
    with conn.transaction():
        conn.execute("update public.articles set story_id = null, clustered_at = null")
        conn.execute("delete from public.stories")
    conn.commit()
    placed = cluster_pending(conn, now)
    conn.commit()
    merged = merge_close(conn, now)
    conn.commit()
    return {**placed, "merged": merged}
