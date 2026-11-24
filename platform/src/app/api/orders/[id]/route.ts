import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { transitionOrder } from "@/lib/helpers/service";

const patchSchema = z.object({
  status: z.enum(["paid_held", "in_progress", "delivered", "confirmed", "released", "disputed", "refunded"]),
  reason: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const res = await transitionOrder(db, user.id, user.role, id, parsed.data.status, {
    reason: parsed.data.reason,
  });
  if (!res.ok) {
    const status = res.error === "forbidden" ? 403 : res.error === "not_found" ? 404 : 409;
    return NextResponse.json(res, { status });
  }
  return NextResponse.json(res);
}
