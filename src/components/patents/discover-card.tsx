import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { categorizePatent } from "@/lib/patents/discovery";
import { PatentSpecimen } from "@/components/patents/patent-specimen";

export function DiscoverCard({
  patent,
  locale,
  featured = false,
}: {
  patent: Patent;
  locale: Locale;
  featured?: boolean;
}) {
  const m = messages[locale];
  const category = categorizePatent(patent);
  return (
    <PatentSpecimen
      patent={patent}
      locale={locale}
      className={featured ? "featured-patent-card" : undefined}
      tag={
        category
          ? m.discoveryCategories[category]
          : patent.source === "mock"
            ? m.cardSample
            : undefined
      }
    />
  );
}
