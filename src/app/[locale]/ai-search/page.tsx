import { notFound } from "next/navigation";
import { messages, isLocale } from "@/lib/i18n/messages";
import { ProjectSearch } from "@/components/ai/project-search";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: value } = await params;
  const locale = isLocale(value) ? value : "tr";
  const m = messages[locale];
  return buildMetadata(locale, {
    title: m.aiSearch,
    description: m.aiIntro,
    path: `/${locale}/ai-search`,
  });
}
export default async function AiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <>
      <p className="eyebrow">ORBIT / {messages[locale].aiSearch}</p>
      <h1 className="my-5">{messages[locale].aiTitle}</h1>
      <p className="muted mb-8 max-w-2xl">{messages[locale].aiIntro}</p>
      <ProjectSearch locale={locale} />
    </>
  );
}
