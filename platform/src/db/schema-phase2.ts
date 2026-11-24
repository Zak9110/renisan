// Phase 2 & 3 tables (helpers, services, orders, guardian_consents, reviews,
// sponsors, ambassadors, Q&A, intros, events, clubs) have been promoted into ./schema.ts
// and migrated in Drizzle migration 0003. Re-exported here for backwards compatibility.
export {
  orderStatusEnum,
  serviceCategoryEnum,
  qaStatusEnum,
  introStatusEnum,
  helperProfiles,
  services,
  guardianConsents,
  orders,
  orderReviews,
  sponsors,
  sponsorPlacements,
  ambassadors,
  ambassadorQuestions,
  ambassadorIntros,
  communityEvents,
  eventRegistrations,
  communityClubs,
} from "./schema";
