import Link from "next/link";
import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { patentProvider } from "@/lib/patents";
import { localizePatentCards } from "@/lib/ai/translation";
import { patentDisplay } from "@/lib/ai/safety";
import { cardDrawingUrl } from "@/lib/patents/drawing-url";
import {
  formatPublicationNumber,
  likelyExpired,
  statusYear,
} from "@/lib/patents/format";

/** Empty drafting sheet: shown while loading and when no patent is available. */
export function HeroBlueprintFrame({
  locale,
  children,
}: {
  locale: Locale;
  children?: React.ReactNode;
}) {
  return (
    <figure className="hero-blueprint" aria-label={messages[locale].heroSpecimen}>
      <span className="blueprint-mark blueprint-mark-tl" aria-hidden="true" />
      <span className="blueprint-mark blueprint-mark-tr" aria-hidden="true" />
      {children ?? (
        <p className="blueprint-placeholder">
          {messages[locale].heroPlaceholder}
        </p>
      )}
    </figure>
  );
}

/**
 * The hero shows a real expired patent from the featured picks: its original
 * drawing as white line work on blueprint, with a drafting title block that
 * carries the number, the register status and a link to the record.
 */
export async function HeroBlueprint({ locale }: { locale: Locale }) {
  const m = messages[locale];
  const picks = patentProvider.getFeaturedPatents
    ? await patentProvider.getFeaturedPatents(3).catch(() => [])
    : [];
  const pick = picks.find((patent: Patent) => patent.drawings.length);
  if (!pick) return <HeroBlueprintFrame locale={locale} />;
  const [patent] = await localizePatentCards([pick], locale);
  const display = patentDisplay(patent, locale, m.noData);
  const year = statusYear(patent);
  const status = likelyExpired(patent)
    ? m.cardStatusLikelyExpired
    : m.cardStatusReported[patent.legalStatus];
  return (
    <HeroBlueprintFrame locale={locale}>
      <img
        className="blueprint-drawing"
        src={cardDrawingUrl(patent.drawings[0].url)}
        alt={patent.drawings[0].caption[locale]}
        width={760}
        height={570}
        fetchPriority="high"
      />
      <figcaption className="blueprint-title-block">
        <span className="blueprint-kicker">{m.heroSpecimen}</span>
        <strong className="blueprint-title">{display.title}</strong>
        <span className="blueprint-meta">
          <span>{formatPublicationNumber(patent.publicationNumber)}</span>
          <span>
            {status}
            {year ? ` · ${year}` : ""}
          </span>
        </span>
        <Link
          className="blueprint-link"
          href={`/${locale}/patents/${patent.id}`}
        >
          {m.heroInspect} →
        </Link>
      </figcaption>
    </HeroBlueprintFrame>
  );
}
