"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { phase2Enabled } from "@/lib/features";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function NavBar({ locale }: { locale: string }) {
  const t = useTranslations("Nav");
  return (
    <header className="border-b border-border bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:inline-block focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        {t("skipToContent")}
      </a>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center text-xl font-bold text-accent">
            Renisan
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1 text-sm">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("home")}
            </Link>
            <Link
              href="/opportunities"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("opportunities")}
            </Link>
            <Link
              href="/admissions"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("admissions")}
            </Link>
            {phase2Enabled && (
              <>
                <Link
                  href="/helpers"
                  className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {t("helpers")}
                </Link>
                <Link
                  href="/community"
                  className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {t("community")}
                </Link>
              </>
            )}
            <Link
              href="/lists"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("lists")}
            </Link>
            <Link
              href="/submit"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("submit")}
            </Link>
            <Link
              href="/account"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("account")}
            </Link>
          </nav>
        </div>
        <LanguageSwitcher current={locale} />
      </div>
    </header>
  );
}
