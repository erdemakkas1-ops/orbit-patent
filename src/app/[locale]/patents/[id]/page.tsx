import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { isLocale, messages } from "@/lib/i18n/messages";
import { getPatent } from "@/lib/patents/get-patent";
import { buildMetadata } from "@/lib/seo";
import { patentDisplay, safeText } from "@/lib/ai/safety";
import { PatentDrawingViewer } from "@/components/patents/patent-drawing-viewer";
import {
  PatentAnalysis,
  PatentAnalysisLoading,
} from "@/components/patents/patent-analysis";
import { PatentFamilyLegal } from "@/components/patents/patent-family-legal";
import { Skeleton } from "@/components/ui/skeleton";

type DetailProps = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({
  params,
}: DetailProps): Promise<Metadata> {
  const { locale: value, id } = await params;
  const locale = isLocale(value) ? value : "tr";
  const patent = await getPatent(id).catch(() => null);
  const m = messages[locale];
  if (!patent)
    return buildMetadata(locale, {
      title: m.notFound,
      path: `/${locale}/patents/${encodeURIComponent(id)}`,
    });
  const display = patentDisplay(patent, locale, m.noData);
  return buildMetadata(locale, {
    title: `${display.title} – ${safeText(patent.publicationNumber, m.noData, 120)}`,
    description: display.abstract,
    path: `/${locale}/patents/${encodeURIComponent(id)}`,
  });
}

export default async function Detail({ params }: DetailProps) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const m = messages[locale];
  const patent = await getPatent(id);
  if (!patent) notFound();
  const display = patentDisplay(patent, locale, m.noData);
  const metadata = [
    [m.publication, patent.publicationNumber],
    [m.application, patent.applicationNumber],
    [m.publicationDate, patent.publicationDate],
    [m.applicationDate, patent.applicationDate],
    [m.priorityDate, patent.priorityDate],
    [m.inventors, patent.inventors.join(", ")],
    [m.applicants, patent.applicants.join(", ")],
    [m.cpc, patent.cpc.join(", ")],
    [m.ipc, patent.ipc.join(", ")],
  ];
  return (
    <>
      <Link href={`/${locale}/patents`} className="card-action text-sm">
        {m.back}
      </Link>
      <section className="detail-hero mt-8">
        <PatentDrawingViewer patent={patent} locale={locale} />
        <div className="detail-hero-copy">
          <p className="eyebrow break-all">
            {safeText(patent.publicationNumber, m.noData, 120)}
          </p>
          <h1 className="my-4 max-w-4xl break-words">{display.title}</h1>
          <div className="mb-4 flex flex-wrap gap-2">
            {patent.source === "mock" && (
              <span
                className={`badge status-${patent.legalStatus.toLowerCase()}`}
              >
                {m.statuses[patent.legalStatus]}
              </span>
            )}
            {patent.publicationDate && (
              <span className="badge">
                {patent.publicationDate.slice(0, 4)}
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
        </div>
      </section>
      <Suspense fallback={<PatentAnalysisLoading locale={locale} />}>
        <PatentAnalysis patent={patent} locale={locale} />
      </Suspense>
      <section className="panel mt-6">
        <h2>{m.original}</h2>
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {metadata.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{safeText(value, m.noData, 1000)}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mb-3">{m.description}</h3>
        <p className="muted whitespace-pre-line">{display.description}</p>
      </section>
      <Suspense
        fallback={
          <>
            <Skeleton className="mt-6 h-32" />
            <Skeleton className="mt-6 h-48" />
          </>
        }
      >
        <PatentFamilyLegal patent={patent} locale={locale} />
      </Suspense>
      <p className="notice mt-6">{m.legalNotice}</p>
    </>
  );
}
