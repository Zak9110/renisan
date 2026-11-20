// ============================================
// Renisan — Opportunity validator
// Every scholarship that reaches public/data/scholarships.json passes through
// here: the review CLI refuses records with errors, and the discovery job
// reports warnings so the editor knows what to check by hand.
// ============================================

import { isKnownPlace } from '../../src/lib/places.ts';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['open', 'closed', 'upcoming', 'discontinued'];
const TYPES = ['full_scholarship', 'partial_scholarship', 'exchange', 'fellowship'];
const LEVELS = ['bachelor', 'masters', 'phd'];

/**
 * Sites that repost other people's opportunities. They are fine as leads,
 * never as the source a student is sent to.
 */
export const AGGREGATOR_DOMAINS = [
  'opportunitydesk.org',
  'opportunitiescorners.com',
  'opportunitiescorners.info',
  'scholars4dev.com',
  'scholarshipsads.com',
  'scholarship-positions.com',
  'afterschoolafrica.com',
  'youthop.com',
  'mladiinfo.eu',
  'scholarshiproar.com',
  'studyportals.com',
  'scholarshipdb.net',
  'wemakescholars.com',
  'facebook.com',
  'instagram.com',
  't.me',
  'telegram.me',
  'tiktok.com',
  'x.com',
  'twitter.com'
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isAggregator(url: string): boolean {
  const host = hostOf(url);
  return host != null && AGGREGATOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** host + path without trailing slash, for duplicate checks */
export function urlKey(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return null;
  }
}

function tokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !['the', 'and', 'for', 'programme', 'program', 'scholarship', 'scholarships'].includes(w))
  );
}

/** Jaccard similarity of meaningful name words, 0..1 */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface ListingRef {
  id?: string;
  name: string;
  application_url: string;
}

/** Returns the id/name of an existing listing this one probably duplicates, or null. */
export function findDuplicate(candidate: ListingRef, existing: ListingRef[]): ListingRef | null {
  const key = urlKey(candidate.application_url);
  for (const e of existing) {
    if (key && urlKey(e.application_url) === key) return e;
    if (nameSimilarity(candidate.name, e.name) >= 0.6) return e;
  }
  return null;
}

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const nonEmptyList = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(nonEmpty);

export function validateScholarship(
  s: any,
  opts: { existing?: ListingRef[]; today?: string } = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  if (!s || typeof s !== 'object') return { errors: ['not an object'], warnings };

  for (const f of ['name', 'name_ar', 'name_ckb', 'name_kmr', 'provider', 'country', 'country_flag', 'application_url']) {
    if (!nonEmpty(s[f])) errors.push(`${f} is required`);
  }
  for (const f of ['covers', 'covers_en', 'covers_ckb', 'covers_kmr']) {
    if (!nonEmptyList(s[f])) errors.push(`${f} must be a non-empty list`);
  }
  if (!STATUSES.includes(s.status)) errors.push(`status must be one of ${STATUSES.join(', ')}`);
  if (!TYPES.includes(s.type)) errors.push(`type must be one of ${TYPES.join(', ')}`);
  if (!Array.isArray(s.degree_levels) || s.degree_levels.length === 0 || !s.degree_levels.every((l: string) => LEVELS.includes(l))) {
    errors.push(`degree_levels must list ${LEVELS.join(' / ')}`);
  }

  if (nonEmpty(s.application_url)) {
    if (!/^https:\/\//.test(s.application_url)) errors.push('application_url must be https');
    if (isAggregator(s.application_url)) errors.push(`application_url is a repost site (${hostOf(s.application_url)}); link the provider's own page`);
  }

  if (s.deadline != null) {
    if (!ISO.test(s.deadline)) errors.push('deadline must be YYYY-MM-DD');
    else if ((s.status === 'open' || s.status === 'upcoming') && s.deadline < today) {
      errors.push(`status is ${s.status} but the deadline ${s.deadline} has passed`);
    }
  }
  if (s.deadline_estimated && !nonEmpty(s.deadline_note_en)) {
    warnings.push('estimated deadline without an explanation in deadline_note_en');
  }

  const el = s.eligibility;
  if (!el || typeof el !== 'object') {
    errors.push('eligibility is required');
  } else {
    if (typeof el.refugee_idp_eligible !== 'boolean') errors.push('eligibility.refugee_idp_eligible must be true/false');
    if (el.min_gpa != null && !(typeof el.min_gpa === 'number' && el.min_gpa > 0 && el.min_gpa <= 100)) {
      errors.push('eligibility.min_gpa must be a percentage (0-100)');
    }
    if (el.max_age != null && !(Number.isInteger(el.max_age) && el.max_age >= 14 && el.max_age <= 70)) {
      errors.push('eligibility.max_age must be a whole number of years');
    }
    const nats: string[] = Array.isArray(el.nationalities) ? el.nationalities : [];
    if (nats.length > 0 && !nats.some((n) => /iraq|all|any/i.test(n))) {
      errors.push('eligibility.nationalities does not include Iraqi applicants');
    }
    if (nats.length === 0) warnings.push('nationalities not stated: confirm Iraqis can apply');
  }

  if (nonEmpty(s.country) && !isKnownPlace(s.country)) {
    warnings.push(`country "${s.country}" has no Kurdish/English translation yet: add it to src/lib/places.ts`);
  }
  for (const f of ['notes_en', 'notes_ar', 'notes_ckb', 'notes_kmr']) {
    if (!nonEmpty(s[f])) warnings.push(`${f} is empty`);
  }

  if (opts.existing && nonEmpty(s.name) && nonEmpty(s.application_url)) {
    const dup = findDuplicate({ name: s.name, application_url: s.application_url }, opts.existing.filter((e) => e.id !== s.id));
    if (dup) errors.push(`looks like a duplicate of ${dup.id ?? ''} "${dup.name}"`);
  }

  return { errors, warnings };
}
