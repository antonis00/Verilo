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

# Titles and honorifics: a writer may add one to a name the excerpts give ("President Lula").
TITLES = {
    "president", "vice", "prime", "minister", "secretary", "senator", "sen", "rep",
    "representative", "governor", "gov", "chancellor", "king", "queen", "prince", "princess",
    "mr", "mrs", "ms", "dr", "jr", "sr", "sir", "dame", "lord", "lady", "general", "gen",
    "chief", "mayor", "judge", "justice", "speaker", "pope", "ambassador", "commissioner",
}  # fmt: skip

# Abbreviations in the excerpts that a writer may spell out, and the words that then count.
EXPANSIONS = [
    (re.compile(r"\bU\.?S\.?(?:A\.?)?(?![a-z])|\bAmerica"), "United States America American"),
    (re.compile(r"\bU\.?K\.?(?![a-z])|\bBritain|\bBritish"), "United Kingdom Britain British"),
    (re.compile(r"\bU\.?N\.?(?![a-z])"), "United Nations"),
    (re.compile(r"\bE\.?U\.?(?![a-z])"), "European Union"),
]

_WORD = re.compile(r"[A-Z][\w'’.-]*[A-Za-z0-9]|[A-Z]{2,}")


def _token(word: str) -> str:
    return re.sub(r"['’]s$", "", word.strip("\"“”'‘’()[],.;:!?"))


def name_runs(text: str) -> list[list[str]]:
    """Runs of capitalised words that look like names ("Vice President JD Vance"). The first word
    of a sentence counts only when a name follows it, and ordinary words never count."""
    found: list[tuple[int, list[str]]] = []  # (position of the run's first word, its words)
    for sentence in re.split(r"(?<=[.!?:;])\s+", text):
        run: list[str] = []
        start = 0
        for i, word in enumerate(sentence.split()):
            token = _token(word)
            if token and _WORD.fullmatch(token) and token.lower() not in NOT_NAMES:
                if not run:
                    start = i
                run.append(token)
            elif run:
                found.append((start, run))
                run = []
            # A run ends at punctuation: "Paris, France" is two names.
            if run and re.search(r"[,;:()\"”]$", word):
                found.append((start, run))
                run = []
        if run:
            found.append((start, run))
    # A sentence's first word alone is just a capital letter, not a name.
    return [run for start, run in found if not (start == 0 and len(run) == 1)]


def names(text: str) -> set[str]:
    """Every word of every name run."""
    return {t for run in name_runs(text) for t in run}


def _flat(text: str) -> str:
    return normalise(text).replace(".", "")


def _present(needle: str, haystack: str) -> bool:
    return _flat(needle) in _flat(haystack)


class CitedNames:
    """What the cited excerpts allow a point to name."""

    def __init__(self, cited: str):
        extra = " ".join(words for pattern, words in EXPANSIONS if pattern.search(cited))
        self.text = _flat(f"{cited} {extra}")
        self.words = {w.lower() for w in re.findall(r"[A-Z][A-Za-z]{3,}", f"{cited} {extra}")}

    def has(self, token: str) -> bool:
        flat = _flat(token)
        if re.search(rf"(?<![\w]){re.escape(flat)}(?![\w])", self.text):
            return True
        # An adjective of a cited name: "Iranian" for Iran, "Israeli" for Israel.
        low = token.lower()
        return any(low != w and low.startswith(w[: max(4, len(w) - 1)]) for w in self.words)

    def problems(self, run: list[str]) -> list[str]:
        """The words of a name run the excerpts don't support. A title passes; so does a first
        name when the run's last name is cited ("Donald Trump" where the excerpt says "Trump")."""
        last_cited = self.has(run[-1])
        missing = []
        for i, token in enumerate(run):
            if self.has(token) or token.lower().rstrip(".") in TITLES:
                continue
            if last_cited and i < len(run) - 1:
                continue
            missing.append(token)
        return missing


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
        allowed = CitedNames(cited)
        for run in name_runs(text):
            name_problems += [{"point": i, "name": t} for t in allowed.problems(run)]
    results.append(Check("citations", not citation_problems, {"problems": citation_problems}))
    results.append(Check("numbers", not number_problems, {"problems": number_problems}))
    results.append(Check("quotes", not quote_problems, {"problems": quote_problems}))
    results.append(Check("names", not name_problems, {"problems": name_problems}))
    return results
