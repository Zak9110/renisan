// ============================================
// Renisan — Opportunity discovery (Claude + web search)
// 1. Research: Claude searches the web for scholarships / exchanges that Iraqi
//    (including Kurdistan Region) students can apply to, reading the
//    provider's own pages.
// 2. Extract: a second call turns the findings into records in the exact
//    shape of public/data/scholarships.json, in Arabic, Sorani, Kurmanji and English.
// 3. Validate and queue: every record is checked (validate.ts) and added to
//    review/candidates.json as "pending". Nothing is published here — an editor
//    accepts or rejects each candidate with `npm run opps:review`.
//
// Run: ANTHROPIC_API_KEY=... npm run opps:discover [-- --focus "masters in Germany"]
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { validateScholarship, urlKey, type ListingRef } from './validate.ts';
import { LEADS_FILE, type HarvestedLead, type LeadsFile } from './harvest.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DATA = path.join(ROOT, 'public/data/scholarships.json');
const REVIEW = path.join(ROOT, 'review');
export const CANDIDATES = path.join(REVIEW, 'candidates.json');
export const REJECTED = path.join(REVIEW, 'rejected.json');

const MODEL = process.env.RENISAN_DISCOVER_MODEL || 'claude-sonnet-5-5';

export interface Candidate {
  cid: string;
  status: 'pending' | 'accepted' | 'rejected';
  found: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: { source_url: string; quote: string; iraq_eligibility_basis: string };
  record: Record<string, any>;
  validation: { errors: string[]; warnings: string[] };
  /** Kurdish and Arabic text is machine-written: a native reader must check it */
  needs_language_review: true;
}

export interface CandidateFile {
  updated: string;
  items: Candidate[];
}

export interface RejectedEntry {
  name: string;
  application_url: string;
  reason: string;
  date: string;
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function candidateId(url: string, name: string): string {
  return 'c-' + crypto.createHash('sha1').update(urlKey(url) ?? name).digest('hex').slice(0, 8);
}

// ---------- Prompts ----------

function researchPrompt(today: string, known: ListingRef[], rejected: RejectedEntry[], focus?: string): string {
  return `Today is ${today}. You are researching for Renisan, a free guidance site for students in Iraq and the Kurdistan Region (mostly Grade-12 leavers and undergraduates; some graduates looking for a master's or PhD).

Find scholarships, fully funded exchanges and fellowships that are NOT already in our list and that Iraqi citizens (including residents of the Kurdistan Region) can apply to. Prefer opportunities that:
- are open now or whose next cycle opens within the next 12 months;
- fund bachelor's study first, then master's / PhD;
- are fully or substantially funded;
- are run by a government, university, foundation or international organisation.
${focus ? `\nThis run's focus: ${focus}\n` : ''}
Rules:
- Confirm every opportunity on the provider's OWN website (fetch the page). Repost sites, social media and blogs may give you leads but are never the source.
- Confirm Iraqi eligibility from the official text (a country list, "all nationalities", a region list that includes Iraq / the Middle East, etc.). If it is unclear, say so.
- Record the exact deadline if announced; if not, give the previous cycle's dates and say the next date is an estimate.
- Note age limits, minimum grades (as a percentage if stated), language tests, and what the award covers.
- Skip anything that charges applicants a fee to be considered, promises guaranteed admission, or that you cannot verify.
- Aim for 5 to 10 strong opportunities rather than many weak ones.

Already listed (do not repeat):
${known.map((k) => `- ${k.name} — ${k.application_url}`).join('\n')}
${rejected.length ? `\nAlready reviewed and rejected (do not suggest again):\n${rejected.map((r) => `- ${r.name} — ${r.application_url} (${r.reason})`).join('\n')}` : ''}

Finish with a plain report: one section per opportunity with its official URL, the quote that shows Iraqis can apply, dates, eligibility, what it covers, and how confident you are.`;
}

/** Focused daily verification prompt: verifies ONLY newly harvested leads on their official provider websites. */
export function buildLeadsResearchPrompt(
  today: string,
  leads: HarvestedLead[],
  known: ListingRef[],
  rejected: RejectedEntry[]
): string {
  return `Today is ${today}. You are verifying newly harvested opportunity leads for Renisan (students in Iraq & the Kurdistan Region).

For each lead below:
1. Open the lead page and follow it to the PROVIDER'S OWN OFFICIAL WEBSITE (never use an aggregator URL as the application_url).
2. Confirm whether Iraqi citizens (including Kurdistan Region residents) can apply, quoting the exact official text.
3. Extract exact announced deadlines (or clearly mark estimated dates), minimum GPA %, max age, language requirements, work experience requirements, and funding coverage.
4. Skip any lead that is expired, charges an application/processing fee, promises guaranteed awards, is not open to Iraqis, or cannot be verified on an official site.

Leads to verify (${leads.length}):
${leads.map((l, i) => `${i + 1}. [${l.tier}] ${l.title}\n   Lead URL: ${l.url}\n   Summary: ${l.summary}`).join('\n')}

Already listed (skip duplicates):
${known.map((k) => `- ${k.name} — ${k.application_url}`).join('\n')}
${rejected.length ? `\nAlready rejected (skip):\n${rejected.map((r) => `- ${r.name} — ${r.application_url}`).join('\n')}` : ''}

Finish with a plain report: one section per verified opportunity with its official URL, the quote proving Iraqi eligibility, dates, eligibility, coverage, and confidence.`;
}

const EXTRACT_SYSTEM = `You convert a research report into JSON records for Renisan's scholarship directory. Use only facts in the report; never invent dates, grades or amounts. Use null when the report does not give a value.

Field conventions (follow the existing data):
- name: English name. name_ar: Arabic. name_ckb: Sorani Kurdish (Arabic script). name_kmr: Kurmanji Kurdish (Latin script).
- country: the host country's name IN ARABIC (e.g. "ألمانيا", "تركيا", "اليابان"); use "متعدد الدول" for multi-country programmes. country_flag: the flag emoji (🌍 for multi-country).
- covers: list in Arabic; covers_en / covers_ckb / covers_kmr: the same list in English / Sorani / Kurmanji.
- deadline: YYYY-MM-DD or null. deadline_estimated: true when the date is projected from a previous cycle. deadline_note (Arabic) and deadline_note_en/_ckb/_kmr explain the dates.
- status: "open" (accepting applications now), "upcoming" (next cycle not open yet), "closed", or "discontinued".
- eligibility.min_gpa: a percentage 0-100, or null. eligibility.max_age: whole years, or null.
- notes_*: one or two short sentences with the most useful advice for an Iraqi applicant, in each language.
- confidence: how sure the report is that the opportunity is real, current and open to Iraqis.
Only include opportunities whose official application_url is the provider's own site.`;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const str = { type: 'string' };
const strList = { type: 'array', items: str };

function obj(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

export const EXTRACT_SCHEMA = obj({
  candidates: {
    type: 'array',
    items: obj({
      name: str,
      name_ar: str,
      name_ckb: str,
      name_kmr: str,
      country: str,
      country_flag: str,
      provider: str,
      degree_levels: { type: 'array', items: { type: 'string', enum: ['bachelor', 'masters', 'phd'] } },
      type: { type: 'string', enum: ['full_scholarship', 'partial_scholarship', 'exchange', 'fellowship'] },
      eligibility: obj({
        nationalities: strList,
        refugee_idp_eligible: { type: 'boolean' },
        min_gpa: nullable({ type: 'number' }),
        max_age: nullable({ type: 'integer' }),
        language_requirements: strList,
        must_return: nullable({ type: 'boolean' })
      }),
      application_url: str,
      deadline: nullable(str),
      deadline_estimated: { type: 'boolean' },
      deadline_note: str,
      deadline_note_en: str,
      deadline_note_ckb: str,
      deadline_note_kmr: str,
      covers: strList,
      covers_en: strList,
      covers_ckb: strList,
      covers_kmr: strList,
      status: { type: 'string', enum: ['open', 'upcoming', 'closed', 'discontinued'] },
      notes_ar: str,
      notes_en: str,
      notes_ckb: str,
      notes_kmr: str,
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      evidence: obj({ source_url: str, quote: str, iraq_eligibility_basis: str })
    })
  }
});

/** Drops nulls / empty optional fields so records match the shape of the existing data. */
export function toRecord(c: Record<string, any>): Record<string, any> {
  const { confidence: _c, evidence: _e, ...rest } = c;
  const record: Record<string, any> = { ...rest, eligibility: { ...rest.eligibility } };
  if (record.deadline == null) {
    delete record.deadline;
    delete record.deadline_estimated;
  }
  for (const k of ['min_gpa', 'max_age', 'must_return']) {
    if (record.eligibility[k] == null) delete record.eligibility[k];
  }
  if (!record.eligibility.language_requirements?.length) delete record.eligibility.language_requirements;
  return record;
}

// ---------- Claude calls ----------

async function research(client: Anthropic, prompt: string): Promise<string> {
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: prompt }];
  for (let round = 0; round < 8; round++) {
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 25 },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 25 }
        ],
        messages
      })
      .finalMessage();

    if (response.stop_reason === 'refusal') {
      throw new Error(`research declined: ${response.stop_details?.explanation ?? 'no explanation'}`);
    }
    if (response.stop_reason === 'pause_turn') {
      // Long server-tool turn: send it back unchanged and the server continues
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (response.stop_reason === 'max_tokens') console.warn('warning: research report hit max_tokens and may be cut short');
    console.log(`research done (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens on the last round)`);
    return text;
  }
  throw new Error('research did not finish within 8 rounds');
}

async function extract(client: Anthropic, report: string): Promise<Record<string, any>[]> {
  const response = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: `Research report:\n\n${report}` }]
    })
    .finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('extraction declined');
  if (response.stop_reason === 'max_tokens') throw new Error('extraction hit max_tokens: try a narrower --focus');
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}';
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.candidates) ? parsed.candidates : [];
}

// ---------- Queue ----------

/** Adds new candidates to the queue; keeps earlier pending ones; skips anything already listed, queued or rejected. */
export function mergeCandidates(
  queue: CandidateFile,
  extracted: Record<string, any>[],
  existing: ListingRef[],
  rejected: RejectedEntry[],
  today: string
): { queue: CandidateFile; added: Candidate[]; skipped: string[] } {
  const added: Candidate[] = [];
  const skipped: string[] = [];
  const known = new Set(queue.items.map((c) => c.cid));
  const rejectedKeys = new Set(rejected.map((r) => urlKey(r.application_url)));
  for (const c of extracted) {
    const record = toRecord(c);
    const cid = candidateId(record.application_url ?? '', record.name ?? '');
    if (known.has(cid)) {
      skipped.push(`${record.name}: already in the review queue`);
      continue;
    }
    if (rejectedKeys.has(urlKey(record.application_url ?? ''))) {
      skipped.push(`${record.name}: rejected before`);
      continue;
    }
    const validation = validateScholarship({ ...record, last_verified: today, verified_by: 'pending' }, { existing, today });
    const dup = validation.errors.find((e) => e.startsWith('looks like a duplicate'));
    if (dup) {
      skipped.push(`${record.name}: ${dup}`);
      continue;
    }
    const item: Candidate = {
      cid,
      status: 'pending',
      found: today,
      confidence: c.confidence ?? 'low',
      evidence: c.evidence ?? { source_url: '', quote: '', iraq_eligibility_basis: '' },
      record,
      validation,
      needs_language_review: true
    };
    queue.items.push(item);
    known.add(cid);
    added.push(item);
  }
  queue.updated = today;
  return { queue, added, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const fromLeads = args.includes('--from-leads');
  const focusIdx = args.indexOf('--focus');
  const focus = focusIdx >= 0 ? args[focusIdx + 1] : undefined;
  const today = new Date().toISOString().slice(0, 10);

  const listings: any[] = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const existing: ListingRef[] = listings.map((s) => ({ id: s.id, name: s.name, application_url: s.application_url }));
  const queue = readJson<CandidateFile>(CANDIDATES, { updated: today, items: [] });
  const rejected = readJson<RejectedEntry[]>(REJECTED, []);
  // Pending candidates count as "known" so the research does not find them again
  const known = [...existing, ...queue.items.filter((c) => c.status === 'pending').map((c) => ({ name: c.record.name, application_url: c.record.application_url }))];

  let prompt: string;
  let leadsStore: LeadsFile | null = null;
  let batchLeads: HarvestedLead[] = [];

  if (fromLeads) {
    leadsStore = readJson<LeadsFile>(LEADS_FILE, { updated: today, items: [] });
    batchLeads = leadsStore.items.filter((l) => l.status === 'new').slice(0, 10);
    if (batchLeads.length === 0) {
      console.log('No new harvested leads to verify. Skipping API call.');
      return;
    }
    console.log(`verifying ${batchLeads.length} newly harvested lead(s) with ${MODEL}…`);
    prompt = buildLeadsResearchPrompt(today, batchLeads, known, rejected);
  } else {
    console.log(`researching with ${MODEL}${focus ? ` (focus: ${focus})` : ''}…`);
    prompt = researchPrompt(today, known, rejected, focus);
  }

  const client = new Anthropic();
  const report = await research(client, prompt);
  fs.mkdirSync(REVIEW, { recursive: true });
  fs.writeFileSync(path.join(REVIEW, `research-${today}.md`), report + '\n');

  console.log('extracting records…');
  const extracted = await extract(client, report);
  const { added, skipped } = mergeCandidates(queue, extracted, existing, rejected, today);
  fs.writeFileSync(CANDIDATES, JSON.stringify(queue, null, 2) + '\n');

  if (leadsStore && batchLeads.length > 0) {
    const doneIds = new Set(batchLeads.map((l) => l.id));
    leadsStore.items = leadsStore.items.map((l) => (doneIds.has(l.id) ? { ...l, status: 'processed' } : l));
    leadsStore.updated = today;
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsStore, null, 2) + '\n');
  }

  console.log(`\n${added.length} new candidate(s) queued, ${skipped.length} skipped.`);
  for (const c of added) {
    const flag = c.validation.errors.length ? `✗ ${c.validation.errors.length} error(s)` : '✓ valid';
    console.log(`  ${c.cid}  [${c.confidence}] ${c.record.name} — ${flag}`);
  }
  for (const s of skipped) console.log(`  skipped: ${s}`);
  console.log('\nNext: npm run opps:review');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err) => {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('No valid Anthropic credentials: set ANTHROPIC_API_KEY (or run `ant auth login`).');
    } else if (err instanceof Anthropic.RateLimitError) {
      console.error('Rate limited by the API: try again later.');
    } else if (err instanceof Anthropic.APIError) {
      console.error(`API error ${err.status}: ${err.message}`);
    } else {
      // e.g. no credentials configured at all: the SDK stops before sending anything
      console.error(`Discovery stopped: ${(err as Error).message}`);
      console.error('Credentials: set ANTHROPIC_API_KEY (or run `ant auth login`).');
    }
    process.exit(1);
  });
}
