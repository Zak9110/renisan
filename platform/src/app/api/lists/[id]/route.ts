import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { addItemToList, deleteUserList, removeItemFromList } from "@/lib/lists/service";

const itemSchema = z.object({
  opportunityId: z.string().uuid(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = itemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_opportunity_id" }, { status: 400 });

  const db = await getDb();
  const ok = await addItemToList(db, user.id, id, parsed.data.opportunityId);
  if (!ok) return NextResponse.json({ error: "list_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = itemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_opportunity_id" }, { status: 400 });

  const db = await getDb();
  const ok = await removeItemFromList(db, user.id, id, parsed.data.opportunityId);
  if (!ok) return NextResponse.json({ error: "list_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  const ok = await deleteUserList(db, user.id, id);
  if (!ok) return NextResponse.json({ error: "list_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
