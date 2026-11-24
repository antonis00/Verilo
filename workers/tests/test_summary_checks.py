"""The code checks and the eligibility rule, offline."""

from datetime import UTC, datetime, timedelta

from verilo_workers.summarize import checks, eligibility
from verilo_workers.summarize.eligibility import Article
from verilo_workers.summarize.run import _model_check, feedback

PASSAGES = {
    "A1": 'Reuters: Quake kills 1,204 in Turkey. Officials said "rescue work will continue" '
    "in Hatay province.",
    "A2": "BBC News: Erdogan visits Hatay. The president said 3.5 million people were affected.",
}


def by_name(results):
    return {c.name: c for c in results}


def test_a_faithful_summary_passes_every_check():
    points = [
        {"text": "The quake killed 1204 people in Turkey, Reuters reports.", "sources": ["A1"]},
        {"text": 'Officials said "rescue work will continue" in Hatay.', "sources": ["A1"]},
        {"text": "Erdogan said 3.5 million people were affected.", "sources": ["A2"]},
    ]
    assert all(c.passed for c in checks.run(points, PASSAGES))


def test_numbers_names_and_quotes_must_be_in_the_cited_excerpt_not_just_any():
    points = [
        {"text": "The quake killed 1,300 people.", "sources": ["A1"]},
        {"text": "In Hatay, Erdogan met survivors.", "sources": ["A1"]},  # Erdogan is in A2
        {"text": 'He said "we will rebuild every home".', "sources": ["A2"]},
    ]
    r = by_name(checks.run(points, PASSAGES))
    assert r["numbers"].detail["problems"] == [{"point": 1, "number": "1300"}]
    assert r["names"].detail["problems"] == [{"point": 2, "name": "Erdogan"}]
    assert r["quotes"].detail["problems"][0]["quote"] == "we will rebuild every home"
    lines = feedback([c for c in r.values() if not c.passed])
    assert any("1300" in line for line in lines)
    assert any("Erdogan" in line for line in lines)


def test_citations_must_be_given_and_known_and_the_shape_sensible():
    r = by_name(checks.run([{"text": "Something.", "sources": ["A9"]}], PASSAGES))
    assert not r["citations"].passed
    assert not r["shape"].passed
    r = by_name(checks.run([{"text": "x", "sources": []}] * 3, PASSAGES))
    assert not r["citations"].passed


def test_curly_quotes_dashes_and_thousands_separators_are_read_alike():
    assert checks.numbers("1,204 and 3.5% on 19 Nov.") == {"1204", "3.5", "19"}
    assert checks.normalise("“rescue — work”") == '"rescue - work"'


def test_the_checker_model_must_support_every_point_and_loaded_words_must_be_its_own():
    points = [{"text": "Officials said aid arrived."}, {"text": "Rescuers searched."}]
    ok = {
        "points": [{"point": 1, "verdict": "supported"}, {"point": 2, "verdict": "supported"}],
        "loaded_words": ["slammed"],  # not in the summary: the checker read it in an excerpt
        "unattributed_claims": [],
    }
    assert _model_check(ok, points).passed
    ok["loaded_words"] = ["Rescuers"]
    assert not _model_check(ok, points).passed
    ok["loaded_words"] = []
    ok["points"][1]["verdict"] = "not_supported"
    assert not _model_check(ok, points).passed
    assert not _model_check({"points": [{"point": 1, "verdict": "supported"}]}, points).passed
    assert not _model_check(None, points).passed


NOW = datetime(2026, 11, 19, 12, tzinfo=UTC)


def art(i, source_id, tier, lean, kind="news", snippet="x"):
    return Article(
        i, source_id, f"S{source_id}", tier, lean, kind, f"T{i}", snippet, NOW - timedelta(hours=i)
    )


def test_eligibility_needs_three_reputable_outlets_a_tier_one_and_two_leans():
    good = [art(1, 1, 1, "center"), art(2, 2, 2, "lean_left"), art(3, 3, 2, "lean_right")]
    assert eligibility.check(good, set()).eligible
    # Opinion and tier 3 don't count.
    weak = [*good[:2], art(3, 3, 3, "lean_right"), art(4, 4, 2, "right", kind="opinion")]
    assert eligibility.check(weak, set()).reason == "1 more independent reputable source(s)"
    no_wire = [art(1, 1, 2, "center"), art(2, 2, 2, "lean_left"), art(3, 3, 2, "right")]
    assert "wire service" in eligibility.check(no_wire, set()).reason
    one_side = [art(1, 1, 1, "lean_left"), art(2, 2, 2, "left"), art(3, 3, 2, "lean_left")]
    assert "lean group" in eligibility.check(one_side, set()).reason
    # Sensitive topics need four.
    assert not eligibility.check(good, {"elections"}).eligible


def test_passages_take_one_per_outlet_tier_one_first_and_mix_leans():
    arts = [
        art(1, 1, 1, "center", snippet="short"),
        art(2, 1, 1, "center", snippet="longer one"),
        art(3, 2, 2, "lean_left"),
        art(4, 3, 2, "lean_left"),
        art(5, 4, 2, "right"),
        art(6, 5, 3, "right"),
    ]
    chosen = eligibility.passages(arts)
    assert chosen[0].id == 1  # the outlet's newest report (art 1 is an hour newer than art 2)
    assert len({a.source_id for a in chosen}) == len(chosen) == 4  # tier 3 left out
    assert {eligibility.LEAN_GROUP[a.lean] for a in chosen[:3]} == {"centre", "left", "right"}


def test_passages_leave_out_reports_overtaken_by_newer_coverage():
    # Art i is i hours old: art 60 is from 2.5 days before the newest report.
    arts = [art(1, 1, 1, "center"), art(2, 2, 2, "lean_left"), art(60, 3, 2, "right")]
    assert [a.id for a in eligibility.passages(arts)] == [1, 2]


def name_problems(text, cited):
    r = by_name(checks.run([{"text": text, "sources": ["A1"]}] * 2, {"A1": cited}))
    return sorted({p["name"] for p in r["names"].detail["problems"]})


def test_names_allow_titles_first_names_adjectives_and_spelled_out_abbreviations():
    cited = (
        "Reuters: Trump and Vance meet U.S. allies. Iran and Israel trade strikes; "
        "the UN calls for calm."
    )
    assert name_problems("President Donald Trump met Vice President JD Vance.", cited) == []
    assert name_problems("The United States said Iranian and Israeli forces clashed.", cited) == []
    assert name_problems("The United Nations called for calm.", cited) == []


def test_names_still_catch_people_and_places_the_excerpts_never_mention():
    cited = "Reuters: Trump meets allies in Paris."
    assert name_problems("Joe Biden met allies in Paris.", cited) == ["Biden", "Joe"]
    assert name_problems("Trump told DealBook he met allies.", cited) == ["DealBook"]
    assert name_problems("The European Union met in Paris.", cited) == ["European", "Union"]
    # A name at the start of a sentence counts when it's more than one word.
    assert name_problems("Emmanuel Macron hosted Trump.", cited) == ["Emmanuel", "Macron"]


# Real failures from the first live week (Nov 2026 review), each a false alarm, not invention.


def passing(text, cited):
    return all(c.passed for c in checks.run([{"text": text, "sources": ["A1"]}] * 2, {"A1": cited}))


def test_the_excerpt_date_the_writer_sees_can_be_used():
    from verilo_workers.summarize.prompts import passage_text

    a = Article(
        1,
        1,
        "BBC News",
        1,
        "center",
        "news",
        "Talks end",
        "Talks ended.",
        datetime(2026, 11, 24, 9, 30, tzinfo=UTC),
    )
    assert passing("Talks ended on 24 November 2026.", passage_text(a))


def test_invisible_characters_and_punctuation_inside_quotes_are_ignored():
    cited = "RTE: The region is on the ⁠verge of triggering open war, officials said."
    assert passing('Officials said the region is on the "verge of triggering open war."', cited)
    cited = 'Guardian: Residents felt a "sense of hope alongside uncertainty" on Monday.'
    assert passing(
        'Residents described a "sense of hope alongside uncertainty," the Guardian said.', cited
    )
    assert checks.invisible("Neb​al") == "Nebal"


def test_spelled_out_names_adjectives_and_abbreviations_of_cited_names_pass():
    assert passing("The United States and American officials met.", "AP: U.S. officials met.")
    assert passing("French officials spoke.", "Le Monde: France's officials spoke.")
    assert passing("The SCMP reported it.", "South China Morning Post: It happened.")
    assert passing("The ICJ ruled.", "Reuters: The International Court of Justice ruled.")
    assert not passing("Officials said Dutch ships left.", "Le Monde: France's ships left.")


def test_a_story_that_keeps_failing_is_rested():
    from verilo_workers.summarize.run import _due

    row = {"last_status": None, "failed_recently": 2}
    assert not _due(row, [], NOW)
    assert _due({**row, "failed_recently": 1}, [], NOW)


def test_outlets_running_the_same_agency_copy_count_as_one_source():
    wire = (
        "Rescuers pulled 12 people from the rubble after the quake struck the coastal city at dawn."
    )
    copies = [
        art(
            1, 1, 1, "center", snippet="Officials said the death toll rose overnight to 30 people."
        ),
        art(2, 2, 2, "lean_left", snippet=wire),
        art(3, 3, 2, "center", snippet=wire + " More soon."),
        art(
            4, 4, 2, "lean_right", snippet="(Reuters) - Power was cut across the region on Monday."
        ),
        art(5, 5, 2, "right", snippet="Schools closed (Reuters) as aftershocks continued."),
    ]
    groups = eligibility.sources(copies)
    assert sorted(len(g) for g in groups) == [1, 2, 2]
    # Five outlets, three independent sources; agency copy counts as centre, so no right lean.
    verdict = eligibility.check(copies, set())
    assert verdict.outlets == 3
    assert "another lean group" in verdict.reason
    # The writer gets one excerpt per source.
    assert len(eligibility.passages(copies)) == 3
    assert eligibility.agency(copies[3]) == "Reuters"
