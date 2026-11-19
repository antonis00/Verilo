import pytest

from verilo_workers.ingest import registry
from verilo_workers.ingest.registry import RegistryError, parse


def good(**overrides):
    source = {
        "slug": "example-news",
        "name": "Example News",
        "homepage": "https://example.com",
        "country": "GB",
        "kind": "newspaper",
        "tier": 2,
        "lean": "center",
        "basis": "Test outlet.",
        "feeds": [{"url": "https://example.com/rss", "section": "top", "poll": 15}],
    }
    source.update(overrides)
    return {"source": [source]}


def test_the_real_registry_is_valid():
    sources = registry.load()
    assert len(sources) >= 30
    active = registry.active(sources)
    assert all(s.feeds for s in active)
    # The fact base exists: public broadcasters at tier 1.
    assert any(s.tier == 1 and s.kind == "public_broadcaster" for s in active)
    # Summaries need different leans among reputable outlets.
    assert len({s.lean for s in active if s.tier <= 2}) >= 3
    # Every source says why it has its tier and lean.
    assert all(len(s.basis) > 20 for s in sources)
    # Every paused source says why.
    assert all(s.note for s in sources if s.status == "paused")


def test_a_good_entry_parses():
    [s] = parse(good())
    assert s.slug == "example-news"
    assert s.feeds[0].poll_minutes == 15
    assert s.status == "active"
    assert s.reviewed is None


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"slug": "Example News"}, "slug"),
        ({"tier": 4}, "tier"),
        ({"lean": "far_left"}, "lean"),
        ({"country": "ZZ"}, "country"),
        ({"kind": "blog"}, "kind"),
        ({"homepage": "http://example.com"}, "https"),
        ({"basis": " "}, "basis"),
        ({"feeds": []}, "needs a feed"),
        ({"feeds": [{"url": "ftp://example.com/rss"}]}, "http"),
        ({"feeds": [{"url": "https://example.com/rss", "poll": 1}]}, "poll"),
        ({"reviewed": "19/11/2026"}, "reviewed"),
    ],
)
def test_bad_entries_are_refused(overrides, message):
    with pytest.raises(RegistryError, match=message):
        parse(good(**overrides))


def test_a_paused_source_needs_no_feed():
    [s] = parse(good(status="paused", note="No feed.", feeds=[]))
    assert s.status == "paused"


def test_duplicates_are_refused():
    data = good()
    data["source"].append(dict(data["source"][0]))
    with pytest.raises(RegistryError, match="slug is used twice"):
        parse(data)


def test_every_source_has_a_known_region_and_overrides_work():
    from verilo_workers.ingest.registry import REGION_OF, REGIONS

    sources = registry.load()
    assert all(s.region in REGIONS for s in sources)
    by_slug = {s.slug: s for s in sources}
    # Based in Washington, counted for the region it covers.
    assert by_slug["al-monitor"].country == "US"
    assert by_slug["al-monitor"].region == "middle-east"
    assert by_slug["bbc-news"].region == REGION_OF["GB"] == "uk-ireland"
    # Every region readers can choose has reputable outlets behind it.
    active = registry.active(sources)
    for region in set(REGIONS) - {"international"}:
        assert any(s.region == region and s.tier <= 2 for s in active), region


def test_a_bad_region_is_refused():
    with pytest.raises(RegistryError, match="region"):
        parse(good(region="atlantis"))
