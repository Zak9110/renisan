CREATE TYPE "public"."intro_status" AS ENUM('requested', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('created', 'paid_held', 'in_progress', 'delivered', 'confirmed', 'released', 'disputed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."qa_status" AS ENUM('pending_moderation', 'approved', 'answered', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('cv_feedback', 'essay_feedback', 'mock_interview', 'document_checklist', 'walkthrough', 'shortlisting', 'tutoring');--> statement-breakpoint
CREATE TABLE "ambassador_intros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ambassador_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"note" text NOT NULL,
	"status" "intro_status" DEFAULT 'requested' NOT NULL,
	"contact_channel" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassador_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ambassador_id" uuid NOT NULL,
	"asker_id" uuid NOT NULL,
	"asker_pseudonym" varchar(80) NOT NULL,
	"question_text" text NOT NULL,
	"answer_text" text,
	"status" "qa_status" DEFAULT 'pending_moderation' NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassadors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"university" varchar(160) NOT NULL,
	"country" varchar(60) NOT NULL,
	"field" varchar(120) NOT NULL,
	"how_funded" jsonb,
	"bio" jsonb,
	"verification_method" varchar(40) NOT NULL,
	"proof_ref" text,
	"proof_delete_after" timestamp with time zone,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"public_qa_enabled" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"topic" varchar(80) NOT NULL,
	"external_url" text NOT NULL,
	"code_of_conduct_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb,
	"host_name" varchar(160) NOT NULL,
	"ambassador_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"external_url" text NOT NULL,
	"replay_url" text,
	"group_format" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minor_user_id" uuid NOT NULL,
	"guardian_name" varchar(120) NOT NULL,
	"guardian_contact_hash" varchar(64) NOT NULL,
	"consent_locale" "locale" DEFAULT 'ar' NOT NULL,
	"consent_text" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helper_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"bio" jsonb,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"subjects" text[] DEFAULT '{}'::text[] NOT NULL,
	"outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_method" varchar(40) NOT NULL,
	"proof_ref" text,
	"proof_delete_after" timestamp with time zone,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"banned_at" timestamp with time zone,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"helper_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_reviews_rating_ck" CHECK ("order_reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"helper_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'created' NOT NULL,
	"price_iqd" integer NOT NULL,
	"platform_fee_iqd" integer NOT NULL,
	"scope_snapshot" text NOT NULL,
	"guardian_consent_id" uuid,
	"payment_provider" varchar(24) DEFAULT 'manual' NOT NULL,
	"payment_ref" varchar(120),
	"delivered_at" timestamp with time zone,
	"auto_confirm_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"dispute_reason" text,
	"dispute_resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"helper_id" uuid NOT NULL,
	"category" "service_category" NOT NULL,
	"title" jsonb NOT NULL,
	"scope" jsonb NOT NULL,
	"deliverables" jsonb NOT NULL,
	"price_iqd" integer NOT NULL,
	"delivery_days" integer NOT NULL,
	"allowed_for_minors" boolean DEFAULT false NOT NULL,
	"group_session" boolean DEFAULT false NOT NULL,
	"session_link" text,
	"status" varchar(20) DEFAULT 'in_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_price_ck" CHECK ("services"."price_iqd" > 0 AND "services"."price_iqd" <= 1000000),
	CONSTRAINT "services_days_ck" CHECK ("services"."delivery_days" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "sponsor_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"slot" varchar(40) DEFAULT 'opportunities_banner' NOT NULL,
	"title" jsonb NOT NULL,
	"summary" jsonb,
	"target_url" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"impression_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"website_url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ambassador_intros" ADD CONSTRAINT "ambassador_intros_ambassador_id_ambassadors_id_fk" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_intros" ADD CONSTRAINT "ambassador_intros_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_questions" ADD CONSTRAINT "ambassador_questions_ambassador_id_ambassadors_id_fk" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_questions" ADD CONSTRAINT "ambassador_questions_asker_id_users_id_fk" FOREIGN KEY ("asker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_events" ADD CONSTRAINT "community_events_ambassador_id_ambassadors_id_fk" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_community_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."community_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_minor_user_id_users_id_fk" FOREIGN KEY ("minor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD CONSTRAINT "helper_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_profiles" ADD CONSTRAINT "helper_profiles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_helper_id_helper_profiles_user_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."helper_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_helper_id_helper_profiles_user_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."helper_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guardian_consent_id_guardian_consents_id_fk" FOREIGN KEY ("guardian_consent_id") REFERENCES "public"."guardian_consents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_helper_id_helper_profiles_user_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."helper_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_placements" ADD CONSTRAINT "sponsor_placements_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amb_intros_amb_idx" ON "ambassador_intros" USING btree ("ambassador_id","status");--> statement-breakpoint
CREATE INDEX "amb_questions_amb_idx" ON "ambassador_questions" USING btree ("ambassador_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ambassadors_user_uq" ON "ambassadors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ambassadors_country_idx" ON "ambassadors" USING btree ("country","active");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "community_events" USING btree ("starts_at","status");--> statement-breakpoint
CREATE UNIQUE INDEX "event_regs_event_user_uq" ON "event_registrations" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "guardian_consents_minor_idx" ON "guardian_consents" USING btree ("minor_user_id");--> statement-breakpoint
CREATE INDEX "helpers_active_idx" ON "helper_profiles" USING btree ("active","verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_reviews_order_uq" ON "order_reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_reviews_helper_idx" ON "order_reviews" USING btree ("helper_id");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_helper_idx" ON "orders" USING btree ("helper_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "services_helper_idx" ON "services" USING btree ("helper_id","status");--> statement-breakpoint
CREATE INDEX "sponsor_placements_slot_idx" ON "sponsor_placements" USING btree ("slot","active","starts_at","ends_at");