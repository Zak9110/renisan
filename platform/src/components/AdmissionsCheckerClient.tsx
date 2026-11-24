"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";

interface I18nMap {
  ar?: string;
  ckb?: string;
  kmr?: string;
  en?: string;
}

interface AdmissionItemDto {
  cutoffId: string;
  departmentId: string;
  college: I18nMap | null;
  department: I18nMap;
  system: "federal" | "krg" | "private";
  year: number;
  stream: string;
  gender: string;
  studyType: string;
  channel: string;
  minAverage: number;
  margin: number;
  band: "safe" | "target" | "reach";
  confidence: "high" | "medium" | "low";
  sourceUrl: string;
  sourceDate: string | null;
}

interface UniversityGroupDto {
  universityId: string;
  name: I18nMap;
  system: "federal" | "krg" | "private";
  governorate: string | null;
  items: AdmissionItemDto[];
}

interface AdmissionsResponseDto {
  counts: { safe: number; target: number; reach: number };
  totalMatches: number;
  totalUniversities: number;
  groups: UniversityGroupDto[];
  meta: {
    years: number[];
    governorates: string[];
  };
}

export function AdmissionsCheckerClient({ locale }: { locale: Locale }) {
  const t = useTranslations("Admissions");

  const [average, setAverage] = useState("92");
  const [system, setSystem] = useState<"all" | "federal" | "krg">("all");
  const [stream, setStream] = useState("scientific");
  const [governorate, setGovernorate] = useState("all");
  const [gender, setGender] = useState<"both" | "male" | "female">("both");
  const [studyType, setStudyType] = useState("all");
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [includeReach, setIncludeReach] = useState(false);

  const [data, setData] = useState<AdmissionsResponseDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const avgNum = Number(average);
    const validAvg = Number.isFinite(avgNum) && avgNum >= 0 && avgNum <= 115 ? avgNum : 90;

    const params = new URLSearchParams({
      average: String(validAvg),
      system,
      stream,
      governorate,
      gender,
      studyType,
      channel,
      locale,
      includeReach: includeReach ? "1" : "0",
    });
    if (query.trim()) params.set("q", query.trim());

    const timer = setTimeout(() => {
      fetch(`/api/admissions?${params.toString()}`)
        .then((res) => (res.ok ? (res.json() as Promise<AdmissionsResponseDto>) : null))
        .then((json) => {
          if (!active) return;
          setData(json);
          setLoading(false);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [average, system, stream, governorate, gender, studyType, channel, query, includeReach, locale]);

  const label = (prefix: string, value: string) => {
    const key = `${prefix}${value.charAt(0).toUpperCase()}${value.slice(1)}`;
    return t.has(key) ? t(key) : value;
  };
  // Sub-streams arrive as "scientific-applied"
  const streamLabel = (v: string) =>
    v
      .split("-")
      .map((p) => label("stream", p))
      .join(" / ");
  const studyLabel = (v: string) => label("study", v);
  const channelLabel = (v: string) => label("channel", v);

  const confidenceLabel = (c: "high" | "medium" | "low") => {
    if (c === "high") return t("confidenceHigh");
    if (c === "medium") return t("confidenceMedium");
    return t("confidenceLow");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Hard-rule prominent indicative-only disclaimer */}
      <div
        role="note"
        className="rounded-xl border-s-4 border-accent bg-surface p-4 text-start text-sm font-medium"
      >
        ⚠️ {t("indicativeNotice")}
      </div>

      {/* Collapsible Federal vs KRG system explainer + official portal links */}
      <details className="rounded-xl border border-border bg-surface p-4 text-start text-sm">
        <summary className="cursor-pointer font-semibold text-accent">{t("explainerTitle")}</summary>
        <div className="mt-3 flex flex-col gap-2 text-xs text-muted">
          <p>{t("explainerFederal")}</p>
          <p>{t("explainerKrg")}</p>
          <div className="mt-1 flex flex-wrap gap-3">
            <a
              href="https://dirasat.mohesr.gov.iq/download-center.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-accent"
            >
              dirasat.mohesr.gov.iq ↗
            </a>
            <a
              href="https://gov.krd/mohe"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-accent"
            >
              gov.krd/mohe ↗
            </a>
          </div>
        </div>
      </details>

      {/* No-login filter form */}
      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-start text-sm">
          <span className="font-medium">{t("averageLabel")}</span>
          <input
            type="number"
            min={40}
            max={110}
            step="0.01"
            value={average}
            onChange={(e) => setAverage(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base font-bold"
          />
        </label>

        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("systemLabel")}</span>
          <select
            value={system}
            onChange={(e) => setSystem(e.target.value as "all" | "federal" | "krg")}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          >
            <option value="all">{t("systemAll")}</option>
            <option value="federal">{t("systemFederal")}</option>
            <option value="krg">{t("systemKrg")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("streamLabel")}</span>
          <select
            value={stream}
            onChange={(e) => setStream(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          >
            <option value="all">{t("streamAll")}</option>
            <option value="scientific">{t("streamScientific")}</option>
            <option value="literary">{t("streamLiterary")}</option>
            <option value="applied">{t("streamApplied")}</option>
            <option value="vocational">{t("streamVocational")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("governorateLabel")}</span>
          <select
            value={governorate}
            onChange={(e) => setGovernorate(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          >
            <option value="all">{t("allGovernorates")}</option>
            {(data?.meta.governorates ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("studyTypeLabel")}</span>
          <select
            value={studyType}
            onChange={(e) => setStudyType(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          >
            <option value="all">{t("studyAll")}</option>
            <option value="morning">{t("studyMorning")}</option>
            <option value="parallel">{t("studyParallel")}</option>
            <option value="evening">{t("studyEvening")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("channelLabel")}</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          >
            <option value="all">{t("channelAll")}</option>
            <option value="general">{t("channelGeneral")}</option>
            <option value="distinguished">{t("channelDistinguished")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("genderLabel")}</span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as "both" | "male" | "female")}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          >
            <option value="both">{t("genderBoth")}</option>
            <option value="male">{t("genderMale")}</option>
            <option value="female">{t("genderFemale")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-start text-sm sm:col-span-2">
          <span className="sr-only">{t("searchPlaceholder")}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="mt-auto min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
          />
        </label>

        <label className="flex min-h-11 items-center gap-2 text-start text-sm sm:col-span-3">
          <input type="checkbox" checked={includeReach} onChange={(e) => setIncludeReach(e.target.checked)} />
          <span>{t("includeReach")}</span>
        </label>
      </section>

      {/* Band summary counters */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4 text-start">
            <p className="text-xs text-muted">{t("bandSafe")}</p>
            <p className="mt-1 text-2xl font-bold text-accent">{data.counts.safe}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 text-start">
            <p className="text-xs text-muted">{t("bandTarget")}</p>
            <p className="mt-1 text-2xl font-bold">{data.counts.target}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 text-start">
            <p className="text-xs text-muted">{t("bandReach")}</p>
            <p className="mt-1 text-2xl font-bold text-muted">{data.counts.reach}</p>
          </div>
        </div>
      )}

      {/* Results grouped by university */}
      {loading ? (
        <p className="text-start text-sm text-muted">...</p>
      ) : !data || data.groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
          {t("emptyResults")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.groups.map((group) => (
            <section
              key={group.universityId}
              className="rounded-xl border border-border bg-surface p-4 text-start"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <div>
                  <h2 className="text-base font-bold">
                    <bdi>{pickText(group.name, locale)}</bdi>
                  </h2>
                  <p className="text-xs text-muted">
                    {group.system === "krg"
                      ? t("systemKrg")
                      : group.system === "federal"
                        ? t("systemFederal")
                        : group.system}
                    {group.governorate ? ` · ${group.governorate}` : ""} · {group.items.length}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {group.items.slice(0, 30).map((item) => (
                  <div
                    key={item.cutoffId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg p-3 text-xs"
                  >
                    <div className="flex flex-col gap-1">
                      <strong className="text-sm">
                        <bdi>{pickText(item.department, locale)}</bdi>
                      </strong>
                      {item.college && (
                        <span className="text-muted">
                          <bdi>{pickText(item.college, locale)}</bdi>
                        </span>
                      )}
                      <span className="text-muted">
                        {item.year} · {streamLabel(item.stream)} · {studyLabel(item.studyType)} ·{" "}
                        {channelLabel(item.channel)} ·{" "}
                        <span className="font-medium text-text">{confidenceLabel(item.confidence)}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-end">
                        <p className="text-muted">{t("cutoffLabel")}</p>
                        <p className="text-base font-bold">{item.minAverage.toFixed(2)}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 font-semibold ${
                          item.band === "safe"
                            ? "bg-accent text-white"
                            : item.band === "target"
                              ? "border border-accent text-accent"
                              : "border border-border text-muted"
                        }`}
                      >
                        {t("marginLabel")}:{" "}
                        {item.margin >= 0 ? `+${item.margin.toFixed(2)}` : item.margin.toFixed(2)}
                      </span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 underline"
                      >
                        {t("sourceLink")} ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
