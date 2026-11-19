"""Turning text into vectors that are close when the meaning is close.

The one place the embedding model is used, so it can be swapped (for example for Voyage) by
changing this file alone. The model runs locally through fastembed: free, and no text leaves the
machine. It's downloaded once (about 67 MB) into workers/.cache.
"""

import os
from functools import cache
from pathlib import Path

import numpy as np
import truststore

MODEL = "BAAI/bge-small-en-v1.5"
DIMENSIONS = 384
CACHE_DIR = Path(
    os.environ.get("VERILO_MODEL_CACHE", Path(__file__).resolve().parents[2] / ".cache")
)

# bge models expect this prefix on short "queries" compared against longer passages
# (topic descriptions against articles); articles themselves get no prefix.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@cache
def _model():
    # The model download goes through the OS certificate store too (see common/http.py).
    truststore.inject_into_ssl()
    from fastembed import TextEmbedding

    return TextEmbedding(MODEL, cache_dir=str(CACHE_DIR))


def embed(texts: list[str]) -> np.ndarray:
    """Unit-length vectors, one row per text, so a dot product is the cosine similarity."""
    if not texts:
        return np.zeros((0, DIMENSIONS), dtype=np.float32)
    vectors = np.array(list(_model().embed(texts, batch_size=64)), dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norms, 1e-12)


def article_text(title: str, snippet: str) -> str:
    return f"{title}. {snippet}" if snippet else title
