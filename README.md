# Verilo

Your front page, from sources you trust. Verilo groups the articles that report the same event into
one story, ranks stories for each reader, and writes short summaries that cite their sources, checked
before anyone sees them. It shows headlines, short excerpts and links; it never republishes articles.

- Design and architecture: [docs/design.md](docs/design.md)
- Visual style: [docs/style-guide.md](docs/style-guide.md)

## Layout

| Folder | What |
|---|---|
| `apps/web` | The Next.js web app |
| `workers` | The Python news pipeline (ingestion, grouping, summaries) |
| `supabase` | Database migrations, local config and email templates |
| `docs` | Design documents |

## Getting started

Needs Node 22+, Python 3.12+ and Docker Desktop.

```sh
npm install && npm run db:start          # local Supabase; prints the keys
cd apps/web && npm install
cp .env.example .env.local               # paste the publishable key from `npx supabase status`
npm run dev                              # http://localhost:3001
```

Sign-in emails go to the local mail catcher at http://127.0.0.1:54324. New readers land on a
short welcome wizard (topics, places, outlets, what to show); settings are under My News.

## News ingestion

The outlets and their feeds are listed in [workers/data/sources.toml](workers/data/sources.toml),
each with its trust tier, political lean and the reason for both.

```sh
cd workers && python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m verilo_workers check-feeds          # try every feed, store nothing
.venv/bin/python -m verilo_workers sync-sources         # write the registry to the database
.venv/bin/python -m verilo_workers sync-topics          # write the topic list to the database
.venv/bin/python -m verilo_workers pipeline --loop      # every minute: fetch, enrich, group into stories
.venv/bin/python -m verilo_workers make-editor you@example.com   # open /desk for your account
```

Verilo stores only the headline, a short snippet, the link and the date of each article. Articles
about the same event are grouped into stories; opinion and sponsored pieces are labelled and never
used for summaries; topics are listed in [workers/data/topics.toml](workers/data/topics.toml).

## Checks

```sh
cd apps/web && npm run check             # lint, types, format, unit, build, end-to-end, Lighthouse
cd workers && python -m venv .venv && .venv/bin/pip install -e ".[dev]" && .venv/bin/pytest
```
