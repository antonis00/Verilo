import asyncio

import httpx

from verilo_workers.common import http
from verilo_workers.ingest.fetch import ALLOWED, DISALLOWED, UNREACHABLE, Robots, fetch


def run(coro):
    return asyncio.run(coro)


def client_for(handler):
    return http.client(httpx.MockTransport(handler))


def robots_verdict(robots_response: httpx.Response | Exception, url: str) -> str:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            if isinstance(robots_response, Exception):
                raise robots_response
            return robots_response
        return httpx.Response(200, text="<rss/>")

    async def go():
        async with client_for(handler) as client:
            return await Robots(client).verdict(url)

    return run(go())


def test_robots_rules_are_followed():
    rules = "User-agent: *\nDisallow: /private/\n\nUser-agent: VeriloBot\nDisallow: /no-verilo/\n"
    ok = httpx.Response(200, text=rules)
    assert robots_verdict(ok, "https://example.com/rss.xml") == ALLOWED
    assert robots_verdict(ok, "https://example.com/no-verilo/rss.xml") == DISALLOWED


def test_a_site_that_disallows_everyone_is_not_fetched():
    everyone = httpx.Response(200, text="User-agent: *\nDisallow: /\n")
    assert robots_verdict(everyone, "https://example.com/feed") == DISALLOWED


def test_missing_robots_allows_and_errors_mean_not_now():
    assert robots_verdict(httpx.Response(404), "https://example.com/feed") == ALLOWED
    assert robots_verdict(httpx.Response(503), "https://example.com/feed") == UNREACHABLE
    assert robots_verdict(httpx.ConnectTimeout("slow"), "https://example.com/feed") == UNREACHABLE


def test_requests_identify_verilo_and_are_conditional():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.headers)
        return httpx.Response(304)

    async def go():
        async with client_for(handler) as client:
            return await fetch(client, "https://example.com/rss", '"abc"', "Wed, 19 Nov 2026")

    result = run(go())
    assert result.unchanged and not result.ok
    assert seen["user-agent"].startswith("VeriloBot/")
    assert seen["if-none-match"] == '"abc"'
    assert seen["if-modified-since"] == "Wed, 19 Nov 2026"


def test_a_good_response_keeps_its_validators():
    def handler(request):
        return httpx.Response(
            200, content=b"<rss/>", headers={"ETag": '"v2"', "Last-Modified": "x"}
        )

    async def go():
        async with client_for(handler) as client:
            return await fetch(client, "https://example.com/rss")

    result = run(go())
    assert result.ok and result.body == b"<rss/>"
    assert (result.etag, result.last_modified) == ('"v2"', "x")


def test_errors_and_oversized_feeds_are_reported_not_raised():
    def handler(request):
        if request.url.path == "/gone":
            return httpx.Response(410)
        if request.url.path == "/huge":
            return httpx.Response(200, content=b"x" * (http.MAX_BYTES + 1))
        raise httpx.ConnectError("refused")

    async def go():
        async with client_for(handler) as client:
            return [
                await fetch(client, f"https://example.com/{p}") for p in ("gone", "huge", "down")
            ]

    gone, huge, down = run(go())
    assert (gone.status, gone.error) == (410, "HTTP 410")
    assert huge.error == "too large" and huge.body is None
    assert down.status == 0 and "ConnectError" in down.error
