// ============================================
// Renisan — Data type definitions
// ============================================

export type Gender = 'male' | 'female' | 'both';
export type Confidence = 'official' | 'verified_third_party' | 'unverified';
/** Bachelor college vs. 2-year technical institute (diploma). */
export type ProgramLevel = 'college' | 'institute';

export interface FederalCutoff {
  id: string;
  year: number;
  university: string;
  university_en: string;
  university_ku?: string | null;
  college: string;
  college_en: string;
  college_ku?: string | null;
  department: string | null;
  department_en: string | null;
  /** Branch campus or programme track printed by the ministry (e.g. "القرنة", "التخصصات الطبية") */
  campus?: string | null;
  campus_en?: string | null;
  level?: ProgramLevel;
  /** "2" (institute diploma) or "2-4" (technical college) when the ministry prints a duration */
  program_length?: string | null;
  stream: 'scientific' | 'literary' | 'vocational';
  sub_stream?: 'bio' | 'applied';
  gender: Gender;
  study_type: 'morning' | 'evening' | 'parallel';
  channel: 'general' | 'martyrs' | 'distinguished' | 'medical_free' | 'survivors';
  governorate: string;
  /** Competitive average (total ÷ 7). Can exceed 100 — see DatasetMeta.federal.max_score */
  min_average: number;
  /** Total marks out of 700 (plus language bonus) */
  min_score?: number;
  seats?: number;
  source_url: string;
  source_date: string;
  confidence: Confidence;
}

export interface KRGCutoff {
  id: string;
  year: number;
  university: string;
  university_en: string;
  university_ku: string;
  college: string;
  college_en: string;
  college_ku: string;
  department: string | null;
  department_en: string | null;
  department_ku: string | null;
  city: string;
  level?: ProgramLevel;
  program_length?: string | null;
  stream: 'scientific' | 'literary' | 'vocational';
  sub_stream?: 'bio' | 'applied';
  gender: Gender;
  study_type: 'government' | 'parallel' | 'evening';
  min_composite_score: number;
  min_g12_equivalent?: number;
  weighting_formula: string;
  seats?: number;
  source_url: string;
  source_date: string;
  confidence: Confidence;
  notes_ar?: string;
  notes_ckb?: string;
  notes_en?: string;
}

/** public/data/meta.json — which dataset files to load and how to label them. */
export interface DatasetInfo {
  file: string;
  year: number;
  year_label: string;
  year_label_ar?: string;
  /** Highest average the checker accepts for this system */
  max_score: number;
  source_name: string;
  source_url: string;
  published: string;
  note?: string;
  /** Other channels of the same year, merged into the dataset (Federal only) */
  extra_files?: { file: string; channel: string }[];
  /** Prior years, used for year-over-year trends (Federal only) */
  history?: HistoryFileInfo[];
  /** Rule-based application minimums (Federal only) */
  rules?: { file: string; source_name: string; source_url: string; published: string };
  /** The application form's own rules for the coming round (Federal only) */
  form?: FormRules;
}

/** How many choices the official application form needs, per stream. */
export interface FormRules {
  year_label: string;
  year_label_ar?: string;
  /** Minimum number of choices per stream. Streams not listed have no known rule. */
  min_choices: Partial<Record<'scientific' | 'literary' | 'vocational', number>>;
  /** Minimum number of technical institutes or polytechnic (technical-university) colleges among them */
  min_technical: number;
  source_name: string;
  source_url: string;
  published: string;
  note?: string;
}

/** A prior-year (or other-channel) Federal file listed in meta.json */
export interface HistoryFileInfo {
  file: string;
  year: number;
  year_label: string;
  year_label_ar?: string;
  channel?: string;
}

export type RouteStream = 'scientific' | 'literary';

/** One field in the ministry's table of minimum averages to apply per route */
export interface RouteMinimum {
  id: string;
  ar: string;
  en: string;
  ckb: string;
  kmr: string;
  gov_morning: Partial<Record<RouteStream, number>>;
  gov_evening: Partial<Record<RouteStream, number>>;
  private_morning: Partial<Record<RouteStream, number>>;
  private_evening: Partial<Record<RouteStream, number>>;
}

export interface PrivateMedicalMinimum {
  id: string;
  ar: string;
  en: string;
  ckb: string;
  kmr: string;
  morning: number;
  evening: number | null;
}

/** public/data/rules-federal-<year>.json — rule-based application minimums */
export interface FederalRules {
  year: number;
  year_label: string;
  source_name: string;
  source_url: string;
  published: string;
  note?: string;
  martyrs_allowance?: { medical: number; other: number; note_ar?: string };
  medical_update?: { dentistry_pharmacy: number; decision: string; note_ar?: string };
  routes: RouteMinimum[];
  private_medical: PrivateMedicalMinimum[];
}

export interface DatasetMeta {
  updated: string;
  federal: DatasetInfo;
  krg: DatasetInfo;
  scholarships: { file: string; verified: string };
}

export interface Scholarship {
  id: string;
  name: string;
  name_ar: string;
  name_ckb?: string;
  name_kmr?: string;
  country: string;
  country_flag: string;
  provider: string;
  degree_levels: ('bachelor' | 'masters' | 'phd')[];
  type: 'full_scholarship' | 'partial_scholarship' | 'exchange' | 'fellowship';
  eligibility: {
    nationalities?: string[];
    refugee_idp_eligible: boolean;
    survivor_eligible?: boolean;
    min_gpa?: number;
    max_age?: number;
    language_requirements?: string[];
    field_restrictions?: string[];
    gender_restriction?: 'male' | 'female' | null;
    work_experience_years?: number;
    must_return?: boolean;
    /** True when applicants must already be enrolled as undergrads (not Grade-12 leavers). */
    requires_enrolled_undergrad?: boolean;
  };
  application_url: string;
  deadline?: string;
  /** True when `deadline` is projected from previous cycles, not officially announced */
  deadline_estimated?: boolean;
  deadline_note?: string;
  deadline_note_ckb?: string;
  deadline_note_kmr?: string;
  deadline_note_en?: string;
  covers: string[];
  covers_ckb?: string[];
  covers_kmr?: string[];
  covers_en?: string[];
  acceptance_rate?: string;
  acceptance_rate_en?: string;
  status: 'open' | 'closed' | 'upcoming' | 'discontinued';
  last_verified: string;
  verified_by: string;
  notes_ar?: string;
  notes_ckb?: string;
  notes_kmr?: string;
  notes_en?: string;
}

export type AdmissionSystem = 'federal' | 'krg';

export interface CheckerFilters {
  system: AdmissionSystem;
  score: number;
  stream: 'scientific' | 'literary' | 'vocational';
  sub_stream?: 'bio' | 'applied';
  governorate?: string;
  study_type?: string;
  channel?: string;
  gender?: Gender;
  level?: ProgramLevel;
  search?: string;
  show_reach?: boolean;
  sort_by?: 'cutoff_desc' | 'cutoff_asc' | 'closest' | 'alpha';
}

export interface ScholarshipFilters {
  status?: string;
  degree_level?: string;
  country?: string;
  refugee_eligible?: boolean;
  search?: string;
  /** Student's GPA/average (0-100) — hides scholarships requiring a higher GPA */
  student_gpa?: number;
  /** Student's age — hides scholarships whose max_age is lower than student_age */
  student_age?: number;
  /** Explainable eligibility filter mode */
  eligible_only?: 'all' | 'go' | 'go_maybe';
}
