import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { patentDisplay, safeText } from "@/lib/ai/safety";
import { localizePatents } from "@/lib/ai/translation";
import { PatentStatusPill } from "@/components/patents/patent-status-pill";
import {
  espacenetUrl,
  formatPublicationNumber,
  formatShortDate,
} from "@/lib/patents/format";

export function PatentHeroCopy({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const m = messages[locale];
  const display = patentDisplay(patent, locale, m.noData);
  return (
    <div className="detail-hero-copy">
      <p className="eyebrow break-all">
        {safeText(
          formatPublicationNumber(patent.publicationNumber),
          m.noData,
          120,
        )}
      </p>
      <h1 className="my-4 max-w-4xl break-words">{display.title}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <PatentStatusPill patent={patent} locale={locale} />
        {patent.publicationDate && (
          <span className="badge">
            {formatShortDate(patent.publicationDate, locale) ??
              patent.publicationDate.slice(0, 4)}
          </span>
        )}
      </div>
      {patent.source === "mock" && (
        <p className="notice mb-4" role="status">
          {m.patentDemo}
        </p>
      )}
      <p className="detail-summary">{display.abstract}</p>
      <dl className="detail-hero-meta">
        {[
          [m.applicants, patent.applicants.join(", ")],
          [m.inventors, patent.inventors.join(", ")],
          [m.cpc, patent.cpc.join(", ")],
          [m.ipc, patent.ipc.join(", ")],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || m.noData}</dd>
          </div>
        ))}
      </dl>
      {patent.source === "epo" && (
        <a
          className="card-action mt-5 text-sm font-semibold"
          href={espacenetUrl(patent.publicationNumber)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {m.originalDocument}
        </a>
      )}
    </div>
  );
}

export async function LocalizedPatentHeroCopy({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const localized = (await localizePatents([patent], locale))[0] ?? patent;
  return <PatentHeroCopy patent={localized} locale={locale} />;
}
