import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import { clientIpHash, rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { queryAdmissions } from "@/lib/admissions/service";

const querySchema = z.object({
  average: z.coerce.number().min(0).max(115),
  system: z.enum(["federal", "krg", "private", "all"]).optional().default("all"),
  stream: z
    .string()
    .max(30)
    .regex(/^[a-z]+$/)
    .optional()
    .default("all"),
  governorate: z.string().max(60).optional().default("all"),
  gender: z.enum(["both", "male", "female"]).optional().default("both"),
  studyType: z.string().max(30).optional().default("all"),
  channel: z.string().max(40).optional().default("all"),
  year: z.coerce.number().int().min(2015).max(2035).optional(),
  q: z.string().max(120).optional(),
  includeReach: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  locale: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = querySchema.safeParse({
    ...sp,
    average: sp.average ?? "100",
    year: sp.year ? sp.year : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const locale: Locale = parsed.data.locale && isLocale(parsed.data.locale) ? parsed.data.locale : "ar";
  const db = await getDb();
  const limited = await rateLimited(db, "admissions", clientIpHash(req), 120, 60_000);
  if (limited) return limited;
  const result = await queryAdmissions(db, {
    ...parsed.data,
    locale,
  });

  return NextResponse.json(result);
}
