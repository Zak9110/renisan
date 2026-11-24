// ============================================
// Renisan Platform — M9 Ambassadors, Moderated Public Q&A, Events & Clubs
// Enforces:
// - Adults only for ambassador profiles and double-opt-in introductions
// - No open DMs: public Q&A is moderated; minors can ask with pseudonym
// - 30-day auto-delete scheduled on ambassador verification proofs
// - External Zoom/YouTube/Meet events with registration & replay links
// - Moderated club links with code of conduct
// ============================================

import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  ambassadorIntros,
  ambassadorQuestions,
  ambassadors,
  auditLog,
  communityClubs,
  communityEvents,
  eventRegistrations,
  helperProfiles,
  orders,
  users,
  type I18nText,
} from "@/db/schema";
import { adultGateError } from "@/lib/auth/crypto";
import { isEditorOrAdmin, type EditorRole } from "@/lib/admin/service";

const PROOF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function getPhase3Readiness(db: Db) {
  const verifiedHelpers = await db
    .select({ userId: helperProfiles.userId })
    .from(helperProfiles)
    .where(eq(helperProfiles.active, true));
  const completedOrders = await db
    .select({ helperId: orders.helperId })
    .from(orders)
    .where(inArray(orders.status, ["confirmed", "released"]));
  const helpersWithCompletedOrders = new Set(completedOrders.map((o) => o.helperId)).size;

  return {
    verifiedHelpersCount: verifiedHelpers.length,
    helpersWithCompletedOrders,
    gateTargetHelpers: 20,
    gateMet: helpersWithCompletedOrders >= 20,
  };
}

export async function applyAsAmbassador(
  db: Db,
  userId: string,
  input: {
    university: string;
    country: string;
    field: string;
    howFunded?: I18nText | null;
    bio?: I18nText | null;
    verificationMethod: "academic_email" | "enrollment_letter" | "student_id" | "vouches";
    proofRef: string;
  },
  now: Date = new Date(),
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) return { ok: false as const, error: "unauthorized" as const };
  const ageError = adultGateError(user.birthYear, now);
  if (ageError) return { ok: false as const, error: ageError };

  const [created] = await db
    .insert(ambassadors)
    .values({
      userId,
      university: input.university.trim().slice(0, 160),
      country: input.country.trim().slice(0, 60),
      field: input.field.trim().slice(0, 120),
      howFunded: input.howFunded ?? null,
      bio: input.bio ?? null,
      verificationMethod: input.verificationMethod,
      proofRef: input.proofRef.trim(),
      active: false,
    })
    .onConflictDoUpdate({
      target: ambassadors.userId,
      set: {
        university: input.university.trim().slice(0, 160),
        country: input.country.trim().slice(0, 60),
        field: input.field.trim().slice(0, 120),
        howFunded: input.howFunded ?? null,
        bio: input.bio ?? null,
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

  return { ok: true as const, ambassador: created! };
}

export async function verifyAmbassador(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  ambassadorId: string,
  approve: boolean,
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const [existing] = await db.select().from(ambassadors).where(eq(ambassadors.id, ambassadorId)).limit(1);
  if (!existing) return { ok: false as const, error: "not_found" as const };
  if (existing.userId === actorId) return { ok: false as const, error: "forbidden" as const };

  const deleteAfter = new Date(now.getTime() + PROOF_RETENTION_MS);
  await db
    .update(ambassadors)
    .set({
      verifiedBy: approve ? actorId : null,
      verifiedAt: approve ? now : null,
      active: approve,
      proofDeleteAfter: deleteAfter,
    })
    .where(eq(ambassadors.id, ambassadorId));

  await db.insert(auditLog).values({
    actorId,
    action: approve ? "ambassador.approved" : "ambassador.rejected",
    entity: "ambassador",
    entityId: ambassadorId,
    after: { approve, proofDeleteAfter: deleteAfter.toISOString() },
    at: now,
  });

  return { ok: true as const };
}

export async function listPublicCommunity(db: Db, country?: string) {
  const activeAmbassadors = await db
    .select({
      id: ambassadors.id,
      university: ambassadors.university,
      country: ambassadors.country,
      field: ambassadors.field,
      howFunded: ambassadors.howFunded,
      bio: ambassadors.bio,
      verifiedAt: ambassadors.verifiedAt,
      publicQaEnabled: ambassadors.publicQaEnabled,
    })
    .from(ambassadors)
    .where(
      country && country !== "all"
        ? and(eq(ambassadors.active, true), eq(ambassadors.country, country))
        : eq(ambassadors.active, true),
    )
    .orderBy(desc(ambassadors.verifiedAt));

  const visibleQuestions = await db
    .select({
      id: ambassadorQuestions.id,
      ambassadorId: ambassadorQuestions.ambassadorId,
      askerPseudonym: ambassadorQuestions.askerPseudonym,
      questionText: ambassadorQuestions.questionText,
      answerText: ambassadorQuestions.answerText,
      status: ambassadorQuestions.status,
      answeredAt: ambassadorQuestions.answeredAt,
      createdAt: ambassadorQuestions.createdAt,
    })
    .from(ambassadorQuestions)
    .where(inArray(ambassadorQuestions.status, ["approved", "answered"]))
    .orderBy(desc(ambassadorQuestions.createdAt));

  const events = await db
    .select()
    .from(communityEvents)
    .where(eq(communityEvents.status, "published"))
    .orderBy(asc(communityEvents.startsAt));

  const regs = await db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations);
  const regCounts = new Map<string, number>();
  for (const r of regs) regCounts.set(r.eventId, (regCounts.get(r.eventId) ?? 0) + 1);

  const clubs = await db.select().from(communityClubs).where(eq(communityClubs.active, true));

  return {
    ambassadors: activeAmbassadors.map((a) => ({
      ...a,
      questions: visibleQuestions.filter((q) => q.ambassadorId === a.id),
    })),
    events: events.map((e) => ({
      ...e,
      registrationCount: regCounts.get(e.id) ?? 0,
    })),
    clubs,
  };
}

export async function submitAmbassadorQuestion(
  db: Db,
  askerId: string,
  ambassadorId: string,
  questionText: string,
  pseudonym?: string,
) {
  const [amb] = await db.select().from(ambassadors).where(eq(ambassadors.id, ambassadorId)).limit(1);
  if (!amb || !amb.active || !amb.publicQaEnabled) {
    return { ok: false as const, error: "ambassador_unavailable" as const };
  }

  const [created] = await db
    .insert(ambassadorQuestions)
    .values({
      ambassadorId,
      askerId,
      askerPseudonym: pseudonym?.trim().slice(0, 80) || "Student",
      questionText: questionText.trim().slice(0, 1000),
      status: "pending_moderation",
    })
    .returning();

  return { ok: true as const, question: created! };
}

export async function moderateQuestion(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  questionId: string,
  decision: "approved" | "hidden",
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const [q] = await db
    .select()
    .from(ambassadorQuestions)
    .where(eq(ambassadorQuestions.id, questionId))
    .limit(1);
  if (!q) return { ok: false as const, error: "not_found" as const };

  await db
    .update(ambassadorQuestions)
    .set({ status: decision })
    .where(eq(ambassadorQuestions.id, questionId));

  await db.insert(auditLog).values({
    actorId,
    action: `qa.${decision}`,
    entity: "ambassador_question",
    entityId: questionId,
    at: now,
  });

  return { ok: true as const };
}

export async function answerAmbassadorQuestion(
  db: Db,
  ambassadorUserId: string,
  questionId: string,
  answerText: string,
  now: Date = new Date(),
) {
  const [amb] = await db
    .select()
    .from(ambassadors)
    .where(and(eq(ambassadors.userId, ambassadorUserId), eq(ambassadors.active, true)))
    .limit(1);
  if (!amb) return { ok: false as const, error: "forbidden" as const };

  const [q] = await db
    .select()
    .from(ambassadorQuestions)
    .where(and(eq(ambassadorQuestions.id, questionId), eq(ambassadorQuestions.ambassadorId, amb.id)))
    .limit(1);
  if (!q || (q.status !== "approved" && q.status !== "answered")) {
    return { ok: false as const, error: "question_not_approved" as const };
  }

  const [updated] = await db
    .update(ambassadorQuestions)
    .set({
      answerText: answerText.trim().slice(0, 2000),
      status: "answered",
      answeredAt: now,
    })
    .where(eq(ambassadorQuestions.id, questionId))
    .returning();

  return { ok: true as const, question: updated! };
}

/** Double-opt-in adult-to-adult introduction request (strictly blocks minors). */
export async function requestAmbassadorIntro(
  db: Db,
  requesterId: string,
  ambassadorId: string,
  note: string,
  now: Date = new Date(),
) {
  const [requester] = await db.select().from(users).where(eq(users.id, requesterId)).limit(1);
  if (!requester || requester.deletedAt) return { ok: false as const, error: "unauthorized" as const };
  const ageError = adultGateError(requester.birthYear, now);
  if (ageError) {
    return {
      ok: false as const,
      error: ageError === "adults_only" ? ("minors_cannot_request_intros" as const) : ageError,
    };
  }

  const [amb] = await db.select().from(ambassadors).where(eq(ambassadors.id, ambassadorId)).limit(1);
  if (!amb || !amb.active) return { ok: false as const, error: "ambassador_unavailable" as const };

  if (amb.userId === requesterId) return { ok: false as const, error: "ambassador_unavailable" as const };

  const [open] = await db
    .select({ id: ambassadorIntros.id })
    .from(ambassadorIntros)
    .where(
      and(
        eq(ambassadorIntros.ambassadorId, ambassadorId),
        eq(ambassadorIntros.requesterId, requesterId),
        eq(ambassadorIntros.status, "requested"),
      ),
    )
    .limit(1);
  if (open) return { ok: false as const, error: "already_requested" as const };

  const [created] = await db
    .insert(ambassadorIntros)
    .values({
      ambassadorId,
      requesterId,
      note: note.trim().slice(0, 600),
      status: "requested",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return { ok: true as const, intro: created! };
}

export async function respondAmbassadorIntro(
  db: Db,
  ambassadorUserId: string,
  introId: string,
  decision: "accepted" | "declined",
  contactChannel?: string,
  now: Date = new Date(),
) {
  const [amb] = await db
    .select()
    .from(ambassadors)
    .where(and(eq(ambassadors.userId, ambassadorUserId), eq(ambassadors.active, true)))
    .limit(1);
  if (!amb) return { ok: false as const, error: "forbidden" as const };

  const [intro] = await db
    .select()
    .from(ambassadorIntros)
    .where(and(eq(ambassadorIntros.id, introId), eq(ambassadorIntros.ambassadorId, amb.id)))
    .limit(1);
  if (!intro || intro.status !== "requested") return { ok: false as const, error: "not_found" as const };

  const [updated] = await db
    .update(ambassadorIntros)
    .set({
      status: decision,
      contactChannel: decision === "accepted" ? contactChannel?.trim().slice(0, 120) || null : null,
      updatedAt: now,
    })
    .where(eq(ambassadorIntros.id, introId))
    .returning();

  return { ok: true as const, intro: updated! };
}

/** The signed-in user's own intros, plus the inbox when they are a verified ambassador. */
export async function listMyCommunity(db: Db, userId: string) {
  const myIntros = await db
    .select({
      id: ambassadorIntros.id,
      status: ambassadorIntros.status,
      contactChannel: ambassadorIntros.contactChannel,
      university: ambassadors.university,
    })
    .from(ambassadorIntros)
    .innerJoin(ambassadors, eq(ambassadorIntros.ambassadorId, ambassadors.id))
    .where(eq(ambassadorIntros.requesterId, userId))
    .orderBy(desc(ambassadorIntros.createdAt))
    .limit(20);

  const [amb] = await db
    .select({ id: ambassadors.id })
    .from(ambassadors)
    .where(and(eq(ambassadors.userId, userId), eq(ambassadors.active, true)))
    .limit(1);
  if (!amb) return { myIntros, inbox: null };

  // Requester identity stays hidden: the ambassador sees the note only.
  const intros = await db
    .select({ id: ambassadorIntros.id, note: ambassadorIntros.note })
    .from(ambassadorIntros)
    .where(and(eq(ambassadorIntros.ambassadorId, amb.id), eq(ambassadorIntros.status, "requested")))
    .orderBy(desc(ambassadorIntros.createdAt));
  const questions = await db
    .select({
      id: ambassadorQuestions.id,
      askerPseudonym: ambassadorQuestions.askerPseudonym,
      questionText: ambassadorQuestions.questionText,
    })
    .from(ambassadorQuestions)
    .where(and(eq(ambassadorQuestions.ambassadorId, amb.id), eq(ambassadorQuestions.status, "approved")))
    .orderBy(desc(ambassadorQuestions.createdAt));
  return { myIntros, inbox: { intros, questions } };
}

export async function registerForEvent(db: Db, userId: string, eventId: string) {
  const [ev] = await db.select().from(communityEvents).where(eq(communityEvents.id, eventId)).limit(1);
  if (!ev || ev.status !== "published") return { ok: false as const, error: "not_found" as const };

  await db.insert(eventRegistrations).values({ eventId, userId }).onConflictDoNothing();

  return { ok: true as const };
}

export async function adminCreateEvent(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  input: {
    title: I18nText;
    description?: I18nText | null;
    hostName: string;
    startsAt: Date;
    externalUrl: string;
    replayUrl?: string | null;
  },
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const [created] = await db
    .insert(communityEvents)
    .values({
      title: input.title,
      description: input.description ?? null,
      hostName: input.hostName.trim().slice(0, 160),
      startsAt: input.startsAt,
      externalUrl: input.externalUrl.trim(),
      replayUrl: input.replayUrl?.trim() || null,
      groupFormat: true,
      status: "published",
    })
    .returning();

  await db.insert(auditLog).values({
    actorId,
    action: "event.created",
    entity: "community_event",
    entityId: created!.id,
    at: now,
  });

  return { ok: true as const, event: created! };
}

export async function adminCreateClub(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  input: {
    name: I18nText;
    description?: I18nText | null;
    topic: string;
    externalUrl: string;
    codeOfConductUrl?: string | null;
  },
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const [created] = await db
    .insert(communityClubs)
    .values({
      name: input.name,
      description: input.description ?? null,
      topic: input.topic.trim().slice(0, 80),
      externalUrl: input.externalUrl.trim(),
      codeOfConductUrl: input.codeOfConductUrl?.trim() || null,
      active: true,
    })
    .returning();

  await db.insert(auditLog).values({
    actorId,
    action: "club.created",
    entity: "community_club",
    entityId: created!.id,
    at: now,
  });

  return { ok: true as const, club: created! };
}

export async function listAdminCommunityQueues(db: Db, actorRole: EditorRole) {
  if (!isEditorOrAdmin(actorRole)) throw new Error("forbidden");
  const pendingAmbassadors = await db
    .select()
    .from(ambassadors)
    .where(
      and(
        eq(ambassadors.active, false),
        isNull(ambassadors.proofDeleteAfter), // set once reviewed
        isNotNull(ambassadors.proofRef),
      ),
    )
    .orderBy(desc(ambassadors.createdAt));
  const pendingQuestions = await db
    .select()
    .from(ambassadorQuestions)
    .where(eq(ambassadorQuestions.status, "pending_moderation"))
    .orderBy(desc(ambassadorQuestions.createdAt));
  const readiness = await getPhase3Readiness(db);
  return { pendingAmbassadors, pendingQuestions, readiness };
}
