"""Settings from the environment, with local-development defaults."""

import os

# The local Supabase database (`npx supabase start`). Workers write as the database owner, so
# row-level security doesn't apply to them; never point this at production from a laptop.
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

# Every request says who is asking and where to read about it.
USER_AGENT = os.environ.get(
    "VERILO_USER_AGENT", "VeriloBot/0.1 (+https://github.com/antonis00/Verilo)"
)

# How many feeds are fetched at once (one at a time per site).
CONCURRENCY = int(os.environ.get("VERILO_FETCH_CONCURRENCY", "8"))
