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

Sign-in emails go to the local mail catcher at http://127.0.0.1:54324.

## Checks

```sh
cd apps/web && npm run check             # lint, types, format, unit, build, end-to-end, Lighthouse
cd workers && python -m venv .venv && .venv/bin/pip install -e ".[dev]" && .venv/bin/pytest
```
