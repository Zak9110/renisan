// ============================================
// Renisan Platform — M4 Telegram Deadline Reminders, Digests & Expiry Alerts
// Respects quiet hours in Asia/Baghdad (UTC+3), honors /stop immediately,
// only reminds on confirmed deadlines, and records every batch in digest_runs.
// ============================================

import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  alertDeliveries,
  digestRuns,
  notificationPrefs,
  opportunities,
  profiles,
  telegramLinks,
  userOpportunity,
  users,
} from "@/db/schema";
import { pickText, type Locale } from "@/i18n/config";
import { listPublicOpportunities } from "@/lib/opportunities/service";
import type { TelegramSender } from "./client";
import { decryptChatId } from "./crypto";

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000; // Asia/Baghdad is permanently UTC+3 (no DST)

/** Returns the current hour (0-23) in Asia/Baghdad. */
export function baghdadHour(date: Date): number {
  return new Date(date.getTime() + BAGHDAD_OFFSET_MS).getUTCHours();
}

/** Returns the calendar day index (UTC days since epoch) in Asia/Baghdad. */
function baghdadDayNumber(date: Date): number {
  return Math.floor((date.getTime() + BAGHDAD_OFFSET_MS) / 86_400_000);
}

/** Whole calendar days from `now` until `target` in Asia/Baghdad timezone. */
export function baghdadCalendarDiffDays(now: Date, target: Date): number {
  return baghdadDayNumber(target) - baghdadDayNumber(now);
}

/** Checks if `now` falls inside the user's quiet hours in Asia/Baghdad. */
export function isQuietHourBaghdad(now: Date, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  const hour = baghdadHour(now);
  if (quietStart < quietEnd) {
    return hour >= quietStart && hour < quietEnd;
  }
  // Overnight quiet window (default 22:00 - 08:00)
  return hour >= quietStart || hour < quietEnd;
}

function formatReminderMessage(
  locale: Locale,
  daysLeft: 7 | 2,
  title: string,
  provider: string,
  deadlineIso: string,
  detailUrl: string,
): string {
  switch (locale) {
    case "ar":
      return `⏰ تذكير بالموعد النهائي (${daysLeft === 7 ? "باقي 7 أيام" : "باقي يومان"})\n${title} — ${provider}\nالموعد: ${deadlineIso}\n${detailUrl}`;
    case "ckb":
      return `⏰ بیرهێنانەوەی دوا وادە (${daysLeft === 7 ? "7 ڕۆژ ماوە" : "2 ڕۆژ ماوە"})\n${title} — ${provider}\nدوا وادە: ${deadlineIso}\n${detailUrl}`;
    case "kmr":
      return `⏰ Bîranîna dema dawî (${daysLeft === 7 ? "7 roj mane" : "2 roj mane"})\n${title} — ${provider}\nDema dawî: ${deadlineIso}\n${detailUrl}`;
    default:
      return `⏰ Deadline reminder (${daysLeft} days left)\n${title} — ${provider}\nDeadline: ${deadlineIso}\n${detailUrl}`;
  }
}

function formatDigestHeader(locale: Locale, freq: "daily" | "weekly"): string {
  if (locale === "ar") {
    return freq === "daily" ? "📬 ملخص الفرص اليومي المطابقة لك:" : "📬 ملخص الفرص الأسبوعي المطابقة لك:";
  }
  if (locale === "ckb") {
    return freq === "daily"
      ? "📬 پوختەی ڕۆژانەی دەرفەتە گونجاوەکان:"
      : "📬 پوختەی هەفتانەی دەرفەتە گونجاوەکان:";
  }
  if (locale === "kmr") {
    return freq === "daily"
      ? "📬 Kurteya rojane ya derfetên guncaw:"
      : "📬 Kurteya heftane ya derfetên guncaw:";
  }
  return freq === "daily"
    ? "📬 Your daily matched opportunities digest:"
    : "📬 Your weekly matched opportunities digest:";
}

function formatExpiredMessage(locale: Locale, title: string, detailUrl: string): string {
  switch (locale) {
    case "ar":
      return `📦 انتهى الموعد النهائي لفرصة محفوظة: ${title}\nيمكنك تصفح فرص مشابهة مفتوحة هنا:\n${detailUrl}`;
    case "ckb":
      return `📦 دوا وادەی دەرفەتێکی پاشەکەوتکراو تەواو بوو: ${title}\nدەرفەتی هاوشێوە لێرە ببینە:\n${detailUrl}`;
    case "kmr":
      return `📦 Dema derfeteke tomarkirî derbas bû: ${title}\nDerfetên wekhev li vir bibîne:\n${detailUrl}`;
    default:
      return `📦 A saved opportunity has expired: ${title}\nBrowse similar open opportunities here:\n${detailUrl}`;
  }
}

export interface AlertDispatchDeps {
  db: Db;
  encryptionKey: string;
  appUrl: string;
  sender: TelegramSender;
}

export interface AlertDispatchSummary {
  reminder7dSent: number;
  reminder2dSent: number;
  digestDailySent: number;
  digestWeeklySent: number;
  expiredNotified: number;
  skippedQuietHours: number;
  errors: number;
}

/** Sends once per (user, key). A failed send releases the claim so the next run can retry. */
async function sendOnce(
  deps: AlertDispatchDeps,
  userId: string,
  alertKey: string,
  chatId: string,
  text: string,
  now: Date,
): Promise<"sent" | "duplicate" | "failed"> {
  const claimed = await deps.db
    .insert(alertDeliveries)
    .values({ userId, alertKey, sentAt: now })
    .onConflictDoNothing()
    .returning({ key: alertDeliveries.alertKey });
  if (claimed.length === 0) return "duplicate";
  const res = await deps.sender.sendMessage(chatId, text);
  if (res.ok) return "sent";
  await deps.db
    .delete(alertDeliveries)
    .where(and(eq(alertDeliveries.userId, userId), eq(alertDeliveries.alertKey, alertKey)));
  return "failed";
}

/** Listings expired in the last 3 days: savers in quiet hours at expiry are told on a later run. */
export async function recentlyExpiredIds(db: Db, now: Date = new Date()): Promise<string[]> {
  const rows = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.status, "expired"),
        gte(opportunities.deadline, new Date(now.getTime() - 3 * 86_400_000)),
      ),
    );
  return rows.map((r) => r.id);
}

export async function pruneAlertDeliveries(db: Db, now: Date = new Date()): Promise<void> {
  await db
    .delete(alertDeliveries)
    .where(lt(alertDeliveries.sentAt, new Date(now.getTime() - 60 * 86_400_000)));
}

async function loadActiveLinkedUsers(db: Db) {
  return db
    .select({
      user: users,
      profile: profiles,
      link: telegramLinks,
      prefs: notificationPrefs,
    })
    .from(telegramLinks)
    .innerJoin(users, eq(telegramLinks.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(notificationPrefs, eq(notificationPrefs.userId, users.id))
    .where(and(isNull(telegramLinks.stoppedAt), isNull(users.deletedAt)));
}

/**
 * Dispatches 7-day and 2-day confirmed deadline reminders plus daily/weekly digests
 * to linked, non-stopped Telegram users outside their Baghdad quiet hours.
 */
export async function dispatchTelegramAlerts(
  deps: AlertDispatchDeps,
  options: {
    now?: Date;
    includeDigests?: boolean;
    forceWeeklyDigest?: boolean;
    ignoreQuietHours?: boolean;
  } = {},
): Promise<AlertDispatchSummary> {
  const now = options.now ?? new Date();
  const base = deps.appUrl.replace(/\/+$/, "");
  const linked = await loadActiveLinkedUsers(deps.db);

  const summary: AlertDispatchSummary = {
    reminder7dSent: 0,
    reminder2dSent: 0,
    digestDailySent: 0,
    digestWeeklySent: 0,
    expiredNotified: 0,
    skippedQuietHours: 0,
    errors: 0,
  };

  let err7d = 0;
  let err2d = 0;
  let errDaily = 0;
  let errWeekly = 0;

  // 1. Deadline reminders (7d and 2d) for saved/applied confirmed listings
  const trackedRows = await deps.db
    .select({
      userId: userOpportunity.userId,
      state: userOpportunity.state,
      opp: opportunities,
    })
    .from(userOpportunity)
    .innerJoin(opportunities, eq(userOpportunity.opportunityId, opportunities.id))
    .where(
      and(
        eq(opportunities.status, "published"),
        isNull(opportunities.hiddenAt),
        eq(opportunities.rolling, false),
        eq(opportunities.deadlineStatus, "confirmed"),
      ),
    );

  const trackedByUser = new Map<string, (typeof trackedRows)[number][]>();
  for (const row of trackedRows) {
    if (row.state !== "saved" && row.state !== "applied") continue;
    const arr = trackedByUser.get(row.userId) ?? [];
    arr.push(row);
    trackedByUser.set(row.userId, arr);
  }

  const isBaghdadMonday = new Date(now.getTime() + BAGHDAD_OFFSET_MS).getUTCDay() === 1;

  for (const entry of linked) {
    const quietStart = entry.prefs?.quietStart ?? 22;
    const quietEnd = entry.prefs?.quietEnd ?? 8;
    if (!options.ignoreQuietHours && isQuietHourBaghdad(now, quietStart, quietEnd)) {
      summary.skippedQuietHours++;
      continue;
    }

    let chatId: string;
    try {
      chatId = decryptChatId(entry.link.chatIdEncrypted, deps.encryptionKey);
    } catch {
      summary.errors++;
      continue;
    }

    const locale = entry.user.locale;
    const remindersEnabled = entry.prefs?.deadlineReminders ?? true;

    if (remindersEnabled) {
      const userItems = trackedByUser.get(entry.user.id) ?? [];
      for (const item of userItems) {
        if (!item.opp.deadline) continue;
        const diff = baghdadCalendarDiffDays(now, item.opp.deadline);
        if (diff !== 7 && diff !== 2) continue;

        const title = pickText(item.opp.title, locale) || item.opp.providerName;
        const url = `${base}/${locale}/opportunities/${item.opp.id}`;
        const text = formatReminderMessage(
          locale,
          diff,
          title,
          item.opp.providerName,
          item.opp.deadline.toISOString().slice(0, 10),
          url,
        );
        const due = item.opp.deadline.toISOString().slice(0, 10);
        const res = await sendOnce(deps, entry.user.id, `r${diff}:${item.opp.id}:${due}`, chatId, text, now);
        if (res === "sent") {
          if (diff === 7) summary.reminder7dSent++;
          else summary.reminder2dSent++;
        } else if (res === "failed") {
          summary.errors++;
          if (diff === 7) err7d++;
          else err2d++;
        }
      }
    }

    if (options.includeDigests) {
      const freq = entry.prefs?.digestFrequency ?? "weekly";
      const shouldSendDaily = freq === "daily";
      const shouldSendWeekly = freq === "weekly" && (isBaghdadMonday || Boolean(options.forceWeeklyDigest));

      if (shouldSendDaily || shouldSendWeekly) {
        const profile = entry.profile
          ? {
              educationLevel: entry.profile.educationLevel,
              fieldOfStudy: entry.profile.fieldOfStudy,
              gpaPercent: entry.profile.gpaPercent,
              englishTestType: entry.profile.englishTestType,
              englishScore: entry.profile.englishScore,
              workExperienceYears: entry.profile.workExperienceYears,
              birthYear: entry.user.birthYear,
              currentCountry: entry.profile.currentCountry,
              idpSelfDeclared: entry.profile.idpSelfDeclared,
            }
          : null;

        const matches = (
          await listPublicOpportunities(deps.db, { eligibleOnly: profile ? "go_maybe" : "all" }, profile, now)
        ).slice(0, 5);

        if (matches.length > 0) {
          const kind = shouldSendDaily ? "daily" : "weekly";
          const lines = matches.map(({ opportunity, match }) => {
            const title = pickText(opportunity.title, locale) || opportunity.providerName;
            const badge = match ? `[${match.verdict}] ` : "";
            return `• ${badge}${title}\n  ${base}/${locale}/opportunities/${opportunity.id}`;
          });
          const day = baghdadDayNumber(now);
          const period = kind === "daily" ? day : Math.floor((day + 3) / 7); // weeks start on Monday
          const res = await sendOnce(
            deps,
            entry.user.id,
            `digest:${kind}:${period}`,
            chatId,
            `${formatDigestHeader(locale, kind)}\n\n${lines.join("\n")}`,
            now,
          );
          if (res === "sent") {
            if (kind === "daily") summary.digestDailySent++;
            else summary.digestWeeklySent++;
          } else if (res === "failed") {
            summary.errors++;
            if (kind === "daily") errDaily++;
            else errWeekly++;
          }
        }
      }
    }
  }

  const finishedAt = new Date();
  await deps.db.insert(digestRuns).values([
    {
      kind: "reminder_7d",
      startedAt: now,
      finishedAt,
      sentCount: summary.reminder7dSent,
      errorCount: err7d,
    },
    {
      kind: "reminder_2d",
      startedAt: now,
      finishedAt,
      sentCount: summary.reminder2dSent,
      errorCount: err2d,
    },
  ]);

  if (options.includeDigests) {
    await deps.db.insert(digestRuns).values([
      {
        kind: "digest_daily",
        startedAt: now,
        finishedAt,
        sentCount: summary.digestDailySent,
        errorCount: errDaily,
      },
      {
        kind: "digest_weekly",
        startedAt: now,
        finishedAt,
        sentCount: summary.digestWeeklySent,
        errorCount: errWeekly,
      },
    ]);
  }

  return summary;
}

/** Notifies linked, active savers once when their saved opportunity expires (F7). */
export async function notifyExpiredSavers(
  deps: AlertDispatchDeps,
  expiredOpportunityIds: string[],
  now: Date = new Date(),
): Promise<number> {
  if (expiredOpportunityIds.length === 0) return 0;

  const base = deps.appUrl.replace(/\/+$/, "");
  const rows = await deps.db
    .select({
      user: users,
      link: telegramLinks,
      prefs: notificationPrefs,
      opp: opportunities,
    })
    .from(userOpportunity)
    .innerJoin(opportunities, eq(userOpportunity.opportunityId, opportunities.id))
    .innerJoin(telegramLinks, eq(userOpportunity.userId, telegramLinks.userId))
    .innerJoin(users, eq(userOpportunity.userId, users.id))
    .leftJoin(notificationPrefs, eq(notificationPrefs.userId, users.id))
    .where(
      and(
        inArray(userOpportunity.opportunityId, expiredOpportunityIds),
        isNull(telegramLinks.stoppedAt),
        isNull(users.deletedAt),
      ),
    );

  let sent = 0;
  for (const r of rows) {
    const quietStart = r.prefs?.quietStart ?? 22;
    const quietEnd = r.prefs?.quietEnd ?? 8;
    if (isQuietHourBaghdad(now, quietStart, quietEnd)) continue;
    try {
      const chatId = decryptChatId(r.link.chatIdEncrypted, deps.encryptionKey);
      const title = pickText(r.opp.title, r.user.locale) || r.opp.providerName;
      const url = `${base}/${r.user.locale}/opportunities/${r.opp.id}`;
      const res = await sendOnce(
        deps,
        r.user.id,
        `expired:${r.opp.id}`,
        chatId,
        formatExpiredMessage(r.user.locale, title, url),
        now,
      );
      if (res === "sent") sent++;
    } catch {
      // ignore corrupted encrypted row
    }
  }
  return sent;
}
