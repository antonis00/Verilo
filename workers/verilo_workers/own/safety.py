"""Only public internet addresses: readers type these addresses, and the server fetches them.

Without this, a reader could point Verilo at an address inside its own network (the database,
cloud metadata services) and read what comes back. Every request, including each redirect, is
checked: https only, the usual port, and every address the host name resolves to must be public.
(The connection resolves the name again; a host that changes its answer between the two, within
a second, could still slip through. Good enough here: the answer is never shown raw, only parsed
as a feed.)
"""

import ipaddress
import socket
from urllib.parse import urlsplit

import httpx


class UnsafeAddress(Exception):
    """The address isn't one Verilo will fetch for a reader."""


def _public_ip(ip: str) -> bool:
    address = ipaddress.ip_address(ip)
    return address.is_global and not address.is_multicast


def check_url(url: str, resolve=None) -> None:
    """Raises UnsafeAddress unless `url` is https on port 443 to a host with only public
    addresses."""
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise UnsafeAddress("only https addresses")
    if parts.port not in (None, 443):
        raise UnsafeAddress("only the standard port")
    host = parts.hostname
    if not host:
        raise UnsafeAddress("no host")
    try:
        ipaddress.ip_address(host)
        literal = True
    except ValueError:
        literal = False
    if literal:
        addresses = [host]
    else:
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise UnsafeAddress("not a public host")
        try:
            addresses = sorted({info[4][0] for info in (resolve or socket.getaddrinfo)(host, 443)})
        except OSError as exc:
            raise UnsafeAddress("host not found") from exc
    if not addresses or not all(_public_ip(a) for a in addresses):
        raise UnsafeAddress("not a public address")


async def _check_request(request: httpx.Request) -> None:
    check_url(str(request.url))


def hooks() -> dict:
    """httpx event hooks that check every request, redirects included."""
    return {"request": [_check_request]}
