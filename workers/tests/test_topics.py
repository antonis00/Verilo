from unittest import mock

import numpy as np

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
