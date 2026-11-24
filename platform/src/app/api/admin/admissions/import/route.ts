import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { isEditorOrAdmin } from "@/lib/admin/service";
import { importAdmissionsCsv } from "@/lib/admissions/service";

const bodySchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  dryRun: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const db = await getDb();
  const result = await importAdmissionsCsv(db, user.id, user.role, parsed.data.csv, {
    dryRun: parsed.data.dryRun,
  });
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
