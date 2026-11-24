import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/telegram/service";

const updateSchema = z.object({
  digestFrequency: z.enum(["daily", "weekly", "off"]).optional(),
  deadlineReminders: z.boolean().optional(),
  quietStart: z.number().int().min(0).max(23).optional(),
  quietEnd: z.number().int().min(0).max(23).optional(),
});

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = await getDb();
  const settings = await getNotificationSettings(db, user.id);
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const db = await getDb();
  const settings = await updateNotificationSettings(db, user.id, parsed.data);
  return NextResponse.json(settings);
}
