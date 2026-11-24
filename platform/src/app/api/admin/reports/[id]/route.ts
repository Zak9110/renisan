import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isEditorOrAdmin, resolveReport } from "@/lib/admin/service";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";

const idSchema = z.string().uuid();
const bodySchema = z.object({
  decision: z.enum(["dismiss", "remove_listing"]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const db = await getDb();
  const result = await resolveReport(db, user.id, user.role, id, parsed.data.decision);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 403 });
  }

  return NextResponse.json({ ok: true });
}
