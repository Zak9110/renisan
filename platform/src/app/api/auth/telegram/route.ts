import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db-singleton";
import { loginWithTelegramUser, verifyTelegramAuthPayload } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";
import { hmacHex } from "@/lib/auth/crypto";
import { checkRateLimit } from "@/lib/auth/rate-limit";

const MAX_LOGINS_PER_IP = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Telegram Login Widget payload. The HMAC covers every field Telegram sends, so the
// raw object (not a zod-stripped copy) is what gets verified; zod only checks the shape.
const fieldValue = z.union([z.string().max(512), z.number()]);
const schema = z
  .object({
    id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,20}$/)]),
    auth_date: z.union([z.number().int(), z.string().regex(/^\d{1,12}$/)]),
    hash: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .catchall(fieldValue);

const localeSchema = z.enum(["ar", "ckb", "kmr", "en"]).optional();

export async function POST(req: NextRequest) {
  const botToken = env().TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "telegram_login_disabled" }, { status: 503 });
  }

  const db = await getDb();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const limit = await checkRateLimit(
    db,
    `tg-login:ip:${hmacHex(ip, env().SESSION_SECRET)}`,
    MAX_LOGINS_PER_IP,
    RATE_WINDOW_MS,
  );
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { payload?: unknown; locale?: unknown } | null;
  const parsed = schema.safeParse(body?.payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const payload = parsed.data as Record<string, string | number>;

  if (!verifyTelegramAuthPayload(payload, botToken)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const locale = localeSchema.safeParse(body?.locale);
  const result = await loginWithTelegramUser(
    db,
    String(payload.id),
    locale.success ? (locale.data ?? "ar") : "ar",
  );

  await setSessionCookie(result.sessionToken, result.expiresAt);
  return NextResponse.json({ ok: true, userId: result.userId, isNewUser: result.isNewUser });
}
