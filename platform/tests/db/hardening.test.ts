import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { cutoffs, departments, helperProfiles, orders, users } from "@/db/schema";
import { importVerifiedCutoffsFromDir, mergeIndistinguishableRows } from "@/lib/admissions/import-verified";
import type { ParsedCutoffRow } from "@/lib/admissions/service";
import { httpUrl } from "@/lib/api-guard";
import { deleteUserAccount } from "@/lib/auth/service";
import { applyAsAmbassador, requestAmbassadorIntro, verifyAmbassador } from "@/lib/community/service";
import {
  applyAsHelper,
  createHelperService,
  createServiceOrder,
  listPublicServices,
  listUserOrders,
  reviewHelperService,
  transitionOrder,
  verifyHelper,
} from "@/lib/helpers/service";
import {
  mapLegacyScholarshipToPlatform,
  type LegacyScholarshipRecord,
} from "@/lib/opportunities/import-verified";

const SECRET = "hardening-test-secret-0123456789abcdef";
const now = new Date("2026-11-23T12:00:00Z");
let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  const handle = createDb("pglite://memory");
  db = handle.db;
  close = handle.close;
  await runMigrations(db, "pglite://memory");
});
afterEach(async () => {
  await close();
});

async function makeUser(
  email: string,
  birthYear: number | null = 1995,
  role: "member" | "editor" = "member",
): Promise<string> {
  const [u] = await db.insert(users).values({ email, birthYear, role }).returning();
  return u!.id;
}

const application = {
  bio: { en: "Bio" },
  languages: ["en"],
  subjects: [],
  outcomes: [{ program: "SAMPLE", year: 2025 }],
  verificationMethod: "offer_letter" as const,
  proofRef: "private/x.pdf",
};

async function makeActiveService(editorId: string, helperId: string): Promise<string> {
  await applyAsHelper(db, helperId, application, now);
  await verifyHelper(db, editorId, "editor", helperId, "approve", now);
  const svc = await createHelperService(db, helperId, {
    category: "tutoring",
    title: { en: "SAMPLE" },
    scope: { en: "Scope" },
    deliverables: { en: "Notes" },
    priceIqd: 10000,
    deliveryDays: 2,
    sessionLink: "https://example.org/private-room",
  });
  if (!svc.ok) throw new Error("service not created");
  return svc.service.id;
}

describe("safeguarding and integrity", () => {
  it("fails closed when the birth year is unknown", async () => {
    const editor = await makeUser("ed@example.org", 1990, "editor");
    const helper = await makeUser("h@example.org");
    const unknown = await makeUser("u@example.org", null);
    expect(await applyAsHelper(db, unknown, application, now)).toMatchObject({
      error: "birth_year_required",
    });

    const serviceId = await makeActiveService(editor, helper);
    await reviewHelperService(db, editor, "editor", serviceId, "active", now);
    expect(await createServiceOrder(db, unknown, SECRET, "manual", { serviceId }, now)).toMatchObject({
      error: "birth_year_required",
    });

    const amb = await applyAsAmbassador(
      db,
      helper,
      { university: "U", country: "TR", field: "CS", verificationMethod: "vouches", proofRef: "p" },
      now,
    );
    if (!amb.ok) throw new Error("ambassador");
    await verifyAmbassador(db, editor, "editor", amb.ambassador.id, true, now);
    expect(await requestAmbassadorIntro(db, unknown, amb.ambassador.id, "hello", now)).toMatchObject({
      error: "birth_year_required",
    });
  });

  it("hides session links publicly and until payment is held; refuses unconfigured wallets cleanly", async () => {
    const editor = await makeUser("ed@example.org", 1990, "editor");
    const helper = await makeUser("h@example.org");
    const buyer = await makeUser("b@example.org");
    const serviceId = await makeActiveService(editor, helper);
    await reviewHelperService(db, editor, "editor", serviceId, "active", now);
    expect(JSON.stringify(await listPublicServices(db))).not.toContain("private-room");

    expect(await createServiceOrder(db, buyer, SECRET, "zaincash", { serviceId }, now)).toMatchObject({
      error: "payment_unavailable",
    });
    expect(await db.select().from(orders)).toHaveLength(0);

    const order = await createServiceOrder(db, buyer, SECRET, "manual", { serviceId }, now);
    if (!order.ok) throw new Error("order");
    expect((await listUserOrders(db, buyer)).asBuyer[0]!.service.sessionLink).toBeNull();
    await transitionOrder(db, editor, "editor", order.order.id, "paid_held", { now });
    expect((await listUserOrders(db, buyer)).asBuyer[0]!.service.sessionLink).toContain("private-room");
  });

  it("gives staff no power over their own order or profile, and re-review follows edits", async () => {
    const editor = await makeUser("ed@example.org", 1990, "editor");
    const editorHelper = await makeUser("eh@example.org", 1990, "editor");
    const buyer = await makeUser("b@example.org");
    await applyAsHelper(db, editorHelper, application, now);
    expect(await verifyHelper(db, editorHelper, "editor", editorHelper, "approve", now)).toMatchObject({
      error: "forbidden",
    });
    const serviceId = await makeActiveService(editor, editorHelper);
    expect(await reviewHelperService(db, editorHelper, "editor", serviceId, "active", now)).toMatchObject({
      error: "forbidden",
    });
    await reviewHelperService(db, editor, "editor", serviceId, "active", now);
    const order = await createServiceOrder(db, buyer, SECRET, "manual", { serviceId }, now);
    if (!order.ok) throw new Error("order");
    expect(
      await transitionOrder(db, editorHelper, "editor", order.order.id, "paid_held", { now }),
    ).toMatchObject({ error: "forbidden" });

    await applyAsHelper(db, editorHelper, application, now);
    expect(await listPublicServices(db)).toHaveLength(0);

    await deleteUserAccount(db, editorHelper);
    const [gone] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, editorHelper));
    expect(gone!.bio).toBeNull();
    expect(gone!.outcomes).toEqual([]);
  });

  it("accepts http(s) links only", () => {
    expect(httpUrl.safeParse("https://example.org").success).toBe(true);
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("never invents Iraqi eligibility", () => {
    const map = (nationalities: string[]) =>
      mapLegacyScholarshipToPlatform(
        {
          id: "x",
          name: "SAMPLE",
          name_ar: "نموذج",
          country: "DE",
          provider: "SAMPLE",
          degree_levels: [],
          type: "full_scholarship",
          eligibility: { nationalities },
          application_url: "https://example.org",
          status: "upcoming",
          last_verified: "2026-11-01",
        } as LegacyScholarshipRecord,
        "00000000-0000-0000-0000-000000000000",
        now,
      ).opportunity.iraqiEligibility;
    expect(map([])).toBe("unclear");
    expect(map(["Germany"])).toBe("unclear");
    expect(map(["Iraqi", "Syrian"])).toBe("yes");
  });
});

describe("cutoff import", () => {
  it("keeps the highest minimum of indistinguishable rows and lowers confidence", () => {
    const row = (minAverage: number) =>
      ({
        externalKey: "k",
        year: 2026,
        stream: "literary",
        gender: "both",
        studyType: "morning",
        channel: "general",
        minAverage,
        confidence: "high",
      }) as ParsedCutoffRow;
    const merged = mergeIndistinguishableRows([row(60), row(62), row(61)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ minAverage: 62, confidence: "medium" });
  });

  it("keeps every campus cutoff and replaces rows from older key schemes", async () => {
    const dir = path.resolve(process.cwd(), "../renisan/public/data");
    const first = await importVerifiedCutoffsFromDir(db, dir);
    const rows2026 = await db.select().from(cutoffs).where(eq(cutoffs.year, 2026));
    expect(rows2026.length).toBeGreaterThanOrEqual(1263 + 438 - 2);

    const [anyDept] = await db.select().from(departments).limit(1);
    await db.insert(departments).values({
      universityId: anyDept!.universityId,
      name: { en: "SAMPLE stale" },
      externalKey: "fed-0123456789abcdef",
    });
    await importVerifiedCutoffsFromDir(db, dir);
    expect(await db.select().from(cutoffs)).toHaveLength(first.cutoffsUpserted);
    expect(
      await db.select().from(departments).where(eq(departments.externalKey, "fed-0123456789abcdef")),
    ).toHaveLength(0);
  }, 120_000);
});
