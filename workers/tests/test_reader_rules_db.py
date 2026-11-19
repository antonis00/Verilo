"""Rules the database enforces for readers, checked as a signed-in reader would act (the
`authenticated` role with their id in the request claims). Skipped without the local database."""

import json
from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from verilo_workers.config import DATABASE_URL

try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
except psycopg.OperationalError:
    pytest.skip("local database not running", allow_module_level=True)


@pytest.fixture
def reader():
    """A throwaway account, and a connection acting as that reader inside a transaction that is
    rolled back at the end."""
    with psycopg.connect(DATABASE_URL) as conn:
        user_id = conn.execute(
            """insert into auth.users (id, email, aud, role)
               values (gen_random_uuid(), 'rules-' || gen_random_uuid() || '@example.com',
                       'authenticated', 'authenticated') returning id"""
        ).fetchone()[0]
        conn.execute("set local role authenticated")
        conn.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": str(user_id), "role": "authenticated"}),),
        )
        yield conn, user_id
        conn.rollback()


def test_a_new_account_gets_a_fourteen_day_trial(reader):
    conn, user_id = reader
    ends = conn.execute(
        "select trial_ends_at from public.profiles where id = %s", (user_id,)
    ).fetchone()[0]
    assert timedelta(days=13, hours=23) < ends - datetime.now(UTC) <= timedelta(days=14)


@pytest.mark.parametrize("column", ["trial_ends_at", "subscribed_until", "is_editor"])
def test_readers_cannot_change_their_trial_subscription_or_editor_flag(reader, column):
    conn, user_id = reader
    value = "true" if column == "is_editor" else "now() + interval '10 years'"
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute(f"update public.profiles set {column} = {value} where id = %s", (user_id,))


def test_readers_can_still_change_their_own_name(reader):
    conn, user_id = reader
    conn.execute("update public.profiles set display_name = 'Ana' where id = %s", (user_id,))
