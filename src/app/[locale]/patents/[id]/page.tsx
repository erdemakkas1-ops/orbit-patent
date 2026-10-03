import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { isLocale, messages } from "@/lib/i18n/messages";
import { getPatent } from "@/lib/patents/get-patent";
import { buildMetadata } from "@/lib/seo";
import { patentDisplay, safeText } from "@/lib/ai/safety";
import {
  formatPublicationNumber,
  formatShortDate,
} from "@/lib/patents/format";
import { PatentDrawingViewer } from "@/components/patents/patent-drawing-viewer";
import {
  LocalizedPatentHeroCopy,
  PatentHeroCopy,
} from "@/components/patents/patent-hero-copy";
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
    [m.publication, formatPublicationNumber(patent.publicationNumber)],
    [m.application, patent.applicationNumber],
    [m.publicationDate, formatShortDate(patent.publicationDate, locale)],
    [m.applicationDate, formatShortDate(patent.applicationDate, locale)],
    [m.priorityDate, formatShortDate(patent.priorityDate, locale)],
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
        <Suspense fallback={<PatentHeroCopy patent={patent} locale={locale} />}>
          <LocalizedPatentHeroCopy patent={patent} locale={locale} />
        </Suspense>
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
