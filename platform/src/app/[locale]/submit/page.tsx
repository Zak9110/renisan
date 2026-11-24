import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { NavBar } from "@/components/NavBar";
import { SubmitOpportunityClient } from "@/components/SubmitOpportunityClient";

export default function SubmitPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Submit");

  return (
    <>
      <NavBar locale={locale} />
      <main id="main-content" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-start text-2xl font-bold text-accent">{t("title")}</h1>
          <p className="mt-1 text-start text-sm text-muted">{t("subtitle")}</p>
        </div>
        <SubmitOpportunityClient locale={locale as "ar" | "ckb" | "kmr" | "en"} />
      </main>
    </>
  );
}
