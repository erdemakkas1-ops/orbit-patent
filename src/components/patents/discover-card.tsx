import Image from "next/image";
import Link from "next/link";
import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { categorizePatent } from "@/lib/patents/discovery";
import { patentDisplay, safeText } from "@/lib/ai/safety";
import { ExpandingPatentCard } from "@/components/ui/expanding-patent-card";

export function DiscoverCard({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const m = messages[locale];
  const display = patentDisplay(patent, locale, m.noData);
  const category = categorizePatent(patent);
  return (
    <ExpandingPatentCard className="discover-card flex flex-col overflow-hidden">
      <div className="card-media flex h-44 items-center justify-center border-b">
        {patent.drawings[0] ? (
          <Image
            className="h-full w-full object-contain p-3"
            src={patent.drawings[0].url}
            alt={safeText(patent.drawings[0].caption[locale], m.noDrawing, 200)}
            width={420}
            height={176}
          />
        ) : (
          <span className="muted">{m.noDrawing}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`badge status-${patent.legalStatus.toLowerCase()}`}>
            {m.statuses[patent.legalStatus]}
          </span>
          <span className="badge">{m.discoveryCategories[category]}</span>
          <span className="badge source-badge">
            {patent.source === "mock" ? m.mock : m.live}
          </span>
          <span className="ml-auto text-sm muted">
            {safeText(patent.publicationDate.slice(0, 4), m.noData, 4)}
          </span>
        </div>
        <h3 className="mb-3">
          <Link
            className="card-title-link"
            href={`/${locale}/patents/${patent.id}`}
          >
            {display.title}
          </Link>
        </h3>
        <p className="muted text-sm line-clamp-3">{display.abstract}</p>
        <p className="mt-auto mb-3 pt-3 text-xs muted break-all">
          {patent.publicationNumber}
        </p>
        <Link
          className="card-action text-sm font-semibold"
          href={`/${locale}/patents/${patent.id}`}
          aria-label={`${m.inspect}: ${display.title}`}
        >
          {m.inspect}
        </Link>
      </div>
    </ExpandingPatentCard>
  );
}
