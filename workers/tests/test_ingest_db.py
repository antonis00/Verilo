"""End to end against the local Supabase database: registry → feeds → articles, with a fake
web (httpx.MockTransport). Skipped when the database isn't running (`npx supabase start`)."""

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import psycopg
import pytest

from verilo_workers.config import DATABASE_URL
from verilo_workers.ingest import run, store
from verilo_workers.ingest.registry import parse

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)

SLUGS = ["test-fake-news", "test-fake-down"]
# A little ahead of the database clock, so feeds just synced are due.
NOW = datetime.now(UTC).replace(microsecond=0) + timedelta(seconds=5)


def rss(*items: tuple[str, str]) -> bytes:
    stamp = NOW.strftime("%a, %d %b %Y %H:%M:%S GMT")
    body = "".join(
        f"<item><title>{t}</title><link>https://fake.example/{p}</link>"
        f"<description>Snippet for {t}.</description><pubDate>{stamp}</pubDate></item>"
        for p, t in items
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel>{body}</channel></rss>'.encode()


REGISTRY = {
    "source": [
        {
            "slug": "test-fake-news",
            "name": "Fake News Desk (test)",
            "homepage": "https://fake.example",
            "country": "GB",
            "kind": "newspaper",
            "tier": 2,
            "lean": "center",
            "basis": "Test source.",
            "feeds": [{"url": "https://fake.example/rss", "poll": 10}],
        },
        {
            "slug": "test-fake-down",
            "name": "Down Outlet (test)",
            "homepage": "https://down.example",
            "country": "US",
            "kind": "digital",
            "tier": 3,
            "lean": "lean_right",
            "basis": "Test source that fails.",
            "feeds": [{"url": "https://down.example/rss", "poll": 10}],
        },
    ]
}


@pytest.fixture
def conn():
    with store.connect() as c:
        cleanup(c)
        yield c
        cleanup(c)


def cleanup(c):
    with c.transaction():
        c.execute("delete from public.sources where slug = any(%s)", (SLUGS,))


class FakeWeb:
    def __init__(self):
        self.feed = rss(("one", "First story"), ("two", "Second story"))
        self.etag = '"v1"'
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.host == "down.example":
            return httpx.Response(503)
        if request.headers.get("if-none-match") == self.etag:
            return httpx.Response(304)
        return httpx.Response(200, content=self.feed, headers={"ETag": self.etag})


def ingest(web: FakeWeb, now: datetime, fetch_all: bool = False):
    return asyncio.run(
        run.ingest_due(fetch_all, transport=httpx.MockTransport(web), now=now, only=SLUGS)
    )


def feed_row(conn, slug):
    return conn.execute(
        """select f.* from public.source_feeds f join public.sources s on s.id = f.source_id
           where s.slug = %s""",
        (slug,),
    ).fetchone()


def test_ingest_stores_new_articles_once_and_backs_off_failing_feeds(conn):
    store.sync_sources(parse(REGISTRY), conn, scope=SLUGS)
    conn.commit()
    web = FakeWeb()

    first = ingest(web, NOW)
    assert first.new_articles == 2
    assert first.outcomes["new"] == 1 and first.outcomes["failed"] == 1

    rows = conn.execute(
        """select a.title, a.snippet, a.url from public.articles a
           join public.sources s on s.id = a.source_id where s.slug = 'test-fake-news'
           order by a.title"""
    ).fetchall()
    assert [r["title"] for r in rows] == ["First story", "Second story"]
    assert rows[0]["snippet"] == "Snippet for First story."

    # Not due yet: nothing is fetched.
    assert ingest(web, NOW + timedelta(minutes=1)).feeds == 0

    # Due again: the feed answers 304 (we sent its ETag), so nothing new and no duplicates.
    second = ingest(web, NOW + timedelta(minutes=11))
    assert second.outcomes["unchanged"] == 1 and second.new_articles == 0
    assert any(r.headers.get("if-none-match") == '"v1"' for r in web.requests)
    # The failing feed, 20 minutes after its first failure (10 x 2), isn't due yet.
    assert second.feeds == 1

    # The feed changes: only the new item is added.
    web.feed = rss(("one", "First story"), ("three", "Third story"))
    web.etag = '"v2"'
    third = ingest(web, NOW + timedelta(minutes=22))
    assert third.new_articles == 1

    # The failing feed waits longer after each failure: 20 minutes, then 40.
    down = feed_row(conn, "test-fake-down")
    assert down["consecutive_failures"] == 2
    assert down["last_error"] == "HTTP 503"
    assert down["next_fetch_at"] - (NOW + timedelta(minutes=22)) == timedelta(minutes=40)

    log = conn.execute(
        """select outcome from public.fetch_log l join public.source_feeds f on f.id = l.feed_id
           where f.url = 'https://fake.example/rss' order by l.fetched_at"""
    ).fetchall()
    assert [r["outcome"] for r in log] == ["new", "unchanged", "new"]


def test_sync_switches_off_feeds_that_left_the_registry(conn):
    store.sync_sources(parse(REGISTRY), conn, scope=SLUGS)
    smaller = {"source": [dict(REGISTRY["source"][0], feeds=[{"url": "https://fake.example/new"}])]}
    smaller["source"].append(REGISTRY["source"][1])
    counts = store.sync_sources(parse(smaller), conn, scope=SLUGS)
    conn.commit()
    old = conn.execute(
        "select active from public.source_feeds where url = 'https://fake.example/rss'"
    ).fetchone()
    assert old["active"] is False
    assert counts["feeds switched off"] >= 1


def test_the_database_refuses_full_text(conn):
    store.sync_sources(parse(REGISTRY), conn, scope=SLUGS)
    source_id = conn.execute(
        "select id from public.sources where slug = 'test-fake-news'"
    ).fetchone()["id"]
    columns = {
        r["column_name"]
        for r in conn.execute(
            """select column_name from information_schema.columns
               where table_schema = 'public' and table_name = 'articles'"""
        ).fetchall()
    }
    assert not columns & {"body", "content", "text", "full_text", "html"}
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute(
            """insert into public.articles (source_id, url, title, snippet, content_hash)
               values (%s, 'https://fake.example/long', 'Long', %s, %s)""",
            (source_id, "x" * 401, "0" * 64),
        )
    conn.rollback()


def test_readers_cannot_write_or_see_internal_tables(conn):
    store.sync_sources(parse(REGISTRY), conn, scope=SLUGS)
    conn.commit()
    with conn.transaction():
        conn.execute("set local role anon")
        assert (
            conn.execute(
                "select count(*) as n from public.sources where slug = 'test-fake-news'"
            ).fetchone()["n"]
            == 1
        )
        assert conn.execute("select count(*) as n from public.source_feeds").fetchone()["n"] == 0
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("set local role authenticated")
        conn.execute("update public.sources set tier = 1 where slug = 'test-fake-news'")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("set local role authenticated")
        conn.execute("update public.profiles set is_editor = true")
