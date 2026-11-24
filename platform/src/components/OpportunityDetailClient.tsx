"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";

interface MatchReasonDto {
  field: string;
  outcome: "pass" | "fail" | "unknown";
  mandatory: boolean;
  code: string;
  explanation?: Record<string, string | undefined> | null;
}

export interface OpportunityDetailProps {
  locale: Locale;
  opportunity: {
    id: string;
    type: string;
    title: Record<string, string | undefined>;
    summary?: Record<string, string | undefined> | null;
    notes?: Record<string, string | undefined> | null;
    requiredDocuments?: Record<string, string | undefined> | null;
    languageRequirements?: Record<string, string | undefined> | null;
    providerName: string;
    sourceUrl: string;
    applyUrl?: string | null;
    deadline?: string | null;
    deadlineStatus: string;
    rolling: boolean;
    iraqiEligibility: "yes" | "no" | "unclear";
    fundingType?: string | null;
    verifiedAt?: string | null;
    lastCheckedAt?: string | null;
  };
  match: {
    verdict: "GO" | "MAYBE" | "NO_GO";
    reasons: MatchReasonDto[];
    missing: string[];
  } | null;
  expired: boolean;
  similar: {
    id: string;
    title: Record<string, string | undefined>;
    providerName: string;
    deadline?: string | null;
    rolling: boolean;
  }[];
}

export function OpportunityDetailClient({
  locale,
  opportunity,
  match,
  expired,
  similar,
}: OpportunityDetailProps) {
  const t = useTranslations("Opportunities");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reason, setReason] = useState<"scam" | "expired" | "wrong_info" | "other">("wrong_info");
  const [note, setNote] = useState("");
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const title = pickText(opportunity.title, locale);
  const summary = pickText(opportunity.summary, locale);
  const notes = pickText(opportunity.notes, locale);
  const requiredDocs = pickText(opportunity.requiredDocuments, locale);
  const languageReqs = pickText(opportunity.languageRequirements, locale);

  const formattedDeadline = opportunity.rolling
    ? t("rollingLabel")
    : opportunity.deadline
      ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Asia/Baghdad" }).format(
          new Date(opportunity.deadline),
        )
      : "—";

  const verifiedDate = opportunity.lastCheckedAt || opportunity.verifiedAt;
  const formattedVerified = verifiedDate
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Baghdad" }).format(
        new Date(verifiedDate),
      )
    : null;

  const handleSave = async () => {
    const res = await fetch("/api/tracker", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: opportunity.id, state: "saved" }),
    });
    if (res.ok) setSaved(true);
  };

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    await navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportMsg(null);
    const res = await fetch(`/api/opportunities/${opportunity.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, note }),
    });
    if (res.ok) {
      setNote("");
      setReportMsg(t("reportSent"));
    } else if (res.status === 409) {
      setReportMsg(t("reportDuplicate"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/opportunities" className="text-start text-sm text-accent hover:underline">
        ← {t("backToFeed")}
      </Link>

      {expired && (
        <div className="rounded-xl border-s-4 border-accent bg-surface p-4 text-start text-sm font-medium">
          ⚠️ {t("detailExpired")}
        </div>
      )}

      <article className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-start text-2xl font-bold">
              <bdi>{title}</bdi>
            </h1>
            <p className="mt-1 text-start text-sm text-muted">{opportunity.providerName}</p>
          </div>
          {match && (
            <span className="rounded-full border border-accent px-3 py-1 text-xs font-semibold text-accent">
              {match.verdict === "GO"
                ? t("verdictGo")
                : match.verdict === "MAYBE"
                  ? t("verdictMaybe")
                  : t("verdictNoGo")}
            </span>
          )}
        </div>

        <div className="rounded-lg border border-border bg-bg p-3 text-start text-sm font-medium">
          {opportunity.iraqiEligibility === "yes"
            ? `✓ ${t("iraqiYes")}`
            : opportunity.iraqiEligibility === "no"
              ? `✕ ${t("iraqiNo")}`
              : `? ${t("iraqiUnclear")}`}
        </div>

        {summary && <p className="text-start text-sm">{summary}</p>}
        {notes && <p className="text-start text-sm text-muted">{notes}</p>}

        {match && match.reasons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {match.reasons.map((r, idx) => (
              <span
                key={`${r.code}-${idx}`}
                className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
              >
                {r.outcome === "pass" ? "✓" : r.outcome === "fail" ? "✕" : "?"}{" "}
                {pickText(r.explanation, locale) || r.code}
              </span>
            ))}
          </div>
        )}

        <div className="grid gap-3 border-t border-border pt-4 text-start text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted">{t("deadlineLabel")}: </span>
            <strong>{formattedDeadline}</strong>
          </div>
          {formattedVerified && (
            <div>
              <span className="text-muted">{t("lastVerified")}: </span>
              <strong>{formattedVerified}</strong>
            </div>
          )}
          {requiredDocs && (
            <div className="sm:col-span-2">
              <p className="font-semibold">{t("requiredDocs")}</p>
              <p className="text-muted">{requiredDocs}</p>
            </div>
          )}
          {languageReqs && (
            <div className="sm:col-span-2">
              <p className="font-semibold">{t("languageReqs")}</p>
              <p className="text-muted">{languageReqs}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <a
            href={opportunity.applyUrl || opportunity.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white"
          >
            {t("applyButton")}
          </a>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="min-h-11 rounded-lg border border-border bg-bg px-4 text-sm font-medium"
          >
            {saved ? `★ ${t("savedLabel")}` : `☆ ${t("saveButton")}`}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="min-h-11 rounded-lg border border-border bg-bg px-4 text-sm font-medium"
          >
            {copied ? t("linkCopied") : t("copyLink")}
          </button>
        </div>
      </article>

      {similar.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-start text-lg font-bold">{t("similarTitle")}</h2>
          <div className="flex flex-col gap-2">
            {similar.map((s) => (
              <Link
                key={s.id}
                href={`/opportunities/${s.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg p-3 text-sm hover:border-accent"
              >
                <span className="font-medium">
                  <bdi>{pickText(s.title, locale)}</bdi>
                </span>
                <span className="text-xs text-muted">{s.providerName}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-start text-base font-bold">{t("reportTitle")}</h2>
        <form onSubmit={handleReport} className="flex flex-col gap-3">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
          >
            <option value="scam">{t("reportReasonScam")}</option>
            <option value="expired">{t("reportReasonExpired")}</option>
            <option value="wrong_info">{t("reportReasonWrong")}</option>
            <option value="other">{t("reportReasonOther")}</option>
          </select>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("reportNotePlaceholder")}
            className="rounded-lg border border-border bg-bg p-3 text-sm"
          />
          <div>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-border bg-bg px-4 text-sm font-medium"
            >
              {t("reportSubmit")}
            </button>
          </div>
          {reportMsg && <p className="text-start text-sm text-accent">{reportMsg}</p>}
        </form>
      </section>
    </div>
  );
}
