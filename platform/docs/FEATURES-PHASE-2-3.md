# FEATURES — PHASE 2 AND 3 (do not start before Phase 1 acceptance passes)

## Phase 2: Verified helpers and paid coaching

### Helper onboarding

- Apply as helper with: what they won/were admitted to (program, year, country), proof (offer letter, enrollment proof, certificate, or two vouches from verified members), languages, subjects.
- Manual review by an editor. Proof files are private and deleted 30 days after review.
- Helper profile shows verified outcomes only. Badges: Verified helper, Top rated, Fast delivery.

### Services (coaching only)

Allowed: CV/resume feedback, essay **feedback** (comments, questions, structure advice), mock interviews, document checklists, application walkthroughs, scholarship shortlisting help, tutoring sessions.
Not allowed: writing essays or any part of them for the applicant, guarantees of admission or funding, "exclusive" claims, requests to share the applicant's logins.

- Service creation form blocks banned phrases (e.g. "guaranteed", "100% success", "we write your essay") with explanatory messages in all locales; editors review new services.
- Fixed, written scope, deliverables, delivery time, price in IQD. Suggested range for small packages: roughly $5–$30 (founder decides final prices).

### Orders and payments

- State machine: created -> paid_held -> in_progress -> delivered -> confirmed -> released (also disputed, refunded). Buyer confirms or auto-confirms after 72 hours unless disputed.
- Platform fee 10–15% of package (founder decides). Payout to helpers via the payment provider or manual payout in the first version.
- `PaymentProvider` interface: ZainCash, FastPay, manual bank/wallet confirmation. A registered business is required for merchant APIs (VERIFY with the founder before integrating).
- Refund and dispute flow with an admin view. Everything in the audit log.

### Booking and sessions

- Availability slots, time zones shown in the viewer's zone. Video via external links (Google Meet/Zoom) or the helper's chosen provider; no in-app video.
- Under-18 buyers: guardian consent record required; group sessions preferred; disclosure that sessions are recorded where the platform hosts the room; no sharing of personal contact details; report button.
- Reviews only from completed orders.

### Sponsors

- Sponsor dashboard-lite: placements managed by admins. Labeled "Sponsored"; separate slot; never changes match results or order.

## Phase 3: Ambassadors, events, community

### Ambassadors abroad

- Verified students/alumni per university and country. Verification via academic email OTP where available, a reviewed enrollment letter or student ID (deleted after review), or two vouches.
- Public profile (adults only) with university, country, field, how they got in and funded.
- Public Q&A: questions are visible and moderated; ambassadors answer. **No open DMs.** Adult-to-adult introductions are double opt-in and move to WhatsApp/Telegram.
- Start with three hubs (suggested: Turkey, Jordan, Malaysia; founder verifies current numbers) and 20–30 hand-recruited ambassadors.

### Events and seminars

- Event listings with registration, reminders, replay links. Hosted externally (Zoom/YouTube/Meet).
- Recurring "office hours" with ambassadors in group format.

### Clubs

- Interest or university-based clubs with moderators. Start as links to moderated Telegram/WhatsApp groups with a code of conduct. Build in-app only if usage proves it.

### Movement and content

- Success stories (with consent), share cards for TikTok/Instagram generated from "got it" outcomes, city/university chapters later.

## Phase 3 gates

Do not start Phase 3 until: written safeguarding policy exists, a named safeguarding focal person is assigned, 20+ verified helpers have completed orders, and moderation tooling is live.
