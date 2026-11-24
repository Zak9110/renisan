"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface UserDto {
  id: string;
  role: "member" | "helper" | "editor" | "admin";
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

interface NotificationSettingsDto {
  digestFrequency: "daily" | "weekly" | "off";
  deadlineReminders: boolean;
  quietStart: number;
  quietEnd: number;
  telegram: {
    linked: boolean;
    active: boolean;
    linkedAt: string | null;
    stoppedAt: string | null;
  };
}

/** Shared phones are common: never leave one user's offline data for the next. */
async function clearOfflineData() {
  try {
    await caches.delete("renisan-data-v1");
  } catch {
    // Cache Storage is unavailable in private contexts
  }
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

  // M4 Telegram alerts & notification prefs
  const [notif, setNotif] = useState<NotificationSettingsDto | null>(null);
  const [digestFreq, setDigestFreq] = useState<"daily" | "weekly" | "off">("weekly");
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(8);
  const [linkCode, setLinkCode] = useState<{ code: string; deepLink: string | null } | null>(null);
  const [alertStatus, setAlertStatus] = useState<string | null>(null);

  const applyNotif = useCallback((s: NotificationSettingsDto | null) => {
    setNotif(s);
    if (s) {
      setDigestFreq(s.digestFrequency);
      setDeadlineReminders(s.deadlineReminders);
      setQuietStart(s.quietStart);
      setQuietEnd(s.quietEnd);
    }
  }, []);

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
      if (data.user) {
        const prefRes = await fetch("/api/notifications/prefs");
        if (prefRes.ok) {
          applyNotif((await prefRes.json()) as NotificationSettingsDto);
        }
      } else {
        applyNotif(null);
      }
    }
    setLoading(false);
  }, [applyNotif, applyUserData]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? (res.json() as Promise<{ user: UserDto | null }>) : null))
      .then(async (data) => {
        if (!active) return;
        if (data) {
          applyUserData(data.user);
          if (data.user) {
            const prefRes = await fetch("/api/notifications/prefs");
            if (active && prefRes.ok) {
              applyNotif((await prefRes.json()) as NotificationSettingsDto);
            }
          }
        }
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyNotif, applyUserData]);

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
    } else if (res.status === 409) {
      setStatusMsg(t("birthYearLocked"));
    }
  };

  const handleGenerateTelegramCode = async () => {
    setAlertStatus(null);
    const res = await fetch("/api/telegram/link-code", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { code: string; deepLink: string | null };
      setLinkCode(data);
    }
  };

  const handleUnlinkTelegram = async () => {
    setAlertStatus(null);
    const res = await fetch("/api/telegram/link-code", { method: "DELETE" });
    if (res.ok) {
      setLinkCode(null);
      await loadMe();
    }
  };

  const handleSaveAlertPrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertStatus(null);
    const res = await fetch("/api/notifications/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        digestFrequency: digestFreq,
        deadlineReminders,
        quietStart,
        quietEnd,
      }),
    });
    if (res.ok) {
      applyNotif((await res.json()) as NotificationSettingsDto);
      setAlertStatus(t("alertPrefsSaved"));
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await clearOfflineData();
    setUser(null);
    setNotif(null);
    setLinkCode(null);
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
    await clearOfflineData();
    setUser(null);
    setNotif(null);
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
              <p
                className="rounded-md border border-accent bg-bg p-3 text-start text-sm"
                data-testid="dev-otp"
              >
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
          {(user.role === "editor" || user.role === "admin") && (
            <p className="mt-2">
              <Link
                href="/admin"
                className="inline-flex min-h-11 items-center rounded-md border border-accent px-3 text-xs font-medium text-accent"
              >
                {t("editorConsoleLink")}
              </Link>
            </p>
          )}
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

      {/* M4 Telegram Alerts & Notification Preferences */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-start text-lg font-bold">{t("alertsTitle")}</h2>
        <p className="mt-1 text-start text-xs text-muted">{t("alertsSubtitle")}</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-3 text-start text-sm">
          <span>
            {notif?.telegram.active
              ? `✅ ${t("telegramLinked")}`
              : notif?.telegram.linked
                ? `⏸️ ${t("telegramStopped")}`
                : `💬 ${t("telegramNotLinked")}`}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleGenerateTelegramCode()}
              className="min-h-11 rounded-lg bg-accent px-4 text-xs font-medium text-white"
            >
              {t("generateLinkCode")}
            </button>
            {notif?.telegram.linked && (
              <button
                type="button"
                onClick={() => void handleUnlinkTelegram()}
                className="min-h-11 rounded-lg border border-border bg-surface px-3 text-xs text-muted"
              >
                {t("unlinkTelegram")}
              </button>
            )}
          </div>
        </div>

        {linkCode && (
          <div
            className="mt-3 rounded-lg border border-accent bg-bg p-3 text-start text-xs"
            data-testid="telegram-link-code"
          >
            <p className="text-muted">{t("linkCodeHint")}</p>
            <p className="mt-1 font-mono text-sm font-bold text-accent" dir="ltr">
              /start {linkCode.code}
            </p>
            {linkCode.deepLink && (
              <a
                href={linkCode.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-accent px-3 text-xs font-medium text-accent"
              >
                {t("openInTelegram")}
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSaveAlertPrefs} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-start text-sm">
            <span>{t("digestFrequency")}</span>
            <select
              value={digestFreq}
              onChange={(e) => setDigestFreq(e.target.value as "daily" | "weekly" | "off")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            >
              <option value="daily">{t("digestDaily")}</option>
              <option value="weekly">{t("digestWeekly")}</option>
              <option value="off">{t("digestOff")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-start text-sm">
            <span>{t("quietStartLabel")}</span>
            <input
              type="number"
              min={0}
              max={23}
              value={quietStart}
              onChange={(e) => setQuietStart(Number(e.target.value))}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-start text-sm">
            <span>{t("quietEndLabel")}</span>
            <input
              type="number"
              min={0}
              max={23}
              value={quietEnd}
              onChange={(e) => setQuietEnd(Number(e.target.value))}
              className="min-h-11 rounded-lg border border-border bg-bg px-3"
            />
          </label>

          <label className="flex min-h-11 items-center gap-2 text-start text-sm sm:col-span-3">
            <input
              type="checkbox"
              checked={deadlineReminders}
              onChange={(e) => setDeadlineReminders(e.target.checked)}
            />
            <span>{t("deadlineRemindersLabel")}</span>
          </label>

          <div className="sm:col-span-3">
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-accent px-4 text-sm font-medium text-accent"
            >
              {t("saveAlertPrefs")}
            </button>
          </div>
        </form>
        {alertStatus && <p className="mt-2 text-start text-sm text-accent">{alertStatus}</p>}
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
