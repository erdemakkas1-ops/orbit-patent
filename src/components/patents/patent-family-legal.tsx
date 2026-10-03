import Link from "next/link";
import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { patentProvider } from "@/lib/patents";
import { resolvePatentLegalStatus } from "@/lib/patents/legal-status/resolve";
import { safeText } from "@/lib/ai/safety";

export async function PatentFamilyLegal({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const m = messages[locale];
  const [family, events] = await Promise.all([
    patentProvider.getPatentFamily(patent.id),
    patentProvider.getLegalEvents(patent.id),
  ]);
  const jurisdiction = patent.publicationNumber.slice(0, 2).toUpperCase();
  const status = resolvePatentLegalStatus(events, jurisdiction);
  return (
    <>
      <section className="panel mt-6">
        <h2>{m.family}</h2>
        {family.length ? (
          <div className="flex flex-wrap gap-2">
            {family.map((item) => (
              <Link
                className="badge"
                key={item.publicationNumber}
                href={`/${locale}/patents/${encodeURIComponent(item.publicationNumber)}`}
              >
                {item.publicationNumber} · {item.country}
              </Link>
            ))}
          </div>
        ) : (
          <p>{m.noData}</p>
        )}
      </section>
      <section className="panel mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="!mb-0">{m.events}</h2>
          <span className={`badge status-${status.toLowerCase()}`}>
            {m.statuses[status]}
          </span>
        </div>
        {events.length ? (
          <ol className="timeline">
            {events.map((event) => (
              <li key={event.id} className="timeline-item">
                <div className="text-sm muted">
                  {event.date} · {event.jurisdiction}
                </div>
                <strong>{m.eventKinds[event.kind]}</strong>
                <p className="text-sm muted">
                  {safeText(event.description[locale], m.noData, 500)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>{m.noEvents}</p>
        )}
      </section>
    </>
  );
}
