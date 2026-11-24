"""Retention against the local database, inside a transaction that is rolled back."""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from verilo_workers.config import DATABASE_URL
from verilo_workers.ingest.store import connect
from verilo_workers.retention import prune

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)


def test_old_embeddings_stories_and_logs_go_and_recent_ones_stay():
    with connect() as conn:
        now = datetime.now(UTC) + timedelta(days=400)  # everything existing is old by then
        counts_before = conn.execute(
            """select count(*) filter (where embedding is not null) as embedded,
                      count(*) as articles from public.articles"""
        ).fetchone()
        counts = prune(conn, now)
        after = conn.execute(
            """select count(*) filter (where embedding is not null) as embedded,
                      count(*) as articles from public.articles"""
        ).fetchone()
        assert after["embedded"] == 0
        assert counts["embeddings"] == counts_before["embedded"]
        assert after["articles"] == counts_before["articles"]  # articles themselves stay
        assert not conn.execute(
            """select 1 from public.stories where article_count <= 1 and merged_into is null
               and not exists (select 1 from public.corrections c where c.story_id = stories.id)
               and not exists (select 1 from public.stories f where f.follows = stories.id)
               limit 1"""
        ).fetchone()
        conn.rollback()
