// ============================================
// Renisan — In-memory filter and search engine
// ============================================

import type {
  FederalCutoff,
  KRGCutoff,
  Scholarship,
  CheckerFilters,
  ScholarshipFilters
} from './types';
import { getEffectiveStatus } from './status.ts';

/**
 * Filter Federal (Central Admissions) cutoffs by student score, stream, governorate, study type, channel.
 * Results are sorted in descending order of minimum required average.
 */
export function filterFederalCutoffs(
  data: FederalCutoff[],
  filters: CheckerFilters
): FederalCutoff[] {
  return data
    .filter(item => {
      // Minimum score threshold
      if (typeof filters.score === 'number' && filters.score < item.min_average) {
        return false;
      }

      // Stream match
      if (filters.stream && item.stream !== filters.stream) {
        return false;
      }

      // Sub-stream match (applied vs bio)
      if (
        filters.sub_stream &&
        item.sub_stream &&
        filters.sub_stream !== item.sub_stream
      ) {
        return false;
      }

      // Governorate filter
      if (
        filters.governorate &&
        filters.governorate !== 'all' &&
        item.governorate !== filters.governorate
      ) {
        return false;
      }

      // Study type filter (morning, evening, parallel)
      if (
        filters.study_type &&
        filters.study_type !== 'all' &&
        item.study_type !== filters.study_type
      ) {
        return false;
      }

      // Channel filter (general, martyrs, distinguished, survivors, etc.)
      if (
        filters.channel &&
        filters.channel !== 'all' &&
        item.channel !== filters.channel
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.min_average - a.min_average);
}

/**
 * Filter KRG (Zankoline) cutoffs by composite score, stream, city, study type.
 * Results are sorted in descending order of minimum composite score.
 */
export function filterKRGCutoffs(
  data: KRGCutoff[],
  filters: CheckerFilters
): KRGCutoff[] {
  return data
    .filter(item => {
      // Minimum composite score threshold
      if (typeof filters.score === 'number' && filters.score < item.min_composite_score) {
        return false;
      }

      // Stream match
      if (filters.stream && item.stream !== filters.stream) {
        return false;
      }

      // Sub-stream match
      if (
        filters.sub_stream &&
        item.sub_stream &&
        filters.sub_stream !== item.sub_stream
      ) {
        return false;
      }

      // City filter (KRG uses city field, mapped from governorate filter)
      if (
        filters.governorate &&
        filters.governorate !== 'all' &&
        item.city !== filters.governorate
      ) {
        return false;
      }

      // Study type filter (government, parallel, evening)
      if (
        filters.study_type &&
        filters.study_type !== 'all' &&
        item.study_type !== filters.study_type
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.min_composite_score - a.min_composite_score);
}

/**
 * Filter scholarships by status, degree level, host country, and refugee/IDP eligibility.
 */
export function filterScholarships(
  data: Scholarship[],
  filters: ScholarshipFilters,
  today: Date = new Date()
): Scholarship[] {
  // Status weights: open first, upcoming second, closed third, discontinued last
  const statusWeight: Record<string, number> = {
    open: 0,
    upcoming: 1,
    closed: 2,
    discontinued: 3
  };
  const statusOf = (s: Scholarship) => getEffectiveStatus(s, today);

  return data
    .filter(item => {
      // Status filter uses the *effective* status (past deadlines count as closed)
      if (
        filters.status &&
        filters.status !== 'all' &&
        statusOf(item) !== filters.status
      ) {
        return false;
      }

      // Degree level filter (bachelor, masters, phd)
      if (
        filters.degree_level &&
        filters.degree_level !== 'all' &&
        !item.degree_levels.includes(filters.degree_level as 'bachelor' | 'masters' | 'phd')
      ) {
        return false;
      }

      // Country filter
      if (
        filters.country &&
        filters.country !== 'all' &&
        item.country !== filters.country
      ) {
        return false;
      }

      // Refugee / IDP eligibility filter
      if (
        filters.refugee_eligible &&
        !item.eligibility.refugee_idp_eligible
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const diff = (statusWeight[statusOf(a)] ?? 9) - (statusWeight[statusOf(b)] ?? 9);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Extract unique governorates from Federal cutoffs.
 */
export function getUniqueGovernorates(data: FederalCutoff[]): string[] {
  const set = new Set<string>();
  for (const item of data) {
    if (item.governorate) {
      set.add(item.governorate);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Extract unique cities from KRG cutoffs.
 */
export function getUniqueCities(data: KRGCutoff[]): string[] {
  const set = new Set<string>();
  for (const item of data) {
    if (item.city) {
      set.add(item.city);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Extract unique host countries from scholarships.
 */
export function getUniqueCountries(data: Scholarship[]): string[] {
  const set = new Set<string>();
  for (const item of data) {
    if (item.country) {
      set.add(item.country);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
