import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { getUserDeadlines, rotateCalendarToken } from "@/lib/lists/service";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const deadlines = await getUserDeadlines(db, user.id);
  return NextResponse.json({ deadlines });
}

/** Rotates and returns a fresh subscribable WebCal (.ics) feed URL for the signed-in account. */
export async function POST() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const token = await rotateCalendarToken(db, user.id);
  return NextResponse.json({ ok: true, calendarPath: `/api/calendar/${token}` });
}
