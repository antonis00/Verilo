"""Who gets the daily briefing, decided in the database (due_briefings, claim_briefing in
migration 16). Every test runs in a transaction that is rolled back. Skipped without the local
database."""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from verilo_workers.config import DATABASE_URL

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)

# 04:30 UTC is 07:30 in Doha (UTC+3, no daylight saving).
MORNING = datetime(2030, 3, 5, 4, 30, tzinfo=UTC)


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as c:
        yield c
        c.rollback()


def reader(conn, *, settings=True, enabled=True, onboarded=True, zone="Asia/Qatar", hour=7):
    user = conn.execute(
        """insert into auth.users (id, email, aud, role)
           values (gen_random_uuid(), 'due-' || gen_random_uuid() || '@example.com',
                   'authenticated', 'authenticated') returning id"""
    ).fetchone()[0]
    conn.execute(
        "insert into public.reader_preferences (user_id, onboarded_at) values (%s, %s)",
        (user, MORNING - timedelta(days=3) if onboarded else None),
    )
    if settings:
        conn.execute(
            """insert into public.digest_settings (user_id, enabled, send_hour, time_zone)
               values (%s, %s, %s, %s)""",
            (user, enabled, hour, zone),
        )
    return user


def due(conn, users, at=MORNING, limit=200):
    rows = conn.execute(
        "select user_id, local_date from public.due_briefings(%s, %s, %s)", (at, users, limit)
    ).fetchall()
    return {r[0]: r[1] for r in rows}


def claim(conn, user, day="2030-03-05"):
    return conn.execute("select public.claim_briefing(%s, %s)", (user, day)).fetchone()[0]


def test_only_opted_in_onboarded_readers_are_due_in_their_morning(conn):
    yes = reader(conn)
    no_row = reader(conn, settings=False)
    off = reader(conn, enabled=False)
    not_set_up = reader(conn, onboarded=False)
    users = [yes, no_row, off, not_set_up]
    assert due(conn, users) == {yes: datetime(2030, 3, 5).date()}
    assert due(conn, users, MORNING - timedelta(minutes=31)) == {}  # 06:59 in Doha
    assert yes in due(conn, users, MORNING + timedelta(hours=2, minutes=29))  # 09:59
    assert due(conn, users, MORNING + timedelta(hours=2, minutes=30)) == {}  # 10:00: skipped


def test_an_unknown_time_zone_is_skipped_rather_than_failing_the_run(conn):
    good = reader(conn)
    bad = reader(conn, zone="Nowhere/Land")
    assert set(due(conn, [good, bad])) == {good}


def test_a_briefing_is_claimed_once_and_retried_only_when_it_failed_or_got_stuck(conn):
    user = reader(conn)
    first = claim(conn, user)
    assert first is not None
    assert claim(conn, user) is None  # being sent: not claimed again
    assert due(conn, [user]) == {}

    conn.execute("update public.digests set status = 'sent' where id = %s", (first,))
    assert claim(conn, user) is None
    assert due(conn, [user]) == {}

    # A failure is tried again, up to three attempts in all.
    conn.execute("update public.digests set status = 'failed' where id = %s", (first,))
    assert user in due(conn, [user])
    for attempt in (2, 3):
        assert claim(conn, user) == first
        assert (
            conn.execute("select attempts from public.digests where id = %s", (first,)).fetchone()[
                0
            ]
            == attempt
        )
        conn.execute("update public.digests set status = 'failed' where id = %s", (first,))
    assert claim(conn, user) is None
    assert due(conn, [user]) == {}


def test_a_send_cut_off_half_way_is_picked_up_after_fifteen_minutes(conn):
    user = reader(conn)
    first = claim(conn, user)
    conn.execute(
        "update public.digests set created_at = now() - interval '16 minutes' where id = %s",
        (first,),
    )
    assert claim(conn, user) == first


def test_readers_come_a_page_at_a_time(conn):
    users = [reader(conn) for _ in range(5)]
    assert len(due(conn, users, limit=2)) == 2
    assert len(due(conn, users)) == 5


def test_readers_cannot_call_the_briefing_functions(conn):
    conn.execute("set local role authenticated")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("select * from public.due_briefings(now())")
