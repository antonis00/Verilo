"""Checks in code, run on every summary whatever model wrote it.

Each point must cite at least one of the excerpts the writer was given, and every number, quoted
phrase and name in a point must appear in the excerpts it cites. A model can be fluent and wrong;
these checks don't depend on any model being right.
"""

import re
import unicodedata
from dataclasses import dataclass, field

MIN_BULLETS, MAX_BULLETS = 2, 6
MAX_BULLET_CHARS = 400


@dataclass
class Check:
    name: str
    passed: bool
    detail: dict = field(default_factory=dict)


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"[‐-―−]", "-", text)  # dashes and minus signs
    return re.sub(r"\s+", " ", text).strip().lower()


_NUMBER = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")


def numbers(text: str) -> set[str]:
    """Numbers as written, without thousands separators: "81.3", "1500", "2026"."""
    return {m.group().replace(",", "").rstrip(".") for m in _NUMBER.finditer(text)}


_QUOTE = re.compile(r'["“]([^"”]{8,})["”]')


def quotes(text: str) -> list[str]:
    """Quoted phrases of three words or more (shorter ones are often just terms in quotes)."""
    return [q for q in _QUOTE.findall(text) if len(q.split()) >= 3]


# Capitalised words that start sentences or are ordinary words, not names.
NOT_NAMES = {
    "the", "a", "an", "he", "she", "it", "they", "we", "this", "that", "these", "those", "his",
    "her", "its", "their", "in", "on", "at", "after", "before", "meanwhile", "however",
    "according", "but", "and", "or", "as", "while", "both", "some", "several", "officials",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january",
    "february", "march", "april", "may", "june", "july", "august", "september", "october",
    "november", "december", "outlets", "reports", "report", "other", "others", "one", "two",
    "three", "four", "five", "if", "when", "where", "who", "what", "with", "for", "from", "of",
    "to", "by", "also", "still", "there", "here", "ai",
}  # fmt: skip

_WORD = re.compile(r"[A-Z][\w'’.-]*[A-Za-z0-9]|[A-Z]{2,}")


def names(text: str) -> set[str]:
    """Capitalised words that aren't at the start of a sentence and aren't ordinary words."""
    found = set()
    for sentence in re.split(r"(?<=[.!?:;])\s+", text):
        words = sentence.split()
        for i, word in enumerate(words):
            token = word.strip("\"“”'‘’()[],.;:!?")
            if i == 0 or not token or not _WORD.fullmatch(token):
                continue
            token = re.sub(r"['’]s$", "", token)
            if token.lower() in NOT_NAMES:
                continue
            found.add(token)
    return found


def _present(needle: str, haystack: str) -> bool:
    n = normalise(needle).replace(".", "")
    h = normalise(haystack).replace(".", "")
    return n in h


def run(bullets: list[dict], passages: dict[str, str]) -> list[Check]:
    """`bullets`: [{"text": ..., "sources": ["A1", ...]}]; `passages`: {"A1": text, ...}."""
    results: list[Check] = []
    shape_problems = []
    if not MIN_BULLETS <= len(bullets) <= MAX_BULLETS:
        shape_problems.append(f"{len(bullets)} points (expected {MIN_BULLETS}-{MAX_BULLETS})")
    for i, b in enumerate(bullets, 1):
        text = str(b.get("text", "")).strip()
        if not text or len(text) > MAX_BULLET_CHARS:
            shape_problems.append(f"point {i} is empty or too long")
    results.append(Check("shape", not shape_problems, {"problems": shape_problems}))

    citation_problems, number_problems, quote_problems, name_problems = [], [], [], []
    for i, b in enumerate(bullets, 1):
        text = str(b.get("text", ""))
        sources = [s for s in b.get("sources", []) if isinstance(s, str)]
        unknown = [s for s in sources if s not in passages]
        if not sources or unknown:
            citation_problems.append({"point": i, "unknown": unknown, "cited": sources})
            continue
        cited = " \n ".join(passages[s] for s in sources)
        cited_numbers = numbers(cited)
        for n in numbers(text) - cited_numbers:
            number_problems.append({"point": i, "number": n})
        for q in quotes(text):
            if not _present(q, cited):
                quote_problems.append({"point": i, "quote": q})
        for name in names(text):
            if not _present(name, cited):
                name_problems.append({"point": i, "name": name})
    results.append(Check("citations", not citation_problems, {"problems": citation_problems}))
    results.append(Check("numbers", not number_problems, {"problems": number_problems}))
    results.append(Check("quotes", not quote_problems, {"problems": quote_problems}))
    results.append(Check("names", not name_problems, {"problems": name_problems}))
    return results
