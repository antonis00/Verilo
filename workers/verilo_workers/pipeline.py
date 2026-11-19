"""One round of the whole pipeline: fetch due feeds, enrich new articles (and AI-tag a few the
embeddings left without a topic), group them into stories, summarise the stories that are due.
`pipeline --loop` runs a round every minute; each stage only touches what's new."""

import asyncio
import time
from datetime import UTC, datetime

import httpx

from verilo_workers.cluster.stories import cluster_pending, merge_close
from verilo_workers.common.http import ssl_context
from verilo_workers.config import REVALIDATE_SECRET, REVALIDATE_URL
from verilo_workers.enrich.llm_topics import tag_pending
from verilo_workers.enrich.run import enrich_pending
from verilo_workers.ingest import store
from verilo_workers.ingest.run import ingest_due
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


def run_round(database_url: str | None = None) -> str:
    fetched = asyncio.run(ingest_due(database_url=database_url))
    with store.connect(database_url) as conn:
        enriched = enrich_pending(conn)
        tagged = tag_pending(conn)
        placed = cluster_pending(conn)
        merged = merge_close(conn)
        summaries = summarize_due(conn)
    changed = placed["placed"] or merged or summaries["published"] or tagged["tagged"]
    note = notify_app() if changed else "no changes"
    return (
        f"{fetched.describe()}; enriched {enriched}; "
        f"AI-tagged {tagged['tagged']} of {tagged['looked at']}; placed {placed['placed']} "
        f"({placed['new stories']} new stories); merged {merged}; "
        f"summaries {summaries['published']} published, {summaries['failed']} failed; {note}"
    )


def loop() -> None:
    print(f"Running the pipeline every {LOOP_SECONDS} s; Ctrl+C stops.", flush=True)
    while True:
        started = time.monotonic()
        try:
            print(f"{datetime.now(UTC):%H:%M:%S}  {run_round()}", flush=True)
        except Exception as exc:  # keep going; the next round tries again
            print(f"round failed: {type(exc).__name__}: {exc}", flush=True)
        time.sleep(max(1.0, LOOP_SECONDS - (time.monotonic() - started)))
