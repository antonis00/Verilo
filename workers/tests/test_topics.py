from unittest import mock

import numpy as np
import pytest

from verilo_workers.enrich import topics
from verilo_workers.enrich.topics import MATCH_FLOOR, Topic, assign

TOPICS = [
    Topic("business", "Business", "companies", ("business",)),
    Topic("economy", "Economy", "inflation"),
    Topic("sport", "Sport", "football", ("sport",)),
]


def with_scores(rows: list[list[float]], sections: list[str | None]):
    """Run `assign` with the article-topic similarity matrix set directly."""
    vectors = np.eye(len(rows), dtype=np.float32)
    descriptions = np.array(rows, dtype=np.float32).T  # vectors @ descriptions.T == rows
    with mock.patch.object(topics, "_descriptions", return_value=descriptions):
        return assign(vectors, sections, TOPICS)


def test_a_precise_feed_section_counts_outright():
    [found] = with_scores([[0.1, 0.1, 0.1]], ["sport"])
    assert found == [("sport", 1.0, "section")]


def test_below_the_floor_nothing_is_guessed():
    [found] = with_scores([[MATCH_FLOOR - 0.01, 0.3, 0.2]], [None])
    assert found == []


def test_a_confident_match_is_kept_and_a_close_second_too():
    [found] = with_scores([[0.62, 0.61, 0.40]], [None])
    assert [slug for slug, _, _ in found] == ["business", "economy"]
    assert all(method == "embedding" for _, _, method in found)


def test_a_distant_second_is_dropped():
    [found] = with_scores([[0.66, 0.58, 0.40]], [None])
    assert [slug for slug, _, _ in found] == ["business"]


def test_at_most_two_topics_section_first():
    [found] = with_scores([[0.70, 0.69, 0.10]], ["sport"])
    assert [slug for slug, _, _ in found] == ["sport", "business"]


def test_the_real_topic_list_loads():
    loaded = topics.load()
    slugs = {t.slug for t in loaded}
    assert {"geopolitics", "architecture-and-cities", "artificial-intelligence"} <= slugs
    assert all(len(t.description) > 40 for t in loaded)
    # Broad sections are relative to the outlet, so they never map to a topic.
    assert not {"world", "politics", "top"} & {s for t in loaded for s in t.sections}


PARENTED = [
    Topic("sport", "Sport", "sport", ("sport",), featured=True),
    Topic("football", "Football", "football", parent="sport"),
    Topic("economy", "Economy", "economy", featured=True),
]


def with_parents(rows, sections):
    vectors = np.eye(len(rows), dtype=np.float32)
    descriptions = np.array(rows, dtype=np.float32).T
    with mock.patch.object(topics, "_descriptions", return_value=descriptions):
        return assign(vectors, sections, PARENTED)


def test_a_narrow_topic_brings_its_parent():
    [found] = with_parents([[0.40, 0.70, 0.30]], [None])
    assert found == [("football", 0.7, "embedding"), ("sport", 0.7, "parent")]


def test_a_narrow_topic_needs_the_higher_floor():
    from verilo_workers.enrich.topics import NARROW_FLOOR

    [found] = with_parents([[0.30, NARROW_FLOOR - 0.01, 0.30]], [None])
    assert found == []


def test_the_parent_is_not_repeated_when_already_matched():
    [found] = with_parents([[0.70, 0.69, 0.10]], [None])
    assert [slug for slug, _, _ in found] == ["sport", "football"]


def test_the_catalog_is_consistent():
    loaded = topics.load()
    slugs = {t.slug for t in loaded}
    featured = [t for t in loaded if t.featured]
    assert 8 <= len(featured) <= 16
    assert len(loaded) >= 60
    # The original 18 topics keep their slugs, so readers' choices and links still work.
    assert {
        "world", "geopolitics", "war-and-security", "politics", "economy", "business",
        "technology", "artificial-intelligence", "science", "climate-and-environment", "health",
        "architecture-and-cities", "culture", "sport", "law-and-justice", "education",
        "migration", "energy",
    } <= slugs  # fmt: skip
    assert all(t.parent in slugs for t in loaded if t.parent)
    assert all(t.aliases == tuple(a.lower() for a in t.aliases) for t in loaded)


def test_a_parent_must_exist(tmp_path):
    bad = tmp_path / "topics.toml"
    bad.write_text(
        '[[topic]]\nslug = "a"\nname = "A"\ndescription = "x"\nparent = "missing"\n',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="parent"):
        topics.load(bad)
