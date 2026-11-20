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
import { matchesQuery } from './text.ts';
import { localizePlace } from './places.ts';

/** A place name in every language, so searches match whatever the student sees on screen. */
const allPlaceNames = (name: string) => [
  name,
  localizePlace(name, 'ckb'),
  localizePlace(name, 'kmr'),
  localizePlace(name, 'en')
];

/**
 * Filter Federal (Central Admissions) cutoffs by student score, stream, governorate, study type, channel.
 * Results are sorted in descending order of minimum required average.
 */
export function filterFederalCutoffs(
  data: FederalCutoff[],
  filters: CheckerFilters
): FederalCutoff[] {
  const maxScore = filters.show_reach ? (filters.score + 2.0) : filters.score;
  const q = filters.search?.trim();

  return data
    .filter(item => {
      // Minimum score threshold (with optional reach +2.0%)
      if (typeof filters.score === 'number' && maxScore < item.min_average) {
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

      // Gender: single-sex programmes (nursing, women's colleges) only show for that gender
      if (filters.gender && filters.gender !== 'both' && item.gender !== 'both' && item.gender !== filters.gender) {
        return false;
      }

      // Programme level: bachelor colleges vs. 2-year technical institutes
      if (filters.level && (item.level ?? 'college') !== filters.level) {
        return false;
      }

      // Keyword search (Arabic/Kurdish/Latin-insensitive)
      if (q && !matchesQuery(q, [
        item.university, item.university_en, item.university_ku, item.college, item.college_en, item.college_ku,
        item.department, item.department_en, item.campus, item.campus_en, ...allPlaceNames(item.governorate)
      ])) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (filters.sort_by === 'cutoff_asc') {
        return a.min_average - b.min_average;
      }
      if (filters.sort_by === 'closest') {
        return Math.abs(filters.score - a.min_average) - Math.abs(filters.score - b.min_average);
      }
      if (filters.sort_by === 'alpha') {
        return a.university.localeCompare(b.university) || a.college.localeCompare(b.college) || b.min_average - a.min_average;
      }
      return b.min_average - a.min_average;
    });
}

/**
 * Filter KRG (Zankoline) cutoffs by composite score, stream, city, study type.
 * Results are sorted in descending order of minimum composite score.
 */
export function filterKRGCutoffs(
  data: KRGCutoff[],
  filters: CheckerFilters
): KRGCutoff[] {
  const maxScore = filters.show_reach ? (filters.score + 2.0) : filters.score;
  const q = filters.search?.trim();

  return data
    .filter(item => {
      // Minimum composite score threshold (with optional reach +2.0%)
      if (typeof filters.score === 'number' && maxScore < item.min_composite_score) {
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

      if (filters.gender && filters.gender !== 'both' && item.gender !== 'both' && item.gender !== filters.gender) {
        return false;
      }

      // Programme level: bachelor colleges vs. 2-year technical institutes
      if (filters.level && (item.level ?? 'college') !== filters.level) {
        return false;
      }

      // Keyword search (Arabic/Kurdish/Latin-insensitive)
      if (q && !matchesQuery(q, [
        item.university, item.university_en, item.university_ku,
        item.college, item.college_en, item.college_ku,
        item.department, item.department_en, item.department_ku, ...allPlaceNames(item.city)
      ])) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (filters.sort_by === 'cutoff_asc') {
        return a.min_composite_score - b.min_composite_score;
      }
      if (filters.sort_by === 'closest') {
        return Math.abs(filters.score - a.min_composite_score) - Math.abs(filters.score - b.min_composite_score);
      }
      if (filters.sort_by === 'alpha') {
        return a.university.localeCompare(b.university) || a.college.localeCompare(b.college) || b.min_composite_score - a.min_composite_score;
      }
      return b.min_composite_score - a.min_composite_score;
    });
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
  const q = filters.search?.trim();

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

      // Student GPA filter (only hides scholarships whose min_gpa exceeds student_gpa)
      if (
        typeof filters.student_gpa === 'number' &&
        Number.isFinite(filters.student_gpa) &&
        typeof item.eligibility.min_gpa === 'number' &&
        filters.student_gpa < item.eligibility.min_gpa
      ) {
        return false;
      }

      // Student Age filter (only hides scholarships whose max_age is below student_age)
      if (
        typeof filters.student_age === 'number' &&
        Number.isFinite(filters.student_age) &&
        typeof item.eligibility.max_age === 'number' &&
        filters.student_age > item.eligibility.max_age
      ) {
        return false;
      }

      // Search keyword filter (Arabic/Kurdish/Latin/English-insensitive)
      if (q && !matchesQuery(q, [
        item.name, item.name_ar, item.name_ckb, item.name_kmr, item.provider,
        ...allPlaceNames(item.country),
        ...item.covers, ...(item.covers_ckb ?? []), ...(item.covers_kmr ?? []), ...(item.covers_en ?? []),
        item.notes_ar, item.notes_ckb, item.notes_kmr, item.notes_en
      ])) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const diff = (statusWeight[statusOf(a)] ?? 9) - (statusWeight[statusOf(b)] ?? 9);
      if (diff !== 0) return diff;
      const bachelor = Number(b.degree_levels.includes('bachelor')) - Number(a.degree_levels.includes('bachelor'));
      if (bachelor !== 0) return bachelor;
      const da = a.deadline ?? '9999-12-31';
      const db = b.deadline ?? '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
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
