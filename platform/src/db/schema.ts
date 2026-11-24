// Renisan Drizzle schema (Phase 1). Intent and rules: docs/DATA-MODEL.md.
// Changes from the kit's starting schema are listed in docs/STEP1-ANALYSIS.md section 2.
// Phase 2 tables live in ./schema-phase2.ts and are NOT migrated until Phase 1 sign-off.
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  real,
  check,
  customType,
} from "drizzle-orm/pg-core";

// i18n text stored as { ar?: string, ckb?: string, kmr?: string, en?: string }
export type I18nText = Partial<Record<"ar" | "ckb" | "kmr" | "en", string>>;

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const roleEnum = pgEnum("role", ["member", "helper", "editor", "admin"]);
export const localeEnum = pgEnum("locale", ["ar", "ckb", "kmr", "en"]);
export const educationLevelEnum = pgEnum("education_level", ["grade12", "undergrad", "graduate", "other"]);
export const oppTypeEnum = pgEnum("opportunity_type", [
  "scholarship",
  "exchange",
  "fellowship",
  "internship",
  "competition",
  "training",
  "job",
]);
export const oppStatusEnum = pgEnum("opportunity_status", [
  "draft",
  "in_review",
  "published",
  "expired",
  "rejected",
  "removed",
]);
export const iraqiEligibilityEnum = pgEnum("iraqi_eligibility", ["yes", "no", "unclear"]);
// An "estimated" date is a guess at the next cycle. It may be shown (labelled) but never
// counts as a deadline for publishing, expiry or reminders.
export const deadlineStatusEnum = pgEnum("deadline_status", ["confirmed", "estimated", "unknown"]);
export const fundingTypeEnum = pgEnum("funding_type", ["full", "partial", "stipend", "none"]);
export const userOppStateEnum = pgEnum("user_opportunity_state", [
  "saved",
  "applied",
  "got_it",
  "rejected",
  "dismissed",
]);
export const reportReasonEnum = pgEnum("report_reason", ["scam", "expired", "wrong_info", "other"]);
export const ruleOperatorEnum = pgEnum("rule_operator", ["eq", "in", "gte", "lte", "between", "exists"]);
export const otpChannelEnum = pgEnum("otp_channel", ["sms", "email"]);
export const otpPurposeEnum = pgEnum("otp_purpose", ["login", "change_contact"]);
export const admissionSystemEnum = pgEnum("admission_system", ["federal", "krg", "private"]);
export const confidenceEnum = pgEnum("confidence", ["high", "medium", "low"]);
export const digestFrequencyEnum = pgEnum("digest_frequency", ["daily", "weekly", "off"]);
export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "paid_held",
  "in_progress",
  "delivered",
  "confirmed",
  "released",
  "disputed",
  "refunded",
]);
export const serviceCategoryEnum = pgEnum("service_category", [
  "cv_feedback",
  "essay_feedback",
  "mock_interview",
  "document_checklist",
  "walkthrough",
  "shortlisting",
  "tutoring",
]);
export const qaStatusEnum = pgEnum("qa_status", ["pending_moderation", "approved", "answered", "hidden"]);
export const introStatusEnum = pgEnum("intro_status", ["requested", "accepted", "declined"]);

// ---------- Users and auth ----------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: varchar("phone_e164", { length: 20 }),
    email: varchar("email", { length: 255 }),
    telegramUserId: varchar("telegram_user_id", { length: 40 }),
    calendarTokenHash: varchar("calendar_token_hash", { length: 64 }),
    role: roleEnum("role").notNull().default("member"),
    locale: localeEnum("locale").notNull().default("ar"),
    birthYear: integer("birth_year"), // never store exact DOB; isMinor is derived, not stored
    guardianConsentAt: timestamp("guardian_consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_phone_uq").on(t.phoneE164),
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_telegram_uq").on(t.telegramUserId),
    uniqueIndex("users_cal_token_uq").on(t.calendarTokenHash),
    check(
      "users_contact_ck",
      sql`${t.phoneE164} IS NOT NULL OR ${t.email} IS NOT NULL OR ${t.telegramUserId} IS NOT NULL OR ${t.deletedAt} IS NOT NULL`,
    ),
    check("users_birth_year_ck", sql`${t.birthYear} IS NULL OR ${t.birthYear} BETWEEN 1900 AND 2100`),
  ],
);

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    educationLevel: educationLevelEnum("education_level").notNull(),
    fieldOfStudy: varchar("field_of_study", { length: 120 }),
    // Iraqi federal averages can exceed 100 (foreign-language bonus, e.g. 101.29), so allow up to 110.
    gpaPercent: real("gpa_percent"),
    englishTestType: varchar("english_test_type", { length: 40 }),
    englishScore: real("english_score"),
    workExperienceYears: integer("work_experience_years"),
    gender: varchar("gender", { length: 10 }), // male | female | null
    willingToReturn: boolean("willing_to_return"),
    governorate: varchar("governorate", { length: 60 }),
    currentCountry: varchar("current_country", { length: 2 }), // ISO 3166-1 alpha-2
    university: varchar("university", { length: 160 }),
    idpSelfDeclared: boolean("idp_self_declared"), // optional, private, matching only
    interests: text("interests")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("profiles_gpa_ck", sql`${t.gpaPercent} IS NULL OR ${t.gpaPercent} BETWEEN 0 AND 110`),
    check(
      "profiles_work_exp_ck",
      sql`${t.workExperienceYears} IS NULL OR ${t.workExperienceYears} BETWEEN 0 AND 50`,
    ),
  ],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: otpChannelEnum("channel").notNull(),
    purpose: otpPurposeEnum("purpose").notNull().default("login"),
    targetHash: text("target_hash").notNull(), // HMAC of phone/email, never the raw value
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("otp_target_idx").on(t.targetHash, t.createdAt),
    index("otp_expires_idx").on(t.expiresAt),
    check("otp_attempts_ck", sql`${t.attempts} BETWEEN 0 AND 5`),
  ],
);

// Fixed-window rate limits stored in Postgres (no extra service). Key is a hash, e.g. "otp:ip:<hmac>".
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limits_window_idx").on(t.windowStart)],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(), // SHA-256 of the cookie token; raw token never stored
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ---------- Opportunities ----------
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: oppTypeEnum("type").notNull(),
    title: jsonb("title").$type<I18nText>().notNull(),
    summary: jsonb("summary").$type<I18nText>(),
    notes: jsonb("notes").$type<I18nText>(),
    requiredDocuments: jsonb("required_documents").$type<I18nText>(),
    languageRequirements: jsonb("language_requirements").$type<I18nText>(),
    providerName: varchar("provider_name", { length: 200 }).notNull(),
    sourceUrl: text("source_url").notNull(), // required: official or verifiable
    applyUrl: text("apply_url"),
    deadline: timestamp("deadline", { withTimezone: true }),
    deadlineStatus: deadlineStatusEnum("deadline_status").notNull().default("unknown"),
    rolling: boolean("rolling").notNull().default(false),
    status: oppStatusEnum("status").notNull().default("draft"),
    iraqiEligibility: iraqiEligibilityEnum("iraqi_eligibility").notNull().default("unclear"),
    levels: text("levels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    fields: text("fields")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    countries: text("countries")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    fundingType: fundingTypeEnum("funding_type"),
    costToApplicant: jsonb("cost_to_applicant").$type<{
      amount: number;
      currency: string;
      note?: string;
    } | null>(),
    needsReview: text("needs_review")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`), // locales needing native review
    sponsored: boolean("sponsored").notNull().default(false),
    sponsorId: uuid("sponsor_id"), // FK added with the sponsors table in M8
    hiddenAt: timestamp("hidden_at", { withTimezone: true }), // set by 3-report auto-hide
    hiddenReason: varchar("hidden_reason", { length: 40 }),
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Search: 'simple' config (no Arabic/Kurdish stemmer). Trigram index for typo tolerance.
    searchText: text("search_text").generatedAlwaysAs(
      sql`coalesce(title->>'ar','') || ' ' || coalesce(title->>'ckb','') || ' ' || coalesce(title->>'kmr','') || ' ' || coalesce(title->>'en','') || ' ' || provider_name`,
    ),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title->>'ar','') || ' ' || coalesce(title->>'ckb','') || ' ' || coalesce(title->>'kmr','') || ' ' || coalesce(title->>'en','') || ' ' || coalesce(summary->>'ar','') || ' ' || coalesce(summary->>'ckb','') || ' ' || coalesce(summary->>'kmr','') || ' ' || coalesce(summary->>'en','') || ' ' || provider_name)`,
    ),
  },
  (t) => [
    index("opp_status_deadline_idx").on(t.status, t.deadline),
    index("opp_type_idx").on(t.type),
    index("opp_levels_gin").using("gin", t.levels),
    index("opp_countries_gin").using("gin", t.countries),
    index("opp_search_gin").using("gin", t.searchVector),
    index("opp_search_trgm").using("gin", t.searchText.op("gin_trgm_ops")),
    // Publish guard (hard rule 2). The service layer checks the same thing first, with friendlier errors.
    check(
      "opp_publish_guard_ck",
      sql`${t.status} <> 'published' OR (
        length(trim(${t.sourceUrl})) > 0
        AND (${t.rolling} OR (${t.deadline} IS NOT NULL AND ${t.deadlineStatus} = 'confirmed'))
        AND ${t.verifiedBy} IS NOT NULL
        AND ${t.verifiedAt} IS NOT NULL
      )`,
    ),
    check("opp_sponsored_ck", sql`NOT ${t.sponsored} OR ${t.sponsorId} IS NOT NULL`),
  ],
);

export const eligibilityRules = pgTable(
  "eligibility_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    // educationLevel, gpaPercent, age, englishScore, fieldOfStudy, residence, idp.
    // Iraqi nationality is opportunities.iraqiEligibility, not a rule.
    field: varchar("field", { length: 60 }).notNull(),
    operator: ruleOperatorEnum("operator").notNull(),
    value: jsonb("value").notNull(), // shape validated with zod per operator in src/lib/eligibility
    mandatory: boolean("mandatory").notNull().default(true),
    explanation: jsonb("explanation").$type<I18nText>(),
    sourceNote: text("source_note"),
  },
  (t) => [index("rules_opp_idx").on(t.opportunityId)],
);

export const userOpportunity = pgTable(
  "user_opportunity",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    state: userOppStateEnum("state").notNull(),
    outcomeNote: text("outcome_note"),
    privateNote: text("private_note"),
    checklist: jsonb("checklist")
      .$type<{ label: string; done: boolean }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uo_user_opp_uq").on(t.userId, t.opportunityId),
    index("uo_user_state_idx").on(t.userId, t.state),
  ],
);

// Custom named lists per account (e.g. "Top Bachelor's", "Backup", "Summer Exchanges").
export const userLists = pgTable(
  "user_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_lists_user_idx").on(t.userId, t.sortOrder)],
);

export const userListItems = pgTable(
  "user_list_items",
  {
    listId: uuid("list_id")
      .notNull()
      .references(() => userLists.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uli_list_opp_uq").on(t.listId, t.opportunityId),
    index("uli_list_pos_idx").on(t.listId, t.position),
  ],
);

export const opportunityReports = pgTable(
  "opportunity_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // Salted hash of IP + user agent for anonymous reports, so one person cannot file 3 "independent" reports.
    reporterFingerprint: varchar("reporter_fingerprint", { length: 64 }).notNull(),
    reason: reportReasonEnum("reason").notNull(),
    note: text("note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reports_opp_user_uq").on(t.opportunityId, t.userId),
    uniqueIndex("reports_opp_fp_uq").on(t.opportunityId, t.reporterFingerprint),
    index("reports_open_idx").on(t.resolvedAt),
  ],
);

// ---------- Admissions (Phase 1b) ----------
export const universities = pgTable(
  "universities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    system: admissionSystemEnum("system").notNull(),
    governorate: varchar("governorate", { length: 60 }),
    name: jsonb("name").$type<I18nText>().notNull(),
  },
  (t) => [index("universities_system_idx").on(t.system)],
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    college: jsonb("college").$type<I18nText>(),
    name: jsonb("name").$type<I18nText>().notNull(),
    // Stable import key, e.g. "fed-2026-0412", so re-imports update instead of duplicating.
    externalKey: varchar("external_key", { length: 80 }),
  },
  (t) => [
    index("departments_university_idx").on(t.universityId),
    uniqueIndex("departments_ext_uq").on(t.externalKey),
  ],
);

export const cutoffs = pgTable(
  "cutoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    system: admissionSystemEnum("system").notNull(),
    year: integer("year").notNull(),
    stream: varchar("stream", { length: 20 }).notNull(), // scientific | literary | applied | vocational (+ sub-stream)
    gender: varchar("gender", { length: 10 }).notNull().default("both"), // both | male | female
    studyType: varchar("study_type", { length: 20 }).notNull().default("morning"), // morning | evening | parallel | private (KRG "government" = morning)
    channel: varchar("channel", { length: 40 }).notNull().default("general"), // general | distinguished | martyrs | ...
    minAverage: real("min_average").notNull(), // federal: total / 7 (can exceed 100); KRG: composite score
    sourceUrl: text("source_url").notNull(),
    sourceDate: timestamp("source_date", { withTimezone: true }),
    confidence: confidenceEnum("confidence").notNull().default("medium"),
  },
  (t) => [
    index("cutoffs_lookup_idx").on(t.year, t.departmentId, t.stream),
    uniqueIndex("cutoffs_row_uq").on(t.departmentId, t.year, t.stream, t.gender, t.studyType, t.channel),
    // KRG has no official cut-off table: KRG rows can never be "high" confidence.
    check("cutoffs_krg_confidence_ck", sql`${t.system} <> 'krg' OR ${t.confidence} <> 'high'`),
  ],
);

// ---------- Notifications ----------
export const notificationPrefs = pgTable("notification_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  digestFrequency: digestFrequencyEnum("digest_frequency").notNull().default("weekly"),
  deadlineReminders: boolean("deadline_reminders").notNull().default(true),
  quietStart: integer("quiet_start").notNull().default(22), // hour, Asia/Baghdad
  quietEnd: integer("quiet_end").notNull().default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramLinks = pgTable(
  "telegram_links",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // Webhooks only give us a chat id, so we need a lookup key (HMAC) next to the encrypted value.
    chatIdHash: varchar("chat_id_hash", { length: 64 }).notNull(),
    chatIdEncrypted: text("chat_id_encrypted").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("telegram_chat_hash_uq").on(t.chatIdHash)],
);

export const telegramLinkCodes = pgTable(
  "telegram_link_codes",
  {
    codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("telegram_codes_user_idx").on(t.userId)],
);

export const digestRuns = pgTable(
  "digest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 20 }).notNull(), // digest_daily | digest_weekly | reminder_7d | reminder_2d | expiry
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    sentCount: integer("sent_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
  },
  (t) => [index("digest_runs_kind_idx").on(t.kind, t.startedAt)],
);

// One row per alert sent, so cron retries and extra runs never message a user twice.
export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alertKey: varchar("alert_key", { length: 100 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("alert_deliveries_uq").on(t.userId, t.alertKey),
    index("alert_deliveries_sent_idx").on(t.sentAt),
  ],
);

// ---------- Daily 24h Ingestion Sources & Audit Runs ----------
export const ingestionSources = pgTable(
  "ingestion_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    kind: varchar("kind", { length: 30 }).notNull(), // rss | reliefweb_api | html_watch
    tier: varchar("tier", { length: 20 }).notNull().default("official"), // official | lead
    url: text("url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastContentHash: varchar("last_content_hash", { length: 64 }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  },
  (t) => [uniqueIndex("ingestion_sources_slug_uq").on(t.slug)],
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => ingestionSources.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 30 }).notNull(), // daily_harvest | expiry_sweep | page_watch
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    itemsFetched: integer("items_fetched").notNull().default(0),
    candidatesQueued: integer("candidates_queued").notNull().default(0),
    expiredCount: integer("expired_count").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("ingestion_runs_kind_idx").on(t.kind, t.startedAt)],
);

// ---------- Ops ----------
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    entity: varchar("entity", { length: 80 }).notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"), // scrubbed: no PII, no secrets
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_at_idx").on(t.at)],
);

// ---------- Phase 2 (M7): Verified Helpers, Coaching Services, Orders & Safeguarding ----------
export const helperProfiles = pgTable(
  "helper_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    bio: jsonb("bio").$type<I18nText>(),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    subjects: text("subjects")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    outcomes: jsonb("outcomes")
      .$type<{ program: string; year: number; country?: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verificationMethod: varchar("verification_method", { length: 40 }).notNull(),
    // Private proof reference (never exposed publicly); auto-deleted 30 days after review
    proofRef: text("proof_ref"),
    proofDeleteAfter: timestamp("proof_delete_after", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("helpers_active_idx").on(t.active, t.verifiedAt)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    helperId: uuid("helper_id")
      .notNull()
      .references(() => helperProfiles.userId, { onDelete: "cascade" }),
    category: serviceCategoryEnum("category").notNull(),
    title: jsonb("title").$type<I18nText>().notNull(),
    scope: jsonb("scope").$type<I18nText>().notNull(),
    deliverables: jsonb("deliverables").$type<I18nText>().notNull(),
    priceIqd: integer("price_iqd").notNull(),
    deliveryDays: integer("delivery_days").notNull(),
    allowedForMinors: boolean("allowed_for_minors").notNull().default(false),
    groupSession: boolean("group_session").notNull().default(false),
    sessionLink: text("session_link"),
    status: varchar("status", { length: 20 }).notNull().default("in_review"), // in_review | active | paused | rejected
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("services_helper_idx").on(t.helperId, t.status),
    check("services_price_ck", sql`${t.priceIqd} > 0 AND ${t.priceIqd} <= 1000000`),
    check("services_days_ck", sql`${t.deliveryDays} BETWEEN 1 AND 60`),
  ],
);

export const guardianConsents = pgTable(
  "guardian_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minorUserId: uuid("minor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    guardianName: varchar("guardian_name", { length: 120 }).notNull(),
    // Salted HMAC of guardian phone/email — never store raw contact PII
    guardianContactHash: varchar("guardian_contact_hash", { length: 64 }).notNull(),
    consentLocale: localeEnum("consent_locale").notNull().default("ar"),
    consentText: text("consent_text").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("guardian_consents_minor_idx").on(t.minorUserId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    helperId: uuid("helper_id")
      .notNull()
      .references(() => helperProfiles.userId, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull().default("created"),
    priceIqd: integer("price_iqd").notNull(),
    platformFeeIqd: integer("platform_fee_iqd").notNull(),
    scopeSnapshot: text("scope_snapshot").notNull(),
    guardianConsentId: uuid("guardian_consent_id").references(() => guardianConsents.id, {
      onDelete: "set null",
    }),
    paymentProvider: varchar("payment_provider", { length: 24 }).notNull().default("manual"),
    paymentRef: varchar("payment_ref", { length: 120 }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    autoConfirmAt: timestamp("auto_confirm_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    disputeReason: text("dispute_reason"),
    disputeResolvedAt: timestamp("dispute_resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_helper_idx").on(t.helperId),
    index("orders_status_idx").on(t.status),
  ],
);

export const orderReviews = pgTable(
  "order_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    helperId: uuid("helper_id")
      .notNull()
      .references(() => helperProfiles.userId, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_reviews_order_uq").on(t.orderId),
    index("order_reviews_helper_idx").on(t.helperId),
    check("order_reviews_rating_ck", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

// ---------- Phase 2 (M8): Sponsors (strictly separate from match order) ----------
export const sponsors = pgTable("sponsors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  websiteUrl: text("website_url").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sponsorPlacements = pgTable(
  "sponsor_placements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sponsorId: uuid("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    slot: varchar("slot", { length: 40 }).notNull().default("opportunities_banner"),
    title: jsonb("title").$type<I18nText>().notNull(),
    summary: jsonb("summary").$type<I18nText>(),
    targetUrl: text("target_url").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
    // Strictly anonymous aggregate counters (never store user IDs or tracking cookies)
    impressionCount: integer("impression_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sponsor_placements_slot_idx").on(t.slot, t.active, t.startsAt, t.endsAt)],
);

// ---------- Phase 3 (M9): Ambassadors, Moderated Q&A, Events & Clubs ----------
export const ambassadors = pgTable(
  "ambassadors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    university: varchar("university", { length: 160 }).notNull(),
    country: varchar("country", { length: 60 }).notNull(),
    field: varchar("field", { length: 120 }).notNull(),
    howFunded: jsonb("how_funded").$type<I18nText>(),
    bio: jsonb("bio").$type<I18nText>(),
    verificationMethod: varchar("verification_method", { length: 40 }).notNull(),
    proofRef: text("proof_ref"),
    proofDeleteAfter: timestamp("proof_delete_after", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    publicQaEnabled: boolean("public_qa_enabled").notNull().default(true),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ambassadors_user_uq").on(t.userId),
    index("ambassadors_country_idx").on(t.country, t.active),
  ],
);

export const ambassadorQuestions = pgTable(
  "ambassador_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorId: uuid("ambassador_id")
      .notNull()
      .references(() => ambassadors.id, { onDelete: "cascade" }),
    askerId: uuid("asker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    askerPseudonym: varchar("asker_pseudonym", { length: 80 }).notNull(),
    questionText: text("question_text").notNull(),
    answerText: text("answer_text"),
    status: qaStatusEnum("status").notNull().default("pending_moderation"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("amb_questions_amb_idx").on(t.ambassadorId, t.status)],
);

// Adult-to-adult double-opt-in introductions only (never open DMs, never minors)
export const ambassadorIntros = pgTable(
  "ambassador_intros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorId: uuid("ambassador_id")
      .notNull()
      .references(() => ambassadors.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    status: introStatusEnum("status").notNull().default("requested"),
    contactChannel: varchar("contact_channel", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("amb_intros_amb_idx").on(t.ambassadorId, t.status)],
);

export const communityEvents = pgTable(
  "community_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: jsonb("title").$type<I18nText>().notNull(),
    description: jsonb("description").$type<I18nText>(),
    hostName: varchar("host_name", { length: 160 }).notNull(),
    ambassadorId: uuid("ambassador_id").references(() => ambassadors.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    externalUrl: text("external_url").notNull(),
    replayUrl: text("replay_url"),
    groupFormat: boolean("group_format").notNull().default(true),
    status: varchar("status", { length: 20 }).notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_starts_idx").on(t.startsAt, t.status)],
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => communityEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("event_regs_event_user_uq").on(t.eventId, t.userId)],
);

export const communityClubs = pgTable("community_clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: jsonb("name").$type<I18nText>().notNull(),
  description: jsonb("description").$type<I18nText>(),
  topic: varchar("topic", { length: 80 }).notNull(),
  externalUrl: text("external_url").notNull(),
  codeOfConductUrl: text("code_of_conduct_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
