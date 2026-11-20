# DATA MODEL

The Drizzle schema is `src/db/schema.ts`; this file explains intent. Changes made in M0 against the kit's
starting schema are listed in `docs/STEP1-ANALYSIS.md` section 2. The main ones:

- `opportunities.deadlineStatus` (`confirmed|estimated|unknown`). Only a confirmed deadline, or `rolling`, can publish.
- Publish guard, sponsored-needs-sponsor, KRG-never-high-confidence and contact/GPA/birth-year rules are DB `CHECK`s.
- Hashes instead of raw values: `sessions.tokenHash`, `otp_codes.targetHash`, `telegram_links.chatIdHash` (lookup) + encrypted chat id.
- New tables: `rate_limits`, `telegram_link_codes`, `notification_prefs`, `digest_runs`, `universities`.
- `opportunity_reports` has one report per user and per anonymous fingerprint per listing.
- `levels/fields/countries/needsReview/interests` are `text[]` with GIN indexes; `search_vector` and `search_text` are generated columns.
- No separate `submissions` table: a submission is an `opportunities` row with `status = in_review`.
- Phase 2 tables live in `src/db/schema-phase2.ts` and are not migrated yet.

## Core entities

- **users**: id, phone (unique, E.164, nullable), email (nullable), role (`member|helper|editor|admin`), locale, birthYear, isMinor (derived), guardianConsentAt, createdAt. Never store ethnicity, religion, exact DOB or national ID.
- **profiles**: userId, educationLevel (`grade12|undergrad|graduate|other`), field, gpaPercent or gpaScaled, englishLevel, englishTestType/score, governorate, currentCountry, university (free text + optional link), idpSelfDeclared (optional, private), interests[].
- **otp_codes**: target, codeHash, expiresAt, attempts, usedAt. Hash only.
- **sessions**: server sessions; rotate on login.

## Opportunities

- **opportunities**: id, type (`scholarship|exchange|fellowship|internship|competition|training|job`), title (jsonb i18n), summary (jsonb i18n), providerName, sourceUrl (required), applyUrl, deadline (nullable) + rolling (bool), status (`draft|in_review|published|expired|rejected|removed`), iraqiEligibility (`yes|no|unclear`), levels[], fields[], countries[], fundingType (`full|partial|stipend|none`), costToApplicant (nullable, with currency), language requirements, notes (jsonb i18n), verifiedBy, verifiedAt, lastCheckedAt, expiresAt, sponsored (bool), sponsorId, createdBy.
- **eligibility_rules**: opportunityId, field (e.g. `nationality`, `educationLevel`, `gpaPercent`, `age`, `englishScore`, `fieldOfStudy`, `residence`, `idp`), operator (`eq|in|gte|lte|between|exists`), value (jsonb), mandatory (bool), explanation (jsonb i18n), source note.
- **opportunity_reports**: opportunityId, userId, reason (`scam|expired|wrong_info|other`), note, status.
- **user_opportunity**: userId, opportunityId, state (`saved|applied|got_it|rejected|dismissed`), updatedAt, outcome note.
- **submissions**: user-submitted opportunities waiting for editors (same fields, status `in_review`).

## Admissions (Phase 1b)

- **universities**, **colleges**, **departments**: system (`federal|krg|private`), governorate.
- **cutoffs**: year, system, departmentId, stream (`scientific|literary|applied|vocational`), gender (nullable), studyType (`morning|evening|parallel|private`), channel (nullable), minAverage, sourceUrl, sourceDate, confidence (`high|medium|low`).
- Cut-offs are **indicative history, not guarantees**. Display the source and year always. KRG data starts as `low|medium` confidence until verified.

## Services (Phase 2)

- **helper_profiles**: userId, bio (i18n), verifiedAt, verificationMethod, proofs (private refs), outcomes list (e.g. "Türkiye Bursları 2025", verified), languages, rating aggregate, active.
- **services**: helperId, title, scope text, deliverables, priceIqd, deliveryDays, allowedForMinors (bool, default false), status.
- **orders**: serviceId, buyerId, guardianConsentId (nullable), status (`created|paid_held|in_progress|delivered|confirmed|disputed|refunded|released`), priceIqd, platformFeeIqd, createdAt, deliveredAt. State machine enforced in code and tested.
- **payments**: orderId, provider, providerRef, amount, status, raw (scrubbed).
- **reviews**: orderId, rating, text, createdAt (one per order, buyer only).
- **disputes**, **guardian_consents**, **session_recordings** (metadata only, with retention date).

## Community (Phase 3)

- **ambassadors**: userId, university, country, field, verifiedAt, verificationMethod, bio (i18n), publicQaEnabled.
- **questions/answers**: public Q&A for ambassadors; moderated; minors can ask but cannot be messaged.
- **events**, **event_registrations**, **clubs**, **club_members**.

## Sponsors

- **sponsors**: name, logo, contact. **sponsor_placements**: sponsorId, opportunityId or slot, startsAt, endsAt, label text. Placements live outside the match order.

## Ops

- **audit_log**: actor, action, entity, before/after (scrubbed), at.
- **notification_prefs**, **telegram_links** (chatId hashed or encrypted at rest), **digest_runs**.

## Indexes (minimum)

opportunities(status, deadline), opportunities GIN on tsvector, trigram on title; user_opportunity(userId, state); cutoffs(year, departmentId, stream); orders(buyerId), orders(helperId), orders(status).

## Retention

Verification documents: delete 30 days after review. Session recordings: retention date stored; default 90 days unless disputed. Expired opportunities: keep archived, hidden from feeds.
