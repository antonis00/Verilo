"""The AI layer offline: provider choice from settings, key rotation on rate limits, replies
read safely. httpx's MockTransport stands in for the provider."""

import json

import httpx
import pytest

from verilo_workers.ai import RateLimited, client, complete, config
from verilo_workers.ai.keys import KeyPool, fingerprint, parse_wait


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setenv("VERILO_AI_WRITER", "groq:model-a")
    monkeypatch.setenv("VERILO_AI_CHECKER", "groq:model-b")
    monkeypatch.setenv("GROQ_API_KEYS", "key-one, key-two,key-three")
    monkeypatch.setenv("GROQ_BASE_URL", "https://groq.test/v1")
    config.role.cache_clear()
    client._pools.clear()
    yield
    config.role.cache_clear()
    client._pools.clear()


def reply(content, status=200, headers=None):
    body = {
        "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }
    return httpx.Response(status, json=body, headers=headers or {})


def limited(wait="2"):
    text = {
        "error": {
            "message": "Rate limit reached for model `m` in organization `org_x` on "
            "tokens per minute (TPM): Limit 8000, Used 7000. Please try again in 2s."
        }
    }
    return httpx.Response(429, json=text, headers={"retry-after": wait})


def test_settings_choose_provider_and_model_and_keys_come_from_a_list():
    r = config.role("writer")
    assert (r.provider.name, r.model, r.provider.keys) == (
        "groq",
        "model-a",
        ("key-one", "key-two", "key-three"),
    )
    assert config.describe("checker") == "groq:model-b"


def test_ollama_needs_no_key_and_has_thinking_off(monkeypatch):
    monkeypatch.setenv("VERILO_AI_TAGGER", "ollama:gemma4:e4b")
    r = config.role("tagger")
    assert (r.model, r.reasoning, r.provider.local) == ("gemma4:e4b", "none", True)


def test_a_cloud_provider_without_keys_is_refused(monkeypatch):
    monkeypatch.setenv("VERILO_AI_WRITER", "openrouter:some/model")
    monkeypatch.delenv("OPENROUTER_API_KEYS", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ValueError, match="OPENROUTER_API_KEYS"):
        config.role("writer")


def test_a_rate_limited_key_rests_and_the_next_one_answers():
    used = []

    def handler(request):
        key = request.headers["Authorization"].removeprefix("Bearer ")
        used.append(key)
        body = json.loads(request.content)
        assert body["model"] == "model-a" and body["temperature"] == 0
        return limited() if len(used) == 1 else reply('Sure: {"answer": "blue"}')

    out = complete("writer", "sys", "user", transport=httpx.MockTransport(handler))
    assert out.data == {"answer": "blue"} and out.label == "groq:model-a"
    assert len(set(used)) == 2  # the second call went to another key


def test_every_key_resting_raises_rate_limited_with_the_wait():
    transport = httpx.MockTransport(lambda r: limited("30"))
    with pytest.raises(RateLimited) as caught:
        complete("writer", "sys", "user", transport=transport)
    assert 25 < caught.value.wait_seconds <= 30


def test_limits_are_per_model_so_a_key_tired_for_one_model_serves_another():
    def handler(request):
        model = json.loads(request.content)["model"]
        return limited("30") if model == "model-a" else reply('{"ok": true}')

    transport = httpx.MockTransport(handler)
    with pytest.raises(RateLimited):
        complete("writer", "s", "u", transport=transport)
    assert complete("checker", "s", "u", transport=transport).data == {"ok": True}


def test_reasoning_is_stripped_and_json_found_inside_fences():
    text = '<think>hmm {"no": 1}</think>\n```json\n{"points": [{"text": "a } b"}]}\n```'
    out = complete("writer", "s", "u", transport=httpx.MockTransport(lambda r: reply(text)))
    assert out.data == {"points": [{"text": "a } b"}]}


def test_a_reply_without_json_is_an_error_not_a_guess():
    from verilo_workers.ai import AIError

    with pytest.raises(AIError, match="no JSON"):
        complete("writer", "s", "u", transport=httpx.MockTransport(lambda r: reply("Sorry.")))


def test_the_pool_prefers_the_key_with_most_room_and_waits_are_read():
    pool = KeyPool(("a", "b"), clock=lambda: 0.0)
    a, b = pool._states
    pool.note_headers(a, {"x-ratelimit-remaining-tokens": "100"})
    pool.note_headers(b, {"x-ratelimit-remaining-tokens": "5000"})
    assert pool.pick() is b
    assert parse_wait("1m2.5s") == 62.5 and parse_wait("350ms") == 0.35
    assert parse_wait("Please try again in 7.2s.") == 7.2 and parse_wait(None) == 60
    assert client.limit_reason(limited().text) == " (tokens per minute (TPM) 8000)"
    assert len(fingerprint("secret")) == 8 and "secret" not in fingerprint("secret")
