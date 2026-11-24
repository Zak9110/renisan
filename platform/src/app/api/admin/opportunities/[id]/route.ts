import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isEditorOrAdmin, reviewOpportunity } from "@/lib/admin/service";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { httpUrl } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";

const idSchema = z.string().uuid();
const i18nSchema = z.object({
  ar: z.string().max(2000).optional(),
  ckb: z.string().max(2000).optional(),
  kmr: z.string().max(2000).optional(),
  en: z.string().max(2000).optional(),
});

const ruleSchema = z.object({
  field: z.string().min(1).max(60),
  operator: z.enum(["eq", "in", "gte", "lte", "between", "exists"]),
  value: z.unknown(),
  mandatory: z.boolean(),
  explanation: i18nSchema.nullable().optional(),
  sourceNote: z.string().max(300).nullable().optional(),
});

const patchSchema = z.object({
  type: z
    .enum(["scholarship", "exchange", "fellowship", "internship", "competition", "training", "job"])
    .optional(),
  title: i18nSchema.optional(),
  summary: i18nSchema.nullable().optional(),
  notes: i18nSchema.nullable().optional(),
  requiredDocuments: i18nSchema.nullable().optional(),
  languageRequirements: i18nSchema.nullable().optional(),
  providerName: z.string().min(1).max(200).optional(),
  sourceUrl: httpUrl.optional(),
  applyUrl: httpUrl.nullable().optional(),
  deadline: z.string().nullable().optional(),
  deadlineStatus: z.enum(["confirmed", "estimated", "unknown"]).optional(),
  rolling: z.boolean().optional(),
  iraqiEligibility: z.enum(["yes", "no", "unclear"]).optional(),
  levels: z.array(z.string().max(40)).max(10).optional(),
  fields: z.array(z.string().max(80)).max(20).optional(),
  countries: z.array(z.string().max(80)).max(20).optional(),
  fundingType: z.enum(["full", "partial", "stipend", "none"]).nullable().optional(),
  needsReview: z.array(z.enum(["ar", "ckb", "kmr", "en"])).optional(),
  rules: z.array(ruleSchema).max(25).optional(),
  action: z.enum(["save_draft", "publish", "reject", "unhide", "mark_checked"]).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { deadline, ...rest } = parsed.data;
  const parsedDeadline =
    deadline === undefined
      ? undefined
      : deadline === null || deadline === ""
        ? null
        : new Date(/^\d{4}-\d{2}-\d{2}$/.test(deadline) ? `${deadline}T20:59:59Z` : deadline);

  if (parsedDeadline && Number.isNaN(parsedDeadline.getTime())) {
    return NextResponse.json({ error: "invalid_deadline" }, { status: 400 });
  }

  const db = await getDb();
  const result = await reviewOpportunity(db, user.id, user.role, id, {
    ...rest,
    deadline: parsedDeadline,
  });

  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 422;
    return NextResponse.json({ error: result.error, details: result.details }, { status });
  }

  return NextResponse.json(result);
}
