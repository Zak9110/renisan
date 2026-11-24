import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { digestRuns, opportunities, profiles, userOpportunity, users } from "@/db/schema";
import { decryptChatId, encryptChatId } from "@/lib/telegram/crypto";
import type { TelegramSender } from "@/lib/telegram/client";
import {
  handleTelegramUpdate,
  issueTelegramLinkCode,
  updateNotificationSettings,
} from "@/lib/telegram/service";
import {
  baghdadCalendarDiffDays,
  dispatchTelegramAlerts,
  isQuietHourBaghdad,
  notifyExpiredSavers,
} from "@/lib/telegram/alerts";

class RecordingTelegramSender implements TelegramSender {
  messages: { chatId: string; text: string }[] = [];
  async sendMessage(chatId: string, text: string) {
    this.messages.push({ chatId, text });
    return { ok: true };
  }
}

const SECRET = "test-secret-0123456789abcdef0123456789";
const ENC_KEY = "test-chatid-encryption-key-0123456789";

describe("M4 Telegram alerts, linking, quiet hours & /stop", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("encrypts and decrypts Telegram chat IDs with AES-256-GCM", () => {
    const encrypted = encryptChatId("987654321", ENC_KEY);
    expect(encrypted).not.toContain("987654321");
    expect(decryptChatId(encrypted, ENC_KEY)).toBe("987654321");
    expect(() => decryptChatId(encrypted, "wrong-key")).toThrow();
  });

  it("evaluates Asia/Baghdad quiet hours and calendar day diffs accurately", () => {
    // 20:00 UTC = 23:00 Baghdad (inside 22..8 overnight quiet window)
    const nightBaghdad = new Date("2026-11-23T20:00:00Z");
    // 09:00 UTC = 12:00 Baghdad (outside 22..8)
    const noonBaghdad = new Date("2026-11-23T09:00:00Z");

    expect(isQuietHourBaghdad(nightBaghdad, 22, 8)).toBe(true);
    expect(isQuietHourBaghdad(noonBaghdad, 22, 8)).toBe(false);
    expect(isQuietHourBaghdad(noonBaghdad, 10, 14)).toBe(true);
    expect(isQuietHourBaghdad(noonBaghdad, 8, 8)).toBe(false);

    expect(baghdadCalendarDiffDays(new Date("2026-11-23T09:00:00Z"), new Date("2026-11-30T15:00:00Z"))).toBe(
      7,
    );
    expect(baghdadCalendarDiffDays(new Date("2026-11-23T09:00:00Z"), new Date("2026-11-25T15:00:00Z"))).toBe(
      2,
    );
  });

  it("links account, sends 7d/2d reminders + digest + expiry alert, respects quiet hours, and honors /stop", async () => {
    const handle = createDb("pglite://memory");
    close = handle.close;
    const db = handle.db;
    await runMigrations(db, "pglite://memory");

    const sender = new RecordingTelegramSender();
    const nowNoonBaghdad = new Date("2026-11-23T09:00:00Z"); // 12:00 Baghdad (Monday)
    const nowNightBaghdad = new Date("2026-11-23T20:00:00Z"); // 23:00 Baghdad

    const [editor] = await db
      .insert(users)
      .values({ email: "editor@example.org", role: "editor", locale: "en" })
      .returning();
    const [student] = await db
      .insert(users)
      .values({ email: "student@example.org", role: "member", locale: "en" })
      .returning();
    await db.insert(profiles).values({ userId: student!.id, educationLevel: "undergrad", gpaPercent: 88 });

    // Create 3 saved listings: 7d confirmed, 2d confirmed, and 7d estimated (must NOT remind!)
    const [opp7d] = await db
      .insert(opportunities)
      .values({
        type: "scholarship",
        title: { en: "SAMPLE — 7-Day Confirmed Grant", ckb: "نموونە — سکۆلارشیپی ٧ ڕۆژ" },
        providerName: "Sample Org",
        sourceUrl: "https://example.org/7d",
        deadline: new Date("2026-11-30T12:00:00Z"),
        deadlineStatus: "confirmed",
        rolling: false,
        status: "published",
        iraqiEligibility: "yes",
        verifiedBy: editor!.id,
        verifiedAt: nowNoonBaghdad,
      })
      .returning();

    const [opp2d] = await db
      .insert(opportunities)
      .values({
        type: "fellowship",
        title: { en: "SAMPLE — 2-Day Urgent Fellowship", ckb: "نموونە — فێلۆشیپی ٢ ڕۆژ" },
        providerName: "Sample Org",
        sourceUrl: "https://example.org/2d",
        deadline: new Date("2026-11-25T12:00:00Z"),
        deadlineStatus: "confirmed",
        rolling: false,
        status: "published",
        iraqiEligibility: "yes",
        verifiedBy: editor!.id,
        verifiedAt: nowNoonBaghdad,
      })
      .returning();

    const [oppEstimated] = await db
      .insert(opportunities)
      .values({
        type: "scholarship",
        title: { en: "SAMPLE — Estimated Draft" },
        providerName: "Sample Org",
        sourceUrl: "https://example.org/est",
        deadline: new Date("2026-11-30T12:00:00Z"),
        deadlineStatus: "estimated",
        rolling: false,
        status: "in_review",
        iraqiEligibility: "yes",
      })
      .returning();

    await db.insert(userOpportunity).values([
      { userId: student!.id, opportunityId: opp7d!.id, state: "saved" },
      { userId: student!.id, opportunityId: opp2d!.id, state: "applied" },
      { userId: student!.id, opportunityId: oppEstimated!.id, state: "saved" },
    ]);

    // 1. Issue linking code & link via webhook
    const issued = await issueTelegramLinkCode(db, student!.id, SECRET, "renisan_bot", nowNoonBaghdad);
    expect(issued.deepLink).toBe(`https://t.me/renisan_bot?start=${issued.code}`);

    const botDeps = {
      db,
      secret: SECRET,
      encryptionKey: ENC_KEY,
      appUrl: "https://renisan.example.org",
      sender,
    };

    const linkRes = await handleTelegramUpdate(
      botDeps,
      { message: { chat: { id: 555001 }, text: `/start ${issued.code}` } },
      nowNoonBaghdad,
    );
    expect(linkRes.command).toBe("link_success");

    // Replaying the same single-use code fails
    const replayRes = await handleTelegramUpdate(
      botDeps,
      { message: { chat: { id: 555001 }, text: `/start ${issued.code}` } },
      nowNoonBaghdad,
    );
    expect(replayRes.command).toBe("link_invalid");

    // 2. Switch language via /language ckb and verify /saved & /matches reply
    const langRes = await handleTelegramUpdate(
      botDeps,
      { message: { chat: { id: 555001 }, text: "/language ckb" } },
      nowNoonBaghdad,
    );
    expect(langRes.command).toBe("language");
    const [reloadedUser] = await db.select().from(users).where(eq(users.id, student!.id));
    expect(reloadedUser!.locale).toBe("ckb");

    const savedRes = await handleTelegramUpdate(
      botDeps,
      { message: { chat: { id: 555001 }, text: "/saved" } },
      nowNoonBaghdad,
    );
    expect(savedRes.command).toBe("saved");
    expect(savedRes.replyText).toContain("نموونە");

    const matchesRes = await handleTelegramUpdate(
      botDeps,
      { message: { chat: { id: 555001 }, text: "/matches" } },
      nowNoonBaghdad,
    );
    expect(matchesRes.command).toBe("matches");

    // 3. Configure daily digest & verify quiet hours block night dispatch
    await updateNotificationSettings(
      db,
      student!.id,
      { digestFrequency: "daily", deadlineReminders: true, quietStart: 22, quietEnd: 8 },
      nowNoonBaghdad,
    );

    sender.messages = [];
    const quietSummary = await dispatchTelegramAlerts(botDeps, {
      now: nowNightBaghdad,
      includeDigests: true,
    });
    expect(quietSummary.skippedQuietHours).toBe(1);
    expect(sender.messages).toHaveLength(0);

    // 4. Daytime dispatch sends exactly 1x 7d reminder, 1x 2d reminder, and 1x daily digest
    const daySummary = await dispatchTelegramAlerts(botDeps, {
      now: nowNoonBaghdad,
      includeDigests: true,
    });
    expect(daySummary.reminder7dSent).toBe(1);
    expect(daySummary.reminder2dSent).toBe(1);
    expect(daySummary.digestDailySent).toBe(1);
    expect(sender.messages).toHaveLength(3);
    expect(sender.messages.some((m) => m.text.includes("7 ڕۆژ"))).toBe(true);
    expect(sender.messages.some((m) => m.text.includes("2 ڕۆژ"))).toBe(true);

    // A second run the same day (cron retry, hourly alerts) must not message the user again
    await dispatchTelegramAlerts(botDeps, { now: nowNoonBaghdad, includeDigests: true });
    expect(sender.messages).toHaveLength(3);

    // Verify digest_runs rows were recorded
    const runs = await db.select().from(digestRuns);
    expect(runs.length).toBeGreaterThanOrEqual(4);

    // 5. Expiry notification notifies saver
    sender.messages = [];
    const expSent = await notifyExpiredSavers(botDeps, [opp2d!.id], nowNoonBaghdad);
    expect(expSent).toBe(1);

    // 6. User sends /stop — future alerts MUST send 0 messages
    const stopRes = await handleTelegramUpdate(
      botDeps,
      { message: { chat: { id: 555001 }, text: "/stop" } },
      nowNoonBaghdad,
    );
    expect(stopRes.command).toBe("stop");

    sender.messages = [];
    const afterStop = await dispatchTelegramAlerts(botDeps, {
      now: nowNoonBaghdad,
      includeDigests: true,
    });
    expect(afterStop.reminder7dSent).toBe(0);
    expect(afterStop.reminder2dSent).toBe(0);
    expect(afterStop.digestDailySent).toBe(0);
    expect(sender.messages).toHaveLength(0);
  });
});
