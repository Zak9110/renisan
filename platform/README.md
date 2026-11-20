# Renisan platform

The Next.js platform from the build kit: verified opportunities feed, explainable matching, accounts,
editor console and Telegram alerts. It is built beside the live admissions checker in `../renisan/`,
which keeps serving students until its logic is ported here in M6.

Specs are in `docs/` (source of truth). Agent instructions are in `AGENTS.md` and `.agents/rules/`.
Current status and open founder decisions: `docs/STEP1-ANALYSIS.md`.

## Run locally

Needs Node 22.18+ and pnpm 10 (`corepack enable`, or prefix commands with `npx pnpm@10`).
No Postgres install is needed: local dev and tests use PGlite, an in-process Postgres.

```bash
pnpm install
cp .env.example .env.local     # DATABASE_URL=pglite://./.pglite by default
pnpm db:migrate && pnpm db:seed
pnpm dev                       # http://localhost:3000 redirects to /ar
```

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test   # required before any task is done
pnpm e2e                                   # builds, starts and checks all four locales (first run: pnpm exec playwright install chromium)
```

## Database

- `src/db/schema.ts` is the Phase 1 schema. `src/db/schema-phase2.ts` is not migrated until Phase 1 sign-off.
- After changing the schema run `pnpm db:generate` and commit the new file in `drizzle/`.
- `drizzle/0000_extensions.sql` enables `pg_trgm` and `unaccent`. The managed Postgres host must support both.
- The publish guard (hard rule 2) is a database `CHECK`, so no code path can publish an unverified listing.

## Environment

`src/lib/env.ts` validates every variable at boot and names the bad variable, never its value.
`APP_ENV=production` turns on the strict checks: no placeholder secrets, no console SMS, no PGlite.
Production builds must set `APP_ENV`.
