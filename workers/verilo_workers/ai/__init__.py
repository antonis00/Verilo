"""The AI layer: one way to call a language model, whatever the provider.

Each job ("role") picks its provider and model in the environment, so switching is a settings
change, not a code change:

    VERILO_AI_WRITER=groq:openai/gpt-oss-120b     # writes story summaries
    VERILO_AI_CHECKER=groq:qwen/qwen3.8-27b       # checks them (a different model)
    VERILO_AI_TAGGER=ollama:gemma4:e4b            # tags topics (Phase 4b)

Providers: groq, ollama, openrouter, openai, lmstudio (all through the OpenAI-compatible chat
API) and anthropic (through the official SDK). Keys come from <PROVIDER>_API_KEYS, which may hold
several comma-separated keys: they are rotated when one hits a rate limit.
"""

from verilo_workers.ai.client import AIError, Completion, RateLimited, complete

__all__ = ["AIError", "Completion", "RateLimited", "complete"]
