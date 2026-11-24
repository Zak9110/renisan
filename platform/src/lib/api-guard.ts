import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Db } from "@/db/client";
import { hmacHex } from "@/lib/auth/crypto";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";

const HOUR_MS = 60 * 60 * 1000;

/** http(s) only: plain z.url() also accepts javascript: and data: links. */
export const httpUrl = z.url({ protocol: /^https?$/ }).max(1000);

export const isUuid = (v: string): boolean => z.uuid().safeParse(v).success;

/** Salted hash of the caller's IP. Raw IPs are never stored. */
export function clientIpHash(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  return hmacHex(ip, env().SESSION_SECRET);
}

/** Returns a 429 response when `who` exceeded `max` calls per window, otherwise null. */
export async function rateLimited(
  db: Db,
  scope: string,
  who: string,
  max: number,
  windowMs: number = HOUR_MS,
): Promise<NextResponse | null> {
  const limit = await checkRateLimit(db, `${scope}:${who}`, max, windowMs);
  if (limit.allowed) return null;
  return NextResponse.json(
    { error: "rate_limited", retryAfterSec: limit.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
  );
}
