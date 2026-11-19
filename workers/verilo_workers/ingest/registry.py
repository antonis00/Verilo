"""Loading and checking the source registry (`workers/data/sources.toml`)."""

import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[2] / "data" / "sources.toml"

TIERS = (1, 2, 3)
LEANS = ("left", "lean_left", "center", "lean_right", "right")
KINDS = ("wire", "public_broadcaster", "newspaper", "broadcaster", "digital", "magazine")
COUNTRIES = ("US", "GB", "CA", "AU", "IE", "IN", "INT")
STATUSES = ("active", "paused", "excluded")
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class RegistryError(ValueError):
    pass


@dataclass(frozen=True)
class Feed:
    url: str
    section: str
    poll_minutes: int


@dataclass(frozen=True)
class Source:
    slug: str
    name: str
    homepage: str
    country: str
    kind: str
    tier: int
    lean: str
    basis: str
    status: str = "active"
    reviewed: str | None = None  # ISO date the owner checked tier and lean
    note: str | None = None  # anything the owner should know (why paused, feed problems)
    feeds: tuple[Feed, ...] = field(default_factory=tuple)


def _require(cond: bool, where: str, message: str) -> None:
    if not cond:
        raise RegistryError(f"{where}: {message}")


def parse(data: dict) -> list[Source]:
    sources: list[Source] = []
    seen_slugs: set[str] = set()
    seen_urls: set[str] = set()
    for i, raw in enumerate(data.get("source", [])):
        where = f"source #{i + 1} ({raw.get('slug', '?')})"
        slug = raw.get("slug", "")
        _require(bool(SLUG.match(slug)), where, "slug must be lowercase words joined by '-'")
        _require(slug not in seen_slugs, where, "slug is used twice")
        seen_slugs.add(slug)
        for key in ("name", "homepage", "basis"):
            _require(bool(str(raw.get(key, "")).strip()), where, f"{key} is required")
        _require(raw["homepage"].startswith("https://"), where, "homepage must be https://")
        _require(raw.get("country") in COUNTRIES, where, f"country must be one of {COUNTRIES}")
        _require(raw.get("kind") in KINDS, where, f"kind must be one of {KINDS}")
        _require(raw.get("tier") in TIERS, where, f"tier must be one of {TIERS}")
        _require(raw.get("lean") in LEANS, where, f"lean must be one of {LEANS}")
        status = raw.get("status", "active")
        _require(status in STATUSES, where, f"status must be one of {STATUSES}")
        reviewed = raw.get("reviewed")
        if reviewed is not None:
            reviewed = str(reviewed)
            _require(
                bool(re.match(r"^\d{4}-\d{2}-\d{2}$", reviewed)), where, "reviewed: YYYY-MM-DD"
            )

        feeds = []
        for j, f in enumerate(raw.get("feeds", [])):
            fwhere = f"{where} feed #{j + 1}"
            url = f.get("url", "")
            _require(url.startswith(("https://", "http://")), fwhere, "url must be http(s)")
            _require(url not in seen_urls, fwhere, "feed url is listed twice")
            seen_urls.add(url)
            poll = int(f.get("poll", 60))
            _require(5 <= poll <= 1440, fwhere, "poll must be 5-1440 minutes")
            section = str(f.get("section", "top")).strip() or "top"
            feeds.append(Feed(url=url, section=section, poll_minutes=poll))
        _require(bool(feeds) or status != "active", where, "an active source needs a feed")

        sources.append(
            Source(
                slug=slug,
                name=raw["name"].strip(),
                homepage=raw["homepage"],
                country=raw["country"],
                kind=raw["kind"],
                tier=raw["tier"],
                lean=raw["lean"],
                basis=raw["basis"].strip(),
                status=status,
                reviewed=reviewed,
                note=(str(raw["note"]).strip() or None) if raw.get("note") else None,
                feeds=tuple(feeds),
            )
        )
    return sources


def active(sources: list[Source]) -> list[Source]:
    return [s for s in sources if s.status == "active"]


def load(path: Path = REGISTRY) -> list[Source]:
    with path.open("rb") as fh:
        return parse(tomllib.load(fh))
