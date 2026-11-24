"""Who gets a trial reminder, decided in the database (migration 27). Each test runs in a
transaction that is rolled back. Skipped without the local database."""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from verilo_workers.config import DATABASE_URL

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)

NOW = datetime(2030, 3, 5, 12, tzinfo=UTC)


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as c:
        yield c
        c.rollback()


def reader(conn, ends_in: timedelta, subscribed: bool = False):
    user = conn.execute(
        """insert into auth.users (id, email, aud, role)
           values (gen_random_uuid(), 'trial-' || gen_random_uuid() || '@example.com',
                   'authenticated', 'authenticated') returning id"""
    ).fetchone()[0]
    conn.execute(
        "update public.profiles set trial_ends_at = %s, subscribed_until = %s where id = %s",
        (NOW + ends_in, NOW + timedelta(days=30) if subscribed else None, user),
    )
    return user


def due(conn, users, at=NOW):
    rows = conn.execute(
        "select user_id, kind from public.due_trial_reminders(%s, %s)", (at, users)
    ).fetchall()
    return dict(rows)


def test_reminders_come_4_days_and_1_day_before_the_end_and_never_to_subscribers(conn):
    four = reader(conn, timedelta(days=3, hours=12))
    one = reader(conn, timedelta(hours=10))
    early = reader(conn, timedelta(days=9))
    ended = reader(conn, timedelta(days=-1))
    paying = reader(conn, timedelta(days=3, hours=12), subscribed=True)
    assert due(conn, [four, one, early, ended, paying]) == {four: "4-days", one: "1-day"}


def test_each_reminder_is_sent_once(conn):
    user = reader(conn, timedelta(days=3, hours=12))
    claim = "select public.claim_trial_reminder(%s, %s)"
    assert conn.execute(claim, (user, "4-days")).fetchone()[0] is True
    assert conn.execute(claim, (user, "4-days")).fetchone()[0] is False
    assert due(conn, [user]) == {}
    # Three days later, the last-day reminder is still to come.
    assert due(conn, [user], NOW + timedelta(days=3)) == {user: "1-day"}
