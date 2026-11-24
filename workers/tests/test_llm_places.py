"""Where stories happen: reading the model's reply offline, and tagging against the local
database with a fake model (skipped when the database isn't running)."""

from datetime import UTC, datetime, timedelta

import numpy as np
import psycopg
import pytest

from verilo_workers.ai import Completion
from verilo_workers.config import DATABASE_URL
from verilo_workers.enrich import llm_places


def test_the_reply_keeps_known_regions_at_most_two_and_global_alone():
    data = {
        "stories": [
            {"n": 1, "places": ["middle-east", "europe", "africa"]},
            {"n": "2", "places": ["atlantis", " east-asia "]},
            {"n": 3, "places": ["global", "europe"]},
            {"n": 4, "places": ["europe", "global"]},
            {"n": 9, "places": ["europe"]},
            "nonsense",
        ]
    }
    assert llm_places.read_reply(data, 4) == {
        1: ["middle-east", "europe"],
        2: ["east-asia"],
        3: ["global"],
        4: ["europe"],
    }
    assert llm_places.read_reply(None, 2) == {}


def test_the_prompt_names_every_region_readers_can_choose():
    from verilo_workers.ingest.registry import REGIONS

    prompt = llm_places.system_prompt()
    for region in REGIONS:
        if region != "international":
            assert f"- {region}: " in prompt
    assert f"- {llm_places.GLOBAL}: " in prompt


try:
    psycopg.connect(DATABASE_URL, connect_timeout=2).close()
    DB = True
except psycopg.OperationalError:
    DB = False


@pytest.mark.skipif(not DB, reason="local database not running")
def test_stories_two_outlets_cover_get_their_places_and_are_tagged_again_when_doubled():
    from verilo_workers.ingest import store

    now = datetime.now(UTC)
    with store.connect() as conn:
        sid = conn.execute(
            """insert into public.stories (title, first_published_at, last_published_at, centroid,
                 article_count, outlet_count) values ('Quake hits Peru', %s, %s, %s, 4, 2)
               returning id""",
            (now - timedelta(hours=2), now, str(np.zeros(384).tolist())),
        ).fetchone()["id"]
        conn.commit()
        try:
            asked = []

            def fake(role, system, user, **_):
                asked.append(user)
                return Completion(
                    "", {"stories": [{"n": 1, "places": ["latin-america"]}]}, "f", "m"
                )

            assert llm_places.place_pending(conn, now, story_ids=[sid], complete_fn=fake) == {
                "looked at": 1,
                "placed": 1,
            }
            assert "Quake hits Peru" in asked[0]
            row = conn.execute(
                "select places, places_articles from public.stories where id = %s", (sid,)
            ).fetchone()
            assert (row["places"], row["places_articles"]) == (["latin-america"], 4)
            # Not asked again until the story has doubled.
            assert (
                llm_places.place_pending(conn, now, story_ids=[sid], complete_fn=fake)["looked at"]
                == 0
            )
            conn.execute("update public.stories set article_count = 8 where id = %s", (sid,))
            conn.commit()
            assert (
                llm_places.place_pending(conn, now, story_ids=[sid], complete_fn=fake)["looked at"]
                == 1
            )
        finally:
            conn.execute("delete from public.stories where id = %s", (sid,))
            conn.commit()
