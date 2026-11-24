# Verilo

A personal front page built from sources you trust. Verilo groups the articles that report the
same event into one story, shows how each outlet covered it, and writes short summaries that cite
their sources and are checked before anyone sees them. It shows headlines, short excerpts and
links; it never republishes articles.

## Stack

- **Web:** Next.js (`apps/web`)
- **Database and sign-in:** Supabase / Postgres (`supabase`)
- **News pipeline:** Python (`workers`): feeds, grouping, topics and checked summaries

## Run it locally

Needs Node 22+, Python 3.12+ and Docker Desktop.

```sh
npm install && npx supabase start                    # local database
cd apps/web && npm install
cp .env.example .env.local                           # fill in from `npx supabase status`
npm run dev                                          # http://localhost:3001

cd ../../workers && python -m venv .venv
.venv/bin/pip install -c requirements.lock -e ".[dev]"
cp .env.example .env                                 # AI provider and keys
.venv/bin/python -m verilo_workers sync-sources && .venv/bin/python -m verilo_workers sync-topics
.venv/bin/python -m verilo_workers pipeline --loop   # fetch, group and summarise every minute
```

Emails sent locally (sign-in links, briefings) appear at http://127.0.0.1:54324.

## Tests

```sh
cd apps/web && npm run check        # lint, types, unit, build, end-to-end, Lighthouse
cd workers && .venv/bin/python -m pytest
```
