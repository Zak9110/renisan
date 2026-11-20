import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  notificationPrefs,
  otpCodes,
  profiles,
  sessions,
  telegramLinkCodes,
  telegramLinks,
  userListItems,
  userLists,
  userOpportunity,
  users,
} from "@/db/schema";
import type { EmailProvider } from "@/lib/email/provider";
import type { SmsProvider } from "@/lib/sms/provider";
import {
  generateOpaqueToken,
  generateOtpCode,
  hmacHex,
  isMinorFromBirthYear,
  normalizeEmail,
  normalizePhoneE164,
  sha256Hex,
  timingSafeEqualHex,
} from "./crypto";
import { checkRateLimit } from "./rate-limit";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes (hard rule)
const OTP_MAX_ATTEMPTS = 5; // max 5 attempts (hard rule)
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_PER_TARGET = 3;
const MAX_OTP_PER_IP = 10;

export interface AuthDeps {
  db: Db;
  secret: string;
  sms: SmsProvider;
  email: EmailProvider;
}

export type RequestOtpResult =
  | { ok: true; expiresAt: Date; devCode?: string }
  | { ok: false; error: "invalid_target" | "rate_limited" | "delivery_failed"; retryAfterSec?: number };

export async function requestOtp(
  deps: AuthDeps,
  input: { channel: "sms" | "email"; target: string; ip: string; now?: Date },
): Promise<RequestOtpResult> {
  const now = input.now ?? new Date();
  const normalized =
    input.channel === "sms" ? normalizePhoneE164(input.target) : normalizeEmail(input.target);
  if (!normalized) return { ok: false, error: "invalid_target" };

  const targetHash = hmacHex(`${input.channel}:${normalized}`, deps.secret);
  const ipHash = hmacHex(input.ip || "unknown", deps.secret);

  const ipLimit = await checkRateLimit(deps.db, `otp:ip:${ipHash}`, MAX_OTP_PER_IP, RATE_WINDOW_MS, now);
  if (!ipLimit.allowed) {
    return { ok: false, error: "rate_limited", retryAfterSec: ipLimit.retryAfterSec };
  }

  const targetLimit = await checkRateLimit(
    deps.db,
    `otp:target:${targetHash}`,
    MAX_OTP_PER_TARGET,
    RATE_WINDOW_MS,
    now,
  );
  if (!targetLimit.allowed) {
    return { ok: false, error: "rate_limited", retryAfterSec: targetLimit.retryAfterSec };
  }

  const code = generateOtpCode();
  const codeHash = hmacHex(`${targetHash}:${code}`, deps.secret);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  // Invalidate any earlier unused OTPs for this target so only the newest code is ever active
  await deps.db
    .update(otpCodes)
    .set({ usedAt: now })
    .where(
      and(eq(otpCodes.targetHash, targetHash), eq(otpCodes.channel, input.channel), isNull(otpCodes.usedAt)),
    );

  await deps.db.insert(otpCodes).values({
    channel: input.channel,
    purpose: "login",
    targetHash,
    codeHash,
    attempts: 0,
    expiresAt,
  });

  const sent =
    input.channel === "sms"
      ? await deps.sms.sendOtp(normalized, code)
      : await deps.email.sendOtp(normalized, code);

  if (!sent.ok) return { ok: false, error: "delivery_failed" };
  return { ok: true, expiresAt, ...(sent.devCode ? { devCode: sent.devCode } : {}) };
}

export type VerifyOtpResult =
  | { ok: true; userId: string; sessionToken: string; expiresAt: Date; isNewUser: boolean }
  | { ok: false; error: "invalid_target" | "invalid_or_expired" | "too_many_attempts" };

export async function verifyOtp(
  deps: Pick<AuthDeps, "db" | "secret">,
  input: {
    channel: "sms" | "email";
    target: string;
    code: string;
    locale?: "ar" | "ckb" | "kmr" | "en";
    now?: Date;
  },
): Promise<VerifyOtpResult> {
  const now = input.now ?? new Date();
  const normalized =
    input.channel === "sms" ? normalizePhoneE164(input.target) : normalizeEmail(input.target);
  if (!normalized) return { ok: false, error: "invalid_target" };

  const targetHash = hmacHex(`${input.channel}:${normalized}`, deps.secret);

  // Inspect latest unused OTP for this target
  const rows = await deps.db
    .select()
    .from(otpCodes)
    .where(
      and(eq(otpCodes.targetHash, targetHash), eq(otpCodes.channel, input.channel), isNull(otpCodes.usedAt)),
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  const otp = rows[0];
  if (!otp || otp.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "invalid_or_expired" };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "too_many_attempts" };
  }

  const expectedHash = hmacHex(`${targetHash}:${input.code.trim()}`, deps.secret);
  const matches = timingSafeEqualHex(expectedHash, otp.codeHash);

  if (!matches) {
    const nextAttempts = Math.min(OTP_MAX_ATTEMPTS, otp.attempts + 1);
    await deps.db.update(otpCodes).set({ attempts: nextAttempts }).where(eq(otpCodes.id, otp.id));
    return {
      ok: false,
      error: nextAttempts >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "invalid_or_expired",
    };
  }

  // Mark code consumed so it can never be replayed
  await deps.db.update(otpCodes).set({ usedAt: now }).where(eq(otpCodes.id, otp.id));

  // Find or create user
  const existingUsers =
    input.channel === "sms"
      ? await deps.db.select().from(users).where(eq(users.phoneE164, normalized)).limit(1)
      : await deps.db.select().from(users).where(eq(users.email, normalized)).limit(1);

  let userId: string;
  let isNewUser = false;

  if (existingUsers[0] && !existingUsers[0].deletedAt) {
    userId = existingUsers[0].id;
  } else {
    isNewUser = true;
    const [created] = await deps.db
      .insert(users)
      .values({
        phoneE164: input.channel === "sms" ? normalized : null,
        email: input.channel === "email" ? normalized : null,
        locale: input.locale ?? "ar",
      })
      .returning({ id: users.id });
    userId = created!.id;
    await deps.db.insert(notificationPrefs).values({ userId }).onConflictDoNothing();
  }

  const sessionToken = generateOpaqueToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await deps.db.insert(sessions).values({
    tokenHash: sha256Hex(sessionToken),
    userId,
    expiresAt,
    lastSeenAt: now,
  });

  return { ok: true, userId, sessionToken, expiresAt, isNewUser };
}

/** Verifies Telegram Login payload cryptographically per Telegram spec (HMAC-SHA256 with SHA256(botToken)). */
export function verifyTelegramAuthPayload(
  payload: Record<string, string | number>,
  botToken: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const providedHash = String(payload.hash ?? "");
  const authDate = Number(payload.auth_date ?? 0);
  if (!/^[0-9a-f]{64}$/i.test(providedHash)) return false;
  if (!Number.isFinite(authDate) || Math.abs(nowSec - authDate) > 86_400) return false;

  const dataCheckString = Object.entries(payload)
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const provided = Buffer.from(providedHash, "hex");
  return computed.length === provided.length && timingSafeEqual(computed, provided);
}

export async function loginWithTelegramUser(
  db: Db,
  telegramUserId: string,
  locale: "ar" | "ckb" | "kmr" | "en" = "ar",
  now: Date = new Date(),
): Promise<{ userId: string; sessionToken: string; expiresAt: Date; isNewUser: boolean }> {
  const existing = await db.select().from(users).where(eq(users.telegramUserId, telegramUserId)).limit(1);
  let userId: string;
  let isNewUser = false;

  if (existing[0] && !existing[0].deletedAt) {
    userId = existing[0].id;
  } else {
    isNewUser = true;
    const [created] = await db.insert(users).values({ telegramUserId, locale }).returning({ id: users.id });
    userId = created!.id;
    await db.insert(notificationPrefs).values({ userId }).onConflictDoNothing();
  }

  const sessionToken = generateOpaqueToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: sha256Hex(sessionToken),
    userId,
    expiresAt,
    lastSeenAt: now,
  });

  return { userId, sessionToken, expiresAt, isNewUser };
}

export async function getSessionUser(db: Db, rawToken: string | undefined, now: Date = new Date()) {
  if (!rawToken) return null;
  const tokenHash = sha256Hex(rawToken);
  const rows = await db
    .select({
      sessionExpiresAt: sessions.expiresAt,
      user: users,
      profile: profiles,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row || row.user.deletedAt || row.sessionExpiresAt.getTime() <= now.getTime()) {
    return null;
  }

  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, tokenHash));
  return {
    id: row.user.id,
    role: row.user.role,
    locale: row.user.locale,
    email: row.user.email,
    phoneE164: row.user.phoneE164,
    telegramUserId: row.user.telegramUserId,
    birthYear: row.user.birthYear,
    isMinor: isMinorFromBirthYear(row.user.birthYear, now),
    profile: row.profile ?? null,
  };
}

export async function logoutSession(db: Db, rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(rawToken)));
}

/** Hard rule: full user data export in JSON (never includes tokens or hashes). */
export async function exportUserData(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) return null;

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const tracked = await db.select().from(userOpportunity).where(eq(userOpportunity.userId, userId));
  const lists = await db.select().from(userLists).where(eq(userLists.userId, userId));
  const listIds = lists.map((l) => l.id);
  const ownedItems =
    listIds.length > 0
      ? await db.select().from(userListItems).where(inArray(userListItems.listId, listIds))
      : [];

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      phoneE164: user.phoneE164,
      locale: user.locale,
      birthYear: user.birthYear,
      role: user.role,
      createdAt: user.createdAt,
    },
    profile: profile ?? null,
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      opportunityIds: ownedItems.filter((i) => i.listId === l.id).map((i) => i.opportunityId),
    })),
    trackedOpportunities: tracked,
  };
}

/** Hard rule: account delete removes sessions, personal contact, profile, lists & tracked rows. */
export async function deleteUserAccount(db: Db, userId: string): Promise<void> {
  // The user row is soft-deleted, so FK cascades never fire: remove every personal row explicitly.
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(telegramLinks).where(eq(telegramLinks.userId, userId));
  await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));
  await db.delete(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  await db.delete(userLists).where(eq(userLists.userId, userId)); // cascades to user_list_items
  await db.delete(userOpportunity).where(eq(userOpportunity.userId, userId));
  await db.delete(profiles).where(eq(profiles.userId, userId));
  await db
    .update(users)
    .set({
      phoneE164: null,
      email: null,
      telegramUserId: null,
      calendarTokenHash: null,
      birthYear: null,
      deletedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
