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
        # The running pipeline may add stories meanwhile: only those that existed are checked.
        last_id = conn.execute("select coalesce(max(id), 0) as m from public.stories").fetchone()[
            "m"
        ]
        counts = prune(conn, now)
        after = conn.execute(
            """select count(*) filter (where embedding is not null) as embedded,
                      count(*) as articles from public.articles"""
        ).fetchone()
        assert after["embedded"] == 0
        assert counts["embeddings"] == counts_before["embedded"]
        assert after["articles"] == counts_before["articles"]  # articles themselves stay
        assert not conn.execute(
            """select 1 from public.stories where id <= %s and article_count <= 1
               and merged_into is null
               and not exists (select 1 from public.corrections c where c.story_id = stories.id)
               and not exists (select 1 from public.stories f where f.follows = stories.id)
               and not exists (select 1 from public.saved_stories v where v.story_id = stories.id)
               limit 1""",
            (last_id,),
        ).fetchone()
        conn.rollback()
