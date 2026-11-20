// Dev data only. Everything here is obviously fake (hard rule 1): titles start with "SAMPLE —"
// and every link points at example.org. Never put real scholarship data in this file.
import { createDb, type Db } from "./client";
import { runMigrations } from "./migrate";
import { users, opportunities, eligibilityRules } from "./schema";

export const SAMPLE_PREFIX = "SAMPLE —";

export async function seed(db: Db) {
  const [editor] = await db
    .insert(users)
    .values({ email: "editor@example.org", role: "editor", locale: "en" })
    .onConflictDoNothing()
    .returning();
  const editorId = editor?.id;
  if (!editorId) return { inserted: 0 };

  const now = new Date();
  const rows = await db
    .insert(opportunities)
    .values([
      {
        type: "scholarship",
        title: {
          en: `${SAMPLE_PREFIX} Example Undergraduate Scholarship`,
          ar: `${SAMPLE_PREFIX} منحة جامعية تجريبية`,
          ckb: `${SAMPLE_PREFIX} سکۆلەرشیپی تاقیکاری`,
          kmr: `${SAMPLE_PREFIX} Bursa ceribandinê`,
        },
        summary: { en: "Fake listing for local development." },
        providerName: `${SAMPLE_PREFIX} Example Foundation`,
        sourceUrl: "https://example.org/sample-scholarship",
        rolling: true,
        status: "published",
        iraqiEligibility: "yes",
        levels: ["grade12"],
        fundingType: "full",
        needsReview: ["ckb", "kmr"],
        verifiedBy: editorId,
        verifiedAt: now,
        lastCheckedAt: now,
        createdBy: editorId,
      },
      {
        type: "exchange",
        title: { en: `${SAMPLE_PREFIX} Example Exchange (draft, estimated date)` },
        providerName: `${SAMPLE_PREFIX} Example University`,
        sourceUrl: "https://example.org/sample-exchange",
        deadline: new Date(now.getTime() + 60 * 24 * 3600 * 1000),
        deadlineStatus: "estimated",
        status: "draft",
        iraqiEligibility: "unclear",
        levels: ["undergrad"],
        createdBy: editorId,
      },
    ])
    .returning({ id: opportunities.id });

  const first = rows[0];
  if (first) {
    await db.insert(eligibilityRules).values({
      opportunityId: first.id,
      field: "gpaPercent",
      operator: "gte",
      value: 80,
      mandatory: true,
      explanation: { en: "Requires an average of 80% or more" },
    });
  }
  return { inserted: rows.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, close } = createDb(url);
  await runMigrations(db, url);
  const result = await seed(db);
  await close();
  console.log(`Seeded ${result.inserted} SAMPLE opportunities.`);
}
