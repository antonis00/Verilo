"""The one HTTP client the workers use.

TLS is checked against the operating system's certificate store (truststore), not only certifi's
list: antivirus and company proxies that inspect HTTPS re-sign it with their own root, which the
OS trusts and certifi doesn't.
"""

import ssl

import httpx
import truststore

from verilo_workers.config import USER_AGENT

TIMEOUT = httpx.Timeout(20.0, connect=10.0)
MAX_BYTES = 5_000_000  # a feed larger than this is refused


def ssl_context() -> ssl.SSLContext:
    return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


def client(
    transport: httpx.AsyncBaseTransport | None = None, event_hooks: dict | None = None
) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
        },
        timeout=TIMEOUT,
        follow_redirects=True,
        verify=ssl_context(),
        transport=transport,
        event_hooks=event_hooks,
    )
