import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { GLYPH_TEST } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { NavBar } from "@/components/NavBar";

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <>
      <NavBar locale={locale} />
      <main id="main-content" className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
        <h1 className="text-start text-3xl font-bold text-accent">{t("title")}</h1>
        <p className="text-start text-lg">{t("tagline")}</p>
        <p className="text-start text-muted">{t("status")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/opportunities"
            className="flex min-h-14 items-center justify-center rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-white"
          >
            {t("ctaOpportunities")}
          </Link>
          <Link
            href="/admissions"
            className="flex min-h-14 items-center justify-center rounded-xl border border-accent bg-surface px-4 py-3 text-center text-sm font-semibold text-accent"
          >
            {t("ctaAdmissions")}
          </Link>
          <Link
            href="/lists"
            className="flex min-h-14 items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold"
          >
            {t("ctaLists")}
          </Link>
          <Link
            href="/account"
            className="flex min-h-14 items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold"
          >
            {t("ctaAccount")}
          </Link>
        </div>

        <section className="rounded-lg border border-border bg-surface p-4" aria-labelledby="glyph-label">
          <h2 id="glyph-label" className="mb-2 text-start text-sm font-semibold text-muted">
            {t("glyphLabel")}
          </h2>
          <p lang="ckb" dir="rtl" className="text-start text-2xl" data-testid="glyph-test">
            {GLYPH_TEST}
          </p>
        </section>

        <p className="border-s-4 border-accent ps-3 text-start text-sm text-muted">{t("freeNote")}</p>
      </main>
    </>
  );
}
