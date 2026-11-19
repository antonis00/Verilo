"""The AI topic tagger: reading the model's reply offline, and tagging against the local database
with a fake model (the database part is skipped when it isn't running)."""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from verilo_workers.ai import AIError, Completion
from verilo_workers.config import DATABASE_URL
from verilo_workers.enrich import llm_topics
from verilo_workers.enrich import topics as topic_tags

TOPICS = topic_tags.load()
SLUGS = {t.slug for t in TOPICS}


def test_the_reply_keeps_one_known_topic_per_article_and_ignores_the_rest():
    data = {
        "articles": [
            {"n": 1, "topics": ["football", "sport"]},  # only the main one is kept
            {"n": "2", "topics": ["made-up-topic", " economy "]},
            {"n": 3, "topics": []},
            {"n": 9, "topics": ["economy"]},  # no such article
            {"n": 1, "topics": ["economy"]},  # a repeat
            "nonsense",
        ]
    }
    assert llm_topics.read_reply(data, 3, SLUGS) == {1: ["football"], 2: ["economy"], 3: []}
    assert llm_topics.read_reply(None, 3, SLUGS) == {}
    assert llm_topics.read_reply({"articles": "x"}, 3, SLUGS) == {}


def test_a_narrow_topic_brings_its_parent_and_the_prompt_lists_the_catalog():
    assert llm_topics.with_parents(["football"], TOPICS) == [
        ("football", "llm"),
        ("sport", "parent"),
    ]
    assert llm_topics.with_parents(["economy"], TOPICS) == [("economy", "llm")]
    prompt = llm_topics.system_prompt(TOPICS)
    assert all(f"- {t.slug}: " in prompt for t in TOPICS)
    assert "1. Headline\nIts excerpt" in llm_topics.user_prompt(
        [{"title": "Headline", "snippet": "Its excerpt"}]
    )


# --- Against the database ---------------------------------------------------------------------

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
    DB = True
except psycopg.OperationalError:
    DB = False
needs_db = pytest.mark.skipif(not DB, reason="local database not running")

SOURCE = "test-llm-tags"
NOW = datetime.now(UTC).replace(microsecond=0)


@pytest.fixture
def conn():
    from verilo_workers.ingest import store
    from verilo_workers.ingest.registry import parse

    with store.connect() as c:
        if not c.execute("select 1 from public.topics where slug = 'football'").fetchone():
            pytest.skip("topics not synced (python -m verilo_workers sync-topics)")
        c.execute("delete from public.sources where slug = %s", (SOURCE,))
        source = {
            "slug": SOURCE,
            "name": "Test LLM",
            "homepage": "https://test.example",
            "country": "GB",
            "kind": "newspaper",
            "tier": 2,
            "lean": "center",
            "basis": "Test.",
            "feeds": [{"url": f"https://test.example/{SOURCE}"}],
        }
        store.sync_sources(parse({"source": [source]}), c, scope=[SOURCE])
        c.commit()
        yield c
        c.execute("delete from public.sources where slug = %s", (SOURCE,))
        c.commit()


def add(conn, title, hours_ago=1, kind="news", topic=None):
    src = conn.execute("select id from public.sources where slug = %s", (SOURCE,)).fetchone()
    article = conn.execute(
        """insert into public.articles (source_id, url, title, published_at, content_hash, kind,
             enriched_at) values (%s, %s, %s, %s, md5(%s) || md5(%s), %s, now()) returning id""",
        (
            src["id"],
            f"https://test.example/{title}",
            title,
            NOW - timedelta(hours=hours_ago),
            title,
            title,
            kind,
        ),
    ).fetchone()["id"]
    if topic:
        conn.execute(
            """insert into public.article_topics (article_id, topic_id, score, method)
               select %s, id, 0.7, 'embedding' from public.topics where slug = %s""",
            (article, topic),
        )
    conn.commit()
    return article


def tags_of(conn, article):
    rows = conn.execute(
        """select t.slug, at.method from public.article_topics at
           join public.topics t on t.id = at.topic_id where at.article_id = %s order by t.slug""",
        (article,),
    ).fetchall()
    return [(r["slug"], r["method"]) for r in rows]


def ours(conn):
    """Only this test's outlet: the tagger never touches other articles in the database."""
    return [
        conn.execute("select id from public.sources where slug = %s", (SOURCE,)).fetchone()["id"]
    ]


@needs_db
def test_untagged_news_gets_the_models_topic_and_is_never_asked_twice(conn):
    match = add(conn, "Arsenal beat Chelsea", hours_ago=1)
    nothing = add(conn, "A quiet day", hours_ago=2)
    tagged = add(conn, "Rates held", hours_ago=3, topic="economy")
    opinion = add(conn, "Our view", hours_ago=4, kind="opinion")
    old = add(conn, "Last week", hours_ago=100)
    asked = []

    def fake(role, system, user, **_):
        asked.append(user)
        return Completion("", {"articles": [{"n": 1, "topics": ["football"]}]}, "fake", "m")

    counts = llm_topics.tag_pending(conn, NOW, limit=10, complete_fn=fake, sources=ours(conn))
    assert counts == {"looked at": 2, "tagged": 1}
    assert "Arsenal" in asked[0] and "A quiet day" in asked[0]
    assert all(t not in asked[0] for t in ("Rates held", "Our view", "Last week"))
    assert tags_of(conn, match) == [("football", "llm"), ("sport", "parent")]
    assert tags_of(conn, nothing) == []
    assert tags_of(conn, tagged) == [("economy", "embedding")]
    assert tags_of(conn, opinion) == tags_of(conn, old) == []
    # Both were looked at: neither is sent again.
    assert llm_topics.tag_pending(conn, NOW, limit=10, complete_fn=fake, sources=ours(conn)) == {
        "looked at": 0,
        "tagged": 0,
    }


@needs_db
def test_a_failed_call_leaves_the_articles_for_the_next_round(conn):
    article = add(conn, "Storm hits coast")

    def broken(role, system, user, **_):
        raise AIError("tagger unreachable")

    assert (
        llm_topics.tag_pending(conn, NOW, limit=10, complete_fn=broken, sources=ours(conn))[
            "looked at"
        ]
        == 0
    )
    row = conn.execute(
        "select topics_llm_at from public.articles where id = %s", (article,)
    ).fetchone()
    assert row["topics_llm_at"] is None
