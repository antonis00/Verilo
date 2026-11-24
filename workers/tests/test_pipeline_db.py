"""The pipeline runs one round at a time. Skipped without the local database."""

import psycopg
import pytest

from verilo_workers import pipeline
from verilo_workers.config import DATABASE_URL

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)


def test_a_round_is_skipped_while_another_holds_the_lock():
    with psycopg.connect(DATABASE_URL, autocommit=True) as other:
        other.execute("select pg_advisory_lock(%s)", (pipeline.ROUND_LOCK,))
        try:
            assert pipeline.run_round() == "skipped: another round is running"
        finally:
            other.execute("select pg_advisory_unlock(%s)", (pipeline.ROUND_LOCK,))
