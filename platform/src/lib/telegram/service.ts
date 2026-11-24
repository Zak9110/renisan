// ============================================
// Renisan Platform — M4 Telegram Bot & Notification Preferences Service
// Handles account linking via single-use code, webhook commands
// (/start, /link, /saved, /matches, /language, /stop, /help),
// and notification preference CRUD. Never logs PII, tokens, or chat IDs.
// ============================================

import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notificationPrefs, profiles, telegramLinkCodes, telegramLinks, users } from "@/db/schema";
import { isLocale, pickText, type Locale } from "@/i18n/config";
import { getUserDeadlines } from "@/lib/lists/service";
import { listPublicOpportunities } from "@/lib/opportunities/service";
import type { TelegramSender } from "./client";
import { encryptChatId, generateLinkCode, hashChatId, hashLinkCode } from "./crypto";

const LINK_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id: number | string; type?: string };
    from?: { id: number | string; language_code?: string };
  };
}

export interface TelegramDeps {
  db: Db;
  secret: string;
  encryptionKey: string;
  appUrl: string;
  sender: TelegramSender;
}

const BOT_COPY: Record<
  Locale,
  {
    welcomeLinked: string;
    needCode: string;
    invalidCode: string;
    stopped: string;
    notLinked: string;
    langUpdated: string;
    langUsage: string;
    noSaved: string;
    savedHeader: string;
    noMatches: string;
    matchesHeader: string;
    help: string;
  }
> = {
  en: {
    welcomeLinked:
      "Your Renisan account is now linked. You will receive deadline reminders (7d & 2d) and opportunity digests based on your settings. Send /saved, /matches, /language <ar|ckb|kmr|en>, or /stop at any time.",
    needCode:
      "Welcome to Renisan! To link your account, open your Account page on the Renisan website, generate a linking code, and send: /start YOURCODE",
    invalidCode: "That linking code is invalid or expired. Please generate a new code on your Account page.",
    stopped:
      "Telegram alerts have been paused for your account. You will not receive reminders or digests until you re-link from your Account page.",
    notLinked: "This Telegram chat is not linked to a Renisan account yet. Send /start YOURCODE to link.",
    langUpdated: "Alert language updated to English.",
    langUsage: "Choose a language: /language ar | /language ckb | /language kmr | /language en",
    noSaved: "You have no saved upcoming opportunities yet.",
    savedHeader: "Your saved deadlines:",
    noMatches:
      "No open matched opportunities found right now. Update your profile on the website for better matches.",
    matchesHeader: "Top matched opportunities for you:",
    help: "Renisan Bot commands:\n/start CODE — link account\n/saved — upcoming saved deadlines\n/matches — top eligible opportunities\n/language ar|ckb|kmr|en — change language\n/stop — stop all alerts",
  },
  ar: {
    welcomeLinked:
      "تم ربط حسابك في رينيسان بنجاح. ستصلك تنبيهات المواعيد النهائية (قبل 7 أيام و2 يوم) والملخصات حسب إعداداتك. أرسل /saved أو /matches أو /language أو /stop في أي وقت.",
    needCode:
      "أهلاً بك في رينيسان! لربط حسابك، افتح صفحة حسابي في موقع رينيسان، أنشئ رمز ربط، ثم أرسل: /start YOURCODE",
    invalidCode: "رمز الربط غير صالح أو منتهي الصلاحية. أنشئ رمزاً جديداً من صفحة حسابي.",
    stopped: "تم إيقاف تنبيهات تيليغرام لحسابك. لن تصلك أي رسائل حتى تعيد الربط من صفحة حسابي.",
    notLinked: "هذه المحادثة غير مرتبطة بحساب رينيسان بعد. أرسل /start YOURCODE للربط.",
    langUpdated: "تم تحديث لغة التنبيهات إلى العربية.",
    langUsage: "اختر اللغة: /language ar | /language ckb | /language kmr | /language en",
    noSaved: "لا توجد فرص محفوظة بمواعيد قادمة حالياً.",
    savedHeader: "مواعيدك النهائية المحفوظة:",
    noMatches: "لا توجد فرص مطابقة حالياً. حدّث ملفك في الموقع لتحسين المطابقة.",
    matchesHeader: "أفضل الفرص المطابقة لك:",
    help: "أوامر بوت رينيسان:\n/start CODE — ربط الحساب\n/saved — المواعيد المحفوظة\n/matches — الفرص المطابقة لك\n/language ar|ckb|kmr|en — تغيير اللغة\n/stop — إيقاف جميع التنبيهات",
  },
  ckb: {
    welcomeLinked:
      "هەژماری ڕێنیسانەکەت بەسەرکەوتوویی بەسترایەوە. ئاگادارکردنەوەی دوا وادەکان (7 ڕۆژ و 2 ڕۆژ پێشتر) پێت دەگات. هەر کاتێک بتەوێت /saved یان /matches یان /language یان /stop بنێرە.",
    needCode:
      "بەخێربێیت بۆ ڕێنیسان! بۆ بەستنەوەی هەژمارەکەت، پەڕەی هەژمار لە ماڵپەڕی ڕێنیسان بکەرەوە، کۆدێک دروست بکە و بنێرە: /start YOURCODE",
    invalidCode: "کۆدی بەستنەوە هەڵەیە یان بەسەرچووە. کۆدێکی نوێ لە پەڕەی هەژمار دروست بکە.",
    stopped: "ئاگادارکردنەوەکانی تێلیگرام بۆ هەژمارەکەت وەستێنران.",
    notLinked: "ئەم چاتە هێشتا بە هەژماری ڕێنیسان نەبەستراوەتەوە. /start YOURCODE بنێرە.",
    langUpdated: "زمانی ئاگادارکردنەوەکان گۆڕدرا بۆ کوردی (سۆرانی).",
    langUsage: "زمانێک هەڵبژێرە: /language ar | /language ckb | /language kmr | /language en",
    noSaved: "هێشتا هیچ دەرفەتێکی پاشەکەوتکراوت نییە.",
    savedHeader: "دوا وادە پاشەکەوتکراوەکانت:",
    noMatches: "ئێستا هیچ دەرفەتێکی گونجاو نەدۆزرایەوە.",
    matchesHeader: "باشترین دەرفەتە گونجاوەکان بۆ تۆ:",
    help: "فەرمانەکانی بۆتی ڕێنیسان:\n/start CODE — بەستنەوەی هەژمار\n/saved — دوا وادەکان\n/matches — دەرفەتە گونجاوەکان\n/language ar|ckb|kmr|en — گۆڕینی زمان\n/stop — وەستاندنی ئاگادارکردنەوە",
  },
  kmr: {
    welcomeLinked:
      "Hesabê te yê Renisan hat girêdan. Tu dê bîranînên demên dawî (7 roj û 2 roj berê) werbigirî. Her dem dikarî /saved, /matches, /language an /stop bişînî.",
    needCode:
      "Bi xêr hatî Renisan! Ji bo girêdana hesabê xwe, rûpela Hesab veke, kodek çêbike û bişîne: /start YOURCODE",
    invalidCode: "Ev koda girêdanê şaş e an dema wê derbas bûye. Ji rûpela Hesab kodeke nû çêbike.",
    stopped: "Agahdariyên Telegramê ji bo hesabê te hatin rawestandin.",
    notLinked: "Ev sohbet hîn bi hesabê Renisan nehatiye girêdan. /start YOURCODE bişîne.",
    langUpdated: "Zimanê agahdariyan bû Kurdî (Kurmancî).",
    langUsage: "Zimanekî hilbijêre: /language ar | /language ckb | /language kmr | /language en",
    noSaved: "Hîn ti derfetên tomarkirî tune ne.",
    savedHeader: "Demên dawî yên tomarkirî:",
    noMatches: "Niha ti derfetên guncaw nehatin dîtin.",
    matchesHeader: "Derfetên herî guncaw ji bo te:",
    help: "Fermanên bota Renisan:\n/start CODE — girêdana hesab\n/saved — demên tomarkirî\n/matches — derfetên guncaw\n/language ar|ckb|kmr|en — guherîna ziman\n/stop — rawestandina agahdariyan",
  },
};

export async function issueTelegramLinkCode(
  db: Db,
  userId: string,
  secret: string,
  botUsername?: string,
  now: Date = new Date(),
) {
  // Invalidate any prior unused link codes for this user
  await db
    .update(telegramLinkCodes)
    .set({ usedAt: now })
    .where(and(eq(telegramLinkCodes.userId, userId), isNull(telegramLinkCodes.usedAt)));

  const code = generateLinkCode(8);
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);

  await db.insert(telegramLinkCodes).values({
    codeHash: hashLinkCode(code, secret),
    userId,
    expiresAt,
  });

  const cleanBot = botUsername?.replace(/^@/, "").trim();
  const deepLink = cleanBot ? `https://t.me/${cleanBot}?start=${code}` : null;

  return { code, expiresAt, deepLink };
}

export async function getNotificationSettings(db: Db, userId: string) {
  await db.insert(notificationPrefs).values({ userId }).onConflictDoNothing();
  const [prefs] = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId))
    .limit(1);
  const [link] = await db
    .select({ linkedAt: telegramLinks.linkedAt, stoppedAt: telegramLinks.stoppedAt })
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .limit(1);

  return {
    digestFrequency: prefs?.digestFrequency ?? ("weekly" as const),
    deadlineReminders: prefs?.deadlineReminders ?? true,
    quietStart: prefs?.quietStart ?? 22,
    quietEnd: prefs?.quietEnd ?? 8,
    telegram: {
      linked: Boolean(link),
      active: Boolean(link && !link.stoppedAt),
      linkedAt: link?.linkedAt ?? null,
      stoppedAt: link?.stoppedAt ?? null,
    },
  };
}

export async function updateNotificationSettings(
  db: Db,
  userId: string,
  input: {
    digestFrequency?: "daily" | "weekly" | "off";
    deadlineReminders?: boolean;
    quietStart?: number;
    quietEnd?: number;
  },
  now: Date = new Date(),
) {
  await db.insert(notificationPrefs).values({ userId }).onConflictDoNothing();
  await db
    .update(notificationPrefs)
    .set({
      ...(input.digestFrequency !== undefined ? { digestFrequency: input.digestFrequency } : {}),
      ...(input.deadlineReminders !== undefined ? { deadlineReminders: input.deadlineReminders } : {}),
      ...(input.quietStart !== undefined ? { quietStart: input.quietStart } : {}),
      ...(input.quietEnd !== undefined ? { quietEnd: input.quietEnd } : {}),
      updatedAt: now,
    })
    .where(eq(notificationPrefs.userId, userId));

  return getNotificationSettings(db, userId);
}

export async function unlinkTelegramAccount(db: Db, userId: string): Promise<void> {
  await db.delete(telegramLinks).where(eq(telegramLinks.userId, userId));
}

async function findLinkedUserByChatId(db: Db, chatId: string, secret: string) {
  const hash = hashChatId(chatId, secret);
  const rows = await db
    .select({
      user: users,
      profile: profiles,
      link: telegramLinks,
    })
    .from(telegramLinks)
    .innerJoin(users, eq(telegramLinks.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(telegramLinks.chatIdHash, hash))
    .limit(1);

  const row = rows[0];
  if (!row || row.user.deletedAt) return null;
  return row;
}

export interface BotCommandResult {
  handled: boolean;
  command?: string;
  replyText?: string;
}

export async function handleTelegramUpdate(
  deps: TelegramDeps,
  update: TelegramUpdate,
  now: Date = new Date(),
): Promise<BotCommandResult> {
  const msg = update.message;
  if (!msg?.chat?.id || typeof msg.text !== "string") {
    return { handled: false };
  }
  // Personal data must never be posted into a group the bot was added to.
  if (msg.chat.type && msg.chat.type !== "private") return { handled: false };

  const chatId = String(msg.chat.id);
  const trimmed = msg.text.trim();
  const [rawCmd = "", ...rest] = trimmed.split(/\s+/);
  const cmd = rawCmd.toLowerCase().split("@")[0] ?? "";
  const arg = rest.join(" ").trim();

  const existing = await findLinkedUserByChatId(deps.db, chatId, deps.secret);
  const fallbackLocale: Locale =
    existing?.user.locale ??
    (msg.from?.language_code && isLocale(msg.from.language_code.slice(0, 2))
      ? (msg.from.language_code.slice(0, 2) as Locale)
      : "ar");

  const reply = async (text: string, command: string): Promise<BotCommandResult> => {
    await deps.sender.sendMessage(chatId, text);
    return { handled: true, command, replyText: text };
  };

  if (cmd === "/start" || cmd === "/link") {
    if (!arg) {
      return reply(BOT_COPY[fallbackLocale].needCode, "start");
    }

    const codeHash = hashLinkCode(arg, deps.secret);
    const [codeRow] = await deps.db
      .select()
      .from(telegramLinkCodes)
      .where(and(eq(telegramLinkCodes.codeHash, codeHash), isNull(telegramLinkCodes.usedAt)))
      .limit(1);

    if (!codeRow || codeRow.expiresAt.getTime() <= now.getTime()) {
      return reply(BOT_COPY[fallbackLocale].invalidCode, "link_invalid");
    }

    // Consume single-use code
    const consumed = await deps.db
      .update(telegramLinkCodes)
      .set({ usedAt: now })
      .where(and(eq(telegramLinkCodes.codeHash, codeHash), isNull(telegramLinkCodes.usedAt)))
      .returning({ userId: telegramLinkCodes.userId });
    if (consumed.length === 0) {
      return reply(BOT_COPY[fallbackLocale].invalidCode, "link_invalid");
    }

    const [user] = await deps.db.select().from(users).where(eq(users.id, codeRow.userId)).limit(1);
    if (!user || user.deletedAt) {
      return reply(BOT_COPY[fallbackLocale].invalidCode, "link_invalid");
    }

    const cHash = hashChatId(chatId, deps.secret);
    const cEncrypted = encryptChatId(chatId, deps.encryptionKey);

    // If this chat was previously linked to another account, detach it cleanly
    await deps.db.delete(telegramLinks).where(eq(telegramLinks.chatIdHash, cHash));

    await deps.db
      .insert(telegramLinks)
      .values({
        userId: user.id,
        chatIdHash: cHash,
        chatIdEncrypted: cEncrypted,
        linkedAt: now,
        stoppedAt: null,
      })
      .onConflictDoUpdate({
        target: telegramLinks.userId,
        set: {
          chatIdHash: cHash,
          chatIdEncrypted: cEncrypted,
          linkedAt: now,
          stoppedAt: null,
        },
      });

    await deps.db.insert(notificationPrefs).values({ userId: user.id }).onConflictDoNothing();

    return reply(BOT_COPY[user.locale].welcomeLinked, "link_success");
  }

  if (cmd === "/stop") {
    if (!existing) return reply(BOT_COPY[fallbackLocale].notLinked, "stop_unlinked");
    await deps.db
      .update(telegramLinks)
      .set({ stoppedAt: now })
      .where(eq(telegramLinks.userId, existing.user.id));
    return reply(BOT_COPY[existing.user.locale].stopped, "stop");
  }

  if (cmd === "/language") {
    if (!existing) return reply(BOT_COPY[fallbackLocale].notLinked, "language_unlinked");
    const target = arg.toLowerCase();
    if (!isLocale(target)) {
      return reply(BOT_COPY[existing.user.locale].langUsage, "language_usage");
    }
    await deps.db.update(users).set({ locale: target }).where(eq(users.id, existing.user.id));
    return reply(BOT_COPY[target].langUpdated, "language");
  }

  if (cmd === "/saved") {
    if (!existing) return reply(BOT_COPY[fallbackLocale].notLinked, "saved_unlinked");
    const locale = existing.user.locale;
    const deadlines = (await getUserDeadlines(deps.db, existing.user.id, now))
      .filter((d) => d.urgency !== "expired")
      .slice(0, 8);
    if (deadlines.length === 0) {
      return reply(BOT_COPY[locale].noSaved, "saved_empty");
    }
    const base = deps.appUrl.replace(/\/+$/, "");
    const lines = deadlines.map((d) => {
      const title = pickText(d.title, locale) || d.providerName;
      const dateStr = d.rolling
        ? "Rolling"
        : d.deadline
          ? `${d.deadline.toISOString().slice(0, 10)}${d.daysLeft != null ? ` (${d.daysLeft}d)` : ""}`
          : "TBD";
      return `• ${title} — ${dateStr}\n  ${base}/${locale}/opportunities/${d.opportunityId}`;
    });
    return reply(`${BOT_COPY[locale].savedHeader}\n\n${lines.join("\n")}`, "saved");
  }

  if (cmd === "/matches") {
    if (!existing) return reply(BOT_COPY[fallbackLocale].notLinked, "matches_unlinked");
    const locale = existing.user.locale;
    const profile = existing.profile
      ? {
          educationLevel: existing.profile.educationLevel,
          fieldOfStudy: existing.profile.fieldOfStudy,
          gpaPercent: existing.profile.gpaPercent,
          englishTestType: existing.profile.englishTestType,
          englishScore: existing.profile.englishScore,
          workExperienceYears: existing.profile.workExperienceYears,
          birthYear: existing.user.birthYear,
          currentCountry: existing.profile.currentCountry,
          idpSelfDeclared: existing.profile.idpSelfDeclared,
        }
      : null;

    const matched = (
      await listPublicOpportunities(deps.db, { eligibleOnly: profile ? "go_maybe" : "all" }, profile, now)
    ).slice(0, 5);

    if (matched.length === 0) {
      return reply(BOT_COPY[locale].noMatches, "matches_empty");
    }
    const base = deps.appUrl.replace(/\/+$/, "");
    const lines = matched.map(({ opportunity, match }) => {
      const title = pickText(opportunity.title, locale) || opportunity.providerName;
      const badge = match ? `[${match.verdict}] ` : "";
      const due = opportunity.rolling
        ? "Rolling"
        : opportunity.deadline
          ? opportunity.deadline.toISOString().slice(0, 10)
          : "";
      return `• ${badge}${title}${due ? ` (${due})` : ""}\n  ${base}/${locale}/opportunities/${opportunity.id}`;
    });
    return reply(`${BOT_COPY[locale].matchesHeader}\n\n${lines.join("\n")}`, "matches");
  }

  return reply(BOT_COPY[fallbackLocale].help, "help");
}
