"""`enrich`: give new articles their embedding and topics. (Their kind, news, opinion or
sponsored, is decided at ingest, where the feed's categories are still at hand.)"""

from datetime import UTC, datetime

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

from verilo_workers.enrich import topics as topic_tags
from verilo_workers.enrich.embed import article_text, embed

BATCH = 512


def sync_topics(conn: psycopg.Connection, topics: list[topic_tags.Topic]) -> int:
    with conn.transaction():
        for position, t in enumerate(topics):
            conn.execute(
                """insert into public.topics
                     (slug, name, description, position, active, featured, aliases)
                   values (%s, %s, %s, %s, true, %s, %s)
                   on conflict (slug) do update set name = excluded.name,
                     description = excluded.description, position = excluded.position,
                     active = true, featured = excluded.featured, aliases = excluded.aliases""",
                (t.slug, t.name, t.description, position, t.featured, list(t.aliases)),
            )
        # Parents once every topic exists.
        for t in topics:
            conn.execute(
                """update public.topics set parent_id =
                     (select id from public.topics where slug = %s)
                   where slug = %s""",
                (t.parent, t.slug),
            )
        conn.execute(
            "update public.topics set active = false where slug <> all(%s)",
            ([t.slug for t in topics],),
        )
    return len(topics)


def retag_all(conn: psycopg.Connection) -> int:
    """Recompute every enriched article's topics from its stored embedding (after topics.toml
    changes). Returns how many articles were retagged."""
    register_vector(conn)
    topics = topic_tags.load()
    ids = {
        r["slug"]: r["id"]
        for r in conn.execute("select id, slug from public.topics where active").fetchall()
    }
    rows = conn.execute(
        """select a.id, a.embedding, f.section
           from public.articles a left join public.source_feeds f on f.id = a.feed_id
           where a.enriched_at is not null order by a.id"""
    ).fetchall()
    if not rows:
        return 0
    vectors = np.array([_array(r["embedding"]) for r in rows])
    tags = topic_tags.assign(vectors, [r["section"] for r in rows], topics)
    with conn.transaction():
        conn.execute("delete from public.article_topics")
        # The catalog changed: the AI tagger looks again at what embeddings leave untagged.
        conn.execute("update public.articles set topics_llm_at = null")
        for row, found in zip(rows, tags, strict=True):
            _save_topics(conn, row["id"], found, ids)
    return len(rows)


def _array(value) -> np.ndarray:
    if hasattr(value, "to_numpy"):
        value = value.to_numpy()
    return np.asarray(value, dtype=np.float32)


def _save_topics(conn, article_id: int, found, ids: dict[str, int]) -> None:
    for slug, score, method in found:
        if slug in ids:
            conn.execute(
                """insert into public.article_topics (article_id, topic_id, score, method)
                   values (%s, %s, %s, %s) on conflict do nothing""",
                (article_id, ids[slug], score, method),
            )


def enrich_pending(conn: psycopg.Connection, now: datetime | None = None) -> int:
    """Embed and tag every article not yet enriched, in batches. Returns how many."""
    now = now or datetime.now(UTC)
    register_vector(conn)
    topics = topic_tags.load()
    ids = {
        r["slug"]: r["id"]
        for r in conn.execute("select id, slug from public.topics where active").fetchall()
    }
    done = 0
    while True:
        rows = conn.execute(
            """select a.id, a.title, a.snippet, f.section
               from public.articles a left join public.source_feeds f on f.id = a.feed_id
               where a.enriched_at is null order by a.id limit %s""",
            (BATCH,),
        ).fetchall()
        if not rows:
            return done
        vectors = embed([article_text(r["title"], r["snippet"]) for r in rows])
        tags = topic_tags.assign(vectors, [r["section"] for r in rows], topics)
        with conn.transaction():
            for row, vector, found in zip(rows, vectors, tags, strict=True):
                conn.execute(
                    "update public.articles set embedding = %s, enriched_at = %s where id = %s",
                    (vector, now, row["id"]),
                )
                _save_topics(conn, row["id"], found, ids)
        done += len(rows)
