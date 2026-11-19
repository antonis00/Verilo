"""Fetching one feed politely: robots.txt, conditional requests, a size limit."""

from dataclasses import dataclass
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from verilo_workers.common.http import MAX_BYTES

ROBOT_NAME = "VeriloBot"


@dataclass(frozen=True)
class FetchResult:
    status: int  # HTTP status, or 0 when no response came back
    body: bytes | None  # None when unchanged (304), refused or failed
    etag: str | None
    last_modified: str | None
    error: str | None = None

    @property
    def unchanged(self) -> bool:
        return self.status == 304

    @property
    def ok(self) -> bool:
        return self.body is not None


ALLOWED = "allowed"
DISALLOWED = "disallowed"  # the site's robots.txt says no
UNREACHABLE = "unreachable"  # robots.txt didn't answer: don't fetch this time, try again later


class Robots:
    """robots.txt per site, read once per run. Rules follow RFC 9309: a missing file (4xx)
    allows everything; a server error or no answer means "don't fetch for now"."""

    def __init__(self, client: httpx.AsyncClient):
        self._client = client
        self._cache: dict[str, RobotFileParser | str] = {}

    async def verdict(self, url: str) -> str:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._cache:
            self._cache[origin] = await self._load(origin)
        rules = self._cache[origin]
        if isinstance(rules, str):
            return rules
        return ALLOWED if rules.can_fetch(ROBOT_NAME, url) else DISALLOWED

    async def allowed(self, url: str) -> bool:
        return await self.verdict(url) == ALLOWED

    async def _load(self, origin: str) -> RobotFileParser | str:
        response = None
        for _attempt in range(2):
            try:
                response = await self._client.get(f"{origin}/robots.txt")
                break
            except httpx.HTTPError:
                continue
        if response is None or response.status_code >= 500:
            return UNREACHABLE
        if 400 <= response.status_code < 500:
            return ALLOWED
        parser = RobotFileParser()
        parser.parse(response.text[:500_000].splitlines())
        return parser


async def fetch(
    client: httpx.AsyncClient,
    url: str,
    etag: str | None = None,
    last_modified: str | None = None,
) -> FetchResult:
    headers = {}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    try:
        async with client.stream("GET", url, headers=headers) as response:
            if response.status_code == 304:
                return FetchResult(304, None, etag, last_modified)
            if response.status_code >= 400:
                return FetchResult(
                    response.status_code, None, etag, last_modified, f"HTTP {response.status_code}"
                )
            declared = int(response.headers.get("content-length") or 0)
            if declared > MAX_BYTES:
                return FetchResult(response.status_code, None, etag, last_modified, "too large")
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > MAX_BYTES:
                    return FetchResult(response.status_code, None, etag, last_modified, "too large")
                chunks.append(chunk)
            return FetchResult(
                response.status_code,
                b"".join(chunks),
                response.headers.get("etag"),
                response.headers.get("last-modified"),
            )
    except httpx.HTTPError as exc:
        return FetchResult(0, None, etag, last_modified, f"{type(exc).__name__}: {exc}"[:300])
