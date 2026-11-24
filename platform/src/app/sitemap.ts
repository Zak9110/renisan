import type { MetadataRoute } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { locales } from "@/i18n/config";
import { opportunities } from "@/db/schema";
import { phase2Enabled } from "@/lib/features";
import { getDb } from "@/lib/db-singleton";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const suffix of [
      "",
      "/opportunities",
      "/admissions",
      "/submit",
      ...(phase2Enabled ? ["/helpers", "/community"] : []),
    ]) {
      entries.push({
        url: `${base}/${locale}${suffix}`,
        lastModified: new Date(),
      });
    }
  }

  try {
    const db = await getDb();
    const published = await db
      .select({ id: opportunities.id, updatedAt: opportunities.updatedAt })
      .from(opportunities)
      .where(and(eq(opportunities.status, "published"), isNull(opportunities.hiddenAt)));

    for (const opp of published) {
      for (const locale of locales) {
        entries.push({
          url: `${base}/${locale}/opportunities/${opp.id}`,
          lastModified: opp.updatedAt,
        });
      }
    }
  } catch {
    // Allow sitemap generation even if DB is unavailable at static build time
  }

  return entries;
}
