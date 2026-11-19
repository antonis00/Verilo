from verilo_workers.common.snippet import MAX_SNIPPET, make_snippet


def test_empty_input_gives_empty_snippet():
    assert make_snippet(None) == ""
    assert make_snippet("") == ""


def test_markup_and_entities_are_removed():
    raw = "<p>Prices rose <b>3%</b> in October &amp; November.</p>\n<img src='x.jpg'>"
    assert make_snippet(raw) == "Prices rose 3% in October & November."


def test_short_text_is_kept_whole():
    assert make_snippet("A short line.") == "A short line."


def test_long_text_is_cut_at_a_word_and_never_exceeds_the_limit():
    body = " ".join(["word"] * 500)
    snippet = make_snippet(body)
    assert len(snippet) <= MAX_SNIPPET
    assert snippet.endswith("word…")


def test_a_full_article_in_the_feed_becomes_a_snippet():
    article = "<div>" + "<p>Paragraph of reporting with many details.</p>" * 200 + "</div>"
    assert len(make_snippet(article)) <= MAX_SNIPPET
