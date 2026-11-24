import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { isUuid, rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { registerForEvent } from "@/lib/community/service";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const db = await getDb();
  const limited = await rateLimited(db, "event-register", user.id, 30);
  if (limited) return limited;
  const res = await registerForEvent(db, user.id, id);
  return NextResponse.json(res, { status: res.ok ? 200 : 404 });
}
