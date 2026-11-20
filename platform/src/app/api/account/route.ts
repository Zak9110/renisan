import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentSessionUser } from "@/lib/auth/session";
import { deleteUserAccount } from "@/lib/auth/service";
import { getDb } from "@/lib/db-singleton";

export async function DELETE() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  await deleteUserAccount(db, user.id);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
