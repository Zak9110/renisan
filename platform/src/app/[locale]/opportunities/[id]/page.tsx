import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { NavBar } from "@/components/NavBar";
import { OpportunityDetailClient } from "@/components/OpportunityDetailClient";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { getOpportunityDetail } from "@/lib/opportunities/service";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = await getDb();
  const user = await getCurrentSessionUser();
  const profile = user?.profile ? { ...user.profile, birthYear: user.birthYear } : null;
  const detail = await getOpportunityDetail(db, id, profile);
  if (!detail) notFound();

  const { opportunity, match, expired, similar } = detail;

  return (
    <>
      <NavBar locale={locale} />
      <main id="main-content" className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <OpportunityDetailClient
          locale={locale as Locale}
          opportunity={{
            ...opportunity,
            deadline: opportunity.deadline?.toISOString() ?? null,
            verifiedAt: opportunity.verifiedAt?.toISOString() ?? null,
            lastCheckedAt: opportunity.lastCheckedAt?.toISOString() ?? null,
          }}
          match={match}
          expired={expired}
          similar={similar.map((s) => ({
            id: s.id,
            title: s.title,
            providerName: s.providerName,
            deadline: s.deadline?.toISOString() ?? null,
            rolling: s.rolling,
          }))}
        />
      </main>
    </>
  );
}
