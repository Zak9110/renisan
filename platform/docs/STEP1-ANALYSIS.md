# Step 1 analysis (2026-11-18)

> **Status 2026-11-18.** Option 1 below was taken: the static app stays live and this platform is built beside it
> in `platform/`. M0 is done (see ROADMAP-TASKS.md). The schema changes in section 2 are applied in
> `src/db/schema.ts`, except Telegram Login (item 5), which still needs a founder decision.

Written against the build kit **and** the app that already exists in `renisan/`. The kit assumes an empty
folder; the repo is not empty. That changes the plan, so it comes first.

## 0. The repo already ships part of Phase 1

`renisan/` is a static Vite + Preact PWA (no backend). Tests (17 suites) and `tsc` pass.

| Kit item                                                       | Status in current app                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F8 / M6 admissions checker                                     | **Mostly done.** Official federal 2026-27 lists (1,263 general + 438 distinguished), 2025-26 and 2024-25 history with trends, evening/private rules. KRG 2024-25: 96 unofficial programmes. Import script for new PDFs. |
| F1 feed (partial)                                              | 16 hand-verified scholarships with source links and "last verified" dates. Static JSON, no editor workflow.                                                                                                             |
| F2 matching (partial)                                          | GPA / age matching on scholarships, but not GO / MAYBE / NO_GO with reasons.                                                                                                                                            |
| F9 i18n                                                        | `ar`, `ckb`, `kmr`. **No `en`.** Default is `ckb` (kit says `ar`). Logical CSS already used (0 physical left/right rules found).                                                                                        |
| F10 PWA                                                        | Done (vite-plugin-pwa, offline).                                                                                                                                                                                        |
| F3–F7 accounts, tracker, Telegram, submissions, editor console | Not started. Wishlist and `.ics` reminders exist locally in the browser.                                                                                                                                                |

**Founder decision needed before M0 (blocks everything):** the kit's stack (Next.js + Postgres + Drizzle +
next-intl) is a rewrite of this app. Options:

1. **Recommended: keep the static app live, build the platform beside it.** Ship `renisan/` now as the public
   checker. Scaffold the Next.js app in a sibling folder for M0–M5. Port the pure logic (`src/lib/search.ts`,
   `normalizer.ts`, `history.ts`, `places.ts`, translations) into it in M6 and retire the Vite app then.
2. Rewrite now. Nothing public until roughly M2; the admissions season hook is lost for a year.
3. Stay static and add a small backend only for Telegram and an editor. Cheapest, but drifts from the kit.

## 1. Product summary and top risks

Renisan is a free, Iraqi-only feed of verified scholarships and opportunities, each tagged with whether Iraqis
can apply. Each student gets an explained match (GO / MAYBE / NO_GO) against a minimal profile. Alerts arrive on
Telegram instead of demanding daily visits. A no-login admissions checker shows where last year's cut-offs sit
against a student's average. Later, verified students sell small coaching packages, and later still,
ambassadors and clubs grow it into a movement.

| #   | Risk                                                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Stale or wrong data destroys trust.** Today's scholarships carry _estimated_ next-cycle deadlines, which the hard rules forbid presenting as deadlines.                                                                                         | Add `deadlineStatus: confirmed \| estimated \| unknown`; estimated never counts as a deadline for publishing or reminders. Freshness dashboard from M3. Keep the catalogue small enough for one editor. |
| 2   | **Solo founder scope.** Ten milestones, two auth channels, four locales, CSV import, screenshot tests.                                                                                                                                            | Cut Phase 1 to the acceptance criteria only (see section 2). Ship the existing app now so something is live.                                                                                            |
| 3   | **Sorani / Kurmanji quality.** Kit forbids machine-only translations; no reviewer is named.                                                                                                                                                       | Name reviewers before M0 ends. Track unreviewed keys in `messages/*.review.json`. Launch `en` UI strings only if someone maintains them.                                                                |
| 4   | **Wrong admissions advice.** The KRG composite formula in the app (80/10/10 G12/G11/G10) contradicts zirek.org's 2026 description; KRG has no official cut-off table. Dentistry/Pharmacy minimum is 88 (Cabinet decision 570/2026) vs 90 (guide). | Hide or label the KRG calculator "unverified" until the official Zankoline guide is read. Store the newer 88% with its source. Keep "indicative only" everywhere.                                       |
| 5   | **Minors and paid help.** Most users are 17–18; payments need a registered business.                                                                                                                                                              | Phase 2 stays gated on legal entity, safeguarding focal person and partner organisation. No messaging of any kind in Phase 1.                                                                           |

## 2. Stack and schema review

### Stack: wrong, missing or heavy for one person

- **SMS OTP is the costliest and slowest dependency** (sender approval, per-message price, abuse). Proposal for
  approval: make **Telegram Login** the primary sign-in (free, already the alert channel, links the bot in the
  same step), with email OTP as fallback and phone OTP added later. Not changed without your go-ahead.
- **Rate limiting has no store.** Vercel functions are stateless. Either a Postgres `rate_limits` table or a
  managed Redis (Upstash). Postgres keeps it to one service.
- **Two full OTP channels in M1** double the security tests. Pick one for launch.
- **Playwright screenshots in four locales** (M5) and **Husky** are fine later; not worth it in M0.
- **CSV import and duplicate detection** (M3) can wait until there are more than ~50 listings a month.
- **Serwist** replaces work already done with vite-plugin-pwa; fine, but it is a port, not new work.
- **Search**: `pg_trgm` + `unaccent` need extensions enabled on the managed Postgres; check the host supports them.
- Missing: email provider choice, error tracking decision, backup policy for Postgres.

### Schema: concrete changes

1. `telegram_links`: incoming webhooks give a chat id, so you must **look it up**. Add `chatIdHash`
   (HMAC, unique index) next to the encrypted value. Add a `telegram_link_codes` table (code hash, user, expiry).
2. `opportunities`: add `deadlineStatus`, `hiddenAt` / `hiddenReason` (for 3-report auto-hide), `requiredDocuments`
   (i18n), `languageRequirements`, `sponsorId`, and a generated `search tsvector` column with GIN index. Use
   `text[]` instead of `jsonb` for `levels/fields/countries` so GIN filtering is simple.
3. Publish guard: add the promised DB `CHECK` constraint in the first migration, not later.
4. `opportunity_reports`: unique `(opportunityId, userId)` and a fingerprint for anonymous reports; otherwise
   "3 independent reports" can be one person.
5. `users`: `CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)`; add `telegramUserId` if Telegram Login is approved.
6. `sessions`: store a **hash** of the session token, add `lastSeenAt` and `userAgent` for rotation and logout-all.
7. `otp_codes`: add `purpose` and `channel`; index on `expiresAt` for the sweeper.
8. `profiles.gpaPercent`: federal averages exceed 100 (bonus for foreign language, e.g. 101.29). Allow up to
   ~110 or store the raw average. Age rules from `birthYear` alone are ±1 year: borderline cases must return
   MAYBE, never GO.
9. `cutoffs`: add `system` (doc has it, schema doesn't), a unique key per
   `(year, departmentId, stream, gender, studyType, channel)`, and align values with real data (`government`,
   `parallel`, `evening`, `distinguished`). Add `universities` and `colleges` tables or drop them from the doc.
10. Add `notification_prefs` and `digest_runs` (M4 needs both). Drop the separate `submissions` table: a submission
    is an `opportunities` row with `status = in_review` and `createdBy`.
11. Phase 2 tables (`helper_profiles`, `services`, `orders`): keep in the file but **don't migrate** them in M0.

## 3. VERIFY items and founder decisions

| Item                                                                                 | Blocks                                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **New: keep static app vs rewrite (section 0)**                                      | M0                                                                                     |
| 7. Hosting accounts and region; latency from Iraq (VERIFY)                           | M0 deploy and CI previews; M1 database                                                 |
| 1. Name, domain, logo                                                                | Public launch, canonical URLs and sitemap (M2); dev can proceed                        |
| 5. Sorani/Kurmanji reviewers                                                         | M0 "done" for UI strings; M3 publishing; Phase 1 acceptance                            |
| 6. OTPIQ account, key, current API and pricing (VERIFY)                              | M1 production only (console provider unblocks dev). Moot if Telegram Login is approved |
| New: Telegram Login as primary auth                                                  | M1                                                                                     |
| New: Telegram bot token and bot name                                                 | M4 (and M1 if Telegram Login)                                                          |
| 5b. Who verifies KRG cut-offs; KRG formula against official Zankoline guide (VERIFY) | M6 KRG part                                                                            |
| Federal Dentistry/Pharmacy 88 vs 90                                                  | M6 rules file                                                                          |
| 2. Legal structure; ZainCash/FastPay merchant accounts (VERIFY)                      | M7                                                                                     |
| 3. Platform fee and price caps                                                       | M7                                                                                     |
| 4. Safeguarding focal person and partner organisation                                | M7 launch and Phase 3 gate                                                             |
| Ambassador hub countries (VERIFY current numbers)                                    | M9                                                                                     |

## 4. Effort estimates

Assumes about 8–10 focused hours a week with an AI agent doing most typing, and the recommended option in section 0.

| Milestone                          | Hours                                 | Calendar             |
| ---------------------------------- | ------------------------------------- | -------------------- |
| M0 setup                           | 10–15                                 | 1–2 weeks            |
| M1 auth + profile                  | 20–30 (less with Telegram Login only) | 2–3 weeks            |
| M2 opportunities + matching engine | 30–40                                 | 3–4 weeks            |
| M3 editor console                  | 30–45                                 | 3–5 weeks            |
| M4 Telegram alerts                 | 15–25                                 | 2–3 weeks            |
| M5 PWA, performance, accessibility | 10–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10–15 port (40+ from scratch)         | 1–2 weeks            |
| **Phase 1 total**                  | **125–190**                           | **about 4–5 months** |

Translation review and data verification are on top of this and are the real long pole.
