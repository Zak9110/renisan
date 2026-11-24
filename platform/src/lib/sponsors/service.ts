// ============================================
// Renisan Platform — M8 Sponsors Service
// Sponsored placements live strictly outside eligibility matching & sort order.
// Stats are anonymous aggregate counters only (zero PII, zero user tracking).
// ============================================

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog, sponsorPlacements, sponsors, type I18nText } from "@/db/schema";
import { isEditorOrAdmin, type EditorRole } from "@/lib/admin/service";

export async function listActivePlacements(db: Db, slot?: string, now: Date = new Date()) {
  const conditions = [
    eq(sponsorPlacements.active, true),
    eq(sponsors.active, true),
    lte(sponsorPlacements.startsAt, now),
    gte(sponsorPlacements.endsAt, now),
  ];
  if (slot) conditions.push(eq(sponsorPlacements.slot, slot));

  return db
    .select({
      placement: sponsorPlacements,
      sponsorName: sponsors.name,
      sponsorWebsite: sponsors.websiteUrl,
    })
    .from(sponsorPlacements)
    .innerJoin(sponsors, eq(sponsorPlacements.sponsorId, sponsors.id))
    .where(and(...conditions))
    .orderBy(desc(sponsorPlacements.createdAt));
}

export async function recordPlacementEvent(
  db: Db,
  placementId: string,
  kind: "impression" | "click",
): Promise<boolean> {
  const updated = await db
    .update(sponsorPlacements)
    .set(
      kind === "impression"
        ? { impressionCount: sql`${sponsorPlacements.impressionCount} + 1` }
        : { clickCount: sql`${sponsorPlacements.clickCount} + 1` },
    )
    .where(eq(sponsorPlacements.id, placementId))
    .returning({ id: sponsorPlacements.id });

  return updated.length > 0;
}

export async function adminCreateSponsor(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  input: { name: string; websiteUrl: string },
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const [created] = await db
    .insert(sponsors)
    .values({ name: input.name.trim().slice(0, 160), websiteUrl: input.websiteUrl.trim() })
    .returning();

  await db.insert(auditLog).values({
    actorId,
    action: "sponsor.created",
    entity: "sponsor",
    entityId: created!.id,
    after: { name: created!.name },
    at: now,
  });

  return { ok: true as const, sponsor: created! };
}

export async function adminCreatePlacement(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  input: {
    sponsorId: string;
    slot: "opportunities_banner" | "admissions_banner" | "home_card";
    title: I18nText;
    summary?: I18nText | null;
    targetUrl: string;
    startsAt: Date;
    endsAt: Date;
  },
  now: Date = new Date(),
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const [created] = await db
    .insert(sponsorPlacements)
    .values({
      sponsorId: input.sponsorId,
      slot: input.slot,
      title: input.title,
      summary: input.summary ?? null,
      targetUrl: input.targetUrl.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      active: true,
    })
    .returning();

  await db.insert(auditLog).values({
    actorId,
    action: "sponsor_placement.created",
    entity: "sponsor_placement",
    entityId: created!.id,
    after: { sponsorId: input.sponsorId, slot: input.slot },
    at: now,
  });

  return { ok: true as const, placement: created! };
}

export async function adminListSponsors(db: Db, actorRole: EditorRole) {
  if (!isEditorOrAdmin(actorRole)) throw new Error("forbidden");
  const allSponsors = await db.select().from(sponsors).orderBy(desc(sponsors.createdAt));
  const placements = await db.select().from(sponsorPlacements).orderBy(desc(sponsorPlacements.createdAt));
  return { sponsors: allSponsors, placements };
}
