"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaStatusBar() {
  const t = useTranslations("Pwa");
  const [offline, setOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedInstall, setDismissedInstall] = useState(false);

  useEffect(() => {
    let active = true;

    const syncOnlineState = () => {
      if (!active) return;
      const isOff = !navigator.onLine;
      setOffline(isOff);
      if (!isOff) {
        const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastUpdated(stamp);
        try {
          localStorage.setItem("renisan_last_online", stamp);
        } catch {
          // ignore storage quota / private mode
        }
      } else {
        try {
          setLastUpdated(localStorage.getItem("renisan_last_online"));
        } catch {
          // ignore
        }
      }
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (active) setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Defer initial status read into a microtask to keep hydration and effect hooks clean
    Promise.resolve().then(() => {
      if (!active) return;
      if (!navigator.onLine) {
        syncOnlineState();
      }
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Service worker registration is best-effort (e.g. skipped in private contexts)
      });
    }

    return () => {
      active = false;
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  if (!offline && (!installPrompt || dismissedInstall)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-border bg-surface px-4 py-2 text-xs text-text"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        {offline ? (
          <p className="font-medium text-accent">
            📡 {t("offlineBadge")}
            {lastUpdated ? ` · ${t("lastUpdated")}: ${lastUpdated}` : ""}
          </p>
        ) : (
          <span />
        )}

        {installPrompt && !dismissedInstall && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="min-h-11 rounded-lg bg-accent px-3 text-xs font-medium text-white"
            >
              📲 {t("installButton")}
            </button>
            <button
              type="button"
              onClick={() => setDismissedInstall(true)}
              className="min-h-11 rounded-lg border border-border px-3 text-xs text-muted"
            >
              {t("dismissInstall")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
