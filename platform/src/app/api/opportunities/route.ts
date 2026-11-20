import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { listPublicOpportunities } from "@/lib/opportunities/service";
import type { MatchProfile } from "@/lib/eligibility/match";

const querySchema = z.object({
  type: z.enum(["scholarship", "exchange", "fellowship", "internship", "competition", "training", "job"]).optional(),
  level: z.string().max(40).optional(),
  country: z.string().max(60).optional(),
  fundingType: z.enum(["full", "partial", "stipend", "none"]).optional(),
  iraqiEligibility: z.enum(["yes", "unclear", "all"]).optional(),
  closingDays: z.coerce.number().int().min(1).max(365).optional(),
  q: z.string().max(120).optional(),
  eligibleOnly: z.enum(["all", "go", "go_maybe"]).optional(),
  // Optional guest eligibility overrides so anonymous students can use "Eligible for me only" before signing up
  educationLevel: z.enum(["grade12", "undergrad", "graduate", "other"]).optional(),
  gpaPercent: z.coerce.number().min(0).max(110).optional(),
  birthYear: z.coerce.number().int().min(1940).max(2025).optional(),
  workExperienceYears: z.coerce.number().int().min(0).max(50).optional(),
});

export async function GET(req: NextRequest) {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const user = await getCurrentSessionUser();
  const db = await getDb();

  const profile: MatchProfile | null = user?.profile
    ? {
        ...user.profile,
        birthYear: user.birthYear,
      }
    : parsed.data.educationLevel ||
        parsed.data.gpaPercent != null ||
        parsed.data.birthYear != null ||
        parsed.data.workExperienceYears != null
      ? {
          educationLevel: parsed.data.educationLevel,
          gpaPercent: parsed.data.gpaPercent,
          birthYear: parsed.data.birthYear,
          workExperienceYears: parsed.data.workExperienceYears,
        }
      : null;

  const items = await listPublicOpportunities(
    db,
    {
      type: parsed.data.type,
      level: parsed.data.level,
      country: parsed.data.country,
      fundingType: parsed.data.fundingType,
      iraqiEligibility: parsed.data.iraqiEligibility,
      closingWithinDays: parsed.data.closingDays,
      q: parsed.data.q,
      eligibleOnly: parsed.data.eligibleOnly,
    },
    profile,
  );

  return NextResponse.json({
    count: items.length,
    items,
  });
}
