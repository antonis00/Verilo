"""Which provider and model each AI job uses, read from the environment (and workers/.env)."""

import os
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Defaults: summaries on Groq (writer and checker are different model families, as the design
# requires), topics on the local Ollama model. Override any of them in workers/.env.
DEFAULT_ROLES = {
    "writer": "groq:openai/gpt-oss-120b",
    "checker": "groq:qwen/qwen3.8-27b",
    "tagger": "ollama:gemma4:e4b",
}


@dataclass(frozen=True)
class Provider:
    name: str
    kind: str  # "openai" (OpenAI-compatible chat API) or "anthropic"
    base_url: str
    keys: tuple[str, ...] = field(default_factory=tuple)
    local: bool = False  # on this machine or network: longer timeouts, no key needed


@dataclass(frozen=True)
class Role:
    name: str
    provider: Provider
    model: str
    # Reasoning models think before answering; "none" turns it off where supported (Ollama's
    # gemma4 returns nothing with thinking on and a normal allowance), "low"/"medium"/"high" set
    # how much. Empty: the provider's default.
    reasoning: str = ""


PROVIDER_URLS = {
    "groq": ("openai", "https://api.groq.com/openai/v1", False),
    "openrouter": ("openai", "https://openrouter.ai/api/v1", False),
    "openai": ("openai", "https://api.openai.com/v1", False),
    "ollama": ("openai", "http://127.0.0.1:11434/v1", True),
    "lmstudio": ("openai", "http://127.0.0.1:1234/v1", True),
    "anthropic": ("anthropic", "https://api.anthropic.com", False),
}


def _env() -> None:
    load_dotenv(ENV_FILE, override=False)


def _keys(provider: str) -> tuple[str, ...]:
    raw = os.environ.get(f"{provider.upper()}_API_KEYS") or os.environ.get(
        f"{provider.upper()}_API_KEY", ""
    )
    return tuple(k.strip() for k in raw.split(",") if k.strip() and k.strip() != "my_api_key")


def provider(name: str) -> Provider:
    _env()
    if name not in PROVIDER_URLS:
        raise ValueError(f"unknown AI provider {name!r}; known: {', '.join(PROVIDER_URLS)}")
    kind, url, local = PROVIDER_URLS[name]
    base = os.environ.get(f"{name.upper()}_BASE_URL", url).rstrip("/")
    return Provider(name=name, kind=kind, base_url=base, keys=_keys(name), local=local)


@cache
def role(name: str) -> Role:
    """The provider and model for a job, e.g. role("writer")."""
    _env()
    spec = os.environ.get(f"VERILO_AI_{name.upper()}", DEFAULT_ROLES.get(name, ""))
    if ":" not in spec:
        raise ValueError(f"VERILO_AI_{name.upper()} must look like provider:model, not {spec!r}")
    provider_name, model = spec.split(":", 1)
    reasoning = os.environ.get(f"VERILO_AI_{name.upper()}_REASONING", "")
    if not reasoning and provider_name == "ollama":
        reasoning = "none"
    p = provider(provider_name)
    if not p.local and not p.keys:
        raise ValueError(
            f"{provider_name} needs a key: set {provider_name.upper()}_API_KEYS in workers/.env"
        )
    return Role(name=name, provider=p, model=model, reasoning=reasoning)


def describe(name: str) -> str:
    r = role(name)
    return f"{r.provider.name}:{r.model}"
