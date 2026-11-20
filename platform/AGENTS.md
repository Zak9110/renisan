# AGENTS.md — Renisan

Renisan (working name) is an **Iraqi-only platform, mainly for students**:

1. a curated, verified, eligibility-matched feed of scholarships, programs and opportunities,
2. peer application help: verified students help others apply, for a small fee,
3. later: ambassadors abroad, events, clubs (a movement).

Information is always free. Only personal help is paid. Trust beats volume.

Read in this order before coding: `docs/PRODUCT.md` -> `docs/ARCHITECTURE.md` -> `docs/DATA-MODEL.md` -> `docs/ROADMAP-TASKS.md`. Feature detail is in `docs/FEATURES-PHASE-1.md` and `docs/FEATURES-PHASE-2-3.md`. Trust rules are in `docs/SAFEGUARDING-TRUST.md` and `.agents/rules/`.

## Stack (decided, do not swap without asking)

- Next.js (App Router) + TypeScript (strict) + Tailwind CSS, package manager **pnpm**
- i18n: **next-intl**, locales `ar`, `ckb` (Sorani, RTL), `kmr` (Kurmanji, Latin, LTR), `en`
- DB: PostgreSQL + **Drizzle ORM** (`src/db/schema.ts` is the starting schema)
- Validation: **zod** everywhere input crosses a boundary
- Auth: server sessions with **phone OTP** (Iraq) and **email OTP** (abroad). SMS behind a `SmsProvider` interface (OTPIQ implementation + console provider for dev)
- Payments (Phase 2): behind a `PaymentProvider` interface (ZainCash, FastPay, manual). No Stripe for Iraqi users.
- Bot: **grammY** Telegram bot via webhook route
- PWA/offline: **Serwist**
- Tests: **vitest** (unit), **Playwright** (e2e incl. RTL + OTP flow)
- Hosting target: Vercel + managed Postgres (closest EU region). Jobs via cron routes.
- Analytics: privacy-respecting only (Plausible or Umami). No ad pixels.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm e2e`
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` (dev data only, clearly fake)
- Local dev and tests use PGlite (`DATABASE_URL=pglite://...`), so no Postgres install is needed. Production uses `postgres://`.
- The live admissions checker is `../renisan/` (Vite + Preact). Do not change it from platform tasks.

Run `typecheck`, `lint` and `test` before declaring any task done.

## Repo layout

```
src/app/[locale]/...      pages (public, member, helper, admin)
src/app/api/...           route handlers (telegram webhook, cron, payment webhooks)
src/db/                   schema.ts, migrations, seed
src/lib/eligibility/      matching engine (pure, fully tested)
src/lib/sms/ payments/ telegram/ auth/ i18n/
src/components/           UI (logical CSS props only)
messages/{ar,ckb,kmr,en}.json
docs/                     specs (source of truth)
```

## Hard rules (never break; details in `.agents/rules/00-hard-rules.md`)

1. **Never invent scholarship or admission data.** Seed data must be obviously fake (prefix `SAMPLE —`). Real data enters only through the editor workflow with a `sourceUrl`.
2. **Every listing needs `sourceUrl`, `deadline` or `rolling=true`, and `iraqiEligibility` (yes/no/unclear).** Listings past deadline auto-expire and leave all feeds.
3. **Match results are explainable:** GO / MAYBE / NO_GO with reasons and "what to add to confirm". Never a black box. Never rank by payment.
4. **Sponsored content is always labeled and never changes eligibility results or match order.**
5. **Minors (under 18): no open DMs, no public profiles, guardian consent before any paid or 1:1 service, no off-platform contact prompts.**
6. **Helpers coach; they never write applicants' essays.** No "guaranteed" claims anywhere. Enforce in UI copy, service creation and moderation.
7. **Collect the minimum.** No ethnicity, religion, or exact date of birth (use `birthYear`). Displacement/IDP status is optional, self-declared, used only for matching, never shown publicly.
8. **No secrets in the repo.** `.env.example` only. Validate env with zod at boot.
9. **Phone numbers, OTP codes, tokens and ID documents are never logged.**
10. **All user-facing strings go through i18n.** Use logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `text-start`) so RTL/LTR both work. Never hardcode left/right.

## Conventions

- TypeScript strict, no `any` without a comment. Prefer pure functions for logic; keep route handlers thin.
- Small, reviewable commits per task. One milestone at a time from `docs/ROADMAP-TASKS.md`.
- Server Components by default; client components only for interactivity.
- Performance budget: list page initial JS under ~150 KB gzip, works on slow mobile, cache reads for offline.
- Every new table gets an index review; every new endpoint gets zod validation and rate limiting.
- Dates stored UTC; render in `Asia/Baghdad`.
- i18n content for DB records is `jsonb` keyed by `ar|ckb|kmr|en`; fall back to `en` then any available.
- Write tests for: eligibility engine, OTP flow (rate limits), listing expiry, order state machine, i18n direction.

## Working method

1. Restate the milestone goal and acceptance criteria from `docs/ROADMAP-TASKS.md`.
2. Produce a short plan, then implement in small steps.
3. Add tests, run all checks, summarize what changed and what is still open.
4. If a requirement is ambiguous or needs a real-world decision (accounts, pricing, legal), **stop and ask the founder** instead of guessing. List such items under "Open questions" in your summary.

## Out of scope until told otherwise

Native mobile apps, open social feed, real-time chat/DMs, video calling inside the app, AI chatbot, scraping third-party sites, any Phase 2/3 work before Phase 1 acceptance criteria pass.
