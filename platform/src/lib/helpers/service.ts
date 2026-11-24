// ============================================
// Renisan Platform — M7 Verified Helpers, Coaching Services, Payments & Orders
// Enforces:
// - Coaching-only banned-phrase checks (no essay writing, no guarantees, no logins)
// - Adult-only helper onboarding & manual editor verification with 30-day proof auto-delete
// - Strict order state machine (created -> paid_held -> in_progress -> delivered -> confirmed -> released | disputed | refunded)
// - Mandatory guardian consent for under-18 buyers on allowed services
// - 72-hour auto-confirmation unless disputed + audit logging on every state transition
// ============================================

import { and, asc, desc, eq, isNotNull, isNull, lte, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  ambassadors,
  auditLog,
  guardianConsents,
  helperProfiles,
  orderReviews,
  orders,
  services,
  users,
  type I18nText,
} from "@/db/schema";
import { adultGateError, hmacHex, isMinorFromBirthYear } from "@/lib/auth/crypto";
import { isEditorOrAdmin, type EditorRole } from "@/lib/admin/service";

export const DEFAULT_PLATFORM_FEE_RATE = 0.12; // 12% (within 10-15% range in FEATURES-PHASE-2-3.md)
const PROOF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days after review
const AUTO_CONFIRM_MS = 72 * 60 * 60 * 1000; // 72 hours after delivery

export type OrderStatus = (typeof orders.$inferSelect)["status"];

export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ["paid_held", "refunded"],
  paid_held: ["in_progress", "disputed", "refunded"],
  in_progress: ["delivered", "disputed", "refunded"],
  delivered: ["confirmed", "disputed"],
  confirmed: ["released", "disputed"],
  disputed: ["refunded", "released"],
  released: [],
  refunded: [],
};

const BANNED_SERVICE_PATTERNS: { code: string; re: RegExp }[] = [
  {
    code: "essay_ghostwriting",
    re: /\b(write your essay|we write your|write my essay|ghostwrit|write personal statement for you|complete your application for you|fill your application form)\b/i,
  },
  {
    code: "guaranteed_outcome",
    re: /\b(100%\s*success|guaranteed admission|guaranteed scholarship|guaranteed acceptance|guarantee you will win)\b/i,
  },
  {
    code: "exclusive_claim",
    re: /\b(exclusive scholarship|inside connection|secret quota|paid connection)\b/i,
  },
  {
    code: "login_sharing",
    re: /\b(share your password|send your login|give me your account password|login credentials)\b/i,
  },
];

export function checkServiceBannedPhrases(text: string): { blocked: boolean; codes: string[] } {
  const codes: string[] = [];
  for (const p of BANNED_SERVICE_PATTERNS) {
    if (p.re.test(text)) codes.push(p.code);
  }
  return { blocked: codes.length > 0, codes };
}

export interface PaymentIntentResult {
  ok: boolean;
  provider: "manual" | "zaincash" | "fastpay";
  paymentRef?: string;
  instructions?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly name: "manual" | "zaincash" | "fastpay";
  createHold(orderId: string, amountIqd: number): Promise<PaymentIntentResult>;
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual" as const;
  async createHold(orderId: string, amountIqd: number): Promise<PaymentIntentResult> {
    return {
      ok: true,
      provider: "manual",
      paymentRef: `MAN-${orderId.slice(0, 8).toUpperCase()}`,
      instructions: `Transfer ${amountIqd.toLocaleString("en-US")} IQD via verified manual bank/wallet reference MAN-${orderId.slice(0, 8).toUpperCase()}; an editor confirms receipt to hold funds.`,
    };
  }
}

export class UnconfiguredWalletProvider implements PaymentProvider {
  constructor(public readonly name: "zaincash" | "fastpay") {}
  async createHold(): Promise<PaymentIntentResult> {
    return {
      ok: false,
      provider: this.name,
      error: `${this.name}_merchant_account_not_configured`,
    };
  }
}

export function createPaymentProvider(kind: "manual" | "zaincash" | "fastpay"): PaymentProvider {
  if (kind === "manual") return new ManualPaymentProvider();
  return new UnconfiguredWalletProvider(kind);
}

export async function applyAsHelper(
  db: Db,
  userId: string,
  input: {
    bio: I18nText;
    languages: string[];
    subjects: string[];
    outcomes: { program: string; year: number; country?: string }[];
    verificationMethod: "offer_letter" | "enrollment" | "certificate" | "vouches";
    proofRef: string;
  },
  now: Date = new Date(),
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) return { ok: false as const, error: "user_not_found" as const };
  const ageError = adultGateError(user.birthYear, now);
  if (ageError) return { ok: false as const, error: ageError };

  const [existing] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (existing?.bannedAt) {
    return { ok: false as const, error: "helper_banned" as const };
  }

  const [profile] = await db
    .insert(helperProfiles)
    .values({
      userId,
      bio: input.bio,
      languages: input.languages,
      subjects: input.subjects,
      outcomes: input.outcomes,
      verificationMethod: input.verificationMethod,
      proofRef: input.proofRef.trim(),
      active: false,
    })
    .onConflictDoUpdate({
      target: helperProfiles.userId,
      set: {
        bio: input.bio,
        languages: input.languages,
        subjects: input.subjects,
        outcomes: input.outcomes,
        verificationMethod: input.verificationMethod,
        proofRef: input.proofRef.trim(),
        // New claims need a new review: an edited profile must not stay "verified".
        active: false,
        verifiedAt: null,
        verifiedBy: null,
        proofDeleteAfter: null,
      },
    })
    .returning();

  return { ok: true as const, profile: profile! };
}

export async function verifyHelper(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  helperUserId: string,
  decision: "approve" | "reject" | "ban",
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole) || actorId === helperUserId) {
    return { ok: false as const, error: "forbidden" as const };
  }

  const [existing] = await db
    .select()
    .from(helperProfiles)
    .where(eq(helperProfiles.userId, helperUserId))
    .limit(1);
  if (!existing) return { ok: false as const, error: "not_found" as const };

  const deleteAfter = new Date(now.getTime() + PROOF_RETENTION_MS);

  if (decision === "approve") {
    await db
      .update(helperProfiles)
      .set({
        verifiedBy: actorId,
        verifiedAt: now,
        proofDeleteAfter: deleteAfter,
        active: true,
        bannedAt: null,
      })
      .where(eq(helperProfiles.userId, helperUserId));
    await db
      .update(users)
      .set({ role: "helper" })
      .where(and(eq(users.id, helperUserId), eq(users.role, "member")));
  } else if (decision === "ban") {
    await db
      .update(helperProfiles)
      .set({ active: false, bannedAt: now, proofRef: null, proofDeleteAfter: null })
      .where(eq(helperProfiles.userId, helperUserId));
    await db.update(services).set({ status: "rejected" }).where(eq(services.helperId, helperUserId));
  } else {
    await db
      .update(helperProfiles)
      .set({ active: false, verifiedAt: null, verifiedBy: null, proofDeleteAfter: deleteAfter })
      .where(eq(helperProfiles.userId, helperUserId));
  }

  await db.insert(auditLog).values({
    actorId,
    action: `helper.${decision}`,
    entity: "helper_profile",
    entityId: helperUserId,
    after: { decision, proofDeleteAfter: decision === "ban" ? null : deleteAfter.toISOString() },
    at: now,
  });

  return { ok: true as const };
}

/** Auto-deletes private verification proof references 30 days after review (Hard rule). */
export async function purgeExpiredVerificationProofs(db: Db, now: Date = new Date()) {
  const purgedHelpers = await db
    .update(helperProfiles)
    .set({ proofRef: null, proofDeleteAfter: null })
    .where(and(isNotNull(helperProfiles.proofRef), lte(helperProfiles.proofDeleteAfter, now)))
    .returning({ userId: helperProfiles.userId });

  const purgedAmbassadors = await db
    .update(ambassadors)
    .set({ proofRef: null, proofDeleteAfter: null })
    .where(and(isNotNull(ambassadors.proofRef), lte(ambassadors.proofDeleteAfter, now)))
    .returning({ id: ambassadors.id });

  return {
    helpersPurged: purgedHelpers.length,
    ambassadorsPurged: purgedAmbassadors.length,
  };
}

export async function createHelperService(
  db: Db,
  helperUserId: string,
  input: {
    category: (typeof services.$inferInsert)["category"];
    title: I18nText;
    scope: I18nText;
    deliverables: I18nText;
    priceIqd: number;
    deliveryDays: number;
    allowedForMinors?: boolean;
    groupSession?: boolean;
    sessionLink?: string | null;
  },
) {
  const [helper] = await db
    .select()
    .from(helperProfiles)
    .where(eq(helperProfiles.userId, helperUserId))
    .limit(1);

  if (!helper || !helper.verifiedAt || !helper.active || helper.bannedAt) {
    return { ok: false as const, error: "helper_not_verified" as const };
  }

  const combinedText = [
    ...Object.values(input.title),
    ...Object.values(input.scope),
    ...Object.values(input.deliverables),
  ].join(" ");

  const banned = checkServiceBannedPhrases(combinedText);
  if (banned.blocked) {
    return { ok: false as const, error: "banned_phrase" as const, codes: banned.codes };
  }

  const [created] = await db
    .insert(services)
    .values({
      helperId: helperUserId,
      category: input.category,
      title: input.title,
      scope: input.scope,
      deliverables: input.deliverables,
      priceIqd: input.priceIqd,
      deliveryDays: input.deliveryDays,
      allowedForMinors: Boolean(input.allowedForMinors),
      groupSession: Boolean(input.groupSession),
      sessionLink: input.sessionLink?.trim() || null,
      status: "in_review", // Editors review every new coaching service before going live
    })
    .returning();

  return { ok: true as const, service: created! };
}

export async function reviewHelperService(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  serviceId: string,
  decision: "active" | "rejected" | "paused",
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };

  const [existing] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!existing) return { ok: false as const, error: "not_found" as const };
  if (existing.helperId === actorId) return { ok: false as const, error: "forbidden" as const };

  await db.update(services).set({ status: decision }).where(eq(services.id, serviceId));
  await db.insert(auditLog).values({
    actorId,
    action: `service.${decision}`,
    entity: "service",
    entityId: serviceId,
    before: { status: existing.status },
    after: { status: decision },
    at: now,
  });

  return { ok: true as const };
}

export async function listPublicServices(db: Db) {
  const rows = await db
    .select({
      service: services,
      helper: helperProfiles,
    })
    .from(services)
    .innerJoin(helperProfiles, eq(services.helperId, helperProfiles.userId))
    .where(and(eq(services.status, "active"), eq(helperProfiles.active, true)))
    .orderBy(desc(services.createdAt));

  const reviews = await db.select().from(orderReviews);
  const ratingMap = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    const cur = ratingMap.get(r.helperId) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    ratingMap.set(r.helperId, cur);
  }

  return rows
    .filter((r) => Boolean(r.helper.verifiedAt) && !r.helper.bannedAt)
    .map(({ service: fullService, helper }) => {
      const stats = ratingMap.get(helper.userId);
      // The session link is a direct line to the helper: only paying buyers get it (listUserOrders).
      const { sessionLink, ...service } = fullService;
      void sessionLink;
      return {
        service,
        helper: {
          userId: helper.userId,
          bio: helper.bio,
          languages: helper.languages,
          subjects: helper.subjects,
          outcomes: helper.outcomes,
          verifiedAt: helper.verifiedAt,
          averageRating: stats ? Number((stats.sum / stats.count).toFixed(1)) : null,
          reviewCount: stats?.count ?? 0,
        },
      };
    });
}

export async function createServiceOrder(
  db: Db,
  buyerId: string,
  secret: string,
  paymentKind: "manual" | "zaincash" | "fastpay",
  input: {
    serviceId: string;
    guardianConsent?: {
      guardianName: string;
      guardianContact: string;
      consentText: string;
      locale: "ar" | "ckb" | "kmr" | "en";
    };
  },
  now: Date = new Date(),
) {
  const [buyer] = await db.select().from(users).where(eq(users.id, buyerId)).limit(1);
  if (!buyer || buyer.deletedAt) return { ok: false as const, error: "unauthorized" as const };

  const [row] = await db
    .select({ service: services, helper: helperProfiles })
    .from(services)
    .innerJoin(helperProfiles, eq(services.helperId, helperProfiles.userId))
    .where(eq(services.id, input.serviceId))
    .limit(1);

  if (!row || row.service.status !== "active" || !row.helper.active || !row.helper.verifiedAt) {
    return { ok: false as const, error: "service_unavailable" as const };
  }
  if (row.service.helperId === buyerId) {
    return { ok: false as const, error: "cannot_order_own_service" as const };
  }

  if (buyer.birthYear == null) {
    return { ok: false as const, error: "birth_year_required" as const };
  }
  const minor = isMinorFromBirthYear(buyer.birthYear, now);
  let guardianConsentId: string | null = null;

  if (minor) {
    if (!row.service.allowedForMinors) {
      return { ok: false as const, error: "service_not_allowed_for_minors" as const };
    }
    if (input.guardianConsent) {
      const [consent] = await db
        .insert(guardianConsents)
        .values({
          minorUserId: buyerId,
          guardianName: input.guardianConsent.guardianName.trim().slice(0, 120),
          guardianContactHash: hmacHex(input.guardianConsent.guardianContact.trim(), secret),
          consentLocale: input.guardianConsent.locale,
          consentText: input.guardianConsent.consentText.trim(),
          recordedAt: now,
        })
        .returning();
      guardianConsentId = consent!.id;
      await db.update(users).set({ guardianConsentAt: now }).where(eq(users.id, buyerId));
    } else {
      const [existingConsent] = await db
        .select()
        .from(guardianConsents)
        .where(eq(guardianConsents.minorUserId, buyerId))
        .orderBy(desc(guardianConsents.recordedAt))
        .limit(1);
      if (!existingConsent) {
        return { ok: false as const, error: "guardian_consent_required" as const };
      }
      guardianConsentId = existingConsent.id;
    }
  }

  // Refuse before writing anything: an unconfigured wallet would leave an order nobody can pay.
  const provider = createPaymentProvider(paymentKind);
  if (provider instanceof UnconfiguredWalletProvider) {
    return { ok: false as const, error: "payment_unavailable" as const };
  }

  const platformFeeIqd = Math.round(row.service.priceIqd * DEFAULT_PLATFORM_FEE_RATE);
  const scopeSnapshot = Object.values(row.service.scope).filter(Boolean).join(" / ").slice(0, 1000);

  const [created] = await db
    .insert(orders)
    .values({
      serviceId: row.service.id,
      buyerId,
      helperId: row.service.helperId,
      status: "created",
      priceIqd: row.service.priceIqd,
      platformFeeIqd,
      scopeSnapshot,
      guardianConsentId,
      paymentProvider: paymentKind,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const payment = await provider.createHold(created!.id, created!.priceIqd);
  if (payment.ok && payment.paymentRef) {
    await db
      .update(orders)
      .set({ paymentRef: payment.paymentRef, updatedAt: now })
      .where(eq(orders.id, created!.id));
  }

  await db.insert(auditLog).values({
    actorId: buyerId,
    action: "order.created",
    entity: "order",
    entityId: created!.id,
    after: {
      status: "created",
      priceIqd: created!.priceIqd,
      platformFeeIqd,
      minor,
      hasGuardianConsent: Boolean(guardianConsentId),
    },
    at: now,
  });

  return {
    ok: true as const,
    order: { ...created!, paymentRef: payment.paymentRef ?? null },
    payment,
  };
}

export async function transitionOrder(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  orderId: string,
  nextStatus: OrderStatus,
  options: { reason?: string; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false as const, error: "not_found" as const };

  const allowed = ALLOWED_ORDER_TRANSITIONS[order.status];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false as const,
      error: "invalid_transition" as const,
      from: order.status,
      to: nextStatus,
    };
  }

  const isBuyer = order.buyerId === actorId;
  const isHelper = order.helperId === actorId;
  // Staff never get staff powers over an order they are a party to.
  const isStaff = isEditorOrAdmin(actorRole) && !isBuyer && !isHelper;

  // Actor authorization per transition
  const permitted =
    isStaff ||
    (nextStatus === "in_progress" && isHelper) ||
    (nextStatus === "delivered" && isHelper) ||
    (nextStatus === "confirmed" && isBuyer) ||
    (nextStatus === "disputed" && (isBuyer || isHelper));

  if (!permitted) return { ok: false as const, error: "forbidden" as const };

  const patch: Partial<typeof orders.$inferInsert> = {
    status: nextStatus,
    updatedAt: now,
  };
  if (nextStatus === "delivered") {
    patch.deliveredAt = now;
    patch.autoConfirmAt = new Date(now.getTime() + AUTO_CONFIRM_MS);
  }
  if (nextStatus === "confirmed") {
    patch.confirmedAt = now;
  }
  if (nextStatus === "disputed") {
    patch.disputeReason = options.reason?.trim().slice(0, 500) || "disputed";
  }
  if (order.status === "disputed" && (nextStatus === "refunded" || nextStatus === "released")) {
    patch.disputeResolvedAt = now;
  }

  const [updated] = await db
    .update(orders)
    .set(patch)
    .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
    .returning();
  // Someone else moved the order between our read and write.
  if (!updated) {
    return { ok: false as const, error: "invalid_transition" as const, from: order.status, to: nextStatus };
  }

  await db.insert(auditLog).values({
    actorId,
    action: `order.${nextStatus}`,
    entity: "order",
    entityId: orderId,
    before: { status: order.status },
    after: { status: nextStatus, reason: patch.disputeReason ?? null },
    at: now,
  });

  return { ok: true as const, order: updated! };
}

/** Auto-confirms delivered orders after 72h unless disputed (FEATURES-PHASE-2-3.md). */
export async function autoConfirmDeliveredOrders(db: Db, now: Date = new Date()): Promise<number> {
  const due = await db
    .update(orders)
    .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
    .where(and(eq(orders.status, "delivered"), lte(orders.autoConfirmAt, now)))
    .returning({ id: orders.id });

  if (due.length > 0) {
    await db.insert(auditLog).values({
      action: "order.auto_confirm_72h",
      entity: "order",
      entityId: due.map((d) => d.id).join(","),
      after: { count: due.length },
      at: now,
    });
  }
  return due.length;
}

export async function createOrderReview(
  db: Db,
  buyerId: string,
  orderId: string,
  rating: number,
  comment?: string | null,
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false as const, error: "not_found" as const };
  if (order.buyerId !== buyerId) return { ok: false as const, error: "forbidden" as const };
  if (order.status !== "confirmed" && order.status !== "released") {
    return { ok: false as const, error: "order_not_completed" as const };
  }

  try {
    const [review] = await db
      .insert(orderReviews)
      .values({
        orderId,
        buyerId,
        helperId: order.helperId,
        rating,
        comment: comment?.trim().slice(0, 600) || null,
      })
      .returning();
    return { ok: true as const, review: review! };
  } catch {
    return { ok: false as const, error: "already_reviewed" as const };
  }
}

export async function listUserOrders(db: Db, userId: string) {
  const asBuyer = await db
    .select({ order: orders, service: services })
    .from(orders)
    .innerJoin(services, eq(orders.serviceId, services.id))
    .where(eq(orders.buyerId, userId))
    .orderBy(desc(orders.createdAt));

  const asHelper = await db
    .select({ order: orders, service: services })
    .from(orders)
    .innerJoin(services, eq(orders.serviceId, services.id))
    .where(eq(orders.helperId, userId))
    .orderBy(desc(orders.createdAt));

  // Session links stay private until payment is held.
  const LINK_VISIBLE: OrderStatus[] = ["paid_held", "in_progress", "delivered"];
  return {
    asBuyer: asBuyer.map(({ order, service }) => ({
      order,
      service: {
        ...service,
        sessionLink: LINK_VISIBLE.includes(order.status) ? service.sessionLink : null,
      },
    })),
    asHelper,
  };
}

export async function listAdminHelperQueues(db: Db, actorRole: EditorRole) {
  if (!isEditorOrAdmin(actorRole)) throw new Error("forbidden");
  const pendingHelpers = await db
    .select()
    .from(helperProfiles)
    .where(
      and(
        eq(helperProfiles.active, false),
        isNull(helperProfiles.bannedAt),
        isNull(helperProfiles.proofDeleteAfter), // set once reviewed
        isNotNull(helperProfiles.proofRef),
      ),
    )
    .orderBy(desc(helperProfiles.createdAt));
  const pendingServices = await db
    .select()
    .from(services)
    .where(eq(services.status, "in_review"))
    .orderBy(desc(services.createdAt));
  const activeOrders = await db
    .select()
    .from(orders)
    .where(notInArray(orders.status, ["released", "refunded"]))
    .orderBy(asc(orders.updatedAt))
    .limit(50);
  return { pendingHelpers, pendingServices, activeOrders };
}
