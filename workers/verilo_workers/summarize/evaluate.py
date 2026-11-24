"""How well the summary checks catch mistakes: run the code checks and the checker model on a set
of summaries with planted faults (tests/data/checker_cases.json), and count, per point, what each
caught and what it flagged wrongly. `python -m verilo_workers eval-summaries` (uses the checker
model's allowance: one call per case). Run it after changing a model, a prompt or a check.
"""

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

from verilo_workers.ai import AIError, RateLimited, complete
from verilo_workers.summarize import checks, prompts
from verilo_workers.summarize.run import _model_check

CASES = Path(__file__).resolve().parents[2] / "tests" / "data" / "checker_cases.json"


@dataclass
class Result:
    faults: int = 0
    clean: int = 0
    caught_code: int = 0
    caught_model: int = 0
    caught_either: int = 0
    false_code: int = 0
    false_model: int = 0
    missed: list[str] = field(default_factory=list)
    false_alarms: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def load(path: Path = CASES) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


def checker_message(excerpts: dict[str, str], points: list[dict]) -> str:
    """The same shape the checker sees in the pipeline (prompts.checker_message)."""
    blocks = [f"[{pid}] {text}" for pid, text in excerpts.items()]
    lines = [
        f"{i}. {p['text']} [cites: {', '.join(p['sources'])}]" for i, p in enumerate(points, 1)
    ]
    return "Excerpts:\n\n" + "\n\n".join(blocks) + "\n\nSummary:\n" + "\n".join(lines)


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _similar(a: str, b: str) -> float:
    """Word overlap relative to both texts (Jaccard): an unattributed claim matches the point
    that says just that, not a longer point that also attributes it."""
    wa, wb = _words(a), _words(b)
    return len(wa & wb) / len(wa | wb) if wa | wb else 0.0


def model_flags(check: checks.Check, points: list[dict]) -> set[int]:
    """The points (1-based) the checker model objected to: a verdict other than supported, a
    loaded word it uses, or an unattributed claim that matches it best."""
    flagged = {p["point"] for p in check.detail.get("problems", []) if isinstance(p, dict)}
    for word in check.detail.get("loaded_words", []):
        for i, p in enumerate(points, 1):
            if checks.normalise(word) in checks.normalise(p["text"]):
                flagged.add(i)
    for claim in check.detail.get("unattributed", []):
        text = claim if isinstance(claim, str) else json.dumps(claim)
        best = max(
            range(1, len(points) + 1),
            key=lambda i: _similar(text, points[i - 1]["text"]),
        )
        flagged.add(best)
    if any(isinstance(p, str) for p in check.detail.get("problems", [])):
        flagged |= set(range(1, len(points) + 1))  # no usable verdicts: everything is in doubt
    return flagged


def code_flags(points: list[dict], excerpts: dict[str, str]) -> set[int]:
    flagged = set()
    for c in checks.run(points, excerpts):
        for p in c.detail.get("problems", []):
            if isinstance(p, dict) and "point" in p:
                flagged.add(p["point"])
    return flagged


def evaluate(cases: list[dict], complete_fn=complete, wait: bool = True) -> Result:
    r = Result()
    for case in cases:
        points = case["points"]
        excerpts = case["excerpts"]
        by_code = code_flags(points, excerpts)
        by_model: set[int] = set()
        while True:
            try:
                reply = complete_fn(
                    "checker", prompts.CHECKER_SYSTEM, checker_message(excerpts, points),
                    max_tokens=1500,
                )  # fmt: skip
                by_model = model_flags(_model_check(reply.data, points), points)
                break
            except RateLimited as exc:
                if not wait:
                    raise
                time.sleep(min(exc.wait_seconds, 90) + 1)
            except AIError as exc:
                r.errors.append(f"{case['id']}: {exc}")
                break
        for i, p in enumerate(points, 1):
            label = f"{case['id']} #{i}"
            if p["fault"]:
                r.faults += 1
                r.caught_code += i in by_code
                r.caught_model += i in by_model
                if i in by_code or i in by_model:
                    r.caught_either += 1
                else:
                    r.missed.append(f"{label} ({p['fault']}): {p['text']}")
            else:
                r.clean += 1
                r.false_code += i in by_code
                r.false_model += i in by_model
                if i in by_code or i in by_model:
                    who = "code" if i in by_code else "model"
                    r.false_alarms.append(f"{label} (by {who}): {p['text']}")
    return r


def report(r: Result) -> str:
    pct = lambda n, d: f"{n}/{d} ({100 * n / d:.0f}%)" if d else "0/0"  # noqa: E731
    lines = [
        f"Faults caught by the code checks:   {pct(r.caught_code, r.faults)}",
        f"Faults caught by the checker model: {pct(r.caught_model, r.faults)}",
        f"Faults caught by either (published summaries need both to pass): "
        f"{pct(r.caught_either, r.faults)}",
        f"False alarms on correct points: code {pct(r.false_code, r.clean)}, "
        f"model {pct(r.false_model, r.clean)}",
    ]
    if r.missed:
        lines += ["", "Missed:"] + [f"  {m}" for m in r.missed]
    if r.false_alarms:
        lines += ["", "False alarms:"] + [f"  {f}" for f in r.false_alarms]
    if r.errors:
        lines += ["", "Errors:"] + [f"  {e}" for e in r.errors]
    return "\n".join(lines)
