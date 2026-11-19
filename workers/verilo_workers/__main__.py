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

    args = parser.parse_args(argv)

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
