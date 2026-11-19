"""Topics for the articles the embedding matcher left untagged, from a language model.

The embedding matcher (topics.py) only assigns confident matches, so many news articles have no
topic and never reach a topic page or a reader who follows one. The `tagger` role (local Ollama
gemma4 by default; any provider in workers/.env) reads headlines and excerpts in batches with the
whole topic catalog and picks the one topic each article is mainly about, only a slug from the
catalog; its parent is added as for embeddings. One, not two: measured on real articles (Nov 2026,
gemma4), a second topic was often a stretch (the ANC as UK politics, a car crash as
cybersecurity). About 85% of main topics were right, against about 94% for the stricter embedding
floor, so these tags are recorded apart (method `llm`). Every article it has looked at is marked
(`topics_llm_at`), whether or not it found a topic, so nothing is asked twice.
"""

import os
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import psycopg

from verilo_workers.ai import AIError, RateLimited, complete
from verilo_workers.ai import config as ai_config
from verilo_workers.enrich import topics as topic_tags

BATCH = 10
MAX_TOPICS = 1
LLM_SCORE = 0.6  # recorded score for a model's tag: between the floor and a section's 1.0
WINDOW = timedelta(hours=72)  # only recent articles: older ones no longer reach the front page

Complete = Callable[..., object]


def system_prompt(topics: list[topic_tags.Topic]) -> str:
    catalog = "\n".join(f"- {t.slug}: {t.name}. {t.description}" for t in topics)
    return f"""You sort news articles into topics for a news app.

Topics (slug: name. what it covers):
{catalog}

For each numbered article (headline, then the start of the report), choose the one topic it is \
mainly about, using only the slugs above: the most specific that fits (Football rather than \
Sport). Choose it only if the article is clearly about it, not if it is merely mentioned. If \
none fits, give an empty list.

Answer with JSON only: {{"articles": [{{"n": 1, "topics": ["slug"]}}, {{"n": 2, "topics": []}}]}}"""


def user_prompt(rows: list[dict]) -> str:
    return "\n\n".join(
        f"{i}. {r['title']}\n{(r['snippet'] or '').strip()}" for i, r in enumerate(rows, 1)
    )


def read_reply(data: dict | None, count: int, slugs: set[str]) -> dict[int, list[str]]:
    """Article number -> valid topic slugs (unknown slugs and extra topics dropped)."""
    out: dict[int, list[str]] = {}
    for item in (data or {}).get("articles") or []:
        if not isinstance(item, dict):
            continue
        n = item.get("n")
        if isinstance(n, str) and n.isdigit():
            n = int(n)
        if not isinstance(n, int) or not 1 <= n <= count or n in out:
            continue
        found = item.get("topics") if isinstance(item.get("topics"), list) else []
        chosen = []
        for slug in found:
            if isinstance(slug, str) and slug.strip() in slugs and slug.strip() not in chosen:
                chosen.append(slug.strip())
        out[n] = chosen[:MAX_TOPICS]
    return out


def with_parents(chosen: list[str], topics: list[topic_tags.Topic]) -> list[tuple[str, str]]:
    parent_of = {t.slug: t.parent for t in topics if t.parent}
    result = [(slug, "llm") for slug in chosen]
    for slug in chosen:
        parent = parent_of.get(slug)
        if parent and parent not in chosen and all(parent != s for s, _ in result):
            result.append((parent, "parent"))
    return result


def _per_round() -> int:
    ai_config._env()
    return int(os.environ.get("VERILO_TAGS_PER_ROUND", "10"))


def tag_pending(
    conn: psycopg.Connection,
    now: datetime | None = None,
    *,
    limit: int | None = None,
    complete_fn: Complete = complete,
) -> dict[str, int]:
    """Tag up to `limit` recent untagged news articles. Returns counts."""
    now = now or datetime.now(UTC)
    limit = _per_round() if limit is None else limit
    counts = {"looked at": 0, "tagged": 0}
    if limit <= 0:
        return counts
    if complete_fn is complete:
        try:
            ai_config.role("tagger")
        except ValueError as exc:
            print(f"AI tagging off: {exc}", flush=True)
            return counts
    topics = topic_tags.load()
    ids = {
        r["slug"]: r["id"]
        for r in conn.execute("select id, slug from public.topics where active").fetchall()
    }
    topics = [t for t in topics if t.slug in ids]
    slugs = {t.slug for t in topics}
    system = system_prompt(topics)
    rows = conn.execute(
        """select a.id, a.title, a.snippet from public.articles a
           where a.kind = 'news' and a.enriched_at is not null and a.topics_llm_at is null
             and coalesce(a.published_at, a.fetched_at) > %s
             and not exists (select 1 from public.article_topics t where t.article_id = a.id)
           order by coalesce(a.published_at, a.fetched_at) desc limit %s""",
        (now - WINDOW, limit),
    ).fetchall()
    for start in range(0, len(rows), BATCH):
        batch = rows[start : start + BATCH]
        try:
            reply = complete_fn("tagger", system, user_prompt(batch), max_tokens=40 * len(batch))
        except RateLimited as exc:
            print(f"AI tagging paused: {exc}", flush=True)
            break
        except AIError as exc:
            # A bad reply: leave these articles for the next round rather than mark them.
            print(f"AI tagging failed for a batch: {exc}", flush=True)
            break
        found = read_reply(reply.data, len(batch), slugs)
        with conn.transaction():
            for n, row in enumerate(batch, 1):
                tags = with_parents(found.get(n, []), topics)
                for slug, method in tags:
                    conn.execute(
                        """insert into public.article_topics (article_id, topic_id, score, method)
                           values (%s, %s, %s, %s) on conflict do nothing""",
                        (row["id"], ids[slug], LLM_SCORE, method),
                    )
                conn.execute(
                    "update public.articles set topics_llm_at = %s where id = %s", (now, row["id"])
                )
                counts["tagged"] += bool(tags)
        counts["looked at"] += len(batch)
    return counts
