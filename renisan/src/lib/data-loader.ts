// ============================================
// Renisan — Data Loader with in-memory caching
// Fetches static JSON datasets from /data/
// ============================================

import { FederalCutoff, KRGCutoff, Scholarship } from './types';

let federalCache: FederalCutoff[] | null = null;
let krgCache: KRGCutoff[] | null = null;
let scholarshipCache: Scholarship[] | null = null;

function resolveDataUrl(filename: string): string {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedFile = filename.startsWith('/') ? filename.slice(1) : filename;
  return `${normalizedBase}${normalizedFile}`;
}

/**
 * Loads Federal central admissions cutoffs (2023-2024).
 * Caches in memory for fast offline-first retrieval.
 */
export async function loadFederalCutoffs(): Promise<FederalCutoff[]> {
  if (federalCache) {
    return federalCache;
  }

  const url = resolveDataUrl('data/cutoffs-federal-2024.json');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load Federal cutoffs (${response.status} ${response.statusText})`);
  }

  const data: FederalCutoff[] = await response.json();
  federalCache = data;
  return data;
}

/**
 * Loads KRG (Zankoline) cutoffs (2023-2024).
 * Caches in memory for fast offline-first retrieval.
 */
export async function loadKRGCutoffs(): Promise<KRGCutoff[]> {
  if (krgCache) {
    return krgCache;
  }

  const url = resolveDataUrl('data/cutoffs-krg-2024.json');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load KRG cutoffs (${response.status} ${response.statusText})`);
  }

  const data: KRGCutoff[] = await response.json();
  krgCache = data;
  return data;
}

/**
 * Loads scholarships and exchange opportunities.
 * Caches in memory for fast offline-first retrieval.
 */
export async function loadScholarships(): Promise<Scholarship[]> {
  if (scholarshipCache) {
    return scholarshipCache;
  }

  const url = resolveDataUrl('data/scholarships.json');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load scholarships (${response.status} ${response.statusText})`);
  }

  const data: Scholarship[] = await response.json();
  scholarshipCache = data;
  return data;
}

/**
 * Clears in-memory cache if manual refresh is needed.
 */
export function clearDataCache(): void {
  federalCache = null;
  krgCache = null;
  scholarshipCache = null;
}
