"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";
import { AdminPhase23Panel } from "./AdminPhase23Panel";

interface I18nMap {
  ar?: string;
  ckb?: string;
  kmr?: string;
  en?: string;
}

interface RuleDto {
  field: string;
  operator: "eq" | "in" | "gte" | "lte" | "between" | "exists";
  value: unknown;
  mandatory: boolean;
  explanation?: I18nMap | null;
}

interface OppDto {
  id: string;
  type: string;
  title: I18nMap;
  summary?: I18nMap | null;
  providerName: string;
  sourceUrl: string;
  applyUrl?: string | null;
  deadline?: string | null;
  deadlineStatus: "confirmed" | "estimated" | "unknown";
  rolling: boolean;
  status: string;
  iraqiEligibility: "yes" | "no" | "unclear";
  needsReview: string[];
  hiddenAt?: string | null;
}

interface QueueItemDto {
  opportunity: OppDto;
  rules: RuleDto[];
  duplicateHints: { id: string; title: I18nMap; providerName: string }[];
  scamWarnings: string[];
}

interface PublishedItemDto {
  opportunity: OppDto;
  rules: RuleDto[];
  ageDays: number;
  isStale: boolean;
}

interface ReportItemDto {
  report: { id: string; opportunityId: string; reason: string; note: string | null; createdAt: string };
  opportunityTitle: I18nMap;
  opportunityStatus: string;
  hiddenAt: string | null;
}

interface DashboardDto {
  freshness: {
    publishedCount: number;
    inReviewCount: number;
    staleCount: number;
    hiddenCount: number;
    openReportsCount: number;
    medianAgeDays: number;
  };
  queue: QueueItemDto[];
  published: PublishedItemDto[];
  reports: ReportItemDto[];
  sources: {
    id: string;
    name: string;
    tier: string;
    lastFetchedAt: string | null;
    consecutiveFailures: number;
  }[];
  audit: { id: string; action: string; entity: string; entityId: string | null; at: string }[];
}

interface EditableDraft {
  id: string;
  titleEn: string;
  titleAr: string;
  titleCkb: string;
  titleKmr: string;
  summaryEn: string;
  summaryAr: string;
  sourceUrl: string;
  deadline: string;
  deadlineStatus: "confirmed" | "estimated" | "unknown";
  rolling: boolean;
  iraqiEligibility: "yes" | "no" | "unclear";
  rules: RuleDto[];
}

function toEditable(o: OppDto, rules: RuleDto[]): EditableDraft {
  return {
    id: o.id,
    titleEn: o.title.en ?? "",
    titleAr: o.title.ar ?? "",
    titleCkb: o.title.ckb ?? "",
    titleKmr: o.title.kmr ?? "",
    summaryEn: o.summary?.en ?? "",
    summaryAr: o.summary?.ar ?? "",
    sourceUrl: o.sourceUrl,
    deadline: o.deadline ? o.deadline.slice(0, 10) : "",
    deadlineStatus: o.deadlineStatus,
    rolling: o.rolling,
    iraqiEligibility: o.iraqiEligibility,
    rules: rules.map((r) => ({ ...r })),
  };
}

export function AdminConsoleClient({ locale }: { locale: Locale }) {
  const t = useTranslations("Admin");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardDto | null>(null);
  const [tab, setTab] = useState<"queue" | "published" | "reports" | "import" | "phase23" | "ops">("queue");
  const [editing, setEditing] = useState<EditableDraft | null>(null);
  const [checks, setChecks] = useState({
    official: false,
    noFee: false,
    noGuarantee: false,
    iraqi: false,
    deadline: false,
  });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [admissionsCsv, setAdmissionsCsv] = useState("");
  const [admissionsCsvResult, setAdmissionsCsvResult] = useState<string | null>(null);
  const [oppsCsv, setOppsCsv] = useState("");
  const [oppsCsvResult, setOppsCsvResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/dashboard");
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (res.ok) {
      setData((await res.json()) as DashboardDto);
      setForbidden(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/dashboard")
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401 || res.status === 403) {
          setForbidden(true);
          setLoading(false);
          return;
        }
        if (res.ok) {
          const json = (await res.json()) as DashboardDto;
          if (active) {
            setData(json);
            setForbidden(false);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRunSync = async () => {
    setSyncing(true);
    setMessage(null);
    const res = await fetch("/api/admin/trigger-daily", { method: "POST" });
    setSyncing(false);
    if (res.ok) {
      setMessage(t("syncDone"));
      await load();
    }
  };

  const handleReviewAction = async (action: "save_draft" | "publish" | "reject") => {
    if (!editing) return;
    setMessage(null);
    const title: I18nMap = {
      ...(editing.titleEn.trim() ? { en: editing.titleEn.trim() } : {}),
      ...(editing.titleAr.trim() ? { ar: editing.titleAr.trim() } : {}),
      ...(editing.titleCkb.trim() ? { ckb: editing.titleCkb.trim() } : {}),
      ...(editing.titleKmr.trim() ? { kmr: editing.titleKmr.trim() } : {}),
    };
    const summary: I18nMap = {
      ...(editing.summaryEn.trim() ? { en: editing.summaryEn.trim() } : {}),
      ...(editing.summaryAr.trim() ? { ar: editing.summaryAr.trim() } : {}),
    };

    const res = await fetch(`/api/admin/opportunities/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        summary: Object.keys(summary).length ? summary : null,
        sourceUrl: editing.sourceUrl,
        deadline: editing.rolling ? null : editing.deadline || null,
        deadlineStatus: editing.deadlineStatus,
        rolling: editing.rolling,
        iraqiEligibility: editing.iraqiEligibility,
        rules: editing.rules,
        action,
      }),
    });

    if (res.ok) {
      setEditing(null);
      await load();
    } else {
      const err = (await res.json()) as { error?: string; details?: string[] };
      setMessage(err.details?.join(" · ") || err.error || "Error");
    }
  };

  const handleQuickAction = async (id: string, action: "mark_checked" | "unhide") => {
    const res = await fetch(`/api/admin/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) await load();
  };

  const handleResolveReport = async (reportId: string, decision: "dismiss" | "remove_listing") => {
    const res = await fetch(`/api/admin/reports/${reportId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (res.ok) await load();
  };

  const handleAdmissionsCsv = async (dryRun: boolean) => {
    if (!admissionsCsv.trim()) return;
    setAdmissionsCsvResult(null);
    const res = await fetch("/api/admin/admissions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: admissionsCsv, dryRun }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      parsedCount?: number;
      cutoffsUpserted?: number;
      warnings?: string[];
      errors?: string[];
      error?: string;
    };
    if (res.ok && json.ok) {
      const warn = json.warnings?.length ? ` · warnings: ${json.warnings.join("; ")}` : "";
      const err = json.errors?.length ? ` · errors: ${json.errors.join("; ")}` : "";
      setAdmissionsCsvResult(
        dryRun
          ? `Preview ready: ${json.parsedCount ?? 0} valid rows${warn}${err}`
          : `Imported ${json.cutoffsUpserted ?? 0} cutoffs${warn}${err}`,
      );
      if (!dryRun) await load();
    } else {
      setAdmissionsCsvResult(json.errors?.join("; ") || json.error || "Import failed");
    }
  };

  const handleOppsCsv = async (dryRun: boolean) => {
    if (!oppsCsv.trim()) return;
    setOppsCsvResult(null);
    const res = await fetch("/api/admin/opportunities/import-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: oppsCsv, dryRun }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      parsedCount?: number;
      insertedDrafts?: number;
      scamBlocked?: number;
      errors?: string[];
      error?: string;
    };
    if (res.ok && json.ok) {
      const err = json.errors?.length ? ` · errors: ${json.errors.join("; ")}` : "";
      setOppsCsvResult(
        dryRun
          ? `Preview ready: ${json.parsedCount ?? 0} valid draft rows (scam blocked: ${json.scamBlocked ?? 0})${err}`
          : `Inserted ${json.insertedDrafts ?? 0} draft opportunities (scam blocked: ${json.scamBlocked ?? 0})${err}`,
      );
      if (!dryRun) await load();
    } else {
      setOppsCsvResult(json.errors?.join("; ") || json.error || "Import failed");
    }
  };

  if (loading) return <p className="text-start text-sm text-muted">...</p>;

  if (forbidden || !data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
        🔒 {t("forbidden")}
      </div>
    );
  }

  const allChecklistChecked =
    checks.official && checks.noFee && checks.noGuarantee && checks.iraqi && checks.deadline;

  return (
    <div className="flex flex-col gap-6">
      {/* KPI strip + manual 24h sync trigger */}
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          [t("statPublished"), data.freshness.publishedCount],
          [t("statQueue"), data.freshness.inReviewCount],
          [t("statStale"), data.freshness.staleCount],
          [t("statReports"), data.freshness.openReportsCount],
          [t("statMedianAge"), data.freshness.medianAgeDays],
        ].map(([label, val]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-surface p-4 text-start">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold text-accent">{val}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["queue", `${t("tabQueue")} (${data.queue.length})`],
              ["published", `${t("tabPublished")} (${data.published.length})`],
              ["reports", `${t("tabReports")} (${data.reports.length})`],
              ["import", t("tabImport")],
              ["phase23", t("tabPhase23")],
              ["ops", t("tabOps")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
                tab === key ? "border-accent bg-accent text-white" : "border-border bg-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={syncing}
          onClick={() => void handleRunSync()}
          className="min-h-11 rounded-lg border border-accent px-4 text-sm font-medium text-accent"
        >
          {syncing ? t("syncRunning") : `🔄 ${t("runSync")}`}
        </button>
      </div>

      {message && (
        <p className="rounded-lg border border-accent bg-surface p-3 text-start text-sm text-accent">
          {message}
        </p>
      )}

      {/* Side-by-side 4-locale Editor Drawer */}
      {editing && (
        <section className="flex flex-col gap-4 rounded-xl border-2 border-accent bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["English title", "titleEn"],
                ["Arabic title (ar)", "titleAr"],
                ["Sorani title (ckb)", "titleCkb"],
                ["Kurmanji title (kmr)", "titleKmr"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="flex flex-col gap-1 text-start text-xs">
                <span className="text-muted">{label}</span>
                <input
                  type="text"
                  value={editing[key]}
                  onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                  className="min-h-10 rounded-lg border border-border bg-bg px-3 text-sm"
                />
              </label>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-start text-xs">
              <span className="text-muted">Summary (en)</span>
              <textarea
                rows={2}
                value={editing.summaryEn}
                onChange={(e) => setEditing({ ...editing, summaryEn: e.target.value })}
                className="rounded-lg border border-border bg-bg p-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-start text-xs">
              <span className="text-muted">Summary (ar)</span>
              <textarea
                rows={2}
                value={editing.summaryAr}
                onChange={(e) => setEditing({ ...editing, summaryAr: e.target.value })}
                className="rounded-lg border border-border bg-bg p-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-start text-xs sm:col-span-2">
              <span className="text-muted">Official Source URL</span>
              <input
                type="url"
                value={editing.sourceUrl}
                onChange={(e) => setEditing({ ...editing, sourceUrl: e.target.value })}
                className="min-h-10 rounded-lg border border-border bg-bg px-3 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-start text-xs">
              <span className="text-muted">{t("iraqiEligibility")}</span>
              <select
                value={editing.iraqiEligibility}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    iraqiEligibility: e.target.value as "yes" | "no" | "unclear",
                  })
                }
                className="min-h-10 rounded-lg border border-border bg-bg px-2 text-sm"
              >
                <option value="yes">yes</option>
                <option value="unclear">unclear</option>
                <option value="no">no</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-start text-xs">
              <span className="text-muted">{t("deadlineStatus")}</span>
              <select
                value={editing.deadlineStatus}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    deadlineStatus: e.target.value as "confirmed" | "estimated" | "unknown",
                  })
                }
                className="min-h-10 rounded-lg border border-border bg-bg px-2 text-sm"
              >
                <option value="confirmed">confirmed</option>
                <option value="estimated">estimated</option>
                <option value="unknown">unknown</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-start text-xs sm:col-span-2">
              <span className="text-muted">Deadline (YYYY-MM-DD)</span>
              <input
                type="date"
                disabled={editing.rolling}
                value={editing.deadline}
                onChange={(e) => setEditing({ ...editing, deadline: e.target.value })}
                className="min-h-10 rounded-lg border border-border bg-bg px-3 text-sm"
              />
            </label>

            <label className="flex min-h-10 items-center gap-2 text-start text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={editing.rolling}
                onChange={(e) => setEditing({ ...editing, rolling: e.target.checked })}
              />
              <span>{t("rolling")}</span>
            </label>
          </div>

          {/* Structured Eligibility Rules Builder */}
          <div className="rounded-lg border border-border bg-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-xs">{t("rulesTitle")}</strong>
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    ...editing,
                    rules: [
                      ...editing.rules,
                      { field: "gpaPercent", operator: "gte", value: 75, mandatory: true },
                    ],
                  })
                }
                className="rounded border border-border bg-surface px-2 py-1 text-xs"
              >
                + {t("addRule")}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {editing.rules.map((r, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={r.field}
                    onChange={(e) => {
                      const next = [...editing.rules];
                      next[idx] = { ...r, field: e.target.value };
                      setEditing({ ...editing, rules: next });
                    }}
                    className="min-h-9 rounded border border-border bg-surface px-2"
                  >
                    <option value="gpaPercent">gpaPercent</option>
                    <option value="age">age</option>
                    <option value="educationLevel">educationLevel</option>
                    <option value="workExperienceYears">workExperienceYears</option>
                    <option value="englishScore">englishScore</option>
                    <option value="currentCountry">currentCountry</option>
                    <option value="idp">idp</option>
                  </select>
                  <select
                    value={r.operator}
                    onChange={(e) => {
                      const next = [...editing.rules];
                      next[idx] = { ...r, operator: e.target.value as RuleDto["operator"] };
                      setEditing({ ...editing, rules: next });
                    }}
                    className="min-h-9 rounded border border-border bg-surface px-2"
                  >
                    <option value="gte">gte</option>
                    <option value="lte">lte</option>
                    <option value="eq">eq</option>
                    <option value="in">in</option>
                    <option value="exists">exists</option>
                  </select>
                  <input
                    type="text"
                    value={typeof r.value === "string" ? r.value : JSON.stringify(r.value)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      let parsed: unknown = raw;
                      try {
                        parsed = JSON.parse(raw);
                      } catch {
                        parsed = raw;
                      }
                      const next = [...editing.rules];
                      next[idx] = { ...r, value: parsed };
                      setEditing({ ...editing, rules: next });
                    }}
                    className="min-h-9 w-36 rounded border border-border bg-surface px-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        rules: editing.rules.filter((_, i) => i !== idx),
                      })
                    }
                    className="min-h-9 rounded border border-border px-2 text-muted"
                  >
                    {t("removeRule")}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Safeguarding Verification Checklist */}
          <div className="grid gap-2 rounded-lg border border-border bg-bg p-3 text-start text-xs sm:grid-cols-2">
            {(
              [
                ["official", t("checklistOfficial")],
                ["noFee", t("checklistNoFee")],
                ["noGuarantee", t("checklistNoGuarantee")],
                ["iraqi", t("checklistIraqi")],
                ["deadline", t("checklistDeadline")],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checks[k]}
                  onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleReviewAction("save_draft")}
              className="min-h-11 rounded-lg border border-border bg-bg px-4 text-sm"
            >
              {t("saveDraft")}
            </button>
            <button
              type="button"
              disabled={!allChecklistChecked}
              onClick={() => void handleReviewAction("publish")}
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              ✓ {t("publishBtn")}
            </button>
            <button
              type="button"
              onClick={() => void handleReviewAction("reject")}
              className="min-h-11 rounded-lg border border-border bg-bg px-4 text-sm text-muted"
            >
              ✕ {t("rejectBtn")}
            </button>
          </div>
        </section>
      )}

      {/* Tab 1: Review Queue */}
      {tab === "queue" && (
        <div className="flex flex-col gap-3">
          {data.queue.length === 0 ? (
            <p className="text-start text-sm text-muted">{t("emptyQueue")}</p>
          ) : (
            data.queue.map(({ opportunity, rules, duplicateHints, scamWarnings }) => (
              <div
                key={opportunity.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-start"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong>
                      <bdi>{pickText(opportunity.title, locale)}</bdi>
                    </strong>
                    <p className="text-xs text-muted">
                      {opportunity.providerName} · {opportunity.status} ·{" "}
                      <a
                        href={opportunity.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {opportunity.sourceUrl}
                      </a>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setChecks({
                        official: false,
                        noFee: false,
                        noGuarantee: false,
                        iraqi: false,
                        deadline: false,
                      });
                      setEditing(toEditable(opportunity, rules));
                    }}
                    className="min-h-11 rounded-lg border border-accent px-4 text-xs font-medium text-accent"
                  >
                    {t("publishBtn")} / Edit
                  </button>
                </div>
                {duplicateHints.length > 0 && (
                  <p className="text-xs font-medium text-muted">
                    ⚠️ {t("duplicateHint")}: {duplicateHints.map((d) => pickText(d.title, locale)).join(", ")}
                  </p>
                )}
                {scamWarnings.length > 0 && (
                  <p className="text-xs font-semibold text-accent">
                    🚩 {t("scamWarning")}: {scamWarnings.join(", ")}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Published & Freshness */}
      {tab === "published" && (
        <div className="flex flex-col gap-3">
          {data.published.map(({ opportunity, rules, ageDays, isStale }) => (
            <div
              key={opportunity.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-start"
            >
              <div>
                <strong>
                  <bdi>{pickText(opportunity.title, locale)}</bdi>
                </strong>
                <p className="text-xs text-muted">
                  {opportunity.providerName} · {ageDays}d {isStale ? "⚠️ stale" : ""}{" "}
                  {opportunity.hiddenAt ? "· 🔒 hidden" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleQuickAction(opportunity.id, "mark_checked")}
                  className="min-h-10 rounded-lg border border-border bg-bg px-3 text-xs"
                >
                  ✓ {t("markChecked")}
                </button>
                {opportunity.hiddenAt && (
                  <button
                    type="button"
                    onClick={() => void handleQuickAction(opportunity.id, "unhide")}
                    className="min-h-10 rounded-lg border border-accent px-3 text-xs text-accent"
                  >
                    {t("unhideBtn")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setChecks({
                      official: true,
                      noFee: true,
                      noGuarantee: true,
                      iraqi: true,
                      deadline: true,
                    });
                    setEditing(toEditable(opportunity, rules));
                  }}
                  className="min-h-10 rounded-lg border border-border bg-bg px-3 text-xs"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Open Reports */}
      {tab === "reports" && (
        <div className="flex flex-col gap-3">
          {data.reports.length === 0 ? (
            <p className="text-start text-sm text-muted">{t("emptyQueue")}</p>
          ) : (
            data.reports.map(({ report, opportunityTitle, hiddenAt }) => (
              <div
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-start"
              >
                <div>
                  <strong>
                    <bdi>{pickText(opportunityTitle, locale)}</bdi>
                  </strong>
                  <p className="text-xs text-muted">
                    {report.reason} {report.note ? `— ${report.note}` : ""} {hiddenAt ? "· auto-hidden" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleResolveReport(report.id, "dismiss")}
                    className="min-h-10 rounded-lg border border-border bg-bg px-3 text-xs"
                  >
                    {t("dismissReport")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResolveReport(report.id, "remove_listing")}
                    className="min-h-10 rounded-lg bg-accent px-3 text-xs text-white"
                  >
                    {t("removeListing")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: CSV Import (Admissions Cutoffs & Bulk Draft Opportunities) */}
      {tab === "import" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-start">
            <h2 className="text-sm font-bold">{t("importAdmissionsTitle")}</h2>
            <p className="text-xs text-muted">{t("importAdmissionsHint")}</p>
            <textarea
              rows={6}
              value={admissionsCsv}
              onChange={(e) => setAdmissionsCsv(e.target.value)}
              placeholder="external_key,system,year,governorate,university_ar,university_en,college_ar,college_en,department_ar,department_en,stream,gender,study_type,channel,min_average,source_url,confidence"
              className="rounded-lg border border-border bg-bg p-2 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleAdmissionsCsv(true)}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-xs font-medium"
              >
                {t("previewCsv")}
              </button>
              <button
                type="button"
                onClick={() => void handleAdmissionsCsv(false)}
                className="min-h-11 rounded-lg bg-accent px-4 text-xs font-medium text-white"
              >
                {t("confirmImport")}
              </button>
            </div>
            {admissionsCsvResult && <p className="text-xs text-accent">{admissionsCsvResult}</p>}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-start">
            <h2 className="text-sm font-bold">{t("importOppsTitle")}</h2>
            <p className="text-xs text-muted">{t("importOppsHint")}</p>
            <textarea
              rows={6}
              value={oppsCsv}
              onChange={(e) => setOppsCsv(e.target.value)}
              placeholder="type,title_en,title_ar,provider_name,source_url,summary_en,deadline,rolling,iraqi_eligibility"
              className="rounded-lg border border-border bg-bg p-2 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleOppsCsv(true)}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-xs font-medium"
              >
                {t("previewCsv")}
              </button>
              <button
                type="button"
                onClick={() => void handleOppsCsv(false)}
                className="min-h-11 rounded-lg bg-accent px-4 text-xs font-medium text-white"
              >
                {t("confirmImport")}
              </button>
            </div>
            {oppsCsvResult && <p className="text-xs text-accent">{oppsCsvResult}</p>}
          </section>
        </div>
      )}

      {/* Tab 5: Phase 2/3 Operations (Helpers, Sponsors, Community Moderation) */}
      {tab === "phase23" && <AdminPhase23Panel />}

      {/* Tab 6: Ingestion Sources & Audit Log */}
      {tab === "ops" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-border bg-surface p-4 text-start">
            <h2 className="mb-3 text-sm font-bold">{t("sourcesTitle")}</h2>
            <ul className="flex flex-col gap-2 text-xs">
              {data.sources.map((s) => (
                <li key={s.id} className="rounded-lg border border-border bg-bg p-2">
                  <strong>{s.name}</strong> ({s.tier}) · failures: {s.consecutiveFailures}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-border bg-surface p-4 text-start">
            <h2 className="mb-3 text-sm font-bold">{t("auditTitle")}</h2>
            <ul className="flex flex-col gap-2 text-xs">
              {data.audit.map((a) => (
                <li key={a.id} className="rounded-lg border border-border bg-bg p-2">
                  <strong>{a.action}</strong> · {a.entity} · {new Date(a.at).toISOString().slice(0, 16)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
