"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";

interface MatchReasonDto {
  field: string;
  outcome: "pass" | "fail" | "unknown";
  mandatory: boolean;
  code: string;
  explanation?: Record<string, string | undefined> | null;
}

interface OpportunityItemDto {
  opportunity: {
    id: string;
    type: string;
    title: Record<string, string | undefined>;
    summary?: Record<string, string | undefined> | null;
    providerName: string;
    sourceUrl: string;
    applyUrl?: string | null;
    deadline?: string | null;
    deadlineStatus: string;
    rolling: boolean;
    iraqiEligibility: string;
    fundingType?: string | null;
  };
  match: {
    verdict: "GO" | "MAYBE" | "NO_GO";
    reasons: MatchReasonDto[];
    missing: string[];
  } | null;
}

export function OpportunitiesFeedClient({ locale }: { locale: Locale }) {
  const t = useTranslations("Opportunities");
  const [items, setItems] = useState<OpportunityItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState<"all" | "go" | "go_maybe">("all");
  const [guestLevel, setGuestLevel] = useState("");
  const [guestGpa, setGuestGpa] = useState("");
  const [guestBirthYear, setGuestBirthYear] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (typeFilter) params.set("type", typeFilter);
    if (eligibleOnly !== "all") params.set("eligibleOnly", eligibleOnly);
    if (guestLevel) params.set("educationLevel", guestLevel);
    if (guestGpa) params.set("gpaPercent", guestGpa);
    if (guestBirthYear) params.set("birthYear", guestBirthYear);

    fetch(`/api/opportunities?${params.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ items: OpportunityItemDto[] }>) : null))
      .then((data) => {
        if (!active) return;
        if (data) setItems(data.items);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [q, typeFilter, eligibleOnly, guestLevel, guestGpa, guestBirthYear]);

  const handleSave = async (opportunityId: string) => {
    setNotice(null);
    const res = await fetch("/api/tracker", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId, state: "saved" }),
    });
    if (res.status === 401) {
      setNotice(t("signInToSave"));
      return;
    }
    if (res.ok) {
      setSavedIds((prev) => new Set([...prev, opportunityId]));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-start text-sm text-muted">{t("guestHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            value={guestLevel}
            onChange={(e) => setGuestLevel(e.target.value)}
            aria-label={t("levelLabel")}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
          >
            <option value="">{t("levelLabel")}</option>
            <option value="grade12">Grade 12</option>
            <option value="undergrad">Undergraduate</option>
            <option value="graduate">Graduate</option>
          </select>
          <input
            type="number"
            min={0}
            max={110}
            step="0.1"
            value={guestGpa}
            onChange={(e) => setGuestGpa(e.target.value)}
            placeholder={t("gpaPlaceholder")}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
          />
          <input
            type="number"
            min={1950}
            max={2020}
            value={guestBirthYear}
            onChange={(e) => setGuestBirthYear(e.target.value)}
            placeholder={t("birthYearPlaceholder")}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "go", "go_maybe"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setEligibleOnly(mode)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                eligibleOnly === mode ? "border-accent bg-accent text-white" : "border-border bg-bg text-text"
              }`}
            >
              {mode === "all" ? t("eligibleAll") : mode === "go" ? t("eligibleGo") : t("eligibleGoMaybe")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label={t("filterType")}
          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm"
        >
          <option value="">
            {t("filterType")}: {t("filterAll")}
          </option>
          <option value="scholarship">{t("typeScholarship")}</option>
          <option value="exchange">{t("typeExchange")}</option>
          <option value="fellowship">{t("typeFellowship")}</option>
          <option value="training">{t("typeTraining")}</option>
          <option value="internship">{t("typeInternship")}</option>
        </select>
      </div>

      {notice && (
        <p className="rounded-lg border border-accent bg-surface p-3 text-start text-sm text-accent">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="text-start text-sm text-muted">...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
          {t("empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map(({ opportunity, match }) => {
            const title = pickText(opportunity.title, locale);
            const summary = pickText(opportunity.summary, locale);
            const isSaved = savedIds.has(opportunity.id);
            const formattedDeadline = opportunity.rolling
              ? t("rollingLabel")
              : opportunity.deadline
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeZone: "Asia/Baghdad",
                  }).format(new Date(opportunity.deadline))
                : "—";

            return (
              <article
                key={opportunity.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-start text-lg font-bold">
                      <bdi>{title}</bdi>
                    </h2>
                    <p className="text-start text-sm text-muted">{opportunity.providerName}</p>
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

                {summary && <p className="text-start text-sm text-muted">{summary}</p>}

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

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                  <span>
                    {t("deadlineLabel")}: <strong>{formattedDeadline}</strong>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSave(opportunity.id)}
                      className="min-h-11 rounded-lg border border-border bg-bg px-4 text-sm font-medium"
                    >
                      {isSaved ? `★ ${t("savedLabel")}` : `☆ ${t("saveButton")}`}
                    </button>
                    <a
                      href={opportunity.applyUrl || opportunity.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white"
                    >
                      {t("applyButton")}
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
