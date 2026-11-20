import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { opportunities, userListItems, userLists, userOpportunity, users } from "@/db/schema";
import { generateOpaqueToken, sha256Hex } from "@/lib/auth/crypto";
import { pickText, type Locale } from "@/i18n/config";

export async function listUserLists(db: Db, userId: string) {
  const lists = await db
    .select()
    .from(userLists)
    .where(eq(userLists.userId, userId))
    .orderBy(asc(userLists.sortOrder), asc(userLists.createdAt));

  if (lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const items = await db
    .select({
      listId: userListItems.listId,
      position: userListItems.position,
      addedAt: userListItems.addedAt,
      opportunity: opportunities,
    })
    .from(userListItems)
    .innerJoin(opportunities, eq(userListItems.opportunityId, opportunities.id))
    .where(inArray(userListItems.listId, listIds))
    .orderBy(asc(userListItems.position), asc(userListItems.addedAt));

  return lists.map((l) => ({
    ...l,
    items: items.filter((i) => i.listId === l.id),
  }));
}

export async function createUserList(db: Db, userId: string, name: string) {
  const existing = await db.select({ id: userLists.id }).from(userLists).where(eq(userLists.userId, userId));
  const [created] = await db
    .insert(userLists)
    .values({ userId, name: name.trim().slice(0, 80), sortOrder: existing.length })
    .returning();
  return created!;
}

export async function deleteUserList(db: Db, userId: string, listId: string): Promise<boolean> {
  const deleted = await db
    .delete(userLists)
    .where(and(eq(userLists.id, listId), eq(userLists.userId, userId)))
    .returning({ id: userLists.id });
  return deleted.length > 0;
}

export async function addItemToList(
  db: Db,
  userId: string,
  listId: string,
  opportunityId: string,
): Promise<boolean> {
  const [list] = await db
    .select({ id: userLists.id })
    .from(userLists)
    .where(and(eq(userLists.id, listId), eq(userLists.userId, userId)))
    .limit(1);
  if (!list) return false;

  const existing = await db.select().from(userListItems).where(eq(userListItems.listId, listId));
  await db
    .insert(userListItems)
    .values({ listId, opportunityId, position: existing.length })
    .onConflictDoNothing();

  // Also ensure the opportunity is tracked as "saved" if not already tracked
  await db
    .insert(userOpportunity)
    .values({ userId, opportunityId, state: "saved" })
    .onConflictDoNothing();

  return true;
}

export async function removeItemFromList(
  db: Db,
  userId: string,
  listId: string,
  opportunityId: string,
): Promise<boolean> {
  const [list] = await db
    .select({ id: userLists.id })
    .from(userLists)
    .where(and(eq(userLists.id, listId), eq(userLists.userId, userId)))
    .limit(1);
  if (!list) return false;

  await db
    .delete(userListItems)
    .where(and(eq(userListItems.listId, listId), eq(userListItems.opportunityId, opportunityId)));
  return true;
}

export async function upsertUserOpportunity(
  db: Db,
  userId: string,
  input: {
    opportunityId: string;
    state: "saved" | "applied" | "got_it" | "rejected" | "dismissed";
    privateNote?: string | null;
    outcomeNote?: string | null;
    checklist?: { label: string; done: boolean }[];
  },
) {
  const now = new Date();
  const [row] = await db
    .insert(userOpportunity)
    .values({
      userId,
      opportunityId: input.opportunityId,
      state: input.state,
      privateNote: input.privateNote ?? null,
      outcomeNote: input.outcomeNote ?? null,
      checklist: input.checklist ?? [],
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userOpportunity.userId, userOpportunity.opportunityId],
      set: {
        state: input.state,
        ...(input.privateNote !== undefined ? { privateNote: input.privateNote } : {}),
        ...(input.outcomeNote !== undefined ? { outcomeNote: input.outcomeNote } : {}),
        ...(input.checklist !== undefined ? { checklist: input.checklist } : {}),
        updatedAt: now,
      },
    })
    .returning();
  return row!;
}

export type DeadlineUrgency = "urgent" | "soon" | "upcoming" | "estimated" | "rolling" | "expired";

export interface UserDeadlineEntry {
  opportunityId: string;
  title: Record<string, string | undefined>;
  providerName: string;
  applyUrl: string | null;
  sourceUrl: string;
  state: "saved" | "applied" | "got_it" | "rejected" | "dismissed";
  deadline: Date | null;
  deadlineStatus: "confirmed" | "estimated" | "unknown";
  rolling: boolean;
  daysLeft: number | null;
  urgency: DeadlineUrgency;
  privateNote: string | null;
  checklist: { label: string; done: boolean }[];
}

export async function getUserDeadlines(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<UserDeadlineEntry[]> {
  const rows = await db
    .select({
      tracked: userOpportunity,
      opp: opportunities,
    })
    .from(userOpportunity)
    .innerJoin(opportunities, eq(userOpportunity.opportunityId, opportunities.id))
    .where(eq(userOpportunity.userId, userId));

  return rows
    .filter((r) => r.tracked.state !== "dismissed")
    .map(({ tracked, opp }) => {
      let daysLeft: number | null = null;
      let urgency: DeadlineUrgency = "rolling";

      if (opp.status === "expired") {
        urgency = "expired";
      } else if (opp.rolling) {
        urgency = "rolling";
      } else if (opp.deadline) {
        const diff = Math.ceil((opp.deadline.getTime() - now.getTime()) / 86_400_000);
        daysLeft = diff;
        if (diff < 0) urgency = "expired";
        else if (opp.deadlineStatus === "estimated") urgency = "estimated";
        else if (diff <= 7) urgency = "urgent";
        else if (diff <= 30) urgency = "soon";
        else urgency = "upcoming";
      } else {
        urgency = "estimated";
      }

      return {
        opportunityId: opp.id,
        title: opp.title,
        providerName: opp.providerName,
        applyUrl: opp.applyUrl,
        sourceUrl: opp.sourceUrl,
        state: tracked.state,
        deadline: opp.deadline,
        deadlineStatus: opp.deadlineStatus,
        rolling: opp.rolling,
        daysLeft,
        urgency,
        privateNote: tracked.privateNote,
        checklist: tracked.checklist ?? [],
      };
    })
    .sort((a, b) => {
      const ta = a.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const tb = b.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Generates a personal subscribable RFC 5545 .ics calendar feed for a user's saved deadlines. */
export async function buildUserCalendarIcs(
  db: Db,
  userId: string,
  locale: Locale = "en",
  now: Date = new Date(),
): Promise<string> {
  const deadlines = await getUserDeadlines(db, userId, now);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const events: string[] = [];
  for (const d of deadlines) {
    // Hard rule: only confirmed deadlines get calendar alarms (estimated never presented as confirmed deadlines)
    if (!d.deadline || d.deadlineStatus !== "confirmed" || d.urgency === "expired") continue;
    const iso = d.deadline.toISOString().slice(0, 10);
    const compact = iso.replace(/-/g, "");
    const nextDay = new Date(d.deadline.getTime() + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
    const title = pickText(d.title, locale) || d.providerName;
    const link = d.applyUrl || d.sourceUrl;

    events.push(
      [
        "BEGIN:VEVENT",
        `UID:renisan-${d.opportunityId}-${compact}@renisan.app`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact}`,
        `DTEND;VALUE=DATE:${nextDay}`,
        `SUMMARY:${escapeIcs(`🎓 ${title}`)}`,
        `DESCRIPTION:${escapeIcs(`${title} (${d.providerName})\nApply: ${link}`)}`,
        `URL:${link}`,
        "BEGIN:VALARM",
        "TRIGGER:-P7D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcs(`7 days left: ${title}`)}`,
        "END:VALARM",
        "BEGIN:VALARM",
        "TRIGGER:-P2D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcs(`2 days left: ${title}`)}`,
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n"),
    );
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Renisan//My Deadlines//EN",
    "X-WR-CALNAME:Renisan Deadlines",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Issues or rotates a private subscribable WebCal token (only its SHA-256 hash is stored). */
export async function rotateCalendarToken(db: Db, userId: string): Promise<string> {
  const token = generateOpaqueToken();
  await db
    .update(users)
    .set({ calendarTokenHash: sha256Hex(token) })
    .where(eq(users.id, userId));
  return token;
}

export async function findUserByCalendarToken(db: Db, rawToken: string) {
  const rows = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(eq(users.calendarTokenHash, sha256Hex(rawToken)))
    .limit(1);
  return rows[0] ?? null;
}
