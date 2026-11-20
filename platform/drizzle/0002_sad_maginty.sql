CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"kind" varchar(30) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"candidates_queued" integer DEFAULT 0 NOT NULL,
	"expired_count" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "ingestion_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"tier" varchar(20) DEFAULT 'official' NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_content_hash" varchar(64),
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_list_items" (
	"list_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_contact_ck";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "work_experience_years" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "gender" varchar(10);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "willing_to_return" boolean;--> statement-breakpoint
ALTER TABLE "user_opportunity" ADD COLUMN "private_note" text;--> statement-breakpoint
ALTER TABLE "user_opportunity" ADD COLUMN "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_user_id" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_ingestion_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ingestion_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_items" ADD CONSTRAINT "user_list_items_list_id_user_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."user_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_items" ADD CONSTRAINT "user_list_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lists" ADD CONSTRAINT "user_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_runs_kind_idx" ON "ingestion_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_sources_slug_uq" ON "ingestion_sources" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uli_list_opp_uq" ON "user_list_items" USING btree ("list_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "uli_list_pos_idx" ON "user_list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "user_lists_user_idx" ON "user_lists" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_uq" ON "users" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_cal_token_uq" ON "users" USING btree ("calendar_token_hash");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_work_exp_ck" CHECK ("profiles"."work_experience_years" IS NULL OR "profiles"."work_experience_years" BETWEEN 0 AND 50);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_contact_ck" CHECK ("users"."phone_e164" IS NOT NULL OR "users"."email" IS NOT NULL OR "users"."telegram_user_id" IS NOT NULL OR "users"."deleted_at" IS NOT NULL);