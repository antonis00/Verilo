"""Command line: `python -m verilo_workers <command>`."""

import argparse
import asyncio
import sys

from verilo_workers.ingest import registry


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m verilo_workers")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser(
        "check-feeds", help="fetch every feed in the registry and report, storing nothing"
    )
    commands.add_parser("sync-sources", help="write data/sources.toml into the database")

    ingest = commands.add_parser(
        "ingest", help="fetch the feeds that are due and store new articles"
    )
    ingest.add_argument("--loop", action="store_true", help="keep running, checking every minute")
    ingest.add_argument(
        "--all", action="store_true", help="fetch every active feed now, due or not"
    )
    ingest.add_argument("--source", action="append", help="only this source (slug); repeatable")

    editor = commands.add_parser("make-editor", help="let an account open the internal desk page")
    editor.add_argument("email")
    editor.add_argument("--remove", action="store_true")

    commands.add_parser("sync-topics", help="write data/topics.toml into the database")
    enrich = commands.add_parser("enrich", help="embed and tag the articles not yet enriched")
    enrich.add_argument(
        "--retag",
        action="store_true",
        help="recompute every article's topics (after topics.toml changes)",
    )
    tag = commands.add_parser(
        "tag", help="AI-tag recent news articles the embeddings left without a topic"
    )
    tag.add_argument("--limit", type=int, default=10, help="at most this many articles")
    commands.add_parser("prune", help="drop old embeddings, stories and logs (runs daily anyway)")
    commands.add_parser(
        "reclassify", help="run the opinion/analysis/live rules again over stored news articles"
    )
    commands.add_parser("cluster", help="group enriched articles into stories")
    commands.add_parser(
        "eval-summaries",
        help="measure how many planted mistakes the summary checks catch (uses the AI allowance)",
    )
    place = commands.add_parser("place", help="tag where recent stories happen (AI tagger)")
    place.add_argument("--limit", type=int, default=8, help="at most this many stories")
    commands.add_parser(
        "recluster",
        help="rebuild every story under the current rules (deletes stories and their summaries; "
        "for a development database)",
    )
    summarize = commands.add_parser(
        "summarize", help="write and check AI summaries for the stories that are due"
    )
    summarize.add_argument("--story", type=int, action="append", help="only this story id")
    summarize.add_argument("--limit", type=int, default=3, help="at most this many stories")
    commands.add_parser(
        "own-sources", help="fetch the readers' own sources that are due (the pipeline does too)"
    )
    pipeline = commands.add_parser(
        "pipeline", help="one round of everything: ingest, enrich, cluster (the normal way to run)"
    )
    pipeline.add_argument("--loop", action="store_true", help="a round every minute")

    args = parser.parse_args(argv)

    if args.command == "pipeline":
        from verilo_workers import pipeline as pipe

        if args.loop:
            pipe.loop()
        else:
            print(pipe.run_round())
        return 0

    if args.command == "own-sources":
        from verilo_workers.own.run import describe, fetch_due

        print(describe(asyncio.run(fetch_due())))
        return 0

    if args.command == "eval-summaries":
        from verilo_workers.summarize import evaluate

        print(evaluate.report(evaluate.evaluate(evaluate.load())))
        return 0

    if args.command == "place":
        from verilo_workers.enrich.llm_places import place_pending
        from verilo_workers.ingest import store

        with store.connect() as conn:
            print(place_pending(conn, limit=args.limit))
        return 0

    if args.command == "recluster":
        from verilo_workers.cluster.stories import recluster_all
        from verilo_workers.ingest import store

        with store.connect() as conn:
            print(recluster_all(conn))
        return 0

    if args.command == "prune":
        from verilo_workers.ingest import store
        from verilo_workers.retention import prune

        with store.connect() as conn:
            print(prune(conn))
        return 0

    if args.command == "reclassify":
        from verilo_workers.enrich.run import reclassify
        from verilo_workers.ingest import store

        with store.connect() as conn:
            print(reclassify(conn))
        return 0

    if args.command == "tag":
        from verilo_workers.enrich.llm_topics import tag_pending
        from verilo_workers.ingest import store

        with store.connect() as conn:
            print(tag_pending(conn, limit=args.limit))
        return 0

    if args.command == "summarize":
        from verilo_workers.ingest import store
        from verilo_workers.summarize.run import summarize_due

        with store.connect() as conn:
            print(summarize_due(conn, per_round=args.limit, story_ids=args.story))
        return 0

    if args.command in ("sync-topics", "enrich", "cluster"):
        from verilo_workers.cluster.stories import cluster_pending, merge_close
        from verilo_workers.enrich import run as enrich_run
        from verilo_workers.enrich import topics
        from verilo_workers.ingest import store

        with store.connect() as conn:
            if args.command == "sync-topics":
                print(f"topics: {enrich_run.sync_topics(conn, topics.load())}")
            elif args.command == "enrich" and args.retag:
                enrich_run.sync_topics(conn, topics.load())
                print(f"retagged {enrich_run.retag_all(conn)} articles")
            elif args.command == "enrich":
                print(f"enriched {enrich_run.enrich_pending(conn)} articles")
            else:
                placed = cluster_pending(conn)
                print(
                    f"placed {placed['placed']} ({placed['new stories']} new stories); "
                    f"merged {merge_close(conn)}"
                )
        return 0

    if args.command == "check-feeds":
        from verilo_workers.ingest.check import check, print_report

        reports = asyncio.run(check(registry.active(registry.load())))
        return 1 if print_report(reports) else 0

    if args.command == "sync-sources":
        from verilo_workers.ingest import store

        counts = store.sync_sources(registry.load())
        print(", ".join(f"{k}: {v}" for k, v in counts.items()))
        return 0

    if args.command == "ingest":
        from verilo_workers.ingest import run

        if args.loop:
            run.loop()
            return 0
        summary = asyncio.run(run.ingest_due(fetch_all=args.all, only=args.source))
        print(summary.describe())
        return 0

    if args.command == "make-editor":
        from verilo_workers.ingest import store

        found = store.set_editor(args.email, not args.remove)
        print("updated" if found else f"no account with the email {args.email}")
        return 0 if found else 1

    return 2


if __name__ == "__main__":
    sys.exit(main())
