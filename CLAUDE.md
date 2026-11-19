# Verilo: project context

A personalised English-language newspaper, web first (mobile later), built by one developer. It groups articles about the same event into **stories**, ranks stories per reader, and shows checked AI summaries that cite their sources. Free trial, then a subscription. The full design is in `docs/design.md`; the visual rules in `docs/style-guide.md`.

## Phases (stop for the owner's review after each: tests pass, commit, push)
1. Plan and scaffold: done.
2. Source ingestion: `sources` with trust tier and lean, scheduled RSS fetching, headline / snippet / link / date only. Seed wire services and major English papers.
3. Story grouping: embeddings plus time windows; flag opinion pieces so they never feed summaries.
4. AI summaries with checks: only with 3+ trusted outlets of different leans; a second model checks each summary against the snippets; any failure shows headlines and links only and is logged.
5. Personal feed and digest: onboarding (topics, sources), ranked feed, daily digest page, a free-trial flag on accounts.

## Non-negotiable rules
- **Never store or show full article text.** Headline, a snippet of at most 400 characters (`workers/verilo_workers/common/snippet.py`, enforced again by the database), the outlet, the link and the date. No scraping past a feed, no paywall bypassing.
- **Never invent facts.** Every summary point names the source articles it came from and must be supported by their snippets. When outlets disagree, say who reports what. If a check fails, show headlines and links instead.
- **Opinion is never a source of facts.** Opinion, editorials and sponsored pieces are labelled and kept out of summaries.
- **Favour reputable, balanced sources.** Summaries use only Tier 1–2 outlets, including a wire service or public broadcaster and at least two lean groups. Lean labels are shown to readers.
- **Label AI text** as "AI summary", with a link to each source within one tap.

## Stack
- `apps/web`: Next.js **16** (App Router, TypeScript strict, Cache Components and Partial Prefetching on), Tailwind v4 with only our tokens, Supabase via `@supabase/ssr`. Next 16 differs from older versions: read `apps/web/node_modules/next/dist/docs/` before using an API (see `apps/web/AGENTS.md`). In particular:
  - Middleware is `proxy.ts` (`lib/supabase/proxy.ts` refreshes the session and guards `/my-news`).
  - Anything that reads cookies, headers or `searchParams` must sit inside `<Suspense>`, or the build fails. Pages are a static shell with the reader's parts streamed in; keep it that way (don't await the session at the top of a layout).
  - Who the reader is comes only from `lib/auth.ts` (`getReader`, `requireReader`). Every page and server action checks the session itself; the proxy check is only a shortcut.
- `supabase/`: local Supabase (CLI 3.2, pinned in the root `package.json`, Postgres 17). Database changes only as SQL in `supabase/migrations/`. Row-level security on every table readers touch. Unused services are off in `config.toml`. Local emails go to Mailpit (http://127.0.0.1:54324).
- Sign-in: an emailed link (`supabase/templates/magic_link.html`) to `/auth/confirm`, which verifies the token hash on the server (`verifyOtp`). `lib/safe-next.ts` keeps redirects on this site.
- `workers/`: Python 3.12+ package `verilo_workers` (ingest, enrich, cluster, summarize, common). Plain `venv` + `pip install -e ".[dev]"`; Ruff and pytest.
- Models (when used, phases 3–4): Claude Haiku 5.5 (`claude-haiku-5-5`) for tagging and writing summaries, Claude Sonnet 5.5 (`claude-sonnet-5-5`) to check them, through the official `anthropic` Python SDK. Embeddings: local `fastembed` (`bge-small-en-v1.5`, 384 dimensions), the owner's choice (Nov 2026); keep the embedding call behind one function so Voyage could replace it if grouping quality measured on real headlines falls short.

## Run and test
```powershell
npm install; npm run db:start                 # repo root: local Supabase (needs Docker Desktop running)
cd apps/web; npm install; copy .env.example .env.local   # fill the key from `npx supabase status`
npm run dev                                   # http://localhost:3001
npm run check                                 # lint, types, format, unit tests, build, e2e, Lighthouse
npm test; npm run test:e2e; npm run lighthouse  # separately (e2e and Lighthouse need `npm run build` first)
cd workers; python -m venv .venv; .venv\Scripts\pip install -e ".[dev]"; .venv\Scripts\python -m pytest; .venv\Scripts\python -m ruff check .
```
- Unit tests (Vitest, `apps/web/tests/unit`) include `contrast.test.ts` (WCAG contrast of every token pair, both themes) and `design-rules.test.ts` (no gradients, blur, shadows, rounding over 2px, emoji or hex colours outside `globals.css`).
- E2E (Playwright, installed Chrome, desktop and phone, `apps/web/tests/e2e`) runs against `npm run start` on port 3100 and the local Supabase: real sign-in through Mailpit, axe in light and dark, no sideways scroll, security headers.
- Lighthouse CI (`lighthouserc*.json`, port 3200): mobile and desktop, performance / best practices / SEO 95+, accessibility 100, mobile LCP under 1.8 s.
- Every feature needs unit or worker tests, and anything on screen needs an e2e step with an axe check.

## Design rules (see `docs/style-guide.md`)
- Editorial, not SaaS: Newsreader for headlines, Public Sans for text, ink on warm paper, one oxblood accent. 12-column grid, 1200px, rules and whitespace between stories, not cards.
- Never: purple or indigo, gradients, glassmorphism or blur, drop shadows, corners over 2px, emoji icons, Tailwind or shadcn defaults (the default palette, scale, radii and shadows are cleared in `globals.css`), colours outside the tokens, endless scroll, autoplay.
- Server Components by default; client JavaScript only where a page needs interaction. Fonts through `next/font` (served from the site). Every interactive element keyboard-reachable with the accent focus outline; 44px touch targets; respect `prefers-reduced-motion`.

## Conventions
- Write plain, short interface text; errors say what happened and what to do.
- Secrets only in `.env.local` (never committed). The local publishable key is public by design; service keys never reach the browser.
- Commits use the per-repo identity `antonis00 <antonis00@users.noreply.github.com>`; never a company name or email. Remote: https://github.com/antonis00/Verilo.
- Don't add author or credit lines to files.
