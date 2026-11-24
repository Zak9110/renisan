# Renisan platform

Full-stack Next.js 16 (App Router, TypeScript strict, Tailwind v4, Drizzle ORM, PostgreSQL/PGlite) platform covering all milestones **M0–M9**:

- **Phase 1 (M0–M6):** 4-locale RTL/LTR UI (`ar`, `ckb`, `kmr`, `en`), phone (OTPIQ) & email (Resend) OTP + Telegram Login auth, explainable `GO / MAYBE / NO_GO` eligibility matching, custom saved lists + document checklists + monthly calendar + subscribable `.ics` WebCal feed, public submissions, 3-report auto-hide, Editor Review Console with 4-locale editor & CSV imports, 24h automated source harvesting & expiry sweeper, Telegram Bot webhook + 7d/2d deadline reminders & Baghdad quiet hours, offline PWA + Service Worker, and no-login Federal (MOHESR) + KRG (Zankoline) admissions cutoffs checker.
- **Phase 2 (M7–M8):** Verified coaching helpers (30-day proof auto-delete), banned-phrase coaching rules, order state machine with 72h auto-confirm, manual/ZainCash/FastPay payment provider adapters, mandatory under-18 guardian consent, reviews, and separated `"Sponsored"` placements with anonymous aggregate stats.
- **Phase 3 (M9):** Verified adult-only ambassadors abroad, moderated public Q&A with pseudonym support (no open DMs), adult-to-adult double-opt-in introductions, external Zoom/YouTube/Meet events with registration & replays, and moderated clubs.

Specs are in `docs/`. Agent & safeguarding rules are in `AGENTS.md` and `.agents/rules/`.

## Run locally

Needs Node 22.18+ (`npm` or `pnpm`). No Postgres install is needed: local dev and tests use PGlite.

```bash
npm install
cp .env.example .env.local              # DATABASE_URL=pglite://./.pglite by default
npm run db:migrate
npm run db:import-scholarships          # imports verified scholarships from ../renisan/public/data/scholarships.json
npm run db:import-cutoffs               # imports verified Federal & KRG cutoffs from ../renisan/public/data/
npm run dev                             # http://localhost:3000 redirects to /ar
```

For clearly fake demo data instead of real verified datasets, run `npm run db:seed`.

## Verification checks

```bash
npm run format:check && npm run typecheck && npm run lint && npm test
APP_ENV=test npm run build
npm run e2e                             # runs Playwright mobile Chromium tests across all 4 locales
```

## Production launch checklist

1. Set production environment variables (`APP_ENV=production`, `DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `CRON_SECRET`, `SMS_PROVIDER=otpiq` + `OTPIQ_API_KEY`, `EMAIL_PROVIDER=resend` + `EMAIL_FROM` + `EMAIL_API_KEY`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` + `TELEGRAM_WEBHOOK_SECRET` + `TELEGRAM_CHATID_ENCRYPTION_KEY`).
2. Enable Postgres extensions (`pg_trgm`, `unaccent`) and run `npm run db:migrate`, `npm run db:import-scholarships`, and `npm run db:import-cutoffs`.
3. Register the Telegram webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\":\"${APP_URL}/api/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\"}"
   ```
4. `vercel.json` runs `/api/cron/daily` daily at `06:00 UTC` (`09:00 Asia/Baghdad`, outside default quiet hours) to expire passed deadlines, harvest official sources into `in_review`, dispatch 7d/2d Telegram reminders & digests, auto-confirm 72h delivered orders, and purge verification proofs older than 30 days.
   Users whose quiet hours cover 09:00 Baghdad get alerts from the hourly workflow `.github/workflows/alerts.yml`. It needs the GitHub secrets `PLATFORM_URL` and `CRON_SECRET`, and does nothing until both are set. Repeats are safe: each alert is sent once per user.
5. Helpers, orders and community are off (404) unless `NEXT_PUBLIC_PHASE2_ENABLED=true` at build time. Turn it on only after Phase 1 sign-off.
6. Complete native speaker review of the drafted Sorani (`ckb`) and Kurmanji (`kmr`) strings tracked in `messages/*.review.json`.
