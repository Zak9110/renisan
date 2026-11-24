import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { clientIpHash } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { reportOpportunity } from "@/lib/opportunities/service";

const idSchema = z.string().uuid();
const bodySchema = z.object({
  reason: z.enum(["scam", "expired", "wrong_info", "other"]),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const db = await getDb();
  // IP only: the user agent is client-controlled, so including it let one person file 3 "independent" reports.
  const fp = clientIpHash(req);

  const limit = await checkRateLimit(db, `report:fp:${fp}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const user = await getCurrentSessionUser();
  const result = await reportOpportunity(db, {
    opportunityId: id,
    userId: user?.id ?? null,
    reporterFingerprint: fp,
    reason: parsed.data.reason,
    note: parsed.data.note,
  });

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result, { status: 201 });
}
