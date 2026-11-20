# ARCHITECTURE

## Decisions

| Area      | Choice                                                                                                          | Why                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Framework | Next.js App Router, TypeScript strict                                                                           | Founder's stack; SSR/ISR for SEO and speed                           |
| i18n      | next-intl, `[locale]` segment, 4 locales                                                                        | RTL + LTR support                                                    |
| Styling   | Tailwind with logical properties                                                                                | One stylesheet for both directions                                   |
| DB        | PostgreSQL + Drizzle                                                                                            | SQL-first, light, good for reference data                            |
| Search    | Postgres full-text (`simple` config) + `pg_trgm` + `unaccent`                                                   | No Arabic/Kurdish stemmer needed for MVP; typo tolerance via trigram |
| Auth      | Phone OTP (Iraq) + email OTP (abroad), server sessions                                                          | Low email use in target users                                        |
| SMS       | `SmsProvider` interface; OTPIQ implementation (VERIFY current pricing/API); console provider in dev             | Local delivery to Asiacell/Zain/Korek                                |
| Bot       | grammY, webhook route with secret token                                                                         | Telegram is a daily-use channel                                      |
| Payments  | `PaymentProvider` interface: ZainCash, FastPay, manual (VERIFY merchant onboarding needs a registered business) | Local rails only                                                     |
| Jobs      | Cron route handlers (expiry sweep, digests, reminders)                                                          | No extra infra                                                       |
| PWA       | Serwist; cache app shell, listing lists, saved items                                                            | Flaky connectivity                                                   |
| Hosting   | Vercel + managed Postgres in closest EU region (VERIFY latency from Iraq)                                       | Simple; revisit Cloudflare/Hetzner later                             |
| Analytics | Plausible or Umami                                                                                              | Privacy-respecting                                                   |
| Errors    | Sentry (optional)                                                                                               | Scrub PII                                                            |

## Request flow

Browser -> Next.js (RSC) -> Drizzle -> Postgres. Telegram -> `/api/telegram/webhook` -> same service layer. Cron -> `/api/cron/*` (auth by secret).

## Layers

- `src/db`: schema, migrations.
- `src/lib/*`: domain logic (eligibility, listings, orders, auth, sms, payments, telegram). No framework imports in pure logic.
- `src/app`: thin pages and route handlers calling services.

## i18n

Locales `ar`, `ckb`, `kmr`, `en`. DB text is jsonb `{ar,ckb,kmr,en}`; fallback `en` then first available. UI strings in `messages/*.json`. See `.agents/rules/10-i18n-rtl.md`.

## Offline and performance

- Cache listing index and saved items for offline reads. Show "last updated" and an offline badge.
- Images minimal; WebP/AVIF; no autoplay media.
- Budget: list page initial JS under ~150 KB gzip. Check with Lighthouse on throttled mobile.

## Security

- zod on every input. Rate limits on OTP, submissions, reports, order creation.
- CSRF protection on mutations, secure httpOnly cookies, CSP.
- Uploads (verification docs, proofs): private storage, signed URLs, size/type limits, auto-delete policy.
- Role checks in services, not only in UI. Roles: member, helper, editor, admin.
- Audit log for editor/admin actions and payment state changes.

## Environments

`local`, `preview` (per PR), `production`. Separate DBs. `.env.example` lists every variable; zod validates at boot.

## Things to VERIFY before relying on them

OTPIQ API/pricing and sender approval; ZainCash/FastPay merchant requirements (a registered business is required); hosting latency from Iraq; legal registration for paid services (KRG LLC vs NGO structure). Do not hardcode prices or rates from this file.
