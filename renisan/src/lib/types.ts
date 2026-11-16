// ============================================
// Renisan — Data type definitions
// ============================================

export interface FederalCutoff {
  id: string;
  year: number;
  university: string;
  university_en: string;
  college: string;
  college_en: string;
  department: string | null;
  department_en: string | null;
  stream: 'scientific' | 'literary' | 'vocational';
  sub_stream?: 'bio' | 'applied';
  gender: 'male' | 'female' | 'both';
  study_type: 'morning' | 'evening' | 'parallel';
  channel: 'general' | 'martyrs' | 'distinguished' | 'medical_free' | 'survivors';
  governorate: string;
  min_average: number;
  min_score?: number;
  seats?: number;
  source_url: string;
  source_date: string;
  confidence: 'official' | 'verified_third_party' | 'unverified';
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
  stream: 'scientific' | 'literary' | 'vocational';
  sub_stream?: 'bio' | 'applied';
  gender: 'male' | 'female' | 'both';
  study_type: 'government' | 'parallel' | 'evening';
  min_composite_score: number;
  min_g12_equivalent?: number;
  weighting_formula: string;
  seats?: number;
  source_url: string;
  source_date: string;
  confidence: 'official' | 'verified_third_party' | 'unverified';
  notes_ar?: string;
  notes_ckb?: string;
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
  };
  application_url: string;
  deadline?: string;
  deadline_note?: string;
  covers: string[];
  acceptance_rate?: string;
  status: 'open' | 'closed' | 'upcoming' | 'discontinued';
  last_verified: string;
  verified_by: string;
  notes_ar?: string;
  notes_ckb?: string;
  notes_kmr?: string;
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
}

export interface ScholarshipFilters {
  status?: string;
  degree_level?: string;
  country?: string;
  refugee_eligible?: boolean;
}
