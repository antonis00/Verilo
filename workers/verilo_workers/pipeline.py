"""One round of the whole pipeline: fetch due feeds, enrich new articles (and AI-tag a few the
embeddings left without a topic), group them into stories, summarise the stories that are due.
`pipeline --loop` runs a round every minute; each stage only touches what's new."""

import asyncio
import contextlib
import time
from datetime import UTC, datetime

import httpx

from verilo_workers.cluster.stories import cluster_pending, merge_close
from verilo_workers.common.http import ssl_context
from verilo_workers.config import (
    BRIEFING_EVERY,
    BRIEFING_SECRET,
    BRIEFING_URL,
    HEARTBEAT_URL,
    REVALIDATE_SECRET,
    REVALIDATE_URL,
)
from verilo_workers.enrich.llm_places import place_pending
from verilo_workers.enrich.llm_topics import tag_pending
from verilo_workers.enrich.run import enrich_pending
from verilo_workers.ingest import store
from verilo_workers.ingest.run import ingest_due
from verilo_workers.own.run import describe as describe_own
from verilo_workers.own.run import fetch_due as fetch_own_due
from verilo_workers.retention import prune
from verilo_workers.summarize.run import summarize_due

LOOP_SECONDS = 60


def notify_app() -> str:
    """Tell the web app its cached stories changed. Never fails the round."""
    if not REVALIDATE_SECRET:
        return "app not notified (no VERILO_REVALIDATE_SECRET)"
    try:
        response = httpx.post(
            REVALIDATE_URL,
            headers={"Authorization": f"Bearer {REVALIDATE_SECRET}"},
            json={"tags": ["stories"]},
            timeout=5,
            verify=ssl_context(),
        )
        return "app notified" if response.status_code == 200 else f"app said {response.status_code}"
    except httpx.HTTPError as exc:
        return f"app not reachable ({type(exc).__name__})"


def send_briefings() -> str:
    """Ask the app to send the daily briefings that are due. Never fails the round."""
    if not BRIEFING_SECRET:
        return "briefings off (no VERILO_BRIEFING_SECRET)"
    try:
        response = httpx.post(
            BRIEFING_URL,
            headers={"Authorization": f"Bearer {BRIEFING_SECRET}"},
            timeout=120,
            verify=ssl_context(),
        )
        if response.status_code != 200:
            return f"briefings: app said {response.status_code}"
        r = response.json()
        trial = r.get("trial") or {}
        return (
            f"briefings: {r['sent']} sent, {r['empty']} empty, {r['failed']} failed; "
            f"trial reminders: {trial.get('sent', 0)} sent"
        )
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        return f"briefings: app not reachable ({type(exc).__name__})"


# One round at a time, across processes and machines: a second `pipeline` (a manual run, an
# overlapping scheduler) would group the same articles twice.
ROUND_LOCK = 734_201
# The app's cache is told to refresh at most this often, unless a summary was published: told
# every minute, its cache did little and visitors waited on fresh reads.
NOTIFY_EVERY = 300
_last_notify = float("-inf")


def record_run(ok: bool, summary: str, error: str | None, seconds: float) -> None:
    """Keep a row per round (shown on the desk) and ping the heartbeat, if one is set: a service
    such as healthchecks.io that alerts when the pings stop (VERILO_HEARTBEAT_URL)."""
    try:
        with store.connect() as conn:
            conn.execute(
                """insert into public.pipeline_runs (ok, summary, error, duration_ms)
                   values (%s, %s, %s, %s)""",
                (ok, summary[:1000], error, int(seconds * 1000)),
            )
    except Exception as exc:
        print(f"couldn't record the round: {type(exc).__name__}", flush=True)
    if HEARTBEAT_URL:
        with contextlib.suppress(httpx.HTTPError):
            httpx.get(HEARTBEAT_URL + ("" if ok else "/fail"), timeout=5, verify=ssl_context())


def run_round(database_url: str | None = None) -> str:
    with store.connect(database_url) as lock:
        lock.autocommit = True
        if not lock.execute("select pg_try_advisory_lock(%s) as ok", (ROUND_LOCK,)).fetchone()[
            "ok"
        ]:
            return "skipped: another round is running"
        try:
            return _round(database_url)
        finally:
            lock.execute("select pg_advisory_unlock(%s)", (ROUND_LOCK,))


def _round(database_url: str | None) -> str:
    global _last_notify
    fetched = asyncio.run(ingest_due(database_url=database_url))
    try:  # readers' own sources never hold up the round
        own = describe_own(asyncio.run(fetch_own_due(database_url)))
    except Exception as exc:
        own = f"own sources failed ({type(exc).__name__})"
    # Each stage's work is committed when it ends: one connection serves the round, and its
    # `transaction()` blocks are only savepoints inside the connection's own transaction, so
    # without these commits a stage's writes (and row locks) would wait for the whole round.
    with store.connect(database_url) as conn:
        enriched = enrich_pending(conn)
        conn.commit()
        tagged = tag_pending(conn)
        placed = cluster_pending(conn)
        conn.commit()
        merged = merge_close(conn)
        conn.commit()
        located = place_pending(conn)
        summaries = summarize_due(conn)
    changed = placed["placed"] or merged or summaries["published"] or tagged["tagged"]
    due = summaries["published"] or time.monotonic() - _last_notify >= NOTIFY_EVERY
    if changed and due:
        _last_notify = time.monotonic()
        note = notify_app()
    else:
        note = "app not notified yet" if changed else "no changes"
    return (
        f"{fetched.describe()}; enriched {enriched}; "
        f"AI-tagged {tagged['tagged']} of {tagged['looked at']}; placed {placed['placed']} "
        f"({placed['new stories']} new stories); merged {merged}; "
        f"placed on the map {located['placed']} of {located['looked at']}; "
        f"summaries {summaries['published']} published, {summaries['failed']} failed; {own}; "
        f"{note}"
    )


def loop() -> None:
    print(f"Running the pipeline every {LOOP_SECONDS} s; Ctrl+C stops.", flush=True)
    last_briefing = float("-inf")
    last_prune = float("-inf")
    while True:
        started = time.monotonic()
        ok, summary, error = True, "", None
        try:
            summary = run_round()
            print(f"{datetime.now(UTC):%H:%M:%S}  {summary}", flush=True)
        except Exception as exc:  # keep going; the next round tries again
            ok, error = False, f"{type(exc).__name__}: {exc}"[:500]
            print(f"round failed: {error}", flush=True)
        record_run(ok, summary, error, time.monotonic() - started)
        if time.monotonic() - last_briefing >= BRIEFING_EVERY * 60:
            last_briefing = time.monotonic()
            print(f"{datetime.now(UTC):%H:%M:%S}  {send_briefings()}", flush=True)
        if time.monotonic() - last_prune >= 24 * 3600:
            last_prune = time.monotonic()
            try:
                with store.connect() as conn:
                    print(f"{datetime.now(UTC):%H:%M:%S}  pruned {prune(conn)}", flush=True)
            except Exception as exc:  # keep going; tomorrow tries again
                print(f"pruning failed: {type(exc).__name__}: {exc}", flush=True)
        time.sleep(max(1.0, LOOP_SECONDS - (time.monotonic() - started)))
