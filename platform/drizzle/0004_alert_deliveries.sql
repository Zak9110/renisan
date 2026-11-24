CREATE TABLE "alert_deliveries" (
	"user_id" uuid NOT NULL,
	"alert_key" varchar(100) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_uq" ON "alert_deliveries" USING btree ("user_id","alert_key");--> statement-breakpoint
CREATE INDEX "alert_deliveries_sent_idx" ON "alert_deliveries" USING btree ("sent_at");