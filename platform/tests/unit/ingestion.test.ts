import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { ingestionRuns, opportunities, users } from "@/db/schema";
import {
  checkScamRedFlags,
  parseReliefWebJson,
  parseRssXml,
  runDailyIngestion,
  type SourceFetcher,
} from "@/lib/ingestion/daily";

const URL_ = "pglite://memory";
let db: Db;
let close: () => Promise<void>;
let editorId: string;

beforeAll(async () => {
  ({ db, close } = createDb(URL_));
  await runMigrations(db, URL_);
  const [u] = await db.insert(users).values({ email: "ing-editor@example.org", role: "editor" }).returning();
  editorId = u!.id;
});
afterAll(async () => close());

describe("daily 24h ingestion engine", () => {
  it("detects scam red flags (fees, guarantees, upfront bank info)", () => {
    expect(
      checkScamRedFlags("Pay a $50 processing fee to claim your 100% guaranteed scholarship").flagged,
    ).toBe(true);
    expect(checkScamRedFlags("Fully funded Master's scholarship in Germany for Iraqi students").flagged).toBe(
      false,
    );
  });

  it("parses RSS 2.0, Atom, and ReliefWeb v2 JSON cleanly", () => {
    const rss = parseRssXml(
      `<rss><channel><item><title><![CDATA[Fulbright Iraq Scholarship]]></title><link>https://iq.usembassy.gov/fulbright</link><description>Master study</description></item></channel></rss>`,
      "US Embassy",
    );
    expect(rss).toHaveLength(1);
    expect(rss[0]?.title).toBe("Fulbright Iraq Scholarship");

    const rw = parseReliefWebJson({
      data: [
        {
          fields: {
            title: "Leadership Training Grant in Erbil",
            url: "https://reliefweb.int/training/999",
            body: "Free youth fellowship",
            source: [{ name: "UNDP" }],
          },
        },
      ],
    });
    expect(rw).toHaveLength(1);
    expect(rw[0]?.providerName).toBe("UNDP");
  });

  it("auto-expires passed confirmed listings and queues new online items strictly as in_review", async () => {
    const now = new Date("2026-11-20T12:00:00Z");

    // Seed one confirmed expired published listing
    const [exp] = await db
      .insert(opportunities)
      .values({
        type: "scholarship",
        title: { en: "SAMPLE — Past Confirmed Listing" },
        providerName: "SAMPLE — Foundation",
        sourceUrl: "https://example.org/expired-confirmed",
        deadline: new Date("2026-11-01T00:00:00Z"),
        deadlineStatus: "confirmed",
        rolling: false,
        status: "published",
        iraqiEligibility: "yes",
        verifiedBy: editorId,
        verifiedAt: new Date("2026-10-01T00:00:00Z"),
      })
      .returning();

    const mockFetch: SourceFetcher = async (url) => {
      if (url.includes("reliefweb.int")) {
        return {
          ok: true,
          status: 200,
          text: `<rss><channel>
            <item><title>SAMPLE — Youth Tech Fellowship Iraq</title><link>https://example.org/rw-fellowship-1</link><description>Free fellowship for Iraqi students</description></item>
            <item><title>100% Guaranteed Scholarship with processing fee</title><link>https://example.org/scam-1</link><description>Pay a processing fee now</description></item>
          </channel></rss>`,
        };
      }
      return {
        ok: true,
        status: 200,
        text: `<rss><channel><item><title>SAMPLE — Embassy Exchange Scholarship</title><link>https://example.org/embassy-ex-1</link><description>Exchange for Iraqi students</description></item></channel></rss>`,
      };
    };

    const summary = await runDailyIngestion(db, mockFetch, now);
    expect(summary.expiredCount).toBe(1);
    expect(summary.candidatesQueued).toBe(2);
    expect(summary.scamBlocked).toBe(1);

    const [reloaded] = await db.select().from(opportunities).where(eq(opportunities.id, exp!.id));
    expect(reloaded?.status).toBe("expired");

    const inReview = await db.select().from(opportunities).where(eq(opportunities.status, "in_review"));
    expect(inReview.length).toBeGreaterThanOrEqual(2);
    const rwItem = inReview.find((o) => o.sourceUrl === "https://example.org/rw-fellowship-1");
    expect(rwItem?.type).toBe("training");

    // Running a second time deduplicates already-queued URLs
    const second = await runDailyIngestion(db, mockFetch, now);
    expect(second.candidatesQueued).toBe(0);

    const runs = await db.select().from(ingestionRuns);
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });
});
