// ============================================
// Renisan Platform — M6 Admissions Checker & Admin CSV Import Service
// - No-login checker returning departments grouped by university with
//   year, sourceUrl, confidence, margin, and chance band.
// - Enforces DB/hard-rule invariant: KRG cutoffs can NEVER be "high" confidence.
// - Provides RFC 4180 CSV parser + dry-run preview + audited import for both
//   admissions cutoffs (M6) and bulk opportunity drafts (M3/F7).
// ============================================

import { and, desc, eq, like, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { auditLog, cutoffs, departments, opportunities, universities, type I18nText } from "@/db/schema";
import { pickText, type Locale } from "@/i18n/config";
import { isEditorOrAdmin, type EditorRole } from "@/lib/admin/service";
import { checkScamRedFlags } from "@/lib/ingestion/daily";

export type ChanceBand = "safe" | "target" | "reach";

export const SAFE_MARGIN = 2;

export function chanceBand(diff: number): ChanceBand {
  if (diff >= SAFE_MARGIN) return "safe";
  if (diff >= 0) return "target";
  return "reach";
}

export function countBands(diffs: number[]): Record<ChanceBand, number> {
  const out: Record<ChanceBand, number> = { safe: 0, target: 0, reach: 0 };
  for (const d of diffs) out[chanceBand(d)]++;
  return out;
}

export interface AdmissionsQueryParams {
  average: number;
  system?: "federal" | "krg" | "private" | "all";
  stream?: string;
  governorate?: string;
  gender?: "both" | "male" | "female";
  studyType?: string;
  channel?: string;
  year?: number;
  q?: string;
  includeReach?: boolean;
  locale?: Locale;
}

export interface AdmissionMatchItem {
  cutoffId: string;
  departmentId: string;
  externalKey: string | null;
  college: I18nText | null;
  department: I18nText;
  system: "federal" | "krg" | "private";
  year: number;
  stream: string;
  gender: string;
  studyType: string;
  channel: string;
  minAverage: number;
  margin: number;
  band: ChanceBand;
  confidence: "high" | "medium" | "low";
  sourceUrl: string;
  sourceDate: string | null;
}

export interface UniversityAdmissionGroup {
  universityId: string;
  name: I18nText;
  system: "federal" | "krg" | "private";
  governorate: string | null;
  items: AdmissionMatchItem[];
}

export async function queryAdmissions(db: Db, params: AdmissionsQueryParams) {
  const reachSlack = params.includeReach ? 2 : 0;
  const maxAllowedCutoff = params.average + reachSlack;

  const conditions = [lte(cutoffs.minAverage, maxAllowedCutoff)];
  if (params.system && params.system !== "all") {
    conditions.push(eq(cutoffs.system, params.system));
  }
  if (params.stream && params.stream !== "all") {
    // Sub-streams are stored as "scientific-bio" etc. and belong to their parent stream.
    conditions.push(or(eq(cutoffs.stream, params.stream), like(cutoffs.stream, `${params.stream}-%`))!);
  }
  if (params.studyType && params.studyType !== "all") {
    conditions.push(eq(cutoffs.studyType, params.studyType));
  }
  if (params.channel && params.channel !== "all") {
    conditions.push(eq(cutoffs.channel, params.channel));
  }
  if (params.year) {
    conditions.push(eq(cutoffs.year, params.year));
  }

  // Fetch metadata (years, governorates) from full cutoffs/universities tables
  const allUnis = await db.select().from(universities);
  const allCutoffYears = await db
    .selectDistinct({ year: cutoffs.year, system: cutoffs.system })
    .from(cutoffs)
    .orderBy(desc(cutoffs.year));

  const years = [...new Set(allCutoffYears.map((r) => r.year))].sort((a, b) => b - a);
  const governorates = [
    ...new Set(allUnis.map((u) => u.governorate).filter((g): g is string => Boolean(g && g.trim()))),
  ].sort();

  // Default to latest available year per system when caller did not pick a specific year
  const latestYearBySystem = new Map<string, number>();
  for (const r of allCutoffYears) {
    const prev = latestYearBySystem.get(r.system);
    if (!prev || r.year > prev) latestYearBySystem.set(r.system, r.year);
  }

  const rows = await db
    .select({
      cutoff: cutoffs,
      dept: departments,
      uni: universities,
    })
    .from(cutoffs)
    .innerJoin(departments, eq(cutoffs.departmentId, departments.id))
    .innerJoin(universities, eq(departments.universityId, universities.id))
    .where(and(...conditions))
    .orderBy(desc(cutoffs.minAverage));

  const queryLower = params.q?.trim().toLowerCase() ?? "";
  const locale = params.locale ?? "en";

  const filtered = rows.filter(({ cutoff, dept, uni }) => {
    if (!params.year && latestYearBySystem.get(cutoff.system) !== cutoff.year) {
      return false;
    }
    if (params.governorate && params.governorate !== "all" && uni.governorate !== params.governorate) {
      return false;
    }
    if (params.gender && params.gender !== "both") {
      if (cutoff.gender !== "both" && cutoff.gender !== params.gender) return false;
    }
    if (queryLower) {
      const hay = [
        ...Object.values(uni.name ?? {}),
        ...Object.values(dept.college ?? {}),
        ...Object.values(dept.name ?? {}),
        uni.governorate ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(queryLower)) return false;
    }
    return true;
  });

  const groupsMap = new Map<string, UniversityAdmissionGroup>();
  const diffs: number[] = [];

  for (const { cutoff, dept, uni } of filtered) {
    const margin = Number((params.average - cutoff.minAverage).toFixed(2));
    diffs.push(margin);

    let group = groupsMap.get(uni.id);
    if (!group) {
      group = {
        universityId: uni.id,
        name: uni.name,
        system: uni.system,
        governorate: uni.governorate,
        items: [],
      };
      groupsMap.set(uni.id, group);
    }

    group.items.push({
      cutoffId: cutoff.id,
      departmentId: dept.id,
      externalKey: dept.externalKey,
      college: dept.college,
      department: dept.name,
      system: cutoff.system,
      year: cutoff.year,
      stream: cutoff.stream,
      gender: cutoff.gender,
      studyType: cutoff.studyType,
      channel: cutoff.channel,
      minAverage: cutoff.minAverage,
      margin,
      band: chanceBand(margin),
      confidence: cutoff.confidence,
      sourceUrl: cutoff.sourceUrl,
      sourceDate: cutoff.sourceDate ? cutoff.sourceDate.toISOString().slice(0, 10) : null,
    });
  }

  const groups = [...groupsMap.values()].sort((a, b) => {
    const aMax = a.items[0]?.minAverage ?? 0;
    const bMax = b.items[0]?.minAverage ?? 0;
    if (bMax !== aMax) return bMax - aMax;
    return pickText(a.name, locale).localeCompare(pickText(b.name, locale));
  });

  return {
    counts: countBands(diffs),
    totalMatches: diffs.length,
    totalUniversities: groups.length,
    groups,
    meta: {
      years,
      governorates,
      latestYearBySystem: Object.fromEntries(latestYearBySystem),
    },
  };
}

/** RFC 4180 CSV parser returning array of header-keyed string records. */
export function parseCsvRecords(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0]!.map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]!] = cells[i] ?? "";
    }
    return rec;
  });
}

const cutoffCsvRowSchema = z.object({
  external_key: z.string().min(2).max(80),
  system: z.enum(["federal", "krg", "private"]),
  year: z.coerce.number().int().min(2015).max(2035),
  governorate: z.string().max(60).optional().default(""),
  university_ar: z.string().optional().default(""),
  university_en: z.string().optional().default(""),
  university_ckb: z.string().optional().default(""),
  college_ar: z.string().optional().default(""),
  college_en: z.string().optional().default(""),
  college_ckb: z.string().optional().default(""),
  department_ar: z.string().optional().default(""),
  department_en: z.string().optional().default(""),
  department_ckb: z.string().optional().default(""),
  stream: z.string().min(2).max(20),
  gender: z.enum(["both", "male", "female"]).optional().default("both"),
  study_type: z.string().min(2).max(20).optional().default("morning"),
  channel: z.string().min(2).max(40).optional().default("general"),
  min_average: z.coerce.number().min(0).max(115),
  source_url: z.url({ protocol: /^https?$/ }),
  source_date: z.string().optional().default(""),
  confidence: z.enum(["high", "medium", "low"]).optional().default("medium"),
});

export interface ParsedCutoffRow {
  externalKey: string;
  system: "federal" | "krg" | "private";
  year: number;
  governorate: string | null;
  universityName: I18nText;
  collegeName: I18nText | null;
  departmentName: I18nText;
  stream: string;
  gender: "both" | "male" | "female";
  studyType: string;
  channel: string;
  minAverage: number;
  sourceUrl: string;
  sourceDate: Date | null;
  confidence: "high" | "medium" | "low";
}

function buildI18n(ar?: string, en?: string, ckb?: string): I18nText {
  const out: I18nText = {};
  if (ar?.trim()) out.ar = ar.trim();
  if (en?.trim()) out.en = en.trim();
  if (ckb?.trim()) out.ckb = ckb.trim();
  return out;
}

export async function upsertCutoffRows(db: Db, rows: ParsedCutoffRow[]) {
  const existingUnis = await db.select().from(universities);
  const uniMap = new Map<string, string>();
  for (const u of existingUnis) {
    const key = `${u.system}|${u.governorate ?? ""}|${(u.name.ar ?? u.name.en ?? "").trim().toLowerCase()}`;
    uniMap.set(key, u.id);
  }

  let universitiesCreated = 0;
  let departmentsUpserted = 0;
  let cutoffsUpserted = 0;

  for (const row of rows) {
    // Some universities have campuses in several governorates; keep them apart so the filter is right.
    const uniKey = `${row.system}|${row.governorate ?? ""}|${(row.universityName.ar ?? row.universityName.en ?? "").trim().toLowerCase()}`;
    let universityId = uniMap.get(uniKey);
    if (!universityId) {
      const [created] = await db
        .insert(universities)
        .values({
          system: row.system,
          governorate: row.governorate,
          name: row.universityName,
        })
        .returning({ id: universities.id });
      universityId = created!.id;
      uniMap.set(uniKey, universityId);
      universitiesCreated++;
    }

    const [dept] = await db
      .insert(departments)
      .values({
        universityId,
        college: row.collegeName,
        name: row.departmentName,
        externalKey: row.externalKey,
      })
      .onConflictDoUpdate({
        target: departments.externalKey,
        set: {
          universityId,
          college: row.collegeName,
          name: row.departmentName,
        },
      })
      .returning({ id: departments.id });

    departmentsUpserted++;

    await db
      .insert(cutoffs)
      .values({
        departmentId: dept!.id,
        system: row.system,
        year: row.year,
        stream: row.stream,
        gender: row.gender,
        studyType: row.studyType,
        channel: row.channel,
        minAverage: row.minAverage,
        sourceUrl: row.sourceUrl,
        sourceDate: row.sourceDate,
        confidence: row.confidence,
      })
      .onConflictDoUpdate({
        target: [
          cutoffs.departmentId,
          cutoffs.year,
          cutoffs.stream,
          cutoffs.gender,
          cutoffs.studyType,
          cutoffs.channel,
        ],
        set: {
          minAverage: row.minAverage,
          sourceUrl: row.sourceUrl,
          sourceDate: row.sourceDate,
          confidence: row.confidence,
        },
      });
    cutoffsUpserted++;
  }

  return { universitiesCreated, departmentsUpserted, cutoffsUpserted };
}

/**
 * Role-guarded admin CSV import for admissions cutoffs with dry-run review preview (M6/F8).
 */
export async function importAdmissionsCsv(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  csvText: string,
  options: { dryRun?: boolean; now?: Date } = {},
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const now = options.now ?? new Date();
  const records = parseCsvRecords(csvText);

  const validRows: ParsedCutoffRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  records.forEach((rec, idx) => {
    const lineNum = idx + 2;
    const parsed = cutoffCsvRowSchema.safeParse(rec);
    if (!parsed.success) {
      errors.push(
        `Row ${lineNum}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      return;
    }
    const r = parsed.data;
    const uniName = buildI18n(r.university_ar, r.university_en, r.university_ckb);
    if (Object.keys(uniName).length === 0) {
      errors.push(
        `Row ${lineNum}: at least one university name (university_ar or university_en) is required`,
      );
      return;
    }
    const collegeName = buildI18n(r.college_ar, r.college_en, r.college_ckb);
    const deptName = buildI18n(r.department_ar, r.department_en, r.department_ckb);
    const effectiveDept = Object.keys(deptName).length > 0 ? deptName : collegeName;
    if (Object.keys(effectiveDept).length === 0) {
      errors.push(`Row ${lineNum}: department or college name is required`);
      return;
    }

    // Enforce KRG hard rule: KRG has no official cutoff table, so confidence can never be "high"
    let confidence = r.confidence;
    if (r.system === "krg" && confidence === "high") {
      confidence = "medium";
      warnings.push(`Row ${lineNum} (${r.external_key}): KRG confidence downgraded from high to medium`);
    }

    const studyType = r.study_type === "government" ? "morning" : r.study_type;
    const sourceDate =
      r.source_date && !Number.isNaN(Date.parse(r.source_date)) ? new Date(r.source_date) : null;

    validRows.push({
      externalKey: r.external_key,
      system: r.system,
      year: r.year,
      governorate: r.governorate.trim() || null,
      universityName: uniName,
      collegeName: Object.keys(collegeName).length > 0 ? collegeName : null,
      departmentName: effectiveDept,
      stream: r.stream.toLowerCase(),
      gender: r.gender,
      studyType: studyType.toLowerCase(),
      channel: r.channel.toLowerCase(),
      minAverage: r.min_average,
      sourceUrl: r.source_url,
      sourceDate,
      confidence,
    });
  });

  if (options.dryRun) {
    return {
      ok: true as const,
      dryRun: true as const,
      parsedCount: validRows.length,
      errors,
      warnings,
      preview: validRows.slice(0, 10),
    };
  }

  if (validRows.length === 0) {
    return {
      ok: false as const,
      error: "no_valid_rows" as const,
      errors,
      warnings,
    };
  }

  const stats = await db.transaction((tx) => upsertCutoffRows(tx as unknown as Db, validRows));
  await db.insert(auditLog).values({
    actorId,
    action: "admissions.csv_import",
    entity: "cutoffs",
    after: { ...stats, warningsCount: warnings.length, errorsCount: errors.length },
    at: now,
  });

  return {
    ok: true as const,
    dryRun: false as const,
    parsedCount: validRows.length,
    ...stats,
    errors,
    warnings,
  };
}

const oppCsvRowSchema = z.object({
  type: z
    .enum(["scholarship", "exchange", "fellowship", "internship", "competition", "training", "job"])
    .default("scholarship"),
  title_en: z.string().optional().default(""),
  title_ar: z.string().optional().default(""),
  title_ckb: z.string().optional().default(""),
  title_kmr: z.string().optional().default(""),
  provider_name: z.string().min(2).max(200),
  source_url: z.url({ protocol: /^https?$/ }),
  summary_en: z.string().optional().default(""),
  summary_ar: z.string().optional().default(""),
  deadline: z.string().optional().default(""),
  rolling: z.string().optional().default("false"),
  iraqi_eligibility: z.enum(["yes", "no", "unclear"]).optional().default("unclear"),
});

/**
 * Bulk CSV import of opportunities for editors (F7): NEVER auto-publishes — always lands as `draft`.
 */
export async function importOpportunitiesCsv(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  csvText: string,
  options: { dryRun?: boolean; now?: Date } = {},
) {
  if (!isEditorOrAdmin(actorRole)) return { ok: false as const, error: "forbidden" as const };
  const now = options.now ?? new Date();
  const records = parseCsvRecords(csvText);

  const valid: (typeof opportunities.$inferInsert)[] = [];
  const errors: string[] = [];
  let scamBlocked = 0;

  records.forEach((rec, idx) => {
    const lineNum = idx + 2;
    const parsed = oppCsvRowSchema.safeParse(rec);
    if (!parsed.success) {
      errors.push(
        `Row ${lineNum}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      return;
    }
    const r = parsed.data;
    const title: I18nText = {
      ...(r.title_en ? { en: r.title_en } : {}),
      ...(r.title_ar ? { ar: r.title_ar } : {}),
      ...(r.title_ckb ? { ckb: r.title_ckb } : {}),
      ...(r.title_kmr ? { kmr: r.title_kmr } : {}),
    };
    if (Object.keys(title).length === 0) {
      errors.push(`Row ${lineNum}: at least one title column is required`);
      return;
    }
    const summary: I18nText = {
      ...(r.summary_en ? { en: r.summary_en } : {}),
      ...(r.summary_ar ? { ar: r.summary_ar } : {}),
    };
    const scam = checkScamRedFlags(`${Object.values(title).join(" ")} ${Object.values(summary).join(" ")}`);
    if (scam.flagged) {
      scamBlocked++;
      errors.push(`Row ${lineNum}: blocked by scam filter (${scam.reasons.join(", ")})`);
      return;
    }

    const rolling = r.rolling.toLowerCase() === "true" || r.rolling === "1";
    const parsedDate =
      !rolling && r.deadline && !Number.isNaN(Date.parse(r.deadline)) ? new Date(r.deadline) : null;

    valid.push({
      type: r.type,
      title,
      summary: Object.keys(summary).length > 0 ? summary : null,
      providerName: r.provider_name,
      sourceUrl: r.source_url,
      applyUrl: r.source_url,
      deadline: parsedDate,
      deadlineStatus: parsedDate ? "estimated" : "unknown",
      rolling,
      status: "draft", // Hard rule: bulk CSV imports NEVER auto-publish
      iraqiEligibility: r.iraqi_eligibility,
      needsReview: (["ar", "ckb", "kmr", "en"] as const).filter((l) => !title[l]),
      createdBy: actorId,
    });
  });

  if (options.dryRun) {
    return {
      ok: true as const,
      dryRun: true as const,
      parsedCount: valid.length,
      scamBlocked,
      errors,
      preview: valid.slice(0, 10).map((v) => ({
        title: v.title,
        providerName: v.providerName,
        sourceUrl: v.sourceUrl,
        status: v.status,
      })),
    };
  }

  if (valid.length === 0) {
    return { ok: false as const, error: "no_valid_rows" as const, scamBlocked, errors };
  }

  await db.insert(opportunities).values(valid);
  await db.insert(auditLog).values({
    actorId,
    action: "opportunities.csv_draft_import",
    entity: "opportunity",
    after: { insertedDrafts: valid.length, scamBlocked, errorsCount: errors.length },
    at: now,
  });

  return {
    ok: true as const,
    dryRun: false as const,
    insertedDrafts: valid.length,
    scamBlocked,
    errors,
  };
}
