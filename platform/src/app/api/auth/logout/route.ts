import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/auth/session";
import { logoutSession } from "@/lib/auth/service";
import { getDb } from "@/lib/db-singleton";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const db = await getDb();
  await logoutSession(db, token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
