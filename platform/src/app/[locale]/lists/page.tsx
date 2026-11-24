import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import type { Locale } from "@/i18n/config";
import { NavBar } from "@/components/NavBar";
import { ListsAndDeadlinesClient } from "@/components/ListsAndDeadlinesClient";

export default function ListsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Lists");

  return (
    <>
      <NavBar locale={locale} />
      <main id="main-content" className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-start text-2xl font-bold text-accent">{t("title")}</h1>
          <p className="mt-1 text-start text-sm text-muted">{t("subtitle")}</p>
        </div>
        <ListsAndDeadlinesClient locale={locale as Locale} />
      </main>
    </>
  );
}
