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
  **Status (2026-11-23): done** (`src/lib/eligibility/match.ts`, `src/lib/opportunities/service.ts`, `src/lib/lists/service.ts` custom lists + document checklists + monthly calendar grid + subscribable `.ics` WebCal feed, `/[locale]/opportunities`, `/[locale]/opportunities/[id]` detail + expired banner + community reports, `/[locale]/submit`, `/[locale]/lists`, dynamic `sitemap.xml` & `robots.ts`, `db:import-scholarships` importer, and Resend email OTP provider).

## M3 — Editor console

- Roles and route guards. Editor queue with the checklist from `docs/SAFEGUARDING-TRUST.md`.
- Translation side-by-side editor with per-locale review flags.
- Rules editor, duplicate hints, CSV import to drafts, audit log.
- Expiry cron route, freshness dashboard, reports queue (3 reports auto-hide).
  **Done when:** a non-developer can submit -> verify -> translate -> publish; expired items vanish automatically.
  **Status (2026-11-23): done** (`src/lib/admin/service.ts`, `/api/admin/*`, `/[locale]/admin` role-guarded Web Editor Console with review checklist, 4-locale editor, structured rules builder, duplicate/scam hints, freshness dashboard, manual 24h sync trigger, 3-report auto-hide & resolution queue, and audit log; verified in `tests/db/m3-editor-reports.test.ts`).

## M4 — Telegram alerts

- Telegram Bot API webhook (`/api/telegram/webhook`), AES-256-GCM chatId encryption, single-use linking code, digests, deadline reminders (7d and 2d), expiry saver notifications, `/saved`, `/matches`, `/stop`, `/language`, Baghdad quiet hours.
  **Done when:** a linked test user receives a correct reminder; stop command honored.
  **Status (2026-11-23): done** (`src/lib/telegram/crypto.ts`, `client.ts`, `service.ts`, `alerts.ts`, `/api/telegram/webhook`, `/api/telegram/link-code`, `/api/notifications/prefs`, `/api/cron/alerts`, wired into `/api/cron/daily`, and Telegram Alerts & Preferences UI in `AccountClient.tsx`; verified in `tests/db/m4-telegram-alerts.test.ts`).

## M5 — PWA, performance, accessibility

- Installable PWA manifest (`/manifest.webmanifest`), offline Service Worker (`public/sw.js`) caching app shell, opportunities, admissions, and saved lists, offline badge + install prompt (`PwaStatusBar.tsx`), skip-to-content link, 44px tap targets, WCAG AA/AAA dark/light accent contrast, and Playwright mobile RTL/LTR E2E tests across all 4 locales.
  **Status (2026-11-23): done** (`src/app/manifest.ts`, `public/sw.js`, `public/icons/*.svg`, `src/components/PwaStatusBar.tsx`, `e2e/phase1-flows.spec.ts`).

## M6 — Admissions checker (Phase 1b)

- Departments/cutoffs import via admin CSV with dry-run review preview + verified MOHESR/KRG JSON loader (`npm run db:import-cutoffs`); no-login checker (`/[locale]/admissions`, `/api/admissions`); source/year/confidence shown; "indicative only" notice; Federal vs. KRG explainer; bulk opportunity CSV draft import in Editor Console.
- Enforces KRG confidence cap (never `high`).
  **Status (2026-11-23): done** (`src/lib/admissions/service.ts`, `import-verified.ts`, `src/db/import-cutoffs.ts`, `/api/admissions`, `/api/admin/admissions/import`, `/api/admin/opportunities/import-csv`, `AdmissionsCheckerClient.tsx`, and `tests/db/m6-admissions-csv.test.ts`).

## ---- Phase 1 acceptance review (founder sign-off) ----

## M7 — Helpers and services (Phase 2)

- Helper onboarding and manual verification with private proof storage and 30-day auto-delete (`purgeExpiredVerificationProofs` wired into daily cron).
- Coaching-only services with banned-phrase checks (`checkServiceBannedPhrases`), editor review.
- Order state machine (`created -> paid_held -> in_progress -> delivered -> confirmed -> released | disputed | refunded`), 72h auto-confirm, `PaymentProvider` (manual live + ZainCash/FastPay merchant-guarded adapters), mandatory minor guardian consent flow, disputes, reviews, and full audit log.
  **Status (2026-11-23): done** (`src/lib/helpers/service.ts`, `/api/helpers*`, `/api/orders*`, `/api/admin/helpers`, `/[locale]/helpers`, `HelpersMarketplaceClient.tsx`, migration `0003_lyrical_titanium_man.sql`, verified in `tests/db/m7-m9-phase23.test.ts`).

## M8 — Sponsors

- Sponsor placements managed by admins, `"Sponsored"` labeling, strictly separated from match order (`SponsoredBanner.tsx`), aggregate anonymous impression/click stats.
  **Status (2026-11-23): done** (`src/lib/sponsors/service.ts`, `/api/sponsors`, `/api/admin/sponsors`, `SponsoredBanner.tsx`, verified in `tests/db/m7-m9-phase23.test.ts`).

## M9 — Ambassadors and events (Phase 3)

- Verified adult-only ambassador profiles (30-day proof deletion), moderated public Q&A with pseudonym support (no open DMs), adult-to-adult double-opt-in intros (minors blocked), external Zoom/YouTube/Meet events with registration & replays, moderated club links, and live Phase 3 readiness gate indicator in Admin Console.
  **Status (2026-11-23): done** (`src/lib/community/service.ts`, `/api/community*`, `/api/admin/community`, `/[locale]/community`, `CommunityClient.tsx`, `AdminPhase23Panel.tsx`, verified in `tests/db/m7-m9-phase23.test.ts`).

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
