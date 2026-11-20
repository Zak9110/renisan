// ============================================
// Renisan — Student profile kept on this device
// The student types their details once; the checker, the scholarship matcher
// and the form checks all read them. Nothing leaves the browser.
// ============================================

import type { AdmissionSystem, Gender } from './types';
import type { Stream, SubStream } from './url-state';
import type { EducationLevel, EnglishLevel } from './matcher';

export interface StudentProfile {
  system?: AdmissionSystem;
  /** Raw score text as typed (any digit script), so it reopens exactly */
  score?: string;
  stream?: Stream;
  subStream?: SubStream;
  location?: string;
  channel?: string;
  gender?: Gender;
  /** Stored as a birth year so the age stays right in later years */
  birthYear?: number;
  /** Current academic stage for scholarship eligibility matching */
  educationLevel?: EducationLevel;
  /** Full-time / equivalent years of work experience */
  workExperienceYears?: number;
  /** English readiness / standardized certificate status */
  englishLevel?: EnglishLevel;
  /** Self-declared private flag for matching refugee/IDP scholarships only */
  isRefugeeOrIdp?: boolean;
  /** False only if user explicitly opts out of return-home obligation programmes */
  willingToReturn?: boolean;
  updatedAt?: number;
}

const STORAGE_KEY = 'renisan_profile';
const listeners = new Set<() => void>();

const SYSTEMS: readonly string[] = ['federal', 'krg'];
const STREAMS: readonly string[] = ['scientific', 'literary', 'vocational'];
const SUB_STREAMS: readonly string[] = ['bio', 'applied'];
const GENDERS: readonly string[] = ['both', 'male', 'female'];
const EDUCATION_LEVELS: readonly string[] = ['grade12', 'undergrad', 'graduate'];
const ENGLISH_LEVELS: readonly string[] = ['none', 'basic', 'ielts_toefl'];

/** Keeps only well-formed fields, so a damaged or old entry can never break the app. */
export function sanitizeProfile(input: unknown): StudentProfile {
  if (!input || typeof input !== 'object') return {};
  const p = input as Record<string, unknown>;
  const out: StudentProfile = {};
  const str = (v: unknown, max = 40) => (typeof v === 'string' && v.length <= max ? v : undefined);
  if (typeof p.system === 'string' && SYSTEMS.includes(p.system)) out.system = p.system as AdmissionSystem;
  const score = str(p.score, 12);
  if (score) out.score = score;
  if (typeof p.stream === 'string' && STREAMS.includes(p.stream)) out.stream = p.stream as Stream;
  if (out.stream === 'scientific' && typeof p.subStream === 'string' && SUB_STREAMS.includes(p.subStream)) {
    out.subStream = p.subStream as SubStream;
  }
  const location = str(p.location, 60);
  if (location) out.location = location;
  const channel = str(p.channel, 30);
  if (channel) out.channel = channel;
  if (typeof p.gender === 'string' && GENDERS.includes(p.gender)) out.gender = p.gender as Gender;
  if (typeof p.birthYear === 'number' && Number.isInteger(p.birthYear) && p.birthYear >= 1940 && p.birthYear <= 2030) {
    out.birthYear = p.birthYear;
  }
  if (typeof p.educationLevel === 'string' && EDUCATION_LEVELS.includes(p.educationLevel)) {
    out.educationLevel = p.educationLevel as EducationLevel;
  }
  if (typeof p.workExperienceYears === 'number' && Number.isInteger(p.workExperienceYears) && p.workExperienceYears >= 0 && p.workExperienceYears <= 40) {
    out.workExperienceYears = p.workExperienceYears;
  }
  if (typeof p.englishLevel === 'string' && ENGLISH_LEVELS.includes(p.englishLevel)) {
    out.englishLevel = p.englishLevel as EnglishLevel;
  }
  if (typeof p.isRefugeeOrIdp === 'boolean') out.isRefugeeOrIdp = p.isRefugeeOrIdp;
  if (typeof p.willingToReturn === 'boolean') out.willingToReturn = p.willingToReturn;
  if (typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt)) out.updatedAt = p.updatedAt;
  return out;
}

export function getProfile(): StudentProfile {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeProfile(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function hasProfile(): boolean {
  const p = getProfile();
  return Boolean(p.score || p.birthYear || p.educationLevel);
}

/** Merges the given fields into the saved profile. */
export function updateProfile(patch: Partial<StudentProfile>): void {
  if (typeof window === 'undefined') return;
  const current = getProfile();
  const next = sanitizeProfile({ ...current, ...patch, updatedAt: Date.now() });
  // Skip the write (and listeners) when nothing really changed
  const same = (Object.keys(next) as (keyof StudentProfile)[])
    .filter((k) => k !== 'updatedAt')
    .every((k) => next[k] === current[k]) &&
    Object.keys(current).filter((k) => k !== 'updatedAt').length === Object.keys(next).filter((k) => k !== 'updatedAt').length;
  if (same) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode or quota: the app still works, it just will not remember
  }
  listeners.forEach((cb) => cb());
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((cb) => cb());
}

export function onProfileChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Age in whole years this calendar year, from a stored birth year. */
export function ageFromBirthYear(birthYear: number | undefined, today: Date = new Date()): number | undefined {
  if (birthYear == null) return undefined;
  const age = today.getFullYear() - birthYear;
  return age >= 10 && age <= 80 ? age : undefined;
}

export function birthYearFromAge(age: number, today: Date = new Date()): number {
  return today.getFullYear() - age;
}
