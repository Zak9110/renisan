import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { auditLog, cutoffs, opportunities, users } from "@/db/schema";
import {
  chanceBand,
  countBands,
  importAdmissionsCsv,
  importOpportunitiesCsv,
  parseCsvRecords,
  queryAdmissions,
} from "@/lib/admissions/service";
import { importVerifiedCutoffsFromDir } from "@/lib/admissions/import-verified";

describe("M6 Admissions checker, CSV imports & verified cutoff loader", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("computes chance bands and parses quoted RFC 4180 CSV records", () => {
    expect(chanceBand(3.5)).toBe("safe");
    expect(chanceBand(0.5)).toBe("target");
    expect(chanceBand(-0.5)).toBe("reach");
    expect(countBands([3, 2, 0.1, -1])).toEqual({ safe: 2, target: 1, reach: 1 });

    const parsed = parseCsvRecords('a,b\n"hello, world","quote ""test"""\nplain,value');
    expect(parsed).toEqual([
      { a: "hello, world", b: 'quote "test"' },
      { a: "plain", b: "value" },
    ]);
  });

  it("enforces role guards, KRG confidence cap, no-login admissions query, and draft-only opportunity CSV import", async () => {
    const handle = createDb("pglite://memory");
    close = handle.close;
    const db = handle.db;
    await runMigrations(db, "pglite://memory");

    const [editor] = await db
      .insert(users)
      .values({ email: "ed@example.org", role: "editor", locale: "ar" })
      .returning();
    const [member] = await db
      .insert(users)
      .values({ email: "mem@example.org", role: "member", locale: "ar" })
      .returning();

    const csv = [
      "external_key,system,year,governorate,university_ar,university_en,college_ar,college_en,department_ar,department_en,stream,gender,study_type,channel,min_average,source_url,confidence",
      "fed-baghdad-med,federal,2026,بغداد,جامعة بغداد,University of Baghdad,كلية الطب,College of Medicine,كلية الطب,Medicine,scientific,both,morning,general,100.5,https://example.org/fed,high",
      "fed-baghdad-eng,federal,2026,بغداد,جامعة بغداد,University of Baghdad,كلية الهندسة,College of Engineering,هندسة الحاسوب,Computer Engineering,scientific,both,morning,general,94.0,https://example.org/fed,high",
      "krg-duhok-cs,krg,2024,دهوك,جامعة دهوك,University of Duhok,كلية العلوم,College of Science,علوم الحاسوب,Computer Science,scientific,both,government,general,88.5,https://example.org/krg,high",
    ].join("\n");

    // Non-editor blocked
    const forbidden = await importAdmissionsCsv(db, member!.id, "member", csv, { dryRun: false });
    expect(forbidden.ok).toBe(false);

    // Dry run warns that KRG high confidence is downgraded to medium
    const preview = await importAdmissionsCsv(db, editor!.id, "editor", csv, { dryRun: true });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.parsedCount).toBe(3);
      expect(preview.warnings.some((w) => w.includes("KRG confidence downgraded"))).toBe(true);
    }

    // Commit import
    const imported = await importAdmissionsCsv(db, editor!.id, "editor", csv, { dryRun: false });
    expect(imported.ok).toBe(true);
    if (imported.ok && !imported.dryRun) {
      expect(imported.cutoffsUpserted).toBe(3);
    }

    // Verify KRG row stored with medium confidence and morning study type
    const krgRows = await db.select().from(cutoffs).where(eq(cutoffs.system, "krg"));
    expect(krgRows).toHaveLength(1);
    expect(krgRows[0]!.confidence).toBe("medium");
    expect(krgRows[0]!.studyType).toBe("morning");

    // No-login checker query at average 95.0 (matches Eng 94.0 as Target, CS 88.5 as Safe; excludes Medicine 100.5)
    const q1 = await queryAdmissions(db, { average: 95.0, stream: "scientific", locale: "en" });
    expect(q1.totalMatches).toBe(2);
    expect(q1.counts).toEqual({ safe: 1, target: 1, reach: 0 });

    // With includeReach at 99.0, Medicine (100.5) appears as Reach (-1.5)
    const q2 = await queryAdmissions(db, {
      average: 99.0,
      system: "federal",
      stream: "scientific",
      includeReach: true,
      locale: "en",
    });
    expect(q2.counts.reach).toBe(1);
    expect(q2.groups[0]!.items[0]!.band).toBe("reach");

    // Bulk Opportunity CSV import: blocks scam row, puts valid row in draft (never published)
    const oppCsv = [
      "type,title_en,title_ar,provider_name,source_url,summary_en,deadline,rolling,iraqi_eligibility",
      "scholarship,SAMPLE — Clean Grant,نموذج منحة,Sample Uni,https://example.org/clean,Verified funding,2027-01-15,false,yes",
      "scholarship,Guaranteed Scholarship Pay Fee,احتيال,Bad Actor,https://example.org/scam,Pay processing fee for 100% guaranteed scholarship,,true,yes",
    ].join("\n");

    const oppRes = await importOpportunitiesCsv(db, editor!.id, "editor", oppCsv, { dryRun: false });
    expect(oppRes.ok).toBe(true);
    if (oppRes.ok && !oppRes.dryRun) {
      expect(oppRes.insertedDrafts).toBe(1);
      expect(oppRes.scamBlocked).toBe(1);
    }
    const opps = await db.select().from(opportunities);
    expect(opps).toHaveLength(1);
    expect(opps[0]!.status).toBe("draft");

    const audits = await db.select().from(auditLog);
    expect(audits.some((a) => a.action === "admissions.csv_import")).toBe(true);
    expect(audits.some((a) => a.action === "opportunities.csv_draft_import")).toBe(true);
  });

  it("imports real verified Federal and KRG cutoff JSON files idempotently", async () => {
    const handle = createDb("pglite://memory");
    close = handle.close;
    const db = handle.db;
    await runMigrations(db, "pglite://memory");

    const dataDir = path.resolve(process.cwd(), "../renisan/public/data");
    const first = await importVerifiedCutoffsFromDir(db, dataDir, { limitPerFile: 15 });
    expect(first.cutoffsUpserted).toBeGreaterThan(20);

    // Re-importing is idempotent (same row count, no duplicates)
    const second = await importVerifiedCutoffsFromDir(db, dataDir, { limitPerFile: 15 });
    expect(second.universitiesCreated).toBe(0);

    const krgRows = await db.select().from(cutoffs).where(eq(cutoffs.system, "krg"));
    expect(krgRows.length).toBeGreaterThan(0);
    expect(krgRows.every((r) => r.confidence !== "high")).toBe(true);

    const res = await queryAdmissions(db, { average: 101.5, system: "federal", stream: "scientific" });
    expect(res.totalMatches).toBeGreaterThan(0);
  });
});
