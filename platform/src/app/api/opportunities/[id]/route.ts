import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { getOpportunityDetail } from "@/lib/opportunities/service";

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const user = await getCurrentSessionUser();
  const db = await getDb();
  const profile = user?.profile ? { ...user.profile, birthYear: user.birthYear } : null;
  const detail = await getOpportunityDetail(db, id, profile);
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(detail);
}
