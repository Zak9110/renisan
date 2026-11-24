import { NextResponse } from "next/server";
import { isEditorOrAdmin } from "@/lib/admin/service";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { runDailyIngestion } from "@/lib/ingestion/daily";

export const maxDuration = 300;

export async function POST() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = await getDb();
  const limited = await rateLimited(db, "admin-daily", "all", 6);
  if (limited) return limited;
  const summary = await runDailyIngestion(db);
  return NextResponse.json({ ok: true, summary });
}
