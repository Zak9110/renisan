import { and, asc, eq, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  auditLog,
  digestRuns,
  eligibilityRules,
  opportunities,
  opportunityReports,
  type I18nText,
} from "@/db/schema";
import { checkScamRedFlags } from "@/lib/ingestion/daily";
import {
  isOpportunityExpired,
  matchOpportunity,
  type MatchOutput,
  type MatchProfile,
  type MatchRule,
} from "@/lib/eligibility/match";

export interface OpportunityListFilters {
  type?: "scholarship" | "exchange" | "fellowship" | "internship" | "competition" | "training" | "job";
  level?: string;
  country?: string;
  fundingType?: "full" | "partial" | "stipend" | "none";
  iraqiEligibility?: "yes" | "unclear" | "all";
  closingWithinDays?: number;
  q?: string;
  eligibleOnly?: "all" | "go" | "go_maybe";
}

export interface MatchedOpportunityRow {
  opportunity: typeof opportunities.$inferSelect;
  rules: (typeof eligibilityRules.$inferSelect)[];
  match: MatchOutput | null;
}

export async function listPublicOpportunities(
  db: Db,
  filters: OpportunityListFilters = {},
  profile?: MatchProfile | null,
  now: Date = new Date(),
): Promise<MatchedOpportunityRow[]> {
  const conditions = [eq(opportunities.status, "published"), isNull(opportunities.hiddenAt)];

  if (filters.type) conditions.push(eq(opportunities.type, filters.type));
  if (filters.fundingType) conditions.push(eq(opportunities.fundingType, filters.fundingType));
  if (filters.iraqiEligibility === "yes") {
    conditions.push(eq(opportunities.iraqiEligibility, "yes"));
  } else if (filters.iraqiEligibility !== "all") {
    // Default per F1: yes + unclear (never hides "no" silently without explicit filter, excludes "no" by default)
    conditions.push(
      or(eq(opportunities.iraqiEligibility, "yes"), eq(opportunities.iraqiEligibility, "unclear"))!,
    );
  }
  if (filters.level) {
    conditions.push(sql`${opportunities.levels} @> ARRAY[${filters.level}]::text[]`);
  }
  if (filters.country) {
    conditions.push(sql`${opportunities.countries} @> ARRAY[${filters.country}]::text[]`);
  }
  if (filters.q && filters.q.trim().length > 0) {
    const query = filters.q.trim();
    conditions.push(
      or(
        sql`${opportunities.searchVector} @@ plainto_tsquery('simple', ${query})`,
        sql`${opportunities.searchText} % ${query}`,
      )!,
    );
  }

  const rows = await db
    .select()
    .from(opportunities)
    .where(and(...conditions))
    .orderBy(asc(opportunities.deadline));

  // Hard rule 2: expired listings are always excluded from active lists
  const active = rows.filter((r) => !isOpportunityExpired(r, now));

  const closingFiltered =
    typeof filters.closingWithinDays === "number" && filters.closingWithinDays > 0
      ? active.filter((r) => {
          if (!r.deadline || r.deadlineStatus !== "confirmed") return false;
          const diffDays = (r.deadline.getTime() - now.getTime()) / 86_400_000;
          return diffDays >= 0 && diffDays <= filters.closingWithinDays!;
        })
      : active;

  const allRules = closingFiltered.length > 0 ? await db.select().from(eligibilityRules) : [];
  const rulesByOpp = new Map<string, (typeof eligibilityRules.$inferSelect)[]>();
  for (const rule of allRules) {
    const bucket = rulesByOpp.get(rule.opportunityId) ?? [];
    bucket.push(rule);
    rulesByOpp.set(rule.opportunityId, bucket);
  }

  const hasProfile = Boolean(
    profile &&
    (profile.educationLevel ||
      profile.gpaPercent != null ||
      profile.birthYear != null ||
      profile.englishScore != null ||
      profile.workExperienceYears != null ||
      profile.fieldOfStudy ||
      profile.currentCountry ||
      profile.idpSelfDeclared != null),
  );

  const verdictOrder = { GO: 0, MAYBE: 1, NO_GO: 2 };

  const enriched: MatchedOpportunityRow[] = closingFiltered.map((opp) => {
    const oppRules = rulesByOpp.get(opp.id) ?? [];
    const match = hasProfile
      ? matchOpportunity(
          profile,
          opp,
          oppRules.map<MatchRule>((r) => ({
            field: r.field,
            operator: r.operator,
            value: r.value,
            mandatory: r.mandatory,
            explanation: r.explanation,
          })),
          now,
        )
      : null;
    return { opportunity: opp, rules: oppRules, match };
  });

  const eligibleFiltered =
    hasProfile && filters.eligibleOnly === "go"
      ? enriched.filter((e) => e.match?.verdict === "GO")
      : hasProfile && filters.eligibleOnly === "go_maybe"
        ? enriched.filter((e) => e.match?.verdict === "GO" || e.match?.verdict === "MAYBE")
        : enriched;

  return eligibleFiltered.sort((a, b) => {
    if (a.match && b.match) {
      const vw = verdictOrder[a.match.verdict] - verdictOrder[b.match.verdict];
      if (vw !== 0) return vw;
      if (b.match.preferenceScore !== a.match.preferenceScore) {
        return b.match.preferenceScore - a.match.preferenceScore;
      }
    }
    const da = a.opportunity.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dbTime = b.opportunity.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return da - dbTime;
  });
}

export async function createOpportunityDraft(
  db: Db,
  input: {
    type: typeof opportunities.$inferInsert.type;
    title: I18nText;
    summary?: I18nText;
    providerName: string;
    sourceUrl: string;
    applyUrl?: string | null;
    deadline?: Date | null;
    deadlineStatus?: "confirmed" | "estimated" | "unknown";
    rolling?: boolean;
    iraqiEligibility?: "yes" | "no" | "unclear";
    levels?: string[];
    fields?: string[];
    countries?: string[];
    fundingType?: "full" | "partial" | "stipend" | "none" | null;
    createdBy?: string | null;
    status?: "draft" | "in_review";
  },
) {
  const [created] = await db
    .insert(opportunities)
    .values({
      type: input.type,
      title: input.title,
      summary: input.summary,
      providerName: input.providerName,
      sourceUrl: input.sourceUrl,
      applyUrl: input.applyUrl ?? input.sourceUrl,
      deadline: input.deadline ?? null,
      deadlineStatus: input.deadlineStatus ?? "unknown",
      rolling: input.rolling ?? false,
      iraqiEligibility: input.iraqiEligibility ?? "unclear",
      levels: input.levels ?? [],
      fields: input.fields ?? [],
      countries: input.countries ?? [],
      fundingType: input.fundingType ?? null,
      status: input.status ?? "in_review",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return created!;
}

/**
 * Automated daily expiry sweep (Hard rule 2): flips every published listing whose
 * confirmed deadline has passed to status = "expired" and logs the sweep.
 */
export async function expirePassedOpportunitiesDetailed(
  db: Db,
  now: Date = new Date(),
): Promise<{ count: number; expiredIds: string[] }> {
  const expired = await db
    .update(opportunities)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(opportunities.status, "published"),
        eq(opportunities.rolling, false),
        eq(opportunities.deadlineStatus, "confirmed"),
        lte(opportunities.deadline, now),
      ),
    )
    .returning({ id: opportunities.id });

  const expiredIds = expired.map((e) => e.id);

  if (expiredIds.length > 0) {
    await db.insert(auditLog).values({
      action: "opportunity.auto_expire",
      entity: "opportunity",
      entityId: expiredIds.join(","),
      after: { count: expiredIds.length },
      at: now,
    });
  }

  await db.insert(digestRuns).values({
    kind: "expiry",
    startedAt: now,
    finishedAt: new Date(),
    sentCount: expiredIds.length,
    errorCount: 0,
  });

  return { count: expiredIds.length, expiredIds };
}

export async function expirePassedOpportunities(db: Db, now: Date = new Date()): Promise<number> {
  const { count } = await expirePassedOpportunitiesDetailed(db, now);
  return count;
}

export async function getOpportunityDetail(
  db: Db,
  id: string,
  profile?: MatchProfile | null,
  now: Date = new Date(),
) {
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  if (!opp || opp.status === "removed" || opp.status === "rejected" || opp.status === "draft") {
    return null;
  }
  // Hidden or in_review listings are not publicly viewable
  if (opp.hiddenAt || opp.status === "in_review") {
    return null;
  }

  const rules = await db.select().from(eligibilityRules).where(eq(eligibilityRules.opportunityId, id));
  const expired = isOpportunityExpired(opp, now);

  const hasProfile = Boolean(
    profile &&
    (profile.educationLevel ||
      profile.gpaPercent != null ||
      profile.birthYear != null ||
      profile.englishScore != null ||
      profile.workExperienceYears != null ||
      profile.fieldOfStudy ||
      profile.currentCountry ||
      profile.idpSelfDeclared != null),
  );

  const match = hasProfile
    ? matchOpportunity(
        profile,
        opp,
        rules.map<MatchRule>((r) => ({
          field: r.field,
          operator: r.operator,
          value: r.value,
          mandatory: r.mandatory,
          explanation: r.explanation,
        })),
        now,
      )
    : null;

  // When expired, fetch up to 4 similar open listings of the same type (per F1)
  let similar: (typeof opportunities.$inferSelect)[] = [];
  if (expired) {
    const candidates = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.status, "published"),
          isNull(opportunities.hiddenAt),
          eq(opportunities.type, opp.type),
          ne(opportunities.id, opp.id),
        ),
      )
      .orderBy(asc(opportunities.deadline))
      .limit(10);
    similar = candidates.filter((c) => !isOpportunityExpired(c, now)).slice(0, 4);
  }

  return { opportunity: opp, rules, match, expired, similar };
}

const AUTO_HIDE_REPORT_THRESHOLD = 3;

export type ReportResult =
  | { ok: true; autoHidden: boolean; openReportCount: number }
  | { ok: false; error: "not_found" | "already_reported" };

/**
 * Records a community report (scam/expired/wrong_info/other). Enforces one report per user
 * or per anonymous salted fingerprint, and auto-hides the listing after 3 independent reports (F6).
 */
export async function reportOpportunity(
  db: Db,
  input: {
    opportunityId: string;
    userId?: string | null;
    reporterFingerprint: string;
    reason: "scam" | "expired" | "wrong_info" | "other";
    note?: string | null;
    now?: Date;
  },
): Promise<ReportResult> {
  const now = input.now ?? new Date();
  const [opp] = await db
    .select({ id: opportunities.id, hiddenAt: opportunities.hiddenAt })
    .from(opportunities)
    .where(eq(opportunities.id, input.opportunityId))
    .limit(1);
  if (!opp) return { ok: false, error: "not_found" };

  try {
    await db.insert(opportunityReports).values({
      opportunityId: input.opportunityId,
      userId: input.userId ?? null,
      reporterFingerprint: input.reporterFingerprint,
      reason: input.reason,
      note: input.note?.trim().slice(0, 500) || null,
    });
  } catch (err) {
    const text = `${String(err)} ${String((err as { cause?: unknown }).cause ?? "")}`;
    if (
      text.includes("reports_opp_user_uq") ||
      text.includes("reports_opp_fp_uq") ||
      text.includes("unique")
    ) {
      return { ok: false, error: "already_reported" };
    }
    throw err;
  }

  const openReports = await db
    .select({ id: opportunityReports.id })
    .from(opportunityReports)
    .where(
      and(eq(opportunityReports.opportunityId, input.opportunityId), isNull(opportunityReports.resolvedAt)),
    );

  const count = openReports.length;
  let autoHidden = false;

  if (count >= AUTO_HIDE_REPORT_THRESHOLD && !opp.hiddenAt) {
    autoHidden = true;
    await db
      .update(opportunities)
      .set({ hiddenAt: now, hiddenReason: "community_reports", updatedAt: now })
      .where(eq(opportunities.id, input.opportunityId));

    await db.insert(auditLog).values({
      actorId: input.userId ?? null,
      action: "opportunity.auto_hide_reports",
      entity: "opportunity",
      entityId: input.opportunityId,
      after: { openReports: count, reason: "community_reports" },
      at: now,
    });
  }

  return { ok: true, autoHidden, openReportCount: count };
}

/** Public user/community submission: always enters status = "in_review" (never published directly). */
export async function submitPublicOpportunity(
  db: Db,
  input: {
    type: typeof opportunities.$inferInsert.type;
    title: string;
    summary?: string | null;
    providerName: string;
    sourceUrl: string;
    deadline?: Date | null;
    rolling?: boolean;
    locale: "ar" | "ckb" | "kmr" | "en";
    submittedBy?: string | null;
  },
) {
  const scam = checkScamRedFlags(`${input.title} ${input.summary ?? ""}`);
  if (scam.flagged) {
    return { ok: false as const, error: "scam_flagged" as const, reasons: scam.reasons };
  }

  const title: I18nText = { [input.locale]: input.title.trim() };
  const summary: I18nText | undefined = input.summary?.trim()
    ? { [input.locale]: input.summary.trim() }
    : undefined;
  const needsReview = (["ar", "ckb", "kmr", "en"] as const).filter((l) => l !== input.locale);

  const [created] = await db
    .insert(opportunities)
    .values({
      type: input.type,
      title,
      summary: summary ?? null,
      providerName: input.providerName.trim().slice(0, 200),
      sourceUrl: input.sourceUrl.trim(),
      applyUrl: input.sourceUrl.trim(),
      deadline: input.deadline ?? null,
      deadlineStatus: input.deadline ? "estimated" : "unknown",
      rolling: input.rolling ?? false,
      status: "in_review",
      iraqiEligibility: "unclear",
      needsReview: [...needsReview],
      createdBy: input.submittedBy ?? null,
    })
    .returning();

  return { ok: true as const, opportunity: created! };
}
