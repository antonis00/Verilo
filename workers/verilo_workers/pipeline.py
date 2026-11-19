"""One round of the whole pipeline: fetch due feeds, enrich new articles, group them into stories.
`pipeline --loop` runs a round every minute; each stage only touches what's new."""

import asyncio
import time
from datetime import UTC, datetime

from verilo_workers.cluster.stories import cluster_pending, merge_close
from verilo_workers.enrich.run import enrich_pending
from verilo_workers.ingest import store
from verilo_workers.ingest.run import ingest_due

LOOP_SECONDS = 60


def run_round(database_url: str | None = None) -> str:
    fetched = asyncio.run(ingest_due(database_url=database_url))
    with store.connect(database_url) as conn:
        enriched = enrich_pending(conn)
        placed = cluster_pending(conn)
        merged = merge_close(conn)
    return (
        f"{fetched.describe()}; enriched {enriched}; placed {placed['placed']} "
        f"({placed['new stories']} new stories); merged {merged}"
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
