import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seed, SAMPLE_PREFIX } from "@/db/seed";
import {
  users,
  profiles,
  opportunities,
  opportunityReports,
  cutoffs,
  universities,
  departments,
} from "@/db/schema";

const URL_ = "pglite://memory";
let db: Db;
let close: () => Promise<void>;
let editorId: string;

beforeAll(async () => {
  ({ db, close } = createDb(URL_));
  await runMigrations(db, URL_);
  const [u] = await db.insert(users).values({ email: "e@example.org", role: "editor" }).returning();
  editorId = u!.id;
});
afterAll(async () => close());

const base = {
  type: "scholarship" as const,
  title: { en: `${SAMPLE_PREFIX} test` },
  providerName: "Example",
  sourceUrl: "https://example.org/x",
};

// Drizzle wraps driver errors; the constraint name is on the cause.
async function rejects(p: Promise<unknown>, constraint: string) {
  const err = await p.then(() => null).catch((e: unknown) => e);
  expect(err, `expected ${constraint} to reject`).not.toBeNull();
  const text = `${String(err)} ${String((err as { cause?: unknown }).cause ?? "")}`;
  expect(text).toContain(constraint);
}

describe("publish guard (DB check constraint)", () => {
  it("rejects a published listing that is not verified", async () => {
    await rejects(
      db.insert(opportunities).values({ ...base, rolling: true, status: "published" }),
      "opp_publish_guard_ck",
    );
  });
  it("rejects a published listing with only an estimated deadline", async () => {
    await rejects(
      db.insert(opportunities).values({
        ...base,
        status: "published",
        deadline: new Date("2027-02-20T00:00:00Z"),
        deadlineStatus: "estimated",
        verifiedBy: editorId,
        verifiedAt: new Date(),
      }),
      "opp_publish_guard_ck",
    );
  });
  it("rejects a published listing with a blank source URL", async () => {
    await rejects(
      db.insert(opportunities).values({
        ...base,
        sourceUrl: "  ",
        rolling: true,
        status: "published",
        verifiedBy: editorId,
        verifiedAt: new Date(),
      }),
      "opp_publish_guard_ck",
    );
  });
  it("accepts a verified listing with a confirmed deadline, and a verified rolling one", async () => {
    const verified = { verifiedBy: editorId, verifiedAt: new Date(), status: "published" as const };
    await db.insert(opportunities).values({
      ...base,
      ...verified,
      deadline: new Date("2027-01-01T00:00:00Z"),
      deadlineStatus: "confirmed",
    });
    await db.insert(opportunities).values({ ...base, ...verified, rolling: true });
  });
  it("allows drafts with no deadline and unclear eligibility", async () => {
    const [row] = await db.insert(opportunities).values(base).returning();
    expect(row!.status).toBe("draft");
    expect(row!.iraqiEligibility).toBe("unclear");
  });
  it("rejects sponsored listings without a sponsor", async () => {
    await rejects(db.insert(opportunities).values({ ...base, sponsored: true }), "opp_sponsored_ck");
  });
});

describe("other constraints", () => {
  it("a user needs a phone or an email", async () => {
    await rejects(db.insert(users).values({ role: "member" }), "users_contact_ck");
  });
  it("one report per user per listing, and per anonymous fingerprint", async () => {
    const [o] = await db.insert(opportunities).values(base).returning();
    await db
      .insert(opportunityReports)
      .values({ opportunityId: o!.id, userId: editorId, reporterFingerprint: "a", reason: "scam" });
    await rejects(
      db
        .insert(opportunityReports)
        .values({ opportunityId: o!.id, userId: editorId, reporterFingerprint: "b", reason: "scam" }),
      "reports_opp_user_uq",
    );
    await db
      .insert(opportunityReports)
      .values({ opportunityId: o!.id, reporterFingerprint: "anon1", reason: "expired" });
    await rejects(
      db
        .insert(opportunityReports)
        .values({ opportunityId: o!.id, reporterFingerprint: "anon1", reason: "other" }),
      "reports_opp_fp_uq",
    );
  });
  it("KRG cut-offs can never be high confidence", async () => {
    const [u] = await db
      .insert(universities)
      .values({ system: "krg", name: { en: "SAMPLE — Uni" } })
      .returning();
    const [d] = await db
      .insert(departments)
      .values({ universityId: u!.id, name: { en: "SAMPLE — Dept" } })
      .returning();
    const row = {
      departmentId: d!.id,
      system: "krg" as const,
      year: 2024,
      stream: "scientific",
      minAverage: 90,
      sourceUrl: "https://example.org",
    };
    await rejects(db.insert(cutoffs).values({ ...row, confidence: "high" }), "cutoffs_krg_confidence_ck");
    await db.insert(cutoffs).values({ ...row, confidence: "low" });
  });
  it("profiles accept federal averages above 100 but reject nonsense", async () => {
    const [u] = await db.insert(users).values({ email: "p@example.org" }).returning();
    await db.insert(profiles).values({ userId: u!.id, educationLevel: "grade12", gpaPercent: 101.29 });
    const [u2] = await db.insert(users).values({ email: "p2@example.org" }).returning();
    await rejects(
      db.insert(profiles).values({ userId: u2!.id, educationLevel: "grade12", gpaPercent: 120 }),
      "profiles_gpa_ck",
    );
  });
});

describe("search columns", () => {
  it("generated search vector finds a listing by any-locale title", async () => {
    await db
      .insert(opportunities)
      .values({ ...base, title: { ckb: "سکۆلەرشیپی تاقیکاری", en: "SAMPLE — Zeta" } });
    const rows = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(sql`${opportunities.searchVector} @@ plainto_tsquery('simple', 'تاقیکاری')`);
    expect(rows.length).toBeGreaterThan(0);
    const fuzzy = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(sql`${opportunities.searchText} % 'SAMPLE Zetta'`);
    expect(fuzzy.length).toBeGreaterThan(0);
  });
});

describe("seed", () => {
  it("only inserts SAMPLE data with example.org links", async () => {
    const { db: fresh, close: closeFresh } = createDb(URL_);
    await runMigrations(fresh, URL_);
    await seed(fresh);
    const rows = await fresh.select().from(opportunities);
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(Object.values(r.title).every((t) => t?.startsWith(SAMPLE_PREFIX))).toBe(true);
      expect(new URL(r.sourceUrl).hostname).toBe("example.org");
    }
    const published = await fresh.select().from(opportunities).where(eq(opportunities.status, "published"));
    expect(published.every((r) => r.verifiedBy && (r.rolling || r.deadlineStatus === "confirmed"))).toBe(
      true,
    );
    await closeFresh();
  });
});
