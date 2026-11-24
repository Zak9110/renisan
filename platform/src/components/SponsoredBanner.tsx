"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";

interface PlacementDto {
  placement: {
    id: string;
    slot: string;
    title: Record<string, string | undefined>;
    summary: Record<string, string | undefined> | null;
    targetUrl: string;
  };
  sponsorName: string;
}

export function SponsoredBanner({ locale, slot }: { locale: Locale; slot: string }) {
  const t = useTranslations("Sponsor");
  const [items, setItems] = useState<PlacementDto[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/sponsors?slot=${encodeURIComponent(slot)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ placements: PlacementDto[] }>) : null))
      .then((json) => {
        if (!active || !json) return;
        setItems(json.placements);
        for (const item of json.placements) {
          void fetch("/api/sponsors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placementId: item.placement.id, kind: "impression" }),
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [slot]);

  if (items.length === 0) return null;

  return (
    <aside
      aria-label={t("badge")}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-surface p-4 text-start"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="rounded-full border border-border bg-bg px-2.5 py-0.5 font-semibold text-text">
          {t("badge")}
        </span>
        <span>{t("note")}</span>
      </div>
      {items.map(({ placement, sponsorName }) => (
        <div key={placement.id} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="text-sm">
              <bdi>{pickText(placement.title, locale)}</bdi>
            </strong>
            <p className="text-xs text-muted">{sponsorName}</p>
            {placement.summary && (
              <p className="mt-1 text-xs text-muted">
                <bdi>{pickText(placement.summary, locale)}</bdi>
              </p>
            )}
          </div>
          <a
            href={placement.targetUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => {
              void fetch("/api/sponsors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ placementId: placement.id, kind: "click" }),
              });
            }}
            className="inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-xs font-medium text-accent"
          >
            {t("visit")} ↗
          </a>
        </div>
      ))}
    </aside>
  );
}
