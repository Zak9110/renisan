import { eq, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { rateLimits } from "@/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Fixed-window rate limiter stored in Postgres (`rate_limits` table) so Vercel
 * serverless functions share state with zero Redis dependency.
 */
export async function checkRateLimit(
  db: Db,
  key: string,
  maxRequests: number,
  windowMs: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  const existing = rows[0];

  if (!existing || now.getTime() - existing.windowStart.getTime() >= windowMs) {
    await db
      .insert(rateLimits)
      .values({ key, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: 1, windowStart: now },
      });
    return { allowed: true, remaining: Math.max(0, maxRequests - 1), retryAfterSec: 0 };
  }

  if (existing.count >= maxRequests) {
    const resetMs = existing.windowStart.getTime() + windowMs - now.getTime();
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(resetMs / 1000)),
    };
  }

  const nextCount = existing.count + 1;
  await db.update(rateLimits).set({ count: nextCount }).where(eq(rateLimits.key, key));
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - nextCount),
    retryAfterSec: 0,
  };
}

/** Removes expired rate-limit windows during cron maintenance. */
export async function pruneRateLimits(db: Db, olderThanMs: number, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
}
