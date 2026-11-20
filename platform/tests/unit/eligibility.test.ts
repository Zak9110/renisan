import { describe, expect, it } from "vitest";
import {
  isOpportunityExpired,
  matchOpportunity,
  type MatchOpportunityInput,
  type MatchRule,
} from "@/lib/eligibility/match";

const now = new Date("2026-11-20T12:00:00Z");

const baseOpp: MatchOpportunityInput = {
  id: "opp-1",
  iraqiEligibility: "yes",
  status: "published",
  deadline: new Date("2027-02-20T00:00:00Z"),
  deadlineStatus: "confirmed",
  rolling: false,
};

describe("explainable eligibility engine (matchOpportunity)", () => {
  it("returns GO when all mandatory rules pass and nothing is unknown", () => {
    const rules: MatchRule[] = [
      { field: "educationLevel", operator: "in", value: ["grade12", "undergrad"], mandatory: true },
      { field: "gpaPercent", operator: "gte", value: 80, mandatory: true },
      { field: "age", operator: "lte", value: 21, mandatory: true },
    ];
    const res = matchOpportunity(
      { educationLevel: "grade12", gpaPercent: 90, birthYear: 2008 }, // 2027 - 2008 = 19 (< 21)
      baseOpp,
      rules,
      now,
    );
    expect(res.verdict).toBe("GO");
    expect(res.missing).toEqual([]);
  });

  it("returns MAYBE with the missing field named when a mandatory field is unknown", () => {
    const rules: MatchRule[] = [
      { field: "gpaPercent", operator: "gte", value: 80, mandatory: true },
      { field: "workExperienceYears", operator: "gte", value: 2, mandatory: true },
    ];
    const res = matchOpportunity({ gpaPercent: 85 }, baseOpp, rules, now);
    expect(res.verdict).toBe("MAYBE");
    expect(res.missing).toEqual(["workExperienceYears"]);
  });

  it("hard rule: a failed mandatory criterion beats unknowns -> NO_GO", () => {
    const rules: MatchRule[] = [
      { field: "gpaPercent", operator: "gte", value: 80, mandatory: true },
      { field: "workExperienceYears", operator: "gte", value: 2, mandatory: true },
    ];
    const res = matchOpportunity({ gpaPercent: 70 }, baseOpp, rules, now);
    expect(res.verdict).toBe("NO_GO");
    expect(res.reasons.some((r) => r.field === "gpaPercent" && r.outcome === "fail")).toBe(true);
  });

  it("handles age at deadline with ±1 year birthYear precision (borderline -> MAYBE, clear over -> NO_GO)", () => {
    const rules: MatchRule[] = [{ field: "age", operator: "lte", value: 21, mandatory: true }];
    // 2027 - 2006 = 21 -> borderline MAYBE
    expect(matchOpportunity({ birthYear: 2006 }, baseOpp, rules, now).verdict).toBe("MAYBE");
    // 2027 - 2004 = 23 -> clearly over max 21 -> NO_GO
    expect(matchOpportunity({ birthYear: 2004 }, baseOpp, rules, now).verdict).toBe("NO_GO");
    // 2027 - 2008 = 19 -> clearly under -> GO
    expect(matchOpportunity({ birthYear: 2008 }, baseOpp, rules, now).verdict).toBe("GO");
  });

  it("evaluates between, eq, exists, and optional preference rules correctly", () => {
    const rules: MatchRule[] = [
      { field: "gpaPercent", operator: "between", value: [70, 100], mandatory: true },
      { field: "currentCountry", operator: "eq", value: "IQ", mandatory: true },
      { field: "englishTestType", operator: "exists", value: true, mandatory: true },
      { field: "idp", operator: "eq", value: true, mandatory: false },
    ];
    const withPref = matchOpportunity(
      { gpaPercent: 85, currentCountry: "iq", englishTestType: "IELTS", idpSelfDeclared: true },
      baseOpp,
      rules,
      now,
    );
    const withoutPref = matchOpportunity(
      { gpaPercent: 85, currentCountry: "IQ", englishTestType: "IELTS", idpSelfDeclared: false },
      baseOpp,
      rules,
      now,
    );
    expect(withPref.verdict).toBe("GO");
    expect(withoutPref.verdict).toBe("GO");
    expect(withPref.preferenceScore).toBeGreaterThan(withoutPref.preferenceScore);
  });

  it("handles iraqiEligibility no -> NO_GO and unclear -> MAYBE", () => {
    expect(matchOpportunity({}, { ...baseOpp, iraqiEligibility: "no" }, [], now).verdict).toBe("NO_GO");
    expect(matchOpportunity({}, { ...baseOpp, iraqiEligibility: "unclear" }, [], now).verdict).toBe("MAYBE");
  });

  it("excludes expired confirmed listings while keeping rolling listings active", () => {
    const pastConfirmed: MatchOpportunityInput = {
      ...baseOpp,
      deadline: new Date("2026-10-01T00:00:00Z"),
      deadlineStatus: "confirmed",
    };
    expect(isOpportunityExpired(pastConfirmed, now)).toBe(true);
    expect(matchOpportunity({}, pastConfirmed, [], now).verdict).toBe("NO_GO");
    expect(isOpportunityExpired({ ...pastConfirmed, rolling: true }, now)).toBe(false);
  });
});
