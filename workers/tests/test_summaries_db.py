"""Summaries end to end against the local database, with a fake model in place of the provider.
Skipped when the database isn't running (`npx supabase start`)."""

from datetime import UTC, datetime, timedelta

import numpy as np
import psycopg
import pytest

from verilo_workers.ai import AIError, Completion, RateLimited
from verilo_workers.config import DATABASE_URL
from verilo_workers.ingest import store
from verilo_workers.ingest.registry import parse
from verilo_workers.summarize.run import summarize_due

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)

SLUGS = ["test-sum-wire", "test-sum-left", "test-sum-right", "test-sum-extra"]
THREE = ["test-sum-wire", "test-sum-left", "test-sum-right"]
NOW = datetime.now(UTC).replace(microsecond=0)
RNG = np.random.default_rng(7)
SNIPPET = "Officials in Lisbon said 40 ministers attended the summit on Thursday."


def source(slug, tier, lean):
    return {
        "slug": slug,
        "name": slug.title(),
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
        cleanup(c)
        sources = [
            source("test-sum-wire", 1, "center"),
            source("test-sum-left", 2, "lean_left"),
            source("test-sum-right", 2, "lean_right"),
            source("test-sum-extra", 2, "center"),
        ]
        store.sync_sources(parse({"source": sources}), c, scope=SLUGS)
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


def story(conn, slugs):
    vec = RNG.normal(size=384).astype(np.float32)
    sid = conn.execute(
        """insert into public.stories (title, first_published_at, last_published_at, centroid,
             article_count, outlet_count) values ('Summit', %s, %s, %s, %s, %s) returning id""",
        (NOW - timedelta(hours=3), NOW, str(vec.tolist()), len(slugs), len(set(slugs))),
    ).fetchone()["id"]
    for slug in slugs:
        add(conn, sid, slug)
    conn.commit()
    return sid


def add(conn, sid, slug):
    src = conn.execute("select id from public.sources where slug = %s", (slug,)).fetchone()["id"]
    conn.execute(
        """insert into public.articles (source_id, url, title, snippet, published_at,
             content_hash, kind, enriched_at, clustered_at, story_id)
           values (%s, %s, 'Ministers meet in Lisbon', %s, %s, %s, 'news', now(), now(), %s)""",
        (
            src,
            f"https://test.example/{slug}/{RNG.integers(1e12)}",
            SNIPPET,
            NOW - timedelta(hours=1),
            format(int(RNG.integers(1 << 62)), "064x"),
            sid,
        ),
    )


GOOD = {
    "points": [
        {"text": "Officials said 40 ministers attended the summit in Lisbon.", "sources": ["A1"]},
        {"text": "The summit took place on Thursday.", "sources": ["A2", "A3"]},
    ]
}
BAD = {
    "points": [
        {"text": "Officials said 45 ministers attended.", "sources": ["A1"]},
        {"text": "The summit took place on Thursday.", "sources": ["A2"]},
    ]
}
VERDICTS = {
    "points": [{"point": 1, "verdict": "supported"}, {"point": 2, "verdict": "supported"}],
    "loaded_words": [],
    "unattributed_claims": [],
}
NOTHING = {"published": 0, "failed": 0, "waiting": 0, "ineligible": 0}


def fake(*drafts, verdict=VERDICTS, fail=None):
    calls = []
    queue = list(drafts)

    def complete_fn(role, system, user, **_):
        calls.append((role, user))
        if fail and role in fail:
            raise fail[role]
        if role == "writer":
            return Completion("", queue.pop(0), "fake", "writer-model")
        return Completion("", verdict, "fake", "checker-model")

    complete_fn.calls = calls
    return complete_fn


def summaries(conn, sid):
    return conn.execute(
        """select ss.*, (select count(*) from public.summary_checks c where c.summary_id = ss.id)
             as checks from public.story_summaries ss where story_id = %s order by id""",
        (sid,),
    ).fetchall()


def card(conn, sid):
    row = conn.execute("select summary from public.story_cards where id = %s", (sid,)).fetchone()
    return row["summary"]


def test_a_checked_summary_is_published_with_its_sources_and_shown_on_the_card(conn):
    sid = story(conn, THREE)
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fake(GOOD))["published"] == 1
    [row] = summaries(conn, sid)
    assert (row["status"], row["writer"], row["checker"]) == (
        "published",
        "fake:writer-model",
        "fake:checker-model",
    )
    assert row["checks"] == 6  # shape, citations, numbers, quotes, names, model
    assert all(set(b["article_ids"]) <= set(row["article_ids"]) for b in row["bullets"])
    assert card(conn, sid)["bullets"][0]["text"].startswith("Officials said 40")
    # Nothing new since: not summarised again.
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fake()) == NOTHING


def test_a_draft_failing_a_check_is_rewritten_with_the_problem_named(conn):
    sid = story(conn, THREE)
    fn = fake(BAD, GOOD)
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fn)["published"] == 1
    rewrite = [u for r, u in fn.calls if r == "writer"][1]
    assert "the number 45 is not in its cited excerpts" in rewrite
    assert summaries(conn, sid)[0]["attempts"] == 2


def test_failing_twice_keeps_headlines_only_and_logs_why(conn):
    sid = story(conn, THREE)
    rejected = {
        **VERDICTS,
        "points": [
            {"point": 1, "verdict": "contradicted", "reason": "the excerpt says otherwise"},
            {"point": 2, "verdict": "supported"},
        ],
    }
    fn = fake(GOOD, GOOD, verdict=rejected)
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fn)["failed"] == 1
    [row] = summaries(conn, sid)
    assert row["status"] == "failed"
    assert "judged contradicted" in row["failure"]
    assert card(conn, sid) is None
    # Not retried until more reports arrive.
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fake()) == NOTHING


def test_a_story_without_enough_outlets_is_never_sent_to_a_model(conn):
    sid = story(conn, ["test-sum-left", "test-sum-right", "test-sum-extra"])  # no tier 1
    fn = fake()
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fn)["ineligible"] == 1
    assert fn.calls == []
    assert summaries(conn, sid) == []


def test_rate_limits_pause_without_recording_and_errors_are_recorded(conn):
    sid = story(conn, THREE)
    fn = fake(fail={"writer": RateLimited(30)})
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fn)["waiting"] == 1
    assert summaries(conn, sid) == []
    fn = fake(GOOD, fail={"checker": AIError("checker unreachable")})
    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=fn)["failed"] == 1
    assert "checker unreachable" in summaries(conn, sid)[0]["failure"]


def test_the_same_model_cannot_check_its_own_summary(conn):
    sid = story(conn, THREE)

    def same(role, system, user, **_):
        return Completion("", GOOD if role == "writer" else VERDICTS, "fake", "one-model")

    assert summarize_due(conn, NOW, story_ids=[sid], complete_fn=same)["failed"] == 1


def test_new_reports_replace_an_older_summary_and_the_daily_cap_holds(conn):
    sid = story(conn, THREE)
    summarize_due(conn, NOW, story_ids=[sid], complete_fn=fake(GOOD))
    for slug in ["test-sum-extra", "test-sum-left", "test-sum-right"]:
        add(conn, sid, slug)
    conn.commit()
    later = NOW + timedelta(hours=3)
    assert summarize_due(conn, later, story_ids=[sid], per_day=0, complete_fn=fake()) == NOTHING
    assert summarize_due(conn, later, story_ids=[sid], complete_fn=fake(GOOD))["published"] == 1
    assert [r["status"] for r in summaries(conn, sid)] == ["superseded", "published"]
