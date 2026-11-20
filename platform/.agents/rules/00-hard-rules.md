# Hard rules: trust, safety, privacy (always on)

## Data honesty

- Never fabricate scholarships, deadlines, cut-offs, prices, or eligibility. If unknown, store `unclear`/null and show "unclear, check the official page".
- Seed and demo data must be labeled `SAMPLE —` and use `example.org` links.
- A listing is publishable only if: verifiable `sourceUrl`; deadline or `rolling`; `iraqiEligibility` set; reviewed by an editor (`verifiedBy`, `verifiedAt`).
- Reject or flag listings that charge applicants an application/processing fee for a scholarship, promise guaranteed awards, claim "exclusive" access, use fake urgency, or ask for bank/card details up front. Programs with real costs must show `costToApplicant`.

## Matching

- Verdicts: GO, MAYBE, NO_GO (EXPIRED is excluded from lists). Always return reasons and missing profile fields.
- A failed mandatory criterion beats unknowns. Unknowns never become passes.
- Sponsored placements are separate, labeled "Sponsored", never mixed into match order.

## Minors and services

- Under-18 accounts: no direct messages, no public profile, no 1:1 sessions without a guardian consent record, group sessions preferred, in-platform sessions recorded with disclosure, no prompts to contact outside the platform.
- Helpers must be verified before any service is visible. Services are coaching only (CV/essay feedback, interview practice, document checklists, application walkthroughs, tutoring). Never "we write your essay", never guarantees.
- Every order has: written scope, price in IQD, delivery confirmation, report/dispute path.

## Privacy and security

- Do not collect ethnicity, religion, exact DOB, or national ID numbers. IDP/displacement flag: optional, self-declared, matching only.
- Hash OTP codes, rate-limit OTP (per phone and per IP), expire in 5 minutes, max 5 attempts.
- Verification documents: private storage, auto-delete 30 days after review, never visible to other users.
- No PII, OTPs, or tokens in logs. Provide account export and delete.
- Essential cookies only unless consented. No third-party ad trackers.
