import { NextResponse } from "next/server";
import { getEditorDashboard, isEditorOrAdmin } from "@/lib/admin/service";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = await getDb();
  const dashboard = await getEditorDashboard(db, user.role);
  return NextResponse.json(dashboard);
}
