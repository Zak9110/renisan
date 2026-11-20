import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { createUserList, listUserLists } from "@/lib/lists/service";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const lists = await listUserLists(db, user.id);
  return NextResponse.json({ lists });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  const db = await getDb();
  const list = await createUserList(db, user.id, parsed.data.name);
  return NextResponse.json({ ok: true, list }, { status: 201 });
}
