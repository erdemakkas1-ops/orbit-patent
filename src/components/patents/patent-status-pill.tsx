import { LegalStatus, type Locale, type Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import {
  likelyExpired,
  statusJurisdiction,
  statusYear,
} from "@/lib/patents/format";

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

/**
 * Register status as reported by the source ("reported lapsed for non-payment
 * · 2011"), or a clearly marked age-based estimate when the register is silent.
 */
export function PatentStatusPill({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const m = messages[locale];
  const status = patent.legalStatus;
  const country = statusJurisdiction(patent);
  if (likelyExpired(patent))
    return (
      <span
        className="specimen-status status-estimated"
        title={m.cardStatusLikelyExpiredTitle}
      >
        <StatusIcon status={LegalStatus.EXPIRED} />
        <strong>{country}</strong>
        <span aria-hidden="true">·</span>
        {m.cardStatusLikelyExpired}
      </span>
    );
  const year = statusYear(patent);
  return (
    <span className={`specimen-status status-${status.toLowerCase()}`}>
      <StatusIcon status={status} />
      <strong>{country}</strong>
      <span aria-hidden="true">·</span>
      {m.cardStatusReported[status]}
      {year && (
        <>
          <span aria-hidden="true">·</span>
          {year}
        </>
      )}
    </span>
  );
}
