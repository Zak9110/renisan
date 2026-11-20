import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { exportUserData } from "@/lib/auth/service";
import { getDb } from "@/lib/db-singleton";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const data = await exportUserData(db, user.id);
  return NextResponse.json(data, {
    headers: { "Content-Disposition": 'attachment; filename="renisan-account-export.json"' },
  });
}
