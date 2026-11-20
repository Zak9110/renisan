// ============================================
// Renisan — Listing watcher & daily expiry sweep (no AI, no API key)
// Visits each scholarship's official page every 24h and:
//   • auto-closes confirmed deadlines that have passed (when --auto-expire is set)
//   • reports pages that changed (main-content diff), moved or broke
//   • tracks consecutive failures so transient hiccups are distinguished from dead links
//   • flags expected deadlines coming up soon and stale listings (> 45 days)
// Writes review/watch-report.md and review/watch-state.json.
//
// Run: npm run opps:watch [-- --auto-expire]
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DATA = path.join(ROOT, 'public/data/scholarships.json');
const REVIEW = path.join(ROOT, 'review');
const STATE = path.join(REVIEW, 'watch-state.json');
const REPORT = path.join(REVIEW, 'watch-report.md');

const STALE_DAYS = 45;
const SOON_DAYS = 60;
const USER_AGENT_PRIMARY = 'Mozilla/5.0 (compatible; RenisanListingChecker/1.1)';
const USER_AGENT_BROWSER =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface PageState {
  hash: string;
  finalUrl: string;
  checked: string;
  consecutiveFailures?: number;
}

type Finding = { id: string; name: string; kind: string; detail: string };

/**
 * Visible main-content text only, whitespace-collapsed, with layout chrome
 * (nav, header, footer, aside) and volatile bits (times, copyright years) removed.
 */
export function pageFingerprint(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
    .replace(/©\s*\d{4}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Pure auto-expiry sweep: marks open/upcoming listings with a CONFIRMED
 * (non-estimated) past deadline as "closed". Estimated dates are left for a human
 * editor to verify rather than silently closed.
 */
export function autoExpireListings(
  list: any[],
  today: string
): { list: any[]; expiredIds: string[] } {
  const expiredIds: string[] = [];
  const next = list.map((s) => {
    const live = s.status === 'open' || s.status === 'upcoming';
    if (
      live &&
      !s.deadline_estimated &&
      typeof s.deadline === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(s.deadline) &&
      daysBetween(today, s.deadline) < 0
    ) {
      expiredIds.push(s.id);
      return { ...s, status: 'closed' };
    }
    return s;
  });
  return { list: next, expiredIds };
}

/** Date-only checks, separated from the network so they can be tested. */
export function dateFindings(s: any, today: string): Omit<Finding, 'id' | 'name'>[] {
  const out: Omit<Finding, 'id' | 'name'>[] = [];
  const live = s.status === 'open' || s.status === 'upcoming';
  if (live && s.deadline && /^\d{4}-\d{2}-\d{2}$/.test(s.deadline)) {
    const left = daysBetween(today, s.deadline);
    if (left < 0) out.push({ kind: 'deadline-passed', detail: `deadline ${s.deadline} passed but status is "${s.status}"` });
    else if (s.deadline_estimated && left <= SOON_DAYS) {
      out.push({ kind: 'check-announcement', detail: `expected deadline ${s.deadline} is ${left} days away: check if the cycle is announced` });
    }
  }
  if (s.last_verified && daysBetween(s.last_verified, today) > STALE_DAYS && s.status !== 'discontinued') {
    out.push({ kind: 'stale', detail: `last verified ${s.last_verified} (${daysBetween(s.last_verified, today)} days ago)` });
  }
  return out;
}

async function fetchOnce(url: string, userAgent: string): Promise<{ ok: boolean; status: number; finalUrl: string; html: string; error?: string }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9,ar;q=0.8'
      },
      signal: AbortSignal.timeout(20_000)
    });
    const html = res.ok ? await res.text() : '';
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, html };
  } catch (err) {
    return { ok: false, status: 0, finalUrl: url, html: '', error: (err as Error).message };
  }
}

async function fetchPage(url: string): Promise<{ ok: boolean; status: number; finalUrl: string; html: string; error?: string }> {
  const first = await fetchOnce(url, USER_AGENT_PRIMARY);
  // Retry WAF / bot-filtered responses (e.g. HTTP 403 / 412) with standard browser headers
  if (!first.ok && (first.status === 403 || first.status === 412 || first.status === 429)) {
    return fetchOnce(url, USER_AGENT_BROWSER);
  }
  return first;
}

async function main() {
  const autoExpire = process.argv.includes('--auto-expire');
  const today = new Date().toISOString().slice(0, 10);
  let list: any[] = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const state: Record<string, PageState> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const findings: Finding[] = [];
  const nextState: Record<string, PageState> = {};

  let autoExpiredIds: string[] = [];
  if (autoExpire) {
    const sweep = autoExpireListings(list, today);
    autoExpiredIds = sweep.expiredIds;
    if (autoExpiredIds.length > 0) {
      list = sweep.list;
      fs.writeFileSync(DATA, JSON.stringify(list, null, 2) + '\n');
      for (const id of autoExpiredIds) {
        const s = list.find((x) => x.id === id);
        findings.push({
          id,
          name: s?.name ?? id,
          kind: 'auto-expired',
          detail: `confirmed deadline ${s?.deadline} passed; automatically marked status="closed"`
        });
      }
    }
  }

  for (const s of list) {
    const name = s.name;
    for (const f of dateFindings(s, today)) findings.push({ id: s.id, name, ...f });
    if (s.status === 'discontinued') continue;

    const page = await fetchPage(s.application_url);
    const prev = state[s.id];
    if (!page.ok) {
      const fails = (prev?.consecutiveFailures ?? 0) + 1;
      findings.push({
        id: s.id,
        name,
        kind: 'unreachable',
        detail: `${page.error ? `could not load (${page.error})` : `HTTP ${page.status}`} (consecutive failures: ${fails})`
      });
      nextState[s.id] = prev
        ? { ...prev, consecutiveFailures: fails }
        : { hash: '', finalUrl: s.application_url, checked: today, consecutiveFailures: fails };
      continue;
    }
    const hash = pageFingerprint(page.html);
    if (prev && prev.hash && prev.hash !== hash) {
      findings.push({ id: s.id, name, kind: 'page-changed', detail: `official page changed since ${prev.checked}: re-check deadline, status and eligibility` });
    }
    const movedHost = new URL(page.finalUrl).hostname !== new URL(s.application_url).hostname;
    if (movedHost) findings.push({ id: s.id, name, kind: 'moved', detail: `now redirects to ${page.finalUrl}` });
    nextState[s.id] = { hash, finalUrl: page.finalUrl, checked: today, consecutiveFailures: 0 };
    console.log(`${s.id} ${page.status} ${prev?.hash ? (prev.hash === hash ? 'same' : 'CHANGED') : 'first check'}`);
  }

  fs.mkdirSync(REVIEW, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(nextState, null, 2) + '\n');

  const order = ['auto-expired', 'deadline-passed', 'unreachable', 'moved', 'page-changed', 'check-announcement', 'stale'];
  findings.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const lines = [
    `# Listing check — ${today}`,
    '',
    findings.length === 0
      ? 'Nothing needs attention.'
      : `${findings.length} item(s) need a look${autoExpiredIds.length ? ` (${autoExpiredIds.length} auto-expired)` : ''}. After checking a listing on its official page, update it in \`public/data/scholarships.json\` and set \`last_verified\` to today.`,
    '',
    ...findings.map((f) => `- **${f.kind}** · \`${f.id}\` ${f.name}: ${f.detail}`),
    ''
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\n${findings.length} finding(s) → ${path.relative(ROOT, REPORT)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
