// ============================================
// Renisan Platform — Verified Admissions Cutoff Importer
// Idempotently loads the verified Federal (MOHESR) and KRG (Zankoline) JSON
// cutoff datasets from ../renisan/public/data/ into universities, departments,
// and cutoffs while enforcing the KRG confidence hard rule (never "high").
// ============================================

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray, notExists } from "drizzle-orm";
import type { Db } from "@/db/client";
import { departments, universities } from "@/db/schema";
import { upsertCutoffRows, type ParsedCutoffRow } from "./service";

interface FederalCutoffJson {
  id: string;
  year: number;
  university: string;
  university_en?: string | null;
  university_ku?: string | null;
  college?: string | null;
  college_en?: string | null;
  college_ku?: string | null;
  department?: string | null;
  department_en?: string | null;
  department_ku?: string | null;
  campus?: string | null;
  campus_en?: string | null;
  program_length?: string | null;
  stream: string;
  sub_stream?: string | null;
  gender?: string | null;
  study_type?: string | null;
  channel?: string | null;
  governorate?: string | null;
  min_average: number;
  source_url: string;
  source_date?: string | null;
  confidence?: string | null;
}

interface KrgCutoffJson {
  id: string;
  year: number;
  university: string;
  university_en?: string | null;
  university_ku?: string | null;
  college?: string | null;
  college_en?: string | null;
  college_ku?: string | null;
  department?: string | null;
  department_en?: string | null;
  department_ku?: string | null;
  city?: string | null;
  stream: string;
  gender?: string | null;
  study_type?: string | null;
  min_composite_score: number;
  source_url: string;
  source_date?: string | null;
  confidence?: string | null;
}

function stableExternalKey(
  system: string,
  uni: string,
  college: string,
  dept: string,
  ...place: (string | null | undefined)[]
): string {
  const hash = createHash("sha256")
    .update([system, uni, college, dept, ...place].map((p) => p?.trim() ?? "").join("|"))
    .digest("hex")
    .slice(0, 16);
  return `${system}-${hash}`;
}

/** Campus, "governorate residents" quotas and programme length have their own cutoff, so they show in the name. */
function withCampus(
  name: string,
  campus: string | null | undefined,
  length: string | null | undefined,
  years: string,
): string {
  const base = campus?.trim() ? `${name} — ${campus.trim()}` : name;
  return length?.trim() ? `${base} (${length.trim()} ${years})` : base;
}

/**
 * A few official rows are indistinguishable in the source. Keep the highest minimum (never tell a
 * student they are safe because of the lower one) and do not call that row "high" confidence.
 */
export function mergeIndistinguishableRows(rows: ParsedCutoffRow[]): ParsedCutoffRow[] {
  const byKey = new Map<string, ParsedCutoffRow>();
  for (const row of rows) {
    const key = [row.externalKey, row.year, row.stream, row.gender, row.studyType, row.channel].join("|");
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
    } else if (prev.minAverage !== row.minAverage) {
      const keep = prev.minAverage > row.minAverage ? prev : row;
      byKey.set(key, { ...keep, confidence: keep.confidence === "high" ? "medium" : keep.confidence });
    }
  }
  return [...byKey.values()];
}

function mapGender(g: string | null | undefined): "both" | "male" | "female" {
  if (g === "male" || g === "female") return g;
  return "both";
}

export async function importVerifiedCutoffsFromDir(
  db: Db,
  dataDir: string,
  options: { limitPerFile?: number } = {},
) {
  const federalFiles = [
    "cutoffs-federal-2026.json",
    "cutoffs-federal-2026-distinguished.json",
    "cutoffs-federal-2025.json",
    "cutoffs-federal-2025-distinguished.json",
    "cutoffs-federal-2024.json",
  ];
  const krgFiles = ["cutoffs-krg-2024.json"];

  const rows: ParsedCutoffRow[] = [];
  let missingFile = false;

  for (const file of federalFiles) {
    const full = path.join(dataDir, file);
    if (!existsSync(full)) {
      missingFile = true;
      continue;
    }
    const raw = JSON.parse(readFileSync(full, "utf8")) as FederalCutoffJson[];
    const slice = options.limitPerFile ? raw.slice(0, options.limitPerFile) : raw;
    for (const r of slice) {
      const deptAr = r.department?.trim() || r.college?.trim() || r.university.trim();
      const deptEn = r.department_en?.trim() || r.college_en?.trim() || r.university_en?.trim() || undefined;
      const deptCkb = r.department_ku?.trim() || r.college_ku?.trim() || r.university_ku?.trim() || undefined;
      const colAr = r.college?.trim();
      const colEn = r.college_en?.trim();
      const colCkb = r.college_ku?.trim();

      rows.push({
        externalKey: stableExternalKey(
          "fed",
          r.university,
          colAr ?? "",
          deptAr,
          r.campus,
          r.governorate,
          r.program_length,
        ),
        system: "federal",
        year: r.year,
        governorate: r.governorate?.trim() || null,
        universityName: {
          ar: r.university.trim(),
          ...(r.university_en ? { en: r.university_en.trim() } : {}),
          ...(r.university_ku ? { ckb: r.university_ku.trim() } : {}),
        },
        collegeName: colAr
          ? { ar: colAr, ...(colEn ? { en: colEn } : {}), ...(colCkb ? { ckb: colCkb } : {}) }
          : null,
        departmentName: {
          ar: withCampus(deptAr, r.campus, r.program_length, "سنوات"),
          ...(deptEn ? { en: withCampus(deptEn, r.campus_en ?? r.campus, r.program_length, "years") } : {}),
          ...(deptCkb ? { ckb: withCampus(deptCkb, r.campus, r.program_length, "ساڵ") } : {}),
        },
        stream: [r.stream, r.sub_stream].filter(Boolean).join("-").toLowerCase(),
        gender: mapGender(r.gender),
        studyType: (r.study_type ?? "morning").toLowerCase(),
        channel: (r.channel ?? "general").toLowerCase(),
        minAverage: r.min_average,
        sourceUrl: r.source_url,
        sourceDate:
          r.source_date && !Number.isNaN(Date.parse(r.source_date)) ? new Date(r.source_date) : null,
        confidence: r.confidence === "official" ? "high" : "medium",
      });
    }
  }

  for (const file of krgFiles) {
    const full = path.join(dataDir, file);
    if (!existsSync(full)) {
      missingFile = true;
      continue;
    }
    const raw = JSON.parse(readFileSync(full, "utf8")) as KrgCutoffJson[];
    const slice = options.limitPerFile ? raw.slice(0, options.limitPerFile) : raw;
    for (const r of slice) {
      const deptAr = r.department?.trim() || r.college?.trim() || r.university.trim();
      const deptEn = r.department_en?.trim() || r.college_en?.trim() || r.university_en?.trim() || undefined;
      const deptCkb = r.department_ku?.trim() || r.college_ku?.trim() || r.university_ku?.trim() || undefined;
      const colAr = r.college?.trim();
      const colEn = r.college_en?.trim();
      const colCkb = r.college_ku?.trim();

      rows.push({
        externalKey: stableExternalKey("krg", r.university, colAr ?? "", deptAr, r.city),
        system: "krg",
        year: r.year,
        governorate: r.city?.trim() || null,
        universityName: {
          ar: r.university.trim(),
          ...(r.university_en ? { en: r.university_en.trim() } : {}),
          ...(r.university_ku ? { ckb: r.university_ku.trim() } : {}),
        },
        collegeName: colAr
          ? { ar: colAr, ...(colEn ? { en: colEn } : {}), ...(colCkb ? { ckb: colCkb } : {}) }
          : null,
        departmentName: {
          ar: deptAr,
          ...(deptEn ? { en: deptEn } : {}),
          ...(deptCkb ? { ckb: deptCkb } : {}),
        },
        stream: r.stream.toLowerCase(),
        gender: mapGender(r.gender),
        studyType: r.study_type === "government" ? "morning" : (r.study_type ?? "morning").toLowerCase(),
        channel: "general",
        minAverage: r.min_composite_score,
        sourceUrl: r.source_url,
        sourceDate:
          r.source_date && !Number.isNaN(Date.parse(r.source_date)) ? new Date(r.source_date) : null,
        // Hard rule: KRG cutoffs can never have "high" confidence
        confidence: r.confidence === "estimated" ? "low" : "medium",
      });
    }
  }

  const merged = mergeIndistinguishableRows(rows);
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    const stats = await upsertCutoffRows(txDb, merged);
    // A full load replaces departments written by older importer versions (different generated keys).
    if (!options.limitPerFile && !missingFile) {
      const current = new Set(merged.map((r) => r.externalKey));
      const stale = (
        await txDb.select({ id: departments.id, key: departments.externalKey }).from(departments)
      ).filter((d) => d.key && /^(fed|krg)-[0-9a-f]{16}$/.test(d.key) && !current.has(d.key));
      for (let i = 0; i < stale.length; i += 500) {
        await txDb.delete(departments).where(
          inArray(
            departments.id,
            stale.slice(i, i + 500).map((d) => d.id),
          ),
        );
      }
      await txDb
        .delete(universities)
        .where(
          notExists(
            txDb
              .select({ id: departments.id })
              .from(departments)
              .where(eq(departments.universityId, universities.id)),
          ),
        );
    }
    return stats;
  });
}
