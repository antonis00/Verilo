"""The summary-check test set, offline: well formed, and the code checks catch the faults they
are built for. (The checker model is measured with python -m verilo_workers eval-summaries.)"""

from verilo_workers.ai import Completion
from verilo_workers.summarize import evaluate


def test_every_case_has_excerpts_cited_points_and_a_correct_point():
    cases = evaluate.load()
    assert len(cases) >= 15
    for case in cases:
        assert case["excerpts"] and case["points"]
        assert any(p["fault"] is None for p in case["points"]), case["id"]
        for p in case["points"]:
            assert p["sources"] and set(p["sources"]) <= set(case["excerpts"]), case["id"]


def test_the_code_checks_catch_numbers_names_and_quotations_and_pass_correct_points():
    cases = {c["id"]: c for c in evaluate.load()}
    for case_id, faulted in [("rates", 2), ("ceo-named", 2), ("quote", 2)]:
        c = cases[case_id]
        assert faulted in evaluate.code_flags(c["points"], c["excerpts"]), case_id
    for c in cases.values():
        flagged = evaluate.code_flags(c["points"], c["excerpts"])
        clean = {i for i, p in enumerate(c["points"], 1) if p["fault"] is None}
        assert not flagged & clean, (c["id"], flagged & clean)


def test_the_report_counts_what_each_layer_caught():
    cases = evaluate.load()[:2]

    def model(role, system, user, **_):
        # Supports point 1, objects to point 2, as a perfect checker would here.
        verdicts = [{"point": 1, "verdict": "supported"}, {"point": 2, "verdict": "not_supported"}]
        return Completion(
            "", {"points": verdicts, "loaded_words": [], "unattributed_claims": []}, "f", "m"
        )

    r = evaluate.evaluate(cases, complete_fn=model)
    assert (r.faults, r.clean, r.caught_model, r.false_model) == (2, 2, 2, 0)
    assert "Faults caught by either" in evaluate.report(r)
