"""Calling a model for a job, whatever the provider (see verilo_workers/ai/__init__.py)."""

import json
import re
import time
from dataclasses import dataclass

import httpx

from verilo_workers.ai import config
from verilo_workers.ai.keys import AllKeysResting, KeyPool, fingerprint, parse_wait
from verilo_workers.common.http import ssl_context

REMOTE_TIMEOUT = 90.0
LOCAL_TIMEOUT = 300.0  # a laptop running the model on its processor is slow


class AIError(Exception):
    """The model couldn't be used for this job (bad reply, refused, unreachable)."""


class RateLimited(AIError):
    """Every key for the provider is resting; try the job again later."""

    def __init__(self, wait_seconds: float):
        super().__init__(f"rate-limited for about {wait_seconds:.0f} s")
        self.wait_seconds = wait_seconds


@dataclass(frozen=True)
class Completion:
    text: str
    data: dict | None  # the JSON object in the reply, when JSON was asked for
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def label(self) -> str:
        return f"{self.provider}:{self.model}"


_pools: dict[str, KeyPool] = {}


def _pool(p: config.Provider, model: str) -> KeyPool:
    """One pool per provider and model: providers like Groq count each model's limits apart, so
    a key that hit one model's limit can still be used for another."""
    name = f"{p.name}:{model}"
    if name not in _pools or len(_pools[name]) != len(p.keys):
        _pools[name] = KeyPool(p.keys)
    return _pools[name]


_LIMIT = re.compile(r"on ([\w ()]+?): Limit (\d+)")


def limit_reason(text: str) -> str:
    """Which limit a 429 was for ("tokens per minute (TPM) 8000"), without account details."""
    m = _LIMIT.search(text or "")
    return f" ({m.group(1)} {m.group(2)})" if m else ""


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def clean(text: str) -> str:
    """The answer without reasoning a model printed in <think> tags."""
    return _THINK.sub("", text or "").strip()


def first_json_object(text: str) -> dict | None:
    """The first complete {...} in a reply, ignoring code fences and words around it."""
    text = clean(text)
    start = text.find("{")
    while start != -1:
        depth, in_string, escaped = 0, False, False
        for i in range(start, len(text)):
            ch = text[i]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
            elif ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        value = json.loads(text[start : i + 1])
                        return value if isinstance(value, dict) else None
                    except json.JSONDecodeError:
                        break
        start = text.find("{", start + 1)
    return None


def complete(
    role_name: str,
    system: str,
    user: str,
    *,
    max_tokens: int = 1500,
    want_json: bool = True,
    transport: httpx.BaseTransport | None = None,
) -> Completion:
    """One answer from the model configured for `role_name` ("writer", "checker", "tagger")."""
    role = config.role(role_name)
    if role.provider.kind == "anthropic":
        return _anthropic(role, system, user, max_tokens, want_json)
    return _openai_compatible(role, system, user, max_tokens, want_json, transport)


def _openai_compatible(role, system, user, max_tokens, want_json, transport) -> Completion:
    p = role.provider
    body: dict = {
        "model": role.model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": 0,
    }
    if want_json:
        body["response_format"] = {"type": "json_object"}
    if role.reasoning:
        body["reasoning_effort"] = role.reasoning
    timeout = LOCAL_TIMEOUT if p.local else REMOTE_TIMEOUT
    pool = _pool(p, role.model) if p.keys else None
    attempts = (len(pool) if pool else 1) + 1
    server_errors = 0

    with httpx.Client(timeout=timeout, verify=ssl_context(), transport=transport) as http:
        for _ in range(attempts + 1):
            state = None
            headers = {}
            if pool:
                try:
                    state = pool.pick()
                except AllKeysResting as exc:
                    raise RateLimited(exc.wait_seconds) from None
                headers["Authorization"] = f"Bearer {state.key}"
            try:
                response = http.post(f"{p.base_url}/chat/completions", json=body, headers=headers)
            except httpx.HTTPError as exc:
                raise AIError(f"{p.name} unreachable: {type(exc).__name__}") from None
            if state:
                pool.note_headers(state, response.headers)
            if response.status_code == 429 and state:
                wait = parse_wait(response.headers.get("retry-after") or response.text)
                pool.rest(state, wait)
                print(
                    f"{p.name} key {fingerprint(state.key)} resting {wait:.0f} s for "
                    f"{role.model}{limit_reason(response.text)}",
                    flush=True,
                )
                continue
            if response.status_code >= 500 and server_errors == 0:
                server_errors += 1
                time.sleep(2)
                continue
            if response.status_code >= 400:
                raise AIError(f"{p.name} said {response.status_code}: {response.text[:300]}")
            payload = response.json()
            choice = (payload.get("choices") or [{}])[0]
            text = clean((choice.get("message") or {}).get("content") or "")
            usage = payload.get("usage") or {}
            data = first_json_object(text) if want_json else None
            if want_json and data is None:
                reason = choice.get("finish_reason")
                raise AIError(f"{role.model} gave no JSON (finish reason {reason})")
            return Completion(
                text=text,
                data=data,
                provider=p.name,
                model=role.model,
                input_tokens=int(usage.get("prompt_tokens") or 0),
                output_tokens=int(usage.get("completion_tokens") or 0),
            )
    raise RateLimited(60)


def _anthropic(role, system, user, max_tokens, want_json) -> Completion:
    import anthropic

    pool = _pool(role.provider, role.model)
    instruction = "\n\nAnswer with one JSON object and nothing else." if want_json else ""
    for _ in range(len(pool) + 1):
        try:
            state = pool.pick()
        except AllKeysResting as exc:
            raise RateLimited(exc.wait_seconds) from None
        client = anthropic.Anthropic(api_key=state.key, timeout=REMOTE_TIMEOUT, max_retries=0)
        try:
            # Current Claude models think adaptively before answering; the allowance leaves room.
            message = client.messages.create(
                model=role.model,
                max_tokens=max_tokens * 4,
                system=system + instruction,
                messages=[{"role": "user", "content": user}],
            )
        except anthropic.RateLimitError as exc:
            pool.rest(state, parse_wait(exc.response.headers.get("retry-after")))
            continue
        except anthropic.APIStatusError as exc:
            raise AIError(f"anthropic said {exc.status_code}: {exc.message[:300]}") from None
        except anthropic.APIConnectionError:
            raise AIError("anthropic unreachable") from None
        if message.stop_reason == "refusal":
            raise AIError("the model declined this request")
        text = clean("".join(b.text for b in message.content if b.type == "text"))
        data = first_json_object(text) if want_json else None
        if want_json and data is None:
            raise AIError(f"{role.model} gave no JSON (stop reason {message.stop_reason})")
        return Completion(
            text=text,
            data=data,
            provider="anthropic",
            model=role.model,
            input_tokens=message.usage.input_tokens,
            output_tokens=message.usage.output_tokens,
        )
    raise RateLimited(60)
