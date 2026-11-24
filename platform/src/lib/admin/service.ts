// ============================================
// Renisan Platform — M3 Editor / Admin Console Service
// Role checks happen here in the service layer (ARCHITECTURE.md).
// Every editorial mutation is recorded in audit_log with scrubbed before/after.
// ============================================

import { desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  auditLog,
  eligibilityRules,
  ingestionRuns,
  ingestionSources,
  opportunities,
  opportunityReports,
  type I18nText,
} from "@/db/schema";
import { checkScamRedFlags } from "@/lib/ingestion/daily";

export type EditorRole = "member" | "helper" | "editor" | "admin";

export function isEditorOrAdmin(role: EditorRole | undefined | null): boolean {
  return role === "editor" || role === "admin";
}

function normalizeTitleTokens(title: I18nText | null | undefined): Set<string> {
  const joined = Object.values(title ?? {})
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return new Set(
    joined
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (w) => w.length > 2 && !["the", "and", "for", "scholarship", "program", "programme"].includes(w),
      ),
  );
}

function titleOverlap(a: I18nText | null | undefined, b: I18nText | null | undefined): number {
  const ta = normalizeTitleTokens(a);
  const tb = normalizeTitleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function urlHostPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export interface EditorRuleInput {
  field: string;
  operator: "eq" | "in" | "gte" | "lte" | "between" | "exists";
  value: unknown;
  mandatory: boolean;
  explanation?: I18nText | null;
  sourceNote?: string | null;
}

export interface EditorOpportunityPatch {
  type?: typeof opportunities.$inferInsert.type;
  title?: I18nText;
  summary?: I18nText | null;
  notes?: I18nText | null;
  requiredDocuments?: I18nText | null;
  languageRequirements?: I18nText | null;
  providerName?: string;
  sourceUrl?: string;
  applyUrl?: string | null;
  deadline?: Date | null;
  deadlineStatus?: "confirmed" | "estimated" | "unknown";
  rolling?: boolean;
  iraqiEligibility?: "yes" | "no" | "unclear";
  levels?: string[];
  fields?: string[];
  countries?: string[];
  fundingType?: "full" | "partial" | "stipend" | "none" | null;
  costToApplicant?: { amount: number; currency: string; note?: string } | null;
  needsReview?: string[];
  rules?: EditorRuleInput[];
  action?: "save_draft" | "publish" | "reject" | "unhide" | "mark_checked";
}

export async function getEditorDashboard(db: Db, actorRole: EditorRole, now: Date = new Date()) {
  if (!isEditorOrAdmin(actorRole)) {
    throw new Error("forbidden");
  }

  const allOpps = await db.select().from(opportunities).orderBy(desc(opportunities.updatedAt));
  const allRules = await db.select().from(eligibilityRules);
  const rulesByOpp = new Map<string, (typeof eligibilityRules.$inferSelect)[]>();
  for (const r of allRules) {
    const arr = rulesByOpp.get(r.opportunityId) ?? [];
    arr.push(r);
    rulesByOpp.set(r.opportunityId, arr);
  }

  const published = allOpps.filter((o) => o.status === "published");
  const queueRaw = allOpps.filter((o) => o.status === "in_review" || o.status === "draft");

  // Duplicate hints: same URL or high title similarity against published listings (F7)
  const queue = queueRaw.map((item) => {
    const key = urlHostPath(item.sourceUrl);
    const duplicateHints = published
      .filter((p) => urlHostPath(p.sourceUrl) === key || titleOverlap(p.title, item.title) >= 0.55)
      .slice(0, 3)
      .map((p) => ({ id: p.id, title: p.title, providerName: p.providerName }));

    const textForScam = `${Object.values(item.title ?? {}).join(" ")} ${Object.values(item.summary ?? {}).join(" ")}`;
    const scamCheck = checkScamRedFlags(textForScam);

    return {
      opportunity: item,
      rules: rulesByOpp.get(item.id) ?? [],
      duplicateHints,
      scamWarnings: scamCheck.reasons,
    };
  });

  const STALE_MS = 30 * 86_400_000;
  const publishedWithMeta = published.map((o) => {
    const checkedAt = o.lastCheckedAt ?? o.verifiedAt ?? o.updatedAt;
    const ageDays = Math.max(0, Math.floor((now.getTime() - checkedAt.getTime()) / 86_400_000));
    return {
      opportunity: o,
      rules: rulesByOpp.get(o.id) ?? [],
      ageDays,
      isStale: now.getTime() - checkedAt.getTime() > STALE_MS,
    };
  });

  const ages = publishedWithMeta.map((p) => p.ageDays).sort((a, b) => a - b);
  const medianAgeDays = ages.length > 0 ? ages[Math.floor(ages.length / 2)]! : 0;

  const openReports = await db
    .select({
      report: opportunityReports,
      opportunityTitle: opportunities.title,
      opportunityStatus: opportunities.status,
      hiddenAt: opportunities.hiddenAt,
    })
    .from(opportunityReports)
    .innerJoin(opportunities, eq(opportunityReports.opportunityId, opportunities.id))
    .where(isNull(opportunityReports.resolvedAt))
    .orderBy(desc(opportunityReports.createdAt));

  const sources = await db.select().from(ingestionSources);
  const recentRuns = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(15);

  const audit = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(25);

  return {
    freshness: {
      publishedCount: published.length,
      inReviewCount: queue.length,
      staleCount: publishedWithMeta.filter((p) => p.isStale).length,
      hiddenCount: published.filter((p) => p.hiddenAt != null).length,
      openReportsCount: openReports.length,
      medianAgeDays,
    },
    queue,
    published: publishedWithMeta,
    reports: openReports,
    sources,
    recentRuns,
    audit,
  };
}

export type ReviewOpportunityResult =
  | { ok: true; opportunity: typeof opportunities.$inferSelect }
  | { ok: false; error: "forbidden" | "not_found" | "publish_guard_failed"; details?: string[] };

export async function reviewOpportunity(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  opportunityId: string,
  patch: EditorOpportunityPatch,
  now: Date = new Date(),
): Promise<ReviewOpportunityResult> {
  if (!isEditorOrAdmin(actorRole)) return { ok: false, error: "forbidden" };

  const [existing] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1);
  if (!existing) return { ok: false, error: "not_found" };

  const nextSourceUrl = patch.sourceUrl !== undefined ? patch.sourceUrl.trim() : existing.sourceUrl;
  const nextRolling = patch.rolling !== undefined ? patch.rolling : existing.rolling;
  const nextDeadline = patch.deadline !== undefined ? patch.deadline : existing.deadline;
  const nextDeadlineStatus =
    patch.deadlineStatus !== undefined ? patch.deadlineStatus : existing.deadlineStatus;
  const nextIraqi = patch.iraqiEligibility !== undefined ? patch.iraqiEligibility : existing.iraqiEligibility;
  const nextTitle = patch.title !== undefined ? patch.title : existing.title;
  const nextSummary = patch.summary !== undefined ? patch.summary : existing.summary;

  const action = patch.action ?? "save_draft";

  if (action === "publish") {
    const errors: string[] = [];
    if (!nextSourceUrl || !/^https?:\/\//.test(nextSourceUrl)) {
      errors.push("sourceUrl must be a valid http(s) URL");
    }
    if (!nextRolling && !(nextDeadline && nextDeadlineStatus === "confirmed")) {
      errors.push(
        "published listings require rolling=true or a confirmed deadline (estimated dates cannot publish)",
      );
    }
    if (nextDeadline && nextDeadlineStatus === "confirmed" && nextDeadline.getTime() <= now.getTime()) {
      errors.push("confirmed deadline is already in the past");
    }
    if (!Object.values(nextTitle ?? {}).some((v) => v && v.trim().length > 0)) {
      errors.push("at least one localized title is required");
    }
    const scam = checkScamRedFlags(
      `${Object.values(nextTitle ?? {}).join(" ")} ${Object.values(nextSummary ?? {}).join(" ")}`,
    );
    if (scam.flagged) {
      errors.push(`scam red flags detected: ${scam.reasons.join(", ")}`);
    }
    if (errors.length > 0) {
      return { ok: false, error: "publish_guard_failed", details: errors };
    }
  }

  const updateFields: Partial<typeof opportunities.$inferInsert> = {
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.requiredDocuments !== undefined ? { requiredDocuments: patch.requiredDocuments } : {}),
    ...(patch.languageRequirements !== undefined ? { languageRequirements: patch.languageRequirements } : {}),
    ...(patch.providerName !== undefined ? { providerName: patch.providerName.trim().slice(0, 200) } : {}),
    ...(patch.sourceUrl !== undefined ? { sourceUrl: nextSourceUrl } : {}),
    ...(patch.applyUrl !== undefined ? { applyUrl: patch.applyUrl } : {}),
    ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
    ...(patch.deadlineStatus !== undefined ? { deadlineStatus: patch.deadlineStatus } : {}),
    ...(patch.rolling !== undefined ? { rolling: patch.rolling } : {}),
    ...(patch.iraqiEligibility !== undefined ? { iraqiEligibility: nextIraqi } : {}),
    ...(patch.levels !== undefined ? { levels: patch.levels } : {}),
    ...(patch.fields !== undefined ? { fields: patch.fields } : {}),
    ...(patch.countries !== undefined ? { countries: patch.countries } : {}),
    ...(patch.fundingType !== undefined ? { fundingType: patch.fundingType } : {}),
    ...(patch.costToApplicant !== undefined ? { costToApplicant: patch.costToApplicant } : {}),
    ...(patch.needsReview !== undefined ? { needsReview: patch.needsReview } : {}),
    updatedAt: now,
  };

  if (action === "publish") {
    updateFields.status = "published";
    updateFields.verifiedBy = actorId;
    updateFields.verifiedAt = now;
    updateFields.lastCheckedAt = now;
    updateFields.hiddenAt = null;
    updateFields.hiddenReason = null;
  } else if (action === "reject") {
    updateFields.status = "rejected";
  } else if (action === "unhide") {
    updateFields.hiddenAt = null;
    updateFields.hiddenReason = null;
    updateFields.lastCheckedAt = now;
  } else if (action === "mark_checked") {
    updateFields.lastCheckedAt = now;
  }

  const [updated] = await db
    .update(opportunities)
    .set(updateFields)
    .where(eq(opportunities.id, opportunityId))
    .returning();

  if (patch.rules !== undefined) {
    await db.delete(eligibilityRules).where(eq(eligibilityRules.opportunityId, opportunityId));
    if (patch.rules.length > 0) {
      await db.insert(eligibilityRules).values(
        patch.rules.map((r) => ({
          opportunityId,
          field: r.field,
          operator: r.operator,
          value: r.value,
          mandatory: r.mandatory,
          explanation: r.explanation ?? null,
          sourceNote: r.sourceNote ?? null,
        })),
      );
    }
  }

  await db.insert(auditLog).values({
    actorId,
    action: `opportunity.${action}`,
    entity: "opportunity",
    entityId: opportunityId,
    before: {
      status: existing.status,
      iraqiEligibility: existing.iraqiEligibility,
      deadlineStatus: existing.deadlineStatus,
      hiddenAt: existing.hiddenAt,
    },
    after: {
      status: updated!.status,
      iraqiEligibility: updated!.iraqiEligibility,
      deadlineStatus: updated!.deadlineStatus,
      hiddenAt: updated!.hiddenAt,
      rulesCount: patch.rules?.length,
    },
    at: now,
  });

  return { ok: true, opportunity: updated! };
}

export async function resolveReport(
  db: Db,
  actorId: string,
  actorRole: EditorRole,
  reportId: string,
  decision: "dismiss" | "remove_listing",
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "not_found" }> {
  if (!isEditorOrAdmin(actorRole)) return { ok: false, error: "forbidden" };

  const [report] = await db
    .select()
    .from(opportunityReports)
    .where(eq(opportunityReports.id, reportId))
    .limit(1);
  if (!report) return { ok: false, error: "not_found" };

  await db
    .update(opportunityReports)
    .set({ resolvedAt: now })
    .where(eq(opportunityReports.opportunityId, report.opportunityId));

  if (decision === "remove_listing") {
    await db
      .update(opportunities)
      .set({ status: "removed", hiddenAt: now, hiddenReason: "removed_by_editor", updatedAt: now })
      .where(eq(opportunities.id, report.opportunityId));
  } else {
    await db
      .update(opportunities)
      .set({ hiddenAt: null, hiddenReason: null, lastCheckedAt: now, updatedAt: now })
      .where(eq(opportunities.id, report.opportunityId));
  }

  await db.insert(auditLog).values({
    actorId,
    action: `report.${decision}`,
    entity: "opportunity",
    entityId: report.opportunityId,
    after: { reportId, decision },
    at: now,
  });

  return { ok: true };
}
