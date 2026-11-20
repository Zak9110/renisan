"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function NavBar({ locale }: { locale: string }) {
  const t = useTranslations("Nav");
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/" className="text-xl font-bold text-accent">
            Renisan
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/"
              className="rounded-md px-3 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("home")}
            </Link>
            <Link
              href="/opportunities"
              className="rounded-md px-3 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("opportunities")}
            </Link>
            <Link
              href="/lists"
              className="rounded-md px-3 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("lists")}
            </Link>
            <Link
              href="/account"
              className="rounded-md px-3 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
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
