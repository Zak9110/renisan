"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface UserDto {
  id: string;
  email: string | null;
  phoneE164: string | null;
  birthYear: number | null;
  isMinor: boolean;
  profile: {
    educationLevel: "grade12" | "undergrad" | "graduate" | "other";
    fieldOfStudy: string | null;
    gpaPercent: number | null;
    workExperienceYears: number | null;
  } | null;
}

export function AccountClient({ locale }: { locale: string }) {
  const t = useTranslations("Account");
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [eduLevel, setEduLevel] = useState<"grade12" | "undergrad" | "graduate" | "other">("grade12");
  const [gpa, setGpa] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [workExp, setWorkExp] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");

  const applyUserData = useCallback((u: UserDto | null) => {
    setUser(u);
    if (u) {
      setBirthYear(u.birthYear ? String(u.birthYear) : "");
      if (u.profile) {
        setEduLevel(u.profile.educationLevel);
        setGpa(u.profile.gpaPercent != null ? String(u.profile.gpaPercent) : "");
        setWorkExp(u.profile.workExperienceYears != null ? String(u.profile.workExperienceYears) : "");
        setFieldOfStudy(u.profile.fieldOfStudy ?? "");
      }
    }
  }, []);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = (await res.json()) as { user: UserDto | null };
      applyUserData(data.user);
    }
    setLoading(false);
  }, [applyUserData]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? (res.json() as Promise<{ user: UserDto | null }>) : null))
      .then((data) => {
        if (!active) return;
        if (data) applyUserData(data.user);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyUserData]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, target }),
    });
    const data = (await res.json()) as { ok?: boolean; devCode?: string; error?: string };
    if (res.ok && data.ok) {
      setStep("verify");
      setDevCode(data.devCode ?? null);
    } else {
      setStatusMsg(data.error ?? "Error");
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, target, code, locale }),
    });
    if (res.ok) {
      setCode("");
      setDevCode(null);
      setStep("request");
      await loadMe();
    } else {
      const data = (await res.json()) as { error?: string };
      setStatusMsg(data.error ?? "Invalid code");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        educationLevel: eduLevel,
        gpaPercent: gpa ? Number(gpa) : null,
        birthYear: birthYear ? Number(birthYear) : null,
        workExperienceYears: workExp ? Number(workExp) : null,
        fieldOfStudy: fieldOfStudy.trim() || null,
      }),
    });
    if (res.ok) {
      setStatusMsg(t("profileSaved"));
      await loadMe();
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  const handleExport = async () => {
    const res = await fetch("/api/account/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "renisan-account-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    await fetch("/api/account", { method: "DELETE" });
    setUser(null);
  };

  if (loading) return <p className="text-start text-sm text-muted">...</p>;

  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setChannel("email")}
            className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
              channel === "email" ? "border-accent bg-accent text-white" : "border-border bg-bg"
            }`}
          >
            {t("channelEmail")}
          </button>
          <button
            type="button"
            onClick={() => setChannel("sms")}
            className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
              channel === "sms" ? "border-accent bg-accent text-white" : "border-border bg-bg"
            }`}
          >
            {t("channelSms")}
          </button>
        </div>

        {step === "request" ? (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-3">
            <input
              type="text"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={t("targetPlaceholder")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white"
            >
              {t("sendCode")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
            {devCode && (
              <p className="rounded-md border border-accent bg-bg p-3 text-start text-sm">
                {t("devCodeNotice")} <strong>{devCode}</strong>
              </p>
            )}
            <input
              type="text"
              inputMode="numeric"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("codePlaceholder")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white"
            >
              {t("verifyCode")}
            </button>
          </form>
        )}

        {statusMsg && <p className="mt-3 text-start text-sm text-accent">{statusMsg}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5">
        <div className="text-start">
          <p className="text-sm text-muted">{t("signedInAs")}</p>
          <strong>{user.email || user.phoneE164 || user.id}</strong>
          {user.isMinor && <p className="mt-1 text-xs font-medium text-accent">🛡️ {t("minorBadge")}</p>}
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="min-h-11 rounded-lg border border-border px-4 text-sm"
        >
          {t("logout")}
        </button>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-start text-lg font-bold">{t("profileTitle")}</h2>
        <form onSubmit={handleSaveProfile} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-start text-sm">
            <span>{t("educationLevel")}</span>
            <select
              value={eduLevel}
              onChange={(e) => setEduLevel(e.target.value as "grade12" | "undergrad" | "graduate" | "other")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            >
              <option value="grade12">{t("levelGrade12")}</option>
              <option value="undergrad">{t("levelUndergrad")}</option>
              <option value="graduate">{t("levelGraduate")}</option>
              <option value="other">{t("levelOther")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-start text-sm">
            <span>{t("gpaLabel")}</span>
            <input
              type="number"
              min={0}
              max={110}
              step="0.1"
              value={gpa}
              onChange={(e) => setGpa(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-start text-sm">
            <span>{t("birthYearLabel")}</span>
            <input
              type="number"
              min={1940}
              max={2025}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-start text-sm">
            <span>{t("workExpLabel")}</span>
            <input
              type="number"
              min={0}
              max={40}
              value={workExp}
              onChange={(e) => setWorkExp(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-start text-sm sm:col-span-2">
            <span>{t("fieldLabel")}</span>
            <input
              type="text"
              value={fieldOfStudy}
              onChange={(e) => setFieldOfStudy(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white"
            >
              {t("saveProfile")}
            </button>
          </div>
        </form>
        {statusMsg && <p className="mt-3 text-start text-sm text-accent">{statusMsg}</p>}
      </section>

      <section className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleExport()}
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm"
        >
          {t("exportData")}
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm text-muted"
        >
          {t("deleteAccount")}
        </button>
      </section>
    </div>
  );
}
