import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { auditLog, opportunities, users } from "@/db/schema";
import { getEditorDashboard, resolveReport, reviewOpportunity } from "@/lib/admin/service";
import {
  getOpportunityDetail,
  listPublicOpportunities,
  reportOpportunity,
  submitPublicOpportunity,
} from "@/lib/opportunities/service";
import {
  importVerifiedScholarships,
  type LegacyScholarshipRecord,
} from "@/lib/opportunities/import-verified";
import { parseEnv } from "@/lib/env";

const URL_ = "pglite://memory";
let db: Db;
let close: () => Promise<void>;
let editorId: string;
let memberId: string;

beforeAll(async () => {
  ({ db, close } = createDb(URL_));
  await runMigrations(db, URL_);
  const [ed] = await db.insert(users).values({ email: "m3-editor@example.org", role: "editor" }).returning();
  const [mem] = await db.insert(users).values({ email: "m3-member@example.org", role: "member" }).returning();
  editorId = ed!.id;
  memberId = mem!.id;
});
afterAll(async () => close());

describe("M2/M3: public submit, editor review console, 3-report auto-hide & verified import", () => {
  it("validates resend email env requirement cleanly", () => {
    const base = {
      NODE_ENV: "development",
      DATABASE_URL: "pglite://memory",
      APP_URL: "http://localhost:3000",
      SESSION_SECRET: "change-me-32-bytes-minimum-aaaaaaaaaa",
      CRON_SECRET: "change-me-cron-secret",
    };
    expect(() => parseEnv({ ...base, EMAIL_PROVIDER: "resend" })).toThrow(/EMAIL_API_KEY/);
    expect(parseEnv({ ...base, EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_test_123" }).EMAIL_PROVIDER).toBe(
      "resend",
    );
  });

  it("enforces editor role guard in the service layer and blocks members", async () => {
    await expect(getEditorDashboard(db, "member")).rejects.toThrow("forbidden");
    const denied = await reviewOpportunity(db, memberId, "member", "00000000-0000-0000-0000-000000000000", {
      action: "publish",
    });
    expect(denied).toEqual({ ok: false, error: "forbidden" });
  });

  it("supports submit -> editor verify & publish -> detail view -> 3-report auto-hide -> resolve", async () => {
    const now = new Date("2026-11-23T10:00:00Z");

    // Scam submission is blocked upfront
    const scamSub = await submitPublicOpportunity(db, {
      type: "scholarship",
      title: "100% Guaranteed Scholarship — Pay processing fee",
      providerName: "Fake Org",
      sourceUrl: "https://example.org/scam-sub",
      locale: "en",
    });
    expect(scamSub.ok).toBe(false);

    // Legitimate submission enters in_review
    const sub = await submitPublicOpportunity(db, {
      type: "scholarship",
      title: "SAMPLE — M3 Editorial Flow Scholarship",
      summary: "Full tuition for Iraqi undergraduates",
      providerName: "SAMPLE — University",
      sourceUrl: "https://example.org/m3-flow",
      deadline: new Date("2027-04-01T00:00:00Z"),
      locale: "en",
      submittedBy: memberId,
    });
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    const oppId = sub.opportunity.id;
    expect(sub.opportunity.status).toBe("in_review");

    // Publish guard blocks publishing while deadlineStatus is still "estimated"
    const blocked = await reviewOpportunity(db, editorId, "editor", oppId, { action: "publish" }, now);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe("publish_guard_failed");

    // Editor translates, confirms deadline, sets iraqiEligibility, adds GPA rule, and publishes
    const published = await reviewOpportunity(
      db,
      editorId,
      "editor",
      oppId,
      {
        title: {
          en: "SAMPLE — M3 Editorial Flow Scholarship",
          ar: "SAMPLE — منحة اختبار التحرير",
          ckb: "SAMPLE — سکۆلەرشیپی تاقیکردنەوە",
          kmr: "SAMPLE — Bursa Testê",
        },
        deadline: new Date("2027-04-01T20:59:59Z"),
        deadlineStatus: "confirmed",
        iraqiEligibility: "yes",
        rules: [{ field: "gpaPercent", operator: "gte", value: 85, mandatory: true }],
        action: "publish",
      },
      now,
    );
    expect(published.ok).toBe(true);

    // Detail view returns listing + explainable match
    const detail = await getOpportunityDetail(db, oppId, { gpaPercent: 90 }, now);
    expect(detail?.opportunity.status).toBe("published");
    expect(detail?.match?.verdict).toBe("GO");

    // Community reporting: duplicate fingerprint rejected; 3 independent reports auto-hide the listing
    const r1 = await reportOpportunity(db, {
      opportunityId: oppId,
      reporterFingerprint: "fp-1",
      reason: "wrong_info",
      now,
    });
    expect(r1).toEqual({ ok: true, autoHidden: false, openReportCount: 1 });

    const dup = await reportOpportunity(db, {
      opportunityId: oppId,
      reporterFingerprint: "fp-1",
      reason: "scam",
      now,
    });
    expect(dup).toEqual({ ok: false, error: "already_reported" });

    const r2 = await reportOpportunity(db, {
      opportunityId: oppId,
      reporterFingerprint: "fp-2",
      reason: "scam",
      now,
    });
    expect(r2).toEqual({ ok: true, autoHidden: false, openReportCount: 2 });

    const r3 = await reportOpportunity(db, {
      opportunityId: oppId,
      reporterFingerprint: "fp-3",
      reason: "scam",
      now,
    });
    expect(r3).toEqual({ ok: true, autoHidden: true, openReportCount: 3 });

    // Auto-hidden listing vanishes from public feed and detail view
    const publicList = await listPublicOpportunities(db, {}, null, now);
    expect(publicList.some((x) => x.opportunity.id === oppId)).toBe(false);
    expect(await getOpportunityDetail(db, oppId, null, now)).toBeNull();

    // Editor dashboard shows open reports; editor dismisses and listing is unhidden
    const dash = await getEditorDashboard(db, "editor", now);
    expect(dash.freshness.openReportsCount).toBeGreaterThanOrEqual(3);
    const firstReport = dash.reports.find((r) => r.report.opportunityId === oppId);
    expect(firstReport).toBeDefined();

    const resolved = await resolveReport(db, editorId, "editor", firstReport!.report.id, "dismiss", now);
    expect(resolved).toEqual({ ok: true });
    const [reloaded] = await db.select().from(opportunities).where(eq(opportunities.id, oppId));
    expect(reloaded?.hiddenAt).toBeNull();

    // Audit log captured publish, auto-hide, and report dismiss
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, oppId));
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(["opportunity.publish", "opportunity.auto_hide_reports", "report.dismiss"]),
    );
  });

  it("imports all real verified scholarships from renisan/public/data/scholarships.json idempotently", async () => {
    const jsonPath = path.resolve(process.cwd(), "../renisan/public/data/scholarships.json");
    const records = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as LegacyScholarshipRecord[];
    expect(records.length).toBeGreaterThanOrEqual(15);

    const first = await importVerifiedScholarships(db, records, editorId, new Date("2026-11-23T10:00:00Z"));
    expect(first.imported).toBe(records.length);
    expect(first.skipped).toBe(0);

    // Re-running skips all existing records cleanly
    const second = await importVerifiedScholarships(db, records, editorId, new Date("2026-11-23T10:00:00Z"));
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(records.length);
  });
});
