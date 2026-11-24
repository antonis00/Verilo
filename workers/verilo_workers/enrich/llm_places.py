"""Where each story happens: the region (or two) it is about, or "global".

The reader's "Places" choice used to lift stories by where their outlets are based, so a BBC
report from Gaza counted as UK news. The `tagger` role (local gemma4 by default) reads a story's
headline and a few of its reports and names the regions it is about, from the same list readers
choose from, or "global" when it isn't about one place (world markets, a worldwide product, the
climate). Only stories two or more outlets cover are tagged; a story is tagged again when it has
doubled in size since. `stories.places`, `places_at`, `places_articles` (migration 25).
"""

import os
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import psycopg

from verilo_workers.ai import AIError, RateLimited, complete
from verilo_workers.ai import config as ai_config

GLOBAL = "global"
# The regions readers choose in Places (ingest/registry.py REGION_OF, apps/web/lib/regions.ts),
# with what each covers, for the model.
PLACES = {
    "north-america": "the United States and Canada",
    "uk-ireland": "the United Kingdom and Ireland",
    "europe": "the rest of Europe, including Russia and Ukraine",
    "middle-east": "the Gulf states, Iran, Iraq, Israel and the Palestinian territories, Syria, "
    "Lebanon, Jordan, Yemen, Turkey and Egypt",
    "africa": "Africa except Egypt",
    "south-asia": "India, Pakistan, Bangladesh, Sri Lanka, Nepal and Afghanistan",
    "east-asia": "China, Hong Kong, Taiwan, Japan, the Koreas and Mongolia",
    "southeast-asia": "Singapore, Indonesia, Malaysia, the Philippines, Thailand, Vietnam, "
    "Myanmar, Cambodia and Laos",
    "oceania": "Australia, New Zealand and the Pacific islands",
    "latin-america": "Mexico, Central and South America, and the Caribbean",
}
MAX_PLACES = 2
BATCH = 8
WINDOW = timedelta(hours=72)

Complete = Callable[..., object]


def system_prompt() -> str:
    regions = "\n".join(f"- {code}: {what}" for code, what in PLACES.items())
    return f"""You say where news stories happen, for a news app.

Regions (code: what it covers):
{regions}
- {GLOBAL}: the whole world, or no single place (world markets, a product sold worldwide, \
the climate, space)

For each numbered story (its headline, then headlines and openings of reports about it), give \
the regions it is about: where it happens, or the places it mainly concerns. At most \
{MAX_PLACES}, most important first, using only the codes above. A meeting between countries from \
two regions is about both; a story about one country is about its region only. Not where the \
outlets reporting it are based. If you can't tell, give an empty list.

Answer with JSON only: \
{{"stories": [{{"n": 1, "places": ["middle-east"]}}, {{"n": 2, "places": []}}]}}"""


def user_prompt(stories: list[dict]) -> str:
    blocks = []
    for i, s in enumerate(stories, 1):
        reports = "\n".join(f"  - {r}" for r in s["reports"])
        blocks.append(f"{i}. {s['title']}\n{reports}")
    return "\n\n".join(blocks)


def read_reply(data: dict | None, count: int) -> dict[int, list[str]]:
    """Story number -> valid place codes ("global" alone when the model gives it)."""
    out: dict[int, list[str]] = {}
    known = set(PLACES) | {GLOBAL}
    for item in (data or {}).get("stories") or []:
        if not isinstance(item, dict):
            continue
        n = item.get("n")
        if isinstance(n, str) and n.isdigit():
            n = int(n)
        if not isinstance(n, int) or not 1 <= n <= count or n in out:
            continue
        found = item.get("places") if isinstance(item.get("places"), list) else []
        chosen: list[str] = []
        for code in found:
            code = code.strip() if isinstance(code, str) else ""
            if code in known and code not in chosen:
                chosen.append(code)
        # "Global" means no particular place: it isn't combined with regions.
        if GLOBAL in chosen:
            chosen = [GLOBAL] if chosen[0] == GLOBAL else [c for c in chosen if c != GLOBAL]
        out[n] = chosen[:MAX_PLACES]
    return out


def _per_round() -> int:
    ai_config._env()
    return int(os.environ.get("VERILO_PLACES_PER_ROUND", "8"))


def place_pending(
    conn: psycopg.Connection,
    now: datetime | None = None,
    *,
    limit: int | None = None,
    complete_fn: Complete = complete,
    story_ids: list[int] | None = None,
) -> dict[str, int]:
    """Tag up to `limit` recent stories, widest first: never tagged, or doubled in size since."""
    now = now or datetime.now(UTC)
    limit = _per_round() if limit is None else limit
    counts = {"looked at": 0, "placed": 0}
    if limit <= 0:
        return counts
    if complete_fn is complete:
        try:
            ai_config.role("tagger")
        except ValueError as exc:
            print(f"place tagging off: {exc}", flush=True)
            return counts
    stories = conn.execute(
        """select st.id, st.title, st.article_count from public.stories st
           where st.merged_into is null and st.outlet_count >= 2 and st.last_published_at > %s
             and (st.places_at is null or st.article_count >= 2 * st.places_articles)
             and (%s::bigint[] is null or st.id = any(%s::bigint[]))
           order by st.outlet_count desc, st.last_published_at desc limit %s""",
        (now - WINDOW, story_ids, story_ids, limit),
    ).fetchall()
    for s in stories:
        reports = conn.execute(
            """select a.title, left(a.snippet, 160) as snippet from public.articles a
               where a.story_id = %s and a.kind = 'news'
               order by a.published_at desc limit 3""",
            (s["id"],),
        ).fetchall()
        s["reports"] = [f"{r['title']}. {r['snippet']}".strip(". ") for r in reports]
    conn.commit()  # no transaction stays open while the model works
    system = system_prompt()
    for start in range(0, len(stories), BATCH):
        batch = stories[start : start + BATCH]
        try:
            reply = complete_fn("tagger", system, user_prompt(batch), max_tokens=40 * len(batch))
        except RateLimited as exc:
            print(f"place tagging paused: {exc}", flush=True)
            break
        except AIError as exc:
            print(f"place tagging failed for a batch: {exc}", flush=True)
            break
        found = read_reply(reply.data, len(batch))
        with conn.transaction():
            for n, s in enumerate(batch, 1):
                places = found.get(n, [])
                conn.execute(
                    """update public.stories set places = %s, places_at = %s,
                         places_articles = %s where id = %s""",
                    (places, now, s["article_count"], s["id"]),
                )
                counts["placed"] += bool(places)
        conn.commit()
        counts["looked at"] += len(batch)
    return counts
