"""Fetching readers' own sources against the local database, with httpx's MockTransport for the
internet. Each test runs in a transaction that is rolled back."""

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import psycopg
import pytest
from psycopg.rows import dict_row

from verilo_workers.config import DATABASE_URL
from verilo_workers.own import safety
from verilo_workers.own.run import FAILING_AFTER, fetch_due, prune

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)

NOW = datetime.now(UTC).replace(microsecond=0)

FEED = f"""<?xml version="1.0"?><rss version="2.0"><channel>
<title>Harbour Gazette</title><link>https://harbour.example/</link>
<item><title>Port reopens after the storm</title><link>https://harbour.example/a/1</link>
<description>Ships return to the harbour.</description>
<pubDate>{(NOW - timedelta(hours=2)).strftime("%a, %d %b %Y %H:%M:%S +0000")}</pubDate></item>
<item><title>Last month's festival</title><link>https://harbour.example/a/0</link>
<pubDate>{(NOW - timedelta(days=40)).strftime("%a, %d %b %Y %H:%M:%S +0000")}</pubDate></item>
</channel></rss>""".encode()

CHANNEL = f"""<html><head><meta property="og:title" content="Harbour Live"></head><body>
<div class="tgme_widget_message js-widget_message" data-post="harbourlive/7">
<div class="tgme_widget_message_text js-message_text">Ferry timetable changes<br>From Monday.</div>
<time datetime="{(NOW - timedelta(hours=1)).isoformat()}" class="time">x</time></div>
</body></html>""".encode()


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """Every test host resolves to a public address, except `inside.example`."""

    def resolve(host, port):
        ip = "10.0.0.7" if host == "inside.example" else "93.184.215.14"
        return [(2, 1, 6, "", (ip, port))]

    monkeypatch.setattr(safety.socket, "getaddrinfo", resolve)


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as c:
        yield c
        c.rollback()


def reader(conn):
    return conn.execute(
        """insert into auth.users (id, email, aud, role)
           values (gen_random_uuid(), 'own-' || gen_random_uuid() || '@example.com',
                   'authenticated', 'authenticated') returning id"""
    ).fetchone()["id"]


def add(conn, url, kind="feed", user=None, **fields):
    sid = conn.execute(
        "insert into public.own_sources (kind, url, next_fetch_at) values (%s, %s, %s) "
        "returning id",
        (kind, url, NOW - timedelta(minutes=1)),
    ).fetchone()["id"]
    for k, v in fields.items():
        conn.execute(f"update public.own_sources set {k} = %s where id = %s", (v, sid))
    conn.execute(
        "insert into public.reader_own_sources (user_id, source_id) values (%s, %s)",
        (user or reader(conn), sid),
    )
    return sid


def run(conn, ids, handler):
    seen = []

    def record(request):
        seen.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return handler(request)

    counts = asyncio.run(
        fetch_due(conn=conn, only=ids, now=NOW, transport=httpx.MockTransport(record))
    )
    return counts, seen


def source(conn, sid):
    return conn.execute("select * from public.own_sources where id = %s", (sid,)).fetchone()


def items(conn, sid):
    return conn.execute(
        "select url, title, snippet from public.own_items where source_id = %s order by url",
        (sid,),
    ).fetchall()


def test_a_feed_is_fetched_named_and_its_recent_items_kept(conn):
    sid = add(conn, "https://harbour.example/feed.xml")
    counts, _ = run(conn, [sid], lambda r: httpx.Response(200, content=FEED))
    assert counts == {"fetched": 1, "failed": 0, "new items": 1}
    s = source(conn, sid)
    assert (s["status"], s["title"], s["site_url"]) == (
        "ok",
        "Harbour Gazette",
        "https://harbour.example/",
    )
    assert s["official_source_id"] is None
    assert items(conn, sid) == [
        {
            "url": "https://harbour.example/a/1",
            "title": "Port reopens after the storm",
            "snippet": "Ships return to the harbour.",
        }
    ]  # the 40-day-old item isn't kept
    again, _ = run(conn, [sid], lambda r: httpx.Response(200, content=FEED))
    assert again["fetched"] == 0  # not due again for half an hour


def test_a_telegram_channel_becomes_items(conn):
    sid = add(conn, "https://t.me/s/harbourlive", kind="telegram")
    run(conn, [sid], lambda r: httpx.Response(200, content=CHANNEL))
    s = source(conn, sid)
    assert (s["status"], s["title"], s["site_url"]) == (
        "ok",
        "Harbour Live",
        "https://t.me/harbourlive",
    )
    assert items(conn, sid) == [
        {
            "url": "https://t.me/harbourlive/7",
            "title": "Ferry timetable changes",
            "snippet": "From Monday.",
        }
    ]


def test_a_feed_on_a_rated_outlets_website_is_marked_official(conn):
    outlet = conn.execute(
        "select source_id as id, url from public.source_feeds where active limit 1"
    ).fetchone()
    if outlet is None:
        pytest.skip("no outlets in the local database")
    host = outlet["url"].split("/")[2]
    sid = add(conn, f"https://{host}/some-other-section.rss")
    run(conn, [sid], lambda r: httpx.Response(200, content=FEED))
    assert source(conn, sid)["official_source_id"] == outlet["id"]


def test_a_websites_address_finds_its_feed_and_joins_one_already_added(conn):
    first_reader, second_reader = reader(conn), reader(conn)
    feed = add(conn, "https://harbour.example/rss", user=first_reader, status="ok")
    site = add(conn, "https://harbour.example/", user=second_reader)
    page = b'<html><link rel="alternate" type="application/rss+xml" href="/rss"></html>'

    def handler(request):
        return httpx.Response(200, content=FEED if request.url.path == "/rss" else page)

    run(conn, [site], handler)
    assert source(conn, site) is None  # merged into the feed someone already added
    followers = conn.execute(
        "select user_id from public.reader_own_sources where source_id = %s", (feed,)
    ).fetchall()
    assert {r["user_id"] for r in followers} == {first_reader, second_reader}


def test_an_address_inside_the_network_is_never_fetched(conn):
    direct = add(conn, "https://inside.example/feed")
    redirected = add(conn, "https://harbour.example/moved")

    def handler(request):
        if request.url.host == "harbour.example":
            return httpx.Response(302, headers={"location": "https://inside.example/secret"})
        return httpx.Response(200, content=FEED)

    counts, seen = run(conn, [direct, redirected], handler)
    assert counts["failed"] == 2
    assert not any("inside.example" in u for u in seen)
    assert source(conn, direct)["last_error"].startswith("refused")
    assert source(conn, redirected)["last_error"].startswith("refused")


def test_failures_back_off_and_then_show_as_failing(conn):
    sid = add(conn, "https://harbour.example/gone")
    for attempt in range(FAILING_AFTER):
        conn.execute("update public.own_sources set next_fetch_at = %s where id = %s", (NOW, sid))
        run(conn, [sid], lambda r: httpx.Response(404))
        s = source(conn, sid)
        assert s["consecutive_failures"] == attempt + 1
        assert s["next_fetch_at"] > NOW + timedelta(minutes=30)
    assert s["status"] == "failing"
    assert s["last_error"] == "HTTP 404"


def test_blocked_and_unfollowed_sources_arent_fetched(conn):
    blocked = add(conn, "https://harbour.example/blocked", status="blocked")
    lonely = conn.execute(
        "insert into public.own_sources (kind, url) values ('feed', 'https://harbour.example/x') "
        "returning id"
    ).fetchone()["id"]
    counts, seen = run(conn, [blocked, lonely], lambda r: httpx.Response(200, content=FEED))
    assert counts["fetched"] == 0 and seen == []


def test_pruning_drops_old_items_and_sources_nobody_follows(conn):
    sid = add(conn, "https://harbour.example/feed.xml")
    run(conn, [sid], lambda r: httpx.Response(200, content=FEED))
    lonely = conn.execute(
        "insert into public.own_sources (kind, url, created_at) "
        "values ('feed', 'https://harbour.example/x', %s) returning id",
        (NOW - timedelta(days=2),),
    ).fetchone()["id"]
    counts = prune(conn, NOW + timedelta(days=15))
    assert counts["own items"] >= 1 and items(conn, sid) == []
    assert source(conn, lonely) is None
    assert source(conn, sid) is not None  # still followed
