import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { httpUrl, rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { createHelperService } from "@/lib/helpers/service";

const i18nSchema = z.object({
  ar: z.string().max(800).optional(),
  ckb: z.string().max(800).optional(),
  kmr: z.string().max(800).optional(),
  en: z.string().max(800).optional(),
});

const createServiceSchema = z.object({
  category: z.enum([
    "cv_feedback",
    "essay_feedback",
    "mock_interview",
    "document_checklist",
    "walkthrough",
    "shortlisting",
    "tutoring",
  ]),
  title: i18nSchema,
  scope: i18nSchema,
  deliverables: i18nSchema,
  priceIqd: z.number().int().min(1000).max(1_000_000),
  deliveryDays: z.number().int().min(1).max(60),
  allowedForMinors: z.boolean().optional().default(false),
  groupSession: z.boolean().optional().default(false),
  sessionLink: httpUrl.optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const limited = await rateLimited(db, "helper-service", user.id, 20);
  if (limited) return limited;
  const res = await createHelperService(db, user.id, parsed.data);
  if (!res.ok) {
    const status = res.error === "helper_not_verified" ? 403 : 422;
    return NextResponse.json(res, { status });
  }
  return NextResponse.json(res, { status: 201 });
}
