import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { isUuid, rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { createOrderReview } from "@/lib/helpers/service";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(600).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const limited = await rateLimited(db, "order-review", user.id, 20);
  if (limited) return limited;
  const res = await createOrderReview(db, user.id, id, parsed.data.rating, parsed.data.comment);
  if (!res.ok) {
    const status = res.error === "forbidden" ? 403 : res.error === "not_found" ? 404 : 409;
    return NextResponse.json(res, { status });
  }
  return NextResponse.json(res, { status: 201 });
}
