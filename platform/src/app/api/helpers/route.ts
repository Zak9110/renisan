import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { applyAsHelper, listPublicServices } from "@/lib/helpers/service";

const applySchema = z.object({
  bio: z.object({
    ar: z.string().max(1000).optional(),
    ckb: z.string().max(1000).optional(),
    kmr: z.string().max(1000).optional(),
    en: z.string().max(1000).optional(),
  }),
  languages: z.array(z.string().max(40)).max(10).default(["ar", "en"]),
  subjects: z.array(z.string().max(80)).max(15).default([]),
  outcomes: z
    .array(
      z.object({
        program: z.string().min(2).max(160),
        year: z.number().int().min(2000).max(2030),
        country: z.string().max(60).optional(),
      }),
    )
    .min(1)
    .max(10),
  verificationMethod: z.enum(["offer_letter", "enrollment", "certificate", "vouches"]),
  proofRef: z.string().min(4).max(400),
});

export async function GET() {
  const db = await getDb();
  const items = await listPublicServices(db);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const limited = await rateLimited(db, "helper-apply", user.id, 5);
  if (limited) return limited;
  const res = await applyAsHelper(db, user.id, parsed.data);
  if (!res.ok) {
    const status = res.error === "adults_only" || res.error === "helper_banned" ? 403 : 400;
    return NextResponse.json(res, { status });
  }
  return NextResponse.json(res, { status: 201 });
}
