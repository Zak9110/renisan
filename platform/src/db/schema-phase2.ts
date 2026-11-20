// Phase 2 skeleton (helpers, services, orders). NOT migrated: drizzle.config.ts only reads schema.ts.
// Move these into schema.ts after the founder signs off the Phase 1 acceptance review (see ROADMAP M7).
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users, type I18nText } from "./schema";

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

export const helperProfiles = pgTable("helper_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: jsonb("bio").$type<I18nText>(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationMethod: varchar("verification_method", { length: 40 }),
  outcomes: jsonb("outcomes").$type<{ program: string; year: number; country?: string }[]>().default([]),
  active: boolean("active").notNull().default(false),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  helperId: uuid("helper_id")
    .notNull()
    .references(() => helperProfiles.userId, { onDelete: "cascade" }),
  title: jsonb("title").$type<I18nText>().notNull(),
  scope: jsonb("scope").$type<I18nText>().notNull(),
  priceIqd: integer("price_iqd").notNull(),
  deliveryDays: integer("delivery_days").notNull(),
  allowedForMinors: boolean("allowed_for_minors").notNull().default(false),
  status: varchar("status", { length: 20 }).notNull().default("in_review"),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    helperId: uuid("helper_id")
      .notNull()
      .references(() => helperProfiles.userId),
    status: orderStatusEnum("status").notNull().default("created"),
    priceIqd: integer("price_iqd").notNull(),
    platformFeeIqd: integer("platform_fee_iqd").notNull(),
    guardianConsentAt: timestamp("guardian_consent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_helper_idx").on(t.helperId),
    index("orders_status_idx").on(t.status),
  ],
);
