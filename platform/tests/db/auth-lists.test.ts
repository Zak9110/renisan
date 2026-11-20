import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import {
  eligibilityRules,
  notificationPrefs,
  opportunities,
  profiles,
  telegramLinks,
  users,
} from "@/db/schema";
import {
  deleteUserAccount,
  exportUserData,
  getSessionUser,
  loginWithTelegramUser,
  logoutSession,
  requestOtp,
  verifyOtp,
  verifyTelegramAuthPayload,
} from "@/lib/auth/service";
import { isMinorFromBirthYear, normalizePhoneE164 } from "@/lib/auth/crypto";
import { ConsoleEmailProvider } from "@/lib/email/provider";
import { ConsoleSmsProvider } from "@/lib/sms/provider";
import {
  addItemToList,
  buildUserCalendarIcs,
  createUserList,
  deleteUserList,
  findUserByCalendarToken,
  getUserDeadlines,
  listUserLists,
  removeItemFromList,
  rotateCalendarToken,
  upsertUserOpportunity,
} from "@/lib/lists/service";
import { listPublicOpportunities } from "@/lib/opportunities/service";

const URL_ = "pglite://memory";
const SECRET = "test-secret-must-be-at-least-32-chars-long";
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = createDb(URL_));
  await runMigrations(db, URL_);
});
afterAll(async () => close());

describe("auth, OTP security, Telegram Login, accounts, lists & deadlines", () => {
  it("normalizes Iraqi phone numbers and derives minor status safely from birthYear", () => {
    expect(normalizePhoneE164("07701234567")).toBe("+9647701234567");
    expect(normalizePhoneE164("009647501234567")).toBe("+9647501234567");
    expect(normalizePhoneE164("bad")).toBeNull();
    expect(isMinorFromBirthYear(2009, new Date("2026-11-20"))).toBe(true);
    expect(isMinorFromBirthYear(2000, new Date("2026-11-20"))).toBe(false);
  });

  it("enforces OTP expiry, max 5 attempts, single-use replay protection, and rate limits", async () => {
    const deps = { db, secret: SECRET, sms: new ConsoleSmsProvider(), email: new ConsoleEmailProvider() };
    const t0 = new Date("2026-11-20T10:00:00Z");

    const req = await requestOtp(deps, {
      channel: "email",
      target: "student@example.org",
      ip: "10.0.0.1",
      now: t0,
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect(req.devCode).toMatch(/^\d{6}$/);

    // Wrong code increments attempts up to 5 and locks out
    for (let i = 0; i < 4; i++) {
      const bad = await verifyOtp(deps, {
        channel: "email",
        target: "student@example.org",
        code: "000000",
        now: t0,
      });
      expect(bad.ok).toBe(false);
    }
    const fifth = await verifyOtp(deps, {
      channel: "email",
      target: "student@example.org",
      code: "000000",
      now: t0,
    });
    expect(fifth).toEqual({ ok: false, error: "too_many_attempts" });

    // Even the real code is rejected after 5 failed attempts
    const locked = await verifyOtp(deps, {
      channel: "email",
      target: "student@example.org",
      code: req.devCode!,
      now: t0,
    });
    expect(locked).toEqual({ ok: false, error: "too_many_attempts" });

    // Request a fresh OTP and verify within 5 minutes
    const req2 = await requestOtp(deps, {
      channel: "email",
      target: "student@example.org",
      ip: "10.0.0.1",
      now: t0,
    });
    expect(req2.ok).toBe(true);
    if (!req2.ok) return;

    // Expired after 5 minutes
    const late = await verifyOtp(deps, {
      channel: "email",
      target: "student@example.org",
      code: req2.devCode!,
      now: new Date(t0.getTime() + 6 * 60 * 1000),
    });
    expect(late).toEqual({ ok: false, error: "invalid_or_expired" });

    // Valid verification creates user + session
    const ok = await verifyOtp(deps, {
      channel: "email",
      target: "student@example.org",
      code: req2.devCode!,
      now: t0,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;

    // Replay of the same OTP is blocked
    const replay = await verifyOtp(deps, {
      channel: "email",
      target: "student@example.org",
      code: req2.devCode!,
      now: t0,
    });
    expect(replay).toEqual({ ok: false, error: "invalid_or_expired" });

    // Session resolves and logs out cleanly
    const sessionUser = await getSessionUser(db, ok.sessionToken, t0);
    expect(sessionUser?.email).toBe("student@example.org");
    await logoutSession(db, ok.sessionToken);
    expect(await getSessionUser(db, ok.sessionToken, t0)).toBeNull();

    // Per-target rate limit: 3rd request allowed, 4th within 10 minutes blocked
    const req3 = await requestOtp(deps, {
      channel: "email",
      target: "student@example.org",
      ip: "10.0.0.1",
      now: t0,
    });
    expect(req3.ok).toBe(true);
    const req4 = await requestOtp(deps, {
      channel: "email",
      target: "student@example.org",
      ip: "10.0.0.1",
      now: t0,
    });
    expect(req4.ok).toBe(false);
    if (!req4.ok) expect(req4.error).toBe("rate_limited");
  });

  it("verifies Telegram Login HMAC signatures and signs users in without email/phone", async () => {
    const botToken = "123456:TEST-BOT-TOKEN";
    const nowSec = 1795000000;
    const basePayload = { id: 987654321, first_name: "Zana", auth_date: nowSec };
    const dataCheck = Object.entries(basePayload)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secretKey = createHash("sha256").update(botToken).digest();
    const hash = createHmac("sha256", secretKey).update(dataCheck).digest("hex");

    expect(verifyTelegramAuthPayload({ ...basePayload, hash }, botToken, nowSec + 10)).toBe(true);
    expect(verifyTelegramAuthPayload({ ...basePayload, hash }, botToken, nowSec + 100_000)).toBe(false);
    expect(verifyTelegramAuthPayload({ ...basePayload, id: 1, hash }, botToken, nowSec + 10)).toBe(false);

    const tg = await loginWithTelegramUser(db, "987654321", "ckb");
    expect(tg.isNewUser).toBe(true);
    const session = await getSessionUser(db, tg.sessionToken);
    expect(session?.telegramUserId).toBe("987654321");
  });

  it("supports eligible-only feed filtering, custom lists, deadlines, .ics sync, export & delete", async () => {
    const [editor] = await db.insert(users).values({ email: "ed2@example.org", role: "editor" }).returning();
    const [student] = await db.insert(users).values({ email: "s2@example.org", birthYear: 2008 }).returning();
    await db.insert(profiles).values({
      userId: student!.id,
      educationLevel: "grade12",
      gpaPercent: 92,
      workExperienceYears: 0,
    });

    const [oppGo] = await db
      .insert(opportunities)
      .values({
        type: "scholarship",
        title: { en: "SAMPLE — Bachelor Full Grant" },
        providerName: "SAMPLE — Ministry",
        sourceUrl: "https://example.org/bachelor-go",
        deadline: new Date("2027-02-20T00:00:00Z"),
        deadlineStatus: "confirmed",
        status: "published",
        iraqiEligibility: "yes",
        verifiedBy: editor!.id,
        verifiedAt: new Date(),
      })
      .returning();
    await db.insert(eligibilityRules).values({
      opportunityId: oppGo!.id,
      field: "gpaPercent",
      operator: "gte",
      value: 80,
      mandatory: true,
    });

    const [oppNoGo] = await db
      .insert(opportunities)
      .values({
        type: "scholarship",
        title: { en: "SAMPLE — Senior Fellowship" },
        providerName: "SAMPLE — Council",
        sourceUrl: "https://example.org/fellow-nogo",
        deadline: new Date("2027-03-10T00:00:00Z"),
        deadlineStatus: "confirmed",
        status: "published",
        iraqiEligibility: "yes",
        verifiedBy: editor!.id,
        verifiedAt: new Date(),
      })
      .returning();
    await db.insert(eligibilityRules).values({
      opportunityId: oppNoGo!.id,
      field: "workExperienceYears",
      operator: "gte",
      value: 2,
      mandatory: true,
    });

    const goOnly = await listPublicOpportunities(
      db,
      { eligibleOnly: "go" },
      { educationLevel: "grade12", gpaPercent: 92, birthYear: 2008, workExperienceYears: 0 },
      new Date("2026-11-20T12:00:00Z"),
    );
    expect(goOnly.map((x) => x.opportunity.id)).toContain(oppGo!.id);
    expect(goOnly.map((x) => x.opportunity.id)).not.toContain(oppNoGo!.id);

    // Custom lists + tracker + deadlines + subscribable WebCal token
    const list = await createUserList(db, student!.id, "Top Bachelor Choices");
    expect(await addItemToList(db, student!.id, list.id, oppGo!.id)).toBe(true);
    const lists = await listUserLists(db, student!.id);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.items).toHaveLength(1);

    await upsertUserOpportunity(db, student!.id, {
      opportunityId: oppGo!.id,
      state: "applied",
      privateNote: "Submitted transcript",
      checklist: [{ label: "Passport copy", done: true }],
    });

    const deadlines = await getUserDeadlines(db, student!.id, new Date("2026-11-20T12:00:00Z"));
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.state).toBe("applied");
    expect(deadlines[0]?.privateNote).toBe("Submitted transcript");

    const calToken = await rotateCalendarToken(db, student!.id);
    const calOwner = await findUserByCalendarToken(db, calToken);
    expect(calOwner?.id).toBe(student!.id);
    const ics = await buildUserCalendarIcs(db, student!.id, "en", new Date("2026-11-20T12:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SAMPLE — Bachelor Full Grant");
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics).toContain("TRIGGER:-P2D");

    // Export JSON + remove item + delete list + delete account
    const exported = await exportUserData(db, student!.id);
    expect(exported?.account.email).toBe("s2@example.org");
    expect(exported?.lists).toHaveLength(1);
    expect(await removeItemFromList(db, student!.id, list.id, oppGo!.id)).toBe(true);
    expect(await deleteUserList(db, student!.id, list.id)).toBe(true);

    await db.insert(telegramLinks).values({
      userId: student!.id,
      chatIdHash: "a".repeat(64),
      chatIdEncrypted: "SAMPLE-encrypted",
    });
    await deleteUserAccount(db, student!.id);
    expect(await exportUserData(db, student!.id)).toBeNull();
    // Soft delete must still remove linked personal rows (cascades don't fire on soft delete)
    expect(await db.select().from(telegramLinks).where(eq(telegramLinks.userId, student!.id))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, student!.id)),
    ).toHaveLength(0);
  });
});
