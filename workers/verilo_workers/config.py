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

# Where to tell the web app that stories changed, so new ones appear at once (POST, with the
# same secret as the app's REVALIDATE_SECRET). Without a secret, no ping is sent and the app
# picks up new stories within about a minute anyway.
REVALIDATE_URL = os.environ.get("VERILO_REVALIDATE_URL", "http://localhost:3001/api/revalidate")
REVALIDATE_SECRET = os.environ.get("VERILO_REVALIDATE_SECRET", "")

# The daily briefing: every BRIEFING_EVERY minutes the pipeline asks the app to send the
# briefings that are due (POST, with the app's BRIEFING_SECRET). Without a secret, none are sent.
BRIEFING_URL = os.environ.get("VERILO_BRIEFING_URL", "http://localhost:3001/api/briefing/run")
BRIEFING_SECRET = os.environ.get("VERILO_BRIEFING_SECRET", "")
BRIEFING_EVERY = 15
