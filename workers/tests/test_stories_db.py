"""Grouping into stories, end to end against the local database, with made-up embeddings so the
geometry is exact. Skipped when the database isn't running (`npx supabase start`)."""

from datetime import UTC, datetime, timedelta

import numpy as np
import psycopg
import pytest
from pgvector.psycopg import register_vector

from verilo_workers.cluster.stories import cluster_pending, merge_close
from verilo_workers.config import DATABASE_URL
from verilo_workers.ingest import store
from verilo_workers.ingest.registry import parse

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)

SLUGS = ["test-story-wire", "test-story-paper", "test-story-tabloid"]
NOW = datetime.now(UTC).replace(microsecond=0)
RNG = np.random.default_rng(42)


def unit(v):
    v = np.asarray(v, dtype=np.float32)
    return v / np.linalg.norm(v)


def near(base, similarity):
    """A unit vector with the given cosine similarity to `base`."""
    other = unit(RNG.normal(size=base.shape))
    other = unit(other - (other @ base) * base)
    return unit(similarity * base + np.sqrt(1 - similarity**2) * other)


def source(slug, tier, lean):
    return {
        "slug": slug,
        "name": slug,
        "homepage": "https://test.example",
        "country": "GB",
        "kind": "newspaper",
        "tier": tier,
        "lean": lean,
        "basis": "Test.",
        "feeds": [{"url": f"https://test.example/{slug}"}],
    }


@pytest.fixture
def conn():
    with store.connect() as c:
        register_vector(c)
        cleanup(c)
        store.sync_sources(
            parse(
                {
                    "source": [
                        source("test-story-wire", 1, "center"),
                        source("test-story-paper", 2, "lean_left"),
                        source("test-story-tabloid", 3, "lean_right"),
                    ]
                }
            ),
            c,
            scope=SLUGS,
        )
        c.commit()
        yield c
        cleanup(c)


def cleanup(c):
    with c.transaction():
        c.execute(
            """delete from public.stories where id in (select story_id from public.articles a
                 join public.sources s on s.id = a.source_id where s.slug = any(%s))""",
            (SLUGS,),
        )
        c.execute("delete from public.sources where slug = any(%s)", (SLUGS,))


def ids(conn):
    rows = conn.execute("select id, slug from public.sources where slug = any(%s)", (SLUGS,))
    return {r["slug"]: r["id"] for r in rows.fetchall()}


def add(conn, slug, title, vector, hours_ago, kind="news"):
    src = ids(conn)[slug]
    return conn.execute(
        """insert into public.articles (source_id, url, title, published_at, content_hash,
             kind, embedding, enriched_at)
           values (%s, %s, %s, %s, %s, %s, %s, now()) returning id""",
        (
            src,
            f"https://test.example/{slug}/{RNG.integers(1e12)}",
            title,
            NOW - timedelta(hours=hours_ago),
            format(int(RNG.integers(1 << 62)), "064x"),
            kind,
            vector,
        ),
    ).fetchone()["id"]


def story_of(conn, article_id):
    return conn.execute(
        "select story_id from public.articles where id = %s", (article_id,)
    ).fetchone()["story_id"]


def test_same_event_joins_and_a_different_one_does_not(conn):
    summit = unit(RNG.normal(size=384))
    other = unit(RNG.normal(size=384))
    a = add(conn, "test-story-wire", "Leaders meet for summit", summit, 5)
    b = add(conn, "test-story-paper", "Summit opens", near(summit, 0.88), 4)
    c = add(conn, "test-story-tabloid", "Summit: what to know", near(summit, 0.86), 3)
    d = add(conn, "test-story-paper", "Football final", other, 3)
    conn.commit()

    result = cluster_pending(conn, NOW, sources=list(ids(conn).values()))
    assert result == {"placed": 4, "new stories": 2}
    assert story_of(conn, a) == story_of(conn, b) == story_of(conn, c)
    assert story_of(conn, d) != story_of(conn, a)

    story = conn.execute(
        "select title, article_count, outlet_count from public.stories where id = %s",
        (story_of(conn, a),),
    ).fetchone()
    assert (story["article_count"], story["outlet_count"]) == (3, 3)


def test_the_title_comes_from_a_reputable_news_report_not_an_opinion_piece(conn):
    base = unit(RNG.normal(size=384))
    add(conn, "test-story-tabloid", "SHOCK summit", near(base, 0.99), 5)
    add(conn, "test-story-paper", "The view on the summit", base, 5, kind="opinion")
    add(conn, "test-story-paper", "Leaders agree a ceasefire at the summit", near(base, 0.9), 4)
    conn.commit()
    cluster_pending(conn, NOW, sources=list(ids(conn).values()))
    titles = conn.execute(
        """select distinct st.title from public.stories st join public.articles a
             on a.story_id = st.id join public.sources s on s.id = a.source_id
           where s.slug = any(%s)""",
        (SLUGS,),
    ).fetchall()
    assert [t["title"] for t in titles] == ["Leaders agree a ceasefire at the summit"]


def test_articles_more_than_three_days_apart_start_a_new_story(conn):
    base = unit(RNG.normal(size=384))
    old = add(conn, "test-story-wire", "First report", base, 100)
    new = add(conn, "test-story-paper", "Same words, days later", near(base, 0.95), 1)
    conn.commit()
    cluster_pending(conn, NOW, sources=list(ids(conn).values()))
    assert story_of(conn, old) != story_of(conn, new)


def test_a_story_does_not_drift_into_a_neighbouring_event(conn):
    # Close enough to the story's centre, but not to any single article in it.
    base = unit(RNG.normal(size=384))
    first = add(conn, "test-story-wire", "Event", base, 5)
    second = add(conn, "test-story-paper", "Event again", near(base, 0.97), 4)
    conn.commit()
    cluster_pending(conn, NOW, sources=list(ids(conn).values()))
    centre = unit(
        conn.execute("select centroid from public.stories where id = %s", (story_of(conn, first),))
        .fetchone()["centroid"]
        .to_numpy()
    )
    drifter = None
    for _ in range(200):  # find a vector 0.76 from the centre but under 0.8 from both members
        candidate = near(centre, 0.76)
        a_vec = base
        if candidate @ a_vec < 0.8 and candidate @ near(base, 0.97) < 0.8:
            drifter = candidate
            break
    assert drifter is not None
    d = add(conn, "test-story-tabloid", "Neighbouring event", drifter, 3)
    conn.commit()
    cluster_pending(conn, NOW, sources=list(ids(conn).values()))
    assert story_of(conn, d) != story_of(conn, first)
    assert story_of(conn, second) == story_of(conn, first)


def test_two_stories_that_turn_out_the_same_are_merged(conn):
    base = unit(RNG.normal(size=384))
    a = add(conn, "test-story-wire", "Report", base, 5)
    conn.commit()
    cluster_pending(conn, NOW, sources=list(ids(conn).values()))
    # Placed in a different story by hand, as if found before the first existed.
    b = add(conn, "test-story-paper", "Same report", near(base, 0.93), 4)
    conn.commit()
    separate = conn.execute(
        """insert into public.stories (title, first_published_at, last_published_at, centroid,
             article_count, outlet_count) values ('Same report', %s, %s, %s, 1, 1)
           returning id""",
        (NOW, NOW, near(base, 0.93)),
    ).fetchone()["id"]
    conn.execute(
        "update public.articles set story_id = %s, clustered_at = now() where id = %s",
        (separate, b),
    )
    conn.commit()
    assert story_of(conn, a) != story_of(conn, b)

    first = story_of(conn, a)
    assert merge_close(conn, NOW, sources=list(ids(conn).values())) == 1
    # Equal size: the older story (the first report, an hour earlier) keeps its id.
    assert story_of(conn, a) == story_of(conn, b) == first
    gone = conn.execute(
        "select merged_into from public.stories where id = %s", (separate,)
    ).fetchone()
    assert gone["merged_into"] == first


def test_readers_cannot_read_embeddings(conn):
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("set local role anon")
        conn.execute("select embedding from public.articles limit 1")
    with conn.transaction():
        conn.execute("set local role anon")
        conn.execute("select id, title, kind, story_id from public.articles limit 1")
