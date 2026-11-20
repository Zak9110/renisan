# FEATURES — PHASE 1 (build this first)

Goal: a trustworthy, fast, trilingual feed of verified opportunities, matched to each student, with Telegram alerts. Free forever.

## F1. Public opportunity feed

- List page with filters: type, level, field, country, funding, deadline window, "Iraqis eligible" (default: yes + unclear, never hides "no" without a toggle).
- Sorting: deadline soon, newest verified. Never sorted by payment.
- Opportunity page: summary, funding, who can apply, **Iraqi eligibility block** (yes/no/unclear + notes), required documents, deadline in Asia/Baghdad, source link, "last verified" date, report button, share card.
- Expired items disappear from lists; the page shows an "expired" banner and links to similar open items.
- SEO: server-rendered, localized metadata, canonical per locale, sitemap, structured data where applicable.

## F2. Explainable matching

- Pure function `matchOpportunity(profile, opportunity, rules) -> { verdict: GO|MAYBE|NO_GO, reasons[], missing[] }`.
- Rules: failed mandatory rule -> NO_GO. Unknown required field -> MAYBE with the missing field named. All mandatory rules pass and nothing unknown -> GO. Optional preference rules only affect ordering inside the same verdict.
- UI shows a plain-language why ("Requires GPA 80%+; yours is 84%") and "add X to your profile to confirm".
- 100% unit tested, including edge cases (ranges, age at deadline, missing data, multiple mandatory rules).

## F3. Accounts and profile

- Phone OTP login (Iraq numbers) via `SmsProvider`; email OTP as alternative. Rate limits, hashed codes, 5-minute expiry, 5 attempts.
- Minimal profile wizard (under 2 minutes): level, field, GPA, English, governorate, country, birth year. All optional except level. Show why each field helps matching.
- Under-18 handling: mark as minor from birth year; apply minor restrictions from `.agents/rules/00-hard-rules.md`.
- Account export (JSON) and delete.

## F4. Saved items and tracker

- Save, mark applied, mark "got it", dismiss. Simple dashboard: upcoming deadlines, saved, applied.
- "I got it" outcome prompt with optional short tip (moderated) for later success stories.

## F5. Alerts

- **Telegram bot** (grammY): link account via one-time code; daily/weekly digest of GO/MAYBE matches; deadline reminders 7 and 2 days before; `/language`, `/stop`, `/saved`.
- Notification preferences page. Respect quiet hours (default 22:00–08:00 Asia/Baghdad).
- Email digest optional (later).

## F6. Submit and report

- Anyone can submit an opportunity (needs source link); lands in the editor queue.
- Report button on every listing: scam / expired / wrong info. 3 independent reports auto-hide pending review.

## F7. Editor/admin console (non-developers must be able to run it)

- Queue of submitted/in-review items with checklist: official source? fee asked from applicant? guarantee/"exclusive" claims? Iraqi eligibility determined? deadline verified?
- Structured editor for fields and `eligibility_rules` with translations side by side (ar / ckb / kmr / en) and a "needs review" flag per language.
- Duplicate detection hint (same provider + similar title/deadline).
- Bulk import from CSV (never auto-publish; imports land as drafts).
- Expiry sweeper (cron): mark expired, hide, notify savers once.
- Freshness dashboard: median listing age, listings not re-checked in 30 days, open reports.
- Audit log of every change.

## F8. Admissions eligibility checker (Phase 1b)

- No login required: student enters baccalaureate average, stream, governorate, (optional) gender/channel -> list of departments where last year's minimum was at or below their average, grouped by university, with year, source and confidence.
- Always show "indicative only, not a guarantee" and the data year/source.
- Federal system first from published minimum-average PDFs; KRG added later with `confidence` labels. Data ingested through the admin console (CSV import with review), not scraped live.
- Includes a plain explainer of the federal vs KRG systems and key deadlines (editors maintain; link official portals).

## F9. Localization and accessibility

- ar, ckb, kmr, en. RTL/LTR correct. Language switcher persistent. Native review flags.
- WCAG AA contrast, keyboard navigable, readable at 200% zoom, tap targets at least 44px.

## F10. PWA and performance

- Installable PWA, offline cache for lists and saved items, "last updated" indicator.
- Lighthouse mobile (throttled) performance 85+, JS budget per `docs/ARCHITECTURE.md`.

## Acceptance criteria for Phase 1

- A new user can sign up by phone OTP, finish the profile, see matched opportunities with reasons, save one, and receive a Telegram reminder.
- An editor with no coding skill can submit, verify, translate and publish a listing, and expired listings disappear automatically.
- Eligibility engine has full test coverage for the listed edge cases.
- Pages pass RTL/LTR visual checks in all four locales.
- No listing can be published without sourceUrl, deadline/rolling and iraqiEligibility.
- Rate limits and OTP security tests pass. No PII in logs.
