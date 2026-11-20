import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { locales, localeNames, dirOf } from "@/i18n/config";

// Server component: plain links, zero client JS. next-intl's proxy stores the choice in a cookie.
export function LanguageSwitcher({ current }: { current: string }) {
  const t = useTranslations("LanguageSwitcher");
  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-wrap gap-2">
        {locales.map((l) => (
          <li key={l}>
            <Link
              href="/"
              locale={l}
              lang={l}
              dir={dirOf(l)}
              aria-current={l === current ? "true" : undefined}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm aria-[current=true]:border-accent aria-[current=true]:font-semibold"
            >
              {localeNames[l]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
