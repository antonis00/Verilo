import pytest

from verilo_workers.enrich.kind import NEWS, OPINION, SPONSORED, classify

CASES = [
    # Real headlines and links seen in the feeds (Nov 2026).
    (
        "https://www.theguardian.com/commentisfree/2026/nov/17/the-guardian-view-on-climate",
        "The Guardian view on climate and debt: a vicious cycle the world must break",
        [],
        OPINION,
    ),
    (
        "https://www.nytimes.com/2026/11/18/opinion/trump-deportation-south-sudan.html",
        "Trump ‘Disappeared’ Them in 2025. I Found Them, Locked Up and Afraid",
        [],
        OPINION,
    ),
    (
        "https://www.thehindu.com/opinion/editorial/the-hindu-editorial-on-death-penalty.ece",
        "All-too fallible: On India’s vote against moratorium on death penalty",
        [],
        OPINION,
    ),
    (
        "https://www.nytimes.com/2026/11/18/arts/grand-theft-auto-vi-review.html",
        "G.T.A. 6 Review: This Release Will Steal Your Heart",
        [],
        OPINION,
    ),
    (
        "https://example.com/news/2026/11/19/letters",
        "Ending the war in Ukraine | Letters",
        [],
        OPINION,
    ),
    (
        "https://example.com/news/x",
        "Why the bill matters",
        ["Opinion"],
        OPINION,
    ),
    (
        "https://www.nbcnews.com/select/shopping/best-early-black-friday-deals-2026-rcna6",
        "Early Black Friday deals are here, and I’m tracking the 57+ best",
        [],
        SPONSORED,
    ),
    (
        "https://example.com/news/partner",
        "Sponsored: How one bank is rethinking savings",
        [],
        SPONSORED,
    ),
    # A topic tag is not a commercial label: this is an opinion column about shopping.
    (
        "https://www.theguardian.com/commentisfree/2026/nov/18/david-beckhams-perfume",
        "David Beckham's perfume, Poundland – and a mighty, mighty stink",
        ["Shopping", "Retail industry"],
        OPINION,
    ),
    # News that merely contains trigger-like words.
    (
        "https://www.theguardian.com/world/live/2026/nov/18/apec-summit-live-updates",
        "Apec summit as it happened: Xi welcomes Trump on China visit",
        ["World news"],
        NEWS,
    ),
    (
        "https://example.com/business/2026/budget-preview",
        "Previewing the budget: what to expect on Wednesday",
        [],
        NEWS,
    ),
    (
        "https://example.com/news/review-ordered",
        "Ministers order review of hospital waiting lists",
        [],
        NEWS,
    ),
]


@pytest.mark.parametrize(("url", "title", "tags", "expected"), CASES)
def test_classify(url, title, tags, expected):
    kind, reason = classify(url, title, tags)
    assert kind == expected
    assert (reason is None) == (expected == NEWS)


def test_every_decision_names_its_rule_in_plain_words():
    _, reason = classify("https://example.com/a", "The Times view on the budget", [])
    assert reason and "editorial" in reason
    assert "\\" not in reason  # no raw regular expressions on the desk
