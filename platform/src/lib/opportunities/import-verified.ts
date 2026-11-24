// ============================================
// Renisan Platform — Verified Scholarship Importer (renisan -> platform)
// Maps verified records from ../renisan/public/data/scholarships.json into
// Postgres `opportunities` + `eligibility_rules`, strictly obeying Hard Rule 2:
// - Estimated deadlines import as status="in_review" with deadlineStatus="estimated"
//   so editors confirm exact cycle dates before publishing.
// - Discontinued/closed records import as status="expired".
// - Idempotent by sourceUrl so re-running never duplicates listings.
// ============================================

import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { eligibilityRules, opportunities, type I18nText } from "@/db/schema";
import type { EditorRuleInput } from "@/lib/admin/service";

export interface LegacyScholarshipRecord {
  id: string;
  name: string;
  name_ar: string;
  name_ckb?: string;
  name_kmr?: string;
  country: string;
  provider: string;
  degree_levels: string[];
  type: string;
  eligibility: {
    nationalities?: string[];
    refugee_idp_eligible?: boolean;
    min_gpa?: number;
    max_age?: number;
    language_requirements?: string[];
    work_experience_years?: number;
    must_return?: boolean;
    requires_enrolled_undergrad?: boolean;
  };
  application_url: string;
  deadline?: string | null;
  deadline_estimated?: boolean;
  deadline_note?: string;
  deadline_note_en?: string;
  deadline_note_ckb?: string;
  deadline_note_kmr?: string;
  covers?: string[];
  covers_en?: string[];
  covers_ckb?: string[];
  covers_kmr?: string[];
  status: "open" | "closed" | "upcoming" | "discontinued";
  last_verified: string;
  notes_ar?: string;
  notes_en?: string;
  notes_ckb?: string;
  notes_kmr?: string;
}

function mapType(t: string): typeof opportunities.$inferInsert.type {
  if (t === "exchange") return "exchange";
  if (t === "fellowship") return "fellowship";
  return "scholarship";
}

function mapFunding(t: string): "full" | "partial" | "stipend" | "none" {
  if (t === "partial_scholarship") return "partial";
  return "full";
}

function mapLevels(levels: string[], requiresUndergrad?: boolean): string[] {
  const out = new Set<string>();
  if (requiresUndergrad) {
    out.add("undergrad");
    return [...out];
  }
  for (const l of levels) {
    if (l === "bachelor") out.add("grade12");
    if (l === "bachelor") out.add("undergrad");
    if (l === "masters" || l === "phd") out.add("graduate");
  }
  return [...out];
}

export function mapLegacyScholarshipToPlatform(
  sch: LegacyScholarshipRecord,
  editorId: string,
  now: Date = new Date(),
): {
  opportunity: typeof opportunities.$inferInsert;
  rules: EditorRuleInput[];
} {
  const isoDate = sch.deadline && /^\d{4}-\d{2}-\d{2}$/.test(sch.deadline) ? sch.deadline : null;
  const deadline = isoDate ? new Date(`${isoDate}T20:59:59Z`) : null;
  const isConfirmedFuture =
    Boolean(deadline) &&
    !sch.deadline_estimated &&
    deadline!.getTime() > now.getTime() &&
    (sch.status === "open" || sch.status === "upcoming");

  const deadlineStatus: "confirmed" | "estimated" | "unknown" = !deadline
    ? "unknown"
    : sch.deadline_estimated
      ? "estimated"
      : "confirmed";

  const status: typeof opportunities.$inferInsert.status =
    sch.status === "discontinued" || sch.status === "closed"
      ? "expired"
      : isConfirmedFuture
        ? "published"
        : "in_review";

  const title: I18nText = {
    en: sch.name,
    ar: sch.name_ar,
    ...(sch.name_ckb ? { ckb: sch.name_ckb } : {}),
    ...(sch.name_kmr ? { kmr: sch.name_kmr } : {}),
  };

  const summary: I18nText = {
    ...(sch.covers_en?.length ? { en: sch.covers_en.join(" • ") } : {}),
    ...(sch.covers?.length ? { ar: sch.covers.join(" • ") } : {}),
    ...(sch.covers_ckb?.length ? { ckb: sch.covers_ckb.join(" • ") } : {}),
    ...(sch.covers_kmr?.length ? { kmr: sch.covers_kmr.join(" • ") } : {}),
  };

  const notes: I18nText = {
    ...(sch.notes_en ? { en: sch.notes_en } : {}),
    ...(sch.notes_ar ? { ar: sch.notes_ar } : {}),
    ...(sch.notes_ckb ? { ckb: sch.notes_ckb } : {}),
    ...(sch.notes_kmr ? { kmr: sch.notes_kmr } : {}),
  };

  const languageRequirements: I18nText | null = sch.eligibility.language_requirements?.length
    ? { ar: sch.eligibility.language_requirements.join(" • ") }
    : null;

  const nats = sch.eligibility.nationalities ?? [];
  const iraqiEligibility: "yes" | "no" | "unclear" =
    // Nothing stated stays "unclear" (hard rule: never invent eligibility). Whole words only: "any" is in "Germany".
    nats.some((n) => /\biraqi?s?\b|\b(all|any)\b/i.test(n)) ? "yes" : "unclear";

  const levels = mapLevels(sch.degree_levels, sch.eligibility.requires_enrolled_undergrad);
  const rules: EditorRuleInput[] = [];

  if (levels.length > 0) {
    rules.push({
      field: "educationLevel",
      operator: "in",
      value: levels,
      mandatory: true,
      explanation: {
        en: `Eligible education levels: ${levels.join(", ")}`,
        ar: `المراحل الدراسية المؤهلة: ${levels.join("، ")}`,
      },
    });
  }
  if (typeof sch.eligibility.min_gpa === "number") {
    rules.push({
      field: "gpaPercent",
      operator: "gte",
      value: sch.eligibility.min_gpa,
      mandatory: true,
      explanation: {
        en: `Requires minimum average of ${sch.eligibility.min_gpa}%`,
        ar: `يتطلب معدل لا يقل عن ${sch.eligibility.min_gpa}%`,
      },
    });
  }
  if (typeof sch.eligibility.max_age === "number") {
    rules.push({
      field: "age",
      operator: "lte",
      value: sch.eligibility.max_age,
      mandatory: true,
      explanation: {
        en: `Maximum age ${sch.eligibility.max_age} at deadline`,
        ar: `الحد الأقصى للعمر ${sch.eligibility.max_age} عاماً`,
      },
    });
  }
  if (
    typeof sch.eligibility.work_experience_years === "number" &&
    sch.eligibility.work_experience_years > 0
  ) {
    rules.push({
      field: "workExperienceYears",
      operator: "gte",
      value: sch.eligibility.work_experience_years,
      mandatory: true,
      explanation: {
        en: `Requires at least ${sch.eligibility.work_experience_years} years of work experience`,
        ar: `يتطلب خبرة عمل لا تقل عن ${sch.eligibility.work_experience_years} سنوات`,
      },
    });
  }
  if (sch.eligibility.must_return) {
    rules.push({
      field: "willingToReturn",
      operator: "eq",
      value: true,
      mandatory: false,
      explanation: {
        en: "Requires returning to Iraq after completing the programme",
        ar: "يشترط العودة إلى العراق بعد إكمال الدراسة",
      },
    });
  }
  if (sch.eligibility.refugee_idp_eligible) {
    rules.push({
      field: "idp",
      operator: "eq",
      value: true,
      mandatory: false,
      explanation: {
        en: "Open to refugees and displaced students",
        ar: "متاحة للاجئين والنازحين",
      },
    });
  }

  return {
    opportunity: {
      type: mapType(sch.type),
      title,
      summary: Object.keys(summary).length > 0 ? summary : null,
      notes: Object.keys(notes).length > 0 ? notes : null,
      languageRequirements,
      providerName: sch.provider.slice(0, 200),
      sourceUrl: sch.application_url,
      applyUrl: sch.application_url,
      deadline,
      deadlineStatus,
      rolling: false,
      status,
      iraqiEligibility,
      levels,
      countries: [sch.country],
      fundingType: mapFunding(sch.type),
      needsReview: ["ckb", "kmr"],
      verifiedBy: status === "published" ? editorId : null,
      verifiedAt: status === "published" ? now : null,
      lastCheckedAt: new Date(`${sch.last_verified}T00:00:00Z`),
      createdBy: editorId,
    },
    rules,
  };
}

export async function importVerifiedScholarships(
  db: Db,
  records: LegacyScholarshipRecord[],
  editorId: string,
  now: Date = new Date(),
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const sch of records) {
    const existing = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.sourceUrl, sch.application_url))
      .limit(1);
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const mapped = mapLegacyScholarshipToPlatform(sch, editorId, now);
    const [inserted] = await db
      .insert(opportunities)
      .values(mapped.opportunity)
      .returning({ id: opportunities.id });

    if (inserted && mapped.rules.length > 0) {
      await db.insert(eligibilityRules).values(
        mapped.rules.map((r) => ({
          opportunityId: inserted.id,
          field: r.field,
          operator: r.operator,
          value: r.value,
          mandatory: r.mandatory,
          explanation: r.explanation ?? null,
          sourceNote: r.sourceNote ?? null,
        })),
      );
    }
    imported++;
  }

  return { imported, skipped };
}
