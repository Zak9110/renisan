import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { upsertUserOpportunity } from "@/lib/lists/service";

const trackerSchema = z.object({
  opportunityId: z.string().uuid(),
  state: z.enum(["saved", "applied", "got_it", "rejected", "dismissed"]),
  privateNote: z.string().max(500).nullable().optional(),
  outcomeNote: z.string().max(500).nullable().optional(),
  checklist: z
    .array(z.object({ label: z.string().min(1).max(160), done: z.boolean() }))
    .max(30)
    .optional(),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = trackerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const saved = await upsertUserOpportunity(db, user.id, parsed.data);
  return NextResponse.json({ ok: true, item: saved });
}
