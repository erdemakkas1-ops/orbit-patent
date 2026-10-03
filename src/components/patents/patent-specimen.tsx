import type { ReactNode } from "react";
import Image from "next/image";
import { LegalStatus, type Locale, type Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { patentDisplay, safeText } from "@/lib/ai/safety";
import { cardDrawingUrl } from "@/lib/patents/drawing-url";
import {
  formatPublicationNumber,
  formatShortDate,
  statusJurisdiction,
} from "@/lib/patents/format";
import { ExpandingPatentCard } from "@/components/ui/expanding-patent-card";

function StatusIcon({ status }: { status: LegalStatus }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (status === LegalStatus.ACTIVE)
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" />
        <path d="m5.4 8.2 1.8 1.8 3.4-3.6" />
      </svg>
    );
  if (status === LegalStatus.UNKNOWN)
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" strokeDasharray="2.4 2" />
      </svg>
    );
  if (status === LegalStatus.EXPIRED || status === LegalStatus.LAPSED)
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 4.6V8l2.2 1.4" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.2 8h5.6" />
    </svg>
  );
}

/** Shared patent card: drawing plate on top, bibliographic record below. */
export function PatentSpecimen({
  patent,
  locale,
  tag,
  className,
  children,
}: {
  patent: Patent;
  locale: Locale;
  tag?: string;
  className?: string;
  children?: ReactNode;
}) {
  const m = messages[locale];
  const display = patentDisplay(patent, locale, m.noData);
  const { title, abstract } = display;
  const drawing = patent.drawings[0];
  const drawingUrl = drawing ? cardDrawingUrl(drawing.url) : undefined;
  const number = formatPublicationNumber(patent.publicationNumber);
  const filedYear = /^\d{4}/.exec(
    patent.applicationDate || patent.publicationDate,
  )?.[0];
  const published = formatShortDate(patent.publicationDate, locale);
  const status = patent.legalStatus;
  return (
    <ExpandingPatentCard
      className={["patent-specimen", className].filter(Boolean).join(" ")}
      href={`/${locale}/patents/${patent.id}`}
      ariaLabel={`${title} — ${number}`}
    >
      <div className="specimen-plate">
        {tag && <span className="specimen-tag">{tag}</span>}
        {drawing && drawingUrl ? (
          <Image
            fill
            // The drawing route already renders a crisp, card-sized PNG; the
            // optimizer's lossy re-encode would blur thin patent lines again.
            unoptimized={drawingUrl.startsWith("/api/")}
            sizes="(max-width: 520px) calc(100vw - 36px), (max-width: 800px) calc(50vw - 28px), 380px"
            className="specimen-drawing"
            src={drawingUrl}
            alt={safeText(drawing.caption[locale], m.noDrawing, 200)}
          />
        ) : (
          <span className="specimen-empty">{m.noDrawing}</span>
        )}
      </div>
      <div className="specimen-body">
        <h3 className="specimen-title">{title}</h3>
        <p className="specimen-meta">
          <span className="specimen-number">{number}</span>
          {filedYear && (
            <span>
              {m.cardFiled} {filedYear}
            </span>
          )}
          {display.aiTranslated && (
            <span className="specimen-ai" title={m.cardAiTitle}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 1.5 7.3 5 10.8 6.3 7.3 7.6 6 11.1 4.7 7.6 1.2 6.3 4.7 5Zm6 7 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" />
              </svg>
              {m.cardAi}
              <span className="sr-only"> — {m.cardAiTitle}</span>
            </span>
          )}
        </p>
        {abstract !== m.noData && (
          <p className="specimen-abstract">{abstract}</p>
        )}
        <div className="specimen-foot">
          <span className={`specimen-status status-${status.toLowerCase()}`}>
            <StatusIcon status={status} />
            <strong>{statusJurisdiction(patent)}</strong>
            <span aria-hidden="true">·</span>
            {status === LegalStatus.UNKNOWN
              ? m.cardStatusUnknown
              : m.statuses[status]}
          </span>
          {children}
          <p className="specimen-source">
            {patent.source === "mock" ? m.cardSourceMock : m.cardSourceEpo}
            {published && (
              <>
                {" · "}
                {m.cardPublished} {published}
              </>
            )}
          </p>
        </div>
      </div>
    </ExpandingPatentCard>
  );
}
