import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hmacHex } from "@/lib/auth/crypto";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { env } from "@/lib/env";
import { submitPublicOpportunity } from "@/lib/opportunities/service";

const submitSchema = z.object({
  type: z.enum(["scholarship", "exchange", "fellowship", "internship", "competition", "training", "job"]),
  title: z.string().trim().min(4).max(200),
  summary: z.string().trim().max(1000).optional(),
  providerName: z.string().trim().min(2).max(200),
  sourceUrl: z.url().refine((u) => /^https?:\/\//.test(u), "must be http(s)"),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  rolling: z.boolean().optional(),
  locale: z.enum(["ar", "ckb", "kmr", "en"]).default("en"),
});

export async function POST(req: NextRequest) {
  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const db = await getDb();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const ipHash = hmacHex(ip, env().SESSION_SECRET);
  const limit = await checkRateLimit(db, `submit:ip:${ipHash}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const user = await getCurrentSessionUser();
  const deadline = parsed.data.deadline ? new Date(`${parsed.data.deadline}T20:59:59Z`) : null;

  const res = await submitPublicOpportunity(db, {
    type: parsed.data.type,
    title: parsed.data.title,
    summary: parsed.data.summary,
    providerName: parsed.data.providerName,
    sourceUrl: parsed.data.sourceUrl,
    deadline,
    rolling: parsed.data.rolling ?? false,
    locale: parsed.data.locale,
    submittedBy: user?.id ?? null,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error, reasons: res.reasons }, { status: 422 });
  }

  return NextResponse.json({ ok: true, id: res.opportunity.id }, { status: 201 });
}
