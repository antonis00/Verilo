"""The grouping threshold, measured against hand-labelled pairs of real headlines.

tests/data/same_event_pairs.json holds 98 pairs from different outlets (19 Nov 2026), each judged
by hand: same news event or not. If a model or threshold change makes grouping worse, this fails.
Uses the real embedding model (downloaded once, about 67 MB).
"""

import json
from pathlib import Path

import numpy as np
import pytest

from verilo_workers.cluster.stories import JOIN_CENTRE

PAIRS = json.loads((Path(__file__).parent / "data" / "same_event_pairs.json").read_text("utf-8"))[
    "pairs"
]


@pytest.fixture(scope="module")
def similarities():
    try:
        from verilo_workers.enrich.embed import article_text, embed
    except ImportError:  # pragma: no cover
        pytest.skip("fastembed not installed")
    a = embed([article_text(p["a"]["title"], p["a"]["snippet"]) for p in PAIRS])
    b = embed([article_text(p["b"]["title"], p["b"]["snippet"]) for p in PAIRS])
    return np.sum(a * b, axis=1)


def test_pairs_above_the_threshold_are_the_same_event(similarities):
    labels = np.array([p["same_event"] for p in PAIRS])
    joined = similarities >= JOIN_CENTRE
    precision = labels[joined].mean()
    recall = joined[labels].mean()
    # Measured Nov 2026: precision 1.00 (56 of 56), recall 0.84. A false join (two events shown
    # as one story) costs more than a split, so precision is held higher.
    assert precision >= 0.95, f"precision {precision:.2f}"
    assert recall >= 0.80, f"recall {recall:.2f}"


def test_the_labelled_set_covers_both_answers():
    labels = [p["same_event"] for p in PAIRS]
    assert len(PAIRS) >= 90
    assert 0.4 < sum(labels) / len(labels) < 0.9
