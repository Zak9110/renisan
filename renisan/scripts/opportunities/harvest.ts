// ============================================
// Renisan — Zero-cost daily multi-source opportunity harvester
// Polls free Tier-1 official APIs/RSS (ReliefWeb Iraq, US Embassy Iraq) and
// Tier-2 lead aggregator RSS feeds (Scholars4Dev, OpportunityDesk, YouthOp)
// every 24 hours.
//
// IMPORTANT: Lead aggregator URLs are NEVER published directly — they are
// queued in review/leads.json so discover.ts (--from-leads) or an editor
// follows through to the official provider website and verifies Iraqi eligibility.
//
// Run: npm run opps:harvest
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { urlKey, nameSimilarity, type ListingRef } from './validate.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DATA = path.join(ROOT, 'public/data/scholarships.json');
const REVIEW = path.join(ROOT, 'review');
export const LEADS_FILE = path.join(REVIEW, 'leads.json');
const CANDIDATES_FILE = path.join(REVIEW, 'candidates.json');
const REJECTED_FILE = path.join(REVIEW, 'rejected.json');
const REPORT_FILE = path.join(REVIEW, 'harvest-report.md');

export type SourceTier = 'official' | 'lead';
export type SourceKind = 'rss' | 'reliefweb_api';

export interface HarvestSource {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  tier: SourceTier;
}

export interface HarvestedLead {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  tier: SourceTier;
  publishedAt?: string;
  summary: string;
  found: string;
  status: 'new' | 'processed' | 'dismissed';
}

export interface LeadsFile {
  updated: string;
  items: HarvestedLead[];
}

export const HARVEST_SOURCES: HarvestSource[] = [
  {
    id: 'reliefweb-iraq-training',
    // Iraq-filtered feed (ReliefWeb country C122). The unfiltered feed is worldwide, but this
    // source is trusted as Iraq-scoped in isIraqRelevantLead. The v2 API now needs an approved appname (403).
    name: 'ReliefWeb Iraq Trainings & Courses (UN OCHA RSS)',
    url: 'https://reliefweb.int/training/rss.xml?advanced-search=%28C122%29',
    kind: 'rss',
    tier: 'official'
  },
  {
    id: 'us-embassy-iraq-rss',
    name: 'U.S. Embassy & Consulate in Iraq',
    url: 'https://iq.usembassy.gov/feed/',
    kind: 'rss',
    tier: 'official'
  },
  {
    id: 'scholars4dev-rss',
    name: 'Scholars4Dev (Leads Only)',
    url: 'https://www.scholars4dev.com/feed/',
    kind: 'rss',
    tier: 'lead'
  },
  {
    id: 'opportunitydesk-rss',
    name: 'Opportunity Desk (Leads Only)',
    url: 'https://opportunitydesk.org/feed/',
    kind: 'rss',
    tier: 'lead'
  },
  {
    id: 'opportunitiescorners-rss',
    name: 'Opportunities Corners (Leads Only)',
    url: 'https://opportunitiescorners.com/feed/',
    kind: 'rss',
    tier: 'lead'
  }
];

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Feeds often entity-escape their HTML (&lt;div&gt;), so strip tags again after decoding
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? decodeXmlEntities(m[1]) : '';
}

function atomHref(block: string): string {
  const m = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  return m ? decodeXmlEntities(m[1]) : '';
}

export interface RawFeedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt?: string;
}

/** Dependency-free parser for RSS 2.0 (<item>) and Atom (<entry>) XML feeds. */
export function parseRssFeed(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  const rssBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const atomBlocks = rssBlocks.length === 0 ? [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]) : [];

  for (const block of rssBlocks) {
    const title = firstTag(block, 'title');
    const url = firstTag(block, 'link') || firstTag(block, 'guid');
    const summary = (firstTag(block, 'description') || firstTag(block, 'content:encoded')).slice(0, 400);
    const publishedAt = firstTag(block, 'pubDate') || firstTag(block, 'dc:date') || undefined;
    if (title && /^https?:\/\//.test(url)) {
      items.push({ title, url, summary, publishedAt });
    }
  }

  for (const block of atomBlocks) {
    const title = firstTag(block, 'title');
    const url = atomHref(block) || firstTag(block, 'id');
    const summary = (firstTag(block, 'summary') || firstTag(block, 'content')).slice(0, 400);
    const publishedAt = firstTag(block, 'published') || firstTag(block, 'updated') || undefined;
    if (title && /^https?:\/\//.test(url)) {
      items.push({ title, url, summary, publishedAt });
    }
  }

  return items;
}

/** Parses ReliefWeb v2 JSON API responses into normalized raw items. */
export function parseReliefWebResponse(payload: unknown): RawFeedItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: RawFeedItem[] = [];
  for (const row of data) {
    const f = (row as { fields?: Record<string, any> })?.fields;
    if (!f) continue;
    const title = typeof f.title === 'string' ? f.title.trim() : '';
    const url = typeof f.url === 'string' ? f.url.trim() : '';
    const body = typeof f.body === 'string' ? decodeXmlEntities(f.body).slice(0, 400) : '';
    const publishedAt = typeof f.date?.created === 'string' ? f.date.created : undefined;
    if (title && /^https?:\/\//.test(url)) {
      out.push({ title, url, summary: body, publishedAt });
    }
  }
  return out;
}

const OPP_KEYWORDS =
  /\b(scholarship|scholarships|fellowship|fellowships|exchange|grant|grants|bursary|fully funded|tuition|undergraduate|master'?s|phd|fulbright|chevening|erasmus|daad|ugrad|iylep|techgirls|training|internship|summer school|منحة|منح|زمالة|سکۆلەرشیپ)\b/i;

const GEO_POSITIVE =
  /\b(iraq|iraqi|kurdistan|middle east|mena|arab|developing countr|international students|all nationalities|global|worldwide|refugee|displaced|العراق|كوردستان|عێراق)\b/i;

const GEO_EXCLUDE_ONLY =
  /\b(us citizens only|u\.s\. citizens only|uk residents only|eu citizens only|canadian citizens only|australian citizens only|nigerian students only|indian students only|african citizens only)\b/i;

/**
 * Filters raw feed entries down to genuinely relevant opportunities that Iraqi
 * students may be eligible for. Official Iraq-scoped feeds pass on opp keywords alone.
 */
export function isIraqRelevantLead(item: RawFeedItem, sourceId: string): boolean {
  const text = `${item.title} ${item.summary}`;
  if (GEO_EXCLUDE_ONLY.test(text)) return false;
  if (!OPP_KEYWORDS.test(text)) return false;
  if (sourceId === 'reliefweb-iraq-training' || sourceId === 'us-embassy-iraq-rss') return true;
  return GEO_POSITIVE.test(text);
}

export function leadId(url: string, title: string): string {
  return 'l-' + crypto.createHash('sha1').update(urlKey(url) ?? title).digest('hex').slice(0, 10);
}

export function dedupeLeads(
  incoming: Omit<HarvestedLead, 'id' | 'found' | 'status'>[],
  opts: {
    existing: ListingRef[];
    rejected: { application_url: string; name?: string }[];
    seenLeads: HarvestedLead[];
    today: string;
  }
): { added: HarvestedLead[]; skipped: number } {
  const existingKeys = new Set(opts.existing.map((e) => urlKey(e.application_url)).filter(Boolean));
  const rejectedKeys = new Set(opts.rejected.map((r) => urlKey(r.application_url)).filter(Boolean));
  const seenKeys = new Set(opts.seenLeads.map((l) => urlKey(l.url)).filter(Boolean));
  const seenIds = new Set(opts.seenLeads.map((l) => l.id));

  const added: HarvestedLead[] = [];
  let skipped = 0;

  for (const raw of incoming) {
    const k = urlKey(raw.url);
    const id = leadId(raw.url, raw.title);
    const isKnownUrl = (k && (existingKeys.has(k) || rejectedKeys.has(k) || seenKeys.has(k))) || seenIds.has(id);
    const isSimilarName =
      opts.existing.some((e) => nameSimilarity(raw.title, e.name) >= 0.65) ||
      opts.seenLeads.some((l) => nameSimilarity(raw.title, l.title) >= 0.75);

    if (isKnownUrl || isSimilarName) {
      skipped++;
      continue;
    }

    const lead: HarvestedLead = {
      ...raw,
      id,
      found: opts.today,
      status: 'new'
    };
    added.push(lead);
    if (k) seenKeys.add(k);
    seenIds.add(id);
  }

  return { added, skipped };
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

type FetchResult = { ok: boolean; status: number; body: string; error?: string };

function requestHeaders(source: HarvestSource, ua: string): Record<string, string> {
  return {
    'user-agent': ua,
    accept: source.kind === 'reliefweb_api' ? 'application/json' : 'application/rss+xml,application/xml,text/xml,*/*',
    'accept-language': 'en-US,en;q=0.9,ar;q=0.8'
  };
}

async function fetchWithUa(source: HarvestSource, ua: string): Promise<FetchResult> {
  try {
    const res = await fetch(source.url, {
      redirect: 'follow',
      headers: requestHeaders(source, ua),
      signal: AbortSignal.timeout(20_000)
    });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : '' };
  } catch (err) {
    return { ok: false, status: 0, body: '', error: (err as Error).message };
  }
}

/**
 * Plain node:https GET fallback. reliefweb.int's firewall intermittently answers Node's fetch
 * (undici) with 406 while node:https gets 200, and node:https allows large response headers
 * (iq.usembassy.gov overflows fetch's 16 KB limit).
 */
function httpsGet(url: string, headers: Record<string, string>, redirectsLeft = 3): Promise<FetchResult> {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', headers, maxHeaderSize: 64 * 1024, timeout: 20_000 }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(location, url).toString();
        if (!next.startsWith('https://')) return resolve({ ok: false, status, body: '', error: 'non-https redirect' });
        return resolve(httpsGet(next, headers, redirectsLeft - 1));
      }
      const ok = status >= 200 && status < 300;
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ ok, status, body: ok ? Buffer.concat(chunks).toString('utf8') : '' }));
      res.on('error', (err) => resolve({ ok: false, status, body: '', error: err.message }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ ok: false, status: 0, body: '', error: err.message }));
    req.end();
  });
}

async function fetchSource(source: HarvestSource): Promise<{ ok: boolean; items: RawFeedItem[]; error?: string }> {
  const ownUa = 'Mozilla/5.0 (compatible; RenisanHarvester/1.0)';
  let res = await fetchWithUa(source, ownUa);
  // Retry through node:https when fetch is rejected (406/429/503) or fails at network level (e.g. header overflow)
  if (!res.ok && (res.status === 0 || [406, 429, 503].includes(res.status)) && source.url.startsWith('https://')) {
    res = await httpsGet(source.url, requestHeaders(source, ownUa));
  }
  if (!res.ok && (res.status === 403 || res.status === 412)) {
    res = await fetchWithUa(
      source,
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
  }
  if (!res.ok) return { ok: false, items: [], error: res.error ?? `HTTP ${res.status}` };
  try {
    const items = source.kind === 'reliefweb_api' ? parseReliefWebResponse(JSON.parse(res.body)) : parseRssFeed(res.body);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: (err as Error).message };
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const listings: any[] = readJson(DATA, []);
  const candidatesFile = readJson<{ items: { record: ListingRef }[] }>(CANDIDATES_FILE, { items: [] });
  const rejected = readJson<{ application_url: string; name?: string }[]>(REJECTED_FILE, []);
  const leadsStore = readJson<LeadsFile>(LEADS_FILE, { updated: today, items: [] });

  const existing: ListingRef[] = [
    ...listings.map((s) => ({ id: s.id, name: s.name, application_url: s.application_url })),
    ...candidatesFile.items.map((c) => ({ name: c.record.name, application_url: c.record.application_url }))
  ];

  const sourceSummaries: string[] = [];
  const incoming: Omit<HarvestedLead, 'id' | 'found' | 'status'>[] = [];

  for (const source of HARVEST_SOURCES) {
    const result = await fetchSource(source);
    if (!result.ok) {
      sourceSummaries.push(`- ❌ **${source.name}** (\`${source.tier}\`): failed (${result.error})`);
      console.warn(`[harvest] ${source.id} failed: ${result.error}`);
      continue;
    }
    const relevant = result.items.filter((it) => isIraqRelevantLead(it, source.id));
    for (const it of relevant) {
      incoming.push({
        title: it.title,
        url: it.url,
        summary: it.summary,
        publishedAt: it.publishedAt,
        sourceId: source.id,
        sourceName: source.name,
        tier: source.tier
      });
    }
    sourceSummaries.push(`- ✅ **${source.name}** (\`${source.tier}\`): ${result.items.length} fetched, ${relevant.length} Iraq-relevant`);
    console.log(`[harvest] ${source.id}: ${result.items.length} fetched, ${relevant.length} relevant`);
  }

  const { added, skipped } = dedupeLeads(incoming, {
    existing,
    rejected,
    seenLeads: leadsStore.items,
    today
  });

  // Cap stored history to the 200 most recent leads so review/leads.json stays compact
  leadsStore.items = [...added, ...leadsStore.items].slice(0, 200);
  leadsStore.updated = today;

  fs.mkdirSync(REVIEW, { recursive: true });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsStore, null, 2) + '\n');

  const lines = [
    `# Daily opportunity harvest — ${today}`,
    '',
    `**${added.length}** new lead(s) queued (${skipped} duplicate/known skipped).`,
    '',
    '## Sources checked',
    ...sourceSummaries,
    '',
    '## New leads',
    ...(added.length === 0
      ? ['No new leads today.']
      : added.map((l) => `- [${l.tier}] **${l.title}** — ${l.sourceName} ([lead](${l.url}))`)),
    ''
  ];
  fs.writeFileSync(REPORT_FILE, lines.join('\n'));
  console.log(`\n${added.length} new lead(s) → ${path.relative(ROOT, LEADS_FILE)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
