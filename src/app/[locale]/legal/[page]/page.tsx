import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n/messages";
import { buildMetadata } from "@/lib/seo";
import { formatShortDate } from "@/lib/patents/format";
import { legalContent, legalPages, type LegalPage } from "@/lib/legal-content";

type LegalProps = { params: Promise<{ locale: string; page: string }> };

const isLegalPage = (value: string): value is LegalPage =>
  (legalPages as readonly string[]).includes(value);

export function generateStaticParams() {
  return ["tr", "en"].flatMap((locale) =>
    legalPages.map((page) => ({ locale, page })),
  );
}

export async function generateMetadata({
  params,
}: LegalProps): Promise<Metadata> {
  const { locale: value, page } = await params;
  const locale = isLocale(value) ? value : "tr";
  if (!isLegalPage(page)) return {};
  return buildMetadata(locale, {
    title: legalContent[locale][page].title,
    path: `/${locale}/legal/${page}`,
  });
}

export default async function LegalPageView({ params }: LegalProps) {
  const { locale, page } = await params;
  if (!isLocale(locale) || !isLegalPage(page)) notFound();
  const m = messages[locale];
  const content = legalContent[locale][page];
  return (
    <article className="legal-page">
      <p className="eyebrow">ORBIT / {m.legal}</p>
      <h1 className="my-5">{content.title}</h1>
      <p className="notice mb-8">{m.legalDraft}</p>
      {content.sections.map((section) => (
        <section key={section.heading} className="mb-8">
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p className="text-sm muted">
        {m.legalUpdated}: {formatShortDate(content.updated, locale)}
      </p>
    </article>
  );
}
