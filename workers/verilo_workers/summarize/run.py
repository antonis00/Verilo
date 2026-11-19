"""Summaries for the stories that are due: write, check, publish or log the failure.

A story is due when it's eligible (eligibility.py) and has no summary yet; when a published
summary is over RESUMMARISE_AFTER old and MIN_NEW trusted reports have arrived since; or when its
last attempt failed and MIN_NEW trusted reports have arrived since. Each attempt: the writer
drafts points citing excerpts, code checks them (checks.py), then a different model checks every
point. Anything failing gets one rewrite with the problems named; failing again, the story keeps
headlines and links only and the failure is stored with every check.
"""

import os
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import psycopg
from psycopg.types.json import Jsonb

from verilo_workers.ai import AIError, RateLimited, complete
from verilo_workers.ai import config as ai_config
from verilo_workers.summarize import checks, eligibility, prompts
from verilo_workers.summarize.eligibility import Article

WINDOW = timedelta(hours=48)
RESUMMARISE_AFTER = timedelta(hours=2)
MIN_NEW = 3
ATTEMPTS = 2


def _limit(name: str, default: int) -> int:
    """VERILO_SUMMARIES_PER_ROUND / _PER_DAY, read when used (after workers/.env is loaded)."""
    ai_config._env()
    return int(os.environ.get(f"VERILO_SUMMARIES_{name}", default))


VERDICTS = {"supported", "not_supported", "contradicted"}

Complete = Callable[..., object]


def _candidates(conn: psycopg.Connection, now: datetime, story_ids: list[int] | None):
    return conn.execute(
        """select st.id, st.outlet_count,
                  ss.status as last_status, ss.created_at as last_at, ss.article_ids as last_ids
           from public.stories st
           left join lateral (
             select status, created_at, article_ids from public.story_summaries
             where story_id = st.id and status <> 'superseded'
             order by created_at desc limit 1) ss on true
           where st.merged_into is null and st.outlet_count >= %s
             and st.last_published_at > %s
             and (%s::bigint[] is null or st.id = any(%s::bigint[]))
           order by st.outlet_count desc, st.last_published_at desc""",
        (eligibility.MIN_OUTLETS, now - WINDOW, story_ids, story_ids),
    ).fetchall()


def _articles(conn: psycopg.Connection, story_id: int) -> list[Article]:
    rows = conn.execute(
        """select a.id, a.source_id, s.name as source, s.tier, s.lean::text as lean, a.kind,
                  a.title, a.snippet, coalesce(a.published_at, a.fetched_at) as published_at
           from public.articles a join public.sources s on s.id = a.source_id
           where a.story_id = %s""",
        (story_id,),
    ).fetchall()
    return [Article(**r) for r in rows]


def _topics(conn: psycopg.Connection, story_id: int) -> set[str]:
    rows = conn.execute(
        """select t.slug from public.story_topics st join public.topics t on t.id = st.topic_id
           where st.story_id = %s and st.articles >= 2""",
        (story_id,),
    ).fetchall()
    return {r["slug"] for r in rows}


def _due(row, articles: list[Article], now: datetime) -> bool:
    if row["last_status"] is None:
        return True
    new = [a for a in eligibility.trusted(articles) if a.id not in set(row["last_ids"])]
    if len(new) < MIN_NEW:
        return False
    return row["last_status"] == "failed" or now - row["last_at"] > RESUMMARISE_AFTER


def _points(data: dict | None) -> list[dict]:
    points = (data or {}).get("points")
    if not isinstance(points, list):
        return []
    out = []
    for p in points:
        if isinstance(p, dict):
            sources = p.get("sources") if isinstance(p.get("sources"), list) else []
            out.append({"text": str(p.get("text", "")).strip(), "sources": sources})
    return out


def _model_check(data: dict | None, points: list[dict]) -> checks.Check:
    """The checker model's verdicts as one check: every point supported, nothing loaded. A loaded
    word counts only if the summary really uses it (checkers also list the excerpts' words)."""
    n_points = len(points)
    summary = checks.normalise(" ".join(p["text"] for p in points))
    verdicts = (data or {}).get("points")
    problems = []
    if not isinstance(verdicts, list):
        return checks.Check("model", False, {"problems": ["no verdicts in the reply"]})
    by_point = {}
    for v in verdicts:
        if isinstance(v, dict) and isinstance(v.get("point"), int):
            by_point[v["point"]] = v
    for i in range(1, n_points + 1):
        v = by_point.get(i)
        verdict = v.get("verdict") if v else None
        if verdict not in VERDICTS:
            problems.append({"point": i, "verdict": "missing"})
        elif verdict != "supported":
            problems.append({"point": i, "verdict": verdict, "reason": v.get("reason", "")})
    loaded = [
        w
        for w in (data.get("loaded_words") or [])
        if isinstance(w, str) and w.strip() and checks.normalise(w) in summary
    ]
    unattributed = [c for c in (data.get("unattributed_claims") or []) if c]
    detail = {
        "problems": problems,
        "loaded_words": loaded,
        "unattributed": unattributed,
        "verdicts": verdicts,
    }
    return checks.Check("model", not (problems or loaded or unattributed), detail)


def feedback(failed: list[checks.Check]) -> list[str]:
    """The problems in plain words, for the rewrite."""
    lines = []
    for c in failed:
        d = c.detail
        if c.name == "shape":
            lines += [f"format: {p}" for p in d.get("problems", [])]
        elif c.name == "citations":
            lines += [
                f"point {p['point']} must cite only the excerpt ids given"
                for p in d.get("problems", [])
            ]
        elif c.name == "numbers":
            lines += [
                f"point {p['point']}: the number {p['number']} is not in its cited excerpts"
                for p in d.get("problems", [])
            ]
        elif c.name == "quotes":
            lines += [
                f'point {p["point"]}: the quotation "{p["quote"]}" is not word for word '
                "in its cited excerpts"
                for p in d.get("problems", [])
            ]
        elif c.name == "names":
            lines += [
                f'point {p["point"]}: "{p["name"]}" is not named in its cited excerpts'
                for p in d.get("problems", [])
            ]
        elif c.name == "model":
            for p in d.get("problems", []):
                if isinstance(p, str):  # about the whole reply, not one point
                    lines.append(p)
                    continue
                why = f": {p['reason']}" if p.get("reason") else ""
                lines.append(f"point {p['point']} was judged {p['verdict']}{why}")
            lines += [f"loaded wording: {w}" for w in d.get("loaded_words", [])]
            lines += [
                f"claim stated as fact without saying who claims it: {u}"
                for u in d.get("unattributed", [])
            ]
        elif c.name in ("writer", "checker"):
            lines.append(f"{c.name}: {d.get('error', 'failed')}")
    return lines


def summarise(
    articles: list[Article], complete_fn: Complete = complete
) -> tuple[list[dict], list[tuple[int, checks.Check]], dict]:
    """Write and check one story's summary. Returns (points or [] on failure, every check with
    its attempt, facts for the record). RateLimited propagates: nothing is decided."""
    chosen = eligibility.passages(articles)
    by_id = prompts.passage_ids(chosen)
    texts = {pid: prompts.passage_text(a) for pid, a in by_id.items()}
    record: list[tuple[int, checks.Check]] = []
    facts = {"article_ids": [a.id for a in chosen], "writer": None, "checker": None, "attempts": 0}
    notes: list[str] = []
    for attempt in range(1, ATTEMPTS + 1):
        facts["attempts"] = attempt
        try:
            draft = complete_fn(
                "writer",
                prompts.WRITER_SYSTEM,
                prompts.writer_message(by_id, notes),
                max_tokens=1500,
            )
        except RateLimited:
            raise
        except AIError as exc:
            record.append((attempt, checks.Check("writer", False, {"error": str(exc)[:500]})))
            break
        facts["writer"] = draft.label
        points = _points(draft.data)
        results = checks.run(points, texts)
        if all(c.passed for c in results):
            try:
                verdict = complete_fn(
                    "checker",
                    prompts.CHECKER_SYSTEM,
                    prompts.checker_message(by_id, points),
                    max_tokens=1500,
                )
            except RateLimited:
                raise
            except AIError as exc:
                record += [(attempt, c) for c in results]
                record.append((attempt, checks.Check("checker", False, {"error": str(exc)[:500]})))
                break
            facts["checker"] = verdict.label
            if verdict.label == draft.label:
                results.append(
                    checks.Check(
                        "model",
                        False,
                        {"problems": ["the checker must be a different model from the writer"]},
                    )
                )
            else:
                results.append(_model_check(verdict.data, points))
        record += [(attempt, c) for c in results]
        failed = [c for c in results if not c.passed]
        if not failed:
            for p in points:
                p["article_ids"] = [by_id[s].id for s in p.pop("sources")]
            return points, record, facts
        notes = feedback(failed)
    return [], record, facts


def _store(conn, story_id: int, points, record, facts) -> int:
    failed = [c for _, c in record if not c.passed]
    status = "published" if points else "failed"
    failure = None if points else "; ".join(feedback(failed[-6:]))[:2000] or "no usable draft"
    with conn.transaction():
        if points:
            conn.execute(
                """update public.story_summaries set status = 'superseded'
                   where story_id = %s and status = 'published'""",
                (story_id,),
            )
        summary_id = conn.execute(
            """insert into public.story_summaries
                 (story_id, status, bullets, article_ids, writer, checker, attempts, failure)
               values (%s, %s, %s, %s, %s, %s, %s, %s) returning id""",
            (
                story_id,
                status,
                Jsonb(points),
                facts["article_ids"],
                facts["writer"] or ai_config.describe("writer"),
                facts["checker"],
                max(1, facts["attempts"]),
                failure,
            ),
        ).fetchone()["id"]
        for attempt, c in record:
            conn.execute(
                """insert into public.summary_checks (summary_id, attempt, check_name, passed,
                     detail) values (%s, %s, %s, %s, %s)""",
                (summary_id, attempt, c.name, c.passed, Jsonb(c.detail)),
            )
    return summary_id


def summarize_due(
    conn: psycopg.Connection,
    now: datetime | None = None,
    *,
    per_round: int | None = None,
    per_day: int | None = None,
    story_ids: list[int] | None = None,
    complete_fn: Complete = complete,
) -> dict[str, int]:
    now = now or datetime.now(UTC)
    counts = {"published": 0, "failed": 0, "waiting": 0, "ineligible": 0}
    if complete_fn is complete:
        try:
            ai_config.role("writer"), ai_config.role("checker")
        except (AIError, ValueError) as exc:
            print(f"summaries off: {exc}", flush=True)
            return counts
    today = conn.execute(
        "select count(*) as n from public.story_summaries where created_at > %s",
        (now - timedelta(days=1),),
    ).fetchone()["n"]
    per_round = _limit("PER_ROUND", 3) if per_round is None else per_round
    per_day = _limit("PER_DAY", 60) if per_day is None else per_day
    budget = max(0, min(per_round, per_day - today))
    for row in _candidates(conn, now, story_ids):
        if budget == 0:
            break
        articles = _articles(conn, row["id"])
        if not eligibility.check(articles, _topics(conn, row["id"])).eligible:
            counts["ineligible"] += 1
            continue
        if not _due(row, articles, now):
            continue
        try:
            points, record, facts = summarise(articles, complete_fn)
        except RateLimited as exc:
            print(f"summaries paused: {exc}", flush=True)
            counts["waiting"] += 1
            break
        _store(conn, row["id"], points, record, facts)
        counts["published" if points else "failed"] += 1
        budget -= 1
    return counts
