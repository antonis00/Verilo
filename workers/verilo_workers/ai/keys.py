"""Rotating several API keys for one provider.

Each key has its own rate limits (requests and tokens per minute and per day). When a key is
refused for a rate limit, it rests for as long as the provider said and the next key is used.
The pool also prefers the key with the most room left this minute, from the provider's
x-ratelimit-* headers, so load spreads before any key is refused.

Keys are only ever identified by a short fingerprint in logs, never shown.
"""

import hashlib
import re
import threading
import time
from dataclasses import dataclass


def fingerprint(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:8]


@dataclass
class KeyState:
    key: str
    resting_until: float = 0.0
    tokens_left: int | None = None  # this minute, from the last response's headers


class AllKeysResting(Exception):
    def __init__(self, wait_seconds: float):
        super().__init__(f"every key is rate-limited for about {wait_seconds:.0f} s")
        self.wait_seconds = wait_seconds


class KeyPool:
    def __init__(self, keys: tuple[str, ...], clock=time.monotonic):
        self._states = [KeyState(k) for k in keys]
        self._clock = clock
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._states)

    def pick(self) -> KeyState:
        """The usable key with the most room left; raises AllKeysResting if none is usable."""
        with self._lock:
            now = self._clock()
            ready = [s for s in self._states if s.resting_until <= now]
            if not ready:
                raise AllKeysResting(min(s.resting_until for s in self._states) - now)
            # Unknown room counts as plenty: a key not used yet this minute.
            return max(ready, key=lambda s: s.tokens_left if s.tokens_left is not None else 10**9)

    def rest(self, state: KeyState, seconds: float) -> None:
        with self._lock:
            state.resting_until = self._clock() + max(1.0, seconds)

    def note_headers(self, state: KeyState, headers) -> None:
        left = headers.get("x-ratelimit-remaining-tokens")
        if left is not None and str(left).isdigit():
            state.tokens_left = int(left)


_DURATION = re.compile(r"(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?")


def parse_wait(text: str | None, default: float = 60.0) -> float:
    """Seconds from a retry-after header ("20") or a provider's duration ("1m2.5s", "350ms")."""
    if not text:
        return default
    text = text.strip()
    try:
        return float(text)
    except ValueError:
        pass
    m = _DURATION.fullmatch(text)
    if not m or not any(m.groups()):
        found = re.search(r"try again in ([0-9hms.]+)", text)
        return parse_wait(found.group(1).rstrip("."), default) if found else default
    h, mi, s, ms = m.groups()
    return int(h or 0) * 3600 + int(mi or 0) * 60 + float(s or 0) + float(ms or 0) / 1000
