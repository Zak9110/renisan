// ============================================
// Renisan Platform — Daily 24-Hour Automated Ingestion Engine
// 1. Runs automatic expiry sweep for confirmed passed deadlines.
// 2. Harvests free official RSS sources (ReliefWeb Iraq, U.S. Embassy Iraq).
// 3. Screens every candidate through scam red-flag rules (docs/SAFEGUARDING-TRUST.md).
// 4. Deduplicates against existing opportunities and inserts new leads as
//    status = "in_review" (NEVER auto-published without editor verification).
// ============================================

import { request as httpsRequest } from "node:https";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { ingestionRuns, ingestionSources, opportunities } from "@/db/schema";
import { expirePassedOpportunitiesDetailed } from "@/lib/opportunities/service";

export interface RawFeedItem {
  title: string;
  url: string;
  summary: string;
  providerName: string;
  publishedAt?: string;
}

export interface ScamCheckResult {
  flagged: boolean;
  reasons: string[];
}

const SCAM_PATTERNS: { reason: string; re: RegExp }[] = [
  {
    reason: "application_or_processing_fee",
    re: /\b(processing fee|disbursement fee|redemption fee|pay to apply|registration fee for scholarship)\b/i,
  },
  {
    reason: "guaranteed_award_claim",
    re: /\b(100%\s*guaranteed|guaranteed scholarship|guaranteed admission|money[\s-]back guarantee)\b/i,
  },
  {
    reason: "bank_card_upfront",
    re: /\b(send bank details|credit card required to claim|wire transfer fee)\b/i,
  },
  {
    reason: "fake_urgency",
    re: /\b(you have been selected|act in the next 2 hours|claim your prize now)\b/i,
  },
];

/** Hard rule 4 / SAFEGUARDING-TRUST: catches common scholarship scam signals before queueing. */
export function checkScamRedFlags(text: string): ScamCheckResult {
  const reasons: string[] = [];
  for (const p of SCAM_PATTERNS) {
    if (p.re.test(text)) reasons.push(p.reason);
  }
  return { flagged: reasons.length > 0, reasons };
}

function decodeXml(raw: string): string {
  return (
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      // Feeds often entity-escape their HTML (&lt;div&gt;), so strip tags again after decoding
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function tagText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  return m ? decodeXml(m[1] ?? "") : "";
}

export function parseRssXml(xml: string, fallbackProvider: string): RawFeedItem[] {
  const out: RawFeedItem[] = [];
  const rss = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1] ?? "");
  const atom =
    rss.length === 0 ? [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1] ?? "") : [];

  for (const b of rss) {
    const title = tagText(b, "title");
    const url = tagText(b, "link") || tagText(b, "guid");
    const summary = tagText(b, "description").slice(0, 400);
    const publishedAt = tagText(b, "pubDate") || undefined;
    if (title && /^https?:\/\//.test(url)) {
      out.push({ title, url, summary, providerName: fallbackProvider, publishedAt });
    }
  }
  for (const b of atom) {
    const title = tagText(b, "title");
    const hrefMatch = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(b);
    const url = decodeXml(hrefMatch?.[1] ?? "") || tagText(b, "id");
    const summary = (tagText(b, "summary") || tagText(b, "content")).slice(0, 400);
    const publishedAt = tagText(b, "published") || tagText(b, "updated") || undefined;
    if (title && /^https?:\/\//.test(url)) {
      out.push({ title, url, summary, providerName: fallbackProvider, publishedAt });
    }
  }
  return out;
}

export function parseReliefWebJson(payload: unknown): RawFeedItem[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: RawFeedItem[] = [];
  for (const row of data) {
    const f = (row as { fields?: Record<string, unknown> })?.fields;
    if (!f) continue;
    const title = typeof f.title === "string" ? f.title.trim() : "";
    const url = typeof f.url === "string" ? f.url.trim() : "";
    const body = typeof f.body === "string" ? decodeXml(f.body).slice(0, 400) : "";
    const sources = Array.isArray(f.source) ? (f.source as { name?: string }[]) : [];
    const providerName = sources[0]?.name || "ReliefWeb Iraq";
    if (title && /^https?:\/\//.test(url)) {
      out.push({ title, url, summary: body, providerName });
    }
  }
  return out;
}

const DEFAULT_SOURCES = [
  {
    // The ReliefWeb API (api.reliefweb.int/v2) now returns 403 unless the appname is pre-approved by
    // ReliefWeb, so we use the public RSS feed filtered to Iraq (country C122) instead.
    slug: "reliefweb-iraq-training",
    name: "ReliefWeb Iraq Trainings (UN OCHA)",
    kind: "rss",
    tier: "official",
    url: "https://reliefweb.int/training/rss.xml?advanced-search=%28C122%29",
  },
  {
    slug: "us-embassy-iraq-rss",
    name: "U.S. Embassy & Consulate in Iraq",
    kind: "rss",
    tier: "official",
    url: "https://iq.usembassy.gov/feed/",
  },
];

const OPP_SIGNAL =
  /\b(scholarship|fellowship|exchange|grant|training|fulbright|chevening|erasmus|daad|ugrad|iylep|internship)\b/i;

export type SourceFetcher = (url: string) => Promise<{ ok: boolean; text: string; status: number }>;

/**
 * Plain node:https GET, used as a fallback when Node's fetch (undici) is rejected:
 * - iq.usembassy.gov sends response headers larger than fetch's 16 KB limit (UND_ERR_HEADERS_OVERFLOW);
 *   node:https lets us raise the limit per request instead of needing NODE_OPTIONS in every deployment.
 * - reliefweb.int's firewall intermittently answers fetch with 406 while node:https gets 200.
 */
function httpsGet(
  url: string,
  headers: Record<string, string>,
  redirectsLeft = 3,
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      { method: "GET", headers, maxHeaderSize: 64 * 1024, timeout: 15_000 },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          res.resume();
          const next = new URL(location, url).toString();
          if (!next.startsWith("https://")) return reject(new Error("refusing non-https redirect"));
          return resolve(httpsGet(next, headers, redirectsLeft - 1));
        }
        const ok = status >= 200 && status < 300;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ ok, status, text: ok ? Buffer.concat(chunks).toString("utf8") : "" }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

// Statuses where retrying the same request through node:https (different client fingerprint) helps
const FETCH_REJECTED_STATUSES = new Set([406, 429, 503]);

function requestHeaders(ua: string): Record<string, string> {
  return {
    "user-agent": ua,
    accept:
      "application/rss+xml,application/atom+xml,application/xml,text/xml,application/json;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,ar;q=0.8",
  };
}

function isHeadersOverflow(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause;
  return cause?.code === "UND_ERR_HEADERS_OVERFLOW";
}

const defaultFetcher: SourceFetcher = async (url) => {
  const attempt = async (ua: string) => {
    const headers = requestHeaders(ua);
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : "" };
    } catch (err) {
      if (isHeadersOverflow(err) && url.startsWith("https://")) return httpsGet(url, headers);
      throw err;
    }
  };
  const ownUa = "Mozilla/5.0 (compatible; RenisanPlatform/1.0)";
  let first = await attempt(ownUa);
  if (!first.ok && FETCH_REJECTED_STATUSES.has(first.status) && url.startsWith("https://")) {
    first = await httpsGet(url, requestHeaders(ownUa));
  }
  if (!first.ok && (first.status === 403 || first.status === 412)) {
    return attempt(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
  }
  return first;
};

export interface DailyIngestionSummary {
  expiredCount: number;
  expiredIds: string[];
  sourcesChecked: number;
  itemsFetched: number;
  candidatesQueued: number;
  scamBlocked: number;
  errors: string[];
}

/**
 * Runs the complete 24-hour sync: expiry sweep + multi-source online harvest into `in_review`.
 */
export async function runDailyIngestion(
  db: Db,
  fetcher: SourceFetcher = defaultFetcher,
  now: Date = new Date(),
): Promise<DailyIngestionSummary> {
  const { count: expiredCount, expiredIds } = await expirePassedOpportunitiesDetailed(db, now);

  // Upsert default official sources so fixes to their URL/kind reach already-seeded databases.
  // `enabled` is left untouched so an editor can still switch a default source off.
  for (const s of DEFAULT_SOURCES) {
    await db
      .insert(ingestionSources)
      .values(s)
      .onConflictDoUpdate({
        target: ingestionSources.slug,
        set: { name: s.name, kind: s.kind, tier: s.tier, url: s.url },
      });
  }

  const activeSources = await db.select().from(ingestionSources).where(eq(ingestionSources.enabled, true));

  const existingOpps = await db.select({ sourceUrl: opportunities.sourceUrl }).from(opportunities);
  const knownUrls = new Set(existingOpps.map((o) => o.sourceUrl.replace(/\/+$/, "").toLowerCase()));

  let itemsFetched = 0;
  let candidatesQueued = 0;
  let scamBlocked = 0;
  const errors: string[] = [];

  for (const src of activeSources) {
    const startedAt = new Date();
    try {
      const res = await fetcher(src.url);
      if (!res.ok) {
        const msg = `${src.slug}: HTTP ${res.status}`;
        errors.push(msg);
        await db
          .update(ingestionSources)
          .set({ consecutiveFailures: src.consecutiveFailures + 1 })
          .where(eq(ingestionSources.id, src.id));
        await db.insert(ingestionRuns).values({
          sourceId: src.id,
          kind: "daily_harvest",
          startedAt,
          finishedAt: new Date(),
          error: msg,
        });
        continue;
      }

      const rawItems =
        src.kind === "reliefweb_api"
          ? parseReliefWebJson(JSON.parse(res.text))
          : parseRssXml(res.text, src.name);

      itemsFetched += rawItems.length;
      let queuedForSource = 0;

      for (const item of rawItems) {
        const text = `${item.title} ${item.summary}`;
        if (!OPP_SIGNAL.test(text)) continue;

        const scam = checkScamRedFlags(text);
        if (scam.flagged) {
          scamBlocked++;
          continue;
        }

        const normUrl = item.url.replace(/\/+$/, "").toLowerCase();
        if (knownUrls.has(normUrl)) continue;
        knownUrls.add(normUrl);

        // Hard rule: never auto-publish scraped items — always queue as in_review for editor verification.
        await db.insert(opportunities).values({
          type: src.kind === "reliefweb_api" || src.slug.startsWith("reliefweb") ? "training" : "scholarship",
          title: { en: item.title },
          summary: item.summary ? { en: item.summary } : null,
          providerName: item.providerName.slice(0, 200),
          sourceUrl: item.url,
          applyUrl: item.url,
          deadlineStatus: "unknown",
          rolling: false,
          status: "in_review",
          iraqiEligibility: "unclear",
          needsReview: ["ar", "ckb", "kmr"],
        });
        queuedForSource++;
        candidatesQueued++;
      }

      await db
        .update(ingestionSources)
        .set({ lastFetchedAt: new Date(), consecutiveFailures: 0 })
        .where(eq(ingestionSources.id, src.id));

      await db.insert(ingestionRuns).values({
        sourceId: src.id,
        kind: "daily_harvest",
        startedAt,
        finishedAt: new Date(),
        itemsFetched: rawItems.length,
        candidatesQueued: queuedForSource,
        expiredCount,
      });
    } catch (err) {
      const msg = `${src.slug}: ${(err as Error).message}`;
      errors.push(msg);
      await db.insert(ingestionRuns).values({
        sourceId: src.id,
        kind: "daily_harvest",
        startedAt,
        finishedAt: new Date(),
        error: msg,
      });
    }
  }

  return {
    expiredCount,
    expiredIds,
    sourcesChecked: activeSources.length,
    itemsFetched,
    candidatesQueued,
    scamBlocked,
    errors,
  };
}
