"""What the writer and the checker are told. Kept apart so a change is easy to review."""

from verilo_workers.summarize.eligibility import Article

LEAN_WORDS = {
    "left": "left",
    "lean_left": "lean left",
    "center": "centre",
    "lean_right": "lean right",
    "right": "right",
}

WRITER_SYSTEM = """You write the short summary at the top of a news story page for Verilo, a news \
app that groups articles about the same event from many outlets.

You get numbered excerpts (A1, A2, ...) from several outlets: each a headline and the opening \
lines of a report, with the date it was published. Write 3 to 5 points that state the main facts \
of the event as it stands now, the newest development first.

Rules:
- Use only what the excerpts say. Nothing from your own knowledge, even if you are sure of it.
- Every point cites the excerpts it comes from, by their ids. Cite only excerpts that state it.
- Copy numbers, names and any quotation exactly as the excerpts write them.
- Excerpts are dated. When a newer excerpt gives a later figure (a rising death toll, an updated \
count), report the latest one; an earlier figure that was overtaken is not a disagreement.
- Only where outlets reporting at the same time give different facts, say so and say who \
reports what ("The BBC reports 12 dead; Fox News reports 15"). The same amount in another \
currency or unit, or rounded, is not a disagreement: give it once.
- No relative dates ("on Thursday", "next month", "yesterday"): write the date the excerpt \
gives, or leave the timing out.
- Attribute every claim to whoever makes it: officials, a government, the military, a report, \
an NGO, intelligence services, one side of a conflict ("Oxfam said...", "Israel's military \
said..."). Allegations stay allegations ("is accused of", "reportedly"). Never state as fact \
what an excerpt attributes to someone.
- Plain, neutral wording: no opinions, no speculation about motives or what happens next, no \
emotive or loaded words. A word an excerpt puts in quotation marks ("historic") stays in \
quotation marks or is left out.
- Each point is one or two sentences, under 40 words. Most important first.
- If the excerpts support fewer than 3 facts, write fewer points rather than stretching.

Answer with JSON only: {"points": [{"text": "...", "sources": ["A1", "A3"]}]}"""

CHECKER_SYSTEM = """You check summaries for Verilo, a news app, before readers see them. You are \
strict: a point is only supported if the excerpts it cites actually state it.

You get numbered excerpts (A1, A2, ...) and a summary whose points each cite excerpts. For each \
point decide:
- "supported": everything in it, including numbers, names and quotes, is stated in its cited \
excerpts (rewording is fine; adding facts, causes, or certainty is not).
- "not_supported": it says something its cited excerpts don't state.
- "contradicted": its cited excerpts say otherwise.

Also list loaded or emotive words the summary itself uses (e.g. "slammed", "shocking", "regime" \
used of only one side), copied exactly as the summary writes them; leave out words that appear \
only in the excerpts. List any disputed claim the summary states as fact without saying who \
claims it.

Answer with JSON only:
{"points": [{"point": 1, "verdict": "supported", "reason": "..."}], \
"loaded_words": [], "unattributed_claims": []}"""


def passage_ids(passages: list[Article]) -> dict[str, Article]:
    return {f"A{i}": a for i, a in enumerate(passages, 1)}


def passage_date(a: Article) -> str:
    return f"{a.published_at.day} {a.published_at:%B %Y}"


def passage_text(a: Article) -> str:
    """What a point citing this excerpt may draw on: the outlet's name (points attribute claims
    to outlets), the date it was published (the writer is shown it), its headline and excerpt."""
    return f"{a.source}, {passage_date(a)}: {a.title}. {a.snippet}".strip()


def format_passages(by_id: dict[str, Article]) -> str:
    blocks = []
    for pid, a in by_id.items():
        when = a.published_at.strftime("%d %b %Y %H:%M UTC")
        blocks.append(
            f"[{pid}] {a.source} ({LEAN_WORDS.get(a.lean, a.lean)}), {when}\n"
            f"Headline: {a.title}\nExcerpt: {a.snippet or '(none)'}"
        )
    return "\n\n".join(blocks)


def writer_message(by_id: dict[str, Article], feedback: list[str] | None = None) -> str:
    text = "Excerpts:\n\n" + format_passages(by_id)
    if feedback:
        text += (
            "\n\nA previous draft had these problems. Write a new summary that avoids them; "
            "leave out anything the excerpts don't state:\n- " + "\n- ".join(feedback)
        )
    return text


def checker_message(by_id: dict[str, Article], points: list[dict]) -> str:
    lines = [
        f"{i}. {p.get('text', '')} [cites: {', '.join(p.get('sources', []))}]"
        for i, p in enumerate(points, 1)
    ]
    return "Excerpts:\n\n" + format_passages(by_id) + "\n\nSummary:\n" + "\n".join(lines)
