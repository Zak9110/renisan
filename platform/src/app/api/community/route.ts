import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { applyAsAmbassador, listPublicCommunity } from "@/lib/community/service";

const applySchema = z.object({
  university: z.string().min(2).max(160),
  country: z.string().min(2).max(60),
  field: z.string().min(2).max(120),
  howFunded: z
    .object({
      ar: z.string().max(400).optional(),
      ckb: z.string().max(400).optional(),
      kmr: z.string().max(400).optional(),
      en: z.string().max(400).optional(),
    })
    .optional()
    .nullable(),
  bio: z
    .object({
      ar: z.string().max(600).optional(),
      ckb: z.string().max(600).optional(),
      kmr: z.string().max(600).optional(),
      en: z.string().max(600).optional(),
    })
    .optional()
    .nullable(),
  verificationMethod: z.enum(["academic_email", "enrollment_letter", "student_id", "vouches"]),
  proofRef: z.string().min(4).max(400),
});

export async function GET(req: NextRequest) {
  const country = new URL(req.url).searchParams.get("country") ?? undefined;
  const db = await getDb();
  const data = await listPublicCommunity(db, country);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const limited = await rateLimited(db, "ambassador-apply", user.id, 5);
  if (limited) return limited;
  const res = await applyAsAmbassador(db, user.id, parsed.data);
  if (!res.ok) {
    return NextResponse.json(res, { status: res.error === "adults_only" ? 403 : 400 });
  }
  return NextResponse.json(res, { status: 201 });
}
