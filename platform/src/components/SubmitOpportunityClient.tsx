"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function SubmitOpportunityClient({ locale }: { locale: "ar" | "ckb" | "kmr" | "en" }) {
  const t = useTranslations("Submit");
  const tOpp = useTranslations("Opportunities");
  const [title, setTitle] = useState("");
  const [providerName, setProviderName] = useState("");
  const [type, setType] = useState("scholarship");
  const [sourceUrl, setSourceUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [rolling, setRolling] = useState(false);
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<"idle" | "done" | "scam" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("idle");
    const res = await fetch("/api/opportunities/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        title,
        providerName,
        sourceUrl,
        deadline: rolling ? "" : deadline,
        rolling,
        summary,
        locale,
      }),
    });
    if (res.ok) {
      setStatus("done");
      setTitle("");
      setProviderName("");
      setSourceUrl("");
      setDeadline("");
      setRolling(false);
      setSummary("");
    } else if (res.status === 422) {
      setStatus("scam");
    } else {
      setStatus("error");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
    >
      <label className="flex flex-col gap-1 text-start text-sm">
        <span>{t("titleLabel")}</span>
        <input
          type="text"
          required
          minLength={4}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-11 rounded-lg border border-border bg-bg px-3"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("providerLabel")}</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={200}
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          />
        </label>

        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("typeLabel")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          >
            <option value="scholarship">{tOpp("typeScholarship")}</option>
            <option value="exchange">{tOpp("typeExchange")}</option>
            <option value="fellowship">{tOpp("typeFellowship")}</option>
            <option value="training">{tOpp("typeTraining")}</option>
            <option value="internship">{tOpp("typeInternship")}</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-start text-sm">
        <span>{t("sourceUrlLabel")}</span>
        <input
          type="url"
          required
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          className="min-h-11 rounded-lg border border-border bg-bg px-3"
        />
      </label>

      <div className="grid items-end gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-start text-sm">
          <span>{t("deadlineLabel")}</span>
          <input
            type="date"
            disabled={rolling}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3"
          />
        </label>

        <label className="flex min-h-11 items-center gap-2 text-start text-sm">
          <input type="checkbox" checked={rolling} onChange={(e) => setRolling(e.target.checked)} />
          <span>{t("rollingLabel")}</span>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-start text-sm">
        <span>{t("summaryLabel")}</span>
        <textarea
          rows={3}
          maxLength={1000}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="rounded-lg border border-border bg-bg p-3"
        />
      </label>

      <div>
        <button type="submit" className="min-h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white">
          {t("submitBtn")}
        </button>
      </div>

      {status === "done" && (
        <p className="rounded-lg border border-accent bg-bg p-3 text-start text-sm text-accent">
          ✓ {t("submittedMsg")}
        </p>
      )}
      {status === "scam" && (
        <p className="rounded-lg border border-border bg-bg p-3 text-start text-sm font-medium">
          ⚠️ {t("scamBlockedMsg")}
        </p>
      )}
    </form>
  );
}
