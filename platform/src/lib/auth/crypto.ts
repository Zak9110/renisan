import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Cryptographically uniform 6-digit numeric OTP code (000000–999999). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 256-bit URL-safe random token for session cookies or calendar feeds. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Derives minor status from birthYear alone (exact DOB is never stored per hard rule 7). */
export function isMinorFromBirthYear(birthYear: number | null | undefined, now: Date = new Date()): boolean {
  if (birthYear == null) return false;
  // Conservative: treat anyone turning 18 this calendar year or younger as potentially under 18.
  return now.getUTCFullYear() - birthYear <= 18;
}

/** Normalizes Iraqi phone numbers into E.164 (+9647XXXXXXXXX) or validates generic E.164. */
export function normalizePhoneE164(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (/^07[3-9]\d{8}$/.test(cleaned)) return `+964${cleaned.slice(1)}`;
  if (/^00964(7[3-9]\d{8})$/.test(cleaned)) return `+964${cleaned.slice(5)}`;
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  return null;
}

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 255) return null;
  return trimmed;
}
