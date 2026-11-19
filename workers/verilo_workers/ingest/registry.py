"""Loading and checking the source registry (`workers/data/sources.toml`)."""

import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[2] / "data" / "sources.toml"

TIERS = (1, 2, 3)
LEANS = ("left", "lean_left", "center", "lean_right", "right")
KINDS = ("wire", "public_broadcaster", "newspaper", "broadcaster", "digital", "magazine")
STATUSES = ("active", "paused", "excluded")

# Where each outlet is based (ISO country codes; INT for outlets with no single home) and the
# region readers choose in "Places". The one list both are checked against: the database's
# constraints and the web app's labels (apps/web/lib/regions.ts) must match it.
REGION_OF = {
    "US": "north-america", "CA": "north-america",
    "GB": "uk-ireland", "IE": "uk-ireland",
    "DE": "europe", "FR": "europe", "BE": "europe", "UA": "europe", "NL": "europe",
    "IT": "europe", "ES": "europe", "PL": "europe",
    "QA": "middle-east", "AE": "middle-east", "SA": "middle-east", "IL": "middle-east",
    "TR": "middle-east",
    "ZA": "africa", "KE": "africa", "NG": "africa", "GH": "africa",
    "IN": "south-asia", "PK": "south-asia", "BD": "south-asia", "LK": "south-asia",
    "JP": "east-asia", "KR": "east-asia", "HK": "east-asia", "TW": "east-asia",
    "SG": "southeast-asia", "PH": "southeast-asia", "MY": "southeast-asia",
    "ID": "southeast-asia", "TH": "southeast-asia",
    "AU": "oceania", "NZ": "oceania",
    "MX": "latin-america", "BR": "latin-america", "AR": "latin-america", "CO": "latin-america",
    "INT": "international",
}  # fmt: skip
COUNTRIES = tuple(REGION_OF)
REGIONS = tuple(dict.fromkeys(REGION_OF.values()))
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
    region: str = ""  # the region it counts for; from the country unless set in the registry
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
        region = raw.get("region") or REGION_OF[raw["country"]]
        _require(region in REGIONS, where, f"region must be one of {REGIONS}")
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
                region=region,
                feeds=tuple(feeds),
            )
        )
    return sources


def active(sources: list[Source]) -> list[Source]:
    return [s for s in sources if s.status == "active"]


def load(path: Path = REGISTRY) -> list[Source]:
    with path.open("rb") as fh:
        return parse(tomllib.load(fh))
