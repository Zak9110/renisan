// ============================================
// Renisan Platform — Pure Explainable Eligibility Engine (F2 / Hard Rule 3)
// Zero framework or DB imports. 100% deterministic and unit-tested.
//
// Verdict precedence (Hard Rule):
//   1. Expired listing -> excluded from active lists (returns NO_GO with expired reason if called directly).
//   2. Any failed mandatory rule (or iraqiEligibility === "no") -> NO_GO (beats unknowns).
//   3. Any unknown required profile field, borderline birthYear age, or iraqiEligibility === "unclear" -> MAYBE.
//   4. All mandatory rules satisfied and nothing unknown -> GO.
//   Optional rules (mandatory: false) only adjust preferenceScore inside the same verdict.
// ============================================

import type { I18nText } from "@/db/schema";

export type Verdict = "GO" | "MAYBE" | "NO_GO";
export type RuleOperator = "eq" | "in" | "gte" | "lte" | "between" | "exists";

export interface MatchProfile {
  educationLevel?: "grade12" | "undergrad" | "graduate" | "other" | null;
  fieldOfStudy?: string | null;
  gpaPercent?: number | null;
  englishTestType?: string | null;
  englishScore?: number | null;
  workExperienceYears?: number | null;
  gender?: string | null;
  willingToReturn?: boolean | null;
  governorate?: string | null;
  currentCountry?: string | null;
  birthYear?: number | null;
  idpSelfDeclared?: boolean | null;
}

export interface MatchOpportunityInput {
  id: string;
  iraqiEligibility: "yes" | "no" | "unclear";
  status: "draft" | "in_review" | "published" | "expired" | "rejected" | "removed";
  deadline: Date | null;
  deadlineStatus: "confirmed" | "estimated" | "unknown";
  rolling: boolean;
  levels?: string[];
}

export interface MatchRule {
  field: string;
  operator: RuleOperator;
  value: unknown;
  mandatory: boolean;
  explanation?: I18nText | null;
}

export interface MatchReason {
  field: string;
  outcome: "pass" | "fail" | "unknown";
  mandatory: boolean;
  code: string;
  params?: Record<string, string | number>;
  explanation?: I18nText | null;
}

export interface MatchOutput {
  verdict: Verdict;
  reasons: MatchReason[];
  missing: string[];
  preferenceScore: number;
}

export function isOpportunityExpired(opp: Pick<MatchOpportunityInput, "status" | "deadline" | "deadlineStatus" | "rolling">, now: Date = new Date()): boolean {
  if (opp.status === "expired") return true;
  if (opp.rolling) return false;
  if (opp.deadline && opp.deadlineStatus === "confirmed") {
    return opp.deadline.getTime() < now.getTime();
  }
  return false;
}

function getProfileFieldValue(
  profile: MatchProfile,
  field: string,
  opp: MatchOpportunityInput,
  now: Date,
): { value: unknown; borderlineAge?: boolean } {
  switch (field) {
    case "educationLevel":
      return { value: profile.educationLevel ?? null };
    case "gpaPercent":
      return { value: profile.gpaPercent ?? null };
    case "englishScore":
      return { value: profile.englishScore ?? null };
    case "englishTestType":
      return { value: profile.englishTestType ?? null };
    case "fieldOfStudy":
      return { value: profile.fieldOfStudy ?? null };
    case "workExperienceYears":
      return { value: profile.workExperienceYears ?? null };
    case "gender":
      return { value: profile.gender ?? null };
    case "willingToReturn":
      return { value: profile.willingToReturn ?? null };
    case "residence":
    case "currentCountry":
      return { value: profile.currentCountry ?? null };
    case "governorate":
      return { value: profile.governorate ?? null };
    case "idp":
      return { value: profile.idpSelfDeclared ?? null };
    case "age": {
      if (profile.birthYear == null) return { value: null };
      const refYear =
        opp.deadline && opp.deadline.getUTCFullYear() >= now.getUTCFullYear()
          ? opp.deadline.getUTCFullYear()
          : now.getUTCFullYear();
      return { value: refYear - profile.birthYear, borderlineAge: true };
    }
    default:
      return { value: null };
  }
}

function evalRule(
  operator: RuleOperator,
  actual: unknown,
  expected: unknown,
  isBirthYearAge: boolean,
): "pass" | "fail" | "unknown" {
  if (operator === "exists") {
    const wantExists = expected !== false;
    if (actual == null || actual === "") return wantExists ? "unknown" : "pass";
    return wantExists ? "pass" : "fail";
  }

  if (actual == null || actual === "") return "unknown";

  if (operator === "eq") {
    if (typeof actual === "string" && typeof expected === "string") {
      return actual.trim().toLowerCase() === expected.trim().toLowerCase() ? "pass" : "fail";
    }
    return actual === expected ? "pass" : "fail";
  }

  if (operator === "in") {
    if (!Array.isArray(expected)) return "unknown";
    const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
    const actualNorm = norm(actual);
    return expected.map(norm).includes(actualNorm) ? "pass" : "fail";
  }

  if (typeof actual !== "number" || !Number.isFinite(actual)) return "unknown";

  if (operator === "gte") {
    if (typeof expected !== "number") return "unknown";
    if (isBirthYearAge && (actual === expected || actual === expected - 1)) return "unknown";
    return actual >= expected ? "pass" : "fail";
  }

  if (operator === "lte") {
    if (typeof expected !== "number") return "unknown";
    // Birth year alone has ±1 year precision: borderline cases return MAYBE, never GO
    if (isBirthYearAge && (actual === expected || actual === expected + 1)) return "unknown";
    return actual <= expected ? "pass" : "fail";
  }

  if (operator === "between") {
    if (!Array.isArray(expected) || expected.length !== 2) return "unknown";
    const [min, max] = expected as [number, number];
    if (typeof min !== "number" || typeof max !== "number") return "unknown";
    if (actual < min - (isBirthYearAge ? 1 : 0) || actual > max + (isBirthYearAge ? 1 : 0)) {
      return "fail";
    }
    if (isBirthYearAge && (actual === min || actual === min - 1 || actual === max || actual === max + 1)) {
      return "unknown";
    }
    return actual >= min && actual <= max ? "pass" : "fail";
  }

  return "unknown";
}

export function matchOpportunity(
  profile: MatchProfile | null | undefined,
  opportunity: MatchOpportunityInput,
  rules: MatchRule[],
  now: Date = new Date(),
): MatchOutput {
  const safeProfile: MatchProfile = profile ?? {};
  const reasons: MatchReason[] = [];
  const missingSet = new Set<string>();
  let mandatoryFail = false;
  let mandatoryUnknown = false;
  let preferenceScore = 0;

  if (isOpportunityExpired(opportunity, now)) {
    return {
      verdict: "NO_GO",
      reasons: [{ field: "deadline", outcome: "fail", mandatory: true, code: "expired" }],
      missing: [],
      preferenceScore: -100,
    };
  }

  // Iraqi eligibility check (built into the opportunity row)
  if (opportunity.iraqiEligibility === "no") {
    mandatoryFail = true;
    reasons.push({ field: "nationality", outcome: "fail", mandatory: true, code: "iraqi_ineligible" });
  } else if (opportunity.iraqiEligibility === "unclear") {
    mandatoryUnknown = true;
    reasons.push({ field: "nationality", outcome: "unknown", mandatory: true, code: "iraqi_unclear" });
  } else {
    reasons.push({ field: "nationality", outcome: "pass", mandatory: true, code: "iraqi_eligible" });
    preferenceScore += 10;
  }

  // Evaluate structured eligibility rules
  for (const rule of rules) {
    const { value: actual, borderlineAge } = getProfileFieldValue(safeProfile, rule.field, opportunity, now);
    const outcome = evalRule(rule.operator, actual, rule.value, Boolean(borderlineAge));

    const code =
      outcome === "pass"
        ? `${rule.field}_pass`
        : outcome === "fail"
          ? `${rule.field}_fail`
          : actual == null
            ? `${rule.field}_missing`
            : `${rule.field}_borderline`;

    reasons.push({
      field: rule.field,
      outcome,
      mandatory: rule.mandatory,
      code,
      explanation: rule.explanation,
    });

    if (rule.mandatory) {
      if (outcome === "fail") {
        mandatoryFail = true;
      } else if (outcome === "unknown") {
        mandatoryUnknown = true;
        if (actual == null) missingSet.add(rule.field);
      } else {
        preferenceScore += 15;
      }
    } else if (outcome === "pass") {
      // Optional preference rules never change verdict; they boost rank inside the same verdict.
      preferenceScore += 5;
    }
  }

  const verdict: Verdict = mandatoryFail ? "NO_GO" : mandatoryUnknown ? "MAYBE" : "GO";

  return {
    verdict,
    reasons,
    missing: Array.from(missingSet),
    preferenceScore,
  };
}
