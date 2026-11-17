// ============================================
// Renisan — Year-over-year cutoff history
// Prior-year datasets use their own row ids, so programmes are matched across
// years by a normalised "programme key" (university + college + department +
// campus + stream + gender + level + channel). The ministry's spelling is stable enough
// for this to match the large majority of rows; unmatched rows simply show
// as "new this year".
// ============================================

import type { FederalCutoff } from './types';

export interface HistoryYear {
  year: number;
  year_label: string;
  year_label_ar?: string;
}

export interface FederalHistory {
  /** Most recent first, one entry per year */
  years: HistoryYear[];
  /** programme key → year → lowest admitted average that year */
  byKey: Map<string, Map<number, number>>;
  /**
   * Relaxed key → year → average, used only when the exact key has no data for
   * that year. NaN marks a relaxed key that two different programmes share in a
   * year, which is never used (better "new this year" than a wrong number).
   */
  byRelaxedKey: Map<string, Map<number, number>>;
}

export interface TrendPoint {
  year: number;
  year_label: string;
  year_label_ar?: string;
  value: number;
}

export interface Trend {
  /** Oldest first, excluding the current year */
  series: TrendPoint[];
  /** Most recent prior year with data, if any */
  previous: TrendPoint | null;
  /** current − previous (positive = cutoff went up) */
  delta: number | null;
}

/** Folds the spelling differences the ministry introduces between years. */
function fold(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ـ‌‍]/g, '')
    .replace(/[\s\-–/()]+/g, ' ')
    .trim();
}

/** Reduces an (already folded) Arabic word to a rough stem: drops و/ال/لل prefixes and ية/ه/ي/ات suffixes. */
function stem(word: string): string {
  let w = word;
  if (w.length > 3 && w.startsWith('و')) w = w.slice(1);
  if (w.length > 4 && (w.startsWith('ال') || w.startsWith('لل'))) w = w.slice(2);
  else if (w.length > 3 && w.startsWith('ل') && !w.startsWith('ليزر')) w = w.slice(1);
  w = w.replace(/(يه|ات|ه|ي)$/, '');
  return w;
}

/** Words that the ministry adds or drops between years without changing the programme. */
const STOP_WORDS = new Set(
  ['هندسه', 'هندسيه', 'قسم', 'كليه', 'تقنيات', 'تقنيه', 'تقني', 'تكنولوجيا', 'اقسام', 'تخصصات']
    .map((w) => stem(w))
);

/**
 * Word-bag key: "قسم هندسة العمارة" (2026) and "قسم العمارة" (2025) both become
 * "عمار". Only trusted when it maps to a single programme in a given year.
 */
export function relaxedKey(row: FederalCutoff): string {
  const words = new Set<string>();
  for (const part of [row.college, row.department, row.campus]) {
    for (const raw of fold(part).split(' ')) {
      const w = stem(raw);
      if (w && !STOP_WORDS.has(w)) words.add(w);
    }
  }
  return [fold(row.university), row.stream, row.gender, row.level ?? 'college', row.channel ?? 'general', [...words].sort().join(' ')].join('|');
}

export function programKey(row: FederalCutoff): string {
  return [
    fold(row.university),
    fold(row.college),
    fold(row.department),
    fold(row.campus),
    row.stream,
    row.gender,
    row.level ?? 'college',
    row.channel ?? 'general'
  ].join('|');
}

/**
 * Builds the lookup from one array of rows per prior year. When a year lists a
 * programme twice (e.g. separate bio/applied rows in 2024-2025) the lower cutoff
 * is kept, since that is what the student had to reach.
 */
export function buildHistory(datasets: { info: HistoryYear; rows: FederalCutoff[] }[]): FederalHistory {
  const byKey = new Map<string, Map<number, number>>();
  const byRelaxedKey = new Map<string, Map<number, number>>();
  // exact key → relaxed key, so bio/applied twins of one programme do not count as a clash
  const exactOfRelaxed = new Map<string, Map<number, string>>();
  for (const { info, rows } of datasets) {
    for (const row of rows) {
      const key = programKey(row);
      let years = byKey.get(key);
      if (!years) {
        years = new Map();
        byKey.set(key, years);
      }
      const existing = years.get(info.year);
      if (existing === undefined || row.min_average < existing) years.set(info.year, row.min_average);

      const rk = relaxedKey(row);
      let rYears = byRelaxedKey.get(rk);
      let owners = exactOfRelaxed.get(rk);
      if (!rYears || !owners) {
        rYears = new Map();
        owners = new Map();
        byRelaxedKey.set(rk, rYears);
        exactOfRelaxed.set(rk, owners);
      }
      const owner = owners.get(info.year);
      if (owner === undefined) {
        owners.set(info.year, key);
        rYears.set(info.year, row.min_average);
      } else if (owner === key) {
        const cur = rYears.get(info.year);
        if (cur !== undefined && Number.isFinite(cur) && row.min_average < cur) rYears.set(info.year, row.min_average);
      } else {
        rYears.set(info.year, Number.NaN); // two distinct programmes share this relaxed key
      }
    }
  }
  const seen = new Set<number>();
  const years = datasets.map((d) => d.info).sort((a, b) => b.year - a.year)
    .filter((y) => (seen.has(y.year) ? false : (seen.add(y.year), true)));
  return { years, byKey, byRelaxedKey };
}

export function getTrend(row: FederalCutoff, history: FederalHistory | null): Trend | null {
  if (!history) return null;
  const years = history.byKey.get(programKey(row));
  const relaxed = history.byRelaxedKey.get(relaxedKey(row));
  const series: TrendPoint[] = [];
  for (const info of history.years) {
    let value = years?.get(info.year);
    if (value === undefined) {
      const fallback = relaxed?.get(info.year);
      if (fallback !== undefined && Number.isFinite(fallback)) value = fallback;
    }
    if (value !== undefined) {
      series.push({ year: info.year, year_label: info.year_label, year_label_ar: info.year_label_ar, value });
    }
  }
  series.sort((a, b) => a.year - b.year);
  const previous = series.length ? series[series.length - 1] : null;
  return {
    series,
    previous,
    delta: previous ? Number((row.min_average - previous.value).toFixed(2)) : null
  };
}

/** Share of current rows that have at least one prior-year match (used by tests). */
export function coverage(rows: FederalCutoff[], history: FederalHistory): number {
  if (rows.length === 0) return 0;
  const matched = rows.filter((r) => (getTrend(r, history)?.series.length ?? 0) > 0).length;
  return matched / rows.length;
}
