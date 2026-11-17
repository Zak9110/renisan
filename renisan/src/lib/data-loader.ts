// ============================================
// Renisan — Data Loader
// Reads public/data/meta.json first, then the dataset files it names, so a new
// year is a data-only change (drop in the file, edit meta.json, run npm test).
// ============================================

import type { FederalCutoff, KRGCutoff, Scholarship, DatasetMeta, FederalRules } from './types';
import { buildHistory, type FederalHistory } from './history.ts';

const FETCH_TIMEOUT_MS = 15000;

let metaCache: DatasetMeta | null = null;
const fileCache = new Map<string, unknown>();

function resolveDataUrl(filename: string): string {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedFile = filename.startsWith('/') ? filename.slice(1) : filename;
  return `${normalizedBase}${normalizedFile}`;
}

/** fetch() with a timeout so a stalled network never leaves the app on the spinner. */
async function fetchJson<T>(filename: string, validate: (data: unknown) => data is T): Promise<T> {
  const cached = fileCache.get(filename);
  if (cached) return cached as T;

  const url = resolveDataUrl(filename);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) {
      throw new Error(`Failed to load ${filename} (${response.status} ${response.statusText})`);
    }
    const data: unknown = await response.json();
    if (!validate(data)) {
      throw new Error(`Unexpected shape in ${filename}`);
    }
    fileCache.set(filename, data);
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- Runtime shape guards (cheap, catch a broken deploy before it renders) ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function isDatasetInfo(v: unknown): boolean {
  return isObj(v) && isStr(v.file) && isNum(v.year) && isStr(v.year_label) && isNum(v.max_score);
}

function isMeta(v: unknown): v is DatasetMeta {
  return isObj(v) && isDatasetInfo(v.federal) && isDatasetInfo(v.krg)
    && isObj(v.scholarships) && isStr(v.scholarships.file);
}

function isFederalRows(v: unknown): v is FederalCutoff[] {
  return Array.isArray(v) && v.every((r) => isObj(r) && isStr(r.id) && isStr(r.university)
    && isStr(r.college) && isStr(r.stream) && isNum(r.min_average) && isStr(r.governorate));
}

function isKRGRows(v: unknown): v is KRGCutoff[] {
  return Array.isArray(v) && v.every((r) => isObj(r) && isStr(r.id) && isStr(r.university)
    && isStr(r.college) && isStr(r.stream) && isNum(r.min_composite_score) && isStr(r.city));
}

function isScholarships(v: unknown): v is Scholarship[] {
  return Array.isArray(v) && v.every((r) => isObj(r) && isStr(r.id) && isStr(r.name)
    && isStr(r.status) && Array.isArray(r.degree_levels) && isObj(r.eligibility));
}

function isRules(v: unknown): v is FederalRules {
  return isObj(v) && isNum(v.year) && Array.isArray(v.routes) && Array.isArray(v.private_medical)
    && v.routes.every((r) => isObj(r) && isStr(r.id) && isStr(r.ar) && isObj(r.gov_evening)
      && isObj(r.private_morning) && isObj(r.private_evening))
    && v.private_medical.every((r) => isObj(r) && isStr(r.id) && isStr(r.ar) && isNum(r.morning));
}

// ---- Public API ----

export async function loadMeta(): Promise<DatasetMeta> {
  if (metaCache) return metaCache;
  metaCache = await fetchJson('data/meta.json', isMeta);
  return metaCache;
}

/**
 * Federal (MOHESR central admission) minimum averages for the year named in
 * meta.json: the general-channel file plus any `extra_files` (other channels of
 * the same year, e.g. distinguished schools), merged into one list.
 */
export async function loadFederalCutoffs(): Promise<FederalCutoff[]> {
  const meta = await loadMeta();
  const [main, ...extras] = await Promise.all([
    fetchJson(`data/${meta.federal.file}`, isFederalRows),
    ...(meta.federal.extra_files ?? []).map((e) => fetchJson(`data/${e.file}`, isFederalRows))
  ]);
  return extras.length ? main.concat(...extras) : main;
}

/**
 * Prior-year Federal datasets listed under meta.federal.history, folded into a
 * programme → year → cutoff lookup. Returns null when no history is configured.
 * Loaded separately from the main data so the checker renders without waiting for it.
 */
export async function loadFederalHistory(): Promise<FederalHistory | null> {
  const meta = await loadMeta();
  const list = meta.federal.history ?? [];
  if (list.length === 0) return null;
  const datasets = await Promise.all(list.map(async (h) => ({
    info: { year: h.year, year_label: h.year_label, year_label_ar: h.year_label_ar },
    rows: await fetchJson(`data/${h.file}`, isFederalRows)
  })));
  return buildHistory(datasets);
}

/** Rule-based application minimums (evening study, private colleges). Null when not configured. */
export async function loadFederalRules(): Promise<FederalRules | null> {
  const meta = await loadMeta();
  if (!meta.federal.rules) return null;
  return fetchJson(`data/${meta.federal.rules.file}`, isRules);
}

/** KRG (Zankoline) minimum composite scores for the year named in meta.json. */
export async function loadKRGCutoffs(): Promise<KRGCutoff[]> {
  const meta = await loadMeta();
  return fetchJson(`data/${meta.krg.file}`, isKRGRows);
}

/** Scholarships and exchange opportunities. */
export async function loadScholarships(): Promise<Scholarship[]> {
  const meta = await loadMeta();
  return fetchJson(`data/${meta.scholarships.file}`, isScholarships);
}

/** Clears in-memory caches so a retry re-fetches everything. */
export function clearDataCache(): void {
  metaCache = null;
  fileCache.clear();
}
