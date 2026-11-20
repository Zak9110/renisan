# ROADMAP AND TASKS

Work one milestone at a time. Each milestone ends with: all checks green (`pnpm typecheck && pnpm lint && pnpm test`), a short summary, and an "Open questions" list for the founder.

## M0 — Project setup

- Scaffold Next.js (App Router, TS strict, Tailwind), pnpm, ESLint, Prettier, vitest, Playwright, Husky pre-commit.
- Add next-intl with locales `ar`, `ckb`, `kmr`, `en`; direction map; self-hosted fonts; locale cookie.
- Env validation with zod; `.env.example` already provided.
- Drizzle config, apply `src/db/schema.ts`, first migration, `db:seed` with clearly fake `SAMPLE —` data.
- CI workflow: typecheck, lint, test.
  **Done when:** app runs, four locales render with correct direction, glyph test string renders in `ar` and `ckb`.
  **Status (2026-11-18): done**, except Husky. Pre-commit hooks are skipped because the git repo also holds the live
  checker app, and repo-wide hooks would change its workflow. CI runs the same checks on every push. Local dev uses
  PGlite instead of a Postgres install. Sorani and Kurmanji UI strings await native review (`messages/*.review.json`).

## M1 — Auth and profile

- `SmsProvider` interface, console provider, OTPIQ provider (behind env flag; ask founder for key and current API docs).
- Phone OTP + email OTP, hashed codes, 5-min expiry, 5 attempts, per-phone and per-IP rate limits.
- Server sessions, logout, account export and delete.
- Profile wizard (level required, rest optional), minor detection from `birthYear`.
  **Done when:** OTP tests pass (rate limit, expiry, reuse), no PII in logs.
  **Status (2026-11-20): done** (OTP service + rate limits + OTPIQ provider + Telegram Login HMAC verifier + sessions + account export/delete + `/[locale]/account` UI + `tests/db/auth-lists.test.ts`).

## M2 — Opportunities and matching engine

- Opportunity CRUD service with publish guard (sourceUrl, deadline or rolling, iraqiEligibility, verified fields).
- `src/lib/eligibility/match.ts` pure engine returning verdict, reasons, missing fields.
- Public list and detail pages with filters, SEO metadata, expiry banner.
- Saved/applied/got_it tracker.
  **Done when:** engine unit tests cover: mandatory fail, unknown field -> MAYBE, ranges, age at deadline, multiple rules, expired exclusion.
  **Status (2026-11-20): core done** (`src/lib/eligibility/match.ts`, `src/lib/opportunities/service.ts`, `src/lib/lists/service.ts` custom lists + deadlines + subscribable `.ics` WebCal feed, `src/lib/ingestion/daily.ts` + `/api/cron/daily` 24h sync, `/[locale]/opportunities` and `/[locale]/lists` pages, unit + DB tests green). Detail pages, sitemap, and report flow remain for M2/M3 polish.

## M3 — Editor console

- Roles and route guards. Editor queue with the checklist from `docs/SAFEGUARDING-TRUST.md`.
- Translation side-by-side editor with per-locale review flags.
- Rules editor, duplicate hints, CSV import to drafts, audit log.
- Expiry cron route, freshness dashboard, reports queue (3 reports auto-hide).
  **Done when:** a non-developer can submit -> verify -> translate -> publish; expired items vanish automatically.

## M4 — Telegram alerts

- grammY webhook, account linking code, digests, deadline reminders (7d and 2d), `/stop`, `/language`, quiet hours.
  **Done when:** a linked test user receives a correct reminder; stop command honored.

## M5 — PWA, performance, accessibility

- Serwist caching for lists and saved items, offline badge, install prompt.
- Lighthouse mobile budget, WCAG AA pass, RTL/LTR visual tests (Playwright screenshots in all 4 locales).

## M6 — Admissions checker (Phase 1b)

- Departments/cutoffs import via admin CSV with review; no-login checker; source/year/confidence shown; "indicative only" notice.
- Start with federal data; KRG data enters with confidence labels. Ask the founder for the source PDFs and who will verify them.

## ---- Phase 1 acceptance review (founder sign-off) ----

## M7 — Helpers and services (Phase 2)

- Helper onboarding and manual verification with private proof storage and auto-delete.
- Services with banned-phrase checks, editor review.
- Order state machine, `PaymentProvider` (manual first, then ZainCash/FastPay after the founder confirms merchant accounts), guardian consent flow, disputes, reviews.

## M8 — Sponsors

- Sponsor placements managed by admins, "Sponsored" labeling, separation from match order, aggregate anonymous stats.

## M9 — Ambassadors and events (Phase 3, after gates in FEATURES-PHASE-2-3.md)

- Verified ambassador profiles, moderated public Q&A, double-opt-in intros, events with registration, club links.

## Always-on tasks

- Keep `messages/*.json` in sync; list untranslated keys.
- Update `docs/` when decisions change.
- Never commit secrets. Never add dependencies without a one-line justification.

## Founder decisions needed (agent must ask, not guess)

1. Final product name, domain, and logo.
2. Legal structure for paid services (company vs NGO) and merchant accounts for ZainCash/FastPay.
3. Platform fee percentage and package price caps.
4. Who is the safeguarding focal person and which partner organization.
5. Who verifies Sorani/Kurmanji translations and KRG cut-off data.
6. OTPIQ (or other SMS) account and API key.
7. Hosting accounts and region.
