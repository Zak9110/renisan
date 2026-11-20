// ============================================
// Renisan — Explainable Scholarship Eligibility Matcher & Deadline Buckets
// Pure functions (zero UI / browser imports) returning:
//   verdict: 'GO' | 'MAYBE' | 'NO_GO'
//   passed / failed / missing structured reasons for 4-language rendering.
//
// Rules (per Renisan trust principles):
// - A failed mandatory criterion ALWAYS wins over unknowns -> NO_GO.
// - Unknown required fields or borderline age (±1 yr from birthYear) -> MAYBE.
// - Never fabricate passes from missing data.
// ============================================

import type { Scholarship } from './types';
import { getEffectiveStatus, isDeadlinePassed } from './status.ts';

export type EducationLevel = 'grade12' | 'undergrad' | 'graduate';
export type EnglishLevel = 'none' | 'basic' | 'ielts_toefl';
export type MatchVerdict = 'GO' | 'MAYBE' | 'NO_GO';

export type MatchReasonCode =
  | 'closed_or_discontinued'
  | 'degree_ok'
  | 'degree_fail'
  | 'undergrad_enrolled_required'
  | 'gpa_ok'
  | 'gpa_fail'
  | 'gpa_missing'
  | 'age_ok'
  | 'age_borderline'
  | 'age_fail'
  | 'age_missing'
  | 'work_exp_ok'
  | 'work_exp_fail'
  | 'work_exp_missing'
  | 'return_fail'
  | 'gender_fail'
  | 'english_ok'
  | 'english_check'
  | 'refugee_fit'
  | 'survivor_fit';

export interface MatchReason {
  code: MatchReasonCode;
  params?: Record<string, string | number>;
}

export interface EligibilityProfile {
  educationLevel?: EducationLevel;
  gpa?: number;
  birthYear?: number;
  workExperienceYears?: number;
  englishLevel?: EnglishLevel;
  isRefugeeOrIdp?: boolean;
  isSurvivor?: boolean;
  willingToReturn?: boolean;
  gender?: 'male' | 'female' | 'both';
}

export interface MatchResult {
  verdict: MatchVerdict;
  passed: MatchReason[];
  failed: MatchReason[];
  missing: MatchReason[];
  /** Higher is a better match; used to order results inside the same verdict. */
  rankScore: number;
}

export type DeadlineBucket = 'urgent' | 'soon' | 'upcoming' | 'estimated' | 'tba' | 'closed';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True if the user has supplied at least one eligibility attribute. */
export function hasEligibilityProfile(p: EligibilityProfile): boolean {
  return (
    p.educationLevel != null ||
    p.gpa != null ||
    p.birthYear != null ||
    p.workExperienceYears != null ||
    p.englishLevel != null ||
    p.isRefugeeOrIdp === true ||
    p.isSurvivor === true ||
    p.willingToReturn === false ||
    (p.gender != null && p.gender !== 'both')
  );
}

/** Days until the deadline (end of day). Null if no valid ISO date or already passed. */
export function getDaysUntilDeadline(
  s: Pick<Scholarship, 'deadline' | 'status'>,
  today: Date = new Date()
): number | null {
  if (!s.deadline || !ISO_DATE.test(s.deadline)) return null;
  if (isDeadlinePassed(s, today)) return null;
  const [y, m, d] = s.deadline.split('-').map(Number);
  const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
  const diffMs = endOfDay.getTime() - today.getTime();
  return diffMs > 0 ? Math.ceil(diffMs / 86_400_000) : 0;
}

/** Groups a scholarship into a visual deadline urgency bucket. */
export function getDeadlineBucket(
  s: Pick<Scholarship, 'deadline' | 'deadline_estimated' | 'status'>,
  today: Date = new Date()
): DeadlineBucket {
  const effective = getEffectiveStatus(s, today);
  if (effective === 'closed' || effective === 'discontinued') return 'closed';
  if (!s.deadline || !ISO_DATE.test(s.deadline)) return 'tba';
  if (s.deadline_estimated) return 'estimated';
  const days = getDaysUntilDeadline(s, today);
  if (days == null) return 'closed';
  if (days <= 7) return 'urgent';
  if (days <= 30) return 'soon';
  return 'upcoming';
}

/** Target year at which age is checked: the deadline year when valid & in the future, else current year. */
function ageReferenceYear(s: Scholarship, today: Date): number {
  if (s.deadline && ISO_DATE.test(s.deadline)) {
    const dy = parseInt(s.deadline.slice(0, 4), 10);
    if (dy >= today.getFullYear()) return dy;
  }
  return today.getFullYear();
}

/** Checks if the student's current education level matches the scholarship's target degree levels. */
function matchesEducationLevel(
  level: EducationLevel,
  s: Scholarship
): { ok: boolean; reason?: MatchReasonCode } {
  const deg = s.degree_levels;
  if (level === 'grade12') {
    if (s.eligibility.requires_enrolled_undergrad) {
      return { ok: false, reason: 'undergrad_enrolled_required' };
    }
    return deg.includes('bachelor') ? { ok: true } : { ok: false, reason: 'degree_fail' };
  }
  if (level === 'undergrad') {
    // Undergrads can apply for bachelor exchanges/scholarships AND upcoming master's programmes
    return deg.includes('bachelor') || deg.includes('masters')
      ? { ok: true }
      : { ok: false, reason: 'degree_fail' };
  }
  // Graduates look for master's / PhD
  return deg.includes('masters') || deg.includes('phd')
    ? { ok: true }
    : { ok: false, reason: 'degree_fail' };
}

/**
 * Pure explainable eligibility matcher.
 */
export function matchScholarship(
  s: Scholarship,
  profile: EligibilityProfile,
  today: Date = new Date()
): MatchResult {
  const passed: MatchReason[] = [];
  const failed: MatchReason[] = [];
  const missing: MatchReason[] = [];
  let rankScore = 0;

  const status = getEffectiveStatus(s, today);
  if (status === 'discontinued') {
    failed.push({ code: 'closed_or_discontinued' });
  }

  // 1. Education level vs target degrees
  if (profile.educationLevel) {
    const eduCheck = matchesEducationLevel(profile.educationLevel, s);
    if (eduCheck.ok) {
      passed.push({ code: 'degree_ok' });
      rankScore += 15;
    } else {
      failed.push({ code: eduCheck.reason ?? 'degree_fail' });
    }
  }

  // 2. Minimum GPA
  const minGpa = s.eligibility.min_gpa;
  if (typeof minGpa === 'number') {
    if (profile.gpa == null) {
      missing.push({ code: 'gpa_missing', params: { min: minGpa } });
    } else if (profile.gpa >= minGpa) {
      passed.push({ code: 'gpa_ok', params: { gpa: Number(profile.gpa.toFixed(1)), min: minGpa } });
      rankScore += 20;
    } else {
      failed.push({ code: 'gpa_fail', params: { gpa: Number(profile.gpa.toFixed(1)), min: minGpa } });
    }
  }

  // 3. Maximum age (computed at deadline year; birthYear alone has ±1 yr precision)
  const maxAge = s.eligibility.max_age;
  if (typeof maxAge === 'number') {
    if (profile.birthYear == null) {
      missing.push({ code: 'age_missing', params: { max: maxAge } });
    } else {
      const refYear = ageReferenceYear(s, today);
      const estAge = refYear - profile.birthYear;
      if (estAge < maxAge) {
        passed.push({ code: 'age_ok', params: { age: estAge, max: maxAge } });
        rankScore += 15;
      } else if (estAge === maxAge || estAge === maxAge + 1) {
        // Exact birth month determines eligibility around the cutoff
        missing.push({ code: 'age_borderline', params: { age: estAge, max: maxAge } });
      } else {
        failed.push({ code: 'age_fail', params: { age: estAge, max: maxAge } });
      }
    }
  }

  // 4. Work experience requirement (e.g., Chevening 2 years)
  const minWork = s.eligibility.work_experience_years;
  if (typeof minWork === 'number' && minWork > 0) {
    if (profile.workExperienceYears == null) {
      missing.push({ code: 'work_exp_missing', params: { years: minWork } });
    } else if (profile.workExperienceYears >= minWork) {
      passed.push({ code: 'work_exp_ok', params: { years: minWork } });
      rankScore += 15;
    } else {
      failed.push({ code: 'work_exp_fail', params: { have: profile.workExperienceYears, years: minWork } });
    }
  }

  // 5. Return-home obligation (must_return)
  if (s.eligibility.must_return === true && profile.willingToReturn === false) {
    failed.push({ code: 'return_fail' });
  }

  // 6. Gender restriction (if any)
  if (
    s.eligibility.gender_restriction &&
    profile.gender &&
    profile.gender !== 'both' &&
    s.eligibility.gender_restriction !== profile.gender
  ) {
    failed.push({ code: 'gender_fail' });
  }

  // 7. English test check (soft / confirmable when IELTS or TOEFL explicitly mentioned)
  const langReqs = s.eligibility.language_requirements ?? [];
  const requiresEnglishTest = langReqs.some((r) => /\b(ielts|toefl)\b/i.test(r));
  if (requiresEnglishTest) {
    if (profile.englishLevel === 'ielts_toefl') {
      passed.push({ code: 'english_ok' });
      rankScore += 10;
    } else if (profile.englishLevel === 'none' || profile.englishLevel === 'basic') {
      missing.push({ code: 'english_check' });
    }
  }

  // 8. Positive fit bonuses (never exclude)
  if (profile.isRefugeeOrIdp && s.eligibility.refugee_idp_eligible) {
    passed.push({ code: 'refugee_fit' });
    rankScore += 10;
  }
  if (profile.isSurvivor && s.eligibility.survivor_eligible) {
    passed.push({ code: 'survivor_fit' });
    rankScore += 10;
  }
  if (status === 'open') rankScore += 12;
  else if (status === 'upcoming') rankScore += 6;

  // Verdict precedence: any mandatory failure -> NO_GO; else any unknown -> MAYBE; else GO
  const verdict: MatchVerdict =
    failed.length > 0 ? 'NO_GO' : missing.length > 0 ? 'MAYBE' : 'GO';

  return { verdict, passed, failed, missing, rankScore };
}
