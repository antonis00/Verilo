"""Readers' own sources without the database: the address guard, Telegram's public page, finding
a website's feed."""

from datetime import UTC, datetime

import pytest

from verilo_workers.own import telegram
from verilo_workers.own.run import feed_link
from verilo_workers.own.safety import UnsafeAddress, check_url

NOW = datetime(2026, 11, 24, 12, tzinfo=UTC)


def resolver(*addresses):
    return lambda host, port: [(2, 1, 6, "", (a, port)) for a in addresses]


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/feed",  # not https
        "https://example.com:8443/feed",  # another port
        "https://127.0.0.1/feed",
        "https://10.0.0.5/feed",
        "https://169.254.169.254/latest/meta-data",  # cloud metadata
        "https://[::1]/feed",
        "https://localhost/feed",
        "https://db.internal/feed",
        "file:///etc/passwd",
    ],
)
def test_private_or_odd_addresses_are_refused(url):
    with pytest.raises(UnsafeAddress):
        check_url(url, resolve=resolver("93.184.215.14"))


def test_a_host_resolving_to_a_private_address_is_refused():
    with pytest.raises(UnsafeAddress):
        check_url("https://sneaky.example.com/feed", resolve=resolver("93.184.215.14", "10.1.2.3"))


def test_a_public_host_is_allowed():
    check_url("https://example.com/feed.xml", resolve=resolver("93.184.215.14"))


def test_a_host_that_doesnt_resolve_is_refused():
    def fails(host, port):
        raise OSError("no such host")

    with pytest.raises(UnsafeAddress):
        check_url("https://nowhere.example/feed", resolve=fails)


PAGE = """<html><head><meta property="og:title" content="Example &amp; News"></head><body>
<div class="tgme_channel_info_header_title"><span dir="auto">Example &amp; News</span></div>
<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="examplenews/10">
  <time class="message_video_duration js-message_video_duration">0:31</time>
  <div class="tgme_widget_message_footer"><time datetime="2026-11-24T09:00:00+00:00" class="time">09:00</time></div>
</div>
<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="examplenews/11">
  <div class="tgme_widget_message_text js-message_text" dir="auto"><b>Parliament passes the budget</b><br/>The vote was 210 to 180 after a <a href="https://example.com">long debate</a>.</div>
  <div class="tgme_widget_message_footer"><time datetime="2026-11-24T10:30:00+00:00" class="time">10:30</time></div>
</div>
<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="examplenews/3">
  <div class="tgme_widget_message_text js-message_text" dir="auto">An old post</div>
  <time datetime="2026-10-01T10:30:00+00:00" class="time">Oct 1</time>
</div>
</body></html>"""  # noqa: E501


def test_telegram_posts_become_headlines_with_their_links_and_times():
    channel = telegram.parse(PAGE, NOW, max_age_days=14)
    assert channel.title == "Example & News"
    assert channel.posts == [
        telegram.Post(
            "https://t.me/examplenews/11",
            "Parliament passes the budget",
            "The vote was 210 to 180 after a long debate.",
            datetime(2026, 11, 24, 10, 30, tzinfo=UTC),
        )
    ]  # the video without text and the old post are left out


def test_a_long_first_line_is_cut_into_a_headline_and_the_rest():
    words = " ".join(["word"] * 80)
    title, rest = telegram._headline(words)
    assert len(title) <= 201 and title.endswith("…")
    assert rest.startswith("word")


def test_a_websites_feed_is_found_from_its_alternate_link():
    page = b"""<html><head>
      <link rel="stylesheet" href="/a.css">
      <link rel="alternate" type="application/rss+xml" title="News" href="/feeds/news.xml">
    </head></html>"""
    assert feed_link(page, "https://example.com/news") == "https://example.com/feeds/news.xml"
    assert feed_link(b"<html></html>", "https://example.com/") is None
    insecure = b'<link rel="alternate" type="application/atom+xml" href="http://example.com/a">'
    assert feed_link(insecure, "https://example.com/") is None
