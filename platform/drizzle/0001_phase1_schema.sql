CREATE TYPE "public"."admission_system" AS ENUM('federal', 'krg', 'private');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."deadline_status" AS ENUM('confirmed', 'estimated', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."digest_frequency" AS ENUM('daily', 'weekly', 'off');--> statement-breakpoint
CREATE TYPE "public"."education_level" AS ENUM('grade12', 'undergrad', 'graduate', 'other');--> statement-breakpoint
CREATE TYPE "public"."funding_type" AS ENUM('full', 'partial', 'stipend', 'none');--> statement-breakpoint
CREATE TYPE "public"."iraqi_eligibility" AS ENUM('yes', 'no', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('ar', 'ckb', 'kmr', 'en');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('draft', 'in_review', 'published', 'expired', 'rejected', 'removed');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('scholarship', 'exchange', 'fellowship', 'internship', 'competition', 'training', 'job');--> statement-breakpoint
CREATE TYPE "public"."otp_channel" AS ENUM('sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'change_contact');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('scam', 'expired', 'wrong_info', 'other');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('member', 'helper', 'editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."rule_operator" AS ENUM('eq', 'in', 'gte', 'lte', 'between', 'exists');--> statement-breakpoint
CREATE TYPE "public"."user_opportunity_state" AS ENUM('saved', 'applied', 'got_it', 'rejected', 'dismissed');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity" varchar(80) NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cutoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"system" "admission_system" NOT NULL,
	"year" integer NOT NULL,
	"stream" varchar(20) NOT NULL,
	"gender" varchar(10) DEFAULT 'both' NOT NULL,
	"study_type" varchar(20) DEFAULT 'morning' NOT NULL,
	"channel" varchar(40) DEFAULT 'general' NOT NULL,
	"min_average" real NOT NULL,
	"source_url" text NOT NULL,
	"source_date" timestamp with time zone,
	"confidence" "confidence" DEFAULT 'medium' NOT NULL,
	CONSTRAINT "cutoffs_krg_confidence_ck" CHECK ("cutoffs"."system" <> 'krg' OR "cutoffs"."confidence" <> 'high')
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"college" jsonb,
	"name" jsonb NOT NULL,
	"external_key" varchar(80)
);
--> statement-breakpoint
CREATE TABLE "digest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"field" varchar(60) NOT NULL,
	"operator" "rule_operator" NOT NULL,
	"value" jsonb NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"explanation" jsonb,
	"source_note" text
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"digest_frequency" "digest_frequency" DEFAULT 'weekly' NOT NULL,
	"deadline_reminders" boolean DEFAULT true NOT NULL,
	"quiet_start" integer DEFAULT 22 NOT NULL,
	"quiet_end" integer DEFAULT 8 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"title" jsonb NOT NULL,
	"summary" jsonb,
	"notes" jsonb,
	"required_documents" jsonb,
	"language_requirements" jsonb,
	"provider_name" varchar(200) NOT NULL,
	"source_url" text NOT NULL,
	"apply_url" text,
	"deadline" timestamp with time zone,
	"deadline_status" "deadline_status" DEFAULT 'unknown' NOT NULL,
	"rolling" boolean DEFAULT false NOT NULL,
	"status" "opportunity_status" DEFAULT 'draft' NOT NULL,
	"iraqi_eligibility" "iraqi_eligibility" DEFAULT 'unclear' NOT NULL,
	"levels" text[] DEFAULT '{}'::text[] NOT NULL,
	"fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"funding_type" "funding_type",
	"cost_to_applicant" jsonb,
	"needs_review" text[] DEFAULT '{}'::text[] NOT NULL,
	"sponsored" boolean DEFAULT false NOT NULL,
	"sponsor_id" uuid,
	"hidden_at" timestamp with time zone,
	"hidden_reason" varchar(40),
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_text" text GENERATED ALWAYS AS (coalesce(title->>'ar','') || ' ' || coalesce(title->>'ckb','') || ' ' || coalesce(title->>'kmr','') || ' ' || coalesce(title->>'en','') || ' ' || provider_name) STORED,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title->>'ar','') || ' ' || coalesce(title->>'ckb','') || ' ' || coalesce(title->>'kmr','') || ' ' || coalesce(title->>'en','') || ' ' || coalesce(summary->>'ar','') || ' ' || coalesce(summary->>'ckb','') || ' ' || coalesce(summary->>'kmr','') || ' ' || coalesce(summary->>'en','') || ' ' || provider_name)) STORED,
	CONSTRAINT "opp_publish_guard_ck" CHECK ("opportunities"."status" <> 'published' OR (
        length(trim("opportunities"."source_url")) > 0
        AND ("opportunities"."rolling" OR ("opportunities"."deadline" IS NOT NULL AND "opportunities"."deadline_status" = 'confirmed'))
        AND "opportunities"."verified_by" IS NOT NULL
        AND "opportunities"."verified_at" IS NOT NULL
      )),
	CONSTRAINT "opp_sponsored_ck" CHECK (NOT "opportunities"."sponsored" OR "opportunities"."sponsor_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "opportunity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"user_id" uuid,
	"reporter_fingerprint" varchar(64) NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "otp_channel" NOT NULL,
	"purpose" "otp_purpose" DEFAULT 'login' NOT NULL,
	"target_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_attempts_ck" CHECK ("otp_codes"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"education_level" "education_level" NOT NULL,
	"field_of_study" varchar(120),
	"gpa_percent" real,
	"english_test_type" varchar(40),
	"english_score" real,
	"governorate" varchar(60),
	"current_country" varchar(2),
	"university" varchar(160),
	"idp_self_declared" boolean,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_gpa_ck" CHECK ("profiles"."gpa_percent" IS NULL OR "profiles"."gpa_percent" BETWEEN 0 AND 110)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"chat_id_hash" varchar(64) NOT NULL,
	"chat_id_encrypted" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "universities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system" "admission_system" NOT NULL,
	"governorate" varchar(60),
	"name" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_opportunity" (
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"state" "user_opportunity_state" NOT NULL,
	"outcome_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" varchar(20),
	"email" varchar(255),
	"role" "role" DEFAULT 'member' NOT NULL,
	"locale" "locale" DEFAULT 'ar' NOT NULL,
	"birth_year" integer,
	"guardian_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_contact_ck" CHECK ("users"."phone_e164" IS NOT NULL OR "users"."email" IS NOT NULL OR "users"."deleted_at" IS NOT NULL),
	CONSTRAINT "users_birth_year_ck" CHECK ("users"."birth_year" IS NULL OR "users"."birth_year" BETWEEN 1900 AND 2100)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutoffs" ADD CONSTRAINT "cutoffs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_rules" ADD CONSTRAINT "eligibility_rules_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_opportunity" ADD CONSTRAINT "user_opportunity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_opportunity" ADD CONSTRAINT "user_opportunity_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "cutoffs_lookup_idx" ON "cutoffs" USING btree ("year","department_id","stream");--> statement-breakpoint
CREATE UNIQUE INDEX "cutoffs_row_uq" ON "cutoffs" USING btree ("department_id","year","stream","gender","study_type","channel");--> statement-breakpoint
CREATE INDEX "departments_university_idx" ON "departments" USING btree ("university_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_ext_uq" ON "departments" USING btree ("external_key");--> statement-breakpoint
CREATE INDEX "digest_runs_kind_idx" ON "digest_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE INDEX "rules_opp_idx" ON "eligibility_rules" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opp_status_deadline_idx" ON "opportunities" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "opp_type_idx" ON "opportunities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "opp_levels_gin" ON "opportunities" USING gin ("levels");--> statement-breakpoint
CREATE INDEX "opp_countries_gin" ON "opportunities" USING gin ("countries");--> statement-breakpoint
CREATE INDEX "opp_search_gin" ON "opportunities" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "opp_search_trgm" ON "opportunities" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "reports_opp_user_uq" ON "opportunity_reports" USING btree ("opportunity_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_opp_fp_uq" ON "opportunity_reports" USING btree ("opportunity_id","reporter_fingerprint");--> statement-breakpoint
CREATE INDEX "reports_open_idx" ON "opportunity_reports" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "otp_target_idx" ON "otp_codes" USING btree ("target_hash","created_at");--> statement-breakpoint
CREATE INDEX "otp_expires_idx" ON "otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "telegram_codes_user_idx" ON "telegram_link_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_chat_hash_uq" ON "telegram_links" USING btree ("chat_id_hash");--> statement-breakpoint
CREATE INDEX "universities_system_idx" ON "universities" USING btree ("system");--> statement-breakpoint
CREATE UNIQUE INDEX "uo_user_opp_uq" ON "user_opportunity" USING btree ("user_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "uo_user_state_idx" ON "user_opportunity" USING btree ("user_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");