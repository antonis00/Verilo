from datetime import UTC, datetime

from verilo_workers.common.snippet import MAX_SNIPPET
from verilo_workers.ingest.parse import canonical_url, content_hash, parse_feed

NOW = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)

FULL_TEXT = "<p>" + "Every paragraph of the full article. " * 400 + "</p>"

RSS = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Example</title>
  <item>
    <title>Parliament passes &lt;b&gt;budget&lt;/b&gt; bill</title>
    <link>https://example.com/news/budget?utm_source=rss&amp;utm_medium=feed&amp;id=7#top</link>
    <description>&lt;p&gt;The bill passed 310 to 290 on Tuesday.&lt;/p&gt;</description>
    <content:encoded><![CDATA[{FULL_TEXT}]]></content:encoded>
    <pubDate>Wed, 19 Nov 2026 09:30:00 GMT</pubDate>
  </item>
  <item>
    <title>Parliament passes budget bill</title>
    <link>https://example.com/news/budget?id=7</link>
    <description>Duplicate link once tracking is removed.</description>
    <pubDate>Wed, 19 Nov 2026 09:30:00 GMT</pubDate>
  </item>
  <item>
    <title>Long feature</title>
    <link>https://example.com/news/feature</link>
    <description>{"A very long description that is really the whole article. " * 40}</description>
    <pubDate>Wed, 19 Nov 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Scheduled post with a future date</title>
    <link>https://example.com/news/future</link>
    <pubDate>Fri, 21 Nov 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>No date at all</title>
    <link>https://example.com/news/undated</link>
  </item>
  <item>
    <title>Last month's news</title>
    <link>https://example.com/news/old</link>
    <pubDate>Sun, 19 Oct 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Not a web link</title>
    <link>javascript:alert(1)</link>
    <pubDate>Wed, 19 Nov 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>""".encode()

ATOM = b"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom example</title>
  <entry>
    <title>Atom headline</title>
    <link href="https://example.org/a/1"/>
    <updated>2026-11-19T10:00:00Z</updated>
    <summary>Atom summary.</summary>
  </entry>
</feed>"""


def by_url(items):
    return {i.url: i for i in items}


def test_only_headline_snippet_link_and_date_are_kept():
    items = by_url(parse_feed(RSS, now=NOW))
    budget = items["https://example.com/news/budget?id=7"]
    assert budget.title == "Parliament passes budget bill"
    assert budget.snippet == "The bill passed 310 to 290 on Tuesday."
    assert budget.published_at == datetime(2026, 11, 19, 9, 30, tzinfo=UTC)
    # The full text in content:encoded is never used, not even for the snippet.
    for item in items.values():
        assert "full article" not in item.snippet
        assert len(item.snippet) <= MAX_SNIPPET


def test_tracking_parameters_and_fragments_are_removed_and_duplicates_dropped():
    urls = [i.url for i in parse_feed(RSS, now=NOW)]
    assert urls.count("https://example.com/news/budget?id=7") == 1
    assert not any("utm_" in u or "#" in u for u in urls)


def test_a_whole_article_in_the_description_is_cut_to_a_snippet():
    feature = by_url(parse_feed(RSS, now=NOW))["https://example.com/news/feature"]
    assert len(feature.snippet) <= MAX_SNIPPET
    assert feature.snippet.endswith("…")


def test_future_dates_become_now():
    future = by_url(parse_feed(RSS, now=NOW))["https://example.com/news/future"]
    assert future.published_at == NOW


def test_undated_old_and_non_web_items_are_skipped():
    urls = set(by_url(parse_feed(RSS, now=NOW)))
    assert "https://example.com/news/undated" not in urls
    assert "https://example.com/news/old" not in urls
    assert not any(u.startswith("javascript") for u in urls)
    assert len(urls) == 3


def test_atom_feeds_work():
    [item] = parse_feed(ATOM, now=NOW)
    assert item.url == "https://example.org/a/1"
    assert item.snippet == "Atom summary."


def test_garbage_gives_no_items():
    assert parse_feed(b"<html><body>Not a feed</body></html>", now=NOW) == []
    assert parse_feed(b"", now=NOW) == []


def test_canonical_url():
    assert (
        canonical_url("HTTPS://Example.COM/a?b=1&utm_campaign=x#c") == "https://example.com/a?b=1"
    )
    assert canonical_url("https://example.com") == "https://example.com/"
    assert canonical_url("mailto:news@example.com") is None
    assert canonical_url("https://example.com/" + "x" * 3000) is None


def test_content_hash_ignores_punctuation_and_case_but_not_the_day():
    day = datetime(2026, 11, 19, 9, 0, tzinfo=UTC)
    next_day = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
    assert content_hash("Budget passes!", day) == content_hash("budget passes", day)
    assert content_hash("Budget passes", day) != content_hash("Budget passes", next_day)
